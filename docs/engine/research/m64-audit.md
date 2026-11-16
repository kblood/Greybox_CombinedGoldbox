# M64 audit — the next "computed but unwired" candidate

> Audit method per the brief: read `docs/engine/BUILD-QUEUE.md`'s Done-section entries for
> M60.S1–M63.S1 in full, and `docs/engine/research/m63-audit.md` in full (its "A prior round's own
> 'not a gap' verdict used a shallower bar", "Honest degeneracy check", "Rejected alternatives
> investigated this round", "Open questions / unknowns" and "Implications" sections in particular).
> Per the brief's own steer, this round FIRST tried the two newly-flagged methods:
>
> 1. **Spot-checking 2-3 pre-M40 "already wired, not a gap" verdicts** (M24-M39) against the
>    "wired ≠ displayed" standard M40 sharpened. Read every early audit doc's rejected-candidate
>    table (M24-M39) for phrases like "already wired"/"not a gap"/"fully wired". Found several —
>    Knight-of-Solamnia order (M26), level-up HP gain (M25's `trainMember`), multi-class XP split
>    (M25/M15) — but every one of them turned out to **already be independently fixed** by a later
>    round (knightOrder: M40's footer; HP gain: `town.ts:281`'s `+${r.hpGain} HP` message; XP split:
>    `combat.ts:744`'s per-member log line, M57). This method found **no fresh gap** this round — see
>    "Rejected alternatives" for the full trace — but it's recorded as run, not skipped.
> 2. **Checking whether some OTHER file has its own "M{N}.S1 — ..." doc comment** whose reasoning
>    points at a sibling, still-unchecked field. Grepped every `M\d+\.S1 —` comment across
>    `apps/web/src` and `packages/engine/src` (26 files). Every hit traced to a file already fully
>    swept (heavily-mined list) or to a comment describing an *intentional* design choice (e.g.
>    `combatScreen.ts`'s `ExploreParty.down`, already-standing "intentional" rejection), not an
>    unmined recurring pattern. **No fresh candidate from this method either.**
>
> With neither new method paying off directly, this round fell back to the sibling-**function**
> variant of doc-comment mining: `apps/web/src/ui/party.ts` exports a small family of near-identical
> per-character combat helpers right next to M63's own pick (`moveRateForMember`) —
> `turnLevelForMember`, `backstabLevelForMember`, `multiAttackHalfSteps`, `weaponsForMember` — each
> with its own doc comment naming a real CT.5b/CT.5c/CT.7k-1 combat consumer, in the exact shape M63
> found for `moveRateForMember`. Auditing all four found the **strongest fresh candidate this round**:
> **`multiAttackHalfSteps()` — AD&D-1e "3 attacks per 2 rounds" (warrior multiple attacks at fighter/
> paladin level 7+ or ranger level 8+, "Fighters and knights of 7th level or greater can attack twice
> every other turn" — the CoK manual's own words)** — real, already wired into live tactical combat's
> per-round attack count (`tactical.ts`'s `attacksThisRound()`), never shown anywhere as a character
> fact. Unlike `turnLevelForMember` (rejected this round — see "Rejected alternatives": for every
> currently-reachable real save, it turns out to equal a value **already shown**, a stronger
> redundancy concern than any prior round's pick) and `backstabLevelForMember` (rejected: it is
> *always* numerically identical to the thief level already shown in the class line — a structural,
> not incidental, duplicate), `multiAttackHalfSteps` cleanly avoids both problems, and — unusually for
> this loop — **two real bundled DoK import pregens (SIR DRYDEN, LILLITH) already qualify TODAY**,
> giving this pick both a real "yes" case and a real "no" case in the bundled saves, not just a
> hypothetical one.
>
> Confirmed via one throwaway `vitest` script (`packages/engine/test/_scratch_m64_verify.test.ts`,
> created, run — **7/7 green** — then deleted; `git status --porcelain --untracked-files=all` clean
> before and after, only this doc left untracked). Full engine suite re-run after adding the scratch
> file (1345 = 1338 + 7), then again after deleting it: **1338 passed, 0 failed** both times
> (unchanged from the M63 baseline).

## Headline finding

### The gap: a fighter/paladin/ranger/Knight's real "3 attacks per 2 rounds" veteran breakpoint already drives their actual per-round attack count in tactical combat, but is never shown anywhere as a character fact

`apps/web/src/ui/party.ts:724-741` (`multiAttackHalfSteps`):

```ts
/**
 * Warrior **multiple attacks** in COAB half-attack units (`ovr026` `ReclacClassBonuses` breakpoint —
 * see {@link warriorMultipleAttacks}): `3` (the "3 attacks per 2 rounds" alternation) for a fighter or
 * paladin at level ≥7, or a ranger at level ≥8 (checked across all of a multiclass member's class
 * slots, mapped to their core 1e class via {@link coreClass}). `undefined` for a member who doesn't
 * qualify (or an unmatched id), so the engine keeps its plain 1/round default. Dual-class reactivation
 * (`dualClassWarriorReactivates`) is out of scope — `CharacterSheet` doesn't model a dual-classed
 * character's frozen old-class slot yet.
 */
export function multiAttackHalfSteps(id: string): number | undefined {
  const idx = Number.parseInt(id.slice(1), 10) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= roster.length) return undefined;
  const sheet = roster[idx];
  const slots = Object.entries(sheet.classes)
    .filter(([, level]) => (level ?? 0) >= 1)
    .map(([cls, level]) => ({ classId: coreClass(cls as DragonlanceClassId), level: level! }));
  return warriorMultipleAttacks(slots) ? 3 : undefined;
}
```

This is a **real, already-shipped mechanical consumer**, confirmed live since **M16** (`docs/engine/
research/m24-audit.md:183-184`: `"warriorMultipleAttacks (M16), ... are all live"`), not a hypothetical
wire-up target. `apps/web/src/ui/combat.ts:320-321,349` (`makeTC()`'s own doc comment + call site):

```ts
// A real party member also gets their warrior **multiple-attacks** breakpoint
// (M16.S1, ovr026 `ReclacClassBonuses`) via {@link multiAttackHalfSteps} — `undefined` for everyone else
// (demo party, enemies), who keep the plain 1/round default.
...
halfAttacks: side === 'party' && !demo ? multiAttackHalfSteps(c.id) : undefined,
```

`combat.ts:348`'s `TacticalCombatant.halfAttacks` field feeds `packages/engine/src/combat/tactical.ts:
994-1006`'s `attacksThisRound()` directly:

```ts
/**
 * Attacks the actor makes this round. With {@link TacticalCombatant.halfAttacks} set, COAB's
 * fractional system applies: `floor(half/2)` swings every round plus one extra on odd rounds when
 * `half` is odd (so 3 → 2,1,2,1…). Otherwise the plain integer `attacksPerRound` (min 1).
 */
function attacksThisRound(actor: TacticalCombatant): number {
  if (actor.halfAttacks !== undefined) {
    const base = Math.floor(actor.halfAttacks / 2);
    const extra = actor.halfAttacks % 2 === 1 && round % 2 === 1 ? 1 : 0;
    return Math.max(0, base + extra);
  }
  return Math.max(1, actor.attacksPerRound);
}
```

**This directly, materially changes how many attacks the figure actually rolls every other round** —
2 attacks on odd rounds, 1 on even rounds, versus the plain 1/round default — not a cosmetic label.

**The mechanic is primary-sourced, not an inference.** `docs/engine/research/cok-dragonlance-rules.md:
244-248` (extracted from the CoK manual itself):

> *"Fighters and knights of 7th level or greater can attack twice every other turn"* and they appear
> alongside fighters for sweep/multiple-attack and giant-damage rules. (high confidence)

The engine's `warriorMultipleAttacks()` (`packages/engine/src/ruleset/addnd1e/recalc.ts:47-58`) encodes
exactly this — fighter/paladin ≥7, ranger ≥8 — and a Knight qualifies too because `party.ts`'s own
`coreClass()` (`packages/engine/src/ruleset/addnd1e-dragonlance/character.ts:85-87`) maps
`'knight' → 'fighter'` before the breakpoint check, matching the manual's own explicit **"fighters and
knights"** wording verbatim (not a coincidence — this is the same `coreClass` mapping the THAC0/save
tables already use for a Knight, verified working since M16 per the citation above).

**What IS shown today, and where.** Grepping every UI file for `multiAttackHalfSteps`/`halfAttacks`/
`attacksThisRound`/"multiple attack"/"3/2" confirms the value reaches exactly two places: `combat.ts`'s
own internal `TacticalCombatant` construction (never surfaced as text), and nowhere else — no hit in
`charSheet.ts` (either the engine render layer or its apps/web host), `create.ts`'s live preview, or
`companionPanel.ts`. A player fighting a level-7+ veteran fighter today gets more attacks per round in
the actual combat log, but has no way to know this *before* the fight, and no character-sheet line
confirms it after creating/leveling into it either.

## Real-data / real-mechanic verification (this round)

Reproduced via `packages/engine/test/_scratch_m64_verify.test.ts` (created, run, **7/7 passed**, then
deleted):

1. **The breakpoints are exact, not fuzzy**: `warriorMultipleAttacks([{classId:'fighter',level:6}])` →
   `false`; `level:7` → `true`. Ranger needs one level higher (`level:7` → `false`, `level:8` → `true`)
   — confirmed as a genuinely distinct breakpoint, not a copy-paste of the fighter one. A level-12
   cleric or thief never qualifies (not a warrior class).
2. **`coreClass()` really does route a Knight through the fighter breakpoint**:
   `multiAttackHalfSteps`-equivalent computed via `coreClass('knight') === 'fighter'` then
   `warriorMultipleAttacks` — a level-6 Knight is `undefined`, a level-7 Knight is `3`, matching the
   manual's explicit "fighters and knights" wording exactly.
3. **The mechanical effect is real and different, not just a flag**: reproducing
   `tactical.ts:999-1006`'s own formula directly — a normal figure attacks `[1,1,1,1]` across four
   rounds; a qualifying veteran attacks `[2,1,2,1]` (the "3 attacks per 2 rounds" alternation).
4. **Real bundled CoK data (the "no" case)**: `Champions of Krynn/SAVE/CHRDATA1.SAV` (SIR STRONGSWORD)
   decodes to `thac0: 20` — the level-1 fighter baseline (confirmed against
   `packages/engine/test/savedCharacter.test.ts`'s own existing golden assertion) — so
   `multiAttackHalfSteps` is `undefined` for every real CoK pregen today, the expected low-level
   baseline.
5. **Real bundled DoK data (the "yes" case — the strong result this round found)**: `Death Knights of
   Krynn/SAVE/CHRDATA1.GAM` (SIR DRYDEN) and `CHRDATA2.GAM` (LILLITH) both decode as non-caster
   (`classCode` 6) fighters. Reproducing `importDokParty.ts`'s own `inferDokLevel()` best-fit-by-THAC0
   algorithm against their real THAC0 bytes resolves **DRYDEN to level 7, LILLITH to level 8** —
   independently matching `docs/engine/research/m61-audit.md:162-163`'s own previously-verified figures
   (`"SIR DRYDEN | fighter L7 | 13"`, `"LILLITH | fighter L8 | 12"`). Both, run through
   `warriorMultipleAttacks`, resolve to `3` — **i.e. two of the real bundled saves this project already
   ships qualify for this stat TODAY**, not only a hand-built hypothetical character. This is a
   materially stronger evidentiary position than M63's own pick needed (which required constructing a
   synthetic STR-8 fighter to prove non-degeneracy, since all 6 real CoK pregens tied at
   `UNENCUMBERED`).

Full engine suite re-run after adding the scratch file (1345 = 1338 + 7 new), then again after deleting
it: **1338 passed, 0 failed** both times. `git status --porcelain --untracked-files=all` clean except
this doc.

## Wiring plan

**Two files touched** (`charSheet.ts` in the engine package's render layer, `charSheet.ts` in
apps/web) plus a small unit-test extension and a low-risk e2e seam addition — no new UI panel, no new
route, no new decode path, no new engine function (`warriorMultipleAttacks`/`coreClass` already exist
and are already exported from `@goldbox/engine`). `companionPanel.ts`'s "char" tab picks the fix up
**for free** (it already calls the exact same `toView`/`composeCharSheet` pair used by
`apps/web/src/ui/charSheet.ts:44,221-226`, unchanged from M63's own note).

1. **`packages/engine/src/render/charSheet.ts`** — add an optional `attacks` field to `CharSheetView`
   (mirrors the `move` field M63 added) and draw it as a 5th row in the existing "combat" block:

   ```ts
   // CharSheetView (charSheet.ts:35-60) — add after `move`:
   /**
    * M64.S1 — "3 attacks per 2 rounds" (AD&D-1e warrior multiple attacks: fighter/paladin level 7+,
    * ranger level 8+ — CoK's own manual: "Fighters and knights of 7th level or greater can attack
    * twice every other turn") — the same real fact `party.ts`'s `multiAttackHalfSteps()` feeds into
    * every real fighter/paladin/ranger/Knight's actual per-round attack count in tactical combat
    * (`tactical.ts`'s `attacksThisRound()`). A fixed "3/2" label (the only breakpoint modelled);
    * `undefined` when the character doesn't qualify, so the row is omitted, not shown as "ATK 1".
    */
   attacks?: string;
   ```

   ```ts
   // composeCharSheet's combat array (charSheet.ts:108-114) — before:
   const combat: [string, string][] = [
     ['AC', String(s.ac)],
     ['THAC0', String(s.thac0)],
     ['HP', `${s.hp}/${s.maxHp}`],
     ...(s.move !== undefined ? ([['MV', String(s.move)]] as [string, string][]) : []),
   ];

   // after:
   const combat: [string, string][] = [
     ['AC', String(s.ac)],
     ['THAC0', String(s.thac0)],
     ['HP', `${s.hp}/${s.maxHp}`],
     ...(s.move !== undefined ? ([['MV', String(s.move)]] as [string, string][]) : []),
     ...(s.attacks !== undefined ? ([['ATK', s.attacks]] as [string, string][]) : []),
   ];
   ```

   This lands at row `r = 6 + i` — row 9 if `move` is absent, row 10 if both `move` and `attacks` are
   present (see "Layout / feasibility check" below; both rows 10 and 11 are confirmed free today).

2. **`apps/web/src/ui/charSheet.ts`** — compute the breakpoint in `toView()` directly off the sheet's
   own `classes` (no new engine export, no roster lookup needed — unlike `move`, this doesn't need
   inventory state, so it's actually a *simpler* addition than M63's):

   ```ts
   // imports (charSheet.ts:12-25) — add to the existing @goldbox/engine import list:
   coreClass, warriorMultipleAttacks,
   ```

   ```ts
   // toView() body (charSheet.ts:57-63) — after the `enc` computation:
   // M64.S1 — the same "3 attacks per 2 rounds" breakpoint party.ts's multiAttackHalfSteps() computes
   // for real combat (fighter/paladin level 7+, ranger level 8+; a Knight qualifies too via
   // coreClass() mapping to the fighter table — matches the manual's own "fighters and knights"
   // wording). Recomputed here directly off the sheet's own classes, same as `move` above.
   const slots = (Object.entries(s.classes) as [DragonlanceClassId, number | undefined][])
     .filter((e): e is [DragonlanceClassId, number] => (e[1] ?? 0) >= 1)
     .map(([cls, lvl]) => ({ classId: coreClass(cls), level: lvl }));
   const attacks = warriorMultipleAttacks(slots) ? '3/2' : undefined;
   ```

   ```ts
   // returned object (charSheet.ts:71-91) — add alongside move:
   move: enc.moveRate,
   attacks,
   ```

3. **Tests** (extend two existing files — no new test file):
   - `packages/engine/test/charSheet.test.ts` — add 3 tests mirroring the existing MV-row tests
     exactly (`charSheet.test.ts:71-80`), including one proving the two optional rows compose
     correctly regardless of which is present (a genuinely new check `move` alone didn't need):
     ```ts
     it('draws the ATK row on the right at row 10 when both move and attacks are set', () => {
       const fb = composeCharSheet({ font: solidFont(), sheet: { ...SHEET, move: 12, attacks: '3/2' } });
       // 'ATK' label at col 20 row 10 → pixel (160, 80) green.
       expect(px(fb, 160, 80)).toBe(10);
     });
     it('draws the ATK row at row 9 (not 10) when attacks is set but move is not', () => {
       const fb = composeCharSheet({ font: solidFont(), sheet: { ...SHEET, attacks: '3/2' } });
       expect(px(fb, 160, 72)).toBe(10); // row 9 — no gap left by the skipped MV row
     });
     it('omits the ATK row when sheet.attacks is undefined (existing SHEET fixture)', () => {
       const fb = composeCharSheet({ font: solidFont(), sheet: SHEET });
       expect(px(fb, 160, 80)).toBe(0); // row 10 stays black
     });
     ```
   - `apps/web/src/ui/charSheet.ts`'s `__sheet` seam (`charSheet.ts:244-256`) — add an `attacks`
     getter mirroring the existing `move` getter:
     ```ts
     attacks: () => { const s = session?.party[session.cur]; return s ? toView(s, '').attacks ?? null : null; },
     ```
   - `apps/web/test/e2e.mjs`'s existing `runExplore` sheet block (the same block M63 extended,
     `e2e.mjs:641-658`) — add one **low-risk negative-case** line right after the existing `sheetMove`
     read:
     ```js
     const sheetAttacks = await page.evaluate('window.__sheet.attacks()');
     // Sturm is a level-5 fighter (below the level-7 breakpoint) — expect null, not "3/2".
     const attacksOk = sheetAttacks === null;
     ```
     fold `attacksOk` into the existing `invOk`/`sheetOk` composition the same way `moveOk` was. This
     is deliberately the **negative** case only (Sturm doesn't qualify) — see "Open questions" for why
     the **positive** "3/2" e2e path is intentionally left uncovered by this small slice.

Rough size: 1 new optional string field + ~1 LOC array-spread change + 1 doc comment in the engine's
`charSheet.ts`; 1 import addition + ~5 LOC in `toView()` + 1 field in the returned object in apps/web's
`charSheet.ts`; 1 new e2e seam getter (1 line); ~2 LOC extending the existing `runExplore` sheet block;
3 new unit tests extending the existing `charSheet.test.ts` file (no new test file). Engine test count
should go from 1338 → 1341 (three new tests in the existing file, matching this round's own
scratch-verified numbers before deletion, minus the 4 scratch-only real-bytes/formula tests that don't
need to ship as permanent unit tests since the shipped 3 already cover the render-layer contract).

## Layout / feasibility check

Following M63's own established method for this fixed-layout screen:

- **Row availability**: the right-hand "combat" block currently draws up to 4 rows at `r = 6+i` for
  `i in 0..3` → rows 6-9 (AC/THAC0/HP/MV, MV optional). Row 10 (the 5th slot) is confirmed empty today
  — nothing else in `composeCharSheet` writes to columns 20/30 at row 10 (the next fixed content after
  the combat block is the `'SAVING THROWS'` header at row 13, `charSheet.ts:122` — unchanged from
  M63's own citation). The left-hand ability column uses row 10 for CON (the 5th of 6 abilities,
  `r = 6+4 = 10`) and row 11 for CHA — but both at columns 2/8, not 20/30, so there is no pixel overlap
  with the new ATK row at row 10, the identical non-collision the AC/THAC0/HP/MV rows already rely on.
- **Two-optional-row composition is safe**: because both `move` and `attacks` are appended
  conditionally via array spreads (not fixed indices), the array naturally compacts — if `move` is
  `undefined` but `attacks` is set, `attacks` lands at row 9, not row 10, leaving no visible gap. This
  is exercised explicitly by this round's 2nd new test (see "Wiring plan" above) — a case M63's own
  single-optional-field addition didn't need to prove.
- **String width budget**: the value column (col 30) already renders `"12"` (MV) with no truncation
  issue; `"3/2"` (3 characters) is under the same established budget (`HP`'s `"44/44"`, 5 characters,
  remains the widest value in this column).
- **No collision with the footer or command bar**: rows 11-12 stay blank either way (CHA occupies row
  11 on the *left* only); row 13 (`SAVING THROWS`) and below are untouched by this change. Even after
  this fix, one more row (11) remains free on the right for any future addition — headroom is not
  exhausted.
- **Optional field, zero risk to existing callers**: `attacks` is optional on `CharSheetView`; every
  existing test fixture and caller that doesn't set it renders exactly as before (confirmed by the
  "omits the ATK row" test above, and by the existing MV tests, which use the same `SHEET` fixture
  unchanged).

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **`turnLevelForMember` (cleric turn-undead level + deity bonus, e.g. Majere +2)** | Investigated in depth first (party.ts:702-709; feeds `tactical.ts`'s `turnUndeadOutcome()` directly — a genuinely mechanically significant number, verified this round to change a real outcome, e.g. `turnUndeadOutcome(5,4)` needs a d20 roll of 7+ but `turnUndeadOutcome(7,4)` auto-turns). **Rejected on a redundancy concern stronger than any prior round's pick**: `sheetFromSaved()` (CoK import, `importParty.ts`) never sets `sheet.deity` at all (grepped — no `deity` key anywhere in that function), and `sheetFromDokSaved()` (DoK import, `importDokParty.ts:209`) always defaults an inferred cleric to `DEFAULT_DEITY = 'mishakal'`, which has **no** `turnUndeadLevelBonus` (only Majere does, `deities.ts:41`). So for **every currently-reachable real save this project has ever produced**, `turnLevelForMember` computes to exactly the cleric's raw class level — a value **already shown** verbatim in the classLine (e.g. "CLERIC 5"). Unlike `moveRate` (M63, real value distinguishable from anything else on screen, just flat across saves) or the ATK pick above (real "yes" cases exist in bundled DoK saves), this would be a genuine on-screen duplicate for every real character encountered today, only distinguishable for a hand-created Majere cleric. Closer to the already-rejected `MainMenuMember.level` shape (`m48-audit.md:319`, "genuinely redundant... same shape as the already-rejected degenerate fields") than to this loop's accepted precedents. |
| **`backstabLevelForMember` (thief backstab level)** | Rejected outright: `party.ts:716-722` returns `roster[idx].classes.thief` directly, with **no modifier of any kind** — it is *always* numerically identical to the thief level already shown in the class line (e.g. "THIEF 5"), for every character, not just real bundled saves. This is the *structural* redundancy `MainMenuMember.level` was rejected for (`m48-audit.md:319`), not an incidental one — showing it would add a row that can never differ from text already on the same screen. |
| **`weaponsForMember`** | Already effectively shown — the equipped weapon is visible on the Items (inventory) screen via the ready/equipped flag (`inventory.ts`, swept clean M52), and the character sheet's own combat-block numbers (THAC0/AC) already reflect gear. No new fact to add without duplicating the inventory screen. |
| **Pre-M40 "already wired" verdicts re-checked (method a)**: Knight-of-Solamnia order (M26), level-up HP gain (M25), multi-class XP split (M25/M15) | All three traced forward and found **already independently fixed** by a later round: knightOrder is shown in `charSheet.ts`'s footer since M40; `town.ts:281`'s training message already prints `+${r.hpGain} HP`; `combat.ts:744`'s post-combat log already prints a per-member XP line (M57). No fresh gap in any of the three. |
| **Doc-comment mining on files other than `charSheet.ts` (method b)** | Grepped all 26 files with an `M\d+\.S1 —` comment. Every hit either belongs to an already-heavily-mined file (importParty.ts/importDokParty.ts/wilderness.ts/explore.ts/combat.ts/referenceDb.ts/saveStore.ts/library.ts — all on the standing avoid-list) or describes an *intentional* design choice already recorded as such (`combatScreen.ts`'s `ExploreParty.down`, `journalScreen.ts`'s day-gated reveal, `treasure.ts`/`inventory.ts`'s `.value` field, already shown via the sell screen). No fresh recurring-pattern hit. |
| **`deityHealDieBonus` (Mishakal's +1 healing-die grant)** | Considered as a sibling deity-grant candidate to `turnLevelForMember`. Rejected as a poor fit for a static character-sheet row: unlike AC/THAC0/HP/MV/ATK (all fixed per-character numbers), a healing-die bonus only manifests combined with a *specific spell being cast* (it's a modifier, not a standalone stat) — it already reaches the player indirectly via the actual rolled heal amount in the combat log (and is already proven end-to-end by the existing "magic" e2e test's `healBonusOk` check, `e2e.mjs`). Not a clean single-row addition the way ATK is. |
| **Standing candidates 1-10** (Abilities precedent, `BASE_ITEMS` coverage, DoK xp/hp gap B5, `runItemPluses` e2e hardening, `referenceDb.ts` Class-label collision, dialogue/town day-wiring, CoK area-1 zero-item-plus curiosity, `saveStore.ts`/`DetectionMatch` fields, LILLITH's spell total, flat-AC-10 curiosity) | Not re-investigated — no new angle surfaced on any of them this round; a fresher, real, more strongly-evidenced candidate (warrior multiple attacks) was found via the sibling-function method before falling further down this list. |
| **`WILD_MENU`'s fully-decorative command bar** | Unchanged from M63 — still a real, bigger missing-feature follow-on, not attempted here. |

## Open questions / unknowns

- **The e2e coverage in this plan is deliberately asymmetric** (only the negative "not eligible" case
  is checked, via Sturm the level-5 fighter already in `runExplore`'s persisted fixture). Proving the
  **positive** "3/2" path end-to-end would need either (a) bumping that shared fixture's level to 7+
  (risky — several *other* assertions in the same large `runExplore` test likely depend on Sturm's
  exact AC/THAC0/HP numbers at level 5, so this could ripple), or (b) a new, self-contained e2e
  scenario (fresh `?create=1` page, a level-7 fighter, mirroring the existing "magic" test's own
  self-contained cleric-creation pattern). Neither was attempted here to keep this slice small and
  low-risk; the positive path is instead proven at the engine-unit level this round (both via the
  formula-level scratch tests and the real DRYDEN/LILLITH bundled-save bytes) — the same
  engine-test-proves-the-formula / e2e-proves-the-plumbing split this project already uses for
  `deityHealDieBonus` (M18.S1). Flagged for the lead's judgement, not resolved here.
- **Whether the original CoK "View" character screen ever displayed a "# Attacks" stat at all** is
  **UNKNOWN** — same caveat M63 raised for Movement Rate: no primary-source screenshot/transcription
  was available in this environment to confirm or deny (PDF manuals could not be rendered; no
  `pdftoppm`/`poppler-utils` installed). This plan follows M63's own established practice of extending
  this fixed-layout screen with a real, mechanically-grounded, primary-source-quoted stat when layout
  budget allows, without claiming pixel-exact screenshot parity.
- **Dual-class reactivation** (`dualClassWarriorReactivates`, `recalc.ts:60-71`) is explicitly out of
  scope for this pick, same as `party.ts`'s own doc comment already notes — `CharacterSheet` doesn't
  model a dual-classed character's frozen old-class slot, so this fix only ever surfaces the
  **current**-class breakpoint, never the reactivated-old-class variant. Not a regression (that
  variant was never modelled anywhere), just a known boundary of what this slice covers.
- **Label choice** ("ATK" + "3/2"): this plan picked "ATK" to match the AC/THAC0/HP/MV row-label
  convention (3-4 characters, all-caps) and "3/2" to match AD&D-1e's own canonical notation for this
  exact breakpoint (used in the PHB and the CoK manual's own surrounding text for the fighter/ranger
  attack progression). An alternative would be spelling out "2/1" (attacks this round / next round) or
  a longer label like "MULT ATK" — left as a judgement call for the lead, not resolved here.

## Implications for our engine

- **The sibling-function variant of doc-comment mining generalizes past `charSheet.ts` itself.** M63
  found `.robe` and `moveRate` by re-reading `charSheet.ts`'s own fix comments; this round found ATK by
  instead reading `party.ts`'s **family of near-identical helper functions** sitting right next to
  M63's own pick (`turnLevelForMember`, `backstabLevelForMember`, `multiAttackHalfSteps`,
  `weaponsForMember` — all documented with the same "CT.5b/CT.5c/CT.7k-1 combat consumer" shape as
  `moveRateForMember`). When a file ships several sibling functions with the same doc-comment shape and
  only one has been checked, the others are worth checking too — a cheap, targeted variant of "doc
  comment mining" that doesn't require the comment to explicitly reference a prior fix.
- **Not every plausible-looking sibling candidate clears the bar equally — checking WHY a value is flat
  matters, not just THAT it's flat.** `turnLevelForMember` and `backstabLevelForMember` looked, on
  paper, like the same shape as the accepted `moveRateForMember` (real consumer, never displayed) —
  but tracing exactly *why* each is flat for real data found two different, and worse, failure shapes:
  `backstabLevelForMember` is *structurally* identical to an already-shown value (no modifier ever
  applies), and `turnLevelForMember` is *coincidentally* identical to an already-shown value for every
  real save this project has ever produced (both real import paths route through a deity with zero
  turn bonus). `multiAttackHalfSteps` has neither problem — it is a distinct capability flag, not a
  copy of anything shown, and two real bundled saves already show the positive case. Surfacing *why*
  a candidate is weak (not just flagging that a weakness exists) is what let this round tell the three
  siblings apart and ship the strongest of the four.
- **Real bundled data can exceed a prior round's own evidentiary bar, and that's worth noting
  explicitly.** M63 had to construct a hypothetical STR-8 fighter to prove `moveRate`'s mechanism was
  non-degenerate, because all 6 real bundled CoK pregens tied at `UNENCUMBERED`. This round's pick
  needed no such construction — SIR DRYDEN (fighter L7) and LILLITH (fighter L8), both real DoK
  pregens this project already ships and imports, independently verified by an earlier round
  (`m61-audit.md`) for an unrelated reason (THAC0), already qualify for the "3 attacks per 2 rounds"
  breakpoint today. When a fresher pick's real-data story is objectively stronger than a shipped prior
  pick's, it's worth stating that comparison plainly (not just asserting "this one is also fine").
