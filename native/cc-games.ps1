# cc-games.ps1 -- open Claude Commander (cc) in DOSBox with a Gold Box game
# folder mounted, so you can browse/extract/view its .DAX archives with the
# CCGBC (container) + CCGB (image viewer) helpers.
#
#   .\cc-games.ps1                       # Champions of Krynn (default)
#   .\cc-games.ps1 -Game "Death Knights of Krynn"
#   .\cc-games.ps1 -Verify               # headless: auto-capture a screenshot then quit
#
# In cc:  C: = the tool drive (cc + helpers, your extract target)
#         D: = the game folder (read it; press Enter on a *.DAX to browse it)
# Flow:   Alt+F1 switches the LEFT panel to drive D: (Alt+F2 = right panel),
#         move to e.g. TITLE.DAX, press Enter to browse, F5 to extract a member
#         to the other (C:) panel, then F3 on the extracted .GBI to view it.
param(
  [string]$Game = "Champions of Krynn",
  [switch]$Verify
)
$ErrorActionPreference = "Stop"
$GbRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. "$GbRoot\tools\dosbot\lib.ps1"

$repo     = "$GbRoot"
$ccsrc    = "C:\LLM\cc-goldbox"  # isolated git worktree (branch goldbox) so our cc
$gameDir  = Join-Path $repo $Game
if (-not (Test-Path $gameDir)) { throw "game folder not found: $gameDir" }
. (Join-Path $PSScriptRoot 'retail-stage.ps1')

# CC makes the game drive browsable and can make it current.  Keep the source
# release read-only by giving DOSBox a staged mirror; extraction still targets
# the separate writable C: tools drive below.
$stageName = 'cc-games-' + (($Game -replace '[^A-Za-z0-9._-]+', '-').Trim('-'))
$gameMount = New-RetailStage -Source $gameDir -Name $stageName

# Stage a small tool drive (fresh copies each run so helpers stay current).
$tools = Join-Path $repo "native\cc-tools"
New-Item -ItemType Directory -Force $tools | Out-Null
foreach ($f in @("cc.com","cc.ini","ccgbc.com","ccgb.com","cchlib.com","ccgeo.com","cchex.com","ccimg.com","ccwav.com")) {
  $src = Join-Path $ccsrc $f
  if (Test-Path $src) { Copy-Item $src $tools -Force }
}
# Refresh the helpers from our latest build so the tool drive always matches src.
$build = Join-Path $repo "native\build"
if (Test-Path (Join-Path $build "cgbc.com"))   { Copy-Item (Join-Path $build "cgbc.com")   (Join-Path $tools "ccgbc.com")  -Force }
if (Test-Path (Join-Path $build "cgb.com"))    { Copy-Item (Join-Path $build "cgb.com")    (Join-Path $tools "ccgb.com")   -Force }
if (Test-Path (Join-Path $build "cchlib.com")) { Copy-Item (Join-Path $build "cchlib.com") (Join-Path $tools "cchlib.com") -Force }
if (Test-Path (Join-Path $build "ccgeo.com"))  { Copy-Item (Join-Path $build "ccgeo.com")  (Join-Path $tools "ccgeo.com")  -Force }

# Two-drive autoexec: C: = tools (writable extract target), D: = staged game data.
$conf = Join-Path $tools "_ccgames.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[render]
scaler=normal2x
[autoexec]
@echo off
mount C "$tools"
mount D "$gameMount"
C:
cc.com
"@ | Set-Content -Path $conf -Encoding ASCII

$settings= "$GbRoot\The Dark Queen of Krynn\dosbox_krynnQueen.conf"

Write-Host "Game : $Game"
Write-Host "C: = $tools   (cc + helpers; extract members here)"
Write-Host "D: = $gameMount (staged game data; source is $gameDir)"

$p = Start-DosboxConf -Conf $conf -BaseConf $settings -NormalWindow:(!$Verify)

if ($Verify) {
  $h = Wait-DosboxWindow -Proc $p -TimeoutSec 15
  Start-Sleep -Seconds 2
  # Alt+F1 -> drive-letter prompt -> "D" -> Enter, to prove the game files mounted
  Send-DosChord -Hwnd $h -Mod "ALT" -Key "F1"
  Start-Sleep -Milliseconds 400
  Send-DosText  -Hwnd $h -Text "d"
  Send-DosKeys  -Hwnd $h -Keys "{ENTER}"
  Start-Sleep -Milliseconds 700
  $shot = Join-Path $build "ccgames_verify.png"
  Capture-DosboxWindow -Hwnd $h -OutPng $shot | Out-Null
  Stop-Dosbox -Proc $p
  Write-Host "verify capture -> $shot"
} else {
  Write-Host ""
  Write-Host "DOSBox is open. In cc: type  d:  + Enter to switch a panel to the game"
  Write-Host "drive, Enter on a *.DAX to browse it, F5 to extract, F3 to view a .GBI."
  Write-Host "Close the DOSBox window (or press exit in cc) when done."
}
