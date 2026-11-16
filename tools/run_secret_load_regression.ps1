param(
  [string]$StageDir = 'build\runtime-secret-fresh-save-control-20260715',
  [Parameter(Mandatory)][string]$OutDir,
  [string]$Model = 'qwen3.5:4b',
  [switch]$BeginAdventuring,
  [switch]$CalibratePartyMenu
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$probe = Join-Path $repo 'tools\probe_gen1_save_load.ps1'
$stage = (Resolve-Path (Join-Path $repo $StageDir)).Path

$probeArgs = @{
  StageDir = $StageDir
  OutDir = $OutDir
  BootWaitSec = 10
  StartupAdvanceCount = 3
  LoadMenuKeys = '{DOWN}{DOWN}{ENTER}'
  SlotMenuWaitSec = 3
  SaveSlot = 'A'
  SlotSelectKeys = '{ENTER}'
  LoadWaitSec = 6
  DumpRam = $true
  RequireReferencedSidecars = $true
}
if ($BeginAdventuring -and $CalibratePartyMenu) { throw 'choose BeginAdventuring or CalibratePartyMenu' }
if ($BeginAdventuring) {
  $probeArgs.PostLoadKeys = '{ESC}{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}{ENTER}'
  $probeArgs.PostLoadWaitSec = 8
} elseif ($CalibratePartyMenu) {
  $probeArgs.PostLoadKeys = '{RIGHT}{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}'
  $probeArgs.PostLoadWaitSec = 1
  $probeArgs.PostLoadCaptureEach = $true
}
& $probe @probeArgs
if (-not $?) { throw 'Secret load probe failed' }

$out = Join-Path $repo $OutDir
$daxProof = $null
if ($BeginAdventuring) {
  $ecl = Join-Path $stage 'ECL3.DAX'
  $geo = Join-Path $stage 'GEO3.DAX'
  if (-not (Test-Path -LiteralPath $ecl -PathType Leaf)) { throw "missing ECL archive: $ecl" }
  if (-not (Test-Path -LiteralPath $geo -PathType Leaf)) { throw "missing GEO archive: $geo" }
  $daxProofPath = Join-Path $out 'loaded-dax-proof.json'
  & python (Join-Path $repo 'tools\inspect_gen1_loaded_dax.py') `
    --member ($ecl + ':97') `
    --member ($geo + ':97') `
    --before (Join-Path $out 'save_load_02_after.ram') `
    --after (Join-Path $out 'save_load_03_post_load.ram') `
    --expect-byte '0x1d480:3:3' `
    --expect-byte '0x20522:0:97' `
    --output $daxProofPath `
    --strict
  if ($LASTEXITCODE -ne 0) { throw "Secret Begin DAX proof failed: $LASTEXITCODE" }
  $daxProof = Get-Content -LiteralPath $daxProofPath -Raw | ConvertFrom-Json
}
$frames = @('save_load_00_boot.png', 'save_load_01_slot_menu.png', 'save_load_02_after.png')
if (Test-Path -LiteralPath (Join-Path $out 'save_load_03_post_load.png')) {
  $frames += 'save_load_03_post_load.png'
}
$hashes = [ordered]@{}
foreach ($frame in $frames) {
  $hashes[$frame] = (Get-FileHash -LiteralPath (Join-Path $out $frame) -Algorithm SHA256).Hash.ToLowerInvariant()
}

& python (Join-Path $repo 'tools\describe_screenshots.py') `
  ($frames | ForEach-Object { Join-Path $out $_ }) `
  --model $Model `
  --output (Join-Path $out 'ollama-verdict.json')
if ($LASTEXITCODE -ne 0) { throw "Ollama frame description failed: $LASTEXITCODE" }

$probeRecord = Get-Content -LiteralPath (Join-Path $out 'save-load-probe.json') -Raw | ConvertFrom-Json
[ordered]@{
  schema_version = 1
  title = 'Secret of the Silver Blades original-runtime load regression'
  save_sha256 = $probeRecord.save.sha256
  fixed_actions = @('esc', 'esc', 'esc', 'down', 'down', 'enter', 'a', 'enter') + $(if ($BeginAdventuring) { @('esc', 'down', 'down', 'down', 'down', 'down', 'enter') } else { @() })
  frame_sha256 = $hashes
  mechanical_verdict = if ($BeginAdventuring) {
    'ECL3.DAX#97 and GEO3.DAX#97 each appeared exactly once between the pre/post RAM checkpoints'
  } elseif (($hashes.Values | Sort-Object -Unique).Count -eq $frames.Count) {
    "$($frames.Count) distinct states captured; semantic acceptance still requires state evidence"
  } else {
    'duplicate states captured; the requested transition is not proven'
  }
  loaded_dax_proof = if ($BeginAdventuring) { 'loaded-dax-proof.json' } else { $null }
  loaded_dax_bases = if ($BeginAdventuring) { @($daxProof.members | ForEach-Object { $_.after_matches[0].physical_base }) } else { @() }
  model = $Model
  model_output = 'ollama-verdict.json'
  claim_boundary = 'frame hashes and the save hash are authoritative; Ollama text is advisory and must not promote runtime symbols'
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $out 'secret-load-regression.json') -Encoding utf8

Write-Host "[secret-load] evidence: $(Join-Path $out 'secret-load-regression.json')"
