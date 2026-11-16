# Real CoK walker -> SearchLocation -> dialogue/combat -> resume flow.
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'Champions of Krynn'
# Mount a scratch mirror, never the retail release itself: `mount D "$game"`
# followed by `D:` makes the read-only GOG folder the DOS child's current drive,
# so its stray writes (CCFP.MOV, rewritten SAVE\CHRDATA*) land in the retail
# tree. CLAUDE.md: game-data folders are read-only source.
. (Join-Path $PSScriptRoot 'retail-stage.ps1')
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT CoK persistent flow (DOSBox.exe absent)'
  exit 0
}

foreach ($name in @(
  'KRYNN.CFG', 'ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX', 'MON1CHA.DAX',
  'SAVE\CHRDATA1.SAV', 'SAVE\CHRDATA2.SAV', 'SAVE\CHRDATA3.SAV',
  'SAVE\CHRDATA4.SAV', 'SAVE\CHRDATA5.SAV', 'SAVE\CHRDATA6.SAV'
)) {
  if (-not (Test-Path (Join-Path $game $name))) {
    Write-Output "SKIP: GBBOOT CoK persistent flow ($name absent)"
    exit 0
  }
}

$gameMount = New-RetailStage -Source $game
& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

$conf = Join-Path $build '_gbflow_test.conf'
@"
[sdl]
fullscreen=false
autolock=false
[autoexec]
@echo off
mount C "$build"
mount D "$gameMount"
D:
C:\GBBOOT /E /T 1
exit
"@ | Set-Content $conf -Encoding ASCII

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

function Run-Flow([string]$label) {
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
  if (-not $p.WaitForExit(25000)) {
    Stop-Process -Id $p.Id -Force
    throw "$label timed out"
  }
}

# (1,7,E) -> (2,7), descriptor 140. Its east wall bounds the host loop.
Set-Session 1 7 2
Remove-Item (Join-Path $build '_GBSTEP.BIN'),(Join-Path $build '_GBECL.TXT') -Force -ErrorAction SilentlyContinue
Run-Flow 'dialogue flow'
$session = [IO.File]::ReadAllBytes((Join-Path $build '_GBSESS.GBS'))
$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
$effect = Get-Content (Join-Path $build '_GBECL.TXT') -Raw
if ([BitConverter]::ToUInt16($session, 6) -ne 2 -or [BitConverter]::ToUInt16($session, 8) -ne 7 -or
    [BitConverter]::ToUInt16($step, 6) -ne 140 -or
    $effect -notlike '*PILES OF SKELETONS FILL THE ROOM*' -or
    $effect -notlike '*key=4C54 value=0001*') {
  throw 'Real SearchLocation dialogue/persistent-memory flow failed'
}

# (1,1,N) -> (1,0), descriptor 129. Its north wall bounds the resumed loop.
Set-Session 1 1 0
Remove-Item (Join-Path $build '_GBCOMB.TRC'),
  (Join-Path $build '_GBCOMB.OUT'),
  (Join-Path $build '_GBCOMB.RAW'),
  (Join-Path $build '_GBRES.TXT') -Force -ErrorAction SilentlyContinue
Run-Flow 'combat flow'
$session = [IO.File]::ReadAllBytes((Join-Path $build '_GBSESS.GBS'))
$step = [IO.File]::ReadAllBytes((Join-Path $build '_GBSTEP.BIN'))
$trace = Get-Content (Join-Path $build '_GBCOMB.TRC')
$outcome = (Get-Content (Join-Path $build '_GBCOMB.OUT') -Raw).Trim()
$resume = Get-Content (Join-Path $build '_GBRES.TXT') -Raw
$combatRaw = [IO.File]::ReadAllBytes((Join-Path $build '_GBCOMB.RAW'))
if ([BitConverter]::ToUInt16($session, 6) -ne 1 -or [BitConverter]::ToUInt16($session, 8) -ne 0 -or
    [BitConverter]::ToUInt16($step, 6) -ne 129 -or -not ($trace -match ' p5 ') -or
    $outcome -notin @('party','enemy','draw') -or $resume -notlike '*GBRS*' -or
    [BitConverter]::ToUInt16($combatRaw, 0) -ne 320 -or
    [BitConverter]::ToUInt16($combatRaw, 2) -ne 200) {
  throw 'Real SearchLocation combat/resume flow failed'
}
# Per-square route execution lets the party end this encounter before p5's
# Short Bow turn. ccparty-test retains the independent Short Bow/Arrows pin;
# this real flow keeps its observed Houpak hit-and-kill equipment assertion.
if (-not ($trace -contains '1 attack p3 e0 15 14 1 9 0 -')) {
  throw 'Real SearchLocation combat did not consume CoK Houpak STF equipment'
}

Write-Output "RESULT: GBBoot persistent dialogue + six-member combat/resume flow PASS ($outcome)"
