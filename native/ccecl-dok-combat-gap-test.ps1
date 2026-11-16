# DoK combat-handoff gap regression.
#
# Death Knights has SearchLocation routes that reach opcode 0x24 COMBAT, but
# the currently exported GBEF handoff can have no queued LOAD_MONSTER groups.
# CCCOMBAT must reject that payload instead of inventing an encounter. This
# keeps the current DoK status explicit until the missing encounter-source path
# is implemented.
param(
  [switch]$Headless
)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'Death Knights of Krynn'
$dbx = Join-Path $root 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
# Mount a scratch mirror, never the retail release itself: `mount D "$game"`
# followed by `D:` makes the read-only GOG folder the DOS child's current drive,
# so its stray writes (CCFP.MOV, rewritten SAVE\CHRDATA*) land in the retail
# tree. CLAUDE.md: game-data folders are read-only source.
. (Join-Path $PSScriptRoot 'retail-stage.ps1')
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: CCECL DoK combat gap (DOSBox.exe absent)'
  exit 0
}
if (-not (Test-Path -LiteralPath $dbx)) {
  Write-Output 'SKIP: CCECL DoK combat gap (DOSBox-X absent)'
  exit 0
}

foreach ($name in @(
  'DKK.CFG',
  'ECL1.DAX',
  'ECL2.DAX',
  'GEO1.DAX',
  'MON1CHA.DAX',
  'WALLDEF1.DAX',
  '8X8D1.DAX'
)) {
  if (-not (Test-Path (Join-Path $game $name))) {
    Write-Output "SKIP: CCECL DoK combat gap ($name absent)"
    exit 0
  }
}

$gameMount = New-RetailStage -Source $game
& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

function Set-Session([int]$x, [int]$y, [int]$facing) {
  $s = New-Object byte[] 16
  [Text.Encoding]::ASCII.GetBytes('GBSN').CopyTo($s, 0)
  [BitConverter]::GetBytes([uint16]1).CopyTo($s, 4)
  [BitConverter]::GetBytes([uint16]$x).CopyTo($s, 6)
  [BitConverter]::GetBytes([uint16]$y).CopyTo($s, 8)
  [BitConverter]::GetBytes([uint16]$facing).CopyTo($s, 10)
  [BitConverter]::GetBytes([uint16]16).CopyTo($s, 12)
  [BitConverter]::GetBytes([uint16]16).CopyTo($s, 14)
  [IO.File]::WriteAllBytes((Join-Path $build '_GBSESS.GBS'), $s)
}

function Assert-RawFrame([string]$Path, [string]$Label, [int]$MinColors = 4) {
  if (-not (Test-Path $Path)) {
    throw "$Label did not render a raw combat viewport"
  }
  $raw = [IO.File]::ReadAllBytes($Path)
  if ($raw.Length -ne (4 + 320 * 200 + 768) -or
      [BitConverter]::ToUInt16($raw, 0) -ne 320 -or
      [BitConverter]::ToUInt16($raw, 2) -ne 200) {
    throw "$Label rendered an invalid raw combat viewport"
  }
  $seen = New-Object bool[] 256
  $colors = 0
  $nonzero = 0
  for ($i = 4; $i -lt 4 + 320 * 200; $i++) {
    $v = $raw[$i]
    if ($v -ne 0) { $nonzero++ }
    if (-not $seen[$v]) {
      $seen[$v] = $true
      $colors++
    }
  }
  if ($nonzero -lt 1000 -or $colors -lt $MinColors) {
    throw "$Label rendered a blank/sparse raw combat viewport (nonzero=$nonzero colors=$colors)"
  }
}

$conf = Join-Path $build '_ccecl_dok_combat_gap.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$gameMount"
C:
C:\CCECL D:\ECL1.DAX 32 /E C:\DOKEMPTY.BIN /J 26 /F 0 /N 6 /H 1 /Z 240 /D 4 > NUL
C:\CCEFX C:\DOKEMPTY.BIN C:\DOKEMPTY.TXT
C:\CCCOMBAT /E C:\DOKEMPTY.BIN D:\MON1CHA.DAX 4660 C:\DOKEMPTY.TRC C:\DOKEMPTY.OUT C:\DOKEMPTY.RAW > C:\DOKCOMB.TXT
C:\CCECL D:\ECL1.DAX 33 /E C:\DOKSURP.BIN /J 23 /F 0 /N 6 /H 1 /Z 240 /D 4 > NUL
C:\CCEFX C:\DOKSURP.BIN C:\DOKSURP.TXT
C:\CCECL D:\ECL1.DAX 36 /E C:\DOKSET.BIN /J 0 /N 6 /H 1 /Z 240 /D 4 /X 19691 3 /X 19462 1 /T > NUL
REN C:\CCECL.TRC DOKSET.TRC
C:\CCEFX C:\DOKSET.BIN C:\DOKSET.TXT
C:\CCECL D:\ECL1.DAX 36 /E C:\DOKJ14.BIN /J 14 /F 2 /N 6 /H 1 /Z 240 /D 4 > NUL
C:\CCEFX C:\DOKJ14.BIN C:\DOKJ14.TXT
C:\CCECL D:\ECL1.DAX 36 /E C:\DOKQ14.BIN /Q 14 /F 2 /N 6 /H 1 /Z 240 /D 4 /X 19691 3 /T > NUL
REN C:\CCECL.TRC DOKQ14.TRC
C:\CCEFX C:\DOKQ14.BIN C:\DOKQ14.TXT
C:\CCECL D:\ECL1.DAX 36 /E C:\DOKS2.BIN /2 14 /F 2 /N 6 /H 1 /Z 240 /D 4 /X 19691 3 /T > NUL
REN C:\CCECL.TRC DOKS2.TRC
C:\CCEFX C:\DOKS2.BIN C:\DOKS2.TXT
C:\CCECL D:\ECL1.DAX 36 /E C:\DOKREAL.BIN /@ 33090 /N 6 /H 1 /Z 240 /D 4 > NUL
C:\CCEFX C:\DOKREAL.BIN C:\DOKREAL.TXT
C:\CCCOMBAT /E C:\DOKREAL.BIN D:\MON1CHA.DAX 4660 C:\DOKREAL.TRC C:\DOKREAL.OUT C:\DOKREAL.RAW /R C:\DOKREAL.GBCR > NUL
C:\CCECL D:\ECL1.DAX 36 /E C:\DOKREALR.BIN /R C:\DOKREAL.BIN C:\DOKREAL.OUT > NUL
C:\CCEFX C:\DOKREALR.BIN C:\DOKREALR.TXT
C:\CCECL D:\ECL1.DAX 34 /E C:\DOKB34.BIN /@ 33090 /N 6 /H 1 /Z 240 /D 4 > NUL
C:\CCEFX C:\DOKB34.BIN C:\DOKB34.TXT
C:\CCCOMBAT /E C:\DOKB34.BIN D:\MON1CHA.DAX 4660 C:\DOKB34.TRC C:\DOKB34.OUT C:\DOKB34.RAW /R C:\DOKB34.GBCR > NUL
C:\CCECL D:\ECL1.DAX 34 /E C:\DOKB34R.BIN /R C:\DOKB34.BIN C:\DOKB34.OUT > NUL
C:\CCEFX C:\DOKB34R.BIN C:\DOKB34R.TXT
C:\CCECL D:\ECL2.DAX 51 /E C:\DOKB51.BIN /Q 29 /F 0 /N 6 /H 1 /Z 240 /D 4 /X 19689 1 /T > NUL
REN C:\CCECL.TRC DOKB51.TRC
C:\CCEFX C:\DOKB51.BIN C:\DOKB51.TXT
C:\CCCOMBAT /E C:\DOKB51.BIN D:\MON1CHA.DAX 4660 C:\DOKB51C.TRC C:\DOKB51C.OUT C:\DOKB51C.RAW /R C:\DOKB51.GBCR > NUL
C:\CCECL D:\ECL2.DAX 51 /E C:\DOKB51R.BIN /R C:\DOKB51.BIN C:\DOKB51C.OUT > NUL
C:\CCEFX C:\DOKB51R.BIN C:\DOKB51R.TXT
C:\CCECL D:\ECL2.DAX 51 /E C:\DOKB51A.BIN /Q 29 /F 0 /N 6 /H 1 /Z 240 /D 4 /X 32000 1 /X 31911 100 /T > NUL
REN C:\CCECL.TRC DOKB51A.TRC
C:\CCEFX C:\DOKB51A.BIN C:\DOKB51A.TXT
D:
C:\GBBOOT /E /X /A 1 /B 34 /@ 33090 > D:\DGBB34.TXT
COPY D:\DGBB34.TXT C:\DGBB34.TXT > NUL
COPY C:\_GBECL.TXT C:\DGB34E.TXT > NUL
COPY C:\_GBRES.TXT C:\DGB34R.TXT > NUL
COPY C:\_GBCOMB.TRC C:\DGB34C.TRC > NUL
COPY C:\_GBCOMB.OUT C:\DGB34O.TXT > NUL
COPY C:\_GBCOMB.RAW C:\DGB34W.RAW > NUL
COPY C:\_GBCR.BIN C:\DGB34C.BIN > NUL
DEL C:\_GBCOMB.TRC > NUL
DEL C:\_GBCOMB.RAW > NUL
DEL C:\_GBCR.BIN > NUL
C:\GBBOOT /E /X /A 2 /B 51 /1 29 /0 19689 1 > D:\DGB51.TXT
COPY D:\DGB51.TXT C:\DGB51.TXT > NUL
C:\CCEFX C:\_GBEVT.BIN C:\DGB51E.TXT
COPY C:\_GBECL.TXT C:\DGB51S.TXT > NUL
COPY C:\_GBRES.TXT C:\DGB51R.TXT > NUL
COPY C:\_GBCOMB.TRC C:\DGB51C.TRC > NUL
COPY C:\_GBCOMB.OUT C:\DGB51O.TXT > NUL
COPY C:\_GBCOMB.RAW C:\DGB51W.RAW > NUL
COPY C:\_GBCR.BIN C:\DGB51C.BIN > NUL
DEL C:\_GBCOMB.TRC > NUL
DEL C:\_GBCOMB.RAW > NUL
DEL C:\_GBCR.BIN > NUL
exit
"@ | Set-Content $conf -Encoding ASCII

Remove-Item (Join-Path $build 'DOKEMPTY.BIN'),
  (Join-Path $build 'DOKEMPTY.TXT'),
  (Join-Path $build 'DOKEMPTY.TRC'),
  (Join-Path $build 'DOKEMPTY.OUT'),
  (Join-Path $build 'DOKEMPTY.RAW'),
  (Join-Path $build 'DOKCOMB.TXT'),
  (Join-Path $build 'DOKSURP.BIN'),
  (Join-Path $build 'DOKSURP.TXT'),
  (Join-Path $build 'DOKSET.BIN'),
  (Join-Path $build 'DOKSET.TXT'),
  (Join-Path $build 'DOKSET.TRC'),
  (Join-Path $build 'DOKQ14.BIN'),
  (Join-Path $build 'DOKQ14.TXT'),
  (Join-Path $build 'DOKQ14.TRC'),
  (Join-Path $build 'DOKS2.BIN'),
  (Join-Path $build 'DOKS2.TXT'),
  (Join-Path $build 'DOKS2.TRC'),
  (Join-Path $build 'DOKREAL.BIN'),
  (Join-Path $build 'DOKREAL.TXT'),
  (Join-Path $build 'DOKREAL.TRC'),
  (Join-Path $build 'DOKREAL.OUT'),
  (Join-Path $build 'DOKREAL.RAW'),
  (Join-Path $build 'DOKREAL.GBC'),
  (Join-Path $build 'DOKREALC.TXT'),
  (Join-Path $build 'DOKREALR.BIN'),
  (Join-Path $build 'DOKREALR.TXT'),
  (Join-Path $build 'DOKB34.BIN'),
  (Join-Path $build 'DOKB34.TXT'),
  (Join-Path $build 'DOKB34.TRC'),
  (Join-Path $build 'DOKB34.OUT'),
  (Join-Path $build 'DOKB34.RAW'),
  (Join-Path $build 'DOKB34.GBC'),
  (Join-Path $build 'DOKB34R.BIN'),
  (Join-Path $build 'DOKB34R.TXT'),
  (Join-Path $build 'DOKB51.BIN'),
  (Join-Path $build 'DOKB51.TXT'),
  (Join-Path $build 'DOKB51.TRC'),
  (Join-Path $build 'DOKB51C.TRC'),
  (Join-Path $build 'DOKB51C.OUT'),
  (Join-Path $build 'DOKB51C.RAW'),
  (Join-Path $build 'DOKB51.GBC'),
  (Join-Path $build 'DOKB51R.BIN'),
  (Join-Path $build 'DOKB51R.TXT'),
  (Join-Path $build 'DOKB51A.BIN'),
  (Join-Path $build 'DOKB51A.TXT'),
  (Join-Path $build 'DOKB51A.TRC'),
  (Join-Path $build 'DGBREAL.TXT'),
  (Join-Path $build 'DGBRECL.TXT'),
  (Join-Path $build 'DGBRRES.TXT'),
  (Join-Path $build 'DGBRCMB.TRC'),
  (Join-Path $build 'DGBRCMB.OUT'),
  (Join-Path $build 'DGBRRAW.RAW'),
  (Join-Path $build 'DGBRCR.BIN'),
  (Join-Path $build 'DGBB34.TXT'),
  (Join-Path $build 'DGB34E.TXT'),
  (Join-Path $build 'DGB34R.TXT'),
  (Join-Path $build 'DGB34C.TRC'),
  (Join-Path $build 'DGB34O.TXT'),
  (Join-Path $build 'DGB34W.RAW'),
  (Join-Path $build 'DGB34C.BIN'),
  (Join-Path $build 'DGB51.TXT'),
  (Join-Path $build 'DGB51E.TXT'),
  (Join-Path $build 'DGB51S.TXT'),
  (Join-Path $build 'DGB51R.TXT'),
  (Join-Path $build 'DGB51C.TRC'),
  (Join-Path $build 'DGB51O.TXT'),
  (Join-Path $build 'DGB51W.RAW'),
  (Join-Path $build 'DGB51C.BIN'),
  (Join-Path $build 'DOKGB32.TXT'),
  (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build 'DOK36VM.TXT'),
  (Join-Path $build 'DOK36EVT.TXT'),
  (Join-Path $build 'DOK36ECL.TXT'),
  (Join-Path $build 'DOK36STP.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBEVT.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build 'CCECL.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN') -Force -ErrorAction SilentlyContinue

# GEO1 block 32 cell (10,15) has an open east edge into cell (11,15). That
# target yields floor descriptor 154, whose low event bits run the same real
# SearchLocation empty-COMBAT route as descriptor 26.
Set-Session 10 15 2

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless -Cycles 'fixed 18000'
if (-not $p.WaitForExit(60000)) {
  Stop-Process -Id $p.Id -Force
  throw 'CCECL DoK combat-gap probe timed out'
}

$empty = Get-Content (Join-Path $build 'DOKEMPTY.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0020 status=0003 geo=FFFF chain=FFFF',
  "#01 OP=12 PRINTCLEAR ARGC=01 ARGS= 000C TEXT='NEED HEALING?'",
  '#02 OP=22 PARTY_SURPRISE'
)) {
  if ($empty -notlike "*$needle*") {
    throw "DoK empty-combat GBEF dump missing: $needle"
  }
}
if ($empty -like '*GBEC groups=*' -or $empty -like '*MONSTER id=*') {
  throw 'DoK empty-combat route unexpectedly exported queued monster groups'
}

$combatOut = Get-Content (Join-Path $build 'DOKCOMB.TXT') -Raw
if ($combatOut -notlike '*bad effect*') {
  throw 'CCCOMBAT did not reject the DoK empty-combat GBEF payload'
}
foreach ($name in @('DOKEMPTY.TRC', 'DOKEMPTY.OUT', 'DOKEMPTY.RAW')) {
  if (Test-Path (Join-Path $build $name)) {
    throw "CCCOMBAT unexpectedly produced $name for an empty DoK encounter"
  }
}

$surprise = Get-Content (Join-Path $build 'DOKSURP.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0020 status=0000 geo=FFFF chain=FFFF',
  '#00 OP=23 SURPRISE'
)) {
  if ($surprise -notlike "*$needle*") {
    throw "DoK block-33 descriptor-23 SURPRISE-only GBEF dump missing: $needle"
  }
}
if ($surprise -like '*GBEC groups=*' -or $surprise -like '*MONSTER id=*') {
  throw 'DoK block-33 descriptor-23 route unexpectedly exported queued monster groups (SURPRISE-only, not LOAD_MONSTER)'
}

$randomSelector = Get-Content (Join-Path $build 'DOKSET.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0000 status=0000 geo=FFFF chain=FFFF',
  'GBRS flags=0000 area=0024 pc=054B',
  '@01 MEM key=7F79 value=0002',
  'GBSX count=0000',
  'GBES setup sprite=0000 max=0000 pic=0000 distance=0000'
)) {
  if ($randomSelector -notlike "*$needle*") {
    throw "DoK normal SearchLocation random-selector branch missing: $needle"
  }
}
if ($randomSelector -like '*GBEC groups=*' -or
    $randomSelector -like '*MONSTER id=*' -or
    $randomSelector -like '*status=0003*' -or
    $randomSelector -like '*SIVAKS BESIEGE THE OUTPOST!*') {
  throw 'DoK normal SearchLocation random-selector branch unexpectedly became a tactical handoff'
}
$setupTrace = Get-Content (Join-Path $build 'DOKSET.TRC') -Raw
foreach ($needle in @(
  'PC=04DF OP=25',
  'PC=0539 OP=08 MEM[7F79]=0002',
  'PC=054B OP=00'
)) {
  if (-not $setupTrace.Contains($needle)) {
    throw "DoK normal SearchLocation trace missing random-selector proof: $needle"
  }
}
if ($setupTrace -like '*PC=055D OP=01*' -or
    $setupTrace -like '*PC=0554 OP=0C*' -or
    $setupTrace -like '*PC=0144 OP=12*' -or
    $setupTrace -like '*PC=015D OP=0B*' -or
    $setupTrace -like '*PC=0164 OP=24*') {
  throw 'DoK normal SearchLocation trace unexpectedly reached setup or the adjacent direct tactical branch'
}

$vmrunFacing = Get-Content (Join-Path $build 'DOKQ14.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0020 status=0000 geo=FFFF chain=FFFF',
  'GBRS flags=0000 area=0024 pc=0413',
  '@02 MEM key=C04E value=0004',
  '@04 MEM key=4C06 value=0004',
  '#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 0006 TEXT=STAIRS.',
  '#01 OP=11 PRINT ARGC=01 ARGS= 0010 TEXT=GO UP INTO THE TOWER?',
  '#02 OP=22 PARTY_SURPRISE'
)) {
  if ($vmrunFacing -notlike "*$needle*") {
    throw "DoK Gen1 vmRun1 /F facing seed branch missing: $needle"
  }
}
$vmrunTrace = Get-Content (Join-Path $build 'DOKQ14.TRC') -Raw
foreach ($needle in @(
  'PC=03AE OP=14',
  'PC=03BB OP=03',
  'PC=03D9 OP=12',
  'PC=0411 OP=22'
)) {
  if ($vmrunTrace -notlike "*$needle*") {
    throw "DoK Gen1 vmRun1 /F facing trace missing: $needle"
  }
}
if ($vmrunTrace -like '*PC=03BA OP=00*') {
  throw 'DoK Gen1 vmRun1 /F facing seed did not pass the descriptor/facing gate'
}

$slot2 = [IO.File]::ReadAllBytes((Join-Path $build 'DOKS2.BIN'))
if ($slot2.Length -lt 126 -or [Text.Encoding]::ASCII.GetString($slot2, 0, 4) -ne 'GBEF') {
  throw 'DoK Gen1 slot2 /2 probe did not emit a valid GBEF'
}
$slot2Status = [BitConverter]::ToUInt16($slot2, 8)
$slot2Enc = [BitConverter]::ToUInt16($slot2, 32)
if ($slot2Status -eq 3 -or $slot2Enc -gt 0) {
  throw 'DoK Gen1 slot2 /2 probe unexpectedly yielded a combat candidate'
}
$slot2Text = Get-Content (Join-Path $build 'DOKS2.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0000 status=0000 geo=FFFF chain=FFFF',
  'GBRS flags=0000 area=0024 pc=0274',
  '@04 MEM key=7ED2 value=0060',
  '@05 MEM key=7ED3 value=003C',
  'GBSX count=0000'
)) {
  if ($slot2Text -notlike "*$needle*") {
    throw "DoK Gen1 slot2 /2 PreCampCheck dump missing: $needle"
  }
}
$slot2Trace = Get-Content (Join-Path $build 'DOKS2.TRC') -Raw
foreach ($needle in @(
  'PC=022D OP=09 MEM[7ED2]=0000',
  'PC=0268 OP=09 MEM[7ED2]=0060',
  'PC=0274 OP=00'
)) {
  if (-not $slot2Trace.Contains($needle)) {
    throw "DoK Gen1 slot2 /2 PreCampCheck trace missing: $needle"
  }
}

$real = Get-Content (Join-Path $build 'DOKREAL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0028 status=0003 geo=FFFF chain=FFFF',
  'GBEC groups=0001',
  '@00 MONSTER id=0021 count=0008 pic=0021',
  '#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 0015 TEXT=SIVAKS BESIEGE THE OUTPOST!'
)) {
  if ($real -notlike "*$needle*") {
    throw "DoK direct tactical GBEF dump missing: $needle"
  }
}

$realOutcome = (Get-Content (Join-Path $build 'DOKREAL.OUT') -Raw).Trim()
if ($realOutcome -ne 'enemy') {
  throw "DoK direct tactical probe produced unexpected outcome: $realOutcome"
}
$realTrace = Get-Content (Join-Path $build 'DOKREAL.TRC') -Raw
if ($realTrace -notlike '*1 init e7*') {
  throw 'DoK direct tactical trace did not initialize all eight Sivak enemies'
}
$realGbcr = [IO.File]::ReadAllBytes((Join-Path $build 'DOKREAL.GBC'))
if ([Text.Encoding]::ASCII.GetString($realGbcr, 0, 4) -ne 'GBCR') {
  throw 'DoK direct tactical probe did not write a GBCR result roster'
}
Assert-RawFrame (Join-Path $build 'DOKREAL.RAW') 'DoK direct tactical probe'

$realResume = Get-Content (Join-Path $build 'DOKREALR.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0000 status=0000 geo=FFFF chain=FFFF',
  'GBRS flags=0000 area=0024 pc=0177 rng=00001234 callsp=0000 mem=0000',
  'GBSX count=0000'
)) {
  if ($realResume -notlike "*$needle*") {
    throw "DoK direct tactical resume dump missing: $needle"
  }
}

$b34 = Get-Content (Join-Path $build 'DOKB34.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0008 status=0003 geo=FFFF chain=FFFF',
  'GBEC groups=0001',
  '@00 MONSTER id=0021 count=000F pic=0021',
  'GBRS flags=0001 area=0022 pc=015B rng=00001234 callsp=0000 mem=0000'
)) {
  if ($b34 -notlike "*$needle*") {
    throw "DoK block-34 direct tactical GBEF dump missing: $needle"
  }
}
$b34Outcome = (Get-Content (Join-Path $build 'DOKB34.OUT') -Raw).Trim()
if ($b34Outcome -ne 'enemy') {
  throw "DoK block-34 direct tactical probe produced unexpected outcome: $b34Outcome"
}
$b34Trace = Get-Content (Join-Path $build 'DOKB34.TRC') -Raw
if ($b34Trace -notlike '*1 init e14*') {
  throw 'DoK block-34 direct tactical trace did not initialize all fifteen Sivak enemies'
}
Assert-RawFrame (Join-Path $build 'DOKB34.RAW') 'DoK block-34 direct tactical probe'
$b34Gbcr = [IO.File]::ReadAllBytes((Join-Path $build 'DOKB34.GBC'))
if ([Text.Encoding]::ASCII.GetString($b34Gbcr, 0, 4) -ne 'GBCR') {
  throw 'DoK block-34 direct tactical probe did not write a GBCR result roster'
}
$b34Resume = Get-Content (Join-Path $build 'DOKB34R.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0020 status=0000 geo=FFFF chain=FFFF',
  'GBRS flags=0000 area=0022 pc=015F',
  '#00 OP=23 SURPRISE ARGC=00'
)) {
  if ($b34Resume -notlike "*$needle*") {
    throw "DoK block-34 direct tactical resume dump missing: $needle"
  }
}

$b51 = Get-Content (Join-Path $build 'DOKB51.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0028 status=0003 geo=FFFF chain=FFFF',
  'GBEC groups=0002',
  '@00 MONSTER id=0001 count=0002 pic=0001',
  '@01 MONSTER id=0011 count=0008 pic=0011',
  'GBRS flags=0001 area=0033 pc=0187 rng=00001234 callsp=0000 mem=0005',
  '@03 MEM key=4CE9 value=0001',
  '#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 0010 TEXT=THE DOOR IS TRAPPED.',
  '#01 OP=31 SPRITE_OFF'
)) {
  if ($b51 -notlike "*$needle*") {
    throw "DoK block-51 vmRun1 queued tactical GBEF dump missing: $needle"
  }
}
$b51Trace = Get-Content (Join-Path $build 'DOKB51.TRC') -Raw
foreach ($needle in @(
  'PC=01DA OP=03',
  'PC=0203 OP=2F MEM[7F79]=0000',
  'PC=0178 OP=0B',
  'PC=017F OP=0B',
  'PC=0186 OP=24'
)) {
  if (-not $b51Trace.Contains($needle)) {
    throw "DoK block-51 vmRun1 queued tactical trace missing: $needle"
  }
}
Assert-RawFrame (Join-Path $build 'DOKB51C.RAW') 'DoK block-51 vmRun1 queued tactical probe'
$b51Gbcr = [IO.File]::ReadAllBytes((Join-Path $build 'DOKB51.GBC'))
if ([Text.Encoding]::ASCII.GetString($b51Gbcr, 0, 4) -ne 'GBCR') {
  throw 'DoK block-51 vmRun1 queued tactical probe did not write a GBCR result roster'
}
$b51Outcome = (Get-Content (Join-Path $build 'DOKB51C.OUT') -Raw).Trim()
if ($b51Outcome -ne 'enemy') {
  throw "DoK block-51 vmRun1 queued tactical probe produced unexpected outcome: $b51Outcome"
}
$b51CombatTrace = Get-Content (Join-Path $build 'DOKB51C.TRC') -Raw
if ($b51CombatTrace -notlike '*1 init e9*') {
  throw 'DoK block-51 vmRun1 queued tactical trace did not initialize all ten enemies'
}
$b51Resume = Get-Content (Join-Path $build 'DOKB51R.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0000 status=0000 geo=FFFF chain=FFFF',
  'GBRS flags=0000 area=0033 pc=019B rng=00001234 callsp=0000 mem=0006',
  '@05 MEM key=4CE5 value=0001',
  'GBSX count=0000'
)) {
  if ($b51Resume -notlike "*$needle*") {
    throw "DoK block-51 vmRun1 queued tactical resume dump missing: $needle"
  }
}

$b51Arm = Get-Content (Join-Path $build 'DOKB51A.TXT') -Raw
foreach ($needle in @(
  'GBEF v000F flags=0020 status=0002 geo=FFFF chain=FFFF',
  'GBRS flags=0001 area=0033 pc=0235',
  '@03 MEM key=7D00 value=0001',
  '@04 MEM key=7CA7 value=0064',
  '#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 7C00',
  '#01 OP=11 PRINT ARGC=01 ARGS= 000B TEXT= FINDS A TRAP.',
  '#02 OP=1D PARTYSTRENGTH ARGC=00'
)) {
  if ($b51Arm -notlike "*$needle*") {
    throw "DoK block-51 trap-found ACK prefix missing: $needle"
  }
}
if ($b51Arm -like '*GBEC groups=*' -or $b51Arm -like '*OP=41*' -or
    $b51Arm -like '*THE DOOR IS TRAPPED.*') {
  throw 'DoK block-51 trap-found ACK incorrectly claims the cold continuation already ran'
}
$b51ArmTrace = Get-Content (Join-Path $build 'DOKB51A.TRC') -Raw
foreach ($needle in @(
  'PC=0222 OP=12',
  'PC=0226 OP=11',
  'PC=0234 OP=1D'
)) {
  if ($b51ArmTrace -notlike "*$needle*") {
    throw "DoK block-51 trap-found arm trace missing: $needle"
  }
}
if ($b51ArmTrace -like '*PC=0239 OP=41*' -or $b51ArmTrace -like '*PC=0186 OP=24*') {
  throw 'DoK block-51 trap-found ACK advanced past the validated PARTYSTRENGTH boundary'
}

Set-Session 10 15 2
$realCombatCommands = @"
@echo off
mount C "$build"
mount D "$gameMount"
D:
C:\GBBOOT /E /X /A 1 /B 36 /@ 33090 > C:\DGBREAL.TXT
COPY C:\_GBECL.TXT C:\DGBRECL.TXT > NUL
COPY C:\_GBRES.TXT C:\DGBRRES.TXT > NUL
COPY C:\_GBCOMB.TRC C:\DGBRCMB.TRC > NUL
COPY C:\_GBCOMB.OUT C:\DGBRCMB.OUT > NUL
COPY C:\_GBCOMB.RAW C:\DGBRRAW.RAW > NUL
COPY C:\_GBCR.BIN C:\DGBRCR.BIN > NUL
DEL C:\_GBCOMB.TRC > NUL
DEL C:\_GBCOMB.RAW > NUL
DEL C:\_GBCR.BIN > NUL
"@
$realCombatConf = Join-Path $build '_gbboot_dok_real_combat.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
$realCombatCommands
exit
"@ | Set-Content $realCombatConf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $realCombatConf -Headless:$Headless -Cycles 'fixed 18000'
if (-not $p.WaitForExit(60000)) {
  Stop-DosBoxSmoke -Process $p
  throw 'GBBOOT DoK direct tactical route timed out'
}
Stop-DosBoxSmoke -Process $p

$gbbootRealEffect = Get-Content (Join-Path $build 'DGBRECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0028 status=0003 geo=FFFF chain=FFFF',
  'GBEC groups=0001',
  '@00 MONSTER id=0021 count=0008 pic=0021',
  '#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 0015 TEXT=SIVAKS BESIEGE THE OUTPOST!'
)) {
  if ($gbbootRealEffect -notlike "*$needle*") {
    throw "GBBOOT DoK direct tactical effect missing: $needle"
  }
}
$gbbootRealResume = Get-Content (Join-Path $build 'DGBRRES.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0000 status=0000 geo=FFFF chain=FFFF',
  'GBRS flags=0000 area=0024 pc=0177 rng=00001234 callsp=0000 mem=0000',
  'GBSX count=0000'
)) {
  if ($gbbootRealResume -notlike "*$needle*") {
    throw "GBBOOT DoK direct tactical resume missing: $needle"
  }
}
$gbbootRealOutcome = (Get-Content (Join-Path $build 'DGBRCMB.OUT') -Raw).Trim()
if ($gbbootRealOutcome -ne 'party') {
  throw "GBBOOT DoK direct tactical probe produced unexpected outcome: $gbbootRealOutcome"
}
$gbbootRealTrace = Get-Content (Join-Path $build 'DGBRCMB.TRC') -Raw
if ($gbbootRealTrace -notlike '*1 init e7*') {
  throw 'GBBOOT DoK direct tactical trace did not initialize all eight Sivak enemies'
}
Assert-RawFrame (Join-Path $build 'DGBRRAW.RAW') 'GBBOOT DoK direct tactical probe'
$gbbootRealGbcr = [IO.File]::ReadAllBytes((Join-Path $build 'DGBRCR.BIN'))
if ([Text.Encoding]::ASCII.GetString($gbbootRealGbcr, 0, 4) -ne 'GBCR') {
  throw 'GBBOOT DoK direct tactical probe did not write a GBCR result roster'
}

$gbbootB34Effect = Get-Content (Join-Path $build 'DGB34E.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0008 status=0003 geo=FFFF chain=FFFF',
  'GBEC groups=0001',
  '@00 MONSTER id=0021 count=000F pic=0021',
  'GBRS flags=0001 area=0022 pc=015B rng=00001234 callsp=0000 mem=0000'
)) {
  if ($gbbootB34Effect -notlike "*$needle*") {
    throw "GBBOOT DoK block-34 direct tactical effect missing: $needle"
  }
}
$gbbootB34Resume = Get-Content (Join-Path $build 'DGB34R.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0020 status=0000 geo=FFFF chain=FFFF',
  'GBRS flags=0000 area=0022 pc=015F',
  '#00 OP=23 SURPRISE ARGC=00'
)) {
  if ($gbbootB34Resume -notlike "*$needle*") {
    throw "GBBOOT DoK block-34 direct tactical resume missing: $needle"
  }
}
$gbbootB34Outcome = (Get-Content (Join-Path $build 'DGB34O.TXT') -Raw).Trim()
if ($gbbootB34Outcome -ne 'party') {
  throw "GBBOOT DoK block-34 direct tactical probe produced unexpected outcome: $gbbootB34Outcome"
}
$gbbootB34Trace = Get-Content (Join-Path $build 'DGB34C.TRC') -Raw
if ($gbbootB34Trace -notlike '*1 init e14*') {
  throw 'GBBOOT DoK block-34 direct tactical trace did not initialize all fifteen Sivak enemies'
}
Assert-RawFrame (Join-Path $build 'DGB34W.RAW') 'GBBOOT DoK block-34 direct tactical probe'
$gbbootB34Gbcr = [IO.File]::ReadAllBytes((Join-Path $build 'DGB34C.BIN'))
if ([Text.Encoding]::ASCII.GetString($gbbootB34Gbcr, 0, 4) -ne 'GBCR') {
  throw 'GBBOOT DoK block-34 direct tactical probe did not write a GBCR result roster'
}

$gbbootB51Out = Get-Content (Join-Path $build 'DGB51.TXT') -Raw
if ($gbbootB51Out -notlike '*native: CCECL ECL2.DAX entry 51 -> CCGEO /B GEO2.DAX*' -or
    $gbbootB51Out -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT DoK block-51 vmRun1 /1 probe did not enter the ECL2/GEO2 native route'
}
$gbbootB51Event = Get-Content (Join-Path $build 'DGB51E.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0028 status=0003 geo=FFFF chain=FFFF',
  'GBEC groups=0002',
  '@00 MONSTER id=0001 count=0002 pic=0001',
  '@01 MONSTER id=0011 count=0008 pic=0011',
  'GBRS flags=0001 area=0033 pc=0187 rng=00001234 callsp=0000 mem=0005',
  '@03 MEM key=4CE9 value=0001',
  '#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 0010 TEXT=THE DOOR IS TRAPPED.',
  '#01 OP=31 SPRITE_OFF'
)) {
  if ($gbbootB51Event -notlike "*$needle*") {
    throw "GBBOOT DoK block-51 vmRun1 /1 event effect missing: $needle"
  }
}
$gbbootB51Resume = Get-Content (Join-Path $build 'DGB51R.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0000 status=0000 geo=FFFF chain=FFFF',
  'GBRS flags=0000 area=0033 pc=019B rng=00001234 callsp=0000 mem=0006',
  '@05 MEM key=4CE5 value=0001',
  'GBSX count=0000'
)) {
  if ($gbbootB51Resume -notlike "*$needle*") {
    throw "GBBOOT DoK block-51 vmRun1 /1 resume missing: $needle"
  }
}
$gbbootB51Search = Get-Content (Join-Path $build 'DGB51S.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0000 status=0000 geo=FFFF chain=FFFF',
  'GBRS flags=0000 area=0033 pc=0344 rng=00001234 callsp=0000 mem=0005',
  '@01 MEM key=7F79 value=001D',
  '@04 MEM key=4C00 value=0000'
)) {
  if ($gbbootB51Search -notlike "*$needle*") {
    throw "GBBOOT DoK block-51 vmRun1 /1 follow-up SearchLocation missing: $needle"
  }
}
$gbbootB51Outcome = (Get-Content (Join-Path $build 'DGB51O.TXT') -Raw).Trim()
if ($gbbootB51Outcome -ne 'party') {
  throw "GBBOOT DoK block-51 vmRun1 /1 probe produced unexpected outcome: $gbbootB51Outcome"
}
$gbbootB51Trace = Get-Content (Join-Path $build 'DGB51C.TRC') -Raw
if ($gbbootB51Trace -notlike '*1 init e9*') {
  throw 'GBBOOT DoK block-51 vmRun1 /1 trace did not initialize all ten enemies'
}
Assert-RawFrame (Join-Path $build 'DGB51W.RAW') 'GBBOOT DoK block-51 vmRun1 /1 probe'
$gbbootB51Gbcr = [IO.File]::ReadAllBytes((Join-Path $build 'DGB51C.BIN'))
if ([Text.Encoding]::ASCII.GetString($gbbootB51Gbcr, 0, 4) -ne 'GBCR') {
  throw 'GBBOOT DoK block-51 vmRun1 /1 probe did not write a GBCR result roster'
}

Set-Session 10 15 2
Invoke-DokGameLinkAckFlow -DbxExe $dbx `
  -BuildDir $build -GameDir $gameMount `
  -GuestCommand 'C:\GBBOOT /E /A 1 /B 32 /T 1 > C:\DOKGB32.TXT' `
  -DosLogFile (Join-Path $build 'dok-combat-gap-empty-combat-files.log') `
  -CaptureRoot (Join-Path $build 'dok-combat-gap-empty-combat-gamelink') -TimeoutSeconds 60

$gbbootOut = Get-Content (Join-Path $build 'DOKGB32.TXT') -Raw
if ($gbbootOut -notlike '*native: CCECL ECL1.DAX entry 32 -> CCGEO /B GEO1.DAX*' -or
    $gbbootOut -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT did not enter the DoK ECL1/GEO1 block-32 native route'
}

$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
if ([BitConverter]::ToUInt16($step, 6) -ne 154 -or
    [BitConverter]::ToUInt16($step, 8) -ne 11 -or
    [BitConverter]::ToUInt16($step, 10) -ne 15 -or
    [BitConverter]::ToUInt16($step, 12) -ne 2) {
  throw 'GBBOOT DoK block-32 route did not step into descriptor 154'
}

$gbbootEffect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0020 status=0003 geo=FFFF chain=FFFF',
  "#01 OP=12 PRINTCLEAR ARGC=01 ARGS= 000C TEXT='NEED HEALING?'",
  '#02 OP=22 PARTY_SURPRISE'
)) {
  if ($gbbootEffect -notlike "*$needle*") {
    throw "GBBOOT DoK empty-combat effect missing: $needle"
  }
}
if ($gbbootEffect -like '*GBEC groups=*' -or $gbbootEffect -like '*MONSTER id=*') {
  throw 'GBBOOT DoK empty-combat route unexpectedly exported queued monster groups'
}

$outcome = Get-Content (Join-Path $build '_GBCOMB.OUT') -Raw
if ($outcome.Trim() -ne 'victory') {
  throw 'GBBOOT did not materialize a victory outcome for DoK empty combat'
}
foreach ($name in @('_GBCOMB.TRC', '_GBCOMB.RAW', '_GBCR.BIN')) {
  if (Test-Path (Join-Path $build $name)) {
    throw "GBBOOT unexpectedly launched tactical combat for empty DoK encounter: $name"
  }
}

$resume = Get-Content (Join-Path $build '_GBRES.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0020 status=0000 geo=FFFF chain=FFFF',
  "#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 000E TEXT='COME AGAIN SOON.'",
  '#01 OP=2D CALL'
)) {
  if ($resume -notlike "*$needle*") {
    throw "GBBOOT DoK empty-combat resume missing: $needle"
  }
}

$selectorBat = Join-Path $build 'DOKSEL.BAT'
$selectorConf = Join-Path $build '_ccecl_dok_selector_probe.conf'
Remove-Item (Join-Path $build 'DS*.BIN'),
  (Join-Path $build 'DS*.TXT'),
  (Join-Path $build 'DS*.TRC'),
  (Join-Path $build 'D34J12.BIN'),
  (Join-Path $build 'D34J12.TXT'),
  (Join-Path $build 'D34J12.TRC'),
  (Join-Path $build 'DOKSEL.BAT'),
  (Join-Path $build 'CCECL.TRC') -Force -ErrorAction SilentlyContinue

$selectorLines = New-Object System.Collections.Generic.List[string]
$selectorLines.Add('@echo off')
for ($j = 0; $j -lt 28; $j++) {
  $stem = ('DS{0:D2}' -f $j)
  $selectorLines.Add("C:\CCECL D:\ECL1.DAX 36 /E C:\$stem.BIN /J $j /F 0 /N 6 /H 1 /Z 240 /D 4 /X 19691 3 /X 19462 1 /T > NUL")
  $selectorLines.Add("REN C:\CCECL.TRC $stem.TRC")
  $selectorLines.Add("C:\CCEFX C:\$stem.BIN C:\$stem.TXT > NUL")
}
$selectorLines.Add('C:\CCECL D:\ECL1.DAX 34 /E C:\D34J12.BIN /J 12 /F 0 /N 6 /H 1 /Z 240 /D 4 /X 19691 0 /X 19462 1 /T > NUL')
$selectorLines.Add('REN C:\CCECL.TRC D34J12.TRC')
$selectorLines.Add('C:\CCEFX C:\D34J12.BIN C:\D34J12.TXT > NUL')
$selectorLines.Add('exit')
[IO.File]::WriteAllLines($selectorBat, $selectorLines, [Text.Encoding]::ASCII)

@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$gameMount"
C:
CALL C:\DOKSEL.BAT
"@ | Set-Content $selectorConf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $selectorConf -Headless:$Headless -Cycles 'fixed 18000'
if (-not $p.WaitForExit(90000)) {
  Stop-Process -Id $p.Id -Force
  throw 'CCECL DoK selector-table probe timed out'
}

for ($j = 0; $j -lt 28; $j++) {
  $stem = ('DS{0:D2}' -f $j)
  $dumpPath = Join-Path $build "$stem.TXT"
  $tracePath = Join-Path $build "$stem.TRC"
  if (-not (Test-Path $dumpPath) -or -not (Test-Path $tracePath)) {
    throw "DoK block-36 selector probe did not create $stem outputs"
  }
  # Selectors 3 and 27 are genuine SearchLocation combat-table entries (proven
  # below, each against its own measured GBEF/trace shape); every other index
  # in the 28-entry table is checked here to confirm it stays non-combat.
  if ($j -eq 3 -or $j -eq 27) { continue }
  $dump = Get-Content $dumpPath -Raw
  $trace = Get-Content $tracePath -Raw
  if ($dump -like '*status=0003*' -or
      $dump -like '*GBEC groups=*' -or
      $dump -like '*MONSTER id=*' -or
      $dump -like '*SIVAKS BESIEGE THE OUTPOST!*' -or
      $trace -like '*OP=24*') {
    throw "DoK block-36 selector $j unexpectedly reached tactical combat"
  }
}

# Selector 3 is SearchLocation's own empty-COMBAT route (status=0003, no queued
# LOAD_MONSTER groups) -- the same shape as the block-32 descriptor-154 case
# tested earlier in this file, reached through the block-36 random table instead.
$selector3 = Get-Content (Join-Path $build 'DS03.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0020 status=0003 geo=FFFF chain=FFFF',
  'GBRS flags=0001 area=0024 pc=06A5',
  '#01 OP=12 PRINTCLEAR ARGC=01 ARGS= 0013 TEXT=THE TEMPLE. NEED TO HEAL?',
  '#02 OP=22 PARTY_SURPRISE'
)) {
  if ($selector3 -notlike "*$needle*") {
    throw "DoK block-36 selector 3 empty-combat proof missing: $needle"
  }
}
if ($selector3 -like '*GBEC groups=*' -or $selector3 -like '*MONSTER id=*') {
  throw 'DoK block-36 selector 3 route unexpectedly exported queued monster groups (empty COMBAT, not LOAD_MONSTER)'
}
$selector3Trace = Get-Content (Join-Path $build 'DS03.TRC') -Raw
if ($selector3Trace -notlike '*PC=06A4 OP=24*') {
  throw 'DoK block-36 selector 3 trace missing the empty-COMBAT dispatch'
}

# Selector 27 is SearchLocation's LOAD_MONSTER SIVAKS route: SETUP_MONSTER falls
# through the GOTO into the same "SIVAKS BESIEGE THE OUTPOST!" queued encounter
# proven elsewhere in this file via the direct /@ 33090 entry point (DOKREAL).
$selector27 = Get-Content (Join-Path $build 'DS27.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0068 status=0003 geo=FFFF chain=FFFF',
  'GBEC groups=0001',
  '@00 MONSTER id=0021 count=0008 pic=0021',
  'GBRS flags=0001 area=0024 pc=0165',
  '#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 0015 TEXT=SIVAKS BESIEGE THE OUTPOST!',
  'GBES setup sprite=0021 max=0000 pic=00FF distance=0000'
)) {
  if ($selector27 -notlike "*$needle*") {
    throw "DoK block-36 selector 27 direct-tactical proof missing: $needle"
  }
}
$selector27Trace = Get-Content (Join-Path $build 'DS27.TRC') -Raw
foreach ($needle in @(
  'PC=054C OP=03',
  'PC=0554 OP=0C',
  'PC=055D OP=01',
  'PC=0144 OP=12',
  'PC=015D OP=0B',
  'PC=0164 OP=24'
)) {
  if ($selector27Trace -notlike "*$needle*") {
    throw "DoK block-36 selector 27 trace missing direct-tactical proof: $needle"
  }
}

# Descriptor 12's SETUP_MONSTER path records the attack text and
# PARTYSTRENGTH, then yields at the typed host boundary before the packed
# continuation. The separate selector-27 probe above still pins direct combat.
$b34AttackText = Get-Content (Join-Path $build 'D34J12.TXT') -Raw
foreach ($needle in @(
  'GBEF v000F flags=0060 status=0002 geo=FFFF chain=FFFF',
  'GBRS flags=0001 area=0022 pc=1313',
  'TEXT=SIVAKS ARE GATHERED AROUND A TAB',
  'TEXT=THEY ATTACK!',
  '#02 OP=1D PARTYSTRENGTH ARGC=00'
)) {
  if ($b34AttackText -notlike "*$needle*") {
    throw "DoK block-34 descriptor-12 attack-text path missing: $needle"
  }
}
if ($b34AttackText -like '*GBEC groups=*' -or $b34AttackText -like '*MONSTER id=*') {
  throw 'DoK block-34 descriptor-12 ACK unexpectedly claims the cold combat continuation ran'
}
$b34AttackTrace = Get-Content (Join-Path $build 'D34J12.TRC') -Raw
foreach ($needle in @(
  'PC=1306 OP=11',
  'PC=1312 OP=1D'
)) {
  if ($b34AttackTrace -notlike "*$needle*") {
    throw "DoK block-34 descriptor-12 attack-text trace missing direct-tactical proof: $needle"
  }
}
if ($b34AttackTrace -like '*PC=1329 OP=24*') {
  throw 'DoK block-34 descriptor-12 producer advanced past its PARTYSTRENGTH ACK boundary'
}

# STALENESS GUARD (2026-09-10). The conf below COPIES `_GBSTEP.BIN` to
# `DOK36STP.BIN` and does not create it, so if the GBBOOT run were to fail, both
# files would still hold whatever the earlier `/B 32` conf in this same script
# left behind -- and the four assertions after the run would be scoring a stale
# artifact. That is not hypothetical: the 2026-09-09 investigation recorded in the
# comment below reached its conclusion by comparing exactly those stale bytes.
# Delete both first, so a failed run leaves the assertions with nothing to read
# rather than with a previous run's answer.
Remove-Item (Join-Path $build '_GBSTEP.BIN') -ErrorAction SilentlyContinue
Remove-Item (Join-Path $build 'DOK36STP.BIN') -ErrorAction SilentlyContinue

$vmConf = Join-Path $build '_gbboot_dok_vmrun_step.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$gameMount"
D:
C:\GBBOOT /E /A 1 /B 36 /T 1 > C:\DOK36VM.TXT
C:
C:\CCEFX C:\_GBEVT.BIN C:\DOK36EVT.TXT
COPY C:\_GBECL.TXT C:\DOK36ECL.TXT > NUL
COPY C:\_GBSTEP.BIN C:\DOK36STP.BIN > NUL
exit
"@ | Set-Content $vmConf -Encoding ASCII

# GEO1 block 36 cell (3,8) has an open (doorless) south edge into cell (3,9),
# which carries descriptor 14. (4,5)'s south edge into (4,6) also reaches a
# descriptor-14 cell, but that edge is a closed door (GEO door-plane bit set)
# that a plain forward step cannot cross without door-open handling -- the
# original (4,5) coordinate pin was an unverified guess, confirmed wrong
# against real GEO1.DAX bytes (read-only decode via tools/goldbox_corpus.py's
# read_dax_blocks). (3,8)->(3,9) is a genuine open edge and is the correct
# fix for THAT defect.
#
# THE "GENUINE ENGINE DEFECT" DESCRIBED BELOW DOES NOT REPRODUCE AS OF
# 2026-09-10, AND THE ORIGINAL DIAGNOSIS RESTED ON A STALE ARTIFACT.
# Measured today, with `_GBSTEP.BIN` and `DOK36STP.BIN` DELETED first (see the
# staleness guard above, which did not exist when the note below was written):
# `GBBOOT /E /A 1 /B 36 /T 1` runs, DOK36VM.TXT contains NO "native preview
# failed" line anywhere, and `_GBSTEP.BIN` is freshly written with
# `desc=142 x=3 y=9 facing=4`. Those coordinates can only come from the run that
# consumed `Set-Session 3 8 4` -- i.e. from the /B 36 run itself -- so GBBOOT did
# reach its own CCFP invocation. The whole script exits 0.
# WHAT THE OLD NOTE GOT WRONG, and it is a repeat of this repo's own lesson: it
# inferred "GBBOOT never reaches CCFP" from the ABSENCE of CCGEO/CCFP lines in a
# redirected transcript, and corroborated it with DOK36STP.BIN bytes that were
# byte-identical to the earlier /B 32 run's -- which is what a stale copy looks
# like, not what a failed run proves. Absence of stdout is not absence of
# execution, and a byte-identical artifact is exactly the evidence a content
# oracle cannot distinguish from "nothing happened".
# WHAT IS NOT ESTABLISHED: whether the failure was real on 2026-09-09 and has
# since been fixed by one of September's commits, or whether it was never real.
# This measurement cannot separate those, and no bisect was run. The note below
# is kept verbatim rather than deleted so that question stays answerable.
#
# GENUINE ENGINE DEFECT FOUND BELOW THIS COMMENT, NOT A TEST-PIN BUG -- per
# this file's "if an .asm change is genuinely required, STOP and report"
# instruction, this is reported rather than worked around.  Measured
# 2026-09-09: `GBBOOT /E /A 1 /B 36 /T 1` fails with "native preview failed"
# REGARDLESS of Set-Session coordinates -- reverting to the original (4,5,4)
# pin reproduces the identical failure and the identical stale _GBSTEP.BIN
# bytes, so the door-edge fact above, while true, is not this failure's cause.
# `GBBOOT /E /A 1 /B 35 /T 1` fails the same way; `/B 32` (used earlier in
# this same file, line ~155) succeeds. The failure occurs BEFORE CCFP ever
# runs: DOK36VM.TXT ends at "CCPARTY: loaded 6 member(s)" with no CCGEO or
# CCFP output at all, and DOK36STP.BIN after the run is byte-identical to the
# STALE _GBSTEP.BIN left by the earlier /B 32 call in this file's main conf
# (both confs mount the same native/build dir as C:), proving GBBOOT never
# reaches its own CCFP invocation for block 36.
# Manually replicating GBBOOT's own composed pipeline OUTSIDE gbboot.asm
# (`CCECL D:\ECL1.DAX 36 /N 6 /E ... /T` with no /J/Q/2/X/@ modifier, matching
# build_ecl_tail's no-modifier form for a fresh boot; then
# `CCGEO /B D:\GEO1.DAX 36 <wall>`; then `CCFP <wall> /N <session> /Y <step>
# /M F`, matching build_geo_tail/build_fp_tail) SUCCEEDS end-to-end for BOTH
# block 32 and block 36 -- CCECL/CCGEO/CCFP are not broken for area 36's data.
# So the defect is specific to gbboot.asm's OWN internal dispatch for /B 36
# (and /B 35), not to the external tools or to this test's chosen position.
# Root-caused no further without editing gbboot.asm (out of this test's
# authorized scope); the earliest plausible failure sites read from the
# source are the do_exec calls for CCECL/CCGEO inside run_native_preview's
# raw-entry (`.run_ecl`/`.have_map`) path, or a jc-unchecked early setup call
# (sync_cok_roster_count / collect_cok_owned_affects / write_seed_sidecar)
# that this investigation could not isolate further without instrumenting
# the assembly.
#
# THE "SECOND DEFECT" ABOVE IS RETRACTED 2026-09-10 -- ITS PREMISE WAS WRONG.
# What stood here reported "CCFP's write_step_yield writes the RAW (unmasked)
# descriptor byte ... not the low-7-bits-masked logical descriptor", inferring a
# missing mask from measuring 0x8E (142) where this assertion expected 14.
# There is no mask, and there never was one. 14 and 142 are not the same cell's
# descriptor masked and unmasked -- THEY ARE TWO DIFFERENT CELLS:
#   * 14  is the raw roof byte of cell (4,6), which happens to have bit 7 clear.
#   * 142 is the raw roof byte of cell (3,9), which has bit 7 set.
# The commit that moved `Set-Session` from `4 5 4` to `3 8 4` updated the x/y
# pins at offsets 8/10 to 3/9 but left the descriptor literal at 14, so the
# "mask" was an artifact of moving a coordinate without moving the value that
# coordinate produces. Verified by running the pre-move pin `Set-Session 4 5 4`,
# which still reports `STEP: desc=14 x=4 y=6 facing=4` exactly.
#
# The engine is RIGHT to write the byte raw, on three independent grounds:
#  1. Bit 7 is a LIVE FLAG in that same byte, not spare width: ccfp.asm:1180-1181
#     `test al,80h` suppresses the sky backdrop, and the browser engine names it
#     ROOF_INDOOR_BIT = 0x80 (packages/engine/src/render/sky.ts:51-52). Masking
#     would destroy it and tell the VM that an indoor cell is outdoors.
#  2. EIGHT other readers of _GBSTEP.BIN offset 6 across four titles pin RAW
#     values with bit 7 set (154, 141, 140, 129, 142, 136, 128, 140) -- including
#     154 (0x9A) at line 681 of THIS FILE. The 14 below was the only outlier in
#     the whole suite, and it had never been observed passing.
#  3. Retail does the same: ccecl.asm:1633-1640 seeds 0xC04F with the raw value
#     and masks only into a SCRATCH copy (0x7F79 = value & 0x003F), which the
#     Gateway dynamic trace of the original binary reproduces
#     (tools/analyze_gateway_ecl6_dynamic.py:843 -- `AND [0xC04F],127` into a
#     scratch descriptor, leaving the stored byte raw).
# So the pin is corrected to the raw byte 142 for the cell this test actually
# steps into. This is NOT "changing the literal until it goes green": the value
# is derived from the cell, and the three grounds above say which side was wrong.
#
# DISCLOSED OPEN ENGINE QUESTION, surfaced by this investigation and NOT closed:
# the alternative fix (revert to `Set-Session 4 5 4` and keep 14) also passes
# today -- but only because CCFP treats door AND gateway edges as passable with
# no door-open handling (ccfp.asm:1850-1854, `current_edge_door`: "0 = plain
# wall, nonzero = passable door/gateway"). (4,5)'s south edge into (4,6) is a
# CLOSED door, so that route is green only while the engine walks through closed
# doors. Whether retail requires an explicit open-door action is unresolved and
# needs retail door semantics, not another GBBOOT run. (3,8)->(3,9) is used here
# instead precisely because it is a genuine doorless open edge, so this pin does
# not depend on that gap and will not silently change when it is fixed.
Set-Session 3 8 4

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $vmConf -Headless:$Headless -Cycles 'fixed 18000'
if (-not $p.WaitForExit(60000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT DoK vmRun step probe timed out'
}

$vmStep = [IO.File]::ReadAllBytes((Join-Path $build 'DOK36STP.BIN'))
# Descriptor 142 (0x8E) is cell (3,9)'s RAW roof byte, bit 7 set = indoor/roofed.
# See the retraction above before "correcting" this to 14.
if ([BitConverter]::ToUInt16($vmStep, 6) -ne 142) {
  throw "GBBOOT DoK vmRun step descriptor: expected raw 142 (0x8E) for cell (3,9), got $([BitConverter]::ToUInt16($vmStep, 6))"
}
if ([BitConverter]::ToUInt16($vmStep, 8) -ne 3) {
  throw "GBBOOT DoK vmRun step x: expected 3, got $([BitConverter]::ToUInt16($vmStep, 8))"
}
if ([BitConverter]::ToUInt16($vmStep, 10) -ne 9) {
  throw "GBBOOT DoK vmRun step y: expected 9, got $([BitConverter]::ToUInt16($vmStep, 10))"
}
if ([BitConverter]::ToUInt16($vmStep, 12) -ne 4) {
  throw "GBBOOT DoK vmRun step facing: expected 4 (south), got $([BitConverter]::ToUInt16($vmStep, 12))"
}

$gbbootVmrun = Get-Content (Join-Path $build 'DOK36EVT.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0000 status=0000 geo=FFFF chain=FFFF',
  'GBRS flags=0000 area=0024 pc=0383',
  '@01 MEM key=4C00 value=0001',
  'GBSX count=0000'
)) {
  if ($gbbootVmrun -notlike "*$needle*") {
    throw "GBBOOT DoK movement vmRun event missing: $needle"
  }
}

# DECOUPLED 2026-09-10. What stood here asserted block 36's SearchLocation out
# of DOK36ECL.TXT -- the effect dump left by GBBOOT's THIRD CCECL pass in the
# vmConf above -- and pinned `flags=0020 / pc=004C / SURPRISE ARGC=05 ARGS=
# 0000 0000 0004 0001 0001`. It was measured and real: rebuilding the engine at
# 23ba497 (2026-07-15) and running GBBOOT's own pipeline at that block's
# original cell (4,5,4) reproduces all three needles byte for byte. Unlike the
# gbdqk-multistep case, this pin was never committed red.
#
# It went stale on TWO independent axes, which is why it is decoupled rather
# than re-pinned in place:
#  1. DIALECT. e588ffb (2026-07-25) landed the retail-correct short-form
#     dialect. Isolating `CCECL D:\ECL1.DAX 36 /J 14 /F 2` with the revision as
#     the only variable moves pc 004C -> 130E and SURPRISE ARGC=05 -> ARGC=00,
#     at that commit and unchanged at HEAD. 717cc58's own message names e588ffb
#     as having "missed two scripts"; it missed a third, and this was it. That
#     same commit re-pinned three sibling PCs in this file for this exact cause
#     (0237->0239, 0416->0413, 0191->015F), accepting the engine as right each
#     time. Same class, same verdict.
#  2. COORDINATE. 717cc58 moved `Set-Session` to (3,8,4) but left this block's
#     needles authored for (4,5,4) -- the identical coordinate-drift defect as
#     the descriptor pin retracted further up this file.
#
# Re-deriving it at (3,8,4) would pin `flags=0000 / GBSX count=0000 / pc=133A`,
# i.e. an ABSENCE of script events -- a weak probe by this repo's own rule, and
# it would state one fact twice (flags=0020 IS FX_HAVE_SCRIPT, ccecl.asm:178,
# so "flags=0000" and "count=0000" are not two independent needles). Moving the
# whole block back to (4,5,4) would restore the original meaning but reintroduce
# the closed-door passability dependency the descriptor pin deliberately avoids.
#
# So SearchLocation is now asserted from its OWN direct CCECL probe in the main
# conf (`/J 14 /F 2`, the same shape blocks 32/33/51 already use at :90/:93),
# and the movement-vmRun block above keeps (3,8,4). One claim per probe, and
# neither depends on the other's coordinate.
#
# NAMING TRAP, recorded because it cost a step: in gbboot.asm
# `s_arg_search db ' /J '` and `s_arg_vmrun db ' /Q '` -- /J is SearchLocation
# and /Q is vmRun1, the OPPOSITE of what the letters suggest.
#
# WHY (3,9) IS SILENT -- the null the "missing mask" hypothesis never had.
# A 64-run isolated sweep of /J over descriptors 0..31 and 128..159 shows the
# bit-7-clear and bit-7-set columns mirroring each other exactly, with identical
# event counts per pair. The SINGLE exception in 64 runs is 14 <-> 142: 14 fires
# (n=1), 142 is silent. If the engine were failing to mask, all 16 roofed values
# would be silent; 15 of 16 fire identically, so bit 7 is already masked off
# INSIDE the ECL dispatch and descriptor 14 uniquely branches on the roof bit.
# /Q confirms the content: /Q 14 -> "GO UP INTO THE TOWER?", /Q 142 -> "GO DOWN
# INTO THE TOWN?". (4,6) is the outdoor tower approach, (3,9) the indoor town
# descent. (3,9)'s silent SearchLocation is deliberate ECL content, not a bug.
$dokJ14 = Get-Content (Join-Path $build 'DOKJ14.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0020 status=0000 geo=FFFF chain=FFFF',
  'GBRS flags=0000 area=0024 pc=130E',
  '#00 OP=23 SURPRISE ARGC=00'
)) {
  if ($dokJ14 -notlike "*$needle*") {
    throw "CCECL DoK block-36 direct SearchLocation (/J 14 /F 2) effect missing: $needle"
  }
}

# VERDICT LINE (2026-09-10). This line previously ended without the word PASS, so
# native/run-flow-suite.ps1 classified a clean exit 0 as FAIL under its
# `zero-exit-without-verdict` rule -- correctly: a runner cannot read a verdict that
# is not there. The word is EARNED here, not appended to buy a green:
#   * the script sets `$ErrorActionPreference = 'Stop'` at :11 and contains 82 `throw`
#     statements with no try/catch anywhere, so any failed pin aborts the run;
#   * this is the LAST line of the file, reachable only after all 82 hold.
# The sibling scan `ccecl-dok-static-combat-scan.ps1` earns its `RESULT: ... PASS`
# the same way. Do NOT copy this to `ccecl-dok-b51-watch-test.ps1`, whose single
# `throw` is a timeout guard and which asserts nothing about content -- its FAIL
# classification is the rule working.
Write-Output 'RESULT: DoK combat gap pinned: empty COMBAT rejects direct CCCOMBAT, Gen1 vmRun1 /F seeds the facing gate, Gen1 /2 pins noncombat PreCampCheck state updates, CCECL RANDOM writes the SearchLocation selector destination, ECL2 block-51 vmRun1 yields queued combat through CCECL/CCCOMBAT/CCECL /R and GBBOOT /1 owns the same seeded handoff, GBBOOT preserves movement vmRun events before SearchLocation, block-36 SearchLocation selector sweep exits before tactical combat except selector 27 (a genuine LOAD_MONSTER SIVAKS route reached through the random table), block-34 descriptor 12 preserves the attack text through its PARTYSTRENGTH ACK before cold continuation, block-34 and block-36 direct tacticals run through CCECL/CCCOMBAT/GBBOOT resume paths, and GBBOOT resumes empty combat through CCECL /R PASS'
exit 0
