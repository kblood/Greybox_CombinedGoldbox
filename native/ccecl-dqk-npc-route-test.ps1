# ccecl-dqk-npc-route-test.ps1 -- DQK area 27 member 15 ADD_NPC recruitment route.
#
# Retail ECL area 27 reaches `37 81 CA 01 01 C0 00` (opcode 0x37, DQK.EXE
# 0x434A8: party-by-name lookup) at vaddr 0x86DE, then COMPARE [00C0],#255 /
# IF_NE / GOTO 0x8717, falling into ADD_NPC #115,#100 only when the result is
# 255.  CCECL must therefore (1) read the party names from /B, (2) read the NPC
# mark (bit 7 of CCHOST's GBPR body +300 extension byte) per row, and (3) write
# the matched index or 255 to [00C0].  The GBEF join table (+82 count, +84
# pairs) is then the producer for CCHOST /N, which this test chains.
#
# The name operand memstr[0x01CA] is never written by any ECL block (searched
# every ECL.GLB member), so the engine owns it at run time; its retail value is
# NOT measured here.  The test seeds the string with /X (name bytes at 458..)
# and says so rather than pretending to have derived it.
param(
  [switch]$Headless,
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  # Run an alternative CCECL image (used to prove the test fails on a mutant).
  [string]$CcEclPath = ''
)
$ErrorActionPreference = 'Stop'

$native = Join-Path $Root 'native'
$build = Join-Path $native 'build'
$run = Join-Path $build 'ccecl-dqk-npc-route-test'
$dosbox = Join-Path $Root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
$eclSrc = Join-Path $Root 'The Dark Queen of Krynn\DISK3\ECL.GLB'
$monSrc = Join-Path $Root 'The Dark Queen of Krynn\DISK2\MONCHA.GLB'
. (Join-Path $native 'dosbox-smoke.ps1')

if (-not (Test-Path $dosbox)) { Write-Output 'SKIP: CCECL DQK NPC route (retail DOSBox absent)'; return }
foreach ($f in @($eclSrc, $monSrc)) {
  if (-not (Test-Path $f)) { Write-Output "SKIP: CCECL DQK NPC route ($f absent)"; return }
}

& (Join-Path $native 'build.ps1') -Target ccecl
& (Join-Path $native 'build.ps1') -Target cchost
& (Join-Path $native 'build.ps1') -Target ccefx
if (-not $CcEclPath) { $CcEclPath = Join-Path $build 'ccecl.com' }

$resolvedNpcRun = [IO.Path]::GetFullPath($run)
$resolvedNpcBuild = [IO.Path]::GetFullPath($build).TrimEnd('\') + '\'
if (-not $resolvedNpcRun.StartsWith($resolvedNpcBuild, [StringComparison]::OrdinalIgnoreCase)) {
  throw "NPC test cleanup escaped its build directory: $resolvedNpcRun"
}
if (Test-Path -LiteralPath $resolvedNpcRun) { Remove-Item -LiteralPath $resolvedNpcRun -Recurse -Force }
New-Item -ItemType Directory -Force $run | Out-Null
Copy-Item $CcEclPath (Join-Path $run 'CCECL.COM') -Force
Copy-Item (Join-Path $build 'cchost.com') (Join-Path $run 'CCHOST.COM') -Force
Copy-Item (Join-Path $build 'ccefx.com') (Join-Path $run 'CCEFX.COM') -Force
Copy-Item $monSrc (Join-Path $run 'MONCHA.GLB') -Force
# One-character file names: the DOS command tail is 126 bytes and the ten name
# seeds alone take 100 of them.
Copy-Item $eclSrc (Join-Path $run 'E.GLB') -Force

function Set-U16([byte[]]$B, [int]$O, [int]$V) { [BitConverter]::GetBytes([UInt16]$V).CopyTo($B, $O) }
function Get-U16([byte[]]$B, [int]$O) { [int][BitConverter]::ToUInt16($B, $O) }

$ENTRY = 410
function New-Row([int]$Slot, [string]$Name, [int]$Mark = 0) {
  $r = New-Object byte[] $ENTRY
  $r[0] = $Slot
  $r[1] = $Name.Length
  [Text.Encoding]::ASCII.GetBytes($Name).CopyTo($r, 2)
  [Text.Encoding]::ASCII.GetBytes('GBD1').CopyTo($r, 217)
  Set-U16 $r 221 1
  Set-U16 $r 223 20
  Set-U16 $r 243 20
  if ($Mark) { $r[301] = $Mark; $r[302] = 115 }   # body +300 / +301
  return ,$r
}
function New-Roster([object[]]$Rows) {
  $h = New-Object byte[] 16
  [Text.Encoding]::ASCII.GetBytes('GBPR').CopyTo($h, 0)
  Set-U16 $h 4 2; Set-U16 $h 6 $Rows.Count; Set-U16 $h 8 $ENTRY; Set-U16 $h 10 1; Set-U16 $h 12 3; Set-U16 $h 14 1
  $ms = New-Object IO.MemoryStream
  $ms.Write($h, 0, 16)
  foreach ($r in $Rows) { [byte[]]$b = $r; $ms.Write($b, 0, $b.Length) }
  return ,$ms.ToArray()
}

function Add-Row([object[]]$Base, [byte[]]$Row) { $l = New-Object System.Collections.ArrayList; foreach ($b in $Base) { [void]$l.Add($b) }; [void]$l.Add($Row); return ,$l.ToArray() }
$heroes = @((New-Row 0x80 'HERO ONE'), (New-Row 0x81 'HERO TWO'))
# memstr[0x01CA] = "TASSLEHOFF" (the NUL terminator is the absent next cell).
$name = 'TASSLEHOFF'
$seeds = ''
for ($i = 0; $i -lt $name.Length; $i++) { $seeds += " /X$(458 + $i) $([int][char]$name[$i])" }
$vaddr = 34526   # 0x86DE: the retail LOAD_PIECES at area 27 member 15

# case id -> roster file name (one char) and effect file name (one char)
$cases = [ordered]@{
  # join: nobody named TASSLEHOFF with the mark in the party
  '1' = @{ Roster = 'a'; Rows = $heroes }
  # control: same name but WITHOUT the mark byte is not the retail match
  '2' = @{ Roster = 'b'; Rows = (Add-Row $heroes (New-Row 0x82 'TASSLEHOFF' 0)) }
  # control: marked member with a different name
  '3' = @{ Roster = 'c'; Rows = (Add-Row $heroes (New-Row 0x82 'ELEA' 0xB2)) }
  # found: marked + named -> index 2, no join
  '4' = @{ Roster = 'd'; Rows = (Add-Row $heroes (New-Row 0x82 'TASSLEHOFF' 0xB2)) }
  # found as first member: index 0 (distinguishes index from a count/flag)
  '5' = @{ Roster = 'e'; Rows = @((New-Row 0x80 'TASSLEHOFF' 0xB2), (New-Row 0x81 'HERO TWO')) }
  # mark byte with bit 7 clear (0x32): not an NPC mark
  '6' = @{ Roster = 'f'; Rows = (Add-Row $heroes (New-Row 0x82 'TASSLEHOFF' 0x32)) }
  # marked prefix of the name (needs the NUL-terminator check) and a marked
  # same-length near miss (needs the per-character compare)
  '8' = @{ Roster = 'h'; Rows = (Add-Row $heroes (New-Row 0x82 'TASS' 0xB2)) }
  '9' = @{ Roster = 'i'; Rows = (Add-Row $heroes (New-Row 0x82 'TASSLEHOFG' 0xB2)) }
}
$batch = New-Object System.Collections.Generic.List[string]
$tails = @{}
foreach ($k in $cases.Keys) {
  $c = $cases[$k]
  [IO.File]::WriteAllBytes((Join-Path $run $c.Roster), (New-Roster $c.Rows))
  $tail = " E.GLB 27 /E $k /@$vaddr /B$($c.Roster) /ID 3$seeds"
  if ($tail.Length -gt 126) { throw "case $k command tail is $($tail.Length) bytes (>126)" }
  $tails[$k] = $tail.Length
  $batch.Add("CCECL$tail > C:\$k.LOG")
  if ($k -eq '4') {
    # Immediately omit /B with the same count/string. An intervening program
    # could hide retained NPC marks by overwriting the .COM image's BSS.
    $unownedTail = " E.GLB 27 /E j /@$vaddr /N3 /ID 3$seeds"
    if ($unownedTail.Length -gt 126) { throw 'unowned NPC command tail exceeds 126 bytes' }
    $batch.Add("CCECL$unownedTail > C:\j.LOG")
  }
}
# Chain: case 1's effect through CCHOST /N, then a second CCECL on that roster.
$batch.Add('CCHOST /N C:\1 C:\MONCHA.GLB C:\a > C:\H1.LOG')
$batch.Add('copy C:\a C:\g > nul')
$batch.Add("CCECL E.GLB 27 /E 7 /@$vaddr /Bg /ID 3$seeds > C:\7.LOG")
$batch.Add('CCHOST /N C:\7 C:\MONCHA.GLB C:\g > C:\H2.LOG')
$batch.Add('CCEFX C:\4 C:\4.TXT')
$batch.Add('CCEFX C:\5 C:\5.TXT')
$batch.Add('CCEFX C:\1 C:\1.TXT')
$batch.Add('CCEFX C:\j C:\j.TXT')
$batch.Add('exit')
$batch | Set-Content -Path (Join-Path $run 'RUN.BAT') -Encoding ASCII
$conf = Join-Path $run 'run.conf'
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[autoexec]
mount C "$run"
C:
call C:\RUN.BAT
"@ | Set-Content -Path $conf -Encoding ASCII

$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(90000)) { Stop-DosBoxSmoke -Process $p; throw 'DOSBox did not exit while running the DQK NPC route' }

function Get-Effect([string]$Id) {
  $f = Join-Path $run $Id
  if (-not (Test-Path $f)) { throw "case $Id produced no effect file (CCECL did not run): $(Get-Content (Join-Path $run "$Id.LOG") -Raw -ErrorAction SilentlyContinue)" }
  [byte[]]$b = [IO.File]::ReadAllBytes($f)
  if ([Text.Encoding]::ASCII.GetString($b, 0, 4) -ne 'GBEF') { throw "case $Id effect is not GBEF" }
  return ,$b
}
function Assert-Joins([string]$Id, [int[][]]$Want) {
  $b = Get-Effect $Id
  $n = Get-U16 $b 82
  if ($n -ne $Want.Count) { throw "case ${Id}: GBEF NPC count $n, want $($Want.Count)" }
  for ($i = 0; $i -lt $n; $i++) {
    $a = Get-U16 $b (84 + 4 * $i); $m = Get-U16 $b (86 + 4 * $i)
    if ($a -ne $Want[$i][0] -or $m -ne $Want[$i][1]) { throw "case ${Id}: join $i is {$a,$m}, want {$($Want[$i] -join ',')}" }
  }
}
$join = @(,@(115, 100))
Assert-Joins '1' $join          # absent -> 255 -> ADD_NPC #115,#100
Assert-Joins '2' $join          # control: same name, no flag byte -> 255
Assert-Joins '3' $join          # control: flag but other name -> 255
Assert-Joins '8' $join
Assert-Joins '9' $join
Assert-Joins '6' $join          # control: bit 7 clear -> 255
Assert-Joins '4' @()            # present -> index, skip
Assert-Joins '5' @()
Assert-Joins 'j' $join          # previous roster's marked name is unowned
# The lookup itself must have run, not merely skipped: index in [00C0].
$t4 = Get-Content (Join-Path $run '4.TXT') -Raw
if ($t4 -notlike '*MEM key=00C0 value=0002*') { throw "case 4 did not store member index 2 in [00C0]: $t4" }
$t5 = Get-Content (Join-Path $run '5.TXT') -Raw
if ($t5 -notlike '*MEM key=00C0 value=0000*') { throw "case 5 did not store member index 0 in [00C0]: $t5" }
$t1 = Get-Content (Join-Path $run '1.TXT') -Raw
if ($t1 -notlike '*MEM key=00C0 value=00FF*') { throw "case 1 did not store 255 in [00C0]: $t1" }
$tj = Get-Content (Join-Path $run 'j.TXT') -Raw
if ($tj -notlike '*MEM key=00C0 value=00FF*') { throw "count-only NPC lookup reused the preceding roster: $tj" }

# Producer -> consumer chain.
$h1 = Get-Content (Join-Path $run 'H1.LOG') -Raw
if ($h1 -notlike '*applied*') { throw "CCHOST /N did not apply case 1's join: $h1" }
[byte[]]$g = [IO.File]::ReadAllBytes((Join-Path $run 'a'))
if ((Get-U16 $g 6) -ne 3 -or $g.Length -ne 16 + 3 * $ENTRY) { throw "roster after /N has wrong count/length ($((Get-U16 $g 6))/$($g.Length))" }
$o = 16 + 2 * $ENTRY
if ([Text.Encoding]::ASCII.GetString($g, $o + 2, $g[$o + 1]) -ne 'TASSLEHOFF') { throw 'joined row is not TASSLEHOFF' }
if ($g[$o + 301] -ne 0xB2 -or $g[$o + 302] -ne 115) { throw "joined row mark/id $($g[$o + 301])/$($g[$o + 302]) != 178/115" }
# Second run on the updated roster: lookup now finds the marked row -> no join.
Assert-Joins '7' @()
$h2 = Get-Content (Join-Path $run 'H2.LOG') -Raw
if ($h2 -notlike '*joins none*') { throw "second CCHOST /N should be a no-op: $h2" }
[byte[]]$g2 = [IO.File]::ReadAllBytes((Join-Path $run 'g'))
if ($g2.Length -ne $g.Length -or (Compare-Object $g $g2 -SyncWindow 0).Count) { throw 'second run changed the roster' }

Write-Output "PASS: DQK area-27 LOAD_PIECES lookup: absent/unmarked/other-name/clear-bit controls -> 255 -> join {115,100}; marked TASSLEHOFF -> index (2, 0) -> none; CCHOST /N added the marked row (+300=0xB2,+301=115); second run no join (tails $($tails.Values -join '/') bytes)"
Write-Output 'RESULT: CCECL DQK NPC route PASS'
