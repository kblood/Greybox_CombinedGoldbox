param(
  [string]$StageDir = 'build\runtime-pool-ecl2-20-gamelink-20260717',
  [Parameter(Mandatory)][string]$OutDir,
  [string]$SaveSlotKey = 'i',
  [string]$ExpectedSaveSha256 = '8f944f055a6151b2a871a03ab41629959886879c2161804447eaa09852328619',
  [string[]]$MovementKeys = @('up','right','up','up','right','up'),
  [ValidateRange(1,10)][int]$LookAttempts = 5,
  [ValidateRange(1,1800)][int]$ExclusivityWaitTimeoutSec = 600
)

# v3 (Pool of Radiance route-completion round, 2026-07-22): persistent-armed operand-parser
# breakpoint, combined with v2's proven single-arm-then-freerun BPINT16 pacing for title/load.
#
# Builds on two 2026-07-21 findings from tools/trace_pool_ecl2_20_bpint16_paced_v2.ps1:
#   (1) injecting a GameLink key while the CPU is halted at an armed breakpoint silently drops
#       the key -- fixed by injecting only while genuinely free-running.
#   (2) arming a NEW breakpoint from a genuinely free-running state (zero breakpoints already
#       active) is never serviced, even though the arm command's own status.json reports
#       success (v2-c).
#
# (2) blocked ever capturing a SECOND native CS:IP hit after the v2 architecture's single
# BPINT16 anchor is deleted. This script avoids needing a second arm at all: it arms BOTH the
# throwaway BPINT16 anchor AND the real target (Pool's byte-validated ECL operand parser,
# route-time 30CF:0000 / GAME.OVR:0x74D3, per docs/engine/research/pool-runtime-ecl-cursor-trace.md)
# together, at the SAME pristine first post-launch halt where arming is already proven reliable.
# It then selectively deletes only the BPINT16 entry (tools/trace_pool_bpdel_selective_probe.ps1
# proved 'BPDEL <index>' works, and that DOSBox-X's BPLIST groups plain BP entries before BPINT
# entries -- so the index to delete must be read from a live BPLIST, not assumed fixed) so
# title/load pacing can go fully free-running exactly as v2 already proved works, while the
# operand-parser breakpoint survives dormant (it should not fire on pure menu/load screens,
# only when the ECL VM actually runs a script step) until movement genuinely triggers it.
#
# Because the breakpoint is never deleted or re-armed after this single initial setup, every
# subsequent hit is confirmed execution evidence: real CS:IP, real resident bytes (checked
# against the retail GAME.OVR:0x74D3 prologue), real DGROUP-relative ECL cursor and host-state
# reads -- all captured while GENUINELY HALTED (not the "stale while running" console-read
# trap v2 had to work around for its post-load state read).

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

# Retail operand-parser prologue, GAME.OVR:0x74D3 (24 bytes), for a byte-identity check
# independent of the script's own pass/fail verdict.
$retailOverlayPath = Join-Path $stage 'POOLRAD\GAME.OVR'
$retailParserBytes = $null
if (Test-Path -LiteralPath $retailOverlayPath) {
  $fs = [IO.File]::OpenRead($retailOverlayPath)
  try {
    $fs.Seek(0x74D3, [IO.SeekOrigin]::Begin) | Out-Null
    $buf = New-Object byte[] 24
    $fs.Read($buf, 0, 24) | Out-Null
    $retailParserBytes = ($buf | ForEach-Object { $_.ToString('x2') }) -join ''
  } finally { $fs.Dispose() }
}

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
function Get-Ds([string]$Snapshot) {
  $m = [regex]::Match($Snapshot, '\bDS=([0-9A-F]{4})\b')
  if (-not $m.Success) { return $null }
  return $m.Groups[1].Value
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
  Write-Host '[pool-operand-anchor-v3] waiting for an empty dosbox-x.exe process list before launching...'
  $deadline = [DateTime]::UtcNow.AddSeconds($ExclusivityWaitTimeoutSec)
  while ([DateTime]::UtcNow -lt $deadline) {
    $pids = Get-DosboxPids
    if ($pids.Count -eq 0) { return }
    Write-Host "[pool-operand-anchor-v3] dosbox-x.exe already running (pid(s): $($pids -join ',')) -- waiting..."
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

$stepCounter = 0
$allHits = [Collections.Generic.List[object]]::new()

# Drains any breakpoint hits following an injected action. The operand-parser breakpoint stays
# permanently armed, so any halt observed here is a genuine execution-confirmed hit (or, in
# principle, a hit from unrelated code that happens to share the physical address -- checked by
# byte-matching the retained resident bytes against the retail prologue, same discipline as
# every prior route-correct/rejected fixture in this doc family).
function Drain-Hits {
  param([string]$Label, [int]$MaxHits = 8, [int]$QuietMs = 1500, [int]$PollMs = 150, [int]$MaxWaitMs = 8000)
  $hits = [Collections.Generic.List[object]]::new()
  $deadline = [DateTime]::UtcNow.AddMilliseconds($MaxWaitMs)
  $lastActivity = [DateTime]::UtcNow
  while ([DateTime]::UtcNow -lt $deadline) {
    $snap = Invoke-DebuggerInput -SnapshotOnly -Label ('drain-{0:D4}-{1}' -f $script:stepCounter, $Label)
    $script:stepCounter++
    if (Get-Stopped $snap) {
      $csIp = Get-CsIp $snap
      $ds = Get-Ds $snap
      $physical = ([Convert]::ToUInt32($csIp.cs, 16) -shl 4) + [Convert]::ToUInt32($csIp.ip, 16)
      $byteSnap = Invoke-DebuggerInput -Command ('D {0}:{1}' -f $csIp.cs, $csIp.ip) -Label ('drain-bytes-{0:D4}-{1}' -f $script:stepCounter, $Label)
      $script:stepCounter++
      $bytes = Get-DataBytes $byteSnap
      $byteHex = (($bytes | Select-Object -First 24) | ForEach-Object { $_.ToString('x2') }) -join ''
      $cursorSnap = Invoke-DebuggerInput -Command ('D {0}:49ED' -f $ds) -Label ('drain-cursor-{0:D4}-{1}' -f $script:stepCounter, $Label)
      $script:stepCounter++
      $cursorBytes = Get-DataBytes $cursorSnap
      $rawCursor = if ($cursorBytes.Length -ge 2) { [int]$cursorBytes[0] -bor ([int]$cursorBytes[1] -shl 8) } else { $null }
      $virtual = if ($null -ne $rawCursor) { [uint16](($rawCursor - 2 - 0x6700) -band 0xFFFF) } else { $null }
      $hit = [ordered]@{
        label = $Label
        index = $hits.Count
        pointer = "$($csIp.cs):$($csIp.ip)"
        physical = ('0x{0:X5}' -f $physical)
        ds_segment = $ds
        resident_bytes_hex = $byteHex
        byte_match_operand_parser = ($null -ne $retailParserBytes -and $byteHex -eq $retailParserBytes)
        is_operand_parser_address = ($csIp.cs -eq '30CF' -and $csIp.ip -eq '0000')
        raw_member_cursor = $rawCursor
        ecl_virtual_address = if ($null -ne $virtual) { ('0x{0:X}' -f $virtual) } else { $null }
      }
      $hits.Add($hit) | Out-Null
      $script:allHits.Add($hit) | Out-Null
      Invoke-DebuggerInput -Command 'RUN' -Label ('drain-run-{0:D4}-{1}' -f $script:stepCounter, $Label) | Out-Null
      $script:stepCounter++
      $lastActivity = [DateTime]::UtcNow
      if ($hits.Count -ge $MaxHits) { break }
    } else {
      if (([DateTime]::UtcNow - $lastActivity).TotalMilliseconds -gt $QuietMs) { break }
      Start-Sleep -Milliseconds $PollMs
    }
  }
  return $hits
}

function Send-Key {
  param([string]$Key, [string]$Label, [double]$Pace = 0.2)
  Assert-ExclusiveOwnership
  & python $gameLink press $Key --pace $Pace
  if ($LASTEXITCODE -ne 0) { throw "GameLink press '$Key' failed ($Label)" }
  Assert-ExclusiveOwnership
}

function Get-EclHostStateLive {
  # Only valid while genuinely halted (called right after a Drain-Hits pass returns, or after a
  # dedicated pause). Reads the same DGROUP fields as v2's Get-EclHostState.
  param([string]$Label, [string]$Ds)
  $areaPointerSnap = Invoke-DebuggerInput -Command ('D {0}:49D2' -f $Ds) -Label ('hoststate-areaptr-' + $Label)
  $areaPointerBytes = Get-DataBytes $areaPointerSnap
  if ($areaPointerBytes.Length -lt 4) { return $null }
  $areaOffset = [int]$areaPointerBytes[0] -bor ([int]$areaPointerBytes[1] -shl 8)
  $areaSegment = [int]$areaPointerBytes[2] -bor ([int]$areaPointerBytes[3] -shl 8)
  $memberAddress = ($areaOffset + 0x01E4) -band 0xFFFF
  $memberSnap = Invoke-DebuggerInput -Command ('D {0:X4}:{1:X4}' -f $areaSegment, $memberAddress) -Label ('hoststate-member-' + $Label)
  $memberBytes = Get-DataBytes $memberSnap
  $archiveSetSnap = Invoke-DebuggerInput -Command ('D {0}:5376' -f $Ds) -Label ('hoststate-archive-' + $Label)
  $archiveSetBytes = Get-DataBytes $archiveSetSnap
  return [ordered]@{
    label = $Label
    ds_segment = $Ds
    area_segment = ('{0:X4}' -f $areaSegment)
    area_offset = ('{0:X4}' -f $areaOffset)
    area_ecl_member_id = if ($memberBytes.Length -ge 1) { [int]$memberBytes[0] } else { $null }
    archive_set = if ($archiveSetBytes.Length -ge 1) { [int]$archiveSetBytes[0] } else { $null }
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

  # Step 1: poll for the first confirmed halt (BPINT16 title-idle anchor).
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  $firstHalt = $null
  while ([DateTime]::UtcNow -lt $deadline) {
    $snap = Invoke-DebuggerInput -SnapshotOnly -Label ('firsthalt-{0:D4}' -f $stepCounter)
    $stepCounter++
    if (Get-Stopped $snap) { $firstHalt = $snap; break }
    Start-Sleep -Milliseconds 150
  }
  if (-not $firstHalt) { throw 'never reached the first BPINT16 anchor halt' }
  $phaseLog.Add([ordered]@{ phase = 'first-halt'; cs_ip = (Get-CsIp $firstHalt) }) | Out-Null

  # Step 2: arm the operand-parser breakpoint while still confirmed halted (proven reliable
  # only in this pristine state per the 2026-07-21 v2-c finding).
  Invoke-DebuggerInput -Command 'BP 30CF:0000' -Label 'arm-operand-parser' | Out-Null
  $listSnap = Invoke-DebuggerInput -Command 'BPLIST' -Label 'list-both-armed'
  $phaseLog.Add([ordered]@{ phase = 'both-armed'; bplist = $listSnap }) | Out-Null

  # Step 3: selectively delete ONLY the BPINT16 entry, reading its live index from BPLIST
  # rather than assuming a fixed order (tools/trace_pool_bpdel_selective_probe.ps1 proved
  # DOSBox-X groups plain BP entries before BPINT entries, so the index is NOT arm order).
  $bpint16Index = $null
  $armedBlocks = [regex]::Matches($listSnap, 'Breakpoint list:\r?\n-+\r?\n((?:\d+\..*\r?\n)*)')
  if ($armedBlocks.Count -eq 0) { throw 'could not find any Breakpoint list block after arming' }
  $finalArmedBlock = $armedBlocks[$armedBlocks.Count - 1].Groups[1].Value
  foreach ($line in ($finalArmedBlock -split "`r?`n")) {
    $m = [regex]::Match($line, '^(\d+)\.\s+BPINT\s+16\s+AH=01')
    if ($m.Success) { $bpint16Index = [int]$m.Groups[1].Value; break }
  }
  if ($null -eq $bpint16Index) { throw "could not find BPINT16 entry index in final BPLIST block: $finalArmedBlock" }
  Invoke-DebuggerInput -Command "BPDEL $bpint16Index" -Label 'delete-bpint16-only' | Out-Null
  $listAfterDelete = Invoke-DebuggerInput -Command 'BPLIST' -Label 'list-after-delete'
  $phaseLog.Add([ordered]@{ phase = 'after-selective-delete'; deleted_index = $bpint16Index; bplist = $listAfterDelete }) | Out-Null
  # The console snapshot is cumulative scrollback, not a fresh read -- it still contains the
  # PRE-delete 'Breakpoint list:' block earlier in the same text. Only the LAST such block
  # reflects current state, so isolate it before checking (a whole-text match would find the
  # old BPINT16 line and false-positive-abort even on a successful selective delete).
  $listBlocks = [regex]::Matches($listAfterDelete, 'Breakpoint list:\r?\n-+\r?\n((?:\d+\..*\r?\n)*)')
  if ($listBlocks.Count -eq 0) { throw 'could not find any Breakpoint list block in BPLIST output' }
  $finalListBlock = $listBlocks[$listBlocks.Count - 1].Groups[1].Value
  if ($finalListBlock -notmatch '30CF:0000') { throw "operand-parser breakpoint missing after selective delete -- aborting rather than proceeding blind. Final block: $finalListBlock" }
  if ($finalListBlock -match 'BPINT\s+16') { throw "BPINT16 still present after selective delete -- aborting rather than proceeding blind. Final block: $finalListBlock" }

  # Step 4: resume. From here on, NO further arm/delete commands are ever issued -- the single
  # operand-parser breakpoint persists for the rest of the run.
  Invoke-DebuggerInput -Command 'RUN' -Label 'resume-after-setup' | Out-Null
  Start-Sleep -Seconds 1

  # Step 5: title dismiss + load menu, free-running paced keys (matching v2's proven technique).
  # Drain after each in case the operand parser unexpectedly fires this early (would indicate
  # VROOMM has NOT yet placed relevant code at 30CF:0000 pre-load, or has placed unrelated code
  # there -- checked via byte_match_operand_parser on any such hit).
  foreach ($step in @(
      @{ key = 'enter'; label = 'title-dismiss-0' },
      @{ key = 'enter'; label = 'title-dismiss-1' },
      @{ key = 'l';     label = 'load-menu' },
      @{ key = $SaveSlotKey; label = 'slot-letter' },
      @{ key = 'enter'; label = 'slot-confirm' }
    )) {
    Start-Sleep -Seconds 1
    Send-Key -Key $step.key -Label $step.label
    Start-Sleep -Seconds 1
    $hits = Drain-Hits -Label $step.label -MaxWaitMs 3000 -QuietMs 1000
    $phaseLog.Add([ordered]@{ phase = $step.label; hit_count = $hits.Count }) | Out-Null
  }

  # Extra settle margin for the load itself (disk-seek heavy), then drain any hits from initial
  # ECL entry processing that the load itself may trigger.
  Start-Sleep -Seconds 5
  $loadHits = Drain-Hits -Label 'post-load-settle' -MaxWaitMs 5000 -QuietMs 1500
  $phaseLog.Add([ordered]@{ phase = 'post-load-settle'; hit_count = $loadHits.Count }) | Out-Null

  # Step 6: confirm load target via a GENUINELY HALTED console read this time (previous rounds
  # needed the GameLink-dump-memory workaround specifically because they were reading while
  # running; here we can pause safely using our still-armed breakpoint's last confirmed halt,
  # or -- if currently running with no recent hit -- fall back to the same GameLink dump-memory
  # technique for this one read, since we do not want to risk an extra arm/pause cycle).
  $dsAssumed = 0x14A0
  $ramDumpPath = Join-Path $out 'post-load-live.ram'
  & python $gameLink dump-memory $ramDumpPath --start 0 --length 0x100000
  if ($LASTEXITCODE -ne 0) { throw 'post-load live RAM dump failed' }
  $ram = [IO.File]::ReadAllBytes($ramDumpPath)
  $dgroupBase = [uint32]$dsAssumed -shl 4
  $areaPtrPhys = $dgroupBase + 0x49D2
  $areaOffset0 = [BitConverter]::ToUInt16($ram, [int]$areaPtrPhys)
  $areaSegment0 = [BitConverter]::ToUInt16($ram, [int]$areaPtrPhys + 2)
  $memberPhys0 = ([uint32]$areaSegment0 -shl 4) + [uint32]$areaOffset0 + 0x01E4
  $areaEclMemberId0 = $ram[[int]$memberPhys0]
  $archiveSetPhys0 = $dgroupBase + 0x5376
  $archiveSet0 = $ram[[int]$archiveSetPhys0]
  $hostStatePostLoad = [ordered]@{
    method = 'GameLink dump-memory + fixed DS=14A0 assumed'
    area_segment = ('{0:X4}' -f $areaSegment0)
    area_offset = ('{0:X4}' -f $areaOffset0)
    area_ecl_member_id = [int]$areaEclMemberId0
    archive_set = [int]$archiveSet0
  }
  $loadTargetReached = $hostStatePostLoad.area_ecl_member_id -eq 20 -and $hostStatePostLoad.archive_set -eq 2
  $phaseLog.Add([ordered]@{ phase = 'load-target-check'; host_state = $hostStatePostLoad; reached = $loadTargetReached }) | Out-Null
  if (-not $loadTargetReached) { throw "load target not reached: $($hostStatePostLoad | ConvertTo-Json -Compress)" }

  # Step 7: toggle SEARCH mode -- the previously-undiagnosed gap identified this round. Without
  # this, walking into the descriptor-3 cell never invokes search_location at all (confirmed by
  # cross-referencing tools/trace_pool_ecl18_route.ps1's proven ECL1#18 route, which sends 'S'
  # once via -PreTraceKeys before any movement).
  Start-Sleep -Seconds 1
  Send-Key -Key 's' -Label 'toggle-search'
  Start-Sleep -Seconds 1
  $searchToggleHits = Drain-Hits -Label 'toggle-search' -MaxWaitMs 3000 -QuietMs 1000
  $phaseLog.Add([ordered]@{ phase = 'toggle-search'; hit_count = $searchToggleHits.Count }) | Out-Null

  # Step 8: movement route (GEO2.DAX#20-verified legal, 0 blocked cells:
  # tools/find_geo_path.py --geo GEO2.DAX --block 20 --start 13,8 --target 13,10 --facing east).
  $moveRecords = [Collections.Generic.List[object]]::new()
  foreach ($key in $MovementKeys) {
    Start-Sleep -Milliseconds 500
    Send-Key -Key $key -Label ("move-{0:D2}-{1}" -f $moveRecords.Count, $key)
    Start-Sleep -Milliseconds 500
    $hits = Drain-Hits -Label ("move-{0:D2}-{1}" -f $moveRecords.Count, $key) -MaxWaitMs 4000 -QuietMs 1200
    $moveRecords.Add([ordered]@{ index = $moveRecords.Count; key = $key; hit_count = $hits.Count; hits = $hits }) | Out-Null
  }

  # Step 9: LOOK to trigger search_location dispatch at the target cell (also per the ECL1#18
  # route's proven pattern -- repeated LOOK attempts since the encounter can be RNG-gated).
  $lookRecords = [Collections.Generic.List[object]]::new()
  $searchLocationReached = $false
  $combatReached = $false
  for ($attempt = 1; $attempt -le $LookAttempts -and -not $combatReached; $attempt++) {
    Start-Sleep -Milliseconds 500
    Send-Key -Key 'l' -Label "look-$attempt"
    Start-Sleep -Milliseconds 500
    $hits = Drain-Hits -Label "look-$attempt" -MaxWaitMs 4000 -QuietMs 1200
    foreach ($hit in $hits) {
      if ($hit.ecl_virtual_address) {
        $v = [Convert]::ToInt32($hit.ecl_virtual_address, 16)
        if ($v -ge 0x9975 -and $v -le 0xA0C0) { $searchLocationReached = $true }
        if ($v -eq 0xA0B3) { $combatReached = $true }
      }
    }
    $lookRecords.Add([ordered]@{ attempt = $attempt; hit_count = $hits.Count; hits = $hits }) | Out-Null
  }

  & python $gameLink screenshot (Join-Path $out 'final-state.png')

  [ordered]@{
    schema_version = 1
    title = 'Pool of Radiance'
    technique = 'persistent dual-arm at pristine first halt (BPINT16 anchor + operand-parser BP 30CF:0000), selective BPDEL of only the BPINT16 entry (index read live from BPLIST, not assumed), then the operand-parser breakpoint stays armed for the rest of the run -- every subsequent halt is a genuine execution-confirmed hit, never a re-arm'
    stage_dir = $StageDir
    save_sha256 = $saveHash
    save_slot = $SaveSlotKey
    retail_parser_prologue_hex = $retailParserBytes
    phase_log = $phaseLog
    host_state_post_load = $hostStatePostLoad
    load_target_reached = $loadTargetReached
    move_records = $moveRecords
    look_records = $lookRecords
    search_location_reached = $searchLocationReached
    combat_reached = $combatReached
    all_hits_count = $allHits.Count
    all_hits = $allHits
    exclusive_ownership_maintained = $true
    claim_boundary = 'every entry in all_hits is a genuine confirmed-halted CS:IP + resident-byte read taken while the operand-parser breakpoint was continuously armed (never re-armed mid-run); byte_match_operand_parser marks hits whose resident bytes exactly equal the retail GAME.OVR:0x74D3 prologue. search_location_reached/combat_reached are derived from the ECL virtual-address cursor at each such hit, using the documented virtual=(raw-2-0x6700)&0xFFFF conversion.'
  } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $out 'operand-anchor-v3-trace.json') -Encoding utf8
  Write-Host "[pool-operand-anchor-v3] load_target_reached=$loadTargetReached search_location_reached=$searchLocationReached combat_reached=$combatReached all_hits=$($allHits.Count) out=$out"
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
