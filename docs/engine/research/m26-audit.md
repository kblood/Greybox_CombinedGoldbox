# M26 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/HANDOFF.md` + `BUILD-QUEUE.md`'s M15–M25 "Done" entries, then
> `docs/engine/research/m24-audit.md` and `m25-audit.md` in full (M23 has no standalone audit doc —
> its findings live directly in the M23.S1/M23.S2 `BUILD-QUEUE.md` "Done" entries, also read). Per
> the task brief, this round targeted **fresh ground the prior four rounds had not covered**: the
> item/equipment subsystem (`packages/engine/src/items/*.ts`, `loaders/item.ts`, `loaders/dqkItem.ts`),
> `PartyMemberSpec.magicHitBonus`/`magicDamageBonus` (flagged unexplored by M25's own "Implications"
> section), armor-type class restrictions, cursed items, item charges/uses, potion/scroll effects,
> XP-for-treasure bonuses, class-specific combat bonuses (ranger/paladin/monk), and the remaining
> unchecked corners of `packages/engine/src/ruleset/` (`progression.ts`, `classFlags.ts`, `races.ts`).
> Nothing in this document has been implemented — this is read-only research, per the M26 task brief.

## Headline finding: the item/equipment vein is real but **systemically blocked**, not a wiring gap

The task brief's lead suggestion — wire a decoded magic-item `+N` to-hit/damage bonus into
`PartyMemberSpec.magicHitBonus`/`magicDamageBonus` — turned out to be a genuine dead end, but a
**newly, freshly confirmed** one (no prior audit had traced it this far), and tracing it surfaced the
actual pick this round: a **sibling** decoded value in the same family, sourced from **monster-carried**
items rather than player-carried ones, that clears every bar the magic-bonus candidate fails. See
"Candidates investigated and rejected" for the full magic-bonus trace; the short version: `magicBonus`/
`plus` IS decoded on real DoK/DQK item records, `PartyMemberSpec.magicHitBonus`/`computeThac0`'s
`magicBonus` parameter DO already exist as consumers — but **no live code path ever attaches a decoded
per-instance item (with a nonzero bonus) to a player's `Inventory` in the first place** (starter kits,
shop stock, and the loot table are all synthetic base-type-only data with no per-instance `plus` field
at all). Wiring the consumer side would be an inert no-op with nothing real ever flowing through it —
the same "bigger than wiring, needs a whole missing subsystem" shape M19/M24 already hit with item
identify/cursed-item detection, now reconfirmed from a different angle (equipment, not identification).

## RECOMMENDED: monster-carried **magic-item XP bonus** (COAB `calc_battle_exp`, `Σ item.plus·400`) — computed by our own `experience.ts`, real decoded monster-loot bytes exist, but the one live XP call site never supplies them

Wire `MON{n}ITM.DAX`'s already-decoded per-item `plus` byte (COAB `Item.plus`, the same magic-bonus
field the rejected candidate above traced) into `calcBattleExp`'s already-implemented, already-tested
`loot.itemPluses` parameter, at the **one** place post-combat XP is awarded
(`apps/web/src/ui/combat.ts`'s `finalize()`). This is the sibling of the M23.S2/M24.S1 `MON{n}SPC.DAX`
affect-family wiring, but for `MON{n}ITM.DAX` (monster **carried items**, the archive one level up in
the same `load_mob` triplet) instead of `MON{n}SPC.DAX` (monster **affects**) — same decode-once,
join-by-block-id, flat-field template, applied to a table this project has decoded since Gap G2 but
never connected to the post-combat XP math it was decoded *for*.

### (a) Exact file/function that already computes it, and proof nothing real feeds it

- **`packages/engine/src/ruleset/addnd1e/experience.ts`** — `calcBattleExp(enemies, loot)` (lines
  50-61) already sums `Σ item.plus·400` for every positive entry in `loot.itemPluses` (lines 57-59):
  ```ts
  for (const plus of loot.itemPluses ?? []) {
    if (plus > 0) total += plus * XP_PER_ITEM_PLUS;   // XP_PER_ITEM_PLUS = 400
  }
  ```
  This has been implemented and unit-tested since 2026-06-27 (`docs/engine/research/decompile-ovr006-xp-treasure.md`'s
  "IMPLEMENTED" note) — `packages/engine/test/experience.test.ts:43-49` proves the arithmetic with a
  **fabricated** array (`itemPluses: [2, 0, -1, 3]`), not real data.
- **The one live call site never passes it.** `apps/web/src/ui/combat.ts:692`:
  ```ts
  const xpResult = awardPartyXp(enemies, { goldXpWorth: haul.gold });
  ```
  `goldXpWorth` is supplied; `itemPluses` is not — `grep -n "itemPluses" apps/web/src apps/author/src`
  matches **zero** results anywhere outside the engine's own type definitions and its one synthetic
  test. The research doc that introduced `calcBattleExp` says so itself, unchanged since 2026-06-27:
  *"Remaining wire-up: have the combat-end path feed real defeated-enemy/loot data into
  `calcBattleExp`"* (`decompile-ovr006-xp-treasure.md` line 91) — a TODO this project's own docs have
  carried for a week across five audit rounds (M20-M25) without anyone picking it up, because the
  **source** of a real `itemPluses` array (`MON{n}ITM.DAX`'s `plus` field) was Gap-G2 material that
  none of those rounds happened to cross-reference against the XP module.
- **The decode side is 100% real and already exists**, just never joined to a defeated foe:
  `packages/engine/src/loaders/monsterSideTables.ts`'s `decodeMonsterItmArchive` (lines 273-286)
  parses `MON{n}ITM.DAX` into `Map<blockId, MonsterItem[]>`; `MonsterItem.plus` (line 134-135, decoded
  at `ITEM_FIELD.plus = 0x32`, signed) is the same COAB `Item.plus` field. `grep -n "decodeMonsterItmArchive"
  apps/web/src` matches **zero** results — its only callers are `buildDqkGame.ts` (the **native
  rebuild pipeline**, which repacks the table for the DQK-engine content port, not live web gameplay)
  and its own test file.

### (b) Real-bytes + COAB verification

**COAB oracle (`coab_extracted/engine/ovr006.cs`, `calc_battle_exp`, lines 8-63):**
```csharp
foreach (Player player in gbl.TeamList) {
    if (player.combat_team == CombatTeam.Enemy &&
        player.health_status != Status.okey && player.health_status != Status.running) {
        gbl.pooled_money += player.Money;
        total += player.field_13E * player.hit_point_rolled;
        total += player.field_13C;
        if (gbl.area2_ptr.field_5C6 != 1) {                 // per-area suppression flag
            foreach (Item item in player.items) {           // EVERY carried item, not just readied
                Item newItem = item.ShallowClone();
                newItem.readied = false;
                gbl.items_pointer.Add(newItem);              // → the treasure pool
            }
        }
    }
}
total += gbl.pooled_money.GetExpWorth();
foreach (Item item_ptr in gbl.items_pointer) {
    if (item_ptr == gbl.item_ptr) break;
    if (item_ptr.plus > 0) total += item_ptr.plus * 400;     // ← the exact formula calcBattleExp mirrors
}
return total / (gbl.area2_ptr.party_size - gbl.partyAnimatedCount);
```
Two things this pass confirms that weren't nailed down when `calcBattleExp` was first written:
1. **Every defeated enemy's full carried-item list is collected**, not just items it had readied
   (`newItem.readied = false` is set unconditionally on the clone) — so `MonsterItem.readied` should
   **not** gate which items contribute, matching this candidate's plan to sum `.plus` across a
   monster's entire `MonsterItem[]`, not just its equipped subset.
2. **The XP bonus is computed unconditionally at battle end**, before any treasure-screen interaction
   — it is not contingent on the player actually choosing to keep the item afterward. So joining
   `MON{n}ITM.DAX` bytes straight onto the defeated `Combatant`s and summing at `finalize()` is
   **faithful**, not an approximation of "should the player have looted it."

**Real-bytes probe (this audit, fresh — `decodeMonsterItmArchive` + `decodeMonsterArchive` over the
real files, reproducible any time via the same loaders):**

| Game | File pair | Monster ids with `plus > 0` items | Example |
|---|---|---|---|
| CoK area 1 | `MON1CHA.DAX`/`MON1ITM.DAX` | **0** of 11 itemed ids | (none — area 1 has carried items but none enchanted) |
| CoK area 2 | `MON2CHA.DAX`/`MON2ITM.DAX` | 3 of 15 | id 60 SIR RINGWALD (+5), id 61 LYN SWIFTFOOT (+2/+3), id 33 PRISON LORD (+2/+1) |
| CoK area 3 | `MON3CHA.DAX`/`MON3ITM.DAX` | 3 of 9 | id 24 SIR LEBAUM (+3), id 18 MYRTANI (+3), id 32 DRAGON MASTER (+1/+1/+1) |
| **DoK area 1** | `MON1CHA.DAX`/`MON1ITM.DAX` | **17** of 17 itemed ids | id 48 SIR DRYDEN (+4/+4/+3), id 50 FLAVIUS (+8/+3/+4/+3/+3/+3), ids 64/65 SOLAMNIC KNIGHT (+1 each) |

Full DoK area-1 tally (all real, all named boss/unique-type monsters — SKOMP, SIR DRYDEN, TANAR,
FLAVIUS, SOLAMNIC KNIGHT ×2, BLACK MAGE, BLACK WIZARD, HIGH WIZARD, ROGUE MAGE HIGH, PATRIARCH, HIGH
PRIEST, EVIL WARRIOR, EVIL WARLORD, DURFEY, UNDEAD DURFEY): 17 monster records carry at least one
positive-`plus` item, several carry 2-6. This is exactly the kind of thematically-sane, plentiful real
data the M23.S2/M24.S1 precedent looks for (named unique NPCs/bosses carrying enchanted gear, not
noise) — and it is **richer** than either of those rounds' affect tallies (3 half_damage records,
8 regen_3_hp records).

**The one live game file the current explorer actually loads is `MON1CHA.DAX`/`MON1ITM.DAX` per game**
(`apps/web/src/ui/gameData.ts`'s `monPath`/`spcPath`, area-1-only, same restriction M23.S2/M24.S1 both
worked within) — CoK's area-1 file happens to carry **zero** enchanted monster loot (all the CoK hits
are areas 2/3, not currently loaded by the live explorer), but **DoK's area-1 file is rich** (17 of 17
itemed monsters), so — exactly as M24.S1 found for `half_damage` (DoK-only in the currently-loaded
files) — this candidate's real-bytes proof and e2e target **DoK**, not CoK.

### (c) Exact live call site(s) to wire

1. **`apps/web/src/ui/gameData.ts`** — add `itmPath?: string` next to `spcPath` (same optional,
   same-shape doc comment), set to `'Champions of Krynn/MON1ITM.DAX'` / `'Death Knights of Krynn/MON1ITM.DAX'`
   for the two `GAME_DATA` entries (identical folder/naming convention `spcPath` already uses one line
   above `itemPath` in that file).
2. **`packages/engine/src/loaders/monsterSideTables.ts`** — add a sibling join function next to
   `applyRegenAffect`/`applyHalfDamageAffect` (same signature shape, reusing `decodeMonsterItmArchive`
   which already exists):
   ```ts
   export function applyItemPluses(records: MonsterRecord[], itm: Map<number, MonsterItem[]>): MonsterRecord[] {
     return records.map((r) => {
       const items = itm.get(r.blockId);
       return items?.length ? { ...r, itemPluses: items.map((i) => i.plus) } : r;
     });
   }
   ```
   (Stores the **full** per-item `plus` array, including zero/negative — mirroring COAB's
   "collect everything, filter `plus > 0` at the summing step" split exactly; `calcBattleExp` already
   does that filtering, so this loader function's only job is decode + join, matching this project's
   established layering.)
3. **`packages/engine/src/loaders/monster.ts`** — add `itemPluses?: number[]` to `MonsterRecord` right
   next to `halfDamage` (line ~224), same "populated after the `MON{n}ITM.DAX` join, undefined for the
   common case (no carried magic items)" doc comment style.
4. **`packages/engine/src/combat/combat.ts`** — add `itemPluses?: number[]` to `Combatant` (next to
   `halfDamage`/`missileHitBonus`); thread it through `monsterCombatant()` (lines 253-284, the exact
   spot `regenPerRound`/`halfDamage` are already passed through) with one new line:
   `itemPluses: mon.itemPluses` — no other changes to that function; `TacticalCombatant extends
   Combatant` so it is inherited automatically in the tactical engine too, exactly like the three
   preceding M23-M25 fields.
5. **`apps/web/src/ui/explore.ts`** — next to the existing `spcAffects`/`applyRegenAffect`/
   `applyHalfDamageAffect` join (lines 1528-1531), add the sibling fetch + join, reusing the exact
   `spcPath`-style optional-fetch/graceful-degrade pattern:
   ```ts
   const itmBytes = gd.itmPath ? await readAssetBytes(gd.itmPath).catch(() => new Uint8Array(0)) : new Uint8Array(0);
   monRecords = applyItemPluses(monRecords, decodeMonsterItmArchive(itmBytes));
   ```
6. **`apps/web/src/ui/combat.ts`'s `finalize()`** (lines 685-692) — the actual XP-award choke point,
   the one place this candidate needs a behavioural change:
   ```ts
   const foes = state.combatants.filter((c) => c.side === 'enemy');
   const itemPluses = foes.flatMap((c) => c.itemPluses ?? []);   // NEW
   const haul = rollTreasure(foes.map((c) => ({ xp: c.xp })), state.seed);
   const enemies: DefeatedEnemy[] = foes.map((c) => ({ flatXp: c.xp ?? 0 }));
   const xpResult = awardPartyXp(enemies, { goldXpWorth: haul.gold, itemPluses });   // itemPluses added
   ```
   This is the **only** line in the entire slice that changes real combat behaviour — everything
   above it is decode/join plumbing that reuses existing patterns line-for-line.

### (d) Why it needs no new state-tracking machinery

`itemPluses` is a **flat, static, per-monster-record array** — set once at dungeon load (same moment
`regenPerRound`/`halfDamage` are joined), read exactly once at battle end, no duration, no counter, no
interaction with any other system, and no per-round or per-hit logic at all (unlike `regenPerRound`,
which needed a `tickRegen()`/round-loop hook in **both** combat engines). This candidate is
**simpler than M23.S2 in the combat-engine dimension** (zero changes to `tactical.ts`'s round loop or
hit resolution — it never participates in combat itself, only in the XP tally after combat ends) while
being **the same size as M23.S2 in the plumbing dimension** (one new optional `gameData.ts` field, one
new fetch, one new join function). No new schema beyond one optional array field threaded through
three existing types (`MonsterRecord`, `Combatant`, `GameData`), all following an established shape.

### (e) Size: S

Comparable to M23.S2's fetch/join lift (new `gameData.ts` field + new fetch + new loader join function)
but smaller in total surface area since there is no round-tick or per-hit branch to add in either
combat engine (`tactical.ts` is untouched entirely) — the only "real" behavioural edit is the one line
in `combat.ts`'s `finalize()`. Roughly the same order as M24.S1, slightly larger only because of the
new-fetch dimension M24.S1 didn't need (it reused M23.S2's already-fetched `spcAffects` map).

### Proof plan

- **Engine unit tests** (deterministic, real bytes where possible, no RNG needed for the mechanism):
  1. `applyItemPluses` synthetic case (a fabricated `itm` map with mixed positive/zero/negative
     `plus` values sets `itemPluses` to the full array unfiltered; a monster with no entry in the map
     is left unchanged) — mirrors `applyRegenAffect`'s existing synthetic test shape.
  2. A **real-bytes join** case: decode the real `Death Knights of Krynn/MON1ITM.DAX` +
     `MON1CHA.DAX`, assert id 64 (SOLAMNIC KNIGHT) joins to `itemPluses` containing `1` (its single
     +1 carried item) and a control id with no `MON1ITM.DAX` entry (any bestiary id absent from the
     decoded `itm` map — e.g. a plain non-NPC monster) joins to `undefined` — the same "real-bytes
     negative control" shape M23.S2/M24.S1 used.
  3. A `calcBattleExp` case using the **real** SOLAMNIC KNIGHT value end-to-end: `calcBattleExp([{flatXp:
     0}], { itemPluses: [1] })` equals `400` — proving the real decoded byte, once joined, produces
     the exact COAB-formula XP bonus (this closes the loop the existing fabricated-array test in
     `experience.test.ts` left open).
  4. `monsterCombatant()` pass-through test: a synthetic `MonsterRecord`-shaped input with
     `itemPluses: [2, 5]` produces a `Combatant` with the same array — mirrors the existing
     `regenPerRound`/`halfDamage` pass-through assertions in `combat.test.ts`.
- **One e2e** (`?explore=dok`, matching M23.S2/M24.S1's shape): spawn the real DoK SOLAMNIC KNIGHT
  (id 64 or 65) via `window.__explore.testFightMonster(64, seed)` through the actual production
  `spawnEnemies` path, and read a new `window.__combat.itemPlusesOf(id)` seam (mirrors `regenOf`/
  `halfDamageOf`/`missileHitBonusOf` exactly: `state?.combatants.find((c) => c.id === id)?.itemPluses ??
  null`) to prove the real `MON1ITM.DAX` byte reaches the real spawned `Combatant` — no RNG-dependent
  fight resolution needed (the "split it" lesson M23.S2/M24.S1 already recorded: proving the join
  reached the object is enough; the arithmetic itself is proven by the deterministic engine tests
  above). Use any bestiary id with no `MON1ITM.DAX` entry as the same-real-data negative control.

---

## Candidates investigated and rejected this round (with reasons, so they aren't re-proposed)

### Item/equipment subsystem

| Candidate | Real? | Verdict |
|---|---|---|
| **Magic weapon to-hit/damage bonus** (`PartyMemberSpec.magicHitBonus`/`magicDamageBonus` in `combat/party.ts`; `items/inventory.ts`'s `computeThac0(baseThac0, magicBonus)`) | **Real mechanism, real decoded byte, but no live antecedent.** COAB `ovr025.cs CalculateAttackValues` (lines 33, 60-61): `int bonus = item.plus; ... player.hitBonus += bonus; ... player.attack1_DamageBonus += (sbyte)bonus;` — a magic weapon's `+N` applies unconditionally to *both* to-hit and damage (unlike the melee/ranged-gated Dex/Str bonuses M25.S1 wired). `DokItemRecord.magicBonus`/`DqkItemRecord.magicBonus` (byte 8) ARE decoded from real bytes and unit-tested (`item.test.ts:109`, `dqkItem.test.ts:62/80/128`). `PartyMemberSpec.magicHitBonus`/`magicDamageBonus` already exist and are already consumed inside `partyCombatant()` (lines 58, 63) — `grep -n "magicHitBonus:\|magicDamageBonus:" apps/web/src apps/author/src packages/engine/src` matches **only** `party.test.ts:62`, a fabricated test value, never real data. | **Not recommended — genuinely blocked, not merely unwired.** Traced the full chain and found `InventoryEntry` (`items/inventory.ts`, the live player-inventory model) has **no per-instance magic-bonus field at all** (only `name`/`baseTypeId`/`count`/`equipped`), and **no live code path ever constructs one with real per-instance data**: starter kits (`party.ts`'s `CLASS_STARTER_KIT`/`starterKit()`) build from `inventoryFromIds()` (base-type ids only); the shop (`buyItem`) and the loot table (`treasure.ts`'s synthetic `DROP_TABLE`) are likewise base-type-only; the ECL `TREASURE` opcode (0x27) that could in principle script a specific magic item into the party's hands is **not interpreted at all** (`ecl/vm.ts:604`'s own comment: "every other opcode ... is surfaced [as a generic event], not executed"). The only places real decoded item records (`decodeDokItemArchive`, with real `.magicBonus`) are read at all (`explore.ts:1549-1560`, `referenceDb.ts:213`) build a **read-only reference/Companion-database catalogue**, and both call sites explicitly discard `.magicBonus` in their `.map()` (kept fields: `name`/`baseTypeId`/`value` only). Wiring the consumer side today would be dead code with nothing real ever flowing into it — the same root cause M19 (shop appraisal) and M24 (cursed-item detection) already identified for the item-instance subsystem, now reconfirmed a third time from the equipment-bonus angle. **A genuine, sizeable follow-on** once/if a "real magic items enter player inventory" mechanism exists (a TREASURE-opcode interpreter, or a non-synthetic loot table sourced from `MonsterItem`/`decodeMonsterItmArchive` — see the RECOMMENDED pick above, which sources from the *same* decoded table but only needs the `.plus` number summed for XP, not attached to a live wearable item).
| **Item charges/uses** (`DokItemRecord.charges`/`DqkItemRecord.charges`, byte 14) | Real, decoded, tested (`item.test.ts:110`) | **Not recommended — same root cause as magic bonus above.** No wand/staff/charge-depletion mechanic exists anywhere in `items/inventory.ts`/`party.ts` (no "uses left" counter on any carried item), and per the same trace, no live item ever reaches inventory with a real per-instance `charges` value to begin with. A second symptom of the same missing subsystem, not an independent gap.
| **Cursed items** (`DokItemRecord.cursed` byte 12 / shared 63-byte `ITEM_FIELD.cursed` offset 0x36) | Real, decoded | **Already rejected by M24** (`m24-audit.md`'s Items section) for the identical reason — no "identified/hidden name" state modeled per carried instance. Re-confirmed unchanged this round (no new evidence); not re-litigated in depth.
| **Armor-type class restrictions** (`ruleset/addnd1e-dragonlance/classFlags.ts`'s `itemUsableByClassFlags`/`findItemsToUnready`, and `DqkBaseItem.classMask`) | Real (COAB `ovr026.cs:693`, hackdocs `ITEMS.TXT` byte 13, `CCHFORM.TXT` offset 183 — all cross-referenced in the file's own header comment) | **Already rejected by M17 and reconfirmed by M24** — the only byte-decoded `classFlags` data is DQK's `DqkBaseItem.classMask`, but `dqkExplore.ts`'s `openCompanion()` still passes `items: []` (line 618, unchanged since M24's check) and its shared `inventory.ts` overlay still builds from the same synthetic `BASE_ITEMS`/`inventoryFromIds()` CoK/DoK use, which carries no restriction bytes. Re-verified this round (`grep -n "items: \[\]" apps/web/src/ui/dqkExplore.ts` still matches); no new evidence changes the verdict.
| **Potion/scroll effects** | Investigated fresh | No potion-drinking/scroll-reading mechanic of any kind exists in `items/inventory.ts` (`useItem()` only decrements a stack — it has no effect-application step at all, consumable or otherwise). This is the same class of gap as the identify subsystem: a real 1e/Gold-Box feature, but **nothing computes an effect to wire** — building it would be new mechanic invention, not connecting an existing decoded value, and per the item-record fields above there's also no live path for a *specific* potion/scroll instance (with its real `effectCode`/`specialCode`, `dqkItem.ts` lines 134-137) to reach a character's pack in the first place. Not a candidate under this audit's "computed but unwired" bar.

### XP-for-treasure (the sibling this round's recommendation came from)

| Candidate | Verdict |
|---|---|
| `Σ item.plus·400` sourced from **monster-carried** items (`MON{n}ITM.DAX`) | **This is the recommended pick** — see above. Distinguishing it from the rejected player-equipment candidates: this one's real data source (`MonsterItem.plus`, joined by monster id) is **completely independent** of the missing player-inventory-instance plumbing — it never needs a magic item to be *worn*, only *tallied* at battle end, which is exactly what COAB's own code does before the treasure screen even opens.
| Gold's XP worth (`BattleLoot.goldXpWorth`) | Already fully wired since M15 (`combat.ts:692` already passes `haul.gold`). Not a gap.

### Class-specific combat bonuses

| Candidate | Real? | Verdict |
|---|---|---|
| **Ranger bonus vs. giant-class creatures** | Real per the CoK Journal manual — `docs/engine/research/cok-dragonlance-rules.md` line 112: *"Ranger ... Any armor/weapon; HP bonus if CON 17+; extra damage vs giant-class"* | **Not a candidate.** `grep -rn "giant" packages/engine/src` (excluding unrelated hits — item-name strings like "Giant Strength", monster-size-category labels, comments) turns up **no function anywhere that computes this bonus** — it is a real manual-sourced mechanic, but nothing in this engine has ever implemented it (no "is this a giant-class monster" classifier, no ranger-damage-modifier function). This fails the audit's core bar ("real, decoded/computed, zero call sites") at the first clause — there is nothing computed to wire. Implementing it from scratch would be new-mechanic invention (would need a giant-class monster classifier plus a combat-damage hook), a materially bigger lift than any of this round's other candidates, and outside this audit's scope per its own "wire an existing computed value" framing.
| **Ranger HP bonus at CON 17+** | Real per the same manual line | Also **not computed anywhere** (`recalc.ts`/`character.ts` swept — no CON≥17-gated ranger HP function exists). Same verdict as above: nothing to wire, would be new mechanic.
| **Paladin bonuses** | N/A | Paladin **does not exist as a class** in the Krynn Dragonlance ruleset (`DragonlanceClassId` = `cleric \| fighter \| ranger \| magicUser \| thief \| knight` — no paladin; the Knight of Solamnia fills the analogous narrative role). Not applicable.
| **Monk unarmed damage progression** | N/A | Monk likewise does not exist in `DragonlanceClassId`. The generic `addnd1e` (non-Dragonlance) `ClassId` type includes `monk` for other rulesets (`buckrogers`/`addnd2e` future use), but Krynn characters can never be one — not applicable to this game's content.
| **Knight of Solamnia order mechanical bonus** | Investigated fresh | `petitionableOrder()`/`KNIGHT_ORDER_MINIMUMS` (`classes.ts`) **is already fully wired** — `character.ts:213` calls it live during character creation (`sheet.knightOrder = petitionableOrder(req.abilities)`), confirmed by a direct grep, not re-derived. Searched for a **combat/mechanical** bonus per order (beyond the title/tithe/advancement-gate prose already documented in `cok-dragonlance-rules.md` §8) in both COAB (`grep -i "knight\|solamnia" coab_extracted/` — the only hits are an unrelated Forgotten-Realms NPC faction name, "Knights of Myth Drannor"; COAB is the Curse of the Azure Bonds decompile and has **zero** Dragonlance-specific content) and the Journal transcription (no per-order combat modifier described, only ability-score petition gates + tithe percentages). **Not a candidate** — the order is already wired to the one real thing it's known to gate (title/eligibility), and no mechanical bonus exists in any available source to wire further.

---

## Open questions / unknowns

- **`gbl.area2_ptr.field_5C6`** (COAB's per-area "suppress monster item collection" flag,
  `ovr006.cs:34`) — **UNLOCATED** in our own GEO/area data; no equivalent byte is decoded anywhere in
  `loaders/geo.ts` or the area-loading path. This audit's recommendation treats it as always-false
  (every defeated monster's items always contribute to the XP pool), which is the simplest faithful
  reading absent evidence of the flag ever being set in Krynn's shipped area data — flagged as an
  assumption, not silently invented. If a future pass locates this byte and finds it set in some CoK/
  DoK areas, that area's monsters should be excluded from the sum.
- **This round's real-bytes probe only covered the files the live explorer currently loads plus their
  immediate siblings** (CoK areas 1-3, DoK area 1) — a full multi-area sweep (CoK/DoK's later dungeon
  areas, once the explorer supports them) would likely surface more enchanted-loot monsters; not
  needed to justify this slice (DoK area 1 alone already has 17 real records).
- **The magic-item-to-player-inventory gap** (rejected candidate above) is now the **third**
  independent audit (M19 identify, M24 cursed, M26 magic-bonus/charges) to hit the exact same root
  cause: `InventoryEntry`/the shop/loot/starter-kit trio has no per-instance item-record concept at
  all. If a future phase decides to build a "real items with real stats enter the party's hands"
  mechanism (most plausibly: replace `treasure.ts`'s synthetic `DROP_TABLE` with a real join against
  `MonsterItem`/`decodeMonsterItmArchive` — the exact same table this round's recommendation reads),
  it would retroactively unblock the magic-bonus, charges, AND cursed-item candidates all at once, on
  top of M19's shop-appraisal use case. Worth scoping as a single M-phase given four independent
  audits now point at it, not four separate ones.

## Implications for our engine

- The M23-M25 "decode generically once, map one flat field at a time into an optional `Combatant`/
  `MonsterRecord` property, apply at the nearest existing choke point" template generalizes cleanly to
  a **second sibling table in the same `MON{n}xxx.DAX` family** (`ITM` alongside the already-wired
  `SPC`) — this round's candidate needed the least *new* combat-engine surface of the four M23-M26
  picks (zero changes to `tactical.ts`), because the target choke point (`calcBattleExp`) was already
  fully implemented and tested; the only missing piece was the data join, not the math.
- **The item-instance subsystem is the recurring blocker, not a one-off.** Three separate audits
  (M19, M24, M26) have now independently arrived at "real decoded per-item byte, real consumer
  function, zero live join" for identify/appraisal, cursed-flag, and magic-bonus/charges respectively
  — all blocked by the same missing "how does a real item with real stats enter a player's inventory"
  mechanism. This round's recommended pick deliberately sidesteps that blocker by sourcing from
  **monster-carried** loot for a **tally**, not player-carried gear for a **wearable effect** — a
  useful distinction for future audits: the same decoded byte (`item.plus`) can be wireable or blocked
  depending on which side of combat and which consumer it feeds.
- Future audits sweeping this area should check **`treasure.ts`'s synthetic `DROP_TABLE`** first — if
  it is ever replaced with a real `MonsterItem`-sourced loot join (which this round's pick is a
  natural predecessor to, since it already decodes and reads the same table), that single change would
  unblock three previously-rejected candidates in one slice.
