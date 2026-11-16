# M87 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/research/m86-audit.md` in full first (mandatory first step),
> re-checked its own backlog: (1) `combat/geometry.ts`'s `canReachWithHeight` and
> `world/gameClock.ts`'s `tickAffects()` re-grepped — both still have **zero** callers anywhere
> except their own definitions/re-exports/tests (unchanged from M85/M86; not re-proposed, per the
> brief's own instruction). (2) The `neacailRejected`-test-pattern question — left open, no new
> angle found, not picked up (still low-priority per M86's own framing). (3) DQK's destination-race
> assumption — investigated fresh: read `packages/engine/src/loaders/savedCharacter.ts` (CoK) and
> `dokSavedCharacter.ts` (DoK) in full; both loaders' own doc comments admit race/sex/alignment are
> genuinely **not decoded** ("still not mapped (documented gap): the per-class level breakdown, race,
> alignment, gender," `savedCharacter.ts:32`) — confirmed via grep (`race`/`Race` has zero hits in
> `dokSavedCharacter.ts`, and only comment-level hits in `savedCharacter.ts`). This is UNKNOWN, not a
> wiring gap (the fact was never decoded in the first place, so there is nothing to wire) — reconfirmed,
> not re-opened. (4) `multiclassLevel`'s consumer count — reconfirmed still exactly one grep hit (a
> comment in `importParty.ts:236`), so it remains a dead field, not a wiring gap; left declined.
>
> Grepped `m7[6-9]*`/`m8[0-6]*-audit.md` for fresh standing-candidate leads not already covered above.
> Investigated several in due diligence (`WILD_MENU`'s decorative command bar, `MapCell.ceiling`/GEO
> roof-bit non-decode, `Gen2GeoMap.header`'s "purpose TBD" bytes, DRYDEN's uncracked "Solamnic Plate
> Mail" named-item encoding, `MonsterRecord.carriedItems`'s condensed-display idea) — all either
> genuinely undecoded data (not a wiring gap), a missing-feature gap (not a dropped-fact gap), or a
> repeatedly-declined candidate with no fresh angle (see "Rejected alternatives"). The fresh pick came
> from re-reading `town/services.ts`'s own doc comment for `levelHpGain()`, which explicitly names the
> exact gap this round found and was never closed: **"Constitution per-level bonus, if modelled, is
> added by the host on top"** — the "host" (`apps/web/src/ui/party.ts`'s `trainMember()`) never does,
> even though a *different*, structurally-parallel host (`create.ts`'s `estimateHp()`) already does,
> using the exact same already-imported engine function, in the same file that also computes combat
> Strength/Dexterity mods with it.

## Headline finding

**A character's per-level Constitution hit-point bonus (`ADND1E_ABILITIES.constitution`, a real,
tested, PHB-transcribed AD&D-1e table already wired into character **creation**) is silently dropped
every time that same character advances a level at the **Training Hall** — `party.ts`'s `trainMember()`
computes HP gain from the class hit-die average alone, permanently erasing the Con bonus for every level
gained beyond the character's starting level, in every one of the three games (CoK/DoK/DQK share the
same `town.ts`/`party.ts` training-hall code path). The wrong, too-low number is even the one shown to
the player in the Training Hall's own status line.**

## The real, decoded/derived fact and its existing, shipped sibling consumer

`packages/engine/src/ruleset/addnd1e/abilities.ts:79-99,120-123` — the AD&D-1e Constitution
hit-point-bonus table (PHB-transcribed, `docs/engine/research/addnd1e-tables.md`), non-warriors capped
at +2, warriors extended to +3/+4/+5 at CON 17/18/19:

```ts
// abilities.ts:81-99 (CON rows 3..19 -> [hpNonWarrior, hpWarrior])
const CON: ReadonlyArray<readonly [number, number]> = [
  ... [1, 1], // 15
  [2, 2], // 16
  [2, 3], // 17
  [2, 4], // 18
  [2, 5], // 19
];
...
constitution(score: number, isWarrior = false): ConstitutionMods {
  const [nonWarrior, warrior] = clampRow(CON, score, 3);
  return { hp: isWarrior ? warrior : nonWarrior };
},
```

Already golden-tested for exactly the values this finding uses (`packages/engine/test/ruleset.test.ts:98-105`:
`m.constitution(16).hp===2`, `m.constitution(17,true).hp===3`, `m.constitution(18,true).hp===4`).

**Real, shipped consumer #1 — character creation** (`apps/web/src/ui/create.ts:71-83`, current source, full):

```ts
/** Estimate HP: best level × average hit die (across classes) + per-level Con bonus. */
function estimateHp(draft: Draft): number {
  ...
  const isWarrior = entries.some(([c]) => c === 'fighter' || c === 'knight' || c === 'ranger');
  const avgDie = entries.reduce((sum, [c]) => sum + hitDie(c === 'knight' ? 'fighter' : c), 0) / entries.length;
  const con = ADND1E_ABILITIES.constitution(draft.abilities.con, isWarrior).hp;
  return Math.max(1, Math.round(level * (avgDie / 2 + 0.5)) + level * con);   // <-- level * con, EVERY level
}
```

`level * con` reapplies the Con bonus **for every level** the new character starts at — the correct 1e
behaviour (Constitution's HP bonus is added to *every* Hit Die rolled, not just the first). This has been
in place since the character-creation feature's very first commit: `git log -S "level * con" --oneline --
apps/web/src/ui/create.ts` → **one hit**, `228844f` ("M2.S4d: in-browser character creation + party
roster") — this project's second numbered phase.

## Where the severance happens: `trainMember()` (Training Hall level-up) never applies the same bonus

`apps/web/src/ui/party.ts:991-1016` (`trainMember`, current source, full):

```ts
/**
 * Train a member into their next level at the training hall: requires their XP to have reached the
 * threshold and the party to afford the fee (both checked by the engine `checkTraining`). On success
 * it spends the fee, bumps the primary class level, adds the hit-die-average HP (and fully heals from
 * the rest), and improves THAC0 by the core attack table's level delta -- preserving the existing
 * Strength/deity to-hit offset baked into the sheet.
 */
export function trainMember(name: string): TrainResult {
  const s = roster.find((m) => m.name === name);
  if (!s) return { ok: false, name, reason: 'no such character' };
  const cls = primaryClass(s.classes);
  const core = coreClass(cls);
  const level = s.classes[cls] ?? 1;
  const chk = checkTraining(core, level, getXp(name), getGold());
  if (!chk.eligible) return { ok: false, name, reason: chk.reason, cost: chk.cost };
  addGold(-chk.cost);
  const gain = levelHpGain(hitDie(core));   // <-- NO Constitution term anywhere in this function
  s.maxHp += gain;
  s.hp = s.maxHp;
  ...
}
```

The function's own doc comment even says so plainly: "adds the **hit-die-average** HP" — no mention of
Constitution at all. `grep -n "constitution\|ADND1E_ABILITIES\.constitution" apps/web/src/ui/party.ts` →
**zero hits inside `trainMember()`**, even though `ADND1E_ABILITIES` is already imported at the top of
this exact file (`party.ts:13`) and already used twice elsewhere in the same file for **Strength**/
**Dexterity** mods (`party.ts:354-355,762`, `.strength(...)`/`.dexterity(...)`) — `.constitution` is the
one method on that already-imported object this file never calls.

**The engine's own `levelHpGain` doc comment explicitly anticipates this exact gap and names the
missing party** (`packages/engine/src/town/services.ts:42-49`, unchanged since its origin commit):

```ts
/**
 * Deterministic hit-point gain for advancing one level: the class hit-die's average (d10 → 6, d8 → 5,
 * d6 → 4, d4 → 3). Constitution per-level bonus, if modelled, is added by the host on top.
 */
export function levelHpGain(hitDie: number): number {
  if (hitDie <= 0) return 1;
  return Math.floor(hitDie / 2) + 1;
}
```

`git log -S "if modelled, is added by the host on top" --oneline -- packages/engine/src/town/services.ts`
→ **one hit**, `b2cd1f0` ("A5.2: town hub -- shop, temple, training hall, tavern") — the **same** commit
that introduced `trainMember()` in the first place. Since `create.ts` (`228844f`) already modelled the
Con bonus *before* `b2cd1f0` existed, this doc comment reads as an acknowledged, self-flagged hook that
was simply never wired for its own function's own host — not a later regression, a day-one omission that
has survived every round of this loop since (M2/A5.2 through M86) without being picked up under the
narrower "decoded-value-never-displayed" shape this loop used before this round's broadened mandate.

## Reachable in real, ordinary, shipped play — static + dynamic proof, using the project's own e2e fixture

**Static reachability** — `town.ts` is the single, shared Training Hall host for **all three games**:
`grep -rn "from './town.js'" apps/web/src/ui/*.ts` → `dqkExplore.ts:81`, `main.ts:43`, `mainMenu.ts:31`,
`play.ts:19` all import `startTown`. Inside it, `town.ts:151` puts `'Train'` on the hub menu, `town.ts:280`
calls `trainMember(name)` on selection, and `town.ts:281` prints the **exact wrong number** straight to
the player: `` `${name} trains to level ${r.newLevel}! (+${r.hpGain} HP, ${r.cost} steel)` ``. `town.ts:402`
also exposes it as the `window.__town.train` e2e seam.

**This project's own shipped e2e regression suite already exercises this exact bug, unnoticed** —
`apps/web/test/e2e.mjs:3664-3735` (`runTown`, real, current source): the test creates a real Sturm
(`window.__create.setAbilities({..., con: 16, ...})`, `setRace('human')`, `onlyClass('fighter', 1)`),
seeds 2000 XP, and trains him 1→2 via `window.__town.train("Sturm")`. **CON 16 is a real +2/level warrior
bonus** (`ADND1E_ABILITIES.constitution(16, true).hp === 2`, `ruleset.test.ts:101`), so the *correct*
gain for this exact, already-shipped test fixture should be `levelHpGain(hitDie('fighter')) + 2 = 6 + 2 =
8`, not the `6` the current code returns. The existing assertion (`e2e.mjs:3734-3735`,
`maxHpAfter === maxHpBefore + train.hpGain && train.hpGain > 0`) is self-consistent (it checks the
*returned* `hpGain` against the *actual* delta, not a hardcoded absolute number) — so it is **currently
passing over a real, wrong number** (masking the bug rather than exposing it), and would **continue to
pass, with a bigger and correct number**, once fixed. This is a safe, non-flip-required repair, unlike
M86's `neacailRejected` case.

**Independent, fresh dynamic re-derivation this round** (not trusting the e2e math by inspection alone):
created a throwaway vitest file, ran it, then deleted it (see below) that (1) decodes the real, bundled
`Champions of Krynn/SAVE/CHRDATA{1..6}.SAV` files via the production `decodeSavedCharacter` to confirm
real CoK pregens commonly carry CON scores in the affected 15-19 range (SIR STRONGSWORD CON=18, ISTAN
HORBIN CON=18, GARIN CON=17, MOLLY CON=18, KAL CON=18, SIRRION CON=16 — **5 of 6** real pregens would
lose a nonzero Con bonus on every training-hall level-up if built as playable characters via this
formula), and (2) reproduces `create.ts`'s and `party.ts`'s exact HP-gain expressions side by side for a
CON-17 warrior: creation grants `6 + 3 = 9` HP for level 1; training the same character from level 1→2
grants only `6` — the per-level `+3` Con bonus vanishes at the very first training-hall visit and every
one thereafter.

## Verification evidence (this round's scratch test)

`packages/engine/test/_scratch_m87_verify.test.ts` (created, run — **2/2 passing** — then deleted;
`git status --porcelain` confirmed clean before and after, this doc the only untracked file). Full engine
suite re-run with the scratch file present: **135 files / 1361 tests**, all green
(`cd packages/engine && npx vitest run`). Scratch file then deleted; a follow-up `git status --porcelain`
showed a fully clean tree except this doc.

Key assertions from the scratch run (verbatim results):

```
SIR STRONGSWORD CON=18 isWarrior=true  conBonus/level=4
ISTAN HORBIN    CON=18 isWarrior=false conBonus/level=2
GARIN           CON=17 isWarrior=false conBonus/level=2
MOLLY           CON=18 isWarrior=true  conBonus/level=4
KAL             CON=18 isWarrior=false conBonus/level=2
SIRRION         CON=16 isWarrior=false conBonus/level=2
```

```ts
const conBonus = ADND1E_ABILITIES.constitution(17, true).hp;             // 3
const createHp = Math.max(1, Math.round(1 * (10/2+0.5)) + 1*conBonus);   // 9  (create.ts's exact formula)
const trainGain = levelHpGain(hitDie('fighter'));                        // 6  (party.ts's exact formula)
createHp - trainGain === conBonus;                                       // 9-6=3 -- exactly the missing bonus
```

## Proposed minimal wiring plan (not applied this round)

**One additive change, entirely inside the already-imported `ADND1E_ABILITIES` object, in the one
function that needs it:**

```ts
// sketch, not applied this round -- apps/web/src/ui/party.ts, inside trainMember()
const isWarrior = core === 'fighter' || core === 'ranger'; // knight already -> 'fighter' via coreClass()
const conBonus = ADND1E_ABILITIES.constitution(s.abilities.con, isWarrior).hp;
const gain = levelHpGain(hitDie(core)) + conBonus;   // was: levelHpGain(hitDie(core))
```

- No new import needed (`ADND1E_ABILITIES` is already imported at `party.ts:13`).
- `s.abilities.con` is already present on every roster member's `CharacterSheet` (the type carries
  `abilities: AbilityScores` unconditionally, `character.ts:59`) — no new data plumbing required for any
  character source (hand-created via `create.ts`, CoK→DoK imported via `importParty.ts`, or DoK→DQK
  imported via `importDokParty.ts`), since all three already populate `abilities` on the sheet they hand
  to `addToParty`.
- `TrainResult.hpGain` (already returned and already the exact number `town.ts:281` prints to the player)
  automatically becomes correct with zero further changes to `town.ts` or its e2e seam.
- **No existing test needs to be flipped** — the one e2e assertion that exercises this path
  (`e2e.mjs:3734-3735`) checks internal consistency (`hpGain` vs. actual `maxHp` delta), not a hardcoded
  absolute number, so it passes either way; only the *value* of `train.hpGain` changes (6 → 8 for the
  seeded Sturm fixture), which the test doesn't pin.
- Update `trainMember()`'s own doc comment (`party.ts:991-996`) to say "adds the hit-die-average HP plus
  the character's Constitution bonus" instead of silently continuing to describe the incomplete formula.

**Secondary, smaller, same-shape observation (not proposed as part of this round's fix, flagged for a
follow-on):** `apps/web/src/ui/importDokParty.ts:226` (`sheetFromDokSaved`) computes a DoK→DQK import
candidate's estimated HP with the **identical** formula gap — `const hp = level * levelHpGain(hitDie(cls));`
— no Con term, even though the real, decoded `sc.abilities.con` is sitting right there and gets read into
`req.abilities` two lines later. This is a **third** structurally-parallel site with the same shape (only
`create.ts` gets it right; `trainMember()` and `sheetFromDokSaved()` both drop it) — not folded into this
round's headline because DoK's own HP is itself a documented estimate (DoK's `.GAM` HP byte offset is an
unlocated gap, see "DoK's xp/hitPoints unlocated byte-fields," standing candidate since early rounds) —
fixing the estimate's Con term would improve an already-approximate number rather than close a clean,
demonstrably-live gap the way `trainMember()`'s fix does. Left as an open question below, not part of the
recommended slice.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| `combat/geometry.ts`'s `canReachWithHeight`, `world/gameClock.ts`'s `tickAffects()` | Re-grepped per the mandatory first step: still **zero** callers anywhere except their own definitions/index re-export/tests. Unchanged "no real consumer at all" shape M85/M86 already ruled out of this loop's mandate; not re-proposed. |
| `wilderness.ts`'s `WILD_MENU` command bar (Look/Camp/Map/Exit) being fully decorative | Re-confirmed unchanged from M63/M64/M65: `onKey()` only handles arrow movement, `menuSel` is hardcoded `0`, and none of the four verbs has a `case` anywhere. Still a missing-feature gap (a UI affordance with no backing behaviour at all), not this loop's "real fact, dropped before reaching a consumer" shape — implementing four travel-screen verbs from scratch is a materially bigger job than any fix in this loop's history. Not picked up, no new angle found. |
| `MapCell.ceiling` / GEO "roof bit" never populated, so `dqkExplore.ts`/`explore.ts`'s `roofByteOf()` always defaults to indoor | Investigated fresh: read `packages/engine/src/loaders/geo.ts` in full — `buildGeoResult()` only ever sets `floor`/`flags` on a `MapCell`, never `ceiling` (confirmed by grep: `ceiling` has **zero** assignment sites anywhere in `packages/engine/src`, only the type definition and `renderWallView.ts`'s unrelated painter option). `explore.ts:198-204`'s own comment already documents this as a known, deliberate placeholder ("the GEO per-cell roof bit isn't decoded yet... default to the faithful black dungeon ceiling"). This is genuinely undecoded data, not a decoded-and-dropped fact — same "nothing to wire yet" shape as the race-byte question below. Not pursued. |
| `Gen2GeoMap.header` (DQK GEO's 6 reserved per-map bytes) | `geo.ts:184-185`'s own comment: "purpose TBD, not needed for the walkable grid; preserved in `header`." Confirmed round-tripped by `geoEncode.ts` but never read for meaning anywhere (`grep -n "\.header\b"` → only the round-trip encoder and one unrelated `render/spellbook.ts` hit for a different `header` field entirely). Genuinely undecoded, not a wiring gap. |
| DRYDEN's uncracked "Solamnic Plate Mail" (`.JNK` item type 68) | Re-confirmed via `dokGearCrosswalk.ts:17-19`'s own doc comment: type 68 "uses a separate, uncracked named-artifact encoding, not plain VOCAB composition." This needs new disassembly-level RE work to resolve (what does type 68 actually decode to), not a one-hop wiring fix of an already-decoded fact — M34/M51/M66 all already flagged this identically; no new angle found this round to close it. |
| `MonsterRecord.carriedItems` → a condensed "Carries: X, Y" Reference-DB row | Repeatedly flagged and explicitly deferred across many rounds (M39, M56/M58, M65, M81's own carried-forward list: "five more rounds' worth of `classFlags.ts`/`carriedItems` rejections reconfirmed") as needing a name-lookup + list-formatting helper that no round has designed yet. No fresh angle found this round; not re-litigated without one, per this loop's own discipline. |
| DoK's destination-race hardcode (`'human'` in both import paths) | Investigated fresh, per the brief's candidate #3: confirmed **UNKNOWN**, not a wiring gap — neither `savedCharacter.ts` (CoK) nor `dokSavedCharacter.ts` (DoK) decodes a race byte at all (both loaders' own doc comments list race as an explicit, still-open decode gap). There is no decoded fact to wire; re-confirmed, not re-opened as this round's headline. |
| `multiclassLevel`'s consumer count (brief's candidate #4) | Re-grepped: `multiclassLevel` still has exactly **one** repo-wide hit outside its own definition/assignment (`importParty.ts:236`, a comment, not a read). Confirmed still a dead field with zero real consumers, not a wiring gap — stays declined, consistent with M86's finding. |

## Open questions / unknowns

- **Should `importDokParty.ts`'s `sheetFromDokSaved()` HP estimate also gain the Con term** (see
  "Secondary, smaller, same-shape observation" above)? Real CON is decoded and available at that exact
  call site, but the base HP figure it would be added to is itself already an approximation (DoK's real
  HP byte is unlocated) — worth a future round's judgement on whether improving an approximate number is
  worth a slice on its own, separate from `trainMember()`'s clean, demonstrably-live fix. **Not resolved
  this round.**
- **Should multi-class HP averaging (per the CoK manual's own rule, "HP per level is averaged across the
  classes," `docs/engine/research/cok-dragonlance-rules.md:161`) also be revisited while touching
  `trainMember()`?** Out of scope for this round — `trainMember()` already only computes a single core
  class's hit die today (a separate, pre-existing simplification this finding doesn't touch or worsen);
  flagged only as an adjacent observation, not part of the recommended fix.
- **Is `isWarrior = core === 'fighter' || core === 'ranger'` the exactly correct warrior set for
  `trainMember()`'s post-`coreClass()` value?** `coreClass()` already folds `'knight' → 'fighter'`
  (`character.ts:85-87`), so `core` can only ever be `'fighter'`/`'ranger'`/`'thief'`/`'cleric'`/`'magicUser'`
  at this point — mirroring `create.ts`'s own three-class warrior set (fighter/knight/ranger) onto the
  post-mapping value correctly reduces to `fighter`/`ranger`. Confirmed by reading `coreClass()`, not
  assumed.

## Implications for our engine

- **A function's own doc comment can name the exact gap it has, and the gap can still survive dozens of
  audit rounds untouched**, because the earlier rounds' narrower mandate ("decoded value never reaches a
  UI panel") didn't cover it — `levelHpGain()`'s "Constitution per-level bonus, if modelled, is added by
  the host on top" is not a display gap; it's a **structurally-parallel-resolver gap** (two "compute this
  character's HP at this level" call sites, one honours the invariant, one doesn't) that only became
  in-scope once this round's brief explicitly broadened the shape taxonomy. Worth periodically re-reading
  already-swept files' doc comments against a **widened** mandate, not just a fresh one.
- **The gap predates almost this entire audit loop**: `create.ts` (`228844f`, M2.S4d) got the Con bonus
  right before `party.ts`'s `trainMember()` (`b2cd1f0`, A5.2) even existed, and the training-hall commit's
  own doc comment for `levelHpGain()` reads as aware of the sibling mechanism without ever calling it —
  this is the **oldest-standing** instance of the "later host doesn't reuse an already-shipped sibling
  fixup" family found so far (older than M86's DoK-import case by many phases), just undiscoverable under
  the loop's earlier, narrower lens.
- **A wiring gap can hide in plain sight inside a file that already imports the exact fix.**
  `party.ts` imports `ADND1E_ABILITIES` and already calls two of its three methods (`.strength`,
  `.dexterity`) for unrelated combat math in the same file — `.constitution` being the only unused method
  on an object already sitting in scope is a stronger "this should have been trivial to wire" signal than
  most of this loop's prior finds, several of which needed a new import or a new crosswalk table.
  Reinforces a good future heuristic: check every method of every already-imported ruleset-math object for
  an unused sibling, not just every field of a data record.
- **This finding is unusually low-risk to fix**: it doesn't require flipping any existing test assertion
  (unlike M86's `neacailRejected`), doesn't require new plumbing (unlike most "decoded fact never reaches
  a screen" fixes, which need a widened parameter type or a new row), and doesn't require new e2e
  scaffolding (the exact fixture already exists in `apps/web/test/e2e.mjs`'s `runTown` case) — a genuinely
  "free" fix by this loop's own established regression-risk vocabulary.
