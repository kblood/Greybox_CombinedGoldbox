# SSI Gold Box AMIGA Pool of Radiance `.dax` Format

Reverse-engineered and verified 2026-07-22 (palette dispatch + `sqrpaci`
closed 2026-07-23). This is the **4th distinct Amiga
Gold Box container generation** — the one flagged as "genuinely new, unsolved"
in `docs/amiga-inventory.md` §3 (2026-07-18). It is used only by the 1989
Amiga port of Pool of Radiance (the oldest Gold Box title); CoK/DoK use
`.DAA` (`docs/daa-format.md`), the DQK-era Amiga titles use `GLIB`
(`docs/glib-format.md`).

Reference decoder: `tools/pool_amiga_decode.py`. Sample renders:
`renders/pool_amiga/` (git-ignored).

Source data: the WHDLoad unpacked set at
`D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\PoolOfRadiance\data\`
(23 `*.dax` files, file dates 1989-09-20).

**How it was cracked:** the container TOC fell to byte analysis; the
compression did not (it is a bit stream, no verbatim plaintext bytes). It was
solved by disassembling the Amiga 68000 `program` executable (Amiga Hunk
format, 41 hunks) with capstone — the same technique that cracked the `.DAA`
sub-frame codec. The block loader lives in hunk 10 (~+0x2e4, referencing the
`.dax` suffix string at hunk 11+92); it calls the decompressor at
**hunk 27 + 0x7346** through the jump stub at hunk 10+0x6ce6. The token
grammar below is a direct transcription of that routine.

**All multi-byte integers are BIG-ENDIAN.**

---

## 1. Container layout — VERIFIED

```
offset  size   field
0       2      word0        = entry_count * 10   (BE)
2       10*N   TOC, N = word0/10 entries, each 10 bytes BE:
                 +0  uint16  block_id     sparse id (NOT a 0..N-1 index)
                 +2  uint32  data_offset  relative to data_base
                 +6  uint16  comp_size    compressed size (always mult. of 4)
                 +8  uint16  raw_size     decompressed size
2+word0 ...    data section (concatenated compressed blocks)
```

- `data_base = 2 + word0` (DOS-DAX-style, **unlike** `.DAA` where
  `data_base == word0`).
- Offsets chain perfectly (`off[i+1] == off[i] + comp[i]`) and the last block
  ends exactly at EOF, for every file.
- Note vs. the 2026-07-18 first-look notes: what was then called `fieldA`/
  `fieldB` = `comp_size`/`raw_size`. (`fieldB` "suspiciously repeats" simply
  because same-dimension frames share a raw size, e.g. 396 for every 24×24
  sprite; 4240-stride values were animated-picture frames of constant size.)

## 2. Compression — "Pool LZSS" (backwards bit-stream LZSS + XOR checksum) — VERIFIED

Transcribed from `program` hunk 27+0x7346. The compressed block is processed
**backwards**, in 32-bit big-endian longs read from the END of the block:

```
[... bit-buffer longs ...][u32 checksum][u32 raw_size]   <- end of block
```

- The **last** long = `raw_size` (u32; the low word is also copied to the
  caller and matches the TOC `raw_size`).
- The **second-to-last** long = XOR checksum: XOR of all bit-buffer longs
  consumed must equal it (decoder keeps `d5 ^= long` and requires 0 at end).
- Remaining longs (moving toward the block start) are the **bit buffer**.
  Bits are extracted from each long **LSB-first** (`lsr.l #1`). The highest
  set bit of each long is a **sentinel**, not data: when the shift leaves the
  register at 0, that bit is discarded and the next long is fetched. Fetched
  longs get a forced bit-31 sentinel after contributing their LSB via
  `roxr.l #1` (so refill longs carry a full 32 data bits; only the very first
  long is partial).
- Multi-bit fields are assembled **MSB-first** from consecutive bits.
- Output is written **backwards** from `out[raw_size]` down to `out[0]`;
  decode loop runs until the front of the buffer is reached.

Token grammar (bit values as read):

| bits          | meaning                                                  |
|---------------|----------------------------------------------------------|
| `0 0`         | literal run: 3-bit `n`, then **n+1** × 8-bit literal bytes |
| `0 1`         | match: 8-bit offset, copy **2** bytes                    |
| `1 00`        | match: 9-bit offset, copy **3** bytes                    |
| `1 01`        | match: 10-bit offset, copy **4** bytes                   |
| `1 10`        | match: 8-bit `len`, then 12-bit offset, copy **len+1** bytes |
| `1 11`        | literal run: 8-bit `n`, then **n+9** × 8-bit literal bytes |

Matches copy from **higher** addresses (bytes already decoded, since output
grows downward): `p -= 1; out[p] = out[p + offset]` repeated (overlap allowed,
sequential — offset semantics as in the 68000 `move.b (a2,d2.w),(a2)` loop).

**Verification:**
- **843/843 blocks across all 23 `.dax` files** decompress to exactly
  `raw_size` bytes with XOR-checksum residual 0.
- **Known-plaintext cross-platform proof:** the DOS GOG Pool of Radiance
  `ECL*.DAX` blocks (Gen1 DAX RLE, decoded with `tools/dax_decode.py`) were
  compared against the Amiga `ecl.dax` blocks of the same block ids:
  **28/29 blocks are BYTE-IDENTICAL** (ids 1..29). Only id 0 differs
  (7470 vs 7473 bytes — a genuinely different platform boot/init script; it
  still decompresses cleanly with checksum 0).

## 3. Graphics frames — VERIFIED

Pool-Amiga is 16-color, **4 bitplanes** (not `.DAA`'s 5), no embedded palette.

### 3a. Standard frame block (cpic, icon, cbody, chead, comspr, head, body, 8x8d, dungcom, bacpac, wildcom, randcom)

```
offset  size  field
0       2     height        (pixels, BE)
2       2     width_div8    (width = width_div8 * 8)
4       2     y_offset      (observed 0)
6       2     x_offset      (observed 0)
8       2     num_frames    (tile/frame count; 1 for single images)
10      2     plane_size    = row_bytes * height, row_bytes = ceil(width/16)*2
12      ...   num_frames × (4 contiguous bitplanes of plane_size bytes each)
```

- Pixels: plane 0 = LSB, MSB-first within each byte, word-aligned rows —
  same conventions as `.DAA` §4 but 4 planes.
- Block byte count always == `12 + num_frames*4*plane_size` (verified all
  files). Examples: 24×24 sprite = 12+384 = 396; 8x8d tile block = 35 frames
  of 16×8 = 2252; dungcom = 13 frames of 48×24 = 7500.

### 3b. Animated picture block (pic, final, sprit)

```
0   u16  0
2   u16  num_frames
then per frame:
    u32  delay          (0x0a for pic/final story pictures, 0 for sprit)
    12-byte standard frame header (num_frames field == 1)
    4 × plane_size pixel bytes
```

- `pic`/`final`: all frames same size (88×88, frame stride 4240; e.g. block
  raw 16964 = 4 + 4×4240) — the delay-animated story pictures, the direct
  analog of the DOS animated/complex `PIC*.DAX` format
  (`tools/dax_complex_decode.py`), but stored as full frames, no XOR delta.
- `sprit`: per-frame sizes differ (the classic near/mid/far zoom array).

### 3c. Non-graphics files

`ecl, geo, item, moncha, monitm, monspc, walldef` are plain data blocks
(ECL bytecode, GEO maps, etc.) — same container + compression, no frame
header. (`items`, `intro`, `program`, `run`, `PtoH` are not `.dax`
containers; the latter four are Amiga Hunk executables.)

### 3d. `sqrpaci.dax` — wilderness map square art — SOLVED 2026-07-23

The 2026-07-22 note calling `sqrpaci` "data, not frame-formatted" was wrong
(and its "raw 0x2c04" figure was a misread — that is nothing in the current
TOC). Both blocks are **ordinary §3a standard frame blocks** and the checked-in
decoder already renders them:

| block | comp   | raw            | content                       |
|-------|--------|----------------|-------------------------------|
| 1     | 28,612 | 36,876 (0x900c)| 64 frames of 48×24, 4 planes  |
| 2     | 30,056 | 36,876 (0x900c)| 64 frames of 48×24, 4 planes  |

(12 + 64×4×144 = 36,876 exactly, both blocks.)

**Purpose (proven from `program` disassembly):** the two blocks are the two
banks of **wilderness-view square art** ("SQuaRe Picture" — terrain squares:
mountains, rivers, coastline, roads, forest, heavily dithered). Evidence:

- The wilderness mode setup (hunk 25+0x15f6, the routine that sets the
  location-mode global `h32+0xba = 10` and preloads `COMSPR` blocks 0..12
  into sprite slots 13..25) loads `sqrpaci` block 1 → pointer `h32+0xb18`
  and block 2 → `h32+0xb1c`.
- `DrawWildernessSquare(x, y, code)` at hunk 22+0x1848 validates
  `0 <= x,y <= 18` and dispatches on the **square code's bit 7**:
  `code <= 0x7f` → frame `code` of block 1; `code > 0x7f` → frame
  `code & 0x7f` of block 2. So a map byte encodes 128 possible square arts
  (64 per bank).
- The wilderness view composer at hunk 13+0x2900 walks rows of square codes
  (11- and 18-entry bands) applying the same bit-7 bank rule.
- Display palette: `combat2` (== `combat`) — the wilderness movement loop
  re-installs it at hunk 25+0x358e (see §4). The dithered look under that
  palette is genuine.

## 4. Palettes — SOLVED: per-context dispatch traced 2026-07-23

No palette exists in any `.dax` file. `program` **hunk 23** holds five
16-color Amiga 12-bit (`0x0RGB`, scale ×17) tables at +0, +32, +64, +96,
+128, immediately followed by the name list `8x8d CBODY CHEAD CBODY COMSPR
ICON` (the combat-screen art files).

**Mechanism (disassembled):** hunk 22+0xde is the single palette installer
(copies 16 color words into the ViewPort colour table via `h32+0x2c` and
refreshes the copper list through hunk 22+0x59d4). Its only callers are five
tiny setters, one per table — `SetPal_dark` h22+0x11c (+0), `SetPal_combat`
h22+0x146 (+0x20), `SetPal_pic` h22+0x172 (+0x40), `SetPal_combat2`
h22+0x19e (+0x60), `SetPal_alt` h22+0x1ca (+0x80) — plus a thin wrapper
h22+0x1f6 around `SetPal_pic`. **No other palette source exists in
`program`:** every relocation into hunk 23's palette region was enumerated,
and no code composes or modifies a palette at runtime. (Scope: the in-game
`program` executable; the separate `intro` executable was not traced.)

Dispatch, from every call site of the five setters:

| offset | name      | proven display contexts (call sites) |
|--------|-----------|--------------------------------------|
| +0     | `dark`    | 3D dungeon exploration ambient (bg 0x222) — restored when leaving menus while location-mode `h32+0xba` == 5 (h10+0x5566, h13+0x5f0e) |
| +32    | `combat`  | chargen combat-icon editor preview + after icon editing (h10+0x3b02, h10+0x2374) |
| +64    | `pic`     | **HEAD/BODY paper dolls** (see §4a) + ambient menu/character-sheet/story-picture palette (h4+0x624, h13+0x5b7c, h10+0x4900, restores at h10+0x2384/0x4342/0x5308) |
| +96    | `combat2` | == +32. Combat screen (h7, h25), wilderness view (h25+0x358e), FINAL-block zoom-in animations except block 2 (h13+0x261e) |
| +128   | `alt`     | special scene pictures: camp screen = PIC 29 (h13+0x5bbe), treasure screen = PIC 1 (h13+0x5c4e), FINAL block 2 red-dragon scene (h13+0x2618), and NPC parley portraits drawn from PIC when the record's head id is 0xff (h4+0x796, h16+0x235c) |

The engine's screen-refresh dispatcher (h13+0x5b58, switching on the display
-mode global `h32+0x0`) re-installs the palette per mode: mode 1 = paper
doll → `pic`; mode 2 = camp (PIC 29) → `alt`; mode 6 = treasure (PIC 1) →
`alt`. So `pic.dax` pictures are *not* uniformly shown under one palette —
blocks 1 and 29 (and FINAL 2) belong to `alt`; renders confirm both look
correct only under their engine-chosen table.

This corrects the 2026-07-22 first-pass guesses: `alt` is **not** a chargen
/head palette (it is the camp/treasure/special-scene palette), and the
head/body "wrong skin tones under all 5 palettes" impression was wrong —
under `pic` (+64) the paper dolls render with natural skin, hair and armour
(the earlier round evidently never compared heads under `pic` [system default
was `combat`]).

### 4a. HEAD/BODY paper dolls — SOLVED

- Loader `LoadHeadBody(head_id, body_id)` h19+0x1592 caches the two blocks
  (`HEAD` → ptr `h32+0x17ca`, `BODY` → `h32+0x17d0`).
- Renderer `DrawHeadBody(x, y, split)` h19+0x1636 draws **head (56×40) at
  column x+2, row y** and **body (88×48) at column x, row y+5** (8-px
  units) — i.e. an **88×88 composite** (head pixel offset (16,0), body
  (0,40)), the same footprint as a PIC story picture. No pixel remapping —
  a straight planar blit.
- `ShowPaperDoll` h4+0x5dc (character view / NPC parley) installs
  **`SetPal_pic` immediately before drawing**; the h13 refresh dispatcher
  mode 1 does the same. Chargen draws under the same ambient `pic` palette
  (its editors temporarily switch to `combat` for the 8×8 icon preview and
  restore `pic` afterwards). **Verdict: the paper-doll palette is `pic`
  (+64), fixed — there is no user-driven or per-race palette composition on
  Amiga** (color choice exists only for the 8×8 combat icon, as on DOS; cf.
  hackdocs UAPALETT.TXT: Gold Box art carries no palette and is drawn under
  the active screen palette).
- **Chargen id mapping:** the chargen editor (h10+0x374a, menu `Head Body
  Keep`) cycles `char[0xbd]` = head 1..14 and `char[0xbe]` = body 1..12,
  mapped to block ids through byte tables in **hunk 31**: head
  `h31[0x1a4e + n]` = `[0,8,9,13,16,18,22,34,45,51,53,57,67,68]`, body
  `h31[0x1a5c + n]` = `[1,2,3,4,7,8,18,5,26,33,35,37]` (slots 13/14 of the
  body table point at blocks 49/50 which don't exist in `body.dax`,
  matching the engine's 12-body cap). All mapped ids exist in the files.
  NPC/monster records store raw block ids instead (word +0x5c2 = head id,
  0xff = "use PIC portrait").
- `tools/pool_amiga_decode.py --paperdoll all|H:B[,H:B...]` renders the
  composites; spot-checks (h1b1, h8b7, h14b12) show seamless neck
  alignment and correct skin/hair/armour ranges under `pic`.

## 5. Cross-platform comparison notes

- Frame dimensions match the DOS release exactly (per-id: 24×24/24×48 CPIC
  sprites etc.), but the **pixel art itself is genuinely redrawn** on Amiga
  (~40-60% of non-background pixels differ on compared CPIC blocks; no
  index-bijection exists). Amiga Pool is not a palette-swap of the DOS art.
- ECL bytecode is byte-identical (28/29), so the Amiga port runs the same
  scripts — consistent with the CoK/DoK finding.

## 6. Verified / assumed / unsolved

**VERIFIED:** container (§1, all 23 files chain + end exactly at EOF);
compression incl. checksum (§2, 843/843 + 28/29 DOS byte-identity); standard
and animated frame layouts (§3, byte-count exact for every graphics block);
4-plane pixel decode (coherent renders across 15 graphics files, 1544 PNGs);
**full per-context palette dispatch** (§4, every setter call site traced
2026-07-23); **paper-doll composition** (§4a, loader/renderer/chargen tables
disassembled + coherent composite renders); **`sqrpaci` = wilderness square
art** (§3d, bank-select draw routine disassembled + terrain renders).

**ASSUMED:** delay field semantics (matches DOS complex-frame delay
position); `intro` executable's palettes (not traced — out of scope, the
in-game `program` covers all `.dax` display paths).

**UNSOLVED:** nothing load-bearing. (Minor: which of the h13 refresh
dispatcher's modes 3/4 map to which sub-screens was not exhaustively
catalogued; both route through the h7+0x396a draw path with no palette
change.)

## 7. TypeScript port + `decodeAsset` wiring — PLAN-ROUND-32.md R3 (2026-09-03)

`packages/engine/src/loaders/poolAmiga.ts` is a direct, faithful port of this decoder
(`parseContainer`, `decompress` incl. the XOR checksum, `planarToIndices`,
`parseStandard`, `parseAnimated`, the four fixed palette tables — `combat2` reuses
`combat`, matching §4's "byte-identical" note). It returns the same `DecodedAsset`
shape as `daa.ts`'s `DaaArchive`. Palette values reuse the existing `amiga-12bit`
`PaletteSource` tag (shared with `.DAA`) rather than adding a new tag to the shared
model — the color model (Amiga 12-bit RGB, ×17 scale) is identical; only the
provenance differs (a fixed executable table here vs. a per-frame embedded table in
DAA), which was judged not to warrant a model change.

**Golden-fixture proof:** `tools/pool_amiga_golden.py` emits
`packages/engine/test/fixtures/pool-amiga-golden.json` — sha256 hashes only (no pixel
data), per block: the decompressed-bytes hash, and per decoded frame: its index-array
hash. **843/843 block hashes and 1672/1672 frame hashes** match between the TS port and
this Python oracle (`packages/engine/test/poolAmiga.test.ts`), against the alternative
that the port merely renders plausibly rather than byte-identically — the null (flip one
bit of each block's first compressed byte, re-decode) scores 0/843 still matching.

**Hintless detection (`sniffPoolAmiga`) — feasible, and enabled.** The strict container
chain (`word0 % 10 == 0`, offsets chain, last block ends EXACTLY at EOF — no slop) plus
an XOR-checksum verification of the first block: **23/23 true positives** on the real
Pool corpus, **0/57 false positives** measured against a sample of real DOS `.DAX`
(Champions of Krynn, 20 files), DQK `.TLB`/`.GLB` (20 files) and Amiga `.DAA` (CoK
WHDLoad set, 17 files):

```
python3 - <<'PY'
import struct, glob, os
# see packages/engine/src/loaders/poolAmiga.ts's sniffPoolAmiga doc comment for the
# equivalent TS logic; this is the throwaway Python prototype used to measure the
# false-positive rate before enabling the branch.
PY
```

`decodeAsset` (`packages/engine/src/index.ts`) now sniffs `pool-amiga` BEFORE `daa`:
`sniffDaa`'s 6-byte-index branch is deliberately loose (`docs/daa-format.md` §1b /
`daa.ts`'s doc comment), and 9 of the 23 real Pool files satisfy it by coincidence, so
before this round they fell into `decodeDaa` and failed there with a descriptive error
(see `daaIndexValidation.test.ts`'s "Pool of Radiance files are rejected" test, now
updated to "decodeAsset now decodes them as pool-amiga instead"). 1 more file
(`item.dax`) was a `sniffDax` false positive. All 23 now decode successfully; see
`packages/engine/test/amigaGlibSetsCensus.test.ts`'s Pool-of-Radiance census for the
full per-file before/after table (843 blocks total: 511 image blocks — `standard` or
`animated` — plus 332 non-graphics `data` blocks).

**Sibling-oracle measurement** (per-block-id `(w, h)` agreement between the Amiga
decode and the DOS DAX decode of the same `pool-of-radiance.json` manifest family,
against the alternative that Amiga block ids are unrelated to DOS block ids):
**295/295 (100%) shared ids agree.** Only 4 of the 11 candidate families (`cpic`,
`chead`, `comspr`, `cbody`) produce any shared ids at all — the other 7 (`pic`, `8x8d`,
`dungcom`, `wildcom`, `randcom`, `sprit`, `bacpac`) have DOS files that are entirely
"complex frame" encoded, which `tools/dax_decode.py`'s `parse_standard_frame` declines
rather than mis-decodes (a real limitation of this particular sibling oracle, not
evidence the formats disagree). Of the 4 with shared ids, `comspr` (23 ids) and `cbody`
(128 ids) are **vacuous** — every shared id is the same `(24, 24)` value on both
platforms, so any id correspondence "agrees" by construction. Only `cpic` (116 ids, 4
distinct values) and `chead` (28 ids, 2 distinct values) are **discriminating** — 144 of
the 295 shared ids.

**Numbered negative — the plan's predicted null did not hold.** PLAN-ROUND-32.md R3
predicted a shuffled-id-mapping null of `<= 15%`. Measured: a global shuffle across all
295 shared ids scores **~55%** (20-seed average) — driven by the 151 vacuous ids where
shuffling changes nothing. Restricting to the 144 discriminating ids (`cpic` + `chead`)
gives a fairer null of **~29%**. The real result (100%) still clearly separates from
either null, so the sibling-id-oracle hypothesis holds — just not by the margin
predicted. See `tools/test_pool_amiga_golden.py`'s
`test_sibling_oracle_null_is_higher_than_the_plan_predicted` for the pinned numbers.

**A real, unfixed gap this round exposed (out of R3's owned files):**
`tools/engine_export_consumers.py`'s `decoded_asset_formats()` scans `index.ts`'s
`DecodedAsset` union with `_DECODED_ASSET_FORMAT = re.compile(r"format:\s*'(\w+)'")`.
`\w+` does not match a hyphen, so `format: 'pool-amiga'` — the first hyphenated
`DecodedAsset.format` tag ever added (every prior tag — `hlib`/`glib`/`ilbm`/`daa`/`dax`
— is a single word) — is silently invisible to `decoded_asset_formats()`. Consequence:
`FORMAT_REACHABILITY` / `KNOWN_UNREACHABLE` in `tools/test_engine_export_consumers.py`
do not know `pool-amiga` exists yet, so `test_known_unreachable_pinned_exactly` and
`test_format_reachability_covers_every_target` both still pass green — they are not
exercising the new format at all, not confirming it is reachable. Verified by hand:
`re.findall(r"format:\s*'(\w+)'", "format: 'pool-amiga';")` returns `[]`, while
`re.findall(r"format:\s*'([\w-]+)'", ...)` (the fix — reuse `catalog_kinds()`'s
already-hyphen-tolerant character class) returns `['pool-amiga']`. Not fixed here:
`tools/engine_export_consumers.py` and its test are not in R3's owned-file list and
sit outside "Phase B's files" too — this is a third bucket, a shared tooling file nobody
in this round owns. Whoever lands the Phase B `pool-amiga` manifest + e2e case (§8 below)
should fix the regex in the same commit, or the new reachability row will silently read
"nothing to report" instead of "producer: pool-amiga.json / e2e case: pool-amiga-view."

## 8. Manifest (staged, not applied — `apps/web/games/*.json` is Phase B's file)

`apps/web/games/pool-amiga.json`, mirroring `pool-of-radiance.json`'s file list against
the Amiga names (all paths under the WHDLoad `PoolOfRadiance/data/` directory named at
the top of this document). `decode: false` marks the 7 non-graphics families (332 data
blocks total); every other file decodes to >= 1 image via the new `pool-amiga`
`decodeAsset` branch. Per-file block/image counts measured 2026-09-03:

```json
{
  "id": "pool-amiga",
  "title": "Pool of Radiance",
  "platform": "Amiga",
  "container": "Pool-Amiga (big-endian, backwards bit-stream LZSS + XOR checksum, BE 10-byte TOC)",
  "endianness": "big",
  "display": { "width": 320, "height": 200, "pixelAspect": 1, "defaultZoom": 2 },
  "files": [
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/pic.dax", "category": "scenes", "label": "PIC (animated story scenes)", "note": "Measured 2026-09-03: 59 image(s) via decodeAsset (tag pool-amiga, kind animated)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/final.dax", "category": "scenes", "label": "FINAL (ending scenes)", "note": "Measured 2026-09-03: 3 image(s) via decodeAsset (tag pool-amiga, kind animated). No DOS-manifest counterpart." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/cpic.dax", "category": "portraits", "label": "CPIC (combat portraits)", "note": "Measured 2026-09-03: 118 image(s) via decodeAsset (tag pool-amiga, kind standard); sibling (w,h) agreement 116/116 with DOS CPIC1..8.DAX." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/chead.dax", "category": "portraits", "label": "CHEAD (character heads)", "note": "Measured 2026-09-03: 28 image(s) via decodeAsset; sibling (w,h) agreement 28/28 with DOS CHEAD.DAX." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/head.dax", "category": "portraits", "label": "HEAD (paperdoll heads)", "note": "Measured 2026-09-03: 39 image(s) via decodeAsset. No DOS-manifest counterpart file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/body.dax", "category": "portraits", "label": "BODY (paperdoll bodies)", "note": "Measured 2026-09-03: 21 image(s) via decodeAsset. No DOS-manifest counterpart file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/cbody.dax", "category": "ui", "label": "CBODY (paperdoll/body art)", "note": "Measured 2026-09-03: 128 image(s) via decodeAsset; sibling (w,h) agreement 128/128 with DOS CBODY.DAX (vacuous: single 24x24 shape both platforms)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/bacpac.dax", "category": "ui", "label": "BACPAC (UI/backpack art)", "note": "Measured 2026-09-03: 1 image via decodeAsset." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/icon.dax", "category": "ui", "label": "ICON (chargen combat-icon set)", "note": "Measured 2026-09-03: 6 image(s) via decodeAsset. No DOS-manifest counterpart file." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/8x8d.dax", "category": "tiles", "label": "8X8D (dungeon wall/tile art)", "note": "Measured 2026-09-03: 23 image(s) via decodeAsset. Sibling comparison N/A: DOS 8X8D1..8.DAX are complex-framed (parse_standard_frame declines them)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/dungcom.dax", "category": "tiles", "label": "DUNGCOM (dungeon combat terrain)", "note": "Measured 2026-09-03: 1 image via decodeAsset." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/wildcom.dax", "category": "tiles", "label": "WILDCOM (wilderness combat terrain)", "note": "Measured 2026-09-03: 1 image via decodeAsset." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/randcom.dax", "category": "tiles", "label": "RANDCOM (random combat terrain)", "note": "Measured 2026-09-03: 1 image via decodeAsset." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/sqrpaci.dax", "category": "tiles", "label": "SQRPACI (wilderness square art, 2 banks)", "note": "Measured 2026-09-03: 2 image(s) (64 frames each) via decodeAsset — see §3d." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/sprit.dax", "category": "sprites", "label": "SPRIT (creature sprites)", "note": "Measured 2026-09-03: 55 image(s) via decodeAsset (kind animated)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/comspr.dax", "category": "sprites", "label": "COMSPR (combat sprites)", "note": "Measured 2026-09-03: 25 image(s) via decodeAsset; sibling (w,h) agreement 23/23 with DOS COMSPR.DAX (vacuous: single 24x24 shape both platforms)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/geo.dax", "category": "data", "label": "GEO (map data)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images with decodeAsset (tag pool-amiga, 29 data blocks)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/ecl.dax", "category": "data", "label": "ECL (event scripts)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images (29 data blocks); 28/29 byte-identical to DOS ECL1.DAX per §2." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/walldef.dax", "category": "data", "label": "WALLDEF (wall definitions)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images (17 data blocks)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/moncha.dax", "category": "data", "label": "MONCHA (monster tables)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images (116 data blocks)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/monitm.dax", "category": "data", "label": "MONITM (monster items)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images (65 data blocks)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/monspc.dax", "category": "data", "label": "MONSPC (monster specials)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images (34 data blocks)." },
    { "path": "D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolOfRadiance/data/item.dax", "category": "data", "label": "ITEM (item table)", "decode": false, "note": "Measured 2026-09-03: decodes to 0 images (42 data blocks); this file was a sniffDax false positive before R3 wired pool-amiga into decodeAsset." }
  ]
}
```

Note: this Amiga corpus has no `title.dax` (the DOS manifest's `TITLE.DAX` has no
counterpart file here) — the JSON above intentionally has no `category: "title"` entry;
do not invent one when staging.

## 9. Using the decoder

```
python tools/pool_amiga_decode.py <file.dax> [--list] [--raw] [--out DIR]
                                  [--scale N] [--pal pic|combat|combat2|alt|dark]
                                  [--paperdoll all|H:B[,H:B...]]
```

Renders every frame of every block to PNG (default
`renders/pool_amiga/<stem>/`); `--raw` dumps non-graphics blocks as `.bin`;
`--list` inspects without writing. Palette auto-selects `pic` for
`pic/final/bacpac/head/body` (per the §4 dispatch), `combat` otherwise.
`--paperdoll` composes 88×88 chargen paper dolls (head 1..14 × body 1..12,
§4a) from `head.dax`+`body.dax` in the given file's directory.
## Reaching the product: three dispatch sites, not one (2026-09-03)

A correct decoder wired into `decodeAsset` is **not** the same as a format the product
shows. A `DecodedAsset` is flattened into a renderable frame list in **three** independent
places, and when this format landed only one of them learned about it:

| site | what it is | before | after |
|---|---|---|---|
| `apps/web/src/ui/nwnPreview.ts` | manifest/module preview | 1672 frames (branch added with the loader) | 1672 |
| `packages/engine/src/game/loadGame.ts` | the `?game=pool-amiga` dashboard | **744** | 1672 |
| `apps/web/src/ui/main.ts` | single-file asset browser | under-counted, and labelled `format: 'DAX'` | correct, labelled `Pool-Amiga` |

The two un-taught sites fell through to their DAX catch-alls. Those catch-alls decide
multi-frame-ness from a **DAX kind allowlist** (`loadGame.ts`'s `MULTI_FRAME_KINDS` =
`animated`, `vga-compressed-picture`, `vga-chunky-items`; `main.ts`'s inline test =
`animated`, `gateway-pic-multiframe`). This container emits multi-frame blocks under
`kind: 'standard'` as well — a kind `decodeDax` never produces — so every `standard` block
collapsed to its first frame. **928 of 1672 frames were hidden** in the dashboard:

| family | shown | actual |
|---|---|---|
| `8x8d` | 23 | 774 |
| `sqrpaci` | 2 | 128 |
| `bacpac` | 1 | 21 |
| `wildcom` | 1 | 17 |
| `dungcom` | 1 | 13 |
| `randcom` | 1 | 4 |

Nothing was red. `poolAmiga.test.ts` passed at 843/843 and 1672/1672 throughout, because a
decoder test proves correctness, not reachability.

**The fix is per-format branches, not a widened allowlist.** `MULTI_FRAME_KINDS`'s own doc
comment records that it encodes a DAX *routing decision* between two valid readings of the
same bytes — it pins `8X8D1` at 6 images for 6 blocks precisely so the sheet reading cannot
be swapped for the tile one. Admitting `'standard'` there would be a no-op for DAX today and
a silent behaviour change the first time DAX emitted one.

`tools/test_decoded_asset_dispatch_sites.py` now enforces the general rule: every member of
the `DecodedAsset` union must be handled at every dispatch site, where a catch-all credits
exactly **one** declared format (`loadGame`/`main` -> `dax`, `nwnPreview`'s terminal `else`
-> `ilbm`) and that declaration is checked against the source. A seventh format will fail it
in three places at once; the failure list is the wiring checklist.

**What that test does and does not prove, stated plainly.** It is a source-structure check: it
proves each site *has* a branch for each format, not that the branch is *correct*. The two
engine-side sites are also covered behaviourally --
`packages/engine/test/phaseBAmigaManifestsRound32.test.ts` pins `loadGame`'s 1672 per file, and
`poolAmiga.test.ts` pins the decoder at 843/843 and 1672/1672. **`main.ts`'s branch has no
behavioural test.** `extractFrames` is module-private in the app entry point, and no e2e case
reaches it with a Pool-Amiga file because `catalog.ts` has no row for one -- a catalog row would
hard-depend on the never-vendored `D:\Games` WHDLoad source, which is exactly what the
skip-when-absent manifest path exists to avoid. So the `main.ts` frame counts and the
`Pool-Amiga` label were read from the code, not observed running. That is a real gap and it is
recorded here rather than implied to be covered.
