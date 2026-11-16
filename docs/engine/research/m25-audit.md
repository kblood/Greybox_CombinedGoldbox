# M25 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/HANDOFF.md` + `BUILD-QUEUE.md`'s M15–M24 "Done" entries to
> reconfirm the recurring pattern (real, COAB-verified engine logic with zero live call sites), then
> deliberately swept **fresh ground** the M19/M23/M24 audits had not covered: character/party
> mechanics (racial ability adjustments, level-up, multiclass XP, encumbrance, aging), dungeon/
> exploration (traps, secret doors, light sources, hazards), spellcasting (failure/concentration/
> save-by-level beyond M20-M22), combat odds-and-ends (called shots, weapon-vs-armor, two-weapon,
> mounted, missile), and NPC/dialogue (reaction rolls, loyalty/hire). Per the task brief, the
> already-picked-over `MON{n}SPC.DAX` affect family (`detect_invisibility`, `owlbear_hug_check`,
> `con_saving_bonus`, `prot_drag_breath`, `resist_magic_*`, `feeblemind`/`paralizing_gaze`/
> `thri_kreen_paralyze`) and the item-identify/hidden-name subsystem (M19/M24) are **not**
> re-litigated below except where a new, non-overlapping finding changes the picture. Nothing in
> this document has been implemented — this is read-only research, per the M25 task brief.

## RECOMMENDED: the Dexterity **missile-attack** to-hit bonus (COAB `DexReactionAdj`, applied by `CalculateAttackValues`/`sub_66023` only to ranged weapons) — computed by our own `addnd1e` ruleset, never added to any attack roll

Wire `ADND1E_ABILITIES.dexterity(dex).missile` — a real, HIGH-confidence 1e-PHB-transcribed value our
own engine **already computes on every character** — into the **one** place a missile/thrown attack's
to-hit number is resolved: `tactical.ts`'s `resolveHit()` missile branch. This is a **party-side**
combat-math gap (the previous four M-phase affect-wiring rounds were all monster-side), verified both
by our own ruleset table and, freshly this round, by the COAB decompile's own `CalculateAttackValues`
routine, which is the strongest evidence tier available (a byte-level oracle for the *exact* mechanic,
not just a PHB citation).

### (a) Exact file/function that already computes it

- **`packages/engine/src/ruleset/addnd1e/abilities.ts`** — `ADND1E_ABILITIES.dexterity(score)` (lines
  99-102) returns `{ missile, defensiveAc, reaction }` from the `DEX` lookup table (lines 42-60), a
  direct transcription of the 1e PHB Dexterity table. `.defensiveAc` is consumed everywhere DEX is
  looked up; **`.missile` is computed and returned by every single call, but not one caller anywhere
  in `packages/engine`, `apps/web`, or `apps/author` ever reads the `.missile` field** (confirmed by
  grep — `grep -rn "\.missile\b" apps/web/src apps/author/src packages/engine/src` matches only an
  unrelated combat-log event flag `e.missile`/`c.missile`, never `dex.missile`).
- The two live production builders that turn a `CharacterSheet`/`PartyMemberSpec` into a `Combatant`
  both compute the `dex` object and only ever touch `.defensiveAc`:
  - **`apps/web/src/ui/party.ts`'s `sheetToCombatant()`** (line 345-358) — the **real production**
    builder used by `partyCombatants()`, which is what every live combat (`explore.ts`, `wilderness.ts`,
    dialogue-triggered combat) actually fights with. It computes `str` for melee damage but does not
    even construct a `dex` object at all today.
  - **`packages/engine/src/combat/party.ts`'s `partyCombatant()`** (line 38-76) — the **DEMO_PARTY
    fallback** builder (used only when the roster is empty). It *does* compute `const dex =
    ruleset.abilityMods.dexterity(spec.abilities.dex)` (line 55) but only reads `dex.defensiveAc`
    (line 59); `dex.missile` is computed and discarded in the same function, one line away from where
    it's needed.
- There is **zero unit-test coverage of the ability tables at all** — `grep -rln
  "ADND1E_ABILITIES|abilityMods" packages/engine/src --include=*.test.ts` is empty, and there is no
  `abilities.test.ts` file. The table is only indirectly exercised via `character.test.ts`/
  `party.test.ts` assertions on `sheet.thac0`/`sheet.ac`, neither of which touches `.missile`.

### (b) Real-bytes / COAB verification (fresh this round — stronger than the existing PHB citation)

The existing project doc (`docs/engine/research/addnd1e-tables.md`) already labels the Dexterity
table **"HIGH (1e PHB)"**, but that confidence tier was a **book transcription**, not a decompile
cross-check — the same tier the STR/CON columns share (and those *are* already wired). This audit
went one step further and found the **actual COAB implementation of this exact mechanic**, which the
prior `docs/engine/research/combat-mechanics-coab.md` (§4 TO-HIT) had only identified the *existence*
of (`hitBonus` field, "a signed bonus applied to the attack roll") without tracing where it's computed:

```csharp
// coab_extracted/engine/ovr025.cs:10-31  (CalculateAttackValues, sub_66023)
internal static void CalculateAttackValues(Player player) // sub_66023
{
    Item item = player.activeItems.primaryWeapon;
    if (item != null)
    {
        ItemType item_type = item.type;
        player.hitBonus = player.thac0;
        if ((gbl.ItemDataTable[item_type].field_E & ItemDataFlags.flag_02) != 0)
        {
            player.hitBonus += DexReactionAdj(player);   // <- Dex bonus, RANGED WEAPONS ONLY
        }
        player.attack1_DamageBonus = gbl.ItemDataTable[item_type].bonusNormal;
        if ((gbl.ItemDataTable[item_type].field_E & ItemDataFlags.melee) != 0)
        {
            player.hitBonus += strengthHitBonus(player);   // <- Str bonus, MELEE WEAPONS ONLY
            player.attack1_DamageBonus += strengthDamBonus(player);
        }
        ...
    }
}

// coab_extracted/engine/ovr025.cs:537-573
internal static int DexReactionAdj(Player player)
{
    int stat_val = player.stats2.Dex.full;
    if (stat_val >= 0 && stat_val <= 2) return -4;
    if (stat_val >= 3 && stat_val <= 5) return stat_val - 6;      // 3→-3, 4→-2, 5→-1
    if (stat_val >= 16 && stat_val <= 18) return stat_val - 15;   // 16→+1, 17→+2, 18→+3
    if (stat_val >= 19 && stat_val <= 20) return 3;
    if (stat_val >= 21 && stat_val <= 23) return 4;
    if (stat_val >= 24 && stat_val <= 25) return 5;
    return 0;
}
```

`player.hitBonus` (the fully-resolved effective THAC0, per `docs/engine/research/combat-mechanics-coab.md`
§4 and the `0x3C − hitBonus` display convention already documented in `addnd1e-tables.md`) is exactly
the value read at the actual d20 comparison, `ovr024.cs:544` (`PC_CanHitTarget`):

```csharp
if ((gbl.attack_roll + attacker.hitBonus + team_bonus) >= target_ac) hit = true;
```

So the chain is fully traced end-to-end: **weapon-kind-gated Dex/Str bonus → `hitBonus` → the actual
hit roll.** `DexReactionAdj` is applied **only when the equipped item has the "flag_02" `ItemDataFlags`
bit** — `flag_02` itself is not decompiler-named (the `ItemData.cs` enum lists it only as `flag_02 =
0x02`, next to the confirmed-named `melee = 0x04`), so which exact bit it is remains **(inferred)** as
"the ranged/missile flag" from context (it gates the *opposite* weapon category from the confirmed
`melee` flag, and it's the branch that adds a *Dexterity*-derived bonus — melee weapons get the Str
bonus instead, never both). This inference is used consistently by this project's own established
weapon-kind split (`packages/engine/src/items/combatEquip.ts`'s `kind: 'melee' | 'missile' | 'thrown'`
already partitions weapons the same way, independent of this finding).

**A genuine byte-value discrepancy worth flagging honestly:** COAB's own table (`16→+1, 17→+2, 18→+3`)
does **not** match the classic 1e PHB Reaction/Missile-Adjustment column our `abilities.ts` transcribed
(`16→+1, 17→+2, 18→+2`) — SSI's engine gives DEX 18 one point *more* than the book (+3, matching its
own 19-20 plateau one row early) — same shape as this project's own precedent (RE.1's diagonal-move-cost
correction, `combat-mechanics-coab.md`'s AC-encoding correction): **the game's own code, not the
rulebook, is what we should encode.** Implementing this candidate is the natural moment to fix that
one-row divergence too (extend `DEX` in `abilities.ts` past 19 using COAB's 21-23→+4/24-25→+5 bands,
and correct row 18's `missile`/`reaction` entries from `2` to `3`, leaving `defensiveAc` alone — COAB's
own `strengthHitBonus`/`strengthDamBonus` melee tables were spot-checked against our `STR_BASE` table
in the same pass and are consistent, so no correction needed there).

**Honest verification gap:** this round traced the mechanism through the **COAB** oracle (byte-exact,
function-level) but did **not** independently re-confirm it against CoK's/DoK's own disassembly
(`tools/disasm_cok.py`/`disasm_dok.py`), unlike the RE.1 initiative/death/morale/diagonal-cost items
which got that extra confirmation pass. The to-hit primitive itself (`d20 >= thac0 - ac`, nat-20/nat-1)
*is* already RE.1-confirmed identical in CoK/DoK's own code (`disasm-combat-cok.md`/`disasm-combat-dok.md`),
and `CalculateAttackValues` is exactly the composition step that feeds that primitive its `hitBonus`
operand — so this is very likely present verbatim, but calling it "CoK/DoK own-binary byte-confirmed"
would overstate this round's work. Flagged in Open Questions below, not silently upgraded.

### (c) Exact live call site(s) to wire

1. **`packages/engine/src/combat/combat.ts`** — add `missileHitBonus?: number` to the `Combatant`
   interface (next to `halfDamage`, same doc-comment convention: "undefined ⇒ no bonus, the common
   case for monsters and for any melee-only figure").
2. **`packages/engine/src/combat/tactical.ts`** — `TacticalCombatant extends Combatant`, so no separate
   interface edit needed there (exactly like M24.S1's `halfDamage`). Apply it in `resolveHit()`
   (~line 1123-1132), in the **existing missile-only branch that already adjusts `needed` for range
   bracket** — the cleanest possible choke point, one line below the existing adjustment:
   ```ts
   if (missile) {
     bracket = missileRangeBracket(figureDistance(actor, target), weapon.range ?? 0);
     needed -= rangeBracketToHit(bracket);
     needed -= actor.missileHitBonus ?? 0;   // NEW — Dex missile-attack adjustment (party only today)
   }
   ```
   `combat.ts`'s older positionless resolver models **melee only** ("faithful 1e melee subset; ranged/
   spells/morale come later" — its own header comment), so there is **no missile to-hit roll to touch
   there at all** — this candidate needs edits in exactly one combat engine, not two (smaller than
   M24.S1, which touched both).
3. **`apps/web/src/ui/party.ts`'s `sheetToCombatant()`** (line 345-358) — the real production builder.
   Add:
   ```ts
   const dex = ADND1E_ABILITIES.dexterity(sheet.abilities.dex);
   ...
   missileHitBonus: dex.missile || undefined,
   ```
   `ADND1E_ABILITIES` is already imported in this file (used for `str` two lines above). This is the
   **actual live path** every real fight uses — `combat/party.ts`'s `partyCombatant()` (which already
   computes `dex` but drops `.missile`) is only the DEMO_PARTY fallback, but should get the same
   one-line addition for consistency (`missileHitBonus: dex.missile || undefined` alongside its
   existing `thac0`/`ac` fields) since it is real, shipped, reachable code (`?combat=1` standalone
   demo, `wilderness.ts`'s DEMO_PARTY branch).
4. **Monster side — deliberately not touched.** COAB's `CalculateAttackValues` takes a shared `Player`
   struct that (per `decompilation-sources.md`) monsters also use, so in principle a monster archer
   could get the same bonus from its own Dex. But this engine's monster combatants get their `thac0`
   directly from the decoded `MON{n}CHA.DAX` byte (already a fully-resolved effective THAC0 from the
   real game data), not recomputed from ability scores — there is no live monster-side Dex-to-missile
   recompute path to hook, and inventing one would be new machinery with no real trigger (the same
   ADR-0006 caution M24's audit already applied to a generic affect dispatcher). Left out of scope,
   documented, not silently dropped.

### (d) Why it needs no new state-tracking machinery

This is a **flat, stateless, per-attack additive modifier** — no duration, no counter, no interaction
with any other system. It reads a value that is already fully derived from the character's permanent
ability scores (no new schema field: `CharacterSheet.abilities.dex` already exists and is populated for
every real and demo character today) and applies it at a point (`resolveHit`'s missile branch) that
**already exists and already does the analogous range-bracket adjustment** — i.e., this candidate adds
one field + one arithmetic line next to code that does the same shape of thing for a different reason,
the same "single flat number, no extra state" bar `regen_3_hp` (M23.S2) and `half_damage` (M24.S1)
cleared, just measured from the party side instead of the monster side.

**Honest scope note (a real, pre-existing, separate fidelity gap, not fixed by this slice):** the
current engine bakes the Strength melee-hit bonus into a **single flat `sheet.thac0`/`Combatant.thac0`**
used for *both* melee and missile attacks (`character.ts:206`: `thac0: bestThac0 - str.hit - deityHit`).
Per COAB's own `CalculateAttackValues`, Str-hit should apply **only** to melee weapons and Dex-missile
**only** to ranged ones — they are mutually exclusive per attack, never both. This candidate's minimal
wiring **adds** the missing Dex bonus on top without **removing** the (COAB-incorrect) Str bonus
currently double-counted on missile shots — un-baking Str from the flat `thac0` would require splitting
`Combatant.thac0` into a base value plus separate melee/missile deltas, a materially bigger, more
invasive change touching every sheet/Combatant builder (`character.ts`, both `party.ts` files,
`monster.ts`) for a purely additive-accuracy gain. Flagged honestly (mirrors M24.S1's own "honest
scope note" on `half_damage`'s unconditional-vs-magic-weapon nuance) rather than silently expanded or
silently ignored — a natural **follow-on** once this slice lands, not folded into it.

### (e) Size: S

One new `Combatant`/`TacticalCombatant` field (inherited, no separate interface edit), one new
arithmetic line in `tactical.ts`'s existing missile branch, one `dex` computation + one field addition
in each of the two party-combatant builders (`apps/web/src/ui/party.ts`'s real one,
`packages/engine/src/combat/party.ts`'s demo-fallback one), plus the one-row `abilities.ts` DEX-table
correction (16-25 range) if the audit's byte-discrepancy finding is adopted in the same slice. Smaller
than M24.S1 (one combat engine touched, not two; no new fetch/join plumbing — the Dex score is already
on every sheet).

### Proof plan (mirrors M23.S2/M24.S1's "split it" lesson)

- **Engine unit tests** (deterministic, no RNG needed for the mechanism):
  1. A synthetic `resolveHit`-shaped case in `tactical.test.ts` (mirrors the existing `halfDamage`
     backstab-order test at line 549): two otherwise-identical archers, one with
     `missileHitBonus: 2`, firing at a target AC chosen so a fixed roll (seeded `Rng`) hits only with
     the bonus applied — proves the bonus is subtracted from `needed`, not added, and only on the
     `missile` branch (a companion melee-only test with the same bonus set proves it is **not**
     applied to melee attacks).
  2. A real-data case: build two `sheetToCombatant()` outputs from real `CharacterSheet`s with DEX 18
     vs DEX 9 (both via `createCharacter`), assert the DEX-18 sheet's resulting `Combatant.missileHitBonus`
     equals the corrected table's row-18 value and the DEX-9 sheet's is `undefined`/`0` — the same
     "real data reaches the real object" shape M23.S2/M24.S1 used, just sourced from character
     creation instead of a monster archive (no monster file fetch needed here at all — this candidate's
     data is already 100% in memory on every sheet, which is *why* it needs even less new plumbing than
     the monster-affect family did).
- **One e2e** (`?combat=1` or `?explore=cok`, matching the existing shape): create two characters via
  the real `create.ts` flow with DEX 18 and DEX 9 respectively, equip a bow, and read a new
  `window.__combat.missileHitBonusOf(id)` seam (mirrors `regenOf`/`halfDamageOf`) to prove the real,
  player-entered ability score reaches the real `Combatant` object — no RNG-dependent fight needed to
  prove the wiring, exactly the lesson already recorded in project memory.

---

## Candidates investigated and rejected this round (with reasons, so they aren't re-proposed)

### Character/party mechanics

| Candidate | Real? | Verdict |
|---|---|---|
| `exceptionalStrengthCap` (`races.ts`) — max 18/xx percentile by race | Yes, real (Journal p. 56, "Maximum percentage for 18 strength ... values vary from race to race") | **Not recommended.** The function is fully implemented and exported but has **zero call sites** anywhere (confirmed by grep — not even in `create.ts`, which lets a player type any `strPct` with no racial-cap validation). However this is a narrower gap than it looks: `strPct` itself already flows correctly through combat/encumbrance for every **pre-made** character (`explore.ts`/`wilderness.ts`'s hand-authored parties all carry correct `strPct`), so the mechanism is not "computed but never reaches play" — it already reaches play for every existing playable party. The only gap is that the **character-creation UI** has no percentile input at all (no roll button, no field), so there's nothing live to *validate* against the cap yet. Wiring `exceptionalStrengthCap` today would be validation for a UI input that doesn't exist — the real prerequisite (an 18-STR percentile roll/field in `create.ts`) is a UI-authoring task, not a "recompute already wired, one call site away" gap like the picked candidate. Smaller and weaker than the recommended pick.
| Racial ability-score ranges (`abilityRange`/`clampToRace`) | Yes | Already fully wired — `create.ts`, `save/import.ts` both call it live. Not a gap.
| Level-up HP-die gain (`levelHpGain`/`hitDie`) | Yes | Already fully wired — `party.ts`'s `trainMember()` (training-hall level-up) calls both live. Deliberately deterministic-average (not a re-roll) per its own doc comment — a documented design choice, not a gap.
| Multi-class XP splitting (`characterXpShare`, `awardCombatExperience`) | Yes, COAB-verified (`ovr006`) | Already fully wired since **M15** — `party.ts`'s `awardPartyXp()` calls `awardCombatExperience` live, correctly ÷N for multiclass. Not a gap.
| Encumbrance-driven movement penalty (`encumbrance().moveRate`) | **CANDIDATE**-labelled in its own source (not COAB/byte-verified — "pending a screenshot/oracle pin") | Already fully wired regardless — `party.ts`'s `moveRateForMember()` → `combat.ts`'s tactical move budget. Not a gap; also fails the "verified" bar for a *new* slice even if it were.
| Encumbrance-driven AC penalty | Searched for in COAB (`ovr020.cs`'s only "Encumbrance" hit is a status-screen **display label**, not a formula) | **UNLOCATED / likely doesn't exist** as a distinct mechanic in this engine generation — no COAB formula found ties carried weight to AC. Not pursued further.
| Aging / `age` tracking (`gameClock.ts`'s `applyAging`, COAB `ovr021.cs NormalizeClock` year-rollover `player.age += 1`) | Yes, COAB-verified | Already fully wired (not part of the numbered M-phase loop — folded into the calendar/rest-healing work per `decompile-ovr021-time-learning.md`): `explore.ts:707` calls `agePartyYears(stepped.yearRollovers)` on every real year rollover, persisted per-member, and surfaced via `partyStatus().age` (matches the CoK Manual's own "name, sex, race, and age" character-screen description, PDF-verified this round: `Champions of Krynn/Manual.pdf` page-index 3). Not a gap.
| **Age-based ability-score adjustment** (COAB `Player.AgeEffects`/`Limits.StrAgeEffect` et al., `ovr018.cs`'s `createPlayer` NPC-roll flow) | Real **in COAB**, but investigated and **rejected for CoK/DoK specifically** | This looked promising at first (a real, COAB-verified table nobody in this engine implements) but two checks killed it: (1) the COAB call site is inside the **3d6-six-times-keep-best random ability roll** branch of `createPlayer()` — a chargen flow **CoK/DoK's own manual describes very differently** ("When a character is generated with the CREATE NEW CHARACTER command, all racial modifiers are calculated automatically" — ability *ranges* and a flat dwarf +1 CON, no age-roll, no age-based stat table anywhere in the Journal's "Ability Scores" section, PDF-checked this round: `Champions of Krynn/Journal.pdf` page-index 4); (2) `AgeEffects` is applied **once, at chargen**, never re-applied as `age` increments later (haste's `player.age++` and the calendar year-rollover both just bump the counter, no code re-derives ability scores from the new age) — so even in COAB's own engine this is a creation-time-only effect, and CoK's chargen is evidenced to not use the roll-based flow that triggers it. Concluded **UNLOCATED-for-Krynn / likely not applicable**, not a wiring gap — the *display* of age (already wired, see above) is very likely the entirety of what CoK/DoK use this stat for.

### Dungeon/exploration mechanics

| Candidate | Verdict |
|---|---|
| Trap detection/disarm | Same root cause M19/M24 already established for thief skills generally (`thiefSkillPercent`/`recalcThiefSkills`): **no LOCK/TRAP ECL opcode exists** in `ecl/opcodes.ts`. Traps in the real games are ECL-scripted map events, not a rollable percentage; re-confirmed, not re-proposed.
| Secret-door search modifiers | No COAB mechanic found under any name (`grep -i secret` across `coab_extracted/` is empty); the only "secret" concept in the engine is the **FRUA authoring format's** door-kind enum (`module/frua/*.ts`, M5 track) — an unrelated data model, not a Gen1 game mechanic with a decoded formula sitting unwired.
| Light-source duration/radius | No torch/lantern model of any kind exists anywhere in `packages/engine/src` (one unrelated hit in `spellList.ts`, a spell name). Not a "computed but unwired" case — there is nothing computed.
| Hazard damage formulas | `dungeonEvents.ts` wires ECL `SearchLocation`/`vmRun1` dispatch (already fully live, per its own header) but hazards themselves are ECL-scripted (trap tiles → combat/message events), not a standalone formula module with unused exports. No candidate found.

### Spellcasting

Swept `spellEffects.ts`/`magic.ts`/`combatSpells.ts`/`scribe.ts`/`moons.ts` for anything beyond
M20-M22's already-shipped scribe-chance/moon-phase/book-cap work. No unwired spell-failure-chance,
concentration/interruption, or additional save-by-spell-level modifier functions were found with real
exports and zero call sites — everything exported from these files already has a live caller in
`magic.ts`/`combatSpells.ts`. No new candidate.

### Combat odds and ends

| Candidate | Verdict |
|---|---|
| Called-shot / called-strike rules | No such mechanic named or implemented anywhere in `coab_extracted/` or `packages/engine/src` under any spelling. Not present in the source material available; not a candidate (would be invention, not RE).
| Weapon-vs-armor-type adjustments | Not present — this engine (and, per a `coab_extracted` sweep, COAB itself) has no per-weapon/per-armor-type to-hit adjustment table (a 1e *optional* rule many Gold Box games skip). No decoded formula exists to wire.
| Two-weapon fighting penalties | Not present — no dual-wield mechanic exists anywhere in the item/combat model (`combatEquip.ts` has no second-weapon slot). Nothing to wire.
| Mounted combat modifiers | Not present — no mount/horse concept anywhere in the engine. Nothing to wire.
| Missile called-shot / range-bracket to-hit | **This is the recommended pick's neighbor** — `rangeBracketToHit` (short/medium/long) is **already wired** (`tactical.ts` line 1131). The Dex-missile bonus sitting one line away, computed but unused, is what this audit recommends.
| Rear/flank AC, backstab, coup de grace, morale, initiative, diagonal cost | All already CT.1-CT.7/RE.1-RE.6 verified and wired (see `tactical.ts`'s own header). Re-confirmed still live, not re-litigated.

### NPC/dialogue

| Candidate | Verdict |
|---|---|
| Reaction-roll modifiers (Charisma-based) | Searched `dialogue.ts`, `deities.ts`, `classFlags.ts` and the full ability-modifier surface: **no Charisma-based reaction-roll mechanic exists anywhere** in this engine (no function computes an NPC reaction/attitude roll at all — dialogue is purely ECL-branch-driven). The **only** "reaction" concept found in the whole codebase is `DexterityMods.reaction` (the recommended pick's sibling column) — and per `docs/engine/research/disasm-combat-cok.md`'s own RE.1 finding, Gold Box **initiative is a stored per-combatant byte, not a Dex-derived or per-round roll** ("Initiative random assignment: where/when does the engine roll or set `charStruct.initiative`... UNKNOWN"), so applying `.reaction` to initiative would contradict this project's own verified initiative model. **Rejected as inapplicable** — `.reaction` is left deliberately unwired (documented here, not silently dropped) as a case where the decoded value has no faithful live target in this engine's verified model, distinct from `.missile` which does.
| Loyalty/hire mechanics | No hireling/loyalty model of any kind found in `coab_extracted/` or the engine (CoK/DoK's manual describes NPCs joining/leaving the party via ECL dialogue choices, not a numeric loyalty score). Not present; nothing to wire.

---

## Open questions / unknowns

- **`ItemDataFlags.flag_02`'s true meaning** is **(inferred)** as "ranged/missile weapon" from context
  (it's the branch that adds a Dex bonus, structurally opposite the confirmed `melee` flag) — the
  decompile itself never names it, and the underlying `ITEMS` data table that would let us cross-check
  which real items carry the bit was not read this round (external binary data file, not inlined in the
  `coab_extracted` C# source). Reasonably confident given the structural evidence, but not byte-proven.
- **No independent CoK/DoK-own-binary confirmation** of `CalculateAttackValues`/`DexReactionAdj` was
  performed this round (see "(b)" above) — the to-hit primitive it feeds is RE.1-confirmed in both
  games' own code, but the Dex/Str composition step itself is COAB-only evidence so far. A follow-up
  `disasm_cok.py`/`disasm_dok.py` pass targeting the equivalent of `sub_66023`/`DexReactionAdj` would
  close this gap, mirroring how RE.1-RE.6 upgraded the diagonal-move-cost/fractional-attack findings
  from "COAB-only" to "Gen1-confirmed."
- **The DEX-18 table discrepancy** (COAB says `+3`, the 1e PHB / our current `abilities.ts` says `+2`)
  is presented as "trust the game's own code" per this project's established precedent, but is not
  itself independently re-derived from CoK/DoK's own binary — if a future dynamic trace or disassembly
  pass finds CoK/DoK's own Dex table differs from COAB's, that should take priority over both.
- **`exceptionalStrengthCap`** (rejected above) would become a live gap the moment `create.ts` grows an
  18-STR percentile roll/input — worth a one-line follow-up note for whoever builds that UI feature,
  not a standalone slice today.
- **The Str-bakes-into-missile-thac0 double-count** (honest scope note under "(d)" above) is a real,
  separate, pre-existing fidelity gap this slice does not fix — flagged as a natural follow-on once
  `Combatant.thac0` is split into base/melee/missile components, not folded into this recommendation.

## Implications for our engine

- The M23-M24 "decode generically once, map one flat field at a time into an optional `Combatant`
  property, apply at the nearest existing choke point" template generalizes cleanly to the **party**
  side, not just monster affects — this round's candidate is the first of that shape sourced from PC
  ability scores rather than a monster side-table, and needed even less new plumbing (the data —
  `CharacterSheet.abilities.dex` — was already resident on every sheet; no new file fetch/join at all).
  Future audits should keep checking **both** directions (monster-side decoded-but-unmapped bytes, and
  party-side ruleset-table columns that are computed but only partially consumed) rather than treating
  the monster-affect family as the only vein of this pattern.
- This round's sweep of adjacent areas (traps, secret doors, light sources, called shots, weapon-vs-
  armor, two-weapon fighting, mounted combat, reaction rolls, loyalty) came back **empty** not because
  wiring is missing but because **the mechanics themselves were never implemented in the original Gold
  Box engine** (no COAB source, no CoK/DoK manual/Journal mention) — several 1e *optional* rules SSI
  simply didn't build. This is a useful signal for future audits: absence of a candidate in these areas
  is expected and shouldn't trigger repeated re-sweeps without new source material (e.g. a fresh
  binary region opening up).
- The recommended candidate's own investigation surfaced a second, smaller, honestly-scoped follow-on
  (the Str/Dex mutual-exclusivity nuance) worth a future round once the base slice ships — consistent
  with how M20's Scribe-chance slice left `maxSpellsPerLevel` for M22 rather than scope-creeping the
  first slice.
