# DQK (Gen2) per-cell events — SearchLocation reverse-engineering (C4.1)

How The Dark Queen of Krynn fires per-cell dungeon events, and how it differs from the Gen1
(Champions / Death Knights of Krynn) `SearchLocation` the engine already runs.

## Gen1 recap

In CoK/DoK the area ECL block's 2nd far pointer (`SearchLocation`) dispatches on the **cell
backdrop byte** (`mapWallRoof`, GEO plane-2) at the fixed data address `0x7F79`, via an
`AND mapWallRoof & 63 → ON_GOTO [table]`. Index 0 = the wandering-monster check, other indices =
per-cell event scripts. See `world/dungeonEvents.ts`.

## 2026-07-13 correction — cell-descriptor dispatch, not coordinate dispatch

This note's original C4.1 conclusion that DQK `SearchLocation` dispatches on party coordinates is
superseded. Later `execArith` and descriptor-dispatch work showed that the apparent coordinate
dispatch was an artifact of earlier operand-order bugs and over-broad probes.

Current model:

- DQK `SearchLocation` and `vmRun1` dispatch on host-populated cell descriptor `[0x002d]`, facing
  `[0x0011]`, and area/state bytes such as `[0x001b]`.
- Scratch addresses such as `[0x00bf]` / `[0x00c0]` are reused by scripts and must not be treated as
  authoritative party X/Y dispatch variables.
- Stable descriptor goldens live in `packages/engine/test/dqkEvents.test.ts` and are summarized in
  `docs/engine/research/dqk-vmrun1-cooldown-c4.2b-2b-2c-iii.md`.
- Combat-entry CFG follow-up lives in `docs/engine/research/dqk-combat-entrypoint-cfg-scan.md`.

The section below is retained as historical context for what was shipped in C4.1, but its
"coordinate dispatch" framing is obsolete.

## Historical Gen2 (DQK) C4.1 framing — superseded

DQK does **not** use the Gen1 backdrop scratch byte. The original note said its `SearchLocation`
handlers dispatch on party coordinates and low data addresses. That was wrong for event dispatch,
though area-2 debug/teleporter scripts do use X/Y-style input variables. Read off the old
`ECL.GLB` probe (Gen2 dialect, vbase `0x8000`):

- **Historical claim, now narrowed:** `0xBF` / `0xC0` can be used by debug/teleporter scripts as input
  variables, and `0x1B` is the current area number. They are not the general per-cell dispatch key.
  Two independent lines of evidence:
  1. The **area-2 teleporter** (`WHERE DO YOU WISH TO GO?` / `X POSITION : 0-27`) reads its X/Y
     inputs with `INPUT_NUMBER → 0xBF` then `→ 0xC0`, and the area number into `0x1B`.
  2. A **position sweep**: seeding `{0xBF:x, 0xC0:y, 0x1B:area}` and running the handler through the
     VM changes which event fires. DQK **area 30**:

     | (x,y) | event text |
     |---|---|
     | (0,0) | "A PATROL OF ZOMBIES PASS YOU BY." |
     | (5,5) | "A SMALL CHILD WHISTLES AN ALARM, THEN RUNS INTO ONE OF THE BUILDINGS." |
     | (10,10) | *(nothing)* |
     | (3,12) | "DOGS RUN THROUGH THE STREETS CHASING RATS. YOU DISTURB VULTURES FEEDING." |

  Distinct cells fire distinct events — the dispatch is genuinely coordinate-driven.

- Some areas fire an **area-wide ambient** event regardless of cell (e.g. **area 4** always prints
  "HUGE SHADOWS SKIM OVER THE GROUND. GIANT SHAPES DISAPPEAR OVER THE TREE TOPS."). These are
  flag/area gated, not coordinate gated — both paths run through the same handler.

- The `vmRun1` (1st far pointer, the per-step main loop) of a dungeon area dispatches with
  `COMPARE_AND <posExpr>, <const>, <facing 0x11>, <dir>` chains — i.e. it also branches on facing
  (`0x11`) and a position expression. Fully mapping `vmRun1`'s position packing and the facing code
  is **not yet reversed** (deferred — see below).

## What C4.1 shipped

- `world/dungeonEvents.ts` — `primeSearchLocation`/`dialogueForCell` are now **dialect-aware**
  (`opts.dialect`, default Gen1): the header length and vbase follow the dialect, the Gen1 backdrop
  seeding only happens for the magic-bearing (Gen1) dialect, and a generic `opts.seedMemory`
  pre-seeds arbitrary data addresses. New constants `DQK_PARTY_X_ADDR`/`DQK_PARTY_Y_ADDR`/
  `DQK_AREA_ADDR` + `dqkPositionSeed(x,y,area)`.
- Web `dqkExplore.ts` (`?dqk=1`) — each step runs the area's Gen2 `SearchLocation` for the party's
  live cell and surfaces the event it fires on a per-cell event line (room descriptions, ambient
  text, scripted fights auto-resolved). The DQK dungeon now **plays through the engine**, firing real
  position-dependent events, not just walking.
- Every CoK/DoK Gen1 event golden is unchanged (the default dialect path is byte-identical).

## Open follow-ups (deferred from C4)

## 2026-07-28 authentic saved-session trace — area/member 66 route established

The retail DOS save corpus contains an authentic seven-character `SAVGAMB.QSV` with
`currentModule=66` and `eclMemberId=66` (SHA-256 `66523618…790b9`).  A GameLink-only DOSBox-X
run against a byte-verified scratch copy of the retail game (`DQK.EXE` `6b0a9ac5…1f837`,
`DISK3/ECL.GLB` `40542071…3664d`) now proves a real host route beyond the fresh-start Palace
gate:

1. `Load Saved Game → TDQR → B → Begin Adventuring`, followed by the real randomized journal
   answer, enters the in-game area command UI.
2. One forward input begins the Golden Bell / Dark Queen modal sequence.
3. After the displayed `CREEP / ATTACK / LEAVE` choice, selecting the explicitly displayed
   `ATTACK` option continues the original Dark Queen sequence. It is **not yet a proven tactical
   combat handoff**; the next captured page remains a modal "She frowns…" screen.

This is host provenance for an area-66 encounter route, but not evidence that the browser's direct
`0x8398` Area-66 combat probe is naturally reached, nor evidence for Area 5's member-specific
one-operand `PARLAY`. The bounded artifacts are ignored build outputs under
`build/dqk-auth-oracle-b2-run2/` and `build/dqk-auth-oracle-b2-run4/`.

The reusable `tools/dqk-native-control-route.ps1` now accepts `-SaveSlot B`, preserves the actual
slot name, advances OCR-hidden Return prompts using observed surrounding narrative text, and only
chooses `ATTACK` when the original frame explicitly presents `CREEP ATTACK LEAVE`. The DQK journal
solver also now prefers a rules paragraph that repeats its own heading over table-of-contents
spillover; this fixes the live `Alignment` query (`word #7 = lives`).

### Branch matrix (bounded original runs)

The authentic slot-B sequence is a scripted Dark Queen scene, not an automatically reachable
proof of the browser's area-66 `0x8398` combat probe.  Its observed branches are deliberately
tracked separately by the native harness:

| Original choices | Observed result | Tactical combat evidence? |
| --- | --- | --- |
| `ATTACK` at the first `CREEP / ATTACK / LEAVE` form | Dark Queen modal sequence; party takes repeated 80-point damage and dies. | No — scripted damage/text only. |
| `CREEP → LEFT` | Black-Robed Mage follows; the party reaches a second `CREEP / ATTACK` form. | Not yet. |
| `CREEP → LEFT → CREEP` | Corridor/portal form: `JUMP THROUGH PORTAL / WAIT / ATTACK`. | Not yet. |
| `CREEP → LEFT → CREEP → portal ATTACK` | Same Dark Queen lethal sequence, here with repeated 85-point damage. | No — scripted damage/text only. |
| `CREEP → LEFT → CREEP → portal JUMP` | Raistlin-directed escape sequence: bell/portal narrative, clearing fog, fiery creatures, then the party must distract the Dark Queen. | Not yet — every captured frame is a modal story page, not a tactical command grid. |

`JUMP` has not yet reached a stable explorer or combat boundary; the harness has advanced it
through the observed modal pages only. The parameters
`-EncounterChoice`, `-CreepDirection`, `-FollowupEncounterChoice`, and `-PortalChoice` make
the original choices reproducible without treating a directional key as a form answer.

### Portal `WAIT` continuation

The portal-`WAIT` route reaches `THROW STONE / WAIT / ATTACK`; `THROW STONE` then opens a
party-picker `WHO WILL THROW A STONE? SELECT`. The picker visually highlights Aramnor, but neither
Enter nor a GameLink click on the visible SELECT button advanced it in separate authenticated
runs. A follow-up run corrected a harness defect—GameLink mouse movement is relative, so every
click now first re-anchors at `(-5000,-5000)`—then clicked the visible Aramnor row `(320,72)` and
the visible SELECT control `(450,384)` as separate actions. Both resulting frames were byte-visually
unchanged. One isolated `Down` edge does move the actual roster highlight (Danahir → Grunschka),
which proves a vertical selector; `Enter` and a second corrected SELECT click after that focus move
still leave the form open. The harness therefore records `party_selector_blocked_at_step` and stops
at that form instead of retrying a speculative action. This is a tooling/UI-input research gap, not
a native combat trace or browser behavior claim. The reproducible corrected captures are
`build/dqk-auth-oracle-b2-creep-left-creep-wait-throw-rowclick2/` and
`build/dqk-auth-oracle-b2-creep-left-creep-wait-throw-selectafterdown1/` (ignored because they
contain retail graphics).

Static decoding locates this prompt in the retail **area 67** ECL member (member 47), at `WHO`
opcode virtual address `0x87A7`. Its `ON_GOTO → WHO → GOSUB 0x9854 → IF_NE → GOTO 0x87A7` loop
establishes that an unsuccessful form result re-prompts, but the `WHO` opcode's setup handler does
not itself reveal the generic form callback's accepted confirm input. The next useful native probe
is therefore to trace that callback/INT 16 and INT 33 around one isolated input family, rather than
guess more keys in the high-level route.

The reusable chunked GameLink scanner was also run at the visible picker against the 16-byte retail
`WHO` handler signature from `DQK.EXE` file offset `0x433b0`. It completed a full **16 MiB** scan
with zero matches (`build/dqk-auth-oracle-b2-who-residency8/who-handler-live-scan.json`). Thus the
static `25A4:2FE0` handler is not present as raw EXE bytes in this runtime session; a future code
breakpoint must trace the overlay loader/relocation path, not assume its file-image segment.

The static carve narrows that loader target to one exact RTLink unit: `DQK.EXE:0x433b0` belongs to
**overlay id 8** (`rtlink-ovr06`), whose descriptor has static runtime segment `25A4`, file range
`0x3fd70..0x442c0`, and 1024 relocation entries. It is not merely one of the five `25A4` family
records. The next native trace should observe overlay-8 selection/relocation and then calculate a
live breakpoint for offset `0x2fe0` from the observed segment.

### One-input picker probe harness (2026-07-28)

The picker is now treated as an input-protocol question rather than a combat or explorer result.
Static decode puts the source at `ECL.GLB` area 67/member 47: the `WHO` opcode `0x39` begins at
member offset `0x07A7` / virtual `0x87A7` (the displayed “WHO WILL THROW A STONE?” text begins at
`0x87A8`). Its next control flow is `GOSUB 0x9854; IF_NE; GOTO 0x87A7`, so an unsuccessful result
re-prompts. The opcode dispatch chain is `2033:0F0C → 1D99:128D → 25A4:2FE0`, retail file anchor
`DQK.EXE+0x433B0`; the handler contains no keyboard/mouse interrupt or raw-key comparison, so it
cannot establish the accepted form input by itself.

`tools/dqk-native-control-route.ps1` now accepts `-PickerProbe`. Apart from the retained `Legacy`
diagnostic, it takes exactly **one** candidate in a fresh disposable GameLink-only run, captures
before/after PNG SHA-256 values, requires both a changed frame and disappearance of the WHO prompt
to call `source_advanced`, then terminates. It re-anchors relative GameLink mouse input before a
row/button click and never chains candidates.

The first authentic slot-B run used `-PickerProbe Digit1` after the deterministic
`Creep → Left → Creep → Wait → Throw` route. Its ignored artifact
`build/dqk-auth-oracle-b2-who-digit1/report.json` records the same before/after SHA-256
`E5D740BA64449E320630277456DEC845F38C075D49B5874C9C8555CE573DCAC4`, unchanged WHO text, and
`source_advanced=false`. A separate fresh `Digit2` run reached the same authentic prompt and also
left its before/after frame byte-identical with `source_advanced=false`. Therefore digits `1` and
`2` are bounded negatives, not selector solutions. The next independent candidate is digit `3` in a
new output directory; do not combine it with a later key or click.

**Digit3 result (2026-07-28): another bounded negative.** Fresh ignored artifact
`build/dqk-auth-oracle-b2-who-digit3/report.json` follows the same authentic slot-B path and records
the same before/after SHA-256 `E5D740BA64449E320630277456DEC845F38C075D49B5874C9C8555CE573DCAC4`,
unchanged WHO text, and `source_advanced=false`. Digits `1`, `2`, and `3` are therefore ruled out
independently; this does not establish that later digits share the result. The precise remaining
access blocker is the relocated overlay-8 form callback/confirm convention, not the ECL `WHO`
opcode or an explorer movement path. If code tracing is added, observe the dispatch stub, the overlay-8 handler, and its
form-construction call rather than assuming that another party menu's input convention applies.

During these runs the copy-protection solver also exposed a general bug: punctuation-tolerant
heading normalization had accepted prose ending in `combat.` as the `COMBAT` heading. It now
requires a heading-shaped source line; the real page-9 prompt resolves to `battle`.

Two later authentic slot-B RowClick attempts exposed further extraction variants before they could
reach WHO. `THE MOONS OF KRYNN` has the normal lowercase title connector `of`; retail
`PREPERATION TIPS` is extracted locally as `Preparation lips`. The solver now accepts title-case
connectors and uses a bounded two-edit fallback only after exact lookup fails. New unit cases pin
both local answers (`governed` and `inn`). A third RowClick run passed those protection stages but
exceeded the harness's 240-second timeout before producing `report.json`; it is not a RowClick
result.

**RowClick result (2026-07-28): bounded negative.** The extended, fresh disposable GameLink run
`build/dqk-auth-oracle-b2-who-rowclick-r4-20260728/report.json` completed the authentic slot-B
`Creep → Left → Creep → Wait → Throw` route, solved its randomized protection prompt, and reached
the exact `WHO WILL THROW A STONE? SELECT` form. It re-anchored the relative GameLink cursor and
clicked the visible first roster row at `(320,72)` exactly once. The before/after prompt and
framebuffer were unchanged and `source_advanced=false`. Thus a visible roster-row click alone is
not the form's accepted selection/confirmation action. The next code-level task is now narrowly
defined: trace overlay-8's relocated form callback while isolating one selector movement followed
by one confirm input; do not rerun high-level route guesses or classify this as a combat result.

### Relocated overlay-8 trace (2026-07-28)

`tools/dqk-native-control-route.ps1 -TraceWhoCallback` now keeps the debugger halted at the known
post-`THROW STONE` INT 16 boundary before changing breakpoints. This matters because DOSBox-X
silently ignores debugger breakpoint commands sent while the guest is running. The helper scans
live GameLink RAM for the relocation-safe five-byte prefix `EC 14 B0 01 50` from the retail
`DQK.EXE+0x433B0` handler. The fresh authenticated run
`build/dqk-auth-oracle-b2-who-overlay8-trace-r5-20260728/report.json` found exactly one match at
physical `0x30D70`, and the debugger explicitly accepted `BP 30D7:0000` while halted.

It then supplied the one documented selector/confirmation pair, **Down then Enter**, with no other
WHO candidates. Neither input hit that relocated overlay-8 entry within the three-second bounded
window, and the WHO form remained visible after each. This is stronger than the earlier r4 attempt:
r4's apparent INT16 hits were invalidated because its code breakpoint had been issued while running.
The actual finding is that the ECL `WHO` opcode handler is resident and located, but it is not the
per-input form callback. The next trace target is therefore the generic form dispatcher reached
between INT16 return and the re-prompt—not another `WHO` key/click candidate.

### Resumable WHO dispatcher capture (2026-07-28)

The long authentic route no longer has to fit in one host command window.
`tools/dqk-native-control-route.ps1` now has explicit stages:

```powershell
# Long, authentic prefix. This is the only mode that can deliberately leave its own PID alive.
pwsh tools/dqk-native-control-route.ps1 -MountDir build\dqk-auth-oracle-b2 `
  -OutDir build\dqk-who-handoff -SaveSlot B -EncounterChoice Creep `
  -CreepDirection Left -FollowupEncounterChoice Creep -PortalChoice Wait `
  -StoneChoice Throw -Stage Launch -KeepAlive

# Short follow-up: requires the handoff PID to be the sole DOSBox-X process, captures RAM
# before/after exactly one Down edge, then always stops that exact PID.
pwsh tools/dqk-native-control-route.ps1 -MountDir build\dqk-auth-oracle-b2 `
  -OutDir build\dqk-who-handoff -Stage Attach

# Like Attach, but also breaks at the verified post-INT16 form-dispatcher return, without
# injecting a second game key.
pwsh tools/dqk-native-control-route.ps1 -MountDir build\dqk-auth-oracle-b2 `
  -OutDir build\dqk-who-handoff -Stage Dispatch

# Explicit cleanup if Attach is not run before the handoff age limit.
pwsh tools/dqk-native-control-route.ps1 -MountDir build\dqk-auth-oracle-b2 `
  -OutDir build\dqk-who-handoff -Stage Reap
```

`Launch` refuses to run without `-KeepAlive`; ordinary `Full` runs retain their old
self-reaping behaviour. The handoff contains the owned PID, mount, timestamp, and visible WHO
capture. `Attach` rejects an old handoff, verifies that this PID is the only DOSBox-X instance,
uses GameLink for the sole `Down` input, creates complete before/after RAM checkpoints plus
`who-down-ram-diff.json`, and stops the same PID in `finally`. The checkpoints intentionally use
`tools/goldbox_runtime_probe.py checkpoint`, rather than DEBUGBOX `MEMDUMPBIN`: a visible form can
be waiting for input while DEBUGBOX says `(Running)`, in which state DOSBox-X accepts but does not
execute `MEMDUMPBIN`. DEBUGBOX is reserved for the post-key `BPINT 16` stop and return-stack
evidence.

For host environments with a short command window,
`tools/launch_dqk_who_handoff_task.ps1` starts the same `Launch -KeepAlive` route as a one-shot
Task Scheduler job. Its short task action invokes a generated transient runner because `schtasks
/TR` is limited to 261 characters; the runner contains only the explicit route arguments and
deletes itself when the route exits. It is not a service. The task name is returned for explicit
deletion once it has started.

### First isolated selector delta and return caller (2026-07-28)

The fresh authentic slot-B run `build/dqk-who-handoff-r8-20260728/` reached the visible WHO form
with the documented `Creep → Left → Creep → Wait → Throw` prefix. `Attach` then captured full
0xA0000-byte GameLink RAM images before and after exactly one **Down** edge and reaped PID 34888.
`who-down-ram-diff.json` records **142** changed bytes. This is a successful capture, not yet a
selection-index identification: the diff includes obvious stack-frame churn around physical
`0x4A2xx` and other incidental state, so no changed byte is labelled as the selector.

The same post-Down `BPINT 16` stop is real and recorded by
`who-attach-int16-return-stack.txt` at `08FB:006C` (`INT 16; POP BP; RETF`), with `SS:SP =
3A52:FE46`. The first far return address after the saved BP is little-endian `F8 00 42 1D`, hence
**`1D42:00F8`**. This is the concrete post-INT16 caller/return target that the prior overlay-8
trace lacked. It is evidence of the generic input path, but it does **not** prove that this exact
address writes selection state.

### Verified generic form-dispatcher stop (2026-07-28)

`-Stage Dispatch` automates the already-bounded follow-up: it takes the same pre/post GameLink
checkpoints around exactly one Down edge, waits for the genuine `BPINT 16` helper stop, clears that
interrupt breakpoint, arms `BP 1D42:00F8` while halted, and runs with **no second game input**. It
rejects any stop at a different CS:IP and always reaps the handoff PID.

The fresh independent run `build/dqk-who-dispatch-r1-20260728/` succeeded. Its
`who-dispatch-report.json` records the one-Down delta (106 bytes in this run), the original helper
stop `08FB:006C`, and the verified dispatcher stop **`1D42:00F8`**. The debugger snapshot begins:

```asm
1D42:00F8  pop cx
1D42:00F9  mov si,ax
1D42:00FB  mov ax,si
1D42:00FD  mov cx,0040
1D42:0100  mov bx,0114
1D42:0103  cmp ax,cs:[bx]
1D42:0106  je  010F
1D42:0108  inc bx
1D42:0109  inc bx
1D42:010A  loop 0103
```

This is the requested post-INT16 generic form-dispatcher control-path capture: the routine receives
the INT16 result in `AX`, preserves it in `SI`, then searches a 64-entry code-segment table. It
also explains why breaking on the overlay-8 `WHO` opcode handler never caught selector input.
It is deliberately **not** a claim that a particular RAM-diff byte is the selected party index.
That separate, lower-level proof would require a write breakpoint that identifies a writer CS:IP;
it is no longer needed to establish the dispatcher route itself.

- **C4.2** — DQK **combat**: hand a scripted `SearchLocation`/event combat to the shared
  `launchCombat` overlay with faithful DQK monsters (needs `MONCHA.GLB` decoded; today scripted
  fights auto-resolve and surface a marker).
- **C4.3** — DQK on the shared Phase-A **systems** (magic/items/town/character sheet) driven by a
  DQK party — these are already party/ruleset-driven, so this is a wiring+verify slice.
- `vmRun1` position packing + the facing code at `0x11` (full per-step main-loop dispatch) — only
  needed for the events `vmRun1` (rather than `SearchLocation`) owns; not required for C4.1.
