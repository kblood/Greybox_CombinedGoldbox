param(
  [string]$StageDir = 'build\runtime-pool-ecl2-20-gamelink-20260717',
  [Parameter(Mandatory)][string]$OutDir,
  [string]$SaveSlotKey = 'i',
  [string]$ExpectedSaveSha256 = '8f944f055a6151b2a871a03ab41629959886879c2161804447eaa09852328619',
  [string[]]$MovementKeys = @('up','right','up','up','right','up'),
  [ValidateRange(0x0000,0xFFFF)][int]$SearchLocationTarget = 0x9F13,
  [ValidateRange(1,64)][int]$IdleChecks = 10,
  [ValidateRange(100,5000)][int]$IdlePollMs = 300,
  [ValidateRange(1,600)][int]$OverallTimeoutSec = 240,
  [ValidateRange(1,1800)][int]$ExclusivityWaitTimeoutSec = 600,
  # 2026-07-21: both prior GameLink runs (20260717-d/-e) produced a deterministic miss
  # (byte-identical 41-seek game_ovr_offsets both times, host state post-load
  # area_ecl_member_id=0/archive_set=1 instead of the coherent baseline's 20/2) -- i.e. the
  # 'l' -> slot -> enter sequence never actually reached the Load menu. The leading
  # hypothesis was that Pool's 2 static title screens (its only boot string is "Press any
  # key to continue"; no Play/Demo menu, unlike the other Gen1 titles, per
  # docs/engine/research/gen1-demo-entry-generalized.md sec.8) were not being dismissed
  # before the 'l' press landed. THIS HYPOTHESIS WAS TESTED 2026-07-21 AND REJECTED: a run
  # with -TitleDismissKeys 2 produced a byte-for-byte identical game_ovr_offsets sequence
  # and the same area_ecl_member_id=0/archive_set=1 host state as the undismissed -e run --
  # see docs/engine/research/gen1-dosbox-runtime-trace.md's "2026-07-21" section for the
  # full comparison and the two remaining candidate causes it narrows to (GameLink
  # press/pacing semantics vs. the old host-input technique that at least reached a real
  # menu-loop band; or Pool auto-continuing from a fixed default save with no interactive
  # menu at all). The parameter is kept (default 2) because it is harmless and documented,
  # not because it is known to help.
  [ValidateRange(0,5)][int]$TitleDismissKeys = 2
)

# Focusless GameLink-based Pool of Radiance ECL2.DAX#20 descriptor-3 route trace.
#
# Context: every prior Pool ECL2#20 attempt (2026-07-15, 24 lettered
# build/dosbox-x-pool-ecl2-20-cursor-20260715-{q..x} runs) used the OLD host-input
# (Send-DosKeys / mouse-click Debug-menu pause) technique, which steals OS focus from
# any other concurrent DOSBox-X automation. This script ports that same proven
# coherent-baseline + ECL-cursor-capture logic (Capture-EclCursor's DGROUP 0x49ED
# read and the virtual=(raw-2-0x6700)&0xFFFF conversion, both already verified
# correct against retail ECL2.DAX#20's header) onto DOSBox-X's GameLink v4 IPC
# (see docs/engine/research/dosbox-x-gamelink-automation.md), which never touches
# window focus: game input/screenshots go through tools/dosbox_gamelink.py's shared
# keyboard bitmap and framebuffer, while breakpoints/registers/memory stay on the
# process-owned debugger console (tools/dosbox_debugger_input, which writes directly
# to the DEBUGBOX console's CONIN$/CONOUT$ handles via AttachConsole -- never
# SendInput/SetForegroundWindow, so it was already focus-safe even before this port).
#
# New technique vs. the 24 prior attempts: 'BPINT 21 42' is armed ONCE at true process
# launch (while the debugger starts genuinely paused pre-boot, so registration is
# guaranteed valid per the r2 "typed while running can silently fail" finding) instead
# of via a mid-session mouse-click pause. GameLink keys are injected only once an
# explicit RUN/poll loop finds no new interrupt activity for $IdleChecks consecutive
# polls (a real idle detector), instead of the old fixed Start-Sleep timings that were
# implicated in the previously-documented "injected left/right arrow is sometimes
# consumed as two turns" artifact.
#
# 2026-07-17 CONTAMINATION SAFEGUARD: GameLink's shared-memory transport
# (DWD_GAMELINK_MMAP_R4/DWD_GAMELINK_MUTEX_R4) is a hardcoded, non-process-scoped
# Windows named object -- when two DOSBox-X GameLink sessions run concurrently on this
# machine, a status/screenshot/peek/press call can silently hit a DIFFERENT agent's
# session with no error (see docs/engine/research/dosbox-x-gamelink-automation.md,
# "KNOWN HAZARD" section). This script therefore (a) waits for a fully empty
# `dosbox-x.exe` process list before launching, and (b) re-checks exclusive ownership
# immediately before every single GameLink press/screenshot call, aborting the run
# loudly (not silently continuing on possibly-foreign data) if a second dosbox-x.exe
# process appears mid-session. A first attempt at this route (run -a, 2026-07-17,
# before this safeguard existed) produced ecl_cursor_hits=0/search_location_reached=
# False while 2-3 other agents' dosbox-x.exe processes were concurrently running --
# that result is UNVERIFIED/discarded, not a real negative, precisely because of this
# hazard, not re-reported as route evidence.
#
# Honest scope: this does not solve the facing-byte-on-load anomaly documented in
# gen1-dosbox-runtime-trace.md (hash 87c7c372...4f617) because it reuses the already
# runtime-CONFIRMED coherent baseline save (hash 8f944f05..., loads correctly with
# area_ecl_member_id=20/archive_set=2) rather than a synthesized pose. If this run
# still does not reach the search_location range, that is a genuine result about
# GameLink-paced movement/RNG, not evidence the facing bug is fixed.

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
  param([string]$Command, [string]$Key, [switch]$SnapshotOnly, [string]$Label)
  $statusPath = Join-Path $out "$Label-status.json"
  $snapshotPath = Join-Path $out "$Label-console.txt"
  $args = @($helperDll, '--pid', $process.Id)
  if ($SnapshotOnly) { $args += '--snapshot-only' }
  elseif ($Key) { $args += @('--key', $Key) }
  else { $args += @('--command', $Command) }
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

function Get-DataBytes([string]$Snapshot) {
  $bytes = [Collections.Generic.List[byte]]::new()
  foreach ($line in ($Snapshot -split "`r?`n")) {
    $m = [regex]::Match($line, '^[0-9A-F]{4}:[0-9A-F]{8}\s+((?:[0-9A-F]{2}\s+){15}[0-9A-F]{2})\s')
    if (-not $m.Success) { continue }
    foreach ($hex in ($m.Groups[1].Value -split '\s+')) { if ($hex) { $bytes.Add([Convert]::ToByte($hex, 16)) } }
  }
  return ,$bytes.ToArray()
}

$eclCursorRecords = [Collections.Generic.List[object]]::new()
$gameOvrOffsets = [Collections.Generic.List[uint32]]::new()
$searchLocationReached = $false
$unexpectedStops = [Collections.Generic.List[object]]::new()
$stepCounter = 0

# Run until either: (a) $IdleChecks consecutive polls (each $IdlePollMs) show a
# genuinely free-running guest (no breakpoint stop), which we treat as "idle, safe to
# inject the next scripted key"; or (b) a breakpoint stop occurs, which is inspected,
# logged, and resumed (RUN) so this same loop keeps watching -- the "log a mismatched
# stop and continue rather than abort" discipline this round's task explicitly asked
# to reuse from Secret's r4 (commit 052d9cf).
function Wait-IdleOrCapture {
  param([switch]$WatchEclCursor)
  $idleStreak = 0
  $deadline = [DateTime]::UtcNow.AddSeconds($OverallTimeoutSec)
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds $IdlePollMs
    if ($script:stepCounter % 10 -eq 0) { Assert-ExclusiveOwnership }
    $snap = Invoke-DebuggerInput -SnapshotOnly -Label ('poll-{0:D4}' -f $script:stepCounter)
    $script:stepCounter++
    if (-not (Get-Stopped $snap)) {
      $idleStreak++
      if ($idleStreak -ge $IdleChecks) { return $true }
      continue
    }
    $idleStreak = 0
    $csIp = Get-CsIp $snap
    $eaxMatch = [regex]::Match($snap, '\bEAX=([0-9A-F]{8})\b')
    $isAh42 = $eaxMatch.Success -and ((([Convert]::ToUInt32($eaxMatch.Groups[1].Value, 16)) -shr 8) -band 0xFF) -eq 0x42
    if ($WatchEclCursor -and $csIp -and $csIp.cs -eq '30CF' -and $csIp.ip -eq '00000000') {
      $dsMatch = [regex]::Match($snap, '\bDS=([0-9A-F]{4})\b')
      if ($dsMatch.Success) {
        $ds = $dsMatch.Groups[1].Value
        $dumpSnap = Invoke-DebuggerInput -Command ('D {0}:49ED' -f $ds) -Label ('ecl-cursor-{0:D4}' -f $eclCursorRecords.Count)
        $bytes = Get-DataBytes $dumpSnap
        if ($bytes.Length -ge 2) {
          $raw = [uint16]($bytes[0] -bor ($bytes[1] -shl 8))
          $virtual = [uint16](($raw - 2 - 0x6700) -band 0xFFFF)
          $eclCursorRecords.Add([ordered]@{
            index = $eclCursorRecords.Count
            dgroup_segment = $ds
            raw_member_offset = $raw
            virtual_address = $virtual
          }) | Out-Null
          if ($virtual -ge ($SearchLocationTarget - 0x20) -and $virtual -le ($SearchLocationTarget + 0x20)) {
            $script:searchLocationReached = $true
          }
        }
      }
    } elseif ($isAh42) {
      $ebxMatch = [regex]::Match($snap, '\bEBX=([0-9A-F]{8})\b')
      if ($ebxMatch.Success -and [Convert]::ToUInt32($ebxMatch.Groups[1].Value, 16) -eq 5) {
        $ecxMatch = [regex]::Match($snap, '\bECX=([0-9A-F]{8})\b')
        $edxMatch = [regex]::Match($snap, '\bEDX=([0-9A-F]{8})\b')
        if ($ecxMatch.Success -and $edxMatch.Success) {
          $seekOffset = ((([Convert]::ToUInt32($ecxMatch.Groups[1].Value, 16)) -band 0xFFFF) -shl 16) -bor
            ([Convert]::ToUInt32($edxMatch.Groups[1].Value, 16) -band 0xFFFF)
          $gameOvrOffsets.Add([uint32]$seekOffset) | Out-Null
        }
      }
    } else {
      $csIpText = $null
      if ($csIp) { $csIpText = '{0}:{1}' -f $csIp.cs, $csIp.ip }
      $unexpectedStops.Add([ordered]@{
        index = $unexpectedStops.Count
        cs_ip = $csIpText
        note = 'genuine stop not matching AH=42 seek or the 30CF:0000 operand parser; logged and resumed, not aborted'
      }) | Out-Null
    }
    Invoke-DebuggerInput -Command 'RUN' -Label ('resume-{0:D4}' -f $script:stepCounter) | Out-Null
  }
  return $false
}

function Get-DosboxPids {
  return @(Get-CimInstance Win32_Process -Filter "Name='dosbox-x.exe'" -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty ProcessId)
}

function Wait-ExclusiveDosboxSlot {
  Write-Host '[pool-ecl2-20-gamelink] waiting for an empty dosbox-x.exe process list before launching (GameLink singleton hazard)...'
  $deadline = [DateTime]::UtcNow.AddSeconds($ExclusivityWaitTimeoutSec)
  while ([DateTime]::UtcNow -lt $deadline) {
    $pids = Get-DosboxPids
    if ($pids.Count -eq 0) { return }
    Write-Host "[pool-ecl2-20-gamelink] dosbox-x.exe already running (pid(s): $($pids -join ',')) -- waiting..."
    Start-Sleep -Seconds 5
  }
  throw "timed out waiting $ExclusivityWaitTimeoutSec s for an exclusive dosbox-x.exe slot"
}

# Called immediately before every GameLink call and periodically during idle waits.
# If any dosbox-x.exe PID other than our own launched process appears, the shared
# GameLink transport can no longer be trusted to be talking to OUR process -- abort
# loudly rather than silently recording possibly-foreign data.
function Assert-ExclusiveOwnership {
  $pids = Get-DosboxPids
  $foreign = @($pids | Where-Object { $_ -ne $process.Id })
  if ($foreign.Count -gt 0) {
    throw "GameLink CONTAMINATION: foreign dosbox-x.exe pid(s) detected ($($foreign -join ',')) while own pid is $($process.Id) -- aborting rather than trusting possibly cross-talked GameLink data"
  }
}

# Host-state read via the PID-bound debugger console (independent of the GameLink
# frame/screenshot path, which the 20260717-a/-d runs showed returns an all-zero-alpha
# frame while the probe window is minimized -- a separate, likely rendering-only issue
# that does not affect this debugger-console read). Ported from
# tools/trace_pool_ecl18_route.ps1's Capture-EclHostState: area pointer at
# DGROUP+0x49D2 (offset:segment, 4 bytes), ECL member field at areaOffset+0x01E4
# within areaSegment, archive set at DGROUP+0x5376. Used to check whether the
# already-proven coherent ECL2.DAX#20 baseline (area_ecl_member_id=20, archive_set=2)
# still holds after a GameLink-paced load, independent of whether the 30CF:0000
# operand-parser breakpoint ever fires.
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

$process = $null
$contaminated = $false
try {
  Wait-ExclusiveDosboxSlot
  & $probe -DbxExe $dbx -GameDir $stage -DosWorkingDir 'POOLRAD' -Exe 'START.EXE' -OutDir $out `
    -Cycles 'fixed 25000' -GameLink -DebuggerAction @('BPINT 21 42', 'RUN') -NoActionScreenshots
  if (-not $?) { throw 'DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  Assert-ExclusiveOwnership
  Start-Sleep -Seconds 3
  Assert-ExclusiveOwnership

  # Phase 0: dismiss Pool's static title screens (see $TitleDismissKeys doc comment above).
  # Each screen only needs "any key"; Enter is used since it is harmless everywhere else in
  # the boot/menu flow this script drives. One idle wait + screenshot per screen so a
  # post-hoc review can see whether each dismissal actually advanced a frame.
  $titleDismissShots = @()
  for ($dismissIndex = 0; $dismissIndex -lt $TitleDismissKeys; $dismissIndex++) {
    Wait-IdleOrCapture | Out-Null
    Assert-ExclusiveOwnership
    & python $gameLink press enter --pace 0.5
    if ($LASTEXITCODE -ne 0) { throw "title dismiss key $dismissIndex failed" }
    Assert-ExclusiveOwnership
    $shotPath = Join-Path $out ("phase0-dismiss-{0:D2}.png" -f $dismissIndex)
    & python $gameLink screenshot $shotPath
    $titleDismissShots += $shotPath
  }

  # Phase 1: boot to the load-game prompt. Wait idle, then send 'L'.
  Wait-IdleOrCapture | Out-Null
  Assert-ExclusiveOwnership
  & python $gameLink press l --pace 0.5
  if ($LASTEXITCODE -ne 0) { throw 'Load key failed' }
  Assert-ExclusiveOwnership
  & python $gameLink screenshot (Join-Path $out 'phase1-after-l.png')

  # Phase 2: at the slot picker, wait idle then select the save slot and confirm.
  Wait-IdleOrCapture | Out-Null
  Assert-ExclusiveOwnership
  & python $gameLink press $SaveSlotKey --pace 0.5
  if ($LASTEXITCODE -ne 0) { throw 'slot key failed' }
  Assert-ExclusiveOwnership
  & python $gameLink press enter --pace 0.5
  if ($LASTEXITCODE -ne 0) { throw 'slot confirm failed' }
  Assert-ExclusiveOwnership
  & python $gameLink screenshot (Join-Path $out 'phase2-after-slot.png')

  # Phase 3: wait for the load to settle (idle again) before arming the ECL parser
  # breakpoint and starting movement -- this is the transition the 24 prior attempts
  # used a focus-stealing mouse click for.
  Wait-IdleOrCapture | Out-Null
  Assert-ExclusiveOwnership
  Invoke-DebuggerInput -Command 'BP 30CF:0000' -Label 'arm-operand-parser' | Out-Null
  & python $gameLink screenshot (Join-Path $out 'phase3-loaded.png')
  $hostStatePostLoad = Get-EclHostState -Label 'post-load'

  foreach ($key in $MovementKeys) {
    Assert-ExclusiveOwnership
    & python $gameLink press $key --pace 0.5
    if ($LASTEXITCODE -ne 0) { throw "movement key '$key' failed" }
    $idle = Wait-IdleOrCapture -WatchEclCursor
    Assert-ExclusiveOwnership
    & python $gameLink screenshot (Join-Path $out ("movement-{0:D2}-{1}.png" -f ($eclCursorRecords.Count), $key))
    if ($searchLocationReached) { break }
  }
  $hostStatePostMovement = Get-EclHostState -Label 'post-movement'

  [ordered]@{
    schema_version = 1
    title = 'Pool of Radiance'
    route = 'ECL2#20 GEO2#20, GameLink-paced movement toward descriptor 3'
    technique = 'DOSBox-X GameLink v4 for input/screenshots; process-owned debugger console for breakpoints (both focusless per docs/engine/research/dosbox-x-gamelink-automation.md)'
    save_sha256 = $saveHash
    title_dismiss_keys = $TitleDismissKeys
    title_dismiss_screenshots = $titleDismissShots
    movement_keys = $MovementKeys
    game_ovr_offsets = $gameOvrOffsets
    ecl_cursor_records = $eclCursorRecords
    search_location_target = ('0x{0:X}' -f $SearchLocationTarget)
    search_location_reached = $searchLocationReached
    unexpected_stops = $unexpectedStops
    host_state_post_load = $hostStatePostLoad
    host_state_post_movement = $hostStatePostMovement
    exclusive_ownership_maintained = $true
    claim_boundary = 'proves whether GameLink-paced movement from the runtime-confirmed ECL2.DAX#20 coherent baseline reaches the search_location cursor range; does not by itself prove COMBAT or resume'
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $out 'gamelink-route-trace.json') -Encoding utf8
  Write-Host "[pool-ecl2-20-gamelink] search_location_reached=$searchLocationReached ecl_cursor_hits=$($eclCursorRecords.Count) game_ovr_seeks=$($gameOvrOffsets.Count) out=$out"
} catch {
  if ($_.Exception.Message -like 'GameLink CONTAMINATION*') {
    $contaminated = $true
    [ordered]@{
      schema_version = 1
      title = 'Pool of Radiance'
      status = 'ABORTED_CONTAMINATED'
      error = $_.Exception.Message
      game_ovr_offsets = $gameOvrOffsets
      ecl_cursor_records = $eclCursorRecords
    } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $out 'gamelink-route-trace.json') -Encoding utf8
  }
  throw
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
