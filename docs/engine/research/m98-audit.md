# M98 audit — a cleric's "Pray" action computes their deity's real, printed "Extra spells" grant, then discards it; only the flavour message ever reaches the screen

> Audit method: read `docs/engine/research/m97-audit.md` in full first per the brief's mandatory first
> step, then read `m96-audit.md` in full and skimmed `m94`/`m95-audit.md` for the established taxonomy.
> `git log` confirms M94's, M95's, M96's, and M97's fixes are all **already shipped**
> (`93437bf`, `7af9357`, `07e7406`, `5d75b1f`), so this round reads the current, already-more-advanced
> source, not a stale snapshot. Re-verified `town.ts`/`dqkExplore.ts` directly (`grep -n "onLeave"
> apps/web/src/ui/town.ts` → the M97 fix is live, all four pre-existing `startTown()` callers still pass
> no second argument) before treating M97 as closed.
>
> Housekeeping: this task's own `gitStatus` preamble lists `docs/engine/research/m39-audit.md` and
> `packages/engine/test/_scratch_m39_verify.test.ts` as untracked — re-confirmed, per M96's own prior
> note about the identical stale-preamble artifact, that neither file exists in the current working tree
> (`git status --porcelain` was clean at session start). Not a real leftover to clean up.
>
> **Triage of the carried-forward threads** (per the brief's "pick one OR find something fresh,
> grep-check first" instruction):
> 1. DoK-import `CoreClassId` excludes ranger/knight (M32/M86/M94/M95/M96/M97) — re-confirmed still true
>    (`importDokParty.ts:123`: `type CoreClassId = 'fighter' | 'thief' | 'cleric' | 'magicUser'`), still
>    correctly scoped as needing a new race/order signal DoK's save format doesn't carry. Not picked.
> 2. `createCharacter()` has no per-class ability-score minimums (M94/M95/M96, re-confirmed M97) — still
>    open, still a two-part fix (ability floor + a not-yet-existing `alignment` field). Not picked.
> 3. DQK's distinct manual "Paladin" row vs. "Knight" (M93-M97) — still **UNKNOWN**. Not picked.
> 4. M96's own "a full page-image audit of every CoK/DoK numeric table" — not picked; still a from-scratch
>    sweep with no code-reachability angle, and this round found a sharper candidate first.
> 5. M97's own new open question — "would DoK's own dungeon session ever need the identical `onLeave`
>    treatment if it gains its own Town entry point" — re-checked (`grep -n "startTown"
>    apps/web/src/ui/explore.ts` → zero hits, unchanged from M97): still not a real gap, DoK still shares
>    CoK's `explore.ts`/wilderness path entirely. Not picked.
>
> None of the five was picked. Instead, this round swept the Dragonlance ruleset's **deity-grant**
> subsystem (`packages/engine/src/ruleset/addnd1e-dragonlance/deities.ts` + `scribe.ts`'s `prayerGrant`)
> — a file no prior M-round's own grep history had ever touched by these exact names (see "Existing
> sibling/precedent" below) — for the M37/M38/M40 "a function computes a fact its one real caller then
> drops" shape, applied to a still-live, still-unswept corner of the same overlay (`magic.ts`) three
> prior rounds (M18/M20/M22-era wiring, M40's `robe` fix, M63's `moveRate`) have already mined for
> adjacent findings without ever looking at the "Pray" branch's *second* return value.

## Headline finding

**`packages/engine/src/ruleset/addnd1e-dragonlance/scribe.ts`'s `prayerGrant()` — the real, production
function behind a cleric's "Pray" command (`apps/web/src/ui/magic.ts`'s `doContext()`) — computes the
cleric's deity's real, printed "Extra spells" grant (Journal.pdf printed p. 17, "Deities") into its
return value's `bonusSpells` field, but `doContext()`, the one real call site anywhere in this codebase,
only ever reads `.message` and silently discards `.bonusSpells` — so a player who prays as, say, a
Cleric of Mishakal sees only "Mishakal answers your prayers" and is never told (on this screen, or
anywhere else in the game) that Mishakal's real, manual-printed favor also includes free access to
Charm Person, Remove Curse, and Bless.** This is not a hypothetical corner case: the `DEFAULT_DEITY`
every DoK→DQK-imported Cleric receives (`importDokParty.ts:137`) is **also** `'mishakal'`, so the two
real, save-derived, bundled DoK clerics this project ships (TANAR, FLAVIUS — see M95's own table) inherit
the identical drop the moment either one prays inside a live DQK session, alongside the hand-authored
`GOLDMOON` hero (`dqkParty.ts:30`, also Mishakal) and any player-created Mishakal cleric built through
CoK's own "Create New Character" screen.

**Both the function's own interface doc comment and its one real caller's doc comment already promise
the opposite of what the code does — a direct, falsifiable, self-flagging pair of claims:**

```ts
// packages/engine/src/ruleset/addnd1e-dragonlance/scribe.ts:71-80 (current source, full)
/**
 * What a cleric's prayer grants. Clerics petition their deity for spells rather than studying; the
 * grant is flavour + the deity's bonus spells (1e granted/extra spells). Returns a short message and
 * the bonus-spell names. With no deity the prayer is unfocused but still answered.
 */
export interface PrayerGrant {
  message: string;
  deity: DeityId | null;
  bonusSpells: readonly string[];
}
```

```ts
// apps/web/src/ui/magic.ts:324-330 (doContext()'s own doc comment, current source, full)
/**
 * Context action — **Scribe** for a magic-user, **Pray** for a cleric. Scribe rolls the AD&D 1e
 * "Chance to Know Each Listed Spell" table (`attemptScribe`, Intelligence-scaled d100) to copy the
 * spell under the cursor into the caster's persisted spellbook; a miss leaves the book unchanged so
 * the caster can try again later. A book already holding {@link maxSpellsPerLevel} spells of that
 * level is full — no room regardless of the roll. Pray petitions the cleric's deity, acknowledging
 * the granted spells. Both set a one-line `flash`.
 */
```

*"Returns a short message and **the bonus-spell names**"* and *"Pray petitions the cleric's deity,
**acknowledging the granted spells**"* are both false for exactly the field this round finds dropped —
the same shape M96 named for `KNIGHT_ORDER_MINIMUMS`'s *"Sword and Rose are verbatim"* comment: a
doc-comment claim contradicted by the code directly beneath it, self-flagging the exact gap once read
carefully.

## Existing sibling/precedent and the self-flagging evidence

**Grep results (discipline #1), confirming this is genuinely new, not a re-proposal:**

```
$ grep -rln "prayerGrant\|bonusSpells\|PrayerGrant\|extraSpells" docs/engine/research/m*-audit.md
(zero hits)

$ grep -rln "RAISTLIN" docs/engine/research/m*-audit.md
m52-audit.md  m75-audit.md  m94-audit.md  m97-audit.md   -- all four only cite RAISTLIN as one of
  dqkParty.ts's 6 hardcoded heroes (roster-line display, name-collision, ranger-cap scoping, and an
  e2e party-list dump respectively) -- none inspects his or any hero's deity/prayer mechanics.

$ grep -n "robe" docs/engine/research/m40-audit.md docs/engine/research/m76-audit.md
m40-audit.md   -- the *robe* field (a DIFFERENT DeityGrant-adjacent-but-separate mechanic: mage moon
                  order, not cleric deity) already fixed; its own "Open questions" explicitly scoped
                  itself to `.robe`, never touched `.deity`'s OWN extra-spells grant.
m76-audit.md:268 -- checked createCharacter()'s ValidationResult `warnings` array for a live, reachable
                  drop (a DIFFERENT question: whether a *mismatched* deity/robe choice's warning message
                  is dropped) and correctly found no live case fires it — never asked whether a
                  *correctly-set* deity's OWN grant data is itself later dropped downstream at the Pray
                  call site. Different field, different question, same file family.
```

**Git-blame dating — this is a day-one field, self-flagged as incomplete from the start, never revisited:**

```
$ git log --format="%h %cd %s" --date=iso -S "extraSpells" -- packages/engine/src/ruleset/addnd1e-dragonlance/deities.ts
bc7a210 2026-06-21 13:21:09 +0200 M2.S4: addnd1e-dragonlance overlay (CoK races/classes/deities/moons)

$ git log --format="%h %cd %s" --date=iso -S "prayerGrant" -- apps/web/src/ui/magic.ts packages/engine/src/ruleset/addnd1e-dragonlance/scribe.ts
b7169af 2026-06-22 01:41:00 +0200 A2.3: Scribe (mage) / Pray (cleric) flow stub (CoK)
```

`extraSpells` has existed, unconsumed beyond `prayerGrant()`'s own pass-through, since the very same
commit (`bc7a210`) that M96 traced its own `KNIGHT_ORDER_MINIMUMS` bug to — the day-one Dragonlance
overlay commit. Its own field doc comment is honest about this from the start: *"Bonus spells the deity
always grants, by name (flavor/utility — not modelled mechanically yet)"* (`deities.ts:33`) — an
explicit, self-authored acknowledgment that the **mechanical** half of this rule (whether the named
spells should function as always-known/free casts) was deliberately deferred. What was *not*
deliberately deferred, and is this round's actual finding, is that even the **non-mechanical, purely
informational** half — simply telling the player which spells their prayer grants, something
`prayerGrant()` already computes and its own interface already promises — never reaches the screen
either, one file over, at the one real call site that exists specifically to consume it.

## Primary-source verification (page-image read, not just `pdftotext`, per discipline #3)

`docs/engine/research/cok-dragonlance-rules.md:310-320`'s own §9b transcription of the "Deities" table
already cites Journal printed pp. 17-18 and matches `deities.ts`'s `DL_DEITIES` table cell-for-cell. This
round independently re-verified it against the actual rendered page image (`pypdfium2`, scale 3.0, the
same fallback M93/M96 established), not trusting the existing transcription at face value:

| Deity | Code (`deities.ts:40-46`) | Page image (`Champions of Krynn/Journal.pdf`, printed p. 17) |
|---|---|---|
| Paladine | `extraSpells: ["Protection from Evil 10' radius"]` | "Extra spells: Protection from evil 10' radius" — match |
| Majere | `extraSpells: ["Silence 15' radius"]` | "Extra spells: Silence 15' radius" — match |
| Kiri-Jolith | `extraSpells: ['Detect Magic']` | "Extra spells: Detect Magic" — match |
| Mishakal | `extraSpells: ['Charm Person', 'Remove Curse', 'Bless']` | "Extra spells: Charm Person, Remove Curse, Bless" — match |
| Sirrion | `extraSpells: ['Burning Hands']` | "Extra Spells: Burning Hands" — match |
| Reorx | *(none)* | "Extra spells: None" — match (no field set, correct) |
| Shinare | `extraSpells: ['Charm Person']` | "Extra Spells: Charm Person" — match |

Both crops (`journal_p17_deities.png`, `journal_p17_deities2.png`, rendered this round, viewed directly —
not re-run through OCR) confirm every cell exactly; the transcription is accurate. This round's finding
is therefore purely a **wiring/display gap**, not a data-fidelity bug (unlike M96's `KNIGHT_ORDER_MINIMUMS`
finding) — the data is right, it just never leaves the engine layer.

## Where the severance happens — exact locations, current source

**`packages/engine/src/ruleset/addnd1e-dragonlance/scribe.ts:82-88`** (`prayerGrant`, current source,
full — the real, unmodified production function):

```ts
export function prayerGrant(deity?: DeityId | null): PrayerGrant {
  if (deity && DL_DEITIES[deity]) {
    const g = DL_DEITIES[deity];
    return { message: `${g.name} answers your prayers`, deity, bonusSpells: g.extraSpells ?? [] };
  }
  return { message: 'Your prayers are answered', deity: null, bonusSpells: [] };
}
```

**`apps/web/src/ui/magic.ts:332-358`** (`doContext`, current source, cleric branch in full — the one real
call site anywhere in `apps/web/src`, confirmed by `grep -rn "prayerGrant" apps/web/src` → exactly one
hit):

```ts
function doContext(): void {
  if (!session) return;
  const caster = currentCaster();
  if (!caster) return;
  if (caster.info.kind === 'magicUser') {
    // ...scribe branch, unaffected by this finding...
  } else {
    const grant = prayerGrant(caster.sheet.deity ?? null);
    session.flash = grant.message;        // <-- only .message reaches the screen
    session.lastCast = grant.message;     // <-- same field, e2e seam
    // grant.bonusSpells is computed above, on the very same `grant` object, and never read again.
  }
  paint();
}
```

**`apps/web/src/ui/magic.ts:183-185`** (`paint()`, the render call `doContext()` triggers) — `session.flash`
is the *only* per-cast text drawn to the actual screen (a real, rendered subtitle line, not just internal
state):

```ts
const subtitle = session.flash
  ? session.flash
  : `${kindLabel} Spells   ${usedSlots}/${totalSlots} prepared`;
```

**`packages/engine/src/render/spellbook.ts:41-48,58-59,78-79`** (`SpellbookView`/`composeSpellbook`, the
pure render compositor `paint()` feeds) confirms the subtitle is drawn as a single, non-wrapping
`drawText` call at a fixed row, with **no existing second-line slot**:

```ts
// spellbook.ts:41-48
export interface SpellbookView {
  title: string;
  subtitle?: string;     // <-- the only per-cast text slot this view model has
  rows: SpellbookRow[];
}
// spellbook.ts:58-59
const LIST_ROW0 = 5; // first list row (8x8 cell row)
// spellbook.ts:78-79
drawText(fb, font, v.title.toUpperCase(), cell(2), row(2), C_WHITE);
if (v.subtitle) drawText(fb, font, v.subtitle.toUpperCase(), cell(2), row(3), C_GREEN);
```

Title is row 2, subtitle is row 3, the spell list starts at row 5 (`LIST_ROW0`) — **row 4 is currently
blank, unused space** between the subtitle and the list, a real, structurally clean slot for a second
line (see "Proposed minimal fix").

**`packages/engine/src/render/charSheet.ts`** (a sibling compositor, confirmed identical convention:
same `COK_FRAME_LAYOUT`/`drawOuterBorder`, same `cell(2)` starting column for every text row) is the
compositor M40's own audit already measured for usable-column width (*"a conventional ~col 2 to ~col 37
(≈35-36 character columns) usable"*) — since `spellbook.ts` draws its title/subtitle with the exact same
frame, font, and starting column, that same ~35-36-character budget applies here too (see "Row-budget
check" below; this round re-derives it against the real string lengths rather than assuming the number
transfers unverified).

## Reachable in real, ordinary, shipped play — static + dynamic proof

**Static reachability, the full real chain (three independent real party sources, all converging on the
identical drop):**

1. **CoK "Create New Character"**: `mainMenu.ts` → `startCreate()` → pick Human, Cleric, deity Mishakal
   (`create.ts:291-299`'s real deity `<select>`, populated from `deitiesForRace()`) → "Add to party" →
   `Encamp` → `Magic` (`magic.ts`'s `openMemorize`) → cycle to the cleric (`N`/`P`) → press **`s`**
   (Scribe/Pray) → `doContext()`'s cleric branch.
2. **`dqkParty.ts`'s hand-authored `GOLDMOON`** (`dqkParty.ts:30`: `deity: 'mishakal'`) → any DQK session
   (`?dqk=1`) → the real **"(M)agic"** command-bar entry / `m` keybind (`dqkExplore.ts:410`,
   `openDqkOverlay('magic')` → `openMemorize`) → cycle to Goldmoon → press `s` → the same `doContext()`.
3. **DoK→DQK save import** (`importDokParty.ts:137,245`): **every** inferred Cleric (TANAR, FLAVIUS — the
   two real, save-derived clerics among the six bundled `Death Knights of Krynn/SAVE/CHRDATA{n}.GAM`
   pregens M95's own audit already re-derived) is assigned `DEFAULT_DEITY = 'mishakal'` — so both reach
   the identical drop the moment either prays inside a live DQK session, via the real, ordinary
   "⇪ Import DoK party → DQK" sidebar command (`main.ts:608-615`) then the same "(M)agic" path as (2).

All three are real, front-door, no-dev-console command sequences — no save-editing, no illegal state.

**Dynamic re-derivation this round** (one scratch vitest file, created, run — 2/2 assertions passing —
then deleted; `git status --porcelain` confirmed clean before and after, this doc the only new file),
against the real, current, unmodified `prayerGrant`/`DL_DEITIES` production exports:

```
// Reproduces doContext()'s EXACT current behaviour — only .message reaches the UI:
prayerGrant('mishakal').message === 'Mishakal answers your prayers'

// The dropped field, computed by the same real call, real and non-degenerate per deity:
prayerGrant('mishakal').bonusSpells  -> ['Charm Person', 'Remove Curse', 'Bless']
prayerGrant('paladine').bonusSpells  -> ["Protection from Evil 10' radius"]
prayerGrant('majere').bonusSpells    -> ["Silence 15' radius"]
prayerGrant('kiriJolith').bonusSpells -> ['Detect Magic']
prayerGrant('sirrion').bonusSpells   -> ['Burning Hands']
prayerGrant('shinare').bonusSpells   -> ['Charm Person']
prayerGrant('reorx').bonusSpells     -> []   -- correctly empty; Reorx's real grant is Powers-only (THAC0), no extra spells

// Row-budget probe (see below): a naive single-line "Grants: <names>" message, measured against
// M40's own established ~35-36-usable-column budget for this exact compositor family:
'Grants: Charm Person, Remove Curse, Bless'.length === 41   -- OVER budget (Mishakal)
"Grants: Protection from Evil 10' radius".length === 39      -- OVER budget (Paladine)
'Grants: Silence 15' radius'.length === 26                   -- fits (Majere)
'Grants: Detect Magic'.length === 20                          -- fits (Kiri-Jolith)
'Grants: Burning Hands'.length === 21                          -- fits (Sirrion)
'Grants: Charm Person'.length === 20                           -- fits (Shinare)
```

All values reproduced against the real, unmodified `prayerGrant`/`DL_DEITIES` exports — no fixtures or
mocks. The scratch file (`packages/engine/test/_scratch_m98_verify.test.ts`) was created, run (2/2
passing via `npx vitest run`), and deleted before writing this document.

**Why the existing e2e test never caught this:** `apps/web/test/e2e.mjs`'s `runMagic()` (~line 2800)
already drives this *exact* code path — its own comment (`e2e.mjs:2876`: *"5. Pray (cleric, A2.3): the
context verb on a cleric petitions the deity → a Mishakal message"*) and assertion
(`e2e.mjs:2925`: `const contextOk = /Mishakal/.test(prayMsg) && ...`) prove the test already reaches
`doContext()`'s cleric branch for a real, freshly-created Mishakal cleric ("Goldmoon", built via the real
`window.__create` seam) — but the assertion only checks the message *contains* "Mishakal", never that it
(or any other visible state) contains the granted spell names. This is the same "genuine, unexercised gap
in coverage" shape M97 named (not M86/M89/M90/M95/M96's "test bakes in a wrong value" shape) — the test's
own assertion would not change if this round's fix shipped or not, since it never inspects the dropped
field at all.

## Row-budget check (honest sizing, not assumed-safe)

Unlike M40's `robe` fix (both real strings comfortably fit the established budget), **this candidate's
naive "concatenate the names onto one line" fix does NOT uniformly fit**: 2 of the 6 deities with a
real extra-spells grant (**Paladine**, 39 chars, and **Mishakal**, 41 chars — Mishakal being the single
most-likely-to-be-prayed-to deity in ordinary play, per "Reachable in real, ordinary, shipped play"
above) exceed the ~35-36-usable-column budget `charSheet.ts`'s own M40 audit already established for
this exact compositor family (same frame, same font, same starting column). The other 4 (Majere 26,
Kiri-Jolith 20, Sirrion 21, Shinare 20 chars) fit comfortably. This is a genuine, verified sizing
constraint, not a hypothetical one — flagged explicitly rather than glossed over, per this loop's own
"honest degeneracy/budget check" discipline (M40, M83).

## Proposed minimal fix (not applied this round — audit scope is research only)

**Use the existing blank row (row 4, between the subtitle at row 3 and the spell list at row 5) as a
second, dedicated line for the deity's grant — additive to both the engine render compositor and the
`apps/web` caller, touching no other consumer** (confirmed `magic.ts`'s session/render logic has no
other importer — `grep -n "from './magic.js'" apps/web/src/ui/*.ts` → only `dqkExplore.ts`/`explore.ts`,
neither of which reaches into `paint()`'s internals):

```ts
// sketch, not applied this round -- packages/engine/src/render/spellbook.ts
export interface SpellbookView {
  title: string;
  subtitle?: string;
  /** M98 — a second, optional line under the subtitle (row 4, currently blank) for a longer per-cast
   * note that doesn't fit the subtitle's own budget (e.g. a deity's granted "Extra spells" list). */
  note?: string;
  rows: SpellbookRow[];
}
// composeSpellbook(), immediately after the existing subtitle drawText:
if (v.note) drawText(fb, font, v.note.toUpperCase(), cell(2), row(4), C_GREEN);
```

```ts
// sketch, not applied this round -- apps/web/src/ui/magic.ts
interface MagicSession {
  // ...unchanged fields...
  /** M98 — the current caster's deity-granted spell names (Pray only), shown on the blank row under
   * the flash message; '' for a mage or a deity with no extra-spells grant (e.g. Reorx). */
  note: string;
}

// doContext()'s cleric branch:
const grant = prayerGrant(caster.sheet.deity ?? null);
session.flash = grant.message;
session.lastCast = grant.message;
session.note = grant.bonusSpells.length ? `Grants: ${grant.bonusSpells.join(', ')}` : '';

// paint(): pass session.note through to composeSpellbook's new `view.note` field (cleared on every
// other action -- moveCursor()/doMemorize()/doForget()/doCast() -- the same way `flash` already is,
// so the note doesn't linger stale after the player moves on).
```

**The row-budget overflow (Paladine/Mishakal) is a real open design question this sketch does not
resolve** — options for a lead session to choose among, none applied here:
- Abbreviate spell names generically (e.g. drop `"10' radius"`/`"15' radius"` suffixes: `"Protection
  from Evil"` = 34 chars fits; `"Charm Person, Remove Curse, Bless"` alone, without the `"Grants: "`
  prefix, at 34 chars, also fits — moving the label into the *subtitle* line instead, e.g. `subtitle =
  grant.message + ' (grants:)'`, `note = bonusSpells.join(', ')`, splitting the label and the list across
  the two lines rather than concatenating one long string).
- Truncate with a `"+N more"` suffix (loses information, weakest option).
- Extend `composeSpellbook`'s fixed layout to reserve two blank rows instead of one (would push
  `LIST_ROW0` down by one and shrink `LIST_MAX` by one — a larger, layout-shifting change touching every
  existing caller's row math, not recommended given a same-row split reads just as well).

This round does not pick one — it is a genuine, unresolved cosmetic-layout decision, not a mechanical
one, and is flagged rather than silently resolved by guessing.

**What this fix deliberately does NOT do:** it does not implement the "Extra spells" grant
*mechanically* (i.e., it does not make Charm Person/Remove Curse/Bless actually castable by a
lower-level Mishakal cleric who wouldn't otherwise have them, nor does it add a free memorization slot).
The engine's own `extraSpells` field doc comment (`deities.ts:33`) already, honestly, calls this
"not modelled mechanically yet" — and the manual's own prose (Journal p.17: *"the character need only
memorize them"*, referring to spells of an already-available level) is ambiguous enough about whether
"Extra spells" means *always-known regardless of level* or merely *thematically associated, still subject
to normal level-gating* that implementing a mechanical effect without a clearer primary-source read would
risk inventing a rule, not transcribing one — this round's fix is scoped to the safe, unambiguous,
purely-informational half only (see "Open questions").

## Secondary observations not part of this round's fix

- **The other three `DeityGrant` fields (`thac0Bonus`, `healingDieBonus`, `turnUndeadLevelBonus`) are
  already fully wired and mechanically live** (`party.ts:675,724`, both re-confirmed unchanged this
  round) — this finding is narrowly about the fourth field, `extraSpells`, which is the only one of the
  four with **zero** consumers beyond the message-only pass-through. `DeityGrant`'s own four optional
  fields are not a uniform "all dropped" story; three of four already reached production, one never did.
- **No other UI surface shows a deity's "Extra spells" grant either** — confirmed by a repo-wide grep
  (`grep -rn "extraSpells\|DL_DEITIES\|deitiesForRace" apps/web/src`): the only hits are `create.ts:291`
  (the deity `<select>`, which shows `name (alignment)` only, never `Powers`/`Extra spells`) and this
  round's `magic.ts` finding. A lead session could alternatively (or additionally) surface this fact at
  *character-creation* time instead of (or in addition to) the Pray screen — e.g. a tooltip/description
  under the deity dropdown — which would sidestep the row-budget problem entirely (create.ts's panel is
  a scrolling HTML `<div>`, not a fixed 320×200 framebuffer). Not resolved here; a genuine alternative
  fix *location*, not just a fix *shape*, worth a lead session's judgement call.
- **The mechanical question flagged above** (*should Mishakal's Charm Person/Remove Curse/Bless actually
  be castable/known regardless of the cleric's level?*) is a separate, larger, primary-source-ambiguous
  question this round does not resolve — if a future round wants to pursue it, it would need either a
  clearer AD&D 1e sourcebook citation for "deity-granted spells" as a mechanic distinct from the
  manual's own plain "clerics always have every spell of an available level memorizable" rule (which, if
  taken literally, would make an *already-available-level* "Extra spell" redundant — the grant would only
  matter for a spell *above* the cleric's normally-available level, which none of the seven `extraSpells`
  entries here appear to be, since Bless/Detect Magic/Charm Person/Burning Hands/Silence 15'/Protection
  from Evil are all common low-level 1st-2nd-level clerical or magical spells) — a genuinely deep rules
  question, flagged, not solved.

## Rejected alternatives considered this round

| Candidate | Why rejected |
|---|---|
| DoK-import `CoreClassId` excluding ranger/knight (M32/M86/M94/M95/M96/M97) | Re-confirmed still true, still correctly scoped as needing a new race/order signal; no new angle found this round. |
| `createCharacter()`'s missing per-class ability-score minimums (M94/M95/M96/M97) | Re-confirmed still open, still a two-part fix (ability floor + a not-yet-existing `alignment` field). Not picked, consistent with prior rounds' scoping. |
| DQK's distinct "Paladin" row (M93-M97) | Still **UNKNOWN**; no new primary source consulted this round. Left open. |
| `Raistlin`'s (`dqkParty.ts`) omitted `robe` field, considered as "should he canonically be Black Robe?" | Investigated (Raistlin's Dragonlance-lore Black Robe status is well-known), but rejected: `dqkParty.ts`'s own header comment explicitly frames the whole `DQK_HEROES` roster as "original content under the clean-room rule," not decoded game data — there is no primary *game*-source (as opposed to general Dragonlance-novel lore) establishing what robe, if any, this project's own invented DQK-era Raistlin hero should wear, and `createCharacter()`'s existing "Black Robe is NPC-only" gate (Journal p.16, a real CoK player-creation rule) has no clean, grounded exemption mechanism for a hand-authored NPC-flavoured roster entry without inventing a new `isNpc` concept from whole cloth. Weaker grounding than the `extraSpells` finding (a printed, game-manual-sourced, already-coded, already-self-flagged-incomplete mechanic); not pursued further. |
| A full page-image re-derivation of one more CoK/DoK numeric table (M96's closing suggestion) | Still a from-scratch transcription-verification sweep with no code-reachability angle; this round's actual pick was found via a targeted sweep of an adjacent, previously-unexamined function (`prayerGrant`) in a file family (`magic.ts`) already mined by M18/M20/M22/M40/M63, and turned out sharper and more clearly reachable. |

## Open questions / unknowns

- **Where the granted-spell names should be displayed, and how to fit the two over-budget cases
  (Paladine, Mishakal)** — see "Row-budget check" and "Proposed minimal fix" above; three concrete
  options sketched (split label/list across two lines, abbreviate names, or surface at character-creation
  time instead/in addition) but not chosen. A lead-session call.
- **Whether "Extra spells" should ever become a real mechanical grant** (always-known/free-cast
  regardless of level) rather than purely informational text — genuinely ambiguous from the manual's own
  prose (see "Secondary observations"); flagged, not resolved. If pursued, would need a clearer AD&D 1e
  primary-source citation for the "deity-granted spell" mechanic as something distinct from the already-
  modelled "all clerical spells of an available level are memorizable" rule.
- **Whether the same "Grants: ..." note should also appear on the character sheet's deity footer**
  (`charSheet.ts`'s existing `s.deity ? \`Worships ${titleCase(...)}\` : ...` branch, fixed by M40 for the
  adjacent `robe` case) — not investigated this round; `charSheet.ts`'s footer is a single fixed row with
  no spare blank row nearby (unlike `spellbook.ts`'s row 4), so extending it would face a tighter
  variant of the same row-budget problem. Flagged as a possible follow-on, not attempted here.

## Implications for our engine / for the taxonomy

- **A confirmed instance of the M37/M38/M40 "the function computes it, the one real caller drops it"
  shape, found by re-sweeping a file family (`magic.ts`) three separate prior rounds (M18/M20/M22-era
  wiring, M40, M63) had already mined for adjacent findings** — reinforcing M40's own "Implications"
  lesson (*"the three-consecutive-round exhaustion... was real for `referenceDb.ts` specifically, not
  for the UI layer as a whole"*) one file further: even a file that has already yielded a strong prior
  finding (`robe`, M40) can still hold a second, independent, unrelated drop in an adjacent function
  (`prayerGrant`, a sibling of `casterInfo` in the same overlay) nobody happened to read function-by-
  function before.
- **A field's own doc comment can both self-flag AND under-claim in the same breath** — `extraSpells`'s
  comment ("flavor/utility — not modelled mechanically yet") honestly disclaims the *mechanical* half of
  the gap, which is exactly why 8+ rounds' worth of "computed but unwired" sweeps likely skipped past it
  as "already known, nothing to fix here" — but the comment says nothing about the *display* half, which
  turned out to be the genuinely fresh, actionable, low-risk part. A lesson for future sweeps: a
  self-flagged "not fully implemented" comment on a field doesn't mean there's no smaller, safe, partial
  slice worth shipping — the same two-part-gap shape M94/M95/M96 already established for ability
  minimums (ship the safe half, flag the harder half) applies here too, just discovered from the opposite
  direction (the code already flags the hard half; this round found the easy half was ALSO unshipped).
- **Reinforces the "verify with a real render, not just a second text pass" discipline (M93/M96) even for
  a manual whose font is otherwise clean** — this round's own `pdftotext`-equivalent extraction (via
  `pypdfium2`'s text layer) already matched the code exactly, but the page-image cross-check was still
  performed per discipline #3 before treating the match as confirmed, consistent with this loop's
  standing preference for a visual read over trusting extraction alone, even when the extraction looks
  clean at a glance (this manual's font drops no glyphs, unlike DQK's Journal — but M96 already showed a
  clean-extracting font is no guarantee against a *human* transcription error elsewhere in the same
  document, so the cross-check remains worth the few minutes even here).

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `packages/engine/test/_scratch_m98_verify.test.ts` (2 tests, 2 assertions each: `prayerGrant()`'s real,
  non-degenerate `bonusSpells` per deity reproduced fresh against the actual production export; the
  row-budget over/under split for a naive "Grants: ..." concatenation) — run via `npx vitest run` (2/2
  passed), then deleted. Confirmed via `git status --porcelain` (clean except this doc) after deletion.
- Two rendered page-image crops (`journal_p17_deities.png`, `journal_p17_deities2.png`) were written to
  the session scratchpad directory (outside the repo), not committed; used only to visually cross-check
  the Deities table transcription in this document.
