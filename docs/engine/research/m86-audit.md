# M86 audit — the next "computed but unwired" candidate

> Audit method: read `m85-audit.md` in full first, per the mandatory first step. Re-checked its three
> unpicked candidates: (1) a full field-by-field `save/character.ts`/`import.ts`/`roster.ts` sweep
> against ovr017/018 — the brief's own "most promising unpicked lead" — (2) `render/sky.ts` never
> reaching `dqkExplore.ts`, (3) whether DQK's status line should show `clockMinutes`. Also grepped
> `m7[6-9]*`/`m8[0-5]*-audit.md` for their own standing-candidate lists (found nothing new not already
> in M85's own carried-forward list) and ran `git show 1551717 --stat` / `git show c67a98d --stat`
> myself to sweep every file in both commits: `combat/deploy.ts` and `audio/soundDispatch.ts` were
> re-confirmed (not re-investigated) to have real production callers per M85's own table;
> `combat/geometry.ts`'s `sortedCombatants`/`steppingPathDistance` are real production-wired (used in
> `tactical.ts`'s `pickTarget()`/`nearest()`/`weakest()`); its sibling `canReachWithHeight` (the
> terrain-height LOS upgrade) has **zero** callers anywhere (`grep -rln "canReachWithHeight"` → only
> its own definition + `index.ts` re-export + its own unit test) — considered as a headline but
> rejected (see "Rejected alternatives") as the same "no real consumer exists yet at all" shape M85
> itself already ruled out of scope for `tickAffects()`.
>
> Picked candidate #1 (the ovr017/18 import sweep) and found a **third, real, structurally-parallel
> save/import host that skips a shipped fixup** — not `save/roster.ts`'s `addPlayer()` composition
> gates (M75 already found and partially fixed that family: duplicate-name is now generic in
> `party.ts`, and the "route `create.ts`/`importDokParty.ts` through the full `addPlayer()` for
> ranger-cap/paladin-evil" option was explicitly, correctly declined by M75 as a bigger, separate
> change — re-confirmed still open, not re-proposed here) — but `save/import.ts`'s
> **`convertImportedCharacter()`/`clampToRace()` ability-range fixup and its 300-platinum arrival
> stipend**, neither of which M75 (or any later round) ever discussed. Grepped every prior audit doc
> for `clampToRace`, `EnforceRaceSexLimits`, `convertImportedCharacter`, `addPlayer(` and the exact
> phrases `"honestly REJECTS"`/`"silently clamping"`/`"fabricating a character"` from the file this
> round's finding centers on — all zero hits except the already-declined `addPlayer()`-reuse family
> M75 started (confirmed genuinely different scope, see below). This is a fresh finding.

## Headline finding

### `importDokParty.ts` (DoK→DQK import) builds every candidate through `createCharacter()`'s raw, un-clamped ability-range check, so a real, byte-decoded DoK save character whose ability lies outside the destination race's legal range is **permanently rejected** — even though this engine's own sibling CoK→DoK import path (`importParty.ts`) already ships the correct fixup (`clampToRace`/`EnforceRaceSexLimits`) for exactly this situation, and the project's own primary decompile source states the *original* `ConvertPoolRadPlayer` mechanism **clamps, not rejects**, at every hop of the trilogy's import chain — "CoK imports Pool/Curse/Hillsfar, DoK imports CoK, DQK imports DoK." The same omission also means DoK→DQK import grants **zero** arrival gold, where CoK→DoK import banks a real 300-platinum stipend.

## The real, decoded fact and its existing, shipped sibling consumer

`packages/engine/src/ruleset/addnd1e-dragonlance/races.ts:122-143` (`clampToRace`, the concrete
transcription of ovr017's `EnforceRaceSexLimits`):

```ts
export function clampToRace(scores: AbilityScores, race: DragonlanceRaceId, sex: Sex = 'male'): AbilityScores {
  const clamp = (v: number, range: AbilityRange) => Math.min(range.max, Math.max(range.min, v));
  const def = DL_RACES[race];
  const str = clamp(scores.str, def.str[sex]);
  const out: AbilityScores = {
    str, int: clamp(scores.int, def.int), wis: clamp(scores.wis, def.wis),
    dex: clamp(scores.dex, def.dex), con: clamp(scores.con, def.con), cha: clamp(scores.cha, def.cha),
  };
  ...
}
```

`packages/engine/src/save/import.ts:46-64` (`convertImportedCharacter`, ovr017's `ConvertPoolRadPlayer`)
applies this, plus a fixed 300-platinum stipend, plus an `animate_dead` spell-book clear, on **every**
cross-game import:

```ts
export function convertImportedCharacter(src: PlayerCharacter): PlayerCharacter {
  const out = cloneCharacter(src);
  out.abilities = clampToRace(src.abilities, src.race, src.sex);   // (1) EnforceRaceSexLimits
  if (ANIMATE_DEAD_SPELL_ID - 1 < out.spellBook.length) out.spellBook[ANIMATE_DEAD_SPELL_ID - 1] = 0;
  out.multiclassLevel = src.hitDice;
  out.platinum = IMPORT_PLATINUM_STIPEND;                          // (4) fixed 300pp stipend
  return out;
}
```

**This project's own primary decompile source is explicit that this is not an invented convenience —
it is the documented original mechanic, and it generalizes across the whole trilogy import chain**,
`docs/engine/research/decompile-ovr017-save-import.md:36-37,105-111`:

> "**Identity:** race, sex, name; six ability scores **each `Load`ed then `EnforceRaceSexLimits`**
> (race/sex stat caps re-applied on import)..."
>
> "## Gen1 ↔ Gen2 — The roster gates, 3-file split, and import-as-field-map are identical across
> CoK/DoK/DQK; only the source/target record offsets drift... **The import chain is generational: CoK
> imports Pool/Curse/Hillsfar, DoK imports CoK, DQK imports DoK** — each a field map across the layout
> drift, not a raw copy."

**The gate is genuinely wired for CoK→DoK import.** `apps/web/src/ui/importParty.ts:234-236` (current
source) builds a `PlayerCharacter`, then runs it through `convertImportedCharacter` before ever adding
it to the roster — and separately banks the resulting stipend:

```ts
const pc = playerCharacterFromSaved(sc, cls, level, slot);
const conv = convertImportedCharacter(pc); // +300pp stipend, clears animate_dead, multiclassLevel, race-cap
...
addGold(conv.platinum * PLATINUM_TO_STEEL); // M23.S1 — actually bank the arrival stipend, not just display it
```

This was itself a same-evening "engine gap → dedicated UI-wiring" pair: `git log -S "EnforceRaceSexLimits"
--oneline -- packages/engine/src/ruleset/addnd1e-dragonlance/races.ts` and `git show 1551717 --stat`
confirm the engine-side fixup landed 2026-06-30 20:29; the **third** same-evening UI-wiring companion
commit, `aefe40a` ("web: wire import-roster gates + combat deploy/sound into UI," 2026-06-30 21:20,
**40 minutes** after `1551717`), is the commit that wired `convertImportedCharacter`+`addPlayer` into
`importParty.ts` specifically (`git show aefe40a --stat` touches only `combat.ts`/`importParty.ts`/
`main.ts`/`render/combatScreen.ts`/its test — never `importDokParty.ts`, which **did not exist yet**:
it was created three days later).

## Where the severance happens: `importDokParty.ts` builds every candidate through `createCharacter()`'s raw ability-range REJECT, never the clamp

`apps/web/src/ui/importDokParty.ts:207-224` (`sheetFromDokSaved`, current source, full):

```ts
function sheetFromDokSaved(sc: DokSavedCharacter, spellIds?: number[], baseAc = sc.baseArmorClass): DokImportCandidate | null {
  const cls = inferDokClass(sc, spellIds);
  const level = inferDokLevel(cls, sc.thac0);
  const hp = level * levelHpGain(hitDie(cls));
  const req: CharacterRequest = {
    name: sc.name.trim() || 'IMPORTED',
    race: 'human',
    sex: 'male',
    classes: { [cls]: level },
    abilities: { ...sc.abilities },        // <-- RAW, unclamped save bytes, never passed through clampToRace
    deity: cls === 'cleric' ? DEFAULT_DEITY : undefined,
    hp, maxHp: hp, baseAc,
  };
  const res = createCharacter(req);
  return res.ok ? { sheet: res.sheet, cls, level, hp } : null;
}
```

`packages/engine/src/ruleset/addnd1e-dragonlance/character.ts:131-138` (`createCharacter`'s ability-range
loop) is a hard **REJECT**, not a clamp:

```ts
for (const key of ABILITY_KEYS) {
  const range = abilityRange(req.race, key, sex);
  const v = req.abilities[key];
  if (v < range.min || v > range.max) {
    errors.push(`${key.toUpperCase()} ${v} out of ${req.race} range ${range.min}-${range.max}`);
  }
}
...
if (errors.length > 0) return { ok: false, errors };
```

`grep -n "addPlayer\|convertImportedCharacter\|clampToRace\|PlayerCharacter\|RosterMember\|PLATINUM_TO_STEEL\|addGold" apps/web/src/ui/importDokParty.ts`
→ **zero hits** for every one of these seven identifiers. The file never imports `save/import.ts`,
`save/roster.ts`, or `clampToRace` at all — confirmed by direct reading of its full `import { ... } from
'@goldbox/engine'` block (`importDokParty.ts:87-106`).

## Real, byte-decoded consequence: NEACAIL (real `CHRDATA5.GAM`, DEX 19) is permanently rejected, where the original engine — and this engine's own CoK sibling — would clamp and admit her

`docs/engine/research/m33-audit.md:38-45` (a from-scratch Python re-decode of all six real, bundled
`Death Knights of Krynn/SAVE/CHRDATA{1..6}.GAM` files) already established: NEACAIL's real saved
abilities are `STR/INT/WIS/DEX/CON/CHA = 15/17/14/19/15/14`. Human DEX range is `r(3, 18)`
(`races.ts:65`). `character.ts:131-138`'s ability-range loop runs **before any class-specific logic**,
so she is rejected **regardless of which class `inferDokClass` picks** — already confirmed and tested
as current behavior (`m33-audit.md:56-68`, and `apps/web/test/e2e.mjs:2364`'s `neacailRejected`
assertion). No prior round investigated *whether this rejection itself is correct* — M33/M34/M61/M66/M67
all treat "Neacail is absent" as a settled precondition for their own (unrelated) findings, never as a
question of its own.

## Was this deliberate? — yes, tested — but the rationale doesn't cite the sibling fixup or the decompile doc, and is factually backwards relative to the original mechanic

This is **not** a silent oversight in the M81/M84/M85 sense — it was consciously written and asserted in
a test, in the very commit that created the file. `apps/web/test/e2e.mjs:2359-2364` (current source):

```js
// NEACAIL's saved DEX is 19 — legal for the save's own record, but past the human race's 3-18
// ability range this ruleset enforces, so `createCharacter` honestly REJECTS her rather than
// silently clamping. Asserting this (not just tolerating it) proves the importer surfaces a
// real validation failure instead of quietly dropping or fabricating a character.
const rejected = await page.evaluate('window.__importDok.rejected()');
const neacailRejected = rejected.includes('NEACAIL') && !names.includes('NEACAIL');
```

`git log -S "honestly REJECTS" --oneline -- apps/web/test/e2e.mjs` → **one commit**, `31dc307` ("web:
M14.S1 — DoK -> DQK character carry-over"), **2026-07-03** — the same commit that created
`importDokParty.ts` in the first place, **three days after** `1551717`/`aefe40a` had already shipped
`clampToRace`/`convertImportedCharacter` and wired them into the CoK sibling. This reads as a
first-principles design call made without cross-referencing the already-shipped sibling mechanism or
`decompile-ovr017-save-import.md`'s own explicit "EnforceRaceSexLimits (race/sex stat caps **re-applied**
on import)" language — the comment's own contrast ("honestly REJECTS... rather than silently clamping...
proves... instead of quietly dropping or fabricating") frames clamping as dishonest fabrication, which is
the **opposite** of what the project's own primary source says the original engine actually does at
this exact step, and the opposite of what this engine's own CoK-import sibling already does one file
over. This is a fresh sub-variant of the recurring shape: not a same-evening pair leaving one
contemporary host untouched (M81/M84/M85's shape), but a **later, freshly-written sibling host that
re-derived its own (decompile-contradicting) policy instead of reusing an already-shipped, already-tested
fixup one file over** — the gap is real and load-bearing, but arrived via a considered-but-unverified
design choice, not pure inattention.

## Second, broader consequence: no arrival stipend at all for DoK→DQK import

Independent of Neacail specifically: `grep -n "stipend\|platinum\|Platinum\|addGold\|PLATINUM_TO_STEEL"
apps/web/src/ui/importDokParty.ts` → **zero hits**. `apps/web/src/ui/main.ts:806-859` (`startImportDok`,
the full UI handler) never mentions gold either. Every CoK→DoK import banks
`IMPORT_PLATINUM_STIPEND (300) * PLATINUM_TO_STEEL (5) = 1500` steel per surviving character
(`importParty.ts:269`); every DoK→DQK import — the trilogy's **closing** hop, per the file's own header
comment ("closing the trilogy's series feature") — grants **none**, for **every** real imported hero,
not just the one ability-range edge case. This is the more broadly reachable half of the finding: it
fires on every ordinary `?import=dok` run with any real save data, not only when a save's ability
happens to exceed the destination race's range.

## Reachable in real, ordinary, shipped play — static + dynamic proof against real bytes

1. **A real player reaches `importDokParty.ts` via the shipped `?import=dok` route**, a real top-level
   navigation entry (`main.ts:608-615`, "⇪ Import DoK party → DQK" sidebar button) — not a hidden debug
   flag.
2. **The six real, bundled `Death Knights of Krynn/SAVE/CHRDATA{1..6}.GAM` files are exactly the data
   this path reads** (`DOK_CHRDATA_PATHS`, `importDokParty.ts:125-132`) — not synthetic fixtures.
3. **Every one of those six imports skips the stipend** (static: `grep` proof above, zero conditional
   gate — unconditionally missing, not merely under-tested).
4. **One of the six (NEACAIL) is dynamically, byte-verifiably rejected outright** by the current pipeline
   — reproduced this round with the real file, not a synthetic one (see "Verification evidence" below).
5. **A minimal, precedent-matching fix would flip that specific outcome** — clamping her real DEX
   19→18 (human's legal max) before calling `createCharacter` lets her pass validation, matching what
   the original ovr017 mechanic — and this engine's own CoK sibling — already do.

## Verification evidence (this round's scratch test)

`packages/engine/test/_scratch_m86_verify.test.ts` (created, run — **3/3 passing** — then deleted;
`git status --porcelain` confirmed clean both before and after, this doc the only untracked file).
Read the **real** `Death Knights of Krynn/SAVE/CHRDATA5.GAM` file from disk (not a fixture) through the
exact production `decodeDokSavedCharacter`/`sniffDokSavedCharacter` functions, then ran the exact
production `createCharacter` call `importDokParty.ts` itself makes:

1. **Real bytes confirm the precondition**: `CHRDATA5.GAM` decodes to `name === 'NEACAIL'`,
   `abilities.dex === 19`.
2. **The real, current production pipeline (raw abilities, unclamped) rejects her**: `createCharacter(req)`
   with her raw abilities returns `{ ok: false }`, with an error string containing `'DEX'`
   (`"DEX 19 out of human range 3-18"`).
3. **Applying `clampToRace` first (the already-shipped CoK-import fixup, unmodified, just called on a
   different input) admits her**: `clampToRace(sc.abilities, 'human', 'male').dex === 18` (clamped, not
   rejected), and `createCharacter` with the clamped abilities returns `{ ok: true }`.

Full `packages/engine` suite: **134 files / 1359 tests** with the scratch file absent (unchanged from
M85's own stated baseline — no regressions, no engine-side changes made this round) and **135 files /
1362 tests** with the scratch file present, both green, via `cd packages/engine && npx vitest run`.
Scratch file then deleted; `git status --porcelain` confirmed the working tree clean except this doc.

## Wiring plan (proposed, not applied this round)

**Two independent, additive slices, both entirely inside `apps/web/src/ui/importDokParty.ts` (plus one
existing e2e assertion that would need a deliberate flip):**

```ts
// sketch, not applied this round — apps/web/src/ui/importDokParty.ts
import { clampToRace, convertImportedCharacter /* if the stipend is also wanted */ } from '@goldbox/engine';

function sheetFromDokSaved(sc: DokSavedCharacter, spellIds?: number[], baseAc = sc.baseArmorClass): DokImportCandidate | null {
  const cls = inferDokClass(sc, spellIds);
  const level = inferDokLevel(cls, sc.thac0);
  const hp = level * levelHpGain(hitDie(cls));
  const abilities = clampToRace(sc.abilities, 'human', 'male'); // NEW — mirrors importParty.ts's precedent
  const req: CharacterRequest = {
    name: sc.name.trim() || 'IMPORTED', race: 'human', sex: 'male',
    classes: { [cls]: level }, abilities, // was: { ...sc.abilities }
    deity: cls === 'cleric' ? DEFAULT_DEITY : undefined,
    hp, maxHp: hp, baseAc,
  };
  const res = createCharacter(req);
  return res.ok ? { sheet: res.sheet, cls, level, hp } : null;
}
```

Plus, in `importDokParty()`'s party-add loop, an `addGold(IMPORT_PLATINUM_STIPEND * PLATINUM_TO_STEEL)`
per surviving character, mirroring `importParty.ts:269`'s exact precedent line.

**This requires a conscious decision the lead session should make, not a silent side effect**: fixing
the clamp flips `apps/web/test/e2e.mjs:2359-2364`'s `neacailRejected` assertion from true to false — the
existing e2e test would need to be rewritten to assert NEACAIL now imports successfully (DEX 18, not 19)
instead of being rejected. This is a real, visible behavior change (one more importable hero), not a
free-riding bugfix, so it should be called out explicitly rather than silently changing the test to make
CI pass.

**This is safe and additive on the stipend half** — no existing test asserts "DoK import grants zero
gold," so adding the stipend has no test to flip, only new coverage to add (a
`window.__importDok`-seam gold-delta assertion, mirroring `importParty.ts`'s equivalent).

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| `combat/geometry.ts`'s `canReachWithHeight` (terrain-height LOS occlusion, ovr032 §1b) as this round's headline | Real, decompile-documented ("byte-faithful upgrade to the simpler... binary-blocker model the tactical engine shipped with," `geometry.ts:1-25`), unit-tested (`combatFormation.test.ts:182-200`), and exported from the public API — but has **zero** callers anywhere in `packages/engine/src` or `apps/web/src` (confirmed: only its own definition, its `index.ts` re-export, and its own test match `canReachWithHeight`). `tactical.ts`'s real, production `clearLineOfFire`/`clearLineOfFireBetween` still use the plain binary `blocksSight` flag this function was explicitly written to replace, and no decoded "wall height" byte data (`BackGroundTiles.field_2`) exists anywhere in this project's loaders to feed a real `HeightField` even if it were wired in. This is the same "no real consumer exists yet at all, not merely a starved one" shape M85 itself already ruled out of scope for `tickAffects()` ("does not qualify under this loop's mandate") — a genuinely different, weaker shape than a validation gate wired for only SOME parallel call sites (here it is wired for NONE). Flagged as a standing candidate only if/when real per-cell wall-height data is ever decoded. |
| `render/sky.ts` never reaching `dqkExplore.ts` (task's candidate #2) | Re-confirmed real (`grep -n "sky\|Sky" apps/web/src/ui/dqkExplore.ts` → zero hits) but this is the exact same root cause M85 already fully investigated and explicitly declined to fold into its own headline ("bundling two separate rendering subsystems... would no longer be minimal," `m85-audit.md`'s rejected-alternatives table) — picking it up unchanged this round would not be a fresh angle, just re-running M85's own already-recorded decision. Left as a standing candidate, not re-argued. |
| Whether DQK's status line should show `clockMinutes` (task's candidate #3) | M85 already left this explicitly open and cosmetic/low-priority; no new information found this round to resolve it either way. Not picked up. |
| `save/roster.ts`'s `addPlayer()` composition gates (paladin-evil/ranger-cap/dup) for `importDokParty.ts`/`create.ts` | This is M75's own already-investigated-and-explicitly-declined "bigger `addPlayer()`-reuse option" ("requires either adding new data (`alignment` doesn't exist on `CharacterSheet` at all)... a larger, more invasive change... presented as an available bigger option, not the recommended slice," `m75-audit.md:337-348`), reconfirmed unpicked by every round since. Re-verified this round that it is genuinely moot for DoK specifically in one respect M75 didn't note: `importDokParty.ts`'s `CoreClassId` type (`'fighter' \| 'thief' \| 'cleric' \| 'magicUser'`) never includes `ranger`/`knight` at all (`importDokParty.ts:110-112`, "Only the 4 classes a save's abilities alone can safely imply"), so the ranger-cap gate specifically could never fire for a real DoK import regardless of wiring — not just under-populated data, but a structurally absent signal. This round's finding (ability-clamp + stipend) is a genuinely different function (`save/import.ts`, not `save/roster.ts`) that M75 never examined at all — confirmed by grep, M75's own text never mentions `clampToRace`/`convertImportedCharacter`/`EnforceRaceSexLimits`/stipend anywhere. |
| Treating this as a rediscovery of M33/M34/M61/M66/M67's Neacail-adjacent findings | Each of those rounds treats "Neacail is absent from the roster" as an already-settled precondition for its OWN unrelated finding (M33: class-vote scope; M34: her gear computation being moot; M61: her absence from a THAC0 table; M66/M67: her gear/baseDamage being moot) — none asks whether the rejection-vs-clamp choice itself is correct, or checks it against `save/import.ts`'s sibling mechanism or the decompile doc. Grepped all five for `clampToRace`/`EnforceRaceSexLimits`/"honestly REJECTS" — zero hits in any of them. |

## Open questions / unknowns

- **Should the fix change `neacailRejected` to assert admission, or should the e2e test simply be
  updated to name a different DEX (e.g. keep asserting SOME rejection exists via a synthetic
  out-of-range fixture) so the "importer surfaces real validation failures" property the original test
  author cared about is preserved for a genuinely-uncorrectable case (e.g., a class-legality failure,
  not an ability-range one)?** Not resolved this round — a design choice for whoever implements the fix.
- **Does DQK's own destination race pool differ from the hardcoded `'human'` this pipeline (and its
  CoK sibling) both assume?** Neither import path derives race from the source save (CoK's `.SAV`/DoK's
  `.GAM` don't store one in a position either loader has pinned) — both hardcode `human`/`male`. This is
  a pre-existing, already-documented gap (not new this round) but means the clamp fix would still be
  clamping against the same (possibly wrong) race assumption CoK's import already lives with.
  **UNKNOWN**, unchanged by this finding.
- **Should `animate_dead`-clearing and `multiclassLevel = hitDice` (the other two `ConvertPoolRadPlayer`
  fixups) also be threaded into DoK→DQK import?** Investigated briefly: DoK import never builds a
  56-slot `spellBook[]` array at all (it uses the structurally different `Memorization` type instead),
  so `animate_dead`-clearing doesn't translate 1:1 without deciding how (crosswalk the DoK spell-id
  equivalent of `animate_dead` and strip it from `Memorization` post-crosswalk?). `multiclassLevel`
  itself has no real consumer: `grep -rn "multiclassLevel" apps/web/src` finds exactly **one** hit,
  `importParty.ts:236`, and that one is a **comment** describing what `convertImportedCharacter` does
  internally, not a read of the field's value — nothing in either import path's `CharacterSheet`/combat
  pipeline ever reads `multiclassLevel` back out. Left as a genuinely separate, smaller follow-on
  question, not folded into this round's two-part recommended fix (clamp + stipend), which are the two
  fixups with a clean, direct translation and an observable consequence today.
- Standing candidates carried forward unchanged (condensed from M85, still open, not re-investigated
  this round): `render/sky.ts` never reaching `dqkExplore.ts` (declined above, same root cause as M85's
  headline) + whether DQK's status line should show `clockMinutes` + the bigger `addPlayer()`-reuse
  option for hand-made/DoK-imported characters' ranger-cap/paladin-evil (M75, now additionally confirmed
  structurally moot for ranger specifically on the DoK side) + `MapCell.doorsOpen`/lock-picking UI
  (M40-42, confirmed this round still moot because `edgeBlocks()` never reads `doorsOpen` for either
  exploration host, so recording it has no consumer either way) + `hasScribed`/`getSpellbook` gating
  Memorize + `TacticalCombatant`'s other five ability scores (no consumer) + `AuthoredMonster`'s Int gap
  (no caller) + `surrendered`'s distinct marker + the guarding-bar 5th signal + the feared/asleep colour
  tier + `panelRows()`/`visibleCells()`'s duplicated `impaired` check + DoK's Saves column + BASE_ITEMS'
  thin catalogue + DoK's xp/hitPoints byte-fields + DoK's runItemPluses e2e follow-up + the Class-label
  collision (43+ rounds unpicked) + dialogue/town day-wiring + `saveStore.ts`'s `listSlots()`/
  `SaveSummary` + `DetectionMatch` fields + flat-AC-10 CoK pregens + the wilderness moon-bar + the
  `DEMO_PARTY` edge case + `WILD_MENU`'s decorative bar + dual-class reactivation + the Con Save/Save
  Roll merge + `DexterityMods.reaction` + the `DokEffect`/`.EFF` crosswalk + CoK's missing `.STF`/`.SFX`
  crosswalk + DRYDEN's Solamnic Plate Mail gap + `create.ts`'s preview-echo gaps + the Status row's
  duration/HD-cap + `itemCategory()`'s INFLICT preview + `MonsterWizSpell.learning` + the `hasted`
  positive-buff indicator + `tickAffects()`'s zero production callers (M85, re-confirmed this round via
  the `canReachWithHeight` rejection above — a second, independent "isolated mechanism, no real caller
  at all" case in the same codebase). Item-instance subsystem still 31-for-31 blocked. ECL-ally morale%
  remains RETIRED (M61).

## Implications for our engine

- **A fourth, distinct sub-shape of "validation gate wired for only some structurally-parallel call
  sites" now has a concrete example that is neither the M81/M84/M85 "same-evening pair" shape nor
  M75's "N callers of one shared mutator, only one pre-validates" shape**: here, the gap is between an
  **already-shipped, already-tested sibling fixup** (`clampToRace`/`convertImportedCharacter`, wired into
  `importParty.ts` by a same-evening commit `aefe40a`) and a **freshly-written, later host**
  (`importDokParty.ts`, built three days afterward) that re-derived its own bespoke policy for the exact
  same situation instead of reusing the existing mechanism one file over — and, notably, **wrote a test
  asserting its own (decompile-contradicting) policy as correct**, which is a stronger form of "not a
  silent gap" than any prior round in this family: the omission was noticed and rationalized, just not
  checked against this project's own primary source or its own sibling code.
- **A deliberate, tested design decision can still be a genuine fidelity gap if its rationale doesn't
  cross-reference the project's own decompile grounding or an already-shipped sibling implementation of
  the identical mechanic.** This is a new lesson distinct from M83's "a rejection's premise can expire
  silently" (there, time passed and a premise became stale; here, the premise was arguably never
  correctly grounded in the first place, in a commit written *after* the correcting evidence already
  existed elsewhere in the same repository).
- **Fixing this kind of gap is not "free" in the way most of this loop's fixes have been**: because the
  current, wrong-per-the-original behavior was deliberately asserted in a passing e2e test, closing the
  gap requires consciously rewriting that assertion, not just adding a new line with zero blast radius —
  a useful discriminator for the lead session's regression-risk triage versus, e.g., M85's `dqkExplore.ts`
  fix (a pure new-field addition with no existing assertion to flip).
- **A "no real consumer at all" rejection (M85's `tickAffects()`) recurred in a second, independent
  place this round (`canReachWithHeight`)** — worth noting as a pattern of its own: this codebase
  appears to periodically ship a decompile-faithful "upgrade" function alongside its predecessor without
  ever swapping production call sites over to it, leaving the old (less faithful) implementation as the
  one actually exercised. Neither is picked up by this loop's mandate (no real consumer), but both are
  worth flagging together as a possible future "adopt the upgrade functions" sweep, distinct from this
  loop's usual "wire a dropped field" shape.
