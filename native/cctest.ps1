$GbRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. "$GbRoot\tools\dosbot\lib.ps1"
$mount = (Join-Path $PSScriptRoot 'build\cctest')
$cap   = (Join-Path $PSScriptRoot 'build\ccshots')
New-Item -ItemType Directory -Force $mount,$cap | Out-Null
# refresh binaries: latest cc.com + helpers
Copy-Item C:\LLM\cc-goldbox\cc.com,C:\LLM\cc-goldbox\cc.ini,C:\LLM\cc-goldbox\cchex.com $mount -Force
Copy-Item $GbRoot\native\build\cgbc.com (Join-Path $mount "ccgbc.com") -Force
Copy-Item $GbRoot\native\build\cgb.com  (Join-Path $mount "ccgb.com")  -Force
if (-not (Test-Path (Join-Path $mount "TITLE.DAX"))) {
  Copy-Item "$GbRoot\Champions of Krynn\TITLE.DAX" $mount -Force
}
# clean any prior extracted member so we can prove F3 does NOT extract
Remove-Item (Join-Path $mount "B0001.GBI") -ErrorAction SilentlyContinue

$p = Start-Dosbox -MountDir $mount -Exe "cc.com" -ExeArgs ""
$h = Wait-DosboxWindow -Proc $p -TimeoutSec 15
Start-Sleep -Seconds 2
# go to TITLE.DAX (last entry) and Enter to browse as a folder
Send-DosKeys -Hwnd $h -Keys "{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}{DOWN}"
Send-DosKeys -Hwnd $h -Keys "{ENTER}"
Start-Sleep -Milliseconds 800
# cursor on ".."; down to B0001.GBI (the title art), then F3 to view IN PLACE
Send-DosKeys -Hwnd $h -Keys "{DOWN}{DOWN}"
Start-Sleep -Milliseconds 300
Send-DosKeys -Hwnd $h -Keys "{F3}"
Start-Sleep -Seconds 2
Capture-DosboxWindow -Hwnd $h -OutPng (Join-Path $cap "10_f3direct.png") | Out-Null
Stop-Dosbox -Proc $p
$leaked = Test-Path (Join-Path $mount "B0001.GBI")
Write-Output "F3-direct capture -> $cap\10_f3direct.png"
Write-Output ("extracted file present (should be False): {0}" -f $leaked)
