# Launch a long DQK WHO-handoff route outside a short-lived host command window.
#
# The task runs the existing GameLink-only `Launch -KeepAlive` mode. It creates no
# permanent service: the caller receives the generated task name, and the paired
# `dqk-native-control-route.ps1 -Stage Attach` or `-Stage Reap` owns cleanup of
# the recorded DOSBox-X PID. Remove this scheduled task after it has started.

param(
  [Parameter(Mandatory)][string]$MountDir,
  [Parameter(Mandatory)][string]$OutDir,
  [ValidatePattern('^[A-Ja-j]$')][string]$SaveSlot = 'B',
  [ValidateSet('Attack','Creep','Leave')][string]$EncounterChoice = 'Creep',
  [ValidateSet('Left','Right')][string]$CreepDirection = 'Left',
  [ValidateSet('Attack','Creep')][string]$FollowupEncounterChoice = 'Creep',
  [ValidateSet('Jump','Wait','Attack')][string]$PortalChoice = 'Wait',
  [ValidateSet('Throw','Wait','Attack')][string]$StoneChoice = 'Throw',
  [ValidateRange(30,3600)][int]$HandoffMaxAgeSec = 900,
  [string]$TaskName = ''
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$route = Join-Path $repo 'tools\dqk-native-control-route.ps1'
$output = Join-Path $repo $OutDir
if (Test-Path -LiteralPath $output) { throw "output directory already exists: $output" }
if (-not $TaskName) { $TaskName = 'Greybox-DQK-WHO-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') }
if ($TaskName -notmatch '^[A-Za-z0-9_.-]+$') { throw 'TaskName must be safe for schtasks' }

$runnerDir = Join-Path $repo 'build\dqk-who-task-runners'
New-Item -ItemType Directory -Path $runnerDir -Force | Out-Null
$runner = Join-Path $runnerDir ($TaskName + '.ps1')
$runnerError = Join-Path $runnerDir ($TaskName + '.error.txt')
# schtasks limits /TR to 261 characters, which is too short for an explicit route with a
# full build mount and output path.  Persist the exact argument vector in a tiny one-shot
# runner, then make /TR only invoke that runner.  The runner removes itself after the route
# exits; it does not hold a credential or create a service.
$routeLiteral = $route.Replace("'", "''")
$routeCall = "& '$routeLiteral' -MountDir '$( $MountDir.Replace("'", "''") )' -OutDir '$( $OutDir.Replace("'", "''") )' -Stage Launch -KeepAlive -SaveSlot $($SaveSlot.ToUpperInvariant()) -EncounterChoice $EncounterChoice -CreepDirection $CreepDirection -FollowupEncounterChoice $FollowupEncounterChoice -PortalChoice $PortalChoice -StoneChoice $StoneChoice -HandoffMaxAgeSec $HandoffMaxAgeSec"
@"
`$ErrorActionPreference = 'Stop'
try { $routeCall }
catch { `$_ | Out-String | Set-Content -LiteralPath '$($runnerError.Replace("'", "''"))' -Encoding utf8; throw }
finally { Remove-Item -LiteralPath `$PSCommandPath -Force -ErrorAction SilentlyContinue }
"@ | Set-Content -LiteralPath $runner -Encoding utf8
$command = ('"pwsh" -NoProfile -File "{0}"' -f $runner)

# /SC ONCE is only a carrier for /Run; the time is intentionally inert. The task is run
# immediately below and is not a recurring background service.
& schtasks.exe /Create /TN $TaskName /SC ONCE /ST 00:00 /TR $command /RL LIMITED /F | Out-Null
if ($LASTEXITCODE -ne 0) { throw "could not create scheduled task $TaskName" }
try {
  & schtasks.exe /Run /TN $TaskName | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "could not start scheduled task $TaskName" }
} catch {
  & schtasks.exe /Delete /TN $TaskName /F | Out-Null
  Remove-Item -LiteralPath $runner -Force -ErrorAction SilentlyContinue
  throw
}

[ordered]@{
  schema_version = 1
  task_name = $TaskName
  runner = $runner
  runner_error = $runnerError
  mount = $MountDir
  output = $OutDir
  next = "Wait for $OutDir\\who-handoff.json, then run dqk-native-control-route.ps1 -Stage Attach. Delete task with: schtasks /Delete /TN $TaskName /F"
} | ConvertTo-Json -Depth 3
