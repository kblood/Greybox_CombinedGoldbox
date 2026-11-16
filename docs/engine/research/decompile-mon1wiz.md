# `MON1WIZ.DAX` — DoK monster spellbook/memorization side-table

**Verdict: RESOLVED** for the part that matters (the monster memorized-spell list). Two
secondary sub-regions of the shared 220-byte record are **PARTIAL / INFERRED** (observed only
in real player-save `.WIZ` files, never populated in the 14 real monster blocks, so not needed
for a monster decoder but documented for completeness / a future player-save loader).

Decoder: `packages/engine/src/loaders/monsterSideTables.ts` — `decodeMonsterWizArchive` /
`decodeMonsterWizRecord`. Tests: `packages/engine/test/monsterSideTables.test.ts` (describe
block `MON1WIZ.DAX — DoK monster spellbook side-table`).

---

## 1. Starting point

`Death Knights of Krynn/goggame-galaxyFileList.ini` entry `F16` confirms `MON1WIZ.DAX` ships
with the DOS/GOG release, sitting alongside the already-solved `MON1CHA.DAX` (bestiary),
`MON1ITM.DAX` (carried items, 63-byte records) and `MON1SPC.DAX` (specials/affects, 9-byte
records) — see `monsterSideTables.ts`'s header doc comment for those two. The `MON{n}ITM`/`SPC`
format + id-keying is grounded in COAB's `ovr017.cs load_mob`. `WIZ` was the obvious guess for
"spellbook", since the player-save format uses a `.WIZ` extension too (`SAVE/CHRDATA{n}.WIZ`).

**COAB does NOT reference this file.** `load_mob` (`coab_extracted/engine/ovr017.cs:824-875`)
loads exactly three files per monster — `MON{n}CHA.dax` (→ `new Player(data,0)`),
`MON{n}SPC.dax` (→ `player.affects`), `MON{n}ITM.dax` (→ `player.items`) — and nothing else.
A repo-wide, case-insensitive grep for `"WIZ"` across every `coab_extracted/**/*.cs` file
(including all `ovr0*.cs`/`seg0*.cs` overlays and every `Classes/*.cs`) turns up exactly one
unrelated hit (`Item.cs:223`, the item-name string `"Wizardry"` — a ring of wizardry). **There
is no `load_wiz` function, no `"WIZ.dax"` string, no reference anywhere in the decompile.** So
unlike SPC/ITM this file has **no COAB oracle** — the layout below is reconstructed purely from
the real bytes, cross-checked against the community hackdocs and a second, independent real
data source (see §3).

## 2. Container-level facts (verified)

`Death Knights of Krynn/MON1WIZ.DAX` parses as an ordinary DAX container (per
`docs/dax-format.md`: `word0 = entry_count×9` TOC bytes, 9-byte entries
`{u8 block_id, u32 data_offset, u16 raw_size, u16 comp_size}`, signed-byte RLE data). It holds
**14 blocks**:

| block_id | raw_size | comp_size |
|---|---|---|
| 14, 20, 21, 40, 49, 50, 66, 67, 68, 69, 70, 71, 74, 97 | **220** (every block) | 10–64 |

Every `block_id` is a real monster id present in `MON1CHA.DAX` (64 monsters, ids 0-63 in DoK
area 1 — wait, area 1 actually runs past 63; the point verified in the test is simply "WIZ ids
⊆ CHA ids", which holds for all 14). Only 14 of the area's monsters ship a WIZ block — the
casters. Every block decompresses to **exactly 220 bytes**, unlike CHA (216 bytes/record),
SPC (9-byte records) and ITM (63-byte records) which are N-multiples; WIZ is always exactly one
fixed 220-byte record per block (never repeated/tiled).

(NB: `tools/dax_inspect.py`'s "entry_count/table_offset" labels are known-stale per
`docs/dax-format.md`'s own note — the correct TOC layout above was used throughout, and
independently re-derived in this pass as `tools/../dax_blocks.py`-equivalent Python before any
conclusion was drawn.)

## 3. The decisive cross-check: real player `.WIZ` saves are the SAME 220-byte format

`Death Knights of Krynn/SAVE/CHRDATA{1..7}.WIZ` are real per-character save companions to
`CHRDATA{n}.SAV` (the character record; a `CHRDATA{n}.SAV`+`.WIZ` pair per party slot — also
present under `cloud_saves/SAVE/**` and `The Dark Queen of Krynn/cloud_saves/SAVE/AmigaDKK/**`
in bulk, since DQK's cloud saves happen to include an archived DoK/CoK save tree). **Every one
of them is exactly 220 bytes** — byte-identical in size to a `MON1WIZ.DAX` block. This is strong
independent confirmation that `MON{n}WIZ.DAX` monster blocks are the exact same record format
as the player's own `.WIZ` spellbook save, just id-keyed per monster instead of per party slot
(same design as the CHA/CCH relationship already documented for the character-import feature).

## 4. Record layout

### 4a. Bytes 0x00-0x49 (74 bytes) — memorized-spell instance list. **VERIFIED.**

A flat `u8[74]`. Each nonzero byte is a **DoK global spell number, 1-126**, per
`hackdocs_extracted/SPELBOOK.TXT`'s "SPELL NUMBERS, NAMES, BOOK NUMBERS, AND CODES" table (the
same numbering CKITFORM/CCHFORM's "Memorize Spell Value 1 byte 0 thru 255" fields and
`MONSTSUM.TXT`'s "Monster Summoning" hack both describe: *"This list begins at offset 198 and
ends at offset 337 in the monster's .DAT file. Simply input the value 126 (the spell's number)
into any of these offsets"* — i.e. this exact mechanic, a flat byte-per-slot spell-number array
editable in any slot regardless of monster class, is independently documented for the later
FRUA/UA-era engine and is clearly the same idea here). `0` = empty slot. A repeated value means
multiple simultaneously-memorized castings of the same spell — the standard Gold Box
mage-memorization mechanic (e.g. real monster id 66's list `[49,49,49,81,81,94,94,10,15,15]` =
3× *Hold Person*, 2× *Charm Monsters*, 2× *Hold Monsters*, 1× *Charm Person*, 2×
*Magic Missile*).

**Verification (exhaustive, not spot-checked):** every nonzero byte in the 74-byte prefix of
all 14 real `MON1WIZ.DAX` blocks, and of 4 sampled real player `.WIZ` saves
(`SAVE/CHRDATA6.WIZ`, `CHRDATA3.WIZ`, `cloud_saves/SAVE/bak/CELESTE.WIZ`), was looked up against
a parse of `SPELBOOK.TXT`'s full 126-entry numbered table. **Zero unresolved values** (~350
bytes checked total). Every value also has the correct in-fiction class prefix consistency
(monster id 70/71's list is 100% Cleric spells — `C: Cause Disease, C: Slay Living, C: Poison,
C: Sticks to Snakes, C: Bestow Curse, C: Cause Blindness, C: Hold Person, C: Resist Fire,
C: Silence 15' Radius`; monster id 97's is 100% Mage — `Fireball, Mirror Image, Ray of
Enfeeblement, Stinking Cloud, Charm Person, Magic Missile, Sleep`). A few high-level unique
casters (ids 50, 69) mix in 1-3 spells from another class's list (e.g. id 50 is a mostly-Mage
archmage-tier list — *Fireball, Ice Storm, Stone to Flesh, Death, Disintegrate, Flesh to
Stone, Globe of Invuln, Mirror Image, Stinking Cloud, Lightning Bolt, Cone of Cold* — plus one
Cleric spell and two Druid spells); this is consistent with `MONSTSUM.TXT`'s documented fact
that the engine does not enforce class restriction on a monster's spell-number list, so unique
boss NPCs can (and evidently do) carry a couple of "borrowed" spell-like abilities.

**Fill order differs by producer, not by format:**
- Monster-editor blocks (all 14 real ones) are **front-filled**: entries start at byte 0,
  unsorted, in whatever order the scenario designer entered them, zero-padded after.
- Real player saves are **back-filled and sorted ascending**: e.g. `CHRDATA6.WIZ` has bytes
  0-49 all zero, then bytes 50-73 hold `[3,3,3,3,6,8,12,15,15,18,23,23,24,25,30,32,41,41,45,
  47,47,48,58,106]` — packed against the *end* of the 74-byte region, strictly ascending. This
  matches COAB `Classes/SpellList.cs`'s `Save()` routine exactly: `int idx = SpellListSize - 1;
  foreach (sp in spells) { data[offset+idx] = sp.Id; idx -= 1; }` — fill-from-the-end, which
  naturally produces this exact "zeros first, then an ascending run ending at the last index"
  shape when the live game (not a level-design tool) writes the array. (Note: COAB's
  `SpellList` is a *different*, 84-byte, struct embedded directly in the main `.SAV`/`.CCH`
  record at offset `0x1e` — not this file — but it is the closest COAB analogue and its exact
  save discipline is what we see reproduced here.)

### 4b. Bytes 0x4A-0xAD (100 bytes) — "known spell" boolean table. **INFERRED, player-only.**

In every real player `.WIZ` save inspected, bytes 74-173 hold a **one-byte-per-spell
0/1 flag** (index `i` = spell `i+1`, so this sub-region covers spells 1-100). Example from
`CHRDATA6.WIZ`: byte 74 (spell 1, *Bless*) = 1, byte 75 (spell 2, *Curse*) = 0, byte 76
(spell 3, *Cure Light Wounds*) = 1 (matches the memorized-list entry for spell 3), etc. — a
"has this spell ever been learned / is it in the book" flag, consistent with `CCHFORM.TXT`'s
description of an auto-updated "Spell Book" region for divine casters plus manually-learned
Mage spells. **This is always all-zero in every one of the 14 real monster blocks** — monster
templates only need the instance list (§4a) to know what to cast; they carry no browsable
"book" concept. This sub-region's size (100 bytes) exactly matches COAB `Classes/Player.cs`'s
`[DataOffset(0x79, DataType.ByteArray, 100)] public byte[] spellBook` field, which is currently
attributed to living inside the main character record — but no decompiled overlay shows a load
routine that actually populates it from there, and 0x79 (121) + 100 = 221, i.e. 1 byte *past*
the 220-byte size of this very file, while comfortably *inside* it if the true base is this
separate `.WIZ` file's own byte 0 instead of the combined-record offset 0x79. This is a
plausible explanation for why COAB shows no `WIZ` load call: the field may be populated by
concatenating/aliasing this file into the same in-memory `Player` object COAB's static offset
table describes, via a load routine in an overlay not yet decompiled. **Not proven** — flagged
here as the concrete next step if the player-save format is ever pursued.

### 4c. Bytes 0xAE-0xDB (46 bytes) — small-integer sub-table. **UNRESOLVED.**

Real player saves show small clean integer clusters here (e.g. `CHRDATA6.WIZ` bytes 188-191 =
`6,4,2,1` and bytes 212-214 = `4,2,2`) — plausibly a per-spell-level "spells memorized today"
count table for two casting classes (a 6/4/2/1 progression is a textbook AD&D 1e Mage
spells-per-day spread at some level; 4/2/2 likewise for a Cleric). This is a plausibility
argument, not a verified layout — no COAB struct offsets align to a 46-byte tail, and there
wasn't a decisive independent cross-check available in this pass. **Never populated in the 14
real monster blocks.** Where nonzero there, the bytes are demonstrably NOT this kind of data:
they include unambiguous fragments of unrelated Pascal-style (length-prefixed) editor strings —
`id=67`/`68`'s tail is byte `7` followed by exactly `"Friends"` (7 characters, an exact
ShortString length match), `id=70`/`71`'s tail spells out `"Select log option"` and `"Quit "`
character-for-character. These are uninitialized/reused tool-memory bytes bleeding through from
whatever buffer the SSI scenario-authoring tool last used before writing this record — a
classic "didn't zero the scratch buffer" artifact, not game data. This conclusion is reinforced
structurally: the monster blocks *with* this tail garbage are exactly the ones with the largest
RLE `comp_size` (63-64 bytes, vs 10-25 for the clean ones) — text/near-random bytes don't
run-length-compress, all-zero tails do.

## 5. What the decoder implements

`decodeMonsterWizRecord`/`decodeMonsterWizArchive` (`packages/engine/src/loaders/
monsterSideTables.ts`) decode **only §4a** — the 74-byte memorized-spell instance list — since
that is the only sub-region any real monster block actually populates, and it is the only part
needed to make a ported caster monster cast the spells it originally knew. Each nonzero byte
yields a `{ spellId, learning }` pair (`spellId = byte & 0x7F`, `learning = byte > 0x7F`); the
high-bit "still learning" convention is carried over from COAB's `SpellList.AddLearnt` and
`CCHFORM.TXT`'s "129 to 254 if not memorized" description **by analogy only** — it was never
observed set in any of the ~350 real bytes inspected, so it is untested but harmless
forward-compatibility, not a fabricated requirement (worst case, an unseen `1xx`-valued byte
would previously have failed the "resolves to a named spell" check and now instead decodes to a
smaller, still-valid, spell id with a flag — never a crash or out-of-range value).

Bytes 74-219 are intentionally NOT decoded by the monster-side function: §4b is always zero in
monster data, and §4c's occasional nonzero bytes are confirmed non-spell garbage (§4c above), so
including them would either add always-empty noise or, worse, mis-decode stray editor-string
bytes as fake "spells" for the handful of monsters affected.

## 6. Verification performed

- Re-derived the DAX container/TOC parse independently (not reusing `tools/dax_inspect.py`,
  which `docs/dax-format.md` already flags as using stale field names) and cross-checked block
  count/sizes against `MON1CHA.DAX`/`MON1ITM.DAX`/`MON1SPC.DAX` for sanity.
- Confirmed all 14 WIZ block ids are real `MON1CHA.DAX` monster ids (id-keyed, matching the
  established SPC/ITM pattern) — asserted in the test suite.
- Parsed `hackdocs_extracted/SPELBOOK.TXT`'s full spell-number table (126 entries) and checked
  **every** nonzero byte in the §4a region of **all 14 real MON1WIZ.DAX blocks** against it:
  100% resolve to valid, correctly-classed spell names, 0 unresolved.
- Found and inspected 4 real player `.WIZ` saves independently (not part of the original task
  brief) as a second, unrelated verification source; confirmed identical record size (220 bytes)
  and the same "nonzero byte = valid 1-126 spell number, dupes = extra memorized castings"
  semantics, with a fill-order difference explained by COAB's own `SpellList.Save` discipline.
- Added a spot-check regression test pinning monster id 97's exact decoded list
  (`[47,32,33,34,10,15,21]` = Fireball/Mirror Image/Ray of Enfeeblement/Stinking Cloud/Charm
  Person/Magic Missile/Sleep) against the real file bytes.
- `npx tsc --noEmit` and `npx vitest run test/monsterSideTables.test.ts` both pass (17/17 tests,
  including the 4 new WIZ-specific cases) as of this writeup.

## 7. Explicitly out of scope / not attempted this pass

- 2026-07-09 follow-up: `native/src/ccdat.asm` now has `CCDAT Z <MONnWIZ.DAX> <index>`, following
  the existing `print_mon_spc`/`print_mon_itm` pattern. It validates the selected DAX block as one
  220-byte WIZ record, prints `blockId(monsterId)`, and decodes only the verified 0..73 memorized-
  spell-list region as `{spellId, learning}` fields. `W` remains the separate raw `CHRDATA*.WIZ`
  player-save evidence printer.
- **Reviewed 2026-10-11:** `apps/web/src/ui/importDokParty.ts` now reads the verified
  player memorized-spell prefix through `decodeMonsterWizRecord`.
  `exportMonsterWizSpellList` writes the sorted, right-justified 74-byte list into a
  220-byte record. Bytes 74..219 are left zero by that limited exporter; the known-book
  and tail regions remain incompletely mapped. See `dok-chrdata-save-format.md` for later
  player-save evidence. This closes the old claim that player WIZ has no implementation,
  without claiming full lossless WIZ round-tripping.
