<#
.SYNOPSIS
  Publish the copyright-clean subset of this repo to the public GitHub mirror
  (github.com/kblood/greybox) — code + docs only, NO game files, ever.

.DESCRIPTION
  The working repo (LAN origin) tracks the copyrighted GOG game-data folders
  (Champions of Krynn/, Death Knights of Krynn/, The Dark Queen of Krynn/),
  PDFs and a bundled DOSBox.exe. Those must NEVER reach the public GitHub.

  This script re-exports ONLY the curated clean paths from the current HEAD into
  a scratch checkout, hard-fails if any game-data file slips through, then
  commits + force-pushes that single clean snapshot to the GitHub mirror. It
  never pushes the working repo's history (which is interleaved with the
  copyrighted commits).

  Run it whenever you want the GitHub mirror to catch up to local work.

.NOTES
  Requires: git, gh (authenticated as the repo owner).
#>

$ErrorActionPreference = 'Stop'

# --- config ---------------------------------------------------------------
$RepoRoot   = Split-Path -Parent $PSScriptRoot          # tools/ -> repo root
$GitHubSlug = 'kblood/greybox'
$Stage      = Join-Path $env:TEMP 'greybox-clean-publish'

# The ONLY paths allowed onto the public mirror. Everything else (incl. every
# game-data folder) is excluded by omission.
$CleanPaths = @(
  'docs', 'native', 'tools', 'packages', 'apps',
  '.gitignore', 'CLAUDE.md', 'README.md',
  'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'
)

# Belt-and-suspenders: file types / paths that must NEVER appear in the export.
$ForbiddenRegex = '\.(dax|glb|tlb|ovr|exe|adf|adz|lbm|pdf|bin|dat|sav|cch|qsv|raw)$|Champions of Krynn/|Death Knights of Krynn/|Dark Queen of Krynn/|_extracted/'

# --- export ---------------------------------------------------------------
Write-Host "Exporting clean subset from HEAD..." -ForegroundColor Cyan
if (Test-Path $Stage) { Remove-Item -Recurse -Force $Stage }
New-Item -ItemType Directory -Force $Stage | Out-Null

Push-Location $RepoRoot
try {
  # git archive emits only TRACKED files under the given paths, as committed.
  git archive HEAD @CleanPaths | tar -x -C $Stage
} finally {
  Pop-Location
}

# --- safety gate ----------------------------------------------------------
Push-Location $Stage
try {
  $leaks = git -C . 2>$null; # no-op to keep PSScriptAnalyzer quiet
  $found = Get-ChildItem -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($Stage.Length + 1) -replace '\\', '/'
    if ($rel -match $ForbiddenRegex) { $rel }
  }
  if ($found) {
    Write-Host "ABORT: copyrighted/game files in export:" -ForegroundColor Red
    $found | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    throw "Refusing to publish — clean the paths above."
  }
  $count = (Get-ChildItem -Recurse -File).Count
  Write-Host "Clean export OK: $count files, no game data." -ForegroundColor Green

  # --- commit + push -----------------------------------------------------
  git init -q -b main
  git add -A
  $msg = "Sync clean subset (code + docs only, no game files)"
  git -c user.name='Kasper' -c user.email='kaspersolesen@gmail.com' commit -q -m $msg
  git remote add github "https://github.com/$GitHubSlug.git"
  git push -f github main
  Write-Host "Pushed to https://github.com/$GitHubSlug" -ForegroundColor Green
} finally {
  Pop-Location
}
