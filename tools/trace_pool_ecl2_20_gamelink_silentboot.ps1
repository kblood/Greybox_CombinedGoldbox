param(
  [string]$StageDir = 'build\runtime-pool-ecl2-20-swap-20260721',
  [Parameter(Mandatory)][string]$OutDir,
  [string]$ExpectedSaveSha256 = '8f944f055a6151b2a871a03ab41629959886879c2161804447eaa09852328619',
  [ValidateRange(0,5)][int]$TitleDismissKeys = 2,
  [ValidateRange(1,64)][int]$IdleChecks = 10,
  [ValidateRange(100,5000)][int]$IdlePollMs = 300,
  [ValidateRange(1,600)][int]$OverallTimeoutSec = 240,
  [ValidateRange(1,1800)][int]$ExclusivityWaitTimeoutSec = 600
)

# Pool of Radiance "SAVGAMA.DAT file-swap" silent-boot probe.
#
# Context (BUILD-QUEUE.md item 4 / docs/engine/research/gen1-dosbox-runtime-trace.md,
# "2026-07-21" section): every prior GameLink-driven attempt to reach the coherent
# ECL2.DAX#20 baseline injected an explicit 'L' -> slot-letter -> 'enter' key sequence
# to reach Pool's "LOAD WHICH GAME" prompt, and every one of those attempts produced a
# deterministic miss (host state stuck at area_ecl_member_id=0/archive_set=1, never the
# baseline's 20/2), even with title-dismissal timing eliminated as a cause. The
# remaining untested candidate this script exercises is that Pool's title-to-gameplay
# flow does NOT require any interactive Load menu at all -- i.e. it may auto-continue
# straight from whatever SAVGAMA.DAT (slot A) contains once the 2 static title screens
# are dismissed. `SAVGAMA.DAT` already decodes (independently, via
# tools/inspect_pool_save.py) to the same host state as the runtime-confirmed coherent
# baseline save (hash 8f944f05..., area_ecl_member_id=20/archive_set=2), just at a
# different pose -- so this script's stage swaps that exact byte content onto
# SAVGAMA.DAT (see the accompanying research-doc entry for the hash-locked swap
# procedure) and boots with ONLY the title-dismiss keys. No 'L', no slot letter, no
# Enter beyond title dismissal. If Pool auto-continues, host_state read after title
# dismissal should already show area_ecl_member_id=20/archive_set=2 with zero further
# input. If it does not, the read stays at whatever Pool's true idle/menu state is,
# which is itself a genuine (narrowing) negative result, not a bug in this script.
#
# Every hard operational rule from docs/engine/research/dosbox-x-gamelink-automation.md
# applies: GameLink-only input/screenshots, singleton-collision guard before every call,
# a halted guest must be RUN before keys are injected (handled by the probe's
# 'BPINT 21 42' + 'RUN' launch action), BPINT hooks software interrupts only.

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stage = (Resolve-Path (Join-Path $repo $StageDir)).Path
$out = Join-Path $repo $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
New-Item -ItemType Directory -Path $out -Force | Out-Null

$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$gameLink = Join-Path $repo 'tools\dosbox_gamelink.py'
$helperProject = Join-Path $repo 'tools\dosbox_debugger_input\DosboxDebuggerInput.csproj'
$helperDll = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'

$save = Join-Path $stage 'POOLRAD\SAVGAMA.DAT'
if (-not (Test-Path -LiteralPath $save -PathType Leaf)) { throw "missing save: $save" }
$saveHash = (Get-FileHash -LiteralPath $save -Algorithm SHA256).Hash.ToLowerInvariant()
if ($saveHash -ne $ExpectedSaveSha256) { throw "unexpected SAVGAMA.DAT hash (swap not applied?): $saveHash" }

& dotnet build $helperProject --configuration Release | Out-Null
if ($LASTEXITCODE -ne 0) { throw "debugger helper build failed: $LASTEXITCODE" }

function Invoke-DebuggerInput {
  param([string]$Command, [string]$Key, [switch]$SnapshotOnly, [string]$Label)
  $statusPath = Join-Path $out "$Label-status.json"
  $snapshotPath = Join-Path $out "$Label-console.txt"
  $args = @($helperDll, '--pid', $process.Id)
  if ($SnapshotOnly) { $args += '--snapshot-only' }
  elseif ($Key) { $args += @('--key', $Key) }
  else { $args += @('--command', $Command) }
  $args += @('--status', $statusPath, '--snapshot', $snapshotPath)
  & dotnet @args | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "debugger helper failed for $Label (exit $LASTEXITCODE)" }
  $status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
  if (-not $status.Success) { throw "debugger helper reported failure for $Label`: $($status.Error)" }
  return Get-Content -LiteralPath $snapshotPath -Raw
}

function Get-Stopped([string]$Snapshot) { return $Snapshot -notmatch '(?m)^\(Running\)\s*$' }

$stepCounter = 0

function Get-DosboxPids {
  return @(Get-CimInstance Win32_Process -Filter "Name='dosbox-x.exe'" -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty ProcessId)
}

function Wait-ExclusiveDosboxSlot {
  Write-Host '[pool-silentboot] waiting for an empty dosbox-x.exe process list before launching (GameLink singleton hazard)...'
  $deadline = [DateTime]::UtcNow.AddSeconds($ExclusivityWaitTimeoutSec)
  while ([DateTime]::UtcNow -lt $deadline) {
    $pids = Get-DosboxPids
    if ($pids.Count -eq 0) { return }
    Write-Host "[pool-silentboot] dosbox-x.exe already running (pid(s): $($pids -join ',')) -- waiting..."
    Start-Sleep -Seconds 5
  }
  throw "timed out waiting $ExclusivityWaitTimeoutSec s for an exclusive dosbox-x.exe slot"
}

function Assert-ExclusiveOwnership {
  $pids = Get-DosboxPids
  $foreign = @($pids | Where-Object { $_ -ne $process.Id })
  if ($foreign.Count -gt 0) {
    throw "GameLink CONTAMINATION: foreign dosbox-x.exe pid(s) detected ($($foreign -join ',')) while own pid is $($process.Id) -- aborting rather than trusting possibly cross-talked GameLink data"
  }
}

function Wait-Idle {
  $idleStreak = 0
  $deadline = [DateTime]::UtcNow.AddSeconds($OverallTimeoutSec)
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds $IdlePollMs
    if ($script:stepCounter % 10 -eq 0) { Assert-ExclusiveOwnership }
    $snap = Invoke-DebuggerInput -SnapshotOnly -Label ('poll-{0:D4}' -f $script:stepCounter)
    $script:stepCounter++
    if (-not (Get-Stopped $snap)) {
      $idleStreak++
      if ($idleStreak -ge $IdleChecks) { return $true }
      continue
    }
    $idleStreak = 0
    Invoke-DebuggerInput -Command 'RUN' -Label ('resume-{0:D4}' -f $script:stepCounter) | Out-Null
  }
  return $false
}

function Get-EclHostState {
  param([string]$Label)
  $snap = Invoke-DebuggerInput -SnapshotOnly -Label ('hoststate-regs-' + $Label)
  $dsMatch = [regex]::Match($snap, '\bDS=([0-9A-F]{4})\b')
  if (-not $dsMatch.Success) { return $null }
  $ds = $dsMatch.Groups[1].Value
  $areaPointerSnap = Invoke-DebuggerInput -Command ('D {0}:49D2' -f $ds) -Label ('hoststate-areaptr-' + $Label)
  $areaPointerBytes = @()
  foreach ($line in ($areaPointerSnap -split "`r?`n")) {
    $m = [regex]::Match($line, '^[0-9A-F]{4}:[0-9A-F]{8}\s+((?:[0-9A-F]{2}\s+){15}[0-9A-F]{2})\s')
    if ($m.Success) {
      foreach ($hex in ($m.Groups[1].Value -split '\s+')) { if ($hex) { $areaPointerBytes += [Convert]::ToByte($hex, 16) } }
    }
  }
  if ($areaPointerBytes.Length -lt 4) { return [ordered]@{ label = $Label; ds_segment = $ds; note = 'insufficient area-pointer bytes' } }
  $areaOffset = [int]$areaPointerBytes[0] -bor ([int]$areaPointerBytes[1] -shl 8)
  $areaSegment = [int]$areaPointerBytes[2] -bor ([int]$areaPointerBytes[3] -shl 8)
  $memberAddress = ($areaOffset + 0x01E4) -band 0xFFFF
  $memberSnap = Invoke-DebuggerInput -Command ('D {0:X4}:{1:X4}' -f $areaSegment, $memberAddress) -Label ('hoststate-member-' + $Label)
  $memberBytes = @()
  foreach ($line in ($memberSnap -split "`r?`n")) {
    $m = [regex]::Match($line, '^[0-9A-F]{4}:[0-9A-F]{8}\s+((?:[0-9A-F]{2}\s+){15}[0-9A-F]{2})\s')
    if ($m.Success) {
      foreach ($hex in ($m.Groups[1].Value -split '\s+')) { if ($hex) { $memberBytes += [Convert]::ToByte($hex, 16) } }
    }
  }
  $archiveSetSnap = Invoke-DebuggerInput -Command ('D {0}:5376' -f $ds) -Label ('hoststate-archive-' + $Label)
  $archiveSetBytes = @()
  foreach ($line in ($archiveSetSnap -split "`r?`n")) {
    $m = [regex]::Match($line, '^[0-9A-F]{4}:[0-9A-F]{8}\s+((?:[0-9A-F]{2}\s+){15}[0-9A-F]{2})\s')
    if ($m.Success) {
      foreach ($hex in ($m.Groups[1].Value -split '\s+')) { if ($hex) { $archiveSetBytes += [Convert]::ToByte($hex, 16) } }
    }
  }
  return [ordered]@{
    label = $Label
    ds_segment = $ds
    area_segment = ('{0:X4}' -f $areaSegment)
    area_offset = ('{0:X4}' -f $areaOffset)
    area_ecl_member_id = if ($memberBytes.Length -ge 1) { [int]$memberBytes[0] } else { $null }
    archive_set = if ($archiveSetBytes.Length -ge 1) { [int]$archiveSetBytes[0] } else { $null }
  }
}

$process = $null
try {
  Wait-ExclusiveDosboxSlot
  & $probe -DbxExe $dbx -GameDir $stage -DosWorkingDir 'POOLRAD' -Exe 'START.EXE' -OutDir $out `
    -Cycles 'fixed 25000' -GameLink -DebuggerAction @('BPINT 21 42', 'RUN') -NoActionScreenshots
  if (-not $?) { throw 'DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  Assert-ExclusiveOwnership
  Start-Sleep -Seconds 3
  Assert-ExclusiveOwnership

  $hostStateAtLaunch = Get-EclHostState -Label 'at-launch'

  # Phase 0 ONLY: dismiss Pool's 2 static title screens. No 'L', no slot letter, no
  # further Enter beyond this -- this is the entire point of the experiment.
  $titleDismissShots = @()
  for ($dismissIndex = 0; $dismissIndex -lt $TitleDismissKeys; $dismissIndex++) {
    Wait-Idle | Out-Null
    Assert-ExclusiveOwnership
    & python $gameLink press enter --pace 0.5
    if ($LASTEXITCODE -ne 0) { throw "title dismiss key $dismissIndex failed" }
    Assert-ExclusiveOwnership
    $shotPath = Join-Path $out ("phase0-dismiss-{0:D2}.png" -f $dismissIndex)
    & python $gameLink screenshot $shotPath
    $titleDismissShots += $shotPath
  }

  # Wait idle after the last title-dismiss key with NO further input, then read host
  # state. If Pool auto-continues from SAVGAMA.DAT, this is where it would show up.
  Wait-Idle | Out-Null
  Assert-ExclusiveOwnership
  & python $gameLink screenshot (Join-Path $out 'post-title-idle.png')
  $hostStatePostTitle = Get-EclHostState -Label 'post-title-idle'

  # Extra margin: wait one more full idle cycle in case the auto-continue (if any) is
  # itself gated behind a short additional load delay, then re-read.
  Wait-Idle | Out-Null
  Assert-ExclusiveOwnership
  & python $gameLink screenshot (Join-Path $out 'post-title-idle-2.png')
  $hostStatePostTitle2 = Get-EclHostState -Label 'post-title-idle-2'

  $targetReached = ($hostStatePostTitle.area_ecl_member_id -eq 20 -and $hostStatePostTitle.archive_set -eq 2) -or
    ($hostStatePostTitle2.area_ecl_member_id -eq 20 -and $hostStatePostTitle2.archive_set -eq 2)

  [ordered]@{
    schema_version = 1
    title = 'Pool of Radiance'
    experiment = 'SAVGAMA.DAT file-swap silent-boot probe (no L / slot / enter keys beyond title dismissal)'
    technique = 'DOSBox-X GameLink v4 for input/screenshots; process-owned debugger console for host-state reads (both focusless per docs/engine/research/dosbox-x-gamelink-automation.md)'
    stage_dir = $StageDir
    savgama_sha256 = $saveHash
    title_dismiss_keys = $TitleDismissKeys
    title_dismiss_screenshots = $titleDismissShots
    host_state_at_launch = $hostStateAtLaunch
    host_state_post_title_idle = $hostStatePostTitle
    host_state_post_title_idle_2 = $hostStatePostTitle2
    target_area_ecl_member_id = 20
    target_archive_set = 2
    auto_continue_target_reached = $targetReached
    exclusive_ownership_maintained = $true
    claim_boundary = 'proves whether Pool of Radiance auto-continues into the swapped SAVGAMA.DAT host state with zero interactive Load-menu input; does not by itself prove ECL dispatch, COMBAT, or resume'
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $out 'silentboot-trace.json') -Encoding utf8
  Write-Host "[pool-silentboot] auto_continue_target_reached=$targetReached out=$out"
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
