# SSI Gold Box AMIGA `.DAA` Graphics Format

Reverse-engineered and verified empirically against Champions of Krynn (CoK) and
Death Knights of Krynn (DoK) Amiga files in `amiga_extracted/`. The Amiga `.DAA`
format is the **big-endian, bitplanar, palette-carrying** cousin of the DOS
`.DAX` format (see `docs/dax-format.md`). Cross-validated against:
- the DOS `.DAX` render of the same-named blocks (`BIGPIC1` block 114 = identical
  scene, identical 304×120 dimensions, richer 32-color palette), and
- the game's own IFF ILBM title screen (`scrn1b.lbm`), which carries the same
  32-color Amiga palette and confirmed the PNG pipeline first.

Reference decoder: `tools/daa_decode.py` (container / standard frames / 8X8D tiles)
plus `tools/subframe_decode.py` (the 6-byte sub-frame INDEX variant — SPRIT*/PIC*/
HEAD*, legacy segmented interpretation, see §1b). The corrected tail-layout
reference is `tools/amiga_cokdok_render.py::decode_subblock`; the TypeScript
opt-in described below is restricted to one stored frame. Sample PNGs:
`renders/daa/`, `renders/subframe/`.

**All multi-byte integers are BIG-ENDIAN (Motorola 68000).** This is the single
biggest structural difference from DOS DAX (which is little-endian).

---

## 1. Container layout — VERIFIED

```
offset  size  field
0       2     word0          = 2 + entry_count*9   (BIG-ENDIAN). Also == data_base.
2       9*N   TOC: N = (word0-2)/9 entries, each 9 bytes, BIG-ENDIAN:
                +0  uint8   block_id      sparse id (NOT a 0..N-1 index)
                +1  uint32  data_offset   relative to data section base (BE)
                +5  uint16  raw_size      decompressed size (BE)
                +7  uint16  comp_size     compressed size (BE)
word0   ...   data section (concatenated RLE blocks)
```

- `data_base = word0` (i.e. `2 + N*9`). **Note the contrast with DOS DAX, where
  `word0 = N*9` and `data_base = 2 + word0`.** In DAA `word0` *includes* the
  2-byte header, so `data_base == word0`.
- Block *k* compressed bytes = `file[data_base + data_offset : + comp_size]`.
- `data_offset` chains perfectly: `entry[i+1].data_offset == entry[i].data_offset
  + entry[i].comp_size`, and the last block ends exactly at end-of-file.
- `block_id` is sparse, exactly like DAX (e.g. CoK `BIGPIC1` ids 112,114,115,116,121).

Worked example — CoK `disk2/BIGPIC1.DAA`: `word0 = 0x002F = 47 = 2 + 5*9`,
so 5 entries, `data_base = 47`. Entry 0 = `{id=114, off=0, raw=22873, comp=21250}`.

### 1b. The 6-byte sub-frame INDEX variant — SOLVED (2026-06-25)
Some files (all `SPRIT*`, CoK `pic1`/`pic2`, DoK `PIC1`/`PIC2` — 7 files total;
**not** `HEAD*`/`CPIC*`/`comspr`, see below) use `word0 = 2 + entry_count*6` with
a different TOC: each entry is 6 bytes `{u8 block_id, u8 zero, u32 sub_offset
(BE)}` and carries **no raw/comp sizes** — each sub-frame's length is
`next.sub_offset - this.sub_offset`.

**The inner sub-frame pixel encoding is now solved**, by disassembling the Amiga
`game` 68000 executable itself (there is no C decompile for the Amiga build, unlike
DOS COAB) — full write-up in `docs/engine/research/subframe-format.md` §3, decoder
in `tools/subframe_decode.py` (`--amiga` / auto-detected for `.daa`). Summary:

**Alignment correction, 2026-10-27:** the segmented interpretation below describes
the compatibility decoder, not a verified bitmap start. For the pinned CoK
`PIC1.DAA` archive SHA256
`b3512ed6a030ac27538ae66f6115bdf0bf1f5a78e63eba0d32fef3e32b049687`,
block #18 has `pix_off=77`, but the complete decompressed stream's bitmap starts
at byte **87**. Reading at the old boundary produces shifted pixels. The corrected
offline renderer already uses the tail layout:

```
frame_bytes = ceil(width / 16) * 2 * height * 5
start = decoded_stream_length - numFrames * (frame_bytes + 1)
```

This retains every byte from RLE runs crossing a header/frame boundary and accounts
for one extra byte per stored frame. That byte's purpose is not established here.
The header's `pix_off` is preserved as metadata, not used as the corrected bitmap
offset. No universal `pix_off + 10` rule is justified.

`decodeDaa(bytes, name, { singleFrameTailBlockIds: [18] })` explicitly selects this
path for an independently verified archive. It requires exactly one stored frame,
width 8..512 in multiples of 8, height 1..256, a complete 12-bit palette (upper
nibbles zero), a derived header
span of 77..256 bytes, and a complete bitmap plus trailing byte. Full-stream RLE
rejects truncated operations and output beyond **82,177 bytes** before writing.
Selected malformed/absent IDs throw with block context; unselected entries retain
the legacy per-entry empty-frame fallback. The option establishes no provenance:
the caller must verify archive identity separately. All existing callers retain
their existing default pixels. Multi-frame interpretation and XOR semantics are
outside this correction; neither #18 nor a synthetic fixture proves other families.

Portable evidence is `packages/engine/test/daaSingleFrameTail.test.ts` (independent
synthetic pixels/palette, crossing runs, no-op, truncation, geometry/span/allocation
bounds, one-frame constraint and compatibility controls). Its optional
`GB_DAA_TAIL_ORACLE` test pins the archive hash, compares #18's indices and palette
with `tools/amiga_cokdok_render.py`, and checks every unselected entry remains
identical to the legacy result. Game data and Python are not portable prerequisites.

Measured 2026-10-27: the new file passes **7 portable tests**, with the optional
oracle skipped when its environment variable is absent. With the pinned archive,
the four focused DAA test files pass **10 tests / 32 prerequisite skips**, including
all **7,744 #18 palette indices**, all 32 palette colors and the unchanged 26 other
archive entries. Skips are the older fixture/holdings-dependent cases, not inferred
passes. Engine `typecheck` passes. Replacing the derived start with `pixOff` makes
three portable tests fail (pixels, repeated runs and span rejection); restoring
the formula returns the focused suite to green. No runtime caller is opted in by
this decoder-only change.

The single-frame path exposes `tailLayout`: discriminator
`amiga-sprite-single-frame-tail-v1`, `decodedStream` (an exact-sized owned copy,
not the 82,177-byte scratch buffer), `bitmapStart`, `planarByteLength` and
`frameStride`. For the pinned #18 these are **5,368 / 87 / 5,280 / 5,281 bytes**.
Default/unselected entries have no `tailLayout` property. The optional oracle
test additionally pins independent review SHA256 values for the full stream,
indices, RGB palette and opaque RGBA, so changes to the live Python renderer
cannot silently redefine expected output.

### CoK SPRIT1/2 experimental three-frame tail/XOR view

`decodeDaa(bytes, name, { cokSpritTailBlockIds: [...] })` is a second explicit opt-in for
the candidate CoK `SPRIT1.DAA` and `SPRIT2.DAA` layout. It does not activate from a filename,
geometry or registry lookup; callers must verify the exact source archive bytes before selecting
IDs, and must decode those same verified bytes. Default and unselected entries retain the legacy
segmented decoder. The existing `singleFrameTailBlockIds` contract remains separate.

Both pinned fixture-copy archives contain 17 blocks / 51 frames. The decoder bounds full-stream
RLE output at 15,930 bytes and checks `pixOff=81`, 88×88 dimensions, three stored frames, a
complete 12-bit palette, candidate bitmap start 87, 5,280 planar bytes and a 5,281-byte stride.
This explicit decoder view leaves frame 0 unchanged and XOR-reconstructs frames 1 and 2 against
frame 0. It reproduces the current offline source PNGs, but those matches are not independent
historical pixel goldens and do not establish that the game displays these transformed pixels.

**Native-source audit, 2026-11-03:** against pinned CoK `disk1/game` SHA-256
`99a252109cb5e5c01de71edf6e8a22b3d9db96a9e6249c1f3f03ad71f9990102`, hunk42 does not establish
a flat decompressed bitmap start of either 81 or 87. Its hunk88 header call at `+0x728` supplies an
86-byte output capacity; frame calls supply a 5,280-byte per-image capacity derived from aligned
width × height × five planes. Those are upper bounds, not exact output lengths, and hunk88 does
not require exact segment consumption. Hunk42 selects a stored frame pointer and masked-blits it;
the reviewed path contains no frame-0 XOR reconstruction. So both the tail offset and the frame-0
XOR remain candidate rendering assumptions. Keep the frame group’s selector/playback meaning
unknown, and do not use these candidate pixels as runtime-approved Amiga art.

Each selected source exposes `tailLayout` with discriminator
`cok-sprit-three-frame-tail-xor-v1`, an exact-sized decoded-stream copy, candidate bitmap start,
planar length, stride, stored frame count and candidate XOR base. Failures on selected entries throw
with block context; wrong-container, absent, duplicate and overlapping selections are rejected. No
game consumer opts into this path yet.

`packages/engine/test/daaCokSpritTail.test.ts` has portable asymmetric synthetic pixels and
boundary-crossing literal/repeat RLE controls, XOR-base and buffer-isolation checks, malformed
stream/layout tests, default/one-frame compatibility checks, and optional source-pin tests. Set
`GB_COK_SPRIT1_ORACLE` and `GB_COK_SPRIT2_ORACLE` independently to test each local fixture copy.
Those cases compare all 51 frames per archive against the hash-pinned decode receipt, including
stored planar, candidate-rendered index, palette, RGB and trailing-byte hashes. The receipt’s Python
renderer comparison establishes reproduction of its current candidate interpretation, not native
pixel truth, independent historical output, or original-install provenance.

- Each 6-byte-index sub-block is **one continuous compressed stream**, decoded by a
  distinct **Amiga sprite RLE** (hunk 88 of `game`, *not* the same as the outer
  container's signed-byte RLE in §2 — this one has a `0x80` = no-op case and a `+1`
  on the repeat count for `0x81..0xFF`). The decompressor is called in consecutive
  segments off one running source position: segment 1 = the header (`pix_off`
  bytes), segments 2..(numFrames+1) = one 5-plane planar bitmap each. The stored
  sequence alone does not establish whether CoK SPRIT frames are temporal animation,
  size/distance selection, or another selector.
- Decompressed header: `pix_off(u8)`, `height(u16 BE, =88)`, `width_div8(u16 BE,
  =11)`, `x(u16 BE)`, `y(u16 BE)`, `flag(u8, =0)`, `numFrames(u8, at offset 10)`,
  then a 64-byte 32-color palette (BE `0x0RGB`, same convention as §5), then a
  small per-frame table padding out to `pix_off`.
- Each frame segment is a standard 5-plane **contiguous** planar bitmap exactly
  like §4 (`row_bytes = ceil(width/16)*2 = 12` for width 88), just delivered
  through the sprite RLE instead of the outer-container RLE.
- Historical decode-completion result: **158/158** six-byte-index sub-blocks across all 7 true index files
  (CoK `pic1`/`pic2`/`SPRIT1`/`SPRIT2`, DoK `PIC1`/`PIC2`/`SPRIT1`) decode with full
  stream consumption and full-color renders (armored sprites, dragons,
  portraits); CoK `PIC1` id 60 matches the DOS `PIC1.DAX` id 60 scene (0.93
  background-index match, residual = genuine 16- vs 32-color art difference).
  These completion/visual checks did not prove byte-exact bitmap alignment; the
  later #18 discrepancy above supersedes any broad correctness inference from them.
- **The "~11 mis-routed files" gap is CLOSED (2026-07-18).** The 11 files
  (CoK `comspr.daa` ×3 disks, `CPIC1.DAA`, `cpic2.daa`, `HEAD1.DAA`, `HEAD2.DAA`;
  DoK `COMSPR.DAA` ×2, `CPIC1.daa` ×2 — note `HEAD1.DAA == HEAD2.DAA` and each
  DoK pair is byte-identical across disks) were never a different format: they are
  ordinary **9-byte-TOC standard-frame containers (§3/§4)** whose `word0` happens
  to be divisible by both 9 and 6. The chain-validation routing below classifies
  all of them correctly; the historical "169 sub-blocks / 11 failures" tally came
  from `tools/subframe_decode.py`'s own entry lister, which routed on
  `body % 6 == 0` alone (now fixed to reuse the chain-validated router). Proof:
  Amiga `HEAD1.DAA` holds ids 68/69 at 88×40 — exactly the DOS `HEAD2.DAX` ids
  68/69 at 88×40, same portrait scene in richer colors; `comspr`/`CPIC*` render
  the same 24×24 combat-sprite subjects as their DOS DAX namesakes. Pinned by
  `packages/engine/test/daa.test.ts` ("9/6-ambiguous files") + golden fixtures
  (`comspr_0`, `CPIC1_129`, `HEAD1_68`, `COMSPR_0`, `CPIC1_1`).

How the decoder disambiguates the outer TOC: try the 9-byte TOC, accept it only if
every `data_offset` chains and the last block ends within 4 bytes of EOF; otherwise
fall back to the 6-byte index. This routing lives in `daa_decode.parse_container`
(Python) and `parseContainer` in `packages/engine/src/loaders/daa.ts` (TS), and —
since 2026-07-18 — `subframe_decode.amiga_index_entries` delegates to it too.

**The fall-back arm validates too — NEW 2026-08-25.** Until then the 9-byte arm chained
offsets on EOF and the 6-byte arm did nothing at all: `body % 6 == 0` was the whole test, which
one file in six passes by arithmetic alone. It force-fitted all nine Amiga **Pool of Radiance**
resources — described here, on 2026-08-25, as "the fourth, still-unsolved Gold Box container" —
into the sub-frame path. `pic.dax` (270220 bytes) came out with 98 entries whose sub-offsets reach
**4,245,164,308**, run backwards, and land past EOF **77** times; `cbody.dax` 170/213 past EOF.
Nothing downstream noticed because every caller only asked whether decoding threw.

**Correction: that "still-unsolved" was already wrong the day it was written.** Pool of
Radiance's Amiga container had been cracked over a month earlier — `docs/pool-amiga-format.md`
is dated 2026-07-22 (palette dispatch + `sqrpaci` closed 2026-07-23) — this section just didn't
know it. What was genuinely true on 2026-08-25, and is the actual reason these files needed the
new validation above, is narrower: the *generic* `decodeAsset`/DAA dispatcher had no branch for
`pool-amiga` and could only either mis-route these files into a foreign decoder (the bug fixed
here) or throw. That gap closed 2026-09-03, when `pool-amiga` got its own `decodeAsset` branch,
hintless sniff (23/23 true positives, 0/57 false positives against DAX/TLB-GLB/DAA), and
TypeScript port (`packages/engine/src/loaders/poolAmiga.ts`, 843/843 block hashes and 1672/1672
frame hashes identical to the Python oracle) — see `docs/findings.md` §2 and
`docs/pool-amiga-format.md`. The three-check fallback-arm validation below remains correct and
necessary regardless: it is what makes the DAA dispatcher correctly refuse a foreign container
instead of accepting it by accident, which matters whether or not that container has its own
decoder elsewhere.

Three checks now run, and each is perfect in both directions over the whole Amiga corpus — 14
genuine index files against those 9 impostors:

| check | genuine | Pool |
| --- | --- | --- |
| entry byte +1 (the pad) is 0 | 14/14 | 0/9 |
| sub-offsets never decrease | 14/14 | 0/9 |
| `data_base + sub_offset <= EOF` | 14/14 | 0/9 |
| *(null)* first sub-offset is 0 | 14/14 | **9/9** |

The last row is the null and is deliberately **not** in the decoder: it is the obvious first thing
to reach for and it separates nothing. Note also that all nine impostors fail all three real
checks at once, so the corpus alone cannot show that any individual check is load-bearing —
deleting one still rejects all nine. The tests therefore also perturb a genuine file in exactly
one way per check, and all six mutations (three per language) were verified to fail.

`sniffDaa`/`sniff` stay at the cheap shape check, so these nine still enter the DAA branch of
`decodeAsset` and fail there naming the offending entry rather than getting the dispatcher's
generic "unrecognized container format". That is only safe because `sniffDax` declines all nine
too; if DAX claimed them, sniff order would be silently deciding a format question.
Pinned by `tools/test_daa_index_validation.py` and
`packages/engine/test/daaIndexValidation.test.ts`.

`pointers.daa` / `globals.daa` have `word0 == 0` and are **not** graphics
containers (lookup/pointer tables).

---

## 2. RLE decompression — VERIFIED (identical to DAX)

Byte-order-independent signed-byte run length, byte-for-byte the same scheme as
DOS DAX:

```
while i < len(comp):
    c = comp[i]; i += 1
    if c < 0x80:   copy next (c+1) literal bytes
    else:          repeat next single byte (256-c) times
```

Output length equals `raw_size` exactly for every block tested (BIGPIC, CPIC,
BACK, 8X8D...). The RLE operates on bytes, so big-endianness does not affect it.

---

## 3. Image frame — VERIFIED (BIGPIC, CPIC, BACK, BIGPIC2 across CoK + DoK)

Each renderable block decompresses to:

```
offset  size       field
0       2          height            (pixels, BE)
2       2          width_div8        (width in pixels = width_div8 * 8, BE)
4       2          y_offset          (BE, usually 0)
6       2          x_offset          (BE, usually 0)
8       1          item_count        number of items in the block (see §3a); 1 for a picture
9       64         palette           32 x uint16 BE, 0x0RGB 12-bit Amiga words
73      ...        pixel data        5 CONTIGUOUS bitplanes (see §4)
```

`width = width_div8 * 8`. Verified examples:

| File / block       | header (h, w/8) | width×height | renders as |
|--------------------|-----------------|--------------|------------|
| CoK BIGPIC1 b114   | (120, 38)       | 304×120      | CoK box scene: draconians, woman+infant, fire, mountains |
| CoK BIGPIC2 b116   | (120, 38)       | 304×120      | torch-lit dungeon, draconians at a table |
| CoK CPIC1 b129     | (24, 3)         | 24×24        | draconian warrior sprite w/ blue shield |
| CoK CPIC1 b130     | (24, 6)         | 48×24        | dragon/wyvern sprite |
| DoK BACK1 b1       | (88, 11)        | 88×88        | combat arena floor grid (perspective) |

CoK `BIGPIC1` block 114 matches the **DOS** `BIGPIC1.DAX` block 114 pixel-for-
pixel in subject and dimensions (304×120), the strongest cross-validation: same
scene, the Amiga version simply richer (32 vs 16 colors).

### 3a. Byte 8 is `item_count`, not padding — VERIFIED (2026-08-21)

This byte was documented as "pad / flag (observed 0x01)" until 2026-08-21, because 628 of the
678 standard-frame blocks across all 52 extracted `.DAA` files do read `0x01`. The other **50
read 6, 25, 35, 38, 45 or 70** — and they are the multi-item blocks. It is the same field the
DOS 17-byte header carries at the same offset (`docs/dax-format.md` §4a), and the two platforms
agree block for block:

| file / block | DOS `item_count` | Amiga byte 8 |
| --- | --- | --- |
| `8X8D1` id 202 / 203 | 38 / 45 | 38 / 45 |
| `8X8D1` ids 11, 12, 23, 31, 32 | 70 each | 70 each |
| `DUNGCOM` id 1 | 25 | 25 |
| `WILDCOM` id 1 (CoK / DoK) | 35 / **38** | 35 / **45** |
| `RANDCOM` id 1 | 6 | 6 |

That is **cross-platform identity, not a fit heuristic** — the DOS side already publishes the
answer for the same sparse block id, which is the sibling-platform-as-oracle move the C64 work
used. Distribution of byte 8 over all 678 blocks: `{1: 628, 6: 3, 25: 5, 35: 3, 38: 2, 45: 4,
70: 33}`.

**One row is not an identity, and it is a content difference rather than a decode error**
(corrected 2026-08-25 — the DOS column of the `WILDCOM` row read 45, copied across from the
Amiga column). DoK's DOS `WILDCOM.DAX` block 1 decompresses to 10961 bytes and its byte 8 is
**38**; the 17-byte DOS header framing closes exactly on that, `17 + 38 * 288 = 10961`, and 45
items would need 12977. The Amiga block really is **45**, and its own framing closes exactly too
(`73 + 5 * 45 * 24 * 24 / 8 + 2`, §3c). So the two releases ship different amounts of art.

Which 38 the DOS release kept is decidable rather than assumed. Scoring the Amiga index map
against the DOS one as §3c does (`1 - H(DOS|Amiga)/H(DOS)`, over all 38 x 576 pixels) at each of
the 8 possible alignments gives **0.852 at Amiga item 0** and **0.136** for the next best — the
seven shifted alignments are the null, and they behave like one. DoK's Amiga strip is therefore
the DOS strip **plus seven extra backdrops appended at the end**, items 38..44. They are real
art, not padding or duplicates: none is flat, none equals any of the first 38, and they average
13.3 distinct colours against the shipped 38's 11.4. CoK's two strips are 35 and 35 and align at
0 with 0.918, so this is a DoK-only difference. Relevant to the primary goal, since it is seven
backdrops the DOS build has no slot for.

**8X8D strips: SOLVED and now routed.** `count` tiles of 8×8, **4 planes, 1-byte stride, 32
bytes per tile**, consuming the payload exactly — e.g. block 11's 70 tiles are 70 × 32 = 2240 =
`rawSize − 9`, with no remainder and no palette (these use the fixed EGA-16 table, §7b). Per
file: `8X8D0` and `8X8D1` hold **783** tiles each, `8X8D2` holds 910.

`decodeDaa` had no strip check at all until 2026-08-21: every block went straight to the §3
frame parser, which ignores byte 8, so a 70-tile block surfaced as **one** 8×8 image whose
"palette" was the next 64 bytes of *tile pixels*. `decodeDaaTileStrip` was correct throughout
and pinned at IoU 1.0 against the DOS oracle — nothing called it from the archive path. Fixed;
`packages/engine/test/daaTileStrip.test.ts` now asserts the per-block counts against DOS and the
783 total, and both assertions were confirmed to fail with the routing removed.

**24×24 `*COM` combat backdrops — SOLVED 2026-08-22.** `DUNGCOM`/`WILDCOM`/`RANDCOM` block 1
carry 25/35/6 items (45 for DoK's `WILDCOM`). The items are **not stored per item at all**: like
the 8X8D strips of §7, the whole set is ONE virtual image `N·24` px wide and 24 px tall, and item
`t` is the pixel-column band `[t·24, t·24+24)` inside it.

```
offset  0   8-byte BE frame header {height=24, width_div8=3, y, x}
                (width_div8 describes ONE item, NOT the strip)
offset  8   item_count N
offset  9   32-colour palette, 32 × BE u16 0x0RGB   (64 bytes)
offset 73   5 contiguous bitplanes, each row_bytes·24 bytes, plane 0 = LSB, MSB = leftmost px
            row_bytes = ceil(N·24/16)·2      <-- word-aligned over the WHOLE strip
end         2 trailing bytes, purpose unknown
```

**Why six earlier sweeps missed it.** Every attempt assumed a *per-item* stride: 5 planes ×
3-byte rows = 360 bytes/item. That leaves a residue of 122 bytes for `DUNGCOM` and both
`WILDCOM`s but **2** for `RANDCOM` — read as "not a consistent preamble", which it isn't, because
the premise is wrong. Under the strip rule the row stride is word-aligned across `N·24` px rather
than 24 px, and the residue is a **constant 2 trailing bytes in all four shipped blocks**
(N = 6, 25, 35, 45, across two games). One rule, one constant, no exceptions.

**Verification.** The DOS `.DAX` twin is the oracle (17-byte header, then `N` × 288-byte chunky
4bpp items). The Amiga art carries more colour than EGA can, so it *refines* the DOS render
rather than equalling it, and the honest metric is `1 - H(DOS|Amiga)/H(DOS)` — 1.0 iff the Amiga
index map exactly determines the DOS one:

| block | refinement | item-permuted null |
| ----- | ---------- | ------------------ |
| CoK `DUNGCOM` | **1.0000** | 0.19 |
| DoK `DUNGCOM` | **1.0000** | 0.18 |
| CoK `WILDCOM` | 0.9178 | 0.03 |
| CoK `RANDCOM` | 0.8978 | 0.20 |
| DoK `WILDCOM` | 0.8520 | not measured — see the shuffled-bank null below |

**`DoK WILDCOM` is a superset, not a twin: 45 Amiga items against 38 DOS.** It carries seven
frames the DOS bank has no slot for, which is why its refinement sits below the two `DUNGCOM`
pairs — the extra items have no DOS counterpart to determine. Any index-for-index swap of this
bank corrupts everything past item 37, so a consumer must map by item, never by position. All the
other pairs are item-count-identical (25/25, 35/35, 6/6).

The first four nulls above are item-permuted, from the round that solved the strip layout.
`packages/engine/test/daa.test.ts` measures a *different* null — refinement against a shuffled DOS
bank — for all five pairs, so every real number is read next to a number produced by destroying the
structure it claims to measure: 0.1317 / 0.1317 / 0.1086 / 0.0915 / 0.1302, in table order. The two
nulls are not interchangeable and are not reported as if they were; `DoK WILDCOM` has only the
second kind, because it was added in the later round.

A preamble sweep over 0..199 selects **73 uniquely**: next-best is 0.1898. Shifting the plane
base by 2 bytes collapses CoK `DUNGCOM` from 1.0000 to 0.0091, which is how
`packages/engine/test/daa.test.ts` was confirmed able to fail before it was landed.

*Note on the earlier negative result.* The previously documented sweep reported "best 0.776
against a null of 0.608, flat rather than peaked". That was accurate about its own metric and
correctly refused to claim a layout — but the metric (IoU of a most-common-index mask) is
background-dominated and cannot discriminate here; re-run properly it scores a **random-byte null
of 0.440 above its own best real-data score of 0.376**. The lesson is the one already in this
repo: a flat score is evidence about the metric before it is evidence about the data.

Decoders: `tools/daa_decode.py` (`parse_com_strip_header`, `decode_com_item`, `com_strip_to_rgb`)
and `packages/engine/src/loaders/daa.ts` (`isDaaComStrip`, `decodeDaaComStrip`,
`decodeDaaComBlock`), wired into `decodeDaa` ahead of `parseFrameHeader` — which otherwise
"succeeds" on these blocks and returns a 24×24 raster built from five wrong plane offsets.

---

## 4. Pixel encoding — PLANAR, VERIFIED

Unlike DOS DAX (chunky 4bpp, 2 px/byte), Amiga `.DAA` stores **5 contiguous
(non-interleaved) bitplanes** for 32 colors:

```
row_bytes  = ceil(width/16) * 2          # rows are WORD (16-bit) aligned
plane_size = row_bytes * height
plane 0 occupies bytes [0 .. plane_size)             (whole image)
plane 1 occupies bytes [plane_size .. 2*plane_size)  ...
... up to plane 4.
pixel(x,y) index = sum over p of  bit(plane[p], y*row_bytes + x/8, 7-(x&7)) << p
```

Two facts had to be nailed empirically:
1. **Contiguous, NOT ILBM per-row interleave.** Per-row interleave (the ILBM
   convention) produced noise; whole-image contiguous planes produced the
   coherent scene. (This differs from the `.LBM` files, which DO use per-row
   interleave — see §6.)
2. **Word-aligned row stride.** Rows are padded to an even byte count
   (`ceil(width/16)*2`). This is invisible for widths that are already a multiple
   of 16 (e.g. 304 → 38 bytes) but essential for 24-wide sprites (3 → 4 bytes),
   which otherwise render as horizontal-streak noise. With the alignment, a
   24×24 sprite needs exactly `4*24*5 = 480` plane bytes = `raw - 73`, matching
   to the byte.

Color index 0 is transparent/background (renders black) on sprites.

---

## 5. Palette — VERIFIED (12-bit Amiga RGB, embedded per frame)

64 bytes at frame offset 9: **32 × big-endian uint16**, each `0x0RGB` (the classic
Amiga 12-bit color word; only the low nibble of each of R/G/B is used). Scale each
4-bit channel to 8-bit with `channel * 17` (equivalently `(c<<4)|c`). The first
eight entries of CoK `BIGPIC1` decode to the EGA-like ramp
`(0,0,0),(0,0,170),(0,170,0),(0,170,170),(170,0,0),(170,0,170),(170,85,0),
(170,170,170)`, which matches the CMAP of the game's own `scrn1b.lbm`
(`(0,0,0),(0,0,160),…,(160,80,0),(160,160,160)`) — confirming both the format and
the x17 scaling. The palette is stored **identically in every block of a file**
(e.g. all 62 CPIC1 blocks repeat the same 64 palette bytes), i.e. it is a
per-file palette duplicated per frame.

---

## 6. IFF ILBM (`.LBM`) — used as the palette/pipeline oracle (VERIFIED)

The title/text screens (`scrn1b.lbm`, `scrn2.lbm`, `Title*.LBM`, `text*.lbm`,
`gothic.lbm`, `chars/chart`) are standard IFF ILBM:
`FORM…ILBM` → `BMHD` (320×200, 5 planes, compression=1) → `CMAP` (32 × 8-bit RGB,
already 0-255) → `BODY` (ByteRun1). **ILBM BODY uses per-row plane interleave**
(plane 0 row, plane 1 row, … then next scanline) — the opposite of `.DAA`'s
contiguous planes. The decoder includes an ILBM reader (`--lbm`); `scrn1b.lbm`
renders as a pixel-perfect "SSI / Advanced Dungeons & Dragons" title screen,
which validated the PNG pipeline before any `.DAA` work.

---

## 7. The 8x8 dungeon tiles (`8X8D*.DAA`) — SOLVED

**Status: SOLVED 2026-06-21.** Full details in
`docs/engine/research/amiga-8x8d-planeorder.md`. Decoder:
`parse_8x8d_header` / `decode_8x8d_tile` / `tiles_8x8d_to_rgb` in
`tools/daa_decode.py`, and `decodeDaaTileStrip` in the engine
(`packages/engine/src/loaders/daa.ts`).

**Cross-platform identity (the validating proof).** Decoding CoK `8X8D1.DAA` block 202
and DOS `8X8D1.DAX` block 202 through the same pipeline and comparing palette indices:
**all 38 tiles are byte-identical (0 differing pixels).** CoK's 8×8 UI chrome (frame,
moons, arrows) is the SAME 16-colour EGA art on both platforms — a correct plane order +
palette reproduces the DOS oracle exactly. (Earlier "richer Amiga 8×8 art" notes were a
circular-method artifact, now corrected in the research doc.) Pinned by
`packages/engine/test/daaTileStrip.test.ts`.

### 7a. Format overview

`8X8D*` blocks have the header `{height=8, width_div8=1, y=0, x=0}` (NO embedded
palette; `width_div8=1` is a marker, not the actual width). Byte 8 is the tile
count N. Pixel data starts at byte 9.

**This is NOT a standard frame.** It is a **4-plane contiguous tile strip**:
N tiles packed side-by-side into a wide virtual image (width = N×8 pixels), using
only 4 bitplanes (16 colors, not 32) and sharing the global EGA dungeon palette.
The detector (`parse_8x8d_header`) must run BEFORE `parse_frame_header` or the
block will be misidentified as a spurious 8×8 image.

```
Structure:
  raw[0:2]  u16 BE   height = 8  (constant)
  raw[2:4]  u16 BE   width_div8 = 1  (marker; actual strip width = N*8)
  raw[4:8]  u32 BE   y=0, x=0
  raw[8]    u8       N = tile_count
  raw[9..]  pixels   4 * row_bytes * 8 bytes

Plane layout (4-plane contiguous strip):
  row_bytes = ceil(N*8/16)*2     (word-aligned; equals N for N <= 128)
  plane_size = row_bytes * 8
  Plane p: raw[9 + p*plane_size .. 9 + (p+1)*plane_size)

Tile t, pixel x in [0,7], row y in [0,7]:
  byte  = raw[9 + p*plane_size + y*row_bytes + t]
  bit_p = (byte >> (7 - x)) & 1
  index = bit_0 | (bit_1<<1) | (bit_2<<2) | (bit_3<<3)

Detection: h==8 AND w_div8==1 AND (raw_size - 9) == 4 * row_bytes * 8
  (where N = raw[8], row_bytes = ceil(N*8/16)*2)
```

### 7b. Palette

No palette is stored in the tile block. Use the **shared EGA-compatible 16-color
dungeon palette** (first 16 entries of the 32-color DUNGCOM.DAA / BORDER.DAA
embedded palette, which is identical to the standard IBM EGA 16-color table):

```
0=#000000  1=#0000aa  2=#00aa00  3=#00aaaa  4=#aa0000  5=#aa00aa
6=#aa5500  7=#aaaaaa  8=#555555  9=#5555ff 10=#55ff55 11=#55ffff
12=#ff5555 13=#ff55ff 14=#ffff55 15=#ffffff
```

### 7c. CoK vs DoK difference

| Game | File | Planes | Palette |
|------|------|--------|---------|
| CoK | `8X8D1.DAA` | 4 (16-color strip, no palette header) | Shared EGA-16 |
| DoK | `8x8d1.daa` | 5 (standard frame with embedded 32-color palette) | Per-block Amiga 12-bit |

DoK `8x8d1.daa` uses the standard §3/§4 frame format (h=8, w_div8=N_tiles, full
73-byte header with embedded palette) and is handled by the existing
`parse_frame_header` path. CoK uses the special 4-plane strip format above.

### 7d. Block assignments (CoK)

| Block | N tiles | Purpose |
|-------|---------|---------|
| 202 | 38 | Exploration frame tiles (20-25), compass arrows (0-3), moons (26-37) |
| 203 | 45 | Alternate decoration tile set |
| 11,12,23,31,32,51,52,7,81,82 | 70 | Dungeon wall art sets |

Block 201 decompresses to all-zeros — skip or treat as null/meta block.

### 7e. Moon tiles (block 202, tiles 26-37)

Three moon groups (4 phases each):
- Tiles 26-29: Lunitari. Phase 3 (full disc, tile 28) = EGA index 4 = #aa0000 (red).
- Tiles 30-33: Solinari. Phase 3 (full disc, tile 32) = EGA index 15 = #ffffff (white).
- Tiles 34-37: Nuitari. Phase 3 (full disc, tile 36) = EGA index 1 = #0000aa (blue).

All three moon groups produce identical inter-phase XOR patterns
`[6, 26, 6, 20, 12, 20]`, confirming structurally correct decode.

### 7f. Block assignments (DoK, M9.S4)

DoK's `8x8d1.daa` has 31 blocks, decoded via `decodeDaaWideTileBlock` (`daa.ts`) — the
standard-frame reader from §7c, sliced into 8×8 tiles:

| Block(s) | N tiles | Purpose |
|----------|---------|---------|
| 202 | 45 (both platforms) | Boot/frame set 4 — border/compass range (0-24) byte-identical to DOS; moon range (25-44) genuinely differs |
| 203 | 45 DOS / 46 Amiga | Boot/frame set 0 — off-by-one tile count, unresolved |
| 204 | 1 DOS / 2 Amiga | Boot/frame — unexamined |
| 1,21,41,61 (and 6 more such series 2-7) | 64 each | One 256-tile dungeon wall bank, chunked 4 ways — reassembly order **not verified** against DOS (see `docs/engine/research/dok-8x8d-amiga-format.md`); left to the DOS fallback rather than guessed |

Full writeup, including the failed reassembly-order attempts and the per-tile RGB
comparison methodology: `docs/engine/research/dok-8x8d-amiga-format.md`.

---

## 8. Verified vs assumed vs unsolved

**VERIFIED (against raw bytes and cross-checks):**
- Big-endian container: `word0 = 2 + N*9 = data_base`; 9-byte BE TOC
  `{u8 id, u32 off, u16 raw, u16 comp}`; offsets chain; sparse ids.
- Signed-byte RLE (identical to DAX; output == raw_size).
- Frame header `{u16 h, u16 w/8, u16 y, u16 x}` BE; `width = w/8 * 8`.
- 5 contiguous bitplanes, word-aligned row stride, LSB = plane 0.
- Per-frame embedded 32-color palette: 32 × BE uint16 0x0RGB at offset 9, x17.
- IFF ILBM reader + the 32-color Amiga palette (matches `.DAA` palette).
- **Header byte 8 is `item_count`** (§3a) — matches the DOS `item_count` at the same offset for
  the same block ids on 7 of the 8 checked blocks across 4 files, and `decodeDaa` now routes
  multi-item 8X8D strips instead of taking their first tile-column as a picture. It was listed as
  an assumed "pad/flag (always 0x01)" until 2026-08-21; 50 of 678 blocks are not 0x01. The eighth
  block, DoK `WILDCOM` id 1, is 38 on DOS and 45 on Amiga — both framings exact, so the platforms
  ship different amounts of art rather than one of the readings being wrong (§3a).
- Cross-validation: CoK BIGPIC1 b114 == DOS BIGPIC1.DAX b114 (same scene/size).
- **CoK `8X8D*` tile strip format: 4-plane contiguous, row_bytes=N, MSB-first,
  plane 0=LSB, shared EGA-16 palette. Decoder verified; moon colors confirmed.**
- **The 6-byte sub-frame INDEX files (`SPRIT*`, CoK `pic1`/`pic2`, DoK `PIC1`/`PIC2`):
  inner codec identified by disassembling the Amiga `game` 68000 binary (hunk 88 =
  a distinct sprite RLE; hunk 42 = the picture loader). 158/158 sub-blocks decode
  with full stream consumption and coherent full-color renders. See §1b and
  `docs/engine/research/subframe-format.md`.**
- **The 9/6-ambiguous families (`comspr`/`COMSPR`, `CPIC*`, `HEAD*`): confirmed
  9-byte-TOC standard frames (§3/§4), cross-validated against the DOS DAX renders
  of the same block ids (HEAD1.DAA 68/69 == DOS HEAD2.DAX 68/69). The former
  "~11 mis-routed files" note is closed — see §1b.**

**Wired to the running game (2026-08-22).** Decoding a format and *using* it are separate
milestones and were separate days here. `loadCombatAssets` in `apps/web/src/ui/combat.ts`
hardcoded the DOS `.DAX` paths, so for the first hours after the strip layout was solved,
switching graphics mode to Amiga changed the dungeon walls and left the combat backdrop on DOS
EGA art — the decoder was correct and nothing ever called it. `CombatAssetPaths` now carries
`amigaDungcomPath` / `amigaRandcomPath` / `graphicsMode`, and `combatBackdropFrom` dispatches on
the decoded container format. The e2e case `cok-combat-amiga-backdrop` asserts the reported
`dungcomPath` ends `.DAX` then `.DAA` and that `backdropGraphicSet` reads `DOS-EGA` then `Amiga`,
so a silent fallback to DOS fails the gate rather than passing quietly; its own null is that the
two backdrop checksums differ and neither is zero, without which a probe that loaded nothing twice
would read green.

**ASSUMED (renders correctly, not independently proven):**
- Color index 0 = transparency on sprites (renders as black background).
- The EGA-16 palette is loaded by the Amiga game from DUNGCOM at startup and applied
  globally to all 8X8D rendering (consistent with observation but not traced in binary).

**UNSOLVED:**
- Block 201 in `8X8D1.DAA`: decompresses to all-zeros, structure unknown.
(Previously listed here, now RESOLVED 2026-08-22: the **24×24 multi-item `*COM` combat
backdrops**. They are a single word-aligned 5-plane strip, item `t` = pixel-column band
`t·24`, with the ordinary 73-byte frame preamble and 2 trailing bytes — see §3a. Refinement
against the DOS oracle is 1.0000 for CoK and DoK `DUNGCOM`. This was the last unsolved Krynn
graphics format and it unblocks the Amiga combat-backdrop art for the primary deliverable.)

(Previously listed here, now RESOLVED 2026-07-18: the `comspr`/`COMSPR`/`CPIC*`/
`HEAD*` "mis-routed ~11 files" question — all are 9-byte-TOC standard frames,
visually and structurally cross-confirmed against the DOS DAX equivalents. See
§1b and §8 VERIFIED above.)

---

## 9. Using the decoder

```
python tools/daa_decode.py <file.DAA> [--out DIR] [--scale N] [--list]
python tools/daa_decode.py <file.lbm> [--lbm] [--out DIR]
```

Writes one PNG per renderable frame to `renders/daa/<...>/<stem>_<block_id>.png`.
9-byte-TOC image files render (standard frames AND `8X8D` tile strips); 6-byte-index
files are listed only (no pixel decode) by this tool. `--list` inspects without
rendering. Pillow is used if present, else a built-in PNG writer.

For the 6-byte sub-frame INDEX files (`SPRIT*`, CoK `pic1`/`pic2`, DoK
`PIC1`/`PIC2` — §1b), use the dedicated decoder instead:

```
python tools/subframe_decode.py <file.DAA> [--out DIR] [--scale N] [--list] [--mask N]
```

(Since 2026-07-18 `subframe_decode.py` shares the chain-validated routing with
`daa_decode.py`, so pointing it at a 9/6-ambiguous blocks file — `comspr`,
`CPIC*`, `HEAD*` — renders the standard frames correctly instead of mis-parsing
the TOC as a 6-byte index.)

Writes one PNG per `(sub-frame id, stored frame)` to
`renders/subframe/<stem>/<stem>_<id>_f<n>.png`. See
`docs/engine/research/subframe-format.md` for the full codec write-up (both the
DOS `.DAX` and Amiga `.DAA` sides).
