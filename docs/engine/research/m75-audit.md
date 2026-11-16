# M75 audit — the next "computed but unwired" candidate

> Audit method per the brief: re-read M74's own newly-validated "engine's own public API/dispatch
> layer silently drops a computed fact" method and tried to apply it to other engine subsystems
> first (`Explorer`/`WildernessTravel`, the ECL VM's `EclEffect` union vs. `DialogueRunner`, the
> town/shop economy resolver, `saveGame.ts`'s round-trip). The ECL `PICTURE` (0x0e) effect looked
> promising at first (real, common opcode — confirmed firing dozens of times in real `ECL1_016.txt`
> etc. dumps — but completely absent from `DialogueTurn`, `collectText()`, and every UI consumer of
> `DialogueRunner`), but a grep of every prior round's docs found it was **already identified and
> explicitly, correctly rejected by name in `m37-audit.md:311`** ("needs genuinely new plumbing...
> no `PICx.DAX`-by-id path exists in the dialogue/explore flow today... explicitly NOT a zero-
> plumbing slice") and reconfirmed unchanged in `m38-audit.md:219`. A fresh grep this round
> (`function.*[Pp]ic(ture)?\(|resolvePic|picToDax|loadPicture`) found no such asset-fetch path has
> been added since — the rejection still holds, so it was not re-picked. This sent the search to
> the brief's fallback: a fresh sibling-subsystem sweep on territory not yet mined this session.
>
> **Headline pick:** `packages/engine/src/save/roster.ts`'s `addPlayer()` — the real, COAB-derived
> "ovr018 AddPlayer" roster gate (party-size caps, paladin↔evil conflict, ranger cap, and a
> **duplicate-name** rejection) — is genuinely wired for exactly ONE of apps/web's roster-mutating
> call sites (`importParty.ts`'s CoK→DoK import). The other three real call sites of
> `apps/web/src/ui/party.ts`'s `addToParty()` — manual character creation (`create.ts`, 2 sites),
> DoK→DQK import (`importDokParty.ts`), and the DQK pregen installer (`dqkParty.ts`, inert by
> construction) — bypass the gate entirely and enforce only a flat 6-member cap, **with zero
> name-uniqueness check**, even though `party.ts`'s own doc comment (line 492-493) declares "party
> members are unique by name in practice" as a load-bearing invariant for every one of its
> per-name-keyed persisted stores (XP, spellbook, memorization, inventory, dead-flag, age). Traced
> the real consequence with a scratch test + source reading: two same-named roster members silently
> **alias** each other's XP (`addXp()`'s `getXp(name)+amount` read-modify-write literally sums both
> members' combat awards onto one shared bucket), inventory, memorized spells, age, and dead-status
> — a real, mechanically significant (not just cosmetic) bug, reachable through totally ordinary
> play, since `create.ts`'s own `freshDraft()` resets the name field to the literal default
> `'Adventurer'` after every successful add, so clicking "Add to party" twice without retyping a
> name produces two identically-named characters on the very first try.

## Headline finding

### `addPlayer()`'s duplicate-name roster gate is real, tested, and wired for one add-to-roster path — but three of the four real call sites of `party.ts`'s `addToParty()` bypass it, silently violating the engine's own "unique by name" persistence invariant

**The gate exists, is COAB-derived, and is tested.** `packages/engine/src/save/roster.ts:50-67`
defines the typed rejection reasons and result shape:

```ts
// save/roster.ts:50-67 (current source)
export type AddPlayerReason =
  | 'duplicate'
  | 'party-full'
  | 'roster-full'
  | 'paladin-rejects-evil'
  | 'evil-rejects-paladin'
  | 'too-many-rangers';

export type AddPlayerResult =
  | { ok: true; roster: Roster }
  | { ok: false; reason: AddPlayerReason };
```

`addPlayer()` (`save/roster.ts:85-128`) checks de-dup FIRST, before any of the other four gates:

```ts
// save/roster.ts:85-91 (current source)
export function addPlayer(roster: Roster, candidate: RosterMember): AddPlayerResult {
  const members = roster.members;

  // (1) De-dup: identical name + mod_id is refused.
  if (members.some((m) => m.name === candidate.name && m.modId === candidate.modId)) {
    return { ok: false, reason: 'duplicate' };
  }
  ...
```

This is directly, faithfully transcribed from the COAB oracle (`ovr018.cs` `AddPlayer`,
lines 1431-1580, per the file's own header doc, `save/roster.ts:1-20`) and covered by an existing
engine test, `packages/engine/test/saveImportRoster.test.ts:187-195` ("duplicate: rejects an
identical name + mod_id" / "same name, DIFFERENT mod_id is allowed").

**The gate is genuinely wired for exactly one add-to-roster path.** `apps/web/src/ui/importParty.ts`
(CoK→DoK import) builds a real `RosterMember` per imported character and runs it through
`addPlayer()` before ever calling `addToParty()`:

```ts
// importParty.ts:233-255 (current source, unmodified)
let roster: Roster = { members: [] };
for (const { sheet, sc, cls, level, slot } of sheets) {
  const pc = playerCharacterFromSaved(sc, cls, level, slot);
  const conv = convertImportedCharacter(pc);
  const member: RosterMember = {
    name: conv.name,
    modId: conv.modId,
    controlMorale: conv.controlMorale,
    alignment: conv.alignment,
    paladinLevel: conv.paladinLevel,
    rangerLevel: conv.rangerLevel,
  };
  const gate = addPlayer(roster, member);
  if (!gate.ok) {
    result.rejected.push({ name: member.name, reason: gate.reason, message: REASON_MESSAGE[gate.reason] });
    continue;
  }
  roster = gate.roster;
  if (!addToParty(sheet)) { ... }
  ...
```

and `REASON_MESSAGE` (`importParty.ts:62-69`) maps every `AddPlayerReason` — including `'duplicate'`
— to real on-screen text ("is already in the party"), transcribed from
`docs/engine/research/decompile-ovr017-save-import.md`. This one path is fully, correctly built —
confirmed unchanged from M47's own check (see "Why this wasn't already picked up" below).

**`party.ts`'s own `addToParty()` — the only function every OTHER roster-mutating path calls — has
no such check at all:**

```ts
// apps/web/src/ui/party.ts:324-330 (current source, unmodified)
/** Add a created character; returns false if the party is already full. */
export function addToParty(sheet: CharacterSheet): boolean {
  if (roster.length >= MAX_PARTY) return false;
  roster.push(sheet);
  persist();
  return true;
}
```

Three real call sites go through this function and ONLY this function — never `addPlayer()`:

1. **`create.ts:322`** — `addBtn.addEventListener('click', () => { if (addToParty(result.sheet)) { ... } });`
   (manual character creation's "Add to party" button).
2. **`create.ts:409`** — the headless e2e seam's `add()`: `const r = createCharacter(...); if (r.ok && addToParty(r.sheet)) { ... }`.
3. **`importDokParty.ts:316`** — `if (!addToParty(sheet)) { result.rejectedPartyFull.push(sheet.name); continue; }`
   (DoK→DQK import) — confirmed by reading `importDokParty.ts:1-108` in full: no `addPlayer`/`RosterMember`
   import anywhere in the file (`grep -n "addPlayer\|RosterMember" importDokParty.ts` → zero hits).
4. **`dqkParty.ts:53-60`** (`installDqkParty()`) also calls `addToParty()` directly with no gate —
   but this path is INERT today: its roster is 6 hand-authored, hardcoded, mutually distinct names
   (`STURM`/`CARAMON`/`TANIS`/`GOLDMOON`/`RAISTLIN`/`TASSLEHOFF`, `dqkParty.ts:16-41`), so no real
   collision can occur through this call site as currently written — flagged for completeness, not
   claimed as a live bug.

**Why this is a real, not merely theoretical, bug — traced the actual aliasing mechanism.** Every
one of `party.ts`'s per-character persisted stores is a plain `Record<string /* name */, T>` (or
`Map<string, T>`), keyed on the bare character name, with **no secondary key** (no id, no slot
index) distinguishing two roster entries that happen to share a name:

```
apps/web/src/ui/party.ts:919   xpStore[name]           (XP)
apps/web/src/ui/party.ts:618   spellbookStore[name]    (known spells)
apps/web/src/ui/party.ts:634   memorizeStore[name]     (memorized spells)
apps/web/src/ui/party.ts:828   inventoryStore[sheet.name]  (carried pack)
apps/web/src/ui/party.ts:482-483  deadStore (Set<string>, by name) — permadeath flag
apps/web/src/ui/party.ts:134    ageStore (Map<string, number>, by name), via persistAges()
apps/web/src/ui/party.ts:181    learnQueues (Map<string, LearnQueue>, by name)
```

and several roster-mutating helpers resolve "the member with this name" via a **first-match**
`Array.prototype.find`, which — with two same-named entries — always resolves to whichever one
happens to sit earlier in the array, silently misapplying the operation to the wrong character:

```ts
// party.ts:522-524 (healMember) and :533-535 (reviveMember) — both first-match by name
export function healMember(name: string, amount: number): number {
  const m = roster.find((s) => s.name === name);
  ...
// party.ts:990-991 / :1011-1012 (trainMember / trainingStatus) — same pattern
  const s = roster.find((m) => m.name === name);
```

**The clearest, most concrete manifestation: post-combat XP genuinely accumulates onto one shared
bucket instead of being split.** `awardPartyXp()` (`party.ts:947-961`) computes a real per-member
split (`awardCombatExperience`), then applies each member's share by NAME:

```ts
// party.ts:956-960 (current source)
const perMember = awards
  .map((a, i) => ({ name: roster[i]!.name, awarded: a.awarded }))
  .filter((m) => m.awarded > 0);
for (const m of perMember) addXp(m.name, m.awarded);
```

`addXp()` (`party.ts:927-929`) is a read-modify-write keyed on that same bare name:
`setXp(name, getXp(name) + amount)`. If two roster array entries share a name and BOTH earn a
nonzero award this battle (the ordinary case — both are `inCombat`), the second `addXp()` call's
`getXp(name)` reads back what the FIRST call just wrote a moment earlier in the same loop — so the
two independent awards **sum onto the single shared `xpStore[name]` entry**, and both roster rows
subsequently read back the combined total via `getXp(name)` wherever XP is displayed or spent
(training-hall eligibility, `checkTraining` at `party.ts:996`/`1017`). This is real double-counting,
not a display quirk — confirmed by tracing `addXp`/`awardPartyXp`'s actual read-modify-write order,
not assumed.

**This is easily reachable through completely ordinary play, not a contrived edge case.**
`create.ts`'s `freshDraft()` (`create.ts:108-114`) resets the name field to the literal string
`'Adventurer'` after every successful add:

```ts
// create.ts:108-114 (current source)
function freshDraft(): Draft {
  ...
  return { name: 'Adventurer', race, sex, classes: { fighter: 1 }, abilities, baseAc: 10, shield: false };
}
```

and the name `<input>`'s value is bound straight from `draft.name` on every re-render
(`create.ts:132-135`: `nameInput.value = draft.name`). So a player who creates one default-named
character, clicks "Add to party," and clicks "Add to party" again on a second character **without
first retyping the name field** — an entirely plausible sequence, especially when quickly filling
out a 6-person party by adjusting only class/abilities per slot — ends up with two roster entries
both literally named `"Adventurer"` on the very first attempt, no malicious or unusual input
required.

**Even the one "properly gated" import path (`importParty.ts`) is not fully immune**, for a subtler
reason worth flagging precisely: `addPlayer()`'s de-dup check requires BOTH `name` AND `modId` to
match (`save/roster.ts:89`), and CoK-import assigns a **distinct** `modId = slot + 1` per save slot
(`importParty.ts:165`: `modId: slot + 1, // stable per-slot id so the dedupe gate can't false-collide`)
— so if two of the six `CHRDATA{n}.SAV` slots happen to decode to the same in-game name (a player
naming two hand-rolled CoK characters identically before ever reaching this importer), `addPlayer()`
would NOT flag them as duplicates (their modIds differ by design), and the same name-keyed-store
aliasing described above would still occur once both land in `addToParty()`. This is not this
round's primary fix target (it is a narrower, save-data-dependent edge of the same class of bug),
but it means the "one path already does this right" framing needs a caveat: **the true invariant
this JS engine actually needs — a name is never reused within one live roster, full stop — is
subtly different from COAB's own name+mod_id de-dup rule**, because this reimplementation persists
per-character state in bare-name-keyed dictionaries, a different storage model than the original
binary's (presumably array-slot-indexed) `Player[]` records. Confirmed this framing against the
original: `AddPlayer` is invoked (per its own doc header) for BOTH initial roster assembly and later
NPC recruitment; every character rolled up within one running game shares one running instance's
`mod_id`, so the original engine's OWN dedup would also have caught two identically-named,
freshly-rolled PCs in the same session — meaning a same-name-regardless-of-mod_id guard for
locally-authored characters is not merely a JS-engine-specific workaround, it reproduces the
original's real in-session behaviour; it is only cross-import (a name reused across genuinely
different save files/slots) where COAB's own semantics intentionally allow a repeat name, which
this project's flat name-keyed stores cannot currently represent either way.

## Verification evidence (this round's scratch test)

`packages/engine/test/_scratch_m75_verify.test.ts` (created, run green — **3/3 passing** — then
deleted; `git status --porcelain` confirmed clean before and after, this doc the only untracked
file):

1. **`addPlayer()`'s duplicate gate is real**: built a two-member roster and confirmed a
   same-name/same-modId candidate is rejected with `{ ok: false, reason: 'duplicate' }` — reproducing
   `saveImportRoster.test.ts:187-191`'s own existing assertion, freshly, in this round's own words.
2. **The modId subtlety is real, not assumed**: confirmed a same-name candidate with a DIFFERENT
   modId is accepted (`ok: true`) — proving that a naive fix ("route `create.ts` through `addPlayer()`
   using a fresh/unique modId per call, e.g. an incrementing counter") would be a **false fix**: it
   would not catch the exact "Adventurer"/"Adventurer" collision this round is about, since two
   locally-created characters would each get a distinct synthetic modId under that scheme.
3. **The correct shape of a fix**: confirmed that giving every locally-authored candidate the SAME
   sentinel `modId` (e.g. `0`) makes `addPlayer()` correctly reject a same-named local pair while
   still accepting a same-sentinel-modId pair with different names — the shape a real fix should use
   if it chooses to route through `addPlayer()` rather than a bespoke name-only guard.

Full `packages/engine` suite re-run clean at **135 files / 1356 tests** (1353 baseline — 1351 + M74's
2 new permanent tests — plus this round's 3 scratch tests) via `cd packages/engine && npx vitest run`,
no regressions. Scratch file then deleted; `git status --porcelain` confirmed empty except this doc.

(Note: the actual defect being reported lives in `apps/web/src/ui/party.ts`/`create.ts`/
`importDokParty.ts`, which are not part of the `packages/engine` vitest project — those claims are
verified by direct source reading with exact line citations above, per this loop's precedent in
M46's audit for a UI-layer save/load finding, which combined an engine-level round-trip test with
grep/source-read proof for the UI-side half of the story.)

## Why this wasn't already picked up (grep evidence against every prior round)

- **`addPlayer`/`RosterMember`/`AddPlayerReason`/`modId`** — checked
  `grep -lin "addToParty\|unique by name\|RosterMember\|modId\|addPlayer(" docs/engine/research/m*-audit.md`:
  three hits (`m58-audit.md`, `m66-audit.md`, `m67-audit.md`), none overlapping. `m58-audit.md:121`
  and `m66-audit.md:80,221,271` cite `addToParty()` only incidentally, as the call `importDokParty.ts`
  makes right before threading a DIFFERENT already-computed field (`mem`/`inv`) into the on-screen
  summary/persistence (M58's `Memorization`, M66's worn-gear `Inventory`) — neither round's own text
  discusses `addToParty()`'s lack of a gate, or duplicate names, at all. `m67-audit.md:14,313` cites
  `addToParty()` only as the persistence sink for `importParty.ts`'s byte-faithful stat fields
  (ac/thac0/saves/hp/xp/cls/level) reaching the roster — again, a different question (do computed
  stats reach the sheet?) than this round's (can two sheets alias each other's name-keyed stores?).
- **`save/roster.ts`'s `AddPlayerReason`, specifically** — `m47-audit.md:326` is the single most
  directly relevant prior claim: *"Already fully wired via `importParty.ts`'s `REASON_MESSAGE` map...
  The M35.S1 ECL `ADD_NPC` companion-recruitment path does NOT go through `addPlayer`'s roster gates
  at all (by design — those are combat-only allies, not persistent roster members)... so there is no
  second call site to check."* Per CLAUDE.md discipline #3/#4, re-verified this claim against actual
  current code rather than trusting the sentence: M47's own text is narrowly, correctly scoped to the
  ECL `ADD_NPC` combat-ally path (`explore.ts`'s companion recruitment, a genuinely different, correctly
  out-of-scope mechanic) — it never examined, mentions, or grep-checked `create.ts`'s or
  `importDokParty.ts`'s calls to `addToParty()` at all. **M47's closing clause "no second call site to
  check" was true only for the ONE alternative call site it had gone looking for (ECL `ADD_NPC`); it
  was not a claim that every other roster-mutating call site had been enumerated** — confirmed by
  `grep -n "addToParty\|create.ts\|importDokParty" m47-audit.md` finding zero mentions of either file.
  This round's contribution is finding the genuinely unexamined call sites, not re-litigating the one
  M47 already correctly closed.
- **`'party members are unique by name in practice'` (the exact doc-comment string)** — `grep -rn`
  across every `m*-audit.md` for this phrase and for `"unique by name"` returns zero hits anywhere;
  no prior round has quoted or examined this comment.
- **Duplicate-name / name-collision as a mechanic** — `grep -lin "duplicate name\|same name\|name
  collision" docs/engine/research/m*-audit.md` returns only `m28-audit.md` and `m29-audit.md`, both
  confirmed (by reading the matched lines) to be unrelated uses of the phrase "same name" in an
  entirely different context (monster-record naming coincidences / a same-named different mechanic
  caution), not the roster de-dup question.

## Wiring plan

**This is a UI-layer fix (`apps/web/src/ui/party.ts` and, optionally, `create.ts`), not an
engine-side change** — `packages/engine/src/save/roster.ts`'s `addPlayer()` gate is already correct
and complete; nothing in `packages/engine/src` needs to change. Flagging this clearly per the round
brief: the defect and the fix both live in apps/web, so the lead session's regression bar is the
`apps/web` build/e2e path, not `packages/engine`'s test suite (already re-confirmed green above,
unaffected either way since no engine file changes).

**Recommended minimal fix (small, additive, one call site, protects all four real callers for
free):** add a same-name guard directly inside `party.ts`'s `addToParty()` — the single function
every real add-to-roster path already funnels through:

```ts
// apps/web/src/ui/party.ts — sketch, not applied this round
export function addToParty(sheet: CharacterSheet): boolean {
  if (roster.length >= MAX_PARTY) return false;
  if (roster.some((m) => m.name === sheet.name)) return false; // NEW — protects every name-keyed store
  roster.push(sheet);
  persist();
  return true;
}
```

This is fully backward-compatible (still returns `boolean`, so all five existing call sites —
`create.ts:322,409`, `dqkParty.ts:59`, `importParty.ts:251`, `importDokParty.ts:316` — need zero
changes to keep compiling and behaving correctly for the non-collision case) and immediately closes
the real aliasing bug traced above for every current and future caller, including the
`importParty.ts` edge case described above (two same-named `.SAV` slots would now be caught by this
guard even though `addPlayer()`'s own modId-qualified check would not catch it).

**Optional follow-on (a real UX improvement, not required for the core fix):** surface *why* an add
was rejected. Today `addToParty()`'s `false` return isn't even shown to the player in `create.ts`
(the "Add to party" button is only ever pre-disabled for the full-party case, `create.ts:320`; a
duplicate-name rejection would currently fail completely silently — the click would just do
nothing, which is confusing). A slightly richer follow-on could widen `addToParty`'s return to
`{ ok: boolean; reason?: 'party-full' | 'duplicate' }` (or add a sibling `addToPartyReason()` so the
boolean-returning call sites keep working unchanged) and have `create.ts` show a message reusing the
same tone as `importParty.ts`'s existing `REASON_MESSAGE['duplicate']` ("is already in the party").
Left as a separate, smaller follow-on since it touches more UI surface than the core data-integrity
fix and is a design choice (exact message wording, whether to auto-suggest a disambiguated name)
best left to the lead session.

**Explicitly NOT recommended as this round's fix (a bigger, riskier option, noted for completeness):**
routing `create.ts`/`importDokParty.ts` through the full `addPlayer()` gate (bringing in the
ranger-cap and paladin/evil checks too) by synthesizing a `RosterMember` per `CharacterSheet` with a
sentinel `modId` and defaulted `alignment: 0`/`paladinLevel: 0` (mirroring `playerCharacterFromSaved()`'s
own precedent, `importParty.ts:139-166`). This IS a defensible, faithful-to-COAB option — and would
additionally enforce the "at most 3 rangers" cap for hand-made parties, which is unenforced today for
the exact same reason (verified: `CharacterSheet` has no `alignment` field at all, so a paladin/evil
check for hand-made characters cannot be implemented without adding new state; the ranger cap COULD
be derived from `classes.ranger`, since that data does exist) — but it is a larger, more invasive
change (new data plumbing decisions, more call sites touched, a design call on the sentinel `modId`
value) than the core bug this round found, so it is presented as an available bigger option, not the
recommended slice.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| ECL `PICTURE`/`CLEAR_BOX`/`SPRITE_OFF` effects reaching `DialogueTurn` | Already identified and explicitly, correctly rejected by `m37-audit.md:311` ("needs genuinely new plumbing... no `PICx.DAX`-by-id path exists... explicitly NOT a zero-plumbing slice") and reconfirmed unchanged by `m38-audit.md:219`. Fresh grep this round found no new asset-fetch path has been added since (`function.*[Pp]ic(ture)?\(|resolvePic|picToDax|loadPicture` → zero hits in `apps/web/src`), so the scope-blocking reason still holds; not re-picked without new information, per discipline #1. |
| `EclVm`'s own `run()`/`resume()`/`step()` return-value plumbing (M74's exact pattern, applied to the ECL VM instead of `TacticalCombat`) | Read `vm.ts` in full: every `run()`/`resume()` call clears `this.effects` at entry and returns the FULL accumulated `effects` array for that call (`vm.ts:264-267`, `:277-288`) — there is no internal `log`-vs-return-value split the way `tactical.ts`'s `beginRound()`/`apply()` had. `DialogueRunner.translate()` (`dialogue.ts:102-120`) receives the complete `EclRunResult.effects` every time; its `collectText`/`lastPrompt`/`lastCombat` helpers choose NOT to surface `picture`/`clearBox`/`spriteOff`/`partyStrength`/`who`/`addNpc`/`loadFiles`/`loadPieces`/`unhandled` into `DialogueTurn`'s shape, which is the M37-already-flagged UI-surface gap above, not a fresh M74-style dispatch-drop. No new finding here. |
| Town/shop economy resolver (`shop.ts`, `services.ts`) for an M74-style dropped-log pattern | Read both files in full: no internal accumulating log exists at all; every function is a pure, stateless calculator returning its full result directly. `checkTraining`/`trainingStatus`/`trainMember` were traced end-to-end into `town.ts` and found fully wired (`town.ts:140-151` renders every field; `party.ts:990-1008`/`1011-1019` thread every `TrainingCheck` field through). No gap. |
| `saveGame.ts` round-trip (`makeSave`/`serializeSave`/`deserializeSave`/`summarizeSave`) for a fresh field-drop | Read the whole file (188 lines): every `SaveGame` field is threaded through `makeSave` end-to-end; `summarizeSave` deliberately narrows to a 4-field summary (`name`/`members`/`area`/`savedAt`) for a slot-picker UI — but `saveStore.ts`'s `listSlots()`/`SaveSummary` (the consumer this would feed) is already a standing, explicitly-gated candidate (M46-M74's backlog: "gated on a multi-slot UI existing," re-confirmed as recently as M55 and still true — no multi-slot save/load UI exists in `apps/web/src` today). Not re-opened without new information, per the standing-candidate discipline. |
| `Explorer`/`WildernessTravel` for a fresh (non-M72) dispatch-drop | Skimmed `explorer.ts`/`wilderness.ts` for an M74-shaped "internal log richer than the public method's return" pattern; found no accumulating internal log/event array in either module — `Explorer`'s step methods return their full `StepResult` directly, no M74-style truncation point. Not pursued further given the stronger roster-gate finding above. |
| Fixing the ranger-cap/paladin-evil gates for hand-made characters in the same pass | Investigated (see Wiring plan) — real, but requires either adding new data (`alignment` doesn't exist on `CharacterSheet` at all) or accepting a bigger, more invasive `addPlayer()`-reuse change than the core duplicate-name fix. Presented as an available bigger option, not this round's recommended slice. |

## Open questions / unknowns

- **Should the name-collision check be case-sensitive or case-folded?** The persisted stores are
  exact-string JS object/Map keys, so an exact-match guard (as sketched above) fully closes the
  aliasing bug even without case-folding — but a player naming two characters `"Bob"` and `"BOB"`
  would still get two visually-distinct-but-confusable roster rows (not a data-aliasing bug, just a
  UX one). **UNKNOWN / a judgment call**, not resolved this round.
- **Whether `addToParty()`'s return value should be widened to carry a reason** (the optional
  follow-on above) or whether a same-boolean fix is sufficient for now. Left to the lead session —
  the core data-integrity fix does not require it.
- **Whether the bigger `addPlayer()`-reuse option (ranger cap + paladin/evil for hand-made
  characters) is worth pursuing as a follow-up round**, and if so, what sentinel `modId` value to
  standardize on for "no known mod source" candidates (this round's scratch test used `0`, but that
  is a placeholder choice, not verified against any COAB convention for locally-authored characters
  specifically — `save/character.ts`'s own `blankCharacter()` defaults `modId: 0`, `character.ts:188`,
  which is at least consistent, but not independently confirmed as COAB's own real sentinel value).
  **UNKNOWN**, flagged for a future round if pursued.
- **Whether a real player has ever actually hit this in this project's own e2e suite** — not
  checked this round (no existing e2e test creates two identically-named characters); if the lead
  session implements the fix, a regression test (either an engine-adjacent unit test against
  `party.ts`'s logic if testable in isolation, or a new e2e case) would be the natural verification,
  per this loop's usual "prove the fix closes the gap the round measured" pattern.
- **The `importParty.ts` "same name, different save slot" edge case** (documented in the headline
  finding) is real but narrower — it requires two of the six CoK `.SAV` slots to independently decode
  to the same name, which depends on save data this project's own fixture set may or may not exercise
  ­— not verified against the actual `CHRDATA{1-6}.SAV` fixture names this round (a quick follow-up
  check, not done: are any two of the six real fixture names identical? Almost certainly not, since
  they are the canonical CoK pregens — but not independently re-confirmed here).
- Standing candidates carried forward unchanged (not re-investigated this round, no new angle):
  `applyFlee`'s own independent test coverage (M74), the `backstab`-on-miss engine gap (M73/M74),
  M72's un-walled dungeon-edge / `TryStepForward` rules-fidelity question, the `surrendered` marker,
  the guarding-bar 5th signal, `TacticalCombatant.int`, the feared/asleep colour tier,
  `panelRows()`/`visibleCells()`'s duplicated `impaired` check, the Abilities-panel precedent, DoK's
  Saves column, BASE_ITEMS' thin catalogue, DoK's xp/hitPoints byte-fields, DoK's runItemPluses e2e,
  the Class-label collision, dialogue/town day-wiring, `saveStore.ts`'s `listSlots()`/`SaveSummary`
  (re-confirmed still gated above), `DetectionMatch` fields, flat-AC-10 CoK pregens, the wilderness
  moon-bar, the `DEMO_PARTY` edge case, `WILD_MENU`'s decorative bar, dual-class reactivation, the Con
  Save/Save Roll merge, `conSaveBonus` on DoK monsters, `DexterityMods.reaction`, the `DokEffect`/.EFF
  crosswalk, CoK's missing `.STF`/`.SFX` crosswalk, DRYDEN's Solamnic Plate Mail gap, `create.ts`'s
  preview-echo gaps, the Status row's duration/HD-cap, `itemCategory()`'s INFLICT preview,
  `MonsterWizSpell.learning`, and the `hasted` buff indicator. Item-instance subsystem still 31-for-31
  blocked. ECL-ally morale% remains RETIRED (M61).

## Implications for our engine

- **A fifth scope for "computed but unwired" now has a validated example: a real, well-tested
  engine-layer validation/gate function can be faithfully wired for ONE of several structurally
  parallel call sites that all perform "the same kind of add," while the others silently bypass it
  — not because the gate is wrong, but because only one call site's author reached for it.** This is
  M72's "sibling subsystem" pattern one level more specific: not two subsystems computing the SAME
  kind of result differently, but N call sites of one shared mutator function, where only one caller
  additionally pre-validates through the real gate before calling it.
- **A prior round's closing sentence ("no second call site to check") can be true only for the
  specific alternative it went looking for, while other, unexamined call sites of the very same
  underlying function remain silently unguarded.** M47 correctly closed the ECL `ADD_NPC` question;
  its phrasing did not claim (and should not have been read as claiming) that every call site of
  `addPlayer`/`addToParty` had been enumerated. Reinforces discipline #4's spirit one step further:
  even a correctly-reasoned rejection can have a scope boundary worth re-checking when a NEW call
  site is later added or noticed, not just when a NEW field is proposed.
- **A validation gate designed to faithfully reproduce an original game's rule (COAB's `name`+`mod_id`
  de-dup) can be subtly WRONG for a reimplementation whose storage model differs from the original's**
  — this project persists per-character state in bare-name-keyed JS dictionaries, not the original's
  presumed array-slot-indexed records, so the invariant this engine actually needs (name uniqueness,
  full stop, within one live roster) is stricter than the literal original rule (name+mod_id) in
  exactly the cross-import edge case identified above. Worth remembering for any future gate that is
  reused verbatim from a decompiled oracle: check not just "is this faithful to the original" but
  "does this actually protect the invariant THIS engine's own reimplementation depends on."
- **A load-bearing invariant stated only in a doc comment ("party members are unique by name in
  practice") is not self-enforcing** — as with M46's finding about `SaveGame.name` and M74's about
  `apply()`'s return value, a comment describing an assumption is not evidence the assumption is
  checked anywhere; it should be treated as a candidate to verify, not a settled fact, especially when
  (as here) multiple structurally similar call sites exist and only one was ever checked.
