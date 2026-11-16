# trace_dok_position_telemetry_slota.ps1 -- reconstruction of the earlier (superseded, never
# committed) multi-checkpoint capture technique referenced in
# docs/engine/research/dok-natural-route.md's "2026-07-17 Update 3" closing paragraph: "an
# earlier (superseded) multi-checkpoint version of this round's script did capture successfully
# mid-session (DS=13F2, pos_x=14, pos_y=14, facing=East -- a plausible pre-load default, not yet
# the target spawn state, but proof the address mapping itself produces sane, non-garbage live
# values)".
#
# That earlier version was never committed (git log --follow on trace_dok_position_telemetry.ps1
# shows a single commit, 96c3452, which already contains the FINAL free-run + INT8-fallback form;
# the multi-checkpoint intermediate that produced the DS=13F2 result only ever existed
# uncommitted). Its dead skeleton is still visible, though: the committed script's own
# `Get-PositionSnapshot` function (CMD_Goto-post-combine-breakpoint-anchored, exactly the
# `tools/trace_dok_goto_operand.ps1` technique) is defined but never called anywhere in the
# script's own control flow, and references an `$execBp` variable that is never assigned in that
# file -- i.e. it is exactly the vestigial remnant of the earlier per-step-checkpoint design,
# left in place but disconnected when the script was rewritten to the free-run-then-INT8-fallback
# shape for the (separately blocked) spawn-screen goal. This script re-wires that same technique
# properly (a real `$execBp`, armed once via `BP <destSeg>:00B6`, then queried after each
# menu-navigation keypress) and reproduces the select-slot-a capture end to end.
#
# Purpose: confirm/refute whether the DS=13F2 x=14 y=14 facing=East reading is a genuine,
# reproducible LIVE checkpoint (not a one-off fluke or a stale snapshot-parsing bug), and then
# reason about whether it is MEANINGFUL position data (the party's real, save-loaded position) or
# a pre-init default that merely looks plausible. This script does NOT itself answer that
# question -- it only produces the twice-reproduced raw evidence; the accompanying doc update
# does the reasoning.
#
# Captures three checkpoints per run, all anchored on the same CMD_Goto post-combine breakpoint
# already proven (twice, in the committed script) to resolve DoK's live DGROUP segment reliably:
#   1. select-death-knights -- one step BEFORE slot selection (baseline/context).
#   2. select-slot-a         -- the target checkpoint this task investigates.
#   3. nav-begin-adventuring -- one step AFTER slot selection, still ordinary menu-cursor
#                                navigation (NOT selecting "BEGIN ADVENTURING" itself -- this
#                                script deliberately stops before the world-init dispatch that
#                                Update 3 already proved does not route through CMD_Goto).
# Comparing the three tells us whether these live bytes are static across the menu flow (evidence
# they are an untouched pre-init default) or actively changing (evidence something in the menu
# system is writing them, which would itself need explaining before trusting them as "position").

param(
  [string]$StageDir = 'build\runtime-dok-postel-20260717',
  [Parameter(Mandatory)][string]$OutDir,
  [ValidateRange(1,80)][int]$MaxSeeks = 60,
  [ValidateRange(5,60)][int]$FirstSeekTimeoutSeconds = 25,
  [ValidateRange(1,15)][int]$NextSeekTimeoutSeconds = 6,
  [ValidateRange(1,60)][int]$PerStepHitTimeoutSeconds = 12
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function Resolve-RepoPath([string]$Path) {
  $candidate = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repo $Path }
  return [IO.Path]::GetFullPath($candidate)
}

# Same CMD_Goto descriptor/offset constants as tools/trace_dok_goto_operand.ps1 and
# tools/trace_dok_position_telemetry.ps1 (twice-reproduced 2026-07-17 in both).
$CmdGotoTargetKey = '0x81D'
$CmdGotoCodeSize = 0x315b
$CmdGotoEntryRelOffset = 0x9b
$CmdGotoPostCombineRelOffset = 0xb6

# Position/pose telemetry addresses, statically located 2026-07-17 (see
# tools/trace_dok_position_telemetry.ps1's header comment for the disassembly evidence).
$PosXAddr = 0xc073
$PosYAddr = 0xc074
$FacingAddr = 0xc075
$WallTypeAddr = 0xc076
$CellDescriptorAddr = 0xc077
$PositionDirtyFlagAddr = 0xdb75

$stage = (Resolve-Path -LiteralPath (Resolve-RepoPath $StageDir)).Path
$out = Resolve-RepoPath $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
New-Item -ItemType Directory -Path $out | Out-Null
$manifestPath = Join-Path $stage 'dok-stage-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$expected = @{
  'START.EXE' = '91b672327e7a950bcf8f044990156bbe254103c79820a4b07433aee86d3dde40'
  'GAME.OVR'  = 'fdbe7265ac9b04c67f8648331d9845bf33c6a1438e676389eae3f4526796c817'
}
foreach ($name in $expected.Keys) {
  $actual = (Get-FileHash -LiteralPath (Join-Path $stage $name) -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected[$name]) { throw "DoK stage hash mismatch: $name" }
}
$saveHash = (Get-FileHash -LiteralPath (Join-Path $stage 'SAVE\SAVGAMA.PTY') -Algorithm SHA256).Hash.ToLowerInvariant()
$overlayBytes = [IO.File]::ReadAllBytes((Join-Path $stage 'GAME.OVR'))

$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$helperProject = Join-Path $repo 'tools\dosbox_debugger_input\DosboxDebuggerInput.csproj'
$helperDll = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'
& dotnet build $helperProject --configuration Release | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'debugger helper build failed' }

. (Join-Path $repo 'tools\dosbot\lib.ps1')

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
    ah = $ah; is_ah42 = ($ah -eq 0x42); handle = $ebx; seek_offset = $seekOffset
    cs = $regs['CS']; eip = $regs['EIP']
  }
}

function Get-DebuggerDataBytes {
  param([string]$Snapshot)
  $bytes = [Collections.Generic.List[byte]]::new()
  foreach ($line in ($Snapshot -split "`r?`n")) {
    $m = [regex]::Match($line, '^[0-9A-F]{4}:[0-9A-F]{8}\s+((?:[0-9A-F]{2}\s+){15}[0-9A-F]{2})\s')
    if (-not $m.Success) { continue }
    foreach ($hex in ($m.Groups[1].Value -split '\s+')) { if ($hex) { $bytes.Add([Convert]::ToByte($hex, 16)) } }
  }
  return ,$bytes.ToArray()
}

# The re-wired version of the committed script's dead `Get-PositionSnapshot`: takes $ExecBp
# explicitly (the committed version referenced an undefined `$execBp`, the actual bug that
# stranded this function as dead code), and does NOT throw on a timeout -- returns $null so the
# caller can tell "no hit" apart from "hit but truly failed", matching this task's requirement to
# be honest about what was and wasn't captured rather than forcing every step to succeed.
function Get-CheckpointSnapshot {
  param([string]$Label, [string]$ExecBp, [int]$TimeoutSeconds = 12)
  Invoke-DebuggerInput -Command 'RUN' -Label "$Label-run" | Out-Null
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $addr = $null
  $snapshot = $null
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 150
    $snapshot = Invoke-DebuggerInput -Command '' -Label "$Label-poll" -SnapshotOnly
    if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
    $addr = Get-DebuggerAddress $snapshot
    if ($addr -eq $ExecBp) { break }
    # Some other trap (shouldn't happen -- only one BP armed); keep running rather than get stuck.
    Invoke-DebuggerInput -Command 'RUN' -Label "$Label-run-again" | Out-Null
    $addr = $null
  }
  if ($addr -ne $ExecBp) {
    Write-Host ("[dok-pos-slota]   {0}: no CMD_Goto hit within {1}s" -f $Label, $TimeoutSeconds)
    return $null
  }
  [IO.File]::WriteAllText((Join-Path $out "$Label-hit-console.txt"), $snapshot, [Text.UTF8Encoding]::new($false))
  $dsMatch = [regex]::Match($snapshot, '\bDS=([0-9A-F]{4})\b')
  if (-not $dsMatch.Success) { throw "no DS in snapshot: $Label" }
  $ds = $dsMatch.Groups[1].Value
  $posDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $ds, $PosXAddr) -Label "$Label-pos"
  $posBytes = Get-DebuggerDataBytes $posDump
  $flagDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $ds, $PositionDirtyFlagAddr) -Label "$Label-flag"
  $flagBytes = Get-DebuggerDataBytes $flagDump
  # CRITICAL (same bug class fixed in the committed script): resume BEFORE returning, or the
  # caller's next Send-DosKeys races a halted guest and its keypress is silently dropped.
  Invoke-DebuggerInput -Command 'RUN' -Label "$Label-post-resume" | Out-Null
  return [ordered]@{
    label = $Label
    hit = $true
    cs_ip = $addr
    ds = $ds
    pos_x_0xc073 = [int]$posBytes[0]
    pos_y_0xc074 = [int]$posBytes[1]
    facing_0xc075 = [int]$posBytes[2]
    facing_compass = @{0='N';2='E';4='S';6='W'}[[int]$posBytes[2]]
    wall_type_0xc076 = [int]$posBytes[3]
    cell_descriptor_0xc077 = [int]$posBytes[4]
    position_dirty_flag_0xdb75 = [int]$flagBytes[0]
  }
}

try {
  & $probe -DbxExe $dbx -GameDir $stage -Exe 'START.EXE' -OutDir $out `
    -Cycles 'fixed 25000' -DebuggerAction @('BPINT 21 42', 'RUN') `
    -NoInitialScreenshots -NoActionScreenshots
  if (-not $?) { throw 'DoK DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  $renderRecord = @($metadata.windows | Where-Object role -eq 'render')
  if ($renderRecord.Count -ne 1) { throw 'expected exactly one render window' }
  $renderHwnd = [IntPtr]([int64]$renderRecord[0].hwnd)

  # --- Phase 1: seek capture -> resolve CMD_Goto's runtime destination segment -----------------
  # Identical to the committed script's own Phase 1 (already twice-reproduced there).
  $destinationSegment = $null
  $seekIndex = 0
  $deadline = [DateTime]::UtcNow.AddSeconds($FirstSeekTimeoutSeconds)
  while (-not $destinationSegment -and $seekIndex -lt $MaxSeeks -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 100
    $snapshot = Invoke-DebuggerInput -Command '' -Label 'seek-poll' -SnapshotOnly
    if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
    $fields = Get-SeekFields -Snapshot $snapshot
    if (-not $fields -or -not $fields.is_ah42) { throw "trace stopped somewhere other than INT 21h/AH=42 at seek index $seekIndex" }
    $seekOffsetHex = '0x{0:X}' -f $fields.seek_offset
    Write-Host ("[dok-pos-slota] seek {0}: handle={1} offset={2}" -f $seekIndex, $fields.handle, $seekOffsetHex)
    if ($fields.handle -eq 5 -and $seekOffsetHex -eq $CmdGotoTargetKey) {
      $destinationMatch = [regex]::Match($snapshot, 'es:\[0010\]=([0-9A-F]{4})')
      if (-not $destinationMatch.Success) { throw 'seek snapshot lacks destination segment annotation' }
      $destinationSegment = $destinationMatch.Groups[1].Value
      $seekCsMatch = [regex]::Match($snapshot, '\bCS=([0-9A-F]{4})\s+EIP=([0-9A-F]{8})\b')
      $loaderCs = $seekCsMatch.Groups[1].Value
      $seekEip = [Convert]::ToUInt32($seekCsMatch.Groups[2].Value, 16)
      $postRead = '{0}:{1:X4}' -f $loaderCs, ($seekEip + 0x12)
      Invoke-DebuggerInput -Command "BP $postRead" -Label 'postread-arm' | Out-Null
      Invoke-DebuggerInput -Command 'RUN' -Label 'postread-run' | Out-Null
      $postReadDeadline = [DateTime]::UtcNow.AddSeconds(10)
      $postReadAddress = $null
      while ([DateTime]::UtcNow -lt $postReadDeadline) {
        Start-Sleep -Milliseconds 100
        $postReadSnapshot = Invoke-DebuggerInput -Command '' -Label 'postread-poll' -SnapshotOnly
        if ($postReadSnapshot -match '(?m)^\(Running\)\s*$') { continue }
        $postReadAddress = Get-DebuggerAddress $postReadSnapshot
        break
      }
      if ($postReadAddress -ne $postRead) { throw "expected post-read breakpoint at $postRead, stopped at $postReadAddress" }
      break
    }
    $seekIndex++
    Invoke-DebuggerInput -Command 'RUN' -Label 'seek-continue' | Out-Null
    $deadline = [DateTime]::UtcNow.AddSeconds($NextSeekTimeoutSeconds)
  }
  if (-not $destinationSegment) { throw "CMD_Goto overlay descriptor not observed within $MaxSeeks seeks" }
  Write-Host ("[dok-pos-slota] CMD_Goto runtime destination segment: {0}" -f $destinationSegment)

  $entryDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $destinationSegment, $CmdGotoEntryRelOffset) -Label 'cmd-goto-entry-bytematch'
  $entryBytes = Get-DebuggerDataBytes $entryDump
  $entryFileOffset = [Convert]::ToInt32($CmdGotoTargetKey, 16) + $CmdGotoEntryRelOffset
  $entryExpected = $overlayBytes[$entryFileOffset..($entryFileOffset + $entryBytes.Count - 1)]
  $entryExactMatch = (([Convert]::ToHexString([byte[]]$entryBytes)).ToLowerInvariant() -eq ([Convert]::ToHexString([byte[]]$entryExpected)).ToLowerInvariant())
  if (-not $entryExactMatch) { throw 'CMD_Goto entry byte-match failed -- destSeg does not hold expected resident code' }
  Write-Host '[dok-pos-slota] CMD_Goto entry byte-match: true'

  # --- Phase 2: arm the post-combine execution breakpoint ONCE and leave it armed for the whole
  # menu-navigation run. Every keypress is preceded by an explicit RUN so a CMD_Goto hit that fired
  # spontaneously while we were sleeping (proven to happen constantly, per
  # tools/trace_dok_goto_operand.ps1) can never leave the CPU paused across a keypress -- this is
  # the exact automation bug the committed script's header comment documents and fixes; the fix is
  # applied uniformly here to every step, not just the ones that read memory.
  Invoke-DebuggerInput -Command 'BPDEL *' -Label 'clear-seek-trap' | Out-Null
  $execBp = '{0}:{1:X4}' -f $destinationSegment, $CmdGotoPostCombineRelOffset
  Invoke-DebuggerInput -Command "BP $execBp" -Label 'arm-postcombine-bp' | Out-Null
  Invoke-DebuggerInput -Command 'RUN' -Label 'postcombine-first-run' | Out-Null
  Start-Sleep -Milliseconds 1500

  # Same deterministic cold-boot-to-main-menu-to-slot-select sequence proven twice in the committed
  # script (3x dismiss ENTER for title/credits/banner, DOWN DOWN to LOAD SAVED GAME, ENTER, ENTER
  # for DEATH KNIGHTS, ENTER for slot A already-highlighted, DOWN x5 toward BEGIN ADVENTURING).
  # This script stops at "nav-begin-adventuring" -- it does NOT press ENTER to actually begin
  # adventuring, staying out of the already-investigated (and separately blocked) eulogy/narrative
  # territory per this task's explicit scope.
  # Checkpoint at EVERY step, not just select-slot-a: this is what actually revealed the finding
  # below (an early version of this script checkpointed only the last three steps and always came
  # up empty, giving no way to tell "CMD_Goto never fires here" apart from "CMD_Goto fires but not
  # within our per-step timeout window"). Checkpointing every step distinguishes the two.
  $steps = @(
    @{ keys = '{ENTER}'; label = 'dismiss-title'; checkpoint = $true },
    @{ keys = '{ENTER}'; label = 'dismiss-credits'; checkpoint = $true },
    @{ keys = '{ENTER}'; label = 'skip-credits'; checkpoint = $true },
    @{ keys = '{DOWN}{DOWN}'; label = 'nav-load-saved-game'; checkpoint = $true },
    @{ keys = '{ENTER}'; label = 'select-load-saved-game'; checkpoint = $true },
    @{ keys = '{ENTER}'; label = 'select-death-knights'; checkpoint = $true },
    @{ keys = '{ENTER}'; label = 'select-slot-a'; checkpoint = $true },
    @{ keys = '{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}'; label = 'nav-begin-adventuring'; checkpoint = $true }
  )
  $checkpoints = [System.Collections.Generic.List[object]]::new()
  foreach ($step in $steps) {
    # Always ensure the CPU is running before sending a key, regardless of whether the PREVIOUS
    # step read memory (which already resumes) or not (where a spontaneous CMD_Goto hit could have
    # paused it while we were sleeping).
    Invoke-DebuggerInput -Command 'RUN' -Label "$($step.label)-preresume" | Out-Null
    Send-DosKeys -Hwnd $renderHwnd -Keys $step.keys
    if ($step.checkpoint) {
      Write-Host ("[dok-pos-slota] checkpoint: {0}" -f $step.label)
      $cp = Get-CheckpointSnapshot -Label $step.label -ExecBp $execBp -TimeoutSeconds $PerStepHitTimeoutSeconds
      $checkpoints.Add([ordered]@{ label = $step.label; snapshot = $cp })
      if ($cp) {
        Write-Host ("[dok-pos-slota]   ds={0} x={1} y={2} facing={3}({4}) wall={5} cell={6} dirty={7}" -f `
          $cp.ds, $cp.pos_x_0xc073, $cp.pos_y_0xc074, $cp.facing_0xc075, $cp.facing_compass, $cp.wall_type_0xc076, $cp.cell_descriptor_0xc077, $cp.position_dirty_flag_0xdb75)
      }
    } else {
      Start-Sleep -Milliseconds $step.settleMs
    }
  }

  try {
    Capture-DosboxPrintWindow -Hwnd $renderHwnd -OutPng (Join-Path $out 'post-nav-begin-adventuring-screen.png') | Out-Null
  } catch {
    Write-Host "[dok-pos-slota] WARN: screenshot capture failed (non-fatal): $($_.Exception.Message)"
  }

  $slotACheckpoint = ($checkpoints | Where-Object { $_.label -eq 'select-slot-a' } | Select-Object -First 1).snapshot
  $result = [ordered]@{
    schema_version = 1
    title = 'DoK live position telemetry -- select-slot-a checkpoint reconstruction'
    profile_id = 'death-knights-of-krynn'
    stage_manifest = $manifestPath
    save_sha256 = $saveHash
    telemetry_addresses = [ordered]@{
      pos_x = ('0x{0:X}' -f $PosXAddr)
      pos_y = ('0x{0:X}' -f $PosYAddr)
      facing = ('0x{0:X}' -f $FacingAddr)
      wall_type = ('0x{0:X}' -f $WallTypeAddr)
      cell_descriptor = ('0x{0:X}' -f $CellDescriptorAddr)
      position_dirty_flag = ('0x{0:X}' -f $PositionDirtyFlagAddr)
    }
    ds_resolution_anchor = [ordered]@{
      technique = 'CMD_Goto post-combine execution breakpoint (tools/trace_dok_goto_operand.ps1 destSeg), armed once and left armed for the whole menu-navigation run'
      cmd_goto_runtime_destination_segment = $destinationSegment
      cmd_goto_entry_byte_match = $entryExactMatch
      exec_bp = $execBp
    }
    checkpoints = $checkpoints
    slot_a_checkpoint = $slotACheckpoint
    claim_boundary = (
      'Reconstructs the earlier (never-committed) multi-checkpoint capture technique referenced ' +
      'in dok-natural-route.md Update 3. Captures three CMD_Goto-anchored live memory reads ' +
      'during ordinary main-menu navigation (select-death-knights, select-slot-a, ' +
      'nav-begin-adventuring) using the same DS-resolution anchor already proven reliable ' +
      '(identical destSeg across ~20+ consecutive launches this project). Does NOT itself ' +
      'establish whether the captured bytes are the partys real save-loaded position -- see the ' +
      'accompanying dok-natural-route.md dated section for that determination, made by comparing ' +
      'this checkpoints value against the later on-screen HUD-confirmed spawn position (7,13,N) ' +
      'and against whether the value changes across the three checkpoints.'
    )
  }
  $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'dok-position-telemetry-slota.json') -Encoding utf8
  if ($slotACheckpoint) {
    Write-Host ("[dok-pos-slota] RESULT: select-slot-a ds={0} x={1} y={2} facing={3}({4}) out={5}" -f `
      $slotACheckpoint.ds, $slotACheckpoint.pos_x_0xc073, $slotACheckpoint.pos_y_0xc074, $slotACheckpoint.facing_0xc075, $slotACheckpoint.facing_compass, $out)
  } else {
    Write-Host ("[dok-pos-slota] RESULT: no hit captured at select-slot-a -- out={0}" -f $out)
  }
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
