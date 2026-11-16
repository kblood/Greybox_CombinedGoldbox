# C64 COMPIC / CHARPIC / variable-size PIC: what got cracked, and what did not

Status: **partially cracked — `COMPIC` is now DECODED (§6, 2026-08-14); `CHARPIC` and the
variable-size `PIC*` files are not.** Companion to `docs/engine/research/c64-disk-format.md` section 7,
which solved the fixed-size 2681/2682-byte full-screen picture (`BIGPIC`-equivalent). This
document covers the three families that section left explicitly unsolved: `COMPIC` (combat
monster picture), `CHARPIC` (the character-record screen's portrait frame), and the `PIC*` files
that are NOT one of the solved 2681/2682-byte sizes.

Date: 2026-08-11, revised same day with a second pass (section 3a). Tools: `tools/c64_compic.py`
(inventory, the two established cross-checks, and -- as of the second pass -- a small call-graph
disassembly helper), `tools/test_c64_compic.py`.

**Scope note (2026-08-14):** when this document was written no pixel decoder existed for any of
the three families. That is now true only of **`CHARPIC` and the variable-size `PIC*` files** --
for those two, nothing here renders an image and nothing here should be read as claiming to.
**`COMPIC` is decoded**: see §5 (the measured `72 | 72 | 18` body partition) and §6 (the two 3x3
multicolour animation frames), with the working decoder `decode_compic()` at
`tools/c64_compic.py` line 231. Sections 1-4 below predate that and are left as the record of
how the family was narrowed.

All work was static: `tools/c64_disk.py` to read files off real `.d64` images, `tools/c64_disasm.py`
to read 6502 code. No emulator (VICE or otherwise) was run.

## 1. What is established

### 1.1 COMPIC's exact size formula -- SOLVED

Every `COMPIC*` file across all seven titles (379 files total) fits one formula exactly, with
**zero** exceptions:

> body length (file length minus the 2-byte CBM load word) is `162*n` or `162*n + 1`, for
> `n in {1, 2, 4}`.

That is bodies of 162/163 (class 1x), 324/325 (class 2x) or 648/649 bytes (class 4x). There is no
length field, no header of any kind -- classification is pure arithmetic on the file's own byte
count, the same style of accounting that cracked the BIGPIC layout (`570+570+1536+3 = 2679`
exactly). Measured per title:

| Title | COMPIC files | fit the formula |
| --- | ---: | ---: |
| Champions of Krynn | 45 | 45 |
| Death Knights of Krynn | 51 | 51 |
| Curse of the Azure Bonds | 64 | 64 |
| Secret of the Silver Blades | 53 | 53 |
| Pool of Radiance | 61 | 61 |
| Gateway to the Savage Frontier | 62 | 62 |
| Buck Rogers -- Countdown to Doomsday | 43 | 43 |
| **total** | **379** | **379** |

`compic_size_class()`, `test_every_compic_file_fits_the_proportional_formula` (mutation-checked:
narrowing the class set to `(1, 2)` makes real 650/651-byte files fail to classify in four of the
seven titles -- confirmed red, see §3).

The `+1` echoes BIGPIC's own unexplained trailing byte (2681 vs 2682) -- its role is unproven
there too, and is left unproven here.

### 1.2 A monster's own MON record predicts its COMPIC's size class -- a strong, code-free
cross-check

MON (monster stat) records are a fixed 480-byte body in five of the seven titles: Champions of
Krynn, Death Knights of Krynn, Curse of the Azure Bonds, Secret of the Silver Blades, and Gateway
to the Savage Frontier. (Buck Rogers uses 204- or 546-byte bodies -- an entirely different record
layout, not a variant of this one. Two Pool of Radiance monsters also use 546 bytes; the other 114
use 480.)

Within that 480-byte body, **byte 153** (absolute file offset 155), masked with `& 0x7F`, holds one
of four values -- 1, 2, 3 or 4 -- and

> `code -> predicted class`: `1 -> 1x`, `2 -> 2x`, `3 -> 2x`, `4 -> 4x`

predicts the SAME monster's own COMPIC size class (matched by hex id, e.g. `MON0B` <-> `COMPIC0B`)
correctly for **269 of 272** monster/COMPIC pairs across those five titles (98.9%):

| Title | pairs | matched | mismatched ids |
| --- | ---: | ---: | --- |
| Champions of Krynn | 42 | 42 | -- |
| Death Knights of Krynn | 51 | 50 | `43` |
| Curse of the Azure Bonds | 64 | 63 | `27` |
| Secret of the Silver Blades | 53 | 53 | -- |
| Gateway to the Savage Frontier | 62 | 61 | `07` |
| **total** | **272** | **269** | 3, one per title |

Each of the three mismatches is a single monster, not a systemic failure, and each title with any
mismatch has exactly one -- the same shape as the project's other single-exception findings (the
CoAB `ECL1E`/block-82 pair in `docs/engine/research/c64-disk-format.md` section 1). None of the
three was traced further (that would need per-monster identification this project does not have
for the C64 corpus); they are reported, not explained away.

**Pool of Radiance is explicitly excluded from this claim.** Its own byte 153 predicts only 47 of
56 pairs (83.9%) -- well below the other five titles' 98-100%, not a rounding difference. Pool of
Radiance is the earliest game in the series (1988, versus 1990-91 for the others); the simplest
reading is that its otherwise-identical 480-byte MON record layout shifted this particular field,
not that the "size code" concept is absent. This was NOT chased further (would need Pool of
Radiance's own MON-consuming code disassembled, a separate task). `test_pool_of_radiance_...`
pins the exclusion as a measured fact (accuracy stays between 50% and 95%) rather than silently
dropping the title from the corpus.

**Important limitation, stated plainly:** this is a real, reproducible, cross-checked structural
fact about the data -- it was never fit by looking at COMPIC's own bytes, only cross-referenced by
id against an independently-loaded file family. But it is NOT the same thing as finding the 6502
code that reads this field to decide how many cells to blit. Section 2 records what code search
was actually done, and why it did not close that gap.

### 1.3 CHARPIC: a single shared frame, constant size -- partially established

Every title ships exactly one `CHARPIC` file, always named `CHARPIC00` -- never per-character,
unlike `COMPIC`/`MON`/`ECL` which are all per-id. Its size is constant across six of seven titles:

| Title | CHARPIC00 size |
| --- | ---: |
| Champions of Krynn | 2032 |
| Death Knights of Krynn | 2032 |
| Curse of the Azure Bonds | 2032 |
| Secret of the Silver Blades | 2032 |
| Pool of Radiance | 2032 |
| Gateway to the Savage Frontier | 2032 |
| Buck Rogers -- Countdown to Doomsday | 5834 |

`test_charpic_is_always_a_single_id_00_file`, `test_charpic_size_is_constant_except_buck_rogers`.

The internal layout is **UNLOCATED**. 2030 body bytes (2032 minus the 2-byte load word) does not
close cleanly against any of the accounting patterns that worked elsewhere: it is not `8*n` for a
plausible glyph count (2030/8 = 253.75), and no combination of a BIGPIC-style
screen+colour+glyph+register split was found that lands on 2030 without an unmotivated header.
Since CHARPIC is a single shared UI frame rather than per-monster art, its likely role is a
decorative border/template for the character-record screen (consistent with the family's
placeholder-id "00" convention also seen in `ITEMNAMES`'s resource-name table), not a portrait
per character -- but this is inference from naming, not proof.

### 1.4 Variable-size `PIC*` -- still unlocated, one unconfirmed lead recorded

`PIC*` files that are not 2681/2682 bytes (the solved BIGPIC-equivalent size) range from 515 to
2540 bytes across the corpus with no obvious size formula -- unlike COMPIC they do not cluster
into a small number of exact classes. `docs/engine/research/c64-disk-format.md` already flagged
this family as "presumably compressed"; nothing here proves or disproves that.

One observation, recorded as a lead only, since it was never traced to consuming code: several
small PIC files open with a short ascending run of bytes at ASCII `'A'`/`'B'`/`'C'`/`'D'`
(`0x41`-`0x44`) before falling to zero padding:

```
PIC12  41 00 00 00 ...
PIC17  41 42 43 42 41 00 00 ...
PIC3B  41 42 43 44 00 00 ...
PIC64  A0 A0 A0 A0 A0 A0 ...   (uniform $A0 = PETSCII space -- looks like a blank screen map)
```

That pattern is suggestive of frame/layer tags (a portrait with a handful of labelled sub-images,
maybe expression variants), but this is explicitly NOT a finding -- it was never confirmed against
any consuming code, and could just as easily be coincidental structure in a compressed stream. Left
here so the next pass does not have to rediscover it.

#### 1.4a The shape IS now known: 88x88, from the DOS oracle (2026-08-14)

Still unlocated as a pixel format, but no longer shapeless. Applying the §6.3 technique — the C64
filename hex suffix is the DOS block id — to this family:

- The DOS counterpart is `PIC*.DAX`, whose blocks are **animation arrays**, not single frames
  (`tools/subframe_decode.py::parse_anim_array`, `is_pic=True`). `dax_decode.parse_standard_frame`
  returns None for every one of them, which is why a first pass reported zero pairs; that was the
  wrong parser, not missing data.
- **288 of 320** variable-size C64 `PIC` files pair to such a block, and **every single paired
  block is 88x88** — a constant, across all six titles with a decodable DOS install. Frame counts
  vary; the frame *size* never does. (**Corrected 2026-08-14:** the frame counts were first
  written here as "1, 2, 4, 8". Every value from **1 to 8** occurs — the pooled census is
  `{1:174, 2:21, 3:22, 4:36, 5:8, 6:8, 7:5, 8:14}`. The original list was a partial read, and the
  missing odd counts matter, because §1.4b below turns the frame count into a predictor.)

So the target is fixed: whatever the encoding is, it must yield an **88x88 multicolour picture =
11x11 character cells**. Useful constants for the next attempt: 968 (11x11x8 glyph bytes), 121
(one byte per cell), 1089 (968+121), 1210 (968+121+121).

**Two hypotheses tested and refuted, each against its own null:**

1. **NOT `242 + 8*G`** (121-byte screen map + 121-byte colour map + a variable number of 8-byte
   glyph definitions). This was the natural reading, since it explains variable length by a
   varying distinct-glyph count, and it is how the *solved* fixed-size `PIC` is built. Only
   43/368 bodies fit — and the null says that is exactly chance: body length mod 8 is near-uniform
   (`{0:61, 1:49, 2:43, 3:34, 4:47, 5:38, 6:39, 7:57}`, expected 46 each), and sweeping the header
   offset across 230..260 gives 34..61 fits with 242 sitting mid-pack. No offset is special.
2. **NOT the SSI signed-byte RLE.** Tried in both polarities by hand, then with the repo's own
   authoritative `dax_decode.rle_decode` over all 320 bodies. A compression hypothesis predicts
   decoded sizes **converging on a constant**; instead they scatter, the modal size occurring 6
   times in 320 files, and none of 968/1089/1210/1936/2178/2420 is hit more than twice. The null
   settles it: decoding the same bodies **after dropping the first byte** — a deliberate
   misalignment that cannot be right — yields an equally concentrated distribution (255 distinct
   sizes vs the real 263, identical modal count of 6). The decoder has no purchase on this data
   at all.
3. **NOT 9 bytes per cell** (8 glyph bytes + 1 colour byte), which is the convention COMPIC was
   just proven to use, so it was the strongest remaining prior. Only 34 of 368 bodies divide by 9
   — *below* the 40.9 expected by chance — and the mod-9 residues are near-uniform (28..54).
   Sweeping `k = 2..19` shows no divisor that stands out beyond the mild power-of-two tendency
   any byte-aligned format has.

**Read together, these three point away from "a simple uncompressed layout we have not guessed
yet".** Two independent uncompressed-layout families (glyph-table, 9-per-cell) fit at chance, and
the one compression codec this corpus is known to use has no purchase. The next attempt should
probably go after the **consumer** — the C64 routine that loads a `PIC` id — rather than trying a
fourth layout, which is the opposite of the advice §6.3 gives for COMPIC, and deliberately so:
COMPIC had an exact size formula to reason from and this family has none. (**§1.4b now adds a
second option** that did not exist when this was written: the family finally has a positive
predictor, and it points at a specific *section* of the file rather than a whole-file layout.)

**Unpaired remainder: 32 files**, 17 of them in Gateway to the Savage Frontier (which has 72 DOS
`PIC` blocks against 55 pairings). These are C64 ids with no same-id DOS `PIC` block and are not
covered by the 88x88 claim.

#### 1.4b The first positive predictor: the C64 file carries the SECOND pose, and only the second (2026-08-14)

§1.4a bounded the shape and closed three layout readings, all negatives. This is the family's
first **positive** result, and it comes from a quantity §1.4a had already decoded but not used:
the DOS block's own **frame count**.

**The finding, in one line: a C64 `PIC` file whose DOS sibling animates is about 490 bytes
larger, and it does not get larger again for a third, fourth or eighth DOS frame.**

| comparison | n | mean gap (bytes) | largest of 4000-5000 label permutations | verdict |
| --- | ---: | ---: | ---: | --- |
| 1 frame vs 2+ frames | 174 / 114 | **+490.7** | 195.1 | above the null's maximum |
| 1 frame vs exactly 2 | 174 / 21 | **+405.6** | 219.1 | above the null's maximum |
| exactly 2 vs 3-or-more | 21 / 93 | +104.3 | 298.0 (p99 208.0) | **not above the null** |
| 1 frame vs 3-or-more | 174 / 93 | **+510.0** | 172.1 | above the null's maximum |

The null permutes the animated/still labels while holding every length fixed, so it destroys
exactly the claimed association and nothing else — the same discipline §6.3 used, and the reason
"the animated ones are bigger" is a measurement here rather than an impression.

**Per-title replication** (each against its own 3000-permutation null):

| title | 1-frame n | animated n | gap | null max | verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| Champions of Krynn | 35 | 13 | +699.5 | 484.1 | above |
| Death Knights of Krynn | 28 | 14 | +731.0 | 465.5 | above |
| Curse of the Azure Bonds | 23 | 21 | +558.1 | 388.1 | above |
| Secret of the Silver Blades | 21 | 17 | +807.7 | 552.0 | above |
| **Pool of Radiance** | 12 | 49 | **+190.2** | 347.5 | **not above its null** |
| Gateway to the Savage Frontier | 55 | 0 | — | — | uninformative: no animated block at all |

Four of four titles that can show the effect show it; Gateway cannot (every one of its paired
blocks is single-frame, so it is a genuine no-op, not a disagreement). **Pool of Radiance is a
real exception and is reported as one**, not explained away — it is also the title that is already
the documented exception for `WALLDEF`'s `0xF0` sentinel, for the body terminator byte, and for
MON byte 153, so "Pool of Radiance behaves differently" is a pattern this corpus keeps producing
rather than a result specific to this measurement.

**The rival explanation was tested, not dismissed.** Animated monsters might simply be busier
pictures, which would enlarge the C64 file under *any* size-following encoding with no extra
section involved. Two complexity proxies were read off the same DOS frame-0 pixels the frame count
came from — ink fraction, and the fraction of adjacent bytes that differ. Neither predicts C64
length at all (r = 0.008 and r = 0.087), and stratifying into five bins of either proxy leaves the
gap intact in **every bin of both**, at a weighted 521 and 526 bytes versus the raw 490.7. The gap
does not shrink when the two groups are matched on how elaborate the art is; it slightly grows.

> ⚠️ **This paragraph was wrong about what it had done — see §1.4g.1 (2026-08-15).** A control
> that predicts the outcome at r=0.008 cannot adjust for it, so "stratifying leaves the gap
> intact" was arithmetic rather than a test. Re-run against a proxy that predicts C64 length at
> **r=+0.727** (distinct 8-byte cell patterns in the DOS picture repacked to C64 cell order), the
> gap survives in all four quartiles at a within-bin mean of **+584.3** vs +580.7 unstratified,
> against a permutation maximum of +156.5. **The conclusion is unchanged and now actually
> supported.**

**What this does and does not license.**

- It **does** establish that the C64 file's size responds to something the DOS side calls a second
  animation frame, and that the response saturates at two.
- ⚠️ **This bullet originally read "the natural reading is that the C64 port applies the same
  two-pose cap here", by analogy with COMPIC's proven frame A / frame B. §1.4c REFUTED that the
  same day** — the file's own header lists up to **six** distinct frames. The saturation is real;
  the two-pose explanation for it is wrong. See §1.4c for what replaced it.
- It **does not** establish a fixed-size section. The two length distributions overlap almost
  completely (101 of 114 animated files fall inside the 1-frame range) and the standard deviation
  nearly doubles, 201.7 → 369.5. A constant addend would shift the distribution without spreading
  it. Whatever the second pose costs, it costs a *variable* number of bytes — which is itself
  consistent with the family being compressed, and inconsistent with the flat layouts §1.4a
  refuted.
- The per-frame slope across the animated subset is **13 bytes/frame** against the ~1210 an 88x88
  multicolour frame would cost uncompressed, and the correlation within that subset is r = 0.066
  against its own null p95 of 0.155 — i.e. indistinguishable from zero. **Anyone reading the
  positive result as "the C64 file stores all the DOS frames" would be looking for eight frames
  that are not there.** That negative is pinned by its own test.

**Where this points the next round.** §1.4a's advice was to hunt the consumer because the family
had no exact formula to reason from. That advice stands, but there is now a cheaper experiment
available first: the file is expected to contain **two poses**, so the second pose's bytes are
somewhere inside it, and the 1-frame files are a **matched control group that should not contain
them at all**. Comparing the two populations directly — for a length-prefixed tail, a second
pointer in a header, a repeated glyph bank — is a far narrower search than guessing a whole-file
layout, and it has a built-in null in the still-picture files.

**Superseded in part by §1.4c**, which found the structure this section could only infer, and
corrected one of its readings. The measurements above all stand; read them together with §1.4c.

Pinned by `test_an_animated_dos_sibling_predicts_a_larger_c64_variable_pic_file`,
`test_the_c64_pic_length_does_not_grow_past_the_second_dos_pose` and
`test_the_animated_pic_gap_is_not_explained_by_more_elaborate_art` in
`tools/test_c64_compic.py`. All three were checked under mutation and observed failing: shuffling
the frame-count labels reddens the first two; making length linear in the frame count reddens the
saturation test specifically (and correctly leaves the positive one green); and the confound test,
which builds its own rows rather than sharing the helper, was reddened separately by randomising
and by flattening the frame counts at their source.

#### 1.4c The header is real and readable: 32 bytes, holding an animation SEQUENCE (2026-08-14)

§1.4b said the file must carry a second pose somewhere and named the obvious next experiment —
diff the animated files against the still ones, which are a matched control that should not
contain one. That experiment was run. It found the header.

**Every conforming variable-`PIC` body opens with a 32-byte header: a NUL-terminated string of
frame ids, zero-padded to 32, with the picture data starting at offset 32 exactly.**
**352 of 368 files**, all seven titles, and the pixel data never starts anywhere else.

The ids are exactly `0x41`-`0x49`, i.e. **`A` to `I`**, no other value ever appears. And the string
is not a *list* of frames, it is a **playback sequence** — it repeats:

| sequence | files | | sequence | files |
| --- | ---: | --- | --- | ---: |
| `A` | 205 | | `ABCD` | 8 |
| `ABC` | 32 | | `C` | 6 |
| `ABCB` | 23 | | `CBA` | 5 |
| `AB` | 14 | | `ABCDEF` | 4 |

`ABCB` and `CBA` are the giveaway: a frame id occurs twice in `ABCB`, so this cannot be a
frame table. It is the order the frames play in — `ABCB` is a ping-pong loop. Sequence length
runs 1-7 while the number of **distinct** ids, `K`, runs 1-6.

**This makes the frame count a C64-side fact.** §1.4b had to borrow it from the DOS oracle; `K` is
now readable from the file itself, so it covers all 352 conforming files rather than the 288 that
pair. It is also the better predictor: `r(length, K) = 0.762` against `r(length, DOS frames) =
0.547`, null p99 0.142.

**How `K` relates to the DOS frame count**, over the 288 files that are both paired and
conforming: `K == nf` in **194**, `K < nf` in 68, `K > nf` in 26. The still case is nearly clean in
both directions — of 174 files whose DOS block is single-frame, 160 have `K = 1`; of 168 with
`K = 1`, 160 have a single-frame DOS block.

**The correction this forces on §1.4b.** §1.4b measured a real saturation — length jumps once when
a second frame appears and then stops growing — and explained it by analogy with COMPIC's proven
two-pose cap. **That explanation is refuted by this header: `K` reaches 6.** Re-measured against
`K` instead of the DOS count, the saturation is if anything sharper (`K=1`→`K=2` gap **+567.2**,
null max 218.5; `K=2`→`K≥3` gap **+10.1**, null max 273.2), so the effect is not an artifact of
using the wrong frame count — only the interpretation was wrong.

The leading replacement hypothesis, **not yet tested**: DOS `PIC` frames after frame 0 are
**XOR deltas against frame 0** — that is literally what `subframe_decode.parse_anim_array`'s
`is_pic=True` branch un-deltas. A delta against a near-identical pose is mostly zeros, so if the
C64 stores frames the same way under any compression, the first extra frame costs a section's
worth of overhead and each further frame costs almost nothing. That predicts the observed shape
without any cap. Recorded as the next thing to test, not as a finding.

**Also re-tested, and the earlier negative survives.** §1.4a refuted the SSI RLE by decoding from
offset 0 — which is now known to include a 32-byte header, so that test was misaligned by 32
bytes and the refutation deserved re-running. Decoding from offset 32 gives **239 distinct sizes**
against **247 and 247** for the deliberate ±1 misalignment controls, and hits none of 968 / 1089 /
1210 / 121 / 242 / 363 / 484 / 1936 / 2178 / 2420 even once. The corrected alignment does not
rescue it; the codec is still not the SSI RLE.

**The 16 non-conforming files, every one accounted for** — this is not a residue of "mostly works":

- **`PIC64`, in all seven titles** (736 bytes, byte-identical): already documented as the shared
  **1541 directory-scan loader**, i.e. 6502 code misfiled into the `PIC` name space by the family
  regex. Not a picture, and its `a0 a0 a0 …` opening is not a sequence.
- **Buck Rogers `PIC6D`, `PIC7A`-`PIC7E`** (6 files, 1536/1776 bytes): open with 484- and 528-byte
  runs of PETSCII-looking bytes (`0x20` spaces, `0xC1`-`0xDB` letters). These read as **text
  screens**, not bitmaps — a different thing sharing the family name.
- **`PIC3A` (Pool of Radiance) and `PIC4F` (Buck Rogers)**: open with `0x00`, so the sequence is
  empty. Two files, unexplained, and left that way rather than folded into the rule.
- **Buck Rogers `PIC41`**: a 22-byte run of repeated `41`s before `42 43`. Unexplained.

**What this does not do.** It does not decode a pixel. The 32 bytes are a header and the ~950+
bytes after them remain unread; §1.4a's three refuted layouts were all tested against the *whole*
body, but re-testing them from offset 32 (mod 8, mod 9, mod 121, mod 242, within each `K` group
separately, so a differing per-group overhead could not smear them) leaves every one at chance.
The next attempt should use `K`: a `K = 1` file has exactly one picture in it and no animation
machinery at all, which makes the 211 single-frame files the cleanest possible target — the same
"attack the simplest member first" that cracked the fixed-size `PIC`.

Pinned by `test_the_variable_pic_header_is_32_bytes_holding_an_animation_sequence`,
`test_the_variable_pic_frame_ids_are_a_sequence_not_a_table` and
`test_the_c64_frame_count_beats_the_dos_frame_count_as_a_length_predictor`.

#### 1.4d The header's second half: the file declares its own geometry (2026-08-14)

§1.4c stopped at "picture data starts at offset 32". It does not — offset 32 begins a **24-byte
fixed sub-header**, and the payload starts at **56**. The sub-header is the useful part, because
it contains the picture's dimensions **stated by the C64 file itself**.

| offset | width | value | reading |
| --- | --- | --- | --- |
| 32-43 | 12 B | 94% `0x01`, else 0-20 | per-frame timing (evidenced, not proven — see below) |
| 44 | 1 B | varies (`00` ×187, `01` ×34, `0a` ×17) | unidentified |
| **45** | 1 B | **`0x0b` = 11, all 352 files** | **picture width in character cells** |
| **46** | 1 B | **`0x0b` = 11, all 352 files** | **picture height in character cells** |
| **47-48** | u16 LE | **968, all 352 files** | **glyph-bitmap byte count = 11 x 11 x 8** |
| **49-50** | u16 LE | **121, all 352 files** | **cell count = 11 x 11** |
| 51 | 1 B | varies (`01` ×180, `00` ×76, `02` ×40) | unidentified |
| 52-53 | u16 LE | low byte always `$F0`; `$F1F0`-`$FBF0` | an address; destination not identified |
| 54-55 | u16 LE | **high byte always `$D8`**; `$D8F9`-`$D8FF` | **an address in C64 colour RAM** (`$D800`-`$DBFF`) |
| 56+ | — | — | payload |

**Why the geometry fields are worth more than their size.** §1.4a's "every paired block is 88x88"
was an *oracle* claim: it needed a DOS install, so it covered 288 files and said nothing about the
other 80. Three mutually consistent fields — `11`, `11`, `11x11x8`, `11x11` — now assert the same
shape **from the C64 side alone, in all 352 conforming files, in all seven titles**. That includes
Buck Rogers, which has no DOS `CPIC` archive at all, and the 32 files with no same-id DOS block.
The 88x88 target is no longer conditional on the pairing being right.

**The control that makes these offsets meaningful.** Reading four fields at fixed offsets and
finding constants proves little unless a comparable file *without* this format shows something
else there. The 37 **solved** fixed-size `PIC` bodies are exactly that control, and at the same
offsets they carry scattered junk — `off45 ∈ {28, 68, …}`, `off46 ∈ {32, 28, …}`, `u16@47 ∈
{16412, 8224, …}`, `u16@49 ∈ {8224, 16961, …}` — no constant, and nothing resembling a geometry.
The sub-header is a property of this format, not of the offset choice.

**The 12 leading bytes look like frame timing.** 3962 of 4224 are `0x01`; the rest are small
(2-20, plus fifteen `0x00`). Their presence tracks animation sharply: **179 of 211** single-frame
(`K=1`) files are all-`01`, against only **37 of 141** animated ones — i.e. 15% of still pictures
carry a non-`01` entry versus 74% of animated ones. Twelve one-byte slots against a sequence of at
most 7 steps is consistent with a per-frame delay table, and the association is not subtle. It is
**not proven**: `PIC1C` has sequence `AB` (2 steps) but four non-`01` slots, so a strict
one-slot-per-step reading is already contradicted. Recorded as the leading reading with its own
counter-example attached.

**The payload is still not decoded, and the codec is still not the SSI RLE.** Decoding from
offset 56 was tried in **both** polarities (literal-run-if-`<0x80`, the SSI convention, and its
inverse) and at four candidate start offsets. The target is known exactly — 968 + 121 + 121 = 1210
bytes — and the best any combination managed was **6 of 211** `K=1` files landing within ±20 of
it, which is chance. Whatever compresses the payload, it is not the codec the rest of this corpus
uses. That negative is now much sharper than §1.4a's version, because the expected output size is
no longer a guess.

**Next.** The sub-header gives a blit routine's shape: copy 968 bytes of glyph bitmap, 121 screen
codes and 121 colour bytes, the last to a `$D8xx` address. That is a far more specific signature
to hunt in the overlays than "a COMPIC blit" ever was — a routine storing to `$D8xx` in a loop
bounded by 121, adjacent to one bounded by 968. And it is checkable against the constants the
earlier code searches (§5.6-§5.7) already extracted corpus-wide, rather than needing a fresh sweep.

Pinned by `test_the_variable_pic_subheader_declares_its_own_geometry`,
`test_the_solved_fixed_size_pic_has_no_such_subheader` and
`test_the_variable_pic_payload_is_not_the_ssi_rle_in_either_polarity`.

#### 1.4e First decoded section: the file ends in C64 colour RAM (2026-08-14)

The sub-header's `$D8xx` pointer said the format writes colour RAM. It does, and the section is
readable. **The codec is literal-with-run-marker, and that is precisely why every SSI-RLE attempt
in §1.4a-§1.4d failed: SSI stores a COUNT first, this stores a VALUE first.**

```
byte c < 0xF0  ->  emit c literally
byte c >= 0xF0 ->  emit the FOLLOWING byte (256 - c) times      (runs of 2..16)
```

`0xFF` therefore doubles as the escape that lets a literal `>= 0xF0` be stored at all — without
it the codec could not represent high bytes, which is a self-consistency check worth noting.

**What is established.** **109 of 211** single-frame files end in a region that decodes under this
codec into values `0..15` and nothing else. The nulls are what carry it:

| test | result |
| --- | ---: |
| real files, values `0..15` | **109 / 211** |
| byte-shuffled payloads (same length, same histogram) | **0 / 211** |
| identical search, band `16..31` / `32..47` / `64..79` / `128..143` | **0 / 211** each |
| identical search, band `0..7` | **0 / 211** |
| identical search, band `0..31` and `0..63` | 109 / 211 — *no gain* |

The boundary sits at exactly 16, from both directions. That is the C64 colour-RAM range and
nothing else, so the shuffle null (which only asks "is this RLE-compressible?") is not the null
doing the work here — the band sweep is. Anchoring matters too: the same decode applied at the
*head* of the payload succeeds for **0** files, so "trailing" is a measured property.

**What is NOT established, and how it was caught.** A mutation changing the section length from
121 to 120 **survived the test**, so the length was measured directly:

```
N=100 -> 121/211    N=120 -> 100/211    N=122 -> 111/211    N=140 ->  33/211
N=110 -> 117/211    N=121 -> 109/211    N=130 ->  97/211    N=160 ->   0/211
```

**121 is not special.** The reason is mechanical: every byte in the region is either `< 16` or a
run marker, so the region is homogeneous and the search can find its *extent* but not its
*start*. The 121 comes from the sub-header (§1.4d) and is **consistent with** the tail decode,
not proven by it. The extent bound (nothing decodes past ~150) is the falsifiable part and is
asserted as such. This limitation is pinned by its own test rather than left in prose, so if the
boundary ever becomes resolvable the test fails and the claim can be upgraded.

**A layout this suggested, and killed.** If the bytes ahead of the two 121-byte sections were
distinct glyph bitmaps at 8 bytes each, then `len(glyphs) / 8` and `max(screen code) + 1` would
have to be the same integer — one measured as a length, one as a decoded value, neither able to
force the other. Result: **0 agree, 12 disagree, and 50 of 62 glyph regions are not a multiple of
8**. Deduplicated-glyph storage is refuted. The earlier length-arithmetic forms of the same idea
died too (`242 + 8N`: 24/211; `10M`: 18/211 — both at or below chance).

**Still unread:** the glyph bitmaps and the screen codes. Decoding the region before the colour
section with the same codec gives 1089 bytes for **0 of 109** files, and the misses scatter
(deltas `+92, -79, +3, +32, …`) rather than sitting at a fixed offset — so the sections do not
share one stream, and the head uses something else. No pixels are rendered yet.

Pinned by `test_the_variable_pic_file_ends_in_a_c64_colour_ram_section`,
`test_the_colour_reading_survives_a_shifted_value_band`,
`test_the_colour_section_length_is_not_resolved_by_the_decode` and
`test_the_deduplicated_glyph_layout_is_refuted`.

##### 1.4e.1 The same result with no search at all, and two more layouts eliminated

The result above came from a search, which is why it needed the band sweep. It does not have
to. Decoding the **whole payload** start to finish — no start offset, no threshold sweep, no free
parameter of any kind — and simply looking at the last 121 bytes gives a **better** number:

| | anchored search | whole-payload decode |
| --- | ---: | ---: |
| files ending in 121 colour-RAM values | 109 / 211 | **155 / 211** |
| free parameters | start offset, threshold | **none** |
| payloads that parse as a complete stream | — | **211 / 211**, no truncated runs |

Median expansion is 1.37x (range 1.08-1.70), and the final 121 output bytes come from a median
of **80** input bytes, so the codec is doing real work on this section.

**The confound that would have made this trivial is dead.** If the last 121 *raw* bytes were
already `< 16`, the claim would collapse to "the file ends in small bytes". Measured: **0 of 211**.
Every file needs the codec to get there, and every file's raw tail contains run markers (median
25.6% of its bytes are `>= 0xF0`). The band sweep holds here too — `16..31`, `32..47`, `64..79`,
`128..143` all score 0/211.

⚠️ **What this test cannot see.** The value band is *blind to the run arithmetic*: changing the
count changes how many times a byte repeats, not which byte, so `all(x < 16)` survives a wrong
count — under `(c & 0x0F) + 1` it actually scores **higher**, 181/211. The quantity that
separates them is the expansion ratio (real 1.08-1.70, that mutant 1.87-3.80, no overlap), and it
is asserted for exactly that reason. The anchored test of §1.4e remains the one that pins the
count, because it requires consuming to the byte. The two tests are complementary, not redundant.

**Two more layouts eliminated, from directions independent of §1.4e's:**

- **Deduplicated glyphs, again.** If the stream were `8N + 121 + 121`, then `T - 242` would be
  divisible by 8. Across all 211 clean decodes the residue is **flat** — 18, 28, 32, 25, 28, 27,
  28, 25 against ~26 expected by chance. This is a second, independent refutation of the layout
  §1.4e already killed on its `max(screen)+1` prediction.
- **`[glyphs][screen][colour]` is refuted.** Screen codes index a per-picture charset and would
  occupy a small contiguous range. The 121 decoded bytes immediately before the colour block are
  instead **indistinguishable from a control window** taken from the middle of the picture data —
  value span 253 vs 252, 42 vs 47 distinct values, and *neither* window is ever confined below
  128 (0/155 both). Without that control this would have been an observation about bitmaps rather
  than a refutation.
- **A longer-run opcode is not the missing piece.** If short files were short because a
  long-run escape was being misread as literals, they would be the ones with the longest runs in
  their output. They are not: the shortest third has a median longest-zero-run of **15**, the
  longest third **12** — flat, if anything inverted.

**So the head genuinely produces a variable number of bytes** (decoded totals 810-1715, median
1274, and **none** at 1210), which no fixed `968 + 121 + 121` layout can explain. The head does
not share the tail's codec. That is now three eliminated layouts and a characterised residual,
rather than an open guess.

Pinned by `test_the_colour_block_is_found_without_any_search_at_all` and
`test_no_screen_code_section_precedes_the_colour_block`.

##### 1.4e.2 The bound on all of the above: the section is not tied to *this picture*

"The 121 values are colour-RAM-ranged" and "the 121 values are **this picture's** colours" are
different claims, and only the first is established. The second was tested and **came back null.**

The DOS sibling is the same artwork at 88x88. Split it into 11x11 cells and take each cell's
dominant EGA colour: that is a partition of the same 121 cells the C64 section partitions. The
palettes are unrelated so colour *values* cannot be compared, but *"which cells match each
other"* is palette-independent — adjusted Rand index between the two partitions, with a per-file
empirical p-value against mismatched partners.

| | result | null |
| --- | ---: | ---: |
| median p | **0.471** | 0.500 |
| mean p | **0.505** | 0.500 |
| files with p < 0.5 | **56 / 97** | 48.5 ± 4.9 |
| files with p <= 0.059 | **6** | 5.7 |

Flat. **The C64 colour section is not demonstrably this picture's colour map.**

**Two earlier baselines were both wrong, in opposite directions**, and the disagreement is what
forced the right one. Scoring against *one* mismatched partner put the baseline at +0.005 and the
real pairing looked 3x better; scoring against the *maximum of three* put it at +0.038 and the
real pairing looked worse. A max over k draws is not a mean — neither number was a baseline. The
per-file empirical p-value needs no assumption about effect size or the ARI distribution's shape,
and it is what the table above reports.

**The instrument is not blind, which is what makes this a negative rather than a shrug.** Inject
a synthetic effect by copying a fraction of DOS labels into the C64 section:

| injected | 0% | 2% | 4% | 6% | 8% | **12%** | 25% |
| --- | --- | --- | --- | --- | --- | --- | --- |
| detected | no | no | no | no | no | **yes** | yes |

An effect touching as few as **12% of cells** would have been caught. The real data sits at the
0% row.

**Alternatives ruled out before concluding.** Six cell orderings (row-major, column-major, both
flips, 180deg, bottom-up transposed) — all flat. And because a C64 multicolour cell shows *four*
colours (shared background, two shared registers, the colour-RAM value), the colour-RAM value is
often the cell's **detail** colour rather than its dominant one, which would make "dominant EGA
colour" the wrong comparand regardless of the decode. So three further DOS proxies were tried —
rarest-globally, most-common-excluding-background, second-most-common. All flat as well. One,
`non-bg`, showed 14 of 127 files at p<=0.05 against 6.4 expected; its median p was 0.480, i.e.
the body of the distribution is null and only the tail bumped. **That is one tail excess across
four proxies tested and is recorded here rather than promoted** — it is not evidence.

**What could explain the null, in decreasing plausibility:** the C64 artwork is *redrawn* rather
than converted (multicolour halves horizontal resolution — 11 cells is 44 multicolour pixels
across, so a direct conversion of the DOS bitmap is not even possible); the 121-byte window is
misplaced, which §1.4e already concedes is unresolved; or the cell correspondence differs in a
way none of the six orderings covers.

Pinned by `test_the_colour_section_is_not_yet_tied_to_the_dos_picture`, whose skip guard is
gated on **source presence only** — its first version gated on the paired-row count, which sits
downstream of the decode under test, and it duly skipped rather than failed. That is the third
instance of that exact error in this family of tests.

#### 1.4f The block is a real picture map — and its row stride is 12, not the declared 11 (2026-08-15)

§1.4e.2 left an ambiguity it could not resolve: the cross-platform test was flat, and *either*
the window is misplaced *or* the art is redrawn. That question is answerable **from the C64 side
alone**, because a colour map is two-dimensional and noise is not. It resolves in favour of the
window being right.

**The tail is laid out as a picture.** Cells one row apart in a colour map agree far more often
than the surrounding lags do. Measured as a *local excess* — `P(v[i]==v[i+d])` minus the mean of
its neighbours at `d±2, d±3`, which cancels the smooth run-driven decay by construction:

| lag | 11 | **12** | 13 |
| --- | ---: | ---: | ---: |
| median excess, real | +0.049 | **+0.122** | +0.102 |
| median excess, run-preserving null | −0.000 | **−0.000** | +0.000 |
| files at p ≤ 0.05 (of 155, chance 7.8) | 73 | **133** | 118 |

**The null is the whole result.** A plain shuffle would have passed this for free: the codec's own
output is run-heavy, and shuffling destroys runs, so the shuffle null only ever asks "is this
RLE-compressible?" — which is exactly the trap §1.4e already had to work around. The null used
here decomposes the 121 values into maximal equal-value **runs** and permutes the runs, holding
the histogram *and* every run length fixed and destroying only the two-dimensional arrangement.
What beats it is layout and nothing else.

So the 121-byte window is not misplaced, and **§1.4e.2's flat cross-platform result is now
attributable to the art rather than to the decode.** That was the first of its three stated
explanations and it is the one that survives.

**The stride is 12, and the file's own width field says 11.** The lag curve peaks at 12, with a
second harmonic at 24, and per file the peak falls at 12 in 74 cases, 13 in 50 and 11 in only 18.
A bump at 12 means nothing on its own, so the instrument was calibrated on a map whose width is
**known**: the DOS sibling, same artwork at 88×88, split into 11×11 cells by dominant EGA colour.
Identical statistic, identical code, identical 97 rows — only the source differs:

| source | 9 | 10 | **11** | **12** | 13 | 14 | 15 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| DOS, known width 11 | −0.031 | +0.035 | **+0.117** | +0.030 | −0.026 | −0.030 | −0.019 |
| C64 decoded tail | −0.015 | −0.020 | +0.013 | **+0.071** | +0.058 | −0.009 | −0.037 |

The instrument recovers 11 sharply where 11 is the truth. On the C64 tail it returns 12, with 11
sitting at a fifth of 12's value. **This is a direct contradiction of the sub-header's own width
byte at offset 45, and it is left standing as a contradiction** — the two obvious ways to
reconcile it were tested and both fail:

- **Not an 11-wide row plus a constant.** Read as 11 rows of 12 at all twelve phases, the most
  predictable column beats the least by 0.043, and 20 run-preserving null draws of the same
  max-over-phases statistic reach that or better. No column is padding, a border or a counter.
- **Not a duplicated column.** The best-agreeing adjacent column pair anywhere, at any phase,
  sits at **0.532** — ordinary picture-neighbour agreement (the other pairs run 0.44–0.53). A
  duplicated column would read ~1.0.

The trailing all-`<16` region also runs longer than 121 in every file (min 125, median 136,
max 151), which is consistent with a block of 12×11 = 132 rather than 11×11 = 121, though §1.4e's
standing limitation — the region is homogeneous, so its *extent* is measurable and its *start* is
not — applies here too and keeps that from being a second independent reading.

**And the whole-file bitmap layout is refuted, this time on the right prediction.** `968 + 121 +
121` is not a character-mode layout at all; it is exactly C64 **multicolour bitmap**: 968 bitmap
bytes for 11×11 cells, 121 screen bytes holding two colour nybbles each, 121 colour-RAM bytes.
Rendering the last 1210 decoded bytes that way gives noise. More usefully, §1.4e.1's refutation of
`[glyphs][screen][colour]` predicted screen bytes would occupy "a small contiguous range" — that
is the **character-mode** prediction (codes indexing a charset), and it could not have tested a
bitmap-mode layout, where a screen byte spans 0..255 freely. Re-run with the bitmap-mode
prediction (the nybbles come from the picture's small colour set):

| | distinct nybbles (median) | fraction inside the colour block's value set |
| --- | ---: | ---: |
| screen window `out[-242:-121]` | 15 of 16 | 0.667 |
| control window, mid-picture | 15 of 16 | 0.643 |

Indistinguishable, and the screen window has *fewer* distinct nybbles than its control in only
53/155 files (34%, against 50% by chance). The layout is refuted on its own terms.

**What this changes for the next attempt.** The head is still unread and still emits a variable
byte count, so the family stays NOT solved with **zero pixels rendered**. But the target moved:
the picture is not `968 + 121 + 121` in decoded space, and the colour block is 12 cells wide
while the file declares 11. Either the sub-header's geometry describes a *source* the C64 blit
re-lays-out, or offsets 45–50 are not the fields §1.4d reads them as — and §1.4d's control (the
37 fixed-size bodies carry junk there) constrains only that the offsets are format-specific, not
that the reading is right. The `$D8xx` store-loop hunt of §1.4d should now look for a bound of
**132**, not 121.

Pinned by `test_the_colour_block_is_a_two_dimensional_picture_map`,
`test_the_colour_block_row_stride_is_twelve_not_the_declared_eleven`,
`test_no_twelfth_column_of_padding_or_duplication_explains_the_stride` and
`test_the_tail_is_not_a_multicolour_bitmaps_screen_section`. All four were mutation-checked
(7/7 killed): layout destroyed by a run-preserving shuffle, stride 12→11 and 12→13, the
calibration fed the C64 side instead of the DOS side, a constant twelfth column injected, a
duplicated twelfth column injected, and a genuine small-palette screen section injected. Note one
honest limit: the stride discrimination is carried by the **calibrated** test, not by the
two-dimensional test's threshold, which sits close enough to lag 11's value that its kill there is
partly coincidence.

#### 1.4g The head is not the bitmap — and the file's SIZE is tied to the picture (2026-08-15)

Two calibrated results about the unread head, and one that corrects a shipped finding.

**The head is not this picture's bitmap in cell order.** A C64 bitmap is cell-major, 8 bytes per
cell, so it repeats at lag 8 and at 8×width. Repacking the DOS picture into exactly that order
gives a bitmap whose structure is *known*, and the identical statistic run on both:

| lag | 1 | 8 | 16 | 24 | 88 | 96 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| DOS repacked (known bitmap) | +0.070 | **+0.0097** | +0.0043 | +0.0021 | **+0.0083** | +0.0050 |
| C64 decoded head | +0.107 | −0.0007 | −0.0015 | +0.0001 | +0.0001 | −0.0000 |

Flat at every cell multiple, where the calibration is not. The head's raw equality also decays to
**0.032** by lag 30 while the DOS bitmap holds **0.17**, because a picture has large uniform
regions and the head does not. So no layout search that assumes the head is a raster in cell
order can work — which retrospectively explains §1.4e/§1.4e.1's four dead layouts.

**But it is not an opaque second layer either.** The other reading of that flatness — "the outer
decode is wrong, or its output is still compressed" — predicts incompressibility. Measured:

| | zlib ratio | entropy |
| --- | ---: | ---: |
| DOS repacked bitmap (raw picture bytes) | 0.650 | 4.71 b/B |
| C64 **raw payload** (compressed input) | 0.915 | 6.50 b/B |
| C64 **decoded head** | **0.720** | 6.30 b/B |
| C64 decoded colour block | 0.537 | 2.41 b/B |

The head compresses markedly better than the payload it came from, so the outer decode does real
work and the head is a *structured, variable-length* representation — not raster, not opaque.

**And the first cross-platform content link this family has produced.** §1.4e.2's null said the
colour section is not tied to this picture; how many **bytes** the C64 spends is a different
quantity, and it is tied. Against the DOS picture's complexity, measured two palette-independent
ways on the repacked bitmap — distinct 8-byte cell patterns, and its zlib ratio:

| | r | max &#124;r&#124; over 2000 permutations |
| --- | ---: | ---: |
| raw payload length vs distinct cell patterns | **+0.727** | 0.361 |
| raw payload length vs bitmap zlib ratio | **+0.596** | 0.354 |
| decoded head length vs distinct cell patterns | +0.590 | 0.352 |

Measured on the 97 single-frame files: animation is itself a ~580-byte length driver, and leaving
it in dilutes this to r=+0.23, which is a confound rather than a weaker result. **Note the decode
does not improve the link** (raw +0.727 beats decoded +0.590), so this is evidence about the
*file*, not a validation of the decode, and it should not be quoted as one.

##### 1.4g.1 CORRECTION to §1.4b: its rival explanation was never actually tested

§1.4b's central finding — a C64 `PIC` whose sibling animates is ~490 bytes larger — ruled out
"animated monsters are just busier art" by showing two DOS complexity proxies predicted C64
length at **r=0.008 and r=0.087**, then stratifying on them. A control variable that cannot
predict the outcome cannot adjust for it. That stratification was arithmetic, not a test.

Re-run with a proxy that predicts length at r=+0.73, on 233 paired conforming files:

| | gap (K≥2 minus K=1) |
| --- | ---: |
| unstratified | **+580.7** |
| Q1 / Q2 / Q3 / Q4 of distinct DOS cell patterns | +611.4 / +595.9 / +580.2 / +549.6 |
| mean within bins | **+584.3** |
| largest of 2000 label permutations of the same stratification | +156.5 |

**The finding stands, untouched, in every quartile** — the within-bin mean is if anything
slightly *larger* than the unstratified value. Only its stated defence was invalid, and it is now
valid. This is worth recording precisely because the conclusion did not change: the reason to fix
a bad control is that it was carrying no weight, not that it was hiding a different answer.

Pinned by `test_the_c64_payload_length_tracks_the_dos_pictures_complexity`,
`test_the_animation_gap_survives_a_complexity_proxy_that_works`,
`test_the_decoded_head_is_not_a_cell_major_bitmap` and
`test_the_decoded_head_is_not_an_already_compressed_buffer`. Mutation-checked 5/5: the pairing
rotated so each C64 file scores against another file's picture, the payload lengths shuffled, the
C64 arm of the calibrated test fed the DOS bitmap, the calibration arm fed the C64 head, and the
head pre-compressed.

## 2. The code search that was done, and why it did not close the gap

Following the project's rule to derive from the code that *consumes* a format rather than fit a
layout to a size, real disassembly was attempted before settling for the data-only correlation in
section 1.2. This section records what was checked, because a documented negative result is worth
more than a silent one.

### 2.1 The relevant real-mode addresses

`COMBAT` (9467 bytes, the combat-screen module) and `DUNGEON`/`GEN`/`CAMP`/`COM.PREP` all decode
cleanly at `org=$4000` with **zero** `.byte`-fallback lines across a representative sample --
unlike `GDRIVE00`/`GDRIVE01`/`GDRIVE02`, these large overlays run in place at their stated `$4000`
load address rather than being staged and relocated. `LINKER` (146 bytes) confirms this: it is a
small dispatcher containing an embedded ASCII table of overlay names (`GEN`, `DUNGEON`, `COMBAT`,
`INIT`, `COM.PREP`, ...) -- i.e. `$4000` is a shared "current overlay" execution slot the game
swaps modules through, matching `COMBAT`'s own clean in-place decode.

### 2.2 GDRIVE01's full 25-entry jump table (extends the existing partial finding)

`docs/engine/research/c64-disk-format.md` section 7.5 had already established `GDRIVE01`'s real
origin as `$C000` (stored load word `$4000`) from ONE table entry (`$C0A1`, the multicolour-mode
setup). The complete 25-entry table (`4C xx xx` repeated from offset 0) was extracted here:

```
0 C0A1   5 C14F  10 C3FA  15 C5F9  20 C6BA
1 C183   6 C176  11 C421  16 C605  21 C8A1
2 C142   7 C169  12 C435  17 C680  22 C90F
3 C135   8 C3D2  13 C2B5  18 C661  23 C90F
4 C15C   9 C322  14 C29D  19 C6BA  24 C90F
```

Entries 22-24 all point to `$C90F`, which disassembles as `.byte $FF` followed by `91 FF`
(`STA ($FF),Y`) repeated -- an `$FF`-filler tail, not real code, consistent with the project's
prior finding elsewhere that unused regions are `$FF`-filled (EasyFlash ROM entropy analysis in
`c64-disk-format.md` section 6). These three slots are unused table stubs.

Entries `$C680`/`$C661` were disassembled in full: they read a caller-supplied id in `$C056`, use
it to index a 4-byte-per-record lookup table at `$C075`/`$C076` (`id*4 + base`), and split the
resulting two bytes into three fields (`$C051`/`$C052`/`$C053`) via nibble extraction. This shape
(indexed lookup, nibble split) matches the sort of thing a sprite/animation-frame table would need,
but it was not traced further -- `COMBAT` never calls this specific pair of entries via any of the
JSR-into-`$C000..$CA02`-range hits found (see 2.3), so it was not the payoff lead it looked like.

### 2.3 GDRIVE02 is confirmed to be the BIGPIC blit ONLY, and COMBAT reuses it for the
background, not the monster icon

`GDRIVE02`'s full body (407 bytes) was disassembled start to end. It is exactly the routine
`c64-disk-format.md` section 7.4/7.5 already documented: `$C045` sets the three background
registers from `$7974`, then `$C066` copies the 1536-byte glyph block from `$7374` to `$D200` via
a generic byte-copy primitive at `$C006` (parameterised by a literal `LDX #$06` = 6 pages = 1536
bytes -- BIGPIC's own glyph-block size, not COMPIC's), and `$C085`-`$C0CA` blits the 38x15 screen
and colour planes using the row tables at `$C0DA`/`$C0F3` and `$C10C`/`$C125` (also already
documented). There is no second, smaller-parameterised entry point in this file for a COMPIC-sized
blit.

`COMBAT` was scanned for every `JSR` whose target falls in `$C000..$CA02` (the address span shared
by `GDRIVE00`/`01`/`02` while any of them is loaded into that slot). It contains exactly one hit
outside GDRIVE01's own jump-table slots: `JSR $C066`, i.e. `COMBAT` explicitly re-invokes GDRIVE02's
glyph-copy-and-blit routine. Given the fixed `LDX #$06` inside that routine, this call is
necessarily drawing a **full BIGPIC-class background** (almost certainly the combat terrain image
-- CoK's own `PIC70`/`PIC72`/`PIC79`, which are 2681-byte BIGPIC-format files, sit right next to
`COMPIC*` in every disk-side directory listing). It is not, and structurally cannot be, the COMPIC
monster-icon blit.

Other `JSR`s in the same address range, from `COM.PREP`, target addresses that fall *inside*
GDRIVE01's own body span numerically but do not correspond to real GDRIVE01 code at those specific
offsets (e.g. `$C063`, one byte inside a 3-byte `STA` instruction's operand) -- the only coherent
explanation is that a **different** overlay (not `GDRIVE00`/`01`/`02`) is resident in the shared
`$C000` slot at the time `COM.PREP` makes that call. This is a genuine limitation of static
address-range filtering on a system that reuses one memory region for many different overlay
files across the game's lifetime: a `JSR $Cxxx` cannot be attributed to a specific *file's*
disassembly without knowing which overlay was loaded there at that call site, and this project has
no live-trace evidence to establish that (and is barred from running one -- static-only, no
emulator).

### 2.4 What else was ruled out

- **`GDRIVE00`**'s own jump table (35 entries, real origin `$C000`, spanning to `$CAB4`) was
  extracted but its individual targets were not disassembled in full -- time-boxed out. It is the
  most likely remaining place to find a COMPIC-specific loader/blit pair, since its size (2808
  bytes) is large enough to hold more than the display-only routines already accounted for in
  `GDRIVE01`.
- **Literal-constant searches failed to find a COMPIC-specific blit entry point.** Searches for
  `LDY #$99` / `LDX #$99` / `CMP #$99` (153 decimal, the MON size-byte offset) and for `LDA #$6F`
  paired with a pointer-setup pattern (the `$6F00` BIGPIC staging address) across
  `COMBAT`/`COMBAT2`/`GDRIVE00`/`DUNGEON`/`GEN`/`CAMP`/`COM.PREP`/`LIBRARY` returned only
  false-positive hits (bytes that are part of a different instruction's operand, or an unrelated
  immediate value that happens to equal the byte searched for) -- consistent with the destination
  address for a combat-position-dependent blit being computed at runtime (via zero-page indirect
  addressing) rather than encoded as a literal, which a naive absolute-address or immediate-value
  scan cannot find.
- **`COMBAT2`** (8193 bytes) turned out to be almost entirely spell-name ASCII strings
  (`BLESS`, `CURSE`, `CURE LIGHT WOUNDS`, ...), not code relevant to picture display.
- **`SPR.TP`** (448 bytes) is raw data, not code -- and 448 = 7 x 64, i.e. seven 64-byte hardware
  sprite records (63 data bytes + 1 pad each). This looks like a small template/cursor sprite set,
  unrelated in both size and shape to COMPIC's 162-byte unit.
- **`LINKER`** (146 bytes) is the overlay-name dispatcher described in 2.1, not blit code.
- **`FASTL.O`** (429 bytes) is a fast-loader utility (KERNAL vector patching, `$DD02`/`$B8xx`
  drive-buffer plumbing) -- unrelated to picture display.
- A **hardware-sprite hypothesis** for COMPIC itself was considered and rejected on size grounds
  alone: 162 is not a multiple of 63 (the fixed hardware sprite data size), so COMPIC cannot be a
  simple concatenation of standard C64 sprites.

## 3. Mutation checks (what was actually broken, and seen to fail)

- `test_every_compic_file_fits_the_proportional_formula` was checked against narrowing
  `COMPIC_CLASSES` from `(1, 2, 4)` to `(1, 2)`: real 650/651-byte COMPIC files in Champions of
  Krynn, Death Knights of Krynn, Curse of the Azure Bonds and Gateway to the Savage Frontier then
  fail to classify (e.g. Champions reports `COMPIC38`/`COMPIC03`/`COMPIC16` as not fitting).
  Confirmed red via `unittest.TestLoader().loadTestsFromName(...)` against the live corpus.
- `test_mon_byte_153_predicts_compic_class_for_the_five_relevant_titles` was checked against
  moving `MON_SIZE_BYTE_OFFSET` from 153 to an unrelated offset (7): accuracy collapses to 0.0% on
  every title. Confirmed red the same way.
- `test_mutation_flipping_the_size_byte_lowers_measured_accuracy` (inside the suite itself) XORs
  every Champions of Krynn monster's byte 153 with `0xFF` and asserts the predictor's match count
  drops from its known-100% baseline.
- `test_narrowing_the_size_classes_does_break_the_check` is a live control kept inside the suite
  (not just a one-off manual run): it patches `COMPIC_CLASSES` to `(1, 2)` for the duration of one
  test and asserts at least one real corpus file then fails to classify.

## 3a. 2026-08-11 pass: narrowing where the consumer lives (still unsolved, but less unknown)

This pass re-verified the file count and then pushed the disassembly further than section 2,
using a purpose-built call-graph scanner (`c64_compic.absolute_call_targets`, a linear 6502
decode reusing `tools/c64_disasm.py`'s own opcode table -- not the naive byte-pattern grep
section 2.4 already flagged as unreliable). It closes several specific hypotheses and upgrades
one origin claim, but the pixel codec itself is **still UNSOLVED**.

**File count re-verified.** `python -c` against `c64_compic.title_files()` for all seven titles
gives 45 + 51 + 64 + 53 + 61 + 62 + 43 = **379**, matching section 1.1 exactly (the module
docstring's own claim of "a previous round's 337 was wrong" is independently reconfirmed, not
just repeated).

**GDRIVE00's real residence is $C000 -- upgraded from the scout handoff's weak "$4000?" guess to
a citable fact.**

> **Corrected 2026-08-11 by the lead session.** The original version of this section cited a
> "full coherent disassembly at `--org 0xC000`" as its first check. **That check is worthless
> and has been removed.** `c64_disasm.py`'s byte decode is *identical at every `--org`* -- the
> origin only shifts the printed address column -- so "it decodes coherently at $C000" is
> equally true at $4000, $0800 or any other value. The scout handoff explicitly warned about
> exactly this trap and the warning was not heeded. The conclusion happens to be right; the
> stated reason was not evidence. The three checks below replace it, and unlike the original
> pair they can each individually come out the other way.

1. **Self-containment.** GDRIVE00's 35 table targets span `$C157`-`$CAB4`. Its 2806-byte body
   at org `$C000` spans `$C000`-`$CAF5`. Every target therefore lands *inside its own body* --
   the table dispatches into its own code, not into a sibling's. At org `$4000` the body spans
   `$4000`-`$4AF5` and all 35 targets fall outside it, which would make the file a pure thunk
   table into some other resident -- possible in principle, but see check 3.
2. **Cross-title discriminating call sites.** GDRIVE00's 35 slots at `$C000` are a strict
   *superset* of GDRIVE01's own 25 slots (`$C000`-`$C048`), so a naive "who calls `$C000+3k`"
   count is confounded -- every call to GDRIVE01's public API scores as a GDRIVE00 hit. Only
   entries 25-34 (`$C04B`-`$C066`) discriminate. Restricting to those: **6 hits in Champions of
   Krynn (COMBAT 2, COMBAT2 2, COM.PREP 2) and the same 6 in Death Knights (COMBAT 2, COMBAT2 2,
   COMPREP 2)** -- a stable cross-title signature, including the `JSR $C063` analysed below.
3. **The $4000 hypothesis fails on the second title.** Counting 3-byte-aligned `$4000+3k`
   call targets across both titles' overlay sets gives **7 in Champions of Krynn but ZERO in
   Death Knights**, even though GDRIVE00 is byte-identical between the two. A real residence
   produces callers in both titles; 7-then-0 is the signature of coincidental alignment in
   unrelated bytes. This is what actually kills `$4000`.

   Reproduce all three:
   `scratchpad/gdrive00_origin2.py` in the session scratchpad, or re-derive directly -- the
   whole computation is a directory read, a `4C lo hi` table walk, and an opcode-`$20`/`$4C`
   operand scan.

4. `c64_compic.gdrive_table_entries(gdrive00_body, 40)` -- a byte-derived reader that walks
   sequential `4C lo hi` (JMP-absolute) triples from offset 0 and stops at the first non-JMP byte
   -- returns **exactly 35 entries**, matching the scout handoff's own count, with no assumption
   about where the table ends baked in.

**COM.PREP's odd `$C063` call site (flagged unexplained in section 2.3) is now explained: GDRIVE00,
not GDRIVE01, is resident when COM.PREP makes that call.** `absolute_call_targets` on COM.PREP
(org `$0800`, target range `$C000-$CB00`) finds `JSR $C063` at file offset `$12F9` and `JMP $C063`
at `$13B2` (Champions of Krynn; Death Knights' `COMPREP` has the equivalent calls at different
offsets since its body length differs). `$C063` is `$C000 + 3*33` -- 3-byte-aligned, entry index
33. `gdrive_table_entries(gdrive00_body, 40)[33] == 0xC26E`: a real, in-range GDRIVE00 table
entry. `gdrive_table_entries(gdrive01_body, 40)` returns only **25** entries (GDRIVE01's table
really is the 25-entry table section 7.5 of `c64-disk-format.md` already established, ending in
three repeated `$C90F` filler stubs at entries 22-24) -- entry index 33 is 24 bytes past the end
of that table, so it cannot be a valid GDRIVE01 dispatch slot at all, regardless of what raw byte
happens to sit there. (An earlier draft of this finding tried to argue the point by asking
whether `$C063` is "a decodable instruction" under GDRIVE01, and that mutation check correctly
caught the draft's own flaw: `$00`/BRK is a legal 1-byte 6502 opcode, so a naive linear byte-walk
"decodes" through almost any byte run at all, including plain data -- not usable as evidence
either way. The table-length argument above does not have that problem: table length is derived
from where the `$4C` run of opcode bytes actually stops, a structural property of the bytes, not
an artifact of how a generic decoder happens to walk them.)

**GDRIVE00's own `$C063`-entry code (target `$C26E`) was traced and is NOT a picture blit.** It is
a monster/object on-screen POSITION tracker: `$C26E` computes a pointer `$9E = $CB00 + ($9B<<2)`
(a 4-byte-per-record table at `$CB00`, indexed by counter `$9B`); the routine at `$C27B`-`$C2EA`
compares candidate grid coordinates (`$FB`/`$FC`) against on-screen bounds (`$0612`/`$0613`),
and on success writes placement bytes into two parallel 128-entry tables at `$7A00` (X) and
`$7A80` (Y) via the loop at `$C33B`-`$C386`, capped with `CPY #$80` at `$C364` (128 decimal). This
never reads a monster's size/class code and never touches `$D000`-`$DFFF` display memory --
consistent with a sprite/icon placement compositor for the dungeon/combat grid view, not a
COMPIC pixel blit. This closes the specific hypothesis that GDRIVE00's `$C063` entry is the
consumer.

**GDRIVE02's full body (407 code bytes) was disassembled end to end, confirming exactly two entry
points, not a hidden third:** `$C000 -> $C045` (the already-documented BIGPIC blit) and
`$C003 -> $C13E`, a previously-undocumented **animation/counter-tick routine** -- it checks a flag
byte at `$7F18` against literal `#$79`, decrements a 16-bit countdown stored inline at
`$C195`/`$C196`, toggles a flip-flop at `$C194`, periodically re-invokes the `$C045` background
redraw, and updates an on-screen counter via calls to `$2E84`/`$30E2` (both outside this file, in
the unlocated low-memory kernel below). Far more consistent with a combat-round or blink timer
than a portrait draw. The generic, parameterised byte-copy primitive inside GDRIVE02 at `$C006`
(16-bit count via `A`(lo)/`X`(hi), stored to `$7F0A`/`$7F0B`) is real and reusable in principle,
but `absolute_call_targets` on all eight `$0800`-resident overlays (DUNGEON, COMBAT, CAMP,
COM.PREP, POST.COM, GEN, LIBRARY, INIT) for target range `$C006-$C009` found **zero** external
callers -- the only invocation anywhere is GDRIVE02's own internal call from `$C068` with a
hardcoded `LDX #$06` (1536 bytes, the BIGPIC glyph-block size). This closes the hypothesis that
COMPIC reuses that primitive with a smaller, class-derived count.

**No literal `"COMPIC"` ASCII string exists in any code overlay.** A full-corpus string search
across COM.PREP, COMBAT, GDRIVE00, GDRIVE01, GDRIVE02, DUNGEON, CAMP, GEN, LIBRARY, POST.COM,
INIT and LINKER found zero hits. The only project-wide occurrence is inside `ITEMNAMES` at file
offset 2542, as part of a resource family-name catalog: `...WALLSET00WALLDEF00ANIMATE00MON00BODY00
HEAD00CHARPIC00COMPIC00ITEMFILE00` (verified directly against the file bytes -- an earlier
transcription of this quote read `CHARSET00LLDEF00`, a garbled misreading of `WALLSET00WALLDEF00`;
no `"CHARSET"` string exists anywhere in `ITEMNAMES`) (family names with a placeholder id `"00"`, the same
convention section 1.3 already noted for CHARPIC). This means COMPIC filenames are built at
runtime (catalog lookup + a programmatically-appended 2-hex-digit id), not embedded per call
site -- so the load call site cannot be found by string search at all; it must be in whatever
code actually issues the `LOAD`.

**The code that would issue that `LOAD` is not among the extracted overlay corpus.** Several of
the routines read this round call out to addresses in the `$2E00`-`$3B70` range (GDRIVE00's
`JSR $2E04`/`$2E25`; GDRIVE02's `JSR $2E84`/`$30E2`/`$3B69`/`$3B70`) that are outside every file
this project has extracted and disassembled so far. The full CoK disk-directory listing across
all six sides (`python -c` against `c64_disk.directory()`, ~600 total PRG entries) contains no
file that looks like this resident low-memory "kernel" by name. `BOOT` (1331 bytes, loads at
`$0801` per its own load-address prefix) disassembles as incoherent 6502 from its very first
byte under `--org 0x0801` -- consistent with being a tokenized BASIC stub (a `SYS` loader), not
raw machine code, and far too small (1329 body bytes) to itself span `$2E00`-`$4000`. Locating
this kernel (by BASIC-detokenizing BOOT to see what it loads, or by reading tracks/sectors
outside the normal 1541 directory -- a known technique for period copy protection) is the
concrete blocker for finding COMPIC's actual consumer, and is out of this round's scope (no
BASIC detokenizer or raw-track reader exists in this project yet, and this pass is static-only).

**Immediate-value scan repeated with a corrected tool, same negative result.** A dedicated script
(not the byte-pattern grep already flagged unreliable in section 2.4) scanned every `cok_all` file
for `CPX#`/`CPY#`/`LDX#`/`CMP#`/`AND#` with operand `0xA2` (162, the COMPIC 1x unit) or `0x51`
(81, half). Every hit not inside a known data/string blob (ITEMNAMES, COMBAT2, ECL64, PIC7x
picture data) falls at an offset a proper origin-aware disassembly shows is mid-operand of an
unrelated instruction, not a real opcode byte -- reproducing, not just repeating, section 2.4's
finding. Consistent with the COMPIC byte count being computed at runtime from the class code
rather than encoded as a literal constant anywhere in the corpus this project has extracted.

Tools added this pass: `c64_compic.absolute_call_targets`, `c64_compic.gdrive_table_entries`
(see their docstrings), both exercised against the real `.d64` corpus (not the scratchpad
extraction used to explore) by `tools/test_c64_compic.py`'s `CorpusTests`, so these facts stay
checked on every future run rather than living only in this document.

## 4. Concrete next steps

> **Superseded by §5-§6 for `COMPIC`.** The next steps below were written while `COMPIC` was
> still undecoded; §6 decoded it without needing them. They remain the live worklist for
> `CHARPIC` and the variable-size `PIC*` families only.

Items 1 and 2 from the original list are now DONE (see section 3a: GDRIVE00's table was fully
extracted and its `$C063` entry traced; the position-tracker code it leads to was read in full)
and are superseded by a narrower, better-targeted list:

1. **Locate the low-memory resident "kernel" (roughly `$2000`-`$4000`) that at least three
   different overlays call into** (GDRIVE00's `$2E04`/`$2E25`, GDRIVE02's
   `$2E84`/`$30E2`/`$3B69`/`$3B70`) but which is not among any of the ~600 PRG entries across
   CoK's six disk sides. This is now the single concrete blocker for finding COMPIC's actual
   loader/blit -- section 3a's literal-string search proved the filename is built at runtime from
   a catalog (in `ITEMNAMES`) plus a programmatic hex-id suffix, so the call site can only be
   found by reading this kernel's code, not by searching for `"COMPIC"`. Two candidate approaches,
   neither attempted this round: (a) BASIC-detokenize `BOOT` (1331 bytes, a tokenized BASIC stub
   per section 3a) to see exactly what it `LOAD`s besides the named overlays; (b) read
   tracks/sectors outside the normal 1541 directory listing, a documented period copy-protection
   technique that would hide a file from `c64_disk.directory()` entirely.
2. **Disassemble GDRIVE01's own 22 real (non-stub) jump-table entries** -- section 7.5 of
   `c64-disk-format.md` and section 2.2 above only fully read two of them (`$C680`/`$C661`,
   ruled out as unrelated to COMPIC); the remaining 20 were extracted as raw targets but not read.
   Given GDRIVE00's own table turned out to be a position/placement system rather than the blit,
   GDRIVE01's untouched entries are now a comparably-weighted lead.
3. **Trace zero-page pointer setup in `COMBAT` around combat-position rendering** rather than
   searching for literal addresses -- the destination for a COMPIC blit is very likely
   runtime-computed (grid position dependent), which is exactly what defeated the literal-constant
   searches in 2.4 and their 2026-08-11 repeat in 3a.
4. **Cross-check the byte-153 hypothesis against a DOS `MON*.DAX` record**, if the DOS/C64 MON
   layouts are related closely enough (they are NOT confirmed byte-identical the way GEO/ECL are --
   see `c64-disk-format.md` section 1, "most files are not byte-identical") -- a DOS-side
   comparison, or the existing `hackdocs_extracted/MONSTDAT.TXT`-style community notes for a
   Krynn-specific (not UA) monster-record layout, might independently name this field.
5. **Pool of Radiance's own byte-153 offset** was not re-derived; if a Pool of Radiance PIC/MON
   consumer routine is ever disassembled for other reasons, check what offset its own size logic
   actually reads.

---

## 5. 2026-08-14: the body's internal partition, measured — `72 | 72 | 18`

Promoted here from the **C1.4b scope check**, which established that this family is the single
biggest unlock left in the C64 track (COMPIC + CHARPIC + variable-`PIC` = **754 files, 55.2% of
the C64 art corpus**, one pixel layout). This section adds the first *internal* structure this
family has ever had, and one refuted reading. **The format is still NOT decoded.**

### 5.1 There is a period, and it is 72

For every 162/163-byte (single-class) COMPIC in all seven titles — 229 bodies pooled — the
fraction of positions where `body[i] == body[i+lag]`, against the **closed-form permutation
null**: for a body of length `L` with byte counts `c_v`, the probability that two distinct
positions hold equal values is `Σ c_v(c_v−1) / L(L−1)`. That destroys position structure while
preserving each body's byte histogram exactly.

> **Which null, and why the closed form.** This was first measured with a *sampled* shuffle
> null, which gave lag 72 = 3.423 and lag 81 = 0.751. Those digits turned out to depend on the
> order the bodies were visited (the shuffle RNG is consumed per body), and a pinning test
> written from them failed immediately at 0.697 — round 9's own rule, *a sampled null must not
> be quoted to more digits than its seed spread supports*, catching this within minutes of being
> written down. The closed form has no seed and no order dependence, and it yields **one null
> value shared by every lag** (0.0997), so comparing lags is exactly fair rather than
> approximately fair. The conclusion is unchanged; only the digits moved.

| lag | real | null | ratio |
|---:|---:|---:|---:|
| **72** | **0.3356** | 0.0997 | **3.366** |
| 1 | 0.3024 | 0.0997 | 3.033 |
| 2 | 0.2169 | 0.0997 | 2.176 |
| 71 | 0.1832 | 0.0997 | 1.838 |
| 81 | 0.0709 | 0.0997 | **0.711** |

Lag 72 is the clear winner. Lag 1–2 is ordinary local byte-run smoothness, and 71/73 are the
shoulders of the 72 peak. **Lag 81 scores *below* its own null**, which is a direct refutation of
the natural first guess that a 162-byte body is two equal 81-byte maps (screen + colour), the way
the solved fixed-size `PIC` is 570 + 570.

### 5.2 The periodicity is bounded, and it gives the partition

Per-position match rate for `body[i] == body[i+72]`:

- `i` in `[0, 72)` — substantial throughout, **0.12 to 0.87**
- `i` in `[72, 90)` — collapses to **0.00–0.04**

So the relation is exactly `body[0:72] ↔ body[72:144]`, and nothing after 144 participates. The
single-class body therefore partitions as **`72 | 72 | 18`**.

### 5.3 The two 72-byte blocks are planes of the SAME picture

Stated as a null-backed comparison rather than an impression. `rate(block0, block1)` within one
file, versus the same statistic across randomly paired *different* files (1989 pairs):

| comparison | mean match rate |
|---|---:|
| **within file** — `body[0:72]` vs `body[72:144]` | **0.4153** |
| cross file — one body's `block0` vs another's `block1` | 0.1561 |
| **ratio** | **2.66×** |

They are **never identical** (0 of 229 bodies), so this is not duplication; and the 18-byte tail
is unrelated to either block (`body[0:18]` vs `body[144:162]` = **0.0143**, i.e. at chance). Two
blocks that are strongly correlated, never equal, and confined to their own file are two
*planes/regions of one image* — the first thing known about this family's interior.

### 5.4 REFUTED by the pixels: "two bitmap character rows, 9 cells wide"

`72 = 9 cells × 8 bytes` is one character row of C64 bitmap, which makes `144 + 18` read as
*9 cells × 2 rows of bitmap, then one colour byte per cell* — arithmetically perfect
(`162n = 144n + 18n` for every size class, exactly). The `n=1` colour-region byte histogram even
looks right: its top values are `FB/0B`, `FA/0A`, `FD/09` — pairs differing only in the high
nibble, which is precisely the "low nibble real, high nibble dirty" signature the solved `PIC`
colour map has.

**It renders as noise.** Nine COMPICs across three size classes and two titles were decoded under
this layout in *both* hires and multicolour and none produced a coherent figure. Recorded as a
refuted reading rather than dropped, because the arithmetic and the histogram both look
convincing enough that someone will re-derive it otherwise.

The measurement in §5.1–§5.3 is unaffected — what is refuted is the *interpretation* of the 72,
not the 72.

### 5.5 What this changes for the next attempt

- The consumer hunt (§2, §3a) remains the right primary route, and its target is now sharper:
  a blit that reads **two 72-byte blocks plus an 18-byte tail**, not one linear buffer.
- The mode question is **no longer a blocker** — multicolour character mode is settled
  corpus-wide (`2782e22`, `c64-wallset-format.md` §8).
- Any future layout proposal must beat the §5.1 null and survive §5.4's test: **render it and
  look**, before it is written down as solved.

### 5.6 The 72/18/162 constant hunt — a clean, over-inclusive NEGATIVE

The `72 | 72 | 18` partition hands the consumer hunt something §2 and §3a never had: **the
numbers the routine ought to contain**. If a blit copies a 72-byte block, its loop should end
`CPY #$48 / BNE`, or start `LDY #$48 … DEY / BNE`. Searched across **446 code-like files** in all
seven titles (`illegal_opcode_fraction < 0.10`, `GDRIVE01` included), for counted loops of length
**72, 18, 162 and 144**:

| loop length | counted loops found | where |
|---:|---:|---|
| 162 (whole body) | **0** | — |
| 72 (one block) | 2 | Pool of Radiance `POOLRA` only |
| 144 (both blocks) | 2 | `SPELLN64`, two titles |
| 18 (tail) | 20 | scattered; `PIC64`@130 in five titles, `LIBRARY`, `COMBAT`, `CAMP` |

**No file anywhere carries both a 72-loop and an 18-loop.** That combination is the minimum
signature of a routine that consumes this layout, and it does not exist in the statically
reachable code-like corpus.

This is deliberately an **over-inclusive** search — it matches raw opcode/operand byte pairs
rather than decoding instruction boundaries, so it over-reports by construction. Per the standing
rule, an over-inclusive scan returning nothing is a strictly stronger negative than an exact one
returning nothing.

**Named false positive, so nobody re-finds it.** A bare-constant version of this scan flagged
`GDRIVE01` in **all seven titles** at identical offsets — `LDA #$48` at body 1080 and `LDA #$12`
at body 1085, five bytes apart, which looks exactly like "block length, then tail length". It is
not. Disassembled (`$C438`):

```
C438  A9 48     LDA #$48
C43A  8D 93 C0  STA $C093
C43D  A9 12     LDA #$12
C43F  8D 94 C0  STA $C094
C442  20 49 C4  JSR $C449      ; the known self-modifying address-copy entry
```

`$C093/$C094` are the low and high bytes of **one 16-bit constant `$1248`**, staged for the
`$C449` routine that copies `$C083/4` and `$C085/6` into self-modifying operands (documented in
`tools/c64_sprite.py`). Two halves of an address, not two counts. Requiring a *branch* — i.e. an
actual loop rather than a bare constant — rejects it, which is why the table above is built from
counted loops.

**What this constrains for the next attempt.** The blit does not use the layout's lengths as
literal loop bounds. So it most likely **computes** its counts from the size class `n`
(bodies are `162n`, and §1's MON byte-153 predictor shows the engine knows `n` before loading),
rather than branching on literals — meaning the next search should target a multiply/shift by
`n` feeding a copy loop, not a constant. The alternatives are that it lives outside the
code-like gate, or is assembled at runtime.

---

### 5.7 CORRECTION to §5.6 — the negative is true but nearly information-free

> ⚠️ **§5.6 as first written overstated its own result.** Everything it reports is
> factually correct; what was wrong is the claim that a zero here *means* anything. Measuring
> the baseline §5.6 was never compared against — how often counted loops occur at all, and at
> which lengths — refutes the strength of two of its three headline statements. Pinned by
> `test_the_72_18_162_loop_search_cannot_discriminate_and_is_retired`.

**The baseline.** Across the same 446 code-like files: **4,076 counted loops**, mean 9.1 per
file, but concentrated in only **105 of 446 files** and overwhelmingly at small bounds —
**66.1%** of all loop bounds are `< 32`, 18.3% are 32–127, 15.7% are `>= 128`, and only 43 of
the 128 possible high values appear at all. The top bounds are `0, 3, 1, 2, 255, 15, 4, 7, 8`.

**Consequence 1 — "zero counted loops of 162" is not evidence.** In the whole window
150–174 there are **16 counted loops total, and 16 of the 24 non-162 values are themselves
exactly zero**. Any 162-byte format would produce this zero whether or not its blit exists.
The expected count at 162 is ~0.67; observing 0 is unremarkable.

| window | total counted loops | values scoring exactly 0 |
| --- | ---: | ---: |
| 150–174 (excl. 162) | 16 | 16 of 24 |

**Consequence 2 — "no file carries both a 72-loop and an 18-loop" is arithmetic.** Exactly
**one** file in all seven titles carries a 72-loop at all (Pool of Radiance `POOLRA`); 17 carry
an 18-loop. Expected co-occurrence under independence is `1 x 17 / 446 =` **0.038 files**. A
zero was never in doubt. For the wider reference class: of the 6,670 value pairs where both
values are held by at least two files, **2,899 (43.5%) co-occur in zero files** — zero
co-occurrence is the *modal* outcome, not a signal.

**Consequence 3 — the surviving hits are CBM system constants, not format constants.** The
single most-shared counted loop in the whole corpus is `PIC64`'s `CPY #$12` at body offset
**130, byte-identical in all seven titles** (`PIC64` is 736 bytes everywhere). That is 7 of the
17 18-loop holders, against 10 of the other 439 files (2.3%) — a large enrichment in a file
whose name says "picture". It is still not a tail loop:

```
4072  B1 3B     LDA ($3B),Y
4074  C9 82     CMP #$82        ; CBM directory entry type: closed PRG
4078  A0 03     LDY #$03        ; filename field starts at entry offset 3
407A  B9 FD 03  LDA $03FD,Y     ; the wanted filename
407D  D1 3B     CMP ($3B),Y
4082  C0 12     CPY #$12        ; <- the "18": end of the 16-char name field
4089  E0 08     CPX #$08        ; 8 directory entries per sector
408F  69 20     ADC #$20        ; 32 bytes per directory entry
```

`$82`, `$20` and `$08` are 1541 filesystem constants, so the 18 is a **filename length**. This
is the same failure mode as the `GDRIVE01` `$1248` false positive one section above, and the
two together are the real lesson: at this corpus size, *every* numeric coincidence with a
format length resolves to a ubiquitous CBM/VIC constant. The method cannot discriminate.

**What survives §5.6.** The literal-constant search is still closed — not because its zero
was meaningful, but because it is now shown to be incapable of returning a meaningful non-zero.
The §5.1–§5.3 measurement of the `72|72|18` partition is untouched by all of this. The forward
guidance is unchanged and now better justified: target a count **computed** from the size class
`n`, or accept that the blit is outside the statically reachable code-like corpus.

**One genuine by-product**, worth keeping regardless of COMPIC: `PIC64` is a byte-identical
**directory-scan-by-filename loader shared across all seven titles** — 736 bytes, same code at
the same offsets, differing only in load address (`$4000` in five titles, `$3000` in Curse and
Gateway, `$0400` in Pool of Radiance).

---

## 6. SOLVED — the 162-byte unit is two 3x3 multicolour animation frames

**2026-08-14.** `COMPIC` decodes. The 162-byte unit is:

| bytes | contents |
| --- | --- |
| `body[0:72]` | frame A glyphs — 9 cells x 8 bytes, 3x3 cells = **24 x 24 px** |
| `body[72:144]` | frame B glyphs — same shape |
| `body[144:153]` | frame A colour — one byte per cell |
| `body[153:162]` | frame B colour — one byte per cell |

Multicolour character mode: each glyph byte is four 2-bit pairs, each covering two pixels;
pair `00` is background, `01` takes the colour byte's **high** nibble, `10`/`11` take its
**low** nibble. Decoder: `compic_units()`, `unit_frames()`, `decode_frame()`, `decode_compic()`
in `tools/c64_compic.py`. **379 files** across all seven titles decode.

**Confirmed by rendering, which is what §5.4 demanded.** The gallery
(`renders/c64_compic/compic_gallery.png`) shows unmistakable Gold Box combat sprites, each in
two poses: archers drawing bows, a coiled serpent, a striding lizard-man, armoured knights with
shields, a wizard casting.

### 6.1 Why the earlier readings failed, and what actually pointed here

Every measured fact in §5 was correct; the *interpretation* was wrong twice, and the fix came
from taking the measurements more literally rather than from a new search.

- §5.3 called the two 72-byte blocks "planes of the same picture" (0.415 within-file vs 0.156
  across an exhaustive cross-file null). They are not planes — they are **two poses of the same
  creature**. Animation frames produce exactly that signature.
- §5.4 refuted `144 bitmap + 18 colour` by rendering it **9 cells wide**. The partition was
  right and the *width* was wrong. 18 glyphs tile six ways; the true frame is 3x3, twice.
- The alphabet statistics settle which kind of data this is, length-matched at 162 bytes:
  COMPIC scores **55 distinct values, entropy 4.74**, sitting on top of known SPRITE/WALLSET
  **pixels** (54, 4.43) and far from the solved fixed-`PIC`'s **screen codes** (76, 5.30) or
  **colour nibbles** (22, 3.32). So COMPIC bodies are pixels, not a screen-code map — which
  ruled out the "glyphs live in a companion file" hypothesis before any rendering was attempted.

### 6.2 The frame length is 72 in every size class — so a big file is not a big picture

The natural reading of `162n` is one picture that scales with `n`. The bytes say otherwise.
Same closed-form permutation null as §5.1, applied per size class:

| size class | files | lag 72 | lag `72n` | lag `81n` |
| ---: | ---: | ---: | ---: | ---: |
| n = 1 | 229 | **3.37x** | (=72) | 0.71x |
| n = 2 | 124 | **2.60x** | 0.77x | 1.42x |
| n = 4 | 26 | **5.68x** | 0.90x | 1.70x |

Lag 72 dominates at every size while lag `72n` sits **at or below its own null**. A single
larger frame would have produced the opposite. So an `n>1` file is a **sequence of independent
162-byte units**, and the size class is a count of units, not a magnification.

This was worth measuring rather than assuming: rendering `n=4` as one 6x6-cell frame, and as a
2x2 tiling of units, both produced incoherent output — consistent with the table, and both were
tried and discarded before the table was believed.

### 6.3 How multiple units compose — SOLVED, by using the DOS release as the oracle

§6.3 previously read "how multiple units compose is not settled", listing four separate
creatures / four quadrants / a 4-pose animation as live options. That is now decided, and the
thing that decided it was not a better statistic — it was **remembering this corpus has an
oracle**. A C64 COMPIC's filename hex suffix *is* the DOS block id, so `CPIC*.DAX` holds the
same monster picture, already decodable by `tools/dax_decode.py`, **at a known width and
height**. The question "what shape is this picture?" therefore has a published answer; it never
needed to be inferred from the C64 bytes at all.

#### The shape: MON byte 153 is a shape code, not just a size class

Matching every `n>1` COMPIC to its DOS block across five titles:

| MON byte-153 code | units | DOS frame | blocks | exceptions |
| ---: | ---: | --- | ---: | ---: |
| 1 | 1 | 24x24 | — | — |
| 2 | 2 | **24x48 (tall)** | 36 | 0 |
| 3 | 2 | **48x24 (wide)** | 42 | 0 |
| 4 | 4 | **48x48** | 22 | 0 |

Zero exceptions in 90 matched blocks. This retroactively explains the oddity in §1.2's
predictor table — codes **2 and 3 both meant "2 units"**, which looked like redundancy. They are
not redundant: they are the tall/wide split. Byte 153 selects the whole frame shape.

(One Curse of the Azure Bonds block is 40x24 rather than 48x24 — a narrower drawing inside the
same wide shape, not a different composition. The shape code fixes the *row count*; width may be
under-full.)

#### The order: one rule covers all four shapes

Units fill the frame **column by column, right to left, top to bottom within a column**:

| shape | layout |
| --- | --- |
| 24x24 | unit 0 |
| 24x48 tall | unit 0 on top, unit 1 below |
| 48x24 wide | unit **1** on left, unit **0** on right |
| 48x48 | `TL=2 TR=0` / `BL=3 BR=1` |

Frame A of every unit belongs to one pose and frame B to the other, matching the DOS pair of
blocks `N` and `N|0x80`.

Scored as ink-restricted silhouette agreement against the DOS picture, with cross-file pairing
as the null:

| shape | rule | vs | mean agreement | null | per-file |
| --- | --- | --- | ---: | ---: | --- |
| 48x24 | (1,0) | (0,1) | **0.743** | 0.627 | wins **51/54** |
| 24x48 | (0,1) | (1,0) | **0.706** | 0.615 | wins **32/36** |
| 48x48 bottom row | BL=3, BR=1 | swapped | margin **+0.299** | — | wins **18/18** |
| 48x48 top row | TL=2, TR=0 | swapped | margin **+0.223** | — | wins **12/18** |

**The 48x48 top row is the weakest leg and is reported as such — it is not unanimous.** It is
still the right reading, and the reason is the shape of the disagreement rather than its count:
sorted by margin, the ten largest margins are all positive (+0.22 to +0.76) and all six
disagreements are near zero (−0.141 to −0.013), i.e. smaller than the sixth-largest agreement.
A wrong rule would produce large negative margins somewhere; there are none. The runner-up
arrangement `(0,2,3,1)` differs from the rule *only* in the top row and shares the unanimous
bottom row, which is exactly why `tools/test_c64_compic.py` pins the bottom row and deliberately
does not pin the top.

Rendered side by side with the DOS pictures the agreement is obvious to the eye: the same
dragons, trolls, hydras and horses in the same poses, at the same size
(`renders/c64_compic/c64_vs_dos_final.png`).

#### Scope and what this does not cover

- The oracle covers **five titles**. Gateway to the Savage Frontier is excluded because its DOS
  `CPIC*.DAX` blocks use a frame header `18 00 03 00 …` that `parse_standard_frame` does not
  handle (item_count 3), so it contributes **zero** blocks rather than wrong ones. Decoding that
  variant is an open item. Buck Rogers has no DOS `CPIC` archive at all.
- Pool of Radiance remains the documented byte-153 exception (§1.2): its `COMPIC09` and
  `COMPIC16` are two-unit files whose MON record carries code 1. That is the same known
  predictor failure, now pinned by its own test rather than left as a remark.

Also unresolved, and now less important: **the blit routine was never found** (§5.6/§5.7). The
format was solved from the data alone. That is worth recording as a method note — two consumer
hunts and a constant hunt all failed, and the answer came from measuring the file bytes, looking
at the pictures, and finally from noticing that a neighbouring platform had already published
the answer to half the question.

