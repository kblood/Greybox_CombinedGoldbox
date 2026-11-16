# M51 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done section for M46–M50 in full, and
> `docs/engine/research/m50-audit.md` in full (its Rejected-alternatives / Open-questions sections in
> particular). Per the brief, `combat/tactical.ts`'s full `TacticalCombat` interface was **not**
> re-litigated (M48/M49/M50 already read it exhaustively and ruled out every predicate but
> `slaysHelpless`); instead this round applied methods (a)/(b)/(f) — field-vs-render-body comparison,
> compositor-input-vs-caller comparison, and a sweep of **non-compositor bridge files** — to the two
> character-**import** flows (`apps/web/src/ui/importParty.ts` — CoK→DoK, B3; `apps/web/src/ui/
> importDokParty.ts` — DoK→DQK, M14/M34), neither of which is in the standing "swept clean" list.
>
> **Headline pick: both import flows' on-screen result table drops `CharacterSheet.ac` — the real,
> per-character, engine-computed armour class that decides every to-hit roll against that imported
> hero in the destination game — even though the value is already sitting in scope one line above the
> `summary.push()` call that omits it, is already exposed on the DoK flow's own e2e seam
> (`importDokParty.ts:313`), and is already independently proven correct by 5 live `ac` assertions in
> the shipping `runImportDok` e2e case. For the DoK→DQK flow this is a doubly sharp miss: an entire
> milestone (M34.S1) was spent fixing exactly this number — "a live combat-fidelity bug affecting 100%
> of `?import=dok` imports" per its own Done entry — and the corrected number still never reaches the
> only screen a player sees right after import.**
>
> A second, smaller item is addressed per this round's explicit brief: a **fresh, skeptical
> re-examination of the standing `missileBracket()`/`figureDistance` engine bug** (flagged M49, M50,
> re-confirmed again this round, still unfixed at `tactical.ts:1891`) — see the dedicated section below.
> This round's conclusion: the two prior rounds' "different shape, not our mandate" reasoning is
> procedurally sound but has left a fully-diagnosed, one-line, low-risk fix unpicked for three
> consecutive rounds; this round recommends the **lead session pick it up** as a small secondary
> engine-package change, while keeping the import-summary fix as the primary "wire a dropped field"
> finding.
>
> Every real-mechanic claim below was independently re-derived this round via a throwaway `vitest`
> script (`packages/engine/test/_scratch_m51_verify.test.ts`, created, run, **6/6 green**, then
> deleted). `git status --porcelain --untracked-files=all` is clean except this doc.

## Headline finding

### The field: `CharacterSheet.ac`

```ts
// packages/engine/src/ruleset/addnd1e-dragonlance/character.ts:54-75 (abridged)
export interface CharacterSheet {
  ...
  /** Armour class incl. the Dexterity defensive adjustment. */
  ac: number;
  ...
}
```

Computed at creation time (`createCharacter`) as `req.baseAc + dex.defensiveAc`
(`character.ts:207`) — i.e. the character's real fighting AC, not the unarmoured baseline. This is
the exact number every `TacticalCombat`/`combat.ts` to-hit roll targets once the imported hero enters
combat — as real and as consequential a fact as any this loop has found (M28's `conSaveBonus`, M34's
own gear-derived `baseAc`, etc.).

### Where it's computed and dropped — DoK → DQK (`?import=dok`, M14/M34)

`importDokParty.ts`'s per-character loop derives `sheet.ac` through a genuinely hard-won pipeline:
decode `.GAM`'s baseline AC byte → decode `.JNK`'s real worn-gear item records (VOCAB-coded, the same
63-byte layout `MON{n}ITM.DAX` uses) → crosswalk armour/shield types → `wornArmorAc()` → feed
`createCharacter()`. Per the **M34.S1** changelog entry (`docs/engine/BUILD-QUEUE.md:3517-3546`), this
fixed "a live combat-fidelity bug affecting 100% of `?import=dok` imports" — every DoK hero used to
fight at the unarmoured baseline (AC 10-minus-Dex) regardless of what their save showed them wearing.

The resulting `sheet` (with its correct `.ac`) is destructured right at the summary-building loop —
and the very next line omits it:

```ts
// apps/web/src/ui/importDokParty.ts:293,299 (current state, unmodified)
for (const { sheet, cls, level, hp, mem } of candidates) {
  ...
  result.summary.push({ name: sheet.name, cls, level, hp });   // <- sheet.ac never read
  ...
}
```

`DokImportResult.summary`'s own type never carries the field either:

```ts
// apps/web/src/ui/importDokParty.ts:218-227 (current state, unmodified)
export interface DokImportResult {
  imported: string[];
  /** Per-character "name — Class L<level>" summary for display. */
  summary: { name: string; cls: CoreClassId; level: number; hp: number }[];
  rejectedInvalid: string[];
  rejectedPartyFull: string[];
}
```

And the only place a player ever sees this summary — `main.ts`'s `startImportDok()` — builds its table
from exactly those four fields, so AC cannot appear no matter how faithfully it was derived:

```ts
// apps/web/src/ui/main.ts:830-838 (current state, unmodified)
const rows = res.summary
  .map((s) => `<tr><td>${s.name}</td><td>${s.cls} L${s.level}</td><td>${s.hp} HP</td></tr>`)
  .join('');
panel.innerHTML =
  `<h2>Imported ${res.imported.length} hero${res.imported.length === 1 ? '' : 'es'} from Death Knights of Krynn</h2>` +
  '<p style="color:#9aa">Name and ability scores are taken byte-for-byte from your save. DoK\'s compact save ' +
  'record has no hit-point field and stores only unarmoured-baseline AC, so class, level, HP and effective ' +
  'combat stats are freshly derived for the level your save\'s THAC0 implies (not read from the save).</p>' +
  `<table class="import-table"><thead><tr><th>Name</th><th>Class</th><th>HP</th></tr></thead><tbody>${rows}</tbody></table>`;
```

Note this paragraph's own text says "effective combat stats are freshly derived" but never says what
they came out to — the player is told a number was computed, never what it is.

### Proof the drop is not a missing derivation — it's already tested at the seam

`importDokParty.ts`'s own e2e seam **already exposes** `.ac` today:

```ts
// apps/web/src/ui/importDokParty.ts:313 (current state, unmodified)
party: () => getParty().map((s) => ({ name: s.name, classes: s.classes, hp: s.hp, ac: s.ac, abilities: s.abilities })),
```

and the shipping `runImportDok` e2e case already asserts five real, non-degenerate, per-character AC
values through that seam (`apps/web/test/e2e.mjs:2223-2233`, M34.S1's own coherence check):

```js
// apps/web/test/e2e.mjs:2229-2233 (current state, unmodified)
const acOk = dryden?.ac === 6
  && party.find((p) => p.name.trim() === 'LILLITH')?.ac === -2
  && tanar?.ac === -1
  && flavius?.ac === 0
  && celeste?.ac === -1;
```

So the fact is real, varies meaningfully across every real bundled DoK pregen, is already proven
correct by an existing test — and is simply never threaded into the one HTML table a player actually
looks at.

### The identical gap in the sibling flow — CoK → DoK (`?import=cok`, B3)

`importParty.ts`'s `sheetFromSaved()` sets AC byte-faithfully from the save:

```ts
// apps/web/src/ui/importParty.ts:118-131 (current state, unmodified, abridged)
return {
  name: sc.name.trim() || 'IMPORTED',
  ...
  // Combat numbers come straight from the save (not recomputed) so the import is byte-faithful.
  thac0: sc.thac0,
  ac: sc.armorClass,
  ...
};
```

but `ImportResult.summary`'s type (`importParty.ts:169-176`) and its push site
(`importParty.ts:230,254` — `sheet` is destructured in scope, `ac` still omitted) drop it the same way,
and `main.ts`'s `startImport()` table (`main.ts:759-772`) has the same three/four-column shape with no
AC column — **despite this flow's own displayed paragraph explicitly claiming otherwise**:

```ts
// apps/web/src/ui/main.ts:770-772 (current state, unmodified)
'<p style="color:#9aa">Names, abilities, HP, AC, THAC0 and saves are taken byte-for-byte from your save; ' +
'class &amp; level are reconstructed (CoK doesn’t store them in a mapped position yet).' + stipendNote + '</p>' +
`<table class="import-table"><thead><tr><th>Name</th><th>Class</th><th>HP</th><th>XP</th></tr></thead><tbody>${rows}</tbody></table>`;
```

The copy says "AC ... taken byte-for-byte from your save" in the same sentence as HP/THAC0/saves — but
of the four, only HP gets a column. This is the same field, the same shape of drop, one milestone
earlier and one hop closer to the source bytes (byte-faithful, not even derived) — a doubly strong
sibling case for the identical fix. (Its e2e seam, `installImportSeam()`'s `__import.party()` at
`importParty.ts:266-270`, does **not** yet expose `.ac` — unlike the DoK flow's seam — so folding this
in needs one extra line there too if a coherence e2e check is wanted for it.)

## Why this fits the loop's established shape

1. **A real, already-decoded/derived engine field** (`CharacterSheet.ac`) **with a real consumer** — it
   is not decorative: it is the exact number the destination game's combat engine rolls to-hit against
   for the rest of that character's life in the party.
2. **Already in scope at the drop site** — `sheet`/`sheet.ac` is destructured one line above the
   `summary.push()` that omits it, in both files; no new decode, no new join, no new engine-package
   code.
3. **Already proven correct independently of this fix** — the DoK flow's own e2e seam and its 5
   `acOk` assertions (M34.S1) mean the fix carries zero risk of surfacing an unverified number.
4. **Not a heavily-mined file** — neither `importParty.ts` nor `importDokParty.ts` appears in any prior
   round's swept-clean list (M42–M50); this is a genuinely new file pair for the loop.
5. **Higher narrative stakes than a typical "add a row" fix**: the DoK flow's own M34.S1 changelog
   frames the underlying computation as fixing "a live combat-fidelity bug affecting 100% of
   `?import=dok` imports" — this round's finding is that the fix, once made, still never reaches the
   player, so the player-visible half of that milestone's promise ("show your real fighting stats") was
   left undone.
6. **Zero engine-package change** — both files touched are `apps/web/src/ui/*`, exactly like every
   fix since M39.

## Real-bytes / real-mechanic verification (this round)

Reproduced independently via `packages/engine/test/_scratch_m51_verify.test.ts` (created, run, **6/6
passed**, then deleted — using ONLY exported `@goldbox/engine` functions plus the real bundled DoK
save files on disk, not the UI module itself, since it depends on `fetch`/`window`):

1. **`SIR DRYDEN` (fighter, shield-only real gear) and `LILLITH` (fighter, plate+shield real gear) get
   different, non-degenerate real AC** — re-derived straight from `Death Knights of Krynn/SAVE/
   CHRDATA{1,2}.GAM`+`.JNK` via `decodeDokSavedCharacter`/`decodeDokJnkFile`/`inventoryFromDokJnk`/
   `wornArmorAc`/`createCharacter`: `ac === 6` and `ac === -2` respectively — matching the already-
   shipped e2e assertion at `e2e.mjs:2229-2230` exactly.
2. **A cleric (`FLAVIUS`) and a magic-user (`CELESTE`) also get real, distinct derived AC** — re-derived
   from `CHRDATA{4,6}` (the real slot mapping, confirmed by decoding all 6 saves' names/classCodes
   first): `ac === 0` and `ac === -1` — matching `e2e.mjs`'s `acOk` check exactly.
3. **`DokImportResult.summary`'s type never carries `ac`, though `sheet` (which has `.ac`) is destructured
   in scope one line above the exact push site that omits it** — source-text slice of
   `importDokParty.ts` confirms both the interface shape and the literal push-site text
   `result.summary.push({ name: sheet.name, cls, level, hp });` with no `ac:` anywhere in either slice.
4. **`main.ts`'s on-screen DoK-import table has no AC column** — source-text slice of `startImportDok()`
   confirms the literal header `<th>Name</th><th>Class</th><th>HP</th>` and the absence of `<th>AC</th>`
   or `${s.ac}` anywhere in the function body.
5. **The identical gap exists in the CoK sibling, whose own displayed copy claims AC is disclosed** —
   source-text proof that `importParty.ts` really does set `ac: sc.armorClass,` in `sheetFromSaved()`,
   that `ImportResult.summary`'s type omits `ac`, and that `main.ts`'s `startImport()` function body
   contains both the string `"taken byte-for-byte from your save"` (with `AC` named in the same
   sentence) and the literal header `<th>Name</th><th>Class</th><th>HP</th><th>XP</th>` with no
   `<th>AC</th>`.
6. **The seam already exposes `.ac` today** — source-text proof `importDokParty.ts` contains
   `ac: s.ac` in `installImportDokSeam()`'s `party()` getter, confirming this is a display-only drop,
   not a missing derivation or a missing seam value.

## Wiring plan

**Two files touched for the primary (DoK→DQK) fix — no engine-package change. Same shape as M46's
`SaveGame.name` fix (widen a return-object type by one field, thread it through the one caller that
builds the on-screen table) and M47's `library.ts` fix (a plain HTML/CSS table, not a fixed-width
EGA/VGA framebuffer — no clipping risk).**

1. **`apps/web/src/ui/importDokParty.ts:218-227`** (`DokImportResult.summary`'s type) — add `ac: number`:

   ```ts
   // before:
   summary: { name: string; cls: CoreClassId; level: number; hp: number }[];
   // after:
   summary: { name: string; cls: CoreClassId; level: number; hp: number; ac: number }[];
   ```

2. **`apps/web/src/ui/importDokParty.ts:299`** (the push site) — thread it through:

   ```ts
   // before:
   result.summary.push({ name: sheet.name, cls, level, hp });
   // after:
   result.summary.push({ name: sheet.name, cls, level, hp, ac: sheet.ac });
   ```

3. **`apps/web/src/ui/main.ts:830-838`** (`startImportDok()`'s table) — one more column:

   ```ts
   // before:
   const rows = res.summary
     .map((s) => `<tr><td>${s.name}</td><td>${s.cls} L${s.level}</td><td>${s.hp} HP</td></tr>`)
     .join('');
   ...
   `<table class="import-table"><thead><tr><th>Name</th><th>Class</th><th>HP</th></tr></thead><tbody>${rows}</tbody></table>`;

   // after:
   const rows = res.summary
     .map((s) => `<tr><td>${s.name}</td><td>${s.cls} L${s.level}</td><td>${s.hp} HP</td><td>AC ${s.ac}</td></tr>`)
     .join('');
   ...
   `<table class="import-table"><thead><tr><th>Name</th><th>Class</th><th>HP</th><th>AC</th></tr></thead><tbody>${rows}</tbody></table>`;
   ```

   Example real output change: importing the 5 real DoK pregens currently shows
   `<tr><td>SIR DRYDEN</td><td>fighter L?</td><td>? HP</td></tr>` with no indication of armour; after
   the fix the same row reads `...<td>AC 6</td>` (and `LILLITH`/`TANAR`/`FLAVIUS`/`CELESTE` read
   `AC -2`/`AC -1`/`AC 0`/`AC -1` respectively) — the exact numbers the shipping e2e already proves are
   correct.

4. **Tests** (extend the existing `runImportDok` e2e case only — no new test file, no new case). In
   `apps/web/test/e2e.mjs`, after the existing `acOk` block (`e2e.mjs:2229-2233`), add one DOM-text
   coherence check reading the actual rendered table (not just the seam) so the fix is proven visible,
   not just computed:

   ```js
   // M51.S1 — the on-screen import table now shows each hero's real derived AC; confirm the rendered
   // HTML text agrees with the already-verified seam value for DRYDEN, rather than only asserting the
   // seam (which M34.S1 already covered).
   const tableText = await page.evaluate(
     () => document.querySelector('.import-table')?.textContent ?? '',
   );
   const acShownOk = /SIR DRYDEN[\s\S]*?AC 6/.test(tableText);
   ```
   and fold `acShownOk` into the case's existing `ok = ...` conjunction and its failure-diagnostic
   string, mirroring every prior round's "one more `&& xOk`" pattern.

5. **Optional, same-shape fold-in for the CoK→DoK sibling** (`importParty.ts`/`main.ts`'s
   `startImport()`) — identical three edits (widen `ImportResult.summary`'s type at
   `importParty.ts:173`, thread `ac: sheet.ac` at the push site `importParty.ts:254`, add an `<th>AC</th>`
   column to `main.ts:762,772`), plus widening `__import.party()`'s seam getter
   (`importParty.ts:269`) with `ac: s.ac` if a coherence e2e check is wanted for it too (the DoK seam
   already has it; the CoK one doesn't yet). Left as an explicit option rather than folded into the
   primary plan, to keep this round's core recommendation to the minimum diff — but flagged because the
   CoK flow's own displayed copy already promises AC is shown, which the fix would make honest.

Rough size: ~3 LOC changed in `importDokParty.ts` + ~4 LOC changed in `main.ts` + ~6 LOC added to the
existing `runImportDok` e2e case's assertion block. No engine-package file touched, no new test file,
no new e2e case, no new route, no new UI panel. The optional CoK fold-in is the same shape again,
roughly doubling the diff if taken.

## Layout / feasibility check

Unlike M48–M50's fixed-width 320×200 EGA combat banner (`combatScreen.ts`'s `TEXT_MAX_ROWS`), both
import screens render a **plain HTML `<table>`** (`main.ts`'s `.import-table`, styled via
`viewer.css`), the same DOM-text rendering path M47's `library.ts` fix already used successfully — no
fixed-column-width framebuffer, no glyph clipping, no pixel budget to check. Adding a 4th (DoK) or 5th
(CoK) `<th>`/`<td>` column is a pure HTML reflow; the browser lays out table columns automatically.
Not a new risk class — if anything, a lower-risk category of fix than every one of M48–M50's own EGA
banner edits, since there is no character-budget ceiling to reason about at all.

## The `missileBracket()`/`figureDistance` engine bug — fresh look (candidate #8)

**Re-confirmed still real and unchanged**: `tactical.ts:1891` still reads
`missileRangeBracket(chebyshev(a.pos, t.pos), w.range ?? 0)` inside the `missileBracket()` seam getter,
while `resolveHit()`'s actual to-hit roll (`tactical.ts:1130`) measures with the footprint-aware
`missileRangeBracket(figureDistance(actor, target), weapon.range ?? 0)`. `figureDistance` (a private
closure at `tactical.ts:947-949`, in scope at the `missileBracket()` call site) computes
`footprintDistance(a.pos, a.size ?? 1, b.pos, b.size ?? 1)` — the *minimum* Chebyshev distance over
every cell either combatant's footprint occupies (CT.7f, Large = 2×2). For any combatant with
`size === 1` (the overwhelming majority — most humanoids), `figureDistance` and plain `chebyshev`
agree exactly, so the bug is invisible almost all of the time. It only diverges when either the
attacker or the target is Large (dragons, giants, and other 2×2-icon monsters are a real, recurring
part of the Krynn bestiary, not a hypothetical) **and** the true nearest-footprint-cell distance
straddles a range-bracket boundary that the anchor-to-anchor distance would not.

**Fresh, skeptical take on M49's/M50's "different shape, not our mandate" reasoning:**

- The reasoning itself is *procedurally* correct: this loop's mandate (per M48/M49/M50's own framing,
  restated in this round's brief) is to find **unwired-but-implemented fields**, and this is instead a
  **correctness bug in an already-wired value** — a genuinely different failure mode, not a display
  gap. Nothing about that categorical distinction has changed this round.
- It is also true that fixing it is outside this research agent's remit — `CLAUDE.md`'s own standing
  rule ("Do not modify engine/source code") and this task's framing ("you research and document only")
  both apply, so this agent could not implement it even if it judged the shape-argument wrong.
- **However**, three consecutive rounds (M49, M50, this one) have now independently re-confirmed the
  exact same one-line, fully-diagnosed, low-blast-radius fix (`chebyshev(a.pos, t.pos)` →
  `figureDistance(a, t)`, both already in scope at the call site, no new function needed) without any
  round actually picking it up — not because a new round found a reason to doubt it, but because each
  round's mandate is scoped to a different kind of finding. That is a real cost: the exact "Range = N"
  pre-hoc hint M49/M50 built (and this loop takes pride in shipping faithfully) can show the wrong
  bracket for the one class of combatant (Large monsters) where the original AD&D-1e/Gold Box footprint
  rule matters most.
- **Verdict this round: the fix is overdue and should be picked up.** It is a one-line, already-diagnosed,
  already-scoped change with no new abstractions, no risk to the 1335 passing engine tests beyond the
  narrow case it corrects, and it would directly firm up two rounds' worth of this loop's own UI work
  (M49's `missileBracket` wiring, M50's `slaysHelpless` priority ordering, both downstream of the same
  seam function). This is **not** this round's primary "wire a dropped field" deliverable (that
  remains the import-summary AC fix above) — it is flagged here, explicitly, as a recommended
  **secondary engine-package task for the lead session**, the first such recommendation since M45's own
  engine-side spell-geometry table addition.
- **Suggested minimal fix** (for the lead session to apply, not this agent): at
  `packages/engine/src/combat/tactical.ts:1891`, change
  `missileRangeBracket(chebyshev(a.pos, t.pos), w.range ?? 0)` to
  `missileRangeBracket(figureDistance(a, t), w.range ?? 0)`. `figureDistance` is already a sibling
  closure in the same factory function and already takes exactly this argument shape
  (`TacticalCombatant, TacticalCombatant`) elsewhere in the file (e.g. `resolveHit()` itself). No new
  export, no signature change, no test file touched beyond adding a Large-monster regression case to
  the existing `tactical.test.ts`.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **A fourth `TacticalCombat` predicate beyond `slaysHelpless`** | Not re-investigated — per the brief, M48/M49/M50 already read the full interface doc-comment by doc-comment and ruled out every remaining predicate (`isGuarding`/`canDelay`/`sizeOf`/`conditionOf`/`partyCanEscape`/`attemptPartyFlee`/`aiAction`/`hazardAt`); re-litigating without a new angle would waste the round. |
| **`hasScribed()`/`getSpellbook()`** (`apps/web/src/ui/party.ts:592,600`, `magic.ts`'s spell-memorization overlay) | Genuinely a zero-caller dead export (confirmed via repo-wide grep — no callers anywhere, including tests), and the "pre-hoc vs. post-hoc" angle does apply (Scribe's "already in spellbook"/"book full" verdicts are currently post-hoc-only in the `flash` message). Investigated in depth but set aside as the round's headline: (1) the underlying "book" concept isn't even enforced by `doMemorize()` today (a mage can memorize any known class spell whether or not it's been scribed) — the doc comment's "may only memorize spells that are in their book" reads as aspirational, not implemented, so wiring a "already scribed" tag would inform a decision the engine doesn't actually gate on, weakening the payoff; (2) the compositor's fixed-width EGA row layout (`spellbook.ts`'s `TEXT_COL=4`..`COUNT_COL=33`, 29-char budget) already sits close to overflow for real long spell names (e.g. "Protection from Evil 10' Radius", 31 chars) even without a new per-row marker, an added layout risk none of M48–M50's single-banner fixes had to reason about, since those touched one row (the target banner), not every visible row in a scrolling list. Left as a documented, weaker candidate rather than picked as the headline. |
| **`chanceToLearnSpell()`'s % shown only post-hoc in the Scribe flash** (`scribe.ts:35`, `magic.ts`'s `doContext()`) | A real, pure, engine-computed value (INT-scaled d100 chance) currently narrated only after a Scribe attempt resolves. Weaker than the import-AC finding because the value is INT-only (constant per caster, not per spell/situation), so a player learns it from their very first Scribe attempt and it never needs re-discovering — unlike a per-target fact (backstab/range/coup-de-grace/AC-per-character) that varies every time the underlying subject changes. |
| **`town.ts`** (Shop/Temple/Training Hall) | Read in full looking for an un-shown pre-hoc price/eligibility fact analogous to M48–M50's combat hints. Found the opposite: this file is already a strong positive example of the pattern done right — `buyPrice`/`sellStack`'s price/`healCost`/`raiseCost`/`trainingStatus`'s eligibility+reason are all already shown pre-hoc, with disabled-row colouring for anything the party can't currently afford/qualify for. No gap found. |
| **`dialogue.ts`** | Read in full. The standalone `?dialogue=1` flow is entirely hand-authored original demo content (explicitly not a decoded game asset, per the file's own doc comment) — no decoded field to wire. The real dungeon-integrated path (`explore.ts`) reuses the same `DialogueRunner`; not re-investigated this round (out of scope for a fresh angle). |
| **`missileBracket()`/`figureDistance` engine bug** (`tactical.ts:1891`) | Re-confirmed real and unchanged for a third round; given its own dedicated section above per the brief's explicit instruction — this round's verdict is to recommend picking it up (a lead-session engine-package change), not to leave it flagged a fourth time without a decision either way. |
| **`referenceDb.ts`, `saveStore.ts`, `library.ts`/`gameview.ts`, `combat.ts`'s `highlightTarget()`/`rangeTag()`** | Not investigated this round, per standing brief guidance (5/1/1/3 prior rounds respectively on those files; no new angle developed). |
| **Item-instance subsystem, `PartyMemberStatus.age`, `MapCell.ceiling`/`.flags`, `MonsterRecord.conSaveBonus`/`.itemPluses`/`.carriedItems`/`.preparedSpellIds`, dialogue.ts/town.ts `day`-wiring, `TacticalSpell.inflict`, DoK Companion-Panel e2e positive controls, `referenceDb.ts`'s Class-label collision, `DetectionMatch.series`/`.ruleset`/`.engineGen`, `saveStore.ts`'s `listSlots()`** (all standing) | Not re-investigated, per standing instructions — no new angle developed on any of these this round. |

## Open questions / unknowns

- **Should the AC column read `AC 6` or just `6`, and where in the row?** This doc's wiring plan puts
  it last (after HP), matching the existing left-to-right "identity → class/level → vitality" column
  order; a stronger visual pairing might put it right after Class/Level (closer to the character's
  "build" than their HP). Left as a display-ordering choice for the lead, not a blocking question.
- **Should the CoK→DoK sibling fix be folded into the same commit, or left as a genuinely separate,
  smaller follow-up?** Both flows have the identical gap and an almost-identical fix shape, so folding
  them together is cheap; but the CoK flow additionally needs its e2e seam widened (`ac: s.ac` added to
  `__import.party()`) if a coherence check is wanted for it, which the DoK flow doesn't need (already
  has it). Presented as an explicit option above rather than assumed.
- **Does a negative AC (e.g. `AC -2`) read clearly in a plain HTML cell, or would a player expect
  "AC 2" with a separate "lower is better" legend?** AD&D 1e's descending-AC convention is already used
  correctly elsewhere in this codebase (character sheet, companion panel) with no separate legend, so
  this is consistent with existing UI conventions, not a new one — but flagged since it's the first
  time this loop has put a negative AC value into a freshly-added HTML cell specifically.
- **The `missileBracket()`/`figureDistance` bug's real-world frequency** — UNKNOWN precisely how many
  of CoK/DoK's Large-icon monsters (dragons, giants, etc.) a player is likely to shoot at from a
  bracket-boundary distance in practice; this round did not enumerate the full monster roster's `size`
  field distribution. The fix's correctness and low risk don't depend on this number, but its
  real-world payoff scales with it — left for the lead session to judge alongside the fix itself.

## Implications for our engine

- **Import/carry-over screens are a genuinely fresh vein for this loop.** Neither `importParty.ts` nor
  `importDokParty.ts` appears in any prior round's swept-clean list; both are exactly the kind of
  "non-compositor bridge file" method (f) points at, and both turned out to have the identical
  structural gap (a real per-character field computed in scope, dropped at the summary-object
  boundary, never reaching the one HTML table a player reads). Worth treating the trilogy's
  carry-over/import surface as its own small family for a future round, the way `highlightTarget()`
  became a three-round family for combat hints.
- **A milestone can fix the engine-side computation of a fact and still leave the player-facing half of
  the same promise unmet.** M34.S1's own Done entry frames itself as fixing "a live combat-fidelity
  bug" — true at the mechanical level (combat now resolves against the real AC) — but the player was
  never shown the corrected number, so from their perspective the fix was invisible. Worth treating
  "does the player ever SEE the corrected value" as a distinct completion criterion from "does combat
  now USE the corrected value," even for milestones that read as fully shipped.
- **Not every "pre-hoc vs. post-hoc" candidate is equally strong just because the pattern matches** —
  this round found two decent post-hoc-only candidates in `magic.ts` (`hasScribed`'s scribe-status tag,
  `chanceToLearnSpell`'s % preview) but judged both weaker than the import-AC fix once checked against
  (a) whether the underlying mechanic actually gates on the fact today, and (b) layout headroom in the
  target compositor. Worth keeping both of those checks as an explicit filter, not just pattern-match,
  for future "pre-hoc" candidates.
- **A one-line, fully-diagnosed engine bug left unpicked for three rounds running is a real, if small,
  cost of this loop's strict per-round mandate.** This round's recommendation (pick up
  `missileBracket()`/`figureDistance`) is the first time a round has explicitly broken from "leave it
  flagged" to "recommend action" — worth normalizing an occasional explicit yes/no verdict on standing
  flagged bugs, rather than only ever re-confirming their existence, so they don't rot indefinitely
  purely because no single round's narrow mandate covers them.

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `packages/engine/test/_scratch_m51_verify.test.ts` (6 tests: DRYDEN/LILLITH real derived AC via the
  real bundled `.GAM`/`.JNK` bytes and exported engine functions only, matching the shipping e2e
  exactly; FLAVIUS/CELESTE likewise; a source-text proof `DokImportResult.summary`'s type/push-site
  never carries `ac` though `sheet.ac` is in scope; a source-text proof `main.ts`'s on-screen DoK table
  has no AC column; a source-text proof the identical gap exists in the CoK sibling despite its copy
  claiming AC is disclosed; a source-text proof the seam already exposes `.ac` today) — run via
  `npx vitest run` (6/6 passed), then deleted. Confirmed via `git status --porcelain
  --untracked-files=all` (clean except this doc) after deletion.
