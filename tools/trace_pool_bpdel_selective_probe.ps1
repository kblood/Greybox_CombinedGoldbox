param(
  [Parameter(Mandatory)][string]$OutDir,
  [ValidateRange(1,1800)][int]$ExclusivityWaitTimeoutSec = 600
)

# Diagnostic-only probe (Pool of Radiance route-completion round, 2026-07-22): does DOSBox-X's
# debugger support SELECTIVE breakpoint deletion (delete only one of several simultaneously
# armed breakpoints), and does a breakpoint armed alongside BPINT 16 1 at the very first
# pristine post-launch halt survive being read back via BPLIST after that first halt?
#
# Motivation: docs/engine/research/gen1-dosbox-runtime-trace.md's 2026-07-21 entry proved (a)
# injecting a GameLink key while the CPU is halted at an armed breakpoint silently drops the
# key (fixed by inject-only-while-free-running), and (b) arming a NEW breakpoint from a
# genuinely free-running state (zero breakpoints already active) is never serviced even though
# the arm command's own status.json reports success. Both findings block the obvious "confirm
# anchor once, delete, freerun for title+load, then arm a NEW target breakpoint for the
# movement+search phase" design used by every attempt so far.
#
# Untested idea this probe checks: arm BOTH the throwaway BPINT 16 1 anchor AND the real target
# breakpoint (operand parser, GAME.OVR:0x74D3 route-time 30CF:0000) together, at the SAME
# pristine first halt where arming is already proven reliable, then selectively delete only the
# BPINT16 entry (keeping the target breakpoint armed) so title/load pacing can go fully
# free-running (as v2 already proved works) while the target breakpoint quietly survives,
# dormant, until the CPU naturally reaches it later -- without ever needing a second arm from a
# free-running state.
#
# This script does not attempt any route/movement; it only characterizes debugger command
# syntax and breakpoint survival. Read-only against the retail GOG install (no stage needed;
# only observes behavior up to and shortly after the first title-idle halt).

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
  Write-Host '[pool-bpdel-probe] waiting for an empty dosbox-x.exe process list before launching...'
  $deadline = [DateTime]::UtcNow.AddSeconds($ExclusivityWaitTimeoutSec)
  while ([DateTime]::UtcNow -lt $deadline) {
    $pids = Get-DosboxPids
    if ($pids.Count -eq 0) { return }
    Write-Host "[pool-bpdel-probe] dosbox-x.exe already running (pid(s): $($pids -join ',')) -- waiting..."
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
$results = [ordered]@{}
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

  # Poll for the first confirmed halt (should be the BPINT16 title-idle anchor).
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  $firstHaltSnap = $null
  while ([DateTime]::UtcNow -lt $deadline) {
    $snap = Invoke-DebuggerInput -SnapshotOnly -Label 'poll-first-halt'
    if (Get-Stopped $snap) { $firstHaltSnap = $snap; break }
    Start-Sleep -Milliseconds 150
  }
  if (-not $firstHaltSnap) { throw 'never observed a first halt' }
  $results.first_halt_confirmed = $true
  $results.first_halt_cs_ip = [regex]::Match($firstHaltSnap, '\bCS=([0-9A-F]{4})\s+EIP=([0-9A-F]{8})\b').Value

  # Arm the SECOND breakpoint (operand parser, route-time candidate) while still confirmed halted.
  Invoke-DebuggerInput -Command 'BP 30CF:0000' -Label 'arm-operand-parser' | Out-Null
  $listAfterBothArmed = Invoke-DebuggerInput -Command 'BPLIST' -Label 'list-both-armed'
  $results.bplist_both_armed_raw = $listAfterBothArmed

  # Try selective deletion of just the BPINT16 entry. Try a few plausible syntaxes in order,
  # checking BPLIST after each, stopping at the first one that removes BPINT16 but keeps the
  # operand-parser BP.
  $syntaxAttempts = @('BPDEL 0', 'BPDEL 1', 'BPDEL 16', 'BPINTDEL 16')
  $selectiveResult = $null
  foreach ($syntax in $syntaxAttempts) {
    $beforeSnap = Invoke-DebuggerInput -Command 'BPLIST' -Label ("before-$($syntax -replace '[^A-Za-z0-9]','_')")
    Invoke-DebuggerInput -Command $syntax -Label ("try-$($syntax -replace '[^A-Za-z0-9]','_')") | Out-Null
    $afterSnap = Invoke-DebuggerInput -Command 'BPLIST' -Label ("after-$($syntax -replace '[^A-Za-z0-9]','_')")
    $stillHasInt16 = $afterSnap -match 'INT.*16|BPINT'
    $stillHasOperand = $afterSnap -match '30CF|0000'
    $entry = [ordered]@{
      syntax = $syntax
      bplist_before = $beforeSnap
      bplist_after = $afterSnap
      still_has_bpint16 = [bool]$stillHasInt16
      still_has_operand_bp = [bool]$stillHasOperand
    }
    if (-not $selectiveResult) { $selectiveResult = [Collections.Generic.List[object]]::new() }
    $selectiveResult.Add($entry) | Out-Null
    if (-not $stillHasInt16 -and $stillHasOperand) {
      $results.selective_delete_syntax_found = $syntax
      break
    }
  }
  $results.selective_delete_attempts = $selectiveResult

  # Clean shutdown: delete everything, confirm no further action needed.
  Invoke-DebuggerInput -Command 'BPDEL *' -Label 'final-cleanup' | Out-Null
  $finalList = Invoke-DebuggerInput -Command 'BPLIST' -Label 'final-list'
  $results.final_bplist_raw = $finalList

  $results | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $out 'bpdel-selective-probe.json') -Encoding utf8
  Write-Host "[pool-bpdel-probe] selective_delete_syntax_found=$($results.selective_delete_syntax_found) out=$out"
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
