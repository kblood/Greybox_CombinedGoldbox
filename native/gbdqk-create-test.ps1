# GBBOOT deterministic native DQK compact party creation smoke.
#
# Runs the real DQK HLIB path without SAVGAMA.QSV, creates compact native
# members through GBBOOT /R -> CCPARTY /G, verifies GBPR/GBPS, takes a normal
# exploration step, then relaunches without /R into the area-5 tactical route to
# prove the native-created compact party is the combat roster.
param(
  [switch]$Headless
)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$source = Join-Path $root 'The Dark Queen of Krynn'
$run = Join-Path $build 'gbdqk-create-test'
$dosbox = Join-Path $source 'DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT DQK /R create flow (DOSBox.exe absent)'
  exit 0
}

foreach ($name in @(
  'DQK.EXE',
  'DISK2\MONCHA.GLB',
  'DISK2\8X8DB.TLB',
  'DISK2\8X8DC.TLB',
  'DISK3\ECL.GLB',
  'DISK3\GEO.GLB'
)) {
  if (-not (Test-Path (Join-Path $source $name))) {
    Write-Output "SKIP: GBBOOT DQK /R create flow ($name absent)"
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

function Assert-RawFrame([string]$Path, [string]$Label, [int]$MinColors = 4) {
  if (-not (Test-Path $Path)) { throw "$Label did not create $(Split-Path -Leaf $Path)" }
  $raw = [IO.File]::ReadAllBytes($Path)
  if ($raw.Length -ne (4 + (320 * 200) + 768) -or
      [BitConverter]::ToUInt16($raw, 0) -ne 320 -or
      [BitConverter]::ToUInt16($raw, 2) -ne 200) {
    throw "$Label RAW was not a valid 320x200 frame"
  }
  $seen = New-Object bool[] 256
  $nonzero = 0
  $colors = 0
  for ($i = 4; $i -lt (4 + (320 * 200)); $i++) {
    $px = $raw[$i]
    if ($px -ne 0) { $nonzero++ }
    if (-not $seen[$px]) {
      $seen[$px] = $true
      $colors++
    }
  }
  if ($nonzero -lt 1000 -or $colors -lt $MinColors) {
    throw "$Label RAW was blank or low-detail (nonzero=$nonzero colors=$colors)"
  }
}

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
foreach ($dir in @('DISK2', 'DISK3')) {
  New-Item -ItemType Directory -Force (Join-Path $run $dir) | Out-Null
}
foreach ($name in @(
  'DQK.EXE',
  'DISK2\MONCHA.GLB',
  'DISK2\8X8DB.TLB',
  'DISK2\8X8DC.TLB',
  'DISK3\ECL.GLB',
  'DISK3\GEO.GLB'
)) {
  Copy-Item (Join-Path $source $name) (Join-Path $run $name) -Force
}

$conf = Join-Path $build '_gbdqk_create_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /T 1 /A 18 /R CLERIC C /R FIGHTER F /R MAGE M /R THIEF T > C:\DQKCREATE.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

Remove-Item (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBWALL.BIN'),
  (Join-Path $build '_GBWSET.GBW'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build 'DQKGATE.GBP'),
  (Join-Path $build 'DQKGATE.TXT'),
  (Join-Path $build 'DQKCREATE.TXT') -Force -ErrorAction SilentlyContinue

# A fresh DQK source has no QSV/QCH records. The ordinary /Q /M menu now lets
# the player create the first member (title-owned rules, deterministic /D dice);
# nothing may be written to GBPR until Begin.
New-Item -ItemType Directory -Force (Join-Path $run 'SAVE') | Out-Null
[IO.File]::WriteAllBytes((Join-Path $build 'DQKDICE.BIN'), [byte[]](5,9,3,7,2,8,6,4,1,0,11,13,17,19,23,29,31,37,41,43))
$createInput = "c`rluna`rf`r6`r15`r"
$gateConf = Join-Path $build '_gbdqk_party_gate_test.conf'
function Invoke-Gate([string]$InputText) {
  [IO.File]::WriteAllText((Join-Path $build 'DQKIN.TXT'), $InputText, [Text.Encoding]::ASCII)
  Remove-Item (Join-Path $build 'DQKGATE.GBP'), (Join-Path $build 'DQKGATE.TXT'),
    (Join-Path $run 'SAVE\LUNA.QCH') -Force -ErrorAction SilentlyContinue
  @"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\CCPARTY /Q /M /D C:\DQKDICE.BIN C:\DQKGATE.GBP < C:\DQKIN.TXT > C:\DQKGATE.TXT
exit
"@ | Set-Content $gateConf -Encoding ASCII
  $gp = Start-DosBoxSmoke -Dosbox $dosbox -Conf $gateConf -Headless:$Headless
  if (-not $gp.WaitForExit(30000)) {
    Stop-DosBoxSmoke -Process $gp
    throw 'CCPARTY DQK /Q /M create did not finish before the timeout'
  }
}

# Create, then EOF before Begin: the QCH exists, but no roster was written.
Invoke-Gate $createInput
if (-not (Test-Path (Join-Path $run 'SAVE\LUNA.QCH'))) {
  throw 'CCPARTY DQK /Q /M create from an empty source did not write SAVE\LUNA.QCH'
}
if (Test-Path (Join-Path $build 'DQKGATE.GBP')) {
  throw 'CCPARTY DQK /Q /M wrote a roster before Begin'
}
# Create then Begin: one native member, slot 80h, name LUNA.
Invoke-Gate ($createInput + "b`r")
$gatePath = Join-Path $build 'DQKGATE.GBP'
if (-not (Test-Path $gatePath)) { throw 'CCPARTY DQK /Q /M create+Begin wrote no roster' }
$gate = [IO.File]::ReadAllBytes($gatePath)
if ($gate.Length -ne 426 -or
    [Text.Encoding]::ASCII.GetString($gate, 0, 4) -ne 'GBPR' -or
    [BitConverter]::ToUInt16($gate, 4) -ne 2 -or
    [BitConverter]::ToUInt16($gate, 6) -ne 1 -or
    [BitConverter]::ToUInt16($gate, 12) -ne 3 -or
    $gate[16] -ne 0x80 -or
    [Text.Encoding]::ASCII.GetString($gate, 18, 4) -ne 'LUNA') {
  throw 'CCPARTY DQK /Q /M create+Begin roster was not one native LUNA member at slot 80h'
}
Remove-Item (Join-Path $run 'SAVE') -Recurse -Force
Remove-Item $gatePath, (Join-Path $build 'DQKGATE.TXT'), (Join-Path $build 'DQKIN.TXT') -Force

# --- _GBDICE.BIN front-door goldens (T6) ------------------------------------
# dq_dice_init (dqkcreate.inc) opens _GBDICE.BIN from CCPARTY's CURRENT
# directory.  GBBOOT only changes directory when GAME\DQK.EXE exists; here
# DQK.EXE sits in the root of $run (D:), so the children run in $run.  Each of
# the four CCPARTY execs reopens the file, so every member consumes the same
# dice prefix.  Expected bytes come from tools/dqk_character_rules.py, never
# from engine output.
$modelPy = (Get-Command python -ErrorAction Stop).Source
$modelTool = Join-Path $root 'tools\dqk_character_rules.py'
$diceA = [byte[]](5,9,3,7,2,8,6,4,1,0,11,13,17,19,23,29,31,37,41,43)
$diceB = [byte[]](9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28)
function ConvertTo-Hex([byte[]]$b) { ($b | ForEach-Object { $_.ToString('x2') }) -join '' }
function Get-Model([string]$Name, [string]$Class, [byte[]]$Dice) {
  $o = Join-Path $build '_dqk_model_full.bin'
  $j = & $modelPy -I $modelTool --create $Name --class $Class --race 6 --con 15 --dice (ConvertTo-Hex $Dice) --out $o
  if ($LASTEXITCODE -ne 0) { throw "DQK rules model failed for $Name/$Class" }
  $s = ($j -join '') | ConvertFrom-Json
  [pscustomobject]@{ Bytes = [IO.File]::ReadAllBytes($o); MaxHp = [int]$s.max_hp }
}
$createMembers = @(
  @{ Name = 'CLERIC';  Class = 'cleric' },
  @{ Name = 'FIGHTER'; Class = 'fighter' },
  @{ Name = 'MAGE';    Class = 'mage' },
  @{ Name = 'THIEF';   Class = 'thief' }
)
function Reset-CreateRun {
  Remove-Item (Join-Path $run 'SAVE') -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force (Join-Path $run 'SAVE') | Out-Null
  Remove-Item $gbprPathEarly, (Join-Path $build '_GBSEED.BIN'), (Join-Path $build 'DQKCREATE.TXT') -Force -ErrorAction SilentlyContinue
  Set-Session 10 0 4 16 11
}
$gbprPathEarly = Join-Path $build '_GBPARTY.GBP'
function Invoke-CreateRun([string]$Label) {
  Reset-CreateRun
  $pp = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
  if (-not $pp.WaitForExit(60000)) {
    Stop-DosBoxSmoke -Process $pp
    throw "GBBOOT DQK /R $Label run timed out"
  }
  if (-not (Test-Path $gbprPathEarly)) { throw "GBBOOT DQK /R $Label run created no _GBPARTY.GBP" }
  $g = [IO.File]::ReadAllBytes($gbprPathEarly)
  if ($g.Length -ne 1656) { throw "GBBOOT DQK /R $Label GBPR length expected 1656, got $($g.Length)" }
  $g
}
function Assert-ExactCreate([byte[]]$Gbpr, [byte[]]$Dice, [string]$Label) {
  for ($i = 0; $i -lt 4; $i++) {
    $m = $createMembers[$i]
    $model = Get-Model $m.Name $m.Class $Dice
    $qch = Join-Path $run ('SAVE\{0}.QCH' -f $m.Name)
    if (-not (Test-Path $qch)) { throw "$Label missing $($m.Name).QCH" }
    $got = [IO.File]::ReadAllBytes($qch)
    if ($got.Length -ne 414 -or (ConvertTo-Hex $got) -ne (ConvertTo-Hex $model.Bytes)) {
      $first = -1
      for ($k = 0; $k -lt [Math]::Min($got.Length, $model.Bytes.Length); $k++) { if ($got[$k] -ne $model.Bytes[$k]) { $first = $k; break } }
      throw "$Label $($m.Name).QCH differs from the rules model (len $($got.Length), first diff at byte $first, model max_hp $($model.MaxHp))"
    }
    $meta = 16 + ($i * 410) + 1 + 216
    if ([BitConverter]::ToInt16($Gbpr, $meta + 6) -ne $model.MaxHp -or
        [BitConverter]::ToUInt16($Gbpr, $meta + 26) -ne $model.MaxHp) {
      throw "$Label $($m.Name) GBD1 hp/max expected $($model.MaxHp), got $([BitConverter]::ToInt16($Gbpr, $meta + 6))/$([BitConverter]::ToUInt16($Gbpr, $meta + 26))"
    }
  }
}
# Premise: the two dice sets must produce different model HP for every member,
# otherwise matching dice A and dice B would prove nothing.
foreach ($m in $createMembers) {
  $ha = (Get-Model $m.Name $m.Class $diceA).MaxHp
  $hb = (Get-Model $m.Name $m.Class $diceB).MaxHp
  if ($ha -eq $hb) { throw "premise: dice A and B give the same model HP ($ha) for $($m.Name); the golden could not discriminate" }
}
$dicePath = Join-Path $run '_GBDICE.BIN'
# Dice set B first (a second set that must also match, differing from A).
[IO.File]::WriteAllBytes($dicePath, $diceB)
$gB = Invoke-CreateRun 'dice-B'
Assert-ExactCreate $gB $diceB 'GBBOOT DQK /R dice-B'
# Control: no dice file -> timer dice; creation must still succeed with HP > 0
# and must NOT be forced onto either dice set's bytes.
Remove-Item $dicePath -Force
$g0 = Invoke-CreateRun 'no-dice'
for ($i = 0; $i -lt 4; $i++) {
  $meta = 16 + ($i * 410) + 1 + 216
  if ([BitConverter]::ToInt16($g0, $meta + 6) -le 0) { throw "GBBOOT DQK /R no-dice control row $i had no HP" }
}
# Dice set A is left in place for the main run below.
[IO.File]::WriteAllBytes($dicePath, $diceA)

# Retail DQK installs ship a SAVE directory; the native QCH writer needs it.
Remove-Item (Join-Path $run 'SAVE') -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $gbprPathEarly, (Join-Path $build '_GBSEED.BIN') -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $run 'SAVE') | Out-Null
Set-Session 10 0 4 16 11
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'GBBOOT DQK /R create flow timed out'
}

$gbprPath = Join-Path $build '_GBPARTY.GBP'
if (-not (Test-Path $gbprPath)) { throw 'GBBOOT DQK /R did not create _GBPARTY.GBP' }
$gbpr = [IO.File]::ReadAllBytes($gbprPath)
if ($gbpr.Length -ne 1656 -or
    [Text.Encoding]::ASCII.GetString($gbpr, 0, 4) -ne 'GBPR' -or
    [BitConverter]::ToUInt16($gbpr, 4) -ne 2 -or
    [BitConverter]::ToUInt16($gbpr, 6) -ne 4 -or
    [BitConverter]::ToUInt16($gbpr, 8) -ne 410 -or
    [BitConverter]::ToUInt16($gbpr, 10) -ne 1 -or
    [BitConverter]::ToUInt16($gbpr, 12) -ne 3 -or
    [BitConverter]::ToUInt16($gbpr, 14) -ne 1) {
  throw 'GBBOOT DQK /R created an invalid compact GBPR header'
}

# Headless /R creation now runs the title-owned DQK rules (CCPARTY routes
# /G /ID 3 /C through dqk_create).  Level and the 414-byte QCH shape are NOT
# captured from the engine: they come from tools/dqk_character_rules.py
# (1,000,001 starting XP, XP-driven level loop, Human race caps).  Hit points
# depend on the dice, which /R supplies through _GBDICE.BIN in the current
# directory (CCPARTY opt-in, 0a889399), so HP is only required to be positive and
# self-consistent in the first loop; the byte-exact comparison against the
# model with _GBDICE.BIN (dice A, plus dice B and a no-file control run above)
# is Assert-ExactCreate below.
function Get-ModelLevel([string]$Name, [string]$Class) {
  $j = & $modelPy -I $modelTool --create $Name --class $Class --race 6 --con 15 --dice 05090307020806040100 --out (Join-Path $build '_dqk_model.bin')
  if ($LASTEXITCODE -ne 0) { throw "DQK rules model failed for $Name/$Class" }
  $o = ($j -join '') | ConvertFrom-Json
  return [int](($o.levels | Where-Object { $_ -ne 0 } | Select-Object -First 1))
}
$expected = @(
  @{ Slot = 0x80; Name = 'CLERIC'; Class = 'cleric'; MetaClass = 2 },
  @{ Slot = 0x81; Name = 'FIGHTER'; Class = 'fighter'; MetaClass = 1 },
  @{ Slot = 0x82; Name = 'MAGE'; Class = 'mage'; MetaClass = 3 },
  @{ Slot = 0x83; Name = 'THIEF'; Class = 'thief'; MetaClass = 4 }
)
foreach ($e in $expected) { $e.Level = Get-ModelLevel $e.Name $e.Class }
for ($i = 0; $i -lt $expected.Count; $i++) {
  $off = 16 + ($i * 410)
  $record = $off + 1
  $meta = $record + 216
  $name = [Text.Encoding]::ASCII.GetString($gbpr, $record + 1, $gbpr[$record])
  if ($gbpr[$off] -ne $expected[$i].Slot -or
      $name -ne $expected[$i].Name -or
      [Text.Encoding]::ASCII.GetString($gbpr, $meta, 4) -ne 'GBD1' -or
      [BitConverter]::ToUInt16($gbpr, $meta + 4) -ne 1 -or
      [BitConverter]::ToInt16($gbpr, $meta + 6) -le 0 -or
      [BitConverter]::ToUInt16($gbpr, $meta + 10) -ne 1 -or
      [BitConverter]::ToUInt16($gbpr, $meta + 12) -ne 2 -or
      [BitConverter]::ToUInt16($gbpr, $meta + 16) -ne $expected[$i].Level -or
      [BitConverter]::ToUInt16($gbpr, $meta + 26) -ne [BitConverter]::ToUInt16($gbpr, $meta + 6) -or
      $gbpr[$meta + 18] -ne $expected[$i].MetaClass -or
      [BitConverter]::ToUInt16($gbpr, $meta + 22) -ne 4 -or
      [BitConverter]::ToUInt16($gbpr, $meta + 26) -le 0) {
    throw "GBBOOT DQK /R created invalid compact row $i (level expected $($expected[$i].Level) from the DQK rules model)"
  }
  $qchFile = Join-Path $run ('SAVE\{0}.QCH' -f $expected[$i].Name)
  if (-not (Test-Path $qchFile) -or (Get-Item $qchFile).Length -ne 414 -or
      [BitConverter]::ToUInt32([IO.File]::ReadAllBytes($qchFile), 0x44) -ne 1000001) {
    throw "GBBOOT DQK /R did not write a 414-byte DQK-rules QCH (XP 1000001) for $($expected[$i].Name)"
  }
}

Assert-ExactCreate $gbpr $diceA 'GBBOOT DQK /R dice-A'

$seedPath = Join-Path $build '_GBSEED.BIN'
$seed = [IO.File]::ReadAllBytes($seedPath)
if ([Text.Encoding]::ASCII.GetString($seed, 0, 4) -ne 'GBPS' -or
    [BitConverter]::ToUInt16($seed, 4) -lt 2 -or
    ([BitConverter]::ToUInt16($seed, 6) -band 1) -eq 0 -or
    [BitConverter]::ToUInt16($seed, 8) -ne 4 -or
    $seed[17] -ne 4) {
  throw 'GBBOOT DQK /R did not refresh GBPS from the native-created compact roster'
}
for ($i = 0; $i -lt 4; $i++) {
  if ([BitConverter]::ToUInt16($seed, 70 + ($i * 2)) -ne 4) {
    throw "GBBOOT DQK /R GBPS move row $i was not refreshed from GBD1 metadata"
  }
}

$session = [IO.File]::ReadAllBytes((Join-Path $build '_GBSESS.GBS'))
$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
if ([Text.Encoding]::ASCII.GetString($step, 0, 4) -ne 'GBST' -or
    [BitConverter]::ToUInt16($step, 6) -ne 22 -or
    [BitConverter]::ToUInt16($step, 8) -ne 10 -or
    [BitConverter]::ToUInt16($step, 10) -ne 1 -or
    [BitConverter]::ToUInt16($step, 12) -ne 4 -or
    [BitConverter]::ToUInt16($session, 6) -ne 10 -or
    [BitConverter]::ToUInt16($session, 8) -ne 1 -or
    [BitConverter]::ToUInt16($session, 10) -ne 4) {
  throw 'GBBOOT DQK /R create flow did not produce the expected bounded exploration step'
}
$effect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
if ($effect -notlike '*status=0000*' -or
    $effect -notlike '*#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 0005 TEXT=TAVERN*') {
  throw 'GBBOOT DQK /R create flow did not continue into the expected TAVERN event'
}

$beforeCombat = [byte[]]$gbpr.Clone()
$combatConf = Join-Path $build '_gbdqk_create_combat_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$run"
D:
C:\GBBOOT /E /X /A 5 /3 0 > C:\DQKCREC.TXT
exit
"@ | Set-Content $combatConf -Encoding ASCII

Remove-Item (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBEVT.BIN'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build 'DQKCREC.TXT') -Force -ErrorAction SilentlyContinue

Set-Session 0 1 0 10 10
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $combatConf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'GBBOOT DQK /R persisted combat flow timed out'
}

$afterReload = [IO.File]::ReadAllBytes($gbprPath)
if ($afterReload.Length -ne $beforeCombat.Length -or
    [Text.Encoding]::ASCII.GetString($afterReload, 0, 4) -ne 'GBPR' -or
    [BitConverter]::ToUInt16($afterReload, 6) -ne 4 -or
    [BitConverter]::ToUInt16($afterReload, 10) -ne 1) {
  throw 'GBBOOT DQK /R persisted compact roster was not reloaded before combat'
}

$combat = Get-Content (Join-Path $build '_GBECL.TXT') -Raw

# Run these BEFORE the literal needles below, deliberately. The exact
# "count=0004" needle is a pin on the retail framing AND on CCECL's RNG draw;
# these two checks are the part that survives a re-seeded RNG, and putting them
# first is what makes them capable of failing at all -- behind the exact needle
# they could never fire, which would make them decoration rather than a test.
# Both ranges come from the retail DISK3\ECL.GLB area-5 script, which computes
# its two group sizes just before loading the monsters (block offsets, +0x5860
# for ECL.GLB file offsets):
#   1167  RANDOM #5, 0x00C1 ; 116D ADD #5, 0x00C1, 0x00C1  -> 5+(rnd%5) in {5..9}
#   1176  RANDOM #3, 0x00C2 ; 117C ADD #3, 0x00C2, 0x00C2  -> 3+(rnd%3) in {3,4,5}
#   119B  LOAD_MONSTER #46, 0x00C2, #46
# 0x00C1 is pinned by nothing else in this file, so it is a live check on the
# operand stream reaching those RANDOM/ADD pairs at all: before commit e3ce79f
# the long PARLAY frame swallowed them and CCECL's own host seeds ([0x00C1]=3,
# [0x00C2]=2, derive_dqk_handler_state) leaked through instead -- both outside
# these ranges.
$mem = @{}
foreach ($m in ([regex]'MEM key=([0-9A-F]{4}) value=([0-9A-F]{4})').Matches($combat)) {
  $mem[$m.Groups[1].Value] = [Convert]::ToInt32($m.Groups[2].Value, 16)
}
foreach ($w in @(@('00C1', 5, 9), @('00C2', 3, 5))) {
  if (-not $mem.ContainsKey($w[0])) {
    throw "GBBOOT DQK /R combat effect dump did not report ECL word $($w[0])"
  }
  if ($mem[$w[0]] -lt $w[1] -or $mem[$w[0]] -gt $w[2]) {
    throw "GBBOOT DQK /R ECL word $($w[0]) is $($mem[$w[0]]), outside the retail range {$($w[1])..$($w[2])} -- the area-5 RANDOM/ADD pair did not run"
  }
}
$monsterLine = ([regex]'@00 MONSTER id=002E count=([0-9A-F]{4}) pic=002E').Match($combat)
if (-not $monsterLine.Success) {
  throw 'GBBOOT DQK /R combat effect dump had no id=002E dragon group'
}
$dragonCount = [Convert]::ToInt32($monsterLine.Groups[1].Value, 16)
if ($dragonCount -ne $mem['00C2']) {
  throw "GBBOOT DQK /R dragon group count $dragonCount does not match the ECL word 0x00C2 it is read from ($($mem['00C2']))"
}

foreach ($needle in @(
  'GBEF v0009 flags=0069 status=0003 geo=0002 chain=FFFF',
  'GBEC groups=0001',
  # count was 0002 until 2026-07-28, and 0002 was never a value from the game.
  # In retail DISK3\ECL.GLB area 5 the dragon group's count operand is the ECL
  # word 0x00C2, which the script computes six instructions earlier:
  #   1176  RANDOM #3, 0x00C2         -> [0x00C2] = rnd % 3
  #   117C  ADD    #3, 0x00C2, 0x00C2 -> [0x00C2] = 3 + (rnd % 3)  in {3,4,5}
  #   119B  LOAD_MONSTER #46, 0x00C2, #46
  # (block offsets; +0x5860 for ECL.GLB file offsets. id 0x2E is BLACK DRAGON in
  # retail DISK2\MONCHA.GLB, on the branch that prints "DRAGONS".)
  # Before commit e3ce79f the engine read PARLAY (0x2C) as a Gen1 six-operand
  # long frame instead of the retail one-operand short frame, and the resulting
  # desync SWALLOWED that RANDOM/ADD pair -- so the count that reached
  # LOAD_MONSTER was ccecl.asm derive_dqk_handler_state's own host seed
  # [0x00C2]=2 leaking out through the dump. 0002 is outside {3,4,5} and was
  # therefore never obtainable from the data; ccecl.asm's op_parlay comment says
  # the old reader "changes the dragon count". e3ce79f re-pinned the sibling
  # literal in gbdqk-combat-flow-test.ps1 and missed this file and
  # gbdqk-playable-flow-test.ps1, so both have been red since that day.
  # Null for the framing change, measured over the whole retail corpus: the
  # short framing decodes all 47 ECL.GLB members with 0 bad-opcode halts; the
  # long framing halts 376 times across 45 of them.
  # The id and pic are NOT stale. docs/engine/research/
  # sol-dqk-area5-effect-contract-advice.md asks for "002E x2 -> 0025 x4" here,
  # but 0x25 is ZOMBIE on area 5's separate UNDEAD branch; this is the dragon
  # branch and the engine still emits id=002E pic=002E.
  '@00 MONSTER id=002E count=0004 pic=002E'
)) {
  if ($combat -notlike "*$needle*") {
    throw "GBBOOT DQK /R combat effect dump missing: $needle"
  }
}

$trace = @(Get-Content (Join-Path $build '_GBCOMB.TRC') | Where-Object { $_.Trim().Length -gt 0 })
if ($trace.Count -lt 20 -or
    $trace[0] -ne '1 init p0 - - - - - - -' -or
    $trace[1] -ne '1 init p1 - - - - - - -' -or
    $trace[2] -ne '1 init p2 - - - - - - -' -or
    $trace[3] -ne '1 init p3 - - - - - - -' -or
    $trace[4] -ne '1 init e0 - - - - - - -' -or
    $trace[5] -ne '1 init e1 - - - - - - -') {
  throw 'GBBOOT DQK /R combat trace did not use the four native-created compact party members'
}

$outcome = (Get-Content (Join-Path $build '_GBCOMB.OUT') -Raw).Trim()
if ($outcome -notin @('party', 'enemy', 'draw')) {
  throw "GBBOOT DQK /R combat outcome was invalid: $outcome"
}
Assert-RawFrame (Join-Path $build '_GBCOMB.RAW') 'GBBOOT DQK /R combat snapshot' 4

$gbcr = [IO.File]::ReadAllBytes((Join-Path $build '_GBCR.BIN'))
if ([Text.Encoding]::ASCII.GetString($gbcr, 0, 4) -ne 'GBCR' -or
    [BitConverter]::ToUInt16($gbcr, 4) -ne 1 -or
    [BitConverter]::ToUInt16($gbcr, 10) -ne 4) {
  throw 'GBBOOT DQK /R combat did not write a four-member GBCR sidecar'
}

Write-Output "RESULT: GBBOOT DQK /E repeated /R native compact create, exploration, persisted reload, and tactical handoff PASS ($outcome)"
