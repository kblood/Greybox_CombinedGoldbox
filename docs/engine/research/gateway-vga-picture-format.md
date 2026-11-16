# Gateway to the Savage Frontier — graphics format investigation (P3.1)

**Date: 2026-07-16 (Part 1/2), 2026-07-17 (Part 3, Part 4, Part 5).** Resolves the "recover palette / pixel packing" half of
`docs/engine/BUILD-QUEUE.md`'s P3.1 leaf ("Savage Frontier VGA archive contract") with
byte-level retail evidence. Two DIFFERENT, unrelated answers apply to two different
graphics families inside Gateway's own DAX corpus — this is the key finding, and the
main reason the leaf can't be closed with a single yes/no.

Source: the user's local GOG install, `C:/Program Files (x86)/GOG Galaxy/Games/Gateway
to the Savage Frontier/` (not vendored into the repo — see other engine tests using the
same absolute path, e.g. `packages/engine/test/dungeon.test.ts`,
`packages/engine/test/monster.test.ts`). All findings below are reproducible from that
install plus the retail-DAX-committed `Champions of Krynn/` folder in this repo (used as
the EGA baseline / negative control).

## Summary

> **Superseding correction (2026-07-24, native CPIC/RAM oracle):** the Part 2 byte-count
> arithmetic was right but its placement and pixel interpretation were wrong. `TITLE`, `BIGPIC1`,
> `BODY`, and `CPIC2..6` use `17-byte header + 33-byte prefix + planar5 pixels`, not an
> interleaved chunky-nibble/extension image followed by a trailer. The two layouts have the same
> byte count, so old round-trip tests could not distinguish them. Native demo frame t0128 and RAM
> t0150 do: `CPIC2#68` becomes the exact Giant Squid only with five per-row one-bit planes, LSB
> plane first. The engine and retail tests now use the corrected layout. Historical Parts 2–16
> below are retained as the investigation record; read their trailer/interleaved claims as
> superseded wherever they conflict with this correction and Part 20.

| Graphics family | Files | Format vs. CoK/DoK EGA DAX | Status |
| --- | --- | --- | --- |
| Dungeon-exploration tile art | `8X8D2.DAX` (and siblings `8X8D`..`8X8D6`) | **Byte-structurally identical** — same 17-byte tileset header, same `8*tileCount+1` raw-size formula, several blocks exactly 2257 bytes (281 tiles) matching CoK's own common tile-strip size, nibble values only 0..15 | **Genuinely still EGA-style; the "fallback" already decodes it correctly.** No bug. |
| Wall composition | `WALLDEF2.DAX` (and siblings) | Not a pixel/graphics container at all — 780-byte records (`WALLDEF_RECORD_SIZE` in `src/loaders/walldef.ts`), a 5-slice × 156-column tile-**ID** routing table consumed by `world/dungeonWalls.ts`. Format is title-independent already. | **Not a graphics-format question; already correctly handled.** |
| Splash/title screens & static scenes | `TITLE.DAX`, `BIGPIC1.DAX` | **Genuinely different**: 17-byte header + 33-byte prefix + per-row planar5 pixels | **Corrected by native CPIC/RAM oracle (2026-07-24), wired into default dispatch, exact round-trip.** |
| Small icons / body & head portraits | `CPIC2..6.DAX`, `BODY.DAX` | Same VGA-extended format as `TITLE`/`BIGPIC1` (proven — 167/167 blocks, zero slop, exact round-trip) | **Resolved: VGA-extended.** See Part 3. |
| Body/head/combat-sprite art, dungeon backdrop | `CBODY.DAX`, `CHEAD.DAX`, `COMSPR.DAX` (26/28 blocks), `DUNGCOM.DAX` | Byte-structurally identical to CoK/DoK's plain EGA (zero slop, exact round-trip) — same geometry CPIC uses in VGA-extended form is confirmed plain in CBODY, proving the split is real | **Resolved: plain EGA.** The last 2 `COMSPR.DAX` blocks (254/255) are now ALSO resolved (Part 19): pixel-less planar5 **structure records** (zero geometry + the Part 18 component stream), loaded at boot into dedicated globals and "drawn" VGA-mode-only after the exploration-view (255) and 3D-view (254) draws. Their `core24` components carry each screen's own extended DAC registers 16..31 (Part 22), settling Part 19's own lead statically. |
| Portrait/scene animation | `PIC.DAX`, `PIC2..6.DAX` | A third packing: 5 consecutive per-row 1-bit planes (LSB plane first, MSB-first bits), pixels preceded by a category-selected 17/33/41-byte prefix structure. Multi-frame blocks: full planar5 XOR-delta tail frames vs frame 0, under 14-byte headers. | **SOLVED — single-frame byte-exact vs the live-captured loader buffer (Part 17); multi-frame XOR-delta animation decoded with lossless round-trip (Part 18). All 74 blocks decode. Prefix structure decomposed into category-bitmask components (Part 18); component meanings + DAC 18..31 RGB still open.** |

Net verdict for the corpus route's `surface: "exploration-vga-fallback"` tag (the
concrete consumer this leaf's `tools/goldbox_corpus_routes.json` entry names via
`tiles_file`/`walldef_file`): **the "fallback" label is misleading for exploration —
that surface's own graphics data is genuinely EGA-style, not a downgrade.** The
"VGA-fallback" description only applies to a *different* graphics family (splash/scene
pictures, plus the newly-resolved CPIC/BODY icon families) that exploration doesn't use.

## Part 1 — exploration tile/wall data: proven already-correct

`8X8D2.DAX` blocks decompress to the exact same `{height=8, width_div8=1}` 8-byte
tile-strip header CoK/DoK use (`docs/dax-format.md` §4b), with payload length
`8*tileCount + 1` bytes. Five of Gateway's seven `8X8D2.DAX` blocks are exactly 2257
bytes — the same size as several of CoK's own `8X8D1.DAX` blocks (281 tiles) — and all
seven blocks' packed nibble values stay within 0..15 (verified: no byte in any block
implies a >15 palette index under the 4bpp packing rule). This is the same evidence
shape `dax-format.md` already uses to certify the EGA tile-strip format for CoK/DoK.

`WALLDEF2.DAX` blocks are all exactly 780 bytes = `WALLDEF_RECORD_SIZE` (5 depth slices
× 156 pool columns of *tile IDs*, not pixels — see `src/loaders/walldef.ts`'s own doc
comment). This decoder was never EGA/VGA-specific in the first place; it's a numeric
lookup table, and Gateway's own retail `WALLDEF2.DAX` is already exercised end-to-end by
the existing golden test (`packages/engine/test/dungeon.test.ts`, "golden Gateway ECL2
block 2", `it.skipIf(!haveGateway)`), which passes against real retail bytes.

**Conclusion: for the dungeon-exploration surface, there is no undiscovered VGA contract
to recover. The existing decoders are correct as-is; only the corpus route's `surface`
label ("...-vga-fallback") is misleading for this specific surface** (see "What this
does NOT change" below for why that label was left alone).

## Part 2 — splash/scene pictures: a genuine, new VGA-extended format

`TITLE.DAX` and `BIGPIC1.DAX` behave completely differently. Both use the same 17-byte
standard-frame header as CoK/DoK (`height`, `width_div8`, `y`, `x`, `item_count=1`,
8 bytes of `field_9`), and the SAME dimensions Gateway's own header claims (TITLE = 320×
200, matching CoK's own TITLE screen dimensions) — but the raw block is **much larger**
than the `17 + width*height/2` byte count that formula implies for plain 4bpp EGA data:

| File | Block(s) | Geometry | CoK-equivalent EGA size | Actual Gateway size | Extra |
| --- | --- | --- | ---: | ---: | ---: |
| `TITLE.DAX` | 1..5 (all 5) | 320×200 | 32017 | 40050 | 8033 |
| `BIGPIC1.DAX` | 126, 127 | 304×144 | 21905 | 27410 | 5505 |
| `BIGPIC1.DAX` | 129 | 192×83 | 7985 | 10010 | 2025 |
| `BIGPIC1.DAX` | 130 | 104×114 | 5945 | 7460 | 1515 |
| `BIGPIC1.DAX` | 131 | 160×82 | 6577 | 8250 | 1673 |
| `BIGPIC1.DAX` | 128 | 104×70 | 3657 | 4600 | 943 |

Every single one of these 11 blocks fits **exactly**:

```
raw_len == 17 + height*(width/2 + ceil(width/8)) + 33
```

with **zero slop** (`ceil(width/8)*height` is exactly the "extra" column above, minus a
constant 33). This is not a coincidence of one file — it holds identically across two
unrelated retail files with 6 different geometries. `packages/engine/src/loaders/dax.ts`'s
existing `parseStandardFrame` already rejects these blocks outright (its tolerance is
`payload - need <= 16` bytes; these blocks exceed that by 900-8000+ bytes), so **today
these blocks decode to `kind: 'complex', image: null` — nothing renders**, they don't
render with wrong colors. "Fallback" was never literally true for this family; "not
decoded at all" is the accurate present-tense description.

### The pixel-packing rule

Row-to-row byte autocorrelation on the raw bytes (adjacent-row similarity, the standard
technique for recovering an unknown raster stride) picks out a **200-byte row stride**
for TITLE's 320-wide frame far more cleanly than any other candidate (avg row-to-row
byte-difference fraction 0.0997 at stride 200, vs. 0.38–0.78 for strides 10/20/40/80/160/
320) — and `200 == width/2 (160, the base 4bpp row) + ceil(width/8) (40, one extension
bit per pixel)`. That is: **the base 4bpp plane and the 1-bit extension plane are
interleaved per scanline**, not stored as two separate whole-image planes. Decoding with
this interleave (vs. the naive "two whole planes back to back" layout) turns pure noise
into legible on-screen text ("...SOFTWARE", "...BEYOND"), confirming the hypothesis
visually as well as arithmetically.

So: pixel index = `base_nibble | (extension_bit << 4)`, 0..31 (5 bits, 32 colors) — the
same 4bpp chunky nibble packing CoK/DoK use for the low 4 bits, PLUS one MSB-first
extension bit per pixel packed 8-to-a-byte. A fixed 33-byte trailer follows the last row;
it is real per-frame data (its bytes differ block to block — verified non-constant across
the corpus), not padding, but its meaning is not identified.

**Plane order correction (2026-07-21):** the two planes are packed **extension-bit-plane
first, then the 4bpp nibble plane** for each row — not base-then-extension as originally
written up here. The autocorrelation evidence above (the 200-byte row stride) only fixes
*where rows start*; it says nothing about which half of a row is which plane, and the
original "produces legible text" claim was based on a coarse read of one cropped region,
not a full decode. Byte round-trip (decode → re-encode → identical) cannot disambiguate
the two orderings either — both are self-consistent permutations that round-trip
perfectly. The two were only told apart by actually decoding and rendering full frames
under both orderings (`packages/engine/test/_scratch_*` probes, not committed): the
base-then-extension order (this doc's original claim) produces a repeating, jumbled tile
pattern; extension-then-base produces cleanly legible real screen text across all 5
`TITLE.DAX` blocks — "STRATEGIC SIMULATIONS, INC.", "AN ADVANCED DUNGEONS & DRAGONS ...
FANTASY ROLE-PLAYING GAME VOLUME 1", "BEYOND SOFTWARE" (in the proven gold DAC-16/17
tones from the corroboration below — direct additional confirmation the palette
assignment is also correct), and a full credits roll (GAME DESIGN / PROGRAMMING / ART
DIRECTOR / ILLUSTRATION / MAP GRAPHICS / EXECUTIVE PRODUCER). `daxVgaPicture.ts` and its
test suite have been updated to the corrected order; the byte-count formula, row stride,
and DAC-register findings below are all unaffected by this correction (they only concern
row/frame boundaries and color values, not plane order within a row).

### Runtime corroboration: GAME.OVR sets VGA DAC registers beyond index 15

`GAME.OVR` (Gateway's FBOV overlay pool) contains genuine palette-programming machine
code with no counterpart in CoK/DoK's binaries. Exact bytes (all offsets are **file**
offsets into the retail `GAME.OVR`):

**A. Direct-port bulk DAC loader** (`0x51566`..`0x51585`) — bypasses the BIOS entirely
and writes the VGA DAC ports directly, guarded by a vsync wait:

```
0x51566: ba da 03           MOV DX, 03DAh        ; VGA Input Status Register 1
0x51569: ec                 IN  AL, DX
0x5156a: a8 08              TEST AL, 08h          ; bit 3 = vertical retrace
0x5156c: 74 f8              JZ  0x51566           ; spin until retrace begins
0x5156e: ba c8 03           MOV DX, 03C8h         ; DAC write-index port
0x51571: b3 12              MOV BL, 12h           ; = 18 decimal: FIRST register this loop programs
0x51573: 8a c3              MOV AL, BL
0x51575: ee                 OUT DX, AL            ; select DAC register (18 + n)
0x51576: 42                 INC DX                ; DX = 03C9h, DAC data port
0x51577: ac                 LODSB                 ; AL = [DS:SI], SI++
0x51578: ee                 OUT DX, AL            ; write red
0x51579: ac ee              LODSB; OUT DX,AL      ; write green
0x5157b: ac ee              LODSB; OUT DX,AL      ; write blue
0x5157d: fe c3              INC BL                ; next register
0x5157f: 4a                 DEC DX                ; DX = 03C8h again
0x51580: e2 f1              LOOP 0x51573          ; CX-controlled
0x51582: 1f 1f 17           POP DS; POP DS; POP SS
0x51585: c3                 RET
```

This is a genuine multi-register palette loader, starting at DAC register **18**, for a
caller-supplied count (`CX`) of registers, reading R/G/B triples from a caller-supplied
table (`DS:SI`). **The call site (which sets `CX` and `SI`) was not located this
session** — see "Open items" below; it would reveal exactly how many extra registers
Gateway loads and where the table lives (static in `GAME.OVR`/`GAME.EXE`, or read at
runtime from a DAX/other resource).

**B. A Pascal-callable BIOS wrapper + two directly-inlined calls**
(`0x51586`..`0x515c2`), using `INT 10h AX=1010h` ("Set Individual DAC Register"):

```
0x51586: 55                 PUSH BP
0x51587: 8b ec               MOV BP, SP
0x51589: 16 1e               PUSH SS; PUSH DS
0x5158b: 8b 5e 0c            MOV BX, [BP+0Ch]     ; param 1 = DAC register index
0x5158e: b8 10 10            MOV AX, 1010h        ; INT10h AX=1010h
0x51591: 8a 76 0a            MOV DH, [BP+0Ah]     ; param 2 = red   (6-bit DAC, 0..63)
0x51594: 8a 6e 08            MOV CH, [BP+08h]     ; param 3 = green
0x51597: 8a 4e 06            MOV CL, [BP+06h]     ; param 4 = blue
0x5159a: cd 10               INT 10h
0x5159c: 1f 17 5d            POP DS; POP SS; POP BP
0x5159f: ca 08 00            RETF 0008h            ; far return, pop 4 word args

; direct call #1 — DAC register 16
0x515a2: 16 1e               PUSH SS; PUSH DS
0x515a4: bb 10 00            MOV BX, 0010h         ; register 16
0x515a7: b8 10 10            MOV AX, 1010h
0x515aa: b6 3c               MOV DH, 3Ch            ; red   = 0x3C = 60
0x515ac: b5 30               MOV CH, 30h            ; green = 0x30 = 48
0x515ae: b1 10               MOV CL, 10h            ; blue  = 0x10 = 16
0x515b0: cd 10               INT 10h

; direct call #2 — DAC register 17
0x515b2: bb 11 00            MOV BX, 0011h          ; register 17
0x515b5: b8 10 10            MOV AX, 1010h
0x515b8: b6 3c               MOV DH, 3Ch            ; red   = 0x3C = 60
0x515ba: b5 24               MOV CH, 24h            ; green = 0x24 = 36
0x515bc: b1 10               MOV CL, 10h            ; blue  = 0x10 = 16
0x515be: cd 10               INT 10h
0x515c0: 1f 17               POP DS; POP SS
0x515c2: cb                  RETF
```

Registers 16 and 17 are indices reachable **only** when the extension bit is set (base
nibble 0 or 1 with the extension bit on) — exactly consistent with the pixel-packing
rule derived independently from byte counts above. No `INT 10h`/DAC-register code of any
kind exists in CoK's or DoK's binaries.

6-bit-DAC → 8-bit RGB (`round(v*255/63)`). Note this is a **DAX VGA-extension** palette, which
really is 6-bit; the HLIB `TILE` colour table is NOT, and takes no scaling at all
(`docs/hlib-format.md` §2). This sentence used to claim HLIB "already uses" the same scaling.

- Register 16: `(0x3C,0x30,0x10)` → **RGB(243,194,65)**
- Register 17: `(0x3C,0x24,0x10)` → **RGB(243,146,65)**

Both are warm gold/orange tones, plausible for torch-light or metallic highlight colors
in a title/scene picture.

## Implementation

**Wired into `decodeDax`'s default dispatch (2026-07-21):** `dax.ts`'s `decodeDax` now
tries `parseVgaExtendedPicture` as a fallback right after the plain-EGA `parseStandardFrame`
check fails, before the animated/tileset paths — a new `DaxBlock.kind: 'vga-ext-frame'`
classification, `blk.image` populated via `vgaExtendedPictureToIndexedImage`. Previously
this decoder was only reachable by calling `daxVgaPicture.ts` directly (as the test suite
did); any general caller of `decodeDax`/`decodeAsset` (e.g. `apps/web/src/ui/intro.ts`'s
title-sequence player) now gets real Gateway art instead of `kind: 'complex', image: null`.
Full engine suite (155 files / 1794 tests) still passes — the fallback's strict exact-byte
gate never double-matches a plain EGA block (proven negative control in
`dax-gateway-picture-families.test.ts`).

`packages/engine/src/loaders/daxVgaPicture.ts` — new, additive decoder (does not modify
or replace `dax.ts`'s existing EGA path):

- `vgaExtendedPictureByteLength(width, height)` — the proven exact-fit formula, doubling
  as the format's strict self-verifying detection gate.
- `parseVgaExtendedPicture(raw)` — decodes to 0..31 palette indices per pixel using the
  interleaved-row rule above, or returns `null` if the exact byte count doesn't fit.
- `encodeVgaExtendedPicture(pic)` — the inverse, used purely for the parity proof below.
- `buildGatewayVgaExtendedPalette()` — EGA16 for 0..15, the two proven registers for
  16/17, and `null` (the model's standard "undefined by this source" convention) for
  18..31 — no invented colors.

### Parity proof (no independent VGA reference renderer exists for this format)

`packages/engine/test/dax-vga-picture.test.ts`, run against real retail bytes
(`it.skipIf` gated, like every other Gateway-golden test in this repo):

1. Every block in `TITLE.DAX` and `BIGPIC1.DAX` matches `vgaExtendedPictureByteLength`
   exactly.
2. **Round-trip**: `encodeVgaExtendedPicture(parseVgaExtendedPicture(raw))` reproduces
   the ORIGINAL retail bytes byte-for-byte (header fields 0..8 and everything from byte
   17 onward — `field_9`, bytes 9..16, is not recovered by this decoder and is excluded
   from the comparison, documented as such). This is the strongest parity statement
   available without an external renderer: it proves the packing rule is exactly and
   losslessly correct, straight from retail bytes.
3. **Negative control**: CoK's own `TITLE.DAX` and `BIGPIC1.DAX` (committed in-repo)
   never match this format — proving detection can't be accidentally firing on plain EGA
   data.
4. The two proven extended-DAC colors are asserted present; indices 18..31 are asserted
   `null` (not guessed).

All tests pass; full engine suite (144 files / 1598 tests) passes with no regressions.

## Open items (honestly UNLOCATED — do not invent)

- ~~**The call site for the direct-port bulk loader** (`0x51566`) was not traced — its
  `CX` (register count) and `SI`/`DS` (source RGB table) are unknown.~~ **Addressed
  2026-07-17 — see Part 4.** There is no separate call site (it's straight-line fallthrough);
  `CX=14` and `SI=0xA108` are proven, plain compile-time constants (verified not present in
  descriptor 42's VROOMM fixup table); the first register is `0x12` (18 decimal), so the bulk
  loop covers registers `0x12..0x1F` (18..31) — all 16 "extra" DAC register indices (16..31)
  are now fully enumerated. ~~**Still open:** the live `DS` segment is a genuine VROOMM
  relocation entry … so the actual RGB **values** for registers 18..31 remain UNLOCATED.~~
  **CLOSED 2026-08-11 — see Part 21.** The values were never findable as a static table
  because there is no table: `DS:0xA108` is a work buffer the game refills per picture from
  24 nibble-packed bytes in the picture block itself. See Part 4 for the trace evidence that
  correctly bounded the problem, and Part 21 for the resolution.
- The 33-byte per-frame trailer's meaning is **partly** identified: its last 24 bytes are the
  picture's own extended palette (Part 21). The remaining 9 bytes, and the equivalent
  remainders of the 17- and 41-byte variants, are still unidentified — confirmed non-constant,
  so real data, not padding.
- `BIGPIC3.DAX`, `BIGPIC4.DAX`, `BIGPIC5.DAX` (siblings of the tested `BIGPIC1.DAX`)
  were not tested, though there is no reason to expect them to differ.
- Treasures of the Savage Frontier (the sibling P3.3 title) was not examined; nothing
  here should be assumed to carry over without its own retail-byte check.
- ~~`PIC*.DAX`, `CPIC*.DAX`, `CBODY.DAX`, `CHEAD.DAX`, and any animated/"complex" blocks
  were not tested against this format at all.~~ **Addressed 2026-07-17 — see Part 3.**
  Most of these families are now resolved either way; `PIC*.DAX` specifically remains
  open as a genuinely distinct, only-partially-characterized third packing.

## Part 3 — PIC/CPIC/CBODY/CHEAD/COMSPR/BODY/DUNGCOM: resolving the remaining families (2026-07-17)

This section closes out the "not tested against either format" gap left by Part 2.
Method: identical to Part 1/2 — decode every real retail block in each family under
both existing decoders (`dax.ts`'s plain-EGA path and `daxVgaPicture.ts`'s VGA-extended
path) and require the byte-count formula to reconcile with **zero slop**, then
decode→re-encode and require an exact byte match against the original retail bytes.
Source: the same Gateway GOG install as Part 1/2, plus the repo's committed
`Champions of Krynn/` DAX files (`CBODY.DAX`, `CHEAD.DAX`, `COMSPR.DAX`, `CPIC1..3.DAX`,
`DUNGCOM.DAX`, `BODY2/3.DAX`, `PIC1..3.DAX`) as negative controls / plain-EGA baselines.
Full test suite: `packages/engine/test/dax-gateway-picture-families.test.ts`.

### Resolved: plain EGA (no VGA extension)

| File | Blocks | Geometry | Formula | Result |
| --- | ---: | --- | --- | --- |
| `CBODY.DAX` | 128/128 | 24×24 | `17 + 24·24/2 = 305` | Zero-slop match on every block; round-trips exactly. |
| `CHEAD.DAX` | 56/56 | mixed (16×15 / other small sizes) | `17 + w·h/2` | Zero-slop match on every block; round-trips exactly. |
| `COMSPR.DAX` | 26/28 | 24×24 (same as CBODY) | `17 + 24·24/2 = 305` | Zero-slop match; round-trips exactly. **2 blocks (id 254, 255) are unresolved — see below.** |
| `DUNGCOM.DAX` | 1/1 (25-tile array) | 24×24 ×25 | `17 + 25·(24·24/2) = 7217` | Exact same formula and byte count as CoK's own `DUNGCOM.DAX`; round-trips exactly. |

`CBODY.DAX`'s 305-byte size is a meaningful negative result, not just "small": Gateway's
own `CPIC*.DAX` uses the SAME 24×24 geometry in VGA-extended form at exactly 410 bytes
(`17 + 24·(12+3) + 33`). 305 vs 410 for identical dimensions is the same kind of
"extra bytes present or absent" signal Part 2 used for `TITLE.DAX`/`BIGPIC1.DAX` — here
it points the other way (CBODY has NO extension plane, CPIC does), confirming the split
is real and not an artifact of tolerance in the size check.

`COMSPR.DAX` blocks 254 and 255 (58 and 50 bytes) have an all-zero geometry header
(`height=0, width_div8=0, y=0, x=0`, only `item_count=1` nonzero) and are rejected by
every decoder outright — this is the SAME "still-unsolved variant" `dax.ts`'s own module
doc already flags for COMSPR mini-records, not a new mystery. Left open, honestly.
**(Resolved 2026-07-23 — see Part 19: they are pixel-less planar5 structure records.)**

### Resolved: VGA-extended (`daxVgaPicture.ts`)

| File | Blocks | Geometry | Result |
| --- | ---: | --- | --- |
| `BODY.DAX` | 13/13 | 88×48 | Zero-slop match on every block; round-trips exactly. |
| `CPIC2.DAX`..`CPIC6.DAX` | 154/154 | 24×24, 48×24, 24×48 (mixed per block) | Zero-slop match on every block; round-trips exactly. |

Negative control: CoK's own `CPIC1..3.DAX` (a different, lower-numbered file range —
Gateway's CPIC family starts at `CPIC2`) decode entirely as plain-EGA `'frame'` blocks
and never satisfy the VGA-extended formula, confirming detection isn't firing on the
`CPIC*` filename alone.

### Unresolved: `PIC.DAX`, `PIC2.DAX`..`PIC6.DAX` — a third, only partially-characterized packing

Unlike every family above, `PIC*.DAX` does **not** cleanly resolve to either known
format. 73 of 74 blocks across the 6 files are rejected outright by both existing
decoders. Byte-level investigation (manual header/hex inspection, not guesswork)
established the following REAL, reproducible facts, none of which add up to a clean
zero-slop formula for the whole family:

1. Every block begins with a **1-byte frame count**, exactly like `dax.ts`'s EXISTING
   plain-EGA `parseAnimatedPicture` container shape (`ANIM_FRAME_HEADER` = 21 bytes per
   frame: `u32 delay, u16 height, u16 width/8, u16 x, u16 y, u8[8] field`). This is the
   SAME header layout CoK's own `PIC1..3.DAX` mouth-animation blocks use (verified: CoK's
   `PIC1..3.DAX` all decode as `kind: 'animated'` under the existing decoder,
   zero exceptions) — so the container shape itself is not new, only what's inside it.
2. The frame count is **1** for 73 of 74 blocks; exactly **one** block (`PIC.DAX` id 29)
   has frame count **6** (a genuine multi-frame block).
3. For every frame-count-1 block, frame 0's header decodes to **height=88, width8=11**
   (an 88×88 portrait) with **zero exceptions** across all 6 files.
4. Reading frame 0's pixel region under the SAME interleaved 4bpp-plane + 1bpp-extension
   row packing `daxVgaPicture.ts` uses for `TITLE`/`BIGPIC`/`BODY`/`CPIC` consumes
   **exactly** `88·(11·4 + 11) = 4840` bytes with zero slop, for every one of those
   blocks — the interleave rule itself clearly still applies here.
5. What follows that 4840-byte region is **not a fixed length**. Across `PIC.DAX`'s 16
   frame-count-1 blocks: 14 end with exactly **33** trailing bytes (the SAME constant
   Part 2 proved for `TITLE.DAX`/`BIGPIC1.DAX`'s per-frame trailer) and 2 end with
   exactly **17** trailing bytes. `PIC3.DAX` additionally has 2 blocks ending with **41**
   trailing bytes. No byte anywhere in the shared 21-byte frame header (including the
   8-byte `field` tail) was found to predict which length applies — bit-by-bit comparison
   of the header bytes between a 33-trailer block and a 17-trailer block shows no shared
   flag.
6. One block, `PIC3.DAX` id 2 (3894 bytes total), does not fit the 4840-byte VGA-extended
   hypothesis **at all** — it is 968 bytes short of even the bare minimum
   (`1 + 21 + 4840 = 4862`). It matches EXACTLY (zero slop) if frame 0 is instead read as
   **plain, non-extended** EGA pixel data (`88·11·4 = 3872` bytes:
   `1 + 21 + 3872 = 3894`) — and this is in fact the ONE block across the whole
   74-block corpus that the existing plain-EGA `parseAnimatedPicture` decoder accepts
   outright (`kind: 'animated'`). So this family may **mix** plain-EGA and VGA-extended
   pixel encodings within the same animation-header container, on a criterion not
   identified this session.
7. The one genuine multi-frame block (`PIC.DAX` id 29, frame count 6) does not reconcile
   at either the 4840-byte (VGA-extended) or 3872-byte (plain-EGA) per-frame stride once
   frame 1's header is read at the resulting offset — both give obviously-garbage field
   values (e.g. `height=4097`). Whatever governs frame boundaries in a genuine
   multi-frame `PIC*.DAX` block is unresolved by this session.

**Verdict: `PIC*.DAX` is left OPEN.** Per this project's "UNLOCATED beats invention"
ethic, no trailer-length formula or frame-selection rule is guessed. The reproducible
sub-facts above are pinned as real, checkable test assertions in
`dax-gateway-picture-families.test.ts` (which documents them via passing assertions of
ONLY the provable facts — not a claimed decode/round-trip of the whole format), so future
work has a precise, byte-accurate starting point rather than needing to re-derive this
from scratch. A plausible next step (not attempted here): compare the two 17-trailer
blocks' and 41-trailer blocks' RAW BYTES directly against a differently-shaped candidate
(e.g. a second small VGA-extended sub-frame, or a variable-length compressed trailer)
rather than assuming a fixed-format trailer at all.

## Part 4 — bulk DAC loader: call site, register count/indices proven; live DS segment UNLOCATED (2026-07-17)

This section closes out Part 2's "Open items" call-site gap for the **direct-port bulk DAC
loader** (`GAME.OVR+0x51566`..`0x51585`). Method: static disassembly (Capstone, 16-bit real
mode) of the surrounding bytes, cross-checked against `tools/vroomm_layout.py`'s VROOMM
fixup-table classifier, followed by a new DOSBox-X dynamic trace,
`tools/trace_gateway_vga_dac_bulk_loader.ps1`, reusing the exact seek/post-read technique
`gateway-descriptor9-runtime-bytematch.md` already proved (`BPINT 21 42` catches every VROOMM
descriptor seek; the loader's post-read return address is a fixed `CS:(EIP_at_seek + 0x12)`
offset) plus a new execution-breakpoint phase modeled on
`gateway-operand-parser-execution-probe.md`. Source: the same hash-locked
`build/runtime-gateway-base-clean-20260715` stage every other Gateway trace in this project
uses (`GAME.EXE`/`GAME.OVR` SHA-256 verified before every run). Zero synthetic keypresses in
any run.

### Result summary

| Question | Answer | Confidence |
| --- | --- | --- |
| Is there a separate call site (setting CX/SI) elsewhere in `GAME.OVR`? | **No** — it is straight-line fallthrough code immediately before the loader, no `CALL` involved | Static, certain |
| Register count (`CX`) | **14 (0x0E)** | Static, certain (plain immediate, verified NOT in descriptor 42's fixup table) |
| Source table offset (`SI`) | **0xA108** (relative to the DS resolved below) | Static, certain (plain immediate, verified NOT in descriptor 42's fixup table) |
| First register programmed | **0x12 (18 decimal)**, so the bulk loader covers registers **0x12..0x1F (18..31 decimal)** | Static, certain (plain immediate at `GAME.OVR+0x51571`) |
| All 16 "extra" DAC register **indices** (16..31) now accounted for | **Yes** — 16,17 (direct calls, Part 2) + 18..31 (bulk loop, this section) = exactly 16 | Proven |
| Source table **segment** (`DS`) | **UNLOCATED** — genuine VROOMM relocation entry, not statically resolvable | Confirmed as a real gap, not guessed |
| Register **values** for 18..31 | ~~**UNLOCATED** — blocked entirely on the DS gap above~~ **CLOSED 2026-08-11, Part 21** | The `DS` gap was real but not load-bearing: `0xA108` is a work buffer, refilled per picture from the block's own bytes, so the values live in the data files rather than in the executable at all |

### Static finding: no separate call site — it's fallthrough, and CX/SI are compile-time constants

Disassembling `GAME.OVR+0x51559`..`0x51565` (relative offset `0x1814`..`0x1820` inside VROOMM
descriptor 42 — `ovr_file_offset=0x4FD45`, `code_size=0x1A23`, `fixup_size=70` bytes / 35
entries, per `tools/gen1_map.py`'s `scan_descriptors`) shows the "call site" the earlier
session couldn't find is not a call at all — it's the straight-line block immediately
preceding the loader entry, falling through with no jump:

```
0x51559: 1e              PUSH DS
0x5155a: b8 c7 04        MOV AX, 0x04C7        ; segment -- SEE BELOW, this is a VROOMM fixup
0x5155d: 8e d8           MOV DS, AX
0x5155f: be 08 a1        MOV SI, 0xA108         ; table offset -- plain constant, not a fixup
0x51562: b9 0e 00        MOV CX, 0x000E         ; register count = 14 -- plain constant, not a fixup
0x51565: fc              CLD
0x51566: ba da 03        MOV DX, 0x03DA         ; <- bulk loader entry (Part 2's documented start)
        ...
0x51571: b3 12           MOV BL, 0x12           ; first DAC register = 18 decimal (plain constant)
```

`tools/vroomm_layout.py`'s fixup classifier (`classify_fixup`) was run directly against
descriptor 42's own 35-entry fixup table (parsed straight from the retail file:
`overlay[0x4FD45+0x1A23 : 0x4FD45+0x1A23+70]`, sorted `u16` code-relative offsets). Result:
offset `0x1816` (the `MOV AX, imm16` operand word) **is** one of the 35 entries — confirming
this specific immediate is a genuine to-be-relocated VROOMM segment reference, not a real
segment number as shipped in the file. Offset `0x181B` (the `MOV SI, imm16` operand) and the
`MOV CX, imm16` / `MOV BL, imm8` operands are **not** in the fixup table — i.e. `SI=0xA108`,
`CX=0x0E`, and the first register `0x12` are proven, ordinary compile-time constants with no
runtime dependency at all. This closes the entire register-count/source-offset/first-register
half of the "call site was not traced" gap from Part 2 using nothing but static bytes plus the
already-existing fixup-table tooling — no DOSBox-X needed for this part.

Combined with Part 2's proven direct-call registers 16/17, **all 16 of the "extra" DAC
register indices (16..31) are now accounted for and closed**: 2 via the two inlined
`INT 10h AX=1010h` calls, 14 via this bulk loop. The leaf's "16 extra DAC registers" count is
no longer a guess about how many exist — it is exactly right, and now fully enumerated by
index.

### Dynamic finding: the live DS segment is a genuine, still-open gap

`0x04C7` is not the real runtime segment — it's the file's pre-relocation placeholder for a
VROOMM `mov_reg_segment_immediate` fixup (per the classifier above), so only a live trace can
reveal what it resolves to. Two techniques were tried, both reproduced twice
(`build/dosbox-x-gateway-vga-dac-20260717-r2`, `-r3`; a first attempt,
`-20260717`, is superseded — it had a PowerShell `-shl`-on-`[byte]` truncation bug in the
byte-reassembly arithmetic that manufactured a false "fixup applied" reading of `0x00C7`; the
corrected script casts to `[int]` before shifting):

**Technique A — data-only preload/post-read dump** (the same technique that produced
`gateway-descriptor9-runtime-bytematch.md`'s "byte-identical" result): `BPINT 21 42`, wait for
the seek matching descriptor 42's own file offset (`0x4FD45`, observed at seek index 43 of the
sequential 51-descriptor preload, both runs), set the proven `CS:(EIP+0x12)` post-read
breakpoint, then dump the just-populated shared VROOMM buffer (segment `1B37`, both runs,
consistent with every other Gateway descriptor trace in this project) at the setup block's own
relative offset (`0x1814`). Result, both runs: the **entire** 128-byte region — including the
fixup word itself — reads back **byte-identical to the raw, un-relocated retail `GAME.OVR`
file** (`region_dump.exact_match_vs_retail_file: true`, `fixup_word.observed_runtime_word:
0x04C7` = the raw file word, unchanged). **This means the sequential 51-descriptor
"preload" pass observed during silent startup is a pure file-to-buffer copy — it does NOT
apply VROOMM fixups inline.** This is a genuine, useful correction/clarification to how
`gateway-descriptor9-runtime-bytematch.md`'s "byte-identical" result should be read: that
doc's six named 128-byte windows simply never happened to cross a `mov_reg_segment_immediate`
fixup offset, not that this preload pass performs real relocation. Real fixup application
(needed for the code to actually work) must happen through a *different* code path — most
likely the real VROOMM call-stub triggered by an actual invocation of the descriptor, not this
readahead/caching sweep.

**Technique B — genuine CS:IP execution capture** (modeled on
`gateway-operand-parser-execution-probe.md`): from the same post-read stop, `BPDEL *` (clear
the still-armed `BPINT 21 42` so it doesn't keep re-firing for descriptors 44..51 and waste the
hit budget — a lesson learned from this session's own first pass, which spent its entire
80-hit budget on already-understood seek/read stops), arm a genuine execution breakpoint at
`1B37:0x1821` (the loader's own first instruction, `MOV DX, 0x03DA`), `RUN` with **zero**
synthetic keypresses, and poll up to a 100-second window / 60-hit cap. Both reproductions:
**zero hits** — the emulator ran completely freely for the entire window without ever
fetching an instruction at that address. This is a clean, bounded, reproduced negative result,
not a timeout ambiguity (deterministic 0/0 across two independent runs, same seek sequence,
same destination segment both times).

**Conclusion: the real DS segment (and therefore the actual RGB values for registers 18..31)
remains UNLOCATED.** Unlike the operand-parser probe (which found execution reaching a
*related but different* routine at its target address), this probe found **no execution
reaching the target address at all** during ordinary silent startup within the tested budget.
The most likely explanation, consistent with this project's established pattern for
gameplay-gated code (`gateway-operand-parser-execution-probe.md`'s own conclusion for a
different but structurally analogous descriptor): loading the extended DAC palette for
registers 18..31 is plausibly tied to displaying a *specific* picture that pure silent
title/attract sequencing never reaches (the two already-proven direct-call registers 16/17 are
inlined separately and could easily fire for the title screen alone, while the bulk
loop — covering nibble values 2..15 with the extension bit set — may belong to a different,
later-reached VGA-extended picture, e.g. a `BIGPIC`/`CPIC` scene gated behind a keypress or a
save file). Per `docs/engine/HANDOFF.md` §5 ("UNLOCATED beats invention") and this project's
explicit "no guessed-key search" boundary (`gateway-operand-parser-execution-probe.md`'s own
citation of that rule), this gap is left open rather than force-fit with a guessed segment or
an invented palette.

### Opportunistic trailer check (not solved, kept honest)

While decoding trailers for this section, all 5 `TITLE.DAX` block trailers and 6
`BIGPIC1.DAX` block trailers were dumped and inspected for a palette-table shape (33 bytes =
11 RGB triples was considered, given the proven RGB-triple packing this format already uses
elsewhere). Result: **no clean palette shape found.** Three `TITLE.DAX` trailers are
uniform constant runs (two are all `0xFF`, one is all `0x00` — 33/33 identical bytes each);
the fourth is high-entropy with only 13/33 bytes in the 6-bit DAC range (`<=63`); the fifth
(`0x00` run) is trivially in-range by coincidence, not by structure. `BIGPIC1.DAX`'s two large
(304x144) blocks are high-entropy (27/33 unique bytes, no run structure); its four smaller
blocks are mostly long `0x00`/`0xFF` runs with a handful of flipped bytes at scattered
positions — a shape more consistent with a bitmask (33 bytes = 264 bits) than an RGB table,
but this is an unconfirmed impression, not a proven format. **Left open, as instructed** — no
formula is claimed.

## What Part 4 does NOT change

- No change to `packages/engine/src/loaders/daxVgaPicture.ts` or its tests. The only new,
  byte-level-provable facts this session adds (register count 14, table offset 0xA108,
  register index range 18..31) describe a source **table**, not a decoded pixel/palette value
  — there is still no real RGB data for registers 18..31 to add to
  `GATEWAY_VGA_EXT_DAC`/`buildGatewayVgaExtendedPalette`, so per this project's "byte-level
  retail evidence backing every change" rule, the decoder is intentionally left untouched.
- `gateway-descriptor9-runtime-bytematch.md` itself is not edited — its six named-role
  byte-match claims are unaffected (they never crossed a fixup word) — but its "byte-identical"
  framing should now be read alongside this section's clarification that the shared preload
  pass performs no inline relocation, for anyone relying on that doc to infer fixups are
  generally applied during silent-startup preload.
- New tool: `tools/trace_gateway_vga_dac_bulk_loader.ps1`. No existing tool was modified.

## Part 5 — navigated-picture-display probe: still UNLOCATED, front-end + early chargen ruled out (2026-07-17)

Part 4 left one theory untested: the bulk DAC loader (`1B37:0x1821` this run, resolved
fresh — see below) might only execute when a specific picture is actually **displayed**,
not during passive/silent boot. Part 4's own execution-breakpoint capture never drove any
keypresses, so it could only rule out silent attract-mode, not real navigation. This round
tests the "behind a displayed picture" theory directly by scripting genuine keypress
navigation through Gateway's front end and re-arming the same execution breakpoint.

### Technique

A prerequisite, `tools/recon_gateway_frontend_nav.ps1`, first mapped a bounded, fully
screenshot-verified navigation path with **zero invented input and no save file**: every
one of Gateway's front-end/character-creation screens accepts a bare ENTER to take its
already-highlighted default choice. This is new, useful information for Gateway (which
otherwise has "no statically-mapped front-end dispatcher" per
`gateway-newgame-route.md`/`gateway-operand-parser-execution-probe.md`) and satisfies this
project's "no unbounded guessed-key search" boundary since the full 8-key sequence was
screenshot-confirmed before being scripted as a fixed replay.

The main script, `tools/trace_gateway_vga_dac_navigated.ps1`, combines Part 4's Phase 1
(the `BPINT 21 42` seek/post-read anchor that resolves the loader's live destination
segment fresh every run — **`1B37`, matching Part 4 exactly**, with the setup+loader
region byte-identical to the retail file) with a new Phase 2: instead of a zero-keypress
free run, it arms a real execution breakpoint at `1B37:0x1821` and then drives the proven
8-key ENTER sequence one key at a time via DOSBox-X's GameLink v4 shared-memory channel
(`tools/dosbox_gamelink.py press enter` / `screenshot`), polling up to 8s per step for a
breakpoint hit before sending the next key.

**Mid-round correction (GameLink focus + concurrency safety):** the coordinator flagged
two issues that changed the script after its first draft. First, all keypress delivery had
to go through GameLink's shared-memory protocol, not host `SendKeys`/window-focus tricks —
this project runs many concurrent DOSBox-X sessions and a focus-stealing window corrupts
every other session's input, a known problem documented in
`docs/engine/research/dosbox-x-gamelink-automation.md`. Second, and more seriously, a
sibling agent (working the Gateway save-acquisition thread in parallel) independently
discovered that DOSBox-X 2026.07.02's GameLink transport uses **hardcoded, non-process-
scoped shared-memory names** (`DWD_GAMELINK_MMAP_R4`/`DWD_GAMELINK_MUTEX_R4`): when two
GameLink-master sessions run at once — routine in this project's multi-agent workflow —
they can **silently** return one agent's screenshot/status/peek data to a different
agent's client, with no error at all. This is corroborated firsthand: this round's own
launched DOSBox-X process was twice killed mid-run by unrelated collisions with a
concurrent `dok-position-setter-*` trace also declaring `gamelink master=true`. Mitigation
added to `trace_gateway_vga_dac_navigated.ps1`: an `Assert-OwnDosboxSession` guard, called
before and after every keypress/screenshot, that (a) confirms this script's own launched
PID is still alive, (b) confirms no *other* `dosbox-x.exe` PID exists concurrently, and (c)
sanity-checks each screenshot's reported frame size against Gateway's known 640x400. Any
violation throws rather than silently trusting the capture. Per the coordinator's third
correction, cleanup was also re-verified to kill only the script's own launched PID
(`Stop-Process -Id $process.Id`), never DOSBox-X by process name — this script already did
so correctly.

### Result: negative, but the probed range is now much larger than "silent boot"

One clean run (of the two attempted; the first failed on VROOMM-seek contention from a
concurrent session and was discarded, not counted as a negative result) completed with
**zero identity-check failures throughout** — no foreign GameLink PID was ever detected
during the successful capture, so the negative result below is trusted, not a symptom of
cross-agent corruption. Screenshots (`build/gateway-vga-dac-navigated-20260717-a2/nav-step-*.png`)
confirm the real, actually-displayed screen sequence (note: raw GameLink screenshots carry
an always-zero alpha byte — a latent cosmetic bug in `tools/dosbox_gamelink.py`'s
`write_png()` that makes them render blank in standard viewers; not fixed here since it's
shared infrastructure outside this task's scope, but the RGB channels are correct and were
manually decoded to verify content):

| Step | Screen actually displayed | Breakpoint hit? |
| --- | --- | --- |
| boot | SSI logo splash | — |
| 1 | AD&D FORGOTTEN REALMS title screen (the colorful picture containing the already-proven registers 16/17 colors) | no |
| 2 | "GATEWAY V1.2 PLAY DEMO" banner | no |
| 3 | CHOOSE A FUNCTION main menu (CREATE NEW CHARACTER / ADD CHARACTER TO PARTY / LOAD SAVED GAME / ...) | no |
| 4 | PICK RACE | no |
| 5 | PICK GENDER | no |
| 6 | PICK CLASS | no |
| 7 | PICK ALIGNMENT | no |
| 8 | full character stat-roll review screen ("STATUS OKAY, MALE AGE 55, LAWFUL GOOD FIGHTER DWARF, LEVEL 2 ... REROLL STATS? YES NO") | no |

(The step labels baked into `tools/trace_gateway_vga_dac_navigated.ps1`'s `$NavSteps`
array and its output JSON — `title-to-logo`, `logo-to-credits1`, etc. — were carried over
from the earlier host-input recon pass and turned out to be off by one screen against what
the GameLink-driven run actually displayed, e.g. the labeled "credits1-to-versionbanner"
step's screenshot is really the main menu, and "pickclass-to-pickalignment" is really the
stat-roll review screen. The table above reflects the screens as manually verified from
the actual screenshot pixel content, not the stale labels. The script/JSON labels are left
uncorrected in place, since the byte evidence (breakpoint hit/no-hit, per numbered step) is
unaffected by the label text — a future pass touching this script should relabel `$NavSteps`
before reuse.)

**The bulk DAC loader was never reached across any of the 8 steps.** This rules out
Gateway's entire pre-game front end and initial character-creation flow — including the
one colorful title-screen picture and the full stat-roll review screen — as the trigger.
The live `DS` segment for the loader, and therefore the RGB values for registers 18-31,
**remain UNLOCATED**. This narrows, but does not close, Part 4's "behind a specific
picture" theory: whatever triggers this loader (if it is picture-gated at all) is further
into the game than this round reached — deeper into character creation past the stat-roll
screen (name entry, portrait pick, spell selection for casters, etc.), or an actual
in-world/travel `BIGPIC`-family scene, either of which needs more navigation depth or a
real save file to reach. Per this project's "UNLOCATED beats invention" rule, no guessed
segment or invented palette is substituted.

Only a single clean run was obtained this round (not the project's usual 2x-reproduction
convention) — sustained concurrent DOSBox-X contention from other agents made a second
attempt impractical within this round's time budget. The single run's own internal
evidence (byte-identical setup region vs. retail, matching `1B37` destination segment
matching Part 4's finding on a completely independent resolution, zero identity-check
throws) is treated as sufficient to report the negative result, but a second confirming
run is still open for whoever picks this up next.

## What Part 5 does NOT change

- No change to `packages/engine/src/loaders/daxVgaPicture.ts`, `dax.ts`, or any tests —
  pure research, no new palette or pixel data to add.
- `tools/dosbox_gamelink.py`'s `write_png()` alpha=0 bug (screenshots render blank in
  standard viewers, though the underlying RGB data is intact and was manually verified via
  a scratchpad PNG parser) is noted here but deliberately **not fixed** in this round —
  it's shared multi-agent infrastructure outside this task's file-scope, and any fix should
  go through whoever owns that tool to avoid colliding with concurrent users.
- New tools: `tools/recon_gateway_frontend_nav.ps1`, `tools/trace_gateway_vga_dac_navigated.ps1`.
  No existing tool was modified.
- `docs/engine/research/gateway-save-acquisition.md` and
  `tools/inventory_gateway_save.py`/`tools/stage_gateway_runtime.py` (a sibling agent's
  parallel work this round) were read for reference only, never edited.

## Part 6 — `PIC*.DAX` trailer-length header-field predictor found; pixel packing still genuinely UNLOCATED (2026-07-17, round 2)

This section follows up Part 3's "genuinely UNLOCATED" verdict for `PIC*.DAX`
(portrait mouth-animation), pursuing the four concrete angles the coordinator flagged as
not-yet-tried: (a) treat the trailing 33/17/41 bytes as a second image, (b) find a header
field that predicts which trailing length applies, (c) check whether frames after frame 0
in the one multi-frame block use a smaller stride, (d) cross-reference CoK's own
already-solved multi-frame `PIC1..3.DAX` stride. Pure static byte analysis (Python,
`tools/dax_decode.py`'s container/RLE routines reused directly, no DOSBox-X, no new tool
files) against the same real retail `PIC.DAX`/`PIC2..6.DAX` (74 blocks total) used by
Part 3. Result: **(b) and (c) make real, zero-slop, testable progress; (a) is ruled out
with concrete evidence; (d) was checked and clarifies the contrast rather than resolving
Gateway's case.** The pixel-packing question Part 3 originally posed remains genuinely
open — this round narrows it precisely rather than closing it.

### (b) SOLVED: an exact, zero-exception trailer-length/pixel-format predictor

Every animation-header frame record has a `u8[9]`-ish tail immediately before the pixel
region (`dax.ts`'s `ANIM_FRAME_HEADER` layout: `pos+12`..`pos+21`, i.e. the 9 bytes right
before `pixOffset = pos + 21`; the module comment's "`u8[8] field`" undercounts by one —
there is no separate 1-byte pad between `y` and `field`, the tail is 9 bytes). The SECOND
byte of that tail (absolute offset `pos+13`, i.e. `raw[14]` for a `numFrames===1` block
where `pos=1`) is an **exact, zero-exception categorical predictor** of frame 0's pixel
encoding AND trailer length, verified against **all 73 of 73** `numFrames===1` blocks
across the full 6-file corpus (`PIC.DAX`, `PIC2..6.DAX`):

| Byte value | Meaning | Count | Formula |
| --- | --- | ---: | --- |
| `0x00` (0) | frame 0 is **plain EGA** (no extension plane), **zero-byte trailer** | 1 | `1 + 21 + height·width8·4` bytes total (`= 3894` for the one observed `PIC3.DAX` id 2 block) |
| `0x0c` (12) | frame 0 is **VGA-extended** (interleaved 4bpp+1bpp), **17-byte trailer** | 13 | `trailer = 17 + 8·(byte-12) = 17` |
| `0x0e` (14) | frame 0 is **VGA-extended**, **33-byte trailer** | 57 | `trailer = 17 + 8·(byte-12) = 33` |
| `0x0f` (15) | frame 0 is **VGA-extended**, **41-byte trailer** | 2 | `trailer = 17 + 8·(byte-12) = 41` |

`1 (numFrames) + 21 (frame header) + 4840 (VGA-extended pixel region, when applicable) +
trailer(byte)` reproduces the EXACT total block length for every one of the 73 blocks,
with **zero exceptions** — no block's byte1 value falls outside `{0, 0x0c, 0x0e, 0x0f}`,
and no block's total length deviates from the formula by even one byte. This closes Part
3's open item #5 (predicting which of the three trailer lengths applies) AND its item #6
("the family may mix plain-EGA and VGA-extended pixel encodings... on a criterion not
identified" — the criterion is this same byte: `0x00` selects plain EGA, any of
`{0x0c,0x0e,0x0f}` selects VGA-extended). The `17 + 8·(byte-12)` linear form fits all 3
observed nonzero values exactly, but only 3 distinct nonzero values exist in the retail
corpus — treat the *linear* shape as an unconfirmed-but-consistent observation, and the
*categorical* byte→length mapping (which is what's actually asserted in the test suite)
as the proven fact.

**This does NOT mean `PIC*.DAX` decodes.** It means the exact byte boundaries of frame
0's pixel region and trailer are now fully predictable from a header field — a real,
useful, testable fact about the container's shape — but the PIXEL CONTENT inside that
predicted 4840-byte region still does not decode to a coherent image under any tested
packing rule (see below). Per this project's "UNLOCATED beats invention" rule, no decoder
was added to `daxVgaPicture.ts`/`dax.ts`; this fact is pinned only as passing test
assertions (byte-arithmetic, not a claimed image decode) in
`dax-gateway-picture-families.test.ts`.

### (a) RULED OUT: the trailer is not a second, differently-shaped image

Byte-content inspection (dumping the 33/17/41-byte trailers for every block) rules this
out on two independent grounds:

1. **Structural**: none of 33/17/41 factors into a plausible small-picture geometry under
   either the plain-EGA (2 px/byte) or VGA-extended (2 px/byte + 1 bit/byte) packing this
   project already uses. 17 and 41 are both prime — halved pixel counts (34, 82) only
   factor into degenerate 2×N or N×2 shapes, never a square-ish portrait sub-region. 33
   does factor reasonably (e.g. 24×11 or 6×11 at 2 px/byte), but interpreting the first 9
   bytes of a 33-byte trailer as a miniature `parseStandardFrame`-style header (`height,
   width_div8, y, x, item_count`) produces nonsense values (`height=43034`,
   `width_div8=42143`, etc.) — not a valid nested picture header.
2. **Content**: dumping the 33-byte trailer for every `0x0e`-category block (57 of them)
   shows it varies block-to-block with no shared structure beyond occasional long
   `0x00`/`0xff` runs — consistent with Part 4's own prior "bitmask-shaped, not a clean
   palette/image" impression for `TITLE.DAX`'s same-length trailer, not a second image.

### (c) PARTIAL: the multi-frame block's frame-boundary stride is now known exactly (but not its pixel meaning)

`PIC.DAX` id 29 (the corpus's one `numFrames===6` block, 29165 bytes) was the one case
Part 3 could not make any per-frame stride reconcile. Brute-force header-pattern search
(scan every byte offset after frame 0 for one that decodes to `height=88, width8=11,
x=0, y=0` — the header shape proven constant for every frame-0 in the corpus) finds
**exactly 4 hits**, evenly spaced **4854 bytes apart**, landing at the block's own end
with **zero remainder**:

```
frame 0: offset 1     (field9 byte1 = 0x0e -> VGA-extended, 33-byte trailer, per (b) above)
frame 1: offset 4895  (= 1 + 21 + 4840 + 33; frame 0's own predicted stride, exactly)
frame 2: offset 9749  (= frame1 + 4854)
frame 3: offset 14603 (= frame2 + 4854)
frame 4: offset 19457 (= frame3 + 4854)
frame 5: offset 24311 (= frame4 + 4854)
frame 5 end: offset 29165 == raw.byteLength EXACTLY (24311 + 21 + 4833 = 29165)
```

So: frame 0 uses the `(b)`-proven 4894-byte span (21-byte header + 4840-byte VGA-extended
pixels + 33-byte trailer), and frames 1-5 EACH use a uniform, different 4854-byte span
(21-byte header + 4833-byte payload) — confirmed by 4 independent exact landings, not a
single coincidental match. This is real, zero-slop progress on "how many bytes does each
frame occupy" — Part 3's item #7 is now half-answered (boundaries known; content is not).
Frame 1's own header-tail byte1 is `0x04`, a value that never occurs in any
`numFrames===1` block — so frames 1-5's 4833-byte payload is a **different, genuinely
distinct sub-format** from frame 0's (not simply frame 0's format at a smaller size: 4833
does not equal `height·(width/2+ceil(width/8))` for any height ≤ 88 at width 88, nor
`height·width8·4` for the plain-EGA case). Its internal structure (pixel packing, or
whether it even IS pixel data) is UNLOCATED.

### (d) Checked: CoK's own multi-frame `PIC1..3.DAX` stride, for contrast

CoK's own multi-frame mouth-animation blocks (e.g. `PIC1.DAX` id 23, 8 frames) use a
uniform **3894-byte stride for EVERY frame including frame 0** (`1 + N·3894` bytes total,
zero remainder for every multi-frame block checked) — i.e. every frame is a full,
independent, plain-EGA 88×88 image (`21 + 3872` bytes), no cropping, no trailer, no
special-cased frame 0. Gateway's block 29 does NOT extend this pattern analogously: its
frame 0 is a different size from frames 1-5 (4894 vs 4854), unlike CoK where all frames
are identical. This rules out "Gateway just adds a VGA extension to CoK's uniform
multi-frame layout" as the explanation and confirms frames 1-5 are doing something
genuinely different from frame 0, not just reusing its packing at the same size.

### Pixel-packing hypotheses tested and ruled out for frame 0's 4840-byte region

Using `PIC.DAX` id 1 (a `0x0e`-category, 4895-byte block) as the primary test case, with
CoK's own `PIC1.DAX` id 1 (known-good plain-EGA render, a coherent draconian-face image
with clean flat-color regions and intentional dither bands) as the "what a correct decode
looks like" reference, the following packings were implemented and rendered; **all
produce visual noise** (scattered per-pixel color changes, no flat regions), qualitatively
unlike the CoK reference:

- The proven `daxVgaPicture.ts` interleaved-per-row layout (44-byte 4bpp base plane + 11-
  byte 1bpp extension plane per scanline) — the same rule that decodes `TITLE`/`BIGPIC1`/
  `BODY`/`CPIC2..6` correctly. Top rows show a plausible dark hood/collar silhouette;
  everything below degrades to noise.
- The same interleaved layout with the base/extension plane order swapped, and with the
  4bpp nibble order swapped (low nibble = left pixel) — both noise.
- Two-whole-plane layout (full 3872-byte base image, then a separate full 968-byte
  extension-bit image) — noise (~48% of pixels land in the unproven 18-31 DAC range,
  itself informative: too high a fraction for a natural skin-tone highlight).
- Classic 4-bitplane EGA "planar" layout (row-interleaved, 4×11-byte planes per row),
  tried MSB-first and LSB-first bit order, and ALL 24 permutations of plane-to-bit-position
  assignment (verified by a pixel-smoothness metric, not just visual spot-checks) — the
  clearest of any hypothesis tried (a recognizable coarse hood/face silhouette persists
  across every permutation, meaning the "shape" signal is real) but never resolves to
  flat, dithered-not-random color regions the way the CoK reference does.
- Whole-image-per-plane (plane 0's entire image, then plane 1's, etc., not row-
  interleaved) — pure noise, worse than the row-interleaved planar variant.
- Byte-interleaved-by-8-pixel-column-group (4 plane bytes per column group, not per full
  row) — noise.

**Verdict: pixel packing for `PIC*.DAX`'s VGA-extended-sized region remains genuinely
UNLOCATED.** The byte-count/boundary question (b, c) is real, closed progress; the pixel
semantics question Part 3 originally posed is not. No decoder is added; no palette or
pixel-packing claim is made. Future work should pursue the row-interleaved 4-bitplane
lead first (it's the only hypothesis that produced a recognizable macro-shape at all) —
possibly combined with a bit-plane ORDER that varies per block (unlikely, given the
byte1-driven format looks fully determined) or a genuinely different plane grouping
(e.g. 2 planes of 2 bits each, or the extension plane interleaved at a different
granularity than once-per-row) not yet tried.

### What Part 6 does NOT change

- No change to `packages/engine/src/loaders/daxVgaPicture.ts` or `dax.ts` — this round
  found real boundary/byte-arithmetic facts but no decodable pixel format, so per this
  project's "byte-level retail evidence backing every change" rule, no decoder or palette
  code is added.
- `packages/engine/test/dax-gateway-picture-families.test.ts` gains new assertions for
  the (b) trailer-length predictor (all 73 single-frame blocks, not just the 16 in
  `PIC.DAX` the prior round checked) and the (c) multi-frame boundary stride for block 29
  — both are byte-arithmetic facts, not image-decode claims. The existing "UNRESOLVED"
  framing for `PIC*.DAX` is kept; it is sharpened, not reversed.
- `docs/engine/BUILD-QUEUE.md`'s P3.1 leaf gains a new dated bullet describing this
  narrowing; the leaf's fallback is correspondingly still NOT removed (correctly — no
  pixel decode exists to remove it for).
- No new tool files. All analysis this round was ad-hoc Python run directly (via `python3
  - <<EOF`) reusing `tools/dax_decode.py`'s existing container/RLE functions; nothing was
  added under `tools/`.

## Part 7 — executable-oracle pass: PIC*.DAX loader located, multi-frame XOR-delta confirmed by disassembly; single-frame pixel packing STILL UNLOCATED (2026-07-21)

Fresh, time-boxed follow-up to Part 6, per the coordinator's explicit ask to try the
executable-oracle technique this doc's own Part 3/6 never applied to `PIC*.DAX` itself
(Part 4/5 disassembled the *DAC-loader*, a different code path entirely). Static disassembly
only (Capstone, 16-bit real mode) against the user's local Gateway `GAME.OVR`; **no DOSBox-X**.

### Ruled-out hypotheses from Part 6 (read first, not repeated here)

Per this session's own mandate, the 7 already-ruled-out pixel-packing hypotheses for frame
0's 4840-byte region are: (1) the proven `daxVgaPicture.ts` interleaved-per-row layout
(extension-plane-then-4bpp-base, per row), (2) the same with base/extension plane order
swapped, (3) the same with the 4bpp nibble order swapped, (4) a two-whole-plane layout (one
full 3872-byte base image, then one full 968-byte extension-bit image), (5) classic 4-bitplane
EGA planar layout, row-interleaved, in both MSB-first and LSB-first bit order and all 24
plane-to-bit-position permutations, (6) the same planar layout in whole-image-per-plane form,
(7) byte-interleaved-by-8-pixel-column-group. Also ruled out: the 33/17/41-byte trailer being
a second, differently-shaped image (Part 6 (a)). None of these were re-tried this round.

### New finding: the real `PIC*.DAX` loader is located, by filename-string proximity

`GAME.OVR` contains the literal Pascal-length-prefixed string sequence `\x03PIC\x05FINAL
\x04.dax\rPIC not found` at file offset **`0x46862`** (`"PIC not found"` itself at
**`0x46871`**) — i.e. the resource name `PIC`, a second name `FINAL`, the `.dax` extension
suffix, and the loader's own file-not-found error string, sitting contiguously the same way
Borland Pascal string constants precede the function that uses them (the same pattern this
session's sibling investigation found for Treasures' `8x8d0`/`8x8d1` table in
`docs/engine/research/treasures-8x8d1-thirdformat.md`). Immediately following, at file offset
**`0x4687e`**, is a real Pascal-calling-convention function (`push bp; mov bp,sp; ...`) —
traced in full to its `retf 0xc` at `0x46d1f`.

### Confirmed by disassembly: the frame-header field READ ORDER matches `dax.ts`'s existing assumption

The function reads, in order, a 4-byte field (`lcall ...,0x1683` with length `4` —
consistent with `dax.ts`'s `ANIM_FRAME_HEADER`'s `u32 delay`), then two 2-byte fields
(length `2` each — consistent with the header's `u16 height` and `u16 width_div8`). This is
the first *executable-derived* (not byte-arithmetic-derived) confirmation that Gateway's
`PIC*.DAX` frame header really does share `dax.ts`'s existing 21-byte
`ANIM_FRAME_HEADER` field order, independently corroborating Part 3's original byte-count
proof from a completely different angle (the game's own field-by-field read sequence, not an
after-the-fact fit).

### Confirmed by disassembly: a genuine per-byte XOR-delta loop, gated on "is this the first parsed frame"

At **`0x46c15`-`0x46c41`** is an unambiguous, textbook XOR-delta-decode loop:

```
mov ax, [bp-0x20]            ; i
les di, [bp-0x1e]            ; ES:DI = referenceBuf (saved from the FIRST frame — see below)
add di, ax
mov dl, es:[di]              ; dl = referenceBuf[i]
les di, [bp-0x2a]            ; ES:DI = curBuf (this frame's just-read bytes)
add di, ax
mov al, es:[di]              ; al = curBuf[i]
xor al, dl                   ; al ^= referenceBuf[i]
mov es:[di], dl              ; curBuf[i] = result            (via dl after the mov dl,al above)
cmp ax, [bp-0xaa]            ; loop while i <= count-1
jne 0x46c12
```

Immediately upstream (`0x46bd1`-`0x46bfb`), the code branches on the running frame-index
counter at `[bp-0x13]` (initialized to `1`, incremented once per loop pass at `0x46a2b` — this
is the file format's own 1-based frame index): **if this is frame index 1** (the FIRST parsed
frame), the just-read buffer is copied verbatim into a newly-allocated "reference" buffer
(`lcall 0x343,0x23f` then `lcall 0x343,0x1683`) and a flag (`[bp-0x24]`) is set; **for every
other frame index**, the XOR loop above runs the current frame's buffer against that saved
reference buffer, in place.

**This is the same frame-0-XOR-delta convention `dax.ts`'s own `parseAnimatedPicture`
already implements for CoK's `PIC*.DAX` family** (`isPic`/`animXor`, `xorDelta && f > 0 ...
delta[i] = pixels[i] ^ frame0[i]`) — confirmed here, independently, straight from Gateway's
own compiled code, for Gateway's `PIC*.DAX` too. This is a genuinely new fact (Part 3/6 never
established this; they only characterized frame 0's byte boundaries and frames 1-5's
*different, still-undecoded* 4833-byte payload shape for the one multi-frame block,
`PIC.DAX` id 29). It does not by itself decode frame 0's base pixel packing — the open
question Part 6 posed — but it is real, useful, disassembly-verified progress on the
*animation-wrapper* semantics, and a plausible partial explanation for why frames 1-5's
header-tail byte (`0x04`, per Part 6 (c)) differs from every frame-0 value (`0x00`/`0x0c`/
`0x0e`/`0x0f`): a fifth categorical value for "this is an XOR-delta-encoded non-reference
frame," consistent with, though not proven equal to, the byte this session located.

### Not resolved this round (left open, not guessed)

- **The exact byte-count formula the loader uses for a frame's read length was found but not
  reconciled.** The buffer length passed to the read call (`[bp-0x22]`) is computed as
  `header_field_A * header_field_B`, then left-shifted by 3 (`shl ax, 3`, i.e. `× 8`) at
  `0x46b9e`-`0x46ba8`. Substituting Part 3's proven `height=88, width8=11` gives `88 × 11 × 8
  = 7744`, which does **not** match either of Part 3's proven single-frame byte counts (4840
  VGA-extended or 3872 plain-EGA) under any straightforward reading. Either the two header
  fields read into this computation are not literally height/width8 at the point this
  multiplication runs (the function reuses several `bp`-relative temporaries across branches;
  their exact identity at this specific instruction was not independently confirmed by
  tracing every prior assignment), or the resulting count is measured in a different unit
  (e.g. bits feeding a bit-level unpack elsewhere, not bytes fed to this particular read call).
  Per this project's "UNLOCATED beats invention" rule, no interpretation of this formula is
  asserted as fact — it is recorded here only as a concrete, falsifiable lead for whoever
  continues this.
- **The routine that actually unpacks frame 0's pixel bytes into on-screen pixels was not
  located.** This session's traced function reads raw bytes from disk and (for frames 2+)
  XORs them against frame 1's raw bytes — both operate on the file's raw byte stream, not
  decoded pixel indices, so this loop cannot itself be the pixel-packing spec Part 6 sought.
  The actual unpack most likely happens in a callee this function invokes (candidates include
  the far calls at `0x343:0x254`, seen 3 times in this function, and `0x149:0x57`/`0x149:0x3e`)
  or in a separate blit routine invoked later by the caller — neither was disassembled this
  round.

### What Part 7 does NOT change

- No change to `packages/engine/src/loaders/daxVgaPicture.ts`, `dax.ts`, or any test — this
  round found real control-flow/structural facts (frame-header field order, multi-frame
  XOR-delta relationship) via disassembly, but no decodable single-frame pixel format, so per
  this project's "byte-level retail evidence backing every change" rule, no decoder or
  palette code is added.
- No new tool files. All disassembly this round was ad-hoc Python (`capstone`, already a
  project dependency per `tools/disasm_cok.py` and siblings) run directly against the file,
  reusing no new infrastructure.
- `docs/engine/BUILD-QUEUE.md`'s P3.1 leaf is not edited by this round; its existing
  "pixel packing inside those exact boundaries remains genuinely unresolved" framing is
  accurate and unchanged by this doc's Part 7.

## Part 8 — full loader disassembly, buffer-length contradiction reconciled, 2 new pixel-packing hypotheses ruled out, segment 0x343/0x149 resolution still UNLOCATED (2026-07-21, round 2)

Fresh, time-boxed follow-up to Part 7, continuing both of its open threads. Method: a
**complete** Capstone disassembly of the `PIC*.DAX` loader function (`GAME.OVR` file
`0x4687e`-`0x46d1f`, all 472 instructions — Part 7 only spot-read fragments), plus its two
sibling near-call helper routines (`0x46d22`, `0x46d93`) and the adjacent `BODY.DAX`
loader (`0x46dd6`, string-anchored the same way as `PIC`/`FINAL`, located by finding
`\x04HEAD\x0ehead not found\x04BODY` immediately after `PIC*`'s own `retf`). Three
independent static segment-resolution techniques were then tried against the specific
selector values this function calls (`0x343`, `0x149`, `0x150`, `0x157`, `0x168`). Static
disassembly and Python byte analysis only; **no DOSBox-X** (per this round's mandate — the
slot was held elsewhere).

### Ruled-out hypotheses from Parts 6/7 (read first, not repeated here)

The 7 pixel-packing hypotheses Part 6 ruled out, plus Part 6(a)'s trailer-as-second-image
rule-out, are unchanged and not re-tried (see Part 7's own recap). This round adds 2 more
(below) and does not revisit the 7.

### New finding: `0x343:0x4df` is the Borland RTL per-procedure entry hook — explains its 4007 project-wide occurrences

`0x343:0x4df` is the **first** far call in every function this round disassembled (the
`PIC*.DAX` loader itself, both its near-call helpers, and the `BODY.DAX` loader), always
in the exact idiom `mov ax, <locals_size>; lcall 0x343, 0x4df; sub sp, <locals_size>`
(`sub sp` sometimes elided for zero-local functions). A whole-file scan of `GAME.OVR`
for the raw call bytes (`9a df 04 43 03`) finds **1052 occurrences, 1052/1052 (100%)
immediately preceded by a Borland prologue** (`55 89 e5` or `55 8b ec`) within 10 bytes,
and 804/1052 (the ones with nonzero locals) followed by a `sub sp` within 3 bytes. This is
conclusive: `0x343:0x4df` is a universal per-procedure entry hook (almost certainly a
Borland Pascal stack-overflow/heap check, called with `AX` = local-variable byte count),
**not** anything picture-specific. This directly explains
`vroomm-fixup-layout.md`'s existing finding that segment `0x343` alone accounts for 4007
of Gateway's 7321 total `LCALL` fixups (55%, more than the entire 1971-strong
`public_stub_owned` bucket combined) — segment `0x343` is the Borland RTL/System unit,
called from virtually every function in the program, not a picture-family utility
segment. This reframes Part 7's open item #2 (locating the pixel unpack callee): most of
this function's ~10 calls to segment `0x343` are generic RTL primitives (see below), and
only 1-2 offsets are candidates for anything picture-specific.

### New finding: the field-read sequence is now fully traced to its actual destination locals, closing the "not independently confirmed" caveat from Part 7

Part 7 read the frame-header field order from the call *argument sizes* (4, 2, 2) without
tracing which `bp`-relative local each field's value lands in. This round traces the full
call site for all 5 `0x343:0x1683` (`BlockRead`-style file-read) calls inside the per-frame
loop (`0x46a51`-`0x46b2c`) and confirms, from the actual `lea di, [bp-N]` destination
operand pushed as each call's second argument:

| Field | Call site | Requested count | Destination local | Running offset after |
| --- | --- | ---: | --- | ---: |
| `delay` (u32) | `0x46a51` | 4 | *(cache-struct field only)* | 4 |
| `height` (u16) | `0x46a6d` | 2 | `[bp-0x16]` | 6 |
| `width_div8` (u16) | `0x46a89` | 2 | `[bp-0x18]` | 8 |
| `x` (u16) | `0x46b06` | 2 | *(allocated-buffer field only)* | 10 |
| `y`-plus-pad | `0x46b27` | 2 | *(allocated-buffer field only)* | **13** |

The last row is the one genuinely new fact: the call requests 2 bytes (matching a `u16 y`)
but the running byte-offset counter (`[bp-0x12]`) advances by **3, not 2**, afterward
(`0x46b2c`: `add word ptr [bp-0x12], 3`). Total after 5 reads = `4+2+2+2+3 = 13`, and
`21 (full header) - 13 = 8` — i.e. this is disassembly-level, exact confirmation of Part
6(b)'s own caveat ("the module comment's `u8[8] field` undercounts by one — there is no
separate 1-byte pad between `y` and `field`, the tail is 9 bytes"): the 1-byte pad is real,
and it is consumed as part of the `y` field's own read, not as a separate field. `[bp-0x16]`
= height and `[bp-0x18]` = width_div8 are now traced facts, not inferred from call-argument
size alone as Part 7 left them — this matters for the next finding.

### New finding: a separate 59-byte "tail structure" cache/reuse mechanism, disassembly-confirmed, explains Part 6(c)'s `0x04` mystery byte

Immediately after the 5 field reads, at `0x46b30`-`0x46b40`, a call to **`0x149:0x5c`**
(args: the sequential read-buffer far pointer, `&[bp-0x12]` the offset counter by
reference, `&[bp-0x66]` an output local) reads/parses the frame's remaining header tail
into a 0x66-byte-sized local structure. Then, at `0x46b45`-`0x46b8e`:

```
cmp byte ptr [bp-0x66], 1        ; (actually: frame-index check, [bp-0x13]==1 -- see below)
je  save_as_reference
cmp byte ptr [bp-0x66], 4
jne skip
; else: this frame's parsed-tail byte0 == 4 -> COPY the SAVED reference structure
; ([bp-0xa2], populated when frame index 1 was first parsed) OVER this frame's own
; freshly-parsed [bp-0x66], via `lcall 0x343,0xa3d` (src, dest, count=0x3b=59) --
; confirmed as Move/memcpy by its 3-arg (src_far, dest_far, count) push pattern, matching
; every other 0x343:0xa3d call site in this function (all 59- or 24-byte block copies).
```

(The actual branch at `0x46b45` tests the running **frame index** `[bp-0x13]==1`, i.e.
"is this the reference frame"; the `[bp-0x66]==4` branch at `0x46b61` is the "reuse" case
for non-reference frames. Both branches call the same `0x343:0xa3d` Move primitive, just
with source/dest swapped.)

**Direct byte-level confirmation** (Python, `PIC.DAX` id 29, the corpus's one genuine
multi-frame block, already characterized by Part 6(c)): frame 0's real 9-byte tail is
`01 0e 10 32 54 76 98 ba dc` (byte1=`0x0e`, matching Part 6(b)'s predictor table), while
**all 5 of frames 1-5's raw tails are byte-identical**: `01 04 00 00 00 00 00 00 00` — a
degenerate, content-free sentinel, not frame-specific data. This is new, harder evidence
than Part 6(c) had (which only knew frame 1's byte1 was `0x04` and never occurred among
`numFrames===1` blocks): the file literally carries **zero real tail content** for
non-reference frames, just the `01 04` reuse marker, and the disassembly shows exactly
why — the real 59-byte parsed structure is reconstructed at runtime by copying frame 1's
cached copy, never re-read from frames 1-5's own (absent) tail bytes. This closes Part
6(c)'s "what does byte `0x04` mean" question with a real, disassembly-grounded answer
(previously only "a value that never occurs elsewhere" was known).

### Part 7's buffer-length contradiction, reconciled: `7744` is a fixed CHUNKY output-buffer capacity (`height×width`), not a raw file-read count

Immediately after the tail-structure handling, at `0x46b9e`-`0x46ba8`:

```
mov ax, [bp-0x16]        ; height (now independently confirmed, see above)
mul word ptr [bp-0x18]   ; × width_div8  -> ax = height*width_div8 = 88*11 = 968
shl ax, 3                ; × 8            -> ax = 7744
mov word ptr [bp-0x22], ax
```

Part 7 flagged this as an unreconciled contradiction (7744 matches neither the 4840-byte
VGA-extended nor the 3872-byte plain-EGA proven byte counts) and explicitly left both
operands unconfirmed. This round confirms both operands directly (height/width_div8
locals traced above) **and** notices the arithmetic identity that resolves the
contradiction: `height × width_div8 × 8 = height × (width_div8 × 8) = height × width =
88 × 88 = 7744` — **exactly one byte per pixel for the full 88×88 portrait.** This is not
a coincidence-prone reading: `968 = height × width_div8` is also exactly the 1bpp
extension-plane byte count Part 6 already established (11 bytes/row × 88 rows), and
`7744 = 968 × 8` is "room for 8 bitplanes at that pitch," which is numerically identical
to "one full byte per pixel." The value `[bp-0x22]` is then passed, together with the
tail-structure pointer and `width_div8` itself, as **separate arguments** to the
still-unlocated `0x149:0x57` call (`0x46bab`-`0x46bc6`: pushes the sequential-buffer
pointer, `&[bp-0x2a]` — Part 7's own "`curBuf`" out-parameter for the XOR-delta loop — by
reference, `&[bp-0x12]` the offset counter by reference, the `7744` length, `&[bp-0x66]`
the tail structure, and `width_div8`).

**Reconciliation (a real inference from these traced facts, not a new decode claim):**
`7744` is very unlikely to be "bytes to read from the file" (Part 3 already proved the
on-disk region is 4840 bytes for VGA-extended frames, zero slop, across 70 blocks) — it
reads far more naturally as **a fixed-capacity CHUNKY (1-byte-per-pixel, values 0..31)
output/allocation buffer size**, handed to the callee alongside the *actual* on-disk
format selector (the tail structure, carrying Part 6(b)'s exact byte1 predictor) and the
row pitch (`width_div8`) needed to unpack into it. This does not decode the pixel format
(still UNLOCATED — see below), but it does resolve Part 7's specific "these two proven
byte counts don't reconcile" complaint: they were never supposed to reconcile, because
`7744` measures the *decoded output*, not the *encoded input*. It also strengthens (without
proving) the working assumption that the final in-memory representation is a linear
8-bit-per-pixel index array — consistent with, though not requiring, the interleaved
4bpp+1bpp source layout `daxVgaPicture.ts` already uses for the sibling `BODY`/`CPIC`/
`TITLE` formats.

### 2 new pixel-packing hypotheses tried and ruled out (beyond Part 6's 7)

Motivated directly by the `7744 = height×width` finding above, two further packings were
implemented in Python and rendered against `PIC.DAX` id 1 (the same `0x0e`-category,
4895-byte test block Part 6 used), with the render pipeline itself independently sanity-
checked by re-rendering CoK's own reference `PIC1.DAX` id 1 through the identical script
(clean, coherent draconian-face output, confirming the harness is not the source of any
noise seen below):

- **Tightly-packed 5-bit-per-pixel bitstream, no plane separation** (MSB-first bit read
  across the whole 4840-byte region, 5 bits consumed per pixel, row-major fill). Exact
  byte-count match with zero slop (`4840 × 8 = 38720 = 88 × 88 × 5`), and structurally
  distinct from every one of Part 6's 7 hypotheses (all of which assume two
  byte-aligned, separately-packed planes; this one assumes no plane separation and no
  row-level byte alignment at all — the natural reading if the format is a raw indexed
  bitstream rather than a VGA-hardware-shaped plane layout). **Result: visual noise**,
  structurally indistinguishable from Part 6's row-interleaved-plane attempt (same
  macro-level vertical dark streaks, no flat/dithered color regions).
- **Row/column transposition of the already-proven-noisy interleaved-plane decode**
  (tests whether the image is stored column-major and being read row-major). **Result:
  noise**, same macro streak pattern.

Both renders are visually indistinguishable from each other and from Part 6's own
row-interleaved attempt — the same "vertical streak" macro-structure persists across
every hypothesis tried across both rounds (9 total now), consistent with Part 6's own
observation that this shape signal survives permutation but true per-pixel color
coherence never emerges. No decoder is added for either new hypothesis.

### Segment 0x343/0x149/0x150/0x157/0x168 resolution: 3 independent static techniques tried, all failed

With `0x343:0x4df` characterized as generic RTL (see above), the actually-interesting
picture-specific candidates are `0x343:0x254` (called 3×, once immediately after the
frame-1 XOR-delta loop and twice more at the function's tail — the strongest "commit /
blit" candidate) and `0x149:0x57` (the pixel-length-and-tail-structure consumer
identified above — the strongest "actual unpack" candidate). Three independent static
techniques were tried to resolve any of `0x343`/`0x149`/`0x150`/`0x157`/`0x168` to a real
`GAME.OVR` file address, and **all three failed**:

1. **`tools/vroomm_layout.py`'s verified cumulative-geometry selector model** (the same
   tool that reports Gateway `strict_status: verified` for its own 51-descriptor,
   7321-fixup corpus). Selector base `0x37`, geometry spans only `0x37`-`0x179` across
   the 51 known descriptors. All 5 target segments (`0x343`, `0x149`, `0x150`, `0x157`,
   `0x168`) fall outside that range and are classified `unresolved_relocated_segment` —
   consistent with, not contradicting, the tool's own already-published corpus number
   (5326 of Gateway's 7321 total `LCALL` fixups are in this same bucket; `0x343` alone,
   at 4007 sites, is most of it). This is a known, pervasive, already-documented
   project-wide gap (`docs/engine/research/vroomm-fixup-layout.md`), not something this
   session newly discovered or was likely to close with the same technique.
2. **`tools/gen1_map.py`'s legacy resident-stub-table model**
   (`MZ_HDR(0x200) + sel×16 + off - 1` → look for a `CD 3F <proc_off> <tag>` thunk in
   `GAME.EXE`, the model that resolves CoK/DoK's own cross-overlay calls in
   `disasm_cok.py`). Tried at the canonical skew (`-1`) and swept across `skew ∈
   [-16, +16]`: at most 2-3 of a segment's offsets land on a real `CD 3F` byte pair at
   any single skew value (never all of them, and the "hits" are exactly what would be
   expected by chance in a ~36KB file dense with `CD 3F` bytes) — no confident
   resolution for any of the 5 segments.
3. **CoK's own brute-force-base voting-by-prologue technique**
   (`disasm_cok.py`'s `_overlay_base_for_selector`: for every one of the 51 known
   descriptor bases, test `target = base + offset` for each of a segment's known call
   offsets and vote on which base makes the most targets land on a Borland prologue).
   Best result across all 5 segments: `0x343` scores 2/10 at one candidate base (and
   1/10 at a second); `0x149`, `0x150`, `0x157`, `0x168` score **zero** hits at every
   one of the 51 candidate bases. No confident resolution.

**Verdict: the actual pixel-unpack callee (`0x149:0x57` and/or `0x343:0x254`) remains
genuinely UNLOCATED at the code level**, though this round narrows its call signature
precisely (buffer pointer, output-length=7744, tail-structure pointer, row pitch) where
Part 7 only knew "some callee exists." Resolving segment `0x149`/`0x343` to real code
requires either a live DOSBox-X trace (unavailable this round — the slot was held
elsewhere) or reconstructing Gateway's actual RTL/resident-segment relocation model from
scratch (a project-wide undertaking well beyond `PIC*.DAX`, tracked by
`vroomm-fixup-layout.md`'s own existing 5326-unresolved-fixup gap, not a new item this
round created).

### What Part 8 does NOT change

- No change to `packages/engine/src/loaders/daxVgaPicture.ts` or `dax.ts` — still no
  decodable single-frame pixel format for `PIC*.DAX`, so per this project's rule, no
  decoder or palette code is added.
- `packages/engine/test/dax-gateway-picture-families.test.ts` gains one new assertion
  (the frame-1..5 degenerate-tail byte-identity fact for `PIC.DAX` id 29) — a
  byte-arithmetic/content fact, not an image-decode claim.
- No new tool files. All analysis this round was ad-hoc Python (Capstone disassembly and
  direct byte inspection), reusing `tools/vroomm_layout.py`, `tools/gen1_map.py`, and
  `tools/dax_decode.py`'s existing container/RLE routines without modifying any of them.
- `docs/engine/BUILD-QUEUE.md`'s P3.1 leaf is not edited by this round; its existing
  "pixel packing inside those exact boundaries remains genuinely unresolved" framing is
  accurate and unchanged.

## What this does NOT change

- `docs/dax-format.md`'s existing EGA container/RLE/nibble-packing/header documentation
  is unaffected and still fully describes CoK/DoK (and, per Part 1 above, Gateway's own
  tile/wall art). A cross-reference to this doc has been added there (§4d).
- `tools/goldbox_corpus_routes.json`'s `gateway-to-the-savage-frontier.surface` field
  (`"exploration-vga-fallback"`) and `tools/goldbox_corpus.py`'s gap logic that keys off
  it were deliberately left unchanged by this investigation — that field feeds generated
  evidence files consumed by `apps/web` (out of scope for this task) and other in-flight
  work; retitling it belongs to whoever owns that pipeline, informed by Part 1's finding
  above (the exploration surface's data is not actually a "fallback").
- No code path was removed. `dax.ts`'s EGA decoder is untouched; `daxVgaPicture.ts` is
  purely additive and is not wired into `decodeDax`'s dispatch, since it covers a
  different, separately-detected block family and its palette recovery is incomplete.
- Part 3 (2026-07-17) is likewise purely additive: no change to `dax.ts` or
  `daxVgaPicture.ts`, only a new test file,
  `packages/engine/test/dax-gateway-picture-families.test.ts`, that exercises the
  existing decoders against the previously-untested families. `PIC*.DAX`'s EGA
  `parseAnimatedPicture` fallback is correspondingly NOT removed or altered — it still
  correctly decodes the one plain-EGA block in that family
  (`PIC3.DAX` id 2) and correctly declines the rest.

## Part 9 — Unicorn dynamic-trace attempt: real segment-resolution confirmed for one selector, disproven as a general rule for another; front-end navigation genuinely blocked before reaching the loader (2026-07-21, round 3)

Time-boxed follow-up whose explicit mandate was to trace *into* the real `0x149`/`0x343`
callees via Unicorn CPU emulation (booting the actual `GAME.EXE`, not static analysis),
since Part 8 closed with all three static resolution techniques failing and the
DOSBox-X slot unavailable. New tool: **`tools/unicorn_gateway_pic.py`** (self-contained,
does not import or modify `tools/unicorn_dqk_trace.py`, used only as a structural
reference). No DOSBox-X was used this round either (still reserved elsewhere) — Unicorn
real-mode x86 emulation only, per the task's constraint.

### Harness built and proven capable of running the real `GAME.EXE`

`tools/unicorn_gateway_pic.py` MZ-loads the real retail `GAME.EXE` (no relocation entries
exist, `e_crlc=0`, confirmed), backs DOS file I/O (open/read/lseek/close/alloc/free/
resize, get/set-vector, DOS version, terminate, set-DTA) with the real retail
`GAME.OVR`/`.DAX` files, and — the key technique, novel versus the DQK harness this was
modeled on — turns **any interrupt number the game itself installs a vector for** (via
`INT 21h AH=25`) into a real push-FLAGS/CS/IP + jump-to-vector transfer, so the game's
*own compiled* Borland overlay manager (`INT 3Fh`, vector captured live as `1343:00d7`)
actually executes and does its own segment resolution, rather than the harness statically
guessing it. Three genuine DOS/BIOS emulation gaps were found and fixed along the way,
each a real infinite-loop hazard, not picture-format-specific:

1. **No BIOS timer tick simulation** — code polling `0040:006C` for the tick to advance
   spun forever. Fixed: an incrementing dword is written there every 2000 emulated
   instructions.
2. **No BIOS Data Area CRTC I/O base** (`0040:0063`, normally `0x3D4`) — left at zero, a
   CGA/VGA snow-avoidance retrace-wait loop polled invalid I/O port `0x0006` forever.
   Fixed: initialized to `0x3D4` at boot, plus a `UC_HOOK_INSN` handler on ports
   `0x3DA`/`0x3BA` that toggles the retrace status bit so `in al,dx; test al,1; je $-3`
   loops terminate.
3. **No mouse-driver model** — `INT 33h` was previously completely unhandled (a silent
   no-op leaving `AX`/`BX` as whatever they were before the call, unlike real DOS with no
   driver loaded). Added an explicit stub reporting "not installed" (`AX=0`) on any call.
   In practice **this was never exercised** — no `INT 33h` call was observed at all in any
   run this round — so it neither fixed nor caused the blocker below; recorded here only
   because it closes a real gap in the harness's DOS-environment fidelity.

With all three fixes in place the harness sustains ~1.2-1.5M emulated instructions/second
and runs tens of millions of instructions without crashing, hanging on an unmodeled trap,
or exhausting host memory.

### Confirmed: raw segment placeholder `0x343` resolves to `raw + load_seg` — cross-validated two independent ways

Booting for real (no keypresses needed — this happens automatically during program init,
`INT 21h AH=25` installing the `INT 3Fh` vector at instruction ~73,899, well before any
menu is drawn) and letting the real overlay manager run produced a live-captured call
`lcall 0x1343, 0x8b5` executing *after* the `INT 3Fh` vector had already been set to
`1343:00d7` — i.e., raw placeholder `0x343`, with `load_seg=0x1000`, resolves to live
segment `0x1343 = 0x343 + 0x1000`. This round adds a second, independent, static
cross-check: disassembling the *unrelocated* `GAME.EXE` image directly at physical address
`(0x343+0x1000)*16 + 0x4df = 0x1390F` (Python/Capstone, no emulation) produces **coherent,
sensible machine code** — real comparisons, byte moves, a `DS`-segment load of a small
constant (`0x4c7`), conditional returns with `CF`/`AL` set as status — fully consistent
with `0x343:0x4df` being the Borland RTL per-procedure entry hook Part 8 already
identified from 1052/1052 call-site-context evidence. Two independent methods (one live,
one static) now agree: **`live_segment = raw_segment + load_seg` is a real, correct
formula for segment `0x343` specifically.**

### Disproven: the same formula does NOT generalize to segment `0x149` (or, by implication, any other target selector)

The obvious next step — apply the same `raw + load_seg` formula to resolve the
Part 8-identified pixel-unpack candidate, `0x149:0x57`, entirely statically, with no
further emulation needed — was tried and **fails**. Disassembling `GAME.EXE` at the
predicted physical address `(0x149+0x1000)*16 + 0x57 = 0x114E7` produces **incoherent
garbage**: `aas`, `aaa`, `daa`, `bound`, misaligned `int 0x3f` bytes landing mid-stream,
no recognizable prologue, no sensible control flow — structurally identical to the kind
of noise that results from disassembling raw data or a wrong base address, not real code.
This is a genuine, useful negative result: it rules out "one universal additive constant
resolves every raw segment placeholder in this program" as a working model. The true
mechanism (consistent with descriptor `33`'s own 76-entry fixup table, `docs/engine/
research/vroomm-fixup-layout.md`) is an **in-place patch the overlay manager applies to
each descriptor's own code once, at load time**, using whatever real per-selector mapping
it keeps internally (not observed this round) — `0x343` happening to satisfy a simple
`+load_seg` relationship does not mean every other selector does. **Resolving `0x149`
still requires either watching a real load of descriptor 33 happen (see below, not
reached this round) or a from-scratch reconstruction of the overlay manager's actual
selector table — this round does not attempt the latter.**

### Genuinely blocked: front-end navigation never reaches a single `GAME.OVR`/`.DAX` file open

The plan was to reach the point where descriptor 33 (the `PIC*.DAX` loader,
`GAME.OVR` file offset `0x46718`-`0x47097`) gets loaded for real, by scripting `ENTER`
keypresses through a fake `INT 16h` model (matching Part 5's own finding that Gateway's
front-end screens take a bare `ENTER` for their default choice) far enough to reach
character creation or a portrait-picker screen. **This did not work.** Across every run
this round (up to 200,000,000 instructions in one case, and up to 500 scripted `ENTER`
presses in another), the harness never logs a single `GAME.OVR` or `*.DAX` file open —
not even the very first one. Diagnosis, in order tried:

- **Keyboard exhaustion was ruled out.** The initial hypothesis (the fake-key list running
  out and `INT 16h AH=0` then spinning on a stale/zero value) was falsified by comparing a
  40-key run against a 500-key run: both exhibit the **exact same** behavior at the exact
  same relative point — a perfectly periodic loop, `INT 16h AH=0` reads returning
  `key=0x1c0d` (Enter) every ~2,382-2,435 instructions, **every single read returning to
  the identical CS:IP** (`123e:031d`, confirmed by adding return-address logging and
  checking 80 consecutive reads — 100% identical). The game is not progressing through
  different screens between reads; it is stuck re-entering the same code path regardless
  of how many keys are available.
- **Mouse-detection gating was ruled out.** Added the `INT 33h` "not installed" stub
  described above on the theory that an un-modeled mouse-presence check might be leaving
  garbage in `AX`/`BX` and mis-routing the game into an interactive setup loop. No `INT
  33h` call was ever observed in any run — this is not the blocker.
- **What `123e:031d` actually is:** live-memory disassembly (Capstone against Unicorn's
  own memory, not the static file — self-relocating startup code makes raw file bytes
  stale at this address) shows the return point lands inside a **retrace-safe
  video-memory string/attribute-fill helper** (`0x12708`-`0x12732`: writes a
  repeated byte/attribute to `0xB800`-segment video memory `CX` times, using the same
  snow-avoidance `in al,dx; test al,1` idiom fixed above) — i.e., this is UI redraw code
  (plausibly a blinking cursor, highlighted-menu-item redraw, or "please wait" animation),
  not obviously the keyboard-read call site itself. Given the loop period (~2,380-2,435
  instructions) is close to, though not exactly, the harness's fake-tick advance interval
  (2,000 instructions), a **timing-dependent wait this harness's synthetic BIOS tick
  satisfies differently than real hardware** is one live theory; an **`INT 16h AH=1`
  "peek" edge-detection bug** (the harness's rearm-after-N-starved-polls model may not
  correctly reproduce a real make/break debounce a state machine depends on) is another;
  a **required keycode other than Enter** (the copy-protection-style prompts documented
  project-wide for this game family, or a typed-text field) is a third. None was
  distinguished from the others this round — this is an honest, unresolved gap in the
  harness, not a finding about the picture format.

### New, disassembly-confirmed detail on the loader's own argument-passing convention

While chasing the above, a full 472-instruction Capstone disassembly of the `PIC*.DAX`
loader (`0x4687e`-`0x46d1f`) was re-derived from scratch (Part 8 had already fully read
it once; this is an independent re-derivation that agrees with Part 8 throughout and adds
the following, which Part 8 did not spell out explicitly). The function's `retf 0xc`
epilogue confirms **exactly 12 bytes / 4 stack arguments**:

| Offset | Size | Read as | Role (inferred from usage) |
| --- | --- | --- | --- |
| `bp+6` | far ptr (4B) | `les di,[bp+6]` | Output **descriptor/record** pointer — cached into `[bp-0xa6]`/`[bp-0xa4]` and used throughout as a multi-field struct (`byte[0]`=frame count clamped to 6, `byte[1]`=flag, fields at `+4`,`+6`,`+9`,`+0x26` set by later code) — this is *not* the raw pixel buffer, it is a small header/state record the caller owns. |
| `bp+0xa` | word (low byte used) | `mov al,[bp+0xa]` | Passed on to `0x149:0x3e` / `0x149:0x48` calls — an unidentified small numeric parameter. |
| `bp+0xc` | word (low byte used) | `mov al,[bp+0xc]` | The **block/cache key** used for the function's early-exit "already loaded" check (compared against a cached 8-byte name at a fixed `DS` address and a global sentinel byte) and again passed to the `0x168:0x39` DAX-block-open call as the block id. |
| `bp+0xe` | far ptr (4B) | `les di,[bp+0xe]` | A pointer whose first 8 bytes are copied to a local and compared against a fixed cached-name string — most likely a filename/key used purely for the cache check, not touched again afterward. |

Also newly traced this round: the `0x168:0x39` call (`args: blockId=[bp+0xc], &status
out, &dataPtr out`) is the actual **DAX block fetch** — on failure (`status==0`) the
function draws a "not found"-style message box and aborts via `0x157:0x57` before ever
reaching the frame loop or `0x149:0x57`. This is a plain "open failed" error path, not
part of the pixel format. And the byte-XOR delta-apply loop Part 7/8 already established
was re-confirmed line-by-line in this pass at `0x46c12`-`0x46c41`
(`dest[i] ^= source[i]` for `i` in `0..[bp-0xaa]`, gated on frame index `!= 1`) — no new
information here, just an independent re-derivation that agrees exactly.

### What Part 9 does NOT change

- Same as Part 8: no change to `dax.ts` or `daxVgaPicture.ts` — the single-frame pixel
  packing remains genuinely **UNLOCATED**. No image was rendered this round; no buffer was
  ever captured (`loader_hits=0, retf_hits=0, buffers_captured=0` in every run). Per this
  project's "UNLOCATED beats invention" rule, no table-driven or guessed decoder is added.
- No test files added or modified.
- `tools/unicorn_dqk_trace.py` was read for structural reference only, never modified,
  staged, or imported.
- The new tool, `tools/unicorn_gateway_pic.py`, and its `build/gateway-pic-unicorn-
  smoke*.log` scratch output are committed as-is (the tool is reusable groundwork: it is
  the only harness in this project that boots Gateway's real `GAME.EXE` under emulation
  and lets its own overlay manager run); the smoke logs are debug artifacts of this
  investigation, kept for anyone continuing it rather than deleted.

### Concrete next steps (for whoever picks this back up)

1. **Diagnose the `123e:031d` loop directly**, e.g. by dumping the full register/stack
   state at each iteration (not just the return `CS:IP`) to determine whether the game is
   actually blocked on keyboard input at all, or on something else the loop merely polls
   incidentally (real hardware timer ticks, a DOS clock call, or an uninitialized global).
2. **Once any `GAME.OVR` read for the `PIC*.DAX` loader's own descriptor 33 is observed**,
   the harness's existing `_maybe_capture_desc33`/narrow-range code hook should
   automatically detect and trace it — this machinery is built and untested-in-anger, not
   a missing piece.
3. **Do not re-generalize the `0x343 → +load_seg` formula to other selectors** without a
   fresh, independent confirmation for each one (this round explicitly disproved that
   generalization for `0x149`) — a live-captured fixup-table patch (watching the actual
   bytes the overlay manager writes into descriptor 33's own code once it loads) is the
   only proven-reliable resolution method found so far.

## Part 10 — `123e:031d` loop misdiagnosed and resolved; two real DOS-emulation gaps fixed;
`GAME.OVR` opened for real for the first time; a new, later, still-UNLOCATED overlay-load
crash found (2026-07-22, round 4)

Follow-up to Part 9's own "concrete next steps," worked directly against
`tools/unicorn_gateway_pic.py` (extended in place, no new tool file; still self-contained,
still not importing/modifying `tools/unicorn_dqk_trace.py`). No DOSBox-X used (per this
round's constraint; the slot stayed reserved elsewhere). Net result: the original blocker
is fully explained and no longer blocks; the harness now genuinely reaches and opens
`GAME.OVR`; a **new**, later, different crash was found and is honestly left UNLOCATED —
descriptor 33 itself was still not reached this round.

### Step 1 result: the `123e:031d` loop was never "stuck" — it is a shared library call site, and Part 9's own diagnostic couldn't tell the difference

Added instrumentation (`_diag_int16_snapshot`, `--diag-loop` internal flag, wired into the
`AH=0x00` branch of `_on_int16`) that, on every `INT 16h AH=0` read, hashes the emulated
80×25 text screen (via a new `_read_video_text`/text-mode-video reader) and dumps full
register state. This immediately falsified Part 9's framing: **the identical return
`CS:IP` (`123e:031d`) does NOT mean the game is stuck on one screen.** Live disassembly of
the enclosing function (`123e:02fb`–`123e:030d`–`123e:031d`, freshly re-derived, capstone
against live Unicorn memory) shows it is a small, generic **`GetKey()`/`IsKeyAvailable()`
pair** — a shared low-level keyboard-input routine, and `123e:031d` is simply "the
instruction right after `int 0x16` inside that one shared routine." It is called from many
different higher-level screens (a text-input field editor at `0x012772`+, itself with
Emacs-style bindings — Backspace/^S, ^D/^F, Esc/^A, ^Z, Enter — confirmed by disassembly of
`0x012772`–`0x012817`). Seeing the same `CS:IP` on every read only proves the same
low-level primitive got called again; it says nothing about which higher-level screen
called it. Concretely: feeding `enter*2` + `"TEST"` + `enter` changed the on-screen hash
across DIAG#3–#8 in one earlier test run (before the video fix below made the picture
fully legible) while the *return address* stayed `123e:031d` throughout — direct proof
real progress was happening the whole time.

### Step 1 continued: the *real* reason plain-`Enter` spam never progressed — a disk-swap/path prompt whose `FindFirst` call was completely unimplemented

Disassembling the caller chain above the text-input field (`0x011846`–`0x01188a`) found a
`FindFirst("B:\game.exe", …)` call (Borland RTL wrapper at `0x12a0:0117`–`0x12a0:0148`,
itself calling `INT 21h AH=0x4E`) feeding a boolean "do we need to prompt for a disk swap"
check (`cmp word ptr [DS:0xa260],0` against the RTL's own last-DOS-error global, immediately
after being written by the wrapper). **`INT 21h AH=0x4E` (FindFirst) was completely
unimplemented in the harness** — every call fell through to the generic "unhandled AH"
fallback, which unconditionally returned `CF=1` with a **bogus, non-DOS error code**
(`AX = (ah<<8)|1 = 0x4E01`, not a real MS-DOS error constant). Since the retail GOG install
mounts only `C:` (`mount c ".."` — no `B:` at all, per `dosbox_gateway_single.conf`), this
disk-presence probe can *never* succeed as a literal drive-B check even under real DOSBox;
the real game must accept **some** typed answer that resolves via `FindFirst` (confirmed:
typing `"HERO"` made the on-screen prompt template become `B:\HERO\` — the harness's own,
now-fixed video output correctly re-rendered it cleanly, proof the field really is building
a path from typed input) or otherwise skip the check outright — but with **every**
`FindFirst` call hard-failing, the prompt could never be satisfied by any answer, so the
game correctly (from its own point of view) kept re-asking forever. This, not a hung CPU
loop, was the entire "genuinely blocked" result Part 9 reported.

### Two concrete DOS/BIOS emulation gaps fixed (same pattern as Part 9's three: real, general, not picture-format-specific)

1. **`INT 21h AH=0x4E`/`0x4F` (FindFirst/FindNext) implemented for real**, resolving
   against the harness's existing flat `root`+`SAVE` file model the same way `_find_game_file`
   already does for `AH=0x3D` (strip any drive/path prefix, match the basename, support
   `*`/`?` wildcards via `fnmatch`, fill a real 43-byte DTA record at the tracked
   `dta_seg:dta_off`, proper DOS error codes on miss: `AX=2` not-found, `AX=18` no-more-files
   on `FindNext`). Also fixed: `AH=0x19` (get current drive — never fails in real DOS; now
   reports drive `C:`, `CF=0`, instead of falling into the buggy generic fallback), `AH=0x0E`
   (select disk — also never fails; now reports a plausible drive count), and **`AH=0x44
   AL=0x00` (IOCTL Get Device Data) for the standard handles 0/1/2** — the very first
   unhandled call the harness ever saw (instr ~74125, before any keyboard read), almost
   certainly the Borland RTL's own "is stdout a real console" DirectVideo probe; it now
   reports "character device, console" (`DX=0x80D3`, `CF=0`) instead of erroring.
2. **A real text-mode `INT 10h`**: `AH=0x02`/`0x03` (set/get cursor — now backed by the
   actual BIOS Data Area cursor word at `0040:0050`, confirmed live to matter because
   Gateway's own echo routine at `0x01284c`–`0x0128d5` reads that word **directly**
   (`mov ax,0x40; mov ds,ax; mov dx,[0x50]`) rather than exclusively through `AH=0x03`),
   `AH=0x09`/`0x0A`/`0x0E` (write char, with/without attribute, teletype — now actually
   write to video memory at `0xB800` segment with CR/LF/BS/wrap/scroll handling), `AH=0x06`/
   `0x07` (scroll window, used for clear-screen too), `AH=0x00` (set mode — now clears the
   modeled screen, matching real BIOS behavior). Previously **all** of these were silent
   no-ops (no video memory write, no register changes at all) — meaning no text the game
   drew via BIOS calls ever appeared in the harness's modeled video memory. (Confirmed
   *not* the source of the `B:\disk 1:&D ga`-style boot-time text found early in this round
   — that content is written via a **direct poke to `0xB800`**, a classic Borland-CRT-unit
   `DirectVideo` optimization that bypasses `INT 10h` entirely for bulk text; verified real,
   not coincidental memory-allocator overlap, by confirming zero DOS memory blocks were
   allocated anywhere near segment `0xB800` at the time that text was observed.)

Both fixes are general DOS-fidelity corrections (same category as Part 9's timer-tick/CRTC/
mouse-driver fixes), not picture-format-specific, and both are proven live to change real
program behavior, not just theoretically more correct.

### With both fixes in place: `GAME.OVR` opens for the first time ever in this investigation

Re-running with **plain `Enter` spam only** (no typed text needed at all — the corrected
`FindFirst` now succeeds against the harness's own file model regardless of what the
"insert disk" prompt would have asked, so the front end sails through automatically) reaches,
deterministically, **before the very first keyboard read (~instr 80016)**:

```
INT21/4E FindFirst 'game.exe' (basename=GAME.EXE) -> 1 match(es) at instr 78661
INT21/4E FindFirst 'game.cfg' (basename=GAME.CFG) -> 1 match(es) at instr 78892
INT21/4E FindFirst 'C:\game.ovr' (basename=GAME.OVR) -> 1 match(es) at instr 80067
*** DAX/OVR OPEN *** GAME.OVR -> handle 6 (347622 bytes) at instr 80211
INT21/25 SetVector 0x3f -> 12cf:02e6 at instr 80260      (a SECOND, nested overlay-manager instance installs its own INT 3Fh vector)
INT21/4E FindFirst 'C:\ecl2.dax' (basename=ECL2.DAX) -> 1 match(es) at instr 80426
INT 0x3f REAL-DISPATCH to 12cf:02e6 (ret was 117b:0022) at instr 80676
UcError: Invalid instruction (UC_ERR_INSN_INVALID) at instr 80919
```

This is the first time in this investigation's history (Parts 7–9 included) that `GAME.OVR`
has actually been opened by the emulated program. This alone does not reach descriptor 33
(file offset `0x46718`) — the reads observed this round targeted a small overlay-directory
structure near the *end* of the file (file offset `~0x54c82`, close to the 347622-byte
total) — but it proves the fix is real, general, and input-independent (it fires during
pure boot, before any of our fake keypresses are even consumed).

### New blocker found: a crash jumping into a zeroed-out region of the *original* MZ image, immediately after a second overlay manager finishes a small load

The crash (`UC_ERR_INSN_INVALID`) lands at `CS:IP=117b:027d` (physical `0x11a2d`). Traced
in full:

- Segment `0x117b` is **not** some unresolved raw placeholder — it falls inside the
  original MZ-loaded image range (`[0x1000, 0x18d0)`), and the **on-disk `GAME.EXE` file
  genuinely has real, coherent x86 code there** (`fc b8 64 00 9a e9 00 43 03 89 ec 5d ca 04
  00 55` — `cld; mov ax,0x64; lcall …`, confirmed correctly loaded into memory at boot by a
  direct read-back check).
- A `mem_write` watchpoint over that address range caught the actual culprit: code at
  `1a0d:008d`/`1a0d:0096` (a relocate/compact-style loop, decrementing `si`/`di`, "REP
  MOVSB"-adjacent) **deliberately zeroes** a large span of that same memory (confirmed via
  a live write log — hundreds of `WRITE addr=0x11a2f..0x11a30 val=0x00` entries), leaving
  only a 3-byte tail (`fe ff 01`) exactly matching the bytes found at the crash site. This
  is very likely a legitimate VROOMM "clear/compact the old overlay's memory before loading
  its replacement" operation, **not** a harness bug by itself.
- Single-instruction trace of the ~160 instructions between the second overlay-manager's
  last successful read (`instr 80760`, 14 bytes into segment `0x2329`) and the crash shows
  a **fully coherent**, real interrupt-service-style sequence: register pushes, several
  near/far calls (`0x131d6`→`0x13243`, `0x13125`, `0x13228`), an indirect far call through a
  resident function-pointer slot (`lcall [0x5420]`) that resolves to a trivial stub
  (immediate `retf`), then a full register pop sequence (`es,ds,di,si,dx,cx,bx,ax,bp`) and
  a genuine **`IRET`** (instr `80889`, at `013027`) — i.e., this is a real, well-formed
  interrupt handler (almost certainly one more `INT xx` this harness's generic
  "any-vector-the-game-itself-installed gets a real push-flags/cs/ip + jump" mechanism
  dispatched automatically, per the module's own documented technique) running correctly
  to completion. **The `IRET` pops a return `CS:IP` that lands directly in the
  now-zeroed region** (`0x1119f4`, walking forward through zero bytes — decoding harmlessly
  as `add [bx+si],al` — until hitting the same non-zero 3-byte tail that crashes).

**Diagnosis, not yet resolved:** the memory that a legitimate `IRET`'s stacked return
address pointed into had already been zeroed by the compaction routine by the time control
returned there. Three explanations remain open and **undistinguished** this round (a real,
useful negative result — not smoothed over):
  1. The retail flow expects a **follow-up file read** to refill that same address range
     with the *next* overlay's real code before returning there, and that read either
     depends on something this harness still doesn't model (leading candidate: **EMS/XMS**
     — the retail `dosbox_gateway.conf` sets `xms=true ems=true`, and this harness has
     **zero** `INT 67h`/`INT 2Fh` XMS/EMS handling at all, unlike the generous
     `memory_top_seg=0xC000` conventional-memory ceiling that already substitutes for
     missing EMS/XMS elsewhere in this same harness) or a disk-geometry call
     (`INT 25h`/`26h`, also entirely unmodeled).
  2. The overlay/compaction bookkeeping itself depends on state this harness doesn't
     initialize correctly (e.g. the VROOMM descriptor table's own free-list, distinct from
     the two selector-resolution mechanisms already explored in Parts 8–9).
  3. A genuine ordering bug specific to this harness's single generic "real INT dispatch"
     mechanism when a **second** overlay manager installs a **second** `INT 3Fh` vector
     mid-run (this round's first observation of that happening) — worth checking whether
     the harness's `int_vectors` dict, which is a flat `{intno: (seg,off)}` map with no
     versioning, could dispatch a call meant for the *old* vector's context through the
     *new* one, or vice versa.

### What Part 10 does NOT change

- No image was rendered; no PIC-loader buffer was ever captured
  (`loader_hits=0, retf_hits=0, buffers_captured=0` in every run this round, same as Part 9)
  — the single-frame pixel-packing question is untouched. Per "UNLOCATED beats invention,"
  no decoder was added to `dax.ts`/`daxVgaPicture.ts`.
- Descriptor 33 (file offset `0x46718`–`0x47097`) itself was still never reached or opened
  this round — the new crash happens while loading a *different*, earlier overlay unit.
  `_maybe_capture_desc33` remains built but still untested-in-anger.
- No test files added or modified; no `packages/engine` TypeScript touched (`npx tsc
  --noEmit` not applicable this round — confirmed no `.ts` files changed).
- `tools/unicorn_dqk_trace.py` was not read, touched, staged, or committed this round
  (it continues to carry a pre-existing foreign uncommitted modification per this
  session's shared-tree rules — left alone).

### Concrete next steps (for whoever picks this back up)

1. **Model `INT 67h` (EMS) and/or `INT 2Fh` AH=0x43 (XMS) minimally** — at minimum, report
   "not installed" *correctly and consistently* (distinct from the current silent no-op for
   totally unmodeled interrupts, which leaves registers unchanged rather than giving a
   proper "no driver" signal) and see whether that changes the second overlay manager's
   behavior before the crash point, since the retail `.conf` explicitly enables both and the
   generous `memory_top_seg=0xC000` conventional-memory-only model is a known, documented
   simplification that could be exactly what's papering over a real EMS/XMS dependency here.
2. **Add versioning/logging to `int_vectors` for `INT 3Fh` specifically** — log every time a
   *new* `AH=0x25` `SetVector` call overwrites an *existing* entry for the same interrupt
   number (this round found exactly one such overwrite, `1343:00d7` → `12cf:02e6`, but did
   not check whether any in-flight call was still expecting the old vector's semantics).
3. **Trace forward past this specific crash** with a soft, clearly-logged "if execution
   would fault on an all-zero page inside the original loaded-image range, treat as a hard
   stop and dump full context" guard (already effectively what `UC_HOOK_MEM_INVALID`/the
   `UcError` catch does) — but prefer root-causing candidate 1 or 2 above over papering over
   the crash with a synthetic `retf`, per this project's "UNLOCATED beats invention" rule.
4. Once past this blocker, **descriptor 33 still needs to actually be reached** — nothing
   this round proves that will happen automatically; re-verify with the `_diag_int16_snapshot`
   screen-hash tooling (now proven useful) that navigation is making real progress, not
   reusing another shared call site, at each subsequent screen.

## Part 11 — the crash was a harness bug, not EMS/XMS/VROOMM; descriptor #33 is now
reached and its dispatcher executes for real; the actual pixel-decode branch is
statically pinpointed but never dynamically exercised this round (2026-07-22, round 5)

Follow-up to Part 10's three candidate theories, worked entirely against
`tools/unicorn_gateway_pic.py` (extended in place; still no DOSBox-X, per this round's
constraint too). **Net result: the crash is fully resolved (confirmed crash-free across
runs up to 200,000,000 instructions), by two general DOS-emulation-fidelity bugs in this
harness itself — not by anything EMS/XMS/VROOMM-related.** Descriptor 33's own dispatcher
now runs repeatedly and for real. Real, non-null output-buffer captures were obtained for
the first time in this investigation's history, but static disassembly (cross-checked
against every live trace) proves none of them are picture pixels yet — every live
invocation observed so far takes a fast-path branch that returns *before* the code that
touches the pixel buffer. The real decode code is now precisely located by address; it
was simply never dynamically reached this round.

### Candidate 1 (EMS/XMS) — REFUTED with direct evidence

Static scan of `GAME.EXE` found a tight cluster of 10 `INT 67h` (EMS) call sites and
**zero** `INT 2Fh` call sites anywhere in the resident image or `GAME.OVR` — so the XMS
half of candidate 1 doesn't even apply (this game never calls XMS's own detection
convention, `INT 2Fh AX=0x4300`). Disassembling the EMS cluster (phys `~0x012f9b`-`0x013070`)
found it is gated by the textbook-correct EMM **driver-signature check**: `INT 21h
AH=0x35` (get vector) for interrupt `0x67`, then an 8-byte `repe cmpsb` comparing the
string at `CS:0x55f` against the vector segment's own byte `+0x0A` (the documented
"EMMXXXX0" signature convention) — `mov cx,8; mov si,0x55f; mov di,0xa; ...; repe cmpsb`
at phys `0x013013`-`0x013023`. Since this harness's `AH=0x35` for a never-installed
vector returns a default `(0xF000,0x0000)` (all-zero backing memory), the signature
comparison **correctly fails** without the game ever needing to execute a live `INT 67h`
call at all.

Proved live, not just by static reading: an ad-hoc probe (`build/gw_probe_ems.py`, not
committed — scratch, gitignored) hooked both the signature-check call site and every
real `INT 0x67` dispatch. Across the crash-reproducing baseline run, the signature-check
call site fired exactly once (at instr 80757, ~160 instructions before the historical
crash), and **zero real `INT 0x67` dispatches ever occurred** — confirmed again after all
of this round's fixes, across a 200,000,000-instruction run. Candidate 1 is closed: EMS
absence was already being reported correctly by the pre-existing "default-vector, all-zero
backing memory" behavior; no new EMS/XMS modeling was needed or added.

### The real bug: the harness's own synthetic interrupt-transfer wrote FLAGS:CS:IP in the wrong order

A full single-step disassembly trace (capstone-driven, register-dumped every instruction)
of the exact crash window — instr 80740 through the `UcError` at 80919 — showed a
**completely well-formed** VROOMM overlay-unit loader/relocator/registration routine
running to completion: seek+read a small overlay directory, apply 7 word-sized relocation
fixups, insert a descriptor into a linked list at `[0x542a]`, patch three `JMP FAR`
call-stub entries (`0xEA` opcodes) to point at the freshly-loaded unit, look up free
overlay-buffer space, then — as the routine's own genuine, compiler-emitted epilogue —
execute a real `iret`. This `iret` is what the whole routine was entered by in the first
place: back at instr 80676, the game executed `int 0x3f` (a VROOMM call stub), and this
harness's *generic* "any interrupt the game itself installed a vector for gets a real
push-FLAGS/CS/IP-then-jump transfer" mechanism (the load-bearing trick this whole harness
is built on, `_on_intr`'s `vec is not None` branch) dispatched it for real.

The bug: real x86 `INT n` pushes **FLAGS, then CS, then IP** (IP pushed last, ending up at
the lowest address / current `SP`), and `IRET` pops **IP, then CS, then FLAGS** to match.
This harness's synthetic version had it backwards:
```python
uc.mem_write(ss * 16 + sp, struct.pack("<HHH", fl, cs, ip))   # WRONG: fl,cs,ip
```
putting FLAGS at the low offset instead of IP. CS happened to already come back correct
purely because it sits in the *middle* slot of both orderings — which is exactly why this
went undetected through Parts 7-10: any interrupt whose handler never itself executes a
real `iret` (or whose `iret` never gets exercised because the deeper crash always fired
first) never surfaces the bug. The dispatched VROOMM routine's own `iret` popped IP =
the *original FLAGS value* (~`0x0244` — a wholly unremarkable PF+ZF+IF-set flags word)
instead of the original IP (`0x0022`), landing at flat address `0x117b*16+0x0244 =
0x119f4` — **exactly** the historical crash site, arithmetic-exact, not approximate.
Fixed by swapping the pack order to `struct.pack("<HHH", ip, cs, fl)`. Re-running the
exact Part 10 baseline (`--max-instr 200000 --fake-keys enter*40`) after the fix produces
**zero errors**, 28 successive real `INT 3Fh` dispatches (vs. the historical single one),
and, at instr 89355, `*** DESCRIPTOR #33 LOADED ***` — the first time this whole
investigation (Parts 6-11) has ever reached that point.

This was in the same *family* as Part 10's candidate 3 ("ordering bug specific to this
harness's single generic real-INT-dispatch mechanism") but is a different, more precise
bug than the "vector table overwritten mid-flight" theory that phrase originally meant —
a plain wrong-order stack write in the transfer mechanism itself, not a vector-table race.
Candidate 2 (VROOMM free-list corruption) was never implicated: the free-list/registration
code traced clean and coherent in every run once this fix was in.

### A second, independent DOS-fidelity gap found while pushing further: the real in-memory IVT was never populated

With the crash fixed, longer runs (5-40 million instructions) hit a *new* dead end: `CS:IP`
landing at flat address `0x000000` and spinning forever decoding zero bytes. Single-step
tracing this window found Borland's RTL `Intr`/`MsDos`-style register-block call trampoline
(phys `0x012a10`-`0x012a49`, confirmed live for interrupt number `0x10` — video BIOS) doing
exactly what real DOS programs sometimes do to invoke an interrupt handler *without* the
`INT` opcode: read the target vector directly out of the **in-memory IVT** (`bx =
intnum*4; lds bx,[bx]`, i.e. physical address `0x00`-`0x3FF`) and `retf` straight to it.
This harness intercepts every real `INT xx` opcode via `UC_HOOK_INTR` and never once wrote
to that memory region, so the table read back all zeros — a null far pointer, `retf`'d
to `0000:0000`. Confirmed by the exact same "flags word looks like a plausible IP" style of
check as above wasn't needed here; the landing address was simply `0`, matching a null
pointer exactly.

Fixed generally (not `INT 10h`-specific): `build()` now installs a tiny 3-byte `INT nn;
IRET` stub for all 256 possible interrupt numbers in an unused low-memory region
(`IVT_STUB_BASE = 0x0600`, comfortably clear of the IVT itself, the BDA, and everything
else this harness allocates) and points every real IVT entry at its own stub. Guest code
executing `INT xx` directly is unaffected (still goes straight through `UC_HOOK_INTR` as
before); guest code that instead resolves its own vector via raw IVT memory and jumps/calls
there now lands on a real `INT xx; IRET` pair, re-entering the exact same Python dispatch,
with a real `IRET` that correctly unwinds whatever return frame the caller built (verified:
the Borland trampoline's own `pushf`/`push cs`/`push offset` sequence is already in the
correct IRET-compatible order — only this harness's *own* synthetic transfer had the bug).
`AH=0x25` (Set Interrupt Vector) now also mirrors any game-installed vector into this same
real memory table, so a raw-memory chain-call correctly sees the game's own handler once
one is installed, not the generic stub — matching real DOS's single-source-of-truth IVT.

### A third bug found while chasing the first real buffer captures: `loader_bp` was captured once globally, not once per call

`_maybe_capture_desc33`'s existing machinery (`_on_loader_code`, `_capture_output_buffer`)
started firing for real once descriptor 33 loaded. But `loader_bp` was captured with `if
self.loader_bp is None: ...` — global, once ever — while descriptor 33's own dispatcher is
called *repeatedly*, and each call legitimately establishes its own fresh `BP` (a normal
Pascal `push bp; mov bp,sp` frame pointer, dependent on the caller's stack depth at the
time). Reusing a stale `BP` from an earlier, differently-positioned call reads unrelated
stack memory on later captures. Fixed by resetting `self.loader_bp = None` immediately
after each `RETF`-triggered capture, so the next call gets a freshly captured frame
pointer.

### Where things stand now: descriptor 33 runs repeatedly, but every observed call takes a fast path that never touches the pixel buffer

With all three fixes in place, a 200,000,000-instruction / 2,000-fake-`Enter` run is
**crash-free throughout** (previously impossible — the original bug fired inside the first
30,000 post-open instructions every time). Descriptor 33's `rel+0x80` entry point (a
4-way dispatcher reading a global discriminator byte at `[0x5db6]` into `AL`, explicitly
checking `AL==0`, `AL==1`, `AL==3`, with anything else — almost certainly `AL==2` given the
pattern — falling through to a fourth path) executed **3 separate times** across the run.
**All 3 took the `AL==3` branch**: a "picture already prepared — blit straight to VGA
memory at `0xA000:0000`" fast path (`mov di,0; mov ax,0xa000; push ax; push di; mov
ax,0xfa00; push ax; mov al,0; push ax; lcall 0x1343,0x16a6`, i.e. a far call into the
always-resident graphics-primitives library at segment `0x1343` with a raw VGA framebuffer
pointer as an argument) that returns via `pop bp; retf` at `rel+0x15c`/`0x15d` — **long
before** the function ever reaches the code that uses the output-buffer local. Static
disassembly of the *entire* loader span (all 6 references to `[bp-0x2a]`, Part 7/8's
"curBuf" claim) shows they all live at `rel+0x333` through `rel+0x3f8` — `lea di,[bp-0x2a]`
first assigns/initializes it there, then four more `les`/`push` uses follow — reachable
only via the `AL!=0,1,3` branch, which starts at `rel+0x108` with what looks unmistakably
like the real per-pixel decode: a byte-fetch/store loop that caps values at 6
(`cmp ...,6; jbe; mov ...,6`), a `shl ax,cl` with `cl=3` (an 8-wide packing stride,
consistent with 88-pixel-wide rows: `88/8=11`... worth re-checking against the true 88x88
geometry once reached), and far calls into the same `0x343`/`0x157` support segments the
rest of the descriptor uses. **This code was never dynamically executed this round** — so
every "buffer capture" logged this round (5 of 6 null; 1 of 6 a real, non-garbage 7744-byte
region) reflects **stale stack contents from the AL==3 call's own unrelated locals**, not
picture data. The one non-null capture (`build/gateway-pic3-1.bin`, gitignored scratch, not
committed) decodes as plain ASCII — `"Armor"`, `"Leather"`, `"Padded"`, `"Studded"`,
`"Ring"`, `"Scale"`, `"Chain"`, `"Splint"`, `"Banded"`, `"Plat[e]"` — the classic AD&D armor
type name list, almost certainly leaked from a *different*, unrelated exported routine
within this same descriptor (there is real, coherent compiled code at the file's very start,
`rel=0`, that was also captured under this investigation's overly broad RETF-byte-pattern
hook) that happens to reuse the same relative stack slot for a string-table pointer. Per
"UNLOCATED beats invention," **no decoder was added to `dax.ts`/`daxVgaPicture.ts` this
round** — nothing pixel-shaped has been captured yet.

### A fourth, later blocker found (not a crash): a MUSIC.DAX polling loop that never resolves

Pushing the same run to completion (200,000,000 instructions) shows the trace settle, after
about instr 16,000,000, into a repeating pattern: `FindFirst`+open `MUSIC.DAX` four times in
quick succession, then a tight `call 0x92445; or ax,dx; je $-...` busy-wait on a 32-bit
value that never becomes nonzero, for the remaining ~184,000,000 instructions with zero
further progress (no new `INT 3Fh` overlay loads, no new descriptor-33 calls). This has the
signature of a sound-driver note-timing countdown that expects to be decremented by its
*own* periodic `INT 8`h (IRQ0/timer) handler — this harness only ever passively pokes the
BDA tick dword on a fixed 2000-instruction cadence (enough to satisfy simple "did the clock
tick" busy-waits) but has never fired a real, periodic `INT 8` the way actual hardware and
DOS's own timer ISR chain would. Not yet confirmed (no trace done on this specific loop
beyond noticing it), but consistent with the "always AL==3" finding above: this is very
plausibly *why* fake-`Enter` spam alone never advances the game past whatever
title/attract/idle screen keeps re-blitting the same cached picture — real progress may be
gated behind this music-timing wait rather than behind keyboard input at all.

### What Part 11 does NOT change

- No image was rendered; no real picture pixel buffer was ever captured (`buffers_captured`
  counts real captures, but both this round's non-null ones are proven non-pixel data per
  above). The single-frame pixel-packing question remains genuinely open.
- No `packages/engine` TypeScript was touched; `npx tsc --noEmit` not applicable this round.
- No test files added or modified.
- `tools/unicorn_dqk_trace.py` was not read, touched, staged, or committed this round.
- All ad-hoc diagnostic probes used this round (`gw_probe_ems.py`, `gw_probe_trace.py`,
  `gw_probe_trace2.py`, `gw_probe_lowjump.py`, `gw_probe_loader.py`, `gw_probe_loader2.py`,
  `gw_probe_loader3.py`) live only under the gitignored `build/` directory — scratch,
  not committed, reproducible from the descriptions above if needed again.

### Concrete next steps (for whoever picks this back up)

1. **Model a periodic synthetic `INT 8`** (e.g. every ~1200 instructions, matching real
   18.2 Hz-ish IRQ0 timing relative to this harness's rough instr/sec, and reusing the
   now-fixed generic real-interrupt-transfer mechanism so a game-installed `INT 8` handler
   actually runs) to test whether the MUSIC.DAX busy-wait resolves and navigation continues
   past whatever screen is currently looping.
2. **Once past that, watch specifically for an `AL` value other than 3** at descriptor 33's
   `rel+0x80` dispatcher (the discriminator byte lives at `[0x5db6]`) — that is what
   actually reaches the `rel+0x108`-`0x4e1` decode code and populates `ss:[bp-0x2a]` for
   real. The existing `_capture_output_buffer` machinery needs no further changes for this;
   it will fire correctly on the next real `RETF` once that branch executes.
3. Consider tightening `_maybe_capture_desc33`'s hook to **verify the live bytes still match
   the expected static signature** before trusting a capture (this round found the hooked
   address range gets visited by more than one logically-distinct exported routine within
   the same descriptor — e.g. the `rel=0` armor-list code — sharing the broad "any `0xCB`
   byte in this address range" RETF detector; a byte-signature check at a few fixed offsets
   would cheaply rule out attributing another routine's exit to the PIC loader specifically).
4. If reached, cross-check the `rel+0x108` decode loop's `cl=3` shift/stride and the `cmp
   ...,6` value-cap against the true 88x88 geometry once real pixel data is finally in hand,
   before assuming any particular packing formula.

## Part 12 — periodic IRQ0 implemented and bounded live hypothesis disproved; trace the zero dword's producer next (2026-07-22)

Part 11's first concrete next step was implemented in `tools/unicorn_gateway_pic.py`. The
harness now accepts `--timer-irq-interval N`, reads the live INT 8 vector from the real IVT,
waits until the guest replaces the harness's initial low-memory stub, respects the x86 IF bit,
and performs a real hardware-style interrupt transfer. The frame is written as IP, CS, FLAGS
at the new SP (the memory order consumed by `IRET`), IF and TF are cleared on entry, and the
run summary reports the number of injected IRQs. `tools/test_unicorn_gateway_pic.py` covers
the complete transfer/IRET round trip and both refusal cases: IF clear, and an IVT entry that
still points at the harness's initial stub.

This source was recovered after an interrupted edit left `unicorn_gateway_pic.py` as 60,127
NUL bytes. The committed Part-11 source, the new test, and the still-loadable Python bytecode
made the intended change unambiguous; the text source was reconstructed and the two tests pass.

The decisive bounded retail run was:

```powershell
python tools/unicorn_gateway_pic.py `
  --max-instr 30000000 `
  --fake-keys enter*400 `
  --dump-prefix build/gateway-pic-int8-20260722-c `
  --log build/gateway-pic-int8-20260722-c.log `
  --timer-irq-interval 1200
```

Result: 30,000,000 instructions, 237 loader-range hits, 6 broad RETF-hook hits, 2 buffer
dumps, and **exactly zero injected timer IRQs**. Instrumentation also reports zero non-default
vector-8 observations and zero IF-blocked injection attempts at every due check. The log contains
no `INT 21h/AH=25` install for vector 8; Gateway installs only INT 3Fh in this route. Therefore
Part 11's claim that the final polling loop "expects to be
decremented by its own periodic INT 8 handler" is disproved for this execution path: there is
no guest IRQ0 handler to invoke. The injector correctly remained inert instead of fabricating a
handler the retail program never installed.

The run otherwise reproduces Part 11 exactly. It consumes only the first of 400 queued Enter
keys, opens `MUSIC.DAX` four times, and then reaches the same nine-address loop at about
instruction 16.18M. The loop repeatedly calls the resident helper returning the dword at
`CS:[0x2B5A:0x2B5C]`; both words remain zero through the 30M cap. Advancing the separate BIOS
tick dword at `0040:006C` and offering a valid periodic IRQ mechanism do not change it.

The two 7,744-byte dumps are also unchanged and are **not pixel evidence**: one contains the
ASCII armor-name table (`Armor`, `Leather`, `Padded`, `Studded`, and so on), and the other is
all zero. The broad descriptor-range RETF hook still observes unrelated exports at `rel+0x4`
and the cached-blit return at `rel+0x15D`; it has not reached the actual non-cached decode span
at `rel+0x108..0x4E1`.

### New exact frontier

1. Trace every write and static/live xref to the resident dword at `CS:0x2B5A..0x2B5D`, then
   identify the routine expected to make it nonzero after the four `MUSIC.DAX` opens. Do not
   retry IRQ0 injection unless a later route first proves a real vector-8 install or IVT write.
2. Determine whether the loop is a driver completion/result handshake rather than a timer
   countdown. The current evidence supports only "polls a zero dword," not its semantics.
3. Tighten descriptor-33 capture to known loader entry/return signatures before interpreting
   any further `ss:[bp-0x2A]` value. The current broad `RETF` detector is proven to conflate at
   least the armor-table export with the PIC dispatcher.
4. Pixel packing, a real 88x88 output capture, and the loader implementation all remain
   genuinely **UNLOCATED**. No TypeScript decoder or fallback behavior changes in this part.

## Part 13 — the polled dword is the MUSIC.DAX INT 1Ch tick counter; the broad PIC hook was also invalid (2026-07-22)

Part 12's negative observation was accurate but its conclusion was too narrow: Gateway does not
replace IRQ0/vector 8 because it installs the standard DOS user-timer hook, **INT 1Ch**, instead.
The missing producer is now statically identified byte-for-byte in decompressed `MUSIC.DAX` block
0. That block is loaded with a `0x100` origin, so its raw offset `0x2AE5` maps to the live helper
at `CS:0x2BE5` observed in Part 12:

```text
2B5E  ... install/uninstall routine
2B6E  mov si,0070h                 ; IVT byte address 1Ch * 4
2B89  read and save old 1Ch vector
2B9B  mov cs:[2B5A],0
2B9F  mov cs:[2B5C],0
2BA4  write CS to IVT[1Ch].segment
2BA9  write BX to IVT[1Ch].offset  ; caller supplies 2BB0

2BB0  INT 1Ch handler
2BB6  inc word ptr cs:[2B5A]
2BBD  inc word ptr cs:[2B5C]       ; carry into high word
2BE0  jmp far cs:[2B56]            ; chain old handler

2BE5  mov ax,cs:[2B5A]
2BE9  mov dx,cs:[2B5C]
2BEE  ret                           ; the busy-wait's helper
```

This proves the dword is a monotonically increasing timer-event counter, not an unknown
completion/result handshake. A normal BIOS IRQ0 handler advances `0040:006C` and invokes INT 1Ch;
the harness's original periodic experiment modeled only a guest-owned vector 8 and therefore
correctly found no target but stopped one layer too early. `--timer-irq-interval` now preserves
direct guest IRQ0 delivery when vector 8 is replaced and otherwise models the BIOS chain by
advancing the BDA tick and transferring to a guest-installed vector 1Ch with the same real IRET
frame/IF behavior. A focused unit test proves the INT 1Ch round trip and tick increment.

The retail result is decisive. With interval 1200, the first synthetic INT 1Ch lands at
`8F86:2BB0` at instruction 16,185,600; the zero-dword wait immediately clears. A 30M-instruction
run delivers 11,418 INT 1Ch callbacks, progresses beyond the four `MUSIC.DAX` opens, and consumes
79 queued Enter keys instead of one. It also exposed and fixed a separate DOS-model gap:
`FindFirst("C:\\SAVE")` asks for attribute `0x10` and expects a directory DTA entry. The harness
previously enumerated files only and spun on the missing directory; it now returns file/directory
attributes correctly, with focused coverage.

The run also invalidates Parts 11-12's dynamic PIC claims more deeply than previously known. The
overlay manager reuses the descriptor-33 physical load window for other descriptors. The old hook
remembered that physical address forever, treated every later `RETF` byte anywhere in the range as
the PIC loader's return, and read `ss:[bp-2Ah]` from unrelated stack frames. That is why it produced
armor strings, zeros, and later high-entropy/random-looking 7,744-byte dumps. The real target at
`GAME.OVR:0x4687E` has stable non-relocated signatures:

```text
rel+0000  55 89 E5 B8 B8 00 9A ... 81 EC B8 00
rel+049E  89 EC 5D CA 0C 00            ; RETF 0Ch at rel+04A1
```

The hook now requires both signatures, starts a call only at exact `rel+0`, and captures only at
the exact `RETF 0Ch`. The same 30M route records 2,110 executions in the reused physical range but
**zero signature-valid PIC-loader entries, zero real returns, and zero buffers**. Consequently all
earlier broad-hook buffer captures and the alleged cached `AL==3` branch observations are
retracted as descriptor-window aliasing, not PIC evidence. No `PIC*.DAX` file is opened on this
default Enter route.

### Corrected frontier

1. Find a deterministic input/state route that actually opens a `PIC*.DAX` archive and produces a
   signature-valid entry at `GAME.OVR:0x4687E`; the strict hook is now safe to leave armed.
2. Only after a real entry, record its arguments and the `[5D8F]`/`[5DB6]` globals, then capture the
   exact `rel+0x4A1` return buffer. Do not interpret any dump from the superseded broad hook.
3. Pixel packing, a real 88x88 output capture, and the TypeScript loader remain **UNLOCATED**. The
   timer and DOS-directory blockers are closed; reaching the picture route is now the boundary.

## Part 14 — native new-party route reaches illustrated story; Unicorn input parity is now the boundary (2026-07-22)

A real DOSBox-X/GameLink run against the isolated stage created a minimal character entirely through
Gateway's own UI. The game wrote `SAVE/A.GUY` (422 bytes, SHA-256
`55142eae616930418199f7d4ef34591d3ac1f6a4de9abd0afec5a5685d28c74b`) and `SAVE/A.FX`
(27 bytes, SHA-256 `c4f1a9b74f9cb0ba2bf134edfb790077a4a0b1c8d4504e9eaac01bec8a94d283`).
These are scratch-stage, game-created sidecars, not an untouched external save bundle; they do not
change `gateway-stage-manifest.json`'s `route_ready=false` claim and were not copied into the GOG
installation.

The enhanced `tools/recon_gateway_frontend_nav.ps1` accepts a comma-separated `-KeySequence`, a
passive `wait` token, and checks exclusive ownership of the process-global GameLink session before
every input and capture. From its three-second cold-boot checkpoint, this exact bounded sequence is
repeatable:

```text
enter, enter, enter, enter, down, kp_enter, kp_enter, right, kp_enter,
down, down, down, down, down, down, down, kp_enter, wait, wait, wait
```

The first menu Enter selects **ADD CHARACTER TO PARTY**, the next selects the game-created A, and
Right plus keypad Enter selects the party-assembly **EXIT** control. Seven Downs select **BEGIN
ADVENTURING**. Immediately before activation, the PNG SHA-256 is
`c366ff39203411d940d104d9a6b87d10f83ca78a098979a61a8f8a9c7e0934d3`; after one transition frame,
the stable frame repeats byte-identically across three passive captures with SHA-256
`0c694ae97c7a1e1af6bb6696dae3f1c9cd587eb4d078503a4a00d160d79855b4`. It shows A at `7,13 N`, an
illustrated narrative scene, and a visible continuation prompt. Qwen 3.6 27B was used locally to
transcribe/classify individual screenshots and reduce conversation image cost; those model notes
guided navigation only. The persisted PNG hashes and real executable behavior are the evidence.

This is a deterministic native **picture-bearing route**, but it is not yet proof that the scene
uses `PIC*.DAX` rather than another picture family. The strict Unicorn harness cannot replay it yet.
Unicorn consumes its first queued key during an earlier pre-screenshot phase, so four bounded
alignment variants were tested with 3, 4, 5, and 6 leading Enter keys, followed by the same proven
menu suffix. The corresponding logs are
`build/gateway-pic-proven-route-20260722-{c,a,b,d}.log`. Every run consumed its complete 17–20-key
queue and performed 4–5 `SAVGAMA.DAT` checks, but none mentioned `.GUY`, opened a `PIC*.DAX`, entered
the signature-valid loader, returned from it, or captured a buffer. Loader-range hits (1,212–1,269)
remain overlay-window reuse and are correctly rejected by the strict signature.

### Corrected next step

Instrument the native deterministic route at DOS file-open level to identify the illustrated
scene's actual archive, or make Unicorn key dispatch state-aware enough to prove it loaded A and
reached the same scene. Only if that records `PIC*.DAX` should the strict loader capture continue.
Do not expand the four-case alignment matrix into an unbounded guessed-key search.

## Part 15 — DOS file-open trace: the illustrated scene reads `PIC.DAX` then `PIC2.DAX` (2026-07-22)

The Part 14 route was re-run byte-for-byte with DOSBox-X's own `[log]` FILES-channel logging
enabled. No new hook, debugger, or Unicorn work — the game's real INT 21h opens were captured by
the emulator itself.

**Method.** DOSBox-X 2026.07.02 compiles in a `[log]` config section (`src/debug/debug_gui.cpp`,
`LOG::SetupConfigSection`): `logfile=<path>` plus one key per channel. `DOS_OpenFile` in
`src/dos/dos_files.cpp` logs `"file open command %X file %s"` unconditionally at `LOG_NORMAL` on
the `FILES` channel, so `files=normal` records every open with its filename; `fileio=true` adds
`Closing file %s` lines. Both strings were confirmed present in the shipped binary before running.
`tools/dosbox_x_debugbox_probe.ps1` gained an optional backward-compatible `-DosLogFile` parameter
that emits that `[log]` section, and `tools/recon_gateway_frontend_nav.ps1` gained
`-TraceFileOpens`, which passes the log path through and — after every route step — records the
log's current line count to `log-progress.jsonl` (read shared while DOSBox-X holds the unbuffered
file open). That per-step line watermark is what attributes each open to an exact keypress.

**Exact command** (single DOSBox-X session, GameLink only, exclusive-ownership checks intact,
owned PID killed by the script's own `finally`):

```powershell
pwsh tools/recon_gateway_frontend_nav.ps1 `
  -OutDir build\gateway-fileopen-trace-20260722-a `
  -KeySequence 'enter,enter,enter,enter,down,kp_enter,kp_enter,right,kp_enter,down,down,down,down,down,down,down,kp_enter,wait,wait,wait' `
  -TraceFileOpens
```

**Route reproduction is exact.** `step-17-kp_enter.png` and all three wait captures are
byte-identical to Part 14's stable illustrated frame, SHA-256
`0c694ae97c7a1e1af6bb6696dae3f1c9cd587eb4d078503a4a00d160d79855b4`.

**Timeline** (`build/gateway-fileopen-trace-20260722-a/{dos-files.log,log-progress.jsonl}`,
542 log lines total; line watermarks after each step):

- Boot, before any input (lines 1–416): DOS startup, `GAME.EXE`, `game.cfg`, `GAME.OVR`,
  `8X8d1.dax`, 28x `COMSPR.dax`, `sky.dax`, `ITEMS.1`, `DungCom.dax`, `RandCom.dax`,
  9x `zounds.dax`, `title.dax`, `MUSIC.dax`. So `DUNGCOM.DAX` and `COMSPR.DAX` are boot-time
  preloads, not scene reads.
- step-01 first Enter (→422): two more `title.dax` open/close pairs.
- step-06 select character A (→426): `C:\SAVE` directory search, `SAVE\*.guy` glob,
  `SAVE\A.GUY` open/close.
- step-07 second keypad Enter (→458): `A.GUY` reread, probes for `SAVE\A.swg`, `SAVE\A.fx`
  open/close, then `CHEAD.dax` twice and `CBODY.dax` twice — party-roster portrait data.
- steps 08–16 (Right, kp_enter, seven Downs): **zero** opens; watermark stays 458.
- **step-17 BEGIN ADVENTURING activation (→542), complete open order:** `ECL2.dax`, `GEO2.dax`,
  `WALLDEF.dax`, `WALLDEF2.dax`, `8x8d.dax`, `8x8d2.dax`, then two more
  WALLDEF/WALLDEF2/8X8D/8X8D2 refresh rounds, and finally — the last two archives touched before
  the frame stabilizes — **`PIC.dax`** (ticks 150316690–150324622) then **`PIC2.dax`**
  (150325569–150330383). All 84 lines land within the step's 1.8 s settle window, before the
  step-17 screenshot.
- steps 18–20 (passive waits): zero further opens; watermark stays 542.

**Findings.**

1. The illustrated story scene on this route **is PIC-family**: `PIC.DAX` and `PIC2.DAX` are
   opened as the final acts of scene composition, in that order. The `2` suffix matches the
   area's `ECL2`/`GEO2` set; `PIC.DAX` is the unsuffixed shared archive.
2. **`BIGPIC*.DAX` is never opened anywhere in the entire run** — a clean negative for the
   competing hypothesis. `DUNGCOM.DAX` is opened only at boot, long before the scene.
3. This closes Part 13's frontier item 1 ("find a deterministic route that actually opens a
   `PIC*.DAX` archive"): the Part 14 route is that route.

### Next step (bounded, not started here)

Arm the strict signature-valid `GAME.OVR:0x4687E` hook (Part 13's corrected detector) on this
exact native route — or its Unicorn replay once input parity exists — and capture the loader's
arguments and `rel+0x4A1` return buffer for the `PIC.DAX`/`PIC2.DAX` reads observed here. No
loader capture, pixel decoding, or Unicorn work was attempted in this part.

## Part 16 — strict PIC-loader captured live on the proven route: one invocation reads both `PIC.DAX` and `PIC2.DAX`; args, globals and 7,744-byte return buffer reproduced byte-identically twice (2026-07-22)

Part 15's bounded next step is done. The Part 13 strict double-signature hook (entry
`55 89 E5 B8 B8 00 9A ...` at rel+0, `81 EC B8 00` at rel+0x0B, RETF sig `89 EC 5D CA 0C 00`
at rel+0x49E, RETF instruction at rel+0x4A1) was armed **live in DOSBox-X** on the exact
Part 14 native route, and the loader's stack frame plus full return buffer were captured —
twice, in independent sessions, byte-identically.

### Approach A first (Unicorn parity): honest negative

`tools/unicorn_gateway_pic.py` gained a general **file-open-gated key mechanism**
(`--fake-keys "enter@TITLE.DAX:8,..."` syntax: each key is held until a named DOS open
milestone has occurred N times, plus an instruction min-gap; INT 16h AH=0/10 now models a
true blocking wait by rewinding IP when no deliverable key exists). The boot open sequence
mirrors DOSBox exactly, and keys 1–6 delivered at sane points — but key 6 (select character
A) **never produced the native `SAVE\A.GUY` open**. Instead keys 2 and 6 triggered a
`FindFirst C:\SAVE` + `SAVGAMA.DAT` probe path plus an unmodeled `INT 21h AH=36h` (Get Free
Disk Space) — a code path the native trace provably never takes (zero `SAVGAMA.DAT` lines in
Part 15's log). The divergence spans screens that open no files at all, so file-open gating
cannot re-align it. Recorded as a precise negative
(`build/gateway-pic-gated-route-20260722-a.log`); Unicorn input parity remains open and is
NOT the vehicle for this capture.

### Approach B (live DOSBox-X debugger): the capture

New tools, both committed:

- `tools/trace_gateway_pic_loader_capture.ps1` — single-session (GameLink-only, PID-owned,
  exclusive-ownership-checked) route driver + capture. Key mechanics: `BPINT 16 0` makes the
  guest stop exactly when it wants the next key (self-synchronizing pacing under the ~50x
  slower debug core, `-Cycles 'fixed 100000'`); the live `[log]` FILES file is read shared as
  a boot/milestone oracle (`TITLE.DAX>=8 && MUSIC.DAX>=2` boot gate, `A.GUY` and
  `CHEAD/CBODY` step gates); at step 16's stop the BP is swapped to `BPINT 21 3D` and the
  step-17 open cascade is walked stop-by-stop, reading each DS:DX filename; at the
  `PIC.dax` open stop a full `MEMDUMPBIN 0000:0000 A0000` dump is taken and scanned; the
  loader entry/RETF BPs are then armed at the scanned seg:off (kept alongside the INT21 BP
  so later opens appear as ordered 'other' anchors); RETF stops take a full dump for
  offline frame+buffer extraction.
- `tools/gateway_pic_capture_analyze.py` — offline `scan` (strict double-signature over a
  640 KB dump, wildcarding the relocation-patched far-call bytes at rel+7..+0xA and
  reporting whether they differ from GAME.OVR's raw placeholder `df 04 43 03`) and
  `extract` (entry/RETF stack-frame decode + `ss:[bp-2A]` buffer far-pointer follow + 7,744
  byte dump — the length is Part 7/8's STATIC derivation, recorded as such).

Three runs, all with final frame **byte-identical** to the Part 14/15 stable hash
`0c694ae97c7a1e1af6bb6696dae3f1c9cd587eb4d078503a4a00d160d79855b4` (route parity holds under
the debugger), all leaving zero DOSBox-X processes:

```powershell
pwsh tools/trace_gateway_pic_loader_capture.ps1 -OutDir build\gateway-pic-loader-capture-20260722-b   # first capture
pwsh tools/trace_gateway_pic_loader_capture.ps1 -OutDir build\gateway-pic-loader-capture-20260722-c   # early-arm probe
pwsh tools/trace_gateway_pic_loader_capture.ps1 -OutDir build\gateway-pic-loader-capture-20260722-d   # discriminating rerun
```

### Finding 1 — exactly one signature-valid loader copy, relocation-patched, and the 0x0343 placeholder resolves to segment 0x0B67

At the `PIC.dax` open stop the strict scan finds **exactly one** match in all of
conventional memory: linear `0x02BE86` (runtime CS:IP `2BD2:0166`, RETF at `2BD2:0607` =
phys `0x2C327`). Its far-call bytes read `df 04 67 0b` versus the raw file's `df 04 43 03`
— the overlay manager has relocation-patched the callee segment: **file placeholder segment
`0x0343` = runtime segment `0x0B67`**, the always-resident file/DAX I/O module (Part 8's
"segment 0x343 resolution UNLOCATED" is now resolved for this call site). Identical result
in runs B and D.

### Finding 2 — the loader overlay is demand-loaded immediately before the PIC call (run C)

Run C tried to arm one call earlier, at the 5th `8x8d.dax` open (cascade #23): the strict
scan found **ZERO** copies — not even an unpatched file-cache image — while the same scan
two opens later (at `PIC.dax`, #25) finds the patched copy. The `dos-files.log` confirms
`PIC.dax` and `PIC2.dax` still opened normally afterwards. So the loader's overlay is
**demand-loaded between the last `8x8d.dax` open (#24) and the `PIC.dax` open (#25)**, and
the `PIC.dax` open stop (which is *inside* the loader's own first file open) is the
earliest possible arm point. Catching the call's ENTRY breakpoint on this route is
impossible by construction; entry-time argument recovery uses the RETF-time frame instead
(valid per the Part 13 frame model: at the RETF instruction, SP has been restored to the
entry SP, so the return address and the six argument words sit at the same addresses).

### Finding 3 — ONE loader invocation reads both `PIC.DAX` and `PIC2.DAX` (run D)

Run D kept the `BPINT 21 3D` BP armed alongside the entry/RETF BPs. Ordered stops after
arming (all before any RETF):

1. `other` at `0B67:1454` — `C:\PIC.dax` (second open)
2. `other` at `0B67:1454` — `C:\PIC2.dax`
3. `other` at `0B67:1454` — `C:\PIC2.dax` (second open)
4. **`retf` at phys `0x2C327`** — the loader returns, ONCE
5. 45 s poll timeout, `retfCount=1` — no further loader activity (recorded honestly)

All four archive opens are issued from the **same INT 21h call site `0B67:1454`** — inside
the far-called module the relocation resolved to. The strict loader copy remains resident
and patched at every one of these stops (per-stop rescans, 1 match each). Conclusion: the
single strict-loader invocation opens `PIC.DAX` twice and `PIC2.DAX` twice through its
`0x0B67` I/O callee and RETFs once. **There is no separate PIC2 loader call** — run B's
"missing PIC2 entry" (entry BP never fired after the PIC RETF) is fully explained, and the
per-file hook framing of Part 15's next step was subtly wrong: it is one call per *scene*,
not per *archive*.

### The capture (runs B and D, byte-identical)

RETF-time frame (`loader-stop-01-retf.json` in run B; `loader-stop-04-retf.json` in run D):

- `SS:SP = 1737:3DCC`, `DS = 0CEB`, return address `36EF:09FC`
- Six argument words, read low→high from SP+4: `851E 0CEB 0000 0005 3DDC 1737`. Under
  Pascal left-to-right push order this reads as: leftmost arg = far pointer `1737:3DDC`
  (SS-based — an out-parameter on the caller's stack), then words `0005` and `0000`, and
  rightmost arg = far pointer `0CEB:851E` (DS-based — a data-segment structure). The `05`
  byte sits in the `bp+0x0C` slot Part 13 identified as the "kind" argument.
- Globals: `[DS:5D8F] = 01`, `[DS:5DB6] = 03`. Observation: `0x5DB6` is the same global
  Part 11 identified as descriptor 33's 4-way dispatcher discriminator, and its RETF-time
  value 3 matches the branch Part 11 saw taken (`AL==3`); entry-time values were not
  observable (see Finding 2).
- Stack locals contain the Pascal string `03 "PIC"` twice — the archive base name, before
  suffixing.
- Output buffer far pointer at `ss:[bp-2A]` = **`7F8C:0000`** (linear `0x7F8C0`) — the
  loader's own destination, not one of the argument pointers. Dumped 7,744 bytes
  (`pic-loader-buffer-01.bin` / `pic-loader-buffer-04.bin`): **byte-identical across the
  two independent sessions**, SHA-256
  `25293b40cd5114cf915670904b4353cc7fea00c6b8bd0fbe376d9fab9af17ecb`. 6,883 of 7,744 bytes
  nonzero; dominant byte values `16 00 06 1B 1E 15 1A 1F` — all ≤ 0x1F, consistent with
  (but not proven to be) palette-index pixel data. First 64 bytes:
  `000054830000e4010713121616121612121612121212121212121212161212121216121612161216161616161616121212121212161212161216121609090909`.

Falsifiable observations recorded WITHOUT decoder claims: the word at buffer offset 6 is
`0x01E4` = 484, and 484 x 16 = 7,744; separately 88 x 88 = 7,744 (Part 8's static
"height x width chunky capacity"). Whether the leading 8 bytes are a header and what the
geometry really is stays open — no `dax.ts`/`daxVgaPicture.ts` changes this round.

### Evidence

`build/gateway-pic-loader-capture-20260722-{b,c,d}/` (untracked per build/ convention):
per-run `report.json`, `signature-scan*.json`, `loader-stop-*.json`, full 640 KB dumps at
arm/open/RETF points, the two buffer dumps, per-step PNGs + `dos-files.log`; console logs
at `build/gateway-pic-loader-capture-20260722-{a..d}-console.log` (a = the Unicorn
negative).

### Next step (bounded, not started here)

Offline only — no new sessions needed: locate which `PIC.DAX`/`PIC2.DAX` block(s) the
captured buffer decodes from (search both archives' RLE-decompressed blocks for
correlated content), and test the two geometry hypotheses (484x16 vs 88x88) by rendering
`pic-loader-buffer-01.bin` as 8-bit indexed rows against the Part 4 DAC palette. If a
render is coherent, THEN write the decoder with the buffer as its oracle.

## Part 17 — `PIC*.DAX` single-frame pixel packing SOLVED with the captured buffer as oracle: 5 row-interleaved bit-planes, and the 17/33/41-byte "trailer" is actually a PREFIX (2026-07-22)

Part 16's bounded next step is done, offline only (no emulator launched — the DOSBox-X
slot was owned elsewhere). The result is the biggest single close-out this document has
recorded: the pixel packing that Parts 3/6/7/8 left "genuinely UNLOCATED" after 9
ruled-out hypotheses is now **byte-exactly proven**, with the live-captured loader output
buffer as the oracle, and the reason all 9 prior hypotheses failed is identified
precisely.

### Step 1 — the buffer is not file bytes (clean negative, as designed)

All 32 blocks of `PIC.DAX` + `PIC2.DAX` (the hash-locked
`build/runtime-gateway-base-clean-20260715` stage, byte-identical to the in-repo GOG
copies — SHA-256 checked both ways) were enumerated and RLE-decompressed with
`tools/dax_decode.py`'s verified container/RLE routines. The captured 7,744-byte buffer
(both runs re-hashed to Part 16's `25293b40…` before use) matches **nothing** as raw
bytes: no exact match, no containment either direction, and none of nine 64-byte probes
sampled across the buffer occurs in any block, compressed or decompressed. So the buffer
is a *decoded product*, exactly what Part 8's "7744 = chunky output capacity" reading
predicted.

### Step 2 — byte-value census pins an 8-byte non-pixel head

Of the buffer's 7,744 bytes, **exactly 3 exceed `0x1F`** — `0x54`, `0x83`, `0xE4` at
offsets 2, 3 and 6, i.e. all inside the first 8 bytes. Every one of the 7,736 bytes from
offset 8 onward is a valid 5-bit palette index (0..31, 32 distinct values present). Read
as words the head is `0000 8354 0000 01E4` — so Part 16's "word at offset 6 = 0x01E4 =
484" observation belongs to this **metadata head, not pixel data**, and the 484x16
geometry hypothesis is thereby REFUTED (its load-bearing word is not part of the image).
The head's meaning is unidentified (see open items).

### Step 3 — geometry: 88-wide chunky is proven, not just preferred

Row-stride autocorrelation over bytes 8.. picks stride **88** cleanly (adjacent-row
byte-difference 0.632 vs 0.67-0.75 for all other strides 8..360), and rendering 88-wide
against the Part 4 palette (EGA16 + proven DAC 16/17 + neutral-gray placeholders for the
unproven 18..31) produces an immediately coherent scene — two figures, faces, hair,
jewelry. The 484x16/16x484 renders are stripes/garbage. Final proof is byte-level, next
step.

### Step 4 — source block identified from oracle-derived streams: `PIC2.DAX` id 5

Searching each block for content *derived* from the oracle pixels (per-row packed
nibbles; per-row 1-bit planes of each pixel bit, both bit orders) produced hits in
exactly **one block in the corpus — `PIC2.DAX` id 5** — and only for MSB-first bit-plane
rows: 28 exact 11-byte hits across bits 1/2/3/4, at offsets that all satisfy one
equation: `offset = 56 + 55*y + 11*p` (y = oracle row, p = bit index). That is: **each
88-pixel row is stored as 5 consecutive 11-byte 1-bit planes (55 bytes/row), plane order
LSB→MSB (bit0 first, bit4/extension last), bits MSB-first** — and 88 rows x 55 bytes =
4,840 bytes, the exact region size Part 3 proved. (The sparse hit pattern — only ~10 of
87 rows per plane — is itself explained: an 11-byte oracle-row string spans a plane-group
boundary under the true alignment, so it only matches where the neighbouring group's
first byte coincides. The nibble-row searches found nothing because the 4bpp base is NOT
stored nibble-packed in this family — unlike `TITLE`/`BIGPIC`/`BODY`/`CPIC`.)

### Step 5 — the alignment constant 56 means the 33-byte structure is a PREFIX, and the decode is byte-exact

Fitting the whole image against the oracle across every start offset gives a unique,
dominant optimum at 56 (92.2% agreement; next best 34%), with every mismatch confined to
the last 8 pixels of each row — a one-plane-byte phase. Two models explain the matched
region; they disagree only on those last-8 columns:

- per-row rotation (oracle row = file row rotated 8 px): **461 mismatches** — refuted;
- global 8-byte shift (`buffer[i] == image[i]` for i >= 8, pixels start at file offset
  **55**): **0 mismatches in all 7,736 comparable bytes** — proven.

`55 = 1 (numFrames) + 21 (frame header) + 33` — i.e. the 33-byte structure that Parts
3/6 placed *after* the pixels by byte arithmetic (which cannot distinguish the two
placements) actually sits **between the frame header and the pixel data**. The pixel
region is `raw[55:4895]`, ending exactly at the block's last byte, zero slop. **This is
why all 9 prior pixel-packing hypotheses produced noise: every one assumed pixels start
at raw[22], so every candidate was misaligned by 33 bytes against the true 55-byte row
grid** (33 is not a multiple of 55; the closest prior attempt — 4-plane row-interleave —
produced "recognizable silhouettes" precisely because 44-byte rows sliding against the
true 55-byte stride intermittently re-align).

The captured buffer is therefore the loader's decoded output for `PIC2.DAX` block id 5
verbatim — same 88x88 chunky array, same memory offsets — with only its first 8 bytes
holding the non-pixel metadata head (the true first 8 pixels of the image are computable
from the file but were overwritten/not preserved in the captured window). Note the
single strict-loader invocation had opened `PIC.dax` twice AND `PIC2.dax` twice (Part
16 Finding 3); the `ss:[bp-2A]` buffer holds the PIC2 product — whatever the same call
decoded from `PIC.DAX` lives in a buffer this capture did not follow.

### The proven format (single-frame `PIC*.DAX`, categories 0x0c/0x0e/0x0f)

```
raw[0]      u8   numFrames (1)
raw[1..21]  21-byte ANIM_FRAME_HEADER (u32 delay, u16 height, u16 width_div8,
            u16 x, u16 y+pad, u8[9] tail; tail byte 1 = raw[14] = Part 6's
            categorical predictor)
raw[22..]   PREFIX structure: 17 / 33 / 41 bytes for category 0x0c / 0x0e / 0x0f
            (same lengths Part 6 proved — but leading, not trailing; content
            meaning still unidentified)
then        height rows x (5 bit-planes x width_div8 bytes), plane order
            bit0..bit4, MSB-first; pixel = 5-bit index 0..31
```

### Deliverables and generalization evidence

- **`tools/gateway_pic_decode.py`** (new, committed): decoder + renderer + the oracle
  regression gate. `--verify-capture <buffer.bin> <PIC2.DAX>` decodes block 5 and
  requires byte-identity on bytes 8..7743 — **passes against both independent captured
  buffers** (exit-code verdict; this is the PROVEN bar). Rendering uses EGA16 + proven
  DAC 16/17 + explicitly-placeholder grays for 18..31 (no invented colors), plus a
  `--gray` mode.
- All **72** single-frame category-0x0c/0x0e/0x0f blocks across `PIC.DAX`-`PIC6.DAX`
  satisfy `len(raw) == 22 + prefix + height*5*width_div8` exactly (zero exceptions,
  zero slop) and render as coherent portraits/scenes (spot-checked visually in all three
  categories, including `PIC.DAX` id 1 — Part 6/8's noise-only test block — now a clean
  treasure-hoard scene, and the 0x0f pair in `PIC3.DAX`). Renders in git-ignored
  `renders/gateway-pic/`. Labeling discipline: byte-exact PROOF exists for `PIC2.DAX`
  id 5 (the oracle); the other 71 blocks carry exact-fit + coherent-render evidence,
  one notch below.
- `PIC3.DAX` id 2 (the corpus's one category-0x00 block) confirms plain-EGA chunky 4bpp
  through the same tool — unchanged prior knowledge.

### Still open (honest)

- **RGB values for palette indices 18..31** — unchanged Part 4 gap; every render above
  uses declared placeholders. Newly actionable: `PIC2.DAX` id 5 is an extended-palette
  picture displayed on the PROVEN route, so a live DAC dump (or the Part 4 bulk-loader
  breakpoint) taken on *this* route should finally capture the real values.
- The 17/33/41-byte prefix structure's content, and the 8-byte buffer head
  (`0000 8354 0000 01E4`) — both recorded, neither interpreted.
- Multi-frame tail frames (`PIC.DAX` id 29 frames 1-5, 4,833-byte payloads): still
  UNLOCATED — 4,833 is 7 bytes short of a full 5-plane image, so the tail-frame payload
  is not simply frame 0's packing; the Part 7 XOR-delta relationship stands but its
  operand geometry does not follow from this round.
- On-screen confirmation that block 5 is the illustrated-story scene: the per-step PNGs
  in the capture runs read blank (frames grabbed while the guest was held stopped), so
  the tie to the visible scene rests on the invocation itself, not a screenshot diff.

### Next step (bounded, not started here)

Port the proven decoder to the engine (`packages/engine/src/loaders/` — extend
`daxVgaPicture.ts`/`dax.ts` dispatch for the 0x0c/0x0e/0x0f categories) with a
round-trip encode test plus the captured buffer as a golden, and update
`docs/engine/BUILD-QUEUE.md`'s P3.1 leaf (its "pixel packing unresolved" framing is now
stale). Separately, when the DOSBox-X slot frees: capture the real DAC 18..31 RGB values
on the proven route (see above) — that closes the last invented-color placeholder.

### Part 17 addendum (2026-07-22, same day) — engine port landed with the captured buffer as golden

The "Next step" above is DONE (static/browser lane only, no emulator):

- **Decoder ported faithfully** from `tools/gateway_pic_decode.py` to
  `packages/engine/src/loaders/daxVgaPicture.ts`: `parseGatewayPicPlanar5` (strict
  category-0x0c/0x0e/0x0f + exact-consume gate, `22 + prefix + height*5*width_div8`),
  `encodeGatewayPicPlanar5` (head + prefix verbatim, planes repacked — lossless
  round-trip proof), `gatewayPicPlanar5ToIndexedImage` (same honest partial palette as
  the vga-ext path: EGA16 + proven DAC 16/17, indices 18..31 `null`). Wired into
  `decodeDax` (`dax.ts`), scoped to `PIC*` filename stems per the Treasures-8X8D
  precedent; new block kinds `gateway-pic-planar5` and — for `PIC.DAX` id 29 only — the
  explicit typed refusal `gateway-pic-multiframe` (tail frames stay undecoded, no
  garbage render). The web asset browser labels the refusal ("multi-frame PIC block —
  tail-frame packing unsolved, skipped"); decoded single-frame pictures surface there
  automatically through the existing frame listing, no new UI.
- **Oracle golden in tests** (`packages/engine/test/dax-gateway-pic-planar5.test.ts`,
  6 tests): the TS decode of `PIC2.DAX` block 5 must hash to the captured buffer's
  comparable region (committed constants: full buffer `25293b40…`, bytes 8..7743
  `93c35721…`, full reference decode `1b97e75d…` — computed from the capture and
  re-verified this round via `--verify-capture`, exit 0), plus a direct all-7,736-byte
  compare when the git-ignored capture file is present (fixture copy:
  `packages/engine/test/fixtures/dax/gateway-pic-loader-buffer-01.bin`; original:
  `build/gateway-pic-loader-capture-20260722-b/pic-loader-buffer-01.bin`). Corpus: all
  72 single-frame blocks decode exact-fit AND re-encode byte-identically to the
  original decompressed bytes; dispatch census 72/1/1 (planar5 / typed multi-frame
  refusal / `PIC3.DAX` id 2 staying on the pre-existing plain-EGA animated path).
  Negative control: every CoK and DoK `PIC*.DAX` block (10 files) is rejected by the
  byte gate and keeps its original XOR-animated classification. Render-path test pins
  the partial palette (18..31 stay `null` — the renderer substitutes black, no invented
  colors). `dax-gateway-picture-families.test.ts`'s "UNRESOLVED" framing updated to
  point here; its byte-boundary assertions still pass unchanged.
- **Gates:** repo-wide `tsc --noEmit` clean; engine suite 163 files / 1,866 tests green
  (up from 162/1,860); focused web e2e `detection,asset-source-wiring` green.
- **Unchanged / still open** (same list as Part 17, none closed by the port): DAC
  18..31 real RGB values (live capture on the proven route remains the queued DOSBox-X
  step), prefix/head structure meaning, multi-frame tail-frame packing.

## Part 18 — multi-frame tail frames SOLVED (14-byte header + full planar5 XOR delta); prefix structure decomposed into category-bitmask components (2026-07-23)

Static-only round (no emulator — the DOSBox-X slot was owned elsewhere; Unicorn was
authorized but not needed). Both remaining STATIC unknowns from Part 17's "Still open"
list are closed or materially narrowed: the multi-frame tail-frame packing is **solved
with a lossless round-trip**, and the 17/33/41-byte prefix structure is **decomposed
into proven positional components** (meanings still unidentified — named honestly).

### 18.1 The corpus question first: exactly ONE multi-frame specimen exists

- A formula sweep over **every** Gateway `.DAX` file (not just `PIC*`) found planar5
  exact-fits ONLY in `PIC.DAX`–`PIC6.DAX`: 72 single-frame + 1 multi-frame (`PIC.DAX`
  id 29) + 1 plain-EGA (`PIC3.DAX` id 2). No `HEAD`/`BODY`/`BIGPIC`/`TITLE` block fits.
- Treasures (the engine sibling) was checked for more specimens: **negative** — its
  `PIC1.DAX`/`PIC1A.DAX` blocks are a DIFFERENT format entirely (an 11-byte
  height/width8-style header followed immediately by 6-bit DAC RGB data — the same
  embedded-palette family `treasures-pools-darkness-scoping.md` §2.3 describes, not the
  Gateway planar5 family; first byte 0x58 is height 88, not a frame count).
- So every claim below rests on ONE multi-frame block (6 frames, 5 tail frames). All
  five tails fit the same arithmetic and render coherently; that is the full available
  evidence base, stated plainly.

### 18.2 The disassembly fact that dissolves the "7-byte deficit"

Part 6 proved tail frames occupy a uniform 4,854-byte span and read it as "21-byte
header + 4,833-byte payload", leaving a puzzling 7-byte shortfall vs a full 4,840-byte
5-plane image. Completing the loader listing (`GAME.OVR` 0x4687e..0x46d1f, Capstone,
full-function read this time) settles the split:

- **The XOR loop operates on UNPACKED chunky buffers, not file bytes.** At
  `0x46bfd..0x46c01` the loop bound `[bp-0xaa]` is set to `[bp-0x22] − 1` where
  `[bp-0x22] = height × width_div8 × 8 = 7744` (Part 8's chunky capacity), and the
  reference buffer is allocated with that same capacity at `0x46bda` and filled from
  `curBuf` — the OUTPUT parameter of the `0x149:0x57` unpack call. So the game decodes
  each frame's file bytes to 7,744 chunky bytes first, then XORs chunky-vs-chunky.
- **The unpack codec is raw planar5** (Part 17, byte-exact oracle proof), so it must
  consume exactly `height*5*width8 = 4,840` file bytes for EVERY frame it is called on —
  tail frames included (they are unpacked with frame 0's own cached tail structure: the
  `[bp-0x66]==4` branch at `0x46b61` copies the saved 59-byte structure over the delta
  frame's own, so the unpack parameters are identical by construction).
- Therefore the tail-structure parser `0x149:0x5c` consumes exactly **one** byte (the
  0x04 category/reuse marker) for delta frames, and the per-frame consumption is
  `13 (fixed field reads, traced in Part 8) + 1 + 4,840 = 4,854` — **the exact observed
  stride**. The "7-byte deficit" never existed: Part 6's boundary math assumed every
  frame has the full 21-byte header, misattributing the delta's first 7 bytes to a
  phantom header tail. (Those 7 bytes are zero in all 5 tails — Part 8's own
  `01 04 00×7` byte-identity fact — because the image's top rows never change between
  frames; `01 04` is the real header tail: pad + category.)

Layout, final:

```
frame 0   : 21-byte header (cat 0x0c/0x0e/0x0f) + 17/33/41-byte prefix + P pixel bytes
frame 1..n: 14-byte header (u32 delay, u16 h, u16 w8, u16 x, u16 y, u8 pad=01,
            u8 cat=0x04) + P bytes = full planar5 XOR delta vs frame 0
P = height*5*width_div8;  total = 22 + prefix + P + (n-1)*(14 + P)
PIC.DAX id 29: 1 + (21+33+4840) + 5*(14+4840) = 29,165 = block length, zero slop
```

`frameN = unpack(frame0_planar XOR deltaN)` — computed in the planar domain here and in
the ported decoders, which is byte-identical to the game's chunky-domain XOR because
bit-plane unpacking is linear over GF(2). Deltas are all against frame 0 (the loop
always XORs against the frame-index-1 reference buffer — Part 7), i.e. the same
convention as CoK's `PIC*` XOR animation, not cumulative deltas.

### 18.3 Convergent content evidence (the "coherent render" bar)

- All 5 tail deltas are **97–99% zero bytes** (79/143/151/93/68 nonzero of 4,840) —
  sparse deltas, as Part 7's XOR disassembly predicted.
- Nonzero delta bytes cluster in rows 38–68 with **0.94 cross-plane column
  consistency** (the same byte-column hit in ≥2 of a row's 5 planes) under the proven
  alignment — and the alignment question was decided empirically before the disassembly
  closed it: sliding the payload against frame 0's pixel stream, only the offset that
  equals the 14-byte-header split centers the changed pixels on the picture's fire
  (block 29 renders a burning-tree/fire scene); other offsets scatter them to the edges.
- All 5 reconstructed frames render as frame 0 with small, localized flame-flicker
  changes (31..151 changed pixels per frame of 7,744) — coherent animation, no noise.
- Strictest check: `encodeGatewayPicPlanar5Multi` (decode → re-encode) reproduces the
  original 29,165 decompressed bytes **byte-identically**.

### 18.4 Prefix structure decomposed (covariance over all 73 planar5 frame-0s)

Treating the bytes after the category byte as one stream `S = raw[15 .. 22+prefixLen)`
(the arbitrary "7 header-tail bytes + prefix" split hid the structure):

| cat | bits | len(S) | proven layout |
| --- | --- | ---: | --- |
| 0x0c | 1100 | 24 | `[core24]` |
| 0x0e | 1110 | 40 | `[comp16][core24]` |
| 0x0f | 1111 | 48 | `[comp8][comp16][core24]` |
| 0x04 | 0100 | 0 | `[]` (delta frame — structure reused from frame 0) |

- **comp16** begins with the 8-byte constant `10 32 54 76 98 ba dc fe` — the
  **low-nibble-first identity permutation of 0..15** (nibble pairs 0,1 / 2,3 / … /
  e,f). Found at S offset 0 in **58/58** cat-0x0e blocks, at S offset 8 in **2/2**
  cat-0x0f blocks, and **0/13** occurrences anywhere in cat-0x0c streams. Its remaining
  8 bytes vary per block. (Reading it as a 16-entry color-remap table with identity
  contents is plausible but NOT proven — recorded as `unknown_comp16`, first 8 bytes
  constant.)
- **core24** (all three categories, always last): its first 6 bytes have constant LOW
  nibbles `f c 4 f 9 4` across **all 73** specimens while the high nibbles vary freely
  — nibble-structured data, meaning unidentified (`unknown_core24`).
- **comp8** (cat 0x0f only, 2 specimens): pattern `5? fa 5? fa …` (bytes 0..3 have
  constant high nibbles 5,f,5,f and constant low nibble `a` at odd positions)
  (`unknown_comp8`; 2 specimens is too few to claim more).
- Length model: the component sizes fit "bit1 → 16 bytes, bit0 → 8 bytes, bit3+bit2
  base → 24 bytes, bit2 alone → 0 bytes" additively for every observed category. Only
  4 category values exist in the corpus, so the per-BIT attribution is a consistent
  model, not a proven rule (e.g. bit3 vs bit2 contributions cannot be separated).
- Falsification duly attempted: no component correlates with image dimensions (ALL
  planar5 blocks are 88×88 — dimension covariance is untestable in this corpus, so no
  dimension-based meaning is claimed for any field).
- The 8-byte runtime buffer head (`0000 8354 0000 01E4`) is unchanged by this round:
  Part 17 already proved it is not file data; it is runtime bookkeeping in the capture
  window, irrelevant to decoding, meaning still unidentified.

### 18.5 Deliverables

- **`tools/gateway_pic_decode.py`** extended: multi-frame decode (per-frame PNGs), the
  strict exact-consume gate now covers single- AND multi-frame; all **74** blocks across
  `PIC.DAX`–`PIC6.DAX` decode (72 planar5 stills + block 29's 6 frames + the plain-EGA
  block); the `--verify-capture` oracle regression gate still passes (exit 0).
- **Engine** (`packages/engine/src/loaders/daxVgaPicture.ts` + `dax.ts` + `index.ts`):
  `parseGatewayPicPlanar5` now returns `{ outcome: 'multi-frame', multi }` with all
  frames decoded (typed refusal removed — it is no longer honest to refuse);
  `encodeGatewayPicPlanar5Multi` provides the lossless round-trip;
  `gatewayPicMultiFrameToIndexedImages` feeds the render path; `decodeDax` keeps the
  `gateway-pic-multiframe` kind but now populates `frames` like the plain-EGA animated
  path. The web asset browser (`apps/web/src/ui/main.ts`) lists the 6 frames instead of
  the refusal note.
- **Tests** (`packages/engine/test/dax-gateway-pic-planar5.test.ts`, 7 tests now): new
  multi-frame test pins the exact-consume arithmetic (29,165), 6 decoded frames, tail
  header shape (14 bytes, h/w8 match, pad 0x01, cat 0x04), 5-bit index validity, sparse
  bounded deltas (0 < changed < 500 px/frame), the lossless multi-frame re-encode, and
  the render path; the dispatch census flips from 72/1(refusal)/1 to 72/1(decoded,
  6 frames)/1. `dax-gateway-picture-families.test.ts` comments reframed to Part 18 (its
  boundary assertions were correct arithmetic all along and still pass unchanged).
- **Gates:** repo-wide `pnpm typecheck` clean; engine suite **163 files / 1,867 tests**
  green (up from 1,866).

### What Part 18 does NOT claim

- No meaning is assigned to `core24`, `comp16`'s varying half, or `comp8` — the
  decomposition and the constants are proven; the semantics are not.
- The per-bit component-size attribution is a model consistent with 4 observed
  category values, not a proven per-bit rule.
- DAC registers 18..31 RGB values remain UNLOCATED (renders still use declared
  placeholders / nulls) — the live capture on the proven route stays the queued
  DOSBox-X task, owned by a different lane.
- The multi-frame proof rests on the corpus's single specimen (5 tail frames); a
  second specimen would strengthen it but none exists in Gateway or its siblings.

### HANDOFF (Part 18)

- Multi-frame `PIC*.DAX` and the single-frame prefix boundaries are DONE — do not
  re-investigate; start from `tools/gateway_pic_decode.py` and
  `parseGatewayPicPlanar5`.
- Next bounded steps, in order of value: (1) the queued live DAC 18..31 capture on the
  Part 16 route (separate DOSBox-X lane); (2) component semantics — the most promising
  lever is the `0x149:0x5c` tail-structure parser: resolving segment `0x149` to real
  code (the known VROOMM gap, `vroomm-fixup-layout.md`) would show how comp8/comp16/
  core24 map into the 59-byte runtime structure whose bytes 33..56 are exported to the
  per-frame record (Part 8); (3) nothing else in this family is open.

## Part 19 — COMSPR.DAX blocks 254/255 RESOLVED: pixel-less planar5 structure records, applied VGA-only to the exploration and 3D-view screens (2026-07-23)

Static-only round (Capstone disassembly of retail `GAME.OVR` + corpus arithmetic; no
emulator — the DOSBox-X slot was owned elsewhere and was not needed). This closes the
last open item Part 3 left in the CBODY/CHEAD/COMSPR/DUNGCOM family: the two
`COMSPR.DAX` blocks (ids 254 and 255, 58 and 50 bytes, all-zero geometry header) that
every decoder rejected.

### 19.1 Identification — the Part 18 grammar fits with zero slop

Reading each block as a planar5 frame header with ZERO geometry followed by the
Part 18 category-gated component stream:

```
raw[0..8)  u16 height=0, u16 width_div8=0, u16 x=0, u16 y=0
raw[8]     0x01                  (the pad/count byte — same position+value as planar5)
raw[9]     category              (254: 0x0f, 255: 0x0e)
raw[10..]  component stream S    (0x0f → [comp8][comp16][core24] = 48 bytes,
                                  0x0e → [comp16][core24] = 40 bytes)
P = height*5*width8 = 0 pixel bytes; total = 10 + len(S)
block 254: 10 + 48 = 58 = block length, zero slop
block 255: 10 + 40 = 50 = block length, zero slop
```

Every Part 18 component signature is present:

- **comp16 opens on the identity nibble permutation** `10 32 54 76 98 ba dc fe` —
  EXACT in block 255; block 254 varies in exactly one nibble (byte 6 high nibble
  `d`→`0`, i.e. nibble-entry 13 → 0).
- **comp16[8] = 0x7e** in both — the same opening byte of comp16's varying half seen
  in 57/60 of the PIC corpus's cat-0x0e/0x0f specimens (a strong mode Part 18 did not
  record; noted here as an observation, not a proven constant).
- **core24's first-6 low nibbles** are the constant `f c 4 f 9 4` in both — the 73/73
  PIC-corpus signature.
- No component VALUE equals any PIC specimen's component exactly (all three compared
  against all 73 frame-0 prefixes) — these are distinct records, not copies.

Corpus sweep: across **547 DAX files / 7,683 blocks of all nine installed titles**
(CoK, DoK, CoAB, Secret, Pool, PoD, Treasures, Gateway, + coab_extracted), the strict
gate (8 zero geometry bytes + `0x01` + known category + exact component length)
matches EXACTLY these two blocks. Even the pre-gate (zero geometry + count 1) has no
other hit — no sibling title, including Treasures, ships structure records.

### 19.2 Proven consumption (retail `GAME.OVR` disassembly)

- **Boot load, dedicated globals.** The boot preloader (the "Loading...Please Wait"
  function at `GAME.OVR+0x11091`) loads COMSPR's 26 real sprites via the pair loader
  (`0x138:0x34`, ids 0..11 in a loop + id 25 — the CHEAD/CBODY/COMSPR/ICON named
  loader at `GAME.OVR+0x4AE52` then fetches each id AND id+0x80 into the 8-byte slot
  records at `DS:0x7890/0x7894`, which is exactly why COMSPR's sprite ids come in
  +0x80 pairs: 0..11,25 / 128..139,153). The two structure records bypass all of that:
  `mov al,0xff … lcall 0x149:0x39` at `+0x11751` loads id 255 into `DS:0x53F8` and
  `mov al,0xfe … lcall 0x149:0x39` at `+0x11773` loads id 254 into `DS:0x53FC` — raw
  block loads with no per-item image unpack (`0x149:0x48` is never run on them).
- **Exactly one consumer each, both VGA-gated.** A full-file scan finds exactly two
  code references to each pointer (its boot-time store + one use):
  - `[0x53F8]` (block 255): `GAME.OVR+0x41E6A` — inside the exploration/area-view
    draw function at `+0x41E4F` (same segment as the " camping"/" search"/" in boat"
    status strings; the function then marks the party position from `[0x814E]+2/+3`).
  - `[0x53FC]` (block 254): `GAME.OVR+0x48410` — the very end of the 3D
    dungeon-viewport renderer at `+0x47C15` (3 coordinate args, /8 divisions,
    per-direction step tables at `0x319C/0x31A6`).
  Both sites are the identical pattern: `cmp byte [0x5DB6],3; jne skip; push 1;
  push 1; push [recordPtr]; lcall 0x149:0x43`. `[0x5DB6]` is the video-mode global
  (Part 11's 4-way dispatcher discriminator; live-confirmed = 3 under VGA in
  Part 16), so the records are applied ONLY in VGA mode.
- **`0x149:0x43` is the ordinary draw-image primitive.** Nine call sites exist in
  `GAME.OVR`; the other seven draw real loaded picture blocks with the same
  `(x, y, farptr block)` signature (five at `(0,0)` after `0x157:0x61`, one wrapper
  at `+0x4678D` passing caller coordinates, one at `+0x4CC35` drawing `[0x7884]`).
  Drawing a zero-geometry record therefore runs only the header/structure parse —
  zero pixels — i.e. these are **structure-apply calls disguised as draws**.

### 19.3 Verdict, and what is honestly NOT claimed

**Blocks 254/255 are VGA-mode-only color/structure setup records for the two
picture-less play screens** (exploration view ← 255, 3D dungeon view ← 254), carried
in the boot-time-preloaded COMSPR.DAX for packaging convenience. They are the
"COMSPR mini-records" `dax.ts`'s module doc had flagged; the flag is now retired.

NOT claimed: the component MEANINGS. comp8/comp16/core24 remain `unknown_*` exactly
as Part 18 records for the PIC prefix (the `0x149` overlay segment's implementation
is still the known VROOMM gap). The nibble-table reading of comp16 (two 16-entry
near-identity tables — e.g. 254's first table remaps entry 13 → 0) is recorded as an
observation. **Lead for the queued DAC 18..31 live-capture lane:** if `0x149:0x43`'s
structure-apply programs extended DAC registers, these two records are the register
18..31 RGB SOURCE for the main play screens — capturing the DAC after simply entering
the 3D view or area view in VGA mode (no specific picture needed) would settle both
open items at once. Recorded as a lead, not a claim.

### 19.4 Deliverables

- **`tools/gateway_pic_decode.py`**: new `--structure-records` mode (strict-gate scan,
  component dump, signature check; exit 0 only if every zero-geometry candidate parses
  exactly). The `--verify-capture` oracle regression gate still passes (exit 0).
- **Engine**: `daxVgaPicture.ts` gains `parseGatewayPicStructureRecord` /
  `encodeGatewayPicStructureRecord` (+ `GatewayPicStructureRecord`,
  `GATEWAY_STRUCTURE_RECORD_COMPONENTS`); `dax.ts` dispatches the new
  `'gateway-structure-record'` kind (typed classification, `structure` field, image
  null BY DESIGN) just before the `'complex'` fallback; the web asset browser notes
  the kind instead of "unsolved variant". No `index.ts` re-export this round (the file
  had a sibling agent's in-flight edits; the loaders are importable from their module).
- **Tests** (`dax-gateway-picture-families.test.ts`, now 14 tests): the "genuinely
  unresolved" test is replaced by the resolved one — exact category/length/component
  shape, both signatures, `comp16` identity constant for 255, lossless round-trip to
  the retail bytes, `decodeDax` census 26 `'frame'` + 2 `'gateway-structure-record'`,
  and a CoK/DoK negative control (no committed-corpus block passes the gate).
- **Gates**: my touched files typecheck clean and the DAX suites pass (9 files /
  59 tests + the families file 14/14). NOTE (honest): the full engine suite currently
  shows 5 failures in `dqkEvents.test.ts`/`buildDqkGameMulti.test.ts` plus one repo
  typecheck error (`eclEncode.ts` TS6133) — all verified PRE-EXISTING against a
  stashed working tree and owned by the concurrent ECL/CoK lane's in-flight edits,
  not this round (its own files were untouched here).

## Part 20 — static VGA pictures corrected by native CPIC/RAM oracle; Gateway combat calibrated (2026-07-24)

The Part 17 PIC result generalized farther than the historical Part 2 interpretation admitted.
Gateway's static VGA family has the exact layout:

```text
17-byte standard frame header
33-byte preserved metadata prefix
height rows * 5 planes * width_div8 bytes
plane order: bit 0, bit 1, bit 2, bit 3, bit 4
pixel bit order: MSB first
```

The former `17 + rows*(4bpp+1bpp) + 33-byte trailer` formula has the same byte count, so its
decode/re-encode test was self-consistent but could not establish pixel meaning or whether the 33
bytes came before or after the raster. Native demo evidence settles both ambiguities. The t=150
1-MiB checkpoint has a byte-indexed 48x48 region whose equality partition matches the t0128 Giant
Squid crop uniquely. Correct planar5 decode of retail `CPIC2.DAX#68`, horizontally mirrored as in
the frame, reproduces the figure's source-index structure. The old nibble interpretation produces
noise and does not match.

The same strict size/header gate applies to every already-classified `TITLE`, `BIGPIC1`, `BODY`,
and `CPIC2..6` member; all still round-trip byte-for-byte. A retail golden pins the dominant squid
index counts (`0:897`, `8:436`, `12:216`, `28:228`, `29:116`). Source index 0 is Gateway CPIC's
transparent plane; source 8 is opaque black. Retail combat separately maps the all-zero
`DUNGCOM#22` tile to tactical index 8, whose active DAC is blue, so the browser keeps those roles
distinct through title-specific CPIC and backdrop remaps.

`match_gen1_combat_icons.py --palette-invariant` now decodes this prefixed planar5 family. Across
frames t0126..t0166 it recovers party pictures 74/75/76/60, their observed grid positions and
individual horizontal mirrors, and CPIC 68's west-facing 48x48 squid. The web profile uses those
assets and the native t0138/t0140 snapshot; the second scripted squid is seated east of the initial
camera rather than piled on the visible one. Focused production e2e completes the real 4v2 battle
with changing turns/actions and no missing asset or browser errors.

---

## Part 21 — DAC registers 18..31 CLOSED: the palette is in the picture, not the executable (2026-08-11)

Parts 2, 4 and 5 established the register *indices* (16..31, fully enumerated) and then stalled
on the *values*: the bulk loader reads its RGB triplets from `DS:0xA108`, and `DS` is a genuine
VROOMM relocation entry that neither a preload byte-copy nor a twice-reproduced execution
breakpoint resolved. Four DOSBox-X rounds treated this as a dynamic-tracing problem.

It was not. **There is no static RGB table anywhere in Gateway.** `0xA108` is a *work buffer*
that the game refills for every picture it displays, from 24 nibble-packed bytes carried in the
picture block itself. That is why Part 4's search could not succeed and why the values were not
in the executable to be found.

### The rule

The 24 bytes ending at a block's pixel offset hold two interleaved nibble planes:

- taken in byte order, the **low** nibbles grouped in threes give DAC registers **16..23**;
- the **high** nibbles grouped in threes give **24..31**;
- each nibble is a 6-bit DAC component shifted left by 2 (so `f` → `0x3C`).

Worked example, `PIC2.DAX` block 5:

```
core24  df 6c 04 cf 49 c4 52 32 02 68 38 28 f7 a0 97 d3 73 6a a0 60 56 e3 93 83
lows     f  c  4  f  9  4  2  2  2  8  8  8  7  0  7  3  3  a  0  0  6  3  3  3
highs    d  6  0  c  4  c  5  3  0  6  3  2  f  a  9  d  7  6  a  6  5  e  9  8
```

`(f,c,4)<<2 = (0x3C,0x30,0x10)` and `(f,9,4)<<2 = (0x3C,0x24,0x10)` — **exactly** the two values
Part 2 proved are written to registers 16 and 17 by the `INT 10h AX=1010h` calls at `GAME.OVR`
0x515a2. That is the load-bearing check: two independently known constants must fall out of the
rule, and they do.

### Why this is not a fit

- **It is self-checking, and the check is not free.** The first six low nibbles must be
  `f c 4 f 9 4`. They are, in **73/73** `PIC*.DAX` blocks — and also in **54/54** blocks of the
  separate vga-ext family (`TITLE.DAX` 5, `BIGPIC1.DAX` 6, `BODY.DAX` 13, `CPIC2.DAX` 30), which
  have different geometry and a different parser. A wrong window fails this immediately; the
  decoder returns `null` and falls back rather than inventing colours.
- **The retail loader agrees.** `GAME.OVR` contains exactly one `mov dx,0x3c8`, at `0x5156e`, and
  its context is `mov si,0xA108; mov cx,0x0E; … mov dx,0x3C8; mov bl,0x12` followed by
  `out dx,al; inc dx; lodsb/out ×3` — start at register **18**, write **14** triplets, i.e.
  **18..31**. The routine at `0x51513` loops `bx = 0..0x17` over a 24-byte buffer at `DS:0xA132`,
  writing `(al & 0x0f) << 2` into `DS:0xA102` and `(al & 0xf0) >> 2` into `DS:0xA11A` — the low
  and high nibble planes. `0xA108` is low-plane triplet 2, i.e. register 18, and the 42-byte run
  continues contiguously into the high plane at `0xA11A`, so high triplet 0 lands on register 24.
- **The negative result is now explained, not merely recorded.** Searching `GAME.EXE`,
  `GAME.OVR`, `START1.EXE` and `TANSLTL.EXE` for the literal bytes `3c 30 10` and `3c 24 10`
  returns **zero** hits. A runtime-computed buffer predicts exactly that; a static table does not.
- **The colours are plausible as art.** `PIC2` block 5's registers 28..31 are
  `(243,162,146) (210,113,97) (162,97,81) (227,146,130)` — a four-step flesh ramp — and the block
  renders as a dwarf and a woman in correct skin tones, gold and green, where it previously
  rendered with a grey placeholder ramp above index 17.

### Landed

- `packages/engine/src/loaders/daxVgaPicture.ts` — `gatewayExtendedDacFromCore24`,
  `gatewayExtendedDacFromPicture`, `gatewayExtendedPaletteFromPicture`. All three picture render
  paths (vga-ext frame, planar5 single-frame, planar5 multi-frame) now emit a full 0..31 palette
  with `source: 'dax-vga-ext'`; `buildGatewayVgaExtendedPalette` remains as the fallback and keeps
  18..31 `null`.
- Note the window is anchored to the **pixel offset**, not the start of the prefix: category
  `0x0c` blocks have only a 17-byte prefix, so their 24 bytes begin seven bytes earlier, inside
  the frame header's tail. Anchoring to the prefix silently breaks 13 blocks.
- `tools/gateway_pic_decode.py` — `extended_dac_from_core24`, and `build_palette` now takes the
  block's `core24` instead of a placeholder ramp.
- Tests: `dax-gateway-pic-planar5.test.ts` (73-block corpus sweep, plus a mutation test proving a
  single flipped nibble makes the decoder fall back rather than guess) and
  `dax-vga-picture.test.ts` (the 54-block cross-family sweep).

**Still open** from Part 18: `comp16` and `comp8`. What is now established about them is only a
negative — they are **not** palette data, because `core24` fully accounts for all 16 extended
registers. Their first 8 bytes are the constant `10 32 54 76 98 ba dc fe` in 58/58 cat-`0x0e`
blocks; the "two 16-entry nibble tables" reading of that remains speculative and untested.

## Part 22 — the two COMSPR structure records ARE the play screens' extended palettes (2026-08-11)

Part 19 closed blocks 254/255's *structure* and their *consumers* by disassembly (255 → the
exploration/area view at `GAME.OVR+0x41E6A`, 254 → the 3D dungeon viewport at `+0x48410`, both
gated on the VGA video-mode global `[0x5DB6] == 3`), but explicitly left the component *meanings*
open and recorded one lead:

> **Lead for the queued DAC 18..31 live-capture lane:** if `0x149:0x43`'s structure-apply
> programs extended DAC registers, these two records are the register 18..31 RGB SOURCE for the
> main play screens […] Recorded as a lead, not a claim.

Part 21 then solved `core24` for pictures: it is the 16 extended DAC registers, nibble-interleaved
(low nibbles → 16..23, high nibbles → 24..31, each nibble a 6-bit DAC component `<< 2`), and it is
**self-checking** because registers 16 and 17 were derived independently from `GAME.OVR`'s
INT10 AX=1010h writes.

Applying that rule to the structure records settles the lead **statically** — the live DAC capture
Part 19 proposed is not needed:

| Block | Screen (Part 19, by disassembly) | `core24` at | Self-check |
| ---: | --- | ---: | --- |
| 255 | exploration / area view | offset 26 | passes — reg16 `(243,194,65)`, reg17 `(243,146,65)` |
| 254 | 3D dungeon viewport | offset 34 | passes — same two registers, exactly |

Both offsets are exactly where Part 19's grammar puts `core24` (`0x0e` → `10+16`; `0x0f` →
`10+8+16`), so this is the documented component, not a window found by searching.

**Discrimination.** Sliding a 24-byte window over every byte of all 28 decompressed COMSPR blocks
gives 7,394 candidate windows; exactly **2** pass the self-check — these two, at these two offsets.
Flipping a single nibble in either kills it. The rule is not fitting noise.

**The recovered registers 18..31, per play screen** (8-bit, `round(v*255/63)`):

| Reg | 255 — exploration view | 254 — 3D view |
| ---: | --- | --- |
| 18 | (0, 130, 0) | (0, 113, 0) |
| 19 | (0, 130, 130) | (0, 113, 113) |
| 20 | (130, 0, 0) | (113, 0, 0) |
| 21 | (130, 0, 130) | (113, 0, 113) |
| 22 | (130, 49, 0) | (113, 49, 0) |
| 23 | (210, 210, 210) | (210, 210, 210) |
| 24 | (130, 130, 130) | (130, 130, 130) |
| 25 | (113, 113, 243) | (130, 130, 243) |
| 26 | (49, 210, 49) | (49, 210, 49) |
| 27 | (178, 97, 81) | (97, 97, 97) |
| 28 | (243, 0, 0) | (243, 49, 49) |
| 29 | (49, 49, 49) | (49, 49, 49) |
| 30 | (243, 130, 113) | (243, 130, 113) |
| 31 | (0, 0, 97) | (227, 227, 227) |

Registers 18..24 are recognisably the EGA hues 2..7 re-rendered at VGA precision (dark green,
cyan, red, magenta, brown, light grey, dark grey) at a slightly lower intensity than EGA's own
`0x2A/0x3F` pair — i.e. the extended bank is a *refinement* of the base 16, not an unrelated set.
25..31 are where the two screens genuinely diverge, register 31 most sharply (a near-black blue for
the area view, near-white for the 3D view).

**Mutual corroboration with Part 19.** Part 19 recorded, as an unexplained observation, that
"`core24`'s first-6 low nibbles are the constant `f c 4 f 9 4` in both — the 73/73 PIC-corpus
signature." Part 21 explains that constant exactly: `(0xf,0xc,0x4) << 2 = (0x3C,0x30,0x10)` is
register 16 and `(0xf,0x9,0x4) << 2 = (0x3C,0x24,0x10)` is register 17, the two registers
`GAME.OVR` programs directly. The signature Part 19 could only pin as data was the self-check.

**What is NOT claimed.** That `0x149:0x43`'s structure-apply is *how* these reach the DAC remains
unproven — the `0x149` overlay's implementation is still the known VROOMM gap, and no live capture
was run. What is established is narrower and sufficient: the records carry a well-formed extended
palette in the same encoding the picture families use, one per screen, and Part 19 already proved
by disassembly which record each screen loads. `comp8`/`comp16` stay open exactly as Part 21 left
them; the negative there is now doubly supported, since `core24` accounts for all 16 registers in
these records too.

**Landed:** `packages/engine/test/dax-gateway-picture-families.test.ts` gains a test decoding both
records' palettes, asserting the self-check, that the two differ, and pinning register 31's two
retail values. No renderer was wired to them — which screen consumes which is settled, but the web
explorer's own palette path is a separate change, deliberately not made here.
