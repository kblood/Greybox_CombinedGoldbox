# M30 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/research/m29-audit.md` in full plus `docs/engine/BUILD-QUEUE.md`'s
> M23–M29 phase entries and "Done" section, per the task brief. The brief offered five leads: (1) the
> unconsumed `MonsterItem` fields `value`/`weight`/`readied`/`affects[3]`; (2) the four unconsumed
> `SavingThrows` columns (`paralyzePoisonDeath`/`petrifyPolymorph`/`rodStaffWand`/`breath`); (3) whether
> M29.S1 shrank the item-instance subsystem enough to expose a narrower "plain item reaches a player's
> own inventory" slice; (4) `.value` feeding a sell-to-town mechanic, if one exists; (5) the ECL
> `TREASURE` opcode. All five were investigated against the live source, not re-summarized from the
> prompt.
>
> **Lead (4) is this round's pick, and it subsumes lead (1)'s `.value` sub-question.** A real, working
> sell-to-town mechanic already exists end-to-end (`town/shop.ts`'s `sellStack`, wired live through
> `apps/web/src/ui/party.ts`'s `sellFromLeader` into `apps/web/src/ui/town.ts`'s Shop→Sell screen, with
> its own passing test suite and e2e coverage) — and it is fed **exclusively** by a synthetic,
> CANDIDATE, per-base-type price table (`shop.ts`'s `ITEM_PRICE`/`KIND_PRICE`), never by the real,
> already-decoded, per-monster-instance `MonsterItem.value` byte (`ITEM_FIELD.value` @0x3a,
> `loaders/monsterSideTables.ts:108,139`). Real bytes prove this isn't cosmetic: a real DoK carried
> Leather Armor instance (BLACK MAGE, id 66, area 1) has `value=900`, giving a real sell offer of 450
> steel — the synthetic catalogue price for the same base type (`ITEM_PRICE[15] = 40`) sells for only
> 20. This is the same shape as every M23–M29 pick: a real byte, already decoded, sitting one hop from
> an already-built, already-live consumer that simply never reads it — and it needs **zero** combat-side
> schema (no `magicBonus`/`charges`/`cursed`, no `computeThac0` change), only one new optional economic
> field threaded through five files already touched by M29's own carried-loot pipeline.
>
> **Lead (3) resolved as "already shipped, not a new slice."** Tracing `apps/web/src/ui/combat.ts`'s
> treasure-claim flow found that "a party member picks up a plain item from a defeated monster and it
> lands in their own inventory" is **not a gap** — `takeTreasureItems()` → `giveItemsToMember()`
> (`party.ts:847-858`) already exists, is generic over any `TreasureItem[]`, and already fires for
> M29.S1's real carried loot today. There is nothing left to wire here; this finding is recorded so a
> future round doesn't re-open it.
>
> Leads (1)'s other three fields (`weight`/`readied`/`affects[3]`), lead (2) (the four SavingThrows
> columns), and lead (5) (ECL `TREASURE`) were all investigated and rejected — see Parts 3-5.
>
> Nothing in this document has been implemented — this is read-only research, per the task brief.

## Headline finding

The town shop's sell mechanic is real, live, and tested (`packages/engine/src/town/shop.ts`,
`packages/engine/src/town/pricing.ts`, wired through `apps/web/src/ui/party.ts` and
`apps/web/src/ui/town.ts`'s `?town=1` Shop→Sell screen) — but it has **never once been fed a real
item's stored value**. `pricing.ts`'s `sellOffer` (the pinned, COAB-grounded `ShopSellItem`/ovr020
formula: half-list + a `count·(value/2)/20` bulk penalty, ammo excepted) is always called with the
**synthetic** `shop.ts` `itemPrice(id)` (a flat CANDIDATE per-base-type table), never with a real
carried item's own `MonsterItem.value` (offset 0x3a, decoded since the M26/M29 loader work, currently
discarded by `applyCarriedItems`, which only keeps `{baseTypeId, count}`). A from-scratch real-bytes
probe (this round, independent Python DAX/RLE decoder, the same discipline every M23-M29 probe used)
found **9 of 140** real `MON{n}ITM.DAX` carried-item records have a nonzero `.value` — all in
`Death Knights of Krynn/MON1ITM.DAX`, all on the mage/priest cluster (ids 66-71), ranging 900-1800 —
and confirmed the synthetic vs. real divergence is not trivial: real Leather Armor (id 66's carried
item) sells for **450 steel** by the real formula vs. **20 steel** by today's synthetic table, a 22×
difference. This is a real, decoded, unconsumed byte with a real, already-built, already-live consumer
one hop away — the exact template M23-M29 shipped six times running.

---

## Part 1 — RECOMMENDED: real per-instance `.value` feeds the shop sell price (`MON{n}ITM.DAX` → `sellStack`)

### (a) The consumer already exists, live, tested — it just never sees a real value

`packages/engine/src/town/shop.ts`:
```ts
// lines 46-51
export function itemPrice(id: number): number {
  if (id in ITEM_PRICE) return ITEM_PRICE[id]!;
  const it = baseItem(id);
  return it ? KIND_PRICE[it.kind] : 0;
}
// lines 92-96
export function sellStack(gold: number, id: number, count: number): ShopTxn {
  const isAmmo = baseItem(id)?.kind === 'ammo';
  const price = sellOffer(itemPrice(id), count, isAmmo);
  return { ok: true, gold: gold + price, price };
}
```
`sellOffer` itself (`town/pricing.ts:60-65`) is the pinned, COAB-verified formula
(`docs/engine/research/decompile-ovr007-economy.md` §"Sell price + coin payout — `ShopSellItem`
(ovr020) — VERIFIED": *"Base offer = `item._value / 2`... Stacked items: `(count·(value/2))/20`...
Arrows/quarrels instead pay `(value/2)·count`"*) — already implemented byte-for-formula-accurate. The
gap is entirely on the **input** side: `itemPrice(id)` is `shop.ts`'s own header-flagged CANDIDATE
table (`shop.ts:1-10`: *"All prices are CANDIDATE tuning values (plausible feel, not pinned to an
oracle)"*), not the item's real stored `_value`.

This is already wired all the way to a live screen:
- `apps/web/src/ui/party.ts:1052-1064` `sellFromLeader(index)` — the one live call site —
  `sellStack(getGold(), entry.baseTypeId, entry.count)`.
- `apps/web/src/ui/town.ts:114-124` (`shop-sell` mode) calls `sellStack(0, e.baseTypeId, e.count).price`
  to show each pack entry's sell offer on screen, and `town.ts:398-399`'s `__town.sell(i)` e2e seam
  calls `sellFromLeader(i)` directly.
- Existing coverage: `packages/engine/test/townEconomy.test.ts` (`sellPrice`/`sellStack` unit tests) and
  `apps/web/test/e2e.mjs` (a live `?town=1` bulk-sale e2e, `~line 3172`, already exercising
  `sellStack`'s ammo/bulk-penalty branches through the real UI).

None of this reads a real per-instance value today because **no data structure between the monster's
carried item and the player's pack ever carries one** — `CarriedLoot` (`loaders/monster.ts:166-171`)
only kept `{baseTypeId, count}` (M29.S1's own deliberate, narrow scope — value was out of scope then),
`TreasureItem` (`items/treasure.ts:13-17`) is `{baseTypeId, name, count}`, and `InventoryEntry`
(`items/inventory.ts:14-23`) is `{name, baseTypeId, count, equipped}` — none of the four structures in
the chain has a value field at all.

### (b) Real-bytes probe (this round, independent decoder — same DAX/RLE transcription as M28/M29)

Re-decoded every real `MON{n}ITM.DAX` record across CoK areas 1-3 + DoK area 1 (the same 140-record
corpus M29 probed), reading `ITEM_FIELD.value` (u16 @0x3a) and `ITEM_FIELD.weight` (u16 @0x37) and
`ITEM_FIELD.readied` (u8 @0x34) for every record, then narrowed to the 19 records M29 already found
resolve to a known `BASE_ITEMS` catalogue entry:

| Area | id | name | item (baseTypeId → name) | plus | readied | weight (raw) | **value** |
|---|---|---|---|---|---|---|---|
| CoK1 | 38 | BLACK ROBE MAGE | 5 Vial ×9 | 0 | false | 4 | 0 |
| CoK1 | 41 | CLERIC | 8 Arrow | 0 | false | 60 | 0 |
| CoK1 | 42 | EVIL CURATE | 8 Arrow | 0 | false | 60 | 0 |
| CoK2 | 39 | THAUMATURGIST | 5 Vial ×9 | 0 | false | 4 | 0 |
| CoK2 | 40 | ENCHANTER | 5 Vial ×4 | 0 | false | 4 | 0 |
| CoK2 | 42 | EVIL CURATE | 8 Arrow | 0 | false | 60 | 0 |
| CoK2 | 52 | ELVISH CURATE | 8 Arrow | 0 | false | 60 | 0 |
| CoK3 | 40 | ENCHANTER | 5 Vial ×4 | 0 | false | 4 | 0 |
| DoK1 | 49 | TANAR | 8 Arrow | 4 | false | 1 | 0 |
| DoK1 | 66 | BLACK MAGE | 15 Leather Armor | 1 | **true** | 1 | **900** |
| DoK1 | 66 | BLACK MAGE | 5 Vial ×8 | 0 | false | 1 | 0 |
| DoK1 | 67 | BLACK WIZARD | 15 Leather Armor | 1 | **true** | 1 | **900** |
| DoK1 | 67 | BLACK WIZARD | 5 Vial ×16 | 0 | false | 1 | 0 |
| DoK1 | 68 | HIGH WIZARD | 15 Leather Armor | 1 | **true** | 1 | **1000** |
| DoK1 | 68 | HIGH WIZARD | 5 Vial ×4 | 3 | false | 1 | **1000** |
| DoK1 | 69 | ROGUE MAGE HIGH | 15 Leather Armor | 2 | **true** | 1 | **1800** |
| DoK1 | 69 | ROGUE MAGE HIGH | 5 Vial ×4 | 3 | false | 1 | **1000** |
| DoK1 | 70 | PATRIARCH | 8 Arrow | 1 | **true** | 1 | **900** |
| DoK1 | 71 | HIGH PRIEST | 8 Arrow | 1 | **true** | 1 | **900** |

Names re-verified directly from `Death Knights of Krynn/MON1CHA.DAX` this round (ids 66-71 decode to
`BLACK MAGE`/`BLACK WIZARD`/`HIGH WIZARD`/`ROGUE MAGE HIGH`/`PATRIARCH`/`HIGH PRIEST` — an exact match to
M29's table, independently re-derived, not copied).

**9 of 19 resolvable records carry a real nonzero value**, all in DoK area 1's mage/priest cluster,
thematically clean (magic-users' own robes/potions carrying real enchanted worth; the plain
CoK arrows/vials and DoK's TANAR arrow are worth 0). Every nonzero-value record's `+N` correlates
sensibly with its value (higher `plus` → higher `value`: HIGH WIZARD's `+3` Vial and PATRIARCH's `+1`
Arrow both land at 900-1000; ROGUE MAGE HIGH's `+2` Leather Armor is the highest at 1800) — internally
consistent, not noise.

**`readied` is a genuinely clean boolean across the full 140-record corpus** (this round confirmed:
every single record reads exactly `0x00` or `0x80`, never any other byte) — every nonzero-`value` item
above is also `readied=true` (worn gear), while every carried consumable (Vial) is `readied=false` (a
packed potion, not worn). This is a real, decoded, internally-consistent field — but see Part 3(c) for
why it still isn't a clean wiring target this round.

### (c) Exact wiring plan (five files, all already touched by M29.S1's own pipeline; zero new fetch)

1. **`packages/engine/src/loaders/monster.ts`** — extend `CarriedLoot` (lines 166-171):
   ```ts
   export interface CarriedLoot {
     baseTypeId: number;
     count: number;
     /** Stored intrinsic value/price (`ITEM_FIELD.value`, u16 @0x3a) — 0 ⇒ no recorded value (the
      * common case for common stock like arrows/vials); a real nonzero value feeds the shop's real
      * sell formula (`sellOffer`) in place of the catalogue's CANDIDATE per-type price. */
     value?: number;
   }
   ```
2. **`packages/engine/src/loaders/monsterSideTables.ts`** — `applyCarriedItems` (lines 359-366): thread
   `value` through, treating the real 0-vs-nonzero split as "no override" vs. "override" (mirrors
   `applyConSavingBonus`'s own `bonus > 0 ? {...} : r` convention, `monsterSideTables.ts:311`):
   ```ts
   ? { ...r, carriedItems: items.map((i) => ({
       baseTypeId: i.baseTypeId, count: i.count,
       value: i.value > 0 ? i.value : undefined,
     })) }
   ```
   **No change needed** in `packages/engine/src/combat/combat.ts` — `Combatant.carriedItems` and
   `monsterCombatant()`'s inline parameter/return (lines 100-109, 295-330) already type against the
   imported `CarriedLoot`, so extending the interface's own definition propagates through this pure
   pass-through with zero edits. (Smaller than M29.S1's own wiring, which had to touch this file.)
3. **`packages/engine/src/items/treasure.ts`** — extend `TreasureItem` (lines 13-17) and
   `TreasureFoe.carriedItems`'s inline type (line 36) with `value?: number`; thread it through
   `rollTreasure`'s real-item branch (lines 64-66):
   ```ts
   .map((it) => ({ baseTypeId: it.baseTypeId, name: baseItem(it.baseTypeId)!.name,
                    count: Math.max(1, it.count), value: it.value }));
   ```
4. **`packages/engine/src/items/inventory.ts`** — extend `InventoryEntry` (lines 14-23) with
   `value?: number` ("stored real price, if the item came from a real monster-carried instance;
   `undefined` for shop-bought/starter-kit gear, which falls back to the catalogue price on resale").
   No other function in this file needs touching — `inventoryFromIds`, `clone`, `transferItem` etc. are
   already generic object-spread/passthroughs.
5. **`packages/engine/src/town/shop.ts`** — `sellStack` (lines 92-96) gains one optional parameter:
   ```ts
   export function sellStack(gold: number, id: number, count: number, value?: number): ShopTxn {
     const isAmmo = baseItem(id)?.kind === 'ammo';
     const price = sellOffer(value ?? itemPrice(id), count, isAmmo);
     return { ok: true, gold: gold + price, price };
   }
   ```
   Backward compatible: every existing 3-argument call site (`townEconomy.test.ts`) keeps working
   unchanged.
6. **`apps/web/src/ui/party.ts`** — two one-line edits:
   - `giveItemsToMember` (lines 847-858): thread the value onto newly-pushed entries —
     `entries.push({ name: it.name, baseTypeId: it.baseTypeId, count: it.count, equipped: false, value: it.value })`
     (the "merge into an existing stack" branch, line 851-852, is left untouched — same stack keeps its
     already-recorded value).
   - `sellFromLeader` (lines 1052-1064): `sellStack(getGold(), entry.baseTypeId, entry.count,
     entry.value)`.
7. **`apps/web/src/ui/town.ts`** — two one-line edits: the `shop-sell` price-display line (line 120)
   becomes `sellStack(0, e.baseTypeId, e.count, e.value).price`; the `__town.leaderItems()` e2e seam
   (line 405) adds `value: e.value` to its returned shape for direct e2e assertions.

**No new asset fetch, no new decode** — this reuses the exact `MON{n}ITM.DAX` map M26.S1 already fetches
and M29.S1 already joins; the only new logic is the one-line `value ?? itemPrice(id)` fallback inside
`sellStack`, identical in shape to M28.S1's `conSpellSaveBonus` gate and M29.S1's `baseItem(...)` filter.

### (d) Why this is smaller than the general item-instance subsystem, and doesn't reopen that blocker

The recurring blocker across five audits (M19/M24/M26/M27/M29) is specifically the `magicBonus`/
`charges`/`cursed` triad needed before a real `+N` weapon can reach `computeThac0`
(`items/inventory.ts:158`) with its bonus intact — this slice touches **none** of that. `value` is a
pure economic field with a single, already-built, RNG-free consumer (`sellOffer`); it never touches
combat math, `computeThac0`, or any `+N` to-hit/damage calculation. Adding it to `InventoryEntry` is the
smallest possible "item-instance" schema addition — an optional economic tag, not an enchantment.

### (e) Size: S — comparable to M28.S1, smaller than M26.S1/M29.S1 in plumbing

Seven files, each a 1-5 line, additive, optional-field change; zero new fetch; zero new join; the only
new arithmetic is a one-line `??` fallback inside an already-tested pure function. Every existing test
in `townEconomy.test.ts` and `treasure.test.ts` keeps passing unmodified (their fixtures never set
`value`, so every existing assertion exercises the unchanged fallback path).

---

## Proof plan

- **Engine unit tests** (deterministic, no RNG needed for the new logic — `sellOffer`/`sellStack` are
  pure functions):
  1. `shop.test.ts` (new cases in `townEconomy.test.ts`): `sellStack(0, 15, 1, 900).price === 450`
     (`floor(900/2)`) vs. today's `sellStack(0, 15, 1).price === 20` (`floor(itemPrice(15)/2) =
     floor(40/2)`) — the real-vs-synthetic divergence, asserted directly. A stacked case:
     `sellStack(0, 8, 1, 900).price` (ammo, ARROW id 8, real DoK PATRIARCH value) should use the
     ammo branch of `sellOffer` (`value/2 · count`), not the bulk-penalty branch — proving the
     ammo/non-ammo dispatch still works with an injected real value.
  2. `treasure.test.ts`: `rollTreasure([{ xp: 0, carriedItems: [{ baseTypeId: 15, count: 1, value: 900
     }] }], anySeed).items[0].value === 900`, for every seed 0-20 (deterministic once real data is
     present, matching M29.S1's own proof shape); a foe with `value` omitted/0 still resolves with
     `value: undefined`, proving the "0 ⇒ no override" convention doesn't fabricate one.
  3. A **real-bytes join test** (`monsterSideTables.test.ts`, mirroring M29.S1's own "real join" case):
     decode real `Death Knights of Krynn/MON1ITM.DAX`, assert id 66 (BLACK MAGE)'s joined
     `carriedItems` contains `{baseTypeId: 15, count: 1, value: 900}` for the Leather Armor entry and
     `{baseTypeId: 5, count: 8, value: undefined}` for the Vial entry (real value 0 → undefined) — a
     clean positive/negative pair from the same real record, no fabrication either direction.
- **One e2e** (`?explore=dok`, matching the exact harness pattern M26.S1/M27.S1 already used for this
  same DoK area-1 fixture set):
  1. `testFightMonster(66, seed)` (BLACK MAGE, DoK area1 block **66** — a fresh id for this project's
     e2e suite, not previously spawned) → `carriedItemsOf('e0')` should contain `{baseTypeId: 15,
     count: 1, value: 900}` (today: `{baseTypeId: 15, count: 1}`, no `value` key).
  2. **Negative control reusing an established id**: `testFightMonster(38, seed)` (CoK BLACK ROBE MAGE,
     the exact id M29's own e2e already spawns) → `carriedItemsOf('e0')`'s Vial entry has `value`
     `undefined`/absent — proving the real-value threading doesn't fabricate a nonzero value for the
     already-established real-zero fixture.
  - **Deliberately not attempted**: an e2e that wins a fight, claims the loot via `takeTreasureItems()`,
    opens the shop, and reads the displayed sell price off the composed screen. Per this project's
    "split it" convention (avoid RNG-dependent full-fight + multi-screen e2e chains), that full chain is
    instead proven piecewise: the engine unit tests above cover `sellStack`'s pure arithmetic
    deterministically; a shop-screen e2e can be added later purely as an integration nice-to-have, not
    required to prove the wiring is correct.

---

## Part 2 — Lead (3) resolved: "party picks up a plain item" is already shipped, not a new slice

The task brief asked whether M29.S1's carried-loot slice exposed a narrower, independently-shippable
"party picks up a plain (non-magic) real item and it appears in their own inventory" goal, separate from
the full magic-bonus schema change. Tracing the live claim flow in `apps/web/src/ui/combat.ts` found
this is **not a gap to fill — it already works today, and has since before M29**:

- `combat.ts:978-982` `takeTreasureItems()`:
  ```ts
  function takeTreasureItems(): void {
    if (!state || !state.haul || state.itemsTaken || state.haul.items.length === 0) return;
    const who = ...;
    if (who) giveItemsToMember(who, state.haul.items);
  }
  ```
- `giveItemsToMember` (`party.ts:847-858`) is generic over any `TreasureItem[]` — it was built for the
  pre-M29 synthetic `DROP_TABLE` loot and never needed a single change when M29.S1 swapped in real
  carried-item loot, because `TreasureItem`'s shape (`{baseTypeId, name, count}`) was already exactly
  what it expects. The moment M29.S1 shipped a real BLACK ROBE MAGE Vial ×9 into `state.haul.items`, the
  very next `Items → Take` keypress already puts real Vials into the leader's real, persisted
  `InventoryEntry[]` (`inventoryStore`, `localStorage`-backed) — indistinguishable in every way from a
  shop-bought item, including being sellable back (per Part 1) and being visible in the Inventory screen
  (`apps/web/src/ui/inventory.ts`).

**Conclusion: there is no narrower slice to scope here — the "reaches the player's own inventory" leg of
the general item-instance goal was solved generically, for any `TreasureItem`, before M23 even started
this series.** The real, still-standing blocker is specifically the **enchanted** (`+N` intact) case,
exactly as M19/M24/M26/M27/M29 all independently found — this round adds no new information to that
finding beyond confirming, concretely, that the "plain item" half of it was never actually a gap. Future
audits should not re-open this half of the question.

---

## Part 3 — Investigated and rejected: the other three `MonsterItem` fields

### (a) `.weight` — rejected: no consumer expects a per-instance override, and the byte's own unit is suspect

`InventoryEntry` has no per-instance weight field, and none is expected anywhere: encumbrance is fully
wired today (`items/encumbrance.ts`'s `encumbrance()`, fed by `inventoryWeightTenths`
(`items/inventory.ts:163-167`), consumed all the way to `apps/web/src/ui/party.ts`'s
`moveRateForMember` and `combat.ts:323`'s `realMove`) — but entirely from `BASE_ITEMS[id].weightTenths`,
a **per-base-type catalogue constant** (e.g. Leather Armor = 150 tenths = 15 lb,
`items/baseItems.ts:74`), not a per-instance byte. There is no architectural slot for "this specific
carried instance weighs something different from its own base type" anywhere in the inventory/
encumbrance chain. Worse: the real decoded `.weight` bytes for the very same Leather Armor instances
above are all **`1`** (not `150`) — a scale mismatch strongly suggesting (inferred, not proven against
COAB source directly for this exact 63-byte struct) the same "coins, 10 coins = 1 lb" convention
documented for the sibling DoK 17-byte item record (`loaders/item.ts:105`, `encumbrance (coins; 10
coins = 1 lb)`) applies here too — `1` coin = 0.1 lb, wildly divergent from a real leather armor's
15 lb, and inconsistent with `weightTenths`'s own unit ("tenths of a pound," `baseItems.ts:50`). Wiring
this field today would either silently double the wrong unit into an already-correct number or require
first resolving a genuine, currently-UNKNOWN unit-conversion question — not a one-hop join. **Rejected.**

### (b) `.readied` — rejected: a real, clean boolean field with no natural semantic slot for looted gear

Confirmed this round: `readied` is `0x00`/`0x80` on **every one of the 140 real records**, a genuinely
clean, fully-populated boolean (not noise) — and it correlates sensibly with the corpus (every
nonzero-`value` item above is `readied=true`; every stackable consumable is `readied=false`). But there
is no faithful use for it in the loot-claim flow: Gold Box convention (and this engine's own
`giveItemsToMember`, `party.ts:853`) always drops looted gear into the pack **unreadied** — the player
must manually Ready it from the Inventory screen; a monster's own equip-state at time of death has no
established meaning for the *player's* copy of the item. Threading it into, say, "only readied items are
lootable" would be inventing a new game rule with no COAB citation backing it (`calcBattleExp`'s own
reading, already used by M26/M29, is that the **entire** carried-item list enters the pool, "readied or
not" — see `treasure.ts:30-35`'s doc comment, itself citing this). **Rejected as a wiring target this
round** — it's a real byte with no evidenced consumer, not a "needs extra state" case; flagged as an
open question below in case a future "which items actually got dropped vs. worn-and-destroyed" mechanic
ever needs it.

### (c) `.affects[3]` (per-item nested affects) — rejected: needs an equip-triggered dispatch that doesn't exist

`MonsterItem.affects` (`monsterSideTables.ts:144-145`, three affect-code bytes @0x3c-0x3e) would need an
"apply this item's own affect(s) while it is equipped" dispatch — a mechanism this engine has never
built (the existing `applyRegenAffect`/`applyHalfDamageAffect`/`applyConSavingBonus` family all attach a
*monster's own innate* affect once, at load time; none of them models "an item grants an affect while
worn, and it's removed on unequip"). This is the same order of magnitude as the general item-instance
subsystem's `magicBonus` gap, not a narrower slice of it — **rejected**, same reasoning class as M26/M27's
"needs a schema change + a consumer thread simultaneously" finding for enchanted items generally.

---

## Part 4 — Investigated and rejected (re-confirmed unchanged): the four remaining `SavingThrows` columns

Per the brief's instruction to check for a new consumer since M27 flagged these. Re-grepped the entire
combat surface this round:
```
packages/engine/src/combat/combat.ts:118-120 (the only mention anywhere in the engine):
  "the other four SavingThrows columns (paralyzePoisonDeath, petrifyPolymorph, rodStaffWand, breath)
   are decoded but have no consuming mechanic in either combat engine yet (no poison/
   petrification/rod-staff-wand/breath-weapon effect exists)"
```
A fresh grep of `combat/tactical.ts` and `combat/combat.ts` for `poison`/`petrif`/`paraly`/`breath`
(case-insensitive) returns **zero hits outside that one doc comment** — no partial poison-damage-over-
time tracker, no petrification-as-instant-defeat check, no rod/staff/wand-specific save distinct from
the generic spell save M27 already wired, no breath-weapon area-effect resolver exists anywhere in this
codebase to attach any of these four columns to. **Re-confirmed still blocked, unchanged from M27** — not
a "missing consumer field" the way `con_saving_bonus` was (M24→M28); it's a missing **mechanic**, in the
same rejected category as `owlbear_hug_check`'s follow-up (M29) — wiring any of these four would mean
inventing a poison/petrify/breath-weapon status-effect system from scratch, a multi-slice feature, not a
one-hop join. **Rejected, still bigger than an S-sized pick.**

---

## Part 5 — Investigated and rejected (re-confirmed unchanged): ECL `TREASURE` opcode

`packages/engine/src/ecl/opcodes.ts:76`: `0x27: { wordSet: 8, mnemonic: 'TREASURE' }` — named and
decoded (8 word-operands), but `ecl/vm.ts`'s `default:` branch (lines 603-608) still surfaces it as a
generic `{ type: 'unhandled', mnemonic, opcode, ins }` effect and skips it, unchanged since M27/M29's own
re-checks. Unlike this round's `.value` pick, implementing `TREASURE` for real requires first
**discovering what its 8 word-operands actually encode** (plausibly per-encounter scripted item ids/
quantities distinct from a monster's own carried-item table, but genuinely UNKNOWN — no COAB source in
`coab_extracted/` names an ECL-side treasure opcode's operand layout, since ECL is this project's own
Gen1 script format, not a COAB structure) — a research task before any wiring is possible, not a
join. **Rejected as this round's pick**, re-confirmed orthogonal and out of scope, same status as M29
left it.

---

## Open questions / unknowns

- **The exact unit of `ITEM_FIELD.weight` (0x37, u16) in the 63-byte monster-item record is UNKNOWN**,
  not proven either way this round — the "coins, 10 coins = 1 lb" analogy is borrowed from a sibling but
  distinct DoK 17-byte catalogue record (`loaders/item.ts:105`) and is **inferred**, not confirmed
  against a COAB struct for this specific 63-byte layout. Resolving it would need either a COAB
  `Item.weight`/`Item._weight` field citation (not located this round) or a cross-check against a real
  item whose in-game carry weight is independently documented (e.g. a PHB-listed weapon). Not required
  to justify rejecting `.weight` as this round's pick (the mismatch is stark enough either way), but
  worth resolving before ever attempting to wire it.
- **Whether `.value == 0` genuinely means "worthless" vs. "value not authored for this instance"** is
  inferred, not proven, from this round's observation that it correlates cleanly with `plus == 0` (every
  nonzero-value item also carries a nonzero `plus`) and with this codebase's own established "0 ⇒ no
  override" idiom (`conSpellSaveBonus`, M28). A COAB citation for how `_value == 0` is treated at the
  point of sale (does `ShopSellItem` special-case it, or does it just produce a 0 offer?) was not located
  this round — the proposed wiring (`value ?? itemPrice(id)`, treating 0 as "fall back to the catalogue
  price") is the more useful, non-regressive reading regardless, but flagged as inference.
- **Buy-side pricing (`buyPriceFromValue`, `pricing.ts:32-52`) remains completely unwired** — `shop.ts`'s
  `buyPrice`/`buyForLeader` still uses the synthetic `ITEM_PRICE` table for the shop's stock, and no
  "area shop-tier" (`SHOP_TIER`/`field_6DA`) concept exists anywhere in this engine's town/area model.
  This round deliberately scoped only the **sell** side (a monster-instance value flowing outward to a
  sale), which needs no new area-record concept; wiring the **buy** side would additionally need (a) a
  real intrinsic `value` on every `BASE_ITEMS` catalogue entry (a data-entry task, not just a join) and
  (b) a shop price-tier per town/area (a new concept this engine doesn't model at all yet) — correctly
  out of scope for an S-sized slice, flagged as a separate, larger follow-on.
- **`.readied`'s eventual use** (Part 3(b)) — if a future mechanic ever needs to distinguish "the monster
  was actively wielding this when it died" (e.g. a "sometimes worn gear is damaged/lost in the killing
  blow" flavor rule, or an AI-targeting nuance), the byte is there, real, and fully populated across the
  whole corpus; no such mechanic exists today, so this is speculative, not a lead to pursue.
- **The general item-instance subsystem** (`magicBonus`/`charges`/`cursed` reaching a real `+N` item at
  `computeThac0`) remains the one recurring structural blocker, now **six** independent audits deep
  (M19, M24, M26, M27, M29, and this round's Part 3(c)/Part 4 re-confirmations) — still worth its own
  dedicated multi-slice phase per M27's scoping, unaffected by this round's narrower `.value` pick.

## Implications for our engine

- **A "we already checked, it's blocked" finding can still hide an already-solved neighbor.** This
  round's Part 2 shows the item-instance subsystem's "does real loot reach the player's own inventory"
  question was never actually blocked — it was solved generically, for any `TreasureItem`, before this
  audit series began, and simply never stated as such because no prior audit traced the claim flow past
  `rollTreasure`. Worth a general lesson: when scoping a "narrower slice" of a blocked subsystem, trace
  the **full** call chain the slice would need, not just the piece that changed most recently — the
  already-solved legs are easy to miss precisely because they need no new code, and thus leave no trace
  in any prior audit's rejected-candidates table.
- **The `MON{n}ITM.DAX` side-table is now confirmed to have THREE independent, separately-shippable
  consumers** from the same decode-once source: the XP tally (`itemPluses`, M26, keyed on `.plus`), the
  loot table (`carriedItems`, M29, keyed on `.baseTypeId`/`.count`), and now the sell price
  (`carriedItems.value`, this round, keyed on `.value`) — all three reusing the identical already-fetched
  map. `.weight`, `.readied`, and `.affects` are the remaining fields on this record and are now each
  individually assessed and rejected (Part 3), closing out this particular side-table as a source of
  further S-sized picks absent a new consuming mechanic (encumbrance-override, equip-triggered-affects,
  or a "worn at death" rule) being built first.
- **Not every real, decoded, unconsumed byte is a viable pick — the deciding factor is whether a
  consumer already exists or is a one-hop addition to one that does.** `.value` cleared this bar because
  `sellStack`/`sellOffer` were already built, live, and tested (from an earlier, unrelated economy
  decompile pass, `decompile-ovr007-economy.md`, 2026-06-27) and simply never received real input.
  `.weight`/`.readied`/`.affects` and the four `SavingThrows` columns all fail it for the same underlying
  reason M29 identified for `owlbear_hug_check`: no existing mechanism is shaped to receive them without
  first building a new one.
