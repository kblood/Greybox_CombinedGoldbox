# Probe the recovered CoK retail attract entry through the native GBBOOT host.
# It retains the ECL, combat, and framebuffer artifacts for inspection while
# asserting the source-owned contract that the forthcoming presentation loop
# must preserve.
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'Champions of Krynn'
$run = Join-Path $build 'gbcok-demo-probe'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

foreach ($name in @('ECL2.DAX', 'GEO2.DAX', 'WALLDEF2.DAX', '8X8D2.DAX', 'MON2CHA.DAX', 'CPIC2.DAX', 'HEAD2.DAX', 'BODY2.DAX')) {
  if (-not (Test-Path (Join-Path $game $name))) { throw "CoK demo source is missing $name" }
}
if (Test-Path $run) { Remove-Item -LiteralPath $run -Recurse -Force }
New-Item -ItemType Directory -Force $run | Out-Null
foreach ($name in @('START.EXE', 'KRYNN.CFG', 'ECL1.DAX', 'GEO1.DAX', 'ECL2.DAX', 'GEO2.DAX', 'WALLDEF2.DAX', '8X8D2.DAX', 'MON2CHA.DAX', 'CPIC2.DAX', 'PIC2.DAX', 'BIGPIC2.DAX', 'HEAD2.DAX', 'BODY2.DAX')) {
  Copy-Item (Join-Path $game $name) (Join-Path $run $name) -Force
}

$conf = Join-Path $build '_gbcok_demo_probe.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\CGB /B 70 /I C:\DIRECT.GBI PIC2.DAX > C:\CGBSCENE.TXT
C:\GBBOOT /E /X /A 2 /B 57 > C:\COKDEMO.TXT
exit
"@ | Set-Content -Path $conf -Encoding ASCII

foreach ($name in @('COKDEMO.TXT', 'CGBSCENE.TXT', 'DIRECT.GBI', '_GBPICS.BIN', '_GBPIC.RAW', '_GBECL.TXT', '_GBRES.TXT', '_GBCOMB.TRC', '_GBCOMB.RAW', '_GBECL.BIN')) {
  Remove-Item (Join-Path $build $name) -Force -ErrorAction SilentlyContinue
}

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
if (-not $p.WaitForExit(90000)) {
  Stop-Process -Id $p.Id -Force
  throw 'CoK native demo probe timed out'
}

$out = Get-Content (Join-Path $build 'COKDEMO.TXT') -Raw
$sceneProbe = Get-Content (Join-Path $build 'CGBSCENE.TXT') -Raw
$effect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
if ($out -notlike '*native: CCECL ECL2.DAX entry 57*' -or
    $out -like '*CCGB: cannot open file*' -or
    $sceneProbe -like '*cannot open*' -or
    -not (Test-Path (Join-Path $build 'DIRECT.GBI')) -or
    $effect -notlike '*TEXT=EVEN WITH THE DEFEAT OF THE DRAG*' -or
    $effect -notlike '*TEXT=EXPLORE CITIES ...*' -or
    $effect -notlike '*@00 MONSTER id=000A count=0002*' -or
    $effect -notlike '*@01 MONSTER id=0004 count=0004*' -or
    $effect -notlike '*@02 MONSTER id=001F count=0006*' -or
    $effect -notlike '*GBNJ joins=0003*') {
  throw 'Native CoK demo entry did not preserve the recovered ECL2#57 source contract'
}
$rawPath = Join-Path $build '_GBCOMB.RAW'
if (-not (Test-Path $rawPath) -or (Get-Item $rawPath).Length -ne (4 + 320 * 200 + 768)) {
  throw 'Native CoK demo entry did not render a 320x200 combat framebuffer'
}
$pictureLog = [System.IO.File]::ReadAllBytes((Join-Path $build '_GBPICS.BIN'))
if ($pictureLog.Length -lt 10 -or
    [Text.Encoding]::ASCII.GetString($pictureLog, 0, 4) -ne 'GBPI' -or
    [BitConverter]::ToUInt16($pictureLog, 4) -ne 1 -or
    [BitConverter]::ToUInt16($pictureLog, 6) -lt 2 -or
    -not (($pictureLog[8..($pictureLog.Length - 1)] -join ',') -like '*68*')) {
  throw 'Native CoK demo entry did not replay the recovered picture sequence including paper-doll PICTURE #68'
}
$sceneRaw = Join-Path $build '_GBPIC.RAW'
if (-not (Test-Path $sceneRaw) -or (Get-Item $sceneRaw).Length -ne (4 + 320 * 200 + 768)) {
  throw 'Native CoK demo entry did not snapshot a 320x200 recovered picture scene'
}
Write-Output 'RESULT: CoK ECL2#57 native demo source/combat baseline PASS'
