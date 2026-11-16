# GBBOOT DQK headless multi-step host-state flow.
#
# Area 5 is the first DQK overland/vmRun stress case: vmRun1 and
# SearchLocation must run on one persisted GBEF/GBRS memory image across
# repeated first-person steps. This smoke starts from a known open pose, walks
# three cells, and verifies the vmRun output and follow-up SearchLocation output
# preserve the same DQK host/runtime state.
param(
  [switch]$Headless
)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$source = Join-Path $root 'The Dark Queen of Krynn'
$run = Join-Path $build 'gbdqk-multistep-flow-test'
$dosbox = Join-Path $source 'DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT DQK multi-step flow (DOSBox.exe absent)'
  exit 0
}

foreach ($name in @(
  'DQK.EXE',
  'SAVGAMA.QSV',
  'DISK2\8X8DB.TLB',
  'DISK2\8X8DC.TLB',
  'DISK3\ECL.GLB',
  'DISK3\GEO.GLB'
)) {
  if (-not (Test-Path (Join-Path $source $name))) {
    Write-Output "SKIP: GBBOOT DQK multi-step flow ($name absent)"
    exit 0
  }
}

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

function Set-Session([int]$x, [int]$y, [int]$facing, [int]$w, [int]$h) {
  $s = New-Object byte[] 16
  [Text.Encoding]::ASCII.GetBytes('GBSN').CopyTo($s, 0)
  [BitConverter]::GetBytes([uint16]1).CopyTo($s, 4)
  [BitConverter]::GetBytes([uint16]$x).CopyTo($s, 6)
  [BitConverter]::GetBytes([uint16]$y).CopyTo($s, 8)
  [BitConverter]::GetBytes([uint16]$facing).CopyTo($s, 10)
  [BitConverter]::GetBytes([uint16]$w).CopyTo($s, 12)
  [BitConverter]::GetBytes([uint16]$h).CopyTo($s, 14)
  [IO.File]::WriteAllBytes((Join-Path $build '_GBSESS.GBS'), $s)
}

function Assert-Contains([string]$Text, [string]$Needle, [string]$Context) {
  if ($Text -notlike "*$Needle*") {
    throw "$Context missing: $Needle"
  }
}

function Invoke-DqkSpecialStep {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$Tag,
    [Parameter(Mandatory)][int]$StartX,
    [Parameter(Mandatory)][int]$StartY,
    [Parameter(Mandatory)][int]$ExpectedX,
    [Parameter(Mandatory)][int]$ExpectedY,
    [Parameter(Mandatory)][array]$Needles,
    # The GBST destination (ExpectedX/Y) and the party position the vmRun dump
    # reports afterwards are NOT the same quantity: the step lands the party on
    # the trigger cell, then the ECL event that fires there may move it again.
    # They coincided for every case this helper had when it was written, so one
    # pair of parameters served both, and FISHER -- where the fisherman sails
    # the party onward -- silently required them to be equal. Default to the
    # step destination, but let a caller name the post-event position.
    [int]$ExpectedMemX = -1,
    [int]$ExpectedMemY = -1
  )

  if ($ExpectedMemX -lt 0) { $ExpectedMemX = $ExpectedX }
  if ($ExpectedMemY -lt 0) { $ExpectedMemY = $ExpectedY }

  $conf = Join-Path $build "_gbdqk_${Name}_step_flow_test.conf"
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /T 1 /A 5 > C:\DQK${Tag}.TXT
C:\CCEFX C:\_GBEVT.BIN C:\DQK${Tag}E.TXT
C:\CCEFX C:\_GBECL.BIN C:\DQK${Tag}S.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

  Remove-Item (Join-Path $build '_GBSTEP.BIN'),
    (Join-Path $build '_GBEVT.BIN'),
    (Join-Path $build '_GBECL.BIN'),
    (Join-Path $build '_GBCOMB.TRC'),
    (Join-Path $build '_GBCOMB.OUT'),
    (Join-Path $build '_GBCOMB.RAW'),
    (Join-Path $build '_GBCR.BIN'),
    (Join-Path $build "DQK${Tag}.TXT"),
    (Join-Path $build "DQK${Tag}E.TXT"),
    (Join-Path $build "DQK${Tag}S.TXT") -Force -ErrorAction SilentlyContinue

  Set-Session $StartX $StartY 0 10 10
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
  if (-not $p.WaitForExit(60000)) {
    Stop-Process -Id $p.Id -Force
    throw "GBBOOT DQK $Name special-step flow timed out"
  }

  $step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
  if ([Text.Encoding]::ASCII.GetString($step, 0, 4) -ne 'GBST' -or
      [BitConverter]::ToUInt16($step, 8) -ne $ExpectedX -or
      [BitConverter]::ToUInt16($step, 10) -ne $ExpectedY -or
      [BitConverter]::ToUInt16($step, 12) -ne 0) {
    throw "GBBOOT DQK $Name special-step flow did not persist the expected GBST destination"
  }

  $evt = Get-Content (Join-Path $build "DQK${Tag}E.TXT") -Raw
  foreach ($needle in @(
    'GBEF v0009 flags=0020 status=0000 geo=FFFF',
    'GBRS flags=0000 area=0005',
    'MEM key=0011 value=0000',
    'MEM key=001B value=0005',
    ("MEM key=0111 value={0:X4}" -f $ExpectedMemX),
    ("MEM key=0112 value={0:X4}" -f $ExpectedMemY)
  )) {
    Assert-Contains $evt $needle "GBBOOT DQK $Name vmRun dump"
  }
  foreach ($needle in $Needles) {
    Assert-Contains $evt $needle "GBBOOT DQK $Name vmRun dump"
  }

  $ecl = Get-Content (Join-Path $build "DQK${Tag}S.TXT") -Raw
  foreach ($needle in @(
    'GBEF v0009',
    'status=0000 geo=FFFF',
    'GBRS flags=0000'
  )) {
    Assert-Contains $ecl $needle "GBBOOT DQK $Name SearchLocation dump"
  }
  if ($ecl -like '*status=0003*' -or $ecl -like '*GBEC groups=*') {
    throw "GBBOOT DQK $Name special-step SearchLocation unexpectedly yielded tactical combat"
  }

  foreach ($name in @('_GBCOMB.TRC', '_GBCOMB.OUT', '_GBCOMB.RAW', '_GBCR.BIN')) {
    if (Test-Path (Join-Path $build $name)) {
      throw "GBBOOT DQK $Name special-step flow unexpectedly wrote $name"
    }
  }
}

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
foreach ($dir in @('DISK2', 'DISK3')) {
  New-Item -ItemType Directory -Force (Join-Path $run $dir) | Out-Null
}
foreach ($name in @(
  'DQK.EXE',
  'SAVGAMA.QSV',
  'DISK2\8X8DB.TLB',
  'DISK2\8X8DC.TLB',
  'DISK3\ECL.GLB',
  'DISK3\GEO.GLB'
)) {
  Copy-Item (Join-Path $source $name) (Join-Path $run $name) -Force
}

$conf = Join-Path $build '_gbdqk_multistep_flow_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /T 3 /A 5 > C:\DQK5STEP.TXT
C:\CCEFX C:\_GBEVT.BIN C:\DQK5EVT.TXT
C:\CCEFX C:\_GBECL.BIN C:\DQK5ECL.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

Remove-Item (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBWALL.BIN'),
  (Join-Path $build '_GBWSET.GBW'),
  (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBEVT.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build 'DQK5STEP.TXT'),
  (Join-Path $build 'DQK5EVT.TXT'),
  (Join-Path $build 'DQK5ECL.TXT') -Force -ErrorAction SilentlyContinue

# Area 5 is a 10x10 WGRD. Row 0 is open eastward from x=0 through x=3.
Set-Session 0 0 2 10 10
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT DQK multi-step flow timed out'
}

# GBPS word 4 is the sidecar's FORMAT revision, not a party property. GBBOOT
# picks it append-only in write_seed_file (native/src/gbboot.asm, the
# "mov word [seed_version], 1/2/3" block): 1 = the 150-byte base record,
# 2 = base + the thief-skill matrix chunk, 3 = + the memory-seed chunk. The
# retail DQK SAVGAMA.QSV party this flow loads contains a thief, so a
# thief-matrix chunk is appended and the record is necessarily v2/216 bytes.
# This test shipped in 23ba497 pinning v1 and has therefore never passed; the
# pin was wrong on the day it was written, not stale. Assert the version
# against the thing that JUSTIFIES it -- length and a populated thief matrix --
# so a version that stops matching its own payload still fails here.
$seed = [IO.File]::ReadAllBytes((Join-Path $build '_GBSEED.BIN'))
if ([Text.Encoding]::ASCII.GetString($seed, 0, 4) -ne 'GBPS' -or
    ([BitConverter]::ToUInt16($seed, 6) -band 1) -eq 0 -or
    [BitConverter]::ToUInt16($seed, 8) -ne 6) {
  throw 'GBBOOT DQK multi-step flow did not load the six-member QSV party count into GBPS'
}
if ([BitConverter]::ToUInt16($seed, 4) -ne 2 -or
    $seed.Length -ne 216 -or
    $seed[150] -ne 1 -or
    $seed[151] -ne 0) {
  throw ("GBBOOT DQK multi-step flow did not write a v2 GBPS thief-matrix sidecar " +
    "(version=$([BitConverter]::ToUInt16($seed, 4)) length=$($seed.Length) " +
    "thiefRows=$($seed[150]))")
}
if (($seed[152..159] | Where-Object { $_ -ne 0 }).Count -eq 0) {
  throw 'GBBOOT DQK multi-step flow wrote an all-zero GBPS thief-skill row'
}

$wall = [IO.File]::ReadAllBytes((Join-Path $build '_GBWALL.BIN'))
if ($wall.Length -ne 606 -or
    [Text.Encoding]::ASCII.GetString($wall, 0, 4) -ne 'WGRD' -or
    $wall[4] -ne 10 -or $wall[5] -ne 10) {
  throw 'GBBOOT DQK multi-step flow did not create the expected area-5 10x10 WGRD bridge'
}

$session = [IO.File]::ReadAllBytes((Join-Path $build '_GBSESS.GBS'))
$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
if ([BitConverter]::ToUInt16($session, 6) -ne 3 -or
    [BitConverter]::ToUInt16($session, 8) -ne 0 -or
    [BitConverter]::ToUInt16($session, 10) -ne 2 -or
    [BitConverter]::ToUInt16($session, 12) -ne 10 -or
    [BitConverter]::ToUInt16($session, 14) -ne 10 -or
    [BitConverter]::ToUInt16($step, 6) -ne 128 -or
    [BitConverter]::ToUInt16($step, 8) -ne 3 -or
    [BitConverter]::ToUInt16($step, 10) -ne 0 -or
    [BitConverter]::ToUInt16($step, 12) -ne 2) {
  throw 'GBBOOT DQK multi-step flow did not preserve the expected GBSN/GBST pose after three steps'
}

$evt = Get-Content (Join-Path $build 'DQK5EVT.TXT') -Raw
$ecl = Get-Content (Join-Path $build 'DQK5ECL.TXT') -Raw
foreach ($dump in @($evt, $ecl)) {
  foreach ($needle in @(
    'GBEF v0009 flags=0000 status=0000 geo=FFFF',
    'GBRS flags=0000 area=0005',
    'MEM key=0011 value=0001',
    'MEM key=001B value=0005',
    'MEM key=0034 value=0003',
    'MEM key=0035 value=0009',
    'MEM key=0097 value=0000',
    'MEM key=009C value=0000',
    'GBSX count=0000',
    'GBCL clock= 0000 0000 0000 0000 0000 0000 0000'
  )) {
    if ($dump -notlike "*$needle*") {
      throw "GBBOOT DQK multi-step dump missing: $needle"
    }
  }
}

# The ship gate refuses the crossing, so the party stays where the step put it
# and the script emits exactly one event. GBSX count is pinned because it is the
# cheap check that the operand stream did not desync: an over-long operand frame
# swallows following opcodes and shortens this number.
Invoke-DqkSpecialStep 'SHIPGATE' 'SG' 3 3 3 2 @(
  'MEM key=00CA value=000D',
  'GBSX count=0001',
  'TEXT=YOU NEED A SHIP TO TRAVEL ON THE'
)

# FISHER is the case where the step destination and the post-event party
# position genuinely differ: the step lands on (5,4), then the fisherman sails
# the party on to (5,3), which is why ExpectedMemY is passed separately.
#
# These three needles changed on 2026-07-28 in commit e3ce79f, and the direction
# matters. This test was committed on 2026-07-15 pinning
#   GBSX count=0002
#   #01 OP=22 PARTY_SURPRISE ARGC=03 ARGS= 0009 00FF 0001
#   MEM key=0112 value=0004      (party never left the step cell)
# and a build of the engine at that commit does emit exactly that -- verified by
# rebuilding 23ba497 and running this flow against it. But that output was the
# ECL stream running off its own rails: e3ce79f made 0x22 PARTY_SURPRISE a
# zero-operand frame in area 5 (get_operand_meta, native/src/ccecl.asm), and
# with the operand counts corrected the third event now executes and the party
# actually sails. So these are not "the engine changed and we followed it" --
# the old pins recorded a truncated script, and the new ones record a complete
# one. The GBSX count going 2 -> 3 and the appearance of #02 are the evidence.
Invoke-DqkSpecialStep 'FISHER' 'FS' 5 5 5 4 @(
  'MEM key=00CA value=000C',
  'GBSX count=0003',
  'TEXT=A FISHERMAN VOLUNTEERS TO SAIL Y',
  '#01 OP=22 PARTY_SURPRISE ARGC=00',
  '#02 OP=12 PRINTCLEAR ARGC=01 ARGS= 0015 TEXT=YOU SAIL ACROSS THE STRAITS.'
) -ExpectedMemX 5 -ExpectedMemY 3

Write-Output 'RESULT: GBBOOT DQK /A 5 three-step persistence plus ship-gate/fisherman vmRun special-position flows PASS'
