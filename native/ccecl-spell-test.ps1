# Uses the freshly built CCECL; invoked by ccecl-effects-test.ps1.
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build 'ccecl-spell-test'
if (-not [IO.Path]::GetFullPath($run).StartsWith([IO.Path]::GetFullPath($build) + [IO.Path]::DirectorySeparatorChar)) {
  throw 'Spell fixture must remain inside native/build'
}
if (Test-Path -LiteralPath $run) { Remove-Item -LiteralPath $run -Recurse -Force }
New-Item -ItemType Directory -Path $run | Out-Null
Copy-Item -LiteralPath (Join-Path $build 'ccecl.com') -Destination (Join-Path $run 'CCECL.COM')
python (Join-Path $native 'spell-query-fixtures.py') prepare $run $root
if ($LASTEXITCODE -ne 0) { throw 'Spell fixture generation failed' }
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
$p = Start-DosBoxSmoke -Dosbox (Join-Path $root 'The Dark Queen of Krynn/DOSBOX/DOSBox.exe') -Conf $conf -Headless
if (-not $p.WaitForExit(30000)) { Stop-Process -Id $p.Id -Force; throw 'CoK spell queries timed out' }
python (Join-Path $native 'spell-query-fixtures.py') verify $run
if ($LASTEXITCODE -ne 0) { throw 'CoK spell query mismatch' }

Write-Host "RESULT: ccecl-spell-test PASS"
