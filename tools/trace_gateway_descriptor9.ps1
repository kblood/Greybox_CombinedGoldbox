param(
  [string]$StageDir = 'build\runtime-gateway-base-clean-20260715',
  [Parameter(Mandatory)][string]$OutDir,
  [ValidateRange(51,128)][int]$MaxSeeks = 80,
  [ValidateRange(5,60)][int]$FirstSeekTimeoutSeconds = 20,
  [ValidateRange(1,15)][int]$NextSeekTimeoutSeconds = 3
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function Resolve-RepoPath([string]$Path) {
  $candidate = if ([IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $repo $Path }
  return [IO.Path]::GetFullPath($candidate)
}

$stage = (Resolve-Path -LiteralPath (Resolve-RepoPath $StageDir)).Path
$out = Resolve-RepoPath $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
$manifestPath = Join-Path $stage 'gateway-stage-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.route_ready -ne $false) { throw 'Gateway descriptor probe requires an unpromoted base stage' }
$expected = @{
  'GAME.EXE' = '0222834b801d9bae16b50ede0b1e738be5aa4803440980915081a1e5cfca5c00'
  'GAME.OVR' = 'c2e64df225bf80026d4bc16d865804dd9e51b1296e6496fa46bba3c2e704f5cd'
}
foreach ($name in $expected.Keys) {
  $actual = (Get-FileHash -LiteralPath (Join-Path $stage $name) -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected[$name]) { throw "Gateway stage hash mismatch: $name" }
}

$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$helperProject = Join-Path $repo 'tools\dosbox_debugger_input\DosboxDebuggerInput.csproj'
$helperDll = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'
$normalizer = Join-Path $repo 'tools\parse_dosbox_vroomm_trace.py'
$mapJson = Join-Path $repo 'build\gen1-all-games-map.json'
& dotnet build $helperProject --configuration Release | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'debugger helper build failed' }

$process = $null
function Invoke-DebuggerSnapshot([string]$Label) {
  $snapshot = Join-Path $out "$Label-console.txt"
  & dotnet $helperDll --pid $process.Id --snapshot-only --snapshot $snapshot `
    --status (Join-Path $out "$Label-status.json") | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "debugger snapshot failed: $Label" }
  return Get-Content -LiteralPath $snapshot -Raw
}

function Invoke-DebuggerCommand([string]$Command, [string]$Label) {
  & dotnet $helperDll --pid $process.Id --command $Command `
    --status (Join-Path $out "$Label-status.json") | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "debugger command failed: $Command" }
}

try {
  & $probe -DbxExe $dbx -GameDir $stage -Exe 'GAME.EXE UseStart' -OutDir $out `
    -Cycles 'fixed 25000' -GameLink -DebuggerAction @('BPINT 21 42', 'RUN') `
    -NoInitialScreenshots -NoActionScreenshots
  if (-not $?) { throw 'Gateway DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)

  $seekCount = 0
  $deadline = [DateTime]::UtcNow.AddSeconds($FirstSeekTimeoutSeconds)
  while ($seekCount -lt $MaxSeeks -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 100
    $snapshot = Invoke-DebuggerSnapshot 'seek-poll'
    if ($snapshot -match '(?m)^\(Running\)\s*$') { continue }
    if ($snapshot -notmatch '\bEAX=[0-9A-F]{4}42[0-9A-F]{2}\b') {
      throw 'Gateway trace stopped somewhere other than INT 21h/AH=42'
    }
    $capture = Join-Path $out ('debugger_console_{0}.txt' -f ($seekCount + 2))
    [IO.File]::WriteAllText($capture, $snapshot, [Text.UTF8Encoding]::new($false))
    $seekCount++
    Invoke-DebuggerCommand 'RUN' 'seek-continue'
    $deadline = [DateTime]::UtcNow.AddSeconds($NextSeekTimeoutSeconds)
  }
  if ($seekCount -eq $MaxSeeks) { throw "Gateway seek trace hit MaxSeeks=$MaxSeeks" }

  [ordered]@{
    schema_version = 1
    title = 'Gateway bounded startup VROOMM seek capture'
    process_id = $process.Id
    seek_count = $seekCount
    silent = $true
    input_sent = $false
    screenshots_captured = $false
    stage_manifest = $manifestPath
  } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $out 'capture-metadata.json') -Encoding utf8

  & python $normalizer --trace-dir $out --map-json $mapJson `
    --profile gateway-to-the-savage-frontier `
    --fixture (Join-Path $out 'gateway-vroomm-runtime.json') `
    --markdown (Join-Path $out 'gateway-vroomm-runtime.md') --strict
  if ($LASTEXITCODE -ne 0) { throw 'strict Gateway VROOMM normalization failed' }
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
