# GBBOOT DQK headless event-dispatch combat flow.
#
# Runs DQK area 5 through GBBOOT's native /E path using the proven
# far-pointer slot-3 encounter dispatcher, then verifies CCCOMBAT resolution,
# GBCR output, and CCECL resume.
param(
  [switch]$Headless
)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$source = Join-Path $root 'The Dark Queen of Krynn'
$run = Join-Path $build 'gbdqk-combat-flow-test'
$oracle = Join-Path $native 'dqk-combat-oracle.ps1'
. $oracle
$dosbox = Join-Path $source 'DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT DQK combat flow (DOSBox.exe absent)'
  exit 0
}

foreach ($name in @(
  'DQK.EXE',
  'SAVGAMA.QSV',
  'DISK2\MONCHA.GLB',
  'DISK2\8X8DB.TLB',
  'DISK2\8X8DC.TLB',
  'DISK3\ECL.GLB',
  'DISK3\GEO.GLB'
)) {
  if (-not (Test-Path (Join-Path $source $name))) {
    Write-Output "SKIP: GBBOOT DQK combat flow ($name absent)"
    exit 0
  }
}

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
foreach ($dir in @('DISK2', 'DISK3')) {
  New-Item -ItemType Directory -Force (Join-Path $run $dir) | Out-Null
}
foreach ($name in @(
  'DQK.EXE',
  'SAVGAMA.QSV',
  'DISK2\MONCHA.GLB',
  'DISK2\8X8DB.TLB',
  'DISK2\8X8DC.TLB',
  'DISK3\ECL.GLB',
  'DISK3\GEO.GLB'
)) {
  Copy-Item (Join-Path $source $name) (Join-Path $run $name) -Force
}

function Set-Session([int]$x, [int]$y, [int]$facing, [int]$w, [int]$h) {
  $s = New-Object byte[] 16
  [Text.Encoding]::ASCII.GetBytes('GBSN').CopyTo($s, 0)
  [BitConverter]::GetBytes([uint16]1).CopyTo($s, 4)
  [BitConverter]::GetBytes([uint16]$x).CopyTo($s, 6)
  [BitConverter]::GetBytes([uint16]$y).CopyTo($s, 8)
  [BitConverter]::GetBytes([uint16]$facing).CopyTo($s, 10)
  [BitConverter]::GetBytes([uint16]$w).CopyTo($s, 12)
  [BitConverter]::GetBytes([uint16]$h).CopyTo($s, 14)
  [IO.File]::WriteAllBytes((Join-Path $build '_GBSESS.GBS'), $s)
}

function Assert-RawFrame([string]$Path, [string]$Label, [int]$MinColors = 4) {
  $raw = [IO.File]::ReadAllBytes($Path)
  if ($raw.Length -ne (4 + (320 * 200) + 768) -or
      [BitConverter]::ToUInt16($raw, 0) -ne 320 -or
      [BitConverter]::ToUInt16($raw, 2) -ne 200) {
    throw "$Label RAW was not a valid 320x200 frame"
  }
  $seen = New-Object bool[] 256
  $nonzero = 0
  $colors = 0
  for ($i = 4; $i -lt (4 + (320 * 200)); $i++) {
    $px = $raw[$i]
    if ($px -ne 0) {
      $nonzero++
    }
    if (-not $seen[$px]) {
      $seen[$px] = $true
      $colors++
    }
  }
  if ($nonzero -lt 1000 -or $colors -lt $MinColors) {
    throw "$Label RAW was blank or low-detail (nonzero=$nonzero colors=$colors)"
  }
}

$conf = Join-Path $build '_gbdqk_combat_flow_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X /A 5 /3 0 > C:\DQKGB3.TXT
C:\CCEFX C:\_GBEVT.BIN C:\DQKGB3_E.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

Remove-Item (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.WGR'),
  (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBEVT.BIN'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build 'DQKGB3.TXT'),
  (Join-Path $build 'DQKGB3_E.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT DQK combat flow timed out'
}

# `/3 0` enters the retail vmRun1 phase first.  It produces this event state,
# then GBBOOT detects CA/CB/CC and resumes slot 3 from the emitted effect.  The
# old test inspected the final (second-phase) seed sidecar and called its
# intentionally cleared bootstrap keys a failure, which did not test either
# phase's behavior.
$vmrun = [IO.File]::ReadAllBytes((Join-Path $build '_GBEVT.BIN'))
if ($vmrun.Length -le 0 -or -not (Test-Path (Join-Path $build 'DQKGB3_E.TXT'))) {
  throw 'GBBOOT DQK combat flow did not retain the vmRun1 event effect'
}
$vmrunText = Get-Content (Join-Path $build 'DQKGB3_E.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0000 status=0000 geo=FFFF',
  'MEM key=0023 value=0003',
  'MEM key=0111 value=001E',
  'MEM key=0112 value=0003',
  'MEM key=00CB value=0005',
  'MEM key=00CA value=000E',
  'MEM key=00CC value=00E5'
)) {
  if ($vmrunText -notlike "*$needle*") {
    throw "GBBOOT DQK combat flow vmRun1 dump missing: $needle"
  }
}

$combat = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0069 status=0003 geo=0002 chain=FFFF',
  'GBLF operands=0002 0000 D000',
  'GBEC groups=0001',
  '@00 MONSTER id=002E count=0004 pic=002E',
  '#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 0006 TEXT=DRAGONS',
  '#01 OP=11 PRINT ARGC=01 ARGS= 0006 TEXT= ATTACK!'
)) {
  if ($combat -notlike "*$needle*") {
    throw "GBBOOT DQK combat flow dump missing: $needle"
  }
}
$combatMem = @{}
foreach ($m in ([regex]'MEM key=([0-9A-F]{4}) value=([0-9A-F]{4})').Matches($combat)) {
  $combatMem[$m.Groups[1].Value] = [Convert]::ToInt32($m.Groups[2].Value, 16)
}
foreach ($word in @(@('00C1', 5, 9), @('00C2', 3, 5))) {
  if (-not $combatMem.ContainsKey($word[0]) -or
      $combatMem[$word[0]] -lt $word[1] -or $combatMem[$word[0]] -gt $word[2]) {
    $actual = if ($combatMem.ContainsKey($word[0])) { $combatMem[$word[0]] } else { 'absent' }
    throw "GBBOOT DQK combat flow ECL word $($word[0]) is $actual, outside retail range {$($word[1])..$($word[2])}"
  }
}

$trace = @(Get-Content (Join-Path $build '_GBCOMB.TRC') | Where-Object { $_.Trim().Length -gt 0 })
function Assert-DqkQsvCombatTrace($Trace, [string]$Label) {
  if ($Trace.Count -lt 20 -or
      $Trace[0] -ne '1 init p0 - - - - - - -' -or
      $Trace[5] -ne '1 init p5 - - - - - - -' -or
      $Trace[6] -ne '1 init e0 - - - - - - -' -or
      $Trace[7] -ne '1 init e1 - - - - - - -' -or
      $Trace[9] -ne '1 init e3 - - - - - - -' -or
      $Trace[-1] -notlike '* end - enemy - - - - - -') {
    throw "$Label combat trace did not include the six-member QSV party and four-dragon enemy terminal"
  }
}

function Assert-DqkQsvGbcr($Bytes, [string]$Label, [array]$ExpectedMaxHp = @(140, 101, 85, 87, 84, 73)) {
  if ($Bytes.Length -ne 52 -or
      [Text.Encoding]::ASCII.GetString($Bytes, 0, 4) -ne 'GBCR' -or
      [BitConverter]::ToUInt16($Bytes, 4) -ne 1 -or
      [BitConverter]::ToUInt16($Bytes, 6) -ne 1 -or
      [BitConverter]::ToUInt16($Bytes, 10) -ne 6) {
    throw "$Label GBCR sidecar did not describe six enemy-result records"
  }
  for ($i = 0; $i -lt $ExpectedMaxHp.Count; $i++) {
    $o = 16 + ($i * 6)
    if ($Bytes[$o] -ne $i -or
        [BitConverter]::ToInt16($Bytes, $o + 4) -ne $ExpectedMaxHp[$i]) {
      throw "$Label GBCR record $i did not preserve the QSV party max HP row"
    }
  }
}

function Assert-DqkGbprMeta([string]$Path, [array]$ExpectedHp, [array]$ExpectedMaxHp, [array]$ExpectedCond, [array]$ExpectedClass, [string]$Label) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ne 2476 -or
      [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne 'GBPR' -or
      [BitConverter]::ToUInt16($bytes, 6) -ne 6 -or
      [BitConverter]::ToUInt16($bytes, 10) -ne 1) {
    throw "$Label GBPR sidecar was not a six-member compact DQK roster"
  }
  for ($i = 0; $i -lt 6; $i++) {
    $meta = 16 + ($i * 410) + 1 + 216
    if ([Text.Encoding]::ASCII.GetString($bytes, $meta, 4) -ne 'GBD1' -or
        ([BitConverter]::ToUInt16($bytes, $meta + 4) -band 2) -ne 2 -or
        [BitConverter]::ToInt16($bytes, $meta + 6) -ne $ExpectedHp[$i] -or
        [BitConverter]::ToInt16($bytes, $meta + 26) -ne $ExpectedMaxHp[$i] -or
        [BitConverter]::ToUInt16($bytes, $meta + 24) -ne @(0, 2, 1, 8)[$ExpectedCond[$i]] -or
        $bytes[$meta + 18] -ne $ExpectedClass[$i]) {
      throw "$Label GBPR compact meta row $i did not preserve expected HP/maxHP/condition/class"
    }
  }
}

function Assert-DqkQsvPartyOutput([string]$Path, [string]$Label) {
  $text = Get-Content $Path -Raw
  foreach ($needle in @(
    'slot 1: SIR DRYDEN',
    'slot 2: JORIS THE WISE',
    'slot 3: LENDUIRA',
    'slot 4: NEACAIL',
    'slot 5: ALARIC THE BOLD',
    'slot 6: MAIGUREIGNE',
    'CCPARTY: loaded 6 member(s)'
  )) {
    if ($text -notlike "*$needle*") {
      throw "$Label did not materialize QSV party member: $needle"
    }
  }
}

Assert-DqkQsvCombatTrace $trace 'GBBOOT DQK slot-3'

$outcome = (Get-Content (Join-Path $build '_GBCOMB.OUT') -Raw).Trim()
if ($outcome -ne 'enemy') {
  throw "GBBOOT DQK combat outcome expected enemy, got $outcome"
}

Assert-RawFrame (Join-Path $build '_GBCOMB.RAW') 'GBBOOT DQK slot-3 combat'

$gbcr = [IO.File]::ReadAllBytes((Join-Path $build '_GBCR.BIN'))
$slotFacts = Assert-DerivedCombat -Label 'GBBOOT DQK slot-3' -DumpText $combat -Trace $trace -MonchaPath (Join-Path $run 'DISK2\MONCHA.GLB') -Seed 4660
if ($slotFacts.Outcome -ne 'enemy' -or $slotFacts.RearReactionCount -ne 1) { throw 'GBBOOT DQK slot-3 independent combat oracle disagreed with the four-dragon result' }
$null = Assert-DerivedGbcr -Label 'GBBOOT DQK slot-3' -Gbcr $gbcr -Facts $slotFacts
Assert-DqkQsvPartyOutput (Join-Path $build 'DQKGB3.TXT') 'GBBOOT DQK slot-3'
Assert-DqkGbprMeta (Join-Path $build '_GBPARTY.GBP') @(0, 0, 0, 0, 0, 0) @(140, 101, 85, 87, 84, 73) @(1, 1, 1, 1, 1, 1) @(1, 2, 1, 4, 1, 2) 'GBBOOT DQK slot-3'

$resume = Get-Content (Join-Path $build '_GBRES.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0000 status=0000 geo=FFFF',
  'GBRS flags=0000 area=0005 pc=11DC rng=1DE921E7 callsp=0000',
  'MEM key=0011 value=0000',
  'GBSX count=0000'
)) {
  if ($resume -notlike "*$needle*") {
    throw "GBBOOT DQK combat resume dump missing: $needle"
  }
}

$naturalConf = Join-Path $build '_gbdqk_natural_combat_flow_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /T 1 /A 5 > C:\DQKNAT.TXT
C:\CCEFX C:\_GBEVT.BIN C:\DQKNAT_E.TXT
C:\CCEFX C:\_GBECL.BIN C:\DQKNAT_C.TXT
C:\CCEFX C:\_GBRES.BIN C:\DQKNAT_R.TXT
exit
"@ | Set-Content $naturalConf -Encoding ASCII

Remove-Item (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.WGR'),
  # The direct slot-3 control above writes its post-combat result into the
  # shared transient GBPR.  The natural stage is meant to start from the
  # copied retail QSV, as gbdqk-playable-flow-test.ps1 does; otherwise it
  # inherits the control fight's already-damaged roster and tests a different
  # scenario.
  (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBEVT.BIN'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build 'DQKNAT.TXT'),
  (Join-Path $build 'DQKNAT_E.TXT'),
  (Join-Path $build 'DQKNAT_C.TXT'),
  (Join-Path $build 'DQKNAT_R.TXT') -Force -ErrorAction SilentlyContinue

# From (0,1) facing north, CCFP steps to (0,0). GBBOOT now converts that DQK
# pose into the host-owned vmRun rows that select the natural area-5 dragon path.
Set-Session 0 1 0 10 10
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $naturalConf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT DQK natural combat flow timed out'
}

$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
if ($step.Length -ne 14 -or
    [Text.Encoding]::ASCII.GetString($step, 0, 4) -ne 'GBST' -or
    [BitConverter]::ToUInt16($step, 4) -ne 1 -or
    [BitConverter]::ToUInt16($step, 6) -ne 128 -or
    [BitConverter]::ToUInt16($step, 8) -ne 0 -or
    [BitConverter]::ToUInt16($step, 10) -ne 0 -or
    [BitConverter]::ToUInt16($step, 12) -ne 0) {
  throw 'GBBOOT DQK natural combat flow did not start from the expected north-step pose'
}

$naturalEvent = Get-Content (Join-Path $build 'DQKNAT_E.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0000 status=0000 geo=FFFF',
  'MEM key=0023 value=0003',
  'MEM key=0111 value=001E',
  'MEM key=0112 value=0003',
  'MEM key=00CB value=0005',
  'MEM key=00CA value=000E',
  'MEM key=00CC value=00E5'
)) {
  if ($naturalEvent -notlike "*$needle*") {
    throw "GBBOOT DQK natural vmRun dump missing: $needle"
  }
}

$naturalCombat = Get-Content (Join-Path $build 'DQKNAT_C.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0069 status=0003 geo=0002 chain=FFFF',
  'GBLF operands=0002 0000 D000',
  'GBEC groups=0001',
  '@00 MONSTER id=002E count=0004 pic=002E',
  'GBRS flags=0001 area=0005 pc=11D0',
  '#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 0006 TEXT=DRAGONS',
  '#01 OP=11 PRINT ARGC=01 ARGS= 0006 TEXT= ATTACK!',
  'MEM key=0112 value=0010',
  'MEM key=00C1 value=0006',
  'MEM key=00CB value=0005',
  'MEM key=00CA value=000E',
  'MEM key=00C2 value=0004',
  'MEM key=00CC value=00E5'
)) {
  if ($naturalCombat -notlike "*$needle*") {
    throw "GBBOOT DQK natural combat dump missing: $needle"
  }
}

$naturalCombatWall = [IO.File]::ReadAllBytes((Join-Path $build '_GBECL.WGR'))
if ($naturalCombatWall.Length -ne (6 + (10 * 10 * 4)) -or
    [Text.Encoding]::ASCII.GetString($naturalCombatWall, 0, 4) -ne 'WGRD' -or
    $naturalCombatWall[4] -ne 10 -or
    $naturalCombatWall[5] -ne 10) {
  throw 'GBBOOT DQK natural combat flow did not bake a compact 10x10 Greybox CCGEO/CCCOMBAT bridge WGRD sidecar'
}

# The 2026-09-07 quarantine ended here. It correctly identified that the
# natural battle needed a party/loadout decision after DQK attack-rate decoding
# made the dragons strike twice per round. The actual defect was test staging:
# stage 1's successful direct control wrote a damaged GBPR, then stage 2 reused
# it instead of the copied retail QSV. Removing that transient file above makes
# stage 2 the same fresh-QSV route covered by gbdqk-playable-flow-test.ps1.
# The independent trace oracle below accounts for scheduled attacks and the
# native leaving reaction before accepting the enemy terminal.
$naturalTrace = @(Get-Content (Join-Path $build '_GBCOMB.TRC') | Where-Object { $_.Trim().Length -gt 0 })
Assert-DqkQsvCombatTrace $naturalTrace 'GBBOOT DQK natural'
if ($naturalTrace -notcontains '1 attack p5 e1 15 11 1 2 34 -') {
  throw 'GBBOOT DQK natural combat did not reload the fresh-QSV MAIGUREIGNE party slot'
}

$naturalOutcome = (Get-Content (Join-Path $build '_GBCOMB.OUT') -Raw).Trim()
if ($naturalOutcome -ne 'enemy') {
  throw "GBBOOT DQK natural combat outcome expected enemy, got $naturalOutcome"
}

Assert-RawFrame (Join-Path $build '_GBCOMB.RAW') 'GBBOOT DQK natural combat'

$naturalGbcr = [IO.File]::ReadAllBytes((Join-Path $build '_GBCR.BIN'))
$naturalFacts = Assert-DerivedCombat -Label 'GBBOOT DQK natural' -DumpText $naturalCombat -Trace $naturalTrace -MonchaPath (Join-Path $run 'DISK2\MONCHA.GLB') -Seed 4660
if ($naturalFacts.Outcome -ne 'enemy' -or $naturalFacts.RearReactionCount -ne 1) { throw 'GBBOOT DQK natural independent combat oracle disagreed with the four-dragon result' }
$null = Assert-DerivedGbcr -Label 'GBBOOT DQK natural' -Gbcr $naturalGbcr -Facts $naturalFacts
Assert-DqkQsvPartyOutput (Join-Path $build 'DQKNAT.TXT') 'GBBOOT DQK natural'
Assert-DqkGbprMeta (Join-Path $build '_GBPARTY.GBP') @(0, 0, 0, 0, 0, 0) @(140, 101, 85, 87, 84, 73) @(1, 1, 1, 1, 1, 1) @(1, 2, 1, 4, 1, 2) 'GBBOOT DQK natural'

$naturalResume = Get-Content (Join-Path $build 'DQKNAT_R.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0000 status=0000 geo=FFFF',
  'GBRS flags=0000 area=0005 pc=11DC rng=1DE921E7 callsp=0000',
  'MEM key=00CC value=00E5',
  'GBSX count=0000'
)) {
  if ($naturalResume -notlike "*$needle*") {
    throw "GBBOOT DQK natural combat resume dump missing: $needle"
  }
}

Write-Output 'RESULT: GBBOOT DQK /E slot-3 and natural-step combat/resume flows PASS'
