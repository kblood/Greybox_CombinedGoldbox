# Probe the recovered DoK retail attract entry through the native GBBOOT host.
# The disposable run retains the actual ECL output, picture trace, and combat
# framebuffer so the branching dialogue/montage path can be extended without
# depending on a mutable installed game directory.
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'Death Knights of Krynn'
$run = Join-Path $build 'gbdok-demo-probe'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

$assets = @('START.EXE', 'DKK.CFG', 'ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX',
  '8X8D1.DAX', 'MON1CHA.DAX', 'CPIC1.DAX', 'BIGPIC1.DAX', 'PIC2.DAX',
  'PIC4.DAX', 'PIC5.DAX', 'DUNGCOM.DAX')
foreach ($name in $assets) {
  if (-not (Test-Path (Join-Path $game $name))) { throw "DoK demo source is missing $name" }
}
if (Test-Path $run) { Remove-Item -LiteralPath $run -Recurse -Force }
New-Item -ItemType Directory -Force $run | Out-Null
foreach ($name in $assets) { Copy-Item (Join-Path $game $name) (Join-Path $run $name) -Force }

$conf = Join-Path $build '_gbdok_demo_probe.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X /A 1 /B 2 > C:\DOKDEMO.TXT
exit
"@ | Set-Content -Path $conf -Encoding ASCII

foreach ($name in @('DOKDEMO.TXT', '_GBPICS.BIN', '_GBPIC.RAW', '_GBECL.TXT',
  '_GBRES.TXT', '_GBCOMB.TRC', '_GBCOMB.RAW', '_GBECL.BIN')) {
  Remove-Item (Join-Path $build $name) -Force -ErrorAction SilentlyContinue
}

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
if (-not $p.WaitForExit(90000)) {
  Stop-Process -Id $p.Id -Force
  throw 'DoK native demo probe timed out'
}

$out = Get-Content (Join-Path $build 'DOKDEMO.TXT') -Raw
$effect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
if ($out -notlike '*native: CCECL ECL1.DAX entry 2*' -or
    $out -like '*GBBOOT: native preview failed*' -or
    $out -like '*demo scene skipped*' -or
    $effect -notlike '*@00 NPC id=0030 morale=0064*' -or
    $effect -notlike '*@01 NPC id=0031 morale=0064*' -or
    $effect -notlike '*@02 NPC id=0032 morale=0064*' -or
    $effect -notlike '*GBSX count=*') {
  throw 'Native DoK demo entry did not preserve the recovered ECL1#2 source contract'
}
$rawPath = Join-Path $build '_GBCOMB.RAW'
if (-not (Test-Path $rawPath) -or (Get-Item $rawPath).Length -ne (4 + 320 * 200 + 768)) {
  throw 'Native DoK demo entry did not render a 320x200 combat framebuffer'
}
$pictureLog = [IO.File]::ReadAllBytes((Join-Path $build '_GBPICS.BIN'))
if ($pictureLog.Length -ne 12 -or
    [Text.Encoding]::ASCII.GetString($pictureLog, 0, 4) -ne 'GBPI' -or
    [BitConverter]::ToUInt16($pictureLog, 4) -ne 1 -or
    [BitConverter]::ToUInt16($pictureLog, 6) -ne 2 -or
    [BitConverter]::ToUInt16($pictureLog, 8) -ne 78 -or
    [BitConverter]::ToUInt16($pictureLog, 10) -ne 60) {
  throw 'Native DoK demo entry did not replay its recoverable PIC4 picture prefix in source order'
}
$sceneRaw = Join-Path $build '_GBPIC.RAW'
if (-not (Test-Path $sceneRaw) -or (Get-Item $sceneRaw).Length -ne (4 + 320 * 200 + 768)) {
  throw 'Native DoK demo entry did not snapshot a 320x200 recovered picture scene'
}
$scene = [IO.File]::ReadAllBytes((Join-Path $build '_GBSCENE.GBI'))
if ([Text.Encoding]::ASCII.GetString($scene, 0, 4) -ne 'GBIM' -or
    [BitConverter]::ToUInt16($scene, 6) -ne 60 -or
    [BitConverter]::ToUInt16($scene, 10) -ne 88 -or
    [BitConverter]::ToUInt16($scene, 12) -ne 88) {
  throw 'Native DoK demo entry did not retain the final PIC4 #60 frame-0 GBIM'
}
Write-Output 'RESULT: DoK ECL1#2 native demo source/combat baseline PASS'
