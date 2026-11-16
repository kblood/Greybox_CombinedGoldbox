# ccecl-pod-short-menu-test.ps1 -- retail Pools of Darkness Gen1 0x31 bridge.
param([switch]$Headless)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$native = $PSScriptRoot
$build = Join-Path $native 'build'
$run = [IO.Path]::GetFullPath((Join-Path $build 'ccecl-pod-short-menu-test'))
$buildRoot = [IO.Path]::GetFullPath($build)
$retail = 'C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
. (Join-Path $native 'dosbox-smoke.ps1')

if (-not $run.StartsWith($buildRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Test directory is outside native build root: $run"
}
if (-not (Test-Path -LiteralPath $dosbox -PathType Leaf)) { throw "Required DOSBox executable is unavailable: $dosbox" }
foreach ($name in 'ECL1.DAX', 'POOL4.CFG') {
  $source = Join-Path $retail $name
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Required Pools of Darkness fixture is unavailable: $source" }
}
& (Join-Path $native 'build.ps1') -Target ccecl
if ($LASTEXITCODE -ne 0) { throw 'CCECL build failed' }
& (Join-Path $native 'build.ps1') -Target ccmenu
if ($LASTEXITCODE -ne 0) { throw 'CCMENU build failed' }

# Do not mount or alter the title installation. The DOS smoke uses a copy.
New-Item -ItemType Directory -Path $run -Force | Out-Null
foreach ($name in 'ccecl.com', 'ccmenu.com') {
  Copy-Item (Join-Path $build $name) (Join-Path $run $name.ToUpperInvariant()) -Force
}
foreach ($name in 'ECL1.DAX', 'POOL4.CFG') {
  Copy-Item (Join-Path $retail $name) (Join-Path $run $name) -Force
}

# ECL1#51's direct 0x8385 entry is a retail SHORT_MENU [0098], #4:
# ATTACK/FLEE/TALK/WAIT. /@ accepts a decimal vaddr, so 0x8385 is 33669.
$conf = Join-Path $run '_pod-short-menu.conf'
@"
[sdl]
output=surface
[cpu]
cycles=fixed 25000
[autoexec]
mount C "$run"
C:
CCECL C:\ECL1.DAX 51 /! /@ 33669 /E C:\POD0.EFX > C:\POD0.TXT
CCMENU C:\POD0.EFX C:\POD0.GMO /S 0 > C:\PODM.TXT
CCECL C:\ECL1.DAX 51 /R C:\POD0.EFX C:\POD0.GMO /E C:\POD1.EFX > C:\POD1.TXT
exit
"@ | Set-Content -LiteralPath $conf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) { Stop-DosBoxSmoke $p; throw 'DOSBox timed out' }
if ($p.ExitCode -ne 0) { throw "DOSBox exited with code $($p.ExitCode)" }

$pending = [IO.File]::ReadAllBytes((Join-Path $run 'POD0.EFX'))
$resumed = [IO.File]::ReadAllBytes((Join-Path $run 'POD1.EFX'))
if ($pending.Length -ne 5920 -or [BitConverter]::ToUInt16($pending, 5760) -ne 0x31 -or
    [BitConverter]::ToUInt16($pending, 5756) -ne 0x0098 -or [BitConverter]::ToUInt16($pending, 5758) -ne 4 -or
    [BitConverter]::ToUInt16($pending, 2250) -ne 1 -or [BitConverter]::ToUInt16($pending, 2252) -ne 0x31 -or
    [BitConverter]::ToUInt16($pending, 2254) -ne 6) { throw 'PoD retail SHORT_MENU pending contract failed' }
if ($resumed.Length -ne 5750 -or [BitConverter]::ToUInt16($resumed, 8) -ne 3 -or
    [BitConverter]::ToUInt16($resumed, 196) -lt 1 -or [BitConverter]::ToUInt16($resumed, 198) -ne 0x0098 -or
    [BitConverter]::ToUInt16($resumed, 1222) -ne 0) { throw 'PoD retail SHORT_MENU did not cold-resume ATTACK' }
$text = Get-Content (Join-Path $run 'PODM.TXT') -Raw
foreach ($label in '1\. ATTACK', '2\. FLEE', '3\. TALK', '4\. WAIT') {
  if ($text -notmatch $label) { throw "PoD retail SHORT_MENU label missing: $label" }
}
Write-Output 'RESULT: Pools of Darkness retail SHORT_MENU bridge and cold resume PASS'
