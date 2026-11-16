# GBBOOT DQK headless title-art front-door smoke.
#
# DQK uses HLIB/TLB title art instead of Gen1 TITLE.DAX. GBBOOT /E /J decodes
# the verified TITLE.TLB image to _GBTITLE.RAW through CCHLIB, then continues
# through the normal saved-party, ECL, GBWS wall, and first-person snapshot path.
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$source = Join-Path $root 'The Dark Queen of Krynn'
$run = Join-Path $build 'gbdqk-intro-flow-test'
$dosbox = Join-Path $source 'DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT DQK /J flow (DOSBox.exe absent)'
  exit 0
}

foreach ($name in @(
  'DQK.EXE',
  'SAVGAMA.QSV',
  'DISK1\TITLE.TLB',
  'DISK2\8X8DB.TLB',
  'DISK2\8X8DC.TLB',
  'DISK3\ECL.GLB',
  'DISK3\GEO.GLB'
)) {
  if (-not (Test-Path (Join-Path $source $name))) {
    Write-Output "SKIP: GBBOOT DQK /J flow ($name absent)"
    exit 0
  }
}

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force (Join-Path $run 'DISK2') | Out-Null
New-Item -ItemType Directory -Force (Join-Path $run 'DISK3') | Out-Null

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

$conf = Join-Path $build '_gbdqk_intro_flow_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[speaker]
pcspeaker=true
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X /J /A 18 > C:\DQKINTRO.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

Remove-Item (Join-Path $build '_GBTITLE.RAW'),
  (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build 'DQKINTRO.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
if (-not $p.WaitForExit(30000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT DQK /J missing-title probe timed out'
}

$missingTitleOut = Get-Content (Join-Path $build 'DQKINTRO.TXT') -Raw
if ((Test-Path (Join-Path $build '_GBTITLE.RAW')) -or
    (Test-Path (Join-Path $build '_GBVIEW.RAW')) -or
    $missingTitleOut -notlike '*GBBOOT: native preview failed*') {
  throw 'GBBOOT DQK /J did not fail through the TITLE.TLB helper when title art was absent'
}

New-Item -ItemType Directory -Force (Join-Path $run 'DISK1') | Out-Null
Copy-Item (Join-Path $source 'DISK1\TITLE.TLB') (Join-Path $run 'DISK1\TITLE.TLB') -Force
Remove-Item (Join-Path $build '_GBTITLE.RAW'),
  (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build 'DQKINTRO.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
if (-not $p.WaitForExit(30000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT DQK /J title flow timed out'
}

$titlePath = Join-Path $build '_GBTITLE.RAW'
if (-not (Test-Path $titlePath)) { throw 'GBBOOT DQK /J did not create _GBTITLE.RAW' }
$title = [IO.File]::ReadAllBytes($titlePath)
$tw = [BitConverter]::ToUInt16($title, 0)
$th = [BitConverter]::ToUInt16($title, 2)
if ($tw -lt 160 -or $tw -gt 320 -or $th -lt 100 -or $th -gt 200 -or
    $title.Length -ne (4 + ($tw * $th) + 768)) {
  throw "GBBOOT DQK /J title RAW had implausible dimensions/length: ${tw}x${th} len=$($title.Length)"
}

$titleNonzero = 0
$titleColors = @{}
for ($i = 4; $i -lt (4 + ($tw * $th)); $i++) {
  if ($title[$i] -ne 0) { $titleNonzero++ }
  $titleColors[[int]$title[$i]] = $true
}
if ($titleNonzero -lt 4096 -or $titleColors.Count -lt 16) {
  throw 'GBBOOT DQK /J produced an implausibly blank title RAW'
}

$seedPath = Join-Path $build '_GBSEED.BIN'
if (-not (Test-Path $seedPath)) { throw 'GBBOOT DQK /J did not create _GBSEED.BIN' }
$seed = [IO.File]::ReadAllBytes($seedPath)
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
  throw "GBBOOT DQK /J seed magic wrong: expected 'GBPS', got '$seedMagic' (_GBSEED.BIN offset 0, len $($seed.Length))"
}
$seedVersion = [BitConverter]::ToUInt16($seed, 4)
if ($seedVersion -ne 2) {
  throw "GBBOOT DQK /J GBPS version wrong: expected version 2, got $seedVersion (offset 4)"
}
if ($seed.Length -ne 216) {
  throw "GBBOOT DQK /J GBPS record is not a v2 sidecar: expected length 216 (PS_V2_LEN), got $($seed.Length)"
}
if ($seed[150] -ne 1) {
  throw "GBBOOT DQK /J GBPS thief-matrix row count wrong: expected 1, got $($seed[150]) (offset 150)"
}
if ($seed[151] -ne 0) {
  throw "GBBOOT DQK /J GBPS thief-matrix reserved byte wrong: expected 0, got $($seed[151]) (offset 151)"
}
if (($seed[152..159] | Where-Object { $_ -ne 0 }).Count -eq 0) {
  throw 'GBBOOT DQK /J wrote an all-zero GBPS thief-skill row 0 (offsets 152..159), so nothing justifies version 2'
}
$seedFlags = [BitConverter]::ToUInt16($seed, 6)
if (($seedFlags -band 1) -eq 0) {
  throw ("GBBOOT DQK /J GBPS flags bit 0 clear: expected bit 0 set, got flags=0x{0:X4} (offset 6)" -f $seedFlags)
}
$seedCount = [BitConverter]::ToUInt16($seed, 8)
if ($seedCount -ne 6) {
  throw "GBBOOT DQK /J did not load the six-member QSV party count into GBPS: expected count 6, got $seedCount (offset 8)"
}

$view = [IO.File]::ReadAllBytes((Join-Path $build '_GBVIEW.RAW'))
if ([BitConverter]::ToUInt16($view, 0) -ne 320 -or [BitConverter]::ToUInt16($view, 2) -ne 200) {
  throw 'GBBOOT DQK /J did not continue to a 320x200 native snapshot'
}

$viewNonzero = 0
$viewColors = @{}
for ($i = 4; $i -lt $view.Length; $i++) {
  if ($view[$i] -ne 0) { $viewNonzero++ }
  $viewColors[[int]$view[$i]] = $true
}
if ($viewNonzero -lt 4096 -or $viewColors.Count -lt 16) {
  throw 'GBBOOT DQK /J produced an implausibly blank GBWS-rendered snapshot'
}

$effect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
if ($effect -notlike '*GBEF v0009 flags=0021 status=0000 geo=0012*' -or
    $effect -notlike '*GBLF operands=0012 0001 D001*' -or
    $effect -notlike '*#00 OP=2D CALL ARGC=02 ARGS= 0001 0001 CALL=operand:0001 routine:0001*') {
  throw 'GBBOOT DQK /J did not continue through the expected area-18 ECL effects'
}

$dqkMusic = Join-Path $build 'DQKTITLE.GBM'
if (Test-Path $dqkMusic) {
  $out = Get-Content (Join-Path $build 'DQKINTRO.TXT') -Raw
  if ($out -notlike '*GBM1 PC-speaker sequence advanced*') {
    throw 'GBBOOT DQK /J did not drive DQK title music through CGB music-only playback'
  }
  Write-Output 'RESULT: GBBOOT DQK /E /X /J title-art/music, saved-party, GBWS snapshot flow PASS'
} else {
  Write-Output 'RESULT: GBBOOT DQK /E /X /J title-art, saved-party, GBWS snapshot flow PASS'
  Write-Output "SKIP: GBBOOT DQK /J title music ($dqkMusic absent)"
}
