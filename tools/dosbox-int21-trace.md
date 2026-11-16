# DOSBox-X INT 21h file trace candidate

`build_dosbox_int21_trace.py` requires the exact DOSBox-X 2026.07.02 source zip and checks its
SHA-256 against the pinned archive digest used by `build_dosbox_gamelink.py`. It copies the zip
into a new work directory under TEMP, validates archive member paths, and extracts the pinned
source tree there. It then checks and applies the existing exact GameLink source patch (including
its pristine/patched hashes), checks the DOS dispatcher and DOS file API header identities, and
applies exact-count INT21 trace anchors. The separate candidate uses the same VS2022/MSBuild
configuration as the GameLink recipe. It never launches the emulator or touches game files; the
source zip and canonical source tree remain unchanged.

Example build:

```powershell
python tools/build_dosbox_int21_trace.py --archive build/dosbox-gamelink-cok-creation-20261015-a/dosbox-x-v2026.07.02.zip --work-dir C:/temp/dosbox-int21-candidate --msbuild 'C:/Program Files/Microsoft Visual Studio/2022/Professional/MSBuild/Current/Bin/MSBuild.exe'
```

The work directory must be new. It contains the copied archive, extracted and patched source,
build log, manifest, and candidate executable. Review the manifest's archive, source, patch, and
executable hashes before any later run. This build step does not launch DOSBox.

The candidate writes newline-delimited JSON only when its process inherits
`DOSBOX_X_INT21_TRACE_PATH` with an output filename. It truncates that trace on the first
selected call and is capped at 32768 records or 16 MiB, reserving room for a final
total/retained/dropped summary. Each retained record is flushed immediately so it survives forced process
termination. The final summary is written by orderly shutdown and may be absent if a probe uses
`Stop-Process` or other hard termination. The bounds are 32768 records and 16 MiB total (with
space reserved for the summary).

Records cover INT 21h AH=3C/3D/3E/3F/40/42. `callback_context.cs/ip` records DOSBox-X's current
callback registers; these identify the internal callback stub and must not be mistaken for the
guest call site. `guest_callsite.cs/return_ip` comes from the saved interrupt return frame at
SS:SP. The frame reader mirrors the pinned DOSBox-X `src/cpu/callback.cpp::CALLBACK_SET_FLAG`
stack selection: real/VM 16-bit frames read IP at SS:SP, CS at SS:SP+2, FLAGS at SS:SP+4;
32-bit frames use ESP offsets 0, 4, and 8. Protected-mode frames use the current SS base for
`mem_read*`; real/VM frames use `real_read*`. `opcode_relation` checks for `CD 21` at the saved
return IP minus two (`return-after-int`) or at the saved IP (`at-int`). Opcode-byte attribution
is limited to real/VM segmented addresses; protected mode is labeled `unsupported-protected-mode`.

`pre.guest_return_flags` and `post.guest_return_flags` are the saved guest frame values before and
after dispatch; `post.cf` is derived from the latter, matching `CALLBACK_SCF`'s frame update.
`handler_flags` explicitly names DOSBox-X's live `reg_flags` and is not the returned guest FLAGS.
Records also include pre-call general registers/segments, path/handle where available, requested
and successful actual transfer counts, seek origin/input offset and successful returned position,
plus post AX/DX. No transfer buffer bytes are read for logging or included in output. Open/create
path capture reuses the existing DOS pathname decoded by the handler; subsequent file operations
use DOSBox-X's existing handle table. The environment value is process-scoped and the feature is
disabled by default.

Path rows include both `path` and `path_bytes_hex`. `path` remains readable for ASCII and escapes
quotes, backslashes, control bytes, and bytes `80h`–`FFh`; each non-ASCII byte is written as a JSON
`\u00XX` escape. This byte-preserving display convention keeps the JSONL UTF-8/JSON valid without
guessing a DOS code page. `path_bytes_hex` is the uppercase hex encoding of the original pathname
bytes up to the DOS NUL terminator and is the authoritative form for reconstructing non-ASCII
names. Both fields are `null` when no path was captured. Synthetic patcher controls pin the source
serializer and schema; they do not execute the C++ encoder or validate a produced JSONL row.

Each row also has `dos_context.current_psp` from the pinned source's `dos.psp()` accessor
(`DOS_Block::psp()` in `src/dos/dos.cpp`, declared in `include/dos_inc.h`) and
`dos_context.derived_load_segment`, the 16-bit `current_psp + 0x10` value. The latter is only a
derived conventional load-segment clue; PSP does not prove which overlay owns a callsite. In
real/VM mode, `guest_callsite.code_window` records 16 bytes as uppercase hex: eight bytes before
through seven bytes after saved `return_ip`, in increasing segmented offset order, with 16-bit
offset wrap. `start_ip` gives the first offset; this includes the expected `CD 21` opcode at
`return_ip - 2` for a `return-after-int` match. Protected-mode rows say
`mode: unsupported-protected-mode` and omit byte contents. The window is bounded, but its bytes
are emulator memory sampled at callback time and still require matching to independently
identified original module bytes before source attribution.

The current source-only candidate attaches a bounded `dos_context.mcb_chain_snapshot`
to the next attempted INT 21h file-call row after each snapshot capture. The generic fallback can
therefore appear on the first file-call row, and a later `START.EXE` capture can appear on
the first row after that capture. For `START.EXE`, the snapshot is captured in the pinned
`DOS_Execute` path after
`dos.psp(pspseg)`, PSP/environment MCB setup, and the conditional low-load A20
adjustment, but before the `LOADNGO` branch transfers control. The hook is limited to `LOADNGO` calls whose program name
is exactly `START.EXE` (ASCII case-insensitive, with either path separator). The snapshot
object records `capture_stage` and `capture_source` so the capture point is explicit. Schema 4
records `a20_enabled` from the pinned DOSBox-X `XMS_GetEnabledA20()` getter at snapshot time.
That getter reads the PC/AT A20 control port or the PC-98 A20 port; the patcher refuses the
pinned source unless both architecture branches are present. This is an emulator-reported gate
state, not a CPU model/profile, and the field does not alter A20. Schema 4 also records
`dos_execute_load_segment` from the actual `loadseg` local selected by this `DOS_Execute`
invocation, alongside the PSP and MCB chain. It identifies the loader's segment choice; any
physical-base interpretation still depends on using the same-run A20 state and memory model.
Schema 4 adds `cpu_profile` at the same snapshot point. Its `configured` object reports the raw
`cputype` and `core` strings from DOSBox-X's `cpu` config section. Its separate `active` object
reports the numeric `CPU_ArchitectureType` and a label derived from the exact-tag enum values,
`CPU_AutoDetermineMode`, and the symbolic decoder selected by comparing `cpudecoder` against
known function addresses declared by the pinned `include/cpu.h`. `MIXED` (the auto CPU type) and
`EXPERIMENTAL` are explicitly marked `architecture_is_concrete: false`; unknown architecture
values are labeled `unknown` and also are not concrete. Decoder pointers outside the supported
mapping are labeled `unknown`; they are never guessed from the configured `core` string.
Dynamic X86 and dynrec pointer comparisons are compiled only under their exact-tag feature guards.
This captures configured choices separately from live decoder/architecture state. It does not
prove the configuration file or executable identity used by a historical run, and it does not
record `core_mode` because its assignment/termination contract was not confirmed in the audit.
The config strings and active globals are sampled at the snapshot call, but their output and
runtime consistency have not been verified.

The generic first-file-call fallback uses JSON `null` for `dos_execute_load_segment` because it
does not observe `DOS_Execute`, and
its separate capture source/stage marks that limitation. If no START snapshot has been captured
before the first traced file call, that row uses the existing
fallback. If a generic fallback was already attached to an earlier row, that emitted row is
unchanged; the later START capture replaces it for the next row. Each pending snapshot is
consumed when a row is serialized, even if the row is later dropped at the trace size/count
limit, so it cannot be repeated on subsequent rows. At most one fallback snapshot and one
START snapshot can be emitted. If START never matches, the fallback appears once and later
rows omit the field. No additional trace records are added. The snapshot is walked from
DOSBox-X's `DOS_InfoBlock::GetFirstMCB()`
(or `guest_msdos_mcb_chain` when the DOS kernel is disabled), records M/Z blocks through the
focus interval `[07FA6h,08140h)`, and identifies each block's header/data bounds and owner
class. The walk is limited to 128 blocks and reports incomplete coverage or malformed bounds
explicitly. When the guest-DOS pointer is still its DOSBox-X `FFFFh` not-yet-discovered sentinel,
the status is `guest_mcb_unavailable` and no MCB header is read. It reads MCB metadata only; it
does not inspect block contents or MCB names. The
`focus_range_covered` field means the bounded MCB chain reaches the focus range; it does not
mean every byte belongs to allocated data. `focus_range_has_mcb_header` identifies whether any
header intersects the interval when coverage is complete, and is `null` if traversal cannot
establish full coverage. `focus_range_fully_in_data` is true only when the chain reaches the
interval and no MCB header intersects it; it does not mean the block is allocated rather than
free. `owner_psp` is the MCB owner field, not proof that the referenced PSP is live. The
For generic runs, the fallback snapshot is sampled when the first traced INT 21h handler scope
begins, before that individual DOS call is dispatched. The `START.EXE` snapshot is instead
sampled at the `DOS_Execute` point above and attached to the next attempted file-call row
after that capture. It does not prove the snapshot precedes the game's scan or overwrite. The retained DOSBox-X
header/source confirms the MCB API and `DOS_Execute` ordering, but this candidate has not been
built or run; runtime ordering, JSON output and coverage remain unverified under the current
execution hold. The CPU-profile patcher/API assertions are source-text controls only and have not
been run; C++ compilation, decoder mapping, and produced schema-4 rows remain unverified.

Example launch environment (set immediately before a normal GameLink probe, then restore it in
the caller):

```powershell
$env:DOSBOX_X_INT21_TRACE_PATH = 'C:\temp\cok-int21.jsonl'
```

GameLink remains the only guest input, screenshot, and RAM-control channel. The debugger console
helper is not used. A corrected-trace startup smoke ran once with the pinned candidate
`4D464C2D64B9F67F0533FD3DB250F1C3295BCE1B4758A911BE1E41C8DFD70EFB`, a TEMP game copy, hidden
SDL dummy mode, no guest input, and a 10-second settle. The runner exited 0 in 12.56 seconds,
did not time out, left the foreground HWND unchanged, and left no DOSBox process. GameLink v4
reported `START` at 720x400; the captured 640x400 framebuffer shows the SSI/TSR splash. The
TEMP copy's 107-file size/mtime metadata matched before and after.

The trace contains 16,098 valid JSONL rows (sequence 0-16097), covering AH=3C/3D/3E/3F/40/42
as applicable; observed AH values were 3D, 3E, 3F, 40, and 42. Every row's opcode relation was
`return-after-int`; there were 17 distinct guest CS:IP pairs across 3 guest CS values. Observed
paths included `GAME.OVR`, `KRYNN.CFG`, `TITLE.DAX`, `COMSPR.DAX`, `SKY.DAX`, `SOUND.DAX`,
`8X8D1.DAX`, `CURSOR.DAX`, `MIDI.DAX`, `ITEMS`, and `CON`. Every recorded post-call CF was false.
The final summary row is absent because the probe uses hard process termination. This is a
startup-only smoke: the opcode relation is an internal DOSBox memory check, not independent
original-source or runtime attribution. The earlier 4096-row trace predates guest-frame
attribution; its F000:D105 values were callback-context registers and cannot support guest source
attribution.

One subsequent continuation run used one GameLink Enter after the captured Tandy boot prompt, then
sent no more input. At +5 seconds the SSI/TSR splash was visible, at +15 seconds the Champions of
Krynn title screen, and at +30 seconds the credits; the main menu was not reached. The runner
exited 0 after 40.9 seconds without timeout, preserved the foreground HWND, and cleaned up the
owned job/process tree. The TEMP copy's 107-file SHA-256/size/mtime identities matched exactly
before and after. Its trace contains 28,791 valid rows (sequence 0-28790) and 16,776,916 bytes,
reaching the 16 MiB byte bound before the 32,768-record bound. Every retained opcode relation was
`return-after-int` and every post-call CF was false; the summary is absent after hard termination.

The next run used the new PSP/window candidate, sent one GameLink Enter at the boot prompt, and
stopped without a second Enter because no title appeared during the bounded wait. The final frame
was story narration. The harness exited 1 by design after 55 seconds; the outer 90-second runner
did not time out, preserved foreground, cleaned up the job, and left no DOSBox process. All 107
TEMP game-copy SHA-256/size/mtime identities matched exactly. Its trace has 21,954 valid rows
(sequence 0-21953), 16,777,058 bytes near the 16 MiB cap, and no summary after hard stop. Every
row reports PSP `0814` and derived load segment `0824`; all real/VM code windows contain 16 bytes,
and every `return-after-int` row has `CD 21` at the expected return-IP-minus-two offset. All
21,954 relations are `return-after-int` and all post-call CF values are false.

The byte comparison against the unpacked `START.EXE` matched 16 of 17 unique callsites exactly:
10 relative segment `A46` and 6 relative segment `9F0`. This same-run mapping uses DOS PSP+`0x10`
and byte equality to the unpacked image. The remaining runtime CS `1826` callsite maps to relative
segment `1002`, with a computed image offset `0x1012A`, beyond the `0x10020`-byte START image;
it was not found in raw `GAME.OVR`. Do not infer ownership: this site may be non-MZ/overlay/DOS,
but remains unattributed. These emulator PSP and byte observations do not by themselves prove
module ownership. M3 remains open; the gameplay route and main menu are not established. Next,
capture a same-run PSP/load/overlay allocation map and wider bytes for the unmatched site, then
continue by controlled GameLink input to the first natural ECL/map transition and correlate
archive/member I/O with resulting map/event state. None of these startup runs constitute M3
acceptance.

`dosbox_x_debugbox_probe.ps1` accepts `-ReadySettleMs` from 0 through 15000. The default 0
preserves the existing capture timing. A positive value waits after the first valid GameLink v4
frame and before recording probe status/capturing the framebuffer, giving guest startup time to
advance without sending input. The probe rechecks that its owned DOSBox process is alive and that
headless mode has not produced a visible window after the delay.
