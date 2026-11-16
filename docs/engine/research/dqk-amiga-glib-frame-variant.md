# DQK Amiga GLIB wall-frame stubs: byte-arithmetic census (R4, PLAN-ROUND-31.md)

## Task and scope

R4 asked: 305 of 799 members of DQK's Amiga `8X8DB.TLB` + `8X8DC.TLB` (WHDLoad-unpacked
`DarkQueenOfKrynn/data/Disk2`) come out of `decodeGlib` as degenerate 8x1 stub images, and
`8X8DB` set 4 fails 47/47. `dqkAmigaWallArt.test.ts` had pinned the shape of this gap without
ever printing a failing member's own header bytes. The brief: build a pure-Python leaf walker
that prints per-member `dm`/`wb`/`h`/body-length plus the DOS twin's real `(w, h)`, and test
whether any `(nplanes, variant)` byte-budget hypothesis — computed from the DOS oracle's real
dimensions — is satisfiable by the stub's stored bytes. Change `glib.ts`'s `decodeImage` **only**
if a variant fits and its decoded frames agree with the DOS twins' dimensions on every affected
member, at least as well as the existing 478/494 (96.8%) baseline.

**Result: `glib.ts` is unchanged.** No hypothesis fits any of the 305 stubs. This is the
plan's own sanctioned "numbered negative" branch, not an unfixed bug — see the arithmetic
in section 4.

Tooling: `tools/glib_frame_census.py` (new, pure-Python leaf walker built on top of the
already-verified `tools/glib_decode.py` and `tools/hlib_decode.py`), pinned by
`tools/test_glib_frame_census.py` (new, 13 tests, skips when the WHDLoad/GOG sources are
absent). `packages/engine/src/loaders/glib.ts` is untouched by this round.

## 1. Every prediction in the plan's own R4 section, next to what was measured

| Plan's prediction (estimate) | Measured |
| --- | --- |
| "The 305 stubs share one or two `dm` values absent from the 494" | **Wrong.** `dm` does not discriminate at all: `dm=0xE1` is the drawing method of every one of the 305 stubs AND of 491 of the 494 real decodes. The only other observed `dm` (`0xE0`, 3 members, all in `8X8DC.TLB`) is exclusively on non-stub frames — but it explains 3 members, not 305. |
| "set 4 of `8X8DB` is a 5-plane variant in a 4-plane-declared file or vice versa" | **Wrong.** `8X8DB` set04's 47 members are not a plane-depth mismatch — they are the SAME 6-byte `h=1,wb=1,dm=0xE1` placeholder as every other stub, and the DOS twin is ALSO an 8x1 placeholder at all 47 of those positions. Set04 is a genuinely blank set on both platforms, not a miscoded real one. |
| "Stub count after: ≤ 60 (two-sided; if the arithmetic fits nothing, pins stay at 166/139)" | Arithmetic fits nothing (section 4). Pins stay at **166/139 (305 total)** — unchanged, per the plan's own two-sided framing. |
| "Dimension agreement on newly decoded frames ≥ 96%" | N/A — no frames were newly decoded. |
| "Zero regressions on Pools/Gateway" | **Confirmed, trivially** (no code changed) but still measured directly: 0 stubs in Pools' `8X8D.TLB` (1536 members) and 0 stubs in Gateway's `Walls.tlb` on both `DiskA` and `DiskC`. Pinned in `test_zero_regressions_on_pools_and_gateway`. |

The plan's own "measure before you predict" ground rule applies here: both of its concrete
guesses about the discriminator (dm) and the mechanism (plane-depth) were falsified by the
first real measurement, and the corrected understanding (section 2-3) is entirely different in
kind from either guess.

## 2. The single placeholder shape

All 305 stubs, in both files, share the **identical** byte record:

```
h = 1, wb = 1, dm = 0xE1 (225), body = 6 bytes
```

This is exactly the raw-masked budget for that tiny DECLARED size: `(nplanes+1) * h * wb =
(5+1) * 1 * 1 = 6`. One literal placeholder record, reused at every stub position corpus-wide —
not per-member noise, and not evidence of an unimplemented codec (a real unimplemented codec
would show varying `dm`/body shapes as different real images hit it; this shows one constant
template).

`dm` histograms (the plan's own predicted discriminator, shown to not discriminate):

| File | dm histogram, stubs | dm histogram, non-stubs |
| --- | --- | --- |
| `8X8DB.TLB` | `{0xE1: 166}` | `{0xE1: 257}` |
| `8X8DC.TLB` | `{0xE1: 139}` | `{0xE0: 3, 0xE1: 234}` |
| **combined** | **`{0xE1: 305}`** | `{0xE0: 3, 0xE1: 491}` |

Stub body-length histogram: `{6: 305}` — no variation at all.

## 3. Splitting the 305 against the DOS oracle: 76 both-degenerate, 229 Amiga-only

Using the DOS twin (`The Dark Queen of Krynn/DISK2/8X8DB.TLB` + `8X8DC.TLB`) as the oracle for
what each stub position OUGHT to hold:

| | both-degenerate (DOS is ALSO 8x1) | Amiga-only (DOS has real art) | total |
| --- | --- | --- | --- |
| `8X8DB.TLB` | 47 | 119 | 166 |
| `8X8DC.TLB` | 29 | 110 | 139 |
| **combined** | **76** | **229** | **305** |

Set numbers below are 0-based set INDEX (`set_index` in `glib_frame_census.py`, matching
`decodeGlib`'s own internal `set{si:02d}` member labels), stated explicitly each time to avoid
the off-by-one ambiguity between that and the plan's English "the Nth set" phrasing (which
`dqkAmigaWallArt.test.ts`'s pre-existing "8X8DB set04 fails entirely" pin uses for 0-based index
3). The 76 both-degenerate positions are not scattered — they are three contiguous, whole
regions:

- `8X8DB.TLB` set index 3 (the plan's "set 4"): **all 47/47** — this is the "set 4 fails
  entirely" the plan's brief named, and its own explicit prediction was that this is "a 5-plane
  variant in a 4-plane-declared file or vice versa". Measured, it is not a plane-depth issue at
  all: the DOS twin is ALSO an 8x1 stub at all 47 positions (there is no real oracle dimension
  to even test a hypothesis against), and all 47 members share the exact same 6 literal bytes
  (`ff0000000000`, not merely the same shape) — a single template value repeated, confirming an
  unused wall-piece set, authored blank on both platforms, not a decoder gap of any kind.
- `8X8DC.TLB` set index 0: set-relative positions 0-9 (cap-far + the entire first 9-piece
  slice, 10 members) AND 38-46 (the entire fifth 9-piece slice, 9 members) — two whole slices,
  19 members.
- `8X8DC.TLB` set index 7 (the 8th and last set): set-relative positions 0-9 (cap-far + the
  first slice) — one whole slice, 10 members.

19 + 10 = 29, matching the `8X8DC.TLB` both-degenerate total exactly. These are genuinely
unused/blank wall-piece positions in the game's own data, present on both platforms — the
opposite of a gap.

### The 229 Amiga-only failures are explained by one convention: the "-right" mirror omission

Labeling each stub's set-relative position by DQK's own 47-frame wall-piece vocabulary (already
recovered in `dqk-amiga-wall-art-feasibility.md` section 2b: `cap+9, cap+9, 9, 9, 9`, each 9-run
in the order far-front, far-left, far-right, mid-front, mid-left, mid-right, near-front,
near-left, near-right), **every single one of the 229 Amiga-only failures is the "-right"
member of a mirrored pair**:

| Piece | Count |
| --- | --- |
| far-right | 77 |
| mid-right | 77 |
| near-right | 75 |
| **total** | **229** |

This matches the mirror-symmetric pair structure the feasibility doc's depth-ordering test
already established independently (75/77 slices have left/right heights agreeing within 2px —
i.e. these ARE genuinely mirrored silhouettes). The natural reading: the Amiga master only
stores the "-left" half of each mirrored pair and relies on the renderer to flip it horizontally
for "-right", so "-right" positions carry a minimal placeholder rather than real pixel data.
DOS, by contrast, stores both halves independently (no flip at draw time), which is why the DOS
twin has real, non-degenerate art at every one of these 229 positions.

**Exactly 2 corpus-wide exceptions** where a "-right" position is NOT a stub — the Amiga master
stores real, independent art there, agreeing with DOS on dimensions:

- `8X8DB.TLB` set index 2, near-right of the 3rd view slice (set-relative 28, global frame
  index 122): DOS and Amiga both decode to 8x56.
  Notable because `near-right` is the piece whose painted silhouette most often deviates from a
  clean mirror of `near-left` (the feasibility doc's own depth/pair-symmetry test found 2 of 77
  slices where the left/right height pairing does not hold) — consistent with these being the
  cases where a true mirror flip would have been visibly wrong, so real art was authored
  instead.
- `8X8DC.TLB` set index 1, near-right of the 5th view slice (set-relative 46, global frame
  index 93): DOS and Amiga both decode to 16x64.

Both are pinned by `tools/test_glib_frame_census.py::test_amiga_only_failures_are_the_mirrored_right_piece_with_two_named_exceptions`
and by `packages/engine/test/dqkAmigaWallArt.test.ts`'s new R4 test (section 6 below).

## 4. No byte-budget hypothesis fits any of the 305 stubs

For every stub, using the DOS oracle's REAL `(w, h)` at that position (not the tiny declared
`8x1`), `tools/glib_frame_census.py`'s `hypotheses_for_stub` tests:

- **raw contiguous** (variant 0): budget = `nplanes * h * wb`, must equal the observed body
  length (6 bytes) exactly.
- **raw masked** (variant 1): budget = `(nplanes + 1) * h * wb`, same.
- **RLE'd** (variant 2 / `dm=0xE2`): actually run the real `_rle18` decompressor (the verified
  port shared from `tools/glib_decode.py`, not a re-derived approximation) toward the
  raw-contiguous target and see whether it reaches that many output bytes without running past
  the end of the 6-byte source.

Both 4-plane and 5-plane are tried for every hypothesis, even though the format's own
`dm >= 0xE0` convention ties `0xE0-0xFF` to 5 planes — a mis-set high bit is exactly the kind of
thing a hypothesis sweep should be able to catch, so plane count was never assumed from `dm`.

**Raw contiguous and raw masked**: never fit. The real dimensions at these 229 positions range
from 8x7 up to 24x88 or more; a 6-byte body cannot supply `nplanes * h * wb` bytes for any real
geometry in this corpus under any plane count.

**RLE**: mostly fails by source exhaustion (`IndexError` — not enough bytes to reach the
target), but exactly **one** member reaches the target byte count exactly: `8X8DB.TLB` frame
107 (`far-right`, DOS oracle `8x7`, body `c70838003838`). `_rle18(body, 28)` (4-plane budget)
and `_rle18(body, 35)` (5-plane budget) both succeed at the byte-count level — but decode to
**28 (or 35) copies of the single byte `0x08`**, i.e. one flat color across the whole "image".
A byte-count match against a uniform buffer is not real pixel data: no wall-art piece renders as
one solid color, least of all one whose DOS twin has actual line art at that position. This is
exactly the false-positive `rle_actually_consumes` (in `tools/glib_frame_census.py`) is built to
reject — it requires more than one distinct byte in the decoded output, not just the right
length — and with that check applied, this member correctly reports **no fit** too, per
`tools/test_glib_frame_census.py::test_rle_byte_count_match_can_be_a_degenerate_false_fit`.

**Net result: 0 of 229 Amiga-only failures have any satisfiable hypothesis.** The 6-byte bodies
are structurally insufficient to hold real pixel data under any codec this format defines, at
any plane count. The art is not present in the file — this is not a misread header, a
mis-selected plane count, or an unimplemented drawing method.

## 5. Why `glib.ts` is unchanged

Per the plan's explicit standing: *"A numbered negative is a fully acceptable outcome and is
worth more than a variant that 'works' on the affected members but drops DOS-twin agreement
below its 478/494 baseline. ... Do not reach for a fit."* Since no `(nplanes, variant)`
hypothesis is satisfiable by any of the 305 stub bodies (section 4), there is no variant to
apply. `packages/engine/src/loaders/glib.ts`'s `decodeImage` is unchanged from its current
committed state — R6's concurrent Amiga GLIB measurements against the shipped decoder are
unaffected by this round.

## 6. What changed as data, not code

- `tools/glib_frame_census.py` (new): the leaf walker, hypothesis engine, and piece-naming
  helper described above.
- `tools/test_glib_frame_census.py` (new, 14 tests): pins the histogram, the 76/229 split, the
  dedicated `8X8DB` set-4 hypothesis table the plan named explicitly (no oracle dimension
  exists there; all 47 members share the identical 6 literal bytes), the piece histogram, the
  "no hypothesis fits" result (including the degenerate-RLE regression test), two required
  mutations — forcing declared `(h, wb)` to a real value DOES reclassify a stub as non-stub (the
  true discriminator), forcing `dm` alone does NOT (correcting the plan's own mutation (ii),
  which assumed `dm` was the discriminator) — and the Pools/Gateway zero-regression control.
- `packages/engine/test/dqkAmigaWallArt.test.ts`: added one new test,
  `'R4: the 305 stubs split into 76 genuinely-blank-on-both-platforms and 229 Amiga-only'`,
  independently reproducing the split and piece histogram from the TS side (via `decodeGlib` /
  `decodeHlib` directly, not by shelling out to the Python tool), plus a `pieceOf` helper
  mirroring the Python `piece_of` exactly. **No existing pin in this file changed** — the
  166/139/0.382 KNOWN GAP numbers, the 478/494 (mismatch=16) dimension-agreement numbers, and the
  wall-piece-vocabulary numbers (72/77, 74/77, 75/77) all stayed exactly as measured before this
  round, because `glib.ts` did not change.

## 7. Pixel agreement with DOS where the art is shared (and its limits)

The plan asked for pixel agreement on shared art, with the palette mapping stated. Methodology:
for every frame that is non-stub on BOTH platforms and whose Amiga and DOS decodes agree on
`(width, height)` (245 of `8X8DB.TLB`'s 423 frames), each pixel's palette index was mapped
through **that platform's own embedded palette** (Amiga: the first 256-entry palette table in
the GLIB leaf via `first_palette_in_file`; DOS: the per-image palette `hlib_decode.py`'s `walk`
already resolves) to an RGB triple, and the two RGB values were compared with a ±24-per-channel
tolerance. Pixels where index `255` (the masked/transparent sentinel `planesToChunky` emits)
appears on both sides were excluded as "both transparent"; pixels where it appears on only one
side were counted separately as a shape disagreement rather than a color disagreement.

Measured over the 245 matching-dimension frames of `8X8DB.TLB` (174,384 total pixel
comparisons before exclusions):

- 31,987 pixels (18.3%) transparent on both sides.
- 32,922 pixels (18.9%) transparent on exactly one side — a genuine shape/silhouette
  disagreement, not just a color one.
- Of the remaining 109,475 mutually-opaque pixels, **28,494 (26.0%) are color-close** at the
  ±24-per-channel tolerance.

This is a LOW agreement rate — well below the "same geometry, different palette" signature
Pools of Darkness and Gateway showed for their shared wall art. It says the DIMENSION parity
this file already established (478/494, 96.8%) does not extend to shared shape or color at the
pixel level for DQK's wall pieces specifically. Investigating why (recolor authored per
platform vs. a decode-side defect in the non-stub path) is explicitly **out of this round's
ownership boundary** — R4 was scoped to the stub arithmetic and `decodeImage`'s handling of the
305 degenerate members, not the pixel fidelity of the 494 members that already decode. Recorded
here as observed, not investigated further, so a future round does not have to reconstruct the
methodology (or the discouraging number) from scratch, and does not mistake the dimension
parity in section 2's table for a proxy of color/shape parity, which it measurably is not.

## 8. Numbers used elsewhere, restated once for the record

- 305 = 166 (`8X8DB.TLB`) + 139 (`8X8DC.TLB`) stubs, unchanged from before this round.
- 76 both-degenerate (47 + 29), 229 Amiga-only (119 + 110).
- Piece histogram of the 229: far-right 77, mid-right 77, near-right 75, with 2 named
  near-right exceptions (`8X8DB.TLB` set02, `8X8DC.TLB` set01).
- dm histograms: stubs `{0xE1: 305}`; non-stubs `{0xE0: 3, 0xE1: 491}`.
- Stub body-length histogram: `{6: 305}`.
- Hypothesis-fit count over the 229 Amiga-only failures: **0**.
- Zero-regression control: Pools `8X8D.TLB` 0/1536 stubs; Gateway `Walls.tlb` 0 stubs on both
  `DiskA` and `DiskC`.
- 478/494 (96.8%) dimension agreement — the pre-existing baseline this round did not move,
  because it could not improve it.
