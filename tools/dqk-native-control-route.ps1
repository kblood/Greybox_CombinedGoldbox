# tools/dqk-native-control-route.ps1 — CoK M4 fidelity plan, round 12 (cok-m4-fidelity-plan.md
# §20). The differential-control experiment rounds 5/6/8/10/11 all wanted but never got: boot
# the SAME automation route (Load Saved Game -> journal-word protection -> Begin Adventuring)
# against the UNTOUCHED, UNMODIFIED "The Dark Queen of Krynn" GOG dir (copied to a build/
# scratch mount, never the shared working-tree source dir) instead of the CoK-ported build, then
# wander for a bounded number of steps watching for a NATIVE, DQK-authored wandering/random
# encounter to fire, and confirm it resolves cleanly (no "DISK READ ERROR" freeze).
#
# Reuses the exact boot/journal-protection machinery proven in
# tools/cok-m4-memory-signature-route.ps1 (rounds 9/10) verbatim -- same DQK.EXE, same journal
# mechanism (DQK's own copy protection, not CoK content) -- only Phase 7 (movement) differs: a
# longer, varied wander loop instead of the CoK-route's exact 2-key scripted path to area 34's
# known crash cell, since here we don't have (and don't need) a specific target cell -- any
# native wandering encounter answers the control question.
#
# Also carries the round-9/10 live memory-signature-search technique (search for
# combat_setup_entry / add_combatant_to_active_roster's known file-offset byte signatures in the
# guest's live memory) as a bonus data point: if a native encounter fires and either signature
# IS resident/hit at that moment, that is itself informative for the "which routine handles
# wandering encounters" question rounds 10/11 left open.
#
# Usage:
#   pwsh tools/dqk-native-control-route.ps1 -MountDir build/dqk-native-control `
#     -OutDir build/dqk-native-control-run1 -MaxSteps 30
#
# To trace an authentic in-progress save, first make a disposable `build/` mount and overlay the
# corresponding `SAVGAM?.QSV` (and its vault, when present) into both the mount root and `SAVE/`.
# Then select that slot explicitly, for example `-SaveSlot B`.  The script never writes to the
# source game directory; guest save writes are confined to the supplied mount.

param(
  [Parameter(Mandatory)][string]$MountDir,
  [Parameter(Mandatory)][string]$OutDir,
  [string]$JournalTxt = "C:\Modding\GoldBox\build\dqk_journal.txt",
  [string]$CodesTxt = "C:\Modding\GoldBox\build\dqk_codes.txt",
  [ValidateRange(1,120)][int]$MaxSteps = 30,
  [ValidatePattern('^[A-Ja-j]$')][string]$SaveSlot = 'A',
  [ValidateSet('Attack','Creep','Leave')][string]$EncounterChoice = 'Attack',
  [ValidateSet('Left','Right')][string]$CreepDirection = 'Left',
  [ValidateSet('Attack','Creep')][string]$FollowupEncounterChoice = 'Creep',
  [ValidateSet('Jump','Wait','Attack')][string]$PortalChoice = 'Attack',
  [ValidateSet('Throw','Wait','Attack')][string]$StoneChoice = 'Throw',
  # `Legacy` retains the historical row/click/down/Enter diagnostic sequence.  Every other
  # value is deliberately ONE input in a fresh run: the WHO picker is an unresolved original
  # form protocol, so a later key/click must never be credited to an earlier candidate.
  [ValidateSet('Legacy','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Down','InitialA','Enter','RowClick','SelectClick')][string]$PickerProbe = 'Legacy',
  # A deliberately paired diagnostic, distinct from PickerProbe's one-input protocol: trace one
  # selector movement and then one confirm attempt through the relocated overlay-8 WHO handler.
  # It never tries alternative keys/clicks and records both breakpoint stops independently.
  [switch]$TraceWhoCallback,
  # Split the expensive authentic route from the bounded form-dispatch capture. `Full` is
  # the historical self-cleaning behavior. `Launch` is deliberately inert unless -KeepAlive
  # is also supplied; it stops at the visible WHO form and records the exact owned PID for
  # a later `Attach` or `Reap` invocation. `Attach` captures one Down edge and always reaps.
  # `Dispatch` proves that edge reaches the generic form dispatcher. `Confirm` continues the
  # same authentic form with exactly one Enter confirmation, proves both dispatcher returns,
  # captures the resulting original-DOS state, and then reaps the owned process.
  [ValidateSet('Full','Launch','Attach','Dispatch','Confirm','Reap')][string]$Stage = 'Full',
  [switch]$KeepAlive,
  [ValidateRange(30,3600)][int]$HandoffMaxAgeSec = 900,
  [ValidateRange(1,60)][int]$StopPollTriesPerKey = 12,
  [ValidateRange(50,2000)][int]$StopPollMs = 250,
  [ValidateRange(1,1800)][int]$ExclusivityWaitTimeoutSec = 600,
  [string]$DumpSizeHex = '0xA0000'
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$mount = Resolve-Path (Join-Path $repo $MountDir)
$SaveSlot = $SaveSlot.ToUpperInvariant()
$EncounterKey = $EncounterChoice.Substring(0, 1).ToLowerInvariant()
$CreepDirectionKey = $CreepDirection.Substring(0, 1).ToLowerInvariant()
$FollowupEncounterKey = $FollowupEncounterChoice.Substring(0, 1).ToLowerInvariant()
$PortalChoiceKey = $PortalChoice.Substring(0, 1).ToLowerInvariant()
$StoneChoiceKey = $StoneChoice.Substring(0, 1).ToLowerInvariant()
$out = Join-Path $repo $OutDir
if ($Stage -eq 'Launch' -and -not $KeepAlive) {
  throw 'Launch intentionally requires -KeepAlive; use Full for the historical self-cleaning route.'
}
if ($Stage -in @('Attach','Dispatch','Confirm','Reap')) {
  if (-not (Test-Path -LiteralPath $out)) { throw "handoff output directory does not exist: $out" }
} else {
  if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
  New-Item -ItemType Directory -Path $out -Force | Out-Null
}
# DOSBox-X debugger `MEMDUMPBIN` has no output-path operand. Make the route output directory
# the inherited working directory for the DOSBox-X process so launch and later Attach agree on
# where that fixed-name file belongs, including when Launch was started by Task Scheduler.
# The isolated WHO diff itself deliberately does *not* use MEMDUMPBIN: that debugger command is
# a no-op while the guest is running, whereas GameLink has a safe read-only full-RAM checkpoint
# primitive that is valid at the visible form.  The debugger remains reserved for the post-input
# INT16 stop and its return stack.
Set-Location -LiteralPath $out

$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$gameLink = Join-Path $repo 'tools\dosbox_gamelink.py'
$signatureScan = Join-Path $repo 'tools\gamelink_signature_scan.py'
$helperProject = Join-Path $repo 'tools\dosbox_debugger_input\DosboxDebuggerInput.csproj'
$helperDll = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'
$fastClickScript = Join-Path $out '_fast_play_click.py'
. (Join-Path $repo 'tools\dosbot\lib.ps1')  # Invoke-Vision only

if (-not (Test-Path $dbx)) { throw "DOSBox-X build not found: $dbx" }
if (-not (Test-Path $helperDll)) {
  & dotnet build $helperProject --configuration Release
  if ($LASTEXITCODE -ne 0) { throw "debugger helper build failed: $LASTEXITCODE" }
}

# --- Reference signatures (same file offsets as rounds 9/10 -- this mount runs byte-identical
# unmodified retail DQK.EXE, so the file offsets are trivially valid here too). --------------
$dqkExePath = Join-Path $mount 'DQK.EXE'
if (-not (Test-Path $dqkExePath)) { throw "DQK.EXE not found under mount: $dqkExePath" }
$dqkBytes = [IO.File]::ReadAllBytes($dqkExePath)
function Get-Sig([int]$fileOffset, [int]$len) { return $dqkBytes[$fileOffset..($fileOffset + $len - 1)] }
$whoHandlerSigHex = ((Get-Sig 0x433B0 16 | ForEach-Object { '{0:X2}' -f $_ }) -join '')
# The full raw handler signature contains relocated far-call operands and correctly has no live
# match.  This immediate/prologue window precedes the first relocation and uniquely identifies
# the handler's actual overlay-8 entry in a live RAM scan.
$whoHandlerPrefixHex = ((Get-Sig 0x433B0 5 | ForEach-Object { '{0:X2}' -f $_ }) -join '')
$sigTargets = @(
  [ordered]@{ name = 'combat_setup_entry'; file_offset = 0x356DC; full = (Get-Sig 0x356DC 96); prefix_len = 16 }
  [ordered]@{ name = 'add_combatant_to_active_roster'; file_offset = 0x359E6; full = (Get-Sig 0x359E6 96); prefix_len = 16 }
)
foreach ($t in $sigTargets) {
  $t.prefix = $t.full[0..($t.prefix_len - 1)]
  $t.full_hex = (($t.full | ForEach-Object { '{0:X2}' -f $_ }) -join '')
  $t.prefix_hex = (($t.prefix | ForEach-Object { '{0:X2}' -f $_ }) -join '')
}
$sigTargetsForPy = $sigTargets | ForEach-Object { [ordered]@{ name = $_.name; file_offset = $_.file_offset; prefix_hex = $_.prefix_hex; full_hex = $_.full_hex } }
$sigTargetsJsonPath = Join-Path $out 'signature-targets.json'
$sigTargetsForPy | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $sigTargetsJsonPath -Encoding utf8
$searchPy = Join-Path $out '_search_signatures.py'
@'
import json, sys
mem_path, targets_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
with open(mem_path, 'rb') as f:
    mem = f.read()
with open(targets_path, 'r') as f:
    targets = json.load(f)
results = []
for t in targets:
    prefix = bytes.fromhex(t['prefix_hex'])
    matches = []
    start = 0
    while True:
        idx = mem.find(prefix, start)
        if idx < 0:
            break
        matches.append({'linear_offset': idx, 'linear_offset_hex': f'{idx:06X}'})
        start = idx + 1
    results.append({'name': t['name'], 'file_offset': t['file_offset'], 'match_count': len(matches), 'matches': matches})
with open(out_path, 'w') as f:
    json.dump(results, f, indent=2)
print(json.dumps(results, indent=2))
'@ | Set-Content -LiteralPath $searchPy -Encoding utf8

function Get-DosboxPids {
  # Treat every DOSBox-family executable as an exclusivity participant, not only DOSBox-X.
  # Another repository may launch DOSBox Staging while this long route is running; even if it
  # does not expose GameLink, this probe must stop rather than risk cross-session attribution.
  return @(
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match '(?i)^dosbox.*\.exe$' } |
      Select-Object -ExpandProperty ProcessId
  )
}
function Wait-ExclusiveDosboxSlot {
  Write-Host '[dqk-native-ctrl] waiting for an empty DOSBox-family process list (exclusive native-runtime evidence)...'
  $deadline = [DateTime]::UtcNow.AddSeconds($ExclusivityWaitTimeoutSec)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ((Get-DosboxPids).Count -eq 0) { return }
    Start-Sleep -Seconds 5
  }
  throw "timed out waiting $ExclusivityWaitTimeoutSec s for an exclusive DOSBox-family slot"
}
function Assert-ExclusiveOwnership {
  $foreign = @(Get-DosboxPids | Where-Object { $_ -ne $process.Id })
  if ($foreign.Count -gt 0) { throw "native-runtime CONTAMINATION: foreign DOSBox-family pid(s) ($($foreign -join ',')) while own pid is $($process.Id)" }
}

$dbgStep = 0
function Invoke-DebuggerInput {
  param([string]$Command, [switch]$SnapshotOnly, [string]$Label)
  if (-not $Label) { $Label = "dbg{0:D5}" -f $script:dbgStep }
  $script:dbgStep++
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
function Get-Reg([string]$Snapshot, [string]$Name) {
  $m = [regex]::Match($Snapshot, '\b' + $Name + '=([0-9A-Fa-f]+)\b')
  if (-not $m.Success) { return $null }
  return [Convert]::ToUInt32($m.Groups[1].Value, 16)
}
function Get-CsIp([string]$Snapshot) {
  $cs = Get-Reg $Snapshot 'CS'; $eip = Get-Reg $Snapshot 'EIP'
  if ($null -eq $cs -or $null -eq $eip) { return $null }
  $ip = $eip -band 0xFFFF
  return [ordered]@{ cs = $cs; ip = $ip; phys = ($cs * 16 + $ip) }
}

function Save-ViewablePng([string]$rawPng) {
  $viewPng = [System.IO.Path]::ChangeExtension($rawPng, $null) + '-view.png'
  & python -c @"
from PIL import Image
im = Image.open(r'$rawPng').convert('RGBA')
r,g,b,a = im.split()
Image.merge('RGB',(r,g,b)).save(r'$viewPng')
"@ 2>$null | Out-Null
}
$timeline = [Collections.Generic.List[object]]::new()
function Shoot([string]$name) {
  Assert-ExclusiveOwnership
  $png = Join-Path $out "$name.png"
  & python $gameLink screenshot $png | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host "[dqk-native-ctrl] WARN: screenshot failed for $name"; return $null }
  Save-ViewablePng $png
  $rec = $null
  try {
    $v = Invoke-Vision -Png $png
    $rec = [pscustomobject]@{ name = $name; screen = $v.screen; text = "$($v.visible_text)"; png = "$name.png" }
    Write-Host ("  [{0,-18}] {1,-12} | {2}" -f $name, $v.screen, $rec.text)
  } catch {
    Write-Host "  [$name] (vision read unavailable: $($_.Exception.Message))"
    $rec = [pscustomobject]@{ name = $name; screen = 'unknown'; text = ''; png = "$name.png" }
  }
  $timeline.Add($rec) | Out-Null
  return $rec
}
function Press([string[]]$Keys, [double]$Pace = 0.3, [double]$Hold = 0.15) {
  Assert-ExclusiveOwnership
  foreach ($k in $Keys) {
    & python $gameLink press $k --hold $Hold --pace $Pace | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "GameLink press failed for: $k" }
  }
}
function Resume-IfStopped([string]$Label) {
  # BPINT 16 0 stays armed for the whole post-title-screen session (see the calibration
  # comment above) -- DQK's own blocking keyboard-read call halts the debugger the instant it
  # is invoked, which can land exactly while we are about to send a typed character. A halted
  # guest silently drops queued GameLink input (documented project-level gotcha), so poll once
  # and RUN before every keypress here rather than assuming the guest is already running.
  $snap = Invoke-DebuggerInput -SnapshotOnly -Label $Label
  if (Get-Stopped $snap) { Invoke-DebuggerInput -Command 'RUN' -Label "$Label-resume" | Out-Null; Start-Sleep -Milliseconds 50 }
}
function Type-WordAndConfirm([string]$Word, [string]$ShotName) {
  $i = 0
  foreach ($ch in $Word.ToLowerInvariant().ToCharArray()) {
    if ($ch -match '[a-z0-9]') {
      Resume-IfStopped "typeword-pre-$i"
      Press @([string]$ch) 0.3 0.2
      $i++
    }
  }
  Resume-IfStopped 'typeword-post'
  return Shoot $ShotName
}
function Solve-Protection([string]$visionText) {
  if (-not (Test-Path $JournalTxt)) { Write-Host "[dqk-native-ctrl] no journal text at $JournalTxt"; return $null }
  $cliArgs = @('-y','tsx@4', (Join-Path $repo 'tools\dqk-protection-solve.mts'), '--journal', $JournalTxt, '--prompt', $visionText)
  if (Test-Path $CodesTxt) { $cliArgs += @('--codes', $CodesTxt) }
  $result = (& npx.cmd @cliArgs 2>$null | Out-String).Trim()
  if ($result -and $result -notmatch '\s') { return $result }
  return $null
}

@"
import sys, time
sys.path.insert(0, r'$($repo -replace "'", "''")\tools')
from dosbox_gamelink import GameLink

link = GameLink()
t0 = time.time()
link.move_mouse(-5000.0, -5000.0)
link.move_mouse(35.0, 384.0)
link.click(0, hold=0.05)
print(f'click sequence took {time.time()-t0:.3f}s')
"@ | Set-Content -LiteralPath $fastClickScript -Encoding utf8
function Invoke-FastPlayClick {
  Assert-ExclusiveOwnership
  & python $fastClickScript
  if ($LASTEXITCODE -ne 0) { throw 'fast PLAY click failed' }
}

function Invoke-GameLinkClick {
  param([double]$X, [double]$Y, [string]$Label)
  $clickScript = Join-Path $out ("_click-$Label.py")
  @"
import sys
sys.path.insert(0, r'$($repo -replace "'", "''")\tools')
from dosbox_gamelink import GameLink
link = GameLink()
# GameLink carries relative mouse deltas, not absolute coordinates. Every menu
# click must first re-anchor at the upper-left corner; otherwise later clicks
# are offsets from the preceding control and can silently land off-screen.
link.move_mouse(-5000.0, -5000.0)
link.move_mouse($X, $Y)
link.click(0, hold=0.05)
"@ | Set-Content -LiteralPath $clickScript -Encoding utf8
  Assert-ExclusiveOwnership
  & python $clickScript
  if ($LASTEXITCODE -ne 0) { throw "GameLink click failed: $Label" }
}

function Wait-OrHandleInt16([double]$Seconds, [string]$Label) {
  $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
  $n = 0
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 150
    $snap = Invoke-DebuggerInput -SnapshotOnly -Label ("wait-{0}-{1:D3}" -f $Label, $n)
    $n++
    if (Get-Stopped $snap) { Invoke-DebuggerInput -Command 'RUN' -Label ("wait-resume-{0}-{1:D3}" -f $Label, $n) | Out-Null }
  }
}

function Wait-ForStoppedDebugger([double]$Seconds, [string]$Label) {
  $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
  $n = 0
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 150
    $snap = Invoke-DebuggerInput -SnapshotOnly -Label ("wait-stop-{0}-{1:D3}" -f $Label, $n)
    $n++
    if (Get-Stopped $snap) { return $true }
  }
  return $false
}

function Invoke-WhoPickerProbe([string]$Probe, [int]$Step) {
  switch ($Probe) {
    'Digit1' { Resume-IfStopped "who-digit1-pre-$Step"; Press @('1') 0.3 0.15 }
    'Digit2' { Resume-IfStopped "who-digit2-pre-$Step"; Press @('2') 0.3 0.15 }
    'Digit3' { Resume-IfStopped "who-digit3-pre-$Step"; Press @('3') 0.3 0.15 }
    'Digit4' { Resume-IfStopped "who-digit4-pre-$Step"; Press @('4') 0.3 0.15 }
    'Digit5' { Resume-IfStopped "who-digit5-pre-$Step"; Press @('5') 0.3 0.15 }
    'Digit6' { Resume-IfStopped "who-digit6-pre-$Step"; Press @('6') 0.3 0.15 }
    'Down' { Resume-IfStopped "who-down-pre-$Step"; Press @('down') 0.3 0.15 }
    'InitialA' { Resume-IfStopped "who-initial-a-pre-$Step"; Press @('a') 0.3 0.15 }
    'Enter' { Resume-IfStopped "who-enter-pre-$Step"; Press @('enter') 0.3 0.15 }
    'RowClick' { Resume-IfStopped "who-row-click-pre-$Step"; Invoke-GameLinkClick 320 72 'who-row' }
    'SelectClick' { Resume-IfStopped "who-select-click-pre-$Step"; Invoke-GameLinkClick 450 384 'who-select' }
    default { throw "unsupported non-legacy WHO picker probe: $Probe" }
  }
}

function Find-WhoHandlerLiveEntry {
  $path = Join-Path $out 'who-handler-live-prefix-scan.json'
  Assert-ExclusiveOwnership
  & python $signatureScan $whoHandlerPrefixHex --chunk 0x4000 --timeout 1.0 > $path
  if ($LASTEXITCODE -ne 0) { throw 'live WHO handler prefix scan failed' }
  $scan = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
  if ($scan.matches.Count -ne 1) {
    throw "WHO handler prefix must have exactly one live match; got $($scan.matches.Count)"
  }
  return [int]$scan.matches[0].physical
}

function Wait-WhoHandlerBreakpoint([string]$Label) {
  $deadline = [DateTime]::UtcNow.AddSeconds(3)
  $attempt = 0
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 100
    $snap = Invoke-DebuggerInput -SnapshotOnly -Label ("who-overlay8-$Label-$attempt")
    $attempt++
    if (Get-Stopped $snap) {
      $csip = Get-CsIp $snap
      return [ordered]@{ hit = $true; cs = $csip.cs; ip = $csip.ip; physical = $csip.phys }
    }
  }
  return [ordered]@{ hit = $false; cs = $null; ip = $null; physical = $null }
}

$script:memDumpDone = $false
$script:sigResults = $null
$script:dumpSize = [Convert]::ToInt32($DumpSizeHex, 16)
function Invoke-MemDumpAndSignatureSearch([string]$label) {
  $memDumpPath = Join-Path $out 'MEMDUMP.BIN'
  if (Test-Path -LiteralPath $memDumpPath) { Remove-Item -LiteralPath $memDumpPath -Force }
  $actualLen = 0
  for ($dumpTry = 1; $dumpTry -le 3; $dumpTry++) {
    Write-Host ("[dqk-native-ctrl] MEMDUMPBIN 0000:0000 {0:X} (try {1}/3)" -f $script:dumpSize, $dumpTry)
    if (Test-Path -LiteralPath $memDumpPath) { Remove-Item -LiteralPath $memDumpPath -Force }
    Invoke-DebuggerInput -Command ('MEMDUMPBIN 0000:0000 {0:X}' -f $script:dumpSize) -Label ("memdump-{0}-try{1}" -f $label, $dumpTry) | Out-Null
    $dumpDeadline = [DateTime]::UtcNow.AddSeconds(20)
    $lastLen = -1
    while ([DateTime]::UtcNow -lt $dumpDeadline) {
      if (Test-Path -LiteralPath $memDumpPath) {
        $fi = [System.IO.FileInfo]::new($memDumpPath); $fi.Refresh(); $len = $fi.Length
        if ($len -eq $script:dumpSize -and $len -eq $lastLen) { break }
        $lastLen = $len
      }
      Start-Sleep -Milliseconds 300
    }
    if (Test-Path -LiteralPath $memDumpPath) { $fi = [System.IO.FileInfo]::new($memDumpPath); $fi.Refresh(); $actualLen = $fi.Length } else { $actualLen = 0 }
    Write-Host ("[dqk-native-ctrl] MEMDUMP.BIN try {0}/3: {1} bytes (expected {2})" -f $dumpTry, $actualLen, $script:dumpSize)
    if ($actualLen -gt 0) { break }
  }
  if ($actualLen -eq 0) { Write-Host "[dqk-native-ctrl] MEMDUMPBIN produced a 0-byte file (label=$label)."; return }
  $sigJsonPath = Join-Path $out "signature-search-$label.json"
  & python $searchPy $memDumpPath $sigTargetsJsonPath $sigJsonPath | Out-Null
  $results = Get-Content -LiteralPath $sigJsonPath -Raw | ConvertFrom-Json
  $script:sigResults = $results
  $script:memDumpDone = $true
  foreach ($r in $results) { Write-Host ("[dqk-native-ctrl] signature '{0}': {1} match(es)" -f $r.name, $r.match_count) }
}

function Capture-WholeRam([string]$Label) {
  # GameLink is read-only here and does not need to pause the DOS guest.  This is important at
  # the handoff: the form may be visibly waiting on keyboard input while DEBUGBOX reports
  # `(Running)`, in which state DOSBox-X accepts but does not execute MEMDUMPBIN.
  $checkpointLabel = "who-$Label-checkpoint"
  $checkpointDir = Join-Path $out $checkpointLabel
  if (Test-Path -LiteralPath $checkpointDir) { Remove-Item -LiteralPath $checkpointDir -Recurse -Force }
  & python (Join-Path $repo 'tools\goldbox_runtime_probe.py') checkpoint `
    --output $out --label $checkpointLabel --region ('full=0x0:0x{0:X}' -f $script:dumpSize) | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "WHO $Label GameLink RAM checkpoint failed: $LASTEXITCODE" }
  $saved = Join-Path $checkpointDir 'full.bin'
  if (-not (Test-Path -LiteralPath $saved) -or ([System.IO.FileInfo]::new($saved)).Length -ne $script:dumpSize) {
    throw "WHO $Label GameLink checkpoint did not produce the expected $($script:dumpSize)-byte dump"
  }
  return $saved
}

function Write-WhoRamDiff(
  [string]$BeforePath,
  [string]$AfterPath,
  [string]$OutputName = 'who-down-ram-diff.json',
  [string]$Kind = 'dqk-who-isolated-down-ram-diff',
  [string]$ClaimBoundary = 'Changed bytes are candidates only. A debugger write breakpoint must identify the writing CS:IP before any byte is called the form selection index.'
) {
  $before = [IO.File]::ReadAllBytes($BeforePath)
  $after = [IO.File]::ReadAllBytes($AfterPath)
  if ($before.Length -ne $after.Length) { throw 'WHO RAM dumps differ in size' }
  $changes = [Collections.Generic.List[object]]::new()
  $changedCount = 0
  for ($i = 0; $i -lt $before.Length; $i++) {
    if ($before[$i] -ne $after[$i]) {
      $changedCount++
      if ($changes.Count -lt 512) {
        $changes.Add([ordered]@{ physical = ('0x{0:X5}' -f $i); before = ('0x{0:X2}' -f $before[$i]); after = ('0x{0:X2}' -f $after[$i]) }) | Out-Null
      }
    }
  }
  $result = [ordered]@{
    schema_version = 1
    kind = $Kind
    before = [IO.Path]::GetFileName($BeforePath)
    after = [IO.Path]::GetFileName($AfterPath)
    changed_byte_count = $changedCount
    preview_limit = 512
    changes = $changes
    claim_boundary = $ClaimBoundary
  }
  $result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $out $OutputName) -Encoding utf8
  return $result
}

$process = $null
$script:keepAliveHandoff = $false
if ($Stage -in @('Attach','Dispatch','Confirm','Reap')) {
  $handoffPath = Join-Path $out 'who-handoff.json'
  if (-not (Test-Path -LiteralPath $handoffPath)) { throw "WHO handoff is missing: $handoffPath" }
  $handoff = Get-Content -LiteralPath $handoffPath -Raw | ConvertFrom-Json
  # ConvertFrom-Json may materialize an ISO timestamp as a DateTime and render it using the
  # host locale. Preserve that value directly; parsing its localized string fails on machines
  # whose culture does not use the serialized month/day order.
  $created = if ($handoff.created_utc -is [DateTime]) {
    $handoff.created_utc.ToUniversalTime()
  } else {
    [DateTimeOffset]::Parse(
      [string]$handoff.created_utc,
      [Globalization.CultureInfo]::InvariantCulture,
      [Globalization.DateTimeStyles]::RoundtripKind
    ).UtcDateTime
  }
  if (([DateTime]::UtcNow - $created).TotalSeconds -gt $HandoffMaxAgeSec) {
    if ($handoff.process_id) { Stop-Process -Id ([int]$handoff.process_id) -ErrorAction SilentlyContinue }
    throw "WHO handoff is older than $HandoffMaxAgeSec seconds; recorded process was reaped if still present"
  }
  $process = Get-Process -Id ([int]$handoff.process_id) -ErrorAction Stop
  Assert-ExclusiveOwnership
  if ($Stage -eq 'Reap') {
    Stop-Process -Id $process.Id -ErrorAction Stop
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $handoffPath -Force
    Write-Host "[dqk-native-ctrl] reaped WHO handoff PID $($process.Id)"
    exit
  }
  try {
    # Capture a full read-only GameLink before-state while the visible form is waiting.  One
    # documented Down edge then runs until BPINT16 stops at the next read, which gives us the
    # post-INT16 return stack without pretending the form was stopped before the edge.
    $before = Capture-WholeRam 'before-down'
    Resume-IfStopped 'who-attach-before-down'
    Press @('down') 0.3 0.15
    if (-not (Wait-ForStoppedDebugger 3 'who-attach-after-down')) { throw 'WHO attach did not stop at the next INT16 read after Down' }
    $after = Capture-WholeRam 'after-down'
    $diff = Write-WhoRamDiff $before $after
    $snapshot = Invoke-DebuggerInput -SnapshotOnly -Label 'who-attach-after-down-snapshot'
    $ss = Get-Reg $snapshot 'SS'
    $esp = Get-Reg $snapshot 'ESP'
    if ($null -eq $ss -or $null -eq $esp) { throw 'WHO attach INT16 stop did not expose SS/ESP' }
    $sp = $esp -band 0xFFFF
    $stack = Invoke-DebuggerInput -Command ('D {0:X4}:{1:X4}' -f $ss, $sp) -Label 'who-attach-int16-return-stack'
    $stack | Set-Content -LiteralPath (Join-Path $out 'who-attach-int16-return-stack.txt') -Encoding utf8
    $report = [ordered]@{
      schema_version = 1; stage = $Stage.ToLowerInvariant(); process_id = $process.Id; handoff = 'who-handoff.json'
      changed_byte_count = $diff.changed_byte_count; diff = 'who-down-ram-diff.json'
      stopped_cs_ip = Get-CsIp $snapshot
      int16_ss = ('0x{0:X4}' -f $ss); int16_sp = ('0x{0:X4}' -f $sp)
      int16_return_stack = 'who-attach-int16-return-stack.txt'
      next_step = 'Use the post-Down INT16 return stack and one changed byte to arm BPM only while this debugger stop is active; rerun a fresh handoff and record the writer CS:IP.'
    }
    if ($Stage -in @('Dispatch','Confirm')) {
      # The preceding verified Attach capture established that this exact stack return is the
      # post-INT16 caller.  Arm the code BP only while the helper is genuinely stopped, then
      # resume without injecting another game input.  AX at the stop is the BIOS key result that
      # the dispatcher's 64-entry table consumes; Down must be 0x5000 on this retail run.
      Invoke-DebuggerInput -Command 'BPDEL *' -Label 'who-down-dispatch-clear-int16-breakpoint' | Out-Null
      Invoke-DebuggerInput -Command 'BP 1D42:00F8' -Label 'who-down-dispatch-arm-post-int16-caller' | Out-Null
      Invoke-DebuggerInput -Command 'RUN' -Label 'who-down-dispatch-run-to-post-int16-caller' | Out-Null
      if (-not (Wait-ForStoppedDebugger 3 'who-down-dispatch-post-int16-caller')) {
        throw 'WHO Down dispatch did not hit the verified post-INT16 caller at 1D42:00F8'
      }
      $dispatcherSnapshot = Invoke-DebuggerInput -SnapshotOnly -Label 'who-down-dispatch-post-int16-caller-snapshot'
      $dispatcherCsIp = Get-CsIp $dispatcherSnapshot
      if ($dispatcherCsIp.cs -ne 0x1D42 -or $dispatcherCsIp.ip -ne 0x00F8) {
        throw ('WHO Down dispatch stopped at {0:X4}:{1:X4}, not the armed 1D42:00F8 caller' -f $dispatcherCsIp.cs, $dispatcherCsIp.ip)
      }
      $downAx = (Get-Reg $dispatcherSnapshot 'EAX') -band 0xFFFF
      if ($downAx -ne 0x5000) { throw ('WHO Down dispatcher AX was 0x{0:X4}, expected BIOS Down 0x5000' -f $downAx) }
      $dispatcherSnapshot | Set-Content -LiteralPath (Join-Path $out 'who-dispatcher-stop.txt') -Encoding utf8
      $report.dispatcher_breakpoint = '1D42:00F8'
      $report.dispatcher_stop = $dispatcherCsIp
      $report.dispatcher_ax = ('0x{0:X4}' -f $downAx)
      $report.dispatcher_snapshot = 'who-dispatcher-stop.txt'
      if ($Stage -eq 'Dispatch') {
        $report.next_step = 'Use -Stage Confirm on a fresh handoff to trace exactly one Enter confirmation through this same dispatcher and capture its resulting original-DOS state.'
        $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $out 'who-dispatch-report.json') -Encoding utf8
      } else {
        # Static table recovery predicts BIOS Down (0x5000) at table entry 54, whose live target
        # is 1D42:021A. Prove that target in the same execution before allowing the form to wait
        # for confirmation; this is stronger than recording only the common dispatcher entry.
        Invoke-DebuggerInput -Command 'BPDEL *' -Label 'who-confirm-clear-down-dispatcher-entry' | Out-Null
        Invoke-DebuggerInput -Command 'BP 1D42:021A' -Label 'who-confirm-arm-down-table-target' | Out-Null
        Invoke-DebuggerInput -Command 'RUN' -Label 'who-confirm-run-to-down-table-target' | Out-Null
        if (-not (Wait-ForStoppedDebugger 3 'who-confirm-down-table-target')) {
          throw 'WHO Down did not reach the recovered dispatcher table target 1D42:021A'
        }
        $downTargetSnapshot = Invoke-DebuggerInput -SnapshotOnly -Label 'who-confirm-down-table-target-snapshot'
        $downTargetCsIp = Get-CsIp $downTargetSnapshot
        if ($downTargetCsIp.cs -ne 0x1D42 -or $downTargetCsIp.ip -ne 0x021A) {
          throw ('WHO Down table target stopped at {0:X4}:{1:X4}, not 1D42:021A' -f $downTargetCsIp.cs, $downTargetCsIp.ip)
        }
        $downTargetSnapshot | Set-Content -LiteralPath (Join-Path $out 'who-confirm-down-table-target.txt') -Encoding utf8

        # Let the dispatcher consume Down, but stop at the next blocking INT16 before supplying
        # any other game input. This establishes an observable post-movement boundary and gives
        # the confirmation its own clean INT16-return/dispatcher trace.
        Invoke-DebuggerInput -Command 'BPDEL *' -Label 'who-confirm-clear-down-dispatch-breakpoint' | Out-Null
        Invoke-DebuggerInput -Command 'BPINT 16 0' -Label 'who-confirm-arm-pre-enter-int16' | Out-Null
        Invoke-DebuggerInput -Command 'RUN' -Label 'who-confirm-apply-down' | Out-Null
        if (-not (Wait-ForStoppedDebugger 5 'who-confirm-pre-enter-int16')) {
          throw 'WHO Confirm did not reach the next INT16 boundary after applying Down'
        }
        $preEnterSnapshot = Invoke-DebuggerInput -SnapshotOnly -Label 'who-confirm-pre-enter-int16-snapshot'
        $preEnterCsIp = Get-CsIp $preEnterSnapshot
        if ($preEnterCsIp.cs -ne 0x08FB -or $preEnterCsIp.ip -ne 0x006C) {
          throw ('WHO Confirm pre-Enter stop was {0:X4}:{1:X4}, not INT16 helper 08FB:006C' -f $preEnterCsIp.cs, $preEnterCsIp.ip)
        }
        $movementRam = Capture-WholeRam 'after-movement'
        $movementShot = Shoot 'who-after-movement'
        $movementDiff = Write-WhoRamDiff $before $movementRam `
          'who-down-applied-ram-diff.json' 'dqk-who-down-applied-ram-diff' `
          'This diff spans one authentic Down edge through the generic dispatcher. It identifies resulting state, not a proven selector-index address.'

        $enterSs = Get-Reg $preEnterSnapshot 'SS'
        $enterEsp = Get-Reg $preEnterSnapshot 'ESP'
        if ($null -eq $enterSs -or $null -eq $enterEsp) { throw 'WHO Confirm pre-Enter INT16 stop did not expose SS/ESP' }
        $enterSp = $enterEsp -band 0xFFFF
        $enterStack = Invoke-DebuggerInput -Command ('D {0:X4}:{1:X4}' -f $enterSs, $enterSp) -Label 'who-confirm-enter-int16-return-stack'
        $enterStack | Set-Content -LiteralPath (Join-Path $out 'who-confirm-enter-int16-return-stack.txt') -Encoding utf8

        # Clear BPINT while genuinely halted, arm only the verified return caller, then run the
        # blocking INT16 and provide exactly one GameLink Enter edge. No alternative confirmation
        # key or host-level input is used in this owned session.
        Invoke-DebuggerInput -Command 'BPDEL *' -Label 'who-confirm-clear-pre-enter-int16' | Out-Null
        Invoke-DebuggerInput -Command 'BP 1D42:00F8' -Label 'who-confirm-arm-enter-dispatcher' | Out-Null
        Invoke-DebuggerInput -Command 'RUN' -Label 'who-confirm-run-int16-for-enter' | Out-Null
        Start-Sleep -Milliseconds 50
        Press @('enter') 0.3 0.15
        if (-not (Wait-ForStoppedDebugger 3 'who-confirm-enter-dispatcher')) {
          throw 'WHO Enter confirmation did not hit the verified post-INT16 caller at 1D42:00F8'
        }
        $enterDispatcherSnapshot = Invoke-DebuggerInput -SnapshotOnly -Label 'who-confirm-enter-dispatcher-snapshot'
        $enterDispatcherCsIp = Get-CsIp $enterDispatcherSnapshot
        if ($enterDispatcherCsIp.cs -ne 0x1D42 -or $enterDispatcherCsIp.ip -ne 0x00F8) {
          throw ('WHO Enter dispatch stopped at {0:X4}:{1:X4}, not the armed 1D42:00F8 caller' -f $enterDispatcherCsIp.cs, $enterDispatcherCsIp.ip)
        }
        $enterAx = (Get-Reg $enterDispatcherSnapshot 'EAX') -band 0xFFFF
        if ($enterAx -ne 0x1C0D) { throw ('WHO Enter dispatcher AX was 0x{0:X4}, expected BIOS Enter 0x1C0D' -f $enterAx) }
        $enterDispatcherSnapshot | Set-Content -LiteralPath (Join-Path $out 'who-confirm-enter-dispatcher-stop.txt') -Encoding utf8

        # Enter (0x1C0D) is absent from the 64-entry table, so the recovered fallback is
        # 1D42:0298. From there the current object callback stores the normalized key at
        # 13FF:06B8. Trace both addresses, with BPINT16 also armed at the writer step so a
        # re-prompt becomes an explicit bounded negative instead of leaving the guest running.
        Invoke-DebuggerInput -Command 'BPDEL *' -Label 'who-confirm-clear-enter-dispatcher-entry' | Out-Null
        Invoke-DebuggerInput -Command 'BP 1D42:0298' -Label 'who-confirm-arm-enter-fallback' | Out-Null
        Invoke-DebuggerInput -Command 'RUN' -Label 'who-confirm-run-to-enter-fallback' | Out-Null
        if (-not (Wait-ForStoppedDebugger 3 'who-confirm-enter-fallback')) {
          throw 'WHO Enter did not reach recovered dispatcher fallback 1D42:0298'
        }
        $enterFallbackSnapshot = Invoke-DebuggerInput -SnapshotOnly -Label 'who-confirm-enter-fallback-snapshot'
        $enterFallbackCsIp = Get-CsIp $enterFallbackSnapshot
        if ($enterFallbackCsIp.cs -ne 0x1D42 -or $enterFallbackCsIp.ip -ne 0x0298) {
          throw ('WHO Enter fallback stopped at {0:X4}:{1:X4}, not 1D42:0298' -f $enterFallbackCsIp.cs, $enterFallbackCsIp.ip)
        }
        $enterFallbackSnapshot | Set-Content -LiteralPath (Join-Path $out 'who-confirm-enter-fallback.txt') -Encoding utf8

        Invoke-DebuggerInput -Command 'BPDEL *' -Label 'who-confirm-clear-enter-fallback' | Out-Null
        Invoke-DebuggerInput -Command 'BP 13FF:06B8' -Label 'who-confirm-arm-normalized-key-writer' | Out-Null
        Invoke-DebuggerInput -Command 'BPINT 16 0' -Label 'who-confirm-arm-writer-fallback-int16' | Out-Null
        Invoke-DebuggerInput -Command 'RUN' -Label 'who-confirm-run-to-normalized-key-writer' | Out-Null
        if (-not (Wait-ForStoppedDebugger 5 'who-confirm-normalized-key-writer')) {
          throw 'WHO Enter reached neither normalized-key writer nor another INT16 boundary'
        }
        $writerSnapshot = Invoke-DebuggerInput -SnapshotOnly -Label 'who-confirm-normalized-key-writer-snapshot'
        $writerCsIp = Get-CsIp $writerSnapshot
        $writerHit = [bool]($writerCsIp.cs -eq 0x13FF -and $writerCsIp.ip -eq 0x06B8)
        $writerInputBoundary = [bool]($writerCsIp.cs -eq 0x08FB -and $writerCsIp.ip -eq 0x006C)
        if (-not $writerHit -and -not $writerInputBoundary) {
          throw ('WHO Enter writer trace stopped unexpectedly at {0:X4}:{1:X4}' -f $writerCsIp.cs, $writerCsIp.ip)
        }
        if ($writerHit) {
          $writerAx = (Get-Reg $writerSnapshot 'EAX') -band 0xFFFF
          $writerDs = Get-Reg $writerSnapshot 'DS'
          if ($writerAx -ne 0x000D) { throw ('WHO Enter normalized-key writer AX was 0x{0:X4}, expected 0x000D' -f $writerAx) }
          $writerSnapshot | Set-Content -LiteralPath (Join-Path $out 'who-confirm-normalized-key-writer.txt') -Encoding utf8
          $writerData = Invoke-DebuggerInput -Command ('D {0:X4}:A6B2' -f $writerDs) -Label 'who-confirm-normalized-key-destination-before-store'
          $writerData | Set-Content -LiteralPath (Join-Path $out 'who-confirm-normalized-key-destination-before-store.txt') -Encoding utf8
        } else {
          $writerAx = $null
          $writerDs = $null
        }

        # Apply Enter and stop at the next original-DOS input boundary. Whether that state is the
        # source continuation or a WHO re-prompt is evidence, so record it rather than assuming
        # that the documented confirmation must succeed for this form.
        $activationHit = $false
        $resultStopped = $writerInputBoundary
        $resultSnapshot = $writerSnapshot
        $resultCsIp = $writerCsIp
        if ($writerHit) {
          Invoke-DebuggerInput -Command 'BPDEL *' -Label 'who-confirm-clear-normalized-key-writer' | Out-Null
          Invoke-DebuggerInput -Command 'BP 22CA:174D' -Label 'who-confirm-arm-accepted-activation' | Out-Null
          Invoke-DebuggerInput -Command 'BPINT 16 0' -Label 'who-confirm-arm-activation-fallback-int16' | Out-Null
          Invoke-DebuggerInput -Command 'RUN' -Label 'who-confirm-apply-enter-after-writer' | Out-Null
          $resultStopped = Wait-ForStoppedDebugger 8 'who-confirm-activation-or-result-int16'
          $resultSnapshot = Invoke-DebuggerInput -SnapshotOnly -Label 'who-confirm-activation-or-result-snapshot'
          $resultCsIp = if ($resultStopped) { Get-CsIp $resultSnapshot } else { $null }
          $activationHit = [bool]($resultStopped -and $resultCsIp.cs -eq 0x22CA -and $resultCsIp.ip -eq 0x174D)
          if ($activationHit) {
            $resultSnapshot | Set-Content -LiteralPath (Join-Path $out 'who-confirm-accepted-activation.txt') -Encoding utf8
            Invoke-DebuggerInput -Command 'BPDEL *' -Label 'who-confirm-clear-accepted-activation' | Out-Null
            Invoke-DebuggerInput -Command 'BPINT 16 0' -Label 'who-confirm-arm-post-activation-int16' | Out-Null
            Invoke-DebuggerInput -Command 'RUN' -Label 'who-confirm-run-post-activation-state' | Out-Null
            $resultStopped = Wait-ForStoppedDebugger 8 'who-confirm-post-activation-int16'
            $resultSnapshot = Invoke-DebuggerInput -SnapshotOnly -Label 'who-confirm-post-activation-snapshot'
            $resultCsIp = if ($resultStopped) { Get-CsIp $resultSnapshot } else { $null }
          } elseif ($resultStopped -and -not ($resultCsIp.cs -eq 0x08FB -and $resultCsIp.ip -eq 0x006C)) {
            throw ('WHO Enter activation trace stopped unexpectedly at {0:X4}:{1:X4}' -f $resultCsIp.cs, $resultCsIp.ip)
          }
        }
        $resultRam = Capture-WholeRam 'after-confirm'
        $resultShot = Shoot 'who-after-confirm'
        $resultDiff = Write-WhoRamDiff $movementRam $resultRam `
          'who-enter-applied-ram-diff.json' 'dqk-who-enter-applied-ram-diff' `
          'This diff spans one authentic Enter edge through the generic dispatcher to the next observed original-DOS state. It does not by itself identify the WHO result variable.'

        $movementPng = Join-Path $out $movementShot.png
        $resultPng = Join-Path $out $resultShot.png
        $report.stage = 'confirm'
        $report.down = [ordered]@{
          key = 'down'; bios_ax = ('0x{0:X4}' -f $downAx); dispatcher_stop = $dispatcherCsIp
          dispatcher_snapshot = 'who-dispatcher-stop.txt'; table_target = $downTargetCsIp
          table_target_snapshot = 'who-confirm-down-table-target.txt'; applied_changed_byte_count = $movementDiff.changed_byte_count
          applied_diff = 'who-down-applied-ram-diff.json'; resulting_screenshot = $movementShot.png
          resulting_screenshot_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $movementPng).Hash
        }
        $report.confirmation = [ordered]@{
          key = 'enter'; int16_helper_stop = $preEnterCsIp
          int16_ss = ('0x{0:X4}' -f $enterSs); int16_sp = ('0x{0:X4}' -f $enterSp)
          int16_return_stack = 'who-confirm-enter-int16-return-stack.txt'
          bios_ax = ('0x{0:X4}' -f $enterAx); dispatcher_stop = $enterDispatcherCsIp
          dispatcher_snapshot = 'who-confirm-enter-dispatcher-stop.txt'
          fallback_stop = $enterFallbackCsIp; fallback_snapshot = 'who-confirm-enter-fallback.txt'
          normalized_key_writer_hit = $writerHit; normalized_key_writer_stop = $writerCsIp
          normalized_key_writer_snapshot = $(if ($writerHit) { 'who-confirm-normalized-key-writer.txt' } else { $null })
          normalized_key_writer_ax = $(if ($writerHit) { '0x{0:X4}' -f $writerAx } else { $null })
          normalized_key_destination = $(if ($writerHit) { ('{0:X4}:A6B2' -f $writerDs) } else { $null })
          normalized_key_destination_before_store = $(if ($writerHit) { 'who-confirm-normalized-key-destination-before-store.txt' } else { $null })
          accepted_activation_hit = $activationHit
          accepted_activation_snapshot = $(if ($activationHit) { 'who-confirm-accepted-activation.txt' } else { $null })
          resulting_input_boundary_reached = [bool]$resultStopped; resulting_stop = $resultCsIp
          resulting_changed_byte_count = $resultDiff.changed_byte_count
          resulting_diff = 'who-enter-applied-ram-diff.json'; resulting_checkpoint = 'who-after-confirm-checkpoint'
          resulting_screenshot = $resultShot.png
          resulting_screenshot_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $resultPng).Hash
          who_prompt_visible = [bool]($resultShot.text -match '(?i)who will throw a stone\?')
          visible_text = $resultShot.text
        }
        $report.claim_boundary = 'One authentic Down and one Enter were each observed returning through 1D42:00F8 with their BIOS AX codes. The captured post-Enter state is reported as observed; no selector-index address or successful WHO source return is inferred from RAM churn alone.'
        $report.next_step = 'Use the captured post-Enter state to decide whether confirmation was accepted; only if the WHO prompt remains should a distinct callback branch be traced.'
        $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'who-confirm-report.json') -Encoding utf8
      }
    } else {
      $report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $out 'who-attach-report.json') -Encoding utf8
    }
  } finally {
    if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -ErrorAction SilentlyContinue; Wait-Process -Id $process.Id -ErrorAction SilentlyContinue }
    Remove-Item -LiteralPath $handoffPath -Force -ErrorAction SilentlyContinue
  }
  exit
}
try {
  Wait-ExclusiveDosboxSlot
  & $probe -DbxExe $dbx -GameDir $mount -Exe 'DQK.EXE' -OutDir $out `
    -GameLink -DebuggerAction @('BPINT 21 42','RUN') -NoActionScreenshots -ExtraSdlConf 'mouse_emulation=always'
  if (-not $?) { throw 'DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  Assert-ExclusiveOwnership

  $calibDeadline = [DateTime]::UtcNow.AddSeconds(30)
  $calibSnap = $null
  while ([DateTime]::UtcNow -lt $calibDeadline) {
    $s = Invoke-DebuggerInput -SnapshotOnly -Label 'calib-poll'
    if (Get-Stopped $s) { $calibSnap = $s; break }
    Start-Sleep -Milliseconds 100
  }
  if (-not $calibSnap) { throw 'calibration: BPINT 21 42 never stopped within 30s (pre-boot arm)' }
  Invoke-DebuggerInput -Command 'RUN' -Label 'calib-resume' | Out-Null
  Assert-ExclusiveOwnership
  Start-Sleep -Seconds 4
  Assert-ExclusiveOwnership

  Press @('enter') 0.2
  Start-Sleep -Seconds 1.5
  Invoke-FastPlayClick
  Start-Sleep -Seconds 1
  $rec = Shoot '01-after-play-click'

  $postClickSnap = $null
  $postClickDeadline = [DateTime]::UtcNow.AddSeconds(15)
  while ([DateTime]::UtcNow -lt $postClickDeadline) {
    $s = Invoke-DebuggerInput -SnapshotOnly -Label 'postclick-poll'
    if (Get-Stopped $s) { $postClickSnap = $s; break }
    Start-Sleep -Milliseconds 150
  }
  if ($postClickSnap) {
    Invoke-DebuggerInput -Command 'BPDEL *' -Label 'postclick-bpdel-int2142' | Out-Null
    Invoke-DebuggerInput -Command 'BPINT 16 0' -Label 'postclick-arm-bpint16-ah0' | Out-Null
    Invoke-DebuggerInput -Command 'RUN' -Label 'postclick-resume' | Out-Null
  } else {
    Write-Host '[dqk-native-ctrl] WARN: no post-click BPINT 21 42 stop within 15s -- proceeding without the BPINT16 swap.'
  }
  Assert-ExclusiveOwnership

  $atMenu = $false
  for ($i = 1; $i -le 20; $i++) {
    if (-not $rec) { break }
    if ($rec.text -match '(?i)LOAD SAVED|BEGIN ADVENTUR|CREATE CHARACTER|ADD CHARACTER') { $atMenu = $true; break }
    Press @('esc') 0.15
    Wait-OrHandleInt16 1 ("skip{0:00}" -f $i)
    $rec = Shoot ('02-skip{0:00}' -f $i)
  }
  if (-not $atMenu) { throw 'never reached the boot main menu' }
  Write-Host '[dqk-native-ctrl] reached boot main menu.'

  $distinctCs = [Collections.Generic.HashSet[string]]::new()
  $hitLog = [Collections.Generic.List[object]]::new()
  function Wait-WhileLoggingHits([double]$Seconds, [string]$Phase) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    $n = 0
    while ([DateTime]::UtcNow -lt $deadline) {
      Start-Sleep -Milliseconds 150
      $snap = Invoke-DebuggerInput -SnapshotOnly -Label ("watch-{0}-{1:D3}" -f $Phase, $n)
      $n++
      if (Get-Stopped $snap) {
        $csIp = Get-CsIp $snap
        if ($csIp) {
          $distinctCs.Add(('{0:X4}' -f $csIp.cs)) | Out-Null
          Invoke-DebuggerInput -Command 'RUN' -Label ("watch-resume-{0}-{1:D3}" -f $Phase, $n) | Out-Null
        }
      }
    }
  }

  # --- Phase 4-5: Load Saved Game -> (location, if prompted) -> selected slot -> Begin Adventuring.
  # The default A keeps the original fresh-start control.  Authentic in-progress sessions must
  # opt into their real slot (e.g. `-SaveSlot B`); never rename a B save to A because the retail
  # loader also associates the selected slot with its party/vault state.
  $loadFormReached = $false
  for ($loadTry = 1; $loadTry -le 3; $loadTry++) {
    Press @('l') 0.3; Wait-WhileLoggingHits 2 ("after-L-$loadTry")
    $rec = Shoot ("03-after-L-$loadTry")
    if ($rec.text -match '(?i)LOAD FROM WHERE|TDQK|LOAD WHICH GAME|WHICH GAME') { $loadFormReached = $true; break }
    if ($rec.text -notmatch '(?i)LOAD SAVED|BEGIN ADVENTUR|CREATE CHARACTER|ADD CHARACTER') { break }
  }
  if (-not $loadFormReached) { throw 'Load Saved Game hotkey did not reach a proven load form within three isolated attempts.' }
  if ($rec.text -match '(?i)LOAD FROM WHERE|TDQK') {
    Press @('t') 0.3; Wait-WhileLoggingHits 2 'after-T'; $rec = Shoot '04-after-T'
  }
  if ($rec.text -match '(?i)LOAD WHICH GAME|WHICH GAME') {
    Press @($SaveSlot.ToLowerInvariant()) 0.3; Wait-WhileLoggingHits 1 ("after-slot-$SaveSlot")
    Press @('enter') 0.3; Wait-WhileLoggingHits 3 ("after-slot-$SaveSlot-enter")
    $rec = Shoot ("05-after-slot-$SaveSlot")
  }
  $tries = 0
  while ($rec.text -notmatch '(?i)BEGIN ADVENTUR' -and $tries -lt 3) {
    Press @('enter') 0.3; Wait-WhileLoggingHits 2 ("load-retry{0:00}" -f $tries)
    $rec = Shoot ('05b-load{0:00}' -f $tries); $tries++
  }
  Press @('b') 0.3; Wait-WhileLoggingHits 3 'after-B'
  $rec = Shoot '06-after-B'

  # --- Phase 6: journal-word protection prompt (skip cleanly if not shown). --------------
  $solvedProtection = $false
  $diskReadError = $false
  for ($j = 1; $j -le 5 -and $rec; $j++) {
    if ($rec.text -match '(?i)disk read error') { $diskReadError = $true; break }
    if ($rec.text -match '(?i)after the heading|what is word|word #') {
      $promptText = $rec.text
      $extractMatch = [regex]::Match($promptText, '(?i)JOURNAL.*?ENTER')
      if ($extractMatch.Success) { $promptText = $extractMatch.Value }
      $ans = Solve-Protection $promptText
      if (-not $ans) {
        $rec = Shoot ('06b-retry-{0:00}' -f $j)
        $promptText = $rec.text
        $extractMatch = [regex]::Match($promptText, '(?i)JOURNAL.*?ENTER')
        if ($extractMatch.Success) { $promptText = $extractMatch.Value }
        $ans = Solve-Protection $promptText
      }
      if (-not $ans) { throw "journal prompt unsolved/low-confidence: $promptText" }
      Write-Host "[dqk-native-ctrl] journal solved -> '$ans'"
      Type-WordAndConfirm $ans ('07-typed-{0:00}' -f $j) | Out-Null
      Resume-IfStopped "pre-submit-enter-$j"
      Press @('enter') 0.3
      Wait-OrHandleInt16 3 ("post-journal-{0:00}" -f $j)
      $solvedProtection = $true
      $rec = Shoot ('08-after-journal-{0:00}' -f $j)
      continue
    }
    break
  }

  # --- Phase 6.5: clear any narrative/story "PRESS RETURN TO CONTINUE" pages. round-1 run
  # (build/dqk-native-control-run1) found the fresh-start save opens on a static Palanthas
  # narrative screen ("YOU ARRIVE IN PALANTHAS...") that arrow keys do NOT advance -- only
  # Enter does -- and burned its entire step budget stuck there. Clear it first.
  $narrClears = 0
  for ($n = 0; $n -lt 20; $n++) {
    $s2 = Shoot ("06c-narrative{0:D2}" -f $n)
    if ($s2.text -notmatch '(?i)press.{0,15}(return|enter).{0,15}continue' -and $s2.text -notmatch '(?i)you arrive|palanthas') { break }
    Resume-IfStopped "narrative-pre-$n"
    Press @('enter') 0.3
    Wait-OrHandleInt16 1 ("narrative-clear-{0:00}" -f $n)
    $narrClears++
  }
  Write-Host "[dqk-native-ctrl] cleared $narrClears narrative page(s)."

  # --- Phase 7: NATIVE wander loop. Unlike the CoK-ported route (which drives 2 keys to a
  # KNOWN crash cell), we don't have a target cell here -- alternate forward/turn keys for up to
  # $MaxSteps steps, watching vision text every step for a combat/encounter trigger or a freeze,
  # and taking a memory-signature dump the first time anything encounter-like appears on screen.
  $wanderKeys = @('up','up','up','right','up','up','left','up','down','up')
  $encounterSeen = $false
  $encounterStep = $null
  $frozenStep = $null
  $questGateStep = $null
  $partySelectorBlockedStep = $null
  $partySelectorProbeResult = $null
  $whoCallbackTrace = $null
  $partySelectorStage = 0
  $palaceGateAttempts = 0
  $narrClearsInLoop = 0
  $stepLog = [Collections.Generic.List[object]]::new()
  $lastShotText = ''
  for ($s = 0; $s -lt $MaxSteps; $s++) {
    # DQK's fresh-start save runs through a linear, scripted opening chapter (Palanthas arrival,
    # a summons from the general, ...) with more than one "PRESS RETURN TO CONTINUE" story beat
    # -- round-4 run (build/dqk-native-control-run4) found a SECOND one mid-loop that arrow keys
    # don't clear. Detect and clear any such page inline instead of spending a movement key on it.
    # Vision/OCR occasionally omits the bottom "PRESS RETURN TO CONTINUE" strip even when it is
    # plainly visible.  Keep advancing the known narrative language until a real command/form
    # state replaces it; do not waste movement keys against a modal text page.
    if ($lastShotText -match '(?i)press.{0,15}(return|enter).{0,15}continue|you arrive|palanthas|beyond it in the dark chamber|she is wrapt in meditation|portal ahead|mind whispers|she frowns|displeasure is a universe|raistlin.s bony hands|when the fog clears|bells of anguish|we must escape|immediately before the sound of the bell|the dark queen pauses|creatures.{0,20}peer|we must distract her|raistlin hurls the stone|gothanich|feel.{0,40}warmth') {
      Resume-IfStopped "inloop-narrative-pre-$s"
      Press @('enter') 0.3
      $narrClearsInLoop++
      Wait-OrHandleInt16 1 ("inloop-narrative-clear-{0:00}" -f $s)
      $shot = Shoot ("09-step{0:D2}-enter-narrative" -f $s)
      $stepLog.Add([ordered]@{ step = $s; key = 'enter(narrative)'; text = $shot.text; screen = $shot.screen }) | Out-Null
      $lastShotText = $shot.text
      continue
    }
    # round-6 run (build/dqk-native-control-run6) found the fresh-start save routes through a
    # text/letter-driven PALANTHAS TOWN HUB ("WHERE DO YOU WISH TO GO? PALACE TEMPLE HALL SHOP
    # INN BAR LEAVE") -- arrow keys don't drive this menu at all (it burned the whole 70-step
    # budget cycling in place). Gold Box town menus select by first letter (same convention as
    # the boot main menu's own 'l'/'b' shortcuts) -- press 'l' for LEAVE to actually exit town
    # onto the overland/wilderness map where a wandering-encounter check can fire.
    if ($lastShotText -match '(?i)where do you wish to go' -and $lastShotText -match '(?i)\bleave\b') {
      Resume-IfStopped "inloop-townmenu-pre-$s"
      Press @('l') 0.3
      Wait-OrHandleInt16 1 ("inloop-townmenu-leave-{0:00}" -f $s)
      $shot = Shoot ("09-step{0:D2}-l-leave" -f $s)
      $stepLog.Add([ordered]@{ step = $s; key = 'l(leave-town)'; text = $shot.text; screen = $shot.screen }) | Out-Null
      $lastShotText = $shot.text
      continue
    }
    # This is an evidence-backed route choice, not a guessed story action: the authentic slot-B
    # trace displays exactly `CREEP ATTACK LEAVE`.  The selected option is explicit in the report
    # so each branch can be traced separately without conflating its host behavior with another.
    if ($lastShotText -match '(?i)what do you do\?' -and $lastShotText -match '(?i)\bcreep\b.*\battack\b.*\bleave\b') {
      Resume-IfStopped "inloop-$($EncounterChoice.ToLowerInvariant())-pre-$s"
      Press @($EncounterKey) 0.3
      Wait-OrHandleInt16 2 ("inloop-{0}-{1:00}" -f $EncounterChoice.ToLowerInvariant(), $s)
      $shot = Shoot ("09-step{0:D2}-{1}-{2}" -f $s, $EncounterKey, $EncounterChoice.ToLowerInvariant())
      $stepLog.Add([ordered]@{ step = $s; key = "$EncounterKey($($EncounterChoice.ToLowerInvariant()))"; text = $shot.text; screen = $shot.screen }) | Out-Null
      $lastShotText = $shot.text
      continue
    }
    # The CREEP branch presents a separate, visible LEFT/RIGHT prompt.  Keep this as a named
    # branch instead of treating an arrow key as an answer: the original form is letter-driven.
    if ($lastShotText -match '(?i)creep to the right or to the left\?' -and $lastShotText -match '(?i)\bleft\b.*\bright\b') {
      Resume-IfStopped "inloop-creep-$($CreepDirection.ToLowerInvariant())-pre-$s"
      Press @($CreepDirectionKey) 0.3
      Wait-OrHandleInt16 2 ("inloop-creep-{0}-{1:00}" -f $CreepDirection.ToLowerInvariant(), $s)
      $shot = Shoot ("09-step{0:D2}-{1}-creep-{2}" -f $s, $CreepDirectionKey, $CreepDirection.ToLowerInvariant())
      $stepLog.Add([ordered]@{ step = $s; key = "$CreepDirectionKey(creep-$($CreepDirection.ToLowerInvariant()))"; text = $shot.text; screen = $shot.screen }) | Out-Null
      $lastShotText = $shot.text
      continue
    }
    # The left/right CREEP path later exposes a smaller `CREEP ATTACK` form.  Treat this as a
    # distinct, named decision; it is not the opening three-option choice above.
    if ($lastShotText -match '(?i)what do you do\?' -and $lastShotText -match '(?i)\bcreep\b.*\battack\b' -and $lastShotText -notmatch '(?i)\bleave\b') {
      Resume-IfStopped "inloop-followup-$($FollowupEncounterChoice.ToLowerInvariant())-pre-$s"
      Press @($FollowupEncounterKey) 0.3
      Wait-OrHandleInt16 2 ("inloop-followup-{0}-{1:00}" -f $FollowupEncounterChoice.ToLowerInvariant(), $s)
      $shot = Shoot ("09-step{0:D2}-{1}-followup-{2}" -f $s, $FollowupEncounterKey, $FollowupEncounterChoice.ToLowerInvariant())
      $stepLog.Add([ordered]@{ step = $s; key = "$FollowupEncounterKey(followup-$($FollowupEncounterChoice.ToLowerInvariant()))"; text = $shot.text; screen = $shot.screen }) | Out-Null
      $lastShotText = $shot.text
      continue
    }
    # The portal endpoint has its own visible three-option prompt.  Record the selected branch
    # explicitly; direct attack here is a different host context from the opening Dark Queen form.
    if ($lastShotText -match '(?i)what do you do\?' -and $lastShotText -match '(?i)\bjump through portal\b.*\bwait\b.*\battack\b') {
      Resume-IfStopped "inloop-portal-$($PortalChoice.ToLowerInvariant())-pre-$s"
      Press @($PortalChoiceKey) 0.3
      Wait-OrHandleInt16 2 ("inloop-portal-{0}-{1:00}" -f $PortalChoice.ToLowerInvariant(), $s)
      $shot = Shoot ("09-step{0:D2}-{1}-portal-{2}" -f $s, $PortalChoiceKey, $PortalChoice.ToLowerInvariant())
      $stepLog.Add([ordered]@{ step = $s; key = "$PortalChoiceKey(portal-$($PortalChoice.ToLowerInvariant()))"; text = $shot.text; screen = $shot.screen }) | Out-Null
      $lastShotText = $shot.text
      continue
    }
    # After waiting at the portal, the original scene offers a separate distraction choice.
    # `THROW STONE` is intentionally distinct from the preceding portal form and is reported as
    # such, so its effects cannot be misattributed to a generic combat action.
    if ($lastShotText -match '(?i)what do you do\?' -and $lastShotText -match '(?i)\bthrow stone\b.*\bwait\b.*\battack\b') {
      Resume-IfStopped "inloop-stone-$($StoneChoice.ToLowerInvariant())-pre-$s"
      Press @($StoneChoiceKey) 0.3
      if ($TraceWhoCallback) {
        # Keep the known INT16 stop armed and stopped after the source opens WHO.  DOSBox-X only
        # accepts breakpoint commands while halted; arming from a running guest silently fails.
        if (-not (Wait-ForStoppedDebugger 2 ("inloop-stone-{0}-{1:00}" -f $StoneChoice.ToLowerInvariant(), $s))) {
          throw 'WHO trace could not obtain the post-THROW INT16 stop'
        }
        # INT 16's tiny helper returns with POP BP; RETF.  Capture the stopped
        # stack before RUN/breakpoint changes so SS:SP yields the actual caller
        # that owns the generic form loop, rather than confusing the ECL WHO
        # opcode setup handler with the input dispatcher.
        $whoInt16Snap = Invoke-DebuggerInput -SnapshotOnly -Label 'who-int16-return-snapshot'
        $whoSs = Get-Reg $whoInt16Snap 'SS'
        $whoEsp = Get-Reg $whoInt16Snap 'ESP'
        if ($null -eq $whoSs -or $null -eq $whoEsp) { throw 'WHO INT16 stop did not expose SS/ESP' }
        $whoSp = $whoEsp -band 0xFFFF
        $whoInt16Stack = Invoke-DebuggerInput -Command ('D {0:X4}:{1:X4}' -f $whoSs, $whoSp) -Label 'who-int16-stack'
        $whoInt16Stack | Set-Content -LiteralPath (Join-Path $out 'who-int16-stack.txt') -Encoding utf8
      } else {
        Wait-OrHandleInt16 2 ("inloop-stone-{0}-{1:00}" -f $StoneChoice.ToLowerInvariant(), $s)
      }
      $shot = Shoot ("09-step{0:D2}-{1}-stone-{2}" -f $s, $StoneChoiceKey, $StoneChoice.ToLowerInvariant())
      $stepLog.Add([ordered]@{ step = $s; key = "$StoneChoiceKey(stone-$($StoneChoice.ToLowerInvariant()))"; text = $shot.text; screen = $shot.screen }) | Out-Null
      $lastShotText = $shot.text
      continue
    }
    # Bounded picker protocol: first prove the two visible mouse targets are ineffective, then use
    # the DQK manual's documented vertical-selector interaction: one Down edge (capture its focus
    # change), Enter (capture its effect), then click SELECT again now that the keyboard focus has
    # moved. Each action is deliberately isolated; never batch an unverified selection/confirmation.
    if ($lastShotText -match '(?i)who will throw a stone\?' -and $lastShotText -match '(?i)\bselect\b') {
      if ($Stage -eq 'Launch') {
        # Do not make an input here. The later Attach stage owns exactly one documented Down
        # edge and always tears down this PID.  Do not require a debugger stop here: the form
        # can wait visibly while DEBUGBOX still says `(Running)`. Attach takes its before image
        # through GameLink, then obtains the next BPINT16 stop after its isolated Down edge.
        $whoReady = Shoot ("09-step{0:D2}-who-handoff-ready" -f $s)
        [ordered]@{
          schema_version = 1
          stage = 'who-ready'
          created_utc = [DateTime]::UtcNow.ToString('o')
          process_id = $process.Id
          mount = $MountDir
          save_slot = $SaveSlot
          screenshot = $whoReady.png
          text = $whoReady.text
          claim_boundary = 'Owned GameLink session is at the visible WHO form; it may be running despite waiting for input. Attach must reassert exclusive PID ownership before its sole Down edge.'
        } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $out 'who-handoff.json') -Encoding utf8
        $script:keepAliveHandoff = $true
        $partySelectorBlockedStep = $s
        $stepLog.Add([ordered]@{ step = $s; key = 'handoff(WHO-ready)'; text = $whoReady.text; screen = $whoReady.screen }) | Out-Null
        Write-Host "[dqk-native-ctrl] WHO handoff ready; PID $($process.Id) remains alive for Attach or Reap."
        break
      }
      if ($TraceWhoCallback) {
        # This is the sole intentional two-input sequence: native screenshots already prove Down
        # moves the roster highlight, and Enter is the corresponding visible confirmation affordance.
        # Break on the relocated handler itself for each input; do not broaden this into a key hunt.
        $before = Shoot ("09-step{0:D2}-who-before-overlay8-trace" -f $s)
        $entryPhysical = Find-WhoHandlerLiveEntry
        $entrySegment = [int][Math]::Floor($entryPhysical / 16)
        $entryOffset = [int]($entryPhysical % 16)
        Invoke-DebuggerInput -Command 'BPDEL *' -Label 'who-overlay8-clear-breakpoints' | Out-Null
        Invoke-DebuggerInput -Command ('BP {0:X4}:{1:X4}' -f $entrySegment, $entryOffset) -Label 'who-overlay8-arm-handler' | Out-Null
        Invoke-DebuggerInput -Command 'RUN' -Label 'who-overlay8-resume-for-down' | Out-Null

        Press @('down') 0.3 0.15
        $downStop = Wait-WhoHandlerBreakpoint 'down'
        if ($downStop.hit) { Invoke-DebuggerInput -Command 'RUN' -Label 'who-overlay8-resume-after-down' | Out-Null }
        Start-Sleep -Milliseconds 350
        $afterDown = Shoot ("09-step{0:D2}-who-after-down-overlay8-trace" -f $s)

        Press @('enter') 0.3 0.15
        $enterStop = Wait-WhoHandlerBreakpoint 'enter'
        if ($enterStop.hit) { Invoke-DebuggerInput -Command 'RUN' -Label 'who-overlay8-resume-after-enter' | Out-Null }
        Start-Sleep -Milliseconds 350
        $afterEnter = Shoot ("09-step{0:D2}-who-after-enter-overlay8-trace" -f $s)
        $whoCallbackTrace = [ordered]@{
          int16_ss = ('0x{0:X4}' -f $whoSs)
          int16_sp = ('0x{0:X4}' -f $whoSp)
          int16_stack_snapshot = 'who-int16-stack.txt'
          handler_prefix_hex = $whoHandlerPrefixHex
          handler_entry_physical = ('0x{0:X5}' -f $entryPhysical)
          handler_breakpoint = ('{0:X4}:{1:X4}' -f $entrySegment, $entryOffset)
          down = $downStop
          enter = $enterStop
          who_visible_after_down = ($afterDown.text -match '(?i)who will throw a stone\?')
          who_visible_after_enter = ($afterEnter.text -match '(?i)who will throw a stone\?')
        }
        $partySelectorBlockedStep = $s
        $stepLog.Add([ordered]@{ step = $s; key = 'trace(down+enter overlay8)'; text = $afterEnter.text; screen = $afterEnter.screen }) | Out-Null
        Write-Host "[dqk-native-ctrl] WHO overlay-8 callback trace complete; down_hit=$($downStop.hit) enter_hit=$($enterStop.hit). Stopping this disposable run."
        break
      }
      if ($PickerProbe -ne 'Legacy') {
        # Capture exactly one candidate's before/after bytes and then terminate this disposable
        # run. A changed image alone is insufficient: advancement requires the re-prompt to end.
        $before = Shoot ("09-step{0:D2}-who-before-{1}" -f $s, $PickerProbe.ToLowerInvariant())
        $beforeHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $out $before.png)).Hash
        Invoke-WhoPickerProbe $PickerProbe $s
        Wait-OrHandleInt16 2 ("who-{0}-{1:00}" -f $PickerProbe.ToLowerInvariant(), $s)
        $after = Shoot ("09-step{0:D2}-who-after-{1}" -f $s, $PickerProbe.ToLowerInvariant())
        $afterHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $out $after.png)).Hash
        $advanced = ($beforeHash -ne $afterHash) -and ($after.text -notmatch '(?i)who will throw a stone\?')
        $partySelectorProbeResult = [ordered]@{ candidate = $PickerProbe; before_sha256 = $beforeHash; after_sha256 = $afterHash; frame_changed = ($beforeHash -ne $afterHash); source_advanced = $advanced; before_text = $before.text; after_text = $after.text }
        $stepLog.Add([ordered]@{ step = $s; key = "probe($PickerProbe)"; text = $after.text; screen = $after.screen }) | Out-Null
        $partySelectorBlockedStep = $s
        Write-Host "[dqk-native-ctrl] WHO one-input probe $PickerProbe complete; source_advanced=$advanced. Stopping this disposable run."
        break
      }
      if ($partySelectorStage -eq 0) {
        $whoScanPath = Join-Path $out 'who-handler-live-scan.json'
        Assert-ExclusiveOwnership
        & python $signatureScan $whoHandlerSigHex --chunk 0x4000 --timeout 1.0 > $whoScanPath
        if ($LASTEXITCODE -ne 0) { Write-Host '[dqk-native-ctrl] WARN: live WHO signature scan failed; selector capture continues.' }
        Resume-IfStopped "inloop-stone-row-pre-$s"
        Invoke-GameLinkClick 320 72 'stone-aramnor-row'
        Wait-OrHandleInt16 1 ("inloop-stone-row-{0:00}" -f $s)
        $shot = Shoot ("09-step{0:D2}-click-stone-aramnor-row" -f $s)
        $stepLog.Add([ordered]@{ step = $s; key = 'click(stone-aramnor-row)'; text = $shot.text; screen = $shot.screen }) | Out-Null
        $lastShotText = $shot.text
        $partySelectorStage = 1
        continue
      }
      if ($partySelectorStage -eq 1) {
        Resume-IfStopped "inloop-stone-select-pre-$s"
        Invoke-GameLinkClick 450 384 'stone-select'
        Wait-OrHandleInt16 2 ("inloop-stone-select-{0:00}" -f $s)
        $shot = Shoot ("09-step{0:D2}-click-stone-select" -f $s)
        $stepLog.Add([ordered]@{ step = $s; key = 'click(stone-select)'; text = $shot.text; screen = $shot.screen }) | Out-Null
        $lastShotText = $shot.text
        $partySelectorStage = 2
        continue
      }
      if ($partySelectorStage -eq 2) {
        Resume-IfStopped "inloop-stone-down-pre-$s"
        Press @('down') 0.3 0.15
        Wait-OrHandleInt16 2 ("inloop-stone-down-{0:00}" -f $s)
        $shot = Shoot ("09-step{0:D2}-down-stone-party" -f $s)
        $stepLog.Add([ordered]@{ step = $s; key = 'down(stone-party)'; text = $shot.text; screen = $shot.screen }) | Out-Null
        $lastShotText = $shot.text
        $partySelectorStage = 3
        continue
      }
      if ($partySelectorStage -eq 3) {
        Resume-IfStopped "inloop-stone-enter-pre-$s"
        Press @('enter') 0.3 0.15
        Wait-OrHandleInt16 2 ("inloop-stone-enter-{0:00}" -f $s)
        $shot = Shoot ("09-step{0:D2}-enter-stone-party" -f $s)
        $stepLog.Add([ordered]@{ step = $s; key = 'enter(stone-party)'; text = $shot.text; screen = $shot.screen }) | Out-Null
        $lastShotText = $shot.text
        $partySelectorStage = 4
        continue
      }
      if ($partySelectorStage -eq 4) {
        Resume-IfStopped "inloop-stone-select-after-down-pre-$s"
        Invoke-GameLinkClick 450 384 'stone-select-after-down'
        Wait-OrHandleInt16 2 ("inloop-stone-select-after-down-{0:00}" -f $s)
        $shot = Shoot ("09-step{0:D2}-click-stone-select-after-down" -f $s)
        $stepLog.Add([ordered]@{ step = $s; key = 'click(stone-select-after-down)'; text = $shot.text; screen = $shot.screen }) | Out-Null
        $lastShotText = $shot.text
        $partySelectorStage = 5
        continue
      }
      $partySelectorBlockedStep = $s
      $stepLog.Add([ordered]@{ step = $s; key = 'stop(unresolved-party-selector)'; text = $lastShotText; screen = $null }) | Out-Null
      Write-Host "[dqk-native-ctrl] party selector reached at step $s; stopping pending evidence for its select action."
      break
    }
    $key = $wanderKeys[$s % $wanderKeys.Count]
    Press @($key) 0.3
    $stopped = $false
    for ($p = 0; $p -lt $StopPollTriesPerKey; $p++) {
      Start-Sleep -Milliseconds $StopPollMs
      $snap = Invoke-DebuggerInput -SnapshotOnly -Label ("poll-{0:D2}-{1:D2}" -f $s, $p)
      if (Get-Stopped $snap) {
        $stopped = $true
        $csIp = Get-CsIp $snap
        if ($csIp) { $distinctCs.Add(('{0:X4}' -f $csIp.cs)) | Out-Null }
        Invoke-DebuggerInput -Command 'RUN' -Label ("resume-{0:D2}-{1:D2}" -f $s, $p) | Out-Null
      }
    }
    $shot = Shoot ("09-step{0:D2}-{1}" -f $s, $key)
    $stepLog.Add([ordered]@{ step = $s; key = $key; text = $shot.text; screen = $shot.screen }) | Out-Null
    $lastShotText = $shot.text
    # The untouched starting save is deliberately a story-state route, not an
    # already-free wilderness fixture. Once the Palace guard has rejected
    # LEAVE repeatedly, further wander keys cannot produce a valid explorer
    # or combat trace; stop with an explicit diagnostic instead of pretending
    # that a town-menu loop is a failed wandering-encounter experiment.
    if ($shot.text -match '(?i)general requests your presence at the palace|guard stops you') {
      $palaceGateAttempts++
      if ($palaceGateAttempts -ge 3) {
        $questGateStep = $s
        Write-Host "[dqk-native-ctrl] Palanthas Palace quest gate repeated $palaceGateAttempts time(s) at step $s; stopping before non-explorer input is misclassified as wandering."
        break
      }
    } else {
      $palaceGateAttempts = 0
    }
    if ($shot.text -match '(?i)disk read error') {
      $frozenStep = $s
      Write-Host "[dqk-native-ctrl] *** DISK READ ERROR observed at step $s (key='$key') -- same freeze signature as the CoK-ported route. ***"
      if (-not $script:memDumpDone) { Invoke-MemDumpAndSignatureSearch "freeze-step$s" }
      break
    }
    if (-not $encounterSeen -and $shot.text -match '(?i)attack|encounter|monster|combat|surprise') {
      $encounterSeen = $true
      $encounterStep = $s
      Write-Host "[dqk-native-ctrl] *** possible NATIVE encounter trigger at step $s (key='$key'): '$($shot.text)' ***"
      if (-not $script:memDumpDone) { Invoke-MemDumpAndSignatureSearch "encounter-step$s" }
    }
  }

  [ordered]@{
    schema_version = 1
    title = 'DQK native-content control walk (cok-m4-fidelity round 12, §20) -- tests whether an unported, unmodified DQK.EXE wandering encounter resolves cleanly'
    mount = $MountDir
    save_slot = $SaveSlot
    encounter_choice = $EncounterChoice
    creep_direction = $CreepDirection
    followup_encounter_choice = $FollowupEncounterChoice
    portal_choice = $PortalChoice
    stone_choice = $StoneChoice
    picker_probe = $PickerProbe
    reached_boot_menu = $atMenu
    solved_protection = $solvedProtection
    disk_read_error_at_load = $diskReadError
    max_steps = $MaxSteps
    wander_keys_cycle = $wanderKeys
    narr_clears_before_loop = $narrClears
    narr_clears_in_loop = $narrClearsInLoop
    encounter_seen = $encounterSeen
    encounter_step = $encounterStep
    frozen_step = $frozenStep
    quest_gate_at_step = $questGateStep
    party_selector_blocked_at_step = $partySelectorBlockedStep
    party_selector_probe = $partySelectorProbeResult
    who_callback_trace = $whoCallbackTrace
    clean_resolution = [bool]($encounterSeen -and -not $frozenStep)
    mem_dump_captured = $script:memDumpDone
    signature_search = $script:sigResults
    distinct_cs_segments_seen = @($distinctCs)
    step_log = $stepLog
    timeline = $timeline
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'report.json') -Encoding utf8
  Write-Host ""
  Write-Host "===== VERDICT ====="
  Write-Host "reached boot menu    : $atMenu"
  Write-Host "solved protection    : $solvedProtection"
  Write-Host "encounter seen       : $encounterSeen (step=$encounterStep)"
  Write-Host "frozen/DISK READ ERR : $(if ($frozenStep -ne $null) { \"yes at step $frozenStep\" } else { 'no' })"
  Write-Host "report               : $(Join-Path $out 'report.json')"
} finally {
  if ($process -and -not $process.HasExited -and -not $script:keepAliveHandoff) {
    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
