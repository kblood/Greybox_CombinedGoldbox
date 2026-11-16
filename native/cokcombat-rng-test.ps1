$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$run = Join-Path $native 'build/cokcombat-rng-test'
Push-Location $root
try {
  & (Join-Path $native 'build.ps1') -Target engine
  if ($LASTEXITCODE -ne 0) { throw 'Engine build failed' }
  python -m tools.cok_combat_rng_native prepare $run
  if ($LASTEXITCODE -ne 0) { throw 'Combat RNG fixture generation failed' }
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
  if (-not $p.WaitForExit(60000)) { Stop-Process -Id $p.Id -Force; throw 'Combat RNG helper timed out' }
  python -m tools.cok_combat_rng_native verify $run
  if ($LASTEXITCODE -ne 0) { throw 'Combat RNG helper mismatch' }
} finally { Pop-Location }
