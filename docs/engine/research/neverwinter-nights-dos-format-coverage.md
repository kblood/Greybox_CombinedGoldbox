# Neverwinter Nights (DOS/AOL, 1991) — format-coverage audit

Read-only audit. No engine/source code was modified while producing this document; all
verdicts come from running the **existing** loaders in `packages/engine/src/loaders/` and
`packages/engine/src/ecl/` against the user's real extracted files, plus visual inspection of
rendered PNGs. Scratch scripts used to gather evidence lived in the session scratchpad and are
not part of this repo.

Data root: `{external-game-holdings}/Neverwinter Nights DOS/neverwinter-nights/neverwint` (35 files, all listed
below). Prior research this audit builds on and does not repeat: `neverwinter-nights-dos-archive-
analysis.md` (extraction/block-count baseline, `GAME.OVR`/`GAME.EXE` string/prologue scan) and
`neverwinter-nights-dos-combat-flow.md` (native GBBOOT/CCECL combat proofs — a *different*,
non-TypeScript execution path from the loaders audited here).

**A caveat on repo state.** A sibling agent is concurrently implementing the NWN explore route in
this same working tree. `packages/engine/src/loaders/walldef.ts` (and its two test files) had an
**uncommitted, in-flight edit** at audit time adding NWN-specific trailing-zero-record trimming;
this audit reflects that in-flight code (it works, and is exercised below), not a specific commit
hash. Everything else audited is unmodified, at-rest engine code. This document itself only adds
one new file (this one) and touches nothing else.

## Executive summary

| File | Verdict | Evidence (one line) |
| --- | --- | --- |
| `TITLE.DAX` | **SUPPORTED** | 5/5 blocks decode as standard frames; block 1 (320×200) renders the real "AMERICA ONLINE / STRATEGIC SIMULATIONS / STORMFRONT STUDIOS" credit screen, visually verified. |
| `PIC.DAX` | **SUPPORTED** | 78/78 blocks classify `animated`; 5 are true multi-frame XOR-delta animations (id 29 = a 6-frame campfire/ghost-lights scene, visually verified coherent); single-frame samples (ids 2–5) render as polished full-scene illustrations. |
| `BACK.DAX` | **SUPPORTED** | 10/10 blocks decode as standard 88×88 frames; sample renders a coherent tessellated backdrop texture. |
| `SKY.DAX` | **SUPPORTED** | 3/3 blocks decode as standard frames of 3 different sizes; block 250 renders a clean pink-cloud sky band. |
| `CPIC.DAX` | **SUPPORTED** | 198/198 blocks decode as standard 24×24 frames; sample renders a small coherent combat-portrait icon. |
| `HEAD.DAX` | **SUPPORTED** | 20/20 blocks decode as standard 88×40 frames; sample renders a coherent large character-head portrait. |
| `CHEAD.DAX` | **SUPPORTED** | 56/56 blocks decode as standard 24×10 frames; small icon-scale, plausibly coherent. |
| `SPRIT.DAX` | **SUPPORTED** | 5/5 blocks classify `animated`, each with exactly 3 verbatim (non-XOR) view-distance frames; samples render coherent humanoid combat sprites. |
| `COMSPR.DAX` | **SUPPORTED** | 26/26 blocks decode as standard 24×24 single frames; sample renders a small coherent effect/status icon. |
| `8X8D.DAX` | **SUPPORTED** | 39/40 blocks classify `tileset` (6335 total tiles, all render coherently — wall stone, UI chrome); block 201 (the font) is correctly **excluded** from the generic tileset path by design, decoded by `loadCokFont`, and (2026-07-21) wired into the `?nwn=1` preview; block 202 (frame/moon chrome) got a structural tile-role calibration (`NWN_FRAME_LAYOUT`) and is now live in `?explore=nwn` — see detail section. |
| `DUNGCOM.DAX` | **SUPPORTED** | 6/6 blocks classify `tileset`, 26 tiles/block, 24×24; mosaic render shows real perspective dungeon-corridor wall/floor art. |
| `RANDCOM.DAX` | **SUPPORTED** | 1/1 block classifies `tileset`, 6 tiles, 24×24; mosaic render shows real wilderness-combat props (gate, tree, bushes). |
| `BODY.DAX` | **SUPPORTED** | 17/17 blocks decode as standard 88×48 frames; sample renders a coherent paperdoll armour/torso piece. |
| `CBODY.DAX` | **SUPPORTED** | 128/128 blocks decode as standard 24×24 frames; sample renders a coherent small humanoid icon. |
| `GEO0.DAX` | **SUPPORTED** | 9/9 blocks are exactly 1026 bytes, CoK-header-shaped, edge-symmetry 0.71–0.97. |
| `GEO1.DAX` | **SUPPORTED** | 9/9 blocks, same shape, edge-symmetry 0.74–0.91. |
| `GEO2.DAX` | **SUPPORTED** | 10/10 blocks, same shape, edge-symmetry 0.72–0.93. |
| `GEO3.DAX` | **SUPPORTED** | 1/1 block, same shape, edge-symmetry 1.00. |
| `ECL0.DAX` | **SUPPORTED** | 9/9 blocks disassemble to a clean `EXIT` under the long-frame `ECL_GEN1` dialect. |
| `ECL1.DAX` | **PARTIAL** | 5/9 blocks clean `EXIT`; 4 blocks (12/15/16/17) hit an out-of-table opcode, but only *after* an early unconditional `GOTO` pair — dead trailing bytes for this project's linear disassembler, not a real desync (see detail). |
| `ECL2.DAX` | **SUPPORTED** | 10/10 blocks disassemble to a clean `EXIT`. |
| `ECL3.DAX` | **SUPPORTED** | 1/1 block disassembles to a clean `EXIT`. |
| `ECL5.DAX` | **SUPPORTED** | 2/2 blocks disassemble to a clean `EXIT`. |
| `ECL7.DAX` | **SUPPORTED** | 2/2 blocks disassemble to a clean `EXIT`; independently combat-proven live via native GBBOOT (see `neverwinter-nights-dos-combat-flow.md`). |
| `MONCHA.DAX` | **PARTIAL (decoder-selection gap)** | 100/100 records are 422 bytes; the **Gateway** 422-byte layout decodes 100/100 to sane AC/THAC0/HP (e.g. RED DRAGON HP 88 AC ?, ZHENTIL FIGHTER AC 10), but the code's **default/no-profile path silently picks the CoAB 422-byte layout instead**, which is wrong for NWN (99/100 records fail a basic sanity range) — a real, actionable gap, not a decoder capability gap. |
| `MONITM.DAX` | **SUPPORTED** | 38/38 blocks are exact multiples of the 63-byte COAB item-instance record (`monsterSideTables.ts`); 117 items decode with plausible base-type/value/weight fields. |
| `MONSPC.DAX` | **SUPPORTED** | 60/60 blocks are exact multiples of the 9-byte COAB affect record; 147 affects decode with type ids in the expected COAB `Affects` enum range, uniformly `minutes=0, affectData=0xFF, callAffectTable=false` (innate/permanent), matching the pattern already documented for CoK/DoK. |
| `ITEM.DAX` | **SUPPORTED** | 19/19 blocks are exact multiples of 63 bytes; the CoK 63-byte plain-ASCII decoder yields 60 clean-named items ("Plate Mail", "Studded Leather Armor", "10 Arrow" count=10, …); the DoK 17-byte decoder correctly rejects everything (0 items). |
| `WALLDEF.DAX` | **SUPPORTED (in-flight fix)** | 37/37 blocks are exactly 2340 bytes (3×780); the current (uncommitted) loader trims NWN's per-block zero-padding to the real record(s) and every block resolves plausible tile ids up to 255, matching `8X8D.DAX`'s largest tile banks. |
| `GAME.CFG` | **PARTIAL (marker-only)** | Plain CRLF-text install/config file (drive paths, single-letter flags); consumed only as a filename **existence marker** by `detect/profiles.ts` — no field-level decoder exists anywhere in the engine. |
| `GAME.OVR` | **UNSUPPORTED (no TS loader)** | `FBOV`-headed 375,300-byte overlay; only touched by ad hoc Python string/prologue scanning (`neverwinter-nights-dos-archive-analysis.md`) and native GBBOOT/DOSBox-X execution — no engine `loaders/` module parses it. |
| `GAME.EXE` | **UNSUPPORTED (no TS loader)** | MZ executable, 51,006 bytes; same as `GAME.OVR` — existence-marker only in `detect/profiles.ts`, no content decoder. |
| local music / sound assets | **ABSENT** | A recursive inventory of the extracted 35-file client found no `.XMI`, `.MID`/`.MIDI`, `.ADL`, `.ROL`, `.VOC`, `.WAV`, `.SND`, `.CMF`, or audio-named archive; neither `GAME.EXE` nor the text configuration contains a sound-driver or music-file identifier. This offline AOL client package therefore provides no original local soundtrack or effects for Greybox to load. |
| save data | **UNSUPPORTED / does not exist** | No `.SAV`/`CHRDATA*`/`.PTY` files are present in the directory, and `tools/map_gen1_save_dispatch.py`'s census (`gen1-save-dispatch-map.generated.md`) independently found **no in-overlay `savgam` anchor** for this title — consistent with an AOL-hosted, not locally-saved, character model. |
| `CCFP.MOV` (16 B) | **N/A — not a game asset** | Content is `14 4 1\r\n15 4 1\r\n`, a literal match for this project's own `(x,y,facing)` GBSN pose-log lines quoted in `neverwinter-nights-dos-combat-flow.md`; file mtime is 2026-07-11 (today's era, not 1994) — almost certainly a stray tooling sidecar written into the game folder by prior native-trace work, not an original AOL/SSI asset. Flagged, not decoded. |
| `DISK.1` (4 B) | **UNSUPPORTED / likely legitimate, undecoded** | `"1\r\n"` + EOF (0x1A); 1990-era mtime; plausible original floppy-swap-tracking stub. No decoder targets it (trivial, not attempted further). |
| `CHKLIST.MS` (81 B) | **UNSUPPORTED / recognized, undecoded** | Classic PKZIP/SEA self-extractor checklist (CRC/size records for `PKUNZIP.EXE`, `GAME.EXE`, `GAME.OVR`); recognizable by inspection, no decoder in this repo. |
| `ITEMS.1` (3074 B) | **UNSUPPORTED / unidentified** | Binary, not a DAX container (`word0=30208`, not a multiple of 9); no repeated record size cleanly divides 3074 against any known Gen1 record width tried (63/17/18); genuinely **UNLOCATED**, not guessed. |

## Detail: art archives (14 files)

All 14 art archives were decoded with `packages/engine/src/loaders/dax.ts`'s `decodeDax`
(kind-sniffing: `frame` → `vga-ext-frame`/`vga256-title` → `animated` → `tileset` →
`tile-strip` → `complex`), then rendered to PNG via `render/rgba.ts`'s `indexedToRGBA` and
visually inspected (not just byte math). NWN never hits the VGA-extended or VGA256 branches —
expected, since those are Gateway/Treasures/Pools-only per `daxVgaPicture.ts`/
`daxVga256Title.ts`'s own doc comments, and NWN is confirmed EGA (`dos-ega` graphic set in
`detect/profiles.ts`).

| Archive | Blocks | Kind breakdown | Total decoded frames |
| --- | ---: | --- | ---: |
| `TITLE.DAX` | 5 | frame ×5 | 5 |
| `PIC.DAX` | 78 | animated ×78 | 94 |
| `BACK.DAX` | 10 | frame ×10 | 10 |
| `SKY.DAX` | 3 | frame ×3 | 3 |
| `CPIC.DAX` | 198 | frame ×198 | 198 |
| `HEAD.DAX` | 20 | frame ×20 | 20 |
| `CHEAD.DAX` | 56 | frame ×56 | 56 |
| `SPRIT.DAX` | 5 | animated ×5 | 15 |
| `COMSPR.DAX` | 26 | frame ×26 | 26 |
| `8X8D.DAX` | 40 | tileset ×39, complex ×1 | 6335 |
| `DUNGCOM.DAX` | 6 | tileset ×6 | 156 |
| `RANDCOM.DAX` | 1 | tileset ×1 | 6 |
| `BODY.DAX` | 17 | frame ×17 | 17 |
| `CBODY.DAX` | 128 | frame ×128 | 128 |

Zero blocks across all 14 archives fell through to `complex`/undecoded **except** `8X8D.DAX`
block 201 (see below) — every other block classified and rendered.

### PIC.DAX — animated, XOR-delta semantics confirmed

`PIC.DAX` is treated as `isPic` (stem starts with `PIC`) in `dax.ts`, so frames after 0 are
XOR-delta against frame 0. 73 of 78 blocks are single-frame "special encounter" illustrations;
5 are true multi-frame animations (ids 29/76/96/104/137, 3–6 frames each, all 88×88). Rendered
samples:

- Single-frame samples (ids 2–5) are polished, fully coherent full-scene illustrations: a
  chained prisoner/demon figure, a green dragon, a rogue playing cards at a table, a mage
  casting a spell with a glowing orb — genuine SSI-quality Gold Box special-encounter art.
- Block 29 (6 frames) renders a coherent animated night campfire scene: the fire and a pair of
  floating ghost-light blobs visibly shift position frame to frame — correct XOR-delta
  animation semantics, visually confirmed (not just byte-count math).
- Block 1 (single frame) renders as a chaotic, high-contrast abstract pattern rather than a
  clean illustration. Given the *identical* decode path renders ids 2–5 perfectly, this is far
  more likely genuine "effect/chaos" art (a magical-surge or explosion scene, common as a first
  block in this genre's PIC tables) than a decoder defect — flagged as an open, low-priority
  visual question rather than a claimed bug.

### SPRIT.DAX — animated, verbatim (non-XOR) view-size semantics confirmed

`SPRIT.DAX` is treated as `isSprite` (no XOR, EGA magenta index 13 = transparent). All 5 blocks
have exactly 3 frames each, sized like `32×80, 24×65, 16×57` (large→small) — the same
"verbatim view-distance frames" convention documented for CoK's own `SPRIT*.DAX`. Rendered
samples (block 0, frames 0–1) show a coherent robed humanoid combat sprite at two view sizes,
with a clean transparent (non-magenta) background — correct.

### 8X8D.DAX — font (block 201) and frame/moon chrome (block 202) conventions

Both CoK-style conventions the task asked about are present and were tested directly:

- **Block 201 (font).** `decodeDax`'s generic classifier correctly marks it `complex`
  (`rawSize=1416`, no 8×8-tileset header) — this is **by design**, not a miss: the CoK font
  loader (`loaders/cokFont.ts`) does not use the generic tile-header path at all; it reads the
  decompressed payload as a flat array of 8-byte 1bpp glyphs. Running `loadCokFont` directly
  against NWN's `8X8D.DAX` **succeeds**: `rawLen=1416`, exactly matching the byte count CoK's
  own font block header comment hard-codes (`1416/8 = 177` glyphs) — i.e. NWN ships a
  byte-length-identical font table layout to CoK's. Rendering the text `"NEVERWINTER NIGHTS"`
  through `loadCokFont` + `glyphToImage` produces a crisp, fully legible 8px bitmap string —
  visually confirmed. **Verdict: SUPPORTED, and now wired end-to-end (2026-07-21).**
  `apps/web/src/ui/nwnPreview.ts`'s `renderFontPreview` calls `loadCokFont` directly against the
  raw `8X8D.DAX` bytes and draws three sample strings (title, subtitle, full alphanumeric
  charset) through `drawText`, wrapped as an `IndexedImage` and shown via the same
  `makeFrameCard` every other preview card uses. Live-confirmed via a headless screenshot of
  `?nwn=1`'s "Decoded text font" section: all three strings render crisp and fully legible. The
  generic `decodeAsset`/`decodeDax` path (used by the "Decoded NWN art" grid above it) still
  correctly leaves block 201 blank — that's still by design, not a regression — the new section
  is a second, dedicated pass over the same file.
- **Block 202 (frame/moon chrome).** Decodes cleanly through the generic `tileset` path: **40
  tiles**, 8×8, magenta-keyed. This is structurally identical to CoK's own block 202 (also a
  17-byte-header tileset), but CoK's is documented as exactly **38** tiles
  (`render/exploreScreen.ts`'s `COK_FRAME_LAYOUT`, which hard-codes specific tile *indices* for
  moon-phase icons/brackets). NWN's block 202 has **2 more tiles** than CoK's — the structural
  decode is SUPPORTED, but reusing CoK's `COK_FRAME_LAYOUT` index table verbatim for NWN would
  be an **unverified assumption**, not a proven mapping. **Verdict: SUPPORTED — calibrated
  2026-07-21**, see the dedicated write-up below. Block 203 (45 tiles) matches CoK's own
  documented count (45) exactly, for context.

#### Block 202 tile-index calibration (2026-07-21)

Individually rendered all 40 tiles at high zoom (`packages/engine/test/
renderNwnFrameCalibration.manual.test.ts`, dumps to git-ignored `renders/explore/nwn/`) and
visually inspected them (not just byte math) — the same method `cok-frame-arrays.md` used for
CoK, with one honest difference: **no surviving DOS screenshot of NWN's exploration screen has
been located**, so this is a *structural* calibration (find tiles that play the same grammatical
roles CoK's own six-tile design uses — straight horizontal run, straight vertical run,
junction, bracket, moon), not an MSE=0 pixel match.

Findings:

- **Tiles 0-3**: direction arrows (up/right/down/left), magenta-keyed — same role as CoK's own
  tiles 0-3, visually unambiguous (clean arrow glyphs).
- **Tiles 4-19** (16 tiles): visually near-uniform flat gray boxes with a light-gray border,
  differing only in which edge carries a highlight — the "gauge" cluster CoK's own boot-block
  set-4 assignment table documents (`cok-frame-arrays.md` §1: "38 tiles = frame(6) + arrows(4) +
  gauges(16) + moons(12)"; 4+16+6+12 = 38, and NWN's own 4+16+X+Y = 40 splits the same way once
  the frame/moon tiles below are counted). Not used by `NWN_FRAME_LAYOUT` (no gauge UI element
  reads them yet).
- **Tile 28**: a clean, uniform horizontal wood-grain (yellow/brown, NWN's own palette — not
  CoK's cyan/gray) double-bar — the unambiguous straight-horizontal-run tile.
- **Tile 22** (tile 38 is a near-duplicate second copy): a clean, uniform vertical wood-grain
  double-bar — the unambiguous straight-vertical-run tile.
- **Tile 27**: an unambiguous "+"-shaped tile — a full horizontal bar crossing a full vertical
  bar — filling the role CoK's layout splits into two directional tiles (23 upper-junction / 25
  lower-junction). NWN's set does not have two separably-identified junction tiles the way CoK's
  does, so this single symmetric cross fills both roles in `NWN_FRAME_LAYOUT` — a simplification,
  not a proven per-role split.
- **Tiles 20/21/34-37** (six tiles): colour-varying "gem-in-bracket" icons (red/green/green/
  magenta/red/cyan), two different bracket-art styles. Plausibly a moon/status-gem overlay
  analogous to CoK's tiles 21/22 (brackets) + 26-37 (moon phases), but Forgotten Realms has no
  Dragonlance moon lore to motivate re-using CoK's exact 3-moon scheme, and with no reference
  screenshot there is no way to confirm placement or which colour maps to which state. **Left
  unassigned** — `NWN_FRAME_LAYOUT` omits any bracket/moon overlay (a plain box border) rather
  than guess, the same "honestly absent" convention `frameTilesUnverified` itself established.
- **Tiles 23-26/29-33** (9 tiles): assorted transition/corner-looking pieces (irregular brown/
  white/gray patches, partial notches) — plausibly asymmetric corner caps CoK's design doesn't
  need (CoK reuses its horizontal tile 20 at all four outer corners), but not confidently pinned
  to individual roles; also left unassigned.

**Result**: `NWN_FRAME_LAYOUT` (`packages/engine/src/render/exploreScreen.ts`, exported from
`@goldbox/engine`) reuses `COK_FRAME_LAYOUT`'s exact array-position *skeleton* (same corner/
junction/straight placement pattern proven for CoK) with NWN's own 3 confidently-identified tile
roles substituted in (`straightH: 28`, `straightV: 22`, junction: `27`), and no bracket/moon
columns. Composed into a full candidate 320×200 screen
(`packages/engine/test/renderNwnFrameCalibration.manual.test.ts`'s third test) and visually
reviewed: the result is a clean, fully continuous gold/brown box border with correct cross-shaped
junctions where the vertical separator meets the outer border and where the inner viewport frame
meets it — a coherent UI border chrome, the task's stated success bar. Live-confirmed a second
time via a headless screenshot of the real `?explore=nwn` route (not just the synthetic engine
test) showing the same border around the real first-person dungeon viewport, party panel,
message window and command bar.

`apps/web/src/ui/gameData.ts`'s `nwn`/`nwn-natural` profiles now set `frameLayout:
NWN_FRAME_LAYOUT` and no longer set `frameTilesUnverified` — `extractFrameTiles` runs
unconditionally for NWN (real border tiles). The profiles also explicitly set
`moonTileGroups: null`: `extractMoonTiles` must not fall back to CoK's hardcoded
`[26,30,34]` phase-disc positions, because NWN's moon/status equivalents were not confidently
identified. `frameLayout` was threaded from
`GameData` through `explore.ts`'s live session state into every screen it feeds directly
(the main exploration screen, character sheet, spell memorization, and the companion panel's
five tabs — automap/HUD/reference-DB/journal/char), each defaulting to `COK_FRAME_LAYOUT` when
absent (unchanged behaviour for every other title).

### DUNGCOM.DAX / RANDCOM.DAX — combat-backdrop tileset semantics confirmed

Both decode via the same `tileset` path used for CoK's own `DUNGCOM`/`WILDCOM`/`RANDCOM`
(17-byte header, `count` same-size opaque tiles, no transparency key). `DUNGCOM.DAX` gives 6
blocks × 26 tiles (vs. CoK's own 25 — a harmless per-title count difference, not a decode
issue); `RANDCOM.DAX` gives 1 block × 6 tiles. Mosaic renders:

- `DUNGCOM` block 1 (26 tiles): a coherent perspective dungeon-corridor tile set — cyan/red
  diamond-patterned wall and floor pieces in matching corner/edge orientations, exactly the
  shape of a Gold Box first-person combat backdrop kit.
- `RANDCOM` block 1 (6 tiles): a coherent small wilderness-combat prop set — a gate/doorway
  structure and stylised bush/tree shapes on a green field.

**Verdict: SUPPORTED**, both structurally and with correct opaque-tileset semantics, visually
confirmed. (Neither is wired into any NWN-specific combat-encounter picker yet — see
"Implications" — that is a *routing* gap, not a *decode* gap.)

## Detail: GEO0–GEO3.DAX (4 files, 29 map blocks)

All 29 blocks are exactly 1026 bytes (`GEO_BLOCK_SIZE`), and every one carries CoK's constant
1024 (`0x400`) header word (`hasCokGeoHeader` true for 29/29) — i.e. NWN's GEO header convention
matches CoK's, not DoK's alternate-header variant. `decodeGeoBlock` accepts all 29/29 without
exception. Edge-symmetry sanity (cell `south` wall slot vs. the row-below neighbour's `north`
wall slot, the same self-consistency test `geo.ts`'s own doc comment describes validating CoK/DoK
against): **0.71–1.00** across all 29 blocks (mean ≈0.85), squarely inside the 0.62–0.91 range the
loader's own header comment cites as the validating range for CoK/DoK. **Verdict: SUPPORTED**,
full 16×16 coherence, no exceptions, no header-shape surprises.

## Detail: ECL0/1/2/3/5/7.DAX (6 files, 33 script blocks)

Disassembled every block with `disassembleEclBlock` under **`ECL_GEN1`** (the long-frame
dialect: `0x1D` PARTYSTRENGTH = 1 operand, `0x2C` PARLAY = 6 operands) — the dialect this
project's own `dok-natural-route.md` "2026-07-18 Update 9" audit places NWN in, alongside
Pool/CoAB/Secret/CoK (as opposed to the short-frame `ECL_GEN1_SHORT` camp: DoK/Gateway/
Treasures/PoD). Cross-checked by re-running the exact same 33 blocks under `ECL_GEN1_SHORT`:
**byte-identical results** (same 29 clean, same 4 bad-opcode blocks, same bad-opcode offsets) —
this rules out a dialect-selection confound entirely for NWN's corpus (none of the reachable
instructions on these particular blocks happen to cross a `0x1D`/`0x22`/`0x2C` site, so the two
dialects can't be told apart on this evidence alone, but neither shows any sign of desync either).

| File | Blocks | Block ids | Clean `EXIT` | Bad opcode |
| --- | ---: | --- | ---: | ---: |
| `ECL0.DAX` | 9 | 1–9 | 9 | 0 |
| `ECL1.DAX` | 9 | 10,11,12,14,15,16,17,18,19 | 5 | 4 (12,15,16,17) |
| `ECL2.DAX` | 10 | 20–29 | 10 | 0 |
| `ECL3.DAX` | 1 | 30 | 1 | 0 |
| `ECL5.DAX` | 2 | 51,59 | 2 | 0 |
| `ECL7.DAX` | 2 | 78,79 | 2 | 0 |
| **Total** | **33** | | **29** | **4** |

### The 4 "bad opcode" blocks are dead trailing bytes, not desync

Blocks 12/15/16/17 each hit an opcode byte outside the Gen1 dispatch table's dense `0x00..0x40`
range (all four land on the identical literal byte `0x7E`) after only **1–2 instructions**.
Byte-offset math traces this precisely: e.g. block 12 opens `8014h GOTO c10:10` / `8017h GOTO
0xca01` — two back-to-back **unconditional** jumps, consuming bytes 22→25→29 exactly, landing
byte-for-byte on the reported "bad opcode at offset 29". This project's ECL disassembler
(`ecl/disassemble.ts`'s `disassembleSubroutine`) is a **linear, non-control-flow-aware** walker
— it does not stop at `GOTO`/`GOSUB`, only at `EXIT` (`0x00`) or end-of-block — so after an
early unconditional `GOTO` it keeps decoding whatever bytes happen to follow in the file, even
though real execution would already have jumped away. All 4 failing blocks show this exact
pattern (an early GOTO/GOSUB pair, then unreachable trailing bytes that happen to include the
literal `7E 00 01 17 13 09 00 0X 01 79 7F ...` fragment — itself recognizable as a
misaligned read *into* the same "wait for encounter check" subroutine that blocks 10/14/18
decode cleanly, just entered at the wrong byte offset because it's dead code here). This matches
the caveat `neverwinter-nights-dos-archive-analysis.md` already recorded ("some very short
blocks stop at opcode bytes that are also seen as non-flow data") — this audit adds the
byte-exact mechanism. **Verdict: PARTIAL, but benign** — the reachable (executed) portion of
every one of these 4 blocks decodes cleanly; only unreachable trailing bytes fail, which is
expected behaviour for a linear disassembler and not evidence of a dialect or decoder problem.

## Detail: MONCHA.DAX / MONITM.DAX / MONSPC.DAX (monster side tables)

`MONCHA.DAX`: 100/100 blocks are exactly 422 bytes — the same length as **both** the CoAB
Player-record layout and the Gateway-to-the-Savage-Frontier layout (`monster.ts`'s
`COAB_LAYOUT`/`GATEWAY_LAYOUT`, a documented collision). Decoding all 100 both ways:

- **Gateway layout** (`decodeMonsterArchive(bytes, 'gateway-to-the-savage-frontier')`): **100/100**
  pass a basic sanity gate (AC in −10..10, THAC0 in −10..21, HP in 0..500). Sample: `KRAKEN SPY`
  HP 12 AC 5 THAC0 16 HD 2 dmg 1d6; `CLERIC` HP 12 AC 2 THAC0 18 HD 6; `ANHKHEG` HP 12 AC 2 THAC0
  12 HD 1 dmg 3d6 — all plausible AD&D 2e Forgotten Realms stat blocks, and the 100-name roster
  (`KRAKEN SPY`, `BANDIT`, `ZHENTIL FIGHTER`, `DRACOLICH`, `HOODED MEDUSA`, `RED DRAGON`, …)
  matches the names `neverwinter-nights-dos-archive-analysis.md` already recovered from a raw
  string scan.
- **CoAB layout** (`decodeMonsterArchive(bytes)`, i.e. the **default**, no `profileId`): **1/100**
  passes the same sanity gate — every AC/THAC0 comes out as the raw `60` (an un-inverted/absent
  byte reading through the wrong offsets), i.e. this is not "slightly off", it is comprehensively
  wrong.

**This is a real, actionable gap, not a missing capability**: `monster.ts`'s `layoutFor()` only
selects `GATEWAY_LAYOUT` when `profileId === 'gateway-to-the-savage-frontier'` **literally** — a
caller that (correctly, per `detect/profiles.ts`) passes NWN's own profile id
`'neverwinter-nights-dos'` falls through to `COAB_LAYOUT` (the next `len === 422` match) and gets
silently wrong stats. No current call site is affected in practice today (`nwnPreview.ts` never
calls `decodeMonsterArchive` at all — it only calls `readDaxDataBlocks` for a block-count probe),
but this will bite the first real NWN monster/combat feature that does. See "Follow-ups".

`MONITM.DAX`: 38/38 blocks are exact multiples of the 63-byte COAB carried-item record
(`monsterSideTables.ts`'s `MON_ITEM_SIZE`). 117 items decode with `baseTypeId` values 1–101
(a plausible catalogue-index spread; top values 50/59/55/37/8 recur most, consistent with common
stock gear) and sane `value`/`weight` fields. **Verdict: SUPPORTED.**

`MONSPC.DAX`: 60/60 blocks are exact multiples of the 9-byte COAB affect record
(`MON_AFFECT_SIZE`). 147 affects decode; every one has `minutes=0, affectData=0xFF,
callAffectTable=false` — identically the "innate/permanent" shape this project's own M23/M24/M28
audits found for **every** CoK/DoK `MON*SPC.DAX` record it has ever sampled (never a
dynamically-triggered spell-like affect). Type-id histogram spans 0x18–0xCF (24–207 decimal),
inside the plausible `COAB Affects` enum range. **Verdict: SUPPORTED** structurally and
plausibly-semantically; no individual NWN affect id (e.g. "is 0x62 still regen-3-hp for this
title specifically") has been cross-verified — flagged as an open item, not claimed.

#### Affect/item semantic cross-check (2026-07-22)

The "polish round" ran the actual join this project already runs for CoK/DoK — real NWN
`MONCHA.DAX` (Gateway 422-byte layout), `MONITM.DAX`, `MONSPC.DAX` decoded and joined by shared
block id (`packages/engine/test/nwnMonsterSideTables.manual.test.ts`, gated on the real asset
directory, not committed to CI) — to see whether NWN's numeric affect ids carry the *same*
semantic meaning already pinned for CoK/DoK by the M23/M24/M28 audits. Result: **honest
negative** on all three named constants, plus one genuinely new finding.

- **`REGEN_3_HP_AFFECT` (0x62) — zero carriers.** No NWN monster's `MONSPC.DAX` entry uses this
  id at all (CoK/DoK had 8/169 carriers).
- **`CON_SAVING_BONUS_AFFECT` (0x61) — zero carriers.** NWN's own undead-named monsters (id 12
  `SKELETON`, 14 `GHOUL`, 18 `ZOMBIE`, 28 `DRACOLICH`, 32 `GIANT SKELETON`, 39 `MUMMY` — all
  `con=10`, matching CoK/DoK's undead-family Con score) carry a completely different affect set
  instead: `{0x2c,0x3c,0x43,0x5e,0x6c,0x6d,0x6e,0x6f,0x73,0x75,0x77,0x7a,0x7b,0x7d,0x80,0x85,0x87,
  0x94}` — none of which is 0x61. So NWN's undead demonstrably get *some* innate-affect package
  (consistent with the "undead get permanent specials" pattern), just not through the same id
  CoK/DoK's undead use.
- **`HALF_DAMAGE_AFFECT` (0x51) — one carrier, and it's the wrong monster family.** The only NWN
  monster carrying `0x51` is id 55 `SHAMBLING MOUND` (`con=10`), not a vampire (DoK's only
  carriers were the VAMPIRE family, ids 19–21). A shambling mound *does* have a real AD&D 2e
  "half damage from edged weapons" trait, so this could still be a legitimately-reused id for a
  legitimately-analogous mechanic — but it is **not** confirmation that `0x51` means the same
  thing project-wide; it's equally consistent with `0x51` being reassigned per title by each
  game's own content designers while the *engine's* affect-jump-table (which this project cannot
  see without an NWN engine disassembly, unlike COAB's decompiled source) still defines a fixed
  enum. **Verdict: the byte-level record shape is proven SUPPORTED (uniformity check below has
  zero exceptions); the specific numeric-id-to-effect mapping is genuinely UNVERIFIED for NWN
  and should not be assumed to match CoK/DoK's constants without a real NWN disassembly — this
  project only has COAB's source, not NWN's own.** No loader wiring follows from this (per the
  task brief's own caution: only wire in if the evidence is solid, and here it is explicitly
  not).
- **Uniformity re-confirmed on live NWN bytes**: re-running the `minutes=0, affectData=0xff,
  callAffectTable=false` check found **zero exceptions** across every decoded NWN `MONSPC.DAX`
  record — the "innate/permanent, never a dynamic jump-table call" pattern holds for NWN too.
- **Web wiring (2026-07-27): MONITM only.** `?explore=nwn` now supplies the verified
  `MONITM.DAX` archive to the normal Gen1 monster load. That restores its carried-item drops and
  item-`plus` XP contribution without inventing special effects: the focused browser route proves
  real `MAGE` carried items include its recorded `+6` entry. `MONSPC.DAX` remains intentionally
  unbound until an NWN engine disassembly establishes what its numeric effect ids mean.
- **Route-parity correction (2026-07-28): MONITM on every NWN explorer entry.** The initial
  wiring covered only the plain `?explore=nwn` profile. The natural ECL1/GEO1 route and all four
  numbered map-picker disks use the same global `MONCHA.DAX`/`MONITM.DAX` pair, so they now also
  declare `itmPath: MONITM.DAX`. The focused natural-combat browser route asserts MAGE's real
  `+6` item as its regression sentinel. This configuration parity does not make any claim about
  `MONSPC` semantics.
- **`MONITM.DAX` name-codes decode plausibly through the shared `hackdocs_extracted/VOCAB.TXT`
  table** (spot-checked the first 25 monsters-with-items, 89 items total): e.g. `KRAKEN SPY`
  carries `baseType=36` decoded as `[(null), (null), Plate]` (Plate armor), `baseType=50` as
  `[(null), Of Prot, Bracers]` ("Bracers of Protection" — VOCAB entries 49+50 in reverse display
  order, a real AD&D item), `BUGBEAR` carries a `Battle Axe` (VOCAB 1) — all plausible
  monster/gear pairings, and the same reversed-triple-order pattern (`[qualifier, adjective,
  noun]` reading right-to-left as "Bracers of Protection") CoK/DoK's own items use. **New finding
  not previously recorded**: several decoded name-codes fall *outside* `VOCAB.TXT`'s documented
  0–124 range (observed: 159, 160, 162, 163, 175, 222 — printed as `?159` etc. above), meaning
  NWN's own vocabulary table is **larger than the 125-entry community-documented one** (which was
  transcribed from CoK/DoK). This is a genuine, newly-identified gap: NWN's full item-name
  vocabulary is not yet recovered, so any name that uses an index ≥125 cannot be rendered as text
  today. Flagged in "Open questions" below.
- **Follow-up (2026-07-22), still UNLOCATED but narrowed.** Re-decoded all 38 `MONITM.DAX` blocks
  directly: 40 real records carry a name-code ≥125 (out of every record with a nonzero code), and
  the actual observed set is **159, 160, 162, 163, 175, 216, 222, 244** — two codes (216, 244)
  wider than the 159–222 range previously recorded here. Went looking for the extended vocabulary
  itself: the task brief's suggested source (`ITEM.DAX` decoded names, GAME.OVR string tables) is
  a dead end — none of `hackdocs_extracted/VOCAB.TXT`'s own low-numbered words (`"Shield"`,
  `"Plate"`, `"Girdle"`, `"Wand"`, `"Displacement"`, `"Elfin Chain"`, `"Dragon Breath"`) appear
  anywhere in `GAME.OVR`. They **do** appear in **`GAME.EXE`** instead (e.g. `"Shield"` @ file
  offset 35328, `"Long Sword"` @ 40336, `"Potion"` @ 40775), which is a real correction to where
  the vocabulary actually lives. Two candidate tables were found there: an abbreviated/no-space
  codename table starting ~offset 33594 (`"battleaxe"`, `"handaxe"`, `"Bardiche"`, `"BecDeCor"`,
  `"BillGuisa"`, …) and a full human-readable table starting ~offset 39747 (`"Battle Axe"`,
  `"Hand Axe"`, `"Bardiche"`, `"Bec De Corbin"`, `"Bill-Guisarme"`, `"Bo Stick"`, …). Both are
  **Pascal-style length-prefixed strings** (a length byte immediately precedes each string — e.g.
  the byte at offset 39746 is `0x0A` = 10, followed by the 10 bytes of `"Battle Axe"`), not
  null-terminated C strings, which is itself worth recording for any future NWN-`GAME.EXE` string
  work. Two things stop this from being a finished code→name mapping: **(a)** the full table is
  demonstrably **NWN's own, larger, and differently-ordered vocabulary**, not an extended
  superset of `VOCAB.TXT` at the same index positions — it interleaves many extra polearm names
  `VOCAB.TXT` doesn't have at all (`Bec De Corbin`, `Bill-Guisarme`, `Fauchard`, `Fauchard-Fork`,
  `Glaive-Guisarme`, `Guisarme-Voulge`, `Lucern Hammer`, `Military Fork`, `Jo Stick`, `Partisan`,
  `Quarrel`, `Ranseur`, `Spetum`, `Voulge`), so a low, well-known `VOCAB.TXT` code (e.g. `30` =
  `"Arrow"`) lands at a *different* sequential position in NWN's own table (position 60 in a raw
  string-order count) — confirming NWN shipped a bespoke, longer vocabulary from the start rather
  than a strict superset of the shared CoK/DoK one. **(b)** the ~39747 table's records are not a
  uniform stride: several entries are immediately followed by a fixed 6-byte tagged field
  (`00 B2 00 <val> 00 B0`, `<val>` varying 0x0A/0x0C/…) that looks like packed weapon stats
  (damage/speed/type), while others are followed by plain zero-padding instead — meaning a
  reliable string-position-N-equals-vocabulary-code-N count requires parsing real record
  boundaries (stat-block layout), not just walking length-prefixed strings, to stay in sync.
  **Verdict: the extended-code *census* (159/160/162/163/175/216/222/244) and the *location* of
  NWN's real vocabulary source (`GAME.EXE`, not `GAME.OVR`/`ITEM.DAX`) are now solid, corrected
  findings; the exact code→word mapping stays honestly UNLOCATED** — resolving it needs the
  record-boundary/stat-field layout reverse-engineered first, which is out of scope for this
  pass. See "Open questions" below.

## Detail: ITEM.DAX

19/19 blocks are exact multiples of 63 bytes (0 remainder on every block). The CoK 63-byte
plain-ASCII decoder (`loaders/item.ts`'s `decodeItemArchive`) yields 60 items with clean,
sensible names and fields: `"Small Raft Sling"` (baseType 0 = special), `"Shield"` (baseType 1),
`"Plate Mail"` (2), `"Banded Mail"` (3), … `"10 Arrow"` (baseType 11, `count=10` — correctly
decoded as a 10-unit ammo stack). Running the same bytes through the DoK 17-byte VOCAB-coded
decoder (`decodeDokItemArchive`) correctly yields **0** items (every 63-byte-block length fails
the 17-byte-multiple gate) — a clean negative control, confirming NWN's item table is the CoK
family shape, not DoK's. **Verdict: SUPPORTED.**

## Detail: WALLDEF.DAX

37/37 blocks are exactly 2340 bytes = 3 × 780 (`WALLDEF_RECORD_SIZE`). Unlike CoK/DoK (whose
block *length itself* varies with the real record count), NWN pads every block to a uniform
3-record size regardless of how many symbol sets it actually supplies. The **current, in-flight**
`decodeWalldefBlock` (see repo-state caveat above) already special-cases this: it trims trailing
all-zero records (keeping at least one), a fix the code comment attributes to an observed
overflow-guard false-positive in `loadDungeonWalls`. Re-running all 37 blocks through the
in-flight loader: every block resolves to 1–3 real (non-zero) records, `tile` id values up to
**255** (matching `8X8D.DAX`'s largest tile banks, e.g. blocks 18–24 which have 255 tiles each) —
consistent, in-range data. **Verdict: SUPPORTED**, contingent on that in-flight (uncommitted at
audit time) fix landing; without it, blocks with real padding would over-report empty record
data but would not throw (the sniff/decode itself never rejects a 2340-byte block either way).

## Detail: GAME.CFG / GAME.OVR / GAME.EXE / save format

- **`GAME.CFG`** (53 bytes) is a plain CRLF-terminated text file: `E`, `P`, `` (blank), `F`,
  `C:\WINDOWS\`, `E:\GAMES\NEVERW~1\`, `N`, `Y`, `(` — single-letter mode flags plus two install
  paths (the `C:\WINDOWS\` entry implies this copy was run under a Windows 9x AOL/DOSBox wrapper
  at some point, consistent with its 1998 mtime vs. the other files' 1994 mtimes). `detect/
  profiles.ts`'s `neverwinter-nights-dos` profile signature requires it (`required:
  ['GAME.CFG', 'GAME.OVR', 'ECL0.DAX', 'GEO0.DAX']`, `exclude` list to avoid colliding with the
  Savage Frontier `GAME.CFG` profile) but only checks **filename presence** — `fingerprintFolder`/
  `scoreVariant` never reads file contents. No field-level `GAME.CFG` decoder exists.
- **`GAME.OVR`** (375,300 bytes, `FBOV`-headed) and **`GAME.EXE`** (51,006-byte MZ executable) have
  **no engine `loaders/` module at all**. Everything known about their contents
  (`neverwinter-nights-dos-archive-analysis.md`'s prologue/thunk/string scan;
  `neverwinter-nights-dos-combat-flow.md`'s anchor-string table) comes from ad hoc Python
  scanning and/or live DOSBox-X/native-GBBOOT execution, not a TypeScript decoder in this
  package. `detect/profiles.ts` again only uses these as filename-existence markers.
- **Save format: does not exist locally.** No `.SAV`, `CHRDATA*`, `.PTY`, or similar file is
  present anywhere in the directory (confirmed against the full 35-file listing). This project's
  own cross-title census, `tools/map_gen1_save_dispatch.py` → `gen1-save-dispatch-map.
  generated.md`, independently reports **`no_literal_anchor`** for `neverwinter-nights-dos` — no
  in-overlay `savgam`-style string anchor at all, unlike every other Gen1 title in the corpus
  (which all have one, even DoK, whose anchor lives in `START.EXE` rather than the overlay). This
  is consistent with an AOL-hosted character model (the host, not the local DOS client, is the
  system of record) rather than a missed/undiscovered local save format. **No decoder exists
  because there is currently no evidence a decodable local save format exists to write one for.**

## Detail: files outside the "at minimum" list

- **`CCFP.MOV`** (16 bytes, mtime 2026-07-11) — **not an original game asset.** Its content,
  `14 4 1\r\n15 4 1\r\n`, is a byte-for-byte match in shape and *values* for the `(x, y, facing)`
  pose pairs `neverwinter-nights-dos-combat-flow.md` quotes verbatim as this project's own
  persisted GBSN session pose (`(14,4)` facing east, then `(15,4)` facing east, across the two
  natural-route proof legs documented there). Combined with the clearly-2026 mtime (every real
  1994-era NWN file has a 1988–1998 mtime), this is almost certainly a stray sidecar written into
  the live game folder by a prior native-trace tool run, not an AOL/SSI-authored file. Flagged
  for cleanup by whoever owns that tooling; **not decoded**, and not counted as a format gap.
- **`DISK.1`** (4 bytes, mtime 1990) — `"1\r\n"` + `0x1A` (DOS EOF marker). Plausibly a genuine
  original floppy-swap-tracking stub (which disk number is expected in the drive), consistent
  with its era-correct mtime. Trivial and low-value; no decoder was written.
- **`CHKLIST.MS`** (81 bytes, mtime 1995) — recognizable by inspection as a classic PKZIP/SEA
  self-extracting-archive "checklist" file: CRC32 + size records for `PKUNZIP.EXE`, `GAME.EXE`,
  `GAME.OVR`. A normal installer artifact of the era; no decoder exists in this repo (not part of
  the game's own runtime data).
- **`ITEMS.1`** (3074 bytes, mtime 1993) — genuinely **UNLOCATED**. Not a DAX container
  (`word0 = 30208`, not a multiple of 9). Binary, dense, no obvious fixed record stride tried
  (63/17/18-byte multiples were checked and don't divide cleanly against any structure found by
  inspection). No hypothesis is offered here beyond "distinct from the runtime `ITEM.DAX`,
  possibly an AOL-host-side or editor-side item source file" — **that is speculation, not a
  finding**, and is labelled as such rather than presented as a decode.

## Prioritized follow-ups (unsupported/partial items worth closing)

1. **DONE (2026-07-21).** ~~High — fix `MONCHA.DAX` layout selection for NWN.~~ `monster.ts`'s
   `layoutFor()` (line ~340) now has an explicit
   `if (len === GATEWAY_LAYOUT.size && profileId === 'neverwinter-nights-dos') return GATEWAY_LAYOUT;`
   guard ahead of the `COAB_LAYOUT` fallback, so a caller that passes NWN's own profile id gets the
   correct Gateway-shaped layout instead of silently-wrong CoAB stats. Landed prior to this polish
   round (already present at audit-follow-up time; no code change needed here, just this doc
   correction).
2. **DONE (2026-07-21).** ~~Medium — calibrate `8X8D.DAX` block 202's NWN-specific tile-index
   semantics~~ See "Block 202 tile-index calibration" above: `NWN_FRAME_LAYOUT` (3 confidently-
   identified tile roles: straightH=28, straightV=22, junction=27) is now wired into
   `gameData.ts`'s `nwn`/`nwn-natural` profiles and live in `?explore=nwn`. No moon/bracket
   overlay (6-9 tiles left unassigned, honestly — see the calibration write-up).
3. **DONE (2026-07-21).** ~~Medium — wire `loadCokFont` into the generic NWN asset path~~
   `nwnPreview.ts`'s new `renderFontPreview` calls `loadCokFont` directly and renders three
   sample strings through it; live-confirmed via screenshot on `?nwn=1`.
4. **Low — resolve `ITEM.DAX`'s remaining short-block content** (7 blocks decode to fewer items
   than their raw byte count could theoretically hold; consistent with the same trailing-padding
   pattern already accepted for CoK's own `ITEM*.DAX`, but worth a quick confirmation pass if
   NWN's full item catalogue is ever needed for a shop/loot feature).
5. **Low / speculative — identify `ITEMS.1`'s format**, if it ever becomes relevant (e.g. an
   AOL-host item master list). Not blocking anything today.
6. **Cosmetic — verify/clean `CCFP.MOV`** with whoever owns the native-trace tooling; it is
   contaminating the "real extracted NWN asset" directory with a non-original file.
7. **DONE, negative result (2026-07-22).** ~~Medium — cross-check NWN's `MON*SPC.DAX` affect ids
   against the known CoK/DoK constants~~ See "Affect/item semantic cross-check" above: the real
   join was run and none of `REGEN_3_HP_AFFECT`/`CON_SAVING_BONUS_AFFECT` has any NWN carrier, and
   `HALF_DAMAGE_AFFECT`'s one carrier (`SHAMBLING MOUND`) is not the analogous monster family
   CoK/DoK use. Conclusion promoted from "open question" to "checked and inconclusive/negative" —
   no code should assume these constants' semantics transfer to NWN. New follow-up spun out of
   this: NWN's `MONITM.DAX` name-codes use vocabulary indices (159/160/162/163/175/222 observed)
   outside `hackdocs_extracted/VOCAB.TXT`'s documented 0–124 range — NWN's real item-name
   vocabulary table is larger and not yet recovered. Low priority (cosmetic name-decode gap only;
   `baseTypeId`/`value`/`weight`/`plus` — the fields anything mechanical would consume — are
   unaffected), worth a follow-up pass if NWN ever needs human-readable monster loot names.

## Open questions / unknowns

- Whether `PIC.DAX` block 1's chaotic-looking render is genuine "effect" art or a rare decode
  edge case — UNLOCATED either way; flagged, not guessed, in the PIC detail section above.
- **Checked, negative (2026-07-22).** Whether NWN's `MON*SPC.DAX` affect-type ids carry the
  *exact same* semantic meaning as the CoK/DoK-derived
  `REGEN_3_HP_AFFECT`/`HALF_DAMAGE_AFFECT`/`CON_SAVING_BONUS_AFFECT` constants — real cross-check
  now run (see "Affect/item semantic cross-check" above): NWN's own undead-family monsters
  (SKELETON/GHOUL/ZOMBIE/DRACOLICH/GIANT SKELETON/MUMMY, all Con 10) carry a disjoint affect-id
  set that never includes `0x61`, and `0x62` has zero NWN carriers at all. `0x51`'s one NWN
  carrier is `SHAMBLING MOUND`, not a vampire. Byte ranges remain consistent with the COAB
  `Affects` enum shape (still SUPPORTED structurally), but the specific numeric-id-to-effect
  mapping should NOT be assumed to carry over from CoK/DoK without an NWN engine disassembly —
  this project only has COAB's decompiled source, not NWN's own executable.
- `ITEM.DAX`'s handful of short-decode blocks (padding vs. genuinely-fewer items) — not resolved
  here, matches an already-accepted CoK convention, not urgent.
- **New (2026-07-22), narrowed same day.** NWN's `MONITM.DAX` item name-code vocabulary extends
  past `hackdocs_extracted/VOCAB.TXT`'s documented 125 entries — the real observed set of extended
  codes is **159, 160, 162, 163, 175, 216, 222, 244** (216 and 244 newly found; the table itself
  is NOT a superset of `VOCAB.TXT` at matching indices — see "Detail: MONCHA.DAX / MONITM.DAX /
  MONSPC.DAX" above). The real vocabulary source was located — `GAME.EXE` (not `GAME.OVR`, which
  a first pass wrongly targeted; and not `ITEM.DAX`), two Pascal-length-prefixed-string tables
  starting ~offset 33594 (abbreviated codenames) and ~offset 39747 (full names + interleaved
  weapon-stat records) — but the exact code→word mapping stays genuinely UNLOCATED: the ~39747
  table's non-uniform record stride (name strings interleaved with variable-length binary stat
  fields for some entries, plain zero-padding for others) means a safe position-N-equals-code-N
  count needs the record/stat layout reverse-engineered first. Does not affect any mechanical
  field (`baseTypeId`/`plus`/`value`/`weight`/`count`/`affects` all decode fine); only
  human-readable name rendering for the affected items is impacted.
- `ITEMS.1`'s format — genuinely UNLOCATED (see above).
- **Partially resolved (2026-07-21).** The `8X8D.DAX` block 202 tile-index semantics were
  calibrated *structurally* (visual pattern matching: straight-run/junction tiles found with
  confidence), NOT pixel-matched against a real screenshot the way CoK's `COK_FRAME_LAYOUT`
  was — no surviving DOS screenshot of NWN's exploration screen has been located. 6-9 tiles
  (candidate moon/bracket/corner pieces) remain genuinely unassigned; see the calibration
  write-up above and `NWN_FRAME_LAYOUT`'s own doc comment in `exploreScreen.ts`.

## Implications for our engine

- **The DAX/GEO/ECL/monster/item/walldef format family generalizes to NWN almost entirely
  unchanged.** Of 35 files, every DAX-family container (29 of them) decodes structurally, and 27
  of 29 are fully semantically SUPPORTED by visual/statistical inspection — strong evidence that
  this project's Gen1 DAX reverse-engineering (originally done against CoK/DoK) really is a
  shared-engine-family format, not something CoK/DoK-specific that happened to also parse NWN's
  bytes by coincidence. This derisks the browser-engine goal's "engine-neutral asset model"
  premise for a 5th Gen1 title.
- **NWN sits in the long-frame Gen1 ECL dialect camp** (with Pool/CoAB/Secret/CoK), not the
  short-frame camp (DoK/Gateway/Treasures/PoD) — confirmed here by a dialect-neutral result
  (byte-identical output under both dialects on this corpus), consistent with, not contradicting,
  the existing `dok-natural-route.md` "Update 9" classification. No new dialect variant is needed
  for NWN.
- **NWN's `MONCHA.DAX` reuses Gateway's 422-byte AD&D2e layout, not CoAB's** — a second confirmed
  case (after Gateway itself) of the "same byte length, different layout, must dispatch by
  game/profile id, not by length alone" hazard `monster.ts`'s own doc comments already warn
  about for the CoAB/Gateway collision. Any future "just add a new Gen1 title" pass should treat
  422-byte MONCHA records as *at minimum* a two-way ambiguity requiring an explicit profile,
  not a safe default.
- **NWN genuinely lacks a local save format** (no anchor, no save files) — any future "playable
  NWN" engine work should not budget time hunting for one; the online/AOL-hosted character model
  is the honest architectural fact, not a research gap. A from-scratch save format (or none, with
  session-only play) would need to be a deliberate engine design decision for this title, not a
  discovery task.
- **The 8X8D block-202 UI-chrome convention is *similar* but not *identical* across titles** (38
  tiles for CoK vs. 40 for NWN) — a caution against generalizing any single title's hard-coded
  tile-index UI layout (`COK_FRAME_LAYOUT` and its siblings) across the whole corpus without a
  per-title calibration step, even when the structural tileset format itself is shared.

## Support-matrix promotion (2026-07-22)

`tools/goldbox_corpus.py --stdout` (read-only; no output files written) was re-run against the
real local install to check NWN's current machine-computed evidence tier — the same pipeline that
gates `apps/web/src/ui/supportClaims.json` against `apps/web/src/generated/support-evidence.json`
via `validate_support_claims()`. Result: **`level: "route"`**, `route.status:
"verified-byte-contract"`, `surface: "exploration"`, no `persistence` block — this had *already*
been the committed `support-evidence.json`'s value (regenerated in an earlier round), but the
**hand-maintained** `supportClaims.json` entry still said `web_level: "preview"` with text
describing the old `?nwn=1`-only dashboard ("this is not a playable client") — stale since the
`?explore=nwn`/`?explore=nwn-natural` routes shipped. Fixed: `supportClaims.json`'s NWN claim now
reads `"route"` with text describing both the live exploration route and the live natural-combat
encounter; `support.ts`'s hard-coded "Exploration / maps" system row (which independently said
"NWN is preview-only") was updated too. Re-validated with a direct `validate_support_claims()`
call against the freshly-built corpus: **zero errors**.

**Whether NWN can go higher than `route`** (to `combat`/`persistent`, the tiers CoK/DoK/CoAB/
Secret/Pool all reached) was evaluated against the same two gates `evidence_level()` checks:

1. **`combat`** requires the route declaration itself to carry `surface: "natural-combat"` plus a
   `natural_encounter` block (byte-exact `LOAD_MONSTER`/`COMBAT` vaddrs inside `ECL1.DAX` block
   10, resolved through a per-title `ecl_address_addend`). The *live web app* already has this
   encounter working and independently cross-checked (`dungeonEvents.test.ts`'s "golden
   Neverwinter Nights (DOS/AOL) GEO1/ECL1 block 10 natural encounter" test, `e2e.mjs`'s
   `runExploreNwnNaturalCombat`) — but that proof was never transcribed into
   `tools/goldbox_corpus_routes.json`'s machine-checkable byte-contract schema the way CoK/DoK/
   CoAB/Secret/Pool's entries were. Doing so needs real vaddrs cross-derived from the engine's own
   `ecl/disassemble.ts` decode of the real block (a legitimate, DOSBox-free static exercise) —
   genuinely possible, just not done in this round; **UNLOCATED, not attempted, rather than
   guessed** (no `ecl_address_addend`/vaddr numbers were invented for this doc).
2. **`persistent`** additionally requires a proven resume/save mechanism for that same encounter.
   Checked directly: neither `dungeonEvents.test.ts`'s NWN golden nor `e2e.mjs`'s
   `runExploreNwnNaturalCombat` calls `verifyNaturalPersistence(...)` or asserts any resume write
   — every sibling title's natural-combat route (`cok-persistent`, `dok-persistent`,
   `coab-persistent`, `secret-persistent`, `pool-persistent` browser markers) has this and NWN
   does not. **This corrects an over-optimistic premise from this polish round's own task
   brief** ("combat + resume, which nwn-natural now has") — combat is real and proven; resume is
   not yet built or tested for this route. Promoting past `combat` needs that work first, not just
   a declaration update.

## Wilderness leg: `structurally-absent` (2026-08-05)

NWN's campaign-matrix `wilderness` leg is closed as **`structurally-absent`** — a proven negative,
not a shrug. It carries the same two independent, mutually-reinforcing pieces of evidence that
`secret-of-the-silver-blades` (the only prior exemplar of this verdict) was closed on, and no
fewer.

**Evidence 1 — whole-corpus scanner zero, from a scan that actually ran.**
`python tools/map_gen1_area_mode_writes.py --profile neverwinter-nights-dos` reports **0**
statically reachable `SAVE ...,0x4BE6` sites. `0x4BE6` is `Area1.inDungeon` (Area1 offset `0x1CC`),
the single binary host flag the retail engine flips between `GameState.DungeonMap` and
`GameState.WildernessMap`; it is the only binary-provable engine-mode split in the Gen1 corpus.
Coverage is explicit and was measured rather than assumed: **6 ECL archives
(`ECL0/1/2/3/5/7.DAX`), 33 script blocks scanned** — matching this doc's own independent
"6 files, 33 script blocks" inventory above — with the correct operand dialect
(`word_sets_for_profile('neverwinter-nights-dos')` returns the long-frame `GEN1_WORD_SETS`
default; NWN is *not* one of the four short-frame titles, so there is no dialect desync here).

> **This zero was not obtainable before today, and the previous zero was a false negative.**
> `neverwinter-nights-dos` was absent from `map_gen1_area_mode_writes.py`'s `GEN1_PROFILE_IDS`
> allowlist, so `--profile neverwinter-nights-dos` was filtered out at the top of `build_report()`
> before a single block was read: it emitted `"games": []` and printed
> `gen1 area-mode writes: 0`. That is an *empty scan list*, not a scanned game with no hits, and
> it is indistinguishable from a real negative at the CLI. This is the **same scope bug, in the
> same tuple**, that was found and fixed for `death-knights-of-krynn` on 2026-07-18 — it was
> simply never generalized past the one game that prompted it. Fixed 2026-08-05 by adding the four
> remaining Gen1 DAX titles. **Gateway is the control that proves the repair yields true
> positives rather than merely non-zero noise:** it went 0 -> 24, and the scanner independently
> rediscovered *both* of Gateway's already-`proven` legs from scratch — `ECL6.DAX#21`
> `initial_entry`/`vm_run_1` -> `SAVE 0 -> 0x4be6` at vaddr `0x808e` (value 0 = `WildernessMap`,
> Gateway's proven wilderness leg) and `ECL5.DAX#19` -> `SAVE 1` (Sundabar, its proven town leg,
> correctly `inDungeon=1`). Anyone who had trusted the old NWN zero would have published a
> `structurally-absent` claim on evidence that proved nothing.

**Evidence 2 — no `WILDCOM.DAX` ships at all.** Direct file listing of the real install
(`goldbox_corpus.file_index`) gives NWN `DUNGCOM.DAX` + `RANDCOM.DAX` and **no `WILDCOM.DAX`**.
For comparison, measured the same way in the same run: Secret ships `DUNGCOM.DAX` only (its
`structurally-absent` precedent), while Gateway (`DUNGCOM`+`RANDCOM`+`WILDCOM`), Treasures
(`DUNGCOM`+`WILDCOM`) and Pools of Darkness (`DUNGCOM`+`WILDCOM`) all ship the wilderness bank —
so Secret's negative is genuinely unavailable to those three and is not being over-applied here.

**The obvious counter-argument, addressed rather than ignored.** This doc's own
"DUNGCOM.DAX / RANDCOM.DAX" section describes `RANDCOM` block 1 as "a coherent small
wilderness-combat prop set — a gate/doorway structure and stylised bush/tree shapes on a green
field." That greenery does **not** imply a `WildernessMap` engine mode. Per
`map_gen1_area_mode_writes.py`'s own derivation from the CoAB source oracle
(`ovr011.cs SetupGroundTiles()`), `RANDCOM` is always layered *on top of* whichever 24x24 bank is
active; it is an overlay, not the mode selector. Outdoor-looking combat backdrops are fully
consistent with an engine that never leaves `DungeonMap`.

**Scope of the claim, stated explicitly.** This says NWN's retail ECL contains no statically
reachable overland/area-mode transition and the game ships no wilderness floor bank — i.e. the
content the `wilderness` leg asks for does not exist to be found. It does **not** claim NWN has no
outdoor *areas*, and it is bounded by static reachability from the five ECL header entry points
(`vm_run_1`, `search_location`, `pre_camp_check`, `camp_interrupted`, `initial_entry`), the same
bound every other row in `gen1-area-mode-writes.md` carries.

Regenerated report: `docs/engine/research/gen1-area-mode-writes.md` (corpus total 128 -> 152, the
+24 being Gateway's newly-visible sites). Remaining NWN failing legs after this closure: `middle`,
`ending`, `town`, `quest`. Tier is unchanged at `persistent` — one leg does not move a tier, and
nothing here claims otherwise.

**Net:** NWN promoted from a stale `preview` claim to the already-earned `route` claim (pure
documentation fix, zero risk); `combat`/`persistent` promotion is a real, scoped, honestly-open
follow-up, not a documentation gap.
