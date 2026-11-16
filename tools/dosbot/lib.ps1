# dosbot/lib.ps1 — primitives for automated DOSBox testing.
# Launch a DOSBox build, capture its window to PNG, send keystrokes, stop it.
# No external tools: Win32 via Add-Type + System.Drawing + SendKeys.
#
# The visual bot still needs a real SDL render window for input and screenshots.
# Launches default to capped cycles, lower priority, and no status console. The
# legacy GUI path can activate the user's desktop, so it requires an explicit
# process-scoped opt-in before it launches or sends input.

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

if (-not ([System.Management.Automation.PSTypeName]'DosBotWin32').Type) {
  Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class DosBotWin32 {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int n);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int max);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder s, int max);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  public delegate bool EnumProc(IntPtr hWnd, IntPtr l);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);

  // Force the SDL window to the foreground + give it keyboard focus, defeating the
  // background-process SetForegroundWindow lock via AttachThreadInput, then a real click.
  public static bool ForceFocus(IntPtr hWnd) {
    uint fgThread; uint fgPid;
    IntPtr fg = GetForegroundWindow();
    fgThread = GetWindowThreadProcessId(fg, out fgPid);
    uint me = GetCurrentThreadId();
    AttachThreadInput(me, fgThread, true);
    ShowWindow(hWnd, 9); // SW_RESTORE
    BringWindowToTop(hWnd);
    SetForegroundWindow(hWnd);
    AttachThreadInput(me, fgThread, false);
    // physical-ish click at window center to make SDL take focus
    RECT r; GetWindowRect(hWnd, out r);
    int cx = (r.Left + r.Right) / 2; int cy = Math.Min(r.Bottom - 8, r.Top + 96);
    SetCursorPos(cx, cy);
    mouse_event(0x0002, 0, 0, 0, IntPtr.Zero); // LEFTDOWN
    mouse_event(0x0004, 0, 0, 0, IntPtr.Zero); // LEFTUP
    return GetForegroundWindow() == hWnd;
  }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }

  // Find the SDL render window of a DOSBox process: visible, belongs to pid,
  // title contains "DOSBox" but NOT "Status" (the logging console).
  public static IntPtr FindRenderWindow(uint targetPid) {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid != targetPid) return true;
      StringBuilder t = new StringBuilder(256); GetWindowText(h, t, 256);
      string title = t.ToString();
      if (title.IndexOf("DOSBox", StringComparison.OrdinalIgnoreCase) >= 0 &&
          title.IndexOf("Status", StringComparison.OrdinalIgnoreCase) < 0 &&
          title.IndexOf("Debugger", StringComparison.OrdinalIgnoreCase) < 0) {
        found = h; return false;
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static IntPtr FindOwnedWindow(uint targetPid, string requiredTitle, string excludedTitle) {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid != targetPid) return true;
      StringBuilder t = new StringBuilder(256); GetWindowText(h, t, 256);
      string title = t.ToString();
      if ((String.IsNullOrEmpty(requiredTitle) || title.IndexOf(requiredTitle, StringComparison.OrdinalIgnoreCase) >= 0) &&
          (String.IsNullOrEmpty(excludedTitle) || title.IndexOf(excludedTitle, StringComparison.OrdinalIgnoreCase) < 0)) {
        found = h; return false;
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static string WindowTitle(IntPtr h) {
    StringBuilder t = new StringBuilder(256); GetWindowText(h, t, 256); return t.ToString();
  }

  // ---- Hardware scancode injection (SDL/DirectInput reads THIS, not WM_KEYDOWN) ----
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT {
    public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo;
  }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT {
    public uint type; public KEYBDINPUT ki; public ulong pad; // pad so size >= MOUSEINPUT union on x64
  }
  [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint n, INPUT[] p, int cb);
  const uint INPUT_KEYBOARD = 1;
  const uint KEYEVENTF_KEYUP = 0x0002;
  const uint KEYEVENTF_SCANCODE = 0x0008;
  const uint KEYEVENTF_EXTENDED = 0x0001;

  public static void SendScan(ushort scan, bool extended) {
    uint ext = extended ? KEYEVENTF_EXTENDED : 0;
    INPUT[] seq = new INPUT[2];
    seq[0].type = INPUT_KEYBOARD;
    seq[0].ki = new KEYBDINPUT { wVk=0, wScan=scan, dwFlags=KEYEVENTF_SCANCODE|ext, time=0, dwExtraInfo=IntPtr.Zero };
    seq[1].type = INPUT_KEYBOARD;
    seq[1].ki = new KEYBDINPUT { wVk=0, wScan=scan, dwFlags=KEYEVENTF_SCANCODE|KEYEVENTF_KEYUP|ext, time=0, dwExtraInfo=IntPtr.Zero };
    SendInput(2, seq, Marshal.SizeOf(typeof(INPUT)));
  }

  // Chord: hold a modifier scancode, tap a key, release the modifier (e.g. Alt+F1).
  public static void SendChord(ushort modScan, ushort scan, bool scanExt) {
    uint ext = scanExt ? KEYEVENTF_EXTENDED : 0;
    INPUT[] seq = new INPUT[4];
    seq[0].type = INPUT_KEYBOARD;  // modifier down
    seq[0].ki = new KEYBDINPUT { wVk=0, wScan=modScan, dwFlags=KEYEVENTF_SCANCODE, time=0, dwExtraInfo=IntPtr.Zero };
    seq[1].type = INPUT_KEYBOARD;  // key down
    seq[1].ki = new KEYBDINPUT { wVk=0, wScan=scan, dwFlags=KEYEVENTF_SCANCODE|ext, time=0, dwExtraInfo=IntPtr.Zero };
    seq[2].type = INPUT_KEYBOARD;  // key up
    seq[2].ki = new KEYBDINPUT { wVk=0, wScan=scan, dwFlags=KEYEVENTF_SCANCODE|KEYEVENTF_KEYUP|ext, time=0, dwExtraInfo=IntPtr.Zero };
    seq[3].type = INPUT_KEYBOARD;  // modifier up
    seq[3].ki = new KEYBDINPUT { wVk=0, wScan=modScan, dwFlags=KEYEVENTF_SCANCODE|KEYEVENTF_KEYUP, time=0, dwExtraInfo=IntPtr.Zero };
    SendInput(4, seq, Marshal.SizeOf(typeof(INPUT)));
  }

  public static void SendVirtualChord(ushort modifier, ushort key) {
    INPUT[] seq = new INPUT[4];
    seq[0].type = INPUT_KEYBOARD;
    seq[0].ki = new KEYBDINPUT { wVk=modifier, wScan=0, dwFlags=0, time=0, dwExtraInfo=IntPtr.Zero };
    seq[1].type = INPUT_KEYBOARD;
    seq[1].ki = new KEYBDINPUT { wVk=key, wScan=0, dwFlags=0, time=0, dwExtraInfo=IntPtr.Zero };
    seq[2].type = INPUT_KEYBOARD;
    seq[2].ki = new KEYBDINPUT { wVk=key, wScan=0, dwFlags=KEYEVENTF_KEYUP, time=0, dwExtraInfo=IntPtr.Zero };
    seq[3].type = INPUT_KEYBOARD;
    seq[3].ki = new KEYBDINPUT { wVk=modifier, wScan=0, dwFlags=KEYEVENTF_KEYUP, time=0, dwExtraInfo=IntPtr.Zero };
    SendInput(4, seq, Marshal.SizeOf(typeof(INPUT)));
  }
}
"@
}

# Map friendly key names -> (PS/2 set-1 scancode, extended?). Arrows are extended (0xE0-prefixed).
# Set-1 hardware scancodes. Full A–Z + 0–9 so the harness can TYPE words (copy-protection answers,
# character names) — not just navigate menus. Letters are non-extended; arrows are extended.
$script:DOS_SCAN = @{
  "ESC"=@(0x01,$false); "ENTER"=@(0x1C,$false); "SPACE"=@(0x39,$false); "TAB"=@(0x0F,$false);
  "BACK"=@(0x0E,$false); "BACKSPACE"=@(0x0E,$false);
  "UP"=@(0x48,$true); "DOWN"=@(0x50,$true); "LEFT"=@(0x4B,$true); "RIGHT"=@(0x4D,$true);
  "F1"=@(0x3B,$false); "F2"=@(0x3C,$false); "F3"=@(0x3D,$false); "F4"=@(0x3E,$false);
  "F5"=@(0x3F,$false); "F6"=@(0x40,$false); "F7"=@(0x41,$false); "F8"=@(0x42,$false);
  "F9"=@(0x43,$false); "F10"=@(0x44,$false);
  "A"=@(0x1E,$false); "B"=@(0x30,$false); "C"=@(0x2E,$false); "D"=@(0x20,$false); "E"=@(0x12,$false);
  "F"=@(0x21,$false); "G"=@(0x22,$false); "H"=@(0x23,$false); "I"=@(0x17,$false); "J"=@(0x24,$false);
  "K"=@(0x25,$false); "L"=@(0x26,$false); "M"=@(0x32,$false); "N"=@(0x31,$false); "O"=@(0x18,$false);
  "P"=@(0x19,$false); "Q"=@(0x10,$false); "R"=@(0x13,$false); "S"=@(0x1F,$false); "T"=@(0x14,$false);
  "U"=@(0x16,$false); "V"=@(0x2F,$false); "W"=@(0x11,$false); "X"=@(0x2D,$false); "Y"=@(0x15,$false);
  "Z"=@(0x2C,$false);
  "0"=@(0x0B,$false); "1"=@(0x02,$false); "2"=@(0x03,$false); "3"=@(0x04,$false); "4"=@(0x05,$false);
  "5"=@(0x06,$false); "6"=@(0x07,$false); "7"=@(0x08,$false); "8"=@(0x09,$false); "9"=@(0x0A,$false);
}

$script:DOSBOX_EXE = "C:\Modding\GoldBox\The Dark Queen of Krynn\DOSBOX\DOSBox.exe"
$script:DOSBOX_SETTINGS = "C:\Modding\GoldBox\The Dark Queen of Krynn\dosbox_krynnQueen.conf"

function Assert-DosboxDesktopFocusOptIn {
  param([Parameter(Mandatory)][string]$Operation)
  if ($env:GOLDBOX_ALLOW_DOSBOX_DESKTOP_FOCUS -cne "1") {
    throw "$Operation blocked: legacy DOSBox GUI automation can activate desktop focus. Set GOLDBOX_ALLOW_DOSBOX_DESKTOP_FOCUS=1 in this process only when that is intentional."
  }
}

# Resolve the DOSBox cycle cap shared with the native smoke harness. Use
# GOLDBOX_DOSBOX_CYCLES=inherit to keep the base/game config unchanged.
function Resolve-DosboxBotCycles {
  param([string]$Cycles)
  $cycleOverride = $Cycles
  if (-not $cycleOverride) { $cycleOverride = $env:GOLDBOX_DOSBOX_CYCLES }
  if (-not $cycleOverride) { $cycleOverride = "fixed 25000" }
  if ($cycleOverride -ieq "inherit" -or $cycleOverride -ieq "conf") { return "" }
  return $cycleOverride
}

function Start-DosboxConf {
  param(
    [Parameter(Mandatory)][string]$Conf,
    [string]$BaseConf = $script:DOSBOX_SETTINGS,
    [string]$Cycles,
    [switch]$Console,
    [switch]$NormalWindow
  )
  Assert-DosboxDesktopFocusOptIn -Operation "DOSBox launch"
  $args = @()
  if (-not $Console) { $args += "-noconsole" }
  if ($BaseConf) { $args += @("-conf", "`"$BaseConf`"") }
  $args += @("-conf", "`"$Conf`"")

  $cycleOverride = Resolve-DosboxBotCycles -Cycles $Cycles
  if ($cycleOverride) {
    $quietConf = Join-Path ([IO.Path]::GetTempPath()) ("goldbox-dosbot-{0}.conf" -f ([Guid]::NewGuid().ToString("N")))
@"
[sdl]
priority=lower,lower
[mixer]
nosound=true
[cpu]
cycles=$cycleOverride
"@ | Set-Content -Path $quietConf -Encoding ASCII
    $args += @("-conf", "`"$quietConf`"")
  }

  $style = if ($NormalWindow) { "Normal" } else { "Minimized" }
  $workDir = Split-Path -Parent (Resolve-Path -LiteralPath $Conf)
  $p = Start-Process -FilePath $script:DOSBOX_EXE `
    -ArgumentList $args `
    -WindowStyle $style `
    -WorkingDirectory $workDir `
    -PassThru
  try { $p.PriorityClass = "BelowNormal" } catch {}
  return $p
}

# Write a bot-friendly autoexec conf: windowed, software surface (capturable), mount + run.
function Write-BotConf {
  param(
    [string]$MountDir,
    [string]$ConfPath,
    [string]$Exe = "dqk",
    [string]$ExeArgs = "SB220 SI7 RB330",
    [string]$Cycles = "fixed 25000"
  )
  $cpuBlock = if ($Cycles) { "[cpu]`r`ncycles=$Cycles`r`n" } else { "" }
  $conf = @"
[sdl]
fullscreen=false
output=surface
autolock=false
priority=lower,lower
[render]
scaler=normal2x
[dosbox]
captures=$MountDir\_capture
[mixer]
nosound=true
${cpuBlock}[autoexec]
@echo off
mount C "$MountDir"
c:
$Exe $ExeArgs
"@
  Set-Content -Path $ConfPath -Value $conf -Encoding ASCII
}

# Launch DOSBox on a build dir. Returns the Process (poll .MainWindowHandle for the hwnd).
function Start-Dosbox {
  param(
    [string]$MountDir,
    [string]$Exe = "dqk",
    [string]$ExeArgs = "SB220 SI7 RB330",
    [string]$Cycles,
    [switch]$Console,
    [switch]$NormalWindow
  )
  Assert-DosboxDesktopFocusOptIn -Operation "DOSBox launch"
  $botConf = Join-Path $MountDir "_bot.conf"
  $cycleOverride = Resolve-DosboxBotCycles -Cycles $Cycles
  Write-BotConf -MountDir $MountDir -ConfPath $botConf -Exe $Exe -ExeArgs $ExeArgs -Cycles $cycleOverride
  return Start-DosboxConf -Conf $botConf -Cycles $Cycles -Console:$Console -NormalWindow:$NormalWindow
}

# Wait until DOSBox's SDL *render* window exists (NOT the Status console), return its hwnd.
function Wait-DosboxWindow {
  param([System.Diagnostics.Process]$Proc, [int]$TimeoutSec = 20)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $Proc.Refresh()
    if ($Proc.HasExited) { return [IntPtr]::Zero }
    $h = [DosBotWin32]::FindRenderWindow([uint32]$Proc.Id)
    if ($h -ne [IntPtr]::Zero) { return $h }
    Start-Sleep -Milliseconds 250
  }
  return [DosBotWin32]::FindRenderWindow([uint32]$Proc.Id)
}

function Wait-DosboxOwnedWindow {
  param(
    [System.Diagnostics.Process]$Proc,
    [string]$RequiredTitle,
    [string]$ExcludedTitle = "",
    [int]$TimeoutSec = 20
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $Proc.Refresh()
    if ($Proc.HasExited) { return [IntPtr]::Zero }
    $h = [DosBotWin32]::FindOwnedWindow([uint32]$Proc.Id, $RequiredTitle, $ExcludedTitle)
    if ($h -ne [IntPtr]::Zero) { return $h }
    Start-Sleep -Milliseconds 250
  }
  return [DosBotWin32]::FindOwnedWindow([uint32]$Proc.Id, $RequiredTitle, $ExcludedTitle)
}

function Test-BitmapHasSignal {
  param([System.Drawing.Bitmap]$Bitmap)
  $colors = New-Object 'System.Collections.Generic.HashSet[int]'
  $stepX = [Math]::Max(1, [int]($Bitmap.Width / 16))
  $stepY = [Math]::Max(1, [int]($Bitmap.Height / 12))
  for ($y = 0; $y -lt $Bitmap.Height; $y += $stepY) {
    for ($x = 0; $x -lt $Bitmap.Width; $x += $stepX) {
      $colors.Add($Bitmap.GetPixel($x, $y).ToArgb()) | Out-Null
      if ($colors.Count -gt 1) { return $true }
    }
  }
  return $false
}

function Save-DosboxPrintWindow {
  param([IntPtr]$Hwnd, [string]$OutPng)
  if ($Hwnd -eq [IntPtr]::Zero) { return $false }
  $wasIconic = [DosBotWin32]::IsIconic($Hwnd)
  if ($wasIconic) {
    [DosBotWin32]::ShowWindow($Hwnd, 4) | Out-Null # SW_SHOWNOACTIVATE
    Start-Sleep -Milliseconds 150
  }
  $r = New-Object DosBotWin32+RECT
  [DosBotWin32]::GetWindowRect($Hwnd, [ref]$r) | Out-Null
  $w = $r.Right - $r.Left; $h = $r.Bottom - $r.Top
  if ($w -le 0 -or $h -le 0) { return $false }
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $hdc = $g.GetHdc()
  try {
    $ok = [DosBotWin32]::PrintWindow($Hwnd, $hdc, 2) # PW_RENDERFULLCONTENT
  } finally {
    $g.ReleaseHdc($hdc)
    $g.Dispose()
  }
  if (-not $ok -or -not (Test-BitmapHasSignal -Bitmap $bmp)) {
    $bmp.Dispose()
    if ($wasIconic) { [DosBotWin32]::ShowWindow($Hwnd, 7) | Out-Null } # SW_SHOWMINNOACTIVE
    return $false
  }
  $bmp.Save($OutPng, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  if ($wasIconic) { [DosBotWin32]::ShowWindow($Hwnd, 7) | Out-Null } # SW_SHOWMINNOACTIVE
  return $true
}

function Capture-DosboxPrintWindow {
  param([IntPtr]$Hwnd, [string]$OutPng)
  if (-not (Save-DosboxPrintWindow -Hwnd $Hwnd -OutPng $OutPng)) {
    throw "no-focus PrintWindow capture failed for DOSBox render window"
  }
  return $OutPng
}

# RELIABLE capture: trigger DOSBox's own screenshot (Ctrl+F5) and collect the PNG it
# writes to the _capture dir. Unlike Capture-DosboxWindow this reads the emulated
# framebuffer directly, so it is immune to window occlusion / a white overlay surface
# stealing CopyFromScreen (the false "white screen" bug, 2026-06-25). PREFER THIS.
function Capture-DosboxNative {
  param([IntPtr]$Hwnd, [string]$MountDir, [string]$OutPng, [int]$WaitMs = 800)
  if ($Hwnd -eq [IntPtr]::Zero) { throw "no window handle" }
  Assert-DosboxDesktopFocusOptIn -Operation "DOSBox native screenshot hotkey"
  $capDir = Join-Path $MountDir "_capture"
  New-Item -ItemType Directory -Force $capDir | Out-Null
  $before = @(Get-ChildItem -Path $capDir -Filter *.png -ErrorAction SilentlyContinue | ForEach-Object FullName)
  [DosBotWin32]::ForceFocus($Hwnd) | Out-Null
  Start-Sleep -Milliseconds 250
  # Ctrl(0x1D)+F5(0x3F), non-extended — DOSBox "save screenshot" hotkey.
  [DosBotWin32]::SendChord([uint16]0x1D, [uint16]0x3F, $false)
  Start-Sleep -Milliseconds $WaitMs
  $shot = Get-ChildItem -Path $capDir -Filter *.png -ErrorAction SilentlyContinue |
    Where-Object { $before -notcontains $_.FullName } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $shot) { throw "no native screenshot appeared in $capDir (Ctrl+F5 may not have registered)" }
  Copy-Item $shot.FullName $OutPng -Force
  return $OutPng
}

# Capture the DOSBox window region to a PNG. Prefer no-focus PrintWindow capture;
# fall back to foreground CopyFromScreen only when the SDL/GDI path cannot render
# off-screen. Use -NoFocusOnly to make focus-taking a hard failure.
# WARNING: fallback CopyFromScreen can yield an all-white client area when an
# occluding/overlay surface is present. Prefer Capture-DosboxNative for proof frames.
function Capture-DosboxWindow {
  param([IntPtr]$Hwnd, [string]$OutPng, [switch]$NoFocusOnly)
  if ($Hwnd -eq [IntPtr]::Zero) { throw "no window handle" }
  if (Save-DosboxPrintWindow -Hwnd $Hwnd -OutPng $OutPng) { return $OutPng }
  if ($NoFocusOnly) { throw "no-focus capture failed and foreground fallback is disabled" }
  Assert-DosboxDesktopFocusOptIn -Operation "DOSBox foreground screenshot fallback"
  if ([DosBotWin32]::IsIconic($Hwnd)) { [DosBotWin32]::ShowWindow($Hwnd, 9) | Out-Null } # SW_RESTORE
  [DosBotWin32]::SetForegroundWindow($Hwnd) | Out-Null
  Start-Sleep -Milliseconds 250
  $r = New-Object DosBotWin32+RECT
  [DosBotWin32]::GetWindowRect($Hwnd, [ref]$r) | Out-Null
  $w = $r.Right - $r.Left; $h = $r.Bottom - $r.Top
  if ($w -le 0 -or $h -le 0) { throw "bad window rect ${w}x${h}" }
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($r.Left, $r.Top, 0, 0, (New-Object System.Drawing.Size $w, $h))
  $g.Dispose()
  $bmp.Save($OutPng, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  return $OutPng
}

# Send hardware scancodes to the DOSBox window (SDL/DirectInput reads scancodes, not WM_KEYDOWN).
# Keys: brace tokens like "{ESC}{ENTER}{RIGHT}", or a bare token like "ESC". Unknown tokens are skipped.
function Send-DosKeys {
  param([IntPtr]$Hwnd, [string]$Keys)
  Assert-DosboxDesktopFocusOptIn -Operation "DOSBox keyboard input"
  [DosBotWin32]::ForceFocus($Hwnd) | Out-Null
  Start-Sleep -Milliseconds 250
  $tokens = [regex]::Matches($Keys, '\{([^}]+)\}') | ForEach-Object { $_.Groups[1].Value }
  if (-not $tokens) { $tokens = @($Keys.Trim()) }
  foreach ($tk in $tokens) {
    $name = $tk.ToUpper()
    if ($script:DOS_SCAN.ContainsKey($name)) {
      $sc, $ext = $script:DOS_SCAN[$name]
      [DosBotWin32]::SendScan([uint16]$sc, [bool]$ext)
      Start-Sleep -Milliseconds 120
    } else {
      Write-Host "[dosbot] WARN: unknown key token '$tk'"
    }
  }
}

# Type an arbitrary text string into DOSBox as hardware scancodes, char by char (letters/digits/
# space). Used to answer the copy-protection journal-word prompt. Unsupported chars are skipped.
function Send-DosText {
  param([IntPtr]$Hwnd, [string]$Text)
  Assert-DosboxDesktopFocusOptIn -Operation "DOSBox text input"
  [DosBotWin32]::ForceFocus($Hwnd) | Out-Null
  Start-Sleep -Milliseconds 200
  foreach ($ch in $Text.ToUpper().ToCharArray()) {
    $name = if ($ch -eq ' ') { "SPACE" } else { [string]$ch }
    if ($script:DOS_SCAN.ContainsKey($name)) {
      $sc, $ext = $script:DOS_SCAN[$name]
      [DosBotWin32]::SendScan([uint16]$sc, [bool]$ext)
      Start-Sleep -Milliseconds 90
    }
  }
}

# Send a modifier chord like Alt+F1 / Alt+F2 (cc's change-drive keys). Mod is ALT only for now.
function Send-DosChord {
  param([IntPtr]$Hwnd, [string]$Mod, [string]$Key)
  Assert-DosboxDesktopFocusOptIn -Operation "DOSBox chord input"
  [DosBotWin32]::ForceFocus($Hwnd) | Out-Null
  Start-Sleep -Milliseconds 200
  $modScan = 0x38  # left Alt
  $k = $script:DOS_SCAN[$Key.ToUpper()]
  if (-not $k) { Write-Host "[dosbot] WARN: unknown chord key '$Key'"; return }
  [DosBotWin32]::SendChord([uint16]$modScan, [uint16]$k[0], [bool]$k[1])
  Start-Sleep -Milliseconds 150
}

# Click at a window-relative pixel (relX,relY measured from the captured PNG's top-left,
# which equals the window rect top-left). Mouse input reliably reaches DOSBox's SDL layer.
function Click-DosWindow {
  param([IntPtr]$Hwnd, [int]$RelX, [int]$RelY)
  Assert-DosboxDesktopFocusOptIn -Operation "DOSBox mouse input"
  [DosBotWin32]::ForceFocus($Hwnd) | Out-Null
  Start-Sleep -Milliseconds 200
  $r = New-Object DosBotWin32+RECT
  [DosBotWin32]::GetWindowRect($Hwnd, [ref]$r) | Out-Null
  [DosBotWin32]::SetCursorPos($r.Left + $RelX, $r.Top + $RelY)
  Start-Sleep -Milliseconds 150
  [DosBotWin32]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero) # LEFTDOWN
  Start-Sleep -Milliseconds 60
  [DosBotWin32]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero) # LEFTUP
}

# Select a native DOSBox-X menu item without taking focus between the menu and item clicks.
function Click-DosboxMenuItem {
  param(
    [IntPtr]$Hwnd,
    [int]$MenuX,
    [int]$MenuY,
    [int]$ItemX,
    [int]$ItemY
  )
  Assert-DosboxDesktopFocusOptIn -Operation "DOSBox menu mouse input"
  [DosBotWin32]::ForceFocus($Hwnd) | Out-Null
  Start-Sleep -Milliseconds 200
  $r = New-Object DosBotWin32+RECT
  [DosBotWin32]::GetWindowRect($Hwnd, [ref]$r) | Out-Null
  foreach ($point in @(@($MenuX, $MenuY), @($ItemX, $ItemY))) {
    [DosBotWin32]::SetCursorPos($r.Left + $point[0], $r.Top + $point[1]) | Out-Null
    Start-Sleep -Milliseconds 150
    [DosBotWin32]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 60
    [DosBotWin32]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 350
  }
}

function Send-DosboxHostAltPause {
  param([IntPtr]$Hwnd)
  Assert-DosboxDesktopFocusOptIn -Operation "DOSBox host hotkey input"
  [DosBotWin32]::ForceFocus($Hwnd) | Out-Null
  Start-Sleep -Milliseconds 200
  [DosBotWin32]::SendVirtualChord([uint16]0x12, [uint16]0x13)
  Start-Sleep -Milliseconds 350
}

function Stop-Dosbox {
  param([System.Diagnostics.Process]$Proc)
  if ($Proc -and -not $Proc.HasExited) { $Proc.Kill(); $Proc.WaitForExit(3000) }
}

# Ask a local Ollama vision model to inspect a screenshot. Returns a parsed object
# {screen,game_title,visible_text,crash,raw}. qwen3.5 includes vision capability without a VL suffix.
function Get-FirstJsonObject {
  # Scans $Text for the first syntactically-complete top-level {...} object using a
  # string-aware, brace-depth walk (not a greedy regex) and returns it parsed via
  # ConvertFrom-Json, or $null if none is found/valid.
  #
  # Why not `[regex]::Match($txt, '(?s)\{.*\}')`: that pattern is greedy from the FIRST
  # '{' to the LAST '}' in the whole response. If the model ever emits more than one
  # JSON object back-to-back (a known degenerate-repetition failure mode seen live on
  # vision-model retry calls against a near-identical/static image -- see
  # docs/engine/research/cok-m4-fidelity-plan.md §22.2), the greedy match spans BOTH
  # objects, the combined text isn't valid JSON (two root values), ConvertFrom-Json
  # throws, and the old fallback then leaked the ENTIRE raw multi-object blob as
  # `visible_text` -- a JSON-shaped string masquerading as plain OCR text, which breaks
  # any caller regex (e.g. `(?i)JOURNAL.*?ENTER`) expecting real screen text. A
  # depth-counting scan that stops at the first object's own matching '}' is immune to
  # this: it returns just the first object and ignores anything the model appended after
  # it, on both the normal (single-object) and degenerate (repeated-object) paths.
  param([string]$Text)
  $start = $Text.IndexOf('{')
  if ($start -lt 0) { return $null }
  $depth = 0
  $inString = $false
  $escape = $false
  for ($i = $start; $i -lt $Text.Length; $i++) {
    $c = $Text[$i]
    if ($escape) { $escape = $false; continue }
    if ($c -eq '\') { if ($inString) { $escape = $true }; continue }
    if ($c -eq '"') { $inString = -not $inString; continue }
    if ($inString) { continue }
    if ($c -eq '{') { $depth++ }
    elseif ($c -eq '}') {
      $depth--
      if ($depth -eq 0) {
        $candidate = $Text.Substring($start, $i - $start + 1)
        try { return ($candidate | ConvertFrom-Json) } catch { return $null }
      }
    }
  }
  return $null
}

function Invoke-Vision {
  param([string]$Png, [string]$Model = "qwen3.5:4b")
  $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($Png))
  $prompt = @"
You are inspecting a screenshot of a DOS game running in DOSBox. Reply with ONLY a JSON object, no prose:
{"screen":"title|main_menu|game_world|combat|dos_prompt|error|black|loading|unknown","game_title":"<exact on-screen game title or null>","visible_text":"<all readable on-screen text, joined by ; >","looks_crashed":true|false,"note":"<one short phrase>"}
"@
  $body = @{ model=$Model; prompt=$prompt; images=@($b64); stream=$false; think=$false; options=@{temperature=0; num_predict=800} } | ConvertTo-Json -Depth 6
  $resp = Invoke-RestMethod -Uri "http://localhost:11434/api/generate" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 180
  $txt = $resp.response
  $obj = Get-FirstJsonObject -Text $txt
  if (-not $obj) {
    # The model didn't produce one clean, parseable JSON object (malformed JSON, or
    # multiple concatenated objects that individually fail too). Don't hand the caller
    # the raw JSON-shaped blob as "visible_text" -- that silently masquerades as plain
    # OCR text and breaks callers' own text regexes (see comment on Get-FirstJsonObject).
    # Try to salvage just the `visible_text` field's own string value directly out of the
    # raw response via regex before falling all the way back to dumping the whole blob.
    $vtMatch = [regex]::Match($txt, '"visible_text"\s*:\s*"((?:[^"\\]|\\.)*)"')
    if ($vtMatch.Success) {
      $plain = $vtMatch.Groups[1].Value -replace '\\r\\n', ' ' -replace '\\n', ' ' -replace '\\"', '"' -replace '\\\\', '\'
      $obj = [pscustomobject]@{ screen="unknown"; game_title=$null; visible_text=$plain; looks_crashed=$false; note="salvaged-from-malformed-json" }
    } else {
      $obj = [pscustomobject]@{ screen="unknown"; game_title=$null; visible_text=$txt; looks_crashed=$false; note="unparsed" }
    }
  }
  $obj | Add-Member -NotePropertyName raw -NotePropertyValue $txt -Force
  return $obj
}
