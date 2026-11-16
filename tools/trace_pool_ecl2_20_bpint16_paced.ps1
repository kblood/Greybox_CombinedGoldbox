param(
  [string]$StageDir = 'build\runtime-pool-ecl2-20-gamelink-20260717',
  [Parameter(Mandatory)][string]$OutDir,
  [string]$SaveSlotKey = 'i',
  [string]$ExpectedSaveSha256 = '8f944f055a6151b2a871a03ab41629959886879c2161804447eaa09852328619',
  [string[]]$MovementKeys = @('up','right','up','up','right','up'),
  [ValidateRange(0x0000,0xFFFF)][int]$SearchLocationTarget = 0x9F13,
  [ValidateRange(1,120)][int]$KeyboardPollTimeoutSec = 20,
  [ValidateRange(50,2000)][int]$KeyboardPollMs = 150,
  [ValidateRange(1,60)][int]$SettleCycles = 12,
  [ValidateRange(50,2000)][int]$SettleCycleMs = 250,
  [ValidateRange(1,600)][int]$OverallTimeoutSec = 240,
  [ValidateRange(1,1800)][int]$ExclusivityWaitTimeoutSec = 600
)

# Breakpoint-anchored pacing for Pool of Radiance (BUILD-QUEUE items 110/147/248), replacing
# the idle-streak Wait-Idle detector proven broken by
# docs/engine/research/gen1-dosbox-runtime-trace.md's 2026-07-21 "sharper root cause" finding:
# Pool runs a CONTINUOUS INT 21h AH=42 (LSEEK) loop even while genuinely idle at the title
# screen, so an idle-streak detector (N consecutive non-stopped polls) can never fire and every
# prior GameLink key injection landed only after an uncontrolled 240s timeout fallback.
#
# New anchor, found by this round's tools/trace_pool_int16_keywait_probe.ps1 diagnostic
# (build/dosbox-x-pool-int16-diag-20260721/int16-diag-trace.json): with 'BPINT 16' armed
# (unfiltered) at true process launch, 37 of 39 bounded polls over ~12s of title-idle time
# stopped at the EXACT SAME live CS:IP -- 1264:0306, an 'int 16' instruction, EAX AH=01 (INT 16h
# AH=01 "check keystroke, non-blocking") -- with the cycle counter (cc=) advancing between
# stops, proving genuine forward progress through repeated loop iterations rather than a single
# frozen snapshot. This is Pool's own title/menu "wait for any key" busy-poll routine. Unlike
# the LSEEK loop (background disk activity uncorrelated with input state), a stop here means the
# CPU is, at that exact instant, about to execute INT 16h AH=1 -- i.e. structurally guaranteed to
# be at the keyboard-check point, a safe and correct place to inject a key (DOSBox-X halts ALL
# emulation when a breakpoint fires, so injecting while halted and only then sending RUN
# guarantees the key is in the buffer before the resumed AH=1 check executes).
#
# Because the busy loop calls INT 16h AH=1 many times per second and re-hits this same
# breakpoint on every iteration regardless of whether a key is pending, a single confirmed stop
# here does NOT by itself distinguish "still on the same screen" from "already on the next
# screen, also idle-waiting" -- both look identical (same CS:IP, same AH). This script therefore
# uses the breakpoint only for what BUILD-QUEUE's task scope asked of it: proving the engine is
# genuinely at an input-wait point before injecting (replacing the broken absence-of-activity
# idle detector), not as a per-screen boundary detector. After each injected key, it drains a
# bounded number of further RUN/stop cycles at the same breakpoint (SettleCycles, resuming each
# time) to let the transition (redraw, load, next prompt) actually happen before capturing a
# screenshot and moving to the next scripted key.

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stage = (Resolve-Path (Join-Path $repo $StageDir)).Path
$out = Join-Path $repo $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
New-Item -ItemType Directory -Path $out -Force | Out-Null

$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$gameLink = Join-Path $repo 'tools\dosbox_gamelink.py'
$helperProject = Join-Path $repo 'tools\dosbox_debugger_input\DosboxDebuggerInput.csproj'
$helperDll = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'

$save = Join-Path $stage "POOLRAD\SAVGAM$($SaveSlotKey.ToUpperInvariant()).DAT"
if (-not (Test-Path -LiteralPath $save -PathType Leaf)) { throw "missing save: $save" }
$saveHash = (Get-FileHash -LiteralPath $save -Algorithm SHA256).Hash.ToLowerInvariant()
if ($saveHash -ne $ExpectedSaveSha256) { throw "unexpected save hash: $saveHash" }

& dotnet build $helperProject --configuration Release | Out-Null
if ($LASTEXITCODE -ne 0) { throw "debugger helper build failed: $LASTEXITCODE" }

function Invoke-DebuggerInput {
  param([string]$Command, [switch]$SnapshotOnly, [string]$Label)
  $statusPath = Join-Path $out "$Label-status.json"
  $snapshotPath = Join-Path $out "$Label-console.txt"
  $args = @($helperDll, '--pid', $process.Id)
  if ($SnapshotOnly) { $args += '--snapshot-only' } else { $args += @('--command', $Command) }
  $args += @('--status', $statusPath, '--snapshot', $snapshotPath)
  & dotnet @args | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "debugger helper failed for $Label (exit $LASTEXITCODE)" }
  $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
  if (-not $status.Success) { throw "debugger helper reported failure for $Label`: $($status.Error)" }
  return Get-Content -LiteralPath $snapshotPath -Raw
}

function Get-Stopped([string]$Snapshot) { return $Snapshot -notmatch '(?m)^\(Running\)\s*$' }

function Get-CsIp([string]$Snapshot) {
  $m = [regex]::Match($Snapshot, '\bCS=([0-9A-F]{4})\s+EIP=([0-9A-F]{8})\b')
  if (-not $m.Success) { return $null }
  return [ordered]@{ cs = $m.Groups[1].Value; ip = $m.Groups[2].Value.Substring(4) }
}

function Get-Ah([string]$Snapshot) {
  $m = [regex]::Match($Snapshot, '\bEAX=([0-9A-F]{8})\b')
  if (-not $m.Success) { return $null }
  return (([Convert]::ToUInt32($m.Groups[1].Value, 16)) -shr 8) -band 0xFF
}

function Get-DataBytes([string]$Snapshot) {
  $bytes = [Collections.Generic.List[byte]]::new()
  foreach ($line in ($Snapshot -split "`r?`n")) {
    $m = [regex]::Match($line, '^[0-9A-F]{4}:[0-9A-F]{8}\s+((?:[0-9A-F]{2}\s+){15}[0-9A-F]{2})\s')
    if (-not $m.Success) { continue }
    foreach ($hex in ($m.Groups[1].Value -split '\s+')) { if ($hex) { $bytes.Add([Convert]::ToByte($hex, 16)) } }
  }
  return ,$bytes.ToArray()
}

function Get-DosboxPids {
  return @(Get-CimInstance Win32_Process -Filter "Name='dosbox-x.exe'" -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty ProcessId)
}

function Wait-ExclusiveDosboxSlot {
  Write-Host '[pool-bpint16-paced] waiting for an empty dosbox-x.exe process list before launching (GameLink singleton hazard)...'
  $deadline = [DateTime]::UtcNow.AddSeconds($ExclusivityWaitTimeoutSec)
  while ([DateTime]::UtcNow -lt $deadline) {
    $pids = Get-DosboxPids
    if ($pids.Count -eq 0) { return }
    Write-Host "[pool-bpint16-paced] dosbox-x.exe already running (pid(s): $($pids -join ',')) -- waiting..."
    Start-Sleep -Seconds 5
  }
  throw "timed out waiting $ExclusivityWaitTimeoutSec s for an exclusive dosbox-x.exe slot"
}

function Assert-ExclusiveOwnership {
  $pids = Get-DosboxPids
  $foreign = @($pids | Where-Object { $_ -ne $process.Id })
  if ($foreign.Count -gt 0) {
    throw "GameLink CONTAMINATION: foreign dosbox-x.exe pid(s) detected ($($foreign -join ',')) while own pid is $($process.Id) -- aborting rather than trusting possibly cross-talked GameLink data"
  }
}

$phaseLog = [Collections.Generic.List[object]]::new()
$stepCounter = 0

# Confirms the CPU is genuinely halted at the INT 16h AH=1 keyboard-poll breakpoint
# (1264:0306 at launch, but matched by AH pattern rather than a hardcoded segment in case a
# later phase re-enters this routine at a relocated address) BEFORE the caller injects a key.
# Unlike Wait-IdleOrCapture (the broken absence-of-activity detector), this actively watches
# for the PRESENCE of the specific, structurally-guaranteed-safe stop rather than the absence of
# unrelated background disk activity. If a different, unexpected stop occurs (e.g. some other
# breakpoint), it is logged and resumed (RUN) so the loop keeps watching, matching the
# log-and-continue discipline BUILD-QUEUE's task explicitly asked to reuse from Secret's r4.
function Wait-KeyboardPollStop {
  param([string]$Label)
  $deadline = [DateTime]::UtcNow.AddSeconds($KeyboardPollTimeoutSec)
  while ([DateTime]::UtcNow -lt $deadline) {
    $snap = Invoke-DebuggerInput -SnapshotOnly -Label ('kbpoll-{0:D4}-{1}' -f $script:stepCounter, $Label)
    $script:stepCounter++
    if (Get-Stopped $snap) {
      $csIp = Get-CsIp $snap
      $ah = Get-Ah $snap
      if ($ah -eq 1) {
        return [ordered]@{ confirmed = $true; snapshot = $snap; cs = $csIp.cs; ip = $csIp.ip }
      }
      $phaseLog.Add([ordered]@{
        step = $script:stepCounter
        label = $Label
        note = 'unexpected stop while waiting for AH=1 keyboard poll; logged and resumed'
        cs_ip = if ($csIp) { "$($csIp.cs):$($csIp.ip)" } else { $null }
        ah = $ah
      }) | Out-Null
      Invoke-DebuggerInput -Command 'RUN' -Label ('kbpoll-resume-{0:D4}-{1}' -f $script:stepCounter, $Label) | Out-Null
    } else {
      Start-Sleep -Milliseconds $KeyboardPollMs
    }
  }
  return [ordered]@{ confirmed = $false }
}

# After a key is injected while confirmed-halted at the poll point, drains SettleCycles further
# RUN/stop iterations at the same breakpoint (resuming each time) to let the game actually
# consume the key and transition (redraw / load / next prompt) before the caller captures
# evidence. Every observed AH value is logged for the record.
function Invoke-SettleWindow {
  param([string]$Label)
  $observed = [Collections.Generic.List[object]]::new()
  for ($i = 0; $i -lt $SettleCycles; $i++) {
    Invoke-DebuggerInput -Command 'RUN' -Label ('settle-run-{0:D4}-{1}-{2}' -f $script:stepCounter, $Label, $i) | Out-Null
    $script:stepCounter++
    Start-Sleep -Milliseconds $SettleCycleMs
    $snap = Invoke-DebuggerInput -SnapshotOnly -Label ('settle-poll-{0:D4}-{1}-{2}' -f $script:stepCounter, $Label, $i)
    $script:stepCounter++
    $stopped = Get-Stopped $snap
    $csIp = if ($stopped) { Get-CsIp $snap } else { $null }
    $ah = if ($stopped) { Get-Ah $snap } else { $null }
    $observed.Add([ordered]@{ index = $i; stopped = $stopped; cs_ip = if ($csIp) { "$($csIp.cs):$($csIp.ip)" } else { $null }; ah = $ah }) | Out-Null
  }
  return $observed
}

function Get-EclHostState {
  param([string]$Label)
  $snap = Invoke-DebuggerInput -SnapshotOnly -Label ('hoststate-regs-' + $Label)
  $dsMatch = [regex]::Match($snap, '\bDS=([0-9A-F]{4})\b')
  if (-not $dsMatch.Success) { return $null }
  $ds = $dsMatch.Groups[1].Value
  $areaPointerSnap = Invoke-DebuggerInput -Command ('D {0}:49D2' -f $ds) -Label ('hoststate-areaptr-' + $Label)
  $areaPointerBytes = Get-DataBytes $areaPointerSnap
  if ($areaPointerBytes.Length -lt 4) { return $null }
  $areaOffset = [int]$areaPointerBytes[0] -bor ([int]$areaPointerBytes[1] -shl 8)
  $areaSegment = [int]$areaPointerBytes[2] -bor ([int]$areaPointerBytes[3] -shl 8)
  $memberAddress = ($areaOffset + 0x01E4) -band 0xFFFF
  $memberSnap = Invoke-DebuggerInput -Command ('D {0:X4}:{1:X4}' -f $areaSegment, $memberAddress) -Label ('hoststate-member-' + $Label)
  $memberBytes = Get-DataBytes $memberSnap
  $archiveSetSnap = Invoke-DebuggerInput -Command ('D {0}:5376' -f $ds) -Label ('hoststate-archive-' + $Label)
  $archiveSetBytes = Get-DataBytes $archiveSetSnap
  return [ordered]@{
    label = $Label
    ds_segment = $ds
    area_segment = ('{0:X4}' -f $areaSegment)
    area_offset = ('{0:X4}' -f $areaOffset)
    area_ecl_member_id = if ($memberBytes.Length -ge 1) { [int]$memberBytes[0] } else { $null }
    archive_set = if ($archiveSetBytes.Length -ge 1) { [int]$archiveSetBytes[0] } else { $null }
  }
}

# Sends one scripted key at a confirmed, breakpoint-anchored safe point: wait for the AH=1
# poll stop, capture its CS:IP/bytes as evidence, inject the key WHILE HALTED (so it is in the
# buffer before the resumed AH=1 check executes), resume, then drain the settle window.
function Send-PacedKey {
  param([string]$Key, [string]$Label)
  $wait = Wait-KeyboardPollStop -Label "wait-$Label"
  if (-not $wait.confirmed) {
    throw "timed out waiting for a confirmed AH=1 keyboard-poll stop before sending '$Key' ($Label)"
  }
  $bodySnap = Invoke-DebuggerInput -Command ('D {0}:{1}' -f $wait.cs, $wait.ip) -Label "body-$Label"
  $bodyBytes = Get-DataBytes $bodySnap
  $bodyHex = if ($bodyBytes.Length -gt 0) { -join ($bodyBytes[0..([Math]::Min(15, $bodyBytes.Length - 1))] | ForEach-Object { $_.ToString('x2') }) } else { $null }
  Assert-ExclusiveOwnership
  & python $gameLink press $Key --pace 0.2
  if ($LASTEXITCODE -ne 0) { throw "GameLink press '$Key' failed ($Label)" }
  Assert-ExclusiveOwnership
  $settle = Invoke-SettleWindow -Label $Label
  & python $gameLink screenshot (Join-Path $out "after-$Label.png")
  $phaseLog.Add([ordered]@{
    label = $Label
    key = $Key
    anchor_cs_ip = "$($wait.cs):$($wait.ip)"
    anchor_body_hex = $bodyHex
    settle = $settle
  }) | Out-Null
}

$process = $null
try {
  Wait-ExclusiveDosboxSlot
  & $probe -DbxExe $dbx -GameDir $stage -DosWorkingDir 'POOLRAD' -Exe 'START.EXE' -OutDir $out `
    -Cycles 'fixed 25000' -GameLink -ExtraSdlConf 'mouse_emulation=always' `
    -DebuggerAction @('BPINT 16 1', 'RUN') -NoActionScreenshots
  if (-not $?) { throw 'DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  Assert-ExclusiveOwnership
  Start-Sleep -Seconds 2
  Assert-ExclusiveOwnership

  # Phase 0: dismiss Pool's 2 static title screens, each with a breakpoint-anchored Enter.
  Send-PacedKey -Key 'enter' -Label 'title-dismiss-0'
  Send-PacedKey -Key 'enter' -Label 'title-dismiss-1'

  # Phase 1: Load menu.
  Send-PacedKey -Key 'l' -Label 'load-menu'

  # Phase 2: slot letter then confirm.
  Send-PacedKey -Key $SaveSlotKey -Label 'slot-letter'
  Send-PacedKey -Key 'enter' -Label 'slot-confirm'

  # Extra settle margin: the load itself takes real time (asset seeks); drain a longer bounded
  # window at the same breakpoint before reading host state, rather than assuming the previous
  # settle window alone covered it.
  $extraSettle = Invoke-SettleWindow -Label 'post-load-extra'
  & python $gameLink screenshot (Join-Path $out 'phase3-loaded.png')
  $hostStatePostLoad = Get-EclHostState -Label 'post-load'

  $loadTargetReached = $hostStatePostLoad -and $hostStatePostLoad.area_ecl_member_id -eq 20 -and $hostStatePostLoad.archive_set -eq 2

  $eclCursorRecords = [Collections.Generic.List[object]]::new()
  $searchLocationReached = $false
  if ($loadTargetReached) {
    # Load succeeded: arm the already runtime-confirmed ECL operand-parser breakpoint
    # (30CF:0000, docs/engine/research/pool-runtime-ecl-cursor-trace.md) and continue the proven
    # movement route, watching for the search_location cursor band, same technique as
    # tools/trace_pool_ecl2_20_gamelink_route.ps1's WatchEclCursor path.
    Invoke-DebuggerInput -Command 'BP 30CF:0000' -Label 'arm-operand-parser' | Out-Null
    foreach ($key in $MovementKeys) {
      Assert-ExclusiveOwnership
      & python $gameLink press $key --pace 0.5
      if ($LASTEXITCODE -ne 0) { throw "movement key '$key' failed" }
      $moveDeadline = [DateTime]::UtcNow.AddSeconds(15)
      $moveHit = $false
      while ([DateTime]::UtcNow -lt $moveDeadline) {
        Start-Sleep -Milliseconds 250
        $snap = Invoke-DebuggerInput -SnapshotOnly -Label ('move-poll-{0:D4}' -f $script:stepCounter)
        $script:stepCounter++
        if (Get-Stopped $snap) {
          $csIp = Get-CsIp $snap
          if ($csIp -and $csIp.cs -eq '30CF' -and $csIp.ip -eq '00000000') {
            $dsMatch = [regex]::Match($snap, '\bDS=([0-9A-F]{4})\b')
            if ($dsMatch.Success) {
              $ds = $dsMatch.Groups[1].Value
              $dumpSnap = Invoke-DebuggerInput -Command ('D {0}:49ED' -f $ds) -Label ('ecl-cursor-{0:D4}' -f $eclCursorRecords.Count)
              $bytes = Get-DataBytes $dumpSnap
              if ($bytes.Length -ge 2) {
                $raw = [uint16]($bytes[0] -bor ($bytes[1] -shl 8))
                $virtual = [uint16](($raw - 2 - 0x6700) -band 0xFFFF)
                $eclCursorRecords.Add([ordered]@{ index = $eclCursorRecords.Count; raw_member_offset = $raw; virtual_address = $virtual }) | Out-Null
                if ($virtual -ge ($SearchLocationTarget - 0x20) -and $virtual -le ($SearchLocationTarget + 0x20)) { $searchLocationReached = $true }
              }
            }
            $moveHit = $true
          }
          Invoke-DebuggerInput -Command 'RUN' -Label ('move-resume-{0:D4}' -f $script:stepCounter) | Out-Null
        }
      }
      & python $gameLink screenshot (Join-Path $out ("movement-{0:D2}-{1}.png" -f $eclCursorRecords.Count, $key))
      if ($searchLocationReached) { break }
    }
  }
  $hostStatePostMovement = if ($loadTargetReached) { Get-EclHostState -Label 'post-movement' } else { $null }

  [ordered]@{
    schema_version = 1
    title = 'Pool of Radiance'
    technique = 'BPINT 16 1 breakpoint-anchored key pacing (replaces the idle-streak Wait-Idle detector, proven broken for Pool by the 2026-07-21 LSEEK-loop finding); GameLink v4 for input/screenshots; process-owned debugger console for breakpoints/registers'
    anchor = 'INT 16h AH=1 keyboard-poll stop, found by tools/trace_pool_int16_keywait_probe.ps1 (build/dosbox-x-pool-int16-diag-20260721/int16-diag-trace.json, 37/39 polls stopped at 1264:0306, int 16, EAX AH=01, cycle counter advancing between stops)'
    stage_dir = $StageDir
    save_sha256 = $saveHash
    save_slot = $SaveSlotKey
    phase_log = $phaseLog
    host_state_post_load = $hostStatePostLoad
    load_target_reached = $loadTargetReached
    ecl_cursor_records = $eclCursorRecords
    search_location_target = ('0x{0:X}' -f $SearchLocationTarget)
    search_location_reached = $searchLocationReached
    host_state_post_movement = $hostStatePostMovement
    exclusive_ownership_maintained = $true
    claim_boundary = 'proves whether breakpoint-anchored key pacing reaches the coherent ECL2.DAX#20 baseline (area_ecl_member_id=20/archive_set=2) and, if so, whether continued movement reaches the search_location cursor range; does not by itself prove COMBAT or resume'
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'bpint16-paced-trace.json') -Encoding utf8
  Write-Host "[pool-bpint16-paced] load_target_reached=$loadTargetReached search_location_reached=$searchLocationReached out=$out"
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
