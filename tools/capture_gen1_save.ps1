param(
  [Parameter(Mandatory = $true)][string]$GameRoot,
  [Parameter(Mandatory = $true)][ValidatePattern('^[A-Z]$')][string]$SaveSlot,
  [Parameter(Mandatory = $true)][string]$TitleId,
  [string]$OutRoot = 'build/manual-save-captures',
  [string]$Note = ''
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $GameRoot).Path
$slot = $SaveSlot.ToUpperInvariant()
$save = Get-ChildItem -LiteralPath $root -Recurse -File -Filter "SAVGAM$slot.DAT"
if ($save.Count -ne 1) {
  throw "Expected exactly one SAVGAM$slot.DAT below $root; found $($save.Count)"
}

$bytes = [System.IO.File]::ReadAllBytes($save.FullName)
$ascii = [System.Text.Encoding]::ASCII.GetString($bytes)
$references = @(
  [regex]::Matches($ascii, 'CHRDAT[A-Z]?[0-9]+') |
    ForEach-Object Value |
    Sort-Object -Unique
)
if ($references.Count -eq 0) {
  throw "No embedded CHRDAT references found in $($save.FullName)"
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = Join-Path $OutRoot "$TitleId-slot-$slot-$stamp"
if (Test-Path -LiteralPath $out) { throw "Capture directory already exists: $out" }
New-Item -ItemType Directory -Path $out | Out-Null

$files = @($save)
foreach ($reference in $references) {
  $sidecars = @(Get-ChildItem -LiteralPath $save.DirectoryName -File -Filter "$reference.*")
  if ($sidecars.Count -eq 0) { throw "Missing sidecars for embedded reference $reference" }
  $files += $sidecars
}
$files = @($files | Sort-Object FullName -Unique)

$manifestFiles = foreach ($file in $files) {
  Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $out $file.Name)
  [ordered]@{
    name = $file.Name
    size = $file.Length
    sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}

$manifest = [ordered]@{
  schema_version = 1
  title_id = $TitleId
  save_slot = $slot
  captured_at = (Get-Date).ToString('o')
  source_root = $root
  note = $Note
  embedded_character_references = $references
  files = $manifestFiles
  handling = 'Local user-owned runtime evidence. Keep under build/; do not commit retail save bytes.'
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $out 'capture.json') -Encoding utf8
Write-Host "[gen1-save-capture] $out ($($files.Count) files)"

