# GBBOOT headless intro/music front-door smoke.
#
# Runs CoK through the native /E front door with /J forcing the verified title
# frames even though /X exits headlessly. The flow also creates a native party
# member and verifies the engine reaches a rendered first-person snapshot.
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'Champions of Krynn'
$run = Join-Path $build 'gbintro-flow-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT CoK /J intro flow (DOSBox.exe absent)'
  exit 0
}

foreach ($name in @(
  'KRYNN.CFG',
  'TITLE.DAX',
  'ECL1.DAX',
  'GEO1.DAX',
  'WALLDEF1.DAX',
  '8X8D1.DAX'
)) {
  if (-not (Test-Path (Join-Path $game $name))) {
    Write-Output "SKIP: GBBOOT CoK /J intro flow ($name absent)"
    exit 0
  }
}

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

$music = Join-Path $build 'COKTITLE.GBM'
if (-not (Test-Path $music)) {
  throw 'COKTITLE.GBM was not generated; CoK title music source is required for this smoke'
}

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null

foreach ($name in @(
  'KRYNN.CFG',
  'TITLE.DAX',
  'ECL1.DAX',
  'GEO1.DAX',
  'WALLDEF1.DAX',
  '8X8D1.DAX'
)) {
  Copy-Item (Join-Path $game $name) (Join-Path $run $name) -Force
}

$conf = Join-Path $build '_gbintro_flow_test.conf'
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
C:\GBBOOT /E /X /J /R INTRO_CLERIC C > C:\GBINTRO.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

Remove-Item (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build 'GBINTRO.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
if (-not $p.WaitForExit(30000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT /J intro flow timed out'
}

$out = Get-Content (Join-Path $build 'GBINTRO.TXT') -Raw
if ($out -notlike '*CCGB: bounded DAX frame displayed*') {
  throw 'GBBOOT /J did not drive bounded TITLE.DAX frame playback through CGB'
}
if ($out -notlike '*GBM1 PC-speaker sequence advanced*') {
  throw 'GBBOOT /J did not drive the title music through CGB'
}

$gbprPath = Join-Path $build '_GBPARTY.GBP'
if (-not (Test-Path $gbprPath)) { throw 'GBBOOT /J did not create _GBPARTY.GBP' }
$gbpr = [IO.File]::ReadAllBytes($gbprPath)
if ($gbpr.Length -ne 426 -or
    [Text.Encoding]::ASCII.GetString($gbpr, 0, 4) -ne 'GBPR' -or
    [BitConverter]::ToUInt16($gbpr, 4) -ne 2 -or
    [BitConverter]::ToUInt16($gbpr, 6) -ne 1 -or
    [BitConverter]::ToUInt16($gbpr, 8) -ne 410 -or
    [BitConverter]::ToUInt16($gbpr, 10) -ne 0 -or
    [BitConverter]::ToUInt16($gbpr, 12) -ne 1 -or
    [BitConverter]::ToUInt16($gbpr, 14) -ne 1) {
  throw 'GBBOOT /J created an invalid one-member GBPR header'
}

$record = 17
$name = [Text.Encoding]::ASCII.GetString($gbpr, $record + 1, $gbpr[$record])
if ($gbpr[16] -ne 0x80 -or $name -ne 'INTRO_CLERIC' -or
    $gbpr[$record + 90] -ne 6 -or $gbpr[$record + 91] -ne 0) {
  throw 'GBBOOT /J created the wrong native CoK character'
}

$seedPath = Join-Path $build '_GBSEED.BIN'
if (-not (Test-Path $seedPath)) { throw 'GBBOOT /J did not create _GBSEED.BIN' }
$seed = [IO.File]::ReadAllBytes($seedPath)
if ([Text.Encoding]::ASCII.GetString($seed, 0, 4) -ne 'GBPS' -or
    [BitConverter]::ToUInt16($seed, 4) -lt 1 -or
    [BitConverter]::ToUInt16($seed, 8) -ne 1) {
  throw 'GBBOOT /J did not refresh GBPS from the native-created roster'
}

$raw = [IO.File]::ReadAllBytes((Join-Path $build '_GBVIEW.RAW'))
if ([BitConverter]::ToUInt16($raw, 0) -ne 320 -or [BitConverter]::ToUInt16($raw, 2) -ne 200) {
  throw 'GBBOOT /J did not continue to a 320x200 native snapshot'
}

$nonzero = 0
$colors = @{}
for ($i = 4; $i -lt $raw.Length; $i++) {
  if ($raw[$i] -ne 0) { $nonzero++ }
  $colors[[int]$raw[$i]] = $true
}
if ($nonzero -lt 4096 -or $colors.Count -lt 8) {
  throw 'GBBOOT /J produced an implausibly blank native snapshot'
}

Write-Output 'RESULT: GBBOOT /E /X /J title/music, native create, and snapshot flow PASS'
