# HLIB / DataLib container — The Dark Queen of Krynn (DOS VGA) `.TLB` / `.GLB`

Verified spec for the DQK graphics container. Cross-checked against the community
DataLib/FRUA docs in `hackdocs_extracted/` (`TLBFORM.TXT`, `DRAW18.TXT`,
`DRAW23.TXT`, `UAPALETT.TXT`, `FRM_DESC.TXT`) **and** against the real game bytes,
with renders confirmed as legible VGA art (title screens, overland maps, encounter
pics, sprites). Decoder: `tools/hlib_decode.py`.

DQK is **VGA 256-color, 8 bits-per-pixel** (1 byte = 1 palette index). This is a
different lineage from the DAX (DOS EGA) and DAA (Amiga planar) formats — see the
contrast table at the bottom.

---


## 1. Container header (little-endian) — VERIFIED

```
off 0   ASCII  "HLIB"
off 4   DWORD  file size (the trailing EOF pointer equals this)
off 8   WORD   pointer count - 1   (the stored value; the real count INCLUDES the
               trailing EOF pointer, so total DWORDs in the list = stored+1)
off 10  BYTE   unused (0)
off 11  BYTE   magic: 0 = no image-id table, 1 = image-id/set-id table present
off 12  ASCII  tag:  "TILE" => leaf tile library
                     "HLIB" => MASTER library (collection of leaf TILE sub-files)
off 16  DWORD[count]  pointer list; the LAST entry == file size (EOF sentinel)
```

The byte at offset 8 being `count-1` is the one true gotcha: e.g. ALWAYS.TLB stores
`30` → 31 DWORDs, of which `ptr[30]` == file size. Verified that `ptr[-1] == fsize`
for every file tested.

### 1a. LEAF library (tag `"TILE"`)
Pointers locate, in order:
- `magic == 1`: `ptr[0]` → image-id table, `ptr[1]` → colour table, `ptr[2..]` → images.
- `magic == 0`: `ptr[0]` → colour table, `ptr[1..]` → images.

**Corrected 2026-08-24.** This used to read "`ptr[0]` → colour table **or** the first image, for
`cpic` combat icons / `TOPVIEW` which store no palette — detect by `ncolors == 0`". Both halves
were wrong, and they were wrong in a way that cost real decoded output (see §2b):
- `cpic` never took this branch at all. `CPIC.TLB`, `COMSPR.TLB` and `CBODY.TLB` are **`magic == 1`**,
  so their colour table is at `ptr[1]` like every other `magic == 1` leaf.
- Detecting "is this a colour table" by `ncolors == 0` conflates *absent* with *empty*. Measured
  over every DOS HLIB container held (DQK + FRUA, 52 files, **435 TILE leaves**): the palette slot
  holds a well-formed colour table in **435 of 435**, and **no leaf anywhere puts an image there**.
  The right test is the cmagic byte at `+7` (§2, and `isColourTable` in `loaders/hlib.ts`).

Each image spans `[ptr[i], ptr[i+1])`; the final image ends at the EOF pointer.

### 1b. MASTER library (tag `"HLIB"` at offset 12)
The file is a pack of complete leaf TILE files ("sets").
- `magic` is always 1.
- `ptr[0]` → set-id table, `ptr[1..]` → sets, last pointer = EOF.
- Each **set** begins with its own full `HLIB`/`TILE` leaf header, and **its pointers
  are relative to the start of that set** (so a set is self-contained / extractable).
- Masters: TITLE, BIGPIC, CPIC(no—CPIC is a leaf), BACK, SPRIT, 8X8DB/8X8DC, PICA/B/C,
  DUNGCOM, WILDCOM, FRAME?(leaf). (CPIC, FRAME, GEN, COMSPR, ALWAYS, TOPVIEW are leaves.)

### 1c. Image-id / set-id table (only when `magic == 1`)
```
WORD  number of entries (== number of images / sets)
then per entry:  WORD image/set ID#,  WORD pointer-# (1-based into the pointer list)
```
Used by the engine to address images by logical ID. Not needed for rendering; the
decoder ignores it and walks pointers positionally.

**This is a container property, not an image one — measured 2026-08-24.** The same table sits at
member 0 of `DATA` libraries too. Across both DOS HLIB installs, every `DATA`/`DIG4` library was
tested for a `span == 2 + 4n` table at `ptr[0]`:

| | libraries |
| --- | ---: |
| `magic == 1` carrying the table | **7 / 7** (DQK `MONCHA`, `ECL`, `GEO`; FRUA `MONST`, `GAME`, `GEO`, `STRG`) |
| `magic == 0` carrying the table | **0 / 3** (DQK + FRUA `SOUNDS.GLB`, FRUA `SCRIPT.GLB`) |

The `magic` flag is the whole rule, and the `magic == 0` group is the null that makes the 7/7 mean
something. In all seven the `pointer-#` fields land in `1..memberCount` and between them cover every
member except member 0 itself, which is the table.

**Two traps, both of which produced a wrong answer here before being caught:**
- **The entry count is not the member count.** FRUA `GEO.GLB` maps **43 area ids onto 3 map
  members**, many-to-one — it is the editor, so 43 blank area slots share template maps. Testing
  `n == memberCount` rejects a perfectly well-formed table; the test is `span == 2 + 4n`.
- **An ID is not an index.** All three DQK tables are *sparse*: `MONCHA` covers ids 1..119 with 98
  records, `ECL` 1..67 with 47, `GEO` 2..66 with 20. Anything resolving a logical id must go through
  the table. FRUA's are dense, so FRUA alone would never reveal this — one more case of a sibling
  making a bug invisible. (`loaders/moncha.ts` already resolves through the table.)

---

## 2. Colour table (palette) — VERIFIED, **8-bit RGB in the file**

8-byte header followed by RGB triplets. The field names below are the engine's, taken from
DQK's colour-table realizer at `DQK.EXE:0x01a296` (`0x1796:0x0536`), not from the corpus:

```
WORD  flags      bit0 = the record declares its own first_col/ncolors
                 bit1 = nranges range records follow the RGB block
                 bit2 = an EGA-16 approximation block follows (§2c)
WORD  first_col  (palette index of the first stored colour)
WORD  ncolors    (0..256; 0 => install nothing, inherit — see §2b)
BYTE  nranges    (ignored, and forced to 0, unless flags bit1 is set)
BYTE  type       low nibble 8 == "colour table"; the full byte is 24 in every DOS record
then ncolors * 3 bytes:  R, G, B  — each a FULL 8-bit value 0..255
then nranges * 4 bytes {key0, key1, first_col, count}    (only when flags bit1)
then ceil(ncolors/2) bytes, one EGA-16 nibble per colour (only when flags bit2)
then 0 or 1 pad bytes, to an even record length
```

That layout accounts for the length of **438 of 438** colour tables in the DOS corpus
(DQK + FRUA, 434 TILE leaves, 4144 members), against nulls of 264 with the bit-2 term forced
off and 175 with it forced on. Test: `packages/engine/test/hlib.test.ts`, "the record length
is fully explained by the three flag bits".

**The leading word is a flags word, not a cycling speed.** It only ever takes the values
0, 1, 3, 5, 7 — no colour table in the corpus sets any bit above 2, which a speed would.
The two gates that matter:
- **bit 0 clear** ⇒ the engine *ignores* `first_col`/`ncolors` and installs `0 .. 255`
  (or `0 .. 15` when its own mode query at `0x12b7:0x14bc` / `0x12b7:0x14b4` reports a
  16-colour display — DQK does have a 16-colour path). Exactly **1** of the 438 records
  leaves it clear, FRUA `DISK1/TITLE.TLB` member 0, and that record declares `first_col=0,
  ncolors=256`, i.e. precisely what the engine would have substituted. So a decoder that
  always honours the stored fields is right on everything we hold.
- **bit 1 clear** ⇒ `mov byte [bp-0x346],0`: the engine zeroes `nranges` before reading
  anything, so a nonzero byte there would be ignored. Two-sided in the corpus with zero
  exceptions: bit 1 set ⇒ the byte is nonzero in **51 of 51**, clear ⇒ it is zero in
  **387 of 387**.

This corrects a real defect in our own loader. It produced a colour-cycle range whenever the
word was `>= 3`, which fabricated one for the **151** records with flags `5` — bit 1 clear,
bit 2 set — where the engine reads no ranges at all. Nothing animates `Palette.cycles` yet, so
no shipped render was wrong; the field was simply lying.

**The 4-byte range records are palette-slot registrations.** Bytes +2/+3 are `first_col` and
`count`, proven by the installer at `DQK.EXE:0x018661`, which does interval arithmetic on them
(`rec[+6] < first+ncolors && rec[+6]+rec[+7] > first` selects which registrations to evict).
Bytes +0/+1 are only ever compared for equality — a cache key that lets the engine skip a
reload when the same source re-registers the same range. `hackdocs` calls those two `dir` and
`speed`; nothing here has ever verified that, and no code in DQK's palette path animates them.

**The record type is the LOW NIBBLE of byte +7.** The realizer does
`mov al,[bp-0x345] / and ax,0x0f / cmp ax,8` and errors out through `0x1102:0x03cf` otherwise —
the same shape as the composite dispatch's `& 0x0f == 9` (§5a). The high nibble is a modifier
this path ignores. The previous rule, membership in `{8, 24}` from `hackdocs` UAPALETT, picks
out **exactly the same 438 records with 0 misses and 0 false positives**, because the full byte
is `0x18` every single time and the drawing methods are 16, 17, 18, 21, 23 and 25. The corpus
therefore could never have found the nibble rule; only the binary could.

**Palette values are already 8-bit (0..255); do NOT scale by `<<2`.** Verified:
ALWAYS.TLB palette begins `00 00 00 / 00 00 AB / 00 AB 00 / 00 AB AB …` (0xAB = 171),
the classic full-range EGA-derived VGA colours; max byte observed = 255. (The prompt's
"6-bit DAC, scale ×4" assumption is **false** for HLIB — corrected here.)

**But the engine does scale, downward.** The installer stores `byte >> 2` into its shadow
palette (`shr al,1 / shr al,1`, three times per triple, at `DQK.EXE:0x0187b8..0x0187e2`), and
that shadow is what reaches the DAC — so DOS displays the file's 8-bit value with its low two
bits dropped. Rendering the raw byte, as this codebase does, is at most 3/255 per channel
brighter than the original. This replaces the earlier flat claim of "no DAC scaling", which
was right about the file and wrong about the engine.

The first stored colour maps to index `first_col` (e.g. BACK leaves store `first_col=144,
ncolors=32` → only palette slots 144..175 are defined; the rest default black). This
matches `UAPALETT.TXT`: ALWAYS=0-15, FRAME/GEN=16-31, walls=32-68, combat sprites=64-95,
backdrops=144-175, sprites≈176-255, smallpics/bigpics/overland=32-255. Because each
sub-image only defines its own slice, a fully-correct in-game render layers several
palettes; standalone a backdrop looks dim/near-grayscale (its 144-175 ramp), which is
**correct data**, not a decode error.

Native GBWS wall bundles preserve each image's `first_col/ncolors` window in the
`GBWI` header. `CCFP /Q` and `/F` build the active wall-view DAC by merging
those declared windows across the rendered bundle, matching this partial-palette
model instead of blindly using the first image's 768-byte palette dump. `CCFP`
also rejects GBWI records whose declared pixel count does not exactly match
`width * height`, so malformed bundles cannot draw stale DOS scratch bytes past
the decoded image payload.

### 2a. A leaf can carry MORE than one colour table — VERIFIED (2026-08-22)

§1a says a leaf's colour table is the one at `ptr[0]` (or `ptr[1]` when `magic == 1`). That is
where the *images'* palette lives, but it is not the only table a leaf can hold. DQK's
`DISK3/FRAME.TLB` carries **five**: the leading one, plus four more at pointer indices
**41, 42, 43 and 44**. All five have `cycle=5, first_col=16, ncolors=16, nranges=0, cmagic=0x18`,
a 64-byte region (8 header + 48 triplets + an 8-byte writer footer that is byte-identical in all
five), and they patch palette slots 16..31 — the `FRAME/GEN` window `UAPALETT.TXT` assigns.

They are five genuinely different palettes: a light grey (leading), a darker grey (41), a
mauve/red (42), a near-twin of the leading grey differing in exactly one slot (43), and a warm
brown/tan (44) — alternate frame-border tints, presumably per scene.

**How to tell a table from an image without guessing.** Byte +7 is `cmagic` for a table and the
drawing method for an image, and the two vocabularies do not overlap. Over every non-leading leaf
region in DQK **and** FRUA, byte +7 takes exactly these values:

| byte +7 | meaning | count |
|---|---|---|
| 16, 17, 18, 21, 23 | drawing methods (§5) | 3710 |
| 25 | drawing method, composite / image-id list — SOLVED (§5a, was "unsolved (§8)" here) | 16 |
| **24 (`0x18`)** | **cmagic — a colour table** | **4** |
| 8 | the other documented cmagic | 0 mid-leaf |

So the split is a decision, not a heuristic. This matches the Amiga `GLIB` side, where
`glib-format.md` §4 independently found `FRAME.TLB` members `m000/m041–m044` to be the
member-for-member twins of these same five DOS tables at the same indices.

**What was wrong before.** `hlib.ts` read only the leading table and handed everything after it to
the image decoder, which reads byte +7 as a drawing method, does not recognise 24 and returns
null — so four alternate palettes were dropped with no diagnostic. `decodeHlib` now exposes them
as `HlibArchive.extraPalettes`. Image slot indices are unchanged, since those regions never
produced an image. `tools/hlib_decode.py` still skips them the old way; it renders PNGs and has no
consumer for a palette it does not apply, so the two decoders remain render-identical.

---

### 2b. "No palette" is two different records — CORRECTED 2026-08-24

The old text here read: "`cpic`/combat-icon leaves and `TOPVIEW` carry **no** palette
(`ncolors==0`): in-engine they reuse the currently-loaded DUNGCOM/WILDCOM palette." The
*conclusion* (they reuse the loaded DUNGCOM/WILDCOM palette) is right. The *mechanism* was wrong,
and it is wrong differently for each of the two families:

| Leaf | magic | table at | `first_col` | `ncolors` | What it actually does |
| --- | --- | --- | --- | --- | --- |
| `CPIC.TLB` | 1 | `ptr[1]` | 144 | **112** | patches indices 144..255 into the loaded palette |
| `COMSPR.TLB` | 1 | `ptr[1]` | 64 | **32** | patches indices 64..95 |
| `CBODY.TLB` | 1 | `ptr[1]` | 96 | **48** | patches indices 96..143 |
| `TOPVIEW.TLB` | 0 | `ptr[0]` | 0 | **0** | patches nothing — inherit wholesale |

So the combat leaves carry a **partial** palette, not no palette: they slice a range into the
caller's, which is exactly what `first_col`/`ncolors` are for (§2). Only `TOPVIEW` is genuinely
empty, and only **2** of the 435 leaves in the corpus are — the DQK copy and the FRUA copy of that
one file.

An `ncolors == 0` table is a **real, well-formed record meaning "inherit"**, not a parse failure.
`readPalette` returns `null` for it, which is correct for a function whose job is to produce a
palette, but routing on that return value made the reader treat TOPVIEW's leading 8 bytes
(`01 00 00 00 00 00 00 18`) as an undecodable member region for months — it was reported as such in
the asset viewer and pinned by a test whose own comment identified the byte correctly. Reading a
byte correctly and routing on it are two different things. `isColourTable()` now decides on the
low nibble of byte `+7` — the engine's own test, see §2; `packages/engine/test/hlib.test.ts` pins the corrected behaviour, with a
mutation null (break the cmagic and the region is reported undecoded again) and a corpus sweep
asserting no shipped image container loses a member.

> Two leaf counts appear in this document and they are both right. **435** is the engine's own
> walk over all **52** DOS containers, counting DQK's and FRUA's copies of a file separately. **434**
> is the same walk with files deduplicated by (name, size), which is how the §2/§2c tests enumerate.
>
> Exactly two (name, size) pairs collide, and only one of them costs a leaf. `SOUNDS.GLB` (24904 B)
> really is byte-identical in both installs, but it is a `DIG4` sound library and contributes no
> TILE leaves at all. `TOPVIEW.TLB` (1552 B) is the one that matters — and, contrary to what this
> note said until 2026-08-25, DQK's and FRUA's copies are **not** byte-identical; they merely share
> a name and a length, which is all the dedupe key looks at, so the deduped walk silently drops a
> genuinely different container. That is why §2b counts 2 empty tables and the §2 tests count 1,
> and it is worth checking before quoting a deduped number as corpus coverage.

---

### 2c. The bit-2 trailing block is an EGA-16 index per colour — NEW 2026-08-24

When flags bit 2 is set, `ceil(ncolors/2)` bytes follow the RGB block (and the range records, if
any): **one 4-bit value per colour, high nibble first**. 174 of the 438 DOS colour tables carry
one. It is what makes the record-length model in §2 close at 438 of 438.

The content is a 16-colour approximation of the palette. Scoring each stored nibble against the
nearest EGA-16 colour to that entry's RGB: **17737 of 24338 entries agree, 72.9%**, against a
histogram-preserving null (the same nibbles shuffled within each record) of **18.6%** — 259
standard deviations out. Using the textbook EGA palette instead of the game's own 16 UI colours
gives 72.0%, so the result is not an artifact of the reference.

The nibble *order* is fixed by `ALWAYS.TLB`, whose block reads `0,1,2,…,15` — the identity map,
which is exactly right for the leaf that owns slots 0..15 and whose colours already *are* the
EGA 16. Note that the agreement statistic alone would not have settled the order: reading every
byte low-nibble-first still scores 65.5%, because adjacent palette entries usually fall in the
same EGA bucket. Two files disagree with nearest-match badly — `DUNGCOM.TLB` (11.3%) and
`WILDCOM.TLB` (13.3%), the combat terrain banks — because 53% and 88% of their nibbles are 0;
they are still 15 sd above their own nulls, so the field is populated there, just mostly unset.

**No consumer exists in DQK.EXE — settled 2026-08-24 (same day, second pass).** The search space
turns out to be enumerable. Exactly **three** sites in the whole 449,664-byte file perform the
type dispatch `and ax,0x0f` / `cmp ax,8` — `0x019d0b`, `0x01a09b`, `0x01a2cb` — and there is no
`and al,0x0f` + `cmp 8` variant anywhere. Those three sites belong to exactly the **three** callers
of the colour-table member loader `0x169b:0x0075` (`0x019d82`, `0x01a06b`, `0x01a2ae`), which has
no other callers. So every colour-table record DQK ever looks at passes through one of three
routines, and all three have now been read end to end:

| routine | what it reads | last byte touched |
|---------|---------------|-------------------|
| realizer `0x01a296` (§2, §2d) | `ncolors*3` RGB, then `nranges*4` ranges, then installs | `8 + ncolors*3 + nranges*4` |
| flat reader ending `0x019d6b` | a fixed `0x300` bytes of RGB, handed to `0x151e:0x56e`/`0x49d` | `8 + 768` |
| slot remapper `0x01a054` (§2e) | header, skips the RGB, rewrites each range | `8 + ncolors*3 + nranges*4` |

**None of the three so much as tests flags bit 2.** The realizer's stack frame says the same thing
independently: `sub sp, 0x34c` = 8 header + 768 RGB + 68 ranges, with no room for the block even
if it wanted it.

**And it is a DQK-only field, which rules out the obvious explanation.** The hypothesis this
document recommended testing first was authoring-tool residue. It fails: FRUA *is* the authoring
tool, it is the other half of this corpus, and **0 of its 264** colour tables carry the block,
while **174 of DQK's 175** do — the single exception being `TOPVIEW.TLB`'s `ncolors == 0` inherit
record, which has no colours to describe. Per DQK file the split is total, 19 libraries at
n-of-n. So the block is not a quirk of some assets, not a shared packer's leftovers, and not
optional: it is a property of DQK's data build, emitted for every non-empty colour table it ships,
and read by nothing in the executable that ships beside it.

What that leaves is a build-side answer rather than a runtime one. DQK's 16-colour display path is
real and widespread — the mode queries have **27** and **52** call sites, the realizer substitutes
a 16-slot window when a record declines to declare one (`mov si, 0x10` at `0x01a317`), and §2e's
remapper is dispatched across four display modes — so a 16-colour build of DQK is exactly what
would consume this. The palette module's own 16-colour branch (`0x161b:0x0961`, file `0x018ee7`)
is *not* it: given an EGA index 0..15 it returns a VGA pixel from a 16-entry table at `DS:0x9d86`,
or a dither pattern from `DS:0x9b06`, i.e. it runs the opposite direction and serves UI and text.

Nothing in our engine decodes the block, deliberately — an exported decoder with no caller is how
four earlier formats ended up "solved but unwired", and this one now has a proven absence of
callers rather than merely an unfound one.

---

### 2d. Multi-palette layering — SOLVED 2026-08-24, and it is plain overwrite order

§8 listed "which leaf's palette wins per screen" as known qualitatively from `UAPALETT.TXT` but
not reproduced. It is now read out of DQK's own installer, `DQK.EXE:0x018661` (`0x161b:0x00b1`),
called by the realizer at `0x01a39f` with `(first_col, ncolors, rgbPtr, nranges, rangesPtr)`.

There is **one** palette. The installer writes into a single global 768-byte shadow table at
`DS:0xd145`, three bytes per slot, and touches only `[first_col, first_col + ncolors)`. It never
clears anything else, there is no per-leaf DAC, no priority field and no z-order. **Layering is
overwrite order**: a later install over the same slot wins, and a slot no install covers keeps
whatever the previous screen left there. `mergePalettes` in `packages/engine/src/render/palette.ts`
already implements exactly this, so the model was right — it is now verified rather than inferred.

---

### 2e. Colour tables are rewritten in place when the palette window moves — NEW 2026-08-24

Found while enumerating the consumers for §2c: the third of DQK's three colour-table routines,
`DQK.EXE:0x01a054` (`0x1796:0x02f4`, one caller at `0xc6b8`), does not install a palette at all.
It **edits the record in memory**.

1. It loads the member (`0x169b:0x0075`) and builds a **256-byte index-to-index map** in a local
   buffer via `0x019f4f`, which is a four-arm jump table (`cs:0x216`) selected by the same two
   display-mode queries used everywhere else, `0x12b7:0x14bc` then `0x12b7:0x14b4`. The map's
   source is a far pointer the caller supplies; the 256-colour arm copies it wholesale, the other
   three build it.
2. If the record is type 8 and the mode combination permits, it translates the header's
   `first_col` through that map, rewinds the body pointer by 8, and **writes the modified 8-byte
   header back over the record**.
3. It skips the RGB block — `ncolors*3` when flags bit 0 is set, a flat 768 when it is not, which
   is a second independent confirmation of what bit 0 means.
4. If flags bit 1 is set, it walks the `nranges` range records, translating **byte +2 of each**
   through the same map and writing each 4-byte record back.

Byte +2 of a range record is the field §2 identifies as its `first_col` from the installer's
interval arithmetic. Both places the format stores a palette slot number are translated, and
nothing else is. That is a strong independent confirmation of the §2 field assignment: a routine
that had a different idea of which bytes were slot numbers would remap different bytes.

Two consequences worth carrying into the port. A colour table's `first_col` is **not** fixed by
the file — the engine relocates the whole window at load time, per display mode — so a writer must
not assume the window it emits is the window the engine installs. And a range record's `start` is
relocated in lockstep with the header, which is only coherent if ranges are slot registrations
(§2) rather than the free-standing cycling ranges `hackdocs` describes.

The four mode arms have not been individually unpicked; only arm 0 (256-colour, a straight copy of
the caller's table) is read. That is enough for the §2c conclusion, which needs only the routine's
*extent*, and no more is claimed.

The surrounding DGROUP block is contiguous and fully accounted for:

| DGROUP | size | what |
| --- | --- | --- |
| `0xcdc4` | 1 | "the DAC has been written at least once" flag |
| `0xcdc5` | 768 | the palette as last uploaded to the DAC |
| `0xd0c5` | 32 | dirty bitmap, one bit per colour index |
| `0xd0e5` | 96 | published copy of the registration table |
| `0xd145` | 768 | **the shadow palette**, 6-bit values (`byte >> 2`) |
| `0xd445` | 96 | live registration table, 12 records x 8 bytes |
| `0xd4a5` | 12 | per-record "needs publishing" flag |

A registration record is `{ LONG key, BYTE key0, BYTE key1, BYTE first_col, BYTE count }`, with
`0x7fffffff` in the key meaning "free". Installing a palette first **evicts** every registered
record whose range overlaps the incoming one (marking those colours dirty), then registers the
incoming ranges; if all 12 slots are full it prints the message at `DS:0x9aec` and gives up. The
records' last four bytes are the §2 range records copied verbatim, which is what proves those
bytes are a slot range.

The flush at `0x161b:0x0455` walks the dirty bitmap, copies changed slots from the shadow into
the uploaded image at `0xcdc5`, and calls `0x00d7:0x20f6` (file `0x5266`) once with the min..max
dirty span. That routine optionally waits on `0x3DA` bit 3 for vertical retrace, then
`out 0x3C8, first` followed by `count*3` writes to `0x3C9` — an ordinary VGA DAC block load, and
the confirmation that the shadow's `>> 2` values are 6-bit DAC values.

None of this can change *which* colour ends up in a slot; the 12-entry table and the dirty bitmap
exist so the engine can skip re-uploading a range that has not changed. A renderer that merges
slices last-wins reproduces the result exactly.

## 3. Image header (8 bytes) — VERIFIED

```
WORD  height
WORD  vertical offset    (signed placement hint; positive moves the image up)
WORD  horizontal offset  (signed placement hint; positive moves the image left)
BYTE  width / 4          (actual width in pixels = this * 4; width always %4==0)
BYTE  drawing method
```

Standalone raster decoders keep these offsets as metadata; the native GBWS
first-person compositor applies them when placing DQK/FRUA wall chunks.

---

## 4. Pixel layout: Chain-4 interleave — VERIFIED

Pixels are stored **Chain-4 / interlaced 1/4-row at a time**. Within a row the column
visit order is 4 sweeps:
```
sweep 0: columns 0, 4, 8, ...      sweep 2: columns 2, 6, 10, ...
sweep 1: columns 1, 5, 9, ...      sweep 3: columns 3, 7, 11, ...
```
Each sweep covers `q = width/4` columns. The decoder builds this column order and
fills it; getting this wrong produces vertical-stripe garbage.

## 5. Drawing methods — VERIFIED (16, 17, 18, 21, 23)

| # | Description | Encoding |
|---|-------------|----------|
| 16 | uncompressed, opaque | `width*height` bytes, Chain-4 order. Opacity **verified in DQK.EXE** (§5d): both of its row blitters are keyless `rep movs`. |
| 17 | uncompressed, transparent (AND mask + XOR pixels) | two `width*height` blocks; **first is the AND mask (0x00/0xFF only), second is the XOR pixels** — both are needed, see §5c/§5d |
| 18 | **compressed, opaque** (the workhorse: BIGPIC, PICA backdrops, title backdrops) | per **row**; control `c<128` → copy `c+1` literals; `c>=128` → repeat next byte `257-c` times. Runs span the row's 4 sweeps continuously (one stream per row of `width` pixels). |
| 21 | uncompressed, transparent | byte-for-byte the same payload as 16; index 255 = transparent. **Verified in DQK.EXE** (§5d): the arm pushes an immediate `0xFF` and calls a colour-keyed row blitter. |
| 23 | **compressed, transparent** (sprites, title text/logo overlays) | 4 image sweeps; per row: `c==0` ends the row; `c>=128` → skip `256-c` transparent pixels; `c<128` → copy `c` literal pixels. |
| 25 | composite: place other members on one canvas | **solved** — 6-byte records, see §5a |

### Verified compression-count details (these differ subtly from the docs)
- **Method 18 repeat count is `257 - c`** (matches `DRAW18.TXT`), and runs are a single
  continuous stream over the full Chain-4 row order of `width` pixels. Verified by
  rendering BIGPIC as coherent overland maps and the title backdrops as smooth gradients
  / detailed stone.
- **Method 23 skip count is `256 - c`, NOT the `257 - c` printed in `DRAW23.TXT`.**
  Empirically `257-c` overshoots the row width (columns ran to 80 on a 62-wide image);
  `256-c` caps exactly at `q` and makes the title copyright text and "MicroMagic"/SSI
  logos render perfectly legibly. Method 23 is organised as 4 *image* sweeps (outer:
  sweep, inner: rows), each row terminated by a `0` control byte; literal copies of
  `c` bytes, transparent skips of `256-c`.
- **Method 23 write-side (encoder) — the original packer's choices, proven byte-exact
  against all 93 method-23 streams in DISK2 `SPRIT.TLB`** (encoder:
  `packages/engine/src/loaders/hlibEncode.ts` `encodeMethod23`; proof:
  `hlibEncode.test.ts`'s SPRIT.TLB golden — 96/96 chunk bodies byte-identical,
  93× method 23 + 3× method 21):
  - Transparent (255) pixels are **always encoded as skip controls**, never as literal
    255 bytes (no SPRIT.TLB stream contains a literal 255).
  - A transparent run reaching the **row end is dropped entirely** — the `0` row
    terminator implies it (no stream carries a trailing skip before its terminator).
  - Every row emits its `0` terminator, including fully-transparent rows (`height × 4`
    terminators total).
  - Observed run lengths stay small (max literal 20, max skip 20 in SPRIT), well under
    the control-byte caps (literal ≤127, skip ≤128 per control).
  - **Chunks are word-aligned**: when `8 + stream length` is odd, exactly one `0x00`
    pad byte follows the stream (43 of the 93 SPRIT chunks; every even-length stream
    has none). The decoder never reads it (its loops are bounded by sweep/row counts).
  - The two signed placement offsets (89/93 SPRIT frames carry non-zero values) are
    preserved as screen-space `xOffset`/`yOffset` metadata and written back with the
    inverse on-disk sign. They are placement hints, not pixel data.

Transparent index is **255** (methods 17/21/23 leave it untouched; decoder emits 255 as
the key colour where a backdrop would show through in-game). For 21 that key is an immediate in
DQK's own code and for 17 it is the mask plane's `0xFF` — see §5d.

---

## 5a. Drawing method 25 — composite / image-id list, SOLVED (2026-08-22)

§8 listed method 25 as "image-id list — rare; skipped". Its records are now decoded, from all
**16** occurrences in the corpus (DQK `DISK2/PICC.TLB` and `DISK3/FRAME.TLB`; FRUA
`DISK2/PICA.TLB`, `DISK2/PICD.TLB`, `DISK3/FRAME.TLB`), **71 records** in total.

The 8-byte image header is followed by `N` six-byte records:

```
BYTE  source      pointer index, WITHIN THIS LEAF, of the image to draw
BYTE  count       N itself, repeated in every record
WORD  dest_y      destination row,    added to wherever the composite itself is drawn
WORD  dest_x      destination column, added to wherever the composite itself is drawn
```

| claim | hits |
|---|---|
| payload length is a whole multiple of 6 | 16/16 |
| byte 1 equals the record count, in every record | 16/16 |
| byte 0 is a valid pointer index in the same leaf | 71/71 |
| …and that region carries a real drawing method (16/17/18/21/23) | 16/16 |
| `dest_y` strictly descends down the list | 16/16 |
| **`max(dest_y) + height(source) == height(composite)`** | **16/16** |

The null for the id claim: a random byte lands on a real image in that leaf about
`imageCount/256` of the time, which over these 16 regions predicts **1.11** hits, not 16.

Two shapes occur:

- **Alias.** DQK `PICC` (ptrs 6, 7, 9, 11) and FRUA `PICA`/`PICD` use a single record naming a
  full-size picture at row 0, so several slots share one stored picture.
- **Stack.** `FRAME.TLB` uses `N` records over three 8×8 tiles — a top cap, a repeated middle and a
  bottom cap — placed 8 rows apart to build a 120/63/43(/31)-row vertical border. DQK's ids are
  45/46/47 and FRUA's are 26/27/28, so they are per-file pointer indices, not a shared constant.

**Horizontal placement — SOLVED 2026-08-22, from `DQK.EXE`, not from the corpus.** The record's
trailing word (offset +4) is `dest_x`, the exact counterpart of `dest_y` at +2. Both are *relative*
offsets applied to wherever the composite itself is being drawn.

The corpus was never going to settle this, and it is worth being clear about why: **70 of the 71
shipped records hold 0 there.** "It is `dest_x`" and "it is never read" predict the same bytes in
70 of 71 cases. A field that is almost always zero is almost information-free. The executable does
not have that problem.

`DQK.EXE`'s recursive draw routine begins at file offset `0x01984C`. On entry it reads the child
image's own 8-byte header into `[bp-0x12]` and subtracts that header's two offset fields from two
stack slots:

```
0x01988E  8b 46 f0    mov ax,[bp-0x10]   ; child header +2 — the y offset
0x019891  29 46 06    sub [bp+06],ax
0x019894  8b 46 f2    mov ax,[bp-0x0e]   ; child header +4 — the x offset
0x019897  29 46 08    sub [bp+08],ax
0x01989A  8a 46 f5    mov al,[bp-0x0b]   ; child header +7 — the drawing method
0x01989F  25 0f 00    and ax,0x000f
0x0198A2  3d 09 00    cmp ax,0x0009      ; 25 & 0x0f == 9 — this is the method-25 arm
```

That pairing is what names the axes, with no external table and no appeal to the corpus: header +2
is the vertical offset and header +4 the horizontal one (§4), so `[bp+06]` is Y and `[bp+08]` is X.
The method-25 arm then reads each 6-byte record into a stack buffer at `[bp-0x0a]` and re-enters
the routine:

```
0x0198EC  8b 46 08    mov ax,[bp+08]     ; the caller's X
0x0198EF  03 46 fa    add ax,[bp-06]     ; + the record word at +4
0x0198F2  50          push ax
0x0198F3  8b 46 06    mov ax,[bp+06]     ; the caller's Y
0x0198F6  03 46 f8    add ax,[bp-08]     ; + the record word at +2
0x0198F9  50          push ax
0x0198FA  0e          push cs
0x0198FB  e8 4e ff    call 0x01984C      ; itself — 0x0198FE - 0xB2 lands exactly on the head
```

So record +2 → Y and record +4 → X. Pinned in `packages/engine/test/hlib.test.ts`
("the trailing word is destX, per DQK.EXE"), which asserts these byte sequences directly, so a
misread offset fails loudly rather than becoming folklore. `renderHlibComposite` composes a slot on
request using both offsets; `decodeHlib` still leaves composites out of `images`, so flattened
image indices are byte-for-byte what they were and nothing downstream silently gains an entry.

**One supporting argument offered for this was wrong, and is withdrawn.** It was claimed that the
`max(dest_y) + height(source) == height(composite)` invariant rules out the trailing word being a
*second* Y contribution, "because that would break the exact equality for the one `dest_x = 3`
record". It would not. In DQK `FRAME.TLB` ptr 21 the record that carries `dest_x = 3` is record 1;
the record that supplies `max(dest_y)` is record 0, whose `dest_x` is 0. The invariant never touches
the exceptional record, so it says nothing about it either way. The axis assignment rests on the
entry-code pairing above, which is direct, and not on that invariant.

*Refined 2026-08-22.* The earlier phrasing — "byte +6 is twice the source image's in 14 of 16
cases and equal in the other 2" — was measured per *region* and made the 2 look like exceptions.
Measured per *part*, across all 71 records in all 16 regions, the relationship is exact and has no
exceptions at all: `compositeWidth % sourceWidth == 0` in **71/71**, with the ratio distribution
`{2: 62, 1: 9}` — never 3, never 4, never a fraction. The 9 ratio-1 parts are FRUA `PICA.TLB`
ptr 4 (1 part) plus FRUA `FRAME.TLB` ptr 18 (8 parts sharing that composite's one width byte).

A first attempt to claim byte +6 as the answer to horizontal placement was withdrawn, and the
question of what it *does* mean stayed open into 2026-08-24: an exact 1x/2x ratio in 100% of cases
is predicted equally well by two live hypotheses — that byte +6 is a genuine, independently authored
canvas width (its meaning in an ordinary header), and that it is a value the authoring tool
*derived from* the source width. No corpus evidence separates them, and 16/16 is the entire corpus
(a fresh scan of all 52 `.TLB`/`.GLB` files under both installs finds no held-out case), so there
was nothing left to generalise to. §5b settles it from the executable instead.

*Methodology note, recorded because it nearly shipped.* A first pass resolved each composite's
source through a **global** `imgNNN → pointer index` map built across a whole master `.TLB`. FRUA
`PICD.TLB` has 29 sets, each restarting its own numbering at `img001`, so the map silently kept
only the last set's `img002` — a 104×104 image from set 17 — in place of set 4's real 88×88
source, and produced a confident "ratio = 1.692, non-integer" reading. Re-deriving every source
strictly from its **own leaf's** pointer table at its own absolute `leafBase` recovers 88×88 and
ratio 2.0. Resolve a reference in the scope that owns it.

---

## 5b. Method-25 header byte +6 — CLOSED 2026-08-24: the engine never reads it

§5a left this as the last open field in the composite record. It is closed the same way `dest_x`
was — **from `DQK.EXE`, because the corpus provably could not settle it.**

### The executable

The recursive draw routine at file offset `0x01984C` reads the slot's own 8-byte header into
`[bp-0x12]`, so header +6 is `[bp-0x0c]` and header +7 (the drawing method) is `[bp-0x0b]`:

```
019877  push cs
01987b  call 0x18e25        ; fill [bp-0x12] with the 8-byte header, return payload ptr in dx:ax
019887  or   dx,ax
019889  jne  0x1988e        ; NULL payload -> straight to the epilogue
01988e  mov  ax,[bp-0x10]   ; header +2, the y offset
019891  sub  [bp+06],ax
019894  mov  ax,[bp-0x0e]   ; header +4, the x offset
019897  sub  [bp+08],ax
01989a  mov  al,[bp-0x0b]   ; header +7, the drawing method
01989f  and  ax,0x000f
0198a2  cmp  ax,0x0009      ; 25 & 0x0f == 9
0198a5  jne  0x1990f        ; <-- everything else goes here
0198a7  mov  si,1           ; ---- the method-25 arm begins ----
...
0198ae  mov  ax,6           ; read one 6-byte record into [bp-0x0a]
0198bd  lcall 0xd7,0x8c2
0198e0  mov  al,[bp-0x0a]   ; record +0 : source pointer index
0198ef  add  ax,[bp-6]      ; record +4 : dest_x
0198f6  add  ax,[bp-8]      ; record +2 : dest_y
0198fb  call 0x1984c        ; recurse on the child
019901  mov  al,[bp-9]      ; record +1 : the repeated count
01990b  jl   0x198ae        ; ---- loop; arm ends at 0x1990d ----
01990f  mov  al,[bp-0x0c]   ; header +6 -- read ONLY on the non-25 branch
```

`[bp-0x0c]` is read **once in the entire function**, at `0x1990F`, which is the `jne` target — the
ordinary raster path where it really is the width. The method-25 arm reads only the 6-byte record
buffer, and the epilogue (`0x01997A`: `pop di / pop si / mov sp,bp / pop bp / retf`) reads nothing.
**A method-25 slot's byte +6 cannot affect what is drawn.**

### The corpus, asked the right question

Once you compare the declared width against the width the parts actually occupy rather than against
the source width, the field stops looking like a canvas:

| | regions |
|---|---|
| declared width **exceeds** the content the parts occupy | **14 / 16** (exactly 2x in 12) |
| declared width equals the content | 2 / 16 (FRUA `PICA.TLB` ptr 4, `FRAME.TLB` ptr 18) |
| declared width is **smaller** than the content | **0 / 16** |

Concretely, DQK `FRAME.TLB` ptr 20 declares 16 pixels for fifteen 8x8 tiles all at `dest_x = 0` —
a genuine canvas would leave an 8-pixel blank stripe down a screen border. And per part, byte +6 is
always either the **source's own** width byte or exactly twice it, in **71 of 71** parts, including
the `22 -> 44` case in `PICC`. It tracks the source, not the composite. An independently authored
canvas width would not do that; a tool writing `2 * source_w4` (62 parts) or `source_w4` (9 parts)
would.

So both hypotheses in §5a resolve the same way: whatever the authoring tool intended, the value is
derived from the source and is dead at draw time.

### Why this matters to us, not just to the documentation

`renderHlibComposite` sizes its canvas from `max(destX + sourceWidth)`, which is what the engine
effectively does. Had it trusted byte +6 — the obvious reading of a header field named "width" —
**14 of the 16 shipped composites would render with dead columns.** `packages/engine/test/hlib.test.ts`
pins this with a falsifiable probe: swapping the renderer to `composite.widthByte * 4` turns the
assertion red (verified), and restoring it turns it green.


### 5c. Method 17's two planes — VERIFIED 2026-08-24, and the mask was being discarded

§8 used to list "method 17's visible plane is the OR-mask" under *Assumed*. It is now settled from
the data, in both directions, over all **34** method-17 members in the DOS corpus (COMSPR, CBODY,
FRAME):

- **The first plane is the mask.** It takes exactly two values, `0x00` and `0xFF`, in **34 of 34**
  members. The second plane takes 65 values across the family and is non-binary in **30 of 34**
  (the four exceptions are 8x1 `FRAME` strips of a single colour). A mask has two values; pixels
  do not.
- **Mask `0xFF` implies pixel `0` in 8284 of 8284 positions**, zero exceptions, against a 69.9%
  base rate for pixel `0`. That is the second half of the blit idiom: a transparent pixel must be
  `0` so the combine is a no-op. So `0xFF` is the *transparent* polarity. ⚠ **Corrected 2026-08-24:**
  the idiom is `dst = (planeA & dst) ^ planeB`, an **XOR**, not the OR this section first claimed —
  read off the row blitter itself in §5d. The rendered result is identical *given* the invariant
  above, and both decoders were already right; but the direction of the implication changes. Under
  OR, a non-zero pixel beneath a `0xFF` mask would merely brighten the background. Under XOR it
  would scramble it. The 8284-of-8284 rule is therefore a **hard requirement of the format**, not a
  stylistic habit of whatever packed the art.
- **The converse fails, and that is the important part.** `1201` of the `5276` opaque positions
  legitimately hold index `0`. Transparency is therefore **not recoverable from the pixel plane
  alone** — the mask is load-bearing, not redundant.

DQK's blit agrees, and as of 2026-08-24 it has been read rather than inferred — see §5d. The
16-colour arm at `0x01904b` saves the source pointer, advances it by `stride * height` — which
lands it on the **second** plane — then advances *both* pointers by one stride per row and passes
the pair to the row routine, with the **un-advanced** pointer in the AND slot. That is the plane
order this section had derived statistically, now confirmed from the machine code.

**The bug this exposed.** The decoder read the correct plane and threw the mask away, then tagged
the result `transparentIndex = 255` — a value the buffer never contained. Every transparent pixel
came out as index `0`, so a `CBODY` combat body icon composited as an opaque black rectangle with
the sprite inside it, over **61%** of the family's pixels (8284 of 13560). Both decoders now apply
the mask. `255` is unambiguous as the key: **0 of 5276** opaque positions hold `0xFF`.

---

### 5d. The uncompressed blitters, read off DQK.EXE — VERIFIED 2026-08-24

Which drawing methods are transparent, and by what rule, was the last thing in §5 still resting on
`hackdocs` plus "it renders right". The dispatcher at `DQK.EXE:0x018fb4` switches on the record's
low nibble and hands each method its own row routine, so the question is answerable directly. All
addresses are file offsets; the segment form is `0x00d7:off` with `file = 0x2400 + 0xd7*16 + off`.

| method | nibble | arm | row blitter | what the blitter does |
|--------|--------|-----|-------------|------------------------|
| 16 | 0 | `0x018fdb` | `0x0033b1` (`0xd7:0x241`) / `0x0033f6` (`0xd7:0x286`) | `rep movsw` / `rep movsb`. **No comparison, no key** — a straight copy. |
| 17 | 1 | `0x01904b` (16-col) / `0x0190a9` (256-col) | `0x00342a` (`0xd7:0x2ba`) / `0xd7:0x30a` | `lodsw` / `and ax, es:[di]` / `xor ax, [bx]` / `stosw` — i.e. **`dst = (A & dst) ^ B`**. |
| 21 | 5 | `0x019129` | `0x00529e` (`0xd7:0x212e`) | `lodsb` / `cmp ah, al` / `je` skip / `stosb`, with `ah` = the key. |

Three things follow, and they settle three separate `Assumed` entries:

- **Method 21's key is the literal `0xFF`, hard-coded in the caller.** The arm is
  `mov al, 0xff` / `push ax` at `0x019141`, one extra argument in front of method 16's five. Nothing
  in the record, the colour table or the display mode can change it, so `255` is transparent for
  method 21 unconditionally — including in 256-colour mode, where it costs the format its last
  palette entry. That is why our decoders may key `255` without inspecting the palette.
- **Method 16 is opaque because its blitters cannot be anything else.** Neither reads a key. The
  caller's `test word ptr [bp+0x12], 1` at `0x018fe8` picks between them on the **parity of the
  pixel count** — even goes to the `rep movsw` copy (which does `shr ax, 1` first), odd to
  `rep movsb`. It is a word-copy optimisation, not a second semantic. The same parity test heads
  both method-17 arms, for the same reason.
- **Method 17 combines with XOR, not OR** (`0x00344d`–`0x003450`), and its AND operand is the
  **first** plane: the 16-colour arm passes the un-advanced base in the AND slot and
  `base + stride*height` in the XOR slot. See the corrected note in §5c for why the distinction
  matters to the format even though it does not change a rendered pixel.

**Still open (narrowed, not solved).** The 256-colour method-17 arm at `0x0190a9` calls the same
row blitter but keeps the AND operand pinned at the record's base for every row, advancing only the
XOR operand (`add word ptr [bp+6], di` at `0x0190bd`, with `[bp-4]` never updated). That does not
read as two lock-step planes the way the 16-colour arm does, and no reading of it has been tested
against a record. The 34 method-17 members we hold are decoded on the 16-colour model, which is
verified; whether 256-colour mode draws them differently is unknown, and guessing at it is exactly
the move this document keeps having to undo.

---

## 6. `.GLB` master libraries (non-image)

> **▶ Specification gap closed 2026-08-21 (fidelity-plan §29) — see §6a.** Until that date this
> section described `DATA` member payloads as if the member bytes *were* the payload. For at least
> two `DATA` libraries they are not: the member begins with a **2-byte big-endian uncompressed
> length** and the payload starts at byte 2. Everything §6 says about the *container walk* is
> unchanged and still verified; the omission was one layer down, inside the member.

`SOUNDS.GLB`, `ECL.GLB`, `GEO.GLB`, `MONCHA.GLB` use the **same** `HLIB` container and
pointer-table directory, but their member chunks are tagged `DIG4` (digitised sound),
`DATA` (ECL scripts / GEO maps / generic) rather than `TILE`. The container walk is
identical; only the member payloads differ. Image rendering does not apply. (Member payload
decoding was out of scope for *this* doc, but all four are since decoded elsewhere — kept
current here so this doesn't read as an open gap: `DIG4` → `packages/engine/src/audio/dig.ts`
+ asm `ccsnd.asm`; `ECL.GLB` `DATA` → `packages/engine/src/loaders/eclGlb.ts` + the ECL VM,
including Gen2 container support in asm `ccecl.asm`; `GEO.GLB` `DATA` →
`packages/engine/src/loaders/geo.ts` + asm `ccgeo.asm`; `MONCHA.GLB` `DATA` →
`packages/engine/src/loaders/moncha.ts` + asm `ccmon.asm` for member listing,
decompression, field dumps, and extraction. `CCGLB.COM` dispatches `.GLB` files
to `CCSND`, `CCHLIB`, `CCGEO`, or `CCMON` by sniffing the HLIB tag and DATA
payload shape. ⚠ **2026-08-21:** `MONCHA.GLB` members carry the §6a big-endian
length word; `moncha.ts` reads it as of commit `df69707`. Any decoder that starts at
member byte 0 is out of phase — check `native/src/ccmon.asm`'s own header comment for
where the native tool stands. See `native/README.md`'s CCMON section.)

### 6a. `DATA` member header: a 2-byte BIG-ENDIAN uncompressed length — VERIFIED for two libraries (2026-08-21)

**Scope first, because this is the part that is easy to over-generalise.** The length word is
verified for exactly **two** `DATA` libraries — DQK's `MONCHA.GLB` and FRUA's `MONST.GLB`. It is
**not** a property of every HLIB member, and on the evidence below it is **not** present in
`ECL.GLB`, `GEO.GLB` or `SOUNDS.GLB` at all. Treat it as a per-library payload convention that
happens to be carried by both known compressed-record libraries, not as a container-level field.

```
member off 0   WORD (BIG-endian!)  uncompressed length of the payload
member off 2   ...                 the RLE stream (monchaRLE: c<0x80 copy c+1; c>0x80 repeat 257-c;
                                   c==0x80 is a no-op — see packages/engine/src/util/rle.ts)
```

Note the endianness: the container header, the pointer list and every image field in §§1-5 are
**little-endian**. This one word is **big-endian**, which is why it went unnoticed for so long — read
LE it is a large implausible number, and read as two RLE control bytes it decompresses *something*.

**This is not an inference from the data.** DQK's own loader reads it: the staging fill disassembled
at canonical `2177:257C` (file offset `0x3570C`, inside the routine at file `0x356DC`) computes
`len = (raw[0] << 8) | raw[1]`, copies the payload from `raw + 2`, and passes `len` to the
decompressor at `00d7:0a1c` as its **bounded expected output size**.

**Measured, both libraries, from the retail bytes:**

| Library | Members | Header word == length of `monchaRLE(member[2:])` |
| --- | ---: | ---: |
| DQK `DISK2\MONCHA.GLB` | 98 | **98 / 98** |
| FRUA (Unlimited Adventures) `DISK2\MONST.GLB` | 127 | **127 / 127** (every word is `0x01C2` = 450 = `FRUA_MONSTER_RECORD_SIZE`) |

FRUA's constancy is why its word was previously mis-read as a fixed "`01 C2` record marker": every
FRUA monster record is the same size, so a length and a marker are indistinguishable there. DQK's
98 distinct-length members disambiguate it.

**What this cost while it was missing:** this project decompressed each `MONCHA.GLB` member from
byte 0, consuming the length word as two RLE control bytes, so every DQK monster record was out of
phase by a record-dependent amount. See fidelity-plan §29 for the full list of downstream
corrections (record lengths, name/ability offsets, names, and a writer that emitted no length word
at all).

**Corpus-wide, 2026-08-24: the word is confined to these two.** All 10 `DATA`/`DIG4` libraries in
the DQK and FRUA installs, tested on the decisive predicate rather than the loose one below —
does the big-endian word equal `len(monchaRLE(member[2:]))`? Records are counted from member 1,
since member 0 is the id table (§1c).

| Library | Tag | Records | word == RLE output length |
| --- | --- | ---: | ---: |
| DQK `MONCHA.GLB` | `DATA` | 98 | **98 / 98** |
| FRUA `MONST.GLB` | `DATA` | 127 | **127 / 127** |
| DQK `ECL.GLB` | `DATA` | 47 | 0 / 47 |
| DQK `GEO.GLB` | `DATA` | 20 | 0 / 20 |
| DQK `SOUNDS.GLB` | `DIG4` | 13 | 0 / 13 |
| FRUA `SOUNDS.GLB` | `DIG4` | 13 | 0 / 13 |
| FRUA `GAME.GLB` | `DATA` | 1 | 0 / 1 |
| FRUA `GEO.GLB` | `DATA` | 3 | 0 / 3 |
| FRUA `SCRIPT.GLB` | `DATA` | 58 | 0 / 58 |
| FRUA `STRG.GLB` | `DATA` | 5 | 0 / 5 |

The last four had never been examined. The split is total — 225 records carry it, 160 do not, and
nothing is in between — so §6a's original scoping ("a per-library payload convention, not a
container-level field") was right and is now measured rather than assumed. Pinned by
`packages/engine/test/hlib.test.ts`.

**The other `DATA`/`DIG4` libraries — the earlier, looser check, with its null reported.** A loose plausibility test
("the big-endian word is ≥ the stored member size and ≤ 8× it") applied to the first two bytes of
every member:

| Library | Tag | Members | BE word == RLE output length | BE word "plausible" | **Null**: same test on bytes 2..3 |
| --- | --- | ---: | ---: | ---: | ---: |
| `DISK3\ECL.GLB` | `DATA` | 47 | **0 / 47** | **0 / 47** | 38 / 47 |
| `DISK3\GEO.GLB` | `DATA` | 20 | **0 / 20** | 20 / 20 | 8 / 20 |
| `DISK1\SOUNDS.GLB` | `DIG4` | 12 | **0 / 12** | 8 / 12 | 0 / 12 |

Read the null column before the plausible column. The predicate accepts 38 of 47 arbitrary
mid-payload ECL words, so it is loose — which makes ECL's **0 / 47** a decisive rejection, not a
weak one. Every ECL member instead begins `01 01` (`0x0101` = 257 either way), a constant.

GEO's 20 / 20 is the null firing, not a length word: the little-endian reading scores 20 / 20 as
well, no member decompresses to its own header value, and the two bytes are visibly the map's
**width and height** — `0a 0a` on a 408-byte member (`10·10·4 + 8 = 408`), `1c 1c` on a 3144-byte
member (`28·28·4 + 8 = 3144`), `27 14` = 39×20. GEO `DATA` members are stored **uncompressed**, so
there is no uncompressed length to declare.

`SOUNDS.GLB`'s `DIG4` members score 0 / 12 **on the test run here**, which asks the MONCHA
question: is the `u16be` at offset **0** the member's decompressed length? It is not — offset 0
is the sample rate. **`DIG4` members do carry a length word, at offset 4** (added 2026-08-21):
`u16be payload length`, equal to `member.length - 6`, or `- 7` where an odd payload is padded up.
That holds in 13 / 13 DQK members and 46 / 46 Amiga `DIG8` members across four titles, against a
null of **0 / 2483** arbitrary `u16be` windows elsewhere in the same members. So the `DIG4` header
is six bytes, not four, and the codec is nibble-packed — see
`docs/engine/research/audio-silent-titles.md` §2.1a. The 0 / 12 above is a correct answer to a
different question, and is left as measured.

**Unverified / not claimed:** whether any *other* HLIB `DATA` library outside the four measured
here (e.g. in Gateway/Secret `GLIB` siblings, or FRUA's other `.GLB` files) carries the same word.
Nothing has been measured there, so nothing is claimed.

---

## 7. HLIB vs DAX vs DAA — cross-format contrast (for the asset library)

| Aspect | **DAX** (DOS CoK/DoK) | **DAA** (Amiga CoK/DoK) | **HLIB** (DOS DQK) |
|--------|----------------------|-------------------------|--------------------|
| Magic | none (headerless) | none (`word0` only) | ASCII `"HLIB"` |
| Endianness | little-endian | **big-endian** (68000) | little-endian |
| Directory | sized TOC `{u8 id, u32 off, u16 raw, u16 comp}` | same TOC, big-endian | **pointer table** (DWORD offsets only; sizes implied by next pointer) |
| Nesting | flat | flat (or 6-byte sub-index) | **nested**: MASTER `HLIB` packs self-contained leaf `TILE` files |
| Compression | signed-byte RLE (`c<0x80` copy c+1; else repeat 256-c) | same RLE | **per-row PCX-style** (method 18) / transparent RLE (method 23); also raw (16/17/21) |
| Pixel depth | **4bpp** chunky (2 px/byte, hi nibble left) | **5-plane planar** (32 colours) | **8bpp** chunky (1 byte = 1 index) |
| Pixel order | linear rows | contiguous bitplanes | **Chain-4 interleave** (1/4 row per sweep) |
| Palette | none — fixed 16-colour EGA | 32× 12-bit Amiga RGB in each frame | colour table per leaf, **256× 8-bit RGB**, with `first_col`/`ncolors` slicing |
| Palette scaling | n/a | nibble ×17 → 8-bit | **file is 8-bit**; the engine stores `>> 2` for its 6-bit DAC |
| Frame header | `{u16 h, u16 w/8, u16 yoff, u16 xoff}` | same + pad + 64B palette | `{u16 h, u16 yoff, u16 xoff, u8 w/4, u8 method}` |

Same-named assets across formats: `BIGPIC`, `CPIC`, `BACK`, `8X8D*`, `SPRIT`, `PIC*`
appear in all three games — useful for visual cross-checking decoders.

---

## 8. Verified / Assumed / Unsolved

**Verified (rendered as recognizable VGA art):**
- Container header, pointer-count-minus-1 quirk, EOF==filesize.
- Leaf vs master walk; nested self-contained sets with relative pointers.
- Colour table layout, **field-for-field out of DQK's realizer** (§2): the leading word is a
  FLAGS word (bits 0..2, and no colour table in the corpus sets anything above bit 2), the record
  type is the LOW NIBBLE of byte +7, the range records are palette-slot registrations, and a
  bit-2 EGA-16 nibble block may trail. The full layout accounts for the length of **438 of 438**
  DOS colour tables, against nulls of 264 and 175. Bit 0's meaning is confirmed a second time,
  independently, by the §2e remapper skipping `ncolors*3` when it is set and a flat 768 when it is
  not. The bit-2 block itself has **no reader in `DQK.EXE`** — see §2c.
- 8-bit RGB in the file; `first_col`/`ncolors` slicing. The engine stores `byte >> 2` on the way
  to its 6-bit DAC, so rendering the raw byte is at most 3/255 per channel bright (§2) — the
  earlier flat "no DAC scaling" was right about the file and wrong about the engine.
- **Multi-palette layering is plain overwrite order** (§2d), read out of the installer at
  `DQK.EXE:0x018661`: one global 768-byte shadow palette at `DS:0xd145`, each install writing only
  its own `[first_col, first_col+ncolors)` window. `mergePalettes` already matched it.
- **The palette slot always holds a colour table** (§1a, §2b): 435 of 435 TILE leaves across the
  whole DOS corpus (DQK + FRUA, 52 files); no leaf puts an image there. `ncolors == 0` is a real
  "inherit" record, not an absent table, and only `TOPVIEW.TLB` uses it (2 of 435). The combat
  leaves that were believed to carry no palette carry a **partial** one.
- **A leaf may carry several colour tables** (§2a): DQK `FRAME.TLB` holds five, at `ptr[0]` and
  `ptrs 41..44`, all five distinct and all patching slots 16..31. `cmagic` (byte +7) separates
  them from images with no ambiguity — 24 occurs 4 times in the whole DQK+FRUA corpus and is
  never a drawing method.
- Image header; Chain-4 interleave; drawing methods 16, 17, 18, 21, 23.
- **Which methods are transparent, and by what rule** (§5d), read off the row blitters DQK
  dispatches to at `0x018fb4`: method 16 copies with `rep movs` and no comparison (opaque);
  method 21 is method 16's payload run through a colour-keyed copy whose key is the **immediate
  `0xFF`** pushed by the caller at `0x019141` (transparent, unconditionally, whatever the palette
  or the display mode); method 17 combines two planes with `dst = (A & dst) ^ B`. The parity test
  that heads three of these arms selects `rep movsw` vs `rep movsb` — an optimisation, not a
  semantic.
- **Method 17's two planes** (§5c): the first is the AND mask (only `0x00`/`0xFF`, 34/34 members),
  the second the XOR pixels, and `0xFF` is the transparent polarity — mask `0xFF` implies pixel `0`
  in 8284 of 8284 positions against a 69.9% base rate. Plane order is confirmed in the binary: the
  16-colour arm passes the un-advanced base as the AND operand and `base + stride*height` as the
  XOR operand. The mask is required: index `0` is a real opaque colour in 1201 of 5276 opaque
  positions, so discarding it (as both decoders did until 2026-08-24) rendered 61% of the family as
  opaque black.
- Method-18 `257-c` repeat (continuous per-row stream) and method-23 `256-c` skip
  (4 image sweeps, `0`-terminated rows) — both confirmed against legible text/art.
- **`DATA` member length word** (§6a): 2-byte **big-endian** uncompressed length at member
  offset 0, payload from offset 2. Read by DQK's own loader (file `0x3570C`, bound passed to
  the decompressor at `00d7:0a1c`). Exact for **98/98** `MONCHA.GLB` members and **127/127**
  FRUA `MONST.GLB` members. Verified for those **two libraries only**.
- **Absent** from `ECL.GLB` (0/47, against a 38/47 null), `GEO.GLB` (0/20 — those two bytes are
  the map's width/height and the members are uncompressed) and `SOUNDS.GLB` `DIG4` (0/12).
- Write side: encoders for methods 16/18/21/23 (`hlibEncode.ts`) round-trip
  pixel-losslessly; the method-23 encoder reproduces the real SPRIT.TLB streams
  byte-identically (96/96 chunk bodies incl. the word-alignment pad — see §5).
- Files confirmed as real art: TITLE (backdrops + MicroMagic/SSI/TSR title overlays),
  BIGPIC (Krynn overland maps), PICA (encounter pics: giant spider, robed figure),
  SPRIT, ALWAYS (UI borders), 8X8DB, DUNGCOM/WILDCOM tiles, BACK (dim backdrop textures).

**Assumed (plausible, not exhaustively proven):**
- Exact default anchors for every in-engine UI art family. The signed offsets
  themselves are verified from `TLBFORM.TXT`: positive vertical moves up and
  positive horizontal moves left.
- **How 256-colour mode draws method 17** (§5d). Its arm at `0x0190a9` reaches the same row
  blitter but pins the AND operand at the record base for every row, advancing only the XOR
  operand — which is not the two-lock-step-planes shape the 16-colour arm has. Our decoders use
  the 16-colour model for all 34 members. No reading of the 256-colour arm has been tested against
  a record, so none is written down here.
- That the two key bytes of a range record are `hackdocs`' `dir`/`speed`. The other two are
  **verified** to be `first_col`/`count` by the installer's interval arithmetic (§2); nothing in
  DQK's palette path animates the first two, and it only ever compares them for equality.

**Unsolved:**
- Drawing method **25** — **SOLVED** (§5a): 6-byte `{source ptr, count, dest_y, dest_x}` records,
  with `max(dest_y) + source height == composite height` in 16/16 against a null of 1.11, and both
  placement axes read straight out of `DQK.EXE`'s draw routine at file offset `0x01984C`. The slots
  are still deliberately left out of `HlibArchive.images` so flattened image indices do not shift;
  `renderHlibComposite` composes one on request. Header byte +6 is **closed too** (§5b): the engine
  does not read it on this path, so it is not a canvas width and the renderer is right to ignore it.
- ~~Whether the §6a member length word appears in any HLIB `DATA` library beyond DQK
  `MONCHA.GLB` and FRUA `MONST.GLB`~~ — **MEASURED 2026-08-24, and the answer is no.** All **10**
  `DATA`/`DIG4` libraries in the two DOS installs were tested on the decisive predicate (the
  big-endian word equals `len(monchaRLE(member[2:]))`): it holds for **every** record of `MONCHA`
  (98) and `MONST` (127) and for **0 records** of the other eight — including FRUA's `GAME.GLB`,
  `GEO.GLB`, `SCRIPT.GLB` and `STRG.GLB`, which had never been looked at before. It is a payload
  convention of the two compressed-record bestiaries, not a container field, exactly as §6a scoped
  it. **The Amiga `GLIB` siblings are measured too, as of the same day** — `glib-format.md` §7a:
  all six Amiga bestiaries, and the word turns out to mark an **engine generation**, not the
  `MONCHA` filename. DQK (98/98) and Pools of Darkness (122/122) carry it; Curse of the Azure Bonds
  (0/78), Secret of the Silver Blades (0/70), Gateway (0/69) and Treasures (0/130) do not, and
  those four share a different record layout as well (`u8 nameLen` + name, against DQK's name at a
  fixed `0x68`). The natural rule "the word appears iff the record size varies" is refuted by FRUA,
  whose records are all 450 bytes and which carries it regardless.
- Complete game-state semantics for ECL, monster AI/combat, and sound playback are
  handled by the engine docs/tools, not this image-container spec; the HLIB/DATA
  member routing and core payload decoders are no longer open container-walk gaps.
- ~~Exact in-engine multi-palette layering (which leaf's palette wins per screen)~~ — **SOLVED
  2026-08-24, §2d.** There is one 768-byte shadow palette at `DS:0xd145` and each install patches
  only its own window, so layering is overwrite order and nothing more; `mergePalettes` was
  already correct. Standalone renders still use each leaf's own partial palette, which is the
  same thing the engine would show with nothing else loaded.
- ~~Who reads the bit-2 EGA-16 nibble block (§2c)~~ — **CLOSED as a negative, 2026-08-24, §2c.**
  Nothing in `DQK.EXE` reads it. The three routines that dispatch on record type 8 are the three
  callers of the colour-table loader `0x169b:0x0075`, they are the only ones in the file, all
  three have been read end to end, and none of them tests flags bit 2 or advances past
  `8 + ncolors*3 + nranges*4`. The authoring-tool-residue hypothesis this document recommended
  testing first is refuted too: FRUA *is* the authoring tool and carries the block on **0 of 264**
  records, while DQK carries it on **174 of 175** (the exception being an `ncolors == 0` inherit
  record) — 19 of 19 DQK libraries at n-of-n. It is a property of DQK's data build with no
  consumer in the executable that ships beside it. What would consume it is a 16-colour build of
  DQK; whether one exists is a question about releases, not about these bytes.
- **Which four display modes `0x019f4f` builds its 256-byte map for, and how** (§2e). Only arm 0
  (256-colour: a straight copy of the caller's table) is read. The §2c conclusion does not depend
  on the arms, only on the routine's extent, so they were left alone rather than guessed at.

  One thing is nailed down for whoever picks this up, and it is only a starting point, not an
  answer: `DQK.EXE` names exactly four adapters, at exact file offsets — `"Installed for VGA
  only!"` (`0x069b21`), `"Installed for EGA only!"` (`0x069b3a`), `"Installed for TANDY 16 color
  only!"` (`0x069b53`) and `"sorry not in CGA"` (`0x0682dd`). Four strings and four jump-table
  arms is suggestive and nothing more: **nobody has traced either the strings or the arms to a
  common selector**, so do not write the pairing down as VGA/EGA/Tandy/CGA in that order until
  something in the code says so. An attempt on 2026-08-25 to reach it from the other end — by
  enumerating byte writes to the mode globals near `0x039000` — did not land on a clean selector,
  and is recorded here as not-done rather than approximated. Bearing on §2c: if the EGA arm
  turns out to consume flags bit 2 after all, §2c's proven negative narrows from "no reader in
  `DQK.EXE`" to "no reader on the 256-colour path", which is a weaker claim than the one shipped.

## 9. GLIB — the same format, big-endian, and how long it stayed off the generic path

`.TLB`/`.GLB` containers from the Amiga releases of Curse, Secret, Pools of Darkness, Gateway,
Treasures and DQK carry the ASCII magic **`GLIB`** instead of `HLIB` and are big-endian
throughout. `packages/engine/src/loaders/glib.ts` has decoded them since 2026-07-18.

**They were not reachable from `decodeAsset` until 2026-08-22.** The dispatcher sniffed HLIB,
ILBM, DAA and DAX and stopped, so every caller on the generic path — the asset browser,
`loadGame`, the NWN preview — answered `unrecognized container format` for all of them.
`explore.ts` imported `decodeGlib` directly for the Amiga wall-art routes, so those were green
and nothing pointed at the gap. Sweep after the fix: **152 files across six distinct titles,
13,884 images, 0 throws** (177 / 16,483 counting the German Pools pack, a duplicate of the
English one).

Order in the dispatcher is load-bearing, not cosmetic. On unmodified GLIB bytes only `sniffGlib`
matches — `sniffHlib`, `sniffIlbm`, `sniffDaa` and `sniffDax` are all false, which is exactly why
these files threw rather than decoding as something wrong. But perturb byte 0 from `G` to `X` and
`sniffDaa` accepts the file and it decodes as DAA: DAA's sniff is structural and will claim a
GLIB-shaped file given the chance. Both facts are pinned in `packages/engine/test/glib.test.ts`.
