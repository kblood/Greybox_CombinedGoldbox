# M95 audit — the DoK→DQK import's level-inference clamp is a stale workaround for `createCharacter()`'s CoK-only cap, and it already misderives 3 of the 6 real bundled saves

> Audit method: read `docs/engine/research/m94-audit.md` in full first per the brief's mandatory first
> step, then skimmed `m90`-`m93-audit.md` for the established taxonomy. Before finalizing, grepped every
> prior `docs/engine/research/m*-audit.md` (m1-m94) for this round's eventual candidate strings
> (`MAX_INFERRED_LEVEL`, `inferDokLevel`, `dqkMaxLevel`, `DQK_MAX_LEVEL`, `levelCapRuleset`,
> `clamping the search`, `createCharacter.*extended`) per discipline #1 — see "Existing sibling/precedent"
> below for the exact hits and why none of them is this round's finding.
>
> Housekeeping: at session start, `git status --porcelain` was already clean (the working tree had
> caught up past M39-M94 via this project's async multi-agent mode — `git log` shows `feat(M92.S1)`,
> `feat(M93.S1)`, `feat(M94.S1)` already landed as real commits, not just proposed). All of this round's
> verification therefore reads the **current, already-more-advanced** state of the code, not the
> snapshot the M95 brief's own carried-forward list was written against.
>
> **Triage of the four carried-forward M94 threads** (per the brief's "pick one OR find something fresh,
> grep-check first" instruction):
> 1. DoK-import `CoreClassId` excludes ranger/knight (M32, M86, M94) — re-confirmed still true, still
>    correctly characterized as needing a new race/order signal this save format doesn't carry; not a
>    same-round-sized slice. Not picked.
> 2. `createCharacter()` has no per-class ability-score minimums — re-confirmed still true (re-read
>    `character.ts` in full, no STR/CON/WIS floor exists beyond the racial min/max range). A real, valid,
>    but *separate* gap; not picked this round (see "Rejected alternatives").
> 3. DQK's distinct manual "Paladin" row vs. "Knight" — still **UNKNOWN** whether it's a real distinct
>    playable class; no new primary source found this round (would need DQK's own character-creation
>    screen text or an ECL/overlay disassembly pass). Not picked.
> 4. **`createCharacter()` still only validates against CoK's `maxLevel()`, never M93's own
>    `dqkMaxLevel()`, flagged by M92/M93 as "moot today only because DQK doesn't currently create
>    characters through this path" — this round re-verified that claim and found it is NO LONGER fully
>    true**: it's still true for the *hand-authored* `dqkParty.ts` roster (unchanged, still under both
>    caps), but it is now demonstrably, currently untrue for `importDokParty.ts`'s *derived* level
>    inference, which silently discards a better real-bytes fit for 3 of the 6 already-shipped, bundled
>    DoK save files, specifically because of this exact gap. **This is this round's pick** — a direct,
>    freshly-verified continuation of thread 4, not a fresh speculative sweep.

## Headline finding

**`importDokParty.ts`'s `MAX_INFERRED_LEVEL = 8` search-range clamp — added at M14 (2026-07-03) purely
to keep every inferred level inside CoK's `createCharacter()` cap, two days *before* M93 (2026-07-05)
proved DQK's own manual places no cap on a human in any of these four classes — silently truncates the
best-fit level search for real DoK saves whose true THAC0 byte best matches a level above 8, discarding
an exact or near-exact real-bytes fit in favour of a worse one, purely to dodge a rejection rule
(`createCharacter()`'s CoK-only `maxLevel()`) that DQK's own now-known table says should never have
fired in the first place.** Concretely, for 3 of the 6 real, bundled `Death Knights of Krynn/SAVE/
CHRDATA{n}.GAM` pregens this project already ships and already imports via the real, ordinary
"⇪ Import DoK party → DQK" sidebar command:

| Hero | Class (real spell-vote, M33) | Real save THAC0 byte | **Today's derived level (diff)** | **Best-fit level if unclamped (diff)** | HP today | HP if correctly derived |
|---|---|---|---|---|---|---|
| TANAR | cleric | 14 | **L7 (diff 2)** | **L10 (diff 0 — exact)** | 49 | 70 |
| FLAVIUS | cleric | 13 | **L7 (diff 3)** | **L10 (diff 1)** | 42 | 60 |
| CELESTE | magicUser | 14 | **L6 (diff 5)** | **L11 (diff 3)** | 30 | 55 |

(SIR DRYDEN, LILLITH, NEACAIL are unaffected — their real THAC0 bytes already best-fit inside the
clamped 1-8 range; see "Reachable in real, ordinary, shipped play" for the full re-derivation including
these three as a negative control.) TANAR's case is the sharpest: her real save byte is an **exact**
match (diff 0) for a level-10 Cleric, but the shipped importer reports her as a level-7 Cleric with a
worse (diff-2) fit — not because level 10 is illegal for a human Cleric in DQK (`dqkMaxLevel('human',
'cleric') === null`, i.e. uncapped, per M93's own table), but because `createCharacter()` — the one
validator every DQK-destined character sheet in this codebase passes through — has no way to know it is
validating a DQK character and applies CoK's flat 8-level human-cleric cap regardless. The player sees
this directly: the on-screen "Imported N heroes from Death Knights of Krynn" summary table
(`apps/web/src/ui/main.ts`'s `startImportDok()`) prints **"TANAR cleric L7 — 49 HP"** where the real save
byte supports **"TANAR cleric L10 — 70 HP"** exactly.

## Existing sibling/precedent and the self-flagging evidence

**Grep results (discipline #1), confirming this is new, not a re-proposal:**

- `grep -rn "MAX_INFERRED_LEVEL\|inferDokLevel\|clamping the search" docs/engine/research/m*-audit.md` →
  5 hits (`m61`, `m64`, `m86`, `m88`, `m89`), all of them either (a) reproducing `inferDokLevel`'s
  *current* line-for-line behaviour as ground truth for an unrelated fix (M61's THAC0-naming-trap note,
  M64's multiple-attacks breakpoint, M86's ability-clamp fix, M88's Constitution-HP fix), or (b) M89's
  own explicit re-confirmation that the clamp exists and is "under every candidate class's human cap" —
  **none of the five ever questions whether the clamp is still the right bound**, and none cross-checks
  it against DQK's own level table (which didn't exist in the codebase until M93, i.e. after 4 of these
  5 citations).
- `grep -rn "extended to validate against.*table too\|createCharacter.*extended" docs/engine/research/
  m*-audit.md` → exactly one hit, `m93-audit.md:319` — M93's own "Open questions" line: *"worth
  tightening if `createCharacter()` is ever extended to validate against DQK's table too"* — a direct,
  named, still-open invitation this round takes up.
- `grep -rln "levelCapRuleset\|ruleset.*cok.*dqk"` → zero hits anywhere. No prior round proposed this
  specific parameter/fix shape.

**Git-blame dating (mandatory discipline #4), the exact "two-days-later" shape:**

```
$ git log --format="%h %cd %s" --date=iso -S "MAX_INFERRED_LEVEL" -- apps/web/src/ui/importDokParty.ts
31dc307 2026-07-03 06:51:08 +0200 web: M14.S1 — DoK -> DQK character carry-over (?import=dok)...

$ git log --format="%h %cd %s" --date=iso -S "DQK_MAX_LEVEL" -- packages/engine/src/ruleset/addnd1e-dragonlance/classes.ts
e871482 2026-07-05 18:46:52 +0200 feat(M93.S1): enforce DQK's own real, finite race/class level caps
```

`MAX_INFERRED_LEVEL`'s own doc comment (`importDokParty.ts:128-130`, unchanged since M14) is explicit
about *why* 8 was chosen, and it is a **correct, honest statement of the information available at the
time**: *"Human race cap shared by all four candidate classes (cleric/fighter/magicUser = 8; thief = 9)
— clamping the search to 8 keeps every inferred level legal for all four without a race-cap lookup."*
At M14 (2026-07-03), `createCharacter()` had exactly one level-cap table (CoK's `MAX_LEVEL`), so this was
the only safe choice — not a mistake, a correct compromise given what existed. **M93 (2026-07-05) then
proved, from DQK's own manual, that a human is uncapped (`null`) in all four of these classes in DQK** —
but nobody has yet gone back to `importDokParty.ts` (or `character.ts`) to update the now-stale
compromise. This is the same self-flagging shape M93 itself named in its own "Implications" section
(*"even the correct, cautious, deliberately-scoped fallback... can itself under-serve the third game once
that game's own real table is actually available, if nobody circles back"*) — this round is the direct
continuation of that exact prediction, one call site over, and with real, currently-shipped consequences
(not the "not yet reachable" framing M93 used for `createCharacter()`'s general risk).

M93's own "Secondary observations" already noted the *general* risk (*"every one of `dqkParty.ts`'s 6
hand-authored `DQK_HEROES`... and every DoK-import-derived DQK character... happen to sit under both
CoK's and DQK's caps today, so this specific risk has not yet produced a wrong rejection in
practice"*) — this was true for `dqkParty.ts` (still is, unchanged) but this round found it is **not**
true for `importDokParty.ts`: M93 checked whether `createCharacter()` would *reject* an import (return
`ok:false`), and correctly found no current import attempts a level high enough to trigger that. What
M93 did not check is that `importDokParty.ts` **never attempts a higher level in the first place** —
`MAX_INFERRED_LEVEL` pre-emptively narrows the search so a rejection can never even be attempted, which
looks like it avoids the M93-flagged risk entirely, but actually just moves the damage from "a visible
rejection" to "a silent, wrong derivation" one step upstream. Verified below is that this silent
wrong-derivation is *already firing*, for real, bundled data, today.

## Where the severance happens — exact locations, current source

**`packages/engine/src/ruleset/addnd1e-dragonlance/character.ts:120-129`** (`createCharacter`, current
source, the one level-cap check every DQK-destined `CharacterRequest` passes through, full — unchanged
by M93, which added `dqkMaxLevel()` as a sibling function but never wired it here):

```ts
for (const [cls, level] of entries) {
  if (!allowsClass(req.race, cls)) {
    errors.push(`${req.race} may not be a ${cls}`);
    continue;
  }
  const cap = maxLevel(req.race, cls, req.abilities.str);   // <-- ALWAYS CoK's table, never dqkMaxLevel()
  if (cap !== null && level > cap) {
    errors.push(`${cls} level ${level} exceeds the ${req.race} cap of ${cap}`);
  }
}
```

`grep -n "dqkMaxLevel" packages/engine/src/ruleset/addnd1e-dragonlance/character.ts` → zero hits.
`CharacterRequest` (`character.ts:33-51`) has no field of any kind that could tell `createCharacter()`
which game's cap table applies.

**`apps/web/src/ui/importDokParty.ts:128-130`** (the clamp, current source, full, doc comment included):

```ts
/** Human race cap shared by all four candidate classes (cleric/fighter/magicUser = 8; thief = 9) —
 * clamping the search to 8 keeps every inferred level legal for all four without a race-cap lookup. */
const MAX_INFERRED_LEVEL = 8;
```

**`apps/web/src/ui/importDokParty.ts:181-193`** (`inferDokLevel`, current source, full — the function
this round's finding lives in):

```ts
/** The level (1..8) whose `thac0(class, level)` best matches the save's byte-faithful THAC0 byte. */
function inferDokLevel(cls: CoreClassId, thac0: number): number {
  let best = 1;
  let bestDiff = Infinity;
  for (let lvl = 1; lvl <= MAX_INFERRED_LEVEL; lvl++) {           // <-- search truncated at 8, always
    const diff = Math.abs(classThac0(cls, lvl) - thac0);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = lvl;
    }
  }
  return best;
}
```

**`packages/engine/src/ruleset/addnd1e/combatTables.ts:23,72-75`** (`MAX_COL = 12`, `col()`) — the
table's own real ceiling; levels beyond 12 clamp to column 12's value (per the file's own doc comment,
"Levels beyond 12 clamp to the last column (the engine caps here)"), so 12, not 8, is the correct search
bound once the CoK-only rejection risk is removed — extending the search to 12 cannot produce a *worse*
fit for any character whose true best fit is ≤8 (a best-fit search over a wider range never regresses an
existing exact match), and is the exact, principled new ceiling (not an arbitrary guess).

**`apps/web/src/ui/dqkParty.ts:43-46`** (`buildSheet`) has the structurally identical exposure — it also
calls `createCharacter(req)` with no game-context signal — but is currently inert (see "Secondary
observations": all 6 `DQK_HEROES` sit under both caps today).

## Reachable in real, ordinary, shipped play — static + dynamic proof

**Static reachability, the full real chain:** `apps/web/src/ui/main.ts:608-615` — a real, ordinary
sidebar entry, **"⇪ Import DoK party → DQK"**, sitting directly beside the already-shipped "Import CoK
party → DoK" entry, both front-door menu commands with no dev console involved — sets
`?import=dok` and calls `startImportDok()` (`main.ts:810`) → `importDokParty()`
(`importDokParty.ts:286`) → for each of the 6 real, bundled `Death Knights of Krynn/SAVE/
CHRDATA{1..6}.GAM` files, `sheetFromDokSaved()` (`importDokParty.ts:226`) → `inferDokLevel()` (clamped to
8) → `createCharacter()` (CoK-only cap) → the resulting sheet is pushed into the party and its derived
class/level/HP/AC/THAC0 are rendered directly into the on-screen "Imported N heroes..." table
(`main.ts:848-850`, `${s.cls} L${s.level}`, `${s.hp} HP`). No save-editing, no dev console, no synthetic
data — these are the actual `.GAM`/`.WIZ`/`.JNK` files this project already bundles and ships.

**Dynamic re-derivation this round** (three scratch vitest files, created, run, then deleted — see
below), against the real, current, unmodified `decodeDokSavedCharacter`/`classVoteFromDokIds`/
`decodeMonsterWizRecord`/`thac0`/`clampToRace`/`ADND1E_ABILITIES.constitution`/`levelHpGain`/`hitDie`/
`createCharacter`/`dqkMaxLevel` production functions (imported directly from `packages/engine/src`), run
against the real `Death Knights of Krynn/SAVE/CHRDATA{1..6}.GAM`/`.WIZ` files this project already
bundles — reproducing `sheetFromDokSaved()`'s exact pipeline line-for-line, including M33's real
`.WIZ`-based class vote (not the naive ability-score fallback):

```
SIR DRYDEN | cls: fighter  | rawThac0: 14 | CLAMPED L7  diff 0 | UNCLAMPED L7  diff 0 | -- unaffected
LILLITH    | cls: fighter  | rawThac0: 13 | CLAMPED L8  diff 0 | UNCLAMPED L8  diff 0 | -- unaffected
TANAR      | cls: cleric   | rawThac0: 14 | CLAMPED L7  diff 2 | UNCLAMPED L10 diff 0 | -- AFFECTED (exact fit found)
FLAVIUS    | cls: cleric   | rawThac0: 13 | CLAMPED L7  diff 3 | UNCLAMPED L10 diff 1 | -- AFFECTED
NEACAIL    | cls: cleric   | rawThac0: 16 | CLAMPED L7  diff 0 | UNCLAMPED L7  diff 0 | -- unaffected (negative control)
CELESTE    | cls: magicUser| rawThac0: 14 | CLAMPED L6  diff 5 | UNCLAMPED L11 diff 3 | -- AFFECTED

dqkMaxLevel('human', 'cleric')    === null   (uncapped in DQK)
dqkMaxLevel('human', 'magicUser') === null   (uncapped in DQK)

createCharacter({ ...TANAR at L10... })    -> { ok: false, errors: ["cleric level 10 exceeds the human cap of 8"] }
createCharacter({ ...FLAVIUS at L10... })  -> { ok: false, errors: ["cleric level 10 exceeds the human cap of 8"] }
createCharacter({ ...CELESTE at L11... })  -> { ok: false, errors: ["magicUser level 11 exceeds the human cap of 8"] }
-- i.e. simply widening inferDokLevel's search WITHOUT also fixing createCharacter()'s cap source would
   flip these three from "silently underleveled" to "silently rejected outright" (result.rejectedInvalid)
   -- both halves of the fix are required together, confirmed by direct reproduction, not assumed.

HP consequence (real ADND1E_ABILITIES.constitution + levelHpGain, per-hero real Constitution score):
TANAR   con 17 (+2 hp/lvl): L7 HP 49  -> L10 HP 70
FLAVIUS con 15 (+1 hp/lvl): L7 HP 42  -> L10 HP 60
CELESTE con 16 (+2 hp/lvl): L6 HP 30  -> L11 HP 55
```

All values reproduced against the real, unmodified production exports and the real bundled save bytes —
no fixtures, no hypothetical characters. The three scratch files (`packages/engine/test/
_scratch_m95_verify.test.ts`, `_scratch_m95_verify2.test.ts`, `_scratch_m95_verify3.test.ts`) were
created, run (all passing), and deleted; `git status --porcelain` confirmed clean before and after, this
doc the only new file.

## The existing e2e fixture already bakes in the wrong values

`apps/web/test/e2e.mjs`'s `runImportDok()` (~line 2415-2557), the real, already-passing e2e test for
this exact import flow, contains, verbatim, current source:

```js
// M88.S1 — HP now also includes the real per-level Constitution bonus (previously silently
// dropped): DRYDEN (fighter7, con17, +3/lvl) 42->63; LILLITH (fighter8, con18, +4/lvl) 48->80;
// TANAR (cleric7, con17, +2/lvl) 35->49; FLAVIUS (cleric7, con15, +1/lvl) 35->42.
const hpFixedOk = dryden?.hp === 63 && lillith?.hp === 80 && tanar?.hp === 49 && flavius?.hp === 42;
```

`tanar?.hp === 49` and `flavius?.hp === 42` are exactly the *wrong* (clamped-level) values this round's
finding identifies — this is the same "the test itself certifies the wrong behaviour as a passing green
assertion" shape M86/M89/M90 already established. **A fix must update these two literals (to 70 and 60)
in the same change**, per this loop's own "the fix and its test travel together" discipline; leaving them
unchanged after a fix ships would fail the test for the right reason (proving the fix works), which is
itself useful confirmation, but should not be mistaken for "the fix broke something."

## Proposed minimal wiring plan (not applied this round — audit scope is research only)

**Step 1 — thread a level-cap-table selector into `createCharacter()`**, additive, default-preserving:

```ts
// sketch, not applied this round -- packages/engine/src/ruleset/addnd1e-dragonlance/character.ts
import { allowsClass, maxLevel, dqkMaxLevel, isMultiClassAllowed, petitionableOrder, ... } from './classes.js';

export interface CharacterRequest {
  // ...unchanged fields...
  /** Which race/class level-cap table to validate against (M95). Absent/`'cok'` = the flat, low CoK/DoK
   * ceiling (`maxLevel()`, Journal p.56 — the correct default for every existing CoK/DoK caller, so no
   * existing behaviour changes). `'dqk'` = DQK's own, materially more permissive table (`dqkMaxLevel()`,
   * M93, Journal.pdf p.49) -- for the two callers that actually build a DQK-destined sheet
   * (`dqkParty.ts`, `importDokParty.ts`). */
  levelCapRuleset?: 'cok' | 'dqk';
}

// inside createCharacter()'s class-legality loop:
for (const [cls, level] of entries) {
  if (!allowsClass(req.race, cls)) { errors.push(`${req.race} may not be a ${cls}`); continue; }
  const cap = req.levelCapRuleset === 'dqk'
    ? dqkMaxLevel(req.race, cls)
    : maxLevel(req.race, cls, req.abilities.str);
  if (cap !== null && level > cap) {
    errors.push(`${cls} level ${level} exceeds the ${req.race} cap of ${cap}`);
  }
}
```

**Step 2 — the two real DQK-destined callers opt in:**

```ts
// sketch -- apps/web/src/ui/importDokParty.ts, sheetFromDokSaved()'s req object
const req: CharacterRequest = { ..., levelCapRuleset: 'dqk' };

// sketch -- apps/web/src/ui/dqkParty.ts, buildSheet()'s createCharacter call — mirrors the same
// opt-in for the hand-authored Heroes-of-the-Lance roster, so a future higher-level hero addition
// (see "Secondary observations") doesn't silently vanish from the roster the same way.
function buildSheet(req: CharacterRequest): CharacterSheet | null {
  const res = createCharacter({ ...req, levelCapRuleset: 'dqk' });
  return res.ok ? res.sheet : null;
}
```

`create.ts` (CoK/DoK's own "Create New Character" screen) needs **zero changes** — it never sets
`levelCapRuleset`, so it silently keeps the correct, unchanged CoK/DoK default.

**Step 3 — widen `importDokParty.ts`'s search range to match the table's own real ceiling:**

```ts
// sketch -- apps/web/src/ui/importDokParty.ts
/** The engine's own THAC0 table clamps at level 12 (`combatTables.ts`'s MAX_COL) — searching further
 * can never change the answer. Was artificially 8 (M14), to dodge createCharacter()'s CoK-only cap;
 * now that DQK-destined requests pass `levelCapRuleset: 'dqk'` (M95, uncapped for every human class
 * this importer can infer), the search can honestly range over the table's full real extent. */
const MAX_INFERRED_LEVEL = 12;
```

Notes on the sketch:
- **Both halves (the wider search AND the `dqk` cap mode) are required together**, confirmed by direct
  reproduction above: widening the search alone, without also switching `createCharacter()`'s cap
  source, would flip TANAR/FLAVIUS/CELESTE from "silently underleveled" to "silently rejected outright"
  (`result.rejectedInvalid`, dropping them from the roster entirely) — a strictly worse regression. Both
  edits are small, additive, and default-preserving individually, but must ship as one slice.
- **This is the exact taxonomy shape M92/M93 already named**, one hop further: a validation gate
  (`createCharacter`'s level check) correctly serves its first, older context (CoK/DoK creation) but is
  blindly reused by a second, newer context (DQK import) whose own real rule table (only available since
  M93) is different — except here the mis-application isn't a *rejection* (M93's DQK-training-hall
  shape) but a *pre-emptive, upstream narrowing of a search space* that avoids ever exercising the
  rejection path, which is a subtler, one-step-further variant worth naming explicitly (see
  "Implications").
- The e2e regression: update `apps/web/test/e2e.mjs`'s `runImportDok()`'s `hpFixedOk` literals
  (`tanar?.hp === 49` → `70`, `flavius?.hp === 42` → `60`) — required, not optional, per the "the fixture
  bakes in the wrong invariant" finding above. `thac0ShownOk`/`memShownOk`/`acOk` are already
  self-referential (they read `dryden.thac0` etc. dynamically off the live seam, not hardcoded numbers)
  so they should continue to pass unchanged; `memOk`'s spell *lists* (crosswalked from the save's own
  `.WIZ` bytes, independent of derived level) are expected to be unaffected — worth a follow-up run to
  confirm, not re-derived by this audit-only round.
- CELESTE's HP is not currently asserted by name in `runImportDok()` (only her AC/THAC0/mem are) — no
  existing literal to update for her, but a new one could be added (`celeste?.hp === 55`) as part of the
  same change, for parity with the other three.

## Secondary observations not part of this round's fix

- **`dqkParty.ts`'s `DQK_HEROES` roster remains a *latent*, not-yet-triggered instance of the identical
  gap** (re-confirmed unchanged from M93's own framing): all 6 hand-authored heroes still sit under both
  CoK's and DQK's caps today, so `buildSheet()`'s un-gamed `createCharacter()` call has produced no wrong
  result yet. It *would* the moment a future round authors a hero above CoK's flat cap but within DQK's
  own permissive one (e.g. a level-10 human Fighter, legal in DQK, illegal in CoK) — `buildSheet()` would
  return `null` and `installDqkParty()`'s `if (sheet) addToParty(sheet)` would **silently drop the hero
  from the roster with no error surfaced anywhere** (no console warning, no on-screen message — the
  tech-demo roster would just be missing a hero). Step 2's opt-in above closes this preemptively at
  near-zero cost (same one-line change as the reachable fix), so it is bundled into the proposed plan
  even though it has no observable consequence *today*.
- **`allowsClass()`'s class-legality check (as opposed to the level-*cap* check) is untouched by this
  fix and correctly so** — `importDokParty.ts` always builds `race: 'human'`, and CoK's `MAX_LEVEL`
  table has no `null` (disallowed) cells for any human class, so `allowsClass('human', cls)` is `true`
  for all four inferrable classes regardless of which cap table governs the *level*. A future round that
  race-corrects the DoK importer (a separate, already-flagged limitation, see thread 1 above) would need
  to revisit `allowsClass` too, since DQK's own "No" cells (e.g. Silvanesti/Qualinesti Elf may not be a
  Knight) are a *different* table than CoK's — out of scope here, flagged for whoever picks up the
  race-correction.
- **Widening `MAX_INFERRED_LEVEL` cannot regress DRYDEN/LILLITH/NEACAIL** (verified above: all three
  already have a diff-0 exact fit inside the old 1-8 range; a best-fit search over a strictly larger
  range can only find an equal-or-better match, never worse) — a genuinely risk-free widening for the
  three already-correct heroes, not just an assumption.

## Rejected alternatives considered this round

| Candidate | Why rejected |
|---|---|
| DoK-import `CoreClassId` excluding ranger/knight (M32/M86/M94 thread 1) | Re-confirmed still true, still correctly scoped as "needs a new race/order signal," a bigger lift than a single-round slice; no new angle found this round. |
| `createCharacter()`'s missing per-class ability-score minimums (M94 thread 2) | Re-confirmed still true (re-read `character.ts` in full — only the racial min/max *range* is enforced, no STR/CON/WIS floor for Ranger/Paladin-analogue Knight). A real, separate, valid future candidate, but a different kind of gap (a missing enforcement with no currently-known real-bytes-driven trigger scenario as sharp as this round's TANAR exact-fit case) — not picked this round in favour of the more concretely-verified, already-shipped-data finding above. |
| DQK's distinct "Paladin" row (M93/M94 thread 3) | Still **UNKNOWN** whether DQK models a distinct playable class; no new primary source consulted this round (would need DQK's own character-creation UI text or an ECL/overlay disassembly pass, neither attempted here). Left open. |
| A fresh, unrelated sweep instead of a carried-forward thread | Rejected per this loop's own established preference (M88, re-affirmed M94) for "a prior round's own explicit, well-specified deferral" over a fresh speculative sweep — thread 4 was both explicitly named (`m93-audit.md:319`) and, on re-verification, found to have *changed status* (from "moot" to "concretely reachable for real bundled data"), which is exactly the kind of update this loop's backlog mechanism is meant to catch. |

## Open questions / unknowns

- **Whether `levelCapRuleset` should live on `CharacterRequest` (this round's sketch) or be a second,
  separate parameter to `createCharacter()`** — the sketch follows `CharacterRequest`'s own existing
  precedent (optional fields like `deity`/`robe` already live there), but a lead session may prefer a
  second parameter for clarity that it's a *validation mode*, not part of the character's own data. Not
  resolved here; either is small.
- **Whether CELESTE's HP should gain its own new e2e assertion** (no existing literal names her HP
  today) as part of the same change, for parity with DRYDEN/LILLITH/TANAR/FLAVIUS. Small, a lead-session
  call.
- **Whether `memOk`'s spell-list assertions in `runImportDok()` are truly unaffected by the level
  change** — reasoned above (the crosswalked `.WIZ` spell ids are independent of the *derived* level) but
  not independently re-run against a patched build this round (audit scope is research only); worth a
  quick confirmation pass by whoever implements the fix.
- **Whether `dqkParty.ts`'s heroes should also gain higher, more "veteran, saga continues from DoK"
  levels now that the `dqk` cap mode exists** — a content/design question, not a bug; the fix's step 2
  only removes the silent-drop *risk*, it doesn't itself argue any hero should actually be re-leveled.

## Implications for our engine / for the taxonomy

- **A new, sharper taxonomy sub-case, one hop past M92/M93's own shape**: *"a validation gate that
  correctly serves game A is not merely misapplied when blindly reused for game B (M92/M93's shape) — a
  caller can pre-emptively narrow its own search/derivation space specifically to avoid ever exercising
  that gate's rejection path for game B, which hides the exact same rule-mismatch one layer further
  upstream, turning a visible rejection into a silent, wrong-but-plausible derived value."* This is
  harder to spot than M92/M93's shape precisely because nothing ever fails or errors — the import
  "succeeds," the character joins the roster, the numbers are merely wrong, and quietly so.
- **Confirms M93's own predicted mechanism, concretely, two rounds later**: M93's "Implications" section
  predicted almost exactly this — *"even the correct, cautious, deliberately-scoped fallback... can
  itself under-serve the third game once that game's own real table is actually available, if nobody
  circles back to replace 'disabled' with 'correctly re-enabled with the right data.'"* This round is
  that circle-back, for a different call site (`importDokParty.ts`'s search clamp) than the one M93 fixed
  (`trainMember`'s `enforceLevelCap` boolean), proving the same underlying lesson generalizes across more
  than one host function.
- **A byte-exact match (TANAR's diff-0 fit at L10) is unusually strong verification for a "derive from a
  best-fit search" mechanism** — when a wider search finds a *perfect* match where the narrower one only
  found an imperfect one, that is about as strong a real-bytes argument as this project's own
  "reachable/verified" bar asks for, considerably stronger than the "moot, no currently reachable
  consequence" framing this same general risk carried in M93.
- **This loop's own carried-forward backlog mechanism worked exactly as designed a second time**: M93
  named the exact follow-up question (`character.ts` extended to validate DQK's table); this round
  re-verified it against the *current* code and bundled data (not trusted at face value) and found its
  status had changed from "moot" to "concretely reachable," which is precisely the kind of drift this
  loop's "verify, don't just cite" discipline exists to catch.
