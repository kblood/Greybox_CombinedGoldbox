# M65 audit — the next "computed but unwired" candidate

> Audit method per the brief: read `docs/engine/BUILD-QUEUE.md`'s Done-section entries for
> M61.S1–M64.S1 in full, and `docs/engine/research/m64-audit.md` in full (its "Rejected alternatives
> investigated this round", "Open questions / unknowns", and "Implications" sections in particular).
>
> **Method 1 (sibling-function doc-comment mining, tried first per the brief's steer)** was re-applied
> extremely broadly this round — across `party.ts`'s already-exhausted `*ForMember` family (confirmed
> all six members investigated across M63-M65 now), `recalc.ts`, `spells.ts`, `scribe.ts`, `magic.ts`,
> `referenceDb.ts`'s `itemCategory()`/`spellCategory()`, `character.ts`, `deities.ts`, `classes.ts`,
> `races.ts`, `combatSpells.ts`, `spellEffects.ts`, `encumbrance.ts`, `inventory.ts`, `undead.ts`,
> `experience.ts`, `progression.ts`, `services.ts`, `treasure.ts`, `rest.ts`, `gameClock.ts`,
> `monsterSideTables.ts`, `dokSavedCharacter.ts`, `dokGearCrosswalk.ts`, `save/character.ts`,
> `save/import.ts`, `monsterSize.ts`, `abilities.ts`, `memorize.ts`, `moons.ts`, `deploy.ts`,
> `combat/party.ts`/`combat/tactical.ts`, and finally the DoK spell crosswalk pair
> `dokSpellClass.ts`/`dokSpellCrosswalk.ts` (`classVoteFromDokIds`/`preparedSpellsFromDokIds`/
> `memorizationFromDokIds`) — every lead in this long list either (a) was already fixed by a prior
> round, (b) is redundant with an already-shown value, (c) has zero real consumer (fails this loop's
> core bar — `experience.ts`'s `calcDuelExp`, `gameClock.ts`'s `tickAffects`), or (d) is
> validation-only with no live "hidden fact" to surface. **Method 2 (re-spot-checking pre-M40
> verdicts)** was also tried on a fresh batch (M28-M39 audits, not the M24-M39 set M64 already used)
> — every "already wired" claim traced to either already-independently-fixed or correctly-rejected.
>
> Neither method produced a fresh candidate directly, so this round fell back to a **third angle**:
> re-reading `docs/engine/research/m54-audit.md`'s own rejected-alternatives table line-by-line
> (rather than just its summary), since M54 is the round that originally bundled four `MonsterRecord`
> fields together as "needs new UI surfaces per field, not re-picked": `conSaveBonus`/`itemPluses`/
> `carriedItems`/`preparedSpellIds`. Cross-checking that quartet against what actually shipped since
> found that **three of the four already got their own dedicated bestiary row** —
> `preparedSpellIds` → M55's "Spells" row, `itemPluses` → M56's "Bonus XP" row, and `carriedItems` was
> explicitly re-examined and correctly left as a weaker follow-up (M56/M58, thin `baseItem()` name
> coverage) — but **`conSaveBonus` itself was never revisited after M54's bundle rejection**. It fell
> through the cracks between M55 and M56 picking off its bundle-mates one at a time.
>
> **Headline pick: `MonsterRecord.conSaveBonus` (M28.S1) — a monster's own flat Constitution-band bonus
> to its saving throw against spells/rods/staves/wands — already changes the actual outcome of a real
> d20 roll in live tactical combat (`combat/tactical.ts`'s `applyCast()`), but is never shown anywhere
> on the Reference DB / Companion Panel bestiary screen**, even though that screen's `monsterCategory()`
> function already has a five-times-proven "one more conditional detail row" mechanism (Class M37, Save
> M38, Regen/Half Dmg M43, Spells M55, Bonus XP M56) and already shows the raw save-target number
> (`Save: 17`) this very bonus modifies, right next to where the new row would sit.
>
> Confirmed via two throwaway `vitest` scripts (`packages/engine/test/_scratch_m65_verify.test.ts` — 4
> tests — and `_scratch_m65_rowcount.test.ts` — 1 test — both created, run, all green, then deleted).
> `git status --porcelain` clean except this doc; full engine suite re-confirmed clean at the same
> **1341 passed** baseline M64 left it at (i.e. unchanged — nothing shipped by this research round).

## Headline finding

### The gap: a monster's own Constitution-derived saving-throw bonus already changes a real combat outcome, but the bestiary that already shows the number it modifies never shows the modifier itself

`packages/engine/src/loaders/monster.ts:270-278` (`MonsterRecord.conSaveBonus`):

```ts
/**
 * M28.S1 — a flat Constitution-band bonus added to this monster's own saving-throw *roll* (not the
 * target) against Spell/RodStaffWand saves (COAB `Affects.con_saving_bonus`, `ovr013.cs
 * con_saving_bonus`/`sub_3BE42`). **Not decoded from `MON{n}CHA.DAX`** — populated by
 * {@link applyConSavingBonus} after joining the monster's `MON{n}SPC.DAX` side-table
 * (`loaders/monsterSideTables.ts`), using this record's own already-decoded {@link abilities}`.con`.
 * Undefined for the common case (no such affect, or a Con score outside every band).
 */
conSaveBonus?: number;
```

The Con-band table itself (`packages/engine/src/loaders/monsterSideTables.ts:281-297`, transcribed
verbatim from the COAB clean-room decompile `ovr013.cs:1207-1236`):

```ts
export function conSpellSaveBonus(con: number): number {
  if (con >= 4 && con <= 6) return 1;
  if (con >= 7 && con <= 10) return 2;
  if (con >= 11 && con <= 13) return 3;
  if (con >= 14 && con <= 17) return 4;
  if (con >= 18 && con <= 20) return 5;
  return 0;
}
```

**This is genuinely live in combat, not a decoded-but-inert value.** `packages/engine/src/combat/
tactical.ts:1315-1318`:

```ts
// never saves (the engine doesn't invent one). `conSaveBonus` (M28.S1, COAB `con_saving_bonus`)
...
const saved = rollsSave ? rng.die(20) + (t.conSaveBonus ?? 0) >= t.save! : false;
```

The bonus is added directly to the d20 roll before comparing against the monster's own save target —
it can turn a would-be failed save into a success on the actual roll, for any spell/rod/staff/wand
effect a party member casts at the monster. It reaches this point via `monsterCombatant()`
(`packages/engine/src/combat/combat.ts:319,342`), the same bridge function every other already-shown
`MonsterRecord` field (`morale`, `combatSize`, `regenPerRound`, `halfDamage`, `itemPluses`,
`carriedItems`, `savingThrows`, `preparedSpellIds`) uses to reach `Combatant`.

**What IS shown today, right next to it.** `apps/web/src/ui/referenceDb.ts:92-148` (`monsterCategory()`,
the Reference DB / Companion Panel Databases → Monsters sub-tab's row builder — the exact function
M37/M38/M43/M55/M56 have each already extended once, now a sixth candidate use):

```ts
// referenceDb.ts:126-133
// M38.S1 — the .spell saving-throw target is the one SavingThrows column with a live combat
// consumer (Combatant.monsterSpellSave, combat.ts, wired since M27.S1); shown here, unlike its
// 4 siblings (paralyzePoisonDeath/petrifyPolymorph/rodStaffWand/breath) ...
...(m.savingThrows ? [{ label: 'Save', value: `${m.savingThrows.spell}` }] : []),
```

The raw save-target number (`Save: 17` for GHOUL, verified below) is shown — but the modifier every
real spell-save roll against that same monster actually adds on top of the attacker's own d20 (M28.S1's
`conSaveBonus`) sits one field away in the same record and is never read by this function at all. A
player deciding whether it's worth casting `Hold Person` at a GHOUL has no way to know the monster gets
a real, mechanically-significant +2 to resist it.

**Provenance check: why `conSaveBonus` specifically fell through, not the whole bundle.** M54
originally rejected all four of `conSaveBonus`/`itemPluses`/`carriedItems`/`preparedSpellIds` together
as one bundle ("needs new UI surfaces per field, not re-picked", `docs/engine/research/m54-audit.md:304`).
Three of the four were individually revisited and shipped or explicitly re-examined in the six rounds
since: `preparedSpellIds` → M55's "Spells" row; `itemPluses` → M56's "Bonus XP" row; `carriedItems` →
re-examined by M56/M58 and correctly left as a weaker follow-up (its `baseItem()` name-resolution
coverage is thin, ~14%, an honest data-catalogue gap, not a code gap). `conSaveBonus` alone was never
individually re-examined after the original bundle rejection — an oversight in the follow-through
across rounds, not a standing principled objection.

## Real-data / real-mechanic verification (this round)

Reproduced via `packages/engine/test/_scratch_m65_verify.test.ts` (4 tests) and
`_scratch_m65_rowcount.test.ts` (1 test), both created, run (**5/5 green**), then deleted:

1. **Real CoK bytes, not a synthetic fixture**: decoding the actual `Champions of Krynn/MON1CHA.DAX` +
   `MON1SPC.DAX` and joining via `applyConSavingBonus` gives **GHOUL (block id 7): `conSaveBonus = 2`**
   (Con 10 → the 7-10 band) — matching the existing, already-shipped assertion in
   `packages/engine/test/monsterSideTables.test.ts:390-405` (this round independently re-derived it
   rather than only trusting that prior test). GHOUL's own `savingThrows.spell` is `17` — the two
   fields sit side by side on the same real record.
2. **The value really reaches the live combat consumer, unchanged**: `monsterCombatant(ghoul, 'e0')
   .conSaveBonus === 2` — the identical figure `tactical.ts`'s `applyCast()` adds to the save roll (this
   is the same plumbing the project's own `con-save-bonus` e2e test, `apps/web/test/e2e.mjs:3129-3172`,
   already proves end-to-end in a real fight: GHOUL/SKELETON both `conSaveBonusOf('e0') === 2`, GOBLIN/
   RED DRAGON both `null`).
3. **A real negative control**: GOBLIN (block id 9) decodes `conSaveBonus: undefined` — confirming the
   proposed row would be honestly omitted for the common case, not fabricated as "+0".
4. **Row-budget check (the concrete risk with this file's cap)**: joining **every** side-table
   (`conSaveBonus`, `regenPerRound`, `halfDamage`, `itemPluses`, `carriedItems`) onto the real GHOUL
   record and counting `monsterCategory()`'s actual conditional rows for it: AC, HD, THAC0, HP, Damage,
   XP, Morale, Size, Class, Save (10 rows) — GHOUL carries no regen/half-damage/item-plus affects, so
   adding one new "Con Save" row brings the total to **11 of the compositor's 12-row cap**
   (`REFERENCE_DB_DETAIL_ROWS`, `packages/engine/src/render/referenceDb.ts:72`) — one row of headroom
   remains, consistent with M56's own FLAVIUS check (11 of 12) for the same reason.

Full engine suite run after adding both scratch files, then again after deleting them: **1341 passed,
0 failed** both times (unchanged from the M64 baseline — this research round shipped no engine/UI
changes). `git status --porcelain` is clean except this doc.

## Wiring plan

**One file, one line** — smaller than any recent pick in this series (M63/M64 both touched two files
plus tests). No new engine-package export is needed; `MonsterRecord.conSaveBonus` and
`monsterCategory()` already exist and are already wired together up to the point of display.

1. **`apps/web/src/ui/referenceDb.ts`** — add one conditional row to `monsterCategory()`'s existing
   `details.push([...])` array, immediately after the existing `Save` row (`referenceDb.ts:133`):

   ```ts
   // referenceDb.ts:126-133 (existing) —
   ...(m.savingThrows ? [{ label: 'Save', value: `${m.savingThrows.spell}` }] : []),
   // M65.S1 — MonsterRecord.conSaveBonus (M28.S1): a flat Constitution-band bonus this monster adds
   // to its OWN saving-throw roll against spells/rods/staves/wands (con_saving_bonus,
   // tactical.ts's applyCast()), sitting right next to the Save row it modifies. Undefined for the
   // common case (no such affect, or Con outside every band), so the row is honestly omitted rather
   // than shown as "+0".
   ...(m.conSaveBonus !== undefined ? [{ label: 'Con Save', value: `+${m.conSaveBonus}` }] : []),
   ```

   `d.label.toUpperCase().slice(0, 9)` (`packages/engine/src/render/referenceDb.ts:122`) fits "CON SAVE"
   (8 chars) with no truncation; `d.value.toUpperCase().slice(0, 8)` fits "+2" (2 chars) with headroom
   to spare — no width-budget risk (the widest existing value in this column, `"44/44"` on HP, is 5
   chars).

2. **Tests (extend one existing file, no new test file)** — `packages/engine/test/referenceDb.test.ts`
   (the file M37/M38/M39/M43/M55/M56 have each already extended for their own `monsterCategory()` row):
   add one assertion that a real GHOUL/SKELETON-shaped fixture with `conSaveBonus: 2` produces a
   `{ label: 'Con Save', value: '+2' }` row, and one that a fixture with `conSaveBonus: undefined`
   omits it — mirroring the existing Regen/Half Dmg pair of tests from M43 exactly.

3. **No e2e change strictly required** — the mechanism is already end-to-end proven live in combat by
   the existing `con-save-bonus` e2e case (`e2e.mjs:3129-3172`); this fix only adds a *display* of a
   value that test already independently confirms is correct. If the lead wants bestiary-side e2e
   coverage to match the M38/M43/M55/M56 pattern (each of those added a `refdb`-seam assertion for
   their own new row), the natural extension is one assertion in the existing `refdb` e2e case reading
   GHOUL's detail rows via `window.__refdb` and checking for a `'Con Save'` label with value `'+2'` —
   left as a judgement call for the lead, not required to ship the row itself.

Rough size: **1 new conditional array-spread line + 1 doc comment in `apps/web/src/ui/referenceDb.ts`**;
2 new assertions extending the existing `referenceDb.test.ts` (no new test file); optionally 1 new e2e
assertion extending the existing `refdb` case. No engine-package change at all — `conSaveBonus` and
`monsterCategory()` both already exist; this is purely wiring one existing field into one existing,
already-extended display function.

## Layout / feasibility check

- **Row cap**: `REFERENCE_DB_DETAIL_ROWS = 12` (`packages/engine/src/render/referenceDb.ts:72`). GHOUL,
  the real monster this round verified, currently renders 10 rows; adding "Con Save" brings it to 11 —
  one row of headroom remains, matching M56's own FLAVIUS precedent (11 of 12, two new rows stacked).
  A hypothetical worst-case monster that simultaneously has `npcLevel`, `savingThrows`, `regenPerRound`,
  `halfDamage`, spells, AND a con-save bonus would hit 9 + 6 = 15, exceeding the cap — but this is the
  same pre-existing risk every prior row addition (M43, M55, M56) already accepted and left unaddressed
  (the array silently truncates at 12 via `Math.min(REFERENCE_DB_DETAIL_ROWS, v.detail.length)`,
  `render/referenceDb.ts:118`); not a new risk this pick introduces, and no real monster observed today
  triggers it.
- **No pixel collision**: the new row is a plain additional entry in the same conditional-array
  mechanism (`...(cond ? [{...}] : [])`) M37/M38/M43/M55/M56 already use — it participates in the same
  natural list-compaction those rows rely on (a monster missing `Save` simply has no `Con Save` slot to
  begin with, since the two are logically paired — though technically independent fields, no real
  record has been observed with one but not the other, since both derive from the same
  `MON{n}SPC.DAX`/`MON{n}CHA.DAX` join keyed by `blockId`).
- **String width**: "CON SAVE" (8 chars) and "+2" (2 chars) both fit within this column's existing
  9-char label / 8-char value budget with no truncation.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **Entire `party.ts` `*ForMember` family re-check** (`turnLevelForMember`, `backstabLevelForMember`, `multiAttackHalfSteps`, `weaponsForMember`, `moveRateForMember`, `spellSaveForMember`, `combatSpellsForMember`) | Confirmed exhausted — all six members individually investigated and either shipped (M63 `moveRateForMember`, M64 `multiAttackHalfSteps`) or explicitly rejected with a documented reason (M64) across the last three rounds. No new angle found this round. |
| **`recalc.ts`/`spells.ts`/`scribe.ts`/`magic.ts`/`referenceDb.ts`'s `itemCategory()`/`spellCategory()`/`character.ts`/`deities.ts`/`classes.ts`/`races.ts`/`combatSpells.ts`/`spellEffects.ts`** | Each read in full this round looking for an unmined sibling field. All confirmed already fully wired (M25/M39/M44/M47/M48 already swept these in depth) — no fresh gap. |
| **`BaseItem.weightTenths` (per-item weight, Reference DB Items tab)** | Re-confirmed M44's own verdict still holds: the *aggregate* (total carried weight, `inventory.ts:74-75`'s `${inventoryWeightLb(inv).toFixed(1)} LB` + `encumbrance().label`) is already displayed, so this is "already wired through a formula," not a silent drop — a genuinely new *per-item* column would be a new feature, not this loop's shape. Not re-litigated further. |
| **Constitution HP bonus never re-applied on `trainMember()`'s per-level HP gain** (`apps/web/src/ui/party.ts:990-1004`, `create.ts:82`'s `estimateHp()` folds `level * con` at chargen but `trainMember()`'s `gain = levelHpGain(hitDie(core))` never adds the per-level Con bonus on top when leveling up later) | A real, interesting asymmetry — but it is a **formula-completeness gap in a game mechanic** (the HP number IS displayed, just computed without one of its normal AD&D-1e inputs on the level-up path specifically), not this loop's "decoded value dropped before reaching the UI" shape. Flagged in Open Questions below rather than picked as the headline, since fixing it means changing a mechanic's math, not wiring an already-computed fact through to a screen. |
| **`hasPrimeRequisiteBonus`'s +10% XP bonus** (re-confirmed) | Re-confirmed M47's verdict: the bonus is already baked into the final per-character XP number already shown in the post-combat log (`combat.ts:744`) — only the separate "why" label is missing, judged decorative/polish, not a dropped fact. Not re-litigated. |
| **`dokSpellClass.ts`/`dokSpellCrosswalk.ts`'s class-vote margin** (`classVoteFromDokIds`'s tie vs. decisive-vote distinction) | Investigated as a promising new-shaped candidate (an "ambiguity/confidence" fact, distinct from the values M60/M61 already exposed). Rejected: every actual output of this pipeline (`cls`, `level`, `hp`, `ac`, `thac0`, `mem` count) is already threaded to the DoK import screen's summary (M51/M58/M61) — the vote's raw tally isn't itself a stored/consumed field, just an internal tie-break signal with no further downstream use once `cls` is chosen. This file/import screen combination is now fully swept. |
| **`MonsterRecord.carriedItems`** | Re-confirmed still correctly left as a weaker follow-up (M56/M58's own reasoning: thin `baseItem()` id coverage, ~14%, an honest data-catalogue gap rather than a code gap) — not re-litigated, no new angle. |
| **`WILD_MENU`'s fully-decorative command bar** | Re-confirmed unchanged from M63/M64 — explicitly checked again this round whether `automapPanel.ts` exposes an openable-overlay function the "Map" verb could call; confirmed it does not (only `isAutomapOpen()`/`closeAutomap()` are exported — `?automap=1` is a standalone route, not an overlay `charSheet.ts`/`inventory.ts`-style modal). Still a genuinely bigger follow-on, not attempted here. |
| **Standing candidates list** (Abilities precedent, `BASE_ITEMS` coverage, DoK xp/hp gap B5, `runItemPluses` e2e hardening, `referenceDb.ts` Class-label collision — 8 rounds running now, dialogue/town day-wiring, LILLITH's spell total, flat-AC-10 curiosity, moon-bar widget, DEMO_PARTY edge case) | Not re-investigated — a fresher, real, cheaper-shaped pick (Con Save) was found via the M54-bundle-provenance method before falling further down this list. |

## Open questions / unknowns

- **Should the Constitution HP-bonus-not-reapplied-on-level-up asymmetry (`trainMember()`) be its own
  future pick?** It is real (verified: `create.ts:82` applies `level * con` at chargen; `party.ts:999`'s
  `trainMember()` only ever adds `levelHpGain(hitDie(core))` with no Con term on subsequent levels) and
  arguably higher-impact than a display-only fix (it changes an actual HP total a player will earn by
  training), but it doesn't fit this loop's "decoded-but-not-displayed" shape — it's a "the formula
  isn't reapplied a second time" gap. Left as a flagged observation for a differently-scoped future
  round (possibly the engine/mechanics-bugfix track rather than this display-audit loop), not resolved
  or picked up here.
- **Should `Con Save` be paired more tightly with the `Save` row** (e.g. a single combined
  `"Save: 17 (+2)"` string) rather than two separate label/value rows? This plan picked two separate
  rows to match every prior round's "one label, one value" convention in this function (Class, Save,
  Regen, Half Dmg, Spells, Bonus XP are all standalone rows even when logically related to a
  neighbour), but a combined single-row rendering is a defensible alternative left for the lead's
  judgement.
- **Does any real DoK monster (not just CoK's GHOUL/SKELETON) carry `conSaveBonus`?** Not verified this
  round — DoK's `MON1SPC.DAX`/`MON1ITM.DAX`/`MON1WIZ.DAX` all exist on disk (confirmed present), and the
  join mechanism (`applyConSavingBonus`) is game-agnostic (keyed only on `blockId` + the record's own
  decoded `abilities.con`), so the fix should "just work" for DoK the same way Regen/Half Dmg/Spells/
  Bonus XP already do — but no specific real DoK monster with a positive `conSaveBonus` was identified
  this round the way M55/M56 named IGORF/FLAVIUS for their own picks. **UNKNOWN**, not blocking (the fix
  is field-driven, not game-specific).

## Implications for our engine

- **A round that originally bundles several related fields together as "future work" can create a
  silent follow-through gap of its own** — three of M54's four bundled fields (`preparedSpellIds`,
  `itemPluses`, `carriedItems`) were each individually revisited within the next four rounds (M55, M56,
  M56/M58), but `conSaveBonus` — arguably the simplest of the four to wire, needing no name-resolution
  catalogue the way `carriedItems` does — was overlooked purely because it wasn't the specific field
  named in each of those follow-up rounds' own headline framing. When a past round explicitly bundles N
  fields under one rejection reason, it is worth checking, once some of the bundle ships, whether *all*
  of them did — not just trusting that "the bundle was handled" once any subset of it is fixed.
- **Not every gap found this round fits the loop's own shape, and it's worth saying so plainly rather
  than force-fitting a weaker pick.** The Constitution HP-bonus-on-level-up asymmetry is real and
  arguably more consequential than the Con Save display gap, but it is a mechanics-completeness issue
  (a formula not reapplied), not a display gap — flagging it honestly in Open Questions, rather than
  either suppressing it or mis-framing it as this round's headline, keeps the audit's own claims
  accurate to what each finding actually is.
- **The sibling-function/doc-comment mining method has a natural saturation point for a given file
  family, and when it saturates, re-reading a past *rejection's own reasoning* (not just its verdict)
  can surface what it missed.** `party.ts`'s `*ForMember` family is now confirmed fully exhausted across
  three consecutive rounds (M63-M65). This round's productive angle came from a different
  source-of-truth entirely: not a fresh function family, but a past round's own bundled rejection,
  cross-checked against what actually shipped afterward. Worth treating "did every item in a past
  round's bundle rejection eventually get picked up" as its own standing check, alongside the
  sibling-function and pre-M40-verdict methods this loop already uses.
- **`monsterCategory()` remains the single richest, cheapest-to-extend chokepoint in this codebase for
  this style of fix** — this is its sixth extension (M37, M38, M43 ×2, M55, M56, now M65), each a
  one-line conditional row addition with no engine-package change, confirming M44's Implications section
  was right to flag this function (and its sibling `itemCategory()`) as a standing checklist worth
  revisiting whenever a new `MonsterRecord` field gains a real consumer.
