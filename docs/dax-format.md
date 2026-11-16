# SSI Gold Box DOS `.DAX` Graphics Format

Reverse-engineered and verified empirically against Champions of Krynn (CoK) and
Death Knights of Krynn (DoK) DOS files in this repo, and cross-checked
byte-for-byte against `daxdump_extracted/DaxDump.exe` (the COAB DaxDump tool,
which produces decompressed block dumps).

Reference decoder: `tools/dax_decode.py`. Sample PNGs: `renders/dax/`.

All multi-byte integers are **little-endian**.

---

## 1. Container layout  — VERIFIED

```
offset  size  field
0       2     toc_bytes      = entry_count * 9   (TOC size in bytes)
2       9*N   TOC: N = toc_bytes/9 entries, each 9 bytes:
                +0  uint8   block_id      sparse id (NOT a 0..N-1 index)
                +1  uint32  data_offset   relative to data section base
                +5  uint16  raw_size      decompressed size (bytes)
                +7  uint16  comp_size     compressed size (bytes)
2+toc   ...   data section (concatenated RLE-compressed blocks)
```

- `data_base = 2 + toc_bytes`.
- Block *k* compressed bytes = `file[data_base + entry.data_offset : + entry.comp_size]`.
- `data_offset` values chain perfectly: `entry[i+1].data_offset == entry[i].data_offset + entry[i].comp_size`.
- **`block_id` is sparse** (e.g. CHEAD ids run 0–13, 64–77, 128–141, 192–205).
  DaxDump labels its output files `NAME_<block_id>.bin`, confirming this.
- **`block_id` is also NOT unique** — see §1a.

> Note: `tools/dax_inspect.py` mislabelled word0 as `entry_count` and word1 as `table_offset`
> until 2026-08-25. In reality **word0 = entry_count × 9**, and the bytes it read as "word1"
> are `block_id` (1 byte) + the low byte of entry 0's `data_offset`. `entry_count = word0 / 9`.
> The script now implements this layout and grew a `--verify` that requires the `data_offset`
> chain to be contiguous and the last block to end exactly at EOF.

### 1a. `block_id` is not unique — NEW 2026-08-25

Verified over **every DOS `.DAX` we hold: 11 titles, 636 files**. Two results.

**The chain closes 636 times out of 636.** Contiguous offsets, last block ending exactly at EOF,
no exceptions. That is the corpus-wide null for §1 above — the superseded two-word reading put
`8X8D1.DAX`'s data at 489 instead of 74 and nothing ever objected, because nothing asked the
bytes to add up.

**Three files repeat an id**, all of them Champions of Krynn, and nothing else in the corpus does:

| file | entries | repeated id | the two payloads |
| --- | --- | --- | --- |
| `PIC1.DAX` | 18 | 34 | byte-identical |
| `SPRIT3.DAX` | 13 | 35 | byte-identical |
| `SPRIT2.DAX` | 18 | **14** | **different — two separate sprites** |

`SPRIT2.DAX` id 14 is the one that matters. Both entries are well-formed 3-frame animation
arrays (§4c) that consume their block exactly — `56×80 / 32×65 / 24×57` at TOC index 5, and
`48×80 / 40×65 / 24×57` at TOC index 12 — so neither is truncated junk that could be dismissed
as a packer accident. Any consumer resolving a block by id has to choose between them.

**Which one the retail engine picks is UNLOCATED.** Three oracles were tried and none settled it,
recorded so the next attempt does not repeat them:

- The COAB C# decompile (`coab_extracted/Classes/DaxFiles/DaxFileCache.cs`) builds its table with
  `Dictionary.Add`, which **throws** on a duplicate key. It would crash on this file rather than
  choose, so the clean-room reimplementation is not an oracle here — it was only ever exercised
  against Curse, which has no duplicates.
- `add reg,9`, the obvious TOC-scan stride, **does not occur at all** in CoK's `GAME.OVR` or
  `START.EXE`, so the scan loop was not found by that signature.
- Amiga `SPRIT2.DAA` carries id 14 exactly once, but all 17 of its sub-blocks are a uniform
  88×88 canvas, so geometry cannot discriminate. A bounding-box measurement of the non-background
  pixels returned the full 88×88 for **all 17**, including the ten whose DOS twins are
  unambiguous — that control says the method does not work, rather than that it favours one
  candidate.

Meanwhile the engine resolves the ambiguity **inconsistently**: `.find()` (first wins) in
`cokFont.ts` and `dqkArtMap.ts`, `new Map(blocks.map((b) => [b.blockId, b.raw]))` (last wins) in
four `apps/web/src/ui` modules. No shipped route hits it today — the Map sites read
ECL/GEO/WALLDEF/MON/TILES, none of which is one of the three files above — so the resolution
order was left alone rather than changed on a guess. What **is** enforced is that the ambiguity
stays visible: `packages/engine/test/daxDuplicateBlockIds.test.ts` requires `readDaxDataBlocks`
and `decodeDax` to keep both entries, and `tools/test_dax_block_ids.py` pins the corpus counts.

Worked example — `Champions of Krynn/8X8D1.DAX`:
`word0 = 0x0048 = 72` ⇒ `entry_count = 8`, `data_base = 2 + 72 = 74`.
Entry 0 = `{block_id=201, data_offset=0, raw=1416, comp=1341}`.

---

## 2. RLE decompression  — VERIFIED (byte-identical to DaxDump)

Signed-byte run length (the classic SSI / PCX-family scheme):

```
i = 0
while i < len(comp):
    c = comp[i]; i += 1
    if c < 0x80:                       # literal run
        copy the next (c + 1) bytes verbatim;  i += (c + 1)
    else:                              # repeat run
        emit the next byte (256 - c) times;    i += 1
```

Output length equals the entry's `raw_size` exactly. Verified by decompressing
every block of CHEAD/8X8D1/BIGPIC1/TITLE and comparing to `DaxDump.exe`'s
`*.bin` dumps — **identical**.

(Equivalently with signed arithmetic: `s = c if c < 128 else c-256`;
`s >= 0` → `s+1` literals; `s < 0` → `-s` repeats.)

### 2a. The writer's envelope is narrower than the reader's — VERIFIED (2026-08-21)

The rule above says what a decoder must *accept*. It does **not** say what an encoder may
*emit*, and the two differ. Walking the control-byte stream of every shipped DOS Gen1 `.DAX`
we hold — **563 files across all eight DAX titles, 8271 blocks, 2,339,310 control bytes** —
SSI's own compressor never once writes `0x7E`, `0x7F` or `0x80`:

| control | means (our decoder) | occurrences in shipped data |
| --- | --- | --- |
| `0x7D` | 126 literals | **11,707** |
| `0x7E` | 127 literals | **0** |
| `0x7F` | 128 literals | **0** |
| `0x80` | 128 repeats | **0** |
| `0x81` | 127 repeats | **15,789** |
| `0x82` | 126 repeats | 239 |

**The null matters here**: a zero count only means something if the neighbouring alphabet is
exercised, and it is — 126 of the 128 literal controls and 127 of the 128 repeat controls
appear, the two and one absentees being exactly the values above. The counts either side are
not merely non-zero but *spikes*: `0x7D` outnumbers each of `0x76`..`0x7C` (~100 apiece) by
more than 100x, and `0x81` outnumbers `0x82` by 66x. That is the signature of an encoder
saturating at a cap, not of a rare symbol. **SSI's longest run is 126 literals or 127
repeats.**

So: **any Gen1 stream we write must cap literal runs at 126 and repeat runs at 127.**
`tools/patch_pool_ecl_transition.py` capped literals at 128 until 2026-08-21, which made every
chunk of a payload of 128 bytes or more emit control `0x7F`. Our own decoder reads that back as
a 128-byte literal run and reproduces the input exactly, so the archive round-tripped perfectly
through our tools and would only have failed inside the game. `tools/test_gen1_rle_control_envelope.py`
now guards the encoder and re-measures the corpus null on every run.

A sibling claim — that retail's Gen1 decompressor treats `0x7F` and `0x80` as dead controls
that emit nothing, which would make the reader above wrong as well — is **not adopted**, and
the decoder is unchanged. It could not be re-derived from the binaries in this repo: CoK's and
DoK's `START.EXE` hold the resident DAX loader and ship **EXEPACK-compressed** (the unpacker
stub is at file offset `0xEAB0` in CoK's), so the routine is not on disk to disassemble, and
`GAME.OVR` — which is plain — contains no `cmp al,7Eh` at all. The distinction is unobservable
on every byte we hold, in either direction. Constraining the writer needs no such claim, which
is why the fix is on that side only. (The Gen2 sibling *is* settled: `MONCHA`'s `0x80` no-op
was read straight off DQK's decompressor at `00d7:0a1c` — see `docs/hlib-format.md`.)

---

## 3. Pixel encoding  — VERIFIED

All graphics blocks store pixels as **chunky 4 bits-per-pixel, 2 pixels per byte,
HIGH nibble = left pixel**. Each nibble is an index 0–15 into the fixed EGA
palette (§5). There are **no bitplanes** — it is *not* EGA-planar; it is packed
chunky nibbles. (Most bytes have values > 15, which is what proves 2 px/byte
rather than 1 byte/pixel.)

Bytes per row = `width / 2`.

---

## 4. Frame headers

### 4a. Standard rectangular frame — VERIFIED (17-byte header)
Used by TITLE, BIGPIC, BACK (combat backdrops), CHEAD (combat heads), WALLDEF-style
full rectangles, etc. The header is **17 bytes**, confirmed against the COAB clean-room
decompile (`coab_extracted/Classes/DaxFiles/DaxBlock.cs`):

```
offset  size  field
0       2     height       (pixels)
2       2     width_div8   width in pixels = width_div8 * 8
4       2     x_pos        (placement; usually 0)
6       2     y_pos        (placement; usually 0)
8       1     item_count   number of same-size items (1 = single frame; ≥2 = tile array)
9       8     field_9      EGA-plane / editor metadata (ignored for render)
17      ...   pixel data: item_count * height * (width/2) bytes, chunky 4bpp (§3)
```

**Pixels start at byte 17, not 8.** An earlier 8-byte assumption read every frame 9
bytes early, cyclically rolling it RIGHT by 18 px (rightmost 18 columns wrapped onto
the left margin — subtle on 304-px BIGPIC scenes, badly garbling 24-px portraits).
Verified across every CoK/DoK graphics DAX: all 734 single-frame blocks have
`item_count == 1` and `17 + width*height/2 == rawSize` **exactly** (no trailing bytes),
and the corrected EGA BIGPIC render is column-aligned with the Amiga DAA decode of the
same scene. The "standard frame" is simply the `item_count == 1` case of the same block
layout the multi-item tile arrays (DUNGCOM / 8X8D) use. Verified examples:

| File / block        | header (h, w/8) | width×height | renders as |
|---------------------|-----------------|--------------|------------|
| TITLE_001 (CoK)     | (200, 40)       | 320×200      | SSI/AD&D title screen (legible text) |
| TITLE_004           | (88, 40)        | 320×88       | title art strip |
| BIGPIC1_112 (CoK)   | (120, 38)       | 304×120      | outdoor scene (trees, cabin) |
| BACK1_001 (DoK)     | (88, 11)        | 88×88        | combat backdrop (mountains) |
| CHEAD_000 (CoK)     | (10, 3)         | 24×10        | combat head icon |

`width = width_div8 * 8` was confirmed across all of the above (e.g. big-pic
width 304 also matches the hackdoc `DRAW18.TXT`, which states a big-pic row is 304
pixels wide).

#### Horizontal-roll quirk (TITLE block 1) — handled on decode
A few full-screen frames are stored **horizontally cyclic-rolled**: every row is
rotated so the leftmost ~N columns actually belong on the right edge (the on-disk
SSI boot screen `TITLE.DAX` block 1 is rolled **+13 px** — its left margin is the
true right margin). Decompression is byte-identical to `DaxDump.exe`; only the
framing is shifted, so a dumb dumper shows the same wrapped image. The decoders
(`tools/dax_decode.py` `_deroll_indices`, engine `derollFrameIndices` in
`packages/engine/src/loaders/dax.ts`) un-roll it with a conservative, data-driven
detector: for full-screen frames (≥64×64) only, find the shift `k` (≤ min(40, w/4))
that best makes column 0 match column w-1 across all rows; apply it **only** when
the unshifted borders are clearly torn (miss₀ ≥ max(8, 10% of height)) and some
`k>0` makes them essentially seamless (≤2 mismatched rows, and ≥8× better than
miss₀). This fires on exactly 1 of 26 CoK frames (TITLE block 1) and leaves
full-bleed art untouched. Synthetic coverage: `packages/engine/test/dax-deroll.test.ts`.

### 4b. 8×8 dungeon-tile strips — VERIFIED (rendered), header partly assumed
`8X8Dn.DAX` blocks have header `{height=8, width_div8=1, ...}` but the payload is a
tall **vertical strip of stacked 8×8 tiles laid out 16 px wide** (two tiles per
row), not a single 8×8 image. Payload length is always `8*k + 1` bytes (one
leading/extra byte), so: `width = 16`, `height = (raw_size-8) // 8`. Rendered
output is coherent dungeon wall / door art, so the 16-px-wide layout is correct;
the exact meaning of the `+1` byte and the per-tile grouping is **assumed**.

### 4c. Complex / transparent frames — SOLVED (superseded 2026-06)
Most `PIC*.DAX` and `SPRIT*.DAX` blocks (and some `WALLDEF*`) use a different,
richer header: word1 (`width_div8`) is **0** and extra header words are non-zero
(e.g. SPRIT1 `{3,0,0x5000,0x0700,…}`, PIC1 `{n,0,0x5800,0x0b00,…}` where
`0x58 = 88`). These are a transparency / multi-sub-frame variant analogous to UA
"drawing method 23" (`DRAW23.TXT`). **This DOS-side codec is now cracked** — see
`docs/engine/research/dax-complex-subframe.md` and `docs/engine/ROADMAP.md` (search
"complex-DAX CRACK"); `packages/engine/src/loaders/dax.ts` and the asm `ccdaa.asm`/`cgb.asm`
pair decode it. The *Amiga* `.DAA` equivalent (its own 6-byte sub-frame variant) is **also
solved** now — see `docs/daa-format.md` §1b and `docs/engine/research/subframe-format.md`
(`tools/subframe_decode.py`), tracked separately from this doc since it's a distinct codec.

---

### 4d. Gateway to the Savage Frontier — VGA-extended picture frames (a DIFFERENT format)

This whole document describes the DOS **EGA** DAX format (CoK/DoK, and — proven by byte
comparison — Gateway's own dungeon-exploration tile/wall art too: `8X8D2.DAX` and
`WALLDEF2.DAX` decode through the exact same paths above with no changes needed). But
Gateway's *splash/scene picture* blocks (`TITLE.DAX`, `BIGPIC1.DAX`) plus its small-icon
and body-art families (`CPIC2.DAX`..`CPIC6.DAX`, `BODY.DAX` — all confirmed, 178/178
blocks across the static family, zero slop, exact round-trip) are a genuinely different, VGA-specific
32-color format: the 17-byte header is followed by a 33-byte metadata **prefix**, then
five consecutive one-bit planes per row (least-significant plane first, MSB-first pixels).
The byte count is `17 + 33 + height * 5 * width_div8`. This supersedes the earlier
equally-sized but visually noisy "4bpp nibble + extension plane + trailer" interpretation.
A native t=150 RAM checkpoint contains Gateway's expanded 48×48 Giant Squid CPIC; the
correct planar decode matches its index structure and frame t0128 exactly. See
`docs/engine/research/gateway-vga-picture-format.md` for the full derivation (including
`GAME.OVR` machine code proving genuine VGA DAC-register programming beyond EGA's
16-color range) and `packages/engine/src/loaders/daxVgaPicture.ts` /
`packages/engine/test/dax-vga-picture.test.ts` + `dax-gateway-picture-families.test.ts`
for the decoders and their retail-byte parity proofs. The tactical capture additionally proves
its blue-field and squid red/green DAC entries; unrelated extension entries remain unclaimed.

Gateway's `CBODY.DAX`, `CHEAD.DAX`, `COMSPR.DAX` (26/28 blocks), and `DUNGCOM.DAX` turned
out, despite superficially resembling the VGA-extended families above (same portrait/
sprite naming pattern), to be genuinely **plain EGA** — identical headers, identical
zero-slop size formulas, no extension plane. `CBODY.DAX`'s 24×24 frames at exactly 305
bytes vs. `CPIC*.DAX`'s identical 24×24 geometry at 410 bytes (VGA-extended) is the
clearest single proof that the split is real, not a decoder gap. Two `COMSPR.DAX` blocks
(id 254, 255) have an all-zero geometry header — **resolved 2026-07-23** (research doc
Part 19): they are pixel-less planar5 **structure records** (zero geometry → zero pixel
bytes, then the Part 18 category-gated component stream, zero slop), loaded at boot into
dedicated globals and applied VGA-mode-only via the draw-image primitive after the
exploration-view (255) and 3D-view (254) draws; component meanings remain unidentified.
Decoder: `parseGatewayPicStructureRecord` (kind `'gateway-structure-record'` in
`dax.ts`); reference: `tools/gateway_pic_decode.py --structure-records`. Gateway's
`PIC.DAX`/`PIC2..6.DAX` portrait blocks are a genuinely distinct THIRD packing —
**solved 2026-07-22** (research doc Part 17) via a live-captured loader output buffer as
oracle: the plain-EGA `parseAnimatedPicture` container shape (§4c: `u8 numFrames` +
21-byte frame header) is followed by a 17/33/41-byte PREFIX structure (selected by the
frame-header category byte at offset 14; earlier passes mistook it for a trailer), then
the pixels as per-row 5×1-bit planes (LSB plane first, MSB-first bits, 5-bit chunky
output 0..31). Decode is byte-identical to the captured loader buffer for `PIC2.DAX`
block 5 and exact-fit + lossless-round-trip for all 72 single-frame retail blocks.
Decoder: `parseGatewayPicPlanar5` in `packages/engine/src/loaders/daxVgaPicture.ts`
(tests: `dax-gateway-pic-planar5.test.ts`); reference: `tools/gateway_pic_decode.py`.
Still open: the prefix component meanings and unused DAC 18..31 RGB values. Full derivation for all
of the above: `docs/engine/research/gateway-vga-picture-format.md` Parts 3, 6 and 17.

### 4e. Treasures / Pools late-Gen1 embedded-palette VGA resources

Treasures of the Savage Frontier and Pools of Darkness add two direct-8bpp families. Both carry
their own 6-bit DAC colors, so they are not Gateway planar5 and must not inherit the fixed EGA
palette.

The uncompressed item-array form stores byte geometry/count, palette base and color count, DAC
triples, a half-color lookup seed, four flags, and `count * width * height` row-major indices.
`parseVgaChunkyItems` / `parse_vga_chunky_items` accept it only at an exact byte fit.

The compressed `PIC*.DAX` form stores 16-bit geometry/placement, palette base/count, DAC triples,
the same seed/flags class, then `{u16 zero, u16 compressedLength, u8 mode, payload}`. The mode byte
is outside `compressedLength`. Payload is flat DRAW18/PackBits: controls below 128 copy `c+1`
literals; controls at or above 128 repeat the next byte `257-c` times. Decoding must consume the
complete payload and produce exactly `width * height` indices. Treasures `PIC1#21` matches the
retail loader's 7,744-byte RAM output byte-for-byte. Implementations:
`packages/engine/src/loaders/daxVgaChunkyItems.ts`, `daxVgaCompressedPicture.ts`, and
`tools/dax_decode.py`; retail and synthetic tests reject length slop and invalid DAC data.

---

## 5. EGA palette  — the 16 fixed colors used for rendering

CoK/DoK DOS are EGA 16-color and do **not** store a palette in the file. The
decoder uses the standard IBM EGA default palette (with the corrected brown at
index 6). RGB 0–255:

| idx | RGB           | name        | idx | RGB           | name          |
|-----|---------------|-------------|-----|---------------|---------------|
| 0   | 00 00 00      | black       | 8   | 55 55 55      | dark gray     |
| 1   | 00 00 AA      | blue        | 9   | 55 55 FF      | bright blue   |
| 2   | 00 AA 00      | green       | 10  | 55 FF 55      | bright green  |
| 3   | 00 AA AA      | cyan        | 11  | 55 FF FF      | bright cyan   |
| 4   | AA 00 00      | red         | 12  | FF 55 55      | bright red    |
| 5   | AA 00 AA      | magenta     | 13  | FF 55 FF      | bright magenta|
| 6   | AA 55 00      | brown       | 14  | FF FF 55      | yellow        |
| 7   | AA AA AA      | light gray  | 15  | FF FF FF      | white         |

The title screen and scene renders come out with correct, expected colors
(cyan sky, green foliage, brown/red structures, white text), which corroborates
this palette and the high-nibble-first nibble order.

---

## 6. Verified vs assumed vs unsolved

**VERIFIED (against raw bytes and/or DaxDump.exe):**
- Container header (`word0 = entry_count×9`), 9-byte TOC entry layout
  `{u8 block_id, u32 data_offset, u16 raw_size, u16 comp_size}`, sparse block ids.
- Signed-byte RLE algorithm (byte-identical output to DaxDump), and separately the
  **writer envelope**: SSI never emits control `0x7E`, `0x7F` or `0x80` in 2.34M shipped
  control bytes, so encoders cap at 126 literals / 127 repeats (§2a).
- Chunky 4bpp, 2 px/byte, high-nibble-first pixel packing.
- Standard frame **17-byte** header `{u16 height, u16 width_div8, u16 x, u16 y,
  u8 item_count, u8[8] field_9}`, pixels at offset 17; `width = width_div8 * 8`.
  Confirmed against the COAB `DaxBlock.cs` oracle and on TITLE, BIGPIC, BACK, CHEAD
  across CoK+DoK (734/734 single frames: `item_count==1`, exact `17 + w*h/2` fit), with
  the corrected EGA BIGPIC column-aligned to the Amiga DAA decode.
- EGA palette / nibble order (colors render correctly).

**ASSUMED (renders correctly but not fully proven):**
- 8×8 tile strips are 16 px wide with a single leading pad byte; exact tile
  grouping and the meaning of `y_off`/`x_off` placement words.
- The few trailing pad bytes after standard-frame pixel data.

**UNSOLVED:**
- Whether retail's Gen1 decompressor treats controls `0x7F`/`0x80` as dead (emitting nothing)
  or as our decoder does (128-byte runs). Unobservable on all data we hold — 0 occurrences
  either way — and the routine lives in EXEPACK-compressed `START.EXE`, so it cannot be read
  off disk. Immaterial to reading; handled on the writer side by §2a instead.
- Remaining title-specific "complex" records not accepted by the solved DOS method-23,
  Gateway planar5, or late-Gen1 embedded-palette codecs. Decoders reject these records rather
  than routing them through a visually plausible but unproven format.
- Whether any block carries an explicit per-file palette override (none seen in
  CoK/DoK; expected, since these are fixed-palette EGA).

---

## 7. Using the decoder

```
python tools/dax_decode.py <file.dax> [--out DIR] [--scale N] [--list]
```

Lists every block (id, raw/comp sizes, detected kind) and writes one PNG per
renderable frame to `renders/dax/<stem>/<stem>_<block_id>.png` (or `--out DIR`).
`--list` inspects without rendering. Pillow is used if present; otherwise a
built-in raw-PNG writer is used.
