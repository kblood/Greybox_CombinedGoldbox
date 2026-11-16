# Amiga DAA Sub-Frame Index Variant — Research Findings

**E5.6 | Author: research agent | Date: 2026-06-24**

> **SUPERSEDED (2026-06-25 / confirmed 2026-07-01):** the inner sub-frame pixel
> codec this document leaves "UNLOCATED" (§5 below) was subsequently solved by
> disassembling the Amiga `game` 68000 executable directly. See
> `docs/engine/research/subframe-format.md` §3 for the codec (a distinct Amiga
> sprite RLE feeding 5-plane contiguous planar bitmaps) and `tools/subframe_decode.py`
> for the verified decoder (158/169 six-byte-index files decode with full stream
> consumption and coherent full-color renders). `docs/daa-format.md` §1b has been
> updated accordingly. The outer 6-byte TOC findings below (§2-4) remain accurate
> and are consistent with the final solve; only §5's "pixel encoding: UNLOCATED"
> conclusion is superseded.

---

## Scope

Reverse-engineering the 6-byte TOC variant of the Amiga `.DAA` container format,
used by `SPRIT*.DAA` and `pic*.DAA` files across the Krynn trilogy. These store
monster sprites (distance variants) and character portrait pictures that appear
during exploration encounters.

Distinct from the *9-byte TOC* variant (used by `BODY*.DAA`, `CPIC*.DAA`,
`BIGPIC*.DAA`, `HEAD*.DAA`, `BACK*.DAA`, `8X8D*.DAA`) which is fully decoded.

---

## 1. Affected Archives

| Path | Entries | b9 (numDist) values | Notes |
|---|---|---|---|
| `amiga_extracted/ChampionsOfKrynn/disk2/SPRIT1.DAA` | 17 | always 3 | Monster sprites |
| `amiga_extracted/ChampionsOfKrynn/disk2/pic1.daa` | 27 | 1,3,4,5,6 | Character portraits + sprites |
| `amiga_extracted/DeathKnightsOfKrynn/disk1/PIC1.DAA` | 5 | 1,3,6 | DoK portraits/sprites |
| `amiga_extracted/DeathKnightsOfKrynn/disk2/SPRIT1.DAA` | 15 | always 3 | DoK monster sprites |

All files open with a 6-byte TOC (identified by `word0 = 2 + N*6` divisible by 6
and consistent sub-offsets). Confirmed across 64 total entries over 4 files.

---

## 2. Outer Container: 6-byte TOC Layout

**FULLY SOLVED.** Verified across all 64 entries.

```
Offset 0  (u16 BE):  data_base = 2 + N*6       (= byte offset where entry data starts)
Offset 2  (repeating N times):
  +0  u8:  block_id                              (matches DOS DAX block id for same art)
  +1  u8:  always 0x00
  +2  u32 BE: sub_offset                         (from data_base to start of this entry)
```

Entry sizes are implicit: `size[i] = sub_offset[i+1] - sub_offset[i]` for all but
the last entry; last entry extends to end of file.

**Sub-entry data** is RLE-compressed using the same signed-byte scheme as standard
DAA and DAX blocks: `c < 0x80` → copy `c+1` literal bytes; `c >= 0x80` → repeat
next byte `256-c` times.

Reference: `tools/daa_decode.py`, function `parse_container` (6-byte fallback path).

---

## 3. Inner Sub-Frame Header Layout

**PARTIALLY SOLVED.** First 10 bytes are consistent across all examined entries.

```
Byte[0]     u8:   b0_field — purpose UNKNOWN (varies per sprite; 62–87 in DoK SPRIT1)
Byte[1..2]  u16 BE: h_canvas = 88  (canvas height, always 88)
Byte[3..4]  u16 BE: w8 = 11        (canvas width ÷ 8 = 11, so 88px wide)
Byte[5..6]  u16 BE: y = 0
Byte[7..8]  u16 BE: x = 0
Byte[9]     u8:   numDist           (number of distance sub-frames: 1–6)
```

Key hex evidence (CoK `pic1.daa` entry id=57, `raw=5017`):

```
Offset 0: 4d 00 58 00 0b 00 00 00 00 01 00 00 0a 00 a0 00 aa 0a 00 0a 0a 50 0a aa ...
           ^^                ^^       ^^
          b0=77            w8=11    numDist=1
               ^^^^^^^^
               h=88 (BE)
```

DoK `SPRIT1.DAA` entry id=2 header:
```
48 00 58 00 0b 00 00 00 00 03 00 00 03 ...
^^  b0=72              ^^
                      numDist=3
```

**b0_field does NOT follow a formula.** Initial hypothesis `b0 = 75 + 2*numDist`
appeared to hold for CoK (all entries happened to have numDist=3, b0=81), but
**fails for DoK SPRIT1** where b0 ranges from 62 to 81 for the same numDist=3.
Its meaning is UNKNOWN.

**numDist confirmed** by raw size proportionality:
- CoK `pic1.daa` grouping by byte[9]:
  - numDist=1: n=20, sizes 4932–5305 (spread 373 bytes, but within group)
  - numDist=3: n=1, raw=15044 ≈ 3×5015
  - numDist=4: n=4, raw≈19687–20481 ≈ 4×avg
  - numDist=5: n=1, raw=24809 ≈ 5×4962
  - numDist=6: n=1, raw=31325 ≈ 6×5221

---

## 4. Palette Region

**INFERRED (not fully verified).** Bytes [9..72] appear to contain the 32 × BE u16
Amiga 12-bit palette (same layout as solved `BODY1`/`CPIC1` blocks, which have
palette at byte 9 after a 9-byte standard header).

Evidence: entries 1–5 of the palette at offset 9 consistently match the CPIC1
ground truth palette (EGA-equivalent Amiga colors: 0x000A, 0x00A0, 0x00AA,
0x0A00, 0x0A0A). Entry 0 at bytes [9..10] varies per sprite and encodes numDist
in the high byte: e.g., `0x0100` → numDist=1, `0x0500` → numDist=5, `0x0400`→
numDist=4.

**(inferred)**: Palette register 0 (background/transparent) is set to black
at runtime and not stored as 0x0000 here. The stored high byte in pal[0] is
instead the numDist count.

If correct: pixel data starts at byte 74 (= 9-byte header part + 1 byte b0_field
+ 64 bytes palette). The b0_field is the "extra" byte that shifts the structure
1 byte relative to solved formats.

---

## 5. Pixel Encoding — **UNLOCATED**

**No verified decode achieved.** All pixel-format hypotheses fail.

### 5a. What was tried

| Hypothesis | Result |
|---|---|
| 5-plane Amiga bitplanar, 88px wide (row_bytes=12), height=88 | 5×12×88=5280 ≠ any entry size |
| 4-plane bitplanar, 88px wide, variable height | Only 2/20 b9=1 entries have exact integer height |
| Chunky 1-byte/pixel, 88px wide | 4943/88=56.17 — not integer |
| DRAW23 transparent row-RLE | Parser reaches arbitrary row counts, no natural termination |
| Planar with 16-color palette (32-byte palette, pixel at byte 42) | Only 2/20 entries fit |
| No embedded palette (pixel from byte 10) | No fit found |

The variable sizes **within the same numDist group** are the definitive proof: CoK
`SPRIT1.DAA` (all entries have numDist=3) has raw sizes 14558–15064 (spread 506
bytes). If pixels were fixed-size bitplanar for a fixed canvas, all 17 entries
would be identical size. They are not.

### 5b. Implication

The pixel data is **variable-length** per sprite. This is consistent with a
transparent run-length encoding (similar to DRAW23.TXT in `hackdocs_extracted/`
but with Amiga-specific escape bytes). The exact command vocabulary is unknown.

### 5c. DOS DAX cross-check attempt

DOS `SPRIT1.DAX` shares block ids 1, 8, 30, 35 with CoK `pic1.daa`. The DOS
format for these blocks is the COAB-verified complex multi-frame format
(`ovr030.cs` `load_pic_final`): chunky EGA 4bpp, frame header per distance frame
(21 bytes: delay+h+w8+x+y+pad+field_9), pixels packed as high-nibble-first pairs.

Amiga counterpart id=1 (`raw=5184`) was identified but pixel decode is unconfirmed
because the inner pixel encoding is unknown. No ground-truth comparison completed.

---

## 6. Summary Table: Solved vs UNLOCATED

| Item | Status | Evidence |
|---|---|---|
| Outer 6-byte TOC layout | **SOLVED** | 64 entries across 4 files |
| TOC: `{bid(1), zero(1), sub_offset(4 BE)}` | **SOLVED** | |
| Entry RLE decompression (same as DAX) | **SOLVED** | Standard signed-byte RLE |
| Inner header bytes[0..8]: b0_field + h=88 + w8=11 + y=0 + x=0 | **SOLVED** | All entries confirm |
| numDist = byte[9] | **SOLVED** | Size proportionality proof |
| Palette at bytes[9..72]: 32 × BE u16 (pal[0] encodes numDist) | **(inferred)** | 5/8 entries match CPIC1 palette |
| b0_field at byte[0]: meaning | **UNKNOWN** | Varies 62–87 with no clear formula |
| Pixel data start offset (byte 73 or 74?) | **(inferred)** | Palette-at-9 implies pixels at 73 |
| Pixel encoding format | **UNLOCATED** | Variable sizes rule out all fixed-plane formats |

---

## 7. Raw Byte Evidence (Selected)

### CoK `pic1.daa` entry id=57 (numDist=1), bytes[0..38]:
```
4d 00 58 00 0b 00 00 00 00 01 00 00 0a 00 a0 00
^b0  ^h(88)  ^w8(11) ^y(0)  ^x(0)  ^ numDist=1
                                    ^palette starts: pal[0]=0x0100, pal[1]=0x000A...

aa 0a 00 0a 0a 50 0a aa 05 55 05 5f 05 f5 05 ff
0f 55 0f 5f 0f f5 0f ff 04 10 07 22 09 33 ...
...
```

### DoK `SPRIT1.DAA` entry id=13 (numDist=3, b0=62):
```
3e 00 58 00 0b 00 00 00 00 03 00 03 ...
^b0=62                       ^numDist=3
```

---

## 8. Open Questions / Unknowns

1. **b0_field (byte[0])**: What does it encode? Not numDist, not a simple height,
   not a pixel start offset. Possibly: a rendering hint (number of animation cells,
   display priority, palette slot), or a per-entry variable embedded in pal[0].

2. **Pixel encoding**: The variable-length inner format. Likely candidates:
   - Amiga-native transparent sprite encoding (per-row, skip + literal with
     hardware sprite structure)
   - A custom run-length scheme using plane row pointers
   - IFF `ILBM` BODY-style RLE applied to per-row planar data (but the outer RLE
     was already applied — double-RLE is unusual)

3. **Palette offset**: Is it byte 9 (pal[0] encodes numDist in high byte) or
   byte 10 (separate numDist field, then standard black pal[0])? The "invalid"
   upper nibble in bytes [0..3] rules them out as palette; bytes [4..8] are
   all-zero (valid 0x0000 black); byte[9] contains numDist as high nibble which
   makes it an unusual but not impossible pal[0] value.

4. **Multiple distance sub-frames**: For numDist>1, how is each sub-frame's pixel
   data delimited within the total pixel area? No offset table or per-frame header
   has been located.

5. **DoK vs CoK differences**: DoK `SPRIT1` has b0 values 62–81 (more variable
   than CoK's constant 81), suggesting the b0_field carries sprite-specific data
   that differs more in DoK.

---

## 9. Implications for the Engine

This research has **no immediate impact on the engine** (Greybox web engine and
the DOS repacker). The project's primary art conversion pipeline uses:
- `BIGPIC*.DAA`, `CPIC*.DAA`, `BODY*.DAA`, `HEAD*.DAA`, `BACK*.DAA` — all SOLVED
- `8X8D*.DAA` — mostly solved (plane order/palette sharing under active research)

The `SPRIT*.DAA` and `pic*.DAA` files contain combat encounter sprites and
character portraits used in the EXPLORATION view (monster approaching in corridor).
They are needed for a COMPLETE faithful reimplementation but are NOT on the critical
path for the current engine milestones (CT-series combat, ECL VM, exploration).

**Recommendation for `decodeDaa` in TypeScript**: Add a 6-byte TOC detection path
that correctly parses outer structure (entry list) and decompresses inner bytes.
Return the inner raw bytes with metadata `{blockId, raw, numDist, h:88, w8:11}`
for future pixel-decode work. Do NOT attempt pixel decode until the format is
solved. Document the 73-byte inferred header offset as a start point for future
investigation.

---

## 10. Tools and Source Files

- Primary probe scripts (not committed): `tools/_sprit_probe[1-9].py`,
  `tools/_sprit_draw23.py`, `tools/_sprit_hex.py`, `tools/_sprit_sizes.py`,
  `tools/_b0_verify.py`, `tools/_final_alignment.py`, `tools/_sprit_final.py`
- Oracle source: `coab_extracted/engine/ovr030.cs` (`load_pic_final`),
  `coab_extracted/engine/ovr008.cs` (`sub_30580`)
- Format reference: `hackdocs_extracted/DRAW23.TXT` (transparent sprite RLE),
  `docs/daa-format.md` (master spec, Section 1b for 6-byte variant)
- Existing decoder: `tools/daa_decode.py` (outer TOC works; pixel decode skipped)
