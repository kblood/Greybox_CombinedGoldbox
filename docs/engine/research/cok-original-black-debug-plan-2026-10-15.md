# Original CoK black transition: one bounded debugger experiment (2026-10-15)

## Question and evidence boundary

Distinguish an original BIOS keyboard wait from an executing loop or an inconsistent video/publication state after the observed title → version → black transition. This is diagnosis toward the original creation/party comparison, not completed comparison or GUI acceptance.

The prior oracle receipt records two stopped runs (direct and LOADFIX -32), one observed title Enter per run, then black. In the LOADFIX run two live RAM captures differed at 184 bytes, BIOS ticks advanced 822773→822822, and ring head=tail=0020. Those facts show activity and an empty ring; they do not identify the executing instruction or prove a wait/stall. Preserve the entire old oracle directory unchanged.

## Existing capabilities and limits

- `tools/dosbox_x_debugbox_probe.ps1` supports `-DbxExe`, staged `-GameDir`, `-Exe`, `-OutDir`, `-LoadFixKb`, `-GameLink`, `-DebuggerAction` and hidden SDL dummy launch. Debugger actions must not be combined with `-RunDirect`. Supplying actions also preserves the debugger console (the script otherwise adds `-noconsole` for headless launch).
- `tools/dosbox_debugger_input/Program.cs` validates the owned DOSBox-X PID, attaches its console and uses `WriteConsoleInputW` / `ReadConsoleOutputCharacter`. This is targeted debugger-console input, not global keyboard/focus automation. Game input and screenshots remain exclusively GameLink.
- The pinned candidate's `src/debug/debug.cpp` implements `BPINT`, `RUNWATCH`, `C`, `D`, `MEMDUMPBIN`, and read-only `VGA MODE`, `VGA DRAW`, `VGA CRTC`, `VGA AC`, `VGA SEQ`, `VGA GC`, `VGA DAC`. `RUNWATCH` refreshes the live register/disassembly display approximately every 33 ms. **Its snapshot is a running sample, not an atomic paused endpoint.** Both `(Running)` and `(Running/watching)` mean running; do not reuse the clock trace's narrower `IsRunning` regex unchanged.
- GameLink `status` exposes frame sequence/dimensions/program and RAM size, not CPU registers. `dump-memory` reads the shared ordinary RAM; it is not an authoritative dump of all four planar VGA banks. A black frame plus nonzero A000 RAM alone cannot prove a publisher bug.
- `trace_cok_clock_candidate.ps1` supplies the existing debugger helper calling pattern but hardcodes a different DOSBox executable and runs an unrelated route. Do not execute it for this experiment.

## One run, exact launch and ownership

Luna owns the run after checking the singleton DOSBox/GameLink lease. Create a NEW output directory `build/cok-recomp/staging/intro-compare/original-black-debug-20261015-a/`, with a fresh `runtime-game` copy of the previous oracle input stage and an empty SAVE directory. Record staged file hashes and KRYNN.CFG bytes; original retail files and historical evidence are read-only. No Rust source, native source, emulator source, or generated asset writes.

Resolve `candidateExe` from `build/dosbox-gamelink-cok-creation-20261015-a/manifest.json` and require its actual SHA256 to equal `3f548183dc0e937482b531cf72c024108636af822f2c89e19e757a318cc4d509`. Do not substitute a bundled/default DOSBox build. The selected candidate contains the mode-change GameLink publication fix. Reuse the built debugger helper; if absent, stop and arrange its ordinary serialized build separately, not emulator instrumentation.

Launch using the following existing parameters (variables are absolute paths resolved within that new output):

```powershell
& tools/dosbox_x_debugbox_probe.ps1 -DbxExe $candidateExe `
  -GameDir $runtimeGame -Exe START.EXE -OutDir $session `
  -LoadFixKb 32 -GameLink -ActionDelayMs 250 `
  -DebuggerAction @('BPINT 16','BPINT 10 00','RUNWATCH')
```

Retain the default cycles setting from the previous oracle (no `-Cycles` override); changing it would add another variable. The meaningful change is debugger observation. Do not pass ShowGameLinkWindow, RunDirect, AutoTypeKey or StopAfterCapture. Read the owned PID from `probe-process.json`; retain ownership until closure.

For each helper action, use the existing command form, unique label and exact owned PID:

```powershell
& dotnet $helperDll --pid $ownedPid --command $command `
  --status "$session/$label-status.json" --snapshot "$session/$label-console.txt"
# Read-only poll while running:
& dotnet $helperDll --pid $ownedPid --snapshot-only `
  --status "$session/$label-status.json" --snapshot "$session/$label-console.txt"
& python tools/dosbox_gamelink.py status
& python tools/dosbox_gamelink.py screenshot "$session/$label.png"
& python tools/dosbox_gamelink.py dump-memory "$session/$label.ram" --start 0 --length 0x100000
```

## Bounded observation sequence

1. Poll debugger and frame state. At each actual BPINT stop, preserve the register/disassembly snapshot (CS:EIP, SS:ESP, AX, flags and surrounding instructions). Save one paired GameLink status/frame and 1 MiB RAM. Recognize the breakpoint from actual opcode/AX, not merely a console string from an earlier command. Source CS offsets must be resolved against live loaded bytes/relocations; do not assume the recompiled runtime's load base.
2. At a paused stop collect `VGA MODE`, `VGA DRAW`, `VGA CRTC`, `VGA AC`, `VGA SEQ`, `VGA GC`, `VGA DAC`, each with its own console snapshot. Capture stack using `D <observed-SS>:<observed-SP>` and current code using `C <observed-CS>:<observed-IP>`; these move debugger views, not guest registers. Extract BDA mode/page/columns, cursor words, 041A/041C ring head/tail, 041E..043D words, and 046C ticks from RAM. If a snapshot truncates a requested field, report it missing. Do not claim a full DAC palette from `VGA DAC`; `VGA AC` does expose the 16 attribute palette mappings and display-disable bits.
3. The video breakpoint stops **before** mode selection. At AH00 INT10, use the existing helper `--key F10` once to step over that BIOS call, verify the resulting paused address, then repeat the video/BDA/frame observation and resume with `RUNWATCH`. A frame sampled while paused may still be the last published frame; do not interpret lack of sequence change during pause as a bug.
4. Permit exactly one Enter, and only after a captured title identifies the same observed transition as before. If running, `python tools/dosbox_gamelink.py press enter --hold 0.15 --pace 0.25`. If stopped at a keyboard breakpoint with the title visible, use `queue-key enter down`, resume `RUNWATCH`, then `queue-key enter up` after the bounded pulse; the low-level edge operation is explicitly supported for paused traces. Retain acceptance/release evidence and verify no held input remains. No other guest key and no RAM/register poke.
5. At the first post-Enter keyboard stop, capture the bundle before resuming. AH00 with an empty ring is evidence that the original is about to perform a blocking read; it does not prove a visible menu was drawn. AH01 is a poll, not a blocking read. If necessary, resume at most twice without input to identify repeat polling and its original caller. Preserve the last frame before/after actual resumed execution.
6. If black persists while running and no breakpoint fires, take three RUNWATCH register/disassembly snapshots spaced about 500 ms apart, paired with frame metadata and RAM. They can identify a candidate BIOS wait or repeated guest loop for source decoding. They do not prove an exact paused endpoint or a hang merely from repeated CS:IP. Do not send debugger commands into a running console expecting them to pause immediately; the source does not establish that capability.

Hard bounds: one launch, one title Enter, at most 16 interrupt stops, at most 60 seconds after launch, and at most 8 seconds after the first post-title black frame. Stop at the first discriminating bundle, on any helper/protocol failure, or when any bound expires. Close only the owned PID using the existing probe cleanup pattern and confirm exit. If breakpoints prevent reaching the title within the bound, retain that result as an instrumentation limitation; do not silently remove breakpoints and repeat a blind run.

## Interpretation and next decision

| Observation | Supported conclusion / next action |
| --- | --- |
| Post-title INT16 AH00, empty ring, identified original caller | Original input boundary found. Compare caller bytes/stack with the recovered keyboard helper. A black frame still needs video interpretation; do not infer which menu choice is safe. |
| Repeated AH01 at the same original loop, ticking BDA | Original polling wait found. Analyze its conditions before choosing another game key. |
| Current video state shows disabled attribute output, sequencer screen-off, unexpected mode/start address, or contradictory draw dimensions | Concrete video-state hypothesis. Preserve exact registers and trace the original writes next; do not fix the publisher from an assumed mode. |
| Running samples remain in a non-input loop | Candidate guest execution loop identified, not proven deadlock. Decode the observed bytes and its wait predicate as the next bounded source task. |
| CPU progresses, video settings look plausible, but frame sequence remains fixed | Publication/render hypothesis remains open. Current tools have not yet proved visible nonblack planar content; report that evidence gap instead of blaming GameLink. |
| No usable CPU snapshot or no discriminating boundary | Experiment incomplete with exact missing observation. Only then consider a narrowly reviewed instrumentation addition. |

Deliver a short receipt with candidate/input hashes, owned PID/closure, exact commands, numbered stops, CPU addresses, BDA/video values, frame sequences/hashes, and the single supported classification. Preserve ambiguity where the evidence overlaps. No claim of original creation/party comparison completion follows from this diagnostic.

## Source-reviewed debugger-state correction after the first diagnostic

The first diagnostic's `session/final-watch-console.txt` is a **stopped debugger endpoint**, not a running sample. The pinned candidate's `src/debug/debug.cpp:1241–1242` prints register-pane `HLT` or `RUN` solely according to `CPU_IsHLTed()`. `RUN` here means the emulated CPU is not in HLT; it does not mean the debugger is executing instructions.

Use the debugger input-pane state: `DrawInput` prints `(Running)` for normal execution and `(Running/watching)` for watch execution. Its stopped command-entry branch prints `I->` or `O->` (insert/overwrite editing mode). The captured `I-> _`, together with CS:EIP F000:DA84, opcode CD16, AX1100 and SS:ESP 24F7:3FDC, establishes a stopped command prompt at the armed INT16 boundary. This is an early AH11 enhanced-keyboard status query, not evidence of an AH00 blocking read or of the later title-to-black failure. The frame containing mount/LOADFIX text is the last published guest frame; an underscore does not establish a returned DOS command prompt.

The receipt's zero-stop / final-running-sample interpretation must therefore be corrected while preserving the raw files. Future parsing must inspect the input-pane markers (anchored complete marker lines), never a bare `RUN` substring anywhere in the console. If conflicting markers or a missing pane prevent classification, record unknown. No further experiment is authorized by this correction. A missing GameLink mapping when no DOSBox process exists means a free singleton lease, not a protocol failure; debugger-helper availability/build is a separate preflight condition.

## Proposed follow-up: capture the real early stop, then bounded continuation

This is the next source-reviewed experiment plan, not an execution receipt. Luna owns execution after Root approves the concrete fixture and confirms the DOSBox/GameLink lease. It is independent of the current Rust process. Use a fresh `original-black-debug-followup-20261015-a` sibling directory; clone the prior `original-black-debug-20261015-a/runtime-game` inputs and compare every input hash to its preserved staged manifest. Keep historical evidence and retail originals read-only; writes belong only to the new clone/output. Resolve the same candidate executable from its pinned manifest and require SHA `3f548183dc0e937482b531cf72c024108636af822f2c89e19e757a318cc4d509`.

Use the exact launch parameters above: staged START.EXE, LOADFIX32, GameLink, ActionDelayMs250, `BPINT 16`, `BPINT 10 00`, `RUNWATCH`, unchanged cycles. Existing exact-PID debugger helper handles debugger commands only; GameLink handles every guest key/frame/RAM read. No foreground/global input, emulator changes or new instrumentation.

1. Classify the **current input-pane line**, not console scrollback: stopped `I->`/`O->`, running `(Running)`/`(Running/watching)`, otherwise unknown. Preserve the literal matched line and full snapshot. Register-pane RUN is irrelevant. Unknown/conflicting state ends the experiment rather than permitting commands or input based on a guess.
2. At the first actual INT16 stop, before any resume, save a numbered bundle: raw console; CS:IP, SS:SP, AX and flags; GameLink status/frame/1MiB RAM; BDA ring/ticks/video fields; `D <SS>:<SP>` and `C <CS>:<IP>` views using the observed values. Save each helper's exact arguments/status/console. The expected prior stop F000:DA84/AX1100 is a hypothesis to verify, not hardcoded replacement evidence. The stack and full RAM preserve more bytes than the console view alone.
3. Map the live caller from the actual stack/code and loaded bytes. F000:DA84 is a BIOS location, **not an original game-owner identity**. Inspect stack candidate return words against their live RAM code and preceding call/INT instruction; account for the actual interrupt/far-call frame only when bytes establish it. If the caller is DOS/BIOS, identify that and retain further frames without assigning them to START. Map an original resident location only through the observed loaded MZ identity/relocations; map an overlay only through its live descriptor, body bytes and generation evidence. No fixed Rust load-base assumption or historical owner substitution. Missing/ambiguous caller mapping is an explicit evidence gap, not permission to manufacture a frame.
4. The known early AH11 is an enhanced keyboard **status probe**, not a blocking read and not the post-title failure. Once its bundle is complete, resume once with `RUNWATCH`, with zero guest input. Keep both breakpoints armed. Capture subsequent actual stops before resume. Count distinct stop arrivals after a resume, not repeated snapshots of the same paused prompt. AH01/AH11 repeat polling at the same caller is an informative bounded outcome; AH00/AH10 with an empty ring is a read boundary. Neither proves a visible menu.
5. Continue without input toward a captured title only while below the bounds. Permit at most two further resumes of the same startup-poll caller after its first bundle; if these immediately stop at that same probe, finish with `startup polling breakpoint prevents reaching title within this experiment`. Do not silently disable/filter BPINT16 or feed a key. A changed caller/AX/frame is retained as a new boundary, still within the total stop limit. At INT10 AH00 use the existing single F10 step-over/before-after video bundle described above; verify stopped state after stepping.
6. Root must inspect the actual fresh GameLink frame before authorizing the sole title Enter. Queue down/resume/up if paused, or use the existing bounded GameLink press if running, with release evidence. No Enter for the LOADFIX/mount frame or an inferred title. After that one input, capture the first post-title input/video/black boundary and stop; at most two zero-input resumes may distinguish a repeated poll from progress. No later game key.

Hard bounds remain one launch, at most16 actual breakpoint arrivals,60seconds from launch,8seconds after first post-title black frame, one observed-title Enter maximum, and the stricter repeated-startup-poll limit above. All helper calls have finite deadlines within the remaining wall allowance; helper failure ends observation and triggers owned cleanup. Preserve the final paused bundle when available; close only the owned DOSBox process with the existing cleanup route and verify exit/input release. No automated second run.

The receipt must distinguish (a) early startup BIOS probe captured/mapped, (b) title reached without extra input, (c) post-title boundary actually observed, and (d) progress blocked by repeated instrumentation stops. Record absent stages explicitly. A successful early bundle alone is diagnostic progress, not original creation/party or WORLD save/load comparison acceptance.
