# Launcher regression: prepare an interactive CoK session without starting
# DOSBox, then prove its C: runtime and boot route are private to that session.
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build 'run-cok-session-test'
$source = Join-Path $run 'retail-source'
$sessions = Join-Path $run 'sessions'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox -PathType Leaf)) {
  throw "Required DOSBox executable is unavailable: $dosbox"
}
if (Test-Path -LiteralPath $run) { Remove-Item -LiteralPath $run -Recurse -Force }
New-Item -ItemType Directory -Force $source | Out-Null
foreach ($name in @('KRYNN.CFG', 'ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX')) {
  [IO.File]::WriteAllBytes((Join-Path $source $name), [byte[]](1,2,3,4))
}
$sourceBefore = @{}
foreach ($name in @('KRYNN.CFG', 'ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX')) {
  $item = Get-Item -LiteralPath (Join-Path $source $name)
  $sourceBefore[$name] = @($item.LastWriteTimeUtc.Ticks, (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash)
}

$launcher = Join-Path $native 'run-cok.ps1'
$first = @(& $launcher -GamePath $source -SessionRoot $sessions -DosBoxPath $dosbox -PrepareOnly)
$first = $first | Where-Object { $_ -is [pscustomobject] } | Select-Object -Last 1
if (-not $first) { throw 'run-cok -PrepareOnly did not return launch details.' }
if (-not $first.RuntimeMount.StartsWith($first.GameMount + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw "Launcher runtime is not within its player session: $($first.RuntimeMount)"
}
if ($first.RuntimeMount -ieq $build) { throw "Launcher mounted shared build output: $($first.RuntimeMount)" }
foreach ($name in @('GBBOOT.COM', 'CCHOST.COM')) {
  if (-not (Test-Path -LiteralPath (Join-Path $first.RuntimeMount $name) -PathType Leaf)) {
    throw "Private runtime did not copy $name"
  }
}
$conf = Get-Content -LiteralPath $first.Conf -Raw
if ($conf -notmatch [regex]::Escape("mount C `"$($first.RuntimeMount)`"")) { throw 'DOSBox config did not mount private C: runtime.' }
if ($conf -notmatch [regex]::Escape("mount D `"$($first.GameMount)`"")) { throw 'DOSBox config did not mount player game snapshot.' }
if ($first.BootArgs -ne '/E /!') {
  throw "Normal launcher did not enter the native Begin/Create path: $($first.BootArgs)"
}

# State beside C: must survive re-preparation.  This is where native helpers
# can write their own sidecars without colliding with native\build fixtures.
$sidecar = Join-Path $first.RuntimeMount '_GBLOCAL.TXT'
[IO.File]::WriteAllText($sidecar, 'player state')
# A resume normally follows a player camp save. Its byte content is immaterial
# to launcher preparation; the persistent session location is the contract here.
[IO.File]::WriteAllBytes((Join-Path $first.GameMount 'GREYBOX.GBS'), [byte[]](71,66,83,78))
$second = @(& $launcher -GamePath $source -SessionRoot $sessions -DosBoxPath $dosbox -Resume -PrepareOnly)
$second = $second | Where-Object { $_ -is [pscustomobject] } | Select-Object -Last 1
if (-not $second -or $second.GameMount -ine $first.GameMount -or $second.RuntimeMount -ine $first.RuntimeMount) {
  throw 'Launcher did not reopen the original player session and runtime.'
}
if ([IO.File]::ReadAllText($sidecar) -ne 'player state') { throw 'Launcher preparation replaced session C: state.' }
if ($second.BootArgs -ne '/5 /!') { throw "Resume launcher did not enable interactive mode: $($second.BootArgs)" }
foreach ($name in $sourceBefore.Keys) {
  $item = Get-Item -LiteralPath (Join-Path $source $name)
  $actual = @($item.LastWriteTimeUtc.Ticks, (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash)
  if ($actual[0] -ne $sourceBefore[$name][0] -or $actual[1] -ne $sourceBefore[$name][1]) {
    throw "Launcher preparation touched retail source asset $name"
  }
}

$party = @(& $launcher -GamePath $source -SessionRoot $sessions -DosBoxPath $dosbox -PartyMenu -PrepareOnly)
$party = $party | Where-Object { $_ -is [pscustomobject] } | Select-Object -Last 1
if (-not $party -or $party.BootArgs -ne '/E /!') { throw 'Party-menu launcher did not enable interactive mode.' }
Write-Output 'RESULT: run-cok private player runtime + interactive launch routes PASS'
