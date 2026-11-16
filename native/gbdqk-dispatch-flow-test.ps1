# GBBOOT DQK headless VM-dispatch flow smoke.
#
# Promotes representative DQK /A dispatch-only entries out of the broad
# gbboot-test.ps1 engine-smoke bucket. These entries are useful because they
# exercise native HLIB ECL dispatch, GBWS wall bridging, and GBSX host-event
# preservation without entering the dungeon step loop or tactical combat.
param(
  [switch]$Headless
)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$source = Join-Path $root 'The Dark Queen of Krynn'
$run = Join-Path $build 'gbdqk-dispatch-flow-test'
$dosbox = Join-Path $source 'DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT DQK dispatch flow (DOSBox.exe absent)'
  exit 0
}

foreach ($name in @(
  'DQK.EXE',
  'DISK2\8X8DB.TLB',
  'DISK2\8X8DC.TLB',
  'DISK3\ECL.GLB',
  'DISK3\GEO.GLB'
)) {
  if (-not (Test-Path (Join-Path $source $name))) {
    Write-Output "SKIP: GBBOOT DQK dispatch flow ($name absent)"
    exit 0
  }
}

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

function Assert-Contains([string]$Text, [string]$Needle, [string]$Context) {
  if ($Text -notlike "*$Needle*") {
    throw "$Context missing: $Needle"
  }
}

function Assert-Wgrd([string]$Path, [int]$ExpectedW, [int]$ExpectedH, [string]$Label) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 6 -or
      [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne 'WGRD' -or
      $bytes[4] -ne $ExpectedW -or
      $bytes[5] -ne $ExpectedH) {
    throw "$Label did not write the expected ${ExpectedW}x${ExpectedH} WGRD bridge"
  }
}

function Assert-Gbws([string]$Path, [string]$Label) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -lt 12 -or
      [Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne 'GBWS' -or
      [BitConverter]::ToUInt16($bytes, 4) -ne 2 -or
      [BitConverter]::ToUInt16($bytes, 8) -eq 0) {
    throw "$Label did not write a valid GBWS wall bundle"
  }
}

function Assert-Mode13Raw([string]$Path, [string]$Label) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  if ($bytes.Length -ne (4 + (320 * 200) + 768) -or
      [BitConverter]::ToUInt16($bytes, 0) -ne 320 -or
      [BitConverter]::ToUInt16($bytes, 2) -ne 200) {
    throw "$Label did not write a valid 320x200 first-person snapshot"
  }
  $seen = New-Object bool[] 256
  $nonzero = 0
  $colors = 0
  for ($i = 4; $i -lt (4 + (320 * 200)); $i++) {
    $px = $bytes[$i]
    if ($px -ne 0) {
      $nonzero++
    }
    if (-not $seen[$px]) {
      $seen[$px] = $true
      $colors++
    }
  }
  if ($nonzero -lt 1000 -or $colors -lt 4) {
    throw "$Label wrote a blank or low-detail first-person snapshot (nonzero=$nonzero colors=$colors)"
  }
}

function Invoke-DqkDispatchEntry {
  param(
    [Parameter(Mandatory)][string]$Tag,
    [Parameter(Mandatory)][int]$Entry,
    [Parameter(Mandatory)][int]$ExpectedGeo,
    [Parameter(Mandatory)][int]$ExpectedWallW,
    [Parameter(Mandatory)][int]$ExpectedWallH,
    [Parameter(Mandatory)][string[]]$Needles
  )

  $conf = Join-Path $build "_gbdqk_dispatch_${Tag}_flow_test.conf"
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
C:\GBBOOT /E /X /A $Entry > C:\DQK${Tag}.TXT
C:\CCEFX C:\_GBECL.BIN C:\DQK${Tag}E.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

  Remove-Item (Join-Path $build '_GBSEED.BIN'),
    (Join-Path $build '_GBPARTY.GBP'),
    (Join-Path $build '_GBWALL.BIN'),
    (Join-Path $build '_GBWSET.GBW'),
    (Join-Path $build '_GBVIEW.RAW'),
    (Join-Path $build '_GBECL.BIN'),
    (Join-Path $build '_GBECL.TXT'),
    (Join-Path $build '_GBCOMB.TRC'),
    (Join-Path $build '_GBCOMB.OUT'),
    (Join-Path $build '_GBCOMB.RAW'),
    (Join-Path $build '_GBCR.BIN'),
    (Join-Path $build "DQK${Tag}.TXT"),
    (Join-Path $build "DQK${Tag}E.TXT") -Force -ErrorAction SilentlyContinue

  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
  if (-not $p.WaitForExit(60000)) {
    try { Stop-Process -Id $p.Id -Force } catch {}
    throw "GBBOOT DQK /A $Entry dispatch flow timed out"
  }

  Assert-Wgrd (Join-Path $build '_GBWALL.BIN') $ExpectedWallW $ExpectedWallH "GBBOOT DQK /A $Entry dispatch flow"
  Assert-Gbws (Join-Path $build '_GBWSET.GBW') "GBBOOT DQK /A $Entry dispatch flow"
  Assert-Mode13Raw (Join-Path $build '_GBVIEW.RAW') "GBBOOT DQK /A $Entry dispatch flow"

  $effect = [IO.File]::ReadAllBytes((Join-Path $build '_GBECL.BIN'))
  if ($effect.Length -lt 12 -or
      [Text.Encoding]::ASCII.GetString($effect, 0, 4) -ne 'GBEF' -or
      [BitConverter]::ToUInt16($effect, 4) -ne 9 -or
      [BitConverter]::ToUInt16($effect, 8) -ne 0 -or
      [BitConverter]::ToUInt16($effect, 10) -ne $ExpectedGeo) {
    throw "GBBOOT DQK /A $Entry dispatch flow did not emit the expected GBEF"
  }

  $dump = Get-Content (Join-Path $build "DQK${Tag}E.TXT") -Raw
  foreach ($needle in $Needles) {
    Assert-Contains $dump $needle "GBBOOT DQK /A $Entry dispatch dump"
  }

  foreach ($name in @('_GBCOMB.TRC', '_GBCOMB.OUT', '_GBCOMB.RAW', '_GBCR.BIN')) {
    if (Test-Path (Join-Path $build $name)) {
      throw "GBBOOT DQK /A $Entry dispatch flow unexpectedly wrote $name"
    }
  }
}

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
foreach ($dir in @('DISK2', 'DISK3')) {
  New-Item -ItemType Directory -Force (Join-Path $run $dir) | Out-Null
}
foreach ($name in @(
  'DQK.EXE',
  'DISK2\8X8DB.TLB',
  'DISK2\8X8DC.TLB',
  'DISK3\ECL.GLB',
  'DISK3\GEO.GLB'
)) {
  Copy-Item (Join-Path $source $name) (Join-Path $run $name) -Force
}

Invoke-DqkDispatchEntry 'A22' 22 22 27 24 @(
  'GBEF v0009 flags=0021 status=0000 geo=0016',
  'GBLF operands=0016 0001 D001',
  'GBSX count=0005',
  '#00 OP=0E PICTURE ARGC=01 ARGS= 0089',
  '#03 OP=22 PARTY_SURPRISE ARGC=00',
  '#04 OP=2D CALL ARGC=02 ARGS= 0001 0001'
)

Invoke-DqkDispatchEntry 'A30' 30 30 28 28 @(
  'GBEF v0009 flags=0021 status=0000 geo=001E',
  'GBLF operands=001E 0001 D001',
  'GBSX count=0005',
  '#00 OP=2D CALL ARGC=02 ARGS= 0001 0001',
  '#01 OP=12 PRINTCLEAR ARGC=01 ARGS= 003C',
  '#02 OP=11 PRINT ARGC=01 ARGS= 0401',
  '#03 OP=11 PRINT ARGC=01 ARGS= 0024',
  '#04 OP=2D CALL ARGC=02 ARGS= 0001 0001'
)

Invoke-DqkDispatchEntry 'A38' 38 38 20 39 @(
  'GBEF v0009 flags=0021 status=0000 geo=0026',
  'GBLF operands=0026 0001 D001',
  'GBSX count=000B',
  '#00 OP=2D CALL ARGC=02 ARGS= 0001 0001',
  '#01 OP=2C PARLAY ARGC=01 ARGS= 000B',
  '#02 OP=3A DELAY ARGC=00',
  '#0A OP=2C PARLAY ARGC=01 ARGS= 000B'
)

Invoke-DqkDispatchEntry 'A50' 50 50 28 28 @(
  'GBEF v0009 flags=0021 status=0000 geo=0032',
  'GBLF operands=0032 0004 D004',
  'GBSX count=000D',
  '#00 OP=2D CALL ARGC=02 ARGS= 0001 0001',
  '#01 OP=2C PARLAY ARGC=01 ARGS= 000B',
  '#02 OP=2D CALL ARGC=02 ARGS= 0002 0002',
  '#04 OP=3A DELAY ARGC=00',
  '#09 OP=2C PARLAY ARGC=01 ARGS= 000B',
  '#0C OP=3A DELAY ARGC=00'
)

Write-Output 'RESULT: GBBOOT DQK /A 22, /A 30, /A 38, and /A 50 VM-dispatch host-event flow PASS'
