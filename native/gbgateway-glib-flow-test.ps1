# GBBOOT Gateway to the Savage Frontier real-data GLIB ECL/GEO preview flow.
#
# Optional local smoke for the Amiga/WHDLoad GLIB data dump. This pins real
# Gateway ECL.glb + Geo.glb bytes through native CCECL -> CCGEO -> CCFP without
# converting the containers to DOS HLIB first.
param(
  [switch]$Headless,
  [string]$GatewayPath = $env:GOLDBOX_GATEWAY_PATH
)

$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build 'gbgateway-glib-flow-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT Gateway GLIB/HLIB flow (DOSBox.exe absent)'
  exit 0
}

if (-not $GatewayPath) {
  $candidates = @(
    'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\GatewayToSavageFrontier\data',
    'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\MyCollection\AD&D\GatewayToSavageFrontier\data',
    'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDPacks\G\GatewayToSavageFrontier\data'
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      $GatewayPath = $candidate
      break
    }
  }
}

if (-not $GatewayPath -or -not (Test-Path $GatewayPath)) {
  Write-Output 'SKIP: GBBOOT Gateway GLIB/HLIB flow (set GOLDBOX_GATEWAY_PATH to run)'
  exit 0
}

$ecl = Join-Path $GatewayPath 'DiskC\ECL.glb'
$geo = Join-Path $GatewayPath 'DiskC\Geo.glb'
foreach ($path in @($ecl, $geo)) {
  if (-not (Test-Path $path)) {
    Write-Output "SKIP: GBBOOT Gateway GLIB/HLIB flow ($path absent)"
    exit 0
  }
  $magicText = [Text.Encoding]::ASCII.GetString(([IO.File]::ReadAllBytes($path)[0..3]))
  if ($magicText -ne 'GLIB' -and $magicText -ne 'HLIB') {
    Write-Output "SKIP: GBBOOT Gateway GLIB/HLIB flow ($path is not GLIB/HLIB)"
    exit 0
  }
}

if (Test-Path $run) {
  $resolvedRun = [IO.Path]::GetFullPath($run)
  $resolvedBuild = [IO.Path]::GetFullPath($build)
  if (-not $resolvedRun.StartsWith($resolvedBuild, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove unexpected test directory: $resolvedRun"
  }
  Remove-Item -Recurse -Force $run
}
New-Item -ItemType Directory -Force $run | Out-Null
Copy-Item $ecl (Join-Path $run 'ECL.GLB') -Force
Copy-Item $geo (Join-Path $run 'GEO.GLB') -Force

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

if (-not (Test-Path (Join-Path $run 'ECL.GLB')) -or -not (Test-Path (Join-Path $run 'GEO.GLB'))) {
  Write-Output 'SKIP: GBBOOT Gateway GLIB/HLIB flow (staging failed)'
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

$conf = Join-Path $build '_gbgateway_glib_flow_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X /A 1 > C:\GBGATE.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

Remove-Item (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBWALL.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build 'GBGATE.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'GBBOOT Gateway GLIB ECL/GEO flow timed out'
}

$out = Get-Content (Join-Path $build 'GBGATE.TXT') -Raw
foreach ($needle in @(
  'game:   Generic Gold Box HLIB/GLB data dump',
  'exec:   (native /E only)',
  'native: CCECL ECL.GLB entry 1 -> CCGEO /B GEO.GLB'
)) {
  if ($out -notlike "*$needle*") {
    throw "GBBOOT Gateway GLIB output missing: $needle"
  }
}
if ($out -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT Gateway GLIB native preview failed'
}

$effect = [IO.File]::ReadAllBytes((Join-Path $build '_GBECL.BIN'))
if ([Text.Encoding]::ASCII.GetString($effect, 0, 4) -ne 'GBEF' -or
    [BitConverter]::ToUInt16($effect, 4) -ne 9 -or
    [BitConverter]::ToUInt16($effect, 6) -ne 0x0001 -or
    [BitConverter]::ToUInt16($effect, 8) -ne 0 -or
    [BitConverter]::ToUInt16($effect, 10) -ne 1) {
  throw 'GBBOOT Gateway GLIB flow did not emit the expected area-1 GBEF'
}

$dump = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0001 status=0000 geo=0001',
  'GBLF operands=0001'
)) {
  if ($dump -notlike "*$needle*") {
    throw "GBBOOT Gateway GLIB effect dump missing: $needle"
  }
}

Assert-RawFrame (Join-Path $build '_GBVIEW.RAW') 'GBBOOT Gateway GLIB/HLIB real-data ECL/GEO preview' 2
foreach ($name in @('_GBCOMB.TRC', '_GBCOMB.OUT', '_GBCOMB.RAW')) {
  if (Test-Path (Join-Path $build $name)) {
    throw "GBBOOT Gateway GLIB/HLIB preview unexpectedly wrote tactical artifact $name"
  }
}

# Prove this route consumes the selected Gateway GEO payload.  A header smash
# makes the process fail, but that only proves the container reader exists.
# Area 1 maps to a 1024-byte GLIB GEO member through ptr[0]'s big-endian id
# table.  Mutate that exact staged member, rerun the same /A 1 path, and require
# its WGRD bridge to change.  The read-only WHDLoad source is never modified.
function Read-U16BE([byte[]]$Bytes, [int]$Offset) {
  return (($Bytes[$Offset] -shl 8) -bor $Bytes[$Offset + 1])
}
function Read-U32BE([byte[]]$Bytes, [int]$Offset) {
  return (([uint32]$Bytes[$Offset] -shl 24) -bor ([uint32]$Bytes[$Offset + 1] -shl 16) -bor ([uint32]$Bytes[$Offset + 2] -shl 8) -bor [uint32]$Bytes[$Offset + 3])
}
function Assert-GatewayAreaOnePayloadIsConsumed {
  $wallPath = Join-Path $build '_GBWALL.BIN'
  if (-not (Test-Path $wallPath)) { throw 'GBBOOT Gateway GLIB flow did not write _GBWALL.BIN' }
  [byte[]]$baselineWall = [IO.File]::ReadAllBytes($wallPath)
  [byte[]]$container = [IO.File]::ReadAllBytes((Join-Path $run 'GEO.GLB'))
  if ([Text.Encoding]::ASCII.GetString($container, 0, 4) -ne 'GLIB') { throw 'Gateway staged GEO lost GLIB magic before mutation' }
  $count = (Read-U16BE $container 8) + 1
  if ($count -lt 3 -or $container.Length -lt (16 + 4 * $count)) { throw 'Gateway staged GEO has an invalid GLIB pointer table' }
  [uint32[]]$ptrs = @(for ($i = 0; $i -lt $count; $i++) { Read-U32BE $container (16 + 4 * $i) })
  $idStart = [int]$ptrs[0]; $idEnd = [int]$ptrs[1]
  if ($idStart -lt 0 -or $idEnd -gt $container.Length -or $idEnd -lt ($idStart + 2)) { throw 'Gateway staged GEO has an invalid id table range' }
  $idCount = Read-U16BE $container $idStart
  $member = -1
  for ($i = 0; $i -lt $idCount; $i++) {
    $at = $idStart + 2 + 4 * $i
    if (($at + 3) -ge $idEnd) { throw 'Gateway staged GEO id table is truncated' }
    if ((Read-U16BE $container $at) -eq 1) { $member = Read-U16BE $container ($at + 2); break }
  }
  if ($member -lt 1 -or $member -ge ($count - 1)) { throw 'Gateway staged GEO has no area-1 member pointer' }
  $start = [int]$ptrs[$member]; $end = [int]$ptrs[$member + 1]
  if ($start -lt 0 -or $end -gt $container.Length -or ($end - $start) -ne 1024) { throw 'Gateway area-1 GLIB member was not a 1024-byte raw GEO map' }
  [byte[]]$original = [byte[]]$container.Clone()
  try {
    for ($i = $start; $i -lt $end; $i++) { $container[$i] = 0 }
    [IO.File]::WriteAllBytes((Join-Path $run 'GEO.GLB'), $container)
    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
    if (-not $p.WaitForExit(60000)) {
      Stop-DosBoxSmoke -Process $p
      throw 'GBBOOT Gateway GLIB payload mutation timed out'
    }
    [byte[]]$mutantWall = [IO.File]::ReadAllBytes($wallPath)
    if ([Linq.Enumerable]::SequenceEqual($baselineWall, $mutantWall)) {
      throw 'GBBOOT Gateway GLIB area-1 payload mutation left _GBWALL.BIN unchanged'
    }
  } finally {
    [IO.File]::WriteAllBytes((Join-Path $run 'GEO.GLB'), $original)
    [IO.File]::WriteAllBytes($wallPath, $baselineWall)
  }
}
Assert-GatewayAreaOnePayloadIsConsumed

Write-Output 'RESULT: GBBOOT Gateway to the Savage Frontier Amiga GLIB/HLIB real-data ECL/GEO preview PASS'
