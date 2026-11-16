# dosbot/e62b-explore.ps1 — one-off: boot the E6.2b build, click PLAY, then skip the intro/credits
# (ESC / click) until the party menu (CREATE/LOAD/BEGIN ADVENTURING) appears; capture every frame
# with a vision read so we can plan Load-Saved-Game navigation.
param(
  [string]$MountDir = "build/cok-on-dqk-e62b",
  [string]$Label = "e62b-explore",
  [int]$BootWaitSec = 12,
  [int]$Steps = 14,
  [int]$StepDelaySec = 2
)
. "C:\Modding\GoldBox\tools\dosbot\lib.ps1"
$runRoot = "C:\Modding\GoldBox\tools\dosbot\runs"
New-Item -ItemType Directory -Force $runRoot | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path $runRoot "$Label-$stamp"
New-Item -ItemType Directory -Force $runDir | Out-Null
Write-Host "[dosbot] run dir: $runDir"

$proc = Start-Dosbox -MountDir $MountDir
$hwnd = Wait-DosboxWindow -Proc $proc -TimeoutSec 20
if ($hwnd -eq [IntPtr]::Zero) { Write-Host "[dosbot] ERROR: no window"; Stop-Dosbox $proc; exit 1 }
Start-Sleep -Seconds $BootWaitSec

$r = New-Object DosBotWin32+RECT
[DosBotWin32]::GetWindowRect($hwnd, [ref]$r) | Out-Null
$cw = $r.Right - $r.Left; $ch = $r.Bottom - $r.Top
Write-Host "[dosbot] window ${cw}x${ch}"

# Click PLAY on the launch menu (bottom-left button).
Click-DosWindow -Hwnd $hwnd -RelX 35 -RelY ($ch-16)
Start-Sleep -Seconds 2

$found = $false
for ($i = 1; $i -le $Steps; $i++) {
  if ($proc.HasExited) { Write-Host "[dosbot] exited at step $i"; break }
  $png = Join-Path $runDir ("step{0:00}.png" -f $i)
  Capture-DosboxWindow -Hwnd $hwnd -OutPng $png | Out-Null
  $v = Invoke-Vision -Png $png
  $txt = "$($v.visible_text)"
  Write-Host ("[{0,2}] {1,-12} | {2}" -f $i, $v.screen, $txt)
  if ($txt -match "(?i)BEGIN|ADVENTUR|LOAD SAVED|CREATE NEW|ADD CHARACTER") {
    Write-Host "[dosbot] *** party menu reached at step $i ***"; $found = $true; break
  }
  # Skip intro/credits: alternate ESC and a center click.
  if ($i % 2 -eq 0) { Click-DosWindow -Hwnd $hwnd -RelX ([int]($cw/2)) -RelY ([int]($ch/2)) }
  else { Send-DosKeys -Hwnd $hwnd -Keys "{ESC}" }
  Start-Sleep -Seconds $StepDelaySec
}
Write-Host "[dosbot] party_menu_found=$found  frames in: $runDir"
Stop-Dosbox -Proc $proc
