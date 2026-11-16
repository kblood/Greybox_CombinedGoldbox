# DOS/GOG Gold Box Game Data Inventory

Generated: 2026-06-20  
Repo: `{repo-root}`

---

## 1. Champions of Krynn (CoK) — DAX Inventory

52 `.DAX` files, plus `GAME.OVR`, `START.EXE`, `KRYNN.CFG` and the `ITEMS/` folder.
(Corrected 2026-08-25: this read "51 ... plus `MIDI.DAX`", but `MIDI.DAX` is one of the `.DAX`
files, not an extra beside them, so it was both listed twice and counted zero times. The table
below always had all 52 rows.)

### All DAX files with sizes and entry counts

| Name | Size (KB) | entries | Purpose group |
|------|-----------|-------------|---------------|
| 8X8D1.DAX | 14.0 | 8 | GRAPHICS — 8×8 dungeon tile bitmaps, area 1 |
| 8X8D2.DAX | 19.8 | 9 | GRAPHICS — 8×8 dungeon tile bitmaps, area 2 |
| 8X8D3.DAX | 20.1 | 9 | GRAPHICS — 8×8 dungeon tile bitmaps, area 3 |
| BIGPIC1.DAX | 64.2 | 4 | GRAPHICS — large story/NPC pictures, area 1 |
| BIGPIC2.DAX | 30.2 | 2 | GRAPHICS — large story/NPC pictures, area 2 |
| BIGPIC3.DAX | 36.6 | 3 | GRAPHICS — large story/NPC pictures, area 3 |
| BODY2.DAX | 1.8 | 1 | GRAPHICS — character body sprites, set 2 |
| BODY3.DAX | 1.8 | 1 | GRAPHICS — character body sprites, set 3 |
| CBODY.DAX | 23.3 | 128 | GRAPHICS — combat icon body tiles (large set) |
| CHEAD.DAX | 3.3 | 56 | GRAPHICS — combat icon head tiles |
| COMSPR.DAX | 3.5 | 26 | GRAPHICS — combat sprites (overhead combat view) |
| CPIC1.DAX | 16.5 | 52 | GRAPHICS — character/combat portraits, set 1 |
| CPIC2.DAX | 19.1 | 60 | GRAPHICS — character/combat portraits, set 2 |
| CPIC3.DAX | 16.8 | 44 | GRAPHICS — character/combat portraits, set 3 |
| CURSOR.DAX | 0.1 | 1 | GRAPHICS — mouse cursor shapes |
| DUNGCOM.DAX | 5.4 | 1 | GRAPHICS — dungeon/combat background elements |
| ECL1.DAX | 31.0 | 7 | DATA — ECL script bytecode, area 1 |
| ECL2.DAX | 48.8 | 8 | DATA — ECL script bytecode, area 2 |
| ECL3.DAX | 48.8 | 7 | DATA — ECL script bytecode, area 3 |
| GEO1.DAX | 1.8 | 2 | DATA — map geometry/layout, area 1 |
| GEO2.DAX | 6.2 | 7 | DATA — map geometry/layout, area 2 |
| GEO3.DAX | 5.4 | 6 | DATA — map geometry/layout, area 3 |
| HEAD2.DAX | 3.3 | 2 | GRAPHICS — character head/portrait sprites, set 2 |
| HEAD3.DAX | 3.3 | 2 | GRAPHICS — character head/portrait sprites, set 3 |
| ITEM1.DAX | 1.4 | 10 | DATA — item definitions, area 1 |
| ITEM2.DAX | 1.7 | 12 | DATA — item definitions, area 2 |
| ITEM3.DAX | 1.1 | 10 | DATA — item definitions, area 3 |
| MIDI.DAX | 7.2 | 5 | MUSIC — MIDI/OPL music data |
| MON1CHA.DAX | 2.6 | 26 | DATA — monster character stats, area 1 |
| MON1ITM.DAX | 1.4 | 11 | DATA — monster item tables, area 1 |
| MON1SPC.DAX | 0.3 | 11 | DATA — monster special abilities, area 1 |
| MON2CHA.DAX | 3.3 | 32 | DATA — monster character stats, area 2 |
| MON2ITM.DAX | 1.7 | 15 | DATA — monster item tables, area 2 |
| MON2SPC.DAX | 0.5 | 18 | DATA — monster special abilities, area 2 |
| MON3CHA.DAX | 3.2 | 30 | DATA — monster character stats, area 3 |
| MON3ITM.DAX | 0.9 | 9 | DATA — monster item tables, area 3 |
| MON3SPC.DAX | 0.6 | 15 | DATA — monster special abilities, area 3 |
| PIC1.DAX | 65.2 | 18 | GRAPHICS — in-game scene pictures, area 1 |
| PIC2.DAX | 99.1 | 26 | GRAPHICS — in-game scene pictures, area 2 |
| PIC3.DAX | 95.3 | 24 | GRAPHICS — in-game scene pictures, area 3 |
| RANDCOM.DAX | 1.0 | 1 | DATA — random encounter tables |
| SKY.DAX | 2.4 | 3 | GRAPHICS — sky/horizon strips for 3-D view |
| SOUND.DAX | 13.9 | 1 | SOUND — PC speaker / sound effects |
| SPRIT1.DAX | 8.5 | 5 | GRAPHICS — NPC/monster sprites, set 1 |
| SPRIT2.DAX | 30.6 | 18 | GRAPHICS — NPC/monster sprites, set 2 |
| SPRIT3.DAX | 22.0 | 13 | GRAPHICS — NPC/monster sprites, set 3 |
| TILES.DAX | 13.2 | 2 | GRAPHICS — overland/wilderness tile set |
| TITLE.DAX | 56.2 | 4 | GRAPHICS — title screen and intro images |
| WALLDEF1.DAX | 3.8 | 3 | GRAPHICS — dungeon wall definitions/textures, area 1 |
| WALLDEF2.DAX | 6.5 | 5 | GRAPHICS — dungeon wall definitions/textures, area 2 |
| WALLDEF3.DAX | 6.4 | 7 | GRAPHICS — dungeon wall definitions/textures, area 3 |
| WILDCOM.DAX | 5.3 | 1 | GRAPHICS — wilderness combat backgrounds |

**Total: 52 DAX files.** Graphics DAX files: ~34. Data/script/sound DAX files: ~18.

### Graphics resources subsection (CoK)

Primary graphics containers (sorted by size):

| Name | Size (KB) | Entries | Notes |
|------|-----------|---------|-------|
| PIC2.DAX | 99.1 | 26 | Largest picture archive; in-game scenes |
| PIC3.DAX | 95.3 | 24 | In-game scenes, area 3 |
| TITLE.DAX | 56.2 | 4 | Title/intro; large per-entry average (~1.6 KB) |
| PIC1.DAX | 65.2 | 18 | In-game scenes, area 1 |
| BIGPIC1.DAX | 64.2 | 4 | Story portraits; large images (~1.8 KB avg) |
| SPRIT2.DAX | 30.6 | 18 | Monster/NPC sprites |
| BIGPIC3.DAX | 36.6 | 3 | Story portraits |
| CBODY.DAX | 23.3 | 128 | Combat body icons (very high entry count) |
| SPRIT3.DAX | 22.0 | 13 | |
| BIGPIC2.DAX | 30.2 | 2 | |
| CPIC2.DAX | 19.1 | 60 | Combat portrait icons |
| 8X8D2.DAX | 19.8 | 9 | 8×8 px dungeon tiles |

---

## 2. Death Knights of Krynn (DoK) — DAX Inventory

50 `.DAX` files, plus `GAME.OVR`, `START.EXE`, `DKK.CFG`.  
Notable additions vs CoK: `BACK1–5.DAX` (combat backdrops), `SKYGRND.DAX`, `MUSIC.DAX`, `8X8D4–5.DAX`, `SPRIT4.DAX`, `PIC4–7.DAX`, `MON1WIZ.DAX`. Missing vs CoK: `BODY2/3`, `HEAD2/3`, `TILES`, `CURSOR`, `MON2–3`, `MIDI`.

### All DAX files with sizes and entry counts

| Name | Size (KB) | entries | Purpose group |
|------|-----------|-------------|---------------|
| 8X8D1.DAX | 10.9 | 5 | GRAPHICS — 8×8 dungeon tiles, area 1 |
| 8X8D2.DAX | 13.8 | 2 | GRAPHICS — 8×8 dungeon tiles, area 2 |
| 8X8D3.DAX | 13.9 | 2 | GRAPHICS — 8×8 dungeon tiles, area 3 |
| 8X8D4.DAX | 7.9 | 1 | GRAPHICS — 8×8 dungeon tiles, area 4 |
| 8X8D5.DAX | 8.1 | 1 | GRAPHICS — 8×8 dungeon tiles, area 5 |
| BACK1.DAX | 1.6 | 1 | GRAPHICS — combat backdrop, area 1 |
| BACK2.DAX | 5.8 | 2 | GRAPHICS — combat backdrop, area 2 |
| BACK3.DAX | 6.4 | 2 | GRAPHICS — combat backdrop, area 3 |
| BACK4.DAX | 2.6 | 1 | GRAPHICS — combat backdrop, area 4 |
| BACK5.DAX | 3.6 | 1 | GRAPHICS — combat backdrop, area 5 |
| BIGPIC1.DAX | 31.2 | 2 | GRAPHICS — large story pictures, area 1 |
| BIGPIC2.DAX | 15.1 | 1 | GRAPHICS — large story pictures, area 2 |
| BIGPIC3.DAX | 16.8 | 1 | GRAPHICS — large story pictures, area 3 |
| CBODY.DAX | 23.3 | 128 | GRAPHICS — combat icon body tiles |
| CHEAD.DAX | 3.3 | 56 | GRAPHICS — combat icon head tiles |
| COMSPR.DAX | 7.9 | 44 | GRAPHICS — combat sprites |
| CPIC1.DAX | 43.1 | 106 | GRAPHICS — character/combat portraits |
| DUNGCOM.DAX | 5.4 | 1 | GRAPHICS — dungeon combat background |
| ECL1.DAX | 41.5 | 8 | DATA — ECL scripts, area 1 |
| ECL2.DAX | 47.5 | 8 | DATA — ECL scripts, area 2 |
| ECL3.DAX | 54.1 | 9 | DATA — ECL scripts, area 3 |
| GEO1.DAX | 3.7 | 4 | DATA — map geometry, area 1 |
| GEO2.DAX | 6.6 | 8 | DATA — map geometry, area 2 |
| GEO3.DAX | 6.1 | 7 | DATA — map geometry, area 3 |
| ITEM0.DAX | 1.7 | 1 | DATA — item definitions |
| MON1CHA.DAX | 6.6 | 64 | DATA — monster character stats |
| MON1ITM.DAX | 2.2 | 17 | DATA — monster item tables |
| MON1SPC.DAX | 2.3 | 52 | DATA — monster special abilities |
| MON1WIZ.DAX | 0.7 | 14 | DATA — monster wizard spells |
| MUSIC.DAX | 27.4 | 8 | MUSIC — music tracks (replaces MIDI.DAX) |
| PIC1.DAX | 19.2 | 6 | GRAPHICS — in-game scene pictures, area 1 |
| PIC2.DAX | 44.7 | 10 | GRAPHICS — in-game scene pictures, area 2 |
| PIC3.DAX | 69.5 | 14 | GRAPHICS — in-game scene pictures, area 3 |
| PIC4.DAX | 8.4 | 3 | GRAPHICS — in-game scene pictures, area 4 |
| PIC5.DAX | 19.4 | 4 | GRAPHICS — in-game scene pictures, area 5 |
| PIC6.DAX | 18.8 | 5 | GRAPHICS — in-game scene pictures, area 6 |
| PIC7.DAX | 3.3 | 1 | GRAPHICS — in-game scene pictures, area 7 |
| SKYGRND.DAX | 5.1 | 2 | GRAPHICS — sky+ground horizon for 3-D view |
| SOUND.DAX | 13.9 | 1 | SOUND — sound effects |
| SPRIT1.DAX | 4.4 | 2 | GRAPHICS — NPC/monster sprites, set 1 |
| SPRIT2.DAX | 8.3 | 3 | GRAPHICS — NPC/monster sprites, set 2 |
| SPRIT3.DAX | 14.4 | 7 | GRAPHICS — NPC/monster sprites, set 3 |
| SPRIT4.DAX | 7.1 | 4 | GRAPHICS — NPC/monster sprites, set 4 |
| TITLE.DAX | 66.5 | 4 | GRAPHICS — title screen and intro |
| WALLDEF1.DAX | 2.1 | 1 | GRAPHICS — wall textures, area 1 |
| WALLDEF2.DAX | 3.8 | 2 | GRAPHICS — wall textures, area 2 |
| WALLDEF3.DAX | 3.9 | 2 | GRAPHICS — wall textures, area 3 |
| WALLDEF4.DAX | 1.5 | 1 | GRAPHICS — wall textures, area 4 |
| WALLDEF5.DAX | 1.8 | 1 | GRAPHICS — wall textures, area 5 |
| WILDCOM.DAX | 7.0 | 1 | GRAPHICS — wilderness combat backgrounds |

**Total: 50 DAX files.** Graphics DAX files: ~35. Data/script/music/sound: ~15.

### Graphics resources subsection (DoK)

| Name | Size (KB) | Entries | Notes |
|------|-----------|---------|-------|
| PIC3.DAX | 69.5 | 14 | Largest picture archive |
| TITLE.DAX | 66.5 | 4 | Title/intro |
| PIC2.DAX | 44.7 | 10 | |
| CPIC1.DAX | 43.1 | 106 | Very dense combat portrait set |
| CBODY.DAX | 23.3 | 128 | Combat body icons |
| SPRIT3.DAX | 14.4 | 7 | |
| 8X8D2–3.DAX | ~13.9 | 18 ea | Dungeon tiles |

---

## 3. The Dark Queen of Krynn (DQK) — Disk Inventory

DQK uses a different container scheme: `.TLB` (tile/image library) and `.GLB` (global/master library) replace the `.DAX` format. Music is separate `.XMI` files. Three install disks.

### DISK1 — Config, music, title

| Name | Size (KB) | Type | Purpose |
|------|-----------|------|---------|
| TITLE.TLB | 272.0 | GRAPHICS | Opening title screens (largest single file in game) |
| ALWAYS.TLB | 5.5 | GRAPHICS | Small UI icons (sword, shield, arrows — 26 images) |
| SOUNDS.GLB | 24.3 | SOUND | Sound effect library |
| SFXDQ.VOC | 30.2 | SOUND | Digital sound effects (VOC format) |
| ADDQ1–3.XMI | 8.3 / 6.2 / 5.7 | MUSIC | Ad Lib music tracks |
| RODQ1–3.XMI | 8.3 / 6.4 / 5.7 | MUSIC | Roland MT-32 music tracks |
| TYDQ1–3.XMI | 2.7 / 3.6 / 2.5 | MUSIC | Tandy music tracks |
| PCDQ1–3.XMI | 1.1 / 1.6 / 0.9 | MUSIC | PC speaker music |
| ADLIB.ADV | 13.6 | DRIVER | Ad Lib sound driver |
| MT32MPU.ADV | 10.2 | DRIVER | Roland MT-32 MIDI driver |
| PCSPKR.ADV | 7.7 | DRIVER | PC speaker driver |
| SBDIG.ADV | 3.9 | DRIVER | Sound Blaster digital driver |
| TANDY.ADV | 8.0 | DRIVER | Tandy sound driver |
| INSTR.AD | 3.9 | DATA | Ad Lib instrument patch data |
| ITEM.DAT | 4.2 | DATA | Item definitions |
| ITEMS.DAT | 2.0 | DATA | Item cross-reference |
| GAME.FON | 1.1 | DATA | Game font |
| DQK.CFG | 0.1 | CONFIG | Hardware/path configuration |

### DISK2 — Main graphics

| Name | Size (KB) | Type | Purpose |
|------|-----------|------|---------|
| 8X8DB.TLB | 264.1 | GRAPHICS | 8×8 dungeon tile bitmaps, set B |
| 8X8DC.TLB | 252.2 | GRAPHICS | 8×8 dungeon tile bitmaps, set C |
| PICA.TLB | 263.7 | GRAPHICS | In-game scene pictures, set A |
| PICB.TLB | 229.8 | GRAPHICS | In-game scene pictures, set B |
| PICC.TLB | 233.6 | GRAPHICS | In-game scene pictures, set C |
| CPIC.TLB | 211.5 | GRAPHICS | Combat portrait icons |
| BACK.TLB | 154.5 | GRAPHICS | Combat backdrops |
| SPRIT.TLB | 168.3 | GRAPHICS | NPC/monster sprites |
| WILDCOM.TLB | 95.1 | GRAPHICS | Wilderness combat backgrounds |
| DUNGCOM.TLB | 82.2 | GRAPHICS | Dungeon combat backgrounds |
| BIGPIC.TLB | 106.9 | GRAPHICS | Large story/NPC portraits |
| COMSPR.TLB | 27.9 | GRAPHICS | Combat sprites |
| MONCHA.GLB | 14.3 | DATA | Monster character data |
| TOPVIEW.TLB | 1.5 | GRAPHICS | Top-view map icons |

### DISK3 — Scripts, geometry, remaining art

| Name | Size (KB) | Type | Purpose |
|------|-----------|------|---------|
| ECL.GLB | 445.8 | DATA | ECL script bytecode (all areas, single GLB) |
| FINAL.TLB | 192.5 | GRAPHICS | Endgame/final sequence graphics |
| CBODY.TLB | 61.4 | GRAPHICS | Combat icon body tiles |
| GEO.GLB | 47.0 | DATA | Map geometry (all areas, single GLB) |
| FRAME.TLB | 39.7 | GRAPHICS | UI frame/border graphics |
| GEN.TLB | 27.8 | GRAPHICS | General UI graphics |

### Graphics resources subsection (DQK)

All major art is on DISK2, individual files range from 1.5 KB to 264 KB. The consolidation into single TLB per category (one BACK.TLB vs five BACK*.DAX) is the main structural difference from CoK/DoK.

---

## 4. DAX vs TLB/GLB Structural Notes

### DAX (CoK/DoK — older Gold Box engine)

- Binary archive of fixed record type. The header is a **single** `uint16` at offset 0 holding the
  TOC size in bytes, `= entries * 9`; then that many bytes of 9-byte TOC entries
  `{u8 block_id, u32 data_offset, u16 raw_size, u16 comp_size}`; then the data section at
  `2 + toc_bytes`. See `docs/dax-format.md` §1, verified against `DaxDump.exe`.
  (Corrected 2026-08-25: this said "a 2-word header: `entry_count` (word 0) and `table_offset`
  (word 1)". There is no second header word — those bytes are entry 0's `block_id` and the low
  byte of its `data_offset` — and word 0 is nine times the entry count, not the entry count.)
- Data is split across multiple numbered files per category (e.g., PIC1–7, BACK1–5, ECL1–3), one set per "area" of the game.
- Typical entry counts range from 1 (smallest, e.g. `WILDCOM.DAX`) to 128 (`CBODY.DAX`, the
  high-density combat icon set). The old figures 9 and 1152 were word 0, i.e. nine times these.
- Representative outputs:

```
$ python tools/dax_inspect.py --verify "Champions of Krynn"/{PIC1,8X8D1,COMSPR}.DAX

File: Champions of Krynn\PIC1.DAX (66736 bytes)
  entries=18  toc_bytes=162  data_base=164
  block ids: [23, 57, 58, 34, 18, 59, 60, 1, 8, 12, 15, 30, 34, 35, 41, 61, 62, 63]
  raw total=120701  compressed total=66572
  verify: entry chain closes exactly on EOF

File: Champions of Krynn\8X8D1.DAX (14346 bytes)
  entries=8  toc_bytes=72  data_base=74
  block ids: [201, 202, 203, 11, 12, 31, 32, 23]
  raw total=15391  compressed total=14272
  verify: entry chain closes exactly on EOF

File: Champions of Krynn\COMSPR.DAX (3612 bytes)
  entries=26  toc_bytes=234  data_base=236
  block ids: [0, 128, 1, 129, 2, 130, 3, 131, 4, 132, 5, 133, 6, 134, 7, 135, 8, 136, 9, 137, 10, 138, 11, 139, ...]
  raw total=7930  compressed total=3376
  verify: entry chain closes exactly on EOF
```

`--verify` requires the `data_offset` chain to be contiguous and the last block to end **exactly**
at EOF. All 102 CoK + DoK containers pass. It is a probe that can fail: truncate one and every
entry reports past-EOF, and the script exits 1. That check is what pins the layout — the old
two-word reading put `8X8D1.DAX`'s data at 489 instead of 74 and nothing complained, because
nothing was asking the bytes to add up.

- Non-graphics DAX files follow the same binary container format but contain bytecode (ECL*), map data (GEO*), or structured records (MON*, ITEM*, etc.).

### TLB/GLB (DQK — newer UA engine)

- TLB format documented in `hackdocs_extracted/TLBFORM.TXT`: starts with ASCII magic `"HLIB"` at offset 0, `"TILE"` at offset 12, followed by a pointer table and optional Image ID table. Supports per-image color palette data.
- GLB ("global library") is a master-library variant of TLB with a slightly different header; used for ECL scripts (`ECL.GLB`, 445.8 KB), geometry (`GEO.GLB`), sounds (`SOUNDS.GLB`), and monster data (`MONCHA.GLB`).
- Key structural differences vs DAX:
  - **Single file per category** instead of numbered per-area splits (one `ECL.GLB` vs three `ECL*.DAX`).
  - **Much larger files**: DISK2 graphics TLBs range 82–264 KB; largest DAX graphics files top out around 99 KB.
  - **Explicit HLIB magic** and formal pointer table vs DAX's implicit one-word TOC-size header.
  - **Palette embedded**: TLB files carry color data; DAX files do not have an explicit palette section per the hackdocs.
  - Music is stored as separate `.XMI` files (one per sound device per track group) rather than packed into a DAX.

---

## 5. Display Mode Evidence

### Champions of Krynn

- `KRYNN.CFG` line 1 = `E` — this is the stored graphics adapter type; `E` = EGA in the Gold Box config scheme (confirmed by the setup menu text in START.EXE).
- `START.EXE` contains the setup prompt: `"ADAPTER TYPE:  [1] CGA  [2] EGA  [3] Tandy"` — no VGA option present at all.
- No occurrences of `VGA` or `256` found anywhere in `START.EXE`.
- DOSBox conf sets `machine=svga_s3` (GOG compatibility default, not a game requirement).
- **Conclusion: CoK targets EGA 16-color (and CGA/Tandy as fallbacks). No VGA mode.**

### Death Knights of Krynn

- `DKK.CFG` line 1 = `E` — same EGA setting as CoK.
- `START.EXE` contains: `"ADAPTER TYPE: [1] CGA  [2] EGA  [3] Tandy"` — no VGA option.
- The only `VGA` byte hit in `START.EXE` is a spurious match inside the filename string `.sfx`, not a mode reference.
- DOSBox conf: same `machine=svga_s3` as CoK.
- **Conclusion: DoK also targets EGA 16-color. No VGA mode.**

### The Dark Queen of Krynn

- `INSTALL.EXE` contains an explicit graphics mode selection menu with three options as null-terminated strings: `"VGA (256 colors)"`, `"EGA (16 colors)"`, `"Tandy 16 Color"`.
- `INSTALL.EXE` also contains error strings: `"Installed for VGA only!\n"` and `"Installed for EGA only!\n"` — meaning the game stores which mode was chosen at install time and enforces it.
- `INSTALL.EXE` string table includes mode names: `ega`, `ega16`, `ega64`, `vga`, `xvga`, `high4`, `egamono`, `herc`, `tandy` — a broad capability detection list.
- `DQK.EXE` contains the same error strings and same mode name table.
- `DQK.CFG` byte 3 = `0x03`, binary format (not the ASCII `E`/`C` of CoK/DoK); the INSTALL sets this to the chosen mode index.
- DOSBox conf: `machine=svga_s3` (same as others, but DQK can actually use VGA 256-color mode when installed that way).
- **Conclusion: DQK supports both VGA 256-color and EGA 16-color; VGA 256 is the primary/intended mode for high-color graphics. This is the key generational step up from CoK/DoK.**

---

## Summary Table

| Game | DAX files | Graphics DAX | Data/Sound DAX | Video modes |
|------|-----------|--------------|----------------|-------------|
| Champions of Krynn | 52 | ~34 | ~18 | EGA 16-color (CGA/Tandy fallback) |
| Death Knights of Krynn | 50 | ~35 | ~15 | EGA 16-color (CGA/Tandy fallback) |
| Dark Queen of Krynn | — (TLB/GLB) | 19 TLB files | 4 GLB + 12 XMI + DAT | VGA 256-color primary (EGA 16 fallback) |

(Corrected 2026-09-03: this row read "17 TLB files" and "4 GLB + 16 XMI + DAT" since this
doc's creation on 2026-06-20 — an undercount/overcount that never matched even this same
document's own DISK1/2/3 tables above, which list 19 `.TLB` rows (2 + 13 + 4) and 12 `.XMI`
rows (3 ADDQ + 3 RODQ + 3 TYDQ + 3 PCDQ), not 17 and 16. Verified against the live
`The Dark Queen of Krynn/` install on disk: `find -iname '*.TLB'` = 19, `find -iname '*.XMI'`
= 12, `find -iname '*.GLB'` = 4 genuine game files (`SOUNDS.GLB`, `MONCHA.GLB`, `ECL.GLB`,
`GEO.GLB`; a 5th, `tools/examples/GEO_cok32.GLB`, is a research-tool output, not game data).)
