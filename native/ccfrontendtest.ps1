# ccfrontendtest.ps1 -- end-to-end cohesive cc front-end test:
#   Enter on GEO.GLB  -> glb=CCGLB dispatches -> CCGEO lists area maps
#   F3 on a map       -> CCGEO top-down render
#   F (in viewer)     -> CCGEO bakes WALLS + EXECs CCFP -> first-person walk
# Uses the reliable native screenshot (Ctrl+F5) via Capture-DosboxNative.
$GbRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. "$GbRoot\tools\dosbot\lib.ps1"
$ccsrc = "C:\LLM\cc-goldbox"
$tools = (Join-Path $PSScriptRoot 'build\ccfetools')
$cap   = (Join-Path $PSScriptRoot 'build\ccshots')
New-Item -ItemType Directory -Force $tools,$cap | Out-Null
# cc + the dispatcher and every tool CCGLB/CCGEO may EXEC
foreach ($f in @("cc.com","cc.ini","ccglb.com","ccgeo.com","ccsnd.com","cchlib.com","ccecl.com","ccfp.com")) {
  Copy-Item (Join-Path $ccsrc $f) $tools -Force
}
Copy-Item "$GbRoot\The Dark Queen of Krynn\DISK3\GEO.GLB" $tools -Force

$conf = Join-Path $tools "_t.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[dosbox]
captures=$tools\_capture
[autoexec]
@echo off
mount C "$tools"
C:
cc.com
"@ | Set-Content -Path $conf -Encoding ASCII

$p = Start-DosboxConf -Conf $conf -BaseConf ""
$h = Wait-DosboxWindow -Proc $p -TimeoutSec 15
Start-Sleep -Seconds 2
# GEO.GLB is the last entry; 12 downs clamps the cursor onto it regardless of count
Send-DosKeys -Hwnd $h -Keys ("{DOWN}" * 12)
Start-Sleep -Milliseconds 400
Capture-DosboxNative -Hwnd $h -MountDir $tools -OutPng (Join-Path $cap "50_on_geo.png") | Out-Null
Send-DosKeys -Hwnd $h -Keys "{ENTER}"        # browse GEO.GLB -> glb=CCGLB -> CCGEO L
Start-Sleep -Seconds 3                         # dispatcher EXEC + listing build
Capture-DosboxNative -Hwnd $h -MountDir $tools -OutPng (Join-Path $cap "51_glb_dispatched.png") | Out-Null
# panel now lists area maps: ".." M0000 M0001 ... -> step to a non-trivial map
Send-DosKeys -Hwnd $h -Keys ("{DOWN}" * 3)
Start-Sleep -Milliseconds 400
Send-DosKeys -Hwnd $h -Keys "{F3}"           # CCGEO top-down render
Start-Sleep -Milliseconds 900
Capture-DosboxNative -Hwnd $h -MountDir $tools -OutPng (Join-Path $cap "52_topdown.png") | Out-Null
Send-DosKeys -Hwnd $h -Keys "F"              # in-viewer hotkey: bake + EXEC CCFP
Start-Sleep -Seconds 2
Capture-DosboxNative -Hwnd $h -MountDir $tools -OutPng (Join-Path $cap "53_firstperson.png") | Out-Null
Send-DosKeys -Hwnd $h -Keys "{RIGHT}"        # turn in first-person
Start-Sleep -Milliseconds 700
Capture-DosboxNative -Hwnd $h -MountDir $tools -OutPng (Join-Path $cap "54_fp_turned.png") | Out-Null
Send-DosKeys -Hwnd $h -Keys "{ESC}"          # leave CCFP -> back to CCGEO top-down
Start-Sleep -Milliseconds 800
Capture-DosboxNative -Hwnd $h -MountDir $tools -OutPng (Join-Path $cap "55_back_topdown.png") | Out-Null
Stop-Dosbox -Proc $p
Write-Output "captures -> 50_on_geo 51_glb_dispatched 52_topdown 53_firstperson 54_fp_turned 55_back_topdown"
