"""Exercise the native DQK combat harness's independent oracle without DOSBox."""
from pathlib import Path
import shutil
import subprocess

import pytest


ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT/'native/dqk-combat-oracle.ps1'
MONCHA = ROOT/'The Dark Queen of Krynn/DISK2/MONCHA.GLB'


def test_dqk_combat_oracle_profiles_and_rng(tmp_path):
    assert HARNESS.is_file(), 'native combat oracle is required'
    if not shutil.which('pwsh') or not MONCHA.is_file():
        pytest.skip('PowerShell or held DQK MONCHA unavailable')
    runner = tmp_path/'oracle.ps1'
    runner.write_text(r'''
param([string]$Harness, [string]$Moncha)
$ErrorActionPreference = 'Stop'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($Harness, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
# Extract functions only: the harness's build, retail staging and DOSBox
# setup must never execute in this offline unit test.
$names = @('Read-MonchaStats', 'New-RngStream', 'Get-DqkAttackProfiles',
           'Get-DqkProfileDamage', 'Get-DqkInitialPositions', 'Get-DqkLeavingReactionRows',
           'Assert-DerivedCombat', 'Assert-DerivedGbcr')
$functions = @($ast.FindAll({param($n)
  $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -in $names
}, $true))
if ($functions.Count -ne $names.Count) { throw 'Missing or duplicated oracle functions' }
foreach ($fn in $functions) { Invoke-Expression $fn.Extent.Text }
function Assert-Value($Actual, $Expected, $Label) {
  if ("$Actual" -cne "$Expected") { throw "${Label}: wanted $Expected, got $Actual" }
}
$monsters = Read-MonchaStats -Path $Moncha -Ids @(12, 37, 52, 60)
foreach ($case in @(
  @(12, 1, '2,1,1'), @(12, 2, '2,1,1'),
  @(60, 1, '2,2,2,1'), @(60, 2, '2,2,2,1,1'),
  @(37, 1, '1'), @(37, 2, '1'), @(52, 1, '2,1,1')
)) {
  $profiles = @(Get-DqkAttackProfiles $monsters[$case[0]] $case[1])
  Assert-Value ($profiles.Kind -join ',') $case[2] "schedule $($case[0])/$($case[1])"
}
Assert-Value $monsters[12].Name 'UMBER HULK' 'member 12'
Assert-Value $monsters[60].Name 'PRINCE TALHOOK' 'member 60'
Assert-Value $monsters[37].Name 'ZOMBIE' 'member 37'
Assert-Value "$($monsters[12].DCount),$($monsters[12].DSides),$($monsters[12].SecondaryDCount),$($monsters[12].SecondaryDSides)" '3,4,2,10' 'UMBER HULK dice'
Assert-Value "$($monsters[60].DCount),$($monsters[60].DSides),$($monsters[60].DBonus),$($monsters[60].SecondaryDCount),$($monsters[60].SecondaryDSides),$($monsters[60].SecondaryDBonus)" '1,6,3,1,4,2' 'PRINCE TALHOOK dice'
$zero = [pscustomobject]@{ HalfAttacks=0; SecondaryHalfAttacks=0; DCount=0; DSides=0; DBonus=0; SecondaryDCount=0; SecondaryDSides=0; SecondaryDBonus=0 }
foreach ($round in @(1,2)) { Assert-Value (@(Get-DqkAttackProfiles $zero $round).Count) 0 'zero rates' }
$stream = New-RngStream 4660 100
Assert-Value ($stream[0..6] -join ',') '180656131,4115062150,2405537581,704941736,501817831,4099323418,4193160881' 'LCG recurrence'
foreach ($sides in @(0,1)) {
  $cursor = 0
  $profile = [pscustomobject]@{ DCount=3; DSides=$sides; DBonus=-1 }
  $damage = Get-DqkProfileDamage $profile $stream ([ref]$cursor)
  Assert-Value $cursor 0 "deterministic die $sides cursor"
  Assert-Value $damage ([Math]::Max(1,3*$sides-1)) "deterministic die $sides damage"
}
$cursor = 4
$profile = [pscustomobject]@{ DCount=1; DSides=4; DBonus=-10 }
Assert-Value (Get-DqkProfileDamage $profile $stream ([ref]$cursor)) 1 'negative bonus damage floor'
Assert-Value $cursor 5 'nontrivial die advances RNG'
Write-Output 'PASS: retail profiles, odd-rate phase, zero rates, deterministic dice and damage floor'

$dump = 'GBEC groups=0001 @00 MONSTER id=0034 count=0001 pic=0034'
# Independent seed-4660 constants after two initiative draws:
# d20=2 miss, d20=17 hit, d4=4, d20=19 hit, d4=2.
# Spending secondary cadence on the miss is essential: d8 would yield 8.
$missTrace = @(
  '1 init p0 - - - - - - -', '1 init e0 - - - - - - -',
  '1 attack e0 p0 2 10 0 - 6 -',
  '1 attack e0 p0 17 10 1 4 2 -',
  '1 attack e0 p0 19 10 1 2 0 -',
  '1 slain e0 p0 - - - - 0 0', '1 end - enemy - - - - - -'
)
# This synthetic roster attacks without movement: place p0 adjacent to the
# oracle's e0 start (5,4). One candidate spends no target-selection draw.
$adjacentParty = @{ p0 = @(4,4) }
$facts = Assert-DerivedCombat -Label 'secondary miss' -DumpText $dump -Trace $missTrace -MonchaPath $Moncha -Seed 4660 -PartyPositions $adjacentParty
Assert-Value $facts.RngOffset 2 'miss spends cadence without a damage draw'
Assert-Value $facts.Outcome 'enemy' 'synthetic result'
$rejectedGeometry = $false
try { Assert-DerivedCombat -Label 'nonadjacent roster' -DumpText $dump -Trace $missTrace -MonchaPath $Moncha -Seed 4660 | Out-Null }
catch { if ($_ -notlike '*site3*') { throw }; $rejectedGeometry = $true }
Assert-Value $rejectedGeometry $true 'out-of-reach attacks rejected'
Write-Output 'PASS: explicit adjacent fixture and invalid default geometry are distinguished'
 $gbcr = New-Object byte[] 22
[Text.Encoding]::ASCII.GetBytes('GBCR').CopyTo($gbcr, 0)
[BitConverter]::GetBytes([uint16]1).CopyTo($gbcr, 4)
[BitConverter]::GetBytes([uint16]1).CopyTo($gbcr, 6)
[BitConverter]::GetBytes([uint16]0).CopyTo($gbcr, 8)
[BitConverter]::GetBytes([uint16]1).CopyTo($gbcr, 10)
$gbcr[16] = 0; $gbcr[17] = 1
[BitConverter]::GetBytes([int16]0).CopyTo($gbcr, 18)
[BitConverter]::GetBytes([int16]6).CopyTo($gbcr, 20)
Assert-DerivedGbcr -Label 'GBCR oracle control' -Gbcr $gbcr -Facts $facts
$gbcr[18] = 1
$rejectedGbcr = $false
try { Assert-DerivedGbcr -Label 'GBCR mutation' -Gbcr $gbcr -Facts $facts }
catch { if ($_ -notlike '*hp expected*') { throw }; $rejectedGbcr = $true }
Assert-Value $rejectedGbcr $true 'GBCR hp mutation rejected'
Write-Output 'PASS: GBCR fields match derived combat and a corrupted HP record is rejected'

$reactionFixture = @(
  '1 move p5 - - - - - - - 4 5',
  '1 attack e2 p5 18 -4 1 1 72 -',
  '1 move p5 - - - - - - - 4 4'
 ) | ForEach-Object { ,($_ -split '\s+') }
$reactionRows = Get-DqkLeavingReactionRows -Rows $reactionFixture -PartyIds @('p0','p1','p2','p3','p4','p5') -EnemyIds @('e0','e1','e2')
Assert-Value $reactionRows.Count 1 'adjacent leaving reaction recognized'
$noReactionFixture = @($reactionFixture[0].Clone(), $reactionFixture[1].Clone(), $reactionFixture[2].Clone())
$noReactionFixture[0][10] = '3'
$noReactionRows = Get-DqkLeavingReactionRows -Rows $noReactionFixture -PartyIds @('p0','p1','p2','p3','p4','p5') -EnemyIds @('e0','e1','e2')
Assert-Value $noReactionRows.Count 0 'nonadjacent move rejected as leaving reaction'
Write-Output 'PASS: leaving-reaction geometry recognizes adjacency and rejects nonadjacent control'
Write-Output 'PASS: secondary miss advances profile and repeated RNG offset scans stay independent'

# Four otherwise RNG-aligned misses exceed GHAST's three swings in round 1.
$excessTrace = @(
  '1 init p0 - - - - - - -', '1 init e0 - - - - - - -',
  '1 attack e0 p0 2 30 0 - 6 -', '1 attack e0 p0 17 30 0 - 6 -',
  '1 attack e0 p0 12 30 0 - 6 -', '1 attack e0 p0 19 30 0 - 6 -',
  '1 end - party - - - - - -'
)
$rejected = $false
try { Assert-DerivedCombat -Label excess -DumpText $dump -Trace $excessTrace -MonchaPath $Moncha -Seed 4660 -PartyPositions $adjacentParty | Out-Null }
catch { if ($_ -notlike '*site2 row 5*') { throw }; $rejected = $true }
Assert-Value $rejected $true 'excess attempts rejected'
Write-Output 'PASS: fourth attack rejected despite aligned d20 rolls'
''', encoding='utf-8')
    result = subprocess.run(
        ['pwsh', '-NoProfile', '-File', str(runner), str(HARNESS), str(MONCHA)],
        cwd=ROOT, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout+result.stderr
    assert result.stdout.count('PASS:') == 6, result.stdout
