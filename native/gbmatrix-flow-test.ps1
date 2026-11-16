# GBBOOT Buck Rogers: Matrix Cubed real-data start-route flow.
#
# Matrix Cubed's real install enters the roster for the first time.  The route
# is the retail chain ECL1 block 16 -> NEWECL 19 (docs/engine/research/
# matrix-cubed-start-route.md): LOAD_FILES GEO 17, LOAD_PIECES wall set 5.
#
# WHAT THIS CLAIMS, and what it does not.  It claims "the retail start reaches
# its map and its wall-set operand through GBBOOT": the effect dump GBBOOT
# consumes carries LOAD_FILES 0011 and LOAD_PIECES set 5, GBBOOT took the
# effect-GEO path (FX_HAVE_FILES) rather than use_selected_geo_fallback, and the
# boot wall bridge is the effect-selected GEO 17.  It does NOT claim the game
# is playable (the GEO-cell -> [0x4BF2] dispatch is unresolved) and it does NOT
# claim wall set 5 is independently verified: tools/matrix_start_route.py
# decodes LOAD_PIECES with the same uncertain 0x4C two-operand frame CCECL
# uses, and the doc lists no DOSBox or visual confirmation.  In GBBOOT the
# LOAD_PIECES set is only stored in hlibsetcur (consumed by the HLIB wall-tail
# builder); the Matrix DAX wall path never renders by it, so set 5 is
# observable ONLY through the GBLP line, and that is what is pinned.
#
# Controls (each seen RED by inverting its comparison; see the 2026-10-07
# report):
#   payload  zero the GEO 17 member of the staged GEO1 -> boot wall must change
#            or vanish.
#   operand  LOAD_FILES 17 -> 18 in staged ECL1 block 19 -> GBLF 0012 and the
#            boot wall must equal CCGEO GEO 18 and differ from the base wall
#            (the effect path, not the preset mapid 17, selects the wall).
#   set      LOAD_PIECES 5 -> 3 at both sites -> GBLP sets 0003 (the set is
#            read from the bytes, not a constant), GBLF unchanged.
#   null     the same ECL1 without MATRIX.CFG (Buck zero-operand 0x4C frame)
#            must NOT produce GBLF 0011 / sets 0005; the identical CCECL
#            command WITH MATRIX.CFG must, so the instrument demonstrably ran.
param(
  [switch]$Headless,
  [ValidateSet('', 'geo0', 'oper', 'set', 'null')][string]$Mutate = ''   # invert ONE control's comparison (RED proof): exit 1 expected
)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT Matrix Cubed flow (DOSBox.exe absent)'
  exit 0
}

# The extraction is git-ignored, so a worktree may not carry it: also try the
# main checkout (same walk gbboot-test.ps1's real-start block uses).
$matrixSrc = $null
$cands = @((Join-Path $root 'matrixcubed_extracted\BuckRogers2\c\Matrix'))
if ($root -match '^(.*)\\\.claude\\worktrees\\[^\\]+$') { $cands += (Join-Path $Matches[1] 'matrixcubed_extracted\BuckRogers2\c\Matrix') }
$common = (& git -C $root rev-parse --git-common-dir 2>$null)
if ($common) {
  $mainRoot = Split-Path -Parent ([IO.Path]::GetFullPath($common, $root))
  $cands += (Join-Path $mainRoot 'matrixcubed_extracted\BuckRogers2\c\Matrix')
}
foreach ($c in $cands) {
  if ((Test-Path -LiteralPath (Join-Path $c 'ECL1.DAX')) -and (Test-Path -LiteralPath (Join-Path $c 'GEO1.DAX')) -and
      (Test-Path -LiteralPath (Join-Path $c 'START.EXE')) -and (Test-Path -LiteralPath (Join-Path $c 'MATRIX.CFG'))) { $matrixSrc = $c; break }
}
if (-not $matrixSrc) {
  Write-Output 'SKIP: GBBOOT Matrix Cubed flow (matrixcubed_extracted absent)'
  exit 0
}
foreach ($n in 'WALLDEF1.DAX', '8X8D1.DAX', 'MON0CHA.DAX') {
  if (-not (Test-Path -LiteralPath (Join-Path $matrixSrc $n))) {
    Write-Output "SKIP: GBBOOT Matrix Cubed flow ($n absent)"
    exit 0
  }
}

& (Join-Path $native 'build.ps1') -Target engine
. (Join-Path $native 'dosbox-smoke.ps1')
. (Join-Path $native 'retail-stage.ps1')

# ---- DAX helpers (signed-byte RLE; blocks re-appended, TOC repointed) ------
function Read-DaxToc([byte[]]$d) {
  $tl = [BitConverter]::ToUInt16($d, 0)
  $rows = @()
  for ($i = 0; $i -lt ($tl / 9); $i++) {
    $o = 2 + $i * 9
    $rows += [pscustomobject]@{ Index = $i; Id = $d[$o]; Off = [BitConverter]::ToUInt32($d, $o + 1); Raw = [BitConverter]::ToUInt16($d, $o + 5); Comp = [BitConverter]::ToUInt16($d, $o + 7); TocPos = $o }
  }
  , @($tl, $rows)
}
function Expand-Rle([byte[]]$b) {
  $out = New-Object System.Collections.Generic.List[byte]
  $p = 0
  while ($p -lt $b.Length) {
    $n = $b[$p]; $p++
    if ($n -lt 128) { for ($k = 0; $k -le $n; $k++) { $out.Add($b[$p + $k]) }; $p += $n + 1 }
    else { for ($k = 0; $k -lt (256 - $n); $k++) { $out.Add($b[$p]) }; $p++ }
  }
  , $out.ToArray()
}
function Compress-Literal([byte[]]$raw) {
  $out = New-Object System.Collections.Generic.List[byte]
  for ($p = 0; $p -lt $raw.Length; $p += 128) {
    $n = [Math]::Min(128, $raw.Length - $p)
    $out.Add([byte]($n - 1))
    for ($k = 0; $k -lt $n; $k++) { $out.Add($raw[$p + $k]) }
  }
  , $out.ToArray()
}
function Get-DaxBlock([string]$Path, [int]$Id) {
  $d = [IO.File]::ReadAllBytes($Path)
  $t = Read-DaxToc $d
  $r = $t[1] | Where-Object { $_.Id -eq $Id } | Select-Object -First 1
  if (-not $r) { throw "DAX block $Id not in $Path" }
  $base = 2 + $t[0]
  $comp = New-Object byte[] $r.Comp
  [Array]::Copy($d, $base + $r.Off, $comp, 0, $r.Comp)
  $raw = Expand-Rle $comp
  if ($raw.Length -ne $r.Raw) { throw "DAX block $Id in $Path expanded to $($raw.Length), TOC says $($r.Raw)" }
  , $raw
}
function Set-DaxBlock([string]$Path, [int]$Id, [byte[]]$NewRaw) {
  $d = [IO.File]::ReadAllBytes($Path)
  $t = Read-DaxToc $d
  $r = $t[1] | Where-Object { $_.Id -eq $Id } | Select-Object -First 1
  if (-not $r) { throw "DAX block $Id not in $Path" }
  if ($NewRaw.Length -ne $r.Raw) { throw 'replacement block must keep its raw size' }
  $comp = Compress-Literal $NewRaw
  if ($comp.Length -gt 65535) { throw 'replacement block too large' }
  $base = 2 + $t[0]
  $newOff = $d.Length - $base
  $out = New-Object byte[] ($d.Length + $comp.Length)
  [Array]::Copy($d, $out, $d.Length)
  [Array]::Copy($comp, 0, $out, $d.Length, $comp.Length)
  [BitConverter]::GetBytes([uint32]$newOff).CopyTo($out, $r.TocPos + 1)
  [BitConverter]::GetBytes([uint16]$comp.Length).CopyTo($out, $r.TocPos + 7)
  [IO.File]::WriteAllBytes($Path, $out)
  # self-check: the repointed block must expand to exactly what we wrote
  $chk = Get-DaxBlock $Path $Id
  if (-not [Linq.Enumerable]::SequenceEqual([byte[]]$chk, [byte[]]$NewRaw)) { throw "Set-DaxBlock round trip failed for block $Id" }
}

$run = Join-Path $build 'gbmatrix-flow-test'
if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null

# ---- stages (own names + -Fresh: mutated copies must never alias) ----------
$stBase = New-RetailStage -Source $matrixSrc -Name 'matrix-flow-base' -Fresh
$stGeo0 = New-RetailStage -Source $matrixSrc -Name 'matrix-flow-geo0' -Fresh
$stOp = New-RetailStage -Source $matrixSrc -Name 'matrix-flow-operand' -Fresh
$stSet = New-RetailStage -Source $matrixSrc -Name 'matrix-flow-set' -Fresh
$stNoCfg = New-RetailStage -Source $matrixSrc -Name 'matrix-flow-nocfg' -Fresh
Remove-Item (Join-Path $stNoCfg 'MATRIX.CFG') -Force

# GEO 17 payload control: zero the selected member.
$geo17 = Get-DaxBlock (Join-Path $stGeo0 'GEO1.DAX') 17
if (($geo17 | Where-Object { $_ -ne 0 }).Count -eq 0) { throw 'precondition: staged GEO 17 is already all zero' }
Set-DaxBlock (Join-Path $stGeo0 'GEO1.DAX') 17 (New-Object byte[] $geo17.Length)

# ECL block 19 operand controls.  The two LOAD_FILES / LOAD_PIECES sites are
# located by their instruction bytes (21 00 11 00 / 37 00 05 00), not by a
# hard-coded offset, and the expected count is asserted.
function Find-All([byte[]]$h, [byte[]]$n) {
  $hits = @()
  for ($i = 0; $i -le $h.Length - $n.Length; $i++) {
    $ok = $true
    for ($j = 0; $j -lt $n.Length; $j++) { if ($h[$i + $j] -ne $n[$j]) { $ok = $false; break } }
    if ($ok) { $hits += $i }
  }
  , $hits
}
$ecl19 = Get-DaxBlock (Join-Path $stBase 'ECL1.DAX') 19
$lfSites = Find-All $ecl19 ([byte[]](0x21, 0x00, 0x11, 0x00))
$lpSites = Find-All $ecl19 ([byte[]](0x37, 0x00, 0x05, 0x00))
if ($lfSites.Count -ne 2 -or $lpSites.Count -ne 2) {
  throw "precondition: block 19 has $($lfSites.Count) LOAD_FILES(17) and $($lpSites.Count) LOAD_PIECES(5) sites, expected 2 and 2"
}
$opBytes = [byte[]]$ecl19.Clone()
foreach ($s in $lfSites) { $opBytes[$s + 2] = 0x12 }
Set-DaxBlock (Join-Path $stOp 'ECL1.DAX') 19 $opBytes
$setBytes = [byte[]]$ecl19.Clone()
foreach ($s in $lpSites) { $setBytes[$s + 2] = 0x03 }
Set-DaxBlock (Join-Path $stSet 'ECL1.DAX') 19 $setBytes

# ---- one DOSBox session per case ------------------------------------------
$outputs = @('_GBWALL.BIN', '_GBECL.TXT', '_GBECL.BIN', '_GBPARTY.GBP', '_GBSEED.BIN', '_GBVIEW.RAW', '_GBWSET.GBW')
function Invoke-Case([string]$Tag, [string]$Mount, [string[]]$Extra = @()) {
  foreach ($o in $outputs) { Remove-Item (Join-Path $build $o) -Force -ErrorAction SilentlyContinue }
  $txt = Join-Path $build "MX_$Tag.TXT"
  Remove-Item $txt -Force -ErrorAction SilentlyContinue
  $conf = Join-Path $run "_$Tag.conf"
  $lines = @('[sdl]', 'fullscreen=false', 'output=surface', 'autolock=false', '[cpu]', 'cycles=fixed 50000', '[autoexec]',
    '@echo off', "mount C `"$build`"", "mount D `"$Mount`"", 'D:',
    "C:\GBBOOT /E /X > C:\MX_$Tag.TXT",
    "copy C:\_GBWALL.BIN C:\MX_$Tag.WAL > nul",
    "copy C:\_GBECL.TXT C:\MX_$Tag.EFX > nul") + $Extra + @('exit')
  $lines -join "`r`n" | Set-Content $conf -Encoding ASCII
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
  if (-not $p.WaitForExit(120000)) { Stop-DosBoxSmoke -Process $p; throw "GBBOOT Matrix case $Tag timed out" }
  $r = [ordered]@{ Tag = $Tag }
  $r.Plan = if (Test-Path $txt) { Get-Content $txt -Raw } else { '' }
  foreach ($k in 'WAL', 'EFX') {
    $f = Join-Path $build "MX_$Tag.$k"
    $r[$k] = if (Test-Path $f) { [IO.File]::ReadAllBytes($f) } else { $null }
    Remove-Item $f -Force -ErrorAction SilentlyContinue
  }
  Remove-Item $txt -Force -ErrorAction SilentlyContinue
  [pscustomobject]$r
}
function Take-Extra([string]$name) {
  $f = Join-Path $build $name
  $v = if (Test-Path $f) { [IO.File]::ReadAllBytes($f) } else { $null }
  Remove-Item $f -Force -ErrorAction SilentlyContinue
  , $v
}
function Same($a, $b) { $null -ne $a -and $null -ne $b -and [Linq.Enumerable]::SequenceEqual([byte[]]$a, [byte[]]$b) }
function Text($b) { if ($null -eq $b) { '' } else { [Text.Encoding]::ASCII.GetString($b) } }
# Control comparisons invert under -Mutate so each can be seen RED.
function Expect-Diff([string]$Ctl, $a, $b) { if ($Mutate -eq $Ctl) { Same $a $b } else { -not (Same $a $b) } }

# base: the route, plus CCGEO GEO 17/18 controls and the direct CCECL positive twin
$base = Invoke-Case 'base' $stBase @(
  'C:\CCGEO /B GEO1.DAX 17 C:\GBMX_G17.BIN > nul',
  'C:\CCGEO /B GEO1.DAX 18 C:\GBMX_G18.BIN > nul',
  'C:\CCECL D:\ECL1.DAX 19 /T /E C:\GBMX_W.BIN > nul',
  'C:\CCEFX C:\GBMX_W.BIN C:\GBMX_W.TXT > nul')
$g17 = Take-Extra 'GBMX_G17.BIN'
$g18 = Take-Extra 'GBMX_G18.BIN'
$posTwin = Text (Take-Extra 'GBMX_W.TXT')
Remove-Item (Join-Path $build 'GBMX_W.BIN') -Force -ErrorAction SilentlyContinue

# ---- base assertions ------------------------------------------------------
if ($base.Plan -notmatch 'game:\s+Buck Rogers: Matrix Cubed') { throw "base: install was not named Matrix Cubed: $($base.Plan)" }
if ($base.Plan -notmatch 'CCECL ECL1\.DAX entry 16 -> CCGEO /B GEO1\.DAX') { throw "base: plan is not ECL1 entry 16: $($base.Plan)" }
if ($null -eq $base.EFX) { throw 'base: GBBOOT produced no effect dump' }
$efx = Text $base.EFX
if ($efx -notmatch 'GBEF v0009 flags=([0-9A-F]{4})') { throw 'base: effect dump header missing' }
$flags = [Convert]::ToInt32($Matches[1], 16)
# FX_HAVE_FILES (1) and FX_HAVE_PIECES (2) are what read_effect_geo requires to
# take the effect path; when either is clear GBBOOT falls to use_selected_geo_fallback.
if (($flags -band 3) -ne 3) { throw "base: effect flags $('{0:X4}' -f $flags) lack FILES|PIECES, GBBOOT would have used use_selected_geo_fallback" }
if ($efx -notmatch 'area=0013') { throw 'base: NEWECL 19 (area=0013) not reached' }
if ($efx -notmatch '(?m)^GBLF operands=0011(\s|$)') { throw "base: GBLF is not exactly operands=0011: $efx" }
$lp = [regex]::Match($efx, '(?m)^GBLP raw=([0-9A-F]{4}) ([0-9A-F]{4}) ([0-9A-F]{4}) sets=([0-9A-F]{4}) ([0-9A-F]{4}) ([0-9A-F]{4})')
if (-not $lp.Success) { throw "base: no parsable GBLP line: $efx" }
if ($lp.Groups[4].Value -ne '0005') { throw "base: GBLP first set is $($lp.Groups[4].Value), expected 0005" }
if ($null -eq $g17 -or (Text $g17).Substring(0, 4) -ne 'WGRD') { throw 'base: CCGEO GEO 17 control is not a WGRD' }
if ($null -eq $g18 -or (Text $g18).Substring(0, 4) -ne 'WGRD') { throw 'base: CCGEO GEO 18 control is not a WGRD' }
if (-not (Same $g17 $base.WAL)) { throw 'base: boot wall bridge is not the GEO1 block 17 wall' }
if (Same $g17 $g18) { throw 'base: GEO 17 and GEO 18 walls are indistinguishable, so the operand control cannot discriminate' }
# instrument-ran twin: direct CCECL with MATRIX.CFG shows the same GBLF/GBLP
if ($posTwin -notmatch 'GBLF operands=0011' -or $posTwin -notmatch 'GBLP raw=[^\r\n]* sets=0005') { throw "base: direct CCECL positive twin lacks GBLF 0011 / sets 0005: $posTwin" }

# ---- payload control: zeroed GEO 17 -----------------------------------------
$geo0 = Invoke-Case 'geo0' $stGeo0
if (-not (Expect-Diff 'geo0' $base.WAL $geo0.WAL)) { throw 'payload control: zeroing the staged GEO 17 member did not change the boot wall bridge' }

# ---- operand control: LOAD_FILES 17 -> 18 -----------------------------------
$op = Invoke-Case 'oper' $stOp
if ($null -eq $op.EFX -or (Text $op.EFX) -notmatch '(?m)^GBLF operands=0012(\s|$)') { throw 'operand control: effect dump lacks GBLF operands=0012' }
if (-not (Expect-Diff 'oper' $base.WAL $op.WAL)) { throw 'operand control: wall did not change with the LOAD_FILES operand (preset mapid would be hiding the effect path)' }
if (-not (Same $g18 $op.WAL) -and $Mutate -ne 'oper') { throw 'operand control: wall is not GEO1 block 18' }

# ---- set control: LOAD_PIECES 5 -> 3 ---------------------------------------
$st = Invoke-Case 'set' $stSet
$stEfx = Text $st.EFX
$lp3 = [regex]::Match($stEfx, '(?m)^GBLP raw=[0-9A-F ]{14} sets=([0-9A-F]{4})')
if (-not $lp3.Success) { throw 'set control: no GBLP line' }
$wantSet = if ($Mutate -eq 'set') { '0005' } else { '0003' }
if ($lp3.Groups[1].Value -ne $wantSet) { throw "set control: GBLP first set is $($lp3.Groups[1].Value), expected $wantSet (the set is not read from the bytes)" }
if ($stEfx -notmatch '(?m)^GBLF operands=0011(\s|$)') { throw 'set control: GBLF changed when only LOAD_PIECES was edited' }
if (-not (Same $base.WAL $st.WAL)) { throw 'set control: boot wall changed with the wall set; the Matrix DAX path is believed not to render by it, so this README claim needs revisiting' }

# ---- null: Buck zero-operand 0x4C frame (no MATRIX.CFG) -------------------
foreach ($o in '_GBNULL.BIN', '_GBNULL.TXT') { Remove-Item (Join-Path $build $o) -Force -ErrorAction SilentlyContinue }
$nconf = Join-Path $run '_null.conf'
@('[sdl]', 'fullscreen=false', 'output=surface', 'autolock=false', '[cpu]', 'cycles=fixed 50000', '[autoexec]', '@echo off',
  "mount C `"$build`"", "mount D `"$stNoCfg`"", 'D:',
  'C:\CCECL D:\ECL1.DAX 19 /T /E C:\_GBNULL.BIN > nul', 'C:\CCEFX C:\_GBNULL.BIN C:\_GBNULL.TXT > nul', 'exit') -join "`r`n" | Set-Content $nconf -Encoding ASCII
$np = Start-DosBoxSmoke -Dosbox $dosbox -Conf $nconf -Headless:$Headless
if (-not $np.WaitForExit(90000)) { Stop-DosBoxSmoke -Process $np; throw 'null case timed out' }
$nullTxt = Text (Take-Extra '_GBNULL.TXT')
Remove-Item (Join-Path $build '_GBNULL.BIN') -Force -ErrorAction SilentlyContinue
if ($nullTxt -notmatch 'GBEF v') { throw 'null: no GBEF record (instrument absent)' }
$nullHas = ($nullTxt -match 'GBLF operands=0011') -or ($nullTxt -match 'GBLP raw=[^\r\n]* sets=0005')
if ($Mutate -eq 'null') { $nullHas = -not $nullHas }
if ($nullHas) { throw "null: the zero-operand 0x4C frame also yields GEO 0011 / set 0005, so the Matrix framing is not what produces them: $nullTxt" }

foreach ($o in $outputs) { Remove-Item (Join-Path $build $o) -Force -ErrorAction SilentlyContinue }
if ($Mutate) { throw "-Mutate ${Mutate}: the inverted control did not fail" }
Write-Output 'RESULT: GBBOOT Matrix Cubed real start route (ECL1 16 -> area 0013, effect-GEO 0011 not fallback, LOAD_PIECES set 0005; payload/operand/set/null controls) PASS'
