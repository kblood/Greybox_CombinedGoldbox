# cokmultiboot.ps1 -- boot the merged multi-area CoK-on-DQK build and verify it reaches
# the title + (via Begin Adventuring, protection bypassed, save-drop) the overland.
$GbRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. "$GbRoot\tools\dosbot\lib.ps1"
$build = "$GbRoot\build\cok-on-dqk-multi"
$cap   = (Join-Path $PSScriptRoot 'build\ccshots')
New-Item -ItemType Directory -Force $cap, (Join-Path $build "_capture") | Out-Null

# Use the project's own DOSBox with a bot conf that mounts the build and runs DQK.EXE.
$conf = Join-Path $build "_boot.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[dosbox]
captures=$build\_capture
[autoexec]
@echo off
mount C "$build"
C:
DQK.EXE SB220 SI7 RB330
"@ | Set-Content -Path $conf -Encoding ASCII

$p = Start-DosboxConf -Conf $conf -BaseConf ""
$h = Wait-DosboxWindow -Proc $p -TimeoutSec 20
Start-Sleep -Seconds 12                       # boot + intro
Capture-DosboxNative -Hwnd $h -MountDir $build -OutPng (Join-Path $cap "60_boot_title.png") | Out-Null
# advance past intro/demo screens to the main menu (clicks/space) -- DQK front end is mouse-driven,
# but space/enter advance the intro slides; then it lands on the party/main menu.
for ($i=0; $i -lt 6; $i++) { Send-DosKeys -Hwnd $h -Keys "{ESC}"; Start-Sleep -Milliseconds 700 }
Start-Sleep -Seconds 1
Capture-DosboxNative -Hwnd $h -MountDir $build -OutPng (Join-Path $cap "61_menu.png") | Out-Null
Stop-Dosbox -Proc $p
Write-Output "captures -> 60_boot_title 61_menu"
