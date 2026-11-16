# GBBOOT DQK Amiga/WHDLoad GLIB ECL/GEO native preview flow.
#
# Optional local smoke that stages the original Amiga GLIB ECL.GLB/GEO.GLB pair
# and proves the native Gen2 path can run CCECL -> CCGEO -> CCFP without
# converting the containers to DOS HLIB first.
param(
  [switch]$Headless,
  [string]$DqkAmigaPath = $env:GOLDBOX_DQK_AMIGA_PATH
)

$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build 'gbdqk-amiga-glib-flow-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT DQK Amiga GLIB flow (DOSBox.exe absent)'
  exit 0
}

if (-not $DqkAmigaPath) {
  $candidates = @(
    'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\DarkQueenOfKrynn\data',
    'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\MyCollection\AD&D\DarkQueenOfKrynn\data',
    'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDPacks\D\DarkQueenOfKrynn\data'
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      $DqkAmigaPath = $candidate
      break
    }
  }
}

if (-not $DqkAmigaPath -or -not (Test-Path $DqkAmigaPath)) {
  Write-Output 'SKIP: GBBOOT DQK Amiga GLIB flow (set GOLDBOX_DQK_AMIGA_PATH to run)'
  exit 0
}

$ecl = Join-Path $DqkAmigaPath 'Disk3\ECL.GLB'
$geo = Join-Path $DqkAmigaPath 'Disk3\GEO.GLB'
foreach ($path in @($ecl, $geo)) {
  if (-not (Test-Path $path)) {
    Write-Output "SKIP: GBBOOT DQK Amiga GLIB flow ($path absent)"
    exit 0
  }
  $magic = [Text.Encoding]::ASCII.GetString(([IO.File]::ReadAllBytes($path)[0..3]))
  if ($magic -ne 'GLIB' -and $magic -ne 'HLIB') {
    Write-Output "SKIP: GBBOOT DQK Amiga GLIB flow ($path is not GLIB/HLIB)"
    exit 0
  }
}

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

if (Test-Path $run) {
  $resolvedRun = [IO.Path]::GetFullPath($run)
  $resolvedBuild = [IO.Path]::GetFullPath($build)
  if (-not $resolvedRun.StartsWith($resolvedBuild, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove unexpected test directory: $resolvedRun"
  }
  Remove-Item -Recurse -Force $run
}
New-Item -ItemType Directory -Force (Join-Path $run 'DISK3') | Out-Null
Copy-Item $ecl (Join-Path $run 'DISK3\ECL.GLB') -Force
Copy-Item $geo (Join-Path $run 'DISK3\GEO.GLB') -Force

function Assert-RawFrame([string]$Path, [string]$Label, [int]$MinColors = 4) {
  if (-not (Test-Path $Path)) { throw "$Label missing RAW frame" }
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ne (4 + (320 * 200) + 768) -or
      [BitConverter]::ToUInt16($bytes, 0) -ne 320 -or
      [BitConverter]::ToUInt16($bytes, 2) -ne 200) {
    throw "$Label wrote an invalid 320x200 RAW frame"
  }
  $nonZero = 0
  $colors = @{}
  for ($i = 4; $i -lt (4 + (320 * 200)); $i++) {
    $pix = [int]$bytes[$i]
    if ($pix -ne 0) { $nonZero++ }
    $colors[$pix] = $true
  }
  if ($nonZero -lt 4096 -or $colors.Count -lt $MinColors) {
    throw "$Label produced an implausibly blank frame nonZero=$nonZero colors=$($colors.Count)"
  }
}

function Read-U16BE([byte[]]$Bytes, [int]$Offset) {
  return (($Bytes[$Offset] -shl 8) -bor $Bytes[$Offset + 1])
}

function Read-U32BE([byte[]]$Bytes, [int]$Offset) {
  return (([uint32]$Bytes[$Offset] -shl 24) -bor
    ([uint32]$Bytes[$Offset + 1] -shl 16) -bor
    ([uint32]$Bytes[$Offset + 2] -shl 8) -bor [uint32]$Bytes[$Offset + 3])
}

function Assert-DqkAmigaArea18GeoPayloadIsConsumed {
  # The route's GBEF selects GEO logical id 18.  Resolve that id through the
  # staged GLIB id table, corrupt only its map member, and require WGRD output
  # to change or disappear rather than accepting a header-only false green.
  $wallPath = Join-Path $build '_GBWALL.BIN'
  if (-not (Test-Path $wallPath)) { throw 'GBBOOT DQK Amiga GLIB flow did not write _GBWALL.BIN' }
  [byte[]]$baselineWall = [IO.File]::ReadAllBytes($wallPath)
  $artifactPaths = @(
    $wallPath,
    (Join-Path $build '_GBVIEW.RAW'),
    (Join-Path $build '_GBECL.BIN'),
    (Join-Path $build '_GBECL.TXT'),
    (Join-Path $build 'DQKAG.TXT')
  )
  $baselineArtifacts = @{}
  foreach ($artifact in $artifactPaths) {
    if (Test-Path $artifact) { $baselineArtifacts[$artifact] = [IO.File]::ReadAllBytes($artifact) }
  }
  $stagedGeo = Join-Path $run 'DISK3\GEO.GLB'
  [byte[]]$container = [IO.File]::ReadAllBytes($stagedGeo)
  if ([Text.Encoding]::ASCII.GetString($container, 0, 4) -ne 'GLIB') {
    throw 'GBBOOT DQK Amiga staged GEO is not a GLIB container'
  }
  $pointerCount = (Read-U16BE $container 8) + 1
  if ($pointerCount -lt 3 -or $container.Length -lt (16 + (4 * $pointerCount))) {
    throw 'GBBOOT DQK Amiga staged GEO has an invalid GLIB pointer table'
  }
  $idStart = [int](Read-U32BE $container 16)
  $idEnd = [int](Read-U32BE $container 20)
  if ($idStart -lt 0 -or $idEnd -gt $container.Length -or $idEnd -lt ($idStart + 2)) {
    throw 'GBBOOT DQK Amiga staged GEO has an invalid GLIB id table'
  }
  $idCount = Read-U16BE $container $idStart
  $member = -1
  for ($i = 0; $i -lt $idCount; $i++) {
    $at = $idStart + 2 + (4 * $i)
    if (($at + 3) -ge $idEnd) { throw 'GBBOOT DQK Amiga staged GEO id table is truncated' }
    if ((Read-U16BE $container $at) -eq 18) {
      $member = Read-U16BE $container ($at + 2)
      break
    }
  }
  if ($member -lt 1 -or $member -ge ($pointerCount - 1)) {
    throw 'GBBOOT DQK Amiga staged GEO has no area-18 member pointer'
  }
  $payloadStart = [int](Read-U32BE $container (16 + (4 * $member)))
  $payloadEnd = [int](Read-U32BE $container (20 + (4 * $member)))
  if ($payloadStart -lt 0 -or $payloadEnd -gt $container.Length -or
      ($payloadEnd - $payloadStart) -lt 8) {
    throw 'GBBOOT DQK Amiga staged GEO area-18 member is not a valid Gen2 map payload'
  }

  [byte[]]$mutatedContainer = $container.Clone()
  try {
    for ($i = $payloadStart; $i -lt $payloadEnd; $i++) { $mutatedContainer[$i] = 0 }
    [IO.File]::WriteAllBytes($stagedGeo, $mutatedContainer)
    Remove-Item $artifactPaths -Force -ErrorAction SilentlyContinue
    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
    if (-not $p.WaitForExit(60000)) {
      Stop-DosBoxSmoke -Process $p
      throw 'GBBOOT DQK Amiga mutated GLIB flow timed out'
    }
    $wallChanged = (-not (Test-Path $wallPath)) -or
      (-not [Linq.Enumerable]::SequenceEqual($baselineWall, [IO.File]::ReadAllBytes($wallPath)))
    if (-not $wallChanged) {
      throw 'GBBOOT DQK Amiga area-18 GEO payload mutation left _GBWALL.BIN unchanged'
    }
  } finally {
    [IO.File]::WriteAllBytes($stagedGeo, $container)
    foreach ($artifact in $artifactPaths) {
      if ($baselineArtifacts.ContainsKey($artifact)) {
        [IO.File]::WriteAllBytes($artifact, [byte[]]$baselineArtifacts[$artifact])
      } else {
        Remove-Item $artifact -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

$conf = Join-Path $build '_gbdqk_amiga_glib_flow_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X /A 18 > C:\DQKAG.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

Remove-Item (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBWALL.BIN'),
  (Join-Path $build '_GBWSET.GBW'),
  (Join-Path $build '_GBTITLE.RAW'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build 'DQKAG.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'GBBOOT DQK Amiga GLIB flow timed out'
}

$out = Get-Content (Join-Path $build 'DQKAG.TXT') -Raw
foreach ($needle in @(
  'game:   Dark Queen / DQK-class HLIB build',
  'exec:   (native /E only)',
  'native: CCECL DISK3\ECL.GLB entry 18 -> CCGEO /B DISK3\GEO.GLB'
)) {
  if ($out -notlike "*$needle*") {
    throw "GBBOOT DQK Amiga GLIB output missing: $needle"
  }
}
if ($out -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT DQK Amiga GLIB native preview failed'
}

$effect = [IO.File]::ReadAllBytes((Join-Path $build '_GBECL.BIN'))
if ([Text.Encoding]::ASCII.GetString($effect, 0, 4) -ne 'GBEF' -or
    [BitConverter]::ToUInt16($effect, 4) -ne 9 -or
    [BitConverter]::ToUInt16($effect, 6) -ne 0x0021 -or
    [BitConverter]::ToUInt16($effect, 8) -ne 0 -or
    [BitConverter]::ToUInt16($effect, 10) -ne 18) {
  throw 'GBBOOT DQK Amiga GLIB flow did not emit the expected area-18 GBEF'
}

$dump = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0021 status=0000 geo=0012',
  'GBLF operands=0012 0001 D001',
  '#00 OP=2D CALL ARGC=02 ARGS= 0001 0001 CALL=operand:0001 routine:0001'
)) {
  if ($dump -notlike "*$needle*") {
    throw "GBBOOT DQK Amiga GLIB effect dump missing: $needle"
  }
}

Assert-RawFrame (Join-Path $build '_GBVIEW.RAW') 'GBBOOT DQK Amiga GLIB first-person preview'
if (Test-Path (Join-Path $build '_GBCOMB.RAW')) {
  throw 'GBBOOT DQK Amiga GLIB preview unexpectedly wrote tactical RAW'
}

Assert-DqkAmigaArea18GeoPayloadIsConsumed

Write-Output 'RESULT: GBBOOT DQK Amiga GLIB ECL/GEO native preview PASS'
