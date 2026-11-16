# dosbox_x_debugbox_probe.ps1 — headless DOSBox-X debugger reach-and-screenshot probe.
#
# STATUS: entry probe, not a finished trace harness. GameLink now defaults to
# SDL's dummy video/audio drivers, process-hidden launch, and GameLink protocol/frame readiness;
# `-ShowGameLinkWindow` explicitly opts back into the visible minimized window. The headless path
# is structurally checked here but still requires runtime compatibility verification in an
# isolated Windows desktop/session before being trusted for gameplay traces. See
# docs/engine/research/dgroup-dynamic-trace.md for the full writeup. This script proves out the
# zero-keypress path to the debugger (-fastlaunch/-nopromptfolder + `DEBUGBOX <exe>`). Visible mode
# uses PrintWindow; headless GameLink mode captures the guest framebuffer through shared memory.
# The official portable 2026.07.02 SDL2 build mounts GOG paths when commands are placed in config
# [autoexec]; debugger command injection remains a separate probe.
#
# Usage:
#   pwsh tools/dosbox_x_debugbox_probe.ps1 -DbxExe "C:\path\to\dosbox-x_XPx64_SDL2.exe" `
#       -GameDir "C:\Modding\GoldBox\The Dark Queen of Krynn" -Exe "DQK.EXE" -OutDir C:\scratch\dbx
#
#   # First, sanity-check that MOUNT even works in your build:
#   pwsh tools/dosbox_x_debugbox_probe.ps1 -DbxExe ... -CheckMountOnly
#
# Notes:
# - DQK.EXE is the recommended target: it is NOT packed (unlike CoK/DoK's START.EXE, which is a
#   self-decompressing stub at entry — see the doc's §5), so DEBUGBOX lands on real, meaningful
#   startup code immediately.
# - Requires a DOSBox-X build with the debugger compiled in: `strings <exe> | grep MEMDUMPBIN`
#   must find something. The vanilla DOSBox.exe bundled in each game folder does NOT have this.
# - -GameLink + mouse-driven traces: DOSBox-X's [sdl] `mouse_emulation` config key defaults to
#   "locked" (`MOUSE_EMULATION_LOCKED` in src/gui/sdlmain.cpp), which only applies injected mouse
#   motion to the guest's absolute cursor position (`mouse.x`/`mouse.y`) when `user_cursor_locked`
#   is true — a state normally set by a REAL host click-to-capture into the DOSBox-X window. A
#   focusless/minimized GameLink session never performs that host click, so `user_cursor_locked`
#   stays false forever and GameLink `move`/`click` calls are silently discarded (button-state
#   bits still update, but the cursor position the guest reads does not) — confirmed by reading
#   `Mouse_CursorMoved()` in src/ints/mouse.cpp (the `if (!emu) { mouse.x = ... user_cursor_x ... }`
#   override block) against the exact source under
#   `build/tools/dosbox-x-source-2026.07.02/src/{gui/sdlmain.cpp,ints/mouse.cpp}`. Pass
#   `-ExtraSdlConf "mouse_emulation=always"` to force `MOUSE_EMULATION_ALWAYS` (unconditional
#   `emu = true`), which makes GameLink's injected mouse deltas actually move the guest cursor.
#   See docs/engine/research/dosbox-x-gamelink-automation.md for the full writeup (2026-07-18).

param(
  [Parameter(Mandatory=$true)][string]$DbxExe,
  [string]$GameDir = "C:\Modding\GoldBox\The Dark Queen of Krynn",
  # Optional second DOS drive for original games that retain a distinct data-disk path.
  [ValidatePattern('^[A-Za-z]$')][string]$AdditionalMountDrive,
  [string]$AdditionalMountDir,
  [ValidatePattern('^[A-Za-z0-9_.\\-]+$')][string]$DosWorkingDir,
  [string]$Exe = "DQK.EXE",
  [string]$OutDir = (Join-Path $env:TEMP "dosbox_x_debugbox_probe"),
  [switch]$CheckMountOnly,
  [Alias('DebuggerCommand')]
  [ValidatePattern('^[\x20-\x7E]{1,256}$')][string[]]$DebuggerAction,
  [ValidateRange(0,5000)][int]$ActionDelayMs = 250,
  [ValidatePattern('^(fixed )?[0-9]+$')][string]$Cycles,
  [ValidateRange(0,256)][int]$LoadFixKb = 0,
  [switch]$RunDirect,
  [ValidatePattern('^[A-Za-z0-9_,.\-]+$')][string[]]$AutoTypeKey,
  [ValidateRange(0.0,30.0)][double]$AutoTypeWaitSec = 2.0,
  [ValidateRange(0.0,10.0)][double]$AutoTypePaceSec = 0.5,
  [switch]$GameLink,
  [ValidateRange(0,15000)][int]$ReadySettleMs = 0,
  # GameLink uses a child-scoped SDL dummy driver and hidden process launch by default.
  # This opt-in restores the old visible/minimized SDL window for manual inspection.
  [switch]$ShowGameLinkWindow,
  [switch]$NoInitialScreenshots,
  [switch]$NoActionScreenshots,
  [switch]$StopAfterCapture,
  # Optional extra raw lines appended to the generated [sdl] section (e.g.
  # "mouse_emulation=always" for GameLink mouse-driven traces — see the header note above).
  # Empty by default: fully backward-compatible with every existing caller.
  [string]$ExtraSdlConf = "",
  # Optional host path for a DOSBox-X [log] logfile capturing DOS file opens. When set, the
  # generated conf gains a [log] section with logfile=<path>, files=normal (the FILES channel —
  # DOS_OpenFile in src/dos/dos_files.cpp logs "file open command %X file %s" at LOG_NORMAL on
  # every INT 21h open) and fileio=true (adds close/read/write lines, closes at LOG_NORMAL).
  # Empty by default: fully backward-compatible with every existing caller.
  [string]$DosLogFile = ""
)

Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $OutDir | Out-Null
$OutDir = (Resolve-Path -LiteralPath $OutDir).Path
if (-not (Test-Path -LiteralPath $DbxExe -PathType Leaf)) {
  throw "DOSBox-X executable not found: $DbxExe"
}
$DbxExe = (Resolve-Path -LiteralPath $DbxExe).Path
if (-not (Test-Path -LiteralPath $GameDir -PathType Container)) {
  throw "Game directory not found: $GameDir"
}
$GameDir = (Resolve-Path -LiteralPath $GameDir).Path
if ([bool]$AdditionalMountDrive -ne [bool]$AdditionalMountDir) {
  throw 'AdditionalMountDrive and AdditionalMountDir must be supplied together.'
}
if ($AdditionalMountDir) {
  if (-not (Test-Path -LiteralPath $AdditionalMountDir -PathType Container)) {
    throw "Additional mount directory not found: $AdditionalMountDir"
  }
  $AdditionalMountDir = (Resolve-Path -LiteralPath $AdditionalMountDir).Path
}

# READ-ONLY SOURCE GUARD.
#
# This probe does `MOUNT C "<GameDir>"` followed by `C:` and then runs the retail
# executable, so the mounted folder is the DOS child's current drive and every
# file the game writes -- saves, capture files, a stray CCFP.MOV -- lands there.
# CLAUDE.md: "Game-data folders are large binary GOG releases ... treat them as
# read-only source." Measured on 2026-09-05: the sibling native/gbflow-test.ps1,
# which has the same mount shape, created "Champions of Krynn/CCFP.MOV" and
# rewrote six tracked SAVE/CHRDATA*.SAV in one run.
#
# Most callers already hand this probe their own scratch stage; those are left
# exactly as they are. Only a directory that IS one of the protected read-only
# source locations gets redirected to a mirror, so the fix reaches
# capture_gen1_demo.ps1, trace_cok_treasure_rng.ps1, the four
# trace_pool_*_probe.ps1 scripts and this file's own default -GameDir without
# touching the ~45 callers that already stage.
$ProtectedSourceRoots = @(
  (Join-Path $PSScriptRoot '..' | Resolve-Path).Path,   # repo root: the three retail Krynn folders
  'C:\Program Files (x86)\GOG Galaxy\Games',
  'D:\Games'
)
function Test-ProtectedSourcePath([string]$Path) {
  foreach ($rootDir in $ProtectedSourceRoots) {
    if (-not $rootDir) { continue }
    $r = $rootDir.TrimEnd('\')
    if ($Path -ieq $r) { return $true }
    if ($Path.StartsWith($r + '\', [StringComparison]::OrdinalIgnoreCase)) {
      if ($r -ieq (Join-Path $PSScriptRoot '..' | Resolve-Path).Path.TrimEnd('\')) {
        # Inside the repo, only the three retail game folders are protected;
        # build/, tools/ and scratch trees under it are fair game.
        $rel = $Path.Substring($r.Length + 1)
        $top = $rel.Split('\')[0]
        if (@('Champions of Krynn', 'Death Knights of Krynn', 'The Dark Queen of Krynn') -notcontains $top) {
          continue
        }
      }
      return $true
    }
  }
  return $false
}
. (Join-Path $PSScriptRoot '..\native\retail-stage.ps1')
function Get-SafeMountDir([string]$Path, [string]$Label) {
  if (-not (Test-ProtectedSourcePath $Path)) { return $Path }
  $key = [BitConverter]::ToString(
    [Security.Cryptography.MD5]::Create().ComputeHash(
      [Text.Encoding]::UTF8.GetBytes($Path.ToLowerInvariant()))).Replace('-', '').Substring(0, 8)
  $name = '{0}-{1}' -f (Split-Path -Leaf $Path), $key
  $stage = New-RetailStage -Source $Path -Name $name
  Write-Host "[probe] $Label is a read-only source; mounting mirror instead: $stage"
  return $stage
}
$GameDir = Get-SafeMountDir $GameDir 'GameDir'
if ($AdditionalMountDir) {
  $AdditionalMountDir = Get-SafeMountDir $AdditionalMountDir 'AdditionalMountDir'
}
if ($ShowGameLinkWindow -and -not $GameLink) {
  throw '-ShowGameLinkWindow requires -GameLink.'
}
$headlessGameLink = [bool]$GameLink -and -not [bool]$ShowGameLinkWindow

Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class DbxProbeWin32 {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  public delegate bool EnumProc(IntPtr hWnd, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int max);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  public static List<IntPtr> Windows(uint pid) {
    var list = new List<IntPtr>();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p == pid && IsWindowVisible(h)) list.Add(h);
      return true;
    }, IntPtr.Zero);
    return list;
  }
  public static RECT Rect(IntPtr h) { RECT r; GetWindowRect(h, out r); return r; }
  public static string Title(IntPtr h) { var sb = new StringBuilder(256); GetWindowText(h, sb, 256); return sb.ToString(); }
}
"@

function Save-Shot([IntPtr]$h, [string]$path) {
  $r = [DbxProbeWin32]::Rect($h)
  $w = $r.Right - $r.Left; $hh = $r.Bottom - $r.Top
  if ($w -le 0 -or $hh -le 0) { return $false }
  $bmp = New-Object System.Drawing.Bitmap $w, $hh
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $g.GetHdc()
  [DbxProbeWin32]::PrintWindow($h, $hdc, 2) | Out-Null   # PW_RENDERFULLCONTENT
  $g.ReleaseHdc($hdc)
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  return $true
}

function Assert-ExclusiveGameLinkProcess([int]$OwnedPid = 0) {
  $foreign = @(Get-Process -Name 'dosbox-x' -ErrorAction SilentlyContinue |
    Where-Object { $_.Id -ne $OwnedPid })
  if ($foreign.Count -gt 0) {
    throw "GameLink is a machine-wide singleton; foreign DOSBox-X PID(s) detected: $($foreign.Id -join ',')"
  }
}

function Assert-NoVisibleGameLinkWindow([int]$OwnedPid) {
  $visible = [DbxProbeWin32]::Windows([uint32]$OwnedPid)
  if ($visible.Count -gt 0) {
    $titles = @($visible | ForEach-Object { [DbxProbeWin32]::Title($_) }) -join '; '
    throw "Headless GameLink unexpectedly created a visible window for pid $OwnedPid ($titles); refusing visible fallback."
  }
}

$confPath = Join-Path $OutDir "probe.conf"
$autoTypeLine = if ($AutoTypeKey.Count -gt 0) {
  "AUTOTYPE -w $AutoTypeWaitSec -p $AutoTypePaceSec $($AutoTypeKey -join ' ')"
} else { "" }
$autoexec = if ($CheckMountOnly) {
@"
MOUNT Q "$OutDir"
Q:
$autoTypeLine
"@
} else {
$changeDir = if ($DosWorkingDir) { "CD $DosWorkingDir" } else { "" }
$loadFixLine = if ($LoadFixKb -gt 0) { "LOADFIX -$LoadFixKb" } else { "" }
$additionalMountLine = if ($AdditionalMountDir) {
  "MOUNT $($AdditionalMountDrive.ToUpperInvariant()) `"$AdditionalMountDir`""
} else { "" }
$launch = if ($RunDirect) { $Exe } else { "DEBUGBOX $Exe" }
@"
MOUNT C "$GameDir"
$additionalMountLine
C:
$changeDir
$loadFixLine
$autoTypeLine
$launch
"@
}
$cpuBlock = if ($Cycles) { "[cpu]`r`ncycles=$Cycles`r`n" } else { "" }
$logBlock = if ($DosLogFile) {
  $resolvedLog = [IO.Path]::GetFullPath($DosLogFile)
  "[log]`r`nlogfile=$resolvedLog`r`nfiles=normal`r`nfileio=true`r`n"
} else { "" }
$output = if ($GameLink) { 'gamelink' } else { 'surface' }
$gameLinkBlock = if ($GameLink) { "gamelink master=true`r`n" } else { "" }
@"
[sdl]
fullscreen=false
output=$output
autolock=false
$gameLinkBlock
$ExtraSdlConf
${logBlock}[dosbox]
captures=$OutDir\_capture
[mixer]
nosound=true
[render]
scaler=none
${cpuBlock}[autoexec]
@echo off
$autoexec
"@ | Set-Content -Path $confPath -Encoding ascii

$args = @("-conf", "`"$confPath`"", "-fastlaunch", "-nopromptfolder", "-defaultdir", "`"$OutDir`"")
if ($headlessGameLink -and $DebuggerAction.Count -eq 0) { $args = @('-noconsole') + $args }

if ($GameLink) {
  Assert-ExclusiveGameLinkProcess
}

Write-Host "[probe] launching: $DbxExe $($args -join ' ')"
$startArgs = @{ FilePath = $DbxExe; ArgumentList = $args; PassThru = $true; WorkingDirectory = $OutDir }
if ($headlessGameLink) { $startArgs.WindowStyle = 'Hidden' }
elseif ($GameLink) { $startArgs.WindowStyle = 'Minimized' }
$oldVideoDriver = $env:SDL_VIDEODRIVER
$oldAudioDriver = $env:SDL_AUDIODRIVER
try {
  if ($headlessGameLink) {
    $env:SDL_VIDEODRIVER = 'dummy'
    $env:SDL_AUDIODRIVER = 'dummy'
  }
  $p = Start-Process @startArgs
} finally {
  $env:SDL_VIDEODRIVER = $oldVideoDriver
  $env:SDL_AUDIODRIVER = $oldAudioDriver
}
$headlessProbeSucceeded = $false
$gamelinkClient = Join-Path $PSScriptRoot 'dosbox_gamelink.py'
try {
  if ($headlessGameLink) {
    if (-not (Test-Path -LiteralPath $gamelinkClient -PathType Leaf)) {
      throw "GameLink client is absent: $gamelinkClient"
    }
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    $gamelinkStatus = $null
    do {
      $p.Refresh()
      if ($p.HasExited) { throw "Process exited before GameLink became ready (code $($p.ExitCode))" }
      Assert-ExclusiveGameLinkProcess -OwnedPid $p.Id
      Assert-NoVisibleGameLinkWindow -OwnedPid $p.Id
      $statusText = & python $gamelinkClient --timeout 0.5 status 2>$null
      if ($LASTEXITCODE -eq 0) {
        try {
          $candidate = ($statusText -join "`n") | ConvertFrom-Json
          if ($candidate.version -eq 4 -and $candidate.frame.width -gt 0 -and $candidate.frame.height -gt 0) {
            $gamelinkStatus = $candidate
            break
          }
        } catch {}
      }
      Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    if (-not $gamelinkStatus) { throw 'Headless GameLink did not publish a valid v4 frame within 30 seconds.' }
    if ($ReadySettleMs -gt 0) {
      Start-Sleep -Milliseconds $ReadySettleMs
      $p.Refresh()
      if ($p.HasExited) { throw "Process exited during GameLink settle delay (code $($p.ExitCode))" }
      Assert-ExclusiveGameLinkProcess -OwnedPid $p.Id
      Assert-NoVisibleGameLinkWindow -OwnedPid $p.Id
    }
  } else {
    Start-Sleep -Seconds 8
    $p.Refresh()
    if ($p.HasExited) { throw "Process exited early (code $($p.ExitCode))" }
  }

  if ($DebuggerAction.Count -gt 0 -and -not $CheckMountOnly -and -not $headlessGameLink) {
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    do {
      $wins = [DbxProbeWin32]::Windows([uint32]$p.Id)
      $debuggerReady = @($wins | Where-Object {
        ([DbxProbeWin32]::Title($_)) -match 'DEBUGGER'
      }).Count -gt 0
      if (-not $debuggerReady) { Start-Sleep -Milliseconds 250 }
    } while (-not $debuggerReady -and [DateTime]::UtcNow -lt $deadline -and -not $p.HasExited)
    if (-not $debuggerReady) {
      $titles = @($wins | ForEach-Object { [DbxProbeWin32]::Title($_) }) -join '; '
      throw "Debugger window did not become ready for pid $($p.Id); visible titles: $titles"
    }
  }

$wins = [DbxProbeWin32]::Windows([uint32]$p.Id)
if ($headlessGameLink) { Assert-NoVisibleGameLinkWindow -OwnedPid $p.Id }
if ($wins.Count -eq 0 -and -not $headlessGameLink) { Write-Host "[probe] no window found for pid $($p.Id)"; exit 1 }
foreach ($h in $wins) { Write-Host ("[probe] window: hwnd={0} title='{1}'" -f $h, ([DbxProbeWin32]::Title($h))) }

$windowRecords = @($wins | ForEach-Object {
  $title = [DbxProbeWin32]::Title($_)
  [ordered]@{
    hwnd = [int64]$_
    title = $title
    role = if ($title -eq 'DOSBox-X Debugger') { 'debugger-console' } else { 'render' }
  }
})
[ordered]@{
  schema_version = 1
  process_id = $p.Id
  executable = $DbxExe
  game_dir = $GameDir
  dos_working_dir = $DosWorkingDir
  guest_executable = $Exe
  run_direct = [bool]$RunDirect
  loadfix_kb = $LoadFixKb
  gamelink = [bool]$GameLink
  launch_mode = if ($headlessGameLink) { 'headless-gamelink-sdl-dummy' } elseif ($GameLink) { 'visible-gamelink-opt-in' } else { 'windowed-surface' }
  gamelink_status = if ($headlessGameLink) { $gamelinkStatus } else { $null }
  autotype = if ($AutoTypeKey.Count -gt 0) { [ordered]@{
    keys = $AutoTypeKey
    wait_seconds = $AutoTypeWaitSec
    pace_seconds = $AutoTypePaceSec
    mechanism = 'DOSBox-X AUTOTYPE internal mapper events'
  } } else { $null }
  windows = $windowRecords
} | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $OutDir 'probe-process.json') -Encoding utf8

$saved = @()
if ($headlessGameLink -and -not $NoInitialScreenshots) {
  Assert-ExclusiveGameLinkProcess -OwnedPid $p.Id
  $out = Join-Path $OutDir 'probe_shot.png'
  & python $gamelinkClient screenshot $out
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $out -PathType Leaf)) {
    throw 'Headless GameLink framebuffer capture failed.'
  }
  $saved += $out
  Write-Host "[probe] saved GameLink framebuffer: $out"
} elseif (-not $NoInitialScreenshots) {
  for ($i = 0; $i -lt $wins.Count; $i++) {
    $suffix = if ($i -eq 0) { '' } else { "_$i" }
    $out = Join-Path $OutDir "probe_shot$suffix.png"
    if (Save-Shot $wins[$i] $out) {
      $saved += $out
      Write-Host "[probe] saved screenshot: $out"
    }
  }
}
if ($saved.Count -gt 0 -and $headlessGameLink) {
  Write-Host '[probe] framebuffer screenshot came from GameLink; no DOSBox window was required'
} elseif ($saved.Count -gt 0) {
  Write-Host "[probe] READ THIS SCREENSHOT: if -CheckMountOnly, confirm 'Q:' became the prompt"
  Write-Host "[probe]   (if it says 'Bad command or filename - MOUNT', this DOSBox-X build has"
  Write-Host "[probe]    the regression documented in dgroup-dynamic-trace.md sec.4 - fix/replace"
  Write-Host "[probe]    the build before continuing). Otherwise, check whether the debugger UI"
  Write-Host "[probe]    is visible with a register pane (zero-keystroke read) or still at a"
  Write-Host "[probe]    plain DOS prompt (meaning DEBUGBOX/MOUNT did not take effect)."
} else {
  Write-Host "[probe] screenshots failed"
}

if ($DebuggerAction.Count -gt 0) {
  if ($CheckMountOnly) { throw '-DebuggerCommand cannot be combined with -CheckMountOnly' }
  if ($RunDirect) { throw '-DebuggerCommand cannot be combined with -RunDirect' }
  $helperProject = Join-Path $PSScriptRoot 'dosbox_debugger_input\DosboxDebuggerInput.csproj'
  $helperDll = Join-Path $PSScriptRoot 'dosbox_debugger_input\bin\Release\net9.0-windows\DosboxDebuggerInput.dll'
  if (-not (Test-Path $helperDll)) {
    & dotnet build $helperProject --configuration Release
    if ($LASTEXITCODE -ne 0) { throw "Debugger input helper build failed: $LASTEXITCODE" }
  }

  for ($commandIndex = 0; $commandIndex -lt $DebuggerAction.Count; $commandIndex++) {
    $action = $DebuggerAction[$commandIndex]
    $statusPath = Join-Path $OutDir "debugger_input_status_$commandIndex.json"
    $snapshotPath = Join-Path $OutDir "debugger_console_$commandIndex.txt"
    if ($action -match '^<(ENTER|F5|F10|F11)>$') {
      Write-Host "[probe] sending debugger key $commandIndex to pid $($p.Id): $($Matches[1])"
      & dotnet $helperDll --pid $p.Id --key $Matches[1] --status $statusPath --snapshot $snapshotPath
    } else {
      Write-Host "[probe] sending debugger command $commandIndex to pid $($p.Id): $action"
      & dotnet $helperDll --pid $p.Id --command $action --status $statusPath --snapshot $snapshotPath
    }
    $helperExit = $LASTEXITCODE
    if (Test-Path $statusPath) { Get-Content $statusPath | Write-Host }
    if ($helperExit -ne 0) { throw "Debugger input helper failed: $helperExit" }
    if ($ActionDelayMs -gt 0) { Start-Sleep -Milliseconds $ActionDelayMs }

    if ($headlessGameLink -and -not $NoActionScreenshots) {
      Assert-ExclusiveGameLinkProcess -OwnedPid $p.Id
      $out = Join-Path $OutDir ("probe_after_command_{0}.png" -f $commandIndex)
      & python $gamelinkClient screenshot $out
      if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $out -PathType Leaf)) {
        throw "Headless GameLink framebuffer capture failed after command $commandIndex."
      }
      Write-Host "[probe] saved post-command GameLink framebuffer: $out"
    } elseif (-not $NoActionScreenshots) {
      $afterWins = [DbxProbeWin32]::Windows([uint32]$p.Id)
      for ($windowIndex = 0; $windowIndex -lt $afterWins.Count; $windowIndex++) {
        $windowSuffix = if ($windowIndex -eq 0) { '' } else { "_$windowIndex" }
        $out = Join-Path $OutDir "probe_after_command_$commandIndex$windowSuffix.png"
        if (Save-Shot $afterWins[$windowIndex] $out) { Write-Host "[probe] saved post-command screenshot: $out" }
      }
    }
  }
}

if ($headlessGameLink) { $headlessProbeSucceeded = $true }
if (-not $StopAfterCapture) {
  Write-Host "[probe] leaving process running (pid=$($p.Id)) for manual inspection; kill it when done:"
  Write-Host "[probe]   Stop-Process -Id $($p.Id)"
}
} finally {
  if (($StopAfterCapture -or ($headlessGameLink -and -not $headlessProbeSucceeded)) -and $p -and -not $p.HasExited) {
    Stop-Process -Id $p.Id
    $p.WaitForExit(5000) | Out-Null
    Write-Host "[probe] stopped launched process pid=$($p.Id)"
  }
}
