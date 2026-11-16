# ccecl-buck-short-menu-test.ps1 -- retail Buck Countdown Gen1 0x31 bridge.
param([switch]$Headless)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$native = $PSScriptRoot
$build = Join-Path $native 'build'
$run = [IO.Path]::GetFullPath((Join-Path $build 'ccecl-buck-short-menu-test'))
$buildRoot = [IO.Path]::GetFullPath($build)
$retail = 'D:\Games\Emulator\DOS\Goldbox\BuckRogers1-CountdownToDoomsday'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
. (Join-Path $native 'dosbox-smoke.ps1')

if (-not $run.StartsWith($buildRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Test directory is outside native build root: $run"
}
if (-not (Test-Path -LiteralPath $dosbox -PathType Leaf)) { throw "Required DOSBox executable is unavailable: $dosbox" }
foreach ($name in 'ecl1.dax', 'buck.cfg') {
  $source = Join-Path $retail $name
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Required Buck Countdown fixture is unavailable: $source" }
}
& (Join-Path $native 'build.ps1') -Target ccecl
if ($LASTEXITCODE -ne 0) { throw 'CCECL build failed' }
& (Join-Path $native 'build.ps1') -Target ccmenu
if ($LASTEXITCODE -ne 0) { throw 'CCMENU build failed' }

# The test mounts copies only; the user's Countdown installation remains read-only.
New-Item -ItemType Directory -Path $run -Force | Out-Null
foreach ($name in 'ccecl.com', 'ccmenu.com') {
  Copy-Item (Join-Path $build $name) (Join-Path $run $name.ToUpperInvariant()) -Force
}
Copy-Item (Join-Path $retail 'ecl1.dax') (Join-Path $run 'ECL1.DAX') -Force
Copy-Item (Join-Path $retail 'buck.cfg') (Join-Path $run 'BUCK.CFG') -Force

# ECL1#16 at 0x92FE is SHORT_MENU [7F79], #3: SHOOT/CHARGE/TAKE COVER.
# /@ receives decimal, so the source vaddr is 37630.
$conf = Join-Path $run '_buck-short-menu.conf'
@"
[sdl]
output=surface
[cpu]
cycles=fixed 25000
[autoexec]
mount C "$run"
C:
CCECL C:\ECL1.DAX 16 /! /@ 37630 /E C:\BUCK0.EFX > C:\BUCK0.TXT
CCMENU C:\BUCK0.EFX C:\CHARGE.GMO /S 1 > C:\CHGM.TXT
CCECL C:\ECL1.DAX 16 /R C:\BUCK0.EFX C:\CHARGE.GMO /E C:\CHARGE.EFX > C:\CHARGE.TXT
CCMENU C:\BUCK0.EFX C:\COVER.GMO /S 2 > C:\CVRM.TXT
CCECL C:\ECL1.DAX 16 /R C:\BUCK0.EFX C:\COVER.GMO /E C:\COVER.EFX > C:\COVER.TXT
exit
"@ | Set-Content -LiteralPath $conf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) { Stop-DosBoxSmoke $p; throw 'DOSBox timed out' }
if ($p.ExitCode -ne 0) { throw "DOSBox exited with code $($p.ExitCode)" }

$pending = [IO.File]::ReadAllBytes((Join-Path $run 'BUCK0.EFX'))
if ($pending.Length -ne 5920 -or [BitConverter]::ToUInt16($pending, 5760) -ne 0x31 -or
    [BitConverter]::ToUInt16($pending, 5756) -ne 0x7F79 -or [BitConverter]::ToUInt16($pending, 5758) -ne 3 -or
    [BitConverter]::ToUInt16($pending, 2250) -ne 1 -or [BitConverter]::ToUInt16($pending, 2252) -ne 0x31 -or
    [BitConverter]::ToUInt16($pending, 2254) -ne 5) { throw 'Buck retail SHORT_MENU pending contract failed' }
$text = Get-Content (Join-Path $run 'CHGM.TXT') -Raw
foreach ($label in '1\. SHOOT', '2\. CHARGE', '3\. TAKE COVER') {
  if ($text -notmatch $label) { throw "Buck retail SHORT_MENU label missing: $label" }
}
$charge = [IO.File]::ReadAllBytes((Join-Path $run 'CHARGE.EFX'))
if ($charge.Length -ne 5750 -or [BitConverter]::ToUInt16($charge, 8) -ne 0 -or
    [BitConverter]::ToUInt16($charge, 196) -ne 2 -or [BitConverter]::ToUInt16($charge, 198) -ne 0x7F79 -or
    [BitConverter]::ToUInt16($charge, 1222) -ne 1 -or [BitConverter]::ToUInt16($charge, 200) -ne 0x2DCB -or
    [BitConverter]::ToUInt16($charge, 1224) -ne 1) { throw 'Buck CHARGE did not take its source-defined cold-resume branch' }
$cover = [IO.File]::ReadAllBytes((Join-Path $run 'COVER.EFX'))
if ($cover.Length -ne 5750 -or [BitConverter]::ToUInt16($cover, 8) -ne 0 -or
    [BitConverter]::ToUInt16($cover, 196) -ne 1 -or [BitConverter]::ToUInt16($cover, 198) -ne 0x7F79 -or
    [BitConverter]::ToUInt16($cover, 1222) -ne 2) { throw 'Buck TAKE COVER did not take its distinct cold-resume branch' }
Write-Output 'RESULT: Buck Countdown retail SHORT_MENU bridge and two cold-resume branches PASS'
