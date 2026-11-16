# CCFP GBSN persistence smoke: two DOS processes must share one live pose.
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
& (Join-Path $native 'build.ps1') -Target ccfp
. (Join-Path $native 'dosbox-smoke.ps1')

# Open 16x16 WGRD with deterministic dimensions and no blocking walls.
$grid = New-Object byte[] (6 + 16 * 16 * 4 + 16 * 16)
[Text.Encoding]::ASCII.GetBytes('WGRD').CopyTo($grid, 0)
$grid[4] = 16
$grid[5] = 16
$grid[6 + 16 * 16 * 4 + (13 * 16 + 7)] = 141
[IO.File]::WriteAllBytes((Join-Path $build 'SESSMAP.BIN'), $grid)

$conf = Join-Path $build '_ccsession_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
C:
CCFP SESSMAP.BIN /M R /N SESSION.GBS
ren CCFP.MOV FIRST.MOV
CCFP SESSMAP.BIN /M F /N SESSION.GBS /Y STEP.GBS
ren CCFP.MOV SECOND.MOV
exit
"@ | Set-Content $conf -Encoding ASCII
Remove-Item (Join-Path $build 'SESSION.GBS'),(Join-Path $build 'FIRST.MOV'),(Join-Path $build 'SECOND.MOV') -Force -ErrorAction SilentlyContinue
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
if (-not $p.WaitForExit(10000)) { Stop-Process -Id $p.Id -Force; throw 'CCFP session smoke timed out' }

$session = [IO.File]::ReadAllBytes((Join-Path $build 'SESSION.GBS'))
if ($session.Length -ne 16 -or [Text.Encoding]::ASCII.GetString($session, 0, 4) -ne 'GBSN' -or
    [BitConverter]::ToUInt16($session, 4) -ne 1) { throw 'Invalid GBSN header' }
$first = Get-Content (Join-Path $build 'FIRST.MOV')
$second = Get-Content (Join-Path $build 'SECOND.MOV')
if ($first[-1] -ne '8 13 3' -or $second[0] -ne '8 13 3') {
  throw "Pose did not cross process boundary: '$($first[-1])' -> '$($second[0])'"
}
if ($second[-1] -ne '7 13 3') { throw "Resumed forward move was wrong: '$($second[-1])'" }
$step = [IO.File]::ReadAllBytes((Join-Path $build 'STEP.GBS'))
if ($step.Length -ne 14 -or [Text.Encoding]::ASCII.GetString($step, 0, 4) -ne 'GBST' -or
    [BitConverter]::ToUInt16($step, 6) -ne 141 -or [BitConverter]::ToUInt16($step, 8) -ne 7 -or
    [BitConverter]::ToUInt16($step, 10) -ne 13 -or [BitConverter]::ToUInt16($step, 12) -ne 6) {
  throw 'GBST destination descriptor or pose is invalid'
}
Write-Output 'RESULT: CCFP GBSN persistence + GBST step yield PASS'
