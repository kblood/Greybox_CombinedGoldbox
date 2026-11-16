# M84 audit — the next "computed but unwired" candidate

> Audit method: per requirement #4, first re-checked the carried-forward backlog (M83's own list) —
> found nothing with a fresh angle that wasn't already re-confirmed dead/inert/deliberately-deferred
> in the last several rounds. Per requirement #4's new (M83-added) clause, also re-scanned every prior
> round's own explicit "no consumer (yet)" rejections for a since-added consumer (`hasScribed`/
> `getSpellbook` in `party.ts`, flagged M32/M51 as real-but-currently-inert since `doMemorize()` never
> gates on the scribed-spell set) — re-confirmed this is still correctly unpicked: `BUILD-QUEUE.md`'s
> own M20 entry shows the Scribe verb was **deliberately** implemented scroll-free ("a stub for
> learning from scrolls... for when scroll sources land"), so gating Memorize on it today would strand
> every fresh/imported mage with a permanently empty castable list — a genuine game-design change, not
> a wiring fix, so correctly left alone (see "Rejected alternatives"). Pivoted to a fresh code-driven
> sweep of `TacticalCombatant`/`TacticalSpell`'s sibling optional fields near `int` (M81's own fix) and
> found a structurally identical gap one field over: `TacticalSpell.priority`.

## Headline finding

### The tactical AI's own "cast the highest-priority spell first" mechanism (`chooseOffensiveCast`, ovr010 `sub_3560B`) — implemented, unit-tested, and called for every real enemy spellcaster in every fight — is fed a `priority` value that is **never set by any real spell in the entire ruleset** (`combatSpells.ts`'s `tacticalSpellFor()`, the sole builder of every `TacticalSpell` in the engine, omits the field entirely), so the "priority-descending" sort silently degenerates to raw array-insertion order; verified end-to-end on a real, named DoK monster (FLAVIUS, id 50) that this causes the AI to cast a real spell (Stinking Cloud, true COAB priority 5) ahead of a higher-priority one (Lightning Bolt, true COAB priority 6) it should have preferred

## The real, already-implemented, already-tested consumer

`packages/engine/src/combat/tactical.ts:238-243` (`TacticalSpell.priority`, current source, full):

```ts
/**
 * AI casting **priority** (ovr010 `sub_3560B`: the monster AI draws spells in descending priority,
 * 7 highest). The built-in AI's offensive-spell pick (CT.6) prefers the highest-priority castable
 * spell. Default 0 — engine-applied ordering only; not part of the spell's mechanical resolution.
 */
priority?: number;
```

`packages/engine/src/combat/tactical.ts:1681-1703` (`chooseOffensiveCast`, current source, full):

```ts
/**
 * The AI's offensive cast decision (CT.6 / ovr010 `sub_3560B`): scan prepared enemy-offensive spells in
 * DESCENDING {@link TacticalSpell.priority}, and cast the first with a valid in-range, clear-line target
 * that is **worth casting** — a save-allowing spell is skipped when EVERY in-range target would make its
 * save ({@link aiTargetWouldSave}). The aim falls on a non-saver when one exists, else the policy pick.
 * Returns the cast action, or null to fall through to missile/melee.
 */
function chooseOffensiveCast(actor: TacticalCombatant, foes: TacticalCombatant[]): TacticalAction | null {
  const spells = (actor.preparedSpells ?? [])
    .filter((s) => (s.usesLeft ?? 1) > 0 && s.target === 'enemy' && (s.damage || s.inflict))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  for (const s of spells) {
    const inRange = foes.filter(
      (f) => chebyshev(actor.pos, f.pos) <= (s.range ?? 0) && clearLineOfFire(actor.pos, f.pos),
    );
    if (inRange.length === 0) continue;
    if (s.save !== 'none' && inRange.every((f) => aiTargetWouldSave(s, f))) continue; // all would save → skip
    const vulnerable = s.save !== 'none' ? inRange.filter((f) => !aiTargetWouldSave(s, f)) : inRange;
    const pool = vulnerable.length > 0 ? vulnerable : inRange;
    return { type: 'cast', spellId: s.id, targetId: pickTarget(actor, pool).id };
  }
  return null;
}
```

`chooseOffensiveCast()` is called from `aiAction()` for **every** enemy's turn where a prepared
offensive spell exists (the sole AI spell-pick function in the engine — confirmed by grep, no
sibling implementation). It is unit-tested in isolation with hand-built literals carrying explicit
priorities: `packages/engine/test/combatFormation.test.ts:256-257` —

```ts
const hold: TacticalSpell = { id: 'hold', name: 'Hold Person', target: 'enemy', range: 8, area: 'single', save: 'negate', inflict: { status: 'held', rounds: 6 }, priority: 5, usesLeft: 3 };
const mm: TacticalSpell = { id: 'mm', name: 'Magic Missile', target: 'enemy', range: 8, area: 'single', save: 'none', damage: { count: 1, sides: 1, bonus: 0 }, priority: 1, usesLeft: 3 };
```

— and `combatFormation.test.ts:277-286` (`'prefers the higher-priority spell, but falls through to a
lower-priority no-save spell when the first is wasted'`) proves the sort mechanism genuinely changes
the AI's decision when priorities differ. This is the exact "the rule is implemented and tested in
isolation" half of M81's own lesson — the isolated test only ever constructs `TacticalSpell` literals
by hand with `priority` set explicitly; it never goes through the real production spell-building path.

## Where the severance happens: `tacticalSpellFor()` — the SOLE builder of every real `TacticalSpell` in the engine — never sets `.priority`

`packages/engine/src/ruleset/addnd1e-dragonlance/combatSpells.ts:94-130` (`tacticalSpellFor`, current
source, the full returned object):

```ts
return {
  id: spellId,
  name,
  target,
  range: geo.range,
  area: geo.area,
  radius: geo.radius,
  save: geo.save,
  damage: isDamage ? diceToAmount(dice!) : undefined,
  heal: isHeal ? { ...diceToAmount(dice!), count: diceToAmount(dice!).count + Math.max(0, Math.floor(healDieBonus)) } : undefined,
  inflict: inflict ? { ...inflict } : undefined,
  casterLevel: Math.max(1, Math.floor(casterLevel)),
  usesLeft: Math.max(0, Math.floor(usesLeft)),
};
```

No `priority` key anywhere. Confirmed via grep this round: `grep -n "priority"
packages/engine/src/ruleset/addnd1e-dragonlance/combatSpells.ts` → **zero hits** in the entire file
(including the `GEOMETRY`/`INFLICT` tables at lines 40-65/73-81 that back every real spell). Since
`tacticalSpellFor()` is the **only** function in the entire codebase that constructs a `TacticalSpell`
for a real memorized spell (confirmed: `grep -rn "tacticalSpellFor(" packages/engine/src
apps/web/src` → called only from `packages/engine/src/ruleset/addnd1e-dragonlance/dokSpellCrosswalk.ts:70`
and `apps/web/src/ui/party.ts`'s party-side `combatSpellsForMember`), **every real spell any caster in
this engine can cast — monster or party — has `priority === undefined`**, unconditionally. Since
`chooseOffensiveCast`'s sort key defaults to `?? 0` for both sides of the comparison
(`tactical.ts:1691`), `Array.prototype.sort`'s guaranteed stability (ES2019+) means the "sort" is a
complete no-op: the AI's actual cast order is silently whatever order the caller happened to build the
`preparedSpells` array in, not the priority the engine's own doc comment claims it uses.

## The real, byte-verified fact this severs from: COAB's own per-spell `SpellEntry.priority` table

`docs/engine/research/decompile-ovr010-monster-ai.md:56-67` (Spell selection — `sub_3560B` +
`ShouldCastSpellX`, the source document M81 already used as its own primary grounding for the
`Int>5` fix):

> Then, descending **priority** from 7 for up to `roll_dice(7,1)` rounds, it draws up to 3 random
> spells from the learnt list and casts the first that passes `ShouldCastSpellX(priority, id)`:
> `spell.priority >= minPriority`, and ...

`docs/engine/research/decompile-ovr010-monster-ai.md:124-126` (the DELTAS list, item 3, the exact
item this round closes the data half of):

> **Spell AI:** engine casts the first prepared enemy-offensive spell; original does
> **priority-descending, save-aware** selection (`ShouldCastSpellX` — skip if the target makes its
> save). Add priority + save-check gating.

The save-check half of this delta **is** fully implemented (`aiTargetWouldSave`,
`tactical.ts:1676-1679`, and the skip logic quoted above) — only the **priority** half was ever left
unfed. This is confirmed by `docs/engine/research/decompile-worklist.md:255` (the shipped-deltas
summary for the very commit that added `priority` to the type): *"**AI fidelity deltas**
(random-target default / save-aware spells / Int>5 surrender...) (ovr010/ovr032-033) —
`combat/geometry.ts` + `tactical.ts`, `combatFormation.test.ts` (27 tests). Commit `1551717`."* — note
this list names **"save-aware spells"** as a delivered item but never claims "spell priority" was
populated; only the sort mechanism (an empty vessel) shipped.

The real per-spell priority values are **not unrecoverable** — they sit in this project's own primary
cross-generation Gold Box reference source, already treated as decompile-verified ground truth for
shared AI mechanics by M28 (`con_saving_bonus`) and M81 (`Int > 5` threshold):
`coab_extracted/Classes/Spells.cs:153-203` (`SpellEntry`, `public int priority;` field, line 200) and
`coab_extracted/Classes/Gbl.cs`'s per-spell `new SpellEntry(...)` initialization table. Cross-checking
by **spell name** (COAB's own internal `Spells` enum, `coab_extracted/Classes/Spells.cs:48-151`, is a
different numbering scheme from DoK's own `hackdocs_extracted/SPELBOOK.TXT` 1-126 ids that
`DOK_SPELL_CROSSWALK` uses — matched here by name, not by raw id) gives real, byte-decompiled priority
values for every one of the 20 spells this engine's own `GEOMETRY`/`INFLICT` tables already model:

| This engine's id | COAB spell (enum id) | Real COAB priority | Gbl.cs line |
|---|---|---|---|
| `c1-cure-light-wounds` | `cure_light_wounds` (0x03) | 1 | 571 |
| `c1-cause-light-wounds` | `cause_light_wounds` (0x04) | 2 | 572 |
| `c4-cure-serious-wounds` | `cure_serious_wounds` (0x3a) | 1 | 626 |
| `c5-cure-critical-wounds` | `cure_critical_wounds` (0x47) | 2 | 639 |
| `c5-cause-critical-wounds` | `cause_critical_wounds` (0x48) | 6 | 640 |
| `c5-flame-strike` | `flame_strike` (0x4a) | 6 | 642 |
| `c2-hold-person` | `hold_person_CL` (0x17) | 6 | 591 |
| `m1-magic-missile` | `magic_missile` (0x0f) | 4 | 583 |
| `m1-burning-hands` | `burning_hands` (0x09) | 2 | 577 |
| `m1-shocking-grasp` | `shocking_grasp` (0x14) | 2 | 588 |
| `m1-sleep` | `sleep` (0x15) | 2 | 589 |
| `m2-stinking-cloud` | `stinking_cloud` (0x22) | **5** | 602 |
| `m3-fireball` | `fireball` (0x2f) | 7 | 615 |
| `m3-hold-person` | `hold_person_MU` (0x31) | 6 | 617 |
| `m3-lightning-bolt` | `lightning_bolt` (0x33) | **6** | 619 |
| `m3-slow` | `slow` (0x37) | 4 | 623 |
| `m3-haste` | `haste` (0x30) | 3 | 616 |
| `m4-fear` | `fear` (0x54) | 6 | 652 |
| `m4-ice-storm` | `ice_storm` (0x57) | 7 | 655 |
| `m5-cone-of-cold` | `cone_of_cold` (0x5c) | 6 | 660 |

Genuinely variable (1-7), not a constant — satisfies this loop's "real, varying fact" bar the same
way M81's Int table and M83's Int-consequence table did.

## Reachable in real, ordinary, shipped play — traced end to end, and dynamically verified with real bytes

1. **A real, named DoK monster's real memorized spellbook contains both a lower- and a
   higher-true-priority crosswalked offensive spell.** `docs/engine/research/m31-audit.md:90`'s own
   byte-level decode table: monster id **50** memorizes raw DoK spell ids `47,87,113,110,111,114,
   72,112,32,34,51,92,108,94×2,98` = Fireball, Ice Storm, Stone to Flesh, Death, Disintegrate, Flesh
   to Stone, C:Cause Crit, Globe of Invuln, Mirror Image, **Stinking Cloud**, **Lightning Bolt**, Cone
   of Cold, D:Hold Animal, Hold Monsters×2, D:Cure Light. This round confirmed monster id 50 is
   **FLAVIUS** — a real, named DoK character already independently catalogued as a real itemed
   monster record (`docs/engine/research/m26-audit.md:117,120`: *"id 50 FLAVIUS
   (+8/+3/+4/+3/+3/+3)"*, part of DoK area 1's real bestiary/item roster alongside SIR DRYDEN, BLACK
   MAGE, HIGH WIZARD, etc.) — not an obscure or unused record; FLAVIUS is a recurring, heavily-tested
   named entity throughout this loop's own e2e suite (`apps/web/test/e2e.mjs:1448-1461,2334-2407`, as
   a real importable DoK pregen character, and separately as this real `MON1CHA.DAX`/`MON1WIZ.DAX`
   template record decoded this round).
2. **`DOK_SPELL_CROSSWALK` (`packages/engine/src/ruleset/addnd1e-dragonlance/dokSpellCrosswalk.ts:27-41`)
   crosswalks BOTH raw ids 34 (`m2-stinking-cloud`) and 51 (`m3-lightning-bolt`) to real, fully-geometried
   `TacticalSpell`s** — both survive `preparedSpellsFromDokIds()` (`dokSpellCrosswalk.ts:58-74`), the
   real production function that also serves `apps/web/src/ui/combat.ts:312-328`'s `makeTC()` — the
   SAME already-established real pipeline M31/M80 traced in full (dungeon fetch → decode → join
   `applyPreparedSpellIds` → `monsterCombatant()` → `makeTC()` → `chooseOffensiveCast()`), confirmed
   again this round with no gap in the plumbing itself.
3. **The raw id array places Stinking Cloud (id 34) BEFORE Lightning Bolt (id 51)** — confirmed this
   round by direct decode (see Verification evidence). Since neither carries a real `.priority` (both
   `undefined`, per the severance above), `chooseOffensiveCast`'s stable sort preserves this raw order
   unchanged.
4. **When both spells have a valid target in range simultaneously, the AI casts Stinking Cloud (true
   COAB priority 5) instead of Lightning Bolt (true COAB priority 6) — the wrong one, by the engine's
   own documented and byte-verified intent.** Verified dynamically (not just read statically) this
   round by running the actual, unmodified production functions — `decodeMonsterArchive`,
   `decodeMonsterWizArchive`, `preparedSpellsFromDokIds`, `createTacticalCombat`, `aiAction()` — against
   the real `Death Knights of Krynn/MON1CHA.DAX`/`MON1WIZ.DAX` bytes end to end (see "Verification
   evidence" below). This is a deterministic TypeScript function (not an ECL bytecode interpreter), so
   a single concrete run against real production code *is* the dynamic proof this loop's discipline #2
   calls for — there is no `IF_*`-style guard-semantics ambiguity to separately re-check the way M82/M83
   had to for ECL findings.
5. **The consequence is a real, observable AI behavior difference in an ordinary DoK fight against this
   monster**, not a theoretical inconsistency: a player fighting FLAVIUS (or facing her as a scripted
   ally-turned-foe/boss encounter, per her real itemed-monster status) would see her open with Stinking
   Cloud (a poison/nausea area effect) in a situation where the original game's own AI heuristic would
   have preferred Lightning Bolt (a higher-priority, harder-hitting line-damage spell) — an authentic,
   named-character-specific AI fidelity gap, not a hypothetical one.

## Verification evidence (this round's scratch test)

`packages/engine/test/_scratch_m84_verify.test.ts` (created, run — **4/4 passing** — then deleted;
`git status --porcelain` confirmed clean both before and after, this doc the only untracked file):

1. **Real archive decode**: `decodeMonsterArchive`/`decodeMonsterWizArchive` against the real
   `Death Knights of Krynn/MON1CHA.DAX`/`MON1WIZ.DAX` files (not a fixture) confirm monster block id 50
   is named **FLAVIUS** and really memorizes raw spell ids
   `[47,87,113,110,111,114,72,112,32,34,51,92,108,94,98,94]` — id 34 (Stinking Cloud) appears at index
   9, id 51 (Lightning Bolt) at index 10 — 34 strictly before 51, matching `m31-audit.md`'s own
   independently-decoded table exactly.
2. **`preparedSpellsFromDokIds([34, 51], 10)`** (the real production crosswalk function, called with
   these two real ids) returns two `TacticalSpell`s, both with `priority: undefined` — confirmed by
   direct property inspection.
3. **THE BUG, reproduced with the real production pipeline**: built a real `TacticalCombatant` whose
   `preparedSpells` is this exact real, unmodified `preparedSpellsFromDokIds([34, 51], 10)` output,
   placed a party target at Chebyshev distance 5 (in range of both Stinking Cloud's real range-6 and
   Lightning Bolt's real range-10 geometry) with a poor save (`save: 15`, so `aiTargetWouldSave` does
   NOT skip Stinking Cloud as wasted), and ran the real `createTacticalCombat(...).aiAction()`. Result:
   `a.type === 'cast'`, `a.spellId === 'm2-stinking-cloud'` — the AI casts the LOWER true-priority
   spell, exactly as the severance predicts.
4. **THE FIX, same real spells, only `.priority` populated**: took the identical
   `preparedSpellsFromDokIds([34, 51], 10)` output and added ONLY the two real COAB priority values
   from the table above (`m2-stinking-cloud: 5`, `m3-lightning-bolt: 6`) via a plain object spread — no
   other change. Re-ran the identical scenario (same positions, same seed, same target save). Result:
   `a.spellId === 'm3-lightning-bolt'` — the AI now correctly prefers the higher true-priority spell.

Full `packages/engine` suite: **135 files / 1362 tests** with the scratch file present (134/1358 from
M83's own baseline + 1 file / +4 tests for this round's own scratch — matches the loop's running
convention), all green, via `cd packages/engine && npx vitest run`. Scratch file then deleted;
`git status --porcelain` confirmed the working tree clean except this doc.

## Was this a deliberate design decision? — `git log -S`/`git show` evidence

`git log --oneline -S "priority" -- packages/engine/src/ruleset/addnd1e-dragonlance/combatSpells.ts
packages/engine/src/combat/tactical.ts` → two commits: `13b15e1` (CT.6, the original morale/AI
commit, predates `priority`'s introduction — no hits there for the field itself) and **`1551717`**
("engine: implement 7 decompile engine-gaps (ovr011/015/017/018/021/028-030/032-033/044)") — **the
exact same commit M81 already investigated for the `TacticalCombatant.int` gap.**

`git show 1551717 -- packages/engine/src/combat/tactical.ts` shows this commit added the `priority`
field, its doc comment, and `chooseOffensiveCast`'s `.sort((a, b) => (b.priority ?? 0) - (a.priority ??
0))` line — **but `git show 1551717 --stat` confirms `combatSpells.ts`/`dokSpellCrosswalk.ts` are not
in this commit's file list at all.** The mechanism (an empty vessel) and the isolated proof
(`combatFormation.test.ts`'s hand-built `hold`/`mm` literals with explicit priorities) shipped
together; no commit, before or since, ever touched the ruleset's spell-geometry table to populate a
real value. `grep -n "TODO\|FIXME\|follow-up" packages/engine/src/ruleset/addnd1e-dragonlance/
combatSpells.ts packages/engine/src/ruleset/addnd1e-dragonlance/dokSpellCrosswalk.ts` → **zero hits** —
unlike some of this loop's other findings (e.g. M20's `attemptScribe`, which had an explicit
self-documenting "stub" comment), this specific gap carries no in-code marker at all; it is a pure
silent omission, not a flagged, deferred follow-up.

**Conclusion: this is the same "mechanism-shipped-data-never-supplied" shape M81 found in the
identical commit, for a different field.** `1551717`'s own commit message frames itself as
implementing "7 decompile engine-gaps," and `decompile-worklist.md:255`'s own summary of this commit
lists "save-aware spells" (the *skip-if-wasted* half of delta 3) as delivered but never claims the
*priority* half was populated — the commit's own scope, read literally, never promised real priority
data, only the mechanism and the skip-logic. This reads as an incomplete implementation of a
documented, six-item TODO list, not a deliberate decision to leave priority unfed forever.

## Why this wasn't already picked up (grep evidence against every prior round)

`grep -rn "TacticalSpell.priority\|spell.*priority\|chooseOffensiveCast" docs/engine/research/m*-audit.md`:

- **`m31-audit.md:50`** — the round that built the whole DoK-spell-to-combat pipeline — describes
  `chooseOffensiveCast()`'s mechanism in passing ("scans `preparedSpells` in descending priority and
  picks the first...") purely to establish that the AI-casting mechanism itself already exists; it
  never checks whether any real spell actually carries a nonzero priority. M31's own headline is the
  *spellbook* wiring (whether monsters cast at all), not the *spell-choice-ordering* question.
- **`m80-audit.md:224`** — quotes the same sort line ("scans `actor.preparedSpells` and casts the
  highest-priority offensive spell") purely as one hop in a *different* finding's reachability trace
  (the Fear-spell dispatch-gate gap) — never questions whether "highest-priority" is ever
  meaningfully non-tied in real data.
- **No prior round's audit doc contains the string `"tacticalSpellFor"` combined with `"priority"`**
  (confirmed by grep) — no round ever cross-checked `combatSpells.ts`'s own spell-construction function
  against the `priority` field it silently omits.
- **No prior round cites `coab_extracted/Classes/Spells.cs` or `Gbl.cs`'s `SpellEntry` priority
  values** (`grep -rln "SpellEntry\|Spells.cs" docs/engine/research/m*-audit.md` → no hits) — this
  round is the first to go back to the COAB source `decompile-ovr010-monster-ai.md` itself cites and
  pull the actual per-spell numbers out, rather than treating "priority-descending" as an abstract
  mechanism description.

## Wiring plan (proposed, not applied this round)

**Minimal, additive change, entirely inside `packages/engine/src/ruleset/addnd1e-dragonlance/
combatSpells.ts`** — mirrors the exact shape of `GEOMETRY`/`INFLICT`, this file's own established
per-spell-id lookup-table convention:

```ts
// sketch, not applied this round — combatSpells.ts, new table + one extra line in tacticalSpellFor()

/** AI casting priority (ovr010 sub_3560B, 0-7, 7 highest) — real values transcribed by spell NAME
 * identity from the COAB decompile (coab_extracted/Classes/Gbl.cs's SpellEntry table), the same
 * cross-generation Gold Box source already used as ground truth for Int>5 surrender (M81) and
 * con_saving_bonus (M28). Omitted ids default to 0 via chooseOffensiveCast's own `?? 0` fallback. */
const PRIORITY: Record<string, number> = {
  'c1-cure-light-wounds': 1, 'c1-cause-light-wounds': 2, 'c4-cure-serious-wounds': 1,
  'c5-cure-critical-wounds': 2, 'c5-cause-critical-wounds': 6, 'c5-flame-strike': 6,
  'c2-hold-person': 6, 'm1-magic-missile': 4, 'm1-burning-hands': 2, 'm1-shocking-grasp': 2,
  'm1-sleep': 2, 'm2-stinking-cloud': 5, 'm3-fireball': 7, 'm3-hold-person': 6,
  'm3-lightning-bolt': 6, 'm3-slow': 4, 'm3-haste': 3, 'm4-fear': 6, 'm4-ice-storm': 7,
  'm5-cone-of-cold': 6,
};

// inside tacticalSpellFor()'s returned object, alongside the other fields:
priority: PRIORITY[spellId],
```

**This is safe** because: (a) `priority` is read in exactly one place
(`chooseOffensiveCast`'s sort, `tactical.ts:1691`) with no other consumer to disturb; (b) every
existing test that touches `preparedSpellsFromDokIds`'s output (`dokSpellCrosswalk.test.ts`) asserts
membership/dice-scaling, never cast *order* — confirmed by grep, no test would need updating for the
new values themselves; (c) the isolated `combatFormation.test.ts` priority tests use their own
hand-built literals (`hold`/`mm`) unaffected by this change; (d) the party side
(`combatSpellsForMember`) also calls `tacticalSpellFor()`, so party members would transparently gain
real priorities too — harmless, since ordinary party turns are player-menu-driven, not
`chooseOffensiveCast`-driven (only a `feared`-forced-AI party turn, M80, would ever exercise this for
the party side, and that path already falls straight to `{ type: 'flee' }` before any spell pick runs).

**Test to add** (beyond this round's scratch, which was deleted): a `packages/engine` test building
FLAVIUS's real `preparedSpellsFromDokIds([34, 51], ...)` output (mirroring this round's scratch test 3
and 4 above verbatim) and asserting `aiAction().spellId === 'm3-lightning-bolt'` once the `PRIORITY`
table ships — the direct positive-control mirror of this round's own verification.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **`hasScribed()`/`getSpellbook()` gating `doMemorize()`'s selectable spell list** (M32/M51's own standing "aspirational, not implemented" note) | Re-investigated per requirement #4's expired-rejection check. Confirmed still real (`apps/web/src/ui/magic.ts:141-153`'s `buildRows()` calls `knownSpells(info.kind, level)` — the full static class list — never `hasScribed`), and confirmed via `docs/engine/BUILD-QUEUE.md:2392-2404` (M20's own phase note) that the Scribe verb was **deliberately** implemented without a scroll-source prerequisite ("a stub for learning from scrolls... for when scroll sources land"), with `spellbookStore` seeded from nothing at character creation/import (confirmed: `grep -n "spellbookStore\[" party.ts` shows no seeding site). Gating Memorize on an always-empty-at-creation book would strand every fresh/imported mage with zero castable spells forever (barring a lucky Scribe roll one spell at a time) — a genuine, larger game-design change (needs an initial-spellbook-seeding mechanic that doesn't exist), not a narrow wiring fix. M51 already correctly identified and set this aside for the same underlying reason (`m51-audit.md:363`); this round's re-check confirms the premise has NOT expired (unlike M83's `Int` case) since no round since M51 has added spellbook seeding. |
| **Wiring `priority` only for the 13 `DOK_SPELL_CROSSWALK` ids, leaving the other 7 (party-only heal/buff spells) unset** | Considered, rejected in favor of the full 20-id table above: all 20 ids already have real, decompiled COAB priority values sitting in the same source file, at no extra research cost, and 6 of the "party-only" ids (the heal spells) are irrelevant to `chooseOffensiveCast` anyway (`target !== 'enemy'`, filtered out at `tactical.ts:1690`) — completing the table costs nothing and avoids a second future round rediscovering the same gap for `m3-slow`/`m3-haste`/etc. |
| **Monster id 20 (Fear/Stinking Cloud/Magic Missile) as the primary demonstration monster** | Investigated first (real DoK monster, real crosswalked triple) but found its raw insertion order (Fear id 84, Stinking Cloud id 34, Magic Missile id 15) coincidentally already matches strictly-descending real priority (6, 5, 4) — the bug is *present* in its data (no `.priority` set) but *masked* (no observable behavior change) for this specific monster. Monster id 50/FLAVIUS was chosen instead because its raw order genuinely diverges from the correct priority order, giving a clean, unambiguous demonstration. Noted in the doc as the reason not every real caster monster exhibits an *observable* symptom even though all of them carry the same underlying data gap. |
| **A full corpus sweep of every DoK caster monster for additional observable mismatches** | Not attempted this round — one clean, dynamically-verified, real-named-monster example (FLAVIUS) is judged sufficient grounding to fix the underlying data gap (matching the evidentiary bar M28/M81 used with single-example verification), and the fix (populating all 20 real priorities) is correct regardless of how many real monsters currently exhibit an observable divergence. Flagged as a nice-to-have follow-up measurement, not a blocker. |
| **Treating this as the same finding as M81/M82/M83 (the "isolated-tested mechanism, starved of real data" family)** | Considered under requirement #1's rediscovery check — confirmed via exhaustive grep this is a fresh field/function pairing (`TacticalSpell.priority`/`tacticalSpellFor()`) never previously named in any audit doc, even though it is the SAME general shape (and, remarkably, traces to the exact same origin commit `1551717` as M81's finding) — a new instance of a recurring pattern, not a rediscovery of a previously examined instance. |

## Open questions / unknowns

- **Should `PRIORITY` live in `combatSpells.ts` (alongside `GEOMETRY`/`INFLICT`) or as a new export
  from `dokSpellCrosswalk.ts`?** Not decided this round; `combatSpells.ts` is the more natural home
  since `tacticalSpellFor()` (the single construction point for both monster and party spells) already
  lives there and already owns the two sibling per-spell-id tables.
- **Are there COAB spells this engine doesn't model at all (past `GEOMETRY`'s 20 ids) whose priority
  would matter if a future round extends the spell roster?** Not investigated — the 20-id table above
  covers everything currently castable; extending `GEOMETRY` itself is a separate, larger future task.
- **Full-corpus measurement of how many real DoK monsters exhibit an *observable* (not just latent)
  ordering divergence** — UNKNOWN precisely how many, beyond the one demonstrated (FLAVIUS/id 50);
  flagged as a nice-to-have, not required for the fix's correctness (see "Rejected alternatives").
- Standing backlog, re-confirmed untouched this round (carried forward verbatim from M83, still
  correctly parked, condensed): the rejected ECL `resume()`/`combatOutcome` lead (M83, unreachable in
  DQK's real areas 2/3 under dynamic re-check; still a real code-level gap with no known reachable
  site — this round did not attempt a fresh disassembly pass over the other walk-confirmed COMBAT areas
  5/18/22/30/35/50/66 to look for a different reachable `IF_*`-after-`COMBAT` site, per the explicit
  "do not re-pick without a genuinely different reachable site" guidance — left as a larger, unclaimed
  follow-up for a future round with budget for fresh ECL disassembly) + `hasScribed`/`getSpellbook`
  gating Memorize (re-confirmed above, needs a spellbook-seeding design decision first) +
  `TacticalCombatant`'s other five ability scores (no consumer) + `AuthoredMonster`'s Int gap (no
  caller) + `surrendered`'s distinct marker (open team-preference question) + the guarding-bar 5th
  signal + the feared/asleep colour tier + `panelRows()`/`visibleCells()`'s duplicated `impaired` check
  (DRY cleanup) + DoK's Saves column (declined M62) + BASE_ITEMS' thin catalogue + DoK's xp/hitPoints
  byte-fields + DoK's runItemPluses e2e follow-up + the Class-label collision (41+ rounds unpicked) +
  dialogue/town day-wiring + `saveStore.ts`'s `listSlots()`/`SaveSummary` +
  `DetectionMatch.series`/`.ruleset`/`.engineGen` + flat AC-10 CoK pregens + the wilderness moon-bar +
  the `DEMO_PARTY` edge case + `WILD_MENU`'s decorative bar + dual-class reactivation + the Con
  Save/Save Roll merge + `conSaveBonus` on DoK monsters (re-confirmed fully wired this round, not a
  gap) + `DexterityMods.reaction` + the `DokEffect`/`.EFF` crosswalk + CoK's missing `.STF`/`.SFX`
  crosswalk + DRYDEN's Solamnic Plate Mail gap + `create.ts`'s preview-echo gaps + the Status row's
  duration/HD-cap + `itemCategory()`'s INFLICT preview + `MonsterWizSpell.learning` + the `hasted`
  positive-buff indicator + `addToParty()`'s rejection-reason UX gap + case-folding for the name check
  + the bigger `addPlayer()`-reuse option + the missed-backstab wording/SFX/colour follow-ups +
  `createCharacter()`'s permanently-unreachable import-path warnings + the "can't escape ⇒ flee
  regardless of Int" morale gate (M81, needs movement-range comparison) + `SURPRISE`(0x23) unimplemented
  ECL opcode + the best party-strength proxy formula refinement + whether `RunChainOptions` (Gen1)
  should be widened for type-consistency (M82, confirmed inert either way). Item-instance subsystem
  still 31-for-31 blocked. ECL-ally morale% remains RETIRED (M61). `classFlags.ts`'s dual-class
  item-gating remains correctly dead. `combat.ts`/`combatStepper.ts`'s positionless engine remains dead
  code.

## Implications for our engine

- **The same origin commit can leave more than one sibling mechanism half-wired.** M81 found
  `TacticalCombatant.int` unfed by `1551717`; this round finds `TacticalSpell.priority` — a
  *different* field, in a *different* file (`combatSpells.ts` vs. `combat.ts`), unfed by the *same*
  commit, against the *same* source document (`decompile-ovr010-monster-ai.md`)'s *same* delta item
  (#3, "Add priority + save-check gating" — only the second half shipped). A single "7 decompile
  engine-gaps" commit landing a documented multi-part AI-fidelity item is worth re-auditing
  part-by-part, not just spot-checking that *a* mechanism from the list works — the isolated unit test
  proving the sort *mechanism* correctly reorders hand-built literals gave a false sense that the
  *data* side was equally complete.
- **A per-spell/per-monster fixed-value table sourced from the project's own established
  cross-generation reference (COAB) is exactly the kind of "genuinely unrecoverable? no — just never
  populated" case M82 already flagged for `partyStrength`, recurring in a totally different subsystem
  (spell AI, not the ECL VM).** The values were sitting, unused, in a file this very research document
  chain (`decompile-ovr010-monster-ai.md`) already cites by name — the gap was never "we don't know the
  numbers," it was "nobody went back to `Gbl.cs` to transcribe them into the ruleset once the mechanism
  landed."
- **Matching a real named character's real data against a real mechanism, end to end, surfaces
  masking effects a purely mechanical description misses** — monster id 20 (Fear/Stinking
  Cloud/Magic Missile) has the identical missing-priority defect as FLAVIUS but produces no observable
  symptom today, purely by coincidence of its own raw spell-id ordering. A future round auditing "is
  field X's consumer actually exercised" should check more than one real data instance before
  concluding a wired-but-unfed field is harmless — the first instance checked can accidentally look
  fine.
