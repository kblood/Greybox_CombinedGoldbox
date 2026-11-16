# ccecl-treasures-flow-test.ps1 -- retail Treasures of the Savage Frontier init block
# (ECL1.DAX block 20) through CCECL's short2 frames, selected by TREASURE.CFG.
#
# Real data: the GOG Treasures ECL1.DAX / GEO1.DAX / TREASURE.CFG, staged as a COPY.
# Block 20 is the lowest block that boots under the corrected dialect
# (docs/engine/research/treasures-pools-darkness-scoping.md; re-derived statically by
# tools/gen1_init_block_sweep.py, pinned by tools/test_gen1_init_block_sweep.py).
#
# The expected PCs come from the DECODER, never from CCECL: the Python scanner and
# packages/engine/src/ecl/disassemble.ts ECL_GEN1_SHORT_TREASURES frame the
# LOAD_FILES at 0x42 as 5 bytes, followed by SAVE 0x47, SAVE 0x4E, SAVE 0x55 and the
# short zero-operand SURPRISE at 0x5C. Before the TREASURE.CFG probe CCECL read a
# third operand, desynchronised, and the trace ended at 0x42.
param([switch]$Headless, [string]$GogPath = 'C:\Program Files (x86)\GOG Galaxy\Games')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$native = $PSScriptRoot
$build = Join-Path $native 'build'
$run = [IO.Path]::GetFullPath((Join-Path $build 'ccecl-treasures-flow-test'))
$buildRoot = [IO.Path]::GetFullPath($build)
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
. (Join-Path $native 'ccecl-short2-common.ps1')
$script:Short2GogRoot = $GogPath

if (-not (Test-Path -LiteralPath $dosbox -PathType Leaf)) { Write-Output "SKIP: DOSBox.exe absent: $dosbox"; exit 0 }
$tre = Get-Short2Retail 'Treasures of the Savage Frontier'
$dok = Get-Short2Retail 'Death Knights of Krynn'
$need = @(
  (Join-Path $tre 'ECL1.DAX'), (Join-Path $tre 'GEO1.DAX'), (Join-Path $tre 'TREASURE.CFG'),
  (Join-Path $dok 'ECL1.DAX'), (Join-Path $dok 'DKK.CFG')
)
foreach ($n in $need) {
  if (-not (Test-Path -LiteralPath $n -PathType Leaf)) { Write-Output "SKIP: retail data unavailable: $n"; exit 0 }
}
if (-not $run.StartsWith($buildRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Test directory is outside native build root: $run"
}
& (Join-Path $native 'build.ps1') -Target ccecl
if ($LASTEXITCODE -ne 0) { throw 'CCECL build failed' }
& (Join-Path $native 'build.ps1') -Target ccefx
if ($LASTEXITCODE -ne 0) { throw 'CCEFX build failed' }

if (Test-Path -LiteralPath $run) { Remove-Item -LiteralPath $run -Recurse -Force }
New-Item -ItemType Directory -Path $run -Force | Out-Null
New-Short2Case $run 'tre' $tre @('ECL1.DAX', 'GEO1.DAX', 'TREASURE.CFG') | Out-Null
New-Short2Case $run 'trenm' $tre @('ECL1.DAX', 'GEO1.DAX') | Out-Null
New-Short2Case $run 'tremut' $tre @('ECL1.DAX', 'GEO1.DAX', 'TREASURE.CFG') { param($d) Set-Short2TocAlias (Join-Path $d 'ECL1.DAX') 20 22 } | Out-Null
New-Short2Case $run 'dok' $dok @('ECL1.DAX', 'DKK.CFG') | Out-Null
$cases = @(
  @{ Name = 'tre'; Block = 20; Args = '/T' },
  @{ Name = 'trenm'; Block = 20; Args = '/T' },
  @{ Name = 'tremut'; Block = 20; Args = '/T' },
  @{ Name = 'dok'; Block = 32; Args = '/T' }
)
Invoke-Short2Batch $run (Join-Path $build 'ccecl.com') (Join-Path $build 'ccefx.com') $cases $dosbox -Headless:$Headless

$geoIds = Get-Short2DaxIds (Join-Path $tre 'GEO1.DAX')
$pcs = Get-Short2TracePcs (Join-Path $run 'tre')
$noMarkerPcs = Get-Short2TracePcs (Join-Path $run 'trenm')
$mutPcs = Get-Short2TracePcs (Join-Path $run 'tremut')
$dokPcs = Get-Short2TracePcs (Join-Path $run 'dok')
$seq = @(0x0042, 0x0047, 0x004E, 0x0055, 0x005C)

# Instrument-ran guard.
foreach ($t in @(@('tre', $pcs), @('trenm', $noMarkerPcs), @('dok', $dokPcs))) {
  if (-not ($t[1] -contains 0x0016)) { throw "$($t[0]): trace never started at PC=0016 (instrument absent)" }
}
if (-not ($pcs -contains 0x0042)) { throw 'tre: trace never reached LOAD_FILES at PC=0042' }

# GREEN: decoder-derived PC sequence through and past LOAD_FILES to the terminal SURPRISE.
if (-not (Test-Short2PcSeq $pcs $seq)) {
  throw ('Treasures block 20: expected 0042 0047 004E 0055 005C; next after 0042 = 0x{0:X4}' -f (Get-Short2NextPc $pcs 0x0042))
}
$g = Get-Short2Gblf (Join-Path $run 'tre')
if (-not $g) { throw 'tre: no GBLF record in the CCEFX dump' }
if ($g[0] -ne 0x0014 -or $g[1] -ne 0x000D -or $g[2] -ne 0) { throw ('tre: GBLF operands wrong: {0:X4} {1:X4} {2:X4}' -f $g[0], $g[1], $g[2]) }
if ($geoIds -notcontains $g[0]) { throw ('tre: GBLF names GEO {0:X4}, absent from GEO1.DAX' -f $g[0]) }

# Control 1: without TREASURE.CFG the long frame is unchanged (trace ends at the LOAD_FILES), so the marker is the cause.
if (Test-Short2PcSeq $noMarkerPcs @(0x0042, 0x0047)) { throw 'control (no marker) unexpectedly takes the short frame' }
if ((Get-Short2NextPc $noMarkerPcs 0x0042) -ne -1) { throw 'control (no marker): legacy trace no longer ends at 0042' }

# Control 2: DoK keeps its three-operand LOAD_FILES (third operand 0x00FF) under DKK.CFG.
$dg = Get-Short2Gblf (Join-Path $run 'dok')
if (-not $dg) { throw 'dok: no GBLF record' }
if ($dg[2] -ne 0x00FF) { throw ('dok control: LOAD_FILES lost its third operand: {0:X4}' -f $dg[2]) }

# Payload mutation: serve block 22 under id 20; the block-20 assertions must no longer hold.
$mg = Get-Short2Gblf (Join-Path $run 'tremut')
if ($mg -and $mg[0] -eq 0x0014) { throw 'mutation control: aliased block still names GEO 0014' }
if (Test-Short2PcSeq $mutPcs $seq) { throw 'mutation control: aliased block still satisfies the block-20 PC sequence' }

Write-Output 'RESULT: Treasures of the Savage Frontier retail block 20 short2 LOAD_FILES frame reaches GEO 0014 with decoder-derived PCs; no-marker, DoK and payload-mutation controls PASS'
