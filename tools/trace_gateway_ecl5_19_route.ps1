# trace_gateway_ecl5_19_route.ps1 -- test whether Gateway's ECL5.DAX (the archive that holds
# ECL5#19, the statically-decoded FIGHT/LEAVE -> roster 4,3,4 -> COMBAT 0x8C34 route documented in
# docs/engine/research/savage-frontier-targets.generated.md / build/gen1-ecl-encounters.json) is
# ever opened by the DOS loader during ordinary silent startup, with ZERO synthetic keypresses.
#
# Context: docs/engine/research/gateway-operand-parser-execution-probe.md already proved, by
# arming an EXECUTION breakpoint at the byte-matched operand-parser segment (1B37:0000), that the
# ECL operand parser itself never runs during silent startup/title sequencing -- only an unrelated,
# stable per-frame title/input-wait routine occupies that segment. That was a CODE-execution probe.
# This script asks the complementary DATA-side question: does the DOS file-open path
# (INT 21h/AH=3Dh, "open existing file", DS:DX = ASCIZ pathname) ever even *touch* ECL5.DAX (or any
# ECL*.DAX) before the game would need a keypress -- i.e. is there any silently-reachable state in
# which ECL5's bytes get read into memory at all? A "no" here is independent corroboration of the
# operand-parser probe's conclusion, via file I/O rather than code execution; a "yes" would be new
# evidence worth following up with a byte-match dump of the loaded archive body.
#
# Method: one owned DOSBox-X 2026.07.02 DEBUGBOX process against the hash-locked
# build/runtime-gateway-base-clean-<label> stage. `BPINT 21 3D` breaks on every INT 21h/AH=3Dh
# (DOS "open existing file"). At each stop: validate AH==0x3D from EAX, read the ASCIZ filename at
# DS:DX via `D <DS>:<DX>`, decode it, log it, and RUN again (never a key). Repeat until a bounded
# hit cap / time window is exhausted or the same DS:DX repeats consecutively past a threshold
# (signals the loader has settled into a title/input-wait idle loop, i.e. silent startup is over).

param(
  [string]$StageDir = 'build\runtime-gateway-base-clean-20260715',
  [Parameter(Mandatory)][string]$OutDir,
  [ValidateRange(1,400)][int]$MaxHits = 200,
  [ValidateRange(5,120)][int]$FirstHitTimeoutSeconds = 30,
  [ValidateRange(1,30)][int]$NextHitTimeoutSeconds = 6,
  [ValidateRange(1,20)][int]$IdleRepeatThreshold = 4,
  # GameLink v4 is machine-global.  Wait for an empty slot before launch rather
  # than silently attaching this trace to another agent's DOSBox-X session.
  [ValidateRange(1,1800)][int]$ExclusivityWaitTimeoutSec = 600
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function Resolve-RepoPath([string]$Path) {
  $candidate = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repo $Path }
  return [IO.Path]::GetFullPath($candidate)
}

$TargetArchive = 'ECL5.DAX'
$AnyEclPattern = '^ECL[0-9]+\.DAX$'

$stage = (Resolve-Path -LiteralPath (Resolve-RepoPath $StageDir)).Path
$out = Resolve-RepoPath $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
New-Item -ItemType Directory -Force -Path $out | Out-Null
$manifestPath = Join-Path $stage 'gateway-stage-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.route_ready -ne $false) { throw 'Gateway ECL5#19 file-open probe requires an unpromoted base stage' }
$expected = @{
  'GAME.EXE' = '0222834b801d9bae16b50ede0b1e738be5aa4803440980915081a1e5cfca5c00'
  'GAME.OVR' = 'c2e64df225bf80026d4bc16d865804dd9e51b1296e6496fa46bba3c2e704f5cd'
  'ECL5.DAX' = '47a30b5717427718d7ffa01d42a4c3c079c648077458e3c71c46821dc96f87cd'
}
foreach ($name in $expected.Keys) {
  $actual = (Get-FileHash -LiteralPath (Join-Path $stage $name) -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected[$name]) { throw "Gateway stage hash mismatch: $name" }
}

$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$helperProject = Join-Path $repo 'tools\dosbox_debugger_input\DosboxDebuggerInput.csproj'
$helperDll = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'
& dotnet build $helperProject --configuration Release | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'debugger helper build failed' }

$process = $null

function Get-DosboxPids {
  return @(Get-CimInstance Win32_Process -Filter "Name='dosbox-x.exe'" -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty ProcessId)
}

function Wait-ExclusiveDosboxSlot {
  $deadline = [DateTime]::UtcNow.AddSeconds($ExclusivityWaitTimeoutSec)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ((Get-DosboxPids).Count -eq 0) { return }
    Start-Sleep -Seconds 5
  }
  throw "timed out waiting for an exclusive DOSBox-X/GameLink slot"
}

function Assert-ExclusiveOwnership {
  if (-not $process -or $process.HasExited) {
    throw "owned DOSBox-X process exited before the Gateway trace completed"
  }
  $foreign = @((Get-DosboxPids) | Where-Object { $_ -ne $process.Id })
  if ($foreign.Count -gt 0) {
    throw "GameLink contamination: foreign dosbox-x.exe PID(s) $($foreign -join ',') while own PID is $($process.Id)"
  }
}

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

function Get-OpenFields {
  param([string]$Snapshot)
  $reg = [regex]::Matches($Snapshot, '\b(EAX|EDX|CS|EIP|DS)=([0-9A-F]{4,8})\b')
  $regs = @{}
  foreach ($m in $reg) { $regs[$m.Groups[1].Value] = $m.Groups[2].Value }
  foreach ($need in @('EAX','EDX','CS','EIP','DS')) {
    if (-not $regs.ContainsKey($need)) { return $null }
  }
  $eax = [Convert]::ToUInt32($regs['EAX'], 16)
  $edx = [Convert]::ToUInt32($regs['EDX'], 16)
  $ah = ($eax -shr 8) -band 0xFF
  $al = $eax -band 0xFF
  return [ordered]@{
    eax = $eax; edx = $edx
    ah = $ah; al = $al
    is_ah3d = ($ah -eq 0x3D)
    ds = $regs['DS']
    dx = ('{0:X4}' -f ($edx -band 0xFFFF))
    cs = $regs['CS']
    eip = $regs['EIP']
  }
}

function Get-DumpBytes {
  param([string]$Snapshot)
  $bytes = [Collections.Generic.List[byte]]::new()
  foreach ($line in ($Snapshot -split "`r?`n")) {
    $m = [regex]::Match($line, '^[0-9A-F]{4}:[0-9A-F]{8}\s+((?:[0-9A-F]{2}\s+){15}[0-9A-F]{2})\s')
    if (-not $m.Success) { continue }
    foreach ($hex in ($m.Groups[1].Value -split '\s+')) { if ($hex) { $bytes.Add([Convert]::ToByte($hex, 16)) } }
  }
  return ,$bytes.ToArray()
}

function ConvertTo-AsciizString {
  param([byte[]]$Bytes)
  $sb = [Text.StringBuilder]::new()
  foreach ($b in $Bytes) {
    if ($b -eq 0) { break }
    if ($b -ge 0x20 -and $b -le 0x7E) { [void]$sb.Append([char]$b) } else { [void]$sb.Append('.') }
  }
  return $sb.ToString()
}

try {
  Wait-ExclusiveDosboxSlot
  & $probe -DbxExe $dbx -GameDir $stage -Exe 'GAME.EXE UseStart' -OutDir $out `
    -Cycles 'fixed 25000' -GameLink -DebuggerAction @('BPINT 21 3D', 'RUN') `
    -NoInitialScreenshots -NoActionScreenshots
  if (-not $?) { throw 'Gateway DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  Assert-ExclusiveOwnership

  $hits = @()
  $eclHits = @()
  $lastPointer = $null
  $repeatCount = 0
  $deadline = [DateTime]::UtcNow.AddSeconds($FirstHitTimeoutSeconds)

  while ($hits.Count -lt $MaxHits -and [DateTime]::UtcNow -lt $deadline) {
    Assert-ExclusiveOwnership
    Start-Sleep -Milliseconds 100
    $snapshot = Invoke-DebuggerInput -Command '' -Label ('open-poll-{0:D3}' -f $hits.Count) -SnapshotOnly
    if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
    Assert-ExclusiveOwnership
    $fields = Get-OpenFields -Snapshot $snapshot
    if (-not $fields) { continue }
    if (-not $fields.is_ah3d) {
      throw "Gateway ECL5#19 file-open trace stopped somewhere other than INT 21h/AH=3D at hit index $($hits.Count) (AH=0x$('{0:X2}' -f $fields.ah))"
    }
    $pointer = '{0}:{1}' -f $fields.ds, $fields.dx
    $dumpSnapshot = Invoke-DebuggerInput -Command ('D {0}' -f $pointer) -Label ('hit-{0:D3}-dump' -f $hits.Count)
    $bytes = Get-DumpBytes $dumpSnapshot
    $filename = ConvertTo-AsciizString $bytes
    [IO.File]::WriteAllText((Join-Path $out ('hit-{0:D3}-console.txt' -f $hits.Count)), $snapshot, [Text.UTF8Encoding]::new($false))

    $hitRecord = [ordered]@{
      index = $hits.Count
      cs_ip = ('{0}:{1}' -f $fields.cs, $fields.eip)
      pointer = $pointer
      access_mode_al = ('0x{0:X2}' -f $fields.al)
      filename = $filename
      is_target_archive = ($filename.ToUpperInvariant() -eq $TargetArchive)
      is_any_ecl_archive = ($filename.ToUpperInvariant() -match $AnyEclPattern)
    }
    $hits += $hitRecord
    if ($hitRecord.is_any_ecl_archive) { $eclHits += $hitRecord }
    Write-Host ("[gateway-ecl5-19] open {0}: {1} filename='{2}'" -f $hitRecord.index, $pointer, $filename)

    if ($pointer -eq $lastPointer) { $repeatCount++ } else { $repeatCount = 0; $lastPointer = $pointer }
    if ($repeatCount -ge $IdleRepeatThreshold) {
      Write-Host ("[gateway-ecl5-19] idle loop detected: {0} repeated {1} times consecutively -- silent startup has settled, stopping" -f $pointer, ($repeatCount + 1))
      break
    }

    Invoke-DebuggerInput -Command 'RUN' -Label ('continue-{0:D3}' -f $hits.Count) | Out-Null
    Assert-ExclusiveOwnership
    $deadline = [DateTime]::UtcNow.AddSeconds($NextHitTimeoutSeconds)
  }

  $targetOpened = ($hits | Where-Object { $_.is_target_archive }).Count -gt 0
  $anyEclOpened = $eclHits.Count -gt 0
  $stopReason = if ($repeatCount -ge $IdleRepeatThreshold) { 'idle_loop_detected' } `
    elseif ($hits.Count -ge $MaxHits) { 'max_hits_reached' } else { 'timeout' }

  $result = [ordered]@{
    schema_version = 1
    title = 'Gateway ECL5#19 route file-open reachability probe (silent startup)'
    profile_id = 'gateway-to-the-savage-frontier'
    stage_manifest = $manifestPath
    target_archive = $TargetArchive
    target_route = 'ECL5.DAX#19 search_location -> COMBAT 0x8C34 (FIGHT/LEAVE choice 0 -> roster 4,3,4)'
    breakpoint = 'BPINT 21 3D'
    input_sent = $false
    exclusive_gamelink_ownership_maintained = $true
    hit_count = $hits.Count
    stop_reason = $stopReason
    hits = $hits
    ecl_archive_opens = $eclHits
    target_archive_opened_during_silent_startup = $targetOpened
    any_ecl_archive_opened_during_silent_startup = $anyEclOpened
  }
  if ($targetOpened) {
    $result.claim = 'ECL5.DAX was opened by the DOS loader during ordinary silent startup with zero keypresses -- the runtime encounter checkpoint for ECL5#19 may be reachable without a save file. Follow up by locating the read (AH=3F) and seek (AH=42) calls on this handle to byte-match the loaded body against the archive file.'
  } elseif ($anyEclOpened) {
    $result.claim = 'ECL5.DAX itself was never opened during silent startup, but at least one other ECL*.DAX archive was. This narrows which location(s) silent startup can reach and confirms the loader does open per-location ECL archives outside of gameplay in at least one case; ECL5 specifically is not among them in this run.'
  } elseif ($stopReason -eq 'max_hits_reached') {
    $result.claim = "No ECL*.DAX archive was observed in the first $($hits.Count) silent-startup file opens. The configured hit cap ended this sample before an idle-loop or timeout boundary, so it is only a bounded prefix observation and cannot establish that the title sequence never opens an ECL archive."
  } else {
    $result.claim = 'No ECL*.DAX archive (including ECL5.DAX) was opened during silent startup through the probe''s idle-loop/timeout boundary. This corroborates docs/engine/research/gateway-operand-parser-execution-probe.md from the file-I/O side: ECL evaluation for a specific location, including ECL5#19, is not reached before real gameplay selects and enters that location, which requires either a save file (none available, see gateway-save-acquisition.md) or a statically-mapped, non-guessed front-end/character-creation input sequence (not yet built for Gateway).'
  }
  $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'gateway-ecl5-19-route-probe.json') -Encoding utf8
  Write-Host ("[gateway-ecl5-19] RESULT: hit_count={0} target_archive_opened={1} any_ecl_opened={2} stop_reason={3} out={4}" -f $hits.Count, $targetOpened, $anyEclOpened, $stopReason, $out)
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
