# GBBOOT DoK headless intro front-door smoke.
#
# Pins the no-focus DoK title frame path. When the local Amiga SMUS extract is
# available, build.ps1 also emits DOKTITLE.GBM and GBBOOT drives it through CGB
# during the first title frame. The first run omits TITLE.DAX to prove /J really
# enters the intro helper; the second run adds TITLE.DAX and continues through
# native compact-party creation and a first-person snapshot.
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'Death Knights of Krynn'
$run = Join-Path $build 'gbdok-intro-flow-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
$dbx = Join-Path $root 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$music = Join-Path $build 'DOKTITLE.GBM'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT DoK /J intro flow (DOSBox.exe absent)'
  exit 0
}
if (-not (Test-Path -LiteralPath $dbx)) {
  Write-Output 'SKIP: GBBOOT DoK /J intro flow (DOSBox-X absent)'
  exit 0
}

function Get-I16LE([byte[]]$Bytes, [int]$Offset) {
  return [BitConverter]::ToInt16($Bytes, $Offset)
}

foreach ($name in @('DKK.CFG', 'TITLE.DAX', 'ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX')) {
  if (-not (Test-Path (Join-Path $game $name))) {
    Write-Output "SKIP: GBBOOT DoK /J intro flow ($name absent)"
    exit 0
  }
}

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null

foreach ($name in @('DKK.CFG', 'ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX')) {
  Copy-Item (Join-Path $game $name) (Join-Path $run $name) -Force
}

$conf = Join-Path $build '_gbdok_intro_flow_test.conf'
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
C:\GBBOOT /E /X /J /R DOK_INTRO C > C:\DOKINTRO.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

Remove-Item (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build 'DOKINTRO.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
if (-not $p.WaitForExit(30000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT DoK /J missing-title probe timed out'
}

$missingTitleOut = Get-Content (Join-Path $build 'DOKINTRO.TXT') -Raw
if ((Test-Path (Join-Path $build '_GBVIEW.RAW')) -or
    $missingTitleOut -notlike '*GBBOOT: native preview failed*') {
  throw 'GBBOOT DoK /J did not fail through the title helper when TITLE.DAX was absent'
}

Copy-Item (Join-Path $game 'TITLE.DAX') (Join-Path $run 'TITLE.DAX') -Force
Remove-Item (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build 'DOKINTRO.TXT') -Force -ErrorAction SilentlyContinue

Invoke-DokGameLinkAckFlow -DbxExe $dbx -BuildDir $build -GameDir $run `
  -GuestCommand 'C:\GBBOOT /E /X /J /R DOK_INTRO C > C:\DOKINTRO.TXT' `
  -DosLogFile (Join-Path $build 'gbdok-intro-dosbox-files.log') `
  -CaptureRoot (Join-Path $build 'gbdok-intro-gamelink') -TimeoutSeconds 60

$out = Get-Content (Join-Path $build 'DOKINTRO.TXT') -Raw
if ([regex]::Matches($out, 'CCGB: bounded DAX frame displayed').Count -ne 3) {
  throw 'GBBOOT DoK /J did not compose and play all three TITLE.DAX screens through CGB'
}
if ((Test-Path $music) -and $out -notlike '*GBM1 PC-speaker sequence advanced*') {
  throw 'GBBOOT DoK /J did not drive DOKTITLE.GBM through CGB'
}

$gbprPath = Join-Path $build '_GBPARTY.GBP'
if (-not (Test-Path $gbprPath)) { throw 'GBBOOT DoK /J did not create _GBPARTY.GBP' }
$gbpr = [IO.File]::ReadAllBytes($gbprPath)
if ($gbpr.Length -ne 426 -or
    [Text.Encoding]::ASCII.GetString($gbpr, 0, 4) -ne 'GBPR' -or
    [BitConverter]::ToUInt16($gbpr, 4) -ne 2 -or
    [BitConverter]::ToUInt16($gbpr, 6) -ne 1 -or
    [BitConverter]::ToUInt16($gbpr, 8) -ne 410 -or
    [BitConverter]::ToUInt16($gbpr, 10) -ne 1 -or
    [BitConverter]::ToUInt16($gbpr, 12) -ne 2 -or
    [BitConverter]::ToUInt16($gbpr, 14) -ne 1) {
  throw 'GBBOOT DoK /J created an invalid compact GBPR header'
}

$record = 17
$name = [Text.Encoding]::ASCII.GetString($gbpr, $record + 1, $gbpr[$record])
$meta = $record + 216
if ($gbpr[16] -ne 0x80 -or
    $name -ne 'DOK_INTRO' -or
    $gbpr[$record + 32] -ne 1 -or
    [Text.Encoding]::ASCII.GetString($gbpr, $meta, 4) -ne 'GBD1' -or
    [BitConverter]::ToUInt16($gbpr, $meta + 4) -ne 1 -or
    (Get-I16LE $gbpr ($meta + 6)) -le 0 -or
    [BitConverter]::ToUInt16($gbpr, $meta + 10) -ne 1 -or
    [BitConverter]::ToUInt16($gbpr, $meta + 12) -ne 2 -or
    [BitConverter]::ToUInt16($gbpr, $meta + 16) -le 0 -or
    $gbpr[$meta + 18] -ne 2 -or
    [BitConverter]::ToUInt16($gbpr, $meta + 22) -ne 4) {
  throw 'GBBOOT DoK /J created the wrong compact native character'
}

$seedPath = Join-Path $build '_GBSEED.BIN'
if (-not (Test-Path $seedPath)) { throw 'GBBOOT DoK /J did not create _GBSEED.BIN' }
$seed = [IO.File]::ReadAllBytes($seedPath)
if ([Text.Encoding]::ASCII.GetString($seed, 0, 4) -ne 'GBPS' -or
    [BitConverter]::ToUInt16($seed, 4) -ne 1 -or
    ([BitConverter]::ToUInt16($seed, 6) -band 1) -eq 0 -or
    [BitConverter]::ToUInt16($seed, 8) -ne 1 -or
    $seed[17] -ne 1 -or
    [BitConverter]::ToUInt16($seed, 70) -ne 4) {
  throw 'GBBOOT DoK /J did not refresh compact GBPS movement from the native-created roster'
}

$raw = [IO.File]::ReadAllBytes((Join-Path $build '_GBVIEW.RAW'))
if ([BitConverter]::ToUInt16($raw, 0) -ne 320 -or [BitConverter]::ToUInt16($raw, 2) -ne 200) {
  throw 'GBBOOT DoK /J did not continue to a 320x200 native snapshot'
}

$nonzero = 0
$colors = @{}
for ($i = 4; $i -lt $raw.Length; $i++) {
  if ($raw[$i] -ne 0) { $nonzero++ }
  $colors[[int]$raw[$i]] = $true
}
if ($nonzero -lt 4096 -or $colors.Count -lt 8) {
  throw 'GBBOOT DoK /J produced an implausibly blank native snapshot'
}

Write-Output 'RESULT: GBBOOT DoK /E /X /J title/music, native compact create, and snapshot flow PASS'
$global:LASTEXITCODE = 0
