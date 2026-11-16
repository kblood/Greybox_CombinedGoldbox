# GBBOOT DoK headless title-to-gameplay flow.
#
# This combines the current verified DoK pieces into one playable front-door
# proof: title/music, four-member native compact party creation (including a
# thief-derived GBPS v2 matrix row), GBPS refresh, persisted first-person
# session, a real ECL1#17 DOS-BIGPIC fallback scene, the original opening's
# pre-combat picture prefix, one bounded SearchLocation
# step, a separate empty-combat
# yield/resume route, the retail Cekos/Sivak street encounter reached by a
# real GEO step, a seeded secondary tactical handoff that imports the created
# party into CCCOMBAT and writes GBCR state back into GBPR, and a final
# post-combat relaunch into clean exploration.
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'Death Knights of Krynn'
$amiga = Join-Path $root 'amiga_extracted\DeathKnightsOfKrynn\disk1'
$amigaFiles = @('8x8d1.daa', 'CPIC1.daa')
if (@($amigaFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $amiga $_)) }).Count) {
  $heldAmiga = 'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\DeathKnightsOfKrynn\data'
  if (-not @($amigaFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $heldAmiga $_)) }).Count) {
    $amiga = $heldAmiga
  }
}
$run = Join-Path $build 'gbdok-playable-flow-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
$dbx = Join-Path $root 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT DoK playable flow (DOSBox.exe absent)'
  exit 0
}

if (-not (Test-Path -LiteralPath $dbx)) {
  Write-Output 'SKIP: GBBOOT DoK playable flow (DOSBox-X absent)'
  exit 0
}

function Get-I16LE([byte[]]$Bytes, [int]$Offset) {
  return [BitConverter]::ToInt16($Bytes, $Offset)
}

function Assert-RawFrame([string]$Path, [string]$Context, [int]$MinColors = 3) {
  $raw = [IO.File]::ReadAllBytes($Path)
  if ($raw.Length -ne (4 + (320 * 200) + 768) -or
      [BitConverter]::ToUInt16($raw, 0) -ne 320 -or
      [BitConverter]::ToUInt16($raw, 2) -ne 200) {
    throw "$Context did not write a valid 320x200 RAW snapshot"
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
  if ($nonzero -lt 1000 -or $colors -lt $MinColors) {
    throw "$Context wrote a blank or low-detail RAW snapshot (nonzero=$nonzero colors=$colors)"
  }
}

function Assert-SceneInFrame([string]$ScenePath, [string]$FramePath, [string]$Context) {
  $scene = [IO.File]::ReadAllBytes($ScenePath)
  $raw = [IO.File]::ReadAllBytes($FramePath)
  if ($scene.Length -lt 782 -or [Text.Encoding]::ASCII.GetString($scene, 0, 4) -ne 'GBIM' -or
      $raw.Length -ne (4 + (320 * 200) + 768)) {
    throw "$Context has an invalid scene or framebuffer artifact"
  }
  $width = [BitConverter]::ToUInt16($scene, 10)
  $height = [BitConverter]::ToUInt16($scene, 12)
  if ($scene.Length -ne (14 + ($width * $height) + 768) -or $width -gt 304 -or $height -gt 168) {
    throw "$Context has an invalid scene geometry"
  }
  for ($y = 0; $y -lt $height; $y++) {
    for ($x = 0; $x -lt $width; $x++) {
      if ($raw[4 + (($y + 8) * 320) + $x + 8] -ne $scene[14 + ($y * $width) + $x]) {
        throw "$Context did not blit the logical scene pixels at ($x,$y)"
      }
    }
  }
}

function Assert-SceneAt([string]$ScenePath, [string]$FramePath, [string]$Context, [int]$Left, [int]$Top) {
  $scene = [IO.File]::ReadAllBytes($ScenePath)
  $raw = [IO.File]::ReadAllBytes($FramePath)
  if ($scene.Length -lt 782 -or [Text.Encoding]::ASCII.GetString($scene, 0, 4) -ne 'GBIM' -or
      $raw.Length -ne (4 + (320 * 200) + 768)) {
    throw "$Context has an invalid scene or framebuffer artifact"
  }
  $width = [BitConverter]::ToUInt16($scene, 10)
  $height = [BitConverter]::ToUInt16($scene, 12)
  if ($scene.Length -ne (14 + ($width * $height) + 768) -or $Left -lt 0 -or $Top -lt 0 -or
      ($Left + $width) -gt 320 -or ($Top + $height) -gt 200) {
    throw "$Context has invalid scene placement geometry"
  }
  for ($y = 0; $y -lt $height; $y++) {
    for ($x = 0; $x -lt $width; $x++) {
      if ($raw[4 + (($y + $Top) * 320) + $x + $Left] -ne $scene[14 + ($y * $width) + $x]) {
        throw "$Context did not blit the logical scene pixels at ($x,$y)"
      }
    }
  }
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

foreach ($name in @(
  'DKK.CFG',
  'TITLE.DAX',
  'BIGPIC1.DAX',
  'PIC2.DAX',
  'PIC5.DAX',
  'ECL1.DAX',
  'ECL2.DAX',
  'ECL3.DAX',
  'GEO1.DAX',
  'GEO2.DAX',
  'GEO3.DAX',
  'WALLDEF1.DAX',
  'WALLDEF2.DAX',
  'WALLDEF3.DAX',
  '8X8D1.DAX',
  '8X8D2.DAX',
  '8X8D3.DAX'
)) {
  if (-not (Test-Path (Join-Path $game $name))) {
    Write-Output "SKIP: GBBOOT DoK playable flow ($name absent)"
    exit 0
  }
}
foreach ($name in $amigaFiles) {
  if (-not (Test-Path (Join-Path $amiga $name))) {
    Write-Output "SKIP: GBBOOT DoK playable Amiga-art flow ($name absent)"
    exit 0
  }
}

Write-Output "DoK Amiga playable source (copied to scratch): $amiga"
& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null

foreach ($name in @(
  'DKK.CFG',
  'TITLE.DAX',
  'BIGPIC1.DAX',
  'PIC2.DAX',
  'PIC5.DAX',
  'ECL1.DAX',
  'ECL2.DAX',
  'ECL3.DAX',
  'GEO1.DAX',
  'GEO2.DAX',
  'GEO3.DAX',
  'WALLDEF1.DAX',
  'WALLDEF2.DAX',
  'WALLDEF3.DAX',
  '8X8D1.DAX',
  '8X8D2.DAX',
  '8X8D3.DAX'
)) {
  Copy-Item (Join-Path $game $name) (Join-Path $run $name) -Force
}
Copy-Item (Join-Path $amiga '8x8d1.daa') (Join-Path $run '8X8D1.DAA') -Force
Copy-Item (Join-Path $amiga 'CPIC1.daa') (Join-Path $run 'CPIC1.DAA') -Force

Remove-Item (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBSESS.GBS'),
  (Join-Path $build 'DOKPLAY.TXT') -Force -ErrorAction SilentlyContinue

# Area 1 cell (0,0) faces east into descriptor 142, the same verified DoK
# citizen text event used by the lower-level DoK flow tests.
Set-Session 0 0 2
Invoke-DokGameLinkAckFlow -DbxExe $dbx -BuildDir $build -GameDir $run `
  -GuestCommand 'C:\GBBOOT /E /J /T 1 /R PLAY_CLERIC C /R PLAY_KNIGHT K /R PLAY_MAGE M /R PLAY_THIEF T > C:\DOKPLAY.TXT' `
  -DosLogFile (Join-Path $build 'gbdok-playable-dosbox-files.log') `
  -CaptureRoot (Join-Path $build 'gbdok-playable-gamelink') -TimeoutSeconds 60

$out = Get-Content (Join-Path $build 'DOKPLAY.TXT') -Raw
if ($out -notlike '*game:   Death Knights of Krynn*' -or
    $out -notlike '*native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX*' -or
    [regex]::Matches($out, 'CCGB: bounded DAX frame displayed').Count -ne 3 -or
    $out -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT DoK playable flow did not enter the expected native front door'
}
$dokMusic = Join-Path $build 'DOKTITLE.GBM'
if ((Test-Path $dokMusic) -and $out -notlike '*GBM1 PC-speaker sequence advanced*') {
  throw 'GBBOOT DoK playable flow did not drive DOKTITLE.GBM through CGB'
}

$gbprPath = Join-Path $build '_GBPARTY.GBP'
if (-not (Test-Path $gbprPath)) { throw 'GBBOOT DoK playable flow did not create _GBPARTY.GBP' }
$gbpr = [IO.File]::ReadAllBytes($gbprPath)
if ($gbpr.Length -ne 1656 -or
    [Text.Encoding]::ASCII.GetString($gbpr, 0, 4) -ne 'GBPR' -or
    [BitConverter]::ToUInt16($gbpr, 4) -ne 2 -or
    [BitConverter]::ToUInt16($gbpr, 6) -ne 4 -or
    [BitConverter]::ToUInt16($gbpr, 8) -ne 410 -or
    [BitConverter]::ToUInt16($gbpr, 10) -ne 1 -or
    [BitConverter]::ToUInt16($gbpr, 12) -ne 2 -or
    [BitConverter]::ToUInt16($gbpr, 14) -ne 1) {
  throw 'GBBOOT DoK playable flow created an invalid compact GBPR header'
}

$expected = @(
  @{ Slot = 0x80; Name = 'PLAY_CLERIC'; ClassByte = 1; MetaClass = 2 },
  @{ Slot = 0x81; Name = 'PLAY_KNIGHT'; ClassByte = 6; MetaClass = 1 },
  @{ Slot = 0x82; Name = 'PLAY_MAGE'; ClassByte = 2; MetaClass = 3 },
  @{ Slot = 0x83; Name = 'PLAY_THIEF'; ClassByte = 6; MetaClass = 4 }
)
for ($i = 0; $i -lt $expected.Count; $i++) {
  $off = 16 + $i * 410
  if ($gbpr[$off] -ne $expected[$i].Slot) {
    throw "GBBOOT DoK playable flow created the wrong native slot at entry $i"
  }
  $record = $off + 1
  $name = [Text.Encoding]::ASCII.GetString($gbpr, $record + 1, $gbpr[$record])
  if ($name -ne $expected[$i].Name -or $gbpr[$record + 32] -ne $expected[$i].ClassByte) {
    throw "GBBOOT DoK playable flow created the wrong compact character at entry $i"
  }
  $meta = $record + 216
  if ([Text.Encoding]::ASCII.GetString($gbpr, $meta, 4) -ne 'GBD1' -or
      [BitConverter]::ToUInt16($gbpr, $meta + 4) -ne 1 -or
      (Get-I16LE $gbpr ($meta + 6)) -le 0 -or
      [BitConverter]::ToUInt16($gbpr, $meta + 10) -ne 1 -or
      [BitConverter]::ToUInt16($gbpr, $meta + 12) -ne 2 -or
      [BitConverter]::ToUInt16($gbpr, $meta + 16) -le 0 -or
      $gbpr[$meta + 18] -ne $expected[$i].MetaClass -or
      [BitConverter]::ToUInt16($gbpr, $meta + 22) -ne 4) {
    throw "GBBOOT DoK playable flow created invalid GBD1 metadata at entry $i"
  }
}

$seedPath = Join-Path $build '_GBSEED.BIN'
if (-not (Test-Path $seedPath)) { throw 'GBBOOT DoK playable flow did not create _GBSEED.BIN' }
$seed = [IO.File]::ReadAllBytes($seedPath)
if ([Text.Encoding]::ASCII.GetString($seed, 0, 4) -ne 'GBPS' -or
    [BitConverter]::ToUInt16($seed, 4) -ne 2 -or
    ([BitConverter]::ToUInt16($seed, 6) -band 1) -eq 0 -or
    [BitConverter]::ToUInt16($seed, 8) -ne 4 -or
    $seed[17] -ne 4 -or
    $seed[150] -ne 1) {
  throw 'GBBOOT DoK playable flow did not refresh GBPS from the created compact roster'
}
for ($i = 0; $i -lt 4; $i++) {
  $move = [BitConverter]::ToUInt16($seed, 70 + ($i * 2))
  if ($move -ne 4) {
    throw "GBBOOT DoK playable flow GBPS movement mismatch at entry $i"
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
    throw "GBBOOT DoK playable flow GBPS thief matrix byte $i expected $($expectedThief[$i]), got $($seed[152 + $i])"
  }
}

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
  throw 'GBBOOT DoK playable flow did not continue from title/create into persistent exploration'
}

Remove-Item (Join-Path $build '_GBAMIGA.GBT'),
  (Join-Path $build '_GBAMIG2.GBT'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build 'DOKAMI-DOS.RAW'),
  (Join-Path $build 'DOKDOS.TXT'),
  (Join-Path $build 'DOKAMI.TXT') -Force -ErrorAction SilentlyContinue

Invoke-DokGameLinkAckFlow -DbxExe $dbx -BuildDir $build -GameDir $run `
  -GuestCommand 'C:\GBBOOT /E /X /G 1 /A 1 /B 34 > C:\DOKDOS.TXT' `
  -DosLogFile (Join-Path $build 'gbdok-playable-dos-art-files.log') `
  -CaptureRoot (Join-Path $build 'gbdok-playable-gamelink') -TimeoutSeconds 60
Assert-RawFrame (Join-Path $build '_GBVIEW.RAW') 'GBBOOT DoK playable DOS wall-art baseline'
Copy-Item (Join-Path $build '_GBVIEW.RAW') (Join-Path $build 'DOKAMI-DOS.RAW') -Force

# DoK ships a distinct 5-plane Amiga 8X8D archive.  The native bridge must
# consume that original source, produce GBTS resources, and hand them to CCFP
# rather than merely reporting an Amiga request with a DOS fallback.
Invoke-DokGameLinkAckFlow -DbxExe $dbx -BuildDir $build -GameDir $run `
  -GuestCommand 'C:\GBBOOT /E /X /G 2 /A 1 /B 34 > C:\DOKAMI.TXT' `
  -DosLogFile (Join-Path $build 'gbdok-playable-amiga-art-files.log') `
  -CaptureRoot (Join-Path $build 'gbdok-playable-gamelink') -TimeoutSeconds 60
$amigaOut = Get-Content (Join-Path $build 'DOKAMI.TXT') -Raw
if ($amigaOut -notlike '*graphics: Amiga -> Amiga (native resource bridge with DOS fallback)*' -or
    $amigaOut -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT DoK playable Amiga wall-art flow did not activate the original Amiga resource bridge'
}
foreach ($expected in @(
  # DoK uses a wide-frame DAA TOC: GBBOOT selects entries 29/28 so CCFP gets
  # the intended logical boot/frame blocks rather than wall-bank chunks.
  @{ Name = '_GBAMIGA.GBT'; Logical = 203 },
  @{ Name = '_GBAMIG2.GBT'; Logical = 202 }
)) {
  $path = Join-Path $build $expected.Name
  if (-not (Test-Path $path)) {
    throw "GBBOOT DoK playable Amiga wall-art flow did not create $($expected.Name)"
  }
  $gbts = [IO.File]::ReadAllBytes($path)
  if ($gbts.Length -le 780 -or [Text.Encoding]::ASCII.GetString($gbts, 0, 4) -ne 'GBTS' -or
      [BitConverter]::ToUInt16($gbts, 4) -ne 1 -or $gbts[6] -ne $expected.Logical) {
    throw "GBBOOT DoK playable Amiga wall-art resource $($expected.Name) is invalid"
  }
}
Assert-RawFrame (Join-Path $build '_GBVIEW.RAW') 'GBBOOT DoK playable Amiga wall-art flow'
$dosArt = [IO.File]::ReadAllBytes((Join-Path $build 'DOKAMI-DOS.RAW'))
$amigaArt = [IO.File]::ReadAllBytes((Join-Path $build '_GBVIEW.RAW'))
if ([Linq.Enumerable]::SequenceEqual([byte[]]$dosArt, [byte[]]$amigaArt)) {
  throw 'GBBOOT DoK playable Amiga wall-art flow produced the DOS fallback frame instead of the original Amiga tiles'
}

# ECL1 #17 is the real 38x15 overland layer. Its PICTURE #112 has no matching
# DoK Amiga BIGPIC entry, so /G 2 must retain the requested logical scene and
# use original BIGPIC1.DAX pixels through CGB's GBIM fallback, not substitute
# Amiga block 113 or silently omit the scene.
$sceneConf = Join-Path $build '_gbdok_playable_scene_fallback.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X /G 2 /A 1 /B 17 > C:\DOKP17.TXT
exit
"@ | Set-Content $sceneConf -Encoding ASCII
Remove-Item (Join-Path $build '_GBSCENE.GBI'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build 'DOKP17.TXT') -Force -ErrorAction SilentlyContinue
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $sceneConf -Headless
if (-not $p.WaitForExit(50000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT DoK playable DOS BIGPIC fallback scene timed out'
}
$sceneOut = Get-Content (Join-Path $build 'DOKP17.TXT') -Raw
if ($sceneOut -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT DoK playable DOS BIGPIC fallback scene failed the native route'
}
$scenePath = Join-Path $build '_GBSCENE.GBI'
if (-not (Test-Path $scenePath)) {
  throw 'GBBOOT DoK playable DOS BIGPIC fallback did not emit _GBSCENE.GBI'
}
$scene = [IO.File]::ReadAllBytes($scenePath)
if ([Text.Encoding]::ASCII.GetString($scene, 0, 4) -ne 'GBIM' -or
    [BitConverter]::ToUInt16($scene, 6) -ne 112 -or
    [BitConverter]::ToUInt16($scene, 10) -ne 304 -or
    [BitConverter]::ToUInt16($scene, 12) -ne 120) {
  throw 'GBBOOT DoK playable DOS BIGPIC fallback emitted the wrong logical scene'
}
Assert-RawFrame (Join-Path $build '_GBVIEW.RAW') 'GBBOOT DoK playable DOS BIGPIC fallback scene'
Assert-SceneInFrame $scenePath (Join-Path $build '_GBVIEW.RAW') 'GBBOOT DoK playable DOS BIGPIC fallback scene'

# The opening event is the decisive narrative-to-tactical boundary.  Its real
# renderable records are BIGPIC1 #112, PIC2 #96, BIGPIC1 #113, PIC5 #77, then
# BIGPIC1 #112 again; #255 is a retail clear/reset marker. Replay must execute each actual
# picture in script order and leave the final small frame in its original
# three-cell inset, not merely prepare a conversion sidecar.
Remove-Item (Join-Path $build '_GBPICS.BIN'),
  (Join-Path $build '_GBSCENE.GBI'),
  (Join-Path $build '_GBPIC.RAW'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build 'DOKP16.TXT') -Force -ErrorAction SilentlyContinue
Invoke-DokGameLinkAckFlow -DbxExe $dbx -BuildDir $build -GameDir $run `
  -GuestCommand 'C:\GBBOOT /E /X /G 2 /A 1 /B 16 > C:\DOKP16.TXT' `
  -DosLogFile (Join-Path $build 'gbdok-playable-opening-files.log') `
  -CaptureRoot (Join-Path $build 'gbdok-playable-gamelink') -TimeoutSeconds 60
$openingOut = Get-Content (Join-Path $build 'DOKP16.TXT') -Raw
if ($openingOut -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT DoK playable opening picture replay failed the native route'
}
$pictureReplayPath = Join-Path $build '_GBPICS.BIN'
if (-not (Test-Path $pictureReplayPath)) {
  throw 'GBBOOT DoK playable opening picture replay did not produce its trace'
}
$pictureReplay = [IO.File]::ReadAllBytes($pictureReplayPath)
if ($pictureReplay.Length -ne 18 -or
    [Text.Encoding]::ASCII.GetString($pictureReplay, 0, 4) -ne 'GBPI' -or
    [BitConverter]::ToUInt16($pictureReplay, 4) -ne 1 -or
    [BitConverter]::ToUInt16($pictureReplay, 6) -ne 5 -or
    [BitConverter]::ToUInt16($pictureReplay, 8) -ne 112 -or
    [BitConverter]::ToUInt16($pictureReplay, 10) -ne 96 -or
    [BitConverter]::ToUInt16($pictureReplay, 12) -ne 113 -or
    [BitConverter]::ToUInt16($pictureReplay, 14) -ne 77 -or
    [BitConverter]::ToUInt16($pictureReplay, 16) -ne 112) {
  throw 'GBBOOT DoK playable opening picture replay did not execute the complete captured retail sequence'
}
$openingScenePath = Join-Path $build '_GBSCENE.GBI'
if (-not (Test-Path $openingScenePath) -or -not (Test-Path (Join-Path $build '_GBPIC.RAW'))) {
  throw 'GBBOOT DoK playable opening picture replay did not produce the final scene/frame'
}
$openingScene = [IO.File]::ReadAllBytes($openingScenePath)
if ([Text.Encoding]::ASCII.GetString($openingScene, 0, 4) -ne 'GBIM' -or
    [BitConverter]::ToUInt16($openingScene, 6) -ne 112 -or
    [BitConverter]::ToUInt16($openingScene, 10) -ne 304 -or
    [BitConverter]::ToUInt16($openingScene, 12) -ne 120) {
  throw 'GBBOOT DoK playable opening picture replay did not retain final BIGPIC #112'
}
Assert-RawFrame (Join-Path $build '_GBPIC.RAW') 'GBBOOT DoK playable opening picture replay'
Assert-SceneAt $openingScenePath (Join-Path $build '_GBPIC.RAW') 'GBBOOT DoK playable final BIGPIC frame' 8 8

$parlayConf = Join-Path $build '_gbdok_playable_parlay.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X /A 3 /B 81 /Y 4 > C:\DOKP81.TXT
exit
"@ | Set-Content $parlayConf -Encoding ASCII

Remove-Item (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build '_GBRES.GBS'),
  (Join-Path $build 'DOKP81.TXT') -Force -ErrorAction SilentlyContinue

# ECL3 #81 is a real Dulcimer town-entry PARLAY.  DoK's short dialect supplies
# only the destination word, so /Y must be stored raw rather than remapped
# through the six-value long-dialect table.
$parlayCaptureRoot = Join-Path $build 'gbdok-playable-gamelink'
$parlayPriorCaptures = @((Get-ChildItem -LiteralPath $parlayCaptureRoot -Directory -ErrorAction SilentlyContinue).Name)
Invoke-DokGameLinkAckFlow -DbxExe $dbx -BuildDir $build -GameDir $run `
  -GuestCommand 'C:\GBBOOT /E /X /A 3 /B 81 /Y 4 > C:\DOKP81.TXT' `
  -DosLogFile (Join-Path $build 'gbdok-playable-parlay-files.log') `
  -CaptureRoot $parlayCaptureRoot -TimeoutSeconds 60
$parlayOut = Get-Content (Join-Path $build 'DOKP81.TXT') -Raw
if ($parlayOut -notlike '*native: CCECL ECL3.DAX entry 81 -> CCGEO /B GEO3.DAX*' -or
    $parlayOut -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT DoK playable Dulcimer PARLAY flow did not enter the ECL3/GEO3 native route'
}
$parlayCapture = Get-ChildItem -LiteralPath $parlayCaptureRoot -Directory |
  Where-Object { $_.Name -notin $parlayPriorCaptures } |
  Sort-Object CreationTimeUtc -Descending | Select-Object -First 1
if (-not $parlayCapture) { throw 'GBBOOT DoK playable Dulcimer ACK evidence directory is absent' }
$parlayAck = Get-ChildItem -LiteralPath $parlayCapture.FullName -Filter 'ack-*-effect.bin' |
  Where-Object {
    $bytes = [IO.File]::ReadAllBytes($_.FullName)
    $bytes.Length -eq 5932 -and [BitConverter]::ToUInt16($bytes, 122) -eq 81 -and
      [BitConverter]::ToUInt16($bytes, 124) -eq 285
  } | Select-Object -First 1
if (-not $parlayAck) { throw 'GBBOOT DoK playable Dulcimer ACK did not capture area81/PC285' }
[byte[]]$parlayAckEffect = [IO.File]::ReadAllBytes($parlayAck.FullName)
if ([BitConverter]::ToUInt16($parlayAckEffect, 4) -ne 15 -or
    [BitConverter]::ToUInt16($parlayAckEffect, 8) -ne 2) {
  throw 'GBBOOT DoK playable Dulcimer ACK is not GBEF v15/status2'
}
$parlaySidePath = Join-Path $parlayCapture.FullName ([IO.Path]::GetFileNameWithoutExtension($parlayAck.Name) -replace '-effect$', '-sidecar.gbs')
$parlaySide = [IO.File]::ReadAllBytes($parlaySidePath)
$parlayResultPath = Join-Path $build '_GBRES.BIN'
if (-not (Test-Path -LiteralPath $parlayResultPath)) {
  throw 'GBBOOT DoK playable Dulcimer resume did not publish its completed effect'
}
[byte[]]$parlayResult = [IO.File]::ReadAllBytes($parlayResultPath)
if ($parlayResult.Length -ne 5750 -or
    [Text.Encoding]::ASCII.GetString($parlayResult, 0, 4) -ne 'GBEF' -or
    [BitConverter]::ToUInt16($parlayResult, 4) -ne 9 -or
    [BitConverter]::ToUInt16($parlayResult, 8) -ne 0 -or
    [BitConverter]::ToUInt16($parlayResult, 122) -ne 81 -or
    [BitConverter]::ToUInt16($parlayResult, 124) -ne 285) {
  throw 'GBBOOT DoK playable Dulcimer resume did not publish completed ECL3#81 PC285 state'
}
$parlayEffect = Get-Content -LiteralPath (Join-Path $build '_GBECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v000F flags=0127 status=0002',
  'MEM key=4BE6 value=0001',
  'MEM key=0084 value=0004',
  '#02 OP=2C PARLAY ARGC=01',
  'TEXT=THIS MAIN STREET LEADS INTO DULCIMER. FROM THE WEST ',
  'TEXT=ZOMBIES FILL A MARKET TO THE EAST. A DOG LURCHES PAST, PURSUED BY AN UNDEAD CHILD.'
)) {
  if ($parlayEffect -notlike "*$needle*") {
    throw "GBBOOT DoK playable Dulcimer PARLAY effect missing: $needle"
  }
}
$parlayTail = 8 + 7 * 54
if ($parlaySide.Length -ne 515 -or
    [Text.Encoding]::ASCII.GetString($parlaySide, 0, 4) -ne 'GBSL' -or
    [BitConverter]::ToUInt16($parlaySide, 4) -ne 2 -or
    [BitConverter]::ToUInt16($parlaySide, 6) -ne 7 -or
    [Text.Encoding]::ASCII.GetString($parlaySide, $parlayTail, 4) -ne 'GBPX' -or
    [BitConverter]::ToUInt16($parlaySide, $parlayTail + 4) -ne 1 -or
    [BitConverter]::ToUInt16($parlaySide, $parlayTail + 6) -ne 2 -or
    [BitConverter]::ToUInt32($parlaySide, $parlayTail + 8) -ne 101 -or
    [BitConverter]::ToUInt16($parlaySide, $parlayTail + 12) -ne 3 -or
    [BitConverter]::ToUInt16($parlaySide, $parlayTail + 14) -ne 0 -or
    [BitConverter]::ToUInt16($parlaySide, $parlayTail + 16) -ne 39 -or
    [BitConverter]::ToUInt16($parlaySide, $parlayTail + 18) -ne 52 -or
    [BitConverter]::ToUInt16($parlaySide, $parlayTail + 20) -ne 5 -or
    [BitConverter]::ToUInt16($parlaySide, $parlayTail + 22) -ne 39 -or
    [BitConverter]::ToUInt16($parlaySide, $parlayTail + 24) -ne 62 -or
    [BitConverter]::ToUInt16($parlaySide, $parlayTail + 26) -ne 82) {
  throw 'GBBOOT DoK playable Dulcimer long-text GBSL v2 contract changed'
}

Remove-Item (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBECL.GBS'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build 'DOKPLC.TXT') -Force -ErrorAction SilentlyContinue

# Area 1 block 32 cell (10,15) faces east into descriptor 154, which reaches
# the real healer empty-COMBAT route and then resumes to COME AGAIN SOON.
Set-Session 10 15 2
Invoke-DokGameLinkAckFlow -DbxExe $dbx -BuildDir $build -GameDir $run `
  -GuestCommand 'C:\GBBOOT /E /A 1 /B 32 /T 1 > C:\DOKPLC.TXT' `
  -DosLogFile (Join-Path $build 'gbdok-playable-empty-combat-files.log') `
  -CaptureRoot (Join-Path $build 'gbdok-playable-gamelink') -TimeoutSeconds 60

$combatOut = Get-Content (Join-Path $build 'DOKPLC.TXT') -Raw
if ($combatOut -notlike '*native: CCECL ECL1.DAX entry 32 -> CCGEO /B GEO1.DAX*' -or
    $combatOut -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT DoK playable empty-combat flow did not enter the block-32 native route'
}

$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
if ([BitConverter]::ToUInt16($step, 6) -ne 154 -or
    [BitConverter]::ToUInt16($step, 8) -ne 11 -or
    [BitConverter]::ToUInt16($step, 10) -ne 15 -or
    [BitConverter]::ToUInt16($step, 12) -ne 2) {
  throw 'GBBOOT DoK playable empty-combat route did not step into descriptor 154'
}

$combatEffect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0020 status=0003 geo=FFFF chain=FFFF',
  "#01 OP=12 PRINTCLEAR ARGC=01 ARGS= 000C TEXT='NEED HEALING?'",
  '#02 OP=22 PARTY_SURPRISE'
)) {
  if ($combatEffect -notlike "*$needle*") {
    throw "GBBOOT DoK playable empty-combat effect missing: $needle"
  }
}
if ($combatEffect -like '*GBEC groups=*' -or $combatEffect -like '*MONSTER id=*') {
  throw 'GBBOOT DoK playable empty-combat route unexpectedly exported queued monster groups'
}

$outcome = (Get-Content (Join-Path $build '_GBCOMB.OUT') -Raw).Trim()
if ($outcome -ne 'victory') {
  throw "GBBOOT DoK playable empty-combat outcome expected victory, got $outcome"
}
foreach ($name in @('_GBCOMB.TRC', '_GBCOMB.RAW', '_GBCR.BIN')) {
  if (Test-Path (Join-Path $build $name)) {
    throw "GBBOOT DoK playable flow unexpectedly launched tactical combat for empty encounter: $name"
  }
}

$resume = Get-Content (Join-Path $build '_GBRES.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0020 status=0000 geo=FFFF chain=FFFF',
  "#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 000E TEXT='COME AGAIN SOON.'",
  '#01 OP=2D CALL'
)) {
  if ($resume -notlike "*$needle*") {
    throw "GBBOOT DoK playable empty-combat resume missing: $needle"
  }
}

Remove-Item (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBECL.GBS'),
  (Join-Path $build '_GBEVT.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCP0.GBI'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build 'DOKP34.TXT') -Force -ErrorAction SilentlyContinue

# ECL1 #34, GEO1 #34 cell (11,1) is the retail Cekos street encounter. The
# inbound step from (10,1) facing east is passable and selector 12 is active;
# its short DoK script queues fifteen SIVAKs (id/picture 0x21) for combat.
Set-Session 10 1 2
$naturalCaptureRoot = Join-Path $build 'gbdok-playable-gamelink'
$naturalPriorCaptures = @((Get-ChildItem -LiteralPath $naturalCaptureRoot -Directory -ErrorAction SilentlyContinue).Name)
Invoke-DokGameLinkAckFlow -DbxExe $dbx -BuildDir $build -GameDir $run `
  -GuestCommand 'C:\GBBOOT /E /G 2 /A 1 /B 34 /T 1 > C:\DOKP34.TXT' `
  -DosLogFile (Join-Path $build 'gbdok-playable-natural-combat-files.log') `
  -CaptureRoot $naturalCaptureRoot -TimeoutSeconds 60

$naturalOut = Get-Content (Join-Path $build 'DOKP34.TXT') -Raw
if ($naturalOut -notlike '*native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX*' -or
    $naturalOut -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT DoK playable natural Cekos/Sivak combat flow did not enter the block-34 native route'
}
$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
if ([BitConverter]::ToUInt16($step, 6) -ne 140 -or
    [BitConverter]::ToUInt16($step, 8) -ne 11 -or
    [BitConverter]::ToUInt16($step, 10) -ne 1 -or
    [BitConverter]::ToUInt16($step, 12) -ne 2) {
  throw 'GBBOOT DoK playable natural Cekos/Sivak combat did not step into retail descriptor 140 at (11,1)'
}

$naturalCapture = Get-ChildItem -LiteralPath $naturalCaptureRoot -Directory |
  Where-Object { $_.Name -notin $naturalPriorCaptures } |
  Sort-Object CreationTimeUtc -Descending | Select-Object -First 1
if (-not $naturalCapture) { throw 'GBBOOT DoK natural-combat ACK evidence directory is absent' }
$combatAckRecord = Get-ChildItem -LiteralPath $naturalCapture.FullName -Filter 'ack-*.json' |
  ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json } |
  Where-Object { $_.area -eq 34 -and $_.pc -eq 4883 } | Select-Object -First 1
if (-not $combatAckRecord -or $combatAckRecord.version -ne 15 -or
    $combatAckRecord.status -ne 2 -or $combatAckRecord.flags -ne 0x0160) {
  throw 'GBBOOT DoK natural Cekos/Sivak route did not capture its pre-combat area34/PC4883 ACK'
}
foreach ($name in @('_GBCOMB.TRC', '_GBCOMB.RAW', '_GBCR.BIN', '_GBRES.TXT')) {
  if (-not (Test-Path (Join-Path $build $name))) {
    throw "GBBOOT DoK playable natural Cekos/Sivak combat did not produce $name"
  }
}
Assert-RawFrame (Join-Path $build '_GBCOMB.RAW') 'GBBOOT DoK playable natural Cekos/Sivak combat'
$sivakIcon = Join-Path $build '_GBCP0.GBI'
if (-not (Test-Path $sivakIcon)) {
  throw 'GBBOOT DoK playable natural Cekos/Sivak combat did not decode the original Amiga CPIC sprite'
}
$sivakIconBytes = [IO.File]::ReadAllBytes($sivakIcon)
if ($sivakIconBytes.Length -le 782 -or
    [Text.Encoding]::ASCII.GetString($sivakIconBytes, 0, 4) -ne 'GBIM' -or
    [BitConverter]::ToUInt16($sivakIconBytes, 4) -ne 1 -or
    [BitConverter]::ToUInt16($sivakIconBytes, 6) -ne 0x21) {
  throw 'GBBOOT DoK playable natural Cekos/Sivak combat wrote an invalid CPIC sprite resource'
}
$naturalResult = [IO.File]::ReadAllBytes((Join-Path $build '_GBCR.BIN'))
if ($naturalResult.Length -ne 40 -or
    [Text.Encoding]::ASCII.GetString($naturalResult, 0, 4) -ne 'GBCR' -or
    [BitConverter]::ToUInt16($naturalResult, 4) -ne 1 -or
    [BitConverter]::ToUInt16($naturalResult, 6) -notin @(0, 1, 2)) {
  throw 'GBBOOT DoK playable natural Cekos/Sivak combat did not retain a valid terminal GBCR result'
}
$naturalTrace = Get-Content (Join-Path $build '_GBCOMB.TRC') -Raw
if ([regex]::Matches($naturalTrace, '(?m)^1 init p[0-3] ').Count -ne 4 -or
    [regex]::Matches($naturalTrace, '(?m)^1 init e(?:[0-9]|1[0-4]) ').Count -ne 15 -or
    $naturalTrace -notlike '*0 end - *') {
  throw 'GBBOOT DoK playable natural Cekos/Sivak trace did not initialize four party members and fifteen Sivaks to a terminal result'
}

$queuedConf = Join-Path $build '_gbdok_playable_queued_combat.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X /A 2 /B 51 /1 29 /0 19689 1 > C:\DOKP51.TXT
exit
"@ | Set-Content $queuedConf -Encoding ASCII

Remove-Item (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBEVT.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build 'DOKP51.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $queuedConf -Headless
if (-not $p.WaitForExit(50000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT DoK playable queued tactical flow timed out'
}

$queuedOut = Get-Content (Join-Path $build 'DOKP51.TXT') -Raw
if ($queuedOut -notlike '*native: CCECL ECL2.DAX entry 51*' -or
    $queuedOut -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT DoK playable queued tactical flow did not enter the ECL2 block-51 native route'
}

$queuedEffectPath = Join-Path $build '_GBEVT.BIN'
if (-not (Test-Path $queuedEffectPath)) {
  throw 'GBBOOT DoK playable queued tactical flow did not preserve the queued event handoff'
}
$queuedEffect = [IO.File]::ReadAllBytes($queuedEffectPath)
if ($queuedEffect.Length -lt 46 -or
    [Text.Encoding]::ASCII.GetString($queuedEffect, 0, 4) -ne 'GBEF' -or
    [BitConverter]::ToUInt16($queuedEffect, 4) -ne 9 -or
    ([BitConverter]::ToUInt16($queuedEffect, 6) -band 8) -eq 0 -or
    [BitConverter]::ToUInt16($queuedEffect, 8) -ne 3 -or
    [BitConverter]::ToUInt16($queuedEffect, 32) -lt 1) {
  throw 'GBBOOT DoK playable queued tactical flow did not export a queued COMBAT GBEF handoff'
}

foreach ($name in @('_GBCOMB.TRC', '_GBCOMB.OUT', '_GBCOMB.RAW', '_GBCR.BIN', '_GBRES.TXT')) {
  if (-not (Test-Path (Join-Path $build $name))) {
    throw "GBBOOT DoK playable queued tactical flow did not produce $name"
  }
}

Assert-RawFrame (Join-Path $build '_GBCOMB.RAW') 'GBBOOT DoK playable queued tactical flow'

$queuedOutcome = (Get-Content (Join-Path $build '_GBCOMB.OUT') -Raw).Trim()
if ($queuedOutcome -notin @('party', 'enemy', 'draw')) {
  throw "GBBOOT DoK playable queued tactical outcome was not a CCCOMBAT terminal result: $queuedOutcome"
}

$trace = Get-Content (Join-Path $build '_GBCOMB.TRC') -Raw
if ($trace -notlike '*p0*' -or $trace -notlike '*p3*' -or $trace -notlike '*e0*') {
  throw 'GBBOOT DoK playable queued tactical trace did not include imported four-member party plus enemies'
}

$gbcrPath = Join-Path $build '_GBCR.BIN'
$gbcr = [IO.File]::ReadAllBytes($gbcrPath)
if ($gbcr.Length -ne (16 + (6 * 4)) -or
    [Text.Encoding]::ASCII.GetString($gbcr, 0, 4) -ne 'GBCR' -or
    [BitConverter]::ToUInt16($gbcr, 4) -ne 1 -or
    [BitConverter]::ToUInt16($gbcr, 10) -ne 4) {
  throw 'GBBOOT DoK playable queued tactical flow wrote an invalid four-row GBCR sidecar'
}
for ($i = 0; $i -lt 4; $i++) {
  $row = 16 + ($i * 6)
  if ([BitConverter]::ToInt16($gbcr, $row + 4) -le 0) {
    throw "GBBOOT DoK playable queued tactical GBCR row $i has invalid max HP"
  }
}

$gbprAfter = [IO.File]::ReadAllBytes($gbprPath)
for ($i = 0; $i -lt 4; $i++) {
  $row = 16 + ($i * 6)
  # GBCR uses an enum (alive/unconscious/dead/fled); GBD1 stores C_FLAGS bits.
  $expectedCondition = @(0, 2, 1, 8)[[int]$gbcr[$row + 1]]
  $expectedHp = [BitConverter]::ToInt16($gbcr, $row + 2)
  if ($expectedHp -lt 0) {
    $expectedHp = 0
  }
  $expectedMaxHp = [BitConverter]::ToInt16($gbcr, $row + 4)
  $meta = 16 + ($i * 410) + 1 + 216
  if ([Text.Encoding]::ASCII.GetString($gbprAfter, $meta, 4) -ne 'GBD1' -or
      ([BitConverter]::ToUInt16($gbprAfter, $meta + 4) -band 2) -eq 0) {
    throw "GBBOOT DoK playable queued tactical flow did not write back GBD1 combat condition for entry $i"
  }
  $actualCondition = [BitConverter]::ToUInt16($gbprAfter, $meta + 24)
  $actualHp = [BitConverter]::ToInt16($gbprAfter, $meta + 6)
  $actualMaxHp = [BitConverter]::ToInt16($gbprAfter, $meta + 26)
  if ($actualCondition -ne $expectedCondition -or
      $actualHp -ne $expectedHp -or
      $actualMaxHp -ne $expectedMaxHp) {
    throw "GBBOOT DoK playable queued tactical GBD1 row $i expected condition=$expectedCondition hp=$expectedHp maxHp=$expectedMaxHp, got condition=$actualCondition hp=$actualHp maxHp=$actualMaxHp"
  }
}

$queuedResume = Get-Content (Join-Path $build '_GBRES.TXT') -Raw
if ($queuedResume -notlike '*GBEF v0009*' -or $queuedResume -like '*GBHD reason=0001*') {
  throw 'GBBOOT DoK playable queued tactical resume did not produce a clean CCECL result'
}

Remove-Item (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBECL.GBS'),
  (Join-Path $build '_GBEVT.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build 'DOKPLX.TXT') -Force -ErrorAction SilentlyContinue

# Reuse the known descriptor-142 citizen event after the queued tactical loop.
# This proves the compact post-combat GBPR remains loadable for ordinary walking.
Set-Session 0 0 2
Invoke-DokGameLinkAckFlow -DbxExe $dbx -BuildDir $build -GameDir $run `
  -GuestCommand 'C:\GBBOOT /E /A 1 /B 34 /T 1 > C:\DOKPLX.TXT' `
  -DosLogFile (Join-Path $build 'gbdok-playable-postcombat-files.log') `
  -CaptureRoot (Join-Path $build 'gbdok-playable-gamelink') -TimeoutSeconds 60

$postCombatOut = Get-Content (Join-Path $build 'DOKPLX.TXT') -Raw
if ($postCombatOut -notlike '*native: CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX*' -or
    $postCombatOut -notlike '*CCPARTY: loaded 4 member(s)*' -or
    $postCombatOut -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT DoK playable post-combat exploration did not reload the compact party into the expected native route'
}

$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
$effect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
if ([BitConverter]::ToUInt16($step, 6) -ne 142 -or
    [BitConverter]::ToUInt16($step, 8) -ne 1 -or
    [BitConverter]::ToUInt16($step, 10) -ne 0 -or
    [BitConverter]::ToUInt16($step, 12) -ne 2 -or
    $effect -notlike '*status=0000*' -or
    $effect -like '*status=0003*' -or
    $effect -notlike "*'GET OUT!' SAYS A FRIGHTENED CIT*") {
  throw 'GBBOOT DoK playable post-combat exploration did not reach the clean descriptor-142 citizen event'
}

foreach ($name in @('_GBCOMB.OUT', '_GBCOMB.TRC', '_GBCOMB.RAW', '_GBCR.BIN')) {
  if (Test-Path (Join-Path $build $name)) {
    throw "GBBOOT DoK playable post-combat exploration unexpectedly wrote tactical artifact $name"
  }
}
$postCombatResume = [IO.File]::ReadAllBytes((Join-Path $build '_GBRES.BIN'))
if ($postCombatResume.Length -ne 5750 -or
    [Text.Encoding]::ASCII.GetString($postCombatResume, 0, 4) -ne 'GBEF' -or
    [BitConverter]::ToUInt16($postCombatResume, 4) -ne 9 -or
    [BitConverter]::ToUInt16($postCombatResume, 8) -ne 0 -or
    [BitConverter]::ToUInt16($postCombatResume, 122) -ne 34 -or
    [BitConverter]::ToUInt16($postCombatResume, 124) -ne 201) {
  throw 'GBBOOT DoK playable post-combat setup ACK did not retain a valid clean resume effect'
}

$gbprAfterPostCombatExplore = [IO.File]::ReadAllBytes($gbprPath)
if ($gbprAfter.Length -ne $gbprAfterPostCombatExplore.Length) {
  throw 'GBBOOT DoK playable post-combat exploration changed GBPR length'
}
for ($i = 0; $i -lt $gbprAfter.Length; $i++) {
  if ($gbprAfter[$i] -ne $gbprAfterPostCombatExplore[$i]) {
    throw "GBBOOT DoK playable post-combat exploration changed GBPR byte $i"
  }
}

# Isolate condition persistence with an inactive party: combat must not change
# dead/unconscious/fled states, including after GBBOOT reloads its own writeback.
$conditionRoster = [byte[]]$gbprAfterPostCombatExplore.Clone()
$conditionFlags = @(1, 2, 8, 1)       # CF_DEAD, CF_UNCON, CF_FLED, CF_DEAD
$conditionResults = @(2, 1, 3, 2)     # independent GBCR enum encoding
$conditionHp = @(0, 0, 10, 0)
for ($i = 0; $i -lt 4; $i++) {
  $meta = 17 + ($i * 410) + 216
  [BitConverter]::GetBytes([uint16]3).CopyTo($conditionRoster, $meta + 4)
  [BitConverter]::GetBytes([uint16]$conditionFlags[$i]).CopyTo($conditionRoster, $meta + 24)
  [BitConverter]::GetBytes([uint16]$conditionHp[$i]).CopyTo($conditionRoster, $meta + 6)
}
[IO.File]::WriteAllBytes($gbprPath, $conditionRoster)
for ($pass = 1; $pass -le 2; $pass++) {
  Remove-Item -LiteralPath $gbcrPath -Force -ErrorAction SilentlyContinue
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $queuedConf -Headless
  if (-not $p.WaitForExit(50000)) {
    Stop-Process -Id $p.Id -Force
    throw "GBBOOT condition round-trip $pass timed out"
  }
  $result = [IO.File]::ReadAllBytes($gbcrPath)
  $persisted = [IO.File]::ReadAllBytes($gbprPath)
  if ($result.Length -ne 40 -or [Text.Encoding]::ASCII.GetString($result, 0, 4) -ne 'GBCR' -or
      [BitConverter]::ToUInt16($result, 4) -ne 1 -or [BitConverter]::ToUInt16($result, 10) -ne 4) {
    throw "GBBOOT condition round-trip $pass emitted an invalid result"
  }
  for ($i = 0; $i -lt 4; $i++) {
    $row = 16 + ($i * 6)
    $meta = 17 + ($i * 410) + 216
    if ($result[$row + 1] -ne $conditionResults[$i] -or
        [BitConverter]::ToInt16($result, $row + 2) -ne $conditionHp[$i]) {
      throw "GBBOOT condition round-trip $pass changed combat state for member $i"
    }
    $flags = [BitConverter]::ToUInt16($persisted, $meta + 24)
    if ($flags -ne $conditionFlags[$i]) {
      throw "GBBOOT condition round-trip $pass member $i expected GBD1 flags $($conditionFlags[$i]), got $flags"
    }
  }
}

# A retail party must keep a real combat victory after a cold CCPARTY /G load,
# not merely in the transient GBPR sidecar.  The Cekos/Sivak route above is a
# source-owned ECL/GEO encounter; copy the shipped saves into the disposable
# game mount before exercising it so this test never writes user assets.
$retailSave = Join-Path $game 'SAVE'
foreach ($slot in 1..6) {
  if (-not (Test-Path (Join-Path $retailSave "CHRDATA$slot.GAM"))) {
    throw "GBBOOT DoK combat-reward flow needs shipped SAVE\\CHRDATA$slot.GAM"
  }
}
Remove-Item (Join-Path $run 'SAVE') -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item $retailSave (Join-Path $run 'SAVE') -Recurse -Force

$retailWizBefore = @()
for ($i = 0; $i -lt 6; $i++) {
  $wizPath = Join-Path $run "SAVE\CHRDATA$($i + 1).WIZ"
  [byte[]]$wiz = [IO.File]::ReadAllBytes($wizPath)
  if ($wiz.Length -ne 220) { throw "GBBOOT DoK Cast fixture has an invalid WIZ record for member $i" }
  # Add one prepared raw id 15 in the disposable copy only. This makes the
  # scripted Cast independent of initiative while retaining all retail bytes
  # outside the confirmed, right-justified 34..73 prepared-slot region.
  [int[]]$prepared = @($wiz[34..73] | Where-Object { $_ -ne 0 }) + 15 | Sort-Object
  if ($prepared.Count -gt 40) { throw "GBBOOT DoK Cast fixture has no prepared-slot room for member $i" }
  34..73 | ForEach-Object { $wiz[$_] = 0 }
  $preparedStart = 74 - $prepared.Count
  for ($j = 0; $j -lt $prepared.Count; $j++) { $wiz[$preparedStart + $j] = [byte]$prepared[$j] }
  [IO.File]::WriteAllBytes($wizPath, $wiz)
  $retailWizBefore += @{ MagicMissiles = @($wiz[34..73] | Where-Object { $_ -eq 15 }).Count }
}

$retailBefore = @()
for ($i = 0; $i -lt 6; $i++) {
  $raw = [IO.File]::ReadAllBytes((Join-Path $run "SAVE\\CHRDATA$($i + 1).GAM"))
  $levels = @($raw[0x45..0x4c] | Where-Object { $_ -ne 0 }).Count
  if ($raw.Length -ne 216 -or $levels -eq 0) {
    throw "GBBOOT DoK combat-reward fixture has an invalid shipped member $i"
  }
  $retailBefore += @{ Xp = [BitConverter]::ToUInt32($raw, 0x62); Slots = $levels }
}

Remove-Item (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBSESS.GBS'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.GBS'),
  (Join-Path $build '_GBEVT.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build 'DOKRXP.TXT') -Force -ErrorAction SilentlyContinue

Set-Session 10 1 2
Invoke-DokGameLinkAckFlow -DbxExe $dbx -BuildDir $build -GameDir $run `
  -GuestCommand 'C:\GBBOOT /E /A 1 /B 34 /T 1 /C C > C:\DOKRXP.TXT' `
  -DosLogFile (Join-Path $build 'gbdok-playable-retail-reward-files.log') `
  -CaptureRoot (Join-Path $build 'gbdok-playable-gamelink') -TimeoutSeconds 60
$retailOut = Get-Content (Join-Path $build 'DOKRXP.TXT') -Raw
if ($retailOut -notlike '*CCPARTY: loaded 6 member(s)*' -or
    $retailOut -notlike '*CCHOST: combat result applied*') {
  throw 'GBBOOT DoK retail combat-reward flow did not complete the imported party handoff'
}
$retailResult = [IO.File]::ReadAllBytes((Join-Path $build '_GBCR.BIN'))
if ($retailResult.Length -ne 52 -or
    [Text.Encoding]::ASCII.GetString($retailResult, 0, 4) -ne 'GBCR' -or
    [BitConverter]::ToUInt16($retailResult, 4) -ne 1 -or
    [BitConverter]::ToUInt16($retailResult, 6) -ne 0 -or
    [BitConverter]::ToUInt16($retailResult, 8) -eq 0 -or
    [BitConverter]::ToUInt16($retailResult, 10) -ne 6 -or
    [BitConverter]::ToUInt16($retailResult, 14) -ne 1) {
  throw 'GBBOOT DoK retail combat-reward flow did not retain a consumed victory GBCR'
}
$retailCastReceipt = [BitConverter]::ToUInt16($retailResult, 12)
if (($retailCastReceipt -shr 8) -ne 15 -or ($retailCastReceipt -band 0xff) -ge 6 -or
    (Get-Content (Join-Path $build '_GBCOMB.TRC') -Raw) -notmatch '(?m)^[0-9]+ cast p[0-9] e[0-9] -1 -1 1 [2-5] [0-9]+ -') {
  throw 'GBBOOT DoK retail combat-reward flow did not carry Magic Missile through CCCOMBAT'
}
$retailAward = [BitConverter]::ToUInt16($retailResult, 8)
$retailAfter = [IO.File]::ReadAllBytes($gbprPath)
$retailCastSourceSlot = $retailAfter[16 + (($retailCastReceipt -band 0xff) * 410)]
if ($retailCastSourceSlot -lt 1 -or $retailCastSourceSlot -gt 6) {
  throw 'GBBOOT DoK retail combat-reward flow published a Cast receipt without a retail source slot'
}
for ($i = 0; $i -lt 6; $i++) {
  $raw = [IO.File]::ReadAllBytes((Join-Path $run "SAVE\\CHRDATA$($i + 1).GAM"))
  $record = 16 + ($i * 410) + 1
  $meta = $record + 216
  $expectedXp = [uint32]($retailBefore[$i].Xp + [math]::Floor($retailAward / $retailBefore[$i].Slots))
  $ready = 0
  for ($slot = 0; $slot -lt 8; $slot++) {
    $threshold = [BitConverter]::ToUInt32($retailAfter, $meta + 28 + (4 * $slot))
    if ($threshold -ne 0 -and $expectedXp -ge $threshold) { $ready = 1 }
  }
  if ([BitConverter]::ToUInt32($retailAfter, $record + 0x62) -ne $expectedXp -or
      $retailAfter[$record + 0xc6] -ne $ready -or
      [BitConverter]::ToUInt32($raw, 0x62) -ne $expectedXp -or
      $raw[0xc6] -ne $ready) {
    throw "GBBOOT DoK retail combat-reward member $i did not persist its source-derived split"
  }
}

# CCHOST consumes exactly one prepared Magic Missile from the source slot named
# by CCCOMBAT's receipt and leaves every other source record's spell count alone.
for ($i = 0; $i -lt 6; $i++) {
  $wiz = [IO.File]::ReadAllBytes((Join-Path $run "SAVE\CHRDATA$($i + 1).WIZ"))
  $expectedMagicMissiles = $retailWizBefore[$i].MagicMissiles
  if (($i + 1) -eq $retailCastSourceSlot) { $expectedMagicMissiles-- }
  if (@($wiz[34..73] | Where-Object { $_ -eq 15 }).Count -ne $expectedMagicMissiles) {
    throw "GBBOOT DoK combat-reward member $i did not preserve exact prepared Magic Missile ownership"
  }
}

# Cold re-import from the updated .GAM files must reproduce the award.  Use a
# non-combat retail cell so the old consumed GBCR remains available for the
# replay check below.
Remove-Item (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBSESS.GBS'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.GBS'),
  (Join-Path $build '_GBEVT.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build 'DOKRXPC.TXT') -Force -ErrorAction SilentlyContinue
Set-Session 0 0 2
Invoke-DokGameLinkAckFlow -DbxExe $dbx -BuildDir $build -GameDir $run `
  -GuestCommand 'C:\GBBOOT /E /A 1 /B 34 /T 1 > C:\DOKRXPC.TXT' `
  -DosLogFile (Join-Path $build 'gbdok-playable-retail-cold-files.log') `
  -CaptureRoot (Join-Path $build 'gbdok-playable-gamelink') -TimeoutSeconds 60
$retailColdOut = Get-Content (Join-Path $build 'DOKRXPC.TXT') -Raw
if ($retailColdOut -notlike '*CCPARTY: loaded 6 member(s)*' -or
    $retailColdOut -like '*CCHOST: combat result applied*') {
  throw 'GBBOOT DoK retail combat-reward cold reload did not take the expected non-combat path'
}
$retailCold = [IO.File]::ReadAllBytes($gbprPath)
for ($i = 0; $i -lt 6; $i++) {
  $record = 16 + ($i * 410) + 1
  $expectedXp = [uint32]($retailBefore[$i].Xp + [math]::Floor($retailAward / $retailBefore[$i].Slots))
  if ([BitConverter]::ToUInt32($retailCold, $record + 0x62) -ne $expectedXp) {
    throw "GBBOOT DoK retail combat-reward cold reload lost member $i XP"
  }
}

# CCHOST must refuse the exact, source-grounded result once it has been
# consumed.  Its roster and raw .GAM fields must remain byte-for-byte stable.
$replayRequest = New-Object byte[] 346
[Text.Encoding]::ASCII.GetBytes('GBHR').CopyTo($replayRequest, 0)
[BitConverter]::GetBytes([uint16]1).CopyTo($replayRequest, 4)
[BitConverter]::GetBytes([uint16]3).CopyTo($replayRequest, 6)
[Text.Encoding]::ASCII.GetBytes('C:\_GBCR.BIN').CopyTo($replayRequest, 10)
[Text.Encoding]::ASCII.GetBytes('C:\_GBPARTY.GBP').CopyTo($replayRequest, 122)
[Text.Encoding]::ASCII.GetBytes('C:\_GBECL.BIN').CopyTo($replayRequest, 234)
[IO.File]::WriteAllBytes((Join-Path $build 'DOKRXPR.GHR'), $replayRequest)
$replayBefore = [IO.File]::ReadAllBytes($gbprPath)
$replaySourceBefore = @{}
Get-ChildItem (Join-Path $run 'SAVE') -Filter 'CHRDATA*.GAM' | ForEach-Object {
  $replaySourceBefore[$_.Name] = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
}
$replayConf = Join-Path $build '_gbdok_playable_retail_reward_replay.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
C:
C:\CCHOST /H C:\DOKRXPR.GHR > C:\DOKRXPR.TXT
exit
"@ | Set-Content $replayConf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $replayConf -Headless
if (-not $p.WaitForExit(50000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT DoK retail combat-reward replay probe timed out'
}
if ((Get-Content (Join-Path $build 'DOKRXPR.TXT') -Raw) -notlike '*CCHOST: invalid host request*' -or
    [BitConverter]::ToString([IO.File]::ReadAllBytes($gbprPath)) -ne [BitConverter]::ToString($replayBefore)) {
  throw 'GBBOOT DoK retail combat-reward replay was accepted or changed GBPR'
}
$replaySourceAfter = @{}
Get-ChildItem (Join-Path $run 'SAVE') -Filter 'CHRDATA*.GAM' | ForEach-Object {
  $replaySourceAfter[$_.Name] = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
}
foreach ($name in $replaySourceBefore.Keys) {
  if ($replaySourceAfter[$name] -ne $replaySourceBefore[$name]) {
    throw "GBBOOT DoK retail combat-reward replay changed raw $name"
  }
}

# The last DOSBox leg deliberately asks CCHOST to reject a replayed result, so
# its nonzero guest status is expected. All flow assertions above own the test
# verdict; do not leak that intentional native exit code to run-flow-suite.ps1.
$global:LASTEXITCODE = 0
Write-Output 'RESULT: GBBOOT DoK /J title/music, four-member native compact create, GBPS v2 thief matrix, ECL1#17 DOS-BIGPIC fallback scene, opening 112->96->113->77->112 picture replay, bounded exploration, Amiga wall-art bridge, Dulcimer PARLAY, empty-combat resume, natural Cekos/Sivak tactical handoff, seeded queued tactical handoff, post-combat exploration, and source-grounded retail victory XP cold-reload/replay persistence PASS'
