# M27 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/HANDOFF.md` + `BUILD-QUEUE.md`'s M15–M26 "Done" entries, then
> `docs/engine/research/m24-audit.md`, `m25-audit.md`, `m26-audit.md` in full (M23 has no standalone
> audit doc — its findings live directly in the M23.S1/M23.S2 `BUILD-QUEUE.md` "Done" entries, also
> read). Per the task brief, this round first re-verified **Option A** (the player-side item-instance
> subsystem M26 flagged as "a strong candidate for its own dedicated phase") by tracing the starter-kit
> / shop / loot-table / ECL `TREASURE`-opcode chain fresh, in the current tree, rather than trusting the
> prior write-up — see "Option A re-confirmed blocked" below. Having reconfirmed it is genuinely bigger
> than a one-day slice, this round fell back to **Option B**: a fresh sweep, landing on the task brief's
> own suggested "saving throws" vein, which turned out to be **the single strongest candidate found in
> the M23-M27 series** — a real, byte-verified, COAB-verified per-monster value with a fully-built,
> already-tested consumer mechanism, whose only gap is one hardcoded `undefined` at one call site. Fresh
> ground swept and found empty is recorded in "Candidates investigated and rejected." Nothing in this
> document has been implemented — this is read-only research, per the M27 task brief.

## Headline finding: **monster saving throws vs. party spells** — real, byte-verified, COAB-verified, and the live code's own comment already says "yet"

Every party spellcaster's save-or-negate / save-for-half combat spell (Fireball, Lightning Bolt, Flame
Strike, Burning Hands, Cone of Cold, Stinking Cloud, Hold Person, Fear, Slow — nine spells, all real,
all reachable through the production `combatSpellsForMember()` path, not just a demo) currently **always
lands at full effect on every monster in every real fight**, because the tactical combat engine's
per-figure `save` field — which fully implements d20-vs-target save resolution, half/negate damage
mitigation, status negation, and AI save-prediction — is **only ever populated for the party side**.
`MonsterRecord.savingThrows` (a real, already-decoded, already byte-verified 5-column saving-throw table
straight from `MON{n}CHA.DAX`) is never joined to a monster's `Combatant`. The live code's own doc comment
in `apps/web/src/ui/combat.ts` says exactly this, unprompted: *"Enemies carry no spellbook/save **yet**
... omit `save` ⇒ never saves — full effect — rather than an invented number."*

This is the same "decode-once, one flat field, one choke point" shape every M23-M26 pick has had, but
**stronger** than any of them on two axes: (1) the decoded value is not merely present in isolated real
bytes — it is **already asserted against real bytes in a committed, currently-green engine test**
(`packages/engine/test/monster.test.ts`), so this round needed zero fresh decode work, only an
independent re-verification (done below, from scratch, without touching that test); and (2) the affected
mechanic is not a single monster family's niche special attack — it is **nine core spells**, castable by
any real mage/cleric character the player builds, against **any** monster in the (CoK) live explorer.

---

## Option A re-confirmed blocked (read-only re-check, not re-implemented)

Per the task brief, this round first re-traced M26's flagged follow-on — "replace `treasure.ts`'s
synthetic `DROP_TABLE` with a real join against `MonsterItem`, unblocking magic-bonus/charges/cursed
items at once" — against the **current** tree, independently, rather than trusting the prior write-up:

- **`packages/engine/src/items/inventory.ts`'s `InventoryEntry`** (lines 14-23) still has exactly four
  fields (`name`, `baseTypeId`, `count`, `equipped`) — no per-instance magic-bonus/charges/cursed field
  of any kind. `computeThac0(baseThac0, magicBonus = 0)` (lines 153-160) still carries its 2026-06-27-era
  doc comment verbatim: *"Stock gear carries no magic bonus ... this returns the base THAC0 today."*
- **`apps/web/src/ui/party.ts`'s `CLASS_STARTER_KIT`** (lines 787-794) is still six flat base-type-id
  arrays (`[10, 14, 81]` etc.) — no class ever starts with a real per-instance enchanted item.
- **`apps/web/src/ui/town.ts`'s `SHOP_STOCK`** (line 64) is still a flat `[10, 12, 14, 15, 81, 64, 8]`
  base-type-id array — the shop has never sold a real magic item.
- **`packages/engine/src/items/treasure.ts`'s `DROP_TABLE`/`rollTreasure`** (lines 30-59) is still an
  RNG pick over 5 hardcoded base-type ids with no `plus`/`charges`/`cursed` field at all — unchanged
  since M26 read it. Its own header comment still calls the whole module "CANDIDATE ... pending the
  real treasure-class tables."
- **The ECL `TREASURE` opcode (0x27) is still uninterpreted.** `packages/engine/src/ecl/vm.ts:603-608`'s
  `default:` branch still surfaces it as an `'unhandled'` effect and skips it — confirmed by re-reading
  the live switch statement, not just grepping for the word.

**Conclusion (reconfirmed, 4th independent audit): still genuinely bigger than an S-sized slice.** The
honest minimum path to "a real magic item enters a player's inventory" requires *at least* three
independent changes that don't share a single choke point — (1) a schema change to `InventoryEntry`
(and by extension `TreasureItem`/`giveItemsToMember`) to carry a per-instance bonus at all, (2) a real
**source** for that instance (either a `TREASURE`-opcode interpreter — itself a new dispatch case with
operand semantics to reverse, not a one-line join — or replacing `treasure.ts`'s RNG table with a
`MonsterItem`-sourced join, which changes the *kind* of roll the whole module makes, not just adds a
field), and (3) at least one live consumer path (`computeThac0`'s `magicBonus` parameter, threaded from
wherever the item ends up equipped). Each piece individually resembles an M23-M26-sized slice, but they
don't compose into one — there is no single existing choke point that, once touched, makes real data
flow end-to-end, unlike every other candidate this project has shipped. Per the task brief's own
instruction, falling back to Option B rather than proposing this as a disguised multi-day rewrite.

---

## RECOMMENDED: wire `MonsterRecord.savingThrows.spell` into `TacticalCombatant.save` for the enemy side

### (a) Exact file/function that already computes it, and the exact gap

- **`packages/engine/src/loaders/monster.ts`** — `MonsterRecord.savingThrows: SavingThrows` (field
  declared line 169; decoded by `readSaves(raw, layout.saves)`, lines 299-308) is populated from the
  **verified, located** CoK offset **208..212** (`COK_LAYOUT.saves = 208`, line 99) for every CoK
  monster — this is not new: the file's own header comment (lines 17-18) has documented this offset
  since the loader was first written, and it is independently **golden-tested against real bytes today**
  (`packages/engine/test/monster.test.ts:171-177`, GOBLIN `{16,17,18,20,19}`; line 180, RED DRAGON
  `paralyzePoisonDeath: 7`, "best saves").
- **The consumer already fully exists and is fully built**, on the **party** side only:
  - `packages/engine/src/combat/tactical.ts:174-180` — `TacticalCombatant.save?: number`, doc-commented
    *"the d20 target this figure must roll ≥ to make a saving throw against a spell ... Omit for a
    figure with no save data — it then never saves (full effect), rather than the engine inventing a
    number."*
  - `tactical.ts`'s `applyCast()` (lines 1291-1349) already does the full mechanic: `rollsSave =
    spell.save !== 'none' && t.save !== undefined` (line 1316), `saved = rollsSave ? rng.die(20) >=
    t.save! : false` (line 1317), then **half/negate damage mitigation** (line 1331: `if (saved) dmg =
    spell.save === 'negate' ? 0 : Math.floor(dmg / 2)`) and **status-effect negation** (lines 1339-1347:
    a failed save applies the inflicted status, a made save avoids it). This is a complete, tested,
    already-shipped mechanic — nothing here needs building.
  - `tactical.ts`'s `aiTargetWouldSave()` (lines 1661-1671) and `chooseOffensiveCast()` (lines 1673-1694)
    also read `.save` (for the *opposite* direction — an enemy caster deciding whether a save-allowing
    spell is worth casting at the party). This direction is **already correctly fed by the party side**
    (see below) and is unaffected by this candidate; noted only for completeness.
  - **`apps/web/src/ui/party.ts`'s `spellSaveForMember(id, day)`** (lines 685-697+) is the party-side
    join: `const base = sheet.savingThrows.spell` (a **different, already-fully-wired** type,
    `CharacterSheet.savingThrows`, computed at character creation from `addnd1e`'s
    `combatTables.ts savingThrows(classId, level)` — not the same data as `MonsterRecord.savingThrows`,
    but the identical *shape* of value feeding the identical consumer field). This function is called at
    the **one** choke point that builds every real tactical combatant:
- **The exact, self-documented gap — `apps/web/src/ui/combat.ts`'s `makeTC()`** (lines 307-341):
  ```ts
  // Enemies carry no spellbook/save yet (omit `save` ⇒ never saves — full effect — rather than an
  // invented number), ...
  ...
  save: side === 'party' && !demo ? spellSaveForMember(c.id, day) : undefined,   // line 334
  ```
  This is the **one** place a `TacticalCombatant` is assembled for both sides. The party branch calls
  `spellSaveForMember`; the enemy branch is a hardcoded `undefined`, with a comment that says, verbatim,
  this hasn't been done **yet**. `MonsterRecord.savingThrows` is decoded by the very same
  `MON1CHA.DAX` fetch this file already uses for every fight (via `spawnEnemies`/`monsterLookup`,
  `packages/engine/src/combat/encounter.ts:48-63`) — no new asset fetch, no new side-table join, nothing
  the M23.S2/M26 "new `spcPath`/`itmPath` fetch" pattern needed. The record has been sitting fully
  decoded in memory at this exact point since before M23.

### (b) Real-bytes + COAB verification

**Real bytes — independently re-derived this round**, not merely trusted from the existing test. A
from-scratch Python probe (container/RLE logic transcribed from this project's own verified
`tools/dax_decode.py` header, **not** the TypeScript loader or its test file — an independent
cross-check) decoded `Champions of Krynn/MON1CHA.DAX` directly and printed every monster's raw bytes at
offsets 208-212:

| blockId | name | saves (PPD, PetPoly, RSW, Breath, **Spell**) |
|---|---|---|
| 9 | GOBLIN | 16, 17, 18, 20, **19** |
| 21 | RED DRAGON | 7, 8, 9, 7, **10** |
| 38 | BLACK ROBE MAGE | 14, 13, 11, 15, **12** |
| 16 | MINOTAUR | 8, 9, 10, 9, **11** |
| 59 | SOLDIER | 10, 11, 12, 12, **13** |

Two independent cross-checks confirm these are real, correct, not noise:
1. **Exact match to the existing golden test.** `monster.test.ts:171-177` asserts GOBLIN's saves equal
   `{16, 17, 18, 20, 19}` — this round's from-scratch re-derivation (a different decoder, written fresh
   for this audit) reproduces the identical five bytes.
2. **Exact match to this project's own `addnd1e` saving-throw table.** BLACK ROBE MAGE's decoded row
   `[14, 13, 11, 15, 12]` is byte-for-byte identical to `packages/engine/src/ruleset/addnd1e/
   combatTables.ts`'s `SAVES.magicUser` row for levels 1-4 (line 64: `[20,20,20,20,20], [14,13,11,15,12],
   [14,13,11,15,12], [14,13,11,15,12], [14,13,11,15,12], ...`) — a CoK-authored NPC magic-user's stored
   save bytes match our independently-transcribed COAB `SaveThrowValues` table exactly, the strongest
   possible sanity check available (two unrelated sources agreeing on the same five numbers).
3. `docs/engine/research/cok-monster-format.md:26` (a pre-existing project doc, not authored for this
   audit) independently characterizes the same three example rows as *"textbook 1e monster save
   progression"* — the field was already understood to be a correct, plausible, faithful decode; this
   round's contribution is confirming it against real bytes fresh and tracing the missing consumer join.

**COAB oracle.** `coab_extracted/engine/ovr024.cs:554-583`, `RollSavingThrow(saveBonus, saveType,
player)` (`// do_saving_throw`):
```csharp
internal static bool RollSavingThrow(int saveBonus, SaveVerseType saveType, Player player)
{
    gbl.savingThrowRoll = roll_dice(20, 1);
    if (gbl.savingThrowRoll == 1) gbl.savingThrowMade = false;
    else if (gbl.savingThrowRoll == 20) gbl.savingThrowMade = true;
    else {
        gbl.savingThrowRoll += saveBonus + player.field_186;
        gbl.saveVerseType = saveType;
        CheckAffectsEffect(player, CheckType.SavingThrow);
        gbl.savingThrowMade = gbl.savingThrowRoll >= player.saveVerse[(int)saveType];
    }
    return gbl.savingThrowMade;
}
```
Called against a **`Player`** — and per this project's own established finding ("monsters are characters
in the Gold Box engine, sharing the .CCH-family layout," `monster.ts`'s own header, line 3), COAB's
`Player` struct is the same one monsters use. Confirmed by call sites that clearly target monsters, not
just PCs: `ovr014.cs:2376/2390/2404` (breath-weapon/petrification/generic saves against `target`, inside
the monster-attack-resolution overlay), `ovr013.cs:852/887/1067/1526/1767` (poison/spell/breath saves
against `gbl.spell_target`/`player` from the affect-effect table monsters use), and — most directly on
point — `ovr023.cs` (the spell-effect overlay), which calls `RollSavingThrow(0, SaveVerseType.Spell,
target)` or `gbl.spellCastingTable[...].saveVerse` at **every** Fireball/Lightning-Bolt/Hold-Person/
Slow/Fear-equivalent effect function (e.g. lines 593, 975, 1149, 2376, 2400, 2447, 2497, 2575), with
`target` resolved from whichever side the caster's spell is aimed at — i.e., **a party mage's Fireball
rolls a saving throw against the monster's own stored save value**, exactly the mechanic this candidate
wires. `reclac_saving_throws` (`ovr026.cs:334`, called at `ovr018.cs:587`/`ovr026.cs:688`) is the
function that (re)computes a `Player.saveVerse` table from class/level — the same table our
`addnd1e/combatTables.ts` already transcribes for the party side (and which, per the BLACK ROBE MAGE
cross-check above, the shipped Krynn monster bytes match row-for-row).

**A previous audit already flagged the underlying gap by name, as a blocker for a different pick.**
`BUILD-QUEUE.md`'s M24.S1 Done entry (and `m24-audit.md`'s rejected-candidates table) explicitly says,
of `con_saving_bonus` (COAB affect `0x61`): *"the tactical/abstract combat engines don't currently model
per-monster saving throws at all ... adding monster-side saving throws ... is a bigger, separate lift
than a wiring fix."* This round found that the *prerequisite* M24 described — "monster-side saving
throws don't exist in the combat model" — is **not quite accurate**: the *data* has existed, decoded and
verified, since the loader was first written; what's missing is only the one-line join at `makeTC()`.
Wiring this candidate would, as a side effect, retroactively make `con_saving_bonus` a much smaller
follow-on than M24 assessed it to be (see "Implications" below) — but this candidate does **not** wire
`con_saving_bonus` itself (that still needs its own Con-band bonus-lookup function and a place to apply
it before the save roll; out of scope here, kept to the established "one flat field" bar).

### (c) Exact live call sites to wire

1. **`packages/engine/src/loaders/monster.ts`** — make `savingThrows` **optional**, `undefined` for the
   DoK compact record, mirroring the file's own existing convention for `combatSize`/`morale`
   (`decodeCombatSize`/`decodeMorale`, lines 245-260, both already `off === null → return undefined`):
   - `MonsterRecord.savingThrows: SavingThrows` (line 169) → `savingThrows?: SavingThrows`.
   - `readSaves(raw, base)` (lines 299-308): `if (base === null) return { ...NO_SAVES };` →
     `if (base === null) return undefined;` (return type becomes `SavingThrows | undefined`).
   - **Why this is a required correctness gate, not a nice-to-have:** DoK's compact 216-byte record has
     `saves: null` in `DOK_LAYOUT` (line 119) — its saves are genuinely **not located** (documented gap
     B5, `monster.ts`'s own header lines 53-54). Today `readSaves` papers over that with an all-zero
     `NO_SAVES` placeholder (lines 291-297), which the existing golden test already surfaces as a known
     quirk: `monster.test.ts:256`, `expect(by('NIGHTMARE')!.savingThrows.spell).toBe(0)`. A "roll d20 ≥
     0" target **always succeeds** (any 1-20 roll clears it) — so naively wiring `.spell` straight
     through **without** this fix would make every DoK monster auto-save against every spell, a new and
     *wrong* behavior (the opposite error from today's "never saves"), not a neutral no-op. Making the
     field properly optional and gating on `undefined` (not on "is it zero") is what keeps DoK's
     behavior **exactly unchanged** (still "never saves," still honestly gapped pending B5) while CoK
     gets the real fix. `monster.test.ts:256`'s assertion needs updating to
     `expect(by('NIGHTMARE')!.savingThrows).toBeUndefined()` as part of this change — the **only**
     existing test-file edit this slice requires (grep confirms `MonsterRecord.savingThrows` has
     exactly one consumer outside its own decode function: this one test; `.savingThrows` elsewhere in
     the tree is always the unrelated `CharacterSheet`/`SavedCharacter` party-side field, untouched).
2. **`packages/engine/src/combat/combat.ts`** — add `import type { SavingThrows } from
   '../ruleset/types.js';`; add `monsterSpellSave?: number` to the `Combatant` interface (next to
   `itemPluses`, lines ~91-99, same doc-comment convention: *"The d20 save-vs-spell target from this
   monster's own `MON{n}CHA.DAX` saving-throw block (offset 208-212, the 'spell' column) — sourced by
   `monsterCombatant()` from `MonsterRecord.savingThrows.spell`. Undefined ⇒ no data (DoK's compact
   record, or an unresolved/demo enemy); the tactical layer then leaves the figure's own `save` unset,
   the pre-existing safe default. Party figures never carry this — see `spellSaveForMember` for their
   equivalent."*); add `savingThrows?: SavingThrows` to `monsterCombatant()`'s inline parameter type
   (lines 262-275, next to `itemPluses?: number[]`) and `monsterSpellSave: mon.savingThrows?.spell,` to
   its return object (lines 279-294, next to `itemPluses: mon.itemPluses`) — the exact same
   decode-through-record-through-combatant shape `regenPerRound`/`halfDamage`/`itemPluses` already use.
3. **`apps/web/src/ui/combat.ts`'s `makeTC()`** (line 334) — the **one** behavioural change:
   ```ts
   save: side === 'party' && !demo ? spellSaveForMember(c.id, day) : c.monsterSpellSave,
   ```
   (was `: undefined`). For demo enemies / unresolved ids `c.monsterSpellSave` is simply absent (they
   aren't built via `monsterCombatant()`), so the fallback stays exactly `undefined` — no regression to
   the `?combat=1` standalone demo. Also update the stale doc comment above `makeTC()` (lines 295-306,
   currently *"Enemies carry no spellbook/save yet"*) to describe the new CoK-real / DoK-still-gapped
   split.
4. **`TacticalCombatant extends Combatant`** (`tactical.ts:120`), so `monsterSpellSave` is inherited with
   zero additional interface edits there — same free ride M23-M26's monster fields all got.

### (d) Why it needs no new state-tracking machinery

A **flat, static, per-monster number**, read once at `TacticalCombatant` construction (`makeTC()`), with
**zero** new logic in either combat engine — `applyCast()`'s save/half/negate/status-negation machinery,
`aiTargetWouldSave()`, and `chooseOffensiveCast()` are **already fully implemented and already exercised**
(the CT.4b/CT.5a proof plan already covers them on the party side); this candidate only ever changes
which combatants have a non-`undefined` `.save`. No duration, no counter, no per-round tick, no new spell
data (`combatSpells.ts`'s nine save-allowing spells already exist and are already castable), and — unlike
every prior M23-M26 pick — **no new asset fetch**: `MonsterRecord.savingThrows` rides in on the exact
`MON1CHA.DAX` decode that has been live since before this M-phase series began.

### (e) Size: S

Comparable to M24.S1/M25.S1 (a handful of one-line-per-file threads at an existing choke point) and
*smaller* than M23.S2/M26 in the plumbing dimension (no new `gameData.ts` field, no new fetch, no new
`explore.ts` join — the source data is already resident in the `monRecords`/`monsterLookup` the explorer
has built for every fight since M2.S6). The one extra step beyond a pure "thread a field through" (making
`savingThrows` optional in the loader) is itself small, mechanical, and fully precedented by the same
file's existing `combatSize`/`morale` treatment.

---

## Proof plan

- **Engine unit tests** (deterministic; real bytes where possible; mirrors M23.S2-M26's "split it"
  lesson — prove the plumbing without needing an RNG-resolved spell-cast):
  1. `monster.test.ts` (existing file): update the one DoK assertion
     (`savingThrows.spell → toBe(0)` becomes `savingThrows → toBeUndefined()`), and add a CoK real-bytes
     assertion in the existing golden `it(...)` block for a second monster beyond GOBLIN (e.g. `expect(by
     ('RED DRAGON')!.savingThrows.spell).toBe(10)`, a value this audit's independent probe reproduces —
     the CoK golden test already asserts `paralyzePoisonDeath` for RED DRAGON, so this is a one-line
     sibling assertion on the same object, not a new fixture).
  2. New synthetic `monsterCombatant()` test in `combat.test.ts`: a fabricated `MonsterRecord`-shaped
     input with `savingThrows: { spell: 19, ... }` produces `Combatant.monsterSpellSave === 19`; a
     fabricated input with `savingThrows: undefined` (the DoK shape, post-fix) produces
     `monsterSpellSave === undefined` — mirrors the existing `regenPerRound`/`halfDamage`/`itemPluses`
     pass-through tests exactly.
  3. A **real-bytes join** test: decode the real `Champions of Krynn/MON1CHA.DAX`, pass GOBLIN's real
     `MonsterRecord` through `monsterCombatant()`, assert `.monsterSpellSave === 19`; do the same for
     RED DRAGON and assert `.monsterSpellSave === 10` — proves two *different* real per-monster bytes
     both reach the combatant correctly (a stronger check than a single fixed value, since it rules out
     an accidental constant).
- **One e2e** (`?explore=1` for CoK, matching the CT.4b/M22.S2 shape) — **reuses three already-existing
  seams with zero new seam code required**:
  1. `window.__explore.testFight()` (the pre-existing A3.4 seam — 3 real GOBLINs, `MON1CHA` block **9**)
     → open combat → `window.__combat.spellSave('e0')` should read **19** (today: `null`).
  2. `window.__explore.testFightMonster(21, seed)` (RED DRAGON, block **21**, the pre-existing M23.S2-
     style seam) → `window.__combat.spellSave('e0')` should read **10** — a second, different real value
     from the same seam/field, ruling out a hardcoded constant.
  3. **Same-real-data negative control, cross-game** (mirrors M23.S2/M24.S1/M26's DoK-vs-CoK contrast
     pattern): switch to `?explore=dok`, spawn a real DoK monster via `testFightMonster` (e.g. GHOUL, the
     id M24.S1 already established as a clean control), and confirm `spellSave('e0')` is still `null` —
     proving the loader fix's `undefined`-for-DoK guard works and this slice does **not** silently grant
     DoK monsters a fabricated save.
  The existing `spellSave` seam (`apps/web/src/ui/combat.ts:1150`, already used against party ids `'p1'`
  by the CT.4b plumbing check and the M22.S2 moon-phase e2e, `apps/web/test/e2e.mjs:2451,2660`) is
  **generic over combatant id** — no new seam, no new plumbing in the e2e harness at all, only new
  assertions against ids it has never been pointed at before (`'e0'`).

---

## Candidates investigated and rejected this round

### Item-instance subsystem (Option A — re-confirmed, not re-implemented)

| Candidate | Verdict |
|---|---|
| Replace `treasure.ts`'s synthetic `DROP_TABLE` with a real `MonsterItem`-sourced join (M26's flagged follow-on) | **Re-confirmed still blocked, fresh this round** (see "Option A re-confirmed blocked" above) — no single choke point; needs a schema change + a new instance-source + a consumer thread, none of which is a one-line join. Left for its own dedicated phase, per M26's own recommendation, now confirmed a 4th time. |
| ECL `TREASURE` opcode (0x27) interpreter | Re-confirmed unimplemented (`ecl/vm.ts:603-608`, still the generic `default:` unhandled-effect branch). Implementing it is a new-dispatch-case-plus-operand-semantics task, not a wiring fix — same conclusion as M19/M24/M26. |

### Fresh sweep (Option B), areas the brief suggested

| Area | Finding |
|---|---|
| **Saving throws** | **This round's pick** — see RECOMMENDED above. |
| Character/party mechanics | No new candidate beyond M25's exhaustive sweep (racial ability ranges, level-up, multiclass XP, encumbrance, aging — all already either wired or explicitly not-applicable-to-Krynn per M25). Not re-derived in depth this round per the brief's "don't re-litigate closed items" instruction. |
| Dungeon/exploration | M25 already found this area empty (no trap/secret-door/light-source/hazard-formula gap exists because the underlying mechanics were never implemented in the original engine, not because of a wiring omission). Spot-checked for anything new since M25 landed — nothing has changed in this area. |
| Combat odds and ends | The **other four** `SavingThrows` columns (`paralyzePoisonDeath`, `petrifyPolymorph`, `rodStaffWand`, `breath`) are *also* real, decoded, byte-verified — but **no live mechanic reads any of them** (no poison-damage effect, no petrification effect, no rod/staff/wand effect, no breath-weapon effect exists anywhere in either combat engine, re-confirmed via the same greps M24 already ran). Per this project's "verify against real bytes, don't build for hypothetical data" convention (ADR-0006's spirit), these four are flagged as **real-but-genuinely-unconsumed** (a fact worth recording so a future audit doesn't re-derive this from scratch), not folded into this slice — `.spell` is the only column with an existing, built, tested consumer field to join into. |
| NPC/dialogue, town/shop economy | Already exhaustively covered and rejected by M19/M24/M25 (reaction rolls, loyalty/hire, shop pricing formulas — all either non-existent mechanics or blocked by the same item-instance gap re-confirmed above). Not re-swept in depth; no new evidence found that would change those verdicts. |
| Ability-score-derived bonuses | M25 shipped the Dexterity missile-hit bonus; this round didn't find a second unwired ability-derived bonus with a real consumer (the natural next one, Strength's melee-only vs. missile-baked-in double-count, is M25's own documented "honest scope note" follow-on, not a fresh finding). |

---

## Open questions / unknowns

- **The other four `SavingThrows` columns** (`paralyzePoisonDeath`, `petrifyPolymorph`, `rodStaffWand`,
  `breath`) remain real, decoded, and byte-verified but **structurally unconsumed** — there is no poison/
  petrification/rod-staff-wand/breath-weapon mechanic in either combat engine for them to feed. This
  mirrors the exact situation M24 documented for `prot_drag_breath` (needs a modeled breath-weapon
  mechanic that doesn't exist) and is not a gap introduced by this candidate — flagged so a future audit
  doesn't re-discover it as if new.
- **DoK's compact-record saving throws remain UNLOCATED** (gap B5, pre-existing, not attempted here).
  DoK monsters keep their current "never saves" behavior honestly (via `undefined`, not a fabricated
  placeholder) until/unless a future pass locates the real bytes in the 216-byte record.
- **`con_saving_bonus` (COAB affect `0x61`, M24's rejected candidate) becomes a smaller follow-on** once
  this slice lands — see Implications below. Not built here; still needs its own Con-band bonus-lookup
  function and an application point *before* the save roll (`applyCast()`'s `rng.die(20) >= t.save!`
  line would need a `- conBonus` term), which is genuine new logic, not just a join. Flagged for a future
  round, not silently folded in.
- This round's e2e proof plan targets CoK area 1 only (`MON1CHA.DAX`, the only file the live explorer
  currently loads, matching M23.S2/M24.S1/M26's identical scoping note) — a full multi-area sweep once
  the explorer supports later CoK/DoK dungeon areas would likely find more thematically-apt examples
  (e.g. a lich or dragon with an unusually strong/weak save) but is not needed to justify this slice.

## Implications for our engine

- The M23-M26 "decode generically once, map one flat field into an optional `Combatant`/`MonsterRecord`
  property, apply at the nearest existing choke point" template generalizes yet again — this time to a
  **ruleset-table byte family** (`SavingThrows`) rather than a monster-affect side-table, and to the
  **tactical-only** consumer surface (`TacticalCombatant.save`) rather than either combat engine's core
  loop, needing **zero new fetch/join plumbing at all** (a first among the M23-M27 picks — even M24.S1's
  "zero new plumbing" claim still relied on M23.S2's newly-added `spcPath` fetch; this candidate's data
  has been resident since before the M-phase series started).
- **This slice retroactively de-risks a previously-rejected candidate.** M24 assessed `con_saving_bonus`
  as blocked by "the tactical/abstract combat engines don't currently model per-monster saving throws at
  all." After this slice, that statement becomes false — monster saving throws *would* be modeled (for
  CoK); `con_saving_bonus` would then only need a small Con-derived offset applied before the roll, not a
  whole missing subsystem. Worth flagging for whoever picks up the `MON{n}SPC.DAX` affect family next,
  the same way M26 flagged the item-instance subsystem as newly-relevant for three prior picks.
  Future audits should re-open `con_saving_bonus` **after**, not instead of, this slice.
- **A useful general lesson for future audits**: a "real decoded value with zero live callers" can be
  hiding not just behind a missing *fetch* (M23.S2/M26's shape) but behind a **consumer field that
  already exists and is already fully built for one side of a two-sided mechanic** (party save vs.
  monster save) while the other side was simply never joined. Worth checking, for any future
  two-sided mechanic (attacker/defender, caster/target, party/monster), whether *both* sides' data paths
  were actually completed, not just one.
