# GBBOOT Secret of the Silver Blades Amiga/WHDLoad GLIB ECL/GEO native preview flow.
#
# Optional local smoke that stages the original Secret Amiga GLIB ECL.GLB/GEO.GLB
# pair and proves the native Gen2 path can run CCECL -> CCGEO -> CCFP without
# converting the containers to DOS HLIB first.
param(
  [switch]$Headless,
  [string]$SecretPath = $env:GOLDBOX_SECRET_PATH
)

$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build 'gbsecret-glib-flow-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT Secret Amiga GLIB flow (DOSBox.exe absent)'
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
  Write-Output 'SKIP: GBBOOT Secret Amiga GLIB flow (set GOLDBOX_SECRET_PATH to run)'
  exit 0
}

$ecl = Join-Path $SecretPath 'DISK2\ECL.GLB'
$geo = Join-Path $SecretPath 'DISK2\GEO.GLB'
foreach ($path in @($ecl, $geo)) {
  if (-not (Test-Path $path)) {
    Write-Output "SKIP: GBBOOT Secret Amiga GLIB flow ($path absent)"
    exit 0
  }
  $magic = [Text.Encoding]::ASCII.GetString(([IO.File]::ReadAllBytes($path)[0..3]))
  if ($magic -ne 'GLIB') {
    Write-Output "SKIP: GBBOOT Secret Amiga GLIB flow ($path is not GLIB)"
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
New-Item -ItemType Directory -Force $run | Out-Null
Copy-Item $ecl (Join-Path $run 'ECL.GLB') -Force
Copy-Item $geo (Join-Path $run 'GEO.GLB') -Force

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

function Assert-SecretArea16EclPayloadIsConsumed {
  # The staged ECL id table resolves this route's area 16 to member 2.  Zero
  # only that member and require its emitted GBEF bridge to change or vanish;
  # a header mutation alone would only prove the container reader rejects data.
  $effectPath = Join-Path $build '_GBECL.BIN'
  if (-not (Test-Path $effectPath)) { throw 'GBBOOT Secret Amiga GLIB flow did not write _GBECL.BIN' }
  [byte[]]$baselineEffect = [IO.File]::ReadAllBytes($effectPath)
  $artifactPaths = @(
    $effectPath,
    (Join-Path $build '_GBECL.TXT'),
    (Join-Path $build '_GBWALL.BIN'),
    (Join-Path $build '_GBVIEW.RAW'),
    (Join-Path $build 'GBSECG.TXT')
  )
  $baselineArtifacts = @{}
  foreach ($artifact in $artifactPaths) {
    if (Test-Path $artifact) { $baselineArtifacts[$artifact] = [IO.File]::ReadAllBytes($artifact) }
  }
  $stagedEcl = Join-Path $run 'ECL.GLB'
  [byte[]]$container = [IO.File]::ReadAllBytes($stagedEcl)
  if ([Text.Encoding]::ASCII.GetString($container, 0, 4) -ne 'GLIB') {
    throw 'GBBOOT Secret staged ECL is not a GLIB container'
  }
  $pointerCount = (Read-U16BE $container 8) + 1
  if ($pointerCount -lt 3 -or $container.Length -lt (16 + (4 * $pointerCount))) {
    throw 'GBBOOT Secret staged ECL has an invalid GLIB pointer table'
  }
  $idStart = [int](Read-U32BE $container 16)
  $idEnd = [int](Read-U32BE $container 20)
  if ($idStart -lt 0 -or $idEnd -gt $container.Length -or $idEnd -lt ($idStart + 2)) {
    throw 'GBBOOT Secret staged ECL has an invalid GLIB id table'
  }
  $idCount = Read-U16BE $container $idStart
  $member = -1
  for ($i = 0; $i -lt $idCount; $i++) {
    $at = $idStart + 2 + (4 * $i)
    if (($at + 3) -ge $idEnd) { throw 'GBBOOT Secret staged ECL id table is truncated' }
    if ((Read-U16BE $container $at) -eq 16) {
      $member = Read-U16BE $container ($at + 2)
      break
    }
  }
  if ($member -lt 1 -or $member -ge ($pointerCount - 1)) {
    throw 'GBBOOT Secret staged ECL has no area-16 member pointer'
  }
  $payloadStart = [int](Read-U32BE $container (16 + (4 * $member)))
  $payloadEnd = [int](Read-U32BE $container (20 + (4 * $member)))
  if ($payloadStart -lt 0 -or $payloadEnd -gt $container.Length -or
      ($payloadEnd - $payloadStart) -lt 20) {
    throw 'GBBOOT Secret staged ECL area-16 member is not a valid Gen2 payload'
  }

  [byte[]]$mutatedContainer = $container.Clone()
  try {
    for ($i = $payloadStart; $i -lt $payloadEnd; $i++) { $mutatedContainer[$i] = 0 }
    [IO.File]::WriteAllBytes($stagedEcl, $mutatedContainer)
    Remove-Item $artifactPaths -Force -ErrorAction SilentlyContinue
    $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
    if (-not $p.WaitForExit(60000)) {
      Stop-DosBoxSmoke -Process $p
      throw 'GBBOOT Secret mutated ECL/GEO flow timed out'
    }
    $effectChanged = (-not (Test-Path $effectPath)) -or
      (-not [Linq.Enumerable]::SequenceEqual($baselineEffect, [IO.File]::ReadAllBytes($effectPath)))
    if (-not $effectChanged) {
      throw 'GBBOOT Secret area-16 ECL payload mutation left _GBECL.BIN unchanged'
    }
  } finally {
    [IO.File]::WriteAllBytes($stagedEcl, $container)
    foreach ($artifact in $artifactPaths) {
      if ($baselineArtifacts.ContainsKey($artifact)) {
        [IO.File]::WriteAllBytes($artifact, [byte[]]$baselineArtifacts[$artifact])
      } else {
        Remove-Item $artifact -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

$conf = Join-Path $build '_gbsecret_glib_flow_test.conf'
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
C:\GBBOOT /E /X /A 16 > C:\GBSECG.TXT
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
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build 'GBSECG.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'GBBOOT Secret Amiga GLIB flow timed out'
}

$out = Get-Content (Join-Path $build 'GBSECG.TXT') -Raw
foreach ($needle in @(
  'game:   Generic Gold Box HLIB/GLB data dump',
  'exec:   (native /E only)',
  'native: CCECL ECL.GLB entry 16 -> CCGEO /B GEO.GLB'
)) {
  if ($out -notlike "*$needle*") {
    throw "GBBOOT Secret Amiga GLIB output missing: $needle"
  }
}
if ($out -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT Secret Amiga GLIB native preview failed'
}

$effect = [IO.File]::ReadAllBytes((Join-Path $build '_GBECL.BIN'))
if ([Text.Encoding]::ASCII.GetString($effect, 0, 4) -ne 'GBEF' -or
    [BitConverter]::ToUInt16($effect, 4) -ne 9 -or
    [BitConverter]::ToUInt16($effect, 8) -ne 0 -or
    [BitConverter]::ToUInt16($effect, 10) -ne 16) {
  throw 'GBBOOT Secret Amiga GLIB flow did not emit the expected area-16 GBEF'
}

$dump = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009',
  'status=0000 geo=0010',
  'GBLF operands=0010'
)) {
  if ($dump -notlike "*$needle*") {
    throw "GBBOOT Secret Amiga GLIB effect dump missing: $needle"
  }
}

Assert-RawFrame (Join-Path $build '_GBVIEW.RAW') 'GBBOOT Secret Amiga GLIB first-person preview'
foreach ($name in @('_GBCOMB.RAW', '_GBCOMB.TRC', '_GBCOMB.OUT')) {
  if (Test-Path (Join-Path $build $name)) {
    throw "GBBOOT Secret Amiga GLIB preview unexpectedly wrote tactical sidecar $name"
  }
}

Assert-SecretArea16EclPayloadIsConsumed

Write-Output 'RESULT: GBBOOT Secret of the Silver Blades Amiga GLIB ECL/GEO native preview PASS'
