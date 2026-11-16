# ccfp-encounter-art-test.ps1 -- T6-2: CCFP draws a real CPIC1 encounter icon
# on the DOS graphics set (graphics_alt_enabled == 0) instead of the colour-12
# approach marker.
#
# Pipeline (all inside one headless DOSBox, retail data copied, never mounted):
#   CCECL -> OUT.EFX, CCGEO -> WALL.BIN, CGB /B <id> /I ICON.GBI CPIC1.DAX,
#   CCFP WALL.BIN /E <efx with GBES pic=<id>> /T /I ICON.GBI /S <frame>.RAW
# and compares each RAW frame against tools/encounter_art_model.py's
# compositor applied to the no-setup BASE frame (exact palette-index equality).
#
# Controls: (1) GBES pic != GBI block id -> marker (provenance check survives);
# (2) no /I -> marker; (3) a zeroed icon pixel plane -> frame differs from the
# real-icon frame (the probe can see the payload).
param([switch]$Headless)
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
$build = Join-Path $native 'build'
$run = Join-Path $build 'ccfp-encounter-art'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
$game = Join-Path $root 'Champions of Krynn'
$py = if ($env:GOLDBOX_PYTHON) { $env:GOLDBOX_PYTHON } else { 'python' }
$compare = Join-Path $root 'tools\encounter_art_compare.py'
$blockId = 5

if (-not (Test-Path -LiteralPath $dosbox)) {
  Write-Output 'SKIP: CCFP encounter art (DOSBox.exe absent)'
  exit 0
}
foreach ($f in 'ECL1.DAX','GEO1.DAX','WALLDEF1.DAX','8X8D1.DAX','CPIC1.DAX') {
  if (-not (Test-Path -LiteralPath (Join-Path $game $f))) { Write-Output "SKIP: CCFP encounter art (CoK $f absent)"; exit 0 }
}
. (Join-Path $native 'dosbox-smoke.ps1')
foreach ($t in 'ccecl','ccgeo','ccfp','cgb') { & (Join-Path $native 'build.ps1') -Target $t }

if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Force $run | Out-Null
foreach ($t in 'ccecl','ccgeo','ccfp','cgb') { Copy-Item (Join-Path $build "$t.com") (Join-Path $run ($t.ToUpper() + '.COM')) -Force }
foreach ($f in 'ECL1.DAX','GEO1.DAX','WALLDEF1.DAX','8X8D1.DAX','CPIC1.DAX') { Copy-Item (Join-Path $game $f) (Join-Path $run $f) -Force }

function Add-GbesTail([string]$Src, [string]$Dst, [int]$Pic, [int]$Distance) {
  $b = [IO.File]::ReadAllBytes($Src)
  $flags = [BitConverter]::ToUInt16($b, 6)
  [BitConverter]::GetBytes([UInt16]($flags -bor 0x0040)).CopyTo($b, 6)
  $o = 5708
  [Text.Encoding]::ASCII.GetBytes('GBES').CopyTo($b, $o)
  foreach ($kv in @(@(4,9),@(6,3),@(8,$Pic),@(10,$Distance))) {
    [BitConverter]::GetBytes([UInt16]$kv[1]).CopyTo($b, $o + $kv[0])
  }
  [IO.File]::WriteAllBytes($Dst, $b)
}
function Invoke-Dos([string]$Name, [string]$Body, [int]$TimeoutMs = 90000) {
  $conf = Join-Path $run "_$Name.conf"
  $text = "[sdl]`r`nfullscreen=false`r`noutput=surface`r`nautolock=false`r`n[cpu]`r`ncycles=fixed 50000`r`n[autoexec]`r`nmount C `"$run`"`r`nC:`r`n$Body`r`nexit`r`n"
  Set-Content -Path $conf -Value $text -Encoding ASCII
  $p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
  if (-not $p.WaitForExit($TimeoutMs)) { try { $p.Kill() } catch {}; throw "DOSBox timed out: $Name" }
}
function Assert-Compare([string[]]$CmpArgs, [string]$Label) {
  $out = & $py -I $compare @CmpArgs 2>&1
  $rc = $LASTEXITCODE
  Write-Output ("  {0}: {1}" -f $Label, (($out | Out-String).Trim() -replace "`r?`n", ' | '))
  if ($rc -ne 0) { throw "$Label failed (rc=$rc)" }
}
function Assert-Differs([string]$A, [string]$B, [string]$Label) {
  $out = & $py -I $compare same $A $B 2>&1
  $rc = $LASTEXITCODE
  $report = ($out | Out-String).Trim()
  if ($rc -ne 1 -or $report -notmatch '\Asame diff=[1-9][0-9]*\z') {
    throw "$Label failed: expected a measured frame difference (rc=$rc, report=$report)"
  }
  Write-Output ("  {0}: {1}" -f $Label, $report)
}

Invoke-Dos 'prep' ("CCECL ECL1.DAX 34 /E C:\OUT.EFX > C:\ECL.TXT`r`n" +
  "CCGEO /B GEO1.DAX 34 C:\WALL.BIN > C:\GEO.TXT`r`n" +
  "CGB /B $blockId /I C:\ICON.GBI CPIC1.DAX > C:\CGB.TXT")
foreach ($f in 'OUT.EFX','WALL.BIN','ICON.GBI') {
  if (-not (Test-Path (Join-Path $run $f))) { throw "prep produced no $f" }
}
$gbi = [IO.File]::ReadAllBytes((Join-Path $run 'ICON.GBI'))
if ([Text.Encoding]::ASCII.GetString($gbi, 0, 4) -ne 'GBIM' -or [BitConverter]::ToUInt16($gbi, 6) -ne $blockId) { throw 'ICON.GBI is not GBIM for the requested block' }

# CCECL's own route-34 output already carries a GBES tail (its marker is what
# the unmodified renderer draws), so the model baseline must be a frame with the
# magic removed, not the raw OUT.EFX.
$nb = [IO.File]::ReadAllBytes((Join-Path $run 'OUT.EFX'))
[Array]::Clear($nb, 5708, 4)
[IO.File]::WriteAllBytes((Join-Path $run 'NOSETUP.EFX'), $nb)
Add-GbesTail (Join-Path $run 'OUT.EFX') (Join-Path $run 'NEAR.EFX') $blockId 1
Add-GbesTail (Join-Path $run 'OUT.EFX') (Join-Path $run 'FAR.EFX') $blockId 3
Add-GbesTail (Join-Path $run 'OUT.EFX') (Join-Path $run 'MISM.EFX') ($blockId + 1) 1
# Control: same GBIM header/palette with the pixel plane zeroed.
$z = [byte[]]$gbi.Clone()
$w = [BitConverter]::ToUInt16($gbi, 10); $h = [BitConverter]::ToUInt16($gbi, 12)
for ($i = 14; $i -lt 14 + $w * $h; $i++) { $z[$i] = 0 }
[IO.File]::WriteAllBytes((Join-Path $run 'ZERO.GBI'), $z)

Invoke-Dos 'frames' ("CCFP C:\WALL.BIN /E C:\NOSETUP.EFX /T /S C:\BASE.RAW > C:\F0.TXT`r`n" +
  "CCFP C:\WALL.BIN /E C:\NEAR.EFX /T /I C:\ICON.GBI /S C:\NEAR.RAW > C:\F1.TXT`r`n" +
  "CCFP C:\WALL.BIN /E C:\FAR.EFX /T /I C:\ICON.GBI /S C:\FAR.RAW > C:\F2.TXT`r`n" +
  "CCFP C:\WALL.BIN /E C:\MISM.EFX /T /I C:\ICON.GBI /S C:\MISM.RAW > C:\F3.TXT`r`n" +
  "CCFP C:\WALL.BIN /E C:\NEAR.EFX /T /S C:\NOI.RAW > C:\F4.TXT`r`n" +
  "CCFP C:\WALL.BIN /E C:\NEAR.EFX /T /I C:\ZERO.GBI /S C:\ZERO.RAW > C:\F5.TXT") 150000
foreach ($f in 'BASE','NEAR','FAR','MISM','NOI','ZERO') {
  if (-not (Test-Path (Join-Path $run "$f.RAW"))) { throw "$f.RAW missing" }
}
function Raw([string]$n) { Join-Path $run "$n.RAW" }
Write-Output "CCFP encounter art (CoK CPIC1 block $blockId, DOS set: no alt graphics):"
Assert-Compare @('icon', (Raw BASE), (Raw NEAR), 'CoK', "$blockId", '1') 'near icon == model composite'
Assert-Compare @('icon', (Raw BASE), (Raw FAR), 'CoK', "$blockId", '3') 'far icon == model composite'
# Palette assumption (design doc "could not verify"): the DOS DAC entries 0..15
# the frame ends with must equal the GBIM's EGA-16 entries scaled to 6 bits.
$nearRaw = [IO.File]::ReadAllBytes((Raw NEAR))
$palBase = 4 + 64000
for ($i = 0; $i -lt 48; $i++) {
  if ($nearRaw[$palBase + $i] -ne ($gbi[14 + $w * $h + $i] -shr 2)) { throw "DAC entry $i differs from GBIM EGA-16 palette" }
}
Write-Output '  DAC 0..15 == GBIM EGA-16 palette >> 2'
Assert-Compare @('marker', (Raw BASE), (Raw MISM)) 'id mismatch -> marker'
Assert-Compare @('marker', (Raw BASE), (Raw NOI)) 'no /I -> marker'
Assert-Differs (Raw NEAR) (Raw ZERO) 'zeroed pixel plane changes frame'
Write-Output 'RESULT: CCFP encounter art PASS'
exit 0
