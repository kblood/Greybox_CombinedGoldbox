# C64 `WALLDEF`: an independent, DOS-format-blind structural attack

**Slice:** `walldef-structure`. **Method:** pure structural analysis of the raw bytes -- no
reference anywhere in this document or its companion tool/tests to the DOS `WALLDEF*.DAX`
format. A sibling slice attacks the same file using the DOS format as an oracle; this document
is the independent control, not a coordination point with that slice.

**Tools:** `tools/c64_walldef_struct.py` (analysis primitives + CLI), `tools/test_c64_walldef_struct.py`
(20 tests: 8 synthetic/no-corpus + 12 real-corpus, all passing -- see §6). Reuses
`c64_wallset.py`'s disk-inventory reader only for *reading files off disk*; none of this
document's own analysis logic depends on anything WALLSET-, DAX-, or DOS-specific.

**Corpus:** all seven C64 Gold Box titles under `D:\Games\Emulator\C64\Goldbox\`, 101 distinct
`(title, id)` WALLDEF bodies (22 Champions of Krynn, 18 Curse of the Azure Bonds, 15 Secret of
the Silver Blades, 7 Death Knights of Krynn, 14 Gateway to the Savage Frontier, 18 Pool of
Radiance, 7 Buck Rogers -- Countdown to Doomsday), matching the pairing census already
established in `c64_wallset.py`'s own module docstring.

---

## 0. TL;DR

Five findings, three positive (well-nulled) and two honest negatives:

1. **A period-2 (byte-parity) alternation is real and corpus-wide.** Adjacent same-parity
   bytes (lag 2, 4, 6, ...) repeat their value far more often than adjacent opposite-parity
   bytes (lag 1, 3, 5, ...) -- exceptionless across all 8 tested (odd-lag, next-even-lag)
   comparisons from lag 1 to 16, pooled over all 101 files, and independently reproduced in
   each of the 7 titles for lag 2 specifically. Two different nulls, each destroying a
   different half of the claim, both collapse it to baseline.
2. **A secondary, unresolved peak sits at lag 4** -- the single strongest lag in a 1-16 sweep,
   hinting at (not proving) a 4-byte record built from two interleaved 2-byte fields.
3. **The `0xF0` byte-ceiling (already known from prior rounds) is exceptionless, not just
   common.** In every one of 63 bodies whose own maximum byte is `0xF0`, NO other byte anywhere
   in the body has high nibble `0xF` -- `0xF0` is a reserved sentinel, not the tail of a
   spread-out distribution.
4. **The terminator byte is an exceptionless, title-level binary choice**: every body's last
   byte is exactly `0x00` (83/83 files, six titles) or exactly `0xFF` (18/18 files, Pool of
   Radiance only). Zero exceptions in 101 files.
5. **Two honest negatives.** `0xF0`'s own positions do NOT respect the period-2 parity split
   (49.7% even / 50.3% odd -- a real, reported non-finding). And no single stride-2 or stride-4
   *column* behaves as a flat index into the partner WALLSET's glyph bank -- every column's
   in-range fraction sits within a few percentage points of every other column, all near the
   chance floor, for every title checked.

None of this decodes WALLDEF. It narrows the field-layout search from "unknown binary blob" to
"very likely built from 2-byte fields, with a title-level terminator convention and a reserved
sentinel byte" -- and rules out the two simplest possible readings (flat glyph-index array;
uniform record size with no internal structure).

---

## 1. Method and the null-construction discipline

Every positive claim below is checked against **two independent nulls**, each destroying a
different specific piece of the claimed structure while preserving everything else:

- **Record-order shuffle** (`shuffle_record_order`, `Null A`): split the body into `stride`-byte
  chunks and shuffle their ORDER, keeping each chunk's own two (or more) bytes glued together.
  Preserves: which bytes are paired within one record, and each record's own value pair.
  Destroys: sequential/positional adjacency between one record and the next.
- **Within-column shuffle** (`shuffle_within_column`, `Null B`): split the body into `stride`
  columns by `position mod stride` and shuffle each column's values independently. Preserves:
  each column's own marginal (frequency) distribution exactly. Destroys: any correlation between
  one row's value in a column and the NEXT row's value in that same column.

A genuine "value at parity *p* tends to repeat at the next same-parity position" effect must
survive in the real data and vanish under **both** nulls. A false positive driven purely by a
skewed byte-value histogram would survive in the nulls too (both nulls keep the marginal
distribution intact). This is the same "keep everything except the claimed structure" discipline
`c64_wallset_render.structure_null_controls()` already established for `WALLSET`'s glyph-mode
question, applied fresh here.

Both nulls are seeded (`NULL_SEED = 20260812`), so every number below is exactly reproducible via
`tools/c64_walldef_struct.py --root <path> --lag-sweep` etc.

**The statistics were also proven on synthetic ground-truth data before being trusted on the
real corpus** (`SyntheticStructureDetectionTests` in the test file, no corpus needed): a
hand-built body with a genuinely planted stride-2 structure (an 8-value "field A" that repeats
60% of the time record-to-record, paired with an independent, disjoint-range "field B") clears
both nulls by >3x; a pure-random control body with NO planted structure shows real and null
landing within 0.01 of each other at every tested lag. This is the `RandomControlTests` pattern
from the WALLSET render module, reapplied to this module's own machinery before it touched real
data.

---

## 2. Finding 1-2: the period-2 alternation, and the secondary lag-4 peak

### 2.1 The full lag-1..16 sweep, pooled over all 101 files

```
$ python tools/c64_walldef_struct.py --root "D:/Games/Emulator/C64/Goldbox" --lag-sweep

  lag= 1  real=0.0443  record_order_null=0.0394  within_column_null=0.0399  ratio=1.12x
  lag= 2  real=0.1618  record_order_null=0.0409  within_column_null=0.0414  ratio=3.95x
  lag= 3  real=0.1182  record_order_null=0.0396  within_column_null=0.0401  ratio=2.99x
  lag= 4  real=0.1953  record_order_null=0.0412  within_column_null=0.0406  ratio=4.74x
  lag= 5  real=0.0875  record_order_null=0.0392  within_column_null=0.0403  ratio=2.23x
  lag= 6  real=0.1327  record_order_null=0.0399  within_column_null=0.0396  ratio=3.32x
  lag= 7  real=0.0932  record_order_null=0.0401  within_column_null=0.0396  ratio=2.33x
  lag= 8  real=0.1406  record_order_null=0.0393  within_column_null=0.0403  ratio=3.57x
  lag= 9  real=0.0890  record_order_null=0.0386  within_column_null=0.0387  ratio=2.30x
  lag=10  real=0.1022  record_order_null=0.0400  within_column_null=0.0390  ratio=2.56x
  lag=11  real=0.0953  record_order_null=0.0379  within_column_null=0.0385  ratio=2.51x
  lag=12  real=0.1113  record_order_null=0.0395  within_column_null=0.0405  ratio=2.82x
  lag=13  real=0.1038  record_order_null=0.0402  within_column_null=0.0400  ratio=2.58x
  lag=14  real=0.1096  record_order_null=0.0386  within_column_null=0.0397  ratio=2.84x
  lag=15  real=0.1139  record_order_null=0.0408  within_column_null=0.0390  ratio=2.79x
  lag=16  real=0.1159  record_order_null=0.0376  within_column_null=0.0393  ratio=3.08x
```

Both nulls track each other closely at every lag (as they should: for genuinely unstructured
data they measure the same thing two different ways) and sit at 0.037-0.041 throughout -- close
to, but not identical to, the raw index-of-coincidence floor, because both nulls preserve
finite-sample per-record/per-column skew that a theoretical "flat" null would not.

**The even/odd pairing is exceptionless.** Pairing each odd lag with the next even lag
(1&2, 3&4, 5&6, ..., 15&16 -- 8 pairs), the even member's `real` value is strictly higher in
**8 of 8** pairs:

| odd lag | real | even lag | real | even wins? |
|---|---:|---|---:|---|
| 1 | 0.044 | 2 | 0.162 | yes |
| 3 | 0.118 | 4 | 0.195 | yes |
| 5 | 0.088 | 6 | 0.133 | yes |
| 7 | 0.093 | 8 | 0.141 | yes |
| 9 | 0.089 | 10 | 0.102 | yes |
| 11 | 0.095 | 12 | 0.111 | yes |
| 13 | 0.104 | 14 | 0.110 | yes |
| 15 | 0.114 | 16 | 0.116 | yes |

This is checked directly, not eyeballed, by
`PeriodTwoAlternationTests.test_even_lag_exceeds_the_preceding_odd_lag_for_every_pair_from_one_to_sixteen`.
The margin shrinks with distance (a real, decaying-with-distance local correlation, not a flat
comb), but never inverts across the tested range.

**Lag 4 is the single strongest lag in the sweep** (0.195 real, 4.74x its null -- both the
highest absolute value and the highest ratio of any lag tested). This is flagged as a real,
sharper, but NOT independently resolved lead: it is consistent with a 4-byte record built from
two interleaved 2-byte sub-fields (which would explain why lag 2 is ALSO elevated, second only
to lag 4, without lag 2 needing to be the "true" record boundary on its own) -- but it is equally
consistent with the period-2 signal simply being strongest at its second harmonic in this
particular data. **Not adjudicated by this round.**

### 2.2 Per-title reproduction (rule 2: both/all titles, not one)

| Title | n | lag1 real | lag1 null | lag2 real | lag2 null (RO / WC) | lag4 real | lag4 null |
|---|---:|---:|---:|---:|---|---:|---:|
| Champions of Krynn | 22 | 0.001 | 0.035 | 0.111 | 0.036 / 0.038 | 0.163 | 0.039 |
| Curse of the Azure Bonds | 18 | 0.003 | 0.037 | 0.138 | 0.036 / 0.037 | 0.191 | 0.037 |
| Secret of the Silver Blades | 15 | 0.003 | 0.035 | 0.129 | 0.036 / 0.039 | 0.179 | 0.037 |
| Death Knights of Krynn | 7 | 0.003 | 0.029 | 0.127 | 0.029 / 0.029 | 0.186 | 0.030 |
| Gateway to the Savage Frontier | 14 | 0.003 | 0.037 | 0.137 | 0.035 / 0.037 | 0.181 | 0.037 |
| Pool of Radiance | 18 | **0.237** | 0.062 | 0.318 | 0.065 / 0.061 | 0.277 | 0.061 |
| Buck Rogers -- Countdown to Doomsday | 7 | 0.001 | 0.032 | 0.136 | 0.032 / 0.035 | 0.173 | 0.034 |

Lag 2 clears **both** nulls by at least 2x in every one of the seven titles individually
(`PeriodTwoAlternationTests.test_lag_two_clears_both_nulls_in_every_title` asserts this per
title, not pooled). Lag 1 is suppressed far below its own null in **six** of the seven titles
(real is 3-35x *below* null) -- but **Pool of Radiance is a documented exception**: its lag-1
real value (0.237) sits nearly 4x *above* its own null, the opposite direction from the other
six titles.

### 2.3 Pool of Radiance's lag-1 elevation is a real, separate signature, not noise

Directly inspecting one Pool of Radiance body (id `01`, 1118 bytes) for consecutive equal-byte
runs finds genuine short runs -- e.g. a literal `99, 99, 99` and `76, 76, 76` in the first 40
bytes -- and a corpus-wide run-length histogram for that file with 780 runs over 1118 bytes
(mean run length 1.43, but 93 runs of length >=3, one of length 30, one of length 49). The other
six titles do not show this: their lag-1 suppression means genuine same-value adjacent bytes are
rare, not common. Combined with §3's terminator-byte finding (Pool is also the only
`0xFF`-terminated title), **Pool of Radiance's WALLDEF looks like it uses a genuinely different
internal convention from the other six titles**, not just a different content/scale. This
matches Pool of Radiance's standing reputation elsewhere in this project as the outlier format
(`CLAUDE.md`'s own note that Pool of Radiance needs "a 4th, distinct, unsolved format" on the
Amiga GLIB side). Reported here as a fact about this specific title, not generalized to "some
titles are just noisier."

---

## 3. Finding 3: the `0xF0` ceiling is exceptionless

Prior work (see `docs/engine/research/c64-wallset-format.md` §7.5) already noted that 50-glyph
titles' WALLDEF bodies almost universally max out at exactly `0xF0` (240). This round tests the
STRONGER, more specific claim directly: in every body whose own maximum byte equals `0xF0`, does
any OTHER byte in that body have high nibble `0xF` (i.e. lie in `0xF1`-`0xFF`)?

```
$ python tools/c64_walldef_struct.py --root "D:/Games/Emulator/C64/Goldbox" --nibble-ceiling
loaded 101 WALLDEF records across 7 titles
nibble ceiling: checked=63 violations=0
```

**63 bodies checked (19 Champions of Krynn, 18 Curse of the Azure Bonds, 12 Secret of the
Silver Blades, 14 Gateway to the Savage Frontier -- matching the per-title max-byte census
already in the WALLSET doc), zero violations.**

> **CORRECTION (lead session, 2026-08-12) — as posed, this test cannot fail.** "In every body
> whose own maximum byte equals `0xF0`, does any other byte lie in `0xF1`-`0xFF`?" is a
> tautology: if the maximum is `0xF0`, nothing exceeds `0xF0`. The 63/0 result is arithmetic,
> not evidence, and the conclusion drawn from it — that ordinary data is "strictly confined to
> `0x00`-`0xEF`" and `0xF0` is "isolated" — does not follow from it. Per the project's standing
> rule, a probe that has no failure mode is not a probe.
>
> **The non-vacuous claim underneath it is real, and it is better.** Ask instead how wide the
> run of *unused* byte values immediately below `0xF0` is — i.e. is there a genuine gap
> separating `0xF0` from the top of the data band? That can fail, and it does:
>
> | title | bodies with `0xF0` | gap below `0xF0` (min / max / mean) |
> |---|---:|---|
> | Champions of Krynn | 22 | 34 / 84 / 47.9 |
> | Curse of the Azure Bonds | 18 | 34 / 80 / 57.7 |
> | Gateway to the Savage Frontier | 14 | 40 / 76 / 63.4 |
> | Secret of the Silver Blades | 15 | **0** / 84 / 41.6 |
> | Death Knights of Krynn | 7 | **0** / 34 / 4.9 |
> | Buck Rogers | 7 | **0 / 0 / 0.0** |
> | Pool of Radiance | 0 | *(no body contains `0xF0` at all)* |
>
> So `0xF0` is genuinely isolated in three titles and **not isolated at all in Buck Rogers**,
> where `0xEF` is populated in all seven bodies. The isolation is not a property of `0xF0`.
>
> **What it is a property of: the area's glyph count.** Pairing each body with its own
> `WALLSET` and excluding Pool of Radiance (which has no `0xF0` and terminates `0xFF` — a
> different scheme throughout, see §2.3):
>
> | glyph count | gap > 0 | gap = 0 |
> |---|---:|---:|
> | 50 | **67** | 0 |
> | 150 | 0 | 2 |
> | 192 | 1 | 13 |
>
> `gap > 0 ⟺ 50 glyphs`, with **exactly one exception in 83 bodies**: Death Knights of Krynn
> id `03` (192 glyphs, gap 34). That single named outlier is what makes this a finding rather
> than a restatement — it is falsifiable and it very nearly failed.
>
> This *supports* the sentinel reading while explaining the confound: a 50-glyph area's data
> band never climbs near `0xF0`, so `0xF0` stands alone; a 150/192-glyph area's band reaches
> `0xEF`, so `0xF0` sits flush against real data. `0xF0` can still be a family-wide reserved
> value — but the apparent "isolation" is an artifact of small vocabularies, not evidence for
> it. Pinned by `NibbleCeilingIsolationTests`, which asserts the per-title gap envelope, the
> glyph-count law, and DoK `03` by name.

---

## 4. Finding 4: the terminator byte, exceptionless and title-consistent

```
$ python tools/c64_walldef_struct.py --root "D:/Games/Emulator/C64/Goldbox" --terminator
loaded 101 WALLDEF records across 7 titles
  terminator 0x00: 83 files, titles=['Buck Rogers - Countdown to Doomsday', 'Champions of Krynn',
                                      'Curse of the Azure Bonds', 'Death Knights of Krynn',
                                      'Gateway to the Savage Frontier', 'Secret of the Silver Blades']
  terminator 0xFF: 18 files, titles=['Pool of Radiance']
```

Every one of the 101 bodies' final byte is exactly `0x00` or exactly `0xFF` -- no third value
ever appears in that position, in any file, in any title. Which value is used is a property of
the TITLE, not the individual area: all 18 Pool of Radiance files (100%) end `0xFF`; all 83
files across the other six titles (100%) end `0x00`. This lines up exactly with §2.3's
independent lag-1 finding -- Pool of Radiance is the same outlier on both axes.

---

## 5. Finding 5: two honest negatives

### 5.1 `0xF0`'s own positions are NOT parity-locked

If the period-2 structure from §2 extended cleanly through the sentinel byte's own placement,
`0xF0` would land almost exclusively at even or almost exclusively at odd positions. It does
not:

```
$ python tools/c64_walldef_struct.py --root "D:/Games/Emulator/C64/Goldbox" --sentinel-parity
sentinel 0xF0 positions: even=1736 odd=1758
```

49.7% even / 50.3% odd, over 3494 total occurrences across the 63 checked bodies -- indistinguishable
from a coin flip. **This means the sentinel-bearing region does not simply continue the same
stride-2 grid found in §2 with the sentinel occupying a fixed column** -- either the sentinel's
own region has a different (or no) fixed stride, or it is a variable-length list structure (each
"entry" ending in `0xF0` but of varying byte length), which would naturally break parity
alignment as later entries drift out of phase. Genuinely open; not adjudicated here.

### 5.2 No single stride-2/stride-4 column reads as a flat glyph index

Prior work (`c64_wallset_render.walldef_index_validity`) already showed the WHOLE body, read as
a flat array of glyph indices, comes back only modestly above chance (19.84%-41.63% in-range for
50-glyph titles vs a ~19.5% floor). This round asks the narrower, column-aware version of the
same question: now that §2 has established a real 2-byte (and possibly 4-byte) field structure,
does ONE COLUMN specifically behave like a flat index, even if the body as a whole does not?

```
$ python tools/c64_walldef_struct.py --root "D:/Games/Emulator/C64/Goldbox" --column-in-range 2
  Champions of Krynn: [0.274, 0.281]
  Curse of the Azure Bonds: [0.304, 0.3]
  Secret of the Silver Blades: [0.354, 0.362]
  Death Knights of Krynn: [0.851, 0.856]
  Gateway to the Savage Frontier: [0.333, 0.323]
  Pool of Radiance: [0.288, 0.293]
  Buck Rogers - Countdown to Doomsday: [0.815, 0.825]
```

(Stride-4 gives the same picture: all four columns land within roughly a percentage point of
each other for every title, e.g. Champions of Krynn `[0.274, 0.276, 0.274, 0.284]` -- checked
directly by `HonestNegativeTests.test_no_single_column_reads_as_a_flat_glyph_index_at_stride_two_or_four`,
`spread < 0.06` for every title at both strides.) Every column sits within a few points of every
other column in the same title, and every title's numbers track its own glyph-count-driven
chance floor (higher for the 192-glyph Death Knights of Krynn / Buck Rogers than for the
50-glyph titles) rather than any one column standing out. **No column, at either stride, is "the"
glyph-index field** -- if WALLDEF encodes glyph references at all, it is not via a fixed-position
flat index in a 2- or 4-byte record.

---

## 6. Tests, reproducibility, and the mutation check

`tools/test_c64_walldef_struct.py`: **20 tests, all passing.**

```
$ python -m pytest tools/test_c64_walldef_struct.py -q
....................                                                     [100%]
20 passed in 1.80s
```

8 are synthetic/no-corpus (prove the statistics themselves are correct on hand-built and
seeded-random data, independent of whether `D:\` is mounted); 12 read the real corpus and
`skipTest` if `D:\Games\Emulator\C64\Goldbox` is absent.

**Mutation checks performed this round (both reverted, byte-identical diff confirmed after
revert):**

1. `nibble_ceiling_violations`'s predicate changed from `(b >> 4) == 0xF and b != CEILING_SENTINEL`
   to `(b >> 4) == 0xF` (removing the sentinel exclusion, so `0xF0` itself counts as its own
   violation). Result: `NibbleCeilingTests.test_no_violations_in_any_240_max_body` went red
   (`AssertionError: 63 != 0` -- every checked body now "violates" its own ceiling, since `0xF0`
   is always present). Reverted; suite back to 20/20 green.
2. `shuffle_record_order` had its `rng.shuffle(records)` call deleted, making it a silent no-op
   (the "null" becomes byte-identical to the real data). Result: **4 tests** went red --
   `NullConstructionTests.test_record_order_shuffle_preserves_intra_record_pairing` (the "order
   actually changed" assertion), `SyntheticStructureDetectionTests.test_planted_stride_two_structure_is_detected_with_a_wide_margin`
   (planted-structure test could no longer clear a null that no longer nulls anything), and both
   `PeriodTwoAlternationTests.test_lag_two_clears_both_nulls_in_every_title` /
   `test_lag_one_is_suppressed_in_six_of_seven_titles...` (real-corpus checks against the same
   broken null). Reverted; suite back to 20/20 green.

Both mutations are reproducible by reverting the two one-line edits described above (they are
not left in the tree).

---

## 7. What this does and does not establish

**Established:** WALLDEF is very likely built from repeating small (2-byte, possibly 4-byte)
records, not a flat unstructured byte stream and not (at any single-column granularity) a flat
glyph-index array; it carries a reserved sentinel byte (`0xF0`) distinct from ordinary data in
the majority of the corpus; and it ends in a single title-consistent terminator byte (`0x00` or
`0xFF`). Pool of Radiance is a real, independently-corroborated (two separate signatures)
structural outlier within the corpus.

**Not established (open):** what either field of a 2-byte record actually encodes; whether the
true record size is 2 or 4 bytes (or something built from 2-byte sub-fields inside a larger
record); what the sentinel-bearing tail region's own internal structure is (§5.1's honest
negative rules out simple parity continuation); and why Pool of Radiance's convention differs.
This document does not attempt to resolve any of these -- see the sibling oracle-based slice
for a second, independent line of attack on the same open questions.

---

*Round 1, 2026-08-12 (slice `walldef-structure`). Static analysis + offline byte inspection
only, no emulator. Files: `tools/c64_walldef_struct.py` (new), `tools/test_c64_walldef_struct.py`
(new, 20/20 passing), this document (new). No existing project file edited.*
