# GBBOOT Neverwinter Nights (DOS/AOL) real-data native flow.
#
# Optional local smoke: verifies the user-provided NWN DOS/AOL archive through
# the native /E path without committing game bytes. It covers the bounded title
# front door, native party creation/GBPS sync, the default ECL0/GEO0 preview,
# and several seeded ECL7.DAX block-79 combat branches through the real
# MONCHA.DAX. It also proves ordinary walking through a natural ECL0 text step
# and a natural area-1 movement-to-combat/resume route, then relaunches into a
# bounded post-natural-combat area-1 continuation with the same GBSN/GBPR.
param(
  [switch]$Headless,
  [string]$NwnPath = $env:GOLDBOX_NWN_PATH
)

$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build 'gbnwn-flow-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT NWN flow (DOSBox.exe absent)'
  exit 0
}

if (-not $NwnPath) {
  $NwnPath = 'D:\Games\Neverwinter Nights DOS\neverwinter-nights\neverwint'
}

if (-not (Test-Path $NwnPath)) {
  Write-Output "SKIP: GBBOOT NWN flow ($NwnPath absent; set GOLDBOX_NWN_PATH to run)"
  exit 0
}

$required = @(
  'GAME.EXE',
  'GAME.CFG',
  'GAME.OVR',
  'TITLE.DAX',
  'ECL0.DAX',
  'ECL1.DAX',
  'GEO0.DAX',
  'GEO1.DAX',
  'ECL7.DAX',
  'MONCHA.DAX'
)
foreach ($name in $required) {
  if (-not (Test-Path (Join-Path $NwnPath $name))) {
    Write-Output "SKIP: GBBOOT NWN flow ($name absent under $NwnPath)"
    exit 0
  }
}

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null
foreach ($name in $required) {
  Copy-Item (Join-Path $NwnPath $name) (Join-Path $run $name) -Force
}

function Assert-GbprHeader([string]$Path, [int]$Count) {
  if (-not (Test-Path $Path)) { throw "GBBOOT NWN flow did not create $(Split-Path -Leaf $Path)" }
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 16 -or
      [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne 'GBPR' -or
      [BitConverter]::ToUInt16($bytes, 4) -ne 2 -or
      [BitConverter]::ToUInt16($bytes, 6) -ne $Count -or
      [BitConverter]::ToUInt16($bytes, 8) -ne 410 -or
      [BitConverter]::ToUInt16($bytes, 10) -ne 0 -or
      [BitConverter]::ToUInt16($bytes, 12) -ne 1 -or
      [BitConverter]::ToUInt16($bytes, 14) -ne 1 -or
      $bytes.Length -ne (16 + $Count * 410)) {
    throw 'GBBOOT NWN flow created an invalid GBPR roster'
  }
  return $bytes
}

function Assert-GbpsHeader([string]$Path, [int]$Count, [int]$MinVersion) {
  if (-not (Test-Path $Path)) { throw "GBBOOT NWN flow did not create $(Split-Path -Leaf $Path)" }
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 22 -or
      [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne 'GBPS' -or
      [BitConverter]::ToUInt16($bytes, 4) -lt $MinVersion -or
      [BitConverter]::ToUInt16($bytes, 8) -ne $Count) {
    throw 'GBBOOT NWN flow created an invalid GBPS seed sidecar'
  }
  return $bytes
}

function Assert-RawFrame([string]$Path, [string]$Label) {
  if (-not (Test-Path $Path)) { throw "$Label was not created" }
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ne (4 + (320 * 200) + 768) -or
      [BitConverter]::ToUInt16($bytes, 0) -ne 320 -or
      [BitConverter]::ToUInt16($bytes, 2) -ne 200) {
    throw "$Label was not a 320x200 RAW frame"
  }
  $nonzero = 0
  $colors = @{}
  for ($i = 4; $i -lt (4 + (320 * 200)); $i++) {
    $pix = [int]$bytes[$i]
    if ($pix -ne 0) { $nonzero++ }
    $colors[$pix] = $true
  }
  if ($nonzero -lt 1000) { throw "$Label appears blank ($nonzero nonzero pixels)" }
  if ($colors.Count -lt 3) { throw "$Label has too little pixel variation ($($colors.Count) colors)" }
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

function Get-GbpsMemoryPairs([byte[]]$Seed) {
  $psV1Len = 150
  $psV2Len = $psV1Len + 2 + (8 * 8)
  if ($Seed[$psV2Len] -lt 1) {
    throw 'GBBOOT NWN ECL7 did not write sparse AOL-host memory seeds'
  }
  $pairs = @{}
  for ($i = 0; $i -lt $Seed[$psV2Len]; $i++) {
    $key = [BitConverter]::ToUInt16($Seed, $psV2Len + 2 + ($i * 2))
    $value = [BitConverter]::ToUInt16($Seed, $psV2Len + 2 + (16 * 2) + ($i * 2))
    $pairs[[int]$key] = [int]$value
  }
  return $pairs
}

function Invoke-NwnSelectorFlow([int]$Selector, [array]$ExpectedGroups) {
  $stem = "NWS$Selector"
  $conf = Join-Path $build "_gbnwn_selector_${Selector}_flow_test.conf"
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X /A 7 /0 49231 $Selector > C:\$stem.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

  Remove-Item (Join-Path $build '_GBSEED.BIN'),
    (Join-Path $build '_GBCOMB.TRC'),
    (Join-Path $build '_GBCOMB.OUT'),
    (Join-Path $build '_GBCOMB.RAW'),
    (Join-Path $build '_GBCR.BIN'),
    (Join-Path $build '_GBECL.BIN'),
    (Join-Path $build '_GBECL.TXT'),
    (Join-Path $build '_GBRES.BIN'),
    (Join-Path $build '_GBRES.TXT'),
    (Join-Path $build "$stem.TXT") -Force -ErrorAction SilentlyContinue

  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
  if (-not $p.WaitForExit(60000)) {
    Stop-DosBoxSmoke -Process $p
    throw "GBBOOT NWN ECL7 selector $Selector combat flow timed out"
  }

  $out = Get-Content (Join-Path $build "$stem.TXT") -Raw
  if ($out -notlike '*native: CCECL ECL7.DAX entry 79 -> CCGEO /B GEO0.DAX*') {
    throw "GBBOOT NWN selector $Selector did not plan the ECL7 combat route"
  }
  if ($out -notlike '*CCPARTY: loaded 3 member(s)*') {
    throw "GBBOOT NWN selector $Selector did not reload the existing three-member native party"
  }

  $effect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
  $expectedCount = if ($Selector -eq 108) { '000A' } else { '0003' }
  if ($effect -notlike '*GBEF v0009 flags=0128 status=0003 geo=FFFF*' -or
      $effect -notlike "*GBSL count=$expectedCount*") {
    throw "GBBOOT NWN selector $Selector did not yield combat"
  }
  foreach ($needle in $ExpectedGroups) {
    if ($effect -notlike "*$needle*") {
      throw "GBBOOT NWN selector $Selector effect dump missing: $needle"
    }
  }

  $seed = Assert-GbpsHeader (Join-Path $build '_GBSEED.BIN') 3 3
  $pairs = Get-GbpsMemoryPairs $seed
  if ($pairs[[int]0x4bf2] -ne 29 -or $pairs[[int]0xc04f] -ne $Selector) {
    throw "GBBOOT NWN selector $Selector did not preserve sparse AOL-host seeds"
  }

  $outcome = (Get-Content (Join-Path $build '_GBCOMB.OUT') -Raw).Trim()
  if ($outcome -notin @('party', 'enemy', 'draw')) {
    throw "GBBOOT NWN selector $Selector combat outcome was not valid: $outcome"
  }
  Assert-RawFrame (Join-Path $build '_GBCOMB.RAW') "GBBOOT NWN selector $Selector combat snapshot"

  $gbcr = [IO.File]::ReadAllBytes((Join-Path $build '_GBCR.BIN'))
  if ($gbcr.Length -lt 34 -or
      [Text.Encoding]::ASCII.GetString($gbcr, 0, 4) -ne 'GBCR' -or
      [BitConverter]::ToUInt16($gbcr, 4) -ne 1 -or
      [BitConverter]::ToUInt16($gbcr, 10) -ne 3) {
    throw "GBBOOT NWN selector $Selector combat did not write a three-member GBCR sidecar"
  }
}

function Invoke-NwnNonCombatSelectorFlow([int]$Selector, [array]$ExpectedGroups) {
  $stem = "NWNX$Selector"
  $conf = Join-Path $build "_gbnwn_noncombat_selector_${Selector}_flow_test.conf"
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X /A 7 /0 49231 $Selector > C:\$stem.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

  Remove-Item (Join-Path $build '_GBSEED.BIN'),
    (Join-Path $build '_GBCOMB.TRC'),
    (Join-Path $build '_GBCOMB.OUT'),
    (Join-Path $build '_GBCOMB.RAW'),
    (Join-Path $build '_GBCR.BIN'),
    (Join-Path $build '_GBECL.BIN'),
    (Join-Path $build '_GBECL.TXT'),
    (Join-Path $build '_GBRES.BIN'),
    (Join-Path $build '_GBRES.TXT'),
    (Join-Path $build "$stem.TXT") -Force -ErrorAction SilentlyContinue

  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
  if (-not $p.WaitForExit(60000)) {
    Stop-DosBoxSmoke -Process $p
    throw "GBBOOT NWN ECL7 selector $Selector noncombat flow timed out"
  }

  $out = Get-Content (Join-Path $build "$stem.TXT") -Raw
  if ($out -notlike '*native: CCECL ECL7.DAX entry 79 -> CCGEO /B GEO0.DAX*') {
    throw "GBBOOT NWN selector $Selector did not plan the ECL7 route"
  }
  if ($out -notlike '*CCPARTY: loaded 3 member(s)*') {
    throw "GBBOOT NWN selector $Selector did not reload the existing three-member native party"
  }
  if ($out -like '*GBBOOT: native preview failed*') {
    throw "GBBOOT NWN selector $Selector noncombat route failed"
  }

  $effect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
  if ($effect -like '*status=0003*') {
    throw "GBBOOT NWN selector $Selector unexpectedly yielded tactical combat"
  }
  foreach ($needle in $ExpectedGroups) {
    if ($effect -notlike "*$needle*") {
      throw "GBBOOT NWN selector $Selector noncombat effect dump missing: $needle"
    }
  }

  $seed = Assert-GbpsHeader (Join-Path $build '_GBSEED.BIN') 3 3
  $pairs = Get-GbpsMemoryPairs $seed
  if ($pairs[[int]0x4bf2] -ne 29 -or $pairs[[int]0xc04f] -ne $Selector) {
    throw "GBBOOT NWN selector $Selector did not preserve sparse AOL-host seeds"
  }

  foreach ($name in @('_GBCOMB.TRC', '_GBCOMB.OUT', '_GBCOMB.RAW', '_GBCR.BIN')) {
    if (Test-Path (Join-Path $build $name)) {
      throw "GBBOOT NWN selector $Selector wrote unexpected tactical artifact $name"
    }
  }
}

$titleConf = Join-Path $build '_gbnwn_title_flow_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X /J /R NWN_CLERIC C /R NWN_FIGHTER F /R NWN_MAGE M > C:\GBNWN1.TXT
exit
"@ | Set-Content $titleConf -Encoding ASCII

Remove-Item (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBWALL.BIN'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build 'GBNWN2.TXT'),
  (Join-Path $build 'GBNWN1.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $titleConf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'GBBOOT NWN title/create/default-preview flow timed out'
}

$bootOut = Get-Content (Join-Path $build 'GBNWN1.TXT') -Raw
foreach ($needle in @(
  'game:   Neverwinter Nights (DOS/AOL)',
  'native: CCECL ECL0.DAX entry 1 -> CCGEO /B GEO0.DAX',
  'CCGB: bounded DAX frame displayed',
  'CCPARTY: loaded 3 member(s)'
)) {
  if ($bootOut -notlike "*$needle*") {
    throw "GBBOOT NWN title/default flow output missing: $needle"
  }
}
Assert-GbprHeader (Join-Path $build '_GBPARTY.GBP') 3 | Out-Null
Assert-GbpsHeader (Join-Path $build '_GBSEED.BIN') 3 1 | Out-Null
Assert-RawFrame (Join-Path $build '_GBVIEW.RAW') 'GBBOOT NWN default preview'

$combatConf = Join-Path $build '_gbnwn_combat_flow_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X /A 7 > C:\GBNWN2.TXT
exit
"@ | Set-Content $combatConf -Encoding ASCII

Remove-Item (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build 'GBNWN2.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $combatConf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'GBBOOT NWN seeded ECL7 combat flow timed out'
}

$combatOut = Get-Content (Join-Path $build 'GBNWN2.TXT') -Raw
if ($combatOut -notlike '*native: CCECL ECL7.DAX entry 79 -> CCGEO /B GEO0.DAX*') {
  throw 'GBBOOT NWN /A 7 did not plan the seeded ECL7 combat route'
}
if ($combatOut -notlike '*CCPARTY: loaded 3 member(s)*') {
  throw 'GBBOOT NWN /A 7 did not reload the existing three-member native party'
}

$effect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0128 status=0003 geo=FFFF',
  'GBSL count=0012',
  '@00 MONSTER id=002E count=0002 pic=002E',
  '@01 MONSTER id=0062 count=0004 pic=0062',
  '@02 MONSTER id=0043 count=0002 pic=0043',
  'TEXT=TWO BEHOLDERS'
)) {
  if ($effect -notlike "*$needle*") {
    throw "GBBOOT NWN ECL7 effect dump missing: $needle"
  }
}

$seed = Assert-GbpsHeader (Join-Path $build '_GBSEED.BIN') 3 3
$seedPairs = Get-GbpsMemoryPairs $seed
if ($seedPairs[[int]0x4bf2] -ne 29 -or $seedPairs[[int]0xc04f] -ne 125) {
  throw 'GBBOOT NWN ECL7 GBPS did not seed 4bf2=29 and c04f=125'
}

$trace = @(Get-Content (Join-Path $build '_GBCOMB.TRC') | Where-Object { $_.Trim().Length -gt 0 })
foreach ($needle in @(
  '1 init p0 - - - - - - -',
  '1 init p1 - - - - - - -',
  '1 init p2 - - - - - - -',
  '1 init e0 - - - - - - -',
  '1 init e7 - - - - - - -'
)) {
  if (-not ($trace -contains $needle)) {
    throw "GBBOOT NWN combat trace missing: $needle"
  }
}
$outcome = (Get-Content (Join-Path $build '_GBCOMB.OUT') -Raw).Trim()
if ($outcome -ne 'enemy') {
  throw "GBBOOT NWN combat outcome expected enemy, got $outcome"
}
Assert-RawFrame (Join-Path $build '_GBCOMB.RAW') 'GBBOOT NWN combat snapshot'

$gbcr = [IO.File]::ReadAllBytes((Join-Path $build '_GBCR.BIN'))
if ($gbcr.Length -lt 34 -or
    [Text.Encoding]::ASCII.GetString($gbcr, 0, 4) -ne 'GBCR' -or
    [BitConverter]::ToUInt16($gbcr, 4) -ne 1 -or
    [BitConverter]::ToUInt16($gbcr, 10) -ne 3) {
  throw 'GBBOOT NWN combat did not write a three-member GBCR sidecar'
}

$gbprPath = Join-Path $build '_GBPARTY.GBP'
$afterCombatGbpr = Assert-GbprHeader $gbprPath 3

$postCombatConf = Join-Path $build '_gbnwn_postcombat_preview_flow_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X > C:\GBNWN3.TXT
exit
"@ | Set-Content $postCombatConf -Encoding ASCII

Remove-Item (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build 'GBNWN3.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $postCombatConf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'GBBOOT NWN post-combat default-preview flow timed out'
}

$postCombatOut = Get-Content (Join-Path $build 'GBNWN3.TXT') -Raw
foreach ($needle in @(
  'native: CCECL ECL0.DAX entry 1 -> CCGEO /B GEO0.DAX',
  'CCPARTY: loaded 3 member(s)'
)) {
  if ($postCombatOut -notlike "*$needle*") {
    throw "GBBOOT NWN post-combat default preview output missing: $needle"
  }
}
Assert-RawFrame (Join-Path $build '_GBVIEW.RAW') 'GBBOOT NWN post-combat default preview'
foreach ($name in @('_GBCOMB.TRC', '_GBCOMB.OUT', '_GBCOMB.RAW', '_GBCR.BIN', '_GBRES.BIN', '_GBRES.TXT')) {
  if (Test-Path (Join-Path $build $name)) {
    throw "GBBOOT NWN post-combat default preview unexpectedly wrote tactical artifact $name"
  }
}
$afterPostCombatPreviewGbpr = Assert-GbprHeader $gbprPath 3
if ($afterCombatGbpr.Length -ne $afterPostCombatPreviewGbpr.Length) {
  throw 'GBBOOT NWN post-combat default preview changed GBPR length'
}
for ($i = 0; $i -lt $afterCombatGbpr.Length; $i++) {
  if ($afterCombatGbpr[$i] -ne $afterPostCombatPreviewGbpr[$i]) {
    throw "GBBOOT NWN post-combat default preview changed GBPR byte $i"
  }
}

$naturalStepConf = Join-Path $build '_gbnwn_natural_step_flow_test.conf'
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
C:\GBBOOT /E /T 1 > C:\GBNWN4.TXT
exit
"@ | Set-Content $naturalStepConf -Encoding ASCII

Remove-Item (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBSESS.GBS'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build 'GBNWN4.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $naturalStepConf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'GBBOOT NWN natural ECL0 movement step flow timed out'
}

$naturalStepOut = Get-Content (Join-Path $build 'GBNWN4.TXT') -Raw
foreach ($needle in @(
  'game:   Neverwinter Nights (DOS/AOL)',
  'native: CCECL ECL0.DAX entry 1 -> CCGEO /B GEO0.DAX',
  'CCPARTY: loaded 3 member(s)'
)) {
  if ($naturalStepOut -notlike "*$needle*") {
    throw "GBBOOT NWN natural movement step output missing: $needle"
  }
}
if ($naturalStepOut -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT NWN natural movement step failed'
}

$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
if ($step.Length -ne 14 -or [Text.Encoding]::ASCII.GetString($step, 0, 4) -ne 'GBST' -or
    [BitConverter]::ToUInt16($step, 4) -ne 1 -or
    [BitConverter]::ToUInt16($step, 6) -ne 33 -or
    [BitConverter]::ToUInt16($step, 8) -ne 8 -or
    [BitConverter]::ToUInt16($step, 10) -ne 14 -or
    [BitConverter]::ToUInt16($step, 12) -ne 4) {
  throw 'GBBOOT NWN natural movement step did not write the expected ECL0 GBST destination'
}

$session = [IO.File]::ReadAllBytes((Join-Path $build '_GBSESS.GBS'))
if ($session.Length -ne 16 -or [Text.Encoding]::ASCII.GetString($session, 0, 4) -ne 'GBSN' -or
    [BitConverter]::ToUInt16($session, 6) -ne 8 -or
    [BitConverter]::ToUInt16($session, 8) -ne 14 -or
    [BitConverter]::ToUInt16($session, 10) -ne 4 -or
    [BitConverter]::ToUInt16($session, 12) -ne 16 -or
    [BitConverter]::ToUInt16($session, 14) -ne 16) {
  throw 'GBBOOT NWN natural movement step did not persist the expected first-person pose'
}

$naturalEffect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0120 status=0000 geo=FFFF',
  'GBSL count=0001',
  'GBRS flags=0000 area=0001 pc=0959',
  '@00 MEM key=4C02 value=0021',
  '@06 MEM key=7F79 value=0021',
  '@0E MEM key=C04F value=0021',
  "TEXT=THE SIGN OVERHEAD READS 'THE RED MAGE INN'"
)) {
  if ($naturalEffect -notlike "*$needle*") {
    throw "GBBOOT NWN natural movement effect dump missing: $needle"
  }
}

foreach ($name in @('_GBCOMB.TRC', '_GBCOMB.OUT', '_GBCOMB.RAW', '_GBCR.BIN', '_GBRES.BIN', '_GBRES.TXT')) {
  if (Test-Path (Join-Path $build $name)) {
    throw "GBBOOT NWN natural movement step unexpectedly wrote tactical artifact $name"
  }
}

$afterNaturalStepGbpr = Assert-GbprHeader $gbprPath 3
if ($afterPostCombatPreviewGbpr.Length -ne $afterNaturalStepGbpr.Length) {
  throw 'GBBOOT NWN natural movement step changed GBPR length'
}
for ($i = 0; $i -lt $afterPostCombatPreviewGbpr.Length; $i++) {
  if ($afterPostCombatPreviewGbpr[$i] -ne $afterNaturalStepGbpr[$i]) {
    throw "GBBOOT NWN natural movement step changed GBPR byte $i"
  }
}

$naturalCombatConf = Join-Path $build '_gbnwn_natural_combat_flow_test.conf'
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
C:\GBBOOT /E /A 1 /T 1 > C:\GBNWN5.TXT
exit
"@ | Set-Content $naturalCombatConf -Encoding ASCII

Remove-Item (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBWALL.BIN'),
  (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBSESS.GBS'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build 'GBNWN5.TXT') -Force -ErrorAction SilentlyContinue

# GEO1 block 10 contains a verified passable step from (14,4) east into
# descriptor 229. SearchLocation queues a two-group tactical encounter.
Set-Session 14 4 2
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $naturalCombatConf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'GBBOOT NWN natural area-1 movement-to-combat flow timed out'
}

$naturalCombatOut = Get-Content (Join-Path $build 'GBNWN5.TXT') -Raw
foreach ($needle in @(
  'game:   Neverwinter Nights (DOS/AOL)',
  'native: CCECL ECL1.DAX entry 10 -> CCGEO /B GEO1.DAX',
  'CCPARTY: loaded 3 member(s)'
)) {
  if ($naturalCombatOut -notlike "*$needle*") {
    throw "GBBOOT NWN natural combat output missing: $needle"
  }
}
if ($naturalCombatOut -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT NWN natural combat flow failed'
}

$wall = [IO.File]::ReadAllBytes((Join-Path $build '_GBWALL.BIN'))
if ($wall.Length -lt 6 -or [Text.Encoding]::ASCII.GetString($wall, 0, 4) -ne 'WGRD' -or
    $wall[4] -ne 16 -or $wall[5] -ne 16) {
  throw 'GBBOOT NWN natural combat flow did not create a valid 16x16 WGRD wall bridge'
}

$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
if ($step.Length -ne 14 -or [Text.Encoding]::ASCII.GetString($step, 0, 4) -ne 'GBST' -or
    [BitConverter]::ToUInt16($step, 4) -ne 1 -or
    [BitConverter]::ToUInt16($step, 6) -ne 229 -or
    [BitConverter]::ToUInt16($step, 8) -ne 15 -or
    [BitConverter]::ToUInt16($step, 10) -ne 4 -or
    [BitConverter]::ToUInt16($step, 12) -ne 2) {
  throw 'GBBOOT NWN natural combat flow did not write the expected area-1 GBST destination'
}

$session = [IO.File]::ReadAllBytes((Join-Path $build '_GBSESS.GBS'))
if ($session.Length -ne 16 -or [Text.Encoding]::ASCII.GetString($session, 0, 4) -ne 'GBSN' -or
    [BitConverter]::ToUInt16($session, 6) -ne 15 -or
    [BitConverter]::ToUInt16($session, 8) -ne 4 -or
    [BitConverter]::ToUInt16($session, 10) -ne 2) {
  throw 'GBBOOT NWN natural combat flow did not persist the post-step first-person pose'
}

$naturalCombatEffect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0028 status=0003 geo=FFFF',
  'GBEC groups=0002',
  '@00 MONSTER id=0045 count=0002 pic=0045',
  '@01 MONSTER id=001E count=0003 pic=001E',
  '@03 MEM key=C04F value=00E5',
  '#00 OP=0E PICTURE ARGC=01 ARGS= 0077',
  '#01 OP=27 TREASURE'
)) {
  if ($naturalCombatEffect -notlike "*$needle*") {
    throw "GBBOOT NWN natural combat effect dump missing: $needle"
  }
}

Assert-RawFrame (Join-Path $build '_GBCOMB.RAW') 'GBBOOT NWN natural tactical flow'
$naturalTrace = @(Get-Content (Join-Path $build '_GBCOMB.TRC') | Where-Object { $_.Trim().Length -gt 0 })
foreach ($needle in @(
  '1 init p0 - - - - - - -',
  '1 init p1 - - - - - - -',
  '1 init p2 - - - - - - -',
  '1 init e0 - - - - - - -',
  '1 init e4 - - - - - - -'
)) {
  if (-not ($naturalTrace -contains $needle)) {
    throw "GBBOOT NWN natural combat trace missing: $needle"
  }
}
$naturalOutcome = (Get-Content (Join-Path $build '_GBCOMB.OUT') -Raw).Trim()
if ($naturalOutcome -ne 'enemy') {
  throw "GBBOOT NWN natural combat outcome expected enemy, got $naturalOutcome"
}

$naturalCr = [IO.File]::ReadAllBytes((Join-Path $build '_GBCR.BIN'))
if ($naturalCr.Length -lt 34 -or [Text.Encoding]::ASCII.GetString($naturalCr, 0, 4) -ne 'GBCR' -or
    [BitConverter]::ToUInt16($naturalCr, 10) -ne 3) {
  throw 'GBBOOT NWN natural combat flow did not write a three-member GBCR bridge'
}

$naturalResume = Get-Content (Join-Path $build '_GBRES.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0020 status=0000',
  'GBRS flags=0000 area=000A pc=03E0',
  '#00 OP=38 PROGRAM ARGC=01 ARGS= 0010',
  # GBSX count and the #NN indices are pinned deliberately, not incidentally. The
  # ecl-op-call-real-dispatch item attaches CALL-0xAE11's pose snapshot as EXTRA OPERANDS on
  # this instruction's own event rather than as a second event, precisely so that this count
  # and these indices do NOT move. Pinning the count here is what makes a return to the
  # append design visible at this site instead of only at gbcoab's.
  'GBSX count=0003',
  '#01 OP=38 PROGRAM ARGC=01 ARGS= 0004',
  # ARGC widened 02 -> 05 on 2026-09-10 when 0xAE11 ("redraw dungeon view") gained real
  # per-id dispatch, ground-truthed against COAB's Gen1 CMD_Call switch. The three added
  # words are the position/facing sparse-memory cells 0xc04b/0xc04c/0xc04d.
  #
  # DISCLOSED, because the pinned value is DEGENERATE here: all three read 0000 in this NWN
  # resume context. The mechanism is not inert -- the same snapshot reads 000F 0005 0003 in
  # Curse of the Azure Bonds -- so this pin currently proves the operands are PRESENT and
  # correctly placed, NOT that NWN populates those cells. Whether NWN uses these Gen1 default
  # addresses at all is unresolved and deliberately not asserted either way here.
  '#02 OP=2D CALL ARGC=05 ARGS= 2E10 AE11 0000 0000 0000 CALL=operand:2E10 routine:AE11'
)) {
  if ($naturalResume -notlike "*$needle*") {
    throw "GBBOOT NWN natural combat resume dump missing: $needle"
  }
}

$afterNaturalCombatGbpr = Assert-GbprHeader $gbprPath 3
$afterNaturalCombatSession = [IO.File]::ReadAllBytes((Join-Path $build '_GBSESS.GBS'))

$postNaturalCombatConf = Join-Path $build '_gbnwn_post_natural_combat_continuation_flow_test.conf'
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
C:\GBBOOT /E /A 1 /T 1 > C:\GBNWN6.TXT
exit
"@ | Set-Content $postNaturalCombatConf -Encoding ASCII

Remove-Item (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build 'GBNWN6.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $postNaturalCombatConf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'GBBOOT NWN post-natural-combat area-1 continuation flow timed out'
}

$postNaturalOut = Get-Content (Join-Path $build 'GBNWN6.TXT') -Raw
foreach ($needle in @(
  'native: CCECL ECL1.DAX entry 10 -> CCGEO /B GEO1.DAX',
  'CCPARTY: loaded 3 member(s)'
)) {
  if ($postNaturalOut -notlike "*$needle*") {
    throw "GBBOOT NWN post-natural-combat continuation output missing: $needle"
  }
}
if ($postNaturalOut -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT NWN post-natural-combat continuation failed'
}

if (Test-Path (Join-Path $build '_GBVIEW.RAW')) {
  throw 'GBBOOT NWN post-natural-combat bounded continuation unexpectedly wrote a snapshot'
}
if (Test-Path (Join-Path $build '_GBSTEP.BIN')) {
  throw 'GBBOOT NWN post-natural-combat bounded continuation unexpectedly yielded a new step'
}

$postNaturalWall = [IO.File]::ReadAllBytes((Join-Path $build '_GBWALL.BIN'))
if ($postNaturalWall.Length -lt 6 -or [Text.Encoding]::ASCII.GetString($postNaturalWall, 0, 4) -ne 'WGRD' -or
    $postNaturalWall[4] -ne 16 -or $postNaturalWall[5] -ne 16) {
  throw 'GBBOOT NWN post-natural-combat continuation did not rebuild the area-1 WGRD wall bridge'
}

$postNaturalEffect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
if ($postNaturalEffect -notlike '*GBEF v0009 flags=0000 status=0000 geo=FFFF*' -or
    $postNaturalEffect -notlike '*GBRS flags=0000 area=000A pc=002D*') {
  throw 'GBBOOT NWN post-natural-combat continuation did not run the expected area-1 ECL front door'
}

Assert-GbpsHeader (Join-Path $build '_GBSEED.BIN') 3 1 | Out-Null

$postNaturalSession = [IO.File]::ReadAllBytes((Join-Path $build '_GBSESS.GBS'))
if ($postNaturalSession.Length -ne 16 -or [Text.Encoding]::ASCII.GetString($postNaturalSession, 0, 4) -ne 'GBSN' -or
    [BitConverter]::ToUInt16($postNaturalSession, 6) -ne 15 -or
    [BitConverter]::ToUInt16($postNaturalSession, 8) -ne 4 -or
    [BitConverter]::ToUInt16($postNaturalSession, 10) -ne 2 -or
    [BitConverter]::ToUInt16($postNaturalSession, 12) -ne 16 -or
    [BitConverter]::ToUInt16($postNaturalSession, 14) -ne 16) {
  throw 'GBBOOT NWN post-natural-combat continuation did not preserve the area-1 first-person pose'
}
for ($i = 0; $i -lt $afterNaturalCombatSession.Length; $i++) {
  if ($afterNaturalCombatSession[$i] -ne $postNaturalSession[$i]) {
    throw "GBBOOT NWN post-natural-combat continuation changed GBSN byte $i"
  }
}

foreach ($name in @('_GBCOMB.TRC', '_GBCOMB.OUT', '_GBCOMB.RAW', '_GBCR.BIN', '_GBRES.BIN', '_GBRES.TXT')) {
  if (Test-Path (Join-Path $build $name)) {
    throw "GBBOOT NWN post-natural-combat continuation unexpectedly wrote tactical artifact $name"
  }
}

$afterPostNaturalCombatGbpr = Assert-GbprHeader $gbprPath 3
if ($afterNaturalCombatGbpr.Length -ne $afterPostNaturalCombatGbpr.Length) {
  throw 'GBBOOT NWN post-natural-combat continuation changed GBPR length'
}
for ($i = 0; $i -lt $afterNaturalCombatGbpr.Length; $i++) {
  if ($afterNaturalCombatGbpr[$i] -ne $afterPostNaturalCombatGbpr[$i]) {
    throw "GBBOOT NWN post-natural-combat continuation changed GBPR byte $i"
  }
}

Invoke-NwnSelectorFlow 108 @(
  '@00 MONSTER id=0055 count=0002 pic=0055',
  '@01 MONSTER id=002E count=0005 pic=002E',
  '@02 MONSTER id=004C count=0002 pic=004C'
)

Invoke-NwnSelectorFlow 121 @(
  '@00 MONSTER id=005B count=0004 pic=005B'
)

Invoke-NwnNonCombatSelectorFlow 127 @(
  '@00 MONSTER id=002E count=0001 pic=002E',
  '@01 MONSTER id=004B count=0004 pic=004B'
)

Invoke-NwnNonCombatSelectorFlow 124 @(
  '@00 MONSTER id=0031 count=0004 pic=0031',
  '@01 MONSTER id=004E count=0004 pic=004E'
)

Invoke-NwnNonCombatSelectorFlow 122 @(
  '@00 MONSTER id=004D count=0003 pic=004D',
  '@01 MONSTER id=005F count=0004 pic=005F',
  '@02 MONSTER id=004E count=0004 pic=004E'
)

Write-Output "RESULT: GBBOOT NWN title/create/default-preview + seeded ECL7 combat/post-combat preview, natural ECL0 movement step, natural area-1 movement-to-combat/post-combat continuation, and noncombat selector flows PASS ($outcome/$naturalOutcome)"
