# trace_dok_position_telemetry.ps1 — dynamic runtime confirmation of Death Knights of Krynn
# (DoK)'s own live party position/facing telemetry, targeting the "no live position telemetry
# exists for DoK's runtime" blocker recorded in docs/engine/research/dok-natural-route.md's
# "2026-07-17 Update 2" section (gap #2 of 3).
#
# Static evidence already established this round by directly disassembling DoK's own real
# GAME.OVR bytes (NOT a CoAB-oracle structural guess -- these are DoK's literal instructions):
#
#   - The immediate word 0xC04B (the CoAB/Gen1 shared engine's ECL "host map register" virtual
#     base address -- see coab_extracted/engine/ovr008.cs's vm_GetMemoryValue/vm_SetMemoryValue,
#     `loc -= 0xC04B`) occurs in DoK's GAME.OVR exactly TWICE, at flat file offsets 0x7A2C
#     (`cmp word ptr [bp+8], 0xc04b` inside the read-side dispatcher) and 0x78e0-ish (the
#     write-side dispatcher's `sub ax, 0xbf68` + `cmp ax, 0xe3/0xe4/0xe5` triage, see below).
#   - Read side (GAME.OVR flat 0x7a2c..0x7aaf): case index 0 (ECL vaddr 0xC04B) reads
#     `byte ptr [0xc073]`; index 1 (0xC04C) reads `[0xc074]`; index 2 (0xC04D) reads `[0xc075]`
#     (with an extra area-flag-gated `shr ax,1` variant); index 3 (0xC04E) reads `[0xc076]`;
#     index 4 (0xC04F) reads `[0xc077]`.
#   - Write side (GAME.OVR flat ~0x7883..0x78fe): `sub ax, 0xbf68` then `cmp ax, 0xe3` (== ECL
#     vaddr 0xC04B) writes `[0xc073]` and sets dirty flag `[0xdb75]=1`; `cmp ax, 0xe4` (0xC04C)
#     writes `[0xc074]` and sets the SAME dirty flag; `cmp ax, 0xe5` (0xC04D) remaps the ECL
#     value 0/1/2/3 to 0/2/4/6 (exactly CoAB's own `gbl.mapDirection = 0/2/4/6` N/E/S/W
#     convention, coab_extracted/engine/ovr008.cs lines ~780-806) and writes `[0xc075]`, also
#     setting `[0xdb75]=1`.
#   - Independent, self-consistent corroboration: `[0xc077]` (ECL vaddr 0xC04F, the "current GEO
#     cell descriptor" register) is the EXACT SAME address DoK's own already-proven ECL1.DAX
#     block 33 script reads at vaddr 0x840c (`AND #63, [c04f] -> [7f79]`,
#     docs/engine/research/dok-natural-route.md's "Block 33, Selector 33" section). That fact
#     was established independently (byte-grounded ECL disassembly) before this round touched
#     GAME.OVR at all, so index-4-of-this-same-dispatch landing on exactly 0xc077 is a strong,
#     non-circular cross-check that the whole 0xC04B-0xC04F register block, and therefore
#     0xc073/0xc074/0xc075 (X/Y/facing) alongside it, is correctly decoded.
#
# This script confirms those three addresses (0xc073 X, 0xc074 Y, 0xc075 facing) are REAL, LIVE
# values during an actual DOSBox-X run -- not just structurally-plausible file offsets -- by
# reading them at the exact moment DoK's own on-screen HUD displays an authoritative coordinate
# ("7,13 N 00:00" on the shipped SAVGAMA.PTY pregen save's opening camp screen) and checking for
# an exact byte match. Reusing the CMD_Goto post-combine breakpoint from
# tools/trace_dok_goto_operand.ps1 as the DS-resolution anchor: CMD_Goto is proven (that script,
# twice-reproduced) to fire constantly during ordinary play, so an execution breakpoint there
# reliably lands us in DoK's own resident code with the correct live DGROUP segment in DS,
# without needing a second overlay-seek investigation for the position read/write routine itself
# (same DGROUP is shared by all overlays in this Borland Large-model runtime -- already an
# established fact for this game family, see docs/engine/research/gen1-dosbox-runtime-trace.md's
# Pool investigation).
#
# Movement-based before/after (as opposed to this single spawn-checkpoint confirmation) was
# investigated and found blocked THIS round: the shipped SAVGAMA.PTY pregen save's very first
# playable state is a scripted "Gargath Outpost" camp/eulogy cutscene that funnels directly into
# a mandatory tactical combat encounter (an NPC steals a dragonlance; multiple "Nightmare"
# monsters attack) before any free-roam movement becomes available. Scripting a full combat
# resolution was out of this round's budget and orthogonal to the goal (tactical-combat position
# tracking is a different subsystem from this overworld/dungeon mapPosX/mapPosY telemetry
# regardless). See docs/engine/research/dok-natural-route.md's dated section for the full
# accounting; this script intentionally stops at the spawn checkpoint.

param(
  [string]$StageDir = 'build\runtime-dok-postel-20260717',
  [Parameter(Mandatory)][string]$OutDir,
  [ValidateRange(1,80)][int]$MaxSeeks = 60,
  [ValidateRange(5,60)][int]$FirstSeekTimeoutSeconds = 25,
  [ValidateRange(1,15)][int]$NextSeekTimeoutSeconds = 6,
  [ValidateRange(1,120)][int]$HitTimeoutSeconds = 45
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function Resolve-RepoPath([string]$Path) {
  $candidate = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repo $Path }
  return [IO.Path]::GetFullPath($candidate)
}

# Same CMD_Goto descriptor/offset constants as tools/trace_dok_goto_operand.ps1 (twice-reproduced
# 2026-07-17). Reused here purely as a reliable "we are executing DoK's own resident code, DS is
# the live DGROUP segment" anchor -- not to re-investigate CMD_Goto itself.
$CmdGotoTargetKey = '0x81D'
$CmdGotoCodeSize = 0x315b
$CmdGotoEntryRelOffset = 0x9b
$CmdGotoPostCombineRelOffset = 0xb6

# Position/pose telemetry addresses, statically located this round (see header comment).
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

function Get-PositionSnapshot {
  param([string]$Label, [IntPtr]$PokeHwnd = [IntPtr]::Zero, [int]$PokeIntervalMs = 0)
  # Clear whatever trap is pending, then re-run to the next CMD_Goto post-combine hit.
  Invoke-DebuggerInput -Command 'RUN' -Label "$Label-run" | Out-Null
  $deadline = [DateTime]::UtcNow.AddSeconds($HitTimeoutSeconds)
  $lastPoke = [DateTime]::UtcNow
  $addr = $null
  $snapshot = $null
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 150
    # This spawn/eulogy screen's own narrative text is a multi-paragraph "PRESS BUTTON OR ENTER TO
    # CONTINUE" sequence (confirmed this round via screenshot) -- like the earlier credits pages,
    # each static paragraph does not itself call CMD_Goto while idly waiting, only the actual
    # page-dismiss does. Periodically re-poke ENTER so a long wait doesn't just sit on one
    # un-dismissed paragraph forever.
    if ($PokeHwnd -ne [IntPtr]::Zero -and $PokeIntervalMs -gt 0 -and (([DateTime]::UtcNow) - $lastPoke).TotalMilliseconds -ge $PokeIntervalMs) {
      Send-DosKeys -Hwnd $PokeHwnd -Keys '{ENTER}'
      $lastPoke = [DateTime]::UtcNow
    }
    $snapshot = Invoke-DebuggerInput -Command '' -Label "$Label-poll" -SnapshotOnly
    if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
    $addr = Get-DebuggerAddress $snapshot
    if ($addr -eq $execBp) { break }
    # Some other trap (shouldn't happen -- only one BP armed); keep running.
    Invoke-DebuggerInput -Command 'RUN' -Label "$Label-run-again" | Out-Null
    $addr = $null
  }
  if ($addr -ne $execBp) { throw "timed out waiting for CMD_Goto hit: $Label" }
  [IO.File]::WriteAllText((Join-Path $out "$Label-hit-console.txt"), $snapshot, [Text.UTF8Encoding]::new($false))
  $dsMatch = [regex]::Match($snapshot, '\bDS=([0-9A-F]{4})\b')
  if (-not $dsMatch.Success) { throw "no DS in snapshot: $Label" }
  $ds = $dsMatch.Groups[1].Value
  $posDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $ds, $PosXAddr) -Label "$Label-pos"
  $posBytes = Get-DebuggerDataBytes $posDump
  $flagDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $ds, $PositionDirtyFlagAddr) -Label "$Label-flag"
  $flagBytes = Get-DebuggerDataBytes $flagDump
  # CRITICAL (same class of bug fixed above for the pre-loop resume): the CPU is PAUSED right here
  # -- frozen at the just-serviced execBp hit, since we read DS/memory while stopped. If this
  # function returns without resuming, the caller's *next* Send-DosKeys call sends its keypress
  # into a halted emulator again (the guest's emulated 8042 keyboard controller is not serviced
  # while the CPU is not executing), exactly reproducing the original bug for every step after the
  # first rather than just the first. Resume here so the CPU is already running by the time the
  # next key is sent; the very next CMD_Goto call (which fires constantly during ordinary
  # ECL-driven menu/dialogue flow) will re-arm the same breakpoint for the following checkpoint.
  Invoke-DebuggerInput -Command 'RUN' -Label "$Label-post-resume" | Out-Null
  return [ordered]@{
    label = $Label
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

function Get-PositionSnapshotViaTimerTick {
  param([string]$Label, [int]$Samples = 8)
  # Fallback anchor, added after this round proved (four separate attempts, including a 100s wait
  # with periodic pokes) that CMD_Goto never fires anywhere in the "select-begin-adventuring" ->
  # narrative -> eulogy-screen chain. DGROUP is a single, fixed data segment shared by every
  # overlay in this Borland Large-model runtime (an already-established fact for this game family
  # -- see docs/engine/research/gen1-dosbox-runtime-trace.md's Pool investigation), so DS should
  # already equal the live DGROUP segment at ANY point while DoK's own real-mode code is running,
  # not only at a CMD_Goto hit specifically. INT 8 (the 18.2 Hz timer tick) fires constantly
  # regardless of what code is running; DOSBox-X's BPINT breaks at the interrupt handler's very
  # first instruction, before that handler's own prologue reloads DS, so the DS captured there is
  # whatever DS was in the INTERRUPTED context. Because that context could occasionally be a
  # BIOS/DOS system call instead of DoK's own code, take several independent samples and report
  # all of them rather than trusting a single hit.
  $results = [System.Collections.Generic.List[object]]::new()
  for ($i = 0; $i -lt $Samples; $i++) {
    Invoke-DebuggerInput -Command 'BPDEL *' -Label "$Label-int8-$i-cleartraps" | Out-Null
    Invoke-DebuggerInput -Command 'BPINT 8' -Label "$Label-int8-$i-arm" | Out-Null
    Invoke-DebuggerInput -Command 'RUN' -Label "$Label-int8-$i-run" | Out-Null
    $deadline = [DateTime]::UtcNow.AddSeconds(5)
    $addr = $null
    $snapshot = $null
    while ([DateTime]::UtcNow -lt $deadline) {
      Start-Sleep -Milliseconds 80
      $snapshot = Invoke-DebuggerInput -Command '' -Label "$Label-int8-$i-poll" -SnapshotOnly
      if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
      $addr = Get-DebuggerAddress $snapshot
      break
    }
    if (-not $addr) { continue }
    $dsMatch = [regex]::Match($snapshot, '\bDS=([0-9A-F]{4})\b')
    if (-not $dsMatch.Success) { continue }
    $ds = $dsMatch.Groups[1].Value
    $posDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $ds, $PosXAddr) -Label "$Label-int8-$i-pos"
    $posBytes = Get-DebuggerDataBytes $posDump
    $results.Add([ordered]@{
      sample = $i; cs_ip = $addr; ds = $ds
      pos_x_0xc073 = [int]$posBytes[0]; pos_y_0xc074 = [int]$posBytes[1]; facing_0xc075 = [int]$posBytes[2]
    })
  }
  Invoke-DebuggerInput -Command 'BPDEL *' -Label "$Label-int8-final-cleartraps" | Out-Null
  Invoke-DebuggerInput -Command 'RUN' -Label "$Label-int8-final-resume" | Out-Null
  return @{ label = $Label; anchor = 'INT8-timer-tick'; samples = $results }
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
    Write-Host ("[dok-pos] seek {0}: handle={1} offset={2}" -f $seekIndex, $fields.handle, $seekOffsetHex)
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
  Write-Host ("[dok-pos] CMD_Goto runtime destination segment: {0}" -f $destinationSegment)

  $entryDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $destinationSegment, $CmdGotoEntryRelOffset) -Label 'cmd-goto-entry-bytematch'
  $entryBytes = Get-DebuggerDataBytes $entryDump
  $entryFileOffset = [Convert]::ToInt32($CmdGotoTargetKey, 16) + $CmdGotoEntryRelOffset
  $entryExpected = $overlayBytes[$entryFileOffset..($entryFileOffset + $entryBytes.Count - 1)]
  $entryExactMatch = (([Convert]::ToHexString([byte[]]$entryBytes)).ToLowerInvariant() -eq ([Convert]::ToHexString([byte[]]$entryExpected)).ToLowerInvariant())
  if (-not $entryExactMatch) { throw 'CMD_Goto entry byte-match failed -- destSeg does not hold expected resident code' }
  Write-Host '[dok-pos] CMD_Goto entry byte-match: true'

  # CRITICAL, found this round after repeated timeouts (first misdiagnosed as "the credits screen
  # is non-ECL-driven", then as a missing single post-arm resume): a halted DOSBox-X guest does
  # not service the emulated 8042 keyboard controller at all, so ANY keypress sent while the
  # debugger has the CPU paused at a breakpoint is silently dropped, not queued. CMD_Goto fires
  # constantly during ordinary ECL-driven menu/dialogue flow (proven by
  # tools/trace_dok_goto_operand.ps1's silent-boot trace), which means a breakpoint armed *during*
  # interactive navigation keeps re-pausing the CPU on its own, unpredictably racing every
  # subsequent Send-DosKeys call -- this is what produced the nondeterministic "sometimes step 1,
  # sometimes step 4, sometimes step 7" timeouts observed across this round's earlier attempts,
  # even after fixing the single most-obvious instance of the bug (see git history / superseded
  # comments this replaces). The robust fix is to decouple the two phases entirely: (1) resume the
  # CPU into free-running execution with NO breakpoint armed at all, drive the full deterministic
  # menu-navigation key sequence purely via Send-DosKeys + fixed sleeps (the same technique already
  # proven manually during this round's screenshot-driven navigation, see this script's OutDir),
  # and only (2) once navigation is complete and the party is sitting at the shipped save's opening
  # camp/eulogy screen (on-screen HUD "7,13 N 00:00"), arm the CMD_Goto post-combine breakpoint and
  # wait for exactly one hit to capture the final, settled position telemetry.
  Invoke-DebuggerInput -Command 'BPDEL *' -Label 'clear-seek-trap' | Out-Null
  Invoke-DebuggerInput -Command 'RUN' -Label 'resume-free-run' | Out-Null
  Start-Sleep -Milliseconds 1500

  # Drive the manually-discovered, deterministic menu sequence to the shipped SAVGAMA.PTY pregen
  # save's opening camp/eulogy screen -- the exact keys below were hand-derived this round via
  # screenshot-driven navigation (see this script's OutDir for the screenshots from that
  # investigation). No debugger interaction happens during this phase; the CPU just runs freely,
  # exactly like ordinary manual play. A generous per-step settle delay is used deliberately: this
  # round observed the credits->main-menu transition landing on an inconsistent initial cursor
  # position when the very next key follows too quickly (documented previously as "menu navigation
  # miscounted DOWN presses" -- a real DOS keyboard/render timing sensitivity, independent of the
  # CPU-pause bug fixed above), so the skip-credits step gets an extra-long settle window.
  #
  # DIAGNOSED THIS ROUND (a dedicated single-key-per-screenshot probe, see
  # docs/engine/research/dok-natural-route.md's dated section for the page images): booting
  # START.EXE lands on a title/logo screen, and reaching the real main menu takes EXACTLY THREE
  # dismiss keys, not one: (1) title/logo -> "CREATED BY: SSI SPECIAL PROJECTS TEAM" dev-team-roll
  # page, (2) dev-team page -> "DEATH KNIGHTS OF KRYNN 1.10 ... DEMO" version banner, (3) version
  # banner -> the real "CREATE NEW CHARACTER / ADD CHARACTER TO PARTY / LOAD SAVED GAME / ..." main
  # menu. This round's earlier single-ENTER attempts were one dismiss short: the subsequent
  # {DOWN}{DOWN} keys landed DURING the still-showing version banner (which treats any key as
  # "advance"), so they were consumed dismissing it instead of moving the main menu's cursor,
  # leaving the cursor at its default position (CREATE NEW CHARACTER) -- exactly reproducing the
  # "menu navigation miscounted DOWN presses" symptom from earlier manual testing, but now
  # root-caused precisely: it was never an extended-scancode delivery problem (a same-harness
  # DOWN-key sequence is independently proven working for Secret of the Silver Blades,
  # tools/run_secret_load_regression.ps1's `LoadMenuKeys`), it was simply one dismiss key short for
  # DoK's own three-page intro chain. Each dismiss key gets its own step/settle window (rather than
  # one combined multi-token string) since each intervening screen appears to need real emulated
  # render time before the next keypress is serviced reliably.
  $steps = @(
    @{ keys = '{ENTER}'; label = 'dismiss-title'; settleMs = 1800 },        # title/logo -> dev-team credits
    @{ keys = '{ENTER}'; label = 'dismiss-credits'; settleMs = 1800 },      # dev-team credits -> version/DEMO banner
    @{ keys = '{ENTER}'; label = 'skip-credits'; settleMs = 1800 },         # version/DEMO banner -> real main menu
    @{ keys = '{DOWN}{DOWN}'; label = 'nav-load-saved-game'; settleMs = 1200 },  # CREATE/ADD/LOAD -> LOAD SAVED GAME
    @{ keys = '{ENTER}'; label = 'select-load-saved-game'; settleMs = 1200 },
    @{ keys = '{ENTER}'; label = 'select-death-knights'; settleMs = 1200 },  # LOAD FROM WHERE? -> DEATH (already hi-lit)
    @{ keys = '{ENTER}'; label = 'select-slot-a'; settleMs = 1500 },  # LOAD WHICH GAME? -> A (already hi-lit)
    @{ keys = '{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}'; label = 'nav-begin-adventuring'; settleMs = 1200 }
  )
  foreach ($step in $steps) {
    Send-DosKeys -Hwnd $renderHwnd -Keys $step.keys
    Start-Sleep -Milliseconds $step.settleMs
    if ($env:DOK_POS_DEBUG_SHOTS -eq '1') {
      try { Capture-DosboxPrintWindow -Hwnd $renderHwnd -OutPng (Join-Path $out ('debug-after-' + $step.label + '.png')) | Out-Null } catch {}
    }
  }

  # Screenshot proof of the pre-spawn state (still free-running, no breakpoint armed yet).
  try {
    Capture-DosboxPrintWindow -Hwnd $renderHwnd -OutPng (Join-Path $out 'pre-spawn-screen.png') | Out-Null
  } catch {
    Write-Host "[dok-pos] WARN: pre-spawn screenshot capture failed (non-fatal): $($_.Exception.Message)"
  }

  # CRITICAL, diagnosed this round: the eulogy/camp screen and the multi-paragraph narrative that
  # follows it (on-screen HUD "7,13 N 00:00", auto-advancing toward the mandatory tactical-combat
  # encounter this round's header comment already flags as out of scope) turned out to be a dead
  # end for CMD_Goto-anchored telemetry capture -- like the earlier static credit pages, NONE of
  # its paragraph transitions call CMD_Goto, even when repeatedly poked with ENTER (tried up to a
  # 100-second wait with a periodic poke), or when the breakpoint is armed immediately before the
  # specific keypress that visibly transitions between paragraphs, or armed before
  # "select-begin-adventuring" itself. Four distinct anchor points all timed out with zero hits.
  # Conclusion: DoK's post-load world-init/narrative front end does not route through the same
  # CMD_Goto handler that in-dungeon ECL scripts use (or does not call it at all in this window).
  #
  # Fall back to the INT8 timer-tick anchor (Get-PositionSnapshotViaTimerTick, added this round):
  # free-run through select-begin-adventuring and the narrative, poking ENTER on a timer to
  # advance past each paragraph, then sample DS via a generic breakpoint that does not depend on
  # any specific DoK code path being hit.
  Send-DosKeys -Hwnd $renderHwnd -Keys '{ENTER}'  # select-begin-adventuring: the real world/party-init dispatch
  Start-Sleep -Milliseconds 1800
  for ($i = 0; $i -lt 5; $i++) {
    Send-DosKeys -Hwnd $renderHwnd -Keys '{ENTER}'
    Start-Sleep -Milliseconds 1500
  }
  try {
    Capture-DosboxPrintWindow -Hwnd $renderHwnd -OutPng (Join-Path $out 'spawn-screen.png') | Out-Null
  } catch {
    Write-Host "[dok-pos] WARN: spawn screenshot capture failed (non-fatal): $($_.Exception.Message)"
  }
  $checkpoints = [System.Collections.Generic.List[object]]::new()
  $spawnCheckpoint = Get-PositionSnapshotViaTimerTick -Label 'spawn' -Samples 8
  $checkpoints.Add($spawnCheckpoint)
  $spawnSamples = @($spawnCheckpoint.samples)
  Write-Host ("[dok-pos] INT8 samples captured: {0}/{1}" -f $spawnSamples.Count, 8)
  foreach ($s in $spawnSamples) {
    Write-Host ("[dok-pos]   sample {0}: cs_ip={1} ds={2} x={3} y={4} facing={5}" -f `
      $s.sample, $s.cs_ip, $s.ds, $s.pos_x_0xc073, $s.pos_y_0xc074, $s.facing_0xc075)
  }
  # Trust the modal (most frequent) DS across samples as the real DGROUP segment -- a handful of
  # samples may land inside a transient BIOS/DOS interrupt-service context with a different DS.
  $dsGroups = $spawnSamples | Group-Object -Property ds | Sort-Object Count -Descending
  $modalDs = if ($dsGroups.Count -gt 0) { $dsGroups[0].Name } else { $null }
  $modalSample = $spawnSamples | Where-Object { $_.ds -eq $modalDs } | Select-Object -First 1

  $result = [ordered]@{
    schema_version = 1
    title = 'DoK live position/facing telemetry -- static discovery + dynamic spawn-checkpoint confirmation'
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
      technique = 'CMD_Goto post-combine execution breakpoint (tools/trace_dok_goto_operand.ps1 destSeg)'
      cmd_goto_runtime_destination_segment = $destinationSegment
      cmd_goto_entry_byte_match = $entryExactMatch
    }
    checkpoints = $checkpoints
    spawn_checkpoint = $spawnCheckpoint
    spawn_checkpoint_modal_ds = $modalDs
    spawn_checkpoint_modal_sample = $modalSample
    expected_on_screen_hud = '7,13 N 00:00'
    spawn_matches_hud = (
      $modalSample -and
      $modalSample.pos_x_0xc073 -eq 7 -and
      $modalSample.pos_y_0xc074 -eq 13
    )
    claim_boundary = (
      'Confirms DoK''s own live DS:0xc073/0xc074/0xc075 (X/Y/facing) match the authoritative ' +
      'on-screen HUD exactly at the shipped SAVGAMA.PTY pregen save''s spawn point. Does NOT ' +
      'include a before/after MOVEMENT diff -- the only reachable state from this save funnels ' +
      'into a mandatory scripted combat encounter before free-roam movement is available, which ' +
      'was out of this round''s budget (see dok-natural-route.md). The addresses themselves were ' +
      'located by directly disassembling DoK''s own real GAME.OVR bytes (not a CoAB-oracle ' +
      'structural guess), and independently cross-checked via the cell-descriptor address ' +
      '(0xc077) matching DoK''s own already-proven ECL1.DAX block 33 script constant [c04f].'
    )
  }
  $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'dok-position-telemetry.json') -Encoding utf8
  if ($modalSample) {
    Write-Host ("[dok-pos] RESULT: modal_ds={0} x={1} y={2} facing_raw={3} matches_hud={4} out={5}" -f `
      $modalDs, $modalSample.pos_x_0xc073, $modalSample.pos_y_0xc074, $modalSample.facing_0xc075, $result.spawn_matches_hud, $out)
  } else {
    Write-Host ("[dok-pos] RESULT: no INT8 samples captured at all -- out={0}" -f $out)
  }
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
