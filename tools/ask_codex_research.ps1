# Run a bounded, read-only Codex research pass and retain its Markdown answer.
param(
  [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$Prompt,
  [Parameter(Mandatory)][ValidatePattern('\.md$')][string]$OutputPath,
  [string]$Model = 'gpt-5.6-sol'
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$output = if ([IO.Path]::IsPathRooted($OutputPath)) { [IO.Path]::GetFullPath($OutputPath) } else { Join-Path $repo $OutputPath }
if (Test-Path -LiteralPath $output) { throw "Refusing to overwrite existing research output: $output" }
$parent = Split-Path -Parent $output
if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
$codex = Get-Command codex -ErrorAction Stop
$instructions = @"
You are a read-only research consultant for the GoldBox/Greybox repository. Do not edit files, commit, or deploy. Return a concise evidence-backed Markdown memo with exact repository paths; distinguish facts from inferences.

Research request:
$Prompt
"@
$args = @('exec', '-s', 'read-only', '-C', $repo, '-o', $output)
if ($Model) { $args += @('-m', $Model) }
$args += $instructions
& $codex.Source @args
if ($LASTEXITCODE -ne 0) {
  if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Force }
  throw "Codex research failed with exit code $LASTEXITCODE (model: $Model)"
}
if (-not (Test-Path -LiteralPath $output) -or (Get-Item -LiteralPath $output).Length -eq 0) {
  throw "Codex exited successfully but produced no Markdown memo: $output"
}
Write-Host "[codex-research] model=$Model output=$output"
