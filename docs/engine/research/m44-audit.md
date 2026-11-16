# M44 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done section for M35–M43 in full, and
> `docs/engine/research/m43-audit.md` in full (its Rejected-alternatives / Open-questions /
> Implications sections in particular). Re-swept `render/automapPanel.ts` + its `apps/web` host,
> `render/hudPanel.ts` + its `apps/web` host, `render/exploreScreen.ts`'s `ExploreParty` fields, and
> `render/combatScreen.ts`'s full `CombatScreenInput`/`CombatCellState` field lists against their real
> callers (none newly checked at this depth in M35–M43) — no gap found in any of them (automap/HUD
> fully wired; `exploreScreen.ts`'s `ExploreParty.down` is intentionally unread per M42's own doc
> comment; `combatScreen.ts`'s only unread field, `CombatCellState.hpFraction`, was already
> investigated and rejected by M41 as dead on *both* ends, not a display bug — re-confirmed, not
> re-litigated). Found the round's pick instead in `referenceDb.ts`'s **`itemCategory()`** — the
> Reference DB / Companion Panel Databases tab's Items sub-builder, `monsterCategory()`'s direct
> sibling in the same file and the exact same "flatten a rich decoded record into a few `{label,
> value}` rows" chokepoint shape M37/M38/M43 already mined three times on the *monster* side of this
> file, but never audited this deeply on the *item* side. Every real-mechanic claim below was
> independently re-derived this round via a throwaway `vitest` script
> (`packages/engine/test/_scratch_m44_range.test.ts`, created, run, 4/4 green, then deleted — listed
> at the end). `git status --porcelain` is clean except this doc.
>
> **Headline pick: `itemCategory()` already shows a ranged weapon's `Ranged: missile`/`Ranged:
> thrown` kind row, but never shows the one number that kind implies — `BaseItem.range`, the
> weapon's actual maximum shot distance in grid cells.** That number is not decorative catalogue
> flavour: it is read by the exact same tactical-combat engine this whole M-series keeps citing
> (`combat/tactical.ts`), converted into the real short/medium/long to-hit bracket
> (`missileRangeBracket()`) and then into the real **+1/0/−2 to-hit modifier**
> (`rangeBracketToHit()`) applied to every missile shot in every fight — for CoK's four real ranged
> weapons (**Sling**, **Staff Sling**, **Short Bow**, **Dart**, all four present and named in the
> real `ITEM1.DAX` catalogue). The live combat log already *narrates* this mechanic in-battle (a
> shot at long range is tagged `"(long range)"`, at point-blank `"(point blank)"` —
> `apps/web/src/ui/combat.ts`'s `rangeTag()`), and the field is even exposed on the `window.__combat`
> e2e test seam (`weaponOf().range`) — but a player reading the bestiary/catalogue screen to decide
> *which bow to buy or ready*, before ever stepping into a fight, has no way to see how far any of
> these weapons actually shoot. `itemCategory()` is the exact chokepoint that already shows this
> weapon's `Damage`, `Ranged` kind, and `Hands` (two-handed) facts side by side — the range number is
> the one sibling left on the cutting-room floor.

## Headline finding

`BaseItem.range` is declared with a doc comment that already states its live combat role, right
alongside the catalogue's other already-shown fields (`damage`, `armorAc`, `shieldBonus`,
`twoHanded`, `ranged`):

```ts
// packages/engine/src/items/baseItems.ts:36-44
/**
 * Maximum missile/thrown range in **grid cells** (Chebyshev) — only meaningful with {@link ranged}.
 * 1e-inferred + labelled: AD&D-1e quotes bow/sling/dart ranges in 10-yard increments (short bow ~5/10/
 * 15", sling ~5/10/20", dart ~1.5/3/4.5"); mapped to the Gold Box combat grid at the same ~1 cell ≈ 10ft
 * scale the engine already uses for movement (see `moveRateToCells`). The Krynn games' own per-weapon
 * range table is cross-overlay/UNLOCATED (disasm-spells-krynn.md §17), so these are the 1e/Gold-Box
 * community-standard cell ranges, labelled inferred.
 */
range?: number;
```

Real values on real, named CoK catalogue entries (`packages/engine/src/items/baseItems.ts:64-71`):

| Base-type id | Name | `ranged` | `range` (cells) |
|---|---|---|---|
| 6 | Staff Sling | `missile` | 14 |
| 7 | Sling | `missile` | 14 |
| 9 | Short Bow | `missile` | 15 |
| 13 | Dart | `thrown` | 5 |

`.range` is genuinely load-bearing in tactical combat — it is threaded from the catalogue into the
combat weapon record by the same `combatEquip.ts` bridge M-series audits already trust for `.damage`:

```ts
// packages/engine/src/items/combatEquip.ts:24-40 (weaponFromBaseItem)
export function weaponFromBaseItem(item: BaseItem, damageOverride?: DamageDice, ammo?: number): Weapon {
  const damage = damageOverride ?? item.damage ?? { count: 1, sides: 2, bonus: 0 };
  if (item.ranged === 'missile') {
    return { name: item.name, kind: 'missile', damage, range: item.range ?? 12, ammo: ammo ?? DEFAULT_AMMO };
  }
  const w: Weapon = { name: item.name, kind: 'melee', damage, reach: 1 };
  if (item.ranged === 'thrown' && item.range !== undefined) w.range = item.range;
  return w;
}
```

...and then consumed by the tactical engine's real to-hit math, at both the attack resolver and the
public bracket-query API:

```ts
// packages/engine/src/combat/tactical.ts:596-601
export function missileRangeBracket(dist: number, maxRange: number): RangeBracket {
  if (maxRange <= 0) return 'short';
  if (dist <= maxRange / 3) return 'short';
  if (dist > (2 * maxRange) / 3) return 'long';
  return 'medium';
}
// packages/engine/src/combat/tactical.ts:615-616
export function rangeBracketToHit(bracket: RangeBracket): number {
  return bracket === 'short' ? 1 : bracket === 'long' ? -2 : 0;
}
// packages/engine/src/combat/tactical.ts:1130-1132 (the real attack resolver)
bracket = missileRangeBracket(figureDistance(actor, target), weapon.range ?? 0);
needed -= rangeBracketToHit(bracket);
needed -= actor.missileHitBonus ?? 0; // M25.S1 — COAB DexReactionAdj, ranged weapons only
// packages/engine/src/combat/tactical.ts:1885-1892 (TacticalCombat.missileBracket — the public query
// apps/web/src/ui/combat.ts wires to window.__combat.missileBracket for real e2e assertions)
missileBracket: (targetId: string) => {
  const a = current();
  const t = combatants.find((c) => c.id === targetId);
  if (!a || !t) return null;
  const w = missileWeapon(a);
  if (!w) return null;
  return missileRangeBracket(chebyshev(a.pos, t.pos), w.range ?? 0);
},
```

The live combat log already narrates the *consequence* of this number (the bracket), never the
number itself:

```ts
// apps/web/src/ui/combat.ts:563-565
function rangeTag(b?: string): string {
  return b === 'short' ? ' (point blank)' : b === 'long' ? ' (long range)' : '';
}
// apps/web/src/ui/combat.ts:592
else if (e.missile) pushLog(`${nameOf(e.actor)} shoots ${nameOf(e.target)} for ${e.damage}${rangeTag(e.rangeBracket)}.`);
```

...and the raw number is even exposed to the test harness, but never a player:

```ts
// apps/web/src/ui/combat.ts:1159-1162 — e2e-only seam, never rendered to a screen
weaponOf: (id: string) => {
  const w = state?.combatants.find((c) => c.id === id)?.weapons[0];
  return w ? { name: w.name, kind: w.kind, range: w.range ?? null } : null;
},
```

But `itemCategory()` — the function that already shows this weapon's `Damage`, `Ranged` kind, and
`Hands` in the exact same catalogue row builder — never reads `.range`:

```ts
// apps/web/src/ui/referenceDb.ts:126-149 (itemCategory, current state)
export function itemCategory(items: { name: string; baseTypeId: number; count?: number }[]): RefCategory {
  ...
  for (const it of items) {
    const base = baseItem(it.baseTypeId);
    ...
    const rows: RefDbDetailRow[] = [{ label: 'Type', value: kind }, { label: 'Base id', value: `${it.baseTypeId}` }];
    if (it.count) rows.push({ label: 'Qty', value: `${it.count}` });
    if (base?.damage) rows.push({ label: 'Damage', value: dmgText(base.damage) });
    if (base?.armorAc !== undefined) rows.push({ label: 'Armor AC', value: `${base.armorAc}` });
    if (base?.shieldBonus !== undefined) rows.push({ label: 'Shield', value: `+${base.shieldBonus}` });
    if (base?.ranged) rows.push({ label: 'Ranged', value: base.ranged });
    // — base?.range is never read anywhere in this function —
    if (base?.twoHanded) rows.push({ label: 'Hands', value: '2H' });
    details.push(rows);
  }
  return { key: 'items', label: 'Items', entries, details };
}
```

This is the **same function** `itemCategory()` M39.S1 already extended once (to add the `Qty` row
from `ItemRecord.count`) — so, exactly like `monsterCategory()`'s three-rounds-running pattern, this
is the second extension of the item-side sibling of the same file's chokepoint shape, one round
after M39, four rounds after the pattern was first proven on the monster side.

## Why this fits the loop's established shape

1. `itemCategory()`'s own row builder already shows every other `BaseItem` combat-relevant field —
   `damage`, `armorAc`, `shieldBonus`, `ranged`, `twoHanded` — all labelled-inferred 1e/Gold-Box-
   community values from the exact same catalogue (`baseItems.ts`'s own top-of-file doc comment:
   "Damage values are canonical AD&D-1e … armour AC is the worn-armour AC before Dexterity"), so
   showing `.range` alongside them is not a new class of fact, just the one column left unshown from
   a catalogue this function already trusts and partially surfaces.
2. `.range` is a single flat, self-contained, unambiguous fact (a maximum distance in cells) — it
   passes the same "is this one flat, self-explanatory fact, or does showing it right require more
   than a label+value pair" test M43's Implications section proposed, the same test that picked
   `regenPerRound`/`halfDamage` over `conSaveBonus` (a roll modifier) last round. Unlike
   `conSaveBonus`, there is no risk of a player misreading a printed "Range: 14" as anything other
   than what it says.
3. It has a real, independently-checkable combat consumer in **both** of the engine's real call
   sites cited above (the attack resolver's inline bracket lookup, and the public
   `TacticalCombat.missileBracket()` API `apps/web`'s own `window.__combat` e2e seam already reads) —
   matching M43's own bar of "checked independently in two separate places," not a single
   speculative reference.
4. It is the **direct sibling-file analog** of the `monsterCategory()` pattern (method (e) in this
   round's brief): `itemCategory()` sits three lines above/below `monsterCategory()` in the same
   file, has the identical "decoded record → flattened detail rows, additively extended before"
   shape, and was itself the exact function M39.S1 already extended once — so this is a second pass
   over a chokepoint this loop has now mined on **both** of its two record types in the same file.

## Real-bytes / real-mechanic verification (this round)

Reproduced independently via `packages/engine/test/_scratch_m44_range.test.ts` (created, run, 4/4
passed, then deleted):

### Test 1 — real CoK `ITEM1.DAX`: named ranged weapons resolve to a defined `BaseItem.range`

```
Sling (baseTypeId 7): ranged='missile', range=14
4 Dart (baseTypeId 13): ranged='thrown', range=5
Long Sword (melee, negative control): ranged=undefined, range=undefined
```

Confirms `item.test.ts`'s existing golden decode (`Sling`.baseTypeId === 7, real `ITEM1.DAX` bytes)
independently this round, then cross-references the catalogue lookup — not just trusted from the
audit's own tables.

### Test 2 — `BaseItem.range` genuinely drives the real to-hit bracket math, reproduced end-to-end

Ran the **actual** `weaponFromBaseItem` → `missileRangeBracket` → `rangeBracketToHit` chain
(the real functions, not reimplementations) against the real Sling (`range=14`) and Dart (`range=5`)
catalogue entries:

```
Sling at distance 4  -> bracket 'short' -> to-hit modifier +1
Sling at distance 13 -> bracket 'long'  -> to-hit modifier -2
Dart weaponFromBaseItem -> kind 'melee', range 5 (thrown-lob range preserved per combatEquip.ts's doc comment)
```

All match the hand-derived math from the doc comments (`14/3 ≈ 4.67`, `2·14/3 ≈ 9.33`) — not
inferred, directly executed.

### Test 3 — confirms `itemCategory()`'s source text never reads `.range` today, while it already reads `.ranged`

```ts
const rangeReadNotRanged = /base\??\.range(?!d)/.test(body); // false: no such read exists
expect(body.includes('base?.ranged')).toBe(true); // true: the sibling kind field IS already read
```

A direct proof (not inference) that the function reads the "is this ranged" fact but not the "how
far" fact.

### Test 4 — row-budget headroom

The richest real ranged-weapon record (Short Bow: `Type`, `Base id`, `Damage`, `Ranged`, `Range`,
`Hands` — 6 rows) sits comfortably under `REFERENCE_DB_DETAIL_ROWS = 12`
(`packages/engine/src/render/referenceDb.ts:72`) even before accounting for the fact that no real
CoK record combines a `Qty`/`Armor AC`/`Shield` row with a `Ranged` row (ammo has no damage/range of
its own; armour/shields have no `Ranged` kind) — so the true real-world max is lower still.

## Wiring plan

**One file, one function, one added conditional row** — the same size class as M39's `Qty` fix and
smaller than M43's two-row fix:

1. **`apps/web/src/ui/referenceDb.ts`**'s `itemCategory()` (currently lines 126-149) — add one
   conditional row right after the existing `Ranged` row (line 144), before `Hands`, so the two
   ranged-weapon facts sit together exactly as `monsterCategory()`'s `Save`/`Regen`/`Half Dmg` rows
   sit together after M43:
   ```ts
   if (base?.ranged) rows.push({ label: 'Ranged', value: base.ranged });
   // M44.S1 — BaseItem.range (baseItems.ts): the weapon's real max shot distance in grid cells,
   // already read by the tactical engine's missileRangeBracket()/rangeBracketToHit() to compute the
   // real +1/0/-2 to-hit modifier on every missile shot (tactical.ts:1130-1132) and already narrated
   // indirectly via the combat log's "(point blank)"/"(long range)" tags (combat.ts's rangeTag()) —
   // but never shown as a flat number anywhere a player can see before stepping into a fight.
   // Undefined for every melee-only weapon, so honestly omitted rather than fabricated.
   if (base?.range !== undefined) rows.push({ label: 'Range', value: `${base.range} cells` });
   if (base?.twoHanded) rows.push({ label: 'Hands', value: '2H' });
   ```
   No new import needed — `BaseItem` (already imported via `baseItem`) already declares `.range`
   (`packages/engine/src/items/baseItems.ts:44`). No engine-package change at all: the compositor
   (`packages/engine/src/render/referenceDb.ts`) already renders any generic `{label, value}` row
   (confirmed by direct reading, `referenceDb.ts:118-124`, no per-label special-casing — the same fact
   M39/M43 already established for this compositor).
   - Value format check: `"14 cells"` / `"15 cells"` are exactly 8 characters, `"5 cells"` is 7 — all
     fit the compositor's existing `value.slice(0, 8)` cap (`referenceDb.ts:123`) with zero
     truncation. `"Range"` (5 chars) fits the `label.slice(0, 9)` cap trivially.

2. **Tests** (extend the existing e2e case only — no new test file, no engine-package test change
   needed since `BaseItem.range` is already exercised by real tactical-combat tests elsewhere in the
   suite):
   - `apps/web/test/e2e.mjs`'s existing `runReferenceDb` case (id `'refdb'`, lines 3936-4005) already
     scans every Items entry for `"20 Arrow"`/`"Long Sword"` to assert the M39 `Qty` wiring
     (lines 3973-3987). Extend the same single scan loop to also capture the real `"Sling"` entry and
     assert its `Range` row, plus keep `"Long Sword"` as the negative control (no `Range` row on a
     melee weapon) — reusing the exact mechanism, zero new page navigation:
     ```js
     const { arrowQtyOk, swordNoQtyOk, slingRangeOk, swordNoRangeOk } = await page.evaluate(() => {
       let arrowSeen = false, arrowQtyRight = false, swordSeen = false, swordHasNoQty = false;
       let slingSeen = false, slingRangeRight = false, swordHasNoRange = false;
       const n = window.__refdb.entryCount();
       for (let i = 0; i < n; i++) {
         window.__refdb.select(i);
         const cur = window.__refdb.current();
         if (cur?.name === '20 Arrow') { arrowSeen = true; arrowQtyRight = cur.detail.some((d) => d.label === 'Qty' && d.value === '20'); }
         if (cur?.name === 'Long Sword') {
           swordSeen = true;
           swordHasNoQty = !cur.detail.some((d) => d.label === 'Qty');
           swordHasNoRange = !cur.detail.some((d) => d.label === 'Range');
         }
         if (cur?.name === 'Sling') { slingSeen = true; slingRangeRight = cur.detail.some((d) => d.label === 'Range' && d.value === '14 cells'); }
       }
       return {
         arrowQtyOk: arrowSeen && arrowQtyRight,
         swordNoQtyOk: swordSeen && swordHasNoQty,
         slingRangeOk: slingSeen && slingRangeRight,
         swordNoRangeOk: swordSeen && swordHasNoRange,
       };
     });
     if (!slingRangeOk || !swordNoRangeOk) errors.push(`item-range: slingRangeOk=${slingRangeOk} swordNoRangeOk=${swordNoRangeOk}`);
     ```
     and fold both new booleans into the case's existing `ok = catsOk && monOk && navOk && itemOk &&
     arrowQtyOk && swordNoQtyOk && spellOk` line.
   - **Open question, not required for this fix**: the in-play Companion Panel's live Databases tab
     (`companionPanel.ts`, fed from `explore.ts`'s `state.itemDb`) reaches the *same*
     `itemCategory()` function, so the fix is live there automatically with zero extra plumbing — but
     no e2e case today walks the live Companion Panel's Items sub-tab the way `explore`'s case walks
     its Monsters sub-tab for `goblinDetail`/`skeletonDetail` (M38/M43). Adding that positive control
     is a reasonable small follow-up but out of this round's minimal-diff scope; the standalone
     `?refdb=1` assertion above is a legitimate standalone proof (the same acceptance M39 itself
     used for its own `Qty` fix, which also only extended the standalone `refdb` case).

Rough size: ~6 LOC added to one `apps/web` file (1 conditional row + a doc comment), ~15 LOC
extending one existing e2e case's scan loop. No engine-package file touched, no new test file, no
new e2e case, no new route, no new UI panel.

## Layout / feasibility check

No layout risk: `composeReferenceDb`'s detail-row loop (`packages/engine/src/render/referenceDb.ts:
118-124`) draws up to `REFERENCE_DB_DETAIL_ROWS` (12) generic `{label, value}` rows at fixed
coordinates regardless of what produced them — the same generic drawing path M39/M43 already relied
on, no per-row special-casing to update. Test 4 above confirmed the richest realistic ranged-weapon
row set (6 rows) sits far under the 12-row cap. Column widths: `"Range"` (5 chars) under the
9-char label cap; `"14 cells"`/`"15 cells"` (8 chars) and `"5 cells"` (7 chars) all fit the 8-char
value cap with no truncation (verified by direct character count, not assumed).

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **`automapPanel.ts` (engine + `apps/web` host)** | Read both in full, field-by-field against `AutomapPanelInput`. Every field (`frameTiles`, `frameLayout`, `font`, `title`, `map`, `automap`, `pose`, `status`, `menu`) is read by `composeAutomapPanel` and populated by both the standalone `?automap=1` host and `companionPanel.ts`'s live tab. No gap found. |
| **`hudPanel.ts` (engine + `apps/web` host)** | Read both in full, field-by-field against `HudPanelInput`/`HudRow`. Every field (`name`/`hp`/`maxHp`/`xp`/`ac`/`cls`/`down`/`dead`, plus `title`/`status`/`menu`) is read by `composeHudPanel` and populated by `buildRows()` from `partyStatus()`/`getXp`. `age` (on the underlying `PartyMemberStatus`) is correctly not part of `HudRow` at all — already rejected M40/M41 on value-degeneracy grounds, not re-litigated. No new gap. |
| **`exploreScreen.ts`'s `ExploreParty.down`** | Confirmed still intentionally unread by `composeExploreScreen` per M42's own doc comment on the field (the exploration HUD conveys a fallen member via a literal `'DEAD'` HP string instead of colour) — re-derived by direct reading this round, not just trusted; this is a documented design choice, not a silent drop. |
| **`combatScreen.ts`'s `CombatCellState.hpFraction`** | Re-confirmed M41's exact finding still holds: dead on both ends — `apps/web/src/ui/combat.ts`'s `visibleCells()` never sets it, and `drawCombatant()` never reads it. An unbuilt scaffold stub, not a display bug; not re-litigated beyond confirming the grep still shows zero real usages anywhere in the codebase. |
| **`BaseItem.weightTenths`** (per-item weight, same catalogue as this round's pick) | Investigated as a second candidate from the same `BaseItem` table. Rejected: unlike `.range`, this field's *aggregate* (a character's total carried weight) is already displayed today — `apps/web/src/ui/inventory.ts:74-75` shows `${inventoryWeightLb(inv).toFixed(1)} LB` and the derived `encumbrance().label` on the Inventory panel. So `weightTenths` is a live, displayed mechanic already (indirectly, through a sum), the same "already wired through a formula" shape M41 used to reject `inventory.ts`'s `.value`/`sellStack()` candidate — not a silent drop. A *per-item* weight column on the Reference DB's Items tab would be a genuinely new, smaller feature, not this loop's "decoded-but-dropped" shape. |
| **`referenceDb.ts`'s `Class`-label collision** (flagged M37, unpicked M38-M43 — 7 rounds running) | Re-confirmed still live and unpicked — this would be the 7th consecutive round it's passed over. Still real, still cheap, but this round's `.range` finding has a cleaner "sibling field already shown, one column left" shape and a more concrete gameplay payoff (helping a player choose a ranged weapon before a fight) than a cosmetic label collision between two tabs. Deferred again. |
| **`dialogue.ts`/`town.ts`'s `recordJournal()` day-wiring gap** (flagged M41, deferred M42/M43) | Not re-investigated this round beyond re-reading M43's conclusion (needs net-new clock plumbing in two clockless standalone routes) — no new angle sought, standing scope note still accurate. |
| **`MonsterRecord.conSaveBonus`/`.itemPluses`/`.carriedItems`/`.preparedSpellIds`** | Not re-investigated — M43 already gave each a specific, still-accurate scope reason (roll-modifier ambiguity; array-needs-a-name-crosswalk), and this round's sweep found a stronger, cheaper, cleaner-shaped pick elsewhere before reaching these again. |
| **Item-instance subsystem** (`DokItemRecord.value`/`.magicBonus`/`.charges`/`.cursed`) | **Not re-investigated**, per standing instructions — blocked 15 consecutive rounds. |
| **`PartyMemberStatus.age`** | **Not re-investigated** — already rejected twice (M40, M41) on value-degeneracy grounds. |
| **`MapCell.ceiling`/`.flags`** | **Not re-investigated** — confirmed dead in M42, no new angle sought. |
| **`mainMenu.ts`** | **Not re-investigated** — confirmed clean (the "good example") in M42. |
| **`spellbook.ts`/`treasure.ts`/`townScreen.ts`/`wildernessScreen.ts`/`charSheet.ts`/`eclInspector.ts`/`inventory.ts`** | **Not re-swept** this round beyond the `weightTenths`/inventory cross-check above — all confirmed clean in M42/M43, no new angle sought for the rest of their fields. |

## Open questions / unknowns

- **Should the in-play Companion Panel's Databases → Items sub-tab get its own dedicated e2e
  positive control for the `Range` row** (mirroring M38/M43's `goblinDetail`/`skeletonDetail`
  pattern on the Monsters sub-tab), rather than relying solely on the standalone `?refdb=1` case's
  assertion? Not done this round (same scope decision M39 made for its own `Qty` fix) — a reasonable
  small follow-up, not required since `itemCategory()` is one function reached by both surfaces.
- **Should DoK's items ever get real `Range` rows too?** DoK's `ITEM0.DAX` records decode via
  `decodeDokItemArchive` and are still looked up through the same `baseItem(baseTypeId)` catalogue
  (`explore.ts:1616-1618`), so if DoK's raw `baseTypeId` byte happens to alias one of CoK's pinned
  ranged ids (6/7/9/13) the row would already show correctly with zero extra code — but whether DoK's
  compact record format's `baseTypeId` byte means the same thing as CoK's is **UNKNOWN**, not verified
  this round (out of scope; the fix is baseTypeId-driven and game-agnostic, so no DoK-specific code
  path needs to change either way).
- **Would a raw cell count ("14 cells") read better to a player than a AD&D-flavoured phrase (e.g.
  "Short/Medium/Long: 5/10/15")?** Left as a documented but unresolved presentation choice — the
  wiring plan picks the flat cell count because it matches the engine's own internal unit
  (`missileRangeBracket`'s Chebyshev cells) exactly, avoiding a second, lossy re-derivation of the
  1e-inferred bracket thresholds for display purposes only.

## Implications for our engine

- **The same "decoded record → flattened detail row" chokepoint shape recurs across *both* of
  `referenceDb.ts`'s two builders, not just `monsterCategory()`.** M37/M38/M43 mined
  `monsterCategory()` three times; this round found `itemCategory()` (three lines away in the same
  file, extended once already by M39) has an identical class of gap. Worth treating *every* category
  builder in this file — including `spellCategory()`, not yet audited field-by-field this deeply —
  as a standing checklist against its own source data model, the same discipline M43's Implications
  section already recommended for `MonsterRecord`.
- **A field can be genuinely "already shown to the player" through an indirect artifact (a log tag, a
  bracket name) while its raw numeric source is still nowhere on any screen.** `.range` is the
  clearest example yet in this series: the *consequence* of the number (a `"(long range)"` log tag)
  is already narrated in real combat, but the number itself was invisible everywhere, including the
  one screen (the catalogue) where a player would want it *before* a fight, not just as post-hoc
  flavour during one. Worth checking "is only the derived/bucketed form of this fact shown, while the
  flat source number is not" as its own distinct sub-case of the loop's general pattern.
- **Not every sibling field of an already-partially-surfaced record is an equally good pick** — this
  round's own within-round comparison (`.range` vs `.weightTenths`, both `BaseItem` fields never shown
  per-item on the Reference DB) shows that a field whose *aggregate* is already displayed elsewhere
  (weight → total pack weight/encumbrance) is a weaker, already-adequately-served candidate than one
  with zero display anywhere (range) — worth explicitly checking for an existing aggregate/derived
  display before treating a per-record field as untouched.
- **A fix that needs zero engine-package changes remains the preferred shape when available** — as in
  M39/M43, this round's entire diff lives in one `apps/web` UI-layer function; the engine compositor
  (`composeReferenceDb`) and the engine data model (`BaseItem`) already fully supported the fix.

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `packages/engine/test/_scratch_m44_range.test.ts` (4 tests: real CoK `ITEM1.DAX` ranged-weapon
  enumeration against the `BaseItem` catalogue, a live re-execution of the real
  `weaponFromBaseItem`→`missileRangeBracket`→`rangeBracketToHit` chain proving the to-hit-modifier
  mechanic, a source-text proof that `itemCategory()` reads `.ranged` but never `.range` today, and a
  row-budget headroom check) — run via `npx vitest run` (4/4 passed), then deleted. Confirmed via
  `git status --porcelain` (clean except this doc) after deletion.
