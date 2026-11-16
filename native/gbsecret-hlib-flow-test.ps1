# GBBOOT Secret of the Silver Blades real-data GLIB/HLIB raw-GEO preview flow.
#
# Optional local smoke for the Amiga/WHDLoad GLIB data dump. This pins real
# Secret GEO.GLB bytes through native CCGEO's GLIB/HLIB raw-map /E path without
# claiming Secret startup ECL semantics yet.
param(
  [switch]$Headless,
  [string]$SecretPath = $env:GOLDBOX_SECRET_PATH
)

$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build 'gbsecret-hlib-flow-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT Secret GLIB/HLIB flow (DOSBox.exe absent)'
  exit 0
}

if (-not $SecretPath) {
  $candidates = @(
    'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\SecretOfTheSilverBlades\data',
    'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\MyCollection\AD&D\SecretOfTheSilverBlades\data',
    'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDPacks\S\SecretOfTheSilverBlades\data'
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      $SecretPath = $candidate
      break
    }
  }
}

if (-not $SecretPath -or -not (Test-Path $SecretPath)) {
  Write-Output 'SKIP: GBBOOT Secret GLIB/HLIB flow (set GOLDBOX_SECRET_PATH to run)'
  exit 0
}

$geo = Join-Path $SecretPath 'DISK2\GEO.GLB'
if (-not (Test-Path $geo)) {
  Write-Output "SKIP: GBBOOT Secret GLIB/HLIB flow ($geo absent)"
  exit 0
}

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

New-Item -ItemType Directory -Force $run | Out-Null
$stagedGeo = Join-Path $run 'GEO.GLB'
$magic = [IO.File]::ReadAllBytes($geo)[0..3]
$magicText = [Text.Encoding]::ASCII.GetString($magic)
if ($magicText -eq 'GLIB' -or $magicText -eq 'HLIB') {
  Copy-Item $geo $stagedGeo -Force
} else {
  Write-Output "SKIP: GBBOOT Secret GLIB/HLIB flow ($geo is not GLIB/HLIB)"
  exit 0
}

function Assert-RawFrame([string]$Path, [string]$Label, [int]$MinColors = 3) {
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
  if ($nonZero -lt 1024 -or $colors.Count -lt $MinColors) {
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

function Assert-SecretRawGeoPayloadIsConsumed {
  # CCGEO raw mode enumerates GEO.GLB's map records, skipping member 0's
  # id-table record; map 0 is therefore member 1.  Corrupt only that 1024-byte
  # source payload and require the same /E run to produce different wall data.
  $wallPath = Join-Path $build '_GBWALL.BIN'
  if (-not (Test-Path $wallPath)) { throw 'GBBOOT Secret raw-GEO preview did not write _GBWALL.BIN' }
  [byte[]]$baselineWall = [IO.File]::ReadAllBytes($wallPath)
  [byte[]]$container = [IO.File]::ReadAllBytes($stagedGeo)
  if ([Text.Encoding]::ASCII.GetString($container[0..3]) -ne 'GLIB') {
    throw 'GBBOOT Secret staged GEO is not a GLIB container'
  }
  $memberCount = (Read-U16BE $container 8) + 1
  if ($memberCount -lt 3 -or $container.Length -lt (16 + (4 * $memberCount))) {
    throw 'GBBOOT Secret staged GEO has an invalid GLIB member table'
  }
  $payloadStart = [int](Read-U32BE $container 20)
  $payloadEnd = [int](Read-U32BE $container 24)
  if ($payloadStart -lt 0 -or $payloadEnd -gt $container.Length -or
      ($payloadEnd - $payloadStart) -ne 1024) {
    throw 'GBBOOT Secret staged GEO member 1 was not a 1024-byte raw map payload'
  }

  [byte[]]$mutatedContainer = $container.Clone()
  try {
    for ($i = $payloadStart; $i -lt $payloadEnd; $i++) { $mutatedContainer[$i] = 0 }
    [IO.File]::WriteAllBytes($stagedGeo, $mutatedContainer)
    Remove-Item $wallPath -Force -ErrorAction SilentlyContinue
    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
    if (-not $p.WaitForExit(60000)) {
      Stop-DosBoxSmoke -Process $p
      throw 'GBBOOT Secret mutated raw-GEO flow timed out'
    }
    if (-not (Test-Path $wallPath)) {
      throw 'GBBOOT Secret mutated raw-GEO flow did not write _GBWALL.BIN'
    }
    [byte[]]$mutantWall = [IO.File]::ReadAllBytes($wallPath)
    if ([Linq.Enumerable]::SequenceEqual($baselineWall, $mutantWall)) {
      throw 'GBBOOT Secret raw-GEO payload mutation left _GBWALL.BIN unchanged'
    }
  } finally {
    [IO.File]::WriteAllBytes($stagedGeo, $container)
    [IO.File]::WriteAllBytes($wallPath, $baselineWall)
  }
}

$conf = Join-Path $build '_gbsecret_hlib_flow_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X > C:\GBSECH.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

Remove-Item (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBWALL.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build 'GBSECH.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'GBBOOT Secret HLIB raw-GEO flow timed out'
}

$out = Get-Content (Join-Path $build 'GBSECH.TXT') -Raw
foreach ($needle in @(
  'game:   Generic Gold Box HLIB/GLB data dump',
  'exec:   (native /E only)',
  'native: CCGEO /B GEO.GLB map 0'
)) {
  if ($out -notlike "*$needle*") {
    throw "GBBOOT Secret HLIB output missing: $needle"
  }
}
if ($out -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT Secret HLIB native preview failed'
}

Assert-RawFrame (Join-Path $build '_GBVIEW.RAW') 'GBBOOT Secret GLIB/HLIB real-data GEO preview' 2
foreach ($name in @('_GBECL.BIN', '_GBECL.TXT', '_GBCOMB.TRC', '_GBCOMB.OUT', '_GBCOMB.RAW')) {
  if (Test-Path (Join-Path $build $name)) {
    throw "GBBOOT Secret GLIB/HLIB raw preview unexpectedly wrote tactical/ECL artifact $name"
  }
}

Assert-SecretRawGeoPayloadIsConsumed

Write-Output 'RESULT: GBBOOT Secret of the Silver Blades Amiga GLIB/HLIB real-data raw-GEO preview PASS'
