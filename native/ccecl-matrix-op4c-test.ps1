# ccecl-matrix-op4c-test.ps1 -- retail Matrix Cubed ECL1 block 19: opcode 0x4C takes
# TWO operands under MATRIX.CFG (Matrix's own opcode table), so 050A no longer
# hits a phantom EXIT and the route reaches LOAD_FILES(GEO 17) / LOAD_PIECES(set 5).
# Control: the same bytes without MATRIX.CFG keep the Buck zero-operand framing.
param([switch]$Headless)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$native = $PSScriptRoot
$build = Join-Path $native 'build'
$run = [IO.Path]::GetFullPath((Join-Path $build 'ccecl-matrix-op4c-test'))
$buildRoot = [IO.Path]::GetFullPath($build)
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
. (Join-Path $native 'dosbox-smoke.ps1')
if (-not $run.StartsWith($buildRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw "Test directory is outside native build root: $run" }
# The extraction is git-ignored, so a worktree may not carry it: also try the main checkout.
$retail = $null
$cands = @((Join-Path $root 'matrixcubed_extracted\BuckRogers2\c\Matrix'))
$common = (& git -C $root rev-parse --git-common-dir 2>$null)
if ($common) {
  $mainRoot = Split-Path -Parent ([IO.Path]::GetFullPath($common, $root))
  $cands += (Join-Path $mainRoot 'matrixcubed_extracted\BuckRogers2\c\Matrix')
}
foreach ($c in $cands) { if (Test-Path -LiteralPath (Join-Path $c 'ECL1.DAX')) { $retail = $c; break } }
if (-not $retail -or -not (Test-Path -LiteralPath (Join-Path $retail 'MATRIX.CFG')) -or -not (Test-Path -LiteralPath $dosbox -PathType Leaf)) {
  Write-Output 'SKIP: Matrix Cubed retail ECL1.DAX/MATRIX.CFG or DOSBox unavailable'; exit 0
}
& (Join-Path $native 'build.ps1') -Target ccecl
if ($LASTEXITCODE -ne 0) { throw 'CCECL build failed' }
& (Join-Path $native 'build.ps1') -Target ccefx
if ($LASTEXITCODE -ne 0) { throw 'CCEFX build failed' }
if (Test-Path $run) { Remove-Item $run -Recurse -Force }
$withDir = Join-Path $run 'with'; $withoutDir = Join-Path $run 'without'
New-Item -ItemType Directory -Path $withDir, $withoutDir -Force | Out-Null
foreach ($d in $withDir, $withoutDir) {
  foreach ($n in 'ccecl.com', 'ccefx.com') { Copy-Item (Join-Path $build $n) (Join-Path $d $n.ToUpperInvariant()) -Force }
  Copy-Item (Join-Path $retail 'ECL1.DAX') (Join-Path $d 'ECL1.DAX') -Force
}
Copy-Item (Join-Path $retail 'MATRIX.CFG') (Join-Path $withDir 'MATRIX.CFG') -Force
$conf = Join-Path $run '_op4c.conf'
@"
[sdl]
output=surface
[cpu]
cycles=fixed 25000
[autoexec]
mount C "$withDir"
mount D "$withoutDir"
C:
CCECL C:\ECL1.DAX 19 /T /E C:\_GBECL.BIN
CCEFX C:\_GBECL.BIN C:\WE.TXT
COPY C:\CCECL.TRC C:\W.TRC
D:
CCECL D:\ECL1.DAX 19 /T /E D:\_GBECL.BIN
CCEFX D:\_GBECL.BIN D:\NE.TXT
COPY D:\CCECL.TRC D:\N.TRC
exit
"@ | Set-Content -LiteralPath $conf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(90000)) { Stop-DosBoxSmoke $p; throw 'DOSBox timed out' }
if ($p.ExitCode -ne 0) { throw "DOSBox exited with code $($p.ExitCode)" }
function ReadOut($d, $n) { $f = Join-Path $d $n; if (-not (Test-Path $f)) { throw "missing output $f" }; Get-Content $f -Raw }
$wt = ReadOut $withDir 'W.TRC'; $we = ReadOut $withDir 'WE.TXT'
$nt = ReadOut $withoutDir 'N.TRC'; $ne = ReadOut $withoutDir 'NE.TXT'
# Instrument-ran guard: both traces must be real traces that visit 050A.
foreach ($t in $wt, $nt) { if ($t -notmatch '050A\s+OP=4C') { throw 'trace never reached PC=050A OP=4C (instrument absent)' } }
# Control: Buck framing, 4C is operand-less, next byte is EXIT.
if ($nt -notmatch '050B\s+OP=00') { throw 'control (no MATRIX.CFG) no longer shows 050B OP=00' }
if ($ne -match 'GBLF operands=0011') { throw 'control effect dump unexpectedly names GEO 0011' }
# Matrix: 4C consumes two operands; 050B is mid-instruction and must not execute as EXIT.
if ($wt -match '050B\s+OP=00') { throw 'Matrix trace still executes EXIT at 050B' }
if ($wt -notmatch '050A\s+OP=4C[\s\S]*?OP=09') { throw 'Matrix trace does not continue to SAVE after 4C' }
if ($we -notmatch 'GBLF operands=0011') { throw 'Matrix effect dump lacks GBLF GEO 0011' }
if ($we -notmatch 'GBLP raw=[^\r\n]*0005') { throw 'Matrix effect dump lacks GBLP wall set 0005' }
Write-Output 'RESULT: Matrix Cubed block 19 opcode 0x4C two-operand framing reaches GEO 0011 / wall set 0005; control unchanged PASS'
