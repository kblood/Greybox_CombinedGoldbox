$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$run = Join-Path $PSScriptRoot 'build/cok-host-test'
& (Join-Path $PSScriptRoot 'build.ps1') -Target engine
if ($LASTEXITCODE -ne 0) { throw 'Host mutation build failed' }
python -m tools.cok_native_host prepare $run
if ($LASTEXITCODE -ne 0) { throw 'Host mutation preparation failed' }
$conf = Join-Path $run 'probe.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$run"
C:
call RUN.BAT
exit
"@ | Set-Content -LiteralPath $conf -Encoding ASCII
. (Join-Path $PSScriptRoot 'dosbox-smoke.ps1')
$probe = Start-DosBoxSmoke -Dosbox (Join-Path $root 'The Dark Queen of Krynn/DOSBOX/DOSBox.exe') -Conf $conf -Headless
if (-not $probe.WaitForExit(60000)) { Stop-Process -Id $probe.Id -Force; throw 'Host mutation timed out' }
python -m tools.cok_native_host verify $run
if ($LASTEXITCODE -ne 0) { throw 'Host mutation verification failed' }
