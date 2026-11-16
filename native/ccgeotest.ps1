# ccgeotest.ps1 -- end-to-end: browse DQK GEO.GLB inside cc as a list of area maps
# and F3-view one map top-down in place (no extraction). GEO.GLB is staged on C:
# alongside cc so the member listing (CCGEO L) and the map render (CCGEO
# <container> <index>) both resolve from one drive. Mirrors cchlibtest.ps1.
$GbRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. "$GbRoot\tools\dosbot\lib.ps1"
$ccsrc = "C:\LLM\cc-goldbox"  # isolated worktree (branch goldbox)
$tools = (Join-Path $PSScriptRoot 'build\ccgeotools')
$cap   = (Join-Path $PSScriptRoot 'build\ccshots')
New-Item -ItemType Directory -Force $tools,$cap | Out-Null
foreach ($f in @("cc.com","cc.ini","ccgeo.com")) { Copy-Item (Join-Path $ccsrc $f) $tools -Force }
Copy-Item "$GbRoot\The Dark Queen of Krynn\DISK3\GEO.GLB" $tools -Force

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
# sort=name: ".." CC.COM CC.INI CCGEO.COM GEO.GLB -> GEO.GLB at index 4 -> 4 downs
Send-DosKeys -Hwnd $h -Keys ("{DOWN}" * 4)
Start-Sleep -Milliseconds 400
Capture-DosboxWindow -Hwnd $h -OutPng (Join-Path $cap "40_on_geo.png") | Out-Null
Send-DosKeys -Hwnd $h -Keys "{ENTER}"        # browse GEO.GLB (CCGEO L)
Start-Sleep -Seconds 2                         # let the map listing build
Capture-DosboxWindow -Hwnd $h -OutPng (Join-Path $cap "40b_browsed.png") | Out-Null
# panel: ".." M0000 M0001 M0002 ... -> 3 downs lands on M0002 (the 28x28 maze)
Send-DosKeys -Hwnd $h -Keys ("{DOWN}" * 3)
Start-Sleep -Milliseconds 400
Send-DosKeys -Hwnd $h -Keys "{F3}"           # render map index 2 top-down
Start-Sleep -Milliseconds 700
Capture-DosboxWindow -Hwnd $h -OutPng (Join-Path $cap "41_geo_f3.png") | Out-Null
Start-Sleep -Milliseconds 900
Capture-DosboxWindow -Hwnd $h -OutPng (Join-Path $cap "42_geo_f3.png") | Out-Null
Stop-Dosbox -Proc $p
Write-Output "captures -> 40_on_geo.png 40b_browsed.png 41_geo_f3.png 42_geo_f3.png"
