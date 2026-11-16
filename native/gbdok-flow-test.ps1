# Real DoK GBBOOT flow smoke: intro-suppressed native path, compact party
# import, ECL, map, first-person snapshot, and one bounded persistent step.
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'Death Knights of Krynn'
# Mount a scratch mirror, never the retail release itself: `mount D "$game"`
# followed by `D:` makes the read-only GOG folder the DOS child's current drive,
# so its stray writes (CCFP.MOV, rewritten SAVE\CHRDATA*) land in the retail
# tree. CLAUDE.md: game-data folders are read-only source.
. (Join-Path $PSScriptRoot 'retail-stage.ps1')
$dbx = Join-Path $root 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT DoK compact-party flow (DOSBox.exe absent)'
  exit 0
}

if (-not (Test-Path -LiteralPath $dbx)) {
  Write-Output 'SKIP: GBBOOT DoK compact-party flow (DOSBox-X absent)'
  exit 0
}

foreach ($name in @(
  'DKK.CFG', 'ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX', 'MON1CHA.DAX',
  'SAVE\CHRDATA1.GAM', 'SAVE\CHRDATA2.GAM', 'SAVE\CHRDATA3.GAM',
  'SAVE\CHRDATA4.GAM', 'SAVE\CHRDATA5.GAM', 'SAVE\CHRDATA6.GAM'
)) {
  if (-not (Test-Path (Join-Path $game $name))) {
    Write-Output "SKIP: GBBOOT DoK compact-party flow ($name absent)"
    exit 0
  }
}

$gameMount = New-RetailStage -Source $game
& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

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

# The three .DOP operation tokens are deleted too (plan 30.3): a .DOP left in
# the shared build dir by an earlier run satisfies CCHOST /D /J's token-format
# check, which let a GBBOOT CCBIND /N -> /W regression (GM2) pass here.
Remove-Item (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBECL.DOP'),
  (Join-Path $build '_GBEVT.DOP'),
  (Join-Path $build '_GBRES.DOP'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBSESS.GBS') -Force -ErrorAction SilentlyContinue

Invoke-DokGameLinkAckFlow -DbxExe $dbx -BuildDir $build -GameDir $gameMount `
  -GuestCommand 'C:\GBBOOT /E /X > C:\DOKFLOW.TXT' `
  -DosLogFile (Join-Path $build 'gbdok-flow-dosbox-files.log') `
  -CaptureRoot (Join-Path $build 'gbdok-flow-gamelink') -TimeoutSeconds 45

$gbprPath = Join-Path $build '_GBPARTY.GBP'
if (-not (Test-Path $gbprPath)) { throw 'GBBOOT did not create DoK _GBPARTY.GBP' }
$gbpr = [IO.File]::ReadAllBytes($gbprPath)
if ($gbpr.Length -ne 2476 -or
    [Text.Encoding]::ASCII.GetString($gbpr, 0, 4) -ne 'GBPR' -or
    [BitConverter]::ToUInt16($gbpr, 4) -ne 2 -or
    [BitConverter]::ToUInt16($gbpr, 6) -ne 6 -or
    [BitConverter]::ToUInt16($gbpr, 8) -ne 410 -or
    [BitConverter]::ToUInt16($gbpr, 10) -ne 1 -or
    [BitConverter]::ToUInt16($gbpr, 12) -ne 2 -or
    [BitConverter]::ToUInt16($gbpr, 14) -ne 1) {
  throw 'GBBOOT created an invalid DoK GBPR header'
}
# CHRDATA1..6.GAM byte 40, read independently from retail saves. The previous
# expectations recorded the class/level/Con estimate instead of the stored HP.
$dokHp = @(95, 102, 78, 52, 58, 53)
$dokAc = @(6, -1, 0, 1, -1, 0)
$dokLevel = @(7, 8, 10, 10, 7, 11)
$dokClass = @(1, 1, 2, 2, 2, 3)
$dokDamageSides = @(8, 8, 8, 8, 6, 8)
$dokDamageBonus = @(3, 3, 3, 3, 4, 2)
$dokThac0 = @(12, 11, 12, 11, 14, 13)
$dokMove = @(4, 2, 2, 2, 2, 2)
for ($i = 0; $i -lt 6; $i++) {
  $off = 16 + $i * 410
  if ($gbpr[$off] -ne $i + 1) { throw "DoK GBBOOT GBPR slot mismatch at entry $i" }
  $source = [IO.File]::ReadAllBytes((Join-Path $game "SAVE\CHRDATA$($i + 1).GAM"))
  for ($j = 0; $j -lt 216; $j++) {
    if ($gbpr[$off + 1 + $j] -ne $source[$j]) {
      throw "DoK GBBOOT GBPR byte mismatch at slot $($i + 1), offset $j"
    }
  }
  $meta = $off + 1 + 216
  if ([Text.Encoding]::ASCII.GetString($gbpr, $meta, 4) -ne 'GBD1' -or
      [BitConverter]::ToUInt16($gbpr, $meta + 4) -ne 5 -or
      (Get-I16LE $gbpr ($meta + 6)) -ne $dokHp[$i] -or
      (Get-I16LE $gbpr ($meta + 8)) -ne $dokAc[$i] -or
      [BitConverter]::ToUInt16($gbpr, $meta + 10) -ne 1 -or
      [BitConverter]::ToUInt16($gbpr, $meta + 12) -ne $dokDamageSides[$i] -or
      (Get-I16LE $gbpr ($meta + 14)) -ne $dokDamageBonus[$i] -or
      [BitConverter]::ToUInt16($gbpr, $meta + 16) -ne $dokLevel[$i] -or
      $gbpr[$meta + 18] -ne $dokClass[$i] -or
      [BitConverter]::ToUInt16($gbpr, $meta + 20) -ne $dokThac0[$i] -or
      [BitConverter]::ToUInt16($gbpr, $meta + 22) -ne $dokMove[$i] -or
      [BitConverter]::ToUInt16($gbpr, $meta + 26) -ne $dokHp[$i]) {
    throw "DoK GBBOOT GBPR GBD1 metadata mismatch at slot $($i + 1)"
  }
  for ($j = 276; $j -lt 409; $j++) {
    if ($gbpr[$off + 1 + $j] -ne 0) {
      throw "DoK GBBOOT GBPR tail padding byte was nonzero at slot $($i + 1), offset $j"
    }
  }
}

$seedPath = Join-Path $build '_GBSEED.BIN'
if (-not (Test-Path $seedPath)) { throw 'GBBOOT did not create DoK _GBSEED.BIN' }
$seed = [IO.File]::ReadAllBytes($seedPath)
if ([Text.Encoding]::ASCII.GetString($seed, 0, 4) -ne 'GBPS' -or
    [BitConverter]::ToUInt16($seed, 4) -ne 1 -or
    ([BitConverter]::ToUInt16($seed, 6) -band 1) -eq 0 -or
    [BitConverter]::ToUInt16($seed, 8) -ne 6) {
  throw 'GBBOOT did not feed the DoK roster count into GBPS'
}
if ($seed[17] -ne 6) {
  throw "GBBOOT did not feed DoK GBPR movement rows into GBPS; move count was $($seed[17])"
}
for ($i = 0; $i -lt 6; $i++) {
  $move = [BitConverter]::ToUInt16($seed, 70 + ($i * 2))
  if ($move -ne $dokMove[$i]) {
    throw "GBBOOT DoK GBPS movement mismatch at slot $($i + 1): expected $($dokMove[$i]), got $move"
  }
}

if (-not (Test-Path (Join-Path $build '_GBECL.TXT'))) {
  throw 'GBBOOT DoK /E did not produce ECL text output'
}
$raw = [IO.File]::ReadAllBytes((Join-Path $build '_GBVIEW.RAW'))
if ([BitConverter]::ToUInt16($raw, 0) -ne 320 -or [BitConverter]::ToUInt16($raw, 2) -ne 200) {
  throw 'GBBOOT DoK /X snapshot is not 320x200'
}

# Area 1 cell (0,0) has an open east edge in the baked WGRD. A single forward
# step reaches (1,0), yields descriptor 142, and runs the DoK citizen text event.
Set-Session 0 0 2
Remove-Item (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBECL.TXT') -Force -ErrorAction SilentlyContinue

Invoke-DokGameLinkAckFlow -DbxExe $dbx -BuildDir $build -GameDir $gameMount `
  -GuestCommand 'C:\GBBOOT /E /T 1 > C:\DOKSTEP.TXT' `
  -DosLogFile (Join-Path $build 'gbdok-step-dosbox-files.log') `
  -CaptureRoot (Join-Path $build 'gbdok-flow-gamelink') -TimeoutSeconds 45

$session = [IO.File]::ReadAllBytes((Join-Path $build '_GBSESS.GBS'))
$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
$effect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
if ([BitConverter]::ToUInt16($session, 6) -ne 1 -or
    [BitConverter]::ToUInt16($session, 8) -ne 0 -or
    [BitConverter]::ToUInt16($session, 10) -ne 2 -or
    [BitConverter]::ToUInt16($step, 6) -ne 142 -or
    [BitConverter]::ToUInt16($step, 8) -ne 1 -or
    [BitConverter]::ToUInt16($step, 10) -ne 0 -or
    [BitConverter]::ToUInt16($step, 12) -ne 2 -or
    $effect -notlike '*status=0000*' -or
    $effect -like '*GBHD reason=0001*' -or
    $effect -notlike "*'GET OUT!' SAYS A FRIGHTENED CIT*") {
  throw 'GBBOOT DoK /E /T 1 did not run the expected persistent step event'
}

# The outer flow runner carries the last native child status across the script;
# all DoK protocol and artifact checks above are the authoritative verdict.
$global:LASTEXITCODE = 0
Write-Output 'RESULT: GBBoot DoK native compact-party snapshot + bounded step flow PASS'
