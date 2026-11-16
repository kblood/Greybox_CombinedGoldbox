# GBBOOT CoK headless boot-to-gameplay flow.
#
# This combines the previously separate CoK proofs: title/music playback,
# native party creation, persistent exploration, roster reload, and combat
# handoff/resume. It uses /J with /T so the title path runs before the bounded
# no-focus forward step.
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'Champions of Krynn'
$run = Join-Path $build 'gbcok-playable-flow-test'
$naturalRun = Join-Path $build 'gbcok-natural-menu-flow-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT CoK playable flow (DOSBox.exe absent)'
  exit 0
}
foreach ($name in @(
  'KRYNN.CFG',
  'TITLE.DAX',
  'ECL1.DAX',
  'GEO1.DAX',
  'WALLDEF1.DAX',
  '8X8D1.DAX',
  'MON1CHA.DAX',
  'CPIC1.DAX'
)) {
  if (-not (Test-Path -LiteralPath (Join-Path $game $name))) {
    Write-Output "SKIP: GBBOOT CoK playable flow ($name absent)"
    exit 0
  }
}
foreach ($slot in 1..6) {
  if (-not (Test-Path -LiteralPath (Join-Path $game "SAVE\CHRDATA$slot.SAV"))) {
    Write-Output "SKIP: GBBOOT CoK playable flow (SAVE\CHRDATA$slot.SAV absent)"
    exit 0
  }
}

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

$music = Join-Path $build 'COKTITLE.GBM'
if (-not (Test-Path $music)) {
  throw 'COKTITLE.GBM was not generated; CoK title music source is required for this smoke'
}

function Set-Session([int]$x, [int]$y, [int]$facing) {
  $s = New-Object byte[] 16
  [Text.Encoding]::ASCII.GetBytes('GBSN').CopyTo($s, 0)
  [BitConverter]::GetBytes([uint16]1).CopyTo($s, 4)
  [BitConverter]::GetBytes([uint16]$x).CopyTo($s, 6)
  [BitConverter]::GetBytes([uint16]$y).CopyTo($s, 8)
  [BitConverter]::GetBytes([uint16]$facing).CopyTo($s, 10)
  [BitConverter]::GetBytes([uint16]16).CopyTo($s, 12)
  [BitConverter]::GetBytes([uint16]16).CopyTo($s, 14)
  [IO.File]::WriteAllBytes((Join-Path $build '_GBSESS.GBS'), $s)
}

function Assert-GbcrRecord([byte[]]$Bytes, [int]$Index, [int]$Ordinal, [int]$Condition, [int]$Hp, [int]$MaxHp) {
  $off = 16 + ($Index * 6)
  if ($Bytes[$off] -ne $Ordinal -or
      $Bytes[$off + 1] -ne $Condition -or
      [BitConverter]::ToInt16($Bytes, $off + 2) -ne $Hp -or
      [BitConverter]::ToInt16($Bytes, $off + 4) -ne $MaxHp) {
    throw "GBBOOT CoK playable flow wrote unexpected GBCR record $Index"
  }
}

function Assert-GbprMember([byte[]]$Bytes, [int]$Index, [int]$Slot, [string]$Name, [int]$Class, [int]$Hp, [int]$Xp) {
  $off = 16 + ($Index * 410)
  $record = $off + 1
  $actualName = [Text.Encoding]::ASCII.GetString($Bytes, $record + 1, $Bytes[$record])
  if ($Bytes[$off] -ne $Slot -or
      $actualName -ne $Name -or
      $Bytes[$record + 90] -ne 6 -or
      $Bytes[$record + 91] -ne $Class -or
      $Bytes[$record + 407] -ne $Hp -or
      [BitConverter]::ToUInt16($Bytes, $record + 304) -ne $Xp) {
    throw "GBBOOT CoK playable flow wrote unexpected GBPR member $Index"
  }
}

function Assert-RawFrame([string]$Path, [string]$Label, [int]$MinColors = 8) {
  if (-not (Test-Path $Path)) {
    throw "$Label did not write RAW frame $Path"
  }
  $raw = [IO.File]::ReadAllBytes($Path)
  if ([BitConverter]::ToUInt16($raw, 0) -ne 320 -or
      [BitConverter]::ToUInt16($raw, 2) -ne 200 -or
      $raw.Length -ne (4 + (320 * 200) + 768)) {
    throw "$Label RAW frame was not a 320x200 indexed frame with palette"
  }
  $nonzero = 0
  $colors = @{}
  $end = 4 + (320 * 200)
  for ($i = 4; $i -lt $end; $i++) {
    if ($raw[$i] -ne 0) { $nonzero++ }
    $colors[[int]$raw[$i]] = $true
  }
  if ($nonzero -lt 4096 -or $colors.Count -lt $MinColors) {
    throw "$Label RAW frame was implausibly blank: nonzero=$nonzero colors=$($colors.Count)"
  }
}

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null

foreach ($name in @(
  'KRYNN.CFG',
  'TITLE.DAX',
  'ECL1.DAX',
  'GEO1.DAX',
  'WALLDEF1.DAX',
  '8X8D1.DAX',
  'MON1CHA.DAX',
  'CPIC1.DAX'
)) {
  Copy-Item (Join-Path $game $name) (Join-Path $run $name) -Force
}

$bootConf = Join-Path $build '_gbcok_playable_boot.conf'
@"
[sdl]
fullscreen=false
autolock=false
[speaker]
pcspeaker=true
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /J /T 1 /R PLAY_CLERIC C /R PLAY_FIGHTER F /R PLAY_MAGE M > C:\GBPLAY1.TXT
exit
"@ | Set-Content $bootConf -Encoding ASCII

# This is a new test session. A previous run can leave malformed DOP files
# in the shared scratch directory; CCBIND /N must still reject those
# in real sessions. Reset only this test's operation tokens here, retaining
# the new tokens throughout the persistence phases below.
Remove-Item (Join-Path $build '_GBECL.DOP'),
  (Join-Path $build '_GBEVT.DOP'),
  (Join-Path $build '_GBRES.DOP'),
  (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build 'GBPLAY1.TXT') -Force -ErrorAction SilentlyContinue

# Area 1 cell (1,7) faces east into the skeleton-room SearchLocation event.
Set-Session 1 7 2
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $bootConf -Headless
if (-not $p.WaitForExit(40000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT CoK playable title/create/step flow timed out'
}

$out = Get-Content (Join-Path $build 'GBPLAY1.TXT') -Raw
if ([regex]::Matches($out, 'CCGB: bounded DAX frame displayed').Count -ne 3) {
  throw 'GBBOOT CoK playable flow did not compose and play all three TITLE.DAX screens through CGB'
}
if ($out -notlike '*GBM1 PC-speaker sequence advanced*') {
  throw 'GBBOOT CoK playable flow did not drive title music through CGB'
}

$gbprPath = Join-Path $build '_GBPARTY.GBP'
if (-not (Test-Path $gbprPath)) { throw 'GBBOOT CoK playable flow did not create _GBPARTY.GBP' }
$gbpr = [IO.File]::ReadAllBytes($gbprPath)
if ($gbpr.Length -ne 1246 -or
    [Text.Encoding]::ASCII.GetString($gbpr, 0, 4) -ne 'GBPR' -or
    [BitConverter]::ToUInt16($gbpr, 4) -ne 2 -or
    [BitConverter]::ToUInt16($gbpr, 6) -ne 3 -or
    [BitConverter]::ToUInt16($gbpr, 8) -ne 410 -or
    [BitConverter]::ToUInt16($gbpr, 10) -ne 0 -or
    [BitConverter]::ToUInt16($gbpr, 12) -ne 1 -or
    [BitConverter]::ToUInt16($gbpr, 14) -ne 1) {
  throw 'GBBOOT CoK playable flow created an invalid GBPR header'
}

$expected = @(
  @{ Slot = 0x80; Name = 'PLAY_CLERIC'; Race = 6; Class = 0 },
  @{ Slot = 0x81; Name = 'PLAY_FIGHTER'; Race = 6; Class = 2 },
  @{ Slot = 0x82; Name = 'PLAY_MAGE'; Race = 6; Class = 5 }
)
for ($i = 0; $i -lt $expected.Count; $i++) {
  $off = 16 + $i * 410
  if ($gbpr[$off] -ne $expected[$i].Slot) {
    throw "GBBOOT CoK playable flow created the wrong native slot at entry $i"
  }
  $record = $off + 1
  $name = [Text.Encoding]::ASCII.GetString($gbpr, $record + 1, $gbpr[$record])
  if ($name -ne $expected[$i].Name -or $gbpr[$record + 90] -ne $expected[$i].Race -or
      $gbpr[$record + 91] -ne $expected[$i].Class) {
    throw "GBBOOT CoK playable flow created the wrong character at entry $i"
  }
}

$seedPath = Join-Path $build '_GBSEED.BIN'
if (-not (Test-Path $seedPath)) { throw 'GBBOOT CoK playable flow did not create _GBSEED.BIN' }
$seed = [IO.File]::ReadAllBytes($seedPath)
if ([Text.Encoding]::ASCII.GetString($seed, 0, 4) -ne 'GBPS' -or
    [BitConverter]::ToUInt16($seed, 4) -lt 1 -or
    [BitConverter]::ToUInt16($seed, 8) -ne 3) {
  throw 'GBBOOT CoK playable flow did not refresh GBPS from the created roster'
}

$session = [IO.File]::ReadAllBytes((Join-Path $build '_GBSESS.GBS'))
$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
$effect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
if ([BitConverter]::ToUInt16($session, 6) -ne 2 -or
    [BitConverter]::ToUInt16($session, 8) -ne 7 -or
    [BitConverter]::ToUInt16($step, 6) -ne 140 -or
    $effect -notlike '*PILES OF SKELETONS FILL THE ROOM*' -or
    $effect -notlike '*key=4C54 value=0001*') {
  throw 'GBBOOT CoK playable flow did not continue from title/create into persistent exploration'
}

$combatConf = Join-Path $build '_gbcok_playable_combat.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /T 1 > C:\GBPLAY2.TXT
exit
"@ | Set-Content $combatConf -Encoding ASCII

$postCombatExploreConf = Join-Path $build '_gbcok_playable_postcombat_explore.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /T 1 > C:\GBPLAY3.TXT
exit
"@ | Set-Content $postCombatExploreConf -Encoding ASCII

$postCombatSnapshotConf = Join-Path $build '_gbcok_playable_postcombat_snapshot.conf'
@"
[sdl]
fullscreen=false
autolock=false
[speaker]
pcspeaker=true
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X /J > C:\GBPLAY4.TXT
exit
"@ | Set-Content $postCombatSnapshotConf -Encoding ASCII

Set-Session 1 1 0
Remove-Item (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build 'GBPLAY2.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $combatConf -Headless
if (-not $p.WaitForExit(40000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT CoK playable combat flow timed out'
}

$session = [IO.File]::ReadAllBytes((Join-Path $build '_GBSESS.GBS'))
$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
$trace = Get-Content (Join-Path $build '_GBCOMB.TRC')
$outcome = (Get-Content (Join-Path $build '_GBCOMB.OUT') -Raw).Trim()
$resume = Get-Content (Join-Path $build '_GBRES.TXT') -Raw
$combatRaw = [IO.File]::ReadAllBytes((Join-Path $build '_GBCOMB.RAW'))
$gbcr = [IO.File]::ReadAllBytes((Join-Path $build '_GBCR.BIN'))
$afterCombat = [IO.File]::ReadAllBytes($gbprPath)
if ([BitConverter]::ToUInt16($session, 6) -ne 1 -or
    [BitConverter]::ToUInt16($session, 8) -ne 0 -or
    [BitConverter]::ToUInt16($step, 6) -ne 129 -or
    -not ($trace -match ' p2 ') -or
    $outcome -ne 'party' -or
    $resume -notlike '*GBRS*' -or
    [BitConverter]::ToUInt16($combatRaw, 0) -ne 320 -or
    [BitConverter]::ToUInt16($combatRaw, 2) -ne 200) {
  throw 'GBBOOT CoK playable flow did not continue through combat/resume'
}
Assert-RawFrame (Join-Path $build '_GBCOMB.RAW') 'GBBOOT CoK playable combat' 4
if ([Text.Encoding]::ASCII.GetString($gbcr, 0, 4) -ne 'GBCR' -or
    [BitConverter]::ToUInt16($gbcr, 4) -ne 2 -or
    [BitConverter]::ToUInt16($gbcr, 6) -ne 0 -or
    [BitConverter]::ToUInt16($gbcr, 8) -ne 0 -or
    [BitConverter]::ToUInt16($gbcr, 10) -ne 3 -or
    $gbcr.Length -ne 34) {
  throw 'GBBOOT CoK playable flow wrote an invalid GBCR sidecar'
}
Assert-GbcrRecord $gbcr 0 0 0 8 8
Assert-GbcrRecord $gbcr 1 1 0 10 10
Assert-GbcrRecord $gbcr 2 2 0 3 4
if ($afterCombat[17 + (2 * 410) + 98] -ne 4) {
  throw 'CoK combat writeback reduced PLAY_MAGE maximum HP; expected 4 at byte 98'
}
Assert-GbprMember $afterCombat 0 0x80 'PLAY_CLERIC' 0 8 0
Assert-GbprMember $afterCombat 1 0x81 'PLAY_FIGHTER' 2 10 0
Assert-GbprMember $afterCombat 2 0x82 'PLAY_MAGE' 5 3 0

# Reuse the post-combat GBPR without /R and prove the party can keep walking
# without producing a new tactical handoff or changing roster bytes.
Set-Session 1 7 2
Remove-Item (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build 'GBPLAY3.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $postCombatExploreConf -Headless
if (-not $p.WaitForExit(40000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT CoK playable post-combat exploration flow timed out'
}

$postCombatOut = Get-Content (Join-Path $build 'GBPLAY3.TXT') -Raw
$postStep = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
$postEffect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
$afterPostExplore = [IO.File]::ReadAllBytes($gbprPath)
if ($postCombatOut -notlike '*CCPARTY: loaded 3 member(s)*' -or
    [BitConverter]::ToUInt16($postStep, 6) -ne 140 -or
    [BitConverter]::ToUInt16($postStep, 8) -ne 2 -or
    [BitConverter]::ToUInt16($postStep, 10) -ne 7 -or
    $postEffect -notlike '*PILES OF SKELETONS FILL THE ROOM*') {
  throw 'GBBOOT CoK playable flow did not continue exploring after combat'
}
foreach ($name in @('_GBCOMB.TRC', '_GBCOMB.OUT', '_GBCOMB.RAW', '_GBCR.BIN', '_GBRES.BIN', '_GBRES.TXT')) {
  if (Test-Path (Join-Path $build $name)) {
    throw "GBBOOT CoK post-combat exploration unexpectedly wrote $name"
  }
}
if ($afterPostExplore.Length -ne $afterCombat.Length) {
  throw 'GBBOOT CoK post-combat exploration changed GBPR length'
}
for ($i = 0; $i -lt $afterCombat.Length; $i++) {
  if ($afterPostExplore[$i] -ne $afterCombat[$i]) {
    throw "GBBOOT CoK post-combat exploration changed GBPR byte $i"
  }
}

Remove-Item (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build 'GBPLAY4.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $postCombatSnapshotConf -Headless
if (-not $p.WaitForExit(40000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT CoK playable post-combat snapshot flow timed out'
}

$snapshotOut = Get-Content (Join-Path $build 'GBPLAY4.TXT') -Raw
if ($snapshotOut -notlike '*CCGB: bounded DAX frame displayed*' -or
    $snapshotOut -notlike '*GBM1 PC-speaker sequence advanced*' -or
    $snapshotOut -notlike '*CCPARTY: loaded 3 member(s)*' -or
    $snapshotOut -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT CoK post-combat snapshot did not reload the party through the title/native preview path'
}
Assert-RawFrame (Join-Path $build '_GBVIEW.RAW') 'GBBOOT CoK post-combat first-person snapshot'

$afterSnapshot = [IO.File]::ReadAllBytes($gbprPath)
if ($afterSnapshot.Length -ne $afterPostExplore.Length) {
  throw 'GBBOOT CoK post-combat snapshot changed GBPR length'
}
for ($i = 0; $i -lt $afterPostExplore.Length; $i++) {
  if ($afterSnapshot[$i] -ne $afterPostExplore[$i]) {
    throw "GBBOOT CoK post-combat snapshot changed GBPR byte $i"
  }
}

# Re-import the actual damaged, persisted roster into a second tactical run.
# The mage is unconscious at 0 current HP, but must retain maximum 4.
# A synthetic encounter isolates the combat-import boundary from the one-shot
# story event, whose effect packet is cleared by its continuation.
[byte[]]$probeEcl = [byte[]]::new(30)
[byte[]]$probeBody = @(0x0B,0x00,0x09,0x00,0x01,0x00,0x05,0x24) # LOAD_MONSTER; COMBAT
[Array]::Copy($probeBody, 0, $probeEcl, 22, $probeBody.Length)
[IO.File]::WriteAllBytes((Join-Path $build 'COK2ECL.BIN'), $probeEcl)
$secondCombatConf = Join-Path $build '_gbcok_playable_second_combat.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
C:
CCECL COK2ECL.BIN /E COK2FX.BIN > NUL
CCCOMBAT /E COK2FX.BIN 4660 COK2.TRC COK2.OUT /P _GBPARTY.GBP /R COK2.GBR > COK2.TXT
exit
"@ | Set-Content $secondCombatConf -Encoding ASCII
Remove-Item -LiteralPath (Join-Path $build 'COK2.GBR') -Force -ErrorAction SilentlyContinue
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $secondCombatConf -Headless
if (-not $p.WaitForExit(15000)) {
  Stop-Process -Id $p.Id -Force
  throw 'CoK second combat import timed out'
}
$second = [IO.File]::ReadAllBytes((Join-Path $build 'COK2.GBR'))
if ($second.Length -ne 34 -or [Text.Encoding]::ASCII.GetString($second, 0, 4) -ne 'GBCR' -or
    [BitConverter]::ToUInt16($second, 4) -ne 1 -or [BitConverter]::ToUInt16($second, 10) -ne 3) {
  throw 'CoK second combat did not emit three party result rows'
}
$maxima = @(8, 10, 4)
for ($i = 0; $i -lt 3; $i++) {
  if ([BitConverter]::ToInt16($second, 20 + ($i * 6)) -ne $maxima[$i]) {
    throw "CoK second combat lost maximum HP for member $i"
  }
}
if ([BitConverter]::ToInt16($second, 30) -ge $maxima[2]) {
  throw 'CoK second combat restored the injured mage to maximum HP'
}

# A player-visible, source-owned menu reached through the normal movement loop.
# (4,15) facing west is the cell immediately east of CoK's retail event at
# (3,15).  GBSN uses even direction codes, so west is 6.  This deliberately
# has no /@ direct-PC probe and no /B event injection: CCFP writes the live
# GBST descriptor after the one movement step, and GBBOOT dispatches it.
$null = Remove-Item -LiteralPath $naturalRun -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $naturalRun | Out-Null
foreach ($name in @(
  'KRYNN.CFG',
  'ECL1.DAX',
  'GEO1.DAX',
  'WALLDEF1.DAX',
  '8X8D1.DAX',
  'MON1CHA.DAX',
  'CPIC1.DAX'
)) {
  Copy-Item (Join-Path $game $name) (Join-Path $naturalRun $name) -Force
}
New-Item -ItemType Directory -Force (Join-Path $naturalRun 'SAVE') | Out-Null
foreach ($slot in 1..6) {
  Copy-Item (Join-Path $game "SAVE\CHRDATA$slot.SAV") (Join-Path $naturalRun "SAVE\CHRDATA$slot.SAV") -Force
}

$naturalMenuConf = Join-Path $build '_gbcok_natural_menu.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$naturalRun"
D:
C:\GBBOOT /E /! /C 0 /T 1 > C:\GBMENU.TXT
exit
"@ | Set-Content $naturalMenuConf -Encoding ASCII

# Start from the held retail six-member roster, independently of the damaged
# native roster used by the preceding persistence probes.
Set-Session 4 15 6
Remove-Item (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBMN.BIN'),
  (Join-Path $build '_GBMO.BIN'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build 'GBMENU.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $naturalMenuConf -Headless
if (-not $p.WaitForExit(40000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT CoK natural menu/combat flow timed out'
}

$naturalMenuOut = Get-Content (Join-Path $build 'GBMENU.TXT') -Raw
$naturalStep = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
$naturalTrace = Get-Content (Join-Path $build '_GBCOMB.TRC') -Raw
$naturalResume = Get-Content (Join-Path $build '_GBRES.TXT') -Raw
$naturalEffect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
if ($naturalMenuOut -like '*GBBOOT: native preview failed*' -or
    [regex]::Matches($naturalMenuOut, 'CCMENU: outcome written').Count -ne 3 -or
    $naturalMenuOut -notlike '*1. ATTACK*' -or
    $naturalMenuOut -notlike '*2. WAIT*' -or
    $naturalMenuOut -notlike '*3. LEAVE*' -or
    [BitConverter]::ToUInt16($naturalStep, 6) -ne 156 -or
    [BitConverter]::ToUInt16($naturalStep, 8) -ne 3 -or
    [BitConverter]::ToUInt16($naturalStep, 10) -ne 15 -or
    [BitConverter]::ToUInt16($naturalStep, 12) -ne 6 -or
    $naturalTrace -notlike '*init e0*' -or
    $naturalTrace -notlike '*end - party*' -or
    $naturalResume -notlike '*key=4C55 value=0020*' -or
    $naturalEffect -notlike '*GBEF v000E flags=0060 status=0002*') {
  throw 'GBBOOT CoK natural movement did not dispatch, select, combat-resume, and consume the retail menu route'
}

Write-Output "RESULT: GBBOOT CoK /J title+music, native create, exploration, nonblank combat, post-combat exploration, post-combat snapshot, and natural retail menu/combat flow PASS ($outcome)"
