# trace_pool_symbol_bytematch.ps1 — capture Pool of Radiance's own VROOMM descriptor load for
# its one promoted symbol-candidate cluster carrying real `evidence.pool` (the CoAB+Pool
# corroborated `operand_parser`/`parse_command_sub` cluster), in one owned DOSBox-X DEBUGBOX
# process, and byte-match it against retail Pool `GAME.OVR` bytes.
#
# This targets BUILD-QUEUE.md's "Correlate surviving cross-overlay references with
# game-specific runtime traces" leaf, applied to Pool's own promoted candidate -- the CoAB round
# 1/2 docs (docs/engine/research/coab-symbol-runtime-bytematch{,-round2}.md) proved this same
# cluster's CoAB-side descriptor byte-identical, but explicitly left "Pool/Secret's own
# surviving cross-overlay references" open, since no equivalent descriptor-preload
# runtime-trace tool had been run against Pool's *own* GAME.OVR. This script closes that gap for
# Pool's one reachable candidate, reusing the exact technique already proven for CoAB/Gateway:
# `BPINT 21 42` seek capture, the debugger's own `es:[0010]`/`es:[0008]` disassembly annotation
# for destination segment/code size, and a post-read breakpoint at `CS:(EIP_at_seek+0x12)` (the
# same fixed delta already documented for Pool's own `Invoke-CombatEntryProbe` in
# tools/trace_pool_ecl18_route.ps1, and for CoAB/Gateway descriptor 9/10 -- all four titles share
# the identical FBOV/VROOMM overlay-loader stub shape).
#
# Prior static evidence already recorded Pool's operand-parser candidate as a "loaded-byte
# candidate; execution not yet observed" during an ordinary silent-startup all-descriptor
# preload pass with no save file (docs/engine/research/pool-runtime-overlay-trace.json target
# `operand_parser_candidate`, descriptor 7, GAME.OVR:0x74D3 -> destination segment 0x3089 in
# that run). That prior pass only confirmed the destination *segment* and *code size* via the
# loader's own annotation -- it never actually dumped and byte-compared the resident bytes
# against retail GAME.OVR the way the CoAB rounds did. This script performs that missing
# byte-match step for the first time, dumping three 128-byte windows (0x0000, 0x0080, 0x0100)
# to cover the cluster's full 310-byte (0x136) function body plus margin.

param(
  [string]$StageDir = 'build\runtime-pool-base-clean-20260716',
  [Parameter(Mandatory)][string]$OutDir,
  [ValidateRange(1,80)][int]$MaxSeeks = 40,
  [ValidateRange(5,60)][int]$FirstSeekTimeoutSeconds = 25,
  [ValidateRange(1,15)][int]$NextSeekTimeoutSeconds = 6
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function Resolve-RepoPath([string]$Path) {
  $candidate = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repo $Path }
  return [IO.Path]::GetFullPath($candidate)
}

# Single target descriptor, keyed by GAME.OVR file offset (= INT21/AH=42h seek offset for the
# handle bound to POOLRAD\GAME.OVR). Descriptor 7's base *is* the operand_parser candidate's own
# retail_file_offset (relative 0x0000) -- build/goldbox-symbol-candidates.json's only
# `evidence.pool` row across all 46 promoted clusters.
$Targets = [ordered]@{
  '0x74D3' = [ordered]@{
    descriptor   = 7
    unit         = 'ovr008'
    code_size    = 0x221A
    roles        = [ordered]@{
      operand_parser         = 0x0000   # cluster names: operand_parser, parse_command_sub (CoAB+Pool corroborated)
      operand_parser_cont1   = 0x0080   # continuation window, same 310-byte (0x136) function body
      operand_parser_cont2   = 0x0100   # continuation window, covers the full function plus margin
    }
  }
}

$stage = (Resolve-Path -LiteralPath (Resolve-RepoPath $StageDir)).Path
$out = Resolve-RepoPath $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
New-Item -ItemType Directory -Path $out | Out-Null
$manifestPath = Join-Path $stage 'pool-stage-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.route_ready -ne $false) { throw 'Pool symbol probe requires an unpromoted base stage' }
$pool = Join-Path $stage 'POOLRAD'
$expected = @{
  'START.EXE' = 'd825df2b174675c9088ba1489488bdeebe66ad2a22943f17d3a198e60b6a07bd'
  'GAME.OVR'  = '872964a32cef0fc32bbf83bab68b15e04ad36d59076f37b00a179dfee7928614'
}
foreach ($name in $expected.Keys) {
  $actual = (Get-FileHash -LiteralPath (Join-Path $pool $name) -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected[$name]) { throw "Pool stage hash mismatch: $name" }
}
$overlayBytes = [IO.File]::ReadAllBytes((Join-Path $pool 'GAME.OVR'))

$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$helperProject = Join-Path $repo 'tools\dosbox_debugger_input\DosboxDebuggerInput.csproj'
$helperDll = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'
& dotnet build $helperProject --configuration Release | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'debugger helper build failed' }

$process = $null

function Invoke-DebuggerInput {
  param([string]$Command, [string]$Label, [switch]$SnapshotOnly)
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
  $seekOffset = (($ecx -band 0xFFFF) -shl 16) -bor ($edx -band 0xFFFF)
  return [ordered]@{
    eax = $eax; ebx = $ebx; ecx = $ecx; edx = $edx
    ah = $ah
    is_ah42 = ($ah -eq 0x42)
    handle = $ebx
    seek_offset = $seekOffset
    cs = $regs['CS']
    eip = $regs['EIP']
  }
}

function Resolve-TargetDescriptor {
  param(
    [string]$TargetKey,
    [hashtable]$TargetSpec,
    [string]$SeekSnapshot,
    [hashtable]$SeekFields
  )
  $destinationMatch = [regex]::Match($SeekSnapshot, 'es:\[0010\]=([0-9A-F]{4})')
  $sizeMatch = [regex]::Match($SeekSnapshot, 'es:\[0008\]=([0-9A-F]{4})')
  if (-not $destinationMatch.Success -or -not $sizeMatch.Success) {
    throw "$TargetKey seek snapshot lacks destination segment or code-size annotation"
  }
  $destinationSegment = $destinationMatch.Groups[1].Value
  $observedCodeSize = [Convert]::ToInt32($sizeMatch.Groups[1].Value, 16)
  if ($observedCodeSize -ne $TargetSpec.code_size) {
    throw "$TargetKey observed code size 0x$($observedCodeSize.ToString('X')) does not match expected 0x$($TargetSpec.code_size.ToString('X'))"
  }

  $loaderCs = $SeekFields.cs
  $seekEip = [Convert]::ToUInt32($SeekFields.eip, 16)
  $postRead = '{0}:{1:X4}' -f $loaderCs, ($seekEip + 0x12)

  Invoke-DebuggerInput -Command "BP $postRead" -Label "$($TargetSpec.unit)-postread-arm" | Out-Null
  Invoke-DebuggerInput -Command 'RUN' -Label "$($TargetSpec.unit)-postread-run" | Out-Null
  $postReadDeadline = [DateTime]::UtcNow.AddSeconds(10)
  $postReadSnapshot = $null
  $postReadAddress = $null
  while ([DateTime]::UtcNow -lt $postReadDeadline) {
    Start-Sleep -Milliseconds 100
    $snapshot = Invoke-DebuggerInput -Command '' -Label "$($TargetSpec.unit)-postread-poll" -SnapshotOnly
    if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
    $postReadSnapshot = $snapshot
    $postReadAddress = Get-DebuggerAddress $snapshot
    break
  }
  if (-not $postReadAddress) { throw "$TargetKey timed out waiting for post-read breakpoint" }
  if ($postReadAddress -ne $postRead) {
    throw "$TargetKey expected post-read breakpoint at $postRead, stopped at $postReadAddress"
  }
  [IO.File]::WriteAllText((Join-Path $out "$($TargetSpec.unit)-postread-hit-console.txt"), $postReadSnapshot, [Text.UTF8Encoding]::new($false))

  $targetSeekOffset = [Convert]::ToInt32($TargetKey, 16)
  $roleResults = [ordered]@{}
  $allExactMatch = $true
  foreach ($role in $TargetSpec.roles.Keys) {
    $relativeOffset = $TargetSpec.roles[$role]
    $label = "$($TargetSpec.unit)-dump-$role"
    $dumpSnapshot = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $destinationSegment, $relativeOffset) -Label $label
    $lines = [regex]::Matches($dumpSnapshot, '(?m)^[0-9A-F]{4}:[0-9A-F]{8}\s+((?:[0-9A-F]{2}\s+){15}[0-9A-F]{2})\s')
    $bytes = [Collections.Generic.List[byte]]::new()
    foreach ($m in $lines) {
      foreach ($hex in ($m.Groups[1].Value -split '\s+')) {
        if ($hex) { $bytes.Add([Convert]::ToByte($hex, 16)) }
      }
    }
    if ($bytes.Count -lt 16) { throw "$TargetKey/$role dump exposed only $($bytes.Count) data bytes" }
    $fileOffset = $targetSeekOffset + $relativeOffset
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
    Write-Host ("[pool-symbols] {0}/{1}: runtime={2} exact_match={3}" -f $TargetSpec.unit, $role, $roleResults[$role].runtime_address, $exact)
  }

  return [ordered]@{
    target_key = $TargetKey
    descriptor = $TargetSpec.descriptor
    unit = $TargetSpec.unit
    target_seek_offset = $TargetKey
    target_code_size = ('0x{0:X}' -f $TargetSpec.code_size)
    seek_loader_cs_ip = ('{0}:{1}' -f $SeekFields.cs, $SeekFields.eip)
    post_read_breakpoint = $postRead
    runtime_destination_segment = $destinationSegment
    observed_code_size = ('0x{0:X}' -f $observedCodeSize)
    roles = $roleResults
    all_roles_exact_match = $allExactMatch
  }
}

try {
  & $probe -DbxExe $dbx -GameDir $stage -DosWorkingDir 'POOLRAD' -Exe 'START.EXE' -OutDir $out `
    -Cycles 'fixed 25000' -GameLink -DebuggerAction @('BPINT 21 42', 'RUN') `
    -NoInitialScreenshots -NoActionScreenshots
  if (-not $?) { throw 'Pool DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)

  $pending = [ordered]@{}
  foreach ($key in $Targets.Keys) { $pending[$key] = $Targets[$key] }
  $results = [ordered]@{}

  $seekIndex = 0
  $deadline = [DateTime]::UtcNow.AddSeconds($FirstSeekTimeoutSeconds)
  while ($pending.Count -gt 0 -and $seekIndex -lt $MaxSeeks -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 100
    $snapshot = Invoke-DebuggerInput -Command '' -Label 'seek-poll' -SnapshotOnly
    if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
    $fields = Get-SeekFields -Snapshot $snapshot
    if (-not $fields -or -not $fields.is_ah42) {
      throw "Pool trace stopped somewhere other than INT 21h/AH=42 at seek index $seekIndex"
    }
    [IO.File]::WriteAllText((Join-Path $out ('seek-hit-{0:D2}-console.txt' -f $seekIndex)), $snapshot, [Text.UTF8Encoding]::new($false))
    $seekOffsetHex = '0x{0:X}' -f $fields.seek_offset
    Write-Host ("[pool-symbols] seek {0}: handle={1} offset={2} cs_ip={3}:{4}" -f $seekIndex, $fields.handle, $seekOffsetHex, $fields.cs, $fields.eip)
    if ($pending.Contains($seekOffsetHex)) {
      $targetSpecHash = @{
        descriptor = $pending[$seekOffsetHex].descriptor
        unit = $pending[$seekOffsetHex].unit
        code_size = $pending[$seekOffsetHex].code_size
        roles = $pending[$seekOffsetHex].roles
      }
      $results[$seekOffsetHex] = Resolve-TargetDescriptor -TargetKey $seekOffsetHex -TargetSpec $targetSpecHash `
        -SeekSnapshot $snapshot -SeekFields $fields
      $pending.Remove($seekOffsetHex)
      # Same breakpoint-hygiene fix documented in tools/trace_coab_symbol_bytematch.ps1: the
      # post-read BP set in Resolve-TargetDescriptor stays registered after its target is
      # dumped, so the very next plain RUN would immediately re-stop there instead of at the
      # next INT 21h/AH=42h seek. Clear all breakpoints and re-arm the seek trap before resuming.
      Invoke-DebuggerInput -Command 'BPDEL *' -Label ("$($targetSpecHash.unit)-clear-postread") | Out-Null
      Invoke-DebuggerInput -Command 'BPINT 21 42' -Label ("$($targetSpecHash.unit)-rearm-seek-trap") | Out-Null
      $deadline = [DateTime]::UtcNow.AddSeconds($FirstSeekTimeoutSeconds)
    }
    $seekIndex++
    if ($pending.Count -gt 0) {
      Invoke-DebuggerInput -Command 'RUN' -Label 'seek-continue' | Out-Null
      $deadline = [DateTime]::UtcNow.AddSeconds($NextSeekTimeoutSeconds)
    }
  }
  if ($pending.Count -gt 0) {
    throw "targets not observed within $MaxSeeks seeks: $($pending.Keys -join ', ')"
  }

  $allExact = $true
  foreach ($key in $results.Keys) { if (-not $results[$key].all_roles_exact_match) { $allExact = $false } }

  [ordered]@{
    schema_version = 1
    title = 'Pool of Radiance promoted symbol-candidate runtime byte-match'
    profile_id = 'pool-of-radiance'
    stage_manifest = $manifestPath
    seeks_observed = $seekIndex
    targets = $results
    all_targets_all_roles_exact_match = $allExact
    claim = 'Runtime segment observed during ordinary silent startup VROOMM preload of Pool GAME.OVR descriptor 7, no save file or keypress required (same shape already documented for CoAB descriptor 7/24/26 and Gateway descriptor 9/10). The destination segment is a fixed shared overlay buffer reused across descriptors during the same preload pass, so it is the real runtime target for descriptor 7 on every load, not a startup-only artifact.'
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'pool-symbol-bytematch.json') -Encoding utf8

  Write-Host ("[pool-symbols] RESULT: all_targets_all_roles_exact_match={0} out={1}" -f $allExact, $out)
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
