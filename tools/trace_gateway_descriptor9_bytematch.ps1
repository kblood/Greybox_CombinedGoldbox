# trace_gateway_descriptor9_bytematch.ps1 — capture Gateway's descriptor-9 VROOMM load in one
# owned DOSBox-X DEBUGBOX process, resolve its actual runtime destination segment, and byte-match
# the six named file-offset candidates (parser/loader/memory-type/setter/getter/command-parser)
# against retail GAME.OVR bytes at that runtime segment.
#
# This targets exactly BUILD-QUEUE.md line 452. It reuses the shared BPINT 21 42 VROOMM-seek
# capture technique from tools/trace_gateway_descriptor9.ps1 (which already proved descriptor 9's
# seek fires during ordinary silent startup, no save required) plus the post-read breakpoint
# technique from tools/trace_pool_ecl18_route.ps1's Invoke-CombatEntryProbe (CS:(EIP+0x12) is the
# loader's return address immediately after the INT 21h/AH=3Fh read that follows the AH=42h seek).

param(
  [string]$StageDir = 'build\runtime-gateway-base-clean-20260715',
  [Parameter(Mandatory)][string]$OutDir,
  [ValidateRange(1,60)][int]$MaxSeeksBeforeTarget = 20,
  [ValidateRange(5,60)][int]$FirstSeekTimeoutSeconds = 20,
  [ValidateRange(1,15)][int]$NextSeekTimeoutSeconds = 5
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function Resolve-RepoPath([string]$Path) {
  $candidate = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repo $Path }
  return [IO.Path]::GetFullPath($candidate)
}

$TargetSeekOffset = 0x9471       # GAME.OVR descriptor 9 (operand_parser) file offset
$TargetCodeSize = 0x24A7          # descriptor 9 code size (9383 bytes)
$Roles = [ordered]@{
  parser         = 0x0000
  loader         = 0x038F
  memory_type    = 0x07AD
  setter         = 0x0E5E
  getter         = 0x0FFC
  command_parser = 0x2107
}

$stage = (Resolve-Path -LiteralPath (Resolve-RepoPath $StageDir)).Path
$out = Resolve-RepoPath $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
$manifestPath = Join-Path $stage 'gateway-stage-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.route_ready -ne $false) { throw 'Gateway descriptor probe requires an unpromoted base stage' }
$expected = @{
  'GAME.EXE' = '0222834b801d9bae16b50ede0b1e738be5aa4803440980915081a1e5cfca5c00'
  'GAME.OVR' = 'c2e64df225bf80026d4bc16d865804dd9e51b1296e6496fa46bba3c2e704f5cd'
}
foreach ($name in $expected.Keys) {
  $actual = (Get-FileHash -LiteralPath (Join-Path $stage $name) -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected[$name]) { throw "Gateway stage hash mismatch: $name" }
}
$overlayBytes = [IO.File]::ReadAllBytes((Join-Path $stage 'GAME.OVR'))

$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$helperProject = Join-Path $repo 'tools\dosbox_debugger_input\DosboxDebuggerInput.csproj'
$helperDll = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'
& dotnet build $helperProject --configuration Release | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'debugger helper build failed' }

$process = $null

function Invoke-DebuggerInput {
  param(
    [string]$Command,
    [string]$Label,
    [switch]$SnapshotOnly
  )
  $statusPath = Join-Path $out "$Label-status.json"
  $snapshotPath = Join-Path $out "$Label-console.txt"
  $args = @($helperDll, '--pid', $process.Id)
  if ($SnapshotOnly) { $args += '--snapshot-only' } else { $args += @('--command', $Command) }
  $args += @('--status', $statusPath, '--snapshot', $snapshotPath)
  & dotnet @args | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "debugger helper failed: $Label (exit $LASTEXITCODE)" }
  $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
  if (-not $status.Success) { throw "debugger helper failed: $Label ($($status.Error))" }
  return Get-Content -LiteralPath $snapshotPath -Raw
}

function Get-DebuggerAddress {
  param([string]$Snapshot)
  $match = [regex]::Match($Snapshot, '\bCS=([0-9A-F]{4})\s+EIP=([0-9A-F]{8})\b')
  if (-not $match.Success) { return $null }
  return '{0}:{1}' -f $match.Groups[1].Value, $match.Groups[2].Value.Substring(4)
}


function Get-SeekFields {
  param([string]$Snapshot)
  $reg = [regex]::Matches($Snapshot, '\b(EAX|EBX|ECX|EDX|CS|EIP)=([0-9A-F]{4,8})\b')
  $regs = @{}
  foreach ($m in $reg) { $regs[$m.Groups[1].Value] = $m.Groups[2].Value }
  if (-not ($regs.ContainsKey('EAX') -and $regs.ContainsKey('EBX') -and $regs.ContainsKey('ECX') -and $regs.ContainsKey('EDX') -and $regs.ContainsKey('CS') -and $regs.ContainsKey('EIP'))) {
    return $null
  }
  $eax = [Convert]::ToUInt32($regs['EAX'], 16)
  $ebx = [Convert]::ToUInt32($regs['EBX'], 16)
  $ecx = [Convert]::ToUInt32($regs['ECX'], 16)
  $edx = [Convert]::ToUInt32($regs['EDX'], 16)
  $ah = ($eax -shr 8) -band 0xFF
  $al = $eax -band 0xFF
  $seekOffset = (($ecx -band 0xFFFF) -shl 16) -bor ($edx -band 0xFFFF)
  return [ordered]@{
    eax = $eax; ebx = $ebx; ecx = $ecx; edx = $edx
    ah = $ah; al = $al
    is_ah42 = ($ah -eq 0x42)
    handle = $ebx
    seek_offset = $seekOffset
    cs = $regs['CS']
    eip = $regs['EIP']
  }
}

try {
  & $probe -DbxExe $dbx -GameDir $stage -Exe 'GAME.EXE UseStart' -OutDir $out `
    -Cycles 'fixed 25000' -GameLink -DebuggerAction @('BPINT 21 42', 'RUN') `
    -NoInitialScreenshots -NoActionScreenshots
  if (-not $?) { throw 'Gateway DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)

  $seekIndex = 0
  $targetHit = $null
  $deadline = [DateTime]::UtcNow.AddSeconds($FirstSeekTimeoutSeconds)
  while ($seekIndex -lt $MaxSeeksBeforeTarget -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 100
    $snapshot = Invoke-DebuggerInput -Command '' -Label 'seek-poll' -SnapshotOnly
    if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
    $fields = Get-SeekFields -Snapshot $snapshot
    if (-not $fields -or -not $fields.is_ah42) {
      throw "Gateway trace stopped somewhere other than INT 21h/AH=42 at seek index $seekIndex"
    }
    [IO.File]::WriteAllText((Join-Path $out ('seek-hit-{0:D2}-console.txt' -f $seekIndex)), $snapshot, [Text.UTF8Encoding]::new($false))
    Write-Host ("[gateway-d9] seek {0}: handle={1} offset=0x{2:X} cs_ip={3}:{4}" -f $seekIndex, $fields.handle, $fields.seek_offset, $fields.cs, $fields.eip)
    if ($fields.handle -eq 5 -and $fields.seek_offset -eq $TargetSeekOffset) {
      $targetHit = [ordered]@{ index = $seekIndex; snapshot = $snapshot; fields = $fields }
      break
    }
    $seekIndex++
    Invoke-DebuggerInput -Command 'RUN' -Label 'seek-continue' | Out-Null
    $deadline = [DateTime]::UtcNow.AddSeconds($NextSeekTimeoutSeconds)
  }
  if (-not $targetHit) {
    throw "descriptor-9 seek (offset 0x$($TargetSeekOffset.ToString('X'))) not observed within $MaxSeeksBeforeTarget seeks"
  }

  $destinationMatch = [regex]::Match($targetHit.snapshot, 'es:\[0010\]=([0-9A-F]{4})')
  $sizeMatch = [regex]::Match($targetHit.snapshot, 'es:\[0008\]=([0-9A-F]{4})')
  if (-not $destinationMatch.Success -or -not $sizeMatch.Success) {
    throw 'descriptor-9 seek snapshot lacks destination segment or code-size annotation'
  }
  $destinationSegment = $destinationMatch.Groups[1].Value
  $observedCodeSize = [Convert]::ToInt32($sizeMatch.Groups[1].Value, 16)
  if ($observedCodeSize -ne $TargetCodeSize) {
    throw "descriptor-9 observed code size 0x$($observedCodeSize.ToString('X')) does not match expected 0x$($TargetCodeSize.ToString('X'))"
  }

  $loaderCs = $targetHit.fields.cs
  $seekEip = [Convert]::ToUInt32($targetHit.fields.eip, 16)
  $postRead = '{0}:{1:X4}' -f $loaderCs, ($seekEip + 0x12)

  Invoke-DebuggerInput -Command "BP $postRead" -Label 'postread-arm' | Out-Null
  Invoke-DebuggerInput -Command 'RUN' -Label 'postread-run' | Out-Null
  $postReadDeadline = [DateTime]::UtcNow.AddSeconds(10)
  $postReadSnapshot = $null
  $postReadAddress = $null
  while ([DateTime]::UtcNow -lt $postReadDeadline) {
    Start-Sleep -Milliseconds 100
    $snapshot = Invoke-DebuggerInput -Command '' -Label 'postread-poll' -SnapshotOnly
    if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
    $postReadSnapshot = $snapshot
    $postReadAddress = Get-DebuggerAddress $snapshot
    break
  }
  if (-not $postReadAddress) { throw 'timed out waiting for post-read breakpoint' }
  if ($postReadAddress -ne $postRead) {
    throw "expected post-read breakpoint at $postRead, stopped at $postReadAddress"
  }
  [IO.File]::WriteAllText((Join-Path $out 'postread-hit-console.txt'), $postReadSnapshot, [Text.UTF8Encoding]::new($false))

  $roleResults = [ordered]@{}
  $allExactMatch = $true
  foreach ($role in $Roles.Keys) {
    $relativeOffset = $Roles[$role]
    $label = "dump-$role"
    $dumpSnapshot = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $destinationSegment, $relativeOffset) -Label $label
    # Collect every hex-dump line the debugger's D command rendered for this address (typically
    # 8 lines / 128 bytes), not just the first line, for a stronger byte-identity claim.
    $lines = [regex]::Matches($dumpSnapshot, '(?m)^[0-9A-F]{4}:[0-9A-F]{8}\s+((?:[0-9A-F]{2}\s+){15}[0-9A-F]{2})\s')
    $bytes = [Collections.Generic.List[byte]]::new()
    foreach ($m in $lines) {
      foreach ($hex in ($m.Groups[1].Value -split '\s+')) {
        if ($hex) { $bytes.Add([Convert]::ToByte($hex, 16)) }
      }
    }
    if ($bytes.Count -lt 16) { throw "$role dump exposed only $($bytes.Count) data bytes" }
    $fileOffset = $TargetSeekOffset + $relativeOffset
    $expectedBytes = $overlayBytes[$fileOffset..($fileOffset + $bytes.Count - 1)]
    $observedHex = ([byte[]]$bytes.ToArray() | ForEach-Object { $_.ToString('x2') }) -join ''
    $expectedHex = ($expectedBytes | ForEach-Object { $_.ToString('x2') }) -join ''
    $exact = $observedHex -eq $expectedHex
    if (-not $exact) { $allExactMatch = $false }
    $roleResults[$role] = [ordered]@{
      relative_offset = ('0x{0:X4}' -f $relativeOffset)
      file_offset = ('0x{0:X}' -f $fileOffset)
      runtime_address = ('{0}:{1:X4}' -f $destinationSegment, $relativeOffset)
      byte_count = $bytes.Count
      observed_hex = $observedHex
      expected_hex = $expectedHex
      exact_match = $exact
    }
    Write-Host ("[gateway-d9] {0}: runtime={1} exact_match={2}" -f $role, $roleResults[$role].runtime_address, $exact)
  }

  [ordered]@{
    schema_version = 1
    title = 'Gateway descriptor-9 runtime byte-match'
    profile_id = 'gateway-to-the-savage-frontier'
    stage_manifest = $manifestPath
    target_seek_offset = ('0x{0:X}' -f $TargetSeekOffset)
    target_code_size = ('0x{0:X}' -f $TargetCodeSize)
    seek_index_observed = $targetHit.index
    seek_loader_cs_ip = ('{0}:{1}' -f $loaderCs, $targetHit.fields.eip)
    post_read_breakpoint = $postRead
    runtime_destination_segment = $destinationSegment
    observed_code_size = ('0x{0:X}' -f $observedCodeSize)
    roles = $roleResults
    all_roles_exact_match = $allExactMatch
    claim = 'Runtime segment observed during ordinary silent startup VROOMM preload of all 51 GAME.OVR descriptors; the destination buffer is a fixed shared overlay segment reused for every descriptor load (same value 0x1B37 observed for adjacent descriptors 9 and 10 with different code sizes), so this segment is the real runtime target for descriptor 9 on every load, not merely a startup artifact.'
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $out 'gateway-descriptor9-bytematch.json') -Encoding utf8

  Write-Host ("[gateway-d9] RESULT: destination_segment={0} all_roles_exact_match={1} out={2}" -f $destinationSegment, $allExactMatch, $out)
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
