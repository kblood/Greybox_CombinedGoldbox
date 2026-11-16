param(
  [string]$StageDir = 'build\runtime-pool-ecl2-20-gamelink-20260717',
  [Parameter(Mandatory)][string]$OutDir,
  [string]$SaveSlotKey = 'i',
  [string]$ExpectedSaveSha256 = '8f944f055a6151b2a871a03ab41629959886879c2161804447eaa09852328619',
  [string[]]$MovementKeys = @('up','right','up','up','right','up'),
  [ValidateRange(1,10)][int]$LookAttempts = 5,
  [ValidateRange(1,1800)][int]$ExclusivityWaitTimeoutSec = 600,
  [ValidateRange(100,15000)][int]$MoveSettleMs = 4000,
  [ValidateRange(100,15000)][int]$LookSettleMs = 3000
)

# v9 route-completion attempt (Pool of Radiance, 2026-07-22), building on v8's result.
#
# v8 (build/dosbox-x-pool-route-complete-v8-20260722-a) proved TWO things at once:
#   1. Per-key GameLink dump-memory (no debugger-console interaction) does NOT degrade delivery:
#      delivered_moves=6/6 delivered_looks=5/5, matching v7. So dump-memory itself was never the
#      culprit behind v5/v6's degraded (1/6) delivery -- the real wedge in v5/v6 must have been the
#      *persistently-armed, high-frequency operand-parser breakpoint* (hit 22-23 times just during
#      title/load in v3) forcing constant CPU halt/RUN drain cycles, which likely starves DOS's own
#      timer/keyboard-interrupt cadence during the movement window.
#   2. The BIOS keyboard ring buffer (0x41A) proved every one of the 11 movement+look keys was
#      genuinely delivered AND consumed (head==tail after each press -- DOS's own handler read it)
#      -- yet DGROUP+0x49ED ("ecl_cursor") and the [0xC04F]-derived map_cell_byte only changed ONCE,
#      after the very FIRST key, then froze verbatim for the remaining 10 delivered-and-consumed
#      keys. This rules out "keys never reached DOS" and instead points at the GAME's own logic:
#      with SEARCH mode enabled, each step likely triggers a per-cell search that consumes
#      simulated game time (an animation/message/busy-wait), during which further buffered input
#      is silently discarded by the game's own input-flush, not lost at the DOS/BIOS level.
#
# This script tests that hypothesis directly: identical to v8 otherwise, but with MUCH longer
# settle time between each movement/LOOK key ($MoveSettleMs / $LookSettleMs, default 4s / 3s
# instead of v8's 700ms / 500ms) to give any per-cell SEARCH processing time to fully finish
# before the next key is sent. If map_cell_byte / ecl_cursor now progress through more than one
# distinct value across the 6 movement keys, this confirms the "search busy-wait swallows input"
# hypothesis and should get the party to (13,10) descriptor 3.

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

function Get-MapCellState {
  # GameLink dump-memory based state read -- no debugger-console interaction. Reuses the
  # area-struct formula from tools/trace_pool_ecl18_route.ps1 / v4-v6 of this round:
  #   MapCellAreaOffset = (0xC04F * 2 + 0x6E00) & 0xFFFF = 0xEE9E
  #   map_cell_address  = (areaOffset + MapCellAreaOffset) & 0xFFFF, read at areaSegment:that
  # This formula itself is still formally UNVERIFIED for Pool (never independently cross-checked
  # against a known-different cell state) -- treat map_cell_byte / map_cell_masked as a candidate
  # reading, not a promoted symbol, until corroborated by a state transition here.
  param([string]$Label)
  $ramPath = Join-Path $out "$Label.ram"
  & python $gameLink dump-memory $ramPath --start 0 --length 0x100000 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "dump-memory failed for $Label" }
  $ram = [IO.File]::ReadAllBytes($ramPath)
  Remove-Item -LiteralPath $ramPath -Force -ErrorAction SilentlyContinue
  $dgroupBase = [uint32]$dsAssumed -shl 4
  $areaPtrPhys = $dgroupBase + 0x49D2
  $areaOffset = [BitConverter]::ToUInt16($ram, [int]$areaPtrPhys)
  $areaSegment = [BitConverter]::ToUInt16($ram, [int]$areaPtrPhys + 2)
  $memberPhys = ([uint32]$areaSegment -shl 4) + [uint32]$areaOffset + 0x01E4
  $areaEclMemberId = $ram[[int]$memberPhys]
  $archiveSetPhys = $dgroupBase + 0x5376
  $archiveSet = $ram[[int]$archiveSetPhys]
  $mapCellAreaOffset = 0xEE9E
  $mapCellAddress = ([uint32]$areaOffset + $mapCellAreaOffset) -band 0xFFFF
  $mapCellPhys = ([uint32]$areaSegment -shl 4) + $mapCellAddress
  $mapCellByte = $ram[[int]$mapCellPhys]
  $eclCursorPhys = $dgroupBase + 0x49ED
  $eclCursor = [BitConverter]::ToUInt16($ram, [int]$eclCursorPhys)
  return [ordered]@{
    label = $Label
    area_segment = $areaSegment
    area_offset = $areaOffset
    area_ecl_member_id = [int]$areaEclMemberId
    archive_set = [int]$archiveSet
    map_cell_phys = ('0x{0:X5}' -f $mapCellPhys)
    map_cell_byte = [int]$mapCellByte
    map_cell_masked_0x7f = [int]($mapCellByte -band 0x7F)
    ecl_cursor = [int]$eclCursor
  }
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
  $stateAfterSearchToggle = Get-MapCellState -Label 'state-after-search-toggle'

  # Movement route -- bare key, then a dump-memory state read, NOTHING ELSE (no debugger-console)
  # between presses. This is the core v8 test: does dump-memory alone (repeated every key) still
  # allow 6/6 + N/N delivery like v7's single end-of-phase dump-memory call did?
  $moveRecords = [Collections.Generic.List[object]]::new()
  foreach ($key in $MovementKeys) {
    $idx = $moveRecords.Count
    $label = "move-{0:D2}-{1}" -f $idx, $key
    Start-Sleep -Milliseconds $MoveSettleMs
    $result = Send-KeyBare -Key $key -Label $label
    Start-Sleep -Milliseconds $MoveSettleMs
    $state = Get-MapCellState -Label "state-$label"
    $result['state'] = $state
    $moveRecords.Add($result) | Out-Null
  }

  # LOOK attempts -- bare key, then a state read, same pattern.
  $lookRecords = [Collections.Generic.List[object]]::new()
  for ($attempt = 1; $attempt -le $LookAttempts; $attempt++) {
    Start-Sleep -Milliseconds $LookSettleMs
    $result = Send-KeyBare -Key 'l' -Label "look-$attempt"
    Start-Sleep -Milliseconds $LookSettleMs
    $state = Get-MapCellState -Label "state-look-$attempt"
    $result['state'] = $state
    $lookRecords.Add($result) | Out-Null
  }

  $deliveredMoves = @($moveRecords | Where-Object { $_.delivered }).Count
  $deliveredLooks = @($lookRecords | Where-Object { $_.delivered }).Count
  $finalState = $moveRecords[-1].state
  $targetCellDescriptorHypothesis = 3
  $reachedTargetMaskedValue = @($moveRecords | Where-Object { $_.state.map_cell_masked_0x7f -eq $targetCellDescriptorHypothesis }).Count -gt 0
  $lookHitBranch3 = @($lookRecords | Where-Object { $_.state.map_cell_masked_0x7f -eq $targetCellDescriptorHypothesis }).Count -gt 0

  [ordered]@{
    schema_version = 1
    title = 'Pool of Radiance'
    purpose = 'v9 route-completion attempt: same as v8 (bare key delivery + per-key GameLink dump-memory state read, zero debugger-console interaction) but with much longer per-key settle time (MoveSettleMs/LookSettleMs) to test the hypothesis that SEARCH-mode per-cell processing (not key delivery) was swallowing rapid follow-up keys in v8, where map_cell_byte/ecl_cursor only changed once despite all 11 keys being delivered-and-consumed at the BIOS level'
    move_settle_ms = $MoveSettleMs
    look_settle_ms = $LookSettleMs
    stage_dir = $StageDir
    save_sha256 = $saveHash
    save_slot = $SaveSlotKey
    phase_log = $phaseLog
    load_target_reached = $loadTargetReached
    search_toggle_delivery = $searchDelivery
    state_after_search_toggle = $stateAfterSearchToggle
    move_records = $moveRecords
    look_records = $lookRecords
    delivered_moves = "$deliveredMoves/$($moveRecords.Count)"
    delivered_looks = "$deliveredLooks/$($lookRecords.Count)"
    final_state_after_moves = $finalState
    reached_target_masked_value_during_moves = $reachedTargetMaskedValue
    look_hit_branch3_masked_value = $lookHitBranch3
    claim_boundary = 'delivered = true means the BIOS keyboard ring buffer (physical 0x41A) changed in the post-press burst or 500ms settled read. map_cell_byte/map_cell_masked_0x7f come from the UNVERIFIED area-struct formula (MapCellAreaOffset=0xEE9E) carried over from tools/trace_pool_ecl18_route.ps1 -- treat as a candidate reading, not a promoted symbol, unless corroborated by an observed state transition in this run''s own data.'
  } | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $out 'route-complete-v9-trace.json') -Encoding utf8
  Write-Host "[pool-route-complete-v9] load_target_reached=$loadTargetReached delivered_moves=$deliveredMoves/$($moveRecords.Count) delivered_looks=$deliveredLooks/$($lookRecords.Count) reached_target=$reachedTargetMaskedValue look_hit_branch3=$lookHitBranch3 out=$out"
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
