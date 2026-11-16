# GBBOOT DQK headless title-to-gameplay flow.
#
# Extends the DQK /J title-art/music proof into bounded gameplay. Area 18 is
# seeded at a pose with an open south edge; CCFP must write GBST descriptor 22,
# then GBBOOT must continue through CCECL's SearchLocation path into the TAVERN
# event while preserving the saved-party seed. A second headless launch then
# walks into the proven area-5 natural dragon route, verifies that the QSV's
# embedded six-member party is materialized into CCCOMBAT, not replaced by the
# two-person fixture party, then relaunches that post-combat roster into a clean
# noncombat exploration step and a post-combat first-person snapshot.
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$source = Join-Path $root 'The Dark Queen of Krynn'
$run = Join-Path $build 'gbdqk-playable-flow-test'
$oracle = Join-Path $native 'dqk-combat-oracle.ps1'
. $oracle
$dosbox = Join-Path $source 'DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT DQK playable flow (DOSBox.exe absent)'
  exit 0
}

foreach ($name in @(
  'DQK.EXE',
  'SAVGAMA.QSV',
  'DISK1\TITLE.TLB',
  'DISK2\MONCHA.GLB',
  'DISK2\8X8DB.TLB',
  'DISK2\8X8DC.TLB',
  'DISK3\ECL.GLB',
  'DISK3\GEO.GLB'
)) {
  if (-not (Test-Path (Join-Path $source $name))) {
    Write-Output "SKIP: GBBOOT DQK playable flow ($name absent)"
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

function Assert-RawFrame([string]$path, [string]$label, [int]$minColors) {
  if (-not (Test-Path $path)) {
    throw "$label did not create $(Split-Path -Leaf $path)"
  }
  $raw = [IO.File]::ReadAllBytes($path)
  if ($raw.Length -lt (4 + 768)) {
    throw "$label RAW was too short: len=$($raw.Length)"
  }
  $w = [BitConverter]::ToUInt16($raw, 0)
  $h = [BitConverter]::ToUInt16($raw, 2)
  if ($w -ne 320 -or $h -ne 200 -or $raw.Length -ne (4 + ($w * $h) + 768)) {
    throw "$label RAW had unexpected dimensions/length: ${w}x${h} len=$($raw.Length)"
  }
  $nonzero = 0
  $colors = @{}
  for ($i = 4; $i -lt (4 + ($w * $h)); $i++) {
    $pix = [int]$raw[$i]
    if ($pix -ne 0) { $nonzero++ }
    $colors[$pix] = $true
  }
  if ($nonzero -lt 4096 -or $colors.Count -lt $minColors) {
    throw "$label produced an implausibly blank RAW: nonzero=$nonzero colors=$($colors.Count)"
  }
}

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
foreach ($dir in @('DISK1', 'DISK2', 'DISK3')) {
  New-Item -ItemType Directory -Force (Join-Path $run $dir) | Out-Null
}

foreach ($name in @(
  'DQK.EXE',
  'SAVGAMA.QSV',
  'DISK1\TITLE.TLB',
  'DISK2\MONCHA.GLB',
  'DISK2\8X8DB.TLB',
  'DISK2\8X8DC.TLB',
  'DISK3\ECL.GLB',
  'DISK3\GEO.GLB'
)) {
  Copy-Item (Join-Path $source $name) (Join-Path $run $name) -Force
}

$conf = Join-Path $build '_gbdqk_playable_flow_test.conf'
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
C:\GBBOOT /E /J /T 1 /A 18 > C:\DQKPLAY.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

Remove-Item (Join-Path $build '_GBTITLE.RAW'),
  (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBWALL.BIN'),
  (Join-Path $build '_GBWSET.GBW'),
  (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build 'DQKPLAY.TXT') -Force -ErrorAction SilentlyContinue

# Area 18 is a 16x11 WGRD. From (10,0) facing south, the first forward step
# reaches (10,1), whose plane-2 SearchLocation descriptor is 22.
Set-Session 10 0 4 16 11
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
if (-not $p.WaitForExit(60000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT DQK playable flow timed out'
}

$titlePath = Join-Path $build '_GBTITLE.RAW'
if (-not (Test-Path $titlePath)) { throw 'GBBOOT DQK playable flow did not create _GBTITLE.RAW' }
$title = [IO.File]::ReadAllBytes($titlePath)
$tw = [BitConverter]::ToUInt16($title, 0)
$th = [BitConverter]::ToUInt16($title, 2)
if ($tw -lt 160 -or $tw -gt 320 -or $th -lt 100 -or $th -gt 200 -or
    $title.Length -ne (4 + ($tw * $th) + 768)) {
  throw "GBBOOT DQK playable flow title RAW had implausible dimensions/length: ${tw}x${th} len=$($title.Length)"
}

$titleNonzero = 0
$titleColors = @{}
for ($i = 4; $i -lt (4 + ($tw * $th)); $i++) {
  if ($title[$i] -ne 0) { $titleNonzero++ }
  $titleColors[[int]$title[$i]] = $true
}
if ($titleNonzero -lt 4096 -or $titleColors.Count -lt 16) {
  throw 'GBBOOT DQK playable flow produced an implausibly blank title RAW'
}

$seedPath = Join-Path $build '_GBSEED.BIN'
if (-not (Test-Path $seedPath)) { throw 'GBBOOT DQK playable flow did not create _GBSEED.BIN' }
$seed = [IO.File]::ReadAllBytes($seedPath)
if ([Text.Encoding]::ASCII.GetString($seed, 0, 4) -ne 'GBPS' -or
    [BitConverter]::ToUInt16($seed, 4) -lt 2 -or
    ([BitConverter]::ToUInt16($seed, 6) -band 1) -eq 0 -or
    [BitConverter]::ToUInt16($seed, 8) -ne 6 -or
    $seed[17] -ne 6) {
  throw 'GBBOOT DQK playable flow did not load the six-member QSV party count and movement rows into GBPS'
}
for ($i = 0; $i -lt 6; $i++) {
  if ([BitConverter]::ToUInt16($seed, 70 + ($i * 2)) -ne 4) {
    throw "GBBOOT DQK playable flow GBPS move row $i was not refreshed from QSV combat metadata"
  }
}

$wall = [IO.File]::ReadAllBytes((Join-Path $build '_GBWALL.BIN'))
if ($wall.Length -lt 6 -or [Text.Encoding]::ASCII.GetString($wall, 0, 4) -ne 'WGRD' -or
    $wall[4] -ne 16 -or $wall[5] -ne 11) {
  throw 'GBBOOT DQK playable flow did not create the expected 16x11 wall bridge'
}

$gbw = [IO.File]::ReadAllBytes((Join-Path $build '_GBWSET.GBW'))
if ($gbw.Length -lt 12 -or [Text.Encoding]::ASCII.GetString($gbw, 0, 4) -ne 'GBWS' -or
    [BitConverter]::ToUInt16($gbw, 4) -ne 2 -or
    [BitConverter]::ToUInt16($gbw, 8) -eq 0) {
  throw 'GBBOOT DQK playable flow did not create a valid GBWS wall bundle'
}

$session = [IO.File]::ReadAllBytes((Join-Path $build '_GBSESS.GBS'))
$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
if ([BitConverter]::ToUInt16($session, 6) -ne 10 -or
    [BitConverter]::ToUInt16($session, 8) -ne 1 -or
    [BitConverter]::ToUInt16($session, 10) -ne 4 -or
    [BitConverter]::ToUInt16($session, 12) -ne 16 -or
    [BitConverter]::ToUInt16($session, 14) -ne 11 -or
    [BitConverter]::ToUInt16($step, 6) -ne 22 -or
    [BitConverter]::ToUInt16($step, 8) -ne 10 -or
    [BitConverter]::ToUInt16($step, 10) -ne 1 -or
    [BitConverter]::ToUInt16($step, 12) -ne 4) {
  throw 'GBBOOT DQK playable flow did not produce the expected bounded GBST/GBSN step'
}

$effect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
if ($effect -notlike '*GBEF v0009 flags=0020 status=0000 geo=FFFF*' -or
    $effect -notlike '*area=0012*' -or
    $effect -notlike '*MEM key=0011 value=0002*' -or
    $effect -notlike '*MEM key=001B value=0012*' -or
    $effect -notlike '*MEM key=002D value=0016*' -or
    $effect -notlike '*#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 0005 TEXT=TAVERN*' -or
    $effect -notlike '*GBCL clock= 0000 0000 0000 0000 0000 0000 0000*') {
  throw 'GBBOOT DQK playable flow did not continue through the expected facing-aware descriptor-22 TAVERN event'
}

$dqkMusic = Join-Path $build 'DQKTITLE.GBM'
if (Test-Path $dqkMusic) {
  $out = Get-Content (Join-Path $build 'DQKPLAY.TXT') -Raw
  if ($out -notlike '*GBM1 PC-speaker sequence advanced*') {
    throw 'GBBOOT DQK playable flow did not drive DQK title music through CGB'
  }
}

$combatConf = Join-Path $build '_gbdqk_playable_combat.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /T 1 /A 5 > C:\DQKPLAYC.TXT
C:
C:\CCEFX C:\_GBEVT.BIN C:\DQKPE.TXT
C:\CCEFX C:\_GBECL.BIN C:\DQKPC.TXT
C:\CCEFX C:\_GBRES.BIN C:\DQKPR.TXT
exit
"@ | Set-Content $combatConf -Encoding ASCII

Remove-Item (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBEVT.BIN'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build 'DQKPLAYC.TXT'),
  (Join-Path $build 'DQKPE.TXT'),
  (Join-Path $build 'DQKPC.TXT'),
  (Join-Path $build 'DQKPR.TXT') -Force -ErrorAction SilentlyContinue

# From (0,1) facing north, CCFP steps to (0,0). GBBOOT derives the host-owned
# vmRun rows that select DQK area 5's natural dragon encounter and then schedules
# slot 3 as a separate tactical handoff.
Set-Session 0 1 0 10 10
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $combatConf -Headless
if (-not $p.WaitForExit(60000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT DQK playable natural combat flow timed out'
}

$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
if ([Text.Encoding]::ASCII.GetString($step, 0, 4) -ne 'GBST' -or
    [BitConverter]::ToUInt16($step, 6) -ne 128 -or
    [BitConverter]::ToUInt16($step, 8) -ne 0 -or
    [BitConverter]::ToUInt16($step, 10) -ne 0 -or
    [BitConverter]::ToUInt16($step, 12) -ne 0) {
  throw 'GBBOOT DQK playable natural combat flow did not start from the expected north-step pose'
}

$naturalEvent = Get-Content (Join-Path $build 'DQKPE.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0000 status=0000 geo=FFFF',
  'MEM key=0023 value=0003',
  'MEM key=0111 value=001E',
  'MEM key=0112 value=0003',
  'MEM key=00CB value=0005',
  'MEM key=00CA value=000E',
  'MEM key=00CC value=00E5'
)) {
  if ($naturalEvent -notlike "*$needle*") {
    throw "GBBOOT DQK playable natural vmRun dump missing: $needle"
  }
}

$naturalCombat = Get-Content (Join-Path $build 'DQKPC.TXT') -Raw

# RNG-INDEPENDENT BACKSTOP, ported from gbdqk-create-test.ps1:247-266 (round 37).
# It must run BEFORE the `foreach ($needle ...)` block below, and it does: this is
# straight-line script with no functions, loops or branches between the two, so
# PowerShell reaches this block first and the exact "count=0004" needle further
# down cannot throw ahead of it. That ordering is the whole point -- a guard
# placed after the literal it backstops can never fire, because the literal
# throws first, and round 37 caught itself writing exactly that (PLAN-ROUND-37
# correction C5).
#
# The two ranges are re-derived here from the retail DISK3\ECL.GLB bytes, not
# taken on trust. Block offsets; add 0x5860 for ECL.GLB file offsets. Operand
# encoding is `00 <byte>` = immediate, `01 <lo> <hi>` = address:
#   1167: 08 00 05 01 c1 00              RANDOM  #5, [0x00C1]
#   116D: 04 00 05 01 c1 00 01 c1 00     ADD     #5, [0x00C1], [0x00C1]
#   1176: 08 00 03 01 c2 00              RANDOM  #3, [0x00C2]
#   117C: 04 00 03 01 c2 00 01 c2 00     ADD     #3, [0x00C2], [0x00C2]
#   119B: 0b 00 2e 01 c2 00 00 2e        LOAD_MONSTER #0x2E, [0x00C2], #0x2E
# op_random (native/src/ccecl.asm:2139) computes `rng % range`, i.e. {0..n-1},
# so [0x00C1] in {5..9} and [0x00C2] in {3,4,5}, and the dragon group's count
# operand IS [0x00C2] -- which is why the count is cross-checked against it
# below rather than only against a literal.
#
# What this guard actually buys, stated precisely: the emitted count is NOT
# flaky. ccecl.asm:1443 (vm_reset_all) seeds `rng_state` with a hardcoded
# 0x00001234, and the only other writers restore it from a persisted GBRS word
# descended from that same seed, so the draw is deterministic per build -- the
# resume dump further down even pins the exact post-combat state rng=1DE921E7.
# The guard's value is that it catches a FRAMING REGRESSION: before commit
# e3ce79f the long PARLAY frame swallowed the RANDOM/ADD pairs and CCECL's own
# host seeds ([0x00C1]=3, [0x00C2]=2, derive_dqk_handler_state) leaked into the
# dump instead. Both are outside these ranges, so this block fails on that
# desync even if some future change happens to leave a literal count matching.
# 0x00C1 is pinned by nothing else in this file, so it is a live check on the
# operand stream reaching those RANDOM/ADD pairs at all.
$mem = @{}
foreach ($m in ([regex]'MEM key=([0-9A-F]{4}) value=([0-9A-F]{4})').Matches($naturalCombat)) {
  $mem[$m.Groups[1].Value] = [Convert]::ToInt32($m.Groups[2].Value, 16)
}
foreach ($w in @(@('00C1', 5, 9), @('00C2', 3, 5))) {
  if (-not $mem.ContainsKey($w[0])) {
    throw "GBBOOT DQK playable natural combat dump did not report ECL word $($w[0])"
  }
  if ($mem[$w[0]] -lt $w[1] -or $mem[$w[0]] -gt $w[2]) {
    throw "GBBOOT DQK playable natural combat ECL word $($w[0]) is $($mem[$w[0]]), outside the retail range {$($w[1])..$($w[2])} -- the area-5 RANDOM/ADD pair did not run"
  }
}
$monsterLine = ([regex]'@00 MONSTER id=002E count=([0-9A-F]{4}) pic=002E').Match($naturalCombat)
if (-not $monsterLine.Success) {
  throw 'GBBOOT DQK playable natural combat dump had no id=002E dragon group'
}
$dragonCount = [Convert]::ToInt32($monsterLine.Groups[1].Value, 16)
if ($dragonCount -ne $mem['00C2']) {
  throw "GBBOOT DQK playable natural combat dragon group count $dragonCount does not match the ECL word 0x00C2 it is read from ($($mem['00C2']))"
}

foreach ($needle in @(
  'GBEF v0009 flags=0069 status=0003 geo=0002 chain=FFFF',
  'GBLF operands=0002 0000 D000',
  'GBEC groups=0001',
  # count was 0002 until 2026-07-28, and 0002 was never a value the game can
  # produce. Full derivation from the retail bytes is in gbdqk-create-test.ps1
  # next to the same literal; in short, area 5's dragon count operand is the ECL
  # word 0x00C2, set by RANDOM #3 / ADD #3 to 3+(rnd%3) in {3,4,5}, and the
  # pre-e3ce79f long PARLAY frame desynced past that pair so ccecl.asm's own
  # host seed [0x00C2]=2 leaked into the dump. e3ce79f re-pinned
  # gbdqk-combat-flow-test.ps1 and missed this file. The id/pic are unchanged --
  # this is the dragon branch (id 0x2E = BLACK DRAGON in retail MONCHA.GLB), not
  # the ZOMBIE (0x25) UNDEAD branch the area-5 effect memo was written about.
  # Four dragons is corroborated inside this same run by the tactical trace
  # below, which now has to initialise exactly e0..e3.
  '@00 MONSTER id=002E count=0004 pic=002E',
  '#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 0006 TEXT=DRAGONS',
  '#01 OP=11 PRINT ARGC=01 ARGS= 0006 TEXT= ATTACK!',
  'MEM key=00CC value=00E5'
)) {
  if ($naturalCombat -notlike "*$needle*") {
    throw "GBBOOT DQK playable natural combat dump missing: $needle"
  }
}

$trace = @(Get-Content (Join-Path $build '_GBCOMB.TRC') | Where-Object { $_.Trim().Length -gt 0 })
if ($trace.Count -lt 20 -or
    $trace[0] -ne '1 init p0 - - - - - - -' -or
    $trace[5] -ne '1 init p5 - - - - - - -' -or
    $trace[6] -ne '1 init e0 - - - - - - -' -or
    $trace[7] -ne '1 init e1 - - - - - - -' -or
    # e2/e3 are the tactical-side check on the effect dump's count=0004 above.
    # Only e0/e1 were asserted before, so the trace could not contradict a wrong
    # monster count -- which is how the stale count=0002 pin survived unnoticed
    # in this file for 39 days while the run itself was fielding four dragons.
    $trace[8] -ne '1 init e2 - - - - - - -' -or
    $trace[9] -ne '1 init e3 - - - - - - -' -or
    $trace[10] -like '1 init e4*' -or
    $trace[-1] -notlike '* end - enemy - - - - - -') {
  throw 'GBBOOT DQK playable natural combat trace did not include the six-member QSV party and dragon encounter shape'
}
$facts = Assert-DerivedCombat -Label 'GBBOOT DQK playable natural' -DumpText $naturalCombat -Trace $trace -MonchaPath (Join-Path $run 'DISK2\MONCHA.GLB') -Seed 4660
if ($facts.Outcome -ne 'enemy' -or $facts.RearReactionCount -ne 1) {
  throw "GBBOOT DQK playable natural oracle expected enemy with one verified leaving reaction, got $($facts.Outcome) / $($facts.RearReactionCount)"
}
$qsvMaxHp = @(140, 101, 85, 87, 84, 73)
for ($i = 0; $i -lt $qsvMaxHp.Count; $i++) {
  if ($facts.MaxHp["p$i"] -ne $qsvMaxHp[$i]) {
    throw "GBBOOT DQK playable QSV member $i max HP expected $($qsvMaxHp[$i]), got $($facts.MaxHp["p$i"])"
  }
}

$outcome = (Get-Content (Join-Path $build '_GBCOMB.OUT') -Raw).Trim()
if ($outcome -ne 'enemy') {
  throw "GBBOOT DQK playable natural combat outcome expected enemy, got $outcome"
}

Assert-RawFrame (Join-Path $build '_GBCOMB.RAW') 'GBBOOT DQK playable natural combat' 4

$gbcr = [IO.File]::ReadAllBytes((Join-Path $build '_GBCR.BIN'))
$null = Assert-DerivedGbcr -Label 'GBBOOT DQK playable natural' -Gbcr $gbcr -Facts $facts
# Assert-DerivedGbcr ties all records to the independently replayed combat trace.

$combatOut = Get-Content (Join-Path $build 'DQKPLAYC.TXT') -Raw
foreach ($needle in @(
  'slot 1: SIR DRYDEN',
  'slot 2: JORIS THE WISE',
  'slot 3: LENDUIRA',
  'slot 4: NEACAIL',
  'slot 5: ALARIC THE BOLD',
  'slot 6: MAIGUREIGNE',
  'CCPARTY: loaded 6 member(s)'
)) {
  if ($combatOut -notlike "*$needle*") {
    throw "GBBOOT DQK playable natural combat did not materialize QSV party member: $needle"
  }
}

$resume = Get-Content (Join-Path $build 'DQKPR.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0000 status=0000 geo=FFFF',
  'GBRS flags=0000 area=0005 pc=11DC rng=1DE921E7 callsp=0000',
  'MEM key=00CC value=00E5',
  'GBSX count=0000'
)) {
  if ($resume -notlike "*$needle*") {
    throw "GBBOOT DQK playable natural combat resume dump missing: $needle"
  }
}

$gbprPath = Join-Path $build '_GBPARTY.GBP'
if (-not (Test-Path $gbprPath)) {
  throw 'GBBOOT DQK playable natural combat did not leave a post-combat GBPR party'
}
$afterCombatGbpr = [IO.File]::ReadAllBytes($gbprPath)

$postCombatExploreConf = Join-Path $build '_gbdqk_playable_postcombat_explore.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /T 1 /A 18 > C:\DQKPLAYX.TXT
C:
C:\CCEFX C:\_GBECL.BIN C:\DQKPX.TXT
exit
"@ | Set-Content $postCombatExploreConf -Encoding ASCII

Remove-Item (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBEVT.BIN'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build 'DQKPLAYX.TXT'),
  (Join-Path $build 'DQKPX.TXT') -Force -ErrorAction SilentlyContinue

# Reuse the known area-18 TAVERN route after the area-5 combat/resume cycle. This
# proves the post-combat GBPR remains loadable by the boot host for normal walking.
Set-Session 10 0 4 16 11
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $postCombatExploreConf -Headless
if (-not $p.WaitForExit(60000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT DQK playable post-combat exploration flow timed out'
}

$postCombatOut = Get-Content (Join-Path $build 'DQKPLAYX.TXT') -Raw
if ($postCombatOut -notlike '*CCPARTY: loaded 6 member(s)*') {
  throw 'GBBOOT DQK playable post-combat exploration did not reload the six-member GBPR party'
}

$session = [IO.File]::ReadAllBytes((Join-Path $build '_GBSESS.GBS'))
$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
if ([BitConverter]::ToUInt16($session, 6) -ne 10 -or
    [BitConverter]::ToUInt16($session, 8) -ne 1 -or
    [BitConverter]::ToUInt16($session, 10) -ne 4 -or
    [BitConverter]::ToUInt16($session, 12) -ne 16 -or
    [BitConverter]::ToUInt16($session, 14) -ne 11 -or
    [BitConverter]::ToUInt16($step, 6) -ne 22 -or
    [BitConverter]::ToUInt16($step, 8) -ne 10 -or
    [BitConverter]::ToUInt16($step, 10) -ne 1 -or
    [BitConverter]::ToUInt16($step, 12) -ne 4) {
  throw 'GBBOOT DQK playable post-combat exploration did not produce the expected bounded GBST/GBSN step'
}

$postCombatEffect = Get-Content (Join-Path $build 'DQKPX.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0020 status=0000 geo=FFFF',
  'area=0012',
  'MEM key=0011 value=0002',
  'MEM key=001B value=0012',
  'MEM key=002D value=0016',
  '#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 0005 TEXT=TAVERN',
  'GBCL clock= 0000 0000 0000 0000 0000 0000 0000'
)) {
  if ($postCombatEffect -notlike "*$needle*") {
    throw "GBBOOT DQK playable post-combat exploration dump missing: $needle"
  }
}

foreach ($path in @(
  '_GBCOMB.TRC',
  '_GBCOMB.OUT',
  '_GBCOMB.RAW',
  '_GBCR.BIN',
  '_GBRES.BIN',
  '_GBRES.TXT'
)) {
  if (Test-Path (Join-Path $build $path)) {
    throw "GBBOOT DQK playable post-combat exploration unexpectedly wrote tactical sidecar $path"
  }
}

$afterPostExploreGbpr = [IO.File]::ReadAllBytes($gbprPath)
if ($afterCombatGbpr.Length -ne $afterPostExploreGbpr.Length) {
  throw 'GBBOOT DQK playable post-combat exploration changed GBPR length'
}
for ($i = 0; $i -lt $afterCombatGbpr.Length; $i++) {
  if ($afterCombatGbpr[$i] -ne $afterPostExploreGbpr[$i]) {
    throw "GBBOOT DQK playable post-combat exploration changed GBPR byte $i"
  }
}

$postCombatSnapshotConf = Join-Path $build '_gbdqk_playable_postcombat_snapshot.conf'
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
C:\GBBOOT /E /X /A 18 > C:\DQKPLYS.TXT
exit
"@ | Set-Content $postCombatSnapshotConf -Encoding ASCII

Remove-Item (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBWALL.BIN'),
  (Join-Path $build '_GBWSET.GBW'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build 'DQKPLYS.TXT') -Force -ErrorAction SilentlyContinue

# Rewind to the same known-good area-18 pose used by the opening
# title-to-gameplay leg before rendering the post-combat snapshot.
Set-Session 10 0 4 16 11
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $postCombatSnapshotConf -Headless
if (-not $p.WaitForExit(60000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT DQK playable post-combat snapshot flow timed out'
}

$postCombatSnapshotOut = Get-Content (Join-Path $build 'DQKPLYS.TXT') -Raw
if ($postCombatSnapshotOut -notlike '*CCPARTY: loaded 6 member(s)*') {
  throw 'GBBOOT DQK playable post-combat snapshot did not reload the six-member GBPR party'
}

Assert-RawFrame (Join-Path $build '_GBVIEW.RAW') 'GBBOOT DQK playable post-combat snapshot' 4

$wall = [IO.File]::ReadAllBytes((Join-Path $build '_GBWALL.BIN'))
if ([Text.Encoding]::ASCII.GetString($wall, 0, 4) -ne 'WGRD' -or
    $wall[4] -ne 16 -or
    $wall[5] -ne 11) {
  throw 'GBBOOT DQK playable post-combat snapshot did not rebuild the expected 16x11 WGRD wall bridge'
}

$wallset = [IO.File]::ReadAllBytes((Join-Path $build '_GBWSET.GBW'))
if ([Text.Encoding]::ASCII.GetString($wallset, 0, 4) -ne 'GBWS' -or
    [BitConverter]::ToUInt16($wallset, 4) -ne 2) {
  throw 'GBBOOT DQK playable post-combat snapshot did not rebuild a GBWS v2 wall set'
}

foreach ($path in @(
  '_GBSTEP.BIN',
  '_GBCOMB.TRC',
  '_GBCOMB.OUT',
  '_GBCOMB.RAW',
  '_GBCR.BIN',
  '_GBRES.BIN',
  '_GBRES.TXT'
)) {
  if (Test-Path (Join-Path $build $path)) {
    throw "GBBOOT DQK playable post-combat snapshot unexpectedly wrote tactical/step sidecar $path"
  }
}

$afterPostSnapshotGbpr = [IO.File]::ReadAllBytes($gbprPath)
if ($afterCombatGbpr.Length -ne $afterPostSnapshotGbpr.Length) {
  throw 'GBBOOT DQK playable post-combat snapshot changed GBPR length'
}
for ($i = 0; $i -lt $afterCombatGbpr.Length; $i++) {
  if ($afterCombatGbpr[$i] -ne $afterPostSnapshotGbpr[$i]) {
    throw "GBBOOT DQK playable post-combat snapshot changed GBPR byte $i"
  }
}

Write-Output 'RESULT: GBBOOT DQK /J title-art/music, saved-party, bounded TAVERN step, natural combat/resume, post-combat exploration, and post-combat snapshot flow PASS'
