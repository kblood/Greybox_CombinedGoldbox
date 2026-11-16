<#
Launches Windows Notepad on a private WinSta0 desktop and checks that the
caller's foreground window handle is unchanged. The child PID is terminated
directly and the desktop is closed in a finally block. This is a narrow proof
helper for SDL dummy-driver launch safety; it does not launch DOSBox or send
input to either desktop.
#>
[CmdletBinding()]
param([ValidateRange(500,15000)][int]$ObserveMs = 2500)

$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class IsolatedDesktopProbe {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  struct STARTUPINFO {
    public int cb; public string lpReserved; public string lpDesktop; public string lpTitle;
    public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
    public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
  }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION {
    public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId;
  }
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern IntPtr CreateDesktop(string name, IntPtr device, IntPtr devmode, int flags, uint access, IntPtr attributes);
  [DllImport("user32.dll", SetLastError=true)] static extern bool CloseDesktop(IntPtr desktop);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr data);
  [DllImport("user32.dll", SetLastError=true)] static extern bool EnumDesktopWindows(IntPtr desktop, EnumWindowsProc callback, IntPtr data);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool CreateProcess(string app, StringBuilder cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags,
    IntPtr env, string cwd, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr h, uint code);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr h, out uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  static void Check(bool ok, string what) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error(), what); }
  public static object Run(int observeMs) {
    string desk = "CodexProbe_" + Guid.NewGuid().ToString("N");
    IntPtr desktop = IntPtr.Zero; PROCESS_INFORMATION pi = new PROCESS_INFORMATION();
    IntPtr before = GetForegroundWindow(); bool launched = false, terminated = false;
    try {
      desktop = CreateDesktop(desk, IntPtr.Zero, IntPtr.Zero, 0, 0x01FF, IntPtr.Zero);
      Check(desktop != IntPtr.Zero, "CreateDesktop");
      string exe = Environment.GetFolderPath(Environment.SpecialFolder.System) + "\\notepad.exe";
      STARTUPINFO si = new STARTUPINFO(); si.cb = Marshal.SizeOf(typeof(STARTUPINFO)); si.lpDesktop = "WinSta0\\" + desk;
      Check(CreateProcess(exe, new StringBuilder("\"" + exe + "\""), IntPtr.Zero, IntPtr.Zero, false, 0,
        IntPtr.Zero, null, ref si, out pi), "CreateProcess(Notepad on private desktop)");
      launched = true;
      Thread.Sleep(observeMs);
      bool windowFound = false;
      EnumWindowsProc callback = delegate(IntPtr hwnd, IntPtr data) {
        uint owner; GetWindowThreadProcessId(hwnd, out owner);
        if (owner == (uint)pi.dwProcessId) windowFound = true;
        return true;
      };
      Check(EnumDesktopWindows(desktop, callback, IntPtr.Zero), "EnumDesktopWindows");
      IntPtr after = GetForegroundWindow();
      uint live; Check(GetExitCodeProcess(pi.hProcess, out live), "GetExitCodeProcess");
      if (live != 259) throw new InvalidOperationException("Notepad exited before observation completed.");
      Check(TerminateProcess(pi.hProcess, 0), "TerminateProcess(exact launched PID)");
      terminated = WaitForSingleObject(pi.hProcess, 5000) == 0;
      uint finalCode; Check(GetExitCodeProcess(pi.hProcess, out finalCode), "GetExitCodeProcess(after cleanup)");
      return new { desktop = "WinSta0\\" + desk, pid = pi.dwProcessId,
        windowFoundOnIsolatedDesktop = windowFound,
        foregroundBefore = "0x" + before.ToInt64().ToString("X"),
        foregroundAfter = "0x" + after.ToInt64().ToString("X"),
        foregroundUnchanged = before == after, processTerminated = terminated, exitCode = finalCode };
    } finally {
      if (launched && !terminated) { TerminateProcess(pi.hProcess, 0); WaitForSingleObject(pi.hProcess, 5000); }
      if (pi.hThread != IntPtr.Zero) CloseHandle(pi.hThread);
      if (pi.hProcess != IntPtr.Zero) CloseHandle(pi.hProcess);
      if (desktop != IntPtr.Zero) CloseDesktop(desktop);
    }
  }
}
'@

$proof = [IsolatedDesktopProbe]::Run($ObserveMs)
$proof | ConvertTo-Json -Compress
if (-not $proof.foregroundUnchanged -or -not $proof.windowFoundOnIsolatedDesktop -or -not $proof.processTerminated) {
  throw 'Isolated desktop proof failed: foreground changed or owned process survived cleanup.'
}
