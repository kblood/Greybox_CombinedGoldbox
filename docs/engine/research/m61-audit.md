# M61 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done-section entries for M56.S1–M60.S1 in full,
> and `docs/engine/research/m60-audit.md` in full (its "Rejected alternatives investigated this
> round", "Open questions / unknowns" and "Implications" sections in particular), per the brief.
> Per the brief's own instruction, this round applied M60's new **"does a prior round's declined fix
> already have a concrete precedent elsewhere in the codebase"** method as the FIRST angle — starting
> with Abilities (the sibling fact M59/M60 both explicitly left unfixed in the exact same sentence
> Saves was just fixed in), then widening to every other "declined for shape/ambiguity reasons"
> candidate found by skimming M24–M60's own audit docs (`MonsterRecord.conSaveBonus`'s "ambiguous
> roll-modifier" rejection, `.readied`/`.affects`/`.weight`'s architecture-gap rejections, the
> spell-save/morale-break preview rejections, ECL-recruited allies' `morale`). **None of these turned
> up a usable precedent** — Abilities still has no compact-join convention anywhere in this codebase
> (re-confirmed by grep); `conSaveBonus`'s objection is a *different* shape (display ambiguity, not
> "family of values lacking a shipped convention") and no "roll modifier, clearly labelled" precedent
> exists either; re-tracing ECL-ally `morale` one level deeper than any prior round actually
> **disqualifies** it outright (see "Rejected alternatives" — `tactical.ts`'s `moraleBreakOf` gates on
> `c.side !== 'enemy'`, so a recruited ally's morale is mechanically inert the moment it's folded into
> combat as a `side: 'party'` combatant; it was never a live "silently dropped" fact to begin with,
> just an accounting error carried since M54).
>
> Falling back to a **sibling-compositor analog** sweep (the same "does an already-shipped feature in
> one compositor have an unshipped analog in a sibling compositor" method M45 used for
> `itemCategory()`/`spellCategory()`) turned up this round's real pick: the CoK **and** DoK→DQK import
> screens are the exact same kind of sibling pair M58/M59/M60 already mined three rounds running, but
> always by picking ONE screen's own paragraph-vs-table gap. This round instead compared what the
> *other* screen's fix already looks like: CoK's table has carried a THAC0 column since M59.S1. DoK's
> table does not — and unlike M59's own check of this exact absence (which asked only "does the DoK
> paragraph falsely claim THAC0 is carried byte-faithfully?" and correctly answered "no"), this round
> asked the question M59 never asked: **is THAC0 one of the "effective combat stats" DoK's own
> paragraph — and `importDokParty.ts`'s own file-level doc comment — already say ARE derived and
> shown?** It is, and it isn't shown.
>
> Confirmed via one throwaway `vitest` script
> (`packages/engine/test/_scratch_m61_verify.test.ts`, created, run — **4/4 green** — then deleted;
> `git status --porcelain --untracked-files=all` confirmed clean before and after, empty except this
> doc).

## Headline finding

### The gap: `importDokParty.ts`'s own doc comment names "AC/THAC0" together as derived outputs; M51.S1 already threaded AC through to the table — THAC0, named in the identical phrase, never was

`apps/web/src/ui/importDokParty.ts:9-13` (file-level doc comment, unmodified since before M51.S1):

```ts
 * full byte-faithful import was left undone for exactly this reason). So unlike B3 — which carries
 * HP/AC/THAC0/saves byte-for-byte and only reconstructs class/level — this importer can only carry
 * **name and the six ability scores** byte-faithfully; class, level, HP and effective AC/THAC0 are
 * all DERIVED through the same `addnd1e-dragonlance` `createCharacter` path `dqkParty.ts`'s Heroes
 * of the Lance already use, not read from the save:
```

"effective AC/THAC0" is named as ONE compound phrase — the two facts this comment calls out, in the
same breath, as this importer's two derived combat numbers. M51.S1 (2026-07-05, per `BUILD-QUEUE.md`)
already fixed AC's absence from the on-screen table. THAC0 — named in the literal same clause — never
got the same treatment.

The on-screen paragraph makes the identical claim in player-facing language,
`apps/web/src/ui/main.ts:849-851` (`startImportDok()`, unmodified since M58.S1):

```ts
'<p style="color:#9aa">Name and ability scores are taken byte-for-byte from your save. DoK\'s compact save ' +
'record has no hit-point field and stores only unarmoured-baseline AC, so class, level, HP and effective ' +
'combat stats are freshly derived for the level your save\'s THAC0 implies (not read from the save).</p>' +
```

Read as rendered HTML (the two literal-string halves concatenated): *"...so class, level, HP and
**effective combat stats** are freshly derived for the level your save's THAC0 implies..."* — "combat
stats" (plural) is the exact same "AC/THAC0" pairing the file doc comment names, just phrased for a
player instead of a maintainer. Since M51.S1, the table has shown AC. It has never shown THAC0.

**Why M59.S1's own check of this exact screen concluded "no gap" — and why that conclusion doesn't
cover this round's question.** M59's rejected-alternatives table states: *"DoK's paragraph says
'combat stats are freshly derived for the level your save's THAC0 implies (not read from the save)'
— it explicitly does NOT claim THAC0 itself is carried byte-faithfully (only that the save's THAC0
informs a derived level), so there is no equivalent false claim to fix there."* That check asked only
whether the paragraph makes a **false fidelity claim** about THAC0 (it doesn't — THAC0 is honestly an
*input* to level inference, not a byte-faithful *output*). It never asked the *other* question this
same sentence supports: is THAC0 one of the **"effective combat stats"** the paragraph says ARE shown
as *derived* outputs — the same category AC belongs to, which M51.S1 already surfaced? It is (see
verification below: `sheet.thac0` is a real, always-populated `CharacterSheet` field, computed by the
exact same `createCharacter()` call that produces `sheet.ac`) — and unlike AC, it never reached the
table. M59 correctly closed off one interpretation of this sentence without checking the other; this
round checked the other.

The table itself, `apps/web/src/ui/main.ts:844-852` (`startImportDok()`, unmodified since M58.S1):

```ts
const rows = res.summary
  .map((s) => `<tr><td>${s.name}</td><td>${s.cls} L${s.level}</td><td>${s.hp} HP</td><td>AC ${s.ac}</td><td>${s.mem ? `${s.mem} spell${s.mem === 1 ? '' : 's'}` : '—'}</td></tr>`)
  .join('');
panel.innerHTML =
  `<h2>Imported ${res.imported.length} hero${res.imported.length === 1 ? '' : 'es'} from Death Knights of Krynn</h2>` +
  '<p style="color:#9aa">Name and ability scores are taken byte-for-byte from your save. DoK\'s compact save ' +
  'record has no hit-point field and stores only unarmoured-baseline AC, so class, level, HP and effective ' +
  'combat stats are freshly derived for the level your save\'s THAC0 implies (not read from the save).</p>' +
  `<table class="import-table"><thead><tr><th>Name</th><th>Class</th><th>HP</th><th>AC</th><th>Spells</th></tr></thead><tbody>${rows}</tbody></table>`;
```

Five columns: Name/Class/HP/AC/Spells. No THAC0 anywhere.

`apps/web/src/ui/importDokParty.ts:199-216` (`sheetFromDokSaved()`, unmodified) shows `res.sheet` —
the full `CharacterSheet` `createCharacter()` builds, which always includes `.thac0` (a required, not
optional, field on `CharacterSheet` — `packages/engine/src/ruleset/addnd1e-dragonlance/character.ts:64`,
*"Best (lowest) effective THAC0 across classes, incl. STR to-hit + deity grant"*) — computed the exact
same way, at the exact same call, as `.ac` (which M51.S1 already threads through):

```ts
function sheetFromDokSaved(sc: DokSavedCharacter, spellIds?: number[], baseAc = sc.baseArmorClass): DokImportCandidate | null {
  const cls = inferDokClass(sc, spellIds);
  const level = inferDokLevel(cls, sc.thac0);   // sc.thac0 (the RAW save byte) is only an INPUT here
  const hp = level * levelHpGain(hitDie(cls));
  const req: CharacterRequest = { name: sc.name.trim() || 'IMPORTED', race: 'human', sex: 'male',
    classes: { [cls]: level }, abilities: { ...sc.abilities },
    deity: cls === 'cleric' ? DEFAULT_DEITY : undefined, hp, maxHp: hp, baseAc };
  const res = createCharacter(req);              // res.sheet.thac0 is the real OUTPUT, never read here
  return res.ok ? { sheet: res.sheet, cls, level, hp } : null;
}
```

Note the naming trap this round had to be careful about: `sc.thac0` (the save's raw stored byte) is
only ever used as an *input signal* to `inferDokLevel()` (to pick the best-matching class table row);
the real derived combat number a DoK-imported hero actually fights with is `res.sheet.thac0`, computed
fresh by `createCharacter()` from the *inferred* class+level (plus STR-to-hit and deity grant, per its
own doc comment) — a genuinely different number from the raw input byte (see verification below: e.g.
SIR DRYDEN's raw save byte is 14 (`m32-audit.md`'s own probe table), but his derived `sheet.thac0` is
13 — the createCharacter recompute, not a copy of the input).

`sheet.thac0` is not a passive display fact either: `apps/web/src/ui/party.ts`'s `sheetToCombatant()`
(the SAME function every CoK/DoK/DQK party member's fight-ready `Combatant` is built through) reads it
directly:

```ts
// packages/engine/src/... via apps/web/src/ui/party.ts:345-361
export function sheetToCombatant(sheet: CharacterSheet, id: string): Combatant {
  return {
    ...
    thac0: sheet.thac0,
    ...
```

Since a DoK-imported hero joins the shared `getParty()` roster and DQK dungeon combat launches through
this exact same `partyCombatants()`/`sheetToCombatant()` pipeline (per C4.3's own history — DQK reuses
"the shared Phase-A systems... those overlays were already party+ruleset-driven"), `sheet.thac0` is
literally the to-hit number every DoK-imported hero fights DQK's monsters with from the moment of
import — exactly as consequential as the AC number M51.S1 already surfaced, and the same field CoK's
own import screen has shown (as its own THAC0 column) since M59.S1.

## Real-bytes / real-mechanic verification (this round)

Reproduced via `packages/engine/test/_scratch_m61_verify.test.ts` (created, run, **4/4 passed**, then
deleted):

1. **All 6 real bundled `Death Knights of Krynn/SAVE/CHRDATA{1..6}.GAM` (+ matching `.WIZ`) files
   decode, through a faithful re-derivation of `importDokParty.ts`'s own `inferDokClass`/
   `inferDokLevel`/`createCharacter` pipeline, to 5 importable heroes (NEACAIL correctly absent — she
   is rejected on ability-range, per M33.S1, unchanged here) with non-degenerate, VARYING derived
   `sheet.thac0`:**

   | Name | Inferred class/level | Derived `sheet.thac0` |
   |---|---|---|
   | SIR DRYDEN | fighter L7 | 13 |
   | LILLITH | fighter L8 | 12 |
   | TANAR | cleric L7 | 15 |
   | FLAVIUS | cleric L7 | 15 |
   | CELESTE | magicUser L6 | 19 |

   Three distinct values across the five real pregens (TANAR and FLAVIUS coincidentally land on the
   same cleric-L7 THAC0 — the same kind of harmless tie M59/M60 already found and shipped through for
   CoK's own Saves/THAC0 columns, e.g. "KAL and SIRRION happen to share identical saves"). Confirmed
   these are genuinely *derived outputs*, not copies of the raw save byte: SIR DRYDEN's own raw
   `.GAM` THAC0 byte is 14 (`m32-audit.md`'s own independent byte probe), but his `createCharacter`
   recomputed `sheet.thac0` is 13 — a real recompute through the class/level/STR-bonus/deity-grant
   path, exactly like `sheet.ac` already is for the same characters (M34.S1/M51.S1).
2. **Source-text proof: `sheetToCombatant()` (`apps/web/src/ui/party.ts`) reads `sheet.thac0` verbatim**
   — isolated the function body and confirmed the literal `thac0: sheet.thac0` assignment, the same
   function/field pairing M59's own audit already established as CoK's real to-hit consumer.
3. **Source-text proof: `importDokParty.ts`'s own file doc comment names "AC/THAC0" together as derived
   outputs, but `DokImportResult.summary`'s inline type and its push site never carry `thac0`** —
   regex-matched the doc comment's `effective AC/THAC0 ... all DERIVED` phrase; isolated the
   `export interface DokImportResult { ... }` block (contains `ac` — M51.S1 — but no `thac0` anywhere,
   case-insensitive); isolated the `result.summary.push({...})` call (contains `ac: sheet.ac` but no
   `thac0`).
4. **Source-text proof: `main.ts`'s `startImportDok()` body contains the on-screen paragraph's
   "effective ... combat stats" phrase (split across a string concatenation at exactly that point in
   the source) and its table header/row-template never mention THAC0** — isolated the function body
   between its own definition and the next top-level `async function`; confirmed the two string-halves
   ("...HP and effective " + "combat stats are freshly derived...") are present and adjacent; confirmed
   the `<thead>` row has `<th>AC</th>` (M51.S1) but no `THAC0`; confirmed the `rows` template literal
   has no `thac0` interpolation.

Full engine suite re-run after adding the scratch file: **1340 tests passed** (1336 baseline + 4 new
scratch tests); after deleting it, re-confirmed back at **1336 passed, 0 failed**.
`git status --porcelain --untracked-files=all` is empty except this doc.

## Wiring plan

**Two UI files touched (`importDokParty.ts`, `main.ts`) plus a small extension to the existing
`runImportDok` e2e case (reusing its already-existing `.import-table` DOM-text-check pattern and its
already-resolved `dryden`/`lillith`/`tanar`/`flavius`/`celeste` fixtures, the exact shape M51.S1/M58.S1
used for this same screen) — no new UI panel, no new route, no new seam function, no engine-package
change (`sheet.thac0` is already a required `CharacterSheet` field, already decoded, already in scope
at every site this plan touches).**

1. **`apps/web/src/ui/importDokParty.ts:226`** — widen `DokImportResult.summary`'s inline type with
   `thac0`:

   ```ts
   // before:
   summary: { name: string; cls: CoreClassId; level: number; hp: number; ac: number; mem?: number }[];

   // after:
   /** Per-character summary for display. M61.S1 — `thac0` is `sheet.thac0`, the real derived combat
    * number `sheetToCombatant()` already feeds into every DoK-imported hero's real to-hit roll in DQK
    * combat — named in this file's own doc comment ("effective AC/THAC0 are all DERIVED") in the same
    * breath as `ac` (M51.S1), and in the on-screen paragraph's "effective combat stats" claim, but
    * never threaded through until now. */
   summary: { name: string; cls: CoreClassId; level: number; hp: number; ac: number; thac0: number; mem?: number }[];
   ```

2. **`apps/web/src/ui/importDokParty.ts:297-309`** (the push site) — thread the already-in-scope
   `sheet.thac0`, right next to `sheet.ac`:

   ```ts
   // before:
   result.imported.push(sheet.name);
   // M51.S1 — sheet.ac (M34.S1's real worn-gear-derived AC) was already computed and destructured
   // above, but never reached the on-screen summary; thread it through.
   // M58.S1 — mem (the real carried-over Memorization, already computed above and already fed to
   // setMemorization one line below) was never folded into the on-screen summary; thread the total
   // memorized-spell count through so the import screen discloses it like every other derived stat.
   result.summary.push({ name: sheet.name, cls, level, hp, ac: sheet.ac, mem: mem ? mem.byLevel.flat().length : undefined });

   // after:
   result.imported.push(sheet.name);
   // M51.S1 — sheet.ac ...
   // M58.S1 — mem ...
   // M61.S1 — sheet.thac0 has the identical gap: named in this file's own doc comment in the same
   // breath as `ac` ("effective AC/THAC0 are all DERIVED"), computed by the exact same createCharacter()
   // call, already in scope right here — thread it through the same way.
   result.summary.push({ name: sheet.name, cls, level, hp, ac: sheet.ac, thac0: sheet.thac0, mem: mem ? mem.byLevel.flat().length : undefined });
   ```

3. **`apps/web/src/ui/importDokParty.ts:322`** (`installImportDokSeam()`'s `party()` getter) — widen so
   an e2e coherence check has a ground-truth value (mirrors M51.S1's identical step for `ac`):

   ```ts
   // before:
   party: () => getParty().map((s) => ({ name: s.name, classes: s.classes, hp: s.hp, ac: s.ac, abilities: s.abilities })),

   // after:
   party: () => getParty().map((s) => ({ name: s.name, classes: s.classes, hp: s.hp, ac: s.ac, thac0: s.thac0, abilities: s.abilities })),
   ```

4. **`apps/web/src/ui/main.ts:844-852`** (`startImportDok()`'s table) — one more column, placed right
   after AC (matching CoK's own AC→THAC0 narrative order, M59.S1):

   ```ts
   // before:
   const rows = res.summary
     .map((s) => `<tr><td>${s.name}</td><td>${s.cls} L${s.level}</td><td>${s.hp} HP</td><td>AC ${s.ac}</td><td>${s.mem ? `${s.mem} spell${s.mem === 1 ? '' : 's'}` : '—'}</td></tr>`)
     .join('');
   ...
   `<table class="import-table"><thead><tr><th>Name</th><th>Class</th><th>HP</th><th>AC</th><th>Spells</th></tr></thead><tbody>${rows}</tbody></table>`;

   // after:
   // M61.S1 — s.thac0 (the real derived combat number, computed by the same createCharacter() call as
   // s.ac) was named in this screen's own paragraph ("...effective combat stats are freshly derived...")
   // and in importDokParty.ts's own doc comment ("effective AC/THAC0"), but never had a column; add one,
   // matching the AC fix's shape (M51.S1).
   const rows = res.summary
     .map((s) => `<tr><td>${s.name}</td><td>${s.cls} L${s.level}</td><td>${s.hp} HP</td><td>AC ${s.ac}</td><td>THAC0 ${s.thac0}</td><td>${s.mem ? `${s.mem} spell${s.mem === 1 ? '' : 's'}` : '—'}</td></tr>`)
     .join('');
   ...
   `<table class="import-table"><thead><tr><th>Name</th><th>Class</th><th>HP</th><th>AC</th><th>THAC0</th><th>Spells</th></tr></thead><tbody>${rows}</tbody></table>`;
   ```

5. **Tests** (extend the existing `runImportDok` e2e case only — no new test file, no new seam). In
   `apps/web/test/e2e.mjs`, right after the existing `acShownOk` block (`e2e.mjs:2320-2328`) and before
   the `memShownOk` block, add a sibling `thac0ShownOk` check using the same `dryden`/`lillith`/`tanar`/
   `flavius`/`celeste` fixtures and `tableText` the case already resolves:

   ```js
   // after e2e.mjs:2328 (acShownOk), before memShownOk:
   // M61.S1 — the on-screen import table now shows each hero's real derived THAC0 (sheet.thac0,
   // already exposed on the seam above); confirm the rendered HTML text agrees with the seam-computed
   // number for all 5 real importable pregens, proving the paragraph's "effective combat stats" claim
   // is now true for THAC0 too, not just AC.
   const thac0ShownOk = /SIR DRYDEN[\s\S]*?THAC0 13/.test(tableText)
     && /LILLITH[\s\S]*?THAC0 12/.test(tableText)
     && /TANAR[\s\S]*?THAC0 15/.test(tableText)
     && /FLAVIUS[\s\S]*?THAC0 15/.test(tableText)
     && /CELESTE[\s\S]*?THAC0 19/.test(tableText);

   // widen the existing conjunction (e2e.mjs:2337):
   ok = count === 5 && named && faithful && everyoneClassed && drydenIsFighter && flaviusIsCleric && tanarIsCleric && hpDerived && neacailRejected && memOk && acOk && acShownOk && thac0ShownOk && memShownOk;

   // widen the existing error-diagnostic string (e2e.mjs:2339-2344) to also report thac0ShownOk.
   ```

   The seam-derived `dryden`/`lillith`/`tanar`/`flavius`/`celeste` values used above should be read from
   `party.find(...)`'s widened `.thac0` field (step 3) rather than hardcoded, mirroring how `acShownOk`
   reads `dryden?.ac`/etc. — hardcoded literals shown here only to make the diff self-contained; the
   lead should prefer reading `dryden?.thac0` etc. from the already-resolved `party` array for the same
   reason M59/M60 preferred seam-derived values over literals where the case already has them in scope.

Rough size: 1 widened interface field + 1 one-line push-site edit (add `thac0: sheet.thac0`) + 1
one-line seam-getter edit in `importDokParty.ts`; 1 new `<th>`/one `.map()` template edit in `main.ts`;
~10 LOC added to the existing `runImportDok` e2e case. No engine-package file touched — engine test
count should remain 1336 (this round's scratch test is deleted, not shipped). No new UI panel, no new
route, no new test file.

## Layout / feasibility check

Same unstyled-`<table>` situation M51.S1/M58.S1/M59.S1/M60.S1 already confirmed safe on this exact
pair of screens: re-grepped for any CSS rule targeting `.import-table` (`viewer.css` and every other
stylesheet in `apps/web/src`) — none exists. Adding a 6th `<th>`/`<td>` pair (Name, Class, HP, AC,
**THAC0**, Spells) is the same trivial HTML operation the CoK screen's own THAC0 column (M59.S1) and
this same DoK screen's AC/Spells columns (M51.S1/M58.S1) already proved safe. Real derived THAC0
values from the five importable pregens run 12–19 (two-digit, matching `"THAC0 13"`/`"THAC0 19"` at
7-8 characters, the identical cell-width class as CoK's already-shipped `"THAC0 18"`/`"THAC0 20"`
cells) — no cell-width/overflow risk, and a second live precedent (CoK's own column, unchanged since
M59.S1) that this exact string shape renders without issue.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| **Abilities getting a compact-cell precedent** (M60's own standing open question, checked FIRST per this round's brief) | Re-checked via grep across `apps/web/src/ui/*.ts` for any joined/formatted "ability score string" template (`` `${ab.str}/${ab.int}/...` ``-shaped or similar): none exists anywhere, including `create.ts`'s own live preview (which formats Saves compactly but shows abilities only as individual input fields) and `charSheet.ts`'s `toView()` (abilities as an array of `{label, value}` rows, never joined). No new precedent surfaced since M60 — still correctly left unfixed. |
| **`MonsterRecord.conSaveBonus`** (re-examined for a "roll modifier, clearly labelled" precedent, per this round's "does a declined fix have a precedent" method) | M43.S1's rejection reasoning is specifically about display AMBIGUITY (a bare row risks a player misreading it as changing the printed `Save` target itself), a different shape than Saves/Abilities' "family of values with no shipped convention" rejection. Searched for any existing UI convention that labels a hidden roll-modifier distinctly from a target/threshold (e.g. a `"(roll)"` suffix, a parenthetical qualifier): none found anywhere in `packages/engine/src/render` or `apps/web/src/ui`. `itemCategory()`'s Range row (M44.S1) and `spellCategory()`'s Range/Area/Save rows (M45.S1) are self-contained facts, not modifiers-vs-a-target, so they don't supply the needed precedent either. Still correctly unfixed. |
| **ECL-recruited allies' `morale` never stated in the join-message** (standing since M54, re-examined one level deeper than any prior round per this round's brief) | Traced past the "is it real, is it decoded" question (M35.S1, yes) into "does it actually do anything once folded into combat" — it does not: `explore.ts:393`'s `allyCombatants()` builds these as `monsterCombatant(rec, ..., 'party')` (`side: 'party'`), and `tactical.ts:901`'s `moraleBreakOf()` opens with `if (c.side !== 'enemy' || ...) return null` — an ally's `morale` field is carried onto its `Combatant` (`combat.ts:335`, `morale: mon.morale`) but the ONE mechanic that ever reads `.morale` unconditionally excludes non-enemy combatants. This is not a "silently dropped display fact with a real consumer" — it is a field with **no real consumer at all** once used in its actual context (party-side), the same disqualifying shape as `PartyMemberStatus.age`/`CombatCellState.hpFraction`. Also checked whether the join message could instead disclose the ally's class/level: CoK's `MON{n}CHA.DAX` 409-byte format has no `npcClass`/`npcLevel` fields at all (`decodeNpcRecord`/`npcClass` exist only in `moncha.ts`, DQK's decoder) — LYN SWIFTFOOT (the one real CoK `ADD_NPC` ally, `MON2CHA.DAX` block 61) has no class data to show either. **Recommend retiring this standing candidate** rather than picking it up — see Implications. |
| **`.readied`/`.affects[3]`/`.weight` (M30's rejected DoK item-instance fields)** | Re-checked for a "precedent" angle: all three are rejected for needing NEW architecture (an equip-triggered affect dispatch; a resolved weight-unit convention; a "which items actually got dropped" mechanic that doesn't exist), not for lacking a display-format precedent — a precedent-search doesn't apply to this shape of rejection. Not re-picked. |
| **Spell-save preview, morale-break preview** (M49's rejections) | Re-checked: both are rejected for needing a NEW player-facing interaction phase (manual spell targeting; a hypothetical pre-hit damage simulation), not for lacking a display-format precedent. Not re-picked. |
| **`thiefSkillPercent`/`recalcThiefSkills`, `computeClassFlags`/`itemUsableByClassFlags`** (checked while mining doc comments for "never wired" language) | Both are explicitly self-documented as real, tested, but genuinely never called from any UI or gameplay path (no "Use Skill" verb exists; no live item-class gating exists) — confirmed still true by grep (only their own test files reference them). These fail the audit's own "already has a real consumer" bar outright, not merely a display bar; already exhaustively re-confirmed dead by M16/M17/M24/M25, not re-litigated further. |
| **`MonsterRecord.itemPluses`/`.carriedItems`/`.preparedSpellIds`-array family, `wilderness.ts`'s `moonPhasesForDay`, `referenceDb.ts`'s Class-label collision, `dialogue.ts`/`town.ts` day-wiring, `BASE_ITEMS` catalogue coverage, DoK gap B5, `runItemPluses` e2e hardening, `LILLITH`'s memorized-spell total, flat-AC-10 pregen curiosity** | All standing candidates from M54–M60's lists — not re-investigated; a genuinely fresh, real, small candidate (DoK's THAC0 column, found via the sibling-compositor-analog fallback method) was found first, so the round did not need to fall back to these. |

## Open questions / unknowns

- **Should the standing "ECL-recruited allies' `morale`" candidate be formally retired from future
  rounds' standing-candidate lists**, now that this round has traced it to a genuine dead end (no
  consumer once folded into combat as a party-side combatant)? This audit recommends yes — see
  Implications — but leaves the actual list edit to the lead/orchestration doc, since this audit
  doesn't modify `BUILD-QUEUE.md` itself.
- **Should the e2e extension's `thac0ShownOk` check read `dryden?.thac0`/`lillith?.thac0`/etc. from the
  already-widened `party()` seam (step 3) instead of the hardcoded literals shown in the wiring plan
  above?** Recommended (matches M59/M60's own preference for seam-derived over hardcoded expected
  values), left as an implementation-time choice rather than a blocking question — either form proves
  the same fact.
- **Column ordering**: this round's plan places THAC0 between AC and Spells (defense → offense →
  utility), mirroring CoK's own AC→THAC0 adjacency (M59.S1). A minor, non-blocking presentation choice
  the lead may reorder.
- **Should DoK's table eventually also show a Saves column**, matching CoK's (M60.S1)? `sheet.savingThrows`
  is equally real and equally derived by the same `createCharacter()` call — but it was not investigated
  this round (this round's brief was to find one field, and THAC0 was the strongest, most directly
  precedented pick: it's named in the file's own doc comment in the identical phrase as the already-
  fixed AC, unlike Saves, which would be a fresh addition with no "AC/THAC0"-style textual precedent on
  this specific screen). Left as a natural, smaller follow-up, not folded into this round's plan to
  keep the change minimal.

## Implications for our engine

- **The "does a prior round's declined fix have a precedent elsewhere" method (M60) has a real limit:
  it only finds something when the ORIGINAL rejection was itself about a missing precedent/convention.**
  Re-applying it to `conSaveBonus`/`.readied`/spell-save-preview/morale-break-preview this round found
  nothing, because each of those was declined for a genuinely different reason (display ambiguity, a
  missing architecture layer, a missing interaction phase) that a precedent search can't resolve. The
  method is valuable but narrow — worth checking WHY a candidate was declined before spending a round
  trying to find it a precedent.
- **Re-tracing a "real but weaker" standing candidate one level deeper can flip it from "not yet picked"
  to "should never be picked" — a useful, distinct outcome from both "fix it" and "still blocked."**
  ECL-ally `morale` was carried on the standing-candidates list for 7 rounds (M54-M60) as a legitimate,
  just lower-priority, gap. This round's one-hop-further trace (checking whether the field's own
  consumer, `moraleBreakOf`, actually reads it in the context these values are used) found it doesn't —
  the field is decorative in its real usage, not merely low-priority. Worth explicitly re-verifying a
  candidate's "has a real consumer" claim against its ACTUAL call-time context (not just "is this
  function called somewhere"), especially for any field that changes meaning by side/role (here:
  `Combatant.morale` behaves completely differently for `side: 'enemy'` vs `side: 'party'`).
- **The sibling-compositor-analog method (M45) generalizes cleanly to the CoK/DoK import-screen pair
  M58-M60 already mined three rounds running, by asking "what does the OTHER screen's already-shipped
  fix look like, and is it missing here?" rather than re-reading the same screen's own paragraph a
  fourth time.** CoK's THAC0 column (M59.S1) is the direct template this round applied to DoK; the
  same lens (compare a sibling screen's already-fixed column list, not just this screen's own prose)
  is worth trying again if CoK's table or DoK's table ever grows another column one round but not the
  other.
