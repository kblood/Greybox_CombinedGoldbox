# M67 audit — the next "computed but unwired" candidate

> Audit method per the brief: read `docs/engine/BUILD-QUEUE.md`'s Done-section entries for
> M63.S1-M66.S1 in full, and `docs/engine/research/m66-audit.md` in full (its "Verification evidence",
> "Rejected alternatives investigated this round", "Open questions / unknowns", and "Implications"
> sections in particular). Every candidate below was grepped against **every**
> `docs/engine/research/m*-audit.md` file for its exact field/function name before being accepted or
> dropped (the M65/M66 standing discipline).
>
> **Method tried first, per this round's specific instruction: "does `importParty.ts`'s (CoK, B3) own
> already-decoded values all have both a persistence path AND a display path".** Read `importParty.ts`
> fresh in full (288 lines) and traced every value `sheetFromSaved()`/`playerCharacterFromSaved()`
> derives from the real `.SAV` byte decode: `name`, all six `abilities`, `thac0`, `ac`, `savingThrows`,
> `hp`, `xp`, the inferred `cls`/`level` — **every one** already reaches both `addToParty(sheet)`
> (persistence) and the on-screen summary table in `main.ts`'s `startImport()`
> (`AC ${s.ac}`/`THAC0 ${s.thac0}`/`${s.saves}`/`${s.hp} HP`/`${s.xp}... XP`/`${s.cls} L${s.level}`,
> `main.ts:767`). This is because M51/M59/M60 already individually closed the AC, THAC0, and Saves gaps
> in this exact file, in this exact shape — confirmed by reading those three audits' own headline
> sections. **This lens is fully exhausted for `importParty.ts` — no fresh gap found.** (`conv`'s
> race-capped `abilities`/cleared `spellBook`/`multiclassLevel` are also unused past the roster gate,
> but the file's own doc comment at lines 230-232 explains this is a deliberate, reasoned choice — "we
> never copy the race-capped conv.abilities back into it — race is a CoK gap and human caps would
> wrongly lower e.g. KAL's DEX 19→18" — not an oversight.)
>
> **Method tried second, per this round's fallback instruction: search other importer/bridge files.**
> Re-read `importDokParty.ts` fresh in full (356 lines, post-M66) — `mem`, `inv`, `ac`, `thac0` all now
> thread through cleanly (M58/M59/M61/M66); no further gap. Checked
> `packages/engine/src/save/import.ts` (`convertImportedCharacter`/`transferHillsfarCharacter`/
> `importCharacter`) — `transferHillsfarCharacter`/`importCharacter`'s Hillsfar branch has **zero**
> callers anywhere in `apps/web/src` (grepped) because this project has no Hillsfar save data at all —
> a "missing mechanic/missing game data" rejection, the same shape as `combatStepper.ts` (M66), not a
> wiring gap. Checked `dqkParty.ts` (authored roster, no decode — already swept). Checked
> `packages/engine/src/loaders/dqkSave.ts` (`decodeDqkSaveHeader`/`decodeDqkSaveResume`) — real decode,
> but its only callers are build/patch **tooling** (`buildDqkDisk.ts` and friends), not `apps/web`; zero
> UI panel could show it even if a gap existed — out of scope for this loop's "reaches a UI panel" bar,
> same reasoning as `buildDqkGame.ts`'s `DqkMergeAudit` (already-standing rejection).
>
> **Headline pick, found via a third bridge file in the same family: `apps/web/src/ui/charEditor.ts`**
> (the `?chared=1`/`?chared=dok` Character/Save editor) **— `DokSavedCharacter.baseDamage` (the DoK
> save's real, byte-decoded unarmed-baseline damage dice) is fetched, decoded, and already asserted by
> this screen's own e2e seam (`window.__chared.fields().baseDamage`), but is never drawn on the actual
> composed character-sheet screen the editor shows — unlike its own sibling field in the exact same
> decoded object, `baseArmorClass`, which DOES reach the screen** (`ac: `${c.baseArmorClass} (base)``,
> `charEditor.ts:182`). Both fields come from the identical `decodeMonsterRecord()` call inside
> `decodeDokSavedCharacter()` (`dokSavedCharacter.ts:140,146-147`); there is no principled reason one
> reaches the player-visible viewer and the other doesn't.

## Headline finding

### The gap: `DokSavedCharacter.baseDamage` is decoded, tested, and exposed to e2e — but its own sibling field (`baseArmorClass`) is the one that actually reaches the character-sheet screen

`packages/engine/src/loaders/dokSavedCharacter.ts` decodes both fields together, in the same call,
from the same 216-byte `.GAM` record (lines 140-149):

```ts
const m = decodeMonsterRecord(raw);
return {
  name: m.name,
  abilities: { ...m.abilities },
  thac0: m.thac0,
  classCode: raw[32] ?? 0,
  baseArmorClass: m.armorClass,     // <- reaches the screen (see below)
  baseDamage: { ...m.damage },      // <- does NOT reach the screen
  raw,
};
```

Both are explicitly documented, side by side, as the SAME kind of fact — the file's own class doc
comment (lines 12-18) calls them out as a matched pair:

> AC/damage are the unarmoured-human BASELINE, not the character's effective fighting stats... These
> fields are deliberately named `DokSavedCharacter.baseArmorClass`/`DokSavedCharacter.baseDamage` (not
> `armorClass`/`damage`, unlike CoK's `SavedCharacter`) so a caller can't mistake them for ready-to-fight
> numbers.

`apps/web/src/ui/charEditor.ts`'s `toViewDok()` (the function that flattens a `DokSavedCharacter` into
the on-screen `CharSheetView` for the `?chared=dok` read-only save viewer) reads `baseArmorClass` but
never `baseDamage` (lines 168-190):

```ts
function toViewDok(c: DokSavedCharacter, slot: number, items: DokJnkItem[], effects: DokEffect[]): CharSheetView {
  const ab = c.abilities;
  return {
    name: c.name.trim() || `SLOT ${slot + 1}`,
    raceLine: 'DOK SAVE (.GAM)',
    classLine: `CLASS CODE ${c.classCode}`,
    abilities: [ /* ... */ ],
    ac: `${c.baseArmorClass} (base)`,     // <- shown
    thac0: c.thac0,
    hp: 'n/a',
    maxHp: 'n/a',
    saves: SAVE_ROWS.map((r) => ({ label: r.label, value: '—' })), // not located in .GAM
    footer: `${items.length} item${items.length === 1 ? '' : 's'} · ${effects.length} active effect${effects.length === 1 ? '' : 's'}`,
    index: `${slot + 1}/${DOK_SLOT_PATHS.length}`,
  };
}
```

`baseDamage` (a `DamageDice { count, sides, bonus }`, i.e. "1d2+0") never appears in this object at all
— not in `footer`, not anywhere. Yet the file's own e2e test already decodes and asserts it exists,
proving the field is real and already treated as load-bearing by the project:

`apps/web/test/e2e.mjs`, `runCharEditorDok()` (lines 4016-4018, 4022-4024):

```js
// M13: open the read-only DoK save viewer on a real CHRDATA{n}.GAM/.JNK/.EFF quad — confirm the
// decoded fields (name/abilities/thac0/classCode/baseArmorClass/baseDamage) plus the .JNK item
// count and .EFF effect count, that there is no write/export seam, and that Next Slot cycles.
...
const loadedOk =
  !!f0 && typeof f0.name === 'string' && f0.abilities && typeof f0.abilities.str === 'number' &&
  typeof f0.thac0 === 'number' && typeof f0.classCode === 'number' &&
  typeof f0.baseArmorClass === 'number' && f0.baseDamage && typeof f0.baseDamage.sides === 'number' &&
  ...
```

So the field is real, decoded from actual bytes, golden-tested (`dokSavedCharacter.test.ts:44-53,107-116`,
against all 6 real bundled DoK pregens' `.GAM` files), and already exercised by the live e2e suite via
`window.__chared.fields()` — but the ONE screen this file exists to drive (`composeCharSheet` via
`toViewDok()`) never draws it. This is the "sibling field reaches the screen, this one doesn't" shape
that shipped M63 (`move` alongside the already-shown `ac`) and M64 (`attacks` alongside `move`) — here
the already-shown sibling is `baseArmorClass` and the dropped one is `baseDamage`.

Why this isn't a "value degeneracy" rejection (the M40 `.age` shape): `baseArmorClass` is likewise
constant across every real sampled character (`AC 10` on all six pregens — the file's own doc says so
explicitly, "Every sampled character decodes to AC 10, 1d2+0"), and it is STILL shown, precisely because
this screen's whole purpose is to honestly disclose whatever the raw bytes say, flat or not (the file's
own doc: "The sheet shows that honestly (`HP: n/a`, `AC: N (base)`) rather than pretending to a full
CoK-style editor," `charEditor.ts:20-22`). The project's own established convention (CoK's flat AC 10
column, M59; the MV row's flat "unencumbered" result, M63) already accepts "real but currently-flat" as
sufficient grounds to show a field on this exact class of screen. `baseDamage` fails no test
`baseArmorClass` doesn't equally fail, and `baseArmorClass` already passed.

## Verification evidence — which prior audit docs were checked, and what they did/didn't cover

Grepped every `docs/engine/research/m*-audit.md` for `baseDamage`, `DokSavedCharacter`, `charEditor`,
`toViewDok`, `chared`:

- **`baseDamage`** — **zero hits anywhere in the audit corpus.** Never proposed, never rejected, under
  any name.
- **`DokSavedCharacter`** — 3 hits (`m51-audit.md`, `m61-audit.md`, `m66-audit.md`), all about
  `baseArmorClass`/`thac0`/the AC-derivation call chain feeding `importDokParty.ts`'s `sheetFromDokSaved`
  — none about the character-EDITOR screen, none about `baseDamage`. Different subsystem, different
  screen, no overlap.
- **`charEditor`/`toViewDok`/`chared`** — hits in `m34-audit.md`, `m38-audit.md`, `m46-audit.md`,
  `m47-audit.md`, `m60-audit.md`:
  - `m34-audit.md` — flags CoK's own `.STF`/`.SFX` sidecars as a **future** candidate for "giving the
    read-only character editor a real inventory panel for CoK saves, matching what it already half-does
    for DoK's `.JNK`/`.EFF`" — about a missing CoK-side inventory panel, unrelated to `baseDamage`.
  - `m38-audit.md` — a `grep -rn "savingThrows"` hit list that includes `charEditor.ts` as a location
    where `CharacterSheet.savingThrows` (a different type, PC-only) is used — unrelated.
  - **`m46-audit.md`** — the closest near-miss: *"Skimmed [`charEditor.ts`'s] header and CoK/DoK mode
    doc comments; this is the same `.SAV`/`.GAM`/`.JNK`/`.EFF` territory the standing
    item-instance-subsystem blocker (`DokItemRecord.value`/`.magicBonus`/`.charges`/`.cursed`, blocked
    17 consecutive rounds) already covers in depth — not re-investigated further this round."* This is
    about the **item**-instance subsystem (`DokJnkItem.item`'s `MonsterItem` fields: `baseTypeId`,
    `plus`, `value`, `readied`, `affects` — the `.JNK` file's per-item stats), which is a **completely
    different decoded object** from `DokSavedCharacter.baseDamage` (the `.GAM` file's own
    character-level base-combat-stat field, decoded via `decodeMonsterRecord`, not
    `decodeMonsterItem`). M46 skimmed the file's doc comments and correctly avoided re-opening the
    blocked item subsystem, but did not individually examine `toViewDok()`'s own field list against
    `DokSavedCharacter`'s own field list — the specific comparison this round made. Confirmed by
    re-reading `dokSavedCharacter.ts` end to end: `baseDamage` sits in the `DokSavedCharacter` interface
    (line 93), fully separate from `DokJnkItem`/`MonsterItem` (lines 99-114), which is the actually-
    blocked object M46 was (correctly) declining to re-open.
  - `m47-audit.md` — `charEditor.ts` listed among 16 files "re-swept this round... all confirmed still
    clean; no new gap found" as part of a **compositor input-field-by-field** sweep (per angle (a) that
    round used) — but that method (M59/M60's "paragraph vs. its own table") checks a screen's own
    descriptive *copy* against its own rendered *table*, not a source object's field list against its
    renderer's field list. Different method, no overlap with this finding.
  - `m60-audit.md` — `charEditor.ts` re-read in full "looking for any other multi-fact descriptive copy;
    none found beyond the items above" — again the paragraph-vs-table method, not this round's
    source-object-vs-view-mapping method.

**No prior round proposed or rejected "surface `DokSavedCharacter.baseDamage` on the `?chared=dok`
screen" under any framing.** This is a fresh candidate, and it survives the one prior round (M46) that
came closest to this file, because M46's stated reason for not investigating further (the blocked
item-instance subsystem) does not apply to this specific field — `baseDamage` belongs to a completely
separate, non-blocked decode path.

### Real-data verification (this round)

Scratch script `packages/engine/test/_scratch_m67_verify.test.ts` (created, run, all 3 tests green,
then deleted; only engine-level, real-bytes functions used — `decodeDokSavedCharacter`,
`sniffDokSavedCharacter`, plus a verbatim copy of `referenceDb.ts`'s own `dmgText()` formatter to prove
the value would render using the codebase's existing Damage-row convention):

```
CHRDATA1.GAM → SIR DRYDEN  baseDamage={count:1,sides:2,bonus:0}  baseArmorClass=10
CHRDATA2.GAM → LILLITH     baseDamage={count:1,sides:2,bonus:0}  baseArmorClass=10
CHRDATA3.GAM → TANAR       baseDamage={count:1,sides:2,bonus:0}  baseArmorClass=10
CHRDATA4.GAM → FLAVIUS     baseDamage={count:1,sides:2,bonus:0}  baseArmorClass=10
CHRDATA5.GAM → NEACAIL     baseDamage={count:1,sides:2,bonus:0}  baseArmorClass=10
CHRDATA6.GAM → CELESTE     baseDamage={count:1,sides:2,bonus:0}  baseArmorClass=10
dmgText({count:1,sides:2,bonus:0}) === '1d2'
```

- Test 1 decodes all 6 real bundled `.GAM` pregens, confirms every one produces a well-formed
  `DamageDice` (positive `count`/`sides`, numeric `bonus`) alongside a well-formed `baseArmorClass` —
  same decode call, same reality, no structural difference between the shown field and the dropped one.
- Test 2 confirms Dryden's real save reproduces the exact golden value
  `dokSavedCharacter.test.ts:116` already asserts (`{ count: 1, bonus: 0, sides: 2 }`), and that
  `dmgText()` (the exact formatter `apps/web/src/ui/referenceDb.ts:76-79` already uses for every
  "Damage" row in the Companion Panel bestiary) renders it as `'1d2'` — proving the fix would use an
  already-shipped formatting convention, not invent a new one.
- Test 3 is a documentation-only assertion (apps/web has no vitest harness of its own — consistent with
  every prior round's same constraint, e.g. `m66-audit.md`'s own Test 3) recording that the
  `toViewDok()`/e2e-seam asymmetry is a static-source-reading fact.

`git status --porcelain` after deleting the scratch file: clean (only this doc is untracked).
Full engine suite: 1344 passed with the 3 scratch tests present (1341 baseline + 3); 1341 again after
deletion — no regression, no source file touched.

## Wiring plan

Small, three-part change: one new optional field on the shared render view-model (mirrors M63's `move`
and M64's `attacks` additions to the exact same interface), one apps/web mapping line, and two unit
tests in the already-existing test file.

**1. `packages/engine/src/render/charSheet.ts`** — add `dmg?: string` to `CharSheetView`
(mirrors `move`/`attacks`, lines 46-62), and draw it as a 6th conditional combat-block row (lines
117-124):

```ts
export interface CharSheetView {
  // ...
  move?: number | string;
  attacks?: string;
  /**
   * M67.S1 — a DoK save's real unarmoured/unarmed baseline damage dice (`DokSavedCharacter.baseDamage`),
   * shown only by the `?chared=dok` read-only save viewer (real gameplay `CharacterSheet`s have no
   * equivalent "base damage" concept — actual weapon damage always comes from equipped gear). Optional
   * so every other caller (the real character sheet, the CoK save editor) simply omits the row.
   */
  dmg?: string;
  // ...
}
```

```ts
const combat: [string, string][] = [
  ['AC', String(s.ac)],
  ['THAC0', String(s.thac0)],
  ['HP', `${s.hp}/${s.maxHp}`],
  ...(s.move !== undefined ? ([['MV', String(s.move)]] as [string, string][]) : []),
  ...(s.attacks !== undefined ? ([['ATK', s.attacks]] as [string, string][]) : []),
  ...(s.dmg !== undefined ? ([['DMG', s.dmg]] as [string, string][]) : []),
];
```

No other caller of `composeCharSheet`/`CharSheetView` sets `dmg` (grepped: `charSheet.ts` (apps/web)
and `charEditor.ts`'s CoK-mode `toView()` both leave it `undefined`), so this is purely additive —
existing screens are pixel-identical to today.

**2. `apps/web/src/ui/charEditor.ts`** — import the already-shipped formatter and set the field in
`toViewDok()` (line 182 area):

```ts
import { dmgText } from './referenceDb.js';
// ...
function toViewDok(c: DokSavedCharacter, slot: number, items: DokJnkItem[], effects: DokEffect[]): CharSheetView {
  const ab = c.abilities;
  return {
    // ...
    ac: `${c.baseArmorClass} (base)`,
    dmg: `${dmgText(c.baseDamage)} (base)`,   // <- new: "1d2 (base)", same "(base)" honesty tag as ac
    thac0: c.thac0,
    // ...
  };
}
```

**3. `packages/engine/test/charSheet.test.ts`** — two new tests immediately beside the existing
MV/ATK row tests (lines 71-96), mirroring their exact style:

```ts
it('draws the DMG row on the right when sheet.dmg is set (no move/attacks set)', () => {
  const fb = composeCharSheet({ font: solidFont(), sheet: { ...SHEET, dmg: '1d2 (base)' } });
  // 'DMG' label at col 20 row 9 → pixel (160, 72) green (no MV/ATK rows precede it here).
  expect(px(fb, 160, 72)).toBe(10);
});
it('omits the DMG row when sheet.dmg is undefined (existing SHEET fixture)', () => {
  const fb = composeCharSheet({ font: solidFont(), sheet: SHEET });
  expect(px(fb, 160, 72)).toBe(0);
});
```

**Optional, small e2e extension** (cheap, not required to ship): add a `dmg` getter to `__chared`
alongside the existing `fields()` getter in `startCharEditor()` (`charEditor.ts`'s seam block, near
line 521), e.g. `dmg: () => (state?.mode === 'dok' && state.dokCur) ? toViewDok(state.dokCur, state.slot, state.dokItems, state.dokEffects).dmg ?? null : null`, then extend `runCharEditorDok()`'s existing
`loadedOk` check with one more clause (e.g. `typeof (await page.evaluate('window.__chared.dmg()')) === 'string'`)
— no new e2e case id, no new overlay-driving code, matching the "extend an existing seam" shape this
loop has preferred since M64/M66.

## Layout / feasibility check

`composeCharSheet`'s combat block currently draws at rows 6 (AC), 7 (THAC0), 8 (HP), optionally 9 (MV),
optionally 10 (ATK) — row 11 is blank, and row 12 starts the "SAVING THROWS" header
(`charSheet.ts:84-89,117-129`). For the `?chared=dok` viewer specifically, `move`/`attacks` are never
set (they're gameplay-only fields `toViewDok()` doesn't compute), so `dmg` lands at row 9 — two clear
rows before the SAVING THROWS header, no overflow risk. Even in the never-occurring case where `move`,
`attacks`, AND `dmg` were all set simultaneously on one view (AC/THAC0/HP/MV/ATK/DMG = 6 rows, 6..11),
the last row (11) still sits one row above the row-12 header — confirmed by direct row arithmetic, no
test needed to prove this beyond the two added above. No row-count/column-width concern applies (unlike
the bestiary/import-table candidates in M59-M65) since this is a single new fixed-position row using the
exact same label/value column convention (`cell(20)`/`cell(30)`) every other combat-block row already
uses.

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| `importParty.ts`'s (CoK, B3) own decoded values (this round's primary suggested method) | Read fresh in full: every derived value (`ac`, `thac0`, `saves`, `hp`, `xp`, `cls`, `level`) already reaches both `addToParty()` and the on-screen summary table (M51/M59/M60 individually closed each gap already). Fully exhausted, no fresh angle. |
| `importDokParty.ts`'s own values, re-checked post-M66 | `mem`/`inv`/`ac`/`thac0` all thread through cleanly today (M58/M59/M61/M66). No further gap. |
| `save/import.ts`'s `transferHillsfarCharacter`/`importCharacter` (Hillsfar branch) | Zero callers anywhere in `apps/web/src` — this project has no Hillsfar save data at all to decode. A "missing mechanic/no game data" rejection (same class as `combatStepper.ts`, M66), not a wiring gap. |
| `loaders/dqkSave.ts`'s `decodeDqkSaveHeader`/`decodeDqkSaveResume` | Real decode, but its only callers are build/patch tooling (`buildDqkDisk.ts` and friends), not `apps/web` — no UI panel exists that could show it even if a gap existed. Out of scope for this loop's "reaches a UI panel" bar, same reasoning as the already-standing `buildDqkGame.ts`/`DqkMergeAudit` rejection. |
| `cokItem.ts`'s CoK→DQK item-port/vocab-recode machinery (`portCokItemToDqk`, `recodeCokNamenum`) | Real, tested, byte-grounded, but consumed only by build/port tooling — zero `apps/web` UI consumer exists to reach. Out of scope for the same "reaches a UI panel" bar. |
| `create.ts`'s `draft.robe` not shown in the live creation-preview panel | Investigated: `s.robe`/`knightOrder` ARE already shown once the character reaches the character sheet (`charSheet.ts`'s M40.S1 footer branch) — this is the create-time PREVIEW panel specifically not echoing it, a much weaker/more cosmetic gap than a fully-unshown fact, and `create.ts`'s own preview omission of `deity` is already a standing, explicitly-flagged "weak/ambiguous" item — this would be the same class of finding, not a new one. |
| `DokJnkItem.item` (`MonsterItem`: `baseTypeId`/`plus`/`value`/`readied`/`affects`) shown only as name+count in `charEditor.ts`'s `buildDokControls()` | This IS the already-blocked item-instance subsystem (`DokItemRecord`/`MonsterItem` fields — blocked 31+ consecutive rounds, M46 itself declined to re-open this exact file for this exact reason). Correctly not re-proposed. |
| `DokEffect.affectData`/`.callAffectTable` (only `type`/`minutes` shown in `charEditor.ts`'s effects list) | Already investigated and rejected M66 under `.EFF` active-effect type codes — the type codes don't match any named affect constant; needs a full COAB `Affects` enum crosswalk, a bigger RE task. `affectData`/`callAffectTable` are siblings of that same still-uncracked field, not a fresh angle. |

## Open questions / unknowns

- Whether the optional e2e seam extension (`dmg` getter on `__chared`) is worth adding alongside the
  fix, or left for a later round — **not decided by this research round** (a lead-session call, per the
  brief's "wiring plan should be small" bar; the engine-level scratch test and the already-existing
  `f0.baseDamage` e2e assertion already ground the real-bytes half of the claim without it).
- Whether the label should read "DMG" (matching the existing 3-letter AC/MV/ATK convention) or a
  longer "DAMAGE" — **UNKNOWN/style call**, left to the lead session; "DMG" was chosen in this plan
  purely to match the existing 2-3 letter combat-block label convention (`AC`, `MV`, `ATK`).
  `referenceDb.ts`'s own bestiary panel uses the full word "Damage" in a different (freeform HTML row)
  layout, so there is a real precedent either way — not a strong signal, a genuine judgement call.
  Note: `s.ac`/`s.dmg` would both carry the SAME "(base)" honesty suffix, consistent with the file's own
  stated design intent (see the finding above).
- Whether `baseDamage`/`baseArmorClass` would ever plausibly vary for a hypothetical *modified* DoK
  save (rather than the 6 shipped pregens, which are all identical unarmoured-baseline records) —
  **UNKNOWN**, not investigated; the loader decodes real bytes either way (not a hardcoded constant),
  so the display would be correct for any future save that differs, even though none currently does.

## Implications for our engine

- This is the first headline pick in several rounds (M63-M66 were all `importDokParty.ts`/monster-
  bestiary picks) drawn from the **Character/Save editor** (`charEditor.ts`), a file previously only
  skimmed (M46) and declined on the grounds of an unrelated, already-blocked subsystem living in the
  same file. This reinforces a refinement to the "grep every prior audit doc" discipline: a file being
  *mentioned* in a prior round's rejection doesn't mean *every* field in that file was actually
  examined — M46's rejection was specific to `DokJnkItem`/`MonsterItem` (a real, correctly-still-blocked
  object), not to `DokSavedCharacter`'s own separate fields living in the same file. Worth checking,
  when a file shows up in a prior "not re-investigated" note, exactly *which object/field* that note was
  about before assuming the whole file is exhausted.
- Reinforces the now-familiar "one sibling field reaches the screen, the other doesn't" shape (M63's
  `move` beside `ac`, M64's `attacks` beside `move`, and now `baseDamage` beside `baseArmorClass`) as a
  generically productive place to look: whenever a loader decodes a STRUCT with several fields
  together, and the UI mapping function that flattens it into a view model reads some but not all of
  those fields, the unread ones are worth checking individually, even after a file has previously been
  "swept."
- Confirms (again) that "value degeneracy" (M40's rejection reason for `PartyMemberStatus.age`) is not
  an automatic disqualifier — this project has an established, working precedent (CoK's own flat AC 10
  column, M59; the MV row's flat "unencumbered" result, M63; and now `baseArmorClass`'s own flat "AC 10"
  already shown on this exact screen) for displaying a currently-non-varying-but-genuinely-decoded fact,
  as long as the underlying decode is real (reads actual bytes) rather than structurally hardcoded to
  never vary (the actual M40 objection, which does not apply here).
