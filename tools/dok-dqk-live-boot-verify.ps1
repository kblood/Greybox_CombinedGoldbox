# tools/dok-dqk-live-boot-verify.ps1 -- first live DOSBox-X/GameLink boot check of
# build/dok-dqk-release/ (the packaged DoK-on-DQK executable, see its own README.md and
# docs/engine/HANDOFF.md's "DoK.exe packaged" entry, 2026-07-19).
#
# Purpose: this build had ONLY static verification (tsc, engine vitest, cok_m4_static_verify.mts)
# before this script -- nobody had booted it in real DOSBox-X. This is a verification pass only
# (no fixes attempted here, per the calling task's explicit instruction), modelled directly on the
# proven tools/cok-m4-gamelink-route.ps1 turnkey driver (same launch/menu/load/protection phases,
# same GameLink singleton-exclusivity guards, same alpha-flatten screenshot helper) since CoK's own
# package got exactly this style of live check during its M4 investigation and DoK's had none.
#
# What this checks (matches the calling task's 4 numbered goals):
#   1. Boots to a real in-game screen (not crash/black/DOS error).
#   2. Loads the shipped resume save (area 34, "Cekos") and confirms sane party/dungeon state.
#   3. Attempts a real movement key and confirms the game responds (framebuffer changes).
#   4. Best-effort visual note on wall art in the reached area (34 is one of the 8/19 areas with
#      real ported wall art per the build's own README) -- no separate placeholder-area navigation
#      is attempted, since no proven route to any of those 11 areas exists from this save.
#
# Usage:
#   pwsh tools/dok-dqk-live-boot-verify.ps1 -OutDir build/dok-live-boot-01

param(
  [string]$MountDir = "build/dok-dqk-release",
  [Parameter(Mandatory)][string]$OutDir,
  [string]$JournalTxt = "C:\Modding\GoldBox\build\dqk_journal.txt",
  [string]$CodesTxt = "C:\Modding\GoldBox\build\dqk_codes.txt",
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
  Write-Host '[dok-live] waiting for an empty dosbox-x.exe process list (GameLink singleton hazard)...'
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
function Save-ViewablePng([string]$rawPng) {
  # `ChangeExtension(path, $null)` leaves the trailing dot on Windows (`shot.-view.png`),
  # while the later pixel-diff contract expects `shot-view.png`. Keep the helper's output name
  # exactly aligned with that consumer and let a missing conversion fail visibly instead of
  # turning a real movement frame change into a false negative.
  $viewPng = $rawPng -replace '\.png$', '-view.png'
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
  if ($LASTEXITCODE -ne 0) { Write-Host "[dok-live] WARN: screenshot failed for $name"; return $null }
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

# Fast (single Python process, zero vision round-trip) corner-reset + move + click on the launch
# menu's PLAY button -- proven mechanism from tools/cok-m4-gamelink-route.ps1 (identical DQK.EXE
# launch menu since both builds run the same real DQK.EXE).
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

function Solve-Protection([string]$visionText) {
  if (-not (Test-Path $JournalTxt)) { Write-Host "[dok-live] no journal text at $JournalTxt"; return $null }
  $cliArgs = @('-y','tsx@4', (Join-Path $repo 'tools\dqk-protection-solve.mts'), '--journal', $JournalTxt, '--prompt', $visionText)
  if (Test-Path $CodesTxt) { $cliArgs += @('--codes', $CodesTxt) }
  $result = (& npx.cmd @cliArgs 2>$null | Out-String).Trim()
  if ($result -and $result -notmatch '\s') { return $result }
  return $null
}

$process = $null
try {
  Wait-ExclusiveDosboxSlot
  & $probe -DbxExe $dbx -GameDir $mount -Exe 'DQK.EXE' -OutDir $out `
    -GameLink -DebuggerAction @('RUN') -NoActionScreenshots -ExtraSdlConf 'mouse_emulation=always'
  if (-not $?) { throw 'DEBUGBOX probe failed' }
  $metadata = Get-Content -LiteralPath (Join-Path $out 'probe-process.json') -Raw | ConvertFrom-Json
  $process = Get-Process -Id ([int]$metadata.process_id)
  Assert-ExclusiveOwnership
  Start-Sleep -Seconds 4
  Assert-ExclusiveOwnership

  # --- Phase 2: launch menu -> PLAY. ---------------------------------------------------------
  Press @('enter') 0.2
  Start-Sleep -Seconds 1.5
  Invoke-FastPlayClick
  Start-Sleep -Seconds 1
  $rec = Shoot '01-after-play-click'

  # --- Phase 3: skip intro/credits until the party menu, via ESC. ----------------------------
  $atMenu = $false
  for ($i = 1; $i -le 16; $i++) {
    if (-not $rec) { break }
    if ($rec.text -match '(?i)LOAD SAVED|BEGIN ADVENTUR|CREATE CHARACTER|ADD CHARACTER') { $atMenu = $true; break }
    Press @('esc') 0.15
    Start-Sleep -Seconds 1
    $rec = Shoot ('02-skip{0:00}' -f $i)
  }
  if (-not $atMenu) {
    Write-Host '[dok-live] FAILED: never reached party menu'
  } else {

  # --- Phase 4: Load Saved Game -> location -> slot A -> Begin Adventuring. ------------------
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

  # --- Phase 5: DQK's own journal-word copy-protection prompt (still live in this build; the --
  # --- --bypass-protection patch only neutralizes an unrelated overlay-4 gate, per the build's --
  # --- own README). ----------------------------------------------------------------------------
  $solvedProtection = $false
  $diskReadError = $false
  for ($j = 1; $j -le 5 -and $rec; $j++) {
    if ($rec.text -match '(?i)disk read error') { $diskReadError = $true; break }
    if ($rec.text -match '(?i)after the heading|what is word|word #') {
      $ans = Solve-Protection $rec.text
      if (-not $ans) { Write-Host "[dok-live] journal prompt unsolved/low-confidence: $($rec.text)"; break }
      Write-Host "[dok-live] journal solved -> '$ans'"
      $confirmRec = Type-WordAndConfirm $ans ('07-typed-{0:00}' -f $j)
      if ($confirmRec.text -notmatch [regex]::Escape($ans.ToUpperInvariant())) {
        Write-Host "[dok-live] typed answer '$ans' does not match on-screen echo ('$($confirmRec.text)') -- aborting before Enter"
        break
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
    Write-Host '[dok-live] DISK READ ERROR reached -- stopping, this is a real finding to document, not to fix.'
  }

  # --- Phase 6: if we appear to be in the dungeon (no disk error), confirm sane state and try --
  # --- a real movement key, then diff frames to confirm the game responded. -------------------
  $dungeonReached = $false
  $movementResponded = $false
  if (-not $diskReadError) {
    Start-Sleep -Seconds 2
    $preMovePng = Join-Path $out '09-pre-move.png'
    & python $gameLink screenshot $preMovePng | Out-Null
    Save-ViewablePng $preMovePng
    $preRec = Shoot '09-pre-move-vision'
    $dungeonReached = [bool]($preRec.text -match '(?i)cekos|11,\s*1|dungeon' -or $preRec.screen -eq 'game_world')

    # One real movement input -- 'up' is the standard Gold Box "move forward" key.
    Press @('up') 0.3
    Start-Sleep -Seconds 1
    $postMovePng = Join-Path $out '10-post-move.png'
    & python $gameLink screenshot $postMovePng | Out-Null
    Save-ViewablePng $postMovePng
    $postRec = Shoot '10-post-move-vision'

    # Pixel diff between pre/post frames (flattened alpha) -- authoritative "did anything change"
    # signal, per this project's own documented caution against trusting only vision-model text.
    $diffScript = Join-Path $out '_diff.py'
    @"
from PIL import Image, ImageChops
a = Image.open(r'$($preMovePng -replace '\.png$','-view.png')').convert('RGB')
b = Image.open(r'$($postMovePng -replace '\.png$','-view.png')').convert('RGB')
diff = ImageChops.difference(a, b)
bbox = diff.getbbox()
print('CHANGED' if bbox else 'UNCHANGED')
"@ | Set-Content -LiteralPath $diffScript -Encoding utf8
    $diffResult = (& python $diffScript 2>$null | Out-String).Trim()
    $movementResponded = ($diffResult -eq 'CHANGED')
    Write-Host "[dok-live] movement frame diff: $diffResult"

    # If the ambush cell fires immediately (this save spawns ON the SIVAK trigger cell per
    # dok-natural-route.md), a second forward step or two may be needed to observe it -- try once
    # more and take a final combat-check screenshot.
    if (-not ($postRec.text -match '(?i)sivak|combat|attack')) {
      Press @('up') 0.3
      Start-Sleep -Seconds 1.5
      $rec = Shoot '11-after-second-move'
    } else {
      $rec = $postRec
    }
  }

  $combatOrEncounter = [bool]($timeline | Where-Object { $_.text -match '(?i)sivak|combat|attack' })

  [ordered]@{
    schema_version = 1
    title = 'DoK-on-DQK -- first live DOSBox-X/GameLink boot verification'
    mount = $MountDir
    reached_party_menu = $atMenu
    solved_protection = $solvedProtection
    disk_read_error = $diskReadError
    dungeon_reached = $dungeonReached
    movement_responded = $movementResponded
    combat_or_encounter_seen = $combatOrEncounter
    timeline = $timeline
    claim_boundary = 'Live DOSBox-X/GameLink boot of build/dok-dqk-release: proves whether the packaged real DQK.EXE + ported DoK content boots to the launch menu, loads the shipped area-34 (Cekos) resume save, and responds to a movement input. Does not exercise middle/ending/quest legs or the placeholder-wall-art areas.'
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $out 'report.json') -Encoding utf8
  Write-Host ""
  Write-Host "===== VERDICT ====="
  Write-Host "reached party menu     : $atMenu"
  Write-Host "solved protection      : $solvedProtection"
  Write-Host "disk read error        : $diskReadError"
  Write-Host "dungeon reached        : $dungeonReached"
  Write-Host "movement responded     : $movementResponded"
  Write-Host "combat/encounter seen  : $combatOrEncounter"
  Write-Host "report                 : $(Join-Path $out 'report.json')"
  }
} finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
    Wait-Process -Id $process.Id -ErrorAction SilentlyContinue
  }
}
