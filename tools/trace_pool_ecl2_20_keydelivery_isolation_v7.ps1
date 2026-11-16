param(
  [string]$StageDir = 'build\runtime-pool-ecl2-20-gamelink-20260717',
  [Parameter(Mandatory)][string]$OutDir,
  [string]$SaveSlotKey = 'i',
  [string]$ExpectedSaveSha256 = '8f944f055a6151b2a871a03ab41629959886879c2161804447eaa09852328619',
  [string[]]$MovementKeys = @('up','right','up','up','right','up'),
  [ValidateRange(1,10)][int]$LookAttempts = 5,
  [ValidateRange(1,1800)][int]$ExclusivityWaitTimeoutSec = 600
)

# v7 isolation test (Pool of Radiance route-completion round, 2026-07-22): does a BARE sequence
# of movement/LOOK keys, with ZERO debugger-console interaction and ZERO GameLink dump-memory
# calls interleaved, deliver every key into the BIOS keyboard buffer -- or does it ALSO fail
# after the first, like tools/trace_pool_ecl2_20_position_probe_v5.ps1 and v6 (retry version)
# both reproducibly showed (3 independent runs: v5-b, v5-c, v6-a) when Drain-Hits (repeated
# debugger-console SnapshotOnly polls via the separate DOSBox-X debugger window, plus 'D'/'RUN'
# commands) and Get-PositionState (a full 1 MiB GameLink dump-memory peek) ran between each key?
#
# This is a deliberately MINIMAL, single-purpose isolation test to separate two candidate root
# causes for the whole "only the first of N sequential GameLink-injected keys is ever delivered"
# finding:
#   (a) our own instrumentation (debugger-console polling and/or large dump-memory reads) is
#       itself what wedges DOSBox-X's GameLink keyboard-injection pipeline after the first key;
#   (b) GameLink/DOSBox-X's own press() mechanism has an inherent multi-press-in-a-row bug or
#       race, independent of anything this project's scripts do in between presses.
# No breakpoint is armed at all past the single proven BPINT16 title-idle anchor (deleted, not
# re-armed, before the first scripted key), and no debugger-console command is issued anywhere
# in the movement/LOOK loops. Position/CS:IP evidence is deliberately NOT collected here -- this
# round's earlier scripts (v3-v6) already cover that; this one exists purely to answer (a) vs (b).

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

function Get-DosboxPids {
  return @(Get-CimInstance Win32_Process -Filter "Name='dosbox-x.exe'" -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty ProcessId)
}
function Wait-ExclusiveDosboxSlot {
  Write-Host '[pool-keydelivery-isolation-v7] waiting for an empty dosbox-x.exe process list before launching...'
  $deadline = [DateTime]::UtcNow.AddSeconds($ExclusivityWaitTimeoutSec)
  while ([DateTime]::UtcNow -lt $deadline) {
    $pids = Get-DosboxPids
    if ($pids.Count -eq 0) { return }
    Write-Host "[pool-keydelivery-isolation-v7] dosbox-x.exe already running (pid(s): $($pids -join ',')) -- waiting..."
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

function Get-KeybufferPeek {
  $json = & python $gameLink peek '0x41A' 4
  if ($LASTEXITCODE -ne 0) { throw 'GameLink peek 0x41A failed' }
  return ($json | ConvertFrom-Json).hex
}

function Send-KeyBare {
  # Deliberately the leanest possible press: no debugger interaction of any kind, no dump-memory.
  param([string]$Key, [string]$Label)
  $before = Get-KeybufferPeek
  Assert-ExclusiveOwnership
  & python $gameLink press $Key --pace 0.2 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "GameLink press '$Key' failed ($Label)" }
  Assert-ExclusiveOwnership
  $burst = @()
  for ($i = 0; $i -lt 10; $i++) { $burst += Get-KeybufferPeek }
  Start-Sleep -Milliseconds 500
  $settled = Get-KeybufferPeek
  $delivered = ($before -ne $settled) -or (@($burst | Where-Object { $_ -ne $before }).Count -gt 0)
  return [ordered]@{
    key = $Key
    label = $Label
    kb_head_tail_before = $before
    kb_head_tail_burst_after = $burst
    kb_head_tail_settled = $settled
    delivered = $delivered
  }
}

$process = $null
$phaseLog = [Collections.Generic.List[object]]::new()
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

  # Confirm the pristine first halt (title-idle anchor), then DELETE it entirely -- no dual-arm,
  # no operand-parser breakpoint. From this point on NO breakpoint is ever armed again in this
  # script, and NO debugger-console command is issued again either.
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  $firstHalt = $null
  $stepCounter = 0
  while ([DateTime]::UtcNow -lt $deadline) {
    $snap = Invoke-DebuggerInput -SnapshotOnly -Label ('firsthalt-{0:D4}' -f $stepCounter)
    $stepCounter++
    if (Get-Stopped $snap) { $firstHalt = $snap; break }
    Start-Sleep -Milliseconds 150
  }
  if (-not $firstHalt) { throw 'never reached the first BPINT16 anchor halt' }
  $phaseLog.Add([ordered]@{ phase = 'first-halt' }) | Out-Null
  Invoke-DebuggerInput -Command 'BPDEL 0' -Label 'delete-anchor' | Out-Null
  $listAfterDelete = Invoke-DebuggerInput -Command 'BPLIST' -Label 'list-after-delete'
  if ($listAfterDelete -match 'BPINT\s+16') { throw "BPINT16 still present after delete -- aborting: $listAfterDelete" }
  Invoke-DebuggerInput -Command 'RUN' -Label 'resume-after-setup' | Out-Null
  Start-Sleep -Seconds 1
  # From here on: zero further Invoke-DebuggerInput calls anywhere in this script.

  # Title dismiss + load menu, free-running paced keys (same pacing v2/v3/v4/v5/v6 already
  # proved works for this phase; not the subject of this isolation test).
  foreach ($step in @(
      @{ key = 'enter'; label = 'title-dismiss-0' },
      @{ key = 'enter'; label = 'title-dismiss-1' },
      @{ key = 'l';     label = 'load-menu' },
      @{ key = $SaveSlotKey; label = 'slot-letter' },
      @{ key = 'enter'; label = 'slot-confirm' }
    )) {
    Start-Sleep -Seconds 1
    Assert-ExclusiveOwnership
    & python $gameLink press $step.key --pace 0.2 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "GameLink press '$($step.key)' failed ($($step.label))" }
    Assert-ExclusiveOwnership
    Start-Sleep -Seconds 1
  }
  Start-Sleep -Seconds 5

  # Confirm load target via GameLink dump-memory -- ONE dump-memory call, done ONCE here, well
  # before the movement loop begins (not interleaved with it), so it cannot contaminate the
  # movement-loop isolation result below.
  $dsAssumed = 0x14A0
  $ramPath = Join-Path $out 'post-load-live.ram'
  & python $gameLink dump-memory $ramPath --start 0 --length 0x100000 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'post-load live RAM dump failed' }
  $ram = [IO.File]::ReadAllBytes($ramPath)
  Remove-Item -LiteralPath $ramPath -Force -ErrorAction SilentlyContinue
  $dgroupBase = [uint32]$dsAssumed -shl 4
  $areaPtrPhys = $dgroupBase + 0x49D2
  $areaOffset0 = [BitConverter]::ToUInt16($ram, [int]$areaPtrPhys)
  $areaSegment0 = [BitConverter]::ToUInt16($ram, [int]$areaPtrPhys + 2)
  $memberPhys0 = ([uint32]$areaSegment0 -shl 4) + [uint32]$areaOffset0 + 0x01E4
  $areaEclMemberId0 = $ram[[int]$memberPhys0]
  $archiveSetPhys0 = $dgroupBase + 0x5376
  $archiveSet0 = $ram[[int]$archiveSetPhys0]
  $loadTargetReached = ($areaEclMemberId0 -eq 20 -and $archiveSet0 -eq 2)
  $phaseLog.Add([ordered]@{ phase = 'load-target-check'; area_ecl_member_id = [int]$areaEclMemberId0; archive_set = [int]$archiveSet0; reached = $loadTargetReached }) | Out-Null
  if (-not $loadTargetReached) { throw "load target not reached: member=$areaEclMemberId0 archive=$archiveSet0" }

  # SEARCH toggle -- bare, keybuffer-bracketed.
  Start-Sleep -Seconds 1
  $searchDelivery = Send-KeyBare -Key 's' -Label 'toggle-search'
  Start-Sleep -Seconds 1

  # Movement route -- bare, keybuffer-bracketed, NOTHING ELSE between presses. This is the core
  # isolation test.
  $moveRecords = [Collections.Generic.List[object]]::new()
  foreach ($key in $MovementKeys) {
    $label = "move-{0:D2}-{1}" -f $moveRecords.Count, $key
    Start-Sleep -Milliseconds 700
    $result = Send-KeyBare -Key $key -Label $label
    $moveRecords.Add($result) | Out-Null
  }

  # LOOK attempts -- also bare.
  $lookRecords = [Collections.Generic.List[object]]::new()
  for ($attempt = 1; $attempt -le $LookAttempts; $attempt++) {
    Start-Sleep -Milliseconds 500
    $result = Send-KeyBare -Key 'l' -Label "look-$attempt"
    $lookRecords.Add($result) | Out-Null
  }

  $deliveredMoves = @($moveRecords | Where-Object { $_.delivered }).Count
  $deliveredLooks = @($lookRecords | Where-Object { $_.delivered }).Count

  [ordered]@{
    schema_version = 1
    title = 'Pool of Radiance'
    purpose = 'isolation test: does a bare key sequence (zero debugger-console interaction, zero interleaved dump-memory) deliver every movement/LOOK key into the BIOS keyboard buffer, unlike v5/v6 which reproducibly (3 runs) showed only the FIRST of 6 movement keys delivered when Drain-Hits + Get-PositionState ran between each key'
    stage_dir = $StageDir
    save_sha256 = $saveHash
    save_slot = $SaveSlotKey
    phase_log = $phaseLog
    load_target_reached = $loadTargetReached
    search_toggle_delivery = $searchDelivery
    move_records = $moveRecords
    look_records = $lookRecords
    delivered_moves = "$deliveredMoves/$($moveRecords.Count)"
    delivered_looks = "$deliveredLooks/$($lookRecords.Count)"
    claim_boundary = 'delivered = true means the BIOS keyboard ring buffer (physical 0x41A, head/tail words) changed value somewhere in the tight post-press burst or the 500ms settled read, proving the scan code reached DOSBox-X''s emulated keyboard hardware. No CS:IP or ECL-position evidence is collected in this script -- it exists solely to isolate whether this project''s own debugger-console/dump-memory instrumentation (present in v3-v6) is the proximate cause of the previously-observed after-the-first-key delivery failure.'
  } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $out 'keydelivery-isolation-v7-trace.json') -Encoding utf8
  Write-Host "[pool-keydelivery-isolation-v7] load_target_reached=$loadTargetReached delivered_moves=$deliveredMoves/$($moveRecords.Count) delivered_looks=$deliveredLooks/$($lookRecords.Count) out=$out"
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
