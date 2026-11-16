# Windowless CoK test frontend

User requested headless tests on2026-10-15. This takes priority over the next WORLD admission build; preserve that isolated candidate. Guest byte budget: **0**. No original assets, guest instructions, native machine ABI, DOS service semantics or dispatch guards change. Astra source plan; Sol implements; Luna owns builds and execution.

Functional windowless acceptance now passes:195 release tests, optimized build,
the16-input KRA save replay, exact saved files, zero observed windows during
the monitored gameplay/drain interval, clean exit and validated publication.
Startup was outside window-monitor coverage; strict long-run guest-state parity
remains open. See [actual acceptance and limits](cok-headless-runtime-acceptance-2026-10-15.md).

## Decision and current seams

Add an explicit windowless mode to the existing `frontend` command. Do not create a hidden HWND or depend on PrintWindow. Current `frontend.rs::run` already owns `StartupSession`, finite `WorkCap`, input enqueue receipts, EGA `Framebuffer`, observations and final publication. Only its `Window::new/poll/control/next_key/present/set_title/dropped_keys` calls require a window. `frontend_win32.c` currently always calls CreateWindowEx and ShowWindow(SW_SHOWNOACTIVATE), and admits physical WM_KEYDOWN. Bypass the entire Window construction in headless mode.

Keep one execution loop and its current session/profile/IRQ/work/input/finalization ordering. A small local enum with `Interactive(Window)` and a bounded file-controlled headless state is sufficient; do not introduce a general presentation framework or a second guest runner. Interactive is the unchanged default. DOSBox tests retain the pinned hidden SDL dummy/GameLink launch and focusless debugger helper; no DOSBox instrumentation or mode change is part of this task.

## Concrete interface and bounded ownership

Use an explicit option pair compatible with the existing frontend option parser, e.g. `--headless-control-dir <fresh-run-directory>`, alongside existing `--evidence`, `--keys`, `--budget`, `--chunk`, `--save-dir`. Require a fresh owned output/control directory; reject collisions before guest execution. Wrapper launches pwsh/native process without visible terminal windows, retaining stdout/stderr and exact arguments.

The same owner thread polls sequential atomically published command files, at most one pending command at a time. Fixed allowed commands: pause, observe/capture, close, and screenshot-bound `key`/`settle` bounded slices. No arbitrary memory/register/write/execute requests. Enforce a small fixed per-command size (e.g.4KiB), fixed sequence/count limit, exact schema, word0..65535, fresh receipt paths and matching most-recent capture identity. Reject malformed, duplicate, stale, extra or out-of-order commands without guest input. Read bounded bytes before parsing; avoid scanning/retaining an unbounded directory or command history.

Start paused in headless mode. The wrapper may explicitly start the same four initial scheduled keys and pause at the approved work boundary. Preserve exact-work scheduling and its no-retry rejection policy. Headless has no physical input source and no Win32 event polling; dropped physical keys are inapplicable, represented truthfully. Every authorized key still passes the existing `machine_enqueue_key` once and gets the same enqueue receipt. All-row expected-input accounting stays mandatory.

Approved bootstrap clarification: initial display may be unsupported and there
is no current frame token at work0. Permit one explicit `bootstrap` command
only before the first advance, with no word or fabricated capture token.
Validate/pin/hash the immutable CLI schedule; only the existing exact-work
scheduler enqueues it. The fixture uses the four reviewed initial keys and
target18.1M clamped to total budget, with every scheduled time<=target.
Complete only after target reached, all scheduled entries consumed and ring
drained. If target occurs first, continue bounded only to satisfy those
conditions and record actual overshoot. Bootstrap has120s, still within the
global900s/resource caps. Early InputWait/fault/cap/deadline or unsupported final
capture yields a truthful incomplete bootstrap and no menu token. Subsequent
commands keep250K/30s. Future full16-event replay needs an explicit finite
target covering its final scheduled input; it must not be silently presented
as the four-key bootstrap. Rejecting `--keys` or demanding dozens of blind
initial settles would break the planned shared scheduler and is not approved.

For a key/settle slice, use the current250K target clamped to the finite total budget and quantum4096. A key slice may end earlier at the **new** InputWait only after the accepted key has been consumed (fresh work greater than enqueue work and empty ring at accepted tail); settle can stop at existing InputWait with zero work. No filler key, retry or busy-spin waiting for250K at InputWait. Pause/capture on completion and record actual start/end work, reason and enqueue counts. Native exact work boundaries can be clamped using existing `yield_at`, but changing historical wrapper overshoot is not evidence of byte-identical timing; record the difference.

Keep60M work,900s global,30s active slice, existing32MiB journal and process/output/disk caps. Idle InputWait/paused command polling sleeps rather than spinning. Expiration, source fault, evidence cap or explicit close enters the existing endpoint/finish/report/journal publication path exactly once. Preserve fault priority and incomplete/cap labels. Wrapper helper/logging failures must preserve partial evidence and bounded owned cleanup. No new independent journal, save format or evidence-publication subsystem.

## Screenshots and evidence

Reuse `Framebuffer::copy_device`: live BDA display state, pure plane peeks, unchanged-latch check, owner-thread serialization. Pixels are already top-to-bottom **BGRA**,320x200. Publish a lossless uncompressed32-bit BMP from those bytes (negative height for top-down rows), plus raw pixel SHA and image-file SHA. This needs no new image dependency or Windows capture API. Existing offline tooling may convert BMP to PNG for viewing; raw pixel identity remains authoritative. Luna must actually open the fresh artifact; never identify a menu from a prior capture.

On unsupported display or capture failure, do not label cached pixels as current. Publish the precise display/error state, withhold a valid current-capture token, and require observation rather than a guessed menu key. Frame receipts include sequence, work, paused/status/fault, current CS:IP, ring head/tail, display parameters, pixel hash, dimensions and encoding. PNG file hashes from prior scaled PrintWindow captures are not expected to equal these BMP hashes; compare original320x200 pixels or existing framebuffer hashes at the same guest state.

Retain existing compact BIOS journal, report, current endpoint catalog/RAM/hash, input/device observations, DOS/save receipts and durable save publication. GUI-independent character-field evidence uses those actual captured RAM/owner records; do not infer candidate fields from screenshots or manufacture successful Save state. Do not force a screenshot every quantum: capture on bounded observations/commands and final state, preserving output limits.

## Narrow source ownership

Sol owns `src/frontend.rs`, one new focused headless-control/capture module and its tests, plus only the necessary module registration. Prefer no change to StartupSession, native C, lifter, Cargo dependencies or Framebuffer semantics. The ignored launcher/mailbox fixture replaces HWND helpers with the bounded file protocol and direct image artifacts. Native build/generation artifacts remain isolated and serialized. Any additional production scope needs source evidence and review first.

## Discriminating Luna gates

1. Parser/state-machine tests: invalid/oversized/out-of-order/stale command, duplicate key, settle-with-word, missing key word, no physical-input path, no retry, InputWait zero-work settle, key-consumption freshness, exact finite work cap, wall/slice timeout and orderly publication. Error paths retain truthful incomplete status.
2. BMP orientation/channel/row tests against known framebuffer colors and a decoded image; capture leaves guest RAM, registers, work, EGA planes/latches unchanged. Failed display cannot issue a current-frame token.
3. Prove zero frontend HWNDs throughout headless lifetime by enumerating the owned PID, and prove the headless branch never constructs Window. No focus/global input calls in runner. Inspect launch/no-console behavior. Build may still link unchanged Win32 code; linking is not window creation.
4. Deterministic parity control: identical finite schedule, exact work stop and durable inputs through the shared loop, headless versus the existing session/control reference. Compare RAM, registers/flags, device state/clocks, decoded BIOS events/order/hash and file bytes. Normalize only expressly host-only publication/capture metadata. Do not claim parity from screenshots alone or from unrelated final work counts.
5. Replay the observed legal KRA creation sequence headlessly with Root reviewing each fresh image before the next unscheduled key. The current interactive discovery reached Save and returned to main menu with KRA.WHO409B and SFX9B; wait for its final receipt before calling it accepted. Reuse exact accepted input values and work schedule where available; if new capture/slice timing differs, identify it and compare the meaningful character/save fields rather than requiring an unexplained whole-RAM match. Validate journal/publication, original root return/main menu, actual KRA save bytes and subsequent cold import. This is creation evidence, not completed WORLD roundtrip.
6. Interactive behavior remains covered by existing tests; any necessary visible runtime smoke is a separately identified exception to the user's headless test preference, not the default. Do not launch a visible window merely to prove the new mode is headless. Existing saved interactive evidence plus shared-loop deterministic controls are the first comparison source.

Completion for this task is a working windowless test fixture with verified images, input/control, same guest mechanisms and clean durable/evidence publication. It does not close M1/M2 automatically or replace original DOS comparison.
