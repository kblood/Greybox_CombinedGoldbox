# DoK Amiga `8x8d1.daa` — format identified, wall-bank reassembly SOLVED (2026-09-03, R1)

**Status: SOLVED (2026-09-03, R1) — the 2026-09-02 "96 hypotheses rejected" finding was
a TOOL BUG, not a property of the data.** `tools/dok_amiga_wallbank.py`'s DOS-side
reader used `dax_decode.parse_tile_strip` (an 8-byte-header, 16-px-wide vertical-strip
reader meant for a *different* DAX tile layout) against DOS's actual 17-byte-header
**tile array** blocks. That silently misread every one of the 256 tiles in each DOS wall
bank before a single comparison was ever run, so §3's whole 96-hypothesis sweep (below,
kept as "superseded") was scoring garbage against real Amiga data and correctly found
nothing — the negative was real *given that input*, but the input was wrong. With the
correct DOS reader (`dax_decode.parse_ega_tile_array`) and a DOS-EGA -> Amiga colour map
derived from boot block 202's own embedded palette (not assumed, not borrowed), the
**natural chunk order** (`id, id+20, id+40, id+60`) reproduces the DOS wall bank at
**1786/1792 (99.7%) tile-exact identity across all 7 series**, uniquely beating every
other of the 24 possible orders by a wide margin. See §3 for the full numbers, the
corrected predicate, both nulls, and the retraction of the "own embedded palette is
unusable" framing (the palette-lookup problem was real, but the fix is "read block 202's
palette", not "no colour source exists"). The wall-bank sets (1-3, DoK's "single-bank"
wall addressing) now resolve through Amiga art on the live EGA<->Amiga toggle
(`apps/web/src/ui/explore.ts`), same as the boot/frame tile sets.

## 1. Format: standard 5-plane frame, not CoK's compact 4-plane strip

CoK's `8X8D*.DAA` blocks are the compact "tile-strip" format: header
`{height=8, widthDiv8=1}` + 1 count byte + N tiles as narrow 4-plane columns, no embedded
palette (`isDaaTileStrip`/`decodeDaaTileStrip`, `daa.ts`).

DoK's `8x8d1.daa` blocks instead use the **standard BIGPIC-style frame format** — the
same 73-byte-header (8-byte geometry + 1 pad + 64-byte embedded 32-colour palette) +
5-plane planar format `decodeDaa()`'s main per-block image decoder already handles for
BIGPIC/CPIC art. Each "block" is simply one row of N tiles (`height=8`,
`width = N*8`). This was already flagged in `docs/daa-format.md` §7c before this task;
what was missing was a TypeScript decoder. `decodeDaaWideTileBlock` (`daa.ts`) fills that
gap by reusing the module's own `parseFrameHeader`/`planarFrameToIndices` helpers and
slicing the resulting wide image into 8×8 tiles.

## 2. Block inventory (31 blocks in `8x8d1.daa`)

- **7 wall-bank "series"** (base ids 1-7, one per WALLDEF bank), each split into **4
  chunks**: base id, `+20`, `+40`, `+60` (e.g. series "1" = blocks `1, 21, 41, 61`).
  Each chunk decodes to `512×8` = 64 tiles. 7×4 = 28 blocks.
- **3 boot/frame blocks**: `202`, `203`, `204` — single frames, not chunked.

DOS's `8X8D1.DAX` block **1** holds the single 256-tile wall bank directly (DoK's
`usesSingleBank` addressing, `dungeonWalls.ts`). The Amiga side has no single 256-tile
block — the same content, if present at all, is spread across 4 separate 64-tile blocks.

## 3. Wall bank (sets 1-3): reassembly SOLVED (2026-09-03, R1)

**The 2026-09-02 (R5) "96 hypotheses rejected" finding was a tool bug, not a property of
the data — see below for the retraction, then the corrected result.**

### 3.0 What was actually wrong

`tools/dok_amiga_wallbank.py`'s `dos_wall_bank_tiles` read the DOS side of every
comparison through `dax_decode.parse_tile_strip` — the **8-byte-header, 16-px-wide
vertical tile-strip** reader (used elsewhere for a genuinely different DAX layout). DoK's
`8X8D*.DAX` wall banks are not that layout: they are the **17-byte-header EGA tile
array** (`dax_decode.parse_ega_tile_array`, exact-consume gate
`len(raw) == 17 + (raw[8]+1)*32` for the saturated-count case, matching
`packages/engine/src/loaders/tiles8x8.ts`'s `sniff8x8dBlock`/`decode8x8dBlock`). Reading
block 1 through the wrong parser silently produced 256 garbage "tiles" — rolled/
misaligned pixel data — and every one of the 96 hypotheses in §3a-§3f below was scored
against that garbage. The sweep's negative result was real *for that input*; the input
was never the real DOS wall bank. Measured directly: re-running the OLD (still-live,
kept as `dos_wall_bank_tiles_strip_LEGACY`) reader's output against the CORRECTED Amiga
side, natural order, exact-tile predicate scores **18/256** — not zero, not close to
1786/1792 either, consistent with "structurally similar column data occasionally lines up
by chance," not a real decode.

The companion claim — "even a correct order has no colour table, because the wall-bank
chunks' own embedded palette is all zero" — was independently true as a *measurement*
(all 28 wall-bank chunks really do carry an all-`(0,0,0)` palette; still true, re-verified
below) but wrong as an *interpretation*. "This block's own palette is empty" does not mean
"no colour source exists in this file" — block 202 (one of the 3 boot/frame blocks in the
SAME `8x8d1.daa`) carries a real, populated 32-colour palette, and its slots 17-31 are a
direct EGA-16 relocation (`docs/engine/research/dok-8x8d-amiga-format.md` §3.2 below) —
i.e. the DOS EGA-to-Amiga colour map lives in a sibling block, not inside the wall-bank
chunks at all. `cf. goldbox-address-space-not-flag`: a "no colour table" reading of an
all-zero field is the same shape of mistake as reading a memory-mapped register as inert.

### 3.1 Corrected DOS reading + derived colour map

Tooling (fully rewritten): `tools/dok_amiga_wallbank.py` (+ `tools/test_dok_amiga_wallbank.py`,
18 tests). Full CLI report: `python tools/dok_amiga_wallbank.py --report`.

- **DOS reading**: `dax_decode.parse_ega_tile_array` + `ega_tile_array_tiles` — the same
  17-byte-header, saturated-count-byte (`0xFF`) layout `tiles8x8.ts` already used in the
  live TS engine. Each DOS `8X8D*.DAX` wall-bank block is exactly `17 + 256*32 = 8209`
  bytes for 256 8x8 4bpp tiles.
- **Colour map**: derived from Amiga boot block 202's own embedded palette, matching its
  slots 17-31 against the fixed DOS `EGA_PALETTE` by exact RGB. 14 of 16 EGA colours are
  uniquely colour-derivable this way; 2 need pinning because they are colour-degenerate:
  EGA 0 (black) is pinned to Amiga slot 0 (also `(0,0,0)`, and slot 0 is never used as a
  *result* of the colour match since nothing else is black), and EGA 13 (magenta,
  transparency key) is pinned to Amiga slot **16**, not the colour-only match (slot 29,
  a genuine bright magenta that is NOT the one actually used) — validated empirically:
  slot 16's own palette entry is itself `(0,0,0)` (it doubles as the transparency index),
  and slot-16 usage counts across the tile pool match DOS EGA-13's usage counts almost
  exactly (2596 vs 2596 pixel occurrences). The derived map is asserted a bijection onto
  `{0} ∪ {16..31}` (16 distinct EGA colours, 16 distinct Amiga slots) before use — it
  hard-codes nothing but those two named slots.

  | EGA | Amiga | EGA | Amiga | EGA | Amiga | EGA | Amiga |
  |---|---|---|---|---|---|---|---|
  | 0 | 0 | 4 | 20 | 8 | 17 | 12 | 28 |
  | 1 | 24 | 5 | 21 | 9 | 25 | 13 | 16 |
  | 2 | 23 | 6 | 22 | 10 | 26 | 14 | 30 |
  | 3 | 31 | 7 | 18 | 11 | 27 | 15 | 19 |

- **Predicate**: exact per-tile identity — all 64 pixels of a tile must match through the
  derived map — never a shape statistic (`ink_mask`/`quant4`, both retired) and never a
  resolved-RGB comparison (`goldbox-cross-platform-compare-bytes-not-conventions`).

### 3.2 Result: natural order wins, 1786/1792 (99.7%) tile-exact

Per-series exact-identical tile counts, natural chunk order (`id, id+20, id+40, id+60`):

| series | DOS file | exact / 256 | differing tile(s) |
|---|---|---|---|
| 1 | 8X8D1.DAX | 255 | tile 255, px (6,7): dos EGA 6 -> expected Amiga 22, got 0 |
| 2 | 8X8D4.DAX | 255 | tile 255, px (7,7): dos EGA 3 -> expected Amiga 31, got 0 |
| 3 | 8X8D2.DAX | **256** | none |
| 4 | 8X8D2.DAX | 255 | tile 255, px (7,7): dos EGA 3 -> expected Amiga 31, got 0 |
| 5 | 8X8D3.DAX | 255 | tile 255, px (6,7): dos EGA 6 -> expected Amiga 22, got 0 |
| 6 | 8X8D3.DAX | 255 | tile 255, px (6,7): dos EGA 8 -> expected Amiga 17, got 0 |
| 7 | 8X8D5.DAX | 255 | tile 255, px (6,7) + (7,7): dos EGA 8/7 -> expected 17/18, got 0/0 |
| **TOTAL** | | **1786/1792** | 6 tiles differ (7 pixels total), always tile index 255, always toward `0` |

Every one of the 6 mismatches is on the SAME global tile id (255 — the last tile in the
bank) and always resolves to Amiga index 0 where a non-zero colour was expected, in the
tile's bottom row — consistent with one real content difference or a 1-pixel edge
artifact in that specific (evidently rarely-drawn) tile, not a reassembly-order error.

24-order sweep (series 1, exact predicate) — natural order wins by a **127-tile margin**
over the runner-up:

| order (DOS block ids) | exact/256 |
|---|---|
| 1+21+41+61 (natural) | **255** |
| 1+21+61+41 | 128 |
| 1+61+41+21 | 128 |
| 61+21+41+1 | 128 |
| 1+41+21+61 | 127 |
| 21+1+41+61 | 127 |
| 41+21+1+61 | 127 |
| 1+41+61+21 | 64 |
| 1+61+21+41 | 64 |
| 21+61+41+1 | 64 |
| 41+21+61+1 | 64 |
| 61+1+41+21 | 64 |
| 61+21+1+41 | 64 |
| 21+41+1+61 | 63 |
| 41+1+21+61 | 63 |
| 21+1+61+41 | 0 |
| 21+41+61+1 | 0 |
| 21+61+1+41 | 0 |
| 41+1+61+21 | 0 |
| 41+61+1+21 | 0 |
| 41+61+21+1 | 0 |
| 61+1+21+41 | 0 |
| 61+41+1+21 | 0 |
| 61+41+21+1 | 0 |

**Nulls:**
- Shuffled null (series 1, 1000 shuffles, seed 20260903): mean=3.37, max=11, min=0 —
  natural order's 255 is nowhere near this band.
- Predecessor null (the OLD `parse_tile_strip` DOS reading, series 1, vs the corrected
  Amiga natural order): **18/256**. This is the number this pass actually measured for
  "what the tool-bug reading scores" — reported instead of a smaller number that had
  circulated informally, per this project's "your measurement wins" rule; 18/256 is still
  overwhelmingly beaten by the corrected reading's 255/256.

### 3.3 Own embedded palette: still genuinely all-zero (measurement unchanged; interpretation corrected)

Re-verified this pass: all 28 wall-bank chunks (7 series x 4 chunks) carry an
all-`(0,0,0)` embedded 32-colour palette; blocks 202, 203, 204 do not. That half of the
2026-09-02 finding was correct and stands — what changed is what to DO about it: use
block 202's palette to derive a colour map (§3.1), not treat the absence as a dead end.

### 3.4 Engine wiring

`packages/engine/src/loaders/daa.ts` adds `combineDokWallChunkRaws(chunks, paletteSource)`
(synthesizes one 2048px-wide standard 5-plane frame from the 4 sparse chunk raws, in
natural order, with block 202's palette copied in — never resolves to RGB itself) and
`deriveDokWallColorMap(paletteBlockRaw)` (the map above, as a bijection assertion).
`packages/engine/test/dungeonWallsAmigaDok.test.ts` pins: the single-bank category
resolves via Amiga (previously asserted `null`/DOS-fallback), and resolved tiles equal
DOS tiles for >= 255/256 per bank under the derived map — verified to go red both on a
swapped chunk order (collapses to 127/256 through the live rendering path) and on an
identity colour map (collapses to ~1/256).

---

## Superseded (2026-07-02 M9.S4 / 2026-09-02 R5): the pre-correction analysis

**Kept for the record, not because it is still believed — see §3.0 above for why this
entire sweep was scored against a mis-decoded DOS input.** The predicates, null, and
96-hypothesis table below are real measurements of what they claim to measure; the error
was upstream of all of it (the DOS-side tile reader), so every number here should be read
as "the tool-bug reading vs. the (independently correct) Amiga chunks," not as evidence
about the true DOS/Amiga wall-bank relationship.

### 3a. A new blocker found this pass: the wall-bank chunks' own embedded palette is all zero

Before re-scoring anything, this pass found the reason the original RGB-identity
predicate (§3, pre-2026-09-02 text below) could never have worked even with the right
order: **the wall-bank chunks' (block ids 1, 21, 41, 61) own embedded 32-colour
palette is entirely `(0,0,0)`** — all 32 entries. `daa.ts`'s `decodeDaaWideTileBlock`
and the original 3-orders attempt both resolve pixels through this frame's own embedded
palette, which collapses **every** pixel to solid black regardless of its true palette
index — not a subtle cross-palette difference, a total loss of colour information for
this specific block family. The boot/frame blocks in the SAME file (202/203/204) carry a
real, populated palette, so this is a property of the wall-bank chunks specifically, not
a parser bug. The raw bitplane-combined index values themselves are NOT degenerate
(chunk 1 spans indices `{0, 16, 17, 20, 22, 24, 30}` with real per-pixel structure), so
the pixels are fine — only the frame's own colour table is empty. No borrowed/guessed
palette is used to patch this (block 202's palette is a visually plausible candidate but
UNVERIFIED as the true shared one, per the project's no-guessed-content-mapping
convention) — this is disclosed as an open sub-problem, not silently worked around.

**Consequence for the predicate:** since resolving to RGB is not meaningful for these
blocks, both shape predicates below compare each side's own **raw decoder palette
index** (0..15 DOS EGA, 0..31 Amiga 5-bitplane) directly — never a resolved colour, and
never either side's embedded/assumed palette. This is a stricter reading of
`goldbox-cross-platform-compare-bytes-not-conventions` than "just don't use RGB
identity": here even a well-intentioned RGB *shape* comparison would have been comparing
"solid black" against "solid black" as a perfect match had the predicate not moved off
resolved colour entirely.

### 3b. Predicates and null

- `ink_mask` — binarise each tile's 64 pixels against **its own mean index value**
  (per-tile adaptive threshold).
- `quant4` — 4-level quantisation by **rank** within the tile's own 64-pixel index
  distribution (quartiles); scale-invariant, so the 0..15 vs 0..31 index ranges need no
  normalisation.
- **Null** (random-pairing, 1000 shuffles of a fixed natural-order 256-tile Amiga pool
  against the fixed DOS order, seed 20260902): `ink` mean=0.4853 max=0.5100 p99=0.5021;
  `quant` mean=0.2755 max=0.2975 p99=0.2919. Both chance levels land close to the
  textbook values for a 2-level (~0.5) and 4-level (~0.25) random agreement — the null
  behaves as expected, not a "beats the real data" surprise.
- **Win rule**: a hypothesis wins only if it clears the null's max by **>= 0.05** on
  BOTH predicates, chosen a priori (not tuned to the data).

### 3c. All 96 hypotheses (24 orders x {concat, row8 8-tile interleave, block16 16-tile
interleave, block32 32-tile interleave}) — top 12 by combined score

| order (DOS block ids) | method | ink | quant |
|---|---|---|---|
| 1+21+41+61 | concat  | 0.5165 | 0.3465 |
| 1+21+61+41 | concat  | 0.5148 | 0.3425 |
| 1+61+21+41 | block32 | 0.5264 | 0.3275 |
| 1+41+21+61 | concat  | 0.5187 | 0.3303 |
| 1+41+21+61 | block32 | 0.5179 | 0.3287 |
| 1+21+61+41 | block32 | 0.5220 | 0.3218 |
| 1+61+41+21 | block32 | 0.5253 | 0.3155 |
| 1+41+61+21 | block32 | 0.5205 | 0.3183 |
| 1+21+41+61 | block32 | 0.5183 | 0.3203 |
| 1+41+61+21 | concat  | 0.5186 | 0.3181 |
| 1+61+21+41 | concat  | 0.5159 | 0.3178 |
| 1+61+41+21 | concat  | 0.5175 | 0.3096 |

Full-96 distribution: ink min=0.4547 mean=0.4861 max=0.5264 std=0.0166; quant
min=0.2498 mean=0.2804 max=0.3465 std=0.0204. **No hypothesis clears the null max by
>= 0.05 on both predicates** — the best ink score (0.5264) beats the ink null max
(0.5100) by only 0.0164, and the best quant score (0.3465) beats the quant null max
(0.2975) by only 0.0490 — both short of the 0.05 bar, and the ink shortfall in
particular is not close. **Verdict: negative.** (`row8` stands in for a fourth
interleave granularity below full-chunk size; interleaving at the full 64-tile chunk
size is mathematically identical to `concat`, so it is not a separate hypothesis — see
the tool's module docstring for this explicit substitution.)

### 3d. The 3 previously-tried orders, rescored on the new axis

The original finding ("at most 1/256 tiles identical", RGB-identity) placed on the same
shape-predicate axis as the rest of this sweep:

| order | ink | quant |
|---|---|---|
| 1,21,41,61 (as originally tried) | 0.5165 | 0.3465 |
| 1,61,41,21 (as originally tried) | 0.5175 | 0.3096 |
| 61,41,21,1 (as originally tried) | 0.4895 | 0.2546 |

All three land inside or barely above the null band on this predicate too — consistent
with, not contradicting, the original "~1/256" RGB-identity finding: neither predicate
recovers real structure from any tried order.

### 3e. Mutation (a): the top hypothesis collapses under a shuffled Amiga tile order

Taking the best-combined-score hypothesis (`1+21+41+61`, `concat` — notably the DOS
block's own natural id order) and shuffling its 256 Amiga tiles (500 shuffles, seed
20260903): `ink` mean=0.4853 max=0.5059 (vs the unshuffled 0.5165); `quant` mean=0.2755
max=0.2964 (vs the unshuffled 0.3465). Both collapse to within the null band, confirming
the small residual signal in the top hypothesis is order-dependent (not a predicate
artifact that would "win" on scrambled input regardless of structure) — `cf.
goldbox-the-null-decides-the-finding`.

### 3f. Verdict and disposition

**Negative, with numbers**: 24 orders x 4 interleaves (96 hypotheses total) rejected
under a shape predicate that operates on raw decoder palette index (never resolved RGB,
never either side's embedded palette — the wall-bank chunks' own embedded palette is
all-zero, a new finding this pass); null p99 = 0.5021 (ink) / 0.2919 (quant); best
hypothesis clears the ink null max by only 0.0164 (needed >= 0.05) despite a barely-short
0.0490 margin on quant — the win rule requires both. This is a **landable negative**: no
change to `daa.ts`/`explore.ts`/`gameData.ts` is warranted by this pass. The wall-bank
reassembly remains blocked, now for two established reasons instead of one: (1) no tried
order or interleave recovers cross-platform tile structure, and (2) the wall-bank
chunks' own embedded palette carries no colour information at all, so even a correctly
ordered reassembly would still need a real palette source before it could render.

**Open for a future pass:** identify the TRUE palette for the wall-bank chunks (not
block 202's, which is an unverified guess) — e.g. by disassembling the Amiga executable's
own load sequence for `8x8d1.daa` to see what colour table (if any) it applies to these
frames; or investigate whether the true reassembly is not a per-chunk order/interleave
at all but a per-PLANE split (5 bitplanes distributed some other way across the 4
sparse block ids) — not attempted this pass, which only varied tile-level order and
grouping.

**RETRACTED 2026-09-03 (R1) — see §3.0-§3.4 above.** Both the "negative" verdict and the
"open for a future pass" framing were downstream of a DOS-side tool bug
(`parse_tile_strip` instead of `parse_ega_tile_array`); block 202's palette turned out to
be exactly right (not "an unverified guess"), the wall bank now reassembles and resolves
tile-exact at 1786/1792, and no per-plane-split alternative was ever needed.

## 4. Boot/frame sets (0, 4): real Amiga content, tile-count nuance on set 0

**Re-measured 2026-09-03 (R1)** with the corrected DOS reader
(`dax_decode.parse_ega_tile_array` — these boot/frame blocks turn out to be the SAME
17-byte tile-array layout as the wall banks, not a single rectangular frame) against each
side's own populated, non-degenerate palette (these 3 blocks were never affected by the
all-zero wall-bank palette problem). Numbers below are freshly computed, not carried over
from the 2026-07-02 pass; they either confirm or sharpen it, called out per block.

Set 4 sources from block 202: **45 tiles on both DOS and Amiga**, exact count match
(unchanged from the original finding).

Set 0 sources from block 203: **45 tiles on DOS, 46 on Amiga** — the off-by-one stands,
unchanged, still not investigated further this pass (Amiga is never fewer than DOS, so no
blit index goes out of bounds).

### Per-tile RGB comparison, resolved through each side's own palette

**Block 202 (set 4)** — re-measured, same methodology as the original pass (own-palette
resolved RGB, never a resolved-through-the-wall-bank-map comparison — using the §3.1
wall-bank colour map here would be the wrong tool: block 202 has its own real palette and
needs no translation):

- Tiles 0-24 (frame/border/compass-arrow range): **6/1600 pixels differ (0.38%)** — the
  original doc's "byte-identical, 0 differing pixels" claim does NOT hold at full
  precision; it is very close to identical, not exactly identical. Corrected here rather
  than left standing.
- Tiles 25-44 (moon-phase range): **1280/1280 pixels differ (100.00%)** — sharper than
  the original "~45% of pixels distinct" (that figure was describing the COMBINED 0-44
  range, not the moon range in isolation; see below). Every moon-range pixel resolves to
  a different colour. Spot check, tile 25's fill: DOS EGA index 5 = dark magenta
  `(170,0,170)` vs Amiga index 22 = `(170,85,0)` orange/brown (matches the original spot
  check).
- Combined (tiles 0-44): **1286/2880 pixels differ (44.65%)** — this is the number that
  matches the original doc's "~45%" almost exactly; the original text just applied it to
  the wrong sub-range (implying the moon range specifically) rather than the whole block.
  **Two-sided as required**: NOT identical, with an exact count, at both the block-wide
  and per-range level — real Amiga art/palette content for the moon tiles, not a decode
  artifact (a genuine per-pixel decode misalignment would not produce a razor-clean
  0.38%-vs-100% split between the two ranges).

**Block 203 (set 0)** — not previously measured at the RGB level (the original pass only
noted the 45-vs-46 tile-count mismatch). Measured this pass, tile-for-tile by position
0-44 (the mismatched count means position 44+ on the Amiga side may already be shifted by
the extra tile, so this comparison is only reliable for the low end of the range; not
re-aligned or otherwise corrected this pass):

- Tiles 0-24: 532/1600 pixels differ (33.25%).
- Tiles 25-44: 228/1280 pixels differ (17.81%).
- Combined: 760/2880 pixels differ (26.39%).
- Tile 25's fill matches exactly on both sides: `(170,170,170)` grey — unlike block 202,
  so whatever differs in this range is not simply "the moon phase differs the same way
  block 202's does."

Disclosed honestly: block 203's tile-count mismatch means these numbers are NOT
apples-to-apples the way block 202's are, and are reported as a raw positional
comparison, not a claim about true content identity. This is new information the
original doc did not carry (it only flagged the count mismatch); it does not change the
project's decision to ship both boot/frame sets as real Amiga content regardless of
whether they turn out fully, partially, or not at all pixel-identical to DOS.

## 5. Summary for the live toggle

**Updated 2026-09-03 (R1).**

| Wall-render set | Source | Amiga result |
|---|---|---|
| 0 (block 203) | boot/frame | real Amiga art; tile-count off-by-one at 46 vs 45; positional RGB compare 26.39% differing combined (new §4 measurement, not previously taken at the pixel level) |
| 1-3 (single bank, blocks 1/21/41/61 etc.) | wall bricks | **resolves via Amiga** — reassembled in natural chunk order, colour-mapped via block 202's palette, 1786/1792 (99.7%) tile-exact (§3); the prior "falls back to DOS" verdict was a tool bug, not a data limit |
| 4 (block 202) | boot/frame | real Amiga art; frame range 0.38% differing (was reported byte-identical — corrected), moon range 100.00% differing, combined 44.65% (matches the original "~45%" once applied to the right range) |

Unlike CoK (M9.S3), where the equivalent boot/frame sets turned out byte-identical to
DOS end-to-end, DoK's own boot set has a genuine, live-visible difference in its
moon-phase tiles. As of R1, DoK's wall-bricks category ALSO resolves via Amiga for the
first time — for a dungeon whose `setBlockIds` only exercise wall-bank series + boot sets
0/4 (e.g. GEO1#34, the M9.S4/S5 test dungeon), every wall-art category now reports
'Amiga', retiring the "mixed provenance" example that dungeon previously demonstrated
(`packages/engine/test/dungeonWallsAmigaDok.test.ts`); the DOS-EGA fallback path itself
remains real and exercised elsewhere in the same test and in other dungeons/games.
