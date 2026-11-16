# ccecl-dok-thief-matrix-test.ps1 -- GBPS v2 selected thief-skill matrix probe.
#
# DoK ECL2 block 51 has a trap-detection branch that reads selected-player
# pseudo fields 0x7D00 (in combat) and 0x7CA7 (find/remove traps). This test
# proves CCECL can source 0x7CA7 from the GBPS v2 per-member thief matrix,
# rather than from a direct sparse /X memory seed. The high-skill branch yields
# a typed ACK; its cold continuation presents the real DISARM/LEAVE menu.
param(
  [switch]$Headless
)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'Death Knights of Krynn'
# Mount a scratch mirror, never the retail release itself: `mount D "$game"`
# followed by `D:` makes the read-only GOG folder the DOS child's current drive,
# so its stray writes (CCFP.MOV, rewritten SAVE\CHRDATA*) land in the retail
# tree. CLAUDE.md: game-data folders are read-only source.
. (Join-Path $PSScriptRoot 'retail-stage.ps1')
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
$dbx = Join-Path $root 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: CCECL DoK thief matrix probe (DOSBox.exe absent)'
  exit 0
}
if (-not (Test-Path -LiteralPath $dbx)) {
  Write-Output 'SKIP: CCECL DoK thief matrix probe (DOSBox-X absent)'
  exit 0
}

foreach ($name in @('ECL2.DAX')) {
  if (-not (Test-Path (Join-Path $game $name))) {
    Write-Output "SKIP: CCECL DoK thief matrix probe ($name absent)"
    exit 0
  }
}

$gameMount = New-RetailStage -Source $game
& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

function Write-MatrixSeed([string]$Path, [byte]$SkillValue) {
  $seed = New-Object byte[] 216
  [Text.Encoding]::ASCII.GetBytes('GBPS').CopyTo($seed, 0)
  [BitConverter]::GetBytes([uint16]2).CopyTo($seed, 4)   # GBPS v2: thief matrix tail
  [BitConverter]::GetBytes([uint16]1).CopyTo($seed, 6)   # count flag
  [BitConverter]::GetBytes([uint16]6).CopyTo($seed, 8)   # six valid party members
  [BitConverter]::GetBytes([uint16]1).CopyTo($seed, 10)  # ranger present
  [BitConverter]::GetBytes([uint16]4).CopyTo($seed, 12)  # encounter distance
  $seed[150] = 6                                         # matrix row count
  for ($member = 0; $member -lt 6; $member++) {
    for ($skill = 0; $skill -lt 8; $skill++) {
      $seed[152 + ($member * 8) + $skill] = $SkillValue
    }
  }
  [IO.File]::WriteAllBytes($Path, $seed)
}

Write-MatrixSeed (Join-Path $build 'DOKMTRXH.GBP') 100
Write-MatrixSeed (Join-Path $build 'DOKMTRXL.GBP') 0

$conf = Join-Path $build '_ccecl_dok_thief_matrix.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$gameMount"
C:
C:\CCECL D:\ECL2.DAX 51 /E C:\DOKMTRXH.BIN /Q 29 /F 0 /G C:\DOKMTRXH.GBP /H 1 /Z 240 /D 4 /T > NUL
REN C:\CCECL.TRC DOKMTRXH.TRC
C:\CCEFX C:\DOKMTRXH.BIN C:\DOKMTRXH.TXT
C:\CCECL D:\ECL2.DAX 51 /E C:\DOKMTRXL.BIN /Q 29 /F 0 /G C:\DOKMTRXL.GBP /H 1 /Z 240 /D 4 /T > NUL
REN C:\CCECL.TRC DOKMTRXL.TRC
C:\CCEFX C:\DOKMTRXL.BIN C:\DOKMTRXL.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

Remove-Item (Join-Path $build 'DOKMTRXH.BIN'),
  (Join-Path $build 'DOKMTRXH.TXT'),
  (Join-Path $build 'DOKMTRXH.TRC'),
  (Join-Path $build 'DOKMTRXL.BIN'),
  (Join-Path $build 'DOKMTRXL.TXT'),
  (Join-Path $build 'DOKMTRXL.TRC'),
  (Join-Path $build 'B51MENU.TRC'),
  (Join-Path $build 'B51XP.TRC'),
  (Join-Path $build 'B51DSRM.TRC'),
  (Join-Path $build 'B51LEAVE.TRC'),
  (Join-Path $build 'CCECL.TRC') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless -Cycles 'fixed 25000'
try {
  if (-not $p.WaitForExit(60000)) {
    Stop-DosBoxSmoke -Process $p
    throw 'CCECL DoK thief matrix probe timed out'
  }
} finally {
  Stop-DosBoxSmoke -Process $p
}

$highDump = Get-Content (Join-Path $build 'DOKMTRXH.TXT') -Raw
foreach ($needle in @(
  'GBEF v000F flags=0020 status=0002 geo=FFFF chain=FFFF',
  'GBRS flags=0001 area=0033 pc=0235',
  '#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 7C00',
  '#01 OP=11 PRINT ARGC=01 ARGS= 000B TEXT= FINDS A TRAP.',
  '#02 OP=1D PARTYSTRENGTH ARGC=00'
)) {
  if ($highDump -notlike "*$needle*") {
    throw "DoK block-51 GBPS thief-matrix path missing: $needle"
  }
}

$highTrace = Get-Content (Join-Path $build 'DOKMTRXH.TRC') -Raw
foreach ($needle in @(
  'PC=0222 OP=12',
  'PC=0226 OP=11',
  'PC=0234 OP=1D'
)) {
  if ($highTrace -notlike "*$needle*") {
    throw "DoK block-51 GBPS thief-matrix trace missing: $needle"
  }
}
if ($highTrace -like '*PC=0239 OP=41*' -or $highTrace -like '*PC=0186 OP=24*') {
  throw 'DoK block-51 high-skill producer advanced past its PARTYSTRENGTH ACK boundary'
}

$lowDump = Get-Content (Join-Path $build 'DOKMTRXL.TXT') -Raw
if ($lowDump -like '* FINDS A TRAP.*' -or
    $lowDump -like '*THE DOOR IS TRAPPED.*' -or
    $lowDump -like '*GBEC groups=*' -or
    $lowDump -like '*MONSTER id=*') {
  throw 'DoK block-51 zero thief-matrix unexpectedly passed trap detection or yielded combat'
}
$lowTrace = Get-Content (Join-Path $build 'DOKMTRXL.TRC') -Raw
if ($lowTrace -like '*PC=0222 OP=12*' -or
    $lowTrace -like '*PC=0186 OP=24*') {
  throw 'DoK block-51 zero thief-matrix trace unexpectedly entered a trap branch'
}

# Exercise the typed ACK and both actual SHORT_MENU responses. The shared
# GameLink helper verifies area 51 / PC 0235 against CCFP's opened _GBECL.BIN,
# then inserts BIOS Enter without taking host keyboard focus. All subsequent
# cold resumes use CCFLOW and CCMENU's validated response tokens.
Remove-Item (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.GBS'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build 'B51MENU.BIN'),
  (Join-Path $build 'B51MENU.GBS'),
  (Join-Path $build 'B51MENU.TXT'),
  (Join-Path $build 'B51MENU.TRC'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.GBS'),
  (Join-Path $build '_GBRES.OUT'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build 'B51XP.TXT'),
  (Join-Path $build 'B51XP.TRC'),
  (Join-Path $build 'B51DSRM.GMO'),
  (Join-Path $build 'B51DSRM.BIN'),
  (Join-Path $build 'B51DSRM.TXT'),
  (Join-Path $build 'B51DSRM.TRC'),
  (Join-Path $build 'B51LEAVE.GMO'),
  (Join-Path $build 'B51LEAVE.BIN'),
  (Join-Path $build 'B51LEAVE.TXT'),
  (Join-Path $build 'B51LEAVE.TRC') -Force -ErrorAction SilentlyContinue

$block51Commands = @'
C:\CCFLOW D:\ECL2.DAX 51 /! /E C:\_GBECL.BIN /Q 29 /F 0 /G C:\DOKMTRXH.GBP /H 1 /Z 240 /D 4 /T > NUL
C:\CCFP C:\_GBECL.BIN C:\_GBCOMB.OUT > NUL
C:\CCFLOW D:\ECL2.DAX 51 /R C:\_GBECL.BIN C:\_GBCOMB.OUT /! /E C:\B51MENU.BIN /G C:\DOKMTRXH.GBP /H 1 /Z 240 /D 4 /T > NUL
COPY D:\CCECL.TRC C:\B51MENU.TRC > NUL
C:\CCEFX C:\B51MENU.BIN C:\B51MENU.TXT
C:\CCMENU C:\B51MENU.BIN C:\B51DSRM.GMO /S 0 > NUL
C:\CCFLOW D:\ECL2.DAX 51 /R C:\B51MENU.BIN C:\B51DSRM.GMO /! /E C:\_GBRES.BIN /G C:\DOKMTRXH.GBP /H 1 /Z 240 /D 4 /T > NUL
COPY D:\CCECL.TRC C:\B51XP.TRC > NUL
C:\CCEFX C:\_GBRES.BIN C:\B51XP.TXT
C:\CCFP C:\_GBRES.BIN C:\_GBRES.OUT > NUL
C:\CCFLOW D:\ECL2.DAX 51 /R C:\_GBRES.BIN C:\_GBRES.OUT /! /E C:\B51DSRM.BIN /G C:\DOKMTRXH.GBP /H 1 /Z 240 /D 4 /T > NUL
COPY D:\CCECL.TRC C:\B51DSRM.TRC > NUL
C:\CCEFX C:\B51DSRM.BIN C:\B51DSRM.TXT
C:\CCMENU C:\B51MENU.BIN C:\B51LEAVE.GMO /S 1 > NUL
C:\CCFLOW D:\ECL2.DAX 51 /R C:\B51MENU.BIN C:\B51LEAVE.GMO /! /E C:\B51LEAVE.BIN /G C:\DOKMTRXH.GBP /H 1 /Z 240 /D 4 /T > NUL
COPY D:\CCECL.TRC C:\B51LEAVE.TRC > NUL
C:\CCEFX C:\B51LEAVE.BIN C:\B51LEAVE.TXT
'@
Invoke-DokGameLinkAckFlow -DbxExe $dbx -BuildDir $build -GameDir $gameMount `
  -GuestCommand $block51Commands `
  -DosLogFile (Join-Path $build 'dok-block51-ack-dosbox-files.log') `
  -CaptureRoot (Join-Path $build 'dok-block51-ack-gamelink') -TimeoutSeconds 60

$initial = [IO.File]::ReadAllBytes((Join-Path $build '_GBECL.BIN'))
$typedSidecar = [IO.File]::ReadAllBytes((Join-Path $build '_GBECL.GBS'))
if ($initial.Length -ne 5932 -or
    [Text.Encoding]::ASCII.GetString($initial, 0, 4) -ne 'GBEF' -or
    [BitConverter]::ToUInt16($initial, 4) -ne 15 -or
    [BitConverter]::ToUInt16($initial, 8) -ne 2 -or
    ([BitConverter]::ToUInt16($initial, 6) -band 0x0100) -eq 0 -or
    [BitConverter]::ToUInt16($initial, 122) -ne 51 -or
    [BitConverter]::ToUInt16($initial, 124) -ne 565) {
  throw 'DoK block-51 CCFLOW producer did not preserve the typed PC 0235 ACK identity'
}
if ($typedSidecar.Length -lt 8 -or
    [Text.Encoding]::ASCII.GetString($typedSidecar, 0, 4) -ne 'GBSL' -or
    [BitConverter]::ToUInt16($typedSidecar, 6) -ne 3) {
  throw 'DoK block-51 CCFLOW ACK omitted its three-record GBSL sidecar'
}
$menuDump = Get-Content (Join-Path $build 'B51MENU.TXT') -Raw
foreach ($needle in @(
  'GBEF v000E flags=0020 status=0002',
  'GBRS flags=0001 area=0033 pc=026B',
  'MEM key=4CE9 value=0001',
  'THE DOOR IS TRAPPED.',
  'ARGS= 7F79 0002',
  'TEXT=DISARM',
  '#00 OP=41 UNKNOWN ARGC=02 ARGS= 0000 1D4C'
)) {
  if ($menuDump -notlike "*$needle*") {
    throw "DoK block-51 cold menu frontier missing: $needle"
  }
}
$menuTrace = Get-Content (Join-Path $build 'B51MENU.TRC') -Raw
foreach ($needle in @('PC=0239 OP=41', 'PC=023F OP=09', 'PC=0245 OP=12', 'PC=0258 OP=31')) {
  if ($menuTrace -notlike "*$needle*") {
    throw "DoK block-51 menu trace missed its retail cold continuation: $needle"
  }
}
if ($menuTrace -like '*PC=0234 OP=1D*') {
  throw 'DoK block-51 menu trace replayed the already acknowledged PARTYSTRENGTH prefix'
}
$xpAck = Get-Content (Join-Path $build 'B51XP.TXT') -Raw
if ($xpAck -notlike '*GBEF v000F flags=0120 status=0002*' -or
    $xpAck -notlike '*GBRS flags=0001 area=0033 pc=02CE*' -or
    $xpAck -notlike '*ARGS= 0000 2710*' -or
    $xpAck -notlike '*DISARMED THE TRAP.*') {
  throw 'DoK block-51 DISARM did not preserve its typed XP ACK and narration'
}
$disarmDump = Get-Content (Join-Path $build 'B51DSRM.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0020 status=0000',
  'GBRS flags=0000 area=0033 pc=02D7',
  'MEM key=4CE9 value=0001',
  'MEM key=4CE8 value=0010'
)) {
  if ($disarmDump -notlike "*$needle*") {
    throw "DoK block-51 DISARM cold continuation missing: $needle"
  }
}
$disarmTrace = Get-Content (Join-Path $build 'B51DSRM.TRC') -Raw
if ($disarmTrace -notlike '*PC=02CE OP=30*' -or $disarmTrace -notlike '*PC=02D7 OP=00*' -or
    $disarmTrace -like '*PC=02B1 OP=41*') {
  throw 'DoK block-51 DISARM continuation did not OR its flag and exit without repeating XP'
}
if ($xpAck -notlike '*ARGS= 0000 2710*' -or $xpAck -like '*GBEC groups=*') {
  throw 'DoK block-51 DISARM did not record XP 0/10000 or unexpectedly queued combat'
}
$xpTrace = Get-Content (Join-Path $build 'B51XP.TRC') -Raw
if ($xpTrace -notlike '*PC=02B1 OP=41*' -or $xpTrace -notlike '*PC=02CD OP=1D*' -or
    $xpTrace -like '*PC=0239 OP=41*') {
  throw 'DoK block-51 DISARM trace did not reach XP and its next ACK without replaying the menu'
}
$leaveDump = Get-Content (Join-Path $build 'B51LEAVE.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0020 status=0000',
  'GBRS flags=0000 area=0033 pc=0279',
  'MEM key=7EC9 value=00FF',
  'MEM key=4CE9 value=0001'
)) {
  if ($leaveDump -notlike "*$needle*") {
    throw "DoK block-51 LEAVE cold continuation missing: $needle"
  }
}
if ($leaveDump -like '*GBEC groups=*') {
  throw 'DoK block-51 LEAVE unexpectedly yielded combat'
}
$leaveTrace = Get-Content (Join-Path $build 'B51LEAVE.TRC') -Raw
if ($leaveTrace -notlike '*PC=0272 OP=09*' -or $leaveTrace -notlike '*PC=0279 OP=00*' -or
    $leaveTrace -like '*PC=02B1 OP=41*') {
  throw 'DoK block-51 LEAVE continuation did not save and exit without the DISARM award'
}

Write-Output 'RESULT: CCECL DoK GBPS v2 selected thief-skill matrix PASS'
exit 0
