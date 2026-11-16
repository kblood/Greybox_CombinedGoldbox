# Secret of the Silver Blades' `CHRDATA{n}.SAV` — per-field oracle table (R2, `race` updated R34/R3)

Round 29/R3 located Secret's `_class` byte (`0x6c`) and its `ClassLevel[8]` array (`0x111`) with a
discriminating offset sweep (`docs/engine/research/secret-chrdata-layout.md`), but built no
importer. This round (R2) builds `packages/engine/src/loaders/secretSavedCharacter.ts` /
`apps/web/src/ui/importSecretParty.ts` and, for every field the importer surfaces, either
reproduces an independent oracle against the retail bytes or ships the field **raw and unnamed**.
This doc is the field-by-field ledger that claim rests on.

**Round 34/R3 update:** `race`@`0x6b` moved from "raw, unlabelled" to "decoded" — Secret's own
unpacked `START.EXE` carries its own race-name string table at `0xEB91`. See §4 for the full
evidence chain, the honestly-disclosed gap (the indexing instruction itself), and the Phase B
`e2e.mjs` flip this enables (`import-secret` goes from 5/6 to 6/6, MALACHITE no longer rejected).

Data: `C:\Program Files (x86)\GOG Galaxy\Games\Secret of the Silver Blades\CHRDATA{1..6}.SAV`
(439 bytes each, install **root** — its `SAVE\` subfolder is empty, verified on-disk). Read-only,
never vendored.

The six real pregens, in file order: **Guy de Valois** (paladin 8), **PAINE** (ranger 8), **EPONA**
(fighter 8), **MALACHITE** (fighter 7 / thief 8), **DOMINIC** (cleric 8), **MORGAINE** (magic-user
9).

## 1. The field table

| field | offset | measured or predicted | oracle | accept / reject | decoded or raw |
| --- | --- | --- | --- | --- | --- |
| `name` | `0x00` (PString, max 15) | measured | printable ASCII, sane length, on 6/6 | 6/6 accept | decoded |
| `abilities` (str,int,wis,dex,con,cha) | `0x10`, 2-byte stride | **measured** | uniqueness sweep: only offset in `0..427` where all 6 records show six `(cur,full)` pairs, `cur==full`, values `3..18`, at least one pair party-varying | **1 accept / 427 reject** (the ONLY offset in the whole 428-offset search space) | decoded |
| `str00` (exceptional STR%) | `0x1c` (7th pair) | corroborating, not independently unique | `cur==full` on 6/6, values plausible 1e "18/00" notation (100/51/50/5/0/0) — outside the 3..18 filter that made `abilities` unique, so not itself discriminating | 6/6 `cur==full` | decoded (weaker discriminating claim than the other 6 pairs, disclosed) |
| `thac0` | `0x6a` | **measured** | `0x3C - raw` equals this engine's own `bestThac0()` (best/lowest THAC0 across the record's own pinned `classLevel` slots, `ruleset/addnd1e/recalc.ts`) | **6/6 accept** (incl. the multiclass record, where the stored value is the MIN of fighter-7=14 and thief-8=19, not either alone) | decoded |
| `race` | `0x6b` | **measured (round 34 R3)** | Secret's OWN unpacked `START.EXE` carries a 9-byte-stride Pascal-string race table at `0xEB91` (`Tribble, Elf, Half-Elf, Dwarf, Gnome, Halfling, Human, Monster`), immediately after an 18-entry class-descriptor table at `0xE9AB` that is byte-for-byte CoAB's own `ClassId` enum order; both tables are re-derivable via `tools/secret_race_table.py` | table existence/position/content: fencepost null clean separation, 8/8 plausible at the real base vs 0/8 at every one of 16 neighbouring shifts (`tools/test_secret_race_table.py`); the INDEXING INSTRUCTION itself was not located (see §4a) — statistical null for that search: ~31.7 expected chance matches vs ~33.7 best observed, indistinguishable | **decoded** via `SECRET_RACE_LABEL`/`raceLabel`, gap disclosed (table proven from bytes + cross-title precedent, indexing code not found) |
| `class` | `0x6c` | **measured** | `coabExpectedClassLevelSlots(class)` agrees with the nonzero `classLevel[8]` slots | **6/6 accept**; shifted to `0x6b` → 0/6, shifted to `0x6d` → 1/6 (a partial coincidence, same shape as CoAB's own MALACHITE-vs-`0x75` coincidence) | decoded |
| extra byte | `0x6d` (`class - 1`) | **unknown** | none tried survived contact with the party (values `[1,0,0,0,0,0]`, only Guy de Valois nonzero; Pools of Darkness has the identical shape at its own `class - 1`, per the R3 sweep doc) | n/a | **not named — raw only, via `unverified: [{offset, byte}]`** |
| `age` | `0x6e` (u16 LE) | **predicted** | no independent table; only a cross-field correlation (the one record with a different `race` byte also has by far the largest age: 60 vs 17-27, consistent with an elf/half-elf-type lifespan but not verified against any table) | 1 corroborating data point, not a discriminating test | decoded, flagged "not verified" |
| `hpMax` | `0x70` | **predicted** | weak bound: `level <= hp <= level * (best active-class hit die + CON hp bonus)` (`ruleset/addnd1e/abilities.ts`'s CON table) | **6/6 pass the bound** — but the bound is wide enough that many other byte values at this offset would also pass, so this is NOT proof of placement | decoded, flagged "bounded, not proven" |
| `classLevel[8]` | `0x111`, 8 bytes | **measured** | same oracle as `class` (paired) | 6/6 accept | decoded |
| `baseAc` | `0x129` | **predicted** (convention-matched) | reads the SAME constant `0x32` CoAB stores (at its own, different offset `0x124`) on 6/6 records | 6/6 constant match, but a constant-across-the-party byte cannot be discriminated by the uniqueness-sweep technique (any other constant-0x32 offset would tie it) | decoded, flagged "not independently discriminated" |
| `exp` | `0x12c` (u32 LE) | **measured** | `xpForLevel(class, level) <= exp < xpForLevel(class, level+1)` (`ruleset/addnd1e/progression.ts`, the 1e PHB cumulative-XP tables) for every active class/level | **6/6 accept** (both class ranges checked for the multiclass record: fighter-7 range `[70000,125000)`, thief-8 range `[70000,110000)`, both contain `exp=100000`) | decoded |

Six raw values per field, in file order (CHRDATA1..6 = Guy de Valois, PAINE, EPONA, MALACHITE,
DOMINIC, MORGAINE):

```
thac0 (raw store byte @0x6a):  47, 47, 47, 46, 44, 41
race  (raw byte @0x6b):         6,  6,  6,  3,  6,  6
class (ClassId @0x6c):          3,  4,  2, 14,  0,  5
extra (raw byte @0x6d):         1,  0,  0,  0,  0,  0
age   (u16 LE @0x6e):          20, 22, 17, 60, 19, 27
hpMax (byte @0x70):            95, 74, 91, 58, 78, 35
baseAc(byte @0x129):         0x32 on all 6
exp   (u32 LE @0x12c):     200000,200000,200000,100000,200000,200000
```

## 2. The `abilities`@`0x10` uniqueness sweep, reproduced

`secretSavedCharacter.test.ts`'s "MEASURED oracle 1/4" case scans every offset `0..427` (a 439-byte
record, 6 pairs = 12 bytes wide, so the last valid base is `439 - 12 = 427`) and, for each, checks
whether all 6 real records show six `(cur, full)` byte pairs with `cur == full`, every value in
`3..18`, and at least one pair varying across the party (excluding the degenerate "same class-shaped
constant on the whole party" false positive the same way `secret_chrdata_sweep.py`'s
"discriminating" filter does for the class/level pair). **Exactly one offset in the whole 428-offset
search space satisfies this: `0x10`.** 427 offsets reject. This is the SAME offset CoAB's own
`ABILITY_OFFSET` uses (`Player.cs:340`) — found independently here, not assumed to have carried
over.

## 3. `thac0` and `exp`: verified against the engine's own AD&D-1e tables, not the plan's numbers

The plan handed over the raw byte readings (`thac0` raw `[47,47,47,46,44,41]`, `exp`
`[200000×5, 100000]`) as **predictions** requiring their own check. This round ran that check
against the engine's own `ruleset/addnd1e` tables (`combatTables.ts`'s `thac0`/`bestThac0`,
`progression.ts`'s `xpForLevel`), not against the plan's assertion that they "should" pass:

- **THAC0**: `0x3C - raw` reproduces `bestThac0()` for the record's own pinned `classLevel` slots on
  **6 of 6** records, including MALACHITE's multiclass case (`min(thac0(fighter,7)=14,
  thac0(thief,8)=19) = 14`, and her stored byte inverts to exactly 14 — not simply matching either
  class alone).
- **exp**: for every active class/level pair, `exp` falls inside `[xpForLevel(level),
  xpForLevel(level+1))` on **6 of 6** records (both ranges checked for MALACHITE's two classes).

Both promote from "prediction" to "measured" by this round's own standard: a check against an
independent, already-in-repo table, not a plausibility read.

## 4. `race`: TRANSLATED (round 34 R3), from Secret's own `START.EXE` string table

Secret's `race` byte reads `[6, 6, 6, 3, 6, 6]`. Round 29/R2 established this is **not** CoAB's
`Race` enum (`COAB_RACE_LABEL`, `coabSavedCharacter.ts` — `human = 7` there, and this sample has no
`7` at all, while `COAB_RACE_TO_DL[6]` and `COAB_RACE_TO_DL[3]` both resolve to `null`, gnome and
half_orc, neither a plausible reading of a six-hero Realms party) and shipped the byte raw,
disclosed, defaulted to human. Round 34/R3 closes that gap by reading Secret's OWN retail binary.

### 4a. What was found, and how

`tools/exepack_unpack.py` unpacks Secret's retail `START.EXE` (EXEPACK v1) into a flat load image.
`tools/secret_race_table.py` then:

1. Locates an **18-entry, 27-byte-stride Pascal-string (`PString`) class-descriptor table** at file
   offset `0xE9AB` by landmark-searching for `b"Cleric"`/`b"Druid"` and cross-checking the derived
   stride against the `b"Fighter"` position. Content: `Cleric, Druid, Fighter, Paladin, Ranger,
   Magic-User, Thief, Monk, Cleric/Fighter, Cleric/Fighter/Magic-User, Cleric/Ranger,
   Cleric/Magic-User, Cleric/Thief, Fighter/Magic-User, Fighter/Thief, Fighter/Magic-User/Thief,
   Magic-User/Thief, Illegal type` — **byte-for-byte CoAB's own `ClassId` enum order**
   (`coabSavedCharacter.ts`'s `COAB_CLASS_LABEL`), independently reproduced inside Secret's OWN
   binary, not merely cited from another title.
2. Locates an **8-entry, 9-byte-stride race table immediately after it**, base `0xEB91` (=
   `0xE9AB + 18*27`, contiguous, not a coincidence of scanning): `Tribble, Elf, Half-Elf, Dwarf,
   Gnome, Halfling, Human, Monster`.
3. Runs a **fencepost null**: shift the located base by every offset `-8..-1, 1..8` and count how
   many of the resulting 8 "entries" still look like plausible short PStrings (length byte `1..15`,
   printable-ASCII payload of that exact length). **Measured: the real base scores 8/8; every one of
   the 16 shifted offsets scores 0/8** — not a near-miss, a clean separation
   (`tools/test_secret_race_table.py`, 8/8 tests pass).

### 4b. What was NOT found — the honest gap

The literal claim "the byte is read and this table is indexed by it" requires quoting the actual
8086 instruction sequence that does the indexing. An extensive, documented static search — MUL/IMUL
(`F6`/`F7`), shift-add constant-multiply idioms, `LEA`-based direct addressing, indirect
jump/call dispatch tables (`FF /4`, `FF /2`), per-entry hardcoded address tables, loop-increment
patterns — found **no candidate instruction sequence** near either table or near the known
`CHRDATA` field offsets. The best candidate segment-match rate measured was **~33.7**, against a
computed **chance-null of ~31.7** (expected coincidental two-byte-pattern matches for 26 patterns
against an ~80KB unpacked image with 65536 possible 16-bit values) — statistically
indistinguishable. This is reported as a genuine gap, not smoothed into "solved": the table's
existence, position and content are **measured**; the code that reads it is **not located**.

### 4c. Why 0-based, Secret's-own-order is the reading used (argued, not proven by the missing code)

Two alternatives were considered and rejected by code/consequence, not by fit:

- **CoAB's own `Race` enum** (already rejected in R2, restated here): `COAB_RACE_LABEL` gives
  `3 = gnome`, `6 = half_orc` — neither has a Dragonlance analog, and this reading was already ruled
  out before this round's table was even found.
- **FRUA's numbering reused directly on Secret's table**: `hackdocs_extracted/CCHFORM.TXT`
  documents FRUA's own CHRDATA race enum as `0=Elf,1=Half-Elf,2=Dwarf,3=Gnome,4=Halfling,5=Human,
  6=Monster` — a **7-entry** list, one shorter than Secret's own 8-entry table, and it is an exact
  match to Secret's own table entries `[1..7]` (`Elf..Monster`) in the same order, with `Tribble`
  prepended as Secret's own extra `[0]`. If FRUA's numbering were reused directly on Secret's raw
  byte with no shift, `3 -> Gnome` and `6 -> Monster` — rejecting the majority-human pregens'
  legality entirely and giving MALACHITE no race at all. This is rejected **by consequence**, not by
  claiming the codegen must differ.
- **A 1-based reading of Secret's own table** (`race - 1` as the index) cannot be excluded by
  storage layout alone (Pascal permits arbitrary array lower bounds), but is argued against on the
  same consequence grounds: it gives `3 -> Half-Elf`, `6 -> Halfling`, which the ruleset also
  accepts as legal, so it is not rejected by a hard rule, only judged less likely because it treats
  entry `[0]` (`Tribble`) as permanently unreachable dead space in a title that names it at all.

The reading actually used — Secret's own table, 0-based, in its own compiled order — is the ONLY
one of the three under which **both** observed raw values (`3`, `6`) land on named, ruleset-legal
Dragonlance races (`Dwarf`, `Human`) with no rejections, matching `hackdocs_extracted/CCHFORM.TXT`'s
independent FRUA precedent as a strict 7-entry subrange in the same order. It is disclosed here as
**argued from consequence and cross-title precedent**, not proven by an indexing instruction.

### 4d. Ruleset legality check (round 34 R3 Bar B)

`3 -> mountainDwarf` and `6 -> human` were checked directly against this engine's own AD&D-1e
Dragonlance ruleset code (`ruleset/addnd1e-dragonlance/classes.ts`), not merely asserted plausible:
`isMultiClassAllowed('mountainDwarf')` is `true` (non-humans may multi-class), `allowsClass
('mountainDwarf', 'fighter')` and `allowsClass('mountainDwarf', 'thief')` are both `true`, and
`dqkMaxLevel('mountainDwarf', 'thief')` is exactly `8` — MALACHITE's stored thief level, at the cap,
not over it. `isMultiClassAllowed('human')` is `false`, but the five human pregens are all
single-class, so this does not reject them. Verified live end-to-end (not just at the ruleset-table
level): running `importSecretParty()` against the six real records now imports **6 of 6**, zero
rejections, zero substitutions for any hero — MALACHITE included, as `mountainDwarf` `fighter 7 /
thief 8` (`classes: {fighter: 7, thief: 8}`), `exp: 100000` unchanged.

Every imported hero therefore now resolves through {@link SECRET_RACE_TO_DL}
(`importSecretParty.ts`, a mapping private to that file, NOT CoAB's `COAB_RACE_TO_DL` — the two
share no numbering). A raw value with no Dragonlance analog (Tribble/Gnome/Halfling/Monster) still
falls back to `race: 'human'`, disclosed exactly as before; neither of the two values Secret's own
six pregens actually carry needs that fallback any more.

## 5. What is (and is not) claimed

**Claimed, independently oracled this round:**
- `name`, `abilities` (6 core pairs), `class`/`classLabel`, `classLevel[8]`, `thac0`, `exp` — each
  has its own accept/reject count above, reproduced against the retail bytes (not cited from the
  plan or the R3 doc without re-running the check).
- `race` (round 34 R3) — table existence/position/content measured and re-derivable
  (`tools/secret_race_table.py`, fencepost-null separation 8/8 vs 0/16), cross-checked against a
  second independent source (`hackdocs_extracted/CCHFORM.TXT`'s FRUA enum) and against this
  engine's own ruleset legality code (§4d). The one thing NOT claimed: the indexing instruction
  itself was not located (§4b) — carried as an explicit, disclosed gap, not smoothed over.
- The `class`/`classLevel` oracle applied to Curse's own 422-byte records (a different title)
  accepts **0/6** — Secret's offsets are not coincidentally valid everywhere
  (`secretSavedCharacter.test.ts`'s cross-title null, both with the real 439-byte length guard AND,
  separately, with that guard bypassed via a synthetic 422-byte layout variant, to prove the guard
  alone wasn't doing the rejecting).

**Carried at reduced confidence, not silently treated as verified:**
- `hpMax` — passes only a weak, non-discriminating bound.
- `age` — a single cross-field correlation, not a verified table.
- `baseAc` — convention-matched to CoAB's own constant, not independently discriminated (it cannot
  vary across the party, so the uniqueness-sweep technique cannot locate it the way it located
  `abilities`/`class`).
- `str00` — corroborating (`cur==full` on 6/6, plausible 1e notation) but outside the range filter
  that made `abilities`'s offset unique.

**Not claimed at all — carried raw, never named:**
- the byte at `class - 1` (`0x6d`) — no hypothesis survived contact with the 6-record party.
- `sex`, `alignment`, spellbook, equipment, thief skills, or saving throws — none decoded this or
  any prior round.

**Retracted from nothing** — this round did not have to walk back a prior claim; every field above
either passed its own new check or was demoted to "predicted"/"raw" per the plan's own request.

## 6. Mutation test (reported in full in the R2 handoff)

Setting the layout's `class` offset from `0x6c` to `0x6b` and rerunning
`secretSavedCharacter.test.ts` turns 3 tests red: the synthetic golden-field test (`classCode`
mismatch, `expected 6 to be 3`), the real-pregen golden test (same), and the "MEASURED oracle 4/4"
consistency-oracle test (`expected +0 to be 6` — the oracle collapses to 0/6 accept, exactly the
`0x6b` shifted-offset number in the table above). Restoring `0x6c` returns the suite to 12/12 green.
