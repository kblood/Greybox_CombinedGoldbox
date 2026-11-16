# M88 audit — closing M87's own deferred third sibling

> Audit method: read `docs/engine/research/m87-audit.md` in full first (mandatory first step).
> Re-checked the M88 brief's backlog in priority order. **Item #1 turned out to still be alive and is
> this round's finding** (see below) — M87's own "Open questions" section left it explicitly
> unresolved pending a future round's judgement, and that judgement point has now arrived. Checked the
> other backlog items fresh before committing to #1:
> (2) Multi-class HP averaging — re-confirmed still out of scope: `trainMember()` (now fixed per M87)
> still only computes a single core class's hit die, a pre-existing simplification neither M87 nor this
> round's fix touches or worsens; not picked up. (3) The `neacailRejected`-test-pattern question — no
> new angle found, left open per M86/M87. (4) DQK/DoK destination-race hardcode — reconfirmed UNKNOWN,
> not a wiring gap: `grep -n "race\|Race"` in both `savedCharacter.ts` and `dokSavedCharacter.ts` still
> shows zero decode sites, only comments/type literals. (5) `multiclassLevel` — reconfirmed exactly one
> grep hit (`importParty.ts:236`, a comment), still a dead field. (6) `canReachWithHeight` — reconfirmed
> zero callers anywhere except its own definition/tests, unchanged from M85-M87; not re-proposed, no
> real consumer. (7) The long-tail list (`WILD_MENU`, class-label collision, `DexterityMods.reaction`,
> `DokEffect`/`.EFF` crosswalk gaps, DRYDEN's Solamnic Plate Mail, `carriedItems` formatting) — spot-
> checked via grep, no state change since M87's own "Rejected alternatives" table; not re-litigated
> without a fresh angle, per this loop's discipline.
>
> Grepped all 87 prior `m*-audit.md` files for `sheetFromDokSaved`, `conBonus`, `ADND1E_ABILITIES`,
> `levelHpGain` before finalizing — `sheetFromDokSaved` has prior hits in M32/M33/M34/M61/M66/M67/M86/
> M87 (class inference, AC, THAC0, inventory — all different fields, already fixed in their own rounds)
> but the Constitution-HP-term gap itself was only ever named once, as M87's own explicitly-deferred
> "Open questions" item, never as a headline or a "rejected" entry. Not a re-proposal of anything already
> fixed or declined.

## Headline finding

**`importDokParty.ts`'s `sheetFromDokSaved()` — the DoK → DQK character carry-over's HP estimator —
computes every imported hero's hit points from the class hit-die average alone, with **zero**
Constitution contribution, even though (a) the character's real, byte-faithful Constitution score is
sitting in scope two lines below the computation, (b) the exact per-level Con-bonus term this needs
(`ADND1E_ABILITIES.constitution`) is the same one M87.S1 just finished wiring into the Training Hall's
`trainMember()`, and (c) **all 6 of the real, bundled DoK pregen saves this importer actually reads in
shipped play have a non-zero Con bonus at their own inferred class/level** — every real DoK→DQK import
today under-states its hero's HP by 7 to 32 points (17%–40% of the correct total), depending on the
character.**

This is the third structurally-parallel "derive this character's HP" site in the codebase
(`create.ts`'s `estimateHp()`, `party.ts`'s `trainMember()`, and this one) — M87 fixed the second one
and explicitly flagged this third one as a candidate it declined to fix "this round," pending
re-judgement of whether the fix was worth doing given DoK's HP figure is itself a derived approximation.
That re-judgement is the subject of this audit: **it is worth doing** — the "approximation" objection
applies equally to class and level (both are *also* inferred, not read from a stored byte), yet nobody
proposes leaving those un-derived; Constitution is the one ingredient of the three that IS a real,
un-approximated, byte-faithful value, and it is the one being silently thrown away.

## The real, decoded/derived fact and its existing, shipped sibling consumers

`packages/engine/src/ruleset/addnd1e/abilities.ts:79-99,120-123` — the same PHB-transcribed AD&D-1e
Constitution HP-bonus table M87 already documented in full (non-warriors capped at +2, warriors
extended to +3/+4/+5 at CON 17/18/19). Unchanged since M87; not re-quoted here.

**Sibling consumer #1 — character creation**, `apps/web/src/ui/create.ts:71-83`'s `estimateHp()`:
`Math.max(1, Math.round(level * (avgDie / 2 + 0.5)) + level * con)` — applies the Con bonus **per
level**, since M2.S4d (`228844f`), the project's second numbered phase.

**Sibling consumer #2 — Training Hall level-up**, `apps/web/src/ui/party.ts:1000-1022`'s
`trainMember()` — **fixed by M87.S1**, now current source (`git log --oneline -S "M87.S1" --
apps/web/src/ui/party.ts` → `9dff0bd`, "feat(M87.S1): apply the Training Hall level-up's Constitution
HP bonus", confirmed shipped and merged into `HEAD`, `docs/engine/BUILD-QUEUE.md:4233` marks
`M87.S1` done 2026-07-05):

```ts
// party.ts:1009-1013, current source
const isWarrior = core === 'fighter' || core === 'ranger';
const conBonus = ADND1E_ABILITIES.constitution(s.abilities.con, isWarrior).hp;
const gain = levelHpGain(hitDie(core)) + conBonus;
```

Two of the three "derive this character's HP" sites in this codebase now apply the bonus. The third —
this round's finding — does not.

## Where the severance happens: `sheetFromDokSaved()` never applies the same bonus

`apps/web/src/ui/importDokParty.ts:223-240` (`sheetFromDokSaved`, current source, full):

```ts
function sheetFromDokSaved(sc: DokSavedCharacter, spellIds?: number[], baseAc = sc.baseArmorClass): DokImportCandidate | null {
  const cls = inferDokClass(sc, spellIds);
  const level = inferDokLevel(cls, sc.thac0);
  const hp = level * levelHpGain(hitDie(cls));   // <-- NO Constitution term anywhere in this function
  const req: CharacterRequest = {
    name: sc.name.trim() || 'IMPORTED',
    race: 'human',
    sex: 'male',
    classes: { [cls]: level },
    abilities: clampToRace(sc.abilities, 'human', 'male'),
    deity: cls === 'cleric' ? DEFAULT_DEITY : undefined,
    hp,
    maxHp: hp,
    baseAc,
  };
  const res = createCharacter(req);
  return res.ok ? { sheet: res.sheet, cls, level, hp } : null;
}
```

`grep -n "constitution\|ADND1E_ABILITIES" apps/web/src/ui/importDokParty.ts` → **zero hits, anywhere in
the file** — unlike M87's finding (where `party.ts` already imported `ADND1E_ABILITIES` and used two of
its three methods), this file doesn't import the object at all yet, so this round's fix needs one new
import line in addition to the two-line formula change. `createCharacter()` itself does not add anything
on top: `packages/engine/src/ruleset/addnd1e-dragonlance/character.ts:210-211` passes `req.hp`/
`req.maxHp` straight through into the sheet with no further computation — confirmed by reading the whole
function (`character.ts:106-216`, full) — so whatever the caller computes IS the final number a player
sees on the imported hero's Companion Panel/Character Sheet/combat HP bar.

## Self-flagging evidence — this file's own doc comment names the formula it borrowed, and that formula's own contract

`apps/web/src/ui/importDokParty.ts:36-38` (file-level doc comment, unchanged since the M14.S1 origin
commit):

> "**hp/maxHp**: not stored anywhere in `.GAM`, so this uses `levelHpGain` — the SAME deterministic
> average-hit-die formula `town/services.ts` already uses for in-game level-up HP gain — over the
> derived class/level."

This importer's own doc comment explicitly ties its HP formula to `town/services.ts`'s `levelHpGain()`
— the exact function whose own doc comment (quoted in full in M87, `services.ts:42-49`) says:
"Constitution per-level bonus, **if modelled, is added by the host on top**." By naming itself as a
consumer of that exact function, `sheetFromDokSaved()` implicitly accepts the same "host" contract M87
already established `trainMember()` must honour — and, like `trainMember()` before M87.S1, never does.
This is the same self-flagging chain M87 found, one hop further out: `levelHpGain()`'s doc comment names
the obligation generically ("the host"); this importer's own doc comment identifies itself, by name, as
a second host of that exact same function, reusing the pre-M87 (incomplete) formula almost two months
after `create.ts` had already modelled the fix correctly.

`git log -S "level * levelHpGain(hitDie(cls))" --oneline -- apps/web/src/ui/importDokParty.ts` →
**one hit**, `31dc307` ("web: M14.S1 — DoK -> DQK character carry-over (?import=dok), closing the
trilogy's series feature"), dated 2026-07-03 — i.e. this gap was introduced independently, over a month
after `create.ts` got the Con bonus right (`228844f`), by an author who (per the commit message) knew
they were reusing "the engine's existing level-up healing formula" — the *simple*, pre-M87 half of
`trainMember()`'s formula, not the corrected one, because M87's fix did not exist yet. **M88's finding is
therefore not that M14.S1 was wrong to reuse that formula at the time — it's that M87.S1 fixed the
formula's other consumer two days later and this one was never revisited.**

## Reachable in real, ordinary, shipped play — static + dynamic proof, using the project's own bundled saves

**Static reachability**: `importDokParty()` (`importDokParty.ts:278-362`) is the sole caller of
`sheetFromDokSaved` (`importDokParty.ts:314`), invoked from the `?import=dok` route
(`grep -n "importDokParty" apps/web/src/ui/*.ts` → wired into `main.ts`/`dqkExplore.ts`'s routing, same
pattern as B3's `?import=cok`). It reads the real, bundled
`Death Knights of Krynn/SAVE/CHRDATA{1..6}.GAM`/`.WIZ`/`.JNK` files (`DOK_CHRDATA_PATHS` etc.,
`importDokParty.ts:133-164`) — these are shipped, real game-data files in this repo, not synthetic
fixtures, and this project's own e2e suite (`apps/web/test/e2e.mjs:2340-2462`, `runImportDok`) already
drives this exact path end-to-end in a real browser and asserts on the resulting party (names, class
inference, AC, THAC0, memorized spells, inventory). The `hp` value this round's fix would change is read
by the very same e2e case (`e2e.mjs:2364`, `hpDerived = party.every((p) => typeof p.hp === 'number' &&
p.hp > 0 && p.hp < 200)`) — a loose sanity bound that passes over the wrong number today and would
continue to pass over the corrected, larger number (see below), so **no existing assertion needs to be
flipped**.

**Dynamic re-derivation this round** (scratch vitest file, created, run, then deleted — see below):
decoded all 6 real bundled `CHRDATA{1..6}.GAM`/`.WIZ` files through the actual production
`decodeDokSavedCharacter`/`decodeMonsterWizRecord`/`classVoteFromDokIds`, mirroring
`importDokParty.ts`'s own `inferDokClass`/`inferDokLevel` line-for-line (including the real `.WIZ`
class-vote step, not just the ability-score fallback), then computed both the current (wrong) and
Con-inclusive (correct) HP for each:

```
SIR DRYDEN   cls=fighter   lvl=7 con=17 conBonus/lvl=3 currentHp=42 fixedHp=63 missing=21
LILLITH      cls=fighter   lvl=8 con=18 conBonus/lvl=4 currentHp=48 fixedHp=80 missing=32
TANAR        cls=cleric    lvl=7 con=17 conBonus/lvl=2 currentHp=35 fixedHp=49 missing=14
FLAVIUS      cls=cleric    lvl=7 con=15 conBonus/lvl=1 currentHp=35 fixedHp=42 missing=7
NEACAIL      cls=cleric    lvl=7 con=15 conBonus/lvl=1 currentHp=35 fixedHp=42 missing=7
CELESTE      cls=magicUser lvl=6 con=16 conBonus/lvl=2 currentHp=18 fixedHp=30 missing=12
```

The inferred classes here exactly match the already-shipped, already-asserted e2e results (`dryden` →
fighter, `tanar`/`neacail`/`flavius` → cleric, `celeste` → magicUser — matching `e2e.mjs`'s
`drydenIsFighter`/`tanarIsCleric`/`neacailIsCleric`/`flaviusIsCleric` assertions), confirming this is not
a hypothetical dataset but the exact real save data and exact real inference this importer runs today.
**Every one of the 6 real, bundled pregens is affected** — all 6 have CON 15-18, all comfortably within
the "non-zero Con bonus" band, so **100% of real DoK→DQK imports in this project's own shipped asset
set** under-report HP by a material amount (LILLITH's case, missing 32 of a correct 80 HP, is a 40%
under-count — enough to materially change how she survives DQK's combat).

## Verification evidence (this round's scratch test)

`packages/engine/test/_scratch_m88_verify.test.ts` (created, run — **1/1 passing**, console output
captured above — then deleted; `git status --porcelain` confirmed clean except this doc, both before
and after). Full engine suite re-run with the scratch file present: **135 files / 1360 tests, all green**
(`cd packages/engine && npx vitest run`). Scratch file then deleted; a follow-up `git status --porcelain`
showed a clean tree.

## Proposed minimal wiring plan (not applied this round)

**One new import plus a two-line formula change, entirely inside `sheetFromDokSaved()`:**

```ts
// sketch, not applied this round -- apps/web/src/ui/importDokParty.ts

// add to the existing import block (line ~92-114):
import {
  ...
  ADND1E_ABILITIES,
  ...
} from '@goldbox/engine';

// inside sheetFromDokSaved() (was: const hp = level * levelHpGain(hitDie(cls));):
function sheetFromDokSaved(sc: DokSavedCharacter, spellIds?: number[], baseAc = sc.baseArmorClass): DokImportCandidate | null {
  const cls = inferDokClass(sc, spellIds);
  const level = inferDokLevel(cls, sc.thac0);
  const abilities = clampToRace(sc.abilities, 'human', 'male');   // already computed below today; hoist it up
  const conBonus = ADND1E_ABILITIES.constitution(abilities.con, cls === 'fighter').hp;
  const hp = level * levelHpGain(hitDie(cls)) + level * conBonus;
  const req: CharacterRequest = {
    name: sc.name.trim() || 'IMPORTED',
    race: 'human',
    sex: 'male',
    classes: { [cls]: level },
    abilities,
    deity: cls === 'cleric' ? DEFAULT_DEITY : undefined,
    hp,
    maxHp: hp,
    baseAc,
  };
  const res = createCharacter(req);
  return res.ok ? { sheet: res.sheet, cls, level, hp } : null;
}
```

Notes on the sketch:
- **Use the clamped ability score (`abilities.con`), not the raw `sc.abilities.con`.** The sheet's final
  `abilities` field is the clamped value (`clampToRace(sc.abilities, 'human', 'male')`, already computed
  today, just inline rather than hoisted); computing the Con bonus off the same clamped value keeps the
  bonus internally consistent with what actually ends up on the sheet, in case a future save ever has a
  raw CON above human's 18 cap (none of the current 6 samples do, but the principle matches `trainMember()`
  reading `s.abilities.con` off the sheet's own already-clamped field, not a pre-clamp value).
- **`isWarrior = cls === 'fighter'`** is the correct, complete warrior test for this specific function's
  `CoreClassId` type — unlike `trainMember()`'s post-`coreClass()` value (which can be `'fighter'` or
  `'ranger'`), `sheetFromDokSaved`'s own `CoreClassId` union is restricted to exactly
  `'fighter' | 'thief' | 'cleric' | 'magicUser'` (`importDokParty.ts:120`'s own doc comment: "Knight/
  Ranger need a race/order this data doesn't carry a signal for") — so `'fighter'` is the only warrior
  case that can ever occur here; no `'ranger'` branch is needed or possible.
- No changes needed to `createCharacter()`, `DokImportCandidate`, the party-add loop, or any e2e seam —
  `hp`/`maxHp` flow through exactly as they do today, just with a different (correct) numeric value.
- **No existing test needs to be flipped** — `e2e.mjs`'s only assertion on this value
  (`hpDerived`, line 2364) checks `0 < hp < 200`, which holds both before and after (fixed values top out
  at 80 for LILLITH, still well under 200).
- Update the file's own doc comment (the "hp/maxHp" bullet, `importDokParty.ts:36-38`) to say the
  formula now also adds the per-level Constitution bonus, mirroring the update M87 recommended for
  `trainMember()`'s doc comment.

## Secondary observations not part of this round's fix

- **The `abilities` hoist is a small refactor, not just an addition.** Today `clampToRace(...)` is called
  inline as the `req.abilities` field value; the sketch above hoists it to a local so the Con-bonus
  computation can read the same clamped value without calling `clampToRace` twice. This is a pure
  no-behaviour-change refactor (same function, same arguments, called once instead of twice) but is
  worth calling out explicitly as a secondary edit riding along with the additive fix.
- **This is the last of the three "derive this character's HP" sites** — with this fix, `create.ts`,
  `trainMember()`, and `sheetFromDokSaved()` all apply the identical Con-bonus convention. No fourth
  sibling was found: `importParty.ts` (CoK→DoK, B3) carries HP byte-for-byte from the CoK save and never
  derives it (confirmed by this file's own doc comment, `importDokParty.ts:9-11`: "unlike B3 — which
  carries HP/AC/THAC0/saves byte-for-byte"), so it has no formula to be missing a term from.

## Rejected alternatives considered this round

| Candidate | Why rejected |
|---|---|
| Multi-class HP averaging revisited while touching `trainMember()`/`sheetFromDokSaved()` | Still out of scope — both functions only ever compute a single core class's hit die; a pre-existing simplification this round's fix doesn't touch or worsen (same conclusion M87 reached). |
| `neacailRejected`-test-pattern question (M86) | No new angle found this round; left open. |
| DQK/DoK destination-race hardcode | Reconfirmed UNKNOWN (genuinely undecoded byte), not a wiring gap — `race`/`Race` still has zero decode sites in either saved-character loader. |
| `multiclassLevel` dead-field status | Reconfirmed exactly one grep hit (a comment, `importParty.ts:236`), no new consumer; stays declined. |
| `combat/geometry.ts`'s `canReachWithHeight` | Reconfirmed zero callers anywhere except its own definition/tests; no real consumer, so out of this loop's shape by its own established rule (M85-M87). |
| Folding the `abilities` hoist into a bigger `sheetFromDokSaved` cleanup (e.g. also restructuring the `.JNK`/`.WIZ` fetch flow) | Out of scope and unnecessarily risky — this round's fix is deliberately the smallest change that closes the Con-bonus gap; a larger refactor of the surrounding fetch/inference flow is a different, unrelated task with its own regression surface. |

## Open questions / unknowns

- **Should the file's own summary/UI disclosure text (`town.ts`'s import screen, or wherever
  `DokImportResult.summary[].hp` is rendered) explicitly footnote that HP (like class/level) is
  derived, not read?** The file's own top-of-file doc comment already discloses this in prose ("The
  import summary discloses which fields are derived..."); whether the on-screen table itself should gain
  a visual marker is a UI-polish question outside this round's scope, unchanged from before this fix.
- **Is CON 15-18 representative of the full population of possible DoK saves, or just this project's 6
  bundled samples?** All 6 real, bundled saves happen to have a non-zero Con bonus; a hypothetical
  DoK save with CON ≤ 14 would see `conBonus === 0` and no change from this fix, which is correct
  behaviour (the AD&D-1e table itself grants no HP bonus below CON 15), not a gap.

## Implications for our engine / for the taxonomy

- **A three-sibling gap can be closed in two separate rounds without losing track of the third**, as
  long as the round that fixes sibling #2 explicitly names sibling #3 in its own "Open questions"
  section rather than silently dropping it — M87 doing exactly that is what let this round pick the
  finding up immediately, with no fresh sweep needed. This reinforces a good process habit: when a
  round's fix doesn't cover every structurally-parallel site, explicit written deferral (not silence)
  is what keeps the loop's institutional memory able to close the rest later.
- **The self-flagging chain can span two unrelated files and two commits over a month apart.**
  `levelHpGain()`'s doc comment (`services.ts`, `b2cd1f0`, day one) names a generic "the host" contract;
  `importDokParty.ts`'s doc comment (`31dc307`, over a month later) names itself as a consumer of that
  exact function without ever fulfilling the contract, and does so in a totally different subsystem
  (save-file import vs. town-hub level-up) that a shape-matching grep across files wouldn't obviously
  connect without first reading M87's own finding. Worth periodically checking every named caller of a
  function whose own doc comment states an incomplete-by-design contract ("if modelled, added by the
  host"), not just the caller a previous round already found.
- **"The base number is itself an approximation" is not automatically a reason to defer a fix** — DoK's
  derived class/level/HP are all approximations in the sense that none is read from a stored byte, but
  Constitution is not: it's a real, byte-faithful, already-decoded, already-used-elsewhere-in-the-same-
  function value. The presence of *some* approximation in a pipeline doesn't mean every ingredient of
  that pipeline is equally uncertain — worth distinguishing "this whole computation is inherently
  approximate" from "this one term of an otherwise-approximate computation is actually exact and being
  dropped," which is the finer-grained judgement this round's re-visit made that M87 explicitly deferred.
