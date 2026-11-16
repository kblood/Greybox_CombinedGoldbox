# Run a read-only Claude Code research pass and retain its Markdown answer.
param(
  [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$Prompt,
  [Parameter(Mandatory)][ValidatePattern('\.md$')][string]$OutputPath,
  [string]$Model = 'opus'
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$output = if ([IO.Path]::IsPathRooted($OutputPath)) {
  [IO.Path]::GetFullPath($OutputPath)
} else {
  Join-Path $repo $OutputPath
}
if (Test-Path -LiteralPath $output) {
  throw "Refusing to overwrite existing research output: $output"
}
$parent = Split-Path -Parent $output
if (-not (Test-Path -LiteralPath $parent)) {
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
}

$claude = Get-Command claude -ErrorAction Stop
$instructions = @"
You are a read-only research consultant for the GoldBox/Greybox repository. Do not edit files, commit, or deploy. Return a concise evidence-backed Markdown memo with exact repository paths; distinguish facts from inferences.

Research request:
$Prompt
"@

$answer = & $claude.Source -p --model $Model --permission-mode plan $instructions
if ($LASTEXITCODE -ne 0) {
  throw "Claude research failed with exit code $LASTEXITCODE (model: $Model)"
}
$markdown = (($answer | ForEach-Object { [string]$_ }) -join "`n").Trim()
if (-not $markdown) {
  throw "Claude exited successfully but produced no Markdown memo: $output"
}
[IO.File]::WriteAllText($output, $markdown + "`n", [Text.UTF8Encoding]::new($false))
Write-Host "[claude-research] model=$Model output=$output"
