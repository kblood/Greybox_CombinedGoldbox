# SSI Gold Box multi-sub-frame format — SPRIT* / PIC* / big HEAD*

Status as of 2026-06-25.

This documents the "6-byte sub-frame index variant" / "complex transparent frame"
that the older decoders flagged unsolved (`docs/dax-format.md` §4c; `tools/daa_decode.py`
"index" kind; `native/src/ccdaa.asm` "SUBFRAME (unsolved)").

- **DOS `.DAX` — SOLVED and verified** (163/163 SPRIT/PIC blocks parse exactly;
  pixels render as coherent sprites and 88×88 portraits).
- **Amiga `.DAA` — SOLVED and verified (2026-06-25)** by disassembling the Amiga
  68000 `game` binary. Inner pixel codec = the Amiga sprite RLE (`game` hunk 88)
  feeding a 5-plane contiguous planar bitmap. **158/158** 6-byte-index sub-blocks
  across all CoK+DoK SPRIT/PIC files decode to full stream consumption; CoK
  PIC1 id 60 matches the DOS PIC1 id 60 scene. See §3. (The Amiga `HEAD*`/`CPIC*`/
  `comspr` files are NOT this format — they are 9-byte-TOC standard-frame
  containers; the "~11 mis-routed files" note is resolved, see §3.5.)

Decoder: `tools/subframe_decode.py` (reuses `dax_decode` / `daa_decode` helpers).
Renders (git-ignored): `renders/subframe/`.

---

## 1. What these blocks are

`SPRIT*` (combat/overworld monster + class sprites), `PIC*` (encounter pictures /
portraits), and the larger `HEAD*` frames are **animation arrays**: one DAX/DAA
block holds several same-subject frames (the classic Gold Box zoom levels for a
sprite, or a 1-frame static picture, or a multi-frame animated picture). The
older single-rectangle parser bailed because the block's *first* bytes are a
frame count, so the standard `width_div8` field at offset 2 reads as 0.

This is **not** a 4th container generation — on DOS it is an ordinary 9-byte-TOC
`.DAX` block whose decompressed payload is an array. On Amiga it *is* a distinct
6-byte index container. (Exception: the Amiga `HEAD*` files are NOT 6-byte-index —
they ship as plain 9-byte-TOC standard frames, matching the DOS `HEAD*.DAX` block
ids and dimensions exactly; see §3.5.)

---

## 2. DOS `.DAX` — SOLVED

### 2.1 Rosetta Stone
The COAB clean-room DOS decompile loads these in
`coab_extracted/engine/ovr030.cs` (the `daxArray` loader). That code is the
authority; the layout below is a direct transcription, then verified on bytes.

### 2.2 Block layout (after the normal DAX signed-byte RLE)

```
offset 0 : uint8  numFrames
then numFrames × per-frame record (little-endian):
   +0   int32   delay         animation delay (1/10 s); 0 for static PICs
   +4   uint16  height        pixels
   +6   uint16  width_div8    width in pixels = width_div8 * 8
   +8   uint16  x_pos         placement offset (engine draws at x_pos+2)
   +10  uint16  y_pos         placement offset (engine draws at y_pos+2)
   +12  1 byte  pad           (engine reads 2-byte y_pos then src += 3)
   +13  8 bytes field_9       EGA-plane / editor metadata (ignored for render)
   +21  pixels: height * width_div8 * 4 bytes
          chunky 4 bits-per-pixel, 2 px/byte, HIGH nibble = left pixel,
          each nibble = index 0..15 into the fixed EGA palette.
          Per row = width_div8*4 bytes = width_div8*8 = `width` pixels.
```

`bpp` in `DaxBlock.cs` is `height*width*8` where `width` there is `width_div8`;
`ega_encoded_size+1 = bpp/2 = height*width_div8*4` = the pixel byte count above.

### 2.3 Transparency / mask
The engine loads these with `masked=1` and recolors the picture's mask color to a
transparent sentinel (index 16) — see `DaxBlock.SetMaskedColor` / `Recolor`.
For sprites the background index is the magenta-ish color. `subframe_decode.py
--mask N` paints index N as a visible checkerboard.

### 2.4 PIC XOR-delta animation (PIC*/FINAL* with numFrames > 1)
For files named `PIC*` or `FINAL*` only, frame 0's pixel bytes are stored
verbatim and **each later frame's pixel bytes are XORed against frame 0's**
(`ovr030.cs`: `uncompressed_data[src+i] ^= first_frame_ega_layout[i]`). The
decoder un-deltas these. `SPRIT*` frames are independent (no delta).

### 2.5 Verification
- 163/163 "complex" (width_div8==0) SPRIT/PIC blocks across all CoK + DoK files
  parse with `consumed == raw_size` exactly (no slack, no shortfall).
- Frame dimensions are the expected Gold Box zoom set, e.g. CoK `SPRIT1` block 1
  = `56×80, 32×65, 24×57`; DoK `PIC1` blocks = single `88×88`.
- Rendered PNGs are coherent: armored draconian/knight and dragon sprites
  (`renders/subframe/dos_cok_sprit1/`), an 88×88 sorceress and an old warrior
  and a hooded mage (`renders/subframe/dos_dok_pic1/`).

### 2.6 Field table (DOS)

| field      | offset | size | endian | meaning                              |
|------------|-------:|-----:|--------|--------------------------------------|
| numFrames  | 0      | 1    | —      | frame count (1..~6)                  |
| delay      | +0     | 4    | LE     | per-frame animation delay (1/10 s)   |
| height     | +4     | 2    | LE     | pixels                               |
| width_div8 | +6     | 2    | LE     | width pixels = ×8                     |
| x_pos      | +8     | 2    | LE     | placement                            |
| y_pos      | +10    | 2    | LE     | placement                            |
| pad        | +12    | 1    | —      | 1 byte                               |
| field_9    | +13    | 8    | —      | EGA-plane/editor metadata, ignored   |
| pixels     | +21    | h·w8·4 | —    | chunky 4bpp, 2px/byte, hi nibble left |

---

## 3. Amiga `.DAA` — SOLVED (codec read from the 68000 binary)

### 3.0 The oracle: the Amiga `game` executable
There is no C decompile for the Amiga build, so the codec was read directly from
the disassembled engine. The binary is
`amiga_extracted/ChampionsOfKrynn/disk1/game` (479,844 bytes, Amiga Hunk format,
101 `HUNK_CODE` hunks — SAS/Lattice C, one function per hunk, cross-hunk calls
via `RELOC32` to the target hunk base). It is launched by `s/startup-sequence`
(`run >nil: game`). Disassembled with Python **capstone** `CS_ARCH_M68K /
CS_MODE_M68K_000`.

**Call chain to the picture decoder (all addresses are byte offsets within the
named hunk):**
- **hunk 42** (the `PIC`/`FINAL`/`SPRIT`/`HEAD`/`BIGPIC`/`BODY` module — it holds
  those literal strings at hunk-42 +65/+243). Its picture routine reads the
  6-byte index entries inline (`Read` 6 bytes via the C-lib `Read` stub), then
  per sub-block: `Seek` to the sub-offset, `AllocMem`, `Read` the compressed
  bytes, then calls the decompressor **twice** on one continuing source pointer:
  hunk-42 @1832 decodes the header segment, hunk-42 @2118 decodes the frame
  bitmap segment. Bitmap allocation/sizing goes through **hunk 29** (@`$408`).
- **hunk 88** (328 bytes, entry @ **offset 12**) is the decompressor. Its inner
  loop is the codec below. (The IFF/ILBM path — hunks 40/86, which dispatch on
  `'FORM'`/`'LIST'`/`'CAT '`/`'PROP'` — is a *different* loader used for `.LBM`
  title/font screens, not `.DAA`.)
- **hunk 49** is the planar masked blit (`and`/`not`/`or` per byte across
  bitplanes) → confirms the decoded buffer is a native Amiga **planar bitmap**.
- **hunk 21** is the graphics.library glue (`movea.l $0(pc),a6` + `jmp -LVO(a6)`).

### 3.1 6-byte index container (SOLVED)
`SPRIT*.DAA` / `PIC*.DAA` (7 files: CoK `pic1`/`pic2`/`SPRIT1`/`SPRIT2`, DoK
`PIC1`/`PIC2`/`SPRIT1`) use a 6-byte index TOC instead of 9-byte — Amiga `HEAD*`
does NOT (see §3.5):

```
offset 0 : uint16 word0 (BE) = 2 + n*6 = data_base
offset 2 : n entries × 6 bytes:
             uint8  id
             uint8  0           (always zero)
             uint32 sub_offset  (BE; relative to data_base)
```

Each indexed entry's bytes = `file[data_base+sub_offset : next_sub_offset]` (entries
sorted by offset; last runs to EOF). The six-byte index only establishes entry
boundaries; internal compressed framing is specific to the game resource and must
be traced through its caller. In the pinned CoK `SPRIT1.DAA` and `SPRIT2.DAA`
candidate archives, all 34 entries contain a length-delimited header and three separately
length-delimited frame chunks (see §3.3b); they are not uninterrupted RLE streams.

### 3.2 Inner codec — the Amiga sprite RLE (hunk 88 @+12)
Transcribed directly from the 68000 loop. Decisive instructions (hunk 88):

```
+72 : 1413              move.b (a3),d2        ; read control byte c
+86 : 0c6d 007f fff6    cmpi.w #$7f,-$a(a5)   ; c <= 0x7f ?
+92 : 6f00 000e         ble  -> literal path  ;   yes: literal run
+96 : 142d ... ; +100: 0442 0100  subi.w #$100,d2   ; else c -= 0x100 (signed)
+192: 0c6d ff80 fff6    cmpi.w #$ff80,-$a(a5) ; c == -128 (0x80) ?
+198: 6700 0054         beq  -> skip          ;   yes: emit nothing
+206: 4442              neg.w d2              ; n = -c
+208: 5242              addq.w #$1,d2         ; n = (256 - c) + 1
+160: 1493              move.b (a3),(a2)      ; literal: copy byte, loop n times
+254: 1b53 fff5 ; +266: move.b -$b(a5),(a3)  ; run: write the single byte n times
```

So, reading one control byte `c`:
```
c <= 0x7f          : copy next (c + 1) literal bytes
c == 0x80          : no-op (emit nothing)
0x81 <= c <= 0xff  : repeat the next single byte ((256 - c) + 1) times
```
This is *almost* the DOS/outer-container signed-byte RLE but with the `+1` on the
run count and the `0x80` no-op — a distinct variant, **only** used here for the
SPRIT/PIC pixel stream. The caller passes an explicit output-byte budget
(`$8(a5)`); the loop stops when the budget is exhausted (it does **not** read a
length from the data), which is why one continuous stream yields header then
frames.

### 3.3 Historical whole-stream interpretation (not a universal native layout)
The historical offline renderer decodes each entry as one continuous stream and
interprets its output prefix as a header followed by planar frames. That model
reproduced selected pixels, but it is not a universal native layout: the bounded
CoK `SPRIT1/2.DAA` audits in §3.3b prove that these entries instead contain
separate length-delimited compressed chunks. The following offsets describe the
historical combined-stream view only:

```
+0  uint8   pix_off        legacy header output budget (not a verified bitmap start)
+1  uint16  height (BE)    88
+3  uint16  width_div8(BE) 11  -> 88 px
+5  uint16  x_pos (BE)
+7  uint16  y_pos (BE)
+9  uint8   flag           0
+10 uint8   numFrames      frame/zoom count (matches the DOS array count)
+11 64      palette        32 × BE uint16 0x0RGB (12-bit Amiga; channel×17)
+75 ...     per-frame table (CoK: 2 bytes/frame, hence pix_off = 75 + 2*numFrames;
            DoK uses a different table size, so pix_off varies independently).
```

In that combined-stream view, `numFrames` is read from offset 10 and `pix_off`
from offset 0. Do not use those offsets to describe the native segmented header
of SPRIT1#1: its header starts one byte later in the historical stream and has
frame count at offset 9. The earlier draft generalized CoK offsets to DoK; this
was too broad and remains unverified outside the exact cases audited below.

#### 3.3a Bounded single-frame alignment correction (2026-10-27)

`tools/amiga_cokdok_render.py::decode_subblock` records an alignment correction
found on 2026-10-14. It decodes the complete sprite-RLE stream and derives
`start = decoded_length - numFrames * (frame_size + 1)`. For CoK `PIC1.DAA` #18,
the archive SHA256 is
`b3512ed6a030ac27538ae66f6115bdf0bf1f5a78e63eba0d32fef3e32b049687`:
the header field is 77, the actual derived start is 87, and the sole bitmap is
88×88 (5,280 planar bytes). This explains the shifted legacy render without a
universal ten-byte offset adjustment. One extra byte follows each stored bitmap;
this correction does not assign its purpose.

The TypeScript loader now offers an explicit per-ID option:
`decodeDaa(bytes, name, { singleFrameTailBlockIds: [18] })`. The caller must verify
archive identity independently. The option accepts exactly one stored frame,
checks geometry/palette/frame span, bounds the header to 77..256 bytes, rejects
truncated RLE runs and caps decompressed output at 82,177 bytes. Selected malformed
or absent IDs throw with block context; all unselected entries and all existing
default callers preserve legacy behavior. Later frames, XOR deltas and other
families need separate evidence before selecting this path.

`packages/engine/test/daaSingleFrameTail.test.ts` provides portable independent
synthetic pixel/palette and malformed/bounds controls. Set `GB_DAA_TAIL_ORACLE`
to the pinned local archive to run the optional differential against the corrected
Python renderer, including equality of all unselected entries to the default
decoder. Neither source data nor Python/numpy are required by the portable suite.
Selected entries also expose `tailLayout` with an exact-sized owned
`decodedStream`, layout discriminator `amiga-sprite-single-frame-tail-v1`,
`bitmapStart`, `planarByteLength` and `frameStride`; #18's measured sizes/offsets
are 5,368 / 87 / 5,280 / 5,281 bytes. The bounded decompression scratch buffer is
not retained. Default/unselected entries omit this property. Independent review
SHA256 pins for the full stream, indices, RGB palette and opaque RGBA accompany
the live Python comparison, preventing that oracle alone from redefining pixels.

#### 3.3b CoK Amiga SPRIT1/SPRIT2 — native segmented decode and composition (2026-11-05)

The earlier whole-entry/tail interpretation happens to recover the same stored
planar hashes for these entries, but it does not describe the native framing. The
bounded audit receipt is
[`cok-amiga-sprit-native-audit-v1.json`](cok-amiga-sprit-native-audit-v1.json),
reproducible with `tools/cok_amiga_sprit1_native_audit.py` against both exact pinned
candidate archives, the executable, and the prior per-frame hash receipt. It covers
all 17 index entries (51 frames) in disk 2 `SPRIT1.DAA` and all 17 entries (51 frames)
in disk 3 `SPRIT2.DAA`; it does not cover PIC or any other archive.

Each of the 34 entries starts with a two-byte big-endian compressed-header length `0x0051`.
Those 81 bytes decode to the native 86-byte header buffer. Each header carries
three compressed-frame lengths. Each compressed frame is followed by a two-byte
zero word (its purpose is unknown), and each frame chunk decodes exactly to the
5,280-byte planar bitmap capacity. Every entry is consumed exactly. All 51
segmented stored-planar hashes match the earlier per-frame receipt, so its pixel
data remains usable as stored-frame evidence even though its whole-stream framing
explanation was wrong.

The shared selector returns the first bitmap for selector 1; selectors 2 and 3
decode a work bitmap.
Hunk42 passes the first bitmap and selected work bitmap to a helper with minterm
`0x60` and plane mask `0xFF`; Hunk16 forwards the arguments to graphics.library
vector `-0x1E` (`BltBitMap`). The [AmigaOS minterm reference](https://wiki.amigaos.net/wiki/Graphics_Minterms)
defines `0x60` as source/destination XOR. This supports frame-0 XOR composition
for the selected frames. It corrects the earlier receipt's statement that this
path did not establish XOR. It does not prove selector timing or animation meaning.

A separate Hunk42 flag can route a bitmap through Hunk49's bit-reversal helper,
which reverses pixels horizontally. Whether that flag is set for a particular
game encounter remains unknown; the path does not establish vertical or palette
inversion. Final display uses a separate masked blit whose complete mask
construction is outside this audit.

The decoder, byte-span pins and synthetic boundary tests cover all 34 entries in
these two CoK SPRIT archives. Other CoK/DoK SPRIT/PIC entries still require per-entry
verification of header lengths, compressed chunks, trailing words, decoder
budgets and complete consumption before the segmented layout can be generalized.
Clean-retail archive
provenance, runtime observation, selector semantics and playback cadence remain
unverified; no Restyle or runtime admission changed.

### 3.4 Frame pixels — 5-plane contiguous planar bitmap
Each frame segment decompresses to a standard Amiga planar bitmap:

```
row_bytes  = ceil(width/16)*2          = 12 for width 88   (word-aligned)
plane_size = row_bytes * height        = 1056 for 88×88
frame_size = plane_size * 5            = 5280 for 88×88     (5 planes => 32 colours)
pixel(x,y) index = sum over p in 0..4 of
                   bit(plane[p], y*row_bytes + x/8, 7-(x&7)) << p
```
Contiguous (NOT ILBM per-row interleaved), plane 0 = LSB, MSB-first within a byte
— the same convention as standard `.DAA` frames (§ daa-format.md) and 8X8D tiles.
Index 0 is the transparent/background colour.

### 3.5 Verification (the proof)
The historical completion/visual evidence below did not prove exact bitmap
alignment and must be read with the narrower #18 correction in §3.3a. It does
not establish that every default-decoded frame is correctly aligned.
- **DOS == Amiga, same scene.** CoK `PIC1.DAA` id 60 decodes to the identical
  treasure/grail-chalice scene as DOS `PIC1.DAX` id 60 (88×88). Background-index
  match = **0.93** (residual is the genuine 16- vs 32-colour art difference, e.g.
  Amiga shading where DOS leaves index 0). Renders in `renders/subframe/`.
- **Full stream consumption.** Across the 7 true six-byte-index `.DAA` files in
  CoK + DoK (CoK `pic1`/`pic2`/`SPRIT1`/`SPRIT2`, DoK `PIC1`/`PIC2`/`SPRIT1`),
  **158/158** sub-blocks decode to within <300 bytes of the stream end with
  `frames == numFrames`. CoK SPRIT1 = 17×(3 frames, 88×88), DoK SPRIT1 =
  15×(3 frames).
- **The "~11 mis-routed" residue — RESOLVED (2026-07-18).** The earlier "158/169"
  tally counted 11 extra files (`comspr.daa` ×3, `COMSPR.DAA` ×2, `CPIC1.DAA`,
  `cpic2.daa`, DoK `CPIC1.daa` ×2, `HEAD1.DAA`, `HEAD2.DAA`) that this doc's own
  survey — and `subframe_decode.py`'s `amiga_index_entries`, which routed on
  `body % 6 == 0` alone — misclassified as 6-byte-index files. Their `word0` is
  divisible by both 9 and 6, but the 9-byte TOC chains perfectly to EOF: they are
  **ordinary 9-byte-TOC standard-frame containers** (daa-format.md §3/§4), never
  users of this sub-frame codec at all. `amiga_index_entries` now delegates to
  `daa_decode.parse_container` (the chain-validated router, which the TS port
  `packages/engine/src/loaders/daa.ts` always used), and `subframe_decode.py`
  renders such files through the standard-frame path. Cross-validation: Amiga
  `HEAD1.DAA` (== `HEAD2.DAA`, identical MD5) holds ids 68/69 at 88×40 — exactly
  matching DOS `HEAD2.DAX` ids 68/69 at 88×40, same woman-portrait scene in
  richer Amiga colors; `comspr`/`COMSPR`/`CPIC*` render the same 24×24 arrow and
  combat-sprite subjects as their DOS DAX namesakes (visually confirmed on both
  games; exact index-parity is not expected because the Amiga art is genuinely
  recolored 32-color work). Locked by `packages/engine/test/daa.test.ts`
  ("9/6-ambiguous files route to the 9-byte blocks path") and golden fixtures
  `comspr_0`/`CPIC1_129`/`HEAD1_68`/`COMSPR_0`/`CPIC1_1`.

---

## 4. Files

- `tools/subframe_decode.py` — DOS decoder/renderer + **Amiga decoder/renderer**.
  - `python tools/subframe_decode.py <SPRIT|PIC|HEAD>.DAX [--list] [--mask N]`
  - `python tools/subframe_decode.py <SPRIT|PIC>.DAA [--out DIR] [--list] [--mask N]`
    (Amiga: `rle_amiga_sprite` + `decode_amiga_subframe` render every frame).
- Renders (git-ignored) under `renders/subframe/`.
- DOS Rosetta Stone: `coab_extracted/engine/ovr030.cs`, `.../DaxFiles/DaxBlock.cs`.
- Amiga oracle: `amiga_extracted/ChampionsOfKrynn/disk1/game` (Hunk exe);
  decoder = hunk 88 @+12; picture module = hunk 42; planar blit = hunk 49.
