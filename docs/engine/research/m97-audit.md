# M97 audit — leaving DQK's own Town screen always routes back into Champions of Krynn's wilderness, never back to the Dark Queen of Krynn dungeon

> Audit method: read `docs/engine/research/m96-audit.md` in full first per the brief's mandatory first
> step, then skimmed `m93`/`m94`/`m95-audit.md` for the established taxonomy. `git log` confirms M94's,
> M95's, and M96's fixes are all **already shipped** (`93437bf`, `7af9357`, `07e7406`), so this round reads
> the current, already-more-advanced source, not a stale snapshot.
>
> **Triage of the four carried-forward threads** (per the brief's "pick one OR find something fresh,
> grep-check first" instruction):
> 1. DoK-import `CoreClassId` excludes ranger/knight (M32/M86/M94/M95/M96) — re-confirmed still true,
>    still correctly scoped as needing a new race/order signal DoK's save format doesn't carry. Not picked.
> 2. `createCharacter()` has no per-class ability-score minimums (M94/M95, investigated in depth M96) —
>    still open, still a two-part fix (ability floor + a not-yet-existing `alignment` field). Not picked.
> 3. DQK's distinct manual "Paladin" row vs. "Knight" (M93/M94/M95/M96) — still **UNKNOWN**. Not picked.
> 4. A full page-image audit of every CoK/DoK numeric table (M96's own closing "standing, not-yet-executed
>    idea") — not picked this round; scoping it to "one table" as M96 suggested would still be a
>    from-scratch sweep, and this round found a sharper, structurally-different candidate first.
>
> None of the four was picked. Instead, this round swept `apps/web/src/ui` for the M92/M93/M95 taxonomy
> shape ("a mechanism correctly serves the game it was built for, but is blindly reused, unmodified, by a
> second game that later began sharing it") **applied to navigation instead of a validation gate** — i.e.
> not "does a number-check reject the wrong thing" but "does an exit/return path route to the wrong
> place." `town.ts` (C4.3's own shared-screen precedent, already known to this loop via M92/M93's
> `levelCapRuleset` fix) was the natural place to look, since it explicitly serves **two** games
> (CoK/DoK's own town + DQK's, per its file doc and `openDqkTown()`) — and its "how do you leave" path
> turned out to have exactly this shape, unexamined by any prior round. Verified dynamically this round
> by actually driving a real headless Edge session through the exact real command sequence a DQK player
> would use (see "Reachable in real, ordinary, shipped play" below) — not just read statically.

## Headline finding

**`apps/web/src/ui/town.ts`'s `leaveTown()` — the only way out of the Town hub screen (selecting "Leave"
or pressing Escape at the hub) — unconditionally imports `wilderness.ts` and calls `startWilderness()`,
Champions of Krynn's own overland-travel screen, with no awareness that Town can now also be entered from
a live Dark Queen of Krynn dungeon session.** Since C4.3 (`7800d63`, 2026-06-22), DQK's own exploration
screen has shipped a real, ordinary, keyboard-reachable `(T)own` command (key `t`) that opens this exact
shared Town module (`dqkExplore.ts`'s `openDqkTown()`) — but when the player leaves, they are not
returned to the DQK dungeon they were exploring; they are silently teleported into **Champions of
Krynn's "Vale of Solace"** wilderness screen instead, with the DQK Heroes of the Lance roster (Sturm,
Caramon, Tanis, Goldmoon, Raistlin, Tasselhoff) now wandering a CoK map and fighting CoK wandering
monsters. This is not a crash or a visible error — the transition completes cleanly, with no console
error — so a player has no on-screen indication anything has gone wrong beyond "this doesn't look like
where I was a moment ago."

## Existing sibling/precedent and the self-flagging evidence

**Grep results (discipline #1), confirming this exact bug was never previously raised:**

```
$ grep -rn "leaveTown|openDqkTown|Town.*Leave.*DQK|DQK.*Leave.*Town|startWilderness.*dqk" docs/engine/research/m*-audit.md
m63-audit.md:33   — flags leaveTown()'s doc COMMENT as merely stale ("if it is not wired, just note
                    it" — the route WAS already wired) — never questions whether the route is the
                    RIGHT one for every caller.
m63-audit.md:363  — same verdict, table form: "The route it hedges about (?wild=1) has been fully wired
                    since before this loop's numbered phases — the comment is simply stale, not a
                    display gap; no behaviour to fix."

$ grep -n "leaveTown|openDqkTown" docs/engine/BUILD-QUEUE.md docs/engine/ROADMAP.md
(zero hits in either file)
```

M63 (2026-06-22, the same day C4.3 shipped `openDqkTown()`) looked at exactly this function and exactly
this doc comment, but only to confirm the *comment* was stale (the wilderness route existed, contradicting
the comment's hedge) — it never asked "is `?wild=1`/CoK's wilderness the correct destination for **every**
caller of `startTown()`," because at M63's own scope (a broad sweep of unrelated candidates, this being
one it explicitly declined) DQK's Town entry point was one bullet among many, not investigated in depth.
No round since has revisited `leaveTown()`. This is a genuinely fresh finding, not a re-proposal.

**The self-flagging evidence is `startTown()`'s own doc comment and inline documentation of the exact
mechanism M92/M93 already used to solve a structurally identical problem one field over:**

```ts
// apps/web/src/ui/town.ts:358-361 (current source, full)
/** Boot the town hub view (`?town=1`). Returns the number of hub locations (the render marker).
 * `levelCapRuleset` (default `'cok'`) selects which race/class level-cap table the Training Hall
 * enforces (M92.S1/M93.S1) — pass `'dqk'` for a DQK session, whose own manual prints a materially
 * more permissive, but not uncapped, table. */
export async function startTown(levelCapRuleset: 'cok' | 'dqk' = 'cok'): Promise<number> {
```

`startTown()` already has a precedent-setting parameter (`levelCapRuleset`) for "this screen serves two
games differently" — added by M92/M93 for the Training Hall's level-cap math — but the exact same
"which game is this for" question was never asked of `leaveTown()`'s exit route, a few dozen lines below
in the same file, despite the file's own doc comment at the top already stating outright: *"this
controller owns the demo town, navigation, asset loading..."* (`town.ts:13`) — "navigation" is exactly
the piece this round finds is only half-generalized.

## Where the severance happens — exact locations, current source

**`apps/web/src/ui/town.ts:60-61`** (`HUB`, unchanged since the file's creation, `b2cd1f0`):

```ts
const HUB = ['Shop', 'Temple', 'Training Hall', 'Tavern', 'Leave'] as const;
```

**`apps/web/src/ui/town.ts:247-254`** (`activate()`'s `'hub'` case — the real click/Enter handler for
selecting "Leave"):

```ts
case 'hub': {
  const loc = HUB[i];
  if (loc === 'Shop') enter('shop-buy');
  else if (loc === 'Temple') enter('temple');
  else if (loc === 'Training Hall') enter('training');
  else if (loc === 'Tavern') enter('tavern');
  else leaveTown();               // <-- the only branch for HUB[4] === 'Leave'
  break;
}
```

**`apps/web/src/ui/town.ts:320-327`** (`back()` — the Escape/Backspace handler, a SECOND, independent
path into the same bug):

```ts
function back(): void {
  if (!state) return;
  if (state.mode === 'hub') {
    leaveTown();                  // <-- Escape at the hub takes this same route
    return;
  }
  enter('hub');
}
```

**`apps/web/src/ui/town.ts:305-310`** (`leaveTown()`, the one function both paths converge on, full,
current source, unchanged since `b2cd1f0`, 2026-06-22 — predates C4.3's DQK Town entry point by hours):

```ts
function leaveTown(): void {
  setStatus('You leave town and return to the road.');
  // The wilderness is the natural place to go; if it is not wired, just note it.
  history.replaceState(null, '', `?wild=1`);
  void import('./wilderness.js').then((m) => m.startWilderness()).catch(() => setStatus('You leave town.'));
}
```

No parameter, no state check, no reference to `levelCapRuleset` or any other signal of which game
invoked `startTown()` — this function cannot distinguish its two real callers.

**`apps/web/src/ui/dqkExplore.ts:409-412`** (the real, ordinary keyboard command that reaches Town from a
live DQK session):

```ts
if (k === 'v') { e.preventDefault(); openDqkOverlay('sheet'); }
else if (k === 'm') { e.preventDefault(); openDqkOverlay('magic'); }
else if (k === 'i') { e.preventDefault(); openDqkOverlay('items'); }
else if (k === 't') { e.preventDefault(); void openDqkTown(); }
```

**`apps/web/src/ui/dqkExplore.ts:622-629`** (`openDqkTown()`, full, current source):

```ts
/** Enter the shared town/services screen with the DQK party loaded. M92.S1/M93.S1 — DQK's own manual
 * prints a materially more permissive, but not uncapped, race/class level-cap table, so the Training
 * Hall enforces DQK's own real ceiling here rather than CoK/DoK's (or none at all). */
async function openDqkTown(): Promise<number> {
  if (isCombatOpen() || isSheetOpen() || isMagicOpen() || isInventoryOpen()) return 0;
  installDqkParty();
  return startTown('dqk');
}
```

`dqkExplore.ts` exports exactly one function (`startDqkExplore`, confirmed via `grep -n "^export "
apps/web/src/ui/dqkExplore.ts` → a single hit) — there is no exported "resume/redraw the DQK explore
view" hook `town.ts` could call back into even if it wanted to, which is the structural reason
`leaveTown()` has nowhere sensible to go back to today besides its one hardcoded CoK route.

**Contrast with the established, correct pattern for the other three DQK Town-adjacent commands**
(`openDqkOverlay('sheet'|'magic'|'items')`, same file, lines 612-620): these are true **modal overlays**
(`openCharSheet`/`openMemorize`/`openInventory`, each with an `onClose` callback per `charSheet.ts:112,
126, 206-210`) drawn on top of the still-live DQK explore DOM — closing one reveals the *same* underlying
dungeon view untouched. `startTown()` is structurally different in kind: per its own file doc ("this
controller owns the demo town, navigation...") and the existing `runDqkTown` e2e comment (`e2e.mjs:2300-
2302`, quoted below), it **replaces the whole screen**, not a modal — so there is no "just close it"
option; leaving Town is the only way out, and that one way out is hardcoded to a different game.

## Reachable in real, ordinary, shipped play — static + dynamic proof

**Static reachability, the full real chain:** DQK dungeon session (`?dqk=1`, `startDqkExplore()`) → press
`t` (or the menu's "(T)own" command, `dqkExplore.ts:1183`) → `openDqkTown()` → `installDqkParty()` +
`startTown('dqk')` → the real Town of Solace screen, showing the real DQK Heroes of the Lance roster and
enforcing DQK's own level-cap table (the M92/93 fix, confirmed still correct) → select "Leave" from the
hub (or press Escape while at the hub — the only two ways out) → `leaveTown()` → `?wild=1` +
`startWilderness()`. No dev console, no save-editing, no contrived state — pressing one letter key twice
in an entirely ordinary DQK session reaches this.

**Dynamic re-derivation this round** (a throwaway Puppeteer script driving a real headless Edge session
against the real dev-built app — created, run, then deleted, mirroring `apps/web/test/e2e.mjs`'s own
`runDqkTrainCap`/`runTown` harness pattern exactly, since this is a DOM-navigation bug rather than a pure
data-derivation one, so the "re-run the real production functions" discipline here means "actually drive
the real UI seams in a real browser," not a `vitest` unit call):

```
1. page.goto('?dqk=1')                          -> DQK dungeon boots; window.__dqk.openTown exists
2. page.evaluate(window.__dqk.openTown())       -> real Town, real DQK roster:
     window.__town.party() -> ["STURM","CARAMON","TANIS","GOLDMOON","RAISTLIN","TASSLEHOFF"]
   location.search still "?dqk=1" at this point (startTown() hasn't touched the URL yet)
3. window.__town.open("hub"); .select(4); .activate()     -- selects HUB[4] === "Leave", real click path
4. (settle 1.5s for the async import('./wilderness.js'))

RESULT:
  location.search  ->  "?wild=1"                     (was "?dqk=1" before step 3)
  window.__wild     ->  now defined (Wilderness's own e2e seam booted -- confirms it's LIVE, not just URL)
  #status textContent -> "Loading overland map..."
  visible menu bar  -> "...Travel across the region...Vale of Solace -- original demo region."
  console errors    -> [] (zero -- a silent wrong-navigation, not a crash)
```

`wilderness.ts:201` (`partyCombatants()` used `partySize() > 0 ? partyCombatants() : DEMO_PARTY...`) reads
the exact same shared roster store `installDqkParty()` just populated — so this is not merely "the wrong
screen," it is "the wrong screen, populated with the DQK Heroes of the Lance as if they were CoK's own
party," on a CoK-specific map ("Vale of Solace") with CoK's own wandering-monster tables. The throwaway
script (`apps/web/test/_scratch_m97_verify_town_leave.mjs`) was created, run once (output captured above),
and deleted before writing this document; `git status --porcelain` confirmed clean before and after, this
doc the only new file.

**Why the existing e2e suite never caught this:** `runTown()` (`e2e.mjs:3867`) and `runDqkTrainCap()`
(`e2e.mjs:4068`) are the only two existing tests that touch this module, and both only ever enter Town
through the CoK-only path — `runTown()` via `page.goto('${BASE}/?town=1')` directly (`e2e.mjs:3896`,
bypassing `openDqkTown()` entirely), and `runDqkTrainCap()` via `window.__dqk.openTown()`
(`e2e.mjs:4095`) but **never exercises "Leave"** — it stops at asserting `levelCapRuleset() === 'dqk'`
and running `train()`, never calling `activate()`/`back()` from the hub. Neither existing test's own
assertions would change if `leaveTown()` were fixed or broken differently — this is a genuine, unexercised
gap in coverage, not a fixture baking in a wrong value (a different sub-shape than M86/M89/M90/M95/M96's
recurring "test asserts the wrong number" pattern — here the test simply never reaches the code path).

## Proposed minimal fix (not applied this round — audit scope is research only)

**Mirror `levelCapRuleset`'s own established shape**: thread a second, small, additive, default-preserving
signal through the same two functions that already carry the first one.

```ts
// sketch, not applied this round -- apps/web/src/ui/town.ts
/** Where "Leave" (hub select, or Escape-at-hub) returns the player: `'wilderness'` (default — CoK/DoK's
 * own overland travel, unchanged for every existing caller) or a caller-supplied callback for a game
 * that has its own "resume where you were" screen instead (DQK, M97). */
export async function startTown(
  levelCapRuleset: 'cok' | 'dqk' = 'cok',
  onLeave?: () => void,
): Promise<number> {
  // ...
  state = { ..., onLeave };
}

function leaveTown(): void {
  setStatus('You leave town and return to the road.');
  if (state?.onLeave) { state.onLeave(); return; }
  history.replaceState(null, '', `?wild=1`);
  void import('./wilderness.js').then((m) => m.startWilderness()).catch(() => setStatus('You leave town.'));
}
```

```ts
// sketch, not applied this round -- apps/web/src/ui/dqkExplore.ts
async function openDqkTown(): Promise<number> {
  if (isCombatOpen() || isSheetOpen() || isMagicOpen() || isInventoryOpen()) return 0;
  installDqkParty();
  return startTown('dqk', () => {
    history.replaceState(null, '', `?dqk=1`);
    void startDqkExplore();      // re-enter the DQK dungeon rather than CoK's wilderness
  });
}
```

All four existing `startTown()` call sites (`main.ts:463,945`, `mainMenu.ts:139`, `play.ts:48`) pass no
second argument, so `onLeave` stays `undefined` and `leaveTown()`'s behaviour for every one of them is
byte-for-byte unchanged — this is purely additive for the one caller (`dqkExplore.ts`) that needs it.

**Open design question this round leaves for the lead session (not resolved here):** `startDqkExplore()`
re-fetches/re-decodes DQK's assets from scratch and starts at the default entry position — it does not
restore the player's exact prior x/y/facing/mapIndex (confirmed: `dqkExplore.ts` persists only the
per-area **automap** exploration state, `persistAutomapModel`/`dqkAutomapStoreKey`, `dqkExplore.ts:272-
286` — no key stores raw player position). So this sketch fix is a **correct-game, wrong-spot** fix (you
land back in the Dark Queen of Krynn dungeon, not Champions of Krynn's wilderness — a real, large
improvement) rather than a **byte-exact "resume exactly where you left off"** fix, which would need a new
small position-persistence addition to `dqkExplore.ts` beyond this round's scope. Worth flagging to
whoever implements this rather than silently under-promising or over-promising the fix's completeness.

## Secondary observations not part of this round's fix

- **This is worse in kind than a wrong number** (M92-M96's shape) — those left a plausible-looking wrong
  value in a data field; this leaves the player in an entirely different, mechanically foreign screen
  (different assets, different encounter tables, different world geography) with no in-game explanation
  and no visible error. The "silent" part of "silent wrong value" here is "silent wrong *world*."
- **`hasDqkSeamAfter`/`hasTownSeamAfter` both still evaluate `true`** after the bug fires (confirmed in the
  dynamic run) — `window.__dqk` and `window.__town` remain defined as stale global references even though
  neither screen is actually live any more (the DOM under `#output` now belongs to `wilderness.ts`). This
  is a minor, pre-existing e2e-seam hygiene wrinkle (no seam is ever deleted on screen replacement anywhere
  in this codebase, confirmed by the same pattern in `runDqkTrainCap`'s own comment: *"__dqk's seams are
  gone after it"* — meaning non-functional, not literally removed) — not part of this round's fix, but
  worth noting for anyone writing a regression e2e test against this fix: checking `location.search` and
  `window.__wild`'s liveness is the reliable signal, not the mere presence/absence of `window.__dqk`.
- **CoK's and DoK's own Town entries are unaffected and correctly scoped** — `main.ts`'s "Town hub (CoK)"
  sidebar tech-demo entry (`main.ts:458-465`) and `mainMenu.ts`/`play.ts`'s in-game Town command all only
  ever reach Town from a CoK/DoK context where "leave to CoK's wilderness" is the objectively correct
  destination (same shared Krynn-trilogy overworld region, same ruleset default) — the fix must not touch
  their behaviour, and the sketch above doesn't.

## Rejected alternatives considered this round

| Candidate | Why rejected |
|---|---|
| DoK-import `CoreClassId` excluding ranger/knight (M32/M86/M94/M95/M96) | Re-confirmed still true, still correctly scoped as needing a new race/order signal; no new angle found. |
| `createCharacter()`'s missing per-class ability-score minimums (M94/M95/M96) | Re-confirmed still open, still a two-part fix (ability floor + a not-yet-existing `alignment` field). Not picked, consistent with M96's own scoping. |
| DQK's distinct "Paladin" row (M93/M94/M95/M96) | Still **UNKNOWN**; no new primary source consulted this round. Left open. |
| A full page-image re-derivation of one CoK/DoK numeric table (M96's closing suggestion) | Would still be a from-scratch transcription-verification sweep with no code-level "is this reachable/wired" angle; this round's actual pick was found via a structural sweep of the existing taxonomy applied to a new surface (navigation) and turned out to be sharper and more clearly reachable in ordinary play. |
| Fixing this round's finding by instead making `wilderness.ts` "DQK-aware" (detect a DQK party and refuse/redirect) | Rejected as a worse-shaped fix: it would leave `leaveTown()`'s own root cause (no caller-context awareness) unfixed and push a game-specific special case into a THIRD file (`wilderness.ts`) that has no reason to know about DQK at all, rather than the two files that already do (`town.ts`, which the level-cap fix already generalized, and `dqkExplore.ts`, which already owns the DQK-specific "how do I get back" answer for its other three commands via `onClose`). |

## Open questions / unknowns

- **Whether the fix should restore exact player position/facing**, not just the correct game/dungeon
  (see "Proposed minimal fix" above) — `dqkExplore.ts` has no existing position-persistence to lean on
  today; a lead session should decide whether "back in the right game, at the default entry point" is
  an acceptable first slice or whether position persistence should be bundled in.
- **Whether DoK's own dungeon session (if/when it gains a Town entry point of its own, distinct from
  CoK's) would need the identical `onLeave` treatment** — not investigated this round; DoK today has no
  Town entry of its own (confirmed: `grep -rn "startTown" apps/web/src/ui/explore.ts` → zero hits; DoK
  shares CoK's own `explore.ts`/wilderness path per the existing Gen1 DAX architecture, so CoK's
  wilderness IS the objectively correct DoK destination too, unlike DQK). Flagged only as a "if DoK ever
  gets its own separate town/world entry" contingency, not a currently-real gap.
- **The `onClose`-vs-`onLeave` naming/shape choice** — this round's sketch invents a new parameter name
  (`onLeave`) rather than reusing `charSheet.ts`'s existing `onClose` convention, since Town's own
  semantics ("leave to a specific destination," not "close back to what was already showing") are
  slightly different in kind from a modal overlay's close. A lead session may prefer unifying the naming
  regardless; not resolved here.

## Implications for our engine / for the taxonomy

- **A new taxonomy sub-case: the M92/M93/M95 "gate built for game A, blindly reused by game B" shape
  applies just as much to *navigation/routing* as to *validation*.** Every prior instance of this shape
  (M92's Training Hall cap, M93's DQK level table, M95's import search clamp) was about a **number**
  being wrong or a **rejection** firing incorrectly. This round's instance produces neither a wrong
  number nor a rejection — it silently transports the player to the wrong **screen entirely**, which is a
  more severe (in player-visible terms) but *harder to notice via unit-style testing* variant, since no
  `vitest` assertion on a pure function would ever surface it — only a real, DOM-driving e2e run does,
  which is why this round's verification method deliberately departed from the "throwaway vitest script"
  norm the last several rounds used, in favour of a throwaway Puppeteer script matching the codebase's
  own existing `e2e.mjs` idiom.
- **`startTown()`'s own `levelCapRuleset` parameter is direct, load-bearing precedent that this fix
  shape (thread a small per-caller-context signal through the shared function, default-preserving for
  every existing caller) is already an established, working pattern in this exact file** — the fix
  sketched above is not a novel mechanism, just the second half of a generalization M92/M93 started but
  did not finish (they generalized the Training Hall's *math*; this finishes generalizing the screen's
  *navigation*).
- **A concrete illustration of why "wired and reachable" checks must consider ALL of a shared screen's
  exit paths, not just its entry path** — five prior rounds (M26/M66/M72/M92/M94, per M96) checked
  whether a *gate* was reached; this round's bug lived in the one function every single path through Town
  eventually converges on to *leave* — a screen can be perfectly correctly entered (DQK's own roster,
  DQK's own level cap, both correct) while still stranding the player on the way out.
