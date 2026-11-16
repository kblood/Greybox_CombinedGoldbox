param([string]$CmdArgs = "WALLS.BIN 8 13 4", [string]$OutName = "60_ccfp.png")
$GbRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
. "$GbRoot\tools\dosbot\lib.ps1"
$mount = (Join-Path $PSScriptRoot 'build\ccfp')
$cap   = (Join-Path $PSScriptRoot 'build\ccshots')
$src   = (Join-Path $PSScriptRoot 'build\ccshots')
New-Item -ItemType Directory -Force $mount,$cap | Out-Null
Copy-Item $GbRoot\native\build\ccfp.com $mount -Force
foreach ($f in "WALLS.BIN","RESOLVE.BIN","TILES.BIN","PAL.BIN") {
  Copy-Item (Join-Path $src $f) $mount -Force
}
$p = Start-Dosbox -MountDir $mount -Exe "ccfp.com" -ExeArgs $CmdArgs
$h = Wait-DosboxWindow -Proc $p -TimeoutSec 15
Start-Sleep -Seconds 3
Capture-DosboxWindow -Hwnd $h -OutPng (Join-Path $cap $OutName) | Out-Null
Stop-Dosbox -Proc $p
Write-Output "$OutName -> done"
