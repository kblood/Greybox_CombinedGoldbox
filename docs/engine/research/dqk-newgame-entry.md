# DQK New-Game Entry Path (E6.1)

**Scope:** What does `DQK.EXE` load when the player picks "Begin Adventuring" from
the front menu? What is the starting area, which GLB members are read, what state
gates the button, and what must a ported CoK build provide to land in a real map?

**Primary sources:** `coab_extracted/engine/` (Curse of the Azure Bonds decompile,
used as a Gold Box Gen1/Gen2 Rosetta Stone); direct parse of DQK's `ECL.GLB` and
`GEO.GLB`; `tools/disasm_dqk.py` for binary search; `hackdocs_extracted/SAVGAM.TXT`.

---

## 1. Menu dispatch — "Begin Adventuring"

### COAB oracle (`ovr018.cs`, lines 239-274)

The front-menu handler processes the keystroke `'B'` in a `case 'B':` branch:

```csharp
case 'B':
    if (menuFlags[allow_begin] == true)      // Gate 1: party non-empty
    {
        if ((gbl.TeamList.Count > 0 && gbl.inDemo == true) ||
            gbl.area_ptr.field_3FA == 0 ||   // Gate 2: game not already won
            gbl.inDemo == true)
        {
            gbl.game_state = gameStateBackup;
            // ... redraw the appropriate view ...
            return;   // exits the menu; engine proceeds to sub_29758()
        }
    }
    break;   // falls through → stays in menu loop
```

Key flags:

| Flag | Meaning | Fresh-game value |
|------|---------|-----------------|
| `menuFlags[allow_begin]` (index 10) | True only when `SelectedPlayer != null` (at least one character in the roster) | FALSE until party created/loaded |
| `area_ptr.field_3FA` | 0 = game not yet won; 0xFF = game completed | 0 (always false for a new run) |

**Consequence:** For a fresh game the `allow_begin` gate is the ONLY real blocker.
As soon as the player has at least one character loaded into the roster (via "Create
Character" / "Load Saved Game"), `allow_begin` becomes true and `field_3FA == 0`
always passes. The menu loop is NOT a bug; it is the normal "assemble your party
first" flow.

### Binary location in DQK.EXE

The string "Begin Adventuring" is at file offset **0x6B892** (confirmed by
`disasm_dqk.py --find "Begin Adventuring"`). The corresponding `case 'B':` dispatch
code is inside a **Borland far-call overlay segment** that is not reachable by flat
offset without runtime segment-map resolution. File scan for `cmp al, 0x42` in
0x218D5..EOF yields 4 hits, none in a recognizable menu switch. The dispatch offset
is **UNLOCATED** at the binary level.

---

## 2. Post-menu call chain

After `startGameMenu()` returns, `seg001.cs` calls `sub_29758()` (COAB `ovr003.cs`,
line 2230):

```
seg001:  gbl.game_area = 2   // for normal (non-demo) play
         ovr018.startGameMenu()
         ovr003.sub_29758()
```

Inside `sub_29758()` (lines 2243-2280):

```csharp
if (gbl.area_ptr.LastEclBlockId == 0)        // fresh game: no saved block yet
{
    gbl.byte_1EE98 = false;
    gbl.EclBlockId = 1;                      // ALWAYS 1 for a fresh (non-demo) game
    ovr025.PartySummary(gbl.SelectedPlayer); // show party roster screen
}
else
{
    gbl.EclBlockId = (byte)(gbl.area_ptr.LastEclBlockId); // resume saved block
}

if (gbl.area_ptr.inDungeon == 0)
    gbl.game_state = GameState.WildernessMap;

if (gbl.reload_ecl_and_pictures || gbl.area_ptr.LastEclBlockId == 0)
    ovr008.load_ecl_dax(gbl.EclBlockId);    // load the ECL block

ovr008.vm_init_ecl();
RunEclVm(gbl.ecl_initial_entryPoint);       // run the ECL VM
```

`load_ecl_dax(block_id)` in the COAB Gen1 engine calls:

```csharp
seg042.load_decode_dax(out block_mem, out block_size, block_id,
                       string.Format("ECL{0}.dax", gbl.game_area));
```

So for COAB it loads **block ID 1 from ECL2.DAX** (game_area=2 for normal play;
game_area=1 for combat overlay; game_area=3+ for chapter files).

For DQK (Gen2), there are no DAX files — the equivalent operation reads from the
`ECL.GLB` HLIB container using the same numeric area/block ID. `EclBlockId = 1`
means "load ECL.GLB member for area 1."

---

## 3. DQK starting area — ECL.GLB area 1

**File:** `The Dark Queen of Krynn/DISK3/ECL.GLB`

Parsed directly (HLIB DATA, magic=1, 49 members, 47 area entries):

| ECL.GLB field | Value |
|---------------|-------|
| File | DISK3/ECL.GLB |
| HLIB type | DATA (magic=1) |
| Total members | 49 (header count=48, +1 id-table = 49) |
| Number of area entries | 47 |
| Area 1 → member index | 1 |
| Area 1 file offset | 0x192 |
| Area 1 byte length | 9,340 bytes |

**Gen2 ECL header (20 bytes, 5 × far-pointer records):**

| Field | vaddr |
|-------|-------|
| vmRun1 | 0x81B6 |
| searchLocation | 0x81B6 |
| preCampCheck | 0x81A9 |
| campInterrupted | 0x81B6 |
| eclInitialEntry | **0x8014** |

The ECL VM is entered at virtual address **0x8014** (byte 20 of the block, the first
instruction after the 20-byte header). Decoded first three instructions:

```
0x8014: SAVE  IMM(1)    → MEM[1:1600]    // initialise "overland mode" flag
0x801A: SAVE  IMM(0)    → MEM[1:1A00]    // clear encounter counter
0x8020: LOAD_FILES  IMM(2)  IMM(1)  VAR(9, h=0)   // load overland assets
```

`LOAD_FILES` (opcode 0x21) with arg3 = `VAR(9, h=0)` (not `IMM(0xFF)`) signals
overland mode: the engine loads a bigpic/overview picture depending on the var value.

**There is NO GEO map for area 1.** `GEO.GLB` starts at area 2:

| GEO.GLB area | Description |
|-------------|-------------|
| 2 | First dungeon (Caergoth surroundings) |
| 4 | Second dungeon |
| ... | ... |

Area 1 is the DQK overland/wilderness start — no dungeon geometry. `inDungeon` will
be set to 0 by the ECL script (or left at the default that `sub_29758` tests), so
`game_state` becomes `GameState.WildernessMap`.

---

## 4. Save-state fields involved

From `hackdocs_extracted/SAVGAM.TXT` and inspection of `SAVE/SAVGAMA.QSV`:

| Save offset | Field | Fresh-game value | Meaning |
|-------------|-------|-----------------|---------|
| 0x1E4 (Area1) | `LastEclBlockId` | 0 | 0 → fresh game; non-zero → resume saved area |
| 0x1CC (Area1) | `inDungeon` | 0 or 1 | Controls WildernessMap vs DungeonMap state |
| 0x3FA (Area1) | `field_3FA` | 0 | 0 = game not won; 0xFF = completed game (blocks BEGIN) |
| SAVGAM offset 18 | Current Module | 0 | 1-4=overland, 5+=dungeon |
| SAVGAM offset 21 | ECL member selector id | 0 | Runtime-loaded save copies this to current-record `+0x16` / `[ae63]` |
| SAVGAM offset 31 | Party size | 0 | Must be non-zero for allow_begin gate |

A truly fresh game has all of these at 0 / default. The DQK engine will exhibit
identical behaviour: fresh save → `EclBlockId = 1` → loads ECL.GLB area 1.

---

## 5. CoK block-ID conflict — the critical architecture gap

When `buildDqkGame.ts` converts CoK DAX archives to DQK GLBs it uses the source
**DAX block ID directly** as the GLB area ID (documented in the file's module
comment: "the id used for every container is the source DAX block id").

CoK ECL block IDs (from `dax_decode.py --list`):

| DAX file | Block IDs present |
|----------|------------------|
| ECL1.DAX | 16, 17, 18, 32, 33, 34, 36 |
| ECL2.DAX | 48, 49, 50, 57, 64, 66, 67, 68 |
| ECL3.DAX | 80, 81, 82, 96, 97, 98, 99 |

**None of CoK's ECL blocks have ID = 1.** The smallest ID is 16 (ECL1.DAX, first
block — CoK's new-game / overland area).

DQK.EXE (and its COAB equivalent) hard-codes `EclBlockId = 1` for a fresh game.
When the ported CoK `ECL.GLB` is built by `buildDqkGame.ts`, block 16 becomes
`ECL.GLB member for area 16`, not area 1. DQK.EXE would try to load ECL area 1,
find no such member, and either crash or hang.

---

## 6. Resolution options

### Option A — Synthetic area-1 stub in CoK's ECL.GLB (recommended)

Add a synthetic ECL block with `areaId = 1` to the emitted CoK `ECL.GLB`. This
stub's single action is a `GOTO` or `LOAD_FILES` that immediately transfers control
to area 16 (the real CoK overland). No patch to `DQK.EXE` required.

Implementation: extend `portGen1EclArchiveToGen2()` in
`packages/engine/src/loaders/eclEncode.ts` to accept an optional `entryAreaId`
parameter (default 1). If the input contains no block with that ID, generate a
minimal Gen2 ECL block that issues `LOAD_FILES(16, ...)` or equivalent jump.

Alternatively, remap the first CoK block ID to 1 during the GLB build (rename area
16 → area 1). This is simpler but breaks GEO/ECL pairing if CoK has a GEO block 16
that must stay at ID 16 for other reasons.

### Option B — Save-state injection

Write a crafted initial save file where `LastEclBlockId = 16` instead of 0. Then
`sub_29758` would use `EclBlockId = 16` (the "resume" path rather than the "fresh
start" path), bypassing the hard-coded `= 1`. This avoids any stub ECL or EXE patch
but requires the player to effectively always "resume" rather than start fresh, which
may cause side-effects (party summary screen skipped, `byte_1EE98` flag differs).
**(inferred)** Downstream code that checks `LastEclBlockId == 0` for first-run setup
may not fire correctly.

### Option C — Patch DQK.EXE

Locate the x86 instruction that sets `gbl.EclBlockId = 1` in the overlay and change
the immediate to `16` (or whatever the ported CoK new-game area ID is). This is the
most surgical fix but requires:
- Resolving the overlay segment that contains `sub_29758` equivalent in DQK.EXE
- The binary offset is **UNLOCATED** (see §1 above); would need a runtime intercept
  or deeper overlay parsing to find.

### Option D — ECL ID remapping in buildDqkGame.ts

Change `buildDqkGame.ts` to remap the CoK "new game" ECL block to area ID 1
regardless of its original DAX block ID. The "new game" block is identified as the
block in ECL1.DAX with the lowest block ID (currently 16). Rename it to 1 in the
GLB. All internal ECL cross-references that jump to block 16 would also need
patching. This is the cleanest long-term approach if the ECL porter already rewrites
jump targets (check `eclEncode.ts`).

**Recommendation:** Option A (synthetic stub) for the immediate milestone. Option D
(ID remapping) as the proper long-term solution once `eclEncode.ts` handles
cross-block jumps.

---

## 7. Summary table

| Question | Answer | Status |
|----------|--------|--------|
| Front-menu dispatch location in DQK.EXE | Overlay segment; string at 0x6B892 | UNLOCATED (binary) |
| "Begin Adventuring" allow_begin gate | Party roster non-empty (`SelectedPlayer != null`) | Confirmed (COAB) |
| "Begin Adventuring" field_3FA gate | `field_3FA == 0` (never triggered on fresh game) | Confirmed (COAB) |
| Starting ECL block ID (DQK fresh game) | 1 (`EclBlockId = 1` in sub_29758) | Confirmed (COAB) |
| ECL.GLB area 1 → member | Member index 1, file offset 0x192, 9340 bytes | Confirmed (direct parse) |
| Area 1 ECL entry vaddr | 0x8014 | Confirmed (direct parse) |
| GEO map for area 1 | None (overland; GEO.GLB starts at area 2) | Confirmed (direct parse) |
| CoK ECL block IDs | 16-99 (smallest = 16) | Confirmed (dax_decode.py) |
| CoK block-ID conflict with DQK startup | Area 1 absent in CoK GLB; DQK.EXE would fail to load | Confirmed — architecture gap |
| Resolution (recommended) | Synthetic area-1 stub in CoK ECL.GLB | Option A |

---

## 8. Open questions / unknowns

1. **DQK.EXE overlay segment for menu/sub_29758:** The binary offset of the `EclBlockId = 1` assignment in DQK.EXE is unlocated. Would need Borland overlay-loader reverse engineering or a DOSBox memory snapshot to resolve.

2. **CoK "new game" ECL block identity:** Block 16 of ECL1.DAX is the lowest-ID ECL block; it is assumed to be the new-game overland entry **(inferred)**. This should be verified by decoding block 16 and checking its first instructions match the expected start-of-game setup (party summary call, initial LOAD_FILES for the CoK overland map).

3. **DoK starting block ID:** DoK uses a different block-ID scheme. Whether DoK also starts at area 16 or a different ID is UNKNOWN and would need the same `dax_decode.py --list` analysis on DoK's ECL1.DAX.

4. **ECL cross-block jump patching:** If CoK ECL scripts contain direct numeric jumps to block ID 16 (e.g., from demo/intro scripts), remapping 16→1 (Option D) would require patching those jump targets. Whether `eclEncode.ts` already rewrites them is UNKNOWN without reading that file in detail.

5. **PartySummary call on first entry:** `sub_29758` calls `ovr025.PartySummary()` only in the `LastEclBlockId == 0` branch (fresh game). A save-state injection approach (Option B) that sets `LastEclBlockId = 16` would skip this call. Impact on CoK port is UNKNOWN.

---

## 9. Implications for our engine

- The **engine's existing `dqkExplore.ts`** starts at `maps[0]` (GEO area 2, the first
  GEO entry). This bypasses the ECL area 1 overland start entirely. For a faithful
  "Begin Adventuring" path, the explore entry must first run ECL area 1 then let the
  ECL script transition to the first dungeon (area 2+).

- **`buildDqkGame.ts`** must be extended to either inject a synthetic area-1 ECL stub
  or remap the CoK new-game block to ID 1 before emitting `ECL.GLB`.

- **DQK.EXE patching** (Option C) is a last resort; the exact byte offset is unlocated
  and the overlay segment layout requires further work (`disasm-combat-dqk.md` has
  the combat overlay map; the menu overlay is a separate segment, not yet mapped).

- For the browser engine (`dqkExplore.ts` → full game loop): the `LastEclBlockId == 0`
  fresh-game path is the correct flow to implement. The engine should set `EclBlockId = 1`
  on a fresh start, look up ECL.GLB area 1, call `vm_init_ecl()`, then run
  `eclInitialEntry` (vaddr 0x8014). The first three instructions (SAVE + SAVE +
  LOAD_FILES) establish overland mode and load the bigpic assets.
