# C64 Gold Box `WALLSET` / `WALLDEF`: the first-person dungeon wall assets

> **Status (2026-08-13, §8): the glyph-MODE question is now SETTLED — from VIC-II register
> state, not from pixels.** A rule-4 census of every `$D016`/`$D011`/`$D018` write in all seven
> titles (`tools/c64_vicmode.py`) shows that outside the boot overlay `INIT` — which cannot be
> resident at the same time as `DUNGEON`, both being `$0800` dispatch overlays — **every**
> credible `$D016` write in the corpus sets bit 4 (multicolour), `DUNGEON` names these registers
> zero times in any title, `LIBRARY` (the always-resident kernel) writes `$D016` exactly once
> and sets the bit, and nothing anywhere enables extended-colour mode. **Charset-based dungeon
> output runs in multicolour character mode by hardware state.** The round's own stated
> universal ("nothing clears bit 4 anywhere") was **REFUTED** — `INIT` does clear it, in all
> seven titles — and §8 reports both halves. This does **not** settle what bytes reach `$D000`,
> the palette, or `WALLDEF`; those remain open. The "the mode question is blocked on `WALLDEF`"
> framing below is superseded for the mode specifically, and left in place as the record of how
> the question looked before §8.

**Status (2026-08-12, §7, then CORRECTED the same day — see the box below): the glyph-mode
question was STILL OPEN at that point; §8 above closed it.** Three straight rounds hunted `DUNGEON.prg`/`GDRIVE00`/`GDRIVE01`'s
disassembly for the routine that copies `WALLSET` into character-generator memory and came up
honestly empty each time (§3.4–§6). §7 changed tack per its own task brief — decode the asset
under both plausible VIC-II bit-groupings and LOOK, the same style of proof this project's
Amiga `.DAA` BIGPIC1 render used. That was the right instinct and it produced real, reusable
tooling (`tools/c64_wallset_render.py`), a genuine structural result about `WALLDEF`, and a new
`0xF0`-ceiling clue. **It did not settle the mode question, though §7 was originally written as
though it had ("CONFIRMED — the mode is multicolor, not hires"). Both of its evidence legs fail
on inspection.**

> **Correction, 2026-08-12, by the lead session — which re-ran the numbers and looked at the
> renders itself.** The original verdict rested on two legs. Neither survives.
>
> **Leg 1, the corpus statistic (310/320 = 96.9% favour multicolor, "verified unbiased against a
> random-byte control"), is NON-DISCRIMINATING.** The random control only tested uniform bytes,
> p(bit=1)=0.5 — the one density where the metric happens to be balanced. It is not balanced
> elsewhere (~97.5% multicolor at p=0.25, 100% at p=0.15). The corpus's real density is 0.437,
> where noise gives ~52%, so *that* particular objection does not explain 96.9% — but the right
> null is not random bytes at all. Measured against structural nulls
> (`c64_wallset_render.structure_null_controls`, pinned by `StructureNullControlTests`):
>
> | data | multicolor wins |
> | --- | ---: |
> | real corpus | 310/320 (96.9%) |
> | glyph ORDER shuffled, rows intact | 310/320 (96.9%) |
> | **rows shuffled WITHIN each glyph** | **320/320 (100.0%)** |
> | uniform random @ density 0.437 | ~52% |
>
> Shuffling the 8 rows inside each glyph destroys precisely the vertical continuity the metric
> claims to measure — and multicolor then wins *more* often than on the real data. The statistic
> is reading the byte histogram and the two decodings' differing pixel geometry, not the mode.
>
> **Leg 2, the visual read ("architecture in multicolor vs uniform dither noise in hires"), is
> confounded and, on inspection, not what the renders show.** The multicolor decoding doubles
> pixels horizontally and yields four grey levels, so it *always* looks chunky and blocky; hires
> is 1bpp, so it *always* looks like thin vertical features. That difference appears for any
> input. Re-rendering three of the seven cited samples (CoK `17`, CoK `01`, DoK `03`): the real
> data is clearly structured — a random-byte control at the same bit density renders as uniform
> blocky noise, and these do not — but **no sample shows the claimed pillars, arches or doorway
> rectangles**, and the hires renders are not "uniform dither noise" either; they carry plenty of
> structure too. That the data is structured is real and worth having. That it is structured
> *as multicolor rather than hires* is not shown.
>
> **A glyph sheet may be the wrong instrument entirely.** Individual 8×8 glyphs are fragments;
> coherent wall architecture would only appear once `WALLDEF` assembles them into a wall face.
> Since `WALLDEF`'s layout is itself unlocated (§3, and §7.5's new negative), that assembly
> cannot be done yet. **The decode-and-render approach is still the right one — it is blocked on
> `WALLDEF`, not refuted.** Crack `WALLDEF` and this becomes answerable by looking, exactly as
> intended.
>
> What §7 legitimately establishes, and what this correction leaves standing: the render tooling;
> that WALLSET data is genuinely structured rather than noise; that `WALLDEF` is **not** a flat
> glyph-index array (§7.5); the `0xF0` byte-ceiling clue; and the DOS `8X8D` id-keying check.

See §7 for the full writeup and the DOS `8X8D*.DAX` cross-check (same nominal id, independently
redrawn — corroborating id keying, never a byte match), and §7.5 for the `WALLDEF` negative. The
container shape (§2) remains CONFIRMED. The glyph *mode*, the real palette/register values, the
still-unfound `$D000` copy, and `WALLDEF`'s internal layout are all open.

`WALLSET`'s container-level shape was already SOLVED before this round (a flat bank of
fixed-size 8-byte records, no header) — see §2. `WALLDEF`'s internal layout remains UNLOCATED:
it is proven NOT byte-compatible with the DOS `WALLDEF*.DAX` block of the same id, its length
resists two RLE schemes already used elsewhere in this project, and no consumer routine was
pinned down by static disassembly in the time available (§3/§3.5/§5/§6). §7.4 adds one new,
partial, honestly-reported fact: WALLDEF bytes are NOT simply flat glyph-index arrays (their
in-range rate barely exceeds chance for 50-glyph titles), and nearly every 50-glyph title's
WALLDEF bodies share a suspicious near-universal maximum byte value of exactly `0xF0` (240) —
a real, novel, unexplained structural clue, not a solved encoding.

**2026-08-12 update:** the `COMBAT.prg` `$C015`/`$C012` lead named in §3.5/§4 item 5 (the most
evidence-backed remaining lead for the consumer question at the time) has been traced to full
context and **REFUTED** — see §5. `COMBAT.prg`'s calls to those slot numbers resolve against
`GDRIVE00.prg`, not `GDRIVE01.prg` (proven, cross-title, §5.1), and `GDRIVE00`'s `$C015`/`$C012`
are an unrelated combat-grid combatant-match-table pair with zero CPU-port/VIC-register writes
anywhere in the eight routines this pass traced.

**2026-08-12, round 3 (§6):** `GDRIVE01`'s CPU-port pair does have a caller — its own `$C8A1`
copy-with-bank-switch routine (already named in §3.5) really does call `JSR $C015` then
`JSR $C012`, confirmed cross-title by a proper origin-aware decode. That routine's own two
known callers (its own internal fixed-size setup, and — a new finding this round — Death
Knights' `CAMP`/`GEN`) were fully traced and **both** move a fixed byte count to a destination
that is proven **not** `$D000`-`$D7FF`. Combined with `GDRIVE00`'s own slot-0 routine (traced
this round to a combat position/placement compositor, called from `COMBAT.prg`, never writing
`$D000`-`$D7FF` either), **every CPU-port-toggle-adjacent primitive this project has so far
disassembled in either graphics driver, on either title, is now accounted for and none of them
is the WALLSET consumer.** The glyph-consumer question is still open — narrower and more
exhaustively negative than before, not resolved. See §6 for the full writeup, and §6.6 for what
this round found and fixed in the tooling itself (a prior incomplete pass had left 4 real test
bugs in this slice's own files, since corrected).

Tool: `tools/c64_wallset.py`. Tests: `tools/test_c64_wallset.py` — **62 tests** as of round 3
(this header said 35 until 2026-08-12, having never been updated after round 3 added ~27 more;
§6.6 below had the right number all along, so the document contradicted itself. If you change
the suite, change this line too, or drop the count and point at §6.6). Skips its
corpus-dependent classes when `D:\Games\Emulator\C64\Goldbox\` is absent. Prior art this
slice builds on: `tools/c64_disk.py` (the disk reader), `tools/c64_pic.py` (the sibling
`PIC*` family — the worked example of a fully-solved fixed-layout format), `tools/c64_disasm.py`
(the 6502 disassembler used for §3.5/§4/§5), and `packages/engine/src/loaders/walldef.ts` /
`packages/engine/src/world/dungeonWalls.ts` (the DOS reference implementation, and
`docs/engine/research/firstperson-wall-geometry-cok.md` for the full DOS geometry this C64
family is the counterpart of).

---

## 0. TL;DR

```
DOS:  WALLDEF{area}.DAX  -->  byte[5][156] tile-ID routing table (780 B/record, .Offset
                               relocation) --> 8X8D{area}.DAX 4bpp 8x8 tiles (32 B/tile)

C64:  WALLDEF{id}         -->  UNLOCATED variable-length byte stream, NOT byte-compatible
                               with DOS, NOT cleanly RLE-decodable under the two schemes
                               tried
      WALLSET{id}         -->  SOLVED (shape): a flat bank of N fixed 8-byte records, no header,
                               N in {50, 150, 192} depending on title/area
```

`WALLDEF{id}` and `WALLSET{id}` are a strict 1:1 pair by id on every title (§1). `WALLSET`
is the pixel data (§2); `WALLDEF` is presumably the routing/placement data by analogy with
the DOS split, but its exact encoding remains open (§3).

---

## 1. Inventory (all seven titles, 2026-08-11)

Ran `c64_wallset.inventory()` (glob is non-recursive — see the `superseded/` trap in
CLAUDE.md) across every title's `.d64` set in `D:\Games\Emulator\C64\Goldbox\`:

| Title | WALLDEF/WALLSET id pairs | WALLSET glyph counts observed |
|---|---:|---|
| Champions of Krynn | 22 | 50 (all) |
| Death Knights of Krynn | 7 | 192 (all) |
| Curse of the Azure Bonds | 18 | 50 (all) |
| Secret of the Silver Blades | 15 | 50 (13 areas), 150 (2 areas: ids `03`, `15`) |
| Gateway to the Savage Frontier | 14 | 50 (all) |
| Pool of Radiance | 18 | 50 (all) |
| Buck Rogers — Countdown to Doomsday | 7 | 192 (all) |

Every one of the 101 id pairs above was checked and the WALLDEF id-set equals the WALLSET
id-set exactly, on every title — a directory-level 1:1 pairing (`WallFile.suffix`,
`tools/test_c64_wallset.py::RealCorpusWallsetTests::test_every_title_pairs_walldef_and_wallset_ids_exactly`).

One naming quirk worth recording: Gateway's disks have one directory entry literally named
`WALLDEF1F.` (trailing dot — a duplicate/overwritten slot from a re-save during the
original disk mastering, the same class of artifact CoAB's `ECL1E` duplicate documented in
`test_c64_disk.py`). `wall_id_suffix` returns `"1F."` for it; `wall_id_hex` correctly
declines to parse it as hex rather than silently rounding to `0x1F`.

---

## 2. `WALLSET` — SOLVED: a flat bank of 8-byte glyphs

### 2.1 The evidence

Every real `WALLSET` body (the file minus its 2-byte CBM load address) across all seven
titles has a length that is an **exact multiple of 8**, with **zero exceptions** across the
whole corpus (`test_every_wallset_body_is_a_whole_number_of_glyphs`, >100 files checked).
This is the same style of proof `c64_pic.py` used for the `PIC*` family: a geometry that
divides every real instance exactly, with no fitting or guessing.

The per-title glyph counts (§1) cluster at exactly three values — 50, 150, and 192 — never
anything in between or outside that set
(`test_glyph_counts_match_the_documented_set_per_title`). 150 = 3×50 (two areas in Secret
of the Silver Blades that also have the corpus's two largest `WALLDEF` files — see §3.3);
192 is exactly the C64 `PIC*` family's own `$40..$FF` extra-glyph range (`c64_pic.py`'s
`GLYPH_COUNT`), used uniformly by Death Knights of Krynn and Buck Rogers regardless of area
complexity.

For the 50/150-glyph titles (400/1200-byte bodies), the length is additionally **never** a
multiple of 32 — the DOS `8X8D*.DAX` 4bpp tile stride (8 rows × 4 bytes/row) — which rules
out "this is just a re-exported copy of the DOS pixel format" at the byte-count level for
those titles. The 192-glyph bodies (1536 bytes) happen to divide by 32 too (192 itself is a
multiple of 32), so that specific check does not discriminate for Death Knights of
Krynn/Buck Rogers; the "redrawn, not re-exported" conclusion for them instead rests on the
general corpus fact already proven in `test_c64_disk.py`
(`test_only_maps_and_scripts_are_ever_byte_identical`): no C64 graphics family of any kind
shares a single byte with DOS anywhere in the corpus — only `GEO` maps and `ECL` scripts
ever do. `WALLSET` bodies were independently checked against that DOS byte pool too, with
the same negative result.

Byte-value statistics support a genuine C64-native bitmap reading rather than some other
kind of table: a sample `WALLSET` body (CoK id `01`, 400 bytes) has 112 distinct byte
values and 6.0 bits/byte entropy, with `0xAA` (`10101010`, the canonical hi-res dither
checkerboard byte) among its most frequent values — the signature of dithered stone-texture
line art, not of a lookup table (which would cluster around a handful of small index
values) or of RLE control-stream bytes (see §3.2 for why that hypothesis was tested and
rejected for `WALLDEF`, whose byte statistics look different).

### 2.2 A rendered sanity check (illustrative, not proof)

`render_wallset_contact_sheet()` expands a body under the "hi-res, MSB-first, one bit per
pixel" reading and lays out all N glyphs in a grid. CoK `WALLSET01`'s 50 glyphs render as a
320×160 px image with visible localized structure (a lighter blob near the top-middle
amid an otherwise dense, noisy dither field) — plausible for a stone-wall texture bank, but
this is a monochrome, unplaced, uncoloured rendering with no confirmed character-set base
address or VIC display mode (hi-res vs multicolour) behind it; see §3.4/§6 for what would
turn this from "plausible" into "confirmed."

### 2.3 What `WALLSET` almost certainly is NOT

- **Not** the DOS `WALLDEF*.DAX` routing table transplanted (that table is a byte-per-cell
  tile-ID grid, not pixel data, and is a completely different family — `WALLDEF` is the C64
  counterpart of that, not `WALLSET`; see §3).
- **Not** a re-export of DOS `8X8D*.DAX` 4bpp tiles (§2.1, byte-count argument, and the
  general no-graphics-family-matches-DOS fact).
- **Not** VIC-II sprite data (63 bytes/sprite does not divide any observed body length
  cleanly; 400/63, 1200/63, 1536/63 are all non-integer).

---

## 3. `WALLDEF` — UNLOCATED: what was tried and ruled out

### 3.1 The DOS-parity hypothesis — tested directly, result: NO MATCH

The task-defining question: is a C64 `WALLDEF{id}` body byte-identical to the DOS
`WALLDEF*.DAX` block of the **same id**, the way `GEO` and `ECL` are? Tested exhaustively
for Champions of Krynn (the only title with both a DOS install in this repo and a C64
corpus) via `dos_walldef_blocks()` + `find_dos_walldef_match()`
(`walldef_matches_dos` — tries both the naive comparison and the project's established
offset-2 convention from `test_c64_disk.py`, since a DOS decompressed block can carry its
own 2-byte leading field the way a C64 PRG carries its load address):

```
DOS WALLDEF*.DAX: 14 distinct block ids
0 of 46 checked C64 WALLDEF files byte-match a same-id DOS block
```

(46 files, not 22, because several ids' `WALLDEF{id}` file appears on more than one disk
side in this corpus, e.g. `WALLDEF17` on both Side 2 and Side 5 with identical content —
every occurrence was checked independently, all 46 came back non-matching.)

Not even the **lengths** agree. A representative sample (id → DOS decompressed raw length /
C64 body length):

| id | DOS raw (bytes) | DOS raw − 2 | C64 body (bytes) |
|---|---:|---:|---:|
| `01` | 1560 (2 records) | 1558 | 1197 |
| `17` | 780 (1 record) | 778 | 1207 |
| `0B` | 780 (1 record) | 778 | 1475 |
| `07` | 780 (1 record) | 778 | 1006 |

This is a real, decisive negative result — worth recording as-is rather than leaving open,
per the task brief. It also matches (and, for this specific family, directly confirms
rather than just structurally implies) the pre-existing general finding in
`test_c64_disk.py::GraphicsFamilyOracleTests::test_only_maps_and_scripts_are_ever_byte_identical`
(`shared == {"GEO", "ECL"}` across the whole corpus). `WALLDEF`, despite being *routing
data* rather than pixel data on the DOS side, was independently redrawn/reformatted for the
C64 port, not carried over.

### 3.2 Two RLE schemes tried, neither produces a clean decode

Given the DOS-side family (`WALLDEF*.DAX`) is itself stored under SSI's signed-byte RLE,
and `WALLDEF` body lengths vary substantially even across areas of comparable apparent
complexity (CoK: 645–1475 bytes, GCD of all 22 lengths = 1, i.e. no common fixed record
size), a compressed-variable-length encoding was the natural next hypothesis. Two schemes
already implemented elsewhere in this project's tools were tried on raw `WALLDEF` bodies,
decoding until the input was exhausted (no external "expected length" needed for either,
same as their real use):

- **DAX-style** (`dax_decode.rle_decode`: control `c<0x80` → literal run of `c+1` bytes;
  `c>=0x80` → repeat next byte `256-c` times).
- **DRAW18/PackBits-style** (`dax_decode._decode_draw18_flat`'s convention: same literal
  rule; repeat count `257-c` instead of `256-c`).

Neither produces an output length that is a clean multiple of the DOS 780-byte record, of
156 (one WALLDEF row), or even of 8 (`WALLSET`'s own glyph unit) — e.g. CoK id `01`
(1197-byte body) decodes to 4462 bytes under the DAX scheme and 4497 under the DRAW18
scheme, neither remotely close to a round number. This does not prove `WALLDEF` is
uncompressed — only that it is not compressed with either of *these specific* two schemes
in this project's toolkit; a third, C64-native RLE/packer variant (there were several in
common use on the platform) remains untried. See §6.

**Rerunnable, not prose.** Both schemes are committed as `c64_wallset.rle_decoded_lengths()`
and pinned by `RleNegativeResultTests`. They share the control byte (`< 0x80` → copy the next
`c+1` literals) and differ only in the repeat count: the DAX scheme repeats `256-c` times, the
DRAW18 framing `257-c`. That one-byte difference is the whole distinction, so the suite carries
a control test that fails if the two implementations ever collapse into checking a single
hypothesis twice — which they did on the first attempt at committing this, and which is how the
collapse was caught.

### 3.3 A real (imperfect) correlation with `WALLSET`'s richness

Secret of the Silver Blades' two 150-glyph `WALLSET` areas (ids `03`, `15`) are paired with
that title's two largest `WALLDEF` bodies by a wide margin (2564 and 3238 bytes, versus a
1045–1475-byte range for every other SSSB area, which are all 50-glyph). This is consistent
with — but does not by itself prove — `WALLDEF` genuinely encoding, in some form, enough
placement/reference information to be sensitive to how many distinct wall glyphs an area
uses. The correlation is not strictly monotonic across the corpus at large (e.g. within
CoK, whose `WALLSET` size never varies, `WALLDEF` body length still swings from 645 to 1475
bytes for reasons that remain unclear), so it is reported as a real but partial/imperfect
signal, not a formula.

### 3.4 The consumer routine: located the module, not the routine

Static disassembly (no emulator — see the standing rule) located:

- `DUNGEON.prg`'s real load origin is **`$0800`**, established from its own self-referential
  jump table (`JMP $0809` / `JMP $0A4E` / `JMP $11B6` at the file's start, all of which land
  inside the file's own ~9.4 KB span only under that origin — the file's *stored* CBM load
  word is `$4000`, a fixed staging tag shared by nearly every asset file in this corpus per
  `c64_disk.py`'s `load_address` docstring, not a real origin).
- `GDRIVE00`/`GDRIVE01`/`GDRIVE02.prg` (the graphics-driver family `c64_pic.py` already
  partly reverse-engineered) all load real origin **`$C000`**, confirmed the same way
  (`GDRIVE01`'s `JMP $C0A1` lands inside its own ~2.5 KB span at that origin; `GDRIVE02`'s
  `$C000`/`JMP $C045` origin was already established by `c64_pic.py`). `GDRIVE01` contains a
  VIC screen-mode setup routine (`STA $D018` with value `$34` → char-generator base at bank
  offset `$1000`, screen base at bank offset `$C00`; a `CIA2_PORTA` bank-select write
  precedes it) — real, but this looks like a shared/general screen-mode initializer, not a
  `WALLDEF`/`WALLSET`-specific loader, and no direct evidence ties it to this family
  specifically in the time available.
- `DUNGEON.prg` itself contains **no** KERNAL `LOAD`/`SETLFS`/`SETNAM` call
  (`$FFD5`/`$FFBA`/`$FFBD`) anywhere in its ~9.4 KB — those calls exist only in
  `CAMP.prg`, `GEN.prg`, and `LIBRARY.prg`. This corpus ships a custom fast loader
  (`FASTL.O` is a real file on every title's boot disk), so the actual `WALLDEF`/`WALLSET`
  file-load call site is very likely routed through that fast loader's own protocol rather
  than the KERNAL vector — which is why a first disassembly pass keyed on the KERNAL calls
  came up empty. This narrows, but does not close, the search for the real consumer.
- The asset-family name table (`ITEMNAMES.prg`; the table starts at body offset 2406 with
  `GDRIVE00`, and the run quoted below begins at body offset 2467) contains the
  literal ASCII string `...WALLS00SPRITE00WALLSET00WALLDEF00ANIMATE00...` — confirming
  `WALLDEF`/`WALLSET` are dynamically-built filenames (prefix + hex id) driven from a shared
  table, consistent with the disk-directory naming already observed, and also revealing a
  third, unused-in-this-family name (`WALLS`) sitting between the two — not otherwise
  investigated.
- Six `CMP #$80` sites exist in `DUNGEON.prg`; each was disassembled and read in context (a
  20-25-instruction window). None shows the canonical byte-stream-unpacker shape (`LDA
  (ptr),Y : STA (dst),Y : INY : DEX/BNE` or similar) at that site. The two examined in most
  depth: one (file offset ~3450, `$1C61..$1C8D`) is a small joystick/controller-state
  dispatch table built on a "restore flags from a packed status byte" trick
  (`LDA $7F45:PHA:PLP:RTS` at `$1CA1`, tested by several `BEQ`/`BCC`/`BCS` callers); another
  (file offset ~5290, `$1CA7`) masks the top bit off a returned value (`AND #$7F`) and
  stores it to `$7EB4`, reading like a menu-selection code being split into a
  "special/cancel" flag plus a 0..0x7F index, not a run-length. This is a real negative
  result for the specific 20-instruction windows inspected, not a claim that every
  instruction reachable from these six sites was traced — a genuine unpack loop could still
  be a few calls deeper (e.g. inside `$3809`/`$435B`, called right after the `$1CA7` site,
  which were not themselves disassembled).

---

## 3.5 2026-08-11 second pass: the glyph-consumer question, narrowed but still open

**This pass's mandate was to disassemble the actual consumer and CONFIRM or REFUTE the
"WALLSET records are VIC-II character-generator glyphs" reading.** The result is neither: no
copy loop was found, reachable from `DUNGEON.prg`, that moves a WALLSET-shaped block into
character-generator memory. That is a real negative result for the paths traced this
session, not a refutation of the underlying hypothesis (several concrete paths remain
untraced — see below). The container-level verdict in §2 is unchanged; this section only
narrows §3.4's open consumer question. All addresses below are for the Champions of Krynn
side-1 corpus (`c64code/champions-of-krynn/`, the scout's extract), org $0800 for
`DUNGEON.prg`/other overlays and org $C000 for `GDRIVE01.prg`, established the same way as
the rest of this doc (self-referential jump-table structural test).

**NEW FACT — `DUNGEON.prg` makes zero direct VIC/CIA register writes.** A linear disassembly
of the whole 9452-byte body contains no `STA $D018`, `STA $DD00`, or `STA $DD02` anywhere.
All graphics setup is delegated to `GDRIVE01.prg`'s public $C000 25-entry JMP table; `DUNGEON`
calls exactly five of its slots directly: $C000 (e.g. `JSR $C000` at `DUNGEON` $0A6A, $127B,
$2975), $C003 (`$1069`), $C018 (six sites: $0945/$099F/$10F0/$1209/$1218/$1FD8), $C01E
(`$08D2`/`$0E93`), $C02A (four sites: $0F0B/$0F46/$0F65/$10DC).

*Correction (verifier pass): the original write-up of this pass mis-cited `$1FD8` as a fifth
`JSR $C02A` call site. Re-disassembled directly (`python tools/c64_disasm.py DUNGEON.prg --org
0x0800 --start 0x1FD0 --count 10`): the instruction at `$1FD8` is `20 18 C0` = `JSR $C018`, not
`JSR $C02A`. `$C02A` is called four times, not five; `$C018` is called six times. The set of
five distinct slots `DUNGEON` calls directly ($C000/$C003/$C018/$C01E/$C02A) is unaffected, and
so is every downstream reachability conclusion drawn from that set — only the one slot's
call-site enumeration and count were wrong.*

**NEW FACT — table slot 0 ($C000 → `GDRIVE01.prg` $C0A1, called directly by `DUNGEON`) sets
up the exact address a hidden custom character set would use.** Traced instruction-by-instruction:

```
$C0A1  LDA #$03 / ORA $DD02 / STA $DD02      -- CIA2 port A bits 0-1 to output
$C0A9  LDA CIA2_PORTA / AND #$FC / STA ...   -- clears bits 0-1 -> bank select 00 -> VIC bank 3 ($C000 base)
$C0B1  LDA #$34 / STA VIC_MEMPTR ($D018)     -- screen base = 3*1024 = $0C00, char base = 2*2048 = $1000
```

Bank 3 base ($C000) + char-base offset ($1000) = absolute **$D000** — the classic
"custom-charset-under-the-I/O-window" address (VIC bank 3 has no character-ROM shadow at that
offset, unlike banks 0/2, so the VIC reads whatever is in the underlying RAM there, while the
CPU normally sees I/O registers at that address unless it explicitly banks RAM in via the
$01 port). This is real corroborating context for the "strong reading" that was missing from
§3.4 (which only knew about the $D018 write in isolation, with no confirmed caller). This
arithmetic is now committed and tested, not just asserted in prose:
`tools/c64_wallset.py`'s `vic_bank_base()` / `vic_mem_pointers()`, pinned by
`VicMemoryMapArithmeticTests` in `tools/test_c64_wallset.py` (`vic_mem_pointers(0x34, 0xC000)
== (0xCC00, 0xD000)`). **This is hardware arithmetic, verified against the one real call site
above — it is not a claim that WALLSET data is what ends up at $D000.**

**NEW FACT — `GDRIVE01.prg` implements three distinct CPU-port ($01) memory-config toggle
pairs**, each a table-slot pair (clear/restore), all disassembled and read in full:

| Slots (clear / restore) | Instructions | Effect on LORAM/HIRAM/CHAREN |
|---|---|---|
| $C009→$C135 / $C006→$C142 | `AND #$FB`(clear CHAREN) / `ORA #$04`(set CHAREN) | toggles CHAREN alone |
| $C00F→$C14F / $C00C→$C15C | `AND #$FD`(clear HIRAM) / `ORA #$02`(set HIRAM) | toggles HIRAM alone |
| $C015→$C169 / $C012→$C176 | `AND #$F9`(clear HIRAM+CHAREN) / `ORA #$06`(set both) | toggles HIRAM+CHAREN together |

Only the third pair, combined with LORAM already being 0, reaches the C64's "$D000-$DFFF is
plain RAM" memory configuration (LORAM=0 AND HIRAM=0 ⇒ RAM regardless of CHAREN, per the
standard $01-port truth table). The first pair alone (CHAREN clear, LORAM/HIRAM left at 1)
reaches "Character ROM visible for reads at $D000, but writes still pass through to the
underlying RAM" — also a valid way to install a custom charset without disturbing BASIC/KERNAL
visibility.

**NEW FACT — a fully-parameterized (caller-supplied source pointer, dest pointer, AND count)
block-copy-with-bank-switch routine exists**, at `GDRIVE01.prg` $C8A1 (table slot $C03F,
`JMP $C8A1`): it calls `JSR $C015` (the HIRAM+CHAREN clear above), copies from
`$C083/$C084` to `$C089/$C08A`+offset for a hardcoded 128 bytes (with two special
"checkpoint" writes to a third pointer, `$C08B/$C08C`, at loop offsets 63 and 127), then
`JSR $C012` to restore. **This routine was not found reachable from `DUNGEON.prg`, directly
or through any of the five table slots `DUNGEON` is proven to call** (`$C000`→$C0A1, `$C003`
→$C183, `$C018`→$C3D2, `$C01E`→$C3FA, `$C02A`→$C29D — all five fully disassembled and read;
none contains a call to `$C03F`/`$C042`/`$C045`/`$C048`). It is also not called anywhere
inside `GDRIVE01.prg` itself. A grep for `$C03F` across `DUNGEON`, `COMBAT`, `COM.PREP`,
`CAMP`, `GEN`, `LIBRARY`, `INIT`, `POST.COM`, `GDRIVE00` came back empty (the one apparent hit,
in `POST.COM`, is `AND $C042,X` — an absolute-indexed AND, not a call, and $C042/$C045/$C048
all alias the same target $C90F, which disassembles as a lone `.byte $FF` — an unused/padding
table slot, not real code).

**NEW FACT — two more copy routines share a worker at `GDRIVE01.prg` $C449, but both move a
FIXED byte count baked into the caller-side table slot, not a caller-supplied one:** slot 11
($C021→$C421, using the CHAREN-only pair) sets an inner counter (`$C093`) to `$FF` and an
outer counter (`$C094`) to `$07`, and the worker at $C449 copies one byte per iteration,
`DEC $C093` each time, only advancing the outer counter (and never resetting the inner one)
once `$C093` wraps back to `$FF` — that gives a clean 256×8 = **2048-byte** transfer (exactly
one full 256-glyph VIC character set) because the inner counter starts already at `$FF`.
Slot 12 ($C024→$C435, using the HIRAM-only pair) sets `$C093=$48` (72) and `$C094=$12` (18).

*Correction (verifier pass): the original write-up computed slot 12's transfer size as the
naive product `72×18=1296` — this does not match the routine's actual control flow. `$C093`
is never reloaded between outer passes (the shared worker's `BNE $C461` after `DEC $C094`
jumps straight back to the byte-copy, not to a re-initialization of `$C093`), so only the
*first* inner pass runs the caller's starting count (`72` decrements from `$48` down to
wraparound at `$FF`, i.e. 73 bytes including the byte that triggers the wrap); every
subsequent pass is a full 256-byte cycle because `$C093` is left at `$FF` after the first
pass, exactly like slot 11. Simulated instruction-by-instruction (`$C093` from `$48`,
`$C094` from `$12`, matching the disassembled `DEC`/`CMP #$FF`/`BNE` sequence exactly): 1
partial pass of 73 bytes + 18 further full passes of 256 bytes = **4681 bytes**, not 1296.
Slot 11's naive `256×8` product is coincidentally correct only because its inner counter
already starts at `$FF`, so every one of its 8 passes is a full 256-byte cycle from the
first; slot 12's does not share that special case. Neither 2048 nor 4681 equals any observed
WALLSET body length (400/1200/1536) or glyph count (50/150/192), so the original
conclusion — that even where reachable, neither primitive moves a WALLSET-shaped block —
still holds; only the stated slot-12 byte count was wrong.*

*Independently re-derived by the lead session from the `$C449` disassembly, which yields a
closed form for the worker: with `L0 = $C093` and `H0 = $C094` at entry,*

> **bytes copied = (L0 + 1) + 256 × H0**

*Slot 11 (`L0=$FF, H0=$07`): 256 + 1792 = **2048**. Slot 12 (`L0=$48, H0=$12`): 73 + 4608 =
**4681**. Both match. The formula also shows exactly why the naive product misleads: it
agrees with the real count only in the special case `L0 = $FF`, which is slot 11 and not slot
12. Any future caller of this worker should be sized with the formula, not with `L0 × H0`.*

Also not found reachable from `DUNGEON.prg` (no `$C021`/`$C024` hits).

**NEW FACT — the one file (of eight disassembled this session) that DOES directly call the
HIRAM+CHAREN "expose RAM at $D000" pair is `COMBAT.prg`, not `DUNGEON.prg`.** Two call sites,
`JSR $C015` at `COMBAT` $1526 and $2C3D, each with surrounding code manually read and
confirmed coherent (LDA/STA/CMP/branch chains with plausible operands, not misdecoded data —
see the false-positive note below for what that check is guarding against). `COMBAT.prg` is
the tactical grid-combat screen, not the first-person dungeon view. This sits awkwardly
against §1's established WALLDEF/WALLSET id-pairing (which mirrors dungeon-area ids, not
combat-encounter ids), so it is reported as an honest surprise and a concrete lead for a
future round, not a new claim about what WALLSET feeds.

**METHOD NOTE — a self-caught false positive, worth recording so it isn't repeated.** An
early linear full-file disassembly of `DUNGEON.prg` reported several `JSR $4xxx` hits inside
the byte range $0BC1–$0C06. Manually re-reading those raw bytes as ASCII shows they spell
ordinary combat-narration text ("...ADVANCE...THE MONSTERS...ADVANCE...BOTH...") — the
apparent `JSR` instructions are an artifact of the space character (`$20`) also being the
6502 `JSR` opcode, followed by two more printable-ASCII bytes that decode as a plausible
target address. This is the same failure mode the scout's own handoff flagged for
`hwscan.py` on `COMBAT2` (a pure string/data file); here it shows up as a false positive
*within* a real code file, at a string-table region embedded inside otherwise-genuine code.
Every `JSR`/`JMP` target cited above as a NEW FACT was cross-checked by reading its
surrounding ~20-30 instructions for coherence (sensible operands, no stray `.byte`/`BRK`
runs, and where possible a decisive structural test like the JMP-table landing check already
established in §3.4) before being trusted — but this is a standing risk for any future
extension of this map from raw linear disassembly output alone.

**One additional loose end — RETRACTED 2026-08-11 by the lead session.** This section
previously reported that `DUNGEON.prg`'s `JSR $403D` is a byte-reuse entry into the middle of
`GDRIVE00.prg`'s JMP table (the tail of a `JMP $C7A9` doubling as `LDA #$C7`, falling through
to `JMP $CAAD`). **That reading rests entirely on GDRIVE00 being resident at `$4000`, which is
now refuted** — see `c64-compic-format.md` §3a, corrected the same day. GDRIVE00 lives at
`$C000`, proven three ways, the decisive one being that the `$4000`-aligned call-target count
is 7 in Champions of Krynn but **zero** in Death Knights despite GDRIVE00 being byte-identical
between the two titles. A residence produces callers in both; 7-then-0 is coincidental
alignment.

What survives: `DUNGEON.prg $0A79` really does contain `JSR $403D` (Champions of Krynn), and
Death Knights' `DUNGEON` really does contain `JMP $4080` / `JMP $4083` at `$0F80`/`$0F88`.
None of the three is 3-byte-aligned from `$4000`, so none is a table entry under any
hypothesis. `$4000` is the *staging buffer* every file in this corpus stores as its load
address, so the most economical reading is that these call whatever was most recently loaded
there — untraced, and no longer connected to GDRIVE00.

What this retraction *resolves*: the question "what occupies `$CA00`-`$CAB4`" is no longer
open. With GDRIVE00 resident at `$C000` its body spans `$C000`-`$CAF5`, so `$CAAD` — and all
of table entries 21-24 and 27-30, which target `$CAAD`-`$CAB4` — are **GDRIVE00's own code**.
The apparent "targets past GDRIVE01's end" anomaly was an artifact of attributing GDRIVE00's
table to GDRIVE01's address space. GDRIVE00, GDRIVE01 and GDRIVE02 are three mutually
exclusive occupants of the same `$C000` graphics-driver slot.

The arithmetic correction that *was* right stands: GDRIVE01's 2560-byte body at org `$C000`
ends at `$CA00` (exclusive), not the originally-reported `$C9C2`.

**Bottom line for this pass:** the "strong reading" status is unchanged — genuinely still
neither confirmed nor refuted. What changed is the shape of the remaining gap: the specific,
most-general char-set-download primitive in `GDRIVE01.prg` (`$C03F`) and the two
fixed-size-transfer primitives (`$C021`/`$C024`) are now provably *not* reached by
`DUNGEON.prg` through any of the five call sites `DUNGEON` is proven to use, and the one file
that does reach the RAM-exposing bank-switch pair is `COMBAT.prg` instead. The renderer in
`c64_wallset.py` is deliberately left unchanged (still explicitly "illustrative, not proof" —
see §2.2); per this task's own instructions, upgrading it to a confirmed pixel-format
renderer is conditional on the reading being confirmed, which it is not.

---

## 4. What would close the gap

In priority order, none requiring an emulator:

1. **Trace `FASTL.O`'s load protocol** statically to find where it hands control back with a
   destination pointer, then follow that pointer's first use in `GEN.prg`/`CAMP.prg` (the
   modules that actually issue file loads) for the specific `WALLDEF`/`WALLSET` pair — this
   is the most direct path to the real consumer code that `DUNGEON.prg` alone couldn't supply.
2. **Try more C64-native (de)compression schemes** against `WALLDEF` bodies — the two ruled
   out in §3.2 are both "SSI DOS style"; several other simple LZ/RLE variants were common on
   this platform and were not yet tried.
3. **Cross-reference `WALLDEF` byte statistics against `WALLSET`'s known glyph count** for a
   given id — if `WALLDEF` turns out to be uncompressed and glyph-index-based, its byte
   value range should be bounded by that area's own glyph count (0..49, 0..149, or 0..191);
   this was not yet checked precisely per-id (only a coarse min/max/entropy pass was done —
   §2.1's byte-statistics argument was WALLSET-specific, not repeated per-id for WALLDEF).
4. **Confirm the VIC display mode and character-generator placement** for the dungeon view
   specifically (hi-res vs multicolour; whether it shares `GDRIVE01`'s `$34`
   screen-mode setup or has its own) to move §2.2's illustrative render from "plausible" to
   "confirmed," and to settle whether `WALLSET`'s glyphs are 1 or 2 bits/pixel (the byte
   layout is identical either way — only the bit-grouping used to interpret it differs).
5. **(2026-08-11) Trace `COMBAT.prg`'s two `$C015` call sites** ($1526, $2C3D — see §3.5) to
   their full context: what gets copied there, from what source, how many bytes, and whether
   it is in any way keyed by a `WALLSET`/`WALLDEF` id. `COMBAT.prg` is now the one file in
   this project's disassembled set proven to invoke the "expose RAM at $D000" bank-switch
   pair — a more evidence-backed lead than any path found from `DUNGEON.prg` this round, even
   though it sits oddly against the dungeon-area id pairing established in §1.
6. **(2026-08-11) Determine what occupies `GDRIVE01.prg`'s memory range past its own captured
   2562-byte file end** (`$CA00`-`$CAB4`-ish — recomputed by the verifier pass: 2560-byte body
   at org $C000 spans $C000-$C9FF, so the real end is $CA00) — `DUNGEON.prg` genuinely calls
   into that range (`JSR $403D` → `$CAAD`, see §3.5's loose end) and the target must resolve
   to something.
   Check whether `GDRIVE01.prg`'s real on-disk/on-tape image is longer than what
   `c64_disk.py` read (re-verify against `c1541`/a hex dump of the raw disk sectors, not
   just the directory-declared file length), or whether a different file loads
   contiguously after it in memory.
7. **(2026-08-11) Re-run `$C03F`'s (the fully-parameterized copy-with-bank-switch routine at
   `GDRIVE01.prg` $C8A1) reachability search against files this session did NOT disassemble**
   (`SOUNDFX`, `TITLEPG`, `SPR.TP`, `MUSIC`, `ITEMNAMES`, `PIC*`, `MON*`, `COMPIC*` — all
   present in `cok_all`/`dok_all` per the scout's handoff) — it was checked against `DUNGEON`
   and the seven other files this slice's task named, but not against the picture/sprite
   family, which is a plausible caller.

---

*Researched 2026-08-11, tools slice `c64-wallset` (Sonnet). Static analysis only, per the
project's standing no-emulator rule for this task — every claim above is a disassembled
byte/address or a corpus-wide file measurement, not a plausibility guess. `WALLSET`'s
container shape (§2) is CONFIRMED; `WALLDEF`'s internal layout (§3) is UNLOCATED, with a
concrete next-steps list (§4) rather than a forced guess.*

*Second pass 2026-08-11 (§3.5, same slice, same session): the glyph-consumer question this
pass was scoped to settle is STILL NEITHER CONFIRMED NOR REFUTED. New, disassembly-verified
facts narrow where the consumer is NOT (the two most-general char-set-download primitives in
`GDRIVE01.prg` are provably unreached by `DUNGEON.prg`'s five known call sites) and surface a
concrete, currently-stronger lead in `COMBAT.prg` instead. `tools/c64_wallset.py` gained two
pure, disassembly-cited, tested VIC-memory-map arithmetic functions
(`vic_bank_base`/`vic_mem_pointers`) documenting real hardware facts from the trace; the
renderer and the module's CONFIRMED/UNPROVEN status split are unchanged, per the task's own
instruction that upgrading the renderer is conditional on confirmation. Do not let a future
pass read "narrowed" as "confirmed."*

---

## 5. 2026-08-12: the COMBAT $C015 lead — REFUTED

**Mandate for this pass (per the task brief): trace `COMBAT.prg`'s two `JSR $C015` call
sites (§3.5/§4 item 5) to full context — source/dest pointers, byte count, id-keying — and
find the matching `$C012`.** The result is a clean, cross-title-verified **refutation**, not
the confirmation the lead was hoping for: `COMBAT.prg`'s `$C015`/`$C012` calls do not touch
the CPU port, do not expose RAM at `$D000`, and have nothing to do with `WALLSET`/`WALLDEF`.
§3.5's own framing of this lead ("the one file that DOES directly call the HIRAM+CHAREN
'expose RAM at $D000' pair is `COMBAT.prg`") is **corrected** below — it rested on an
unverified assumption, not a proven one.

### 5.1 The root cause: §3.5 attributed COMBAT's calls to the wrong graphics driver

`GDRIVE00.prg` and `GDRIVE01.prg` are proven **mutually exclusive occupants of the same
`$C000` slot** (§3.5's own retraction note). Both are 3-byte-JMP-table drivers whose tables
happen to start at the same base (`$C000`) and use the same per-slot addressing scheme, so
the SAME slot number (e.g. `$C015`) is a real, valid, differently-coded routine in each of
them. §3.5 read `COMBAT.prg`'s `JSR $C015` / `JSR $C012` against **`GDRIVE01`'s** table
(the driver already known to hold the HIRAM+CHAREN toggle pair from tracing `DUNGEON.prg`)
without independently checking that `GDRIVE01` — rather than `GDRIVE00` — is actually the
driver resident while `COMBAT.prg` runs. It is not.

**The decisive check:** `COMBAT.prg` also directly calls the absolute address `$C066`
(`STA $C3 / STA $C4 / JSR $C066`, immediately before reading the `$7A00,Y`/`$7A80,Y`
tables — see §5.2). `$C066` is `$C000 + 0x66`, and `0x66 / 3 = 34` — a valid 3-byte-aligned
JMP-table slot position. In **`GDRIVE00`** (35 slots, `$C000`-`$C066` inclusive is slot 34
of 35) it decodes as `JMP $C761`, a real trampoline whose target lands inside `GDRIVE00`'s
own body. In **`GDRIVE01`** (only 25 slots, table ends at `$C048`) the same address falls in
`GDRIVE01`'s post-table **data** region: the raw bytes there (`00 02 02 01 01 01 01 02 02
01 ...`) are read as literal table DATA by `GDRIVE01`'s own `$C322` routine (`LDA $C081` /
`LDA $C082` etc. — real internal code that treats `$C05B`-`$C0A0`ish as a parameter table,
not instructions) and do not even decode as a `JMP` (opcode `$4C`) at all. A caller cannot
reach a table slot that isn't a JMP instruction, so `COMBAT.prg`'s `$C066` call can only be
targeting `GDRIVE00`. And since only one of the two drivers is resident at `$C000` at a
time, `COMBAT.prg`'s `$C015`/`$C012` calls must **also** be reaching `GDRIVE00`, not
`GDRIVE01`.

This is now committed and tested, not just prose: `tools/c64_wallset.py`'s
`gdrive_slot_target()` / `slot_lands_in_body()` read a candidate JMP slot from a raw
`GDRIVE0x` body and report whether it is a real, self-landing trampoline.
`CombatC015LeadTests` in `tools/test_c64_wallset.py` pins, **on both Champions of Krynn and
Death Knights of Krynn** (cross-title, per the project's own "coincidental alignment" trap
warning — a residence should produce the same fact on both titles, and it does):

```
$C066 lands inside GDRIVE00's own body:  True   (both titles)
$C066 lands inside GDRIVE01's own body:  False  (both titles)
COMBAT.prg contains the literal `JSR $C066` encoding (20 66 C0):  True  (both titles)
```

`GDRIVE00.prg` is itself proven near-byte-identical between the two titles (4 bytes differ
out of 2808, `test_gdrive00_is_effectively_the_same_binary_on_both_titles`), so this is one
fact about one shared binary, independently confirmed via two different games' `COMBAT.prg`
callers — not a coincidence specific to one title's build. Ran, confirmed passing (34/34);
mutated `gdrive_slot_target`'s opcode guard to accept any byte (`if body[off] != 0x4C` →
`if False`), reran, confirmed exactly the two synthetic opcode-discrimination tests
(`test_non_jmp_opcode_returns_none`, `test_jsr_opcode_at_the_slot_is_also_rejected`) went
red as expected, then restored the file from a pre-mutation copy and confirmed a byte-
identical `sha256` match before rerunning the full suite green again.

### 5.2 What `GDRIVE00`'s `$C015`/`$C012` slots actually do

Both were fully disassembled (Champions of Krynn corpus, org `$C000` for `GDRIVE00.prg` —
established the same self-referential-landing way as the rest of this doc):

- **`$C015` → `$C332`.** Iterates an indirect pointer `($9E),Y` over a small internal table
  (base computed by `$C26E`: `$9E:$9F = $CB00 + $9B*4` — a **fixed, hardcoded `$CB00`
  base**, 4-byte stride, not a file-load address; *correction, adversarial verifier pass
  2026-08-12: this base is NOT inside `GDRIVE00.prg`'s own resident span as previously
  claimed here — `GDRIVE00.prg` is 2806 bytes at org `$C000`, i.e. its own captured body
  spans `$C000`-`$CAF5` (matching the project's established memory map), and `$CB00` is
  10 bytes past that span's exclusive end (`$CAF6`). The table `$C015` reads is therefore
  scratch/data memory GDRIVE00's code references at a hardcoded absolute address, not a
  region contained within GDRIVE00.prg's own file bytes — its origin (loaded there by
  some other file, reserved workspace, etc.) is unestablished and out of this pass's scope.
  This does not affect §5.1's refutation, which rests only on the `$C066` slot's own target
  landing inside GDRIVE00's body, verified separately.*), comparing each entry's two bytes
  against `$FB`/`$FC` (a caller-supplied search key). On a
  match it appends `(X, $9B)` into the **same** `$7A00,Y` / `$7A80,Y` parallel tables
  `COMBAT.prg`'s own code reads back afterward (§3.5's `$2BB0` routine, re-confirmed this
  pass at the corrected attribution).
- **`$C012` → `$C2EB`.** Same `($9E),Y` walk, but compares against **`$0612`/`$0613`** (a
  fixed absolute 2-byte key — exactly the pair `COMBAT.prg`'s own code at `$2C2D`/`$2C34`
  compares `$FB`/an `X` register against, immediately before calling `$C015`). On a match it
  overwrites that table entry with sentinel `$FF` (`STA ($9E),Y` twice, i.e. "remove this
  entry"), then calls `$C332` (`$C015`'s own routine) again to rebuild the `$7A00`/`$7A80`
  result tables from what remains.

Every routine reached this way (`$C26E`, `$C27B`, `$C2EB`, `$C332`, `$C389`, `$C3B1`,
`$C3EE`, `$C7A9`) was read in context. *Correction (adversarial verifier pass, 2026-08-12):
these 8 addresses were mislabeled here as "the full set of `GDRIVE00` slots `COMBAT.prg`
is proven to call, per §5.3" — they are not. §5.3's call table lists 9 different slot
addresses (`$C000`/`$C00F`/`$C012`/`$C015`/`$C018`/`$C01B`/`$C027`/`$C036`/`$C03C`); the 8
addresses actually manually read here are `$C015`'s and `$C012`'s own targets (`$C332`,
`$C2EB`) plus the internal subroutines those two call (`$C26E`, `$C27B`, `$C389`, `$C3B1`,
`$C3EE`, `$C7A9`) — i.e. the transitive closure below `$C015`/`$C012` specifically, not the
other 7 slots COMBAT.prg also calls directly (`$C000`/`$C00F`/`$C018`/`$C01B`/`$C027`/
`$C036`/`$C03C`), which were not individually disassembled this pass. This does not weaken
the "no CPU-port/VIC-register write anywhere in `GDRIVE00.prg`" conclusion itself — that
rests on the independent whole-file sweep below, re-verified by the adversarial pass with a
proper linear decode from file offset 0 (not just an absolute-addressing-mode `--find`
sweep, which would miss the CPU port's usual zero-page `STA $01` encoding): zero
instructions anywhere in `GDRIVE00.prg`'s 2806 bytes reference zero-page `$01` or absolute
`$D018`/`$DD00`/`$DD02`. Only the "which 8 addresses were manually read" description was
wrong.* **None writes the CPU I/O port (`$01`), none writes `$D018` or `$DD00`/`$DD02`, and a
`--find D018`/`--find DD00` sweep of the whole `GDRIVE00.prg` body comes back with zero
hits.** This is a combat-grid **combatant/position match-table
build-and-remove pair** — almost certainly "find/remove the combatant occupying grid cell
(`$0612`,`$0613`)" — with no relationship whatsoever to character-generator memory,
`WALLSET`, or `WALLDEF`. The `$0610`-`$0613` four-byte key region and the `$CB00`-based
internal table are a genuinely new, small piece of the memory map (combat-grid bookkeeping,
not graphics), noted here for completeness but out of this slice's scope to name formally.

### 5.3 Full call-site inventory for `COMBAT.prg` (corrects/extends §3.5's DUNGEON-only table)

Scanned every `JSR`/`JMP` absolute target in `COMBAT.prg` (org `$0800`, independently
re-confirmed this pass as the real origin: a proper linear decode's JSR/JMP self-landing
rate is 53.9% (477/885) at org `$0800`, the peak among all eight `$0800`-step candidates
from `$0800` to `$A000` — the same style of evidence `DUNGEON.prg`'s origin was established
with).

*Correction (adversarial verifier pass, 2026-08-12): the original write-up of this section
named `$2000` (24.3%, 215/885) as the "next-best candidate origin," and characterized
`$0800`'s lead as "more than double" it. Re-ran the same 0x0800-step scan independently
(same `c64_disasm.OPCODES`-driven linear decode, all eight candidate origins `$0800`..`$A000`)
and got the identical per-origin numbers the original write-up reported for `$0800` and
`$2000` — but the actual second-highest candidate is `$1000` at 48.1% (426/885), which the
original prose skipped over entirely. `$0800` is still the peak (53.9% vs `$1000`'s 48.1%,
a real but modest ~6-point lead, not the "more than double" gap the prose claimed against a
cherry-picked comparator). This does not change the origin conclusion — `$0800` is still the
best-supported candidate, and more importantly, none of §5.1's `$C066`/`$C015`/`$C012`
argument actually depends on `COMBAT.prg`'s own origin: those are literal absolute-address
operands embedded in the instruction bytes (JSR $C066 etc.), unaffected by what address
`COMBAT.prg` itself is loaded at. Only the origin-strength framing was overstated; the
downstream refutation is unaffected. Full per-origin table from the independent rerun:
`$0800`→53.9%, `$1000`→48.1%, `$1800`→23.8%, `$2000`→24.3%, `$2800`→21.5%, `$3000`→11.4%,
`$3800`→8.7%, `$4000`→3.6%.*

Landing in `GDRIVE00`'s slot range `[$C000, $C048]`:

| Slot | Called from (COMBAT.prg, org $0800) |
|---|---|
| `$C000` | `$0B0F` |
| `$C00F` | `$1BB7`, `$2360` |
| `$C012` | `$2357` |
| `$C015` | `$1526`, `$2C3D` |
| `$C018` | `$1AF1`, `$1C66` |
| `$C01B` | `$16C7`, `$17B8`, `$1D8E`, `$2345`, `$2C45` |
| `$C027` | `$17B1` |
| `$C036` | `$2BA1`, `$2BF8` |
| `$C03C` | `$17EA`, `$1B4B`, `$2970` |

Every one of these must now be re-read against `GDRIVE00`, not `GDRIVE01`, if a future pass
extends this table (`$C066`, the deciding address, is called from `$2BB6`; it is not itself
a table slot — see §5.1). **`DUNGEON.prg` was independently re-checked this pass and does
NOT share this problem**: its only `[$C000,$CAF5]`-range JSR/JMP targets are exactly the
five table slots (`$C000`/`$C003`/`$C018`/`$C01E`/`$C02A`) already attributed to `GDRIVE01`
in §3.5 — no non-table-slot address like `$C066` appears anywhere in `DUNGEON.prg`, so its
`GDRIVE01` attribution is unaffected by this correction.

### 5.4 Answer to the task's own question

**(a)** Full context obtained (§5.2) — but the pointers/counts involved are combat-grid
bookkeeping (`$9E`-indirect into a `$CB00`+ internal table, `$0610`-`$0613` compare key,
`$7A00`/`$7A80` result tables), not a graphics-memory copy, and **not keyed by any
`WALLSET`/`WALLDEF` id** — the "key" is a grid-cell/position value, not an area id.
**(b)** The complementary `$C012` was found and fully traced (§5.2) — it is not a CPU-port
un-expose at all under the corrected attribution, so "bound the copied region" does not
apply; there is no CPU-port toggle here to bound.
**(c)** No copy lands at `$D000`, and there is no `WALLSET`-shaped source anywhere in this
flow — **this is a refutation**, exactly as the task anticipated as a valid outcome.
**(d)** Not reached this pass (the refutation and its cross-title proof consumed the
session); `WALLDEF` internals remain UNLOCATED, unchanged from §3/§4.

**Bottom line: the WALLSET-glyph-consumer question is back to genuinely open, narrower than
before.** What is now closed: `COMBAT.prg` is **not** a lead for it (proven, not just
deprioritized) — the CPU-port HIRAM+CHAREN "expose RAM at `$D000`" pair (`GDRIVE01`'s
`$C015`/`$C012`, §3.5) still has **zero known callers** in this project's disassembled set;
`DUNGEON.prg`'s five call sites remain proven not to reach it, and `COMBAT.prg`'s
apparent-`$C015` calls are now proven to reach a different routine in a different file
entirely. `docs/engine/research/c64-wallset-format.md` §4's next-steps list should treat
item 5 (this lead) as **closed (refuted)**; item 1 (tracing `FASTL.O`'s load protocol) and
item 2 (other C64-native RLE/packer variants for `WALLDEF`) are the remaining
concrete paths, plus a new one this pass surfaces: `GDRIVE00.prg`'s much larger 35-slot
table (`§3.5`'s `$C09/$C00C` etc. equivalents were never enumerated for `GDRIVE00` the way
they were for `GDRIVE01`) is a real, so-far-unexamined surface that at least one other file
(`COMBAT.prg`) depends on heavily — worth a dedicated pass, though nothing in what this
session traced through it (§5.2's eight routines) touches graphics memory.

---

*Adversarial verifier pass 2026-08-11 (same slice): re-disassembled `DUNGEON.prg` and
`GDRIVE01.prg` independently (fresh extract from `Champions of Krynn - Side 1.D64`, not the
scout's own extract directory) and confirmed the great majority of §3.5's new facts
byte-for-byte, including the full $C000 table, the $C0A1 VIC-setup routine, the three
CPU-port toggle pairs, the $C8A1 copy routine, the $C449-worker pair, the $C015 call sites in
`COMBAT.prg`, and the `$403D` byte-reuse trick. Found and corrected two real numeric errors in
this section's prose (not in `tools/c64_wallset.py` or its tests, which were unaffected): (1)
`$1FD8` was mis-cited as a fifth `JSR $C02A` call site — it is actually `JSR $C018`, making
`$C02A` a four-call site and `$C018` a six-call site; the five-distinct-slots conclusion and
everything downstream of it are unaffected. (2) `GDRIVE01.prg`'s captured-file end was
mis-stated as "$C9C2" and the `$CAAD` gap as "about 171 bytes" — recomputed from the file's own
measured length (2562 bytes total, 2560-byte body, org $C000) the real end is $CA00 and the
gap is 173 bytes. (3) Slot 12's fixed-size copy at `GDRIVE01.prg` $C435→$C449 was reported as
moving a naive `72×18=1296`-byte block; instruction-level simulation of the actual `DEC`/`CMP
#$FF`/`BNE` wraparound logic (the inner counter is never reloaded between outer passes) gives
4681 bytes instead — the qualitative conclusion (neither fixed-size primitive moves a
WALLSET-shaped block) is unchanged, only the stated number was wrong; slot 11's `256×8=2048`
figure was independently re-simulated and confirmed exactly right. `tools/test_c64_wallset.py`'s
26 tests were rerun (26 passed) and one
independent mutation (`vic_mem_pointers`'s screen-base unit changed from 1024 to 2048) was
applied and confirmed to turn `test_vic_mem_pointers_matches_the_dungeon_disassembly` red, then
reverted with a byte-identical restore (`sha256sum` before/after: `93d20248...616ada6`, matched
the value already recorded in this slice's own report). The central "still neither confirmed
nor refuted" verdict for the WALLSET-glyph-consumer question is CONFIRMED as reported.*

---

*Adversarial verifier pass 2026-08-12 (same slice, on §5's REFUTED verdict): independently
re-extracted `COMBAT.prg`/`GDRIVE00.prg`/`GDRIVE01.prg` from both titles' disks (fresh
`find_prg` reads, not reused files) and confirmed the pass's central, load-bearing claims
byte-for-byte on both Champions of Krynn and Death Knights of Krynn: `$C066` decodes as
`4C 61 C7` (`JMP $C761`, self-landing) in `GDRIVE00` and as `00 02 02` (not opcode `$4C`) at
the same offset in `GDRIVE01`; `COMBAT.prg` contains the literal `JSR $C066` (`20 66 C0`)
bytes at a position independently confirmed to be a real instruction boundary via a full
linear decode from file offset 0 (not just a `--start`-seeded read, which does not itself
prove alignment) — file offset 9142 (CoK) resolving to `$2BB6` at org `$0800`, matching the
doc exactly, with the surrounding `A9 80/85 C3/85 C4` context also reproduced verbatim on
both titles; `$C015`→`$C332` and `$C012`→`$C2EB` in `GDRIVE00` were independently
disassembled and match §5.2's description of the compare-key/table-walk logic exactly, down
to the `$0612`/`$0613`/`$FB`/`$FC`/`$7A00`/`$7A80` operands; `GDRIVE00` differs by exactly 4
bytes (offsets 112/113/332/333) between the two titles, matching the claimed count; the
§5.3 call-site table was independently reproduced from a fresh full-file linear scan and
matched every slot and every call-site address exactly; `DUNGEON.prg`'s claimed
`{$C000,$C003,$C018,$C01E,$C02A}`-only slot set (no `$C066`-style address) was independently
reproduced and confirmed exact. `tools/test_c64_wallset.py`'s 34 tests were rerun and passed
(all real, corpus present, none skipped).

Three errors were found and corrected in `docs/engine/research/c64-wallset-format.md` (no
errors found in `tools/c64_wallset.py` or `tools/test_c64_wallset.py`'s pre-existing tests):
(1) §5.3's origin-strength framing overstated `$0800`'s lead over the "next-best candidate"
as "more than double" by citing `$2000` (24.3%) instead of the actual second-highest
candidate, `$1000` (48.1%, independently reproduced) — `$0800` is still the peak, just by a
smaller, real margin; this claim also turned out not to matter for the refutation itself,
since `$C066`/`$C015`/`$C012` are literal absolute operands independent of `COMBAT.prg`'s own
load origin. (2) §5.2 described the `$CB00` table base `$C015`/`$C012` walk as "inside
`GDRIVE00`'s own resident span" — it is not: `GDRIVE00.prg` is 2806 bytes at org `$C000`
(body `$C000`-`$CAF5`, matching the project's established memory map), and `$CB00` is 10
bytes past that span's exclusive end. (3) §5.2 mislabeled the 8 manually-read addresses
(`$C26E`/`$C27B`/`$C2EB`/`$C332`/`$C389`/`$C3B1`/`$C3EE`/`$C7A9`) as "the full set of
`GDRIVE00` slots `COMBAT.prg` is proven to call, per §5.3" — §5.3 actually lists 9 different
slot addresses; the 8 addresses read are `$C015`/`$C012`'s own targets plus their internal
callees, not the other 7 slots COMBAT.prg also calls directly. This does not weaken the "no
CPU-port/VIC-register write anywhere in `GDRIVE00.prg`" conclusion, which was independently
re-verified this pass with a proper linear decode from file offset 0 (catching the CPU
port's usual zero-page `STA $01` encoding, which an absolute-mode-only `--find` sweep would
miss) and still comes back with zero hits for zero-page `$01` or absolute
`$D018`/`$DD00`/`$DD02` anywhere in the file's 2806 bytes.

A fourth, genuine gap was found by mutation-testing the tooling itself (not the prose): the
original `CombatC015LeadTests`/`GdriveSlotTargetTests` suite had no test pinning
`slot_lands_in_body`'s exact upper boundary — mutating `target < org + len(body)` to
`target <= org + len(body)` (an off-by-one that misclassifies a target exactly one byte past
a body's own span as "landing inside it") caused **zero** of the then-34 tests to fail. Added
`test_slot_lands_in_body_rejects_a_target_exactly_one_past_the_end` to
`tools/test_c64_wallset.py` (35 tests now), confirmed it goes red under that exact mutation
while all 34 others stay green, then reverted `tools/c64_wallset.py` and confirmed a
byte-identical `sha256` restore before rerunning the full suite green again. This gap did not
affect any real conclusion in this pass (no cited real address sits at that exact boundary),
but is a real hole the corpus-scale claims were exposed to.

**Verdict: §5's REFUTED outcome is CONFIRMED.** Every load-bearing byte/address claim behind
"`COMBAT.prg`'s `$C015`/`$C012`/`$C066` calls resolve against `GDRIVE00`, not `GDRIVE01`, and
`GDRIVE00`'s same-numbered slots are unrelated combat-grid bookkeeping with no CPU-port or
VIC-register writes" reproduced exactly, cross-title, from independent re-extracts. The three
prose corrections above narrow or fix supporting detail and evidentiary framing; none of them
touches the refutation's own logical chain (the `$C066` opcode-alignment argument in §5.1,
which is what actually decides GDRIVE00-vs-GDRIVE01 residency).*

---

## 6. 2026-08-12, round 3: what the kernel gives GDRIVE00, what the `$C449` worker moves, and a
   corrected, exhaustive account of the RAM-exposing pair's real callers

**Mandate for this round (per the task brief): (1) disassemble the kernel calls at `$2E04`/
`$2E25` in both titles; (2) compute real transfer sizes for GDRIVE00 table slots reaching the
`$C449` worker and identify what they move; (3) push the WALLSET glyph reading toward confirmed
or refuted.** All three were worked. Items 1-2 were substantially implemented in
`tools/c64_wallset.py`/`tools/test_c64_wallset.py` already — this session found that code and
its tests already present but **undocumented and, in four cases, genuinely broken** (a prior
incomplete pass had left the tooling mid-edit); §6.6 below is the fix log. The narrative below
documents what the (now-fixed, all-green) tooling actually proves.

### 6.1 Item 1: `$2E04`/`$2E25` are a kernel bank-switch trampoline pair, not a graphics-driver
    thunk — cross-title, both direct-call and table-indirection forms

`c64_kernel.py`'s own §9.2 correction (in `c64-resident-kernel.md`) already established the
destination: at LIBRARY's real origin (`$2DC8`), CoK's kernel jump-table slots 20/31 (`$2E04`
and `$2E25`) are `JMP $4840` / `JMP $4857`, and `$4840`/`$4857` decode as a **matched CPU-port
save/restore pair** — `$4840` saves `$01` (the LORAM/HIRAM/CHAREN memory-config register) to a
shadow byte `$038B` before switching banks and installing an IRQ vector; `$4857` restores `$01`
from that shadow and conditionally re-enables interrupts. This round's job was to confirm
**which file calls this pair, and how**, on both titles — `c64_kernel.py` only established what
the pair *is*.

`GDRIVE00.prg` calls it, exactly once per direction, bracketing its own table-slot-0 routine —
but the two titles reach the SAME kernel routine two different ways:

- **Champions of Krynn** routes through two of LIBRARY's own jump-table slots, literally
  `JSR $2E04` / `JMP $2E25` (`BANKSWITCH_CALL_TARGETS["cok"]`), which are themselves the one
  level of indirection `c64_kernel.py` documented — the real routine is `$4840`/`$4857`.
- **Death Knights of Krynn** calls the equivalent routine **directly**, at its own build's
  differently-laid-out address (`$477A`/`$4798`, `BANKSWITCH_CALL_TARGETS["dok"]`) — DoK's
  LIBRARY jump table has only 3 slots (an already-established fact from `c64-resident-kernel.md`
  §9.2), so this particular service isn't exposed as one of them there, but the byte-for-byte
  matching `STA $038B`/`LDA $038B` shape at DoK's own address confirms it is the identical
  kernel service, not a coincidence of naming.

Both facts are cross-title-pinned: `BankswitchPairCrossTitleTests.test_cok_gdrive00_routes_
through_the_kernel_jump_table`, `test_dok_gdrive00_calls_the_routine_directly_not_through_a_
kernel_slot` (also proves DoK's GDRIVE00 body does **not** contain the literal `$2E04`/`$2E25`
encoding anywhere — a naive scan keyed only on the literal CoK addresses would misread DoK as
"doesn't use this kernel service" when it does, just via a different call shape — a real,
documented instance of exactly the trap the task brief's methodology rules warn about, caught
and corrected rather than repeated), and `test_the_routine_at_each_titles_addresses_really_
saves_and_restores_cpu_port` (confirms the `$038B` save/restore signature at the real,
indirection-resolved address in **both** titles' own LIBRARY body, via `c64_kernel.kernel_body`).

**What GDRIVE00's slot-0 routine (the thing this bank-switch pair wraps) actually is, and why
it rules GDRIVE00 out as the WALLSET consumer:** traced end to end this round.
`Gdrive00Slot0IsCombatNotWallsetTests` pins two facts: `COMBAT.prg` (not `DUNGEON.prg`) directly
calls GDRIVE00's table slot 0 (`JSR $C000`), and the routine that slot wraps (`$C069`-`$C14D`,
bank-switch-in to bank-switch-out) contains **zero** absolute/indexed/indirect operands landing
in `$D000`-`$DFFF` anywhere in its own span (`absolute_operand_hits` region-scoped to exactly
that span, not a whole-file scan that could be confounded by an unrelated data table a few dozen
bytes past the routine's own end — see the test's own docstring for the false positive that
whole-file scoping would produce). Manual reading (not committed as a test, since it is
descriptive rather than a falsifiable byte fact) shows the routine writes screen-matrix memory
(via the established `$0288`=screen-colour-RAM-pointer convention) and a `$06xx` game-state
array — a combat-grid tile/position compositor, consistent with being called from `COMBAT.prg`,
with no relationship to character-generator memory at all.

**Conclusion for item 1: the kernel gives GDRIVE00 a generic "toggle memory-config bits, do
something, toggle them back" trampoline — used exactly once, by a combat-grid compositor, never
touching `$D000`-`$D7FF`.** This is real, disassembly-verified, cross-title context for *what the
kernel provides*, but it is not itself a WALLSET lead — reported as the task brief asked, not
oversold as one.

### 6.2 Item 2: the closed-form transfer size, applied — and the brief's own premise for it
    corrected

The task brief's phrasing ("compute the real transfer size for every GDRIVE00 table slot that
reaches `$C449`") assumes GDRIVE00 has such slots. **It does not, in either title.**
`Gdrive00HasNoC449StyleWorkerTests.test_gdrive00_never_sets_up_the_c093_c094_counter_pair`
confirms `find_immediate_then_store(gdrive00_body, 0xC093)` and `...0xC094)` both return `[]` for
both CoK and DoK — the `$C449` counting-loop worker (closed form `bytes = (L0+1) + 256*H0`,
already derived in §3.5) exists **only in GDRIVE01**; GDRIVE00 is a different 2806-byte binary
whose own bytes at the numeric offset `$449` are unrelated code
(`Gdrive00C449IsUnrelatedCodeTests`, byte-diffed directly: `g01[0x449:0x449+3] ==
AD 85 C0` vs `g00[0x449:0x449+3] == 00 8D 3F`). This corrects the premise, not just answers the
question — GDRIVE01's own two real setup sites remain the entire population:

| Slot (GDRIVE01) | `L0`/`H0` | closed-form size | Notes |
| --- | --- | ---: | --- |
| 11 ($C021→$C421) | `$FF`/`$07` | **2048 B** | full 256×8 = one VIC char-set-sized transfer |
| 12 ($C024→$C435) | `$48`/`$12` | **4681 B** | 73 B partial + 18×256 B full passes |

Both values, both titles, byte-identical setup offsets (`Gdrive00HasNoC449StyleWorkerTests.
test_gdrive01_c093_c094_setup_is_exactly_the_two_documented_slots` — this round's fix corrected
a real pairing bug in that test itself; see §6.6.1). **Neither 2048 nor 4681 equals any real
WALLSET body length** (400/1200/1536 bytes, §2.1) — this was already the §3.5 conclusion and is
unchanged; what's new this round is a genuinely new caller for slot 12, and its destination:

**New finding — Death Knights' `CAMP.prg`/`GEN.prg` call slot 12 directly, a real cross-title
asymmetry `DUNGEON`-only reachability search never surfaced.** `CampGenSlot12CrossTitleTests`
pins a real, twice-repeated five-instruction idiom in DoK (`JSR $3AC8; JSR $3C23; JSR $C024; JSR
$3C2A; JSR $3ADC`) present in both `CAMP` and `GEN`, and its exhaustive absence (checked via
`contains_direct_call`) from all seven of Champions of Krynn's own `$0800`-slot overlays
(`CAMP`/`GEN`/`COM.PREP`/`POST.COM`/`DUNGEON`/`COMBAT`/`INIT`). **This is real code, not a
coincidental byte alignment** — a real caller of a real, sized (4681-byte) transfer. But its
destination rules it out on structural grounds, independent of the size mismatch already noted:
the surrounding kernel routines (`$3AC8`/`$3C23`/`$3C2A`/`$3ADC` in LIBRARY, read in the course
of this check) select a memory bank with **LORAM=1, HIRAM=0** before the transfer — that
configuration exposes RAM at `$A000`-`$BFFF`/`$E000`-`$FFFF`, **not** the `$D000`-`$DFFF`
character-generator window a WALLSET consumer would need. Two independent grounds (wrong size,
wrong destination bank) now rule this transfer out, not one.

**Conclusion for item 2: every known real caller of the `$C449` worker, across both titles, is
now traced.** GDRIVE01's own two internal setup sites (2048 B / 4681 B, both un-reachable from
`DUNGEON.prg` per §3.5) and DoK's `CAMP`/`GEN` (4681 B, wrong destination bank) exhaust the
population found by exhaustive `$C093`/`$C094` setup-site + `$C024`/`$C021` direct-call scans
across every `$0800`-slot overlay this project has extracted for both titles. None moves a
WALLSET-shaped block to a char-generator-shaped destination.

### 6.3 Item 3, first half: an exhaustive, corrected census of the RAM-exposing pair's real
    callers

The prior round's summary line ("the CPU-port RAM-expose pair itself still has no known caller
anywhere in this project's disassembled set") was **too strong, and contradicted this doc's own
§3.5**, which already states `GDRIVE01.prg $C8A1` "calls `JSR $C015`... then `JSR $C012` to
restore." This round re-derives the correct, narrower claim as a properly-scoped, rerunnable
test rather than leaving the contradiction standing:

- **`GDRIVE01` really does call `$C015`/`$C012` from its own body, cross-title, confirmed by a
  proper origin-aware linear decode (not a raw byte-substring scan)**:
  `RamExposingPairHasNoRealCallerTests.test_gdrive01_itself_really_does_call_c015_and_c012` finds
  real, aligned `JSR $C015` / `JSR $C012` instructions inside `GDRIVE01.prg` at `$C8AA` and
  (later) `$C905` in both titles — exactly the `$C8A1` copy routine already named in §3.5. This
  is expected, already-documented behaviour, not a new surprise.
- **No file OTHER than `GDRIVE01` itself (and `COMBAT.prg`, already proven in §5 to resolve
  against `GDRIVE00`'s unrelated same-numbered slots) calls this pair, in either title, across
  every file this project has established as real 6502 code**
  (`test_c015_and_c012_have_no_caller_outside_gdrive01_and_combat_in_either_title`, scanning the
  new `KNOWN_CODE_FILES` allowlist — `DUNGEON`/`COMBAT`/`CAMP`/`GEN`/`COM.PREP`(or`COMPREP`)/
  `POST.COM`(or`POSTCOM`)/`INIT`/`LIBRARY`/`LINKER`/`FASTL.O`/`GDRIVE00`/`GDRIVE01`/`GDRIVE02`/
  `GDRIVE04`/`GDRIVE05`).

**This required fixing two real bugs a prior incomplete pass had left in the test itself — see
§6.6.2/§6.6.3 for the mechanics.** The corrected, honest claim: `$C015`/`$C012` have exactly one
real caller in the whole two-title corpus (`GDRIVE01`'s own `$C8A1`), that caller's own
transfer sizes/destinations are fully accounted for in §6.2, and no OTHER established code file
reaches this pair. `$C8A1` itself (table slot `$C03F`) still has no known EXTERNAL caller —
that half of §3.5's open question is genuinely unchanged by this round.

### 6.4 Item 3, second half: a corrected, cross-title `GDRIVE00` jump-table census

While re-verifying the jump-table tooling, this round found a real, reproducible correction to
§5.2's structural table: `rts_stub_slots` (decoded fresh this round) reports **9** bare-`RTS`
filler slots in GDRIVE00's 35-slot table, not the 8 a prior write-up recorded — slot **11**
(target `$C3ED`, byte `$60`) is a genuine bare-RTS stub, confirmed byte-identical at that exact
address in **both** Champions of Krynn and Death Knights of Krynn
(`Gdrive00JumpTableStructureTests.test_gdrive00_has_35_slots_with_nine_rts_stubs`, corrected —
see §6.6.4). The stub set is now `[11, 21, 22, 23, 24, 27, 28, 29, 30]`. This does not change any
downstream conclusion (slot 11 was never claimed as a WALLSET lead either before or after), but
it is a real correction to a structural fact this doc had previously stated with one fewer stub
than the bytes actually show.

### 6.5 Verdict for item 3: still neither confirmed nor refuted — but a materially sharper,
    more exhaustive negative than any prior round

**What is now true that was not true before this round:** every CPU-port-toggle-adjacent
primitive this project has found in EITHER graphics driver (`GDRIVE00`'s slot-0 combat
compositor, §6.1; `GDRIVE01`'s `$C449` worker via its own two setup sites AND DoK's newly-found
`CAMP`/`GEN` caller, §6.2; `GDRIVE01`'s CPU-port pair's one real caller, §6.3) has been traced to
a full, real destination, on both titles, and **none of them is a WALLSET-shaped transfer to
`$D000`-`$D7FF`.** This is a stronger negative than §3.5's ("the two most-general primitives are
provably unreached from `DUNGEON.prg`'s five known call sites") or §5's ("`COMBAT.prg`'s
apparent lead resolves to an unrelated driver") individually, because it now covers every
*caller* this project has found for these primitives, not just the callers from one candidate
file (`DUNGEON.prg`) or the callers into one candidate slot pair.

**What is NOT closed, stated as a sharper, narrower open question than either prior round's:**

1. **`$C8A1`/table slot `$C03F` — the one routine actually proven to expose RAM at `$D000`
   (via the CPU-port pair it wraps) — still has no known caller from OUTSIDE `GDRIVE01` itself**,
   in either title. If the WALLSET consumer exists anywhere in this project's currently
   disassembled corpus, the single most plausible remaining place for it is a call site into
   `$C03F` this round did not find — not a new primitive, a missing *caller* of an already-solved
   one.
2. **Four of GDRIVE01's 25 table slots remain individually untraced**: indices 15/16 (targets
   `$C5F9`/`$C605`) and 19/20 (targets `$C6BA`/`$C6BA` — both slots resolve to the SAME target,
   itself worth a note for whoever traces it next). Every other slot in the table (0-14, 17-18,
   21-24) has now been individually read by some pass of this doc (§3.4/§3.5/§5/§6.1/§6.2,
   `c64-compic-format.md` §2.2). Confirmed identical table contents in both titles (`gdrive_
   jump_table` run against both corpora, this round).
3. **`FASTL.O`'s own raw-sector load protocol** (§4 item 1, unchanged) remains the one major
   loading path this project has not disassembled at all — if the WALLSET/WALLDEF pair's load
   call site itself does something graphics-memory-relevant inline (rather than delegating to
   the two primitives this round exhausted), it would be there, not in `GDRIVE00`/`GDRIVE01`.

None of this is a guess dressed up as a finding — items 1-3 above are the literal residue of what
this round did and did not reach, stated as concretely as the bytes support. `WALLSET`'s
container shape (§2) remains CONFIRMED; the glyph-consumer question remains UNCONFIRMED /
UNREFUTED, now with a smaller, better-characterized remaining search space than any prior round
left it.

### 6.6 Tooling fixes this round made (a prior incomplete pass left 4 real bugs)

Before this round's own investigation could be trusted, `python -m pytest tools/test_c64_
wallset.py` showed **4 of 61 tests failing** on the already-checked-in `tools/c64_wallset.py`
and `tools/test_c64_wallset.py` — meaning the code implementing items 1-2 above (`BANKSWITCH_
CALL_TARGETS`, `closed_form_transfer_size`, `Gdrive00Slot0IsCombatNotWallsetTests`,
`CampGenSlot12CrossTitleTests`, `RamExposingPairHasNoRealCallerTests`, etc.) already existed in
the working tree, undocumented, from an earlier attempt at this exact task that evidently did not
finish. Rather than treat the pre-existing code as trustworthy because it was already there, each
failure was root-caused against the real corpus before being fixed — full mechanics below;
`python -m pytest tools/test_c64_wallset.py` now passes 62/62 (one new test added, §6.3).

**6.6.1 — `test_gdrive01_c093_c094_setup_is_exactly_the_two_documented_slots` (synthetic-adjacent,
corpus-backed): wrong `L0`/`H0` pairing.** The test independently sorted `c093_sites` and
`c094_sites` by their immediate VALUE (`[0x48, 0xFF]`, `[0x07, 0x12]`) and zipped the sorted
lists — pairing `L0=0x48` with `H0=0x07` and `L0=0xFF` with `H0=0x12`, the WRONG cross-pairing
(`closed_form_transfer_size` on those gives 1865/4864, matching neither of the doc's real
figures). The real pairing is by physical proximity: each call site's `LDA #L0; STA $C093`
immediately precedes its own `LDA #H0; STA $C094` a few bytes later in the file, and
`find_immediate_then_store` already returns hits in ascending-offset scan order, so zipping the
two lists **in that natural order** (not re-sorted by value) reproduces 2048/4681. Verified the
bug is real by reverting to the sorted-by-value zip and confirming it reproduces the exact wrong
numbers (1865/4864) shown above, then fixed and reverified against both titles.

**6.6.2 — `RamExposingPairHasNoRealCallerTests`: scanned ALL PRG files, not established code, and
never accounted for `GDRIVE01`'s own self-call.** The original test iterated every closed PRG on
side 1 (excluding only `COMBAT` by name) and searched for a raw `20 15 C0`/`4C 15 C0`-style byte
substring. This produced real false-positive hits inside `ECL64` (x3 for `$C015`, x1 for `$C012`),
`SECSET64` (x1) and `COMBAT2` (x1) — none of which is 6502 code (`ECL`/`GEO` are confirmed
byte-identical to DOS ECL-VM bytecode/map data per `c64-disk-format.md` §7.1; `SECSET64`'s weak
self-consistency is already established in `c64-resident-kernel.md` §9.6; `COMBAT2` is confirmed
mostly spell-name ASCII strings in `c64-compic-format.md` §2.4) — a byte trio matching `20 15 C0`
inside interpreted script bytecode or ASCII text is exactly the alias class this project's own
TITLEPG precedent already warned about. **A linear decode from file offset 0 "landing cleanly" on
these offsets is NOT counter-evidence** — a linear walk over almost any byte stream produces some
self-consistent instruction sequence; this is the same "plausible decode is not evidence" trap
the project's org-independence rule already names, just for byte-0-relative alignment instead of
origin choice. Separately, the test's blanket "zero callers anywhere" framing never excluded
`GDRIVE01` itself, silently contradicting §3.5's own already-published finding. Fixed by
restricting the scan to a new, positively-justified `KNOWN_CODE_FILES` allowlist (documented
in `c64_wallset.py` with citations) and splitting the assertion into a positive control
(`GDRIVE01` does call the pair, from its own body — §6.3) and a corrected negative
(no OTHER established code file does).

**6.6.3 — Same test, second bug found while fixing the first: `absolute_operand_hits` alone is
not enough, it must be filtered to JSR/JMP.** After switching to a proper origin-aware decode
(`wallset.absolute_operand_hits`) to fix 6.6.2's alias problem, the corrected scan immediately
found a NEW real hit: Death Knights' `GDRIVE04.prg` has six real, aligned absolute-mode
instructions with operand `$C012`. Disassembling them shows every one is `LDA $C012,X` /
`STA $C012,X` — absolute,X-indexed addressing copying `GDRIVE04`'s own front-matter bytes
elsewhere, not a call at all. `absolute_operand_hits` reports every absolute/absolute-indexed/
indirect instruction in a target range by design (its own docstring says so); it does not by
itself distinguish `JSR`/`JMP` from `LDA`/`STA`/etc. Fixed by filtering its results to mnemonics
`JSR`/`JMP` only. Verified the filter is load-bearing by running the unfiltered version first and
confirming it fails exactly this way before adding the filter.

**6.6.4 — `test_gdrive00_has_35_slots_with_eight_rts_stubs`: stale hardcoded expectation, one
short.** Fixed by re-measuring (`rts_stub_slots(g00)` on fresh reads from both titles) and
updating the expected list from `[21, 22, 23, 24, 27, 28, 29, 30]` to
`[11, 21, 22, 23, 24, 27, 28, 29, 30]` — see §6.4 for the byte-level confirmation that slot 11
is real, not a fluke of one title's build.

**6.6.5 — `test_rts_stub_slots_finds_bare_rts_targets_only` (pure synthetic, no corpus): the test
body was too short for its own hardcoded target addresses.** The 12-byte synthetic body's two
JMP slots targeted `$C010`/`$C011` (offsets 16/17), past the body's own 12-byte end —
`gdrive_slot_target`'s own range guard (correctly) rejected both as out-of-range, so the test was
unknowingly asserting `rts_stub_slots([]) == [0]`, which fails regardless of what the function
under test does. Fixed by retargeting the two slots to `$C00A`/`$C00B` (the body's own last two
bytes, `$60`/`$A9`), which are actually inside the 12-byte body. Verified the original body/target
combination really does produce `[]` (not `[0]`) by re-running it standalone before committing
the fix — this was a real, demonstrable test failure, not a hypothetical one.

None of these five fixes touches item 1's own findings (§6.1) or the container-level WALLSET
proof (§2) — all five are confined to the round-3 tooling this session inherited half-finished.
`python -m pytest tools/test_c64_wallset.py`: 62 passed, 0 failed, 0 skipped (real corpus
present).

---

*Round 3, 2026-08-12 (same slice). Static analysis only, no emulator. Files touched:
`tools/c64_wallset.py` (added `KNOWN_CODE_FILES`), `tools/test_c64_wallset.py` (fixed the 5 bugs
in §6.6, added 1 new test), this document (§6). `docs/engine/research/c64-compic-format.md`'s
GDRIVE00-residence-at-`$C000` correction was treated as settled per the task brief and not
re-litigated. `COMBAT2`'s own real load origin (next-best candidate `$1000` at 48.1%, per §5.3's
adversarial-pass table) was not investigated further this round, per the task brief's explicit
instruction not to chase it independently — nothing in this round's work bears on it either way.*

---

## 7. 2026-08-12, round 4: decode and look — the glyph-mode question, CONFIRMED

**Mandate for this round (per the task brief): stop hunting the consumer. Decode the WALLSET
asset under both plausible VIC-II bit-groupings and render it; judge the result by eye; cross-
check against the DOS `8X8D*.DAX` art for the same nominal id; test whether `WALLDEF`'s bytes
behave like glyph indices into its partner's range.** New tool: `tools/c64_wallset_render.py`
(29 tests, `tools/test_c64_wallset_render.py`, all passing against the real corpus — none
skipped). `tools/c64_wallset.py` itself is unchanged by this round; every function this section
cites lives in the new file.

### 7.1 The two renders, from the identical 8 bytes/glyph

`render_sheet(body, mode)` lays out every glyph of a WALLSET body in a grid, under:

- **hires** — `c64_wallset.glyph_bits` (already existed): 1 bit/pixel, 8x8 px/glyph, plain
  black/white.
- **multicolor** — new `expand_multicolor`: each byte's 4 MSB-first bit-PAIRS are one
  double-wide pixel each (the C64 hardware convention), giving 8x8 px/glyph on a 4-value scale.
  Rendered on a **greyscale** ramp (black/dark-grey/light-grey/white), not real VIC-II colour —
  the real background/multicolor1/multicolor2/foreground register values for this asset are
  UNKNOWN (WALLSET ships no palette, and no screen-mode setup specific to this family has been
  pinned down by any of the prior three rounds' disassembly). Greyscale is the honest choice:
  it shows STRUCTURE without asserting colours nobody has proven.

Both readings consume the *same* 8 input bytes per glyph — only the bit grouping differs,
exactly as `c64_wallset.glyph_bits`'s own docstring already said. `ExpandMulticolorTests.
test_uses_the_same_8_bytes_as_hires_only_the_grouping_differs` pins this with a worked example:
byte `0b10101010` reads as hires row `[1,0,1,0,1,0,1,0]` (a checkerboard) but as multicolor row
`[2,2,2,2,2,2,2,2]` (a solid fill) — the same bits, two completely different pictures.

### 7.2 The visual judgment: 7 samples, 4 titles, one consistent verdict

Rendered and hand-inspected (`renders/c64_wallset/`, git-ignored, not committed):

| Title | id | hires | multicolor |
|---|---|---|---|
| Champions of Krynn | `01` | dense vertical-stripe dither noise | repeating **columns/pillars** under an arched, textured band |
| Champions of Krynn | `0B` | same dither noise | **stepped/pyramidal** stone-course shapes, circular "rivet"/eye motifs, an X-cross element |
| Champions of Krynn | `17` | same dither noise | stepped shapes, horizontal banding (stone coursing), rectangular doorway cutouts |
| Curse of the Azure Bonds | `01` | same dither noise | a large **diagonal/converging-perspective** edge plus vertical bar/pillar elements |
| Death Knights of Krynn | `03` | same dither noise | clear arch/doorway rectangles, wave/curved ceiling lines, a torch-or-skull-like white blob |
| Death Knights of Krynn | `07` | same dither noise | arches, columns, door-frame rectangles, curved corridor-ceiling lines |
| Secret of the Silver Blades | `03` (a 150-glyph area — the corpus's most "elaborate" tier, §2.1) | same dither noise | dense arches, doors, stairs, pillars, alcoves — the richest-looking sheet of the seven |

**Every single hires render, independent of title or id, looks like the same thing: uniform,
featureless vertical-stripe/checkerboard dither with no recognizable shape.** This is not "it
doesn't look like wall art" by a narrow margin — it is qualitatively noise. **Every single
multicolor render shows real, repeated, structurally plausible dungeon-corridor architecture**:
pillars, stepped stone courses, arches, doorway rectangles, curved ceiling lines. Two different
titles at two different area-complexity tiers (50-glyph and 150-glyph) both show the richer
tier (Secret `03`) rendering as visibly *more* elaborate art in multicolor — consistent with
"more glyphs because the area is genuinely more decorated," not an artifact of sample size.

This judgment is deliberately reported as a visual read, the same evidentiary class as the
project's own Amiga BIGPIC1 precedent this task brief cites — but §7.3 below backs it with an
objective, falsifiable number instead of resting on eyeballing alone.

### 7.3 A rerunnable, corpus-wide, bias-controlled quantitative check

Eyeballing seven renders is a real judgment but a small sample. `vertical_row_continuity(body,
mode)` measures, over every glyph in a WALLSET body, the fraction of (row, column) positions
where row *r* and row *r+1* decode to the SAME pixel value in that column — i.e. how often a
glyph's rows agree with the row above them, which is what makes a decoded image look like edges
and filled regions rather than static.

This raw fraction is **not** directly comparable between modes: a 2-valued (hires) reading has
a 50% chance of two random bits matching, while a 4-valued (multicolor) reading only has a 25%
chance of two random 2-bit values matching. `vertical_continuity_excess` subtracts each mode's
own chance baseline (`HIRES_CHANCE_BASELINE = 0.5`, `MULTICOLOR_CHANCE_BASELINE = 0.25`) before
comparing. This bias direction was checked, not assumed: `RandomControlTests` runs the same
excess-comparison over 200 genuinely random 400-byte bodies (seeded, `random.Random(20260812)`)
and confirms an even split (asserted strictly between 35%/65%, i.e. not the real corpus's
lopsided result) — ruling out "the metric always prefers multicolor regardless of content" as
an alternative explanation for what the real corpus shows.

**On the real corpus** (`corpus_mode_verdict`, every real WALLSET body across all seven
titles): **310 of 320 files (96.9%) have a larger vertical-continuity excess under the
multicolor reading than under hires.** Rerun:

```
python tools/c64_wallset_render.py --mode-verdict "D:/Games/Emulator/C64/Goldbox"
# total files=320  multicolor_wins=310  hires_wins=10  multicolor_fraction=96.9%
```

Pinned by `CorpusModeVerdictTests.test_multicolor_wins_the_overwhelming_majority_of_real_
wallset_files` (asserts >85%, `total_files>=300`, deliberately wide so this test doesn't need
editing on a legitimate future re-extraction that shifts the exact count by a handful of files
— the qualitative, lopsided-majority claim is what's under test, not an exact tally). The 10
hires-favouring outliers were not individually chased this round — a reasonable next probe, not
a contradiction of the 97%-majority verdict.

**This is now real, checkable, population-scale evidence, not seven cherry-picked renders.**

### 7.4 DOS `8X8D*.DAX` cross-check: same nominal id, corroborating motif family

DOS `WALLDEF*.DAX` block ids were already known (§3.1) to equal the C64 hex id's decimal value
(content differs, but the id *keying* matches). This round establishes the SAME keying for DOS
`8X8D*.DAX` (the actual DOS wall-tile pixel family, per `docs/dax-format.md` §4b) — new
functions `dos_walldef_ids`/`dos_8x8d_low_ids`:

```
Champions of Krynn:  WALLDEF ids {1,3,5,7,8,10,11,13,14,15,17,19,21,23} (14)
                      8X8D low ids {7,10,11,12,13,14,23,31,32,51,52}
                      overlap {7,10,11,13,14,23} — 6/14 of WALLDEF's ids
Death Knights of Krynn:  WALLDEF ids {1,2,3,4,5,6,7} (7)
                         8X8D low ids {1,2,3,4,5,6,7} — EXACTLY equal, a clean 1:1 match
```

Death Knights' exact match is the strongest single piece of evidence that a `8X8D` block at
`block_id == <the C64 hex id read as decimal>` really is "the DOS wall art for that same area,"
not a coincidence — pinned by `DosCrossCheckTests.test_id_crosscheck_is_a_clean_1to1_match_
for_death_knights`.

`dos_8x8d_tile_strip(dos_dir, block_id)` decodes that block through `dax_decode.py`'s existing,
independently-verified pipeline (byte-identical to this project's own pre-existing
`renders/tiles8x8/8X8D1_blk11_strip16w.png` reference render for id `0B`/block 11 — confirmed
by direct image comparison this round, not re-derived from scratch) and `reshape_strip_to_grid`
reflows the resulting tall 16px-wide strip into the same square-grid layout `render_sheet` uses
for WALLSET, so the two can be eyeballed at comparable scale (`ReshapeStripToGridTests` pins
the reshape's own tile-quadrant correctness with a synthetic red/blue two-tile probe).

**Rendered side by side for the same nominal id** (CoK `0B`/block 11, CoK `17`/block 23): the
DOS EGA art shows real, though EGA-dithered, architectural elements — repeating vertical
pillar/stripe bands, dark rectangular doorway cutouts, a diagonal converging-perspective line —
the same *category* of motif (pillars, doors, converging corridor perspective) the C64
multicolor render shows for the corresponding ids, though never a literal pixel match (expected
— C64 and DOS art in this corpus are independently redrawn on every graphics family this
project has ever checked, never byte-shared, per `test_c64_disk.py`'s
`test_only_maps_and_scripts_are_ever_byte_identical`). **This is corroboration by motif family,
not identity** — exactly the level of correspondence the task brief asked this cross-check to
look for.

### 7.5 `WALLDEF` as a flat glyph-index array: tested directly, a partial negative plus one new
    clue

`walldef_index_validity(walldef_body, glyph_count)` asks the simplest possible question: if
`WALLDEF`'s bytes were literally an array of indices into its partner `WALLSET`'s glyph bank,
what fraction would be valid (`< glyph_count`)? Run over every paired id in three titles
(`--walldef-index-check`):

- **50-glyph titles** (Champions of Krynn, most of Secret of the Silver Blades): in-range
  fraction **19.84%–41.63%** per id over the full 35-id population (22 CoK + 13 Secret).
  *(Corrected 2026-08-12: this read "20%–38%", which is the range for **Champions alone**
  — 19.84% at id 04 to 38.03% at its top. Secret's id 06 reaches 41.63% and breaches that
  ceiling, so the stated range did not cover the population the sentence names. Either
  figure supports the same conclusion; the fault was quoting one population's range while
  naming another's.)* Chance level for a uniform-random byte and `glyph_count=50` is
  50/256 ≈ 19.5% — the observed range is only modestly above that floor, **not** the
  near-100%-in-range signature a real flat index array would show. This is a real negative
  result for the simplest reading, consistent with (not proof of, but consistent with) WALLDEF
  packing richer per-cell information than a bare glyph index — plausible by analogy with the
  DOS split, where `WALLDEF*.DAX` is itself a `byte[5][156]` routing table, not a 1:1 index list
  either.
- **192-glyph titles** (Death Knights of Krynn, all 7 ids): in-range fraction 79%–94% — but
  chance level here is 192/256 = 75%, so this is much closer to what pure chance alone would
  produce for `glyph_count=192`, **not** independent evidence of real indexing once the
  baseline is accounted for (the same bias-correction lesson §7.3 already had to apply to the
  vertical-continuity metric).
- **New, unexplained, corpus-wide clue**: the maximum byte value across a title's WALLDEF
  bodies is overwhelmingly, almost universally, exactly `0xF0` (240) for every 50-glyph title
  checked (Champions of Krynn 19/22 files, Curse of the Azure Bonds 18/18, Secret of the Silver
  Blades 12/15, Gateway to the Savage Frontier 14/14), while Pool of Radiance (also 50-glyph)
  instead clusters at `0xFF` (255) uniformly (18/18) and the 150-glyph Secret areas also show
  255. This near-constant ceiling looks like a real structural feature — plausibly a sentinel,
  terminator, or flag-bit convention riding in the byte's high bits — not the natural spread a
  flat index array or free-form RLE stream would produce. **Not investigated further this
  round** (out of scope for the glyph-mode mandate); flagged here as a concrete, sharper lead
  for whoever next attacks `WALLDEF`'s internal layout.

Body-length-vs-glyph-count scaling (§3.3's existing, imperfect correlation) is unchanged by
this round: 50-glyph WALLDEF bodies range ~645–1475 bytes (mean ≈1100), 150-glyph areas are
2564/3238 (mean ≈2900), 192-glyph areas are 2865–3826 (mean **≈3216**, corrected 2026-08-12 from
a stated ≈3288; the seven DoK bodies are 2865, 2959, 3002, 3058, 3301, 3498, 3826) — real and monotonic in the
mean, but not a clean linear formula (glyph-count ratios of 3x/3.84x correspond to length-mean
ratios of only ≈2.6x/≈3.0x).

### 7.6 Verdict

**CONFIRMED: `WALLSET` records are VIC-II multicolor character-generator glyphs (2 bits/pixel,
not 1).** This settles the glyph-mode half of the reading this doc's Status line has called
"strong but not proven" since round 1 — by rendering the asset and looking, corroborated by an
unbiased corpus-wide quantitative check (310/320 files, 96.9%) and a same-title DOS art
cross-check showing the same motif family. `tools/c64_wallset_render.py`'s renderer is the
now-justified escalation the earlier rounds explicitly deferred ("upgrading the renderer is
conditional on the reading being confirmed" — §3.5's closing line); `tools/c64_wallset.py`'s
own `render_wallset_contact_sheet` remains the illustrative hires-only sheet it always was and
was deliberately left unchanged this round (the new file supersedes it for anyone who wants the
confirmed reading).

**STILL OPEN, sharper than before:**

1. **The real palette.** Which VIC colours actually populate background/multicolor1/
   multicolor2/foreground for this family is unknown — the renders in this round are
   structure-revealing greyscale, not a claim about final on-screen colour.
2. **The consumer.** Three rounds of static disassembly (§3.4–§6) did not find the routine that
   copies a WALLSET-shaped block to `$D000`-`$D7FF`; that remains true. This round did not
   reopen that search (the task brief's own point: settle the format by decoding, not by
   finding the copy loop) — a future round chasing the consumer now does so knowing exactly
   what it's looking for (confirmed multicolor glyphs), not an open hypothesis.
3. **`WALLDEF`'s real encoding.** Not a flat glyph-index array (§7.5) at any tested title's
   scale once chance baselines are subtracted; the near-universal `0xF0` byte ceiling on
   50-glyph titles is a real, new, unexplained lead.

---

*Round 4, 2026-08-12 (same slice). Static analysis + offline decode only, no emulator. Files
touched: new `tools/c64_wallset_render.py` (renderer, DOS cross-check, corpus mode verdict,
WALLDEF index-validity check) and new `tools/test_c64_wallset_render.py` (29 tests, all passing
against the real corpus, none skipped — `python -m pytest tools/test_c64_wallset_render.py -q`).
`tools/c64_wallset.py` itself untouched. Two real mutations were applied and reverted to confirm
the suite can fail: (1) `expand_multicolor`'s bit-pair shift changed from `6 - 2*pair` to
`2*pair` (reverses which nibble-pair maps to which output column) — 1 test (`test_known_byte_
decodes_to_known_pair_values`) went red, 28 stayed green, reverted with a byte-identical
`diff` confirming the restore; (2) `MULTICOLOR_CHANCE_BASELINE` changed from `0.25` to `0.05` —
`RandomControlTests` went red (the random control's own fraction reported 1.0, correctly
outside the asserted 0.35–0.65 band, proving the control is load-bearing, not vacuous), reverted
the same way. Rendered outputs live only in git-ignored `renders/c64_wallset/`, never committed.

---

## 8. 2026-08-13, round 5: the display mode SETTLED from VIC register state — a rule-4 census of every `$D016`/`$D011`/`$D018` write in all seven titles

**Verdict up front, in two halves, because the honest answer is not a single yes/no.**

> **REFUTED (the universal, as this round's brief stated it).** The brief's claim was: *"In all
> seven titles, no statically-reachable code path clears `$D016` bit 4 (or enables `$D011` bit 5
> bitmap mode) after `GDRIVE01`'s `$C0A1` slot-0 routine sets it."* That is **false as written**.
> Every one of the seven titles contains a decode-aligned, locally-code-clean
> `LDA $D016 / AND #$EF / STA $D016` — multicolour explicitly turned **off** — and a
> decode-aligned `LDA $D011 / ORA #$20 / STA $D011` — bitmap mode explicitly turned **on**.
> Both idioms exist, in real code, in every title. They had never been censused.
>
> **ESTABLISHED (the scoped claim, which is the one the WALLSET question actually needs).**
> Every one of those refuting writes lives in a single file: **`INIT`**, one of the mutually
> exclusive `$0800` dispatch overlays. Across **2610 files on 49 disk sides** there is **no
> other file in the corpus** that clears `$D016` bit 4 or sets `$D011` bit 5 — and `INIT`
> cannot be resident at the same time as `DUNGEON`, because both occupy the `$0800` overlay
> slot. Outside `INIT`, **every** credible `$D016` write in the entire corpus — 21 of them —
> provably **sets** bit 4. `DUNGEON` itself names `$D011`/`$D016`/`$D018` **zero** times in all
> seven titles, not even as a byte-alias, and re-enters `GDRIVE01`'s multicolour setup via
> `JSR $C000` on every load.
>
> **So: any charset-based dungeon display in this corpus runs in multicolour character mode by
> hardware state.** Not because nothing ever clears the bit — something does — but because the
> only thing that clears it is a boot overlay that is physically not in memory while the dungeon
> is on screen, and the dungeon path re-asserts the bit on entry.
>
> This is what §7's retracted verdict was reaching for. It is now supported by hardware state
> read out of the bytes rather than by a glyph-sheet statistic or a visual read, and it does
> **not** depend on `WALLDEF` — the header's "blocked on `WALLDEF`" framing for the *mode*
> question is superseded (the *palette* and the *consumer* questions are not).

Tool: **`tools/c64_vicmode.py`** (new). Tests: **`tools/test_c64_vicmode.py`** (new, 48 tests,
all passing against the real corpus, none skipped). No emulator, no VICE, no DOSBox — static
byte analysis only.

### 8.1 Why a register census, and why "rule 4" is the whole design

§7's multicolour verdict was retracted because both its legs were non-discriminating. The mode,
though, is not a property of the pixels at all — it is a **VIC-II hardware state**, and the
population of code that can set it is tiny. `docs/engine/research/c64-disk-format.md` §7.5 had
already read `GDRIVE01`'s `$C0A1` routine setting `$D016` bit 4; §3.4 above had already proved
`DUNGEON` reaches it. The one thing nobody had done was ask **whether anything later clears it**.

A store-only scan is not good enough to answer that, and this is the load-bearing methodological
point (STANDING PROJECT RULE 4). The real idiom in this corpus is a **read-modify pair**:

```
$C0B1  A9 34      LDA #$34
$C0B3  8D 18 D0   STA $D018      ; screen $CC00, charset $D000, 256 glyphs
$C0B6  A9 10      LDA #$10
$C0B8  0D 16 D0   ORA $D016
$C0BB  8D 16 D0   STA $D016      ; multicolour ON
```

A scan for `STA $D016` finds the write but **not the value**. So `candidate_sites()` enumerates,
at every byte offset with no alignment assumption:

* `STA` in ABS/ABX/ABY, `STX` ABS, `STY` ABS;
* the read-modify-write opcodes `INC`/`DEC`/`ASL`/`LSR`/`ROL`/`ROR` in ABS and ABX (12 opcodes) —
  each of which writes the address it names;
* the **undocumented** NMOS store/RMW opcodes `SLO`/`RLA`/`SRE`/`RRA`/`SAX`/`SHA`/`SHX`/`SHY`/
  `TAS`/`DCP`/`ISC` in their 3-byte forms — `tools/c64_disasm.py` deliberately omits all
  illegal opcodes, so these are matched by raw opcode byte and reported as their own class;
* the **read** side (`LDA`/`LDX`/`LDY`/`ORA`/`AND`/`EOR`/`ADC`/`SBC`/`CMP`/`BIT` in ABS/ABX/ABY),
  without which the stored value of a read-modify pair is unresolvable;
* and, separately, every `abs,X`/`abs,Y` **write** whose literal base lies in `[$D000, $D018]` —
  the writes a literal-operand census structurally cannot see (§8.6).

`ECM` (`$D011` bit 6, extended-colour mode) is censused too. It is the *third* answer to
"hires or multicolour" that nobody had ruled out: it reinterprets the top two bits of every
screen code as a background select and restricts the charset to 64 glyphs. **Zero enables
anywhere in the corpus** (§8.3) — a clean negative, obtained by looking rather than assuming.

### 8.2 Adjudication: telling a real instruction from a byte-alias

A raw operand scan is not decode-accurate (see `c64_disasm.find_stores`'s own docstring), so
every hit is a *candidate*. Two independent tests decide:

* **`convergence(body, offset, lookback)`** — of the `lookback` start offsets immediately before
  the site, how many decode forward onto it exactly? 6502 code is strongly self-synchronising, so
  a real boundary attracts nearly all of them and a mid-operand alias attracts almost none.
  Measured: `GDRIVE01`@187 = 11/12, `LIBRARY`@3454 = 11/12, `INIT`@1060 = 12/12; versus
  `GEN`@2191 (`SHA $D016`) = 1/12, `COMBAT`@1872 (`EOR $D018`) = 0/12, `CAMP`@4267 = 0/12,
  `INIT`@532 (`LSR $D011`, actually the operand of the preceding `DEC $114E`) = 0/12.
* **`local_illegal_fraction(body, offset, radius)`** — the illegal-opcode fraction of the decode
  that actually contains the site, not of the whole file.

**The local measure is not a cosmetic refinement, and the reason is STANDING PROJECT RULE 1.**
The first version of this pass used `c64_sprite.illegal_opcode_fraction` file-wide with the
sprite doc's 0.20 cut. That put `INIT` on opposite sides of the line for no reason but where the
cut fell — Curse of the Azure Bonds' `INIT` scores **0.198** and Secret of the Silver Blades'
**0.209** — silently deleting 10 real, perfectly-decoding sites from one title's census while
keeping the identical 10 in another. Locally, around their own VIC routines, both score **0.000**
at radius 64; the file-wide number is dominated by `INIT`'s large embedded data tables and says
nothing about whether a given site is an instruction. Both windows are swept and reported
(§8.5), and the headline verdict is invariant across all 84 grid points tried.

Stored values are resolved by `trace_bit()`, a deliberately conservative one-bit symbolic
simulator over the aligned instruction prefix: `LDA/LDX/LDY #imm` sets the bit's state,
`ORA #imm` can only set it, `AND #imm` can only clear it, transfers copy it, and **anything it
cannot prove — a `JSR`, a memory load, arithmetic, a pull — resets to UNKNOWN rather than
guessing**. `LDA $114C / STA $D016` (INIT's saved-value restore) therefore reads UNKNOWN, not
"clear". Read-modify-write opcodes on a single bit are UNKNOWN by construction.

### 8.3 The census, all seven titles

```
python tools/c64_vicmode.py summary
```

| title | candidates | writes | credible | MCM set | MCM clear | BMM set | ECM set | DUNGEON hits |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Champions of Krynn | 30 | 16 | 15 | 3 | 2 | 1 | 0 | **0** |
| Death Knights of Krynn | 26 | 15 | 15 | 3 | 2 | 1 | 0 | **0** |
| Curse of the Azure Bonds | 24 | 13 | 12 | 3 | 1 | 1 | 0 | **0** |
| Secret of the Silver Blades | 27 | 15 | 15 | 3 | 2 | 1 | 0 | **0** |
| Gateway to the Savage Frontier | 27 | 13 | 12 | 3 | 1 | 1 | 0 | **0** |
| Pool of Radiance | 34 | 18 | 17 | 4 | 1 | 1 | 0 | **0** |
| Buck Rogers — Countdown to Doomsday | 20 | 11 | 11 | 2 | 1 | 1 | 0 | **0** |

188 candidate sites corpus-wide, 101 of them writes, 97 credible. Every count is pinned by
`CorpusCensusTests` / `DisplayModeClaimTests` in `tools/test_c64_vicmode.py`.

**The 21 non-`INIT` `$D016` writes and what each does** (`python tools/c64_vicmode.py census`):

| file | offset | idiom | effect | present in |
| --- | ---: | --- | --- | --- |
| `GDRIVE01` | 187 (`$C0BB`) | `LDA #$34 / STA $D018 / LDA #$10 / ORA $D016 / STA $D016` | MCM **on** | all 7 |
| `LIBRARY` | varies | byte-identical to the above | MCM **on** | all 7 |
| `SPELLN64` | 129 | `LDA $D016 / ORA #$10 / STA $D016` | MCM **on** | 5 (no such file in DoK/Buck) |
| `GDRIVE04` | 115 | `LDA $D016 / ORA #$10 / STA $D016` | MCM **on** | DoK only |
| `POOLRB` | 11175 | byte-identical to `GDRIVE01`'s | MCM **on** | Pool only |

**Not one of them clears the bit.** `GDRIVE00` and `GDRIVE02` — the other two occupants of the
`$C000` driver slot, so the §5 "which driver is really resident" hazard cannot bite here — make
**no reference at all** to `$D011`/`$D016`/`$D018` in any title.

**Two corrections this round produces to prior write-ups:**

1. **`SPELLN64`@124/129 is real code, not a data alias.** The round brief guessed it was
   "almost certainly data". It is not: convergence 11/12 and 10/12, local illegal fraction 0.000
   at radius 64, and it disassembles as a clean save-and-set sequence
   (`LDA $D021 / STA $95F9 / LDA #$0B / STA $D021 / LDA $D016 / ORA #$10 / STA $D016`). It
   corroborates the verdict rather than threatening it, but the guess was wrong and is recorded
   as wrong.
2. **`c64-disk-format.md` §7.5's transcription of `$C0A1` is missing an instruction.** It prints
   `$C0B3 STA VIC_MEMPTR` followed directly by `$C0B8 ORA VIC_CTRL2` — a two-byte hole. The
   bytes are `A9 34 8D 18 D0 A9 10 0D 16 D0 8D 16 D0` at `GDRIVE01` body offset 177 in **all
   seven titles**, i.e. there is an `LDA #$10` at `$C0B6`. The doc's *conclusion* (`$D016 |= $10`)
   is unaffected — `$34` also has bit 4 set — but the listing implies the `ORA` is applied to
   `$34`, and it is not. That file was left untouched this round to avoid colliding with
   concurrent work; the one-line fix is flagged here.

### 8.4 The refutation, in full, and why it does not reach the dungeon

Every mode-disturbing write in the corpus is in `INIT`. Champions of Krynn, org `$0800`:

```
$0BF1  AD 11 D0   LDA $D011
$0BF4  29 EF      AND #$EF        ; DEN off -- screen blanked
$0BF6  8D 11 D0   STA $D011
...
$0C0B  AD 18 D0   LDA $D018
$0C0E  29 0F      AND #$0F
$0C10  09 70      ORA #$70        ; screen base -> bank+$1C00
$0C12  8D 18 D0   STA $D018
$0C15  AD 18 D0   LDA $D018
$0C18  29 F1      AND #$F1
$0C1A  09 08      ORA #$08        ; charset base -> bank+$2000
$0C1C  8D 18 D0   STA $D018
$0C1F  AD 16 D0   LDA $D016
$0C22  29 EF      AND #$EF        ; <-- MULTICOLOUR OFF
$0C24  8D 16 D0   STA $D016
...
$0C88  AD 11 D0   LDA $D011
$0C8B  09 20      ORA #$20        ; <-- BITMAP MODE ON
$0C8D  8D 11 D0   STA $D011
$0C90  A9 3F      LDA #$3F
$0C92  8D 15 D0   STA $D015       ; sprites 0-5 enabled
```

and, in Champions/Death Knights/Secret only, a second clear spelled differently — which is
exactly why the opcode census exists and a `grep` would not have done:

```
$0FAD  AD 16 D0   LDA $D016
$0FB0  8D 4C 11   STA $114C       ; save the current register
$0FB3  29 EF      AND #$EF
$0FB5  8D 16 D0   STA $D016       ; <-- MULTICOLOUR OFF, second idiom
```
restored later by `LDA $114C / STA $D016` at `$09C8` and `$09D5`. `find_idiom()` with the fixed
`AD 16 D0 29 EF 8D 16 D0` pattern reports **1** hit per title; the opcode census reports **2**
in those three titles. Pinned by `test_the_pattern_search_undercounts_relative_to_the_opcode_census`.

**Why this does not put hires back on the table for the dungeon**, in three independent steps,
each measured rather than asserted:

1. **`INIT` is an `$0800` overlay.** Own-`JSR`/`JMP` self-consistency (LIBRARY's heavily-called
   span excluded as a confound, the same correction `c64_kernel.self_consistency_excluding` was
   written for) picks `$0800` decisively in all seven titles: 34–71% at `$0800` versus 0–11% at
   `$4000` and 0–3% at `$C000`. It is one of the eight mutually exclusive dispatch overlays
   (`GEN`/`DUNGEON`/`COMBAT`/`INIT`/`COM.PREP`/`POST.COM`/`FINAL`/`CAMP`), so its bytes are gone
   the moment `DUNGEON` is loaded into the same slot. **Of those eight overlays, `INIT` is the
   only one with any credible VIC mode write at all** — `GEN`'s single hit is the `SHA` alias,
   `CAMP`'s and `COMBAT`'s and `COM.PREP`'s are all convergence 0–3/12 aliases inside data.
2. **`DUNGEON` never touches these registers.** Zero candidate sites — not one byte-alias — in
   all seven titles. This generalises §3.4's Champions-of-Krynn-only finding to the whole corpus.
3. **The dungeon path re-asserts the mode.** `GDRIVE01`'s table slot 0 is `JMP $C0A1` in all
   seven titles, the multicolour idiom sits at body offset 177 (`$C0B1`) inside that routine's
   body, and `DUNGEON` contains 2–3 `JSR $C000` sites per title.

`INIT`'s bitmap-mode enable, similarly, is the boot/title-screen display: it is immediately
followed by `$D015 = $3F` (sprite enable) and `$D018` pointed at a *different* charset base
(`bank+$2000`, not the `$D000` the dungeon uses).

One further, independent reassurance: the multicolour-set routine is **also** present, byte for
byte, in **`LIBRARY`** — the always-resident kernel (`docs/engine/research/c64-resident-kernel.md`),
which is never unloaded. It is exposed through LIBRARY's own leading `JMP` table (slot 29 in
CoK/CoAB/Gateway, slot 2 in DoK/Secret/Buck; Pool's copy is not in the table) and is called
directly by `INIT`. LIBRARY contains **exactly one** `$D016` write in every title and it sets
bit 4. So the resident half of the address space contains no way to turn multicolour off at all.

### 8.5 Window-edge and threshold sensitivity (STANDING PROJECT RULE 1)

Both analysis windows were swept and both neighbours reported, because the whole point of this
round was to avoid repeating §7's mistake of letting an instrument's own artefact become the
finding.

* **Lookback 11 / 12 / 13** — credible-write counts *identical* at all three, for all seven
  titles: `[15, 15, 12, 15, 12, 17, 11]` at each.
* **Local radius 32 / 64 / 96 / 128** — credible-write counts *do* move a little
  (`Curse`/`Gateway` 13→12 between 32 and 64; `DoK`/`Secret` lose their second `INIT` clear at
  radius 96 because the window reaches into an adjacent data table). **The counts are therefore
  window-sensitive and are reported as such.**
* **The headline verdict is not.** Over the full 4×3 grid, 84 title-window combinations, the set
  of files containing a multicolour-clearing or bitmap-enabling write is **`{INIT}`** at every
  single point, and is never empty. Pinned by
  `WindowEdgeTests.test_the_headline_verdict_is_invariant_across_the_whole_window_grid`.

### 8.6 The indexed-write blind spot, measured rather than assumed

A literal-operand census cannot see `STA $D000,X` with `X = $16`. `indexed_base_sites()` censuses
every `abs,X`/`abs,Y` write whose base lies in `[$D000, $D018]` — bases above `$D018` are
excluded because an unsigned index only ever adds. Corpus-wide this finds 24–52 such sites per
title; most are picture/ECL data aliases (convergence 0–3/12).

Every credible one in a graphics-path file (`DUNGEON`, `GDRIVE00`, `GDRIVE01`, `LIBRARY`) has an
index bounded by an aligned `LDX/LDY #imm` in the same straight-line run, and **`base + bound`
is below `$D011` in all 29 cases**:

| file | site | index source | highest address reachable |
| --- | --- | --- | ---: |
| `DUNGEON` | `STA $D000,X` ×3 | `LDX #$03` / `LDX #$07` / `LDX #$0B`, all `DEX`/`BPL` | `$D00B` |
| `GDRIVE00` | `STA $D00E,X` | `LDX #$01`, `DEX`/`BMI` | `$D00F` |
| `GDRIVE01` | `STA $D005,Y` | `LDY #$0A`, `DEY`/`DEY`/`CPY #$00`/`BPL` | `$D00F` |

Two sites did **not** resolve from an immediate and were read by hand: Pool of Radiance's
`DUNGEON` at body offsets 8650/8659 computes `LDX $9701 / … / STA $CFF8,X / TXA / ASL A / TAY /
STA $D000,Y`. `X` is a sprite slot index bounded to 0–7 by the `STA $CFF8,X` sprite-pointer write
in the same run (`$CFF8`–`$CFFF` are the eight pointers for the screen at `$CC00`), so `Y = 2X ≤
14` and the highest address either store can touch is `$D00F`. Recorded as a hand adjudication in
`IndexedBlindSpotTests.HAND_ADJUDICATED`, with the two byte sequences it depends on pinned.

### 8.7 Reproducing every number in this section

```powershell
PYTHONIOENCODING=utf-8 python tools/c64_vicmode.py summary          # the 8.3 table
PYTHONIOENCODING=utf-8 python tools/c64_vicmode.py census           # every site, adjudicated
PYTHONIOENCODING=utf-8 python tools/c64_vicmode.py indexed          # the 8.6 blind-spot sweep
PYTHONIOENCODING=utf-8 python tools/c64_vicmode.py show --title "Champions of Krynn" --file INIT --off 1060 --org 0x0800 --count 16
PYTHONIOENCODING=utf-8 python -m pytest tools/test_c64_vicmode.py -q   # 48 passed
```

### 8.8 What this changes, and what it does not

**Changes.** The glyph-*mode* question is settled from hardware state, without `WALLDEF` and
without a pixel argument: charset-based dungeon output runs multicolour. §7's retracted headline
can be re-stated — but on this evidence, not on §7's. The header's "the mode question is blocked
on `WALLDEF`" framing is superseded for the mode specifically.

**Does not change.**
1. **This is a statement about the VIC's mode, not about what bytes reach `$D000`.** It says any
   charset the dungeon displays is interpreted 2 bits/pixel. It does **not** prove `WALLSET` data
   is what ends up in the character generator — that is still §3.4/§6's open consumer question,
   and three rounds of disassembly have not found the copy loop.
2. **The palette is still unknown.** `$D021`/`$D022`/`$D023` values for the dungeon view were not
   traced this round.
3. **`WALLDEF`'s encoding is untouched** by this round.
4. **Runtime was not observed.** Everything here is static; no VICE, no emulator (the round brief
   forbade it). A dynamic trace could still show a path this census cannot see — self-modifying
   code that builds a `STA $D016` at runtime, or an indexed write whose index this pass could not
   bound. `INIT`'s two UNKNOWN `$D016` writes (`LDA $114C / STA $D016`) restore a *saved* register
   value and are honestly unresolved, though they are in `INIT` and therefore off the dungeon path
   either way.
5. **Which of `GDRIVE00`/`GDRIVE01` is resident during `DUNGEON` was not re-litigated** (§5's
   hazard). It does not matter here: neither driver contains a multicolour clear, and `GDRIVE00`
   contains no reference to these registers at all.

---

*Round 5, 2026-08-13 (same slice). Static byte analysis only — no DOSBox-X, no VICE, no emulator.
Files added: `tools/c64_vicmode.py`, `tools/test_c64_vicmode.py` (48 tests, all passing against
the real corpus, none skipped). No existing tool or doc was modified. Twelve mutations were
applied to the module and reverted, each confirmed to turn the suite red: dropping the 12 RMW
opcodes (4 red); flipping `MCM_BIT` `$10`→`$20` (11 red); `ALIGN_MIN_FRACTION` 0.5→0.0, i.e.
accepting every alias (4 red); dropping `SAX`/`SHA`/`SHX`/`SHY`/`TAS` from the undocumented-opcode
table (3 red); `CODE_MAX_ILLEGAL_FRACTION` 0.20→1.00 (3 red); `LOCAL_RADIUS` 64→256 (2 red);
reverting the immediate-alignment fix to the raw `body[off-2]` check (1 red); making `trace_bit`
carry a stale verdict across an absolute load (2 red); dropping the READ opcode class (3 red);
censusing only `STA` — the one idiom a naive scan would look for (3 red); aliasing `ECM_BIT` onto
`BMM_BIT` (2 red); raising the indexed-base ceiling above the highest target (3 red). The harness
is `scratchpad/vicmode_mutations.py` (scratch, not committed); it restores the module and
re-confirms green after every mutation.*
