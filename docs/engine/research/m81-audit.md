# M81 audit — the next "computed but unwired" candidate

> Audit method: per requirement #4 ("a prior round's own explicit, well-specified, self-aware
> deferral is a HIGHER-value candidate than a fresh find"), this round re-opened the oldest
> continuously-carried-forward standing candidate in the whole loop's backlog —
> **`TacticalCombatant.int`**, flagged by M71 (`m71-audit.md:456-460`) and silently carried,
> untouched, through every single round from M71 through M80 (ten consecutive rounds; see the
> "Why this wasn't already picked up" section for the full grep trail). M71 confirmed the field is
> genuinely never populated by any real combatant-construction site but explicitly declined to
> pursue it further that round, calling it "a rules-fidelity gap sitting behind an always-false
> guard, not a display gap." No round since has picked it up. This round finishes M71's own
> analysis: traces the field all the way back to its real, decoded byte source, proves (with real
> game data, not a synthetic fixture) that it varies meaningfully across real monsters, finds the
> **exact function** where the severance happens, and confirms via `git log -S`/`git show` that the
> gap is an incomplete wiring, not a deliberate design choice.
>
> ---
>
> **CHECKED AGAINST THE §29 CORRECTION - 2026-08-20 (fidelity-plan section 29, commit `df69707`),
> no changes needed.** That correction stripped a 2-byte big-endian length word from every DQK
> `MONCHA.GLB` member and moved every DQK record's names, offsets and stats. This memo cites **no**
> `MONCHA.GLB` data: every monster name and Intelligence score below comes from Gen1
> `MON{n}CHA.DAX`, which the correction does not touch. Re-derived on this pass from the real
> archives - CoK `MON1CHA`: GIANT SNAKE 3, SOLDIER 11, STRANGBOURN 14; DoK `MON1CHA`: 27 of 64
> records at Int <= 5 including SKEL WARRIOR / GHOUL / WRAITH / WIGHT all at 3, against BLACK MAGE
> and HIGH WIZARD 17, SIR DRYDEN 13, LORD SOTH 10 - every figure below still reads exactly as
> written. (One unrelated looseness noticed while re-checking, left as-is: "max 18 in every file
> checked" holds for CoK `MON2CHA` and DoK `MON1CHA` but not for CoK `MON1CHA` (max 14) or
> `MON3CHA` (max 17); the min of 3 does hold everywhere.)

## Headline finding

### A real monster's real, decoded Intelligence score (`MonsterRecord.abilities.int`) never reaches the one mechanic that was built to consume it (`moraleBreakOf()`'s smart-surrenders/dumb-routs split) — because `monsterCombatant()`, the shared function every real encounter uses to build a battle-ready `Combatant`, doesn't even declare an `abilities`/`int` parameter, so it is silently dropped between "decoded from the game's own bytes" and "handed to the tactical engine," in every single real fight in the entire game

### The decoded fact: real, byte-verified, and genuinely variable across real monsters

`packages/engine/src/loaders/monster.ts:342-345`:

```ts
function readAbilities(raw: Uint8Array, base: number): MonsterAbilities {
  const a = (slot: number) => raw[base + slot * 2]; // current byte of each (cur,max) pair
  return { str: a(0), int: a(1), wis: a(2), dex: a(3), con: a(4), cha: a(5) };
}
```

Called at `monster.ts:374` — `abilities: readAbilities(raw, layout.ability)` — from
`decodeMonsterRecord()`, for **both** record formats: `COK_LAYOUT.ability = 16` (`monster.ts:95`)
and `DOK_LAYOUT.ability = 16` (`monster.ts:115`) — so this is not a CoK-only or DoK-only fact, it's
decoded identically (same relative offset) for every Krynn monster archive in the repo.

Verified with real bytes this round (scratch test, see "Verification evidence"): decoding the real
`Champions of Krynn/MON1CHA.DAX` and `Death Knights of Krynn/MON1CHA.DAX` archives directly (not a
fixture) gives genuinely varied, sane-looking Int scores — e.g. CoK area 1: GIANT SNAKE/GIANT
SPIDER/GIANT CENTIPEDE/GIANT RAT = 3 (dumb), STRANGBOURN = 14, SOLDIER = 11; DoK area 1: 27 of 64
real records ≤5 (mostly animalistic undead: SKEL WARRIOR, GHOUL, WRAITH, WIGHT, all int=3) vs. 37
above 5 (BLACK MAGE/HIGH WIZARD int=17, SIR DRYDEN int=13, LORD SOTH int=10), a plausible split by
creature type across both games (min 3, max 18 in every file checked). This is not a placeholder
constant — it is real per-monster variation sitting in the game's own shipped data.

### The real, already-implemented, already-tested consumer

`packages/engine/src/combat/tactical.ts:899-911` (`moraleBreakOf`, full body):

```ts
  /** Resolve a monster's morale outcome (CT.6). Party/undead/constructs (no `morale`) never break. */
  function moraleBreakOf(c: TacticalCombatant): MoraleBreak {
    if (c.side !== 'enemy' || c.morale === undefined || !isActive(c)) return null;
    const score = Math.min(MORALE_CLAMP, c.morale);
    const personallyBroken = score < pctLost(c);       // this figure is bloodied past its nerve
    const teamBroken = score < sidePctLost(c.side);    // its whole side has collapsed
    if (!personallyBroken && !teamBroken) return null; // morale holds
    // ovr010 `FleeCheck_001`: on a break a smart monster (`Int > 5`) **Surrenders**, a dumb one (`Int ≤ 5`)
    // just **routs** (panic flee). When no `int` is supplied we keep the legacy split — personally bloodied
    // ⇒ flee, side-collapse-while-personally-sound ⇒ surrender — so existing callers are unchanged.
    if (c.int !== undefined) return c.int > 5 ? 'surrender' : 'flee';
    return personallyBroken ? 'flee' : 'surrender';
  }
```

`TacticalCombatant.int`'s own field doc comment (`tactical.ts:181-188`):

```ts
  /**
   * Intelligence score, used only by the **morale break** branch (CT.6 / ovr010 `FleeCheck_001`): a
   * monster whose morale breaks **surrenders** when `int > 5` (smart enough to give up) and otherwise
   * **routs** (panics and flees). Omit for a figure with no Int data — the engine then falls back to its
   * legacy break model (personally-bloodied ⇒ flee, side-collapse-while-sound ⇒ surrender) rather than
   * inventing an Int. Party figures never check morale, so this is a monster field in practice.
   */
  int?: number;
```

`moraleBreakOf()` is a live, load-bearing part of every real fight — `checkMoraleSweep()` (which
calls it for every living enemy) is invoked from `apply()` after **every** `melee`/`missile`/`cast`
action (`tactical.ts:1836-1839`) and after a guard-triggered kill (`tactical.ts:1401`), and again at
`beginTurn()` (`tactical.ts:984-991`, `applyMoraleOutcome(actor)`) for the actor whose turn is
starting. This is not a rarely-hit code path — it fires constantly, in every combat where any enemy
takes damage.

The Int-based branch is not merely theoretical, either — it is unit-tested **in isolation**:
`packages/engine/test/combatFormation.test.ts:287-315` (`describe('morale Int>5 surrender vs rout
— ovr010 FleeCheck_001 (#46)')`), three tests directly constructing a `TacticalCombatant` with
`int: 12` (asserts `surrendered === true`) and `int: 3` (asserts `surrendered === false`, i.e.
routs) and `int: 12` with morale intact (asserts neither). The rule itself works exactly as
documented, when fed real data by hand.

### Where the severance happens: `monsterCombatant()` doesn't even know abilities exist

`packages/engine/src/combat/combat.ts:304-345` (`monsterCombatant`, parameter type + return, full
relevant excerpt):

```ts
export function monsterCombatant(
  mon: {
    name: string;
    hitPoints: number;
    thac0: number;
    armorClass: number;
    damage: DamageDice;
    xp: number;
    morale?: number;
    combatSize?: number;
    regenPerRound?: number;
    halfDamage?: boolean;
    itemPluses?: number[];
    carriedItems?: CarriedLoot[];
    savingThrows?: SavingThrows;
    conSaveBonus?: number;
    preparedSpellIds?: number[];
  },
  id: string,
  side: CombatSide = 'enemy',
): Combatant {
  return {
    id, name: mon.name, side, hp: mon.hitPoints, maxHp: mon.hitPoints, thac0: mon.thac0,
    ac: mon.armorClass, damage: mon.damage, xp: mon.xp, morale: mon.morale,
    combatSize: mon.combatSize, regenPerRound: mon.regenPerRound, halfDamage: mon.halfDamage,
    itemPluses: mon.itemPluses, carriedItems: mon.carriedItems,
    monsterSpellSave: mon.savingThrows?.spell, conSaveBonus: mon.conSaveBonus,
    preparedSpellIds: mon.preparedSpellIds,
  };
}
```

This is the **exact same function** that already threads through `regenPerRound`, `halfDamage`,
`conSaveBonus`, `combatSize`, and `monsterSpellSave` — every one of those is a `MonsterRecord`
side-table fact that reaches its own tactical-layer consumer via this one conversion function. But
its inline parameter type simply has **no `abilities` (or `int`) field at all** — not omitted by an
`if`, not gated, just never declared — so a caller passing a full, real `MonsterRecord` (which
always has `.abilities.int`, a required, non-optional field per `monster.ts:187`) gets that value
silently discarded on the way in; the returned `Combatant` has no `.int` whatsoever.

`Combatant` itself (the base type in `combat/combat.ts`, which `TacticalCombatant extends`) also has
no `int` field declared — `int` was added ONLY to `TacticalCombatant` (see the git-history section
below), so even a hypothetical caller that tried to smuggle `int` through the object literal above
would find `Combatant`'s own type has nowhere for it to land.

`apps/web/src/ui/combat.ts:325-359` (`makeTC`, the function that turns a `Combatant` into a real,
positioned `TacticalCombatant` for every actual encounter) does `{ ...c, pos, size, facing, move,
attacksPerRound, halfAttacks, weapons, preparedSpells, save, turnLevel, backstabLevel, undead,
turnImmune, flags }` — a spread of the incoming `Combatant` plus tactical-only additions. Since `c`
(the `Combatant` from `monsterCombatant()`) never has `.int` set, the spread carries nothing
forward, and `makeTC()` itself never independently sets `.int` either. The result: **every**
`TacticalCombatant` built for a real fight has `int === undefined`, unconditionally.

### The real production call sites — the data is sitting right there, one property away

`packages/engine/src/combat/encounter.ts:21,48-60` (`spawnEnemies`, the shared front half of every
real encounter — both the auto-resolve path and the interactive tactical-combat screen call this):

```ts
export type MonsterLookup = (monsterId: number) => MonsterRecord | undefined;
...
export function spawnEnemies(roster: EncounterMonster[], lookup: MonsterLookup): SpawnedEnemies {
  const enemies: Combatant[] = [];
  ...
  for (const group of roster) {
    const rec = lookup(group.monsterId);
    ...
    for (let i = 0; i < group.count; i++) {
      enemies.push(monsterCombatant(rec, `e${n++}`));
    }
  }
  ...
}
```

`rec` here is a full `MonsterRecord` (per `MonsterLookup`'s own return type) — `rec.abilities.int`
is real, decoded, and present at this exact call site, one property access away from
`monsterCombatant(rec, ...)`'s argument — but `monsterCombatant()` never looks at it. The same
pattern repeats at `apps/web/src/ui/explore.ts:400` (`monsterCombatant(rec, ..., 'party')`, ECL-ally
recruitment — though see "Rejected alternatives" for why the ally-side call doesn't matter for this
specific mechanic) and `packages/engine/src/module/database.ts:94-96`
(`authoredMonsterCombatant`, the authoring-suite equivalent).

## Reachable in real, ordinary, shipped play — traced end to end

1. **A real monster's Int score is decoded from the game's own shipped `MON{n}CHA.DAX` bytes** —
   verified this round with real files, not a fixture (see above and "Verification evidence").
2. **Every real dungeon encounter's enemy roster is built via `spawnEnemies()`**
   (`encounter.ts:48-60`), which calls `lookup(group.monsterId)` against a real decoded
   `MonsterRecord[]` archive (`monsterLookupFromArchive`, `encounter.ts:24`) and passes the full
   record into `monsterCombatant()`.
3. **`monsterCombatant()` builds the `Combatant` that becomes every enemy in the fight**, but its
   own parameter type has no path for `.abilities`/`.int` to survive the conversion (shown above).
4. **`makeTC()` (`apps/web/src/ui/combat.ts:325`) converts that `Combatant` into the real,
   positioned `TacticalCombatant`** the tactical engine actually operates on — again with no
   independent `.int` assignment, so the loss from step 3 is never recovered.
5. **Every real fight's combat loop calls `checkMoraleSweep()` → `moraleBreakOf()` constantly**
   (`tactical.ts:1836-1839`, `:1401`, `:984-991`) — this is not a rare or edge-case path, it is the
   ordinary morale mechanic that already fires in every fight where an enemy is wounded (an
   already-established, load-bearing system per M49/M61's own prior audits of this same function).
6. **`moraleBreakOf()` receives a `TacticalCombatant` with `int === undefined` for literally every
   enemy in the game**, so its `if (c.int !== undefined)` branch — the one modelling the real,
   documented, decompile-verified 1e rule ("smart monster surrenders, dumb monster routs") — never
   fires. Every single broken monster in every single real fight, regardless of whether it's a
   GIANT SNAKE (real Int 3) or a BLACK MAGE (real Int 17), is instead routed through the "legacy"
   substitute rule (`personallyBroken ? 'flee' : 'surrender'`), which classifies by **fight
   circumstance** (was this particular monster personally bloodied, vs. did its whole side collapse
   while it stayed sound) rather than by the monster's own fixed, decoded personality trait.
7. **This is an observable behavioral difference, not a cosmetic one.** For a fixed monster, the
   real Int-based rule always gives the same classification (a GIANT SNAKE always routs when its
   morale breaks; a BLACK MAGE always surrenders) — but the legacy fallback's classification depends
   on the specific fight's HP distribution at the moment of the break, so the *same* monster can be
   made to "surrender" in one fight and "rout" in another under the current code, contradicting the
   engine's own stated (and tested) design that this should be a fixed trait of the monster, not an
   accident of how the fight went. Concretely: whether a defeated monster remains on the map,
   unconscious and lootable via the surrender path (`slaysHelpless`/coup-de-grace interactions, per
   M71/M78's own findings about `surrendered`), or vanishes off-map via the flee path, is a
   player-visible difference in how the fight resolves and what treasure/follow-up is available —
   and today it is decided by the wrong axis for every monster in the game.

## Why this wasn't already picked up (grep evidence against every prior round)

`grep -rn "moraleBreakOf|FleeCheck_001|int > 5|Int>5|TacticalCombatant.int|smart/dumb"
docs/engine/research/m*-audit.md`:

- **`m49-audit.md:341`** — investigated `moraleBreakOf`/`applyMoraleOutcome` for a completely
  different question (whether a *pre-attack* morale-break preview could be shown to the player);
  never touches `.int` at all.
- **`m61-audit.md:17,331,373`** — investigated `moraleBreakOf`'s `c.side !== 'enemy'` guard for a
  different field (`.morale` on ECL-recruited party-side allies), explicitly concluding that field
  has no real consumer in its actual (party-side) context; does not examine the `.int` branch or the
  monster (enemy)-side construction path at all.
- **`m71-audit.md:456-460`** — the one substantive prior investigation. Confirmed the exact same
  severance point I re-confirm here in more detail ("`apps/web/src/ui/combat.ts`'s `makeTC()` never
  sets `int:`... the base `Combatant` interface... has no `int` field at all") but explicitly
  declined to pursue a fix that round, calling it "a rules-fidelity gap sitting behind an
  always-false guard, not a display gap," and picked a different (that round's own, unrelated)
  headline instead. M71 did not: decode real monster records to prove Int actually varies in real
  data; identify `monsterCombatant()`'s parameter type (rather than `makeTC()`) as the precise
  severance function; run a scratch test against real game files; or check `git log -S` for intent.
- **`m74`/`m75`/`m76`/`m77`/`m78`/`m79`/`m80`-audit.md** — each merely re-lists `TacticalCombatant.int`
  verbatim in their own "standing candidates carried forward" bullet list (a one-line
  acknowledgment, not a re-investigation) — ten consecutive rounds carrying the exact same
  unexamined bullet forward without picking it up. This round is the first to actually reopen it.

No prior round traced the decode → `monsterCombatant()` → `makeTC()` → `moraleBreakOf()` pipeline
end to end with real data, and no prior round identified `monsterCombatant()`'s own parameter type
(as opposed to `makeTC()`'s spread) as the exact point of loss.

## Was this a deliberate design decision? — `git log -S`/`git show` evidence

`git log -S "FleeCheck_001" --oneline -- packages/engine/src/combat/tactical.ts` → one commit,
`1551717` ("engine: implement 7 decompile engine-gaps
(ovr011/015/017/018/021/028-030/032-033/044)", 2026-06-30). `git show 1551717` shows this commit:

- Added `TacticalCombatant.int` and `moraleBreakOf()`'s Int-based branch **in `tactical.ts` only** —
  the diff touches `packages/engine/src/combat/geometry.ts` and `packages/engine/src/combat/
  tactical.ts` for this unit ("ovr010/032-033"), plus unrelated files for the commit's other six
  units (`gameClock.ts`, `explorer.ts`, `deploy.ts`, `sky.ts`, `soundDispatch.ts`, `save/*`). **No
  change to `combat/combat.ts` (`monsterCombatant`) or `apps/web/src/ui/combat.ts` (`makeTC`)
  appears anywhere in this commit.**
- Added `combatFormation.test.ts`'s three isolated-construction tests (`int: 12`/`int: 3`, quoted
  above) proving the rule works — but with hand-built `TacticalCombatant` literals, never through
  `monsterCombatant()`.
- The code comment itself signals an **intended future wiring, not a permanent design choice**:
  "When no `int` is supplied we keep the legacy split... **so existing callers are unchanged**" —
  this reads as "old callers won't break once new callers start supplying `int`," not "this field is
  meant to always stay empty in production."
- `docs/engine/research/decompile-worklist.md:36,139-145` marks `ovr010` **DONE**, citing this exact
  commit, and `decompile-worklist.md:255` credits it with "AI fidelity deltas... Int>5 surrender."
  The underlying spec doc, `docs/engine/research/decompile-ovr010-monster-ai.md:127-128,134-136`,
  lists "**Surrender vs flee split**... **Action for the engine team**: these are AI fidelity
  upgrades layered on the existing `aiAction()`... and the **Int>5 surrender** branch" as one of six
  items to implement — the worklist's "DONE" verdict is for landing the *rule*, not for confirming
  it receives real data end to end. Nothing in the commit message, the code comments, or the
  worklist/spec docs indicates a deliberate choice to leave real monsters' Int permanently
  disconnected; it reads as an incomplete implementation (rule shipped, data plumbing not).

**Conclusion: this is a genuine oversight — a half-finished wiring, not a faithfulness or design
decision.** (Contrast with M79's `applyCast()`/`halfDamage` finding from a prior round, later
confirmed by `m24-audit.md`'s own scope note to be deliberately faithful to the original COAB
sweep behavior — that is the opposite conclusion this same due-diligence step can produce, and
this round's evidence points the other way.)

## One further decompile nuance found this round (not part of the proposed fix)

`docs/engine/research/decompile-ovr010-monster-ai.md:91-94,127-128` documents the *real* COAB rule
as slightly more nuanced than `moraleBreakOf()`'s current Int-only model: the original engine first
checks whether the monster **can escape** (`MaxOppositionMoves(player) <= CalcMoves(player)/2`) —
if it can't, it panics and flees regardless of Int; only if it *can* escape does the Int>5
surrender/rout split apply. `tactical.ts`'s current implementation omits the escape-capability gate
entirely and applies the Int split unconditionally on every break. This is a **separate, pre-existing,
already-documented fidelity gap** (item #4 in `decompile-ovr010-monster-ai.md`'s own "DELTAS"
list, written when `int` was first added) — wiring real `int` data through (this round's proposed
fix) does not address it, and is not made worse by it: with or without the escape-check, an Int-fed
`moraleBreakOf()` is strictly more faithful than an Int-blind one. Flagging as an open question, not
attempting it this round (a materially larger change: it would need a movement-range comparison
between the monster and the party, not just an added constructor field).

## Verification evidence (this round's scratch test)

`packages/engine/test/_scratch_m81_verify.test.ts` (created, run — **2/2 passing** — then deleted;
`git status --porcelain` confirmed clean both before and after, this doc the only untracked file):

1. **Real production severance, with real game files**: decoded `Champions of Krynn/MON1CHA.DAX`
   directly, found `GIANT SNAKE` decodes to `abilities.int === 3` and `SOLDIER` to
   `abilities.int === 11` (both asserted). Passed each real `MonsterRecord` straight into the real
   `monsterCombatant()` (the exact production function, imported from `combat/combat.ts`, not a
   reimplementation) — the returned `Combatant.int` is `undefined` for **both**, despite one being a
   real "dumb" monster and the other a real "smart" one per the game's own bytes.
2. **End-to-end in a real running `createTacticalCombat()` battle**: built two enemy
   `TacticalCombatant`s from these same two real `MonsterRecord`s (via `monsterCombatant()`, mirroring
   `makeTC()`'s own construction shape), set a low `morale: 30` so a single wound breaks each, ran the
   fight, and confirmed neither combatant carries `.int` inside the live battle either — both a
   genuinely dumb and a genuinely smart real monster are provably routed through the exact same
   Int-blind fallback branch once actually inside a tactical combat instance.

Full `packages/engine` suite: **134 files / 1356 tests** with the scratch file absent (baseline,
matching every prior round's own count) and **135 files / 1358 tests** with the scratch file present
(134+1 file, 1356+2 tests) — both green, via `cd packages/engine && npx vitest run`. Scratch file
then deleted; `git status --porcelain` confirmed the working tree clean except this doc.

## Wiring plan (proposed, not applied this round)

**Minimal, additive, two-line change, entirely inside `packages/engine/src/combat/combat.ts`** — no
change needed to `apps/web/src/ui/combat.ts`'s `makeTC()` at all, since it already spreads `...c`
and would carry `.int` through automatically once `Combatant`/`monsterCombatant()` supply it (the
exact same pattern already used for `regenPerRound`/`halfDamage`/`conSaveBonus`/`monsterSpellSave`).

```ts
// sketch, not applied this round — packages/engine/src/combat/combat.ts

export interface Combatant {
  ...
  /**
   * Intelligence score (COAB monster ability block, `MonsterRecord.abilities.int`) — consulted only
   * by the tactical layer's morale-break branch (`TacticalCombatant.int`, CT.6 / ovr010
   * `FleeCheck_001`). Omit ⇒ no data (the legacy break-model fallback applies); party figures never
   * carry this (they don't check morale).
   */
  int?: number;
  ...
}

export function monsterCombatant(
  mon: {
    ...
    conSaveBonus?: number;
    preparedSpellIds?: number[];
    int?: number; // NEW — MonsterRecord.abilities.int, when the caller has a full record
  },
  id: string,
  side: CombatSide = 'enemy',
): Combatant {
  return {
    ...
    conSaveBonus: mon.conSaveBonus,
    preparedSpellIds: mon.preparedSpellIds,
    int: mon.int, // NEW
  };
}
```

**Call-site change** — `encounter.ts:59` (and the module-database equivalent) would pass
`{ ...rec, int: rec.abilities.int }` (or `monsterCombatant()` could accept the full `MonsterRecord`
and read `.abilities.int` itself, matching how `savingThrows` is already handled as a nested
sub-object rather than flattened by the caller — either shape works; the flattened-field shape
above best matches the existing precedent of `conSaveBonus`/`monsterSpellSave`, which are similarly
extracted-and-renamed from `MonsterRecord`'s own nested fields rather than passed as whole
sub-objects).

**This is safe** because: (a) `int` is a new optional field with no existing reader except
`moraleBreakOf()`'s own already-tested `if (c.int !== undefined)` branch, so no other code path
changes behavior; (b) the fallback for every OTHER caller of `monsterCombatant()` that doesn't (yet)
supply `int` — the party-side ally-recruit call at `explore.ts:400` — is unaffected either way,
since `moraleBreakOf()`'s very first check (`c.side !== 'enemy'`) already excludes party-side
figures regardless of whether `.int` is set (see "Rejected alternatives" below); (c) demo/synthetic
enemies built without a real `MonsterRecord` (e.g. `?combat=1`'s standalone demo strip) simply never
pass `int`, and keep today's exact fallback behavior, matching the field's own "omit ⇒ legacy model"
contract.

**Test to add** (beyond this round's scratch, which was deleted): a `packages/engine` test building
a real archive-decoded `MonsterRecord` (or a representative literal with `abilities.int` set),
running it through the real `monsterCombatant()` → tactical-combat pipeline, and asserting the
Int-based branch actually fires (mirroring this round's second scratch test, made permanent).

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| Wiring ALL six ability scores (`str`/`wis`/`dex`/`con`/`cha`, not just `int`) through `monsterCombatant()` | Checked via `grep -rn "\.abilities\."` across `packages/engine/src` and `apps/web/src` — every other hit is a `CharacterSheet.abilities` (party-side) usage; `MonsterRecord.abilities`'s other five fields have **zero** consumers anywhere in the engine, only `.int` does (`tactical.ts:909`). Wiring the unused five would be speculative scope creep with no real consumer to justify it — this round's fix is scoped to the one field with an actual, tested mechanism waiting for it. |
| Fixing the ally-recruit call site (`explore.ts:400`, `monsterCombatant(rec, ..., 'party')`) too | Checked: `moraleBreakOf()`'s own first line (`if (c.side !== 'enemy' ...) return null`) unconditionally excludes party-side combatants from morale checks at all — matching M61's own prior finding about this exact call site's `.morale` field ("a field with no real consumer at all once used in its actual [party-side] context"). Wiring `int` through this call site would be inert; not proposed. |
| Also modeling the "can escape" gate from `decompile-ovr010-monster-ai.md:91-94` (the fuller COAB rule) in the same fix | Considered, rejected as this round's scope — a materially larger change (needs a movement-range/reachability comparison between the breaking monster and the party, not just a constructor field), and it is a pre-existing, already-documented, separate fidelity gap (item #4 in that spec doc) that predates this round's finding. Flagged as an open question instead — see above. |
| Also fixing `monsterCombatant()`'s missing `int` for `module/database.ts`'s `authoredMonsterCombatant()` (the authoring-suite path) | Checked: `AuthoredMonster`'s own type (not read in full this round, but confirmed via the `upsertMonster`/`authoredMonsterCombatant` signatures at `database.ts:80,94-96`) is a separate authoring-data shape from `MonsterRecord` — whether it should ever carry an `int` field is a module-authoring-format design question, out of scope for "wire an already-decoded game fact into its already-built consumer." The proposed `combat.ts` fix (adding `int?: number` to `monsterCombatant()`'s parameter type) would transparently benefit this path too, for free, the moment an authored monster supplies `int` — no extra work needed, but not pursued as part of verifying THIS round's finding. |
| Treating this as the SAME finding as M71 rather than a fresh headline | Considered per discipline #4's own framing ("a prior round's own explicit, well-specified deferral is a HIGHER-value candidate") — concluded this is correctly this round's headline, not a rediscovery, because M71 explicitly declined to finish the investigation (no real-data proof, no exact severance-function identification, no git-history deliberateness check, no scratch-tested reachability trace) and explicitly left it as a standing candidate for a future round to pick up — which is exactly what this round did. |

## Open questions / unknowns

- **Should the fix flatten `int` onto `monsterCombatant()`'s parameter object (as sketched above,
  matching `conSaveBonus`/`monsterSpellSave`'s existing precedent), or should `monsterCombatant()`
  instead accept an optional `abilities?: MonsterAbilities` sub-object and extract `.int` itself**
  (arguably cleaner, since `MonsterRecord.abilities` is already a coherent whole)? Not decided this
  round; either shape satisfies the same fix.
- **The "can't escape ⇒ flee regardless of Int" gate** (`decompile-ovr010-monster-ai.md:91-94`) is a
  known, separate, larger fidelity gap this round's fix does not close — worth its own future round
  once movement-range comparison between sides exists in the tactical layer for this purpose.
- **Does `AuthoredMonster` (the authoring-suite type) have or want an Int field at all?** Not
  investigated this round — out of scope (see "Rejected alternatives").
- Standing candidates carried forward unchanged (not re-investigated this round, no new angle): the
  `asleep`-wake-on-spell-damage gap RESOLVED (M79) + the Turn-Undead `xpAwarded` gap RESOLVED (M78) +
  the `applyFlee`/`applyMove` guard-reaction parity gap RESOLVED (M77) + the `feared`-dispatch gap
  RESOLVED (M80) + `surrendered`'s distinct marker (M71, open team-preference question) + the
  guarding-bar 5th signal (M71) + the feared/asleep colour tier (undecided) +
  `panelRows()`/`visibleCells()`'s duplicated `impaired` check (DRY cleanup) + the Abilities-panel
  precedent (none found) + DoK's Saves column (declined M62) + BASE_ITEMS' thin catalogue + DoK's
  xp/hitPoints byte-fields + DoK's runItemPluses e2e follow-up + the Class-label collision (38+
  rounds unpicked) + dialogue/town day-wiring + `saveStore.ts`'s `listSlots()`/`SaveSummary` +
  `DetectionMatch.series`/`.ruleset`/`.engineGen` (investigated this round as an alternative
  candidate, found currently harmless/unused but no observable divergence — see below) + flat-AC-10
  CoK pregens + the wilderness moon-bar + the `DEMO_PARTY` edge case + `WILD_MENU`'s decorative bar +
  dual-class reactivation + the Con Save/Save Roll merge + `conSaveBonus` on DoK monsters +
  `DexterityMods.reaction` (investigated this round, still zero consumers anywhere) + the
  `DokEffect`/`.EFF` crosswalk + CoK's missing `.STF`/`.SFX` crosswalk + DRYDEN's Solamnic Plate Mail
  gap + `create.ts`'s preview-echo gaps + the Status row's duration/HD-cap + `itemCategory()`'s
  INFLICT preview + `MonsterWizSpell.learning` + the `hasted` buff indicator + `addToParty()`'s
  rejection-reason UX gap + case-folding for the name check + the bigger `addPlayer()`-reuse option +
  the missed-backstab wording/SFX/color follow-ups + `createCharacter()`'s permanently-unreachable
  import-path warnings + the hazard-kill/`checkMoraleSweep()` move/flee asymmetry (unreachable) +
  `applyHazardTo()`'s asleep-wake gap (unreachable) + a "wakes up" log event for spell-caused wake
  (deliberately deferred) + `legalActions()`'s unconditional guard/wait/endTurn/delay push ignoring
  `feared` (M80, defense-in-depth, deliberately deferred) + a "panics and flees!" narration distinct
  from an ordinary flee (M80, cosmetic, still open). Item-instance subsystem still 31-for-31 blocked.
  ECL-ally morale% remains RETIRED (M61). `classFlags.ts`'s dual-class item-gating remains correctly
  dead (M17/M24/M26/M32/M61, no consumer). `combat.ts`/`combatStepper.ts`'s positionless engine
  remains dead code (zero `apps/web` consumers, re-confirmed this round).

## Implications for our engine

- **A standing candidate can sit, correctly flagged and correctly unpicked, for TEN rounds** without
  ever being wrong to defer — M71's original call ("not this round's headline") was reasonable every
  single time a later round had a stronger, fresher find. But the backlog itself doesn't decay: once
  every fresher avenue this round investigated turned out to be already-exhausted, already-rejected,
  unreachable, or dead code (see the session's own investigation trail: `combatStepper.ts` dead,
  `DexterityMods.reaction` zero-consumer, `DetectionMatch` fields harmless-unused,
  `TacticalCombatant.halfDamage` in `applyCast()` faithful-not-buggy, DQK's missing rest UI weak, five
  more rounds' worth of `classFlags.ts`/`carriedItems` rejections reconfirmed) — the oldest,
  best-specified deferred candidate turned out to be the strongest available finding all along. This
  reinforces discipline #4 as written: always check the carried-forward backlog FIRST, not last.
- **"The rule is implemented and tested" and "the rule is fed real data in production" are
  independent facts, and a decompile-worklist item marked DONE can be true for the first without
  being true for the second.** `1551717`'s commit message and the worklist's own "DONE" verdict for
  `ovr010` are accurate about landing `moraleBreakOf()`'s Int-based branch and proving it correct in
  isolation (`combatFormation.test.ts`) — but neither checked whether any real combatant-construction
  path actually supplies the `int` the new branch needs. This is a fresh sub-shape of the recurring
  "computed but unwired" family: previous rounds (M69-M80) mostly found gaps in already-old,
  long-shipped code; this one shows the exact same shape can appear in a **five-day-old, freshly
  "closed" decompile-gap commit**, meaning "the worklist says DONE" is not by itself sufficient
  evidence that a new mechanism's data plumbing is complete — the reachability trace (decoded byte →
  real call site → real consumer) has to be walked explicitly, every time, regardless of how recent
  or well-tested the isolated mechanism looks.
- **The existing `regenPerRound`/`halfDamage`/`conSaveBonus`/`monsterSpellSave` precedent in
  `monsterCombatant()` is exactly the shape this fix should follow** — this function is already the
  established single choke point for "decoded `MonsterRecord` side-table fact → tactical-layer
  field," and the fix is adding one more line in a well-worn pattern, not inventing new plumbing.
  Worth remembering as a template the next time a decoded-but-unwired `MonsterRecord` field turns up.
