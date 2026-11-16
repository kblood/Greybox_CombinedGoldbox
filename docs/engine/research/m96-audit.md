# M96 audit — `KNIGHT_ORDER_MINIMUMS.sword`'s DEX/CON floor was copy-pasted from Rose's row on day one, and has silently under-promoted every eligible Knight of the Sword since

> Audit method: read `docs/engine/research/m95-audit.md` in full first per the brief's mandatory first
> step, then read `m94-audit.md` in full and skimmed `m92`/`m93-audit.md` for the established taxonomy.
> Confirmed both M94's and M95's proposed fixes are **already shipped** (not just proposed) — `git log`
> shows `feat(M94.S1)` (`93437bf`) and `feat(M95.S1)` (`7af9357`) as real, landed commits, and re-grepped
> the current source (`create.ts` imports `addPlayer`/`RosterMember`; `character.ts` has
> `levelCapRuleset`/`dqkMaxLevel` wired) to verify this before treating either as still-open. `git status
> --porcelain` was clean at session start (the stale `m39-audit.md`/`_scratch_m39_verify.test.ts` entries
> in this task's own `gitStatus` preamble do not exist in the working tree — confirmed via a fresh `ls`/
> `git status`; likely a stale snapshot from an earlier point in this long-running session, not a real
> leftover to clean up).
>
> **Triage of the three carried-forward M95 threads** (per the brief's "pick one OR find something
> fresh, grep-check first" instruction):
> 1. DoK-import `CoreClassId` excludes ranger/knight (M32/M86/M94/M95) — re-confirmed still true, still
>    correctly scoped as needing a new race/order signal DoK's save format doesn't carry. Not picked.
> 2. `createCharacter()` has no per-class ability-score minimums (flagged M94, re-confirmed M95) —
>    **investigated in depth this round** (see "Rejected alternatives" — this thread turned out to be
>    real and verifiable, but is a larger, two-part fix than this round's actual pick, and is left open
>    for a future round with its scope now narrowed).
> 3. DQK's distinct manual "Paladin" row vs. "Knight" (M93/M94/M95) — still **UNKNOWN**, no new primary
>    source consulted this round. Not picked.
>
> None of the three carried-forward threads was this round's fix. Instead, while investigating thread 2
> (which required re-reading `classes.ts` in full to check for any existing-but-unused ability-minimum
> machinery), this round found a **different, already-wired, already-shipped mechanism whose own
> transcribed data is provably wrong** — the Knight-of-Solamnia order-petition table
> (`KNIGHT_ORDER_MINIMUMS`) that five separate prior rounds (M26, M66, M72, M92, M94) checked for "is it
> *wired*" (yes, every time) but **no round ever checked whether the transcribed numbers themselves are
> correct**. This round did, using a page-image read (not `pdftotext`) per the brief's discipline #3, and
> found a real, live, single-value-family transcription bug.

## Headline finding

**`packages/engine/src/ruleset/addnd1e-dragonlance/classes.ts`'s `KNIGHT_ORDER_MINIMUMS.sword` entry has
had its DEX and CON minimums copy-pasted from the **Rose** row (`dex: 12, con: 15`) instead of the
Sword row's own real values (Journal.pdf printed p. 9: **DEX 9, CON 10**) since the very first commit
that introduced it (`bc7a210`, M2.S4, 2026-06-21) — the doc comment directly above the table even claims
*"Sword and Rose are verbatim"*, which is false for exactly these two fields.** The practical
consequence, verified by re-running the real, unmodified `createCharacter()`/`petitionableOrder()`
production functions: a Human or Half-Elf Knight built through the game's own, ordinary "Create New
Character" screen with ability scores that **do** meet the manual's real Sword-petition minimums (STR
12, INT 9, WIS 13, DEX 9, CON 10) but fall short of the code's inflated, Rose-borrowed DEX/CON floor is
wrongly reported as **"Knight of the Crown"** instead of the correct **"Knight of the Sword"** — a
difference the player sees directly, twice, on two different screens (`create.ts`'s live creation
preview and `charSheet.ts`'s persistent character sheet), both of which print the exact string
`Knight of the ${knightOrder}` sourced from this one field.

## Existing sibling/precedent and the self-flagging evidence

**Grep results (discipline #1), confirming the *wiring* has been checked five times but the *data* never
once:**

```
$ grep -n "KNIGHT_ORDER_MINIMUMS\|Knights of the Sword\|DEX 9\|CON 10\|petitionableOrder" docs/engine/research/m*-audit.md
m26-audit.md:259  — confirms petitionableOrder() is called live at character.ts:213, no combat bonus to wire further
m66-audit.md:320  — re-confirms it's shown on charSheet.ts/create.ts
m72-audit.md:270  — re-confirms the *type* name (KnightOrder) independently, same verdict a third way
m92-audit.md:294  — explicitly flags it as "a related, separate, already-flagged-elsewhere mechanic...
                    left as an open question below rather than bundled in ... deserves its own dedicated look"
m92-audit.md:330  — "is there a live UI path that lets a Knight actually petition Crown -> Sword -> Rose,
                    and does it (if it exists) check these minimums? Not investigated this round;
                    flagged as a candidate for a future sweep."
m94-audit.md:311  — re-confirmed "already fully wired... a third time", closes the wiring question again
```

Every one of these five citations answers **"is `petitionableOrder()` called?"** (yes) — none of them
ever re-derives or cross-checks the *contents* of `KNIGHT_ORDER_MINIMUMS` against the manual. M92 came
closest, explicitly naming this exact gap as a future candidate ("deserves its own dedicated look"), but
did not pursue it. This round is the first to actually open the manual and compare.

**The self-flagging evidence is in the code's own doc comment**, current source,
`classes.ts:109-113`:

```ts
/**
 * Minimum ability scores to petition each order (Journal printed pp. 5-6). The Crown (entry) order's
 * explicit minimums were not separately printed — a knight just needs the STR/WIS prime-requisite
 * floor — so Crown is modelled as no extra gate beyond being a knight. Sword and Rose are verbatim.
 */
```

*"Sword and Rose are verbatim"* is a direct, falsifiable claim this round falsifies for two of Sword's
five fields.

**`docs/engine/research/cok-dragonlance-rules.md`'s own transcription (line 235) carries the identical
error**, and was added in **the same commit** as the code (`bc7a210`, confirmed via `git log --follow`):

```
git log --format="%h %cd %s" --date=iso -1 -- docs/engine/research/cok-dragonlance-rules.md
bc7a210 2026-06-21 13:21:09 +0200 M2.S4: addnd1e-dragonlance overlay (CoK races/classes/deities/moons)
```

i.e. this is **one root-cause transcription mistake, made once, on day one of the project, propagated
verbatim into both the research doc and the engine code in the same commit** — not two independent
errors, and not an OCR artifact (see "Tooling note" below: this manual's text extracts cleanly, unlike
DQK's, so the mistake is a human copy/paste slip between adjacent table rows during the doc's original
authoring, not a garbled-glyph OCR issue).

### Tooling note — this manual's `pdftotext`/`pdfplumber` extraction is clean (unlike DQK's Journal)

Per the brief's discipline #3, verified with a direct page-image render (`pypdfium2`, the same fallback
M93 established) rather than trusting a second text-extraction pass. Unlike `The Dark Queen of
Krynn/Journal.pdf` (M92/M93's font drops `K`/`Q`/`X` glyphs entirely), `Champions of Krynn/Journal.pdf`
extracts perfectly cleanly via `pdfplumber` — words like "Knights", "Kender", "Qualinesti" all extract
intact, and the raw `pdfplumber` text for this exact paragraph reads (verbatim, no reconstruction):

```
To petition to join the Knights of the Sword a knight must have the following
minimum ability scores: STR 12, INT 9, WIS 13, DEX 9, CON 10.

To petition to join the Knights of the Rose a knight must have the following
minimum ability scores: STR 15, INT 10, WIS 13, DEX 12, CON 15.
```

This was then **independently re-confirmed by rendering and visually reading the actual page image**
(`pdf[6]` 0-indexed via `pypdfium2`, scale 3.0, cropped to the relevant paragraphs) — both extraction
methods agree exactly, and the printed page numbers visible in the rendered image are **9** (left folio,
containing both paragraphs) and **10** (right folio, "Alignment" section) — correcting
`cok-dragonlance-rules.md`'s own citation of *"printed pp. 5–6"* for this specific sub-table, which is
off (the Knight/Sword/Rose material is on printed p. 9, not pp. 5-6; pp. 5-6 covers the earlier
race/class prose). A minor citation fix, bundled into the same correction pass as the data fix.

## Where the severance happens — exact locations, current source

**`packages/engine/src/ruleset/addnd1e-dragonlance/classes.ts:114-118`** (`KNIGHT_ORDER_MINIMUMS`,
current source, full, unchanged since `bc7a210`):

```ts
export const KNIGHT_ORDER_MINIMUMS: Record<KnightOrder, Partial<AbilityScores>> = {
  crown: {},
  sword: { str: 12, int: 9, wis: 13, dex: 12, con: 15 },   // <-- dex/con wrong: Rose's values, not Sword's
  rose: { str: 15, int: 10, wis: 13, dex: 12, con: 15 },   // <-- correct, matches the manual exactly
};
```

The real manual minimums (page-image-verified, printed p. 9): **Sword = STR 12, INT 9, WIS 13, DEX 9,
CON 10.** `dex`/`con` in the shipped `sword` row are Rose's values (12/15), not Sword's own (9/10); `str`,
`int`, and `wis` are all correctly transcribed for both rows.

**`packages/engine/src/ruleset/addnd1e-dragonlance/classes.ts:129-133`** (`petitionableOrder`, current
source, full — the one function that consumes the table):

```ts
export function petitionableOrder(scores: AbilityScores): KnightOrder {
  if (meetsMinimums(scores, KNIGHT_ORDER_MINIMUMS.rose)) return 'rose';
  if (meetsMinimums(scores, KNIGHT_ORDER_MINIMUMS.sword)) return 'sword';  // <-- gated by the wrong DEX/CON floor
  return 'crown';
}
```

**`packages/engine/src/ruleset/addnd1e-dragonlance/character.ts:221`** (`createCharacter`, unchanged,
the one real call site): `if (entries.some(([c]) => c === 'knight')) sheet.knightOrder =
petitionableOrder(req.abilities);`

**The two real, on-screen consumers** (`grep -rn "knightOrder|KnightOrder" apps/web/src` → exactly these
two hits, both display-only, matching M26's already-established "no mechanical bonus, title/tithe/
advancement-gate only" finding — re-confirmed unchanged this round):

```ts
// apps/web/src/ui/create.ts:338 (the live creation-preview panel)
if (s.knightOrder) stats.appendChild(el('span', 'cc-stat', `Knight of the ${cap(s.knightOrder)}`));

// apps/web/src/ui/charSheet.ts:74-75 (the persistent character-sheet screen shown throughout play)
const footer = s.knightOrder
  ? `Knight of the ${titleCase(s.knightOrder)}`
```

## Reachable in real, ordinary, shipped play — static + dynamic proof

**Static reachability, the full real chain:** `mainMenu.ts`'s byte-verified "Create New Character"
command → `startCreate()` (`create.ts`) → the race selector (Human/Half-Elf are the only two races
`allowsClass` permits for Knight) → the Knight class checkbox (no ability gate of any kind blocks
checking it, `create.ts:206-227`) → the six free-form ability-score number inputs, each bounded only by
the racial min/max range (`create.ts:237-250`; human DEX/CON range is 3-18, half-elf DEX/CON range is
6-18 — both trivially permit DEX 9-11 / CON 10-14) — **or** the "Roll 4d6" button (`create.ts:79-83,
252-258`, standard 4d6-drop-lowest, whose typical result band of roughly 8-14 per ability makes a
DEX/CON pair inside the real-Sword-but-not-buggy-Sword gap (9-11 / 10-14) an entirely ordinary, unremarkable
roll, not a contrived edge case) → "Add to party" (`create.ts:353`) → `createCharacter()` →
`petitionableOrder()` → the wrong `'crown'` is written into the persisted `CharacterSheet.knightOrder`
and immediately rendered in the creation-preview panel and, from then on, every time the character sheet
is opened. No save-editing, no dev console, no illegal state — an entirely ordinary character build.

**Dynamic re-derivation this round** (two scratch vitest files, created, run, then deleted — see below;
`git status --porcelain` confirmed clean before and after, this doc the only new file), against the
real, current, unmodified `createCharacter`/`petitionableOrder` production functions imported directly
from `packages/engine/src`:

```
// A Human Knight who meets the REAL Sword minimums (STR12/INT9/WIS13/DEX9/CON10) with margin:
createCharacter({
  name: 'SIR TEST', race: 'human', classes: { knight: 3 },
  abilities: { str: 13, strPct: 0, int: 10, wis: 14, dex: 10, con: 12, cha: 10 },
  hp: 30, maxHp: 30, baseAc: 4,
}) -> { ok: true, sheet: { ..., knightOrder: 'crown' } }   // WRONG — should be 'sword'

// Manual re-check against the real, page-image-verified Sword floor (str>=12, int>=9, wis>=13,
// dex>=9, con>=10) confirms this exact ability spread legitimately qualifies:
meetsRealSword({ str: 13, int: 10, wis: 14, dex: 10, con: 12 }) === true
```

Both assertions run against the real, unmodified `createCharacter`/`petitionableOrder` exports — no
fixtures or mocks. The two scratch files (`packages/engine/test/_scratch_m96_verify.test.ts`,
`_scratch_m96_verify2.test.ts`) were created, run (4/4 passing across both), and deleted before writing
this document.

**Why the existing unit test never caught this:** `packages/engine/test/addnd1e-dragonlance.test.ts:174`
already has a `'sword'`-expecting case, but its ability spread (`dex: 12, con: 15`) happens to satisfy
*both* the correct floor (9/10) and the buggy one (12/15) — it cannot distinguish the two, so it has
passed, green, since M2.S4, without ever exercising the actual boundary the bug lives in. This is a
distinct sub-shape from M86/M89/M90/M95's "test bakes in a wrong value as a passing assertion" — here
the test's assertion is *correct*, but its **input never touches the boundary that would reveal the
bug**, so a real defect hid behind a technically-passing, technically-relevant test for 74 rounds.

## Proposed minimal fix (not applied this round — audit scope is research only)

**A pure two-number data correction, no new machinery, no new field, no new call site:**

```ts
// sketch, not applied this round -- packages/engine/src/ruleset/addnd1e-dragonlance/classes.ts
export const KNIGHT_ORDER_MINIMUMS: Record<KnightOrder, Partial<AbilityScores>> = {
  crown: {},
  sword: { str: 12, int: 9, wis: 13, dex: 9, con: 10 },   // was dex:12, con:15 (M96 — copied from Rose)
  rose: { str: 15, int: 10, wis: 13, dex: 12, con: 15 },
};
```

Plus the doc-comment's false "Sword and Rose are verbatim" claim should be corrected to note the fix
(e.g. *"Sword's DEX/CON were mis-transcribed as Rose's values from M2.S4 through M95; corrected M96,
page-image-verified against Journal.pdf printed p. 9"*).

**Companion doc fix**, same root cause, same commit that introduced it:
`docs/engine/research/cok-dragonlance-rules.md:235` — change the Sword row from `STR 12, INT 9, WIS 13,
DEX 12, CON 15` to `STR 12, INT 9, WIS 13, DEX 9, CON 10`; also correct the page citation from "printed
pp. 5–6" to "printed p. 9" for this specific sub-table (the broader §8 section citation can stay if it
also covers the surrounding prose, but the specific Sword/Rose minimums table should cite p. 9
precisely).

**Test fix, required in the same pass** (per this loop's "the fix and its test travel together"
discipline): `addnd1e-dragonlance.test.ts:174`'s existing `'sword'` case should gain a companion
boundary case that actually distinguishes the two floors:

```ts
// sketch, not applied this round
it('classifies a knight who meets the real Sword floor but not the old, buggy inflated one', () => {
  expect(petitionableOrder({ str: 13, int: 10, wis: 14, dex: 10, con: 12, cha: 10 })).toBe('sword');
});
```

This case is `ok: false` under today's code (`'crown'`) and `ok: true` under the fix (`'sword'`) — a
genuine regression-catcher, not a decorative addition. No e2e change is strictly required (no existing
e2e case names `knightOrder`/"Knight of the" at all, confirmed by grep — a gap in coverage, not a
fixture to update), though a new isolated `?create=1` e2e case asserting the visible "Knight of the
Sword" string for this exact ability spread would be a reasonable, low-cost addition in the same pass.

## Secondary observations not part of this round's fix

- **The bug can only ever *under*-promote, never over-promote**, because `petitionableOrder()` checks
  `rose` first and only falls through to the (buggy, stricter) `sword` check if `rose` fails — so no
  character is ever wrongly promoted to a title above what they truly qualify for; the failure mode is
  always "reported as Crown when the real manual says Sword," never the reverse. This bounds the
  player-visible damage to "your knight's title/rank is understated," not "overstated" — worth noting
  for risk-sizing, though it does not change that the displayed value is simply wrong either way.
- **No mechanical/combat consequence exists for `knightOrder` beyond the title string** — re-confirmed
  unchanged from M26's original finding (no XP/combat bonus keyed to order in either the Journal or the
  COAB decompile). The tithe-percentage and advancement-gate prose the Journal describes for each order
  (Crown 10% vs. Sword/Rose "everything except 20 steel," per the same page image read this round) is
  **not modelled anywhere in this codebase at all** (no gold-tithe mechanic exists) — a separate,
  larger, not-currently-reachable gap, consistent with M26's original scope boundary; not folded into
  this round's fix.
- **`create.ts`'s "Roll 4d6" convenience button makes this reachable via pure random chance, not just
  deliberate manual entry** — worth calling out because it means some fraction of *every* ordinary
  randomly-rolled Human/Half-Elf Knight character this project's own playtesting or the eventual shipped
  product's players create will already have silently hit this exact bug, not just a contrived
  hand-picked ability spread.

## Rejected alternatives considered this round

| Candidate | Why rejected |
|---|---|
| `createCharacter()`'s missing per-class ability-score minimums (M94/M95 thread 2, this round's carried-forward option) | **Investigated in depth and confirmed real**: the CoK Journal (page-image-verified, printed p. 9, same page as this round's actual finding) states *"Rangers must be of good alignment and have ability scores of at least 13 in strength and intelligence and at least 14 in wisdom and constitution"* — a genuine, printed, currently-unenforced rule (`classes.ts`'s own `allowsClass()` doc comment literally says "(ignoring ability minimums)", a second self-flagging admission). Re-ran `createCharacter()` live: a Human Ranger with STR 3/INT 3/WIS 3/CON 3 (or a level-7 Ranger with STR 9/INT 8/WIS 9/CON 9) is accepted as `ok: true` today — confirmed with a throwaway vitest script against the real production function. **Not picked this round** because it is a strictly bigger, two-part change than the Knight-order fix: (a) it needs a *new* validation branch in `createCharacter()` (no existing mechanism to lean on, unlike the Knight-order fix which corrects data inside an already-correct, already-wired mechanism), and (b) the manual's full Ranger rule also requires "good alignment," which `CharacterRequest`/`CharacterSheet` cannot express at all today (the same pre-existing gap M75/M94 already named for the roster-composition gate) — enforcing the ability-score half alone without the alignment half would be a partial, arguably confusing fix. Left open, now with concrete verified numbers (STR13/INT13/WIS14/CON14) and an exact citation (Journal.pdf printed p. 9) for whoever picks it up next; **not re-proposed as a "gap exists" claim only — this round adds the primary-source verification and the exact reachable failure case the two prior rounds (M94/M95) had flagged but not yet nailed down.** |
| DoK-import `CoreClassId` excluding ranger/knight (M32/M86/M94/M95) | Re-confirmed still true, still correctly scoped as needing a new race/order signal; no new angle found this round. |
| DQK's distinct "Paladin" row (M93/M94/M95) | Still **UNKNOWN**; no new primary source consulted this round. Left open. |
| A fresh, unrelated sweep instead of investigating a carried-forward thread | This round's actual pick (`KNIGHT_ORDER_MINIMUMS`) was *found while* investigating carried-forward thread 2, not from a cold fresh sweep — consistent with this loop's stated preference for extending an in-progress investigation over starting a new one, even though the final headline is a different mechanism than the thread that led to it. |

## Open questions / unknowns

- **Whether the fix should also add a `crown` explicit floor** — the Journal does not separately print
  one (confirmed again this round via the same page image: the paragraph before the Sword/Rose minimums
  only says knights "may petition the next higher order" once qualified, with no numeric Crown-entry
  floor stated), so `crown: {}` (no extra gate beyond being a knight at all) remains correct and is not
  part of this fix. Re-confirmed, not changed.
- **Whether DQK's own character-creation path (if any) uses the same `KNIGHT_ORDER_MINIMUMS` table** —
  `dqkParty.ts`'s hand-authored `DQK_HEROES` never sets a Knight class with a `knightOrder` computed via
  this path (confirmed: no `petitionableOrder` call anywhere outside `character.ts`), so this fix has
  zero DQK-side consequence today, consistent with M93's own established Gen1/Gen2 scope boundary. Not
  investigated further.
- **Whether a similar single-value transcription slip exists elsewhere in `classes.ts`'s `MAX_LEVEL`
  table or `deities.ts`/`races.ts`'s tables** — this round spot-checked `MAX_LEVEL` against
  `cok-dragonlance-rules.md`'s §7 table (already independently verified "high confidence" by the
  original research pass, itself checked against the appendix table's `No`-cell/prose cross-reference)
  and found no discrepancy, but did **not** re-derive every cell against a fresh page-image read the way
  M93 did for DQK's table. A genuinely exhaustive page-image audit of every CoK/DoK numeric table in
  `hackdocs_extracted/`/the Journal PDFs remains a standing, not-yet-fully-executed idea (mirrors M93's
  own closing lesson) — worth a dedicated future round if the project wants full transcription-fidelity
  coverage rather than spot-checks.

## Implications for our engine / for the taxonomy

- **A new taxonomy sub-case, sibling to M93's "row-shifted OCR table" shape but with a different root
  cause**: M93's DQK table was wrong because of `pdftotext`'s column-bleed OCR failure on a page with
  two adjacent tables (a *tooling* failure, later caught by switching extraction methods). This round's
  bug is a **pure human copy-paste slip** in a manual, one-time hand-transcription of a short two-row
  table — the underlying source text itself extracts perfectly cleanly by either method. **The lesson
  generalizes beyond "watch out for bad OCR": even a clean, unambiguous source text can be
  mis-transcribed by hand, and a codebase's own confident doc comment ("verbatim") is not itself
  evidence of correctness** — only a fresh, independent re-derivation against the primary source is.
- **Five rounds' worth of "is it wired?" verification (M26/M66/M72/M92/M94) gave zero signal about
  "is the wired data correct?"** — a wiring check and a data-fidelity check are orthogonal, and a
  mechanism can pass the former five times running while silently failing the latter the whole time.
  Worth naming as its own discipline point for this loop: confirming a gate is *reachable and consumed*
  does not confirm the *numbers inside it* are right, and the two need independent verification passes.
- **A genuinely fresh angle surfaced by *investigating* a carried-forward thread rather than by a cold
  sweep** — this round's headline is not thread 2 (the Ranger ability-minimum gap) itself, but something
  found *while checking* thread 2's surrounding file (`classes.ts`) for related, previously-overlooked
  machinery. This is a different discovery mode than M88's "a later round picks up a deferred sibling
  directly" or M93's "a fresh PDF re-read on an explicitly-flagged open question" — it's closer to
  "investigating candidate A turns up unrelated candidate B in the same file," worth keeping in this
  loop's repertoire of legitimate ways to find a fresh, real finding without a blind sweep.
