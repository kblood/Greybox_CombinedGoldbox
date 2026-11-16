# dosbot — automated DOSBox test bots (vision-judged)

Unattended boot/verification harness for the rebuilt DQK-engine executables (the
CoK/DoK-on-DQK builds produced by `tools/build-dqk-dir.mts`). It launches a build under
the bundled DOSBox, captures the SDL render window to PNG, and uses a **local vision model
on the RTX 5090 via Ollama** (`qwen3.5:4b`) to read the screen and judge what state the
game reached — replacing the human who used to watch the boot test (queue item E4.2b-2).

## Why this exists
`E4.2b-2` ("does the retitled `DQK.EXE` actually boot and show the new title under DOS?")
was a genuine human gate: it needs DOSBox + eyes. These bots automate the eyes.

## Requirements
- The bundled DOSBox at `The Dark Queen of Krynn/DOSBOX/DOSBox.exe` (GOG release).
- **Ollama** running locally with `qwen3.5:4b` pulled (`ollama pull qwen3.5:4b`).
  Vision calls hit `http://localhost:11434/api/generate`.
- A build dir under `build/` (git-ignored), e.g. `build/dqk-retitle`, `build/cok-on-dqk`,
  produced by `pnpm tsx tools/build-dqk-dir.mts ...`.
- PowerShell 7 (`pwsh`).

## Run it
```powershell
# The unattended suite — boots each build, polls for the patched title, writes results.md:
pwsh tools/dosbot/run-boot-tests.ps1

# Watch a single build boot, frame-by-frame vision timeline -> report.json:
pwsh tools/dosbot/boot-test.ps1  -MountDir build/dqk-retitle -Label A -Steps 10

# Drive a build with a scripted action list (mouse), e.g. click PLAY then advance:
pwsh tools/dosbot/drive-test.ps1 -MountDir build/cok-on-dqk -Label B-drive `
  -Actions "wait,playbtn,center,center,wait,wait"
```
Output (screenshots + `report.json` / `results.md`) lands in `tools/dosbot/runs/<label>-<ts>/`,
which is **git-ignored** — the PNGs contain copyrighted DQK art.

## Focus And CPU
For native/file-output checks, prefer `native\test.ps1` or the focused
`native\*-test.ps1` scripts. Those use `native\dosbox-smoke.ps1`, which can run
through SDL dummy video/audio and does not need a render window.

`tools/dosbot` is a legacy vision/input harness for the bundled DOSBox. Its
keyboard and mouse helpers activate the DOSBox window, and screenshot capture
can fall back to a foreground screen copy. Every launch or focus-taking action
is blocked by default. To run one intentionally, set the opt-in only in that
PowerShell process:

```powershell
$env:GOLDBOX_ALLOW_DOSBOX_DESKTOP_FOCUS = '1'
pwsh tools/dosbot/boot-test.ps1 -MountDir build/dqk-retitle -Label A
Remove-Item Env:GOLDBOX_ALLOW_DOSBOX_DESKTOP_FOCUS
```

This opt-in permits desktop activation; it does not make these legacy actions
focusless. For new DOSBox-X automation, use `tools/dosbox_gamelink.py` and the
GameLink probe instead. `Capture-DosboxWindow` still permits its non-activating
Windows `PrintWindow` path without the opt-in when given an existing window.
CPU is capped by default with
`cycles=fixed 25000`; override it with
`GOLDBOX_DOSBOX_CYCLES`, or use `inherit` to keep the game config.

For analysis-only work, do not launch DOSBox. `tools/describe_screenshots.py` sends one or more
existing PNGs to local Ollama in a single call and prints text/JSON without taking desktop focus:

```powershell
python tools/describe_screenshots.py build/run/frame_01.png build/run/frame_02.png `
  --output build/run/vision.json
```

Default to `qwen3.5:4b`; step up to `qwen3.5:9b` or `qwen3.6:27b` only when the smaller model misses
detail. Use `glm-ocr:latest` for transcription-only checks. The older `qwen3-vl:8b` is retained
locally but is no longer the default.

For an adaptive focusless test, launch one DOSBox-X GameLink master and run the bounded local agent:

```powershell
python tools/dosbox_ollama_agent.py --output build/agent-run --max-steps 12 `
  --goal "Open LOAD SAVED GAME and stop when the save selection screen is visible"
```

The model receives one framebuffer at a time and may choose only an explicit action allowlist.
Every step persists the PNG, SHA-256, raw response, parsed observation, action, frame-sequence
feedback, and parse errors in `agent.jsonl`; `summary.json` records the goal and claim boundary.
Model observations guide navigation but never replace pixel hashes or debugger/runtime evidence.
The agent also compares consecutive PNG hashes. When an action leaves the framebuffer byte-identical,
that no-progress fact is included explicitly in the next Ollama prompt and the prior action must not
be repeated. Ollama responses use JSON mode with concise observation/reason bounds so a verbose local
vision model cannot strand a run in truncated JSON.

## Files
- `lib.ps1` — primitives: `Start-Dosbox`, `Wait-DosboxWindow` (finds the SDL **render**
  window, not the logging console), `Wait-DosboxOwnedWindow` (supports DEBUGBOX windows),
  `Capture-DosboxWindow`, `Capture-DosboxPrintWindow`, `Send-DosKeys`, `Click-DosWindow`,
  `Click-DosboxMenuItem`, `Send-DosboxHostAltPause`, `ForceFocus`, `Invoke-Vision` (Ollama).
- `boot-test.ps1` — single-build frame-by-frame watcher with a verdict.
- `drive-test.ps1` — action-driven navigator (mouse clicks) with per-step vision.
- `run-boot-tests.ps1` — the unattended suite over all builds → `results.md`.
- `../dosbox_gamelink.py` — focusless GameLink v4 status, adaptive key input, and PNG framebuffer
  capture. See `docs/engine/research/dosbox-x-gamelink-automation.md`.
- `../dosbox_ollama_agent.py` — bounded screenshot/action loop over GameLink with Ollama feedback and
  durable JSONL evidence.

## Findings (the non-obvious bits)
- **DOSBox spawns two top-level windows**: the SDL *render* window (game graphics) and a
  *"DOSBox Status Window"* console. `Process.MainWindowHandle` drifts to the console;
  `Wait-DosboxWindow` enumerates windows and picks the one whose title contains `DOSBox`
  but not `Status`. The render window's title bar also reports `Program: DQK` — a free,
  independent confirmation of which binary is running.
- **DEBUGBOX adds a debugger console** and puts `DEBUGGER` in the render title. Use
  `Wait-DosboxOwnedWindow` rather than the normal render-only selector. The DEBUGBOX launcher
  writes `probe-process.json` with the process id and classified window handles and accepts a
  controlled `-Cycles` value. `Click-DosboxMenuItem` deliberately focuses only once: focusing
  again between the menu-header and menu-item clicks closes the native menu.
- **Input:** mouse clicks land reliably once the window is force-focused
  (`ForceFocus` defeats the background-process `SetForegroundWindow` lock via
  `AttachThreadInput` + a real click). Hardware scancode injection also works for
  the current menu/load-save flows, so `Send-DosKeys`/`Send-DosText` are used
  where the game accepts keyboard input. UI-TARS-style click prediction remains
  useful for screens that are easier to drive by coordinates.
- **The 23-byte title patch changes the MENU string, not the intro.** The patched
  "Champions of Krynn" shows on the front **PLAY/DEMO/QUIT menu**. The boot intro still
  shows "Dark Queen of Krynn" because that title card is *baked art* in the intro sequence,
  not the patched string. The suite polls early/often to catch the menu frame before the
  idle timer auto-launches the intro.
- **Ollama gotcha:** requesting `format="json"` returned an empty response; instead prompt
  for JSON in plain text and regex-extract `{...}`. Qwen 3.5 has built-in vision capability even
  though its model name has no `vl` suffix.

## Result (last suite run)
Both rebuilt executables boot cleanly to the patched **CHAMPIONS OF KRYNN** front menu with
no crash — verified automatically, no human in the loop:

| Test | Build | Title on screen | Reached | Crashed |
|------|-------|-----------------|---------|---------|
| A-retitle | retitle-only (isolates the EXE title patch) | CHAMPIONS OF KRYNN | ✅ | no |
| B-content | full conversion (ported GEO/MON/ECL GLBs) | CHAMPIONS OF KRYNN | ✅ | no |
