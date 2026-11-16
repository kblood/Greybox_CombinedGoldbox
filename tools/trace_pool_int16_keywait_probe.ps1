param(
  [Parameter(Mandatory)][string]$OutDir,
  [ValidateRange(1,120)][int]$PollIterations = 40,
  [ValidateRange(50,3000)][int]$PollMs = 300,
  [ValidateRange(1,1800)][int]$ExclusivityWaitTimeoutSec = 600
)

# Diagnostic probe (BUILD-QUEUE items 110/147/248, breakpoint-anchored pacing round):
# characterize what, if anything, Pool of Radiance calls to wait for keyboard input while
# idling at its title screen, as a candidate anchor for breakpoint-paced key injection --
# replacing the idle-streak Wait-Idle detector that docs/engine/research/
# gen1-dosbox-runtime-trace.md's 2026-07-21 "sharper root cause" entry proved can NEVER fire
# for Pool (a continuous INT 21h AH=42 LSEEK loop runs even while genuinely idle, so no
# idle-streak window is ever observed).
#
# Method: arm BPINT 16 (all AH values, no filter -- unlike the existing BPINT 21 42 anchor)
# at true process launch (debugger starts genuinely paused pre-boot, so registration is
# guaranteed valid per the documented "typed while running can silently fail" finding), let
# the guest RUN, then poll BPLIST/console snapshots in a bounded loop, logging every stop's
# CS:IP and the AH value extracted from EAX before resuming. If INT 16h fires repeatedly while
# sitting at the title screen, that is a genuine anchor for breakpoint-paced key injection
# (inject the key exactly when stopped there, instead of waiting for an idle streak that never
# happens). If it never fires, that is an equally real negative, narrowing the search away from
# INT 16h and toward a different candidate (address-specific CS:IP breakpoint or fixed-delay
# pacing against the LSEEK loop's own period).
#
# Read-only against the GOG install: no save is loaded, no protection-bypass stage is needed,
# because this only observes the title-idle window before any Play/Load input is sent.

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$out = Join-Path $repo $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
New-Item -ItemType Directory -Path $out -Force | Out-Null

$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$gameDir = 'C:\Program Files (x86)\GOG Galaxy\Games\Pool of Radiance\POOLRAD'
$helperProject = Join-Path $repo 'tools\dosbox_debugger_input\DosboxDebuggerInput.csproj'
$helperDll = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'

& dotnet build $helperProject --configuration Release | Out-Null
if ($LASTEXITCODE -ne 0) { throw "debugger helper build failed: $LASTEXITCODE" }

function Get-DosboxPids {
  return @(Get-CimInstance Win32_Process -Filter "Name='dosbox-x.exe'" -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty ProcessId)
}

function Wait-ExclusiveDosboxSlot {
  Write-Host '[pool-int16-diag] waiting for an empty dosbox-x.exe process list before launching (GameLink singleton hazard)...'
  $deadline = [DateTime]::UtcNow.AddSeconds($ExclusivityWaitTimeoutSec)
  while ([DateTime]::UtcNow -lt $deadline) {
    $pids = Get-DosboxPids
    if ($pids.Count -eq 0) { return }
    Write-Host "[pool-int16-diag] dosbox-x.exe already running (pid(s): $($pids -join ',')) -- waiting..."
    Start-Sleep -Seconds 5
  }
  throw "timed out waiting $ExclusivityWaitTimeoutSec s for an exclusive dosbox-x.exe slot"
}

function Assert-ExclusiveOwnership {
  $pids = Get-DosboxPids
  $foreign = @($pids | Where-Object { $_ -ne $process.Id })
  if ($foreign.Count -gt 0) {
    throw "GameLink CONTAMINATION: foreign dosbox-x.exe pid(s) detected ($($foreign -join ',')) while own pid is $($process.Id) -- aborting"
  }
}

function Invoke-DebuggerInput {
  param([string]$Command, [switch]$SnapshotOnly, [string]$Label)
  $statusPath = Join-Path $out "$Label-status.json"
  $snapshotPath = Join-Path $out "$Label-console.txt"
  $args = @($helperDll, '--pid', $process.Id)
  if ($SnapshotOnly) { $args += '--snapshot-only' } else { $args += @('--command', $Command) }
  $args += @('--status', $statusPath, '--snapshot', $snapshotPath)
  & dotnet @args | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "debugger helper failed for $Label (exit $LASTEXITCODE)" }
  $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
  if (-not $status.Success) { throw "debugger helper reported failure for $Label`: $($status.Error)" }
  return Get-Content -LiteralPath $snapshotPath -Raw
}

function Get-Stopped([string]$Snapshot) { return $Snapshot -notmatch '(?m)^\(Running\)\s*$' }

$process = $null
try {
  Wait-ExclusiveDosboxSlot
  & $probe -DbxExe $dbx -GameDir $gameDir -Exe 'START.EXE' -OutDir $out `
    -Cycles 'fixed 25000' -GameLink -ExtraSdlConf 'mouse_emulation=always' `
    -DebuggerAction @('BPINT 16', 'RUN') -NoActionScreenshots
  if (-not $?) { throw 'DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  Assert-ExclusiveOwnership
  Start-Sleep -Seconds 3
  Assert-ExclusiveOwnership

  $hits = New-Object 'System.Collections.Generic.List[object]'
  $stopCount = 0
  for ($i = 0; $i -lt $PollIterations; $i++) {
    Start-Sleep -Milliseconds $PollMs
    if ($i % 10 -eq 0) { Assert-ExclusiveOwnership }
    $snap = Invoke-DebuggerInput -SnapshotOnly -Label ('poll-{0:D3}' -f $i)
    $stopped = Get-Stopped $snap
    if ($stopped) {
      $stopCount++
      $csIp = [regex]::Match($snap, '\bCS=([0-9A-F]{4})\s+EIP=([0-9A-F]{8})\b')
      $eax = [regex]::Match($snap, '\bEAX=([0-9A-F]{8})\b')
      $ah = if ($eax.Success) { (([Convert]::ToUInt32($eax.Groups[1].Value,16)) -shr 8) -band 0xFF } else { $null }
      $hits.Add([ordered]@{
        index = $i
        cs = if ($csIp.Success) { $csIp.Groups[1].Value } else { $null }
        ip = if ($csIp.Success) { $csIp.Groups[2].Value } else { $null }
        eax = if ($eax.Success) { $eax.Groups[1].Value } else { $null }
        ah = $ah
        console = "poll-$('{0:D3}' -f $i)-console.txt"
      }) | Out-Null
      Invoke-DebuggerInput -Command 'RUN' -Label ('resume-{0:D3}' -f $i) | Out-Null
    }
  }

  [ordered]@{
    schema_version = 1
    title = 'Pool of Radiance INT 16h keyboard-wait diagnostic'
    purpose = 'characterize whether INT 16h fires during title-idle, as a breakpoint-anchor candidate replacing the idle-streak detector proven broken for Pool (continuous INT 21h AH=42 LSEEK loop)'
    poll_iterations = $PollIterations
    poll_interval_ms = $PollMs
    stops_observed = $stopCount
    hits = $hits
    claim_boundary = 'observational only; does not by itself prove a key-injection anchor works until a full pace-and-inject run is attempted'
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $out 'int16-diag-trace.json') -Encoding utf8
  Write-Host "[pool-int16-diag] stops_observed=$stopCount out=$out"
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
