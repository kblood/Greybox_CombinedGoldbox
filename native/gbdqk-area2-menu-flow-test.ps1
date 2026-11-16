# gbdqk-area2-menu-flow-test.ps1 -- DQK area-2 HLIB menu continuation, re-measured
# after the INPUT_NUMBER operand-order fix (NATIVE-TASKS items 25/18).
#
# Drives GBBOOT /E /X /! /A 2 on the retail DQK ECL.GLB area 2 (member 2) in a
# retail-staged mirror.  Answers reach CCMENU through the BIOS keyboard buffer
# (a tiny prelude COM stuffs the keystrokes via INT 16h AH=05h, the same
# technique ccmenu-test.ps1 uses): CCMENU reads with DOS AH=0Ah.  DOS `<`
# stdin redirection was tried first and hangs CCMENU (see native/README.md note).
#
# Case A: wall choice, party-surprise answer, then 750 -> expects [0x00C1]=750,
#         no GBHD reason 7, every GBSX chunk <= 64 records.
# Control B: answer 749 -> the 0x84D6 compare fails and the editor loop must
#         re-enter its 0x8485 prompt (the run does not exit the loop).
param(
  [string]$KeysA = '1,1,750',
  [string]$KeysB = '1,1,749',
  [switch]$Probe,
  [int]$TimeoutMs = 25000
)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$game = Join-Path $root 'The Dark Queen of Krynn'
$dosbox = Join-Path $game 'DOSBOX\DOSBox.exe'
. (Join-Path $native 'retail-stage.ps1')
. (Join-Path $native 'dosbox-smoke.ps1')

if (-not (Test-Path -LiteralPath $dosbox)) { Write-Output 'SKIP: DQK area-2 menu flow (DOSBox.exe absent)'; exit 0 }
foreach ($n in 'DQK.EXE', 'DISK3\ECL.GLB', 'DISK3\GEO.GLB', 'SAVGAMA.QSV') {
  if (-not (Test-Path (Join-Path $game $n))) { Write-Output "SKIP: DQK area-2 menu flow ($n absent)"; exit 0 }
}

& (Join-Path $native 'build.ps1') -Target engine | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'engine build failed' }
$gameMount = New-RetailStage -Source $game -Name 'dqk-area2-menu'

function Write-KeyStuffer([string]$Path, [string]$Lines) {
  $scan = @{ '0' = 0x0b; '1' = 0x02; '2' = 0x03; '3' = 0x04; '4' = 0x05; '5' = 0x06; '6' = 0x07; '7' = 0x08; '8' = 0x09; '9' = 0x0a }
  $b = [Collections.Generic.List[byte]]::new()
  foreach ($line in $Lines.Split(',')) {
    foreach ($d in $line.ToCharArray()) { $b.AddRange([byte[]]@(0xb9, [byte][char]$d, $scan[[string]$d], 0xb4, 0x05, 0xcd, 0x16)) }
    $b.AddRange([byte[]]@(0xb9, 0x0d, 0x1c, 0xb4, 0x05, 0xcd, 0x16))
  }
  $b.AddRange([byte[]]@(0xb8, 0, 0x4c, 0xcd, 0x21))
  [IO.File]::WriteAllBytes($Path, $b.ToArray())
}

function Invoke-Case([string]$Name, [string]$Keys, [int]$TimeoutMs) {
  $run = Join-Path $build "area2-$Name"
  if (Test-Path $run) { Remove-Item -Recurse -Force $run }
  New-Item -ItemType Directory -Path $run | Out-Null
  Get-ChildItem $build -Filter *.com | Copy-Item -Destination $run
  Write-KeyStuffer (Join-Path $run 'KEYS.COM') $Keys
  $conf = Join-Path $run 'case.conf'
  $drive = 'D:'
  @"
[sdl]
fullscreen=false
output=surface
autolock=false
[cpu]
cycles=fixed 50000
[autoexec]
@echo off
mount C "$run"
mount D "$gameMount"
$drive
C:\KEYS.COM
C:\GBBOOT /E /X /! /A 2 > C:\OUT.TXT
exit
"@ | Set-Content $conf -Encoding ASCII
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless
  $timedOut = $false
  if (-not $p.WaitForExit($TimeoutMs)) { $timedOut = $true; try { $p.Kill() } catch {} }
  # Dump the final pending/result records with CCEFX in a second DOSBox session
  # (GBBOOT leaves only the raw binaries behind when it is killed).
  $dconf = Join-Path $run 'dump.conf'
  @"
[sdl]
output=surface
[autoexec]
@echo off
mount C "$run"
C:
CCEFX C:\_GBECL.BIN C:\DECL.TXT
CCEFX C:\_GBRES.BIN C:\DRES.TXT
exit
"@ | Set-Content $dconf -Encoding ASCII
  $d = Start-DosBoxSmoke -Dosbox $dosbox -Conf $dconf -Headless
  if (-not $d.WaitForExit(30000)) { try { $d.Kill() } catch {} }
  $out = Join-Path $run 'OUT.TXT'
  [pscustomobject]@{
    Name = $Name; Run = $run; TimedOut = $timedOut; Seconds = [math]::Round($sw.Elapsed.TotalSeconds, 1)
    Out = $(if (Test-Path $out) { (Get-Content $out -Raw) -replace '[ \x00]{5,}', ' ' } else { '' })
  }
}

function Get-DumpText($Run) {
  $t = ''
  foreach ($f in 'DECL.TXT', 'DRES.TXT') { $p = Join-Path $Run $f; if (Test-Path $p) { $t += "`n== $f`n" + (Get-Content $p -Raw) } }
  $t
}

# Prompt order (tools/dqk_ecl_invocation_scan.py --area 2, slot 0): 0x855E wall
# HORIZONTAL_MENU -> 0x84A6 PARTY_SURPRISE -> 0x84D0 INPUT_NUMBER (compared with
# 750 at 0x84D6) -> STARTING RANGE INPUT_NUMBER (then 0x808A attack-location) on exit, or 0x8531 editor prompt
# (loop back to 0x8485) otherwise.  Keys: wall=1 (NORMAL), surprise=1 (Yes), N.
# The editor continues into more prompts after this point, and the BIOS key buffer
# holds only 15 keys, so each case ends BLOCKED on its next prompt: DOSBox is
# killed at $TimeoutMs and the pending record is read back.  A timeout is the
# expected end state here, not a failure; the assertions are on the pending record.

function Get-Gbsx([string]$Text) { [regex]::Matches($Text, 'GBSX count=([0-9A-F]{4})') | % { [Convert]::ToInt32($_.Groups[1].Value, 16) } }
function Get-Cell([string]$Text, [string]$Key) {
  $m = [regex]::Match($Text, "MEM key=$Key value=([0-9A-F]{4})")
  if ($m.Success) { [Convert]::ToInt32($m.Groups[1].Value, 16) } else { $null }
}

$a = Invoke-Case 'A750' $KeysA $TimeoutMs
$b = Invoke-Case 'B749' $KeysB $TimeoutMs
$dumpA = Get-DumpText $a.Run
$dumpB = Get-DumpText $b.Run
if ($Probe) {
  "A timedOut=$($a.TimedOut) sec=$($a.Seconds)"; $dumpA; "B timedOut=$($b.TimedOut) sec=$($b.Seconds)"; $dumpB
  return
}

foreach ($c in @(@($a, $dumpA, 'A(750)'), @($b, $dumpB, 'B(749)'))) {
  $d = $c[1]; $n = $c[2]
  if ($d -notmatch '== DECL.TXT' -or $d -notmatch '== DRES.TXT') { throw "$n produced no pending/result record pair (CCEFX dump missing)" }
  if ($d -notmatch 'SELECT THE COMBAT WALL TYPE' -or $d -notmatch 'HORIZONTAL_MENU') { throw "$n did not first yield the wall-selection menu" }
  if ($d -match 'GBHD') { throw "$n recorded a GBHD halt diagnostic (reason 7 = capacity truncation)" }
  foreach ($cnt in (Get-Gbsx $d)) { if ($cnt -gt 64) { throw "$n GBSX chunk of $cnt records exceeds the 64-record cap" } }
  if (@(Get-Gbsx $d).Count -lt 2) { throw "$n has fewer than two GBSX chunks to bound (instrument absent?)" }
  if ($d -notmatch 'GBEF v000F flags=0021 status=0002 geo=0002') { throw "$n resume record is not the area-2 LOAD_FILES-resumed pending state" }
}

# --- Case A: 750 satisfies the 0x84D6 compare and leaves the editor loop.
$resA = ($dumpA -split '== DRES.TXT')[1]
$c1 = Get-Cell $resA '00C1'
if ($c1 -ne 750) { throw "A: [0x00C1] expected 750, got $c1" }
if ($resA -notmatch 'GIVE ALL NUMBERS IN DECIMAL' -or $resA -notmatch 'STARTING RANGE') { throw 'A: route did not leave the editor loop for the post-compare STARTING RANGE prompt' }
if ($resA -notmatch 'INPUT_NUMBER ARGC=02 ARGS= 0001 00BF') { throw 'A: pending prompt is not the INPUT_NUMBER writing [0x00BF]' }
if ($resA -match 'VARIABLE PARTY\+') { throw 'A: 750 still re-entered the 0x8485 editor prompt' }

# --- Control B: 749 fails the compare; the editor prompt must come back.
$resB = ($dumpB -split '== DRES.TXT')[1]
$c1b = Get-Cell $resB '00C1'
if ($c1b -ne 749) { throw "B: [0x00C1] expected 749, got $c1b" }
if ($resB -notmatch 'VARIABLE PARTY\+') { throw 'B: 749 did not re-enter the 0x8485 editor prompt' }
if ($resB -notmatch 'INPUT_NUMBER ARGC=02 ARGS= 0003 00C3') { throw 'B: pending prompt is not the editor INPUT_NUMBER writing [0x00C3]' }
if ($resB -match 'STARTING RANGE') { throw 'B: 749 wrongly left the editor loop' }

$ca = (Get-Gbsx $dumpA) -join ','; $cb = (Get-Gbsx $dumpB) -join ','
Write-Output "MEASURED: A(750) [0x00C1]=$c1 GBSX chunks=$ca timedOut=$($a.TimedOut) ($($a.Seconds)s); B(749) [0x00C1]=$c1b GBSX chunks=$cb timedOut=$($b.TimedOut)"
Write-Output 'RESULT: DQK area-2 HLIB menu continuation (INPUT_NUMBER operand order) PASS'

