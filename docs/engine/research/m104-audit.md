# M104 audit — the Training Hall's `trainMember()` recomputes THAC0 and HP on level-up but never touches `CharacterSheet.savingThrows`, leaving every trained character's saves permanently frozen at their creation-time level

> Audit method: read `docs/engine/research/m103-audit.md` and `m102-audit.md` in full first per the
> brief's mandatory first step, then read `m101-audit.md` and `m100-audit.md` in full and skimmed
> `m99-audit.md`/`m98-audit.md` for the established taxonomy. `git log` confirms M94-M103's fixes are all
> **already shipped** (`93437bf`, `7af9357`, `07e7406`, `5d75b1f`, `515a005`, `2d6c93a`, `9d161ef`,
> `5ea4aa1`, `ae7f23b`, `a9a5f5f`), so this round reads the current, already-more-advanced source, not a
> stale snapshot. `git status --porcelain` was clean at session start (no stray `m39-audit.md`/
> `_scratch_m39_verify.test.ts` in the actual working tree — those exist only inside already-committed
> history, consistent with M96-M103's own repeated note about this same stale-preamble illusion in the
> environment's static context block).

## Mandatory first check (per instruction #6): is M103's OWN shipped commit (`a9a5f5f`) complete and correct against its own sketch?

**Yes — checked thoroughly, comes up clean.** M103 was a **doc/comment-only** change (no behavior fix),
so "complete and correct" means: both doc-comment additions its own sketch specified landed exactly as
written, and no unintended behavior change slipped in.

`git show a9a5f5f -- packages/engine/src/ruleset/addnd1e-dragonlance/races.ts` shows the exact `NOTE (M103)`
comment block M103's own sketch proposed landed verbatim on the `human` race entry (5 lines, word-for-word
match to the sketch in `m103-audit.md`'s "Proposed fix" section), with **zero change to any executable
line** — `str`/`int`/`wis`/`dex`/`con`/`cha` values are byte-identical before/after the diff.

`git show a9a5f5f -- docs/engine/research/cok-dragonlance-rules.md` shows the corrected, footnoted Human
(M) row (`3-8†` cells with the `†` explanation) and the upgraded Hill/Mountain-Dwarf-STR-min confidence
note, both matching M103's own sketch's wording and intent.

Re-ran the quality gates myself rather than trusting the commit message alone:
- `cd packages/engine && npx tsc --noEmit` → clean, zero errors.
- `cd packages/engine && npx vitest run` → **134 files / 1366 tests, all green** — matches the commit
  message's own claimed count (`1366/1366`) exactly, confirming the comment-only change didn't silently
  regress anything.

**M103's fix is fully and correctly shipped — no further action needed there.** Moving to a fresh thread
per instruction #6.

## Triage of the carried-forward threads (per the brief's "pick one OR find something fresh, grep-check first")

1. DoK-import `CoreClassId` excludes ranger/knight (M32/M86/M94-M103) — re-confirmed still true
   (`importDokParty.ts:123`). Not picked.
2. `createCharacter()`'s missing per-class ability-score minimums (M94-M103) — still open, still a
   two-part fix. Not picked.
3. DQK's distinct manual "Paladin" row vs. "Knight" (M93-M103) — still **UNKNOWN**. Not picked.
4. **A full page-image cross-check of `classes.ts`'s `MAX_LEVEL` table** (M103's own explicitly-named
   "not yet done cell-by-cell" item, steered again this round) — **investigated in full** (see below).
   Result: **every cell matches exactly, zero discrepancy** — a genuine, useful negative result, but not
   itself this round's headline (nothing to fix). See "MAX_LEVEL cross-check" section below.
5. Whether "Extra spells" (deities.ts) should ever become a real mechanical grant — not picked.
6. Whether `select()` (e2e-seam-only cursor setters) should be patched for consistency — not picked.
7. Whether `mainMenu.ts`'s dead `teardown(clearStatus)` parameter should be implemented/removed — not
   picked (a separate, currently-inert quirk; no new angle this round).
8. Whether `races.ts`'s `StrengthRange.exceptionalPct` should be split by sex (M103) — not picked; still
   gated on `create.ts` never gaining a percentile input, unchanged this round.

None of the carried-forward threads became this round's headline; the `MAX_LEVEL` cross-check (item 4)
was investigated in full first (per the steer's explicit priority-3 instruction) and closed as a **clean,
verified-correct** table, then this round pivoted to a fresh sweep (priority-1 instruction) that found a
genuinely new wiring gap — see below.

## MAX_LEVEL cross-check — CLOSED, no discrepancy found (a real, useful negative result)

Per the steer's priority-3 instruction, this round rendered `Champions of Krynn/Journal.pdf` PDF page
index 29 (printed pages 55/56, the same spread `races.ts`'s ability-range table lives on, per M103) via
`pypdfium2` at 4x native scale — a direct PDF-to-bitmap vector render, no OCR/scan ambiguity — and read
the **"Maximum Level Limits by Race, Class and Prime Requisite"** table (bottom-right of printed p. 56)
directly off the rendered image, independently of `pdftotext`/`pdfplumber` (both of which badly interleave
this table's three extra columns — Hill Dwarf/Mountain Dwarf/Kender — with the adjacent Strength/Range
tables in raw extraction order, confirmed by inspecting `page.get_textpage().get_text_range()`'s output
for this page, which is why the original research doc used x/y clustering in the first place).

**Cell-by-cell comparison, page image vs. `packages/engine/src/ruleset/addnd1e-dragonlance/classes.ts:33-41`
(`MAX_LEVEL`):**

| Class (tier) | Human | Silvanesti | Qualinesti | Half-Elf | Hill Dwarf | Mtn Dwarf | Kender |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Cleric (Any) | 8 | 8 | 8 | 8 | 8 | 8 | 8 |
| Fighter (Str 16-/17/18+) | 8/8/8 | 8/8/8 | 8/8/8 | 8/8/8 | 8/8/8 | 8/8/8 | 5/6/7 |
| Ranger (Str 16-/17/18+) | 7/7/7 | 7/7/7 | 7/7/7 | 7/7/7 | 7/7/7 | No/No/No | 5/6/7 |
| Knight (Any) | 7 | No | No | 7 | No | No | No |
| Mage (Int 16-/17/18) | 8/8/8 | 8/8/8 | 8/8/8 | 8/8/8 | No/No/No | No/No/No | No/No/No |
| Thief (Any) | 9 | No | 9 | 9 | 9 | 8 | 9 |

Every one of these 42 page-image cells (7 races × 6 class rows, with Fighter/Ranger/Mage each expanding
to their 3 prime-requisite tiers) was checked against `classes.ts`'s `MAX_LEVEL` object (including the
`KENDER_FR = { str16: 5, str17: 6, str18: 7 }` tiered cap, and every `null`/"No" cell) — **all 42 match
exactly, with zero discrepancies.** This is a genuine, independent, from-the-page-image re-verification
(not a re-trust of the existing `cok-dragonlance-rules.md` §7 table, though that table also matches),
closing the specific carried-forward item M103 named ("re-verified at M103 with no discrepancy spotted on
a visual skim... not re-verified cell-by-cell") with an actual cell-by-cell pass this time. **No code or
doc change is warranted from this check** — consistent with M102's own precedent that a thorough
re-verification can legitimately conclude "everything here is already correct," which is itself a useful,
durable thing to have confirmed and recorded (this table now has two independent confirmations: M92/M93's
original x/y-clustering transcription, and this round's direct page-image cell-by-cell read).

## Headline finding

**`apps/web/src/ui/party.ts`'s `trainMember()` — the Training Hall's real, only level-up function, shared
by all three games via `town.ts` — recomputes a trained character's THAC0 (via a level-delta) and max HP
(via `levelHpGain()` + the Constitution bonus, M87.S1) on every level gained, but never touches
`CharacterSheet.savingThrows` at all. A character's five saving-throw targets
(`paralyzePoisonDeath`/`petrifyPolymorph`/`rodStaffWand`/`breath`/`spell`) are computed exactly once, at
character creation, from the AD&D-1e class/level save table (`addnd1e/combatTables.ts`'s `savingThrows()`)
— and then frozen at that creation-time level for the rest of the character's life, even as the character
trains up through the exact same Training Hall screen that correctly advances THAC0 and HP in the same
call.** A Human Fighter trained from level 2 to level 3 (the Journal's own printed save table, verified
below) should see all five saves improve by one point (better) — but the stored `CharacterSheet` shows
**byte-identical** saving throws before and after, confirmed by driving the real, unmodified production
code end-to-end through a real headless browser session (see "Dynamic proof" below).

This is the exact same **"structurally-parallel-resolver gap"** shape M87 found and fixed for the
Constitution HP bonus (`levelHpGain()`'s own doc comment: *"Constitution per-level bonus, if modelled, is
added by the host on top"* — the host never did, until M87 wired it) — but for a **different derived
field** (`savingThrows`, not `hp`) that M87's own fix, and every round since (M88, M92, M93, M95, all of
which touched `trainMember()` for other reasons), never extended to.

## The real, level-dependent fact and its existing, shipped creation-time consumer

`packages/engine/src/ruleset/addnd1e/combatTables.ts:56-70,83-87` (`SAVES`/`savingThrows()`, current
source) — the AD&D-1e save-throw table, indexed by class and level, transcribed from the `coab` decompile:

```ts
// fighter row (levels 0..12) -- levels 1 and 2 are IDENTICAL; level 3 is a real, different, better row
fighter: [[20,20,20,20,20], [14,15,16,17,17], [14,15,16,17,17], [13,14,15,16,16], ...],
...
export function savingThrows(classId: ClassId, level: number): SavingThrows {
  const [paralyzePoisonDeath, petrifyPolymorph, rodStaffWand, breath, spell] = SAVES[ROW[classId]][col(level)];
  return { paralyzePoisonDeath, petrifyPolymorph, rodStaffWand, breath, spell };
}
```

(Every other class shows the identical "flat for a run of levels, then a real jump" shape: cleric flat
levels 1-3, jumps at 4; magicUser flat 1-5, jumps at 6; thief flat 1-4, jumps at 5 — so a **fighter
2→3** transition is the minimal real case that exercises an actual, non-degenerate change, which is why
this round's dynamic proof below uses exactly that transition rather than 1→2.)

**Real, shipped consumer #1 — character creation**
(`packages/engine/src/ruleset/addnd1e-dragonlance/character.ts:175-204`, current source, in full):

```ts
const saves: SavingThrows = { paralyzePoisonDeath: 20, petrifyPolymorph: 20, rodStaffWand: 20, breath: 20, spell: 20 };
...
for (const [cls, level] of entries) {
  const core = coreClass(cls);
  ...
  const cs = baseSaves(core, level);                       // baseSaves === savingThrows, aliased on import
  for (const cat of SAVE_CATEGORIES) saves[cat] = Math.min(saves[cat], cs[cat]);
  ...
}
if (POISON_RESISTANT_RACES.has(req.race)) saves.paralyzePoisonDeath -= conPoisonSaveBonus(req.abilities.con);
...
const sheet: CharacterSheet = { ..., savingThrows: saves, ... };
```

**Real, shipped consumer #2 (of the resulting stored field) — real tactical combat.**
`apps/web/src/ui/party.ts:701-711` (`spellSaveForMember`, current source):

```ts
export function spellSaveForMember(id: string, day = 0): number | undefined {
  ...
  const base = sheet.savingThrows.spell;    // <-- reads the STORED, creation-time-frozen field
  ...
  return base - mods.saveMod;               // moon-phase shift on top, but the base itself never updates
}
```

...which `packages/engine/src/combat/combat.ts:352` feeds directly into the real combat resolver as
`save: side === 'party' && !demo ? spellSaveForMember(c.id, day) : c.monsterSpellSave` — the actual d20
target a party member's figure must roll ≥ to resist an enemy spell in tactical combat (Sleep, Hold
Person, Fireball's half-damage branch, etc. — `combat/tactical.ts:176`'s own doc comment: *"Sourced from
the ruleset's verified save tables"*).

**Real, shipped consumer #3 (player-visible, not just internal combat math) — the Character Sheet
screen.** `apps/web/src/ui/charSheet.ts:34-40,99` (`SAVE_ROWS`/`toView`, current source):

```ts
const SAVE_ROWS = [
  { label: 'Paralyze/Poison/Death', key: 'paralyzePoisonDeath' }, /* ...all 5... */
];
...
saves: SAVE_ROWS.map((r) => ({ label: r.label, value: s.savingThrows[r.key] })),   // reads the stored field
```

So the stale numbers are not merely an internal combat implementation detail — a player who trains a
character and then opens their own Character Sheet (a completely ordinary, front-door action) is shown
the wrong (too-high, i.e. worse-than-actual) saving-throw numbers as a plain fact on their character
sheet, in addition to the numbers silently being wrong the next time that character resists a spell in
combat.

## Where the severance happens — exact locations, current source

**`apps/web/src/ui/party.ts:1008-1035`** (`trainMember`, current source, in full — every derived stat it
touches, and the one it doesn't):

```ts
export function trainMember(name: string, levelCapRuleset: 'cok' | 'dqk' = 'cok'): TrainResult {
  const s = roster.find((m) => m.name === name);
  if (!s) return { ok: false, name, reason: 'no such character' };
  const cls = primaryClass(s.classes);
  const core = coreClass(cls);
  const level = s.classes[cls] ?? 1;
  const cap = levelCapRuleset === 'dqk' ? dqkMaxLevel(s.race, cls) : maxLevel(s.race, cls, s.abilities.str);
  const chk = checkTraining(core, level, getXp(name), getGold(), cap);
  if (!chk.eligible) return { ok: false, name, reason: chk.reason, cost: chk.cost };
  addGold(-chk.cost);
  const isWarrior = core === 'fighter' || core === 'ranger';
  const conBonus = ADND1E_ABILITIES.constitution(s.abilities.con, isWarrior).hp;   // M87.S1
  const gain = levelHpGain(hitDie(core)) + conBonus;
  s.maxHp += gain;
  s.hp = s.maxHp;
  // Attack table improves as level rises (lower THAC0 = better); apply the delta to the sheet's value.
  const thac0Delta = classThac0(core, level) - classThac0(core, chk.targetLevel);
  s.thac0 = s.thac0 - thac0Delta;                                                  // <-- THAC0: recomputed
  s.classes = { ...s.classes, [cls]: chk.targetLevel };
  persist();
  return { ok: true, name, newLevel: chk.targetLevel, hpGain: gain, cost: chk.cost };
  // <-- s.savingThrows is never read, written, or mentioned anywhere in this function.
}
```

Confirmed by grep this round: `grep -n "savingThrows" apps/web/src/ui/party.ts` → exactly **one** hit in
the whole file, `spellSaveForMember`'s read at line 705 — never a write, and never inside `trainMember`.
`grep -n "savingThrows\|classSaves" apps/web/src/ui/party.ts` at the top-level `@goldbox/engine` import
block (`party.ts:10-66`) → **zero hits**: unlike M87's Con-bonus fix (which reused an already-imported
`ADND1E_ABILITIES` object this file already called twice elsewhere), the `savingThrows` combat-table
function isn't imported into `party.ts` **at all** today — this fix needs one small new import, not just
a new call on an object already in scope.

**Git-blame — the gap has existed since `trainMember()`'s very first commit, survived M87's own sibling
fix, and survived M92/M93/M95's own repeated edits to this exact function for unrelated reasons:**

```
$ git log --format="%h %cd %s" --date=iso -S "export function trainMember" -- apps/web/src/ui/party.ts
b2cd1f0 2026-06-22 09:50:58 +0200 A5.2: town hub -- shop, temple, training hall, tavern

$ git log --format="%h %cd %s" --date=iso -S "thac0Delta" -- apps/web/src/ui/party.ts
b2cd1f0 2026-06-22 09:50:58 +0200 A5.2: town hub -- shop, temple, training hall, tavern
(thac0Delta shipped in the SAME commit that introduced trainMember() itself)

$ git log --format="%h %cd %s" --date=iso -S "conBonus = ADND1E_ABILITIES.constitution" -- apps/web/src/ui/party.ts
9dff0bd 2026-07-05 15:47:16 +0200 feat(M87.S1): apply the Training Hall level-up's Constitution HP bonus
(M87 added the sibling HP fix ~2 weeks later, but never extended the same "structurally-parallel-
resolver" reasoning to savingThrows)

$ grep -c "savingThrows" apps/web/src/ui/party.ts
1   (unchanged across every one of M87/M88/M92/M93/M95's own edits to this exact function)
```

`trainMember()` has been edited by at least four separate audit-driven commits since its original
`b2cd1f0` (the M87 Con-bonus fix, the M92/M93 level-cap-ruleset threading, and whatever produced the
current `levelCapRuleset` parameter) — none of them touched `savingThrows`, even though M87's own fix is
the textbook example of exactly this shape (a level-dependent AD&D-1e table correctly consulted at
creation, silently un-consulted at training) applied to a *different* field.

## Existing sibling/precedent and the self-flagging evidence (discipline #1)

```
$ grep -n "trainMember" docs/engine/research/m*-audit.md
(37 hits, spanning M25/M34/M64/M65/M66/M75/M87/M88/M92/M93/M95/M101 -- every one examines a DIFFERENT
 question: M25's levelHpGain wiring, M34's setInventory/trainMember call-graph risk note, M64/M66's
 passing mentions, M65's own close reading of trainMember() (found the Con-HP-bonus gap but did NOT pick
 it as that round's headline -- flagged as an "Open question" instead), M75's "fully wired, no gap" verdict
 on the training economy generally, M87's own Con-HP-bonus fix (picked, shipped), M88's DoK-import
 sibling-formula check (a DIFFERENT function, sheetFromDokSaved), M92/M93's level-cap-ruleset threading,
 M95's own closing-lesson citation of M92/M93's fix, M101's e2e-seam note (buy/sell/heal/train bypass
 activate(), unrelated to this finding). NONE of the 37 ever mentions savingThrows, baseSaves, or the
 SAVES/combatTables table in the same sentence as trainMember() at all.

$ grep -n "savingThrows" docs/engine/research/m*-audit.md | grep -iv "monster\|MonsterRecord\|moncha\|DAX\|HLIB\|referenceDb\|companionPanel"
(zero hits -- every prior mention of `savingThrows` in this loop's 103-round history is about the
 UNRELATED MonsterRecord.savingThrows decoded-monster-byte field (M27/M28/M29/M31/M32/M38/M39/M40/M43/
 M55/M56/M60/M61/M62/M65/M67/M68/M81/M83), never the CharacterSheet.savingThrows party-member field's
 lifecycle across a level-up.)
```

No prior round (M1-M103) ever asks whether `trainMember()`'s level-up correctly re-derives
`CharacterSheet.savingThrows`, even though `trainMember()` itself has been directly read, quoted, and
edited by at least six different rounds for other reasons (M65, M87, M88, M92, M93, M95) — the same
"a heavily-mined function can still hold an independent, unmined shape" lesson M96-M103 have each
re-confirmed, now applied to the single function in this codebase most repeatedly touched by this exact
audit loop for other findings.

**M65's own near-miss is worth naming explicitly**: M65 read `trainMember()` closely enough to find the
Con-HP-bonus gap (later fixed by M87), but M65's own text (`m65-audit.md:226`) frames it purely as *"a
formula-completeness gap in a game mechanic... not this loop's 'decoded value dropped before reaching the
UI' shape"* and stops there — it never asks the more general question ("does *every* level-dependent
derived stat get recomputed, or just HP?") that would have surfaced this round's finding eight rounds
earlier. This is the same lesson M87 itself already drew (*"worth periodically re-reading already-swept
files' doc comments against a widened mandate"*) — apparently not yet exhausted, since it just paid off a
second time on the very same function.

## Reachable in real, ordinary, shipped play — dynamic proof

**Static reachability, the full real chain:** `town.ts` is the single, shared Training Hall host for
**all three games** (`grep -rn "from './town.js'" apps/web/src/ui/*.ts` → `dqkExplore.ts`, `main.ts`,
`mainMenu.ts`, `play.ts` all import `startTown`) → select **Training Hall** → cursor to any eligible party
member → activate **Train** → `trainMember()` runs, unconditionally, on every successful level-up, in
every game.

**Dynamic re-derivation this round** (a throwaway Puppeteer script, mirroring `e2e.mjs`'s own `runTown()`
Sturm fixture exactly — same race/abilities/starting class — driving a real headless Edge session through
the real `?create=1` → `?town=1` flow, reading the real, persisted `localStorage['greybox.party.cok']`
JSON directly before and after training, rather than trusting any specific window seam's completeness;
created, run, then deleted):

```
1. ?create=1, fresh party cleared: build "Sturm", human, onlyClass('fighter', 2), STR17/INT10/WIS12/
   DEX15/CON16/CHA13 (the exact e2e.mjs Sturm fixture, but level 2 instead of level 1) -> add().
   Seed localStorage: gold=9000, xp={Sturm: 4000} (fighter's real level-3 XP threshold, progression.ts).
2. Read localStorage['greybox.party.cok'] directly -> Sturm's stored savingThrows BEFORE training.
3. ?town=1 (fresh page load; roster persists via localStorage) -> window.__town.train("Sturm").
4. Read localStorage['greybox.party.cok'] directly again -> Sturm's stored savingThrows AFTER training.

RESULT (captured verbatim from the real, unmodified, currently-shipped production code):
{
  "trainOk": true,
  "newLevel": 3,
  "classLabelAfter": "FTR 3",
  "thac0Before": 19,
  "thac0After": 17,
  "thac0Changed": true,
  "savingThrowsBefore": { "paralyzePoisonDeath": 14, "petrifyPolymorph": 15, "rodStaffWand": 16, "breath": 17, "spell": 17 },
  "savingThrowsAfter":  { "paralyzePoisonDeath": 14, "petrifyPolymorph": 15, "rodStaffWand": 16, "breath": 17, "spell": 17 },
  "savingThrowsUnchanged": true
}
```

Training genuinely advanced Sturm from fighter level 2 to level 3 (`newLevel: 3`, `classLabelAfter: "FTR
3"`), correctly improved his THAC0 (19 → 17, matching `classThac0('fighter',2)=20` →
`classThac0('fighter',3)=18`, a delta of 2 applied on top of his existing STR-hit offset) — but his stored
`savingThrows` are **byte-identical, all five categories**, before and after. Per the printed AD&D-1e
fighter save table (`combatTables.ts`'s own `SAVES.fighter[3]`, `[13,14,15,16,16]`) vs. what a level-2
fighter should already show (`SAVES.fighter[2]`, `[14,15,16,17,17]`), a correctly-recomputed Sturm should
show every save one point better (lower) after this exact training action — he shows none.

This ran against the real, unmodified, currently-shipped `party.ts`/`town.ts`/`create.ts` production code,
driving a real headless Edge session through the real `?create=1`/`?town=1` routes and the real
`window.__create`/`window.__town` seams (`train()` calls the real `trainMember()`; no fixtures, no mocks;
`localStorage` reads pulled the real, persisted, production-serialized `CharacterSheet`, not a seam's
possibly-partial projection of it). The script (`apps/web/test/_scratch_m104_verify.mjs`) was created,
run (output captured above), then deleted before writing this document; `git status --porcelain`
confirmed clean before and after, this doc the only new file.

**Why the existing e2e test never caught this**: `runTown()` (`e2e.mjs:3892`) already trains Sturm
1→2 and asserts `maxHpAfter`/`train.hpGain`/`classLabelAfter`/`thac0`-adjacent facts — but fighter levels
1 and 2 have **identical** rows in the save table (`SAVES.fighter[1] === SAVES.fighter[2]`), so even a
hypothetical `savingThrows`-comparing assertion added to that exact fixture would silently pass whether or
not the bug is fixed — the existing 1→2 fixture is structurally incapable of exposing this bug, which is
why this round's script deliberately used a 2→3 transition instead. No existing e2e or unit test anywhere
in the repo reads or asserts on `CharacterSheet.savingThrows` across any training action (confirmed by
`grep -n "savingThrows" apps/web/test/e2e.mjs packages/engine/test/*.test.ts` restricted to
training-adjacent context → no hits), so this is a genuine, wholly unexercised coverage gap, not a test
that bakes in a wrong value.

## Proposed minimal fix (not applied this round — audit scope is research only)

**Mirrors the exact delta pattern `trainMember()`'s own `thac0Delta` already uses for THAC0** — same
shape, same file, same function, one new small import:

```ts
// sketch, not applied this round -- apps/web/src/ui/party.ts
// New import alongside the existing `thac0 as classThac0`:
import { /* ...existing... */, thac0 as classThac0, savingThrows as classSaves } from '@goldbox/engine';

// Inside trainMember(), immediately after the existing thac0Delta block:
const SAVE_KEYS = ['paralyzePoisonDeath', 'petrifyPolymorph', 'rodStaffWand', 'breath', 'spell'] as const;
const savesBefore = classSaves(core, level);
const savesAfter = classSaves(core, chk.targetLevel);
for (const k of SAVE_KEYS) {
  s.savingThrows[k] -= savesBefore[k] - savesAfter[k]; // same "delta, preserve existing baked-in offsets" shape as thac0Delta
}
```

Notes on the sketch:
- **Uses the same delta convention as the existing `thac0Delta` line, not a from-scratch recompute** —
  this naturally preserves whatever offset creation baked in (the STR/deity THAC0 adjustment for THAC0;
  for saves, the `conPoisonSaveBonus` flat offset `createCharacter()` applies to
  `paralyzePoisonDeath` for Hill Dwarf/Mountain Dwarf/Kender, since that offset depends only on
  Constitution, which training never changes) without this function needing to know those offsets exist.
- **`savingThrows` (aliased `classSaves` to avoid colliding with the `SavingThrows` type name already
  imported) is not currently imported into `party.ts` at all** — unlike M87's fix (which reused an
  already-imported `ADND1E_ABILITIES`), this needs one new named import from the same existing
  `@goldbox/engine` import block (`party.ts:10-66`) — still a small, additive, one-file change.
- **Inherits the same, already-accepted "single (primary) class only" simplification `thac0Delta` already
  has** — for a multi-class character, `createCharacter()` takes the *best* (lowest) save across every
  class (`Math.min` per category), but `trainMember()` only ever levels the character's one `primaryClass`
  or recomputes on it; this sketch does not attempt to fix that pre-existing, already-documented
  simplification (M87/M88 both explicitly left "multi-class HP averaging" out of scope for the identical
  reason) — flagged here, not silently expanded, so a future round doesn't mistake this fix for a full
  multi-class recompute.
- **No change needed to `town.ts`, `render/townScreen.ts`, `charSheet.ts`, or any other consumer** — every
  downstream reader already reads `sheet.savingThrows` directly; fixing the one write site fixes all of
  them for free, exactly like M87's HP fix did.
- **No existing test needs to be flipped** — confirmed by grep above, zero existing tests assert on
  `savingThrows` across any training action; only a *new* regression assertion needs adding.
- **The e2e regression this fix should add** (mirrors M87/M92-M103's "the fix and its test travel
  together" discipline): extend `runTown()`'s existing training step, or add a small new case, using a
  **2→3** (not 1→2) transition specifically — since fighter levels 1 and 2 share an identical save row,
  a 1→2 fixture cannot distinguish fixed from unfixed code (as this round's own script had to work around).
- Update `trainMember()`'s own doc comment (`party.ts:1008-1015`) to mention saves are now also
  recomputed, mirroring how M87's fix updated the same doc comment for the Con-HP-bonus addition.

## Rejected alternatives considered this round

| Candidate | Why rejected |
|---|---|
| DoK-import `CoreClassId` excluding ranger/knight (M32/M86/M94-M103) | Re-confirmed still true, still correctly scoped; no new angle found this round. |
| `createCharacter()`'s missing per-class ability-score minimums (M94-M103) | Re-confirmed still open, still a two-part fix; not picked, consistent with prior rounds. |
| DQK's distinct "Paladin" row (M93-M103) | Still **UNKNOWN**; no new primary source consulted this round. Left open. |
| `classes.ts`'s `MAX_LEVEL` table, full page-image cross-check (M103's own named next item) | Fully re-derived cell-by-cell (42 cells) against a fresh page-image render this round — **zero discrepancies found**, closing the item with a genuine, useful negative result (see dedicated section above). Not itself a code-change finding. |
| `thiefSkillPercent`/`recalcThiefSkills` (re-examined while hunting for a fresh wiring gap) | Re-confirmed exactly what M24/M25/M61/M82/M92 already established: zero real callers anywhere (no LOCK/TRAP mechanic exists to consume it) — fails this loop's "already has a real consumer" bar outright, not a partial-consumption gap. Not re-proposed. |
| `startTown()`'s `levelCapRuleset` default-vs-DQK-context threading (checked for a fresh "gate wired at one site, missing at a sibling" candidate) | Traced every real call site (`main.ts` ×2, `mainMenu.ts`, `play.ts`, `dqkExplore.ts`) — the four `'cok'`-default sites are all genuinely CoK-only routes/flows (dev-preview buttons, the CoK main-menu, the stitched `?play=cok` session); only `dqkExplore.ts` needs (and correctly passes) `'dqk'`. No missing-sibling gap found; correctly scoped already. |
| `createCharacter()`'s `levelCapRuleset` param and `create.ts`'s never passing it | Re-confirmed correct: `create.ts` is CoK-only, defaulting to `'cok'` is right; the DQK-destined callers (`dqkParty.ts`, `importDokParty.ts`) already pass `'dqk'` explicitly. No gap. |

## Open questions / unknowns

- **Whether the lead session wants the sketch above applied now** — a small, additive, one-file,
  low-risk fix (mirrors an already-shipped sibling pattern exactly) — this round proposes but does not
  apply it, per the audit-is-research-only scope.
- **Whether the fix should also attempt the fuller multi-class recompute** (iterating every class in
  `s.classes`, taking the best save per category, the way `createCharacter()` does) rather than the
  single-primary-class delta sketched above — this round deliberately scoped the fix to mirror
  `thac0Delta`'s existing (already-accepted) simplification rather than solve multi-class HP/THAC0/saves
  averaging all at once; a genuine, larger follow-up if the lead wants full correctness for multi-classed
  trained characters, consistent with M87/M88's own explicit "multi-class HP averaging: out of scope"
  scoping decision on the sibling HP fix.
- **Whether `sheetFromDokSaved()` (`importDokParty.ts`) or `convertImportedCharacter()`
  (`importParty.ts`) have an analogous gap for a *newly-inferred* level's saves** — not investigated this
  round (out of scope; both build a sheet once, at import time, via `createCharacter()`, so they don't
  share `trainMember()`'s specific "recompute on a later mutation" shape — flagged only as a possible
  adjacent question for a future round, not confirmed as a real gap).
- **`classes.ts`'s `MAX_LEVEL` table is now independently confirmed correct twice** (M92/M93's original
  x/y-clustering transcription, and this round's direct page-image cell-by-cell read) — no further
  re-verification of this specific table is needed unless a future primary-source page becomes available.

## Implications for our engine / for the taxonomy

- **A new, concrete instance of the "structurally-parallel-resolver gap" shape M87 first named** — two
  "compute this character's combat stat at this level" call sites (`createCharacter()` at creation,
  `trainMember()` at every subsequent level-up), one correctly re-derives the level-dependent value
  (`thac0`, and since M87, HP's Con bonus), the other (`savingThrows`) is never touched at all. This is
  the *third* field found with this exact shape in the same function (HP's Con bonus — M87, fixed;
  THAC0 — correct from `trainMember()`'s very first commit; now `savingThrows` — never correct, still
  open), reinforcing M87's own closing heuristic ("check every method of every already-imported
  ruleset-math object for an unused sibling") one level further: **check every *field* a creation-time
  function derives for a level-up function that claims to keep a character "trained," not just the fields
  a previous audit round already happened to fix.**
- **A function that has been edited by six separate audit-driven commits for six different reasons can
  still have an untouched, load-bearing gap** — `trainMember()` is, by grep count, the single most
  repeatedly-audited non-UI-overlay function in this loop's 104-round history, and this shape survived
  every one of those passes because each was scoped to a narrower question (Con-HP-bonus specifically,
  the level-cap ruleset specifically) rather than "does this function correctly maintain every
  level-dependent stat it claims to."
- **A minimal, low-risk fix that exactly mirrors an already-shipped sibling pattern in the same function**
  (the `thac0Delta` shape) is the cheapest and safest way to close a gap like this — no new plumbing, no
  test flips, a single new import, matching M87's own "unusually low-risk to fix" framing for the sibling
  HP-bonus fix.
- **Confirms M102's "a thorough re-verification can legitimately conclude nothing needs to change"
  precedent generalizes beyond primary-source print questions** (M103's specific case) **to internal
  data-table cross-checks too** — the `MAX_LEVEL` re-derivation this round is a second, independent
  example of "checking a named candidate paid off with a clean, confirmed-correct result," not every
  check needs to end in a code change to be worth doing and recording.

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `apps/web/test/_scratch_m104_verify.mjs` (a throwaway Puppeteer script, mirroring `e2e.mjs`'s own
  `runTown()` Sturm fixture, driving a real headless Edge session against the real dev-built app on a
  scratch port distinct from `e2e.mjs`'s own 5180, reading `localStorage['greybox.party.cok']` directly
  before/after a real `window.__town.train()` call) — run once (output captured verbatim above,
  reproducing the frozen-`savingThrows`-after-a-real-level-up bug against a fighter 2→3 transition chosen
  specifically because fighter levels 1/2 share an identical save-table row), then deleted. `git status
  --porcelain` confirmed clean before and after, this doc the only new file.
- Scratch PDF-render PNGs (`journal_p29_full_4x.png`, plus earlier per-page text dumps used to locate the
  `MAX_LEVEL` table's exact page) — written to the session scratchpad directory (outside the repo), not
  the working tree; none committed.
