param(
  [string]$StageDir = 'build\runtime-pool-ecl2-20-gamelink-20260717',
  [Parameter(Mandatory)][string]$OutDir,
  [string]$SaveSlotKey = 'i',
  [string]$ExpectedSaveSha256 = '8f944f055a6151b2a871a03ab41629959886879c2161804447eaa09852328619',
  [string[]]$MovementKeys = @('up','right','up','up','right','up'),
  [ValidateRange(1,10)][int]$LookAttempts = 5,
  [ValidateRange(1,1800)][int]$ExclusivityWaitTimeoutSec = 600,
  [ValidateRange(100,5000)][int]$PrePressSettleMs = 900,
  [ValidateRange(100,5000)][int]$PostPressSettleMs = 900
)

# v4 (Pool of Radiance route-completion round, 2026-07-22): per-movement-key POSITION probe.
#
# Extends tools/trace_pool_ecl2_20_operand_anchor_v3.ps1 (persistent dual-arm breakpoint,
# selective BPDEL of only the throwaway BPINT16 title-idle anchor, operand-parser breakpoint
# 30CF:0000 stays armed for the whole run) with a GameLink-dump-memory-based POSITION READ
# after EVERY individual movement/turn key and after every LOOK, not just at the end of the
# route. This directly answers this round's brief: isolate which step(s) of the proven-legal
# GEO2.DAX#20 6-key route ({UP}{RIGHT}{UP}{UP}{RIGHT}{UP}, verified by
# tools/find_geo_path.py --geo GEO2.DAX --block 20 --start 13,8 --target 13,10 --facing east)
# silently fail to advance the party's actual in-game cell.
#
# Position signal used: the same [0xC04F] "map cell" ECL location tools/trace_pool_ecl18_route.ps1's
# Capture-EclHostState function already computes (unproven live before this round -- no committed
# fixture referenced its map_cell_byte output). The formula (not reinvented here, copied verbatim):
#   MapCellAreaOffset = (0xC04F * 2 + 0x6E00) & 0xFFFF        (== 0xE69E)
#   map_cell_address   = (areaOffset + MapCellAreaOffset) & 0xFFFF
#   map_cell_byte       = RAM[areaSegment:map_cell_address]
# areaOffset/areaSegment come from the already-proven DGROUP+0x49D2 area pointer (same field v3's
# host-state check already uses for area_ecl_member_id). masked_map_cell = map_cell_byte & 0x7F is
# the value ECL2#20's own 21-way ON_GOTO dispatch selects on (AND #0x7F, [0xC04F] -> ON_GOTO), per
# docs/engine/research/pool-operand-parser-cs-ip-confirmed-20260722.json's control-flow decode.
#
# Reads use GameLink's own `dump-memory` (a raw shared-memory peek of guest RAM), NOT the debugger
# console -- proven in the 2026-07-21 "breakpoint-anchored pacing" round to work correctly whether
# the CPU is genuinely halted or genuinely running, sidestepping both the console-staleness bug
# (reads while running return a stale pre-boot snapshot) and the re-arm-unreliability bug (arming a
# NEW breakpoint from a free-running state is never serviced). No new breakpoints are armed or
# deleted after the single v3-proven setup sequence.
#
# GEO2.DAX#20 descriptor-3 cells reachable near the route: (13,9) and (13,10) both mask to 3 (see
# this round's manual decode of build/runtime-pool-ecl2-20-gamelink-20260717/POOLRAD/GEO2.DAX block
# 20 with tools/find_geo_path.py's own decode_descriptors -- descriptor 3 appears at (11,9) (12,9)
# (13,9) (11,10) (12,10) (13,10), of which only (13,9)/(13,10) are adjacent to the proven route). All
# other route cells -- (13,8) start, (14,8), (14,9), (14,10) -- mask to descriptor 0. This means a
# masked_map_cell reading of 3 at the END of the route is still ambiguous between the true target
# (13,10) and its neighbor (13,9) (both would dispatch to ON_GOTO index 3, so LOOK behavior alone
# cannot distinguish them either) -- but a reading of 0 anywhere after the third movement key proves
# the party has NOT yet reached either descriptor-3 cell, which is itself a useful, unambiguous
# negative result this round can act on.

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

$geoPath = Join-Path $stage 'POOLRAD\GEO2.DAX'
if (-not (Test-Path -LiteralPath $geoPath -PathType Leaf)) { throw "missing GEO2.DAX: $geoPath" }

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

# Reference descriptor grid for post-hoc interpretation (masked 0x7F, same mask ECL2#20's own
# ON_GOTO selector applies). Decoded by shelling out to the already-proven Python decoder
# (tools/goldbox_corpus.read_dax_blocks + tools/find_geo_path.decode_descriptors, which correctly
# handles the DAX container's RLE-compressed blocks and 9-byte TOC records) rather than
# reimplementing DAX/RLE parsing in PowerShell.
function Get-DescriptorGridJson {
  param([string]$Path)
  $pyOut = & python -c @'
import sys, json
sys.path.insert(0, "tools")
import goldbox_corpus
from find_geo_path import decode_descriptors
from pathlib import Path
block = next((b for b in goldbox_corpus.read_dax_blocks(Path(sys.argv[1])) if b["block_id"] == 20), None)
if block is None:
    print("null")
else:
    descs = decode_descriptors(block["raw"], 0x7F)
    print(json.dumps(descs))
'@ $Path
  if ($LASTEXITCODE -ne 0) { throw "descriptor grid decode failed for $Path" }
  return $pyOut
}

$stepCounter = 0
$allHits = [Collections.Generic.List[object]]::new()

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
  Write-Host '[pool-position-probe-v4] waiting for an empty dosbox-x.exe process list before launching...'
  $deadline = [DateTime]::UtcNow.AddSeconds($ExclusivityWaitTimeoutSec)
  while ([DateTime]::UtcNow -lt $deadline) {
    $pids = Get-DosboxPids
    if ($pids.Count -eq 0) { return }
    Write-Host "[pool-position-probe-v4] dosbox-x.exe already running (pid(s): $($pids -join ',')) -- waiting..."
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

$dsAssumed = 0x14A0
$MapCellVirtualAddress = 0xC04F
$MapCellAreaOffset = (($MapCellVirtualAddress * 2 + 0x6E00) -band 0xFFFF)

# Candidate DIRECT DGROUP-relative X/Y/facing/wallType/descriptor block, BORROWED from DoK's own
# independently disassembled GAME.OVR (docs/engine/research/dok-natural-route.md, "2026-07-17
# Update 3 -- DoK Live Position Telemetry"): DoK's real disassembly locates a flat host "map
# register" block at DGROUP 0xc073=mapPosX, 0xc074=mapPosY, 0xc075=facing, 0xc076=wallType,
# 0xc077=current GEO cell descriptor, where 0xc077 is proven (by that doc's own non-circular
# cross-check) to be the SAME address as ECL vaddr 0xC04F -- i.e. DoK's live_addr = vaddr + 0x28
# (0xC04F + 0x28 = 0xC077), a flat linear offset, NOT the save-file-offset formula
# ((location*2+0x6E00)&0xFFFF) used for MapCellAreaOffset above. This is a DIFFERENT, simpler
# addressing scheme than MapCellAreaOffset's, and it was established for DoK's specific compiled
# GAME.OVR, NOT Pool's -- Pool has its own distinct GAME.OVR with its own compiled addresses (e.g.
# Pool's operand parser is at a different file offset than DoK's). This round tests, but does NOT
# assume, that Pool's DGROUP layout puts the equivalent block at the same 0xc073..0xc077 offsets --
# plausible (same Gen1 engine generation, same [0xC04F] ECL-level convention already cross-title
# proven identical: CoK/DoK/Pool/Secret ECL scripts all read [C04F] the same way per
# docs/engine/research/{cok,dok,secret,pool}-natural-*route*.md), but genuinely UNVERIFIED for Pool
# before this round. Recorded plainly as a labeled hypothesis, cross-checked against the
# already-proven area-struct map_cell_byte reading and against expected coordinate ranges (x,y in
# 0..15 for a 16x16 GEO2.DAX#20 grid, facing in a small enum), not asserted as proven.
$DokBorrowedMapRegisterBase = 0xC073

function Get-PositionState {
  # Uses GameLink's own dump-memory (raw shared-memory peek), valid whether halted or running --
  # proven in the 2026-07-21 free-running-keybuffer round. Never issues a debugger console command,
  # so it cannot disturb the persistently-armed operand-parser breakpoint or the run/halt state.
  param([string]$Label)
  $ramPath = Join-Path $out "$Label.ram"
  & python $gameLink dump-memory $ramPath --start 0 --length 0x100000 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "dump-memory failed for $Label" }
  $ram = [IO.File]::ReadAllBytes($ramPath)
  $dgroupBase = [uint32]$dsAssumed -shl 4
  $areaPtrPhys = $dgroupBase + 0x49D2
  $areaOffset = [BitConverter]::ToUInt16($ram, [int]$areaPtrPhys)
  $areaSegment = [BitConverter]::ToUInt16($ram, [int]$areaPtrPhys + 2)
  $memberPhys = ([uint32]$areaSegment -shl 4) + [uint32]$areaOffset + 0x01E4
  $areaEclMemberId = $ram[[int]$memberPhys]
  $archiveSetPhys = $dgroupBase + 0x5376
  $archiveSet = $ram[[int]$archiveSetPhys]
  $mapCellAddress = ([uint32]$areaOffset + $MapCellAreaOffset) -band 0xFFFF
  $mapCellPhys = ([uint32]$areaSegment -shl 4) + $mapCellAddress
  $mapCellByte = $ram[[int]$mapCellPhys]
  # DoK-borrowed candidate block, read directly off DGROUP (dsAssumed), NOT the area struct.
  $dokBase = $dgroupBase + $DokBorrowedMapRegisterBase
  $dokX = $ram[[int]$dokBase]
  $dokY = $ram[[int]($dokBase + 1)]
  $dokFacing = $ram[[int]($dokBase + 2)]
  $dokWallType = $ram[[int]($dokBase + 3)]
  $dokDescriptor = $ram[[int]($dokBase + 4)]
  # Remove the RAM dump after decoding -- these are large (1 MiB) and git-ignored build output;
  # deleting keeps OutDir a manageable evidence set of small JSON/console files only.
  Remove-Item -LiteralPath $ramPath -Force -ErrorAction SilentlyContinue
  return [ordered]@{
    label = $Label
    method = 'GameLink dump-memory + fixed DS=14A0 assumed (same assumption v3 proved at load-target-check)'
    ds_segment = ('{0:X4}' -f $dsAssumed)
    area_segment = ('{0:X4}' -f $areaSegment)
    area_offset = ('{0:X4}' -f $areaOffset)
    area_ecl_member_id = [int]$areaEclMemberId
    archive_set = [int]$archiveSet
    map_cell_virtual_address = ('0x{0:X}' -f $MapCellVirtualAddress)
    map_cell_area_offset = ('0x{0:X}' -f $MapCellAreaOffset)
    map_cell_physical = ('0x{0:X5}' -f $mapCellPhys)
    map_cell_byte_raw = [int]$mapCellByte
    map_cell_byte_masked_0x7f = [int]($mapCellByte -band 0x7F)
    dok_borrowed_candidate = [ordered]@{
      claim_boundary = 'UNVERIFIED for Pool -- addresses established for DoK''s own compiled GAME.OVR, tested here against Pool''s DS=14A0-assumed DGROUP purely as a cross-title hypothesis'
      base_physical = ('0x{0:X5}' -f $dokBase)
      x = [int]$dokX
      y = [int]$dokY
      facing = [int]$dokFacing
      wall_type = [int]$dokWallType
      descriptor_raw = [int]$dokDescriptor
      descriptor_masked_0x7f = [int]($dokDescriptor -band 0x7F)
    }
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

  # Step 2: arm the operand-parser breakpoint while still confirmed halted.
  Invoke-DebuggerInput -Command 'BP 30CF:0000' -Label 'arm-operand-parser' | Out-Null
  $listSnap = Invoke-DebuggerInput -Command 'BPLIST' -Label 'list-both-armed'
  $phaseLog.Add([ordered]@{ phase = 'both-armed'; bplist = $listSnap }) | Out-Null

  # Step 3: selectively delete ONLY the BPINT16 entry (live index from BPLIST).
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
  $listBlocks = [regex]::Matches($listAfterDelete, 'Breakpoint list:\r?\n-+\r?\n((?:\d+\..*\r?\n)*)')
  if ($listBlocks.Count -eq 0) { throw 'could not find any Breakpoint list block in BPLIST output' }
  $finalListBlock = $listBlocks[$listBlocks.Count - 1].Groups[1].Value
  if ($finalListBlock -notmatch '30CF:0000') { throw "operand-parser breakpoint missing after selective delete -- aborting rather than proceeding blind. Final block: $finalListBlock" }
  if ($finalListBlock -match 'BPINT\s+16') { throw "BPINT16 still present after selective delete -- aborting rather than proceeding blind. Final block: $finalListBlock" }

  # Step 4: resume. No further arm/delete commands are ever issued.
  Invoke-DebuggerInput -Command 'RUN' -Label 'resume-after-setup' | Out-Null
  Start-Sleep -Seconds 1

  # Step 5: title dismiss + load menu, free-running paced keys.
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

  Start-Sleep -Seconds 5
  $loadHits = Drain-Hits -Label 'post-load-settle' -MaxWaitMs 5000 -QuietMs 1500
  $phaseLog.Add([ordered]@{ phase = 'post-load-settle'; hit_count = $loadHits.Count }) | Out-Null

  # Step 6: confirm load target + baseline position, via GameLink dump-memory (never the debugger
  # console, so this is safe regardless of current run/halt state).
  $baselinePosition = Get-PositionState -Label 'position-00-post-load'
  $loadTargetReached = $baselinePosition.area_ecl_member_id -eq 20 -and $baselinePosition.archive_set -eq 2
  $phaseLog.Add([ordered]@{ phase = 'load-target-check'; position = $baselinePosition; reached = $loadTargetReached }) | Out-Null
  if (-not $loadTargetReached) { throw "load target not reached: $($baselinePosition | ConvertTo-Json -Compress)" }

  # Step 7: toggle SEARCH mode.
  Start-Sleep -Seconds 1
  Send-Key -Key 's' -Label 'toggle-search'
  Start-Sleep -Seconds 1
  $searchToggleHits = Drain-Hits -Label 'toggle-search' -MaxWaitMs 3000 -QuietMs 1000
  $searchTogglePosition = Get-PositionState -Label 'position-01-post-search-toggle'
  $phaseLog.Add([ordered]@{ phase = 'toggle-search'; hit_count = $searchToggleHits.Count; position = $searchTogglePosition }) | Out-Null

  # Step 8: movement route, ONE key at a time, with an explicit position read after EACH key --
  # this round's primary deliverable. Longer settle margins than v3 (parameterized, default 900ms
  # each side) test the "per-key settle time too short" hypothesis directly; if positions still
  # fail to advance at this pace, settle time is refuted as the sole cause.
  $moveRecords = [Collections.Generic.List[object]]::new()
  foreach ($key in $MovementKeys) {
    $label = "move-{0:D2}-{1}" -f $moveRecords.Count, $key
    Start-Sleep -Milliseconds $PrePressSettleMs
    Send-Key -Key $key -Label $label
    Start-Sleep -Milliseconds $PostPressSettleMs
    $hits = Drain-Hits -Label $label -MaxWaitMs 4000 -QuietMs 1200
    $position = Get-PositionState -Label ("position-{0:D2}-{1}" -f ($moveRecords.Count + 2), $label)
    $moveRecords.Add([ordered]@{
      index = $moveRecords.Count
      key = $key
      hit_count = $hits.Count
      hits = $hits
      position = $position
    }) | Out-Null
  }

  # Step 9: LOOK to trigger search_location dispatch, with a position read after each attempt too.
  $lookRecords = [Collections.Generic.List[object]]::new()
  $searchLocationReached = $false
  $combatReached = $false
  for ($attempt = 1; $attempt -le $LookAttempts -and -not $combatReached; $attempt++) {
    Start-Sleep -Milliseconds 500
    Send-Key -Key 'l' -Label "look-$attempt"
    Start-Sleep -Milliseconds 500
    $hits = Drain-Hits -Label "look-$attempt" -MaxWaitMs 4000 -QuietMs 1200
    foreach ($hit in $hits) {
      if ($hit.raw_member_cursor) {
        $v = [uint16](($hit.raw_member_cursor - 2 - 0x6700) -band 0xFFFF)
        if ($v -ge 0x9975 -and $v -le 0xA0C0) { $searchLocationReached = $true }
        if ($v -eq 0xA0B3) { $combatReached = $true }
      }
    }
    $position = Get-PositionState -Label "position-look-$attempt"
    $lookRecords.Add([ordered]@{ attempt = $attempt; hit_count = $hits.Count; hits = $hits; position = $position }) | Out-Null
  }

  & python $gameLink screenshot (Join-Path $out 'final-state.png')

  # Reference descriptor grid, decoded from the staged retail GEO2.DAX block 20, masked 0x7F, for
  # interpreting the position sequence above without re-deriving it by hand each time.
  $descriptorReference = $null
  try {
    $descJson = Get-DescriptorGridJson -Path $geoPath
    $descFlat = $descJson | ConvertFrom-Json
    if ($null -ne $descFlat -and $descFlat.Count -eq 256) {
      $grid = @()
      for ($y = 0; $y -lt 16; $y++) {
        $row = @()
        for ($x = 0; $x -lt 16; $x++) { $row += [int]$descFlat[$y * 16 + $x] }
        $grid += ,$row
      }
      $descriptorReference = [ordered]@{
        note = 'masked (0x7F) descriptor grid, row = y (0..15), col = x (0..15), decoded from the staged retail GEO2.DAX block 20 via tools/find_geo_path.py decode_descriptors() (shelled out to Python -- avoids reimplementing DAX/RLE parsing in PowerShell)'
        grid = $grid
        route_cells = [ordered]@{
          '13,8_start'  = [int]$descFlat[8 * 16 + 13]
          '14,8'        = [int]$descFlat[8 * 16 + 14]
          '14,9'        = [int]$descFlat[9 * 16 + 14]
          '14,10'       = [int]$descFlat[10 * 16 + 14]
          '13,10_target' = [int]$descFlat[10 * 16 + 13]
          '13,9_neighbor_same_descriptor' = [int]$descFlat[9 * 16 + 13]
        }
      }
    }
  } catch {
    $descriptorReference = [ordered]@{ error = "descriptor grid decode failed: $($_.Exception.Message)" }
  }

  [ordered]@{
    schema_version = 1
    title = 'Pool of Radiance'
    technique = 'v3 persistent dual-arm breakpoint setup (unchanged) + per-movement-key GameLink dump-memory position reads of the [0xC04F]-derived map_cell_byte, not just at the end of the route'
    stage_dir = $StageDir
    save_sha256 = $saveHash
    save_slot = $SaveSlotKey
    pre_press_settle_ms = $PrePressSettleMs
    post_press_settle_ms = $PostPressSettleMs
    retail_parser_prologue_hex = $retailParserBytes
    phase_log = $phaseLog
    baseline_position = $baselinePosition
    load_target_reached = $loadTargetReached
    move_records = $moveRecords
    look_records = $lookRecords
    search_location_reached = $searchLocationReached
    combat_reached = $combatReached
    all_hits_count = $allHits.Count
    all_hits = $allHits
    descriptor_reference = $descriptorReference
    exclusive_ownership_maintained = $true
    claim_boundary = 'position readings are raw RAM bytes read via GameLink dump-memory at DS=14A0-derived DGROUP+0x49D2 area pointer, then the [0xC04F]-location formula from tools/trace_pool_ecl18_route.ps1 Capture-EclHostState (map_cell_area_offset=(0xC04F*2+0x6E00)&0xFFFF). This formula was coded in a prior round but never previously proven against live execution results (no committed fixture referenced its output) -- this run is that formula''s first live exercise. masked_map_cell values are diagnostic evidence for isolating the movement gap, not yet an independently cross-checked symbol promotion in their own right. dok_borrowed_candidate fields are a SEPARATE, simpler flat-DGROUP-offset hypothesis (DGROUP+0xc073..0xc077) borrowed from DoK''s own independently disassembled GAME.OVR, genuinely unverified for Pool''s own compiled binary; included as diagnostic cross-check data only, not a claimed symbol.'
  } | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $out 'position-probe-v4-trace.json') -Encoding utf8
  Write-Host "[pool-position-probe-v4] load_target_reached=$loadTargetReached search_location_reached=$searchLocationReached combat_reached=$combatReached all_hits=$($allHits.Count) out=$out"
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
