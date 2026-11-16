$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build 'cokmutation-test'
if (-not [IO.Path]::GetFullPath($run).StartsWith([IO.Path]::GetFullPath($build) + [IO.Path]::DirectorySeparatorChar)) {
  throw 'Mutation fixture escaped native/build'
}
if (Test-Path -LiteralPath $run) { Remove-Item -LiteralPath $run -Recurse -Force }
New-Item -ItemType Directory -Path $run | Out-Null
Push-Location $root
try {
  python -m tools.cok_native_mutation prepare $run
  if ($LASTEXITCODE -ne 0) { throw 'Mutation fixture generation failed' }
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
  if (-not $p.WaitForExit(120000)) { Stop-Process -Id $p.Id -Force; throw 'Mutation helper timed out' }
  python -m tools.cok_native_mutation verify $run
  if ($LASTEXITCODE -ne 0) { throw 'Mutation helper mismatch' }
} finally { Pop-Location }
