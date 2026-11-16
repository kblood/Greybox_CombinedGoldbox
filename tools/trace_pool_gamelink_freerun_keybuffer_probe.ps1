param(
  [Parameter(Mandatory)][string]$OutDir,
  [ValidateRange(1,1800)][int]$ExclusivityWaitTimeoutSec = 600
)

# Control test for the hypothesis raised by tools/trace_pool_gamelink_keybuffer_probe.ps1's
# result (BIOS keyboard ring buffer head/tail NEVER moved from 0x1E/0x1E across
# press-while-halted, run+immediate-check, and run+500ms-settle, when the CPU was held by the
# very high-frequency 1264:0306 INT16 AH=1 breakpoint): that an ALWAYS-ARMED, per-loop-iteration
# breakpoint halts DOSBox-X's entire host main loop (not just the virtual CPU), which starves
# GameLink's own shared-memory keypress delivery (serviced by that same main loop) -- unifying
# this finding with the pre-existing "GameLink screenshots are all-zero-alpha in every minimized
# Pool probe window" issue under one root cause.
#
# This control launches with NO breakpoint armed at all (genuinely free-running the entire
# time, matching how Secret's and every other successful GameLink script in this project
# actually presses keys -- after a RUN with no immediately-refiring breakpoint in the way),
# sleeps a real 2s window, presses Enter, sleeps another real 1s window, THEN arms a breakpoint
# for the FIRST time purely to halt the CPU so the keyboard buffer can be inspected via the
# debugger console. If the buffer shows a non-empty head/tail delta at that point, the key was
# delivered during genuine free-running -- confirming the hypothesis and giving a concrete
# engineering fix (don't hold a tight per-iteration breakpoint armed during injection windows).
# If it is still empty, GameLink input delivery has some other, Pool-specific problem
# unrelated to breakpoint-induced main-loop starvation.

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

$process = $null
try {
  Wait-ExclusiveDosboxSlot
  # No breakpoint armed at launch -- genuinely free-running the entire injection window.
  & $probe -DbxExe $dbx -GameDir $gameDir -Exe 'START.EXE' -OutDir $out `
    -Cycles 'fixed 25000' -GameLink -ExtraSdlConf 'mouse_emulation=always' `
    -DebuggerAction @('RUN') -NoActionScreenshots
  if (-not $?) { throw 'DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  Assert-ExclusiveOwnership
  Start-Sleep -Seconds 2
  Assert-ExclusiveOwnership

  Start-Sleep -Seconds 2
  Assert-ExclusiveOwnership

  # Bracket the press tightly: baseline immediately before, then a rapid burst of peeks
  # immediately after with no sleep in between, to catch a transient non-empty buffer even if
  # the game consumes the key within milliseconds. GameLink peek reads the live shared-memory
  # image directly (not the debugger console, which is confirmed stale/cached while the CPU is
  # genuinely running -- a first attempt at this control test read back cc=1, CS:IP=1796:0014,
  # the pre-boot state from the very first launch stop, not live data).
  $peekBefore = (& python $gameLink peek '0x41A' 4 | ConvertFrom-Json).hex
  & python $gameLink press enter --pace 0.2
  if ($LASTEXITCODE -ne 0) { throw 'press failed' }
  Assert-ExclusiveOwnership
  $burst = @()
  for ($i = 0; $i -lt 15; $i++) {
    $burst += (& python $gameLink peek '0x41A' 4 | ConvertFrom-Json).hex
  }
  Start-Sleep -Seconds 1
  $peekSettled = (& python $gameLink peek '0x41A' 4 | ConvertFrom-Json).hex

  [ordered]@{
    schema_version = 1
    title = 'Pool GameLink freerun keypress delivery control test'
    method = 'no breakpoint armed during the press window; live reads via GameLink peek (not the debugger console, which is confirmed stale while running), bracketing the press tightly to catch a transient non-empty buffer'
    kb_head_tail_before_press = $peekBefore
    kb_head_tail_burst_after_press = $burst
    kb_head_tail_settled_1s_after_press = $peekSettled
    claim_boundary = 'BIOS keyboard ring buffer head (0040:001A) and tail (0040:001C) words at physical 0x41A; equal head/tail means empty buffer, unequal means a scancode is queued; any transient inequality in the burst proves delivery even if later consumed'
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $out 'freerun-keybuffer-trace.json') -Encoding utf8
  Write-Host "[pool-freerun-keybuffer] done, out=$out"
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
