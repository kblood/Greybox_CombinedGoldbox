# recon_gateway_frontend_nav.ps1 -- EXPLORATORY, screenshot-only recon of Gateway to the Savage
# Frontier's title/front-end screen sequence. Purely observational: launches GAME.EXE UseStart
# directly (no debugger), sends a small bounded key sequence (ENTER presses by default; modeled on
# tools/trace_dok_position_telemetry.ps1's cold-boot keypress-sequencing pattern -- that script's
# own header comment documents DoK's front end needing exactly 3 dismiss keys before the real
# main menu, discovered this same screenshot-driven way), and saves a screenshot after each step.
# Never touches the debugger; this script exists purely to find out empirically what Gateway's own
# front-end looks like (title/logo, dev credits, version banner, main menu, character creation),
# which -- unlike DoK -- has never been screenshot-mapped in this project before (see
# docs/engine/research/gateway-operand-parser-execution-probe.md's "no statically-mapped front-end
# dispatcher" note). No save file used or required.
#
# INPUT/CAPTURE MECHANISM: this project's documented focusless automation method,
# docs/engine/research/dosbox-x-gamelink-automation.md -- DOSBox-X GameLink v4 shared memory via
# tools/dosbox_gamelink.py, NOT Windows SendInput/SetForegroundWindow. Several agents run
# DOSBox-X concurrently in this project; a host-focus-stealing input method would corrupt every
# other agent's own keypress delivery. (NOTE: the FIRST run of this script, which produced
# build/gateway-frontend-recon-20260717b/*.png and discovered the 8-step sequence documented in
# docs/engine/research/gateway-vga-picture-format.md Part 5, predates this correction and used
# the older host-focus Send-DosKeys path -- this file has since been corrected to GameLink for
# any future reruns.)

param(
  [string]$StageDir = 'build\runtime-gateway-base-clean-20260715',
  [Parameter(Mandatory)][string]$OutDir,
  [int]$Steps = 8,
  [string]$KeySequence = '',
  [int]$SettleMs = 1800,
  # When set, enables DOSBox-X's own [log] FILES-channel logging (DOS file opens with
  # filenames) to <OutDir>\dos-files.log via dosbox_x_debugbox_probe.ps1 -DosLogFile, and
  # records the log's line count after every route step into <OutDir>\log-progress.jsonl so
  # each open can be attributed to the exact keypress that caused it.
  [switch]$TraceFileOpens
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
New-Item -ItemType Directory -Force -Path $out | Out-Null
$manifestPath = Join-Path $stage 'gateway-stage-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
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
$gameLink = Join-Path $repo 'tools\dosbox_gamelink.py'
$existingDosbox = @(Get-Process dosbox-x -ErrorAction SilentlyContinue)
if ($existingDosbox.Count -gt 0) {
  throw "GameLink is process-global and another DOSBox-X session already exists: $($existingDosbox.Id -join ',')"
}

$keys = if ($KeySequence.Trim()) {
  @($KeySequence.Split(',') | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
} else {
  @(for ($i = 0; $i -lt $Steps; $i++) { 'enter' })
}
if ($keys.Count -eq 0) { throw 'key sequence is empty' }

$dosLogPath = Join-Path $out 'dos-files.log'
$logProgressPath = Join-Path $out 'log-progress.jsonl'
function Get-DosLogLineCount {
  if (-not (Test-Path -LiteralPath $dosLogPath)) { return 0 }
  # The logfile is held open (unbuffered) by DOSBox-X; read it shared.
  $fs = [IO.File]::Open($dosLogPath, 'Open', 'Read', 'ReadWrite')
  try {
    $sr = New-Object IO.StreamReader($fs)
    $n = 0
    while ($null -ne $sr.ReadLine()) { $n++ }
    return $n
  } finally { $fs.Dispose() }
}
function Write-LogProgress([string]$Step) {
  if (-not $TraceFileOpens) { return }
  $rec = [ordered]@{ step = $Step; log_lines = (Get-DosLogLineCount); utc = [DateTime]::UtcNow.ToString('o') }
  ($rec | ConvertTo-Json -Compress) | Add-Content -Path $logProgressPath -Encoding utf8
}

$process = $null
try {
  $probeArgs = @{
    DbxExe = $dbx; GameDir = $stage; Exe = 'GAME.EXE UseStart'; OutDir = $out
    RunDirect = $true; GameLink = $true; NoInitialScreenshots = $true
  }
  if ($TraceFileOpens) { $probeArgs.DosLogFile = $dosLogPath }
  & $probe @probeArgs
  if (-not $?) { throw 'Gateway recon probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)

  function Assert-OwnDosboxSession {
    if ($process.HasExited) { throw "owned DOSBox-X process $($process.Id) exited unexpectedly" }
    $foreign = @(Get-Process dosbox-x -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $process.Id })
    if ($foreign.Count -gt 0) {
      throw "GameLink ownership lost; foreign DOSBox-X PID(s): $($foreign.Id -join ',')"
    }
  }

  Start-Sleep -Milliseconds 3000
  Assert-OwnDosboxSession
  & python $gameLink screenshot (Join-Path $out 'step-00-boot.png')
  if ($LASTEXITCODE -ne 0) { throw "GameLink screenshot failed: $LASTEXITCODE" }
  Write-Host '[recon] saved step-00-boot.png'
  Write-LogProgress 'step-00-boot'

  for ($i = 1; $i -le $keys.Count; $i++) {
    $key = $keys[$i - 1]
    Assert-OwnDosboxSession
    if ($key -ne 'wait') {
      & python $gameLink press $key
      if ($LASTEXITCODE -ne 0) { throw "GameLink input failed: $LASTEXITCODE" }
    }
    Start-Sleep -Milliseconds $SettleMs
    Assert-OwnDosboxSession
    $safeKey = $key -replace '[^a-z0-9_-]', '_'
    $shot = Join-Path $out ('step-{0:D2}-{1}.png' -f $i, $safeKey)
    & python $gameLink screenshot $shot
    if ($LASTEXITCODE -ne 0) { throw "GameLink screenshot failed: $LASTEXITCODE" }
    Write-Host ("[recon] saved {0}" -f $shot)
    Write-LogProgress ('step-{0:D2}-{1}' -f $i, $safeKey)
  }
  Write-Host ("[recon] RESULT: out={0}" -f $out)
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
