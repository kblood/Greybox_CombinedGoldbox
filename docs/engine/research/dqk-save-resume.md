# DQK Save-Game Resume Path (E6.2b-2)

**Scope:** How does DQK load a saved game and resume a specific ECL area? What fields
control resume behaviour, what does an uninitiated save actually do, how is the roster
populated from disk, and what is the minimum recipe to author a save that resumes at a
chosen area?

**Primary sources:**
- `coab_extracted/engine/ovr017.cs` `loadSaveGame()` — the Gold Box Gen1 Rosetta Stone
  for the save-load routine.
- `coab_extracted/engine/ovr018.cs` `startGameMenu()` — front-menu dispatch.
- `coab_extracted/engine/ovr003.cs` `sub_29758()` — post-menu engine entry.
- `coab_extracted/Classes/Area1.cs` — `area_ptr` struct definition with `DataOffset`
  annotations.
- `hackdocs_extracted/SAVGAM.TXT` (David Knott) — flat-binary format for Gold Box saves.
- `hackdocs_extracted/CCHFORM.TXT` — CCH character record internal layout.
- `hackdocs_extracted/VAULT.TXT` — VAULTA.DAT vault format.
- `The Dark Queen of Krynn/SAVGAMA.QSV` (7965 bytes) — real shipped DQK save, verified
  byte by byte.
- `docs/engine/research/dqk-newgame-entry.md` — E6.1 findings (front-menu gates,
  `sub_29758`, ECL.GLB area 1).
- `docs/engine/research/dqk-save-format.md` — E6.2a findings (global header offsets).

---

## Critical discovery: DQK QSV format vs COAB binary format

**The DQK `.QSV` does NOT use the COAB binary struct format.** These are two distinct
save layouts:

| Aspect | COAB Gen1 binary format | DQK Gen2 flat format |
|---|---|---|
| File extension | `.dat` (SAVGAMA.DAT) | `.qsv` (SAVGAMA.QSV) |
| Area state | `gbl.area_ptr` (Area1 struct, 0x800 bytes at offset 1) | Flat byte array per SAVGAM.TXT |
| Character records | Separate `.sav` files (loaded by name from save file) | Embedded inline in QSV at offset 1039 |
| Total file size | ~13149 bytes for 6 PCs (COAB) | 7965 bytes (DQK shipped) |
| Resume field | `area_ptr.LastEclBlockId` at struct offset 0x1E4 | `CurrentModule` @18 (SAVGAM.TXT offset 18) |

DQK strings at file offset `0x69a33` in DQK.EXE include the patterns `chrdat%c` /
`savgama` / `.pty` / `gam.qsv` / `Vault%c`, confirming the Gen2 engine uses `.QSV`
and `.PTY`-family saves (not `.dat` / `.guy` / `.sav`). The COAB oracle's
`loadSaveGame()` is **structural reference, not literal code** for DQK.

---

## Question 1 — Which field drives resume area, and how does Current Module map to ECL.GLB

**Verdict (COAB oracle + SAVGAM.TXT + real bytes):**

`SAVGAM.TXT` offset **18** (`Current Module`, 1 byte) is the resume-area field in the
DQK flat save. It maps directly to the ECL block ID:

| SAVGAM.TXT value | Meaning | COAB equivalent |
|---|---|---|
| 0 | uninitiated / no game in progress | `LastEclBlockId == 0` |
| 1–4 | overland module | `LastEclBlockId 1–4` (ECL.GLB areas 1–4) |
| 5–40+ | dungeon modules | `LastEclBlockId 5+` (ECL.GLB areas 5+) |

**Evidence — COAB oracle:** `Area1.cs` declares
```csharp
[DataOffset(0x1E4, DataType.Word)]
public ushort LastEclBlockId;
```
`sub_29758()` (`ovr003.cs` line 2243) reads this field:
```csharp
if (gbl.area_ptr.LastEclBlockId == 0)
    gbl.EclBlockId = 1;          // fresh game → ECL area 1
else
    gbl.EclBlockId = (byte)(gbl.area_ptr.LastEclBlockId);  // resume
```
In the COAB binary format `LastEclBlockId` lives at area_ptr struct offset 0x1E4 →
file offset `1 + 0x1E4 = 0x1E5` (485 decimal). In the DQK flat format this corresponds
to SAVGAM.TXT offset 18 (`Current Module`).

**Evidence — real bytes:** The shipped DQK `SAVGAMA.QSV` (7965 bytes) reads:
`data[18] = 0` (Current Module = 0, uninitiated). All 1024-block init flags
@1031/@1033/@1034/@1035/@1036 = 0. Consistent with an "assembled but not adventuring" save.

**Gen2 `CurrentModule` → ECL.GLB mapping:** value N at offset 18 causes the engine to
load `ECL.GLB` member for area N. From `dqk-newgame-entry.md`: `ECL.GLB` has 47 area
entries; area 1 = overland (no GEO map); areas 2+ = dungeons with matching `GEO.GLB`
entries. The module values 1–4 in SAVGAM.TXT correspond to the four overland scripts;
5+ correspond to dungeon areas. **(inferred for DQK from COAB oracle; verified DQK ECL
layout independently in E6.1.)**

---

## Question 2 — What does "Load Saved Game" do with an uninitiated save?

**Verdict (COAB oracle, confirmed against DQK structure):**

"Load Saved Game" (`loadSaveGame()`) operates in two phases:

### Phase 1 — File load + roster population

`ovr017.cs loadSaveGame()` (lines 976–1103, COAB oracle):
1. Reads the save file (game state + character names).
2. For each character name in the file, loads the corresponding character record from
   `SAVE/<name>.sav`.
3. Sets `gbl.SelectedPlayer = gbl.TeamList[0]` — the first character becomes the
   selected/active player.
4. Forces `gbl.game_state = GameState.StartGameMenu`.
5. Sets `gbl.reload_ecl_and_pictures = true`.
6. Returns to the `startGameMenu()` loop.

**After loading, the roster IS populated** (`gbl.TeamList` contains all party members,
`gbl.SelectedPlayer != null`). This sets `menuFlags[allow_begin] = true` and disables
`allow_load` (per `ovr018.cs` lines 100–101).

**In DQK's flat format:** The QSV embeds character data inline starting at offset 1039
(not as separate `.sav` files). The DQK engine's equivalent load routine reads them
from the QSV itself. **(inferred)** The roster is populated from the QSV's embedded
CCH records.

### Phase 2 — "BEGIN Adventuring" → sub_29758

When the user presses **B** after loading, `sub_29758()` runs (post-menu call,
`seg001.cs` line 150). With an uninitiated save (`CurrentModule @18 = 0`,
`LastEclBlockId == 0` in COAB terms):
```csharp
if (gbl.area_ptr.LastEclBlockId == 0)    // TRUE for uninitiated save
{
    gbl.byte_1EE98 = false;
    gbl.EclBlockId = 1;                  // hardcoded → ECL.GLB area 1
    ovr025.PartySummary(gbl.SelectedPlayer);  // shows party roster screen
}
```
**Effect for an uninitiated DQK save:** The engine loads ECL.GLB area 1 (the DQK
overland) and shows the PartySummary screen. This is functionally identical to "Begin
Adventuring" on a fresh game — the player sees the party roster, then enters the
overland. **It does NOT refuse, and does NOT drop back to party-assembly.** It is
exactly the fresh-start path.

**What the init flags gate (@1031–1036):** These are checked by the ECL scripts
themselves (not by the engine load path) to determine whether certain first-time setup
events have already fired. For `ECL.GLB` area 1 (overland entry), the first three
instructions are:
```
0x8014: SAVE IMM(1) → MEM[1:1600]   // set overland mode flag
0x801A: SAVE IMM(0) → MEM[1:1A00]   // clear encounter counter
0x8020: LOAD_FILES  IMM(2) IMM(1) VAR(9,h=0)  // load overland assets
```
The init flags at 1031/1033–1036 are set by the ECL script during the first "Begin
Adventuring" pass. **For the DOSBox capture purpose**, having these at 0 (uninitiated)
is fine — the engine follows the fresh-start path through area 1.

---

## Question 3 — How is the roster populated; does loading a save enable "Begin Adventuring"?

**Verdict (COAB oracle ovr017.cs + ovr018.cs):**

**Yes, loading a save directly populates the roster and enables "Begin Adventuring."**

The mechanism in COAB `loadSaveGame()` (lines 1037–1070):
```csharp
for (int index = 0; index < number_of_players; index++)
{
    string name = ...; // from save's embedded name list
    if (file_find(save_path + name + ".sav"))
    {
        Player player = new Player();
        import_char01(ref player, name + ".sav");
        AssignPlayerIconId(player);
    }
}
// ...
gbl.SelectedPlayer = gbl.TeamList[0];   // roster now non-null
gbl.game_state = GameState.StartGameMenu;
```
After `loadSaveGame()` returns, `startGameMenu()` redraws the menu. Because
`gbl.SelectedPlayer != null`, the flag recalculation at lines 80–101 fires:
```csharp
menuFlags[allow_load]  = false;   // "Load Saved Game" goes GREY
menuFlags[allow_begin] = true;    // "Begin Adventuring" goes ACTIVE
```

**For DQK specifically:** DQK embeds character records inline in the QSV (no separate
`.sav` files). The DQK load routine reads them from the QSV. The roster population
mechanism is equivalent. The shipped `SAVGAMA.QSV` has `Party Size @31 = 6` and 6
embedded character records starting at offset 1039, making "Begin Adventuring" selectable
as soon as that save is loaded.

**VAULTA.DAT (866 bytes) is NOT the party roster.** Per `VAULT.TXT`:
it contains the character vault (stored characters, PP/gems/jewels + 50 item records).
It is loaded separately via "Add Character to Party," not via "Load Saved Game."
The party roster comes entirely from the QSV file.

---

## Question 4 — Minimal field recipe to author a resume-into-area-N save

### What the DQK engine actually checks

From the COAB oracle and SAVGAM.TXT, the engine checks these fields in order:

1. **`party_count` / embedded char records:** if 0, `gbl.TeamList` stays empty,
   `gbl.SelectedPlayer = null` → `allow_begin = false`. Save is unusable.
2. **`area_ptr.LastEclBlockId` / `CurrentModule @18`:** if 0 → fresh-start path
   (`EclBlockId = 1`); if N > 0 → resume at area N.
3. **`area_ptr.inDungeon`** (COAB offset 0x1CC in area_ptr struct): 0 = wilderness,
   non-zero = dungeon. Controls `game_state` assignment in `sub_29758`.
4. **`reload_ecl_and_pictures`:** always `true` after `loadSaveGame()`. Forces
   `load_ecl_dax(EclBlockId)` regardless.

### The recipe (DQK flat QSV format, SAVGAM.TXT offsets)

To author a QSV that resumes at ECL area N:

| QSV offset | Field | Value | Reason |
|---|---|---|---|
| **18** | `CurrentModule` / context byte | **N** (e.g. 16 for CoK overland) | Saved area/resource context; 0 = fresh-start |
| **21** | Loaded-save ECL member selector | **N** for the target member | Copied to current-record `+0x16`, then `[ae63]`, then passed to the `ECL1` member loader |
| **31** | `Party Size` | **≥ 1** (e.g. 6) | `allow_begin` gate |
| **1024** | `Party Column` | target col | Map position |
| **1025** | `Party Row` | target row | Map position |
| **1026** | `Facing Direction` | 0–7 | |
| **1029** | low byte of the `DS:ae67` word | **4** | 4 in every retail save that has one — see the 2026-08-22 correction below |
| **1031** | low byte of the `DS:ae57` word | **2** | Required for initiated state |
| **1033** | low byte of the `DS:ca03` word | **4** | Area-dependent in retail (1/4/5); 4 is the commonest |
| **1034** | high byte of the `DS:ca03` word | **0** | 0 in every retail DQK save |
| **1035** | low byte of the `DS:ca05` word | **0** | 0 in every retail DQK save |
| **1036** | high byte of the `DS:ca05` word | **0** | 0 in every retail DQK save |
| **1037** | `Party Size 2` | same as @31 | Redundant copy |
| **1039+** | Character records | ≥ 1 valid CCH record | Roster |

**Source for init flag values:** retail DQK saves (see the 2026-08-22 correction below).
`SAVGAM.TXT` §Init flags was the original source and gave a different, wrong set. The exact
trigger mechanism is in ECL scripts, not the engine load path.

### Practical authoring approach (for DOSBox capture)

The **simplest safe recipe** for E6.2b's "capture in-game map" goal:

1. **Copy the shipped `SAVGAMA.QSV` as base** (has 6 valid CCH records, correct structure).
2. **Patch byte @18** from `0x00` to the target area ID (e.g. `0x01` for DQK overland,
   or `0x10` for CoK overland area 16 if the ported GLB uses that block ID).
3. **Patch byte @21** from `0x00` to the target ECL member id. For a same-numbered
   DQK target area this usually matches `@18`; for area 58 it must be `0x3a`, not `0x04`.
4. **Patch bytes @1029, @1031, @1033-@1036** to their initiated values
   (4, 2, 4, 0, 0, 0 respectively — NOT the Gen1 `3, 2, 240, 254, 240, 254`).
5. **For movement/SearchLocation probes only**, also stage the pose mirrors:
   `@36/@37 = x/y` for the current-record coordinate mirror and `@1024/@1025/@1026 = x/y/facing`
   for the flat active-pose bytes copied into `c9f0/c9f1/c9f2`.

**Why this works without touching char records:** The engine uses `TeamList.Count` /
`SelectedPlayer` to gate the menu. The loaded-save route uses the saved area/context
byte at `@18` and separately uses `@21` as the ECL member selector consumed by the
`1d99:137d` -> `25a4:0118` -> `1fc4:0130` `ECL1` loader chain.
The char records at 1039+ are the DQK pre-gen heroes, which are valid DQK characters —
fine for the capture purpose (a clearly labelled demo convenience).

`packages/engine/src/loaders/dqkSave.ts` is the maintained implementation of this patch recipe.
`patchDqkSaveResumeArea(save, area, { eclMemberId, position, facing, overland })` writes the area,
member selector, init flags, and optional pose mirrors without mutating the input buffer. The CLI
wrapper `tools/build-dqk-dir.mts` exposes the same fields as `--save-area`, `--save-ecl-member`,
`--save-x`, `--save-y`, and `--save-facing`, then mirrors the patched `SAVGAMA.QSV` to both the
game root and `SAVE/`.

Runtime caveat from the area-58 adjacent probe: these bytes are confirmed to stage original DQK state,
but they do not by themselves prove that a queued movement key reaches `SearchLocation`. In
`build\dqk-area58-adjwest-fastkeys24m.log`, original `DQK.EXE` opens `SAVE\SavGamA.qsv`, copies
`rec+13=0x3a`, `rec+16=0x3a`, `rec+25=0x10`, `rec+26=0x0f`, and copies the flat pose to
`c9f0=0x10`, `c9f1=0x0f`, `c9f2=0x01`; it then consumes `up` (`0x4800`) after journal. The run still
logs zero top-level `COMBAT` opcode rows and zero accepted combat-map rows. Treat `position`/`facing`
as a reproducible staging tool; a movement/SearchLocation proof still needs dispatcher watches on the
live descriptor/facing/area bytes (`[0x002d]`, `[0x0011]`, `[0x001b]`) and the post-input pose update.
The follow-up `build\dqk-area58-adjwest-cellwatch24m.log` adds those byte watches and sees no writes to
`[0x0011]`, `[0x001b]`, or `[0x002d]` after the early resident bulk load from `DQK.EXE@0x63a20`.
So the immediate blocker is the post-journal input/walker route, not whether the QSV pose bytes land.
`tools/unicorn_dqk_trace.py` now supports `--watch-dgroup-read` plus `--watch-dgroup-read-after`; the
next resume proof should watch reads of `[0x0011]`, `[0x001b]`, and `[0x002d]` after the known `up`
input window to identify the actual walker/dispatcher, or prove the key is still being handled outside
that path.
The range-limited read-watch follow-ups now prove the latter for the current route through 17M
instructions: `build\dqk-area58-adjwest-rangedread17m.log` consumes `up` with zero reads of
`[0x0011]`, `[0x001b]`, or `[0x002d]`, and `build\dqk-area58-adjwest-poseread17m.log` adds zero reads
of `[0xc9f0]`, `[0xc9f1]`, or `[0xc9f2]`. The post-journal key is returning through the form callback
path around `217e:003b -> [DGROUP:ca23] -> 2fe9:0006 -> 1bdb:036c`, so resume staging is still valid
but the current synthetic route has not reached the exploration walker.

**Why this may NOT work for a CoK port at area 16:** If the ported CoK ECL.GLB uses
block IDs from the original CoK DAX (smallest = 16), then @18 = 16 points to ECL.GLB
member 16. This is the correct CoK overland area — but only if the area-1 stub (Option A
from `dqk-newgame-entry.md §6`) has already been inserted, or if we bypass fresh-start
by setting @18 = 16 directly (the save-state injection approach, Option B from that
doc). Setting @18 = 16 with `LastEclBlockId != 0` takes the **resume** branch, which
skips `PartySummary()` but lands directly in the ECL area. This avoids the area-1 stub
requirement entirely for the capture task.

**Script to patch the shipped save:**
```python
import shutil
shutil.copy("SAVGAMA.QSV", "SAVGAMA_PATCHED.QSV")
with open("SAVGAMA_PATCHED.QSV", "r+b") as f:
    f.seek(18);   f.write(bytes([16]))   # CurrentModule = area 16 (CoK overland)
    f.seek(21);   f.write(bytes([16]))   # Loaded-save ECL member selector
    f.seek(1029); f.write(bytes([4]))    # ae67 word  = 0x0004 (retail; never 3)
    f.seek(1031); f.write(bytes([2]))    # ae57 word  = 0x0002
    f.seek(1033); f.write(bytes([4, 0])) # ca03 word  = 0x0004 (retail: 1, 4 or 5)
    f.seek(1035); f.write(bytes([0, 0])) # ca05 word  = 0x0000
```

---

## Open questions / unknowns

1. **DQK CCH record size (inline in QSV):** The physical records begin at
   **1039, 1547, 2081, 2640, 3166, 3708**. Each has an eight-byte QSV prefix, so the
   embedded CCH payloads that feed the compact combat bridge begin at
   **1047, 1555, 2089, 2648, 3174, 3716**. Their visible names at CCHFORM `+96` are
   **SIR DRYDEN, JORIS THE WISE, LENDUIRA, neacail, ALARIC THE BOLD, MAIGUREIGNE**.
   `CCPARTY /Q` validates the duplicated party count, then walks each record as its verified
   fixed body, item entries, affect nodes, and null-pointer terminator; it no longer scans
   arbitrary QSV bytes for a plausible CCH payload. It derives transient `GBD1` combat tails
   from the verified CCHFORM HP/THAC0/AC/damage/move offsets. The general variable-size writer
   is still **UNLOCATED**; QSV writeback is not implemented.
   Native `CCPARTY /Q` does not use CCHFORM `Current Class` at payload `+89` for DQK:
   the shipped `SAVGAMA.QSV` has zero there for all six embedded heroes. Its transient
   `GBD1` class is a coarse combat class derived from item-use flags at `+183`, with
   current-level slots `+157..+163` as fallback.

2. **DQK `loadSaveGame` exact binary:** DQK's equivalent of COAB `ovr017.loadSaveGame`
   is in an overlay segment of `DQK.EXE`. The exact routine address is **UNLOCATED** in
   the binary (string `"Loading...Please Wait"` at file 0x069a3f is in a string table
   segment, not adjacent to code). The COAB oracle is used as structural reference.

3. **PTY file format:** DQK.EXE strings include `savgama.pty` suggesting a `.PTY`
   (party?) file separate from `.QSV`. Its role and layout are **UNKNOWN**. It may be
   a Gen2 equivalent of COAB's player-name list (the part COAB stores inside the
   `.dat`). Not present in the shipped GOG release — may only be created by a mid-game
   save.

4. **Init flag exact semantics in DQK ECL scripts:** The SAVGAM.TXT values for
   @1031–1036 are documented for Gen1 games. Whether DQK Gen2 ECL scripts check the
   same offsets for the same values is **(inferred)** from the document; not verified
   against DQK's actual ECL bytecode.

5. **QSV `@21` was previously mislabeled here as an initiated flag.** The corrected
   DQK loaded-save trace proves it is copied to current-record `+0x16`, then to
   `[ae63]`, and then passed as the `ECL1` member id. `build\dqk-area58-selector-ecl-loader-0118-15m.log`
   shows `@21=0x04` selecting member 4; the patched fixture
   `build\dqk-area58-desc162-eclmember58-save-trace` with `@21=0x3a` reaches
   `1d99:137d` and `1d99:1373` with `rec+16=0x3a` and `[ae63]=0x3a`.

6. **`area_ptr.inDungeon` location in DQK QSV:** In COAB, `inDungeon` is at area_ptr
   struct offset 0x1CC. In the DQK flat format, the dungeon flag is `@33` (SAVGAM.TXT
   "Dungeon flag" offset 33) with a redundant encoding at @1029 (overland flag: 3=overland,
   4=other). The exact semantics of @33 vs @1029 for the DQK resume path are
   **(inferred)** from the HACKDOCS; @1029 is the more directly relevant one
   (SAVGAM.TXT explicitly documents 3/4 values for that byte).

---

## Implications for our engine

- **E6.2b DOSBox capture recipe is only unblocked when `@18` and `@21` are paired.**
  Patch the shipped `SAVGAMA.QSV` offsets 18, 21, 1029, 1031, 1033, 1034, 1035,
  and 1036. Drop patched QSV + `VAULTA.DAT` into the ported build's `SAVE/`
  directory. DQK.EXE loads the save, populates the roster from the embedded CCH
  records, and pressing "Begin Adventuring" resumes through the loaded-save route.
  If `@21` is left at `0x04`, the runtime reloads ECL member 4 even when `@18`
  names another area. This is **Option B** (save-state injection) from
  `dqk-newgame-entry.md §6`, but it must set both the area/context byte and the
  ECL member selector.

- **Option B avoids the area-1 stub entirely for capture.** Setting @18 = 16 (CoK
  overland) takes the `LastEclBlockId != 0` resume branch, skipping `PartySummary()`
  and the area-1 startup sequence. For a faithful production flow Option A (area-1 stub)
  or Option D (ECL remapping) is still recommended; for the DOSBox screenshot capture
  Option B is sufficient.

- **The roster always comes from the QSV's CCH records (not VAULTA.DAT).** The
  `packages/engine/src/loaders/dqkSave.ts` decoder (`saveEnablesBeginAdventuring`)
  correctly identifies `partySize @31 > 0` as the gate. The same loader now exposes
  QSV `@21` as `eclMemberId`, while keeping the old `initiated` numeric alias only
  for compatibility.
  The native DOS path now also materializes those records with `CCPARTY /Q` into
  `_GBPARTY.GBP` so `GBBOOT /E` passes the real six-member DQK party to `CCCOMBAT`
  via `/P`; this is an import-only bridge and leaves `SAVGAMA.QSV` unchanged.
  After native combat, `GBBOOT` writes current HP, max HP, and condition into the
  compact `GBD1` tails in `_GBPARTY.GBP`, and the next `CCPARTY /Q` pass overlays
  those flagged values on top of a fresh QSV import. That gives the native DOS
  loop persistent combat state without claiming DQK QSV writeback yet.

- **DQK QSV `CurrentModule @18` and `eclMemberId @21` must be patched together.**
  The TypeScript loader exposes both `currentModule` and `eclMemberId`, and
  `patchDqkSaveResumeArea(bytes, areaId)` writes `@18=areaId` and `@21=areaId`
  by default. It also has an `eclMemberId` override for synthetic probes where the
  selector id must be controlled separately.


---

## CORRECTION 2026-08-22 — the `240/254` init flags are Gen1, and appear in no retail save

The recipe above originally read `@1029 = 3|4`, `@1033 = 240`, `@1034 = 254`, `@1035 = 240`,
`@1036 = 254`, taken from `hackdocs SAVGAM.TXT`. `cok-m4-fidelity-plan.md` §8.4 flagged it as
cargo-culted Gen1 data in 2026-07-18 and `dqkSave.ts` was corrected then; this doc, the
loader's own doc comment and `BUILD-QUEUE.md` kept the old recipe until now. Two things are new
here beyond that flag.

**1. These are four little-endian words, not six flag bytes.** `dqk-ca03-runtime-probe.md` traced
`DQK.EXE`'s load path reading **2 bytes** into `DS:ae67` (`@1029..@1030`), 2 into `DS:ae57`
(`@1031..@1032`), 2 into `DS:ca03` (`@1033..@1034`) and 2 into `DS:ca05` (`@1035..@1036`), and
observed retail `ae67=0x0004`, `ae57=0x0002`. The hackdoc's "240, 254, 240, 254" is the single
word `0xFEF0` written twice.

**2. The corpus number, and its null.** Scanning every `SAVGAM*` file in the repo, the ten GOG
Galaxy DOS installs and the loose DOS Buck Rogers — deduplicated by content, `build/` excluded,
`hackdocs`' `SAVGAM.TXT` excluded — gives 50 distinct saves, 13 with a nonzero second block,
spanning DQK areas 4/58/66 and FRUA areas 5/14:

| offset | retail values | hackdoc recipe | hits |
|---|---|---|---|
| `@1029` | **4, in 13 of 13** | 3 when overland | 0 |
| `@1031` | 2 (initiated) or 0 | 2 | agrees |
| `@1033` | 1, 4 or 5 — area-dependent | 240 | 0 |
| `@1034` | 0 in every DQK save | 254 | 0 |
| `@1035` | 0 in every DQK save | 240 | 0 |
| `@1036` | 0 in every DQK save | 254 | 0 |

The byte sequence `F0 FE F0 FE` occurs **0 times anywhere in any of those 50 files**. The null
matters: run the same scan *with* `build/` included and 40 saves hold the recipe and 14 hold
`@1029 = 3` — every one of them produced by this repo's own `patchDqkSaveResumeArea`. An
unscoped corpus scan would have "confirmed" the hackdoc against our own output.
`packages/engine/test/dqkSave.test.ts` now pins both halves, using `build/` as the positive
control that proves the retail zero is a real zero and not a broken scanner.

**What follows for `@1029`:** it is not an overland/dungeon discriminator. Five distinct resume
areas across two different games all store 4, and even the *uninitiated* shipped
`The Dark Queen of Krynn/SAVGAMA.QSV` already holds 4 — so 4 cannot be read as "the value
written when adventuring began in a dungeon" either. `patchDqkSaveResumeArea` now defaults to 4
for every area; the `overland` option survives only to reproduce the older probe builds
byte-for-byte.

**The `ca03` word (`@1033`) — SOLVED 2026-08-22.** It is the **second operand of ECL opcode
`0x21` (`LOAD_FILES`)**.

*Mechanism.* `decompile-dqk-ecl-dispatch.md` binds opcode `0x21` to the handler at `DQK.EXE`
file offset `0x0420ac`, in a section marked "SOLVED (dynamic trace executed)".
`dqk-combat-context-ca03.md` independently derived the same address and its semantics: fetch two
operands, zero-extend operand 2, and write it into `DS:ca03` unless it is the `0xFF` sentinel or
equal to the current value. So operand 2 *is* the byte the save stores — this is a mechanism,
not a correlation.

*Which call.* Each area's entry-point script opens with a **self-referential** `LOAD_FILES`
whose first operand is the area's own id. Its second operand is what the save holds:

| resume area | script call | saved `@1033` |
| ----------- | ----------- | ------------- |
| 4  | `LOAD_FILES #4, #4`  (twice in area 4's script, both agreeing) | 4 |
| 58 | `LOAD_FILES #58, #1` (the only reachable `LOAD_FILES` in it)   | 1 |
| 66 | `LOAD_FILES #66, #5` (the only reachable `LOAD_FILES` in it)   | 5 |

*Corpus.* Across all 30 retail DQK `.QSV` saves we hold (repo + the GOG Galaxy install), with
the 12 degenerate `area=0, ca03=0` files excluded as zero-on-zero: **18 hits, 0 misses.**

*The null.* `1` is the modal operand-2 value, so a match to it proves little on its own. Over
the 18 areas that carry a self-referential `LOAD_FILES`, operand 2 is `1` in 9, `4` in 3, `5` in
exactly one — area 66's — and the tail `{2,3,6,191,255}` once each. The area-66 match is
therefore the discriminating observation (1 in 18); the three pairs jointly sit near 0.005 by
chance.

*Not tested by FRUA.* Both FRUA saves have `@1031 = 0`, i.e. the `ae57` "initiated" word is
unset, so their `ca03` is in its never-written state. They are controls, not evidence, and are
scored as neither.

*Still ruled out:* the resume area's own Gen2 GEO header set-id sextet in `DISK3/GEO.GLB` —
area 58's `06 05 0b 01 02 09` does not lead with its saved 1, and area 66's `03 0a 06 0f 01 09`
contains no 5 at all.

The writer still defaults to the constant 4, which is now a choice rather than a guess:
`resumeCa03ForArea` derives the correct value for a known area, and the area-load path is
unaffected either way (`cok-m4-fidelity-plan.md` §8.1 run 5 isolated that failure to the GEO
header).
