# CCGB DOS DAX -> GBIM bridge test.
#
# Verifies that a logical DAX block ID (rather than a fragile TOC ordinal) can
# be emitted as the resource CCFP consumes for native picture presentation.
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'Death Knights of Krynn'
# Mount a scratch mirror, never the retail release itself: `mount D "$game"`
# followed by `D:` makes the read-only GOG folder the DOS child's current drive,
# so its stray writes (CCFP.MOV, rewritten SAVE\CHRDATA*) land in the retail
# tree. CLAUDE.md: game-data folders are read-only source.
. (Join-Path $PSScriptRoot 'retail-stage.ps1')
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: CCGB GBIM bridge (DOSBox.exe absent)'
  exit 0
}

if (-not (Test-Path (Join-Path $game 'BIGPIC1.DAX'))) {
  Write-Output 'SKIP: CCGB GBIM bridge (DoK BIGPIC1.DAX absent)'
  exit 0
}

$gameMount = New-RetailStage -Source $game
& (Join-Path $native 'build.ps1') -Target cgb
. (Join-Path $native 'dosbox-smoke.ps1')

$out = Join-Path $build 'CGB112.GBI'
$picOut = Join-Path $build 'CGB096.GBI'
$log = Join-Path $build 'CGB112.TXT'
Remove-Item $out, $picOut, $log -Force -ErrorAction SilentlyContinue
$conf = Join-Path $build '_cgb_gbim_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$gameMount"
D:
C:\CGB /B 112 /I C:\CGB112.GBI BIGPIC1.DAX > C:\CGB112.TXT
C:\CGB /B 96 /I C:\CGB096.GBI PIC2.DAX >> C:\CGB112.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
if (-not $p.WaitForExit(50000)) {
  Stop-DosBoxSmoke $p
  throw 'CCGB GBIM bridge timed out'
}
if (-not (Test-Path $out)) { throw 'CCGB GBIM bridge produced no output' }
$bytes = [IO.File]::ReadAllBytes($out)
if ($bytes.Length -ne (14 + (304 * 120) + 768) -or
    [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne 'GBIM' -or
    [BitConverter]::ToUInt16($bytes, 4) -ne 1 -or
    [BitConverter]::ToUInt16($bytes, 6) -ne 112 -or
    $bytes[8] -ne 1 -or
    [BitConverter]::ToUInt16($bytes, 10) -ne 304 -or
    [BitConverter]::ToUInt16($bytes, 12) -ne 120) {
  throw 'CCGB GBIM bridge emitted an invalid DoK BIGPIC1.DAX block 112 resource'
}
$pixels = $bytes[14..(14 + (304 * 120) - 1)]
if (($pixels | Where-Object { $_ -ne 0 }).Count -lt 1000) {
  throw 'CCGB GBIM bridge emitted a blank DoK BIGPIC1.DAX block 112 resource'
}
if (-not (Test-Path $picOut)) { throw 'CCGB GBIM bridge produced no DoK PIC2 output' }
$pic = [IO.File]::ReadAllBytes($picOut)
if ($pic.Length -ne (14 + (88 * 88) + 768) -or
    [Text.Encoding]::ASCII.GetString($pic, 0, 4) -ne 'GBIM' -or
    [BitConverter]::ToUInt16($pic, 6) -ne 96 -or
    [BitConverter]::ToUInt16($pic, 10) -ne 88 -or
    [BitConverter]::ToUInt16($pic, 12) -ne 88) {
  throw 'CCGB GBIM bridge emitted an invalid DoK PIC2.DAX block 96 resource'
}
if (($pic[14..(14 + (88 * 88) - 1)] | Where-Object { $_ -ne 0 }).Count -lt 1000) {
  throw 'CCGB GBIM bridge emitted a blank DoK PIC2.DAX block 96 resource'
}
Write-Output 'RESULT: CCGB logical DAX block -> GBIM bridge PASS'
