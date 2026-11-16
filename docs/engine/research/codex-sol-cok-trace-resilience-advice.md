# Memo: CoK native caravan-combat trace blocker

Delivery note: no output path was supplied, and the workspace is read-only by instruction and policy. I did not write a repository file; this response is the full memo.

## Conclusion

The blocker is no longer discovering AUTO. The retained evidence establishes `primary → DONE → AUTO`, including the five-item `done_short` variant. The current blocker is the absence of a durable end-to-end state machine: startup and post-combat screens are not classified, frames are not checked for freshness, interrupted runs are not resumable, and current Area1 report assembly silently omits stateful-combat dumps.

A historical run reached victory, treasure, survivor resolution, Throtl, and map re-entry, but it used a now-retracted fixed `D/A` recipe. It is useful as a fixture and expected-state prior—not as an automation recipe.

## Verified facts

- All guest input, screenshots, and memory reads must use GameLink; host input/focus APIs are forbidden by [CLAUDE.md](../../../CLAUDE.md#L300). For strict trace compliance, invoke [dosbox_x_debugbox_probe.ps1](../../../tools/dosbox_x_debugbox_probe.ps1#L153) only with `-GameLink -RunDirect -NoInitialScreenshots`, without `-AutoTypeKey` or `-DebuggerAction`.

- The route correctly isolates the mutable game in its output directory before launch ([route](../../../tools/cok_gamelink_saved_outpost_route.ps1#L187)) and stops only its recorded PID ([route](../../../tools/cok_gamelink_saved_outpost_route.ps1#L569)).

- Startup remains timing-driven: a fixed 40-second wait, menu keys, five batched Downs, and eight unconditional Enter acknowledgements ([route](../../../tools/cok_gamelink_saved_outpost_route.ps1#L317)). Screenshots named as checkpoints are generally not assertions.

- The newest retained attempt demonstrates real prefix drift:

  - `build/cok-stateful-auto-two-r5-20260727/loaded-party-menu.png` (this local generated build artifact is not bundled). is actually the front function menu.
  - `build/cok-stateful-auto-two-r5-20260727/opening-camp-menu.png` (this local generated build artifact is not bundled). is character creation.
  - Its manifest PID is no longer alive, and the directory has no JSONL, transcript, terminal summary, or failure record.
  - The runner cannot resume it because it refuses an existing output directory ([route](../../../tools/cok_gamelink_saved_outpost_route.ps1#L119)).

- The current combat controller classifies movement, primary, short-primary, Done, and short-Done geometry, then navigates to highlighted `DONE` and `AUTO` ([route](../../../tools/cok_gamelink_saved_outpost_route.ps1#L252)). The second-actor fixture is correctly recognized as `done_short`: `build/cok-stateful-auto-two-r4-20260727/verified-caravan-stateful-member-02-done-menu.png` (this local generated build artifact is not bundled)..

- The current controller still uses literal `D` when leaving movement mode ([route](../../../tools/cok_gamelink_saved_outpost_route.ps1#L257)), contradicting the documentation’s claim that it “never uses letter hotkeys” ([cok-improvement-loop.md](cok-improvement-loop.md:170)). That transition has bounded after-state validation, but it should be described as a calibrated state-specific hotkey, not generic cursor navigation.

- The historical complete branch supplies genuine candidate fixtures for victory, treasure, aftermath, survivor choice, knighthood, Throtl return, and map re-entry ([cok-improvement-loop.md](cok-improvement-loop.md:539)). Its Area1 report records completion marker `[0x4c2d]` becoming `1`, position returning from `(2,3)` to `(1,3)`, hour remaining `12`, and all six landmark candidates remaining zero. Those observations must be reproduced, not hard-coded as required results.

## Concrete tooling flaws

| Flaw | Evidence and effect |
|---|---|
| Startup is not fail-closed | No classifier gates the fixed prefix. The latest r5 artifacts were mislabeled and would have received later route keys had execution continued. |
| No durable transition journal | `Press`, `Shot`, and checkpoints produce separate files but no ordered intent/action/result record ([route](../../../tools/cok_gamelink_saved_outpost_route.ps1#L193)). After interruption, it is impossible to determine whether a key was merely intended, consumed, or processed by the guest. |
| Input consumption is not state completion | `_wait_consumed()` only waits for `INPUT_READY` to clear ([dosbox_gamelink.py](../../../tools/dosbox_gamelink.py#L187)). The runner then relies on fixed sleeps instead of a stable classified frame. |
| Singleton ownership race | GameLink uses fixed global object names ([dosbox_gamelink.py](../../../tools/dosbox_gamelink.py#L15)). The route checks for existing DOSBox-X only once before launch ([route](../../../tools/cok_gamelink_saved_outpost_route.ps1#L120)); another process can appear later, and the client cannot associate shared memory with the recorded PID. |
| Stateful RAM files are excluded from the final report | Actual names contain `verified-caravan-stateful-member-XX-*` ([route](../../../tools/cok_gamelink_saved_outpost_route.ps1#L252)), but report assembly searches obsolete names such as `verified-caravan-stateful-done-menu` ([route](../../../tools/cok_gamelink_saved_outpost_route.ps1#L537)). Missing files are silently skipped. |
| Required Area1 fields are incomplete | The requested boundary report requires all clock words `0x4bc6..0x4bcc` and completion marker `0x4c2d` ([research plan](cok-improvement-loop.md:504)); the current locator argument lists omit them ([route](../../../tools/cok_gamelink_saved_outpost_route.ps1#L474)). |
| Pixel classifier is geometry-only | It scans every non-black pixel in a fixed `y=370..399` band ([analyzer](../../../tools/analyze_goldbox_menu_pixels.py#L26)) and recognizes only five hard-coded geometries ([analyzer](../../../tools/analyze_goldbox_menu_pixels.py#L85)). Borders make post-combat screens appear as a single `0..640` run. It also cannot distinguish same-width actor commands such as `YELL` versus `CAST`. |
| Screenshots have transparent alpha | The PNG writer preserves GameLink’s alpha byte ([dosbox_gamelink.py](../../../tools/dosbox_gamelink.py#L300)); inspected retained frames have alpha extrema `(0,0)`. RGB conversion hides this from the pixel analyzer, but alpha-aware viewers may display blank images. |
| Key release is not exception-safe | If consumption times out after key-down, `press()` has no `finally` to clear pressed bits ([dosbox_gamelink.py](../../../tools/dosbox_gamelink.py#L219)). |
| Completion message is misleading | Every route reports “reached verified original opening camp menu,” even after combat work ([route](../../../tools/cok_gamelink_saved_outpost_route.ps1#L567)). |

## Actionable implementation plan

### 1. Make execution interruption-safe

Create one persistent trace worker around the existing GameLink class.

- Acquire a machine-wide GoldBox trace lock before checking or launching DOSBox-X. If another DOSBox-X exists, abort without killing it.
- Record PID, executable path, process start time, output directory, Git commit, arguments, source-save hashes, runtime-copy hashes, and initial GameLink status in `run.json`.
- Keep one GameLink connection open instead of spawning Python for every input.
- Write append-only JSONL records in this order:

  1. Stable pre-action frame metadata and SHA-256.
  2. Classifier result and exact evidence.
  3. Intended key and allowed source state.
  4. GameLink mechanical-consumption result.
  5. Stable post-action frame and classification.
  6. Screenshot/RAM filenames and hashes.

- Flush each JSONL record. Write large screenshot/RAM files under temporary names, then atomically rename them before referencing them in the journal.
- On restart with the same live PID, validate that it is the only DOSBox-X process, matches the manifest, and presents the expected GameLink dimensions/status. Reclassify the current frame; never replay an unconfirmed pending key.
- If the worker or DOSBox process is gone, mark the run `interrupted` and begin a new isolated run. Never reuse a physical Area1 address across processes.
- Always emit a terminal `summary.json` from `finally` and stop only the exact owned PID. A watchdog may stop an orphan only after executable path, start time, PID, and output-directory configuration all match the manifest.

### 2. Replace fixed timing with layered state detection

Use three independent layers:

1. **Transport/ownership:** exact owned PID alive; no foreign DOSBox-X; protocol version, 640×400 frame, and RAM size match the run.

2. **Frame stability:** poll raw GameLink BGRA frames until the relevant ROI hash is identical for two or three samples. After input, require either a new stable classified state or an explicit bounded timeout. Frame sequence alone is insufficient.

3. **Semantic classifier:** return `state`, decoded commands, selected command, active actor, ROI hash, and evidence. Unknown or ambiguous states must stop without input.

Extend the pixel analyzer as follows:

- Detect text baselines automatically or use screen-specific bands. Post-combat commands are cleanly separable at `y=384..399`; the existing `370..399` band includes full-width borders.
- Ignore frame/border rows and require exactly one solid-white selected command.
- Decode fixed EGA glyphs deterministically from the 2× framebuffer rather than relying only on label widths. This handles `CAST/YELL` and unforeseen five-/six-item combinations.
- Treat OCR/Qwen as advisory evidence only.
- Add offline fixtures for front function menu, loaded party, character creation, camp, destination, Outpost prompt, overland command bar, all combat variants, victory, treasure, treasure confirmation, survivor prompt, knighthood, Throtl return, and map re-entry.
- Include the r5 misroute screenshots as mandatory negative controls.

### 3. Advance party turns safely

Drive observed states, not a configured party count:

- `combat_movement`: permit the already observed literal `D` only on this exact classifier result. Capture and require a primary combat row afterward.
- `combat_primary`: move Right one key at a time until decoded `DONE` is uniquely white; bound the loop by the detected command count.
- `combat_done`: move Left/Right one key at a time until decoded `AUTO` is uniquely white; then Enter once.
- After AUTO, send no input until a stable state appears.
- If another primary/movement row appears for a name in the load-time party roster, repeat the gated process.
- If a previously AUTO-assigned actor unexpectedly returns for manual control, stop for calibration rather than assuming AUTO duration.
- During autonomous battle frames with no command row, only observe. Capture on every stable state change and periodically as a heartbeat.
- Stop on an unknown screen, foreign actor, crash-looking frame, transport ownership change, excessive transition count, or passive-combat timeout.

This avoids assuming six living/eligible actors or that every actor exposes the same menu.

### 4. Capture resolution and post-combat without invention

Use retained complete-branch screenshots only as classifier fixtures and transition hypotheses. Live input is permitted only after the exact state is observed:

1. Passively wait for the stable victory/XP page containing `THE PARTY HAS WON` and the Enter continuation. Capture screenshot and full RAM before Enter.
2. At treasure, decode `VIEW / TAKE / POOL / SHARE / EXIT`; navigate to visibly selected `EXIT`, capturing every cursor change, then Enter.
3. At “treasure left” confirmation, navigate from selected `YES` to verified `NO`, then Enter.
4. Capture `THE CARAVAN LIES IN WASTE...`; acknowledge only its verified Enter prompt.
5. Capture the survivor `YES / NO` question. Activate `YES` only when uniquely selected.
6. Capture the thank-you page and Sir StrongSword knighthood page; acknowledge each only when its Enter prompt is decoded.
7. Capture the Throtl destination menu. Navigate to decoded `LEAVE`, Enter, then capture the returned regional map/Outpost prompt.
8. Stop before any new directional input.

At the load baseline and every major boundary, dump RAM through GameLink and report:

- Pose: `0x4bc3`, `0x4bc4`, and applicable facing/mode words.
- All seven clock words: `0x4bc6..0x4bcc`.
- Completion marker: `0x4c2d`.
- Candidate words: `0x4c26`, `0x4c28`, `0x4c29`, `0x4c37`, `0x4c5c`, `0x4c7d`.

Anchor Area1 once by exact load-time save match, then reuse that physical base only in the same process. Record actual changes; do not force the historical values. Do not expose or call GameLink `poke`.

## Local verification gates

These existing fixtures already verify the next classifier extensions without launching DOSBox-X:

```powershell
python tools/analyze_goldbox_menu_pixels.py `
  build/cok-stateful-auto-two-r4-20260727/verified-caravan-stateful-member-02-done-menu.png `
  --expect-cok-combat done_short

python tools/analyze_goldbox_menu_pixels.py `
  build/cok-caravan-auto-setup-r2-20260727/treasure-menu.png `
  --top 384 --bottom 400 --expect-white 0 64

python tools/analyze_goldbox_menu_pixels.py `
  build/cok-caravan-auto-setup-r2-20260727/survivor-question.png `
  --top 384 --bottom 400 --expect-white 0 48
```

Before the live trace, require:

- All retained positive and negative classifier fixtures pass.
- The r5 front-menu/character-creation frames cannot satisfy loaded-party or camp gates.
- GameLink tests cover forced-opaque PNG output, key release after timeout, protocol/status validation, and atomic journal behavior.
- PowerShell parsing succeeds and the Area1 report test proves every member-prefixed RAM file is included.
- Source and runtime hashes are recorded before launch; source hashes remain unchanged afterward.

The final trace is complete only when its terminal summary links every ordered frame, action, classifier decision, RAM dump, Area1 comparison, and source hash through map re-entry, with no unknown-state action or synthesized combat outcome.