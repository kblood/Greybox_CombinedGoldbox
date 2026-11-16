# M101 audit — the Town hub's shop/temple/training/tavern action-result line never clears on an ordinary cursor move, a third instance of M99/M100's "clear-on-every-sibling-action" shape

> Audit method: read `docs/engine/research/m100-audit.md` and `m99-audit.md` in full first per the
> brief's mandatory first step, then skimmed `m95`/`m96`/`m97`/`m98-audit.md` for the established
> taxonomy. `git log` confirms M94-M100's fixes are all **already shipped** (`93437bf`, `7af9357`,
> `07e7406`, `5d75b1f`, `515a005`, `2d6c93a`, `9d161ef`), so this round reads the current,
> already-more-advanced source, not a stale snapshot. `git status --porcelain` was clean at session
> start (no stray `m39-audit.md`/`_scratch_m39_verify.test.ts` in the actual working tree — those exist
> only inside already-committed history, consistent with M96-M100's own repeated note about this same
> stale-preamble illusion in the environment's static context block).

## Mandatory first check (per this round's instruction #6): is M100's OWN shipped fix (`9d161ef`) complete and correct against its own sketch?

**Yes — checked thoroughly, comes up clean.** `git show 9d161ef -- apps/web/src/ui/inventory.ts` shows
the single line M100's own sketch specified landed exactly where the sketch placed it:

```diff
 function moveCursor(delta: number): void {
   if (!session || session.inv.entries.length === 0) return;
   const n = session.inv.entries.length;
   session.cursor = ((session.cursor + delta) % n + n) % n;
+  session.status = ''; // M100 — a Give confirmation is stale the moment the player looks elsewhere
   paint();
 }
```

`git show 9d161ef -- apps/web/test/e2e.mjs` also confirms the regression test M100's own "Implications"
section called for was added: `runInventoryTrade()` now calls `window.__inv.move(1)` right after the
Give step and asserts `status()` returns `''` (`statusAfterMoveOk`), folded into the case's existing
`ok` predicate — a genuine **clearing** assertion, not a repeat of the pre-existing **setting**
assertion, exactly matching M99's own closing lesson that M100 had explicitly promised to apply.
**M100's fix is fully and correctly shipped — no further action needed there.** Moving to a fresh thread
per instruction #6.

## Triage of the carried-forward threads (per the brief's "pick one OR find something fresh, grep-check first")

1. DoK-import `CoreClassId` excludes ranger/knight (M32/M86/M94-M100) — re-confirmed still true
   (`importDokParty.ts:123`). Not picked.
2. `createCharacter()`'s missing per-class ability-score minimums (M94-M100) — still open, still a
   two-part fix. Not picked.
3. DQK's distinct manual "Paladin" row vs. "Knight" (M93-M100) — still **UNKNOWN**. Not picked.
4. M96's "full page-image audit of every remaining CoK/DoK numeric table" — not picked; still an
   open-ended, from-scratch sweep with no code-reachability angle, and this round found a sharper,
   directly-named candidate first (see below).
5. M98/M99's own open questions (deity-note on `charSheet.ts`'s footer; whether "Extra spells" should
   ever be mechanically castable) — neither picked up; both remain exactly as left.

None of the five was picked. Instead, per **M100's own explicit instruction #7 / closing "Open questions"
note** ("Other overlays (`town.ts`, `combat.ts`, `dqkExplore.ts`) were not swept for this specific shape
this round — a candidate thread for a future round"), this round swept `town.ts` for the identical
"transient per-action text field, cleared by some sibling handlers but not others" shape M99 (in
`magic.ts`) and M100 (in `inventory.ts`) each found. It has the exact same gap, a third time.

## Headline finding

**`apps/web/src/ui/town.ts`'s `TownState.status` field — the Town hub's one-line action-result text
shown on the status row of every Shop/Temple/Training Hall/Tavern screen (e.g. `"Bought Long Sword for
15 steel."`, `"Sturm trains to level 2! (+8 HP, 2000 steel)"`, `"The party is healed (12 HP) for 60
steel."`) — is correctly (re-)set by every branch of `activate()` (Buy/Sell/Heal/Raise/Train/Listen) and
by `enter()`/`leaveTown()` (via `modeIntro()`), but `moveCursor()` — the plain ArrowUp/ArrowDown handler,
the only way to browse rows in every one of these four locations — never touches it at all.** A player
who buys an item, trains a party member, or heals the party, then simply arrows down to look at the next
row (the single most ordinary thing to do on this screen before deciding on a second action), sees the
stale result line from the *previous* action persisting, unchanged, next to a completely different item
row/party member/rumour — potentially for the rest of that visit to that location, since nothing short of
a fresh `activate()` (which always overwrites with a new message, success or failure) or leaving the mode
via `back()`/hub navigation (both routed through `enter()`) ever refreshes it. This is the third instance
of the exact taxonomy shape M99 (`magic.ts`) and M100 (`inventory.ts`) each already found — specifically
the **M100-direction** instance (the cursor-move handler is the missing sibling; the action handlers are
already correct), the same direction M100 itself was, not M99's.

## Existing sibling/precedent and the self-flagging evidence

**Grep results (discipline #1), confirming this is genuinely new, not a re-proposal:**

```
$ grep -n "moveCursor" docs/engine/research/m*-audit.md
(hits only in m98/m99/m100-audit.md, all about magic.ts's/inventory.ts's own moveCursor() — no hit
 mentions town.ts's moveCursor() at all)

$ grep -n "Bought\|Cannot buy\|trains to level\|is healed\|is raised\|recorded in your journal" \
    docs/engine/research/m*-audit.md
(zero hits for any of these literal town.ts status strings, in any round)

$ grep -n "modeIntro|state\.status|stale.*status" docs/engine/research/m*-audit.md
m100-audit.md   -- only the (already-verified-clean) inventory.ts session.status finding
m96-audit.md    -- an unrelated "stale snapshot" preamble note
(no hit for town.ts's `TownState.status`/`setStatus()` staleness-across-cursor-moves at all)

$ grep -rln "town.ts" docs/engine/research/m*-audit.md
(37 files touch town.ts across the whole loop -- M27/30/31/40/41/42/43/44/45/46/47/48/49/50/51/52/53/54/
 58/59/60/61/62/63/64/66/75/76/87/88/89/90/91/92/93/97/100 -- but every one of them examines a DIFFERENT
 question: SHOP_STOCK catalogue coverage (M27/31), sellStack pricing wiring (M30/41/66), recordJournal's
 day-wiring (M41-M58, a caller-plumbing gap, explicitly NOT this shape), the pre-hoc price/eligibility
 pattern (M51 -- explicitly praised town.ts as "already a strong positive example of the pattern done
 right", but that is a DIFFERENT axis: whether a cost/result is shown BEFORE an action, not whether a
 POST-hoc action-result string is correctly cleared by a later, unrelated cursor move), a stale doc
 COMMENT about leaveTown() (M63, unrelated to the status field's runtime lifecycle), and M97's onLeave
 routing (navigation, not the status field). None of the 37 ever asks the M99/M100 "is a transient
 per-action text field's clearing discipline applied to every sibling handler" question against
 town.ts's own `status` field specifically.
```

No prior round (M1-M100) ever names `TownState.status`'s cursor-move staleness, or town.ts's
`moveCursor()`, in this specific sense. This is the same "a file mined many times for many different
shapes can still hold an independent, unmined shape" lesson M96-M100 have each re-confirmed — applied
here to the single most heavily-audited file in the whole loop (37 prior hits) for a question none of
those 37 rounds asked.

**Git-blame dating — unlike M100's `inventory.ts` finding (a field bolted on 16 minutes after
`moveCursor()` in a *later* commit), this omission was baked in from the file's very first commit, all
in one shot:**

```
$ git log --format="%h %cd %s" --date=iso -S "function moveCursor(delta: number): void {" -- apps/web/src/ui/town.ts
b2cd1f0 2026-06-22 09:50:58 +0200 A5.2: town hub -- shop, temple, training hall, tavern

$ git log --format="%h %cd %s" --date=iso -S "Bought \${r.item}" -- apps/web/src/ui/town.ts
b2cd1f0 2026-06-22 09:50:58 +0200 A5.2: town hub -- shop, temple, training hall, tavern

$ git show b2cd1f0 -- apps/web/src/ui/town.ts | grep -n "function moveCursor" -A 6
+function moveCursor(delta: number): void {
+  if (!state) return;
+  const n = Math.max(1, rowCount());
+  state.cursor = ((state.cursor + delta) % n + n) % n;
+  drawScreen();
+}
```

Both `moveCursor()` and every `setStatus()` call inside `activate()` shipped in the **same single
commit** (`b2cd1f0`, A5.2, 2026-06-22 09:50:58) — this is not a later field forgetting an earlier
handler (M100's shape); it is a same-commit, day-one omission that has been live, unfixed, for the
entire lifetime of the Town hub (over two weeks and dozens of audit rounds, including M51's own
close reading of this exact file for a different axis, and M63's close reading of `leaveTown()` two
functions away).

## Where the severance happens — exact locations, current source

**`apps/web/src/ui/town.ts:322-328`** (`moveCursor`, current source, full — the one handler shared by
every mode that never touches `status`):

```ts
/** Move the cursor (wrapping) within the active mode. */
function moveCursor(delta: number): void {
  if (!state) return;
  const n = Math.max(1, rowCount());
  state.cursor = ((state.cursor + delta) % n + n) % n;
  drawScreen();               // <-- state.status is whatever the last activate()/enter() left it; never cleared
}
```

**`apps/web/src/ui/town.ts:247-307`** (`activate()`, current source, full — every one of its five mode
branches correctly sets a *fresh* `status` string, success or failure, every single time it fires):

```ts
function activate(): void {
  if (!state) return;
  const i = state.cursor;
  switch (state.mode) {
    case 'hub': { /* ...navigates via enter()/leaveTown(), no status of its own... */ break; }
    case 'shop-buy': {
      const id = SHOP_STOCK[i];
      if (id === undefined) return;
      const r = buyForLeader(id);
      setStatus(r.ok ? `Bought ${r.item} for ${r.price} steel.` : `Cannot buy: ${r.reason}.`);
      drawScreen();
      break;
    }
    // shop-sell / temple / training / tavern: identical shape -- setStatus(...) then drawScreen()
  }
}
```

**`apps/web/src/ui/town.ts:227-233`** (`enter()`, correctly resets `status` on every mode switch, via
`modeIntro()`) and **`:309-320`** (`leaveTown()`, also correctly sets a fresh string before navigating
away) — both confirmed by re-reading in full this round; neither is part of this gap.

**`apps/web/src/ui/town.ts:172`** (`buildView()`, the one place `status` is read into the render view,
unconditionally, no staleness check):

```ts
const view: TownView = { title, gold, lines, cursor: s.cursor, status: s.status || undefined };
```

**`packages/engine/src/render/townScreen.ts:45,106`** (`TownView.status` / `composeTownScreen`, the pure
compositor `drawScreen()` feeds) — the identical "draw whatever it holds, verbatim, no age/relevance
awareness" shape M99/M100 already found in `spellbook.ts`/`render/inventory.ts`:

```ts
status?: string;
...
if (v.status) drawText(fb, font, v.status.toUpperCase(), cell(2), rowY(22), C_WHITE);
```

**`apps/web/src/ui/town.ts:339-346`** (`onKey`, confirming `ArrowUp`/`ArrowDown` route directly to the
un-clearing `moveCursor()` in every mode, the only real input path for browsing rows):

```ts
switch (e.key) {
  case 'ArrowUp': e.preventDefault(); moveCursor(-1); return;
  case 'ArrowDown': e.preventDefault(); moveCursor(1); return;
  case 'Enter': case ' ': e.preventDefault(); activate(); return;
  case 'Escape': case 'Backspace': e.preventDefault(); back(); return;
}
```

Confirmed by re-reading `startTown()` in full: the only DOM listeners wired are this `keydown` handler
and a canvas `click` → `focus()` (`town.ts:399`) — there is no per-row click handler anywhere, so
`moveCursor()` (Arrow keys) is the *only* real way a player browses rows in any of the four locations,
exactly like M100's `inventory.ts` finding.

## Reachable in real, ordinary, shipped play — dynamic proof

**Static reachability, the full real chain:** open Town (`?town=1`, or the real `startTown()` call from
any game's own "return to town" flow) → select **Shop** (or Temple/Training Hall/Tavern) → cursor to any
row → activate the row (Buy/Heal/Train/Listen) → the status line shows the fresh confirmation → without
pressing Enter again or leaving the mode, press ArrowUp/ArrowDown to look at other rows (the single most
ordinary way to compare prices/eligibility before a second purchase or a second party member's turn to
train — this is precisely the "pre-hoc, browse-before-you-commit" workflow M51 itself praised this
screen for supporting). The stale confirmation persists under the different row.

**Dynamic re-derivation this round** (a throwaway Puppeteer script, mirroring `e2e.mjs`'s own
`runTown()` party-seeding setup exactly — same `?create=1` Sturm/Goldmoon build, same gold seed, same
`window.__town` seam — created, run, then deleted, per the brief's preference for driving a real
headless browser session over a pure vitest call for a DOM-adjacent UI-state claim):

```
1. ?create=1 -> Sturm (human fighter L1) + Goldmoon (human cleric L1) -> both added, gold=9000
2. ?town=1   -> window.__town live
3. window.__town.select(0); window.__town.activate()     -- front-door: select 'Shop' at the hub
     mode() === "shop-buy", status() === "The armourer shows his wares."   (fresh, via enter()/modeIntro)
4. window.__town.activate()                                -- Buy the cursor-0 row (Long Sword, id 10)
     status() === "Bought Long Sword for 15 steel."         (real, unmodified activate())
5. window.__town.move(1)     -- ordinary ArrowDown, no second activate()/mode-change in between
     cursor() -> 1 (moved), status() -> STILL "Bought Long Sword for 15 steel."
6. window.__town.move(1)     -- a second ordinary move, further from the purchase
     status() -> STILL "Bought Long Sword for 15 steel."
7. window.__town.back()      -- contrast case: back()->enter('hub') DOES correctly reset it
     status() -> "Where to in town?"
8. Second sub-case (Training Hall): select 'Training Hall', activate, select Sturm's row, activate (Train)
     status() === "Sturm trains to level 2! (+8 HP, 2000 steel)"
   window.__town.move(1)     -- ordinary browse to Goldmoon's row, no other action in between
     status() -> STILL "Sturm trains to level 2! (+8 HP, 2000 steel)"

RESULT (captured verbatim from the real, unmodified, current production code):
{
  "modeAfterEnter": "shop-buy",
  "statusAfterEnter": "The armourer shows his wares.",
  "statusAfterBuy": "Bought Long Sword for 15 steel.",
  "goldAfterBuy": 8985,
  "cursorAfterMove": 1,
  "statusAfterMove1": "Bought Long Sword for 15 steel.",
  "statusAfterMove2": "Bought Long Sword for 15 steel.",
  "staleStatusBugAfterOneMove": true,
  "staleStatusBugAfterTwoMoves": true,
  "statusAfterBack": "Where to in town?",
  "backCorrectlyResets": true,
  "statusAfterTrain": "Sturm trains to level 2! (+8 HP, 2000 steel)",
  "statusAfterTrainMove": "Sturm trains to level 2! (+8 HP, 2000 steel)",
  "trainStaleBug": true
}
```

This ran against the real, unmodified, currently-shipped `town.ts`/`render/townScreen.ts` production
code, driving a real headless Edge session through the real `window.__town` seam (`move()` calls the
real `moveCursor()`, `select()`/`activate()` call the real `moveCursor`-adjacent handlers — no
fixtures, no mocks). The script (`apps/web/test/_scratch_m101_verify.mjs`) was created, run (output
captured above, both the Shop-buy and Training Hall sub-cases reproduced the stale-status bug and the
`back()` contrast case correctly cleared it), then deleted before writing this document; `git
status --porcelain` confirmed clean before and after, this doc the only new file.

**The Temple (Heal/Raise) and Tavern (Listen) sub-cases are the identical mechanism, not separately
re-run**: they set `state.status` through the exact same `setStatus()` call inside the same `activate()`
function, subject to the identical `moveCursor()`-never-clears omission by construction — flagged as
**(inferred)** from the shared code path, since re-running them would exercise no new branch of
`moveCursor()` itself (matching M100's own identical treatment of its "NO ONE TO GIVE TO" sub-case).

**Why the existing e2e test never caught this:** `runTown()` (`e2e.mjs:3886`) exercises Buy/Sell/Heal/
Raise/Train exclusively through **direct action seams** (`window.__town.buy(id)`, `.sell(i)`, `.heal()`,
`.train(name)`) that call `buyForLeader`/`sellFromLeader`/`templeHealAll`/`trainMember` **directly**,
bypassing `activate()`/`setStatus()`/the cursor entirely — confirmed by re-reading the seam wiring
(`town.ts:420-424`: `buy: (id) => buyForLeader(id)`, not `activate()`). The only place `runTown()`'s
sibling test touches `activate()`/`status()` at all is `runDqkTownLeave()` (`e2e.mjs:4159-4165`), which
uses `select(4)`/`activate()` purely for the hub's "Leave" row and never reads `status()`. **No existing
e2e case has ever read `window.__town.status()` after any action, in any mode, let alone after a
subsequent cursor move** — a genuine, wholly unexercised gap in coverage, the same shape M97/M99/M100
each named (not M86/M89/M90/M95/M96's "test bakes in a wrong value").

## Proposed minimal fix (not applied this round — audit scope is research only)

**One line, in the exact spot `magic.ts`'s and `inventory.ts`'s own already-fixed `moveCursor()`
functions place their own clear** — purely additive, matches the established convention in both sibling
files M99/M100 already fixed:

```ts
// sketch, not applied this round -- apps/web/src/ui/town.ts
function moveCursor(delta: number): void {
  if (!state) return;
  const n = Math.max(1, rowCount());
  state.cursor = ((state.cursor + delta) % n + n) % n;
  setStatus(''); // M101 — a Buy/Heal/Train/Listen confirmation is stale the moment the player looks elsewhere
  drawScreen();
}
```

Notes on the sketch:
- **Uses `setStatus('')`, not a bare `state.status = ''`**, unlike `magic.ts`/`inventory.ts` — `town.ts`'s
  `setStatus()` helper is the one function that also mirrors the message into a legacy `#status` DOM
  element (`town.ts:201-208`) for callers outside the canvas view; calling it (not just assigning the
  field directly) keeps both sinks in sync, matching every other call site in this file.
- **Purely additive, one file, one line.** No change to `render/townScreen.ts`, `party.ts`, `shop.ts`, or
  any other consumer.
- **No other handler needs touching.** `activate()` (every mode) and `enter()`/`leaveTown()` already set
  a fresh `status` unconditionally on every call — confirmed by re-reading all four in full this round;
  this is a single-site gap, exactly like M100's `inventory.ts` finding (not a multi-site one like M99's
  `magic.ts` finding).
- **The e2e regression this fix should add** (mirrors M92-M100's own "the fix and its test travel
  together" discipline): extend `runTown()`'s existing shop-buy step with a route through the real
  `activate()`/`status()`/`move()` seam (not just the direct `buy()` seam it uses today) — e.g. `select(0)`
  into shop-buy, `activate()` to buy, assert `/Bought/i.test(status())`, then `move(1)` and assert
  `status() === ''` — a genuine regression-catcher, since it is `''` under the fix and the stale string
  under today's code. This also closes the pre-existing coverage gap noted above (no e2e case reads
  `status()` after any action today, at all).

## Secondary observations not part of this round's fix

- **This is the third file in a row with this exact taxonomy shape** (`magic.ts` M99, `inventory.ts`
  M100, `town.ts` this round) — and, notably, the third in the "cursor-move handler is the missing
  sibling" *direction* specifically (M100's direction), not the "action handlers are the missing sibling"
  direction (M99's). Two data points in the same direction (M100, M101) vs. one in the other (M99) is not
  strong enough evidence to say one direction is more common — the small sample is more likely explained
  by all three UI files sharing a common code-organization convention (a `moveCursor()` written once,
  early, before any transient-message field existed to remind the author) than by a deeper asymmetry.
- **`select()` (town.ts's own e2e-only seam, `town.ts:415`) shares the identical omission mechanically**
  (`select: (i) => { if (state) { state.cursor = i; drawScreen(); } }`, no `setStatus()` call) but is
  **not reachable in real ordinary play** — confirmed by `grep -rn "__town\.select\|\.select(" apps/web/src
  apps/web/test/e2e.mjs` outside `e2e.mjs` itself → zero hits in `apps/web/src`, and only one hit inside
  `e2e.mjs` (`runDqkTownLeave`'s `select(4)` for the hub's "Leave" row, which never reads `status()`).
  Noted for completeness only, mirroring M100's identical treatment of `inventory.ts`'s own `select()`.
- **The `rumour` field (Tavern mode) is a different, correctly-persistent mechanism, not part of this
  bug** — `activate()`'s tavern branch sets `state.rumour = i` to mark which rumour row stays highlighted
  (`town.ts:166`, `297`) as an intentional "already listened to" indicator that is *meant* to survive a
  cursor move; it is not the transient-confirmation field this finding is about (`status`), and is
  unaffected by the fix above.
- **This finding does not contradict M51's "town.ts is already a strong positive pattern-doing-it-right
  example"** — M51 examined a different axis (whether a cost/eligibility fact is shown **pre-hoc**, before
  the player commits to an action; town.ts does this correctly, with disabled-row colouring for anything
  unaffordable). This round's finding is about the **post-hoc** action-result string's lifecycle across a
  later, unrelated cursor move — an axis M51 never checked, the same way M42/M43's `InventoryView` sweep
  (an unconsumed-field question) never checked `inventory.ts`'s lifecycle question that M100 later found.

## Rejected alternatives considered this round

| Candidate | Why rejected |
|---|---|
| DoK-import `CoreClassId` excluding ranger/knight (M32/M86/M94-M100) | Re-confirmed still true, still correctly scoped; no new angle found this round. |
| `createCharacter()`'s missing per-class ability-score minimums (M94-M100) | Re-confirmed still open, still a two-part fix; not picked, consistent with prior rounds. |
| DQK's distinct "Paladin" row (M93-M100) | Still **UNKNOWN**; no new primary source consulted this round. Left open. |
| A full page-image re-derivation of one more CoK/DoK numeric table (M96's closing suggestion) | Still a from-scratch transcription-verification sweep with no code-reachability angle; this round's actual pick was found by directly following up on M100's own named unswept candidate, and turned out sharper. |
| `combat.ts`/`dqkExplore.ts` for the same "some siblings clear, one doesn't" shape (M100's other two named candidates) | Both grepped this round (`status\|flash\|note\b\|message`) — `combat.ts` has a `status` word only in unrelated tactical-spell-effect senses (`{ kind: 'web', status: 'held', ... }`, monster affliction state, not a UI transient-message field) and a combat log (`pushLog`) that is append-only, never "cleared," so the shape doesn't apply structurally. `dqkExplore.ts` has a `status: string` field but it is the terminal VM's phase (`exited`/`halted`/`awaiting-input`/`combat`), not a transient per-action confirmation text, and its `gb-note` DOM elements are freshly created/removed per render, not a persistent field with a clearing discipline at all — a structurally different mechanism. Neither is a fresh instance of this specific shape; `town.ts` was picked instead and paid off. |
| Re-litigating `select()`'s identical mechanical gap in town.ts as a second finding | Considered, but `select()` is not reachable by any real player action (e2e-seam-only, see "Secondary observations") — including it as part of the headline finding would overstate reachability, exactly matching M100's own treatment of the identical question for `inventory.ts`. |

## Open questions / unknowns

- **Whether `select()` should also be patched for e2e-seam hygiene**, even though it's not required for
  player-reachability — the same minor completeness question M100 left open for `inventory.ts`'s
  `select()`, now also open for `town.ts`'s.
- **Whether any further overlay beyond `magic.ts`/`inventory.ts`/`town.ts` still holds this shape** —
  this round checked `combat.ts` and `dqkExplore.ts` (both of M100's other two named candidates) and
  found the shape does not structurally apply to either (see rejected-alternatives table above); `town.ts`
  was the one hit. No further named candidate remains from M100's list. A future round would need a fresh
  sweep of other overlays (e.g. `dialogue.ts`, `charEditor.ts`, `journal.ts`, `automapPanel.ts`) not yet
  checked for this specific shape, if it wants to continue this particular thread.
- **M98/M99's own two still-open questions** (deity-note on `charSheet.ts`'s footer; whether "Extra
  spells" should ever become a real mechanical grant) remain exactly as left — untouched by this round.

## Implications for our engine / for the taxonomy

- **Confirms the "clear-on-every-sibling-action" shape generalizes to a third, heavily-audited file**,
  and specifically that a file being the single most-mined file in the whole loop (37 prior audit hits
  across `town.ts`) is no guarantee a structurally distinct question hasn't gone unasked — the 37 prior
  hits collectively examined at least six *different* axes (catalogue coverage, pricing wiring, day-
  wiring, pre-hoc display, a stale comment, navigation routing) without ever asking the M99/M100 "is the
  clearing discipline applied to every sibling handler" question specifically.
- **A second confirmed instance of "an audit's own closing 'unswept candidate' list paying off directly"**
  — M100 explicitly named `town.ts` (plus `combat.ts`/`dqkExplore.ts`) as unswept for this exact shape,
  and checking the first of the three found a real, verified, reachable bug immediately, while the other
  two were checked and correctly ruled out on structural grounds (not merely skipped) — a clean example of
  triaging a named list rather than picking blindly.
- **The "same-commit, day-one omission" origin story (this round) vs. "field bolted on later, sibling
  never revisited" (M100)** are both instances of the identical runtime shape but arise from different
  authorship histories — worth naming because it shows this taxonomy sub-case doesn't require a
  multi-commit history to arise; a single author, in a single sitting, writing a cursor-move handler
  before any transient-message field exists in their own mental model of the screen, is enough on its own.

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `apps/web/test/_scratch_m101_verify.mjs` (a throwaway Puppeteer script, mirroring `e2e.mjs`'s own
  `runTown()` party-seeding setup, driving a real headless Edge session against the real dev-built app on
  a scratch port distinct from `e2e.mjs`'s own 5180) — run once (output captured verbatim above, both the
  Shop-buy and Training Hall sub-cases reproduced the stale-status bug, and the `back()` contrast case
  reproduced the correct reset), then deleted. `git status --porcelain` confirmed clean before and after,
  this doc the only new file.
