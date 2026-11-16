# M38 audit — the next "computed but unwired" candidate

> Audit method: read `docs/engine/BUILD-QUEUE.md`'s Done section (M27–M37 in full) and the matching
> `docs/engine/ROADMAP.md` entries, plus `docs/engine/research/m33-audit.md` through `m37-audit.md`'s
> Rejected-alternatives / Open-questions sections, to build the current standing-candidate list. Applied
> lens (a) (grep every `MonsterRecord`/`DokItemRecord`/`MonsterItem` field for `apps/web/src` consumers),
> lens (b) (re-open the item-instance subsystem, blocked 9 rounds running), and lens (c) (re-check whether
> a "no display surface" premise is stale, per M37's own finding). Every real-bytes claim below was
> independently re-derived **this round** via the project's own decoder/UI functions run against the real
> game files (throwaway `vitest` scripts against `packages/engine/src/index.ts`'s public API and the real
> `Champions of Krynn/`, `Death Knights of Krynn/`, `The Dark Queen of Krynn/` folders — not trusted from
> any prior audit doc's tables). All throwaway scratch files were deleted after use (see "Scratch files
> used this round" at the end). This is read-only research; nothing in this document has been implemented.
>
> **Headline pick: `MonsterRecord.savingThrows` — decoded, golden-tested, and (for its `.spell` column)
> already wired into REAL combat since M27 — is still completely absent from `referenceDb.ts`'s
> `monsterCategory()`, the exact function M37 just extended for `npcClass`/`npcLevel` in the same
> already-shipped, already-reachable Companion Panel "Databases" tab.** This is the same shape of gap
> M37 found (a decoded, already-consumed-elsewhere field missing from its own nearest UI projection
> function) one field over, in the same file, confirming M37's own "Implications" recommendation to
> re-check this exact chokepoint in future rounds.
>
> ---
>
> **CORRECTION - 2026-08-20 (fidelity-plan section 29, commit `df69707`).** This memo's **DQK**
> probes (2, 3 and the DQK half of 5) were run against a decode that started each `MONCHA.GLB`
> member's RLE stream at byte 0, consuming the member's own 2-byte **big-endian
> uncompressed-length word** as two RLE control bytes. Every DQK record was therefore out of phase.
> **M38's mechanism and its CoK/DoK evidence are unaffected** - `savingThrows.spell` really was
> absent from `monsterCategory()`, the `Save` row really does ship, and Probes 0/1/4/A touch no DQK
> bytes. What moves is the DQK side: the NPC set, the record names, the archive counts, and the
> example record the e2e assertion keys on. Inline corrections are tagged **[§29 2026-08-20]**;
> withdrawn tables stay visible per this project's retraction convention. Headline deltas:
>
> - `MONCHA.GLB` decodes **86 of 98** members with full validated stats, not 46 - **76**
>   monster-framed plus **10** carrying `category: 'npc'` (out of **11** members with is-monster
>   flag `0` at offset `0x66`; the eleventh, member 80, validates monster-framed first).
> - **`BAKAI SHAMAN` is not an NPC and never was.** The record is **`BAKALI SHAMAN`**, is-monster
>   flag `1`, a 9-hit-dice bestiary monster. `SHARMAN` is **`SHARKMAN`** (also flag 1). Both drop
>   out of Probe 2's NPC table entirely.
> - Probe 3's four monster-framed records keep every save value but not their spellings:
>   `IRON OLEM` is **`IRON GOLEM`** and `UMBERHULK` is **`UMBER HULK`**. The "*(sic - real in-game
>   spelling)*" annotation was wrong; those were decoder artefacts, not SSI abbreviations.
> - Separately, and for a different reason: **Probe 4's negative control has expired.** Commit
>   `fa07892` (2026-08-11) byte-located DoK's saving throws at `MON1CHA` record offsets 42..46, so
>   DoK records now decode `savingThrows` too. See the note at Probe 4.

## Headline finding

`MonsterRecord.savingThrows` (`packages/engine/src/loaders/monster.ts:196`) holds the five 1e
saving-throw target numbers (`paralyzePoisonDeath`/`petrifyPolymorph`/`rodStaffWand`/`breath`/`spell`).
It is decoded for:
- every CoK 409-byte monster record (offset 208-212), golden-tested (`monster.test.ts:84-89,171-176`
  — real GOBLIN `spell:19`, real RED DRAGON `spell:10`);
- every DQK "hasStats" `MONCHA.GLB` record — **both** monster-framed (`decodeDqkMonsterRecord`,
  `moncha.ts:496`, unconditional) and character/NPC-framed (`decodeNpcRecord`, `moncha.ts:616`, same
  `readSaves` helper) — golden-tested at `moncha.test.ts` for other fields, and independently
  re-derived against the real file this round (Probe 2/3 below);
- and is `undefined` for DoK's 216-byte compact record (a genuine, honestly-modelled decode gap, not a
  display bug — B5, re-confirmed this round, Probe 4).

`Combatant.monsterSpellSave` (`combat/combat.ts:122,341`, `mon.savingThrows?.spell`) already feeds this
value into **real tactical combat** since **M27.S1** (`combat.ts`'s `makeTC()`: `save: … : c.monsterSpellSave`)
— a live, already-shipped mechanic, not a hypothetical one.

Despite this, **`referenceDb.ts`'s `monsterCategory()` — the single function that builds the Companion
Panel Databases tab's Monsters category, for all three games — never reads `m.savingThrows` at all**
(fresh read of the full function this round, `apps/web/src/ui/referenceDb.ts:89-109`; confirmed by
grep, Probe 0). A player browsing the in-play cyclopedia (or the standalone `?refdb=1` page) sees
AC/HD/THAC0/HP/Damage/XP/Morale/Size/Class(/Level) for every monster, but never its saving throw — even
though that exact number is already deciding real combat outcomes for the same monster in the same
session.

### Why this wasn't caught by M27-M37

M27's own doc comment (`monster.ts:190-194`, `combat.ts:118-121`) already flags that **4 of the 5**
`SavingThrows` columns are "decoded but have no consuming mechanic yet" — correctly rejected as a wiring
target by M27-M30 (needs a poison/petrify/rod-staff-wand/breath-weapon *mechanic*, not a join). But the
5th column, `.spell`, **does** have a live mechanic (M27 wired it) — and nobody re-checked whether the
*display* layer had caught up to that one already-wired column specifically. M37's own headline pick
was the sibling case one field over (`npcClass`/`npcLevel`); its "Implications" section explicitly
recommended checking `referenceDb.ts`'s row builders again in future rounds — this round did, and found
this.

## Real-bytes verification

### Probe 0 — confirm zero UI consumers of `savingThrows` outside the character-sheet/party path

```
$ grep -rn "savingThrows" apps/web/src
```
Every hit is either the **player-character** `CharacterSheet.savingThrows` (`charSheet.ts`,
`charEditor.ts`, `party.ts:689`, `create.ts:311`, `importParty.ts:127` — a different type, PC-only) or
`combat.ts:315`'s own doc comment describing the M27 wiring. **Zero hits** reference
`MonsterRecord.savingThrows` inside `referenceDb.ts`, `companionPanel.ts`, or any other bestiary/monster
display surface.

### Probe 1 — CoK real monster saves (`Champions of Krynn/MON1CHA.DAX`, `decodeMonsterArchive`)

| Name | paralyzePoisonDeath | petrifyPolymorph | rodStaffWand | breath | **spell** |
|---|---|---|---|---|---|
| GOBLIN | 16 | 17 | 18 | 20 | **19** |
| RED DRAGON | 7 | 8 | 9 | 7 | **10** |
| GHOUL | 14 | 15 | 16 | 16 | **17** |
| SKELETON | 14 | 15 | 16 | 17 | **17** |

GOBLIN=19 and RED DRAGON=10 exactly reproduce M27's own cited real-bytes numbers (`m27-audit.md`,
`combat.test.ts`'s existing golden assertions) — independently re-derived this round from the real
`.DAX` file, not copied from the prior audit's table.

### Probe 2 — DQK real NPC saves (`The Dark Queen of Krynn/DISK2/MONCHA.GLB`, `decodeMonchaGlb`)

**WITHDRAWN [§29 2026-08-20].** Shifted decode; every name is an artefact and every row's
class/level/saves belongs to a different byte window. Five of the eight are not NPCs at all
(`BLACK OGUE` = `BLACK ROGUE`, `THENOL WIARD` = `THENOL WIZARD`, `DRK WIZARD` = `DARK WIZARD` - all
three humanoid bestiary records; `BAKAI SHAMAN` = `BAKALI SHAMAN` and `SHARMAN` = `SHARKMAN` - both
plain bestiary monsters). Kept visible, struck through:

| ~~Name~~ | ~~npcClass~~ | ~~npcLevel~~ | ~~paralyzePoisonDeath~~ | ~~petrifyPolymorph~~ | ~~rodStaffWand~~ | ~~breath~~ | ~~**spell**~~ |
|---|---|---|---|---|---|---|---|
| ~~BLACK OGUE~~ | ~~6~~ | ~~21~~ | ~~8~~ | ~~7~~ | ~~4~~ | ~~11~~ | ~~**5**~~ |
| ~~THENOL WIARD~~ | ~~5~~ | ~~22~~ | ~~8~~ | ~~5~~ | ~~3~~ | ~~7~~ | ~~**4**~~ |
| ~~DRK WIZARD~~ | ~~5~~ | ~~20~~ | ~~10~~ | ~~7~~ | ~~5~~ | ~~9~~ | ~~**6**~~ |
| ~~BAKAI SHAMAN~~ | ~~8~~ | ~~9~~ | ~~7~~ | ~~10~~ | ~~11~~ | ~~12~~ | ~~**12**~~ |
| ~~SHARMAN~~ | ~~2~~ | ~~18~~ | ~~3~~ | ~~4~~ | ~~5~~ | ~~4~~ | ~~**6**~~ |
| ~~GNOME TINKE~~ | ~~2~~ | ~~13~~ | ~~11~~ | ~~9~~ | ~~7~~ | ~~11~~ | ~~**8**~~ |
| ~~SELIA~~ | ~~6~~ | ~~27~~ | ~~8~~ | ~~7~~ | ~~4~~ | ~~11~~ | ~~**5**~~ |
| ~~TASLEHOFF~~ | ~~6~~ | ~~22~~ | ~~8~~ | ~~7~~ | ~~4~~ | ~~11~~ | ~~**5**~~ |

**Corrected [§29 2026-08-20]** - re-derived on this correction pass with the same call against the
same file. The **10** records that carry `category: 'npc'` in `arch.monsters`, drawn from the 11
members with is-monster flag `0`:

| Name | blockId | npcClass | npcLevel | paralyzePoisonDeath | petrifyPolymorph | rodStaffWand | breath | **spell** |
|---|---|---|---|---|---|---|---|---|
| GNOME WARRIOR | 68 | 2 | 14 | 5 | 6 | 7 | 5 | **8** |
| GNOME TINKER | 69 | 2 | 13 | 11 | 9 | 7 | 11 | **8** |
| CAPTAIN DAENOR | 91 | 3 | 30 | 3 | 4 | 5 | 4 | **6** |
| GRUNSCHKA | 92 | 2 | 25 | 4 | 5 | 6 | 4 | **6** |
| SELIAS | 93 | 6 | 27 | 8 | 7 | 4 | 11 | **5** |
| TASSLEHOFF | 94 | 6 | 22 | 8 | 7 | 4 | 11 | **5** |
| BALDRIC | 95 | 4 | 32 | 3 | 4 | 5 | 4 | **6** |
| SIR DISCORE | 96 | 1 | 34 | 3 | 4 | 5 | 4 | **6** |
| ELGYNORA | 97 | 13 | 27 | 5 | 5 | 3 | 5 | **4** |
| DAWNSHINE | 98 | 12 | 35 | 6 | 7 | 4 | 11 | **5** |

The load-bearing point of the probe survives verbatim: all of these carry plausible, varied (not
degenerate/constant) saving-throw spreads, and all reach the panel through the same array. What
changes is the record the wiring plan's e2e assertion keys on - **GNOME WARRIOR**, whose real spell
save is **8**, not BAKAI SHAMAN's 12 (see the wiring plan below). Note the corrected NPC set also
carries `npcClass` codes 1/3/4/12/13 that the shipped `NPC_CLASS_LABEL` table does not cover; that is
M37's gap, not this one, and is recorded in `m37-audit.md`'s Open questions.

### Probe 3 — DQK real monster-framed (non-NPC) saves, same file

| Name | paralyzePoisonDeath | petrifyPolymorph | rodStaffWand | breath | **spell** |
|---|---|---|---|---|---|
| RED DRAGON | 7 | 8 | 9 | 8 | **10** |
| ~~IRON OLEM~~ **IRON GOLEM** *(§29: not a "sic" - a decoder artefact)* | 3 | 4 | 5 | 4 | **6** |
| HYDRA | 4 | 5 | 6 | 4 | **7** |
| ~~UMBERHULK~~ **UMBER HULK** *(§29: same)* | 8 | 9 | 10 | 9 | **11** |

**[§29 2026-08-20 - values SURVIVE, spellings and counts do not.]** Re-derived on this correction
pass: all four rows' five save numbers are byte-for-byte the same under the corrected decode (these
are monster-framed records whose stat block the old two-pass reconstruction happened to re-synchronise
onto). Only the **names** were wrong, and the parenthetical "*(sic — real in-game spelling)*" was
wrong with them - `IRON GOLEM` and `UMBER HULK` are what the bytes say at the fixed name offset
`0x68`; they are not SSI abbreviations. The counts in the paragraph below are superseded.

~~All **38** monster-framed + **8** NPC-framed = **46** "hasStats" `MONCHA.GLB` records (exactly
`arch.monsters.length`, matching `moncha.decoded` per M37) carry a real, non-degenerate
`savingThrows`~~ — **corrected [§29 2026-08-20]: **76** monster-framed + **10** NPC-framed = **86**
"hasStats" records**, still exactly `arch.monsters.length` and still exactly `moncha.decoded`. The
exhaustive filter still returns every one of them
(`monsters.filter(m => m.savingThrows !== undefined).length === 86` of 86, re-run this pass).
**Every record that ever reaches the Companion Panel's Monsters category, in any of the three games'
DQK path, already has this field populated** — that conclusion is unchanged.

### Probe 4 — DoK compact-record honesty check (negative control, no regression risk)

```ts
const items = decodeMonsterArchive(new Uint8Array(await readFile('Death Knights of Krynn/MON1CHA.DAX')));
items.filter(i => i.savingThrows !== undefined).length  // → 0 of 64
```
All 64 real DoK monsters correctly decode `savingThrows === undefined` (the field is genuinely unlocated
in the 216-byte compact record, gap B5 — this is *already* asserted by the existing golden test,
`monster.test.ts:260`, `expect(by('NIGHTMARE')!.savingThrows).toBeUndefined()`). A conditional row (push
only when `m.savingThrows` is defined, mirroring the existing `Level` row's convention) will correctly
omit the row for every DoK entry — no fabricated data, no new engine test needed for this negative
control since it is already covered.

**[EXPIRED 2026-08-20 — not a §29 consequence, a separate later correction.]** Commit `fa07892`
(2026-08-11) byte-located DoK's saving throws at `MON1CHA` record offsets 42..46 and set
`DOK_LAYOUT.saves = 42`. Re-run this pass, all 64 DoK records now decode a real `savingThrows`
(`SKEL WARRIOR` spell 11, `GHOUL` 17, `WRAITH` 14, `LORD SOTH` 5, `NIGHTMARE` 13), so the filter
returns **64 of 64**, not 0, and the `toBeUndefined()` golden assertion this probe cited no longer
exists in `monster.test.ts`. Gap B5 is closed. The `Save` row therefore fires for DoK entries too;
`referenceDb.ts`'s own doc comment already records this. The row stays conditional only because
`MonsterRecord.savingThrows` remains optional in the type — no shipped layout is now in that state.

### Probe 5 — row-budget headroom (reproducing `monsterCategory()`'s CURRENT row-building logic by hand
against real decoded records, not just estimating from reading the source)

`REFERENCE_DB_DETAIL_ROWS = 12` (`packages/engine/src/render/referenceDb.ts:72`). Reproducing the exact
row list `monsterCategory()` builds today (`referenceDb.ts:95-106`) against the real GOBLIN and BAKAI
SHAMAN records:

| Entry | Today's real row count | +1 "Save" row | Cap |
|---|---|---|---|
| GOBLIN (CoK monster, no npcClass/npcLevel) | 9 (AC/HD/THAC0/HP/Damage/XP/Morale/Size/Class) | **10** | 12 |
| ~~BAKAI SHAMAN~~ **GNOME WARRIOR** (DQK NPC, post-M37 +Level) *[§29 2026-08-20]* | 10 (…+Class+Level) | **11** | 12 |

**[§29 2026-08-20]** The arithmetic is unchanged — an NPC-framed DQK entry really does carry the
extra `Level` row — but the sampled record had to be re-pointed: BAKAI SHAMAN is a bestiary monster
(is-monster flag 1), so it never carried a `Level` row at all. GNOME WARRIOR (member 68, flag 0,
`npcClass` 2, `npcLevel` 14) is a genuine NPC-framed record with the same row shape. Note also that
M83 later re-measured this budget exhaustively against the whole Gen1 corpus and found real records
already sitting **at** the cap, which is why `REFERENCE_DB_DETAIL_ROWS` is now 13 — see
`m83-audit.md`. And per the Probe 4 note above, the "DoK entries never gain the new row at all"
sentence below is now false: DoK entries do gain it.

Both land comfortably under the cap (1-2 rows of headroom remain even for the worst case, an NPC entry).
No entry in either game combines `npcLevel` with anything else that would push past 11, since `npcLevel`
is DQK-NPC-only and DoK's `savingThrows` is always `undefined` (so DoK entries never gain the new row at
all, staying at 9).

## Reachability proof

Same three already-live surfaces M37 already established use this exact function, unmodified by this
audit:
1. **Companion Panel → Databases → Monsters**, embedded in a live DQK session (`dqkExplore.ts:617`,
   `openCompanion()` → `state.moncha.monsters`) — already e2e-asserted live and passing
   (`apps/web/test/e2e.mjs:1756-1779`, extended by M37 for the `npcClass`/`npcLevel` case; this round's
   plan extends the SAME `bakaiDetail` scan with one more assertion, not a new test). **[§29
   2026-08-20: that scan is now `npcDetail`, keyed on `GNOME WARRIOR` rather than the mis-decoded
   `BAKAI SHAMAN`. The reachability argument is unchanged — same panel, same function, same live
   array.]**
2. **Companion Panel → Databases → Monsters**, embedded in a live CoK/DoK session (`explore.ts:1600-1608`
   builds `bestiary` from `monRecords`, `explore.ts:1136` feeds it to `openCompanionPanel`'s `source.monsters`)
   — already e2e-asserted live (`e2e.mjs:688-707`, the `explore-1` companion block, walks the real
   bestiary via `refMove`). This round's plan adds a GOBLIN-specific scan mirroring M37's `bakaiDetail`
   pattern (not currently present — see wiring plan step 3).
3. **Standalone `?refdb=1` page** (`referenceDb.ts`'s own `loadCategories()` → `decodeMonsterArchive`
   over the real `Champions of Krynn/MON1CHA.DAX`) — already e2e-asserted live
   (`e2e.mjs:3900-3946`, `runReferenceDb`), independent of any live session.

No new asset fetch, no new decoder, no new opcode — `savingThrows` rides on the exact `MON1CHA.DAX` /
`MONCHA.GLB` decodes every one of these three paths already performs today.

## Wiring plan

1. **`apps/web/src/ui/referenceDb.ts`**, `monsterCategory()` (currently lines 89-109) — add one more
   conditional row after the existing `Level` row, mirroring its exact "push only if defined" shape:
   ```ts
   ...(m.npcLevel !== undefined ? [{ label: 'Level', value: `${m.npcLevel}` }] : []),
   ...(m.savingThrows ? [{ label: 'Save', value: `${m.savingThrows.spell}` }] : []),
   ```
   Doc comment above it should cite this audit + M27.S1 (`Combatant.monsterSpellSave`) + note explicitly
   that only the **spell** column is shown — the same column with a live combat consumer — not all 5,
   so the row doesn't imply the other 4 (`paralyzePoisonDeath`/`petrifyPolymorph`/`rodStaffWand`/`breath`)
   are mechanically live too (per M27/M30's own standing note, they aren't).

2. **No engine changes** — `savingThrows` is already decoded and golden-tested in both
   `monster.test.ts` (CoK + DoK-undefined) and exercised (not separately unit-tested, but reproduced
   fresh this round, Probes 1-4) in `moncha.ts`. Zero schema change, zero new field.

3. **Tests** (extend existing e2e cases, per this project's established discipline of preferring
   extension over new test files):
   - `apps/web/test/e2e.mjs`'s existing `explore-dqk` case (~line 1766, the NPC detail scan M37
     added): add a `Save` assertion to the existing `npcClassOk` boolean. **[§29 2026-08-20: the
     original text said `bakaiDetail.some((r) => r.label === 'Save' && r.value === '12')`, "BAKAI
     SHAMAN's real spell save is 12". BAKALI SHAMAN's spell save really is 12, but it is a bestiary
     monster, not an NPC record, so that scan never selected it as one. The scan is now keyed on
     `GNOME WARRIOR`, whose real spell save is **8**.]**
   - `apps/web/test/e2e.mjs`'s existing `explore-1` companion block (~line 688-707): add a GOBLIN scan
     mirroring the `bakaiDetail` pattern exactly (loop `refMove`/`refSelected` until
     `name === 'GOBLIN'`, read `.detail`), asserting `{label:'Save', value:'19'}` is present (Probe 1).
     This is new code in that block (no prior per-entry scan existed there beyond the coarse
     name-list walk), but the *pattern* is copied verbatim from M37's own `bakaiDetail` addition, not
     invented fresh.
   - No new engine-side test file needed.

4. **Optional, not required this round**: a matching negative-control assertion in a DoK companion e2e
   case would strengthen the "never fabricates" claim end-to-end in the browser, but `runExploreDok`
   (`e2e.mjs:1222`) currently has **no** Companion Panel / refdb block at all (confirmed by grep — DoK's
   e2e coverage of the Companion Panel is a pre-existing gap, unrelated to this slice). The engine-level
   negative control (Probe 4, already covered by the existing `monster.test.ts:260` assertion) is
   sufficient grounding for shipping; adding a DoK companion e2e block is a separate, larger follow-on
   (building the block from scratch) and explicitly out of scope here.

Rough size: ~5-8 LOC in `referenceDb.ts` (one conditional row + doc comment), ~10-20 LOC of e2e
assertions across two existing blocks — smaller than M37's own slice (no new crosswalk table needed,
since the value is a plain number, not a code needing a label lookup).

## Rejected alternatives investigated this round

| Candidate | Why rejected |
|---|---|
| Item-instance subsystem, `DokItemRecord.value`/`.magicBonus`/`.charges`/`.cursed` (`ITEM0.DAX`, DoK's 17-byte catalogue) — **re-investigated in real depth this round (lens b)** | **Re-confirmed still blocked — 10th consecutive round — with NEW corroborating evidence, not just a repeat.** M31 already found `.value` fails a real-bytes plausibility check (every one of 91 real decoded values is an exact multiple of 256). This round independently re-derived that (confirmed: 1536/1280/1024/5120/9216 — all ×256) and went further: dumped `.cursed` against the real file for the first time (it was never previously checked, only structurally tested against a synthetic record) and found **87 of 91 real records (96%)** decode `cursed = true` — implausible for real game data (no Gold Box game marks 96% of its catalogue cursed) and strong *additional* evidence (a second, independent field) that this table's field offsets are mis-mapped for DoK's specific `ITEM0.DAX`, not merely unwired. This strengthens, rather than reopens, the standing block — a future unblock attempt should treat the whole 17-byte offset map as suspect (re-derive from scratch against a disassembly), not patch individual fields. See Probe A below. |
| `MonsterRecord.abilities` (STR/INT/WIS/DEX/CON/CHA) — real, decoded, golden-tested (`monster.test.ts:83,182-184,248` — HILL GIANT STR 19, GIANT RAT INT 3, VAMPIRE STR 18), consumed ONLY by `monsterSideTables.ts:310`'s `conSpellSaveBonus(r.abilities.con)` (the `.con` component only) — never displayed anywhere | Same "decoded but unconsumed-by-display" shape as this round's pick, but **fails the row-budget check that `savingThrows` passes**: 6 new fields cannot fit in the 1-2 rows of headroom confirmed by Probe 5 without either (a) restructuring/removing existing rows (out of scope, higher risk, no clear "safe to cut" row identified) or (b) cramming 2 abilities per row (e.g. "STR/DEX: 19/18") which needs new label/value-packing logic beyond a one-line conditional push — a bigger, messier slice than this round's clean +1-row pick. Recorded as a good future candidate IF a future round finds an acceptable condensed layout. |
| `referenceDb.ts`'s `Class` label collision (`monsterCategory()`'s `category` string vs `spellCategory()`'s D&D class, both labelled `Class`) — M37's own flagged bonus finding, explicitly listed by this round's brief as a fallback candidate | Lens (a) turned up a stronger, more valuable candidate (`savingThrows`, an already-live-combat-consumed field, vs. a pure cosmetic rename) — per the brief's own stated preference order, not pursued as this round's headline. Still small, still valid, still unpicked; deliberately not bundled into this round's diff to keep the slice single-purpose (one file, one concern) — a clean future one-line pick (rename the generic `category` row's label to something other than `Class`, e.g. `Kind`, verified this round to have **zero** e2e assertions locking the current `monster`/`humanoid`/`sub` wording, so it is a safe rename whenever picked up). |
| DoK `.WIZ` "known spell" 100-byte sub-table | Re-confirmed unchanged (fresh grep of `monsterSideTables.ts:69-74`) — still `INFERRED`-only, still needs its own decoder region + bulk spellbook-seed mutator + wider crosswalk. No new angle found this round; correctly still bigger than an S-sized slice. |
| ECL `DAMAGE` opcode (0x2e) | Not re-investigated this round (already exhaustively probed at M37: real operands `[129,29,82,1,76]` for DoK block 34, `dice_size=82` nonsensical as a literal, meaning at least one operand is a memory reference — confirmed multi-branch mechanic work, not a join). No new information to add; correctly not re-picked. |
| ECL `PICTURE`/`CLEAR_BOX`/`SPRITE_OFF` effects | Not re-investigated this round — M37 already established these need a whole new asset-fetch + rendering surface (no `PICx.DAX`-by-id path exists in the dialogue/explore flow today); no new lead found to shrink that scope, so not re-opened. |
| Named-artifact item encoding (VOCAB type 68, "Solamnic Plate Mail") | Unchanged, still uncracked; no new lead this round. |
| Reconciling DoK's default `eclInitBlock` (2 vs 34) | Still unattempted, still a bigger/riskier decision (blast radius: automap/geometry tests keyed on block 34) — not touched this round. |
| The 4 remaining `SavingThrows` columns as a *combat mechanic* (`paralyzePoisonDeath`/`petrifyPolymorph`/`rodStaffWand`/`breath`) | Explicitly NOT this round's target — still correctly blocked as *mechanics* (no poison/petrify/rod-staff-wand/breath-weapon status-effect system exists, M27-M30's repeated verdict). This round's pick only *displays* the one column (`spell`) that already has a mechanic; the other 4 remain undisplayed too (deliberately — see wiring plan step 1's doc-comment note) so as not to imply otherwise. |

### Probe A — `DokItemRecord.cursed` real-bytes dump (new evidence for the item-instance blocker)

```ts
const items = decodeDokItemArchive(new Uint8Array(await readFile('Death Knights of Krynn/ITEM0.DAX')));
items.filter(i => i.cursed).length   // → 87 of 91
```
Sample raw bytes confirming this isn't a decoder-arithmetic slip (byte offset 12 really does hold a
large nonzero value in the real file, e.g. record index 1: `... 00 04 e8 03 00 00 00` → byte12=`0xe8`,
byte13=`0x03` — nowhere near the documented 0/1 boolean encoding in `hackdocs_extracted/ITEM.TXT:42-43`,
"Byte 12: Set to 1 if item is cursed"). Whether this is an offset-drift bug in this engine's
`DokItemRecord` layout, or DoK's `ITEM0.DAX` genuinely differs from the FRUA `item.dat` convention this
loader's doc comment assumes (`item.ts:20-24`, "the classic SSI item record… DoK drops that [18th]
byte" — an assumption never independently re-verified against a disassembly), is **UNKNOWN** — flagged
below, not resolved.

## Open questions / unknowns

- **Whether `DokItemRecord`'s 17-byte offset map is correct at all for DoK's `ITEM0.DAX` is now in
  serious doubt** (two independent fields — `.value` per M31, `.cursed` per this round's Probe A — both
  produce implausible real-file values). **UNKNOWN** whether this is an offset-drift bug in this
  engine's loader or a genuine format divergence from FRUA's `item.dat`; not resolved this round (would
  need a disassembly-level re-derivation, a research task bigger than this round's scope). Flagged
  clearly so a future round doesn't waste effort re-wiring `magicBonus`/`charges`/`ready`/`identified`
  under the current offset map before this is settled.
- **Whether a condensed ability-score row (e.g. 2 abilities per row) is worth a future round's effort
  for `MonsterRecord.abilities`** is not resolved — noted as a real, valid, but currently-row-budget-
  blocked candidate (see Rejected alternatives).
- **Whether DQK's real monster-framed `savingThrows` (Probe 3, 38 records **[§29 2026-08-20: **76**
  monster-framed records, not 38]**) also actually reaches DQK's
  own live combat via `monsterSpellSave`** (i.e., whether DQK encounters are ever assembled through the
  same generic `monsterCombatant()`/`makeTC()` path CoK/DoK use) was **not verified end-to-end this
  round** — `monsterCombatant()` is generic and unconditionally sets `monsterSpellSave: mon.savingThrows
  ?.spell` (`combat.ts:341`), so it almost certainly does, but this round's scope was the *display* layer
  only; confirming DQK's actual encounter-assembly call site was not re-traced. Doesn't affect this
  round's wiring plan (which is UI-only and correct regardless).

## Implications for our engine

- **The same UI chokepoint (`referenceDb.ts`'s `monsterCategory()`) has now yielded two consecutive
  rounds' picks** (M37: `npcClass`/`npcLevel`; M38: `savingThrows.spell`) — confirms M37's own
  prediction that this file's per-category row builders were worth re-checking, not a one-off. A future
  round should check whether `itemCategory()` and `spellCategory()` have similar gaps (this round did
  not do a full field-by-field sweep of those two, having found a strong pick in `monsterCategory()`
  first).
- **A field with a genuinely live combat consumer (M27's `.spell` save) is a stronger display-wiring
  candidate than a field with none** — this round deliberately distinguished "already mechanically live,
  just not shown" (this pick) from "decoded but mechanically inert everywhere" (the other 4
  `SavingThrows` columns, correctly still not surfaced) rather than lumping all 5 columns into one
  "just show the whole struct" row, which would have misrepresented 4 of the 5 as equally meaningful.
- **Independently re-deriving a "10th consecutive confirmation" blocker found genuinely new evidence**
  (the `.cursed` implausibility) rather than a rubber-stamp re-check — worth continuing to spend a small
  amount of probe effort on standing blockers even when not picking them, since new falsifying/
  strengthening evidence changes how confidently a future round can approach them.
- **Row-budget arithmetic (`REFERENCE_DB_DETAIL_ROWS`) is a real, recurring design constraint on this
  panel** — two real candidates this round split cleanly on it (`savingThrows.spell`: 1 row, fits;
  `abilities`: 6 fields, doesn't) — future picks targeting this same panel should check it early, not
  after drafting the display logic.

## Scratch files used this round (created, verified, then deleted — none left in the tree)

- `packages/engine/test/_scratch_m38_itemvalue.test.ts` (four iterations: DoK `ITEM0.DAX` value/cursed
  dump, raw hex dump, savingThrows real-bytes checks, row-budget reproduction) — deleted.
- `packages/engine/test/_scratch_m38_probe2.test.ts` (DQK monster-framed savingThrows sweep) — deleted.
- Confirmed via `git status --porcelain` (clean) after deletion.
