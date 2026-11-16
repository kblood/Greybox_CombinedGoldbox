# DQK Gen2 real encounter smoke.
#
# Pins a native path from a real DQK ECL.GLB handler to queued monster combat,
# native tactical resolution, binary combat result writeback, and ECL resume.
# Area 5's far-pointer slot 3 routes through the event dispatcher when seeded
# with the same runtime registers the host owns; this confirms Gen2 LOAD_FILES,
# inline GETTABLE data, LOAD_MONSTER, COMBAT, and /R resume work together.
param(
  [switch]$Headless
)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'The Dark Queen of Krynn'
# Mount a scratch mirror, never the retail release itself: `mount D "$game"`
# followed by `D:` makes the read-only GOG folder the DOS child's current drive,
# so its stray writes (CCFP.MOV, rewritten SAVE\CHRDATA*) land in the retail
# tree. CLAUDE.md: game-data folders are read-only source.
. (Join-Path $PSScriptRoot 'retail-stage.ps1')
$dosbox = Join-Path $game 'DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: CCECL DQK combat (DOSBox.exe absent)'
  exit 0
}

foreach ($name in @(
  'DISK2\MONCHA.GLB',
  'DISK3\ECL.GLB'
)) {
  if (-not (Test-Path (Join-Path $game $name))) {
    Write-Output "SKIP: CCECL DQK combat ($name absent)"
    exit 0
  }
}

$gameMount = New-RetailStage -Source $game
& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

$combatSeed = 4660

$conf = Join-Path $build '_ccecl_dqk_combat_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$gameMount"
D:
C:\CCECL D:\DISK3\ECL.GLB 5 /E C:\DQKCMB.BIN /3 0 /F 0 /N 6 /H 1 /Z 240 /D 4 /X 202 14 /X 203 5 /X 274 16 /X 193 3 /X 194 2
C:\CCEFX C:\DQKCMB.BIN C:\DQKCMB.TXT
C:\CCCOMBAT /E C:\DQKCMB.BIN D:\DISK2\MONCHA.GLB $combatSeed C:\DQKCMB.TRC C:\DQKCMB.OUT C:\DQKCMB.RAW /R C:\DQKCMB.GBR > C:\DQKCOMB.TXT
C:\CCECL D:\DISK3\ECL.GLB 5 /R C:\DQKCMB.BIN C:\DQKCMB.OUT /E C:\DQKRES.BIN
C:\CCEFX C:\DQKRES.BIN C:\DQKRES.TXT
C:\CCECL D:\DISK3\ECL.GLB 5 /E C:\DQKNE5.BIN /Q 0 /F 0 /N 6 /H 1 /Z 240 /D 4 /X 35 3 /X 273 29 /X 274 2
C:\CCECL D:\DISK3\ECL.GLB 5 /P C:\DQKNE5.BIN /E C:\DQKNCMB.BIN /3 0 /F 0 /N 6 /H 1 /Z 240 /D 4
C:\CCEFX C:\DQKNCMB.BIN C:\DQKNCMB.TXT
C:\CCCOMBAT /E C:\DQKNCMB.BIN D:\DISK2\MONCHA.GLB $combatSeed C:\DQKNCMB.TRC C:\DQKNCMB.OUT C:\DQKNCMB.RAW /R C:\DQKNCMB.GBR > C:\DQKNCOMB.TXT
C:\CCECL D:\DISK3\ECL.GLB 5 /R C:\DQKNCMB.BIN C:\DQKNCMB.OUT /E C:\DQKNRES.BIN
C:\CCEFX C:\DQKNRES.BIN C:\DQKNRES.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

Remove-Item (Join-Path $build 'DQKCMB.BIN'),
  (Join-Path $build 'DQKCMB.TXT'),
  (Join-Path $build 'DQKCMB.TRC'),
  (Join-Path $build 'DQKCMB.OUT'),
  (Join-Path $build 'DQKCMB.RAW'),
  (Join-Path $build 'DQKCMB.GBR'),
  (Join-Path $build 'DQKCOMB.TXT'),
  (Join-Path $build 'DQKRES.BIN'),
  (Join-Path $build 'DQKRES.TXT'),
  (Join-Path $build 'DQKNE5.BIN'),
  (Join-Path $build 'DQKNCMB.BIN'),
  (Join-Path $build 'DQKNCMB.TXT'),
  (Join-Path $build 'DQKNCMB.TRC'),
  (Join-Path $build 'DQKNCMB.OUT'),
  (Join-Path $build 'DQKNCMB.RAW'),
  (Join-Path $build 'DQKNCMB.GBR'),
  (Join-Path $build 'DQKNCOMB.TXT'),
  (Join-Path $build 'DQKNRES.BIN'),
  (Join-Path $build 'DQKNRES.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
if (-not $p.WaitForExit(60000)) {
  Stop-Process -Id $p.Id -Force
  throw 'CCECL DQK combat smoke timed out'
}

# ===========================================================================
#  DERIVED vs OBSERVED -- read this before touching any pin below.
#
#  These goldens were RE-DERIVED on 2026-09-10, not re-captured, after commit
#  0634e15 corrected the Gen2 ECL 0x27 TREASURE operand frame and area 5's
#  dragon encounter went from one monster group to the two its data describes.
#  A golden captured from the engine's own output can only prove the engine
#  agrees with itself, so every quantity below is classified:
#  Updated 2026-10-02: the oracle now reads both retail attack profiles and
#  follows the native secondary-before-primary cadence. It independently
#  accepts the fresh 48-row battles before their observed trace pin is used.
#  This validates the native scheduler against its sourced contract; it is
#  not a captured two-round battle in the original retail executable.
#
#  DERIVED (re-computed here from something that is not this engine's output):
#    * roster size and the enemy index -> monster-group partition, from the
#      GBEC/MONSTER records parsed out of the CCEFX dump (not from literals);
#    * every monster's maxHp / THAC0 / AC / damage dice / attack rate, read
#      straight from the retail DISK2\MONCHA.GLB bytes by Read-MonchaStats
#      below (HLIB pointer table + the 257-c MONCHA RLE + the DQK_L_ABIL
#      field offsets);
#    * every 'needed' column, which must factorise as
#      thac0(attacker) - ac(target) with ONE consistent AC per party member;
#    * every hp column, which must close as hpBefore - damage (reported
#      clamped at 0), and every 'slain' line, which must fire exactly when a
#      target's hp reaches 0;
#    * EVERY d20 roll and EVERY monster damage roll, recomputed from the
#      combat LCG (state = state*1664525 + 1013904223 mod 2^32, die(s) =
#      state mod s + 1) seeded with $combatSeed -- the same value the
#      CCCOMBAT command line above passes. The whole attack sequence has to
#      align contiguously at exactly one stream offset, and that offset has
#      to equal the roster size (one initiative draw per combatant).
#    * the outcome, the GBCR record count, the GBCR xp award and each GBCR
#      hp/maxHp pair, all recomputed from the trace.
#
#  OBSERVED (this engine's own choice; pinned as behaviour, not derived):
#    * the initiative ORDER and the AI's target selection -- which combatant
#      acts when and swings at whom;
#    * the party's synthesised stats (maxHp 14/12, AC 5/6, THAC0 15/16).
#      The /E roster's party is built by CCCOMBAT itself, not from retail
#      data, so there is nothing outside the engine to check it against.
#      Read-MonchaStats deliberately covers only the monsters.
#    * the party's damage dice. This trace has no party hit. If a future
#      observed trace has one, the established model consumes ONE draw for
#      it without deriving the value; party dice are outside this oracle.
#    * the GBCR version word.
#
#  NULL, measured 2026-09-10 (so this is not a check that passes on anything):
#  the previous 35-row golden that stood here passes the hp arithmetic, the
#  slain rule, the needed factorisation and the outcome rule -- it is a
#  self-consistent battle -- and is rejected outright by the LCG alignment,
#  which finds NO offset for it in 0..40. It was a battle fought by a party
#  whose synthesised AC was 2 better and THAC0 1 better than today's, i.e. a
#  stat drift on the party side that has nothing to do with the 0x27 frame.
# ===========================================================================

# Retail MONCHA.GLB reader: HLIB pointer table, the 257-c MONCHA run-length
# convention, and the fixed DQK record offsets (DQK_L_ABIL = 0x78; thac0 at
# +15, hitDice at +25, half-attacks at +59/+60, primary dice at +61/63/65,
# secondary dice at +62/64/66, AC at +67; XP
# at 0x54, name at 0x68). Mirrors tools/moncha_rle.py and the DQK_L_* block in
# native/src/cccombat.asm -- it exists so the trace is checked against RETAIL
# BYTES rather than against another copy of the engine's own numbers.
$combat = Get-Content (Join-Path $build 'DQKCMB.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0069 status=0003 geo=0002 chain=FFFF',
  'GBLF operands=0002 0000 D000',
  # Two groups, not one. Commit 0634e15 corrected the Gen2 0x27 TREASURE
  # operand frame from Gen1's (wordSet 8, countAt 0xff) to (4, 3); the old
  # frame's 18-byte skip swallowed an "IF_GT; LOAD_MONSTER 0034, mem[00C1],
  # 0034" pair at block offset 0x11A4, so this encounter emitted one record
  # while mem[00C1]=6 and mem[00C2]=4 were BOTH already populated below.
  # See docs/engine/research/ecl-gen2-treasure-operand-frame.md.
  'GBEC groups=0002',
  '@00 MONSTER id=0034 count=0006 pic=0034',
  '@01 MONSTER id=0025 count=0004 pic=0025',
  '@06 MEM key=00C1 value=0006',
  '@07 MEM key=00C2 value=0004',
  'GBRS flags=0001 area=0005 pc=11D0',
  '#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 0006 TEXT=DRAGONS',
  '#01 OP=11 PRINT ARGC=01 ARGS= 0006 TEXT= ATTACK!',
  'GBES setup sprite=00FF max=0000 pic=00FF distance=0000'
)) {
  if ($combat -notlike "*$needle*") {
    throw "CCECL DQK combat dump missing: $needle"
  }
}

$moncha = Join-Path $game 'DISK2\MONCHA.GLB'
$trace = @(Get-Content (Join-Path $build 'DQKCMB.TRC') | Where-Object { $_.Trim().Length -gt 0 })
. (Join-Path $PSScriptRoot 'dqk-combat-oracle.ps1')
# The /E roster's two-member party is the built-in fixture's, placed at p0 (4,5), p1 (4,6) (cccombat.asm fixture1),
# not the (3, ncomb+2) cells a /P roster gets; the oracle's reach model needs the real cells.
$builtinEPartyPositions = @{ p0 = @(4, 5); p1 = @(4, 6) }

# Re-derived 2026-10-07 for the DQK random-target AI (retail 0x2DE10, docs/engine/research/dqk-npc-ai-body.md 4.2):
# this is the trace the independent oracle (dqk-combat-oracle.ps1) ACCEPTS -- every victim equals the in-reach foe
# the LCG stream's die(m) draw selects, every d20/damage lines up at one stream offset -- not a recapture
# trusted on its own.  It replaces the weakest-foe trace (48 rows) the base build produced.
$expectedTrace = @(
  '1 init p0 - - - - - - -',
  '1 init p1 - - - - - - -',
  '1 init e0 - - - - - - -',
  '1 init e1 - - - - - - -',
  '1 init e2 - - - - - - -',
  '1 init e3 - - - - - - -',
  '1 init e4 - - - - - - -',
  '1 init e5 - - - - - - -',
  '1 init e6 - - - - - - -',
  '1 init e7 - - - - - - -',
  '1 init e8 - - - - - - -',
  '1 init e9 - - - - - - -',
  '1 move e9 - - - - - - - 7 3',
  '1 move e9 - - - - - - - 6 3',
  '1 move e9 - - - - - - - 5 3',
  '1 move e8 - - - - - - - 6 7',
  '1 move e8 - - - - - - - 5 7',
  '1 move e8 - - - - - - - 4 7',
  '1 attack e8 p1 16 10 1 3 9 -',
  '1 attack e1 p0 20 10 1 7 7 -',
  '1 attack e1 p1 13 9 1 4 5 -',
  '1 attack e1 p0 14 10 1 1 6 -',
  '1 move e7 - - - - - - - 7 6',
  '1 move e7 - - - - - - - 6 7',
  '1 move e7 - - - - - - - 5 7',
  '1 attack e7 p1 4 10 0 - 5 -',
  '1 attack p0 e0 18 11 1 2 16 -',
  '1 attack e0 p0 16 10 1 3 3 -',
  '1 attack e0 p0 18 10 1 1 2 -',
  '1 attack e0 p0 8 10 0 - 2 -',
  '1 attack e2 p1 9 9 1 8 0 -',
  '1 slain e2 p1 - - - - 0 0',
  '1 attack e2 p0 19 10 1 2 0 -',
  '1 slain e2 p0 - - - - 0 0',
  '1 end - enemy - - - - - -'
)
$facts = Assert-DerivedCombat -Label 'CCCOMBAT DQK queued' -DumpText $combat -Trace $trace -MonchaPath $moncha -Seed $combatSeed -PartyPositions $builtinEPartyPositions
if ($trace.Count -ne $expectedTrace.Count) {
  throw "CCCOMBAT DQK trace length mismatch: expected $($expectedTrace.Count), got $($trace.Count)"
}
for ($i = 0; $i -lt $expectedTrace.Count; $i++) {
  if ($trace[$i] -ne $expectedTrace[$i]) {
    throw "CCCOMBAT DQK trace line $($i + 1) expected '$($expectedTrace[$i])', got '$($trace[$i])'"
  }
}

$outcome = (Get-Content (Join-Path $build 'DQKCMB.OUT') -Raw).Trim()
if ($outcome -ne $facts.Outcome) {
  throw "CCCOMBAT DQK outcome expected $($facts.Outcome) (the trace's own end row), got $outcome"
}
$raw = [IO.File]::ReadAllBytes((Join-Path $build 'DQKCMB.RAW'))
if ([BitConverter]::ToUInt16($raw, 0) -ne 320 -or [BitConverter]::ToUInt16($raw, 2) -ne 200) {
  throw 'CCCOMBAT DQK tactical RAW was not 320x200'
}

$gbcr = [IO.File]::ReadAllBytes((Join-Path $build 'DQKCMB.GBR'))
Assert-DerivedGbcr -Label 'CCCOMBAT DQK queued' -Gbcr $gbcr -Facts $facts

$resume = Get-Content (Join-Path $build 'DQKRES.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0000 status=0000 geo=FFFF',
  'GBRS flags=0000 area=0005 pc=11DC',
  '@00 MEM key=002D value=0000',
  'MEM key=001B value=0005',
  'GBSX count=0000',
  'GBCL clock= 0000 0000 0000 0000 0000 0000 0000'
)) {
  if ($resume -notlike "*$needle*") {
    throw "CCECL DQK combat resume dump missing: $needle"
  }
}

$natural = Get-Content (Join-Path $build 'DQKNCMB.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0069 status=0003 geo=0002 chain=FFFF',
  'GBLF operands=0002 0000 D000',
  'GBEC groups=0002',
  '@00 MONSTER id=0034 count=0006 pic=0034',
  '@01 MONSTER id=0025 count=0004 pic=0025',
  'GBRS flags=0001 area=0005 pc=11D0',
  '@03 MEM key=0023 value=0000',
  '@05 MEM key=0112 value=0010',
  '@07 MEM key=00C1 value=0006',
  '@09 MEM key=00CB value=0005',
  '@0A MEM key=00CA value=000E',
  '@0B MEM key=00CC value=00E5',
  '@0F MEM key=00C2 value=0004',
  '#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 0006 TEXT=DRAGONS',
  '#01 OP=11 PRINT ARGC=01 ARGS= 0006 TEXT= ATTACK!'
)) {
  if ($natural -notlike "*$needle*") {
    throw "CCECL DQK natural E5 combat dump missing: $needle"
  }
}

$naturalTrace = @(Get-Content (Join-Path $build 'DQKNCMB.TRC') | Where-Object { $_.Trim().Length -gt 0 })
$naturalFacts = Assert-DerivedCombat -Label 'CCCOMBAT DQK natural E5' -DumpText $natural -Trace $naturalTrace -MonchaPath $moncha -Seed $combatSeed -PartyPositions $builtinEPartyPositions
if ($naturalTrace.Count -ne $expectedTrace.Count) {
  throw "CCCOMBAT DQK natural E5 trace length mismatch: expected $($expectedTrace.Count), got $($naturalTrace.Count)"
}
for ($i = 0; $i -lt $expectedTrace.Count; $i++) {
  if ($naturalTrace[$i] -ne $expectedTrace[$i]) {
    throw "CCCOMBAT DQK natural E5 trace line $($i + 1) expected '$($expectedTrace[$i])', got '$($naturalTrace[$i])'"
  }
}

$naturalOutcome = (Get-Content (Join-Path $build 'DQKNCMB.OUT') -Raw).Trim()
if ($naturalOutcome -ne $naturalFacts.Outcome) {
  throw "CCCOMBAT DQK natural E5 outcome expected $($naturalFacts.Outcome), got $naturalOutcome"
}
$naturalRaw = [IO.File]::ReadAllBytes((Join-Path $build 'DQKNCMB.RAW'))
if ([BitConverter]::ToUInt16($naturalRaw, 0) -ne 320 -or [BitConverter]::ToUInt16($naturalRaw, 2) -ne 200) {
  throw 'CCCOMBAT DQK natural E5 tactical RAW was not 320x200'
}

$naturalGbcr = [IO.File]::ReadAllBytes((Join-Path $build 'DQKNCMB.GBR'))
Assert-DerivedGbcr -Label 'CCCOMBAT DQK natural E5' -Gbcr $naturalGbcr -Facts $naturalFacts
if ($naturalGbcr.Length -ne $gbcr.Length) {
  throw 'CCCOMBAT DQK natural E5 GBCR sidecar length mismatch'
}
for ($i = 0; $i -lt $gbcr.Length; $i++) {
  if ($naturalGbcr[$i] -ne $gbcr[$i]) {
    throw "CCCOMBAT DQK natural E5 GBCR sidecar byte $i mismatch"
  }
}

$naturalResume = Get-Content (Join-Path $build 'DQKNRES.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0000 status=0000 geo=FFFF',
  'GBRS flags=0000 area=0005 pc=11DC',
  'MEM key=001B value=0005',
  'MEM key=00CC value=00E5',
  'GBSX count=0000'
)) {
  if ($naturalResume -notlike "*$needle*") {
    throw "CCECL DQK natural E5 combat resume dump missing: $needle"
  }
}

Write-Output "RESULT: CCECL+CCCOMBAT DQK area-5 queued and natural-E5 encounter combat/resume PASS ($($facts.Groups.Count) groups, $(($facts.Groups | Measure-Object Count -Sum).Sum) enemies, $($trace.Count) trace rows, LCG offset $($facts.RngOffset))"
