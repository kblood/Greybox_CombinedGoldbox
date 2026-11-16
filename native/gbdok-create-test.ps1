# GBBOOT deterministic native DoK party creation smoke.
#
# Runs the real native /E front door against a temporary DoK data fixture with
# no SAVE directory. Repeated /R name class requests drive CCPARTY /G /C through
# GBBOOT, then the boot chain must refresh compact GBPS movement rows from the
# created GBD1 tails, persist the GBPR, and continue through a bounded step.
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'Death Knights of Krynn'
$run = Join-Path $build 'gbdok-create-test'
$dbx = Join-Path $root 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT DoK create flow (DOSBox.exe absent)'
  exit 0
}

if (-not (Test-Path -LiteralPath $dbx)) {
  Write-Output 'SKIP: GBBOOT DoK create flow (DOSBox-X absent)'
  exit 0
}

function Get-I16LE([byte[]]$Bytes, [int]$Offset) {
  return [BitConverter]::ToInt16($Bytes, $Offset)
}

function Set-Session([int]$x, [int]$y, [int]$facing) {
  $s = New-Object byte[] 16
  [Text.Encoding]::ASCII.GetBytes('GBSN').CopyTo($s, 0)
  [BitConverter]::GetBytes([uint16]1).CopyTo($s, 4)
  [BitConverter]::GetBytes([uint16]$x).CopyTo($s, 6)
  [BitConverter]::GetBytes([uint16]$y).CopyTo($s, 8)
  [BitConverter]::GetBytes([uint16]$facing).CopyTo($s, 10)
  [BitConverter]::GetBytes([uint16]16).CopyTo($s, 12)
  [BitConverter]::GetBytes([uint16]16).CopyTo($s, 14)
  [IO.File]::WriteAllBytes((Join-Path $build '_GBSESS.GBS'), $s)
}

foreach ($name in @('DKK.CFG', 'ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX')) {
  if (-not (Test-Path (Join-Path $game $name))) {
    Write-Output "SKIP: GBBOOT DoK create flow ($name absent)"
    exit 0
  }
}

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null

foreach ($name in @('DKK.CFG', 'ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX')) {
  Copy-Item (Join-Path $game $name) (Join-Path $run $name) -Force
}

Remove-Item (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build 'DOKCREATE.TXT') -Force -ErrorAction SilentlyContinue

Invoke-DokGameLinkAckFlow -DbxExe $dbx -BuildDir $build -GameDir $run `
  -GuestCommand 'C:\GBBOOT /E /X /R DOK_CLERIC C /R DOK_KNIGHT K /R DOK_MAGE M /R DOK_THIEF T > C:\DOKCREATE.TXT' `
  -DosLogFile (Join-Path $build 'gbdok-create-dosbox-files.log') `
  -CaptureRoot (Join-Path $build 'gbdok-create-gamelink') -TimeoutSeconds 45

$gbprPath = Join-Path $build '_GBPARTY.GBP'
if (-not (Test-Path $gbprPath)) { throw 'GBBOOT DoK /R did not create _GBPARTY.GBP' }
$gbpr = [IO.File]::ReadAllBytes($gbprPath)
if ($gbpr.Length -ne 1656 -or
    [Text.Encoding]::ASCII.GetString($gbpr, 0, 4) -ne 'GBPR' -or
    [BitConverter]::ToUInt16($gbpr, 4) -ne 2 -or
    [BitConverter]::ToUInt16($gbpr, 6) -ne 4 -or
    [BitConverter]::ToUInt16($gbpr, 8) -ne 410 -or
    [BitConverter]::ToUInt16($gbpr, 10) -ne 1 -or
    [BitConverter]::ToUInt16($gbpr, 12) -ne 2 -or
    [BitConverter]::ToUInt16($gbpr, 14) -ne 1) {
  throw 'GBBOOT DoK /R created an invalid compact GBPR header'
}

$expected = @(
  @{ Slot = 0x80; Name = 'DOK_CLERIC'; ClassByte = 1; MetaClass = 2 },
  @{ Slot = 0x81; Name = 'DOK_KNIGHT'; ClassByte = 6; MetaClass = 1 },
  @{ Slot = 0x82; Name = 'DOK_MAGE'; ClassByte = 2; MetaClass = 3 },
  @{ Slot = 0x83; Name = 'DOK_THIEF'; ClassByte = 6; MetaClass = 4 }
)
for ($i = 0; $i -lt $expected.Count; $i++) {
  $off = 16 + $i * 410
  if ($gbpr[$off] -ne $expected[$i].Slot) {
    throw "GBBOOT DoK /R created the wrong native slot at entry $i"
  }
  $record = $off + 1
  $name = [Text.Encoding]::ASCII.GetString($gbpr, $record + 1, $gbpr[$record])
  if ($name -ne $expected[$i].Name -or $gbpr[$record + 32] -ne $expected[$i].ClassByte) {
    throw "GBBOOT DoK /R created the wrong compact character at entry $i"
  }
  $meta = $record + 216
  if ([Text.Encoding]::ASCII.GetString($gbpr, $meta, 4) -ne 'GBD1' -or
      [BitConverter]::ToUInt16($gbpr, $meta + 4) -ne 1 -or
      (Get-I16LE $gbpr ($meta + 6)) -le 0 -or
      [BitConverter]::ToUInt16($gbpr, $meta + 10) -ne 1 -or
      [BitConverter]::ToUInt16($gbpr, $meta + 12) -ne 2 -or
      [BitConverter]::ToUInt16($gbpr, $meta + 16) -le 0 -or
      $gbpr[$meta + 18] -ne $expected[$i].MetaClass -or
      [BitConverter]::ToUInt16($gbpr, $meta + 22) -ne 4 -or
      [BitConverter]::ToUInt16($gbpr, $meta + 26) -le 0) {
    throw "GBBOOT DoK /R created invalid GBD1 metadata at entry $i"
  }
  for ($j = 244; $j -lt 409; $j++) {
    if ($gbpr[$record + $j] -ne 0) {
      throw "GBBOOT DoK /R tail padding byte was nonzero at entry $i offset $j"
    }
  }
}

$seedPath = Join-Path $build '_GBSEED.BIN'
if (-not (Test-Path $seedPath)) { throw 'GBBOOT DoK /R did not create _GBSEED.BIN' }
$seed = [IO.File]::ReadAllBytes($seedPath)
if ([Text.Encoding]::ASCII.GetString($seed, 0, 4) -ne 'GBPS' -or
    [BitConverter]::ToUInt16($seed, 4) -ne 2 -or
    ([BitConverter]::ToUInt16($seed, 6) -band 1) -eq 0 -or
    [BitConverter]::ToUInt16($seed, 8) -ne 4 -or
    $seed[17] -ne 4 -or
    $seed[150] -ne 1) {
  throw 'GBBOOT DoK /R did not refresh GBPS from the created compact roster'
}
for ($i = 0; $i -lt 4; $i++) {
  $move = [BitConverter]::ToUInt16($seed, 70 + ($i * 2))
  if ($move -ne 4) {
    throw "GBBOOT DoK /R GBPS movement mismatch at entry $i"
  }
}
$thiefRows = @(
  @(30,25,20,15,10,10,85,0),
  @(35,29,25,21,15,10,86,0),
  @(40,33,30,27,20,15,87,0),
  @(45,37,35,33,25,15,88,20),
  @(50,42,40,40,31,20,90,25),
  @(55,47,45,37,20,92,30,60),
  @(52,50,55,43,25,94,35,65),
  @(57,55,62,49,25,96,40,70),
  @(62,60,70,56,30,98,45,80),
  @(67,65,78,63,30,99,50,90),
  @(72,70,86,70,35,99,60,100),
  @(100,77,75,94,77,35,99,65)
)
$thiefLevel = [Math]::Max(1, [Math]::Min(12, [BitConverter]::ToUInt16($gbpr, 16 + (3 * 410) + 1 + 216 + 16)))
$expectedThief = $thiefRows[$thiefLevel - 1]
for ($i = 0; $i -lt 8; $i++) {
  if ($seed[152 + $i] -ne $expectedThief[$i]) {
    throw "GBBOOT DoK /R GBPS thief matrix byte $i expected $($expectedThief[$i]), got $($seed[152 + $i])"
  }
}

$raw = [IO.File]::ReadAllBytes((Join-Path $build '_GBVIEW.RAW'))
if ([BitConverter]::ToUInt16($raw, 0) -ne 320 -or [BitConverter]::ToUInt16($raw, 2) -ne 200) {
  throw 'GBBOOT DoK /R did not continue to a 320x200 native snapshot'
}

$beforeStep = [byte[]]$gbpr.Clone()
Set-Session 0 0 2
Remove-Item (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build 'DOKSTEP.TXT') -Force -ErrorAction SilentlyContinue

Invoke-DokGameLinkAckFlow -DbxExe $dbx -BuildDir $build -GameDir $run `
  -GuestCommand 'C:\GBBOOT /E /T 1 > C:\DOKSTEP.TXT' `
  -DosLogFile (Join-Path $build 'gbdok-create-step-dosbox-files.log') `
  -CaptureRoot (Join-Path $build 'gbdok-create-gamelink') -TimeoutSeconds 45

$afterStep = [IO.File]::ReadAllBytes($gbprPath)
if (-not [Linq.Enumerable]::SequenceEqual([byte[]]$beforeStep, [byte[]]$afterStep)) {
  throw 'GBBOOT did not preserve the native-created DoK GBPR across the step launch'
}

$session = [IO.File]::ReadAllBytes((Join-Path $build '_GBSESS.GBS'))
$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
$effect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
$seed = [IO.File]::ReadAllBytes($seedPath)
if ([BitConverter]::ToUInt16($session, 6) -ne 1 -or
    [BitConverter]::ToUInt16($session, 8) -ne 0 -or
    [BitConverter]::ToUInt16($session, 10) -ne 2 -or
    [BitConverter]::ToUInt16($step, 6) -ne 142 -or
    [BitConverter]::ToUInt16($seed, 4) -ne 2 -or
    [BitConverter]::ToUInt16($seed, 8) -ne 4 -or
    $seed[17] -ne 4 -or
    $seed[150] -ne 1 -or
    $effect -notlike '*status=0000*' -or
    $effect -like '*GBHD reason=0001*' -or
    $effect -notlike "*'GET OUT!' SAYS A FRIGHTENED CIT*") {
  throw 'GBBOOT persisted DoK /R roster did not continue into persistent exploration'
}

# run-flow-suite's bootstrap propagates a stale native child status even after
# every protocol and artifact assertion here passed. Make the script verdict
# explicit once the verified flow is complete.
$global:LASTEXITCODE = 0
Write-Output 'RESULT: GBBOOT DoK /E repeated /R native compact create, reload, and bounded step flow PASS'
