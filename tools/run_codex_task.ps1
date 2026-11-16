# Run a bounded Codex CLI task (write-capable) and retain its Markdown answer.
# Companion to ask_codex_research.ps1: that helper is read-only research; this
# one is for tasks that must actually DO something in the working tree, such
# as running native/cchost-test.ps1 (DOSBox) or judging a screenshot.
#
# Default model is Luna 6 (gpt-6-luna) per Kasper's 2026-09-23 standing
# instruction: use Luna 6 for running tests like DOSBox tests and viewing
# screenshots. Pass -Model only when deliberately using a different Codex
# model.
#
# DOSBox tasks need -Sandbox danger-full-access. Codex's default
# workspace-write sandbox cannot run DOSBox at all: DOSBox silently drops the
# real -conf file and only loads the quiet %TEMP% overlay conf, so there is
# no [autoexec] and it hangs at a prompt until killed (see
# docs/engine/DECISIONS-NEEDED.md, "Codex/Luna 6 cannot run the DOSBox
# harnesses", resolved 2026-09-23). Kasper authorized danger-full-access for
# this specific use. Verified fix (2026-09-23): an isolated scratch DOSBox
# conf that only hung under workspace-write exited in ~1.2s under
# danger-full-access with correct autoexec output. The default here stays
# workspace-write (safe for non-DOSBox tasks); pass
# -Sandbox danger-full-access explicitly whenever the task starts DOSBox.
param(
  [Parameter(Mandatory)][ValidateNotNullOrEmpty()][string]$Prompt,
  [Parameter(Mandatory)][ValidatePattern('\.md$')][string]$OutputPath,
  [string]$Model = 'gpt-6-luna',
  [ValidateSet('read-only', 'workspace-write', 'danger-full-access')]
  [string]$Sandbox = 'workspace-write',
  [string[]]$Image = @(),
  [string[]]$AddDir = @()
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$output = if ([IO.Path]::IsPathRooted($OutputPath)) { [IO.Path]::GetFullPath($OutputPath) } else { Join-Path $repo $OutputPath }
if (Test-Path -LiteralPath $output) { throw "Refusing to overwrite existing task output: $output" }
$parent = Split-Path -Parent $output
if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
foreach ($img in $Image) {
  if (-not (Test-Path -LiteralPath $img)) { throw "Image not found: $img" }
}
$codex = Get-Command codex -ErrorAction Stop
$instructions = @"
You are executing a bounded task in the GoldBox/Greybox repository on behalf
of a Claude Code agent that owns the surrounding plan and git history. Do
only what this task asks: run the named command(s), read the named
file(s)/image(s), and report exactly what happened (exit codes, verbatim
output lines, what a screenshot shows). Do not commit, push, or edit files
outside what the task explicitly asks you to change. Return a concise,
evidence-backed Markdown memo; distinguish what you observed from what you
inferred.

Task:
$Prompt
"@
$args = @('exec', '-s', $Sandbox, '-C', $repo, '-o', $output)
if ($Model) { $args += @('-m', $Model) }
foreach ($dir in $AddDir) { $args += @('--add-dir', $dir) }
foreach ($img in $Image) { $args += @('-i', $img) }
$args += $instructions
& $codex.Source @args
if ($LASTEXITCODE -ne 0) {
  if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Force }
  throw "Codex task failed with exit code $LASTEXITCODE (model: $Model, sandbox: $Sandbox)"
}
if (-not (Test-Path -LiteralPath $output) -or (Get-Item -LiteralPath $output).Length -eq 0) {
  throw "Codex exited successfully but produced no Markdown memo: $output"
}
Write-Host "[codex-task] model=$Model sandbox=$Sandbox output=$output"
