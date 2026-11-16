# Neverwinter Nights DOS archive analysis

Source archive: `D:\Games\Neverwinter-Nights_DOS_EN.zip`

Extraction root: `D:\Games\Neverwinter Nights DOS`

Game data root: `D:\Games\Neverwinter Nights DOS\neverwinter-nights\neverwint`

Analysis outputs:

- `D:\Games\Neverwinter Nights DOS\_extracted\raw_blocks`
- `D:\Games\Neverwinter Nights DOS\_extracted\png`
- `D:\Games\Neverwinter Nights DOS\_extracted\png_complex`
- `D:\Games\Neverwinter Nights DOS\_extracted\ecl_disasm`
- `D:\Games\Neverwinter Nights DOS\_analysis`

## Archive contents

The ZIP contains the AOL Neverwinter Nights DOS client/game directory. It is a Gen1-style Gold Box
data set with a DOS `GAME.EXE` loader, a large `GAME.OVR` overlay body, and DAX archives for art,
maps, event scripts, monsters, items, and walls.

Top-level game payload:

- `GAME.EXE`
- `GAME.OVR`
- `GAME.CFG`
- `TITLE.DAX`
- `ECL0.DAX`, `ECL1.DAX`, `ECL2.DAX`, `ECL3.DAX`, `ECL5.DAX`, `ECL7.DAX`
- `GEO0.DAX`, `GEO1.DAX`, `GEO2.DAX`, `GEO3.DAX`
- `8X8D.DAX`, `WALLDEF.DAX`, `DUNGCOM.DAX`, `PIC.DAX`, `CPIC.DAX`, `SPRIT.DAX`, `COMSPR.DAX`
- `MONCHA.DAX`, `MONITM.DAX`, `MONSPC.DAX`, `ITEM.DAX`

## Extraction status

Every DAX archive in the ZIP was parsed successfully as a DAX container and decompressed to raw
blocks. Total block counts:

| Archive | Blocks | Decompressed bytes |
| --- | ---: | ---: |
| `8X8D.DAX` | 40 | 204,799 |
| `BACK.DAX` | 10 | 38,890 |
| `BODY.DAX` | 17 | 36,193 |
| `CBODY.DAX` | 128 | 39,040 |
| `CHEAD.DAX` | 56 | 7,000 |
| `COMSPR.DAX` | 26 | 7,930 |
| `CPIC.DAX` | 198 | 111,654 |
| `DUNGCOM.DAX` | 6 | 45,030 |
| `ECL*.DAX` | 33 | 163,958 |
| `GEO*.DAX` | 29 | 29,754 |
| `HEAD.DAX` | 20 | 35,540 |
| `ITEM.DAX` | 19 | 6,489 |
| `MONCHA.DAX` | 100 | 42,200 |
| `MONITM.DAX` | 38 | 7,371 |
| `MONSPC.DAX` | 60 | 1,323 |
| `PIC.DAX` | 78 | 366,020 |
| `RANDCOM.DAX` | 1 | 1,745 |
| `SKY.DAX` | 3 | 3,155 |
| `SPRIT.DAX` | 5 | 14,160 |
| `TITLE.DAX` | 5 | 96,085 |
| `WALLDEF.DAX` | 37 | 86,580 |

Graphics export produced 611 PNGs across the simple and complex DAX decoders. Notable sets:

- `8X8D`: 39 simple PNGs.
- `CPIC`: 198 simple PNGs.
- `PIC`: 94 complex PNG frames.
- `SPRIT`: 15 complex PNG frames.
- `CBODY`: 128 simple PNGs.
- `CHEAD`: 56 simple PNGs.
- `TITLE`: 5 simple PNGs.

## Script disassembly

The ECL archives split into these block ids:

- `ECL0`: `001` through `009`
- `ECL1`: `010`, `011`, `012`, `014`, `015`, `016`, `017`, `018`, `019`
- `ECL2`: `020` through `029`
- `ECL3`: `030`
- `ECL5`: `051`, `059`
- `ECL7`: `078`, `079`

The existing ECL disassembler can read all exported ECL blocks. Some very short blocks stop at
opcode bytes that are also seen as non-flow data, but the useful script blocks decode cleanly enough
for route and combat analysis.

Important combat evidence:

- `ECL7_079` branches on AOL host-style memory keys `0x4bf2` and `0xc04f`.
- The same block contains several real encounter branches with `LOAD_MONSTER` followed by `COMBAT`.
- Verified selector `125` loads monster ids `46 x2`, `98 x4`, and `67 x2`, then enters combat.
- Verified selector `108` loads monster ids `85 x2`, `46 x5`, and `76 x2`, then enters combat.
- Verified selector `121` loads monster id `91 x4`, then enters combat.
- Verified non-combat selector `127` loads monster ids `46 x1` and `75 x4`, then reaches the
  AOL-host `NEWECL #29` chain path without `COMBAT`.
- Verified non-combat selector `124` loads monster ids `49 x4` and `78 x4`, then reaches the
  AOL-host `NEWECL #29` chain path without `COMBAT`.
- Verified non-combat selector `122` loads monster ids `77 x3`, `95 x4`, and `78 x4`, then
  reaches the AOL-host `NEWECL #29` chain path without `COMBAT`.

This is the same NWN area-7 script family used by `GBBOOT /E /A 7` for the native seeded combat
proof. GBBOOT now preserves explicit `/0 49231 <selector>` (`0xC04F`) sparse-memory overrides before
applying its default selector-125 seed, so the alternate selector branches are exercised through
GBBOOT rather than through a CCECL-only bypass. For the verified non-combat branches, GBBOOT treats
the ECL7 status-4/chain-29 exit as a clean host-chain boundary instead of reporting a native preview
failure, while still refusing to launch tactical combat without an actual `COMBAT` yield.

## Executable and overlay

`GAME.EXE` is an MZ executable. `GAME.OVR` begins with `FBOV` and has a 375,292-byte body after the
header. The overlay scan found:

- 1,314 `55 89 E5`-style function prologues in `GAME.OVR`.
- 825 `int 3f` thunk markers in `GAME.EXE`.
- 1,144 printable strings of length 5 or more in `GAME.OVR`.

Representative strings prove this is the AOL/Stormfront build and show native combat UI text:

- `On Line AD&D 2.20 (F1 for help)`
- `PRESENTED BY STORMFRONT STUDIOS, INC.`
- `FOR AMERICA ONLINE, INC.`
- `~COMBAT ~WAIT ~FLEE ~PARLAY`
- `~COMBAT ~WAIT ~FLEE ~ADVANCE`
- `A battle begins...`
- `combat enabled`
- `Combat disabled`

No local DOS 16-bit decompiler is currently installed. The binary state is therefore disassembly,
string extraction, prologue/thunk scanning, and data-format extraction, not recovered C source.

## Asset notes

`MONCHA.DAX` has 100 monster/character records. A simple string scan recovers names such as
`KRAKEN SPY`, `BANDIT`, `THIEF`, `CLERIC`, `ZHENTIL FIGHTER`, `MAGE`, `ANHKHEG`, `GOBLIN`,
`HOBGOBLIN`, `DRACOLICH`, `PHASE SPIDER`, `HOODED MEDUSA`, and `MUMMY`.

The map side is compact and area-indexed:

- `GEO0`: 9 blocks, each 1,026 bytes.
- `GEO1`: 9 blocks, each 1,026 bytes.
- `GEO2`: 10 blocks, each 1,026 bytes.
- `GEO3`: 1 block, 1,026 bytes.

`WALLDEF.DAX`, `8X8D.DAX`, and `DUNGCOM.DAX` are present, so the DOS graphics side has enough data
for first-person view and combat-backdrop experiments.

## Current boundary

Completed:

- ZIP located and unpacked into a named DOS NWN folder.
- DAX raw blocks extracted.
- DAX graphics exported to PNG where the existing decoders understand the block family.
- Web preview routing exists via `apps/web/games/neverwinter-nights-dos.json` and
  `?game=neverwinter-nights-dos`: the browser dashboard is intended to show NWN as an
  asset/game preview with decoded art categories and per-file status notes, not just as
  extracted files on disk. Data/ECL/map files are still status/listing entries there rather
  than a playable NWN source UI.
- ECL scripts split and disassembled.
- `GAME.OVR`/`GAME.EXE` scanned for strings, prologues, and thunk markers.
- Native GBBOOT has verified NWN `/E /A 7` seeded combat paths against these files, including the
  default selector-125 branch and explicit selector-108/121 override branches.
- Native GBBOOT also verifies selector-127/124/122 monster-setup-only paths and preserves their
  noncombat AOL-host `NEWECL #29` chain exits without writing `_GBCOMB.*` or `GBCR`.
- Native GBBOOT verifies the natural ECL0/GEO0 `GBBOOT /E /T 1` walk-loop leg: descriptor 33 at
  `(8,14)` facing south runs the sign SearchLocation text event, writes no tactical sidecars, and
  keeps the post-combat GBPR byte-identical.
- Native GBBOOT verifies the natural area-1 descriptor-229 movement-to-combat/resume leg:
  `GBBOOT /E /A 1 /T 1` starts from `(14,4)` facing east, falls back to `GEO1.DAX` block 10 for the
  wall/map bridge, queues real `MONCHA.DAX` groups `69 x2` and `30 x3`, writes `GBCR`, and resumes
  the ECL continuation at area 10 PC `03E0`.
- Native GBBOOT verifies the post-natural-combat area-1 continuation as `GBBOOT /E /A 1 /T 1` from
  persisted `GBSN` pose `(15,4)` facing east: the bounded continuation takes no new step at the
  boundary, rebuilds the area-1 wall bridge, writes no tactical sidecars, and leaves `GBSN` and
  `GBPR` unchanged.

Still open:

- True executable decompilation to C/pseudocode needs a 16-bit DOS-capable decompiler workflow
  such as Ghidra with an MZ/overlay setup, IDA, or a custom segmented-overlay loader.
- Some DAX families are decoded to raw blocks but still need richer semantic renderers
  (`DUNGCOM`, `RANDCOM`, and parts of `SPRIT`/`PIC` beyond the existing complex decoder).
- Host/AOL memory keys in NWN ECL should be cataloged from `GAME.OVR` and observed script behavior.
