param(
  [string]$StageDir = 'build\runtime-pool-ecl2-20-gamelink-20260717',
  [Parameter(Mandatory)][string]$OutDir,
  [string]$SaveSlotKey = 'i',
  [string]$ExpectedSaveSha256 = '8f944f055a6151b2a871a03ab41629959886879c2161804447eaa09852328619',
  [string[]]$MovementKeys = @('up','right','up','up','right','up'),
  [ValidateRange(0x0000,0xFFFF)][int]$SearchLocationTarget = 0x9F13,
  [ValidateRange(1,60)][int]$AnchorConfirmTimeoutSec = 20,
  [ValidateRange(1,20)][int]$ArmRetries = 10,
  [ValidateRange(50,2000)][int]$ArmRetryMs = 150,
  [ValidateRange(1,10)][int]$PreInjectSettleSec = 1,
  [ValidateRange(1,10)][int]$PostInjectSettleSec = 2,
  [ValidateRange(1,1800)][int]$ExclusivityWaitTimeoutSec = 600
)

# Breakpoint-anchored pacing v2 for Pool of Radiance (BUILD-QUEUE items 110/147/248).
#
# v1 (tools/trace_pool_ecl2_20_bpint16_paced.ps1) mechanically proved the anchor itself is
# reliable -- ALL 5 scripted keys (2 title dismissals, L, slot letter, Enter) confirmed a halted
# stop at 1264:0306 (INT 16h AH=1, the title/menu "wait for any key" busy-poll loop) before each
# injection, replacing the idle-streak Wait-Idle detector that never fires for Pool (continuous
# background INT 21h AH=42 LSEEK loop). But v1's host-state read after the sequence showed
# area_ecl_member_id=0/archive_set=3 -- progress from the prior "never loaded" archive_set=1
# signature, but not the coherent baseline's target archive_set=2/member=20.
#
# Root cause, found by this round's two follow-up probes:
# - tools/trace_pool_gamelink_keybuffer_probe.ps1: with BPINT 16 1 held armed and the key
#   injected WHILE CONFIRMED HALTED at that breakpoint, the BIOS keyboard ring buffer
#   (0040:001A head / 0040:001C tail) never moved from its resting value (0x1E/0x1E), checked
#   before the press, immediately after (still halted), immediately after RUN, and after a
#   500ms settle -- i.e. the key was never actually delivered into the emulated keyboard
#   hardware at all while this very-high-frequency breakpoint (re-hit almost instantly on every
#   loop pass, confirmed by v1's phase_log: literally 100% of 60 settle-window polls across all
#   5 phases stopped at the identical address) held the CPU.
# - tools/trace_pool_gamelink_freerun_keybuffer_probe.ps1: with NO breakpoint armed at all
#   (genuinely free-running, GameLink peek used for a live read instead of the debugger
#   console, which was separately proven to return a STALE cached snapshot from the very first
#   pre-boot stop while the CPU is running), the SAME press delivered cleanly -- head/tail
#   jumped together from 0x1E/0x1E to 0x20/0x20 (one scancode pushed and consumed) in the very
#   first post-press peek and stayed there.
#
# Conclusion: an always-armed, per-loop-iteration breakpoint halts DOSBox-X's entire host main
# loop (not just the virtual CPU), starving GameLink's own shared-memory keypress delivery,
# which is serviced by that same main loop -- the same underlying mechanism already suspected
# for the pre-existing "GameLink screenshots are all-zero-alpha in every minimized Pool probe
# window" issue. This unifies both findings under one root cause and gives a concrete fix: use
# the breakpoint ONLY to CONFIRM the engine has reached the idle input-wait point, then DELETE
# it (safe -- done only while confirmed halted, per this project's established
# arm/delete-while-stopped discipline) before injecting the key into a genuinely free-running
# CPU, then re-arm for the NEXT phase's confirmation via an arm-then-BPLIST-readback retry loop
# (also established discipline -- typing BP/BPINT while the CPU may already be running can
# silently fail to register, so every arm is verified, not assumed).

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
  Write-Host '[pool-bpint16-paced-v2] waiting for an empty dosbox-x.exe process list before launching (GameLink singleton hazard)...'
  $deadline = [DateTime]::UtcNow.AddSeconds($ExclusivityWaitTimeoutSec)
  while ([DateTime]::UtcNow -lt $deadline) {
    $pids = Get-DosboxPids
    if ($pids.Count -eq 0) { return }
    Write-Host "[pool-bpint16-paced-v2] dosbox-x.exe already running (pid(s): $($pids -join ',')) -- waiting..."
    Start-Sleep -Seconds 5
  }
  throw "timed out waiting $ExclusivityWaitTimeoutSec s for an exclusive dosbox-x.exe slot"
}
function Assert-ExclusiveOwnership {
  $pids = Get-DosboxPids
  $foreign = @($pids | Where-Object { $_ -ne $process.Id })
  if ($foreign.Count -gt 0) {
    throw "GameLink CONTAMINATION: foreign dosbox-x.exe pid(s) detected ($($foreign -join ',')) while own pid is $($process.Id) -- aborting"
  }
}

$phaseLog = [Collections.Generic.List[object]]::new()
$stepCounter = 0

# Re-arms BPINT 16 1 (retrying with a BPLIST readback verification each time, since typing
# BP/BPINT while the CPU may already be running can silently fail to register -- established
# discipline from Secret's own trace family), then polls for a confirmed halt at the AH=1
# pattern. Returns the confirmed CS:IP or throws on timeout.
function Wait-ConfirmedAnchor {
  param([string]$Label)
  $armed = $false
  for ($attempt = 0; $attempt -lt $ArmRetries; $attempt++) {
    Invoke-DebuggerInput -Command 'BPINT 16 1' -Label ("arm-$Label-$attempt") | Out-Null
    $listSnap = Invoke-DebuggerInput -Command 'BPLIST' -Label ("armcheck-$Label-$attempt")
    if ($listSnap -match 'BPINT\s+16.*01' -or $listSnap -match 'BPINT\s+0016.*0001' -or $listSnap -match 'INT16') {
      $armed = $true
      break
    }
    Start-Sleep -Milliseconds $ArmRetryMs
  }
  if (-not $armed) {
    # Even if the BPLIST text pattern didn't match what we expected (format uncertainty), the
    # arm command may still have registered -- fall through to the poll loop rather than
    # failing outright; the poll loop's own AH=1 match is the real proof either way.
    $phaseLog.Add([ordered]@{ label = $Label; note = 'BPLIST did not visibly confirm BPINT 16 1 registration; proceeding to poll anyway' }) | Out-Null
  }
  $deadline = [DateTime]::UtcNow.AddSeconds($AnchorConfirmTimeoutSec)
  while ([DateTime]::UtcNow -lt $deadline) {
    $snap = Invoke-DebuggerInput -SnapshotOnly -Label ('anchor-poll-{0:D4}-{1}' -f $script:stepCounter, $Label)
    $script:stepCounter++
    if (Get-Stopped $snap) {
      $csIp = Get-CsIp $snap
      $ah = Get-Ah $snap
      if ($ah -eq 1) {
        return [ordered]@{ cs = $csIp.cs; ip = $csIp.ip; snapshot = $snap }
      }
      $phaseLog.Add([ordered]@{ label = $Label; note = 'unexpected stop while waiting for anchor; resumed'; cs_ip = "$($csIp.cs):$($csIp.ip)"; ah = $ah }) | Out-Null
      Invoke-DebuggerInput -Command 'RUN' -Label ('anchor-resume-{0:D4}-{1}' -f $script:stepCounter, $Label) | Out-Null
    } else {
      Start-Sleep -Milliseconds 150
    }
  }
  throw "timed out waiting for a confirmed AH=1 anchor stop ($Label)"
}

$anchorClearedOnce = $false

# v2-a (this same round) tried a per-key re-arm-then-poll cycle (BPDEL * while confirmed
# halted, then re-issue 'BPINT 16 1' before every single key) and found it unreliable: the
# SECOND phase's re-arm attempt showed BPLIST listing two stale 'BPINT 16 AH=01' entries
# alongside a 'Breakpoints deleted' scrollback line, and the CPU then genuinely free-ran for
# the entire 20s timeout without ever re-hitting the anchor again -- i.e. re-arming BPINT
# specifically, mid-session, after a prior delete, did not reliably restore live interrupt
# breakpoint checking in this DOSBox-X build (a DIFFERENT failure mode than the documented
# "BP/BPDEL typed while running can silently fail to register": here the debugger clearly DID
# process the commands, per its own console output, but the resulting live behavior did not
# match a fresh single-arm session).
#
# Fix: arm the anchor exactly ONCE, at true process launch (already guaranteed valid -- the
# debugger starts genuinely paused pre-boot), use it to confirm the FIRST idle-wait point only,
# delete it exactly ONCE right after that single confirmation, and then drive the rest of the
# scripted sequence with fixed real-world pacing (Start-Sleep before/after each press) --
# exactly the technique tools/trace_secret_begin_selector.ps1 already uses successfully for its
# own title/load-menu dismissal sequence (only reaching for address-specific breakpoints AFTER
# the game is loaded and running in a stable state, not for the boot/menu flow itself). Every
# press is still bracketed with a live GameLink peek of the BIOS keyboard ring buffer
# (0x41A, proven live and accurate by this round's freerun control test) as an independent,
# per-key delivery check -- weaker than a breakpoint re-confirmation, but real evidence, not an
# assumption.
function Send-PacedKey {
  param([string]$Key, [string]$Label)
  if (-not $anchorClearedOnce) {
    $anchor = Wait-ConfirmedAnchor -Label "wait-$Label"
    Invoke-DebuggerInput -Command 'BPDEL *' -Label "clear-$Label" | Out-Null
    Invoke-DebuggerInput -Command 'RUN' -Label "resume-$Label" | Out-Null
    $script:anchorClearedOnce = $true
    $anchorNote = "$($anchor.cs):$($anchor.ip)"
  } else {
    $anchorNote = 'reused from single initial anchor confirmation (see title-dismiss-0)'
  }
  Start-Sleep -Seconds $PreInjectSettleSec
  $peekBefore = (& python $gameLink peek '0x41A' 4 | ConvertFrom-Json).hex
  Assert-ExclusiveOwnership
  & python $gameLink press $Key --pace 0.2
  if ($LASTEXITCODE -ne 0) { throw "GameLink press '$Key' failed ($Label)" }
  Assert-ExclusiveOwnership
  $peekAfter = (& python $gameLink peek '0x41A' 4 | ConvertFrom-Json).hex
  Start-Sleep -Seconds $PostInjectSettleSec
  $peekSettled = (& python $gameLink peek '0x41A' 4 | ConvertFrom-Json).hex
  $phaseLog.Add([ordered]@{
    label = $Label
    key = $Key
    anchor_cs_ip = $anchorNote
    kb_before_press = $peekBefore
    kb_immediately_after_press = $peekAfter
    kb_settled = $peekSettled
    delivery_evidence = ($peekBefore -ne $peekAfter -or $peekBefore -ne $peekSettled)
  }) | Out-Null
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

  # The launch DebuggerAction already armed+ran into the FIRST anchor hit; Wait-ConfirmedAnchor
  # inside Send-PacedKey's first call will find it already confirmed (or re-poll briefly if not
  # yet reached) without needing a redundant re-arm, since BPINT 16 1 is still registered from
  # launch for this very first phase only.
  Send-PacedKey -Key 'enter' -Label 'title-dismiss-0'
  Send-PacedKey -Key 'enter' -Label 'title-dismiss-1'
  Send-PacedKey -Key 'l' -Label 'load-menu'
  Send-PacedKey -Key $SaveSlotKey -Label 'slot-letter'
  Send-PacedKey -Key 'enter' -Label 'slot-confirm'

  # Extra settle margin for the load itself (real seek-heavy work), genuinely free-running
  # (no breakpoint armed) the whole time -- exactly the condition proven to deliver keys and,
  # by extension, allow real background work to actually progress.
  Start-Sleep -Seconds 5

  # CRITICAL v2 correction (found while producing this same result): the debugger CONSOLE's
  # register/'D' memory reads are confirmed STALE while the CPU is genuinely free-running (the
  # freerun control test proved this directly: a read while running echoed cc=1, CS:IP=1796:0014
  # -- the pre-boot launch state -- not live data). Since v2 deletes the anchor breakpoint and
  # never re-halts before this point, a naive Get-EclHostState call here would silently read
  # back whatever the console cached from the SINGLE original anchor stop at the very start of
  # boot -- worthless for judging load success. A first v2 attempt at this exact point did
  # exactly that and returned area_ecl_member_id=223/archive_set=223 (0xDF/0xDF, an
  # unmistakably stale/uninitialized-looking pair, not real post-load state).
  #
  # SECOND correction (also found while producing this same result): re-arming NEW breakpoints
  # ('BP 30CF:0000' / 'BPINT 16 1') from a genuinely free-running state (the ONLY re-arm since
  # the single initial deletion -- not the rejected v2-a repeated-cycle design) still timed out
  # after 20s with neither ever firing, even though the status.json for each arm command
  # reported Success. The console echo for both arm commands showed only stale scrollback from
  # the ORIGINAL boot-time anchor cycle, never a new 'DEBUG: Set breakpoint...' line -- evidence
  # that the debugger's command queue is not actually serviced while genuinely free-running with
  # no breakpoint already active to periodically hand control back to it, not just that the
  # displayed console text is stale. This means "delete the only breakpoint, then later re-arm a
  # fresh one" is NOT viable in this DOSBox-X build when nothing else will independently halt
  # the CPU first: with zero breakpoints armed, RUN commits to free-running until the process
  # exits, and the debugger apparently cannot regain control to process new commands from the
  # host side.
  #
  # Practical fix: skip the debugger console for the post-load state read entirely. DS was
  # observed as the fixed value 14A0 at every single capture across this whole round's
  # sessions (the int16 diagnostic, both v1 runs, and v2-b's own stale-but-DS-still-correct
  # read) -- consistent with Pool's DGROUP staying at a fixed physical segment throughout
  # ordinary START.EXE execution, not something that VROOMM relocates. Read the SAME DGROUP
  # fields (area pointer +0x49D2, ECL member +0x1E4 from the area base, archive set +0x5376)
  # directly from a full RAM dump taken via GameLink's own IPC channel (proven live regardless
  # of CPU run/halt state by this round's freerun keybuffer control test), using that fixed
  # DS=14A0 assumption -- explicitly logged as an assumption, not re-derived live, so the claim
  # boundary stays honest if DS ever turns out not to be fixed after all.
  $dsAssumed = 0x14A0
  $ramDumpPath = Join-Path $out 'post-load-live.ram'
  & python $gameLink dump-memory $ramDumpPath --start 0 --length 0x100000
  if ($LASTEXITCODE -ne 0) { throw 'post-load live RAM dump failed' }
  $ram = [IO.File]::ReadAllBytes($ramDumpPath)
  $dgroupBase = [uint32]$dsAssumed -shl 4
  $areaPtrPhys = $dgroupBase + 0x49D2
  $areaOffset = [BitConverter]::ToUInt16($ram, [int]$areaPtrPhys)
  $areaSegment = [BitConverter]::ToUInt16($ram, [int]$areaPtrPhys + 2)
  $memberPhys = ([uint32]$areaSegment -shl 4) + [uint32]$areaOffset + 0x01E4
  $areaEclMemberId = $ram[[int]$memberPhys]
  $archiveSetPhys = $dgroupBase + 0x5376
  $archiveSet = $ram[[int]$archiveSetPhys]
  $hostStatePostLoad = [ordered]@{
    label = 'post-load-live-gamelink'
    method = 'GameLink dump-memory + fixed DS=14A0 (assumed, see comment above), not the debugger console'
    ds_segment_assumed = ('{0:X4}' -f $dsAssumed)
    area_segment = ('{0:X4}' -f $areaSegment)
    area_offset = ('{0:X4}' -f $areaOffset)
    area_ecl_member_id = [int]$areaEclMemberId
    archive_set = [int]$archiveSet
  }
  $postLoadHaltNote = 'debugger console re-arm after free-running was unreachable (commands not serviced with zero breakpoints active); used a live GameLink RAM dump with a fixed DS=14A0 assumption instead'
  & python $gameLink screenshot (Join-Path $out 'phase3-loaded.png')

  $loadTargetReached = $hostStatePostLoad -and $hostStatePostLoad.area_ecl_member_id -eq 20 -and $hostStatePostLoad.archive_set -eq 2

  # Movement/cursor tracking, corrected to match the post-load fix: the debugger console
  # cannot service a NEW 'BP 30CF:0000' arm command issued from a genuinely free-running state
  # with zero breakpoints already active (proven above -- the arm command's own status.json
  # reports success, but the console never shows a new registration line and the breakpoint
  # never actually fires). Read the ECL cursor field (DGROUP+0x49ED, same fixed DS=14A0
  # assumption) directly from a fresh GameLink RAM dump after each movement key + a real settle
  # sleep, instead of trying to catch it exactly at the operand-parser instruction. This proves
  # the DATA transition (which is what BUILD-QUEUE's route actually cares about) without needing
  # CS:IP synchronization for this portion.
  $eclCursorRecords = [Collections.Generic.List[object]]::new()
  $searchLocationReached = $false
  if ($loadTargetReached) {
    foreach ($key in $MovementKeys) {
      Assert-ExclusiveOwnership
      & python $gameLink press $key --pace 0.5
      if ($LASTEXITCODE -ne 0) { throw "movement key '$key' failed" }
      Start-Sleep -Seconds 2
      $moveRamPath = Join-Path $out ("movement-{0:D2}-{1}.ram" -f $eclCursorRecords.Count, $key)
      & python $gameLink dump-memory $moveRamPath --start 0 --length 0x100000
      if ($LASTEXITCODE -ne 0) { throw "movement RAM dump failed for '$key'" }
      $moveRam = [IO.File]::ReadAllBytes($moveRamPath)
      $cursorPhys = $dgroupBase + 0x49ED
      $raw = [BitConverter]::ToUInt16($moveRam, [int]$cursorPhys)
      $virtual = [uint16](($raw - 2 - 0x6700) -band 0xFFFF)
      $areaOffsetNow = [BitConverter]::ToUInt16($moveRam, [int]$areaPtrPhys)
      $areaSegmentNow = [BitConverter]::ToUInt16($moveRam, [int]$areaPtrPhys + 2)
      $memberPhysNow = ([uint32]$areaSegmentNow -shl 4) + [uint32]$areaOffsetNow + 0x01E4
      $eclCursorRecords.Add([ordered]@{
        index = $eclCursorRecords.Count
        key = $key
        raw_member_offset = $raw
        virtual_address = ('0x{0:X}' -f $virtual)
        area_ecl_member_id = [int]$moveRam[[int]$memberPhysNow]
        archive_set = [int]$moveRam[[int]($dgroupBase + 0x5376)]
      }) | Out-Null
      if ($virtual -ge ($SearchLocationTarget - 0x20) -and $virtual -le ($SearchLocationTarget + 0x20)) { $searchLocationReached = $true }
      & python $gameLink screenshot (Join-Path $out ("movement-{0:D2}-{1}.png" -f $eclCursorRecords.Count, $key))
      if ($searchLocationReached) { break }
    }
  }
  $hostStatePostMovement = if ($loadTargetReached -and $eclCursorRecords.Count -gt 0) {
    $last = $eclCursorRecords[$eclCursorRecords.Count - 1]
    [ordered]@{ label = 'post-movement-live-gamelink'; area_ecl_member_id = $last.area_ecl_member_id; archive_set = $last.archive_set; ecl_virtual_address = $last.virtual_address }
  } else { $null }

  [ordered]@{
    schema_version = 1
    title = 'Pool of Radiance'
    technique = 'BPINT 16 1 breakpoint-anchored pacing v2: the breakpoint CONFIRMS the idle input-wait point, then is deleted (while confirmed halted) so the key is injected into a genuinely free-running CPU -- fixing v1''s root cause (an always-armed, per-loop-iteration breakpoint starves GameLink keypress delivery by holding the DOSBox-X host main loop halted)'
    root_cause_evidence = @{
      keybuffer_probe = 'build/dosbox-x-pool-keybuffer-probe-20260721-a/keybuffer-probe-trace.json'
      freerun_control = 'build/dosbox-x-pool-freerun-keybuffer-20260721-d/freerun-keybuffer-trace.json'
    }
    stage_dir = $StageDir
    save_sha256 = $saveHash
    save_slot = $SaveSlotKey
    phase_log = $phaseLog
    post_load_halt = $postLoadHaltNote
    host_state_post_load = $hostStatePostLoad
    load_target_reached = $loadTargetReached
    ecl_cursor_records = $eclCursorRecords
    search_location_target = ('0x{0:X}' -f $SearchLocationTarget)
    search_location_reached = $searchLocationReached
    host_state_post_movement = $hostStatePostMovement
    exclusive_ownership_maintained = $true
    claim_boundary = 'proves whether breakpoint-anchored-then-freerun key pacing reaches the coherent ECL2.DAX#20 baseline (area_ecl_member_id=20/archive_set=2) and, if so, whether continued movement reaches the search_location cursor range; does not by itself prove COMBAT or resume'
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'bpint16-paced-v2-trace.json') -Encoding utf8
  Write-Host "[pool-bpint16-paced-v2] load_target_reached=$loadTargetReached search_location_reached=$searchLocationReached out=$out"
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
