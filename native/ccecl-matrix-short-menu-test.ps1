# ccecl-matrix-short-menu-test.ps1 -- retail Matrix Cubed Gen1 0x31 bridge.
param([switch]$Headless)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$native = $PSScriptRoot
$build = Join-Path $native 'build'
$run = [IO.Path]::GetFullPath((Join-Path $build 'ccecl-matrix-short-menu-test'))
$buildRoot = [IO.Path]::GetFullPath($build)
$retail = Join-Path $root 'matrixcubed_extracted\BuckRogers2\c\Matrix'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
. (Join-Path $native 'dosbox-smoke.ps1')

if (-not $run.StartsWith($buildRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Test directory is outside native build root: $run"
}
if (-not (Test-Path -LiteralPath $dosbox -PathType Leaf)) { throw "Required DOSBox executable is unavailable: $dosbox" }
foreach ($name in 'ECL1.DAX', 'MATRIX.CFG') {
  $source = Join-Path $retail $name
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Required Matrix Cubed fixture is unavailable: $source" }
}
& (Join-Path $native 'build.ps1') -Target ccecl
if ($LASTEXITCODE -ne 0) { throw 'CCECL build failed' }
& (Join-Path $native 'build.ps1') -Target ccmenu
if ($LASTEXITCODE -ne 0) { throw 'CCMENU build failed' }

# The retail archive remains read-only. DOSBox mounts only this private copy.
New-Item -ItemType Directory -Path $run -Force | Out-Null
foreach ($name in 'ccecl.com', 'ccmenu.com') {
  Copy-Item (Join-Path $build $name) (Join-Path $run $name.ToUpperInvariant()) -Force
}
foreach ($name in 'ECL1.DAX', 'MATRIX.CFG') {
  Copy-Item (Join-Path $retail $name) (Join-Path $run $name) -Force
}

# Matrix's own GAME.OVR maps 0x31 to the 0x2B handler. ECL1#18 at 0x91AF
# is SHORT_MENU [7F79], #6: LAUNCH / REPAIR / FUEL / AMMO / MED SUP / EXIT.
# /@ accepts a decimal vaddr, so 0x91AF is 37295.
$conf = Join-Path $run '_matrix-short-menu.conf'
@"
[sdl]
output=surface
[cpu]
cycles=fixed 25000
[autoexec]
mount C "$run"
C:
CCECL C:\ECL1.DAX 18 /! /@ 37295 /E C:\M0.EFX > C:\M0.TXT
CCMENU C:\M0.EFX C:\REP.GMO /S 1 > C:\REPM.TXT
CCECL C:\ECL1.DAX 18 /R C:\M0.EFX C:\REP.GMO /E C:\REPAIR.EFX > C:\REPAIR.TXT
CCMENU C:\M0.EFX C:\EXT.GMO /S 5 > C:\EXTM.TXT
CCECL C:\ECL1.DAX 18 /R C:\M0.EFX C:\EXT.GMO /E C:\EXIT.EFX > C:\EXIT.TXT
exit
"@ | Set-Content -LiteralPath $conf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) { Stop-DosBoxSmoke $p; throw 'DOSBox timed out' }
if ($p.ExitCode -ne 0) { throw "DOSBox exited with code $($p.ExitCode)" }

$pending = [IO.File]::ReadAllBytes((Join-Path $run 'M0.EFX'))
$repair = [IO.File]::ReadAllBytes((Join-Path $run 'REPAIR.EFX'))
$exit = [IO.File]::ReadAllBytes((Join-Path $run 'EXIT.EFX'))
if ($pending.Length -ne 5920 -or [BitConverter]::ToUInt16($pending, 5760) -ne 0x31 -or
    [BitConverter]::ToUInt16($pending, 5756) -ne 0x7F79 -or [BitConverter]::ToUInt16($pending, 5758) -ne 6 -or
    [BitConverter]::ToUInt16($pending, 2250) -ne 1 -or [BitConverter]::ToUInt16($pending, 2252) -ne 0x31 -or
    [BitConverter]::ToUInt16($pending, 2254) -ne 8) { throw 'Matrix Cubed retail SHORT_MENU pending contract failed' }
$text = Get-Content (Join-Path $run 'REPM.TXT') -Raw
foreach ($label in '1\. LAUNCH', '2\. REPAIR', '3\. FUEL', '4\. AMMO', '5\. MED SUP', '6\. EXIT') {
  if ($text -notmatch $label) { throw "Matrix Cubed retail SHORT_MENU label missing: $label" }
}
if ($repair.Length -ne 5750 -or [BitConverter]::ToUInt16($repair, 196) -ne 11 -or
    [BitConverter]::ToUInt16($repair, 198) -ne 0x7F79 -or [BitConverter]::ToUInt16($repair, 1222) -ne 1 -or
    [BitConverter]::ToUInt16($repair, 206) -ne 0x4D1C -or [BitConverter]::ToUInt16($repair, 1226) -ne 0x0096) {
  throw 'Matrix Cubed REPAIR did not take its source-defined cold-resume branch'
}
if ($exit.Length -ne 5750 -or [BitConverter]::ToUInt16($exit, 196) -ne 1 -or
    [BitConverter]::ToUInt16($exit, 198) -ne 0x7F79 -or [BitConverter]::ToUInt16($exit, 1222) -ne 5) {
  throw 'Matrix Cubed EXIT did not take its distinct cold-resume branch'
}
if ([Convert]::ToHexString($repair) -eq [Convert]::ToHexString($exit)) {
  throw 'Matrix Cubed REPAIR and EXIT cold-resume transcripts unexpectedly match'
}
Write-Output 'RESULT: Matrix Cubed retail SHORT_MENU bridge and two cold-resume branches PASS'
