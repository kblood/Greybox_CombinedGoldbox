# Player-session persistence and retail-source isolation regression.
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$build = Join-Path $native 'build'
$run = Join-Path $build 'player-session-test'
$source = Join-Path $run 'retail-source'
$sessions = Join-Path $run 'sessions'

. (Join-Path $native 'retail-stage.ps1')

if (Test-Path -LiteralPath $run) { Remove-Item -LiteralPath $run -Recurse -Force }
New-Item -ItemType Directory -Force (Join-Path $source 'SAVE') | Out-Null
[IO.File]::WriteAllBytes((Join-Path $source 'KRYNN.CFG'), [byte[]](1,2,3,4))
[IO.File]::WriteAllBytes((Join-Path $source 'ECL1.DAX'), [byte[]](5,6,7,8))
[IO.File]::WriteAllBytes((Join-Path $source 'SAVE\CHRDATA1.SAV'), [byte[]](9,10,11,12))
$sourceBefore = @{}
foreach ($relative in @('KRYNN.CFG', 'ECL1.DAX', 'SAVE\CHRDATA1.SAV')) {
  $item = Get-Item -LiteralPath (Join-Path $source $relative)
  $sourceBefore[$relative] = @($item.LastWriteTimeUtc.Ticks, (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash)
}

$first = New-PlayerSession -Source $source -SessionRoot $sessions
if ($first -like '*\_retail\*' -or -not $first.StartsWith($sessions, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Player session used the test-staging root: $first"
}
$save = Join-Path $first 'SAVE\CHRDATA1.SAV'
$playerBytes = [IO.File]::ReadAllBytes($save)
$playerBytes[0] = 77
[IO.File]::WriteAllBytes($save, $playerBytes)

# A second launch is the regression point: it must reopen the existing player
# tree without synchronizing the source save or replacing the player change.
$second = New-PlayerSession -Source $source -SessionRoot $sessions
if ($second -ine $first -or [IO.File]::ReadAllBytes($save)[0] -ne 77) {
  throw 'Player session did not preserve the modified save across relaunch.'
}
foreach ($relative in $sourceBefore.Keys) {
  $item = Get-Item -LiteralPath (Join-Path $source $relative)
  $actual = @($item.LastWriteTimeUtc.Ticks, (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash)
  if ($actual[0] -ne $sourceBefore[$relative][0] -or $actual[1] -ne $sourceBefore[$relative][1]) {
    throw "Player session touched source asset $relative"
  }
}

# A later source refresh also cannot overwrite the established session.
[IO.File]::WriteAllBytes((Join-Path $source 'SAVE\CHRDATA1.SAV'), [byte[]](42,10,11,12))
$third = New-PlayerSession -Source $source -SessionRoot $sessions
if ($third -ine $first -or [IO.File]::ReadAllBytes($save)[0] -ne 77) {
  throw 'A changed source save replaced player-session data.'
}

Write-Output 'RESULT: player session persists across relaunches and never refreshes retail source saves PASS'
