# M102 audit — the CoK Main Menu's Guard/Drop/Add/Load status line never clears on an ordinary cursor move, a fourth instance of M99/M100/M101's "clear-on-every-sibling-action" shape

> Audit method: read `docs/engine/research/m101-audit.md` and `m100-audit.md` in full first per the
> brief's mandatory first step, then read `m99-audit.md` and `m98-audit.md` in full and skimmed
> `m97`/`m96-audit.md` for the established taxonomy. `git log` confirms M94-M101's fixes are all
> **already shipped** (`93437bf`, `7af9357`, `07e7406`, `5d75b1f`, `515a005`, `2d6c93a`, `9d161ef`,
> `5ea4aa1`), so this round reads the current, already-more-advanced source, not a stale snapshot.
> `git status --porcelain` was clean at session start (no stray `m39-audit.md`/
> `_scratch_m39_verify.test.ts` in the actual working tree — those exist only inside already-committed
> history, consistent with M96-M101's own repeated note about this same stale-preamble illusion in the
> environment's static context block).

## Mandatory first check (per instruction #6): is M101's OWN shipped fix (`5ea4aa1`) complete and correct against its own sketch?

**Yes — checked thoroughly, comes up clean.** `git show 5ea4aa1 -- apps/web/src/ui/town.ts` shows the
single line M101's own sketch specified landed exactly where the sketch placed it:

```diff
 function moveCursor(delta: number): void {
   if (!state) return;
   const n = Math.max(1, rowCount());
   state.cursor = ((state.cursor + delta) % n + n) % n;
+  setStatus(''); // M101 — a Buy/Heal/Train/Listen confirmation is stale the moment the player looks elsewhere
   drawScreen();
 }
```

`git show 5ea4aa1 -- apps/web/test/e2e.mjs` also confirms the regression test M101's own "Implications"
section called for was added: `runTown()` now drives the **real front-door** `select(0)` →
`activate()` (enter Shop) → `activate()` (Buy) → `status()` → `move(1)` → `status()` path (not just the
pre-existing direct `buy()`/`sell()` seams, which bypass `activate()`/`setStatus()` entirely), asserting
`statusAfterFrontDoorMove === ''` (`frontDoorStatusOk`, folded into the case's existing `ok` predicate)
— a genuine **clearing** assertion, not a repeat of a **setting** assertion, and it also closes the
"no e2e case has ever read `status()` after any action" coverage gap M101 itself flagged. **M101's fix
is fully and correctly shipped — no further action needed there.** Moving to a fresh thread per
instruction #6.

## Triage of the carried-forward threads (per the brief's "pick one OR find something fresh, grep-check first")

1. DoK-import `CoreClassId` excludes ranger/knight (M32/M86/M94-M101) — re-confirmed still true
   (`importDokParty.ts:123`). Not picked.
2. `createCharacter()`'s missing per-class ability-score minimums (M94-M101) — still open, still a
   two-part fix (`classes.ts`'s own `allowsClass()` doc comment still literally says "ignoring ability
   minimums"). Not picked.
3. DQK's distinct manual "Paladin" row vs. "Knight" (M93-M101) — still **UNKNOWN**. Not picked.
4. A full page-image audit of every remaining CoK/DoK numeric table (M96's closing suggestion) — still
   an open-ended, from-scratch sweep with no code-reachability angle. Not picked.
5. Whether "Extra spells" (deities.ts) should ever become a real mechanical grant — genuinely ambiguous
   primary-source question, still open. Not picked.
6. Whether `select()` (the e2e-seam-only cursor setter in `inventory.ts`/`town.ts`) should be patched for
   consistency — a minor completeness question, not required for reachability. Not picked.

None of the six was picked.

## Checking M101's own four named, not-yet-swept candidates (`dialogue.ts`, `charEditor.ts`, `journal.ts`, `automapPanel.ts`)

Per instruction #7 ("a strong, cheap-to-check lead"), this round checked all four before a cold sweep.
**None of the four actually holds the shape** — each was read in full and ruled out on structural
grounds, not skipped:

| File | `status`-shaped field? | Verdict |
|---|---|---|
| `dialogue.ts` | `DlgState` has no persisted status/note field at all. `setStatus()` here only writes the legacy external `#status` DOM element (`dialogue.ts:162-165`), never a field read by any render call — the actual dialogue text (`state.textEl.textContent`) is freshly overwritten by `present()` on **every** turn (`dialogue.ts:171`), so there is nothing that can go stale. The `status: 'awaiting-input' \| 'exited' \| 'combat' \| 'chain'` strings visible in the file (`dialogue.ts:87-121`) are `EclRunResult`'s own VM-turn-kind enum, the identical "phase enum, not a clearable UI field" shape M100 already ruled out for `dqkExplore.ts`. **Ruled out.** |
| `charEditor.ts` | No persisted status field either — `setStatus()` (`charEditor.ts:196-199`) is, again, solely a legacy `#status` DOM writer; `composeCharSheet()`'s own call sites here (`charEditor.ts:205-221`) never pass a `status` argument at all. **Ruled out** (confirmed by reading `drawScreen()` in full — its two `composeCharSheet` calls only ever pass `frameTiles`/`font`/`sheet`/`menu`). |
| `journal.ts` | **Does** have a real, persisted, on-canvas `JournalState.status` field (`journal.ts:113`, drawn verbatim by `render/journalScreen.ts:171`), set by `readSelected()`/`cycleFilter()`/`markAll()`/`exitJournal()` and never touched by `moveCursor()` (`journal.ts:159-164`) — structurally identical to the mechanism in `town.ts`/`inventory.ts`/`magic.ts`. **Investigated in depth, but ruled out on a different, substantive ground** (see below), not skipped. |
| `automapPanel.ts` | The on-canvas `status` value passed into `composeAutomapPanel` (`automapPanel.ts:93`) is `statusLine()`, a **pure function of live state** (`automapPanel.ts:75-82`: visited-cell count, note count, current selection) recomputed fresh on every single `drawScreen()` call — it is never a "set once, needs clearing" field, so there is nothing to clear. The separate `setStatus()` calls in this file (`pinNote()`, `closeAutomap()`, `startAutomap()`) only ever write the legacy external `#status` DOM element, exactly like `dialogue.ts`/`charEditor.ts`. **Ruled out.** |

**Why `journal.ts` is a genuine, substantive rule-out and not a re-proposal opportunity:** every message
`journal.ts` sets into `state.status` describes an **ongoing, still-true fact** at the moment a cursor
move would occur, not a one-off event disconnected from the currently-highlighted row — unlike
`town.ts`'s "Bought Long Sword" (an event about a *specific past transaction*, shown next to whatever
*different* row the cursor now highlights) or `inventory.ts`'s "GAVE X TO Y". Specifically:
`readSelected()`'s `"Reading entry N: Title."` describes the reading pane's *actual current contents*
(`state.readingId`, which `moveCursor()` — confirmed by re-reading it in full — never changes; only
`readSelected()`/Enter does), so the message stays 100% accurate to what's on screen even after the
cursor highlight moves to browse a different, unopened row. `cycleFilter()`'s `"Showing X entries."`
similarly stays true for as long as the filter is unchanged (which `moveCursor()` also never touches).
`markAll()`'s `"All entries marked read."` is not tied to any specific row at all. In every case, the
literal content of the message remains true after a cursor move — the shape this loop has flagged
(M99/M100/M101) specifically requires the lingering text to become **misleadingly disconnected** from
what a fresh cursor position implies, and that disconnect does not occur here because `journal.ts`'s
`readingId`/`filterIdx` (the actual facts the status text describes) are themselves decoupled from
`cursor` by design. **Not picked; this is a real, checked, negative result, not a skip** — consistent
with combat.ts's/dqkExplore.ts's M100 rule-outs.

Per instruction #7's explicit permission ("if you check all of them and the shape genuinely doesn't
apply to any... don't force a finding... pivot to a genuinely fresh angle"), all four named candidates
are now checked, and none holds the shape. This round therefore pivoted to a fresh sweep of the
remaining, not-yet-checked `apps/web/src/ui` overlays for the identical "persisted, on-canvas, one-off
action-confirmation field that some sibling handlers clear but the cursor-move handler doesn't" pattern.

## Fresh sweep — `mainMenu.ts` holds a fourth, genuine instance

A repo-wide grep for the field-assignment shape (`state\.status\s*=`) across every `apps/web/src/ui/*.ts`
file turned up two remaining, not-yet-checked hits: `eclInspector.ts` (its `state.status` is a VM
run-phase string — `'ready'`/`'running'`/`'exited'`/an ECL op-result kind, `eclInspector.ts:117-145` —
the identical VM-phase-enum shape already ruled out for `dqkExplore.ts`/`dialogue.ts`; **ruled out**) and
`mainMenu.ts` — the byte-verified CoK "main game menu" (party-formation screen shown after the title,
per `render/mainMenu.ts`'s own doc comment: *"The option list and title are transcribed byte-for-byte
from `START.EXE`"*). `mainMenu.ts` has the shape, and it is genuinely new.

## Headline finding

**`apps/web/src/ui/mainMenu.ts`'s `MenuState.status` field — the one-line result/hint text shown at
row 22 of the CoK Main Menu, underneath the party roster and the ten-option command bar (e.g. `"Create
or add a character before adventuring."`, `"Dropped Sirrion."`, `"Added 2 character(s) to the party."`,
`"No saved game to load."`, `"Saved game loaded: Goldmoon."`) — is correctly (re-)set by every relevant
branch of `activate()` (Create/Add/Drop/Modify/View-guard/Load/Begin-guard/Exit) and by
`startMainMenu()`'s own boot-time default, but `move(delta)` — the plain ArrowUp/Down/Left/Right cursor
handler, the single most ordinary way to browse the ten-option menu — never touches it at all.** A
player who tries "Begin Adventuring" with an empty party (seeing the guard message *"Create or add a
character before adventuring."*), or drops a party member (seeing *"Dropped Sirrion."*), and then simply
arrows to look at a different menu option before deciding what to do next — the single most natural next
step on this exact screen — sees the stale result line persist, unchanged, next to whatever option is
now highlighted, until another `activate()` call (or the screen is torn down and rebuilt) finally
overwrites it. This is the fourth instance of the exact taxonomy shape M99 (`magic.ts`), M100
(`inventory.ts`), and M101 (`town.ts`) each already found — specifically the **M100/M101-direction**
instance (the cursor-move handler is the missing sibling; the action handlers are already correct), not
M99's (action handlers missing a cursor-move-side clear).

## Existing sibling/precedent and the self-flagging evidence

**Grep results (discipline #1), confirming this is genuinely new, not a re-proposal:**

```
$ grep -n "MenuState\|function move(delta\|Dropped \${\|No characters to\|Roll up a new champion\|Choose Begin Adventuring" docs/engine/research/m*-audit.md
(zero hits, any round)

$ grep -n "mainMenu\.ts\|MenuState\|COK_MAIN_MENU\|composeMainMenu" docs/engine/research/m*-audit.md
(37 hits, spanning M42/43/44/45/46/48/52/55/60/69/87/89/92/93/94/96/97/98 -- every one of them examines
 a DIFFERENT question: M42's own "is every MainMenuMember/MainMenuView field populated" sweep
 (unconsumed-FIELD shape, explicitly names mainMenu.ts as "the one screen already doing this correctly"
 on THAT axis, m42-audit.md:336), M46's "Load Saved Game" wiring/message-text fix, M48's degenerate
 `.level` field, M60's menu.innerHTML fact-coverage check, M69's `impaired` field-population check,
 M89's dead/down roster-colour convention, M92/M93/M94/M96/M97/M98's "which game is this call site
 building/reaching" questions (roster-composition gate, level-cap ruleset, DQK Town leave-routing,
 KNIGHT_ORDER_MINIMUMS, deity Pray note). None of the 37 ever asks the M99/M100/M101 "is a transient
 per-action text field's clearing discipline applied to every sibling handler" question against
 mainMenu.ts's own `status` field specifically -- the closest, M42, explicitly checked a DIFFERENT axis
 (is the field ever populated at all) and pronounced the file "the good example" on THAT axis, three
 rounds before the `status` field (added by a later commit, `40c8934`, 2026-06-24) even existed.
```

No prior round (M1-M101) ever names `MenuState.status`'s cursor-move staleness, or `mainMenu.ts`'s
`move()`, in this specific sense. This is the same "a file mined many times for many different shapes
can still hold an independent, unmined shape" lesson M96-M101 have each re-confirmed — applied here to
the second-most-audited file family in the whole loop (37 prior hits) for a question none of those 37
rounds asked, mirroring M101's own identical finding about `town.ts` (37 prior hits there too) one round
earlier.

**Git-blame dating — like M101's `town.ts` finding (and unlike M100's `inventory.ts` finding), this is a
same-commit, single-sitting omission, not a field bolted on later:**

```
$ git log --format="%h %cd %s" --date=iso -S "function move(delta: number): void {" -- apps/web/src/ui/mainMenu.ts
40c8934 2026-06-24 01:26:44 +0200 CoK boot: recreate the original main game menu (intro -> menu -> adventure)

$ git log --format="%h %cd %s" --date=iso -S "Dropped \${name}" -- apps/web/src/ui/mainMenu.ts
40c8934 2026-06-24 01:26:44 +0200 CoK boot: recreate the original main game menu (intro -> menu -> adventure)

$ git log --format="%h %cd %s" --date=iso -S "status: string;" -- apps/web/src/ui/mainMenu.ts
40c8934 2026-06-24 01:26:44 +0200 CoK boot: recreate the original main game menu (intro -> menu -> adventure)
```

`move()`, the `status` field, and every one of `activate()`'s status-setting branches all shipped in the
**same single commit** (`40c8934`, 2026-06-24) — this has been live, unfixed, for the entire lifetime of
the Main Menu (over a week and dozens of audit rounds, including M42's own close reading of this exact
file for a different axis, and M46/M92-M98's own repeated close readings of `activate()`'s individual
branches for other, unrelated questions).

## Where the severance happens — exact locations, current source

**`apps/web/src/ui/mainMenu.ts:86-91`** (`move`, current source, full — the one handler shared by every
Arrow-key press that never touches `status`):

```ts
function move(delta: number): void {
  if (!state) return;
  const n = COK_MAIN_MENU.length;
  state.selected = ((state.selected + delta) % n + n) % n;
  draw();               // <-- state.status is whatever the last activate() left it; never cleared
}
```

**`apps/web/src/ui/mainMenu.ts:104-165`** (`activate()`, current source — every reachable branch
correctly sets a *fresh* `status` string, success or failure, via `setStatus(...)`, before or after
`draw()`):

```ts
case 'Add Character to Party':
  void importCokParty().then((r) => {
    if (r.imported.length > 0) setStatus(`Added ${r.imported.length} character(s) to the party.`);
    else setStatus('No saved characters found to add.');
    draw();
  });
  return;
case 'Drop Character':
case 'Remove Character from Party': {
  const n = partySize();
  if (n === 0) { setStatus('No characters to drop.'); return; }
  const name = roster()[n - 1]?.name ?? '';
  removeFromParty(n - 1);
  setStatus(`Dropped ${name}.`);
  draw();
  return;
}
// ... View/Load/Begin-guard/Exit: identical shape -- setStatus(...) then return/draw() ...
case 'Begin Adventuring':
  if (partySize() === 0) { setStatus('Create or add a character before adventuring.'); return; }
  teardown();
  (hooks.onBegin ?? (() => { void startExplore(); }))();
  return;
```

**`apps/web/src/ui/mainMenu.ts:186-199`** (`onKey`, confirming Arrow keys route directly to the
un-clearing `move()`, and that the `Escape` branch shares the identical, second instance of the same
omission — it repositions the cursor without calling `activate()` or clearing `status`):

```ts
switch (e.key) {
  case 'ArrowDown': case 'ArrowRight': e.preventDefault(); move(1); return;
  case 'ArrowUp': case 'ArrowLeft': e.preventDefault(); move(-1); return;
  case 'Enter': case ' ': e.preventDefault(); activate(); return;
  case 'Escape': e.preventDefault(); state.selected = COK_MAIN_MENU.length - 1; draw(); return; // highlight Exit
  default: /* first-letter hotkeys -> selectByHotkey(), which always calls activate() too */
}
```

`selectByHotkey()` (`mainMenu.ts:93-101`) and every mirrored HTML button's click handler
(`mainMenu.ts:242`, `{ state.selected = i; draw(); activate(); }`) always call `activate()` immediately
after repositioning the cursor, so both are unaffected — `move()` (Arrow keys) and the inline `Escape`
"highlight Exit" branch are the **only** two places `state.selected` changes without an accompanying
`activate()` call, confirmed by re-reading `onKey`, `selectByHotkey`, and the button-construction loop
in `startMainMenu()` in full this round.

**`apps/web/src/ui/mainMenu.ts:75-84`** (`draw()`, the one render call every one of the above triggers)
reads `state.status` unconditionally into the view, with no staleness check of any kind:

```ts
const fb = composeMainMenu({
  frameTiles: state.frameTiles,
  font: state.font,
  view: { roster: roster(), options: COK_MAIN_MENU, selected: state.selected, status: state.status },
});
```

**`packages/engine/src/render/mainMenu.ts:199`** (`composeMainMenu`, the pure compositor `draw()` feeds)
draws whatever `view.status` holds, verbatim, at a fixed row, with no age/relevance awareness — the same
"draw whatever it holds" shape M98-M101 already found in `spellbook.ts`/`render/inventory.ts`/
`render/townScreen.ts`:

```ts
if (v.status) drawText(fb, font, v.status.toUpperCase().slice(0, 36), cell(2), rowY(22), C_WHITE);
```

## Reachable in real, ordinary, shipped play — dynamic proof

**Static reachability, the full real chain:** boot CoK (`main.ts`'s real title→menu boot order, or
`?play=cok`'s `enterMenu()`, or the standalone `?mainmenu=1` route — all three call the real,
unmodified `startMainMenu()`) → the ten-option, byte-verified command bar is the very first screen a
player sees before entering the world → highlight **Begin Adventuring** (hotkey `b`, or arrow down to
index 8) with an empty roster → the guard fires, showing `"Create or add a character before
adventuring."` → without pressing Enter/a hotkey again, press ArrowUp/Down/Left/Right to look at other
options (the single most natural next step — you were just told you need to Create or Add a character,
so browsing toward that option is exactly what a player does next). **Or**: build/import a party, then
select **Drop Character** — a real, ordinary, front-door command (hotkey `d`) — see `"Dropped
<name>."`, then arrow to a different option before deciding what to do next.

**Dynamic re-derivation this round** (a throwaway Puppeteer script, mirroring `e2e.mjs`'s own
`runMainMenu()` setup exactly — same `?mainmenu=1` route, same empty-roster reset, same
`window.__mainmenu` seam, on a scratch port distinct from `e2e.mjs`'s own 5180 — created, run, then
deleted, per the brief's preference for driving a real headless browser session over a pure vitest call
for a DOM-adjacent UI-state claim):

```
1. ?mainmenu=1, localStorage party cleared+reloaded -> window.__mainmenu live, empty roster
2. window.__mainmenu.select(8); window.__mainmenu.activate()   -- "Begin Adventuring" guard, empty party
     status() === "Create or add a character before adventuring."
3. window.__mainmenu.move(1)     -- ordinary ArrowDown, no second activate()/hotkey in between
     status() -> STILL "Create or add a character before adventuring."
4. window.__mainmenu.move(-1)    -- a second ordinary move, back the other way
     status() -> STILL "Create or add a character before adventuring."
5. window.__mainmenu.hotkey('a')  -- Add Character to Party (front door), roster now 6
6. window.__mainmenu.hotkey('d')  -- Drop Character (front door), roster now 5
     status() === "Dropped Sirrion."
7. window.__mainmenu.move(1)      -- ordinary ArrowDown, no other action in between
     status() -> STILL "Dropped Sirrion."

RESULT (captured verbatim from the real, unmodified, current production code):
{
  "statusAfterGuard": "Create or add a character before adventuring.",
  "statusAfterMove1": "Create or add a character before adventuring.",
  "statusAfterMove2": "Create or add a character before adventuring.",
  "staleGuardBugAfterOneMove": true,
  "staleGuardBugAfterTwoMoves": true,
  "rosterBeforeDrop": 6,
  "statusAfterDrop": "Dropped SIRRION.",
  "rosterAfterDrop": 5,
  "statusAfterDropMove": "Dropped SIRRION.",
  "staleDropBugAfterMove": true,
  "statusAfterSecondGuardAttempt": ""
}
```

(`statusAfterSecondGuardAttempt` is `""` because, by that point in the script, the roster is non-empty
— 5 members after the Drop — so re-selecting "Begin Adventuring" and activating it no longer hits the
guard at all: it *succeeds*, tearing the Main Menu down via `teardown()`/`hooks.onBegin`, so `state` is
`null` and `status()`'s `state?.status ?? ''` fallback correctly returns `''`. This is expected,
unrelated behaviour, not a second bug — included only to show the script's full run was coherent.)

This ran against the real, unmodified, currently-shipped `mainMenu.ts`/`render/mainMenu.ts` production
code, driving a real headless Edge session through the real `window.__mainmenu` seam (`move()` calls the
real `move()`, `hotkey()` calls the real `selectByHotkey()` — no fixtures, no mocks). The script
(`apps/web/test/_scratch_m102_verify.mjs`) was created, run (output captured above, both the Guard and
Drop sub-cases reproduced the stale-status bug across one and two ordinary moves), then deleted before
writing this document; `git status --porcelain` confirmed clean before and after, this doc the only new
file.

**Why the existing e2e test never caught this:** `e2e.mjs`'s `runMainMenu()` (`e2e.mjs:2658`) already
reads `status()` immediately after the empty-party Begin guard fires (`guardStatus`, `e2e.mjs:2689`,
asserting `/character/i.test(guardStatus)`) — but it never calls `move()`/`select()` again afterward
before moving on to the next assertion. This is the same "genuine, unexercised gap in coverage" shape
M97/M99/M100/M101 have each named (not M86/M89/M90/M95/M96's "test bakes in a wrong value") — the test's
own assertion would not change whether this round's fix ships or not, since it never drives a cursor
move after a status-setting action.

## Proposed minimal fix (not applied this round — audit scope is research only)

**One line, in the exact spot `town.ts`'s/`inventory.ts`'s own already-fixed cursor handlers place their
own clear** — purely additive, matches the established convention in all three sibling files M99/M100/
M101 already fixed:

```ts
// sketch, not applied this round -- apps/web/src/ui/mainMenu.ts
function move(delta: number): void {
  if (!state) return;
  const n = COK_MAIN_MENU.length;
  state.selected = ((state.selected + delta) % n + n) % n;
  setStatus(''); // M102 — a Guard/Drop/Add/Load confirmation is stale the moment the player looks elsewhere
  draw();
}
```

Notes on the sketch:
- **Uses `setStatus('')`, not a bare `state.status = ''`** — exactly like `town.ts`'s own M101 fix — since
  `mainMenu.ts`'s `setStatus()` helper (`mainMenu.ts:69-73`) also mirrors the message into the legacy
  `#status` DOM element for callers outside the canvas view; calling it keeps both sinks in sync.
- **The `Escape` "highlight Exit" branch (`mainMenu.ts:194`) shares the identical, second instance of the
  same omission** (it repositions `state.selected` without calling `activate()` or clearing `status`,
  exactly like `move()`) — a same-pass, same-shape companion fix: `case 'Escape': ... state.selected =
  COK_MAIN_MENU.length - 1; setStatus(''); draw(); return;`. Optional but recommended in the same commit,
  mirroring how M101's own fix scope stayed to the one function that mattered but noted the mechanically
  identical `select()` e2e seam for completeness.
- **Purely additive, one file, one (or two) line(s).** No change to `render/mainMenu.ts`, `party.ts`, or
  any other consumer.
- **No other handler needs touching.** `activate()` (every branch), `selectByHotkey()`, and every mirrored
  button's click handler already set a fresh `status` (the latter two both call `activate()` immediately
  after repositioning the cursor) — confirmed by re-reading all three in full this round; this is a
  two-site gap (`move()` + the inline `Escape` branch), not a multi-function gap like M99's `magic.ts`
  finding.
- **The e2e regression this fix should add** (mirrors M92-M101's own "the fix and its test travel
  together" discipline): extend `runMainMenu()`'s existing guard step (`e2e.mjs:2687-2690`) with a
  follow-up `move(1)` call, asserting `status()` returns `''` afterward — a genuine regression-catcher,
  since it is `''` under the fix and the stale guard string under today's code. This also closes the
  pre-existing coverage gap noted above (no e2e case reads `status()` after a *subsequent* action today).

## Secondary observations not part of this round's fix

- **This is the fourth file in a row with this exact taxonomy shape** (`magic.ts` M99, `inventory.ts`
  M100, `town.ts` M101, `mainMenu.ts` this round) — and the third in the "cursor-move handler is the
  missing sibling" *direction* specifically (M100's/M101's direction), not M99's. Per M101's own closing
  note, this is not strong evidence of a deeper asymmetry so much as a shared code-organization
  convention (a cursor-move handler written once, early, before any transient-message field existed to
  remind the author) recurring across files independently authored on different days (`b2cd1f0` for
  `town.ts`, `fb1738b`/`ca231b4` for `inventory.ts`, `40c8934` for `mainMenu.ts`).
- **`__mainmenu.select(i)` (the e2e-only seam, `mainMenu.ts:272`) shares the identical omission
  mechanically** (`select: (i: number) => { if (state) { state.selected = i; draw(); } }`, no
  `setStatus()` call) but is **not reachable in real ordinary play** — confirmed by
  `grep -rn "__mainmenu\.select\|\.select(" apps/web/src apps/web/test/e2e.mjs` outside `e2e.mjs` itself
  → zero hits in `apps/web/src`; only e2e itself uses it (`e2e.mjs:2681,2683,2687`), and none of those
  call sites reads `status()` right after a bare `select()` alone. Noted for completeness only, mirroring
  M100/M101's identical treatment of `inventory.ts`'s/`town.ts`'s own `select()`.
- **`teardown(clearStatus = true)` has a parameter whose name promises behaviour its body never
  implements** (`mainMenu.ts:172-177`: `function teardown(clearStatus = true): void { ...; if
  (clearStatus) { /* leave the last status visible */ } }` — the `if` branch's own comment directly
  contradicts the parameter's name, doing nothing either way). This is a separate, pre-existing,
  currently-inert quirk (both call modes behave identically today: `teardown()`'s only two callers pass
  either the default `true` — from every `activate()` exit branch, where a fresh status was just set
  anyway — or explicit `false` — from `View Character`'s overlay handoff, where the sheet's own `onClose`
  callback rebuilds the whole menu from scratch, again producing a fresh status). Not part of this
  round's fix (it does not currently cause any observable staleness, since every real call site's
  behaviour is unaffected by which branch the dead `if` takes), but worth flagging as a small, low-risk,
  separate cleanup candidate for whoever touches this file next.

## Rejected alternatives considered this round

| Candidate | Why rejected |
|---|---|
| DoK-import `CoreClassId` excluding ranger/knight (M32/M86/M94-M101) | Re-confirmed still true, still correctly scoped; no new angle found this round. |
| `createCharacter()`'s missing per-class ability-score minimums (M94-M101) | Re-confirmed still open, still a two-part fix; not picked, consistent with prior rounds. |
| DQK's distinct "Paladin" row (M93-M101) | Still **UNKNOWN**; no new primary source consulted this round. Left open. |
| A full page-image re-derivation of one more CoK/DoK numeric table (M96's closing suggestion) | Still a from-scratch transcription-verification sweep with no code-reachability angle. |
| `dialogue.ts`/`charEditor.ts`/`automapPanel.ts` for the "clear-on-sibling" shape (M101's three other named candidates) | All three read in full this round and structurally ruled out — no persisted, on-canvas, one-off-confirmation status field exists in any of the three (see table above). |
| `journal.ts` for the same shape (M101's fourth named candidate) | Investigated in most depth of the four — it *does* have a persisted `status` field `moveCursor()` never clears, but every message it holds remains factually accurate after a cursor move (the underlying facts they describe — `readingId`, `filterIdx` — are themselves decoupled from `cursor`, unlike `town.ts`'s/`inventory.ts`'s one-off transaction confirmations). Ruled out on substance, not skipped. |
| `eclInspector.ts`'s `state.status` (found during this round's fresh grep sweep) | Its `status` is an ECL VM run-phase string (`'ready'`/`'running'`/`'exited'`/an op-result kind), the identical "phase enum, not a clearable UI field" shape already ruled out for `dqkExplore.ts` (M100) and `dialogue.ts` (this round). Not a fresh instance. |

## Open questions / unknowns

- **Whether `__mainmenu.select()` should also be patched for e2e-seam hygiene**, even though it's not
  required for player-reachability — the same minor completeness question M100/M101 left open for
  `inventory.ts`'s/`town.ts`'s own `select()`, now also open for `mainMenu.ts`'s.
- **Whether `teardown()`'s dead `clearStatus` parameter should be implemented or removed** — a small,
  separate, currently-inert quirk noted above; not required for this round's fix (no observable staleness
  results from it today), but worth a lead-session call on cleanup vs. leaving it.
- **Whether any further overlay beyond `magic.ts`/`inventory.ts`/`town.ts`/`mainMenu.ts` still holds this
  shape** — this round checked all four of M101's named candidates (`dialogue.ts`, `charEditor.ts`,
  `journal.ts`, `automapPanel.ts` — none hold it) plus `eclInspector.ts` (found via a fresh grep sweep,
  also ruled out) and `companionPanel.ts`/`hudPanel.ts` (both compute their status lines fresh per-render
  from live state, like `automapPanel.ts` — no persisted field to go stale). The remaining unswept
  `apps/web/src/ui` files with cursor-driven overlays are `artmap.ts`, `catalog.ts`, `library.ts`,
  `referenceDb.ts`, `viewer`-adjacent asset browsers, and `explore.ts`/`wilderness.ts`/`combat.ts`/
  `dqkExplore.ts` (the latter two already ruled out by M100). Given four confirmed instances now
  (`magic.ts`, `inventory.ts`, `town.ts`, `mainMenu.ts`) and a growing rate of clean rule-outs relative to
  hits this round (5 checked, 1 hit), this specific taxonomy sub-case may be nearing the diminishing
  returns the brief anticipated — a future round should weigh continuing this exact sweep against a
  genuinely different angle.
- **M98/M99's own two still-open questions** (deity-note on `charSheet.ts`'s footer; whether "Extra
  spells" should ever become a real mechanical grant) remain exactly as left — untouched by this round.

## Implications for our engine / for the taxonomy

- **Confirms the "clear-on-every-sibling-action" shape generalizes to a fourth file**, and specifically
  that checking an immediately-prior round's own named "unswept candidates" list (M101 named four; this
  round checked all four) is a legitimate, cheap, and honest exercise **even when it yields zero hits on
  every one of the named files** — the round did not stop there, but used the negative result (with
  substantive reasoning per file, not a shrug) as license to broaden the sweep one notch further
  (`eclInspector.ts`, found via grep; then `mainMenu.ts`, the actual hit), rather than either forcing one
  of the four ruled-out candidates into a finding or picking a carried-forward thread by default.
- **A genuine negative result can itself be worth documenting in detail** — `journal.ts`'s rule-out in
  particular required reading `moveCursor()`, `readSelected()`, `cycleFilter()`, and `markAll()` all the
  way through and reasoning about *why* the same surface-level pattern (a `status` field, an unclearing
  cursor handler) does *not* produce the same player-visible harm here, because the specific facts it
  displays are decoupled from cursor position by the screen's own design. This is a useful addition to
  the taxonomy: **the same field shape does not automatically imply the same bug** — the field's content
  must be checked for whether it is a one-off, row/action-scoped confirmation (the harmful case) or an
  ongoing, cursor-independent fact restated in text form (the harmless case), before concluding a hit.
- **A second confirmed instance of "an audit's own closing 'unswept candidate' list paying off directly"
  after broadening past a clean sweep** — mirroring M100→M101's identical pattern (M100 named three
  candidates, M101 checked all three, two ruled out, one hit) at one further remove: M101 named four
  candidates, this round checked all four, all four ruled out, and the actual hit came from continuing
  the same grep-driven method one file further (`mainMenu.ts`), not from a blind fresh sweep. The
  discipline of exhausting a named list before broadening remains cheap and worth continuing.

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `apps/web/test/_scratch_m102_verify.mjs` (a throwaway Puppeteer script, mirroring `e2e.mjs`'s own
  `runMainMenu()` party-reset setup, driving a real headless Edge session against the real dev-built app
  on a scratch port distinct from `e2e.mjs`'s own 5180) — run once (output captured verbatim above, both
  the Guard and Drop sub-cases reproduced the stale-status bug across one and two ordinary moves), then
  deleted. `git status --porcelain` confirmed clean before and after, this doc the only new file.
