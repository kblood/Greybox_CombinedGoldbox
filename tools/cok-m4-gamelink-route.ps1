# tools/cok-m4-gamelink-route.ps1 — CoK M4 (content-port Milestone 4, behavioral-fidelity)
# turnkey DOSBox-X GameLink driver.
#
# STATUS (2026-07-18 live run): phases 1-6 below (launch -> PLAY -> intro skip -> party menu ->
# load save -> Begin Adventuring -> journal-word protection) are now PROVEN end-to-end against
# build/cok-on-dqk-m4fidelity in a real DOSBox-X/GameLink session (not just written from proven
# primitives — actually run, multiple times, with screenshots at every step). Phase 7 (the target
# encounter) is NOT YET REACHED: every live attempt hits a reproducible "DISK READ ERROR" on the
# post-protection load, independent of whether the typed protection answer is correct (see the
# "KNOWN OPEN ISSUE" note below `Solve-Protection`). Two real bugs found and fixed THIS pass are
# folded in below; do not re-discover them:
#
#   (a) DOSBox-X's [sdl] `mouse_emulation` config key defaults to "locked"
#       (MOUSE_EMULATION_LOCKED in src/gui/sdlmain.cpp) which only applies injected GameLink mouse
#       motion to the guest's cursor position when `user_cursor_locked` is true — a state normally
#       set by a REAL host click-to-capture that a focusless/minimized GameLink session never
#       performs. Without the fix, EVERY GameLink mouse click is silently discarded (button state
#       updates, but the position the guest reads does not) — confirmed by reading
#       `Mouse_CursorMoved()` in build/tools/dosbox-x-source-2026.07.02/src/ints/mouse.cpp. Fix:
#       tools/dosbox_x_debugbox_probe.ps1 now accepts `-ExtraSdlConf "mouse_emulation=always"`
#       (added this pass, additive/backward-compatible) — this script always passes it.
#   (b) Even WITH that fix, the click only lands if fired FAST: DQK's launch menu has a short idle
#       timeout that auto-plays an attract-mode intro/demo loop and returns to the title screen
#       regardless of input. A vision-model (Ollama) round-trip between "confirm title" and "click
#       PLAY" reliably eats enough wall-clock time to lose the race — every attempt that inserted a
#       Shoot (vision) call in between failed silently (byte-identical framebuffer before/after).
#       Fix: the corner-reset + move + click sequence now runs as ONE combined Python process
#       (Invoke-FastPlayClick below) with NO vision call in between reaching the title and clicking.
#   (c) The intro/credit slides after PLAY do NOT reliably skip on Enter (repeated Enter presses
#       were observed to auto-play the full intro then loop back to the unclicked title screen,
#       never reaching the party menu). ESC reliably advances through each slide to the party menu
#       (LOAD SAVED GAME / BEGIN ADVENTURING) instead — this script now uses ESC, not Enter, for
#       the intro-skip loop.
#
# What this does, phase by phase:
#   0. Build freshness: assumes the caller already ran tools/build-dqk-dir.mts (see the fidelity
#      plan doc §1) and tools/cok_m4_static_verify.mts (§4.0 data-layer check) — this script only
#      drives DOSBox-X, it does not rebuild.
#   1. Launch DOSBox-X in GameLink mode (focusless; see docs/engine/research/dosbox-x-gamelink-
#      automation.md) against the build directory, with `-ExtraSdlConf "mouse_emulation=always"`
#      (see (a) above), honoring the project's "max 1 DOSBox-X agent" rule.
#   2. Wait for the boot splash, press Enter once to reach the illustrated PLAY/DEMO/QUIT launch
#      menu, then IMMEDIATELY (no vision call in between) fire the corner-reset mouse click on PLAY
#      — see (b) above.
#   3. Skip intro/credits via ESC (not Enter — see (c) above) until the party menu.
#   4. Load the dropped save: L -> T (TDQK location) -> A (slot A) -> Enter -> settle -> confirm the
#      roster screenshot (proven this pass to show DQK's own shipped pregen party exactly as
#      predicted by the fidelity plan §4.1: SIR DRYDEN / JORIS THE WISE / LENDUIRA / neacail /
#      ALARIC THE BOLD / MAIGUREIGNE, partySize 6).
#   5. Begin Adventuring: B.
#   6. DQK's OWN journal-word copy-protection prompt fires here (this is DQK.EXE's native check,
#      NOT CoK's ECL-level PROGRAM-0 check — see docs/engine/research/dqk-copy-protection.md).
#      Screenshot, vision-read the prompt text, solve it via the engine solver
#      (tools/dqk-protection-solve.mts / packages/engine/src/loaders/dqkProtection.ts) against
#      LOCALLY extracted Journal.pdf/Codes.pdf text, type the answer letter-by-letter via GameLink,
#      then SCREENSHOT AGAIN to visually confirm the on-screen echo matches the intended word
#      BEFORE pressing Enter (a wrong/garbled answer here produces an unrecoverable-within-boot
#      "DISK READ ERROR" punishment, so verify before committing).
#
#      *** KNOWN OPEN ISSUE (2026-07-18 live finding, not yet root-caused): three separate live
#      attempts this pass, across three different randomized protection questions, each typed a
#      verified-correct answer (independently cross-checked against both the reconstructed journal
#      paragraph AND the GOG Codes.pdf answer key: "battlefield" for "After Combat" #9, "such" for
#      "Saving Throws" #2 [this is the module's own long-documented worked example], and "integral"
#      for "Magic" #3) and confirmed via on-screen echo BEFORE pressing Enter — yet all three still
#      produced "DISK READ ERROR" on submission. This rules out a wrong/garbled-keystroke answer as
#      the cause. All three attempts also showed the SAME secondary symptom regardless of which
#      question/answer: position frozen at "7,13" (not the plan's expected dungeon spawn "14,10"
#      for area 34) and the dungeon 3D-view pane staying solid BLACK. The likely real explanation:
#      "DISK READ ERROR" here is NOT actually gating on protection correctness at all — it looks
#      like a generic failure the game shows when it can't load/render the resumed area's content,
#      which happens to occur at this exact point in the sequence regardless of the typed answer.
#      This needs a DOSBox-X debugger trace (breakpoint on the load-dispatch or a `D <DS>:0011 /
#      0x001b / 0x002d` watch per docs/engine/research/dqk-save-resume.md's tail section) to
#      confirm whether area 34's ported GEO/ECL content is failing to load at the DQK.EXE runtime
#      level (a genuine R1 port/rule divergence) versus a harness/mount artifact specific to this
#      headless DOSBox-X launch path. NOT YET DIAGNOSED FURTHER — this is the actual remaining
#      blocker before Phase 7 (the target encounter) can be reached. See the fidelity plan doc's
#      2026-07-18 addendum for the full evidence trail (3 runs, screenshots, cross-checked answers).
#
#   7. (blocked — see above) Drive the byte-grounded 22-directed-edge-step walk to cell (3,15)
#      facing west (docs/engine/research/cok-natural-route.md), screenshotting periodically.
#   8. (blocked) Drain the flavour beat, select ATTACK — keybinding still genuinely unverified.
#   9. (blocked) Capture the combat screen, save a report.json with every frame + a verdict.
#
# Prereqs: a built `cok-on-dqk` directory with a --save-area 34 --save-ecl-member 34
# --save-dungeon resume save already dropped (tools/build-dqk-dir.mts; see the fidelity plan doc).
# A local qwen3-vl (or equivalent) Ollama vision model for prompt reading (reuses
# tools/dosbot/lib.ps1's Invoke-Vision) OR a human eyeballing the saved PNGs. GameLink screenshots
# come back with an all-zero alpha channel (DOSBox-X quirk, not a bug in this script or the
# client) — anything that displays/diffs them should flatten alpha to opaque first, or a genuinely
# rendered frame will appear blank white.
#
# Usage:
#   pwsh tools/cok-m4-gamelink-route.ps1 -MountDir build/cok-on-dqk-m4fidelity `
#       -JournalTxt C:\scratch\cok_journal.txt -CodesTxt C:\scratch\cok_codes.txt `
#       -OutDir build/cok-m4-run-01

param(
  [string]$MountDir = "build/cok-on-dqk-m4fidelity",
  [Parameter(Mandatory)][string]$OutDir,
  # pdftotext output of DQK's OWN Journal.pdf / Codes.pdf (copyrighted GOG assets -- extract
  # locally, never commit). NOTE: DQK's own journal-word prompt uses DQK's Journal.pdf/Codes.pdf
  # (from "The Dark Queen of Krynn"), not CoK's -- this is DQK.EXE's native protection, see phase 6
  # above. Typical extraction: `pdftotext -raw "The Dark Queen of Krynn/Journal.pdf" <JournalTxt>`.
  [string]$JournalTxt = "C:\Modding\GoldBox\build\dqk_journal.txt",
  [string]$CodesTxt = "C:\Modding\GoldBox\build\dqk_codes.txt",
  # The byte-grounded walk from docs/engine/research/cok-natural-route.md / tools/find_geo_path.py
  # (GEO1.DAX#34, start (14,10,north), target (3,15) facing west). Each token is one GameLink key.
  # NOT YET EXERCISED live -- phase 7 is blocked on the "KNOWN OPEN ISSUE" above.
  [string[]]$MovementKeys = @(
    'right','up','right','up','up','up','right','up','up','left','up','right','up','up','up',
    'right','up','left','up','right','up','left','up','up','left','up','right','up','left','up',
    'right','up','left','up','right','up','up'
  ),
  [ValidateRange(1,600)][int]$OverallTimeoutSec = 300,
  [ValidateRange(1,1800)][int]$ExclusivityWaitTimeoutSec = 600
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
$fastClickScript = Join-Path $out '_fast_play_click.py'
. (Join-Path $repo 'tools\dosbot\lib.ps1')  # reuse Invoke-Vision only (Ollama vision reader)

if (-not (Test-Path $dbx)) { throw "DOSBox-X build not found: $dbx -- see docs/engine/research/dosbox-x-gamelink-automation.md" }

function Get-DosboxPids {
  return @(Get-CimInstance Win32_Process -Filter "Name='dosbox-x.exe'" -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty ProcessId)
}
function Wait-ExclusiveDosboxSlot {
  Write-Host '[cok-m4] waiting for an empty dosbox-x.exe process list (GameLink singleton hazard)...'
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

$timeline = [Collections.Generic.List[object]]::new()
# Flatten the all-zero-alpha GameLink screenshot to an opaque PNG alongside the raw one, so a human
# (or this script's own report) can actually see the frame -- a real 2026-07-18 gotcha: DOSBox-X's
# GameLink screenshots come back with alpha=0 everywhere, which renders as solid white in most
# viewers even though real pixel data is present underneath.
function Save-ViewablePng([string]$rawPng) {
  $viewPng = [System.IO.Path]::ChangeExtension($rawPng, $null) + '-view.png'
  & python -c @"
from PIL import Image
im = Image.open(r'$rawPng').convert('RGBA')
r,g,b,a = im.split()
Image.merge('RGB',(r,g,b)).save(r'$viewPng')
"@ 2>$null | Out-Null
}
function Shoot([string]$name) {
  Assert-ExclusiveOwnership
  $png = Join-Path $out "$name.png"
  & python $gameLink screenshot $png | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host "[cok-m4] WARN: screenshot failed for $name"; return $null }
  Save-ViewablePng $png
  $rec = $null
  try {
    $v = Invoke-Vision -Png $png
    $rec = [pscustomobject]@{ name = $name; screen = $v.screen; text = "$($v.visible_text)"; png = "$name.png" }
    Write-Host ("  [{0,-18}] {1,-12} | {2}" -f $name, $v.screen, $rec.text)
  } catch {
    Write-Host "  [$name] (vision read unavailable: $($_.Exception.Message)) -- inspect $png manually"
    $rec = [pscustomobject]@{ name = $name; screen = 'unknown'; text = ''; png = "$name.png" }
  }
  $timeline.Add($rec) | Out-Null
  return $rec
}
# A screenshot WITHOUT a vision-model round-trip -- use this on any latency-sensitive path (the
# launch-menu click race; see (b) in the header). Still flattens alpha for later inspection.
function ShootRaw([string]$name) {
  Assert-ExclusiveOwnership
  $png = Join-Path $out "$name.png"
  & python $gameLink screenshot $png | Out-Null
  Save-ViewablePng $png
  return $png
}
function Press([string[]]$Keys, [double]$Pace = 0.3, [double]$Hold = 0.15) {
  Assert-ExclusiveOwnership
  foreach ($k in $Keys) {
    & python $gameLink press $k --hold $Hold --pace $Pace | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "GameLink press failed for: $k" }
  }
}
# Type a word letter-by-letter, THEN screenshot to visually confirm the on-screen echo BEFORE the
# caller presses Enter (a wrong/garbled answer is unrecoverable within that boot -- DISK READ
# ERROR). Returns the confirmation screenshot record; does NOT press Enter itself.
function Type-WordAndConfirm([string]$Word, [string]$ShotName) {
  foreach ($ch in $Word.ToLowerInvariant().ToCharArray()) {
    if ($ch -match '[a-z0-9]') { Press @([string]$ch) 0.3 0.2 }
  }
  return Shoot $ShotName
}

# Fast (single Python process, zero vision round-trip) corner-reset + move + click on the launch
# menu's PLAY button. GameLink's mouse model is relative-delta only -- a large negative delta pins
# the cursor at the guest's (0,0), then a move by the target pixel offset lands on PLAY (bottom-
# left of the 640x400 launch frame). PROVEN this pass (three independent live runs) -- but ONLY
# when fired with no vision call in between confirming the title screen and clicking (see header).
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

# Solve DQK's journal-word prompt via the engine solver (pure lookup over locally-extracted text).
function Solve-Protection([string]$visionText) {
  if (-not (Test-Path $JournalTxt)) { Write-Host "[cok-m4] no journal text at $JournalTxt"; return $null }
  $cliArgs = @('-y','tsx@4', (Join-Path $repo 'tools\dqk-protection-solve.mts'), '--journal', $JournalTxt, '--prompt', $visionText)
  if (Test-Path $CodesTxt) { $cliArgs += @('--codes', $CodesTxt) }
  $result = (& npx.cmd @cliArgs 2>$null | Out-String).Trim()
  if ($result -and $result -notmatch '\s') { return $result }
  return $null
}

$process = $null
try {
  Wait-ExclusiveDosboxSlot
  # GameLink for input/screenshots; the debugger console handles only the initial RUN past the
  # DEBUGBOX pause (same division of labor as tools/trace_pool_ecl2_20_gamelink_route.ps1).
  # -ExtraSdlConf "mouse_emulation=always" is REQUIRED (see header (a)) -- without it every
  # GameLink mouse click is silently discarded regardless of where it targets.
  & $probe -DbxExe $dbx -GameDir $mount -Exe 'DQK.EXE' -OutDir $out `
    -GameLink -DebuggerAction @('RUN') -NoActionScreenshots -ExtraSdlConf 'mouse_emulation=always'
  # NOTE: no -Cycles override here (a prior attempt with `-Cycles 'fixed 25000'`, inherited from
  # register-level breakpoint traces elsewhere in this repo, was suspected as a possible cause of
  # the DISK READ ERROR finding above; a retry WITHOUT it hit the identical symptom, ruling that
  # out as the explanation -- but omitting it is still strictly closer to the build's own shipped
  # dosbox.conf [cpu] section (`cycles=max`), so kept omitted here as the more faithful default).
  if (-not $?) { throw 'DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  Assert-ExclusiveOwnership
  Start-Sleep -Seconds 4
  Assert-ExclusiveOwnership

  # --- Phase 2: launch menu -> PLAY. Enter once to reach the menu, THEN an immediate fast click. -
  Press @('enter') 0.2
  Start-Sleep -Seconds 1.5
  Invoke-FastPlayClick
  Start-Sleep -Seconds 1
  $rec = Shoot '01-after-play-click'

  # --- Phase 3: skip intro/credits until the party menu, via ESC (NOT Enter -- see header (c)). -
  $atMenu = $false
  for ($i = 1; $i -le 16; $i++) {
    if (-not $rec) { break }
    if ($rec.text -match '(?i)LOAD SAVED|BEGIN ADVENTUR|CREATE CHARACTER|ADD CHARACTER') { $atMenu = $true; break }
    Press @('esc') 0.15
    Start-Sleep -Seconds 1
    $rec = Shoot ('02-skip{0:00}' -f $i)
  }
  if (-not $atMenu) { throw 'never reached party menu -- see fidelity plan failure playbook (wont-boot / stuck-intro)' }

  # --- Phase 4-5: Load Saved Game -> TDQK -> slot A -> Begin Adventuring. -------------------
  Press @('l') 0.3; Start-Sleep -Seconds 2
  $rec = Shoot '03-after-L'
  if ($rec.text -match '(?i)LOAD FROM WHERE|TDQK') { Press @('t') 0.3; Start-Sleep -Seconds 2; $rec = Shoot '04-after-T' }
  if ($rec.text -match '(?i)LOAD WHICH GAME|WHICH GAME') {
    Press @('a') 0.3; Start-Sleep -Seconds 1; Press @('enter') 0.3; Start-Sleep -Seconds 3
    $rec = Shoot '05-after-slotA'
  }
  $tries = 0
  while ($rec.text -notmatch '(?i)BEGIN ADVENTUR' -and $tries -lt 3) {
    Press @('enter') 0.3; Start-Sleep -Seconds 2
    $rec = Shoot ('05b-load{0:00}' -f $tries); $tries++
  }
  Press @('b') 0.3; Start-Sleep -Seconds 3
  $rec = Shoot '06-after-B'

  # --- Phase 6: DQK's own journal-word protection prompt. -----------------------------------
  $solvedProtection = $false
  $diskReadError = $false
  for ($j = 1; $j -le 5 -and $rec; $j++) {
    if ($rec.text -match '(?i)disk read error') { $diskReadError = $true; break }
    if ($rec.text -match '(?i)after the heading|what is word|word #') {
      $ans = Solve-Protection $rec.text
      if (-not $ans) { throw "journal prompt unsolved/low-confidence: $($rec.text) -- see fidelity plan failure playbook (protection loop)" }
      Write-Host "[cok-m4] journal solved -> '$ans'"
      $confirmRec = Type-WordAndConfirm $ans ('07-typed-{0:00}' -f $j)
      if ($confirmRec.text -notmatch [regex]::Escape($ans.ToUpperInvariant())) {
        throw "typed answer '$ans' does not match on-screen echo ('$($confirmRec.text)') -- ABORTING before Enter to avoid an unrecoverable DISK READ ERROR; see failure playbook"
      }
      Press @('enter') 0.3
      Start-Sleep -Seconds 3
      $solvedProtection = $true
      $rec = Shoot ('08-after-journal-{0:00}' -f $j)
      continue
    }
    break
  }
  if ($diskReadError) {
    Write-Host "[cok-m4] DISK READ ERROR reached -- see this script's header 'KNOWN OPEN ISSUE': reproduced 3x live this pass with independently-verified-correct answers, root cause NOT YET the typed word (likely a resumed-area load failure, not a protection failure). Stopping here rather than proceeding on a corrupted boot."
  }

  # --- Phase 7: drive the byte-grounded 22-step walk to (3,15) facing west. NOT REACHED YET --
  # --- (blocked on the DISK READ ERROR issue above) -- left in place for when it's unblocked. --
  if (-not $diskReadError) {
    $stepIndex = 0
    foreach ($key in $MovementKeys) {
      Press @($key) 0.35
      Start-Sleep -Milliseconds 500
      $stepIndex++
      if ($stepIndex % 6 -eq 0) { Shoot ('09-walk-{0:00}' -f $stepIndex) | Out-Null }
    }
    $rec = Shoot '10-at-target-cell'

    # --- Phase 8: drain the flavour beat, select ATTACK. Keybinding UNVERIFIED -- try Enter, --
    # --- then '1', then Down+Enter, screenshotting between each attempt. ---------------------
    Press @('enter') 0.5; Start-Sleep -Seconds 2
    $rec = Shoot '11-after-flavour-beat'
    if ($rec.text -match '(?i)ATTACK') {
      Press @('enter') 0.5   # ATTACK is choice 0 / default-highlighted per the proven engine golden
      Start-Sleep -Seconds 3
      $rec = Shoot '12-after-attack-attempt1'
      if ($rec.text -notmatch '(?i)combat|hobgoblin|warrior|mage') {
        Press @('1') 0.5; Start-Sleep -Seconds 2; $rec = Shoot '12b-after-attack-attempt2'
      }
      if ($rec.text -notmatch '(?i)combat|hobgoblin|warrior|mage') {
        Press @('down') 0.3; Press @('enter') 0.5; Start-Sleep -Seconds 2; $rec = Shoot '12c-after-attack-attempt3'
      }
    }
  }

  $combatReached = [bool]($timeline | Where-Object { $_.text -match '(?i)hobgoblin|warrior|black robe mage|combat' })
  [ordered]@{
    schema_version = 1
    title = 'Champions of Krynn (on DQK engine) -- M4 fidelity run'
    mount = $MountDir
    reached_party_menu = $atMenu
    solved_protection = $solvedProtection
    disk_read_error = $diskReadError
    combat_reached = $combatReached
    expected_roster = @(
      @{ id = 13; name = 'HOBGOBLIN LDR'; count = 8 },
      @{ id = 35; name = 'WARRIOR'; count = 5 },
      @{ id = 38; name = 'BLACK ROBE MAGE'; count = 2 }
    )
    timeline = $timeline
    claim_boundary = 'proves whether the scripted route reaches the byte-verified GEO1.DAX#34/ECL1.DAX#34 selector-28 encounter on the real DQK.EXE; as of 2026-07-18 it reliably proves phases 1-6 (launch through a verified-correct-but-rejected protection answer) and hits a reproducible DISK READ ERROR before phase 7 -- see this script header for the open-issue writeup.'
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $out 'report.json') -Encoding utf8
  Write-Host ""
  Write-Host "===== VERDICT ====="
  Write-Host "reached party menu : $atMenu"
  Write-Host "solved protection  : $solvedProtection"
  Write-Host "disk read error    : $diskReadError"
  Write-Host "combat reached     : $combatReached"
  Write-Host "report             : $(Join-Path $out 'report.json')"
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
