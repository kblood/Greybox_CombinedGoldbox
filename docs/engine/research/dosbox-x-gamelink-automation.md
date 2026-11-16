# DOSBox-X Focusless GameLink Automation

> Status: adaptive keyboard input and framebuffer capture proven against the local official
> DOSBox-X 2026.07.02 SDL2 build, 2026-07-15.
>
> Launch-focus correction (2026-09-24): the old GameLink probe created a shown SDL window and only
> requested a minimized process launch. It had no foreground-transition evidence. The probe now
> defaults to a hidden process with child-scoped SDL dummy video/audio drivers, GameLink protocol
> readiness, and no visible-window fallback. This is only a code path; runtime compatibility and
> non-activation still require verification in an isolated Windows desktop/session.
>
> Cross-project runbook and reusable client: `C:\LLM\DOS\DOSBOX-X-AUTOMATION.md` and
> `C:\LLM\DOS\tools\dosbox_gamelink.py`.

## Decision

Do not use Windows `SendInput`, cursor movement, or `SetForegroundWindow` for new original-DOS
automation. DOSBox-X already implements GameLink revision 4, a shared-memory IPC protocol designed
for remote input, framebuffer output, and memory inspection.

Upstream sources:

- `src/gamelink/README.md` in tag `dosbox-x-v2026.07.02` documents fully remote mode.
- `src/gamelink/gamelink.h` defines packed revision-4 frame, input, peek, buffer, and audio records.
- `src/output/output_gamelink.cpp` converts the 256-bit client keyboard state into internal SDL
  mapper events and copies the 32-bit framebuffer to shared memory.
- `AUTOTYPE` and `ADDKEY` are separate built-in options for fixed sequences. `AUTOTYPE` schedules
  mapper events from `AUTOEXEC.BAT`; it is useful for predetermined scripts but is not adaptive.

The official repository is `https://github.com/joncampbell123/dosbox-x`; local source inspection used
the exact `dosbox-x-v2026.07.02` tag under git-ignored `build/tools/`.

## Local Client

`tools/dosbox_gamelink.py` opens:

- mapping `DWD_GAMELINK_MMAP_R4`;
- mutex `DWD_GAMELINK_MUTEX_R4`.

It supports:

```powershell
python tools/dosbox_gamelink.py status
python tools/dosbox_gamelink.py press up up s --pace 0.25
python tools/dosbox_gamelink.py screenshot build/run/frame.png
python tools/dosbox_gamelink.py peek 0x400 0x20
python tools/dosbox_gamelink.py dump-memory build/run/ram.bin --length 0x100000
```

The screenshot command converts GameLink's packed BGRA framebuffer into a standard RGBA PNG using
only the Python standard library. Protocol tests pin the packed offsets and pixel conversion.

DOSBox-X master mode places live `MemBase` immediately after the packed revision-4 core record.
`peek` and `dump-memory` read that appended region directly under the GameLink mutex. The protocol's
separate 16 KiB peek table is profile-oriented and is only serviced during a later video transfer,
so it is not used for immediate dumps of a static screen.

`tools/dosbox_x_debugbox_probe.ps1 -GameLink` emits `output=gamelink` and
`gamelink master=true`. It now defaults to `SDL_VIDEODRIVER=dummy`,
`SDL_AUDIODRIVER=dummy`, and a hidden launch; it waits for a valid GameLink v4 frame and refuses any
visible-window fallback. Guest screenshots use GameLink framebuffer capture. `-ShowGameLinkWindow`
opts back into the old visible/minimized mode. The first test of the dummy-driver path must run in
an isolated Windows desktop/session: neither code inspection nor GameLink input proves that this
DOSBox-X build initializes successfully or leaves foreground state unchanged. `-RunDirect` starts
a guest without the DEBUGBOX entry pause. `tools/probe_gen1_save_load.ps1` uses GameLink by default;
the old host-input path requires explicit `-UseHostInput`.

## Runtime Proof

Proof directory: `build/dosbox-x-gamelink-proof-20260715`.

1. DOSBox-X started at a `Q:` shell without AUTOTYPE or host input.
2. The client reported protocol 4, `FLAG_WANT_KEYB`, program `COMMAND`, and a 720x400 frame.
3. A separate client invocation sent `d i r enter` through the shared key bitmap.
4. Frame sequence advanced from 54 to 79.
5. The shared framebuffer was written to `gamelink-frame.png`.
6. Local `glm-ocr` independently transcribed `Q:\>dir`, the volume header, directory rows, totals,
   and the returned `Q:\>` prompt.
7. The harness stopped only its owned DOSBox-X PID; no process remained.

This historical proof predates the headless launch mode. It proves adaptive guest input and visual
output without host-injected keystrokes, but did not record foreground-window transitions. It does
not prove that DOSBox-X launch avoided activating its SDL window, and it does not prove any Gold Box
route or executable symbol.

## Current Gold Box Boundary

Secret's startup has an illustrated title, a `PLAY GAME` front menu, and then the party menu. The
corrected paced route is two Downs plus Enter from highlighted Create. Three Downs activate
`INITIALIZE MOUSE/JOYSTICK`, disproving the earlier `934bb461...51f` selection claim. Direct `L` is
consumed by the BIOS/game input path, but an unchanged final frame cannot distinguish an immediate
Load return from absent dispatch. Two Downs plus Enter reaches slot A's roster, and `A` plus Enter
loads the untouched party. `tools/run_secret_load_regression.ps1` reproduces the workflow and writes
hashes plus an advisory Ollama report. See `secret-startup-input-trace.md` for evidence hashes,
runtime addresses, and rejected hypotheses.

`tools/dosbox_ollama_agent.py` adds a bounded adaptive loop over the same channel. Each step records
the PNG/hash, raw model response, parsed decision, allowlisted action, frame sequence, and mechanical
feedback in `agent.jsonl`; `summary.json` records its claim boundary. The reusable cross-project
design and safety rules are in `C:\LLM\DOS\OLLAMA-DOS-TEST-AGENTS.md`.

The agent additionally has a narrow **host-side Gold Box menu guard**: a model may describe a
destination (`WHERE DO YOU WISH TO GO?`) or standard encamp menu, but any non-stop action is
rejected before injection. This is essential because model prompt compliance alone is insufficient:
the 2026-07-27 isolated CoK Outpost check showed the model correctly read the destination list yet
still proposed Enter. The harness instead records `host guard: visible destination menu` and stops.
Callers that deliberately choose a menu item must use an explicit deterministic GameLink route;
vision remains suitable only for bounded continuation prompts and observational checkpoints.

Repeated `--checkpoint` arguments now keep one agent attached to one persistent DOSBox process.
When Ollama returns `stop/visible_goal_reached`, the harness records that frame and advances to the
next checkpoint without terminating DOSBox. For Gold Box combat routes, use separate checkpoints for
encounter/reaction, the explicit player combat choice, active full 2D tactical mode, outcome, and ECL
resume. Pixel/model records remain advisory; RAM/debugger evidence must independently prove parser
cursor, loaded overlay, outcome state, and resume execution.

## 2026-07-17: KNOWN HAZARD — GameLink's shared-memory transport is a single global
## singleton, unsafe for concurrent multi-agent use

Discovered while attempting a Gateway save-acquisition session (`gateway-save-acquisition.md`'s
2026-07-17 section has the full narrative). `strings`-scanning the real
`build/tools/dosbox-x-2026.07.02/bin/x64/Release SDL2/dosbox-x.exe` confirms the mapping name
`DWD_GAMELINK_MMAP_R4` and mutex name `DWD_GAMELINK_MUTEX_R4` are **hardcoded literals with no
configurable suffix/instance option** anywhere in this build. Windows named kernel objects with
the same name across processes refer to the **same underlying object**, so when two DOSBox-X
GameLink-master processes run at the same time on one machine, they collide. The binary's own
startup message even anticipates this and proceeds anyway rather than failing:
`"GAMELINK: WARNING: MUTEX \"%s\" already exists, assuming it is left over from a crash."`

**Observed effect:** `tools/dosbox_gamelink.py`'s client has no way to verify which physical
process it is talking to. In the Gateway session, a `screenshot`/`status` call expected to
return Gateway's own state (`program: "GAME"`, 640x400 frame) instead returned a different
concurrent agent's session (`program: "DOSBOX-X"`, 720x400 frame, boot banner mounting an
unrelated worktree path for a Secret of the Silver Blades trace) — with **no error, no warning,
silently**. `Get-Process dosbox-x` corroborated: the launched PID had already exited and was
replaced by two different PIDs from other agents within about 90 seconds.

**Switching from host-input `SendKeys` to GameLink avoids taking focus to deliver guest input, but it
does not, by itself, prove that launching DOSBox-X leaves focus unchanged or make automation safe
for concurrent multi-agent use.** The shared-memory transport still needs one of:

1. A strict project convention that **only one agent runs a GameLink-input-driving DOSBox-X
   session at a time**, machine-wide (e.g. a lock file checked before launch, or a
   `Get-Process dosbox-x` emptiness check immediately before *and* periodically during any
   session, aborting if a foreign PID appears);
2. A client-side ownership check added to `tools/dosbox_gamelink.py` (e.g. cross-referencing the
   shared memory's `program`/`ram_size`/frame dimensions against the specific launched PID's own
   `probe-process.json`, and refusing to act on a mismatch) — not implemented as of this entry;
3. An upstream DOSBox-X patch adding a configurable GameLink object-name suffix (out of scope for
   this project to build, but would be the real fix).

Until one of these exists, treat **any** GameLink-driven trace captured while another agent might
also be running DOSBox-X as **unverified** unless the capturing script independently confirms
process identity (e.g. via a distinguishing boot banner, hash-locked mount path, or resident-byte
check) — frame dimensions and the `program` string alone are cheap, available discriminators to
add to new scripts immediately, even before a real fix lands.

**Second, related hazard — NEVER kill by name.** A concurrent agent that hit a stuck/foreign
`dosbox-x.exe` PID reflexively ran a blanket `Stop-Process -Name dosbox-x`, which (by process
name, not PID) most likely killed a *different* agent's in-flight session too, silently
corrupting or aborting its trace with no attribution. Any cleanup/kill logic in a trace script
**must target the exact PID your own script launched** (`Stop-Process -Id $ourLaunchedPid`),
never `-Name dosbox-x`. If a foreign PID is blocking you, wait it out (see mitigation 1 above)
or ask the orchestrator — do not kill it.

## 2026-07-18: KNOWN HAZARD — GameLink mouse clicks are silently discarded without `mouse_emulation=always`, and DQK's launch menu races a vision-model round-trip against its own idle timer

Found live during the CoK M4 fidelity run (`docs/engine/research/cok-m4-fidelity-plan.md` §7).
Two separate, stackable traps for any future **mouse-driven** GameLink trace (keyboard-only traces
are unaffected):

1. **`[sdl] mouse_emulation` defaults to `locked`.** DOSBox-X only applies GameLink-injected mouse
   motion to the guest's cursor when `user_cursor_locked` is true (`Mouse_CursorMoved()` in
   `src/ints/mouse.cpp`) — a state normally set by a real host click-to-capture into the window,
   which a focusless/minimized GameLink session never performs. Without a fix, every GameLink
   `move`/`click` call is **silently accepted and reports success, but the guest's cursor never
   actually moves** (button-state bits update; position does not) — this is a quiet, hard-to-spot
   failure mode, not an error. **Fix:** launch with `mouse_emulation=always` in the `[sdl]` section
   (forces `MOUSE_EMULATION_ALWAYS`, unconditional `emu = true`).
   `tools/dosbox_x_debugbox_probe.ps1` supports this via `-ExtraSdlConf "mouse_emulation=always"`
   (added 2026-07-18, backward-compatible/opt-in).
2. **Some games' menus race a vision-model round-trip against their own idle/attract-mode timer.**
   DQK's launch menu auto-plays an intro/demo if the player doesn't act within a few seconds; an
   Ollama vision-model screenshot-read call inserted between "confirm we're at the title screen"
   and "click PLAY" reliably eats enough wall-clock time to lose that race, making the click
   appear to silently do nothing (compounding trap #1 if both are present at once — always fix #1
   first, then re-test, before concluding a menu is idle-timer-limited). **Fix:** fire the
   click/keypress sequence as one fast, single process invocation with **zero vision/LLM round-trip
   in the critical window** — screenshot/vision-read only *after* the time-sensitive input has been
   sent. Verify success with real pixel diffing (`PIL.ImageChops.difference(...).getbbox()`), not
   the GameLink frame-sequence number — the sequence number drifts on its own from the guest's own
   animation/attract-mode behavior and is not a reliable "did my input do anything" signal by
   itself.

Both traps were root-caused by reading the real DOSBox-X source
(`build/tools/dosbox-x-source-2026.07.02/src/{gui/sdlmain.cpp,ints/mouse.cpp}`), not guessed —
see `tools/dosbox_x_debugbox_probe.ps1`'s header comment for the exact source citations.

## 2026-07-19: KNOWN HAZARD — a build-driver agent rebuilding a git-ignored `build/*-dqk-release/`
## output directory in place, concurrently with another agent live-verifying that same directory,
## causes a TOCTOU mixup (not a GameLink issue, but the same "two agents, one shared mutable
## target" shape as the singleton hazard above — flagged here so it's found by the same search)

A DoK live-boot-verify round (`docs/engine/HANDOFF.md`'s "DoK.exe first live DOSBox-X" entry,
commit `878a184`) was dispatched in parallel with a wall-art-coverage-fix round (`6443c2f`) that
rebuilt `build/dok-dqk-release/` **in place** partway through. File mtimes proved the live-boot
agent's actual DOSBox-X session (10:53:54–10:55:15) finished **before** the wall-art rebuild
landed on disk (`DQK.EXE`/`8X8DB.TLB`/`GEO.GLB` all mtime 10:59:00) — so the live test genuinely
ran against the stale pre-fix (8/19 wall-art) build. The live-boot agent's own later byte
inspection of `GEO.GLB`/`8X8DB.TLB` (used to self-verify which build it had tested) ran *after*
the rebuild had already landed underneath it, so it read the NEW files and wrongly attributed
them to the EARLIER live session — a good-faith reasoning error from trusting mtime ordering
without also checking wall-clock overlap against the *test's own* recorded screenshot
timestamps. See the correction note in `docs/engine/HANDOFF.md` for the full resolution
(re-run confirmed the same `DISK READ ERROR` reproduces cleanly against the true current build,
so the underlying finding survived — but the self-verification paragraph that shipped alongside
it was wrong and had to be retracted).

**Rule going forward:** a build-driver agent (anything that writes to `build/*-dqk-release/`,
e.g. `tools/build-dqk-dir.mts`) and a live-boot-verify agent (anything that *reads* that same
directory to drive DOSBox-X, e.g. `tools/*-live-boot-verify.ps1`) targeting the **same output
directory** must run **sequentially, never in parallel** — even though this hazard has nothing to
do with the GameLink shared-memory singleton above, it bites in exactly the same "two concurrent
agents, one shared mutable target, no lock" shape. Before starting a live-boot-verify pass,
confirm no other build-driver process (`build-dqk-dir.mts`, or any process with that build's
output path on its command line) is currently running — a `Get-CimInstance Win32_Process` command
line grep, the same technique already used to confirm DOSBox-X exclusivity, works for this too.

## Next Steps

1. Finish Secret's untouched full-save three-Downs-plus-Enter control, then trace the reached read
   caller/availability branch if it remains on the party menu.
2. Generalize route scripts from pre-scheduled global scancodes to adaptive GameLink input.
3. Keep debugger-console commands on the existing process-owned console channel. GameLink handles
   guest input/framebuffer; the debugger helper handles breakpoints, registers, and memory commands.
4. Correlate direct RAM watches with DEBUGBOX `CS:IP`; do not replace byte-matched debugger evidence
   with memory polling alone.
