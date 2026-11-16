# M40 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done section for M35–M39 in full, and
> `docs/engine/research/m39-audit.md` in full (its Rejected-alternatives / Open-questions /
> Implications sections in particular). M39's own "Implications" flagged that `referenceDb.ts`'s easy
> layer (3 consecutive rounds: M37/M38/M39) is likely exhausted, so — per this round's brief — the
> sweep was **widened beyond `referenceDb.ts`** to every other UI projection function/panel:
> `charSheet.ts`, `companionPanel.ts`'s non-referenceDb tabs (hud/journal/char), `inventory.ts`,
> `town.ts`, `combat.ts`'s log, `journal.ts`, `automapPanel.ts`, `hudPanel.ts`. Every candidate field
> found was cross-referenced against its nearest UI consumer(s), reproduced fresh in a throwaway
> `vitest` script this round, and double-checked by directly reading the CURRENT source (not trusted
> from `m39-audit.md`'s or any earlier round's tables — none of them ever looked at `charSheet.ts`).
> All scratch files were deleted after use (listed at the end); `git status --porcelain` is clean
> except this doc.
>
> **Headline pick: `CharacterSheet.robe` (`packages/engine/src/ruleset/addnd1e-dragonlance/
> character.ts:62`) — a Champions of Krynn mage's White/Red Robe order, which already drives TWO real,
> live mechanics (spell-slot effective level in `magic.ts`, and the party's own combat saving throw in
> `party.ts`'s `spellSaveForMember` → `combat.ts:350`) — is never shown anywhere on the character
> sheet, the one screen that exists specifically to show a character's own permanent facts.** A player
> can pick "White Robe" at creation and never see that choice again for the rest of the game, even
> though it is quietly shifting their own saving throws and spell slots every time the in-game moon
> cycles.

## Headline finding

`CharacterSheet.robe?: RobeOrder` (`character.ts:62`, `RobeOrder = 'white' | 'red' | 'black'`,
`moons.ts:11`) is set at character creation (`character.ts:205`: `robe: hasMagicUser ? req.robe :
undefined`) for a mage who picks a robe order — White Robe (Solinari, good) or Red Robe (Lunitari,
neutral); Black Robe (Nuitari) is NPC-only and rejected at validation (`character.ts:155`). An unset
robe on a magic-user models a legal "Rogue mage" who "gains no moon benefits" (doc comment,
`character.ts:61`, sourced to the printed Journal manual pp. 15-16, `moons.ts:1-9`).

This field is **mechanically live in two real places**, independently confirmed by direct reading this
round:

1. **`apps/web/src/ui/magic.ts:87-100`** (`casterInfo()`) — a mage's effective spell-memorization
   level and bonus slots shift with `moonPhaseMods(moonPhaseForDay(sheet.robe, day), …)`, folded
   straight into the real memorization screen (`?magic=1` / Encamp → Magic).
2. **`apps/web/src/ui/party.ts:685-695`** (`spellSaveForMember()`) — a robed mage's own d20
   saving-throw-vs-spell target is shifted by the same `moonPhaseMods(...).saveMod`, and this exact
   function feeds **real tactical combat**: `apps/web/src/ui/combat.ts:350`,
   `save: side === 'party' && !demo ? spellSaveForMember(c.id, day) : c.monsterSpellSave`.

Despite driving both a spellbook screen and a live combat roll, **`apps/web/src/ui/charSheet.ts`'s
`toView()` (lines 47-75) never reads `s.robe` at all.** The function's footer line — the one slot on
the sheet built for exactly this kind of permanent character fact — is a two-branch ternary that stops
one branch short of what the record actually carries:

```ts
// charSheet.ts:50-54 (current)
const footer = s.knightOrder
  ? `Knight of the ${titleCase(s.knightOrder)}`
  : s.deity
    ? `Worships ${titleCase(String(s.deity))}`
    : '';
```

For a straight (non-cleric, non-Knight) mage — the common case for anyone who picked a robe — both
`s.knightOrder` and `s.deity` are `undefined` by construction (`deity: hasCleric ? req.deity :
undefined`, `character.ts:204`; `knightOrder` only set when a `knight` class is present,
`character.ts:213`), so the footer row renders **blank**. The exact fact the row exists to show is the
one case falling through to nothing.

`companionPanel.ts`'s "Char" tab (`companionPanel.ts:44,221-224`) imports this **same** `toView`
function (`import { toView as charSheetView } from './charSheet.js'`) and calls it directly on the
live roster — so this is a single-file fix that automatically reaches both the standalone
character-sheet overlay (`A1.3`, opened via the dungeon "View" command) and the in-play Companion
Panel's Char tab, for every game (the party roster is one shared store, `party.ts`, read the same way
whether the player is exploring CoK, DoK, or DQK — confirmed via `dqkExplore.ts:73,940` importing the
same `getParty()`).

### Why this is a different failure shape from M37/M38/M39

- M37/M38 (`referenceDb.ts`'s `monsterCategory()`): the row builder had the field on the object it was
  already iterating, and simply never added a row for it.
- M39 (`referenceDb.ts`'s `itemCategory()`): the row builder's **callers** stripped the field off the
  object before the row builder ever saw it.
- **This round: the row builder (`toView()`) has full, direct access to `s.robe` on the very same
  `CharacterSheet` object it is already reading `s.knightOrder` and `s.deity` off of** (all three are
  siblings on one object, read in the same function, in the same three-line block) — it just never
  checks the third one. This is the M37/M38 shape (the projection function forgot a field it already
  had), not the M39 shape (a caller stripping something), just in a different file/function.

## Real-bytes verification

`CharacterSheet.robe` is not decoded from a `.DAX`/`.GLB` game-data file — it is a player-creation
field, entirely derived by the engine's own clean-room AD&D-1e-Dragonlance ruleset code
(`character.ts` + `moons.ts`), grounded in the original printed Journal manual (pp. 15-16, per the
source's own doc comments) rather than in bytes extracted from `Champions of Krynn/`. This is flagged
explicitly, per this round's instructions to label inference and avoid overclaiming "real bytes" where
none exist. What follows is a fresh, this-round reproduction of the actual mechanic against the
project's own current engine code (not trusted from any prior audit doc — no earlier M-round ever
looked at `robe` or `charSheet.ts`).

### Probe 1 — `createCharacter()` really does thread `.robe` through exactly as documented

Throwaway script (`packages/engine/test/_scratch_m40_robe.test.ts`, deleted after use), run against the
current `packages/engine/src` via `vitest`:

| Request | `sheet.robe` |
|---|---|
| `magicUser` lvl 8, `robe: 'white'` | **`'white'`** |
| `magicUser` lvl 8, `robe: 'red'` | **`'red'`** |
| `magicUser` lvl 8, no robe (Rogue mage) | **`undefined`** |
| `fighter` lvl 5, `robe: 'white'` passed anyway | **`undefined`** (non-mages never carry a robe) |

All 4 confirmed this round (7/7 assertions passed, `npx vitest run` clean). Matches the doc comment
(`character.ts:205`) exactly, byte-for-byte in behaviour if not in file bytes.

### Probe 2 — the moon-phase mechanic produces real, non-degenerate per-robe/per-day variety (not a constant)

Reproduced fresh this round against `moons.ts`'s `moonPhaseForDay`/`moonPhaseMods`:

| Day | White Robe (Solinari, 36-day cycle) phase | Red Robe (Lunitari, 28-day cycle) phase |
|---|---|---|
| 0 | lowSanction | lowSanction |
| 9 | waxing | waxing |
| 18 | **highSanction** | waning |
| 27 | waning | **highSanction** |

White and Red diverge by day 18 (different cycle lengths), and a single robe visibly cycles across its
own 4 phases — confirmed non-degenerate (`distinctWhite.size > 1`), unlike M31/M38's red-flagged
"always the same value" item-instance findings.

`moonPhaseMods('lowSanction', {level:8, int:17})` = `{saveMod:-1, additionalSpells:0,
effectiveLevelMod:-1}`; `moonPhaseMods('highSanction', {level:8, int:17})` = `{saveMod:1,
additionalSpells:2, effectiveLevelMod:1}` — reproduced exactly this round, matching `moons.ts`'s own
switch statement read line-by-line.

### Probe 3 — the real combat-facing formula (`party.ts:685-695`) really swings the save number

Hand-reproducing `spellSaveForMember`'s own formula (`base - mods.saveMod`) for a `base` of 14: low
sanction gives **15** (worse — higher target), high sanction gives **13** (better) — a genuine
2-point, combat-relevant swing across the same in-game month, not a cosmetic-only number.

### Probe 4 — zero UI consumer ever displays `.robe` (repo-wide grep, this round)

```
$ grep -rn "\.robe\b" apps/web/src
```
Every hit is one of: `create.ts` (the creation-time `<select>` and its live draft state — visible only
during character build, never again), `explore.ts` (the environment's three-moons top bar, which shows
all three moons' names/phases generically — NOT which robe belongs to which party member), `magic.ts`
(the mechanic itself), `party.ts` (the mechanic itself), and `viewer.css` (colour classes for the moon
bar). **Zero** hits in `charSheet.ts`, `companionPanel.ts`, `inventory.ts`, `hudPanel.ts`, or anywhere
else a persistent per-character fact would be shown. Confirmed by direct repo-wide grep this round, not
inferred.

### Probe 5 — this is genuinely new territory, not a previously-rejected candidate

`grep -rn "robe" docs/engine/research/m*-audit.md` turns up 24 files as loose word-matches, but the
only `charSheet.ts` mention in any of them (`m38-audit.md`, its Probe 0) is about
`CharacterSheet.savingThrows` (a completely different field, already displayed), confirming `robe` on
this sheet has never been raised or rejected by any prior round.

## Wiring plan

1. **`packages/engine/src`** — **no changes**. `CharacterSheet.robe`, `MOONS`, `moonPhaseMods`,
   `moonPhaseForDay` are already exported from the engine's public API
   (`packages/engine/src/index.ts:392` exports `MOONS`); `composeCharSheet` (the pure render function)
   needs no change either — it only ever draws whatever single `footer` string `toView()` hands it, and
   knows nothing about robes, moons, or classes.

2. **`apps/web/src/ui/charSheet.ts`**:
   - Add `MOONS` to the existing `@goldbox/engine` import list (line 13-22).
   - Extend the footer ternary (lines 50-54) with a third branch, after `deity`, before the empty
     string:
     ```ts
     const footer = s.knightOrder
       ? `Knight of the ${titleCase(s.knightOrder)}`
       : s.deity
         ? `Worships ${titleCase(String(s.deity))}`
         : s.robe
           ? `${titleCase(s.robe)} Robe (${MOONS[s.robe].moon})`
           : '';
     ```
     Produces `"White Robe (Solinari)"` / `"Red Robe (Lunitari)"` — deliberately matching
     `create.ts:288`'s own existing label wording (`` `${m.robe[0].toUpperCase()}${m.robe.slice(1)}
     Robe (${m.moon})` ``) so the same fact reads identically at creation time and forever after. A
     Rogue mage (`s.robe === undefined`) and every non-mage correctly show nothing new — additive only,
     matching this project's established "never fabricate, only add when the field is actually
     present" convention (M27/M38's `savingThrows`, M39's `count`).
   - Add a doc comment above `toView()` citing this audit + the two live consumers
     (`magic.ts`/`party.ts`), and noting explicitly this is CoK-only in practice (no current creation
     path grants a robe to a DoK/DQK-imported character — `importParty.ts`/`importDokParty.ts` never
     set `.robe` — so the branch is simply never reached for those characters, not specially excluded).
   - Priority note (design choice, not a bug): a non-human multi-class Knight/Mage (e.g. half-elf,
     `classes.ts:37`, both `knight`/`magicUser` capped non-null) would still show `Knight of the …`,
     never the robe — Knight order keeps first priority in the ternary, matching the existing
     Knight-over-Deity precedent already in the code. Documented as an open question below rather than
     re-ordered, since no real playtested character has hit this combination yet.

3. **`apps/web/src/ui/charSheet.ts`**'s existing `__sheet` e2e seam (lines 227-236): add one getter,
   `footer: () => { const s = session?.party[session.cur]; return s ? toView(s, '').footer : ''; }`
   (pure, no session-shape change — reuses the exported `toView` already in this file).

4. **`apps/web/src/ui/companionPanel.ts`** — no change required for correctness (it already calls the
   same fixed `toView`); optionally add a matching `charFooter: () => …` getter to the `__companion`
   seam (line ~395-428) for symmetry/verification of the Companion-Panel path specifically, mirroring
   how `__companion.refSelected()` exposes `referenceDb.ts`'s computed rows today.

5. **Tests** (extend an existing e2e case — no new scratch/test file needed, no new engine test
   needed, since `.robe`'s creation-time pass-through and the moon math are already exercised):
   - `apps/web/test/e2e.mjs`'s **existing** `runMoonPhase` case (`~line 2565-2632`, id `'moonphase'`)
     **already builds** a Rogue mage ("Rogue", no robe) and a White Robe mage ("Fizban") as two fresh
     single-member parties and navigates each to `?explore=1`. Extend it: after each mage is built and
     before/after the existing `rest(18)` + `openMagic()` block, call
     `window.__explore.command('V')` to open the sheet, read the new `window.__sheet.footer()`, and
     `window.__sheet.close()`. Assert `whiteFooter === 'White Robe (Solinari)'` and
     `rogueFooter === ''` (the negative control proving the omission for a Rogue mage is honest, not
     untested) — fold into the existing `ok`/`errors.push` composition, no new e2e case id needed.
   - This reuses test infrastructure that already creates exactly the right characters for exactly the
     right reason (M21.S1/M22.S2's own moon-phase mechanic tests) — smaller than any prior round's
     e2e slice, since no new party/page/route setup is required at all.

Rough size: ~1 import line + ~4 LOC ternary branch + 1 doc comment in `charSheet.ts`, 1 LOC new e2e
seam getter, ~8-10 LOC extending the existing `runMoonPhase` e2e case. No engine-package change, no new
test file anywhere.

## Row-budget check

This candidate is **not** a `referenceDb.ts`-style scrolling list panel, so `REFERENCE_DB_DETAIL_ROWS =
12` does not apply. `composeCharSheet` (`packages/engine/src/render/charSheet.ts`) is a fixed-position
layout: the footer is a single `drawText` call at row 20, column 2 (`charSheet.ts` render file,
line ~120). The real constraint is horizontal — the bordered frame reserves column 0 (and the mirrored
right edge) for the frame tiles, leaving a conventional ~col 2 to ~col 37 (≈35-36 character columns)
usable, the same budget every other single-line field on this screen already uses (title, race line,
class line all start at column 2 with no wrapping). Both real strings — `"White Robe (Solinari)"` (21
chars) and `"Red Robe (Lunitari)"` (19 chars) — are well under this budget, confirmed by direct
character-count this round. No truncation risk, no collision with the Knight/Deity branches (mutually
exclusive by construction: `knightOrder` only exists with a `knight` class, `deity` only with a
`cleric` class, `robe` only with a `magicUser` class, and a human — the common case — can only ever
hold one class).

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **`referenceDb.ts`'s `Class`-label collision** (flagged M37, unpicked M38/M39) | Still real, still cheap, still unpicked — but a stronger, more mechanically-consequential candidate (`robe`) turned up this round in a different, unswept file, so per the standing preference for the strongest available pick, the cosmetic rename is deferred again. Would make a fine, safe M41 pick if nothing else surfaces next round. |
| **`monsterCategory()`'s remaining live-mechanic fields** (`regenPerRound`/`halfDamage`/`conSaveBonus`/`itemPluses`/`carriedItems`/`preparedSpellIds`) | **Not re-investigated**, per this round's brief (M39 already re-derived all six in depth this year and found the same standing blockers: `halfDamage` needs a DoK Companion-Panel e2e scaffold that doesn't exist yet; the rest are DoK-only-invariant, array-shaped, or both). No new angle found. |
| **Item-instance subsystem** (`DokItemRecord.value`/`.magicBonus`/`.charges`/`.cursed`) | **Not re-investigated**, per this round's explicit instructions — blocked 11 consecutive rounds. |
| **`CharacterSheet.spellSlots` recomputed instead of read** — `magic.ts`'s `casterInfo()` calls `spellSlots()`/`clericSpellSlots()` fresh rather than reading the already-derived `sheet.spellSlots` computed at creation | Investigated and rejected: this is **not** a "never displayed" gap — `sheet.spellSlots` **is** shown once, in `create.ts:314-318`'s post-creation preview panel, and the mage's slots ARE shown persistently via the (better-suited) Memorize screen's own live header (`magic.ts`'s `Level N used/total` rows). The redundant-computation angle is a code-cleanliness observation (both derivations should always agree, since they call the same underlying `spellSlots()`/`clericSpellSlots()` — no drift risk found), not a display bug, so it doesn't fit this loop's shape. |
| **`PartyMemberStatus.age` / `hudPanel.ts`'s `HudRow`** — `memberAge()` (`party.ts:191`) is decompile-grounded (`ovr021`'s `NormalizeClock` year-overflow → `age+=1`, `docs/engine/research/decompile-worklist.md:163-171`), golden-tested (`gameClockCalendar.test.ts:99-104`), read into `partyStatus()` (`party.ts:415`) — yet `hudPanel.ts`'s `buildRows()` (`hudPanel.ts:45-56`) drops it, and it is exposed to **zero** UI, only to the `__explore.ages()` e2e seam (`explore.ts:1785`) | Investigated in real depth, genuinely close to shipping, but rejected on **value** grounds, not correctness: the explorer's own doc comment (`explore.ts:735-738`) states the age-increment event "is effectively never [true] in normal play" because the clock's year slot has **radix 256** — a party would need to play through 256 in-game years for a single `agePartyYears` call to ever fire. In practice `memberAge()` returns the flat `DEFAULT_AGE = 20` seed for every character, forever, for any realistic session. Showing "Age: 20" on every single character permanently would be a static, non-varying display — the same red-flag shape M31/M38 caught in the item-instance subsystem (`.value` always ×256, `.cursed` true 96% of the time), just self-disclosed by the engine's own comment rather than discovered by probing. A real, wired, tested field — but not one whose display would show a player anything that ever changes. |
| **`MapCell.doorsOpen`** (persisted per-edge unlocked-door state, `model/index.ts:174`, set by `world/explorer.ts:209-217`'s `openDoor`/`closeDoor`) never distinguished from a locked door on the Automap panel (`render/automapPanel.ts`'s `edgeColor()` only branches on `doors` 0/1/2, never `doorsOpen`) | Investigated and rejected as **out of scope for a single-round slice**: tracing the mechanic found that `world/explorer.ts:154`'s `edgeBlocks()` — the function that actually decides whether a step is blocked — never reads `doorsOpen` at all (a door with `doors[dir] !== 0` is always passable, regardless of lock state), and the door bash/pick/knock attempt-tracking API (`getDoorAttempts`/`useDoorAttempt`, `explorer.ts:194-203`) is **never called from any UI file** (`grep` across `apps/web/src` for `useDoorAttempt`/`getDoorAttempts`/`bash`/`knock`/`pick` inside `explore.ts` returns nothing). This is a structurally incomplete subsystem (no lock-picking UI exists at all yet) rather than a single missing display row — fixing the *display* would misrepresent a mechanic that doesn't yet gate anything. Flagged as a real, larger follow-on (build the lock-pick UI + wire `edgeBlocks` to respect it, *then* the Automap can honestly show locked-vs-open). |
| **`MonsterRecord.acSource`** (`'canon'` AC-injection provenance flag, `moncha.ts`, DQK UMBERHULK only) | Investigated and rejected: this is an internal audit-honesty marker for the *decoder itself* ("for audit honesty", `moncha.ts:104`), not a player-facing game fact — no established precedent in this project for surfacing decoder provenance metadata in a companion UI, and doing so for exactly one monster would be a strange, singular addition with no real payoff. **[RETIRED 2026-08-21 — fidelity-plan §29.** `acSource` is gone: UMBER HULK's AC byte (2) was never consumed by the compressor. It was out of reach because the decoder decompressed each `MONCHA.GLB` member from byte 0 and ate the member's 2-byte big-endian uncompressed length as RLE control bytes. With the length word skipped the archive-wide `acSource` count is **0** and no monster carries an injected stat, so this row's subject no longer exists.**] |

## Open questions / unknowns

- **Whether a non-human Knight/Mage multi-class character (e.g. half-elf, `classes.ts:37`) should ever
  show their robe instead of/alongside "Knight of the …"** is left as `Knight` taking priority
  (matching the existing Knight-over-Deity precedent) — **UNKNOWN** whether any real playtested build
  has ever hit this combination; not re-ordered this round since it would require a value judgement
  about display priority with no concrete case driving it.
- **Whether `DokItemRecord`-imported / DQK-native characters could ever meaningfully carry a robe
  concept** is **UNKNOWN** — out of scope, since neither `importParty.ts` nor `importDokParty.ts` sets
  `.robe` today, and Robe-of-the-Moons is documented (Journal pp. 15-16) as a Champions-of-Krynn-era
  mage mechanic specifically; whether DoK/DQK's own mage NPCs (if any exist in those games' source
  material) had an equivalent is not investigated here.
- **`PartyMemberStatus.age`/`HudRow`** (see Rejected alternatives) is a genuinely wired, tested,
  decompile-grounded field with zero display anywhere — worth revisiting **only if** a future
  mechanic ever makes aging visible in normal play (e.g. an accelerated-aging trap/curse/haste-drain
  effect, which several Gold Box games do model), at which point the same `hudPanel.ts` gap identified
  here would become a live target instead of a degenerate one.
- **`MapCell.doorsOpen`** (see Rejected alternatives) is a real, sizeable follow-on: the door
  bash/pick/knock subsystem (`explorer.ts`'s `getDoorAttempts`/`useDoorAttempt`) is fully modelled
  engine-side but has **zero** UI wiring of any kind (not a display gap — a whole missing verb/UI
  gap). Flagged for a future phase, not a single-round slice.

## Implications for our engine

- **Widening the sweep beyond `referenceDb.ts` paid off exactly as M39's own "Implications" section
  predicted it might** — the strongest candidate this round was one file over, in `charSheet.ts`, a
  file no prior M-round (M24-M39) had ever swept for this failure shape. The three-consecutive-round
  exhaustion M39 flagged was real for `referenceDb.ts` specifically, not for the UI layer as a whole.
- **Not every "computed but unwired" field is decoded from a real `.DAX`/`.GLB` game-data file.** This
  round's pick is the first in the M35-M40 series grounded in the engine's own *ruleset* logic
  (character creation + the Journal manual's moon-phase table) rather than a byte-level asset decode.
  The failure shape (a mechanically-live field never reaching its natural UI projection) is identical;
  only the grounding differs. Future sweeps should treat ruleset-derived `CharacterSheet` fields as
  fair game alongside `MonsterRecord`/`ItemRecord`, cross-referencing against `party.ts`/`magic.ts`
  /`combat.ts` for "already has a real mechanical consumer" the same way `monster.ts` fields are
  checked against `combat.ts`.
- **A field with TWO independent live mechanical consumers (spell slots AND combat saves) is a
  stronger signal than M38/M39's single-consumer picks** — worth treating "how many real systems
  already read this" as a tiebreaker when multiple candidates are otherwise similarly cheap, the same
  way this round preferred `robe` over the (also real, also cheap-looking) `age`/HUD candidate once the
  latter's "effectively never fires" caveat surfaced.
- **A field's own doc comment can be the fastest route to correctly rejecting it.** The `age` candidate
  looked identical in shape to a strong pick until `explore.ts:735-738`'s own comment ("effectively
  never… in normal play") was read carefully — a reminder to read the *engine's own already-written
  caveats* before writing new probes to discover the same thing more slowly.
- **Fixed-layout screens (`charSheet.ts`/`composeCharSheet`) need a different feasibility check than
  scrolling-list panels (`referenceDb.ts`).** There is no row-count cap to budget against; the real
  constraint is per-line character width. Future single-line-footer/header candidates on this or
  similar fixed screens should be checked the same way this round did: count the real string lengths
  against the screen's established usable-column convention, not against `REFERENCE_DB_DETAIL_ROWS`.

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `packages/engine/test/_scratch_m40_robe.test.ts` (7 assertions: `createCharacter()`'s real
  `.robe` pass-through for white/red/no-robe/non-mage, `moonPhaseForDay`'s real per-robe/per-day
  variety, `moonPhaseMods`'s real low/high-sanction numbers, and a hand-reproduction of
  `party.ts`'s `spellSaveForMember` formula) — run via `npx vitest run` (7/7 passed), then deleted.
- Confirmed via `git status --porcelain` (clean except this doc) after deletion.
