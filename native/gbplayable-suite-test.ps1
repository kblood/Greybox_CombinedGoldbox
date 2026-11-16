# gbplayable-suite-test.ps1 -- sequential native boot-to-gameplay suite.
#
# The playable-flow scripts share native\build sidecars (_GB*.BIN/_GB*.RAW/
# _GB*.TXT). Run them sequentially; parallel execution can make unrelated flows
# fail by overwriting another test's sidecars.
param(
  [switch]$CoreOnly,
  [switch]$Headless,
  [switch]$SelfTestVerdicts
)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot

$coreFlows = @(
  @{ Label = 'CoK'; Script = 'gbcok-playable-flow-test.ps1' },
  @{ Label = 'DoK'; Script = 'gbdok-playable-flow-test.ps1' },
  @{ Label = 'DQK'; Script = 'gbdqk-playable-flow-test.ps1' },
  @{ Label = 'DQK /R'; Script = 'gbdqk-create-test.ps1' }
)

$optionalFlows = @(
  @{ Label = 'Curse/CoAB'; Script = 'gbcoab-flow-test.ps1' },
  @{ Label = 'NWN'; Script = 'gbnwn-flow-test.ps1' },
  @{ Label = 'DQK Amiga GLIB'; Script = 'gbdqk-amiga-glib-flow-test.ps1' },
  @{ Label = 'Pool'; Script = 'gbpool-flow-test.ps1' },
  @{ Label = 'Secret GLIB raw GEO'; Script = 'gbsecret-hlib-flow-test.ps1' },
  @{ Label = 'Secret GLIB ECL/GEO'; Script = 'gbsecret-glib-flow-test.ps1' },
  @{ Label = 'Secret GLIB ECL combat'; Script = 'gbsecret-glib-combat-flow-test.ps1' },
  @{ Label = 'Gateway'; Script = 'gbgateway-glib-flow-test.ps1' },
  @{ Label = 'Buck'; Script = 'gbbuck-flow-test.ps1' }
)

function Invoke-Flow {
  param(
    [Parameter(Mandatory)][hashtable]$Flow,
    [string]$Path
  )
  if (-not $Path) { $Path = Join-Path $native $Flow.Script }
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Missing playable-flow script: $($Flow.Script)"
  }
  $tokens = $null
  $parseErrors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$parseErrors)
  if ($parseErrors.Count -gt 0) {
    throw "Could not parse $($Flow.Script): $($parseErrors[0].Message)"
  }
  $hasHeadless = $false
  if ($ast.ParamBlock) {
    foreach ($param in $ast.ParamBlock.Parameters) {
      if ($param.Name.VariablePath.UserPath -eq 'Headless') { $hasHeadless = $true; break }
    }
  }
  Write-Host ("[GBPLAYABLE] {0}: running {1}" -f $Flow.Label, $Flow.Script)
  $logRoot = Join-Path ([IO.Path]::GetTempPath()) ('gb-playable-child-' + [guid]::NewGuid().ToString('n'))
  New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
  $outFile = Join-Path $logRoot 'stdout.txt'
  $errFile = Join-Path $logRoot 'stderr.txt'
  $proc = $null
  try {
    $arguments = @('-NoProfile', '-NonInteractive', '-File', $Path)
    if ($hasHeadless) { $arguments += "-Headless:$Headless" }
    $proc = Start-Process -FilePath 'pwsh' -ArgumentList $arguments -WorkingDirectory $native `
      -RedirectStandardOutput $outFile -RedirectStandardError $errFile -PassThru -WindowStyle Hidden
    $proc.WaitForExit()
    $exitCode = $proc.ExitCode
    $output = if (Test-Path -LiteralPath $outFile) { @(Get-Content -LiteralPath $outFile) } else { @() }
    $errors = if (Test-Path -LiteralPath $errFile) { @(Get-Content -LiteralPath $errFile) } else { @() }
  } finally {
    if ($null -ne $proc) { $proc.Dispose() }
    Remove-Item -LiteralPath $logRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
  foreach ($line in $output) { Write-Host $line }
  foreach ($line in $errors) { Write-Host $line }
  if ($exitCode -ne 0) { throw "$($Flow.Script) exited $exitCode" }
  $skipLine = @($output | Where-Object { $_ -match '^\s*SKIP\s*:' } | Select-Object -First 1)
  if ($skipLine.Count -gt 0) {
    return [pscustomobject]@{ status = 'SKIP'; verdict = $skipLine[0].Trim() }
  }
  $passLine = @($output | Where-Object { $_ -match 'RESULT:.*\bPASS\b' } | Select-Object -First 1)
  if ($passLine.Count -eq 0) {
    throw "$($Flow.Script) exited 0 without RESULT: ... PASS or SKIP:"
  }
  return [pscustomobject]@{ status = 'PASS'; verdict = $passLine[0].Trim() }
}

function Invoke-PlayableVerdictSelfTest {
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('gb-playable-verdict-' + [guid]::NewGuid().ToString('n'))
  New-Item -ItemType Directory -Path $tmp -Force | Out-Null
  try {
    $cases = @{
      pass = "Write-Output 'RESULT: synthetic PASS'`nexit 0"
      skip = "Write-Output 'SKIP: synthetic optional data absent'`nexit 0"
      empty = "Write-Output 'synthetic completed without a verdict'`nexit 0"
      nonzero = "Write-Output 'synthetic controlled failure'`nexit 7"
    }
    foreach ($name in $cases.Keys) {
      Set-Content -LiteralPath (Join-Path $tmp "$name.ps1") -Encoding ASCII -Value $cases[$name]
    }
    $pass = Invoke-Flow -Flow @{ Label = 'synthetic pass'; Script = 'pass.ps1' } -Path (Join-Path $tmp 'pass.ps1')
    $skip = Invoke-Flow -Flow @{ Label = 'synthetic skip'; Script = 'skip.ps1' } -Path (Join-Path $tmp 'skip.ps1')
    if ($pass.status -ne 'PASS' -or $skip.status -ne 'SKIP') {
      throw 'playable-suite self-test did not distinguish synthetic PASS from SKIP'
    }
    foreach ($case in @(@{ Name = 'empty'; Needle = 'without RESULT' }, @{ Name = 'nonzero'; Needle = 'exited 7' })) {
      try {
        Invoke-Flow -Flow @{ Label = "synthetic $($case.Name)"; Script = "$($case.Name).ps1" } `
          -Path (Join-Path $tmp "$($case.Name).ps1") | Out-Null
        throw "playable-suite self-test let synthetic $($case.Name) complete"
      } catch {
        if ($_.Exception.Message -notmatch $case.Needle) { throw }
      }
    }
  } finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
  Write-Host 'RESULT: GBPLAYABLE verdict self-test PASS'
  return 0
}

if ($SelfTestVerdicts) { exit (Invoke-PlayableVerdictSelfTest) }

$corePassed = 0
$coreSkipped = 0
foreach ($flow in $coreFlows) {
  $result = Invoke-Flow $flow
  if ($result.status -eq 'SKIP') { $coreSkipped++ } else { $corePassed++ }
}

$optionalChecked = 0
$optionalPassed = 0
$optionalSkipped = 0
if (-not $CoreOnly) {
  foreach ($flow in $optionalFlows) {
    $optionalChecked++
    $result = Invoke-Flow $flow
    if ($result.status -eq 'SKIP') {
      $optionalSkipped++
    } else {
      $optionalPassed++
    }
  }
}

if ($CoreOnly) {
  $status = if ($coreSkipped -gt 0) { 'SKIP' } else { 'PASS' }
  Write-Output ("RESULT: GBBOOT playable CoK/DoK/DQK native /E core suite {0} (including DQK native /R create; {1} passed, {2} skipped)" -f $status, $corePassed, $coreSkipped)
} else {
  $status = if ($coreSkipped -gt 0) { 'SKIP' } else { 'PASS' }
  Write-Output ("RESULT: GBBOOT playable CoK/DoK/DQK native /E suite {0} including DQK native /R create ({1} core passed, {2} core skipped; +{3} optional real-data flow check(s): {4} passed, {5} skipped)" -f $status, $corePassed, $coreSkipped, $optionalChecked, $optionalPassed, $optionalSkipped)
}
