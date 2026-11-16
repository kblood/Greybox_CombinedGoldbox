# GBBOOT broader Gen1 headless title/native-party combat flow.
#
# Uses small synthetic DAX fixtures to keep the broader non-Krynn profiles in
# the serial FlowOnly gate: title helper dispatch, /R native party creation,
# ECL combat yield, CCCOMBAT handoff, and GBCR result output.
param(
  [switch]$Headless
)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build 'gbbroader-flow-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT broader title flow (DOSBox.exe absent)'
  exit 0
}

& (Join-Path $native 'build.ps1') -Target engine
& (Join-Path $native 'build.ps1') -Target gbmark
. (Join-Path $native 'dosbox-smoke.ps1')

function ConvertTo-DaxLiteralRle([byte[]]$Raw) {
  $compressed = [System.Collections.Generic.List[byte]]::new()
  $offset = 0
  while ($offset -lt $Raw.Length) {
    $chunk = [Math]::Min(128, $Raw.Length - $offset)
    $compressed.Add([byte]($chunk - 1))
    for ($i = 0; $i -lt $chunk; $i++) {
      $compressed.Add($Raw[$offset + $i])
    }
    $offset += $chunk
  }
  return $compressed.ToArray()
}

function Write-SyntheticDaxBlocks([string]$Path, [hashtable[]]$Blocks) {
  $entries = @()
  $dataSize = 0
  foreach ($block in $Blocks) {
    [byte[]]$raw = $block.Raw
    [byte[]]$comp = ConvertTo-DaxLiteralRle $raw
    $entries += ,@{
      Id = [int]$block.Id
      Offset = $dataSize
      RawSize = $raw.Length
      Comp = $comp
    }
    $dataSize += $comp.Length
  }

  $tocBytes = 9 * $entries.Count
  [byte[]]$bytes = [byte[]]::new(2 + $tocBytes + $dataSize)
  [BitConverter]::GetBytes([uint16]$tocBytes).CopyTo($bytes, 0)
  for ($i = 0; $i -lt $entries.Count; $i++) {
    $entry = $entries[$i]
    $entryBase = 2 + ($i * 9)
    $bytes[$entryBase] = [byte]$entry.Id
    [BitConverter]::GetBytes([uint32]$entry.Offset).CopyTo($bytes, $entryBase + 1)
    [BitConverter]::GetBytes([uint16]$entry.RawSize).CopyTo($bytes, $entryBase + 5)
    [BitConverter]::GetBytes([uint16]$entry.Comp.Length).CopyTo($bytes, $entryBase + 7)
    [Array]::Copy($entry.Comp, 0, $bytes, 2 + $tocBytes + $entry.Offset, $entry.Comp.Length)
  }
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function Write-SyntheticGeoDax([string]$Path, [byte]$BlockId = 34) {
  $compressed = [System.Collections.Generic.List[byte]]::new()
  $remaining = 1026
  while ($remaining -gt 0) {
    $chunk = [Math]::Min(128, $remaining)
    $compressed.Add([byte](256 - $chunk))
    $compressed.Add([byte]0)
    $remaining -= $chunk
  }

  [byte[]]$comp = $compressed.ToArray()
  [byte[]]$bytes = [byte[]]::new(11 + $comp.Length)
  $bytes[0] = 9
  $bytes[2] = $BlockId
  $bytes[7] = 0x02
  $bytes[8] = 0x04
  $bytes[9] = [byte]($comp.Length -band 0xFF)
  $bytes[10] = [byte](($comp.Length -shr 8) -band 0xFF)
  [Array]::Copy($comp, 0, $bytes, 11, $comp.Length)
  [IO.File]::WriteAllBytes($Path, $bytes)
}

function Write-SyntheticCombatEclDax([string]$Path, [byte]$BlockId = 34) {
  $ecl = [System.Collections.Generic.List[byte]]::new()
  1..22 | ForEach-Object { [void]$ecl.Add([byte]0) }
  $ecl.AddRange([byte[]]@(
    0x0B,0x00,0x09,0x00,0x02,0x00,0x05,
    0x0B,0x00,0x13,0x00,0x01,0x00,0x02,
    0x24
  ))
  Write-SyntheticDaxBlocks $Path @(@{ Id = $BlockId; Raw = $ecl.ToArray() })
}

function New-SyntheticCokMonRecord {
  param(
    [int]$Hp,
    [int]$Thac0,
    [int]$Ac,
    [int]$DamageCount,
    [int]$DamageSides,
    [int]$DamageBonus,
    [int]$Xp
  )

  [byte[]]$raw = [byte[]]::new(409)
  # 409-byte records are decoded as CoK by CCCOMBAT, which since a5823f0e reads
  # movement from rec+0xD5 (213) and clamps 0 to 1.  4 = the DEFAULT_MOVE_CELLS
  # these fixtures were pinned against; the '6 end' trace depends on it.
  $raw[213] = [byte]4
  $raw[98] = [byte]$Hp
  $raw[89] = [byte](60 - $Thac0)
  $raw[275] = [byte](60 - $Ac)
  $raw[269] = [byte]$DamageCount
  $raw[270] = [byte]$DamageBonus
  $raw[271] = [byte]$DamageSides
  [BitConverter]::GetBytes([uint16]$Xp).CopyTo($raw, 304)
  return $raw
}

function Write-SyntheticMonChaDax([string]$Path) {
  Write-SyntheticDaxBlocks $Path @(
    @{ Id = 9; Raw = (New-SyntheticCokMonRecord -Hp 4 -Thac0 21 -Ac 6 -DamageCount 1 -DamageSides 6 -DamageBonus 0 -Xp 10) },
    @{ Id = 19; Raw = (New-SyntheticCokMonRecord -Hp 18 -Thac0 15 -Ac 5 -DamageCount 1 -DamageSides 10 -DamageBonus 0 -Xp 90) }
  )
}

function New-Fixture {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string[]]$Files
  )

  $dir = Join-Path $run $Name
  New-Item -ItemType Directory -Force $dir | Out-Null
  foreach ($name in $Files) {
    $path = Join-Path $dir $name
    New-Item -ItemType Directory -Force (Split-Path -Parent $path) | Out-Null
    [IO.File]::WriteAllBytes($path, [byte[]]::new(0))
  }
  Write-SyntheticGeoDax (Join-Path $dir 'GEO1.DAX') 34
  Write-SyntheticCombatEclDax (Join-Path $dir 'ECL1.DAX') 34
  Write-SyntheticMonChaDax (Join-Path $dir 'MON1CHA.DAX')
  return $dir
}

function Assert-Contains([string[]]$Lines, [string]$Needle, [string]$Label) {
  if (-not ($Lines -contains $Needle)) {
    throw "$Label missing trace line: $Needle"
  }
}

function Assert-CombatRaw([string]$Path, [string]$Label) {
  $raw = [IO.File]::ReadAllBytes($Path)
  if ($raw.Length -ne (4 + (320 * 200) + 768) -or
      [BitConverter]::ToUInt16($raw, 0) -ne 320 -or
      [BitConverter]::ToUInt16($raw, 2) -ne 200) {
    throw "$Label did not write a valid 320x200 tactical RAW snapshot"
  }
  $seen = New-Object bool[] 256
  $nonzero = 0
  $colors = 0
  for ($i = 4; $i -lt (4 + (320 * 200)); $i++) {
    $px = $raw[$i]
    if ($px -ne 0) {
      $nonzero++
    }
    if (-not $seen[$px]) {
      $seen[$px] = $true
      $colors++
    }
  }
  if ($nonzero -lt 1000 -or $colors -lt 3) {
    throw "$Label wrote a blank or low-detail tactical RAW snapshot (nonzero=$nonzero colors=$colors)"
  }
}

function Assert-BroaderResult([string]$Label) {
  $effectPath = Join-Path $build '_GBECL.BIN'
  $dumpPath = Join-Path $build '_GBECL.TXT'
  $tracePath = Join-Path $build '_GBCOMB.TRC'
  $outPath = Join-Path $build '_GBCOMB.OUT'
  $rawPath = Join-Path $build '_GBCOMB.RAW'
  $resultPath = Join-Path $build '_GBCR.BIN'
  $partyPath = Join-Path $build '_GBPARTY.GBP'
  $seedPath = Join-Path $build '_GBSEED.BIN'
  $viewPath = Join-Path $build '_GBVIEW.RAW'
  $wallPath = Join-Path $build '_GBWALL.BIN'

  $effect = [IO.File]::ReadAllBytes($effectPath)
  if ($effect.Length -lt 46 -or
      [Text.Encoding]::ASCII.GetString($effect, 0, 4) -ne 'GBEF' -or
      [BitConverter]::ToUInt16($effect, 8) -ne 3 -or
      [BitConverter]::ToUInt16($effect, 32) -ne 2) {
    throw "$Label did not emit the expected two-group combat GBEF"
  }

  $dump = Get-Content $dumpPath -Raw
  foreach ($needle in @(
    'GBEC groups=0002',
    '@00 MONSTER id=0009 count=0002 pic=0005',
    '@01 MONSTER id=0013 count=0001 pic=0002'
  )) {
    if ($dump -notlike "*$needle*") {
      throw "$Label effect dump missing: $needle"
    }
  }

  $trace = @(Get-Content $tracePath | Where-Object { $_.Trim().Length -gt 0 })
  if ((New-SyntheticCokMonRecord -Hp 1 -Thac0 1 -Ac 1 -DamageCount 1 -DamageSides 1 -DamageBonus 0 -Xp 1)[213] -ne 4) {
    throw "$Label fixture monster movement byte (rec+213) is not 4"
  }
  Assert-Contains $trace '1 init p2 - - - - - - -' $Label
  Assert-Contains $trace '6 end - enemy - - - - - -' $Label

  if ((Get-Content $outPath -Raw).Trim() -ne 'enemy') {
    throw "$Label combat outcome was not enemy"
  }

  Assert-CombatRaw $rawPath $Label

  $result = [IO.File]::ReadAllBytes($resultPath)
  if ($result.Length -ne 34 -or
      [Text.Encoding]::ASCII.GetString($result, 0, 4) -ne 'GBCR' -or
      [BitConverter]::ToUInt16($result, 4) -ne 1 -or
      [BitConverter]::ToUInt16($result, 6) -ne 1 -or
      [BitConverter]::ToUInt16($result, 10) -ne 3) {
    throw "$Label did not write the expected three-member enemy-victory GBCR"
  }
  $expectedConditions = @(1, 1, 1)
  $expectedHp = @(0, 0, -3)
  $expectedMaxHp = @(8, 10, 4)
  for ($i = 0; $i -lt 3; $i++) {
    $record = 16 + ($i * 6)
    $condition = $result[$record + 1]
    $hp = [BitConverter]::ToInt16($result, $record + 2)
    $maxHp = [BitConverter]::ToInt16($result, $record + 4)
    if ($condition -ne $expectedConditions[$i] -or
        $hp -ne $expectedHp[$i] -or
        $maxHp -ne $expectedMaxHp[$i]) {
      throw "$Label wrote unexpected GBCR row ${i}: condition=$condition hp=$hp maxHp=$maxHp"
    }
  }

  foreach ($path in @($viewPath, $wallPath)) {
    if (Test-Path $path) {
      throw "$Label unexpectedly wrote $(Split-Path -Leaf $path) for a combat-only handoff"
    }
  }

  $party = [IO.File]::ReadAllBytes($partyPath)
  if ($party.Length -lt (16 + (3 * 410)) -or
      [Text.Encoding]::ASCII.GetString($party, 0, 4) -ne 'GBPR' -or
      [BitConverter]::ToUInt16($party, 6) -ne 3) {
    throw "$Label did not keep the native-created three-member GBPR"
  }

  $seed = [IO.File]::ReadAllBytes($seedPath)
  if ($seed.Length -lt 10 -or
      [Text.Encoding]::ASCII.GetString($seed, 0, 4) -ne 'GBPS' -or
      [BitConverter]::ToUInt16($seed, 8) -ne 3) {
    throw "$Label did not refresh GBPS from the native-created party"
  }
}

function Invoke-BroaderTitleCombat {
  param(
    [Parameter(Mandatory)][string]$Slug,
    [Parameter(Mandatory)][string]$Label,
    [Parameter(Mandatory)][string]$Dir,
    [Parameter(Mandatory)][string]$ExtraArgs
  )

  $conf = Join-Path $build "_gbbroader_${Slug}_flow_test.conf"
  $childOut = Join-Path $Dir 'GBEXEC.TXT'
  $defaultComb = Join-Path $Dir 'CCCOMB.TRC'
  Remove-Item (Join-Path $build '_GBECL.BIN'),
    (Join-Path $build '_GBECL.TXT'),
    (Join-Path $build '_GBCOMB.TRC'),
    (Join-Path $build '_GBCOMB.OUT'),
    (Join-Path $build '_GBCOMB.RAW'),
    (Join-Path $build '_GBCR.BIN'),
    (Join-Path $build '_GBVIEW.RAW'),
    (Join-Path $build '_GBWALL.BIN'),
    (Join-Path $build '_GBRES.BIN'),
    (Join-Path $build '_GBRES.TXT'),
    (Join-Path $build '_GBPARTY.GBP'),
    (Join-Path $build '_GBSEED.BIN'),
    $childOut,
    $defaultComb -Force -ErrorAction SilentlyContinue

  $realCgb = Join-Path $build 'CGB.BROADER.REAL'
  Copy-Item (Join-Path $build 'CGB.COM') $realCgb -Force
  Copy-Item (Join-Path $build 'GBMARK.COM') (Join-Path $build 'CGB.COM') -Force
  try {
@"
[sdl]
fullscreen=false
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
@echo off
mount C "$build"
mount D "$Dir"
D:
C:\GBBOOT /E /X /J$ExtraArgs > C:\GBBRD.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
    if (-not $p.WaitForExit(60000)) {
      try { Stop-Process -Id $p.Id -Force } catch {}
      throw "$Label timed out"
    }
  } finally {
    if (Test-Path $realCgb) {
      Copy-Item $realCgb (Join-Path $build 'CGB.COM') -Force
    }
  }

  if (-not (Test-Path $childOut)) {
    throw "$Label did not invoke the title helper"
  }
  $tail = ((Get-Content $childOut -Raw) -split "\r?\n" | Where-Object { $_ -like 'TAIL=*' } | Select-Object -First 1)
  if ($tail -ne 'TAIL= /A TITLE.DAX 1') {
    throw "$Label title helper tail expected 'TAIL= /A TITLE.DAX 1', got '$tail'"
  }
  if (Test-Path $defaultComb) {
    throw "$Label wrote combat trace into the game directory"
  }

  Assert-BroaderResult $Label
}

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null

$cases = @(
  @{ Slug = 'pool'; Label = 'Pool title/native-party combat'; Files = @('START.EXE', 'POOL.CFG', 'TITLE.DAX'); Extra = ' /B 34 /R POOL_CLERIC C /R POOL_FIGHTER F /R POOL_MAGE M' },
  @{ Slug = 'secret'; Label = 'Secret title/native-party combat'; Files = @('START.EXE', 'BLADES.CFG', 'TITLE.DAX'); Extra = ' /B 34 /R SEC_CLERIC C /R SEC_FIGHTER F /R SEC_MAGE M' },
  @{ Slug = 'gateway'; Label = 'Gateway title/native-party combat'; Files = @('GAME.EXE', 'GAME.CFG', 'ZOUNDS.DAX', 'TITLE.DAX'); Extra = ' /B 34 /R GATE_CLERIC C /R GATE_FIGHTER F /R GATE_MAGE M' },
  @{ Slug = 'treasures'; Label = 'Treasures title/native-party combat'; Files = @('GAME.EXE', 'TREASURE.CFG', 'ZOUNDS.DAX', 'TITLE.DAX'); Extra = ' /B 34 /R TREAS_CLERIC C /R TREAS_FIGHTER F /R TREAS_MAGE M' },
  @{ Slug = 'pod'; Label = 'Pools of Darkness title/native-party combat'; Files = @('GAME.EXE', 'GAME.OVR', 'POOL4.CFG', 'ZOUNDS.DAX', 'TITLE.DAX'); Extra = ' /B 34 /R POD_CLERIC C /R POD_FIGHTER F /R POD_MAGE M' },
  @{ Slug = 'buck'; Label = 'Buck Rogers Countdown title/native-party combat'; Files = @('BUCK1.EXE', 'BUCK2.EXE', 'BUCK3.EXE', 'TITLE.DAX'); Extra = ' /B 34 /R BUCK_CLERIC C /R BUCK_FIGHTER F /R BUCK_MAGE M' },
  @{ Slug = 'matrix'; Label = 'Buck Rogers Matrix title/native-party combat'; Files = @('START.EXE', 'MATRIX.CFG', 'BUCKA.XMI', 'BUCKB.XMI', 'BUCKC.XMI', 'TITLE.DAX'); Extra = ' /B 34 /R MAT_CLERIC C /R MAT_FIGHTER F /R MAT_MAGE M' }
)

foreach ($case in $cases) {
  $dir = New-Fixture -Name $case.Slug -Files $case.Files
  Invoke-BroaderTitleCombat $case.Slug $case.Label $dir $case.Extra
}

# Pool's real loader turns a far-pointer word into a file offset with its
# title-specific 0x6700 addend.  Make the default byte at 0x16 deliberately
# invalid and put EXIT at the header's vmRun1 target: the usual Gen1 0x7FFE
# base leaves the pointer out of range and therefore fails this exact probe.
$poolDir = Join-Path $run 'pool'
[byte[]]$poolVaddrBlock = [byte[]]::new(25)
$poolVaddrBlock[0] = 0x88
$poolVaddrBlock[1] = 0x13
$poolVaddrBlock[2] = 1
$poolVaddrBlock[3] = 1
$poolVaddrBlock[4] = 0x16 # 0x9916 = 0x98FE + file offset 0x18
$poolVaddrBlock[5] = 0x99
$poolVaddrBlock[22] = 0x41
$poolVaddrBlock[24] = 0x00
Write-SyntheticDaxBlocks (Join-Path $poolDir 'ECL1.DAX') @(@{ Id = 34; Raw = $poolVaddrBlock })

$poolVaddrConf = Join-Path $build '_gbpool_vaddr.conf'
$poolVaddrTrace = Join-Path $build 'POOLV.TRC'
Remove-Item $poolVaddrTrace, (Join-Path $build 'CCECL.TRC') -Force -ErrorAction SilentlyContinue
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$poolDir"
C:
C:\CCECL D:\ECL1.DAX 34 /Q 0 /T > C:\POOLV.TXT
COPY C:\CCECL.TRC C:\POOLV.TRC > NUL
exit
"@ | Set-Content $poolVaddrConf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $poolVaddrConf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'Pool vaddr regression probe timed out'
}
if (-not (Test-Path $poolVaddrTrace) -or (Get-Content $poolVaddrTrace -Raw).Trim() -ne 'PC=0018 OP=00') {
  throw 'Pool vmRun1 far pointer did not resolve with the retail 0x6700 loader addend'
}

Write-Output 'RESULT: GBBOOT broader Pool/Secret/Gateway/Treasures/POD/Buck/Matrix title-native-party combat flows PASS'
