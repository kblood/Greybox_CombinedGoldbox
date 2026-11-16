# gbfp-encounter-dos-test.ps1 -- T6-3: GBBOOT decodes the GBES setup monster's
# CPIC1.DAX frame on the DOS graphics set (/G 1) and CCFP draws it instead of
# the colour-12 approach marker.
#
# Route: real CoK data (retail-staged mirror, never the retail folder),
#   GBBOOT /E /X /G 1   (CCECL entry 34 -> GEO -> CCFP /S _GBVIEW.RAW)
# Frames:
#   ICON   : full CoK mirror                      (CPIC1.DAX present)
#   MARKER : mirror WITHOUT CPIC1.DAX             (the unmodified behaviour)
#   MUTANT : mirror with block <pic>'s payload overwritten (probe sees payload)
# Pass criteria (tools/encounter_art_compare.py rect): every opaque pixel of the
# model composite of CPIC1 block <pic> at distance <dist> is exact in ICON, ICON
# equals MARKER outside the icon/marker rectangles, and ICON has >= 400 fewer
# colour-12 pixels than MARKER.  <pic>/<dist> are read from the effect file
# GBBOOT itself wrote (_GBECL.BIN GBES tail), not assumed.
param([switch]$Headless)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build 'gbfp-encounter-dos'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
$game = Join-Path $root 'Champions of Krynn'
$py = if ($env:GOLDBOX_PYTHON) { $env:GOLDBOX_PYTHON } else { 'python' }
$compare = Join-Path $root 'tools\encounter_art_compare.py'
$files = @('START.EXE','KRYNN.CFG','ECL1.DAX','GEO1.DAX','WALLDEF1.DAX','8X8D1.DAX','CPIC1.DAX')

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: GBBOOT DOS encounter art (DOSBox.exe absent)'
  exit 0
}
foreach ($f in $files) {
  if (-not (Test-Path -LiteralPath (Join-Path $game $f))) { Write-Output "SKIP: GBBOOT DOS encounter art (CoK $f absent)"; exit 0 }
}
. (Join-Path $native 'dosbox-smoke.ps1')
. (Join-Path $native 'retail-stage.ps1')
& (Join-Path $native 'build.ps1') -Target engine

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null
foreach ($t in 'gbboot','ccecl','ccflow','ccbind','ccefx','cchost','ccmenu','ccgeo','ccfp','cchlib','cccombat','ccdaa','ccparty','ccinv','cgb') {
  Copy-Item (Join-Path $build "$t.com") (Join-Path $run ($t.ToUpper() + '.COM')) -Force
}

$stageIcon = New-RetailStage -Source $game -Name 'enc-art-cok-icon' -Files $files -Fresh
$stageNone = New-RetailStage -Source $game -Name 'enc-art-cok-nocpic' -Files ($files | Where-Object { $_ -ne 'CPIC1.DAX' }) -Fresh
$stageMut = New-RetailStage -Source $game -Name 'enc-art-cok-mutant' -Files $files -Fresh

# Real CoK ECL1 route 34 carries an all-zero GBES (pic 0), so the route uses the
# same synthetic one-block ECL as gbboot-test.ps1's "setup_distance" fixture
# (SETUP_MONSTER sprite 9 / max 3 / pic 5, APPROACH, LOAD_FILES geo 34) over the
# REAL GEO1/WALLDEF1/8X8D1/CPIC1 data.  GBBOOT /Q 7 selects it.
function Write-SetupEcl([string]$Path) {
  $raw = [byte[]](@(0) * 22 + @(0x0C,0x00,0x09,0x00,0x03,0x00,0x05,0x0D,0x21,0x00,34,0x00,0x02,0x00,0xFF,0x00))
  $comp = [byte[]](@([byte]($raw.Length - 1)) + $raw)
  $b = New-Object byte[] (2 + 9 + $comp.Length)
  $b[0] = 9; $b[2] = 34
  [BitConverter]::GetBytes([UInt16]$raw.Length).CopyTo($b, 7)
  [BitConverter]::GetBytes([UInt16]$comp.Length).CopyTo($b, 9)
  $comp.CopyTo($b, 11)
  [IO.File]::WriteAllBytes($Path, $b)
}
foreach ($d in $stageIcon, $stageNone, $stageMut) { Write-SetupEcl (Join-Path $d 'ECL1.DAX') }

function Invoke-Route([string]$Tag, [string]$Dir) {
  foreach ($f in '_GBVIEW.RAW','_GBECL.BIN','_GBWALL.BIN','GB.TXT') { Remove-Item (Join-Path $run $f) -Force -ErrorAction SilentlyContinue }
  $conf = Join-Path $run "_$Tag.conf"
  $text = "[sdl]`r`nfullscreen=false`r`noutput=surface`r`nautolock=false`r`n[cpu]`r`ncycles=fixed 50000`r`n[autoexec]`r`nmount C `"$run`"`r`nmount D `"$Dir`"`r`nD:`r`nC:\GBBOOT /E /X /Q 7 /G 1 > C:\GB.TXT`r`nexit`r`n"
  Set-Content -Path $conf -Value $text -Encoding ASCII
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
  if (-not $p.WaitForExit(90000)) { try { $p.Kill() } catch {}; throw "DOSBox timed out: $Tag" }
  $view = Join-Path $run '_GBVIEW.RAW'
  if (-not (Test-Path $view)) { throw "$Tag produced no _GBVIEW.RAW; GB.TXT: $(Get-Content (Join-Path $run 'GB.TXT') -Raw -ErrorAction SilentlyContinue)" }
  Copy-Item $view (Join-Path $run "$Tag.RAW") -Force
  Copy-Item (Join-Path $run '_GBECL.BIN') (Join-Path $run "$Tag.EFX") -Force
  Copy-Item (Join-Path $run 'GB.TXT') (Join-Path $run "$Tag.TXT") -Force
}

# Mutant CPIC1: overwrite the compressed payload of the GBES block (id read below).
Invoke-Route 'MARKER' $stageNone
$efx = [IO.File]::ReadAllBytes((Join-Path $run 'MARKER.EFX'))
if ([Text.Encoding]::ASCII.GetString($efx, 5708, 4) -ne 'GBES') { throw 'route wrote no GBES tail' }
$pic = [BitConverter]::ToUInt16($efx, 5708 + 8)
$dist = [BitConverter]::ToUInt16($efx, 5708 + 10)
Write-Output "route GBES: pic=$pic distance=$dist"

$dax = [IO.File]::ReadAllBytes((Join-Path $game 'CPIC1.DAX'))
$tocBytes = [BitConverter]::ToUInt16($dax, 0)
$hit = $false
for ($o = 2; $o -lt 2 + $tocBytes; $o += 9) {
  if ($dax[$o] -eq $pic) {
    $off = [BitConverter]::ToUInt32($dax, $o + 1); $comp = [BitConverter]::ToUInt16($dax, $o + 7)
    $base = 2 + $tocBytes + $off
    for ($i = 0; $i -lt $comp; $i++) { $dax[$base + $i] = 0xF1 }
    $hit = $true
  }
}
if (-not $hit) { throw "CPIC1.DAX has no block $pic" }
[IO.File]::WriteAllBytes((Join-Path $stageMut 'CPIC1.DAX'), $dax)

Invoke-Route 'ICON' $stageIcon
Invoke-Route 'MUTANT' $stageMut

function Cmp([string[]]$A, [string]$Label) {
  $out = & $py -I $compare @A 2>&1
  $rc = $LASTEXITCODE
  $script:compareReport = ($out | Out-String).Trim() -replace "`r?`n", ' | '
  Write-Host ("  {0}: {1}" -f $Label, (($out | Out-String).Trim() -replace "`r?`n", ' | '))
  return [int]$rc
}
Write-Output "GBBOOT /G 1 encounter art (CoK CPIC1 block $pic, distance $dist):"
$rc = Cmp @('rect', (Join-Path $run 'MARKER.RAW'), (Join-Path $run 'ICON.RAW'), 'CoK', "$pic", "$dist") 'ICON frame vs model'
if ($rc -ne 0) { throw 'DOS encounter icon was not drawn (or differs from the model)' }
$rcm = Cmp @('rect', (Join-Path $run 'MARKER.RAW'), (Join-Path $run 'MUTANT.RAW'), 'CoK', "$pic", "$dist") 'MUTANT frame vs model (must NOT match)'
if ($rcm -ne 1 -or $compareReport -notmatch '\Arect block=([0-9]+) dist=([0-9]+) opaque=([0-9]+) wrong=([1-9][0-9]*) outside_diff=0 red_icon_run=([0-9]+) red_marker_run=([0-9]+) \| FAIL\z' -or
    [int]$Matches[1] -ne $pic -or [int]$Matches[2] -ne $dist -or [int]$Matches[3] -lt 50) {
  throw "mutated CPIC1 payload did not produce the expected measured mismatch (rc=$rcm, report=$compareReport)"
}
Write-Output 'RESULT: GBBOOT DOS encounter art PASS'
exit 0
