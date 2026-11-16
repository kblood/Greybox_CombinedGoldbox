# dosbot/drive-test.ps1 — action-driven bot. Boots a build, runs a scripted action list
# (mouse clicks — the only input DOSBox/SDL reliably accepts here), capturing + reading the
# screen with qwen3-vl after each action. Emits a JSON timeline + verdict.
#
# Actions (-Actions, comma-separated):
#   wait            : just capture+analyze (no input)
#   click:X,Y       : click window-relative pixel X,Y then capture+analyze
#   playbtn         : click the PLAY button (front menu)
#   center          : click screen center (advances splash screens)
#
# Usage: pwsh drive-test.ps1 -MountDir <dir> -Label cok-play -Actions "wait,playbtn,center,center,wait,wait" [-Cycles "fixed 25000"] [-NormalWindow]
param(
  [Parameter(Mandatory)][string]$MountDir,
  [Parameter(Mandatory)][string]$Label,
  [string]$Actions = "wait,playbtn,center,center,wait,wait,wait",
  [int]$BootWaitSec = 10,
  [int]$StepDelaySec = 3,
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
Write-Host "[dosbot] launched DOSBox pid=$($proc.Id)"
$hwnd = Wait-DosboxWindow -Proc $proc -TimeoutSec 20
if ($hwnd -eq [IntPtr]::Zero) { Write-Host "[dosbot] ERROR: no window"; Stop-Dosbox $proc; exit 1 }
Start-Sleep -Seconds $BootWaitSec

# discover window size for center clicks
$r = New-Object DosBotWin32+RECT
[DosBotWin32]::GetWindowRect($hwnd, [ref]$r) | Out-Null
$cw = $r.Right - $r.Left; $ch = $r.Bottom - $r.Top

$acts = $Actions -split ','
$timeline = @(); $crashed = $false; $t0 = Get-Date
$i = 0
foreach ($aRaw in $acts) {
  $a = $aRaw.Trim(); $i++
  if ($proc.HasExited) { Write-Host "[dosbot] DOSBox exited at action $i"; break }
  switch -Regex ($a) {
    '^click:(\d+),(\d+)$' { Click-DosWindow -Hwnd $hwnd -RelX ([int]$Matches[1]) -RelY ([int]$Matches[2]) }
    '^playbtn$'           { Click-DosWindow -Hwnd $hwnd -RelX 30 -RelY ($ch-40) }
    '^center$'            { Click-DosWindow -Hwnd $hwnd -RelX ([int]($cw/2)) -RelY ([int]($ch/2)) }
    '^wait$'              { }
    default               { Write-Host "[dosbot] unknown action '$a'" }
  }
  Start-Sleep -Seconds $StepDelaySec
  $png = Join-Path $runDir ("step{0:00}_{1}.png" -f $i, ($a -replace '[^a-zA-Z0-9]','_'))
  Capture-DosboxWindow -Hwnd $hwnd -OutPng $png | Out-Null
  $v = Invoke-Vision -Png $png
  $t = [math]::Round(((Get-Date)-$t0).TotalSeconds,1)
  $rec = [pscustomobject]@{ step=$i; action=$a; t=$t; screen=$v.screen; game_title=$v.game_title; visible_text=$v.visible_text; crashed=$v.looks_crashed; note=$v.note; png=(Split-Path $png -Leaf) }
  $timeline += $rec
  Write-Host ("[{0,2}] {1,-10} {2,-12} crash={3,-5} | {4}" -f $i, $a, $rec.screen, $rec.crashed, $rec.note)
  if ($v.looks_crashed -or $v.screen -eq "error" -or $v.screen -eq "dos_prompt") { $crashed = $true }
}
Stop-Dosbox -Proc $proc

$verdict = [pscustomobject]@{
  label=$Label; mount=$MountDir; steps=$timeline.Count; crashed=$crashed
  screens=($timeline | ForEach-Object { $_.screen } | Select-Object -Unique)
  titles=($timeline | ForEach-Object { $_.game_title } | Where-Object { $_ } | Select-Object -Unique)
}
[pscustomobject]@{ verdict=$verdict; timeline=$timeline } | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $runDir "report.json") -Encoding UTF8
Write-Host ""
Write-Host "===== VERDICT [$Label] ====="
Write-Host "crashed      : $crashed"
Write-Host "screens seen : $($verdict.screens -join ', ')"
Write-Host "titles seen  : $($verdict.titles -join ' | ')"
Write-Host "report       : $(Join-Path $runDir 'report.json')"
