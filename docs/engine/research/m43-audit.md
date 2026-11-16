# M43 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done section for M35–M42 in full, and
> `docs/engine/research/m42-audit.md` in full (its Rejected-alternatives / Open-questions /
> Implications sections in particular). Swept every `render/*.ts` compositor not yet checked at the
> field-by-field level this series (`spellbook.ts`, `treasure.ts`, `townScreen.ts` + its `town.ts`
> host, `wildernessScreen.ts` + its `wilderness.ts` host, `charSheet.ts` + its `apps/web` host beyond
> M40's `robe`, `eclInspector.ts`), re-checked `referenceDb.ts`'s three category builders beyond the
> already-flagged `Class`-label collision, and investigated the standing `dialogue.ts`/`town.ts`
> `recordJournal()` day-wiring candidate's feasibility (found it genuinely needs a new clock source in
> two clockless standalone routes — confirmed the "different shape, scope carefully" warning is
> accurate, deferred again). Every real-mechanic claim below was independently re-derived this round
> via a throwaway `vitest` script (`packages/engine/test/_scratch_m43_regenhalf.test.ts`, created, run,
> 3/3 green, then deleted — listed at the end). `git status --porcelain` is clean except this doc.
>
> **Headline pick: the Reference DB / Companion Panel Databases tab's monster detail sheet never shows
> either of a monster's two `MON{n}SPC.DAX` innate combat specials** — troll/undead-style regeneration
> (`MonsterRecord.regenPerRound`) or vampire-style half-damage resistance (`MonsterRecord.halfDamage`)
> — even though both are decoded, joined onto the exact same live session records the Databases tab
> already renders, and already decide real tactical-combat outcomes every round of every battle
> (`tactical.ts`'s `tickRegen()`/`combat.ts`'s round loop for regen; `tactical.ts`'s melee resolver /
> `combat.ts`'s round loop for half-damage) since **M23.S2** and **M24.S1** respectively — build phases
> that shipped well before this M-series even started. `apps/web/src/ui/referenceDb.ts`'s
> `monsterCategory()` — the **exact same chokepoint function M37 (`npcClass`/`npcLevel`) and M38
> (`.spell`) already extended twice** for this identical reason — still never reads either field. Real,
> named, byte-verified monsters are affected today: CoK's **SKELETON** (block 26) and **ZOMBIE** (block
> 31) regenerate 3 HP/round; DoK's **LICH** (block 14) regenerates 3 HP/round; DoK's **VAMPIRE /
> VAMPIRE MAGE / VAMPIRE CLERIC** family (blocks 19–21) takes half damage from every hit. None of this
> shows on the one screen built to display a monster's stat sheet.

## Headline finding

`MonsterRecord` declares both fields with doc comments that already state their live combat role:

```ts
// packages/engine/src/loaders/monster.ts:236-243
/**
 * M23.S2 — innate "heal N HP at the start of every combat round, capped at {@link hitPoints}" special
 * (COAB `Affects.regen_3_hp` / `AffectRegen3Hp`, ticked once per round by `BattleRoundChecks`'s
 * `CheckType.Type_19` sweep). **Not decoded from `MON{n}CHA.DAX`** — this record format has no such
 * byte — it is populated by {@link applyRegenAffect} after joining the monster's `MON{n}SPC.DAX`
 * side-table (`loaders/monsterSideTables.ts`). Undefined for the common case (no regen special).
 */
regenPerRound?: number;
// packages/engine/src/loaders/monster.ts:244-251
/**
 * M24.S1 — innate "halve all incoming weapon damage" special (COAB `Affects.half_damage`,
 * `ovr013.half_damage`, swept every hit by `BattleRoundChecks`'s `CheckType.Type_5` list).
 * **Not decoded from `MON{n}CHA.DAX`** — populated by {@link applyHalfDamageAffect} after joining the
 * monster's `MON{n}SPC.DAX` side-table (`loaders/monsterSideTables.ts`). Undefined for the common
 * case (no half-damage special).
 */
halfDamage?: boolean;
```

Both fields are populated for real by the SAME join call the live game session runs at dungeon load,
right alongside the exact combat affects M27/M28/M31 also join (`conSaveBonus`, `itemPluses`,
`carriedItems`, `preparedSpellIds`):

```ts
// apps/web/src/ui/explore.ts:1572-1576
// M23.S2/M24.S1/M28.S1 — join MON{n}SPC.DAX innate affects (regen_3_hp, half_damage,
// con_saving_bonus) onto the records so spawnEnemies -> monsterCombatant carries them into real combat.
const spcAffects = decodeMonsterSpcArchive(spcBytes);
monRecords = applyHalfDamageAffect(applyRegenAffect(monRecords, spcAffects), spcAffects);
monRecords = applyConSavingBonus(monRecords, spcAffects);
```

Both are genuinely load-bearing in tactical combat, checked independently in two separate combat
engines (`combat/tactical.ts`, the CT.x grid engine, and `combat/combat.ts`, the simpler round-robin
resolver the demo/wilderness paths use):

```ts
// packages/engine/src/combat/tactical.ts:807-818 (tickRegen, ticked every round before initiative)
function tickRegen(): void {
  for (const c of combatants) {
    if (!isActive(c) || !c.regenPerRound || c.hp >= c.maxHp) continue;
    c.hp = Math.min(c.maxHp, c.hp + c.regenPerRound);
    log.push({ round, type: 'regen', target: c.id, healed: c.regenPerRound, targetHpAfter: c.hp });
  }
}
// packages/engine/src/combat/tactical.ts:1161-1163 (melee resolver, after backstab multiply)
// M24.S1 — COAB `half_damage` (Type_5 sweep): applied after backstab multiply, before HP loss —
if (target.halfDamage) dmg = Math.floor(dmg / 2);
```

```ts
// packages/engine/src/combat/combat.ts:218-222 (round loop, regen)
for (const c of combatants) {
  if (c.hp > 0 && c.regenPerRound) c.hp = Math.min(c.maxHp, c.hp + c.regenPerRound);
}
// packages/engine/src/combat/combat.ts:256-258 (round loop, half damage)
if (target.halfDamage) dmg = Math.floor(dmg / 2);
```

These same joined `monRecords` — the ones with `regenPerRound`/`halfDamage` already set for real — are
exactly what the Companion Panel's Databases tab renders, via the same `monsterCategory()` M37/M38
already extended twice for an identical reason:

```ts
// apps/web/src/ui/explore.ts:1125-1141 (openCompanion — doc comment: "no separate re-fetch")
function openCompanion(tab?: CompanionTab): void {
  ...
  openCompanionPanel({
    source: { ..., monsters: state.monRecords, items: state.itemDb },
    ...
  });
}
// apps/web/src/ui/companionPanel.ts:366-370
const refCats = [
  monsterCategory(opts.source.monsters),
  itemCategory(opts.source.items),
  spellCategory(),
];
```

But `monsterCategory()` itself, unchanged in this respect since before M37, never reads either field:

```ts
// apps/web/src/ui/referenceDb.ts:89-117 (monsterCategory, current state)
export function monsterCategory(monsters: MonsterRecord[]): RefCategory {
  ...
  for (const m of monsters) {
    ...
    details.push([
      { label: 'AC', value: `${m.armorClass}` },
      { label: 'HD', value: `${m.hitDice}` },
      { label: 'THAC0', value: `${m.thac0}` },
      { label: 'HP', value: `${m.hitPoints}` },
      { label: 'Damage', value: dmgText(m.damage) },
      { label: 'XP', value: `${m.xp}` },
      { label: 'Morale', value: m.morale === undefined ? '—' : `${m.morale}` },
      { label: 'Size', value: m.combatSize && m.combatSize > 1 ? 'Large' : 'Small' },
      { label: 'Class', value: classValue },
      ...(m.npcLevel !== undefined ? [{ label: 'Level', value: `${m.npcLevel}` }] : []),
      ...(m.savingThrows ? [{ label: 'Save', value: `${m.savingThrows.spell}` }] : []),
      // — nothing reads m.regenPerRound or m.halfDamage anywhere in this function —
    ]);
  }
  return { key: 'monsters', label: 'Monsters', entries, details };
}
```

`referenceDb.ts`'s own standalone `?refdb=1` route (`loadCategories()`) doesn't join the side tables at
all (it only calls `decodeMonsterArchive`), so those fields are always `undefined` there — but the
**live, in-play Companion Panel** (`companionPanel.ts`, opened from a real running session via
`openCompanion()`) feeds `monsterCategory()` the fully-joined `state.monRecords`, so a player fighting a
CoK SKELETON or a DoK VAMPIRE today already has the fact computed, in scope, one field-read away, and
simply never shown.

## Why this fits the loop's established shape

This is the exact M37/M38 shape reproduced a third time, at the same chokepoint:

1. M37 extended `monsterCategory()` to add `Class`/`Level` from `npcClass`/`npcLevel` (DQK-only).
2. M38 extended the same function to add `Save` from `savingThrows.spell` (all games, one column of
   five, chosen because it's the one column with a live mechanical consumer).
3. This round finds the same function still not reading two more already-decoded, already-joined,
   already-mechanically-live fields — `regenPerRound` and `halfDamage` — that arrived via the **same**
   M23.S2/M24.S1 build phases the standing "Rejected alternatives" notes for M31-M38 kept citing as
   *other* fields on `MonsterRecord` with real combat consumers, but which no round had actually traced
   all the way to this specific display gap until now.

Three independent pieces of corroborating evidence, matching M42's own bar for "strongest-corroborated
pick":

- Both fields' doc comments on `MonsterRecord` (`monster.ts:236-251`) already describe a fully-shipped
  mechanic, not an aspiration — unlike M42's "down grayed" comment describing something unbuilt, these
  two comments describe something *built and running in combat today*, just never surfaced to a player
  reading the bestiary.
- The exact same join call (`applyHalfDamageAffect(applyRegenAffect(...))`, `explore.ts:1575`) that
  produces these fields also produces `conSaveBonus` (M28), which M38's own audit already confirmed
  feeds a live mechanic and deliberately chose NOT to show (to avoid misrepresenting a roll-modifier as
  a threshold) — so this round's pick is the "easy" half of that same side-table join, the two fields
  that display as a single self-contained fact each (a flat heal-per-round number, a plain yes/no
  resistance) rather than a value that needs mechanical context to not mislead.
- `monsterCategory()` is demonstrably the codebase's own established "add one more conditional row here"
  extension point for this exact class of finding — already extended twice for this identical reason
  (M37, M38), so a third extension is squarely inside a proven, safe pattern, not a new one.

## Real-bytes / real-mechanic verification (reproduced fresh this round)

Real DAX bytes, reproduced independently this round via
`packages/engine/test/_scratch_m43_regenhalf.test.ts` (created, run, 3/3 passed, then deleted):

### Probe 1 — CoK `MON1CHA.DAX` + `MON1SPC.DAX`: which real monsters get `regenPerRound`

```
CoK regenPerRound monsters: [ '26:SKELETON', '31:ZOMBIE' ]
CoK halfDamage monsters: []
```

Confirms the `monsterSideTables.test.ts` golden's own existing real-bytes assertion
(`packages/engine/test/monsterSideTables.test.ts:151-162`) from a fresh, independently-written probe —
and confirms CoK genuinely has **zero** `halfDamage` monsters (the `HALF_DAMAGE_AFFECT` doc comment at
`monsterSideTables.ts:249-251` already says this affect is "found only in `Death Knights of
Krynn/MON1SPC.DAX`" — verified true again here, not just trusted).

### Probe 2 — DoK `MON1CHA.DAX` + `MON1SPC.DAX`: LICH regenerates, the VAMPIRE family resists half damage

```
DoK regenPerRound monsters: [ '14:LICH' ]
DoK halfDamage monsters: [ '19:VAMPIRE', '20:VAMPIRE MAGE', '21:VAMPIRE CLERIC' ]
```

Matches `monsterSideTables.test.ts:184-200`'s existing golden (VAMPIRE/VAMPIRE MAGE/VAMPIRE
CLERIC/GHOUL names cross-checked). Also confirms DoK's `VAMPIRE` record has `savingThrows === undefined`
(the known "gap B5" compact-record limitation) — so adding a `Half Dmg` row here never collides with a
`Save` row for this monster; the row-budget check in Probe 3 covers the general case regardless.

### Probe 3 — row-budget headroom: adding both conditional rows never exceeds `REFERENCE_DB_DETAIL_ROWS`

Reproduced `monsterCategory()`'s exact row-count formula (9 fixed rows + up to 4 conditional: `Level`,
`Save`, a hypothetical `Regen`, a hypothetical `Half Dmg`) against every real joined record in both
CoK's and DoK's full bestiary archives (`REFERENCE_DB_DETAIL_ROWS = 12`,
`referenceDb.ts:72`/`companionPanel.ts`'s reuse of the same compositor). Every record — including
SKELETON, ZOMBIE, LICH, and the VAMPIRE family — passed `rowCount <= 12`. No real monster in either
game's bestiary combines enough optional facts to overflow the detail pane.

### Probe 4 — confirms `monsterCategory()`'s source text never references either field today

```ts
const body = src.slice(src.indexOf('export function monsterCategory'), src.indexOf('export function itemCategory'));
expect(body.includes('regenPerRound')).toBe(false);
expect(body.includes('halfDamage')).toBe(false);
```

Both assertions passed — a direct proof (not inference) that the function's current body contains
neither identifier, matching the earlier code-reading.

## Wiring plan

**One file, one function, two added conditional rows** — smaller than every prior round in this series
(M37-M42 each needed at least one engine `render/*.ts` type change; this fix needs none, because
`MonsterRecord.regenPerRound`/`.halfDamage` are already typed and already flow through
`monsterCategory(monsters: MonsterRecord[])`'s existing parameter):

1. **`apps/web/src/ui/referenceDb.ts`**'s `monsterCategory()` (currently lines 89-117) — append two
   conditional rows after the existing `Save` row (line 113), following the exact same
   omit-rather-than-fabricate convention M37/M38 already established for `Level`/`Save`:
   ```ts
   ...(m.savingThrows ? [{ label: 'Save', value: `${m.savingThrows.spell}` }] : []),
   // M43.S1 — MON{n}SPC.DAX innate specials (M23.S2 regen_3_hp / M24.S1 half_damage): already
   // decoded, joined by explore.ts's dungeon-load pipeline, and deciding real combat outcomes
   // (tactical.ts's tickRegen()/melee resolver; combat.ts's round loop) since before this
   // M-series began — but never shown here. Undefined/false for the common case (most monsters
   // have neither), so both rows are honestly omitted rather than shown as "No"/"0".
   ...(m.regenPerRound !== undefined ? [{ label: 'Regen', value: `${m.regenPerRound}/rd` }] : []),
   ...(m.halfDamage ? [{ label: 'Half Dmg', value: 'Yes' }] : []),
   ```
   No new import needed — `MonsterRecord` (already imported) already declares both fields
   (`packages/engine/src/loaders/monster.ts:243`/`:251`). No engine-package change at all: the
   compositor (`packages/engine/src/render/referenceDb.ts`) already renders any `{label, value}` row
   generically (verified in Probe 3/4 and by direct reading — see `composeReferenceDb`'s detail-row
   loop, `referenceDb.ts:118-124`, which has no per-label special-casing).

2. **Tests** (extend the existing e2e case only — no new test file, no engine-package test change
   needed since the field itself is already golden-tested at the decoder level in
   `monsterSideTables.test.ts`):
   - `apps/web/test/e2e.mjs`'s existing `runExplore` case (id `'explore'`, CoK, lines 318-791) already
     walks the live Companion Panel's Databases tab and captures `goblinDetail` for the M38 `Save`
     assertion (lines 699-716). Extend the same single walk to also capture `skeletonDetail` when
     `sel?.name === 'SKELETON'`, and assert `skeletonDetail.some(r => r.label === 'Regen' && r.value ===
     '3/rd')` — reusing the exact mechanism, zero new page navigation, zero new party/session setup:
     ```js
     const { names: refNames, goblinDetail, skeletonDetail } = await page.evaluate(() => {
       const names = [];
       let goblinDetail = null;
       let skeletonDetail = null;
       const n = window.__companion.refEntryCount();
       for (let i = 0; i < n; i++) {
         const sel = window.__companion.refSelected();
         names.push(sel?.name);
         if (sel?.name === 'GOBLIN') goblinDetail = sel.detail;
         if (sel?.name === 'SKELETON') skeletonDetail = sel.detail;
         window.__companion.refMove(1);
       }
       return { names, goblinDetail, skeletonDetail };
     });
     ...
     const skeletonRegenOk = Array.isArray(skeletonDetail) && skeletonDetail.some((r) => r.label === 'Regen' && r.value === '3/rd');
     if (!skeletonRegenOk) errors.push(`skeleton-regen: skeletonDetail=${JSON.stringify(skeletonDetail)}`);
     const refTabOk = refTab === 'refdb' && refMatchesBestiary && goblinSaveOk && skeletonRegenOk;
     ```
   - **Open question, not required for this fix**: DoK's `explore-dok` case (`e2e.mjs:1236-1334`) never
     opens the Companion Panel at all today (unlike CoK's `explore` case), so it has no analogous walk
     to extend for a `VAMPIRE`/`Half Dmg` positive assertion. Adding one would need the panel opened
     there first (`window.__explore.openCompanion()` — the same seam CoK's case already uses) — a
     reasonable small follow-up, but outside this round's minimal-diff scope. The CoK `SKELETON`
     assertion above is a legitimate standalone proof on its own (mirrors this loop's acceptance of
     single-game coverage elsewhere, e.g. M38's DQK-only `npcLevel`).

Rough size: ~4 LOC added to one `apps/web` file (2 conditional rows + a doc comment), ~6 LOC extending
one existing e2e case. No engine-package file touched, no new test file, no new e2e case, no new route,
no new UI panel.

## Layout / feasibility check

No layout risk, and smaller than any prior round's: `composeReferenceDb`'s detail-row loop
(`packages/engine/src/render/referenceDb.ts:118-124`) already draws up to `REFERENCE_DB_DETAIL_ROWS`
(12) generic `{label, value}` rows at fixed coordinates regardless of what produced them — it has no
per-row special-casing to update. Probe 3 confirmed no real monster record, in either game, pushes the
row count past 12 once both new conditional rows are added. Both new rows sit within the existing
label/value column-width caps (`label.slice(0,9)`, `value.slice(0,8)` at `referenceDb.ts:122-123`):
`"Regen"` (5 chars) / `"3/rd"` (4 chars) and `"Half Dmg"` (8 chars) / `"Yes"` (3 chars) both fit
comfortably.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **`referenceDb.ts`'s `Class`-label collision** (flagged M37, unpicked M38-M42 — 6 rounds running) | Re-confirmed still live and unpicked — this would be the 6th consecutive round it's passed over. Still real, still cheap, but this round's `regenPerRound`/`halfDamage` finding has stronger corroboration (three named real monsters across two games, two independent combat-engine consumers each, and a doc comment describing an already-built mechanic rather than an aspiration) and, like M42's reasoning, more real player-facing value (a bestiary entry that's silently missing a defining combat trait, vs. a cosmetic label collision a player would need to tab between categories to even notice). Deferred again. |
| **`dialogue.ts`/`town.ts`'s `recordJournal()` day-wiring gap** (flagged M41, deferred M42) | Investigated further this round (traced `apps/web/src/ui/dialogue.ts` and `town.ts` in full, plus `world/gameClock.ts` and every real caller of `gameDayFromMinutes`). Confirmed the M41/M42 scoping warning is accurate and, if anything, understated: `dialogue.ts` and `town.ts` are standalone demo routes (`?dialogue=1`, `?town=1`) with **no clock state at all** — unlike `explore.ts` (which already derives `gameDay()` from `state.clockMinutes`, `explore.ts:327-330`) and `wilderness.ts` (`state.clockMinutes`, threaded into `launchCombat`'s `day` param, `wilderness.ts:184`/`:320`-`321`, already fully wired since M22.S2), these two screens would need a *new* clock source introduced (there is no shared persisted clock in `party.ts` to read from either) before a real `day` value could be passed to `recordJournal()`. This is genuinely a different shape than a conditional row/field — real caller-plumbing across two clockless screens — so it remains a reasonable *future*-round candidate, not this round's pick. |
| **`MonsterRecord.conSaveBonus`** (M28.S1, joined by the exact same `explore.ts:1575-1576` call this round's fields ride along with) | Investigated as a natural third row alongside `regenPerRound`/`halfDamage` from the same side-table join. Rejected for this round on the same discipline M38 already established for the other 4 saving-throw columns: `conSaveBonus` modifies the monster's own *roll* (`t.conSaveBonus ?? 0` added before comparing to the save target, `tactical.ts:1315-1318`), not a simple independent fact — showing it as a bare row next to (or without) the `Save` target risks a player misreading it as changing the printed save number itself, rather than a hidden roll bonus. `regenPerRound`/`halfDamage` are each a complete, self-contained fact (a flat heal amount; a plain yes/no resistance) with no such ambiguity, which is why they were picked and this one wasn't. Left as a documented future candidate, not fixed this round. |
| **`MonsterRecord.itemPluses`/`.carriedItems`** (M26.S1/M29.S1, same side-table family, joined via `MON{n}ITM.DAX`) | Investigated. Rejected for scope: both are arrays (a defeated monster's loot table), not a single flat value — displaying them meaningfully needs resolving each `baseTypeId` through the item catalogue (`baseItem()`) into names, materially larger than the 2-line fix this round delivers. `itemPluses`/`carriedItems` already feed real mechanics (`calcBattleExp`'s XP bonus, `rollTreasure`'s post-combat loot) independent of any display — a real future candidate for a "Carries" row, not attempted here. |
| **`MonsterRecord.preparedSpellIds`** (M31.S1, DoK-only, joined via `MON{n}WIZ.DAX`) | Investigated. Rejected for scope, same shape as `carriedItems`: an array of raw DoK global spell ids needing a name crosswalk (`ruleset/addnd1e-dragonlance/dokSpellCrosswalk.ts`) before a row could show anything a player could read, not a single flat fact. Real, tested, DoK-only, feeds actual monster spellcasting in combat — a good future candidate, left undone here. |
| **`spellbook.ts`** (both layers, `apps/web/src/ui/magic.ts` host) | Read in full. Every `SpellbookRow`/`SpellbookView` field (`text`, `header`, `selected`, `count`, `title`, `subtitle`) is read by `composeSpellbook`'s body and populated by `magic.ts`. No gap found. |
| **`treasure.ts`** (both layers, `apps/web/src/ui/combat.ts`'s post-combat host) | Read in full. Every `TreasureRowView`/`TreasureView` field (`label`, `taken`, `gold`, `goldTaken`, `cursor`, `status`) is read and populated. No gap found. |
| **`townScreen.ts` + `town.ts`** | Read both in full (also the context for the day-wiring investigation above). Every `TownLine`/`TownView` field, including the `color` override (`TOWN_LINE_DISABLED`), is read by `composeTownScreen` and populated by `town.ts`'s `buildView()` across every mode (shop/temple/training/tavern). No gap found. |
| **`wildernessScreen.ts` + `wilderness.ts`** | Read both in full. Every `WildTileView`/`WildernessView` field (`terrain`, `party`, `site`, `areaName`, `width`/`height`, `tiles`, `party` position, `locationLabel`, `time`, `status`) is read and populated; confirmed `wilderness.ts` already threads a real `day` into `launchCombat` (`wilderness.ts:184`) — the working precedent the day-wiring candidate above still lacks in `dialogue.ts`/`town.ts`. No new gap found. |
| **`charSheet.ts` (engine) + its `apps/web` host beyond M40's `robe`** | Read both in full, cross-referenced against the full `CharacterSheet` interface (`ruleset/addnd1e-dragonlance/character.ts:54-75`). Every field (`name`, `race`, `sex`, `classes`, `abilities`, `deity`, `robe`, `thac0`, `ac`, `savingThrows`, `hp`/`maxHp`, `knightOrder`) is read by `toView()` and displayed (deity/order/robe share one footer ternary, already fully wired since M40). No new gap. |
| **`inventory.ts` (engine render + `apps/web` host)** | Re-skimmed (deeper than M42's pass, not a full re-derivation). No new unread field found on `InventoryView`/`InventorySlotView`. |
| **`eclInspector.ts`** | Read in full. A dev-facing VM debugger view; every field (`vaddr`, `text`, `current`, `uncertain`, `step`, `status`, `flags`, `callDepth`, `watches`, `effect`) is read by the compositor. No gap — not a player-facing panel this loop targets anyway. |
| **Item-instance subsystem** (`DokItemRecord.value`/`.magicBonus`/`.charges`/`.cursed`) | **Not re-investigated**, per standing instructions — blocked 14 consecutive rounds. |
| **`PartyMemberStatus.age`** | **Not re-investigated** — already rejected twice (M40, M41) on value-degeneracy grounds. |
| **`MapCell.ceiling`/`.flags`** | **Not re-investigated** — confirmed dead in M42, no new angle sought. |
| **`mainMenu.ts`** | **Not re-investigated** — confirmed clean (the "good example") in M42. |

## Open questions / unknowns

- **Should DoK's `explore-dok` e2e case also open the Companion Panel and assert a `VAMPIRE`/`Half Dmg`
  positive control?** Not done this round (see Wiring plan §2's open question) — it would need a new
  `openCompanion()` call added to that case, a slightly bigger diff than extending the CoK case's
  already-open panel. The CoK `SKELETON`/`Regen` assertion is a legitimate standalone proof either way.
- **Should `conSaveBonus` eventually get a row too, once there's a clear way to label it as a roll
  modifier rather than a fact (e.g. `"Save +2 (roll)"` instead of a bare number)?** Left as a documented
  future candidate (see Rejected alternatives) rather than solved here — showing it wrong would be worse
  than not showing it, matching M38's own discipline for the other saving-throw columns.
- **Should `itemPluses`/`carriedItems`/`preparedSpellIds` eventually get a "Carries" / "Casts" row once
  a name/spell crosswalk is available?** Same answer — real, tested, mechanically live, but each needs
  meaningfully more display logic than a single conditional row, so left for a future round scoped
  specifically for that (larger) job.
- **The `dialogue.ts`/`town.ts` day-wiring gap (M41) is now confirmed to need net-new clock plumbing**,
  not just a threading fix — worth flagging explicitly for whichever future round finally picks it up,
  so that round scopes for "add a clock" rather than "pass an existing one."

## Implications for our engine

- **A single side-table join (`applyRegenAffect`/`applyHalfDamageAffect`/`applyConSavingBonus`/
  `applyItemPluses`/`applyCarriedItems`) can produce several sibling fields where only some are cheap,
  unambiguous, one-row wins and others need real display-design work (roll modifiers, arrays needing a
  name crosswalk).** Worth explicitly triaging "is this one flat, self-explanatory fact, or does showing
  it right require more than a label+value pair?" before picking a field from a join like this — this
  round's `regenPerRound`/`halfDamage` picked cleanly past that test; `conSaveBonus`/`itemPluses`/
  `carriedItems`/`preparedSpellIds` didn't, this round.
- **The same display chokepoint function can legitimately be the loop's pick three rounds running**
  (M37, M38, now M43, all extending `monsterCategory()`) — a function that flattens a rich decoded
  record into a small fixed detail sheet is a natural, recurring source of "decoded but dropped" fields,
  worth treating as a standing checklist (every `MonsterRecord` optional field, cross-referenced against
  this one function) rather than assuming a prior round's pass exhausted it.
- **Not every candidate needs a byte-decode of its own this round** — like M40's `robe`, M41's `.day`,
  and M42's `conditionOf`, this round's finding is a re-derivation of already-shipped, already-tested
  engine/COAB-mechanics work (M23.S2/M24.S1), not a fresh `.DAX`/`.GLB` decode. The loop's bar remains
  "real, tested, and silently dropped by a projection function that already had it," not "must trace to
  new original game bytes."
- **A fix that needs zero engine-package changes is possible and, when available, is strictly
  preferable** — this round's entire diff lives in one `apps/web` UI-layer function, because the engine
  compositor (`composeReferenceDb`) and the engine data model (`MonsterRecord`) already fully supported
  the fix; only the UI-layer flattening function needed to catch up. Worth checking "does the engine
  already support this, and only the UI projection is behind?" before assuming a fix needs a render-layer
  type change (as M42's did).

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `packages/engine/test/_scratch_m43_regenhalf.test.ts` (3 tests: real CoK `MON1CHA`/`MON1SPC`
  regen-monster enumeration + row-budget check, real DoK `MON1CHA`/`MON1SPC` half-damage-monster
  enumeration + row-budget check, and a source-text proof that `monsterCategory()` references neither
  field today) — run via `npx vitest run` (3/3 passed), then deleted. Confirmed via
  `git status --porcelain` (clean except this doc) after deletion.
