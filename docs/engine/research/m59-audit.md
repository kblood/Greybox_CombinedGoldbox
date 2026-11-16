# M59 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done-section entries for M54.S1–M58.S1 in full,
> and `docs/engine/research/m58-audit.md` in full (its "Candidate #3 investigated and set aside",
> Rejected-alternatives, Open-questions and Implications sections in particular), per the brief.
> Per the brief's own suggestion, this round attempted a direct **side-by-side sweep of the two
> import screens' column sets against everything each importer actually computes** (standing
> candidate #2 from M58's list) — but with a narrower, more literal version of that idea than "do
> the two tables match each other": **does each table's own displayed copy match its own table?**
>
> **This round's headline: the Champions of Krynn → Death Knights of Krynn import screen's own
> paragraph explicitly promises "THAC0 ... taken byte-for-byte from your save," but the table next
> to that sentence has never had a THAC0 column — the exact shape of gap M51.S1 already found and
> fixed for the neighbouring field, `AC`, in this identical sentence, in this identical file, one
> round earlier — left unfixed for eight rounds since (M51–M58) because M51's own fix widened the
> AC column and moved on without checking the sentence's other named-but-undisplayed field.**
>
> Confirmed via one throwaway `vitest` script
> (`packages/engine/test/_scratch_m59_verify.test.ts`, created, run — **5/5 green** — then deleted;
> `git status --porcelain --untracked-files=all` confirmed clean before and after).

## Headline finding

### The gap: `SavedCharacter.thac0` / `CharacterSheet.thac0` is byte-faithful, mechanically load-bearing, and named in the CoK import screen's own copy — but has no column

`apps/web/src/ui/main.ts:770-774` (current state, unmodified):

```ts
panel.innerHTML =
  `<h2>Imported ${res.imported.length} hero${res.imported.length === 1 ? '' : 'es'} from Champions of Krynn</h2>` +
  '<p style="color:#9aa">Names, abilities, HP, AC, THAC0 and saves are taken byte-for-byte from your save; ' +
  'class &amp; level are reconstructed (CoK doesn't store them in a mapped position yet).' + stipendNote + '</p>' +
  `<table class="import-table"><thead><tr><th>Name</th><th>Class</th><th>HP</th><th>AC</th><th>XP</th></tr></thead><tbody>${rows}</tbody></table>`;
```

The paragraph names **six** things as "taken byte-for-byte from your save": Names, abilities, HP,
AC, THAC0, and saves. The table's header row has exactly **five** columns: Name, Class, HP, AC,
XP. `THAC0` is named in the sentence and then never appears anywhere else in the function —
neither as a `<th>` nor as a `${s.thac0}`-style interpolation. (Ability scores and saving throws
are also named but not tabulated — see "Why THAC0 and not abilities/saves" below for why those two
are explicitly *not* part of this round's proposed fix.)

`apps/web/src/ui/importParty.ts:169-183` (current state, unmodified):

```ts
export interface ImportResult {
  /** Names of the characters that were imported, in slot order. */
  imported: string[];
  /** Per-character "name — Class L<level>" summary for display. */
  summary: { name: string; cls: DragonlanceClassId; level: number; hp: number; xp: number; ac: number }[];
  /** Characters the {@link addPlayer} roster gates refused, with the typed reason + on-screen message. */
  rejected: { name: string; reason: AddPlayerReason; message: string }[];
  stipend: number;
}
```

`importParty.ts:118-131` (`sheetFromSaved()`, abridged, unmodified) shows `thac0` is decoded
byte-faithfully from the save right alongside `ac`, in the very same object literal:

```ts
return {
  name: sc.name.trim() || 'IMPORTED',
  ...
  // Combat numbers come straight from the save (not recomputed) so the import is byte-faithful.
  thac0: sc.thac0,
  ac: sc.armorClass,
  ...
};
```

And at the exact summary-building push site that M51.S1 already touched to add `ac`
(`importParty.ts:253-256`, current state, unmodified):

```ts
result.imported.push(sheet.name);
// M51.S1 — sheet.ac is byte-faithful from the save (sheetFromSaved()) but never reached the
// on-screen summary, despite this screen's own displayed copy already claiming AC is shown.
result.summary.push({ name: sheet.name, cls, level, hp: sc.hitPoints, xp: sc.xp, ac: sheet.ac });
```

`sheet` (which carries `.thac0` right next to `.ac`) is destructured into scope at the very same
loop — M51.S1's own fix pattern — but only `.ac` was threaded through; `.thac0` sat right there,
unread, through the exact commit that fixed its sibling field.

### Why this is real, not decorative: `sheet.thac0` is the actual to-hit number combat rolls against

`apps/web/src/ui/party.ts`'s `sheetToCombatant()` (the function that turns any roster
`CharacterSheet` — imported or created — into the `Combatant` tactical combat actually fights
with) reads `sheet.thac0` directly, unconditionally, for every party member:

```ts
// apps/web/src/ui/party.ts:345-361 (abridged, unmodified)
export function sheetToCombatant(sheet: CharacterSheet, id: string): Combatant {
  ...
  return {
    id,
    name: sheet.name,
    side: 'party',
    hp: sheet.hp,
    maxHp: sheet.maxHp,
    thac0: sheet.thac0,
    ac: sheet.ac,
    ...
  };
}
```

This is not a passive display fact awaiting a future consumer — it is, today, the exact to-hit
number an imported CoK hero fights with in every DoK battle from the moment of import, the same
mechanical category M51.S1 already established for `ac` in this identical file pair.

### Why THAC0 and not abilities/saves — the same "single scalar vs. multi-value family" line M51 already implicitly drew

The paragraph names six things; this round proposes fixing exactly one of the two remaining gaps
(THAC0), not all of them, for a reason grounded in the table's own existing shape, not a stylistic
preference:

- **`AC` and `THAC0` are each a single scalar** — exactly the shape every existing column in this
  table already has (Name, HP, XP are also single values). M51.S1 already established the
  precedent that a lone byte-faithful combat scalar gets its own column here.
- **Abilities (6 numbers) and saving throws (5 numbers) are each a *family* of values**, not a
  single figure — cramming either into one `<td>` would be a materially different kind of column
  (a mini-table-within-a-table) than anything this screen has shipped so far, and both are already
  shown in full, properly laid out, on the character sheet (`charSheet.ts:5,78` — "AC/THAC0/HP
  line, the five saving throws" — confirmed this round by source read) once the hero is in the
  roster. Proposing a 6-value or 5-value cell here would be a materially larger, riskier change
  than this round's established "thread one already-scoped scalar through" shape, and was set
  aside for that reason (see Rejected alternatives).
- **THAC0 has no other on-screen home before the player ever sees `charSheet.ts`** — same as AC's
  situation was before M51.S1 — so leaving the paragraph's THAC0 claim false on this specific
  screen is a real, if narrow, promise/deliverable mismatch, exactly as AC's used to be.

## Real-bytes / real-mechanic verification (this round)

Reproduced via `packages/engine/test/_scratch_m59_verify.test.ts` (created, run, **5/5 passed**,
then deleted):

1. **All 6 real bundled `Champions of Krynn/SAVE/CHRDATA{1..6}.SAV` files decode non-degenerate,
   varying THAC0 via `decodeSavedCharacter`**: `SIR STRONGSWORD=20, ISTAN HORBIN=20, GARIN=18,
   MOLLY=20, KAL=20, SIRRION=18` (two distinct real values across the six pregens; none are 0 or
   out of the documented `[0,30]` bound). AC for all six is a flat `10` in these saves (the
   pregens' baseline, pre-any-gear-adjustment figure) — a useful cross-check that THAC0, not AC, is
   actually the more *varying* of the two fields in this real save set, strengthening (not
   weakening) the case that THAC0 deserves its own column just as much as AC did.
2. **`SIR STRONGSWORD`'s five saving throws decode as real, non-degenerate values**
   (`{paralyzePoisonDeath:11, petrifyPolymorph:10, rodStaffWand:10, breath:14, spell:11}`) —
   confirming the "saves" family is real too, just correctly out of scope for a single-column fix
   (see above).
3. **Source-text proof `ImportResult.summary`'s type and push site carry no `thac0` field** —
   regex-isolated the live `export interface ImportResult { ... }` block and the
   `result.summary.push({...})` call; neither contains `thac0` (case-insensitive).
4. **Source-text proof `startImport()`'s function body names THAC0 and "saves" in its copy, but has
   no THAC0/"Save" column anywhere** — isolated the function body by its `async function
   startImport(` to matching `\n}` span; confirmed it contains the literal string `THAC0` and the
   word "saves", but no `<th>THAC0</th>`, no `${s.thac0}`-shaped interpolation, and no `<th>Save`
   token anywhere in the body.
5. **Source-text proof `sheetToCombatant()` reads `sheet.thac0` directly** (`party.ts:356`,
   `thac0: sheet.thac0` inside the returned `Combatant` literal) — confirming the value is already
   load-bearing for live tactical combat, not merely computed and shelved.

Full engine suite re-run after adding the scratch file: **1341 tests passed** (1336 baseline + 5
new scratch tests); after deleting it, re-confirmed back at **1336 passed, 0 failed**.
`git status --porcelain --untracked-files=all` is empty except this doc.

## Wiring plan

**Two UI files touched (`importParty.ts`, `main.ts`) plus a small extension to the existing
`runImportCok` e2e case (reusing its already-existing `.import-table` DOM-text-check pattern, the
exact shape M51.S1 used for the AC column) — no new UI panel, no new route, no new seam function,
no engine-package change (`sheet.thac0` is already a `CharacterSheet` field, already decoded,
already in scope at every site this plan touches).**

1. **`apps/web/src/ui/importParty.ts:173`** — widen `ImportResult.summary`'s inline type with
   `thac0`:

   ```ts
   // before:
   summary: { name: string; cls: DragonlanceClassId; level: number; hp: number; xp: number; ac: number }[];

   // after:
   /** Per-character "name — Class L<level>" summary for display. M59.S1 — `thac0` is the real
    * byte-faithful to-hit number `sheetToCombatant()` already fights with (party.ts:356); named in
    * this screen's own displayed paragraph ("THAC0 ... taken byte-for-byte from your save") but
    * never threaded into the table until now, the same shape of gap M51.S1 fixed for `ac` in this
    * identical sentence one round earlier. */
   summary: { name: string; cls: DragonlanceClassId; level: number; hp: number; xp: number; ac: number; thac0: number }[];
   ```

2. **`apps/web/src/ui/importParty.ts:253-256`** (the push site) — thread the already-in-scope
   `sheet.thac0` through, right next to `ac` (mirrors M51.S1's own comment style):

   ```ts
   // before:
   result.imported.push(sheet.name);
   // M51.S1 — sheet.ac is byte-faithful from the save (sheetFromSaved()) but never reached the
   // on-screen summary, despite this screen's own displayed copy already claiming AC is shown.
   result.summary.push({ name: sheet.name, cls, level, hp: sc.hitPoints, xp: sc.xp, ac: sheet.ac });

   // after:
   result.imported.push(sheet.name);
   // M51.S1 — sheet.ac is byte-faithful from the save (sheetFromSaved()) but never reached the
   // on-screen summary, despite this screen's own displayed copy already claiming AC is shown.
   // M59.S1 — sheet.thac0 has the identical gap: named in the same displayed sentence as AC, byte-
   // faithful from the save, already in scope right here, never threaded through until now.
   result.summary.push({ name: sheet.name, cls, level, hp: sc.hitPoints, xp: sc.xp, ac: sheet.ac, thac0: sheet.thac0 });
   ```

3. **`apps/web/src/ui/importParty.ts:271`** (`installImportSeam()`'s `party()` getter) — widen so
   an e2e coherence check has a ground-truth value to compare against (mirrors M51.S1's identical
   step for `ac`):

   ```ts
   // before:
   party: () => getParty().map((s) => ({ name: s.name, classes: s.classes, hp: s.hp, ac: s.ac, abilities: s.abilities })),

   // after:
   party: () => getParty().map((s) => ({ name: s.name, classes: s.classes, hp: s.hp, ac: s.ac, thac0: s.thac0, abilities: s.abilities })),
   ```

4. **`apps/web/src/ui/main.ts:761-774`** (`startImport()`'s table) — one more column, placed right
   after AC (identity → class/level → vitality → to-hit → loot):

   ```ts
   // before:
   const rows = res.summary
     .map(
       (s) =>
         `<tr><td>${s.name}</td><td>${s.cls} L${s.level}</td><td>${s.hp} HP</td><td>AC ${s.ac}</td><td>${s.xp ? s.xp.toLocaleString() + ' XP' : '—'}</td></tr>`,
     )
     .join('');
   ...
   `<table class="import-table"><thead><tr><th>Name</th><th>Class</th><th>HP</th><th>AC</th><th>XP</th></tr></thead><tbody>${rows}</tbody></table>`;

   // after:
   // M59.S1 — s.thac0 (the real byte-faithful to-hit number, already computed and already used by
   // sheetToCombatant() for live combat) was named in this screen's own paragraph ("THAC0 ... taken
   // byte-for-byte from your save") but never had a column; add one, matching the AC fix's shape.
   const rows = res.summary
     .map(
       (s) =>
         `<tr><td>${s.name}</td><td>${s.cls} L${s.level}</td><td>${s.hp} HP</td><td>AC ${s.ac}</td><td>THAC0 ${s.thac0}</td><td>${s.xp ? s.xp.toLocaleString() + ' XP' : '—'}</td></tr>`,
     )
     .join('');
   ...
   `<table class="import-table"><thead><tr><th>Name</th><th>Class</th><th>HP</th><th>AC</th><th>THAC0</th><th>XP</th></tr></thead><tbody>${rows}</tbody></table>`;
   ```

5. **Tests** (extend the existing `runImportCok` e2e case only — no new test file, no new seam). In
   `apps/web/test/e2e.mjs`, right after the existing `acShownOk` block (`e2e.mjs:2202-2207`), add a
   sibling `thac0ShownOk` check using the same `sir` (`SIR STRONGSWORD`) fixture the case already
   resolves:

   ```js
   // after e2e.mjs:2207 (acShownOk), before the `ok = ...` line:
   // M59.S1 — the on-screen import table now shows each hero's real byte-faithful THAC0 (sheet.thac0,
   // already exposed on the seam above); confirm the rendered HTML text agrees with the seam value for
   // SIR STRONGSWORD, proving the copy's own "THAC0 ... taken byte-for-byte" claim is now true (it was
   // false — no column existed — before this fix).
   const thac0ShownOk = !!sir && typeof sir.thac0 === 'number'
     && new RegExp(`SIR STRONGSWORD[\\s\\S]*?THAC0 ${sir.thac0}(?!\\d)`).test(tableText);

   // widen the existing conjunction (e2e.mjs:2208):
   ok = count >= 3 && named && faithful && everyoneClassed && istanIsMage && stipendOk && acShownOk && thac0ShownOk;

   // widen the existing error-diagnostic string (e2e.mjs:2209) to also report thac0ShownOk/sir?.thac0.
   ```

Rough size: 1 widened interface field + 1 one-line push-site edit + 1 one-line seam-getter edit in
`importParty.ts`; 1 new `<th>`/one `.map()` template edit in `main.ts`; ~6 LOC added to the existing
`runImportCok` e2e case. No engine-package file touched — engine test count should remain 1336
(this round's scratch test is deleted, not shipped). No new UI panel, no new route, no new test
file.

## Layout / feasibility check

Identical situation to M51.S1's own AC fix: `.import-table` is a plain, unstyled HTML `<table>`
(re-confirmed this round by re-reading `main.ts`'s `startImport()` body — the only styling
reference anywhere near it is the inline `stipendNote`/`panel` elements, not the table itself; no
CSS rule targets `.import-table`'s cells specifically). Adding a 6th `<th>`/`<td>` pair (Name,
Class, HP, AC, **THAC0**, XP) is the same trivial, well-supported HTML operation M51.S1 already
proved safe for this exact table when it added the AC column — browsers grow table columns to fit
content, no truncation/overflow risk. The real values involved are short (`THAC0 18`..`THAC0 20`
across the six real bundled saves, plus the documented `[0,30]` bound generally) — no cell will
ever be wide enough to threaten the row's readability.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **A full "column parity" sweep between the CoK→DoK and DoK→DQK import tables** (M58's standing candidate #2, as originally framed — comparing the two tables' column *sets* to each other) | Attempted first, in the shape the brief suggested, but a direct cross-table diff turned out to explain very little on its own: the two importers derive genuinely different facts (CoK reads AC/THAC0/XP byte-faithfully; DoK derives class/level/HP from THAC0 and reads only a baseline AC + carried spells) — a column existing on one side and not the other is very often *correct* (e.g. DoK's Spells column has no CoK analogue because CoK import never seeds `memorizeStore`; DoK's table has no XP column because DoK saves don't carry a usable XP figure the way CoK's do — confirmed this round via a source read of `importDokParty.ts`, no `setXp`/xp field anywhere in its result type). The one place the sweep found a *real, actionable* gap wasn't a cross-table mismatch at all — it was a **within-table** mismatch: the CoK table's own paragraph text names a field (THAC0) its own table doesn't show. Re-scoped the round to that narrower, more literal finding instead of forcing a cross-table parity fix that the two screens' genuinely different data sources don't actually support. |
| **Also adding a "Saves" column (5 saving throws) to the same CoK table** | The paragraph names "saves" in the same sentence as THAC0, so this was considered as a twin fix — but rejected as out of shape for this table: saves are a 5-value *family*, not a single scalar like every other column in this table (Name/Class/HP/AC/THAC0/XP are all one value each). Cramming 5 numbers into one `<td>` (or adding 5 new columns) would be a materially larger, differently-shaped change than this round's "thread an already-scoped scalar" pattern, and the values are already shown in full, properly laid out, on `charSheet.ts` (confirmed via source read: "AC/THAC0/HP line, the five saving throws" doc comment, `charSheet.ts:5`) once the hero is in the roster. Flagged as an open question for the lead rather than folded into this round's plan. |
| **Also adding an "Abilities" column** | Same "single scalar vs. multi-value family" rejection as saves (6 numbers, not 1); also already shown in full on `charSheet.ts` and on the Create-Character preview. Not proposed. |
| **The DoK→DQK import table's own paragraph vs. table consistency** (checking `startImportDok()`'s copy the same way) | Checked: DoK's paragraph says "combat stats are freshly derived for the level your save's THAC0 implies (**not read from the save**)" — it explicitly does NOT claim THAC0 itself is carried byte-faithfully (only that the save's THAC0 informs a *derived* level), so there is no equivalent false claim to fix on that side. Confirmed via source read of `main.ts:842-845`; no gap found there. |
| **`BASE_ITEMS`' thin catalogue coverage** (M58's standing candidate #1) | Not attempted — the brief flagged this as out of scope unless a clean, small, well-scoped data-addition angle surfaced; none did this round, and a genuinely different candidate (THAC0) was already found via the column-parity angle the brief suggested. |
| **The DoK-side `runItemPluses` e2e `.auto()`-resolution follow-up** (flagged M57, still open) | Not picked up — a verification/hardening follow-up on a prior fix, not a fresh "unwired field," per this round's brief preference for a fresh field when one is available. |
| **`referenceDb.ts`'s Class-label collision, `wilderness.ts`'s `moonPhasesForDay`, ECL-recruited-ally `morale`, `dialogue.ts`/`town.ts`'s `day`-wiring gap, `LILLITH`'s memorized-spell total** | All standing candidates from M54–M58's own lists — not re-investigated this round; a genuinely fresh, real, small candidate (THAC0) was found first via the brief's own suggested angle, so the round did not need to fall back to these. |
| **Re-running the systematic dead-container (`33180d2`-sibling) sweep** | Not re-run — M55 already confirmed it exhausted; no new large DOM-to-canvas migration commit has landed since. |

## Open questions / unknowns

- **Should a "Saves" and/or "Abilities" column/summary be added to the CoK import table too**, even
  though they're multi-value families rather than single scalars? This round judged that out of
  shape for a same-round, same-size fix and left both named-but-untabulated paragraph claims (saves,
  abilities) as an explicit, documented gap rather than force a 5- or 6-value cell into a table whose
  every existing column is a single number. **UNKNOWN** whether the lead considers a compact
  abbreviation (e.g. a single "Saves: 11/10/10/14/11" cell, matching the existing `classLabel()`
  slash-joined convention used elsewhere in this codebase) worth a follow-up round, or whether
  `charSheet.ts`'s existing full display is judged sufficient and the paragraph's "and saves" clause
  should instead be edited down to remove the claim.
- **Why do all 6 real bundled CoK pregens share the flat baseline `AC 10`** (only THAC0 varies, at
  18/20)? Plausibly these are early-campaign saves before any of the six pregens picked up
  AC-improving gear (matches this project's general observation that CoK's DAX-era pregens are
  fairly bare at save time) — **UNKNOWN**, not investigated further this round; doesn't affect this
  fix's correctness (AC 10 for all six is still a real, faithfully-decoded value, just not a varying
  one in this particular save set).
- **Should the THAC0 column read `THAC0 20` (matching the existing `AC 6`-style prefix convention)
  or a bare `20`?** This round's wiring plan follows the established `AC ${s.ac}` prefix style for
  consistency; a wording/format choice, not blocking.

## Implications for our engine

- **A prior round's own fix can leave a sibling field in the exact same sentence unfixed, simply
  because the round's scope was "the one field currently under investigation," not "every field this
  sentence names."** M51.S1 fixed AC and moved on; the paragraph text it left in place still made a
  second promise (THAC0) that stayed false for eight subsequent rounds. Worth treating "does this
  screen's OWN copy make any claim the fix doesn't yet fully satisfy" as a standing checklist item
  whenever a future fix touches display copy that lists multiple facts, not just the one being
  wired.
- **A literal "does the paragraph match its own table" check is a cheap, high-signal variant of the
  brief's "column parity" idea** — cheaper than a full cross-table diff (which this round found
  produces mostly false positives, since the two importers genuinely compute different facts), and
  grounded in an actual authored claim in the shipped copy rather than an assumption that the two
  screens *should* match. Worth keeping as a standing method for future rounds auditing any
  multi-fact descriptive paragraph next to a data table.
- **Not every named-but-untabulated fact deserves the same fix.** THAC0 (single scalar) and
  AC/HP/XP (the table's existing columns) are the same *shape* of fact; saves (5 values) and
  abilities (6 values) are not, and forcing them into the same column convention would be a
  different, larger, riskier kind of change. Worth keeping "does this fact fit the table's existing
  column shape" as an explicit filter alongside "is it real, computed, and load-bearing" for any
  future candidate in this same family of import/summary screens.
