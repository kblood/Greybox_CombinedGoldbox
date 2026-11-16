# All retail assets are copied into a bounded, headless DOS fixture tree.
param([string]$CceclPath, [string]$GbbootPath)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build 'gbboot-lunar-test'
if (-not [IO.Path]::GetFullPath($run).StartsWith([IO.Path]::GetFullPath($build) + [IO.Path]::DirectorySeparatorChar)) {
  throw 'Lunar fixture cleanup escaped native/build'
}
if (Test-Path -LiteralPath $run) { Remove-Item -LiteralPath $run -Recurse -Force }
New-Item -ItemType Directory -Path $run | Out-Null
$oracle = Join-Path $native 'lunar-fixtures.py'
python $oracle prepare $run $root
if ($LASTEXITCODE -ne 0) { throw 'Lunar fixture generation failed' }
if ($CceclPath) { Copy-Item -LiteralPath $CceclPath -Destination (Join-Path $run 'H/CCECL.COM') -Force }
if ($GbbootPath) { Copy-Item -LiteralPath $GbbootPath -Destination (Join-Path $run 'H/GBBOOT.COM') -Force }
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
foreach ($phase in @('phase2', 'verify')) {
  $p = Start-DosBoxSmoke -Dosbox (Join-Path $root 'The Dark Queen of Krynn/DOSBOX/DOSBox.exe') -Conf $conf -Headless
  if (-not $p.WaitForExit(60000)) { Stop-Process -Id $p.Id -Force; throw "Lunar $phase timed out" }
  python $oracle $phase $run
  if ($LASTEXITCODE -ne 0) { throw "Lunar $phase mismatch" }
}

Write-Host "RESULT: gbboot-lunar-test PASS"
