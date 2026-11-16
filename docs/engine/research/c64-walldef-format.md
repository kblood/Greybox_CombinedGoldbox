# C64 `WALLDEF` format — DOS-oracle attack, round 1 (2026-08-12) + round 6 (2026-08-13)
# + gap==4 corpus-wide measurement (lead session, 2026-08-13)
# + round 8: the escape taxonomy (2026-08-13) — see §9

**Round 8 headline (2026-08-13), the shortest version:** §7's named next move ("separate the
escape population into its distinct kinds") is done, and the answer is that **`0xF0` marks many
structured record kinds, not one**. Round 7's gap==4 (width 4) class is neither unique nor even
the commonest — width 3 has 1426 records to width 4's 1161. Every one of 15 headline
(width, slot) cells across widths 2-8 carries a payload slot clustering in a narrow band at
**2.20×-6.28×** its own slot-permutation null in **6 of 6** titles, with bands chosen
leave-one-title-out. The byte after the escape is a **record-kind tag** that largely determines
the record's length (`op1 == 0xB1` → width 4 in **145 of 145** pooled escapes). Full numbers,
nulls, family correction and the honest negatives: **§9**.

**Status: NOT cracked.** This round used the already-understood DOS `WALLDEF*.DAX` shape as a
structural oracle to predict what the C64 `WALLDEF` container should contain, tested that
prediction directly against real bytes, refuted it, and found two new cross-title-reproducible
byte-value facts that narrow the search. Tooling: `tools/c64_walldef.py` (library + CLI),
`tools/test_c64_walldef.py` (**128 tests as of round 8: 127 passing + 1 pre-existing conditional
skip** unrelated to this round; see "Test discipline" below for the required seen-failing
checks). Companion doc for
the glyph-bank side: `docs/engine/research/c64-wallset-format.md`
(sibling-owned this round, not edited here).

**Lead session (2026-08-13) update to §6.1's "one observed local run".** §6.1's DoK `03` 4-byte
worked trace (`f0 82 0c 82 | f0 82 0c 83`) was flagged there as "one observed local run in one
file, not a proven general record shape." A corpus-wide scan (`gap4_third_byte_distribution` +
`gap4_records`, `tools/c64_walldef.py`) shows it is **not a singleton**: 1161 such records exist
across the six titles that contain any `0xF0` (CoK 215, DoK 257, CoAB 192, Secret 157, Gateway
102, Buck Rogers 238; Pool of Radiance 0, no `0xF0` at all — see §6.1's new subsection for the full
table, including a correction of a pre-measurement "Buck Rogers 0" claim that real bytes refute).
The record's middle payload byte clusters in `[0x09, 0x0F]` at 87%-99% real vs 28%-32% under the
**correct** null — which, per the standing rule that a claim about a relationship between
co-located quantities needs a null that holds the real quantities fixed rather than relocating
them, is a **position-preserving permutation of which of a record's three payload bytes lands in
the middle slot**, not a whole-body shuffle. This remains a **measurement of a byte-pattern
regularity, not a solved record boundary** — see the new subsection for what is and is not
established.

**Round 6 (§6-7) update, still NOT cracked — as corrected 2026-08-13.** Attacked the byte codec
directly with the round-5 "named next move." Round 6's first pass over-claimed two of its three
results; both are corrected in place, in boxes at §6.1 and §6.2, with the original text kept as
the record. The standing position:

1. **The `0xF0`-escape-with-count hypothesis is real but small.** ~13-15% of escapes have an
   operand equal to their own gap, against 5.3-6.5% from the marginals alone — **2.1×-2.8×**,
   reproduced in all six titles that contain any `0xF0`. Round 6's "12×-22×" used a whole-body
   shuffle, which relocates the escapes and so changes the gaps being predicted; and its
   "~27-36% restricted to count-like operands, never a majority in any id" is **retracted** —
   that subset is at chance (1.11×-1.31×) and five ids do reach ≥50%. Still REFUTED as a uniform
   rule (the naive walk overruns the body more often on real data than on its own null in 5 of 6
   titles).
2. **The exact-177 pile-up generalises from one title to four, not six.** `0xB1` piling up below
   a real `0xF0` ceiling holds in CoK, CoAB, Gateway and Secret (44 of 47 pooled). The two `0xEF`
   rows are **artifacts of the analysis window's own ceiling** — DoK and Buck Rogers section 2
   genuinely uses values up to `0xFF`, so they have no pile-up at all. The 50-glyph case is
   narrowed, not solved (2 of 22 CoK exceptions left).
3. **The round-5 37-byte DoK shared-prefix lead generalises, and 37 is NOT exceptional** — CoAB
   shares 155 bytes, Buck Rogers 67 across a 3-way group, and Gateway has three ids that are full
   1232-byte byte-identical duplicates, while CoK/Pool/Secret show no comparable match. This
   result verified clean.

## 0. The oracle

`packages/engine/src/loaders/walldef.ts` documents the DOS shape precisely, and
`docs/engine/research/firstperson-wall-geometry-cok.md` (COAB-sourced, CONFIRMED) explains what
it means:

- A decompressed `WALLDEF*.DAX` **block** is `k` fixed **780-byte records**.
- Each record is `byte[5][156]`: **5 rows** = wall-graphic "slot" variants (which of 5 visual
  styles a map wall-slot id selects — *not* depth); **156 columns** = a flat pool of tile-id
  runs for **10 named on-screen pieces**, sizes `{2,4,4,12,16,16,56,22,22,2}` (sum = 156, COAB's
  `idxOffset`/`colCount`/`rowCount` tables, re-derived and confirmed by summation here).
- Entries `< 0x2D` are reserved (`0`=none, `1`=border); entries `>= 0x2D` are real 8×8-tile ids.

**Death Knights of Krynn is the clean case to test first** (task brief): its five
`WALLDEF{1..5}.DAX` files hold **exactly ids {1,2,3,4,5,6,7}**, and — newly confirmed here —
**every one of those 7 ids decodes to exactly 3 records = 2340 bytes, with zero variance across
ids** (`DosOracleShapeTests`, `tools/test_c64_walldef.py`). That gives an unusually strong,
title-wide-constant prediction to test the C64 side against: if the C64 format replays the same
information in the same shape, every C64 `WALLDEF01`..`WALLDEF07` body should also be some
simple, constant function of 2340 (a fixed multiple, or 2340 plus/minus a fixed header).

It is not. (Champions of Krynn, contrast case: 22 ids, record counts vary 1 or 2 per id — its
DOS shape is not title-wide-constant, so it is a weaker predictor and was used here only as the
second-title cross-check per the standing "BOTH TITLES, ALWAYS" rule, not as the primary oracle.)

## 1. Length: refuted immediately

Real DoK C64 `WALLDEF{01..07}` body lengths (2-byte CBM load address stripped), read directly
off the disk images and cross-checked against the literal quoted in the task brief:

| id | length | length mod 780 | length mod 156 | length mod 5 |
|----|-------:|---:|---:|---:|
| 01 | 3301 | 601 | 133 | 1 |
| 02 | 3498 | 18  | 30  | 3 |
| 03 | 3058 | 358 | 4   | 3 |
| 04 | 2865 | 525 | 129 | 0 |
| 05 | 3826 | 346 | 22  | 1 |
| 06 | 3002 | 302 | 26  | 2 |
| 07 | 2959 | 259 | 55  | 4 |

None divides evenly by 780 (one full DOS record), 156 (one DOS row), or even 5 (the slot count);
the seven lengths' GCD is 1 (prime-factored: 3301 is itself prime). Against the DOS side's
*constant* 2340 for the same 7 ids, this alone rules out "same shape, replayed with a different
pixel encoding" — the C64 container is not carrying a fixed 5×156 grid at all, dense or with a
constant header. This *reconfirms*, from the DoK oracle specifically, the pre-existing
modulo-156/8 negative in `c64-wallset-format.md` §3.1 (which was established from the general
corpus, not from a shape as tight as DoK's per-id-constant 2340).

## 2. Two new byte-value facts (both titles)

Aggregating every C64 `WALLDEF` body per title (`aggregate_bodies` + `byte_histogram`):

- **CoK**: 22 ids, 23717 bytes total.
- **DoK**: 7 ids, 22509 bytes total.

### 2.1 A near-total void at byte values 0x21–0x3F

| title | bytes in [0x21,0x3F] | total bytes | fraction | uniform-random null (31/256) |
|---|---:|---:|---:|---:|
| CoK | 21 | 23717 | 0.0885% | 12.1% |
| DoK | 32 | 22509 | 0.1422% | 12.1% |

**The null used:** if WALLDEF bytes were drawn from an unstructured distribution touching the
full 0–255 range roughly evenly, this 31-value band would get ~12.1% of all bytes. The real
fraction is ~85×–137× below that null in both titles.

> **CORRECTION (lead session, 2026-08-12) — the uniform-random null is the wrong null, and the
> claim does not hold corpus-wide.** A uniform-random-over-0..255 null assumes a baseline density
> WALLDEF does not have; it will flag *any* sparse band as extreme. The corpus-appropriate null is
> each title's **own** byte histogram: rank the window `[0x21,0x3F]` against all 226 sliding
> 31-wide windows over that same title. Re-derived over all seven C64 titles (unique ids only,
> one instance per suffix):
>
> | title | ids | WALLDEF bytes | hits in `[0x21,0x3F]` | rank of 226 | largest all-zero run |
> |---|---:|---:|---:|---:|---|
> | Buck Rogers | 7 | 18538 | 22 | **1** | 4 @ `0x3A` |
> | Death Knights of Krynn | 7 | 22509 | 32 | **1** | 4 @ `0x3C` |
> | Pool of Radiance | 18 | 21329 | 0 | **1** | 48 @ `0xCE` |
> | Secret of the Silver Blades | 15 | 21381 | 17 | **1** | 12 @ `0x2F` |
> | Curse of the Azure Bonds | 18 | 20465 | 16 | 5 | **34 @ `0xCE`** |
> | Champions of Krynn | 22 | 23717 | 21 | 6 | **34 @ `0xCE`** |
> | Gateway to the Savage Frontier | 14 | 16086 | 15 | **33** | 40 @ `0xC8` |
>
> (De-duplicated by suffix: `c64_wallset.inventory()` returns one entry per *disk side*, so a
> naive aggregate double-counts. Every duplicate is byte-identical across sides in all seven
> titles. The CoK/DoK rows reproduce §2.1's own 21/32 counts, confirming the original round
> de-duplicated too.)
>
> So the void is **robustly established for four titles** (uniquely the lowest-density 31-wide
> window in their own corpus) — but for CoK and CoAB it is only 5th/7th-lowest and is beaten by a
> *larger* unmentioned all-zero band at `0xCE`–`0xEF`, and for **Gateway it fails outright at rank
> 33 of 226**. Gateway was never checked in the original round; the two-title cross-check
> (CoK+DoK) happened to sample one title where it holds strongly and one where it holds weakly,
> which read as agreement.
>
> Restated honestly: *`[0x21,0x3F]` is sparse in every title, and is the sparsest such window in
> four of seven; in the other three a higher band is sparser still.* The "type boundary" reading
> below is a plausible interpretation of the four-title result, not an established fact.

Pinned by `VoidRangeTests` in the test file (includes the explicit null-vs-real comparison).

Flanking the void: 0x00–0x1F is densely, broadly used in both titles (not sparse "reserved
codes" — e.g. DoK: `0x00`=465, `0x01`=548, `0x02`=599, `0x0b`=1356 hits); 0x40–0xFF is densely
used from 0x40 up. The void is a real *type boundary*-shaped gap, not a smooth low-density tail.

### 2.2 Two spikes at 0x40 / 0x42, and a reproduced (but reframed) 0xF0 spike

| title | high-band median | 0x40 count | 0x40/median | 0x42 count | 0x42/median | 0xF0 count |
|---|---:|---:|---:|---:|---:|---:|
| CoK | 60.5 | 876 | 14.5× | 496 | 8.2× | 1188 |
| DoK | 39.0 | 735 | 18.8× | 431 | 11.0× | 1155 |

`0x40` and `0x42` are not simply "the most common byte" (that title varies: `0x0b` at 1356 hits
is DoK's single highest count in the 0x00-0xFF range, and `0x82` at 1760 is CoK's), but both are
**5×–19× the high-band median** in *both* titles — a real, reproducible excess, pinned by
`HighBandSpikeTests`.

`0xF0`'s already-known "ceiling" (per-title max byte, `c64-wallset-format.md`) is shown here to
be a *frequency* fact, not merely a *range* fact: **DoK's real max byte is 0xFF** (192-glyph
titles use the full range, per the wallset doc), so 0xF0 is *not* DoK's ceiling — yet it is still
massively overrepresented (1155 hits vs a same-corpus neighbourhood mean of `mean(hist[0xE0..0xFE]
excluding 0xF0)` ≈ well under a fifth of 1155 — checked directly in `test_0xf0_is_not_dok_max_byte_but_is_still_a_frequency_outlier`).
This argues 0xF0 functions as something closer to a **sentinel/control byte reused across the
whole family**, not literally "the top of a glyph-index range" — the 50-glyph-titles' apparent
"ceiling" in the prior round's finding is very likely this same sentinel simply *also* being the
title's highest-ever byte, coincidentally, because 50-glyph titles never need bytes above it for
real data.

## 3. Hypotheses tested and refuted this round

Per the task's rule 4 ("never say swept loosely") — exact counts, not impressions.

### 3.1 "High-band byte = 0x40 + glyph_index" — REFUTED

The range `[0x40, 0xFF]` is *exactly* 192 values wide — numerically tempting against DoK's own
192-glyph `WALLSET` vocabulary (`c64-wallset-format.md`'s established glyph-count table). If real,
distinct high-band values used per file should never exceed the title's glyph count.

Tested directly (`RefutedHypothesisTests.test_high_band_glyph_index_hypothesis_fails_cross_title`,
real CoK measurement, glyph count = 50 for every CoK id):

| id | distinct high-band values used | > 50? |
|---|---:|---|
| 01 | 66 | yes |
| 02 | 124 | yes |
| 03 | 78 | yes |
| 04 | 61 | yes |
| 05 | 93 | yes |
| 06 | 75 | yes |
| 07 | 50 | **no** (exactly at the bound) |
| 08 | 97 | yes |
| 09 | 86 | yes |
| 0A | 84 | yes |
| 0B | 68 | yes |
| 0D | 76 | yes |
| 0E | 75 | yes |
| 0F | 78 | yes |
| 10 | 75 | yes |
| 11 | 84 | yes |
| 12 | 45 | no |
| 13 | 68 | yes |
| 14 | 74 | yes |
| 15 | 89 | yes |
| 16 | 88 | yes |
| 17 | 49 | no |

**19 of 22 CoK ids violate the 50-glyph bound**, several by more than 2×. Per rule "BOTH TITLES,
ALWAYS", a hypothesis that only fits DoK's numeric coincidence and fails this hard on CoK is
refuted, not "mostly right." Treat the 192-value range-width match as spurious.

#### 3.1b Scope note, and the section-2-restricted variant (also refuted)

**What 3.1 does and does not cover.** Its "high band" is every byte `≥ 0x40` in the **whole**
body. A *section-restricted* variant was raised independently by the lead session and is a
different hypothesis, because the restriction is what makes the alphabet small:

Every CoK WALLDEF body contains no `0xF0` in its first ~60–70%, then `0xF0` recurring every 3–8
bytes. Splitting each file at its first `0xF0` gives a "section 2" whose alphabet is only 10–17
distinct values in `0x80`–`0xEF`, against 45–124 distinct values `≥0x40` across the whole file
(id `01`: 14 vs 66). The variant hypothesis was `section-2 high byte = 0x80 | glyph_index`,
motivated by `0x80 + 49 = 177` for a 50-glyph WALLSET.

It fits well on its face — **15 of 22 CoK ids have a section-2 high-band maximum of exactly 177**,
5 fall below it, and only 2 exceed it (`04` → 187, `17` → 203). All 22 ids have exactly 50 glyphs
(`len(WALLSET)/8`), so the two violations are *not* a glyph-count effect.

**Refuted on two independent grounds, both measured:**

1. **Shape is wrong.** If 177 were the top of a dense index range `0x80..0xB1`, values just below
   it would be populated. They are not — 177 sits above a gap in every conforming file
   (id `01`: `…142, 143, 145, 152, 159, 177`; id `0F`: `…144, 145, 146, 147, 177`). That is
   sentinel shape, not ceiling shape.
2. **But it is not a sentinel either, so the bound is near-tautological.** Pooled over section 2,
   `0xB1` is only **1.6×–4.8×** the high-band median across the six titles that have a split
   (CoK 33 hits, 4.1×; Gateway 13 hits, 1.6×) — nothing like `0xF0`, which scores **54.7×–193.8×**
   over the same six (CoK 148.5×, DoK 57.8×). `0xB1` is simply
   close to the corpus-wide *top* of the populated high band, so "the per-file max lands at or
   below 177" is what you would predict from the pooled distribution alone, with no per-file
   structure. The agreement with `0x80 + 49` is a coincidence of arithmetic.

Recorded because the near-miss is attractive and will otherwise be re-proposed: **the 15/22
exact-177 pile-up is real and still unexplained**, but it does not license the index reading.
Pool of Radiance is a further caution — its WALLDEF bodies contain **no `0xF0` at all**, so the
section split does not even apply there (consistent with `c64-walldef-structure.md` §2.3's
finding that Pool differs on a separate axis).

### 3.2 "Control byte c<0x20 introduces a run of c+1 data bytes ≥0x40" — REFUTED

A natural next reading of the C/void/D shape from §2.1: a compact RLE-ish stream where a small
byte is a literal-run-length control and the void is simply the unused control-opcode space.
Tested directly on every real DoK body (`control_run_test`, walks the stream, requires the
predicted run to hold before accepting a byte as a real control):

| id | matched | mismatched |
|---|---:|---:|
| 01 | 181 | 923 |
| 02 | 118 | 720 |
| 03 | 210 | 821 |
| 04 | 216 | 683 |
| 05 | 219 | 1119 |
| 06 | 188 | 703 |
| 07 | 114 | 548 |

Mismatches outnumber matches roughly 3:1 to 5:1 in every file — decisively refuted as stated (not
"close, needs tuning"; a real control/data RLE would match near-100%, not 15-25%).

### 3.3 Even/odd parity two-stream interleave — REFUTED

Tested whether class-C (low) vs class-D (high) bytes separate cleanly by byte offset parity (an
interleaved two-field format). Both parities carry the same broad C/D mix in every real DoK body
(`RefutedHypothesisTests.test_parity_interleave_hypothesis_fails_dok`; e.g. id 01: even
offsets C=578/D=1072, odd offsets C=526/D=1123 — near-identical ratios, not a clean split).

### 3.4 Gap lengths vs the DOS 10-piece sizes — inconclusive, leans negative

Tested whether the run-length of class-D bytes between successive class-C bytes clusters at the
DOS piece sizes `{2,4,4,12,16,16,56,22,22,2}` (§0). Aggregated across all 7 DoK bodies, gaps of
length 0 and 1 dominate overwhelmingly (thousands of hits each — short runs of adjacent small or
adjacent large bytes, already implied by §2.1's type-boundary shape), and the DOS piece sizes
collectively account for well under 15% of all observed gaps
(`test_gap_lengths_do_not_cluster_at_dos_piece_sizes`). Not a clean refutation of *some* piece
concept surviving in a transformed way, but no support for the literal DOS piece-size list as C64
run lengths.

## 4. A genuine positive, not yet load-bearing: a shared 37-byte prefix

`WALLDEF01` and `WALLDEF05` (DoK) are **byte-identical for their first 37 bytes**, then diverge
(byte 37: `0x61` vs `0xfd`), despite total lengths differing substantially (3301 vs 3826). No
other pair among the 7 DoK ids shares more than 2 leading bytes (checked exhaustively, all 21
pairs; note this corrects an unverified visual impression from an earlier pass in this same
session that `WALLDEF03`/`WALLDEF07` also looked similar — checked directly, they share only 2
leading bytes, not the ~13 they appeared to share by eye). The real 01/05 match is consistent
with two wall styles sharing a reusable "template" header/sub-block, but with only one confirmed
pair it is a lead, not a structural claim — worth a future round's attention (does it hold for
any CoK id pairs? does the shared region correspond to a real semantic unit once the tail is
understood?).

## 6. Round 6 (2026-08-13): the escape-operand hypothesis attacked directly, the 177 pile-up
explained (partially, and by title class), and the shared-prefix lead generalised

Attacks the three items S5 (this doc, round 5) and S4 named as open. All numbers below are from
a single seeded run (`NULL_SEED = 20260813`, one `random.Random` instance reused body-by-body per
title, matching the convention `tools/c64_walldef.py` round 6's functions use) — exactly
reproducible via the functions named per subsection. Tests: `Round6EscapeHypothesisTests`,
`Round6PileupExplanationTests`, `Round6LcpMatrixTests` in `tools/test_c64_walldef.py`.

### 6.1 The `0xF0`-escape-with-operand scheme: a real, well-nulled, but incomplete correlation

Tested directly per S5's own named next move: is the byte immediately after every `0xF0` a count
of the literal bytes remaining until the *next* `0xF0` (`f0_operand_gap_pairs` +
`f0_operand_exact_match_count`)?

> **CORRECTION (lead session, 2026-08-13) — this subsection's null was wrong, its headline
> multiplier is ~5×-7× too large, and the subset it called its strongest evidence is at chance.**
>
> The null used below is a **histogram-preserving shuffle of the whole body** (`shuffle_bytes`).
> That is the right null for a claim about which byte *values* appear, and the wrong null for a
> claim about the *relationship between an escape's operand and its gap* — because shuffling the
> body relocates the `0xF0`s themselves, and so changes the very gap distribution the operand is
> supposed to predict. Real escapes are clustered; shuffled ones are not:
>
> | title | real mean gap | shuffled mean gap |
> |---|---:|---:|
> | Champions of Krynn | 6.16 | 18.37 |
> | Curse of the Azure Bonds | 6.59 | 18.37 |
> | Gateway to the Savage Frontier | 7.93 | 20.74 |
> | Secret of the Silver Blades | 9.92 | 20.75 |
> | Death Knights of Krynn | 12.15 | 18.41 |
> | Buck Rogers | 14.56 | 17.69 |
>
> A rarer, longer gap is far less likely to coincide with a small operand byte, so the shuffle
> scores a low match rate for a reason that has nothing to do with the hypothesis.
>
> The correct null holds the **real** operand population and the **real** gap population fixed and
> permutes only which operand is paired with which gap (`f0_operand_permutation_null`, 20 pooled
> permutations). It destroys the claimed association and nothing else. Re-scored:
>
> | title | real % | shuffle null | ratio | **permutation null** | **ratio** |
> |---|---:|---:|---:|---:|---:|
> | Buck Rogers | 14.6% | 0.9% | 15.9× | 5.29% | **2.77×** |
> | Champions of Krynn | 14.2% | 0.9% | 15.1× | 6.48% | **2.20×** |
> | Curse of the Azure Bonds | 13.0% | 1.3% | 10.2× | 5.50% | **2.37×** |
> | Death Knights of Krynn | 12.8% | 1.0% | 13.4× | 5.41% | **2.37×** |
> | Gateway to the Savage Frontier | 13.6% | 1.3% | 10.7× | 6.07% | **2.24×** |
> | Secret of the Silver Blades | 13.4% | 0.8% | 16.0× | 6.28% | **2.14×** |
>
> **The unrestricted effect is real and survives** — 2.1×-2.8× a null that cannot be accused of
> reshaping the gaps, reproduced in all six titles. That is the honest size of this finding.
>
> **The `op1 < 0x20` "restricted" result is retracted entirely.** Under the permutation null it
> scores 1.11×-1.31× — chance. Two things had made it look strong: the shuffle-null defect above,
> and the fact that *the restriction discards no matches at all*. Every `op1 == gap` pair already
> has `op1 < 0x20` by construction (a gap that large is rare), so restricting only shrinks the
> denominator. The match **count** is identical in both tables below — 143, 166, 133, 147, 96, 128
> — which is what "the rate rises further" actually means.
>
> **The "never reaches a majority in any single id checked (`n_ids_majority_match = 0`,
> exhaustively)" claim is false**, and no such statistic exists in `tools/c64_walldef.py` or
> `tools/test_c64_walldef.py`. Five ids reach ≥50%: CoK `17` (5/7 = 71.4%), CoAB `08` (5/5),
> CoAB `0F` (10/20 = 50.0%), Gateway `08` (5/5), Gateway `0F` (1/1). Three are on n≤5, which is
> the honest reason the claim looked safe — but "exhaustively... never" was asserted, not measured.
> Now pinned by name in `test_five_ids_do_reach_a_majority_the_doc_claimed_none_did`.
>
> The two tables below are left as written, as the record of what the wrong null reported.

The (wrong) null used below is a **histogram-preserving shuffle of the whole body**
(`shuffle_bytes`) — it preserves the marginal byte distribution while destroying the actual escape
placement and its neighbouring bytes.

**Unrestricted** (every `0xF0` occurrence, excluding each body's last one — see the function
docstring for why): real match rate clears the null by **12×-22×** in every one of the 6 titles
that have any `0xF0` at all (Pool of Radiance has none, so is not applicable here):

| title | real matches/total | real % | null matches/total | null % | ratio |
|---|---:|---:|---:|---:|---:|
| Buck Rogers | 143/977 | 14.6% | 8/977 | 0.8% | 17.9× |
| Champions of Krynn | 166/1166 | 14.2% | 13/1166 | 1.1% | 12.8× |
| Curse of the Azure Bonds | 133/1020 | 13.0% | 6/1020 | 0.6% | 21.7× |
| Death Knights of Krynn | 147/1148 | 12.8% | 7/1148 | 0.6% | 20.6× |
| Gateway to the Savage Frontier | 96/706 | 13.6% | 6/706 | 0.8% | 15.9× |
| Secret of the Silver Blades | 128/954 | 13.4% | 11/954 | 1.2% | 11.9× |

**Restricted to `op1 < 0x20`** (the "count-like operand" subset — direct inspection showed the
byte after `0xF0` is bimodal: roughly half the time it is a small value `<0x20`, roughly half the
time it is a high-band value `0x80-0xEF`, the same alphabet §3.1b's section-2 analysis already
established — see the worked DoK `03` byte trace below), the match rate **rises further** and
still clears its own (correspondingly restricted) null by a wide margin, but **never reaches a
majority in any single id checked** (`n_ids_majority_match = 0` in all 6 titles, exhaustively):

| title | real matches/total | real % | null matches/total | null % |
|---|---:|---:|---:|---:|
| Buck Rogers | 143/398 | 35.9% | 8/268 | 3.0% |
| Champions of Krynn | 166/538 | 30.9% | 13/291 | 4.5% |
| Curse of the Azure Bonds | 133/459 | 29.0% | 6/297 | 2.0% |
| Death Knights of Krynn | 147/555 | 26.5% | 7/336 | 2.1% |
| Gateway to the Savage Frontier | 96/337 | 28.5% | 5/231 | 2.2% |
| Secret of the Silver Blades | 128/461 | 27.8% | 11/300 | 3.7% |

~~**Verdict: real, cross-title-reproducible, well-nulled — but partial, not a crack.** Something
like a quarter to a third of "count-like" escapes genuinely predict the distance to the next
escape; the rest do not.~~ **Superseded by the correction box above.** The corrected verdict:
about 13-15% of all escapes have an operand equal to their own gap, against 5.3-6.5% expected
from the two marginals alone — a real 2.1×-2.8× effect reproduced in all six titles, and *not*
concentrated in a "count-like operand" subset (that subset is at chance). This remains evidence
that *some* escapes carry a count-like operand and most do not; it is not evidence of a uniform
escape+count scheme, and the mechanism separating the two populations is still unidentified.

**The overrun/self-consistency walk (`f0_walk_overrun`) makes this concrete, and refutes the
UNIFORM reading outright.** Walking each body left-to-right and treating every `0xF0` as
escape+1-byte-count (consuming that many following bytes before resuming literal copy-through), a
well-formed uniform encoding should overrun the body's own end **less** often than a
histogram-preserving shuffle of the same bytes (real operand values should track real remaining
space; shuffled ones are drawn from the same value pool with no such constraint). The real corpus
does the **opposite** in 5 of 6 titles — real overrun rate is 1.7×-2.0× the null, i.e. treating
*every* `0xF0` uniformly as a count operand desyncs the walk worse than chance:

| title | real overruns/escapes | real % | null overruns/escapes | null % |
|---|---:|---:|---:|---:|
| Champions of Krynn | 89/245 | 36.3% | 50/245 | 20.4% |
| Curse of the Azure Bonds | 81/219 | 37.0% | 48/241 | 19.9% |
| Death Knights of Krynn | 26/189 | 13.8% | 13/191 | 6.8% |
| Gateway to the Savage Frontier | 52/163 | 31.9% | 25/176 | 14.2% |
| Secret of the Silver Blades | 75/225 | 33.3% | 30/223 | 13.5% |
| Buck Rogers | 23/135 | 17.0% | 31/181 | 17.1% | *(tied — the one non-discriminating title)* |

A worked example that shows why (from Death Knights of Krynn `WALLDEF03`, byte offsets from its
first `0xF0`, hex): `f0 0e 82 | f0 82 0c 82 | f0 82 0c 83 | f0 ...`. The first escape's operand
(`0x0E` = 14) does **not** match its 2-byte gap to the next escape (a "count-like" miss); but the
next three escapes are each followed by a **fixed 3-byte payload whose first byte (`0x82`) and
second byte (`0x0C`) repeat verbatim**, only the third byte varying (`82`, then `83`) — i.e. a
literal, directly-observed local run of `0xF0 <style> <fixed> <variant>` 4-byte records. This
lines up exactly with `c64-walldef-structure.md` §2's independently-derived lag-4 peak (the
strongest lag in its 1-16 sweep, flagged there as consistent with "a 4-byte record built from two
interleaved 2-byte sub-fields" and left unadjudicated). Two-byte operand variants (`op1+256*op2`,
both endiannesses) were also tested against the same gap and scored **zero** exact matches in
every title — reported as a fact (no support found), not a refutation (the exact-equality bar for
a 2-byte value against a gap that is almost always `<60` is far stricter than the 1-byte test, so
a true zero here carries much less weight than the 1-byte results above).

**Net verdict for S5's named next move:** the 1-byte-count operand hypothesis is **real but
incomplete** — a genuine, well-nulled minority of escapes behave like a length-prefixed run: the
UNIFORM "every escape is one" reading is **refuted** by the overrun walk. The most likely
resolution is that `0xF0` marks (at least) two distinct kinds of record, not one — consistent with
the bimodal op1 distribution and the DoK `03` 4-byte trace above.

#### 6.1a Corpus-wide measurement of the gap==4 record shape (lead session, 2026-08-13)

The DoK `03` trace above was originally reported as "one observed local run in one file, not a
proven general record shape." This is now measured across the whole corpus instead of asserted
from one file. `tools/c64_walldef.py`'s `gap4_records` finds every pair of **consecutive** `0xF0`
occurrences exactly 4 bytes apart (i.e. the very next escape, not merely some later escape that
happens to sit 4 bytes on) and decodes the 3 bytes between them as `(byte1, byte2, byte3)` — the
trace's own "style", "fixed", and "variant" bytes. `gap4_third_byte_distribution` aggregates this
over a title's whole inventory (all `WALLDEF*` ids on all its `*.d64` sides, first-seen-wins
dedup, the same convention every function in this module already uses).

**The record count, per title, glob'd non-recursively per the standing C64-corpus rule** (`*.d64`
only, never `superseded/`), all 7 titles checked including Pool of Radiance:

| title | gap==4 record count |
|---|---:|
| Death Knights of Krynn | 257 |
| Buck Rogers — Countdown to Doomsday | 238 |
| Champions of Krynn | 215 |
| Curse of the Azure Bonds | 192 |
| Secret of the Silver Blades | 157 |
| Gateway to the Savage Frontier | 102 |
| Pool of Radiance | 0 (no `0xF0` in any Pool body at all — the same fact `section_split` already established, not a new one) |

**Correction of a number in this task's own brief.** The scan was framed to expect "Buck Rogers
0" — real measurement is **238**, not 0 (Buck Rogers has plenty of `0xF0`: 977 non-final escapes
total per §6.1's own table above, and 238 of the consecutive pairs among them are exactly 4 bytes
apart). Reported here as the measured fact rather than silently matched to the expectation; the
5 other non-zero counts above (CoK, DoK, CoAB, Secret, Gateway) do reproduce their stated numbers
exactly, and Pool's 0 also reproduces.

**The clustering claim, precisely.** The brief's "third payload byte…clusters heavily in
0x09-0x0F" refers to `byte2` (`body[p+2]`, the trace's "fixed" byte, counting the escape itself as
byte 1) — NOT `byte3` (the trace's "variant" byte, which does not cluster there at all). Measured
directly, `byte1` and `byte3` are essentially **never** in `[0x09, 0x0F]` (0 hits in every title
except a 3-record exception in Buck Rogers, out of 1161 pooled records — an exact, iterated count,
not an impression), while `byte2` is in that range **87%-99%** of the time:

| title | n records | byte2 in [0x09,0x0F] | fraction |
|---|---:|---:|---:|
| Curse of the Azure Bonds | 192 | 190 | 99.0% |
| Gateway to the Savage Frontier | 102 | 100 | 98.0% |
| Secret of the Silver Blades | 157 | 155 | 98.7% |
| Champions of Krynn | 215 | 202 | 94.0% |
| Buck Rogers — Countdown to Doomsday | 238 | 217 | 91.2% |
| Death Knights of Krynn | 257 | 223 | 86.8% |

**The correct null, and why a whole-body shuffle is wrong here.** The claim under test is a
relationship between two co-located quantities — *which slot* a payload byte sits in (position)
and *whether its value* falls in `[0x09, 0x0F]`. Per the standing rule this doc's own §6.1
correction box already established for the escape/gap claim, a whole-body shuffle is the wrong
null for a relationship claim: it would relocate the `0xF0` escapes themselves, changing which
bytes even belong to a record's payload, rather than isolating the one thing actually in
question. The correct null (`gap4_slot_permutation_null`) instead **holds every real gap==4
record fixed** — same escape positions, same three byte values per record — and permutes only
**which of the record's three payload bytes lands in the middle (`byte2`) slot**, pooled over 20
trials with a fixed seed (`NULL_SEED = 20260813`, matching round 6's convention):

| title | real byte2-in-band | permutation-null rate | ratio |
|---|---:|---:|---:|
| Curse of the Azure Bonds | 99.0% | 31.6% | 3.13× |
| Gateway to the Savage Frontier | 98.0% | 31.4% | 3.12× |
| Secret of the Silver Blades | 98.7% | 31.8% | 3.10× |
| Champions of Krynn | 94.0% | 30.2% | 3.11× |
| Death Knights of Krynn | 86.8% | 27.9% | 3.11× |
| Buck Rogers — Countdown to Doomsday | 91.2% | 29.6% | 3.08× |

The null lands near 1/3 in every title because almost every record has exactly one of its three
payload bytes in `[0x09, 0x0F]` (`byte2`, almost always), so a random slot assignment puts that
one value in the middle slot about a third of the time by chance alone. The real rate clears that
null by a consistent **~3.1×** in all six titles — a real, well-nulled, cross-title-reproducible
effect that the middle slot specifically (not "any slot") carries the low-band value, sized
honestly against the null it should be compared to rather than against a uniform-random or
whole-body-shuffle baseline that would overstate it.

> **Band-edge audit (orchestrator, 2026-08-13).** `[0x09, 0x0F]` is a scan window, and this doc
> has twice shipped a window's own edge as a fact about the data (`0xF0` in round 5, `0xEF` in
> round 6). So the edges were checked explicitly before this section was accepted. Pooled `byte2`
> histogram over all **1,161** gap==4 records, all 7 titles:
>
> | value | 0x01 | 0x02 | 0x06 | 0x07 | 0x08 | **0x09** | **0x0A** | **0x0B** | **0x0C** | **0x0D** | **0x0E** | **0x0F** | 0x10 | 0xD0 |
> |---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
> | count | 1 | 2 | 43 | 3 | 24 | **263** | **136** | **334** | **59** | **143** | **57** | **95** | **0** | 1 |
>
> **The HIGH edge is genuine, not an artifact.** `0x10` has **zero** hits and the entire range
> above it is empty but for a single `0xD0`. This is exactly the check round 6's `0xEF` claim
> failed — there, section 2 kept going to `0xFF` past the band. Here it genuinely stops, so
> `0x0F` may legitimately be described as `byte2`'s ceiling.
>
> **The LOW edge is arbitrary and does cut live data.** `0x08` (24) and `0x06` (43) sit just
> below the band — 67 records, 5.8% of the corpus — so the 87%–99% figures are "in `[0x09,0x0F]`",
> not "the whole distribution". The cleaner, edge-independent statement the histogram actually
> supports: **`byte2` is nibble-valued — 1,160 of 1,161 records (99.91%) fall in `0x01–0x0F`, with
> exactly one outlier (`0xD0`).** That is a stronger claim than the band version and it does not
> depend on where the low boundary was drawn. The `~3.1×` null ratio is unaffected either way
> (the permutation null uses the same predicate on both sides), but the *interpretation* should
> lead with the nibble fact and treat `[0x09,0x0F]` as the modal core within it, not as the field's
> range.

**`byte1` (the "style" byte): a small but not tiny enumerated set, not (yet) a proven record-kind
tag.** Pooled across the six non-Pool titles, `byte1` takes exactly **23 distinct values** (an
iterated, exact count, not an estimate) out of the 256 possible — small relative to the byte
space, dominated by `0x82` (562 of 1161 pooled records, 48.4%), `0x89` (190), `0xB1` (145), and
`0x01` (70), with the remaining 19 values contributing single- or low-double-digit counts each.
Cross-tabulating `byte1` against the cluster band on Champions of Krynn alone (`Gap4RecordShapeTests
.test_byte1_0x82_dominates_the_crosstab_but_is_not_exclusive`): `0x82` accounts for 96 of CoK's 215
records (44.7%), and those 96 are themselves 92/96 = 95.8% in-cluster — high, but not 100%, and
`0x85` (3 records) is the opposite extreme at 0% in-cluster. **This does not establish `byte1` as
a record-kind tag** — a small enumerated alphabet with an uneven, non-exhaustive relationship to
the cluster band is consistent with several explanations (a tile-style selector, a sub-record
flag, or something else); it only rules out "byte1 is effectively unconstrained," which the 23-of-
256 count and the dominant-value skew both measure directly.

**What this establishes and what it does not.** The gap==4 4-byte pattern is real,
cross-title-reproducible, and the middle byte's clustering in a small numeric band survives the
correct null by a consistent ~3×. **This is not a proof of record boundaries.** It has not been
shown that every `0xF0` participates in a gap==4 record (most do not — compare the 1161 pooled
gap==4 records above against the 977+1166+1020+1148+706+954 = 5971 pooled non-final escapes S6.1's
own table already measured: gap==4 records are a substantial minority, not the whole population),
nor what the 87%-99%-but-not-100% failures at `byte2` mean, nor what `byte3`'s variation encodes,
nor whether the small `byte1` alphabet is a semantic tag versus incidental. Tests:
`Gap4RecordShapeTests` in `tools/test_c64_walldef.py` (10 tests: 2 synthetic-shape, 1 synthetic
cluster-fraction, 7 real-corpus, all mutation-tested — see "Test discipline").

### 6.2 The exact-177 pile-up: explained for one title class, still open for the other

§3.1b left this "real and unexplained": 15 of 22 CoK ids have a section-2 maximum of exactly
`177` (`0xB1`). This round asks two new questions that were not asked before: does `177` appear
ONLY as the maximum, or does it appear more broadly and simply usually happen to BE the maximum
because it sits near the top of a shared range? And does the exact same phenomenon reproduce, with
its OWN title-specific value, in the other five titles with a section split?

> **CORRECTION (lead session, 2026-08-13) — two of the six rows below are tautologies, and the
> "nothing between `0x92` and `0xB0`" claim is refuted by this doc's own test.**
>
> `section2_high_band` clips at `HIGH_BAND_HI = 0xEF`. So for the two titles whose pile-up value
> *is* `0xEF`, "whenever present it is that id's own maximum" is true by construction — the same
> tautology class this doc already retracted once at §3 of `c64-walldef-structure.md`. And it is
> not a harmless one: **Buck Rogers and DoK section 2 really does use values up to `0xFF`.**
> Counting ids whose section 2 uses ≥5 distinct values *above* the band (`section2_bytes_above_band`
> — extent, not mere presence, so a lone stray `0xFF` does not qualify):
>
> | title | pile-up | range-extended ids | reading |
> |---|---|---:|---|
> | Buck Rogers | `239` | **7/7** | clipped — `0xEF` is where the analysis stops |
> | Death Knights of Krynn | `239` | **5/7** | clipped — same |
> | Secret of the Silver Blades | `177` | 2/15 | the 2 are `03`/`15` — see below |
> | Champions of Krynn | `177` | 0/22 | real ceiling (3 ids carry one stray mid-body `0xFF`) |
> | Curse of the Azure Bonds | `177` | 0/18 | real ceiling |
> | Gateway to the Savage Frontier | `177` | 0/14 | real ceiling |
>
> Consequences:
> - **The generalisation is from one title to four, not to six.** `0xB1` piling up below a real
>   `0xF0` ceiling is a genuine, reproduced regularity in CoK, CoAB, Gateway and Secret. DoK and
>   Buck Rogers have **no pile-up at all** — their byte range simply runs past the analysis window.
> - **Pooled "53 of 56 (94.6%)" is retracted.** Scored only where the pile-up value sits strictly
>   below the window ceiling, it is **44 of 47** — still real, still cross-title, honestly smaller.
>   The clipped half is 9/9 and could not have been anything else.
> - **The 192-glyph "density effect" explanation below is the same artifact restated.** "Presence
>   counts descend continuously from `239`" is what clipping a distribution at `0xEF` looks like.
>   The conclusion (DoK/Buck have no special code at `239`) stands; the evidence given for it does
>   not.
> - **Secret's exceptions gain an independent second signature.** Its only two range-extended ids
>   are exactly `03` and `15` — the same pair the glyph-count cross-check names — derived here from
>   byte values alone. That strengthens the 150-glyph reading below rather than weakening it.
> - **"Nothing between `0x92` and `0xB0` (a genuine 30-value gap)"** in the 50-glyph bullet below
>   is false, and `test_177_is_not_isolated_from_145_by_presence_count_alone` already says so in
>   its own docstring: `0x97` is present in 10 of 22 CoK ids. The band is a measured *trough*
>   (max presence 10, against `177`'s 16), not empty. The isolation argument survives on the
>   trough; the "empty" wording does not.
>
> Pinned by `test_the_0xef_pileup_is_an_artifact_of_the_bands_own_ceiling` and
> `test_presence_implies_max_only_where_the_band_is_not_clipped`.

**Generalises cleanly to all 6 titles with a section split** (`title_pileup_value` — the mode of
`title_max_values`, i.e. the single value that is most often each id's own section-2 maximum) —
*see the correction box: two of these six rows are window artifacts*:

| title | pile-up value | pile-up count / ids with split | present anywhere / ids with split | present ⟹ is max |
|---|---|---:|---:|---:|
| Champions of Krynn | `177` (`0xB1`) | 15/22 | 16/22 | 15/16 |
| Curse of the Azure Bonds | `177` (`0xB1`) | 13/18 | 13/18 | 13/13 |
| Gateway to the Savage Frontier | `177` (`0xB1`) | 8/14 | 8/14 | 8/8 |
| Secret of the Silver Blades | `177` (`0xB1`) | 8/15 | 10/15 | 8/10 |
| Death Knights of Krynn | `239` (`0xEF`) | 3/7 | 3/7 | 3/3 |
| Buck Rogers | `239` (`0xEF`) | 6/7 | 6/7 | 6/6 |

Pooled: **whenever a title's pile-up value is present in an id's section 2 at all, it is that id's
own maximum in 53 of 56 cases (94.6%)** — a real, falsifiable, cross-title regularity, not a
CoK-only coincidence. The pile-up value is a **title-CLASS** property, not a per-file one: the
four 50-glyph titles (CoK, CoAB, Gateway, Secret — see `c64-wallset-format.md`'s glyph-count
table) all pile up at exactly `177`; the two 192-glyph titles (DoK, Buck Rogers) pile up at `239`,
one below the `0xF0` sentinel.

**But the underlying reason is different for the two classes, and only one of them is a genuine
mystery.** `value_presence_counts` (how many ids' section 2 contains each value at all) shows why:

- **192-glyph titles: `239` is NOT isolated — it is simply the top of a smoothly, densely
  populated range.** Checking DoK and Buck Rogers directly, presence counts descend gradually and
  continuously from `239` down through `220`+ with no gap (DoK: `239`=3/7, `238`=3/7, `237`=5/7,
  `236`=5/7, ...; Buck Rogers: `239`=6/7, `238`=6/7, `237`=7/7, `236`=7/7, ...). This matches
  `c64-walldef-structure.md` §3's already-established `gap_below_sentinel` finding that 192-glyph
  titles are flush against `0xF0` (gap 0, or DoK `03`'s lone exception at 34) — these titles
  simply have enough distinct tile codes that their real data band reaches the practical ceiling.
  **Not a special code — a density effect.** Trivial, once checked.
- **50-glyph titles: `177` genuinely IS isolated, and sits at only middling popularity, not the
  top of a smooth decay.** Direct inspection of CoK's per-value presence counts (`value_presence_counts`)
  shows a real, sharply-decaying "shared core" from `0x82`-`0x91` (present in 7-22 of 22 ids,
  smoothly falling), then a measured **trough between `0x92` and `0xB0`** (present in at most 10 of 22 ids, at `0x97`
  — NOT empty; see the correction box), then `177` at 16/22 — **the same presence count as `145`
  (`0x91`)**, the value immediately below the gap, which sits inside the smooth decay with no
  isolation at all. So `177` is not "the next most popular value in a ranked list" (`145` already
  holds that exact popularity with none of the isolation); it specifically sits alone, moderately
  common, in an otherwise-empty band far above the ordinary per-style tile-code range. This is
  consistent with (not proof of) `177` being a distinct reserved/default code reused by most — but
  not all — wall styles, structurally unlike an ordinary tile index. **Genuinely still open.**

**The 2-of-22 CoK exceptions and Secret's 2-of-15 exceptions are NOT the same phenomenon.**
Cross-checked against each exception id's own glyph count (`c64_wallset.inventory`, matching
`c64-walldef-structure.md`'s `NibbleCeilingIsolationTests` convention):

- Secret's two ids that exceed `177` (`03`→`238`, `15`→`239`) are **exactly its two 150-glyph
  "elaborate" areas** (already documented in `c64_walldef.py`'s own module docstring) — fully
  explained, a glyph-count effect like the 192-glyph titles above, not a new mystery.
- CoK's two exceptions (`04`→`187`, `17`→`203`) are **both ordinary 50-glyph areas** — ruling out
  the glyph-count explanation for them specifically. `17` does not even contain `177` at all
  (jumps straight to its own higher band); `04` contains `177` but is topped by `187`. These two
  remain a genuine, smaller (2 of 22, not 15 of 22) unexplained residual.

### 6.3 The shared-prefix lead generalises, and 37 is not exceptional

S4 found DoK `WALLDEF01`/`WALLDEF05` sharing a 37-byte prefix and reported it as a singleton lead
("no other DoK pair shares more than 2 leading bytes"), explicitly asking whether it holds in
other titles. It was never checked against them. `pairwise_lcp` (exhaustive per-title pairwise
longest-common-prefix, `longest_common_prefix`) plus `max_pairwise_lcp` answer this directly, and
each real per-title maximum is checked against its own histogram-preserving-shuffle null
(`shuffle_bytes`, same construction as §6.1) to rule out the marginal-distribution false positive:

| title | max pairwise LCP | pair(s) | null max (10 shuffled trials, mean / best) |
|---|---:|---|---:|
| Champions of Krynn | 14 | `03`/`0E` | 1.1 / 2 |
| Death Knights of Krynn | **37** | `01`/`05` | 0.5 / 1 |
| Buck Rogers | **67** | `04`/`07`, `04`/`0D`, `07`/`0D` (all three pairwise, a 3-way group) | 0.6 / 2 |
| Curse of the Azure Bonds | **155** | `02`/`09` | 1.1 / 2 |
| Gateway to the Savage Frontier | **1232** | `03`/`1F`, `03`/`1F.`, `1F`/`1F.` (full-length match) | 1.2 / 2 |
| Pool of Radiance | 3 | `07`/`16` | 1.0 / 1 |
| Secret of the Silver Blades | 2 | 41 tied pairs | 0.7 / 2 |

Every real maximum clears its own null by a wide margin except Pool of Radiance and Secret of the
Silver Blades, whose maxima (3 and 2) sit at or barely above the null's own best-of-10 — **for
those two titles specifically, the "longest shared prefix" is not distinguishable from chance**,
an honest negative, not a weak positive.

**37 is not exceptional — it is smaller than 3 of the other 6 titles' own maxima.** CoAB (`02`/`09`,
155 bytes, diverging afterward — real lengths 1221 vs 1123, so not simply two copies of the same
short file) and Buck Rogers (`04`/`07`/`0D`, a genuine **three-way** group, all three pairwise
scoring exactly 67, diverging at byte 67 with different bytes each — `87`/`81`/... — and different
total lengths 2878/2339/2218) both exceed DoK's 37 substantially. **Gateway's `03`/`1F`/`1F.` case
is a different, stronger phenomenon, not a long-prefix lead at all: all three ids are
byte-identical for their ENTIRE 1232-byte body**, verified directly (`03 == 1F`: `True`, `1F ==
1F.`: `True`). `1F.` (trailing dot) is a genuine distinct directory entry on Gateway's Side 4 disk
image (`WALLDEF1F.`, confirmed against the raw directory listing, not a suffix-parsing artifact),
so this is three different area ids on the same title genuinely sharing one complete wall-style
definition, not a template-then-diverge case. CoK and Pool/Secret's small maxima (14 and 2-3)
show the shared-prefix phenomenon does NOT generalize everywhere at DoK's scale, even though where
it appears (DoK, CoAB, Buck Rogers, Gateway) it is real and well above chance.

## 7. What is still open, and the sharpest next hypothesis

The consumer routine remains unlocated (same status as `c64-wallset-format.md` §3.4/§3.5).

Round 6 narrowed, but did not close, three fronts: (1) the escape-operand scheme is real for a
minority of `0xF0` occurrences and refuted as a uniform rule — the next move is separating the
two apparent record kinds (count-like vs. style-byte-like) rather than treating every escape the
same way, possibly keyed off the DoK `03` 4-byte local pattern and the structure doc's own lag-4
finding; (2) the `177`/`239` pile-up is a solved density effect for 192-/150-glyph areas and a
still-open, narrower (2 of 22 CoK ids) reserved-code candidate for the 50-glyph majority; (3) the
shared-prefix/full-duplicate phenomenon is real and title-dependent (strong in DoK/CoAB/Buck
Rogers/Gateway, absent in CoK/Pool/Secret) and worth a semantic read once record boundaries are
known — Gateway's exact 3-way full-body duplicate is the most concrete, immediately-actionable
lead of the three, since it needs no record-boundary theory at all to be useful (it says three
Gateway areas reuse one wall style byte-for-byte).

**Lead session (2026-08-13) adds a fourth, still-open front:** the gap==4 4-byte pattern (§6.1a)
is now corpus-wide-measured (1161 records, all 7 titles checked) rather than a one-file
anecdote, and its middle byte's clustering in `[0x09, 0x0F]` clears the correct position-preserving
permutation null by a consistent ~3× in all six non-Pool titles. This sharpens front (1) — it is
concrete evidence FOR "some escapes carry a distinguishable structured 4-byte record" — but does
not resolve it: gap==4 records are a minority of all non-final escapes (1161 of 5971 pooled,
~19.4%), the `byte1` "style" alphabet is small (23 values, pooled) but its relationship to the
cluster band is uneven rather than a clean tag, and nothing here identifies what a non-gap==4
escape's structure is. The next move is the same one §6.1 already named: separate the escape
population into its distinct kinds rather than continuing to treat every `0xF0` uniformly.

> **DONE in round 8 (2026-08-13) — see §9.** That next move was executed and the answer is that
> `0xF0` marks **many** structured record kinds. Width 4 is not unique and is not even the
> commonest class (width 3 is, 1426 vs 1161); 15 headline (width, slot) cells across widths 2-8
> clear a 2× bar over the same position-preserving null in 6 of 6 titles; and the byte after the
> escape turns out to be a record-kind tag whose `op1 → width` map generalises across titles
> (`0xB1` → width 4 in 145 of 145 pooled escapes). §9.6 lists precisely what is still not
> established.

## 8. Task session (2026-08-13): CoK's two 177-pile-up exceptions, and Gateway's 1232-byte triple duplicate

Two small, bounded questions left open by §6.2 and §6.3. Both re-derived directly from real
bytes (`Section2TrueMaxTests`, `SingletonMaxSweepTests`, `CrossSideDuplicateIdTests`,
`FullBodyDuplicateGroupTests`, `GatewayGeoLayoutTests`, `DotSuffixSweepTests` in
`tools/test_c64_walldef.py`, 28 tests). New functions in `tools/c64_walldef.py`:
`section2_true_max`, `section2_bytevalue_count`, `section2_singleton_max_ids`,
`iter_c64_prg_files`/`c64_prg_inventory` (generic prefix versions of the WALLDEF-only
readers), `cross_side_duplicate_ids[_from_files]`, `full_body_duplicate_groups`,
`geo_ids_present`/`geo_id_universe`/`walldef_ids_without_matching_geo`,
`dot_suffixed_prg_names`.

### 8.1 Q1 — CoK ids 04 and 17: counts verified, band edges audited, no unifying mechanism found

**The task brief's own counts, re-derived directly:** id `04` section 2 has `0xB1` 3×, `0xBB`
1× (`section2_bytevalue_count`); id `17` has `0xB1` 0×, `0xB9` 1×, `0xCB` 1× — both match the
brief exactly (`test_id04_and_id17_byte_counts_match_the_task_briefs_quoted_figures`).

**Mandatory band-edge audit (rule 1).** `section2_high_band`'s in-window maximum is a scan
result, not necessarily the id's true maximum — the exact class of error already retracted
twice in this doc (`0xF0` round 5, `0xEF` round 6). Checked directly with
`section2_bytes_above_band`/`section2_true_max`:

| id | in-window max (`≤0xEF`) | bytes strictly above `0xEF` | TRUE maximum |
|---|---:|---|---:|
| `17` | `0xCB` (203) | **none** | `0xCB` (203) — a real ceiling |
| `04` | `0xBB` (187) | `0xFF` ×2 | **`0xFF` (255)** |

**`17`'s reported 203 survives the audit untouched — zero bytes fall above the window, so it
is genuinely this id's ceiling, not a window artifact
(`test_id17s_in_window_max_is_its_real_max_zero_bytes_above_the_band`).** **`04`'s reported
187 does NOT survive it.** Section 2 contains two `0xFF` bytes strictly above the analysed
band; `04`'s real maximum is `0xFF` (255), not `0xBB` (187)
(`test_id04s_in_window_max_is_NOT_its_real_max_the_audit_catches_it`). The brief's own framing
("id 04 (187 glyphs)") already reports the in-window figure, not the true one — corrected here
before any explanation is attempted, per rule 1.

**The "singleton extra code" framing does not distinguish the two exceptions from the other
20.** Direct count: **10 of CoK's 22 ids** have a section-2 maximum that occurs exactly once
in that id's own section 2 (`section2_singleton_max_ids`), including `06`, `09`, and `14`,
whose singleton maximum **is** the ordinary `0xB1` pile-up value itself
(`test_cok_04_and_17_are_two_of_ten_singleton_ids_not_a_unique_pair`). An id piling up at 177
with 177 occurring only once is the common case, not a signature. What actually distinguishes
`04`/`17` is that their singleton maximum sits **above** the title's own pile-up value —
"singleton" alone is not the discriminator; "singleton and above `0xB1`" is, and that is
close to a restatement of "is a pile-up exception" rather than an independent explanation.

**Swept all 7 titles for the same signature** (`EXPECTED_SINGLETON_COUNTS`,
`test_singleton_max_counts_per_title_all_seven`): Buck Rogers 3, Champions of Krynn 10, Curse
of the Azure Bonds 8, Death Knights of Krynn 2, Gateway to the Savage Frontier 8, Pool of
Radiance 0, Secret of the Silver Blades 8 — a singleton section-2 maximum is routine across
the whole corpus (present in every non-Pool title, and a plurality of ids in most of them),
not a CoK-specific or exception-specific oddity.

**Cross-reference against other per-id families found exactly one real, measurable feature —
and it only covers one of the two ids.** `cross_side_duplicate_ids` (new: reads the raw
directory listing per side, groups by filename suffix) shows **id `17` is the ONLY CoK
WALLDEF id copied byte-identically onto a second disk side** — `Champions of Krynn - Side
2.D64` and `Side 5.D64` both carry an identical `WALLDEF17`
(`test_cok_id_17_is_the_ONLY_cross_side_duplicated_id`). All other 21 ids, **including `04`**,
live on exactly one side. This is a real structural fact `17` has that the other 20 conforming
ids and `04` both lack — but it does not explain `04` at all, and nothing here establishes a
causal link between "copied to a second side" and "has an extra high byte above `0xB1`" (it
could as easily be an area that happens to need two access points in the dungeon, unrelated to
wall-style byte content).

**Checked whether "has a stray byte above the analysis band" itself predicts exception
status — it does not.** Exactly 3 CoK ids have any section-2 byte above `0xEF`: `04`, `14`,
`16` (`test_stray_ff_is_not_unique_to_the_pileup_exceptions`). Only `04` is a pile-up
exception; `14`'s in-window max is `0xB1` itself (conforms) and `16`'s is `0xA6` (conforms,
below `0xB1`). So having a stray high byte is not itself sufficient for exception status
either — `04`'s exception-hood and its stray `0xFF` co-occur, but the same stray-byte
condition is present in two ids that are *not* exceptions.

**Verdict: a clean negative on a unifying mechanism, as the task anticipated is
acceptable.** `17`'s status is now backed by an independent, real, measured feature no other
CoK id shares (unique cross-side duplication) — a genuine, falsifiable finding, even though it
doesn't explain the byte-value content itself. `04` has no comparable independent signature:
its only distinguishing facts are the two things already known (it exceeds `0xB1`, and its
true ceiling — now correctly identified as `0xFF`, not `0xBB` — sits well above every other
conforming id's range). The two ids do **not** share anything beyond both being pile-up
exceptions; they are not the same phenomenon as each other, any more than they are the same
phenomenon as Secret's two 150-glyph exceptions (§6.2, a solved glyph-count effect). This
residual (2 of 22 CoK ids) remains open.

### 8.2 Q2 — Gateway's 1232-byte triple duplicate: layout confirmed, duplication is common, the dot is a copy

**The disk-layout claim re-derived directly** (`geo_ids_present` + `iter_c64_walldef_files`
over all 8 real sides, `GatewayGeoLayoutTests`): `GEO03` lives only on Side 2; `WALLDEF03` /
`WALLSET03` live only on Sides 1 and 3 — the two never share a side
(`test_geo03_and_walldef03_are_never_on_the_same_side`). Side 4 carries `WALLDEF1F` /
`WALLDEF1F.` — but the task brief's own claim that Side 4 "ships … with no GEO file at all" is
**false as stated**: Side 4 hosts 4 real GEO files (`08`, `0B`, `0C`, `0D`), just none named
`GEO1F` (`test_side4_does_ship_geo_files_the_briefs_premise_is_wrong`). The correct, sharper
statement is title-wide, not side-local: of Gateway's 14 WALLDEF ids, exactly **`1F`, `1F.`,
and `24`** have no same-numbered GEO file **anywhere across all 8 sides**
(`walldef_ids_without_matching_geo`,
`test_1f_and_1f_dot_and_24_are_the_only_ids_with_no_matching_geo_anywhere`) — the other 11
duplicated/non-duplicated ids alike do have a same-numbered GEO area *somewhere* on the disk
set, just often on a different side than their own WALLDEF/WALLSET.

**Full sweep for cross-ID full-body duplication, all 7 titles
(`full_body_duplicate_groups`, `FullBodyDuplicateGroupTests`):** Gateway has **two** groups,
not one — `max_pairwise_lcp`'s single-longest-match framing in §6.3 only surfaced the
1232-byte `03`/`1F`/`1F.` trio and structurally could not see a second, shorter (1221-byte)
duplicate, `02`/`1E`. **Every one of the other 6 titles has zero such groups**
(`test_full_body_duplication_is_gateway_only_among_all_seven_titles`, all 7 checked and
enumerated): Buck Rogers, CoK, CoAB, DoK, Pool, Secret all score `[]`. Both Gateway groups are
also byte-identical on `WALLSET` (400-byte, 50-glyph bodies), not merely `WALLDEF`
(`test_gateway_duplicates_are_full_wall_STYLE_clones_wallset_matches_too`) — a complete
wall-style clone (glyph bank + wall definition together), not a WALLDEF-only coincidence.

**But the BROADER phenomenon the task asked about — "is cross-side duplication of
WALLDEF/WALLSET bodies common" — is common, and not Gateway-specific at all.**
`cross_side_duplicate_ids` (same id NUMBER, copied byte-identically onto a second disk side —
distinct from `full_body_duplicate_groups`'s "different id numbers, one shared body") finds at
least one such id in **6 of the 7 titles**, enumerated (`EXPECTED_CROSS_SIDE`,
`test_cross_side_duplication_is_common_not_gateway_specific`): Buck Rogers 2 ids, Champions of
Krynn 1 (`17` — the same fact §8.1 uses), Curse of the Azure Bonds 2, Death Knights of Krynn 3,
**Gateway 12 of its 14 ids** (far more widespread there than just the trio), Pool of Radiance
8, and only **Secret of the Silver Blades has none**. Every real cross-side duplicate found,
in every title, is byte-identical — none of the 26 pooled instances is a "copied but diverged"
case. **This directly answers the task's framing: cross-side copying of a wall style long
predates and is much more general than the specific 1232-byte trio** — Gateway is unusual only
in *degree* (12 of 14 ids vs. 1-3 in most other titles), not in *kind*.

**This decouples "duplicated" from "has no home GEO area."** Of Gateway's 12 cross-side-
duplicated ids, only 3 (`1F`, `1F.`, `24`) are also arealess by the title-wide GEO check above
— the other 9 (`03`, `04`, `05`, `07`, `08`, `09`, `0C`, `0F`, `10`) are copied to multiple
sides **despite** having a real, independently-numbered GEO area somewhere in the title. So
"this wall style has no home dungeon, hence it gets duplicated wherever needed" explains the
arealess trio specifically, but not the general cross-side-copy mechanism, which looks like an
ordinary asset-availability optimization applied to *any* wall style a side's dungeon areas
need, independent of whether that area's own map data also lives there.

**Dot-suffix: copy, not revision — but on N=1, reported honestly.** Sweeping **every** PRG
filename (not just wall-family) across **all 7 titles** for a trailing literal `.`
(`dot_suffixed_prg_names`, `DotSuffixSweepTests`) finds **exactly two** dot-suffixed names in
the whole corpus: `WALLDEF1F.` / `WALLSET1F.` (Gateway) and `SAVEBUCK.` (Buck Rogers — an
unrelated save-file placeholder with no non-dot counterpart to compare). The one wall-family
pair is byte-identical to its non-dot sibling on both `WALLDEF` and `WALLSET`
(`test_the_only_wall_family_dot_pair_is_a_copy_not_a_revision`), which is what "copy" predicts
and "revision" does not. **This is N=1** — no second wall-family dot-suffixed pair exists
anywhere in the 7-title corpus to check whether a revision-vs-copy split ever actually occurs,
so "the trailing dot always means an identical copy" cannot be claimed as a general rule from
this corpus, only observed to hold in the single case that exists.

**Net verdict:** the "one generic wall-style asset, duplicated onto whichever side needs it so
the game never demands a mid-dungeon disk swap" hypothesis is well-supported for the 3
GEO-less ids (`1F`/`1F.`/`24`) and consistent with (not proven by) the dot-suffix evidence, but
the *general* cross-side-duplication mechanism this session measured (6 of 7 titles, mostly
ids that DO have a home area) is a broader, ordinary engine behavior that the "no home area"
explanation only accounts for in Gateway's smallest subset.

## 9. Round 8 (2026-08-13): the escape taxonomy — gap==4 is **not** the only structured escape class

This round executes §7's own named next move verbatim: *"separate the escape population into its
distinct kinds rather than continuing to treat every `0xF0` uniformly."* The claim under test was
that **at least one escape class other than gap==4 carries a payload slot whose values cluster in
a narrow band above its own slot-permutation null by ≥2× in at least 4 of the 6 titles that
contain `0xF0`.** It is **ESTABLISHED, and by a wide margin** — 15 of 15 headline cells clear the
bar in 6 of 6 titles, 13 of those 15 in escape classes other than width 4.

New tooling in `tools/c64_walldef.py`: `escape_positions`, `escape_widths`,
`escape_width_histogram`, `EscapeRecord`, `escape_records`, `title_escape_records`,
`payload_class_purity`, `slot_band_count`, `slot_permutation_null_expectation`,
`slot_permutation_null`, `best_band_for_slot`, `escape_op1_width_pairs`, `op1_width_modal_map`,
`op1_width_modal_accuracy`, `op1_width_pairing_null`, `op1_width_crosstab`. Tests:
`EscapeTaxonomyPrimitiveTests` (12) + `EscapeTaxonomyCorpusTests` (14) in
`tools/test_c64_walldef.py` — suite now **127 passed, 1 skipped** (the skip is the same
pre-existing one, unrelated).

### 9.0 Conventions and the nulls, stated before any statistic

**`width` vs `gap`.** From this round on the module reports **`width` = the offset distance
between two consecutive escapes**, so a record's payload is `width - 1` bytes. §6.1's
`f0_operand_gap_pairs` reports `gap` = the byte count *strictly between*; `width == gap + 1`
exactly, pinned by `test_escape_widths_is_gap_plus_one`. Round 7's "gap==4 record" is `width == 4`
in this section's language (3 payload bytes) — the same records, byte for byte
(`test_escape_records_agrees_with_gap4_records_at_width_4`, 1161 compared, 0 mismatches).

**The null for every positional claim below** is `slot_permutation_null`, the width-general
version of round 7's `gap4_slot_permutation_null`: every real record is held fixed — same escape
positions, same payload byte *values* — and only **which payload byte lands in the slot under
test** is permuted (20 pooled trials, `random.Random(20260813)`). It destroys the slot-to-value
association and nothing else. A whole-body shuffle (`shuffle_bytes`) remains the wrong tool here
for the reason §6.1's correction box gives: it relocates the escapes and so changes which bytes
are a record's payload at all.

**The null's own ceiling, and why a "≥2×" bar is not width-neutral.** With payload length
`L = width - 1`, a perfectly slot-locked field scores real = 1.0 and null = 1/L, i.e. a **maximum
attainable ratio of ≈ L**. So the bar is *unreachable* at width 2 (`L == 1`: the permutation is
the identity, and the sampled null equals the real rate to the last digit — measured, not
argued: `test_width_2_ratio_is_pinned_at_1_by_construction` asserts `null == real` exactly on all
six titles) and only barely reachable at width 3 (`L == 2`; the best width-3 cell scores 1.90-2.03,
i.e. it is *at* its ceiling, and its 2-of-6 score is an artifact of the instrument, not a
statement about width-3 records). This is an analysis-instrument edge and is reported here rather
than buried, per the standing rule that a window's own edge is not a fact about the data.

**The family actually searched.** Bands were not hand-picked: for each of the **28** (width, slot)
cells over widths 2-8, `best_band_for_slot` searched all **3976** contiguous bands ≤16 values wide
over 0-255 → **111,328 (cell, band) combinations**. Bonferroni α at 0.05 over that family is
**4.49 × 10⁻⁷**. The pooled exact Poisson-binomial tail probability under the slot-permutation
null was computed for all 15 headline cells; the **weakest** of them is width 5 slot 1 at
`p = 2.04e-54` (`p × 111328 = 2.28e-49`), so every cell survives correction against the family
actually searched by more than forty orders of magnitude. (An earlier draft of this section
asserted "< 1e-110 for every headline cell" from the twelve cells that had been computed at that
point; running the remaining three refuted it — width 5 slots 1 and 2 and width 8 slot 2 sit at
`2.04e-54`, `3.16e-63` and `1.95e-56`. The claim is corrected here rather than left standing,
and the conclusion is unaffected.)

> **CORRECTION (round 9) — the family is 6× larger if per-fold LOO figures are quoted.**
> 111,328 is the family for *one* search. A true leave-one-title-out reruns that search once
> per held-out title, so quoting per-fold results searches **6 × 111,328 = 667,968**
> combinations (Bonferroni α = **7.49 × 10⁻⁸**). Per the standing rule that a correction
> factor is only as good as the family it names, the stricter number is the one to use
> whenever §9.3's true-LOO column is cited. It changes nothing: the weakest cell at
> `2.04e-54` gives `p × 667,968 = 1.36e-48`.
Selection bias is separately removed by **leave-one-title-out**: each band was chosen on the other
five titles and scored on the held-out one, so no per-title ratio quoted below was fitted to its
own bytes.

### 9.1 Step 1 — the escape-width histogram, all 7 titles, Pool asserted at zero

`escape_width_histogram(c64_walldef_inventory(title_dir))` over the de-duplicated inventories.
**7 titles iterated, 101 bodies iterated, 5971 pooled non-final escape pairs** — the loop counts
are asserted, not assumed (`test_escape_width_histogram_all_seven_titles`). The 5971 total and the
per-title totals reproduce §6.1's table exactly, which is the cross-check that this round's
population is the same one round 6 measured.

| width | Buck Rogers | CoK | CoAB | DoK | Gateway | Pool | Secret | **pooled** | share |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2 | 74 | 71 | 67 | 87 | 41 | **0** | 60 | 400 | 6.70% |
| **3** | 237 | 280 | 241 | 261 | 170 | **0** | 237 | **1426** | **23.88%** |
| 4 | 238 | 215 | 192 | 257 | 102 | **0** | 157 | 1161 | 19.44% |
| 5 | 49 | 101 | 74 | 67 | 59 | **0** | 70 | 420 | 7.03% |
| 6 | 85 | 110 | 92 | 84 | 49 | **0** | 76 | 496 | 8.31% |
| 7 | 49 | 52 | 43 | 42 | 31 | **0** | 42 | 259 | 4.34% |
| 8 | 35 | 75 | 52 | 49 | 35 | **0** | 48 | 294 | 4.92% |
| all | 977 | 1166 | 1020 | 1148 | 706 | **0** | 954 | 5971 | 100% |

**Pool of Radiance's zero is asserted explicitly on the raw bytes**, not inferred from an empty
histogram and not allowed to fall out of a loop: `test_pool_of_radiance_has_no_escapes_at_all`
iterates all **18** Pool bodies, counts them, and asserts `body.count(0xF0) == 0` for each. A loop
that silently skips a title reads as PASS.

**The first honest correction this round makes to the previous one:** round 7 promoted the
width-4 record to a corpus fact and §7 framed the remaining ~80% as "the codec's remaining
unknown." Width 4 is not even the modal escape class — **width 3 is, at 1426 records to width 4's
1161** (`self.assertEqual(pooled.most_common(1)[0], (3, 1426))`).

### 9.2 The payload alphabet is binary, and that fact bounds what counts as a record

`payload_class_purity` classifies every payload byte as **nibble** `[0x01, 0x0F]` or **high**
`[0x80, 0xFF]` — two predicates taken from already-established results (§2.1's void and round 7's
edge-independent "byte2 is nibble-valued"), not tuned here. Pooled over the six non-Pool titles:

| width | payload bytes | in the two classes | purity | leftovers |
|---:|---:|---:|---:|---|
| 2 | 400 | 399 | 99.75% | `0x64` ×1 |
| 3 | 2852 | 2806 | 98.39% | `0x14` ×21, `0x11` ×9, `0x12` ×7 |
| 4 | 3483 | 3482 | 99.97% | `0x00` ×1 |
| 5 | 1680 | 1680 | **100.00%** | — |
| 6 | 2480 | 2480 | **100.00%** | — |
| 7 | 1554 | 1551 | 99.81% | `0x42` ×2, `0x00` ×1 |
| 8 | 2058 | 2058 | **100.00%** | — |
| 9-15, 18, 20, 24 | — | — | **100.00%** each | — |
| 16, 17, 19, 21, 22, 23 | — | — | 97.73%-99.72% | value == the width itself (`0x11` at width 17, `0x13` at 19, `0x15` at 21 …) |
| **> 24** | **25865** | **18612** | **71.96%** | `0x40`/`0x42` — §2.2's own section-1 spikes |

> **CORRECTION (round 9).** The `16, 17, 19, 21, 22, 23` row read **97.81%**-99.72%; the true
> floor is **97.73%** (width 23), which is also why the prose below already said "≥97.7%" —
> the row and the sentence under it disagreed. 97.81% is width **21**, the second-lowest.
> The floor deserves its caveat rather than just its digits: width 23 has only **44** payload
> bytes in the whole six-title corpus, so 97.73% is **43 of 44** — one byte. Every width's
> count is now pinned individually by `test_payload_class_purity_is_pinned_per_width`, so a
> min quoted from an n=44 cell cannot be mistaken for a broad measurement again.

Both edges of the width-24 boundary are reported together, per rule 1: purity is ≥97.7% at every
width from 2 to 24 and **collapses to 71.96% above it**. That collapse is the evidence that the
250 spans wider than 24 are **not records** — they are `0xF0`-to-`0xF0` distances crossing
section 1, where `0x40`/`0x42` live. `ESCAPE_RECORD_MAX_WIDTH = 24` is therefore an *analysis
boundary with a measured justification on both sides*, not a claimed format constant.
(`test_payload_alphabet_is_two_classes_up_to_width_24_and_breaks_above_it`, 23 widths iterated,
count asserted.)

A pleasing side-effect: the handful of leftovers at widths 16-23 are almost all **the byte equal
to the width itself** — the same "operand == its own gap" population §6.1 measured at 2.1×-2.8×,
here visible as the only bytes in a short payload that are neither nibble nor high.

### 9.3 The result — 15 cells, 6 of 6 titles each, bands chosen leave-one-title-out

Ratios below are `real_in_band_rate / slot_permutation_null_rate` on the **held-out** title,
computed against the single frozen band shown in the `band` column, at null seed `20260813`.
`L` is the null's ceiling for that width (§9.0). **Read the two correction boxes underneath
this table before quoting any number from it.**

> **CORRECTION (round 9) — the quoted range was a single-seed artifact at BOTH ends.**
> This section's header used to claim **2.25×-7.13×**. That lower bound matched neither
> available derivation, and the upper bound was the largest value one RNG seed produced.
>
> `slot_permutation_null` **samples** the null, so every ratio in the table carries RNG
> noise; `slot_permutation_null_expectation` is the *same null in closed form*. Over the 90
> folds:
>
> | null used | range | fold at min | fold at max |
> |---|---|---|---|
> | **closed form (seed-free)** | **2.200×-6.276×** | w5 s2 / CoK | w8 s0 / Buck |
> | sampled, seed `20260813` (the table) | 2.123×-7.134× | w5 s1 / DoK | w8 s0 / CoK |
>
> The two ranges do not even peak on the same fold. Re-scoring single cells across 40 seeds,
> the spread is **15-28% of the mean** (w8 s0 / CoK: 5.411-7.134, mean 6.091 — the published
> 7.13 is that cell's sampled *maximum*). **The table's 2-decimal ratios are therefore not
> stable digits and must not be re-quoted to that precision.** The header now quotes the
> closed-form range.
>
> **The load-bearing claim is untouched.** Every fold clears 2× under *both* nulls, and the
> weakest fold (w5 s2 / CoK, closed-form 2.200) stays above 2× in **40 of 40** seeds
> (2.060-2.345). Pinned by `test_the_quoted_ratio_range_is_a_single_seed_artifact_at_both_ends`
> and `test_the_2x_claim_survives_every_null_seed_not_just_the_pinned_one`.

> **CORRECTION (round 9) — this table is frozen-band, not per-fold leave-one-out.**
> The caption says the bands were "chosen leave-one-title-out", which is how the *search*
> ran; but each cell then froze **one** band (`HEADLINE_CELLS`) and every title was scored
> against it. That is not the same thing: under a true per-fold LOO — band re-chosen on the
> other five titles for each held-out title — the band comes out different in **8 of 90
> folds**, spanning 7 cells (w4 s1, w4 s2, w5 s1, w5 s3, w7 s0, w8 s2, w8 s6), and three
> published values move:
>
> | cell | title | table (frozen) | true LOO | LOO band vs frozen |
> |---|---|---:|---:|---|
> | w5 s1 | Secret | 2.62 | **2.46** | `[0x0B,0x0F]` vs `[0x0B,0x0E]` |
> | w8 s2 | CoK | 3.24 | **3.08** | `[0x01,0x03]` vs `[0x01,0x08]` |
> | w8 s2 | Buck | 2.52 | **2.50** | `[0x01,0x03]` vs `[0x01,0x08]` |
>
> Again the claim survives — **all 90 true-LOO folds are still ≥2×** — so what was wrong was
> the caption's description of the method, not the finding. Pinned by
> `test_the_published_table_is_frozen_band_not_per_fold_leave_one_out`.

| width | slot | band | L | Buck | CoK | CoAB | DoK | Gateway | Secret | ≥2× |
|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 4 | 1 | `[0x06,0x0C]` | 3 | 3.05 | 3.10 | 3.13 | 3.14 | 3.02 | 3.24 | 6/6 |
| 4 | 2 | `[0x83,0x88]` | 3 | 3.02 | 2.72 | 2.78 | 2.25 | 2.75 | 2.79 | 6/6 |
| **5** | **0** | **`[0x02,0x02]`** | 4 | **3.84** | 3.48 | 3.29 | 3.68 | 3.34 | 3.69 | **6/6** |
| 5 | 1 | `[0x0B,0x0E]` | 4 | 2.87 | 2.25 | 2.15 | 2.12 | 2.25 | 2.62 | 6/6 |
| 5 | 2 | `[0x06,0x0A]` | 4 | 3.03 | 2.23 | 2.22 | 2.64 | 2.73 | 2.65 | 6/6 |
| 5 | 3 | `[0x82,0x88]` | 4 | 3.72 | 3.64 | 3.69 | 3.69 | 3.56 | 3.79 | 6/6 |
| **6** | **0** | **`[0x89,0x91]`** | 5 | 4.84 | 4.63 | 4.71 | 4.83 | **5.12** | 4.72 | **6/6** |
| **6** | **2** | **`[0x01,0x01]`** | 5 | 5.00 | **5.27** | 4.80 | 4.52 | 5.08 | 4.66 | **6/6** |
| 6 | 4 | `[0x83,0x85]` | 5 | 4.66 | 3.73 | 4.18 | 4.41 | 4.41 | 4.07 | 6/6 |
| **7** | **0** | **`[0x89,0x90]`** | 6 | 5.79 | 5.69 | **6.13** | 4.84 | 5.42 | 5.98 | **6/6** |
| **7** | **2** | **`[0x02,0x02]`** | 6 | 5.84 | 5.42 | 5.07 | **6.00** | 4.91 | 5.52 | **6/6** |
| 7 | 5 | `[0x83,0x87]` | 6 | 4.47 | 4.56 | 4.12 | 3.96 | 4.60 | 4.63 | 6/6 |
| **8** | **0** | **`[0x87,0x8F]`** | 7 | 5.98 | **7.13** | 4.10 | 5.52 | 5.94 | 5.15 | **6/6** |
| 8 | 2 | `[0x01,0x08]` | 7 | 2.52 | 3.24 | 2.62 | 3.32 | 3.28 | 2.90 | 6/6 |
| 8 | 6 | `[0x83,0x85]` | 7 | 6.42 | 5.53 | 3.61 | 6.15 | 4.91 | 5.20 | 6/6 |

Pinned by `test_every_headline_cell_clears_2x_in_all_six_titles` (15 cells × 6 titles, both loop
counts asserted; every title has ≥30 records at every width used).

**The two cleanest results are single-VALUE fields whose band edges are both empty**, so they do
not depend on where a boundary was drawn — the edge-independence round 7 had to retrofit onto its
`[0x09,0x0F]` band is native here:

- **Width-5 records' payload slot 0 is the literal byte `0x02`** in **381 of 420** pooled records
  (85.1%-95.9% per title). Pooled slot-0 histogram: `0x01` → **0**, `0x02` → **381**, `0x03` →
  **0**. Both immediate neighbours are empty.
  (`test_width5_slot0_is_the_single_literal_byte_0x02`.)
- **Width-7 records' payload slot 2 is the literal byte `0x02`** in **234 of 259** pooled records
  (83.7%-95.2% per title). Again `0x01` → **0**, `0x03` → **0**.
  (`test_width7_slot2_is_the_single_literal_byte_0x02`.) `best_band_for_slot` re-derives exactly
  `(0x02, 0x02)` from the real bytes with no hint (`test_best_band_for_slot_rediscovers_the_
  width7_field_on_real_bytes`), so the band is a search result, not a hand-picked window.

**An honest caveat about the search itself, asserted rather than left as prose.** Maximising a
*ratio* can push the chosen band **off the slot's own modal value**: width-4 slot 2's best band is
`[0x83, 0x88]`, which **excludes `0x82`** — that slot's single commonest value, 468 of 1161
records (`test_max_ratio_bands_can_exclude_a_slots_own_modal_value`). A selected band is a
maximally-discriminating window, **not a field's range**. Where a field's range matters, read
§9.4's class profile instead.

### 9.4 What the taxonomy actually looks like: an alternating two-class field layout

Rendering §9.2's two classes per slot (`N` = nibble in ≥90% of records in *every* one of the six
titles, `H` = high in ≥90% in every title, `.` = mixed) gives a compact picture that no single
band table does:

| width | n | slot 0 … slot L-1 |
|---:|---:|---|
| 2 | 400 | `N` |
| 3 | 1426 | `N .` |
| 4 | 1161 | `. N H` |
| 5 | 420 | `N . N H` |
| 6 | 496 | `. N . N .` |
| 7 | 259 | `H N N N N .` |
| 8 | 294 | `H N . N . N .` |
| 9 | 186 | `. N . N . . N .` |
| 10 | 150 | `. N . . . N . N .` |
| 11 | 123 | `. . . . . . N . N .` |
| 12 | 119 | `. N . . . . . N . N .` |

For the **even** widths the shape is an alternation `X n X n … X` — i.e. `F0 X (n X)^m` with
`m = (width - 2) / 2` — with the odd-numbered slots nibble-valued at 92%-100% pooled and the
even-numbered slots carrying the high/enumerated values. Widths 4, 6, 8, 10 and 12 all fit it.
The **odd** widths do not: width 5 is `[0x02] n n X` and width 7 is `X n [0x02] n n X`, both
built around the literal `0x02` field §9.3 isolates.

**This is a measured layout, not a decoded one.** It is stated as the shape the bytes have, and
deliberately not turned into a claimed field semantics — nothing here identifies what `X`, `n` or
`0x02` *mean*, and the mixed (`.`) slots are genuinely mixed rather than a class this round
failed to name.

### 9.5 The byte after the escape is a record-KIND tag

The sharpest taxonomy result, and the one that most directly answers §6.1's "the most likely
resolution is that `0xF0` marks (at least) two distinct kinds of record, not one."

**Null, stated first:** `op1_width_pairing_null` holds the real `op1` population and the real
`width` population fixed and permutes only **which `op1` is paired with which width** — the same
position-preserving construction `f0_operand_permutation_null` uses, for the same reason.

**Protocol:** a one-rule modal classifier (predict each escape's width as the modal width of its
own `op1`) is **trained on five titles and scored on the sixth**, so the map is never graded on
the data it was fitted to, and a pass requires the `op1 → width` mapping to be *shared across
titles*:

| held-out title | n escapes | real accuracy | pairing-null | ratio |
|---|---:|---:|---:|---:|
| Buck Rogers | 977 | **57.4%** | 19.0% | 3.03× |
| Champions of Krynn | 1166 | 53.5% | 15.9% | **3.37×** |
| Curse of the Azure Bonds | 1020 | 51.1% | 17.0% | 3.01× |
| Death Knights of Krynn | 1148 | 51.1% | 16.0% | 3.20× |
| Gateway to the Savage Frontier | 706 | 46.6% | 14.7% | 3.18× |
| Secret of the Silver Blades | 954 | 52.3% | 16.8% | 3.11× |

(`test_op1_predicts_the_escape_width_held_out_across_titles`; 6 folds, count asserted; the
train-set fallback width is 3 in every fold.)

Two individual rules are sharp enough to state on their own:

- **`op1 == 0xB1` ⇒ width 4, in 145 of 145 pooled escapes** — every occurrence, in every one of
  the six titles (Buck 33/33, CoK 33/33, CoAB 25/25, DoK 22/22, Gateway 13/13, Secret 19/19).
  `test_op1_0xb1_always_introduces_a_width4_escape` asserts `list(table) == [4]` per title, so a
  single exception anywhere would fail it.
- **`op1 == 0x91` ⇒ width 6 in 211 of 230 (91.7%)**, and the 19 exceptions are enumerated rather
  than rounded away: width 7 ×7, width 11 ×8, width 24 ×4
  (`test_op1_0x91_introduces_a_width6_escape_in_92_percent`).

**This partially explains §6.2's open `177` residual.** `0xB1` *is* 177 — the value §3.1b called
"real and still unexplained" and §6.2 left open for the 50-glyph title class. It is not an
ordinary tile index that happens to sit near a ceiling: it is an escape's record-kind tag. Nulled
properly (if `0xB1` fell uniformly over section 2, the fraction of `0xB1` bytes sitting
immediately after an escape would equal the fraction of section-2 positions that *are*
post-escape positions, `escapes / len(section2)`):

| title | section-2 bytes | escapes | base rate | `0xB1` in section 2 | of those, post-escape | rate | ratio |
|---|---:|---:|---:|---:|---:|---:|---:|
| Champions of Krynn | 8431 | 1188 | 14.09% | 33 | **33** | **100%** | 7.10× |
| Curse of the Azure Bonds | 7813 | 1038 | 13.29% | 25 | **25** | **100%** | 7.53× |
| Gateway to the Savage Frontier | 6360 | 720 | 11.32% | 13 | **13** | **100%** | 8.83× |
| Secret of the Silver Blades | 10470 | 969 | 9.26% | 24 | 19 | 79.2% | 8.55× |
| Buck Rogers | 15252 | 984 | 6.45% | 52 | 33 | 63.5% | 9.84× |
| Death Knights of Krynn | 15281 | 1155 | 7.56% | 55 | 22 | 40.0% | 5.29× |

5.29×-9.84× the base rate in all six titles, and **exclusively** an escape operand in three of
them — the three 50-glyph titles whose `177` pile-up §6.2 established as real. It is **not**
exclusive in DoK (22 of 55) or Buck Rogers (33 of 52), the two 192-glyph titles §6.2's correction
box already showed have no pile-up at all, so the split falls exactly along the title class
§6.2 identified. Pinned by
`test_0xb1_is_enriched_at_operand_positions_against_its_own_base_rate` (asserts ratio > 5.0 in all
six and exactly 3 titles at 100%).

### 9.6 What this establishes, and what it does not

**Established.**
1. `0xF0` is not a single-record-shape marker. Structured, cross-title-reproducible,
   well-nulled positional fields exist in escape classes of width 3, 4, 5, 6, 7 and 8 — the
   REFUTED branch of the task's claim ("every other gap width is at chance") is itself refuted.
2. Two exact single-value fields (`0x02` at width-5 slot 0 and width-7 slot 2) with empty band
   neighbours in both directions.
3. The escape payload alphabet is binary (nibble ∪ high) for every width ≤ 24, and demonstrably
   is not above 24 — which bounds the record population.
4. `op1` is a record-kind tag whose map generalises across titles, and `0xB1` (= 177) is one of
   its values, which is the first mechanistic role ever established for that byte.

**Not established.**
- **No semantics.** Nothing here says what any field *means*. The layout in §9.4 is a measured
  class pattern, not a decode.
- **No record boundary proof.** "Two consecutive escapes `width` apart" is still an *assumption*
  that the span between them is one unit. It is now a much better-supported assumption (the
  purity result and the per-slot fields both behave as a unit should) but it has not been
  independently verified against a consumer routine — which remains unlocated, exactly as §7 said.
- **The mixed slots stay mixed.** Width-6 slot 2 is `0x01` in only 45%-67% per title, width-8
  slot 4 in 51%-86%; the residue is real and unexplained.
- **`op1` explains about half the widths, not all.** 46.6%-57.4% held-out accuracy means roughly
  half of all escapes have an `op1` whose modal width is wrong for them. The tag is real; it is
  not a complete length field.
- **Width 2 was measured but cannot be tested** by this null (§9.0) — its 93%-100% nibble rate at
  slot 0 is reported as a description, never as a nulled result.
- **Widths 9-24 were measured for purity but not band-tested** (§9.3 stops at width 8, where every
  title still has ≥30 records). Widths 9+ have as few as 7 records in a title; "not checked" and
  "checked and found nothing" are different facts, and this is the former.

**The sharpest next move this round hands over:** the `op1 → width` crosstab is a *partial*
classifier. The escapes it gets wrong are the natural next population to separate — either `op1`
is one field of a two-byte tag (the width-4 records' `[0x82 | 0x89 | 0xB1 | 0x01]` slot-0 alphabet
of 23 values is small enough that a second discriminator should be findable), or the widths it
mispredicts are a distinct outer structure. Either way the question is now concrete and needs no
consumer routine and no trace.

## Test discipline (seen failing, then reverted)

Three independent mutations were applied to `tools/c64_walldef.py`, each run through
`tools/test_c64_walldef.py`, observed red, then reverted and re-confirmed green
(`27 passed`):

1. `DOS_RECORD_SIZE = 780` → `781`: turned 4 `DosOracleShapeTests` red (real DOS `WALLDEF1.DAX`
   decode no longer matches the mutated constant).
2. `void_range_stats`'s inclusive upper bound (`x <= hi`) → exclusive (`x < hi`): turned the
   synthetic `test_void_range_stats_counts_correctly` red (3 expected hits → 2 counted).
3. `control_run_test`'s match check short-circuited to always `True`: turned both the synthetic
   `test_control_run_flags_a_short_run` and the real-corpus
   `test_control_run_hypothesis_mismatches_dominate_dok` red (0 mismatches reported instead of
   the real 548-1119 per file).

Final run: `27 passed in 0.14s` (`C:\Python313\python.exe -m pytest tools/test_c64_walldef.py -q`;
the Git-Bash `python3` on this machine has no `pytest` installed — use the `C:\Python313\python.exe`
interpreter directly, same as the rest of this corpus's test suite already requires).

**Round 6 (2026-08-13) mutation checks, each run, observed red, then reverted:**

4. `f0_operand_gap_pairs`'s loop bound `range(len(positions) - 1)` → `range(len(positions))`
   (re-introducing the "last escape measured against nothing" bug this round's own docstring
   warns against): turned `Round6EscapeHypothesisTests.test_no_absurd_outlier_gaps_after_excluding_the_final_escape`
   red (a synthetic body with one early escape and a huge tail produced a gap in the thousands).
5. `longest_common_prefix`'s loop condition `a[i] == b[i]` → `a[i] != b[i]` (inverted): turned
   `Round6LcpMatrixTests.test_longest_common_prefix_synthetic` red (returns 0 on identical inputs
   instead of the input length).
6. `f0_walk_overrun`'s overrun check `run_end > n` → `run_end >= n` (off-by-one, tightened):
   turned `Round6EscapeHypothesisTests.test_walk_overrun_synthetic_exact_fit` red (a synthetic
   body engineered to consume exactly to the last byte now reports a spurious overrun).

Final round-6 run after the 2026-08-13 corrections: **63 passed, 1 skipped** (27 prior + 36 new — see `Round6EscapeHypothesisTests`,
`Round6PileupExplanationTests`, `Round6LcpMatrixTests`
in `tools/test_c64_walldef.py`;
`C:\Python313\python.exe -m pytest tools/test_c64_walldef.py -q`).

**Lead session (2026-08-13), `gap4_third_byte_distribution`/`gap4_records`/`gap4_slot_permutation_null`
mutation checks** (`Gap4RecordShapeTests`, 10 tests), each applied, run, observed red, then
reverted and re-confirmed green:

7. `GAP4_WIDTH = 4` → `5` (the exact mutation the task named: corrupt the gap-4 filter to
   gap-5): turned **8 of the 10** `Gap4RecordShapeTests` red at once, including both synthetic
   shape tests (the DoK-trace-shaped synthetic body now decodes to 0 records instead of 2) and
   `test_record_counts_per_title` (Champions of Krynn: 101 found vs 215 expected — every title's
   count changes, since almost no gap==5 pairs exist in this corpus).
8. `EXPECTED_COUNTS["Champions of Krynn"]` corrupted `215` → `214` (the task's named "corrupt one
   title's expected count" mutation): turned `test_record_counts_per_title` red (`215 != 214`) and
   nothing else — confirms the per-title assertions are independent, not silently OR'd together.
9. `gap4_slot_permutation_null`'s `rng.shuffle(triple)` call removed (the null becomes a no-op —
   `triple[1]` is always the record's real, un-permuted `byte2`): turned
   `test_byte2_clusters_far_above_the_slot_permutation_null` red (the "null" rate became
   identical to the real rate — the first title in iteration order, Buck Rogers, reported
   `null_rate = 0.9117647058823529`, exactly its own real 91.2% cluster fraction, failing the
   `null_rate < 0.35` assertion) — this is the mutation that most directly proves the test would
   have caught round 6's original defect (a null that fails to destroy the claimed relationship)
   had it been present here.
10. `Gap4Record`'s field order swapped at construction (`byte2`/`byte3` transposed:
    `body[pos+3]` written into the `byte2` slot and vice versa): turned **5 of the 10** tests
    red, including the synthetic shape test (caught immediately, by design — this is exactly the
    class of indexing bug a synthetic fixed-input test exists to catch before it reaches the real
    corpus).
11. `gap4_cluster_fraction`'s inclusive upper bound (`v <= hi`) → exclusive (`v < hi`): turned
    `test_byte2_clusters_far_above_the_slot_permutation_null` red on real data (Buck Rogers, the
    first title in iteration order, lost its 53 `byte2 == 0x0F` records from the count and its
    real fraction dropped from 91.2% to 68.9%, failing the `> 0.85` assertion) but did NOT turn
    the synthetic `test_gap4_cluster_fraction_synthetic` red, because that synthetic counter's
    only values (`0x0B`, `0x82`) are unaffected by moving the boundary at `hi = 0x0F` — an
    honest gap in that one synthetic test's own coverage, caught here only because a real-corpus
    test also exercises the same function.

Final lead-session run: **73 passed, 1 skipped** (63 prior + 10 new;
`C:\Python313\python.exe -m pytest tools/test_c64_walldef.py -q`). The 1 skip is pre-existing
(`Round6EscapeHypothesisTests.test_five_ids_do_reach_a_majority_the_doc_claimed_none_did`'s own
`checked < 7` guard against a 6-title list) and unrelated to this session's changes.

**Task session (2026-08-13), Q1/Q2 mutation checks** (`Section2TrueMaxTests`,
`SingletonMaxSweepTests`, `CrossSideDuplicateIdTests`, `FullBodyDuplicateGroupTests`,
`GatewayGeoLayoutTests`, `DotSuffixSweepTests`, 28 new tests over the 73 above), each applied
to the real `tools/c64_walldef.py` file, run, observed red, then reverted and re-confirmed
byte-identical to the pre-mutation file (`diff` against a saved copy) before moving to the
next:

12. `section2_true_max`'s sentinel exclusion (`if b != sentinel`) removed: turned 3 of 7
    `Section2TrueMaxTests` red — both synthetic "excludes the sentinel" tests (now return the
    sentinel `0xF0`/240 itself instead of the real data max, or a non-`None` value for a
    pure-sentinel section 2) and the real-corpus `test_id17s_in_window_max_is_its_real_max…`
    (id `17`'s reported max became `240` instead of the real `203`).
13. `section2_singleton_max_ids`'s `== 1` singleton check loosened to `>= 1`: turned all 3
    `SingletonMaxSweepTests` red, including the synthetic case (now reports a non-singleton
    max, `0x82` occurring twice, as if it were a singleton) and the real per-title counts.
14. `cross_side_duplicate_ids_from_files`'s `len(disks) > 1` filter loosened to `>= 1`: turned
    4 of 5 `CrossSideDuplicateIdTests` red, including both the "excludes unread files" synthetic
    (a single clean read now falsely reports as cross-side-duplicated) and the real CoK/
    corpus-wide checks (every single-side id is now wrongly reported as duplicated).
15. `full_body_duplicate_groups`'s `len(g) > 1` filter loosened to `>= 1`: turned all 4
    non-trivial `FullBodyDuplicateGroupTests` red, including the synthetic "no groups" case
    (now reports every singleton id as its own spurious "group") and the real Gateway
    two-group check (spurious extra singleton groups appended).
16. `walldef_ids_without_matching_geo`'s membership test flipped (`sid not in universe` →
    `sid in universe`): turned `test_1f_and_1f_dot_and_24_are_the_only_ids_with_no_matching_geo…`
    red (returned the 11 ids that DO have a matching GEO area instead of the 3 that do not).
17. `dot_suffixed_prg_names`'s `endswith(".")` check corrupted to `endswith("X")`: turned both
    `DotSuffixSweepTests` red (the real dot-suffixed names disappear from the sweep entirely,
    replaced by an unrelated `SOUNDFX` false match).
18. `iter_c64_prg_files`'s prefix filter (`e.name.startswith(prefix)`) removed entirely: turned
    7 tests red across `GatewayGeoLayoutTests` and `FullBodyDuplicateGroupTests` at once — this
    function backs both the GEO-file reads (Q2's disk-layout claims) and the generic-prefix
    `WALLSET` cross-check (`test_gateway_duplicates_are_full_wall_STYLE_clones…`), so corrupting
    it broke both consumers simultaneously, as expected for a genuinely shared primitive.

Each mutation was reverted and the file diffed byte-for-byte against a pre-mutation copy to
confirm a clean revert before the next mutation was applied — no two mutations were ever live
at once. Final task-session run: **101 passed, 1 skipped** (73 prior + 28 new;
`C:\Python313\python.exe -m pytest tools/test_c64_walldef.py -q -v` — run with `-v` and the
per-test list inspected, confirming none of the new real-corpus tests silently skipped; the
one skip is the same pre-existing one from the lead session, unrelated to this session).

**Round 8 (2026-08-13) escape-taxonomy mutation checks** (`EscapeTaxonomyPrimitiveTests` 12 +
`EscapeTaxonomyCorpusTests` 14, 26 new tests over the 101 above). Each was applied to the real
`tools/c64_walldef.py`, run, **observed red**, then reverted and the file re-checksummed against
a pristine copy (`md5sum`, identical) before the next was applied — no two mutations ever live at
once:

19. `escape_widths` made to include the final escape (appending `len(body) - pos[-1]`, i.e.
    reintroducing the "last escape measured against the body end" bug §6.1 warns about): **4 red**
    — all three synthetic width tests plus the real-corpus
    `test_escape_width_histogram_all_seven_titles` (per-title totals no longer 977/1166/…).
20. `escape_records`'s escape-position walk replaced by offset arithmetic (`body[p + width] ==
    sentinel`, no consecutiveness check — the exact bug `gap4_records`'s docstring warned would
    bite once widths > 4 were in play): **7 red**, including
    `test_escape_records_requires_true_adjacency`, the width-4 parity test against `gap4_records`,
    and all three headline real-corpus cells. This is the mutation that proves the round's central
    walk is actually load-bearing.
21. `slot_permutation_null`'s `rng.shuffle(t)` removed (the null becomes a no-op, reporting the
    real data as its own null): **4 red** —
    `test_slot_permutation_null_sampler_tracks_its_own_closed_form` and all three headline cells,
    whose ratios collapse to 1.00. Notably `test_width_2_ratio_is_pinned_at_1_by_construction`
    stayed green, which is correct and is the point of that test: at width 2 the shuffle *is* a
    no-op already.
22. `slot_permutation_null_expectation` normalised per record instead of per payload byte
    (`total += 1` rather than `total += len(r.payload)`): **4 red**, including the ceiling test
    (`ratio == L`) and `best_band_for_slot`'s synthetic — i.e. the closed-form null and the
    sampler are genuinely cross-checked against each other rather than sharing one bug.
23. `PAYLOAD_NIBBLE_HI` `0x0F` → `0x0E`: **1 red** —
    `test_payload_alphabet_is_two_classes_up_to_width_24_and_breaks_above_it` (width-2 purity fell
    from 99.75% to 92.5%). A narrow blast radius, as intended: that constant has exactly one
    consumer.
24. `op1_width_modal_map` picking the LEAST common width (`most_common()[-1]`) instead of the
    most common: first run turned only the **real-corpus** held-out test red (accuracy 4.3% vs the
    asserted >45%) — the synthetic passed, because every `op1` in it mapped to exactly one width
    and so could not distinguish most from least. **That gap was fixed rather than noted**: the
    synthetic now uses a deliberately non-unanimous `0x91` (7× width 6, 3× width 11), the mutation
    was re-applied, and it then turned **2 red** including the synthetic. Recorded in full because
    the first attempt is exactly the "synthetic that cannot fail" failure mode mutation testing
    exists to expose (compare mutation 11's honest note).
25. `escape_op1_width_pairs` reporting `gap` instead of `width` (an off-by-one between the two
    conventions §9.0 defines): **2 red** — both `op1 == 0xB1 ⇒ width 4` and
    `op1 == 0x91 ⇒ width 6` (they became width 3 and width 5).

Final round-8 run: **127 passed, 1 skipped** (101 prior + 26 new;
`C:\Python313\python.exe -m pytest tools/test_c64_walldef.py -q`, and re-run with `-v` with the
per-test list inspected to confirm all 26 new tests actually executed — none silently skipped).
The one skip is the same pre-existing one, unrelated.
