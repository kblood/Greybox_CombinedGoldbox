# M63 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done-section entries for M58.S1–M62.S1 in full,
> and `docs/engine/research/m62-audit.md` in full (its "Rejected alternatives investigated this
> round", "Open questions / unknowns" and "Implications" sections in particular), per the brief.
> Per the brief's own steer, this round FIRST evaluated M62's own two flagged follow-ups honestly —
> **both declined**, for reasons that clear the bar the brief set ("pick one up ONLY if it's genuinely
> small... not by default"):
>
> 1. **The wilderness "moon bar" Companion DOM widget** (`.gb-moonbar`/`renderMoons()` parity with
>    `explore.ts`) — traced and declined. `wilderness.ts` has **zero** companion-panel infrastructure
>    today (no `.gb-companion` container, no `.gb-party` HUD, no Companion button, no `openCompanion()`
>    call at all — confirmed by grep, see "Rejected alternatives"), unlike `explore.ts`, which built all
>    of that across M9-M54. Standing up the widget would mean duplicating ~85 lines of canvas/DOM
>    render logic (`blitMoonTile`/`drawMoonDisc`/`renderMoons`, `explore.ts:570-655`) plus two
>    module-private style tables (`MOON_STYLE`, `PHASE_LABEL`) that don't cross module boundaries
>    today — a new UI widget from scratch, not a small extension. Explicitly out of scope per this
>    round's own "no new UI panels" constraint.
> 2. **`wilderness.ts`'s `DEMO_PARTY` spell-save edge case** (`fightWanderers()` never sets
>    `launchCombat`'s `demo` flag) — re-verified this round: `spellSaveForMember('p1'|'p2'|'p3', day)`
>    (`apps/web/src/ui/party.ts:685-695`) is only ever reached when the **real** global roster is
>    empty (`partySize() === 0`, `wilderness.ts:201`), so `idx >= roster.length` is true for every
>    demo-party id and the function always returns `undefined` — confirmed safe by re-reading the
>    bounds check, no mismatch scenario exists (a real roster and `DEMO_PARTY` are never live at the
>    same time). Still just a theoretical near-miss, not an actual wrong result — stays declined per
>    the brief's own bar ("only pick up if... ACTUALLY causing a wrong result").
>
> With neither follow-up clearing the bar, this round swept broadly for a fresh sibling-screen /
> doc-comment-mining / unused-struct-field candidate (dqkExplore.ts's total absence of a day/clock/moon
> system, wilderness.ts's fully-decorative `WILD_MENU` command bar, `MoonPhaseMods`'s
> `additionalSpells`/`effectiveLevelMod` fields, `MonsterRecord`'s regen/half-damage/carried-item
> fields, DoK's import-table paragraph for any newly-named-but-unshown fact, `town.ts`'s stale
> `leaveTown()` comment) and found all of them either already fully wired, too large for a same-day
> slice, or previously investigated — see "Rejected alternatives" for the full list. The round then
> found a genuinely fresh candidate by re-examining `charSheet.ts`'s own doc comment, which explicitly
> flags the exact failure shape this loop looks for as **already having happened once** (M40.S1's
> `robe` fix) and invites a second look: **a character's real, mechanically-live movement rate
> (encumbrance-derived, feeding live tactical combat's move budget since CT.7k-1) is never shown on
> the one screen built to display a character's derived combat facts.**
>
> Confirmed via one throwaway `vitest` script (`packages/engine/test/_scratch_m63_verify.test.ts`,
> created, run — **3/3 green** — then deleted; `git status`/`git status --porcelain
> --untracked-files=all` clean before and after, only this doc left untracked). Full engine suite
> re-run after adding the scratch file, then again after deleting it: **1336 passed, 0 failed** both
> times (unchanged).

## Headline finding

### The gap: a party member's real, encumbrance-derived movement rate already drives their actual combat movement budget every fight, but is never displayed anywhere as a number — only a *different* fact (a qualitative encumbrance label) is shown, on a *different* screen

`apps/web/src/ui/party.ts:766-778` (`moveRateForMember`):

```ts
/**
 * A party member's **movement allowance** in tactical grid cells per round (CT.7k-1) — derived from their
 * carried-weight encumbrance move-rate (12" unencumbered down to 0" overloaded) via the engine's
 * 1e-inferred `moveRateToCells` map. Replaces combat's flat "move 5" placeholder. `undefined` for an
 * unmatched id (the combat layer keeps its placeholder for that figure).
 */
export function moveRateForMember(id: string): number | undefined {
  const idx = Number.parseInt(id.slice(1), 10) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= roster.length) return undefined;
  const sheet = roster[idx];
  const enc = encumbrance(inventoryWeightTenths(getInventory(sheet)), sheet.abilities.str, sheet.abilities.strPct);
  return moveRateToCells(enc.moveRate);
}
```

This is a **real, already-shipped mechanical consumer** (CT.7k-1, per `combat.ts`'s own doc comment),
not a hypothetical wire-up target. `apps/web/src/ui/combat.ts:334-339` (`makeTC()`):

```ts
// CT.7k-1 — a REAL party member fights with their EQUIPPED weapon + carried-weight movement rate from
// their character record (gated behind `demo`, exactly like CT.4b did for spells). The standalone
// `?combat=1` demo party (no roster behind it) keeps the placeholder synthesis below. A real member with
// no resolvable gear (helper returns undefined) also falls back, so the figure can always act.
const realWeapons = side === 'party' && !demo ? weaponsForMember(c.id) : undefined;
const realMove = side === 'party' && !demo ? moveRateForMember(c.id) : undefined;
```

`combat.ts:347` folds it straight into the `TacticalCombatant`'s `move` field: `move: realMove ??
(side === 'party' ? 5 : 4)`. That `move` value gates `reachableCells()` (`packages/engine/src/combat/
tactical.ts:456-470`), which drives the actual highlighted-cell movement range the player sees when
they select **Move** in combat (`combat.ts:1135,1159`, `reachableCount: () => state.combat.reachable().size`).
**The mechanism is real, live, and already shipped** — it is not the display that's missing, it's a
readable number the player can check *before* the fight starts.

**What IS shown today, and where, is a different fact.** `apps/web/src/ui/inventory.ts:66,75`:

```ts
const enc = encumbrance(inventoryWeightTenths(inv), sheet.abilities.str, sheet.abilities.strPct);
...
  encumbrance: enc.label,   // e.g. "UNENCUMBERED" / "LIGHT" / "MODERATE" / "HEAVY" / "OVERLOADED"
```

The **qualitative** encumbrance *level* is shown, but only on the pack/inventory screen
(`inventory.ts`), and only as a category label — never the *rate* (in AD&D inches, `Encumbrance.
moveRate`, `packages/engine/src/items/encumbrance.ts:19-25`) or the cells figure combat actually
consumes. Grepping every UI file for `moveRateForMember`/`moveRateToCells`/`enc.moveRate` confirms the
numeric value reaches exactly one place outside `combat.ts`'s own internals: the headless e2e seam
`combat.ts:1198`, `moveOf: (id) => state?.combatants.find((c) => c.id === id)?.move ?? null` — a test
hook, not a player-visible panel.

**Why the character sheet is the natural place, not a new panel.** `apps/web/src/ui/charSheet.ts:1-7`
(the file's own doc comment) describes the View screen as showing "the derived AC/THAC0/HP line" —
and its `toView()` function's own M40.S1 comment (`charSheet.ts:47-53`) already names this **exact**
failure shape and explicitly flags it as worth checking again:

```ts
/**
 * M40.S1 — the footer's third branch shows a mage's Robe of the Moons order. `.robe` already drives
 * two live mechanics (spell-slot effective level in `magic.ts`'s `casterInfo()`, and the combat
 * spell-save target in `party.ts`'s `spellSaveForMember()` → `combat.ts`), but was never shown on the
 * one screen built to display a character's permanent facts.
 */
```

Movement rate is the same shape: a fact with a real, already-shipped mechanical consumer
(`combat.ts`'s tactical movement budget, exactly parallel to `robe`'s spell-save/spell-slot
consumers), never shown on "the one screen built to display a character's [derived combat] facts."
`create.ts` (the character-creation live preview, already the established precedent-source for M59/M60's
Saves column) was also checked — no mention of movement/encumbrance anywhere in it either (grepped;
zero hits), so this isn't already shown redundantly on a different screen the way Abilities is.

## A prior round's own "not a gap" verdict used a shallower bar than this loop now uses

`docs/engine/research/m25-audit.md:245` investigated this exact field 38 rounds ago and waved it off:

> Encumbrance-driven movement penalty (`encumbrance().moveRate`) | **CANDIDATE**-labelled in its own
> source... | **Already fully wired regardless** — `party.ts`'s `moveRateForMember()` → `combat.ts`'s
> tactical move budget. **Not a gap**; also fails the "verified" bar for a *new* slice even if it were.

M25 used the same reasoning it also (in the same round) applied to `age`: "already fully wired" meant
*mechanically consumed*, not *displayed to the player*. **M40 later found that exact conflation was
wrong for `age`** — `docs/engine/research/m40-audit.md`'s Rejected-alternatives table shows `age` is
"exposed to **zero** UI, only to the `__explore.ages()` e2e seam" despite being "fully wired" in
M25's sense — and M40 declined `age` on **degeneracy** grounds (it can't realistically change in any
session), not because it was already shown. Applying M40's sharper standard to `moveRate` finds the
same shape M25 missed: "wired into a mechanical consumer" and "displayed to the player" are different
claims, and this project's own later, more careful round (M40) is the correct standard to re-apply,
not the earlier round's shallower one. **Re-confirmed by direct grep this round**: no UI file shows
the numeric move-rate or cells value anywhere; only the *qualitative label* is shown, on inventory.ts.

## Honest degeneracy check — this candidate is real but weaker-grounded than `robe`/AC/THAC0, and that matters

Unlike `robe` (varies by player choice) or THAC0 (varies 18-20 across the 6 real bundled CoK saves,
M59), this round's own verification found the **current, real, immediately-reachable value is flat**
for every one of the 6 real bundled CoK import pregens, using the exact starter-kit weight the app
actually seeds a fresh inventory with:

```
SIR STRONGSWORD (fighter, STR 18): kit 44.0 lb → UNENCUMBERED, 12"/5 cells
ISTAN HORBIN    (magicUser, STR18): kit  1.5 lb → UNENCUMBERED, 12"/5 cells
GARIN           (magicUser, STR18): kit  1.5 lb → UNENCUMBERED, 12"/5 cells
MOLLY           (thief, STR 16):    kit 16.0 lb → UNENCUMBERED, 12"/5 cells
KAL             (cleric, STR 15):   kit 33.0 lb → UNENCUMBERED, 12"/5 cells
SIRRION         (cleric, STR 18):   kit 33.0 lb → UNENCUMBERED, 12"/5 cells
```

All six land at the same "UNENCUMBERED / 12"" tier today — a real red flag, the same shape M40
rejected `age` for ("showing 'Age: 20' on every single character permanently... a static,
non-varying display"). **This is a genuine weakness of the candidate, not something to paper over.**

But the underlying **mechanism** is not degenerate the way `age`'s is — `age` structurally cannot
change within any realistic session (a 256-radix year-overflow). Movement rate demonstrably varies:

1. **Any created (not imported) low-Strength fighter/cleric/ranger is legal today** and would show it
   immediately. `docs/engine/research/cok-dragonlance-rules.md:50` (the manual's own ability-range
   table): Human fighter STR range is **3-18** — a player can create a STR-3-through-12 fighter right
   now via the shipped `create.ts` flow, no hypothetical. Verified this round: the identical fighter
   starter kit (Long Sword 40 + Shield 100 + Chain Mail 300 = 440 tenths, `party.ts`'s
   `CLASS_STARTER_KIT.fighter`, `packages/engine/src/items/baseItems.ts:68,73,80` for the weights) at
   **STR 8** computes to `MODERATE`, not `UNENCUMBERED` — reproduced this round via
   `encumbrance(440, 8, 0)` → `{ level: 'moderate', moveRate: 6 }` → `moveRateToCells(6) === 3` (half
   the unencumbered figure).
2. **Any character's encumbrance shifts the moment their inventory changes** — post-combat treasure,
   town shopping (`town.ts`'s `buyForLeader`), or dropping/readying gear (`inventory.ts`) all feed the
   same `inventoryWeightTenths()` call. This is not a frozen, one-time-computed fact the way `sheet.ac`/
   `.thac0` are (baked once at creation/import) — `moveRateForMember()` recomputes live from *current*
   inventory every time it's called, same as `weaponsForMember()`.

**Precedent for shipping a currently-flat-but-mechanically-real fact already exists in this exact
project**: `docs/engine/research/m59-audit.md` shipped THAC0 as a column while noting in the same
breath that CoK's own AC field is "flat at 10 across all 6 pregens in this same save set" — and that
flatness (candidate #12 on the standing list) has never blocked AC from being shown; it's tracked as
an accepted, unexplained curiosity, not a display-disqualifying defect. This round's finding is the
same shape: real mechanism, real consumer, momentarily-flat real data, not a structurally-frozen one.

## Real-data / real-mechanic verification (this round)

Reproduced via `packages/engine/test/_scratch_m63_verify.test.ts` (created, run, **3/3 passed**, then
deleted):

1. **All 6 real bundled `Champions of Krynn/SAVE/CHRDATA{1-6}.SAV`** decode via the engine's own
   `decodeSavedCharacter`, class-inferred via the same heuristic `importParty.ts`'s `inferClass` uses,
   and run through the exact `CLASS_STARTER_KIT` weights `party.ts` seeds a fresh inventory with →
   `encumbrance()` → `moveRateToCells()`. Result: real, non-stub data (6/6 decoded), but degenerate
   today (all 6 tie at `UNENCUMBERED`/5 cells) — see "Honest degeneracy check" above.
2. **The underlying mechanism is not degenerate**: the identical fighter starter-kit weight (440
   tenths) at STR 8 computes `MODERATE` (`moveRate: 6`, 3 cells) vs. the magic-user starter-kit weight
   (15 tenths) at the same STR 8 computing `UNENCUMBERED` (`moveRate: 12`, 5 cells) — a real,
   reproducible difference driven by the same real `encumbrance()`/`moveRateToCells()` functions
   `moveRateForMember()` calls, not a hypothetical formula.
3. **Type/plumbing sanity**: `moveRateToCells(encumbrance(...).moveRate)` returns a plain `number` for
   every input tried — no new decode work, no new engine function, every piece already exported from
   `@goldbox/engine` and already imported by `party.ts`.

Full engine suite re-run after adding the scratch file (1339 = 1336 + 3 new), then again after
deleting it: **1336 passed, 0 failed** both times. `git status` / `git status --porcelain
--untracked-files=all` clean except this doc.

## Wiring plan

**Two files touched** (`charSheet.ts` in the engine package's render layer, `charSheet.ts` in
apps/web) plus a small e2e extension and one new engine-package unit test extending an existing file —
no new UI panel, no new route, no new decode path, and `companionPanel.ts`'s "char" tab picks the fix
up **for free** (it already calls the exact same `toView`/`composeCharSheet` pair, `companionPanel.ts:
44,221-226`).

1. **`packages/engine/src/render/charSheet.ts`** — add an optional `move` field to `CharSheetView`
   (mirrors the AC/THAC0/HP shape exactly) and draw it as a 4th row in the existing "combat" block:

   ```ts
   // CharSheetView (charSheet.ts:35-52) — add after maxHp:
   /**
    * M63.S1 — the party member's current encumbrance-derived movement rate, in AD&D inches (12
    * unencumbered down to 0 overloaded, {@link Encumbrance.moveRate}) — the same real, already-live
    * fact `party.ts`'s `moveRateForMember()` feeds into actual tactical-combat movement every fight
    * (`combat.ts`'s CT.7k-1 `realMove`). Optional so callers that don't compute it (or a synthetic
    * test sheet) simply omit the row. Undefined ⇒ row is skipped, not shown as "MV 0".
    */
   move?: number | string;
   ```

   ```ts
   // composeCharSheet (charSheet.ts:100-110) — before:
   const combat: [string, string][] = [
     ['AC', String(s.ac)],
     ['THAC0', String(s.thac0)],
     ['HP', `${s.hp}/${s.maxHp}`],
   ];

   // after:
   const combat: [string, string][] = [
     ['AC', String(s.ac)],
     ['THAC0', String(s.thac0)],
     ['HP', `${s.hp}/${s.maxHp}`],
     ...(s.move !== undefined ? ([['MV', String(s.move)]] as [string, string][]) : []),
   ];
   ```

   This lands the new row at `r = 6 + 3 = 9`, same columns (label col 20, value col 30) — see "Layout
   / feasibility check" below for why row 9 is free on the right-hand side.

2. **`apps/web/src/ui/charSheet.ts`** — compute the live encumbrance-derived rate in `toView()`
   (`charSheet.ts:55-85`), reusing the exact functions `party.ts`'s own `moveRateForMember()` already
   calls (no new decode, no new engine export):

   ```ts
   // imports (charSheet.ts:12-27) — add to the existing @goldbox/engine import list:
   encumbrance, inventoryWeightTenths,
   // and add getInventory to the existing party.js import:
   import { getParty, classLabel, getInventory } from './party.js';
   ```

   ```ts
   // toView() body (charSheet.ts:55-65) — after `const ab = s.abilities;`:
   // M63.S1 — the same live encumbrance computation party.ts's moveRateForMember() does for real
   // combat (CT.7k-1), recomputed here (not read from a stored field — CharacterSheet doesn't carry
   // one) so a re-equip is reflected the next time the sheet is opened, same as AC already is.
   const enc = encumbrance(inventoryWeightTenths(getInventory(s)), ab.str, ab.strPct);
   ```

   ```ts
   // returned object (charSheet.ts:65-85) — add alongside ac/thac0/hp/maxHp:
   move: enc.moveRate,
   ```

   **Unit choice (flagged as an open question, not decided here):** this plan shows the raw AD&D
   **inches** figure (`enc.moveRate`: 12/9/6/3/0), not the combat-cells conversion
   (`moveRateToCells(enc.moveRate)`, e.g. 5/4/3/1/0) `combat.ts` actually consumes. Reasoning: inches
   is the more directly primary-sourced AD&D-1e stat (`Encumbrance.moveRate`'s own doc: "Combat/
   exploration movement rate in inches (AD&D\")"; echoed by the real per-character "Movement Rate"
   byte field in the FRUA-family `.cch` format, `hackdocs_extracted/CCHFORM.TXT:134`, right alongside
   the five saving-throw bytes this screen already shows), whereas the cells conversion is this
   project's own **labelled inference** (`packages/engine/src/items/combatEquip.ts:56-66`: "the Krynn
   games' own move-rate→square table is cross-overlay/UNLOCATED, so this mapping is the labelled
   inference"). Showing inches avoids presenting an inferred internal constant as if it were a sourced
   game fact, while still being the direct upstream input to the number combat actually uses. See
   "Open questions" for the case for showing cells instead.

3. **Tests** (extend two existing files — no new test file for the engine-package check, no new e2e
   test id):
   - `packages/engine/test/charSheet.test.ts` — add one test mirroring the existing AC-column test
     (`charSheet.test.ts:65-69`) exactly:
     ```ts
     it('draws the MV row on the right at row 9 when sheet.move is set', () => {
       const fb = composeCharSheet({ font: solidFont(), sheet: { ...SHEET, move: 12 } });
       // 'MV' label at col 20 row 9 → pixel (160, 72) green.
       expect(px(fb, 160, 72)).toBe(10);
     });
     it('omits the MV row when sheet.move is undefined (existing SHEET fixture)', () => {
       const fb = composeCharSheet({ font: solidFont(), sheet: SHEET });
       expect(px(fb, 160, 72)).toBe(0); // interior stays black — no 4th combat row drawn
     });
     ```
   - `apps/web/src/ui/charSheet.ts`'s `__sheet` seam (`charSheet.ts:237-247`) — add a `move` getter
     mirroring the existing `footer` getter:
     ```ts
     move: () => { const s = session?.party[session.cur]; return s ? toView(s, '').move ?? null : null; },
     ```
   - `apps/web/test/e2e.mjs`'s existing `runExplore` sheet block (`e2e.mjs:609-660`, the same block
     that already reads `window.__inv.encumbrance()`) — add one line reading the new seam and fold a
     consistency check into the existing `sheetOk`/`invOk` composition (no new e2e case id):
     ```js
     // after reading `enc` (e2e.mjs:642):
     const sheetMove = await page.evaluate('window.__sheet.move()');
     // consistency: this fixture's fresh fighter is UNENCUMBERED per `enc`, so MV should read the
     // unencumbered inches figure (12), not null/undefined.
     const moveOk = enc === 'UNENCUMBERED' ? sheetMove === 12 : typeof sheetMove === 'number';
     ```

Rough size: 1 new optional interface field + ~4 LOC array-spread change + 1 doc comment in the
engine's `charSheet.ts`; 2 import additions + ~2 LOC in `toView()` + 1 field in the returned object in
apps/web's `charSheet.ts`; 1 new e2e seam getter (1 line); ~3 LOC extending the existing `runExplore`
sheet block; 2 new unit tests extending the existing `charSheet.test.ts` file (no new test file).
Engine test count should go from 1336 → 1338 (two new tests in the existing file, matching this
round's own scratch-verified numbers before deletion).

## Layout / feasibility check

Following M40.S1's own established method for this exact fixed-layout screen (row-count caps don't
apply here — `composeCharSheet` is a fixed-position layout, not a `referenceDb.ts`-style scrolling
list; the real constraint is per-line character width and row collisions):

- **Row availability**: the right-hand "combat" block currently draws 3 rows at `r = 6+i` for `i in
  0..2` → rows 6, 7, 8 (AC/THAC0/HP). Row 9 (the 4th slot, `i=3`) is confirmed empty today — nothing
  else in `composeCharSheet` writes to columns 20/30 at row 9 (the next thing drawn after the combat
  block is the `'SAVING THROWS'` header at row 13, `charSheet.ts:113`). The left-hand ability column
  *does* use row 9 (Dex, the 4th of 6 abilities, `r = 6+3 = 9`) — but at columns 2/8, not 20/30, so
  there is no pixel overlap between the new MV row and the existing Dex row; this is the identical
  non-collision AC/THAC0/HP already rely on for rows 6-8.
- **String width budget**: the value column (col 30) already renders HP as `"44/44"` (5 characters)
  with no truncation issue; the new MV value (`"12"`, `"9"`, `"6"`, `"3"`, or `"0"` — at most 2
  characters) is well under that established budget.
- **No collision with the footer or command bar**: rows 10-12 stay blank either way; row 13
  (`SAVING THROWS`) and below are untouched by this change.
- **Optional field, zero risk to existing callers**: `move` is optional on `CharSheetView`; every
  existing test fixture and caller that doesn't set it (e.g. `charSheet.test.ts`'s `SHEET` fixture)
  renders exactly as before (confirmed by the "omits the MV row" test above).

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **M62's wilderness "moon bar" Companion widget follow-up** | Declined — `wilderness.ts` has zero companion-panel infrastructure (no `.gb-companion`/`.gb-party`/Companion button/`openCompanion()` call anywhere in the file, confirmed by grep), unlike `explore.ts`'s fully-built-out version; standing it up would duplicate ~85 lines of DOM/canvas render logic plus two module-private style tables that don't cross module boundaries today. A new UI widget, not a small extension — out of scope per this round's own "no new UI panels" constraint. |
| **M62's `DEMO_PARTY` spell-save edge-case follow-up** | Re-verified and re-confirmed harmless: `spellSaveForMember` is only ever called with `DEMO_PARTY`'s ids when the real roster is empty (`roster.length === 0`), so the bounds check (`idx >= roster.length`) always fires and the function always returns `undefined` — no mismatch scenario exists, since a real roster and the demo party are mutually exclusive by `fightWanderers()`'s own ternary. Still a theoretical near-miss only, not an actual wrong result; stays declined. |
| **dqkExplore.ts gaining a day/clock/moon system to match explore.ts/wilderness.ts** | Investigated via grep: `dqkExplore.ts` has **no** `clockMinutes`/`gameDay`/`clock` concept at all — this isn't a display gap, it's an entire missing subsystem (DQK's own game clock has never been modelled). Far bigger than a same-day wiring slice; not pursued. |
| **`wilderness.ts`'s `WILD_MENU` command bar (Look/Camp/Map/Exit) being fully decorative** | Investigated: `onKey()` only handles arrow-key movement; `menuSel` is hardcoded to `0` and never changes, and none of Look/Camp/Map/Exit has any handler at all (confirmed by grep — no `case` for them anywhere). Real, but this is a **missing-feature** gap (UI affordance with no backing behaviour), not this loop's "decoded value with a real consumer, silently dropped before display" shape, and implementing four new travel-screen verbs from scratch is a materially bigger job than a same-day wiring fix. Flagged in Open Questions as a larger follow-on, not fixed here. |
| **`MoonPhaseMods.additionalSpells`/`.effectiveLevelMod`** | Already fully wired — `apps/web/src/ui/magic.ts:87-107`'s `casterInfo()` folds both into the mage's effective spell-slot table live. Not a gap. |
| **`MonsterRecord.regenPerRound`/`.halfDamage`** | Already shown — `referenceDb.ts:139-140` renders both as bestiary rows (`Regen`/`Half Dmg`) when present. Not a gap. |
| **`MON{n}ITM.DAX`'s raw item-name bytes as an alternative to expanding `BASE_ITEMS`' catalogue (standing candidate 4)** | Checked for a narrow angle: `monsterSideTables.ts:34` documents the record's leading name-shaped region as "editor/runtime scratch (often raw garbage in MON*ITM)" — there is no real name string to read instead of a `BASE_ITEMS` lookup; the gap really is catalogue coverage (data-entry), confirming M58's original scoping rather than opening a cheaper path. Not pursued. |
| **`town.ts`'s stale `leaveTown()` comment** ("The wilderness is the natural place to go; if it is not wired, just note it.") | The route it hedges about (`?wild=1`) has been fully wired since before this loop's numbered phases — the comment is simply stale, not a display gap; no behaviour to fix. |
| **Standing candidates 3, 4, 5, 6, 7, 8, 9, 10, 11, 12** (Abilities precedent, `BASE_ITEMS` coverage, DoK xp/hp gap B5, `runItemPluses` e2e hardening, `referenceDb.ts` Class-label collision, dialogue/town day-wiring, CoK area-1 zero-item-plus curiosity, `saveStore.ts`/`DetectionMatch` fields, LILLITH's spell total, flat-AC-10 curiosity) | Not re-investigated — no new angle surfaced on any of them this round; a fresher, real, comparably-scoped candidate (movement rate) was found via the doc-comment-mining method before falling further down this list. |

## Open questions / unknowns

- **Inches vs. combat-cells for the displayed unit** (see "Wiring plan" step 2): this plan recommends
  showing `enc.moveRate` (raw AD&D inches: 12/9/6/3/0) rather than `moveRateToCells(enc.moveRate)`
  (the grid-cell figure combat.ts actually consumes: 5/4/3/1/0), reasoning that inches is the more
  directly primary-sourced AD&D-1e stat and avoids surfacing this project's own labelled-inference
  conversion constant as if it were a sourced fact. The counter-case: showing the **cells** number
  would be the *exact* figure the very next fight uses, with zero unit-conversion for the player to do
  themselves. Left as a judgement call for the lead, not resolved here.
- **Whether the original CoK "View" character screen ever displayed a Movement Rate stat at all** is
  **UNKNOWN** — this round found no primary-source screenshot/transcription confirming or denying it
  (checked `hackdocs_extracted/FRM_DESC.TXT`, `docs/engine/research/cok-dragonlance-rules.md`; the PDF
  manuals could not be read directly in this environment — no `poppler-utils`/`pdftoppm` installed).
  The FRUA-family `.cch` character-record format (a *related but distinct* format from CoK's own save)
  does store a "Movement Rate (Base)" byte at a fixed offset alongside AC/saves
  (`hackdocs_extracted/CCHFORM.TXT:134`), which is suggestive but not conclusive for CoK specifically.
  This plan follows M40.S1's own established practice of extending this fixed-layout screen with a
  real, mechanically-grounded stat when budget allows, without claiming pixel-exact screenshot parity
  (the screen's own row layout is itself acknowledged elsewhere as inferred, not scanned) — but the
  lead should treat "does the original screen show MV" as genuinely open, not settled.
- **The degeneracy caveat** (see "Honest degeneracy check"): today, all 6 real bundled CoK import
  pregens would show the identical `12"` value with the class-based starter kit. This is a real
  weakness flagged prominently above, mitigated (not eliminated) by (a) the mechanism itself being
  provably non-degenerate (a low-Strength fighter differs), and (b) this project's own precedent of
  shipping CoK's AC column despite its own flat-10-across-all-6-pregens quirk. Worth the lead's own
  judgement call, not a slam dunk the way `robe`/THAC0 were.
- **`WILD_MENU`'s fully-decorative command bar** (see "Rejected alternatives") is a real, larger
  follow-on: `wilderness.ts` renders Look/Camp/Map/Exit but implements none of them. Flagged for a
  future phase (each verb would need real behaviour authored, not just a wiring fix), not attempted
  here.

## Implications for our engine

- **A file's own doc comment can point at the SAME failure shape twice, and the second occurrence is
  worth checking even after the first was fixed.** `charSheet.ts:47-53`'s M40.S1 comment about `robe`
  ("was never shown on the one screen built to display a character's permanent facts") is, read
  again, a description of a *pattern*, not a one-off fact about `robe` specifically — re-reading a
  fixed file's own prior fix-comment for other candidates it implicitly describes is a cheap, targeted
  variant of "doc-comment mining" worth repeating on files that already got one fix from this loop.
- **An early round's "already wired, not a gap" verdict can rest on a bar a LATER round in the same
  project explicitly sharpened** — M25 (this project's own 25th round) waved off `moveRate` using the
  same "mechanically consumed = wired" reasoning it also used for `age`, and M40 (15 rounds later)
  showed that exact reasoning was insufficient for `age` (mechanically wired but shown nowhere).
  Re-applying M40's sharper "wired ≠ displayed" standard to M25's own `moveRate` verdict found the
  identical gap M25 missed. Old "not a gap" verdicts in this loop's own history are worth re-checking
  against whatever the CURRENT sharpest standard is, not treated as permanently settled just because a
  round once looked at the same field.
- **Not every strong candidate is cleanly non-degenerate, and that's worth stating plainly rather than
  either overselling or discarding the candidate.** This round's finding is real (genuine mechanical
  consumer, genuine non-degenerate underlying formula) but weaker-grounded on "real data varies today"
  than the loop's strongest picks (`robe`, THAC0) — closer in shape to the already-accepted flat-AC-10
  precedent than to a fresh, obviously-varying fact. Surfacing that tension explicitly (rather than
  quietly matching the strongest precedent's confidence level) keeps this loop's documentation
  trustworthy for the lead's actual go/no-go decision.
- **"Decorative command bar with zero backing behaviour" (`WILD_MENU`) is a distinct failure shape
  from this loop's usual "decoded value, no display" pattern** — worth naming for future rounds
  applying the sibling-screen method: sometimes the sibling screen comparison surfaces a UI affordance
  gap (a whole missing feature) rather than a data-display gap, and those two shapes need different
  size/scope judgements (a missing verb implementation is categorically bigger than threading an
  already-computed value one hop further).
