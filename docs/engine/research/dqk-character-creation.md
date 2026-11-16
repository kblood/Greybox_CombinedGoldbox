# DQK character creation and progression grounding

Task 7 remains open. This records original executable and held-file evidence
needed to replace the native creator's current CoK/DoK defaults. The rules
checker added here does not implement native DQK creation or QSV writeback.

## Sources and record bases

| Held file | SHA-256 |
| --- | --- |
| `The Dark Queen of Krynn/DQK.EXE` | `6b0a9ac5c873997087f1f3f626334a71092fe7c8d1e92ce7f72869a59931f837` |
| `The Dark Queen of Krynn/Journal.pdf` | `7b67f41be2dd934aa6be2ab8d2d9f654a34eeeb23459467ee9292911acd46c18` |
| `The Dark Queen of Krynn/Manual.pdf` | `7732dc5d0a747d27a2f455d9eb543489e12075354b41b65a62eb874b67b5c8ac` |
| `The Dark Queen of Krynn/SAVE/SAVGAMA.QSV` | `8b657e4af9aa692e14c3720a56349ec63cc695aa8230531563c713fe7f3e0172` |

The Journal's PDF page 6 (printed pages 9–10) specifies 1,000,001 starting
XP and describes most single-class characters as approximately level 12.
Multiclass XP is divided among the classes, including capped classes. This
does not specify identical starting levels, fixed HP, or starting spells.
PDF page 5 describes averaged multiclass HP and initial knight equipment;
PDF page 27 gives distinct racial caps. Some printed XP ranges on PDF pages
30–32 are ambiguous even in the page images. Use the executable's tables
and code for exact boundaries.

All executable offsets below are raw file offsets. All character offsets
refer to the **full physical record**, whose name begins at `+0x68`.
CCPARTY's import view begins eight bytes inside it, so its name is at `+0x60`
and XP at `+0x3c`. The physical record has XP at `+0x44`, race word at
`+0x58`, class word at `+0x5a`, and current class levels at `+0xa5..0xab`.
The older XP-offset error is corrected in
[the opcode-0x41 analysis](decompile-dqk-ecl-dispatch.md).

## Located training helpers

The original opcode-0x41 handler calls `77e:1fe5` at file `0x42ac2`.
That readiness routine occupies `0xbbc5..0xbcad`. It walks seven positive
class levels below 40, obtains a next-level threshold through `1d99:0f6d`,
compares the signed 32-bit XP, and checks a race/class limit. It returns
true when any eligible class can advance. It does not perform training.

The threshold thunk resolves to overlay 11, file `0x62b8c..0x62c2b`.
It first calls category helper `77e:1f39`, file `0xbb19..0xbbc4`.
The seven-word jump table at `0xbb33` resolves these class slots:

| Slot | Class | XP row | Additional selector |
| --- | --- | --- | --- |
| 0 | Cleric | 0 or 1 | signed deity word `+0x19b <= 4` selects 0 |
| 1 | Knight | 3, 4, or 5 | order byte `+0x19a` is 1, 2, or 3 |
| 2 | Fighter | 2 | none |
| 3 | Paladin | 10 | none |
| 4 | Ranger | 6 | none |
| 5 | Mage | 7 or 8 | robe byte `+0x19d == 1` selects 7 |
| 6 | Thief | 9 | none |

The helper leaves its local return value uninitialized for an invalid knight
order or class slot. The checker rejects those inputs rather than assigning
a meaning to the original stack contents.

DGROUP's loaded bytes begin at file `0x63a20`, as established by the original
overlay loader. For requested levels 2–17, thresholds are little-endian u32
values at `DS:0852 + row*0x4c + level*4`. For levels 18–40 the helper returns
`row[17] + (level-17)*increment[row]`; increments begin at `DS:028c`.
Byte levels 41–255 return `0x7fffffff`. The checker does not interpret table
columns 0 and 1 as creation defaults.

Race/class caps begin at `DS:17dc`, seven bytes per race. Human Knight has a
cap of 18 in that table. The readiness routine bypasses the race table for
order-3 (Rose) knights, while retaining its level-below-40 guard. Preserve
that branch when deriving eligibility.

At 1,000,001 XP, the table permits Fighter 12, Paladin 10, Ranger 12,
Thief 14, good Cleric 12, neutral Cleric 11, and either Mage robe 12 before
racial caps. These are threshold-derived values, not proof that every
creation branch has been exercised.

## Reusable checker

`tools/dqk_character_rules.py` verifies the three original helper code spans,
reads the held tables, and inspects a full physical character record without
modifying it. Example for the shipped party leader:

```powershell
python tools/dqk_character_rules.py `
  --record "The Dark Queen of Krynn/SAVE/SAVGAMA.QSV" --offset 0x40f
```

The six shipped records begin at `0x40f,0x60b,0x821,0xa50,0xc5e,0xe7c`.
Their XP values are `1000001,500000,333333,500000,500000,500000`.
All six fail the training-readiness predicate and carry zero at `+0xcd`,
agreeing with their persisted status. This is a held-save cross-check;
creation, training, and persistence need their own runtime evidence.

The focused tests cover the actual jump-table ordering, code/data anchors,
both cleric rows and mage robes, all knight orders, threshold boundaries,
signed XP, racial caps, the Rose exception, multiclass readiness, record-base
arithmetic, and invalid inputs. Mutating a supplied table value changes the
computed result, proving the checker reads its supplied executable.

### Execution of the original helpers — 2026-10-02

An independent Unicorn real-mode harness executed the original category,
threshold, readiness, and resident long-multiply bodies: 12 category cases,
66 threshold cases across all eleven categories, 311 readiness/racial-cap
cases, eight knight controls, and all six shipped QSV members. Results agreed
with both direct DGROUP table calculations and the checker. Readiness left
every supplied record byte-identical; 22 threshold cases ran the original
long-multiply routine.

The harness applies MZ relocations, loads overlay 11, fixes the two external
segments used by the threshold body, and substitutes a far jump for the FBOV
loading thunk. It does not replace the helper calculations. This is isolated
helper execution, not a DOSBox training interaction.

External evidence: `C:\temp\GoldBox-dqk-creation-20261002\offline-original`.
The verifier script SHA-256 is
`4666edeeeed0613794e443f00827eb79969f40667cb138ce7f97a4b5968ee27f`;
the result JSON SHA-256 is
`7504aa4d9835169b702fcdf77846829e8ffd75eb5b0a895343016e319a990602`.
The script filename is `verify_original_xp.py`, and its JSON output is
`verify_original_xp.out.txt`; `README.txt` describes the loader substitutions.

## Creation source lead

Overlay-5 function `25a4:220a`, file `0x3c6ca..0x3c7c5`, calls the race
routine at `0x3bcf9`, writes `0x000f4241` into the global character's
`+0x44/+0x46`, then calls the class initializer at `0x3b27f`.
That initializer dispatches on class word `+0x5a` and initializes active
class slots; some branches modify XP and add special effects. The outer
function conditionally calls `1d99:1459` when the thief level at `+0xab`
is nonzero, derives other fields, and calls `1d99:144f` before returning.
The UI builder passes `CS:220a` at file `0x3d3b4..0x3d3b8` before its call
to `1aa6:1294`. The precise menu callback dispatch, HP generation, and helper
semantics remain under investigation. This located XP store is separate from the identical constant
at file `0x6433a`, which is Fighter level 12's table threshold.

### Overlay-5 base correction

The old mapper used `0x3a832`, a later function prologue, as the code start.
Two CS-relative jump tables independently establish file base `0x3a4c0`:
the table at `0x3b29a` is addressed as `CS:0dda`, and the table at `0x3b41e`
as `CS:0f5e`. Both subtract to the same paragraph. The corrected prefix is
`0x4e0` from overlay blob `0x39fe0`. This makes the creator offset `0x220a`,
not the earlier provisional `0x1e9a`, and locates the UI callback above.
The disassembler, RTLink mapper, and overlay carver now agree on that base.

Luna's original-game `fighter-preconfirm-ram.bin` independently corroborates
it: the creator signature appears uniquely at linear `0x2fe8a`, giving
`2dc8:220a`. The original XP matrix appears uniquely at linear `0x3ad72`,
giving DGROUP `3a52:0000`; both segments differ from their canonical values
by `0x824`. `DS:c757` points to the current character at `3a52:fddc`
(linear `0x4a2fc`). The 417-byte memory capture has an empty name, Fighter
level 12, XP 1,000,001, and 83 at both HP fields. The screenshot agrees, including
83/83 displayed HP. This single roll does not establish an HP formula.

Evidence is outside Git under
`C:\temp\GoldBox-dqk-creation-20261002\retail-runtime\session`:

- `fighter-preconfirm-ram.bin`, SHA-256
  `f12965c74cfd2d1c63e625b4897248bafe560dc6ed088bccc10f919959962267`.
- `fighter-preconfirm-record.bin`, SHA-256
  `a3c34057f5311922e891af5e1ee225b886f3192ec66d581f95df40e2197b4c14`.
- `fighter-preconfirm-record-mapping.json` records the extraction addresses;
  `fighter-preconfirm.png` is the corresponding stats screen.

This capture precedes name/icon confirmation. It is not saved-character or
cold-reload evidence.

### Saved character and cold reload — 2026-10-02

A separate original-game replay created LUNA, a male Human Fighter, age 27,
level 12, XP 1,000,001, HP 74/74. The visible creation, name, icon, and save
steps produced `SAVE/LUNA.QCH`. The Add Character / TDQK route added LUNA;
the game then entered Palanthas and saved slot A from the Inn. After ending
that DOSBox process, a fresh hidden GameLink session loaded TDQK slot A.
The character view retained the same name, class, level, XP, and HP.

The QCH is 499 bytes, with five inventory entries: `414 + 5*17`.
Do not apply the QSV variable-tail formula to this QCH or generalize this
one record into an affect-list writer. The QSV has a one-member header and
LUNA at physical offset `0x40f`; both records agree with the checker and
have next Fighter threshold 1,250,001, with readiness false.

All evidence remains outside Git under
`C:\temp\GoldBox-dqk-creation-20261002\retail-runtime`:

| Artifact | SHA-256 |
| --- | --- |
| `evidence/LUNA.QCH` | `34728121870edc5a7b8d6e399247039d5cb5d16604bdf5183a16d92941b74dda` |
| `evidence/SAVGAMA.QSV` | `aded18d3683dbc2613fcb4e2e3f7c30293c47727dc56d833a5ac7aeeeab9bc79` |
| `replay/cold-load/view-luna.png` | `5661521c5fc1da6b1be5b55de6aa68df109e37b561c112c819f358ce221677b7` |
| `source-manifest.json` | `2a8d138081a05a92c2132b29acf559d073edaf94268634dfe821ff67df9b7f15` |

The recorded 880 retail source files all retain their sizes and hashes.
The owned runtime processes were stopped after capture. This proves the
original title's creation/save/reload route, not native Greybox parity.

### HP field semantics

The original healing writer at file `0x500ea..0x50100` adds its amount to
physical `+0x198`, compares the result with `+0x89`, and clamps `+0x198`
to that ceiling. This identifies current HP at `+0x198` and maximum HP at
`+0x89`; equal full-health values alone would not distinguish them.
The creation UI recalculation at `0x3e172..0x3e25d` accumulates the
class-specific contribution returned by `77e:20ce`, averages it over active
classes, and subtracts it from maximum HP into `+0xc0`. This does not yet
identify the original initial-HP dice path.

The first-level roll is now located separately. File `0x3bf50` resets active
class levels to one; `0x3c0d0..0x3c28c` counts the active classes, and
`0x3c295..0x3c2a1` clears maximum HP, base HP, and current HP.
Call `1d99:143b` at `0x3c2b4` resolves to overlay 11 file `0x603be`,
with record, class mask `0xff`, active-class divisor, and mode 1 arguments.
Below each class's dice cutoff, it rolls twice and keeps the larger total.
First-level dice counts from `DS:6411` are `1,2,1,1,2,1,1`; sides from
`DS:6418` are `8,10,10,10,8,4,6`, in the seven-slot order above.
It averages the rolled and class-adjustment aggregates separately, adds to
maximum HP, and preserves missing HP when updating current HP. The later
progression is driven by the creation loop described below; these static
anchors alone do not reproduce either captured random HP total.

An offline Unicorn probe now executes this original HP helper, the original
`048f:1968` dice wrapper, category helper, and CON helper at file `0x6060b`.
It applies loader relocations and substitutes only the raw RNG return at
`0df9:044d`, using declared values from zero through sides minus one.
Eight bounded cases pass: Fighter levels 1 and 9 keep 10 from d10 results
1 and 10; levels 10 and 12 take the fixed gain of 3 without RNG calls;
CON 18 raises the first-level gain to 14. A wounded Fighter changes from
maximum/current 50/40 to 60/50. Slot 4 rolls two d8 twice and keeps the
larger sum, 9; a synthetic slot-2/slot-4 case averages contributions 10
and 4 to 7. Only physical fields `+0x89`, `+0xc0`, and `+0x198` change.
These checks establish helper arithmetic and dice requests, not the original
RNG sequence, legality of the synthetic class combination, or full creation.
The external evidence is under
`C:\temp\GoldBox-dqk-creation-20261002\offline-hp`:
`verify_original_hp.py` SHA-256
`c713af94b91dae296d7b5a1879d5afcb4b9461ce83f60c1c2fe9e834424c2c9c`,
and `hp-helper-results.json` SHA-256
`f3386674a5a9668d99319bb007107b247f9ff5e7c24acd11f3723a8af85a6b8f`.

The call at `0x3c2e5` to `2aa7:0022` resolves to overlay 5 file `0x3f512`.
This is the leveling routine, not a generic UI tick. It selects eligible
class slots using XP thresholds and caps, increments them at `0x3face`,
calls the same HP helper at `0x3fd42`, then updates readiness through
`77e:1fe5` at `0x3fd52`. The caller repeats until `DS:b183` becomes nonzero;
the no-eligible-class path sets that flag at `0x3f8e0`. Creation enables
`DS:a6b4` through `bdb:21d2` before the loop and resets it afterward.
The accessor `bdb:21dd` is file `0x1038d`; this mode suppresses training
prompts and the XP clamp at `0x3f875..0x3f8a4`. Thus the initial HP roll is
followed by repeated XP-driven grants, explaining why a level-one formula
alone cannot implement the original creator.

The native importer at `0e3b062e` read physical `+0x89` into both HP fields;
its 300-byte test projections omitted `+0x198`. The 2026-10-02 repair reads
the two unsigned bytes separately and preserves zero HP. Its runtime tests
now use complete field spans, injured/zero-HP QSV and QCH controls, unsigned
200/220 HP, cold reload, and preservation of prior flagged combat metadata.
Opened QCH files shorter than 414 bytes reject before output truncation,
including when a valid first file has already filled the shared input buffer.
The complete party harness passes 161 preservation/source/HP checks and its
existing creation and combat branches. Zero HP is not assigned a new
death/condition enum; broader DQK status mapping remains open.

## Native work still required

**Superseded 2026-10-07 for the argument path:** `CCPARTY /Q /C <name> <class>` now creates a
character (see "Native creation, 2026-10-07" at the end of this file). The sentence below saying
CCPARTY rejects both creation paths is true only of the interactive `/Q /M` menu `C` choice, which
is unchanged. Retained as history.

GBBOOT's DQK create loop currently sends `/G`, which owns DoK records and
identity. Before the menu-input repair, CCPARTY `/Q /C` silently bypassed
argument creation and `/Q /M` creation fell through CoK defaults, omitting
derived compact metadata. CCPARTY now rejects both creation paths explicitly,
while preserving Begin for imported DQK parties. These guards prevent invalid
records; they do not implement creation. Changing GBBOOT's command or header
alone would still not produce a DQK character.

The current DQK GBPR projection stores a name and derived combat metadata.
It does not preserve the complete original XP/class, inventory, or spell
state. Define title-owned durable state and its relationship to this combat
projection, then implement creation, training, combat/rest persistence, and
cold reload. Retain the existing six-member bound, unused native IDs,
imported/native roster preservation, and rejection before output truncation.
DoK `/G` and its XP cache remain a separate format contract.

## Native creation, 2026-10-07 (Task 7)

Everything here is reproduced by `tools/dqk_character_rules.py` (`create_record`, `hp_helper`,
`con_bonus`, `asm_tables`) and by `native/src/dqkcreate.inc`; `native/ccparty-test.ps1` requires the
two to agree on all 414 bytes.

### Retail rules decoded (from `DQK.EXE`; anchors hashed in `CODE_ANCHORS`)

* **Start state.** XP 1,000,001 (+0x44); race word +0x58 (0 Silvanesti, 1 Qualinesti, 2 half-elf,
  3 hill dwarf, 4 mountain dwarf, 5 kender, 6 human); class word +0x5A equal to the class slot; level 1
  in +0xA5+slot; size byte +0xC6 (1 for dwarves and kender, 2 otherwise; `25a4:1839`).
* **First-level HP helper** (overlay 11 `143b`, file `0x603be`, grant mode 1). For each active class
  selected by the mask: below the cutoff level (`DS:640a` = 10,10,10,10,11,12,11) roll the class dice
  twice and keep the larger total (dice count `DS:6411` = 1,2,1,1,2,1,1 at level 1, else one die; sides
  `DS:6418` = 8,10,10,10,8,4,6) and add the CON adjustment (`2b3a:3a5b`, table `DS:082d`, plus the
  warrior bonus table at `CS:3aab` for slots 1..4 with CON 17..25) once per die. At or above the cutoff
  it does NOT roll: it **assigns** (not adds) a fixed gain chosen by category (`CS:38f8` =
  1,1,3,2,2,2,2,1,1,2,3), so a multiclass character loses earlier rolled HP in that pass. Totals are
  unsigned bytes, sums are divided by the number of active classes (unsigned `div`, rolled part floored
  at 1), `+0xC0` (rolled) and `+0x89` (maximum) wrap modulo 256 and `+0x198` (current) becomes maximum
  minus the previous deficit. A negative CON adjustment (CON 3..6 reads 254/255) is added as 254/255,
  which is what the executed original does; model and native engine replicate it. Eight cases executed by
  the original code in an offline Unicorn run (`offline-hp/hp-helper-results.json`) are pinned in the
  Python tests.
* **Levelling loop** (`3c2e5` -> `2aa7:0022` = file `0x3f512`). Repeatedly selects every class whose
  racial cap (`DS:17dc`; knight order 3 bypasses it) exceeds its level and whose next-level threshold
  (`DS:0852`, row by category) is at most the XP, raises all selected classes together, and calls the HP
  helper with that mask. From 1,000,001 XP this ends at fighter/knight/cleric/mage/ranger 12 and thief 14,
  lower by race (kender fighter 5, half-elf fighter 9, Silvanesti fighter 10). Level 18+ is unreachable
  from the starting XP (every category's level-17 threshold is above it);
  `test_native_levelling_shortcut_is_sound` pins this, which is why the native table stops at level 17.
* **Structural check against retail.** Retail LUNA (human fighter, CON 15) has level 12, rolled +0xC0 = 65
  and maximum +0x89 = 74. The model gives `max - rolled = 9` for ANY dice (nine rolled levels with CON +1
  each, three fixed levels), matching the retail bytes.

### What the native engine does

`CCPARTY /Q /C <name> <class> [/R race] [/N con] [/D dicefile] <out.gbpr>` (the output name must be
last). Class letters C K F R M T = cleric, knight, fighter, ranger, mage, thief; race 0..6 (default 6);
CON 0..25 (default 15); the name is 3..8 letters because it becomes the DOS file name and must satisfy
the importer's letters-only rule. It builds the 414-byte record at `qsvbuf`, runs the importer's own
acceptance test, writes `SAVE\<NAME>.QCH` (414 bytes), and projects the record into a native GBPR row
(slot 80h..85h, title id 3, version 2) through the existing `build_dqk_qsv_member`, so a cold reload of
the same QCH through the importer yields a byte-identical row body. A full six-member party, an unknown
class, a race that cannot advance in the class (kender knight), a bad option or an unreadable dice file
all exit nonzero before the roster or the QCH is opened.

### Limits

* **The native RNG sequence is not the retail one.** The retail generator and its seeding were not
  reproduced. Dice come from `/D <file>` (raw value = next byte mod sides, cyclic, the same stream the
  Python model uses) or, with no file, a 16-bit LCG seeded from the BIOS tick. Equality with the model
  proves the RULES (tables, byte arithmetic, XP loop, caps), not that a retail seed would give the same
  character.
* Not modelled or written: spells, equipment and inventory, saving throws, thief skills, race ability
  adjustments and ability-score rolling (defaults 14,14,14,14,15,14 with `/N` overriding CON; a native
  default, not a retail rule), cleric deity (0), multiclass creation, paladins, the 499-byte retail QCH
  tail (the file is 414 bytes), base movement (+0x90 = 12 for every race; LUNA is 12) and the unexplained
  +0x8A..+0x8F bytes.
* Live menu wiring is out of scope: the interactive `CCPARTY /Q /M` `C` choice and GBBOOT's DQK create
  loop still report creation unavailable.
* `tools/test_native_gbpr_identity.py::test_dqk_creation_rejects_before_output_and_preserves_imported_begin`
  pins the previous startup shape and needs updating by its owner.
