# Champions of Krynn improvement loop

This is the current, evidence-backed worklist after the verified representative
CoK route. It deliberately separates a proven retail mechanism from a browser
surface that has not yet reproduced that mechanism continuously.

## Baseline

The selected-folder route already proves retail ECL opening/town/travel blocks,
a natural encounter and resume, Greybox save/reload, DOS/Amiga wall switching,
and companion panels. `tools/goldbox_capabilities.json` records it as
`verified`, but also records the partial capabilities below.

### Automation calibration correction — 2026-07-27

The fixed-count `tools/cok_gamelink_saved_outpost_route.ps1` sequence had been
described as reaching a Throtl/Outpost/caravan progression. A fresh GameLink
run with screenshots at every named checkpoint disproved that assumption: after
the opening acknowledgements it is still at the original camp command screen
(`SAVE / VIEW / MAGIC / REST / ALTER / FIX / EXIT`). Its previously named
`outpost-confirmation`, `overland-east-step`, and `overland-tactical-command`
captures therefore cannot support claims about a fresh wilderness move or
combat. They are retained as raw artifacts only.

The helper now truthfully exposes its deterministic prefix — save-load →
opening → camp command screen — and refuses its old continuation switches until
each intervening screen is asserted. The proof run is
`build/cok-opening-camp-prefix-verify-20260727/`; every input used GameLink and
the owned DOSBox-X process was stopped at completion. The next isolated probes
resolve the camp handoff: the displayed letter `E` is a no-op (frame sequence
and image unchanged in `build/cok-opening-camp-exit-probe-20260727/`), whereas
one `Escape` advances to the original **WHERE DO YOU WISH TO GO?** destination
menu (`INN / HALL / COMMANDANT / ARMOURY / NEXT / LEAVE`) in
`build/cok-opening-camp-escape-probe-20260727/`. This narrows, rather than
invalidates, the separate byte/static evidence for the ECL1#16 map table. The
next native experiment is to select and verify one destination from that menu,
then continue asserting every screen before using the route for Area1 cadence
observations.

**Route recovery update — 2026-07-27.** That next sequence is now partly
recovered: destination `LEAVE` (five right moves from its default followed by
Enter) opens the genuine overland map and its native Outpost `YES / NO` prompt;
selecting `NO` returns to the map command bar (`MOVE / ENCAMP`). This is backed
by the individual GameLink captures in `build/cok-destination-leave-probe-20260727/`
and `build/cok-verified-outpost-decline-20260727/`. The apparent command label
is not enough to infer a keyboard binding: a separate literal `M`, then Right,
probe opens the character/items menu rather than moving the overland cursor
(`build/cok-verified-overland-east-probe-20260727/`). It is therefore not an
east-step observation and cannot establish a clock or encounter cadence. The
next probe must activate the map's visibly selected default command with Enter,
capture that mode, and only then test a direction.

**Map-command calibration update — 2026-07-27.** The default-command probe
settled this safely: Enter on that map bar returns to the original camp menu,
so the default is `ENCAMP`, not `MOVE`
(`build/cok-verified-overland-default-enter-20260727/`). Together with the
literal-`M` negative, this means no input has yet selected the native Move
mode; the first actual cursor-step claim remains open. The immediate next
experiment is one Left input on the displayed `MOVE / ENCAMP` bar, an image
check that `MOVE` is selected, then one Enter in a fresh run. Only after that
mode is visibly established may a directional input be tested.

**First true wilderness step — 2026-07-27.** The full state-verified route now
reaches and exercises that mode:

`opening camp → Escape → destination LEAVE → Outpost NO → Left (MOVE) → Enter → Right`.

The final Right changes the persistent map coordinates from `(1,3)` to `(2,3)`
and opens the native caravan narrative (“AS YOU TOP A RISE, YOU SPOT A CARAVAN
UNDER ATTACK. DRACONIANS HAVE …”). Its same-process Area1 differential changes
the byte at `0x192` from `00` to `0c`; CoAB's confirmed Area1 layout identifies
this as the hour field, so the observed clock display is `12:00`. The minute
digits remain zero, and a single first-step sample cannot distinguish noon
initialization from a repeating time cadence. All examined landmark prerequisite
words (`0x4c26`, `0x4c28`, `0x4c29`, `0x4c37`, `0x4c5c`, `0x4c7d`) remain zero.
The source artifacts and machine-readable trace are in
`build/cok-verified-overland-east-trace-20260727/area1-opening-camp-trace.json`.
This closes the old route-validity gap and establishes the correct browser
input/movement/event ordering; it does not yet establish later movement cadence
or landmark discovery.

**Caravan encounter handoff — 2026-07-27.** The same route has now been
advanced one visible continuation at a time: the caravan page's Enter changes
the bottom line to **A BATTLE BEGINS…**, and one further Enter opens the
original tactical battlefield. The first command bar is `MOVE / VIEW / AIM /
USE / YELL / DONE`; no combat action was sent. The captures are retained in
`build/cok-verified-overland-caravan-ack-20260727/` and
`build/cok-verified-caravan-tactical-probe-20260727/`. This is the correct
native starting state for a later computer-control/resolution observation; it
supersedes the old runner's mislabeled character-sheet "tactical" captures.

**Combat-control correction — 2026-07-27.** The first tactical screen's `DONE`
input does advance to Istan Hordin while showing `GUARD / DELAY / QUIT / AUTO /
SPEED / EXIT`. However, a later local-Qwen screenshot reading of the literal
`A` result identifies the next state as Istan's **AIM** target-selection screen
(`RANGE = 0; AIM: NEXT / PREV / MANUAL / CENTER / EXIT`), not as proven AUTO
control. The earlier interpretation of the bitmap as “KING / GUIDING” and the
claim that AUTO was assigned are retracted. The raw literal-A captures remain
in `build/cok-verified-caravan-auto-one-probe-20260727/`; the 5/10/15-second
observer frames are identical because that AIM state awaits a target/control
choice, not because autonomous combat stalled. The next investigation must
establish the true keyboard/menu selection mechanism for the displayed AUTO
item before using it to resolve the caravan combat.

**Done-menu selection calibration — 2026-07-27.** The manual confirms that
`AUTO` belongs to the Done menu, but an Enter on the initial Done-menu highlight
opens the native **GAME SPEED** submenu (`SLOWER / FASTER / EXIT`) in
`build/cok-verified-caravan-auto-enter-probe-20260727/`. Thus the initial
highlight is `SPEED`, not `AUTO`; the Enter result is not an AUTO assignment.
Because AUTO is immediately to the left of SPEED in the visible row, the next
bounded probe is one Left plus a screenshot, followed by a separate Enter only
if that screenshot verifies AUTO's highlight.

That left-selection probe now verifies the expected highlight on `AUTO` in
`build/cok-verified-caravan-auto-selection-probe-20260727/`; `SPEED` is no
longer highlighted. A fresh-run Enter is therefore the first correctly grounded
AUTO activation experiment.

**Verified AUTO activation — 2026-07-27.** That Enter experiment now succeeds:
after `DONE → Left → Enter`, the original game leaves the Done menu and returns
to Molly's primary tactical bar (`MOVE / VIEW / AIM / USE / YELL / DONE`) in
`build/cok-verified-caravan-auto-activate-20260727/`. This is the correct
post-assignment state—AUTO was applied to the preceding active character and
the game advanced to the next manual party turn. It is distinct from both the
literal-`A` AIM probe and the initial SPEED submenu. A future bulk controller
must re-establish this state on every turn rather than assuming a fixed key
sequence.

**Repeatability correction — 2026-07-27.** A two-member replay of the same
nominal pattern is *not* a second AUTO assignment: its post-first-activation
capture has already returned to the camp menu, and the following `D` opens the
camp Alter/Drop flow. The retained captures in
`build/cok-verified-caravan-auto-repeat2-20260727/` make this clear. Therefore
the one-shot AUTO observation is not yet a repeatable bulk-control recipe.
Future work must classify the live screen after every key (using an OCR/vision
gate or a deterministic memory/control-state signal) before sending another
combat key; fixed-count key sequences are prohibited for this route.

The tracer now has an opt-in `-VisionGate` using local Ollama/Qwen over its
GameLink screenshots. It gates stable contextual labels (`DONE` on the primary
combat row and `SPEED` on the Done row) and writes each model observation beside
the screenshot. Qwen reads the EGA `AUTO` glyph unreliably as “MENU” in the
current local model, so the actual AUTO highlight remains screenshot-verified,
not OCR-verified. This is deliberately a fail-closed *screen identity* rail,
not a substitute for pixel/state evidence.

`tools/analyze_goldbox_menu_pixels.py` now supplies that pixel evidence for the
caravan Done row. It groups the 640×400 EGA glyphs into labels and reports their
ink colours: the default SPEED label at x=352..432 is solid white, while after
one Left the AUTO label at x=272..336 is solid white. The route tracer enforces
that exact AUTO highlight before its AUTO Enter; this is the deterministic
selection gate Qwen's glyph OCR cannot provide.

**Pixel-gated negative control — 2026-07-27.** A live replay reached the camp
menu before the nominal AUTO-selection point; its Left input highlighted camp
`PARTY ORDER`, not combat AUTO. The deterministic AUTO-white assertion failed
and prevented the following Enter (`build/cok-pixel-gated-auto-activate-20260727/`).
This is the intended safety property: no controller may carry a combat action
across an unverified transition, even when OCR is disabled.

**Vision-gated negative control — 2026-07-27.** The first live gated replay
(`build/cok-vision-gated-auto-activate-20260727/`) stopped at exactly the
right boundary. After the fixed `D` input, Qwen read Garin's primary combat row
(`MOVE / VIEW / AIM / USE / CAST / DONE`) rather than the expected Done menu
with `SPEED`; the tracer threw before it could send Left or Enter. This proves
that even the initial `D` cannot be replayed as an unconditional sequence. The
next controller must select its action from the recognized *current* combat
row, not merely gate a sequence designed from a prior frame.

**State-aware single-AUTO controller — 2026-07-27.** The replacement controller
does exactly that for one combatant. `tools/analyze_goldbox_menu_pixels.py` now
recognizes three deterministic bottom-row geometries: the movement prompt
(`MOVE/ATTACK ... DONE`), the primary tactical row, and the Done row. The route
tool's `-AssignVerifiedCaravanAutoStatefully` option captures and classifies
every individual cursor transition, cycles only within a verified row until
the visible `DONE`/`AUTO` label is white, then presses Enter once. It never
uses letter hotkeys or replays a fixed party sequence.

The isolated retail run in `build/cok-stateful-auto-one-r4-20260727/` reached
movement mode, converted it to the primary row, reached the visible AUTO
selection through the gated cursor loop, and captured
`verified-caravan-stateful-auto-activated.png` immediately after the one AUTO
activation. That final frame is a transient combat display without a
selectable recognized bottom row, so the controller deliberately stops there;
it does not guess the next actor's state. This proves a safe one-character
AUTO transition, not bulk AUTO assignment or combat completion. The next
native experiment is a bounded passive observer that waits for a stable next
turn and classifies it before any further input.

**Post-AUTO observer correction — 2026-07-27.** The passive observer now
supersedes the provisional “transient” description above. In the isolated
`build/cok-stateful-auto-observe-15s-20260727/` run, the frame captured
immediately after AUTO and each input-free sample at 3, 6, 9, 12, and 15
seconds is byte-identical (`SHA-256 9e86235a...c348467`) and has the verified
primary-row geometry with `MOVE` selected. Thus AUTO advances to the next
party member's stable primary menu; it does not itself make combat proceed.
The next controller revision may repeat the same gated one-member handoff,
but must continue to classify every turn and stop on victory, a non-combat
screen, or an unknown profile.

**Menu-variant census — 2026-07-27.** The first two-member repeat established
that tactical command labels are actor-dependent, not a single fixed row. In
addition to the six-command primary row, the captured `Sir Strongsword` turn
uses `MOVE / VIEW / AIM / USE / DONE` (five labels, with DONE at x=290..352).
The second actor's secondary menu similarly omits GUARD:
`DELAY / QUIT / AUTO / SPEED / EXIT` (AUTO at x=178..240). These are now
separate pixel profiles, `primary_short` and `done_short`, in
`tools/analyze_goldbox_menu_pixels.py`; the stateful controller derives the
DONE/AUTO span from the profile rather than assuming one menu shape. The
two-member run reached the second actor's Done-menu boundary and stopped before
input when that variant was not yet classified. It must be rerun before any
claim of a second AUTO activation or combat resolution.

## Ordered work

1. **Continuous overland and landmark loop — highest user-facing value.**
   `ECL1.DAX#16` has a byte-proven coordinate table and real destination arms.
   Greybox now renders its retail `BIGPIC1#121` frame as a 38x15 cursor map:
   the player must select **Move** before a direction, exactly as the native
   negative/positive control demonstrates, and each accepted step updates the
   real coordinate words and executes `SearchLocation`. The
   separate ECL1#17 landmark loop at `0x80b5` sets `[0x4c37]`, which unlocks the
   Outpost arm at `(15,11)`. The normal ECL1#17 entry reached by the unavailable
   arm is now live as the Commandant's non-GEO Throtl dialogue; it is distinct
   from that landmark loop. The byte path to `0x80b5` requires host state
   `[0x4c26] == 1`, `[0x4c5c] != 0`, and either the script-maintained visit
   counter `[0x4c28] > 6` or `[0x4c7d] != 0`; `0x4c28` increments at `0x8092`.
   A full scan finds no ECL writer for the other three values, so recover their
   original-runtime source and cadence before implementing a stepper. A fresh
   normal visit does not set even the first `[0x4c29]` landmark bit. Do not
   invent terrain, encounter frequency, or coordinate movement. Acceptance:
   ordinary movement reaches the landmark setter, persists `[0x4c29]`/`[0x4c37]`,
   then reaches ECL2/GEO2#68 without a test-only memory seed.

   `tools/cok_gamelink_saved_outpost_route.ps1` now provides a reproducible
   original-runtime observation leg: shipped slot-A party → retail opening →
   Throtl destination menu → Leave → the real “YOU ARE NEAR AN OUTPOST. DO YOU
   ENTER?” confirmation. It uses GameLink input only, takes bounded RAM
   checkpoints, and does not edit the retail install.
   `tools/analyze_cok_outpost_transition.py` reduces those bounded before/after
   snapshots to changed-byte runs plus changed ASCII resource/UI strings, while
   explicitly keeping physical offsets separate from unproven DGROUP semantics.

   **2026-07-27 persistent-state recovery.** The prerequisite words are now
   known to be durable original-save state, not runtime-only guesses. CoAB's
   source-compatible VM maps every ECL address `0x4b00..0x4eff` into the 0x800
   byte Area1 record as a little-endian word at
   `(0x6a00 + address * 2) & 0xffff`; CoK serializes that Area1 record at byte
   1 of `SAVGAM?.DAT`. The local played save independently reads
   `[0x4c26]=1`, `[0x4c29]=0x1f`, `[0x4c37]=1`, `[0x4c5c]=0xff`,
   `[0x4c7d]=0xff`, and saved world position `(0x4bc3,0x4bc4)=(10,13)`.
   `decodeCoabSavgamaEclMemory()` now exposes that sparse word map; a
   Library-selected CoK folder carries it through the retail opening into the
   travel selector, so existing landmark access is no longer represented by a
   browser-only seed. This does **not** yet establish the movement cadence that
   creates those values in a fresh campaign; recovering that behavior remains
   this item's acceptance criterion.

   A copied, hash-identified cloud-save runtime load was also reproduced in
   `build/cok-cloudsave-load-probe/`: original `START.EXE` loaded its six
   characters from the copied `SAVGAMA.DAT`, then resumed a live dungeon view.
   The capture confirms the words survive the original executable's real load
   path. Its resume is an interior dungeon, not an overland layer, so it must
   not be used as evidence for the missing fresh-movement cadence.

   `tools/locate_coab_area1_in_ram.py` makes the next observation repeatable:
   it byte-matches the complete saved Area1 record inside a bounded GameLink RAM
   dump, then reports physical locations for selected persistent ECL words.
   Against the copied cloud-save resume it found one match at `0x48b50` and
   resolved `[0x4c26]`, `[0x4c29]`, `[0x4c37]`, `[0x4c5c]`, and `[0x4c7d]`.
   It is explicitly read-only and treats that physical location as a per-run
   observation, not a stable DGROUP address.

   The locator now also accepts repeatable `--follow-ram` snapshots.  It reads
   the bounded 0x800-byte record at the one physical address proven by its
   baseline exact match and reports compact changed-byte runs plus the selected
   ECL words.  It never writes a save, dump, or emulator.  This matters because
   the first real wilderness mutation will necessarily stop the complete record
   from matching the original save.  The baseline address is valid only within
   that one DOSBox process; the JSON says so explicitly.

   **Fresh-route landmark negative, corrected 2026-07-27.** A copied fresh
   retail save loaded in original `START.EXE` has its exact Area1 match at
   `0x48b50` and all six candidate landmark words zero. The first older
   before/after capture incorrectly described the entire record as unchanged;
   it did not anchor a full-RAM sample at the actual post-load moment. It is
   superseded by the trace below. What remains true is narrower: neither the
   Throtl route nor the Outpost prompt changes `[0x4c26]`, `[0x4c28]`,
   `[0x4c29]`, `[0x4c37]`, `[0x4c5c]`, or `[0x4c7d]`, so it does not execute
   ECL1#17's landmark-discovery cadence.

   The follow-up mode independently rechecked that conclusion against the
   retained GameLink dumps:

   ```powershell
   python tools/locate_coab_area1_in_ram.py `
     --save build/cok-fresh-runtime-stage/SAVE/SAVGAMA.DAT `
     --ram build/cok-fresh-live-trace/after-load.ram `
     --follow-ram build/cok-fresh-live-trace/outpost-prompt.ram `
     --word 0x4c26 --word 0x4c28 --word 0x4c29 --word 0x4c37 `
     --word 0x4c5c --word 0x4c7d `
     --output build/cok-fresh-live-trace/area1-follow-check.json
   ```

   It reports `same_area1_bytes: true`, no changed runs, and zero for all six
   candidate words.  This is a reproducible negative control for future native
   movement experiments, not evidence that any other route is absent.

   The reproducible Outpost route now has an optional `-TraceArea1` mode for
   the next positive experiment. It captures a full-RAM baseline immediately
   after the original selected save has loaded, then captures every later
   checkpoint and invokes the locator with those snapshots as `--follow-ram`.
   This avoids the invalid "match a mutated record against the old save"
   procedure: only the pre-opening baseline must match; later samples are
   measured at that proven address in the same owned DOSBox process.

   **Native wilderness/map-prompt classification, 2026-07-27.** The new
   `-TraceArea1` run supersedes the manually unanchored capture and proves a
   real engine-mode transition. In a fresh isolated retail session, the
   load-time Area1 record exact-matches at `0x48b50`; the opening's first page
   remains byte-identical. At the Throtl destination menu the original record
   has `[0x4bc3],[0x4bc4]=(1,3)`, `inDungeon` (`[0x4be6]`) `1 -> 0`, matching
   last position `(1,3)` and `LastEclBlockId=17`. The Outpost prompt runs under
   the same zero mode, temporarily records block 16, and its YES story page
   returns to block 17; all six landmark/cadence candidate words remain zero
   throughout. The exact input sequence is opening narration → camping menu
   (`SAVE / VIEW / MAGIC / REST / ALTER / FIX / EXIT`) → Throtl destination
   menu → five-right `LEAVE` → full-screen regional map and `YOU ARE NEAR AN
   OUTPOST. DO YOU ENTER?`.

   Thus the regional image is **not** a free-walk UI (it exposes only modal
   YES/NO at that point), but it is rendered while the original engine is in
   its genuine `WildernessMap` mode. Choosing YES produces one retail story
   page and returns to the same destination menu. The complete, in-process
   full-RAM evidence is `build/cok-outpost-area1-trace-20260727/area1-route-trace.json`;
   its retained screenshots/checkpoints make the exact visible state auditable.
   The remaining acceptance question is no longer whether CoK enters
   wilderness mode: it is which original action advances/accepts map movement
   and thereby changes the six landmark-cadence words.

   **Native cursor-control confirmation, 2026-07-27.** The retail Manual p. 5
   explicitly says that the overland cursor moves with directional controls.
   The new `-DeclineOutpostMoveThenStep` branch of
   `tools/cok_gamelink_saved_outpost_route.ps1` reproduces the missing input
   transition from an isolated game copy: choose `NO` at the first Outpost
   prompt, invoke the map's visible `MOVE` command (`M`), then send Right. The
   before frame is the full 38×15 regional map with the native hollow square at
   `(1,3)`; the full-RAM follow-up proves Area1 coordinates become `(2,3)`, and
   the next native frame is the real caravan-under-attack draconian encounter.
   The companion `-DeclineOutpostAndStep` run proves that Right *without* first
   choosing `MOVE` leaves Area1 unchanged. Artifacts:
   `build/cok-overland-decline-step-20260727/` (negative control) and
   `build/cok-overland-move-step-20260727/` (positive control). This closes
   the input-mode uncertainty. The paired Greybox regression now begins at
   `(1,3)`, invokes Move/East, verifies `(2,3)`, and observes the same retail
   `CARAVAN UNDER ATTACK` text. The prerequisite was preserving ECL's runtime
   string cells (`SAVE` inline `WILD` -> `0x81`) for later `COMPARE` and `PRINT`;
   that engine correction is covered by the real ECL1#16 golden test.

   **Map-event continuation, corrected 2026-07-27.** The same isolated GameLink run can
   use `-AcknowledgeOverlandEncounter` to capture the first legitimate boundary
   after the `(2,3)` illustrated caravan page: the retail `THE BATTLE BEGINS...`
   handoff. It is not yet the command bar. The separately opt-in
   `-EnterTacticalCombat` acknowledgement captures the first actual tactical
   state (`MOVE / VIEW / AIM / USE / DONE`) without issuing a combat command.
   The named checkpoints are respectively `overland-east-combat` and
   `overland-tactical-command`; neither claims a combat outcome. This explains
   why subsequent fresh-map movement is
   still unobserved: it requires a valid combat resolution first, not another
   directional input. Greybox now follows the same branch in its focused
   browser regression through the real cursor event, combat, and `CARAVAN LIES
   IN WASTE` aftermath. The modal can start before a dungeon view exists, so it
   resolves its enemies from retail `MON1CHA.DAX` rather than assuming the
   dungeon-only monster lookup is present.

   **Post-caravan return — delivered 2026-07-27.** A complete native branch
   (all party members set through the retail `DONE → AUTO` command, victory,
   XP, treasure exit, affirmative survivor choices) reaches the Sir
   StrongSword knighthood page and then Throtl's `WHERE DO YOU WISH TO GO?`
   menu. `ECL1#16` ends after the survivor acknowledgement, but its completed
   caravan marker is `[0x4C2D]`; retail then re-enters `ECL1#17`, whose initial
   entry owns the destination menu. Greybox now performs that proven block
   handoff on the terminal caravan branch. The focused browser regression
   covers cursor → caravan → tactical victory → survivor branch → ECL16 EXIT →
   ECL17 Throtl menu (`INN / HALL / COMMANDANT / ARMOURY / NEXT / LEAVE`).

   **Outpost acceptance follow-up, 2026-07-27.** `-EnterOutpost` now records the literal retail
   sequence rather than calling its first post-YES page “playable”: it captures the immediate story
   page (`outpost-entered`) and, after its required acknowledgement, the returned Throtl destination
   menu (`outpost-return-menu`). The script launches from an isolated complete game copy under its
   output directory, because retail CoK persists party/area state while this route advances. This
   confirms that accepting the prompt is presentation plus a menu return; it does not establish a
   walkable wilderness state or execute the clock candidate. A blind fixed run of further ENTER keys
   is not a valid substitute for input-state recognition, so subsequent native automation must
   classify each screen before injecting the next key.

   **Static scheduler anchor, 2026-07-27.** The existing cross-title function
   matcher locates a 165-byte CoK routine at `GAME.OVR+0x2ADA7` (VROOMM
   descriptor 20, relative `+0x549`) with the same relocation-normalized
   instruction signature as CoAB `GAME.OVR+0x2B150` / `ovr021:03FA`.
   CoAB's extracted source names that routine `step_game_time`: it advances a
   selected mixed-radix clock slot and processes timed effects. CoK has six
   statically resolved far-call sites to its counterpart (descriptor 2: one,
   descriptor 8: one, descriptor 14: four), recorded in
   `build/vroomm-call-correlations.json`. This is a strong candidate for the
   scheduler needed by normal travel, but **not yet a recovered CoK semantic
   fact**: the next trace must first byte-validate the loaded descriptor-20
   body, then demonstrate an execution hit while a real non-town/wilderness
   action is taking place, while recording Area1 words and clock state before
   and after. It must not use the Throtl/Outpost menu route already ruled out
   above as a substitute.

   A direct 16-bit disassembly confirms why that match is unusually strong:
   all 67 instructions (including the two internal calls, seven-word snapshot,
   selected-slot increment loop, and seven-word write-back loop) are identical
   between the CoK and CoAB bodies. The only changed bytes are relocated
   far-pointer/call operands. In particular, CoK loads its Area1 base through
   `DS:[0x4B28]` and accesses the seven persisted clock words at ECL addresses
   `0x4BC6..0x4BCC`; CoAB uses the corresponding relocated pointer at
   `DS:[0x4FB2]`. This establishes the exact native state window the runtime
   trace must capture, but does not claim that a particular CoK player action
   has yet been observed reaching it.

   **Native-load confirmation, 2026-07-27.**
   `tools/trace_cok_clock_candidate.ps1` performed the first read-only
   VROOMM calibration against the copied fresh stage. Its artifact
   `build/cok-clock-candidate-trace-20260727/cok-clock-candidate-trace.json`
   resolved descriptor 20 at runtime segment `0x3620`, and a debugger dump at
   `3620:0549` was byte-identical to all 165 staged-retail bytes at
   `GAME.OVR+0x2ADA7`. The bounded 35-second idle window had **zero** entry
   hits. That confirms only the resident-code address, not scheduler execution
   or movement cadence. The packed-EXE debugger path was then corrected to the
   established separate `LOADFIX -32` boot. Its clean second capture
   (`build/cok-clock-candidate-trace-20260727-loadfix32/`) recalibrated the same
   descriptor at run-local segment `0x3E62`, again matched all 165 bytes, and
   again saw zero hits over a 10-second idle window. Thus the idle negative is
   reproducible across two runtime segments; it is not a packed-launch failure.
   A third capture (`build/cok-clock-candidate-retail-route-20260727/`) armed the same
   byte-matched `3E62:0549` target while GameLink replayed the complete retail title → load slot A
   → Begin Adventuring → Throtl Leave → Outpost confirmation route. It polled the debugger after
   every input, captured the real final confirmation image, and recorded **zero target hits** over
   81.912 seconds. This is a stronger negative than idle, but it does not alter the earlier finding:
   the visible Outpost prompt is a menu/dispatch flow, not demonstrated wilderness movement or the
   missing time/landmark cadence. The next trace must drive a genuinely map-moving or encounter-
   checking original state, then arm the freshly calibrated `segment:0549` target and record exact
   clock/Area1 deltas.

   **Loaded-dungeon movement negative, 2026-07-27.** The cloud-save route was corrected to
   leave the loaded party's `PICK CHARACTER` row with Escape, select `BEGIN ADVENTURING` with
   five Down keys, and then make the bounded `right`, `up` input pair in the original first-person
   dungeon. `build/cok-clock-candidate-cloud-dungeon-r4-20260727/route-dungeon-before.png` shows
   the native dungeon viewport and command bar before the pair; the trace keeps the descriptor
   entry byte-identical before and after (`3e62:0549`) but records **zero** candidate-entry hits.
   This rules out neither the CoAB-correlated routine nor normal scheduler use: this one resumed
   interior route is not evidence of overland movement and its second movement image is not a
   stable proof of a successful map step. The probe now copies its supplied save stage into its
   own output directory before launch and records before/after SHA-256 manifests; its validation
   run reports `source_stage_unchanged=true`, so future movement experiments cannot mutate either
   retail files or their input stage.

   **Why the loaded dungeon is not the next scheduler baseline, 2026-07-27.** The enhanced
   probe now byte-locates the exact saved Area1 record in a pre-input GameLink RAM dump and records
   the saved pose (`0x4bc3..0x4bc5`), seven clock words (`0x4bc6..0x4bcc`), and landmark gate words
   before and after input. CoAB's source-compatible `MovePartyForward()` must change pose and call
   `step_game_time` after a completed Forward step. Against the cloud save, extended Up, keypad-8,
   and a sustained 300ms Up pulse (each with a six-second settle window) changed **none** of those
   words and produced zero scheduler hits. The debugger remained in VROOMM's descriptor-read loop
   at `1a56:02a3`, not the command-loop/candidate entry. The apparent first-person frame therefore
   establishes a rendered resume only; it is not a completed, input-ready movement baseline. Do not
   use it to infer CoK's step timing or reject the candidate routine. The next experiment needs an
   original save or legal route that reaches a settled command-loop state, confirmed by a pose-changing
   Forward before the scheduler breakpoint is interpreted.

   `tools/probe_cok_loaded_dungeon_input.ps1` repeats that test without DEBUGBOX, from another
   immutable complete copy of the same stage. Its direct controls (extended Up, keypad-8,
   Right+Up, and the CoAB-source Forward symbol `H`) likewise leave `0x4bc3..0x4bcc` unchanged.
   The non-debugger result rules out the debugger breakpoint as the cause of this particular
   non-response. It is now the required readiness gate for a future CoK save candidate: only a
   stage that produces a measured pose or clock delta may be used for scheduler/landmark tracing.

   **Completed-save command-loop positive — 2026-07-27.** The completed cloud-save stage is the
   first such readiness-positive candidate. An isolated copy loaded at the byte-identifiable Area1
   base `0x48b50`, resumed through the retail `BEGIN ADVENTURING` menu, and presented the genuine
   first-person command bar. Extended `Up` did nothing in that state, but the native keypad-forward
   control (`kp_8`) visibly advanced the corridor and changed the rendered clock from `01:05` to
   `01:06`. The full-RAM before/after comparison at the same process-local Area1 base records exactly
   two byte changes: `Area1+0x18e` (`[0x4bc7]`) `05 -> 06`, and its display mirror at `Area1+0x1e2`
   `05 -> 06`; pose/global landmark words remain unchanged. This is direct retail confirmation that
   a legal normal dungeon forward step costs one minute, matching the existing source-derived
   `Explorer` rule (`stepGameTime(..., SLOT_MINUTE, 1)`). It validates the browser's existing dungeon
   clock behavior, not an overland cursor cadence: the overland map still needs its own native action
   trace before it may advance `clockMinutes`. Artifacts are
   `build/cok-complete-resume-observation-20260727/complete-resume-first.png`,
   `complete-resume-after-kp8.png`, and `complete-resume-area1-trace-r2.json`; inputs used GameLink
   only and the copied source save was never modified.

   The observation is now repeatable through
   `tools/probe_cok_completed_save_step.ps1 -GameDir build/cok-cloudsave-runtime-stage -OutDir <new-output>`.
   It intentionally performs the observed `M`, `Escape`, keypad-8 input handshake, snapshots the
   real command loop and result, and fails unless `[0x4bc7]` advances by exactly one and the source
   `SAVGAMA.DAT` SHA-256 is unchanged. This is a narrow readiness/timing instrument, not a generic
   movement solver or an overland trace.

   **Next discriminating native trace — specified 2026-07-27.** The next experiment is not another
   blind directional sweep. It must extend the already reproduced `Move → East → caravan` route
   through the *existing observed retail* combat-resolution path, using GameLink input only and an
   isolated runtime copy. Capture full Area1 snapshots at these boundaries: (1) selected-save
   baseline, (2) map before `MOVE`, (3) immediately after the East/caravan dispatch, (4) tactical
   combat entry, (5) combat victory/continue, (6) treasure dismissal, (7) the affirmative survivor
   branch, (8) the ECL1#17 Throtl return menu, and (9) the next genuine map re-entry before any new
   directional input. At every snapshot report the pose, seven clock words, and
   `[0x4c26]`, `[0x4c28]`, `[0x4c29]`, `[0x4c37]`, `[0x4c5c]`, `[0x4c7d]` from the one Area1 base
   anchored by the load-time exact match. The retained one-step trace is the negative control:
   it proves that entering cursor mode and dispatching the first caravan do **not** by themselves
   establish the landmark gate. A positive result is the first boundary that changes one of the
   three unlocated gate cells; a fully negative result instead proves that this entire caravan
   branch is not their writer and narrows the next target to a different retail progression path.
   Neither outcome authorizes synthesizing a browser cadence. The tool should classify each visible
   screen before sending the next input, stop on an unknown screen, and preserve the source stage
   hash before/after. This is the minimal experiment because it separates cursor movement, combat,
   and host re-entry—three mechanisms that currently collapse into one unobserved claim.

   **First checkpoint result — 2026-07-27.** The isolated run in
   `build/cok-caravan-cadence-trace-20260727/` completed boundaries 1–4 without
   changing any of the six candidate landmark/cadence words. The map's `MOVE →
   East` changed only the position `(1,3) → (2,3)` in this selected-word set and
   set the persisted **hour** field (`[0x4bc9]`, Area1+0x192) to `12`; the same
   value remained at both the `THE BATTLE BEGINS...` handoff and the first
   command-bar frame. The baseline Area1 record exact-matched at physical
   `0x48b50`; the command-bar report deliberately uses that caller-supplied
   in-process address and labels its weaker comparison boundary. The next key
   was intentionally not guessed: `D` reached the retail command menu, while
   `A` entered its aim sub-menu rather than establishing the formerly assumed
   auto path. The owned DOSBox-X process was stopped after that classified
   boundary. This is a useful negative: ordinary cursor movement and combat
   entry do not write the missing gate state; only a verified resolution/re-entry
   continuation may now be tested.

   **Complete caravan branch — negative for landmark cadence, 2026-07-27.** The
   corrected isolated run in `build/cok-caravan-auto-setup-r2-20260727/` now
   covers the whole observed branch rather than stopping at tactical entry. The
   original manual resolves the control ambiguity: the first party member starts
   in movement mode and uses `D → D → A` (leave movement mode, open DONE menu,
   select AUTO); subsequent party turns already start at the primary combat menu
   and use `D → A`. The route tool records each state separately and waits for
   the native auto battle—no combat result is synthesized. It then captures
   victory/XP, treasure exit and decline, aftermath, the affirmative survivor
   choice, knighthood, ECL1#17's Throtl menu, and a real Leave→regional-map
   re-entry. At all of those checkpoints `[0x4c26]`, `[0x4c28]`, `[0x4c29]`,
   `[0x4c37]`, `[0x4c5c]`, and `[0x4c7d]` remain zero. The expected caravan
   completion marker `[0x4c2d]` first becomes `1` after the survivor choice;
   position returns `(2,3) → (1,3)` and the clock stays at hour `12`.
   The all-checkpoint caller-supplied-base comparison is
   `complete-caravan-area1.json`; its physical base was originally exact-matched
   at load time and is used only within this owned process. Therefore the full
   caravan/post-combat/re-entry mechanism is **not** the missing landmark-gate
   writer. The next native investigation must target later campaign progression,
   rather than re-running this completed branch or introducing a browser-only
   landmark cadence.

   **Full-corpus gate census — 2026-07-27.**
   `tools/map_gen1_cross_area_flag_reads.py --profile champions-of-krynn` now
   explicitly tracks all four landmark-loop prerequisites; its generated report
   is `cok-landmark-gate-ecl-scan.md`. The complete selected save anchors the
   required later-campaign state: it has `LastEclBlockId=98` (ECL3#98), pose
   `(10,13)`, `[0x4c26]=1`, `[0x4c28]=13`, `[0x4c29]=0x1f`,
   `[0x4c5c]=[0x4c7d]=0xff`. The scan independently confirms the division of
   responsibility: ECL1#16 writes the selector `[0x4c26]` and ECL1#17 increments
   `[0x4c28]`; no decoded `SAVE` reaches either host-owned prerequisite
   `[0x4c5c]` or `[0x4c7d]` anywhere in `ECL1.DAX`, `ECL2.DAX`, or `ECL3.DAX`.
   That rules out an omitted later ECL arm as their setter. The next experiment
   must trace the original host around the completed save's later progression or
   identify its bulk/save-initialization writer; it must not derive those bytes
   from a fabricated browser time counter.

   **Browser clock boundary, 2026-07-27.** The live CoK travel cursor continues
   to update the retail coordinate words and run `ECL1#16`'s `SearchLocation`
   handler, but it no longer adds a generic ten minutes to Greybox's display
   clock per accepted cursor step. A re-read of the retained full-RAM first-step
   trace corrected an earlier label: `[0x4bc9]` is Area1's hour (CoAB `time_hour`),
   and the first `MOVE → East` event changes it from `0` to `12` while the minute
   digits remain zero. That is a real host-state transition, but one cursor/event
   sample cannot distinguish a one-time noon initialization from travel cadence.
   `cok-retail-travel` therefore continues to guard the non-fabrication rule; a
   browser clock update can return only with a native scheduler trace that pins
   the repeated conversion.

   **Resident-Area1 trace boundary — 2026-07-27.** A new GameLink-only DEBUGBOX
   experiment reached the original `LOAD SAVED GAME` menu and confirmed that
   DEBUGBOX F5 is **Run**, not pause; `BPINT 16` is the safe stopped pacing
   anchor. It also disproved two tempting shortcuts. At the pre-load menu,
   `DS:[0x4b28]` was `50f7:0000` and referenced a zero staging buffer, not the
   resident Area1 record. Conversely, `0x48b50`, which exactly matched Area1 in
   an earlier post-load DOSBox session, pointed at unrelated data in a new
   session; watches there stopped in the BIOS keyboard callback and produced
   values inconsistent with `SAVGAMA.DAT`. Therefore physical Area1 bases are
   process-local, and neither observation establishes a landmark writer. The
   next valid native probe must breakpoint the loader's pointer transition (or
   exact-match the resident Area1 in that same process) before arming the three
   landmark watches. The reusable in-progress probe is
   `tools/trace_cok_area1_load_writes.ps1`; its output explicitly records this
   claim boundary and source-stage immutability.

   **Debugger-load calibration negative — 2026-07-27.** The tracer was then
   tightened to replay the normal route's batched `A, Enter` input and to
   full-dump the complete post-load process. Both a `LOADFIX -32` DEBUGBOX
   launch and the normal no-LOADFIX DEBUGBOX launch produced **zero exact
   `SAVGAMA.DAT` Area1 matches** after the watched interaction. The latter did
   not even fire a provisional watch. That is a mechanical invalidation of this
   debugger/`BPINT 16` methodology for load-time writer claims, not negative
   evidence about the game. In contrast, the ordinary GameLink route with its
   new `-StopAfterLoadedParty -KeepOpen` mode does exact-match the completed
   cloud save at `0x48b50` and reports `0x4c26=1`, `0x4c5c=0xff`,
   `0x4c7d=0xff` before any ECL action. Future native work must use a
   non-perturbing instruction-trace mechanism or a save/load differential that
   preserves that exact baseline; do not interpret the current BPM captures.

   **Raw-byte false-lead correction — 2026-07-27.** `ECL1#34` does contain a
   byte-aligned `SAVE #255,[0x4c5c]` at raw offset `0x16d2` / vaddr `0x96D0`.
   It is nevertheless not a recovered setter: no header entry, `ON_GOTO` target,
   or direct `GOTO` operand enters that sequence, whereas the relevant ordinary
   selector begins at `0x96E0`, after it. A previous route note misdescribed the
   adjacent `0x41` byte as an unresolved executable opcode. Retain the full-corpus
   result as the authoritative statement: there is no *statically reachable* ECL
   setter for either prerequisite until native execution proves otherwise.

   **Selected-save resume probe — 2026-07-27.** A browser implementation attempt
   confirmed that `LastEclBlockId` alone is not a safe map-mount key. The completed
   save's `ECL3#98` initial entry only sets sky/rest state and exits; it emits no
   `LOAD_FILES`. Static control flow proves its map-owning predecessor is `ECL3#97`
   (`NEWECL 98` at `0x81C0`), whose initial entry loads `GEO3#97`. However that
   entry requests the wall-piece pair `255,18,17`, while the raw CoK disk-three
   `WALLDEF3.DAX` ids are `10,11,23,13,14,15,17`; this proves the handler must
   inherit the two-set state rather than load a fabricated block 18. **Delivered
   2026-07-27:** `switchGen1Area` now applies that narrow, source-proven ECL3#97
   fallback (`[0x4be7]=[0x4be8]=1` → sets 17/Reset) only after the exact missing-
   block-18 failure. `selectedCokSavedMapTarget` maps the completed save's #98 to
   this verified #97 host when the selected folder supplies the four disk-three
   archives; it carries the original memory and selected `CHRDATA*.SAV` party.
   `library-cok-saved-campaign` proves a Library-selected completed save mounts
   disk 3 / area 97 at `(10,13)`, has both two-set words set, and uses its selected
   hero. Other `LastEclBlockId` values still retain the retail-opening fallback
   until their own map-host relationship is traced; no generic inference is made.

2. **Opening camp handoff — delivered 2026-07-27.** The anchored
   retail trace shows an actual camp command menu (`SAVE / VIEW / MAGIC / REST /
   ALTER / FIX / EXIT`) between the opening narration and the Throtl destination
   menu. Greybox's clean campaign regression currently passes because it proves
   the ECL36→16→17 chain and real Travel selector, but it moves directly from
   dialogue completion to Travel and never exposes that first original camp
   decision. The captured native scene is not an unlocated engine bitmap:
   decoding `PIC1.DAX#59` produces the same campfire, sword, night sky, and
   grass composition visible in `manual-after-space.png`. Reuse that original
   image and the existing command/menu vocabulary rather than inventing
   a new system, but make it an explicit opening-stage screen whose `EXIT`
   continues the native Throtl sequence. This now ships as a source-art 320×200
   compositor screen (`openCokOpeningCamp`): it renders `PIC1#59`, the resident
   frame/font/party panel, native command labels, and only enables `EXIT` (or
   `E`/Escape) to enter the existing retail selector. The focused
   `cok-campaign-continuity` regression asserts the picture id, all seven labels,
   and the Exit-to-travel handoff, both locally and against production. The other
   commands deliberately remain disabled until a native trace establishes their
   scripted effects; Greybox does not substitute generic dungeon camp effects.

3. **Campaign breadth.**
   Turn the existing early, middle, ending, town, travel, and quest ECL evidence
   into clean selected-folder browser/Electron regressions. Each leg must show
   source area, legal input sequence, outcome/resume, and save/reload evidence.

4. **Original save-set bridge.**
   Keep source saves immutable. Map `SAVGAMA` plus character sidecars and any
   STF/SFX state by differential saves, then add copy-only import/export with
   unknown-byte preservation and original-executable acceptance tests. Until
   then, the current 409-byte character-record codec remains explicitly partial.

5. **DOS `MIDI.DAX`.**
   The reusable Unicorn trace now proves that the only later `GAME.OVR` reads
   land at `2891:0000`/`28c1:0000`, and that no emulated CPU write populates
   the zero-filled `4f4a` segment before execution enters it. Identify the
   loader behavior the harness does not reproduce, capture a complete populated
   song buffer, then define a decoder and timing/playback test. The verified
   Amiga audio remains the only shipped music source until that trace produces
   evidence.

6. **Native CoK-on-DQK.**
   Reproduce the now-separate post-wall-bank combat crash under GameLink/debugger
   control, capture the exact routine/state boundary, and fix only the proven
   conversion/runtime mismatch. Then repeat natural combat and persistence.

7. **Fresh gap audit.**
   Re-run route, save, audio, native, visual, and support-evidence gates. Any
   newly found issue becomes a new item with a reproducer and acceptance test;
   no unsupported feature is silently promoted.

## Durable caravan-combat trace worker (2026-07-27)

`tools/cok_caravan_trace.py` is the narrow successor to repeating portions of
the route in fresh shell invocations. It attaches only to an already-owned,
isolated `-KeepOpen` GameLink session; it does not launch an emulator or send
host-window input. Before any optional keypress it records one or more opaque,
atomic screenshots, bounded RAM regions, their SHA-256 digests, the GameLink
frame metadata, and an fsync'd `journal.jsonl`. A requested input is available
only after the current screenshot has passed its declared combat profile,
retail-font label, and selected-index gates. An unknown or mismatched screen
writes a stopped summary and sends no key.

This makes the next resolution experiment resumable and evidence-preserving:
attach at a known menu, use `--expect-profile`, `--expect-label`, and
`--expect-selected-index`, then request at most one `--press`; use the recorded
post-input boundary as the next invocation's input. It deliberately does not
claim that a sample is a combat victory or infer the next control from timing.

**Route false-success correction (2026-07-27).** A live worker exercise caught
an unguarded path in `cok_gamelink_saved_outpost_route.ps1`: its final
`verified-caravan-tactical-command.png` was a `C:\>` prompt, yet the route
printed its historical success message because its only `DONE` assertion was
behind the optional vision flag. The route now requires the deterministic
`movement` menu geometry before it can claim that tactical boundary. The
worker correctly saved a stopped journal and injected no key; this is a route
timing/input failure, not evidence about retail combat resolution.

**Opening-route root cause (2026-07-27).** Inspection of every retained frame
showed the preceding failure: the fixed eight-Enter sequence labelled
`opening-camp-menu` was still a narration page (`PRESS <ENTER>/<RETURN> TO
CONTINUE`), not the camp command bar. On the actual command bar, Escape opens
`QUIT TO DOS  YES  NO`; it is not the destination handoff. The real handoff is
the visible `EXIT` command (`E`), which produces `WHERE DO YOU WISH TO GO?`
with `INN / HALL / COMMANDANT / ARMOURY / NEXT / LEAVE`. Consequently all
historical Escape-to-destination/caravan artifacts after that false boundary
are invalid as native route evidence. The next route revision must wait for the
actual camp row (its unselected retail-font labels include `VIEW`, `MAGIC`,
`REST`, `ALTER`, `FIX`, and `EXIT`, while selected `SAVE` is a solid fill), then
use `EXIT` before any destination navigation.

**AUTO outcome correction (2026-07-27).** The repaired `EXIT → LEAVE →
Outpost NO → MOVE → caravan` route reached the real tactical menu and used the
durable GameLink worker to select `DONE`, then the visible `AUTO` item (Done
row index 3), one asserted transition at a time. The menu did not remain with
the same actor: the pre-Enter frame names **Istan Hordin** with AUTO selected,
while the post-Enter short primary row names **Sir Strongsword**. This is the
next manual party member's turn, so AUTO has already handed off Istan; `QUIT`
is not required and would instead end the current actor's turn. `Manual.pdf`
(printed pp. 11–12) says AUTO turns over *that character* and persists across
subsequent combats. The CoAB oracle independently matches this per-character
model (`coab_extracted/engine/ovr009.cs`: QuickFight sets the current player
flag and dispatches that actor; only flagged players auto-run). The fifteen
seconds of identical samples are therefore expected waiting for Sir's manual
turn, not a failed AUTO. `AssignCokStatefulAuto` again returns the new,
re-classified primary boundary for the next member; it does not send `QUIT`.

**Two-actor AUTO replay (2026-07-27).** The corrected full route completed two
separate actor assignments in
`build/cok-exit-route-auto-two-r3-20260727/`: each actor reached a classified
primary row, visibly selected DONE, reached a classified Done row, visibly
selected AUTO, and entered it once. The second AUTO capture is followed by
five input-free samples at three-second intervals. This proves that the
controller can continue through the next actor rather than treating the first
handoff as an error. It is still not a combat-resolution proof: the retained
session stopped at the next unassigned actor boundary, and the next trace must
assign the remaining party members or recover the manual-control completion
semantics without guessing.

**Six-actor boundary (2026-07-27).** A six-member continuation in
`build/cok-exit-route-auto-six-r2-20260727/` completed two asserted AUTO
handoffs, then stopped before member three when the returned native frame was
not a party command row. Its retail-font labels are `MOVE/ATTACK, MOVE LEFT =
6` for Sir Strongsword: a movement-allocation submode, not evidence of a new
manual actor or a combat result. The current geometry classifier intentionally
does not collapse that five-run row into the six-command tactical movement
profile, and the controller sent no key after it. The next task is to model
this distinct movement submode and establish its legal completion/control
transition from native evidence before continuing the all-party trace.

**All-party autonomous resolution (2026-07-27).** With the movement-allocation
completion rule added, `build/cok-exit-route-auto-six-r3-20260727/` completed
six independently gated AUTO assignments and its thirty-second no-input window
advanced through combat to the retail `CONTINUE BATTLE: YES / NO` prompt. The
captured boundary is retained as
`cok-exit-route-auto-six-r3-move-complete-20260727/auto-movement-active-01.png`;
the remaining party and battlefield are visibly rendered. This is the first
native proof of automatic combat reaching a post-resolution choice. The trace
worker refused to press it because it is not a tactical-menu profile. Next:
add a dedicated, text/selection-gated Continue-Battle classifier, choose the
observed default explicitly once, and trace treasure/aftermath/re-entry rather
than inferring the outcome.

**Victory boundary (2026-07-27).** The Continue-Battle gate was exercised in
`build/cok-exit-route-continue-r1-worker-20260727/`: it verified the selected
`NO` item (index 4), pressed Enter once, and captured the retail result. The
next frame states `THE PARTY HAS WON. EACH CHARACTER RECEIVES 108 EXPERIENCE
POINTS. PRESS <ENTER>/<RETURN> TO CONTINUE`. This is direct native combat
victory evidence, not an inference from the empty battlefield. The worker sent
no subsequent acknowledgement because the victory narration uses a bordered,
full-width text region rather than a menu profile. The next tool increment is
a dedicated narration-text gate before tracing treasure and campaign aftermath.

**Guarding variation (2026-07-27).** A later all-party replay reached a different
valid AUTO boundary after the fifth assignment:
`build/cok-exit-route-victory-r2-20260727/verified-caravan-stateful-member-05-auto-activated.png`
shows the native status `GUARDING` for Baaz. This is neither a manual command
row nor an error; the computer-controlled character has selected Guard and the
engine is awaiting an opponent/turn transition. The controller stopped without
key injection. A future trace must classify Guarding as an input-free wait
state and detect its next screen transition, rather than forcing a sixth AUTO
assignment or applying the victory-narration gate.

**Complete guarded caravan aftermath (2026-07-27).** The repeatable route in
`build/cok-exit-route-guard-r3-20260727/` now passes the former member-four
movement boundary, completes all six independently verified `DONE → AUTO`
assignments, and observes the selected-`NO` `CONTINUE BATTLE` prompt. The
controller records a single Enter, then waits without further input while the
retail engine resolves its pending AUTO/Guard work; it only resumes when a
recognized movement or primary command row appears, and fails closed after
twenty seconds. This repair is exercised in the r3 run (members three through
six completed) and replaces the unsafe 350 ms terminal assertion.

The bounded GameLink workers retain the full native post-combat chain, with a
visual/text precondition before every injected key:

`CONTINUE BATTLE: NO` → 108-XP victory narration → treasure menu `EXIT` →
decline the remaining-treasure prompt → caravan-waste narration → draconian
survivor narration → help the surviving woman → acknowledgement → Sir
Strongsword's tithe-to-the-knighthood narration → `WHERE DO YOU WISH TO GO?`
destination row. The corresponding journals are under
`build/cok-exit-route-guard-r3-*-worker-20260727/`; notably,
`...-victory-worker-...`, `...-treasure-worker-...`,
`...-aftermath-worker-...`, and `...-survivor-choice-worker-...`. This is
direct retail evidence of the complete non-looting, affirmative survivor
branch, not an inference from later map state. The destination menu is retained
without selecting a new campaign route.

**Post-combat deterministic command profiles (2026-07-28).** The trace worker
now exposes `--top`, `--bottom`, and `--glyph-top`, so it can inspect the true
post-combat command band (`384..400`) rather than combining it with the teal
panel frame. `analyze_goldbox_menu_pixels.py` has verified fixed geometries for
the five-item treasure row (`VIEW / TAKE / POOL / SHARE / EXIT`), the two-item
`YES / NO` row, and the six-item destination row. The selected label is
intentionally represented by its solid-white geometry: it cannot be retail-font
decoded, while the unselected labels must still decode exactly. The yes/no
shape is deliberately semantic-neutral; a worker must combine it with an
independent narration-text precondition (for example `TREASURE LEFT` or
`DO YOU HELP`) before choosing a key. Fixture checks use the r3 captures but
the committed unit test uses synthetic spans, keeping volatile runtime output
out of version control.

**Browser aftermath parity audit (2026-07-28).** The focused browser route
already proves the ECL16 caravan handoff returns to the real Throtl destination
menu, but it previously masked a native branch: it took all treasure before
calling `Exit`. Retail instead asks whether to claim loot that remains. The web
combat overlay now preserves that decision as an explicit `YES / NO` state;
choosing `NO` leaves gold and items untouched and only then returns to the ECL
runner. The regression exercises this non-looting path.

The audit also identifies the remaining larger browser fidelity tasks, which
must not be represented as already complete: render retail `CONTINUE BATTLE`
and the dedicated 108-XP page before treasure; replace generic `Take All /
Money / Items / Exit` commands with the retail `VIEW / TAKE / POOL / SHARE /
EXIT` model; pass CoK's native pictures/HUD through the aftermath dialogue
host; and replace the broad affirmative-choice loop with named assertions for
the draconian, survivor, acknowledgement, tithe, pose/clock, and ECL17
boundaries.

**Browser Continue-Battle/victory boundary (2026-07-28).** The browser combat
host now holds a won CoK combat at a dedicated `CONTINUE BATTLE: YES / NO`
state, with `NO` selected by default as in the retained r3 frame. Selecting
`NO` enters a distinct victory acknowledgement state before treasure becomes
available. This prevents the former incorrect direct combat-to-treasure
handoff, and the campaign regression asserts the default selection, positive
XP award, victory transition, acknowledgement, and then the retained
non-looting treasure branch. `YES` is visibly retained but deliberately does
not fabricate another round once native combat has no surviving enemies. The
screen still needs the exact retail victory wording/per-character 108-XP golden
and native art treatment; this change establishes the state boundary, not a
claim that those presentation details are finished.

**Browser aftermath source-art path (2026-07-28).** The retail aftermath
dialogue now uses the existing `DialoguePresentation` compositor rather than a
text-only special case. CoK's `BIGPIC1`, `PIC1`, and `8X8D1` assets are loaded
for the travel host and passed unchanged through the ECL16-to-ECL17 handoff.
The host explicitly restores BIGPIC1#121 when combat resumes without an ECL
`PICTURE` opcode; later opcodes override it normally. The focused route now
proves native canvas output and distinct pixels for BIGPIC1#121 (aftermath),
PIC1#18 (surviving draconian), BIGPIC1#121 (survivor choice/thanks), and
PIC1#58 (Throtl arrival). The native coordinate/time line and a dedicated
tithe narration page remain separately unproven browser presentation details;
the implementation does not hard-code them.

**Browser retail treasure command rows (2026-07-28).** The post-victory browser
screen now derives its command row from the same CoAB `distributeCombatTreasure`
ground-state branches as retail: `VIEW / TAKE / POOL / SHARE / EXIT` while
money remains, no `SHARE` for item-only loot, and `VIEW / POOL / EXIT` when
none remains. `TAKE` opens its category-sensitive `MONEY / ITEMS / EXIT` row
only when both categories remain; a single category is collected directly and
the outer row is freshly derived afterward. `VIEW` now opens the actual emulated party-sheet modal rather than a
status-only placeholder; combat explicitly yields its capture-phase key handler
until that nested sheet closes.

The browser deliberately does **not** mutate ground treasure for `POOL` or
`SHARE`. In the retail code those commands operate on the selected character's
personal purse and the pre-existing pooled-money ledger, while Greybox currently
has only a party-wide gold total. They remain visible and report that missing
state rather than falsely treating either command as `TAKE`. Likewise `DETECT`
is not exposed until the browser models its retail selected caster/spell and
item-identification state. The focused caravan regression proves the retail
five-command row and that `VIEW` reaches a real party sheet before the
existing unclaimed-treasure branch continues; the `TAKE` implementation follows
the same category branch even when that particular retained encounter supplies
only one remaining category.

**Browser caravan victory and return-state golden (2026-07-28).** The retained
GameLink trace proves that this particular ECL1#16 caravan battle reaches the
results page `THE PARTY HAS WON. EACH CHARACTER RECEIVES 108 EXPERIENCE
POINTS. PRESS <ENTER>/<RETURN> TO CONTINUE`. Greybox now presents that exact
route-specific result-page value and Enter boundary, while leaving its generic
combat award mechanics unchanged: the browser does not yet recover the native
monster `per-HP XP × rolled HP` term or exact money/item outcome, so the `108`
golden is explicitly presentation evidence rather than a claim that the generic
calculator regenerated it.

The same native branch proves a route-specific post-survivor state: completion
flag `[4c2d]=1`, world pose `(2,3) → (1,3)`, and unchanged hour/clock across
the ECL16 → ECL17 Throtl return. The focused browser route now asserts all
three carried-memory values and an unchanged clock at the real Throtl menu.
This does not authorize a general overland time cadence; no generic cursor-step
clock increment is introduced.

**Runtime combatant-recovery boundary (2026-07-28).** Generic CoK combat XP
still needs live runtime evidence; the 409-byte `MON*n*CHA` record only has the
verified static HP byte (`0x62`) and static `u16` XP field (`0x130`). The new
`tools/analyze_cok_runtime_players.py` is intentionally a *candidate* finder,
not an offset mapper. Given named monster records and one or more complete
GameLink RAM images, it locates copies sharing 43 independently selected,
stable static bytes, then reports the bytes at the analogous CoAB offsets
`+0x12c`, `+0x13c`, and `+0x13e` without assigning them CoK semantics.

An offline replay on the retained caravan snapshots found four exact BAAZ
CCH-family copies at `0x5b240`, `0x5b3e0`, `0x5d670`, and `0x5d810`, both
before tactical entry and after the first AUTO handoff. All three analogous
CoAB tail bytes are zero in every copy. This rules out treating that **CoAB**
tail as the live CoK XP structure; it does **not** classify the CCH copies as
static/staging or identify the actual CoK XP allocation. The ignored replay
report is `build/cok-runtime-player-candidate-replay-20260728.json`.

**Live AUTO differential (2026-07-28).** The initially reported launch issue
was not a GameLink failure: `dosbox_x_debugbox_probe.ps1`'s minimized-window
`PrintWindow` screenshot is cosmetic, while the GameLink frame/RAM channel
remained healthy. A fresh isolated retail route reached the verified
`MOVE/ATTACK` row, recorded a complete RAM image, and then accepted only a
profile-gated `D` key into the verified primary row. It then navigated, one
selected-index-gated key at a time, to `DONE`, entered the native Done menu,
selected `AUTO`, and captured complete RAM immediately before and after the
AUTO activation. The journal directories are
`build/cok-runtime-live-observer-done-20260728/` and
`build/cok-runtime-live-auto-01-20260728/`.

The live AUTO differential repeats only the CoAB-tail result: the four BAAZ
anchors and their analogous `+0x12c/+0x13c/+0x13e` bytes are unchanged zeros.
CoK's own `GAME.OVR` disassembly separately proves its CCH-family combat
layout has `max HP +0x62`, `control morale +0xe7`, `status +0x188`, `current
HP +0x197`, and `initiative +0x198`. The AUTO handoff had not yet caused a
combat hit, so unchanged BAAZ CCH records are not evidence that they are
staging copies. The next discriminating experiment is a controlled
defeated-enemy transition that compares those CoK-native fields, while keeping
the CoAB XP tail explicitly unmapped.

**Recovered retained hit transition (2026-07-28).** The historical r2 caravan
fixture cannot prove its old routing prefix, but its full GameLink RAM images
are valid combat-state evidence once paired with the independently decoded
ECL1#16 roster. ECL1#16 executes `LOAD MONSTER Id: 1 Copies: 4` immediately
before `COMBAT` (`daxdump_extracted/ECL1_016.txt`, `0x860B..0x8612`); MON1CHA
id 1 is BAAZ. Across `build/cok-caravan-auto-setup-r2-20260727/`, the matching
CCH records are genuinely mutable: `0x5d810` current HP (`+0x197`) changes
`9 → 8` during member-three AUTO, and `0x5b240` changes `9 → 6` during
member-six AUTO. At the retained victory page, the first two records have
current HP zero with status bytes `4` and `5` respectively. The meanings of
those non-6 terminal status values remain unpromoted, but the HP transitions
prove these CCH records participate in this combat.

`analyze_cok_runtime_players.py` now emits `candidate_transitions`, comparing
only CoK-native observed fields for the same named physical record across
snapshots. The remaining XP task is correspondingly narrower: locate the
per-HP and flat award inputs in this proved mutable CCH layout, and account for
any monster-held money/items before using the caravan's 108-XP result to infer
an offset. The ECL itself supplies four BAAZ and no preceding `TREASURE`
opcode, but that alone does not prove the monsters' intrinsic loot contribution
is zero.

For the next native experiment, start the isolated route with `-KeepOpen`,
then capture a guarded, full-RAM observation immediately before a known
tactical action and again after its result:

```powershell
python tools/cok_caravan_trace.py --output build/cok-live-player-pre --label pre \
  --full-ram --expect-profile primary --font 'Champions of Krynn/8X8D1.DAX'
```

The worker uses GameLink read operations only until an explicit, verified
`--press` is supplied. Analyse both images with at least two distinct named
enemy anchors. Promote a CoK runtime field only after a live differential (or
a title-local DS/segment mapping) supports the allocation; do not infer it
from the CoAB layout or from the retained zero-tail copies.

**Debugger-prearm capability (2026-07-28).** `tools/cok_gamelink_saved_outpost_route.ps1`
now accepts repeatable `-DebuggerPreAction` commands and, when supplied, starts CoK through
`DEBUGBOX` rather than the normal direct path. The final command must be `RUN`; ordinary route
input remains GameLink-only. This makes a pre-boot `BPM <segment>:<offset>` watch reproducible
without reintroducing focus-stealing host input. `tools/dosbox_gamelink.py queue-key <key>
down|up` is the matching low-level GameLink primitive for a future BPINT-paced route: it queues
one edge without waiting for a debugger-paused guest to consume it. Both additions pass static
parse/unit checks; neither is yet evidence that an XP-accumulator segment alias is stable across
launches. The next live run must first verify the selected alias in the stopped debugger snapshot,
then retain the `BPLIST` readback, stop snapshot, and same-process RAM dump before claiming a
writer.

**Rejected early-DS XP watch (2026-07-28).** A real DEBUGBOX calibration stopped on the
first reliable loader `INT 21h/AH=42h` with `DS=13EA` (`build/cok-xp-dgroup-calibration-20260728/
post-console.txt`). A second isolated run successfully pre-armed and `BPLIST`-verified
`BPM 13EA:6DEA` before `RUN`, but it did not fire while the saved-game route advanced. Its
later debugger snapshot instead reported `DS=0814` (`build/cok-xp-bpm-prearm-r1-20260728/
post-route-console.txt`). Therefore the loader-stop DS is **not** a valid combat-time alias;
the watch result is a positive rejection of that shortcut, not evidence that the accumulator
is unwritten. The same run also showed that DEBUGBOX's GameLink render buffer remained stale
while injected keys changed guest state, so the image-gated saved-route must not be used as a
DEBUGBOX tracing transport until it has BPINT-paced input plus a live-frame check. The required
next experiment is now dynamic: reach a real combat input stop via `BPINT 16`, read DS there,
arm `BPM <that DS>:6DEA` while genuinely stopped, verify it in `BPLIST`, then resume with
queued GameLink key edges.

**Title-local XP field recovery (2026-07-28).** The required dynamic accumulator watch is
no longer the shortest path to the monster inputs. CoK's own descriptor-5 battle-XP routine,
`GAME.OVR:0x6335` (`calc_battle_exp`), directly reads the mutable CCH records already proved
above: rolled HP is `CCH+0x11B`, flat XP is little-endian `u16 CCH+0x130`, and per-HP XP is
`CCH+0x132`. The BAAZ source record has values `9`, `81`, and `8`, respectively; its native
base contribution is therefore `81 + 8*9 = 153`, or **612** for the caravan's four BAAZ.
`tools/analyze_cok_runtime_players.py` and the browser monster/combat handoff now decode and
carry those exact CoK fields, while keeping the older CoAB-relative bytes comparison-only.

`tools/analyze_cok_battle_xp.py` now makes this retained-evidence check reproducible. On the
pre-combat caravan RAM it finds all four BAAZ at their four established physical addresses,
each with a null `+0x143/+0x145` item link, for an observable 612 base XP. At the retained
victory RAM only the final CCH allocation is still anchor-discoverable (the other defeated
allocations have been reclaimed), so the reporter labels its total **observable** rather than
silently treating 153 as the battle total. Supplying the historical `0x13EA` physical window
shows the seven slots change from all zero to `[0,0,0,0,20,0,0]`, whose tail conversion is 10.
This is useful differential evidence, but not a promoted runtime DS mapping: the contemporaneous
debugger snapshot showed a different DS. A real post-victory debugger stop remains required to
bind that physical window to the loaded XP routine.

**BPINT16 calibration (2026-07-28).** A fresh isolated DEBUGBOX session pre-armed
`BPINT 16 0` while stopped and then ran the existing saved-party route. Its final console
snapshot (`build/cok-xp-bpint16-calibration-20260728/post-route-console.txt`) is a genuine
blocking keyboard-read stop, not a loader `lseek`: `CS:IP=1186:031D` is `int 16h`, and
`DS=13EA`. This independently shows that the historical `13EA` physical window is present
at a later interactive stop; it does **not** by itself bind the window to post-combat code or
prove its seven slots are the XP pool.

The run also directly exposed why the current saved-route cannot be used with BPINT16 as-is:
it issued its normal GameLink inputs without polling/resuming the debugger between keys. The
guest stayed halted at the first blocking read while GameLink accepted queued edges; every
render checkpoint retained sequence 113. Therefore the next route must have an explicit
per-key contract: wait for a stopped BPINT16 state, inspect/register it, queue one GameLink
edge, issue debugger `RUN`, wait for the next stopped state, and only then decide the next
input. It must reject unchanged GameLink frame sequence numbers rather than treating them as
visible progression. This is a transport/tooling requirement, not an XP-field claim.

`tools/cok_debugger_paced_input.py` now provides one such edge for an already-owned,
pre-armed DEBUGBOX process. It releases its GameLink key in a `finally` path even if the
debugger fails or the next stop times out, records before/after screenshots and registers,
and accepts `--require-frame-change` to turn the sequence check into a hard failure after
the evidence is written. This is deliberately not yet a full caravan route: it has no
authority to choose a screen transition from a stale DEBUGBOX render buffer. A complete
route must first demonstrate a successful required-frame-change edge at a known native
input stop, then add only separately validated screen/input steps.

**Running-input bootstrap calibration (2026-07-28).** The first title acknowledgement
cannot wait for an AH=00 breakpoint: CoK polls before it invokes the blocking read, so
no-input startup remains running. The isolated no-LOADFIX DEBUGBOX run in
`build/cok-debugger-running-title-calibration-r4-20260728/` therefore sent exactly one
ordinary GameLink `Enter` while the CPU was running and then polled the owned debugger.
It reached a real next `BPINT 16 0` stop at `CS:IP=1186:031D`, whose code is `CD 16`
(`int 16`) with `EAX=00000000` and `DS=13EA`. This proves the narrow input/stop transport;
it does *not* prove a visual transition. Both saved GameLink frames remain sequence `113`
and have SHA-256 `e44902cf1841f88025a9caadbbef4ef0268aa3922fb948d9243173af2e586d0f`.
Consequently, `--require-frame-change` correctly rejects this run, and no DEBUGBOX route
may use its GameLink screenshot as a screen-state assertion until a separate renderer fix
or a defensible guest-display-memory gate is verified.

**Chained-edge and route boundary (2026-07-28).** The follow-up
`build/cok-debugger-chained-edge-calibration-r5-20260728/` proved that the bootstrap can
chain into the stopped-guest transport: the queued `Down` was consumed and the next stop
again occurred at `1186:031D`; its GameLink sequence changed `113 → 115` and its screenshot
hash changed from `e449…6d0f` to `91ee…e206` (the latter visibly renders the CoK title).
This validates the two worker modes as input transport, not the complete saved-game route.

The first bounded integration run deliberately stopped at a non-advancing slot-confirmation
edge (`build/cok-paced-debugger-loaded-party-r6-20260728/`), and the corrected explicit-title
prefix reached the later `A` selector before the same guarded rejection
(`build/cok-paced-debugger-loaded-party-r8-20260728/`). The immediately preceding function
menu remained the captured image, so the debugger presentation lags the logical input boundary
by at least one state there. `tools/cok_gamelink_saved_outpost_route.ps1 -PacedDebuggerInput`
therefore remains a *safe diagnostic route*. Its r8 `A` edge also establishes an important
qualification: the guest stack changed (`ESP 3A38 → 35DE`) while the frame stayed fixed.
The route now requires **progress** after bootstrap—either a new GameLink frame *or* changed
stopped-debugger registers—and retains both facts in every result. A frame-only assertion
remains mandatory whenever the route is about to classify visible text or pixels. The next
implementation task is a title/menu settle primitive with independently verified guest state
(or video-memory rendering), then re-run its `-StopAfterLoadedParty` acceptance route before
allowing any caravan/XPath trace to rely on it.

**One-anchor free-run boundary (2026-07-28).** The Pool-native strategy was also
tested for CoK: confirm one `BPINT 16 0` stop, delete it while halted, resume, and
use GameLink-only input with BIOS keyboard-ring (`0x41A`) before/after/settled evidence.
The transport is positive: `build/cok-freerun-after-bpint-loaded-party-r10-20260728/`
recorded all five menu keys as delivered. It is not yet a valid CoK save-route transport.
That run's claimed checkpoint was actually the three-member inn/demo state; r11 added a
required full Area1 exact match and correctly rejected it (zero matches). r12 added visual
function-menu and `LOAD WHICH GAME?` gates, and proved the deeper issue: after the calibration
key, the free-running DEBUGBOX session progresses into the built-in demo rather than the
function menu. Twelve one-second function-menu observations all failed, ending at the demo inn.

`-FreeRunAfterInitialBpint` is consequently retained only as a guarded delivery diagnostic:
it records the initial real input stop, deletes the breakpoint exactly once, writes BIOS-ring
delivery JSONL for each later GameLink key, and requires both visual/load-state gates plus an
exact Area1 match for `-StopAfterLoadedParty`. It must not be used as evidence for a CoK caravan
or XP trace until a debugger-compatible way to select the intended save is found. The ordinary
direct GameLink saved route remains the only verified source for that retail save path.

**Free-run saved-party acceptance (2026-07-28).** That save-selection blocker is now resolved.
`build/cok-freerun-esc-bpint-loaded-party-r15-20260728/` uses `Escape` for its one
running bootstrap key, deletes BPINT while stopped, and takes one more BIOS-verified Escape
only after the function-menu screenshot gate fails. The second screenshot is the deterministic
function menu; the subsequent two Down/Enter keys reach the separately asserted `LOAD WHICH
GAME?` prompt, and `A`/Enter loads the shipped slot. All six free-running keys have a changed
BIOS ring-buffer observation. Its full same-process dump has exactly one `SAVGAMA.DAT` Area1
match at `0x48b50`, with the expected untouched state words, and its visible six-member party
matches the established direct route. This proves `-FreeRunAfterInitialBpint` through the
loaded-party baseline.

The narrow claim remains important: this run cannot later re-arm a debugger breakpoint in the
same free-running DEBUGBOX process. It is now a valid native **route/differential** transport;
post-combat DS or accumulator watches still require a separately designed debugger session.

**Loaded-party command-mode correction (2026-07-28).** The accepted Area1 anchor is not
itself the function menu. `build/cok-freerun-loaded-party-escape-probe-r19-20260728/`
records its initial bottom row as `PICK CHARACTER / SELECT / EXIT`; one native Escape changes
it to `CHOOSE A FUNCTION` with `MODIFY CHARACTER` highlighted. The fresh, single-edge cursor
probe in `build/cok-freerun-function-menu-cursor-probe-r20-20260728/` then shows the exact
retail progression from that starting selection: View (one Down), Add (two), Remove (three),
Save Current Game (four), and Begin Adventuring (five). The earlier direct five-Down/Enter
route omitted that required Escape and could enter a character-modification flow instead of the
opening sequence; its `opening-first-page` capture is therefore not evidence about narration
acknowledgements. `cok_gamelink_saved_outpost_route.ps1` now performs and gates the Escape,
then sends the five Down edges separately before Enter. Literal `B` remains a tested no-op in
this state (`build/cok-freerun-function-menu-b-accelerator-r21-20260728/`).

The repaired free-run route was replayed through the original camp and caravan boundary in
`build/cok-freerun-caravan-background-r27-20260728/run/`. It records the camp EXIT,
five-right LEAVE destination, Outpost NO, MOVE activation, the east caravan encounter and
the native tactical command screen. Its first-party-member controller also reached the
pixel-gated Done → AUTO selection, activated it, and retained five passive 3-second frames.
This is a route validation only: one AUTO assignment is not a completed battle, and no
post-victory DS/XP accumulator inference is made from these free-running captures.

**Second-round AUTO boundary (2026-07-28).** The controller now treats its count as party
turns rather than one six-member round and passively waits before it permits the next classified
turn. `build/cok-freerun-caravan-turn-wait-r29-20260728/run/` proves six separate, pixel-gated
AUTO handoffs. It then leaves one Baaz at 3 HP and records twenty two-second samples of the
command-less combat frame (`verified-caravan-stateful-member-07-await-turn-01..20.png`).
That initially looked like an unresolved enemy phase, but inspection of the retained final frame
identified the distinct native `CONTINUE BATTLE: YES / NO` profile, with **NO** selected. It is
not a seventh party turn and must not be fed a tactical key.

**Natural Continue-Battle and XP capture (2026-07-28).** The controller now recognizes that
profile separately and preserves it without acknowledgement. A fresh direct, kept-open retail
run (`build/cok-direct-continue-boundary-r32-20260728/run/`) stopped at the profile after the
last movement-completion wait. Its same-process pre-key RAM dump has all four BAAZ allocations
at 0 HP, each with the proven 153 base XP, for 612 observable base XP. The selected-`NO`
geometry gate then permitted exactly one GameLink Enter; the next captured native screen says
`THE PARTY HAS WON. EACH CHARACTER RECEIVES 108 EXPERIENCE POINTS.` The immediate post-page
RAM dump no longer contains those CCH allocations, exactly as expected from deallocation. The
reproducible raw report is `battle-xp-report.json` beside the captures. This closes the
combat-navigation gap; it does not identify the 216-XP pooled-money tail, because a same-process
post-victory debugger segment was intentionally not guessed or attached during the direct run.

**Post-victory debugger transport negative (2026-07-28).** A direct kept-open replay cannot
be retrofitted with the debugger helper: `AttachConsole` fails because the direct launch has no
DEBUGBOX console. The corresponding free-running DEBUGBOX replay reached the same Continue-Battle
boundary, but its earlier one-anchor setup had deleted all breakpoints. The single bounded late
re-arm diagnostic in
`build/cok-freerun-postvictory-debugger-r34-20260728/run/late-rearm-diagnostic/` first proved
the owned console attachable, then issued exactly one `BPINT 16 0`, one `BPLIST`, and twenty
200-ms snapshot polls without a GameLink key. The console accepted the command yet remained
`(Running)` throughout; no post-victory `AH=00` / `CD 16` stop occurred. This is consistent with
the independently retained Pool re-arm negative. Thus no live DS or pooled-money segment is
claimed from it, and the correct remaining work is a debugger-compatible route that keeps a
reliable stop mechanism armed through the natural battle rather than trying to retrofit one.

The remaining difference to the observed six-member result (`108 * 6 - 612 = 36` per member,
**216 battle XP**) cannot be an item-plus bonus (those are multiples of 400). The same routine
proves that it comes from its post-record money tail unless the party divisor changes: it reads
seven 32-bit pooled slots at `0x6B0C..0x6B2A`, adds them with divisors
`100, 20, 10, 1, 2, 250, 2200`, then separately adds `item.plus * 400` and divides by
`area.party_count - [0x883F]`. The next native capture should therefore record that DGROUP
range at a real post-victory stop (with the runtime DS established at that stop) and compare it
to a pre-combat capture. It must not reopen the rejected loader-DS watch or claim an exact
currency-slot name before the live mapping is observed.

## Current non-goals

Pixel-perfect coverage of every retail screen and exhaustive rules parity are
large follow-on programs, not prerequisites for proving the first continuous
quest leg. They remain visible capability gaps rather than inferred support.
