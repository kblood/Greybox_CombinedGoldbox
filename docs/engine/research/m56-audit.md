# M56 audit — the next "computed but unwired" candidate

> Audit method: per this round's brief, started from the M55-flagged standing candidate #1
> (`MonsterRecord.itemPluses`/`.carriedItems`, the exact side-table family M55 just added a
> "Spells" row for in `referenceDb.ts`'s `monsterCategory()`) and re-scrutinized M55's own stated
> reason for setting it aside ("`itemPluses` is a plain number array with no item identity, and
> `carriedItems`... would need a base-item-name lookup this function doesn't currently have").
> Confirmed via a throwaway `vitest` script
> (`packages/engine/test/_scratch_m56_verify.test.ts`, created, run, **6/6 green**, then deleted)
> against the **real** `Death Knights of Krynn/MON1CHA.DAX` + `MON1ITM.DAX` + `MON1WIZ.DAX` and
> `Champions of Krynn/MON1CHA.DAX` + `MON1ITM.DAX` that:
> 1. `baseItem()` (already imported into `referenceDb.ts` for the Items category) **does** resolve
>    some `carriedItems.baseTypeId`s to real names ("Arrow", "Leather Armor", "Vial") — but only
>    7 of 17 real DoK-area1 item-carrying monsters have **any** resolvable name (the `BASE_ITEMS`
>    catalogue only covers ~16 ids; M29.S1's own audit already flagged ≈14% coverage). Item-identity
>    naming is real but thin.
> 2. `itemPluses`, by contrast, needs **no** name resolution at all and has a **real, fully-wired,
>    currently-invisible-everywhere** consumer: `calcBattleExp`'s `Σ item.plus·400` bonus-XP term
>    (wired end-to-end since M26.S1). 16 of 64 real DoK-area1 monsters carry ≥1 positive-plus item,
>    worth a real **+400 to +9600 bonus XP** per monster if defeated and looted — and that number is
>    **never shown anywhere**, not in the bestiary (the gap this round fixes) and **not even
>    post-combat** (`combat.ts:724` logs only the lump `xpResult.total`; `awardPartyXp`
>    (`apps/web/src/ui/party.ts:947-961`) returns `{ total, perMember }` with no breakdown of how
>    much of `total` came from loot vs. flat monster XP vs. gold).
>
> **This round's headline therefore picks `itemPluses` over `carriedItems`** — the stronger half of
> M55's own candidate #1, not the literal "add `baseItem()` name lookup" path the standing note
> suggested, because `itemPluses` turns out to be the *more* hidden fact (spells at least become
> visible indirectly when a monster casts one mid-fight; this bonus-XP figure is swallowed by a lump
> sum even after the battle ends) and needs strictly less new code (no `baseItem()` call, no name
> formatting, no "what if it doesn't resolve" branch). `carriedItems`' name-identity gap is left
> exactly where M55 left it — a real, smaller, still-open follow-up (see Open questions).

## Headline finding

### The gap: `monsterCategory()` never reads `itemPluses`, even though its one real consumer (bonus post-combat XP) is fully wired and never individually surfaced anywhere else either

`apps/web/src/ui/referenceDb.ts:91-138` (current state, unmodified — the exact function M37/M38/
M43/M55 already extended four times):

```ts
export function monsterCategory(monsters: MonsterRecord[]): RefCategory {
  const entries: RefDbEntry[] = [];
  const details: RefDbDetailRow[][] = [];
  for (const m of monsters) {
    entries.push({ name: m.name || `#${m.blockId}`, tag: m.combatSize && m.combatSize > 1 ? 'LG' : undefined });
    const classValue = m.npcClass !== undefined ? (NPC_CLASS_LABEL[m.npcClass] ?? `class ${m.npcClass}`) : m.category;
    // M55.S1 — a real DoK caster's memorized spells ...
    const castableSpellCount = m.preparedSpellIds
      ? new Set(m.preparedSpellIds.map((id) => DOK_SPELL_CROSSWALK[id]).filter(Boolean)).size
      : 0;
    details.push([
      { label: 'AC', value: `${m.armorClass}` },
      ...
      ...(m.regenPerRound !== undefined ? [{ label: 'Regen', value: `${m.regenPerRound}/rd` }] : []),
      ...(m.halfDamage ? [{ label: 'Half Dmg', value: 'Yes' }] : []),
      ...(castableSpellCount > 0
        ? [{ label: 'Spells', value: `${castableSpellCount} spell${castableSpellCount === 1 ? '' : 's'}` }]
        : []),
    ]);
  }
  return { key: 'monsters', label: 'Monsters', entries, details };
}
```

`MonsterRecord.itemPluses` — never referenced in this function's body (confirmed by source-text
scan, same method M55 used). It's a plain `number[]`, one entry per carried item, decoded from
`MON{n}ITM.DAX`'s 63-byte records (`packages/engine/src/loaders/monsterSideTables.ts:343-348`'s
`applyItemPluses`), joined onto every `MonsterRecord` by `explore.ts` before the Companion panel
ever sees it — the same live join chain M55 already documented for `preparedSpellIds`:

```ts
// apps/web/src/ui/explore.ts:1576-1587 (current state, unmodified)
    monRecords = applyConSavingBonus(monRecords, spcAffects);
    // M26.S1/M29.S1 — join MON{n}ITM.DAX carried items onto the records: ...
    const itm = decodeMonsterItmArchive(itmBytes);
    monRecords = applyItemPluses(monRecords, itm);
    monRecords = applyCarriedItems(monRecords, itm);
    // M31.S1 — join MON{n}WIZ.DAX memorized spells ...
    monRecords = applyPreparedSpellIds(monRecords, decodeMonsterWizArchive(wizBytes));
```

...and passed straight to the Companion panel unchanged (`explore.ts:1129-1136`,
`companionPanel.ts:367` calling `monsterCategory(opts.source.monsters)` — both cited verbatim in
`m55-audit.md`, re-confirmed unchanged this round).

### `itemPluses`' one real consumer, and why it's currently invisible everywhere, not just in the bestiary

`packages/engine/src/loaders/monster.ts:252-260` (doc comment, unmodified):

```
 * M26.S1 — the `plus` of each item this monster carries (COAB `Item.plus`, `MON{n}ITM.DAX`'s
 * 63-byte carried-item records), for the post-combat `Σ item.plus·400` XP bonus (`calcBattleExp`,
 * `ovr006.cs calc_battle_exp`)... Undefined for the common case (no carried items).
 itemPluses?: number[];
```

`packages/engine/src/ruleset/addnd1e/experience.ts:50-61`:

```ts
export function calcBattleExp(enemies: readonly DefeatedEnemy[], loot: BattleLoot = {}): number {
  let total = 0;
  for (const e of enemies) { ... }
  total += loot.goldXpWorth ?? 0;
  for (const plus of loot.itemPluses ?? []) {
    if (plus > 0) total += plus * XP_PER_ITEM_PLUS; // XP_PER_ITEM_PLUS = 400
  }
  return total;
}
```

Real consumer, live in combat resolution — `apps/web/src/ui/combat.ts:721-724`:

```ts
    const itemPluses = foes.flatMap((c) => c.itemPluses ?? []);
    const xpResult = awardPartyXp(enemies, { goldXpWorth: haul.gold, itemPluses });
    state.xp = xpResult.total;
    pushLog(`Victory! The party gains ${xpResult.total} experience.`);
```

`awardPartyXp` (`apps/web/src/ui/party.ts:947-961`) returns only `{ total, perMember }` —
**`total` is a lump sum**; nothing downstream ever isolates "how much of this was from magic loot."
So `itemPluses`' real, mechanical effect on the game (extra XP for looting a magic-item-carrying
foe) is **never individually named anywhere the player can see it** — not before the fight (no
bestiary row), and not even after it (the victory log only prints one merged number). This is a
strictly *more* hidden fact than M55's `preparedSpellIds` pick, which at least becomes visible
indirectly the moment the monster actually casts a spell mid-battle.

### Real bytes (verified this round, `MON1CHA.DAX`/`MON1ITM.DAX`, not fixtures)

Reproduced via `_scratch_m56_verify.test.ts` (6/6 passed, then deleted):

- **DoK area 1** (`Death Knights of Krynn/MON1CHA.DAX` + `MON1ITM.DAX`): 64 monsters total; 17
  carry ≥1 real item; **16 of those 17 carry ≥1 item with a positive `plus`** (only ROGUE's carried
  items are all zero/negative-plus, correctly yielding `lootBonusXp = 0`). Real
  `calcBattleExp([], { itemPluses })` values range **+400** (SOLAMNIC KNIGHT `[0,0,1]`, PATRIARCH,
  HIGH PRIEST, EVIL WARRIOR, EVIL WARLORD — all single +1 items) up to **+9600** (FLAVIUS
  `[8,3,4,3,3,3]`, the real maximum — matches `m26-audit`'s own SOLAMNIC-KNIGHT-`[0,0,1]`→400
  figure, cross-validating both). SIR DRYDEN `[0,4,4,3]` → +4400; TANAR `[4,4,4,2]` → +5600; BLACK
  MAGE/BLACK WIZARD `[4,1,0]` → +2000; HIGH WIZARD `[4,1,3]` → +3200; ROGUE MAGE HIGH `[4,2,3]` →
  +3600; DURFEY/UNDEAD DURFEY `[0,2,2]` → +1600; SKOMP `[2,2]` → +1600.
- **CoK area 1** (`Champions of Krynn/MON1CHA.DAX` + `MON1ITM.DAX`): 26 monsters total; 11 carry
  items, but **0 carry any item with a positive plus** — so with today's real area-1 data, the new
  row would never actually render on the CoK side (an honest data-driven asymmetry, not a
  DoK-only *code* restriction — `explore.ts:1546,1582-1583` runs the identical `applyItemPluses`
  join for both games; see Open questions).
- **IGORF** (M55's own pick, block 97, the DoK caster) carries **no items at all**
  (`carriedItems`/`itemPluses` both `undefined`) — so this round's new row and M55's Spells row
  never collide on the same monster in isolation, though other real monsters (see next point) do
  populate both at once.
- **Row-cap / overlap check**: 8 of the 14 real DoK spellcasters (TANAR, FLAVIUS, BLACK MAGE, BLACK
  WIZARD, HIGH WIZARD, ROGUE MAGE HIGH, PATRIARCH, HIGH PRIEST) carry a positive-plus item **too**
  — i.e. they'd show **both** the M55 Spells row and this round's new row simultaneously. Computed
  the real total row count (9 mandatory + every currently-shipped optional row + this round's
  hypothetical new row) for **every one of the 17 real DoK-area1 item carriers**: the maximum
  across all of them is **11** (FLAVIUS: 9 mandatory + Spells + Bonus-XP), comfortably under
  `REFERENCE_DB_DETAIL_ROWS = 12`. None of the 17 also populate `npcLevel`/`savingThrows`/
  `regenPerRound`/`halfDamage` (all `undefined` across the sample), so no real monster can overflow
  the cap from this addition.
- **String-length budget**: the real maximum bonus is +9600 (FLAVIUS). Formatted as `+9600` (no
  unit suffix, label carries the unit — see Wiring plan), that's 5 characters, well inside the
  canvas's 8-character value-truncation budget (`referenceDb.ts` render file, "`d.value...slice(0,
  8)`") — smaller than M55's own "6 spells" (8 chars, the tightest fit that round accepted).

## Why this fits the loop's established shape

1. **A real, already-decoded/derived fact with a real, mechanically load-bearing consumer** —
   `itemPluses` already decides the exact size of the party's post-combat XP award
   (`combat.ts:721-724`'s `awardPartyXp`), wired since M26.S1, the same "already deciding real
   outcomes" shape every prior pick in this function has used.
2. **The exact display chokepoint already exists and already carries 5 sibling fields from the
   same side-table/side-fact family** — Class (M37), Save (M38), Regen/Half Dmg (M43), Spells
   (M55) are all additive rows in the same `details.push([...])` array. This is the **sixth** use
   of an already-proven mechanism, not a new UI surface.
3. **A genuinely new angle on a standing candidate, not a repeat of M55's own reasoning**: M55 set
   this family aside because `itemPluses` "has no item identity" — true, but irrelevant, because
   the row this round adds doesn't need identity at all; it needs the *aggregate bonus-XP figure*,
   which `calcBattleExp` already computes from the raw array with zero new math. Re-examining *why*
   a field was set aside (not just whether it was) is the same method M55 itself used one round
   earlier, applied one level deeper this round.
4. **Grounded against real bytes, not fixtures**: all 16 real DoK-area1 casters-and-non-casters'
   `itemPluses` arrays, resulting bonus-XP values, and the CoK-side zero-magic-item finding were
   independently re-derived this round from the actual `MON1CHA.DAX`/`MON1ITM.DAX` files (cross-
   validated against `m26-audit.md`'s own SOLAMNIC KNIGHT figure).
5. **A real layout/feasibility check, not just "there's room"**: computed the actual worst-case row
   count (11, for FLAVIUS, who has both a Spells row and this new row) across every real
   item-carrying DoK monster — safely under the 12-row cap — and the real value-string length
   budget (max 5 characters for the real maximum, `+9600`).
6. **Small and precisely isolated**: one new local + one new conditional row in
   `monsterCategory()`, one new import (`calcBattleExp`, already exported from `@goldbox/engine`),
   one extension to the existing `runExploreDok` e2e case (reusing M55's own IGORF-lookup loop to
   also capture FLAVIUS in the same pass) — no new UI panel, no new route, no engine-package change.

## Real-bytes / real-mechanic verification (this round)

Reproduced via `packages/engine/test/_scratch_m56_verify.test.ts` (created, run, **6/6 passed**,
then deleted; `git status --porcelain` confirmed clean before/after):

1. **Real DoK `MON1ITM.DAX` join populates 17 real monsters with `carriedItems`/`itemPluses`,
   16 of them with ≥1 positive plus** — decoded the real `Death Knights of Krynn/MON1CHA.DAX` +
   `MON1ITM.DAX`, ran `applyItemPluses`/`applyCarriedItems` (the exact functions `explore.ts`
   calls), printed every non-trivial record. Cross-checked SOLAMNIC KNIGHT's `[0,0,1]` against
   `m26-audit.md`'s own independently-verified figure — matches exactly.
2. **Real CoK `MON1ITM.DAX` join**: 26 monsters, 11 with carried items, **0** with a positive
   plus — the honest reason this fix's real-world effect is DoK-only *today*, despite the join
   code being fully shared between both games.
3. **`baseItem()` name-resolution coverage for `carriedItems`** (checked as the brief asked):
   only 7 of 17 real DoK item-carriers have ≥1 name-resolvable item via the already-imported
   `baseItem()` (e.g. "Arrow", "Leather Armor", "Vial") — confirms M29's own ≈14%-coverage caveat
   still holds, and is the concrete reason this round's fix targets `itemPluses` (no name lookup
   needed) rather than `carriedItems` (thin name coverage).
4. **Layout: real worst-case row count is 11 of 12**, computed over every one of the 17 real
   DoK-area1 item-carrying monsters (mandatory 9 + Level/Save/Regen/HalfDmg if present + Spells if
   present + this round's hypothetical Bonus-XP row) — FLAVIUS is the worst case (Spells + Bonus
   XP together), still 1 row under the cap.
5. **Source-text: `monsterCategory()` never references `itemPluses`** — sliced the function's
   exact body and confirmed the string doesn't appear, while confirming sibling rows
   (`preparedSpellIds`, `regenPerRound`, `halfDamage`) do — same method M55 used, applied to a new
   field.
6. **`combat.ts`/`party.ts` lump-sum confirmation**: read `combat.ts:721-724` and
   `party.ts:947-961` verbatim — `awardPartyXp` returns only `{ total, perMember }`; no code path
   anywhere in `apps/web/src` isolates or logs the loot-XP component of `total` separately. (Not a
   scratch-test assertion — a direct source read, cited above.)

Full engine suite re-run before and after: **1336 tests passed** both times (the scratch file
added 6 transiently, removed before finishing) — matches M55's own stated baseline exactly, no
regression. `git status --porcelain --untracked-files=all` confirmed clean (only this doc
untracked) after deleting the scratch file.

## Wiring plan

**One UI file touched (`referenceDb.ts`) plus one extension to the existing `runExploreDok` e2e
case — no new UI panel, no new route, no engine-package change (`calcBattleExp` already ships
from `@goldbox/engine`).**

1. **`apps/web/src/ui/referenceDb.ts`** — add `calcBattleExp` to the existing `@goldbox/engine`
   import list (alongside `DOK_SPELL_CROSSWALK`, added last round):

   ```ts
   // referenceDb.ts:13-34, before:
   import {
     ...
     DOK_SPELL_CROSSWALK, // M55.S1 — count a real DoK caster's crosswalked spells for the Spells row
     composeReferenceDb,
     ...
   } from '@goldbox/engine';

   // after:
   import {
     ...
     DOK_SPELL_CROSSWALK, // M55.S1 — count a real DoK caster's crosswalked spells for the Spells row
     calcBattleExp, // M56.S1 — isolate a carried-item-plus bonus-XP figure for the new Bonus XP row
     composeReferenceDb,
     ...
   } from '@goldbox/engine';
   ```

   Then, in `monsterCategory()` (`referenceDb.ts:91-138`), compute the bonus-XP figure next to the
   existing `castableSpellCount` local, and add one new conditional row after the `Spells` row:

   ```ts
   // referenceDb.ts:103-105, before:
     const castableSpellCount = m.preparedSpellIds
       ? new Set(m.preparedSpellIds.map((id) => DOK_SPELL_CROSSWALK[id]).filter(Boolean)).size
       : 0;

   // after:
     const castableSpellCount = m.preparedSpellIds
       ? new Set(m.preparedSpellIds.map((id) => DOK_SPELL_CROSSWALK[id]).filter(Boolean)).size
       : 0;
     // M56.S1 — a carried magic item's `plus` (MonsterRecord.itemPluses, joined via applyItemPluses
     // since M26.S1) already decides how much bonus XP the party earns for looting this monster
     // (calcBattleExp's Σ item.plus·400 term, combat.ts:721-724) — but that figure is swallowed into
     // a single lump `xpResult.total` even after the fight, and never shown at all beforehand.
     // Isolate just the loot term by calling the real ruleset function with zero enemies (only the
     // `itemPluses` loot side contributes). `undefined`/0 for the common case (no carried items, or
     // none enchanted), so the row is honestly omitted rather than shown as "+0".
     const lootBonusXp = m.itemPluses ? calcBattleExp([], { itemPluses: m.itemPluses }) : 0;
   ```

   ```ts
   // referenceDb.ts:132-134, before:
       ...(castableSpellCount > 0
         ? [{ label: 'Spells', value: `${castableSpellCount} spell${castableSpellCount === 1 ? '' : 's'}` }]
         : []),
     ]);

   // after:
       ...(castableSpellCount > 0
         ? [{ label: 'Spells', value: `${castableSpellCount} spell${castableSpellCount === 1 ? '' : 's'}` }]
         : []),
       ...(lootBonusXp > 0 ? [{ label: 'Bonus XP', value: `+${lootBonusXp}` }] : []),
     ]);
   ```

   No change to `companionPanel.ts` or `explore.ts` — both already thread the fully-joined
   `MonsterRecord[]` (including `itemPluses`) into `monsterCategory()` unmodified.

2. **Tests** (extend the existing `runExploreDok` e2e case only — no new test file). In
   `apps/web/test/e2e.mjs`, widen the existing M55 IGORF-lookup block
   (`e2e.mjs:1392-1411`) to also capture FLAVIUS's detail in the **same** walk (one pass, not a
   second loop), then assert its new row:

   ```js
   // before (e2e.mjs:1399-1407):
       const igorfDetail = await page.evaluate(() => {
         const n = window.__companion.refEntryCount();
         for (let i = 0; i < n; i++) {
           const sel = window.__companion.refSelected();
           if (sel?.name === 'IGORF') return sel.detail;
           window.__companion.refMove(1);
         }
         return null;
       });

   // after:
       // M56.S1 — same live in-play Companion -> Databases (Monsters) walk M55 added; also capture
       // FLAVIUS's detail rows in the same pass. FLAVIUS (MON1CHA) is the real worst-case row-count
       // monster (Spells=6 AND a real carried-item bonus-XP figure at once, per this round's own
       // real-bytes derivation) — a live positive control that the 12-row display cap really does
       // hold with both new rows present together.
       const { igorfDetail, flaviusDetail } = await page.evaluate(() => {
         const n = window.__companion.refEntryCount();
         let igorf = null, flavius = null;
         for (let i = 0; i < n && (!igorf || !flavius); i++) {
           const sel = window.__companion.refSelected();
           if (sel?.name === 'IGORF') igorf = sel.detail;
           if (sel?.name === 'FLAVIUS') flavius = sel.detail;
           window.__companion.refMove(1);
         }
         return { igorfDetail: igorf, flaviusDetail: flavius };
       });
   ```

   ```js
   // before (e2e.mjs:1409-1413):
       const igorfSpellsOk = companionOpened === true && Array.isArray(igorfDetail) &&
         igorfDetail.some((r) => r.label === 'Spells' && r.value === '4 spells');
       if (!igorfSpellsOk) errors.push(`igorf-spells: opened=${companionOpened} igorfDetail=${JSON.stringify(igorfDetail)}`);

       ok = cells === 256 && /Death Knights/i.test(mapName) && hasView && inBounds && ranMoves && undeadOk && itemsOk && graphicsOk && introOk && igorfSpellsOk;

   // after:
       const igorfSpellsOk = companionOpened === true && Array.isArray(igorfDetail) &&
         igorfDetail.some((r) => r.label === 'Spells' && r.value === '4 spells');
       if (!igorfSpellsOk) errors.push(`igorf-spells: opened=${companionOpened} igorfDetail=${JSON.stringify(igorfDetail)}`);
       const flaviusLootOk = Array.isArray(flaviusDetail) &&
         flaviusDetail.some((r) => r.label === 'Spells' && r.value === '6 spells') &&
         flaviusDetail.some((r) => r.label === 'Bonus XP' && r.value === '+9600') &&
         flaviusDetail.length <= 11;
       if (!flaviusLootOk) errors.push(`flavius-loot: flaviusDetail=${JSON.stringify(flaviusDetail)}`);

       ok = cells === 256 && /Death Knights/i.test(mapName) && hasView && inBounds && ranMoves && undeadOk && itemsOk && graphicsOk && introOk && igorfSpellsOk && flaviusLootOk;
   ```

   (Also widen the diagnostic `errors.push` on the final `if (!ok)` line with
   `flaviusLootOk=${flaviusLootOk}`, matching the file's existing convention.)

Rough size: 1 new import + 1 new local + 1 new conditional row in `referenceDb.ts` (~9 LOC incl.
comments); ~12 LOC changed/added in the existing `runExploreDok` e2e case in `e2e.mjs`, 1
conjunction edit. No engine-package file touched — engine test count should remain 1336. No new
UI panel, no new route, no new test file.

## Layout / feasibility check

`composeReferenceDb` caps the visible detail sheet at `REFERENCE_DB_DETAIL_ROWS = 12`
(`packages/engine/src/render/referenceDb.ts:72,118`) and silently truncates any `v.detail` past
that count. This round explicitly computed, over every real DoK-area1 item-carrying monster, the
worst-case row total if this new row ships alongside every already-shipped optional row: **11**
(FLAVIUS: 9 mandatory + Spells + Bonus XP), one row under the cap. No real monster in the current
live dataset can overflow because of this addition.

The compositor also draws each detail *value* truncated to 8 characters
(`d.value.toUpperCase().slice(0, 8)`) — the chosen `+${lootBonusXp}` format tops out at 5
characters for the real maximum (`+9600`), well inside budget (M55's own "6 spells" needed all 8).
The underlying `RefDbDetailRow.value` the e2e seam reads via `window.__companion.refSelected()`
is the full untruncated string regardless (same established fact M55's own layout check relied
on).

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **`MonsterRecord.carriedItems` + `baseItem()` name lookup** (the literal path candidate #1 suggested) | Investigated in full: `baseItem()` *can* resolve some ids (7 of 17 real DoK item-carriers have ≥1 named item — "Arrow", "Leather Armor", "Vial"), confirming the brief's premise that the lookup is cheap — but real coverage is thin (≈41% of item-carriers, ≈14% of individual records, matching M29's own caveat), and a multi-item monster's honest name list doesn't compress into one terse `{label, value}` row as cleanly as a single aggregate number does. Left as a smaller, weaker follow-up (see Open questions) — `itemPluses` turned out to be the stronger half of the same family, not needing this lookup at all. |
| **A combined "Carries: `<name>` +N" row using both fields together** | Considered (the two arrays are index-aligned, same `MON{n}ITM.DAX` join) — rejected as unnecessarily complex for this round's "keep it small" mandate; would need per-item formatting decisions (multi-item monsters, unresolved names) this round's simpler aggregate-XP row avoids entirely. Left as a possible richer follow-up. |
| **A raw "Loot: N item(s)" count row from `carriedItems.length`, ignoring plus/value** | Rejected in favour of the plus-based Bonus-XP row: a bare item count has no real mechanical meaning on its own (unlike Spells' count, which is directly "how many distinct spells this monster can cast"), whereas the bonus-XP figure is the *exact* number `calcBattleExp` computes and awards — a stronger, non-arbitrary summary value. |
| **Surfacing the loot-XP breakdown in the post-combat victory log instead of (or in addition to) the bestiary** (`combat.ts:721-724`) | Real and also currently absent (`awardPartyXp` returns only a lump `total`) — but `combat.ts` beyond its M48-M50-swept targeting-banner functions wasn't otherwise re-opened this round; flagged as a real, independent, NOT-yet-picked candidate for a future round (see Open questions), kept separate to preserve this round's single-file, single-row scope. |
| **Re-running the systematic dead-container (`33180d2`-sibling) sweep** | Not re-run — M55 already confirmed it exhausted (no new large DOM-to-canvas migration commit has landed since), and this round's brief didn't ask for it again. |
| **`MonsterRecord.conSaveBonus`** | Re-confirmed still real but still a rare, dry mechanic with no natural terse wording beyond what M38's Save row already covers (unchanged from M54/M55's own reasoning) — not picked. |
| **`referenceDb.ts`'s Class-label collision** (unpicked M38-M55, now M56, 20 rounds) | Not re-investigated — no new angle this round. |
| **`importDokParty.ts`'s `mem`** (standing since M32/M52) | Not re-picked — unchanged from M55's own reasoning (weaker: already reaches a player-visible panel one screen further on). |
| **`wilderness.ts`'s `moonPhasesForDay`** | Not re-picked — M55 already flagged it needs a primary-source check before being treated as a real gap, not just a re-confirmation; no such check was performed this round (out of scope for this round's chosen candidate). |
| **`saveStore.ts`'s `listSlots()`/`SaveSummary`**, **`DetectionMatch.series`/`.ruleset`/`.engineGen`** | Both standing/gated per M55's own re-check; not re-investigated this round (no new angle). |

## Open questions / unknowns

- **Should `carriedItems` still get its own row (item names), as a follow-up**? Real, reaches the
  same function, `baseItem()` resolves ≈41% of real item-carriers — thin but nonzero coverage.
  Would need a decision on how to render an honest name list for monsters carrying 2+ items (this
  round's aggregate-XP row sidesteps that question entirely by not needing item identity at all).
  Flagged as the natural next pick from this exact family, same as M55 left it.
- **Should the post-combat victory log (`combat.ts:721-724`) also break out the loot-XP
  component of `xpResult.total`, separately from this bestiary preview?** Real and independently
  absent (`awardPartyXp` returns only a lump total) — not picked this round to keep the change
  small and single-file, but a genuinely open, different-shaped candidate for a future round
  (touches `combat.ts`'s post-combat flow, not `referenceDb.ts`).
- **Why does real CoK area-1 data have zero monsters with a positive item plus, despite the join
  code being fully shared with DoK (`explore.ts:1546,1582-1583` runs `applyItemPluses` for both
  games)?** UNKNOWN whether this is a genuine property of CoK's own `MON1ITM.DAX` (its magic-item
  carriers might be scarcer, or concentrated in areas 2/3, which aren't currently loaded by the
  live in-play Companion panel at all — `gameData.ts`'s `itmPath` is a literal area-1-only path for
  both games) or an artifact of which area is wired up today. Not blocking (the row is honestly
  absent when the data doesn't support it), but worth a future round's attention if CoK-side
  parity with this feature ever matters.
- **Is `+${n}` (no "XP" suffix, relying on the "Bonus XP" label to carry the unit) the right
  wording, or should the value repeat the unit (`+9600 XP`, still within the 8-char budget)?**
  Chose the shorter form to leave headroom under the value-string budget for a wider real-data
  range than currently observed; not a blocking question, since `RefDbDetailRow.value` is a plain
  string either way and the lead may prefer either wording.

## Implications for our engine

- **A standing rejection's stated REASON, not just its headline verdict, is worth re-checking one
  level deeper than the previous round did.** M55 already established this principle for M54's
  rejection; this round applied it a second time to M55's own rejection of the same field family,
  and found the reason ("no item identity") was true but irrelevant once the actual downstream
  consumer (`calcBattleExp`) was inspected directly rather than assumed to need per-item detail.
  Worth treating "re-examine the ACTUAL reasoning, not the verdict" as a repeatable audit step, not
  a one-off insight.
- **`monsterCategory()` is now proven for a SIXTH time** (Class M37, Save M38, Regen/Half Dmg M43,
  Spells M55, Bonus XP M56) as the cheap display slot for any side-table-joined `MonsterRecord`
  fact with a real consumer. The row-cap headroom (11 of 12, worst real case) is getting closer to
  its ceiling — a future 7th addition should re-run this round's exact row-count-over-real-bytes
  check before assuming there's still room, rather than assuming the cap is infinitely elastic.
- **A fact can be "hidden" in more than one place at once, and the MOST hidden version is the
  strongest pick.** `itemPluses`' bonus-XP contribution isn't just missing from the bestiary (this
  round's fix) — it's missing from the post-combat log too (a lump sum swallows it). Future rounds
  should check whether a candidate fact is truly invisible everywhere, or merely under-detailed in
  one place while already visible in cruder form elsewhere (the same distinction that made this
  round prefer `itemPluses` over `carriedItems`, whose identity IS already visible, just post-hoc,
  via the treasure screen).
- **The monster-carried-item family (`itemPluses`/`carriedItems`, M26/M29) is now half-surfaced**:
  the aggregate bonus-XP fact reaches the bestiary (this round); the individual item identities
  still only reach the post-combat treasure screen, never a pre-combat preview. This is a
  deliberate, bounded gap for a future round, not an oversight of this one.
