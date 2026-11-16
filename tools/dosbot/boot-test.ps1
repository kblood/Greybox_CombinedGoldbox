# dosbot/boot-test.ps1 — the boot-watcher bot.
# Boots a DQK build under DOSBox, then loops: capture frame -> qwen3-vl reads it ->
# send an advance key (to skip intro / page through). Builds a timeline + verdict and
# writes a JSON report + every frame PNG to tools/dosbot/runs/<label>-<n>/.
#
# Usage: pwsh tools/dosbot/boot-test.ps1 -MountDir <dir> -Label cok-retitle [-Steps 10] [-AdvanceKey "{ESC}"] [-BootWaitSec 6] [-Cycles "fixed 25000"] [-NormalWindow]
param(
  [Parameter(Mandatory)][string]$MountDir,
  [Parameter(Mandatory)][string]$Label,
  [int]$Steps = 10,
  [string]$AdvanceKey = "{ESC}",
  [int]$BootWaitSec = 6,
  [int]$StepDelaySec = 2,
  [string]$Cycles,
  [switch]$Console,
  [switch]$NormalWindow
)
. "C:\Modding\GoldBox\tools\dosbot\lib.ps1"

$runRoot = "C:\Modding\GoldBox\tools\dosbot\runs"
New-Item -ItemType Directory -Force $runRoot | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path $runRoot "$Label-$stamp"
New-Item -ItemType Directory -Force $runDir | Out-Null
Write-Host "[dosbot] run dir: $runDir"

$proc = Start-Dosbox -MountDir $MountDir -Cycles $Cycles -Console:$Console -NormalWindow:$NormalWindow
Write-Host "[dosbot] launched DOSBox pid=$($proc.Id) on $MountDir"
$hwnd = Wait-DosboxWindow -Proc $proc -TimeoutSec 20
if ($hwnd -eq [IntPtr]::Zero) { Write-Host "[dosbot] ERROR: no window"; Stop-Dosbox $proc; exit 1 }

Start-Sleep -Seconds $BootWaitSec
$timeline = @()
$reachedTitle = $false; $reachedMenu = $false; $crashed = $false; $titleText = $null
$t0 = Get-Date

for ($i = 1; $i -le $Steps; $i++) {
  if ($proc.HasExited) { Write-Host "[dosbot] DOSBox exited early at step $i"; break }
  $png = Join-Path $runDir ("frame{0:00}.png" -f $i)
  try { Capture-DosboxWindow -Hwnd $hwnd -OutPng $png | Out-Null }
  catch { Write-Host "[dosbot] capture failed step $i : $_"; break }
  $v = Invoke-Vision -Png $png
  $wtitle = [DosBotWin32]::WindowTitle($hwnd)
  $t = [math]::Round(((Get-Date)-$t0).TotalSeconds,1)
  $rec = [pscustomobject]@{ step=$i; t=$t; screen=$v.screen; game_title=$v.game_title; visible_text=$v.visible_text; crashed=$v.looks_crashed; note=$v.note; wintitle=$wtitle; png=(Split-Path $png -Leaf) }
  $timeline += $rec
  Write-Host ("[{0,2}] t={1,5}s  {2,-12} gt={3,-22} win='{4}'" -f $i, $t, $rec.screen, ("$($rec.game_title)"), $wtitle)
  if ($v.game_title -and "$($v.game_title)" -match "(?i)krynn|champion|death knight") { $reachedTitle = $true; $titleText = $v.game_title }
  if ($v.screen -match "main_menu") { $reachedMenu = $true }
  if ($v.looks_crashed -or $v.screen -eq "error") { $crashed = $true }
  if ($v.screen -eq "dos_prompt" -and $i -gt 2) { Write-Host "[dosbot] back at DOS prompt — game exited/crashed"; break }
  # AdvanceKey may be a comma list (e.g. "{ESC},{ESC},{ENTER},{ENTER}"); cycle, holding last.
  $keys = $AdvanceKey -split ','
  $k = $keys[[math]::Min($i-1, $keys.Count-1)].Trim()
  if ($k) { Send-DosKeys -Hwnd $hwnd -Keys $k }
  Start-Sleep -Seconds $StepDelaySec
}

Stop-Dosbox -Proc $proc

$verdict = [pscustomobject]@{
  label=$Label; mount=$MountDir; steps=$timeline.Count
  reached_title=$reachedTitle; title_text=$titleText; reached_menu=$reachedMenu; crashed=$crashed
  screens=($timeline | ForEach-Object { $_.screen } | Select-Object -Unique)
}
$report = [pscustomobject]@{ verdict=$verdict; timeline=$timeline }
$report | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $runDir "report.json") -Encoding UTF8

Write-Host ""
Write-Host "===== VERDICT [$Label] ====="
Write-Host "reached title : $reachedTitle  ($titleText)"
Write-Host "reached menu  : $reachedMenu"
Write-Host "crashed       : $crashed"
Write-Host "screens seen  : $($verdict.screens -join ', ')"
Write-Host "report        : $(Join-Path $runDir 'report.json')"
