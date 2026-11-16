param([string]$HelperDirectory)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
python native/owned-item-fixtures.py prepare native/build/gbboot-item-query-test
if ($HelperDirectory) { Copy-Item -Path (Join-Path $HelperDirectory '*.com') -Destination native/build/gbboot-item-query-test/H -Force }
if ($LASTEXITCODE -ne 0) { throw 'Probe preparation failed' }
$probeRoot = Join-Path (Get-Location) 'native/build/gbboot-item-query-test'
$probeConf = Join-Path $probeRoot 'probe.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$probeRoot"
C:
call RUN.BAT
exit
"@ | Set-Content -LiteralPath $probeConf -Encoding ASCII
. ./native/dosbox-smoke.ps1
$probeProcess = Start-DosBoxSmoke -Dosbox (Join-Path (Get-Location) 'The Dark Queen of Krynn/DOSBOX/DOSBox.exe') -Conf $probeConf -Headless
if (-not $probeProcess.WaitForExit(30000)) { Stop-Process -Id $probeProcess.Id -Force; throw 'Owned query probe timed out' }
python native/owned-item-fixtures.py verify native/build/gbboot-item-query-test
if ($LASTEXITCODE -ne 0) { throw 'Probe verification failed' }

Write-Host "RESULT: gbboot-item-query-test PASS"
