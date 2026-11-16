# M60 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done-section entries for M55.S1–M59.S1 in full,
> and `docs/engine/research/m59-audit.md` in full (its "Rejected alternatives investigated this
> round", "Open questions / unknowns" and "Implications" sections in particular), per the brief.
> Per the brief's own instruction, this round tried to apply M59's new **"paragraph vs. its own
> table"** method to *other* screens codebase-wide (not just the two import screens) before falling
> back to M59's standing open question. That sweep came back clean everywhere it was tried (see
> "Rejected alternatives" below) — every other descriptive paragraph/hint-bar this round could find
> already matches what its neighbouring panel actually renders. So this round picked up **M59's own
> still-open question #1 verbatim**: whether the CoK import screen should get a compact "Saves"
> cell. Investigating it turned up a concrete, previously-unremarked fact that answers M59's own
> uncertainty: **`create.ts`'s live character-creation preview already ships the exact compact
> "saves A/B/C/D/E" single-cell convention M59 could only gesture at as a hypothetical** — real,
> shipped, same order, same slash format. That precedent is what turns this from "a stylistic
> option" into "a well-grounded fix, worth doing now."
>
> Confirmed via one throwaway `vitest` script
> (`packages/engine/test/_scratch_m60_verify.test.ts`, created, run — **4/4 green** — then deleted;
> `git status --porcelain --untracked-files=all` confirmed clean before and after).

## Headline finding

### The gap: the CoK import screen's own paragraph still says "...and saves are taken byte-for-byte from your save" — and, even after M59's THAC0 fix, the table still shows no saves at all

`apps/web/src/ui/main.ts:773-777` (current state, unmodified since M59):

```ts
panel.innerHTML =
  `<h2>Imported ${res.imported.length} hero${res.imported.length === 1 ? '' : 'es'} from Champions of Krynn</h2>` +
  '<p style="color:#9aa">Names, abilities, HP, AC, THAC0 and saves are taken byte-for-byte from your save; ' +
  'class &amp; level are reconstructed (CoK doesn’t store them in a mapped position yet).' + stipendNote + '</p>' +
  `<table class="import-table"><thead><tr><th>Name</th><th>Class</th><th>HP</th><th>AC</th><th>THAC0</th><th>XP</th></tr></thead><tbody>${rows}</tbody></table>`;
```

The paragraph still names **six** facts ("Names, abilities, HP, AC, THAC0 and saves"); the table
header row still has exactly **six** columns (Name, Class, HP, AC, THAC0, XP) — Class and XP are
not named in the sentence at all, and "saves" (one of the six named facts) still has no
representation anywhere in the row. This is the exact leftover M59 itself flagged rather than
fixed: "Deliberately did NOT also add 'Saves' (5 values)... Flagged as an open question for the
lead rather than folded into this round's plan" (`m59-audit.md`, Rejected-alternatives table).

`apps/web/src/ui/importParty.ts:104-132` (`sheetFromSaved()`, unmodified) shows `savingThrows` is
decoded byte-faithfully from the save in the very same object literal as `thac0`/`ac`:

```ts
return {
  name: sc.name.trim() || 'IMPORTED',
  race: 'human',
  sex: 'male',
  classes,
  abilities: { ...sc.abilities },
  // Combat numbers come straight from the save (not recomputed) so the import is byte-faithful.
  thac0: sc.thac0,
  ac: sc.armorClass,
  savingThrows: { ...sc.savingThrows },
  spellSlots,
  hp: sc.hitPoints,
  maxHp: sc.hitPoints,
};
```

And the exact push site M51.S1 (AC) and M59.S1 (THAC0) already extended twice
(`importParty.ts:257-262`, current state, unmodified):

```ts
result.imported.push(sheet.name);
// M51.S1 — sheet.ac is byte-faithful from the save (sheetFromSaved()) but never reached the
// on-screen summary, despite this screen's own displayed copy already claiming AC is shown.
// M59.S1 — sheet.thac0 has the identical gap: named in the same displayed sentence as AC, byte-
// faithful from the save, already in scope right here, never threaded through until now.
result.summary.push({ name: sheet.name, cls, level, hp: sc.hitPoints, xp: sc.xp, ac: sheet.ac, thac0: sheet.thac0 });
```

`sheet` (which carries `.savingThrows` right next to `.thac0`/`.ac`) is destructured into scope at
this very loop, for the third time in a row — but `.savingThrows` still sits there, unread.

### Why THIS round, not another repeat of M51/M59's "thread a scalar" shape: `create.ts` already proves the compact-cell format is a real, shipped codebase convention, not a hypothetical

M59 explicitly considered and set this fix aside, reasoning that saves are "a family of 5 values,
not a single scalar like every existing column," and floated — but did not confirm — "a compact
abbreviation (e.g. a single 'Saves: 11/10/10/14/11' cell, matching the existing `classLabel()`
slash-joined convention used elsewhere in this codebase)" as an open, unresolved possibility.

This round found the concrete precedent M59 could only gesture at. `apps/web/src/ui/create.ts:311-312`
(the character-creation live preview panel, unmodified, pre-existing since well before this round):

```ts
const sv = s.savingThrows;
stats.appendChild(el('span', 'cc-stat', `saves ${sv.paralyzePoisonDeath}/${sv.petrifyPolymorph}/${sv.rodStaffWand}/${sv.breath}/${sv.spell}`));
```

This is **exactly** the format M59 hypothesized — same five fields, same order (matching
`charSheet.ts:30-36`'s own `SAVE_ROWS` list: Paralyze/Poison/Death, Petrify/Polymorph, Rod/Staff/Wand,
Breath Weapon, Spell), same slash-joined single-string presentation — already shipped in this
codebase, just on a different screen. That turns M59's "is this a reasonable convention to
introduce" question into "this convention already exists; apply it here too," which is a
materially stronger basis for a fix than inventing a new display idiom from scratch.

**Why Abilities (the other family M59 named in the same breath) is still NOT part of this round's
fix:** `create.ts`'s preview panel has no equivalent compact abilities string — ability scores are
shown only as the individual live input fields on that screen, never folded into `stats`. There is
no matching shipped precedent for a compact "abilities A/B/C/D/E/F" cell anywhere in this codebase
(confirmed by grep — see verification below), so Abilities remains exactly where M59 left it: a
real, named-but-untabulated fact, already shown in full on `charSheet.ts`, with no concrete
convention this round could point to as justification. Saves and Abilities are not equally ready
to fix; only one of the two now has a real, shipped precedent to follow.

## Real-bytes / real-mechanic verification (this round)

Reproduced via `packages/engine/test/_scratch_m60_verify.test.ts` (created, run, **4/4 passed**,
then deleted):

1. **All 6 real bundled `Champions of Krynn/SAVE/CHRDATA{1..6}.SAV` files decode non-degenerate
   saving-throw quintuples via `decodeSavedCharacter`:**
   `SIR STRONGSWORD=11/10/10/14/11`, `ISTAN HORBIN=14/15/16/17/17`, `GARIN=13/13/11/15/12`,
   `MOLLY=18/12/14/16/15`, `KAL=10/13/11/15/12`, `SIRRION=10/13/11/15/12` (order:
   paralyzePoisonDeath/petrifyPolymorph/rodStaffWand/breath/spell). Five distinct compact strings
   across the six real pregens (KAL and SIRRION happen to share identical saves) — real, varying,
   non-placeholder data, not all-zero or out-of-range.
2. **Source-text proof `startImport()`'s function body still names "saves" in its copy but has no
   Saves `<th>`/`${s.saves}`-shaped interpolation anywhere** — isolated the function body the same
   way M59 did; confirmed the literal word "saves" is present, no `<th>Saves</th>`, no
   `${s.saves`-shaped read.
3. **Source-text proof `ImportResult.summary`'s type and push site carry no `saves` field** —
   regex-isolated the live `export interface ImportResult { ... }` block; case-insensitively no
   match for "saves". Confirmed `sheet.savingThrows` (spread as `{ ...sc.savingThrows }`) is already
   present verbatim in `sheetFromSaved()`'s return literal — zero new decode work needed.
4. **Precedent-check proof: `create.ts` really does ship the exact compact saves string** — regex
   match against the literal template `` `saves ${sv.paralyzePoisonDeath}/${sv.petrifyPolymorph}/${sv.rodStaffWand}/${sv.breath}/${sv.spell}` ``
   in `create.ts`, confirming this convention is real and already live, not a hypothetical this
   round invented to justify the fix.

Full engine suite re-run after adding the scratch file: **1340 tests passed** (1336 baseline + 4
new scratch tests); after deleting it, re-confirmed back at **1336 passed, 0 failed**.
`git status --porcelain --untracked-files=all` is empty except this doc.

## Wiring plan

**Two UI files touched (`importParty.ts`, `main.ts`) plus a small extension to the existing
`runImportCok` e2e case (reusing its already-existing `.import-table` DOM-text-check pattern and
`sir`-fixture lookup, the exact shape M51.S1/M59.S1 used) — no new UI panel, no new route, no new
seam function, no engine-package change (`sheet.savingThrows` is already a `CharacterSheet` field,
already decoded, already in scope at every site this plan touches).**

1. **`apps/web/src/ui/importParty.ts:172-177`** — widen `ImportResult.summary`'s inline type with a
   preformatted `saves` string (formatted once at the push site, matching how `create.ts` already
   formats it, so `main.ts` does not need to import `SavingThrows` or duplicate the format logic):

   ```ts
   // before:
   summary: { name: string; cls: DragonlanceClassId; level: number; hp: number; xp: number; ac: number; thac0: number }[];

   // after:
   /** Per-character summary for display. M60.S1 — `saves` is the real byte-faithful five-save
    * quintuple (`sheetFromSaved()`'s `savingThrows`), pre-formatted "P/P/R/B/S"-style exactly as
    * `create.ts`'s own live preview already renders it (`create.ts:312`) — named in this screen's own
    * paragraph ("...and saves are taken byte-for-byte from your save") since before M51.S1, still
    * never threaded into the table until now. */
   summary: { name: string; cls: DragonlanceClassId; level: number; hp: number; xp: number; ac: number; thac0: number; saves: string }[];
   ```

2. **`apps/web/src/ui/importParty.ts:257-262`** (the push site) — thread the already-in-scope
   `sheet.savingThrows`, formatted the same way `create.ts:312` already does:

   ```ts
   // before:
   result.imported.push(sheet.name);
   // M51.S1 — sheet.ac is byte-faithful from the save (sheetFromSaved()) but never reached the
   // on-screen summary, despite this screen's own displayed copy already claiming AC is shown.
   // M59.S1 — sheet.thac0 has the identical gap: named in the same displayed sentence as AC, byte-
   // faithful from the save, already in scope right here, never threaded through until now.
   result.summary.push({ name: sheet.name, cls, level, hp: sc.hitPoints, xp: sc.xp, ac: sheet.ac, thac0: sheet.thac0 });

   // after:
   result.imported.push(sheet.name);
   // M51.S1 — sheet.ac ...
   // M59.S1 — sheet.thac0 ...
   // M60.S1 — sheet.savingThrows has the identical gap: named in the same displayed sentence, byte-
   // faithful from the save, already in scope right here. Formatted exactly like create.ts:312's own
   // live preview ("saves P/P/R/B/S") — a real, already-shipped compact-cell convention, not a new one.
   const sv = sheet.savingThrows;
   const saves = `${sv.paralyzePoisonDeath}/${sv.petrifyPolymorph}/${sv.rodStaffWand}/${sv.breath}/${sv.spell}`;
   result.summary.push({ name: sheet.name, cls, level, hp: sc.hitPoints, xp: sc.xp, ac: sheet.ac, thac0: sheet.thac0, saves });
   ```

3. **`apps/web/src/ui/importParty.ts:277`** (`installImportSeam()`'s `party()` getter) — widen so an
   e2e coherence check has a ground-truth value (mirrors M59's identical step for `thac0`):

   ```ts
   // before:
   party: () => getParty().map((s) => ({ name: s.name, classes: s.classes, hp: s.hp, ac: s.ac, thac0: s.thac0, abilities: s.abilities })),

   // after:
   party: () => getParty().map((s) => ({ name: s.name, classes: s.classes, hp: s.hp, ac: s.ac, thac0: s.thac0, savingThrows: s.savingThrows, abilities: s.abilities })),
   ```

4. **`apps/web/src/ui/main.ts:759-777`** (`startImport()`'s table) — one more column, placed right
   after THAC0 (identity → class/level → vitality → to-hit → save-resilience → loot):

   ```ts
   // before:
   const rows = res.summary
     .map(
       (s) =>
         `<tr><td>${s.name}</td><td>${s.cls} L${s.level}</td><td>${s.hp} HP</td><td>AC ${s.ac}</td><td>THAC0 ${s.thac0}</td><td>${s.xp ? s.xp.toLocaleString() + ' XP' : '—'}</td></tr>`,
     )
     .join('');
   ...
   `<table class="import-table"><thead><tr><th>Name</th><th>Class</th><th>HP</th><th>AC</th><th>THAC0</th><th>XP</th></tr></thead><tbody>${rows}</tbody></table>`;

   // after:
   // M60.S1 — s.saves (the real byte-faithful five-save quintuple, pre-formatted like create.ts's own
   // preview) was named in this screen's own paragraph ("...and saves are taken byte-for-byte from your
   // save") but never had a column; add one, matching the AC/THAC0 fixes' shape.
   const rows = res.summary
     .map(
       (s) =>
         `<tr><td>${s.name}</td><td>${s.cls} L${s.level}</td><td>${s.hp} HP</td><td>AC ${s.ac}</td><td>THAC0 ${s.thac0}</td><td>${s.saves}</td><td>${s.xp ? s.xp.toLocaleString() + ' XP' : '—'}</td></tr>`,
     )
     .join('');
   ...
   `<table class="import-table"><thead><tr><th>Name</th><th>Class</th><th>HP</th><th>AC</th><th>THAC0</th><th>Saves</th><th>XP</th></tr></thead><tbody>${rows}</tbody></table>`;
   ```

5. **Tests** (extend the existing `runImportCok` e2e case only — no new test file, no new seam). In
   `apps/web/test/e2e.mjs`, right after the existing `thac0ShownOk` block (`e2e.mjs:2212-2213`), add
   a sibling `savesShownOk` check using the same `sir` (`SIR STRONGSWORD`) fixture and `tableText`
   the case already resolves:

   ```js
   // after e2e.mjs:2213 (thac0ShownOk), before the `ok = ...` line:
   // M60.S1 — the on-screen import table now shows each hero's real byte-faithful saving throws
   // (sir.savingThrows, already exposed on the seam above); confirm the rendered HTML text agrees
   // with the seam-computed compact string for SIR STRONGSWORD (11/10/10/14/11), proving the copy's
   // own "...and saves ... taken byte-for-byte" claim is now true for every field it names.
   const sirSaves = sir?.savingThrows
     ? `${sir.savingThrows.paralyzePoisonDeath}/${sir.savingThrows.petrifyPolymorph}/${sir.savingThrows.rodStaffWand}/${sir.savingThrows.breath}/${sir.savingThrows.spell}`
     : null;
   const savesShownOk = !!sirSaves && tableText.includes(sirSaves);

   // widen the existing conjunction (e2e.mjs:2214):
   ok = count >= 3 && named && faithful && everyoneClassed && istanIsMage && stipendOk && acShownOk && thac0ShownOk && savesShownOk;

   // widen the existing error-diagnostic string (e2e.mjs:2215) to also report savesShownOk/sirSaves.
   ```

Rough size: 1 widened interface field + 1 three-line push-site edit (compute `sv`/`saves`, add to
the push) + 1 one-line seam-getter edit in `importParty.ts`; 1 new `<th>`/one `.map()` template edit
in `main.ts`; ~8 LOC added to the existing `runImportCok` e2e case. No engine-package file touched
— engine test count should remain 1336 (this round's scratch test is deleted, not shipped). No new
UI panel, no new route, no new test file.

## Layout / feasibility check

Same unstyled-`<table>` situation M51.S1/M59.S1 already confirmed safe: re-grepped for any CSS rule
targeting `.import-table` (`viewer.css` and every other stylesheet in `apps/web/src`) — none exists.
Adding a 7th `<th>`/`<td>` pair (Name, Class, HP, AC, THAC0, **Saves**, XP) is the same trivial HTML
operation the two prior columns already proved safe. Real compact-saves strings from the six
bundled saves run `11/10/10/14/11` (14 chars) to `18/12/14/16/15` (14 chars) — bounded, short,
double-digit-max values (AD&D 1e saves cap well under 20 at these campaign levels), no
cell-width/overflow risk. `create.ts`'s own screen already renders the identical string inline next
to THAC0/AC/HP with no reported layout issue, a second live data point that this string's typical
width is unproblematic.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **Applying M59's "paragraph vs. its own table" method to other screens' `<p>` copy** | Attempted first, per the brief. Grepped every `'<p` HTML literal in `apps/web/src/ui/*.ts`: only 4 exist codebase-wide, and all 4 belong to the two import screens (`main.ts:752,775,828,846`) — no other screen in this codebase builds an HTML `<table>`/paragraph pair at all (`grep -rn "<table" apps/web/src/ui/*.ts` returns only the same two import tables). No fresh HTML-table candidate exists to find. |
| **Generalizing the method to non-HTML descriptive copy** (hint-bar `menu.innerHTML` strings next to a canvas-composed panel) | Checked every `menu.innerHTML =` assignment across `apps/web/src/ui/*.ts` that names multiple facts: `hudPanel.ts:149` ("HP, XP, AC, class and condition") — checked against `composeHudPanel()` (`packages/engine/src/render/hudPanel.ts`); all five are genuinely drawn (name/class/AC/HP/XP columns + row-colour/DOWN-DEAD condition tag). `mainMenu.ts:233`/`packages/engine/src/render/mainMenu.ts` doc comment ("name / class+level / AC / HP") — all four drawn; `MainMenuMember.level` is unpopulated by `mainMenu.ts`'s own `roster()` but that's the already-flagged "redundant, `cls` already carries the level string" situation from earlier rounds, not a new gap. `automapPanel.ts:253` ("Walls ━ doors ╴╴ notes ■") — checked against `packages/engine/src/render/automapPanel.ts`; all three edge/marker types are genuinely drawn (`edgeColor()`, note dot). All three checked clean; no gap found. |
| **The DoK→DQK import screen's own "ability scores... taken byte-for-byte" claim** (`main.ts:846-849`) | A genuinely new observation this round: the DoK paragraph names "ability scores" but the DoK table (Name/Class/HP/AC/Spells) never shows them either — the same shape of gap as CoK's Abilities. But rejected for a fix this round on identical grounds to M59's Abilities rejection: it's a 6-value family (not a scalar), it's already shown in full via `charSheet.ts` once the DQK roster is reached (confirmed reachable: `dqkExplore.ts:75,585` wires the same `openCharSheet`/`composeCharSheet` the CoK menu uses, over the same shared `getParty()` roster `importDokParty()` installs), and — unlike Saves — there is no existing compact-abilities-string precedent anywhere in this codebase to point to (checked: `create.ts`'s preview has no equivalent abilities line). Flagged as a standing open item, not fixed. |
| **Also adding a compact "Abilities" cell to the CoK table** (the other half of M59's open question) | Investigated specifically this round (see "Why THIS round..." above): no shipped precedent exists for a compact 6-value abilities string anywhere in this codebase (grepped for any `abilities ${...}`-style joined-string template; none found), unlike Saves' concrete `create.ts:312` precedent. Left open, exactly where M59 left it — this round only had grounds to act on the half of the question a real precedent supports. |
| **`companionPanel.ts`, `dialogue.ts`, `wilderness.ts`, `create.ts`, `charEditor.ts` full re-reads for a paragraph/table mismatch** | Read in full this round looking for any other multi-fact descriptive copy; none found beyond the items above. `dialogue.ts` is a hand-authored, non-copyrighted demo conversation (no real save/game-data claims to check). `wilderness.ts`'s own hint bar ("Travel across the region · stepping onto a town arrives there · wandering monsters drop into combat") matches its actual keyboard behaviour; no additional field named. `create.ts`'s own live preview is where the Saves precedent was actually found (a positive result, not a rejection). |
| **Re-running the DoK↔DQK / CoK↔DoK cross-table column-parity sweep** (M58's original framing) | Not re-attempted — M59 already found and documented that this produces mostly false positives (the two importers compute genuinely different facts); no new angle surfaced this round to revisit that conclusion. |
| **`BASE_ITEMS` catalogue coverage, DoK `xp`/`hitPoints` gap B5, `runItemPluses` e2e hardening, ECL-ally `morale`, `moonPhasesForDay`, `referenceDb.ts` Class-label collision, `dialogue.ts`/`town.ts` day-wiring, `LILLITH`'s memorized-spell total** | All standing candidates from M54–M59's lists — not re-investigated; a genuinely fresh, real, small candidate (the Saves compact cell, backed by a newly-found concrete precedent) was found first via the brief's own suggested method plus M59's explicitly-flagged open question, so the round did not need to fall back to these. |

## Open questions / unknowns

- **Should the DoK→DQK import screen's "ability scores" claim (`main.ts:846`) eventually get the
  same compact-cell treatment as CoK's Saves, once/if a codebase precedent for a joined abilities
  string exists?** **UNKNOWN** — this round found no such precedent to point to (unlike Saves), so
  it was left as a standing, unfixed, but explicitly-noted gap rather than invented from scratch.
- **Should CoK's Abilities (6 values) get the same treatment** once/if a similar precedent surfaces
  elsewhere in the codebase? Still **UNKNOWN** and explicitly left open by this round, same as M59
  left it — the deciding factor this round used (an existing shipped precedent) simply doesn't
  exist yet for Abilities on either import screen.
- **Column ordering/format bikeshed**: this round's plan places Saves between THAC0 and XP (matching
  a "to-hit → save-resilience → loot" narrative order) and uses a bare slash-joined string with no
  per-save prefix in the cell (matching `create.ts:312`'s own bare format, since the column header
  "Saves" already supplies the label). A minor, non-blocking presentation choice.
- **Should the column header abbreviate the five save categories** (e.g. a `title=` tooltip listing
  "Paralyze/Poison/Death, Petrify/Polymorph, Rod/Staff/Wand, Breath, Spell" in order) for players
  unfamiliar with the AD&D 1e save categories? Not attempted this round — a polish idea, not a
  correctness gap; the same bare format is already accepted without a tooltip on `create.ts`'s own
  screen.

## Implications for our engine

- **A previous round's own explicitly-flagged "open question" is a legitimate, ready-made next
  candidate** — M59 didn't just leave a vague TODO; it proposed a specific fix shape ("a compact
  single-cell... matching the existing `classLabel()`-style convention") without confirming that
  convention actually existed for this exact use case. This round's job was largely to go verify
  that claim, and it turned out to be even better-grounded than M59 guessed: not `classLabel()`
  (a *different* multi-class convention on a *different* field), but an exact, already-shipped
  saves-string on a completely different screen (`create.ts`). Worth treating "does a fix the prior
  round proposed-but-declined already have a concrete precedent somewhere else in the codebase" as
  its own cheap, high-signal check before accepting or declining a "compact multi-value cell" idea
  in the future.
- **The "paragraph vs. its own table" method has a hard ceiling in this codebase**: only two screens
  in the entire `apps/web/src/ui` tree build an HTML `<table>` next to descriptive `<p>` copy at all
  (both import screens), and the method's non-HTML generalization (checking `menu.innerHTML` hint
  bars against their neighbouring canvas panel) came back clean everywhere else it was tried this
  round (HUD, main menu, automap). This is a genuinely exhausted vein for this specific method,
  codebase-wide, not just for the two screens M59 already fixed — future rounds should not expect
  to find more mileage here without a new kind of screen or a new HTML table being added first.
- **Not every named-but-untabulated fact in the same sentence deserves the same fix, but the
  criterion for "which one, now" doesn't have to be arbitrary.** M59 drew the line at "single scalar
  vs. multi-value family" and left both Saves and Abilities on the "not yet" side. This round
  refined that line further: among two equally-shaped multi-value families, the one with an actual
  existing display-convention precedent elsewhere in the codebase is the one ready to ship; the one
  without a precedent is correctly still not ready, even though its underlying data is exactly as
  real and byte-faithful as its sibling's.
