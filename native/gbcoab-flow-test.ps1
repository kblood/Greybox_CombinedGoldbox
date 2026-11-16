# Real Curse/CoAB GBBOOT combat flow smoke.
#
# Uses the local coab_extracted\Data dump to drive GBBOOT's non-Krynn /E path
# through both a direct ECL5 combat-yield block and a /J title-to-gameplay
# natural area-2 movement step that enters SearchLocation, queues tactical
# combat, runs CCCOMBAT, and resumes the ECL script.
param(
  [switch]$Headless
)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'coab_extracted\Data'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT Curse flow (DOSBox.exe absent)'
  exit 0
}

. (Join-Path $native 'retail-stage.ps1')

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

# --- GBSX truncation guard -------------------------------------------------
# `GBSX count=` is a SATURATING counter, not a cap.  fx_script_count in
# native\src\ccecl.asm is only ever `inc`'d, behind `cmp ax, SCRIPTCAP / jae`
# at each producer site, and dump_gbsx in ccefx.asm VALIDATES (`ja .bad`)
# rather than clamps -- so the printed number is min(real_events, SCRIPTCAP)
# and truncation is SILENT: there is no halt reason, no flag bit and no
# marker for it.  SCRIPTCAP has gone 16 -> 32 -> 64, which is how the pins
# authored on 2026-07-15 came to hold `GBSX count=0010` (16): each was a
# count clamped at the then-ceiling, not an event total.
#
# For a fixed in-file GBSX, the invariant that says "this trace was not
# truncated" is count < SCRIPTCAP.  CCFLOW's validated GBSL path replays
# chunks and can have more records than one CCECL buffer. SCRIPTCAP is parsed
# out of the assembler source below rather than hard-coded, so raising the cap
# cannot leave the fixed-record guard stale. The assertion needs no measured
# constant, and it would have gone red on the day
# those six pins were written.
#
# DO NOT "check" a count by counting the `#NN OP=` lines in the dump: that is
# TAUTOLOGICAL.  dump_gbsx's event loop is bounded by script_count itself, so
# it emits exactly that many lines whether or not the count saturated, and
# can never disagree.  Measured 2026-09-10: all five re-measured cases had
# oplines == count, INCLUDING the one that is genuinely truncated.
function Get-ScriptCap {
  $asm = Join-Path $native 'src\ccecl.asm'
  $hits = @(Get-Content $asm | Where-Object { $_ -match '^\s*SCRIPTCAP\s+equ\s+[0-9]+\s*(;.*)?$' })
  if ($hits.Count -ne 1) {
    throw "GBSX guard failed: expected exactly one 'SCRIPTCAP equ <n>' line in $asm, found $($hits.Count)"
  }
  if ($hits[0] -notmatch '^\s*SCRIPTCAP\s+equ\s+([0-9]+)') {
    throw "GBSX guard failed: could not parse SCRIPTCAP out of $asm"
  }
  [int]$Matches[1]
}
function Get-GbsxCount([string]$Text, [string]$Label) {
  $m = [regex]::Match($Text, '(?m)^GBSX count=([0-9A-Fa-f]{4})\s*$')
  if (-not $m.Success) {
    throw "$Label failed: effect dump has no 'GBSX count=' line to check for truncation"
  }
  [Convert]::ToInt32($m.Groups[1].Value, 16)
}
function Assert-GbsxNotTruncated([string]$Text, [string]$Label) {
  # CCFLOW replays a full script buffer into GBSL; CCEFX prints this marker
  # only after validating the completed sidecar. Its total may exceed one
  # CCECL chunk, so the in-file SCRIPTCAP test below applies only to GBSX.
  if ($Text -match '(?m)^GBSL count=[0-9A-Fa-f]{4}\s*$') { return }
  $cap = Get-ScriptCap
  $count = Get-GbsxCount $Text $Label
  if ($count -ge $cap) {
    throw "$Label failed: GBSX count=$count is AT/OVER SCRIPTCAP ($cap) -- the side-effect trace SATURATED, so it is silently truncated and its real event total is unknown"
  }
}

function Assert-Raw320x200([string]$Path, [string]$Context, [int]$MinColors = 3) {
  $raw = [IO.File]::ReadAllBytes($Path)
  if ($raw.Length -ne (4 + (320 * 200) + 768)) {
    throw "$Context wrote unexpected RAW length $($raw.Length)"
  }
  if ([BitConverter]::ToUInt16($raw, 0) -ne 320 -or
      [BitConverter]::ToUInt16($raw, 2) -ne 200) {
    throw "$Context did not write a 320x200 RAW snapshot"
  }
  $seen = New-Object bool[] 256
  $nonzero = 0
  $colors = 0
  for ($i = 4; $i -lt (4 + (320 * 200)); $i++) {
    $px = $raw[$i]
    if ($px -ne 0) {
      $nonzero++
    }
    if (-not $seen[$px]) {
      $seen[$px] = $true
      $colors++
    }
  }
  if ($nonzero -lt 1000 -or $colors -lt $MinColors) {
    throw "$Context wrote a blank or low-detail RAW snapshot (nonzero=$nonzero colors=$colors)"
  }
}

function Assert-Gen1GbprMember([byte[]]$Bytes, [int]$Index, [int]$Slot, [string]$Name) {
  $off = 16 + ($Index * 410)
  if ($Bytes[$off] -ne $Slot) {
    throw "GBBOOT Curse /R created wrong GBPR slot at entry $Index"
  }
  $record = $off + 1
  $actual = [Text.Encoding]::ASCII.GetString($Bytes, $record + 1, $Bytes[$record])
  if ($actual -ne $Name) {
    throw "GBBOOT Curse /R created wrong GBPR name at entry ${Index}: '$actual'"
  }
}

$required = @(
  'ECL2.DAX',
  'ECL5.DAX',
  'GEO2.DAX',
  'GEO5.DAX',
  'WALLDEF2.DAX',
  'WALLDEF5.DAX',
  '8X8D1.DAX',
  '8X8D2.DAX',
  'MON2CHA.DAX',
  '8X8D5.DAX',
  'MON5CHA.DAX'
)
foreach ($name in $required) {
  if (-not (Test-Path (Join-Path $game $name))) {
    Write-Output "SKIP: GBBOOT Curse /A 5 /B 50 flow ($name absent)"
    exit 0
  }
}

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

# CLAUDE.md lists this file as a known offender: it had FIVE raw
# `mount D "<coab_extracted\Data>"` sites followed by `D:`, which makes the
# never-vendored extraction the DOS child's CURRENT DRIVE, so any stray file it
# writes lands there.  Mount the New-RetailStage mirror instead -- the same
# mirror name gbboot-test.ps1 already uses for this source, so the two agree.
# $game itself stays the read-only source and is still what the presence gate
# above tests.
$gameMount = New-RetailStage -Source $game -Name 'coab-data'

$conf = Join-Path $build '_gbcoab_flow_test.conf'
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
C:\GBBOOT /E /X /A 5 /B 50 > C:\GBCOAB.TXT
exit
"@ | Set-Content $conf -Encoding ASCII

Remove-Item (Join-Path $build '_GBWALL.BIN'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build 'GBCOAB.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT Curse /A 5 /B 50 flow timed out'
}

$wall = [IO.File]::ReadAllBytes((Join-Path $build '_GBWALL.BIN'))
if ($wall.Length -lt 6 -or [Text.Encoding]::ASCII.GetString($wall, 0, 4) -ne 'WGRD' -or
    $wall[4] -ne 16 -or $wall[5] -ne 16) {
  throw 'GBBOOT Curse flow did not create a valid 16x16 WGRD wall bridge'
}

Assert-Raw320x200 (Join-Path $build '_GBVIEW.RAW') 'GBBOOT Curse direct first-person flow'

$effect = [IO.File]::ReadAllBytes((Join-Path $build '_GBECL.BIN'))
if ([Text.Encoding]::ASCII.GetString($effect, 0, 4) -ne 'GBEF' -or
    [BitConverter]::ToUInt16($effect, 4) -ne 9 -or
    [BitConverter]::ToUInt16($effect, 6) -ne 0x016B -or
    [BitConverter]::ToUInt16($effect, 8) -ne 3 -or
    [BitConverter]::ToUInt16($effect, 10) -ne 50) {
  throw 'GBBOOT Curse flow did not yield the expected combat GBEF'
}

$dump = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=016B status=0003 geo=0032',
  'GBLF operands=0032 0002 00FF',
  'GBLP raw=0008 00FF 00FF sets=0008 00FF 00FF',
  'GBEC groups=0002',
  '@00 MONSTER id=0039 count=0004 pic=0039',
  '@01 MONSTER id=0031 count=0003 pic=0031',
  'GBRS flags=0001 area=0032',
  'GBSL count=0007',
  '#03 OP=2B HORIZONTAL_MENU ARGC=03 ARGS= 7F79 0001 001B'
)) {
  if ($dump -notlike "*$needle*") {
    throw "GBBOOT Curse flow effect dump missing: $needle"
  }
}
Assert-GbsxNotTruncated $dump 'GBBOOT Curse /B 50 effect dump'
$side = [IO.File]::ReadAllBytes((Join-Path $build '_GBECL.GBS'))
if ($side.Length -lt (8 + 7 * 54 + 12) -or
    [Text.Encoding]::ASCII.GetString($side, 0, 4) -ne 'GBSL' -or
    [BitConverter]::ToUInt16($side, 4) -ne 2 -or
    [BitConverter]::ToUInt16($side, 6) -ne 7 -or
    [Text.Encoding]::ASCII.GetString($side, 8 + 7 * 54, 4) -ne 'GBPX') {
  throw 'GBBOOT Curse /B 50 did not publish the expected seven-row GBSL v2'
}

Assert-Raw320x200 (Join-Path $build '_GBCOMB.RAW') 'GBBOOT Curse direct combat flow'

$expectedTrace = @(
  '1 init p0 - - - - - - -',
  '1 init p1 - - - - - - -',
  '1 init e0 - - - - - - -',
  '1 init e1 - - - - - - -',
  '1 init e2 - - - - - - -',
  '1 init e3 - - - - - - -',
  '1 init e4 - - - - - - -',
  '1 init e5 - - - - - - -',
  '1 init e6 - - - - - - -',
  '1 move e6 - - - - - - - 7 5',
  '1 move e6 - - - - - - - 7 6',
  '1 move e6 - - - - - - - 6 7',
  '1 attack e1 p1 7 9 0 - 12 -',
  '1 attack e1 p1 18 9 1 9 3 -',
  '1 move e5 - - - - - - - 5 7',
  '1 move e5 - - - - - - - 4 7',
  '1 move e5 - - - - - - - 3 7',
  '1 attack e5 p1 15 10 1 1 2 -',
  '1 attack p0 e0 2 12 0 - 42 -',
  '1 attack e0 p0 13 10 1 7 7 -',
  '1 attack e0 p0 2 10 0 - 7 -',
  '1 attack e2 p1 13 9 1 7 0 -',
  '1 slain e2 p1 - - - - 0 0',
  '1 attack e2 p0 14 10 1 9 0 -',
  '1 slain e2 p0 - - - - 0 0',
  '1 end - enemy - - - - - -'
)
$trace = @(Get-Content (Join-Path $build '_GBCOMB.TRC'))
if ($trace.Count -ne $expectedTrace.Count) {
  throw "GBBOOT Curse combat trace length mismatch: expected $($expectedTrace.Count), got $($trace.Count)"
}
for ($i = 0; $i -lt $expectedTrace.Count; $i++) {
  if ($trace[$i] -ne $expectedTrace[$i]) {
    throw "GBBOOT Curse combat trace mismatch at line $($i + 1): expected '$($expectedTrace[$i])', got '$($trace[$i])'"
  }
}

$outcome = (Get-Content (Join-Path $build '_GBCOMB.OUT') -Raw).Trim()
$resume = Get-Content (Join-Path $build '_GBRES.TXT') -Raw
if ($outcome -ne 'enemy' -or $resume -notlike '*GBRS*') {
  throw 'GBBOOT Curse flow did not produce expected combat outcome/resume sidecars'
}

$block51Conf = Join-Path $build '_gbcoab_b51_flow_test.conf'
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
C:\GBBOOT /E /X /A 5 /B 51 > C:\GBCOAB51.TXT
exit
"@ | Set-Content $block51Conf -Encoding ASCII

Remove-Item (Join-Path $build '_GBWALL.BIN'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build 'GBCOAB51.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $block51Conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT Curse /A 5 /B 51 flow timed out'
}

$wall = [IO.File]::ReadAllBytes((Join-Path $build '_GBWALL.BIN'))
if ($wall.Length -lt 6 -or [Text.Encoding]::ASCII.GetString($wall, 0, 4) -ne 'WGRD' -or
    $wall[4] -ne 16 -or $wall[5] -ne 16) {
  throw 'GBBOOT Curse /B 51 flow did not create a valid 16x16 WGRD wall bridge'
}

Assert-Raw320x200 (Join-Path $build '_GBVIEW.RAW') 'GBBOOT Curse /B 51 first-person flow'

$effect = [IO.File]::ReadAllBytes((Join-Path $build '_GBECL.BIN'))
if ([Text.Encoding]::ASCII.GetString($effect, 0, 4) -ne 'GBEF' -or
    [BitConverter]::ToUInt16($effect, 4) -ne 9 -or
    [BitConverter]::ToUInt16($effect, 6) -ne 0x016F -or
    [BitConverter]::ToUInt16($effect, 8) -ne 3 -or
    [BitConverter]::ToUInt16($effect, 10) -ne 51) {
  throw 'GBBOOT Curse /B 51 flow did not yield the expected combat GBEF'
}

$dump = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=016F status=0003 geo=0033',
  'GBLF operands=0033 0002 00FF',
  'GBLP raw=000E 000F 00FF sets=000E 00FF 00FF',
  'GBEC groups=0001',
  '@00 MONSTER id=0035 count=000E pic=0035',
  'GBRS flags=0001 area=0033',
  'GBSL count=0037',
  '#05 OP=2B HORIZONTAL_MENU ARGC=03 ARGS= 7F79 0001 001B',
  'TEXT=COMBAT'
)) {
  Assert-Contains $dump $needle 'GBBOOT Curse /B 51 effect dump'
}
Assert-GbsxNotTruncated $dump 'GBBOOT Curse /B 51 effect dump'

Assert-Raw320x200 (Join-Path $build '_GBCOMB.RAW') 'GBBOOT Curse /B 51 tactical flow'

$expectedTrace = @(
  '1 init p0 - - - - - - -',
  '1 init p1 - - - - - - -',
  '1 init e0 - - - - - - -',
  '1 init e1 - - - - - - -',
  '1 init e2 - - - - - - -',
  '1 init e3 - - - - - - -',
  '1 init e4 - - - - - - -',
  '1 init e5 - - - - - - -',
  '1 init e6 - - - - - - -',
  '1 init e7 - - - - - - -',
  '1 init e8 - - - - - - -',
  '1 init e9 - - - - - - -',
  '1 init e10 - - - - - - -',
  '1 init e11 - - - - - - -',
  '1 init e12 - - - - - - -',
  '1 init e13 - - - - - - -',
  '1 move e9 - - - - - - - 7 3',
  '1 move e8 - - - - - - - 6 7',
  '1 move e8 - - - - - - - 5 7',
  '1 move e8 - - - - - - - 4 7',
  '1 attack e8 p1 20 6 1 3 9 -',
  '1 attack e8 p1 2 6 0 - 9 -',
  '1 attack e8 p1 13 6 1 4 5 -',
  '1 attack e8 p1 7 6 1 2 3 -',
  '1 attack e8 p1 5 6 0 - 3 -',
  '1 attack e1 p1 4 6 0 - 3 -',
  '1 attack e1 p1 11 6 1 2 1 -',
  '1 attack e1 p1 9 6 1 4 0 -',
  '1 slain e1 p1 - - - - 0 0',
  '1 attack e1 p0 15 7 1 2 12 -',
  '1 attack e1 p0 13 7 1 9 3 -',
  '1 move e7 - - - - - - - 7 6',
  '1 move e7 - - - - - - - 6 7',
  '1 move e7 - - - - - - - 5 7',
  '1 move e10 - - - - - - - 7 6',
  '1 move e10 - - - - - - - 6 7',
  '1 move e11 - - - - - - - 7 5',
  '1 attack p0 e0 9 12 0 - 48 -',
  '1 attack e0 p0 8 7 1 3 0 -',
  '1 slain e0 p0 - - - - 0 0',
  '1 end - enemy - - - - - -'
)
$trace = @(Get-Content (Join-Path $build '_GBCOMB.TRC'))
if ($trace.Count -ne $expectedTrace.Count) {
  throw "GBBOOT Curse /B 51 combat trace length mismatch: expected $($expectedTrace.Count), got $($trace.Count)"
}
for ($i = 0; $i -lt $expectedTrace.Count; $i++) {
  if ($trace[$i] -ne $expectedTrace[$i]) {
    throw "GBBOOT Curse /B 51 combat trace mismatch at line $($i + 1): expected '$($expectedTrace[$i])', got '$($trace[$i])'"
  }
}

$outcome = (Get-Content (Join-Path $build '_GBCOMB.OUT') -Raw).Trim()
if ($outcome -ne 'enemy') {
  throw "GBBOOT Curse /B 51 flow produced unexpected combat outcome '$outcome'"
}

$cr = [IO.File]::ReadAllBytes((Join-Path $build '_GBCR.BIN'))
if ($cr.Length -lt 28 -or [Text.Encoding]::ASCII.GetString($cr, 0, 4) -ne 'GBCR' -or
    [BitConverter]::ToUInt16($cr, 10) -ne 2) {
  throw 'GBBOOT Curse /B 51 flow did not write a GBCR combat result bridge'
}

$resume = Get-Content (Join-Path $build '_GBRES.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0120 status=0000 geo=FFFF',
  'GBRS flags=0000 area=0033',
  'GBSL count=0007',
  'TEXT=DURING THE FIGHT, DRACANDROS ESC',
  'TEXT=THE DRAGON BODIES LIE STREWN ABO',
  'TEXT=TO REST SAFELY.'
)) {
  Assert-Contains $resume $needle 'GBBOOT Curse /B 51 resume dump'
}
Assert-GbsxNotTruncated $resume 'GBBOOT Curse /B 51 resume dump'

$block53Conf = Join-Path $build '_gbcoab_b53_flow_test.conf'
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
C:\GBBOOT /E /X /A 5 /B 53 > C:\GBCOAB53.TXT
exit
"@ | Set-Content $block53Conf -Encoding ASCII

Remove-Item (Join-Path $build '_GBWALL.BIN'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build 'GBCOAB53.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $block53Conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT Curse /A 5 /B 53 flow timed out'
}

$wall = [IO.File]::ReadAllBytes((Join-Path $build '_GBWALL.BIN'))
if ($wall.Length -lt 6 -or [Text.Encoding]::ASCII.GetString($wall, 0, 4) -ne 'WGRD' -or
    $wall[4] -ne 16 -or $wall[5] -ne 16) {
  throw 'GBBOOT Curse /B 53 flow did not create a valid 16x16 WGRD wall bridge'
}

Assert-Raw320x200 (Join-Path $build '_GBVIEW.RAW') 'GBBOOT Curse /B 53 first-person flow'

$effect = [IO.File]::ReadAllBytes((Join-Path $build '_GBECL.BIN'))
if ([Text.Encoding]::ASCII.GetString($effect, 0, 4) -ne 'GBEF' -or
    [BitConverter]::ToUInt16($effect, 4) -ne 9 -or
    [BitConverter]::ToUInt16($effect, 6) -ne 0x0127 -or
    [BitConverter]::ToUInt16($effect, 8) -ne 0 -or
    [BitConverter]::ToUInt16($effect, 10) -ne 53) {
  throw 'GBBOOT Curse /B 53 flow did not yield the expected noncombat GBEF'
}

$dump = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0127 status=0000 geo=0035',
  'GBLF operands=0035 0002 00FF',
  'GBLP raw=000E 000F 0008 sets=000E 00FF 0008',
  'GBSL count=000A',
  '#02 OP=2B HORIZONTAL_MENU ARGC=03 ARGS= 7F82 0001 001B'
)) {
  Assert-Contains $dump $needle 'GBBOOT Curse /B 53 effect dump'
}
Assert-GbsxNotTruncated $dump 'GBBOOT Curse /B 53 effect dump'

foreach ($name in @('_GBCOMB.TRC', '_GBCOMB.OUT', '_GBCOMB.RAW', '_GBCR.BIN', '_GBRES.BIN', '_GBRES.TXT')) {
  if (Test-Path (Join-Path $build $name)) {
    throw "GBBOOT Curse /B 53 noncombat branch unexpectedly wrote $name"
  }
}

$naturalConf = Join-Path $build '_gbcoab_natural_flow_test.conf'
$naturalCreateConf = Join-Path $build '_gbcoab_natural_create_flow_test.conf'
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
C:\GBBOOT /E /J /A 2 /T 1 /R COAB_CLERIC C /R COAB_FIGHTER F /R COAB_MAGE M > C:\GBCOABN.TXT
exit
"@ | Set-Content $naturalCreateConf -Encoding ASCII

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
C:\GBBOOT /E /A 2 /T 1 > C:\GBCOABN.TXT
exit
"@ | Set-Content $naturalConf -Encoding ASCII

Remove-Item (Join-Path $build '_GBWALL.BIN'),
  (Join-Path $build '_GBVIEW.RAW'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build '_GBPARTY.GBP'),
  (Join-Path $build '_GBSEED.BIN'),
  (Join-Path $build 'GBCOABN.TXT') -Force -ErrorAction SilentlyContinue

Set-Session 5 10 2 16 16

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $naturalCreateConf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT Curse natural area-2 movement-to-combat flow timed out'
}

$naturalOut = Get-Content (Join-Path $build 'GBCOABN.TXT') -Raw
if ($naturalOut -notlike '*game:   Curse of the Azure Bonds*' -or
    $naturalOut -notlike '*native: CCECL ECL2.DAX entry 1 -> CCGEO /B GEO2.DAX*' -or
    $naturalOut -notlike '*CCGB: bounded DAX frame displayed*' -or
    $naturalOut -like '*GBBOOT: native preview failed*') {
  throw 'GBBOOT Curse /J natural flow did not enter the expected native title-to-gameplay front door'
}

$gbprPath = Join-Path $build '_GBPARTY.GBP'
$gbpr = [IO.File]::ReadAllBytes($gbprPath)
if ($gbpr.Length -ne (16 + 3 * 410) -or
    [Text.Encoding]::ASCII.GetString($gbpr, 0, 4) -ne 'GBPR' -or
    [BitConverter]::ToUInt16($gbpr, 4) -ne 2 -or
    [BitConverter]::ToUInt16($gbpr, 6) -ne 3 -or
    [BitConverter]::ToUInt16($gbpr, 8) -ne 410 -or
    [BitConverter]::ToUInt16($gbpr, 10) -ne 0 -or
    [BitConverter]::ToUInt16($gbpr, 12) -ne 1 -or
    [BitConverter]::ToUInt16($gbpr, 14) -ne 1) {
  throw 'GBBOOT Curse /R did not create a valid Gen1 GBPR'
}
Assert-Gen1GbprMember $gbpr 0 0x80 'COAB_CLERIC'
Assert-Gen1GbprMember $gbpr 1 0x81 'COAB_FIGHTER'
Assert-Gen1GbprMember $gbpr 2 0x82 'COAB_MAGE'

$seed = [IO.File]::ReadAllBytes((Join-Path $build '_GBSEED.BIN'))
if ([Text.Encoding]::ASCII.GetString($seed, 0, 4) -ne 'GBPS' -or
    [BitConverter]::ToUInt16($seed, 4) -ne 2 -or
    [BitConverter]::ToUInt16($seed, 8) -ne 3) {
  throw 'GBBOOT Curse /R did not refresh GBPS from the created roster'
}

$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
if ($step.Length -ne 14 -or [Text.Encoding]::ASCII.GetString($step, 0, 4) -ne 'GBST' -or
    [BitConverter]::ToUInt16($step, 4) -ne 1 -or
    [BitConverter]::ToUInt16($step, 6) -ne 136 -or
    [BitConverter]::ToUInt16($step, 8) -ne 6 -or
    [BitConverter]::ToUInt16($step, 10) -ne 10 -or
    [BitConverter]::ToUInt16($step, 12) -ne 2) {
  throw 'GBBOOT Curse natural flow did not step into the expected area-2 selector-8 cell'
}

$session = [IO.File]::ReadAllBytes((Join-Path $build '_GBSESS.GBS'))
if ($session.Length -ne 16 -or [Text.Encoding]::ASCII.GetString($session, 0, 4) -ne 'GBSN' -or
    [BitConverter]::ToUInt16($session, 6) -ne 6 -or
    [BitConverter]::ToUInt16($session, 8) -ne 10 -or
    [BitConverter]::ToUInt16($session, 10) -ne 2) {
  throw 'GBBOOT Curse natural flow did not persist the post-step first-person pose'
}

$wall = [IO.File]::ReadAllBytes((Join-Path $build '_GBWALL.BIN'))
if ($wall.Length -lt 6 -or [Text.Encoding]::ASCII.GetString($wall, 0, 4) -ne 'WGRD' -or
    $wall[4] -ne 16 -or $wall[5] -ne 16) {
  throw 'GBBOOT Curse natural flow did not create a valid 16x16 WGRD wall bridge'
}

$effect = [IO.File]::ReadAllBytes((Join-Path $build '_GBECL.BIN'))
if ([Text.Encoding]::ASCII.GetString($effect, 0, 4) -ne 'GBEF' -or
    [BitConverter]::ToUInt16($effect, 4) -ne 9 -or
    [BitConverter]::ToUInt16($effect, 6) -ne 0x0068 -or
    [BitConverter]::ToUInt16($effect, 8) -ne 3 -or
    [BitConverter]::ToUInt16($effect, 10) -ne 0xFFFF) {
  throw 'GBBOOT Curse natural flow did not yield the expected SearchLocation combat GBEF'
}

$dump = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0068 status=0003 geo=FFFF chain=FFFF',
  'GBEC groups=0001',
  '@00 MONSTER id=0004 count=000A pic=0004',
  'GBRS flags=0001 area=0001 pc=0ACC',
  "TEXT='WHAT'S YOUR PLEASURE?'",
  'TEXT=PUNCH BARKEEP',
  'TEXT=YOU GET INTO A BRAWL.',
  'GBES setup sprite=0002 max=0002 pic=0002 distance=0000'
)) {
  Assert-Contains $dump $needle 'GBBOOT Curse natural flow effect dump'
}

Assert-Raw320x200 (Join-Path $build '_GBCOMB.RAW') 'GBBOOT Curse natural tactical flow'

$trace = Get-Content (Join-Path $build '_GBCOMB.TRC') -Raw
foreach ($needle in @(
  '1 init p2 - - - - - - -',
  '1 init e9 - - - - - - -',
  '1 attack p0 e2 19 15 1 2 14 -',
  '1 attack p1 e2 13 13 1 2 12 -',
  '2 end - party - - - - - -'
)) {
  Assert-Contains $trace $needle 'GBBOOT Curse natural combat trace'
}

$outcome = (Get-Content (Join-Path $build '_GBCOMB.OUT') -Raw).Trim()
if ($outcome -ne 'party') {
  throw "GBBOOT Curse natural flow produced unexpected combat outcome '$outcome'"
}

$cr = [IO.File]::ReadAllBytes((Join-Path $build '_GBCR.BIN'))
if ($cr.Length -lt 34 -or [Text.Encoding]::ASCII.GetString($cr, 0, 4) -ne 'GBCR' -or
    [BitConverter]::ToUInt16($cr, 10) -ne 3) {
  throw 'GBBOOT Curse natural flow did not write a GBCR combat result bridge'
}

$resume = Get-Content (Join-Path $build '_GBRES.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0120 status=0000',
  'GBRS flags=0000 area=0001 pc=1CBD',
  'TEXT=THE SURVIVORS ARE TOSSED OUTSIDE',
  'TEXT=PRESS BUTTON OR RETURN TO CONTIN',
  '#0F OP=3A DELAY'
)) {
  Assert-Contains $resume $needle 'GBBOOT Curse natural resume dump'
}

$postCombatGbpr = [IO.File]::ReadAllBytes($gbprPath)
if ($postCombatGbpr.Length -ne $gbpr.Length -or
    [Text.Encoding]::ASCII.GetString($postCombatGbpr, 0, 4) -ne 'GBPR' -or
    [BitConverter]::ToUInt16($postCombatGbpr, 6) -ne 3) {
  throw 'GBBOOT Curse combat result did not preserve the native-created GBPR roster'
}
Assert-Gen1GbprMember $postCombatGbpr 0 0x80 'COAB_CLERIC'
Assert-Gen1GbprMember $postCombatGbpr 1 0x81 'COAB_FIGHTER'
Assert-Gen1GbprMember $postCombatGbpr 2 0x82 'COAB_MAGE'

Remove-Item (Join-Path $build '_GBWALL.BIN'),
  (Join-Path $build '_GBECL.BIN'),
  (Join-Path $build '_GBECL.TXT'),
  (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBCR.BIN'),
  (Join-Path $build '_GBRES.BIN'),
  (Join-Path $build '_GBRES.TXT'),
  (Join-Path $build '_GBSTEP.BIN'),
  (Join-Path $build 'GBCOABN.TXT') -Force -ErrorAction SilentlyContinue

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $naturalConf -Headless:$Headless
if (-not $p.WaitForExit(60000)) {
  Stop-Process -Id $p.Id -Force
  throw 'GBBOOT Curse post-combat exploration continuation timed out'
}

$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
if ($step.Length -ne 14 -or [Text.Encoding]::ASCII.GetString($step, 0, 4) -ne 'GBST' -or
    [BitConverter]::ToUInt16($step, 4) -ne 1 -or
    [BitConverter]::ToUInt16($step, 6) -ne 128 -or
    [BitConverter]::ToUInt16($step, 8) -ne 7 -or
    [BitConverter]::ToUInt16($step, 10) -ne 10 -or
    [BitConverter]::ToUInt16($step, 12) -ne 2) {
  throw 'GBBOOT Curse post-combat continuation did not step to the expected area-2 cell'
}

$session = [IO.File]::ReadAllBytes((Join-Path $build '_GBSESS.GBS'))
if ($session.Length -ne 16 -or [Text.Encoding]::ASCII.GetString($session, 0, 4) -ne 'GBSN' -or
    [BitConverter]::ToUInt16($session, 6) -ne 7 -or
    [BitConverter]::ToUInt16($session, 8) -ne 10 -or
    [BitConverter]::ToUInt16($session, 10) -ne 2) {
  throw 'GBBOOT Curse post-combat continuation did not persist the second exploration pose'
}

$continuedGbpr = [IO.File]::ReadAllBytes($gbprPath)
if ($continuedGbpr.Length -ne $postCombatGbpr.Length) {
  throw 'GBBOOT Curse post-combat continuation changed GBPR length'
}
for ($i = 0; $i -lt $postCombatGbpr.Length; $i++) {
  if ($continuedGbpr[$i] -ne $postCombatGbpr[$i]) {
    throw "GBBOOT Curse post-combat continuation changed GBPR byte $i"
  }
}

$dump = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
foreach ($needle in @(
  'GBEF v0009 flags=0000 status=0000 geo=FFFF chain=FFFF',
  'GBRS flags=0000 area=0001 pc=1930',
  '@07 MEM key=C04F value=0080',
  '@0C MEM key=7F7A value=0080',
  'GBSX count=0000'
)) {
  Assert-Contains $dump $needle 'GBBOOT Curse post-combat continuation dump'
}
Assert-GbsxNotTruncated $dump 'GBBOOT Curse post-combat continuation dump'

if ((Test-Path (Join-Path $build '_GBCOMB.OUT')) -or
    (Test-Path (Join-Path $build '_GBCOMB.RAW')) -or
    (Test-Path (Join-Path $build '_GBCR.BIN'))) {
  throw 'GBBOOT Curse post-combat continuation unexpectedly entered tactical combat'
}

Write-Output 'RESULT: GBBOOT Curse direct /B 50 and /B 51 combat, direct /B 53 noncombat menu, natural area-2 movement-to-combat, and post-combat exploration continuation native flows PASS'
