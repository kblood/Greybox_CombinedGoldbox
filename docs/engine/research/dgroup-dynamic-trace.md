# DGROUP dynamic-trace feasibility — DOSBox-X debugger automation

> **2026-07-15 update:** the historical verdict below applies to the 2026.06.02 build that was then
> available. An isolated official portable DOSBox-X 2026.07.02 SDL2 build now mounts quoted GOG paths
> through config `[autoexec]`, and `DEBUGBOX START.EXE` reaches Pool's original packed entry without
> manual input. Debugger-command automation and runtime overlay mapping are still unproven. Continue
> from `gen1-dosbox-runtime-trace.md`; retain the investigation below as the record of the former
> environment failure and rejected static-only shortcut.

> Scope: can we headlessly recover the runtime **DGROUP/DS segment base** for the three Krynn
> binaries via a scriptable DOSBox-X debugger session, so the 9 decompile units below can move
> from "COAB-authoritative, byte-verification pending" to fully byte-verified? **Verdict: Path B
> — documented negative.** DOSBox-X's debugger is real and has the exact commands the project's
> prior notes named (`MEMDUMPBIN`, `BP`, `BPINT`), and it *can* be told to break automatically
> with zero keypresses (`-break-start`, `DEBUGBOX <program>`). But **the debugger's own
> command loop (BP → RUN → read registers → MEMDUMPBIN) has no config-file/script-file
> automation in the shipped software** — every debugger command must be typed into an
> interactive console. A live-fire attempt to at least reach the debugger and screenshot its
> register pane (which would need zero keystrokes) was blocked by an unrelated, environment-
> specific regression in the one debug-capable DOSBox-X build available on this machine (its
> `MOUNT`/`CONFIG`/`VER`/`HELP` internal shell commands are non-functional — see §4). The static-
> relocation-table alternative (compute DGROUP from the MZ header without ever running the
> program) was investigated seriously per the task brief and gives real, useful constants for
> free, but does not eliminate the dynamic-trace requirement (see §5).

## 1. The 9 blocked units

Per `docs/engine/research/decompile-worklist.md`, every unit in the 2026-06-26 loop iteration
carries a variant of the same sentence: *"Byte-level confirmation of ... is pending the overlay
DGROUP base (methodology §3.2); the algorithm above is COAB-authoritative."* Grepping every
`decompile-*.md` doc for `DGROUP` and excluding `decompile-dqk-ecl-dispatch.md` (already a
separate, already-documented negative, not a "DONE" unit) yields exactly **9**:

| # | Unit | Doc | Exact blocking citation |
|---|---|---|---|
| 1 | ovr006 — after-combat XP/treasure | `decompile-ovr006-xp-treasure.md` | "Byte-level confirmation of `addExp`'s `exp\10` ... is pending the overlay's **DGROUP base** so string/var offsets bind to code (methodology §3.2 — resolve via DOSBox-X DS snapshot or prologue clustering)." |
| 2 | ovr026 — class/level/dual-class recalc | `decompile-ovr026-class-recalc.md` | "Byte-level confirmation of the multiclass `max`/breakpoint comparisons is pending the overlay DGROUP base (methodology §3.2)." |
| 3 | ovr015 — party movement/doors | `decompile-ovr015-movement.md` | "Byte confirmation pending the overlay DGROUP base (methodology §3.2); algorithm is COAB-authoritative." |
| 4 | ovr007/020/022 — economy & item cluster | `decompile-ovr007-economy.md` | "Byte-level confirmation of the `field_6DA` shift table and appraisal ranges is pending the overlay DGROUP base (methodology §3.2)." |
| 5 | ovr010 — monster combat AI | `decompile-ovr010-monster-ai.md` | "Byte-level confirmation of the `data_2B8` table and the morale comparisons is pending the overlay DGROUP base (methodology §3.2)." |
| 6 | ovr011 — battle setup/placement | `decompile-ovr011-battle-setup.md` | "Byte-level confirmation of the `(member+1)/2` half-team and `>10 / >5` bound comparisons is pending the overlay DGROUP base (methodology §3.2)." |
| 7 | ovr021 — clock/affect-timeout/spell-learning | `decompile-ovr021-time-learning.md` | "Byte-level confirmation of the `timeScales` radix array and the `*3`/`*2` learn-timers is pending the overlay DGROUP base (methodology §3.2)." |
| 8 | ovr017/018 — save/import/roster | `decompile-ovr017-save-import.md` | "Byte-level confirmation of the `ConvertPoolRadPlayer` field offsets and the cap comparisons is pending the overlay DGROUP base (methodology §3.2)." |
| 9 | ovr030/031 — 3-D world renderer | `decompile-ovr030-3d-renderer.md` | "Byte-level confirmation of the `idxOffset/colCount/rowCount` tables and the time-of-day branches is pending the overlay DGROUP base (methodology §3.2)." |

All 9 cite the identical root cause: `docs/engine/research/decompile-methodology-krynn.md` §3.2
("DGROUP data-segment binding") — the actual DS value is only known at runtime and the
project's `tools/disasm_dqk.py:guess_dgroup_bases()` heuristic is admittedly "probabilistic."

## 2. What DOSBox-X actually is, here

- **The bundled per-game `DOSBox.exe`** (`Champions of Krynn/DOSBOX/DOSBox.exe`, `Death
  Knights of Krynn/DOSBOX/DOSBox.exe`, `The Dark Queen of Krynn/DOSBOX/DOSBox.exe`) is **vanilla
  DOSBox 0.74-2** (GOG's bundled release build; source tarball `dosbox-0.74-2.1.tar.gz` sits
  next to it). Confirmed via `strings`: **zero** debugger strings (`MEMDUMPBIN`, `DEBUGBOX`,
  `Enter debugger command` all absent). This is what `tools/dosbot/` already automates —
  screen-capture + vision only, exactly as its README says; it never touches a debugger because
  this binary doesn't have one.
- **A real debug-capable DOSBox-X install exists on this machine** at
  `C:\LLM\DOS\cc\dosbox-x\` (four builds: `dosbox-x_XPx64_SDL1.exe`, `_SDL2.exe`, `_XPx86_*`;
  version banner `DOSBox-X 2026.06.02`). This is **external, shared infrastructure** — it is the
  DOSBox-X copy used by the unrelated `C:\LLM\cc` NASM/"clean-room asm Gold Box engine" project
  (see user memory `goldbox-asm-engine-template`), **not part of this repo**. `strings` confirms
  it is a debug build: `MEMDUMPBIN`, `MEMDUMPBIN [s]:[o] [len] - Write memory to file
  memdump.bin.`, `Enter Debugger Command`, `Enter debugger command:`, `DEBUG`/`Debug` are all
  present in both the SDL1 and SDL2 x64 binaries.
- No other DOSBox/DOSBox-X binary exists anywhere else in the repo, in `native/`, or under
  `C:\LLM` (checked).

**Implication:** any dynamic-trace work for this project depends on external tooling not
checked into the repo. That's fine (same posture as the Amiga `.adf` disk images — "referenced,
not vendored") but it means the exact working folder (`C:\LLM\DOS\cc\dosbox-x\`) must stay
available, and this doc's procedure should be re-validated if that install is ever
updated/moved/reinstalled.

## 3. Debugger capability — confirmed real, confirmed non-scriptable

Sources: `README.debugger` (github.com/joncampbell123/dosbox-x), the DOSBox-X wiki's
"Command-Line Options" and "Supported Commands" pages, GitHub Discussion #5791, SourceForge
patch #289, and our own `strings` extraction of the two x64 builds.

**What's real and matches the project's prior notes:**
- `MEMDUMPBIN <seg> <off> <bytecount>` — dumps memory to `MEMDUMP.BIN`. Exists verbatim, exactly
  as `decompile-methodology-krynn.md` §3.2 and §4 already claimed.
- `BP <seg> <off>` (real mode), `BPM <seg> <off>` (protected mode), `BPINT <intnum> [ah]`
  (interrupt breakpoint) — all real, documented debugger commands.
- `DEBUGBOX [command] [options]` — **a DOS-shell internal command** (typed at the `C:\>`
  prompt, so it *can* be fed via `-c "DEBUGBOX ..."` on the command line): "Runs program and
  breaks into debugger at entry point." This is exactly the "-c" plumbing `tools/dosbot/`
  already uses for autoexec, extended one step further.
- `-break-start` — CLI flag: "Starts DOSBox-X and breaks into its debugger directly."
- Both of the above mean **reaching the debugger, at a known instruction (program entry),
  requires zero interactive keypresses.** This part of Path A is a genuine, confirmed positive.

**What's missing — the actual blocker:**
- There is **no config-file or script-file mechanism to feed the debugger itself a list of
  commands** (breakpoint set, run, register/memory dump, quit) in the shipped software. Checked
  three independent sources and all agree:
  - `README.debugger` documents every command's syntax but nothing about batch/autoexec input.
  - GitHub Discussion #5791 ("functions of debugger (log, snapshot)") — a maintainer directly
    answers a very similar automation question with only "You can use the LOG command to run
    the game with each instruction logged to a file LOGCPU.TXT" (itself typed interactively;
    the discussion also notes this feature is flaky for at least one user). No config-driven
    autoexec for the debugger is mentioned by the maintainer.
  - **SourceForge patch #289** ("Run an AutoExec text file when DosBox Debugger starts") is
    *exactly* the feature this task needs — a debug-console command-file loader with `BPINT`
    support — but it targets **classic DOSBox 0.74-3's source tree, not DOSBox-X**, and its own
    tracker entry is **still "open"/unmerged** as of 2021-04-16 (maintainer Qbix called the idea
    "interesting" but wanted a "wider" approach). It never shipped in any distributed binary,
    DOSBox-X included.
- Conclusion: once inside the debugger (which we *can* reach automatically), extracting the
  DS/CS register values and dumping memory still requires **typing** `BP`, `RUN`,
  `MEMDUMPBIN`, etc. one at a time into a live interactive console. That is a human-in-the-loop
  requirement in the actual shipped tool, not a documentation gap on our part.

## 4. Live-fire attempt and the environment-specific blocker found

To be rigorous (the task explicitly asks to try, not just read docs), I drove the real
`dosbox-x_XPx64_SDL2.exe` end to end using the same primitives `tools/dosbot/lib.ps1` already
validates (`PrintWindow`-based capture — immune to desktop occlusion, which matters because this
machine runs multiple concurrent agent sessions sharing one desktop; a naive `CopyFromScreen`
capture grabbed a *different* session's unrelated terminal window during testing).

Findings, in order:
1. `-break-start` and `DEBUGBOX <exe>` are real, accepted flags (no "unknown switch" errors).
2. `-nopromptfolder -defaultdir <path>` is required for headless use: without it, DOSBox-X pops
   an interactive **"Select folder where to run emulation"** Explorer dialog on first run in a
   new working directory — a genuine extra interactive gate, separate from the debugger, that
   the task should know about. `-fastlaunch` also suppresses it (bundled with skipping the BIOS
   splash) but has a side effect (next point).
3. **Blocker found:** in *this specific installed copy*, the internal DOS-shell commands
   `MOUNT`, `CONFIG`, `VER`, and `HELP` all fail with `Bad command or filename`, while `DIR`
   works normally. This reproduced identically across every variant tried:
   - Our own isolated `-conf` file with only a `[autoexec]` `MOUNT C "..."` line.
   - Bare `-c "MOUNT ..."` command-line switches (no conf file at all).
   - The classic "positional argument" convenience-mount (`dosbox-x.exe "path\to\DQK.EXE"`),
     which internally also calls `mount`/`config` and fails the same way.
   - The pre-existing shared `dosbox-x.conf` next to the exe (which belongs to the other,
     unrelated `C:\LLM\cc` project and has its own working `MOUNT`-based autoexec — it *also*
     fails now, so this is not specific to our conf).
   - With and without the harness's sandbox disabled (`dangerouslyDisableSandbox`) — ruled out
     as a sandboxing artifact.
   Root cause not further isolated (out of scope: this is a third-party binary issue, not a
   Krynn/GoldBox format question) — plausibly a regression specific to this `2026.06.02` nightly
   build, or a compile-time restriction the other project's owner applied intentionally. Since
   `MOUNT` never succeeds, **no drive can be attached, so none of the three Krynn `.EXE`s can be
   loaded into this DOSBox-X instance at all** — independent of the debugger-scripting question
   in §3.
4. This blocker means the one experiment that *would* have been genuinely decisive — screenshot
   the debugger's register pane immediately after `DEBUGBOX DQK.EXE` breaks, with **zero**
   keystrokes, to see whether DS/CS/SS are visible passively (the vision-read trick
   `tools/dosbot/` already uses for game screens) — could not be completed. This remains the
   single most promising untried angle; see §6.

None of this required or resulted in any change to files outside `docs/`/`tools/` in this repo;
the shared `C:\LLM\DOS\cc\dosbox-x\dosbox-x.conf` was read but never written by this
investigation, and all spawned `dosbox-x_XPx64_SDL2.exe` processes were killed afterward.

## 5. Static-relocation-table alternative — investigated, does not eliminate the trace

The task asks specifically whether the MZ header's own relocation table can substitute for a
live trace, since `e_cs`/`e_ip`/`e_ss`/`e_sp` and the relocation table are all static. This was
tested for real against all three binaries' actual headers.

**MZ header facts (purely static, `python struct.unpack`):**

| Binary | size | `e_crlc` (#relocations) | `e_cs` | `e_ip` | `e_ss` | `e_sp` |
|---|---|---|---|---|---|---|
| CoK `START.EXE` | 61,607 B | **0** | 0x0E88 | 0x0012 | 0x1065 | 0x0080 |
| DoK `START.EXE` | 74,299 B | **0** | 0x11A0 | 0x0012 | 0x147E | 0x0080 |
| DQK `DQK.EXE` | 449,664 B | **2,291** | 0x1D99 | 0x076C | 0x3FE4 | 0x0400 |

**CoK/DoK: relocation table is empty, and the entry point is a decompression stub.**
Disassembling at `e_cs:e_ip` (file offsets `0xea92` / `0x11c12`) shows, byte-for-byte identical
in both games:
```
mov ax, es
add ax, 0x10
push cs
pop ds
mov word ptr [4], ax
add ax, word ptr [0xc]
mov es, ax
mov cx, word ptr [6]
...
rep movsb ...          ; backward block copy (std set) — classic self-relocating unpacker
...
retf                    ; far-jumps into the decompressed body
```
This is a **self-decompressing stub**, not the real program entry — structurally the same
situation Simeon Pilgrim documented for COAB's `COTAB.EXE` (`decompile-methodology-krynn.md`
§1.1: "COTAB.EXE was compressed/encrypted at rest... used DOS `debug.exe` to single-step past
the decompression stub"). No known third-party packer signature (`LZ09/LZ91` LZEXE, `PKLITE`,
`EXEPACK`, `diet`, `UPX`) is present as a string — this looks like a bespoke SSI-era packer, so
there's no off-the-shelf static unpacker to reach for. **Zero relocation entries (`e_crlc=0`)
is consistent with this**: a self-relocating stub computes its own segment values from `CS`/`ES`
at runtime (`mov ax,es / add ax,0x10`, `push cs / pop ds`) rather than relying on DOS's loader
relocation mechanism, so there is nothing in the file's relocation table to read no matter how
hard we look — **the static approach is a hard dead end for CoK/DoK specifically**, for the same
reason Pilgrim had to run `debug.exe` interactively in the first place.

**DQK: not packed, has 2,291 relocations, but the "SS=DGROUP" shortcut doesn't hold.** DQK's
entry point (file offset `0x204fc`) is ordinary, un-packed Borland-style startup code:
```
mov word ptr cs:[0xa86], es
mov word ptr cs:[0xa88], ds
mov bx, 0x1d99
mov ds, bx              ; DS := 0x1D99 == e_cs itself (a small dispatch/bootstrap segment)
push ds
call 0x49
...
```
`0x1D99` matches (and now statically *confirms*, with zero execution) the dispatch segment
already inferred dynamically in `docs/engine/research/cok-copy-protection.md` §DQK.4 ("`CALL FAR
1D99:155D`"). That's a genuine free win from the header alone. But this bootstrap segment is
**not** DGROUP — the top-level `e_ss` (`0x3FE4`) is a different segment, and Borland small-model
programs conventionally place the stack *inside* DGROUP (i.e. `SS == DGROUP`, set directly by
the DOS loader from the header with no code needed). I tested that hypothesis directly: scanned
all 2,291 relocation-fixup target words in the file for the raw value `0x3FE4` (the value any
other `MOV AX, seg DGROUP` instruction elsewhere in the program would also need, and would
therefore also carry its own relocation entry) — **it appears 0 times.** The hypothesis is
refuted; `SS` is not shared with the rest of the program as a `DS`-style near-data segment here
(or if it is, no other code establishes `DS` from a literal matching `e_ss`, e.g. because DS is
instead derived via register copy from some other already-known segment, exactly as CoK/DoK do
from `CS`/`ES`). The relocation table's raw-value frequency histogram *does* surface other real
segments (`0x1D99` appears 105 times, matching the confirmed dispatch segment; `0x00D7` appears
624 times, `0x12B7` 269 times — most likely heavily-referenced *code* segments via far
call/jump fixups, not data), but disambiguating "the DGROUP data segment" from "a
frequently-called code segment" from raw relocation values alone requires exactly the same kind
of semantic disassembly clustering that `tools/disasm_dqk.py:guess_dgroup_bases()` already
implements and already documents as probabilistic.

**Verdict on the static alternative:** worth doing (now documented, and it gives real,
zero-cost constants — confirmed `e_cs`/`e_ip`/`e_ss`/`e_sp` for all three binaries, and an
independent static confirmation of the `0x1D99` dispatch segment) but it **does not replace**
the dynamic trace: CoK/DoK have no relocation data to read at all (packed), and DQK's
relocation table doesn't cleanly hand over DGROUP without the same probabilistic clustering the
project's tooling already does. The dynamic trace remains necessary for a byte-exact answer.

## 6. Manual procedure for a human (a few minutes, once a working DOSBox-X install is at hand)

Preconditions: a DOSBox-X build with the debugger compiled in (confirmed via `strings <exe> |
grep MEMDUMPBIN`), and — per §4 — one where `MOUNT` actually works (test with `-c "MOUNT C
<anydir>"` first; if it prints `Bad command or filename`, this specific install has the same
regression found here and needs reinstalling/replacing before continuing).

**Recommended target: DQK.EXE, not CoK/DoK's START.EXE.** DQK is not packed (§5), so its real
program entry is directly visible at `e_cs:e_ip` with no decompression step to defeat first.

1. Launch, breaking automatically at DQK's real entry point, with zero keypresses:
   ```
   dosbox-x.exe -nopromptfolder -defaultdir <workdir> -conf <yourconf> -fastlaunch ^
     -c "MOUNT C \"The Dark Queen of Krynn\"" -c "C:" -c "DEBUGBOX DQK.EXE"
   ```
   (Confirm `MOUNT` succeeded — i.e. `C:` actually becomes the prompt — before trusting the
   rest; see §4.) This should land in the debugger UI already broken at `CS:IP = 1D99:076C`
   (both statically known from the header, per §5 — no trace needed just to confirm you're at
   the right place).
2. In the debugger, read the register pane (visible without typing anything, if this build's UI
   shows it by default — confirm and screenshot; this was the untested step, see §7) or type a
   register-dump command if one is needed. Record `CS`, `DS`, `SS`, `ES` at this point. At the
   *very* entry, `DS`/`ES` will still be the PSP segment DOS set at load (not yet DGROUP) — the
   program hasn't run its own `DS`-establishing code yet.
3. Single-step (`F11`/`T`) forward past the `mov bx,0x1d99 / mov ds,bx / push ds / call 0x49`
   sequence (§5) into the `call 0x49` target — that's where DQK's real startup work happens and
   where a genuine DGROUP-establishing `mov ax,seg DGROUP / mov ds,ax` is most likely to appear
   next. Watch for the first `MOV DS, <reg>` after a `MOV <reg>, <imm16>` and record that imm16
   — *that* is the DGROUP segment (in the load-relative convention COAB's `coad_db.idc`
   `SegDefReg(...,"ds",0x1631)` also uses).
4. `MEMDUMPBIN <that segment>:0000 0x200` to snapshot the first 512 bytes of DGROUP to
   `MEMDUMP.BIN` for a sanity read (should look like initialized near-data: pointers, small
   integers, ASCII fragments — not code).
5. Cross-check: take one of the 9 units' cited `imm16` offsets (e.g. ovr006's DGROUP near-var
   `0x6dea/0x6dec` experience accumulator) and read the byte(s) at `<DGROUP segment>:0x6dea` via
   `D <seg> <off>` (data view) — confirm it looks like a plausible 32-bit counter location (not
   code, not obviously wrong), which is the byte-level confirmation each of the 9 docs is
   waiting on.
6. Repeat step 1–5 per overlay if a unit's code lives in a different loaded overlay than the
   main resident segment (each FBOV/overlay load gets its own segment placement at runtime, so
   this is not a one-shot global constant — see methodology §3.2's "differs between the main
   image and each overlay segment").

For CoK/DoK, the same procedure needs one extra prerequisite step first: get past the
self-decompression stub described in §5. The cheapest way (mirroring Pilgrim's own solved
approach for COTAB.EXE) is to single-step across the `retf` at the end of the stub (breakpoint
on that `retf`'s file-relative address, or just `T`/step through the ~40 bytes shown in §5) and
only *then* start looking for the `MOV DS, imm16`-style DGROUP setup in the decompressed body.

## 7. A plausible untried automation angle

The one experiment this session could not finish (blocked by §4's `MOUNT` regression, not by a
fundamental limitation) is: **does DEBUGBOX's break-in show live register values without any
typed command?** If the debugger's default view includes an always-visible register pane (a
common TUI-debugger convention), then step 2 of §6 becomes a **zero-keystroke** screenshot read
— exactly the vision-read pattern `tools/dosbot/` already uses successfully for game screens
(Ollama `qwen3-vl:8b` reading on-screen text). That would make the "reach a breakpoint and read
registers" half of this task fully headless after all, leaving only the single-step-forward
part (§6 step 3) as a genuinely interactive/scripted-keystroke problem.

If that pans out, the next layer to try (also untried here) is **keystroke injection into the
debugger's own console**, as distinct from `tools/dosbot`'s existing finding that synthetic
keyboard input does *not* reach the SDL game-render window (only mouse does). The debugger's
console is a different input surface — on Windows it is very likely a real Win32 console
(PDCurses-style), which reads via `ReadConsoleInput`, not the SDL/DirectInput path the game
window uses. `WriteConsoleInput` (a different Win32 API than the `SendInput` calls
`tools/dosbot/lib.ps1` already has) can inject keystrokes directly into a console's input
buffer and is a plausible, not-yet-tried way to drive `BP`/`RUN`/`T`/`MEMDUMPBIN` from a script
even though the debugger has no native batch-file support (§3). This would need its own
dedicated small experiment once a working (`MOUNT`-functional) DOSBox-X install is available.

## 8. Bottom line

- **Path A does not fully work today**, for two independent reasons: (1) DOSBox-X's shipped
  debugger genuinely has no scriptable command-file input — confirmed against the official
  README, wiki, and the one community patch that would have added this (unmerged, wrong
  codebase); (2) the only debug-capable DOSBox-X build reachable from this machine currently has
  a `MOUNT`/`CONFIG`/`VER`/`HELP` regression that blocks loading any target file at all,
  independent of point (1).
- **`-break-start` / `DEBUGBOX <exe>` are real and do get you to a breakpoint with zero
  keypresses** — that half of "headless" is solid and documented for reuse.
- **The static relocation-table alternative was seriously investigated and is a genuine partial
  win** (free, zero-execution confirmation of `e_cs`/`e_ip`/`e_ss`/`e_sp` for all three
  binaries, and independent static confirmation of DQK's `0x1D99` dispatch segment) **but does
  not replace the dynamic trace**: CoK/DoK are packed with an empty relocation table (dead end),
  and DQK's relocation table doesn't isolate DGROUP without the same probabilistic clustering
  `guess_dgroup_bases()` already does.
- **This is a rigorous documented negative with two concrete next steps**, per the project's own
  established convention (seg051 RNG, DQK ECL dispatch table): (a) the manual procedure in §6,
  executable by a human in a few minutes once a `MOUNT`-functional debug-capable DOSBox-X build
  is available; (b) the untried automation angle in §7 (screenshot-read the register pane with
  zero keystrokes, then `WriteConsoleInput` injection for the remaining step-forward/dump
  commands) as the path back to full headlessness if someone wants to pursue it further.

## Sources

- `docs/engine/research/decompile-worklist.md`, `docs/engine/research/decompile-methodology-krynn.md` §3.2
- The 9 unit docs cited in §1 (exact quotes above)
- `docs/engine/research/cok-copy-protection.md` §DQK.4 (`0x1D99` dispatch segment, confirmed independently in §5)
- `tools/dosbot/README.md`, `tools/dosbot/lib.ps1` (existing screen-capture/vision automation pattern this investigation reused and extended)
- DOSBox-X `README.debugger`: https://github.com/joncampbell123/dosbox-x/blob/master/README.debugger
- DOSBox-X wiki, Command-Line Options: https://dosbox-x.com/wiki/DOSBox%E2%80%90X%E2%80%99s-Command%E2%80%90Line-Options
- DOSBox-X wiki, Supported Commands: https://github.com/joncampbell123/dosbox-x/wiki/DOSBox%E2%80%90X%E2%80%99s-Supported-Commands
- DOSBox-X GitHub Discussion #5791 ("functions of debugger (log, snapshot)"): https://github.com/joncampbell123/dosbox-x/discussions/5791
- SourceForge classic-DOSBox patch #289 ("Run an AutoExec text file when DosBox Debugger starts"), unmerged: https://sourceforge.net/p/dosbox/patches/289/
- `strings` extraction of `C:\LLM\DOS\cc\dosbox-x\dosbox-x_XPx64_SDL2.exe` / `_SDL1.exe` (this session)
- MZ header parse of `Champions of Krynn/START.EXE`, `Death Knights of Krynn/START.EXE`, `The Dark Queen of Krynn/DQK.EXE` (this session, `python struct.unpack`)
- `tools/disasm_dqk.py` (`guess_dgroup_bases()` — the existing probabilistic heuristic this negative result confirms is still the best static option for DQK)
