# M45 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done section for M35–M44 in full, and
> `docs/engine/research/m44-audit.md` in full (its Rejected-alternatives / Open-questions /
> Implications sections in particular). M44's own Implications section flagged one specific
> unfinished item: `referenceDb.ts`'s **`spellCategory()`** — the third of the file's three category
> builders (`monsterCategory()`/`itemCategory()`/`spellCategory()`) — had "not yet been audited this
> deeply" against its own data model. This round did that: read `spellCategory()` field-by-field
> against **both** of the two data sources it already partially reads (`spellList.ts`'s `SpellDef`,
> `spellEffects.ts`'s `SpellEffect`) — both turned out to be **already fully read**, zero gap — and
> then checked method (d) from the brief ("does an already-shipped feature in one compositor have an
> unshipped analog in a sibling compositor") by asking whether a **third**, sibling data source exists
> that the tactical *combat engine* already consumes for real spellcasting but `spellCategory()` never
> reaches at all. It does: `combatSpells.ts`'s `GEOMETRY` table (range/area/radius/save), reached via
> the already-exported `tacticalSpellFor()`. Every real-mechanic claim below was independently
> re-derived this round via a throwaway `vitest` script
> (`packages/engine/test/_scratch_m45_spell_geometry.test.ts`, created, run, 6/6 green, then deleted —
> listed at the end). `git status --porcelain` is clean except this doc.
>
> **Headline pick: `spellCategory()` already shows a spell's `Effect` kind and coarse `Target`
> category (`enemy`/`enemyGroup`/`ally`/`self`/...), but never shows the exact tactical-combat
> geometry that category implies — the spell's real max cast `range`, blast `area`/`radius`, and
> `save` mode.** This is the direct spell-side analog of M44's `BaseItem.range` finding on the item
> side: a coarse kind is already shown ("Ranged: missile" for items / "Target: enemyGroup" for
> spells), but the one precise number/set of numbers that kind implies is not. The values are read by
> the same tactical-combat engine this whole M-series keeps citing (`combat/tactical.ts`) — they gate
> whether a cast is even in range, whether a burst catches a bystander next to the aimed target, and
> whether a save halves or negates the effect — for 20 of CoK's 79 real player spells, including every
> named attack spell (**Fireball**, **Magic Missile**, **Lightning Bolt**, **Ice Storm**, **Cone of
> Cold**, **Flame Strike**, ...) and status spell (**Sleep**, **Hold Person**, **Fear**, **Slow**,
> **Haste**, **Stinking Cloud**). A player reading the spellbook/catalogue to decide *which spell to
> memorize* has no way to see how far it reaches, how wide it blasts, or whether a save mitigates it —
> only the combat log narrates the consequence, in the middle of a fight that already happened.

## Headline finding

`spellCategory()` (`apps/web/src/ui/referenceDb.ts:158-177`) reads every field of the two data
sources it already touches — `SpellDef` (`class`, `level`, `name`, `id`) and `SpellEffect` (`kind`,
`target`, `dice` including `.perLevel`, `campCastable`, `note`) — confirmed by direct reading and by
throwaway Test 3 (verbatim function body dumped and grepped: it uses `fx.kind`, `fx.target`,
`fx.dice`, `fx.campCastable`, `fx.note` — literally every `SpellEffect` field). So the "third builder,
never audited this deeply" premise from M44's Implications turned out to be **half true**: the two
data models it visibly reads are already fully mined. The actual gap is a data source
`spellCategory()` never reaches at all:

```ts
// apps/web/src/ui/referenceDb.ts:158-177 (spellCategory, current state)
export function spellCategory(): RefCategory {
  const entries: RefDbEntry[] = [];
  const details: RefDbDetailRow[][] = [];
  for (const sp of COK_SPELLS) {
    const tag = `${sp.class === 'cleric' ? 'C' : 'M'}${sp.level}`;
    entries.push({ name: sp.name, tag });
    const fx = spellEffect(sp.id);
    const rows: RefDbDetailRow[] = [
      { label: 'Class', value: sp.class === 'cleric' ? 'Cleric' : 'Mage' },
      { label: 'Level', value: `${sp.level}` },
      { label: 'Effect', value: fx.kind },
      { label: 'Target', value: fx.target },
    ];
    if (fx.dice) rows.push({ label: 'Dice', value: dmgText(fx.dice) + (fx.dice.perLevel ? '/L' : '') });
    rows.push({ label: 'Camp', value: fx.campCastable ? 'Yes' : 'No' });
    if (fx.note) rows.push({ label: 'Note', value: fx.note });
    details.push(rows);
  }
  return { key: 'spells', label: 'Spells', entries, details };
}
// — tacticalSpellFor() / GEOMETRY (combatSpells.ts) is never imported or called here —
```

`combatSpells.ts`'s `GEOMETRY` table is a **third, sibling data source** to `SpellDef`/`SpellEffect` —
a mapping keyed by the same `COK_SPELLS` ids to real combat geometry, doc-commented with its own
mechanical role right at the top of the file:

```ts
// packages/engine/src/ruleset/addnd1e-dragonlance/combatSpells.ts:23-31
/** Combat geometry for a spell: how far it reaches, what it covers, and how a save mitigates it. */
interface SpellGeometry {
  /** Max Chebyshev range from caster to aim point, in cells. 0 = touch/self. */
  range: number;
  area: SpellAreaShape;
  /** Burst/cone radius in cells (omit for single-cell). */
  radius?: number;
  save: SpellSaveMode;
}
```

It is reached only via the exported `tacticalSpellFor(spellId, name, casterLevel, usesLeft)` →
`TacticalSpell`, which **is already exported from the top-level engine package**
(`packages/engine/src/index.ts:416-417`, re-exporting `packages/engine/src/ruleset/
addnd1e-dragonlance/index.ts:109,225`) — so no engine-package change is needed to reach it, exactly
the "zero engine-package changes" shape M39/M43/M44 all preferred.

`.range`/`.area`/`.radius`/`.save` are genuinely load-bearing in the real tactical combat engine, at
three independent points in the resolver:

```ts
// packages/engine/src/combat/tactical.ts:1297 — .range genuinely gates whether a cast is even legal
if (chebyshev(actor.pos, aim) > (spell.range ?? 0) && spell.target !== 'self') return []; // out of range

// packages/engine/src/combat/tactical.ts:1262-1288 (spellAffected) — .area/.radius decide who's hit
function spellAffected(actor: TacticalCombatant, spell: TacticalSpell, aim: GridPos): TacticalCombatant[] {
  if (spell.target === 'self') return [actor];
  const wantSide: CombatSide = spell.target === 'enemy' ? foeSideOf(actor) : actor.side;
  ...
  const radius = Math.max(0, spell.radius ?? 0);
  switch (spell.area) { /* single / burst / cone / line fan-out */ }
}

// packages/engine/src/combat/tactical.ts:1317-1332 — .save decides half/negate
const rollsSave = spell.save !== 'none' && t.save !== undefined;
const saved = rollsSave ? rng.die(20) + (t.conSaveBonus ?? 0) >= t.save! : false;
...
if (spell.damage) {
  let dmg = rollAmount(spell.damage, level);
  if (saved) dmg = spell.save === 'negate' ? 0 : Math.floor(dmg / 2);
  ...
}
```

...and the AI's own offensive-cast logic reads `.range`/`.save` independently, to decide range and
whether a save-negated spell is worth casting at all:

```ts
// packages/engine/src/combat/tactical.ts:1675-1693 (chooseOffensiveCast)
const inRange = foes.filter(
  (f) => chebyshev(actor.pos, f.pos) <= (s.range ?? 0) && clearLineOfFire(actor.pos, f.pos),
);
if (s.save !== 'none' && inRange.every((f) => aiTargetWouldSave(s, f))) continue; // all would save → skip
```

And the real UI consumer chain, mirroring `combatEquip.ts`'s weapon bridge M44 already cites for
items, is `apps/web/src/ui/party.ts`'s `combatSpellsForMember()`:

```ts
// apps/web/src/ui/party.ts:654-673 (combatSpellsForMember — the real bridge from a party member's
// memorized spells to the tactical combat engine's Cast command)
const casterLevel = sheet.classes[def.class as DragonlanceClassId] ?? 1;
const spell = tacticalSpellFor(spellId, def.name, casterLevel, uses, healBonus);
if (spell) out.push(spell);
```

This is the exact same "coarse kind already shown, precise number not" shape M44 found for
`BaseItem.range`: `itemCategory()` showed a weapon's `Ranged: missile` kind but not its `.range`
number; `spellCategory()` shows a spell's `Target: enemyGroup` kind (and `Effect: damage`) but not
its `.range`/`.area`/`.radius`/`.save` numbers — the exact tactical parameters the resolver applies.
`Target` and `Area` are **not** redundant: `Target` is a coarse ally/enemy/group/self category from
the ruleset-side `SpellEffect`; `Area`/`Range`/`Save` are the precise combat-engine geometry from a
completely separate table (`combatSpells.ts`), cross-checked below to confirm they're consistent but
distinct facts (e.g. Fireball: `Target: enemyGroup` + `Range: 10 cells` + `Area: burst r2` +
`Save: half` — four complementary facts, not duplicates).

## Why this fits the loop's established shape

1. `spellCategory()`'s own row builder already shows the spell's other classificatory facts (`Class`,
   `Level`, `Effect`, `Target`) from the same catalogue it partially trusts — showing the tactical
   geometry alongside them is not a new class of fact, just the one data source (`combatSpells.ts`)
   left unread from a mechanic this loop has now mined on **both** the item side (M44) and the spell
   side (this round).
2. It is a set of flat, self-contained facts (a distance, a shape+radius, a save mode) — passes the
   same "is this one flat, self-explanatory fact" bar M43/M44 both used to prefer `regenPerRound`/
   `halfDamage`/`.range` over `conSaveBonus` (an ambiguous roll modifier).
3. It has real, independently-checkable combat consumers in **three separate places** in the real
   resolver (the in-range gate, the area fan-out, the save-half/negate branch) plus the AI's own
   offensive-cast decision — a stronger multi-site consumer bar than M44's own two-site bar.
4. It is the **direct spell-side analog** of the `itemCategory()`/`BaseItem.range` pattern M44 mined
   one round ago: `spellCategory()` sits immediately below `itemCategory()` in the same file, has the
   identical "decoded/derived record → flattened detail rows, additively extended before" shape, and
   the exact same "coarse kind shown, precise number withheld" defect — one round after the analogous
   fix shipped on the sibling builder.
5. Directly answers M44's own open Implications question ("is `spellCategory()` audited this deeply
   yet?") with a real finding, not a null result.

## Real-bytes / real-mechanic verification (this round)

Reproduced independently via `packages/engine/test/_scratch_m45_spell_geometry.test.ts` (created, run,
**6/6 passed**, then deleted):

### Test 1 — real named CoK spells resolve to a defined `TacticalSpell` geometry via the real exported API

```
Fireball:          { range: 10, area: 'burst',  radius: 2, save: 'half' }
Magic Missile:      { range: 12, area: 'single', radius: undefined, save: 'none' }
Cure Light Wounds:  { range: 1,  area: 'single', radius: undefined, save: 'none' }
Sleep:              { range: 12, area: 'burst',  radius: 2, save: 'none' }
Bless (negative control, a pure buff with no GEOMETRY entry): null
```

Matches `combatSpells.ts`'s own source table exactly (`GEOMETRY['m3-fireball']` etc.) — not inferred,
directly executed through the real, unmodified `tacticalSpellFor()`.

### Test 2 — real `COK_SPELLS` coverage: how much of the player spellbook has live tactical geometry

```
20/79 COK_SPELLS have tactical geometry: Cure Light Wounds, Cause Light Wounds, Hold Person,
Cure Serious Wounds, Cure Critical Wounds, Cause Critical Wounds, Flame Strike, Burning Hands,
Magic Missile, Shocking Grasp, Sleep, Stinking Cloud, Fireball, Haste, Hold Person, Lightning Bolt,
Slow, Fear, Ice Storm, Cone of Cold
```

Substantial real coverage (every named attack spell and every status spell), not a corner case.

### Test 3 — confirms `spellCategory()`'s source text never reads range/area/radius/save/`tacticalSpellFor` today, while it already reads every `SpellEffect` field

```ts
expect(body.includes('tacticalSpellFor')).toBe(false); // true today — passes
expect(body.includes('.range')).toBe(false);  // true today — passes
expect(body.includes('.area')).toBe(false);   // true today — passes
expect(body.includes('.radius')).toBe(false); // true today — passes
expect(body.includes('.save')).toBe(false);   // true today — passes
// Sibling facts it DOES already read, for contrast — all true:
expect(body.includes('fx.kind')).toBe(true);
expect(body.includes('fx.target')).toBe(true);
expect(body.includes('fx.dice')).toBe(true);
expect(body.includes('fx.campCastable')).toBe(true);
```

A direct proof (not inference) that the function fully mines `SpellEffect` but has zero contact with
`combatSpells.ts`'s geometry table.

### Test 4 — the real combat engine actually applies `.area`/`.radius` to a live cast (not decorative)

Ran the **actual** `createTacticalCombat`/`.apply({type:'cast', ...})` resolver (not a
reimplementation) with a real Fireball (`range 10, burst radius 2`) aimed at a foe 9 cells away, with
a second foe standing adjacent to the aim point but never directly targeted:

```
Fireball cast events: [
  { target: 'a', damage: 19, targetHpAfter: 11 },  // directly aimed at
  { target: 'b', damage: 11, targetHpAfter: 19 },  // caught by burst radius 2, never targeted directly
]
```

Both foes took damage — `far` (outside the radius) stayed at full HP. Proves `.area`/`.radius` are
genuinely load-bearing, not descriptive metadata: a foe adjacent to (but not aimed at) the blast point
takes real damage purely because of the radius value.

### Test 5 — `.range` genuinely gates castability

A Fireball (`range 10`) aimed at a foe at distance 11 produces **zero events** — the cast is silently
rejected and the target takes no damage, matching `tactical.ts:1297`'s in-range gate exactly.

### Test 6 — row-budget headroom

Computed the real max detail-row count across all 79 `COK_SPELLS` after adding the proposed Range/
Area/Save rows (gated on a real `GEOMETRY` entry existing, alongside the pre-existing Class/Level/
Effect/Target/[Dice]/Camp/[Note] rows): the richest real spell (**Cure Light Wounds** — has both
`Dice` and the new geometry rows, but no `Note`) tops out at **9 rows**, comfortably under
`REFERENCE_DB_DETAIL_ROWS = 12` (`packages/engine/src/render/referenceDb.ts:72`). Confirmed by direct
enumeration, not assumption — `Dice` and `Note` never co-occur on the same spell in the real table
(`heal()`/`dmg()` never set `.note`; `cure()`/`buff()` never set `.dice`), so the naive "add all
conditionals" worst case never actually occurs.

## Wiring plan

**One file, one import, one function, three related conditional rows under a single guard** — the
same size class as M43's two-row fix, one row-group bigger than M44's single row (three related
geometry facts only make sense shown together):

1. **`apps/web/src/ui/referenceDb.ts`**'s import block (currently lines 13-32) — add `tacticalSpellFor`
   to the existing `@goldbox/engine` import (already re-exported at the top level, confirmed at
   `packages/engine/src/index.ts:416`, no engine-package change needed):
   ```ts
   import {
     ...
     COK_SPELLS,
     spellEffect,
     tacticalSpellFor,   // M45.S1
     composeReferenceDb,
     ...
   } from '@goldbox/engine';
   ```

2. **`spellCategory()`** (currently lines 158-177) — add one conditional row-group right after the
   existing `Dice` row, before `Camp`:
   ```ts
   if (fx.dice) rows.push({ label: 'Dice', value: dmgText(fx.dice) + (fx.dice.perLevel ? '/L' : '') });
   // M45.S1 — combatSpells.ts's real tactical-combat geometry (range/area/radius/save-mode), reached
   // via the already-exported tacticalSpellFor(): the exact numbers tactical.ts's apply()/
   // spellAffected() apply to every real cast (the in-range gate, the burst/cone/line fan-out, the
   // half/negate save resolution) — more precise than the Target row above (which only says
   // "enemy"/"enemyGroup", never how far or how wide). Only the 20/79 COK_SPELLS with a modelled
   // tactical effect resolve non-null; every flavour-only utility/buff spell (Bless, Shield, Charm
   // Person, ...) is honestly omitted, not fabricated. casterLevel/usesLeft are nominal placeholders
   // (1, 1) — neither affects range/area/radius/save, only the (unused here) damage/heal magnitude
   // and remaining-uses count.
   const geo = tacticalSpellFor(sp.id, sp.name, 1, 1);
   if (geo) {
     rows.push({ label: 'Range', value: geo.range === 1 ? '1 cell' : `${geo.range} cells` });
     rows.push({ label: 'Area', value: geo.radius ? `${geo.area} r${geo.radius}` : geo.area });
     rows.push({ label: 'Save', value: geo.save });
   }
   rows.push({ label: 'Camp', value: fx.campCastable ? 'Yes' : 'No' });
   ```
   No engine-package change at all — `composeReferenceDb` already draws any generic `{label, value}`
   row (`packages/engine/src/render/referenceDb.ts:118-124`, no per-label special-casing, the same fact
   M39/M43/M44 already established for this compositor).
   - Value format check (verified by direct character count, not assumed): `"10 cells"`/`"12 cells"`
     are exactly 8 characters; `"1 cell"` is 6; `"burst r2"`/`"burst r1"` are 8; `"cone r1"`/`"cone
     r3"` are 7; `"line"` is 4; `"single"` is 6 — every real value across all 20 geometried spells fits
     the compositor's `value.slice(0, 8)` cap (`referenceDb.ts:123`) with zero truncation. `"Range"`
     (5), `"Area"` (4), `"Save"` (4) all fit the `label.slice(0, 9)` cap trivially.
   - `companionPanel.ts:369` already calls this same `spellCategory()` for the in-play Companion
     Panel's Databases → Spells sub-tab (for CoK, DoK, and DQK — one shared static ruleset table, no
     per-game branch) — so, exactly like M44's item fix, this is live on both surfaces with zero extra
     plumbing.

3. **Tests** (extend the existing e2e case only — no new test file, no engine-package test change
   needed since `tacticalSpellFor`/`GEOMETRY` are already exercised by real tactical-combat tests
   elsewhere in the suite, e.g. `packages/engine/test/tactical.test.ts`'s existing burst/save/
   out-of-range cast cases):
   - `apps/web/test/e2e.mjs`'s existing `runReferenceDb` case (id `'refdb'`, lines 3936-4019) already
     has a per-entry scan-loop pattern for the Items tab (`arrowQtyOk`/`swordNoQtyOk`/`slingRangeOk`/
     `swordNoRangeOk`, lines 3978-3999) — after the existing Spells-category assertions (lines
     4004-4009), add the identical pattern for the Spells tab: scan for the real **"Fireball"** entry
     (asserts `Range: 10 cells` / `Area: burst r2` / `Save: half`) and **"Bless"** (asserts none of
     those three rows — the negative control, a real pure-buff spell with no `GEOMETRY` entry):
     ```js
     await page.evaluate('window.__refdb.setCategory(2)');
     const spellKey = await page.evaluate('window.__refdb.categoryKey()');
     const spellCount = await page.evaluate('window.__refdb.entryCount()');
     const spellCur = await page.evaluate('window.__refdb.current()');
     const spellOk = spellKey === 'spells' && spellCount >= 40 && !!spellCur &&
       spellCur.detail.some((d) => d.label === 'Class') && spellCur.detail.some((d) => d.label === 'Level');

     // M45.S1 — Fireball (real tactical geometry: range 10, burst radius 2, half save) shows Range/
     // Area/Save rows; Bless (a pure buff, no GEOMETRY entry) shows none — the same real-vs-negative-
     // control scan the M39/M44 item rows already use, applied to the Spells tab.
     const { fireballGeoOk, blessNoGeoOk } = await page.evaluate(() => {
       let fireballSeen = false, fireballRight = false, blessSeen = false, blessHasNoGeo = false;
       const n = window.__refdb.entryCount();
       for (let i = 0; i < n; i++) {
         window.__refdb.select(i);
         const cur = window.__refdb.current();
         if (cur?.name === 'Fireball') {
           fireballSeen = true;
           fireballRight = cur.detail.some((d) => d.label === 'Range' && d.value === '10 cells')
             && cur.detail.some((d) => d.label === 'Area' && d.value === 'burst r2')
             && cur.detail.some((d) => d.label === 'Save' && d.value === 'half');
         }
         if (cur?.name === 'Bless') {
           blessSeen = true;
           blessHasNoGeo = !cur.detail.some((d) => d.label === 'Range')
             && !cur.detail.some((d) => d.label === 'Area') && !cur.detail.some((d) => d.label === 'Save');
         }
       }
       return { fireballGeoOk: fireballSeen && fireballRight, blessNoGeoOk: blessSeen && blessHasNoGeo };
     });
     if (!fireballGeoOk || !blessNoGeoOk) errors.push(`spell-geo: fireballGeoOk=${fireballGeoOk} blessNoGeoOk=${blessNoGeoOk}`);
     ```
     and fold both new booleans into the case's existing `ok = catsOk && monOk && navOk && itemOk &&
     ... && spellOk` line (append `&& fireballGeoOk && blessNoGeoOk`).

Rough size: ~12 LOC added to one `apps/web` file (1 import + 1 conditional row-group + a doc comment),
~25 LOC extending one existing e2e case's Spells section. No engine-package file touched, no new test
file, no new e2e case, no new route, no new UI panel.

## Layout / feasibility check

No layout risk: `composeReferenceDb`'s detail-row loop (`packages/engine/src/render/referenceDb.ts:
118-124`) draws up to `REFERENCE_DB_DETAIL_ROWS` (12) generic `{label, value}` rows at fixed
coordinates regardless of what produced them — the same generic drawing path M39/M43/M44 already
relied on, no per-row special-casing to update. Test 6 confirmed the richest realistic spell row set
(9 rows, Cure Light Wounds) sits comfortably under the 12-row cap even in the worst real combination.
Column widths verified by direct character count (not assumed): every real `Range`/`Area`/`Save` value
across all 20 geometried spells is ≤8 characters, fitting the value cap with no truncation; all three
new labels are ≤5 characters, far under the 9-char label cap.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **`spellCategory()`'s existing `SpellDef`/`SpellEffect` fields** | Read the function body directly and confirmed by throwaway Test 3: every field of both data models it already touches (`class`, `level`, `name` from `SpellDef`; `kind`, `target`, `dice`/`.perLevel`, `campCastable`, `note` from `SpellEffect`) is already read. Zero gap here — the actual gap was a third, unreached data source (`combatSpells.ts`'s `GEOMETRY`), not a dropped field on either of the two sources this function visibly touches. |
| **`referenceDb.ts`'s `Class`-label collision** (flagged M37, unpicked M38-M44 — 8 rounds running) | Re-confirmed still live and unpicked — this would be the 9th consecutive round it's passed over. Still real, still cheap, but this round's spell-geometry finding has a stronger multi-site-consumer bar (three real resolver call sites plus the AI's own cast decision) and a bigger real-mechanic payoff than a cosmetic label collision between two tabs. Deferred again. |
| **DoK Companion-Panel e2e positive control for `Range` (M43/M44's ranged-weapon fix, never independently verified on DoK)** | Not re-investigated — still a legitimate small follow-up (see M44's own Open Questions), but this round's sweep found a stronger, cheaper, cleaner-shaped pick on the *spell* side of the same file before returning to this. |
| **Whether DoK's `baseTypeId` aliases CoK's pinned ranged-weapon ids (6/7/9/13)** | Not re-investigated — still genuinely unverified per M44, but out of this round's scope; would be a quick probe for a future round, not chosen this round since a stronger new candidate turned up first. |
| **`MonsterRecord.conSaveBonus`/`.itemPluses`/`.carriedItems`/`.preparedSpellIds`** | Not re-investigated — M43 already gave each a specific, still-accurate scope reason (roll-modifier ambiguity; array-needs-a-name-crosswalk), and this round's sweep found a stronger, cheaper, cleaner-shaped pick elsewhere before reaching these again. |
| **Wiring real `day` into `dialogue.ts`/`town.ts`'s `recordJournal()` calls** (flagged M41, deferred M42/M43) | Not re-investigated this round beyond re-reading M43's conclusion (needs net-new clock plumbing in two clockless standalone routes) — no new angle sought, standing scope note still accurate. |
| **Item-instance subsystem** (`DokItemRecord.value`/`.magicBonus`/`.charges`/`.cursed`) | **Not re-investigated**, per standing instructions — blocked 16 consecutive rounds. |
| **`PartyMemberStatus.age`** | **Not re-investigated** — already rejected twice (M40, M41) on value-degeneracy grounds. |
| **`MapCell.ceiling`/`.flags`** | **Not re-investigated** — confirmed dead in M42, no new angle sought. |
| **`mainMenu.ts`** | **Not re-investigated** — confirmed clean (the "good example") in M42. |
| **`exploreScreen.ts`'s `ExploreParty.down`, `combatScreen.ts`'s `CombatCellState.hpFraction`** | **Not re-investigated** — both confirmed dead/intentional in M41/M42, re-confirmed in M44, no new angle sought this round. |
| **`spellbook.ts`/`treasure.ts`/`townScreen.ts`/`wildernessScreen.ts`/`charSheet.ts`/`eclInspector.ts`/`inventory.ts`/`automapPanel.ts`/`hudPanel.ts`/`BaseItem.weightTenths`** | **Not re-swept** this round — all confirmed clean in M42-M44, no new angle sought for their own fields (this round's finding came from a genuinely new data-source cross-check inside `referenceDb.ts`, not a re-sweep of any of these). |

## Open questions / unknowns

- **Should `.range === 1` render as `"1 cell"` (singular) or `"1 cells"` (literal, matching M44's exact
  phrasing convention for items)?** The wiring plan above special-cases the singular for grammatical
  correctness (cheap, one ternary) — but M44 itself left an open, unresolved presentation-choice
  question about whether raw cell counts read better than a labelled bracket at all. Not resolved
  either way; a minor wording call for whoever implements this.
- **Is `Target` (already shown) ever inconsistent with the new `Area`/`Range` facts for any of the 20
  geometried spells** (e.g. a `SpellEffect.target === 'enemyGroup'` spell whose `combatSpells.ts` area
  is `'single'`, which would look contradictory side by side)? Spot-checked several real pairs this
  round (Fireball: `enemyGroup`/`burst`; Magic Missile: `enemy`/`single`; Lightning Bolt:
  `enemyGroup`/`line`) and found no contradiction, but **not exhaustively cross-checked** against all
  20 entries — a reasonable follow-up sanity pass, not blocking, since the two facts come from
  independently-authored tables (`spellEffects.ts` vs `combatSpells.ts`) that could in principle drift.
- **Would a future round want to also surface `TacticalSpell.inflict`** (the status a spell inflicts —
  `asleep`/`held`/`feared`/`slowed`/`hasted`, with its duration) for the 7 status spells that carry one
  (Sleep, Stinking Cloud, both Hold Persons, Fear, Slow, Haste)? Genuinely a sibling fact one level
  deeper than this round's pick (`INFLICT` in `combatSpells.ts`, not exported at all today — would
  need a small new export, unlike this round's fix which needed zero new exports) — flagged but out of
  this round's minimal-diff scope.

## Implications for our engine

- **A "coarse category already shown, precise mechanical numbers withheld" gap recurs across sibling
  builders in the same file, on both of its two record types now** — M44 found it on the item side
  (`Ranged` kind shown, `.range` number withheld); this round found the identical shape on the spell
  side (`Target`/`Effect` kind shown, `.range`/`.area`/`.radius`/`.save` withheld). Worth treating this
  specific sub-pattern — "is only a bucketed/categorical version of a mechanical fact shown, while the
  flat number(s) behind it are not" — as its own standing checklist item for any future category
  builder audited in this file or elsewhere.
- **A real mechanical data source can be completely invisible to a display chokepoint even when the
  chokepoint already partially serves the *same conceptual area* (spellcasting) through a different,
  fully-mined data model.** `spellCategory()` was NOT sloppy about `SpellEffect` — it read every field
  — but had zero awareness that a second, independent ruleset table (`combatSpells.ts`) existed for
  the same spells. Worth explicitly checking, for any category builder, whether its record type has
  *sibling* data sources elsewhere in the ruleset (not just unread fields on the sources it already
  touches) before declaring a builder "fully audited."
- **A fix that needs zero engine-package changes remains the preferred shape when available** — as in
  M39/M43/M44, this round's entire diff lives in one `apps/web` UI-layer function; the engine
  compositor (`composeReferenceDb`), the engine data model (`TacticalSpell`/`SpellGeometry`), and the
  engine API (`tacticalSpellFor`, already exported) all already fully supported the fix.

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `packages/engine/test/_scratch_m45_spell_geometry.test.ts` (6 tests: real `GEOMETRY`-table
  resolution via the actual `tacticalSpellFor()` for 4 named spells + 1 negative control; a coverage
  census of `COK_SPELLS` against `isTacticalCastable`; a source-text proof that `spellCategory()` reads
  every `SpellEffect` field but zero `combatSpells.ts` geometry; a live end-to-end re-execution of the
  real `createTacticalCombat`/`apply({type:'cast'})` resolver proving `.area`/`.radius` genuinely gate
  who's hit by a real Fireball; a live re-execution proving `.range` genuinely gates castability; and a
  row-budget headroom census across all 79 real spells) — run via `npx vitest run` (6/6 passed), then
  deleted. Confirmed via `git status --porcelain` (clean except this doc) after deletion.
