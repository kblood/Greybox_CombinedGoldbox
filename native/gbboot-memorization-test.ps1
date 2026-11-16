# All input/output, including BIOS typeahead helpers, stays in native/build.
param([string]$GbbootPath)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build ("gbboot-memorization-test-$PID")
if (-not [IO.Path]::GetFullPath($run).StartsWith([IO.Path]::GetFullPath($build) + [IO.Path]::DirectorySeparatorChar)) {
  throw 'Memorization fixture cleanup escaped native/build'
}
if (Test-Path -LiteralPath $run) { Remove-Item -LiteralPath $run -Recurse -Force }
New-Item -ItemType Directory -Path $run | Out-Null
$oracle = Join-Path $native 'memorization-fixtures.py'
python $oracle prepare $run
if ($LASTEXITCODE -ne 0) { throw 'Memorization fixture generation failed' }
if ($GbbootPath) { Copy-Item -LiteralPath $GbbootPath -Destination (Join-Path $run 'H/GBBOOT.COM') -Force }
$nasm = Join-Path $env:LOCALAPPDATA 'bin/NASM/nasm.exe'
foreach ($name in @('UIYES', 'UINO', 'UICANCEL')) {
  & $nasm -f bin (Join-Path $run "$name/KEYS.ASM") -o (Join-Path $run "$name/KEYS.COM")
  if ($LASTEXITCODE -ne 0) { throw 'DOS typeahead helper assembly failed' }
}
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
  if (-not $p.WaitForExit(60000)) { Stop-Process -Id $p.Id -Force; throw "Memorization $phase timed out" }
  python $oracle $phase $run
  if ($LASTEXITCODE -ne 0) { throw "Memorization $phase mismatch" }
}

Write-Host "RESULT: gbboot-memorization-test PASS"
