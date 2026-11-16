# ccefx-test.ps1 -- headless smoke test for CCEFX GBEF/GBSX/GBSL dumping.
#
# Builds CCEFX.COM, feeds it a synthetic v8 CCECL effect bridge record, and
# verifies the DOS-side text dump includes map/wall-piece bridge data,
# encounter/NPC handoff data, opcode names, operands, decoded inline text slots
# from the v6-format GBSX tail, the GBRS resume tail, the v7 GBES setup tail,
# the v8 GBHD halt-diagnostic tail, and the v9 GBCL clock tail.
param(
  [switch]$Headless
)
$ErrorActionPreference = "Stop"

$root = (Split-Path -Parent $PSScriptRoot)
$native = Join-Path $root "native"
$build = Join-Path $native "build"
$run = Join-Path $build "ccefx-test"
$dosbox = Join-Path $root "The Dark Queen of Krynn\DOSBOX\DOSBox.exe"
. (Join-Path $native "dosbox-smoke.ps1")

& (Join-Path $native "build.ps1") -Target ccefx

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null
Copy-Item (Join-Path $build "ccefx.com") (Join-Path $run "CCEFX.COM") -Force

$GbefLength = 5750
$GbefScriptOffset = 2246
$GbefScriptEventOffset = 2252
$GbefScriptRecordBytes = 20
$GbefScriptTextOffset = 3532
$GbefScriptTextRecordBytes = 34
$GbefSetupOffset = 5708
$GbefHaltOffset = 5720
$GbefClockOffset = 5732

$b = New-Object byte[] $GbefLength
function Set-Ascii([int]$Offset, [string]$Text) {
  [Text.Encoding]::ASCII.GetBytes($Text).CopyTo($b, $Offset)
}
function Set-U16([int]$Offset, [int]$Value) {
  [BitConverter]::GetBytes([UInt16]$Value).CopyTo($b, $Offset)
}
function Set-U32([int]$Offset, [uint32]$Value) {
  [BitConverter]::GetBytes([UInt32]$Value).CopyTo($b, $Offset)
}
function Set-Event([int]$Index, [int]$Opcode, [int]$Argc, [int[]]$Operands) {
  $base = $GbefScriptEventOffset + ($Index * $GbefScriptRecordBytes)
  Set-U16 $base $Opcode
  Set-U16 ($base + 2) $Argc
  for ($i = 0; $i -lt $Operands.Count; $i++) {
    Set-U16 ($base + 4 + ($i * 2)) $Operands[$i]
  }
}
function Set-Text([int]$Index, [string]$Text) {
  $raw = [Text.Encoding]::ASCII.GetBytes($Text)
  $base = $GbefScriptTextOffset + ($Index * $GbefScriptTextRecordBytes)
  Set-U16 $base $raw.Length
  $raw.CopyTo($b, $base + 2)
}

Set-Ascii 0 "GBEF"
Set-U16 4 9
Set-U16 6 0xFB
Set-U16 8 4
Set-U16 10 34
Set-U16 12 34
Set-U16 14 2
Set-U16 16 0xFF
Set-U16 18 3
Set-U16 20 4
Set-U16 22 23
Set-U16 24 31
Set-U16 26 32
Set-U16 28 0
Set-U16 30 0xFFFF
Set-U16 32 2
Set-U16 34 9
Set-U16 36 3
Set-U16 38 5
Set-U16 40 19
Set-U16 42 1
Set-U16 44 2
Set-U16 82 1
Set-U16 84 48
Set-U16 86 100
Set-Ascii 116 "GBRS"
Set-U16 120 1
Set-U16 122 0xFFFF
Set-U16 124 0x0123
Set-U32 126 ([Convert]::ToUInt32("89ABCDEF", 16))
Set-U16 130 2
Set-U16 132 0x0101
Set-U16 134 0x0202
Set-U16 196 2
Set-U16 198 0x4BE7
Set-U16 200 0x4BE8
Set-U16 1222 1
Set-U16 1224 2
Set-Ascii $GbefScriptOffset "GBSX"
Set-U16 ($GbefScriptOffset + 4) 16
Set-Event 0 0x27 8 @(1,2,3,4,5,6,7,8)
Set-Event 1 0x11 1 @(5)
Set-Text 1 "HELLO"
Set-Event 2 0x29 14 @(9,10,11,12,13,14,15,16)
Set-Event 3 0x2C 6 @(11,22,33,44,55,0x0108)
Set-Event 4 0x1F 2 @(17,18)
Set-Event 5 0x0F 2 @(10,0x0100)
Set-Event 6 0x10 2 @(0x0101,0)
Set-Event 7 0x28 3 @(1,10,30)
Set-Event 8 0x2E 7 @(0x80,2,6,1,0x80,1,2)
Set-Event 9 0x2D 2 @(0x2E10,0xAE11)
Set-Event 10 0x1D 2 @(0,7)
Set-Event 11 0x34 2 @(5,2)
Set-Event 12 0x38 1 @(0)
Set-Event 13 0x15 5 @(0x0102,4,2,1,1)
Set-Event 14 0x2B 4 @(0x0104,2,1,1)
Set-Event 15 0x39 2 @(0x0106,3)
Set-Ascii $GbefSetupOffset "GBES"
Set-U16 ($GbefSetupOffset + 4) 9
Set-U16 ($GbefSetupOffset + 6) 3
Set-U16 ($GbefSetupOffset + 8) 5
Set-U16 ($GbefSetupOffset + 10) 1
Set-Ascii $GbefHaltOffset "GBHD"
Set-U16 ($GbefHaltOffset + 4) 1
Set-U16 ($GbefHaltOffset + 6) 0x0123
Set-U16 ($GbefHaltOffset + 8) 0x0048
Set-U16 ($GbefHaltOffset + 10) 0x0030
Set-Ascii $GbefClockOffset "GBCL"
Set-U16 ($GbefClockOffset + 4) 0
Set-U16 ($GbefClockOffset + 6) 0
Set-U16 ($GbefClockOffset + 8) 5
Set-U16 ($GbefClockOffset + 10) 0
Set-U16 ($GbefClockOffset + 12) 0
Set-U16 ($GbefClockOffset + 14) 0
Set-U16 ($GbefClockOffset + 16) 0

[IO.File]::WriteAllBytes((Join-Path $run "SCRIPT.EFX"), $b)

$mainEffect = $b
# A flagged bridge must consume its exact sibling GBSL stream rather than the
# fixed 64-record GBSX tail. 129 records crosses two CCECL capacity replays.
$sideEffect = [byte[]]$mainEffect.Clone()
$b = $sideEffect
Set-U16 6 0x01FB
[IO.File]::WriteAllBytes((Join-Path $run "SIDE.EFX"), $sideEffect)
$side = New-Object byte[] (8 + 129 * 54)
[Text.Encoding]::ASCII.GetBytes("GBSL").CopyTo($side, 0)
[BitConverter]::GetBytes([UInt16]1).CopyTo($side, 4)
[BitConverter]::GetBytes([UInt16]129).CopyTo($side, 6)
for ($i = 0; $i -lt 129; $i++) {
  $offset = 8 + $i * 54
  [BitConverter]::GetBytes([UInt16]0x000e).CopyTo($side, $offset)
  [BitConverter]::GetBytes([UInt16]1).CopyTo($side, $offset + 2)
  [BitConverter]::GetBytes([UInt16]($i + 1)).CopyTo($side, $offset + 4)
}
[IO.File]::WriteAllBytes((Join-Path $run "SIDE.GBS"), $side)
[IO.File]::WriteAllBytes((Join-Path $run "NOGBS.EFX"), $sideEffect)
$b = New-Object byte[] $GbefLength
Set-Ascii 0 "GBEF"
Set-U16 4 9
Set-U16 6 0x20
Set-U16 8 0
Set-Ascii $GbefScriptOffset "GBSX"
Set-U16 ($GbefScriptOffset + 4) 3
Set-Event 0 0x1D 2 @(0,7)
Set-Event 1 0x22 3 @(0x0110,0x0111,1)
Set-Event 2 0x23 5 @(0,0,2,4,1)
[IO.File]::WriteAllBytes((Join-Path $run "PRED.EFX"), $b)
$b = $mainEffect
$b = [byte[]]$mainEffect.Clone()
Set-U16 ($GbefHaltOffset + 4) 7
[IO.File]::WriteAllBytes((Join-Path $run "CAP.EFX"), $b)
# CCFLOW's loop marker: the same record with GBHD reason 10 (HALT_LOOP_DETECTED).
$b = [byte[]]$mainEffect.Clone()
Set-U16 ($GbefHaltOffset + 4) 10
[IO.File]::WriteAllBytes((Join-Path $run "LOOP.EFX"), $b)
$b = $mainEffect
Copy-Item (Join-Path $run "SCRIPT.EFX") (Join-Path $run "_GBECL.BIN") -Force
[IO.File]::WriteAllBytes((Join-Path $run "_GBHOST.BIN"), [byte[]]@(0x47,0x42,0x48,0x53,1,0,1,0,0,0,0,0))
$bridge = Join-Path $run "BRIDGE"
New-Item -ItemType Directory -Force $bridge | Out-Null
Copy-Item (Join-Path $run "SCRIPT.EFX") (Join-Path $bridge "_GBECL.BIN") -Force
[IO.File]::WriteAllBytes((Join-Path $bridge "_GBHOST.BIN"), [byte[]]@(0x47,0x42,0x48,0x53,1,0,1,0,0,0,0,0))
$truncated = Join-Path $run "TRUNC"
$malformed = Join-Path $run "MALFORM"
New-Item -ItemType Directory -Force $truncated,$malformed | Out-Null
[IO.File]::WriteAllBytes((Join-Path $truncated "_GBHOST.BIN"), [byte[]]@(0x47,0x42,0x48,0x53,1,0,1,0,0,0,0))
[IO.File]::WriteAllBytes((Join-Path $malformed "_GBHOST.BIN"), [byte[]]@(0x42,0x41,0x44,0x53,1,0,1,0,0,0,0,0))

$conf = Join-Path $run "_ccefx.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
mount C "$run"
C:
CCEFX C:\SCRIPT.EFX > C:\DUMP.TXT
CCEFX C:\SCRIPT.EFX C:\DUMP2.TXT > NUL
CCEFX C:\PRED.EFX > C:\PRED.TXT
CCEFX C:\CAP.EFX > C:\CAP.TXT
CCEFX C:\LOOP.EFX > C:\LOOP.TXT
CCEFX C:\SIDE.EFX > C:\SIDE.TXT
CCEFX C:\NOGBS.EFX > C:\NOGBS.TXT
CCEFX /H > C:\HOST.TXT
CCEFX /H C:\BRIDGE\_GBHOST.BIN > C:\HOSTPATH.TXT
CCEFX /H C:\TRUNC\_GBHOST.BIN > C:\TRUNC.LOG
CCEFX /H C:\MALFORM\_GBHOST.BIN > C:\MALFORM.LOG
exit
"@ | Set-Content -Path $conf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  try { $p.Kill() } catch {}
  throw "DOSBox did not exit while running CCEFX smoke test"
}

$dumpPath = Join-Path $run "DUMP.TXT"
if (-not (Test-Path $dumpPath)) {
  throw "CCEFX smoke failed: dump output was not created"
}
$dump2Path = Join-Path $run "DUMP2.TXT"
if (-not (Test-Path $dump2Path)) {
  throw "CCEFX smoke failed: file-mode dump output was not created"
}

$dump = Get-Content $dumpPath -Raw
$dump2 = Get-Content $dump2Path -Raw
$capDump = Get-Content (Join-Path $run "CAP.TXT") -Raw
$sideDump = Get-Content (Join-Path $run "SIDE.TXT") -Raw
if (
  $sideDump -notlike "*GBSL count=0081*" -or
  $sideDump -notlike "*#00 OP=0E PICTURE ARGC=01 ARGS= 0001*" -or
  $sideDump -notlike "*#80 OP=0E PICTURE ARGC=01 ARGS= 0081*" -or
  ([regex]::Matches($sideDump, 'OP=0E PICTURE ARGC=01')).Count -ne 129
) { throw "CCEFX did not stream all 129 ordered GBSL records" }
$noGbsDump = Get-Content (Join-Path $run "NOGBS.TXT") -Raw
if ($noGbsDump -notlike "*CCEFX: bad or truncated GBEF/GBSX record*") {
  throw "CCEFX accepted a flagged effect with no sibling GBSL stream"
}
if (-not $capDump.Contains("GBHD reason=0007 script-effect-capacity area=0030 pc=0123 op=0048")) {
  throw "CCEFX smoke failed: script-effect capacity halt was not named"
}
$loopDump = Get-Content (Join-Path $run "LOOP.TXT") -Raw
if (-not $loopDump.Contains("GBHD reason=000A loop-detected area=0030 pc=0123 op=0048")) {
  throw "CCEFX did not label GBHD reason 10 as loop-detected"
}
if ($capDump -like "*loop-detected*" -or $capDump -like "*GBHD reason=000A*") {
  throw "CCEFX labelled the reason-7 capacity record as loop-detected"
}
$hostPath = Join-Path $run "_GBECL.TXT"
if (-not (Test-Path $hostPath)) { throw "CCEFX host bridge did not write the selected transcript" }
$hostDump = Get-Content $hostPath -Raw
if ($hostDump -ne $dump) { throw "CCEFX host bridge transcript differs from ordinary dispatch" }
$hostPath = Join-Path $bridge "_GBECL.TXT"
if (-not (Test-Path $hostPath)) { throw "CCEFX explicit host-state path did not write beside its state file" }
$hostDump = Get-Content $hostPath -Raw
if ($hostDump -ne $dump) { throw "CCEFX explicit host-state path transcript differs from ordinary dispatch" }
foreach ($case in @(
  @{ Dir = $truncated; Log = "TRUNC.LOG" },
  @{ Dir = $malformed; Log = "MALFORM.LOG" }
)) {
  $log = Get-Content (Join-Path $run $case.Log) -Raw
  if ($log -notlike "*CCEFX: bad or truncated GBEF/GBSX record*") {
    throw "CCEFX did not reject invalid host state in $($case.Dir)"
  }
  if (Test-Path (Join-Path $case.Dir "_GBECL.TXT")) {
    throw "CCEFX opened a transcript path after rejecting host state in $($case.Dir)"
  }
}
$predPath = Join-Path $run "PRED.TXT"
if (-not (Test-Path $predPath)) {
  throw "CCEFX smoke failed: predicate dump output was not created"
}
$pred = Get-Content $predPath -Raw
$needles = @(
  "GBEF v0009 flags=00FB status=0004 geo=0022 chain=FFFF",
  "GBLF operands=0022 0002 00FF",
  "GBLP raw=0003 0004 0017 sets=001F 0020 0000",
  "GBEC groups=0002",
  "@00 MONSTER id=0009 count=0003 pic=0005",
  "@01 MONSTER id=0013 count=0001 pic=0002",
  "GBNJ joins=0001",
  "@00 NPC id=0030 morale=0064",
  "GBRS flags=0001 area=FFFF pc=0123 rng=89ABCDEF callsp=0002 mem=0002",
  "GBRS stack= 0101 0202",
  "GBRS memdump=0002",
  "@00 MEM key=4BE7 value=0001",
  "@01 MEM key=4BE8 value=0002",
  "GBSX count=0010",
  "GBES setup sprite=0009 max=0003 pic=0005 distance=0001",
  "GBHD reason=0001 area=0030 pc=0123 op=0048",
  "GBCL clock= 0000 0000 0005 0000 0000 0000 0000",
  "#00 OP=27 TREASURE ARGC=08 ARGS= 0001 0002 0003 0004 0005 0006 0007 0008",
  "TREASURE=copper:0001 electrum:0002 silver:0003 gold:0004 platinum:0005 gems:0006 jewelry:0007 item:0008 source:itemBlock",
  "#01 OP=11 PRINT ARGC=01 ARGS= 0005 TEXT=HELLO",
  "#02 OP=29 ENCOUNTER_MENU ARGC=0E ARGS= 0009 000A 000B 000C 000D 000E 000F 0010",
  "#03 OP=2C PARLAY ARGC=06 ARGS= 000B 0016 0021 002C 0037 0108",
  "#04 OP=1F UNKNOWN_1F ARGC=02 ARGS= 0011 0012",
  "#05 OP=0F INPUT_NUMBER ARGC=02 ARGS= 000A 0100",
  "#06 OP=10 INPUT_STRING ARGC=02 ARGS= 0101 0000",
  "#07 OP=28 ROB ARGC=03 ARGS= 0001 000A 001E ROB=scope:party loss:000A keep:005A itemChance:001E",
  "#08 OP=2E DAMAGE ARGC=07 ARGS= 0080 0002 0006 0001 0080 0001 0002 DAMAGE=dice:0002D0006+0001 control:0080 target:0080 policy:selected-no-save",
  "#09 OP=2D CALL ARGC=02 ARGS= 2E10 AE11 CALL=operand:2E10 routine:AE11",
  "#0A OP=1D PARTYSTRENGTH ARGC=02 ARGS= 0000 0007",
  "#0B OP=34 ECL_CLOCK ARGC=02 ARGS= 0005 0002 ECL_CLOCK=timeStep:0005 timeSlot:0002",
  "#0C OP=38 PROGRAM ARGC=01 ARGS= 0000 PROGRAM=id:0000",
  "#0D OP=15 VERTICAL_MENU ARGC=05 ARGS= 0102 0004 0002 0001 0001",
  "#0E OP=2B HORIZONTAL_MENU ARGC=04 ARGS= 0104 0002 0001 0001",
  "#0F OP=39 WHO ARGC=02 ARGS= 0106 0003"
)
foreach ($needle in $needles) {
  if (-not $dump.Contains($needle)) {
    throw "CCEFX smoke failed: output missing '$needle'"
  }
  if (-not $dump2.Contains($needle)) {
    throw "CCEFX smoke failed: file-mode output missing '$needle'"
  }
}

$predNeedles = @(
  "GBEF v0009 flags=0020 status=0000 geo=0000 chain=0000",
  "GBSX count=0003",
  "#00 OP=1D PARTYSTRENGTH ARGC=02 ARGS= 0000 0007 PARTYSTRENGTH=metric:0000 threshold:0007",
  "#01 OP=22 PARTY_SURPRISE ARGC=03 ARGS= 0110 0111 0001 PARTY_SURPRISE=dest0:0110 dest1:0111 ranger:0001",
  "#02 OP=23 SURPRISE ARGC=05 ARGS= 0000 0000 0002 0004 0001 SURPRISE=a:0000 b:0000 c:0002 d:0004 result:0001"
)
foreach ($needle in $predNeedles) {
  if (-not $pred.Contains($needle)) {
    throw "CCEFX smoke failed: predicate output missing '$needle'"
  }
}

Write-Output "RESULT: CCEFX GBEF/GBSX/GBSL dump smoke PASS"
