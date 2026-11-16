$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build ("inventory-test-$PID")
if (-not [IO.Path]::GetFullPath($run).StartsWith([IO.Path]::GetFullPath($build) + [IO.Path]::DirectorySeparatorChar)) {
  throw 'Inventory fixture escaped native/build'
}
if (Test-Path -LiteralPath $run) { Remove-Item -LiteralPath $run -Recurse -Force }
New-Item -ItemType Directory -Path $run | Out-Null
python (Join-Path $native 'inventory-fixtures.py') prepare $run
if ($LASTEXITCODE -ne 0) { throw 'Inventory fixture generation failed' }
$conf = Join-Path $run 'probe.conf'
@"
[sdl]
fullscreen=false
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
@echo off
mount C "$run"
C:
call RUN.BAT
exit
"@ | Set-Content -LiteralPath $conf -Encoding ASCII
. (Join-Path $native 'dosbox-smoke.ps1')
$p = Start-DosBoxSmoke -Dosbox (Join-Path $root 'The Dark Queen of Krynn/DOSBOX/DOSBox.exe') -Conf $conf -Headless
if (-not $p.WaitForExit(60000)) { Stop-Process -Id $p.Id -Force; throw 'Inventory helper timed out' }
python (Join-Path $native 'inventory-fixtures.py') verify $run
if ($LASTEXITCODE -ne 0) { throw 'Inventory helper mismatch' }

Write-Host "RESULT: ccinv-test PASS"
