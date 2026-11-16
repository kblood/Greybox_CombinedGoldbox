# GBBOOT DQK ADD_NPC join: area 27 entry (/@ 34526 + TASSLEHOFF name seeds) makes
# CCECL record FX_HAVE_NPC; GBBOOT must call CCHOST /N so GBPR gains the NPC row.
# Party of 4 -> 5 rows. A revisit must not duplicate. The six-hero retail
# GBPR is at the retail cap (8 rows): CCHOST /N exits 2 and GBBOOT reports
# 'npc join deferred: party full (GBPR cap 8)' non-fatally, roster unchanged.
#
# GBBOOT's own final status is pinned explicitly, and it is NOT a clean boot: area 27
# yields no GEO map, so run_native_preview ends at gate 20 (accept_terminal_ecl_exit
# has no DQK route). Controls measured 2026-10-07: plain `/A 27` (no /@, no seeds) ends
# at the same gate 20 with NO join, while `/A 18` boots clean -- so gate 20 is a
# property of the area-27 ECL outcome, not of the /@ entry or of the join. When a DQK
# area-27 terminal route is accepted (or CCFLOW changes the route) this pin must flip.
#
# Every assertion below is a `throw` under $ErrorActionPreference='Stop'; the RESULT
# line is the last statement, reachable only if all of them clear.
param([switch]$Headless)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$source = Join-Path $root 'The Dark Queen of Krynn'
$dosbox = Join-Path $source 'DOSBOX\DOSBox.exe'
if (-not (Test-Path -LiteralPath $dosbox)) { Write-Output 'SKIP: GBBOOT DQK NPC join (DOSBox.exe absent)'; exit 0 }
$names = @('DQK.EXE','DISK2\MONCHA.GLB','DISK2\8X8DB.TLB','DISK2\8X8DC.TLB','DISK3\ECL.GLB','DISK3\GEO.GLB')
foreach ($n in $names + 'SAVGAMA.QSV') { if (-not (Test-Path (Join-Path $source $n))) { Write-Output "SKIP: GBBOOT DQK NPC join ($n absent)"; exit 0 } }
& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')

# Test-only knobs (engine-input mutation controls); unset in normal runs.
$npcName = if ($env:GBNPC_TEST_NAME) { $env:GBNPC_TEST_NAME } else { 'TASSLEHOFF' }
$joinEntry = if ($env:GBNPC_TEST_ENTRY) { $env:GBNPC_TEST_ENTRY } else { '34526' }
$heroNames = @('CLERA C','FIGHTA F','MAGEA M','THIEFA T')
if ($env:GBNPC_TEST_BADNAME) { $heroNames[0] = $env:GBNPC_TEST_BADNAME }
$seeds = ''
$i = 0
foreach ($c in $npcName.ToCharArray()) { $seeds += " /0 $(458 + $i) $([int]$c)"; $i++ }
$joinLine = "C:\GBBOOT /E /X /A 27 /@ $joinEntry$seeds"
if ($env:GBNPC_TEST_JOINLINE) { $joinLine = $env:GBNPC_TEST_JOINLINE }

$expectedGate = 20
$noticeApplied = 'CCHOST: npc joins applied'
$noticeFull = 'GBBOOT: npc join deferred: party full \(GBPR cap 8\)'

function New-Run([string]$Name, [bool]$WithQsv) {
  $run = Join-Path $build $Name
  if (Test-Path $run) { Remove-Item -Recurse -Force $run }
  $data = Join-Path $run 'data'
  New-Item -ItemType Directory -Force (Join-Path $data 'DISK2'), (Join-Path $data 'DISK3'), (Join-Path $data 'SAVE') | Out-Null
  foreach ($n in $names) { Copy-Item (Join-Path $source $n) (Join-Path $data $n) -Force }
  if ($WithQsv) { Copy-Item (Join-Path $source 'SAVGAMA.QSV') (Join-Path $data 'SAVGAMA.QSV') -Force }
  Get-ChildItem $build -Filter *.com | ForEach-Object { Copy-Item $_.FullName (Join-Path $run $_.Name.ToUpper()) -Force }
  [pscustomobject]@{ Run = $run; Data = $data }
}
function Invoke-Dos($r, [string]$Lines, [string]$Tag) {
  $conf = Join-Path $r.Run "_$Tag.conf"
  "[sdl]`nfullscreen=false`nautolock=false`n[autoexec]`n@echo off`nmount C `"$($r.Run)`"`nmount D `"$($r.Data)`"`nD:`n$Lines`nexit" | Set-Content $conf -Encoding ASCII
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
  if (-not $p.WaitForExit(120000)) { Stop-DosBoxSmoke -Process $p; throw "GBBOOT DQK NPC join $Tag timed out" }
}
function Read-Out($r, [string]$File) {
  $p = Join-Path $r.Run $File
  if (-not (Test-Path $p)) { throw "GBBOOT DQK NPC join: $File was not written" }
  Get-Content $p -Raw
}
function Read-Rows($r) {
  $g = [IO.File]::ReadAllBytes((Join-Path $r.Run '_GBPARTY.GBP'))
  $rows = @()
  for ($k = 0; $k -lt [BitConverter]::ToUInt16($g, 6); $k++) {
    $rec = 16 + $k * 410 + 1
    $rows += [pscustomobject]@{ Name = [Text.Encoding]::ASCII.GetString($g, $rec + 1, $g[$rec]); B300 = $g[$rec + 300]; B301 = $g[$rec + 301] }
  }
  , $rows
}
function Clear-Gb($r) { Get-ChildItem $r.Run -Filter '_GB*' -ErrorAction SilentlyContinue | ForEach-Object { [IO.File]::Delete($_.FullName) } }
function Assert-Gate([string]$Text, [string]$Label) {
  $m = [regex]::Matches($Text, 'GBBOOT: native preview failed; gate (\d+)')
  if ($m.Count -ne 1) { throw "GBBOOT DQK NPC join: $Label expected exactly one 'native preview failed; gate $expectedGate' line, found $($m.Count)" }
  if ([int]$m[0].Groups[1].Value -ne $expectedGate) { throw "GBBOOT DQK NPC join: $Label ended at gate $($m[0].Groups[1].Value), expected $expectedGate" }
}

# ---- Case A: four created heroes -> NPC joins (5 rows), revisit stable ----
$A = New-Run 'gbdqk-npc-join-test' $false
Clear-Gb $A
$rArgs = ($heroNames | ForEach-Object { "/R $_" }) -join ' '
Invoke-Dos $A "C:\GBBOOT /E /X /A 18 $rArgs > C:\N1.TXT`n$joinLine > C:\N2.TXT" 'join'
$n1 = Read-Out $A 'N1.TXT'
$n2 = Read-Out $A 'N2.TXT'
if ($n1 -match 'rejected') { throw "GBBOOT DQK NPC join: hero creation was rejected (N1.TXT): $(($n1 -split "`n" | Where-Object { $_ -match 'rejected' } | Select-Object -First 1).Trim())" }
if ($n1 -match 'failed; gate (\d+)') { throw "GBBOOT DQK NPC join: setup run failed at gate $($Matches[1]) (N1.TXT)" }
$rows = Read-Rows $A
if ($rows.Count -ne 5) { throw "GBBOOT DQK NPC join: expected 5 GBPR rows, got $($rows.Count)" }
if ($rows[4].Name -ne 'TASSLEHOFF' -or $rows[4].B300 -ne 0xB2 -or $rows[4].B301 -ne 115) { throw 'GBBOOT DQK NPC join: row 5 is not the TASSLEHOFF NPC (+300=B2, +301=115)' }
if ($n2 -notmatch $noticeApplied) { throw 'GBBOOT DQK NPC join: no CCHOST apply notice' }
Assert-Gate $n2 'join run (N2.TXT)'
if ($n2.IndexOf('npc joins applied') -gt $n2.IndexOf('native preview failed')) { throw 'GBBOOT DQK NPC join: apply notice came after the gate failure' }
Invoke-Dos $A "$joinLine > C:\N3.TXT" 'revisit'
$rows = Read-Rows $A
if ($rows.Count -ne 5) { throw "GBBOOT DQK NPC join: revisit changed the roster to $($rows.Count) rows (duplicate join)" }
$n3 = Read-Out $A 'N3.TXT'
Assert-Gate $n3 'revisit run (N3.TXT)'
if ($n3 -match 'npc joins applied') { throw 'GBBOOT DQK NPC join: revisit re-applied a join' }

# ---- Case B: six retail heroes + join -> 7th row applied (GBPR cap is 8) ----
$B = New-Run 'gbdqk-npc-join-six' $true
Clear-Gb $B
Invoke-Dos $B "C:\GBBOOT /E /X /A 18 > C:\S1.TXT" 'six1'
$s1 = Read-Out $B 'S1.TXT'
if ($s1 -match 'failed; gate (\d+)') { throw "GBBOOT DQK NPC join: six-hero setup failed at gate $($Matches[1]) (S1.TXT)" }
$before = [IO.File]::ReadAllBytes((Join-Path $B.Run '_GBPARTY.GBP'))
if ([BitConverter]::ToUInt16($before, 6) -ne 6) { throw "GBBOOT DQK NPC join: retail QSV did not give 6 GBPR rows, got $([BitConverter]::ToUInt16($before, 6))" }
# Cases C and D start from the same six-hero state; copy it before B joins.
function Copy-Run($r, [string]$Name) {
  $dst = Join-Path $build $Name
  if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
  Copy-Item $r.Run $dst -Recurse -Force
  [pscustomobject]@{ Run = $dst; Data = (Join-Path $dst 'data') }
}
# Append synthetic native rows (slots 0x80, 0x81, ...) cloned from row 0 so a six-hero
# roster becomes 7 or 8 rows without a second retail source.
function Add-NativeRows($r, [int]$Total) {
  $f = Join-Path $r.Run '_GBPARTY.GBP'
  $g = [IO.File]::ReadAllBytes($f)
  $n = [BitConverter]::ToUInt16($g, 6)
  $out = New-Object System.Collections.Generic.List[byte]
  $out.AddRange([byte[]]$g)
  for ($k = $n; $k -lt $Total; $k++) {
    $row = [byte[]]$g[16..(16 + 409)]
    $row[0] = 0x80 + ($k - 6)
    $nm = [Text.Encoding]::ASCII.GetBytes("EXTRA $k")
    $row[1] = $nm.Length
    for ($i = 0; $i -lt 15; $i++) { $row[2 + $i] = 0 }
    $nm.CopyTo($row, 2)
    $out.AddRange($row)
  }
  $arr = $out.ToArray()
  [BitConverter]::GetBytes([UInt16]$Total).CopyTo($arr, 6)
  [IO.File]::WriteAllBytes($f, $arr)
}
$C = Copy-Run $B 'gbdqk-npc-join-seven'
$D = Copy-Run $B 'gbdqk-npc-join-eight'
Add-NativeRows $C 7
Add-NativeRows $D 8
Invoke-Dos $B "$joinLine > C:\S2.TXT" 'six2'
$s2 = Read-Out $B 'S2.TXT'
if ($s2 -match $noticeFull) { throw 'GBBOOT DQK NPC join: six-hero run reported a party-full deferral (cap is 8)' }
if ($s2 -notmatch $noticeApplied) { throw 'GBBOOT DQK NPC join: six-hero run lacks the CCHOST apply notice (7th join)' }
Assert-Gate $s2 'six-hero run (S2.TXT)'
$rows = Read-Rows $B
if ($rows.Count -ne 7) { throw "GBBOOT DQK NPC join: expected 7 GBPR rows after the 7th join, got $($rows.Count)" }
if ($rows[6].Name -ne 'TASSLEHOFF' -or $rows[6].B300 -ne 0xB2 -or $rows[6].B301 -ne 115) { throw 'GBBOOT DQK NPC join: row 7 is not the TASSLEHOFF NPC (+300=B2, +301=115)' }
$g7 = [IO.File]::ReadAllBytes((Join-Path $B.Run '_GBPARTY.GBP'))
if ($g7.Length -ne 16 + 7 * 410) { throw "GBBOOT DQK NPC join: 7-row GBPR length $($g7.Length)" }
for ($i = 0; $i -lt 16 + 6 * 410; $i++) { if ($i -in 6, 7) { continue }; if ($g7[$i] -ne $before[$i]) { throw "GBBOOT DQK NPC join: existing GBPR byte $i changed by the 7th join" } }
Invoke-Dos $B "$joinLine > C:\S3.TXT" 'six3'
$rows = Read-Rows $B
if ($rows.Count -ne 7) { throw "GBBOOT DQK NPC join: revisit changed the 7-row roster to $($rows.Count) rows" }
if ((Read-Out $B 'S3.TXT') -match 'npc joins applied') { throw 'GBBOOT DQK NPC join: seven-row revisit re-applied a join' }

# ---- Case C: seven rows + join -> 8th row applied ----
Invoke-Dos $C "$joinLine > C:\E2.TXT" 'seven2'
$e2 = Read-Out $C 'E2.TXT'
if ($e2 -match $noticeFull) { throw 'GBBOOT DQK NPC join: seven-row run reported a party-full deferral' }
if ($e2 -notmatch $noticeApplied) { throw 'GBBOOT DQK NPC join: seven-row run lacks the CCHOST apply notice (8th join)' }
Assert-Gate $e2 'seven-row run (E2.TXT)'
$rows = Read-Rows $C
if ($rows.Count -ne 8) { throw "GBBOOT DQK NPC join: expected 8 GBPR rows after the 8th join, got $($rows.Count)" }
if ($rows[7].Name -ne 'TASSLEHOFF' -or $rows[7].B301 -ne 115) { throw 'GBBOOT DQK NPC join: row 8 is not the TASSLEHOFF NPC' }
if ((Get-Item (Join-Path $C.Run '_GBPARTY.GBP')).Length -ne 16 + 8 * 410) { throw 'GBBOOT DQK NPC join: 8-row GBPR has the wrong length' }

# ---- Case D: eight rows (retail cap) + join -> ninth deferred, non-fatal, byte-identical ----
$beforeD = [IO.File]::ReadAllBytes((Join-Path $D.Run '_GBPARTY.GBP'))
if ([BitConverter]::ToUInt16($beforeD, 6) -ne 8) { throw 'GBBOOT DQK NPC join: case D fixture is not 8 rows' }
Invoke-Dos $D "$joinLine > C:\D2.TXT" 'eight2'
$d2 = Read-Out $D 'D2.TXT'
if ($d2 -notmatch $noticeFull) { throw 'GBBOOT DQK NPC join: eight-row run lacks the party-full notice' }
if ($d2 -match 'npc joins applied') { throw 'GBBOOT DQK NPC join: eight-row run claims a 9th join was applied' }
Assert-Gate $d2 'eight-row run (D2.TXT)'
$afterD = [IO.File]::ReadAllBytes((Join-Path $D.Run '_GBPARTY.GBP'))
if ($afterD.Length -ne $beforeD.Length -or [BitConverter]::ToString($afterD) -ne [BitConverter]::ToString($beforeD)) { throw 'GBBOOT DQK NPC join: eight-row GBPR changed across the deferred 9th join' }
Write-Output 'RESULT: GBBOOT DQK ADD_NPC join (4 -> 5 rows, 6 -> 7, 7 -> 8, ninth deferred at the 8-row cap, revisit stable) PASS'
