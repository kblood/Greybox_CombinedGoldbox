# tools/cok-m4-combat-breakpoint-route.ps1 — CoK M4 fidelity plan, round 6.
#
# Live DOSBox-X breakpoint capture at the combat-setup-entry routine (canonical 2177:257C,
# per docs/engine/research/cok-m4-fidelity-plan.md §10-13) for EITHER the ported CoK-on-DQK
# M4 build OR a native/unported DQK directory, selected by -MountDir. Reuses the proven
# §7-§9 boot route (tools/cok-m4-gamelink-route.ps1: fast PLAY click, ESC intro-skip,
# L/T/A/Enter/B load, journal-word protection solve) and adds:
#
#   1. A live load-segment calibration step: arm 'BPINT 21 42' (DOS lseek -- fires very
#      early and reliably during DQK.EXE's own overlay-heavy startup, long before the
#      title screen even renders, so it cannot race the launch-menu attract-timer), catch
#      the FIRST stop, read DS (guaranteed == live DGROUP segment at an AH=42 stop, an
#      established pattern already used by tools/trace_pool_ecl2_20_gamelink_route.ps1 and
#      others in this project), then compute the REAL live load segment for THIS specific
#      DQK.EXE + mount, rather than trusting the Unicorn tracer's synthetic --load-seg
#      0x1000 convention. Formula: canonical DQK_DGROUP_SEG (0x322E, per
#      tools/unicorn_dqk_trace.py) sits at live DS; the combat-setup-entry canonical
#      segment is 0x2177; both shift by the SAME load-segment delta under standard MZ EXE
#      relocation (adds one constant to every segment reference), so:
#        bp_seg = (DS_at_ah42_stop - (0x322E - 0x2177)) & 0xFFFF = (DS - 0x10B7) & 0xFFFF
#      This was independently cross-checked against a real DOSBox-X debugger snapshot from
#      the prior build/cok-m4-run-03 session (CS=0x25BD at DQK.EXE's own raw entry, which
#      matches EXE-header e_cs=0x1D99 plus a load segment of 0x0824 computed the same way)
#      before being trusted here.
#   2. 'BPDEL *' immediately after calibration, so the recurring BPINT does not keep
#      halting the guest during the timing-critical PLAY-click race or normal play.
#   3. 'BP <bp_seg>:257C' armed before resuming, then normal play continues via GameLink.
#   4. After the movement keys, a poll loop (not a blind Start-Sleep) watching the
#      process-owned debugger console for a genuine stop with CS:IP == bp_seg:257C. On a
#      hit: dumps SS:[SP+4] (the id/pointer argument the callee will read as [bp+6] once
#      its own prologue runs -- see cok-m4-fidelity-plan.md §12.4/§13.2), DS:5FFD (the
#      generic resource-loader's resource-family-name pointer, proven == "moncha1" in the
#      Unicorn trace, §13.3), and a diagnostic window at DS:<id> (§13.4 found this reads as
#      live shop-dialogue text for the CoK-ported route in the synthetic harness -- this
#      run checks whether that holds in REAL DOSBox-X too, and what a native DQK route
#      shows at the same site).
#
# Usage (CoK M4 build, the crashing case):
#   pwsh tools/cok-m4-combat-breakpoint-route.ps1 -MountDir build/cok-on-dqk-m4fidelity `
#     -OutDir build/cok-m4-bp-run-cok -MovementKeys right,up
#
# Usage (native DQK, comparison case):
#   pwsh tools/cok-m4-combat-breakpoint-route.ps1 -MountDir "The Dark Queen of Krynn" `
#     -OutDir build/cok-m4-bp-run-native -MovementKeys up,up,right,up,up,left,up,up,right,up,up,up,left,up,right,up,up,up,down,up

param(
  [Parameter(Mandatory)][string]$MountDir,
  [Parameter(Mandatory)][string]$OutDir,
  [string]$JournalTxt = "C:\Modding\GoldBox\build\dqk_journal.txt",
  [string]$CodesTxt = "C:\Modding\GoldBox\build\dqk_codes.txt",
  [string[]]$MovementKeys = @('right','up'),
  [ValidateRange(1,120)][int]$StopPollTriesPerKey = 30,
  [ValidateRange(50,2000)][int]$StopPollMs = 300,
  [ValidateRange(1,1800)][int]$ExclusivityWaitTimeoutSec = 600,
  # ROUND 6c: target selection. Default is the combat-setup-entry ROUTINE itself (canonical
  # 0x2177:0x257C, per §10-13). Pass -TargetCanonicalSeg 0x25A4 -TargetOffset 0x18A to instead
  # target the CALL SITE in the wrapper's segment (§13.6 item 1's own top recommendation --
  # the confirmed-live `lcall 0x3177,0x257c` instruction at canonical 25a4:018a, NOT the
  # disproven-live "035b95 wrapper entry" from an earlier round -- see cok-m4-fidelity-plan.md
  # §13.1 vs §12.3/13.2 for why the call site itself is still trustworthy even though the
  # wrapper's assumed ENTRY point was live-disproven).
  [string]$TargetCanonicalSeg = '0x2177',
  [string]$TargetOffset = '0x257C',
  # ROUND 8: optional second offset in the SAME canonical segment, armed simultaneously with
  # $TargetOffset (one live session can then catch either address without a second boot). Used
  # to arm BOTH round-7's Ghidra-verified combat-setup-entry (0x47AC) and its one true caller
  # AddCombatantToActiveRoster (0x4AB6) in a single run -- see
  # docs/engine/research/cok-m4-fidelity-plan.md §15.6.
  [string]$TargetOffset2 = $null,
  # ROUND 8: skip the load_seg calibration shift entirely and use $TargetCanonicalSeg literally
  # as the live breakpoint segment -- tests §15.6's FALLBACK "unshifted" hypothesis (the FBOV
  # overlay area might not relocate the same way the resident image does).
  [switch]$NoLoadSegShift
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$mount = Resolve-Path (Join-Path $repo $MountDir)
$out = Join-Path $repo $OutDir
if (Test-Path -LiteralPath $out) { throw "output directory already exists: $out" }
New-Item -ItemType Directory -Path $out -Force | Out-Null

$dbx = Join-Path $repo 'build\tools\dosbox-x-2026.07.02\bin\x64\Release SDL2\dosbox-x.exe'
$probe = Join-Path $repo 'tools\dosbox_x_debugbox_probe.ps1'
$gameLink = Join-Path $repo 'tools\dosbox_gamelink.py'
$helperProject = Join-Path $repo 'tools\dosbox_debugger_input\DosboxDebuggerInput.csproj'
$helperDll = Join-Path $repo 'tools\dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'
$fastClickScript = Join-Path $out '_fast_play_click.py'
. (Join-Path $repo 'tools\dosbot\lib.ps1')  # Invoke-Vision only

if (-not (Test-Path $dbx)) { throw "DOSBox-X build not found: $dbx" }
if (-not (Test-Path $helperDll)) {
  & dotnet build $helperProject --configuration Release
  if ($LASTEXITCODE -ne 0) { throw "debugger helper build failed: $LASTEXITCODE" }
}

function Get-DosboxPids {
  return @(Get-CimInstance Win32_Process -Filter "Name='dosbox-x.exe'" -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty ProcessId)
}
function Wait-ExclusiveDosboxSlot {
  Write-Host '[cok-m4-bp] waiting for an empty dosbox-x.exe process list (GameLink singleton hazard)...'
  $deadline = [DateTime]::UtcNow.AddSeconds($ExclusivityWaitTimeoutSec)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ((Get-DosboxPids).Count -eq 0) { return }
    Start-Sleep -Seconds 5
  }
  throw "timed out waiting $ExclusivityWaitTimeoutSec s for an exclusive dosbox-x.exe slot"
}
function Assert-ExclusiveOwnership {
  $foreign = @(Get-DosboxPids | Where-Object { $_ -ne $process.Id })
  if ($foreign.Count -gt 0) {
    throw "GameLink CONTAMINATION: foreign dosbox-x.exe pid(s) ($($foreign -join ',')) while own pid is $($process.Id)"
  }
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
  $cs = Get-Reg $Snapshot 'CS'
  $eip = Get-Reg $Snapshot 'EIP'
  if ($null -eq $cs -or $null -eq $eip) { return $null }
  return [ordered]@{ cs = $cs; ip = ($eip -band 0xFFFF) }
}
function Get-DataBytes([string]$Snapshot) {
  $bytes = [Collections.Generic.List[byte]]::new()
  foreach ($line in ($Snapshot -split "`r?`n")) {
    $m = [regex]::Match($line, '^[0-9A-Fa-f]{4}:[0-9A-Fa-f]{8}\s+((?:[0-9A-Fa-f]{2}\s+){15}[0-9A-Fa-f]{2})\s')
    if (-not $m.Success) { continue }
    foreach ($hex in ($m.Groups[1].Value -split '\s+')) { if ($hex) { $bytes.Add([Convert]::ToByte($hex, 16)) } }
  }
  return ,$bytes.ToArray()
}
function Get-AsciiText([byte[]]$Bytes) {
  $sb = [Text.StringBuilder]::new()
  foreach ($b in $Bytes) {
    if ($b -ge 0x20 -and $b -le 0x7E) { $sb.Append([char]$b) | Out-Null }
    elseif ($b -eq 0) { $sb.Append('.') | Out-Null }
    else { $sb.Append('?') | Out-Null }
  }
  return $sb.ToString()
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
  if ($LASTEXITCODE -ne 0) { Write-Host "[cok-m4-bp] WARN: screenshot failed for $name"; return $null }
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
function Type-WordAndConfirm([string]$Word, [string]$ShotName) {
  foreach ($ch in $Word.ToLowerInvariant().ToCharArray()) {
    if ($ch -match '[a-z0-9]') { Press @([string]$ch) 0.3 0.2 }
  }
  return Shoot $ShotName
}
function Solve-Protection([string]$visionText) {
  if (-not (Test-Path $JournalTxt)) { Write-Host "[cok-m4-bp] no journal text at $JournalTxt"; return $null }
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

$process = $null
$bpHit = $null
$bpSeg = $null
try {
  Wait-ExclusiveDosboxSlot
  # Arm the calibration INT21 AH=42 breakpoint BEFORE the boot even begins loading DQK.EXE
  # -- this is the earliest possible arm point (the debugger is paused pre-boot per the
  # DEBUGBOX contract), so it is guaranteed to catch DQK.EXE's own very first lseek call.
  & $probe -DbxExe $dbx -GameDir $mount -Exe 'DQK.EXE' -OutDir $out `
    -GameLink -DebuggerAction @('BPINT 21 42','RUN') -NoActionScreenshots -ExtraSdlConf 'mouse_emulation=always'
  if (-not $?) { throw 'DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  Assert-ExclusiveOwnership

  # --- Calibration: wait for the first AH=42 stop, read DS, compute bp_seg. ---------------
  $calibDeadline = [DateTime]::UtcNow.AddSeconds(30)
  $calibSnap = $null
  while ([DateTime]::UtcNow -lt $calibDeadline) {
    $s = Invoke-DebuggerInput -SnapshotOnly -Label 'calib-poll'
    if (Get-Stopped $s) { $calibSnap = $s; break }
    Start-Sleep -Milliseconds 100
  }
  if (-not $calibSnap) { throw 'calibration: BPINT 21 42 never stopped within 30s' }
  # CORRECTED (round 6, first live attempt against build/cok-on-dqk-m4fidelity self-caught
  # the bug): the FIRST AH=42 (lseek) stop fires from DQK.EXE's own root/bootstrap segment
  # (the FBOV self-referential overlay loader), where CS==DS==ES all equal that root
  # segment -- confirmed live (CS=DS=ES=0x25BD in the very first calibration run) and
  # cross-checked against an independent, earlier real-DOSBox-X snapshot
  # (build/cok-m4-run-03/debugger_console_0.txt: CS=0x25BD one instruction past entry).
  # This is NOT yet DGROUP (canonical 0x322E) -- it is the raw EXE-header entry segment
  # (e_cs, canonical 0x1D99, read directly from the MZ header: offset 0x16, both
  # build/cok-on-dqk-m4fidelity/DQK.EXE and the native DQK.EXE share this header field --
  # only 26 patched bytes differ between them, none in the MZ header). So:
  #   load_seg = CS_at_ah42_stop - 0x1D99
  #   bp_seg   = (0x2177 + load_seg) & 0xFFFF = (CS_at_ah42_stop + (0x2177-0x1D99)) & 0xFFFF
  #            = (CS_at_ah42_stop + 0x03DE) & 0xFFFF
  $csAtCalib = Get-Reg $calibSnap 'CS'
  if ($null -eq $csAtCalib) { throw 'calibration: could not parse CS from stopped snapshot' }
  $targetSegVal = [Convert]::ToInt32($TargetCanonicalSeg, 16)
  $targetOffVal = [Convert]::ToInt32($TargetOffset, 16)
  $bpOffsetHex = '{0:X4}' -f $targetOffVal
  $targetOffVal2 = $null
  $bpOffsetHex2 = $null
  if ($TargetOffset2) {
    $targetOffVal2 = [Convert]::ToInt32($TargetOffset2, 16)
    $bpOffsetHex2 = '{0:X4}' -f $targetOffVal2
  }
  if ($NoLoadSegShift) {
    $bpSeg = $targetSegVal -band 0xFFFF
  } else {
    $bpSeg = ($csAtCalib + ($targetSegVal - 0x1D99)) -band 0xFFFF
  }
  Write-Host ("[cok-m4-bp] calibration: CS={0:X4} at first AH=42 stop -> load_seg={1:X4} -> bp_seg={2:X4} (target canonical {3:X4}:{4}{5}) shift={6}" -f $csAtCalib, (($csAtCalib - 0x1D99) -band 0xFFFF), $bpSeg, $targetSegVal, $bpOffsetHex, $(if ($bpOffsetHex2) { "/$bpOffsetHex2" } else { '' }), $(if ($NoLoadSegShift) { 'NONE(unshifted)' } else { 'load_seg' }))
  # Keep the ORIGINAL proven-safe behavior through the timing-critical PLAY-click race and
  # intro/credits skip: delete BPINT here so a burst of unrelated lseeks can't halt the guest
  # (a halted guest silently drops GameLink input -- a known, previously-proven gotcha) during
  # the one window that must not race the attract-timer or lose a keypress. Only the new
  # bp_seg:257C execution breakpoint stays armed through this stretch, exactly as the
  # already-successful build/cok-m4-bp-run-cok run did.
  Invoke-DebuggerInput -Command 'BPDEL *' -Label 'calib-bpdel' | Out-Null
  Invoke-DebuggerInput -Command ('BP {0:X4}:{1}' -f $bpSeg, $bpOffsetHex) -Label 'calib-bp-arm' | Out-Null
  if ($bpOffsetHex2) {
    Invoke-DebuggerInput -Command ('BP {0:X4}:{1}' -f $bpSeg, $bpOffsetHex2) -Label 'calib-bp-arm2' | Out-Null
  }
  Invoke-DebuggerInput -Command 'RUN' -Label 'calib-resume' | Out-Null
  Assert-ExclusiveOwnership

  $distinctCs = [Collections.Generic.HashSet[string]]::new()
  $hitLog = [Collections.Generic.List[object]]::new()
  function Wait-WhileLoggingHits([double]$Seconds, [string]$Phase) {
    # Poll the debugger through a sleep window; on every genuine stop, log CS:IP (adding CS to
    # the distinct-set) and auto-RUN unless it is our real target (bp_seg:257C), in which case
    # return $true immediately without resuming so the caller can capture it. Never silently
    # eats a hit -- every stop this run sees is recorded in $script:hitLog. Only used from
    # Phase 4 (dungeon load) onward, once BPINT 21 42 is re-armed alongside the target BP --
    # see the "re-arm" comment below for why the earlier boot/menu/intro phases stay on plain
    # Start-Sleep with ONLY the target BP armed.
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    $n = 0
    while ([DateTime]::UtcNow -lt $deadline) {
      Start-Sleep -Milliseconds 150
      $snap = Invoke-DebuggerInput -SnapshotOnly -Label ("watch-{0}-{1:D3}" -f $Phase, $n)
      $n++
      if (Get-Stopped $snap) {
        $csIp = Get-CsIp $snap
        if ($csIp) {
          $isTarget = ($csIp.cs -eq $bpSeg -and ($csIp.ip -eq $targetOffVal -or ($null -ne $targetOffVal2 -and $csIp.ip -eq $targetOffVal2)))
          $script:distinctCs.Add(('{0:X4}' -f $csIp.cs)) | Out-Null
          $eax = Get-Reg $snap 'EAX'; $ebx = Get-Reg $snap 'EBX'; $ecx = Get-Reg $snap 'ECX'
          $script:hitLog.Add([ordered]@{
            phase = $Phase; cs = ('{0:X4}' -f $csIp.cs); ip = ('{0:X4}' -f $csIp.ip); is_target = $isTarget
            ax = if ($null -ne $eax) { '{0:X4}' -f ($eax -band 0xFFFF) } else { $null }
            bx = if ($null -ne $ebx) { '{0:X4}' -f ($ebx -band 0xFFFF) } else { $null }
            cx = if ($null -ne $ecx) { '{0:X4}' -f ($ecx -band 0xFFFF) } else { $null }
          }) | Out-Null
          Write-Host ("[cok-m4-bp] watch-hit phase={0} {1:X4}:{2:X4} target={3} AX={4:X4} BX={5:X4} CX={6:X4}" -f $Phase, $csIp.cs, $csIp.ip, $isTarget, $eax, $ebx, $ecx)
          if ($isTarget) { return $true }
          Invoke-DebuggerInput -Command 'RUN' -Label ("watch-resume-{0}-{1:D3}" -f $Phase, $n) | Out-Null
        }
      }
    }
    return $false
  }
  $earlyHit = $false

  Start-Sleep -Seconds 4
  Assert-ExclusiveOwnership

  # --- Phase 2: launch menu -> PLAY. ------------------------------------------------------
  Press @('enter') 0.2
  Start-Sleep -Seconds 1.5
  Invoke-FastPlayClick
  Start-Sleep -Seconds 1
  $rec = Shoot '01-after-play-click'

  # --- Phase 3: skip intro/credits until the party menu. ---------------------------------
  $atMenu = $false
  for ($i = 1; $i -le 16; $i++) {
    if (-not $rec) { break }
    if ($rec.text -match '(?i)LOAD SAVED|BEGIN ADVENTUR|CREATE CHARACTER|ADD CHARACTER') { $atMenu = $true; break }
    Press @('esc') 0.15
    Start-Sleep -Seconds 1
    $rec = Shoot ('02-skip{0:00}' -f $i)
  }
  if (-not $atMenu) { throw 'never reached party menu' }

  # ROUND 6b addition: NOW that the timing-critical race is safely behind us, re-arm BPINT 21
  # 42 (lseek) AND BPINT 21 3F (read) ALONGSIDE the still-armed bp_seg:257C execution
  # breakpoint, so the dungeon-load + journal-solve + movement/combat-setup stretch (where
  # overlay-bank loading, if it happens at all for this content, would actually occur) becomes
  # a full live diagnostic: every lseek/read gets logged (feeding $distinctCs, testing whether
  # overlay code ever appears at a CS other than the resident root segment, and whether ANY
  # file I/O happens in this window at all -- distinguishing "real DOS disk-read failure
  # feeding the literal on-screen DISK READ ERROR text" from "pure in-memory stack-overflow
  # corruption that happens to render text resembling that message") and auto-resumed, while a
  # real hit of our target still halts execution for capture. This directly tests the "harness
  # canonical-address whole-blob-load artifact" hypothesis empirically, without touching the
  # already-proven early-boot timing.
  Invoke-DebuggerInput -Command 'BPINT 21 42' -Label 'rearm-bpint-42' | Out-Null
  Invoke-DebuggerInput -Command 'BPINT 21 3F' -Label 'rearm-bpint-3f' | Out-Null

  # --- Phase 4-5: Load Saved Game -> (location, if prompted) -> slot A -> Begin Adventuring.
  if (-not $earlyHit) {
    Press @('l') 0.3; $earlyHit = Wait-WhileLoggingHits 2 'after-L'
    $rec = Shoot '03-after-L'
  }
  if (-not $earlyHit -and $rec.text -match '(?i)LOAD FROM WHERE|TDQK') {
    Press @('t') 0.3; $earlyHit = Wait-WhileLoggingHits 2 'after-T'; $rec = Shoot '04-after-T'
  }
  if (-not $earlyHit -and $rec.text -match '(?i)LOAD WHICH GAME|WHICH GAME') {
    Press @('a') 0.3; $earlyHit = Wait-WhileLoggingHits 1 'after-a'
    if (-not $earlyHit) { Press @('enter') 0.3; $earlyHit = Wait-WhileLoggingHits 3 'after-slotA-enter' }
    $rec = Shoot '05-after-slotA'
  }
  $tries = 0
  while (-not $earlyHit -and $rec.text -notmatch '(?i)BEGIN ADVENTUR' -and $tries -lt 3) {
    Press @('enter') 0.3; $earlyHit = Wait-WhileLoggingHits 2 ("load-retry{0:00}" -f $tries)
    $rec = Shoot ('05b-load{0:00}' -f $tries); $tries++
  }
  if (-not $earlyHit) {
    Press @('b') 0.3; $earlyHit = Wait-WhileLoggingHits 3 'after-B'
    $rec = Shoot '06-after-B'
  }

  # A capture function shared by the "hit early, during boot/load" path and the normal
  # phase-7 "hit during scripted movement" path -- same detailed register/memory dump either
  # way, just recording WHEN (which phase) it happened.
  $bpCaptures = [Collections.Generic.List[object]]::new()
  # ROUND 8: self-validating near/far return-address check, done LIVE against the real DOSBox-X
  # debugger (the same technique tools/unicorn_dqk_trace.py's _preceding_call_text/
  # _dqk_combat_setup_entry_text already proved out statically/in-Unicorn per
  # cok-m4-fidelity-plan.md §12.3/§13.2 -- ported here so round 8's live hits get the same
  # rigor instead of a fresh guess). Reads the 5 bytes ending at Seg:Off and checks whether they
  # decode as a far call (0x9A + 4-byte target, 5 bytes) or the last 3 of them decode as a near
  # call (0xE8 + 2-byte rel, 3 bytes) that would legitimately return exactly at Off.
  function Test-CallEndsAt([string]$segHex, [Nullable[int]]$off) {
    if ($null -eq $off -or $off -lt 5) { return $null }
    $readOff = ($off - 5) -band 0xFFFF
    $snap = Invoke-DebuggerInput -Command ('D {0}:{1:X4}' -f $segHex, $readOff) -Label ("callcheck-{0}-{1:X4}" -f $segHex, $off)
    $bytes = Get-DataBytes $snap
    if ($bytes.Length -lt 5) { return $null }
    if ($bytes[0] -eq 0x9A) { return 'far-call(9A)-MATCH' }
    if ($bytes[2] -eq 0xE8) { return 'near-call(E8)-MATCH' }
    return 'no-call-ending-here'
  }
  function Get-Word16([byte[]]$b, [int]$i) {
    if ($b.Length -ge ($i + 2)) { return [int]$b[$i] -bor ([int]$b[$i + 1] -shl 8) }
    return $null
  }
  function Get-DetailedCapture([string]$snap, [string]$phase, [string]$key, [string]$hitOffset) {
    $csIp = Get-CsIp $snap
    $ss = Get-Reg $snap 'SS'
    $spVal = Get-Reg $snap 'ESP'
    $sp = if ($null -ne $spVal) { $spVal -band 0xFFFF } else { $null }
    $ds = Get-Reg $snap 'DS'
    $es = Get-Reg $snap 'ES'
    $ax = Get-Reg $snap 'EAX'; $bx = Get-Reg $snap 'EBX'; $cx = Get-Reg $snap 'ECX'; $dx = Get-Reg $snap 'EDX'
    $si = Get-Reg $snap 'ESI'; $di = Get-Reg $snap 'EDI'

    # Raw top-of-stack dump (24 bytes covers either the far-call-entry or near-call-entry
    # interpretations below, plus a couple of trailing param words either way).
    $stackBytes = @()
    if ($null -ne $ss -and $null -ne $sp) {
      $stackSnap = Invoke-DebuggerInput -Command ('D {0:X4}:{1:X4}' -f $ss, $sp) -Label ("bp-stack-{0}" -f $script:bpCaptures.Count)
      $stackBytes = Get-DataBytes $stackSnap
    }

    # Far-call-entry hypothesis: [sp+0]/[sp+2] = return ip/cs (CPU pushes IP then CS for a far
    # call), [sp+4..] = the callee's own first parameter word(s). Self-validated against LIVE
    # memory at the candidate return address (does a real call instruction end there?).
    $farRetIp = Get-Word16 $stackBytes 0
    $farRetCs = Get-Word16 $stackBytes 2
    $farParam1 = Get-Word16 $stackBytes 4
    $farParam2 = Get-Word16 $stackBytes 6
    $farValid = if ($null -ne $farRetCs) { Test-CallEndsAt ('{0:X4}' -f $farRetCs) $farRetIp } else { $null }

    # Near-call-entry hypothesis: [sp+0] = return ip only (same segment as the callee, i.e.
    # $csIp.cs), [sp+2..] = first parameter word(s).
    $nearRetIp = Get-Word16 $stackBytes 0
    $nearParam1 = Get-Word16 $stackBytes 2
    $nearParam2 = Get-Word16 $stackBytes 4
    $nearParam3 = Get-Word16 $stackBytes 6
    $nearValid = if ($csIp) { Test-CallEndsAt ('{0:X4}' -f $csIp.cs) $nearRetIp } else { $null }

    $resNameSnap = if ($null -ne $ds) {
      Invoke-DebuggerInput -Command ('D {0:X4}:5FFD' -f $ds) -Label ("bp-resname-{0:D2}" -f $script:bpCaptures.Count)
    } else { $null }
    $resNameBytes = if ($resNameSnap) { Get-DataBytes $resNameSnap } else { @() }

    # ROUND 8: Ghidra's own decompile of AddCombatantToActiveRoster (canonical 1F4E:4AB6, §15.4)
    # shows `if (*(byte*)((int)*(far*)DS:0xB20F + 0x20) < 8)` -- the 8-slot roster-cap gate. Read
    # it live: a real far pointer at DS:0xB20F, and the byte at that pointer's own +0x20. If this
    # capture is really at 4AB6 the byte should read as a small, sane roster count (<=8), a
    # concrete cross-check independent of the CS:IP match alone.
    $rosterFarPtrBytes = @()
    $rosterCountByte = $null
    if ($null -ne $ds) {
      $rosterPtrSnap = Invoke-DebuggerInput -Command ('D {0:X4}:B20F' -f $ds) -Label ("bp-rosterptr-{0:D2}" -f $script:bpCaptures.Count)
      $rosterFarPtrBytes = Get-DataBytes $rosterPtrSnap
      $rosterOff = Get-Word16 $rosterFarPtrBytes 0
      $rosterSeg = Get-Word16 $rosterFarPtrBytes 2
      if ($null -ne $rosterOff -and $null -ne $rosterSeg) {
        $countAddrOff = ($rosterOff + 0x20) -band 0xFFFF
        $countSnap = Invoke-DebuggerInput -Command ('D {0:X4}:{1:X4}' -f $rosterSeg, $countAddrOff) -Label ("bp-rostercount-{0:D2}" -f $script:bpCaptures.Count)
        $countBytes = Get-DataBytes $countSnap
        if ($countBytes.Length -ge 1) { $rosterCountByte = $countBytes[0] }
      }
    }

    $capture = [ordered]@{
      phase = $phase
      after_key = $key
      hit_offset = $hitOffset
      full_snapshot = $snap
      cs = ('{0:X4}' -f $csIp.cs); ip = ('{0:X4}' -f $csIp.ip)
      ss = if ($ss) { '{0:X4}' -f $ss } else { $null }
      sp = if ($sp) { '{0:X4}' -f $sp } else { $null }
      ds = if ($ds) { '{0:X4}' -f $ds } else { $null }
      es = if ($es) { '{0:X4}' -f ($es -band 0xFFFF) } else { $null }
      ax = if ($null -ne $ax) { '{0:X4}' -f ($ax -band 0xFFFF) } else { $null }
      bx = if ($null -ne $bx) { '{0:X4}' -f ($bx -band 0xFFFF) } else { $null }
      cx = if ($null -ne $cx) { '{0:X4}' -f ($cx -band 0xFFFF) } else { $null }
      dx = if ($null -ne $dx) { '{0:X4}' -f ($dx -band 0xFFFF) } else { $null }
      si = if ($null -ne $si) { '{0:X4}' -f ($si -band 0xFFFF) } else { $null }
      di = if ($null -ne $di) { '{0:X4}' -f ($di -band 0xFFFF) } else { $null }
      stack_raw_hex = (($stackBytes | ForEach-Object { '{0:X2}' -f $_ }) -join ' ')
      far_call_hypothesis = [ordered]@{
        ret_ip = if ($null -ne $farRetIp) { '{0:X4}' -f $farRetIp } else { $null }
        ret_cs = if ($null -ne $farRetCs) { '{0:X4}' -f $farRetCs } else { $null }
        param1 = if ($null -ne $farParam1) { '{0:X4}' -f $farParam1 } else { $null }
        param2 = if ($null -ne $farParam2) { '{0:X4}' -f $farParam2 } else { $null }
        call_check = $farValid
      }
      near_call_hypothesis = [ordered]@{
        ret_ip = if ($null -ne $nearRetIp) { '{0:X4}' -f $nearRetIp } else { $null }
        param1 = if ($null -ne $nearParam1) { '{0:X4}' -f $nearParam1 } else { $null }
        param2 = if ($null -ne $nearParam2) { '{0:X4}' -f $nearParam2 } else { $null }
        param3 = if ($null -ne $nearParam3) { '{0:X4}' -f $nearParam3 } else { $null }
        call_check = $nearValid
      }
      resource_name_bytes_ascii = Get-AsciiText $resNameBytes
      roster_far_ptr_raw_hex = (($rosterFarPtrBytes | ForEach-Object { '{0:X2}' -f $_ }) -join ' ')
      roster_count_byte = if ($null -ne $rosterCountByte) { '0x{0:X2}' -f $rosterCountByte } else { $null }
    }
    $script:bpCaptures.Add($capture) | Out-Null
    Write-Host ("  [capture] CS:IP={0}:{1} stack={2}" -f $capture.cs, $capture.ip, $capture.stack_raw_hex)
    Write-Host ("  [capture] far-hyp  ret={0}:{1} param1={2} param2={3} check={4}" -f $capture.far_call_hypothesis.ret_cs, $capture.far_call_hypothesis.ret_ip, $capture.far_call_hypothesis.param1, $capture.far_call_hypothesis.param2, $capture.far_call_hypothesis.call_check)
    Write-Host ("  [capture] near-hyp ret={0}:{1} param1={2} param2={3} param3={4} check={5}" -f $csIp.cs.ToString('X4'), $capture.near_call_hypothesis.ret_ip, $capture.near_call_hypothesis.param1, $capture.near_call_hypothesis.param2, $capture.near_call_hypothesis.param3, $capture.near_call_hypothesis.call_check)
    return $capture
  }

  if ($earlyHit) {
    Write-Host "[cok-m4-bp] *** BREAKPOINT HIT EARLY (before scripted movement) *** -- capturing and skipping remaining boot/load/movement phases."
    $earlySnap = Invoke-DebuggerInput -SnapshotOnly -Label 'early-hit-snap'
    $earlyCsIp = Get-CsIp $earlySnap
    $bpHit = Get-DetailedCapture $earlySnap 'early' $null (if ($earlyCsIp) { '{0:X4}' -f $earlyCsIp.ip } else { $null })
  }

  # --- Phase 6: journal-word protection prompt (skip cleanly if not shown). --------------
  $solvedProtection = $false
  $diskReadError = $false
  for ($j = 1; $j -le 5 -and $rec -and -not $earlyHit; $j++) {
    if ($rec.text -match '(?i)disk read error') { $diskReadError = $true; break }
    if ($rec.text -match '(?i)after the heading|what is word|word #') {
      # Defensive: some vision reads return the raw model JSON blob (nested inside its own
      # "visible_text" field) instead of a clean-parsed string -- observed live this round
      # (2026-07-18, round 6). Extract just the JOURNAL...ENTER span before handing it to the
      # solver, which otherwise chokes on the stray braces/quotes.
      $promptText = $rec.text
      $extractMatch = [regex]::Match($promptText, '(?i)JOURNAL.*?ENTER')
      if ($extractMatch.Success) { $promptText = $extractMatch.Value }
      $ans = Solve-Protection $promptText
      if (-not $ans) {
        Write-Host "[cok-m4-bp] journal solve failed on first read, retrying vision read once..."
        $rec = Shoot ('06b-retry-{0:00}' -f $j)
        $promptText = $rec.text
        $extractMatch = [regex]::Match($promptText, '(?i)JOURNAL.*?ENTER')
        if ($extractMatch.Success) { $promptText = $extractMatch.Value }
        $ans = Solve-Protection $promptText
      }
      if (-not $ans) { throw "journal prompt unsolved/low-confidence: $promptText" }
      Write-Host "[cok-m4-bp] journal solved -> '$ans'"
      $confirmRec = Type-WordAndConfirm $ans ('07-typed-{0:00}' -f $j)
      if ($confirmRec.text -notmatch [regex]::Escape($ans.ToUpperInvariant())) {
        throw "typed answer '$ans' does not match on-screen echo ('$($confirmRec.text)')"
      }
      Press @('enter') 0.3
      Start-Sleep -Seconds 3
      $solvedProtection = $true
      $rec = Shoot ('08-after-journal-{0:00}' -f $j)
      continue
    }
    break
  }

  # --- Phase 7: movement, polling the debugger for the combat-setup-entry breakpoint. ----
  # BPINT 21 42 is STILL armed (round 6b -- see the calibration comment above), so every
  # lseek during movement/combat-setup also stops here and gets logged+auto-resumed via the
  # same "unexpected stop" branch, in addition to our real target.
  $stepIndex = 0
  foreach ($key in $MovementKeys) {
    if ($earlyHit) { break }
    Press @($key) 0.35
    $stepIndex++
    $hitThisKey = $false
    for ($p = 0; $p -lt $StopPollTriesPerKey; $p++) {
      Start-Sleep -Milliseconds $StopPollMs
      $snap = Invoke-DebuggerInput -SnapshotOnly -Label ("poll-{0:D2}-{1:D2}" -f $stepIndex, $p)
      if (Get-Stopped $snap) {
        $csIp = Get-CsIp $snap
        if ($csIp -and $csIp.cs -eq $bpSeg -and ($csIp.ip -eq $targetOffVal -or ($null -ne $targetOffVal2 -and $csIp.ip -eq $targetOffVal2))) {
          Write-Host "[cok-m4-bp] *** BREAKPOINT HIT *** after key '$key' (step $stepIndex) at offset $('{0:X4}' -f $csIp.ip)"
          $distinctCs.Add(('{0:X4}' -f $csIp.cs)) | Out-Null
          $hitLog.Add([ordered]@{ phase = "move-$stepIndex"; cs = ('{0:X4}' -f $csIp.cs); ip = ('{0:X4}' -f $csIp.ip); is_target = $true }) | Out-Null
          Get-DetailedCapture $snap "move-$stepIndex" $key ('{0:X4}' -f $csIp.ip) | Out-Null
          $hitThisKey = $true
          break
        } elseif ($csIp) {
          # A genuine stop that is NOT our target breakpoint -- with BPINT 21 42 kept armed
          # this round, this is EXPECTED (lseeks during dungeon-load/combat-setup) rather than
          # an anomaly. Log the CS (feeds the distinct-segment diagnostic) and resume.
          $distinctCs.Add(('{0:X4}' -f $csIp.cs)) | Out-Null
          $hitLog.Add([ordered]@{ phase = "move-$stepIndex"; cs = ('{0:X4}' -f $csIp.cs); ip = ('{0:X4}' -f $csIp.ip); is_target = $false }) | Out-Null
          Write-Host ("[cok-m4-bp] non-target stop at {0:X4}:{1:X4} (not our target {2:X4}:{3}) -- resuming" -f $csIp.cs, $csIp.ip, $bpSeg, $bpOffsetHex)
          Invoke-DebuggerInput -Command 'RUN' -Label ("nontarget-resume-{0:D2}-{1:D2}" -f $stepIndex, $p) | Out-Null
        }
      }
    }
    Assert-ExclusiveOwnership
    Shoot ("09-walk-{0:D2}-{1}" -f $stepIndex, $key) | Out-Null
    if ($hitThisKey) { $bpHit = $bpCaptures[-1]; break }
  }

  if (-not $bpHit -and -not $earlyHit) {
    Write-Host "[cok-m4-bp] breakpoint never hit within the scripted movement -- capturing final state anyway."
    $finalSnap = Invoke-DebuggerInput -SnapshotOnly -Label 'final-state'
    Shoot '10-final-no-hit' | Out-Null
  }

  [ordered]@{
    schema_version = 1
    title = 'CoK M4 combat-setup-entry breakpoint capture'
    mount = $MountDir
    calibration = [ordered]@{ cs_at_ah42_stop = ('{0:X4}' -f $csAtCalib); bp_seg = ('{0:X4}' -f $bpSeg); bp_offset = $bpOffsetHex; bp_offset2 = $bpOffsetHex2; target_canonical_seg = ('{0:X4}' -f $targetSegVal); no_load_seg_shift = [bool]$NoLoadSegShift }
    reached_party_menu = $atMenu
    solved_protection = $solvedProtection
    disk_read_error = $diskReadError
    movement_keys = $MovementKeys
    breakpoint_hit = [bool]$bpHit
    breakpoint_hit_early = [bool]$earlyHit
    breakpoint_captures = $bpCaptures
    distinct_cs_segments_seen = @($distinctCs)
    lseek_and_bp_hit_log = $hitLog
    timeline = $timeline
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'report.json') -Encoding utf8
  Write-Host ""
  Write-Host "===== VERDICT ====="
  Write-Host "bp_seg              : $('{0:X4}' -f $bpSeg):$bpOffsetHex"
  Write-Host "breakpoint hit      : $([bool]$bpHit) (early=$([bool]$earlyHit))"
  Write-Host "distinct CS segs    : $($distinctCs -join ', ')"
  if ($bpHit) {
    Write-Host "id_value            : $($bpHit.id_value)"
    Write-Host "resource_name       : $($bpHit.resource_name_bytes_ascii)"
    Write-Host "id_content_window   : $($bpHit.id_content_window_ascii)"
  }
  Write-Host "report              : $(Join-Path $out 'report.json')"
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
