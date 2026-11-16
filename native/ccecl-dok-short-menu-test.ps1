# ccecl-dok-short-menu-test.ps1 -- DoK's Gen1 0x31 bridge contract.
param([switch]$Headless)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$native = $PSScriptRoot
$build = Join-Path $native 'build'
$run = Join-Path $build 'ccecl-dok-short-menu-test'
$dosbox = Join-Path $root 'The Dark Queen of Krynn\DOSBOX\DOSBox.exe'
. (Join-Path $native 'dosbox-smoke.ps1')
if (-not (Test-Path -LiteralPath $dosbox)) { throw "Required DOSBox executable is unavailable: $dosbox" }
& (Join-Path $native 'build.ps1') -Target ccecl
if ($LASTEXITCODE -ne 0) { throw 'CCECL build failed' }
& (Join-Path $native 'build.ps1') -Target ccmenu
if ($LASTEXITCODE -ne 0) { throw 'CCMENU build failed' }
if (Test-Path $run) { Remove-Item -Recurse -Force $run }
New-Item -ItemType Directory -Path $run -Force | Out-Null
Copy-Item (Join-Path $build 'ccecl.com') (Join-Path $run 'CCECL.COM')
Copy-Item (Join-Path $build 'ccmenu.com') (Join-Path $run 'CCMENU.COM')
Set-Content (Join-Path $run 'DKK.CFG') -Value '' -Encoding ASCII

# Gen1 header, then SHORT_MENU [010E], #2, 'JUMP', 'WAIT'; SAVE #9,[010F]; EXIT.
$program = [byte[]](@(0) * 22 + @(0x31,1,0x0e,1,0,2,0x80,3,0x29,0x53,0x50,0x80,3,0x5c,0x12,0x54,0x09,0,9,1,0x0f,1,0))
[IO.File]::WriteAllBytes((Join-Path $run 'D31.BIN'), $program)
$conf = Join-Path $run '_d31.conf'
@"
[sdl]
output=surface
[cpu]
cycles=fixed 25000
[autoexec]
mount C "$run"
C:
CCECL C:\D31.BIN /! /E C:\D31.EFX > C:\D310.TXT
CCMENU C:\D31.EFX C:\D31.GMO /S 1 > C:\D31M.TXT
CCECL C:\D31.BIN /R C:\D31.EFX C:\D31.GMO /E C:\D311.EFX > C:\D311.TXT
exit
"@ | Set-Content $conf -Encoding ASCII
$p = Start-DosBoxSmoke -Dosbox $dosbox -Conf $conf -Headless:$Headless
if (-not $p.WaitForExit(60000)) { Stop-DosBoxSmoke $p; throw 'DOSBox timed out' }
if ($p.ExitCode -ne 0) { throw "DOSBox exited with code $($p.ExitCode)" }
$pending = [IO.File]::ReadAllBytes((Join-Path $run 'D31.EFX'))
$resumed = [IO.File]::ReadAllBytes((Join-Path $run 'D311.EFX'))
if ($pending.Length -ne 5920 -or [BitConverter]::ToUInt16($pending, 5760) -ne 0x31 -or
    [BitConverter]::ToUInt16($pending, 5756) -ne 0x010e -or [BitConverter]::ToUInt16($pending, 5758) -ne 2 -or
    [BitConverter]::ToUInt16($pending, 2254) -ne 4) { throw 'DoK SHORT_MENU pending contract failed' }
if ($resumed.Length -ne 5750 -or [BitConverter]::ToUInt16($resumed, 4) -ne 9) { throw 'DoK SHORT_MENU did not cold-resume' }
$text = Get-Content (Join-Path $run 'D31M.TXT') -Raw
if ($text -notmatch '1\. JUMP' -or $text -notmatch '2\. WAIT') { throw 'DoK SHORT_MENU labels missing' }
Write-Output 'RESULT: DoK Gen1 SHORT_MENU bridge and cold resume PASS'
