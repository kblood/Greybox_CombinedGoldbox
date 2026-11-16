# dqkdrive.ps1 -- boot a staged DQK build and drive: load SAVGAMA (L,T,A) then BEGIN (B).
# Vision-judges each step. Usage: dqkdrive.ps1 -GameDir <dir> -Tag <prefix>
param([string]$GameDir, [string]$Tag = "dqk")
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$root = Split-Path -Parent $native
if (-not $GameDir -or -not (Test-Path -LiteralPath $GameDir)) {
  throw 'dqkdrive.ps1 requires -GameDir pointing at a DQK source directory'
}
. (Join-Path $root 'tools\dosbot\lib.ps1')
. (Join-Path $native 'retail-stage.ps1')
$gameMount = New-RetailStage -Source $GameDir -Name ("dqkdrive-" + ($Tag -replace '[^A-Za-z0-9._-]', '_'))
$work = Join-Path $native 'build\dqkdrive'
$cap = Join-Path $work 'captures'
New-Item -ItemType Directory -Force $work, $cap, (Join-Path $gameMount "_capture") | Out-Null

function Shoot { param([IntPtr]$Hwnd,[string]$Name)
  $p = Join-Path $cap $Name
  try { Capture-DosboxNative -Hwnd $Hwnd -MountDir $gameMount -OutPng $p | Out-Null } catch { Write-Output "  [$Name] capture failed: $_"; return }
  if ((Test-Path $p) -and (Get-Item $p).Length -gt 0) {
    $v = Invoke-Vision -Png $p
    Write-Output ("  [{0}] screen={1} crashed={2} note={3}" -f $Name,$v.screen,$v.looks_crashed,$v.note)
    Write-Output ("     text: {0}" -f $v.visible_text)
  } else { Write-Output "  [$Name] MISSING/EMPTY" }
}

$conf = Join-Path $work "$Tag-drive.conf"
@"
[sdl]
fullscreen=false
output=surface
autolock=false
[dosbox]
captures=$gameMount\_capture
[autoexec]
@echo off
mount C "$gameMount"
C:
DQK.EXE SB220 SI7 RB330
"@ | Set-Content -Path $conf -Encoding ASCII

$p = Start-DosboxConf -Conf $conf -BaseConf ""
$h = Wait-DosboxWindow -Proc $p -TimeoutSec 20
Start-Sleep -Seconds 12
for ($i=0; $i -lt 6; $i++) { Send-DosKeys -Hwnd $h -Keys "{ESC}"; Start-Sleep -Milliseconds 600 }
Start-Sleep -Seconds 1
Shoot -Hwnd $h -Name "${Tag}_0menu.png"
Send-DosText -Hwnd $h -Text "L"; Start-Sleep -Seconds 2; Shoot -Hwnd $h -Name "${Tag}_1L.png"
Send-DosText -Hwnd $h -Text "T"; Start-Sleep -Seconds 2; Shoot -Hwnd $h -Name "${Tag}_2T.png"
Send-DosText -Hwnd $h -Text "A"; Start-Sleep -Milliseconds 500
Send-DosKeys -Hwnd $h -Keys "{ENTER}"; Start-Sleep -Seconds 3; Shoot -Hwnd $h -Name "${Tag}_3loaded.png"
Send-DosText -Hwnd $h -Text "B"; Start-Sleep -Seconds 3; Shoot -Hwnd $h -Name "${Tag}_4begin.png"
Send-DosKeys -Hwnd $h -Keys "{ENTER}"; Start-Sleep -Seconds 3; Shoot -Hwnd $h -Name "${Tag}_5after.png"
Send-DosKeys -Hwnd $h -Keys "{ENTER}"; Start-Sleep -Seconds 3; Shoot -Hwnd $h -Name "${Tag}_6after2.png"
Stop-Dosbox -Proc $p
Write-Output "captures -> ${Tag}_0menu..6after2"
