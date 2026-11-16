# ccecl-pools-flow-test.ps1 -- retail Pools of Darkness init block through CCECL's
# short2 frames (0x21 LOAD_FILES = 2 operands, 0x1F = 1, 0x37 = 2).
#
# Real data: the GOG Pools of Darkness ECL1.DAX block 18 plus its POOL4.CFG marker,
# staged as a COPY. Block 18 is the init block found by the bootability sweep in
# docs/engine/research/pools-of-darkness-eclinit.md and re-derived statically by
# tools/gen1_init_block_sweep.py (pinned by tools/test_gen1_init_block_sweep.py).
#
# The expected PCs come from the DECODER, never from CCECL: the Python scanner and
# packages/engine/src/ecl/disassemble.ts ECL_GEN1_SHORT_POOLS both frame the
# LOAD_FILES at 0x49 as 5 bytes (opcode + two immediate operands), so the next
# executed PC is 0x4E, then the COMPARE's IF_EQ at 0x54.
param([switch]$Headless, [string]$GogPath = 'C:\Program Files (x86)\GOG Galaxy\Games')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$native = $PSScriptRoot
$build = Join-Path $native 'build'
$run = [IO.Path]::GetFullPath((Join-Path $build 'ccecl-pools-flow-test'))
$buildRoot = [IO.Path]::GetFullPath($build)
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
. (Join-Path $native 'ccecl-short2-common.ps1')
$script:Short2GogRoot = $GogPath

if (-not (Test-Path -LiteralPath $dosbox -PathType Leaf)) { Write-Output "SKIP: DOSBox.exe absent: $dosbox"; exit 0 }
$pod = Get-Short2Retail 'Pools of Darkness'
$dok = Get-Short2Retail 'Death Knights of Krynn'
$need = @(
  (Join-Path $pod 'ECL1.DAX'), (Join-Path $pod 'GEO1.DAX'), (Join-Path $pod 'POOL4.CFG'),
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
New-Short2Case $run 'pod' $pod @('ECL1.DAX', 'GEO1.DAX', 'POOL4.CFG') | Out-Null
New-Short2Case $run 'podnm' $pod @('ECL1.DAX', 'GEO1.DAX') | Out-Null
New-Short2Case $run 'podmut' $pod @('ECL1.DAX', 'GEO1.DAX', 'POOL4.CFG') { param($d) Set-Short2TocAlias (Join-Path $d 'ECL1.DAX') 18 19 } | Out-Null
New-Short2Case $run 'dok' $dok @('ECL1.DAX', 'DKK.CFG') | Out-Null
$cases = @(
  @{ Name = 'pod'; Block = 18; Args = '/T' },
  @{ Name = 'podnm'; Block = 18; Args = '/T' },
  @{ Name = 'podmut'; Block = 18; Args = '/T' },
  @{ Name = 'dok'; Block = 32; Args = '/T' }
)
Invoke-Short2Batch $run (Join-Path $build 'ccecl.com') (Join-Path $build 'ccefx.com') $cases $dosbox -Headless:$Headless

$geoIds = Get-Short2DaxIds (Join-Path $pod 'GEO1.DAX')
$pcs = Get-Short2TracePcs (Join-Path $run 'pod')
$noMarkerPcs = Get-Short2TracePcs (Join-Path $run 'podnm')
$mutPcs = Get-Short2TracePcs (Join-Path $run 'podmut')
$dokPcs = Get-Short2TracePcs (Join-Path $run 'dok')

# Instrument-ran guard: the real trace must reach the LOAD_FILES at 0x49 at all.
foreach ($t in @(@('pod', $pcs), @('podnm', $noMarkerPcs), @('dok', $dokPcs))) {
  if (-not ($t[1] -contains 0x0016)) { throw "$($t[0]): trace never started at PC=0016 (instrument absent)" }
}
if (-not ($pcs -contains 0x0049)) { throw 'pod: trace never reached LOAD_FILES at PC=0049' }

# GREEN: the two-operand frame lands the next PC on the COMPARE the decoder shows at 0x4E.
if (-not (Test-Short2PcSeq $pcs @(0x0049, 0x004E, 0x0054))) {
  throw ('Pools block 18: LOAD_FILES at 0049 must be followed by 004E, 0054; got next=0x{0:X4}' -f (Get-Short2NextPc $pcs 0x0049))
}
$g = Get-Short2Gblf (Join-Path $run 'pod')
if (-not $g) { throw 'pod: no GBLF record in the CCEFX dump' }
if ($g[0] -ne 0x0012 -or $g[1] -ne 0x0001 -or $g[2] -ne 0) { throw ('pod: GBLF operands wrong: {0:X4} {1:X4} {2:X4}' -f $g[0], $g[1], $g[2]) }
if ($geoIds -notcontains $g[0]) { throw ('pod: GBLF names GEO {0:X4}, absent from GEO1.DAX' -f $g[0]) }

# Control 1: without POOL4.CFG the legacy three-operand frame is unchanged, so the marker is the cause.
$legacyNext = Get-Short2NextPc $noMarkerPcs 0x0049
if ($legacyNext -ne 0x0051) { throw ('control (no marker): legacy next PC after 0049 changed: 0x{0:X4}' -f $legacyNext) }
if (Test-Short2PcSeq $noMarkerPcs @(0x0049, 0x004E)) { throw 'control (no marker) unexpectedly takes the short frame' }

# Control 2: DoK keeps its three-operand LOAD_FILES (third operand 0x00FF) under DKK.CFG.
$dg = Get-Short2Gblf (Join-Path $run 'dok')
if (-not $dg) { throw 'dok: no GBLF record' }
if ($dg[2] -ne 0x00FF) { throw ('dok control: LOAD_FILES lost its third operand: {0:X4}' -f $dg[2]) }

# Payload mutation: serve block 19 under id 18. The same assertions must now FAIL, i.e. they
# are about the retail block-18 bytes and not about the marker alone.
$mg = Get-Short2Gblf (Join-Path $run 'podmut')
if ($mg -and $mg[0] -eq 0x0012) { throw 'mutation control: aliased block still names GEO 0012' }
if (Test-Short2PcSeq $mutPcs @(0x0049, 0x004E, 0x0054)) { throw 'mutation control: aliased block still satisfies the block-18 PC sequence' }

Write-Output 'RESULT: Pools of Darkness retail block 18 short2 LOAD_FILES frame reaches GEO 0012 with decoder-derived PCs; no-marker, DoK and payload-mutation controls PASS'
