# M89 audit — a knocked-out (not dead) party member can never heal via Encamp → Rest

> Audit method: read `docs/engine/research/m88-audit.md` in full first (mandatory first step), then
> worked the M89 brief's carried-forward backlog in priority order before any fresh sweep, per the
> brief's own instruction:
>
> 1. **Multi-class HP averaging** — investigated properly this round (not just re-grepped): read
>    `packages/engine/src/ruleset/addnd1e/recalc.ts` in full (the COAB `ReclacClassBonuses` multiclass
>    compositor M87/M88 never actually opened). It composes THAC0 (best-of-all-classes) and hit-dice
>    *level* (max-of-all-classes) for a multiclass character, but it has **no HP-averaging function at
>    all** — hit-dice *level* (for attack-matrix purposes) is a different quantity from *HP per level*
>    (which the CoK manual says is "averaged across the classes,"
>    `docs/engine/research/cok-dragonlance-rules.md:161`). There is no already-modelled averaging
>    function for `trainMember()`/`sheetFromDokSaved()` to call instead of their single-class shortcut —
>    building one would be new ruleset logic (bigger, riskier), not a wiring fix. **Confirmed correctly
>    out of scope**, with a firmer answer than M87/M88's "not investigated yet."
> 2. **`neacailRejected`-pattern / "does an uncorrectable rejection case still exist"** — traced
>    `sheetFromDokSaved()`'s full `createCharacter()` validation surface post-M86: abilities are now
>    always clamped (`clampToRace`), level is clamped to ≤8 (`MAX_INFERRED_LEVEL`, under every candidate
>    class's human cap), class is always one of 4 human-legal classes, deity is always set for clerics.
>    **`result.rejectedInvalid` is therefore now dead code for every real save** — `sheetFromDokSaved`
>    cannot return `null` any more. Answers the standing question directly: no, there is no other
>    genuinely-uncorrectable rejection case in this importer today; nothing to assert. Not an actionable
>    fix (no consumer to wire), so not picked up as this round's headline.
> 3. **DQK/DoK destination-race hardcode** — re-grepped `savedCharacter.ts`/`dokSavedCharacter.ts`: still
>    zero decode sites, comments only. Reconfirmed UNKNOWN, unchanged.
> 4. **`multiclassLevel`** — reconfirmed exactly one grep hit (`importParty.ts:236`, a comment). Still a
>    dead field.
> 5. **`canReachWithHeight`** — reconfirmed zero callers outside its own definition/tests.
> 6. **Long tail** (`DexterityMods.reaction`, `Class`-label collision, `DokEffect`/`.EFF` crosswalk,
>    DRYDEN's Solamnic Plate Mail, `carriedItems` formatting) — each re-checked with a fresh angle this
>    round (see "Rejected alternatives"); none is both live and cleanly fixable without new RE or new
>    display machinery.
> 7. **`render/sky.ts` never reaching `dqkExplore.ts`** (flagged by M85, re-confirmed-but-declined by
>    M86, silent since) — investigated properly this round: `dqkExplore.ts` has **no first-person
>    viewport at all** (its own file doc: "the party walks the real grid... on the top-down automap");
>    it never imports `renderFirstPersonView*`/`selectSkyColour`/`wallPose` at all. Wiring a sky backdrop
>    would require building DQK's entire missing first-person renderer first — a whole subsystem, not a
>    wiring fix (matches M63's already-established "too large for one slice" precedent). Upgrades this
>    standing candidate from "deferred, not re-argued" to "confirmed genuinely out of scope," not just
>    postponed again.
>
> None of the backlog was live. Fresh sweep found this round's finding while investigating item 1
> (multi-class HP) led into `packages/engine/src/town/services.ts`'s sibling economy functions, which
> led to `apps/web/src/ui/town.ts`'s Temple screen, which led to the real Encamp → Rest path — a
> genuinely new area for this loop (grepped all 88 prior audit docs for `advanceRestHealing`,
> `restPartyTicks`, `restPartyNatural`, `restParty` — **zero hits**, confirmed fresh).

## Headline finding

**A party member reduced to 0 HP but *not* permanently slain (an `unconscious` figure, per CT.7h's own
`dmg ≥ hp+10` overkill rule) can never recover via Encamp → Rest, no matter how many in-game days pass —
even though this project's own decompile research explicitly documents that an unconscious figure
"revives on rest / a cure" (`docs/engine/research/disasm-spells-krynn.md:917`), and even though the
*exact* correct dead-vs-unconscious policy already exists, fully implemented, in a sibling function that
has never been called from anywhere in the shipped UI.** The real, live "Encamp → Rest" path instead
treats *any* member at hp ≤ 0 as unhealable — indistinguishable from a genuine corpse — leaving a
knocked-out hero permanently stuck at 0 HP unless the party can afford the Temple's steep, level-scaled
Raise Dead fee (`raiseCost`, base 750 + 250/level) or happens to have a `revive`-kind spell memorized.

## The real, established fact and its existing, shipped-but-unused correct sibling

CT.7h (`1421bd6cf`, 2026-06-23, "post-battle bring-up — dead-vs-unconscious carry-over to the roster")
established the distinction this project's own decompile research documents
(`docs/engine/research/disasm-spells-krynn.md:913-953`, §22, byte-located strings `Raise Dead`/
`is not dead`/`cannot be raised` in `START.EXE`):

> "a figure **slain** by the gen1 `dmg ≥ hp+10` overkill rule... is **dead** and needs a temple **Raise
> Dead**; a figure merely brought to **0 HP** is **unconscious** and **revives on rest / a cure**."

`apps/web/src/ui/party.ts`'s `PartyMemberStatus` (lines 395-412) carries exactly this distinction on
every roster member: `down` ("at/below 0 HP — fallen this fight (unconscious OR dead)") and `dead`
("permanently slain... always implies `down`; a `down && !dead` member is merely unconscious and
**revives on rest/heal**" — the type's own doc comment, line 407). The `dead` flag is real and
already-consumed elsewhere: `mainMenu.ts`'s roster colouring (`m.dead ? C_RED : m.down ? C_YELLOW :
C_GREEN`, documented by M42) and the Temple's Raise-eligibility gate both read it.

**The exact correct "who heals on rest" policy is already written**, in `party.ts:1126-1140`
(`restParty()`, current source, full):

```ts
/**
 * Full rest: restore every member to maximum HP (simplified — no per-spell/turn memorisation yet).
 * The **permadead** are left untouched (CT.7h) — only a Raise Dead brings them back, never bed rest.
 */
export function restParty(): void {
  let changed = false;
  for (const s of roster) {
    if (deadStore.has(s.name)) continue;      // <-- only TRUE permadeath is excluded
    if (s.hp !== s.maxHp) {
      s.hp = s.maxHp;
      changed = true;
    }
  }
  if (changed) persist();
}
```

`git log -S "deadStore.has(s.name)) continue" --oneline -- apps/web/src/ui/party.ts` → **one hit**,
`1421bd6` (CT.7h itself) — this is the commit that made `restParty()` correct. But `restParty()` has
**zero callers anywhere in the repo**: `grep -rn "restParty()" apps/web/src apps/web/test
packages/engine/src packages/engine/test` (excluding its own `function restParty` line) → **zero hits**.
It has never been wired to any UI action.

## Where the severance happens: the REAL, live Encamp → Rest path never adopted CT.7h's fix

There are, in fact, **three** structurally-parallel "heal the party by resting" functions in this
codebase — only the one above (unused) is correct:

| Function | File | Skip condition | Live? |
|---|---|---|---|
| `restParty()` | `party.ts:1130` | `deadStore.has(name)` (true dead only) — **correct** | **No callers anywhere** |
| `restPartyNatural()` / `planRest()` | `party.ts:1149` / `world/rest.ts:72` | `hp <= 0` (dead *or* unconscious) — **wrong** | **No callers anywhere** (was live before `c67a98d`, superseded) |
| `restPartyTicks()` / `advanceRestHealing()` | `party.ts:222` / `world/gameClock.ts:327` | `hp <= 0` (dead *or* unconscious) — **wrong** | **THE live path** — the only one `explore.ts`'s Encamp → Rest actually calls |

`packages/engine/src/world/gameClock.ts:315-339` (`RestHealable`/`advanceRestHealing`, current source,
full):

```ts
/** A member the rest-healer can touch. */
export interface RestHealable {
  hp: number;
  maxHp: number;
}

/**
 * Advance natural rest healing by `ticks` rest ticks. Every {@link REST_TICKS_PER_HEAL}
 * ticks each *living* member (hp > 0) gains +1 HP (capped at maxHp); dead members are
 * skipped. `carry` is the leftover tick count from the previous call (so healing is
 * continuous across calls). Pure: returns new HP values and the new carry.
 */
export function advanceRestHealing<T extends RestHealable>(
  party: readonly T[],
  ticks: number,
  carry = 0,
): { party: T[]; carry: number; heals: number } {
  const total = Math.max(0, Math.floor(ticks)) + Math.max(0, Math.floor(carry));
  const heals = Math.floor(total / REST_TICKS_PER_HEAL);
  const newCarry = total - heals * REST_TICKS_PER_HEAL;
  const out = party.map((m) => {
    if (heals === 0 || m.hp <= 0) return { ...m };   // <-- conflates unconscious with dead
    return { ...m, hp: Math.min(m.maxHp, m.hp + heals) };
  });
  return { party: out, carry: newCarry, heals };
}
```

Its own doc comment ("each *living* member (hp > 0)... dead members are skipped") bakes in exactly the
pre-CT.7h conflation the decompile research and `restParty()`'s own fix both reject: hp ≤ 0 does **not**
mean dead.

`apps/web/src/ui/party.ts:222-242` (`restPartyTicks`, the caller `explore.ts` actually uses) passes raw
`{hp, maxHp}` straight through with no `dead`/`down` distinction at all:

```ts
export function restPartyTicks(ticksNeeded: number): { totalHealed: number; heals: number } {
  const res = advanceRestHealing(
    roster.map((s) => ({ hp: s.hp, maxHp: s.maxHp })),   // <-- no dead flag threaded through
    ticksNeeded,
    restCarry,
  );
  ...
```

**A second, compounding severance in the same feature**: `apps/web/src/ui/explore.ts:708-734`
(`restAndRefresh`, the actual Encamp → Rest handler) sizes *how long* to rest from a filter that
**also** excludes unconscious members, so even if `advanceRestHealing` were fixed alone, an unconscious
member as the party's *only* casualty would still never get healed:

```ts
// explore.ts:719-734, current source
} else {
  const living = partyStatus().filter((s) => !s.dead && s.hp > 0);   // <-- excludes hp<=0 (unconscious too)
  const maxMissing = living.reduce((m, s) => Math.max(m, s.maxHp - s.hp), 0);
  ticksNeeded = maxMissing * REST_TICKS_PER_HEAL;
}
// Nobody wounded and no fixed span → no time passes (preserve the original early-out).
if (ticksNeeded <= 0) {
  setStatus('The party is already well rested — no time passes.');
  pushMessage('You make camp, but everyone is already at full health.');
  return;
}
```

If the *only* casualty in the party is an unconscious (not dead) member, `living` is empty, `maxMissing`
is `0`, and the game tells the player **"The party is already well rested — no time passes"** — while a
real party member sits at 0 HP.

## Self-flagging evidence — the engine's own golden test already asserts the wrong invariant, in words

`packages/engine/test/gameClockCalendar.test.ts:130-138` (current source, unchanged since its origin):

```ts
const party = [
  { hp: 10, maxHp: 44 },
  { hp: 0, maxHp: 30 }, // dead — never heals
  { hp: 30, maxHp: 30 }, // already full
];
const r = advanceRestHealing(party, REST_TICKS_PER_HEAL * 3);
expect(r.heals).toBe(3);
expect(r.party.map((m) => m.hp)).toEqual([13, 0, 30]);
```

The test's own inline comment calls a bare `{hp: 0, maxHp: 30}` object **"dead"** — with no `dead` field
anywhere on the type to actually say so. This is the same shape M87 found in `levelHpGain()`'s doc
comment: the exact wrong assumption is written down in plain English right next to the code that
encodes it, and has stood, unquestioned, since the function was created (`1551717`, "engine: implement
7 decompile engine-gaps") — one week *after* CT.7h (`1421bd6`) had already established, correctly, that
hp ≤ 0 does not mean dead.

## Reachable in real, ordinary, shipped play — static + dynamic proof

**Static reachability, the full real chain:** `apps/web/src/ui/combat.ts:737` (`finalize()`) calls
`applyCombatHp(state.combatants, (id) => combat.conditionOf(id))` on every real, shipped tactical fight —
`conditionOf` is the CT.7h seam, golden-tested for the real `'ok'|'unconscious'|'dead'` split
(`packages/engine/test/tactical.test.ts:1298-1386`, 5 cases, cited by M42). Any real CoK/DoK fight that
drops a party member to exactly 0 (or negative-but-under-the-`+10`-overkill-threshold) HP marks them
`down: true, dead: false` on the roster via `applyCombatHp` (`party.ts:475-497`) — an entirely ordinary
combat outcome, not an edge case. The player's *only* UI path to recover HP afterward is Encamp → Rest
(`explore.ts`'s `'Rest'` verb, `activateEncamp()` line 1001-1002 → `restAndRefresh()`), which — per the
trace above — cannot heal that member: `restAndRefresh` → `restPartyTicks` → `advanceRestHealing`, all
three of which treat hp ≤ 0 as permanently unhealable. `grep -rn "restPartyTicks(" apps/web/src` →
`explore.ts:737` is the **only** call site in the whole app; there is no other, un-broken path.

**Dynamic re-derivation this round** (scratch vitest file, created, run, then deleted — see below),
against the real, current, unmodified `advanceRestHealing` production function:

```ts
const party = [
  { hp: 0, maxHp: 40 },  // a real "unconscious, not dead" shape (no dead/down field exists on this type)
  { hp: 20, maxHp: 40 }, // an ordinary wounded, conscious member, for contrast
];
const r = advanceRestHealing(party, REST_TICKS_PER_HEAL * 1000); // 1000 game-days' worth of rest ticks
r.heals === 1000;        // true
r.party[1].hp === 40;    // true -- the wounded-but-conscious member fully heals
r.party[0].hp === 0;     // true -- the unconscious member is UNCHANGED after 1000 days of rest
```

Even an absurd 1000 in-game days of continuous rest never moves the unconscious member's HP by a single
point — the mechanism is not merely slow, it is **structurally incapable** of ever reviving them. The
only two working recoveries left are `templeRaiseFirstDead()` (level-scaled Raise Dead pricing, correct
only for a *true* corpse) or a `revive`-kind spell (`magic.ts:296-299`, `reviveMember`/`firstDeadName`),
if the party happens to have one memorized.

## Verification evidence (this round's scratch test)

`packages/engine/test/_scratch_m89_verify.test.ts` (created, run — **1/1 passing**, output matches the
snippet above exactly — then deleted). Full engine suite re-run with the scratch file present: **135
files / 1360 tests, all green** (`cd packages/engine && npx vitest run`). Scratch file then deleted; a
follow-up `git status --porcelain` showed a clean tree except this doc.

## Proposed minimal wiring plan (not applied this round)

Three small, additive edits along the natural layering (engine primitive → web accumulator → web
sizing) — none removes existing behaviour, all just widen "who gets excluded" from *any hp ≤ 0* down to
*truly permadead only*:

```ts
// sketch, not applied this round -- packages/engine/src/world/gameClock.ts

/** A member the rest-healer can touch. `dead` opts a member out of natural healing entirely (CT.7h
 *  permadeath, `dmg >= hp+10` -- NOT merely unconscious); omit/false for everyone else, including a
 *  member currently at 0 HP but merely unconscious, who DOES heal on rest per the original engine
 *  (disasm-spells-krynn.md §22: "a figure merely brought to 0 HP is unconscious and revives on rest
 *  / a cure"). */
export interface RestHealable {
  hp: number;
  maxHp: number;
  dead?: boolean;
}

export function advanceRestHealing<T extends RestHealable>(
  party: readonly T[],
  ticks: number,
  carry = 0,
): { party: T[]; carry: number; heals: number } {
  const total = Math.max(0, Math.floor(ticks)) + Math.max(0, Math.floor(carry));
  const heals = Math.floor(total / REST_TICKS_PER_HEAL);
  const newCarry = total - heals * REST_TICKS_PER_HEAL;
  const out = party.map((m) => {
    if (heals === 0 || m.dead) return { ...m };   // was: m.hp <= 0
    return { ...m, hp: Math.min(m.maxHp, m.hp + heals) };
  });
  return { party: out, carry: newCarry, heals };
}
```

```ts
// sketch, not applied this round -- apps/web/src/ui/party.ts, inside restPartyTicks()
const res = advanceRestHealing(
  roster.map((s) => ({ hp: s.hp, maxHp: s.maxHp, dead: deadStore.has(s.name) })), // was: no dead field
  ticksNeeded,
  restCarry,
);
```

```ts
// sketch, not applied this round -- apps/web/src/ui/explore.ts, inside restAndRefresh()
const living = partyStatus().filter((s) => !s.dead);  // was: !s.dead && s.hp > 0
```

Notes on the sketch:
- `deadStore` is already a module-private variable in `party.ts`, already read the identical way by
  `restParty()`/`templeRaiseFirstDead()`/`healMember()` in the same file — no new export or plumbing.
- `partyStatus()`'s `s.dead` field already exists and is already imported/read by `explore.ts` (it is
  literally the adjacent clause on the same filter line) — the fix *drops* a clause, it doesn't add one.
- `dead?: boolean` defaulting to `undefined`/falsy on `RestHealable` is backward-compatible: the only
  production caller (`restPartyTicks`) is updated in the same slice; the test file's own three-member
  array (`gameClockCalendar.test.ts:130-138`) needs its `{hp: 0, maxHp: 30}` case updated to `{hp: 0,
  maxHp: 30, dead: true}` to keep asserting the *true*-permadeath-never-heals case, mirroring the "the
  wrong policy was itself asserted by a test" repair pattern M86 established for `neacailRejected` — a
  deliberate, visible test rewrite, not a silent patch — plus a new case demonstrating an unconscious
  (`dead: false`/omitted) member now healing, as the fix's own positive regression guard.
- `restPartyNatural()`/`planRest()` (the *other* dead sibling, also wrong) is not touched by this
  sketch — it has zero callers, so fixing it changes no observable behaviour this round; flagged below
  as a secondary cleanup candidate, not folded in to keep the diff minimal (mirrors M85's own precedent
  of not bundling a second, same-root-cause fix into one slice).
- No e2e assertion needs to be flipped: the existing `runExplore`/rest-related e2e blocks
  (`apps/web/test/e2e.mjs:489-514` etc.) exercise ordinary wounded-but-conscious healing, never an
  unconscious member specifically — a new e2e case (knock a party member to exactly 0 HP via a seeded
  fight, then rest and assert their HP actually rises above 0) would be the natural regression guard for
  the implementation round to add, mirroring the pattern `runTown`'s Sturm fixture already uses.

## Secondary observations not part of this round's fix

- **The Temple's cheap "Heal the party" option has the identical exclusion.**
  `apps/web/src/ui/town.ts:127`: `const wounded = partyStatus().filter((m) => !m.down && m.hp < m.maxHp);`
  — `!m.down` excludes *any* hp ≤ 0 member (dead or unconscious) from the cheap, `HEAL_COST_PER_HP`-priced
  recovery entirely, leaving only the level-scaled Raise Dead fee (line 133-135) as a knocked-out
  character's sole in-town recovery, same root conflation as this round's headline. Not folded in here
  (a different file/screen, needs its own row logic check), but it is the same invariant violated by the
  same shape of code, and a natural next pick once the Rest fix ships.
- **Cure ('heal'-kind) spells have the same shape, one file further out.** `apps/web/src/ui/party.ts:551`
  (`mostWoundedName`, `if (s.hp <= 0) continue;`) and `party.ts:530` (`healMember`, `if (!m || m.hp <= 0)
  return 0;`) together mean a memorized Cure spell (`magic.ts:284-295`, `kind: 'heal'`) can never target
  or heal an unconscious member either — contradicting the same decompile line ("revives on rest / **a
  cure**"). `reviveMember`/`firstDeadName` (the `kind: 'revive'` spell path, `magic.ts:296-299`) already
  correctly handles *any* hp ≤ 0 member (dead or unconscious) since it doesn't consult `deadStore` at all
  for eligibility — only for clearing the flag on success — so that path is fine as-is. Left as a
  standing candidate for a future round: fixing it needs the same `dead`-vs-`down` distinction threaded
  through two more functions in a different subsystem (spellcasting, not resting), which is why it isn't
  bundled into this round's minimal fix.
- **`restPartyNatural()`/`planRest()` — the third sibling, also wrong, also unused.** Since it has zero
  callers, it poses no live risk, but it's worth noting for completeness: if a future round ever
  resurrects `planRest`/`daysToHealParty` for some other purpose (e.g. a fixed-duration "camp N days"
  preview), it would need the identical `dead`-vs-`hp<=0` fix `advanceRestHealing` is getting here.

## Rejected alternatives considered this round

| Candidate | Why rejected |
|---|---|
| Multi-class HP averaging (brief's candidate #1) | Investigated properly this round via `recalc.ts`: no existing averaging function models this; would need new ruleset logic, not a wiring fix. Confirmed correctly out of scope (firmer than M87/M88's deferral). |
| `neacailRejected`-pattern / uncorrectable-rejection question (brief's candidate #2) | Traced the full post-M86 validation surface: `sheetFromDokSaved` can no longer return `null` for any real save (abilities clamped, level clamped ≤8, class always legal, deity always set). `rejectedInvalid` is now dead code; no other uncorrectable case exists to assert. Not actionable (no consumer to wire). |
| DQK/DoK destination-race hardcode (brief's candidate #3) | Reconfirmed UNKNOWN, zero decode sites in either loader. |
| `multiclassLevel` (brief's candidate #4) | Reconfirmed exactly one grep hit (a comment). Still dead. |
| `canReachWithHeight` (brief's candidate #5) | Reconfirmed zero callers. |
| `DexterityMods.reaction` | Reconfirmed zero consumers anywhere; no "surprise"/initiative-from-Dex mechanic exists to feed (the engine's own `initiative` field is a COAB "stored per-combatant value," not Dex-derived, and has no decoded source in any of our save formats — genuinely undecoded, not a dropped fact). |
| `referenceDb.ts`'s `Class`-label collision | Still unaddressed (cosmetic, minor); no fresh angle, not picked up (M37/M38/M39 already flagged it). |
| `DokEffect`/`.EFF` Affects-type crosswalk | Decoded real bytes from all 5 non-empty bundled `.EFF` files (types `0x2d,0x12,0x69,0x5f,0x5c,0x5e,0x07`) — none match any of the 3 named/crosswalked affect constants (`0x51`/`0x61`/`0x62`, all monster-only specials). Reusing the known-3 crosswalk in `charEditor.ts` would be inert for every real save (fails this loop's reachability bar); naming the rest needs new disassembly-level RE, not a wiring fix. |
| Monster-side Dex missile-attack bonus (M25's own "deliberately not touched" note) | Re-confirmed correctly out of scope by M25's own reasoning: monster THAC0 is a pre-resolved decoded byte, not recomputed from ability scores; no live recompute path to hook. |
| `render/sky.ts` never reaching `dqkExplore.ts` | Investigated properly (not just re-flagged): DQK has no first-person viewport subsystem at all today. Building one to hang a sky backdrop off of is a whole missing subsystem, matching M63's precedent, not a wiring fix. Confirmed genuinely out of scope, not merely deferred again. |

## Open questions / unknowns

- **Should the fix also touch the Temple's cheap-heal filter and the Cure-spell path** (see "Secondary
  observations")? Both share the exact same root conflation but live in different files/subsystems
  (`town.ts` screen rows; `magic.ts` spellcasting). Left for a future round to keep this slice minimal,
  per this loop's own established precedent (M85 declined to bundle `sky.ts` into the clock fix for the
  identical reason).
- **Should `restPartyNatural()`/`planRest()`/`restParty()` (the two other, now-redundant dead-code rest
  functions) be deleted once `restPartyTicks` is fixed**, to avoid a fourth "which rest function is the
  real one" trap for a future contributor? A cleanup question, not a behavioural one — not resolved here
  (audit scope is research, not code changes).
- **Does any *other* real save/import path ever hand the roster a character already at hp ≤ 0** (e.g. a
  CoK/DoK import whose stored HP byte happens to be 0)? Not investigated this round; the reachability
  proof above is via ordinary tactical combat, which is itself a sufficient, real, ordinary trigger
  and does not depend on this additional path being true.

## Implications for our engine / for the taxonomy

- **A genuinely new sub-shape of "later sibling never adopted an earlier fix": the correct fix was
  applied to the WRONG (already-unused) one of several structurally-parallel functions.** Unlike M86
  (a later host re-derives its own bespoke, wrong policy) or M85 (a same-evening UI-wiring pass misses
  one of two hosts), here CT.7h's fix (`1421bd6`) landed on `restParty()`, which was *already* not the
  live path at the time (`restPartyNatural()`/`planRest()` was) — so the fix never had a chance to reach
  real play even on the day it was written, and a week later a *third* function (`restPartyTicks()`)
  became the live path, inheriting the same pre-fix conflation from `planRest()`'s lineage rather than
  `restParty()`'s. Worth adding to the taxonomy: when a bugfix targets one of several same-purpose
  functions, check which one is *actually wired* before considering the bug closed — CT.7h's own commit
  message and tests never asserted that `restParty()` was reachable from any menu.
- **A test's own inline comment can bake in the exact wrong invariant a full week after the correct
  invariant was established elsewhere in the same codebase**, and survive untouched for the rest of the
  project's life (`gameClockCalendar.test.ts:132`'s `// dead — never heals` on a plain `{hp: 0}` object,
  one week after CT.7h had already drawn the dead-vs-unconscious line correctly). This is the same
  self-flagging shape M87 found in a doc comment, one layer more literal (a test's inline comment, not a
  function's JSDoc) and one layer more dangerous (it's asserted as a *passing green test*, actively
  certifying the wrong behaviour rather than merely describing it).
- **"Zero callers" is not always this loop's disqualifying signal** — M85-M88 correctly ruled out
  `canReachWithHeight`/`tickAffects` because they are inert *facts* with no mechanism to serve. Here,
  `restParty()`'s zero-caller status is the opposite kind of finding: a *mechanism* (a whole function
  embodying the correct policy) sitting unused while its *replacement* silently regressed the policy —
  worth distinguishing "an unused utility nobody needed" from "an unused fix whose lesson never
  propagated to the function that actually shipped."
