# dosbot/capture-ingame.ps1 — drive a rebuilt CoK/DoK-on-DQK build all the way into an in-game
# MAP screen and capture it (E6.2b-3). Sequence:
#   launch menu  → click PLAY
#   intro/credits → skip (ESC / click) until the party menu (LOAD SAVED GAME / BEGIN ADVENTURING)
#   party menu   → press L (Load Saved Game) → confirm → press B (Begin Adventuring)
#   → with a party-present, resume-area save (build with `--save … --save-area N`), the engine
#     resumes directly into ECL area N, landing on the game map — showing the lifted art in-game.
# Every transition is vision-read (qwen3-vl). Writes frames + report.json + a one-line verdict to
# tools/dosbot/runs/<label>-<ts>/ (git-ignored — frames contain copyrighted art).
#
# Usage: pwsh tools/dosbot/capture-ingame.ps1 -MountDir build/cok-on-dqk-e62b -Label e62b-ingame
param(
  [string]$MountDir = "build/cok-on-dqk-e62b",
  [string]$Label = "e62b-ingame",
  [int]$BootWaitSec = 12,
  [int]$SkipSteps = 16,
  # Pre-extracted journal/codes text (pdftotext output) for the copy-protection solver (E6.2b-4).
  [string]$JournalTxt = "C:\Modding\GoldBox\build\dqk_journal.txt",
  [string]$CodesTxt = "C:\Modding\GoldBox\build\dqk_codes.txt",
  # Diagnostic: if set, type THIS word at the protection prompt instead of solving the journal.
  # Use a deliberately wrong word (e.g. "WRONG") to test whether the GOG DQK.EXE actually requires
  # the correct answer, or accepts anything (DRM-free defanged doc-check).
  [string]$ForceWord = "",
  # Diagnostic: press ENTER with NO text at the protection prompt (a vision-free "bypass" probe —
  # not typing any word). Tests the 2026-06-25 #18 claim that an empty Enter passes the journal.
  [switch]$EmptyEnter
)
. "C:\Modding\GoldBox\tools\dosbot\lib.ps1"

# Solve DQK's copy-protection prompt ("…word #N after the heading H…") from the player's own journal
# text via the engine solver. Returns the word to type, or $null if it can't be parsed/solved.
function Solve-Protection([string]$visionText) {
  if (-not (Test-Path $JournalTxt)) { Write-Host "[dosbot] no journal text at $JournalTxt"; return $null }
  # Call npx.cmd, NOT bare `npx`: PowerShell resolves `npx` to npx.ps1, whose arg-splatting mangles
  # `-y tsx@4 <script>` into "npm error could not determine executable to run". npx.cmd passes args
  # through cleanly (verified: same prompt → "from").
  $cliArgs = @("-y","tsx@4","C:\Modding\GoldBox\tools\dqk-protection-solve.mts","--journal",$JournalTxt,"--prompt",$visionText)
  if (Test-Path $CodesTxt) { $cliArgs += @("--codes",$CodesTxt) }
  $out = (& npx.cmd @cliArgs 2>$null | Out-String).Trim()
  if ($out -and $out -notmatch '\s') { return $out }
  return $null
}
$runRoot = "C:\Modding\GoldBox\tools\dosbot\runs"
New-Item -ItemType Directory -Force $runRoot | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path $runRoot "$Label-$stamp"
New-Item -ItemType Directory -Force $runDir | Out-Null
Write-Host "[dosbot] run dir: $runDir"

$timeline = @()
$script:solvedProtection = $false
$script:protectionDeclined = $false
$script:diskReadError = $false
function Shoot([IntPtr]$h, [string]$name) {
  $png = Join-Path $runDir "$name.png"
  Capture-DosboxWindow -Hwnd $h -OutPng $png | Out-Null
  $v = Invoke-Vision -Png $png
  $rec = [pscustomobject]@{ name=$name; screen=$v.screen; text="$($v.visible_text)"; crashed=$v.looks_crashed; note=$v.note; png="$name.png" }
  $script:timeline += $rec
  Write-Host ("  [{0,-14}] {1,-12} | {2}" -f $name, $v.screen, $rec.text)
  return $rec
}

$proc = Start-Dosbox -MountDir $MountDir
$hwnd = Wait-DosboxWindow -Proc $proc -TimeoutSec 20
if ($hwnd -eq [IntPtr]::Zero) { Write-Host "[dosbot] ERROR: no window"; Stop-Dosbox $proc; exit 1 }
Start-Sleep -Seconds $BootWaitSec
$r = New-Object DosBotWin32+RECT
[DosBotWin32]::GetWindowRect($hwnd, [ref]$r) | Out-Null
$cw = $r.Right - $r.Left; $ch = $r.Bottom - $r.Top

# 1) Launch menu → PLAY (bottom-left button).
Shoot $hwnd "01_launch" | Out-Null
Click-DosWindow -Hwnd $hwnd -RelX 35 -RelY ($ch-16)
Start-Sleep -Seconds 2

# 2) Skip intro/credits until the party menu appears.
$atMenu = $false
for ($i = 1; $i -le $SkipSteps; $i++) {
  if ($proc.HasExited) { break }
  $rec = Shoot $hwnd ("02_skip{0:00}" -f $i)
  if ($rec.text -match "(?i)LOAD SAVED|BEGIN ADVENTUR|CREATE CHARACTER|ADD CHARACTER") { $atMenu = $true; break }
  if ($i % 2 -eq 0) { Click-DosWindow -Hwnd $hwnd -RelX ([int]($cw/2)) -RelY ([int]($ch/2)) }
  else { Send-DosKeys -Hwnd $hwnd -Keys "{ESC}" }
  Start-Sleep -Seconds 2
}
if (-not $atMenu) { Write-Host "[dosbot] never reached party menu"; }

# 3) Party menu → L (Load Saved Game) → pick the TDQK save location → pick the save.
if ($atMenu) {
  Send-DosKeys -Hwnd $hwnd -Keys "{L}"
  Start-Sleep -Seconds 2
  $rec = Shoot $hwnd "03_after_L"
  # "LOAD FROM WHERE?  TDQK  DKK  EXIT" — pick TDQK (the location holding our dropped save).
  if ($rec.text -match "(?i)LOAD FROM WHERE|TDQK") {
    Send-DosKeys -Hwnd $hwnd -Keys "{T}"
    Start-Sleep -Seconds 2
    $rec = Shoot $hwnd "04_after_T"
  }
  # "LOAD WHICH GAME: A" — the save-slot prompt. Our SAVGAMA.QSV is slot A; type A then ENTER.
  if ($rec.text -match "(?i)LOAD WHICH GAME|WHICH GAME") {
    Send-DosKeys -Hwnd $hwnd -Keys "{A}"
    Start-Sleep -Seconds 1
    Send-DosKeys -Hwnd $hwnd -Keys "{ENTER}"
    Start-Sleep -Seconds 3
    $rec = Shoot $hwnd "05_after_slotA"
  }
  # Any remaining "press a key" gate before we're back at the party menu.
  $tries = 0
  while ($rec.text -notmatch "(?i)BEGIN ADVENTUR" -and $tries -lt 2 -and -not $proc.HasExited) {
    Send-DosKeys -Hwnd $hwnd -Keys "{ENTER}"
    Start-Sleep -Seconds 2
    $rec = Shoot $hwnd ("05b_load{0:00}" -f $tries)
    $tries++
  }

  # 4) Back at party menu (roster now loaded) → B (Begin Adventuring) → resume area N.
  Send-DosKeys -Hwnd $hwnd -Keys "{B}"
  Start-Sleep -Seconds 3
  for ($j = 1; $j -le 8; $j++) {
    if ($proc.HasExited) { break }
    $rec = Shoot $hwnd ("06_begin{0:00}" -f $j)
    # A wrong/declined protection answer makes DQK show a fake "DISK READ ERROR" — treat as failure.
    if ($rec.text -match "(?i)disk read error") { Write-Host "  [map] DETERMINISTIC FAILURE: disk read error (no point retrying)"; $script:diskReadError = $true; break }
    # DQK's intrinsic copy-protection: "…what is word #N after the heading H…" with an Enter field.
    # MUST be checked BEFORE the game_world short-circuit: qwen3-vl frequently mislabels the
    # protection prompt as game_world (it's drawn over the map backdrop), so a screen-only test
    # would false-positive on the prompt and break out without ever answering it.
    if ($rec.text -match "(?i)after the heading|what is word|word #") {
      # Diagnostic: press ENTER with no text (bypass probe — does an empty answer pass?).
      if ($EmptyEnter) {
        Write-Host "  [protection] EMPTY-ENTER probe (no word typed)  (from: $($rec.text))"
        Send-DosKeys -Hwnd $hwnd -Keys "{ENTER}"
        Start-Sleep -Seconds 3
        $script:solvedProtection = $true
        continue
      }
      # Diagnostic override: type a caller-supplied (possibly WRONG) word to probe whether the GOG
      # DQK.EXE truly requires the correct answer.
      if ($ForceWord) {
        Write-Host "  [protection] FORCE-TYPING '$ForceWord' (diagnostic; not solved)  (from: $($rec.text))"
        Send-DosText -Hwnd $hwnd -Text $ForceWord
        Start-Sleep -Milliseconds 300
        Send-DosKeys -Hwnd $hwnd -Keys "{ENTER}"
        Start-Sleep -Seconds 3
        $script:solvedProtection = $true
        continue
      }
      $ans = Solve-Protection $rec.text
      if ($ans) {
        Write-Host "  [protection] solved -> '$ans'  (from: $($rec.text))"
        Send-DosText -Hwnd $hwnd -Text $ans
        Start-Sleep -Milliseconds 300
        Send-DosKeys -Hwnd $hwnd -Keys "{ENTER}"
        Start-Sleep -Seconds 3
        $script:solvedProtection = $true
        continue
      }
      # Could not confidently solve THIS boot's question — abort rather than type a wrong answer
      # (which would trigger the disk-read-error punishment). The outer retry boots a fresh question.
      Write-Host "  [protection] declined (low-confidence/unsolved): $($rec.text)"
      $script:protectionDeclined = $true
      break
    }
    # Success: a real game map view — only AFTER ruling out the protection prompt above, and only
    # if the text carries no prompt/menu residue (guards against vision mislabeling the prompt).
    if ($rec.screen -match "(?i)game_world" -and
        $rec.text -notmatch "(?i)after the heading|what is word|word #|journal, page|begin adventur") {
      Write-Host "  [map] reached game world: $($rec.text)"
      break
    }
    # Some areas show a party-summary / "press a key" gate before the map.
    Send-DosKeys -Hwnd $hwnd -Keys "{ENTER}"
    Start-Sleep -Seconds 2
  }
}

Stop-Dosbox -Proc $proc

# Verdict: did any post-Begin frame read as a real in-game world/map — excluding (a) the protection-
# fail "disk read error" screen (vision can mislabel it as combat — roster still visible) and (b) the
# copy-protection prompt itself, which qwen3-vl routinely tags game_world because it's drawn over the
# map backdrop. A genuine map frame carries none of the prompt/menu strings.
$ingame = $timeline | Where-Object {
  $_.name -match "^06_begin" -and $_.screen -match "(?i)game_world|combat" -and
  $_.text -notmatch "(?i)disk read error|begin adventur|after the heading|what is word|word #|journal, page"
}
$reachedMenu = [bool]($timeline | Where-Object { $_.text -match "(?i)BEGIN ADVENTUR" })
$verdict = [pscustomobject]@{
  label=$Label; mount=$MountDir
  reached_party_menu=$reachedMenu
  solved_protection=$script:solvedProtection
  reached_ingame=[bool]$ingame
  ingame_frame=($ingame | Select-Object -First 1 -ExpandProperty png)
  screens=($timeline | ForEach-Object { $_.screen } | Select-Object -Unique)
}
[pscustomobject]@{ verdict=$verdict; timeline=$timeline } | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $runDir "report.json") -Encoding UTF8
Write-Host ""
Write-Host "===== VERDICT [$Label] ====="
Write-Host "reached party menu : $($verdict.reached_party_menu)"
Write-Host "solved protection  : $($verdict.solved_protection)"
Write-Host "reached in-game map: $($verdict.reached_ingame)  ($($verdict.ingame_frame))"
Write-Host "report             : $(Join-Path $runDir 'report.json')"
Write-Host "rundir             : $runDir"
