# M42 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done section for M35–M41 in full, and
> `docs/engine/research/m41-audit.md` in full (its Rejected-alternatives / Open-questions /
> Implications sections in particular). Per this round's brief, swept files not yet checked at the
> field-by-field level — `dqkExplore.ts`, `automapPanel.ts` (both the `apps/web` host and the engine
> render file, every `MapCell`/`AutomapPanelInput` field, not just the already-rejected `doorsOpen`),
> `mainMenu.ts` (both layers), `combatScreen.ts` beyond the already-rejected `hpFraction`, and
> `combat.ts`'s non-`hpFraction` fields — using the same "compositor input type vs. every real UI
> caller" cross-reference M37–M41 used. Every real-mechanic claim below was independently re-derived
> this round via a throwaway `vitest` script
> (`packages/engine/test/_scratch_m42_combatdown.test.ts`, run, 3/3 green, then deleted — listed at
> the end). `git status --porcelain` is clean except this doc.
>
> **Headline pick: the tactical combat screen's right-hand party panel never shows that a party
> member has gone down mid-fight.** `apps/web/src/ui/combat.ts`'s `panelRows()` (line 491-496) —
> the one function that builds the `party` rows handed to the engine's `composeCombatScreen` — never
> calls the engine's own tested, live-consumed `TacticalCombat.conditionOf(id)`
> (`packages/engine/src/combat/tactical.ts:678`/`:1897-1903`), even though the exact same file
> independently derives the identical fact (`down: c.hp <= 0`) one function above, for the grid icon
> (`visibleCells()`, line 483). Worse: `composeCombatScreen`'s own doc comment on the `party` field
> *already promises* "active highlighted, **down grayed**" (`packages/engine/src/render/
> combatScreen.ts:166`), and the file already defines a `C_GRAY` constant commented
> `// downed member` (`combatScreen.ts:54`) — used only for the grid's prone-marker bar (`:223`), never
> for the party-panel text. A near-identical feature is *already shipped* one file over: the CoK main
> menu's own roster panel (`packages/engine/src/render/mainMenu.ts:59-61`, `:186`:
> `m.dead ? C_RED : m.down ? C_YELLOW : C_GREEN`) is fully wired end-to-end from `apps/web/src/ui/
> mainMenu.ts:63-65`'s `roster()`, which reads the real `PartyMemberStatus.down`/`.dead`
> (`apps/web/src/ui/party.ts:387-417`). The combat screen's own down-state signal simply never got
> threaded the same one extra step.

## Headline finding

`composeCombatScreen`'s input type documents an intended, unbuilt behaviour on its own party-row
field:

```ts
// packages/engine/src/render/combatScreen.ts:166-167
/** Right panel party rows (active highlighted, down grayed). */
party?: ExploreParty[];
```

`ExploreParty` (`packages/engine/src/render/exploreScreen.ts:144-150`) is the shared row type also
used by the exploration screen's own party panel:

```ts
export interface ExploreParty {
  name: string;
  ac: string | number;
  hp: string | number;
  /** Highlight as the active/selected member (white instead of green). */
  active?: boolean;
}
```

It has **no field at all** to carry a "down" fact — `active` is the only status flag it can express.
Inside `composeCombatScreen`'s render body, the party-panel loop only ever branches on `.active`:

```ts
// packages/engine/src/render/combatScreen.ts:308-313
party.forEach((p, i) => {
  const row = PANEL_FIRST_PLAYER_ROW + i;
  const color = p.active ? C_WHITE : C_GREEN;
  drawText(fb, font, p.name.toUpperCase(), PANEL_COL * 8, row * 8, color);
  drawText(fb, font, String(p.ac), PANEL_AC_COL * 8, row * 8, color);
  drawText(fb, font, String(p.hp), PANEL_HP_COL * 8, row * 8, color);
});
```

The file defines a colour constant for exactly the missing state, at the top, but never uses it here:

```ts
// packages/engine/src/render/combatScreen.ts:54
const C_GRAY = 8; // downed member
```

`C_GRAY` is used exactly once in the whole file — for the battle-grid's *icon* prone marker, not the
text panel:

```ts
// packages/engine/src/render/combatScreen.ts:216-224 (drawCombatant)
if (cell.down) {
  // Prone marker: a dim bar across the footprint floor.
  fillRectIndexed(fb, rect.x, rect.y + fh - 2, fw, 2, C_GRAY);
  return;
}
```

`cell.down` (on `CombatCellState`, a *different* view-model than `ExploreParty`) is populated
correctly by `apps/web/src/ui/combat.ts`'s `visibleCells()`:

```ts
// apps/web/src/ui/combat.ts:472-489
function visibleCells(): CombatCellState[] {
  ...
  cells.push({
    combatantId: c.id, side: c.side, col: sc, row: sr,
    icon: c.side === 'enemy' ? state.assets.enemyIcon : null,
    down: c.hp <= 0,
    active: c.id === state.activeId,
    size: state.combat.sizeOf(c.id),
  });
  ...
}
```

So the **grid icon** for a downed party member correctly goes prone/gray. But the **party sidebar
row for that exact same combatant**, built by the very next function in the same file, never gets
the same fact:

```ts
// apps/web/src/ui/combat.ts:491-496
function panelRows(): { name: string; ac: number; hp: number; active: boolean }[] {
  if (!state) return [];
  return state.combatants
    .filter((c) => c.side === 'party')
    .map((c) => ({ name: state!.names.get(c.id) ?? c.id, ac: c.ac, hp: Math.max(0, c.hp), active: c.id === state!.activeId }));
}
```

The engine's own **public, golden-tested** API for this exact fact already exists and is already
consumed for a *different* real purpose:

```ts
// packages/engine/src/combat/tactical.ts:678 (interface) / :1897-1903 (impl)
conditionOf(id: string): 'ok' | 'unconscious' | 'dead';
...
conditionOf: (id: string) => {
  const c = combatants.find((x) => x.id === id);
  if (!c) return 'ok';
  if (c.flags.has('dead')) return 'dead';
  if (c.flags.has('unconscious') || c.hp <= 0) return 'unconscious';
  return 'ok';
},
```

Golden-tested since CT.7h (`packages/engine/test/tactical.test.ts:1298-1386`, 5 cases: standing/ok,
unconscious-not-dead, dead via overkill, gen2-ruleset no-permadeath, coup-de-grace-carries-dead). Its
one real production consumer today is `apps/web/src/ui/party.ts`'s `applyCombatHp`
(`party.ts:467-489`), called from `combat.ts`'s own `finalize()` at battle end
(`combat.ts:699` — `applyCombatHp(state.combatants, (id) => combat.conditionOf(id))`) to persist the
dead-vs-unconscious distinction to the roster. It is also **already exposed as an e2e seam**
(`combat.ts:1166`: `conditionOf: (id: string) => state?.combat.conditionOf(id) ?? 'ok'`) — proving the
value is one line away from `panelRows()` at all times, just never read there.

**A near-identical feature already ships, one file over, proving this is an established convention
this codebase already committed to** — not a speculative nice-to-have:

```ts
// packages/engine/src/render/mainMenu.ts:50-62
export interface MainMenuMember {
  name: string;
  cls: string;
  level?: number;
  ac: number;
  hp: number;
  maxHp: number;
  /** Dimmed when the character is unconscious/dead. */
  down?: boolean;
  dead?: boolean;
}
...
// mainMenu.ts:186 (composeMainMenu's roster loop)
const color = m.dead ? C_RED : m.down ? C_YELLOW : C_GREEN;
```

```ts
// apps/web/src/ui/mainMenu.ts:63-65
function roster(): MainMenuMember[] {
  return partyStatus().map((s) => ({
    name: s.name, cls: s.cls, ac: s.ac, hp: s.hp, maxHp: s.maxHp, down: s.down, dead: s.dead,
    ...
```

`s.down`/`s.dead` come straight off `PartyMemberStatus` (`apps/web/src/ui/party.ts:386-417`), which
`hudPanel.ts`'s `buildRows()` also reads (confirmed by M40/M41 — every field except `age` is read
there). So: the exploration HUD sidebar, the Companion Panel, and the main menu's roster screen all
already distinguish a fallen character visually. The one screen that does **not** is the interactive
battle itself — the one moment a player most needs to see, in real time, which of their characters
just went down.

## Why this fits the loop's established shape

This is the M37/M38 shape (a function already has the fact, one call away, and simply never checks
it) **plus** the M39 shape (the caller — `panelRows()` — never populates a field its sibling function
in the same file already derives), reinforced by three independent pieces of corroborating evidence
none of M35-M41's picks had simultaneously:

1. The compositor's own doc comment already promises the missing behaviour, verbatim.
2. The exact colour constant needed already exists in the same file, pre-labelled for this purpose,
   unused anywhere else that would need it.
3. The identical feature (three-way dead/down/ok colouring of a party roster) is already shipped,
   tested, and live-wired in a sibling compositor (`mainMenu.ts`) fed from the same kind of
   roster-status source.

## Real-bytes / real-mechanic verification (reproduced fresh this round)

Not a `.DAX`/`.GLB` byte decode — `conditionOf` encodes the engine's own re-derived AD&D/COAB combat
rule (CT.7h: a blow that drops a figure to ≤0 HP without reaching the `dmg ≥ hp+10` overkill
threshold leaves it *unconscious* — revivable; an overkill blow — or any coup-de-grace — leaves it
*dead*, needing Raise Dead). What follows is a fresh reproduction against the project's current
engine code via `packages/engine/test/_scratch_m42_combatdown.test.ts` (created, run, deleted this
round; `npx vitest run` → 3/3 passed; full-suite regression check `npx vitest run` in
`packages/engine` → 135 files / 1337 tests passed, i.e. the pre-existing 1334 plus this round's 3
scratch tests, consistent with M41's own reported baseline).

### Probe 1 — a fresh scenario (own numbers, not copied from `tactical.test.ts`) reproduces "unconscious"

A 9-HP party fighter takes a 9-damage blow (exactly lethal, but `9 < 9+10` so no overkill):
`hero.hp` ends at `0`, `hero.flags.has('dead')` is `false`, and `c.conditionOf('h1')` returns
`'unconscious'`. Confirmed this round.

### Probe 2 — a fresh overkill scenario reproduces "dead"

A 2-HP party fighter takes a 26-damage blow (`26 ≥ 2+10`): `hero.flags.has('dead')` is `true` and
`c.conditionOf('h2')` returns `'dead'`. Confirmed this round.

### Probe 3 — `composeCombatScreen`'s party-panel loop is provably blind to any down/dead fact, today

Using the real GOG `Champions of Krynn/8X8D1.DAX` font (self-skips if absent; it was present, so this
ran for real, not vacuously):

```ts
const baseRow: ExploreParty = { name: 'Sturm', ac: 2, hp: 0 };           // already at 0 HP
const decoratedRow = { ...baseRow, down: true, dead: true } as ExploreParty; // hypothetical extra facts
const fbBase = composeCombatScreen({ font, party: [baseRow] });
const fbDecorated = composeCombatScreen({ font, party: [decoratedRow] });
expect(Array.from(fbBase.indices)).toEqual(Array.from(fbDecorated.indices)); // PASSED — byte-identical
```

Byte-identical framebuffers whether or not the row object carries `down`/`dead` — proof, not
inference, that the render loop today reacts to nothing but `.active`. A positive control
(`{ ...baseRow, active: true }`) *does* change the framebuffer, ruling out a fully inert function.
A direct pixel scan of the whole name/AC/HP row region for a `hp: 0` member found **zero** pixels of
palette index `8` (`C_GRAY`) — confirming the "downed member" colour the file itself defines is never
actually painted there today.

## Wiring plan

1. **`packages/engine/src/render/exploreScreen.ts`** — add one optional field to the shared row type
   (additive, no behaviour change to any existing caller):
   ```ts
   export interface ExploreParty {
     name: string;
     ac: string | number;
     hp: string | number;
     /** Highlight as the active/selected member (white instead of green). */
     active?: boolean;
     /** Fallen this fight (unconscious or dead) — greys the row in combat. `composeExploreScreen`
      *  intentionally leaves this unread: the exploration HUD's own party panel already conveys a
      *  fallen member via a literal "DEAD" hp string (see `explore.ts`'s `compositorParty()`) instead
      *  of colour, so no behaviour changes there. */
     down?: boolean;
   }
   ```

2. **`packages/engine/src/render/combatScreen.ts`** — one-line change to the party-row colour pick
   (line 310), reusing the pre-existing `C_GRAY` constant, fulfilling the pre-existing doc comment
   word for word:
   ```ts
   const color = p.active ? C_WHITE : p.down ? C_GRAY : C_GREEN;
   ```
   `active` still wins over `down` (matches the doc's listed order, and mirrors `mainMenu.ts`'s own
   precedent of a clear priority order for its analogous three-way colour pick).

3. **`apps/web/src/ui/combat.ts`**'s `panelRows()` — change its return type to the shared
   `ExploreParty[]` (import the type; it is already exported from `@goldbox/engine`, see
   `packages/engine/src/index.ts:604`) and add one field, reusing `state.combat.conditionOf` (already
   in scope in this file — no new import):
   ```ts
   function panelRows(): ExploreParty[] {
     if (!state) return [];
     return state.combatants
       .filter((c) => c.side === 'party')
       .map((c) => ({
         name: state!.names.get(c.id) ?? c.id,
         ac: c.ac,
         hp: Math.max(0, c.hp),
         active: c.id === state!.activeId,
         down: state!.combat.conditionOf(c.id) !== 'ok',
       }));
   }
   ```
   This is the exact same fact `visibleCells()` (12 lines above, same file) already derives for the
   grid icon, just reached through the engine's own tested API instead of re-deriving `c.hp <= 0`
   locally — keeping one source of truth for "down" instead of two independent formulas in the same
   file.

4. **Tests** (extend existing files — no new test file, per this loop's established discipline):
   - `packages/engine/test/combatScreen.test.ts` — add 2-3 pixel assertions to the existing
     `describe('composeCombatScreen', …)` block: a `{ name: 'X', ac: 5, hp: 0, down: true }` row (no
     `active`) paints `C_GRAY` (8) at the name/AC/HP text pixels; the same row with `active: true`
     added still paints `C_WHITE` (15) — proving the priority order; a plain `{ name, ac, hp }` row
     (no `down`) still paints `C_GREEN` (10) — an explicit regression/negative control for the
     pre-existing default that today is only implicit. Follow the file's own established pattern
     (`loadCokFontOrSkip()`, already defined at the bottom of this file) — no new fixture needed.
   - `apps/web/test/e2e.mjs`'s **existing** `runCombat` case (id `'combat'`, `?combat=1`,
     lines 995-1194) already has a `conditionOf` block (`~1125-1130`) asserting the standing hero `p1`
     reports `'ok'`. Add one new seam getter next to `conditionOf` in `installSeam()`
     (`combat.ts:1166`), e.g. `downOf: (id: string) => (state?.combatants.find((c) => c.id === id) ?
     state!.combat.conditionOf(id) !== 'ok' : null)`, and extend the existing assertion block with
     `const downP1 = await page.evaluate("window.__combat.downOf('p1')"); … downP1 === false` right
     next to the existing `condVal === 'ok'` check — proving the seam threads correctly for the common
     (standing) case with zero new battle setup. **Open question, not required for the fix**: whether
     the fixed `DEMO_SEED` standalone battle (5 heroes vs. 3 draconians + a skeleton + an ogre)
     already drops a fragile hero (Raistlin, 12 HP, AC 8, `p4`) by the time `auto()` finishes, which
     would let the e2e case also assert a genuine positive `downOf('p4') === true` mid-battle. This
     round did not execute the actual browser build to check that deterministically (it requires the
     real `apps/web` Puppeteer harness, not a `vitest` script) — worth a 30-second check when
     implementing; if it doesn't trigger naturally, the negative-control assertion above is still a
     legitimate, honest proof on its own (mirrors this loop's acceptance of negative-only e2e coverage
     elsewhere, e.g. M39's "Long Sword" no-`Qty` check).

Rough size: ~6 LOC added across 3 files (1 new optional interface field + 1 doc comment, 1 changed
line in the render loop, 3 changed/added lines in `panelRows()`), ~6-9 LOC extending 2 existing test
files. No new engine test file, no new e2e file, no new route, no new UI panel.

## Layout / feasibility check

No layout risk: this is a colour-only change to text already drawn at the existing
`PANEL_COL`/`PANEL_AC_COL`/`PANEL_HP_COL` coordinates (`combatScreen.ts:59-64`) — no new row, no new
column, no change to `PANEL_MAX_PLAYERS` (6) or any existing width budget. The exact same three
`drawText` calls run unconditionally today; only the `color` expression they're passed changes.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **`referenceDb.ts`'s `Class`-label collision** (flagged M37, unpicked M38/M39/M40/M41) | Re-confirmed still live and unpicked — this would be the 5th consecutive round it's passed over. Still real, still cheap, still available as a guaranteed fallback, but the combat-panel finding is fresher, better-corroborated (three independent pieces of evidence: the doc comment, the unused constant, and the shipped sibling feature in `mainMenu.ts`), and arguably has more real player impact (a live-battle status the player currently cannot see at all, vs. a cosmetic label collision), so this round again defers the rename. |
| **`dialogue.ts`/`town.ts`'s `recordJournal()` day-wiring gap** (flagged by M41 as a future-round candidate) | Investigated for feasibility, not re-scoped in depth: threading a real live game-day value into these two call sites is a caller-plumbing task (finding/passing the current `gameDay()` at each site) rather than a single conditional row/field — a reasonable size for a *future* round, but this round's combat-panel finding is a strictly smaller, more contained slice (no new plumbing path to trace through two separate UI files), so it was set aside again per M41's own scoping, not because it stopped being real. |
| **`dqkExplore.ts`** (full read, both halves) | This file is a debug-readout view (DOM text, not a `compose*Screen` pure compositor) that already surfaces an unusually large amount of internal state per line (ECL run summaries, bestiary counts, audio stats, per-cell event text) — no field with a decoded/derived value and a real consumer was found sitting unread. Its own Automap panel (`composeAutomapPanel`) is the same shared engine compositor covered below. |
| **`MapCell.floor`** (`model/index.ts:175-176`) feeding `dungeonEvents.ts`'s real `primeSearchLocation`/`mapWallRoof` per-cell event dispatch (live, wired since early phases, confirmed via `world/dialogue.ts:134`'s `primeSearchLocation(block, backdrop, …)` called from `explore.ts:351`) | Investigated as a possible Automap "event cell" marker candidate. Rejected: `.floor` is an opaque cell-descriptor byte the ECL masks into a dispatch index, not a visual "floor texture" or a simple "has an event" boolean a map legend could faithfully summarize without over-claiming (a 0 value is NOT reliably "no event" — the wandering-monster check is *also* dispatched through index 0). Showing it on the Automap would require inventing a simplified true/false read of a byte whose real semantics are "which handler to jump to," which risks misrepresenting the mechanic — a real difference from this round's finding, where the missing fact (`down`) is already a clean, already-computed boolean with an unambiguous meaning and an existing UI convention (`mainMenu.ts`) to match. |
| **`MapCell.ceiling`** (`model/index.ts:178`) | Re-confirmed dead: grepped every use of `ceiling` in `packages/engine/src`; the only consumer (`renderWallView.ts`'s `opts.ceiling`) is a *rendering option* never fed from any `MapCell.ceiling` value at any real call site — the field is decoded/typed but has no producer OR consumer today, an unbuilt scaffold on both ends (the `hpFraction`/`MapCell.event` shape from M40/M41), not this loop's target shape. |
| **`MapCell.flags`** (`model/index.ts:181-182`, "raw per-cell flag bits preserved... for later interpretation") | Confirmed: only ever round-tripped by `saveGame.ts`'s serializer and read by `module/editor.ts`'s FRUA-authoring backdrop-byte helper — no real-game display consumer exists or is implied; explicitly documented as "for later interpretation," i.e. intentionally inert today, not a display bug. |
| **`automapPanel.ts` (both layers) beyond the already-rejected `doorsOpen`/`event`** | Read `AutomapPanelInput`/`AutomapMapView`/`AutomapReadModel` (engine) and the `apps/web` host in full this round. Every field the compositor declares (`map.width/height/cells`, `automap.isVisited/getNote`, `pose`, `status`, `menu`, `frameTiles`, `font`, `title`) is read by `composeAutomapPanel`'s body, and every one is populated by the real `apps/web` host (`Automap` model + `loadCokMap()`/`dqkExplore.ts`'s GEO-derived `GameMap`). No new gap found beyond the two already on record. |
| **`mainMenu.ts` (both layers)** | Read in full specifically *because* it turned out to be the sibling precedent for this round's pick. Confirmed clean on its own terms: every `MainMenuMember`/`MainMenuView` field is populated by `apps/web/src/ui/mainMenu.ts` and read by `composeMainMenu`. No gap here — it is, ironically, the one screen already doing this correctly. |
| **`intro.ts`** | Read in full. No `compose*` engine view-model — builds the boot/title sequence from static byte-verified `START.EXE` strings and canned timing; nothing decoded-but-unread. |
| **`inventory.ts` (render + `apps/web` host) beyond `.value`** | Skimmed both files' full field lists against each other (`InventoryView`/`InventorySlotView`); no unread field found this round — a shallower pass than M41's `.value` deep-dive, but nothing stood out as a repeat of the shape and the combat-panel finding was already strong enough to stop searching further. |
| **Item-instance subsystem** (`DokItemRecord.value`/`.magicBonus`/`.charges`/`.cursed`) | **Not re-investigated**, per standing instructions — blocked 13 consecutive rounds. |
| **`PartyMemberStatus.age`/`hudPanel.ts`** | **Not re-investigated** — already rejected twice (M40, M41) on value-degeneracy grounds; no new angle sought. |

## Open questions / unknowns

- **Should the fix distinguish `dead` (red, matching `mainMenu.ts`'s `C_RED`) from merely
  `unconscious` (grey), rather than one flat "down" grey?** `mainMenu.ts`'s already-shipped
  convention does make this three-way distinction (`m.dead ? C_RED : m.down ? C_YELLOW : C_GREEN`),
  and `TacticalCombat.conditionOf()` already returns the three-way value needed. This audit
  recommends the **minimal** fix (a single grey "down" state) because it is exactly what
  `combatScreen.ts`'s own pre-existing doc comment promises today ("down grayed" — singular), needs no
  new colour constant, and a mid-fight dead-vs-unconscious distinction may be of limited value to the
  player anyway (both are equally "out of the fight right now"; the permanent dead-vs-revivable
  difference only matters once the battle ends and `applyCombatHp` runs). Left as an explicit
  implementer's choice, not re-litigated further here.
- **Does the fixed-seed `?combat=1` standalone demo battle (`DEMO_SEED = 0x6b0b`) already knock a hero
  below 0 HP during `auto()`-resolution**, which would let the e2e extension include a true positive
  (not just the negative control on the standing `p1`)? Not verified this round (requires running the
  actual Puppeteer e2e harness, out of scope for an engine-package `vitest` probe) — flagged for the
  implementer to check in ~30 seconds when wiring the fix.
- **Should `ExploreParty.down` also be read by `composeExploreScreen`** (the exploration HUD's own
  party panel), in addition to `composeCombatScreen`? This audit recommends **no** — `explore.ts`'s
  `compositorParty()` already conveys a fallen member via a literal `'DEAD'` hp string
  (`explore.ts:784`), a working, already-shipped convention for that screen; adding a second,
  redundant grey-colour signal there would be scope creep beyond this round's finding. Left as-is.

## Implications for our engine

- **A compositor's own doc comment can be a direct, load-bearing lead** for this loop's sweep method:
  `combatScreen.ts:166`'s "down grayed" was written when the field was designed, then never finished —
  grepping doc comments for describing behaviour not actually implemented in the function body below
  them is a cheap, high-signal technique worth adding explicitly to future rounds' method, alongside
  the existing "list every field, check every read" cross-reference.
- **A convention already shipped in one compositor (`mainMenu.ts`'s dead/down/ok roster colouring) is
  strong evidence a sibling compositor's identical, still-undone doc comment is a real gap, not a
  stale aspiration** — worth checking "has this exact feature shipped somewhere else in the codebase
  already?" as a corroborating step whenever a doc comment promises unbuilt behaviour.
- **The same live fact can be legitimately re-derived through two different but equivalent
  formulas within one file** (`visibleCells()`'s `c.hp <= 0` vs. the recommended `panelRows()`'s
  `conditionOf(id) !== 'ok'`) — this round chose to route the new call through the engine's public,
  tested API rather than copy the inline formula a second time, to keep a single source of truth
  for "down" as the tactical engine's condition rules evolve (e.g., if a future status effect ever
  makes a figure "down" without `hp <= 0`, only `conditionOf` needs updating, not two UI call sites).
- **Not every candidate needs a byte-decode.** Like M40's `robe` and M41's `.day`, this round's finding
  is entirely the engine's own ruleset/combat-rules layer (CT.7h), not a `.DAX`/`.GLB` decode — the
  loop's bar remains "real, tested, and silently dropped by a projection function that already had
  (or one call away had) it," not "must trace to original game bytes."

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `packages/engine/test/_scratch_m42_combatdown.test.ts` (3 tests: a fresh unconscious-scenario
  reproduction of `conditionOf`, a fresh dead/overkill-scenario reproduction, and the pixel-identity +
  positive-control + direct-pixel-scan proof that `composeCombatScreen`'s party-panel loop is blind to
  any down/dead fact today) — run via `npx vitest run` (3/3 passed), then deleted. Confirmed via
  `git status --porcelain` (clean except this doc) after deletion.
