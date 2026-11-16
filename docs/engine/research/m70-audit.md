# M70 audit — the next "computed but unwired" candidate

> Audit method per the brief: read `docs/engine/research/m69-audit.md` in full (headline finding,
> verification evidence, "why this wasn't already picked up" grep evidence, wiring plan, rejected
> alternatives, open questions, implications), then followed its own explicitly-flagged **open
> follow-up** ("NEW from M69: enemy-side grid icons (`visibleCells()`/`CombatCellState`) never
> getting the same 'impaired' colour signal the party panel just got") rather than starting a fresh
> search from zero. Before finalizing, grepped every `docs/engine/research/m*-audit.md` for
> `visibleCells`, `CombatCellState`, and `impaired` (see "Why this wasn't already picked up" below) —
> the only real hit for `impaired` anywhere in the whole audit corpus is M69's own doc (which explicitly
> declined to investigate the grid-icon side). This is confirmed fresh.

## Headline finding

### `visibleCells()` (the tactical battle-grid icon compositor) still has no field for `asleep`/`held`/`feared`/`slowed` at all — and the gap is wider than M69's own follow-up note describes: it's not just the ENEMY icons that are blind to it, the PARTY's own on-grid icons are too

M69.S1 shipped `ExploreParty.impaired` and wired it into the tactical combat **sidebar party panel**
(`panelRows()`, `apps/web/src/ui/combat.ts:493-511`) so a player can tell from the persistent sidebar
that one of their own characters is asleep/held/feared/slowed. That round's own "Rejected alternatives"
table flagged, but explicitly declined to investigate, extending the same signal to
`visibleCells()`/`CombatCellState` — the **battle-grid icon compositor**, a second, separate render path
in the same file that draws the actual figures standing on the 7×7 tactical grid (`combat.ts:474-491`):

```ts
// apps/web/src/ui/combat.ts:474-491 (current source, unchanged since before M69)
function visibleCells(): CombatCellState[] {
  if (!state) return [];
  const cells: CombatCellState[] = [];
  for (const c of state.combatants) {
    if (c.flags.has('fled')) continue; // left the field
    const sc = c.pos.col - state.view.col;
    const sr = c.pos.row - state.view.row;
    if (sc < 0 || sc >= VIEW || sr < 0 || sr >= VIEW) continue;
    cells.push({
      combatantId: c.id, side: c.side, col: sc, row: sr,
      icon: c.side === 'enemy' ? state.assets.enemyIcon : null,
      down: c.hp <= 0,
      active: c.id === state.activeId,
      size: state.combat.sizeOf(c.id), // CT.7i — Large (2×2) monsters paint across their footprint
    });
  }
  return cells;
}
```

This function iterates `state.combatants` — **every** live `TacticalCombatant`, both `'party'` and
`'enemy'` sides, the exact same array `panelRows()` iterates one function below it (line 493) and the
exact same object M69 already proved carries a live, mutating `.flags: Set<TacticalStatusFlag>`
(`packages/engine/src/combat/tactical.ts:172-173`). `visibleCells()` already reads `c.flags.has('fled')`
(line 478, to skip drawing a fled figure) — so `c.flags` is already in local scope, already being read,
one flag out of the nine (`tactical.ts:112-113`: `'asleep' | 'held' | 'feared' | 'fled' | 'surrendered' |
'hasted' | 'slowed' | 'unconscious' | 'dead'`) — but the four M69 already validated as real, mechanically
decisive, and worth a UI signal (`asleep`/`held`/`feared`/`slowed`) are not read here at all.

`CombatCellState` (`packages/engine/src/render/combatScreen.ts:111-130`) has no field for it:

```ts
export interface CombatCellState {
  combatantId: string;
  side: 'party' | 'enemy';
  col: number;
  row: number;
  icon: IndexedImage | null;
  hpFraction?: number;
  down?: boolean;
  active?: boolean;
  size?: number;
}
```

`drawCombatant()` (`combatScreen.ts:218-240`) reads `cell.down`, `cell.icon`, `cell.size`, `cell.side`
— never anything status-shaped:

```ts
function drawCombatant(fb: IndexedFramebuffer, g: CombatGridGeometry, cell: CombatCellState): void {
  const size = Math.max(1, Math.floor(cell.size ?? 1));
  const rect = cellRect(g, cell.col, cell.row);
  const fw = rect.w * size;
  const fh = rect.h * size;
  if (cell.down) {
    fillRectIndexed(fb, rect.x, rect.y + fh - 2, fw, 2, C_GRAY);
    return;
  }
  const icon = cell.icon;
  if (icon) {
    // ...blit icon, bottom-anchored...
  } else {
    const color = cell.side === 'party' ? C_PARTY_GLYPH : C_ENEMY_GLYPH;
    fillRectIndexed(fb, rect.x + 1, rect.y + 1, Math.max(1, fw - 2), Math.max(1, fh - 2), color);
  }
}
```

**So today, on the one screen where the actual battle happens (the 7×7 grid, not the sidebar):** an
asleep/held enemy — the exact figure a melee attacker is about to coup-de-grace, per the already-shipped
`slaysHelpless()` mechanic (M50.S1, CT.7j) — looks pixel-identical to a fully-active one on the grid
itself, *and* the party's own hero (who, since M69, shows yellow in the sidebar) still shows their normal
glyph colour on the actual grid tile they're standing on. The sidebar tells you; the battlefield itself
does not. This is a genuinely different rendering surface from what M69 shipped (a second compositor
function/interface pair, `visibleCells()`/`CombatCellState`/`drawCombatant()`, vs. `panelRows()`/
`ExploreParty`/the panel-drawing code) — not a re-ship of M69's fix under a new name.

### The only existing partial signal is transient, melee-only, asleep/held-only, and requires the player to already be actively targeting that exact enemy

`highlightTarget()` (`combat.ts:948-972`, M50.S1) does surface `asleep`/`held` — but only:
- while the player is in `party-target` phase (mid-attack target selection), not persistently;
- only for the specific enemy the target cursor currently sits on (`state.targets[state.targetIdx]`);
- only as a `(Coup de Grace!)` banner suffix, and only when `melee && helpless && slaysHelpless()`
  (`combat.ts:956-970`);
- never for `feared`/`slowed` at all (the `helpless` check only tests `asleep`/`held`,
  `combat.ts:959`);
- never for the party's own figures (the banner is only built for the enemy the player is targeting).

So a player who is *not* mid-target-selection on that exact enemy — e.g. deciding whether to Move, Cast,
or Flee this round, or looking at any OTHER enemy on the grid — has zero visual indication that an enemy
is asleep/held/feared/slowed, and a player never gets any on-grid indication that their own hero (not
just the sidebar row) is impaired.

## Real, verified mechanical source (reusing M69's own grounding, extended)

Nothing new needs to be proven about the *mechanism* — M69 already verified end-to-end (via a real
bundled DoK monster's memorized spells + the engine's own unscripted `aiAction()`) that a real enemy
caster can inflict `held` on a party member. This round's contribution is the **mirror direction**,
which is in fact *already reachable through the existing standalone `?combat=1` demo* — a stronger
verification story than M69's own (M69 explicitly flagged that no e2e route existed to drive a party
member into a disabling status, because the demo's enemies carry no spellbook; this round's direction
has no such gap):

`DEMO_SPELLBOOKS` (`combat.ts:273-282`) already ships a real Sleep spell on the demo's own magic-user,
targeting `'enemy'`:

```ts
p4: [
  { id: 'sleep', name: 'Sleep', target: 'enemy', range: 12, area: 'burst', radius: 2, save: 'none',
    inflict: { status: 'asleep', rounds: 99, hdCap: 4 }, usesLeft: 1 },
  ...
],
```

`apps/web/test/e2e.mjs` already exercises this exact spellbook today (lines 1122-1132, "CT.5a: the demo
book also carries a status spell (Sleep) and a flagsOf seam reports conditions") and there is already a
live `window.__combat.flagsOf(id)` seam (`combat.ts:1266`: `flagsOf: (id: string) => [...(state?.combatants
.find((c) => c.id === id)?.flags ?? [])]`) that can read any combatant's (party OR enemy) live flag set —
this is the exact plumbing needed to e2e-verify a fix here, and it already exists; nothing new to build.

## Verification evidence (this round's scratch test)

`packages/engine/test/_scratch_m70_verify.test.ts` (created, run green, then deleted):

Built a 2-combatant tactical scenario with `createTacticalCombat` — a `'party'`-side caster carrying
the real `sleep` `TacticalSpell` (identical shape to `DEMO_SPELLBOOKS.p4[0]`) and an adjacent
`'enemy'`-side foe — and called the engine's own `combat.apply({ type: 'cast', spellId: 'sleep', to: {...} })`
(the same action path `partyCast()` drives in `combat.ts:872-904`). Result: `events.some(e => e.type ===
'cast')` true, and **`foe.flags.has('asleep') === true`** on the real, live `TacticalCombatant` object —
confirming the engine really does mutate an enemy's own `.flags` via a real, already-shipped party spell,
not a synthetic/hypothetical capability.

Then constructed a `CombatCellState` object literal matching the exact shape `visibleCells()` builds
today (`{ combatantId, side, col, row, icon, down }`) and asserted `'impaired' in cell === false` and
`(cell as any).impaired === undefined` — confirming the interface genuinely has no field for this fact
today (not just "unread by one caller"; the type itself has nothing to carry it).

`git status --porcelain` after deleting the scratch file: clean (confirmed — only this doc is untracked
afterward). Full engine suite unaffected (scratch file only added/removed a new test file, touched no
source).

## Why this wasn't already picked up (grep evidence against every prior round)

- **`visibleCells`/`CombatCellState`** — hits in `m61`, `m46`, `m45`, `m44`, `m42`, `m41`, and `m69`.
  Read each:
  - `m41`/`m44`/`m45`/`m46` all discuss `CombatCellState.hpFraction` (a different, already-confirmed-dead
    field — unset by `visibleCells()` AND unread by `drawCombatant()`, "an unbuilt scaffold stub, not a
    display bug" per M44) — not this round's field, not re-litigated.
  - `m42` is the round that *added* `down`/`hp<=0` wiring to `visibleCells()` (the `down: c.hp <= 0` line)
    and used it as the model for `panelRows()`'s own `down` fix — no mention of status flags at all.
  - `m69` is the round that flagged the gap this round closes, explicitly declining to investigate it
    ("kept out of this round's minimal-diff scope; flagged as a natural follow-up, not investigated in
    depth" — `m69-audit.md`'s Rejected Alternatives table).
- **`impaired`** — the only two hits anywhere in the audit corpus are `m69-audit.md` (the round that
  coined the term for the sidebar fix and flagged, but didn't build, this round's fix) and
  `disasm-combat-dqk.md` (an unrelated DQK-overlay disassembly note about an "impaired/fleeing-class"
  HP-band inference in the *original binary* — a completely different subsystem, not this engine's
  `TacticalStatusFlag`).
- **No prior round proposed or rejected "extend the battle-grid icon compositor (`visibleCells()`/
  `CombatCellState`/`drawCombatant()`) with the same asleep/held/feared/slowed signal, for BOTH sides"**
  under any framing. M69 came closest but explicitly scoped itself to the sidebar only. This round's
  finding that the **party's own** grid icon is equally blind (not just the enemy's) is a detail M69's
  own follow-up note didn't mention — M69's note only asked about "enemy grid icons."

## Wiring plan

Small, additive, mirrors M69's own three-part shape (new optional interface field → one apps/web mapping
line → one render branch), but lands in the **other** compositor pair in the same two files.

**1. `packages/engine/src/render/combatScreen.ts`** — add one optional field to `CombatCellState`
(after `size`, ~line 129):

```ts
export interface CombatCellState {
  combatantId: string;
  side: 'party' | 'enemy';
  col: number;
  row: number;
  icon: IndexedImage | null;
  hpFraction?: number;
  down?: boolean;
  active?: boolean;
  size?: number;
  /**
   * M70.S1 — currently under a disabling status (asleep/held/feared/slowed) this fight, mirroring
   * `ExploreParty.impaired` (M69.S1) but for the on-grid figure rather than the sidebar row. Applies to
   * EITHER side (an enemy the player hasn't targeted yet, or the player's own hero). Colour-only (a top-
   * of-footprint bar, distinct from the bottom-of-footprint `down` prone bar so the two never collide
   * visually) — intentionally excludes `hasted` (a buff) and `fled`/`surrendered`/`unconscious`/`dead`
   * (already covered by `down`/the `fled` skip in `visibleCells()`).
   */
  impaired?: boolean;
}
```

**2. `combatScreen.ts`'s `drawCombatant()`** — one new unconditional branch at the end of the function
(runs only when `cell.down` was false, since that branch already returns early):

```ts
function drawCombatant(fb: IndexedFramebuffer, g: CombatGridGeometry, cell: CombatCellState): void {
  const size = Math.max(1, Math.floor(cell.size ?? 1));
  const rect = cellRect(g, cell.col, cell.row);
  const fw = rect.w * size;
  const fh = rect.h * size;
  if (cell.down) {
    fillRectIndexed(fb, rect.x, rect.y + fh - 2, fw, 2, C_GRAY);
    return;
  }
  const icon = cell.icon;
  if (icon) {
    // ...existing blit, unchanged...
  } else {
    const color = cell.side === 'party' ? C_PARTY_GLYPH : C_ENEMY_GLYPH;
    fillRectIndexed(fb, rect.x + 1, rect.y + 1, Math.max(1, fw - 2), Math.max(1, fh - 2), color);
  }
  // M70.S1 — a caution bar across the TOP of the footprint (down's own bar sits at the BOTTOM, so the
  // two markers can never overlap/be confused, and this works identically whether the figure draws via
  // a blitted icon (enemy) or the coloured glyph fallback (party) — no icon-pixel recolouring needed.
  if (cell.impaired) fillRectIndexed(fb, rect.x, rect.y, fw, 2, C_YELLOW);
}
```

(`C_YELLOW` already exists — added by M69.S1 at `combatScreen.ts:55` for the sidebar fix; reused here
verbatim, no new colour constant.)

**3. `apps/web/src/ui/combat.ts`'s `visibleCells()`** — one new line, reusing the identical four-flag
expression `panelRows()` already uses one function below (worth factoring into a shared local helper —
see the optional hygiene note below — but shown inline here to match the minimal-diff precedent):

```ts
function visibleCells(): CombatCellState[] {
  if (!state) return [];
  const cells: CombatCellState[] = [];
  for (const c of state.combatants) {
    if (c.flags.has('fled')) continue;
    const sc = c.pos.col - state.view.col;
    const sr = c.pos.row - state.view.row;
    if (sc < 0 || sc >= VIEW || sr < 0 || sr >= VIEW) continue;
    cells.push({
      combatantId: c.id, side: c.side, col: sc, row: sr,
      icon: c.side === 'enemy' ? state.assets.enemyIcon : null,
      down: c.hp <= 0,
      active: c.id === state.activeId,
      size: state.combat.sizeOf(c.id),
      // M70.S1 — mirrors panelRows()'s own impaired check (M69.S1), but here for EITHER side (this loop,
      // unlike panelRows(), is not filtered to `side === 'party'`), so it covers the enemy grid icon AND
      // the party's own on-grid icon (previously only the sidebar row reflected this for the party).
      impaired: c.flags.has('asleep') || c.flags.has('held') || c.flags.has('feared') || c.flags.has('slowed'),
    });
  }
  return cells;
}
```

**Optional hygiene note (not required to ship the fix):** `panelRows()` and `visibleCells()` now
duplicate the exact same four-flag boolean expression. A small follow-up could factor it into one local
helper (e.g. `const isImpaired = (c: TacticalCombatant) => c.flags.has('asleep') || c.flags.has('held')
|| c.flags.has('feared') || c.flags.has('slowed');`) defined once in `combat.ts` and called from both —
purely a DRY cleanup, zero behaviour change either way.

**4. `packages/engine/test/combatScreen.test.ts`** — extend with new cases mirroring the existing
`down`-marker tests' pixel-probe style (see `it('draws a combatant glyph...')` at line 67 and `it('a Large
down marker lies across the footprint floor...')` at line 125):

```ts
it('draws an impaired caution bar across the top of the footprint (M70.S1), distinct from the down bar', () => {
  const g = COK_COMBAT_GEOMETRY;
  const cell: CombatCellState = { combatantId: 'e1', side: 'enemy', col: 3, row: 4, icon: null, impaired: true };
  const fb = composeCombatScreen({ cells: [cell] });
  const x0 = g.originX + cell.col * g.cellW;
  const y0 = g.originY + cell.row * g.cellH;
  expect(px(fb, x0 + 2, y0)).toBe(14); // C_YELLOW at the footprint top
  expect(px(fb, x0 + 2, y0 + g.cellH - 1)).toBe(12); // C_ENEMY_GLYPH still fills the rest (glyph unaffected)
});

it('a down figure never also shows the impaired bar (down returns early)', () => {
  const g = COK_COMBAT_GEOMETRY;
  const cell: CombatCellState = { combatantId: 'e1', side: 'enemy', col: 3, row: 4, icon: null, down: true, impaired: true };
  const fb = composeCombatScreen({ cells: [cell] });
  const x0 = g.originX + cell.col * g.cellW;
  const y0 = g.originY + cell.row * g.cellH;
  expect(px(fb, x0 + 2, y0)).not.toBe(14); // no yellow bar
  expect(px(fb, x0 + 2, y0 + g.cellH - 2)).toBe(8); // C_GRAY prone bar still at the bottom
});

it('the party figure (glyph-only today) also shows the impaired bar, not just enemies', () => {
  const g = COK_COMBAT_GEOMETRY;
  const cell: CombatCellState = { combatantId: 'p1', side: 'party', col: 2, row: 2, icon: null, impaired: true };
  const fb = composeCombatScreen({ cells: [cell] });
  const x0 = g.originX + cell.col * g.cellW;
  const y0 = g.originY + cell.row * g.cellH;
  expect(px(fb, x0 + 2, y0)).toBe(14); // C_YELLOW
});
```

**5. `apps/web/test/e2e.mjs`** — extend the existing CT.5a Sleep-wiring check (around line 1122-1132,
which already confirms `spells.includes('sleep')` and that `flagsOf`/`castFn` exist) with an actual cast:
invoke `window.__combat.cast()` (already exposed, `castFn` at line 1126) targeting a living enemy, then
assert `window.__combat.flagsOf(enemyId).includes('asleep')` — proving the real demo path inflicts the
status on an enemy end-to-end in the browser, not just in the engine's own unit tests. This is a genuinely
available route today (unlike M69's own party-affliction direction, which had no bundled DoK-caster
encounter reachable from any existing e2e scenario).

## Layout / feasibility check

Unlike the sidebar panel (a fixed-width text/colour row, M69's own constraint), the battle-grid footprint
is a **24×24px (or 48×48 for Large) pixel canvas per figure** — there is ample room for a 2px bar with no
text-column budget problem at all (the `down` marker already proves a 2px bar fits and reads clearly at
this resolution). Placing the new bar at the **top** of the footprint (vs. `down`'s **bottom**) is a
deliberate, checked choice: `drawCombatant()`'s `down` branch returns early, so the two markers are
mutually exclusive in practice (a `down` figure, hp≤0, and an `impaired` figure, hp>0 with an active
status, don't co-occur under this ruleset's own state model), but keeping them at opposite edges means
even a hypothetical future state where both are true would never visually merge into one ambiguous bar.
The cursor outline (`drawCursor()`, drawn after all combatants, `combatScreen.ts:296-298`) paints last and
naturally wins over the new bar for the active unit — matching the same priority order M69 established
for the sidebar (`active` > `down`/`impaired` > default).

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| Re-picking M69's own sidebar fix under a new name | Not a risk here — grepped and confirmed M69's fix (`panelRows()`/`ExploreParty.impaired`) is already shipped and live in current source; this round's fix touches a completely different function/interface pair (`visibleCells()`/`CombatCellState`/`drawCombatant()`), not the same code M69 already changed. |
| Recolouring the enemy's blitted SPRIT icon pixels directly (palette remap) instead of an overlay bar | Rejected as needlessly invasive — the icon is a shared, single static asset (`assets.enemyIcon`, loaded once for the whole battle, `combat.ts:223`) with no per-status colour variant; remapping its palette live would need new image-processing machinery for a purely-cosmetic signal. An overlay bar (identical mechanism to `down`'s own already-shipped prone marker) is strictly simpler, consistent with the codebase's existing convention, and equally visible. |
| Showing the *specific* status name, not just a generic boolean | Same rejection M69 already made for the sidebar, re-confirmed here for the grid: no text-column budget/precedent for per-cell labels in this compositor (icons/glyphs fill the whole cell); a colour-only signal matches the established `down`/`active` precedent exactly. |
| Bundling `hasted` in as a positive indicator on the grid too | Same M69 rejection carried over unchanged: `hasted` is a buff, not a warning, and (per M69) has weaker real-data grounding (`m3-haste` isn't in `DOK_SPELL_CROSSWALK`); left as an explicit non-goal, matching M69's own scope boundary. |
| Extending the fix only to enemies (the literal wording of M69's own follow-up note) | Rejected as under-scoping the real gap: `visibleCells()` iterates BOTH sides in one loop (unlike `panelRows()`, which filters to `party` only), so the natural, minimal-diff fix covers the party's own on-grid icon too, at zero extra cost — restricting it to enemies only would require adding a `side === 'enemy'` filter that doesn't otherwise exist in this function, which would be *more* code for a narrower (and arguably wrong — the party's own figure being invisibly impaired on the grid is just as real a gap) result. |

## Open questions / unknowns

- Whether a future round wants the caution bar to distinguish `feared` (still gets a turn, restricted
  menu) from `asleep`/`held` (turn skipped entirely) with a second colour tier — this round's fix, like
  M69's, deliberately keeps it a single boolean signal; **UNKNOWN** whether finer granularity is wanted.
- Whether `slaysHelpless()`'s existing `(Coup de Grace!)` banner text should also be suppressed/adjusted
  now that the grid itself flags helplessness persistently — **not investigated**; the banner and the new
  bar are complementary (banner = "you are about to instant-kill this one," bar = "this one, among
  possibly several, is vulnerable"), not redundant, so no change to `highlightTarget()` is proposed here.
- Whether the `?combat=1` standalone demo route is the right one to extend in `e2e.mjs`, vs. building a
  new real-encounter route reachable from a bundled DoK save (the way M69's own open question phrased the
  *opposite* direction) — this round's proposed e2e extension (item 5 in the Wiring Plan) uses the
  already-instrumented demo route, which the audit believes is sufficient, but a lead-side reviewer may
  prefer a real-encounter route for parity with future asymmetric findings; flagged, not resolved.

## Standing candidates checked and ruled back out this round

- **`itemCategory()`/`DqkItemRecord`/`DokItemRecord.value`** — re-confirmed still correctly dead (M31,
  M39, M66, M67, M68, M69 all independently reconfirm zero `apps/web` consumers / blocked item-instance
  subsystem); not re-litigated, not re-picked.
- **`referenceDb.ts`'s Class-label collision** — still unpicked, still real, still lower-value than this
  round's finding (a cosmetic label collision vs. a genuine "can't see who's disabled mid-battle" gap);
  deferred again, consistent with every round since M37.
- **`hasted` as a positive buff indicator**, **enemy-grid-only scoping**, **specific status-name display**
  — all re-examined as candidates for *this* fix and explicitly folded into or rejected from the plan
  above (see Rejected Alternatives), not silently skipped.
- **ECL-ally morale%** — not touched, per its M61 retirement.
- **`CombatCellState.hpFraction`** — re-confirmed still dead on both ends (`visibleCells()` never sets
  it, `drawCombatant()` never reads it) per M41/M44; a different, already-settled field from this round's
  `impaired` addition — not conflated, not re-picked.
- **Sleep's `hdCap` fidelity gap for party members (`t.hd === undefined` always passes `capOk`)**,
  flagged by M69 as a possible future pick — re-noted here as still open and still a different class of
  finding (a rules bug, not a display gap); not pursued this round since a stronger display-gap candidate
  (this one) was available.

## Implications for our engine

- **A round's own explicitly-flagged "natural follow-up, not investigated" note is a legitimate and
  productive place to start the NEXT round's search** — this round confirms the loop's method generalizes
  cleanly across rounds, not just within one round's own re-checking (M69 flagged the exact gap this round
  closes, then declined to build it; picking it up one round later, with a fresh read of the actual
  current source rather than trusting the prior summary, surfaced a real refinement — the gap is wider
  than the flagging round realized, because it affects the party's own grid icon too, not only the enemy's).
- **The same underlying fact (`c.flags`) can have MULTIPLE display consumers that need independent
  wiring**, even within a single file already partially fixed. `TacticalCombatant.flags` now has three
  live UI consumers after this fix ships: the combat log (`statusVerb()`, pre-existing), the sidebar panel
  (`panelRows()`, M69), and the battle-grid icon (`visibleCells()`, this round) — each is a genuinely
  separate compositor with its own interface type and its own "did we actually read the field" question;
  fixing one does not imply the others were checked.
- **A UI signal shipped for one *side* of a state (M69's sidebar fix, party-only by construction since
  `panelRows()` filters to `side === 'party'`) can silently omit that the SAME underlying loop, in a
  sibling function, has no such filter** — `visibleCells()` iterating both sides in one pass is precisely
  why the "enemy-only" framing of M69's own follow-up note under-scoped the real fix; worth checking, for
  any future "extend X to the other side" follow-up, whether the target function already naturally spans
  both sides before assuming a side-restricted patch is the right shape.
