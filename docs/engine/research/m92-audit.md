# M92 audit — the Training Hall never re-checks the printed racial/class level cap that character creation already enforces

> Audit method: read `docs/engine/research/m91-audit.md` (and, via grep, m89/m90) in full first per the
> brief's mandatory first step. Per the brief's **explicit instruction**, this round does **not** extend
> the CT.7h dead-vs-unconscious family a fourth time (M89 Rest, M90 Temple, M91 Cure spells already
> closed it; the only remaining sibling, `reviveMember`/`firstDeadName`, is a "more capability" question
> per M91's own "Open questions," not a fix target, and is not the headline here). Swept fresh areas per
> the brief's suggestions (character-creation/leveling pipeline outside HP, combat edge cases, shop
> economy, DQK Gen2 systems) and rejected ~8 candidates before settling on this round's finding — see
> "Rejected alternatives considered."

## Headline finding

**`apps/web/src/ui/party.ts`'s `trainMember()` (and its display-only sibling `trainingStatus()`) —
the Training Hall's real, shipped level-up mutation, called for all three games — never calls
`maxLevel()`, the exact racial/class level-cap function `createCharacter()` already uses to reject
illegal characters at creation time.** The result: a party member can be trained at the Training Hall
past the printed "Maximum Level Limits by Race, Class and Prime Requisite" ceiling (Journal p. 56,
transcribed at `docs/engine/research/cok-dragonlance-rules.md` §7) indefinitely — every level past the
cap computes cleanly (real XP threshold, real gold cost, a real, strictly-better THAC0, real HP) with
**no wall of any kind**, silently violating a rule the same codebase already enforces one call site away.

**Important complication found and verified this round (not present in the naive version of this
finding): `town.ts`/`trainMember()` is shared by CoK, DoK, *and* DQK, and DQK's own manual (`The Dark
Queen of Krynn/Journal.pdf`) prints a *materially more permissive* level-limit table** (most
human/elf/half-elf class combinations are `Max` — i.e., uncapped, in-game text: *"Max: Highest Level
Available in THE DARK QUEEN OF KRYNN"* — vs. CoK's low flat 7-9 ceilings). A naive, blind wire-in of
`maxLevel()` into `trainMember()` would therefore **fix CoK/DoK correctly but regress DQK training**
(a DQK party member legitimately advancing past their CoK-era cap would be wrongly blocked). This is
why the proposed fix below is scoped, not a one-line change — see "Proposed minimal wiring plan."

## Existing sibling/precedent and the self-flagging evidence

This is the training-hall's second independently-discovered gap this loop (M87.S1 found the Constitution
HP-bonus omission in the same function, `docs/engine/research/m87-audit.md`) — same function, same file,
a different field entirely (a *validation gate*, not a derived bonus), confirming `trainMember()` is a
function that has accreted real gaps as sibling mechanics (Con HP bonus, now the level cap) were built
elsewhere in the codebase without a corresponding revisit here.

**Git-blame dating (mandatory discipline #4):**

- `character.ts`'s cap enforcement (`maxLevel(req.race, cls, req.abilities.str)`, current source
  `packages/engine/src/ruleset/addnd1e-dragonlance/character.ts:125-128`) was introduced by commit
  `4e19ac3` ("M2.S4c: CoK character creation + validation (engine core)"), **2026-06-21 13:29:29 +0200**
  — confirmed via `git log -p -S "exceeds the" -- packages/engine/src/ruleset/addnd1e-dragonlance/character.ts`.
- `trainMember()`/`checkTraining()` were introduced by commit `b2cd1f0` ("A5.2: town hub — shop, temple,
  training hall, tavern"), **2026-06-22 09:50:58 +0200** — roughly **20 hours later**, confirmed via
  `git log -p -S "export function trainMember" -- apps/web/src/ui/party.ts`.

So, unlike M91's "written the day *before* the invariant existed" shape, this is the **inverse**: the
racial-cap check **already existed** when the Training Hall was built the very next morning, yet its
author (same author, `b2cd1f0`'s commit message describes `checkTraining` in detail: *"gates level-up on
the AD&D-1e xpForLevel threshold, plus a deterministic levelHpGain"* — XP and gold only, no mention of
race) never reused it. This is a new taxonomy sub-case, not yet catalogued: **"a validation gate is wired
at its first call site, and a sibling call site is built the very next day in the same codebase, but the
sibling never consults the already-existing gate — not because the gate didn't exist yet (M91's shape),
but because nobody thought to check for a second call site during the sibling's own construction."**

`trainMember()`'s current doc comment (`party.ts:997-1005`) describes in detail what it "requires,"
"spends," "bumps," "adds," and "improves" — race/level-cap eligibility is not mentioned at all, matching
the established "doc comment silently omits the missing check" self-flagging pattern from prior rounds,
though here there is no explicit wrong statement to point to (unlike M91's "Dead members are not healed"
line) — just a conspicuous silence on eligibility beyond XP/gold.

## Where the severance happens — exact locations, current source

**`packages/engine/src/ruleset/addnd1e-dragonlance/character.ts:120-129`** (`createCharacter`, the one
real consumer, current source, full):

```ts
for (const [cls, level] of entries) {
  if (!allowsClass(req.race, cls)) {
    errors.push(`${req.race} may not be a ${cls}`);
    continue;
  }
  const cap = maxLevel(req.race, cls, req.abilities.str);
  if (cap !== null && level > cap) {
    errors.push(`${cls} level ${level} exceeds the ${req.race} cap of ${cap}`);
  }
}
```

**`apps/web/src/ui/party.ts:1006-1028`** (`trainMember`, current source, full — no `race`/`maxLevel`
reference anywhere):

```ts
export function trainMember(name: string): TrainResult {
  const s = roster.find((m) => m.name === name);
  if (!s) return { ok: false, name, reason: 'no such character' };
  const cls = primaryClass(s.classes);
  const core = coreClass(cls);
  const level = s.classes[cls] ?? 1;
  const chk = checkTraining(core, level, getXp(name), getGold());
  if (!chk.eligible) return { ok: false, name, reason: chk.reason, cost: chk.cost };
  addGold(-chk.cost);
  const isWarrior = core === 'fighter' || core === 'ranger';
  const conBonus = ADND1E_ABILITIES.constitution(s.abilities.con, isWarrior).hp;
  const gain = levelHpGain(hitDie(core)) + conBonus;
  s.maxHp += gain;
  s.hp = s.maxHp;
  const thac0Delta = classThac0(core, level) - classThac0(core, chk.targetLevel);
  s.thac0 = s.thac0 - thac0Delta;
  s.classes = { ...s.classes, [cls]: chk.targetLevel };
  persist();
  return { ok: true, name, newLevel: chk.targetLevel, hpGain: gain, cost: chk.cost };
}
```

**`packages/engine/src/town/services.ts:69-83`** (`checkTraining`, the sole eligibility gate
`trainMember` defers to, current source, full — takes `classId`/`level`/`xp`/`gold` only, **no `race`
parameter exists at all**, so the check is structurally incapable of consulting a racial cap without a
signature change):

```ts
export function checkTraining(classId: ClassId, currentLevel: number, xp: number, gold: number): TrainingCheck {
  const targetLevel = Math.max(1, Math.floor(currentLevel)) + 1;
  const needXp = xpForLevel(classId, targetLevel);
  const cost = trainingCost(targetLevel);
  let eligible = true;
  let reason: string | undefined;
  if (xp < needXp) { eligible = false; reason = 'not enough experience'; }
  else if (gold < cost) { eligible = false; reason = 'not enough steel'; }
  return { eligible, currentLevel: Math.max(1, Math.floor(currentLevel)), targetLevel, cost, needXp, haveXp: xp, reason };
}
```

`grep -n "maxLevel|MAX_LEVEL" apps/web/src/ui/party.ts apps/web/src/ui/town.ts
packages/engine/src/town/services.ts` → **zero hits** across all three files.

`trainingStatus()` (`party.ts:1030-1039`, the function that drives the Training Hall's own displayed
stock list — what the player sees *before* clicking Train) has the identical gap: it also never
consults `maxLevel`, so the hall's UI (`town.ts:145-152`) will happily print `"Sturm fighter → 9"` as an
affordable, eligible row for a level-8 human fighter, when the manual says level 8 is the human fighter's
ceiling.

## Reachable in real, ordinary, shipped play — static + dynamic proof

**Static reachability, the full real chain (this exact chain was already established and cited by
M87's audit, re-confirmed unchanged this round):** `town.ts` is the single, shared Training Hall host
for all three games — `grep -rn "from './town.js'" apps/web/src/ui/*.ts` → `dqkExplore.ts:81`,
`main.ts:43`, `mainMenu.ts:31`, `play.ts:19` all import `startTown`. Inside it, `town.ts:153` puts
`'Train'` on the hub menu; `town.ts:280-282` (`activate()`, the real click/keybind handler) calls
`trainMember(name)` on selection and prints the result straight to the player; `town.ts:404`
(`train: (name: string) => trainMember(name)`) also exposes it as the `window.__town.train` e2e seam
already exercised by `apps/web/test/e2e.mjs`'s `runTown()` (`e2e.mjs:3860-3864`, trains "Sturm" 1→2).
Reaching the cap itself only requires ordinary, extended play: a level-8 human fighter (CoK/DoK's own
printed ceiling, `cok-dragonlance-rules.md` §7) with 250,000 XP (`FIGHTER.xp[8]`,
`packages/engine/src/ruleset/addnd1e/progression.ts:22` — the standard, canonical AD&D 1e Fighter
"Lord" threshold) and 9,000 steel can walk into the Training Hall and be trained to level 9, 10, 11...
indefinitely; nothing in the chain rejects it.

**Dynamic re-derivation this round** (scratch vitest file, created, run, then deleted — see below),
against the real, current, unmodified `maxLevel`/`createCharacter`/`xpForLevel`/`thac0`/`levelHpGain`/
`trainingCost` production functions (imported directly from `packages/engine/src`, no fixtures or
mocks):

```
maxLevel('human', 'fighter', 18) === 8                          -- real cap, real table (Journal p. 56)
createCharacter({ race: 'human', classes: { fighter: 9 }, ... })
  -> { ok: false, errors: ["fighter level 9 exceeds the human cap of 8"] }   -- real consumer #1, works

// The training-hall math for the exact same character training 8 -> 9:
{
  cap: 8,
  targetLevel: 9,
  needXp: 250000,        -- xpForLevel('fighter', 9); finite, attainable, canonical PHB value
  cost: 9000,             -- trainingCost(9); finite
  thacAtCap: 13,          -- classThac0('fighter', 8)
  thacPastCap: 12,        -- classThac0('fighter', 9); STRICTLY BETTER than thacAtCap
  hpGain: 4               -- levelHpGain(...); finite, non-zero
}
```

All four values used by `checkTraining()`/`trainMember()` (`needXp`, `cost`, `thacPastCap`, `hpGain`)
are finite and mechanically meaningful — i.e. there is no accidental wall (a crash, `NaN`, or a
saturated/clamped table) masking the bug. `classThac0`'s underlying table clamps its column index
(`combatTables.ts:72-75`, `col()`) but the fighter row has 13 distinct columns (levels 1-12+), so level
9 gets a genuinely better THAC0 than level 8, not a repeated value — training past the cap is a real,
observable mechanical improvement, exactly as if the cap did not exist.

## Verification evidence (this round's scratch test)

`packages/engine/test/_scratch_m92_verify.test.ts` (created, run — **3/3 passing**, output reproduced
verbatim above — then deleted; `git status --porcelain` confirmed clean before and after, this doc the
only untracked file).

## The DQK complication (found and verified this round, not present in a naive read of the bug)

**`The Dark Queen of Krynn/Journal.pdf`** (extracted via `pdftotext -layout`, page containing
`MAXIMUM LEVEL LIMITS BY RACE AND CLASS`) prints **DQK's own, separate level-limit table** — materially
different from, and mostly *more permissive* than, CoK's:

| Class | Humans | Silv. Elves | Qual. Elves | Half-Elves | Hill Dwarves | Mtn Dwarves | Kender |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Cleric | Max | (illegible in extract) | — | — | — | — | 12 |
| Fighter | Max | Max | Max | Max | 10 | 10 | 5 |
| Paladin | Max | 10 | 14 | 9 | Max | Max | No |
| Ranger | Max | 12 | No | No | No | — | 5 |
| Knight | Max | Max | Max | 11 | — | 8 | No |
| Magic-User | Max | No | No | 10 | 8 | No | No |
| Thief | Max | Max | Max | 10 | No | No | Max |

("Max" = "Highest Level Available in THE DARK QUEEN OF KRYNN," i.e. effectively uncapped for that
race/class in this game — confirmed by the manual's own footnote.) This table has **not been
transcribed into the codebase anywhere** (`grep -rln "MAXIMUM LEVEL LIMITS BY RACE AND CLASS"
docs/` → zero hits before this audit) — it is a **new primary-source finding this round**, not
previously documented.

This means `packages/engine/src/ruleset/addnd1e-dragonlance/classes.ts`'s `MAX_LEVEL` table is
**explicitly and only correct for CoK** (its own doc comment: *"This game caps everything very low...
That is correct for CoK — it's the first game in the trilogy,"* `cok-dragonlance-rules.md:209`).
Applying it unconditionally inside `trainMember()` — which is reachable from a DQK session too
(`dqkExplore.ts:81,626` imports and calls `startTown()`) — would **correctly close the CoK/DoK gap but
introduce a new regression for DQK**, wrongly blocking human/elf/half-elf training that DQK's own manual
explicitly allows (`Max`). Confirmed there is currently **no game-context signal available** inside
`party.ts`/`town.ts`/`trainMember()` to distinguish a DQK session from a CoK/DoK one (`startTown()` takes
no arguments at any of its four call sites: `dqkExplore.ts:626`, `play.ts:48`, `main.ts:463,945`,
`mainMenu.ts:139`) — each *caller* structurally knows which game it represents (it's the literal calling
module), but that fact is not currently threaded through.

Separately, `createCharacter()`'s own cap enforcement is **not at risk of this same regression today**:
`startCreate()` (the only caller of `createCharacter` in the shipped app) is invoked only from
`main.ts`/`mainMenu.ts` (CoK/DoK character creation), never from `dqkExplore.ts` — DQK parties currently
only arrive via import (`importDokParty.ts`), which (per `docs/engine/BUILD-QUEUE.md`'s M14.S1 entry)
already deliberately searches "over the human race's level cap (≤8) so `createCharacter` never rejects a
legal character on level alone" — i.e. the project has *already* handled this exact CoK-cap-vs-DQK-import
tension once, at creation time, but never revisited it for the training-hall's *post-import* progression.

## Proposed minimal wiring plan (not applied this round — audit scope is research only)

Because a blind wire-in risks a real DQK regression, the safe, additive fix threads a minimal
game-context parameter through the existing call chain (each caller already knows its own game from its
own module identity — this is plumbing, not new policy):

```ts
// sketch, not applied this round

// packages/engine/src/town/services.ts -- optional param, default undefined so existing callers
// (and any future non-Dragonlance ruleset) are unaffected until they opt in
export function checkTraining(
  classId: ClassId, currentLevel: number, xp: number, gold: number,
  capCheck?: { race: DragonlanceRaceId; dlClass: DragonlanceClassId; str: number; enforce: boolean },
): TrainingCheck {
  const targetLevel = Math.max(1, Math.floor(currentLevel)) + 1;
  ...
  if (capCheck?.enforce) {
    const cap = maxLevel(capCheck.race, capCheck.dlClass, capCheck.str);
    if (cap !== null && targetLevel > cap) {
      return { eligible: false, reason: `${capCheck.dlClass} is at its level cap (${cap})`, ... };
    }
  }
  ...
}

// apps/web/src/ui/party.ts -- trainMember(name, enforceLevelCap = true) — CoK/DoK callers keep the
// default; town.ts threads `enforceLevelCap: activeGame !== 'dqk'` once startTown() knows its game
// (a second, small plumbing step: startTown(game: 'cok'|'dok'|'dqk') — each of the 4 existing call
// sites already unambiguously knows which game it is from its own module).
export function trainMember(name: string, enforceLevelCap = true): TrainResult {
  ...
  const chk = checkTraining(core, level, getXp(name), getGold(),
    enforceLevelCap ? { race: s.race, dlClass: cls, str: s.abilities.str, enforce: true } : undefined);
  ...
}
```

Notes on the sketch:
- Both new parameters are optional with a default that preserves today's *CoK/DoK-correct* behavior
  (`enforceLevelCap = true`), so no existing CoK/DoK e2e assertion needs to change.
- `startTown()` gaining a `game` argument is the one genuinely new piece of plumbing (not present today
  at any of its 4 call sites) — small, mechanical, and each caller already has the fact in hand from its
  own file identity (`dqkExplore.ts` unconditionally knows it's DQK; `main.ts`/`mainMenu.ts`/`play.ts`
  would need to know which of CoK/DoK is active, which they likely already track for save-key namespacing
  — not independently verified this round, flagged as an open question below).
- A full DQK-correct fix additionally needs DQK's own `MAX_LEVEL`-equivalent table transcribed from the
  table above (several cells were faint/illegible in the `pdftotext` extraction and should be re-checked
  against the PDF image directly, not just the OCR'd text, before coding) — out of scope for "wire an
  existing check into a sibling," which is why this round's proposed fix **defaults to enforcing the
  cap for CoK/DoK and explicitly skips it for DQK** (a correct, if incomplete, additive step) rather than
  attempting to also model DQK's table in the same pass.

## Secondary observations not part of this round's fix

- **`trainingStatus()` (`party.ts:1030-1039`) has the identical gap** and should receive the same
  `enforceLevelCap` treatment in the same change, since it drives what the Training Hall *displays* as
  eligible — fixing `trainMember()` alone without `trainingStatus()` would let the mutation correctly
  refuse training while the UI still shows the row as buyable, a "half-fixed sibling" shape this loop
  has flagged before (M90). Both must move together.
- **`classesForRace`/`allowsClass` (same `classes.ts` module) are correctly consumed by `create.ts`
  already** — only the *level ceiling*, not the *class-legality* check, is missing at the Training Hall
  (a fighter cannot become a cleric via training in this codebase at all — there is no mechanism to gain
  a second class post-creation — so `allowsClass` genuinely has nothing to re-check at train-time; only
  `maxLevel` applies).
- **The Knight-of-Solamnia order-petition system (`KNIGHT_ORDER_MINIMUMS`, `classes.ts:85-90`) is a
  related, separate, already-flagged-elsewhere mechanic** (not checked this round in depth — no prior
  audit doc reference found via grep, but it did not surface as this round's strongest candidate; left
  as an open question below rather than bundled in, since it's a different kind of gate — ability-score
  minimums to *advance an order*, not a level ceiling — and deserves its own dedicated look).

## Rejected alternatives considered this round

| Candidate | Why rejected |
|---|---|
| `reviveMember()`/`firstDeadName()` tightening (CT.7h family, 4th instance) | Explicitly excluded by this round's brief — restricting an already-working path, not a dropped mechanic; not the headline per instruction. |
| `thiefSkillPercent`/`recalcThiefSkills` (thief skill tables) | Re-confirmed dead end: no LOCK/TRAP ECL opcode exists to consume it (established M24/M25). |
| Monster `SavingThrows` columns (`paralyzePoisonDeath`, `petrifyPolymorph`, `rodStaffWand`, `breath`) | Re-confirmed exhausted dead end, already flagged by M27 and re-confirmed by M65/M82: no poison/petrification/rod-staff-wand/breath-weapon effect exists in either combat engine to consume them. |
| `dokGearCrosswalk.ts`'s Solamnic Plate Mail gap | Confirmed deliberate, already-flagged scope exclusion (uncracked byte encoding), not a fresh wiring gap. |
| `AuthoredRace`/`AuthoredClass` not wired into `createCharacter` | Confirmed deliberate M5.S5 future-authoring scope, not a game-data drop. |
| `wilderness.ts`'s `WildernessTravel`/`TERRAIN` | Fully consumed by `apps/web/src/ui/wilderness.ts`; no gap; also hand-authored demo content, not decoded game bytes. |
| DQK `dqkExplore.ts`'s auto-drain of ECL `menu`/`who`/`input` pauses | Investigated at length; DQK never had interactivity to begin with (no asymmetric sibling), so this doesn't match the "wired for some, not others" shape. |
| `explore.ts`'s `runStepEvent()` menu-only interactive gate (CoK/DoK ECL `'input'`/`'who'` turns auto-answered with 0 instead of routed to the working `dialogue.ts` overlay) | **Investigated in depth, found real and git-blamed (commit `e06eea2`, A5.3) but ultimately NOT reachable in ordinary shipped play today**: both `GAME_DATA.cok.eclInitBlock` and `GAME_DATA.dok.eclInitBlock` are hardcoded to `34` (`apps/web/src/ui/gameData.ts`), and `explore.ts` never chains to another ECL block (no NEWECL/area-transition support in the live walk loop) — so block 34 is the *only* block either game's live explore screen can ever visit. A full 64-backdrop dynamic scan of block 34 for both CoK and DoK (real `ECL1.DAX` bytes, real `dialogueForCell`) found **zero** `awaiting: 'input'`/`awaiting: 'who'` first-pause turns — every backdrop is `menu`, `combat`, or `end`. The real `input`/`who` hits found elsewhere (DoK `ECL1.DAX` block 33/backdrop 39, `ECL3.DAX` block 96/backdrop 10, etc.) are all in blocks the shipped UI cannot currently reach. Left as an open question below (a real latent bug that will matter once area-chaining ships) rather than this round's headline, since it fails the "reachable in real, ordinary, shipped play" bar today. |
| `strPct` (exceptional strength) wiring | Fully wired already (`party.ts`, `combat`, `encumbrance.ts`, `charSheet.ts`, `import.ts`'s `raise()`) — no gap found. |
| Item `charges` field (`loaders/item.ts:137`, `dqkItem.ts:133`) | Decoded but never consumed by any spend/use mechanic — part of the already-exhaustively-covered "item-instance subsystem blocked on unmapped/bad data" territory (M24-M67), not a fresh angle. |

## Open questions / unknowns

- **Does `main.ts`/`mainMenu.ts`/`play.ts` already track "which of CoK/DoK is active" anywhere
  accessible to `town.ts`** (e.g. for save-key namespacing, per `greybox.party.cok`-style keys referenced
  in M91's e2e notes)? If so, threading a `game` argument into `startTown()` is even smaller than
  sketched above. **Not verified this round** — flagged for whoever picks up the fix.
- **DQK's own `MAX_LEVEL`-equivalent table is only partially legible from this round's `pdftotext`
  extraction** (some Silvanesti Elf Cleric / Mountain Dwarf Ranger cells were unclear) — a future round
  should re-extract with `pdftoppm`/image OCR or manually read the PDF page image directly before
  transcribing DQK's table into code, the same rigor `cok-dragonlance-rules.md` §7 already applied to
  CoK's table.
- **Should `checkTraining`'s `TrainingCheck.reason` string for a capped-out character say something
  player-facing like "at level cap" rather than a generic refusal**, matching `reasonShort()`'s existing
  `town.ts:177-182` pattern (`/experience/i` → "needs XP", `/steel/i` → "needs gold")? A third pattern
  would need adding there too — small, but not included in this round's sketch.
- **The Knight-of-Solamnia order-petition minimums (`KNIGHT_ORDER_MINIMUMS`)** — is there a live UI path
  that lets a Knight actually petition Crown → Sword → Rose, and does it (if it exists) check these
  minimums? Not investigated this round; flagged as a candidate for a future sweep.
- **`explore.ts`'s ECL `'input'`/`'who'` auto-answer gap** (see "Rejected alternatives") remains real and
  git-blamed but unreachable until area-chaining/NEWECL support exists in the live walk loop — worth
  revisiting the moment that support ships, since the interactive UI (`dialogue.ts`) is already built and
  waiting.

## Implications for our engine / for the taxonomy

- **New taxonomy sub-case**: *"A validation gate is correctly wired at its first call site; a sibling
  call site is built the very next day in the same codebase but never consults the already-existing
  gate — not because the gate postdates the sibling (M91's shape), but because the sibling's own
  construction never cross-checked for a second consumer."* Distinct from M91 (function predates the
  invariant) and from M87 (a derived bonus omitted) — here the *check itself* predates the *gap* by
  under a day, yet is the plainest possible "forgot to reuse an adjacent, already-correct helper" case
  this loop has found.
- **A genuinely new wrinkle for this taxonomy**: a fix that is unambiguously correct for one game
  sharing a call site (CoK/DoK) can be **actively wrong** for a second game sharing the *same* call site
  (DQK), because the underlying rule table is confirmed, by the games' own manuals, to differ between
  them. This means "wire the existing check into the sibling" is not always a safe, zero-risk pattern in
  a multi-game shared-UI codebase like this one — the loop's own additive-fix bias needs a corollary:
  **verify the check's source data applies uniformly across every game that shares the call site before
  proposing a blind wire-in; when it doesn't, the correct "additive" step is to thread a scope/context
  guard, not just call the existing function.**
- **Reinforces `docs/engine/BUILD-QUEUE.md`'s M14.S1 precedent** (the DoK→DQK import already
  deliberately searches "over the human race's level cap (≤8) so `createCharacter` never rejects a legal
  character on level alone") — that entry shows the project has already navigated this exact
  CoK-cap-vs-DQK-permissiveness tension once, at creation time, but the training-hall's *post-import*
  progression was never connected to the same insight. Worth cross-referencing directly if this fix is
  picked up.
