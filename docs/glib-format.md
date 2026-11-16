# GLIB — Amiga DataLib container format (.TLB / .GLB)

**Status: verified.** Working decoder: `tools/glib_decode.py` (CLI mirroring
`tools/hlib_decode.py`; renders to git-ignored `renders/glib/`). TS loader:
`packages/engine/src/loaders/glib.ts` (golden parity test
`packages/engine/test/glib.test.ts`, fixtures via `make-fixtures.py`).

GLIB is the **big-endian Amiga sibling of DOS HLIB** (`docs/hlib-format.md`) and
is used by the Amiga ports of all six DataLib-era Gold Box games:

| Title (Amiga)                  | Colour era              | Files | Images decoded | Skipped members |
| ------------------------------ | ----------------------- | ----- | -------------- | --------------- |
| The Dark Queen of Krynn        | 5-plane, 32-colour      | 24    | 1497           | 3 (method 0x19 id-lists) |
| Pools of Darkness              | 5-plane, 32-colour      | 25    | 2599           | 0 |
| Curse of the Azure Bonds       | 4-plane, 16-colour      | 28    | 2209           | 0 |
| Secret of the Silver Blades    | 4-plane, 16-colour      | 22    | 2025           | 0 |
| Gateway to the Savage Frontier | mixed 5- and 4-plane    | 28    | 3281           | 8 (header-only placeholders, `wb=0xFF body=0`) |
| Treasures of the Savage Frontier | mixed 5- and 4-plane  | 25    | 2273           | 81 (73 in the two mis-tagged data libs + 8 `walls.tlb` placeholders) |

(Survey run 2026-07-18 against the read-only WHDLoad installs under
`D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\`.
All 152 `GLIB`-magic files parse at chunk level; "images decoded" counts
pixel-decoded members via `glib_decode.walk`. The former CoAB/Secret unknowns
— "methods" 0x08 and 0xD2, 20 + 75 members — are **closed** (2026-07-18):
0x08 members are 16-colour **colour tables** (§4) carrying the real Amiga
palettes, and 0xD2 is the 4-plane RLE row-interleaved image codec (§5).)

Everything here was derived empirically from the shipped files plus a capstone
M68K disassembly of the Amiga DQK executable (`DarkQueenOfKrynn/data/The Dark
Queen of Krynn`, AmigaOS HUNK; code hunk at file offset 40, so exe address =
file offset − 40). Load-bearing routines:

| Exe addr | Role |
| -------- | ---- |
| 0x48d62  | file loader (drives per-chunk decompression) |
| 0x48e82  | compression-method dispatch (methods 0–5) |
| 0x4c372  | method-5 LZ77 decompressor |
| 0x49198 / 0x49720 | method-3 LZW wrapper / core |
| 0x4912a / 0x490ac | method-3 table init / mark-sweep reclaim |
| 0x4688a  | image header parser |
| 0x4ac4c  | method-0xE3 two-stream image decoder |

## 1. Container layout (big-endian)

```
off 0   ASCII "GLIB"
off 4   u32  file size (DECOMPRESSED size, incl. this 16-byte header)
off 8   u16  pointer count - 1 (stored value excludes the trailing EOF pointer)
off 10  u8   compression method: 0 stored, 3 LZW, 5 LZ77
off 11  u8   magic: 1 = image-id table present at ptr[0], 0 = none
off 12  ASCII member tag: "TILE" | "GLIB" | "HLIB" | "DATA" | "DIG8" | "TEXT"
off 16  u32[count]  pointer list; last pointer == file size
```

Identical to DOS HLIB except: big-endian, the method byte at +10 (unused on
DOS), and the tags. The EOF pointer is occasionally `fsize - 1` when the file
got Amiga even-length padding (seen in TEXT and some DATA files) — treat both
as valid.

- **Leaf** (`TILE`): members are colour tables and images (§4, §5).
- **Master** (`GLIB` tag): `ptr[0]` = set-id table (when magic==1), remaining
  pointers = **sets** — each a complete self-contained leaf file with its own
  16-byte header, relative pointers, and its own compression method.
  **CoAB/Gateway-era masters use tag `HLIB` instead of `GLIB`** (`8X8D.TLB`,
  `TILES.TLB`, `Tiles.tlb`) — engine drift; treat both tags as masters.
- **Non-image** (`DATA`/`DIG8`/`TEXT`): same container, generic payload
  (ECL/GEO data, digitized sound, strings).
- Exe dispatch supports methods 0–5 (1 = library vector 0x4be30, 2/4 =
  static-Huffman text via 0x4bdb4 with tables from "table.dec", 3, 5), but
  **only 0, 3 and 5 occur in shipped files**. DQK/Pool use 5; CoAB/Gateway use
  3; Secret/Treasures compress nothing at file level in some variants and use
  5/0 in others (see survey).
- The **id table** (magic==1) is `u16 n` + n × `{u16 id, u16 pointer#}` —
  byte-identical to the DOS table after endian swap (verified `GEO.GLB`).

### Compressed files

For method != 0, the 16-byte header is stored uncompressed and its
`fsize`/pointers describe the **decompressed** image of the file. On-disk
layout: 16-byte header, then a **u16 slack word** (an in-place-decompression
margin used by the original loader — NOT stream data), then the compressed
stream producing `fsize - 16` bytes. Output is produced in **0x2000-byte
chunks**: each chunk is a stream restart (method 5 ends a chunk with an
`0xE0+` opcode; method 3 begins each chunk with a fresh 16-bit seed word), but
method 3's LZW string table **persists across chunks** of one file.

Nested sets inside masters are compressed individually (their own header
method byte); the master's own pointer table is plain.

## 2. Method 5 — LZ77 (exe 0x4c372)

Byte-oriented opcodes; matches copy forward from `out[len(out) - dist - 1]`:

| First byte `c` | Meaning |
| -------------- | ------- |
| `< 0x80`   | short match: read `d5`; emit `(d5>>3)&3` literals first; then `dist = ((d5<<2)&0x380) \| c`, `len = (d5&7)+3` |
| `0x80–0xBF`| long match: read `d5,d6`; emit `d6&3` literals; `dist = ((d5&0xE0)<<1) \| (c&0x3F) \| ((d6<<7)&0x7E00)`, `len = (d5&0x1F)+3` |
| `0xC0–0xDF`| literal run: `n = c&0x0F`; if `!(c&0x10)`: `n = (n+1)<<2` (4–64 in fours), else `n` (1–15) |
| `0xE0–0xFF`| end of 0x2000-output chunk |

Verified: all six DQK compressed files decompress to exactly `fsize` with
valid pointer tables; renders are pixel-coherent.

## 3. Method 3 — LZW with entry recycling (exe 0x49198/0x49720)

10-bit **fixed-width** codes, big-endian bit packing. Each chunk starts with a
u16: top 10 bits = first code (expanded immediately), low 6 bits = remainder
of the bit buffer.

Table (init at 0x4912a): codes 0x00–0xFF are literals (append-char = self,
flag 0xFF = permanent); 0x100–0x3FF are dynamic `{prefix, append}` entries
with a per-code flag byte: `0` free, `1` recently used, `0xFF` allocated. A
zero sentinel at index 0x400 bounds the free-slot scan. `next_code` starts at
0x100.

Main loop per code: expand code (recursive prefix walk, standard LZW), then
allocate entry `{prefix = prev_code, append = first byte of current
expansion}` at the current free slot, mark `flag[prev]=1`, `flag[new]=0xFF`,
and linear-scan upward for the next `flag==0` slot. When the scan passes
0x3FF, a **mark-sweep reclaim** (0x490ac) runs: allocated-but-not-recently-
used entries are freed (≥ 0x55 of them, looping the sweep until that quota is
met; prefixes of live entries are re-protected each pass), and allocation
restarts at the lowest freed code. The table persists across the file's
chunks.

Verified: all 44 nested members of CoAB `PIC.TLB` (and every other method-3
set in CoAB/Gateway) decompress with exact byte consumption and valid pointer
tables; renders are pixel-coherent.

## 4. Colour table (both eras)

Header + RGB triplets, in two shapes keyed by `cmagic` at byte +7:

```
off 0  u16 cycle?      off 2  u16 first_col     off 4  u16 ncolors
off 6  u8  nranges     off 7  u8  cmagic
off 8  triplets {u8 R, u8 G, u8 B}   full 8-bit values (NOT 4-bit Amiga <<4)

cmagic 0xE8, 104 bytes: 32 triplet slots   (5-plane era)
cmagic 0x08,  56 bytes: 16 triplet slots   (4-plane era; 0x08 is literally the
                                            DOS HLIB cmagic value — DOS uses
                                            8 or 24)
cmagic 0x08,   8 bytes: header-only empty table (CoAB BIGPIC set 3)
```

**Detection rule: region size ∈ {8, 56, 104} and byte +7 ∈ {0x08, 0xE8}.**
(cmagic values never occur as drawing methods anywhere in the corpus, so the
rule is unambiguous.)

Field semantics (settled 2026-07-18 — NOT fully vestigial): **valid triplets =
`min(ncolors, capacity)` when `ncolors > 0`, else the full capacity; they load
at palette index `first_col`**, merging over the current palette. Proof:
Amiga `FRAME.TLB` members m000/m041–m044 (`first_col=16, ncolors=16`,
capacity 32) are the member-for-member twins of DOS `FRAME.TLB`'s five
cmagic-0x18 colour tables (`first_col=16, ncolors=16`) at the **same member
indices** — they patch colours 16–31 only; slots past the valid count hold
packer garbage (shifted copies of the table itself). Out-of-range `ncolors`
values (37, 48, 112, 256…) simply clamp to capacity. Semantics of a non-zero
`cycle`/`nranges` are still UNKNOWN (no cycle payload follows — unlike DOS).

**4-plane-era palettes are real and shipped** (the old "EGA stand-in only"
note is obsolete): every Secret BIGPIC/PIC set carries its own 56-byte table,
and CoAB/Secret `ALWAYS.TLB` member 0 holds the **game-global 16-colour Amiga
palette** (CoAB: black, white `f0f0f0`, dark red `bf0000`, flesh `ffaf7f`,
pale yellow, greens/blues/greys… — verified by the pixel-perfect CoAB title
screen render). `ALWAYS.TLB` m087 is a variant table (black/grey swapped).
Sets with no table of their own (CoAB BIGPIC/PIC/8X8D…) inherit the
game-global palette at runtime: pass `--pal <ALWAYS.TLB>` to
`glib_decode.py` (or `fallbackPalette` from `firstGlibPalette()` in the TS
loader); the EGA16 stand-in remains only as a last-resort default. Title
screens beyond the first may still use intro-code palettes not present in the
data files (Secret's title renders oddly even with the ALWAYS palette —
engine behaviour, not container format). Some 5-plane sets (`Walls`,
`DungCom`, sprite libraries) also omit the table and inherit the screen
palette at runtime.

## 5. Image members

8-byte big-endian header, then pixel data:

```
off 0  u16 height          off 2  u16 vertical offset (placement hint)
off 4  u16 horizontal offset (hint)
off 6  u8  wb = bytes per plane row  (width = wb * 8)
off 7  u8  drawing method
```

Pixels are **Amiga planar, MSB-first**: pixel x lives in bit `7-(x&7)` of
plane byte `x>>3`; plane p contributes bit p of the colour index. The one
exception is method 0x02 (chunky), below.

**`dm >= 0xE0` → 5 planes (32 colours); `dm < 0xE0` → 4 planes (16 colours).**
Both eras coexist inside Gateway/Treasures (per-set, not per-title).

| Method (5-pl / 4-pl) | Layout | Verified on |
| -------------------- | ------ | ----------- |
| 0xE0 / 0x00 raw opaque | planes stored **contiguously** (plane p = whole `h*wb` block p) | Pool BIGPIC scene; CoAB 8X8D icons |
| 0xE1 / 0x01 raw masked | mask plane FIRST, then colour planes, all contiguous; mask bit 1 = **transparent** (§5b) | DQK CPIC white dragon |
| 0xE2 raw-RLE opaque (5-plane) | one continuous PCX-style RLE stream (`c<128`: copy c+1 literals; `c>=128`: repeat next byte 257−c times); decompressed layout is **row-interleaved**: per screen row, 5 sub-rows of `wb` bytes (plane 0 row, plane 1 row, …) | DQK TITLE backdrop |
| 0xD2 RLE opaque (4-plane) | same RLE + **row-interleaved planar** with 4 sub-rows per row — the 4-plane sibling of 0xE2 (every member RLE-expands to exactly `h*wb*4`; contiguous-planes and chunky layouts both proven wrong visually) | CoAB + Secret TITLE screens (pixel-perfect SSI/AD&D screen), ALWAYS.TLB UI strips |
| 0x02 RLE opaque (4-plane) | same RLE, but decompressed data is **CHUNKY 4bpp** (high nibble = left pixel) — the format's only non-planar method; presumably DOS-pipeline pixels converted to planar at load | CoAB PIC treasure scene; Secret BIGPIC |
| 0xE3 / 0x03 compressed masked | two-stream (below) | DQK TITLE overlays; CoAB SKY mountains; Gateway Sprit knight |
| 0x19 (25) | image-id list, not pixels (same as DOS — skipped) | — |
| ~~0xE8~~ | **not a drawing method** — `FRAME.TLB`'s five 104-byte "0xE8 members" are colour tables for colours 16–31 (§4), twins of the DOS FRAME.TLB tables | — |
| ~~0x08~~ | **not a drawing method** — 56-byte 16-colour colour tables (§4); the real 4-plane-era Amiga palettes | — |

Members shorter than 8 bytes, or with `h==0`/`wb==0`, are placeholders (e.g. 8
header-only entries in Gateway `Walls.tlb` with `wb=0xFF, body=0`) — skip.

### 5a. Two-stream masked codec (0xE3 / 0x03; exe 0x4ac4c)

```
body: u16 dataOffset, u16 planeStride,
      ctrl stream  = body[4 .. 4+dataOffset]
      then nplanes per-plane data streams, planeStride bytes each
```

The **single ctrl stream is re-executed once per plane**, each time consuming
that plane's data stream. Per row, opcodes:

| Ctrl byte | Meaning |
| --------- | ------- |
| 0x00      | end of row |
| 0x01–0x3F | skip n output bytes (transparent) |
| 0x40 \| n | masked copy: n data bytes, each preceded in the CTRL stream by a mask byte m; `dest = (dest & ~m) \| (data & m)` |
| 0x80 \| n | run: next data byte repeated n times |
| 0xC0 \| n | copy n literal data bytes |

Pixels never touched by the ctrl stream are transparent (decoders emit index
255). Verified by exact stream-length arithmetic (`4 + dataOffset +
nplanes*planeStride == body length`) across hundreds of members plus visual
proof in both eras.

### 5b. Mask polarity (0xE1 / 0x01) — SOLVED

**Mask bit 1 = transparent (keep destination); bit 0 = draw the pixel.**
Proven corpus-wide (2026-07-18): across all **10,587** raw-masked members in
the six titles, the 1,190,678 pixels under mask=1 carry **zero** colour-plane
bits, while the 1,487,626 pixels under mask=0 are 85% nonzero — the packer
zeroes colour data in transparent areas, so the alternative polarity would
mean every sprite is drawn entirely in colour 0 with its art in the
transparent region. Structural spot-proof: `FRAME.TLB` m013 masks the left
nibble (`0xF0` rows) while all its colour bits sit in the right nibble, and
fully-opaque members (m014/m019) ship all-zero masks. This also explains the
old "CPIC sets mask=1 OUTSIDE the sprite" observation: outside = background
preserved. Decoders now emit index 255 for mask=1 pixels (same key as the
two-stream methods).

## 6. DOS ↔ Amiga cross-check (DQK)

Same-game payload comparison, Amiga `GLIB` vs DOS `HLIB`:

- **GEO.GLB: 20/20 data members byte-identical** to DOS; the id table is
  identical after endian swap. Map data is fully platform-neutral.
- **ECL.GLB: 42/47 members byte-identical**; the 5 divergent members are
  platform-specific script differences (not decode errors — both sides parse).
- **MONCHA.GLB**: mostly divergent (expected — platform-specific monster
  art/config packing).

This proves GLIB `DATA` payload extraction end-to-end: the Amiga files carry
the same engine data as DOS, in the same member framing.

## 7. Format-family contrast

| | DAX (DOS CoK/DoK) | DAA (Amiga CoK/DoK) | HLIB (DOS DQK-era) | GLIB (Amiga DQK-era) |
| - | - | - | - | - |
| Endian | little | big | little | big |
| Directory | sized TOC {id,off,len} | sized TOC | pointer table | pointer table |
| File compression | none (per-block RLE) | none (per-block) | none | LZ77 / LZW at (sub-)file level |
| Pixels | 4bpp chunky EGA | 5-plane planar | 8bpp chunky Chain-4 | 4/5-plane planar (one chunky method) |
| Palette | fixed EGA16 (none in file) | 12-bit in frame | 8-bit ranged colour table | ranged 8-bit table: 104-byte/32-slot (cmagic 0xE8) or 56-byte/16-slot (cmagic 0x08), `first_col`/`ncolors` slicing |

## 7a. `DATA` conventions, measured across the whole Amiga corpus (2026-08-24)

Two things §1 stated on one file each are now measured over **all 152 `GLIB`-magic files** in the
six DataLib-era ports. Pinned by `tools/test_glib_data_conventions.py` (skips when the
never-vendored WHDLoad source is absent).

### The member-0 id table is present **iff** `magic == 1`

§1 verified this on `GEO.GLB` alone. Corpus-wide:

| | files |
| --- | ---: |
| `magic == 1` carrying a `2 + 4n` table at `ptr[0]` | **117 / 117** |
| `magic == 0` carrying one | **0 / 35** |

Zero exceptions in either direction, across every tag (`TILE`, `GLIB`, `HLIB`, `DATA`, `DIG8`,
`TEXT`). So the table is a **container** property, not a `TILE` or `DATA` one — the same conclusion
the DOS side reached independently (`hlib-format.md` §1c: 7/7 and 0/3 for its `DATA` libraries).
The `magic == 0` group is a real null rather than the non-image tags scoring zero by construction:
**26 of those 35 are `TILE` leaves.**

### The big-endian length word is an engine-generation convention

`hlib-format.md` §6a scoped its length word to DQK `MONCHA.GLB` and FRUA `MONST.GLB` and left the
Amiga siblings untested. Tested now, all six Amiga bestiaries split cleanly in two, with three
traits co-varying:

| Title | tag | records | storage | record size | length word |
| --- | --- | ---: | --- | ---: | :-: |
| Dark Queen of Krynn | `DATA` | 98 | monchaRLE after the word | variable 408..606 | **yes** |
| Pools of Darkness | `DATA` | 122 | monchaRLE after the word | variable 406..586 | **yes** |
| Curse of the Azure Bonds | `DATA` | 78 | monchaRLE from byte 0 | fixed **422** | no |
| Secret of the Silver Blades | `DATA` | 70 | monchaRLE from byte 0 | fixed **440** | no |
| Gateway to the Savage Frontier | `GLIB`(!) | 69 | **uncompressed** | fixed **422** | no |
| Treasures of the Savage Frontier | `GLIB`(!) | 130 | **uncompressed** | fixed **422** | no |

All-or-nothing in every case — 0 or 100%, never a partial score that would suggest a predicate
fitting noise.

**Two record layouts, not one.** The four pre-DQK bestiaries open each record with `u8 nameLen`
then the name (`0B "ROYAL GUARD"`, `08 "BASILISK"`, `0A "KRAKEN SPY"`), while the two DQK-era ones
put the name at a fixed offset — `0x68` on DOS DQK. That gives the test a built-in null: the
Pascal-name predicate must score **0/98 and 0/122** on DQK and Pools, and does. So the split is
visible in the record body as well as the container header.

**Gateway and Treasures mis-tag their bestiary as a master.** Both use the `GLIB` tag, which §1
defines as "master: members are complete self-contained leaf files" — yet **0 of 69** and **0 of
130** members carry the GLIB magic. They are ordinary monster records. §1 already flagged
"two mis-tagged data libs" for Treasures; the same applies to Gateway.

**The rule is generation, not necessity.** "The word appears iff the record size varies" is the
natural reading here — DQK and Pools vary, the other four are fixed — and it is **wrong**. DOS FRUA
`MONST.GLB` is the counterexample: every record is 450 bytes and it carries the word anyway. What
survives is the generation split; DQK-era containers carry it whether or not they need it. FRUA is
precisely where it is redundant, which is why it was long mis-read there as a fixed "`01 C2` record
marker" (`0x01C2` = 450).

**No engine code reads the Amiga bestiaries** — `decodeGlib`'s consumers are the image path and
`decodeGlibDig8`. So this is measurement and documentation, not a bug fix; it is recorded here so
that whoever does wire them up knows there are two record conventions and which games use which.


## 8. Open unknowns

Closed 2026-07-18: ~~image methods 0x08 / 0xD2 / 0xE8~~ (0xD2 = 4-plane RLE
row-interleaved images; 0x08/0xE8 = colour tables, §4/§5), ~~0xE1/0x01 mask
polarity~~ (§5b), ~~real 4-plane-era palettes~~ (shipped in the data files
after all — §4). Still open:

- Method **0x19** image-id lists (also unsolved on DOS — low value).
- Colour-table `cycle`/`nranges` field semantics (§4) — `first_col`/`ncolors`
  are now proven meaningful, but non-zero cycle values have no payload and
  their runtime effect is unproven.
- **Title-screen palettes beyond the first screen**: CoAB/Secret TITLE.TLB
  carry one table for five screens; later screens (e.g. Secret's fortress)
  render implausibly with every palette shipped in the data files, so the
  intro code likely sets its own (executable-resident, UNLOCATED — engine
  behaviour, not container format). `CURSE.SLB`/`SECRET.SLB` (`SLBR` magic)
  and `SECRET.MX` (`MXTX`) are different formats, not GLIB, and unexamined.
- `TEXT` (`Strings.glb`) payload internals (members extract fine; content
  format not reversed). **`DIG8` is now SOLVED** (2026-07-21): byte-identical
  framing to DOS `DIG4` — `u16` big-endian sample rate + `u16` zero + raw
  8-bit-unsigned PCM — see `packages/engine/src/audio/dig8.ts` and
  `docs/engine/research/audio-silent-titles.md`.
- Treasures `ecl.glb` / `Luck.glb` are **mis-tagged `TILE`** while holding
  non-image data members (decoders yield 0 images + honest skip lists there).
- Exe compression methods 1/2/4 exist in the dispatch but are unused by any
  shipped file (method 2/4's "table.dec" static-Huffman path was not reversed).
