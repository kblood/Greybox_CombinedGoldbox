# M24 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/HANDOFF.md` + `BUILD-QUEUE.md`'s M15–M23 "Done" entries to
> confirm the recurring pattern (real, COAB-verified engine logic with zero live call sites), then
> (1) re-open the two candidates M23.S1's audit explicitly deferred, and (2) independently sweep
> combat/progression/magic/economy/items for new candidates in the same shape. Nothing in this doc
> has been implemented — read-only research, per the M24 task brief.

## RECOMMENDED: monster `Affects.half_damage` (0x51) — "always halve incoming weapon damage"

Wire the **next** `MON{n}SPC.DAX` `Affect` value after `regen_3_hp` (M23.S2): `half_damage`
(COAB `Affects.half_damage = 0x51`). It is real (present in real DoK bytes on the VAMPIRE family),
has a one-line COAB oracle, and needs **zero new state** — just like `regen_3_hp`, it is a flat,
unconditional modifier applied at one already-existing per-hit choke point.

- **What already computes it (nothing yet — this is the gap):** nothing computes it today.
  `packages/engine/src/loaders/monsterSideTables.ts`'s `decodeMonsterSpcArchive`/`decodeMonsterAffect`
  already **decode** every `Affect` record generically (type/minutes/affectData/callAffectTable), so
  the raw byte `0x51` is already sitting in the `MonsterAffect[]` the loader returns — it's simply
  never *interpreted*, the same "decoded but not mapped past one enum value" gap M23.S2's own note
  called out (`REGEN_3_HP_AFFECT` is the only mapped constant in the file).
- **COAB oracle (verified, one line):** `coab_extracted/engine/ovr013.cs:1056`:
  ```csharp
  internal static void half_damage(Effect arg_0, object param, Player player) /* sub_3B97F */
  {
      gbl.damage /= 2;
  }
  ```
  Registered in the affect jump-table at `ovr013.cs:1870` (`affect_table.Add(Affects.half_damage,
  ovr013.half_damage)`) and swept every time weapon damage is resolved via
  `ovr024.cs:181-198`'s `CheckType.Type_5` case (`calc_affect_effect(Affects.half_damage, player)`
  among ~15 other **defender-side** damage modifiers — `mirror_image`, `resist_normal_weapons`,
  `resist_fire_and_cold`, `troll_regen`, etc., all in the same `Type_5` list). `CheckType.Type_5` is
  invoked from exactly one place, `ovr014.cs:84-102`'s `sub_3E192` (the melee weapon-damage
  computation routine):
  ```csharp
  gbl.damage = ovr024.roll_dice_save(attacker.attackDiceSize(index), attacker.attackDiceCount(index));
  gbl.damage += attacker.attackDamageBonus(index);
  if (gbl.damage < 0) gbl.damage = 0;
  if (CanBackStabTarget(target, attacker) == true) gbl.damage *= /* backstab multiplier */;
  gbl.damage_flags = 0;
  ovr024.CheckAffectsEffect(attacker, CheckType.SpecialAttacks);  // attacker-side specials first
  ovr024.CheckAffectsEffect(target, CheckType.Type_5);            // THEN defender-side specials
  ```
  i.e. roll dice → add bonus → apply backstab multiplier → apply attacker specials → **apply
  target's `half_damage` (and siblings) → finalize damage**. `callAffectTable` on the 9-byte record
  gates only the *add/remove* jump (`ovr024.cs:67-95`'s `remove_affect`) — the periodic
  `CheckAffectsEffect` sweeps run regardless of that flag (this is exactly why `regen_3_hp` — also
  `callAffectTable=false` in every real record — still fires every round via the **separate**
  `CheckType.Type_19` sweep; `half_damage` fires via `Type_5` at the melee/missile damage-resolution
  point instead of a round-start point, but the same "innate, not dynamically added" shape applies).
- **Real-bytes verification (this audit, fresh probe):** re-ran `decodeMonsterSpcArchive` over the
  same four real files M23.S2 used (`Champions of Krynn/MON{1,2,3}SPC.DAX`,
  `Death Knights of Krynn/MON1SPC.DAX`) and cross-referenced monster names via
  `decodeMonsterArchive` on the matching `MON{n}CHA.DAX`. `0x51` appears on exactly **3 real
  records, all in `Death Knights of Krynn/MON1SPC.DAX`**:

  | id | name | affect |
  |---|---|---|
  | 19 | VAMPIRE | `0x51 half_damage` (+ `0x60 owlbear_hug_check`) |
  | 20 | VAMPIRE MAGE | `0x51 half_damage` (+ `0x60`) |
  | 21 | VAMPIRE CLERIC | `0x51 half_damage` (+ `0x60`) |

  All three records read `minutes=0, affectData=0xff, callAffectTable=false` — the same
  innate/permanent shape M23.S2 verified for `regen_3_hp`. The pairing is thematically exact — 1e
  vampires take half damage from non-magical weapons/mundane attacks, and here it's simplified to
  "half all weapon damage" (see "Honest scope" below) — which is a strong sign this is real
  authored data, not noise. (Full affect tally from the same probe, useful for the *next* audit
  round, is in the appendix.)
- **Exact live call sites to wire (mirrors `regenPerRound` exactly, both engines):**
  1. **`packages/engine/src/loaders/monsterSideTables.ts`** — add `HALF_DAMAGE_AFFECT = 0x51` next
     to `REGEN_3_HP_AFFECT = 0x62`, and either extend `applyRegenAffect` or add a sibling
     `applyHalfDamageAffect(records, spc)` returning `{ ...r, halfDamage: true }` when the monster's
     joined `MonsterAffect[]` contains `0x51` — same shape, same function signature.
  2. **`packages/engine/src/loaders/monster.ts`** — add `halfDamage?: boolean` to `MonsterRecord`,
     right next to `regenPerRound?: number` (line ~216), with the same "populated after the
     `MON{n}SPC.DAX` join, undefined for the common case" doc comment.
  3. **`packages/engine/src/combat/combat.ts`** — add `halfDamage?: boolean` to `Combatant` (next to
     `regenPerRound` at line 73); thread it through `monsterCombatant()` (line 234-263, same place
     `regenPerRound: mon.regenPerRound` is passed through); apply it at the **one** damage line in
     `runCombat`'s round loop (line 188): `const dmg = Math.max(1, rng.roll(...)); ` → if
     `target.halfDamage`, halve `dmg` (floor) **before** `target.hp -= dmg`.
  4. **`packages/engine/src/combat/tactical.ts`** — `TacticalCombatant extends Combatant` so the
     field is inherited automatically (no new interface field there, unlike `regenPerRound` which
     needed its own `tickRegen()`/`beginRound()` wiring — this one is even smaller). Apply the halving
     at the single melee/missile damage line (`applyMelee`'s resolve function, ~line 1157-1162):
     `let dmg = Math.max(1, rng.roll(...)); if (backstab) dmg *= backstabMultiplier(...); ` → if
     `target.halfDamage`, halve `dmg` here (**after** backstab, matching COAB's order exactly:
     backstab multiply happens before the two `CheckAffectsEffect` calls in `sub_3E192`) → then
     `applyHpLoss(target, dmg)`. Because `applyMelee`/the shared resolve path handles **both** melee
     and missile fire (the `missile` flag is already threaded through the same function), this one
     change covers both attack types faithfully — COAB's `sub_3E192` is the generic weapon-damage
     routine for either.
  5. **`apps/web/src/ui/gameData.ts` / `explore.ts`** — **zero new plumbing needed.** `explore.ts:1529`
     already calls `applyRegenAffect(monRecords, decodeMonsterSpcArchive(spcBytes))` on the *exact*
     `spc` map that already contains every `0x51` record (`spcPath` was already added for M23.S2 and
     is fetched unconditionally for both CoK and DoK). Add one more line —
     `monRecords = applyHalfDamageAffect(monRecords, spc)` — reusing the same already-decoded map;
     this candidate needs **less** new plumbing than M23.S2 did, since the file-fetch/join
     infrastructure it required is already in place.
- **Why it needs no new state-tracking machinery:** it is a **flat, unconditional** damage
  modifier — no duration, no counter, no damage-type gate (unlike `troll_regen`/`TrollRegen`, which
  COAB gates on `gbl.damage_flags & (Fire|Acid)` and which M23.S2 explicitly rejected for exactly
  that reason). `half_damage` fires on **every** hit against the monster regardless of the
  attacker's weapon or damage type, so a single boolean on the record, checked at the one place
  damage is finalized, is a complete and faithful implementation — the same "single flat number,
  no extra state" bar `regen_3_hp` cleared.
- **Honest scope note.** COAB's `half_damage` halves **all** damage sources reaching
  `CheckType.Type_5` (any weapon/missile hit); it is *not* conditioned on "non-magical weapon" the
  way the 1e Monster Manual's vampire entry reads in prose — that nuance would need per-weapon
  magic-bonus tracking at the point of the hit, which the tactical engine's `defaultWeapon()` does
  not currently expose to the damage-resolution step. Wiring exactly what COAB's `gbl.damage /= 2`
  does (unconditional halving) is the faithful-to-the-decompile choice and should be documented as
  such, not silently narrowed or widened.
- **Size: S.** Smaller than M23.S2 (no new file-fetch plumbing required) and comparable to M17/M18's
  single-accessor-function wiring slices: one new constant + one new decode-side function (mirrors
  an existing one almost line-for-line) + one field on two type definitions + two one-line damage
  edits (`combat.ts`, `tactical.ts`) + one new join call in `explore.ts` (reusing already-fetched
  bytes).
- **Proof plan (avoiding the "uncontrolled combat RNG" pitfall flagged in prior rounds — split it):**
  - Engine unit tests (deterministic, no RNG needed for the mechanism itself):
    1. `applyHalfDamageAffect` synthetic case (a fabricated affect map with `type: 0x51` sets
       `halfDamage: true`; a map without it leaves the record untouched) — mirrors
       `applyRegenAffect`'s existing synthetic test.
    2. A **real-bytes join** case: decode the real `Death Knights of Krynn/MON1SPC.DAX` +
       `MON1CHA.DAX`, assert ids 19/20/21 (VAMPIRE, VAMPIRE MAGE, VAMPIRE CLERIC) join to
       `halfDamage: true` and a control id with no `0x51` (e.g. 22 GHOUL, verified above to carry
       only `0x60`) joins to `undefined` — the same "real-CoK-bytes negative control" shape M23.S2
       used, just on DoK data (the only game these records exist in).
    3. `combat.ts`/`tactical.ts` tests with a **fixed, non-random damage roll** (seed chosen so the
       roll is deterministic, same technique the existing test suites already use elsewhere):
       assert a `halfDamage` target takes exactly `floor(dmg/2)` and a non-flagged target takes the
       full `dmg`; a **second** tactical case with backstab active on a `halfDamage` target proves
       the order (backstab multiply, *then* halve) matches COAB, by asserting a value that would
       differ under the reversed order (an odd base roll where `floor(dmg*mult/2) !==
       floor(dmg/2)*mult`).
  - One e2e (`?explore=dok`, matching M23.S2's shape): spawn the real DoK VAMPIRE (id 19) via
    `window.__explore.testFightMonster(19, seed)` through the actual production `spawnEnemies` path
    and read a new `window.__combat.halfDamageOf(id)` seam (mirrors the existing `regenOf`) — this
    proves the **real MON1SPC.DAX byte reaches the real Combatant object** without needing to
    resolve an actual RNG-dependent fight (the exact lesson the project memory already recorded:
    "when an e2e proof would need uncontrolled combat RNG, split it"). Use id 22 (GHOUL, verified
    above to carry no `0x51`) as the same-real-data negative control, exactly as M23.S2 did with
    goblin id 9 vs. SKELETON id 26.

---

## Re-examined: the two candidates M23.S1's audit deliberately deferred

### 1. Monster `Affect` special-attacks — this audit's pick above **is** the requested next value

The M24 brief asked for "the NEXT affect value that is real, has a COAB oracle, and needs no extra
state" beyond `regen_3_hp`. `half_damage` (0x51) is that value — see the RECOMMENDED section. Other
real, COAB-defined values found in the same probe were considered and rejected for needing either
new state/mechanics the engine doesn't have, or a whole new subsystem:

| Affect (COAB name) | Real? | Why not chosen |
|---|---|---|
| `troll_regen` / `TrollRegen` (0x65/0x66) | yes (VAMPIRE/troll-family ids) | Already explicitly rejected by M23.S2 — gates on `gbl.damage_flags & (Fire\|Acid)`, a damage-type dimension this combat model doesn't track anywhere. Re-confirmed still true; no new damage-type machinery has landed since. |
| `detect_invisibility` (0x18) | yes — **the single most common affect in the real data** (46 records / 41 monsters) | Needs an "invisibility" state concept (a party member/monster being invisible, and this affect negating stealth benefits against it) that doesn't exist anywhere in the engine yet — a real feature, but a materially bigger lift than a flat modifier, and it would be inert until invisibility itself is modeled. |
| `owlbear_hug_check` (0x60) | yes (37 records / 29 monsters — GHOUL/ZOMBIE/SKELETON/VAMPIRE families) | COAB's version (`ovr014.cs`'s `AffectOwlbearHugAttackCheck`) *adds a second, temporary affect* (`owlbear_hug_round_attack`) that triggers a **follow-up bite/hug attack next round** if the initial claw hit — i.e. a small state machine (a temporary "grabbed" status + a scheduled extra attack), not a flat number. Same shape of complexity M23.S2 avoided with `troll_regen`. |
| `con_saving_bonus` (0x61) | yes (14 records / 8 monsters — GHOUL/SKELETON/ZOMBIE/SKELETAL KNIGHT/SKELETAL DRAGON) | COAB's `con_saving_bonus` (`ovr013.cs:1207`) computes a save bonus **from the monster's Con score** (a small lookup table by Con band) and applies it only to `SaveVerseType.Spell`/`RodStaffWand` saves. `MonsterRecord.abilities.con` is already decoded, so the *formula* would need no new byte-location work — but the tactical/abstract combat engines don't currently model **per-monster saving throws at all** (only party saves, e.g. `spellSaveForMember` from M22.S2); adding monster-side saving throws that spells/wands can target is a bigger, separate lift than a wiring fix, not a one-slice candidate. Worth flagging for a future round once monster saves exist. |
| `prot_drag_breath` (0x49) | yes (14 records / 13 monsters, mostly on DRAGON-type monsters) | Needs a modeled "breath weapon" damage type/mechanic (there is none — no monster in this engine currently has a breath attack implemented), so wiring the *protection* would be an inert no-op today — the same "wholly new subsystem" trap M19 hit with identify/gem-appraisal. |
| `resist_magic_50_percent` / `resist_magic_15_percent` (0x69/0x6a) | present only as a single record (id 0, `resist_magic_15_percent`, CoK area1) | Needs a modeled magic-resistance roll (chance to shrug off a targeted spell entirely) — COAB's `CheckType.MagicResistance` sweep — which the tactical spell-resolution path doesn't have; also only one real record observed, so the payoff is thin. |
| `feeblemind` / `paralizing_gaze` / `thri_kreen_paralyze` (0x44/0x53/0x43) | yes | Each is a spell-like **status-inflicting** attack (needs a status-effect application step on a successful gaze/bite, analogous to a spell effect) rather than a passive modifier — bigger than a flat-number wiring fix, closer to "new mechanic" scope. |

### 2. Terrain-height missile occlusion

Not re-derived from scratch this round (would need re-opening the original geometry research, out
of proportion to a confirmation check) — but nothing in the intervening M15-M23 work touches
missile line-of-fire or terrain height, so the prior verdict ("a fidelity delta, not a
missing-feature gap") has no new evidence against it. **Concur: still not worth it** relative to
`half_damage`, which is a real, present-in-live-data, zero-new-machinery candidate.

---

## Broader sweep: combat / progression / magic / economy / items

Grepped every exported `packages/engine/src` function in the requested areas against
`apps/web/src` and `apps/author` call sites. Summary (not exhaustive re-litigation of already-closed
M15-M23 items):

- **Combat (`ruleset/addnd1e/recalc.ts`, `combat.ts`/`tactical.ts`):** `warriorMultipleAttacks`
  (M16), `conPoisonSaveBonus` (M17), `bestThac0`/`maxClassLevel` folded into `recalcCombatProfile`
  (M16) are all live. `dualClassWarriorReactivates` remains unwired — confirmed still a **data-model
  gap** (`CharacterSheet` has no dual-class frozen-slot tracking), not a wiring gap; no new dual-class
  data has landed since M16. `rearAc` remains UNLOCATED in both CoK/DoK records per `HANDOFF.md` §7
  — re-confirmed, no new byte location found this round.
- **Character progression (`ruleset/addnd1e-dragonlance/`):** `computeClassFlags` /
  `itemUsableByClassFlags` / `findItemsToUnready` (`classFlags.ts`) — **re-confirmed still a dead
  end**, and now with a stronger reason than M17 had: `dqkExplore.ts:604-618`'s `openCompanion()`
  comment shows DQK's own `ITEMS.DAT` catalogue still has **no name field decoded** and its
  companion-panel wiring passes `items: []` — i.e. DQK's inventory screen (which now *does* share the
  CoK/DoK `inventory.ts` UI component per the C4.3 DQK-on-shared-Phase-A-systems work) still has
  **no real item objects to gate**, and CoK/DoK's hand-authored `BASE_ITEMS` still carries no
  restriction bytes. `thiefSkillPercent`/`recalcThiefSkills` — re-confirmed dead end, no LOCK/TRAP
  ECL opcode exists (`ecl/opcodes.ts` unchanged in this area).
- **Magic (`ruleset/addnd1e-dragonlance/spellEffects.ts`, `magic.ts`):** no unwired
  casting-time/range/component modifiers found — `spellEffect`/`rollSpellAmount`/`isCampCastable`
  all have real call sites in `magic.ts`/`combatSpells.ts`. The moon-phase (`moons.ts`) and Scribe
  (`scribe.ts`) families are fully wired as of M20-M22.
- **Economy (`town/pricing.ts`):** unchanged since M19's audit — `buyPriceFromValue` (needs a
  fabricated per-item `value` byte + shop `tierMask`, neither real), `IDENTIFY_COST_STEEL` /
  `appraiseGem` / `appraiseJewelry` (need a whole new "hidden name"/gem-inventory subsystem),
  `coinPayout` (would change the money model everywhere it's read) — all still genuinely bigger
  than a wiring slice, re-confirmed with a fresh grep (zero new call sites since M19).
- **Items (`loaders/item.ts`, `loaders/dqkItem.ts`):** found one new observation worth recording —
  `DokItemRecord.cursed` (byte 12 of the DoK `ITEM0.DAX` catalogue record) and the shared 63-byte
  item-instance `cursed` field (`monsterSideTables.ts`'s `ITEM_FIELD.cursed`, offset 0x36, also used
  by CoK `ITEM{n}.DAX`) are both decoded but have **zero call sites** anywhere in `apps/web`. This
  looked promising (a boolean "can't unequip once worn" curse flag sounds like a flat, stateless
  rule) but on inspection it shares M19's exact rejected root cause: there is no "identified /
  hidden name" state modeled per carried item instance anywhere in `party.ts`/`inventory.ts` (M19's
  own words: "no hidden_names_flag concept ... exists anywhere yet"), and a curse reveal/lock-in
  mechanic is conventionally gated on identification in Gold Box games — wiring "cursed" honestly
  needs the same missing subsystem M19 already scoped as **bigger than wiring**, not a second
  independent gap. Not recommended as a standalone slice; would piggyback on an eventual identify
  system.

None of these broader-sweep items beat `half_damage` on the "real + verified + zero new machinery +
clean existing choke point" bar.

---

## Appendix — full real-bytes `Affect` tally (this audit's probe)

Reproduced independently via `decodeMonsterSpcArchive` (`packages/engine/src/loaders/monsterSideTables.ts`)
over `Champions of Krynn/MON{1,2,3}SPC.DAX` + `Death Knights of Krynn/MON1SPC.DAX` (the same four
files M23.S2 probed) — **45 distinct affect type values** observed (matches M23.S2's own "~45
distinct affect values" characterization), every single record `minutes=0, affectData=0xff,
callAffectTable=false`. Top 15 by frequency (full byte-for-byte tally kept in this audit's scratch
output, not committed — reproducible any time via the same loader):

| Affect (hex) | COAB name | records | monsters | example ids/names |
|---|---|---|---|---|
| 0x18 | `detect_invisibility` | 46 | 41 | most dragons, undead, NPCs |
| 0x60 | `owlbear_hug_check` | 37 | 29 | GHOUL, ZOMBIE, SKELETON, VAMPIRE family |
| 0x63 | *(unnamed in COAB enum — `affect_63`)* | 25 | 25 | same undead cluster as 0x60 |
| 0x5c | *(unnamed — `affect_5c`)* | 21 | 21 | same cluster |
| 0x67 | `salamander_heat_damage` | 17 | 17 | dragons + assorted |
| 0x50 | `ankheg_acid_attack` | 15 | 15 | same cluster as 0x60 |
| 0x49 | `prot_drag_breath` | 14 | 13 | dragon-type monsters |
| 0x61 | `con_saving_bonus` | 14 | 8 | GHOUL/SKELETON/ZOMBIE/SKELETAL KNIGHT/DRAGON |
| 0x44 | `feeblemind` | 8 | 6 | dragons |
| 0x45 | `invisible_to_animals` | 8 | 4 | assorted |
| **0x62** | **`regen_3_hp`** | **8** | **5** | **SKELETON, ZOMBIE, SKELETAL KNIGHT/DRAGON (wired M23.S2)** |
| 0x53 | `paralizing_gaze` | 7 | 7 | dragons |
| **0x51** | **`half_damage`** | **3** | **3** | **VAMPIRE, VAMPIRE MAGE, VAMPIRE CLERIC (this audit's pick)** |
| 0x65/0x66 | `troll_regen`/`TrollRegen` | 5 | 3 | VAMPIRE-family (rejected M23.S2, damage-type gate) |

(`affect_63`/`affect_5c` etc. are enum placeholders in `coab_extracted/Classes/Affect.cs` with no
named COAB behaviour — real bytes, but **no oracle definition to verify against**, so they fail the
brief's "(b) has a COAB oracle definition" bar and aren't candidates until COAB names them.)

## Open questions / unknowns

- Whether COAB's `half_damage` is meant to be conditioned on "non-magical weapon" in play (the 1e
  Monster Manual prose reading) or is genuinely unconditional as the decompiled one-liner shows —
  **UNLOCATED beyond the decompile itself**; `gbl.damage /= 2` with no magic-bonus check is what the
  code says, so that is the faithful implementation, but a DOSBox dynamic trace against a real
  vampire fight (magic vs. mundane weapon) would be the only way to prove intent beyond the static
  decompile. Not blocking — implement the decompile literally and document the reading.
- Whether `affect_63`/`affect_5c` (25/21 real records, the 3rd/4th most common values after
  `detect_invisibility`/`owlbear_hug_check`) have a recoverable meaning from the raw x86 disassembly
  (`coab_new.lst`) even though COAB's own C# decompile left them unnamed — a possible follow-on
  research task, not attempted here (out of scope for this audit).
- `con_saving_bonus` (0x61) is a strong **second-place** candidate for a future round once/if
  monster-side saving throws get modeled — flagged, not built.

## Implications for our engine

- The `MON{n}SPC.DAX` → `MonsterRecord` → `Combatant`/`TacticalCombatant` → live-combat pipeline
  M23.S2 built (spc fetch in `gameData.ts`, join in `explore.ts`, flat-field-on-record convention) is
  now a **reusable template**: this audit found the very next candidate needs no new fetch/join
  plumbing at all, only a new field + a one-line damage-resolution edit in each combat engine. Future
  affect-family work should keep using this exact shape (decode generically once, map one enum value
  at a time into a plain optional field, apply at the nearest existing choke point) rather than
  building a generic "affect effect dispatcher" — COAB's own `CallAffectTable`/`calc_affect_effect`
  machinery is real but everything actually present in shipped Gen1 data is the innate/permanent
  kind, so a generic dispatcher would be speculative machinery with no real trigger, per ADR-0006's
  spirit (verify against real bytes, don't build for hypothetical data).
- The **item-identify / hidden-name subsystem** (flagged by M19 for shop appraisal, and now again by
  this audit for cursed-item detection) is the one recurring "bigger than wiring" blocker across two
  independent audits. If a future phase decides to build it, it would retroactively unblock *both*
  `IDENTIFY_COST_STEEL`/gem appraisal (M19) and cursed-item detection (this audit) in one lift —
  worth scoping as a single M-phase rather than two separate ones when it's picked up.
