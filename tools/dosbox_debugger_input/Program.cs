using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;

internal static class Program
{
    private const uint GenericRead = 0x80000000;
    private const uint GenericWrite = 0x40000000;
    private const uint FileShareRead = 0x00000001;
    private const uint FileShareWrite = 0x00000002;
    private const uint OpenExisting = 3;
    private const ushort KeyEvent = 0x0001;
    private const ushort VirtualKeyReturn = 0x0D;
    private const ushort ScanCodeReturn = 0x1C;

    private static int Main(string[] args)
    {
        string? statusPath = null;
        try
        {
            var options = ParseArgs(args);
            statusPath = options.StatusPath;
            ValidateTarget(options.ProcessId);
            var records = options.SnapshotOnly
                ? []
                : options.Command is not null
                    ? BuildRecords(options.Command + "\r")
                    : BuildSpecialKey(options.Key!);

            if (!Native.FreeConsole())
            {
                var error = Marshal.GetLastWin32Error();
                if (error != 6) // ERROR_INVALID_HANDLE: no inherited console is harmless.
                {
                    throw new Win32Exception(error, "FreeConsole failed");
                }
            }

            if (!Native.AttachConsole((uint)options.ProcessId))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "AttachConsole failed");
            }

            string? snapshot = null;
            try
            {
                using var input = Native.CreateFile(
                    "CONIN$",
                    GenericRead | GenericWrite,
                    FileShareRead | FileShareWrite,
                    IntPtr.Zero,
                    OpenExisting,
                    0,
                    IntPtr.Zero);
                if (input.IsInvalid)
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Opening CONIN$ failed");
                }

                uint written = 0;
                if (records.Length > 0 &&
                    !Native.WriteConsoleInput(input, records, (uint)records.Length, out written))
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "WriteConsoleInput failed");
                }

                if (records.Length > 0 && written != records.Length)
                {
                    throw new InvalidOperationException(
                        $"WriteConsoleInput wrote {written} of {records.Length} records");
                }

                if (records.Length > 0)
                {
                    Thread.Sleep(options.SnapshotPath is null ? 500 : 150);
                }

                if (options.SnapshotPath is not null)
                {
                    Thread.Sleep(records.Length > 0 ? 350 : 50);
                    snapshot = ReadConsoleSnapshot();
                }
            }
            finally
            {
                Native.FreeConsole();
            }

            if (options.SnapshotPath is not null)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(options.SnapshotPath)!);
                File.WriteAllText(options.SnapshotPath, snapshot);
            }
            WriteStatus(statusPath, new Status(
                true,
                options.ProcessId,
                options.Command,
                options.Key,
                records.Length,
                options.SnapshotPath,
                null));
            return 0;
        }
        catch (Exception ex)
        {
            WriteStatus(statusPath, new Status(false, null, null, null, 0, null, ex.Message));
            return 1;
        }
    }

    private static Options ParseArgs(string[] args)
    {
        int? processId = null;
        string? command = null;
        string? key = null;
        string? statusPath = null;
        string? snapshotPath = null;
        var snapshotOnly = false;
        for (var i = 0; i < args.Length; i++)
        {
            if (args[i] == "--snapshot-only")
            {
                snapshotOnly = true;
                continue;
            }
            if (i + 1 >= args.Length)
            {
                throw new ArgumentException($"Missing value for {args[i]}");
            }

            var value = args[++i];
            switch (args[i - 1])
            {
                case "--pid":
                    processId = int.Parse(value);
                    break;
                case "--command":
                    command = value;
                    break;
                case "--key":
                    key = value.ToUpperInvariant();
                    break;
                case "--status":
                    statusPath = Path.GetFullPath(value);
                    break;
                case "--snapshot":
                    snapshotPath = Path.GetFullPath(value);
                    break;
                default:
                    throw new ArgumentException($"Unknown argument: {args[i - 1]}");
            }
        }

        var actionCount = (command is not null ? 1 : 0) + (key is not null ? 1 : 0) + (snapshotOnly ? 1 : 0);
        if (processId is null or <= 0 || statusPath is null || actionCount != 1 ||
            (snapshotOnly && snapshotPath is null))
        {
            throw new ArgumentException(
                "Required: --pid N (--command TEXT | --key ENTER|F5|F10|F11 | " +
                "--snapshot-only --snapshot PATH) --status PATH");
        }

        if (command is not null && (string.IsNullOrWhiteSpace(command) || command.Length > 256 ||
            command.Any(c => c is '\r' or '\n' or '\0' || c > 0x7F)))
        {
            throw new ArgumentException("Command must be 1-256 printable ASCII characters without newlines");
        }

        if (key is not null && key is not ("ENTER" or "F5" or "F10" or "F11"))
        {
            throw new ArgumentException("Key must be ENTER, F5, F10, or F11");
        }

        return new Options(processId.Value, command, key, snapshotOnly, statusPath, snapshotPath);
    }

    private static void ValidateTarget(int processId)
    {
        using var process = Process.GetProcessById(processId);
        if (process.HasExited || !process.ProcessName.Equals("dosbox-x", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                $"PID {processId} is not a running dosbox-x process (found {process.ProcessName})");
        }
    }

    private static InputRecord[] BuildRecords(string text)
    {
        var records = new InputRecord[text.Length * 2];
        for (var i = 0; i < text.Length; i++)
        {
            var character = text[i];
            var virtualKey = character == '\r' ? VirtualKeyReturn : (ushort)char.ToUpperInvariant(character);
            var scanCode = character == '\r' ? ScanCodeReturn : (ushort)0;
            records[i * 2] = InputRecord.ForKey(character, virtualKey, scanCode, true);
            records[i * 2 + 1] = InputRecord.ForKey(character, virtualKey, scanCode, false);
        }

        return records;
    }

    private static InputRecord[] BuildSpecialKey(string key)
    {
        var (character, virtualKey, scanCode) = key switch
        {
            "ENTER" => ('\r', (ushort)0x0D, (ushort)0x1C),
            "F5" => ('\0', (ushort)0x74, (ushort)0x3F),
            "F10" => ('\0', (ushort)0x79, (ushort)0x44),
            "F11" => ('\0', (ushort)0x7A, (ushort)0x57),
            _ => throw new ArgumentException($"Unsupported key: {key}"),
        };
        return
        [
            InputRecord.ForKey(character, virtualKey, scanCode, true),
            InputRecord.ForKey(character, virtualKey, scanCode, false),
        ];
    }

    private static void WriteStatus(string? path, Status status)
    {
        if (path is null)
        {
            return;
        }

        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, JsonSerializer.Serialize(status, new JsonSerializerOptions { WriteIndented = true }));
    }

    private static string ReadConsoleSnapshot()
    {
        using var output = Native.CreateFile(
            "CONOUT$",
            GenericRead | GenericWrite,
            FileShareRead | FileShareWrite,
            IntPtr.Zero,
            OpenExisting,
            0,
            IntPtr.Zero);
        if (output.IsInvalid)
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Opening CONOUT$ failed");
        }

        if (!Native.GetConsoleScreenBufferInfo(output, out var info))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "GetConsoleScreenBufferInfo failed");
        }

        var lines = new List<string>();
        var width = info.Window.Right - info.Window.Left + 1;
        for (short y = info.Window.Top; y <= info.Window.Bottom; y++)
        {
            var buffer = new char[width];
            if (!Native.ReadConsoleOutputCharacter(
                output,
                buffer,
                (uint)width,
                new Coord((short)info.Window.Left, y),
                out _))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "ReadConsoleOutputCharacter failed");
            }
            for (var i = 0; i < buffer.Length; i++)
            {
                if (char.IsSurrogate(buffer[i]))
                {
                    buffer[i] = '\uFFFD';
                }
            }
            lines.Add(new string(buffer).TrimEnd());
        }

        return string.Join(Environment.NewLine, lines).TrimEnd() + Environment.NewLine;
    }

    private sealed record Options(
        int ProcessId,
        string? Command,
        string? Key,
        bool SnapshotOnly,
        string StatusPath,
        string? SnapshotPath);
    private sealed record Status(
        bool Success,
        int? ProcessId,
        string? Command,
        string? Key,
        int RecordCount,
        string? SnapshotPath,
        string? Error);

    [StructLayout(LayoutKind.Sequential)]
    private struct Coord
    {
        public short X;
        public short Y;

        public Coord(short x, short y)
        {
            X = x;
            Y = y;
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SmallRect
    {
        public short Left;
        public short Top;
        public short Right;
        public short Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ConsoleScreenBufferInfo
    {
        public Coord Size;
        public Coord CursorPosition;
        public ushort Attributes;
        public SmallRect Window;
        public Coord MaximumWindowSize;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct KeyEventRecord
    {
        [MarshalAs(UnmanagedType.Bool)] public bool KeyDown;
        public ushort RepeatCount;
        public ushort VirtualKeyCode;
        public ushort VirtualScanCode;
        public char UnicodeChar;
        public uint ControlKeyState;
    }

    [StructLayout(LayoutKind.Explicit, CharSet = CharSet.Unicode)]
    private struct InputRecord
    {
        [FieldOffset(0)] public ushort EventType;
        [FieldOffset(4)] public KeyEventRecord KeyEvent;

        public static InputRecord ForKey(char character, ushort virtualKey, ushort scanCode, bool down) => new()
        {
            EventType = Program.KeyEvent,
            KeyEvent = new KeyEventRecord
            {
                KeyDown = down,
                RepeatCount = 1,
                VirtualKeyCode = virtualKey,
                VirtualScanCode = scanCode,
                UnicodeChar = character,
                ControlKeyState = 0,
            },
        };
    }

    private static class Native
    {
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool FreeConsole();

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool AttachConsole(uint processId);

        [DllImport("kernel32.dll", EntryPoint = "CreateFileW", CharSet = CharSet.Unicode, SetLastError = true)]
        internal static extern Microsoft.Win32.SafeHandles.SafeFileHandle CreateFile(
            string fileName,
            uint desiredAccess,
            uint shareMode,
            IntPtr securityAttributes,
            uint creationDisposition,
            uint flagsAndAttributes,
            IntPtr templateFile);

        [DllImport("kernel32.dll", EntryPoint = "WriteConsoleInputW", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool WriteConsoleInput(
            Microsoft.Win32.SafeHandles.SafeFileHandle consoleInput,
            [In] InputRecord[] buffer,
            uint length,
            out uint written);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool GetConsoleScreenBufferInfo(
            Microsoft.Win32.SafeHandles.SafeFileHandle consoleOutput,
            out ConsoleScreenBufferInfo info);

        [DllImport("kernel32.dll", EntryPoint = "ReadConsoleOutputCharacterW", CharSet = CharSet.Unicode, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        internal static extern bool ReadConsoleOutputCharacter(
            Microsoft.Win32.SafeHandles.SafeFileHandle consoleOutput,
            [Out] char[] buffer,
            uint length,
            Coord readCoord,
            out uint read);
    }
}
