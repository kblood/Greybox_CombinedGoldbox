param([string]$Exe = "cgb.com", [string]$ExeArgs = "/F B0001.GBI", [string]$Out = "cgb_cap.png", [int]$WaitSec = 3)
$GbRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. "$GbRoot\tools\dosbot\lib.ps1"
$mount = "$GbRoot\native\build"
$p = Start-Dosbox -MountDir $mount -Exe $Exe -ExeArgs $ExeArgs
$h = Wait-DosboxWindow -Proc $p -TimeoutSec 15
Start-Sleep -Seconds $WaitSec
$outPath = Join-Path $mount $Out
Capture-DosboxWindow -Hwnd $h -OutPng $outPath | Out-Null
Stop-Dosbox -Proc $p
Write-Output "captured $outPath"
