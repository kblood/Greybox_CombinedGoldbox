# cchlibtest.ps1 -- end-to-end: browse a DQK .TLB inside cc and F3-view an HLIB
# image in place (no extraction). PICB.TLB is staged on C: alongside cc so the
# member listing (CCHLIB L) and the F3 view (CCHLIB <container> <index>) both
# resolve from one drive. Mirrors cctest.ps1 (the DAX equivalent).
$GbRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. "$GbRoot\tools\dosbot\lib.ps1"
$ccsrc = "C:\LLM\cc-goldbox"  # isolated worktree (branch goldbox)
$tools = (Join-Path $PSScriptRoot 'build\cchlibtools2')
$cap   = (Join-Path $PSScriptRoot 'build\ccshots')
New-Item -ItemType Directory -Force $tools,$cap | Out-Null
foreach ($f in @("cc.com","cc.ini","cchlib.com","cchex.com")) { Copy-Item (Join-Path $ccsrc $f) $tools -Force }
Copy-Item "$GbRoot\The Dark Queen of Krynn\DISK2\PICB.TLB" $tools -Force

$conf = Join-Path $tools "_t.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[autoexec]
@echo off
mount C "$tools"
C:
cc.com
"@ | Set-Content -Path $conf -Encoding ASCII

$p = Start-DosboxConf -Conf $conf -BaseConf ""
$h = Wait-DosboxWindow -Proc $p -TimeoutSec 15
Start-Sleep -Seconds 2
# sort=name: ".." CC.COM CC.INI CCHEX.COM CCHLIB.COM PICB.TLB -> PICB is at index 5 -> 5 downs
Send-DosKeys -Hwnd $h -Keys ("{DOWN}" * 5)
Start-Sleep -Milliseconds 400
Capture-DosboxWindow -Hwnd $h -OutPng (Join-Path $cap "30_on_picb.png") | Out-Null
Send-DosKeys -Hwnd $h -Keys "{ENTER}"        # browse PICB.TLB
Start-Sleep -Seconds 2                         # let the container listing build
Capture-DosboxWindow -Hwnd $h -OutPng (Join-Path $cap "30b_browsed.png") | Out-Null
Send-DosKeys -Hwnd $h -Keys "{DOWN}"         # ".." -> I0000.HTI
Start-Sleep -Seconds 2
Send-DosKeys -Hwnd $h -Keys "{F3}"
Start-Sleep -Milliseconds 350
Capture-DosboxWindow -Hwnd $h -OutPng (Join-Path $cap "31_picb_f3_fast.png") | Out-Null
Start-Sleep -Milliseconds 900
Capture-DosboxWindow -Hwnd $h -OutPng (Join-Path $cap "32_picb_f3.png") | Out-Null
Stop-Dosbox -Proc $p
Write-Output "captures -> 30_on_picb.png 31_picb_f3_fast.png 32_picb_f3.png"
