param(
  [Parameter(Mandatory)][string]$OutDir,
  [ValidateRange(1,1800)][int]$ExclusivityWaitTimeoutSec = 600
)

# Focused diagnostic: does a GameLink keypress become visible in the BIOS keyboard ring buffer
# (0040:001A head / 0040:001C tail, segment 0040 offsets 001E..003D for the 16-word ring) while
# the debugger CPU is confirmed HALTED at Pool's INT16 AH=1 poll breakpoint (1264:0306), or only
# after RUN is sent? This isolates whether "press while halted" (used by
# tools/trace_pool_ecl2_20_bpint16_paced.ps1's first attempt) is a valid injection point, before
# building a second pacing attempt around whichever answer this proves.

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$out = Join-Path $repo $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
New-Item -ItemType Directory -Path $out -Force | Out-Null

$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$gameLink = Join-Path $repo 'tools\dosbox_gamelink.py'
$helperProject = Join-Path $repo 'tools\dosbox_debugger_input\DosboxDebuggerInput.csproj'
$helperDll = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'
$gameDir = 'C:\Program Files (x86)\GOG Galaxy\Games\Pool of Radiance\POOLRAD'

& dotnet build $helperProject --configuration Release | Out-Null
if ($LASTEXITCODE -ne 0) { throw "debugger helper build failed: $LASTEXITCODE" }

function Get-DosboxPids {
  return @(Get-CimInstance Win32_Process -Filter "Name='dosbox-x.exe'" -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty ProcessId)
}
function Wait-ExclusiveDosboxSlot {
  $deadline = [DateTime]::UtcNow.AddSeconds($ExclusivityWaitTimeoutSec)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ((Get-DosboxPids).Count -eq 0) { return }
    Start-Sleep -Seconds 5
  }
  throw "timed out waiting for exclusive dosbox-x.exe slot"
}
function Assert-ExclusiveOwnership {
  $foreign = @((Get-DosboxPids) | Where-Object { $_ -ne $process.Id })
  if ($foreign.Count -gt 0) { throw "GameLink CONTAMINATION: foreign pid(s) $($foreign -join ',')" }
}
function Invoke-DebuggerInput {
  param([string]$Command, [switch]$SnapshotOnly, [string]$Label)
  $statusPath = Join-Path $out "$Label-status.json"
  $snapshotPath = Join-Path $out "$Label-console.txt"
  $args = @($helperDll, '--pid', $process.Id)
  if ($SnapshotOnly) { $args += '--snapshot-only' } else { $args += @('--command', $Command) }
  $args += @('--status', $statusPath, '--snapshot', $snapshotPath)
  & dotnet @args | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "debugger helper failed for $Label" }
  $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
  if (-not $status.Success) { throw "debugger helper reported failure for $Label`: $($status.Error)" }
  return Get-Content -LiteralPath $snapshotPath -Raw
}
function Get-Stopped([string]$Snapshot) { return $Snapshot -notmatch '(?m)^\(Running\)\s*$' }
function Get-Ah([string]$Snapshot) {
  $m = [regex]::Match($Snapshot, '\bEAX=([0-9A-F]{8})\b')
  if (-not $m.Success) { return $null }
  return (([Convert]::ToUInt32($m.Groups[1].Value, 16)) -shr 8) -band 0xFF
}
function Get-KbBuffer([string]$Label) {
  $snap = Invoke-DebuggerInput -Command 'D 0040:001A' -Label $Label
  return $snap
}

$process = $null
try {
  Wait-ExclusiveDosboxSlot
  & $probe -DbxExe $dbx -GameDir $gameDir -Exe 'START.EXE' -OutDir $out `
    -Cycles 'fixed 25000' -GameLink -ExtraSdlConf 'mouse_emulation=always' `
    -DebuggerAction @('BPINT 16 1', 'RUN') -NoActionScreenshots
  if (-not $?) { throw 'DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  Assert-ExclusiveOwnership
  Start-Sleep -Seconds 2
  Assert-ExclusiveOwnership

  # Confirm halted at the anchor.
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  $confirmed = $false
  while ([DateTime]::UtcNow -lt $deadline) {
    $snap = Invoke-DebuggerInput -SnapshotOnly -Label 'wait-anchor'
    if ((Get-Stopped $snap) -and (Get-Ah $snap) -eq 1) { $confirmed = $true; break }
    if (-not (Get-Stopped $snap)) { Start-Sleep -Milliseconds 150; continue }
    Invoke-DebuggerInput -Command 'RUN' -Label 'resume-wait-anchor' | Out-Null
  }
  if (-not $confirmed) { throw 'never confirmed at anchor' }

  $bufBeforePress = Get-KbBuffer 'buf-before-press-while-halted'
  Assert-ExclusiveOwnership
  & python $gameLink press enter --pace 0.2
  if ($LASTEXITCODE -ne 0) { throw 'press failed' }
  Assert-ExclusiveOwnership
  $bufAfterPressStillHalted = Get-KbBuffer 'buf-after-press-still-halted'

  # Now resume and immediately (no sleep) check again.
  Invoke-DebuggerInput -Command 'RUN' -Label 'run-after-press' | Out-Null
  $bufImmediatelyAfterRun = Get-KbBuffer 'buf-immediately-after-run'
  Start-Sleep -Milliseconds 500
  $snapAfterRun = Invoke-DebuggerInput -SnapshotOnly -Label 'snap-after-run-settle'
  $bufAfterRunSettle = Get-KbBuffer 'buf-after-run-settle'

  [ordered]@{
    schema_version = 1
    title = 'Pool GameLink keypress delivery-timing probe'
    anchor = '1264:0306 INT16 AH=1'
    buffer_before_press_while_halted = $bufBeforePress
    buffer_after_press_still_halted = $bufAfterPressStillHalted
    buffer_immediately_after_run = $bufImmediatelyAfterRun
    stopped_after_run_settle = Get-Stopped $snapAfterRun
    ah_after_run_settle = Get-Ah $snapAfterRun
    buffer_after_run_settle = $bufAfterRunSettle
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $out 'keybuffer-probe-trace.json') -Encoding utf8
  Write-Host "[pool-keybuffer-probe] done, out=$out"
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
