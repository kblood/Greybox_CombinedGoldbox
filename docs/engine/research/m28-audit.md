# M28 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s M23–M27 "Done" entries and
> `docs/engine/research/m24-audit.md` through `m27-audit.md` in full, per the task brief. The brief
> flagged two leads in priority order: (1) re-verify `con_saving_bonus` (COAB affect `0x61`) end to
> end, now that M27 wired monster-side saving throws and retroactively de-risked the premise M24
> rejected it on; (2) if that doesn't pan out, scope the item-instance subsystem's first slice or
> sweep fresh ground. **Lead (1) pans out** — independently re-verified below from the COAB source,
> the loader, the tactical engine, and fresh real-bytes probes (a from-scratch Python DAX/RLE decoder,
> not the TypeScript loader, per this project's own cross-check convention), and it is genuinely
> S-sized. Lead (2) was therefore not needed; a light spot-check confirms the item-instance subsystem
> is unchanged since M27 (see "Candidates investigated and rejected"). Nothing in this document has
> been implemented — this is read-only research, per the M28 task brief.

## Headline finding: `con_saving_bonus` is buildable now, is **smaller** than M27 estimated, and its Con-band lookup table can lean almost entirely on an already-shipped sibling function

M24 rejected `con_saving_bonus` because "the tactical/abstract combat engines don't currently model
per-monster saving throws at all." M27 falsified that premise for CoK (`TacticalCombatant.save` is now
fed by `MonsterRecord.savingThrows.spell` for every real CoK monster). This round traced the actual
COAB mechanism (`ovr013.cs con_saving_bonus`, `sub_3BE42`) end to end and confirmed:

1. **It is a flat, per-monster, affect-gated additive term to the *roll*** (not a new state machine,
   not a duration, not a second save type) — the same "single flat number, no extra state" shape every
   M23–M27 pick has cleared.
2. **The Con-band table itself does not need to be invented from scratch.** A near-identical table
   (`conPoisonSaveBonus`, `packages/engine/src/ruleset/addnd1e/recalc.ts:81-88`) already ships, already
   tested, wired since **M17** for a *different* save column (`paralyzePoisonDeath`, party-side,
   applied once at chargen). The two tables agree on every band boundary in the 3–20 Con range
   (4–6→+1, 7–10→+2, 11–13→+3, 14–17→+4, 18–20→+5) — see "(b)" below for the one honest divergence
   above Con 20, which is why this candidate still needs its own **tiny** (six-line) function rather
   than literally calling the existing one, but it is a near-verbatim sibling, not new invention.
3. **Every real monster that carries the affect in the currently-loaded area files has Con = 10**
   (independently re-derived, see the real-bytes table below) — landing squarely in the 7–10→+2 band.
   This is a lower-stakes slice than it looked on paper: the "new logic" is a well-precedented small
   pure function, and the real data it will be exercised against is uniform and unsurprising (thematic
   for undead — GHOUL/SKELETON/ZOMBIE/GHAST/SKELETAL KNIGHT/SKELETAL DRAGON, all Con 10 in CoK).

**Verdict: RECOMMENDED for M28.S1.** Full wiring plan, real-bytes verification, and proof plan below.

---

## RECOMMENDED: wire `Affects.con_saving_bonus` (COAB `0x61`) into the monster spell-save roll

### (a) Exact mechanism, independently re-traced from the COAB source (file/line)

**The affect function itself** — `coab_extracted/engine/ovr013.cs:1207-1236`:
```csharp
internal static void con_saving_bonus(Effect arg_0, object param, Player player) /* sub_3BE42 */
{
    if (gbl.saveVerseType == SaveVerseType.Spell ||
        gbl.saveVerseType == SaveVerseType.RodStaffWand)
    {
        int save_bonus = 0;
        if (player.stats2.Con.full >= 4 && player.stats2.Con.full <= 6) save_bonus = 1;
        else if (player.stats2.Con.full >= 7 && player.stats2.Con.full <= 10) save_bonus = 2;
        else if (player.stats2.Con.full >= 11 && player.stats2.Con.full <= 13) save_bonus = 3;
        else if (player.stats2.Con.full >= 14 && player.stats2.Con.full <= 17) save_bonus = 4;
        else if (player.stats2.Con.full >= 18 && player.stats2.Con.full <= 20) save_bonus = 5;
        gbl.savingThrowRoll += save_bonus;
    }
}
```
Registered in the affect jump-table at `ovr013.cs:1886` (`affect_table.Add(Affects.con_saving_bonus,
ovr013.con_saving_bonus)`), swept by `calc_affect_effect(Affects.con_saving_bonus, player)` inside the
`case CheckType.SavingThrow:` block of `CheckAffectsEffect` — **independently re-confirmed this round**,
`coab_extracted/engine/ovr024.cs:281-298` (line 295 is the exact `con_saving_bonus` call, sitting among
`protection_from_evil`/`shield`/`prayer`/etc., all real-but-unmodeled party spell buffs, out of scope
here). `calc_affect_effect` (`ovr024.cs:99-134`) gates on `FindAffect(affect_type, player) == true` —
i.e. **the bonus only fires for a `player` (monster or PC) that actually carries this `Affect` in its
side-table**, exactly the same "has the affect at all" gate `regen_3_hp`/`half_damage` use.

**The roll-resolution call site** — `coab_extracted/engine/ovr024.cs:554-583`, `RollSavingThrow`
(independently re-read this round, one new detail vs. M27's transcription — a `Cheats.player_always_saves`
debug branch, irrelevant here):
```csharp
internal static bool RollSavingThrow(int saveBonus, SaveVerseType saveType, Player player) // do_saving_throw
{
    gbl.savingThrowMade = true;
    gbl.savingThrowRoll = roll_dice(20, 1);
    if (gbl.savingThrowRoll == 1) gbl.savingThrowMade = false;
    else if (gbl.savingThrowRoll == 20) gbl.savingThrowMade = true;
    else {
        gbl.savingThrowRoll += saveBonus + player.field_186;
        gbl.saveVerseType = saveType;
        CheckAffectsEffect(player, CheckType.SavingThrow);       // ← con_saving_bonus fires here
        gbl.savingThrowMade = gbl.savingThrowRoll >= player.saveVerse[(int)saveType];
    }
    return gbl.savingThrowMade;
}
```
So the mechanism is: **roll d20 → (nat-1 auto-fail / nat-20 auto-succeed, otherwise) → add any static
bonus → add `con_saving_bonus` if the target carries it and the save type is Spell/RodStaffWand →
compare to the stored target.** `RollSavingThrow` is called with `SaveVerseType.Spell` from the spell-
effect overlay at (re-verified this round) `ovr023.cs:1149,2376,2400,2447,2497,2575` — i.e. **exactly
the Fireball/Lightning-Bolt/Hold-Person/Fear/Slow-class effect functions** `docs/engine/research/
m27-audit.md` already traced to `TacticalCombatant.save`. `con_saving_bonus` is the *next* term in the
same formula M27 wired the base target for — this candidate is a strict, small addition on top, not a
parallel mechanism.

**The one place our engine currently resolves this roll** — `packages/engine/src/combat/tactical.ts:1316-1318`:
```ts
const rollsSave = spell.save !== 'none' && t.save !== undefined;
const saved = rollsSave ? rng.die(20) >= t.save! : false;
```
`t.save` (`TacticalCombatant.save`, doc-commented `tactical.ts:174-180`) is the target's raw stored
"spell" save byte (M27's wiring: `mon.savingThrows?.spell`, untouched by this candidate). No nat-1/
nat-20 special-casing exists in this engine's save roll at all (`Rng.die(20)`,
`packages/engine/src/util/rng.ts:20-24`, returns a flat uniform 1..20) — a **pre-existing** scope
simplification, not introduced or fixed by this slice; flagged honestly in "Open questions," same as
M24's `half_damage` unconditional-vs-magic-weapon note.

### (b) Real-bytes + COAB verification (fresh this round, independent decoder)

**Independent re-derivation.** A from-scratch Python DAX container + signed-byte-RLE decoder
(transcribed from `tools/dax_decode.py`'s own header comment, **not** imported from it or from the
TypeScript loader — the same independent-cross-check method M27 used) decoded every real
`MON{n}CHA.DAX`/`MON{n}SPC.DAX` pair and located every monster carrying affect `0x61`:

| Game/area | id | name | CON (raw byte @ ability-block +8) | conBonus (COAB bands) | spell save (offset 208-212, byte 4) |
|---|---|---|---|---|---|
| CoK area1 | 7 | GHOUL | 10 | **+2** | 17 |
| CoK area1 | 26 | SKELETON | 10 | **+2** | 17 |
| CoK area1 | 31 | ZOMBIE | 10 | **+2** | 17 |
| CoK area2 | 6 | GHAST | 10 | +2 | 16 |
| CoK area2 | 7 | GHOUL | 10 | +2 | 17 |
| CoK area2 | 31 | ZOMBIE | 10 | +2 | 17 |
| CoK area2 | 55 | SKELETAL KNIGHT | 10 | +2 | 14 |
| CoK area2 | 56 | SKELETAL DRAGON | 10 | +2 | 13 |
| CoK area3 | 6,7,31,55,58 | GHAST/GHOUL/ZOMBIE/SKELETAL KNIGHT/GHAST | 10 (all) | +2 (all) | 16/17/17/14/16 |
| DoK area1 | 24 | DREAD WOLF | 10 | +2 | *(DoK saves unlocated, gap B5 — N/A)* |

14 records total, 7 distinct monster names, all Con 10 — matches M24's original tally ("14 records / 8
monsters") almost exactly (the 1-name discrepancy is a counting artifact of GHAST/SKELETAL KNIGHT
recurring across areas under the same name; not a new finding, just re-confirmed). **Every single real
carrier lands in the 7–10→+2 band.** Two independent sanity checks on this decode:
1. **Ability-byte offset cross-check.** The same decoder, same offset formula (`raw[16 + slot*2]`,
   slot 4 = Con), independently reproduces `monster.test.ts`'s existing golden assertions for unrelated
   fields at the same byte stride — `HILL GIANT`/`OGRE` STR = 19, `GIANT RAT` INT = 3
   (`monster.test.ts:182-184`) — reproduced bit-for-bit by this round's from-scratch script before it
   was trusted for CON.
2. **Save-byte cross-check.** GOBLIN (id 9, CoK area1) and RED DRAGON (id 21) — the two monsters M27's
   audit already golden-tested — reproduce their known `spell` bytes (19 and 10) under the same
   decoder, and **neither carries affect `0x61`** (GOBLIN has zero affects at all; RED DRAGON carries
   only `0x18`/`0x68`/`0x49`) — clean, independently-verified negative controls for both the
   engine-test and e2e proof plan below.

**The 3-way relationship between two Con-bonus tables, disambiguated (a likely future source of
confusion, worth recording once):**

| | `conPoisonSaveBonus` (existing, M17) | `con_saving_bonus` (this candidate) |
|---|---|---|
| COAB source | `ovr026.cs:377 SaveVersePoisonBonus` | `ovr013.cs:1207 con_saving_bonus` (`sub_3BE42`) |
| Save column | `paralyzePoisonDeath` only | `spell` (and `rodStaffWand`, unwired — see Open Questions) |
| Who gets it | dwarves/halflings (**party only**, race-gated) | **any creature carrying the `Affect`** (monster-side, affect-gated) |
| When applied | once, at chargen/recalc, baked into the stored target | every roll, dynamically, added to the die |
| Band table (Con 3-20) | identical: 4-6→1, 7-10→2, 11-13→3, 14-17→4, 18-20→5 | identical: 4-6→1, 7-10→2, 11-13→3, 14-17→4, 18-20→5 |
| Con > 20 | `>= 18` catches everything ⇒ **always +5** (our own function's "inferred continuation" note) | **no band past 20** ⇒ COAB's own table gives **+0** |

These are genuinely two different mechanisms from two different COAB functions that happen to share
the classic 1e Constitution-bonus band structure for the 3-20 range (unsurprising — both look like the
same underlying 1e table, reused by two different call sites in SSI's engine). Reusing
`conPoisonSaveBonus` verbatim for this candidate would be tempting (near-zero new code) but would
silently import the **wrong** tail behavior for a hypothetical Con>20 monster (nonzero when COAB's own
`con_saving_bonus` says zero) — no real monster in the observed data has Con>20, so this never bites in
practice today, but per this project's "trust the game's own code, note discrepancies honestly"
precedent (M25's DEX-18 correction), the right move is a small **dedicated** function transcribing
`con_saving_bonus`'s own bands exactly (closed at 20, not open above 18), not a silent reuse of the
sibling. It is, however, worth citing as evidence the *shape* of this table is already fully trusted by
this codebase — de-risking M27's "genuine new logic" concern to "a five-branch function nearly
identical to one already shipped and tested."

### (c) Exact live call sites to wire

1. **`packages/engine/src/loaders/monsterSideTables.ts`** — add, next to `HALF_DAMAGE_AFFECT`/
   `REGEN_3_HP_AFFECT` (lines 228, 255):
   ```ts
   export const CON_SAVING_BONUS_AFFECT = 0x61;

   /** COAB `ovr013.cs con_saving_bonus` (sub_3BE42)'s own Con-band table — deliberately NOT the same
    * function as `addnd1e/recalc.ts`'s conPoisonSaveBonus (a different COAB source, SaveVersePoisonBonus,
    * for a different save column, open-ended past Con 18); con_saving_bonus's own table closes at 20. */
   export function conSpellSaveBonus(con: number): number {
     if (con >= 4 && con <= 6) return 1;
     if (con >= 7 && con <= 10) return 2;
     if (con >= 11 && con <= 13) return 3;
     if (con >= 14 && con <= 17) return 4;
     if (con >= 18 && con <= 20) return 5;
     return 0;
   }

   /** Joins Affects.con_saving_bonus (0x61) onto MonsterRecord.conSaveBonus, using the record's own
    * decoded Con score. Same id-keying (blockId) as applyRegenAffect/applyHalfDamageAffect. */
   export function applyConSavingBonus(records: MonsterRecord[], spc: Map<number, MonsterAffect[]>): MonsterRecord[] {
     return records.map((r) => {
       const affects = spc.get(r.blockId);
       if (!affects?.some((a) => a.type === CON_SAVING_BONUS_AFFECT)) return r;
       const bonus = conSpellSaveBonus(r.abilities.con);
       return bonus > 0 ? { ...r, conSaveBonus: bonus } : r;
     });
   }
   ```
   This is the **same three-piece shape** (constant + pure lookup + `Map<blockId,...>` join function)
   `applyRegenAffect`/`applyHalfDamageAffect` already use; the only difference is the join function
   reads a *second* already-decoded field off the same record (`r.abilities.con`, decoded since the
   loader's inception, line 150/168/296) rather than only checking affect presence.
2. **`packages/engine/src/loaders/monster.ts`** — add `conSaveBonus?: number` to `MonsterRecord`, next
   to `halfDamage`/`itemPluses` (~line 224), same "populated after the join, undefined for the common
   case" doc-comment convention.
3. **`packages/engine/src/combat/combat.ts`** — add `conSaveBonus?: number` to `Combatant` (next to
   `monsterSpellSave`, lines 100-113, doc-commented: *"A Con-derived bonus added to the die roll (not
   the target) when this monster's own `Affects.con_saving_bonus` (COAB `0x61`) is present — see
   `applyConSavingBonus`. Undefined ⇒ no bonus (the common case; party figures never carry this — no
   equivalent mechanism is wired for PC saves beyond the unrelated, already-shipped
   `conPoisonSaveBonus`, a different save column applied at chargen, not per-roll)."*); add
   `conSaveBonus?: number` to `monsterCombatant()`'s inline parameter type (lines 276-290, next to
   `itemPluses?: number[]`) and `conSaveBonus: mon.conSaveBonus,` to its return object (lines 294-309,
   next to `monsterSpellSave: mon.savingThrows?.spell`) — **zero new logic in this function**, a pure
   pass-through exactly like `itemPluses`/`halfDamage`.
4. **`packages/engine/src/combat/tactical.ts`** — the **one** behavioral change, `applyCast()` line
   1317:
   ```ts
   const saved = rollsSave ? rng.die(20) + (t.conSaveBonus ?? 0) >= t.save! : false;
   ```
   (was `rng.die(20) >= t.save!`). Matches COAB's literal `gbl.savingThrowRoll += save_bonus` (adding to
   the roll, not subtracting from the stored target) — this also has the nice property of leaving
   `t.save` itself untouched, so the pre-existing `window.__combat.spellSave(id)` seam still reports the
   monster's raw stored byte (e.g. GHOUL = 17) rather than a pre-adjusted number, keeping that seam's
   existing semantics stable for anyone already relying on it (M27's own e2e, CT.4b's party-side checks).
   `TacticalCombatant extends Combatant` (line 120), so `conSaveBonus` is inherited automatically —
   **zero interface edits needed there**, the same free ride every M23-M27 monster field got.
5. **`apps/web/src/ui/explore.ts`** — **zero new fetch.** The `spcAffects` map is already fetched and
   decoded at line 1535 (`decodeMonsterSpcArchive(spcBytes)`, live since M23.S2). Add one line right
   after the existing chain at line 1536:
   ```ts
   monRecords = applyConSavingBonus(monRecords, spcAffects);
   ```
   This candidate needs **less new plumbing than M23.S2, M24.S1, or M26.S1** — no new `gameData.ts`
   field, no new asset fetch, reuses the exact same already-decoded `spcAffects` map M24.S1's
   `half_damage` join already reuses.
6. **`apps/web/src/ui/combat.ts`** — **zero changes required for the mechanism** (`makeTC()` spreads
   `...c` into the `TacticalCombatant` literal, `combat.ts:327` — confirmed by re-reading the function
   fresh this round; `conSaveBonus` rides the spread exactly like `itemPluses`/`missileHitBonus`/
   `monsterSpellSave` already do, none of which `makeTC()` names explicitly). The **one** addition here
   is a new read-only e2e seam next to the existing `*Of()` family (`combat.ts:1179-1189`):
   ```ts
   conSaveBonusOf: (id: string) => state?.combatants.find((c) => c.id === id)?.conSaveBonus ?? null,
   ```

### (d) Why it needs no new state-tracking machinery

A **flat, static, per-monster number**, read once at `TacticalCombatant` construction (already true for
every other affect-family field), applied at exactly one existing comparison (`applyCast()`'s save
roll) with **one new arithmetic term**, not a new branch, gate, or round-tick. No duration, no counter,
no interaction with any other system, no new asset fetch. The only piece that isn't a pure copy-paste of
the M23-M27 template is the five-line Con-band function — and per "(b)" above, that function is a
near-verbatim sibling of an already-shipped, already-tested one (`conPoisonSaveBonus`), not invented
from nothing. This directly answers M27's own flagged concern ("needs its own Con-band bonus-lookup
function ... which is genuine new logic, not just a join") — it is new *code*, but not new *design
risk*: the table was already vetted once, for a sibling mechanic, by this project.

### (e) Size: S

Comparable to M24.S1 (`half_damage`) and M26.S1 (`item_pluses`) in shape — one new loader-side constant
+ pure function + join function (mirrors two existing ones almost line for line), one field on two type
definitions (`MonsterRecord`, `Combatant`), one arithmetic-only edit in `tactical.ts`, one join-call
line reusing an already-fetched map in `explore.ts`, one new read-only e2e seam. **Smaller than M26.S1
in the plumbing dimension** (no new `gameData.ts` field, no new fetch — reuses M23.S2's `spcAffects`
exactly as M24.S1 did) and **about the same size as M24.S1** overall, with the only extra surface being
the small Con-band function (itself de-risked per "(b)").

---

## Proof plan

- **Engine unit tests** (deterministic; real bytes where possible; "split it" — prove the plumbing and
  the arithmetic direction without needing an RNG-resolved fight):
  1. `conSpellSaveBonus()` pure-function test (new, in `monsterSideTables.test.ts` next to the existing
     `describe('applyHalfDamageAffect ...')` block): assert every COAB band boundary (`3→0, 4→1, 6→1,
     7→2, 10→2, 11→3, 13→3, 14→4, 17→4, 18→5, 20→5, 21→0`) — the `21→0` case is the one **intentional**
     divergence from `conPoisonSaveBonus(21)===5` documented in "(b)", worth its own explicit assertion
     so a future refactor doesn't "simplify" the two functions back into one and silently reintroduce
     the wrong tail.
  2. `applyConSavingBonus` synthetic case (mirrors `applyRegenAffect`'s existing shape exactly): a
     fabricated affect map with `type: 0x61` on a record with `abilities.con: 10` sets
     `conSaveBonus: 2`; a record with the same affect but `con: 2` (outside every band) is left
     unchanged (no `conSaveBonus` field at all, matching "undefined ⇒ no bonus"); a record with a
     *different* affect (e.g. `0x62`) or no side-table entry is left unchanged.
  3. A **real-bytes join** case (mirrors `applyHalfDamageAffect`'s real-DoK-bytes test and
     `applyRegenAffect`'s real-CoK-bytes test): decode the real `Champions of Krynn/MON1CHA.DAX` +
     `MON1SPC.DAX`, assert GHOUL (id 7) joins to `conSaveBonus === 2`; GOBLIN (id 9, verified above to
     carry zero affects) and RED DRAGON (id 21, verified above to carry `0x18/0x68/0x49`, no `0x61`)
     both join to `undefined` — two different real-data negative controls, not just one.
  4. `monsterCombatant()` pass-through test (new, in `combat.test.ts` next to the existing
     `describe('monsterCombatant (M27.S1) ...')` block): a fabricated `MonsterRecord`-shaped input with
     `conSaveBonus: 2` produces `Combatant.conSaveBonus === 2`; an input with `conSaveBonus: undefined`
     produces `undefined` — mirrors the `itemPluses`/`monsterSpellSave` pass-through tests exactly. Add
     a **real-bytes** sibling assertion in the same file's existing `describe('runCombat — golden CoK
     GOBLIN ×3 vs OGRE')`-style real-data block: `monsterCombatant(by('GHOUL'), 'e0').conSaveBonus` (via
     the real MON1CHA/MON1SPC join) equals `2`.
  5. **The arithmetic direction**, in `tactical.test.ts`'s existing `describe('tactical in-combat
     spellcasting (CT.4)')` block, using the file's own documented "make saves deterministic by
     extremes" convention (line 335-337, precedented, no seed-hunting needed): a save-or-negate spell
     (e.g. reuse `hold`, `save: 'negate'`) cast at a target with `save: 21, conSaveBonus: undefined` —
     never saves (matches the file's existing baseline case) — versus an **identical** target except
     `save: 21, conSaveBonus: 21` — always saves regardless of the rolled die (min roll 1: `1 + 21 = 22
     >= 21`). This directly proves the bonus is added to the *roll* before the comparison (not silently
     ignored, not applied to the wrong side of the inequality) without needing to pin an exact seed/roll
     value — the same "prove the direction with an extreme, not a guessed roll" technique the file
     already uses for its `save<=1`/`save>=21` baseline cases.
- **One e2e** (`?explore=1`, CoK — matching the CT.4b/M23.S2/M24.S1/M27 shape): reuses
  `window.__explore.testFightMonster(monsterId, seed)` (the pre-existing per-block-id spawn seam, no
  new seam code) and the one new `window.__combat.conSaveBonusOf(id)` read seam:
  1. `testFightMonster(7, seed)` (GHOUL, CoK area1 block **7**) → `conSaveBonusOf('e0')` should read
     **2** (today: `null`).
  2. `testFightMonster(26, seed)` (SKELETON, block **26**) → `conSaveBonusOf('e0')` should also read
     **2** — a second real monster, same value (expected, since both are Con 10 in the real data; still
     valuable as a "not a hardcoded id-9-only fluke" check).
  3. **Same-real-data negative controls, reusing M27's own established ids**: `testFightMonster(9, seed)`
     (GOBLIN) and `testFightMonster(21, seed)` (RED DRAGON) both → `conSaveBonusOf('e0')` reads `null` —
     proving the join doesn't fire for monsters without the affect, using the exact two ids M27's own
     e2e already spawns for the sibling `spellSave` check (zero new spawn logic, only a new assertion
     against ids the harness has driven before).
  4. `spellSave('e0')` for the GHOUL case should **still read 17** (the raw stored byte, unchanged) —
     proving `conSaveBonus` is carried as a separate field alongside `.save`, not baked into it,
     matching the design choice in "(c)5" above.

---

## Candidates investigated and rejected this round

### Item-instance subsystem (Option A, per the brief — only spot-checked, not re-derived, since Option 1 panned out)

| Candidate | Verdict |
|---|---|
| Replace `treasure.ts`'s synthetic `DROP_TABLE` with a real `MonsterItem`-sourced join | **Not re-derived in depth this round** — con_saving_bonus panned out, so per the brief's own instruction this wasn't needed. A light spot-check confirms M27's findings are unchanged: `InventoryEntry` (`packages/engine/src/items/inventory.ts:14-22`) still exactly four fields, no per-instance bonus; `ecl/vm.ts:604`'s `TREASURE` opcode comment is still the generic "surfaced [as unhandled], not executed" branch; `treasure.ts`'s `DROP_TABLE` (line 30) is unchanged. Still the 4th-independent-audit-confirmed blocker (M19/M24/M26/M27); not re-litigated further. |

### Fresh looks this round (not exhaustive, since the brief's primary lead panned out)

| Area | Finding |
|---|---|
| **`con_saving_bonus`** | **This round's pick** — see RECOMMENDED above. |
| The other 3 unconsumed `SavingThrows` columns (`paralyzePoisonDeath`, `petrifyPolymorph`, `breath`) plus `rodStaffWand` | `rodStaffWand` is the *other* save type `con_saving_bonus` gates on per COAB (alongside `spell`) — **not** wired by this candidate, since no rod/staff/wand effect exists anywhere in either combat engine to consume it (re-confirmed unchanged from M27's own finding: no live mechanic reads any of the other four columns). Flagged again so a future audit doesn't re-derive this from scratch; not folded into this slice, which only touches the `spell` column already wired by M27. |
| `owlbear_hug_check` (0x60) — co-occurs with `con_saving_bonus` on every real carrier this round found (GHOUL/SKELETON/ZOMBIE/GHAST all carry both 0x60 and 0x61) | Re-confirmed still the same blocker M24 identified: COAB's version adds a *second, temporary* affect for a scheduled follow-up attack next round — a small state machine, not a flat number. Not re-investigated further this round (no new evidence); noted only because it happens to share carriers with this round's pick. |

---

## Open questions / unknowns

- **No nat-1/nat-20 auto-fail/auto-succeed exists anywhere in this engine's save-roll code**
  (`tactical.ts`'s `applyCast()`, `Rng.die(20)`) — COAB's own `RollSavingThrow` has both. This is a
  **pre-existing** simplification (predates this candidate, applies to every save roll the tactical
  engine already makes, party and monster alike) — not introduced or fixed by this slice. Flagged so a
  future audit doesn't attribute it to `con_saving_bonus`'s wiring.
- **`Cheats.player_always_saves`** (`ovr024.cs:559`, a COAB debug/cheat flag) is clearly out of scope —
  noted only because it appeared in this round's fresh re-read of `RollSavingThrow` and is not present
  in M27's transcription; confirmed irrelevant to any real gameplay path.
- **`player.field_186`** (`RollSavingThrow`'s other additive term, `ovr024.cs:574`) is an
  unnamed/undecompiled bonus source — **UNLOCATED**, not pursued this round (out of scope; no evidence
  it maps to anything Krynn's own data carries).
- **This round's real-bytes probe covers CoK areas 1-3 and DoK area 1 only** (the same scope every
  M23-M27 probe has used) — a full multi-area sweep would very likely surface more `con_saving_bonus`
  carriers (this affect clusters tightly with the undead family already found), but is not needed to
  justify this slice; the live explorer currently loads only CoK area 1's `MON1CHA.DAX`/`MON1SPC.DAX`
  and DoK area 1's equivalents, matching the e2e's scope.
- **DoK's compact-record Con score IS located** (`abilities` block offset 16, same as CoK, per
  `monster.ts`'s own `DOK_LAYOUT.ability: 16`) — so `applyConSavingBonus` will actually produce a real
  `conSaveBonus` for DoK's DREAD WOLF (id 24, this round's probe) even though DoK's **spell save target**
  itself is unlocated (gap B5, `DOK_LAYOUT.saves: null`). Since `t.save` is `undefined` for every DoK
  monster (M27's fix), `rollsSave` in `applyCast()` is already `false` for all of them regardless of
  `conSaveBonus` — so this is a harmless inert value for DoK today (the bonus is computed and stored but
  never read, because there's no target to compare against yet), not a new correctness risk. Worth a
  one-line note in the loader doc comment so a future reader isn't confused about why DoK gets a
  `conSaveBonus` but never uses it.
- **`aiTargetWouldSave()`/`chooseOffensiveCast()` (`tactical.ts:1668-1694`) do not account for
  `conSaveBonus`** in their "would this target save?" heuristic. This only matters for the (currently
  rare/edge-case) direction of a save-allowing spell being cast **at** a `con_saving_bonus`-carrying
  monster by an AI-driven caster (e.g. an automated party mage deciding whether Fireballing a GHOUL is
  "worth it") — a minor fidelity gap (the AI might slightly under-rate a GHOUL's actual save chance),
  not a correctness bug, since the heuristic is already labelled "1e/COAB-inferred threshold" with its
  own fudge margin (`AI_SAVE_LIKELY = 10`, `tactical.ts:715`). Not fixed by this slice (would require
  touching the AI decision path, not just the roll); flagged as a natural, optional follow-on.

## Implications for our engine

- The M23-M27 "decode generically once, map one flat field into an optional `Combatant`/
  `MonsterRecord` property, apply at the nearest existing choke point" template generalizes a **third**
  time within the same `MON{n}SPC.DAX` affect family (after `regen_3_hp` M23.S2 and `half_damage`
  M24.S1) — and, notably, is the first of the three to reuse the M27-built `save` consumer field rather
  than introducing a new one, showing the template composes: a later affect can ride an earlier round's
  consumer field instead of always needing its own.
- **A previously-rejected candidate becoming buildable, exactly as the rejecting audit predicted,
  confirms this project's "flag for later, don't force it" discipline is working as designed.** M24
  explicitly wrote "worth flagging for a future round once monster saves exist" for this exact
  candidate; M27 explicitly flagged it again after wiring the prerequisite; this round cashed that flag
  in. Future audits should keep treating "blocked, but here's what would unblock it" notes as
  live TODOs to re-check, not dead rejections.
- **A second, general lesson**: when a "new lookup table" is flagged as the risk in a wiring candidate,
  it's worth checking whether an *already-shipped* sibling table (same domain, different call site)
  already exists — here, `conPoisonSaveBonus` de-risked the table's *shape* (this project has already
  trusted and tested this exact Con-banding once) even though it couldn't be reused verbatim (the tail
  behavior above Con 20 genuinely differs). This is a cheaper, more grounded way to validate "is this
  new logic actually risky?" than treating every new function as equally uncertain.
- The item-instance subsystem remains the **one** recurring structural blocker across five audits now
  (M19, M24, M26, M27, and this round's spot-check) — still worth its own dedicated phase whenever the
  loop is ready to spend a multi-slice arc on it, per M26's original scoping recommendation. Not picked
  up this round because a smaller, real, S-sized candidate was available.
