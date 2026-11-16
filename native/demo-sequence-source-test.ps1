# demo-sequence-source-test.ps1 -- static evidence gate for the two retail Gen1
# attract scripts that GBBOOT's native replay must reproduce.
#
# This deliberately uses the repository's dialect-aware mapper, not CCECL's
# bounded GBSX handoff.  It keeps the full source order (including the section
# after COMBAT) executable as a regression contract while the DOS replay
# transport remains separate from the stable resume record.
param()

$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$mapper = Join-Path $root 'tools\map_gen1_demo_entry.py'
$build = Join-Path $root 'build'

# The mapper needs the ignored CoAB oracle map; without it this static gate
# cannot run.  GB_ORACLE_MAP overrides the path (also honoured by the mapper).
$oracleMap = if ($env:GB_ORACLE_MAP) { $env:GB_ORACLE_MAP } else { Join-Path $build 'coab-oracle-map.json' }
if (-not (Test-Path -LiteralPath $oracleMap)) {
  Write-Host "SKIP: CoAB oracle map not present: $oracleMap"
  exit 0
}

function Get-DemoInstructions([string]$Profile) {
  & python $mapper --profile $Profile | Write-Output
  if ($LASTEXITCODE -ne 0) { throw "Demo mapper failed for $Profile" }
  $path = Join-Path $build "$Profile-demo-entry.json"
  if (-not (Test-Path $path)) { throw "Demo mapper did not emit $path" }
  $report = Get-Content $path -Raw | ConvertFrom-Json
  if (-not $report.demo_block_known -or @($report.demo_chain).Count -ne 1) {
    throw "$Profile demo entry was not uniquely resolved"
  }
  return @($report.demo_chain[0].instructions)
}

function Assert-Ordered([object[]]$Instructions, [string[]]$Needles, [string]$Label) {
  $start = 0
  foreach ($needle in $Needles) {
    $found = $false
    for ($i = $start; $i -lt $Instructions.Count; $i++) {
      if ($Instructions[$i].text -eq $needle) {
        $start = $i + 1
        $found = $true
        break
      }
    }
    if (-not $found) { throw "$Label is missing ordered source event: $needle" }
  }
}

function Assert-CountAtLeast([object[]]$Instructions, [string]$Needle, [int]$Minimum, [string]$Label) {
  $count = @($Instructions | Where-Object text -eq $Needle).Count
  if ($count -lt $Minimum) { throw "$Label expected at least $Minimum '$Needle' events, found $count" }
}

$cok = Get-DemoInstructions 'champions-of-krynn'
Assert-Ordered $cok @(
  'PICTURE #70',
  'CALL [1:0x2e10]',
  'PICTURE #68',
  'PICTURE #116',
  'PICTURE #59',
  'SETUP_MONSTER #10, #2, #10',
  'COMBAT',
  'PICTURE #23',
  'PROGRAM #3',
  'EXIT'
) 'CoK ECL2#57'
Assert-CountAtLeast $cok 'CALL [1:0x2e10]' 3 'CoK ECL2#57 redraw montage'
Assert-CountAtLeast $cok 'CALL [1:0x6803]' 24 'CoK ECL2#57 picture animation'

$dok = Get-DemoInstructions 'death-knights-of-krynn'
Assert-Ordered $dok @(
  'PICTURE #78',
  'CALL [1:0x2dcb]',
  'PICTURE #60',
  'PICTURE #113',
  'PICTURE #5',
  'SETUP_MONSTER #255, #0, #24, #0',
  'COMBAT',
  'PICTURE #96',
  'PROGRAM #3',
  'EXIT'
) 'DoK ECL1#2'
Assert-CountAtLeast $dok 'CALL [1:0x2dcb]' 3 'DoK ECL1#2 redraw montage'
Assert-CountAtLeast $dok 'GOSUB [1:0x8451]' 10 'DoK ECL1#2 walk-helper montage'
Assert-CountAtLeast $dok 'CALL [1:0xc01e]' 1 'DoK ECL1#2 walk-helper move-forward dispatch'
Assert-CountAtLeast $dok 'CALL [1:0x6803]' 25 'DoK ECL1#2 picture animation'

Write-Output "RESULT: full static retail demo source order PASS (CoK=$($cok.Count) instructions, DoK=$($dok.Count) instructions)"
