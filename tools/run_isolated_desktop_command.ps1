<#
Runs one bounded command on a uniquely named alternate WinSta0 desktop. The
child is created suspended, assigned to a kill-on-close Windows Job Object,
then resumed; this closes the spawn-before-assignment cleanup gap and contains
ordinary descendants (including DOSBox-X started by a probe script). The
caller desktop's foreground HWND is sampled before and after. No desktop is
activated and no input/window activation APIs are used.

Example interface (review only; do not launch DOSBox until explicitly approved):
  .\tools\run_isolated_desktop_command.ps1 -FilePath pwsh.exe -ArgumentList @(
    '-NoProfile','-File','tools/dosbox_x_debugbox_probe.ps1',
    '-DbxExe','<candidate.exe>','-GameDir','<TEMP game copy>',
    '-RunDirect','-GameLink','-NoInitialScreenshots','-StopAfterCapture') `
    -TimeoutSeconds 90 -Environment @{ DOSBOX_X_INT21_TRACE_PATH='<trace path>' }
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$FilePath,
  [string[]]$ArgumentList = @(),
  [ValidateRange(1,3600)][int]$TimeoutSeconds = 120,
  [hashtable]$Environment = @{}
)
$ErrorActionPreference = 'Stop'
$resolved = (Resolve-Path -LiteralPath $FilePath -ErrorAction Stop).Path

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class IsolatedDesktopCommandRunner {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  struct STARTUPINFO {
    public int cb; public string lpReserved; public string lpDesktop; public string lpTitle;
    public int dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
    public short wShowWindow, cbReserved2; public IntPtr lpReserved2, hStdInput, hStdOutput, hStdError;
  }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION {
    public IntPtr hProcess, hThread; public int dwProcessId, dwThreadId;
  }
  [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS {
    public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
    public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
  }
  [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMITS {
    public long PerProcessUserTimeLimit, PerJobUserTimeLimit; public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize; public uint ActiveProcessLimit;
    public UIntPtr Affinity; public uint PriorityClass, SchedulingClass;
  }
  [StructLayout(LayoutKind.Sequential)] struct EXTENDED_LIMITS {
    public BASIC_LIMITS BasicLimitInformation; public IO_COUNTERS IoInfo;
    public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
  }
  [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern IntPtr CreateDesktop(string name, IntPtr device, IntPtr devmode, int flags, uint access, IntPtr attributes);
  [DllImport("user32.dll", SetLastError=true)] static extern bool CloseDesktop(IntPtr desktop);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool CreateProcess(string app, StringBuilder cmd, IntPtr pa, IntPtr ta, bool inherit, uint flags,
    IntPtr env, string cwd, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  static extern IntPtr CreateJobObject(IntPtr attrs, string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint length);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateJobObject(IntPtr job, uint code);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool TerminateProcess(IntPtr process, uint code);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr h, out uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  const uint CREATE_SUSPENDED = 0x00000004, CREATE_UNICODE_ENVIRONMENT = 0x00000400;
  const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000;
  static void Check(bool ok, string what) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error(), what); }
  static string Quote(string s) {
    if (s.Length > 0 && s.IndexOfAny(new char[] {' ', '\t', '\n', '\v', '"'}) < 0) return s;
    StringBuilder b = new StringBuilder("\""); int slashes = 0;
    foreach (char c in s) {
      if (c == '\\') { slashes++; continue; }
      if (c == '"') { b.Append('\\', slashes * 2 + 1); b.Append('"'); slashes = 0; continue; }
      b.Append('\\', slashes); slashes = 0; b.Append(c);
    }
    b.Append('\\', slashes * 2); b.Append('"'); return b.ToString();
  }
  public static object Run(string exe, string[] args, int timeoutSeconds, string[] envPairs) {
    string desktopName = "CodexRun_" + Guid.NewGuid().ToString("N");
    IntPtr desktop=IntPtr.Zero, job=IntPtr.Zero, limits=IntPtr.Zero;
    PROCESS_INFORMATION pi = new PROCESS_INFORMATION(); bool assigned=false, timedOut=false;
    IntPtr foregroundBefore = GetForegroundWindow(); Stopwatch watch = Stopwatch.StartNew();
    try {
      desktop = CreateDesktop(desktopName, IntPtr.Zero, IntPtr.Zero, 0, 0x01FF, IntPtr.Zero);
      Check(desktop != IntPtr.Zero, "CreateDesktop");
      job = CreateJobObject(IntPtr.Zero, null); Check(job != IntPtr.Zero, "CreateJobObject");
      EXTENDED_LIMITS config = new EXTENDED_LIMITS(); config.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
      limits = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(EXTENDED_LIMITS)));
      Marshal.StructureToPtr(config, limits, false);
      Check(SetInformationJobObject(job, 9, limits, (uint)Marshal.SizeOf(typeof(EXTENDED_LIMITS))), "SetInformationJobObject");
      StringBuilder command = new StringBuilder(Quote(exe)); foreach (string a in args) command.Append(' ').Append(Quote(a));
      STARTUPINFO si = new STARTUPINFO(); si.cb=Marshal.SizeOf(typeof(STARTUPINFO)); si.lpDesktop="WinSta0\\"+desktopName;
      IntPtr env=IntPtr.Zero;
      if (envPairs.Length > 0) {
        StringBuilder block = new StringBuilder();
        foreach(string pair in envPairs) block.Append(pair).Append('\0'); block.Append('\0');
        env = Marshal.StringToHGlobalUni(block.ToString());
      }
      try {
        Check(CreateProcess(exe, command, IntPtr.Zero, IntPtr.Zero, false,
          CREATE_SUSPENDED | (env != IntPtr.Zero ? CREATE_UNICODE_ENVIRONMENT : 0), env, null, ref si, out pi), "CreateProcess(child on private desktop)");
      } finally { if(env != IntPtr.Zero) Marshal.FreeHGlobal(env); }
      Check(AssignProcessToJobObject(job, pi.hProcess), "AssignProcessToJobObject"); assigned=true;
      uint resume=ResumeThread(pi.hThread); Check(resume != 0xFFFFFFFF, "ResumeThread");
      uint wait=WaitForSingleObject(pi.hProcess, (uint)timeoutSeconds * 1000);
      if (wait == 0xFFFFFFFF) throw new Win32Exception(Marshal.GetLastWin32Error(), "WaitForSingleObject");
      timedOut = wait == 0x00000102;
      uint exitCode; Check(GetExitCodeProcess(pi.hProcess, out exitCode), "GetExitCodeProcess");
      // The job's kill-on-close flag also removes descendants if the probe returns early.
      Check(TerminateJobObject(job, timedOut ? 1460u : exitCode), "TerminateJobObject(owned job tree)");
      WaitForSingleObject(pi.hProcess, 5000);
      watch.Stop(); IntPtr foregroundAfter=GetForegroundWindow();
      return new { desktop="WinSta0\\"+desktopName, pid=pi.dwProcessId, timedOut=timedOut,
        exitCode=exitCode, foregroundBefore="0x"+foregroundBefore.ToInt64().ToString("X"),
        foregroundAfter="0x"+foregroundAfter.ToInt64().ToString("X"),
        foregroundUnchanged=foregroundBefore==foregroundAfter, elapsedMs=watch.ElapsedMilliseconds,
        cleanup="terminated owned Job Object process tree; closed exact primary process/thread handles" };
    } finally {
      if (pi.hProcess != IntPtr.Zero) {
        if (assigned && job != IntPtr.Zero) {
          TerminateJobObject(job, 1);
        } else {
          // CreateProcess may have succeeded while job assignment failed. It is
          // still suspended, so terminate that exact process handle and verify
          // it is signaled before releasing the handle.
          if (WaitForSingleObject(pi.hProcess, 0) == 0x00000102)
            Check(TerminateProcess(pi.hProcess, 1), "TerminateProcess(unassigned exact child)");
          uint cleanupWait = WaitForSingleObject(pi.hProcess, 5000);
          Check(cleanupWait == 0, "WaitForSingleObject(unassigned child cleanup)");
          uint cleanupCode; Check(GetExitCodeProcess(pi.hProcess, out cleanupCode), "GetExitCodeProcess(unassigned cleanup)");
          if (cleanupCode == 259) throw new InvalidOperationException("Unassigned child remained active after cleanup.");
        }
      }
      if (pi.hThread != IntPtr.Zero) CloseHandle(pi.hThread);
      if (pi.hProcess != IntPtr.Zero) CloseHandle(pi.hProcess);
      if (job != IntPtr.Zero) CloseHandle(job);
      if (desktop != IntPtr.Zero) CloseDesktop(desktop);
      if (limits != IntPtr.Zero) Marshal.FreeHGlobal(limits);
    }
  }
}
'@

$childEnvironment = [System.Collections.Generic.Dictionary[string,string]]::new([StringComparer]::OrdinalIgnoreCase)
Get-ChildItem Env: | ForEach-Object { $childEnvironment[$_.Name] = $_.Value }
foreach ($entry in $Environment.GetEnumerator()) { $childEnvironment[[string]$entry.Key] = [string]$entry.Value }
$envPairs = @($childEnvironment.GetEnumerator() | Sort-Object Key | ForEach-Object { '{0}={1}' -f $_.Key, $_.Value })
$childArgs = @(); if ($ArgumentList.Count -gt 0) { $childArgs = [string[]]$ArgumentList }
$proof = [IsolatedDesktopCommandRunner]::Run($resolved, [string[]]$childArgs, $TimeoutSeconds, [string[]]$envPairs)
$proof | ConvertTo-Json -Compress
if ($proof.timedOut) { throw "Isolated child exceeded $TimeoutSeconds seconds; its owned job tree was terminated." }
if (-not $proof.foregroundUnchanged) { throw 'Caller foreground window changed during isolated command.' }
if ($proof.exitCode -ne 0) { throw "Isolated child exited with code $($proof.exitCode)." }
