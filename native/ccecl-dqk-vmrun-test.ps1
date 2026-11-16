# DQK Gen2 vmRun1 handler smoke.
#
# Pins CCECL's native /Q entry point for DQK per-step main-loop scripts. /Q is
# distinct from /J SearchLocation: it enters the first far pointer, preserves the
# full packed cell descriptor word, and seeds DQK's raw facing ordinal at 0x0011.
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
  Write-Output 'SKIP: CCECL DQK vmRun1 (DOSBox.exe absent)'
  exit 0
}

foreach ($name in @(
  'DISK3\ECL.GLB'
)) {
  if (-not (Test-Path (Join-Path $game $name))) {
    Write-Output "SKIP: CCECL DQK vmRun1 ($name absent)"
    exit 0
  }
}

$gameMount = New-RetailStage -Source $game
& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

$conf = Join-Path $build '_ccecl_dqk_vmrun_test.conf'
$eclDump = Join-Path $build 'ECLDMP'
if (Test-Path $eclDump) { Remove-Item -Recurse -Force $eclDump }
New-Item -ItemType Directory -Force $eclDump | Out-Null
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$gameMount"
D:
C:\CCECL D:\DISK3\ECL.GLB 18 /E C:\DQKQ.BIN /Q 257 /F 0 /N 6 /H 1 /Z 200 /D 4 /X 35 7
C:\CCEFX C:\DQKQ.BIN C:\DQKQ.TXT
C:\CCECL D:\DISK3\ECL.GLB 18 /E C:\DQKJ.BIN /J 22 /F 2 /N 6 /H 1 /Z 200 /D 4
C:\CCEFX C:\DQKJ.BIN C:\DQKJ.TXT
C:\CCHLIB X D:\DISK3\ECL.GLB 5 C:\ECLDMP
C:\CCECL D:\DISK3\ECL.GLB 5 /E C:\DQK5Q.BIN /Q 0 /F 0 /N 6 /H 1 /Z 240 /D 4 /X 35 4 /X 62 240
C:\CCEFX C:\DQK5Q.BIN C:\DQK5Q.TXT
C:\CCECL D:\DISK3\ECL.GLB 5 /E C:\DQK5N1.BIN /Q 3 /F 0 /N 6 /H 1 /Z 240 /D 4 /X 273 3 /X 274 2
C:\CCEFX C:\DQK5N1.BIN C:\DQK5N1.TXT
C:\CCECL D:\DISK3\ECL.GLB 5 /E C:\DQK5N2.BIN /Q 7 /F 0 /N 6 /H 1 /Z 240 /D 4 /X 273 5 /X 274 4
C:\CCEFX C:\DQK5N2.BIN C:\DQK5N2.TXT
C:\CCECL D:\DISK3\ECL.GLB 5 /E C:\DQK5E5.BIN /Q 0 /F 0 /N 6 /H 1 /Z 240 /D 4 /X 35 3 /X 273 29 /X 274 2
C:\CCEFX C:\DQK5E5.BIN C:\DQK5E5.TXT
C:\CCECL D:\DISK3\ECL.GLB 5 /P C:\DQK5E5.BIN /E C:\DQK5E5S.BIN /3 0 /F 0 /N 6 /H 1 /Z 240 /D 4
C:\CCEFX C:\DQK5E5S.BIN C:\DQK5E5S.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

Remove-Item (Join-Path $build 'DQKQ.BIN'),
  (Join-Path $build 'DQKQ.TXT'),
  (Join-Path $build 'DQKJ.BIN'),
  (Join-Path $build 'DQKJ.TXT'),
  (Join-Path $build 'DQK5Q.BIN'),
  (Join-Path $build 'DQK5Q.TXT'),
  (Join-Path $build 'DQK5N1.BIN'),
  (Join-Path $build 'DQK5N1.TXT'),
  (Join-Path $build 'DQK5N2.BIN'),
  (Join-Path $build 'DQK5N2.TXT'),
  (Join-Path $build 'DQK5E5.BIN'),
  (Join-Path $build 'DQK5E5.TXT'),
  (Join-Path $build 'DQK5E5S.BIN'),
  (Join-Path $build 'DQK5E5S.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
if (-not $p.WaitForExit(60000)) {
  Stop-Process -Id $p.Id -Force
  throw 'CCECL DQK vmRun1 smoke timed out'
}

$vmrun = Get-Content (Join-Path $build 'DQKQ.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0000 status=0000 geo=FFFF',
  '@00 MEM key=002D value=0101',
  '@01 MEM key=0011 value=0000',
  '@02 MEM key=001B value=0012',
  '@03 MEM key=0023 value=0007',
  'MEM key=00CC value=0101',
  'MEM key=00BF value=0001'
)) {
  if ($vmrun -notlike "*$needle*") {
    throw "CCECL DQK /Q vmRun1 dump missing: $needle"
  }
}

$search = Get-Content (Join-Path $build 'DQKJ.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0020 status=0000 geo=FFFF',
  '@00 MEM key=002D value=0016',
  '@01 MEM key=0011 value=0002',
  '@02 MEM key=001B value=0012',
  '#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 0005 TEXT=TAVERN'
)) {
  if ($search -notlike "*$needle*") {
    throw "CCECL DQK /J SearchLocation regression dump missing: $needle"
  }
}

$area5 = [IO.File]::ReadAllBytes((Join-Path $eclDump 'D0005.HTD'))
if ($area5.Length -lt 0x2739 -or
    [BitConverter]::ToUInt16($area5, 2) -ne 0x8429 -or
    [BitConverter]::ToUInt16($area5, 6) -ne 0x8847 -or
    [BitConverter]::ToUInt16($area5, 14) -ne 0x83FD) {
  throw 'CCECL DQK area-5 ECL member did not expose the expected vmRun1/SearchLocation/slot-3 pointers'
}

[byte[]]$area5VmRunTable = 0x25,0x01,0x23,0x00,0x00,0x08,0x01,0xC9,0xA5,0x01,0xDD,0xA5,0x01,0xF3,0xA5,0x01,0x07,0xA6,0x01,0x1D,0xA6,0x01,0x31,0xA6,0x01,0x47,0xA6,0x01,0x5B,0xA6
for ($i = 0; $i -lt $area5VmRunTable.Length; $i++) {
  if ($area5[0x043B + $i] -ne $area5VmRunTable[$i]) {
    throw "CCECL DQK area-5 vmRun1 selector table byte $i changed"
  }
}

[byte[]]$area5TravelGate = 0x14,0x01,0xBF,0x00,0x00,0x01,0x01,0x3E,0x00,0x00,0xF0,0x16,0x01,0x01,0x39,0xA7,0x14,0x01,0xBF,0x00,0x00,0x00,0x01,0x3E,0x00,0x00,0xF1,0x16,0x01,0x01,0x39,0xA7
for ($i = 0; $i -lt $area5TravelGate.Length; $i++) {
  if ($area5[0x2703 + $i] -ne $area5TravelGate[$i]) {
    throw "CCECL DQK area-5 vmRun1 travel gate byte $i changed"
  }
}

# Retail area 5 generates the dragon-group quantities rather than taking them
# from CCECL's direct-entry host seed. RANDOM #5 + ADD yields C1=5..9, and
# RANDOM #3 + ADD yields C2=3..5; the second group consumes C2 directly.
[byte[]]$area5DragonRolls = 0x08,0x00,0x05,0x01,0xC1,0x00,0x04,0x00,0x05,0x01,0xC1,0x00,0x01,0xC1,0x00,0x08,0x00,0x03,0x01,0xC2,0x00,0x04,0x00,0x03,0x01,0xC2,0x00,0x01,0xC2,0x00
for ($i = 0; $i -lt $area5DragonRolls.Length; $i++) {
  if ($area5[0x1167 + $i] -ne $area5DragonRolls[$i]) {
    throw "CCECL DQK area-5 retail dragon quantity byte $i changed"
  }
}

$area5Vmrun = Get-Content (Join-Path $build 'DQK5Q.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0000 status=0000 geo=FFFF',
  '@02 MEM key=001B value=0005',
  '@03 MEM key=0023 value=0004',
  '@04 MEM key=003E value=00F0',
  'MEM key=0112 value=0001'
)) {
  if ($area5Vmrun -notlike "*$needle*") {
    throw "CCECL DQK area-5 /Q vmRun1 audit dump missing: $needle"
  }
}
if ($area5Vmrun -like '*status=0003*' -or $area5Vmrun -like '*GBEC groups=*') {
  throw 'CCECL DQK area-5 vmRun1 audit unexpectedly yielded tactical combat'
}

$area5NaturalShipGate = Get-Content (Join-Path $build 'DQK5N1.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0020 status=0000 geo=FFFF',
  '@02 MEM key=001B value=0005',
  '@03 MEM key=0111 value=0003',
  '@04 MEM key=0112 value=0002',
  '@09 MEM key=00CA value=000D',
  '#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 001E TEXT=YOU NEED A SHIP TO TRAVEL ON THE'
)) {
  if ($area5NaturalShipGate -notlike "*$needle*") {
    throw "CCECL DQK area-5 natural ship-gate vmRun dump missing: $needle"
  }
}
if ($area5NaturalShipGate -like '*status=0003*' -or $area5NaturalShipGate -like '*GBEC groups=*') {
  throw 'CCECL DQK area-5 natural ship-gate vmRun branch unexpectedly yielded tactical combat'
}

$area5NaturalShipOffer = Get-Content (Join-Path $build 'DQK5N2.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0020 status=0000 geo=FFFF',
  '@02 MEM key=001B value=0005',
  '@03 MEM key=0111 value=0005',
  '@04 MEM key=0112 value=0003',
  '@09 MEM key=00CA value=000C',
  '#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 0042 TEXT=A FISHERMAN VOLUNTEERS TO SAIL Y',
  '#01 OP=22 PARTY_SURPRISE ARGC=00'
)) {
  if ($area5NaturalShipOffer -notlike "*$needle*") {
    throw "CCECL DQK area-5 natural ship-offer vmRun dump missing: $needle"
  }
}
if ($area5NaturalShipOffer -like '*status=0003*' -or $area5NaturalShipOffer -like '*GBEC groups=*') {
  throw 'CCECL DQK area-5 natural ship-offer vmRun branch unexpectedly yielded tactical combat'
}

$area5NaturalDragonSeed = Get-Content (Join-Path $build 'DQK5E5.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0000 status=0000 geo=FFFF',
  '@02 MEM key=001B value=0005',
  '@03 MEM key=0023 value=0003',
  '@04 MEM key=0111 value=001E',
  '@05 MEM key=0112 value=0003',
  '@09 MEM key=00CB value=0005',
  '@0A MEM key=00CA value=000E',
  '@0B MEM key=00CC value=00E5',
  'GBSX count=0000'
)) {
  if ($area5NaturalDragonSeed -notlike "*$needle*") {
    throw "CCECL DQK area-5 natural E5 vmRun dump missing: $needle"
  }
}
if ($area5NaturalDragonSeed -like '*status=0003*' -or $area5NaturalDragonSeed -like '*GBEC groups=*') {
  throw 'CCECL DQK area-5 natural E5 vmRun branch unexpectedly yielded tactical combat'
}

$area5NaturalDragonSlot3 = Get-Content (Join-Path $build 'DQK5E5S.TXT') -Raw
# RE-DERIVED 2026-09-10 from a fresh run, NOT hand-edited to match a prediction.
# Context: ccecl.asm's Gen2 0x27 TREASURE operand frame was corrected from the
# base table's (wordSet 8, countAt 0xff) -- which is the Gen1 CoK frame -- to
# (4, 3). Of the six needles that were wrong here, FIVE were already stale
# before that change (they miss against the pre-change dump too) and only
# 'GBEC groups=0001' was moved by it.
#
# Measured control, same machine, same data, one variable: rebuilding ccecl.asm
# from the pre-change source reproduces 'GBEC groups=0001' with a single
# '@00 MONSTER id=0025 count=0004' record, and the ONLY difference across all
# three DQK5* dumps is this encounter's record list. DQK5N2.TXT and DQK5E5.TXT
# are byte-identical before and after, so the frame change is surgical rather
# than a broad behavioural shift.
#
# The old '#04 OP=27 TREASURE ARGC=08 ...' needle is NOT replaced by the
# 'ARGC=04' line the frame change would predict, because TREASURE is SKIPPED on
# this route: neither build's dump contains any OP=27 record at all. The needle
# described an instruction this path never reaches, so it is replaced by the
# four script records the path does produce.
#
# THE DISCRIMINATING PIN is the correspondence between the monster records and
# the populated memory slots: C1=6 -> id=0034 count=0006 and C2=4 -> id=0025
# count=0004. Under (8, 0xff) the skip overran and swallowed the
# 'IF_GT; LOAD_MONSTER 0034, mem[00C1], 0034' pair, leaving BOTH slots populated
# while only ONE record was emitted. That asymmetry is how a truncated 2-group
# encounter is distinguished from a genuine 1-group one, so pinning the slots
# and the records together is what makes a future truncation visible.
# See docs/engine/research/ecl-gen2-treasure-operand-frame.md.
foreach ($needle in @(
  'GBEF v0009 flags=0069 status=0003 geo=0002',
  'GBEC groups=0002',
  '@00 MONSTER id=0034 count=0006 pic=0034',
  '@01 MONSTER id=0025 count=0004 pic=0025',
  '@02 MEM key=001B value=0005',
  '@05 MEM key=0112 value=0010',
  '@07 MEM key=00C1 value=0006',
  '@09 MEM key=00CB value=0005',
  '@0A MEM key=00CA value=000E',
  '@0B MEM key=00CC value=00E5',
  '@0F MEM key=00C2 value=0004',
  'GBSX count=0004',
  '#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 0006 TEXT=DRAGONS',
  '#01 OP=11 PRINT ARGC=01 ARGS= 0006 TEXT= ATTACK!',
  '#02 OP=1D PARTYSTRENGTH ARGC=01 ARGS= 00F0',
  '#03 OP=2C PARLAY ARGC=01 ARGS= 0023'
)) {
  if ($area5NaturalDragonSlot3 -notlike "*$needle*") {
    throw "CCECL DQK area-5 natural E5 slot-3 dump missing: $needle"
  }
}

function Get-EffectMemValue([string]$Text, [string]$Key) {
  $match = [regex]::Match($Text, "(?m)^@(?:[0-9A-F]{2}) MEM key=$Key value=([0-9A-F]{4})\r?$")
  if (-not $match.Success) {
    throw "CCECL DQK area-5 natural E5 slot-3 dump did not expose MEM[$Key]"
  }
  return [Convert]::ToInt32($match.Groups[1].Value, 16)
}

$dragonC1 = Get-EffectMemValue $area5NaturalDragonSlot3 '00C1'
$dragonC2 = Get-EffectMemValue $area5NaturalDragonSlot3 '00C2'
if ($dragonC1 -lt 5 -or $dragonC1 -gt 9 -or $dragonC2 -lt 3 -or $dragonC2 -gt 5) {
  throw "CCECL DQK area-5 dragon quantities are outside the retail RANDOM/ADD ranges: C1=$dragonC1 C2=$dragonC2"
}
if ($area5NaturalDragonSlot3 -notlike ("*@00 MONSTER id=0034 count={0:X4} pic=0034*" -f $dragonC1) -or
    $area5NaturalDragonSlot3 -notlike ("*@01 MONSTER id=0025 count={0:X4} pic=0025*" -f $dragonC2)) {
  throw 'CCECL DQK area-5 dragon groups do not retain the retail-generated C1/C2 quantities'
}

Write-Output 'RESULT: CCECL DQK /Q vmRun1 and word /J SearchLocation seed flow PASS'
