# GBBOOT Gateway to the Savage Frontier (DOS) retail start route (T4, round 10).
#
# Gateway (DOS) ships ECL2..6/GEO2..6 and no ECL1/GEO1, so it could never pass GBBOOT's ECL1+GEO1 check and fell to a raw GEO2 map-0 preview. T4 starts ECL2 block 1 (LOAD_FILES -> GEO2 block 1) when ECL2 and GEO2 exist and ECL1 does not. Gateway has no marker in select_operand_dialect, so CCECL uses base frames; the standalone CCECL run of ECL2#1 completes with a GBLF/GBLP and no desync.
#
# WHAT THIS CLAIMS, and what it does not.  It claims "GBBOOT boots the retail
# install into its real first map": the plan line names ECL2.DAX block 1 (not
# the shared old smoke start), the effect dump GBBOOT consumes carries
# LOAD_FILES 0x01 (FX_HAVE_FILES, so the wall comes from read_effect_geo and
# never from a preset), and the boot wall bridge (_GBWALL.BIN) is byte-identical
# to the CCGEO decode of that GEO block.  It does NOT claim the game is playable
# past the first map, nor that CCFP draws original wall art (map entry only);
# PICTURE ids in the start script may report "CCGB: block index out of range"
# from the scene bridge, which is outside this claim.
#
# Controls (each seen RED by inverting its comparison with -Mutate, and the
# route assertion seen RED against the pre-T4 GBBOOT build):
#   route    plan must name "ECL2.DAX entry 1"; inverted under -Mutate entry.
#   payload  zero the GEO 1 member of the staged GEO2.DAX -> boot wall must
#            change or vanish.
#   operand  LOAD_FILES 01 -> 0x02 in the staged start block -> GBLF operand
#            0022 and the wall must equal CCGEO GEO 2 and differ from the base
#            wall (the effect path, not the preset mapid, selects the wall).
#   marker  remove GAME.CFG from a stage -> the install is no longer recognised as Gateway and the plan must not start ECL2 block 1.
#           (Adding an ECL1.DAX was tried first and is NOT a valid control: ECL1+ECL2+GEO2 reroutes to the Curse data profile, whose own start is also ECL2 block 1.)
#   twin     the identical CCECL start block run directly must show the same
#            GBLF, so the instrument demonstrably ran.
param(
  [switch]$Headless,
  [string]$GogPath = 'C:\Program Files (x86)\GOG Galaxy\Games',
  [ValidateSet('', 'entry', 'geo0', 'oper', 'ctl')][string]$Mutate = ''   # invert ONE control's comparison (RED proof): exit 1 expected
)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
$mainRoot = $null
if ($root -match '^(.*)\\\.claude\\worktrees\\[^\\]+$') { $mainRoot = $Matches[1] }
if (-not (Test-Path -LiteralPath $dosbox) -and $mainRoot) { $dosbox = Join-Path $mainRoot 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe' }

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT Gateway to the Savage Frontier (DOS) flow (DOSBox.exe absent)'
  exit 0
}
$src = Join-Path $GogPath 'Gateway to the Savage Frontier'
foreach ($n in @('ECL2.DAX', 'GEO2.DAX', 'GAME.CFG', 'ZOUNDS.DAX', 'GAME.EXE')) {
  if (-not (Test-Path -LiteralPath (Join-Path $src $n))) {
    Write-Output "SKIP: GBBOOT Gateway to the Savage Frontier (DOS) flow ($n absent from the GOG install)"
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
  $chk = Get-DaxBlock $Path $Id
  if (-not [Linq.Enumerable]::SequenceEqual([byte[]]$chk, [byte[]]$NewRaw)) { throw "Set-DaxBlock round trip failed for block $Id" }
}
function Find-All([byte[]]$h, [byte[]]$n) {
  $hits = @()
  for ($i = 0; $i -le $h.Length - $n.Length; $i++) {
    $ok = $true
    for ($j = 0; $j -lt $n.Length; $j++) { if ($h[$i + $j] -ne $n[$j]) { $ok = $false; break } }
    if ($ok) { $hits += $i }
  }
  , $hits
}

$run = Join-Path $build 'gwd-flow-test'
if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null

# ---- stages (own names + -Fresh: mutated copies must never alias) ----------
$stBase = New-RetailStage -Source $src -Name 'gwd-flow-base' -Fresh
$stGeo0 = New-RetailStage -Source $src -Name 'gwd-flow-geo0' -Fresh
$stOp = New-RetailStage -Source $src -Name 'gwd-flow-operand' -Fresh
$stCtl = New-RetailStage -Source $src -Name 'gwd-flow-ctl' -Fresh
Remove-Item (Join-Path $stCtl 'GAME.CFG') -Force

$geoBlk = Get-DaxBlock (Join-Path $stGeo0 'GEO2.DAX') 1
if (($geoBlk | Where-Object { $_ -ne 0 }).Count -eq 0) { throw 'precondition: staged GEO 1 is already all zero' }
Set-DaxBlock (Join-Path $stGeo0 'GEO2.DAX') 1 (New-Object byte[] $geoBlk.Length)

# Operand control: the LOAD_FILES site is located by its instruction bytes
# (21 00 01 00), not by a hard-coded offset, and the hit count is asserted.
$startBlk = Get-DaxBlock (Join-Path $stBase 'ECL2.DAX') 1
$lfSites = Find-All $startBlk ([byte[]](0x21, 0x00, 0x01, 0x00))
if ($lfSites.Count -lt 1) { throw "precondition: block 1 has no LOAD_FILES(1) site (21 00 01 00)" }
$opBytes = [byte[]]$startBlk.Clone()
foreach ($s in $lfSites) { $opBytes[$s + 2] = 0x02 }
Set-DaxBlock (Join-Path $stOp 'ECL2.DAX') 1 $opBytes

# ---- one DOSBox session per case ------------------------------------------
$outputs = @('_GBWALL.BIN', '_GBECL.TXT', '_GBECL.BIN', '_GBPARTY.GBP', '_GBSEED.BIN', '_GBVIEW.RAW', '_GBWSET.GBW')
function Invoke-Case([string]$Tag, [string]$Mount, [string[]]$Extra = @()) {
  foreach ($o in $outputs) { Remove-Item (Join-Path $build $o) -Force -ErrorAction SilentlyContinue }
  $txt = Join-Path $build "T4_$Tag.TXT"
  Remove-Item $txt -Force -ErrorAction SilentlyContinue
  $conf = Join-Path $run "_$Tag.conf"
  $lines = @('[sdl]', 'fullscreen=false', 'output=surface', 'autolock=false', '[cpu]', 'cycles=fixed 50000', '[autoexec]',
    '@echo off', "mount C `"$build`"", "mount D `"$Mount`"", 'D:',
    "C:\GBBOOT /E /X > C:\T4_$Tag.TXT",
    "copy C:\_GBWALL.BIN C:\T4_$Tag.WAL > nul",
    "copy C:\_GBECL.TXT C:\T4_$Tag.EFX > nul") + $Extra + @('exit')
  $lines -join "`r`n" | Set-Content $conf -Encoding ASCII
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
  if (-not $p.WaitForExit(120000)) { Stop-DosBoxSmoke -Process $p; throw "GBBOOT Gateway to the Savage Frontier (DOS) case $Tag timed out" }
  $r = [ordered]@{ Tag = $Tag }
  $r.Plan = if (Test-Path $txt) { Get-Content $txt -Raw } else { '' }
  foreach ($k in 'WAL', 'EFX') {
    $f = Join-Path $build "T4_$Tag.$k"
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
function Expect-Diff([string]$Ctl, $a, $b) { if ($Mutate -eq $Ctl) { Same $a $b } else { -not (Same $a $b) } }

# base: the route, plus CCGEO controls and the direct CCECL twin
$base = Invoke-Case 'base' $stBase @(
  'C:\CCGEO /B GEO2.DAX 1 C:\T4G_A.BIN > nul',
  'C:\CCGEO /B GEO2.DAX 2 C:\T4G_B.BIN > nul',
  'C:\CCECL D:\ECL2.DAX 1 /T /E C:\T4G_W.BIN > nul',
  'C:\CCEFX C:\T4G_W.BIN C:\T4G_W.TXT > nul')
$gStart = Take-Extra 'T4G_A.BIN'
$g34 = Take-Extra 'T4G_B.BIN'
$posTwin = Text (Take-Extra 'T4G_W.TXT')
Remove-Item (Join-Path $build 'T4G_W.BIN') -Force -ErrorAction SilentlyContinue

# ---- base assertions ------------------------------------------------------
if ($base.Plan -notmatch 'game:\s+Gateway to the Savage Frontier') { throw "base: install was not named Gateway to the Savage Frontier: $($base.Plan)" }
$routeOk = $base.Plan -match 'CCECL ECL2.DAX entry 1 -> CCGEO /B GEO2.DAX'
if ($Mutate -eq 'entry') { $routeOk = -not $routeOk }
if (-not $routeOk) { throw "route: plan does not start ECL2.DAX entry 1 (old behaviour starts the old smoke start): $($base.Plan)" }
if ($null -eq $base.EFX) { throw 'base: GBBOOT produced no effect dump' }
$efx = Text $base.EFX
if ($efx -notmatch 'GBEF v0009 flags=([0-9A-F]{4})') { throw 'base: effect dump header missing' }
$flags = [Convert]::ToInt32($Matches[1], 16)
if (($flags -band 1) -ne 1) { throw "base: effect flags $('{0:X4}' -f $flags) lack FX_HAVE_FILES, the wall would not come from the effect" }
if ($efx -notmatch '(?m)^GBLF operands=0001(\s|$)') { throw "base: GBLF is not operands=0001: $efx" }
if ($null -eq $gStart -or (Text $gStart).Substring(0, 4) -ne 'WGRD') { throw 'base: CCGEO start-GEO control is not a WGRD' }
if ($null -eq $g34 -or (Text $g34).Substring(0, 4) -ne 'WGRD') { throw 'base: CCGEO GEO 2 control is not a WGRD' }
if (-not (Same $gStart $base.WAL)) { throw 'base: boot wall bridge is not the CCGEO decode of the GEO named by GBLF' }
if (Same $gStart $g34) { throw 'base: start GEO and GEO 2 walls are indistinguishable, so the operand control cannot discriminate' }
if ($posTwin -notmatch 'GBLF operands=0001') { throw "base: direct CCECL twin lacks GBLF 0001: $posTwin" }

# ---- payload control: zeroed GEO ------------------------------------------
$geo0 = Invoke-Case 'geo0' $stGeo0
if (-not (Expect-Diff 'geo0' $base.WAL $geo0.WAL)) { throw 'payload control: zeroing the staged GEO member did not change the boot wall bridge' }

# ---- operand control: LOAD_FILES -> 0x02 ----------------------------------
$op = Invoke-Case 'oper' $stOp @('C:\CCGEO /B GEO2.DAX 2 C:\T4G_C.BIN > nul')
$g34b = Take-Extra 'T4G_C.BIN'
if ($null -eq $op.EFX -or (Text $op.EFX) -notmatch '(?m)^GBLF operands=0002(\s|$)') { throw 'operand control: effect dump lacks GBLF operands=0002' }
if (-not (Expect-Diff 'oper' $base.WAL $op.WAL)) { throw 'operand control: wall did not change with the LOAD_FILES operand' }
if (-not (Same $g34b $op.WAL) -and $Mutate -ne 'oper') { throw 'operand control: wall is not GEO 2' }

# ---- marker control: GAME.CFG removed ----
$ctl = Invoke-Case 'ctl' $stCtl
if ($ctl.Plan -notmatch 'Greybox native boot') { throw 'control: GBBOOT printed no plan (instrument absent)' }
$ctlHas = $ctl.Plan -match 'CCECL ECL2.DAX entry 1 '
if ($Mutate -eq 'ctl') { $ctlHas = -not $ctlHas }
if ($ctlHas) { throw "control: without GAME.CFG the plan still starts ECL2 block 1, so the marker is not what selects the route: $($ctl.Plan)" }

foreach ($o in $outputs) { Remove-Item (Join-Path $build $o) -Force -ErrorAction SilentlyContinue }
if ($Mutate) { throw "-Mutate ${Mutate}: the inverted control did not fail" }
Write-Output 'RESULT: GBBOOT Gateway to the Savage Frontier (DOS) real start route (ECL2.DAX 1 -> effect-GEO 0001, boot wall == CCGEO decode; payload/operand/marker/twin controls) PASS'
