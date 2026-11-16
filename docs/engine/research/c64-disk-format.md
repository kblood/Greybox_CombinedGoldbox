# C64 Gold Box disks: reading them, and what they prove about DOS `.DAX`

Status: **format library landed** (`tools/c64_disk.py`, `tools/c64_disasm.py`, `tools/c64_pic.py`,
and their tests). The full-screen picture codec is solved, all 37 payloads including the two Buck
Rogers outliers (section 7.4).
Date: 2026-08-10, extended 2026-08-11 (sections 7.4 and 7.5, and again the same day: the Buck
Rogers outliers).

The user's C64 collection is the third platform source, alongside DOS (in-repo) and Amiga
(referenced on `D:\`). Like the Amiga images it is **referenced, never vendored** — the disk
images stay on the user's drive and the tests skip when they are absent.

```
D:\Games\Emulator\C64\Goldbox\<Title>\             SEVEN complete title sets, 49 sides (.d64)
  <Title>\superseded\                              damaged dumps replaced from another source
D:\Games\Emulator\C64\Goldbox-alternates\<Title>\  independent dumps used for repair
D:\Games\Emulator\C64\MyGames\CoK\                 Champions of Krynn, 6 sides (.g64), 575 files
D:\Games\Emulator\C64\OneLoad64-Games-Collection-v5\Extras\OtherCRTs\
                                                   EasyFlash .crt for six Gold Box titles (see §6)
D:\Games\Emulator\DOS\GoldBox\BuckRogers1-CountdownToDoomsday\
                                                   73 .dax — the DOS half of the Buck Rogers pair
```

**The `.d64` sets are the corpus** (transferred 2026-08-10 from `DESKTOP-4CE4B1R` via the AI
Control Center file share; they were not on this machine before). Seven titles, 49 sides,
**4426 PRG files, every closed file on every side reading clean**:

| Title | Sides | PRG | Broken chains |
| --- | ---: | ---: | ---: |
| Pool of Radiance | 10 | 984 | 0 |
| Gateway to the Savage Frontier | 8 | 825 | 0 |
| Champions of Krynn | 7 | 578 | 0 |
| Secret of the Silver Blades | 6 | 574 | 0 |
| Curse of the Azure Bonds | 6 | 557 | 0 |
| Death Knights of Krynn | 6 | 502 | 0 |
| Buck Rogers — Countdown to Doomsday | 6 | 406 | 0 |

The one file that will not walk is `.FRANK` on Champions of Krynn side 1 — a cracker signature,
not a game asset, and an **unclosed** (splat) directory entry, so `e.closed` excludes it.

Two corrections this supersedes:

- **Gateway to the Savage Frontier did have a C64 release** — 8 sides, 825 files, the largest set
  here. An earlier note in this project claimed the Savage Frontier games were DOS/Amiga only.
- **Champions of Krynn is no longer the only complete title, and the `.g64` set is no longer the
  best copy of it.** The `.d64` set reads clean, where `CoK_A.g64` (the damaged boot side) loses 33
  files. The `.g64` set is kept because it is the only GCR-format material here and so is what
  exercises that decoder.

### The Curse of the Azure Bonds repair (2026-08-10)

The first CoAB dump had **42 broken chains** and was the one genuinely damaged set. The diagnosis
is worth keeping because the failure mode is not the obvious one:

- Side 3, 3 files: chains pointing at **impossible track numbers** (188, 185, 178).
- Side 4, 39 files: all reported as `walked N blocks, directory says M`. Those files were not
  merely truncated — **none** of the 39 matched any DOS block, and 38 of the 39 produced the
  *identical* 3556 bytes (14 × 254) despite directory block counts ranging 1–22. Their start
  sectors were distinct but all on tracks 6–9, while every clean file on that side starts on
  tracks 16–21. Distinct starts yielding identical content means the region is uniform filler:
  **the dump's low tracks were never written**. The directory itself parsed correctly throughout,
  so this was the medium, not the reader.

Repaired from an independent 8-side dump staged on the same machine. Its sides 4/5 are
byte-identical raw images to our sides 5/6, and its B/C disks carry the same version strings
(`CURSE DSKB3 V1.0`, `DSKB4 V1.1`, `DSKC5 V1.0`, `DSKC6 V1.0`), so sides 3 and 4 were swapped in
and the damaged images kept under `superseded/`. Sides 1/2 were left alone: there the two sets are
genuinely different releases (ours `DSKA1 V1.1`/`DSKA2 V1.0` against `V1.0`/`V1.2`) and ours
already read clean, so mixing versions would have been the riskier move.

One residue: `SPRITE27` on side 4 differs between the two dumps by **a single byte at offset 609**
(`0x90` vs `0xA0`), both chains clean. Neither variant matches a DOS block — C64 sprite data is
platform-native — so the oracle cannot adjudicate it and it is recorded rather than resolved.

Only Neverwinter Nights (AOL, 1991) is absent from the wider collection, and it is effectively
unobtainable — online-only, service shut down in 1997.

---

## 1. Why the C64 release matters: it is an unpacked `.DAX`

The DOS releases bundle assets into `.DAX` archives addressed by a numeric block id. The C64
release ships **the same assets as loose CBM DOS files**, and

> **the filename's two-character hex suffix is the DOS block id.**

`GEO30` is `GEO2.DAX` block 48. `ECL21` is `ECL1.DAX` block 33.

That makes a C64 disk an independent **oracle for DAX block identity**: it names what a block is
without any reverse engineering, from a source SSI produced rather than one we inferred. Measured
across **all seven** titles — every C64 set now has a DOS counterpart, Buck Rogers from a staged
DOS install since it has no GOG release:

| Title | C64 files | byte-identical | hex suffix = block id |
| --- | ---: | ---: | ---: |
| Secret of the Silver Blades | 574 | 36 | 36 |
| Curse of the Azure Bonds | 557 | 35 | 34 |
| Pool of Radiance | 984 | 34 | 34 |
| Champions of Krynn | 578 | 33 | 33 |
| Death Knights of Krynn | 502 | 28 | 28 |
| Gateway to the Savage Frontier | 825 | 17 | 17 |
| Buck Rogers — Countdown to Doomsday | 406 | 16 | 16 |
| **total** | **4426** | **199** | **198** |

Repairing CoAB moved it from 31 pairs to 35: four of the recovered files turned out to be
byte-identical to a DOS block, so the damaged dump had been costing the oracle real evidence, not
just readability.

**The single disagreement is explained, and is not the rule failing.** CoAB's `ECL1.DAX` holds only
blocks 80, 81 and 82; `ECL50`→80 and `ECL51`→81 both obey the rule, and block 82 would be `ECL52`,
which exists on no side. The odd file is `ECL1E` — area `0x1E` = 30 — whose script is byte-identical
to block 82's. That is the *same content used by two areas*, not a mis-numbered file.
`CorpusOracleTests` sweeps all seven titles, allows exactly this one pair by name, and fails on any
new disagreement; a second test pins the `ECL1E`→82 relationship itself so it cannot quietly change,
and a third asserts every closed file on every side still walks its chain to the end — the probe
that would have caught the CoAB damage, verified failing against the superseded side 4 (39 broken)
before being trusted green.

Most files are *not* byte-identical — graphics were redrawn for VIC-II, so only script and map data
survived the port unchanged, which is exactly the data the payload oracle is useful for. That does
**not** mean the art has no DOS counterpart: `PIC*` ids still line up exactly with DOS picture
blocks, they just share no bytes. §7 covers how block identity is recovered for graphics families
structurally, without payload matching.

## 2. Correction: the 2-byte prefix is rewritten by the port, not inherited

A C64 `PRG` opens with a little-endian load address. A DOS `.DAX` block also opens with a 2-byte
word, and the payloads match **from offset 2 onward** — so the obvious reading is that a DOS block
simply *is* the C64 file, load address and all.

**That reading is false**, and `c64_disk.py`'s own docstring asserted it until the test caught it.
Measured across Champions of Krynn's 31 matches (the `.g64` set, which is what §4's tests read):

| Side | Word | Notes |
| --- | --- | --- |
| C64 | `$4000` on **535 of 536** files | a fixed staging buffer; carries no per-file information |
| DOS `GEO*` | `$0400` | equals that block's own payload length (`len - 2 == 1024`) |
| DOS `ECL*` | `$1388` | constant across all 22 ECL blocks |

The word differs in **every single case**. The slot is shared; the value is not. Anything that
writes a block back must synthesise the DOS-side word rather than copying the C64 one, and any
cross-platform comparison must start at offset 2. Two tests pin this
(`test_the_two_byte_prefix_is_rewritten_by_the_port_not_inherited`,
`test_the_dos_geo_prefix_is_that_blocks_payload_length`).

**Where the DOS values come from — partly answered.** Champions of Krynn's C64 build is the odd
one out. Pool of Radiance's C64 build uses *real, per-family* load addresses rather than a uniform
buffer (measured on its boot side; the full 10-side set is now available to widen this):

| PoR C64 family | Load address |
| --- | --- |
| `GEOF` | `$0400` |
| `WALLDEF`, some `SECSET`/`SPELLE` | `$1388` |
| `MON*` | `$6400` |
| `ITEMFILE` | `$2710` |
| `PIC*`, `HEAD*` | `$5000` |
| `SPRITE` | `$D800` |

So `$1388` — the DOS ECL word, which is *not* a length and is constant across all 22 ECL blocks —
is a genuine C64 load address in the earlier game. The likeliest reading is that the DOS values are
a fossil of the **series** convention set by Pool of Radiance, and that CoK's later C64 build had
moved to a uniform `$4000` staging loader and so is not the source of either value. Stated as an
inference: `$0400` on DOS GEO is fully explained as the payload length on its own, so the GEOF
agreement may be coincidence, and nothing here is asserted by a test.

## 3. The reader

`tools/c64_disk.py` is pure-Python and dependency-free, in the style of `dax_inspect.py`:

```powershell
python tools/c64_disk.py "D:\...\Champions of Krynn (1990)(SSI)(Disk 2 of 3 Side A).g64"
python tools/c64_disk.py <image> --extract out\ --strict
```

- **`.d64`** — a plain sector dump. 35 (or 40) tracks, 256-byte sectors, sectors-per-track by
  speed zone `[21]*17 + [19]*7 + [18]*6 + [17]*5`. BAM at track 18 sector 0, directory chain from
  track 18 sector 1.
- **`.g64`** — a GCR bitstream image preserving the original, often copy-protected, flux. This is
  the form the SSI disks ship in. Decoded in-process rather than by shelling out to VICE.

Two bugs found while building it are worth not re-introducing; both are now mutation-tested.

1. **Directory slots must be addressed from the slot base.** Eight 32-byte slots sit at
   `0x00`/`0x20`/…/`0xE0`. Opening a 32-byte window at *slot+2* (where the type byte is) overruns
   the 256-byte block on the eighth slot, which silently drops **one entry per directory sector** —
   83 entries instead of 94, with no error anywhere.
2. **GCR must be decoded as a nibble stream, not in fixed 40-bit groups.** A data block is
   `id + 256 + checksum = 258` bytes, which is not a multiple of 4, so the encoding pads to 260.
   In a real flux image that 2-byte pad runs into the inter-sector gap and often does not decode.
   Group-at-a-time decoding then fails the *whole* final group, taking the last data byte and the
   checksum with it — and so discards every sector. One clean side dropped from 103 files to 8.

**Truncation is reported, not swallowed.** `read_file_checked` returns a problem string when a
chain hits a missing sector, loops, or disagrees with the directory's block count; the CLI marks
those files `!!`, writes them as `*.partial`, and `--strict` exits non-zero. This matters because
VICE's own `c1541` truncates the same files **without saying so**.

## 4. Verification

`tools/test_c64_disk.py` layers three levels of dependence on things outside the repo:

1. A **synthetic `.d64` built in memory** — always runs, needs nothing external, pins the CBM DOS
   rules (slot addressing, and the last-sector link whose sector byte is a byte *index* not a
   sector number).
2. Real `.g64` decoding, with VICE's **`c1541` as an independent oracle** — the same discipline
   `dax_decode.py` follows against `DaxDump.exe`. On a clean side the two agree **byte for byte**
   across all 102 files (compared as a multiset of SHA-256 digests, since `c1541` lowercases and
   mangles names).
3. The cross-platform claims of §1 and §2.

Results across the six Champions of Krynn sides:

| Image | Sectors | Entries | Errors |
| --- | ---: | ---: | --- |
| Disk 1 Side A (`CoK_A.g64`) | 623 / 704 | 80 | 35 decode errors, **33 files incomplete** |
| the other five sides | 704 / 704 | 95 / 102 / 101 / 107 / 84 | none |

`CoK_A.g64` is a damaged or protected dump of the boot side; neither our reader nor `c1541` can
read it fully. It is kept as a test fixture precisely because it must **not** read as clean —
`test_the_damaged_boot_side_reports_its_losses` fails if truncation ever goes quiet again.

All three of these were mutation-tested: reintroducing the slot-window bug, the fixed-group GCR
bug, or silent truncation each turns the relevant tests red.

## 5. Not yet done

- **EasyFlash `.crt` recovery** — investigated 2026-08-10, see §6. Real progress and a corrected
  diagnosis, but it does **not** deliver the missing Pool of Radiance sides without a further
  6502 reversing pass.
- **VIC-II decoding — partly done.** `tools/c64_pic.py` decodes the fixed-size full-screen picture
  (§7.4) and `CHARSET` is trivial (§7.3), but `WALLSET`, `SPRITE`, `COMPIC`, `CHARPIC` and the
  variable-size `PIC` family are all still unread, so `?graphics=c64` (graphics mode 3, reserved at
  `docs/engine/ARCHITECTURE.md:195`) does not yet have enough behind it to mount.
- **SID audio.** `docs/engine/research/audio-formats-krynn.md` §1.7 says "No C64 assets are in the
  repository… out of scope until C64 assets are supplied by the user." The first half is now
  false — assets exist and are readable. The scope judgement is untouched: no SID player is
  planned, and no C64 music has been located inside these files yet.

---

## 6. EasyFlash cartridges (2026-08-10)

**Six Gold Box titles ship as EasyFlash cartridge conversions**, in
`D:\Games\Emulator\C64\OneLoad64-Games-Collection-v5\Extras\OtherCRTs\`:

| Title | ROM | CHIP packets |
| --- | ---: | ---: |
| Champions of Krynn *(`[EayFlash]`, sic)* | 458752 | 56 |
| Death Knights of Krynn | 483328 | 59 |
| Curse of the Azure Bonds | 499712 | 61 |
| Secret of the Silverblades | 458752 | 56 |
| Buck Rogers — Countdown to Doomsday | 491520 | 60 |
| Pool of Radiance | 606208 | 74 |

All six are `hwtype=32` EasyFlash, 8 KB CHIP packets alternating `$8000`/`$A000`, with sparse bank
numbers.

> **Superseded the same day.** This section was written when four of those titles had no C64 disk
> image here, which made the cartridges the only route to them. The `.d64` sets in §0 then arrived
> and cover all six titles completely and cleanly. **The 6502 loader RE below is no longer on the
> critical path** — it would now only recover cartridge-specific variants of files we can already
> read. Keeping the findings because they are correct and the diagnosis they replace was not.

### What is established

- **Nothing is compressed.** Highest per-8 KB Shannon entropy across the CoK ROM is 7.41 bits/byte
  (mean 6.21), and 4.6% of the ROM is `$FF` filler. 395,496 bytes of distinct disk-file payload
  would fit in 458,752 bytes of ROM with room for the loader. Files are stored raw.
- **Records are laid out contiguously in CHIP order, separated by a 5-byte header.** Consecutive
  `WALLDEF02`…`WALLDEF06` payloads sit at gaps of exactly 5 bytes, and the header is
  `[xx] 00 40 00 [yy]` — carrying the `$4000` load address, but *not* a length.
- **CHIP order is the correct logical order.** 6 of the 31 verbatim CoK matches span an 8 KB chunk
  boundary and still match byte for byte.
- The cartridge contains a **filename-prefix dispatch table** at ROM offset ~945, grouped by name
  length — `ECL|GEO|MON|PIC`, `SPRITE|COMPIC|GDRIVE`, `WALLDEF|WALLSET`, `ITEMFILE` — with 6502
  name-resolution code above it. So the cartridge resolves files by name at runtime and a
  directory structure exists to be reversed.

> **Correction.** An earlier pass here concluded that files "span 8 KB bank boundaries, so naive
> CHIP-order concatenation doesn't reproduce the logical stream." That was wrong, and it was an
> artifact of testing only the *first* occurrence of each file's 32-byte head. Searching all
> occurrences and keeping the best match shows concatenation order is right and boundary-spanning
> files match cleanly.

### Why it is nonetheless blocked

**The cartridges were built from a different release than the disks we hold.**

| | verbatim in its own cartridge |
| --- | --- |
| Champions of Krynn, 295 distinct disk payloads | **31** |
| Pool of Radiance, 88 readable disk payloads | **4** |

The non-matching files are not absent — they share long *exact* prefixes and then diverge
(`ANIMATE00` 698/883, `CAMP` 1208/9384, `COMBAT2` 2053/8191, `CHARSET` 224/512), and the
continuation does not appear anywhere else in the ROM. So the cartridge holds a genuinely
different build of each file, not a rearrangement of ours.

That kills the shortcut. Carving a title we have no disk for cannot lean on payload matching,
because there is nothing to match against — it needs the record framing itself, and the 5-byte
header does not encode a length. The `00 40 00` signature also fails to generalise: it appears 359
times in CoK, 320 in DKK and 360 in Secret (plausible file counts), but only 113 in PoR and 68 in
CoAB, which use per-family load addresses rather than a uniform `$4000` (see §2).

### The route that remains, now optional

Reverse the cartridge loader's directory: disassemble the 6502 name-resolution routine sitting just
above the prefix table (CoK ROM ~offset 900–1000) and follow it to whatever maps a resolved name to
a bank and offset. That is a self-contained static RE task on ~1 KB of 6502 with a known entry
point and a known table. It is **not** started, and no longer needs to be: it would unlock the
cartridges' own build of each file, which is interesting only if the cartridge variants turn out to
differ in a way we care about. The disks give us all six titles already.

Not recommended as the next slice: the VIC-II decoder delivers user-visible value from the
Champions of Krynn disks we can already read completely, and does not depend on this.

---

## 7. C64 graphics: what the oracle proves, and where the decoder stands (2026-08-10)

Groundwork for the `?graphics=c64` mode reserved at `docs/engine/ARCHITECTURE.md:195`
(`GBBOOT /G 3`). Nothing here is wired into the engine yet.

### 7.1 The payload oracle is silent on art — by design, not by accident

Every one of the 199 byte-identical DOS/C64 pairs is a **GEO map or an ECL script**. Broken out by
family, across all seven titles, the count of C64 files byte-identical to a DOS block is:

| Family | C64 files | identical to DOS |
| --- | ---: | ---: |
| GEO | 142 | 123 |
| ECL | 185 | 76 |
| MON, PIC, COMPIC, SPRITE, WALL, WALLSET, BODY, HEAD, CHARPIC, ITEMFILE, … | 1 700+ | **0** |

So the shared material is exactly the machine-readable content — maps and scripts — and **all art
was redrawn for the VIC-II**. That closes the cheap path: there is no way to reuse the DAX pixel
decoders, and a C64 graphics mode needs a real VIC-II decoder. `test_only_maps_and_scripts_are_ever_byte_identical`
asserts this, so if some art family ever does match it will surface rather than be assumed away.

### 7.2 The naming rule survives the redraw, so ids can still be read structurally

Payload identity is not the only way to use the oracle. For pictures the DOS side splits one
logical family across two archives, and the C64 does not:

- DOS `PIC*.DAX` and `BIGPIC*.DAX` hold **disjoint** id sets — verified in all seven titles.
- The C64 has one flat `PIC` namespace that is **exactly their union**, with ids preserved (six of
  seven titles; Gateway ships a different, larger picture selection and is the sole exception).
- `PIC100` (`0x64`) exists in **every** title and corresponds to no DOS block — a C64-only picture.

That is block identity for a *graphics* family, established without a single matching byte.

### 7.3 One format solved: `CHARSET`

`CHARSET` (514 bytes = 2-byte load address + 64 glyphs × 8 rows) is a raw, uncompressed C64
character set — the Gold Box gothic font. It decodes with no reverse engineering at all; glyph 1
onward render as `A`, `B`, `C`, `D`, `E`, `F`, `G`, and glyph 0 is a border/fill pattern.

### 7.4 The fixed-size full-screen picture — SOLVED (2026-08-11)

Every C64 file whose id is a DOS `BIGPIC` block is **exactly 2681 bytes** (2682 in Gateway, Buck
Rogers and part of CoAB) — constant across six titles, so the format is uncompressed and shared
series-wide. `test_every_c64_bigpic_is_the_same_fixed_size` pins this. Ordinary `PIC` files vary
(717–2358 bytes) and are a different, presumably compressed, format that remains unsolved.

The layout, in body coordinates (file offset minus the 2-byte load word):

| Body range | Length | Contents | Destination |
| --- | ---: | --- | --- |
| 0..569 | 570 | screen map, 38 cols × 15 rows, row-major | `$CC00 + 40*row + col`, rows 1..15, cols 1..38 |
| 570..1139 | 570 | colour map, same geometry, low nibble is the colour | `$D800 + 40*row + col`, written unmasked |
| 1140..2675 | 1536 | 192 glyph bitmaps, char codes `$40`..`$FF` | `$D200` (= `$D000 + 0x40*8`) |
| 2676..2678 | 3 | `$D021`, `$D022`, `$D023` (background 0/1/2) | copied by a 3-iteration loop |
| 2679 | 0 or 1 | trailing byte, 2682-byte files only | not copied anywhere; role unproven |

`570 + 570 + 1536 + 3 = 2679` exactly. **Glyphs `$00`..`$3F` are not in the picture file** — they
come from the separate 514-byte `CHARSET` staged at `$D000`. That is the fact that makes the
arithmetic close, and it is why every earlier fit assuming a 2048-byte in-file character set
failed. 64 resident + 192 shipped = the 256 that §7.5's `$D018 = $34` demands.

Geometry is 38×8 by 15×8 = **304×120 px**, which the DOS side confirms independently:
`tools/dax_decode.py --list "Champions of Krynn/BIGPIC1.DAX"` reports every frame at 304×120. That
is a different platform's own header agreeing, not a number fitted to a byte count.

**Render rule.** Bit 3 of each cell's colour nibble selects multicolour vs hires — VIC-II
hardware, and the blit stores the byte with `STA ($B0),Y` and no masking, so the file's high
nibble is dirty and hardware-ignored. In multicolour, bit pairs are `00`→`$D021`, `01`→`$D022`,
`10`→`$D023`, `11`→ colour nibble `& 7`; in hires, set bits take the colour nibble and clear bits
`$D021`. About 12 % of cells across the corpus are hires.

**Decoder: `tools/c64_pic.py`**, tested by `tools/test_c64_pic.py`. It reads a picture straight
out of a `.d64`:

```powershell
python tools/c64_pic.py --disk "D:\...\Champions of Krynn - Side 1.d64" --all --outdir renders\c64
```

**Confirmed by rendering, not only by arithmetic.** Champions PIC70 is a vallenwood tree over a
house; Death Knights PIC71 is the skeletal dragon and rider under Krynn's two moons; Gateway PIC7C
is a framed scene. Each matches the subject of the same-id DOS `BIGPIC1` frame (`0x70` = 112,
`0x71` = 113). **All 37 payloads decode**; two of them (Buck Rogers PIC71/PIC72) need the
`glyph_dest_shift` variant covered below.

**Scope.** The blit code is byte-identical for CoK, DoK, CoAB and Secret. Buck Rogers has its own
`GDRIVE02` with a picture-id special case. Gateway's `GDRIVE02` is a different routine entirely
(2816 bytes, entry `$C000 → JMP $C02B`, hardcoding `$D022`/`$D023` rather than copying them) and
has **not** been read — but its three pictures decode correctly under this layout, so Gateway is
*data-confirmed, code-unread*. Pool of Radiance ships no picture of this size at all.

**Buck Rogers PIC71 and PIC72 — SOLVED (2026-08-11, same day).** Its `GDRIVE02` at `$C066` reads
the picture id at `$7F18` and, for `$71` or `$72` only, decrements the glyph-copy *destination*
pointer from `$D200` to `$D1FF` before the 1536-byte glyph copy. Naively applying that address as
"read the file's glyph bytes one byte earlier/later" is what had been tried (every whole-body
shift −4..+4, every glyph-offset shift −8..+8, a monochrome render) and it is what still rendered
noise — because that framing is wrong. The fix came from disassembling the `$C066` branch **to
completion** rather than trying more offsets: past the id compare and the pointer decrement,
control falls straight through (no early return) into the *same* generic 1536-byte memcpy every
other picture uses, with the *same* fixed source (`$7374`) and the *same* screen/colour copy
afterward — so destination is the only thing that differs, confirmed by reading every instruction
between the compare and the `RTS`, not by assumption.

The part the offset sweep missed: `$D1FF` is not free space one byte before the glyph table — it
is the *last byte of the resident CHARSET* (`$D000`+64 glyphs×8 bytes = `$D000+512` = `$D200`
normally; `$D1FF` is `$D000+511`, CHARSET's own final byte, row 7 of glyph `$3F`). A destination
one byte low means:
- the picture's glyph byte 0 (meant to be row 0 of code `$40`) **overwrites** CHARSET's row 7 of
  code `$3F`, splicing two different sources into one 8-byte glyph;
- every code `$40`..`$FE` ends up built from *file bytes shifted by +1 relative to its own glyph
  boundary* (rows 0–6 of code `C` come from the file's rows 1–7 of code `C`, and row 7 of code `C`
  comes from the file's row 0 of code `C+1` — a rolling one-scanline skew across glyph boundaries,
  not a whole-glyph or whole-block shift);
- the copy ends one byte short of the normal end, leaving the table's absolute last byte (row 7 of
  code `$FF`) **unwritten** (stale). Neither PIC71 nor PIC72 references code `$FF` in its screen
  map, so that undetermined byte is provably irrelevant to these two files' renders.

`tools/c64_pic.py` models this exactly: `glyph_table(resident, shipped, glyph_dest_shift)` builds
the 2048-byte table by placing `resident` at offset 0 and `shipped` at offset `512 +
glyph_dest_shift` (slice-assignment naturally reproduces the overwrite and the unwritten tail);
`Picture(prg, glyph_dest_shift=-1)` uses it. `buck_glyph_shift(title, name)` scopes the `-1` to
Buck Rogers' own `PIC71`/`PIC72` specifically (not to the id alone — Death Knights also ships a
`PIC71`, the skeletal dragon, which already decoded correctly at shift 0 and must not be touched).
**Rendering agrees, but is NOT the proof.** PIC71 is a road cutting through wooded terrain,
PIC72 a pond in a green landscape — coherent artwork, matching the standard this project holds
every other picture to. But an independent check found the *uncorrected* shift-0 decode of these
same two files also renders plausible macro imagery, because the colour map (not the shifted glyph
bits) drives the recognisable large shapes. So visual coherence does **not** discriminate the two
hypotheses here, and this paragraph must not be read as if it did. The decisive evidence is the
`$C066` disassembly and the address arithmetic it forces. Exact bytes pinned by
`RenderGoldenTests.GOLDENS` in `test_c64_pic.py`.

Hypotheses tested earlier and **ruled out**, with why they failed:

| Hypothesis | Verdict |
| --- | --- |
| Multicolour with a per-cell colour map | **Retracted — this was right.** The map is at body 570..1139. The test predicate was wrong: colour RAM is 4 bits, the blit does not mask, so 233–546 of the 570 bytes per picture are ≥ 16 and an "all bytes < 16" scan could never find it |
| Multicolour with a 4-bit packed colour map at 456–684 | Genuinely wrong: the map is one byte per cell, not packed, and starts at 570 |
| Charset-first layout (scored 0.83 on cell-border continuity) | Correctly rejected — the leading bytes are a screen map, and it rendered as texture |
| Screen 38×18 + 249-char set, screen 38×22 + 230-char set | Both assumed the whole character set ships in the file and that there is one 38-wide plane. There are **two** stacked 570-byte planes, and only 1536 of the 2048 charset bytes are in the file |
| A charset shared between pictures | Half right, and it measured the wrong half. The 192 picture glyphs really are per-picture; what is shared is the 64-glyph base font in the separate `CHARSET` file, invisible to a picture-vs-picture byte overlap test |
| Whole-body shifts (−4..+4) and glyph-offset shifts (−8..+8) for PIC71/PIC72 | Wrong framing, not wrong direction: these treated the destination decrement as "read the file's own glyph bytes from a different offset," which cannot reproduce the real effect — the shifted destination collides with the *resident CHARSET's* last byte (outside the picture file entirely) and leaves the table's last byte unwritten. SOLVED 2026-08-11 by disassembling the branch to completion instead of sweeping more offsets — see above |

Two earlier "established facts" also need correcting:

- *"The last three bytes are colour registers, always `00 XX YY` with both values < 16."* They are
  at body 2676..2678, not the last three — 2682-byte files carry one more byte after them. `$D021`
  is 0 in all 37, but "both values < 16" has a counterexample: Buck Rogers PIC71 is `00 02 15`.
  Harmless, since VIC uses the low nibble, but a naive assertion breaks on it.
- *"Sequentially assigned first occurrences."* Approximately, not exactly — `$1C`/`$20` interleave
  and files skip codes. Champions PIC79 uses only 143 glyphs with a maximum code of `$CE`.

### 7.5 The display mode, settled from the driver (2026-08-11)

`tools/c64_disasm.py` is a small documented-NMOS-6502 disassembler written for this — the project's
third instruction set after x86 (`tools/disasm_*.py`) and the Amiga 68000 pass. Undocumented
opcodes decode as `.byte` on purpose, so a wrong entry point produces visible noise rather than
plausible fiction.

**`GDRIVE01` is the graphics driver.** It is the only file in the Champions of Krynn C64 set that
writes all six relevant VIC registers. Its stored load address is `$4000` — the staging buffer
every file claims — but its real origin is `$C000`, recoverable from the code: a 25-entry table of
absolute `JMP`s whose targets all land inside a `$C000` image exactly `$A00` bytes long, the length
of the file.

Six instructions at `$C0A1` declare the mode:

```
C0A9  AD 00 DD   LDA CIA2_PORTA
C0AC  29 FC      AND #$FC        ; bank bits -> %00 -> VIC bank 3, $C000-$FFFF
C0AE  8D 00 DD   STA CIA2_PORTA
C0B1  A9 34      LDA #$34
C0B3  8D 18 D0   STA VIC_MEMPTR  ; $D018: screen = bank+$0C00, charset = bank+$1000
C0B8  0D 16 D0   ORA VIC_CTRL2
C0BB  8D 16 D0   STA VIC_CTRL2   ; $D016 |= $10 -> MULTICOLOUR
```

So, proven rather than inferred:

- **Multicolour character mode** — previously guessed from the trailing colour bytes.
- **Screen at `$CC00`, character set at `$D000`.**
- **The charset is 2 KB, i.e. exactly 256 glyphs.** A `$D018`-addressed charset has no other size.
  This **retroactively kills** the 249-glyph and 230-glyph fits in the table above: they were the
  only two layouts whose arithmetic closed, and the hardware says neither can be right.
- The colour registers are loaded from a consecutive driver parameter block — `$C057` border,
  `$C058` bg0, `$C059` bg1, `$C05A` bg2 — which is what a picture's three trailing bytes feed, and
  why they begin `00`. (The "both values below 16" half of that reading is wrong — see §7.4 — and
  the copy loop below takes only three of the block's four entries.)

Also located: the resource filename-template table at `ITEMNAMES` +2407, a packed list of all 20
asset families with `00` as the hex-id placeholder (`GDRIVE00`, `GEO00`, `SECSET00`, `PIC00`,
`SPELLN00`, `SPELLE00`, `ECL00`, `WALLS00`, `SPRITE00`, `WALLSET00`, `WALLDEF00`, `ANIMATE00`,
`MON00`, `BODY00`, `HEAD00`, `CHARPIC00`, `COMPIC00`, `ITEMFILE00`, …). Despite the filename,
`ITEMNAMES` is where the loader gets its names.

**The blit: `GDRIVE02`** — a third overlay sharing the `$C000` slot with `GDRIVE00`/`GDRIVE01`,
407 bytes in CoK/DoK/Secret and 470 in CoAB, entry `$C000 → JMP $C045`. It is *not* in `GDRIVE01`,
which is the low-level display and sprite driver only.

```
C045  A2 02      LDX #$02
C047  BD 74 79   LDA $7974,X      ; the picture's three register bytes
C04A  9D 21 D0   STA VIC_BG0,X    ; -> $D021/$D022/$D023
C04D  CA         DEX
C04E  10 F7      BPL $C047
```

The picture is staged at **`$6F00`**, and the four source pointers appear as literal immediates:
`$6F00` (screen), `$713A` (colour), `$7374` (glyphs), `$7974` (registers) — deltas 570 / 570 /
1536 / 3, summing to exactly the 2679-byte body. The row tables at `$C0DA`/`$C0F3` are `$CC00 +
40*row` and at `$C10C`/`$C125` are `$D800 + 40*row`; the loop bounds are `CMP #$27` (cols 1..38)
and `CMP #$10` (rows 1..15). The glyph copy to `$D200` is bracketed by `LIBRARY` stubs that clear
and restore bits of `$01` so the writes land in RAM under I/O.

Two consequences worth recording separately:

- **The register copy is exactly 3 bytes**, in all four Krynn-family drivers and in Buck's. So the
  2682nd byte of the larger files is **not** a fourth colour register (the driver parameter block
  at `$C057` has four entries, which had left that open). Its role is still unproven; the decoder
  ignores it.
- **The `$D018 = $34` deduction above was load-bearing and correct.** "The charset is 2 KB, i.e.
  256 glyphs" is what forced 64 resident + 192 shipped, and that is what made §7.4 close.

**Falsified leads, recorded so they are not retried.** `GEN`'s `PIC` literals at ~8371–8431 are
the UI strings `PICK GENDER` / `PICK RACE` / `PICK CLASS` / `PICK ALIGNMENT` / `PICK GOD`, not the
`PIC` resource family; `GEN` has no `$D200` constant, no row tables and no `$CC00`/`$D800` pointer
setup. `GDRIVE01` has neither row table and neither `A9 D2` nor `A9 3A`.

**Status: the picture codec is solved** — see §7.4. All 37 payloads across six titles render as
coherent artwork, with `tools/c64_pic.py` as the decoder (the last two, Buck Rogers PIC71/PIC72,
closed 2026-08-11 the same day, via `glyph_dest_shift`). What still blocks a `?graphics=c64` mode
is the *other* families — `WALLSET`, `SPRITE`, `COMPIC`, `CHARPIC` and the variable-size `PIC`
format.

### 7.6 The `CHARSET` companion is worth 40% of a Gateway picture and nothing at all of a Champions one (2026-08-24)

A `PIC*` PRG ships only the glyphs for codes `$40..$FF`. Codes `$00..$3F` are the 512 bytes that
were already resident at `$D000`, and they come from the title's separate 514-byte `CHARSET` PRG.
That much was known from §7.4. What was *not* known is how much of a picture actually depends on
them — and the answer is title-specific to a degree that no cell count predicts.

Measured by decoding each picture twice, once with the real `CHARSET` and once with an all-zero
one of the same length, then counting differing pixels of 36,480 (304x120). This is
`packages/engine/test/c64-picture.test.ts` tier 3, which asserts every number below exactly:

| picture | pixels owed to `CHARSET` | share | why |
| --- | --- | --- | --- |
| `cok/PIC70` | **0** | 0% | no low codes in the screen at all |
| `cok/PIC72` | **18** | 0.05% | two low codes: `$20` and a single cell of `$2F` |
| `dok/PIC71` | **0** | 0% | 165 low-code cells, **every one of them `$20`** |
| `gateway/PIC7C` | **14,848** | 40.7% | glyph `$1C`, 232 cells |
| `gateway/PIC7D` | **14,848** | 40.7% | identical layout |
| `gateway/PIC7E` | **14,848** | 40.7% | identical layout |

The dominant fact is that **`$20` is the blank glyph in both charsets**, so a screen full of low
codes can still owe the companion nothing. Death Knights' `PIC71` is the clean demonstration: 165
low-code cells, footprint zero. Cell count is not the predictor; *non-blank* glyph code is.

Gateway's three pictures share one footprint exactly — `232 * 64 == 14848` — and it is a single
glyph code, `$1C`, in 232 byte-identical cell positions spanning all 15 rows and all 38 columns.
That is a frame or border drawn from a resident glyph, reused verbatim across the title's art.

**Why this was worth measuring rather than asserting.** The first version of the check shipped
with invented per-title ratios and a plausible premise — "without the companion every low-code
cell draws as garbage." Two of the three titles falsify it. The premise survives only as an
engineering rule, not a rendering fact: the viewer must still fail loudly on a missing companion,
because the case where it *does* matter loses 40% of the image while producing one perfectly
plausible-looking frame.

### 7.7 Reaching the screen (2026-08-24)

Until this date the web app contained no reference to C64 at all, despite `c64Picture.ts` being
golden-tested since the C64 arc and 49 disk sides being held. Six pictures are now in the asset
browser's `c64-pictures` group (CoK `PIC70`/`PIC72`/`PIC79`, DoK `PIC71`, Gateway `PIC7C`/`PIC7E`),
staged into the git-ignored `c64_extracted/` by `tools/c64_disk.py --extract` rather than by
teaching the browser the `.d64` reader, which stays out of `src/` deliberately. Extracted files
are renamed to `.PRG`: Vite returns HTTP 500 for extensionless paths.

Three e2e cases cover them. A fourth hazard was caught only by building for production: the
bundler scrapes `catalog.ts` with a case-sensitive `/path:/` regex, which does not match
`companionPath:`, so the three `CHARSET` files were absent from `dist-app` while their pictures
were copied in. Every gate was green -- the dev server serves the repo directly, so nothing but a
real build could see it. Guarded now by `BundledCatalogCompanions` in
`tools/test_goldbox_corpus.py`, which applies the bundler's own extracted regex to the catalog.
