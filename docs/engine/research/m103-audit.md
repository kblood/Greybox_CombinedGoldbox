# M103 audit — the CoK Journal's own printed "Range of Ability Scores by Race" table appears to contain a typesetting defect for Human males (INT/WIS/DEX print as "3-8", not "3-18"), silently "corrected" by both the project's research doc and the engine's code, with no annotation of the divergence anywhere

> Audit method: read `docs/engine/research/m102-audit.md` and `m101-audit.md` in full first per the
> brief's mandatory first step, then read `m100-audit.md` and `m99-audit.md` in full and skimmed
> `m98-audit.md`. `git log` confirms M94-M102's fixes are all **already shipped** (`93437bf`, `7af9357`,
> `07e7406`, `5d75b1f`, `515a005`, `2d6c93a`, `9d161ef`, `5ea4aa1`, `ae7f23b`), so this round reads the
> current, already-more-advanced source, not a stale snapshot. `git status --porcelain` was clean at
> session start (no stray `m39-audit.md`/`_scratch_m39_verify.test.ts` in the actual working tree —
> consistent with M96-M102's own repeated note about this same stale-preamble illusion in the
> environment's static context block).

## Mandatory first check (per instruction #6): is M102's OWN shipped fix (`ae7f23b`) complete and correct against its own sketch?

**Yes — checked thoroughly, comes up clean.** `git show ae7f23b -- apps/web/src/ui/mainMenu.ts` shows
both lines M102's own sketch specified landed exactly where the sketch placed them:

```diff
 function move(delta: number): void {
   if (!state) return;
   const n = COK_MAIN_MENU.length;
   state.selected = ((state.selected + delta) % n + n) % n;
+  setStatus(''); // M102 — a Guard/Drop/Add/Load confirmation is stale the moment the player looks elsewhere
   draw();
 }
 ...
-    case 'Escape': e.preventDefault(); state.selected = COK_MAIN_MENU.length - 1; draw(); return;
+    case 'Escape': e.preventDefault(); state.selected = COK_MAIN_MENU.length - 1; setStatus(''); draw(); return;
```

`git show ae7f23b -- apps/web/test/e2e.mjs` also confirms the regression test M102's own sketch called
for was added: `runMainMenu()` now drives `move(1)` right after the empty-party Begin guard fires and
asserts `status() === ''` (`guardClearOk`), folded into the case's existing `ok` predicate — a genuine
**clearing** assertion, not a repeat of the pre-existing **setting** assertion (`guardOk`). **M102's fix
is fully and correctly shipped — no further action needed there.** Moving to a fresh thread per
instruction #6.

## Triage of the carried-forward threads (per the brief's "pick one OR find something fresh, grep-check first")

1. DoK-import `CoreClassId` excludes ranger/knight (M32/M86/M94-M102) — re-confirmed still true
   (`importDokParty.ts:123`). Not picked.
2. `createCharacter()`'s missing per-class ability-score minimums (M94-M102) — still open, still a
   two-part fix. Not picked.
3. DQK's distinct manual "Paladin" row vs. "Knight" (M93-M102) — still **UNKNOWN**. Not picked.
4. **A full page-image audit of every remaining CoK/DoK numeric table not yet independently re-derived
   (M96's closing suggestion, carried forward again at M103's explicit steer: "MAX_LEVEL in classes.ts,
   races.ts's ability score ranges")** — **picked**, scoped to `races.ts`'s ability-range table
   specifically (the one explicitly named as not-yet-independently-verified). This is the thread that
   paid off this round.
5. Whether "Extra spells" (deities.ts) should ever become a real mechanical grant — not picked.
6. Whether `select()` (e2e-seam-only cursor setters) should be patched for consistency — not picked.
7. Whether `mainMenu.ts`'s dead `teardown(clearStatus)` parameter should be implemented/removed — not
   picked (a separate, currently-inert quirk noted by M102; no new angle this round).

## Bounded check of M102's named unswept "clear-on-sibling" candidates (per this round's steer)

Per the steer's explicit permission to give this a "bounded, cheap look" and not force a fifth instance,
this round checked all four files M102 named (`artmap.ts`, `catalog.ts`, `library.ts`, `referenceDb.ts`)
for the M99-M102 "transient per-action confirmation field some siblings clear but a cursor-move handler
doesn't" shape. **All four ruled out, cheaply, on structural grounds:**

| File | Verdict |
|---|---|
| `catalog.ts` | Zero hits for `status\|note\b\|message\|flash` at all (`grep` confirmed) — no such field exists in this file. |
| `artmap.ts` | Its `setStatus()`/`note` writers (`artmap.ts:96-99,187-193,308`) only ever write a legacy `#status` DOM element or a one-shot validation-error `<div>` appended once at build time — no persisted, on-canvas, per-action confirmation field a cursor-move handler could leave stale. |
| `library.ts` | Same shape as `artmap.ts` — `setNote()` (`library.ts:291-294`) only writes a `#library-note` DOM element for async folder-read errors; no persisted canvas field. |
| `referenceDb.ts` | Has a `setStatus()` (`referenceDb.ts:69-72`, DOM-only, same as the other three) **and** a `view.status` field fed into the real on-canvas compositor (`referenceDb.ts:269`) — but that `status` string (`` `${sel+1}/${count}  TAB CATEGORY  ↑↓ NAV  ESC CLOSE` ``) is recomputed **fresh, from live state, on every single `drawScreen()` call**, identical to the "pure function of live state, not a settable field" shape already ruled out for `automapPanel.ts` (M102) and `eclInspector.ts` (M102) — there is nothing to clear because nothing is ever "set and left." |

Consistent with M102's own closing prediction, this sub-case shows diminishing returns (4 checked, 0
hits this round, following M102's 5-checked/1-hit). Per the steer's explicit permission, this round did
**not** grind further through the remaining unswept UI files for this exact shape and pivoted immediately
to a fresh angle instead.

## Headline finding

**`packages/engine/src/ruleset/addnd1e-dragonlance/races.ts`'s `DL_RACES.human` entry encodes INT/WIS/
DEX as `3-18` for both sexes, matching the CoK Journal's printed "Range of Ability Scores by Race" table
(p. 56) **only for the Female row** — a fresh, independent, high-resolution page-image re-read of the
actual PDF (not `pdftotext`, and not the more careful `pdfplumber` word-clustering pass the project's own
research doc used) shows the table's **Male** row literally prints `3-8` for INT, WIS, and DEX, not
`3-18`.** This is, almost certainly, a typesetting/print defect in the original 1990 manual — a dropped
"1" digit across three consecutive cells in one row of a hand-typeset table — not an intentional
Dragonlance-specific rule: 1st-edition AD&D has no canonical gender-based INT/WIS/DEX asymmetry (only
STR's "exceptional strength" percentile is gendered, and the table's own Human row correctly reflects
*that* asymmetry two columns over: Male `3-18(00)` = 100% vs. Female `3-18(50)` = 50%). The manual's own
Human **Female** row, printed two lines below, correctly shows `3-18` for INT/WIS/DEX — and every other
cell in the entire table (all 6 non-human races × both sexes × 6 abilities) was re-derived this round and
matches `races.ts` exactly (see verification table below). **Human-male INT/WIS/DEX is the only
discrepancy found anywhere in this table.**

The interesting, actionable part isn't "the code is wrong" — it almost certainly isn't; `races.ts`'s
current `3-18` values are correct-per-AD&D-sanity and per the manual's own female row, and are what any
faithful decompile should keep. **The gap is that nothing in the codebase or its own cited research doc
says so.** Both `races.ts`'s doc comment ("Values transcribed from the ... table ... Journal printed
p. 56") and `docs/engine/research/cok-dragonlance-rules.md §2` (which rates this exact row **"confidence:
high"**) currently imply a clean, verified, verbatim transcription — when in fact the doc's own
`pdfplumber` word-clustering extraction pass silently produced `3-18` for a cell the physical page
actually prints as `3-8`, and no round in this loop's 102-round history ever went back to the raw pixels
to check. A future round doing exactly the kind of "faithful re-transcription against the primary source"
work this loop has repeatedly done elsewhere (M93's DQK table, M96's Knight-order fix) could easily read
this cell, see "3-8" plainly printed, and "fix" `races.ts` to match — which would be a severe, immediately
game-breaking regression (see reachability below): no Human male could then be created as a Mage, Cleric,
or above INT/WIS/DEX 8 at all, contradicting both ordinary CoK play and the game's own manual elsewhere.

## Verification — the actual page image, not `pdftotext`/`pdfplumber`

**Source:** `Champions of Krynn/Journal.pdf`, PDF page index 29 (0-based) = printed page 56, rendered
this round via `pypdfium2` (already available in the environment) at 4x and 10x native scale — a direct
PDF-to-bitmap render of the vector/text content, not a scanned image, so there is no OCR ambiguity at
either zoom level. The "Range of Ability Scores by Race" table's Human row, at 10x scale (crisp, full
native PDF rendering, screenshot captured and read this round):

```
Human      | 3-18(00) | 3-8  | 3-8  | 3-8  | 3-18 | 3-18
(Females)  | 3-18(50) | 3-18 | 3-18 | 3-18 | 3-18 | 3-18
```

The "3-8" cells are unambiguous at this resolution — the digit "1" is simply absent, not merged, smudged,
or obscured by any artifact; the same three columns one row down (Female) clearly print "3-18" in the
same font, at the same size, in the same table. This was independently re-rendered and re-read twice at
two different zoom levels (4x full-page-spread, then a tight 10x crop of just the Human rows) with the
identical result both times, per this round's own effort to rule out a rendering fluke before treating it
as a real discrepancy.

**Every other cell in the table was cross-checked against `races.ts` this round and matches exactly**
(full table re-transcribed from the 4x page image, compared cell-by-cell against `DL_RACES` in
`races.ts:61-97`):

| Race (sex) | STR (page image) | STR (`races.ts`) | INT/WIS/DEX/CON/CHA (page image) | matches `races.ts`? |
|---|---|---|---|---|
| Human (M) | 3-18(00) | `male: r(3,18)`, `exceptionalPct: 100` | **INT 3-8, WIS 3-8, DEX 3-8**, CON 3-18, CHA 3-18 | STR/CON/CHA yes; **INT/WIS/DEX no — code has 3-18** |
| Human (F) | 3-18(50) | `female: r(3,18)` (single `exceptionalPct`, see secondary finding) | INT 3-18, WIS 3-18, DEX 3-18, CON 3-18, CHA 3-18 | yes, all six |
| Silvanesti Elf (M/F) | 3-18(75) / 3-16 | `r(3,18)` / `r(3,16)`, `exceptionalPct: 75` | INT 10-18, WIS 6-18, DEX 7-19, CON 6-18, CHA 12-18 | yes, all |
| Qualinesti Elf (M/F) | 7-18(75) / 3-16 | `r(7,18)` / `r(3,16)`, `exceptionalPct: 75` | INT 8-18, WIS 6-18, DEX 7-19, CON 7-18, CHA 8-18 | yes, all |
| Hill Dwarf (M/F) | 9-18(99) / 3-17 | `r(9,18)` / `r(3,17)`, `exceptionalPct: 99` | INT 3-18, WIS 3-18, DEX 3-17, CON 14-19, CHA 3-12 | yes, all (incl. the STR-min digit `9`) |
| Mountain Dwarf (M/F) | 8-18(99) / 3-17 | `r(8,18)` / `r(3,17)`, `exceptionalPct: 99` | INT 3-18, WIS 3-18, DEX 3-17, CON 12-19, CHA 3-16 | yes, all (incl. the STR-min digit `8`) |
| Half-Elf (M/F) | 3-18(90) / 3-17 | `r(3,18)` / `r(3,17)`, `exceptionalPct: 90` | INT 4-18, WIS 3-18, DEX 6-18, CON 6-18, CHA 3-18 | yes, all |
| Kender (both) | 6-16 | `r(6,16)`, `exceptionalPct: 0` | INT 6-18, WIS 3-16, DEX 8-19, CON 10-18, CHA 6-18 | yes, all |

**This also independently resolves `cok-dragonlance-rules.md`'s own "medium confidence" hedge** (its §2
confidence paragraph, `cok-dragonlance-rules.md:74-76`: *"Mountain Dwarf male STR min `8` vs Hill Dwarf
male `9` ... flagged **medium** for that single digit"*) — re-verified this round at 4x zoom directly
against the page image: **both digits are correct as transcribed** (Hill Dwarf `9`, Mountain Dwarf `8`),
closing that specific hedge with a real, independent confirmation. The doc's caution there was reasonable
but, as it turns out, this round found the actual undetected error sitting in a *different* row the doc
had rated "high" confidence, not the row it had already (correctly, conservatively) flagged.

## Existing sibling/precedent and the self-flagging evidence

**Grep results (discipline #1), confirming this is genuinely new, not a re-proposal:**

```
$ grep -rn "cok-dragonlance-rules\|Range of Ability Scores\|3-8\b\|Human.*3-18\|races\.ts.*Journal" \
    docs/engine/research/m*-audit.md
(37 hits total, spanning M25/M26/M62/M63/M64/M87/M89/M92/M93/M96/M98 -- every one examines a DIFFERENT
 question: M25's exceptionalStrengthCap wiring, M26's giant-class/Knight-order mechanics, M62/M64's moon-
 phase mechanic citations, M63's "a Human fighter could start at STR 3" observation (about the STR floor,
 not the INT/WIS/DEX ceiling), M87/M89's XP-averaging citations, M92/M93's MAX_LEVEL table work, M96's
 KNIGHT_ORDER_MINIMUMS fix (a DIFFERENT table entirely -- classes.ts, not races.ts), M98's deities table.
 None of the 37 ever re-derives races.ts's OWN "Range of Ability Scores by Race" table cell-by-cell
 against a fresh page image, or names the Human-Male INT/WIS/DEX cell specifically.)

$ grep -rln "typesetting\|printer defect\|misprint\|erratum\|errata" docs/ packages/engine/src/
(zero hits anywhere in the project -- this specific "the primary source itself looks defective" framing
 has never been used before in this loop, a genuinely new category of finding, not just a new instance.)
```

No prior round (M1-M102) ever names this cell, or re-derives `races.ts`'s ability-range table against a
fresh page image at all — M96 explicitly said as much in its own closing "Open questions" ("this round
spot-checked `MAX_LEVEL`... but did **not** re-derive every cell [of `races.ts`/`deities.ts`] against a
fresh page-image read"), and this round is the first to actually do that re-derivation for `races.ts`.

**Git-blame — the discrepancy has been in the codebase and the research doc since the very first commit
of each, one day apart, and has never been touched since:**

```
$ git log --format="%h %cd %s" --date=iso -S "int: r(3, 18), wis: r(3, 18), dex: r(3, 18)" \
    -- packages/engine/src/ruleset/addnd1e-dragonlance/races.ts
bc7a210 2026-06-21 13:21:09 +0200 M2.S4: addnd1e-dragonlance overlay (CoK races/classes/deities/moons)
(one hit -- the line has never been modified since the file's original commit)

$ git blame -L 50,53 -- docs/engine/research/cok-dragonlance-rules.md
bc7a2100 (Kasper 2026-06-21) | Race (sex) | STR* | INT | WIS | DEX | CON | CHA |
bc7a2100 (Kasper 2026-06-21) |------------|------|-----|-----|-----|-----|-----|
bc7a2100 (Kasper 2026-06-21) | Human (M)  | 3-18(00) | 3-18 | 3-18 | 3-18 | 3-18 | 3-18 |
bc7a2100 (Kasper 2026-06-21) | Human (F)  | 3-18(50) | 3-18 | 3-18 | 3-18 | 3-18 | 3-18 |
```

Both `races.ts` and the research doc it cites were authored in the **same original research pass**
(`bc7a210`, 2026-06-21, the very first commit of the Dragonlance ruleset overlay) and have been
byte-identical to each other, and silently divergent from the primary source's Male row, ever since —
through over 100 rounds of audits, several of which (M63, M96) closely read one or the other for
unrelated questions without noticing.

## Reachable in real, ordinary, shipped play — dynamic proof

This is not a hypothetical data question — `abilityRange('human', 'int'|'wis'|'dex', 'male')`'s **current**
`3-18` return value is a real, live, mechanically-consumed fact today, via two independent real call
sites, both re-read in full this round:

- **`apps/web/src/ui/create.ts:237-248`** — the "Create Character" screen's own ability-input cells:
  `const r = abilityRange(draft.race, k, draft.sex);` sets the literal HTML `<input min max>` bounds
  (`inp.min = String(r.min); inp.max = String(r.max);`) **and** the on-screen `"${r.min}-${r.max}"` label
  printed directly under each stat, **and** the `Roll 4d6` button's clamp ceiling
  (`clampAbility(draft.race, draft.sex, k, rollAbility())`, `create.ts:255`). Every ordinary Human Male
  character built through this real, front-door screen sees "INT 3-18" on screen and can type or roll up
  to 18 today.
- **`packages/engine/src/ruleset/addnd1e-dragonlance/character.ts:140-146`** — `createCharacter()`'s own
  validation gate: `const range = abilityRange(req.race, key, sex); if (v < range.min || v > range.max)
  errors.push(...)`. This is the real accept/reject gate every created character passes through.

**Dynamic re-derivation this round** (a throwaway vitest script against the real, unmodified production
functions — `packages/engine/test/_scratch_m103_verify.test.ts`, created, run, then deleted):

```ts
abilityRange('human', 'int', 'male')  // => { min: 3, max: 18 }  (today's real, live value)
createCharacter({ name: 'Test Mage', race: 'human', sex: 'male', classes: { magicUser: 1 },
  abilities: { str: 10, int: 15, wis: 10, dex: 10, con: 10, cha: 10 }, hp: 4, maxHp: 4, baseAc: 10 })
  // => { ok: true, ... }   -- an ordinary Human Male Mage, INT 15, is accepted today
createCharacter({ name: 'Test Cleric', race: 'human', sex: 'male', classes: { cleric: 1 },
  abilities: { str: 10, int: 10, wis: 15, dex: 10, con: 10, cha: 10 }, deity: 'mishakal',
  hp: 6, maxHp: 6, baseAc: 10 })
  // => { ok: true, ... }   -- an ordinary Human Male Cleric, WIS 15, is accepted today
```

RESULT: all 4 assertions passed (`vitest run`, 1 file, 4/4 green), confirming (a) today's code genuinely
returns `3-18`, matching this document's claim, and (b) demonstrating the practical hazard concretely: a
`wouldReject(v) = v < 3 || v > 8` check (what the manual's literal Male-row print implies) evaluates
`true` for both the INT-15 Mage and the WIS-15 Cleric above — i.e., **a literal "fix" to match the
manual's printed Human-Male row would immediately reject the single most ordinary Human spellcaster
builds in the game.** The scratch file was deleted immediately after this round confirmed the output;
`git status --porcelain` confirmed clean before and after, this doc the only new file.

## Secondary finding (related, but NOT currently reachable — noted for completeness, not part of the fix)

**`races.ts`'s `StrengthRange` interface has a single, sex-agnostic `exceptionalPct: number` field per
race, but the manual's own table gives Human males and females *different* exceptional-STR percentages**
(Male `(00)` = 100%, Female `(50)` = 50% — the *only* race/sex pair in the whole table where both sexes
can reach STR 18 at all; every other race's female STR max is below 18, so no percentile applies to them,
consistent with the table's own footnote). `clampToRace()` (`races.ts:122-143`) correctly uses
`def.str[sex]` for the STR min/max range itself, but then clamps the exceptional percentile via
`def.str.exceptionalPct` — the single, non-sex-specific field, currently set to `100` (the Male value) —
with no `[sex]` lookup at all:

```ts
// races.ts:138-141, current source
if (scores.strPct !== undefined) {
  out.strPct = str >= 18 ? Math.min(scores.strPct, def.str.exceptionalPct) : 0;  // sex-blind
}
```

**This round traced every real call site and confirmed it is NOT reachable in ordinary play today**,
unlike the headline finding above:
- `apps/web/src/ui/importParty.ts:238` (CoK→DoK internal transfer) calls `convertImportedCharacter`
  (which internally calls `clampToRace`), but its own comment (`importParty.ts:232-234`) explicitly says
  *"we never copy the race-capped `conv.abilities` back"* — the clamped `strPct` is computed and then
  discarded; only `name`/`modId`/`controlMorale`/`alignment`/`paladinLevel`/`rangerLevel` survive.
- `apps/web/src/ui/importDokParty.ts` (per M88) calls `clampToRace(sc.abilities, 'human', 'male')` with a
  **hardcoded** `'male'` literal — the female branch of this exact bug can never fire through this call
  site regardless.
- The general cross-game `importCharacter()`/`ImportSource` dispatcher (`packages/engine/src/save/
  import.ts`, the one path that *would* pass a real, data-derived `sex`) has **zero** call sites anywhere
  in `apps/web/src` (confirmed by grep this round) — it is exercised only by
  `packages/engine/test/saveImportRoster.test.ts`, a unit test, with no UI wiring at all.
- `create.ts` has no exceptional-STR-percentile input of any kind (`strPct` defaults to `0` and is never
  set by any control) — re-confirming M25's finding still holds, a full two Milestones-worth of rounds
  later (`exceptionalStrengthCap`, the sibling function, still has zero call sites too, also re-confirmed
  this round).

So this is a real, verifiable, primary-source-grounded latent defect, but — per discipline #4 — **not
currently reachable by any real player action**, and is therefore explicitly **not** part of this round's
proposed fix; noted only so a future round wiring a percentile input into `create.ts` (M25's own named
prerequisite) doesn't introduce this exact sex-blindness as a fresh bug at that time.

## Proposed fix (documentation + comment only — no behavior change; audit scope is research only)

**This is unlike every one of M92-M102's fixes: the numbers in the code are already correct and should
NOT change.** The fix is to make the divergence from a literal reading of the cited primary source
explicit, in both places that currently imply a clean match:

1. **`docs/engine/research/cok-dragonlance-rules.md` §2** — correct the Human (M) row to show what the
   manual actually prints, with an explicit callout, e.g.:
   ```
   | Human (M)  | 3-18(00) | **3-8*** | **3-8*** | **3-8*** | 3-18 | 3-18 |
   ```
   `*` footnote: *"The manual's printed Male row literally shows 3-8 for INT/WIS/DEX — almost certainly a
   typesetting defect (a dropped '1'), since the Female row two lines below correctly shows 3-18 for the
   same three abilities, 1e AD&D has no canonical gender-based INT/WIS/DEX asymmetry, and the engine's
   own `races.ts` (matching the Female row and ordinary play) has always used 3-18 for both sexes. Not
   treated as a literal source to transcribe from for this one cell; see `m103-audit.md`."* Downgrade the
   confidence annotation for this one cell from the blanket "high" to "flagged: probable print defect,
   code intentionally does not follow the literal Male-row print."
2. **`packages/engine/src/ruleset/addnd1e-dragonlance/races.ts:62-66`** (the `human` entry) — add a
   one-line doc comment noting the intentional divergence, so a future "re-transcribe against the primary
   source" pass doesn't treat this as an oversight to "fix":
   ```ts
   // sketch, not applied this round -- races.ts
   human: {
     id: 'human', name: 'Human', multiClass: false,
     // NOTE (M103): the Journal's printed table (p.56) shows "3-8" for Male INT/WIS/DEX -- verified via
     // direct page-image read, almost certainly a print defect (dropped "1"); the Female row two lines
     // down correctly shows 3-18, matching 1e AD&D's actual rules (no gender INT/WIS/DEX asymmetry).
     // Intentionally kept at 3-18 for both sexes; do not "fix" to match the literal Male-row print.
     str: { male: r(3, 18), female: r(3, 18), exceptionalPct: 100 },
     int: r(3, 18), wis: r(3, 18), dex: r(3, 18), con: r(3, 18), cha: r(3, 18),
   },
   ```

Both are pure documentation/comment additions — zero behavior change, zero risk, and directly addressed
at the exact failure mode this finding demonstrates (a future round "faithfully" matching literal print
values without checking AD&D-sanity or the row immediately below).

**Not proposed as part of this round's fix** (see "Secondary finding" above): splitting `StrengthRange`'s
`exceptionalPct` into `{ male: number; female: number }` — a real, well-scoped, additive follow-up, but
gated on the same "no percentile input in `create.ts` yet" prerequisite M25 already named, so left as an
explicitly flagged latent item rather than folded into this round's fix.

## Rejected alternatives considered this round

| Candidate | Why rejected |
|---|---|
| DoK-import `CoreClassId` excluding ranger/knight (M32/M86/M94-M102) | Re-confirmed still true, still correctly scoped; no new angle found this round. |
| `createCharacter()`'s missing per-class ability-score minimums (M94-M102) | Re-confirmed still open, still a two-part fix; not picked, consistent with prior rounds. |
| DQK's distinct "Paladin" row (M93-M102) | Still **UNKNOWN**; no new primary source consulted this round. Left open. |
| `artmap.ts`/`catalog.ts`/`library.ts`/`referenceDb.ts` for the "clear-on-sibling" shape (M102's four named candidates) | All four checked this round and structurally ruled out (see table above) — no persisted, on-canvas, one-off-confirmation status field in any of the four. Consistent with the steer's prediction of diminishing returns; not force-continued into a wider sweep. |
| `clampToRace`'s sex-blind `exceptionalPct` (found while investigating the headline) | Real, verified, but every real call site either discards the clamped `strPct` (`importParty.ts`) or hardcodes `'male'` (`importDokParty.ts`) or has zero UI wiring at all (`save/import.ts`'s general dispatcher) — not reachable in ordinary play today. Documented as a secondary, explicitly-non-headline observation instead of the main finding. |
| MAX_LEVEL (`classes.ts`) full page-image re-derivation | Not repeated this round — M92/M93 already did a careful pass on the CoK table specifically (via the appendix's "Maximum Level Limits by Race, Class and Prime Requisite" table, also visible on this same p.56 page image, re-glanced at this round and consistent with M92/M93's own transcription — no new discrepancy spotted on a visual skim, though not re-verified cell-by-cell this round since `races.ts`'s table was the one explicitly named as not-yet-done). |

## Open questions / unknowns

- **Whether the lead session wants the documentation fix applied now** (both are comment/doc-only, zero
  behavior risk) — this round proposes but does not apply it, per the audit-is-research-only scope.
- **Whether `StrengthRange`'s `exceptionalPct` should be split by sex** even though nothing reaches it
  today — a real, scoped, low-priority follow-up, gated on `create.ts` ever gaining a percentile input
  (M25's own named prerequisite, still unaddressed after many rounds).
- **Whether the same "does the primary source itself contain an error" question should be asked of
  `deities.ts`'s table** — M98 fully cross-checked `deities.ts` against the primary source and found no
  discrepancy (per the CLAUDE.md steer's own note), but that check pre-dates this round's specific
  "the manual itself, not just the code/doc, might be defective" framing; not re-investigated this round.
- **Whether Manual.pdf or Cluebook.pdf contain an independent second printing of this exact table** to
  cross-verify the "print defect, not intentional rule" theory against a second physical source — checked
  this round (`get_textpage()` keyword search, both files) and **neither contains this table at all**
  (Manual.pdf is an 8-page quick-reference; Cluebook.pdf is a walkthrough) — so Journal.pdf's printed p.56
  remains the sole primary source available in this repo for this specific table; the "print defect"
  conclusion rests on internal consistency (the Female row, AD&D 1e rules, and live gameplay) rather than
  a second, independent physical copy.

## Implications for our engine / for the taxonomy

- **A new taxonomy sub-case, sibling to M93's "OCR tooling defect" and M96's "human copy-paste slip," but
  with the error located in the opposite place**: M93's DQK table was wrong because `pdftotext` mangled a
  page with column-bleed; M96's `KNIGHT_ORDER_MINIMUMS` was wrong because a human transcriber slipped
  copying an adjacent row. **This round's cross-check instead suggests the physical manual itself contains
  the defect** — and, notably, both the code *and* the project's own careful `pdfplumber`-based research
  doc independently arrived at the *same*, most-likely-correct value (`3-18`), meaning nothing here is
  actually broken today. The lesson: **"cross-check the transcribed data against the primary source" can
  legitimately conclude "the primary source itself is probably wrong, and the code should NOT be fixed to
  match it" — not every re-verification should end in a code change**, and documenting *that* conclusion
  explicitly is itself a valid, durable, useful audit output, distinct from every prior round's "here is a
  one-line code fix" shape.
- **A confident doc-comment citation ("Values transcribed from... Journal printed p. 56") plus a
  "confidence: high" rating in a research doc are not, by themselves, evidence the transcription is
  pixel-accurate** — this is the second time this exact lesson has been independently re-learned (M96's
  "even a clean, unambiguous source text can be mis-transcribed by hand" / "a codebase's own confident doc
  comment is not itself evidence of correctness"), now extended to automated (`pdfplumber` word-clustering)
  extraction specifically, not just hand transcription.
- **Checking a named, specific, not-yet-done carried-forward thread (M96's own closing suggestion, reduced
  by this round's steer to "races.ts's ability score ranges" specifically) paid off on the very first
  primary-source page rendered** — consistent with M100-M102's repeated finding that an audit's own
  explicitly-named "worth checking next" item is a stronger prior than a cold sweep.

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `packages/engine/test/_scratch_m103_verify.test.ts` (a throwaway vitest file calling the real,
  unmodified `abilityRange`/`createCharacter`/`DL_RACES` production exports) — run once (`vitest run`,
  1 file / 4 tests, all green, output captured verbatim above), then deleted. `git status --porcelain`
  confirmed clean before and after.
- Scratch PDF-render PNGs (`journal_p29.png`, `journal_p30.png`, `journal_p30_crop.png`,
  `journal_human_row.png`, `journal_human_row2.png`, `journal_p30_10x.png`, `journal_human_row_10x.png`) —
  written to the session scratchpad directory (outside the repo), not the working tree; none committed.
