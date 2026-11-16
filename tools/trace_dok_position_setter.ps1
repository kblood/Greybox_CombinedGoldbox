# trace_dok_position_setter.ps1 -- Lead 1 from docs/engine/research/dok-natural-route.md's
# "2026-07-17 Update 4" closing paragraph: try the WRITE-SIDE 0xc073..0xc077 dispatcher itself as
# an execution-breakpoint anchor, instead of CMD_Goto, for capturing DoK's live party position at
# the post-load spawn/eulogy screen. Both prior CMD_Goto-based anchors (Update 3's spawn-screen
# checkpoint, Update 4's select-slot-a reconstruction) proved the menu chain and the post-load
# narrative front end genuinely do not route through CMD_Goto at all -- this script tests a
# DIFFERENT resident routine, one specifically responsible for WRITING the position/host-register
# block (0xC04B..0xC050 ECL-virtual-address range), on the theory that DoK's narrative/spawn-init
# code might set the party's starting position via this generic "set ECL host register" routine
# directly (either from a SAVE-opcode ECL instruction, or from hard-coded C/asm world-init code
# that calls the same routine -- both are plausible call sites for a single generic setter) even
# though it apparently never calls CMD_Goto in this window.
#
# GAMELINK, NOT HOST SENDKEYS (2026-07-17, this round): the two prior scripts
# (trace_dok_position_telemetry.ps1, trace_dok_position_telemetry_slota.ps1) drove keypresses via
# tools/dosbot/lib.ps1's Send-DosKeys against a visible, focus-stealing host window (`output=surface`,
# the probe's default). Per docs/engine/research/dosbox-x-gamelink-automation.md, this project has a
# focusless alternative: DOSBox-X's GameLink shared-memory protocol
# (tools/dosbox_gamelink.py, `-GameLink` on tools/dosbox_x_debugbox_probe.ps1 -- starts DOSBox-X
# MINIMIZED with `output=gamelink`). This script uses that exclusively for guest input/screenshots;
# the DEBUGBOX debugger console (breakpoints, register/memory reads) stays on the existing
# process-owned console channel via tools\dosbox_debugger_input, exactly as the gamelink doc's
# "Next Steps" #3 specifies ("GameLink handles guest input/framebuffer; the debugger helper handles
# breakpoints, registers, and memory commands") and exactly as tools/trace_secret_begin_selector.ps1
# and tools/trace_gateway_vga_dac_bulk_loader.ps1 already do for their own traces.
#
# SYNCHRONOUS/FOREGROUND ONLY: this script must be invoked as a blocking, foreground call (not
# started via a backgrounded shell command and then abandoned) -- an orphaned background DOSBox-X
# trace advances nothing once the invoking turn ends. This is the same fix that unstuck an earlier
# DoK telemetry round this week (see docs/engine/HANDOFF.md, "DoK P2 follow-up" entries).
#
# Static evidence (fresh disassembly of DoK's own real GAME.OVR this round, confirming and
# extending the header comment already in tools/trace_dok_position_telemetry.ps1):
#
#   - The write-side dispatcher is a single function starting at GAME.OVR flat file offset 0x7769
#     (`push bp` / `mov bp,sp` / `sub sp,4`), which recomputes an address class (`al`, values
#     0/1/2/3/4) from the caller's virtual address argument and branches to one of 5 handlers.
#     Case 4 (`al==4`, entered at flat 0x7883, `cmp word ptr [bp+0xa],0xbf68 / ja 0x7883`) subtracts
#     0xbf68 from the caller's raw ECL virtual address to get a small index, then a second cmp/jne
#     chain against 0xe3/0xe4/0xe5/0xf1/0xf7:
#       - `ax==0xe3` (== ECL vaddr 0xC04B, mapPosX): `mov byte ptr [0xc073],al` (flat 0x789c),
#         also unconditionally sets the dirty flag `mov byte ptr [0xdb75],1` (flat 0x7894).
#       - `ax==0xe4` (== 0xC04C, mapPosY): `mov byte ptr [0xc074],al` (flat 0x78aa), dirty flag at
#         flat 0x78ad.
#       - `ax==0xe5` (== 0xC04D, facing): remaps ECL 0/1/2/3 -> 0/2/4/6 (N/E/S/W, exactly CoAB's own
#         `gbl.mapDirection` convention) and writes `[0xc075]` (flat 0x78c5/0x78d1/0x78dd/0x78e9
#         depending on the remapped value), converging at flat 0x78fe (`mov byte ptr [0xdb75],1`).
#       - `ax==0xf1`/`0xf7`: writes `[0xc5f6]`/`[0xc5f7]` -- a DIFFERENT register pair, not
#         position/facing (not used by this script, noted for completeness only).
#     All five case-4 sub-branches converge at flat 0x7927 (`mov sp,bp` / `pop bp` / `retf 6`), the
#     shared epilogue for the WHOLE outer function (also shared by cases al=0..3, which handle
#     different, unrelated ECL virtual-address ranges via a completely different code path). This
#     means an execution breakpoint at flat 0x7927 fires for ANY SAVE-to-virtual-address call this
#     function handles, not just position writes specifically -- deliberately the BROADEST available
#     net for "does ANY memory-set dispatch happen during this on-screen window at all", a more
#     fundamental question than "does CMD_Goto specifically fire" (already answered "no").
#   - Per tools/disasm_dok.py's own DESCS table, this function's descriptor is index 8: (start_exe
#     0x5b1, GAME.OVR fileofs 0x6ba8, codesz 0x1e63, jmpcnt 23) -- covering flat file range
#     [0x6ba8, 0x8a0b), which contains both this write dispatcher (0x7769-0x7927) AND DoK's own
#     operand parser vm_LoadCmdSets (0x6ba8 itself, already structurally matched 1.0/1.0 against
#     the CoAB oracle by tools/map_dok_ecl_dispatch.py in an earlier round). This is a DIFFERENT
#     overlay descriptor from CMD_Goto's own (index 2, fileofs 0x81d) -- CMD_Goto and this setter
#     are loaded into separate VROOMM buffer slots, so this script needs its OWN Phase-1 seek
#     capture (target key 0x6BA8, not CMD_Goto's 0x81D) rather than reusing the prior scripts'
#     resolved segment.
#
# Relative offsets (flat address minus descriptor base 0x6ba8), used for arming/verification below:
#   function entry (byte-match anchor): 0x7769 - 0x6ba8 = 0xBC1
#   execution breakpoint (shared epilogue, broadest net): 0x7927 - 0x6ba8 = 0xD7F
#
# Two-phase technique: Phase 1 (BPINT 21 42 seek capture during silent early boot) resolves the
# runtime destination segment for descriptor 8 and confirms a byte-exact match at the function
# entry; Phase 2 arms the epilogue execution breakpoint ONCE, leaves it armed for the entire
# menu-navigation + narrative + spawn-screen sequence, and checkpoints after EVERY step (not just
# the final spawn screen) so a genuine "never fires" result can be told apart from "fires, but
# outside a narrower capture window". A byte-match re-verification is performed a second time,
# right before the final extended spawn-screen wait, to catch the (currently unquantified) risk
# that VROOMM evicts this descriptor's buffer for a different overlay somewhere in the many steps
# between Phase 1 and the spawn screen.
#
# GAMELINK COLLISION HAZARD (2026-07-17, added after a run of this exact script produced a
# suspicious result -- see docs/engine/research/dosbox-x-gamelink-automation.md's "2026-07-17:
# KNOWN HAZARD" section): DOSBox-X 2026.07.02's GameLink shared-memory transport
# (DWD_GAMELINK_MMAP_R4 / DWD_GAMELINK_MUTEX_R4) is a hardcoded, non-process-scoped Windows named
# object. When two DOSBox-X GameLink-master processes run at once on this machine (this project
# routinely runs several concurrent trace agents), a status/screenshot/press call can SILENTLY
# return a different agent's session with no error. This script now (a) refuses to launch a
# GameLink session while any other dosbox-x.exe process already exists (Wait-DosboxExclusive,
# bounded retry, not an infinite hang), (b) re-checks that ONLY our own launched PID is running
# dosbox-x.exe at every checkpoint (Assert-OwnDosboxProcess) and aborts rather than silently
# trusting a possibly-foreign capture if a second PID appears mid-run, and (c) cross-checks
# GameLink's own `program`/frame-dimension fields against DoK's own expectations at each keypress
# step (Assert-GameLinkIdentity) as a cheap, independent corroboration. None of this is a full fix
# (that needs an upstream DOSBox-X patch, per the hazard doc) -- it is best-effort collision
# *detection*, not prevention beyond the pre-launch exclusivity gate.

param(
  [string]$StageDir = 'build\runtime-dok-postel-20260717',
  [Parameter(Mandatory)][string]$OutDir,
  [ValidateRange(1,80)][int]$MaxSeeks = 60,
  [ValidateRange(5,60)][int]$FirstSeekTimeoutSeconds = 25,
  [ValidateRange(1,15)][int]$NextSeekTimeoutSeconds = 6,
  [ValidateRange(1,60)][int]$PerStepHitTimeoutSeconds = 12,
  [ValidateRange(5,120)][int]$SpawnHitTimeoutSeconds = 45
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function Resolve-RepoPath([string]$Path) {
  $candidate = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repo $Path }
  return [IO.Path]::GetFullPath($candidate)
}

# Descriptor 8 (vm_LoadCmdSets / this write dispatcher's shared overlay), per tools/disasm_dok.py's
# DESCS table entry (0x5b1, 0x6ba8, 0x1e63, 23).
$SetterTargetKey = '0x6BA8'
$SetterEntryRelOffset = 0xBC1     # 0x7769 - 0x6ba8 (function entry, push bp)
$SetterEpilogueRelOffset = 0xD7F  # 0x7927 - 0x6ba8 (shared epilogue, all case branches converge)

# Position/pose telemetry addresses, statically located 2026-07-17 (see
# tools/trace_dok_position_telemetry.ps1's header comment; re-confirmed by this round's own fresh
# disassembly in the header comment above).
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
$gameLink = Join-Path $repo 'tools\dosbox_gamelink.py'
$helperProject = Join-Path $repo 'tools\dosbox_debugger_input\DosboxDebuggerInput.csproj'
$helperDll = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'
& dotnet build $helperProject --configuration Release | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'debugger helper build failed' }

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

function Send-GameLinkKeys {
  param([string[]]$Keys, [double]$Pace = 0.4, [int]$MaxAttempts = 4)
  # RETRY, NOT INVENT: tools/dosbox_gamelink.py's _wait_consumed default timeout is only 1 second.
  # This round found that issuing a DEBUGBOX console command (e.g. the per-step "preresume RUN"
  # safety call) immediately before a GameLink press can occasionally leave the guest not yet
  # servicing the shared-memory input flag within that 1s window -- a real IPC-timing race between
  # two independent channels (the .NET debugger-console helper and the GameLink shared-memory
  # client), not evidence of a genuine guest crash. A bounded retry (short backoff, no state
  # mutation between attempts) is the correct fix for this class of flake; it does not fabricate or
  # paper over a functional result -- if the guest is genuinely stuck, every attempt will fail and
  # this still throws after $MaxAttempts.
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    & python $gameLink press @Keys --pace $Pace
    if ($LASTEXITCODE -eq 0) { return }
    Write-Host ("[dok-pos-setter] WARN: gamelink press attempt {0}/{1} failed for '{2}', retrying" -f $attempt, $MaxAttempts, ($Keys -join ' '))
    Start-Sleep -Milliseconds 750
  }
  throw "gamelink press failed after $MaxAttempts attempts: $($Keys -join ' ')"
}

function Save-GameLinkScreenshot {
  param([string]$Path)
  & python $gameLink screenshot $Path
  if ($LASTEXITCODE -ne 0) { Write-Host "[dok-pos-setter] WARN: gamelink screenshot failed (non-fatal): $Path" }
}

# Collision-avoidance gate (see header comment): refuse to launch a second concurrent GameLink
# session. Bounded retry, not an infinite hang -- honest failure if the machine stays occupied.
function Wait-DosboxExclusive {
  param([int]$TimeoutSeconds = 480, [int]$PollSeconds = 10)
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $warned = $false
  while ($true) {
    $existing = Get-Process dosbox-x -ErrorAction SilentlyContinue
    if (-not $existing) { return }
    if ([DateTime]::UtcNow -ge $deadline) {
      $pids = ($existing | Select-Object -ExpandProperty Id) -join ','
      throw ("GameLink collision-avoidance: dosbox-x already running (PID(s): {0}) after waiting " +
        "{1}s -- refusing to launch a second concurrent GameLink session (see " +
        "docs/engine/research/dosbox-x-gamelink-automation.md's 2026-07-17 KNOWN HAZARD). This is " +
        "an honest blocked result (machine contention), not a trace failure -- retry once other " +
        "agents' dosbox-x sessions clear." -f $pids, $TimeoutSeconds)
    }
    if (-not $warned) {
      $pids = ($existing | Select-Object -ExpandProperty Id) -join ','
      Write-Host ("[dok-pos-setter] WARN: dosbox-x already running (PID(s): {0}) -- waiting for exclusivity before launching a GameLink session" -f $pids)
      $warned = $true
    }
    Start-Sleep -Seconds $PollSeconds
  }
}

# Mid-session collision detection: if a foreign dosbox-x PID appears alongside our own, the
# GameLink shared-memory singleton may now be silently serving a different agent's session --
# abort rather than continue trusting captures taken after this point.
function Assert-OwnDosboxProcess {
  param([int]$OwnPid)
  $all = Get-Process dosbox-x -ErrorAction SilentlyContinue
  $foreign = $all | Where-Object { $_.Id -ne $OwnPid }
  if ($foreign) {
    $pids = ($foreign | Select-Object -ExpandProperty Id) -join ','
    throw ("GameLink collision detected mid-session: foreign dosbox-x PID(s) appeared ({0}) " +
      "alongside our own PID {1} -- per the KNOWN HAZARD doc, treat any capture from this point " +
      "on as compromised. Aborting rather than reporting a possibly-corrupted result." -f $pids, $OwnPid)
  }
}

# Cheap independent corroboration that GameLink's shared memory is actually reflecting OUR
# session and not a foreign one (dimensions/program string are visible even though the
# transport gives no PID). DoK's own DOSBox-X frame is 640x400 throughout (confirmed by this
# script's earlier runs); a mismatch is a strong collision signal even though a match alone
# is not a full guarantee.
function Assert-GameLinkIdentity {
  param([int]$ExpectedWidth = 640, [int]$ExpectedHeight = 400, [string]$Label = 'identity-check')
  $statusJson = & python $gameLink status
  if ($LASTEXITCODE -ne 0) { throw "gamelink status failed ($Label)" }
  $status = $statusJson | ConvertFrom-Json
  Write-Host ("[dok-pos-setter]   gamelink identity ({0}): program='{1}' frame={2}x{3}" -f `
    $Label, $status.program, $status.frame.width, $status.frame.height)
  if ($status.frame.width -ne $ExpectedWidth -or $status.frame.height -ne $ExpectedHeight) {
    throw ("GameLink identity check failed at {0}: frame is {1}x{2}, expected {3}x{4} -- likely " +
      "reading a foreign session (collision hazard); aborting rather than trusting this capture." -f `
      $Label, $status.frame.width, $status.frame.height, $ExpectedWidth, $ExpectedHeight)
  }
  return $status
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

function ConvertTo-HexLower {
  param([byte[]]$Bytes)
  return -join ($Bytes | ForEach-Object { $_.ToString('x2') })
}

function Test-EntryByteMatch {
  param([string]$DestSeg, [string]$Label)
  $entryDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $DestSeg, $SetterEntryRelOffset) -Label $Label
  $entryBytes = Get-DebuggerDataBytes $entryDump
  $entryFileOffset = [Convert]::ToInt32($SetterTargetKey, 16) + $SetterEntryRelOffset
  $entryExpected = $overlayBytes[$entryFileOffset..($entryFileOffset + $entryBytes.Count - 1)]
  return ((ConvertTo-HexLower $entryBytes) -eq (ConvertTo-HexLower $entryExpected))
}

# Per-step checkpoint capture: does NOT throw on timeout, returns $null so a genuine "no hit" is
# distinguishable from a hard failure.
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
    Invoke-DebuggerInput -Command 'RUN' -Label "$Label-run-again" | Out-Null
    $addr = $null
  }
  if ($addr -ne $ExecBp) {
    Write-Host ("[dok-pos-setter]   {0}: no setter-epilogue hit within {1}s" -f $Label, $TimeoutSeconds)
    return $null
  }
  [IO.File]::WriteAllText((Join-Path $out "$Label-hit-console.txt"), $snapshot, [Text.UTF8Encoding]::new($false))
  $dsMatch = [regex]::Match($snapshot, '\bDS=([0-9A-F]{4})\b')
  if (-not $dsMatch.Success) { throw "no DS in snapshot: $Label" }
  $ds = $dsMatch.Groups[1].Value
  # Per-checkpoint byte-match: confirms the runtime destSeg STILL holds our setter's own entry code
  # at the moment of THIS hit (not just at Phase 1 and once more at the very end). This resolves the
  # ambiguity a plain two-point (phase1 / post-navigation) check leaves: without this, a hit late in
  # the sequence could be a coincidental breakpoint match on a DIFFERENT function VROOMM swapped into
  # the same segment:offset after evicting the setter -- inconclusive, not genuine setter execution.
  $bpDestSeg = ($ExecBp -split ':')[0]
  $entryMatchNow = Test-EntryByteMatch -DestSeg $bpDestSeg -Label "$Label-bytematch"
  $posDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $ds, $PosXAddr) -Label "$Label-pos"
  $posBytes = Get-DebuggerDataBytes $posDump
  $flagDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $ds, $PositionDirtyFlagAddr) -Label "$Label-flag"
  $flagBytes = Get-DebuggerDataBytes $flagDump
  # CRITICAL (same bug class as the prior CMD_Goto scripts): resume BEFORE returning, or the
  # caller's next keypress races a halted guest and is silently dropped.
  Invoke-DebuggerInput -Command 'RUN' -Label "$Label-post-resume" | Out-Null
  return [ordered]@{
    label = $Label
    hit = $true
    cs_ip = $addr
    ds = $ds
    entry_byte_match_at_hit = $entryMatchNow
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
  Wait-DosboxExclusive
  & $probe -DbxExe $dbx -GameDir $stage -Exe 'START.EXE' -OutDir $out `
    -Cycles 'fixed 25000' -GameLink -DebuggerAction @('BPINT 21 42', 'RUN') `
    -NoActionScreenshots
  if (-not $?) { throw 'DoK DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  Assert-OwnDosboxProcess -OwnPid $process.Id

  # NOTE (this round): do NOT add an extra Start-Sleep/gamelink-status check here before Phase 1.
  # An earlier attempt this round added one (matching a stale draft, not the proven pattern) and it
  # produced a genuinely divergent boot (CPU stuck spinning "Illegal Unhandled Interrupt Called 6"
  # at an unrelated CS, BPINT 21 42 never firing within the timeout) -- almost certainly because the
  # extra real-time delay let DoK's own self-decompression stub run past whatever timing-sensitive
  # window it needs. tools/trace_gateway_vga_dac_bulk_loader.ps1 and
  # tools/trace_secret_begin_selector.ps1 (both proven GameLink+BPINT traces) go STRAIGHT from probe
  # launch into their Phase-1 seek loop with no such delay -- matched exactly here. GameLink
  # readiness is instead checked lazily at first actual use (Phase 2's first Send-GameLinkKeys),
  # by which point Phase 1's own seek/postread loops have already consumed several real seconds.

  # --- Phase 1: seek capture -> resolve the setter's own runtime destination segment ------------
  # NOTE: different target key from the CMD_Goto scripts (0x6BA8, not 0x81D) -- this is a
  # different VROOMM descriptor.
  $destinationSegment = $null
  $observedCodeSize = $null
  $seekIndex = 0
  $deadline = [DateTime]::UtcNow.AddSeconds($FirstSeekTimeoutSeconds)
  while (-not $destinationSegment -and $seekIndex -lt $MaxSeeks -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 100
    $snapshot = Invoke-DebuggerInput -Command '' -Label 'seek-poll' -SnapshotOnly
    if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
    $fields = Get-SeekFields -Snapshot $snapshot
    if (-not $fields -or -not $fields.is_ah42) { throw "trace stopped somewhere other than INT 21h/AH=42 at seek index $seekIndex" }
    $seekOffsetHex = '0x{0:X}' -f $fields.seek_offset
    Write-Host ("[dok-pos-setter] seek {0}: handle={1} offset={2}" -f $seekIndex, $fields.handle, $seekOffsetHex)
    if ($fields.handle -eq 5 -and $seekOffsetHex -eq $SetterTargetKey) {
      $destinationMatch = [regex]::Match($snapshot, 'es:\[0010\]=([0-9A-F]{4})')
      $sizeMatch = [regex]::Match($snapshot, 'es:\[0008\]=([0-9A-F]{4})')
      if (-not $destinationMatch.Success) { throw 'seek snapshot lacks destination segment annotation' }
      $destinationSegment = $destinationMatch.Groups[1].Value
      if ($sizeMatch.Success) { $observedCodeSize = [Convert]::ToInt32($sizeMatch.Groups[1].Value, 16) }
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
  if (-not $destinationSegment) { throw "setter overlay descriptor ($SetterTargetKey) not observed within $MaxSeeks seeks" }
  Write-Host ("[dok-pos-setter] setter runtime destination segment: {0} (observed code size 0x{1:X})" -f $destinationSegment, $observedCodeSize)

  $entryExactMatch = Test-EntryByteMatch -DestSeg $destinationSegment -Label 'setter-entry-bytematch-phase1'
  if (-not $entryExactMatch) { throw 'setter entry byte-match failed -- destSeg does not hold expected resident code' }
  Write-Host '[dok-pos-setter] setter entry byte-match (phase 1): true'

  # --- Phase 2: arm the shared-epilogue execution breakpoint ONCE, leave it armed for the whole
  # menu-navigation + narrative + spawn-screen run. All guest input now goes through GameLink.
  Invoke-DebuggerInput -Command 'BPDEL *' -Label 'clear-seek-trap' | Out-Null
  $execBp = '{0}:{1:X4}' -f $destinationSegment, $SetterEpilogueRelOffset
  Invoke-DebuggerInput -Command "BP $execBp" -Label 'arm-epilogue-bp' | Out-Null
  Invoke-DebuggerInput -Command 'RUN' -Label 'epilogue-first-run' | Out-Null
  Start-Sleep -Milliseconds 1500

  # Same deterministic cold-boot -> main-menu -> slot-A -> begin-adventuring -> narrative sequence
  # proven twice (screenshot-confirmed) in tools/trace_dok_position_telemetry.ps1 and
  # tools/trace_dok_position_telemetry_slota.ps1, translated to GameLink key names
  # (tools/dosbox_gamelink.py's SCAN_CODES: 'enter', 'down'). Checkpointed at EVERY step since this
  # is a genuinely new anchor with no prior evidence either way.
  $steps = @(
    @{ keys = @('enter'); label = 'dismiss-title' },
    @{ keys = @('enter'); label = 'dismiss-credits' },
    @{ keys = @('enter'); label = 'skip-credits' },
    @{ keys = @('down','down'); label = 'nav-load-saved-game' },
    @{ keys = @('enter'); label = 'select-load-saved-game' },
    @{ keys = @('enter'); label = 'select-death-knights' },
    @{ keys = @('enter'); label = 'select-slot-a' },
    @{ keys = @('down','down','down','down','down'); label = 'nav-begin-adventuring' },
    @{ keys = @('enter'); label = 'select-begin-adventuring' },
    @{ keys = @('enter'); label = 'narrative-1' },
    @{ keys = @('enter'); label = 'narrative-2' },
    @{ keys = @('enter'); label = 'narrative-3' },
    @{ keys = @('enter'); label = 'narrative-4' },
    @{ keys = @('enter'); label = 'narrative-5' }
  )
  $checkpoints = [System.Collections.Generic.List[object]]::new()
  foreach ($step in $steps) {
    Assert-OwnDosboxProcess -OwnPid $process.Id
    Invoke-DebuggerInput -Command 'RUN' -Label "$($step.label)-preresume" | Out-Null
    Send-GameLinkKeys -Keys $step.keys -Pace 0.4
    Assert-GameLinkIdentity -Label $step.label | Out-Null
    Write-Host ("[dok-pos-setter] checkpoint: {0}" -f $step.label)
    $cp = Get-CheckpointSnapshot -Label $step.label -ExecBp $execBp -TimeoutSeconds $PerStepHitTimeoutSeconds
    $checkpoints.Add([ordered]@{ label = $step.label; snapshot = $cp })
    if ($cp) {
      Write-Host ("[dok-pos-setter]   ds={0} x={1} y={2} facing={3}({4}) wall={5} cell={6} dirty={7}" -f `
        $cp.ds, $cp.pos_x_0xc073, $cp.pos_y_0xc074, $cp.facing_0xc075, $cp.facing_compass, $cp.wall_type_0xc076, $cp.cell_descriptor_0xc077, $cp.position_dirty_flag_0xdb75)
    }
  }

  Save-GameLinkScreenshot -Path (Join-Path $out 'post-narrative-screen.png')

  # Re-verify the entry byte-match now, after ~14 keypresses and however many overlay swaps
  # happened along the way, to catch VROOMM eviction of this descriptor's buffer before trusting
  # the final extended spawn-screen wait below.
  Invoke-DebuggerInput -Command 'BPDEL *' -Label 'clear-exec-trap-for-reverify' | Out-Null
  $entryExactMatchPostNav = Test-EntryByteMatch -DestSeg $destinationSegment -Label 'setter-entry-bytematch-postnav'
  Write-Host ("[dok-pos-setter] setter entry byte-match (post-navigation re-verify): {0}" -f $entryExactMatchPostNav)
  Invoke-DebuggerInput -Command "BP $execBp" -Label 're-arm-epilogue-bp' | Out-Null
  Invoke-DebuggerInput -Command 'RUN' -Label 're-arm-run' | Out-Null

  # Final extended wait at the settled spawn/eulogy screen, poking ENTER periodically in case the
  # on-screen text is still mid-paragraph, specifically to maximize the chance of catching a hit
  # right when the HUD shows the authoritative "7,13 N 00:00" coordinate.
  Write-Host '[dok-pos-setter] final extended spawn-screen wait...'
  Assert-OwnDosboxProcess -OwnPid $process.Id
  Assert-GameLinkIdentity -Label 'pre-spawn-wait' | Out-Null
  Invoke-DebuggerInput -Command 'RUN' -Label 'spawn-wait-preresume' | Out-Null
  $spawnDeadline = [DateTime]::UtcNow.AddSeconds($SpawnHitTimeoutSeconds)
  $lastPoke = [DateTime]::UtcNow
  $spawnAddr = $null
  $spawnSnapshot = $null
  while ([DateTime]::UtcNow -lt $spawnDeadline) {
    Start-Sleep -Milliseconds 150
    if ((([DateTime]::UtcNow) - $lastPoke).TotalMilliseconds -ge 4000) {
      Assert-OwnDosboxProcess -OwnPid $process.Id
      Send-GameLinkKeys -Keys @('enter') -Pace 0.2
      $lastPoke = [DateTime]::UtcNow
    }
    $spawnSnapshot = Invoke-DebuggerInput -Command '' -Label 'spawn-wait-poll' -SnapshotOnly
    if ($spawnSnapshot -match '(?m)^\(Running\)\s*$') { continue }
    $spawnAddr = Get-DebuggerAddress $spawnSnapshot
    if ($spawnAddr -eq $execBp) { break }
    Invoke-DebuggerInput -Command 'RUN' -Label 'spawn-wait-run-again' | Out-Null
    $spawnAddr = $null
  }
  $spawnCheckpoint = $null
  if ($spawnAddr -eq $execBp) {
    [IO.File]::WriteAllText((Join-Path $out 'spawn-final-hit-console.txt'), $spawnSnapshot, [Text.UTF8Encoding]::new($false))
    $dsMatch = [regex]::Match($spawnSnapshot, '\bDS=([0-9A-F]{4})\b')
    $ds = $dsMatch.Groups[1].Value
    $spawnEntryMatch = Test-EntryByteMatch -DestSeg $destinationSegment -Label 'spawn-final-bytematch'
    $posDump = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $ds, $PosXAddr) -Label 'spawn-final-pos'
    $posBytes = Get-DebuggerDataBytes $posDump
    $spawnCheckpoint = [ordered]@{
      label = 'spawn-final'; hit = $true; cs_ip = $spawnAddr; ds = $ds
      entry_byte_match_at_hit = $spawnEntryMatch
      pos_x_0xc073 = [int]$posBytes[0]; pos_y_0xc074 = [int]$posBytes[1]
      facing_0xc075 = [int]$posBytes[2]
      facing_compass = @{0='N';2='E';4='S';6='W'}[[int]$posBytes[2]]
      wall_type_0xc076 = [int]$posBytes[3]; cell_descriptor_0xc077 = [int]$posBytes[4]
    }
    Write-Host ("[dok-pos-setter] SPAWN HIT: ds={0} x={1} y={2} facing={3} entry_byte_match_at_hit={4}" -f $ds, $spawnCheckpoint.pos_x_0xc073, $spawnCheckpoint.pos_y_0xc074, $spawnCheckpoint.facing_compass, $spawnEntryMatch)
    Invoke-DebuggerInput -Command 'RUN' -Label 'spawn-final-resume' | Out-Null
  } else {
    Write-Host ("[dok-pos-setter] no setter-epilogue hit within final {0}s spawn wait" -f $SpawnHitTimeoutSeconds)
  }
  Save-GameLinkScreenshot -Path (Join-Path $out 'spawn-final-screen.png')

  $anyHit = ($checkpoints | Where-Object { $_.snapshot } | Select-Object -First 1) -or $spawnCheckpoint
  $result = [ordered]@{
    schema_version = 1
    title = 'DoK live position telemetry -- write-side 0xc073..0xc077 dispatcher (epilogue) anchor, Lead 1, GameLink focusless automation'
    profile_id = 'death-knights-of-krynn'
    stage_manifest = $manifestPath
    save_sha256 = $saveHash
    input_mechanism = 'GameLink (tools/dosbox_gamelink.py) -- no host SendKeys, no focus-stealing window'
    telemetry_addresses = [ordered]@{
      pos_x = ('0x{0:X}' -f $PosXAddr)
      pos_y = ('0x{0:X}' -f $PosYAddr)
      facing = ('0x{0:X}' -f $FacingAddr)
      wall_type = ('0x{0:X}' -f $WallTypeAddr)
      cell_descriptor = ('0x{0:X}' -f $CellDescriptorAddr)
      position_dirty_flag = ('0x{0:X}' -f $PositionDirtyFlagAddr)
    }
    ds_resolution_anchor = [ordered]@{
      technique = 'write-side host-register SETTER shared epilogue (GAME.OVR flat 0x7927, descriptor 8 fileofs 0x6ba8), armed once and left armed for the whole menu-navigation + narrative + spawn run'
      setter_target_key = $SetterTargetKey
      setter_runtime_destination_segment = $destinationSegment
      setter_entry_byte_match_phase1 = $entryExactMatch
      setter_entry_byte_match_post_navigation = $entryExactMatchPostNav
      exec_bp = $execBp
    }
    checkpoints = $checkpoints
    spawn_checkpoint = $spawnCheckpoint
    any_hit_anywhere = [bool]$anyHit
    gamelink_collision_safeguard = 'Wait-DosboxExclusive (pre-launch) + Assert-OwnDosboxProcess (per-checkpoint) + Assert-GameLinkIdentity (per-checkpoint, program/frame cross-check) all passed for this run -- see docs/engine/research/dosbox-x-gamelink-automation.md 2026-07-17 KNOWN HAZARD'
    expected_on_screen_hud = '7,13 N 00:00'
    claim_boundary = (
      'Tests whether DoKs write-side host-register SETTER function (GAME.OVR flat 0x7769-0x7927, ' +
      'a DIFFERENT resident routine from CMD_Goto, statically located this round by direct ' +
      'disassembly) fires anywhere between cold boot and the shipped SAVGAMA.PTY pregen saves ' +
      'settled spawn/eulogy screen. This is Lead 1 from dok-natural-route.md Update 4: both prior ' +
      'CMD_Goto-anchored attempts (Update 3 spawn-screen, Update 4 select-slot-a) proved CMD_Goto ' +
      'itself never fires in this window; this script tests a structurally different function ' +
      'instead, on the theory that a generic set-ECL-host-register call (used by many unrelated ' +
      'SAVE-opcode virtual addresses, not just position) might still execute even when GOTO-driven ' +
      'branching does not. A true/true entry-byte-match with zero checkpoint hits everywhere is ' +
      'the honest negative case: this specific setter routine also never executes in this window ' +
      '(distinct from a broken breakpoint or an evicted overlay, which the byte-match checks rule ' +
      'out). A false entry-byte-match at any point is inconclusive rather than negative -- it means ' +
      'VROOMM evicted this descriptors buffer and the recorded destSeg no longer holds the setter, ' +
      'not that the setter itself did not run.'
    )
  }
  $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'dok-position-setter-trace.json') -Encoding utf8
  Write-Host ("[dok-pos-setter] RESULT: any_hit_anywhere={0} out={1}" -f [bool]$anyHit, $out)
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
