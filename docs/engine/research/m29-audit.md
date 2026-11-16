# M29 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s M24–M28 "Done" entries and
> `docs/engine/research/m24-audit.md` through `m28-audit.md` in full, per the task brief. The brief
> flagged two leads in priority order: (1) investigate `owlbear_hug_check` (COAB affect `0x60`) **fresh
> and in full depth** — M24's original one-line rejection ("adds a *second, temporary* affect for a
> scheduled follow-up attack next round — a small state machine, not a flat number") was a passing note,
> never actually traced through the COAB source, and never checked against this project's own existing
> scheduling/duration primitives for a possible precedent; (2) if it doesn't pan out, scope the
> item-instance subsystem's smallest independently-shippable first slice, picking exactly ONE of
> {schema change, real instance source, consumer thread} per M27's own three-part characterization.
>
> **Lead (1) does not pan out** — traced in full below, with COAB file/line citations for both affect
> functions, an exhaustive search of every call site that could dispatch the follow-up (none found — a
> genuinely new, load-bearing unknown this round surfaces), a fresh real-bytes probe proving the
> follow-up's own affect id never appears in any static monster record (unlike every M23–M28 pick), and
> an explicit check of this engine's three existing scheduling-adjacent primitives (`regenPerRound`'s
> per-round tick, `InflictableStatus`'s duration timers, `attacksPerRound`'s fixed fractional-attack
> schedule) — none of which fits the shape COAB's mechanism actually needs. This round's investigation is
> materially deeper than M24's, and the verdict is the same, now with much stronger grounding: **rejected**,
> genuinely bigger than an S-sized slice, with no existing precedent to lean on (unlike M28's
> `con_saving_bonus`, where a sibling table *did* de-risk the one new piece).
>
> **Lead (2) is this round's pick.** Re-reading M26/M27's rejection of "replace `treasure.ts`'s synthetic
> `DROP_TABLE` with a real `MonsterItem`-sourced join" found that their "needs a schema change + a real
> instance source + a consumer thread simultaneously" characterization is correct for the **general** goal
> (a real *enchanted* item entering a player's hands with its `+N` intact) but is **not** correct for a
> narrower, still-real, still-valuable goal this round separates out for the first time: **ordinary
> (non-magical, base-type-only) combat loot sourced from a monster's actual carried inventory instead of a
> random synthetic table.** That narrower goal needs **zero schema change** — `TreasureItem`/
> `InventoryEntry` already carry exactly `{baseTypeId, name, count}`, which is all a plain, unenchanted
> real item needs — so this slice ships **both** the "real instance source" and "consumer thread" legs
> together (they turn out to be cheap and already-coupled here), while explicitly, honestly deferring the
> **schema** leg (`InventoryEntry`'s missing `magicBonus`/`charges`/`cursed` fields, still needed before a
> real `+N` item can reach `computeThac0`) as a separate, larger follow-on phase, exactly as M27 scoped it.
> Nothing in this document has been implemented — this is read-only research, per the M29 task brief.

## Headline finding

`owlbear_hug_check`'s follow-up attack is not merely "a state machine" in the abstract (M24's framing) —
it is a **live-only runtime affect that never appears in any static monster byte** (independently
confirmed this round: real-bytes probe below), whose own **trigger dispatch cannot be located anywhere in
the COAB reference source**, and which needs **two** new engine primitives (a movement-restricting status
with no existing analog, and a scheduled/forced future-turn action with no existing analog) even under the
task brief's own suggested "resolve it immediately instead" simplification. It is rejected with much more
depth than M24's note, and for a stronger, more specific reason: not just "bigger," but genuinely
under-evidenced even in the reference oracle. The item-instance subsystem's smallest shippable slice is a
**real per-monster carried-item loot join** — real-bytes verified today at 19 of 140 carried-item records
(15 of 52 itemed monsters) resolving to a base-type already in this project's own catalogue, headlined by
CoK's own already-spawnable **BLACK ROBE MAGE** (id 38, area 1) carrying a real **Vial × 9**.

---

## Part 1 — `owlbear_hug_check` (COAB `0x60`) investigated in full: REJECTED

### (a) The "check" half — fires synchronously, off the very hit that triggers it, not "next round"

`AffectOwlbearHugAttackCheck` (`coab_extracted/engine/ovr014.cs:2520-2532`, registered
`ovr013.cs:1885`):
```csharp
internal static void AffectOwlbearHugAttackCheck(Effect arg_0, object param, Player player) // hugs
{
    if (gbl.attack_roll >= 18)
    {
        gbl.spell_target = player.actions.target;
        ovr025.DisplayPlayerStatusString(true, 12, "hugs " + gbl.spell_target.name, player);
        ovr024.add_affect(false, ovr033.GetPlayerIndex(gbl.spell_target), 0, Affects.clear_movement, gbl.spell_target);
        ovr013.CallAffectTable(Effect.Add, null, gbl.spell_target, Affects.clear_movement);
        ovr024.add_affect(true, ovr033.GetPlayerIndex(gbl.spell_target), 0, Affects.owlbear_hug_round_attack, player);
    }
}
```
This is swept via `calc_affect_effect(Affects.owlbear_hug_check, player)` inside `CheckType.Type_2`
(`ovr024.cs:157`). Tracing `CheckType.Type_2`'s **only** call site (`ovr024.cs`'s `CheckAffectsEffect` has
no other invoker of it) required following the dynamic cast `ovr024.CheckAffectsEffect(attacker,
(CheckType)attackIdx + 1)` at `ovr014.cs:833`, inside `AttackTarget01`'s per-attack-index melee loop
(`ovr014.cs:811-846`, the same routine that resolves every normal attack, `PC_CanHitTarget`, and damage).
`CheckType.Type_2 == 2` (enum values confirmed `ovr024.cs:6-32`), so `(CheckType)(attackIdx+1)` only
resolves to `Type_2` when `attackIdx == 1` — the attacker's **first** natural-weapon attack slot. So: the
"check" fires **in the same attack-resolution call that just landed the qualifying hit**, gated on
`gbl.attack_roll >= 18` (the same d20 that resolved the hit — no separate roll). On success it (1) inflicts
`clear_movement` on the **target** synchronously (via `CallAffectTable(Effect.Add, ...)`, not deferred) and
(2) creates a **new, dynamically-added `Affect` object** (`add_affect`, `ovr024.cs:609-615`) of type
`owlbear_hug_round_attack` on the **attacker**, `callAffectTable=true`, `affect_data` = the target's index.

### (b) The follow-up half is a live-only runtime object — real-bytes proof it is never authored data

`owlbear_hug_round_attack = 0x90` (`coab_extracted/Classes/Affect.cs:153`) is a **different** id from
`owlbear_hug_check = 0x60` (`Affect.cs:103`). Every M23–M28 pick to date wired a byte that is **present in
the static `MON{n}SPC.DAX` table** (`regen_3_hp`, `half_damage`, `con_saving_bonus.spell`, etc.) — this
round independently re-decoded every real `MON{n}SPC.DAX` affect record across CoK areas 1–3 + DoK area 1
(a from-scratch Python container/RLE decoder, transcribed from `tools/dax_decode.py`'s own header, not the
TypeScript loader) and confirmed:

| Check | Result |
|---|---|
| Max affect-type byte observed across 4 real files | `0x6a` |
| `0x90` (`owlbear_hug_round_attack`) present anywhere in real static data | **No** — confirmed absent |
| Records carrying `0x60` (`owlbear_hug_check`) | 37 |
| Records carrying `0x61` (`con_saving_bonus`) | 14 |
| Records carrying **both** `0x60` and `0x61` | 14 (i.e. `con_saving_bonus` carriers are a **strict subset** of `owlbear_hug_check` carriers — M28's "co-occurs on every real carrier" was accurate only in that direction; 23 of the 37 `0x60` carriers do **not** carry `0x61`) |

`owlbear_hug_round_attack` cannot be decoded from any file — it is **synthesized entirely at runtime** by
`add_affect`, with no byte anywhere to point to as "this is what makes it fire" (`add_affect`'s own body,
`ovr024.cs:609-615`, just appends a fresh `Affect` object to `player.affects`, no file I/O). This is a
qualitatively different shape from every prior pick in the affect family: those all had a **decoded value
that already exists** with only a missing *consumer*; this one's "value" doesn't exist until the engine's
own runtime logic invents it — the join-a-real-byte template does not apply to it at all.

### (c) The follow-up's trigger dispatch is UNLOCATED — not present anywhere in the extracted COAB source

`AffectOwlbearHugRoundAttack` (`ovr014.cs:2482-2517`) is registered in the affect jump-table
(`ovr013.cs:1933`: `affect_table.Add(Affects.owlbear_hug_round_attack, ovr014.AffectOwlbearHugRoundAttack)`)
and, when invoked, does the actual follow-up: sets `attack1_AttacksLeft=1, attack1_DiceCount=2,
attack1_DiceSize=8` on the attacker and calls `AttackTarget(null, 2, gbl.spell_target, player)` — an
immediate 2d8 bite/hug swing against the stored target (still resolved through the ordinary
`PC_CanHitTarget`/to-hit loop inside `AttackTarget01`, not unconditional damage), then self-removes (and
removes the target's `clear_movement`) if combat ended or the target fled. **But its trigger call site —
whatever invokes `CallAffectTable`/`calc_affect_effect(Affects.owlbear_hug_round_attack, player)` to fire it
in the first place — could not be found anywhere in `coab_extracted/`.** This round:
- Read `ovr024.cs`'s `CheckAffectsEffect` switch **in full** (all 24 `CheckType` cases,
  `ovr024.cs:138-370`) — `owlbear_hug_round_attack` appears in **none** of them.
- Grepped every file in `coab_extracted/` for `owlbear` (case-insensitive) — 13 hits total, all already
  accounted for above: the two affect functions' own bodies, the two hardcoded cleanup arrays
  (`RemoveCombatAffects` `ovr024.cs:663-683`, `RemoveAttackersAffects` `ovr024.cs:696-699`), and one
  teleport-escape cleanup check (`SpellDimensionDoor`, `ovr023.cs:2467-2476`, which only *removes* the
  affect if its grabbed victim teleports away — a cleanup, not the firing trigger).
- Grepped for every `CallAffectTable(`/`calc_affect_effect(` call site in the engine (18 and ~40
  respectively) — none names `owlbear_hug_round_attack` directly, and none is a generic "sweep this
  player's own `callAffectTable=true` affects at the start of its turn" dispatcher (no such generic loop
  exists anywhere in the extracted source; every `CheckType` case is a fixed, named list of specific
  affects).
- Checked `DoPlayerCombatTurn`/`PlayerQuickFight`/`combat_menu` (`ovr009.cs`, `ovr010.cs` — the per-turn
  and monster-AI-decision routines) for any owlbear-specific branch or a generic "do I have a pending
  affect that overrides my normal action?" check — none exists.

**Conclusion: the actual "next time this owlbear acts, it bites again" dispatch is not decompiled in this
project's COAB source.** Either it lives in an overlay/segment `coab_extracted/` doesn't cover, or the
extraction is incomplete for this specific, rare mechanic. This is a genuine, newly-surfaced unknown (see
Open Questions) — pursuing this candidate today would mean either inventing the missing half of the
mechanism from scratch (an invention, not a decompile-grounded implementation, contrary to this project's
own "ground every claim" rule) or blocking on a COAB re-extraction / CoK-DoK-own-binary dynamic trace, the
same class of blocker this project's build-loop memory already tags as "genuinely blocked, needs a
DOSBox-X dynamic trace" (cf. the parked seg051 RNG / DQK ECL opcode table items).

### (d) Checked this engine's own scheduling/duration primitives for a precedent — none fit

Per the task brief's instruction, before rejecting, this round explicitly re-examined every
scheduling-adjacent primitive already built in `packages/engine/src/combat/tactical.ts`:

| Existing primitive | Shape | Why it doesn't cover `owlbear_hug_round_attack` |
|---|---|---|
| `regenPerRound` / `tickRegen()` (`tactical.ts:807-819`) | Flat per-round **HP delta on the combatant itself**, applied unconditionally every round it's active | No target reference, no "do a specific action" semantics, no one-shot/self-consuming behavior — a pure passive number, the opposite shape from "grab a *specific* other combatant and guarantee a follow-up swing at *them* next time I act." |
| `InflictableStatus` / `inflictStatus()`/`tickStatuses()` (`tactical.ts:117, 788-839`) | A **status flag + round-count timer on the target**, decremented at `beginRound()`, gates whether/how the *target* acts (`asleep`/`held` skip the whole turn; `feared` forces flight; `slowed`/`hasted` adjust attack count) | This is the closest existing precedent for COAB's `clear_movement` (a status inflicted on the *victim*) — but every existing status either skips the target's whole turn or adjusts a global multiplier; none models "can still act, just can't move," which is `clear_movement`'s specific semantic (COAB assigns it `minutes=0`, i.e. it doesn't even use this engine's round-based decay path at all — COAB's own duration model for it is real-time "minutes," ticked by a wholly different clock, `ovr021.cs`'s world-clock stepper, not the combat-round timer `inflictStatus` uses). Even reusing this primitive for the *target*-side status would need a new `InflictableStatus` variant with unclear decay semantics. |
| `attacksPerRound` / `attacksThisRound()` (`tactical.ts:136, 994-1005`) | A **fixed, pre-known** integer (or COAB fractional-attack pattern) attacks per round, unconditional on any prior event | Static and known before the round starts — the opposite of "a *conditional*, one-shot, event-triggered bonus swing scheduled onto a *specific future* turn against a *specific* target." |

**None of the three existing primitives is the "exact primitive needed" the task brief asked to check for**
— unlike M28's `con_saving_bonus`, where an already-shipped sibling table (`conPoisonSaveBonus`)
substantially de-risked the one new piece, no sibling here de-risks either half of this mechanism. This is
the concrete, checked-not-assumed reason this candidate is bigger than the M23–M28 template, not a repeat
of M24's unexamined note.

### (e) Even the brief's own suggested reframing ("resolve it as a single extra attack, immediately") needs new primitives

The task brief specifically asked whether the follow-up could be re-expressed as "a monster with this
affect that hits gets a free bonus attack right then" — fitting the existing per-round attack loop. Checked
directly against `tactical.ts`'s `resolveHit()` (`tactical.ts:1107-`, raw roll available locally at
`const roll = rng.die(20)`, line 1109) and the attack loop (`attacksThisRound`, `i === 0` already
distinguishes "first attack this round," `tactical.ts:1218-1223`) — so the **roll-gate check itself**
(`roll >= 18` on the first swing) is technically reachable at an existing choke point. But:
1. This is **not what COAB's own code does.** COAB explicitly defers to a separate, later-invoked `Affect`
   object rather than resolving the bite inline in the same function call — collapsing it to "same round"
   would be a materially different, un-evidenced mechanic wearing the same name, not a faithful
   simplification (this project's own convention, applied consistently by M24's `half_damage` "unconditional,
   not narrowed" note and M25's "trust the game's own code" precedent, cuts the other way here: don't invent
   a different mechanic under a real name).
2. Even granting the simplification, it still needs a **new** movement-restricting status (per (d) above,
   `clear_movement` has no existing analog — this engine's status vocabulary is `asleep | held | feared |
   slowed | hasted`, none of which is "can't move, can still fight") and a **new**, distinct bonus-attack
   resolution (fixed 2d8 dice, independent of the monster's own stat-block attack) — two genuinely new
   pieces of surface, not a one-line arithmetic addition at an existing choke point.

### Verdict: REJECTED — bigger than any M23–M28 pick, and for a stronger reason than M24 gave

Not merely "a state machine" in the abstract. Concretely: (1) its own trigger dispatch is unlocated even in
the reference decompile (a real unknown, not an assumption), (2) its data never exists in any static byte
this project's loaders read (breaking the "decode a real byte" template at the root, not just the
"needs extra state" level), and (3) none of this engine's three existing scheduling/duration primitives —
checked explicitly, not assumed — covers either half of the mechanism, even under the brief's own suggested
simplification. Recommend **parking this permanently** alongside the other genuinely-blocked items
(`seg051` RNG, DQK ECL opcode table) rather than re-flagging it for a future round — unlike `con_saving_bonus`
(which M24 flagged, correctly, as "revisit once monster saves exist" and M28 cashed in), there is no
comparably concrete unblocking condition here short of a COAB re-extraction or a CoK/DoK-own-binary dynamic
trace targeting this exact rare special.

---

## Part 2 — RECOMMENDED: real monster-carried-item loot (`MON{n}ITM.DAX` → `treasure.ts`, ordinary items only)

### (a) Why this is smaller than M26/M27 assessed the item-instance subsystem to be

M26 and M27 (independently, twice) rejected "replace `treasure.ts`'s synthetic `DROP_TABLE` with a real
`MonsterItem`-sourced join" as needing "a schema change + a real instance source + a consumer thread
simultaneously, none of which alone is a one-line join" (`m27-audit.md`, "Option A re-confirmed blocked").
That assessment is correct for the **general** goal — a real *enchanted* (`+N`) item entering a player's
hands with its bonus intact needs all three (an `InventoryEntry.magicBonus` field, a real source, and
`computeThac0`'s already-existing but unfed `magicBonus` parameter). This round separates out a narrower
goal neither prior audit isolated: **plain, unenchanted loot sourced from what a defeated monster actually
carries, instead of a per-foe random roll over five hardcoded ids.** Checked the exact schema needed:

- `packages/engine/src/items/treasure.ts`'s `TreasureItem` (lines 13-17): `{ baseTypeId, name, count }` —
  **already exactly what a real, non-magical item needs.**
- `packages/engine/src/items/inventory.ts`'s `InventoryEntry` (lines 14-23): `{ name, baseTypeId, count,
  equipped }` — likewise already sufficient; `giveItemsToMember` (`apps/web/src/ui/party.ts:847-858`)
  already accepts a `TreasureItem[]` and merges same-`baseTypeId` unequipped stacks (lines 850-853) with no
  changes needed.

**Zero schema change is required** for this narrower goal — the "real instance source" and "consumer
thread" legs are cheap and already coupled here (the consumer, `rollTreasure`'s item-selection logic, is a
~15-line function), so this slice ships both together while explicitly, honestly deferring the schema leg
(`magicBonus`/`charges`/`cursed` on `InventoryEntry`) exactly as M27 scoped it — a real magic item still
cannot reach a player's hands with its bonus after this slice; only its **base type** does.

### (b) Real-bytes probe (this round, independent decoder — the same DAX/RLE transcription used in Part 1)

Decoded every real `MON{n}ITM.DAX` (63-byte carried-item records, `ITEM_FIELD.type @0x2e`,
`ITEM_FIELD.count @0x39`) across CoK areas 1–3 + DoK area 1, cross-referenced monster names via the
matching `MON{n}CHA.DAX`, and checked each carried item's `baseTypeId` against this project's own
`BASE_ITEMS` catalogue (`packages/engine/src/items/baseItems.ts`):

| Coverage | Count |
|---|---|
| Total real carried-item records (4 files) | 140 |
| Records whose `baseTypeId` resolves to a known `BASE_ITEMS` entry | **19** |
| Itemed monsters with ≥ 1 resolvable item | **15 of 52** |

Every resolving record, with monster name (decoded from the matching `MON{n}CHA.DAX`, `readName`'s own
offset convention, `monster.ts:68-69,292-301`):

| Game/area | id | name | resolved item(s) (baseTypeId → name, plus, count) |
|---|---|---|---|
| CoK area1 | 38 | **BLACK ROBE MAGE** | `5 Vial`, plus 0, count **9** |
| CoK area1 | 41 | CLERIC | `8 Arrow`, plus 0, count 0 (→ 1) |
| CoK area1 | 42 | EVIL CURATE | `8 Arrow`, plus 0, count 0 (→ 1) |
| CoK area2 | 39 | THAUMATURGIST | `5 Vial`, plus 0, count 9 |
| CoK area2 | 40 | ENCHANTER | `5 Vial`, plus 0, count 4 |
| CoK area2 | 42 | EVIL CURATE | `8 Arrow`, plus 0, count 0 (→ 1) |
| CoK area2 | 52 | ELVISH CURATE | `8 Arrow`, plus 0, count 0 (→ 1) |
| CoK area3 | 40 | ENCHANTER | `5 Vial`, plus 0, count 4 |
| DoK area1 | 49 | TANAR | `8 Arrow`, plus 4, count 0 (→ 1) |
| DoK area1 | 66 | BLACK MAGE | `15 Leather Armor` (plus 1) + `5 Vial` ×8 |
| DoK area1 | 67 | BLACK WIZARD | `15 Leather Armor` (plus 1) + `5 Vial` ×16 |
| DoK area1 | 68 | HIGH WIZARD | `15 Leather Armor` (plus 1) + `5 Vial` (plus 3) ×4 |
| DoK area1 | 69 | ROGUE MAGE HIGH | `15 Leather Armor` (plus 2) + `5 Vial` (plus 3) ×4 |
| DoK area1 | 70 | PATRIARCH | `8 Arrow`, plus 1, count 0 (→ 1) |
| DoK area1 | 71 | HIGH PRIEST | `8 Arrow`, plus 1, count 0 (→ 1) |

Thematically clean: mages/curates/wizards carry Vials (potions) and, in DoK, enchanted Leather Armor — real,
sane, non-noise data, the same bar M23–M28's probes all used. **`count == 0` is read as "1 unstacked
instance"** for equippable gear (every weapon/armor-type hit above has `count 0`, while the genuinely
stackable consumable — Vial — always has a real nonzero count, 4/8/9/16) — this is not a new convention
invented for this slice; it is the **exact existing rule** `inventoryFromIds` already uses
(`items/inventory.ts:41`, `Math.max(1, count ?? 1)`), re-applied here.

**CoK area 1's BLACK ROBE MAGE (id 38) is the strongest single proof target**: it is in the one file
(`Champions of Krynn/MON1CHA.DAX`/`MON1ITM.DAX`) the live CoK explorer already loads unconditionally, it is
a **known-good fixture** already used as a real-bytes cross-check by a prior audit (M27's saving-throw probe
independently verified id 38's stored saves match `addnd1e/combatTables.ts`'s `SAVES.magicUser` row
verbatim — `m27-audit.md` §b, point 2), and it carries a single, clean, fully-resolvable item (`Vial ×9`) —
no partial/mixed-resolution complexity needed for the primary e2e case.

**Honest limitation, stated plainly**: 121 of 140 real carried-item records (≈ 86%) use `baseTypeId` values
outside this project's own catalogue (mostly ids in the 1, 4, 17–37, 50, 59, 66–70 range — almost certainly
real COAB `ItemType` enum values this project just hasn't pinned names/stats for yet, per `baseItems.ts`'s
own header: only ids 5–15 are "HIGH confidence, from the research doc," everything else here is engine-
internal ≥ 64 for specials CoK stores as base-type 0). This slice does **not** expand `BASE_ITEMS`'s
coverage — it only makes loot real wherever the *existing* catalogue already reaches, which is a genuine,
if partial, improvement (self-contained, additive, no regression), with expanding the catalogue flagged as
a natural, separate follow-on (see Open Questions).

### (c) Exact live call sites to wire

1. **`packages/engine/src/loaders/monsterSideTables.ts`** — add a sibling join function next to
   `applyItemPluses` (which already exists, reusing the exact same already-decoded
   `Map<number, MonsterItem[]>` from `decodeMonsterItmArchive`), mirroring its "decode dumb, let the
   consumer filter" layering (`applyItemPluses` stores the **full**, unfiltered `plus` array and leaves
   `plus > 0` filtering to `calcBattleExp`; this function should do the same — store every carried item's
   `{baseTypeId, count}` unfiltered, and leave "does this resolve to a known catalogue entry" filtering to
   the consumer, `rollTreasure`):
   ```ts
   export interface CarriedLoot { baseTypeId: number; count: number }

   export function applyCarriedItems(records: MonsterRecord[], itm: Map<number, MonsterItem[]>): MonsterRecord[] {
     return records.map((r) => {
       const items = itm.get(r.blockId);
       return items?.length
         ? { ...r, carriedItems: items.map((i) => ({ baseTypeId: i.baseTypeId, count: i.count })) }
         : r;
     });
   }
   ```
2. **`packages/engine/src/loaders/monster.ts`** — add `carriedItems?: CarriedLoot[]` to `MonsterRecord`,
   right next to `itemPluses` (line 241), same "populated after the `MON{n}ITM.DAX` join, undefined for the
   common case (no carried items at all, or the file wasn't fetched)" doc-comment convention M26 used.
3. **`packages/engine/src/combat/combat.ts`** — add `carriedItems?: CarriedLoot[]` to `Combatant` (next to
   `itemPluses`, line 100, same doc-comment shape: *"Every carried item's base-type id + count, unfiltered
   — for the combat-end loot roll (`rollTreasure`), which decides which resolve to a real catalogue entry.
   Undefined ⇒ no carried items (the common case; party figures never have this)."*); thread it through
   `monsterCombatant()`'s inline parameter type (line 297, next to `itemPluses?: number[]`) and
   `carriedItems: mon.carriedItems,` in its return object (line 318, next to `itemPluses: mon.itemPluses`)
   — a pure pass-through, zero new logic, identical shape to `itemPluses`'s own M26 wiring.
4. **`packages/engine/src/items/treasure.ts`** — extend `TreasureFoe` (lines 24-27) with
   `carriedItems?: { baseTypeId: number; count: number }[]`, and change the per-foe item-selection loop
   (lines 52-58) so a foe with ≥ 1 real, catalogue-resolvable carried item uses those (all of them,
   unconditionally — matching COAB's own `calc_battle_exp` reading, already cited by M26, that a defeated
   foe's **entire** carried-item list enters the loot pool, `readied` or not) instead of the synthetic
   1-in-3 `DROP_TABLE` roll for that foe; a foe with no real data, or whose real items are all
   unresolvable, keeps today's synthetic roll exactly unchanged:
   ```ts
   for (const foe of enemies) {
     const real = (foe.carriedItems ?? [])
       .filter((it) => baseItem(it.baseTypeId))
       .map((it) => ({ baseTypeId: it.baseTypeId, name: baseItem(it.baseTypeId)!.name, count: Math.max(1, it.count) }));
     if (real.length > 0) { items.push(...real); continue; }
     if (rng.die(3) === 1) { /* existing synthetic DROP_TABLE roll, unchanged */ }
   }
   ```
   (Exact placement/refactor of the existing `for` loop at lines 53-58 — the `if (rng.die(3) === 1)` body is
   copied verbatim, not altered.) **No existing `treasure.test.ts` case needs updating** — every existing
   test's fixture (`band`, line 5) only ever sets `{ xp }`, never `carriedItems`, so this change is purely
   additive for every currently-tested path.
5. **`apps/web/src/ui/explore.ts`** — **zero new fetch.** `itmBytes`/`decodeMonsterItmArchive(itmBytes)` is
   already fetched and decoded at line 1541 for M26.S1's `applyItemPluses` join. Hoist it to a local so both
   joins share one decode, and add the new join right after:
   ```ts
   const itm = decodeMonsterItmArchive(itmBytes);
   monRecords = applyItemPluses(monRecords, itm);
   monRecords = applyCarriedItems(monRecords, itm);
   ```
   This candidate needs **strictly less new plumbing than M26.S1** — no new `gameData.ts` field, no new
   asset fetch, reuses the identical already-fetched/already-decoded map two ways.
6. **`apps/web/src/ui/combat.ts`** — the one behavioral call site, `finalize()` line 689:
   ```ts
   const haul = rollTreasure(foes.map((c) => ({ xp: c.xp, carriedItems: c.carriedItems })), state.seed);
   ```
   (was `foes.map((c) => ({ xp: c.xp }))`). One new e2e seam next to `itemPlusesOf` (line 1189):
   ```ts
   carriedItemsOf: (id: string) => state?.combatants.find((c) => c.id === id)?.carriedItems ?? null,
   ```

### (d) Why it needs no new state-tracking machinery, and no schema change

A **flat, static, per-monster array**, set once at dungeon load (the same moment `itemPluses` is joined),
read exactly once at battle end (`finalize()`), with no duration, no counter, no per-round or per-hit logic,
and no interaction with any other system — the same "single flat value, no extra state" bar every M23-M28
pick cleared. Unlike the general item-instance goal M26/M27 correctly declined, this slice touches **no**
schema (`InventoryEntry`/`TreasureItem` are already sufficient) and needs **no** ECL `TREASURE`-opcode
interpreter (that remains unbuilt and out of scope, unaffected either way) — it is strictly narrower than
what M26/M27 were evaluating, which is exactly why it clears the bar those two audits correctly found the
general goal fails.

### (e) Size: S

Comparable to M26.S1 in shape (new loader join function + one `MonsterRecord`/`Combatant` field +
`explore.ts` join + one `combat.ts` call-site edit + one e2e seam) but **smaller in the plumbing dimension**
— M26.S1 needed a new `gameData.ts` field (`itmPath`) and a new fetch; this slice reuses that exact fetch
and decode unconditionally, adding only the second join call. The one piece of genuine new logic is the
~10-line filter/fallback inside `rollTreasure` — small, pure, and unit-testable without any RNG dependency
for the "real data present" branch (only the existing synthetic fallback branch remains seeded-RNG-based,
unchanged from today).

---

## Proof plan

- **Engine unit tests** (deterministic; real bytes where possible; "split it" — no RNG-resolved fight
  needed to prove the plumbing or the new arithmetic):
  1. `applyCarriedItems` synthetic case (mirrors `applyItemPluses`'s existing test shape exactly, in
     `monsterSideTables.test.ts`): a fabricated `itm` map sets `carriedItems` to the full unfiltered
     `{baseTypeId, count}` array (including ids that won't resolve in `BASE_ITEMS` — proving this join layer
     does **not** filter, mirroring `applyItemPluses`'s "store everything, let the consumer filter" design);
     a monster absent from the map is left unchanged (`undefined`).
  2. A **real-bytes join** case: decode the real `Champions of Krynn/MON1CHA.DAX` + `MON1ITM.DAX`, assert
     id 38 (BLACK ROBE MAGE) joins to `carriedItems` containing `{baseTypeId: 5, count: 9}` (its real Vial
     stack) alongside `{baseTypeId: 4, count: 1}` (its real, currently-unresolvable second item, `count 0`
     → stored as decoded, filtering happens later) — and RED DRAGON (id 21, the same id M27's own audit
     already golden-tested for `.savingThrows`, confirmed absent from `MON1ITM.DAX`'s keys entirely) joins
     to `undefined` — a clean real-data negative control reusing an already-established fixture id.
  3. `monsterCombatant()` pass-through test (`combat.test.ts`, next to the existing `itemPluses`
     pass-through pair): a synthetic `MonsterRecord`-shaped input with `carriedItems: [{baseTypeId: 5,
     count: 9}]` produces the identical array on `Combatant.carriedItems`; `undefined` stays `undefined`.
     Add one real-bytes sibling: `monsterCombatant(by('BLACK ROBE MAGE'), 'e0').carriedItems` (via the real
     MON1CHA/MON1ITM join) contains `{baseTypeId: 5, count: 9}`.
  4. `treasure.test.ts` — the new consumer-side logic, no existing test touched:
     - `rollTreasure([{ xp: 0, carriedItems: [{ baseTypeId: 5, count: 9 }] }], anySeed).items` equals
       `[{ baseTypeId: 5, name: 'Vial', count: 9 }]` **for every seed tried** (0–20) — proving the real-item
       branch is deterministic (no RNG dependency once real data is present), unlike the synthetic fallback.
     - A foe whose `carriedItems` are all unresolvable (e.g. `[{ baseTypeId: 19, count: 1 }]`, GOBLIN id 9's
       own real, currently-unmapped item id) falls back to the **existing** synthetic 1-in-3 `DROP_TABLE`
       roll, proving graceful degrade — same statistical shape as a foe with `carriedItems: undefined`.
     - A mixed case (`[{ baseTypeId: 5, count: 3 }, { baseTypeId: 999, count: 1 }]`) yields only the
       resolvable Vial ×3, silently dropping the unmapped id (no crash, no synthetic fallback triggered once
       *any* real item resolves — matching COAB's "everything carried enters the pool" reading applied only
       to what this catalogue can currently represent).
     - Every pre-existing `treasure.test.ts` assertion (determinism, gold scaling, "drops are real catalogue
       items," empty-haul, `hasTreasure`) is re-run unchanged and still passes, since the `band` fixture
       never sets `carriedItems` — proving this slice is purely additive.
- **One e2e** (`?explore=1`, CoK — matching the M23–M28 shape, "split it": proves the join reaches the real
  `Combatant`, not a full RNG-resolved fight):
  1. `testFightMonster(38, seed)` (BLACK ROBE MAGE, CoK area1 block **38**) → `carriedItemsOf('e0')` should
     contain `{baseTypeId: 5, count: 9}` (today: `null`).
  2. **Same-real-data negative control, reusing an established id**: `testFightMonster(21, seed)` (RED
     DRAGON, the exact id M27's own e2e already spawns) → `carriedItemsOf('e0')` reads `null` — proving the
     join doesn't fabricate data for a monster genuinely absent from `MON1ITM.DAX`.
  - **Deliberately not attempted**: an e2e that wins a full fight and inspects `state.haul.items` after
    `finalize()`. Per this project's own recorded "split it" lesson (avoid RNG-dependent full-fight e2e),
    that behavior is instead proven deterministically by the engine unit test above
    (`rollTreasure([...real BLACK ROBE MAGE shape...])`), which needs no combat RNG at all for the
    real-item branch.

---

## Candidates investigated and rejected this round

### `owlbear_hug_check` (COAB `0x60`/`0x90`)

| Aspect | Finding |
|---|---|
| The "check" (first-hit gate) | Fires synchronously inside the same attack-resolution call that lands the qualifying hit (`CheckType.Type_2`, `attackIdx==1`) — not itself deferred. |
| The follow-up (`owlbear_hug_round_attack`, `0x90`) | A dynamically-created runtime `Affect`, never present in any real static byte (confirmed: max real affect-type byte observed = `0x6a`) — breaks the "decode a real byte" template at the root. |
| Trigger dispatch for the follow-up | **UNLOCATED** — exhaustively searched every `CheckType` case, every `CallAffectTable`/`calc_affect_effect` call site, and the monster-AI turn-decision routines; not found anywhere in `coab_extracted/`. |
| Existing engine precedent check | None of `regenPerRound` (flat per-round number), `InflictableStatus` (target-side gated-whole-turn-or-multiplier status), or `attacksPerRound` (fixed, pre-known count) covers "conditional, one-shot, targeted, forced-future-turn action." Explicitly checked per the brief, not assumed. |
| "Resolve immediately" reframing (brief's suggestion) | Technically reachable at `resolveHit()`'s existing choke point (the raw roll and "first attack" index are both locally available) — but would be an un-evidenced *different* mechanic under COAB's real name, and would still need a brand-new movement-restricting status with no existing analog. |
| **Verdict** | **Rejected — bigger than any M23–M28 pick.** Recommend permanent parking (no concrete future-unblocking condition identified, unlike `con_saving_bonus`'s "revisit once monster saves exist," which M24 flagged and M28 cashed in). |

### Item-instance subsystem — the general goal (re-confirmed still blocked, not re-derived from scratch)

| Candidate | Verdict |
|---|---|
| A real *enchanted* item (with `+N` intact) entering `InventoryEntry`/reaching `computeThac0` | **Still blocked**, unchanged from M26/M27's 4-for-4 finding — needs the `InventoryEntry` schema change (`magicBonus`/`charges`/`cursed` fields) in addition to a real source and a consumer thread. Not re-traced line-by-line this round (M27 already did that fresh); this round's contribution is narrowing the *scope* of what can ship without that schema change, not re-litigating why the general goal is blocked. |
| ECL `TREASURE` opcode (0x27) interpreter | Still unimplemented (`ecl/vm.ts:603-608`'s generic `default:` unhandled-effect branch, unchanged since M27's re-check) — orthogonal to this round's pick, which never touches ECL. |

---

## Open questions / unknowns

- **`owlbear_hug_round_attack`'s true trigger dispatch is a genuinely new, unresolved unknown** surfaced by
  this round's investigation (not previously flagged by name in M24's one-line note) — it may live in a
  COAB overlay/segment not present in `coab_extracted/`, or the extraction may simply be incomplete for
  this rare special. Resolving it would need either a fuller COAB re-extraction pass or a CoK/DoK-own-binary
  DOSBox-X dynamic trace targeting an actual owlbear-hug-class monster fight (the same tooling class already
  parked for the `seg051` RNG / DQK ECL opcode table blockers) — **not** attempted here, correctly out of
  scope for a static-research round.
- **`clear_movement`'s real decay semantics are unclear even in COAB's own model** — it's assigned
  `minutes=0` (this engine's round-timer convention for "innate/permanent"), yet COAB's own affect-decay
  sweep (`ovr021.cs`'s real-time "minutes" stepper) explicitly does nothing for `minutes==0` affects, and no
  other cleanup path removes it except combat-end/target-fled/teleport-escape. Whether it is meant to last
  "until combat ends" or has some other undiscovered decay rule is UNLOCATED; irrelevant unless this
  candidate is revisited.
- **This round's carried-item probe covers CoK areas 1-3 + DoK area 1 only** (the same scope every
  M23-M28 probe has used, matching what the live explorer currently loads) — a full multi-area sweep would
  likely surface more resolvable carried items as `BASE_ITEMS`'s own catalogue coverage grows over time;
  not needed to justify this slice.
- **Expanding `BASE_ITEMS`'s catalogue coverage** (currently only ids 5-15 pinned + a handful of
  engine-internal ≥64 specials) would directly increase how much of the real 140-record carried-item corpus
  this slice's loot join can actually surface (today: 19/140, ≈14%) — a natural, valuable, but separate
  follow-on task, not attempted here (it's a research/data-entry task against `hackdocs_extracted/ITEMS.TXT`
  and the COAB `ItemType` enum, not a wiring slice).
- **The general item-instance subsystem** (magic-bonus-carrying items reaching a player's hands) remains the
  one recurring structural blocker across now **five** independent audits (M19, M24, M26, M27, and this
  round's re-confirmation) — still worth its own dedicated multi-slice phase per M27's scoping, unaffected
  by this round's narrower pick.

## Implications for our engine

- **A useful new distinction for future audits**: "the item-instance subsystem is blocked" is true for the
  *general* goal (enchanted items with intact bonuses reaching player hands) but was never separately
  checked against *narrower* goals that reuse the exact same already-decoded source table
  (`MON{n}ITM.DAX`/`MonsterItem`) without needing the schema change that blocks the general goal. Worth
  checking, for any future "subsystem X is blocked" finding, whether a narrower slice of the same goal
  sidesteps the specific blocking piece — the same lesson M26 already drew for `itemPluses` (sourcing from
  monster-carried loot for a *tally* sidesteps the "items don't reach player inventory" blocker; this round
  shows the *loot table itself* can also partially sidestep it, for plain items specifically).
- **A candidate can fail the M23-M28 template at a deeper level than "needs extra state."** Every prior
  rejected-then-revisited candidate (`con_saving_bonus`) failed only on "the consumer field doesn't exist
  yet" — a prerequisite that later shipped. `owlbear_hug_check`'s follow-up fails at a more fundamental
  level: its data is **never decodable from any file**, and its own trigger is **not evidenced in the
  reference oracle at all**. Future audits should distinguish "blocked pending a future engine feature"
  (worth re-flagging, per M24→M28's `con_saving_bonus` precedent) from "blocked pending unresolved reverse-
  engineering of the source material itself" (worth parking, since no engine feature we build will ever
  unblock it — only new RE evidence would).
- The `MON{n}ITM.DAX` side-table (already decoded, already joined once for XP by M26) is now confirmed to
  have **two independent, separately-shippable consumers** — the XP tally (`itemPluses`, M26, keyed on
  `.plus`) and now the loot table (`carriedItems`, this round, keyed on `.baseTypeId`/`.count`) — from the
  same decode-once source, reusing the identical fetch. Future audits mining this table further should
  check for a third: `.value` (already decoded, `MonsterItem.value`, still unconsumed by anything) is a
  plausible next candidate for a future round, once a real gold/pricing consumer exists to feed it into
  (`town/pricing.ts`'s `buyPriceFromValue`, flagged blocked by M19/M25 for the *shop* side — worth checking
  whether a monster's own carried-item `.value` could feed a "sell this to town" mechanic, which does not
  currently exist either; not investigated this round, flagged only as a lead).
