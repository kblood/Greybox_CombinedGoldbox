# GBBOOT Buck Rogers Countdown real-data native preview flow.
#
# Optional local smoke for the Amiga/WHDLoad data dump. It pins the first real
# non-DOS broader-profile data path through GBBOOT detection, native party
# creation, the ECL1 front door, a nonblank GEO preview fallback, the area-3
# control-room guard combat, combat resume, and a post-combat reload preview.
param(
  [switch]$Headless,
  [string]$BuckPath = $env:GOLDBOX_BUCK_PATH
)

$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build 'gbbuck-flow-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT Buck flow (DOSBox.exe absent)'
  exit 0
}

if (-not $BuckPath) {
  $BuckPath = 'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDPacks\B\BuckRogersCountdownDday\data'
}

if (-not (Test-Path $BuckPath)) {
  Write-Output "SKIP: GBBOOT Buck flow ($BuckPath absent; set GOLDBOX_BUCK_PATH to run)"
  exit 0
}

$required = @(
  'ECL1.DAX',
  'ECL3.DAX',
  'GEO1.DAX',
  'GEO3.DAX',
  'WALLDEF1.DAX',
  'WALLDEF3.DAX',
  'MON0CHA.DAX'
)
foreach ($name in $required) {
  if (-not (Test-Path (Join-Path $BuckPath $name))) {
    Write-Output "SKIP: GBBOOT Buck flow ($name absent under $BuckPath)"
    exit 0
  }
}

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null
foreach ($name in $required) {
  Copy-Item (Join-Path $BuckPath $name) (Join-Path $run $name) -Force
}

function Assert-RawFrame([string]$Path, [string]$Label) {
  if (-not (Test-Path $Path)) { throw "$Label was not created" }
  $raw = [IO.File]::ReadAllBytes($Path)
  if ($raw.Length -ne (4 + (320 * 200) + 768) -or
      [BitConverter]::ToUInt16($raw, 0) -ne 320 -or
      [BitConverter]::ToUInt16($raw, 2) -ne 200) {
    throw "$Label was not a 320x200 RAW frame"
  }
  $seen = New-Object bool[] 256
  $nonzero = 0
  $colors = 0
  for ($i = 4; $i -lt (4 + (320 * 200)); $i++) {
    $px = $raw[$i]
    if ($px -ne 0) { $nonzero++ }
    if (-not $seen[$px]) {
      $seen[$px] = $true
      $colors++
    }
  }
  if ($nonzero -lt 1000 -or $colors -lt 3) {
    throw "$Label appears blank or low-detail (nonzero=$nonzero colors=$colors)"
  }
}

function Assert-GbprMember([byte[]]$Bytes, [int]$Index, [int]$Slot, [string]$Name) {
  $off = 16 + ($Index * 410)
  if ($Bytes[$off] -ne $Slot) {
    throw "GBBOOT Buck /R created wrong slot at entry $Index"
  }
  $record = $off + 1
  $actual = [Text.Encoding]::ASCII.GetString($Bytes, $record + 1, $Bytes[$record])
  if ($actual -ne $Name) {
    throw "GBBOOT Buck /R created wrong name at entry ${Index}: '$actual'"
  }
}

function Set-Session([int]$x, [int]$y, [int]$facing, [int]$w = 16, [int]$h = 16) {
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

$conf = Join-Path $build '_gbbuck_flow_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X /R BUCK_CLERIC C /R BUCK_FIGHTER F /R BUCK_MAGE M > C:\GBBUCK.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

Remove-Item (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBWALL.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build 'GBBUCK.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'GBBOOT Buck native preview flow timed out'
}

$out = Get-Content (Join-Path $build 'GBBUCK.TXT') -Raw
foreach ($needle in @(
  'game:   Buck Rogers: Countdown to Doomsday',
  'exec:   (native /E only)',
  'data-only Buck Rogers Countdown dump',
  'native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX',
  'CCPARTY: loaded 3 member(s)'
)) {
  if ($out -notlike "*$needle*") {
    throw "GBBOOT Buck flow output missing: $needle"
  }
}
if ($out -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT Buck native preview failed'
}

$effect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
if ($effect -notlike '*GBEF v0009 flags=0000 status=0000 geo=FFFF chain=FFFF*' -or
    $effect -notlike '*GBRS flags=0000 area=0022 pc=001E*') {
  throw 'GBBOOT Buck ECL1 front door did not write the expected noncombat effect state'
}

$gbprPath = Join-Path $build '_GBPARTY.GBP'
if (-not (Test-Path $gbprPath)) { throw 'GBBOOT Buck flow did not create _GBPARTY.GBP' }
$gbpr = [IO.File]::ReadAllBytes($gbprPath)
if ($gbpr.Length -ne (16 + (3 * 410)) -or
    [Text.Encoding]::ASCII.GetString($gbpr, 0, 4) -ne 'GBPR' -or
    [BitConverter]::ToUInt16($gbpr, 4) -ne 2 -or
    [BitConverter]::ToUInt16($gbpr, 6) -ne 3 -or
    [BitConverter]::ToUInt16($gbpr, 8) -ne 410 -or
    [BitConverter]::ToUInt16($gbpr, 10) -ne 0 -or
    [BitConverter]::ToUInt16($gbpr, 12) -ne 1 -or
    [BitConverter]::ToUInt16($gbpr, 14) -ne 1) {
  throw 'GBBOOT Buck flow created an invalid GBPR roster'
}
Assert-GbprMember $gbpr 0 0x80 'BUCK_CLERIC'
Assert-GbprMember $gbpr 1 0x81 'BUCK_FIGHTER'
Assert-GbprMember $gbpr 2 0x82 'BUCK_MAGE'

$seedPath = Join-Path $build '_GBSEED.BIN'
if (-not (Test-Path $seedPath)) { throw 'GBBOOT Buck flow did not create _GBSEED.BIN' }
$seed = [IO.File]::ReadAllBytes($seedPath)
if ([Text.Encoding]::ASCII.GetString($seed, 0, 4) -ne 'GBPS' -or
    [BitConverter]::ToUInt16($seed, 8) -ne 3) {
  throw 'GBBOOT Buck flow did not refresh GBPS from the created roster'
}

$wall = [IO.File]::ReadAllBytes((Join-Path $build '_GBWALL.BIN'))
if ($wall.Length -lt 6 -or [Text.Encoding]::ASCII.GetString($wall, 0, 4) -ne 'WGRD' -or
    $wall[4] -ne 16 -or $wall[5] -ne 16) {
  throw 'GBBOOT Buck flow did not create a valid 16x16 WGRD wall bridge'
}
Assert-RawFrame (Join-Path $build '_GBVIEW.RAW') 'GBBOOT Buck ECL front-door GEO preview'

foreach ($name in @('_GBCOMB.TRC', '_GBCOMB.OUT', '_GBCOMB.RAW', '_GBCR.BIN')) {
  if (Test-Path (Join-Path $build $name)) {
    throw "GBBOOT Buck preview unexpectedly wrote tactical artifact $name"
  }
}

$combatConf = Join-Path $build '_gbbuck_combat_flow_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /A 3 /B 98 /T 1 > C:\GBBUCKC.TXT
exit
"@ | Set-Content $combatConf -Encoding ASCII

Remove-Item (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBWALL.BIN'),
  (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build 'GBBUCKC.TXT') -Force -ErrorAction SilentlyContinue

# GEO3 block 98 has a verified passable step from (8,14) east into descriptor
# 142. SearchLocation reaches the Buck control-room guard encounter.
Set-Session 8 14 2
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $combatConf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'GBBOOT Buck area-3 guard combat flow timed out'
}

$combatOut = Get-Content (Join-Path $build 'GBBUCKC.TXT') -Raw
foreach ($needle in @(
  'game:   Buck Rogers: Countdown to Doomsday',
  'native: CCECL ECL3.DAX entry 98 -> CCGEO /B GEO3.DAX',
  'CCPARTY: loaded 3 member(s)'
)) {
  if ($combatOut -notlike "*$needle*") {
    throw "GBBOOT Buck combat output missing: $needle"
  }
}
if ($combatOut -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT Buck area-3 guard combat flow failed'
}

$combatWall = [IO.File]::ReadAllBytes((Join-Path $build '_GBWALL.BIN'))
if ($combatWall.Length -lt 6 -or [Text.Encoding]::ASCII.GetString($combatWall, 0, 4) -ne 'WGRD' -or
    $combatWall[4] -ne 16 -or $combatWall[5] -ne 16) {
  throw 'GBBOOT Buck combat flow did not create a valid 16x16 WGRD wall bridge'
}

$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
if ($step.Length -ne 14 -or [Text.Encoding]::ASCII.GetString($step, 0, 4) -ne 'GBST' -or
    [BitConverter]::ToUInt16($step, 4) -ne 1 -or
    [BitConverter]::ToUInt16($step, 6) -ne 142 -or
    [BitConverter]::ToUInt16($step, 8) -ne 9 -or
    [BitConverter]::ToUInt16($step, 10) -ne 14 -or
    [BitConverter]::ToUInt16($step, 12) -ne 2) {
  throw 'GBBOOT Buck combat flow did not write the expected area-3 GBST destination'
}

$session = [IO.File]::ReadAllBytes((Join-Path $build '_GBSESS.GBS'))
if ($session.Length -ne 16 -or [Text.Encoding]::ASCII.GetString($session, 0, 4) -ne 'GBSN' -or
    [BitConverter]::ToUInt16($session, 6) -ne 9 -or
    [BitConverter]::ToUInt16($session, 8) -ne 14 -or
    [BitConverter]::ToUInt16($session, 10) -ne 2) {
  throw 'GBBOOT Buck combat flow did not persist the post-step first-person pose'
}

$combatEffect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0128 status=0003 geo=FFFF',
  'GBSL count=000C',
  'GBEC groups=0002',
  '@00 MONSTER id=0017 count=0001 pic=0017',
  '@01 MONSTER id=0008 count=0007 pic=0008',
  'TEXT=THIS IS THE CONTROL ROOM FOR THE DOOMSDAY WEAPON. ',
  '#07 OP=43 UNKNOWN ARGC=01 ARGS= 000C',
  '#09 OP=43 UNKNOWN ARGC=01 ARGS= 000C',
  '#0B OP=43 UNKNOWN ARGC=01 ARGS= 000C'
)) {
  if ($combatEffect -notlike "*$needle*") {
    throw "GBBOOT Buck combat effect dump missing: $needle"
  }
}

Assert-RawFrame (Join-Path $build '_GBCOMB.RAW') 'GBBOOT Buck area-3 tactical flow'
$combatTrace = @(Get-Content (Join-Path $build '_GBCOMB.TRC') | Where-Object { $_.Trim().Length -gt 0 })
foreach ($needle in @(
  '1 init p0 - - - - - - -',
  '1 init p1 - - - - - - -',
  '1 init p2 - - - - - - -',
  '1 init e0 - - - - - - -',
  '1 init e2 - - - - - - -'
)) {
  if (-not ($combatTrace -contains $needle)) {
    throw "GBBOOT Buck combat trace missing: $needle"
  }
}
$combatOutcome = (Get-Content (Join-Path $build '_GBCOMB.OUT') -Raw).Trim()
if ($combatOutcome -ne 'enemy') {
  throw "GBBOOT Buck combat outcome expected enemy, got $combatOutcome"
}

$combatCr = [IO.File]::ReadAllBytes((Join-Path $build '_GBCR.BIN'))
if ($combatCr.Length -lt 34 -or [Text.Encoding]::ASCII.GetString($combatCr, 0, 4) -ne 'GBCR' -or
    [BitConverter]::ToUInt16($combatCr, 10) -ne 3) {
  throw 'GBBOOT Buck area-3 guard combat flow did not write a three-member GBCR bridge'
}

$resumePath = Join-Path $build '_GBRES.BIN'
if (-not (Test-Path $resumePath)) { throw 'GBBOOT Buck area-3 guard combat flow did not write _GBRES.BIN' }
$resumeBytes = [IO.File]::ReadAllBytes($resumePath)
if ($resumeBytes.Length -ne 5750 -or [Text.Encoding]::ASCII.GetString($resumeBytes, 0, 4) -ne 'GBEF' -or
    [BitConverter]::ToUInt16($resumeBytes, 6) -ne 0x120 -or
    [BitConverter]::ToUInt16($resumeBytes, 8) -ne 0) {
  throw 'GBBOOT Buck area-3 guard combat resume sidecar was invalid'
}
$resumeText = Get-Content (Join-Path $build '_GBRES.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0120 status=0000 geo=FFFF chain=FFFF',
  'GBRS flags=0000 area=0062 pc=1B32',
  'GBSL count=0002',
  'DESTRUCT SEQUENCE NOW IRREVERSI',
  'DOOMSDAY WEAPON COUNTDOWN COMMEN'
)) {
  if ($resumeText -notlike "*$needle*") {
    throw "GBBOOT Buck combat resume dump missing: $needle"
  }
}

$postCombatGbpr = [IO.File]::ReadAllBytes($gbprPath)

$postCombatConf = Join-Path $build '_gbbuck_postcombat_preview_flow_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X > C:\GBBUCKP.TXT
exit
"@ | Set-Content $postCombatConf -Encoding ASCII

Remove-Item (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBWALL.BIN'),
  (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build 'GBBUCKP.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $postCombatConf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'GBBOOT Buck post-combat preview reload flow timed out'
}

$postCombatOut = Get-Content (Join-Path $build 'GBBUCKP.TXT') -Raw
foreach ($needle in @(
  'game:   Buck Rogers: Countdown to Doomsday',
  'native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX',
  'CCPARTY: loaded 3 member(s)'
)) {
  if ($postCombatOut -notlike "*$needle*") {
    throw "GBBOOT Buck post-combat preview output missing: $needle"
  }
}
if ($postCombatOut -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT Buck post-combat preview reload flow failed'
}
Assert-RawFrame (Join-Path $build '_GBVIEW.RAW') 'GBBOOT Buck post-combat preview reload'
foreach ($name in @('_GBSTEP.BIN', '_GBCOMB.TRC', '_GBCOMB.OUT', '_GBCOMB.RAW', '_GBCR.BIN', '_GBRES.BIN', '_GBRES.TXT')) {
  if (Test-Path (Join-Path $build $name)) {
    throw "GBBOOT Buck post-combat preview unexpectedly wrote tactical/step artifact $name"
  }
}
$postPreviewGbpr = [IO.File]::ReadAllBytes($gbprPath)
if ($postPreviewGbpr.Length -ne $postCombatGbpr.Length) {
  throw 'GBBOOT Buck post-combat preview changed GBPR length'
}
for ($i = 0; $i -lt $postCombatGbpr.Length; $i++) {
  if ($postPreviewGbpr[$i] -ne $postCombatGbpr[$i]) {
    throw "GBBOOT Buck post-combat preview changed GBPR byte $i"
  }
}

Write-Output "RESULT: GBBOOT Buck Rogers Countdown data-only native /E party + ECL front-door GEO preview + area-3 guard combat/resume + post-combat preview flow PASS ($combatOutcome)"
