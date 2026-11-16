# Uses the freshly built native helpers. All retail inputs are copied read-only.
param([string]$GbbootPath)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build ("gbboot-learn-test-$PID")
if (-not [IO.Path]::GetFullPath($run).StartsWith([IO.Path]::GetFullPath($build) + [IO.Path]::DirectorySeparatorChar)) {
  throw 'Learning fixture cleanup escaped native/build'
}
if (Test-Path -LiteralPath $run) { Remove-Item -LiteralPath $run -Recurse -Force }
New-Item -ItemType Directory -Path $run | Out-Null
$oracle = Join-Path $native 'rest-learn-fixtures.py'
python $oracle prepare $run $root
if ($LASTEXITCODE -ne 0) { throw 'Rest learning fixture generation failed' }
if ($GbbootPath) { Copy-Item -LiteralPath $GbbootPath -Destination (Join-Path $run 'H/gbboot.com') -Force }
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
"@ | Set-Content $conf -Encoding ASCII
. (Join-Path $native 'dosbox-smoke.ps1')
foreach ($phase in @('phase2','verify')) {
  $p = Start-DosBoxSmoke -Dosbox (Join-Path $root 'The Dark Queen of Krynn/DOSBOX/DOSBox.exe') -Conf $conf -Headless
  if (-not $p.WaitForExit(30000)) { Stop-Process -Id $p.Id -Force; throw "Rest learning $phase timed out" }
  python $oracle $phase $run
  if ($LASTEXITCODE -ne 0) { throw "Rest learning $phase mismatch" }
}

Write-Host "RESULT: gbboot-learn-test PASS"
