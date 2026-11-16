# M93 audit — DQK's own Training Hall silently drops DQK's own real, finite race/class level caps

> Audit method: read `docs/engine/research/m92-audit.md` in full first (mandatory first step), then
> grepped every prior `docs/engine/research/m*-audit.md` (m1-m92) for this round's eventual candidate
> strings (`DexterityMods.reaction`, `buyPriceFromValue`, `MON{n}WIZ`, `npcClass`/`npcLevel`,
> `awardPartyXp`, `DQK_MAX_LEVEL`, `dqkMaxLevel`, `TANIS`) per discipline #1 before finalizing. Swept
> fresh areas per the brief's suggestions (multiclass XP split — found fully wired, see "Rejected
> alternatives"; shop buy-side pricing — re-confirmed a 7-round-old, still-unresolved dead end per
> M24/M30/M31, not reopened; aging — confirmed faithful-to-original no-op, not a gap; Dexterity
> `.reaction` — re-confirmed a permanently rejected non-gap since M25; DQK monster/NPC record fields —
> all consumed since M31/M37) and settled on the item the M92 brief itself named as the legitimate
> fallback candidate: **transcribing DQK's own "Maximum Level Limits by Race and Class" table properly**
> (M92's own "Open questions": *"some Silvanesti Elf Cleric / Mountain Dwarf Ranger cells were unclear
> ... re-extract with pdftoppm/image OCR or manually read the PDF page image directly before
> transcribing DQK's table into code"*). `pdftoppm`/`tesseract` are not installed in this environment,
> but `pypdfium2` (already present in the Python environment) renders the PDF page directly to a PNG,
> which was read visually (this agent is multimodal) — a strictly stronger method than pdftotext OCR,
> and one that turned up a **new, load-bearing correction to M92's own transcription**, not just filled
> in blanks.

## Headline finding

**M92's own transcription of DQK's "Maximum Level Limits by Race and Class" table (Journal.pdf p.49)
was row-shifted and wrong in the details** (verified this round by rendering the actual page image,
not re-running pdftotext) — but its qualitative conclusion ("mostly Max/uncapped for humans and elves")
happened to survive anyway, so its fix — disabling the shared Training Hall's level-cap check
**entirely** for a DQK session (`enforceLevelCap = false`, unconditionally, for every DQK party member,
every race, every class) — **over-corrects**: DQK's manual does print several **real, finite** per-
race/class ceilings (e.g. **Half-Elf Fighter = 9**, Silvanesti Elf Fighter = 10, Kender Fighter = 5,
Hill/Mountain Dwarf Cleric = 10, Half-Elf Ranger = 11, Half-Elf Knight = 10, Half-Elf Magic-User = 10,
Hill Dwarf Thief = 10, Mountain Dwarf Thief = 8), and today **none of them are enforced for anyone in a
DQK session** — the fix that correctly stopped CoK's cap from wrongly blocking a DQK human/elf instead
silently drops DQK's *own* real ceilings too, for the non-human races where they genuinely apply.

**Concretely reachable today**: `apps/web/src/ui/dqkParty.ts`'s real, shipped `DQK_HEROES` roster
includes **TANIS, a Half-Elf Fighter, currently level 6** (`dqkParty.ts:26`). DQK's own manual caps a
Half-Elf Fighter at level **9**. Today, the DQK Training Hall (reachable via the in-game "(T)own"
command) will train Tanis 6→7→8→9→10→11→12→… with **zero refusal at any step**, because the DQK call
site passes `enforceLevelCap = false` unconditionally — not "false past level 9," but false, full stop.

## Existing sibling/precedent and the self-flagging evidence

This is a direct continuation of M92, which explicitly named this exact follow-up as an open question
it did not resolve: *"DQK's own MAX_LEVEL-equivalent table is only partially legible from this round's
pdftotext extraction ... a future round should re-extract with pdftoppm/image OCR or manually read the
PDF page image directly before transcribing DQK's table into code, the same rigor
`cok-dragonlance-rules.md` §7 already applied to CoK's table"* (`m92-audit.md`, "Open questions /
unknowns"). The brief for this round explicitly re-confirmed this is a legitimate, sanctioned candidate
"if nothing better turns up" — and, after a fresh sweep of ~10 other areas (multiclass XP, shop pricing,
aging, Dexterity reaction, DQK monster/NPC fields, `save/`-import field-map, item weight display — see
"Rejected alternatives"), nothing else cleared this loop's high-confidence/low-risk bar as cleanly.

**What's new this round, not just "finishing" M92's deferred item:** re-rendering the actual PDF page
(via `pypdfium2`, since `pdftoppm`/`tesseract` are not installed in this environment — see "Tooling
note" below) revealed that **M92's own printed table was not merely incomplete, it was ROW-SHIFTED and
wrong**, not just "some cells illegible." Side-by-side (both tables cite the *same* page, "Journal.pdf
p.49"):

| Class | M92's transcription (pdftotext, uncorrected) | This round's transcription (page-image, ground truth) |
|---|---|---|
| Cleric | Max / *(illegible)* / — / — / — / — / 12 | Max / Max / Max / Max / 10 / 10 / 12 |
| Fighter | Max / Max / Max / Max / 10 / 10 / 5 | Max / **10** / **14** / **9** / Max / Max / 5 |
| Paladin | Max / 10 / 14 / 9 / Max / Max / No | *(not in engine's class model — see "Open questions")* |
| Ranger | Max / 12 / No / No / No / — / 5 | Max / Max / Max / **11** / **8** / No / 5 |
| Knight | Max / Max / Max / 11 / — / 8 / No | Max / No / No / **10** / No / No / No |
| Magic-User | Max / No / No / 10 / 8 / No / No | Max / Max / Max / **10** / No / No / No |
| Thief | Max / Max / Max / 10 / No / No / Max | Max / No / Max / Max / **10** / **8** / Max |

(columns: Humans / Silv. Elves / Qual. Elves / Half-Elves / Hill Dwarves / Mtn. Dwarves / Kender)

M92's Fighter row is actually close to *my* Cleric row's data; M92's Paladin row is close to *my*
Fighter row shifted down one label — classic symptom of `pdftotext -layout`'s column-bleed on a page
that has a **second, unrelated table** ("Ability Score Modifiers by Race") sharing the same vertical
band in the right two-thirds of the page. Confirmed the game-image is unambiguous (see the two crops
below) and is the correct ground truth. **This means: had a future round wired M92's own transcribed
numbers directly, it would have shipped actively wrong caps** (e.g. capping a Human Fighter's *sibling*
row at the wrong values, or believing Knight's Silvanesti/Qualinesti cells were "Max" when they are
actually "No" — DQK does not allow a Silvanesti or Qualinesti Elf to be a Knight of Solamnia at all).
This round's contribution is therefore not just "filling in blanks" but **correcting a latent data-entry
risk M92 itself flagged as unverified**.

### Tooling note (environment-specific, for future rounds)

`pdftoppm`/`tesseract` are **not installed** in this shell (`which pdftoppm tesseract` → not found;
confirmed at the top of this round). The `Read` tool's built-in PDF-page-image support also depends on
`pdftoppm` and fails the same way. However, the Python environment already has `pypdfium2` (`pip list`
confirms `pypdfium2 5.9.0`, `pdfplumber 0.11.9`), which renders a PDF page to a `PIL.Image` directly, no
external binary needed:

```python
import pypdfium2 as pdfium
pdf = pdfium.PdfDocument("The Dark Queen of Krynn/Journal.pdf")
page = pdf[26]  # 0-indexed -> page 27 (the PDF's own page 27 renders "Journal.pdf p.49" per its
                 # printed page-number banner — the PDF's internal page count and the book's own
                 # printed folio numbering differ by ~22 due to front matter)
page.render(scale=4.0).to_pil().save("out.png")
```

then crop/zoom with `PIL` and view with the `Read` tool (multimodal). This is the correct fallback for
any future round that needs to read a table this project's own OCR pipeline (`pdftotext -layout`)
garbles due to column-bleed from an adjacent table or the PDF's custom font encoding (this specific
font drops `K`/`Q`/`X` glyphs entirely on straight `pdftotext` extraction — e.g. "MAXIMUM" → "MA IMUM",
"KENDER" → " ENDER", "QUALINESTI" → " UALINESTI" — a second, independent reason not to trust the raw
text extraction for this document without a visual cross-check).

## Where the severance happens — exact locations, current source

**`apps/web/src/ui/dqkExplore.ts:622-628`** (`openDqkTown`, current source, full):

```ts
/** Enter the shared town/services screen with the DQK party loaded. M92.S1 — DQK's own manual prints
 * a materially more permissive level-cap table than CoK/DoK's, so the Training Hall's CoK/DoK level
 * ceiling is not enforced here. */
async function openDqkTown(): Promise<number> {
  if (isCombatOpen() || isSheetOpen() || isMagicOpen() || isInventoryOpen()) return 0;
  installDqkParty();
  return startTown(false);          // <-- unconditionally disables ALL level-cap enforcement for DQK
}
```

**`apps/web/src/ui/town.ts:359`** (`startTown`, signature) takes a single `enforceLevelCap = true`
boolean, stored verbatim on `TownState` (`town.ts:82-83`: *"M92.S1 — false for a DQK session (its own
manual prints a more permissive level table)"*) and threaded into every `trainMember`/`trainingStatus`
call (`town.ts:149,285,409`).

**`apps/web/src/ui/party.ts:1007-1018`** (`trainMember`, current source, the exact line that goes
straight to `null` for any DQK session, full):

```ts
export function trainMember(name: string, enforceLevelCap = true): TrainResult {
  const s = roster.find((m) => m.name === name);
  if (!s) return { ok: false, name, reason: 'no such character' };
  const cls = primaryClass(s.classes);
  const core = coreClass(cls);
  const level = s.classes[cls] ?? 1;
  // M92.S1 — the same race/class level ceiling createCharacter() already enforces at creation
  // (Journal p. 56); `enforceLevelCap` defaults on for CoK/DoK (the printed table's own game) and is
  // passed false for a DQK session, whose own manual prints a materially more permissive table.
  const cap = enforceLevelCap ? maxLevel(s.race, cls, s.abilities.str) : null;   // <-- null, always, for DQK
  const chk = checkTraining(core, level, getXp(name), getGold(), cap);
  ...
```

`trainingStatus()` (`party.ts:1037-1044`, the function driving the hall's *displayed* stock list) has
the byte-identical gap one line later — both would need the same fix, exactly the "half-fixed sibling"
shape this loop has flagged before (M90/M92's own "Secondary observations" already noted this pairing
for the CoK/DoK fix; the same pairing recurs for a DQK-specific fix).

`grep -n "DQK_MAX_LEVEL\|dqkMaxLevel" packages/engine/src apps/web/src` → **zero hits** — no DQK-specific
table exists anywhere in the codebase today; `packages/engine/src/ruleset/addnd1e-dragonlance/classes.ts`'s
`MAX_LEVEL` (lines 33-41) is explicitly, only CoK's table (its own doc comment cites "Journal printed
p. 56" — the *Champions of Krynn* Journal, a different, separate PDF from `The Dark Queen of Krynn/Journal.pdf`
this round transcribes from).

## Reachable in real, ordinary, shipped play — static + dynamic proof

**Static reachability, the full real chain:**
`apps/web/src/ui/dqkExplore.ts:412,1183,1403` (the `t` keybind, the `(T)own` command-bar entry, and the
`window.__dqk.openTown()` e2e seam — all three call the same `openDqkTown()`) → `installDqkParty()`
(`dqkParty.ts:52-63`) installs the real, shipped `DQK_HEROES` roster, which includes **TANIS**
(`dqkParty.ts:26`: `race: 'halfElf', classes: { fighter: 6 }`) → `startTown(false)` → `town.ts`'s hub menu
puts `'Train'` on screen (`town.ts:153`) → `activate()` (`town.ts:280-285`) calls
`trainMember(name, state.enforceLevelCap)` on selection, with `state.enforceLevelCap === false` for this
session → `cap = null` unconditionally → `checkTraining` never sees a ceiling. Reaching level 9→10 for
Tanis requires only ordinary, extended play (fighting DQK's own encounters for XP, exactly the same
"ordinary, extended play" bar M92's own CoK proof used) — no save-editing, no dev console, no illegal
state.

**Dynamic re-derivation this round** (scratch vitest file, created, run — **3/3 passing** — then
deleted; `git status --porcelain` confirmed clean before and after, this doc the only new file), against
the real, current, unmodified `checkTraining`/`xpForLevel`/`maxLevel` production functions imported
directly from `packages/engine/src/index.ts`, using the real `DQK_HEROES` Tanis data
(`race: 'halfElf', classes: { fighter: 6 }`, `dqkParty.ts:26`):

```
// (1) CoK/DoK path, M92-fixed, re-confirmed unchanged:
maxLevel('human', 'fighter', 18) === 8
checkTraining('fighter', 8, xpForLevel('fighter', 9), 999999, 8).eligible === false   -- correctly refused

// (2) DQK path AS WIRED TODAY (cap = null, unconditionally, for every DQK session):
for (let lvl = 6; lvl <= 12; lvl++) {
  checkTraining('fighter', lvl, xpForLevel('fighter', lvl + 1), 999999, null).eligible === true
}
// -> EVERY step 6->7, 7->8, 8->9, 9->10, 10->11, 11->12 is happily eligible. No wall at 9->10,
//    where DQK's OWN manual (Journal.pdf p.49) says a Half-Elf Fighter should be capped.

// (3) What DQK's OWN real cap (Journal.pdf p.49, "Half Elves" x "Fighter" = 9) would produce if wired:
checkTraining('fighter', 9, xpForLevel('fighter', 10), 999999, 9).eligible === false
// reason: "at the level cap (9)"
```

All three assertions run against the real `checkTraining`/`xpForLevel`/`maxLevel` exports, no fixtures or
mocks — (1) proves M92's fix is intact and unregressed by this round; (2) proves the DQK gap exactly as
it exists in production today; (3) proves DQK's own printed number, once threaded through the *same*,
already-existing, ruleset-agnostic `checkTraining(..., levelCap)` parameter M92 built, produces the
correct refusal with no new mechanism needed — the fix is purely "compute a different, DQK-sourced
number instead of `null`," not new machinery.

## Proposed minimal wiring plan (not applied this round — audit scope is research only)

**Step 1 — new DQK-specific cap table**, sibling to the existing `MAX_LEVEL`/`maxLevel` in
`packages/engine/src/ruleset/addnd1e-dragonlance/classes.ts` (same file, same `Cap` pattern, `null` here
overloads "uncapped" *and* "race/class combo not modelled" — see caveat below):

```ts
// sketch, not applied this round -- packages/engine/src/ruleset/addnd1e-dragonlance/classes.ts

/**
 * DQK's OWN "Maximum Level Limits by Race and Class" (`The Dark Queen of Krynn/Journal.pdf` p.49,
 * ground-truth page-image transcription, M93 — corrects an earlier, row-shifted pdftotext read from
 * M92). Materially more permissive than CoK's `MAX_LEVEL` for humans/elves (mostly uncapped, `null`
 * here = "Max" in the manual's own text: "Highest Level Available in The Dark Queen of Krynn"), but
 * NOT uniformly uncapped — several race/class cells carry a real, finite ceiling (Half-Elf Fighter 9,
 * Silvanesti Elf Fighter 10, Kender Fighter 5, etc.). DQK's manual also prints a separate "Paladin"
 * row this engine's `DragonlanceClassId` does not model (Solamnic "Knight" is the only Dragonlance
 * paladin-analogue here) — omitted; see this round's "Open questions."
 */
const DQK_MAX_LEVEL: Record<DragonlanceRaceId, Record<DragonlanceClassId, number | null>> = {
  human:         { cleric: null, fighter: null, ranger: null, knight: null,      magicUser: null, thief: null },
  silvanestiElf: { cleric: null, fighter: 10,   ranger: null, knight: null,      magicUser: null, thief: null },
  qualinestiElf: { cleric: null, fighter: 14,   ranger: null, knight: null,      magicUser: null, thief: null },
  halfElf:       { cleric: null, fighter: 9,    ranger: 11,   knight: 10,        magicUser: 10,   thief: null },
  hillDwarf:     { cleric: 10,   fighter: null, ranger: 8,    knight: null,      magicUser: null, thief: 10   },
  mountainDwarf: { cleric: 10,   fighter: null, ranger: null, knight: null,      magicUser: null, thief: 8    },
  kender:        { cleric: 12,   fighter: 5,    ranger: 5,    knight: null,      magicUser: null, thief: null },
};

/** DQK's own max attainable level for `race` in `classId` (`null` = uncapped in DQK, or the race/class
 * combo is disallowed at creation and so never reaches training). See {@link DQK_MAX_LEVEL}. */
export function dqkMaxLevel(race: DragonlanceRaceId, classId: DragonlanceClassId): number | null {
  return DQK_MAX_LEVEL[race][classId];
}
```

**Step 2 — thread it as a third mode, not just a boolean**, `apps/web/src/ui/party.ts`:

```ts
// sketch, not applied this round
export function trainMember(name: string, levelCapMode: 'cok' | 'dqk' | 'off' = 'cok'): TrainResult {
  ...
  const cap =
    levelCapMode === 'cok' ? maxLevel(s.race, cls, s.abilities.str) :
    levelCapMode === 'dqk' ? dqkMaxLevel(s.race, cls) :
    null;
  ...
}
// trainingStatus() gets the identical third parameter/branch (the M90/M92-established paired-sibling
// discipline: the hall's displayed stock list and its real mutation must move together).
```

**Step 3 — thread the mode through `town.ts`/`dqkExplore.ts`**: `TownState.enforceLevelCap: boolean`
becomes `TownState.levelCapMode: 'cok' | 'dqk' | 'off'`; `startTown(enforceLevelCap = true)` becomes
`startTown(levelCapMode: 'cok' | 'dqk' | 'off' = 'cok')`. Of the 4 real call sites: `main.ts:463,945`,
`mainMenu.ts:139`, `play.ts:48` (CoK/DoK) keep the default (`'cok'`, unchanged behavior, no call-site
edit needed at 3 of the 4 sites); `dqkExplore.ts:628`'s `startTown(false)` becomes `startTown('dqk')`
(one call-site edit, the only behavior change).

Notes on the sketch:
- This is a strict refinement, not a reversal, of M92 — CoK/DoK behavior is byte-for-byte unchanged
  (same table, same function, same default), and DQK gains its OWN real enforcement instead of none.
- `checkTraining()`'s signature (`packages/engine/src/town/services.ts:71-77`) needs **no change at
  all** — `levelCap?: number | null` is already ruleset-agnostic exactly so a caller can pass any
  race/class-derived number; this fix supplies a *different* number, not a new parameter.
- The e2e regression this round's fix should add/extend (mirrors M92's own `train-cap` case,
  `e2e.mjs:3930-3979`): a **new**, isolated case training the real `TANIS` (Half-Elf Fighter) from
  level 9 to 10 inside a DQK session, asserting `eligible === false` and `reason === 'at the level cap
  (9)'`; **and** widen the existing `dqkTrainCapOk` assertion (`e2e.mjs:2240`, currently just
  `window.__town.enforceLevelCap() === false`) since after this fix that getter's very shape changes
  (boolean → mode string) — this existing assertion would need updating in the same change, not left
  silently broken (the same "the fix and its test travel together" discipline M89/M90/M92 all followed).

## Secondary observations not part of this round's fix

- **`createCharacter()` (`character.ts:125-128`) also only ever consults CoK's `maxLevel`, never a DQK
  variant, at *character-creation* time** — a related, but currently NOT reachable, risk: every one of
  `dqkParty.ts`'s 6 hand-authored `DQK_HEROES` (levels 6-7) and every DoK-import-derived DQK character
  (`importDokParty.ts`, which additionally hardcodes `race: 'human'` for every import regardless of the
  source save's true race — a separate, already-known, already-documented limitation, not new this
  round) happen to sit under **both** CoK's and DQK's caps today, so this specific risk has not yet
  produced a wrong rejection in practice. It would if a future round ever authors a higher-level DQK
  hero or race-corrects the DoK import (e.g. a Silvanesti Elf Fighter above CoK's flat cap of 8 but
  under DQK's own 10) — flagged for whoever picks that up, not bundled into this round's Training-Hall-
  scoped fix.
- **DQK's manual prints a `Paladin` row genuinely distinct from `Knight`** (Paladin: Max/12/No/No/No/8/
  No vs. Knight: Max/No/No/10/No/No/No — different data, not a synonym), but this engine's
  `DragonlanceClassId` has no `'paladin'` member at all (Dragonlance's Solamnic "Knight" is modelled as
  the sole paladin-analogue, per `classes.ts`'s own doc comment, correct for CoK/DoK). Whether DQK
  actually offers a separate playable Paladin class (as opposed to reusing "Knight" under a different
  in-fiction label) is **UNKNOWN** from this round's research alone and out of scope to resolve here —
  no current code path ever constructs a `'paladin'` classId, so this is a modelling gap with no
  currently-reachable consequence, not a second wiring bug.
- **The `No` cells in `DQK_MAX_LEVEL`** (e.g. Silvanesti/Qualinesti Elf may not be a Knight; Mountain
  Dwarf may not be a Magic-User) are folded into `null` in the sketch above (same sentinel as "Max"/
  uncapped) because a character already holding an illegal class for their race could only arise via a
  bug elsewhere (class identity never changes post-creation in this engine, M92's own finding) and
  every current DQK character source (the hand-authored roster, or the human-only DoK import) already
  avoids these combinations. Flagged so whoever implements this doesn't accidentally read `null` as "no
  cap" for a combination that should really be "impossible" — the distinction is moot only because nothing
  reachable today produces it.

## Rejected alternatives considered this round

| Candidate | Why rejected |
|---|---|
| Multiclass XP-split / prime-requisite bonus (`experience.ts`'s `characterXpShare`/`hasPrimeRequisiteBonus`) | Checked in depth: fully wired via `apps/web/src/ui/party.ts`'s `awardPartyXp()` (`party.ts:962-976`), which builds real `XpRecipient`s from the live roster (`classes`, `abilities`, `inCombat: s.hp > 0`) and calls the engine's `awardCombatExperience` — no gap found. |
| Shop buy-side pricing (`buyPriceFromValue`, `town/pricing.ts`) | Re-confirmed the same 7-round-old (M19/M24/M26/M27/M29/M30/M31) dead end: the one candidate real per-item `.value` byte (DoK `ITEM0.DAX`) fails a real-bytes sanity probe (M31's own finding: every value is a multiple of 256). Not reopened; no new data source found this round. |
| Party aging (`applyAging`, `gameClock.ts`/`party.ts`) | Checked whether aging should apply AD&D ability-score penalties/bonuses at age-category thresholds: confirmed via `decompile-ovr021-time-learning.md` that the ORIGINAL engine's own aging is `age += 1` on year roll-over with **no** stat-effect mechanic at all — this codebase's `applyAging` (age-only, no stat consequence) is faithful to the original, not a gap. |
| `DexterityMods.reaction` (initiative/surprise modifier) | Re-confirmed a permanently rejected non-gap, established by M25 and re-cited by 12+ subsequent rounds: Gold Box initiative is a STORED per-combatant byte (`charStruct.initiative`, byte-verified via `disasm-combat-{cok,dok}.md`), not a Dex-derived roll — wiring `.reaction` into initiative would contradict this project's own verified combat model. Not revisited. |
| DQK monster/NPC record fields (`moncha.ts`, `MonsterRecord`) | Fully re-swept against `referenceDb.ts`'s `monsterCategory()`: every decoded field (AC/HD/THAC0/HP/Damage/XP/Morale/Size/Class/Int/Level/Save/Save Roll/Regen/Half Dmg/Spells/Bonus XP) already has a row, confirmed by re-reading the current, fully-annotated source (M37/M38/M43/M55/M56/M65/M68/M83 already closed this file's gaps one by one). No remaining unconsumed field found. |
| `save/character.ts`/`import.ts`/`roster.ts` full field-by-field re-audit (flagged as a standing candidate by M85) | Spot-checked `PlayerCharacter`'s full field list against `importParty.ts`'s actual consumption: every field either flows into `sheetFromSaved`/`playerCharacterFromSaved` or is a documented, explicit gap already named in the same function's own doc comment (race/sex/alignment/paladinLevel — all CoK-save gaps, already labelled). No fresh, unflagged drop found this round; a truly exhaustive pass (M85's own scope) would be its own dedicated round. |
| `BaseItem.weightTenths` missing from the Reference-DB Items tab | Real consumer exists (`inventory.ts`/`charSheet.ts`/`party.ts`'s encumbrance chain), but the value itself is explicitly CANDIDATE (not byte-decoded — `baseItems.ts`'s own doc comment: "CANDIDATE pending a per-record weight field"), a weaker fit than a decoded/derived fact per this loop's stated preference; also a cosmetic display-only gap on a browse-only screen, lower priority than a mechanical gate. Not selected. |

## Open questions / unknowns

- **Should `DQK_MAX_LEVEL`'s `null` cells be split into a genuine third state** (uncapped vs.
  race/class-disallowed) now that a real table exists, rather than reusing one sentinel for both, the
  way `MAX_LEVEL`/`maxLevel` already does correctly for CoK? Not resolved this round; flagged in
  "Secondary observations" as currently moot (no reachable path produces the ambiguous case) but worth
  tightening if `createCharacter()` is ever extended to validate against DQK's table too.
- **Does DQK actually offer a distinct, playable "Paladin" class** (as its manual's table implies), or
  is "Paladin" the manual's own generic-AD&D-1e label for what this game still calls "Knight" in its UI
  strings? **UNKNOWN** — not resolved by this round's research (would need either DQK's own character-
  creation screen text or an ECL/overlay disassembly pass, neither attempted here).
- **`createCharacter()`'s CoK-only cap check applying to hypothetical future higher-level DQK
  characters** (see "Secondary observations") — a latent, not-yet-reachable risk; worth a dedicated
  look if `dqkParty.ts`'s roster is ever extended or `importDokParty.ts`'s human-only race simplification
  is ever lifted.
- **Should the existing `train-cap` e2e case's `window.__town.enforceLevelCap()` getter be renamed/
  retyped as part of this fix**, or kept as a boolean convenience (`levelCapMode !== 'off'`) alongside a
  new getter exposing the mode string? Not decided; either is a small, mechanical follow-up once the fix
  itself is implemented.

## Implications for our engine / for the taxonomy

- **A confirmed new taxonomy sub-case, distinct from all of M89-M92's shapes**: *"a fix that correctly
  avoids regressing game B by disabling an entire validation gate for game B, when game B's own real
  rules are not 'no gate,' but 'a different, still-partially-finite gate' — the safe-looking 'just turn
  it off for the other game' resolution is itself a second-order drop of game B's own real data."* This
  is the direct, sharper continuation of M92's own closing lesson ("verify the check's source data
  applies uniformly across every game that shares the call site before proposing a blind wire-in") — but
  goes one step further: even the *correct, cautious, deliberately-scoped* fallback (disable entirely
  rather than risk a wrong number) can itself under-serve the third game once that game's *own* real
  table is actually available, if nobody circles back to replace "disabled" with "correctly re-enabled
  with the right data."
- **A concrete illustration of why "verify a prior round's own transcription with a stronger method
  before trusting it" belongs in this loop's standing discipline**, not just "verify the code": M92's
  table was self-flagged as partially illegible, but this round found it was actually **wrong**, not
  just incomplete, once checked against a rendered page image rather than re-running the same OCR
  method. A future round inheriting an "illegible in places" citation should render-and-view the source
  page directly (via `pypdfium2` or equivalent, this round's documented fallback) rather than trusting a
  second pdftotext pass to do better than the first.
- **Reinforces that `docs/engine/research/decompile-worklist.md`-style honesty about primary-source
  transcription confidence pays off two rounds later**: M92's explicit "not verified this round" flag on
  its own DQK table is exactly what made this round's candidate easy to find and prioritize correctly,
  per this loop's own stated preference for "a prior round's own explicit, well-specified deferral" as a
  higher-value candidate than a fresh, speculative sweep.
