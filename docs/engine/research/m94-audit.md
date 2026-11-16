# M94 audit — Character Creation's "Add to party" bypasses the real `AddPlayer` ranger-cap gate its own sibling menu item (save import) already enforces

> Audit method: read `docs/engine/research/m93-audit.md` in full first per the brief's mandatory first
> step, then grepped every prior `docs/engine/research/m*-audit.md` (m1-m93) for this round's eventual
> candidate strings (`addPlayer`, `too-many-rangers`, `ROSTER_MAX`, `AddPlayerReason`,
> `paladin-rejects-evil`, `isRanger`, `RosterMember`, `KNIGHT_ORDER_MINIMUMS`, `petitionableOrder`,
> `classFlags`, `IDENTIFY_COST_STEEL`, `cursed`) per discipline #1 before finalizing. Confirmed the
> Knight-of-Solamnia order-petition system the brief flagged as "may be worth a look" is **already fully
> wired and re-confirmed closed three separate times** (M26, M66, M72 — see "Rejected alternatives");
> confirmed the item-identify/cursed-item subsystem is a **long-exhausted, repeatedly-rejected "would need
> a wholly new mechanic" dead end** (M19/M24/M26/M66/M68); confirmed `classFlags.ts`'s dual-class
> item-gating is **correctly dead code** (no dual-classing consumer exists, re-confirmed M17-M85). A
> systematic zero-consumer sweep of every named export of `packages/engine/src/index.ts` against
> `apps/web/src` turned up `save/roster.ts`'s `addPlayer()` family (`isRanger`/`isPaladin`/`RosterMember`)
> as a promising lead — which a fuller grep then revealed is **not a fresh discovery**: it is M75's own
> 18-round-old, explicitly-named, explicitly-declined "bigger `addPlayer()`-reuse option," carried forward
> unpicked in every single round's standing-candidate list from M76 through M93 inclusive. Per this
> loop's own stated preference for "a prior round's own explicit, well-specified deferral" over a fresh
> speculative sweep, and per the M88 taxonomy shape ("a later round picks up a deferred sibling
> directly"), this round finishes the verification M75 started, narrows the scope to the one call site
> where it is actually clean and reachable today, and closes 18 rounds of carried-forward deferral.

## Headline finding

**`apps/web/src/ui/create.ts` — Champions of Krynn's real, shipped "Create New Character" /
"Add to party" flow, reachable directly from the game's own byte-verified main menu — never calls
`addPlayer()`, the real, COAB-derived, binary-string-verified `ovr018.cs` `AddPlayer` roster-composition
gate that its own sibling menu item, "Add Character to Party" (`importCokParty()`), already calls one
function away.** The practical, currently-reachable consequence: **the "at most 2 rangers" cap
(`ranger_count < 3` in the original, `too-many-rangers` in this engine) is completely unenforced for
every hand-created character**, even though the exact same gate, with the exact same message text
("too many rangers in party" — verified byte-for-byte against the original binary at address
`0x2397a`), already correctly refuses a 3rd-plus ranger arriving via save import on the very same menu
screen. A player using CoK's own "Create New Character" command can build and add a 4th, 5th, 6th
Ranger to a live party with zero refusal of any kind.

## Existing sibling/precedent and the self-flagging evidence

This is **not a new candidate** — it is the direct continuation of a finding M75 made, characterized in
full, and *deliberately, explicitly* declined as "a bigger, riskier option... not the recommended slice"
18 rounds ago, then carried forward, unpicked, in every single round's "standing candidates" list since
(M76, M78, M79, M80, M81, M82, M83, M84, M85, M86 all cite "the bigger `addPlayer()`-reuse option" by
name; M86 additionally re-verified one sub-detail — see below). M75's own words
(`m75-audit.md:337-348`, quoted in full since this round's fix rests entirely on it):

> "**Explicitly NOT recommended as this round's fix (a bigger, riskier option, noted for
> completeness):** routing `create.ts`/`importDokParty.ts` through the full `addPlayer()` gate (bringing
> in the ranger-cap and paladin/evil checks too) by synthesizing a `RosterMember` per `CharacterSheet`
> with a sentinel `modId` and defaulted `alignment: 0`/`paladinLevel: 0` (mirroring
> `playerCharacterFromSaved()`'s own precedent)... This IS a defensible, faithful-to-COAB option — and
> would additionally enforce the 'at most 3 rangers' cap for hand-made parties, which is unenforced
> today for the exact same reason (verified: `CharacterSheet` has no `alignment` field at all, so a
> paladin/evil check for hand-made characters cannot be implemented without adding new state; the
> ranger cap COULD be derived from `classes.ranger`, since that data does exist) — but it is a larger,
> more invasive change... than the core bug this round found, so it is presented as an available bigger
> option, not the recommended slice."

M75 fixed a different (and, at the time, correctly higher-priority) bug in the same function: two
same-named hand-made characters silently aliasing every one of `party.ts`'s name-keyed persisted stores
(XP, spellbook, inventory, dead-flag, age). That fix (a bare name-uniqueness guard inside `addToParty()`
itself) shipped and is still live today (`party.ts:338`, see below) — it is **not** what this round
re-examines; the ranger-cap/paladin-evil piece is the specific, named, still-open remainder.

**M86 independently re-verified and *narrowed* the option's scope** (`m86-audit.md:280`, quoted): DoK's
own import path (`importDokParty.ts`) structurally **cannot** produce a `ranger`-class character at all
— its `CoreClassId` type is `'fighter' | 'thief' | 'cleric' | 'magicUser'` only, by design ("Only the 4
classes a save's abilities alone can safely imply — Knight/Ranger need a race/order this data doesn't
carry a signal for," `importDokParty.ts:121-122`) — so "the ranger-cap gate specifically could never
fire for a real DoK import regardless of wiring." This round independently re-confirmed that same fact
by re-reading the current `importDokParty.ts` in full (unchanged since M86), and used it to **narrow**
this round's fix to the one call site where the gap is concretely, currently reachable: `create.ts`.

## Where the severance happens — exact locations, current source

**`packages/engine/src/save/roster.ts:85-128`** (`addPlayer`, unchanged since M75/M93, current source,
the full gate):

```ts
export function addPlayer(roster: Roster, candidate: RosterMember): AddPlayerResult {
  const members = roster.members;
  if (members.some((m) => m.name === candidate.name && m.modId === candidate.modId)) {
    return { ok: false, reason: 'duplicate' };
  }
  let pcCount = 0, rangerCount = 0, evilPresent = false, paladinPresent = false;
  for (const m of members) {
    if (isPlayerCharacter(m)) pcCount++;
    if (isRanger(m)) rangerCount++;
    if (isEvilAlignment(m.alignment)) evilPresent = true;
    if (isPaladin(m)) paladinPresent = true;
  }
  if (isPlayerCharacter(candidate)) {
    if (pcCount >= ROSTER_MAX_PCS) return { ok: false, reason: 'party-full' };
  } else if (members.length >= ROSTER_MAX_TOTAL) {
    return { ok: false, reason: 'roster-full' };
  }
  if (isPaladin(candidate) && evilPresent) return { ok: false, reason: 'paladin-rejects-evil' };
  if (isRanger(candidate) && rangerCount >= 3) return { ok: false, reason: 'too-many-rangers' };
  if (isEvilAlignment(candidate.alignment) && paladinPresent) return { ok: false, reason: 'evil-rejects-paladin' };
  return { ok: true, roster: { members: [...members, candidate] } };
}
```

**The one real, wired consumer — `apps/web/src/ui/importParty.ts:233-255`** (CoK save import, current
source, unchanged since M75/M93):

```ts
let roster: Roster = { members: [] };
for (const { sheet, sc, cls, level, slot } of sheets) {
  const pc = playerCharacterFromSaved(sc, cls, level, slot);
  const conv = convertImportedCharacter(pc);
  const member: RosterMember = {
    name: conv.name, modId: conv.modId, controlMorale: conv.controlMorale,
    alignment: conv.alignment, paladinLevel: conv.paladinLevel, rangerLevel: conv.rangerLevel,
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

with `REASON_MESSAGE['too-many-rangers'] === 'too many rangers in party'` (`importParty.ts:68`) — the
exact string byte-verified against the real CoK binary at `0x2397a` (per the `aefe40a` commit message
and `decompile-ovr017-save-import.md:64,75`).

**The severed sibling — `apps/web/src/ui/create.ts`** never imports `addPlayer`, `RosterMember`,
`isRanger`, or `AddPlayerReason` at all (`grep -n "addPlayer\|RosterMember\|isRanger" create.ts` → zero
hits). Both of its real "add a hand-made character to the roster" call sites go straight to
`addToParty()`:

```ts
// create.ts:321-323 (current source) — the real on-screen "Add to party" button
addBtn.addEventListener('click', () => {
  if (addToParty(result.sheet)) { draft = freshDraft(); rerender(); }
});

// create.ts:409 (current source) — the headless e2e seam, same real code path
add: () => { const r = createCharacter(draftToRequest(draft)); if (r.ok && addToParty(r.sheet)) { draft = freshDraft(); rerender(); return true; } return false; },
```

**`apps/web/src/ui/party.ts:336-342`** (`addToParty`, current source — this is M75's OWN fix, the name
guard it added, still live; note what it still does *not* check):

```ts
export function addToParty(sheet: CharacterSheet): boolean {
  if (roster.length >= MAX_PARTY) return false;
  if (roster.some((m) => m.name === sheet.name)) return false;   // M75's fix — still here, unrelated to this round
  roster.push(sheet);
  persist();
  return true;
}
```

No `isRanger`/`rangerLevel`/`addPlayer` check anywhere in this function — a party of 6 distinctly-named
Rangers passes both of `addToParty()`'s own guards cleanly.

## Reachable in real, ordinary, shipped play — static + dynamic proof

**Static reachability, the full real chain.** `apps/web/src/ui/mainMenu.ts` is CoK's own byte-verified
main menu (imports `COK_MAIN_MENU`/`composeMainMenu`, the 10-option command list the original engine
shows after the title screen). Its `activate()` handler (`mainMenu.ts:104-108`) routes the
**"Create New Character"** command straight to `startCreate()` (`create.ts`) — literally the option
immediately above **"Add Character to Party"**, which routes to `importCokParty()` (the gated path).
Both are ordinary, front-door, no-dev-console menu commands on the same screen. `classesForRace('human')`
includes `'ranger'` (`classes.ts:34`, cap level 7) — an entirely legal, creatable class/race pair with
no ability-score minimum enforced by `createCharacter()` beyond the racial min/max range (confirmed by
re-reading `character.ts:106-160` in full — no ranger-specific STR/DEX/WIS floor exists in this engine's
validation). So: from the real main menu, "Create New Character" → pick Human, Ranger, any legal ability
spread, any unique name → "Add to party" → repeat 3 more times with distinct names → **all 4+ Rangers
join with zero refusal.** No save-editing, no dev console, no illegal state — the exact same "ordinary,
extended play" bar this loop's prior Training-Hall findings (M92/M93) used.

**Dynamic re-derivation this round** (scratch vitest file, created, run — **3/3 passing** — then
deleted; `git status --porcelain` confirmed clean before and after, this doc the only new file), against
the real, current, unmodified `addPlayer`/`createCharacter` production functions imported directly from
`packages/engine/src`:

```
// (1) A real, legal, createCharacter()-validated level-7 human Ranger sheet exists:
createCharacter({ name: 'RANGER1', race: 'human', classes: { ranger: 7 }, ... }).ok === true

// (2) addPlayer() — the real, already-wired-at-importParty.ts gate — refuses the 4th ranger:
addPlayer(roster, {name:'R1', rangerLevel:7, ...}) -> ok:true
addPlayer(roster, {name:'R2', rangerLevel:7, ...}) -> ok:true
addPlayer(roster, {name:'R3', rangerLevel:7, ...}) -> ok:true
addPlayer(roster, {name:'R4', rangerLevel:7, ...}) -> ok:false, reason:'too-many-rangers'

// (3) A naive loop replicating create.ts's ACTUAL addToParty() logic verbatim (party.ts:336-342 —
//     MAX_PARTY cap + name-uniqueness only, no addPlayer call) accepts all 6:
['R1','R2','R3','R4','R5','R6'].filter(nameUniqueAndUnderCap) === ['R1','R2','R3','R4','R5','R6']
// -> no wall at the 4th ranger, where the real gate (2) already proves one should exist.
```

(1) proves the character is legally creatable through the real, unmodified validator; (2) proves the
real, already-shipped gate would correctly refuse a 4th ranger if consulted; (3) proves `create.ts`'s
actual, current mutation path — copied verbatim, not paraphrased — never consults it. All three run
against the real production `addPlayer`/`createCharacter` exports, no fixtures or mocks.

## Proposed minimal wiring plan (not applied this round — audit scope is research only)

Scoped to exactly the one call site this round confirmed is both reachable and safe: `create.ts` only
(CoK/DoK's shared Gen1 character-creation screen — confirmed reachable only from `main.ts`/`mainMenu.ts`,
never from `dqkExplore.ts`, the same Gen1-only scope boundary M92 already established for this same
file). **Not** `importDokParty.ts` (M86 already confirmed the ranger cap is structurally unreachable
there — its class inference can never produce `'ranger'`) and **not** `dqkParty.ts` (Gen2, and its
`DQK_HEROES` pregen roster has zero rangers today — no reachable consequence either way).

```ts
// sketch, not applied this round -- apps/web/src/ui/create.ts

import { addPlayer, type Roster, type RosterMember, type AddPlayerReason } from '@goldbox/engine';

// The same defaults importParty.ts's playerCharacterFromSaved() already documents and uses for the
// fields a hand-made CharacterSheet structurally cannot carry (no alignment/paladinLevel field exists
// on CharacterSheet or Draft at all) -- and the same sentinel modId convention M75's own verification
// already proved correct (character.ts's blankCharacter() already defaults modId: 0; giving every
// locally-authored candidate the SAME sentinel modId means addPlayer()'s de-dup rule still correctly
// rejects two same-named local candidates, redundantly with addToParty()'s own M75 guard, never in
// conflict with it).
function toRosterMember(sheet: CharacterSheet): RosterMember {
  return {
    name: sheet.name,
    modId: 0,                              // sentinel: "locally authored," mirrors blankCharacter()
    controlMorale: 0,                       // hand-made characters are always PCs
    alignment: 0,                           // CharacterSheet has no alignment field -- documented gap
    paladinLevel: 0,                        // this engine's Dragonlance model has no Paladin class
    rangerLevel: sheet.classes.ranger ?? 0, // the one field that DOES exist and DOES matter
  };
}

function currentRoster(): Roster {
  return { members: getParty().map(toRosterMember) };
}

// Reused from importParty.ts's own REASON_MESSAGE (or imported from a shared module) so a gated
// character reads with the same, already-binary-verified wording.
addBtn.addEventListener('click', () => {
  const gate = addPlayer(currentRoster(), toRosterMember(result.sheet));
  if (!gate.ok) {
    panel.appendChild(el('div', 'note small error', REASON_MESSAGE[gate.reason])); // e.g. "too many rangers in party"
    return;
  }
  if (addToParty(result.sheet)) { draft = freshDraft(); rerender(); }
});

// same gate added to the e2e seam's add(), so the headless harness exercises the identical real path:
add: () => {
  const r = createCharacter(draftToRequest(draft));
  if (!r.ok) return false;
  if (!addPlayer(currentRoster(), toRosterMember(r.sheet)).ok) return false;
  if (addToParty(r.sheet)) { draft = freshDraft(); rerender(); return true; }
  return false;
},
```

Notes on the sketch:
- **Purely additive, single file, single new import.** `packages/engine/src/save/roster.ts` needs no
  change at all — `addPlayer()` already accepts any structurally-conforming `RosterMember`; this fix
  supplies one, it does not change the gate.
- **Only one of the gate's five sub-checks can ever actually fire from this call site**, and that is
  fully intentional, not a shortcut: `alignment`/`paladinLevel` are hard defaulted to values that can
  never trigger `paladin-rejects-evil`/`evil-rejects-paladin` (mirroring the exact same, already-shipped
  default at the one wired site, `importParty.ts:161-163`, whose own comment already documents this as
  the correct, honest placeholder for "this data doesn't exist," not a bug to fix here); `party-full`
  is already redundantly enforced by `addToParty()`'s own `MAX_PARTY` check one line later (same
  "storage guard agrees with the gate" idiom `importParty.ts:251-255` already established); `duplicate`
  is already redundantly enforced by `addToParty()`'s own M75 name guard. The **net new, real behavior
  change is exactly the ranger cap** — the smallest possible slice of the 18-round-old "bigger option,"
  not the whole thing at once.
- **This is a strict refinement, not a reversal, of M75**: `addToParty()` itself is untouched; the new
  check runs strictly *before* it, as an additional pre-condition, the same shape `importParty.ts`
  already uses.
- The e2e regression this fix should add (mirrors M92/M93's own "the fix and its test travel together"
  discipline): a new, isolated `?create=1` e2e case creating 4 distinctly-named human Rangers via the
  real `window.__create` seam, asserting the 4th's `add()` returns `false` and the roster still reads
  exactly 3 rangers.

## Secondary observations not part of this round's fix

- **`importDokParty.ts` remains a structurally-moot sibling for this specific gate** (confirmed
  unchanged by M86 and re-confirmed by this round's own re-read): its `CoreClassId` union
  (`'fighter' | 'thief' | 'cleric' | 'magicUser'`) cannot produce `'ranger'`, so wiring `addPlayer()`
  there today would add real code with zero currently-reachable behavior change. Worth revisiting only
  if a future round improves DoK's class-inference heuristic to recognize a Ranger signal (per M86's own
  note, "Knight/Ranger need a race/order this data doesn't carry a signal for").
- **`dqkParty.ts`'s `installDqkParty()` also bypasses the gate** but is inert for the same reason M75
  already noted: its 6 hand-authored heroes are hardcoded and include zero Rangers (`STURM` knight,
  `CARAMON`/`TANIS` fighter, `GOLDMOON` cleric, `RAISTLIN` magicUser, `TASSLEHOFF` thief) — no currently
  reachable consequence, and (per the M92/M93 precedent of not blindly cross-wiring a Gen1 rule into a
  Gen2 DQK call site without confirming DQK's own manual agrees) not recommended for this fix regardless.
- **`createCharacter()`'s validation has no ability-score minimum for any class** (noticed while tracing
  reachability, not itself this round's fix target) — real AD&D-1e rangers traditionally require
  STR13/DEX13/CON14/WIS14; this engine's `createCharacter()` only enforces the racial min/max *range*
  from `abilityRange()`, not a per-class floor. This makes creating a Ranger even easier than the
  original might allow, but is a separate, pre-existing, unflagged-until-now gap outside this round's
  scope (no prior audit doc reference found via grep for "ability minimum" + class name combinations).
- **`create.ts`'s "Add to party" flow has no rejection-message UI slot at all today** (`addBtn` is only
  ever pre-disabled for the flat full-party case, `create.ts:320`) — M75's own "Optional follow-on"
  already named this as a separate, smaller UX gap; this round's sketch above folds a minimal version of
  it in (reusing `REASON_MESSAGE`) since a silent no-op click on the 4th ranger would otherwise be a
  confusing regression-adjacent UX (the button would do nothing with no explanation), but the exact
  placement/styling is a lead-session call, not re-litigated here.

## Rejected alternatives considered this round

| Candidate | Why rejected |
|---|---|
| Knight-of-Solamnia order-petition system (`KNIGHT_ORDER_MINIMUMS`/`petitionableOrder`) | The brief's own suggested fresh-look candidate. Re-confirmed **already fully wired**, a third time: M26 confirmed `petitionableOrder()` is called live at `character.ts:213` (`sheet.knightOrder = petitionableOrder(req.abilities)`) with no further mechanical bonus documented anywhere to wire; M66 re-confirmed it's shown on `charSheet.ts`/`create.ts`; M72 re-confirmed the *type* name (`KnightOrder`) independently, closing the same verdict a third way. No fresh angle found; not re-litigated a fourth time without one. |
| Item identification / cursed-item subsystem (`IDENTIFY_COST_STEEL`, `.identified`/`.cursed` fields) | A real, decoded set of fields (`item.ts`/`cokItem.ts`/`dqkItem.ts`) with a real pricing constant (`town/pricing.ts:80`) but **zero consumers anywhere in `apps/web/src`** (confirmed by grep). Investigated whether this is a fresh "dropped fact" — it is not: M19/M24/M26/M66/M68 already establish this needs a wholly new "identify verb"/curse-reveal mechanic invented from scratch (no existing shop-action/inventory-action framework to hang it on), which is new-mechanic invention, not a wiring gap, and explicitly outside this loop's "connect an existing computed value" framing (repeated verbatim rejection language across 5+ rounds). |
| `classFlags.ts`'s dual-class item-gating (`findItemsToUnready`/`computeClassFlags`) | Zero consumers in `apps/web/src`, confirmed by fresh grep. Re-confirmed via M81-M85's own carried-forward note ("`classFlags.ts`'s dual-class item-gating remains correctly dead... no consumer") that this is because no dual-classing mechanic exists anywhere in the engine to trigger it — a genuinely blocked dead end, not a fresh gap, six-plus rounds running. |
| `knightThac0()`/`knightSavingThrows()` (zero direct `apps/web` consumers) | Investigated as a promising zero-consumer lead; found to be **redundant, not dropped**: `coreClass()` (used live at `party.ts:1012`/`1042`, `charSheet.ts:72`) already folds Knight → Fighter generically, and the ruleset's own test (`addnd1e-dragonlance.test.ts`) asserts `knightThac0(lvl) === thac0('fighter', lvl)` — the identical numeric result already reaches production via a different, equivalent route. Not a gap. |
| ECL `input`/`who` auto-answer gap (`explore.ts`'s `runStepEvent()`) | Re-confirmed still correctly unreachable, per M92's own re-confirmation: both games' only reachable ECL block (34) contains zero `input`/`who` first-pause turns; not re-opened without new area-chaining support (none added since). |
| A fresh full sweep of `packages/engine/src/index.ts`'s ~530 zero-`apps/web`-consumer exports (this round's own systematic scan) | Most resolve to: (a) authoring-only/CLI-tool functions (`tools/`-consumed, e.g. `importFruaGeo`, `buildDqkGameData`, Amiga/HLIB porting functions) outside `apps/web`'s scope entirely; (b) future-ruleset scaffolding (Buck Rogers/AD&D2e ids, explicitly out-of-scope per M26); (c) internal engine-to-engine helpers already consumed by a DIFFERENT engine function that itself IS exposed to `apps/web` (the `xpForLevel`-via-`checkTraining` shape) — a false positive of the naive "grep apps/web for this exact name" method, not a real gap. `addPlayer`'s family was the one genuine hit that survived a deeper look. |

## Open questions / unknowns

- **Whether the lead session should implement the fuller rejection-message UI** (reusing
  `REASON_MESSAGE`) in the same pass as the gate, or ship the gate alone first and treat the message as
  M75's own already-deferred separate follow-on. Not resolved here; either is small.
- **Whether `REASON_MESSAGE` should be extracted into a shared module** (e.g. `save/index.ts` or a new
  `apps/web/src/ui/rosterMessages.ts`) so `create.ts` doesn't duplicate `importParty.ts`'s literal object,
  or whether a small duplication is acceptable. Not resolved; a lead-session style call.
- **Whether `createCharacter()`'s missing per-class ability-score minimums (see "Secondary
  observations") are worth their own future round.** Flagged here for the first time (no prior audit doc
  reference found), but not this round's fix — a separate validation gap, not a wiring gap.
- **The DoK-import Ranger-signal gap** (`importDokParty.ts`'s `CoreClassId` excluding `ranger`/`knight`)
  remains a standing, already-twice-flagged (M32, M86) limitation of the class-inference heuristic, not
  picked up this round — would need a genuinely new signal (a race/order byte this project hasn't
  located in DoK's save format), not just a wiring change.

## Implications for our engine / for the taxonomy

- **A genuinely new, previously-unconsidered angle on an old candidate is a legitimate way to finally
  close an 18-round-old deferral, even without new primary-source data**: unlike M93 (which needed a
  fresh PDF re-read) or M88 (which needed a sibling call site to simply exist), this round's contribution
  is *scope-narrowing* — re-confirming (via M86's own already-published finding) that 2 of the 3
  originally-named "riskier" call sites (`importDokParty.ts`, `dqkParty.ts`) are moot today, which turns
  a "bigger, riskier" 3-site change into a "small, single-site, single-mechanic" one. The size of a fix
  is not fixed at the moment it's first proposed — later information (or a later round's own
  re-verification of a sibling site) can shrink it to something safely additive.
- **This is the cleanest illustration yet of this loop's own "M92 corollary" running in the SAFE
  direction**: unlike M92 (where a shared call site's rule genuinely differed by game and a blind wire-in
  would have regressed DQK), here the call site being fixed (`create.ts`) is unambiguously the SAME
  engine generation (Gen1, CoK/DoK) as the already-correctly-gated sibling (`importParty.ts`) — so there
  is no cross-game rule-differs risk to navigate at all, which is precisely why 18 rounds of "flagged but
  not this round's slice" can now resolve into a genuinely low-risk pick.
- **Reinforces M75's own closing lesson one level further**: "a real, well-tested engine-layer
  validation/gate function can be faithfully wired for ONE of several structurally parallel call sites...
  not because the gate is wrong, but because only one call site's author reached for it" — and the
  corollary this round adds is that **the same evening's own commit pair** (`1551717` then `aefe40a`,
  51 minutes apart, 2026-06-30) is the exact moment the asymmetry was created: a pure-engine commit
  landed the gate, and the very next commit wired it into exactly one of (at the time) three real
  `addToParty()` call sites, without a comment or TODO flagging the other two. This matches the taxonomy
  shape this loop already named verbatim: *"a same-evening engine-gap-then-UI-wiring commit pair that
  wires a new mechanism into only ONE of several structurally-parallel real hosts."*
