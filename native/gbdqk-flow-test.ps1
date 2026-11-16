# Real DQK GBBOOT flow smoke.
#
# Runs the original disk-layout DQK install through GBBOOT's native HLIB path.
# Area 18 is used because it exercises automatic QSV party-count loading, DQK
# ECL script-effect export, CCHLIB GBWS wall bundles, and CCFP GBWS rendering.
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'The Dark Queen of Krynn'
# Mount a scratch mirror, never the retail release itself: `mount D "$game"`
# followed by `D:` makes the read-only GOG folder the DOS child's current drive,
# so its stray writes (CCFP.MOV, rewritten SAVE\CHRDATA*) land in the retail
# tree. CLAUDE.md: game-data folders are read-only source.
. (Join-Path $PSScriptRoot 'retail-stage.ps1')
$dosbox = Join-Path $game 'DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT DQK /A 18 flow (DOSBox.exe absent)'
  exit 0
}

$required = @(
  'DQK.EXE',
  'SAVGAMA.QSV',
  'DISK2\8X8DB.TLB',
  'DISK2\8X8DC.TLB',
  'DISK3\ECL.GLB',
  'DISK3\GEO.GLB'
)
foreach ($name in $required) {
  if (-not (Test-Path (Join-Path $game $name))) {
    Write-Output "SKIP: GBBOOT DQK /A 18 flow ($name absent)"
    exit 0
  }
}

$gameMount = New-RetailStage -Source $game
& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

$conf = Join-Path $build '_gbdqk_flow_test.conf'
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
@echo off
mount C "$build"
mount D "$gameMount"
D:
C:\GBBOOT /E /X /A 18 > C:\GBDQK.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

Remove-Item (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBWALL.BIN'),
  (Join-Path $build '_GBWSET.GBW'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build 'GBDQK.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
if (-not $p.WaitForExit(60000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT DQK /A 18 flow timed out'
}

$seed = [IO.File]::ReadAllBytes((Join-Path $build '_GBSEED.BIN'))
# INSTRUMENT (2026-09-10): these four clauses used to be ONE short-circuiting
# `-or` chain throwing ONE message that named none of them. The script is FAIL in
# native/flow-status.json, so that single message was the only recorded evidence --
# and it identified no clause, which is why two independent analyses could not say
# what actually broke. Split verbatim: SAME fields, SAME offsets, SAME comparisons,
# SAME order, and each value is still read only after the preceding clause passed,
# so the short-circuit is preserved exactly. The split did its job: the failing
# clause was the VERSION word, never the party count the single pre-split message
# named.
#
# RESOLVED (2026-09-10): the version pin was wrong on the day it was written. The
# GBPS version word is a PAYLOAD-DEPENDENT capability tier chosen append-only by
# write_seed_file (native/src/gbboot.asm, the "mov word [seed_version], 1/2/3/4/5"
# block): 1 = the 150-byte base record (PS_V1_LEN), 2 = + the thief-matrix chunk
# (PS_V2_LEN = 150 + 2 + PARTY_THIEF_MAX*PARTY_THIEF_SKILL_COUNT = 216), 3 = +
# memory seeds, 4 = + owned-affect flags, 5 = + timers, and CCINV publishes 6 for
# CoK. This flow's measured seed is 216 bytes with a thief-matrix row count of 1 at
# offset 150 and a populated skill row at 152..159 -- exactly the v2 payload and
# nothing above it, since the length alone rules out v3/v4/v5 (their chunks would
# push it to 282 or beyond). So the version is asserted against the payload that
# JUSTIFIES it -- length, matrix row count, and a non-zero row -- and a version that
# stops matching its own payload still fails here. Each clause stays a self-naming
# throw; do not fold these back into an `-or` chain.
$seedMagic = [Text.Encoding]::ASCII.GetString($seed, 0, 4)
if ($seedMagic -ne 'GBPS') {
  throw "GBBOOT DQK flow seed magic wrong: expected 'GBPS', got '$seedMagic' (_GBSEED.BIN offset 0, len $($seed.Length))"
}
$seedVersion = [BitConverter]::ToUInt16($seed, 4)
if ($seedVersion -ne 2) {
  throw "GBBOOT DQK flow GBPS version wrong: expected version 2, got $seedVersion (offset 4)"
}
if ($seed.Length -ne 216) {
  throw "GBBOOT DQK flow GBPS record is not a v2 sidecar: expected length 216 (PS_V2_LEN), got $($seed.Length)"
}
if ($seed[150] -ne 1) {
  throw "GBBOOT DQK flow GBPS thief-matrix row count wrong: expected 1, got $($seed[150]) (offset 150)"
}
if ($seed[151] -ne 0) {
  throw "GBBOOT DQK flow GBPS thief-matrix reserved byte wrong: expected 0, got $($seed[151]) (offset 151)"
}
if (($seed[152..159] | Where-Object { $_ -ne 0 }).Count -eq 0) {
  throw 'GBBOOT DQK flow wrote an all-zero GBPS thief-skill row 0 (offsets 152..159), so nothing justifies version 2'
}
$seedFlags = [BitConverter]::ToUInt16($seed, 6)
if (($seedFlags -band 1) -eq 0) {
  throw ("GBBOOT DQK flow GBPS flags bit 0 clear: expected bit 0 set, got flags=0x{0:X4} (offset 6)" -f $seedFlags)
}
$seedCount = [BitConverter]::ToUInt16($seed, 8)
if ($seedCount -ne 6) {
  throw "GBBOOT DQK flow did not load the expected six-member GBPS seed: expected count 6, got $seedCount (offset 8)"
}

$wall = [IO.File]::ReadAllBytes((Join-Path $build '_GBWALL.BIN'))
if ($wall.Length -lt 6 -or [Text.Encoding]::ASCII.GetString($wall, 0, 4) -ne 'WGRD' -or
    $wall[4] -ne 16 -or $wall[5] -ne 11) {
  throw 'GBBOOT DQK flow did not create the expected 16x11 wall bridge'
}

$gbw = [IO.File]::ReadAllBytes((Join-Path $build '_GBWSET.GBW'))
if ($gbw.Length -lt 12 -or [Text.Encoding]::ASCII.GetString($gbw, 0, 4) -ne 'GBWS' -or
    [BitConverter]::ToUInt16($gbw, 4) -ne 2 -or
    [BitConverter]::ToUInt16($gbw, 8) -eq 0) {
  throw 'GBBOOT DQK flow did not create a valid GBWS wall bundle'
}

$view = [IO.File]::ReadAllBytes((Join-Path $build '_GBVIEW.RAW'))
if ([BitConverter]::ToUInt16($view, 0) -ne 320 -or [BitConverter]::ToUInt16($view, 2) -ne 200) {
  throw 'GBBOOT DQK flow did not write a 320x200 first-person snapshot'
}
$nonZero = 0
$colors = @{}
for ($i = 4; $i -lt (4 + (320 * 200)); $i++) {
  $pix = [int]$view[$i]
  if ($pix -ne 0) { $nonZero++ }
  $colors[$pix] = $true
}
if ($nonZero -lt 4096 -or $colors.Count -lt 4) {
  throw 'GBBOOT DQK flow produced an implausibly blank GBWS-rendered frame'
}

$effect = [IO.File]::ReadAllBytes((Join-Path $build '_GBECL.BIN'))
if ([Text.Encoding]::ASCII.GetString($effect, 0, 4) -ne 'GBEF' -or
    [BitConverter]::ToUInt16($effect, 4) -ne 9 -or
    [BitConverter]::ToUInt16($effect, 6) -ne 0x0021 -or
    [BitConverter]::ToUInt16($effect, 8) -ne 0 -or
    [BitConverter]::ToUInt16($effect, 10) -ne 18) {
  throw 'GBBOOT DQK flow did not emit the expected area-18 GBEF'
}

$dump = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0021 status=0000 geo=0012',
  'GBLF operands=0012 0001 D001',
  'GBSX count=0001',
  '#00 OP=2D CALL ARGC=02 ARGS= 0001 0001 CALL=operand:0001 routine:0001',
  'GBCL clock= 0000 0000 0000 0000 0000 0000 0000'
)) {
  if ($dump -notlike "*$needle*") {
    throw "GBBOOT DQK flow effect dump missing: $needle"
  }
}

Write-Output 'RESULT: GBBOOT DQK /A 18 native GBPS+GBWS flow PASS'
