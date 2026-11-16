# Treasures of the Savage Frontier's third `8X8D` wall-tile sub-format — SOLVED (2026-07-21, round 3)

Fresh, time-boxed attempt at the third `8X8D` sub-format flagged in
`docs/engine/HANDOFF.md`'s "walk any area" picker section (2026-07-19) and surfaced live in
`apps/web/src/ui/docs.ts:137`: Treasures' `8X8D1.DAX` (12 blocks) has a header the standard
DAX plane-strip/tile-array detection in `packages/engine/src/loaders/dax.ts` doesn't
recognize, so `loadDungeonWalls`'s `loadTiles` (`packages/engine/src/world/dungeonWalls.ts`)
catches the decode failure and returns a blank tile set — the Treasures explore route boots
and is walkable, but wall art for this specific bank is absent.

**Verdict: SOLVED — a real, wired-in decoder exists and renders visually coherent wall
art.** Round 1 found real structural facts and six visually-ruled-out pixel-packing
hypotheses (all tested against the WRONG pixel format/geometry, as round 2 explains).
Round 2 resolved round 1's open executable-oracle lead in full: both stuck far-call
targets are identified and disassembled, revealing the true pixel geometry is a
**sparse per-scanline span list of plain 8bpp VGA-chunky bytes** copied via `Move()`,
not a dense 4bpp tile grid — which is why every round-1 hypothesis produced noise.
Round 2 left two things open: the DGROUP `LOOKUP_TABLE`'s real segment/contents, and the
raw-block-to-table population step. **Round 3 (2026-07-21, "Round 3" section below)
closes both**: `LOOKUP_TABLE` is not a static DGROUP constant at all — it is rebuilt
per-resource from bytes already inside the same DAX block, and a SEPARATE mode dispatch
in the same draw routine (mode 2, the one Treasures' real `8X8D1.DAX` blocks use) copies
its pixel payload completely verbatim, with no table lookup in that path at all.
`packages/engine/src/loaders/daxTreasures8x8dTile.ts` implements this, is wired into
`decodeDax()`'s fallback chain (`packages/engine/src/loaders/dax.ts`, gated to `8X8D*`
stems), and produces render-verified, visually coherent 64×256 wall-texture tiles for
all 12 real blocks in `8X8D1.DAX`.

Source: the user's local GOG install, `C:/Program Files (x86)/GOG Galaxy/Games/Treasures of
the Savage Frontier/8X8D1.DAX` and `GAME.OVR` (not vendored into the repo — same convention as
every other Gateway/Treasures test in this project).

## What is proven (real, checkable facts)

1. **Container-level decode is fine.** `8X8D1.DAX`'s TOC parses cleanly (12 entries, block ids
   `1,2,7,8,9,10,11,12,13,14,15,16`); the SSI signed-byte RLE decompresses every block to
   **exactly 16818 bytes**, uniform across all 12 blocks. This is not a compression or
   container-format problem — it is purely a "what do these 16818 decompressed bytes mean"
   problem.
2. **A genuinely constant 10-byte prefix, header bytes `08 01 00 00 00 00 00 01 20 6f`,
   identical across all 12 blocks** — confirmed byte-for-byte. Byte 10 is the first position
   where any two blocks ever differ. This does NOT match either of `dax.ts`'s two working
   8-or-17-byte header conventions read as `{height, width_div8}` `u16` pairs (CoK's own
   `8X8D1.DAX` block 202's header is `08 00 01 00 00 00 00 00` — the `01` sits at byte **2**,
   not byte **1** — so Treasures' layout is a genuinely different field arrangement, not a
   parser bug reading a CoK-shaped header wrong).
3. **Every block's remaining 16808 bytes are real, distinct per-block content** — confirmed by
   MD5 (12/12 unique hashes) and by locating the first byte where each block's content
   actually diverges from block id 1 (block id 2 diverges at byte 127; ids 7-16 diverge at
   byte 10, i.e. immediately after the shared header). This rules out "it's the same tile bank
   repeated with a corrupt TOC" — the RE surface really is 12 independent tile banks.
4. **A structured, provably non-random low-byte-value region immediately follows the header.**
   From byte 10, block id 1 runs **338 consecutive bytes that are all `<= 0x3F`** before the
   first byte exceeding that range (`0x45` at relative offset 338). A run this long occurring
   by chance in unconstrained byte data has probability `0.25^338` — this is not noise, it is
   deliberately constructed. Read as 6-bit-DAC RGB triples (each component naturally `<=63`,
   the same scaling `docs/hlib-format.md` and `daxVgaPicture.ts` already use for VGA DAC
   registers), the first several triples form a smooth hue ramp: `(00,00,3f) -> (10,00,3f) ->
   (1f,00,3f) -> (2f,00,3f) -> (3f,00,3f) -> (3f,00,2f) -> (3f,00,1f) -> (3f,00,10) ->
   (3f,00,00) -> ...` (blue -> magenta -> red), exactly the shape of a genuine palette/lighting
   ramp table, not incidental pixel content. **This is a real, positive, byte-level
   observation — not proof of a palette, since no boundary length was confirmed (see "What
   remains unresolved" below), but a load-bearing clue for whoever continues this.**
   - Corroborating (weaker) evidence: blocks id 1 and id 2 share their first **117** post-header
     bytes identically (diverging at byte 127) — `117 == 39 * 3` exactly, landing on a clean
     RGB-triple boundary rather than an arbitrary byte count. Consistent with, but not proof
     of, a shared base palette between two blocks that diverges after color 39.
5. **A real (if noisy) 8-byte periodicity signal.** Row-to-row byte autocorrelation (the same
   technique that cleanly proved Gateway `TITLE.DAX`'s 200-byte row stride in
   `gateway-vga-picture-format.md` Part 2) picks stride **8** as the best-fitting candidate
   from every tested starting offset (10, 346, 350, 360, 400), consistent with an 8-pixel-wide
   row (`8px / 2px-per-byte = 4 bytes`, or an 8-bit-per-row 1bpp extension plane) somewhere in
   the payload. The signal is real but far weaker (mismatch fraction ~0.35-0.36) than
   `TITLE.DAX`'s clean ~0.0997 — meaning SOME 8-wide row structure is present, but not
   uniformly across the whole 16808-byte payload the way it is for `TITLE.DAX`'s single
   320-wide image. This is consistent with a tile BANK (many independent 8x8 tiles, each with
   its own internal edges, rather than one large coherent picture) — row correlation across
   arbitrary tile boundaries is expected to be much noisier than within one continuous image.
6. **Exact, zero-slop tile-count arithmetic exists at header length 18** (not the observed
   constant-prefix length of 10 — see "What remains unresolved"): `16818 - 18 = 16800`, and
   16800 is divisible by **both** 32 (8x8 plain 4bpp tile, CoK/DoK's own convention: `525`
   tiles) **and** 40 (8x8 tile with a per-row 1bpp extension plane interleaved, Gateway's
   `daxVgaPicture.ts` convention generalized to a small tile: `420` tiles). Header length 18
   matches `dax.ts`'s existing `TILESET_HEADER` constant exactly (17-byte CoK/DoK header + 1),
   and is consistent with the constant 10-byte prefix being only the FRONT of a longer header
   whose remaining bytes (10..17, `field_9`-equivalent) are genuinely block-varying metadata —
   exactly how CoK's own `field_9` is documented ("EGA-plane/editor metadata; ignored for
   render").

## What remains unresolved (do not invent past this point)

- **No pixel-packing hypothesis rendered coherently.** Six were implemented and rendered to
  PNG (`renders/treasures_8x8d_probe/`, git-ignored, not committed — paths below for whoever
  reproduces this), all against block id 1 of `8X8D1.DAX`:
  1. Header=10, `parseTileStrip`-style 16px-wide strip (8 bytes/row, CoK's own tile-strip
     convention) — `2101` pixel rows, **not** a multiple of 8, and the render
     (`id1_w16_h10.png`, reshaped wider for viewing) is visual noise.
  2. Header=10, wide strip at 128px (`id1_w128.png`) — noise; only the very first few rows
     (the presumed palette region) show real color structure, everything below is black/white/
     grey dither with no recognizable shapes.
  3. Header=10, wide strip at 64px (`id1_w64.png`) — same result, noise.
  4. Header=346 (skipping the ~336-byte/112-color palette candidate from fact 4 above), wide
     strips at 128px and 64px (`id1_afterpal_w128.png`, `_w64.png`) — still noise; skipping the
     presumed palette region does not reveal hidden structure at these widths.
  5. Header=18, 8x8 tiles, plain 4bpp EGA packing (32 bytes/tile, 525 tiles exactly,
     `id1_tiles8x8_h18.png` / `_h10.png` variants) — noise; no tile boundary shows a
     recognizable icon/arrow/gauge shape, despite the byte-count fitting exactly.
  6. Header=18, 8x8 tiles with a per-row 1bpp extension plane interleaved (the
     `daxVgaPicture.ts` row convention, 40 bytes/tile, 420 tiles exactly,
     `id1_ext40_h18.png`) — noise, dominated by a single arbitrary hue in the visualization
     palette (an artifact of the extension bit being set on most pixels under this
     interpretation, not real color variety).
  Both nibble orders (high-nibble-left / low-nibble-left) were implicitly covered by the
  `expandIndices`-equivalent logic reused from `dax.ts`/`daxVgaPicture.ts`, which already
  fixes that convention; a deliberate swap was not separately re-tried this round since none
  of the six geometry/header hypotheses got far enough to make nibble order the limiting
  factor.
- **The exact length of the low-byte-value ("palette-like") region from fact 4 is not
  determined.** 338 bytes is where a break happens for block id 1 specifically; it does not
  land on a clean multiple of 3 (338 mod 3 = 2), so either the true palette is shorter (ending
  at the nearest triple boundary, byte 336 = 112 colors) with 2 stray bytes before real pixel
  data begins, or the "palette" framing is wrong entirely and this is coincidentally
  low-valued real pixel/dither content. Neither was confirmed by a coherent render (attempt 4
  above tested skipping 336 bytes specifically and found no improvement).
- **Executable-oracle lead opened, not finished.** `GAME.OVR` (Treasures' FBOV/VROOMM overlay
  pool) contains the literal Pascal-length-prefixed filenames `bord`, `8x8d0`, `8x8d1` at file
  offset `0x4bb3a` (confirmed present via direct byte search — Treasures stores resource names
  lowercase, same convention `gateway-vga-picture-format.md` already documented for Gateway).
  Immediately following, at `0x4bb4b`, is a real Pascal-calling-convention function
  (`push bp; mov bp,sp; ...`) that dispatches on a mode byte at `[bp+6]` (comparing against `4`
  and `3`) to select among filename-table entries before making a far call chain. Disassembly
  (Capstone, 16-bit real mode) traced this function to its end at `0x4bd05` and found two
  concrete, useful clues:
  - A record-descriptor field read as `word ptr es:[di + 0x12]`, used both as a multiplicand
    (`mul word ptr es:[di+0x12]`, i.e. `tile_index * this_field` — strongly suggestive of a
    **per-tile byte stride**, exactly the missing constant this investigation needs) and later
    pushed as a parameter to a far call at `0xa77:0x1aaf`.
  - A second far call at `0x229:0x1350`, invoked with the two globals at file offset `0x93ce`/
    `0x93d0` (the likely "current decoded-tile buffer segment:offset" pair) as its arguments —
    the strongest candidate in this trace for the actual pixel unpack/blit routine.
  **Not completed this session:** mapping overlay segments `0xa77` and `0x229` to file offsets
  within `GAME.OVR`'s VROOMM descriptor table (this project already has `tools/vroomm_layout.py`
  and `tools/gen1_map.py` for exactly this kind of segment resolution, used successfully for
  Gateway in `gateway-vga-picture-format.md` Part 4) and disassembling routine `0x229:0x1350`'s
  inner loop — that loop, once found, would very likely BE the format spec, per this project's
  established "the tile-drawing routine's read loop is the spec" precedent. Also unresolved:
  whether `[bp+6]`'s cases `0`/`3`/`4` actually select among `bord`/`8x8d0`/`8x8d1` (the
  string-table offset arithmetic observed, `di = 0, 0x20, 0x25, 0x2b`, did not land on valid
  Pascal-string boundaries when tested against a naive "segment base = file offset of the first
  string" assumption — the real segment base needs the same VROOMM resolution as the two far
  calls above, not a guess).

## Round 2 (2026-07-21): the two far calls are resolved — draw routine located, read, and disassembled; pixel-decode inner loop found; row-table layout inside the raw block still open

Follows up round 1's "executable-oracle lead opened, not finished." Method: pure static
disassembly (Capstone, 16-bit real mode) of `GAME.EXE` and `GAME.OVR` from the same local
GOG install, cross-checked with `tools/vroomm_layout.py` and `tools/gen1_map.py`. **No
DOSBox-X used** (the project's active-slot rule for this round). New tooling: none —
everything below is ad-hoc Python against `capstone`/`tools/gen1_map.py`'s `parse_mz`,
matching this project's "no new tool file for a one-off probe" convention.

### Resolved: neither `0xa77` nor `0x229` is a VROOMM overlay-descriptor selector

Running `tools/vroomm_layout.py` against Treasures' `GAME.EXE`/`GAME.OVR` (`38` VROOMM
descriptors, `strict_status: verified`, `stub_selector_base: 0x40`) shows the tool's
inferred public-stub selector geometry only ever reaches as high as `0x40 + 263 = 0x147`
for descriptor 37 (the last of 38). Both `0xa77` (2679) and `0x229` (553) are far outside
that range and are classified `unresolved_relocated_segment` by the strict classifier.
`tools/gen1_map.py`'s independent legacy resolver (`selector*16 + CD3F stub` search)
likewise rejects both (`status: no_stub_at_primary_mz_header_base`). **This definitively
rules out round 1's open theory that these are calls into other VROOMM-loaded overlay
slots** — they are something else entirely.

### New finding: they are direct references into `GAME.EXE`'s own always-resident code

Segment `0xa77` appears, as the exact same literal 16-bit value, in **all 38 of
Treasures' VROOMM descriptors** (not just the dispatcher), at 53 distinct target offsets,
with individual offsets called anywhere from 1 to 967 times project-wide. Segment `0x229`
appears in 17 of 38 descriptors at 21 distinct offsets. This is the signature of a single,
permanently-resident shared library segment referenced by nearly every overlay unit — not
a per-descriptor VROOMM slot (whose placeholder segment value is unique per descriptor by
construction; see `tools/vroomm_layout.py`'s own `classify_lcall_routes`).

`GAME.EXE`'s own MZ header (`header_paragraphs = 32`, i.e. `header_bytes = 512`;
`relocation_count = 0`) plus its entry point (`entry_cs:entry_ip = 4356:18`) decode, at
`file_offset = header_bytes + entry_cs*16 + entry_ip = 0x11252`, to a genuine,
textbook DOS PSP-relocation startup stub (`mov ax,es; add ax,0x10; push cs; pop ds; ...`)
— proving the formula `file_offset = 512 + segment*16 + offset` is the correct mapping
from a resident-code segment:offset pair to a `GAME.EXE` file byte, for this game.

Applying that formula to segment `0xa77` offset `0x4df` (1247 decimal — the single
most-called of `0xa77`'s 53 target offsets, 967 sites) lands on two complete, cleanly
bounded x86 routines matching the textbook Pascal System-unit DOS file-I/O wrapper shape:
`INT 21h AH=0x40` ("Write File") immediately followed by another wrapper ending in
`INT 21h AH=0x3E` ("Close File"), each terminated by a clean `retf 4`. The classic Borland
Pascal "stack overflow check" prologue call (`mov ax,<locals size>; lcall 0xa77:0x4df`,
present at the start of every far-called procedure disassembled this round, always
immediately after `push bp; mov bp,sp`) also resolves to this same address, and the
plaintext string `"Runtime error"` (a well-known Borland Pascal RTL constant) is found at
file offset `0xa911` — 95 bytes before segment `0xa77`'s own computed start (`0xa970`),
exactly where a Pascal program's error-message table would sit immediately ahead of its
System unit code. **Segment `0xa77` is Treasures' resident Pascal System unit / runtime
library**, statically addressable via the formula above; several other of its target
offsets (`0xac2`, `0xadc`, `0xb4f`) also decode to plausible, well-formed instruction
sequences under the same mapping.

(A caution investigated and then ruled out: `GAME.EXE`'s entry stub, read a little
further past the PSP-relocation code, contains what looks like a small
compress/relocate-style routine — `AL` compared against marker bytes `0xB0`/`0xB2`
selecting `rep stosb` vs `rep movsb`, followed by a loop applying `ADD word ptr
es:[di],bx` corrections that resembles a manual relocation-table walk. This raised a real
concern that `GAME.EXE` might be a self-decompressing/self-relocating executable, which
would invalidate the flat file-offset formula above for most of the file. It does
**not**: the plaintext `"Runtime error"` string (found via a direct byte search, not
requiring any decode) proves large stretches of the resident program are stored
plain/uncompressed on disk, and the `~700`-byte clean decode below (zero garbage,
zero realignment, self-consistent constants) is far too long and too semantically
coherent to be a coincidental decode of compressed bytes. The stub is most likely a
narrower utility — e.g. VROOMM's own overlay-body decompressor, or specific to a resource
this session didn't need — not a whole-file unpacker. Flagged here as an honest,
investigated-and-resolved caution for whoever continues this thread, not silently
dropped.)

### `0x229:0x1350` — the actual draw routine, fully disassembled

`GAME.OVR`'s descriptor 37 (`ovr_file_offset 0x4bb1a`, the 8x8d dispatcher round 1 found)
contains, verified by direct hex read of the raw `9A` (LCALL) instruction operand bytes:

- `file 0x4bce6`: `9a af1a 770a` = `LCALL 0x0a77:0x1aaf` (round 1's "Move" candidate)
- `file 0x4bcfd`: `9a 5013 2902` = `LCALL 0x0229:0x1350` (round 1's "strongest draw
  candidate")

Applying the resident-segment formula, `0x229:0x1350` resolves to `GAME.EXE` file offset
`0x37e0`. Disassembling forward from there decodes **cleanly for ~700 bytes with zero
garbage/desync**, ending in a balanced `mov sp,bp; pop bp; retf`. The routine dispatches
on an `AL` mode byte into three sub-blocks (a genuine 3-way branch: default/fallthrough,
`cmp al,1`, `cmp al,2`), and **every one of the three modes shares the same skeleton**:
loop an index `i` from 0 while a per-index byte flag (`[i + 0x7e66]`, 0 = stop) is
nonzero, and for each active `i` call `LCALL 0xa77:0x1aaf` (see below) with a computed
`(source far ptr, dest far ptr, count)` triple built from four parallel per-index word
tables at fixed local-data offsets `0x7f0e`, `0x7fa2`, `0x7e52`/`0x81ae`, `0x805e`, plus a
far-pointer variable at `0x7e4e`/`0x7e50`.

**Mode 2's addressing is the smoking gun**: it computes
`dest = 0xA000:[ (i+8)*320 + TABLE_7F0E[i] + 8 ]` via an explicit `mov dx,0x140
(=320); mul dx` followed by 32-bit add/adc arithmetic normalizing into `ES:DI`, and
`source = RawBlockBase + TABLE_START[i] + 27`, with
`count = TABLE_END[i] - TABLE_START[i] + 1`. `0xA000` is VGA mode 13h's real linear
framebuffer segment; `320` is that mode's scanline byte stride. **This means the pixel
payload for this call path is plain 8-bit-per-pixel VGA-chunky bytes copied verbatim, one
scanline span at a time — not 4bpp/nibble-packed EGA data, and not a fixed 8×8 tile
grid.** This single fact retroactively explains why all six of round 1's tile-grid /
4bpp-nibble hypotheses produced visual noise: they were testing the wrong pixel format
*and* the wrong geometry (a sparse list of variable-length horizontal spans, not a dense
tile array). Mode 0 does an analogous span copy between two off-screen buffer segments
(`0xA200` → `0xA000`, same per-index offset table); Mode 1 copies into per-index
*allocated* segments read from yet another table (`0x78d2`), consistent with populating a
reusable tile/sprite cache rather than drawing straight to screen.

`0xa77:0x1aaf` — confirmed as a 3-far-pointer-plus-word-count call
(`push seg,off` src; `push seg,off` dst; `push count`; `LCALL 0xa77:0x1aaf`), exactly
Pascal's `System.Move(var Source, var Dest; Count: Word)` calling convention. Round 1's
own "es:[di+0x12], used as a multiplicand ... pushed as a parameter" clue is now fully
explained too: `GAME.OVR`'s dispatcher (the SECOND function in descriptor 37, starting
`0x4bbdf`, not the filename-select function round 1 read) computes
`ax = index * word[slot_far_ptr + 0x12]` (a genuine **per-loaded-resource byte stride**,
read from offset `0x12` of the loaded resource's own in-memory record — one record per
resource *slot*, not per tile as round 1 guessed), then calls `Move(slot_base +
index*stride + 27, staging_buffer_0x93ce + 27, stride)` to copy **one whole `stride`-byte
record** into a staging buffer at the file-confirmed globals `0x93ce`/`0x93d0`, before
calling `0x229:0x1350` with that staging buffer as its far-pointer argument. This closes
round 1's "whether the two globals are the strongest candidate" open question — confirmed
yes, by direct disassembly of the calling code, not inference.

### The pixel-decode inner loop, located and read (row-table build side)

Tracing one level deeper (the `[bp+8]!=0` "prepare" branch of the `0x4bbdf` dispatcher,
which calls `0x229:0x993` → a thunk to `0x229:0x5dde` → a near `call 0x8456` inside the
same function) surfaces the actual byte-consuming decode loop, disassembled in full
(`GAME.EXE` file offsets `0x2a99`-`0x2b30`, resolved the same way):

```
for outer = 1 .. resource.field_8:
  for inner = 0 .. resource.field_0x12 - 1:      ; field_0x12 = the SAME per-resource stride
    b1 = *(source_cursor + 1)                     ; read raw byte at cursor+1
    v1 = LOOKUP_TABLE[b1]                          ; table indexed by raw byte value
    b2 = *(source_cursor)                          ; read raw byte at cursor (no +1)
    v2 = LOOKUP_TABLE[b2]
    out_byte = (v2 << 4) | v1                      ; combine as a packed nibble pair
    resource_struct[0x1b + write_pos] = out_byte    ; write 1 output byte (0x1b = 27,
                                                     ; the SAME header-skip constant seen
                                                     ; throughout this whole investigation)
    write_pos += 1
    source_cursor += 2                              ; consume 2 source bytes per output byte
```

This is a genuine, checkable, format-defining loop: **two consecutive raw source bytes,
each passed through a lookup table, combine as a low/high nibble pair into one output
byte** — i.e. some kind of expand-then-repack scheme, not a direct 2-pixels-per-byte
unpack. **What remains unresolved**: `LOOKUP_TABLE`'s own address (`DS:0xcf14` under a
naive same-segment-as-code assumption) does **not** hold nibble-shaped data — reading it
under that assumption lands on plaintext spell-name strings ("Enlarge", "Reduce",
"Protection From Evil", ...), proving the assumption wrong. Pascal overlay programs
typically keep one process-wide DGROUP data segment shared by *all* overlay code (distinct
from each overlay's own relocated code segment), and this round did not locate that
DGROUP segment's real value — the same class of gap Gateway's own research
(`gateway-vga-picture-format.md` Parts 4-5) hit for an analogous "live DS segment" and
left unresolved even after extensive DOSBox-X dynamic tracing, which this round's rules
explicitly disallow. **Also unresolved**: exactly how `resource.field_8` (outer loop
bound), `resource.field_0x12` (stride), and the four per-row tables
(`0x7f0e`/`0x7fa2`/`0x7e52`&`0x81ae`/`0x805e`) get their initial values from the raw
16818-byte decompressed `8X8D1.DAX` block bytes — this round traced the CONSUMPTION side
of those tables in full but not their construction/population from the raw payload.

### Net verdict for this round

**Partial success**, per the task's own accepted-outcomes framing: both originally-stuck
far calls are now fully resolved and disassembled (a real result — round 1 could not even
determine whether `0x1aaf`/`0x1350` pointed at code at all), the draw routine's complete
body is read and understood at the algorithm level (span-copy into VGA linear
framebuffer, not tile-grid EGA), and the pixel-decode inner loop is located and
disassembled precisely (2-source-bytes → table-lookup-each → nibble-combine → 1
output-byte). What's still missing for a full `dax.ts` decoder: the DGROUP segment
holding `LOOKUP_TABLE`'s real values, and the raw-block-to-table population step. Per
this project's "UNLOCATED beats invention" rule, `dax.ts` is **still not modified** — the
existing `parseTileSet`/`parseTileStrip` fallback chain is untouched and these 12 blocks
still correctly fall through to `kind: 'complex'`. New regression-proof facts (the two
LCALL byte fingerprints, the resolved filename string table, and the VGA-blit code
fingerprint at `0x229:0x1350`) are pinned in
`packages/engine/test/dax-treasures-8x8d-thirdformat.test.ts`'s new second `describe`
block — byte-arithmetic facts only, same discipline as round 1, no decode claim.

## Round 3 (2026-07-21): the DGROUP lookup-table is recovered — it's per-resource, not static — and the real "mode 2" pixel path turns out not to need it at all

Follows up round 2's two open items (DGROUP segment for `LOOKUP_TABLE`, and the
raw-block-to-table population step). Method: pure static disassembly (Capstone, 16-bit
real mode) of `GAME.EXE`, PLUS a bounded from-scratch Unicorn (x86 real-mode CPU
emulator) real-mode DOS boot of `GAME.EXE` with a minimal hand-written `INT 21h`/`INT
10h` shim (file I/O backed by the real retail files, `findfirst`/`findnext` via `glob`,
a fake BIOS timer tick, on-demand page mapping) used ONLY to independently corroborate
the DGROUP segment value found by static analysis — **no DOSBox-X was used anywhere in
this round**, respecting the project's single-slot rule. The Unicorn boot was NOT used
to trace the actual pixel-decode path itself (it stalled on deeper DOS-environment gaps
— `AH=0x19`/`AH=0x47`/config-file-parsing paths — well before reaching resource
loading); once it had served its one job (corroborating DGROUP), the investigation
returned to pure static disassembly for everything else, which proved far more
productive.

### The DGROUP lookup-table is not a static constant — it's computed per block, from the block's own bytes

Round 2 assumed `LOOKUP_TABLE` (`DS:0xcf14` under a naive same-segment guess) was a
fixed DGROUP data-segment constant, and found that address held plaintext spell-name
strings instead — proof the assumption was wrong, not proof the table doesn't exist.
This round pinned DGROUP's real value two independent ways:

1. **Static**: a whole-file regex scan for the `B8 xx xx 8E D8` (`mov ax,imm16; mov
   ds,ax`) byte pattern in `GAME.EXE` finds exactly two hits with a plausible DGROUP
   value, both inside interrupt-handler-shaped code (a keyboard-ISR-shaped routine near
   file offset `0x9822`, a Ctrl-Break/critical-error-shaped routine near `0xa2b6`) — the
   standard "interrupt handlers reload DS with their own program's known-good DGROUP,
   since they can't trust the interrupted program's DS" idiom. Both reload the literal
   immediate **`0x0c3e`**. (The scan's only other hit, `0x0040`, is the well-known BIOS
   data area segment, not a DGROUP candidate.)
2. **Dynamic** (Unicorn, not DOSBox-X): booting `GAME.EXE` under the from-scratch shim
   and running past the Pascal RTL's own startup (`INT 21h AH=0x35` get-vector calls
   installing the Ctrl-Break/critical-error/divide-error hooks) shows `DS` settling to a
   single STABLE physical value for 8,000,000+ consecutive emulated instructions once
   RTL init finishes. Converting that physical value back to this file's own "nominal"
   segment convention (`nominal = physical_DS - image_load_segment`, the same convention
   round 2 already validated for resolving segments `0xa77`/`0x229`) lands on **exactly
   `0x0c3e` again** — full independent agreement with the static find.

`DS:0xcf14` under nominal segment `0x0c3e` is `file_offset = 512 + 0xc3e*16 + 0xcf14 =
0x194f4` — past `GAME.EXE`'s own EOF (`0x1195b`). This confirms `LOOKUP_TABLE` is BSS
(zero-initialized/runtime-populated memory, not file-stored data), which is exactly why
round 2's naive same-segment file read found garbage (real strings from an unrelated
part of the file) instead.

Reading `GAME.EXE`'s "prepare"/decode routine around file offset `0x2390`-`0x2522`
(reached by tracing one level deeper than round 2's read: the `[bp+8]!=0` "prepare"
branch → `0x229:0x993` thunk → `0x229:0x5dde` → near `call 0x8456`, continuing past
where round 2 stopped) shows `LOOKUP_TABLE` built **fresh, every single resource load,
directly from bytes already present in the SAME raw decompressed DAX block**:

- `LOOKUP_TABLE[0..15] = 0..15` — a plain identity-fill counting loop (file offset
  `0x248b`-`0x24a6`).
- Then, for `i = 0 .. numColors/2 - 1`: read one byte `b` from the block at
  `10 + numColors*3 + i` (the byte immediately after the embedded palette region),
  `LOOKUP_TABLE[paletteBase + i*2] = b >> 4`, `LOOKUP_TABLE[paletteBase + i*2 + 1] = b &
  0xF` (file offset `0x24c2`-`0x2522`).

`paletteBase` and `numColors` are read straight from the block's own header bytes 8 and
9 (`numColors = header[9] + 1`). **Cross-check**: this file's constant header byte 9 is
`0x6f`, giving `numColors = 112` — an EXACT match to round 1's completely independent,
purely byte-counting finding that the embedded low-value region is `336 = 112 * 3`
bytes (a clean RGB-triple boundary). A value derived from live disassembly matching a
value derived from unrelated static byte-counting, done in an earlier round with no
knowledge of this one, is strong evidence this header-field mapping is correct rather
than coincidental.

The same routine also copies the identical 336-byte palette region into a global
VGA-palette-staging buffer at `DS:(paletteBase*3 + 0xcc14)` — a second, independent
confirmation that `paletteBase`/`numColors` are being read correctly, since this copy's
own byte count matches the palette's already-established length exactly.

### The real pixel path (mode 2) doesn't consult the table at all

The SAME draw routine (file offset `0x288c` onward — inside the already-disassembled
`0x229:0x1350` from round 2) dispatches on a global mode byte (`[0x7e4c]`) into (at
least) three different pixel-decode paths:

- **Mode 0**: a complex nested-loop path with EGA-4-bitplane-mask logic that DOES
  consult `LOOKUP_TABLE` (this is round 2's already-documented `0x2a99`-`0x2b30` loop:
  2 source bytes → table lookup each → nibble-combine into 1 output byte).
- **Mode 1**: round 2's same simple 2-byte-nibble-pair-via-table loop, dispatched
  separately from mode 0 but sharing its shape.
- **Mode 2** (file offset `0x2bff`-`0x2c6e`): a plain, **table-free verbatim byte
  copy** — a Pascal `System.Move` inside a `for outer = 1 .. rowCount` loop, copying
  `stride` bytes per iteration straight from the block into the resource's pixel
  buffer. No table lookup anywhere in this path.

The palette-loader function that builds `LOOKUP_TABLE` explicitly gates its own work on
`cmp byte [0x7e4c], 2` (file offset `0x2447`) — proving mode 2 is the one Treasures'
real retail `8X8D1.DAX` uses, and confirming the table this task set out to recover is
real, correctly reconstructed, and simply **not consumed by this specific format's own
pixel data** — the pixel bytes are already final palette-relative values on disk.
`stride` and `rowCount` themselves come from the same header: `stride = header[0] *
header[1] * 8` (file offset `0x25a2`-`0x25ad`) and `rowCount` = header bytes 6-7 as a
little-endian u16 (file offset `0x28e1`-`0x28e5`, the same field the palette-loader
wrote earlier at `0x25f9`, itself copied from raw block bytes 6-7 at
`0x23cf`-`0x2405`).

### The full geometry, proven byte-exact against every real block

```
10                  header
+ numColors*3       embedded palette (6-bit DAC RGB triples), paletteBase..+numColors
+ numColors/2       LOOKUP_TABLE seed bytes (not needed for mode-2 pixels; parsed and
                     exposed by the decoder anyway, for diagnostics)
+ 4                 a "flag record" — semantics UNRESOLVED, not needed for pixel decode
+ 0x1c (conditional) an extra skip, proven ONLY for paletteBase===0x20 && numColors===0x70
                     (file offset 0x2566-0x2575's own hardcoded special case; reproduced
                     byte-for-byte, not generalized past what every real block matches)
+ stride*rowCount   plain row-major 8bpp chunky pixel bytes
```

For all 12 real `8X8D1.DAX` blocks (constant header `08 01 00 00 00 00 00 01 20 6f`):
`stride = 8*1*8 = 64`, `rowCount = 0x0100 = 256`, `paletteBase = 32`, `numColors = 112`,
cursor to pixel data = `10 + 336 + 56 + 4 + 28 = 434`, `434 + 64*256 = 16818` — the
block's own already-known total, exactly, zero remainder. This is implemented,
including every gate above as a strict self-verifying null-return check (most
importantly: the derived `remaining/stride` must equal the header's own declared
`rowCount`, or the whole parse is rejected), in
`packages/engine/src/loaders/daxTreasures8x8dTile.ts`.

### Visual verification

Rendered through the REAL TypeScript decoder (not just the Python prototype used to
derive the algorithm), all 12 blocks in `8X8D1.DAX` now decode
(`decodeDax(...).blocks[i].kind === '8x8d-treasures-mode2'`, `image !== null`).
Inspecting `renders/treasures_8x8d_probe/block{1,2,8}_REAL_TS_DECODER_w64.png`
(git-ignored, not committed) by eye: all three show clear, non-random, structured
wall/stone-texture imagery — horizontal banding with repeating brick/mortar-line
patterns running the full 256-row height, each block in a visibly different, coherent
color family matching its own embedded palette (block 1: orange/brown/cream with a
lighter decorative band; block 2: dark red/maroon/black; block 8: green/black/grey).
This meets the task's explicit "visually coherent, not just byte-count-plausible" bar.

### What remains honestly unresolved

- **The true color of decoded values 0..15.** These render as pure black in the
  verification PNGs purely for inspection — that is NOT a proven palette entry. This
  format's embedded palette only covers `[paletteBase, paletteBase+numColors) = [32,
  144)`; DAC registers 0..31 are presumably a separate, shared/global palette this
  format does not carry, and its real contents were never located this round.
- **The 4-byte "flag record"'s meaning.** Only proven as bytes to skip; the
  disassembly shows its first byte gates a conditional 3-byte copy into a small global
  buffer, not modelled further since it isn't needed for pixel decode.
- **The general rule behind the 28-byte conditional skip.** Proven only as the literal
  hardcoded special case `paletteBase===0x20 && numColors===0x70` (matching the
  disassembly exactly, and matching every real block in this file). Whether other
  `paletteBase`/`numColors` combinations exist anywhere in this game or others, and if
  so what skip (if any) they'd take, is UNLOCATED — not generalized past what's proven.
- **Modes 0 and 1's own decode paths** (the ones that DO consult `LOOKUP_TABLE`) were
  traced enough to prove they exist and roughly how they differ from mode 2, but were
  not implemented — no `8X8D1.DAX` block in this game's retail files uses them, so
  there was nothing to render/verify against, and per this project's discipline an
  unverifiable implementation is not shipped.

### Net verdict for this round

**Full success** against this round's explicit assignment: the DGROUP lookup-table
values are recovered (in fact, resolved to something more precise and more useful than
"a fixed table" — a fully specified per-resource construction algorithm), a real decoder
is implemented, wired into `decodeDax()`'s fallback chain, covered by vitest
(`packages/engine/test/dax-treasures-8x8d-thirdformat.test.ts`'s new third `describe`
block), and render-verified as visually coherent on real retail data.
`apps/web/src/ui/docs.ts:137`'s "one of its three 8X8D wall-tile sub-formats stays
genuinely unsolved" line is now stale and should be updated by whoever next touches that
file (out of scope for this round's file list).

## What this changes

- `packages/engine/src/loaders/daxTreasures8x8dTile.ts` — new module implementing
  `buildLookupTable`, `parseTreasures8x8dTile`, `treasures8x8dTileToIndexedImage`.
- `packages/engine/src/loaders/dax.ts` — `decodeDax()`'s fallback chain now tries
  `parseTreasures8x8dTile` (gated to `8X8D*`-stem files) before the animated-picture/
  tileset/tile-strip fallbacks; `DaxBlock['kind']` gained the
  `'8x8d-treasures-mode2'` member.
- `packages/engine/src/model/index.ts` — `PaletteSource` gained the
  `'dax-8x8d-treasures-mode2'` member.
- `packages/engine/test/dax-treasures-8x8d-thirdformat.test.ts` — round 1's "declines
  as complex" assertion is removed (now false — the blocks decode for real) and a new
  third `describe` block asserts the round-3 decode: shape, palette provenance,
  in-range pixel values, exact `LOOKUP_TABLE` reconstruction, and `decodeDax` wiring.
- Renders in `renders/treasures_8x8d_probe/` (git-ignored, not committed): new
  `block{1,2,8}_REAL_TS_DECODER_w64.png` produced by the actual shipped TypeScript
  decoder (superseding round 1's six noise renders and this round's own Python
  prototype renders, all of which used the wrong pixel algorithm or wrong tooling).
