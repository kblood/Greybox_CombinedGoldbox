# DQK GEO stride audit (R4, round 29)

Adversarial re-check of every DQK Gen2 GEO `(x,y)` coordinate claim in `docs/engine/research/
dqk-*.md` against the corrected `decodeGen2GeoBlock` (commit `dc12cd1`, 2026-08-07), which fixed
`packages/engine/src/loaders/geo.ts` from a buggy `(width, height)` header-byte order to the
retail-correct `(height, width)` order ("8 of 20 DQK maps were being transposed"). Research
written before that fix — and some written the same day — computed cell `(x,y)` labels using the
old, wrong row stride. This is a re-check, not a rebuild: nothing in `geo.ts`, `dqkExplore.ts`, or
either test file the round plan forbids touching (`dqkCampaignLegs.test.ts`, `dqkQuest.test.ts`)
was modified. Every number below is re-derived from the retail `GEO.GLB` bytes
(`The Dark Queen of Krynn/DISK3/GEO.GLB`, sha256 `fd843561...7a2d1`, byte-identical to the GOG
install copy), not eyeballed from prose.

Tools built for this audit (both read-only w.r.t. game data, neither imports `geo.ts`):
- `tools/dqk_geo_shape_census.py` — a from-scratch HLIB/GEO.GLB reader; prints the corrected
  `(areaId, member, h, w)` for all 20 maps.
- `tools/dqk_geo_claim_audit.py` — sweeps every `docs/engine/research/dqk-*.md` for coordinate
  claims, re-derives each mechanically from the real bytes, and classifies CORRECT / STALE /
  UNCHECKABLE with a byte-level reason. `python tools/dqk_geo_claim_audit.py --verbose` reproduces
  everything below; `--transpose-null` is mutation (iii) (see below).
- `packages/engine/test/dqkGeoShapeCensus.test.ts` — pins the same 20 shapes through the real
  `decodeGen2GeoArchive` (not the standalone census script) and proves the null: on all 12 square
  maps, deliberately decoding under a transposed stride reproduces byte-identical cells; on all 8
  non-square maps it does not.

## 1. The census (independently reproduced twice)

Both `tools/dqk_geo_shape_census.py` (standalone, from scratch) and `packages/engine/test/
dqkGeoShapeCensus.test.ts` (through the real `decodeGen2GeoArchive`) agree exactly:

```
area  member    h    w  square
   2       1   10   10     yes
   4       2   17   17     yes
  10       3   28   28     yes
  14       4   39   20      no
  18       5   16   11      no
  22       6   27   24      no
  24       7   16   16     yes
  26       8   22   22     yes
  30       9   28   28     yes
  34      10   28   28     yes
  38      11   20   39      no
  42      12   28   28     yes
  46      13   27   29      no
  47      14   27   29      no
  50      15   28   28     yes
  54      16   23   21      no
  58      17   28   28     yes
  62      18   28   28     yes
  63      19   12   12     yes
  66      20   22   34      no
total maps: 20
non-square: 8 -> areas [14, 18, 22, 38, 46, 47, 54, 66]
```

This matches `PLAN-ROUND-29.md`'s table exactly — no correction needed there.

## 2. Method

Two independent, purely mechanical claim templates, checked in priority order:

1. **OFFSET-ANCHORED** — a coordinate immediately followed (same line, or the very next markdown
   line if the sentence hard-wraps) by a backtick file offset, e.g. `(19,20)/`0x00B7E5`` or "cell
   (22,10) at member offset `0x0756` / file `0x003F44`". The offset is looked up directly against
   the REAL byte ranges of all 20 members' 4 planes — completely independent of which area a
   paragraph claims to be about, so it cannot be gamed by a wrong "current area" guess.
2. **DESCRIPTOR/VALUE-ANCHORED** — the tool tracks a "current GEO area" only from an explicit
   binding phrase ("GEO area N = member M", "GEO.GLB member M = area N", …), reset at every
   markdown heading, plus two document-specific fallbacks: `dqk-campaign-legs.md`'s own per-leg
   summary table (excluding chained multi-area legs like wilderness's "18 -> 5 -> 38", which mix in
   out-of-scope data), and a "document is ≥70% about one area, with ≥5 mentions" fallback for docs
   that never use a formal binding phrase. Five claim shapes are recognised: "VALUE at (x,y) [and
   (x,y)]", "descriptor N … (x,y)", "low-7-bits N: cell (x,y)", "wall type exactly N … (x,y) [and
   (x,y)]" (checked against the stated facing direction, or all four), and "masked descriptor N,
   GEO cells (x,y) and (x,y)".

Everything else that matches a bare `(x,y)` but neither template applies is UNCHECKABLE, with a
specific reason (no area binding in scope; offset falls outside all 80 real plane ranges; matched
no recognised template; or the line explicitly signals a different data structure — the area-5
overland/wilderness table, a 50x25 native combat-terrain map, or Amiga wall-art sprite pixel
offsets, none of which are ever read through `decodeGen2GeoBlock` and so are not subject to this
bug at all).

**The null.** Every checkable claim whose resolved area is one of the 12 SQUARE areas is reported
in a separate bucket. A transposition is invisible on a square map (`y*W+x` is unchanged by
swapping W and H only when W==H), so if this bucket ever shows a STALE claim, the audit script —
not the docs — is broken.

## 3. Result against the un-annotated corpus

This is the count against the corpus **before** this round's own correction blocks were appended
(the authoritative denominator for "how many claims were audited"). Re-running the tool now, after
the corrections below were added, naturally re-discovers the STALE numbers quoted *inside* those
corrections for explanatory context and re-flags them — that is expected self-reference, not a new
finding, and is why this section freezes the pre-annotation numbers.

```
Scanned 27 docs, 126 coordinate-pattern matches total.
Checkable: 23  Uncheckable: 103

[non-square] checkable=22 CORRECT=4 STALE=18
[square]     checkable=1  CORRECT=1 STALE=0
[unknown]    checkable=0  CORRECT=0 STALE=0
```

23 claims were checkable (22 non-square + 1 square). **18 STALE, 5 CORRECT** — plus **3 more STALE
claims the automated tool cannot bind** (no dominant area in those 3 docs), found and verified by
hand; see §6. Total: **21 STALE, 5 CORRECT, 26 claims classified with certainty**, out of 126
raw coordinate-pattern matches across 27 docs (103 UNCHECKABLE, correctly — see §7 for what those
actually are).

## 4. Every STALE claim (18, automated, all in `dqk-campaign-legs.md`)

Each row: doc:line, template, area, old (doc) coordinate, corrected coordinate, and the byte-level
derivation. `idx` is the plane-relative index (`file_offset − plane_base`, or the index found by a
value scan); corrected `(x,y) = (idx % w, idx // w)` under the real width `w`. Every one of these
18 also independently matches `(idx % old_w, idx // old_w)` where `old_w` is the OLD, pre-fix
buggy width (`= real height`) — i.e. every stale label is explained exactly by the transposition
bug, with zero unexplained residual.

| doc:line | area | old (x,y) | corrected (x,y) | derivation |
| --- | --- | --- | --- | --- |
| campaign-legs.md:262 | 66 | (19,20) | **(17,13)** | plane2 idx 459 (offset `0x00B7E5`); w=34: 459%34=17, 459//34=13 |
| campaign-legs.md:262 | 66 | (20,20) | **(18,13)** | plane2 idx 460 (offset `0x00B7E6`) |
| campaign-legs.md:263 | 66 | (9,7) | **(27,4)** | plane2 idx 163 (offset `0x00B6BD`) |
| campaign-legs.md:263 | 66 | (3,13) | **(17,8)** | plane2 idx 289 (offset `0x00B73B`) |
| campaign-legs.md:263 | 66 | (15,14) | **(17,9)** | plane2 idx 323 (offset `0x00B75D`) |
| campaign-legs.md:453 | 18 | (12,10) | **(7,15)** | plane2 value=1 masked (low7), unique hit at idx 172 (offset `0x002172`, raw byte `0x01`); w=11: 172%11=7, 172//11=15 |
| campaign-legs.md:568 | 54 | (12,6) | **(3,7)** | plane2 idx 150 (offset `0x009232`); w=21: 150%21=3, 150//21=7 |
| campaign-legs.md:568 | 54 | (13,6) | **(4,7)** | plane2 idx 151 (offset `0x009233`) |
| campaign-legs.md:568 | 54 | (10,7) | **(3,8)** | plane2 idx 171 (offset `0x009247`) |
| campaign-legs.md:568 | 54 | (11,7) | **(4,8)** | plane2 idx 172 (offset `0x009248`) |
| campaign-legs.md:569 | 54 | (8,8) | **(3,9)** | plane2 idx 192 (offset `0x00925C`) |
| campaign-legs.md:569 | 54 | (9,8) | **(4,9)** | plane2 idx 193 (offset `0x00925D`) |
| campaign-legs.md:679 | 54 | (12,6)/(13,6)/(10,7)/(11,7)/(8,8)/(9,8) | **(3,7)/(4,7)/(3,8)/(4,8)/(3,9)/(4,9)** | value 0x86 masked, plane2, 6 hits, w=21 |
| campaign-legs.md:760 | 66 | (16,18)/(6,20) | **(4,12)/(4,13)** | value 3 masked, plane2, w=34 |
| campaign-legs.md:772 | 66 | (19,20)/(20,20) | **(17,13)/(18,13)** | value 134, plane2, w=34 |
| campaign-legs.md:772 | 66 | (9,7) | **(27,4)** | value 142, plane2, w=34 |
| campaign-legs.md:772 | 66 | (3,13)/(15,14) | **(17,8)/(17,9)** | value 133, plane2, w=34 |
| campaign-legs.md:802 | 18 | (12,10) | **(7,15)** | same cell as :453 (idx 172, offset `0x002172`), restated in the refuter-verdict pass; w=11: 172%11=7, 172//11=15 |

**Note on the two area-18 rows (:453 and :802):** these restate the SAME cell (the doc's unique
"low-7-bits 1" cell, idx 172, raw byte `0x01`) twice — once in the finder pass, once in the
refuter-verdict pass that re-confirmed the byte at `0x002172` but not the `(x,y)` label derived
from it. Both correct to **(7,15)**. This is a DIFFERENT area-18 cell from the `(11,5)` claim in
§9 below (raw, unmasked byte `157` = `0x9D` at idx 91, correcting to `(3,8)`) — the two are easy to
conflate because both are area-18 claims mangled by the identical bug and both happen to share the
digit "1" in their old labels, but `0x9D & 0x7F = 0x1D = 29 ≠ 1`, so they are genuinely different
plane cells. (An earlier draft of this document conflated them and asserted `(7,15)` was itself a
miscomputation of `91 % 11`; it was not — `91 % 11 = 3, 91 // 11 = 8` is the SEPARATE `(11,5)`
claim's correct derivation, not this one's. Caught during review before publication.)

## 5. Every CORRECT claim (5)

| doc:line | area | shape | claimed (x,y) | verified against |
| --- | --- | --- | --- | --- |
| dqk-0032-writer.md:513-514 | 66 (non-square) | wall type 4 | (26,4), (26,15) | east-wall nibble ==4 over all 748 cells: exactly these 2 |
| dqk-0032-writer.md:514 | 66 (non-square) | descriptor 14 | (27,4) | masked byte==14 over plane2: exactly 1 hit |
| dqk-campaign-legs.md:576 | 54 (non-square) | value 0x86 masked | (3,7)/(4,7)/(3,8)/(4,8)/(3,9)/(4,9) | the **calibration case** — see §6 |
| dqk-campaign-legs.md:688 | 54 (non-square) | value 0x86 masked | same 6 cells, restated | same |
| dqk-campaign-legs.md:88 | 30 (**square**) | unique cell, `byte&0x7F==68` | (22,10) | the null-bucket's only checkable claim — see §7 |

## 6. Calibration check (required by the round plan)

The plan requires this exact check: `dqk-campaign-legs.md:566-568`'s original six-cell claim
`(12,6)/(13,6)/(10,7)/(11,7)/(8,8)/(9,8)` must classify **STALE**, and its own correction at
`:576` must classify **CORRECT**. Confirmed exactly — see the `campaign-legs.md:568`/`:569` rows
in §4 (STALE) and the `campaign-legs.md:576` row in §5 (CORRECT). This correction pre-dates this
round's own work (dated 2026-09-02 in the doc, and mirrored in `packages/engine/test/
dqkQuest.test.ts`'s own "CORRECTION (2026-09-02)" docstring note, which independently pins the
same 6 corrected cells at `dqkQuest.test.ts:185` — `[3, 7], [4, 7], [3, 8], [4, 8], [3, 9], [4,
9]`); this audit reproduces it exactly rather than discovering it fresh, which is the point of
using it as a calibration case.

## 7. The square-map null

`packages/engine/test/dqkGeoShapeCensus.test.ts` case C is the strong form of the null: for all 12
square maps, it decodes the SAME raw plane bytes under both the correct stride and a deliberately
transposed one, and asserts every one of >1000 cells reads identically. That test is green.

The claim-audit tool's own square bucket is thin by comparison: only **one** checkable claim in
the entire corpus resolves to a square area — `dqk-campaign-legs.md:88`, area 30's unique
"descriptor 68 masked" cell `(22,10)`, verified CORRECT (idx = `0x003F44 − plane2_base`; since
h==w==28 for area 30, `idx%28, idx//28` is identical under both stride readings, so this claim
would read the same either way — consistent with the null, and not just "nothing to check"). No
square-bucket claim is STALE. This is an honest limitation of the prose-claim corpus, not the
tool: almost all coordinate claims that use the value/descriptor templates happen to sit in
paragraphs about the 8 non-square maps (the maps where the bug was actually discovered), so the
null bucket is real but sparse (n=1 CORRECT, 0 STALE) rather than richly populated.

## 8. Mutations (required by the round plan)

**(i) Flip area 54's pinned shape to (21,23) in `dqkGeoShapeCensus.test.ts`.** Confirmed RED:
`1 failed | 231 passed` (case A fails on the area-54 assertion). Restored; confirmed green again
(232 passed, full suite run afterward: 231 test files / 2657 tests, all green).

**(ii) Run the audit with the stride deliberately transposed.** Implemented as a one-off script
that loads all 20 areas via `load_geo_areas` and swaps `h`/`w` for every area (bytes untouched),
then re-scans the corpus:

```
[TRANSPOSED STRIDE] non-square: checkable=22 CORRECT=18 STALE=4
[TRANSPOSED STRIDE] square:     checkable=1  CORRECT=1  STALE=0
```

Every one of the 4 previously-CORRECT non-square claims flips to STALE:
`dqk-0032-writer.md:513/514` and `dqk-campaign-legs.md:576/688`. Every one of the 18
previously-STALE non-square claims flips to CORRECT (STALE count 18→4, CORRECT 4→18 — a clean,
complete swap, confirming those 18 STALE claims match the pre-fix stride EXACTLY, with nothing
left over). The one square claim (`campaign-legs.md:88`, area 30) stays CORRECT under
transposition, exactly as the null predicts (h==w==28, so swapping does nothing to that map).

**(iii) Disable the square-map null (`--transpose-null`) and confirm classification counts don't
change.** Confirmed identical output with and without the flag — `[non-square] checkable=22
CORRECT=4 STALE=18` / `[square] checkable=1 CORRECT=1 STALE=0` either way. The flag only
suppresses the "NULL VIOLATION" print check; it does not touch classification, proving the two are
independent.

## 9. Three claims the automated tool cannot bind, verified by hand

`dqk-ca03-runtime-probe.md:991`, `dqk-combat-entrypoint-cfg-scan.md:155`, and
`dqk-qsv-save-transfer-consumers.md:6` all restate "area 18 descriptor-157 cell `(11,5)`" as the
target of a QSV save-fixture probe (`@36=11, @37=5` patched into the party-position fields). None
of these three docs has a formal "GEO area N" binding phrase or a ≥70%-dominant single area (they
mix areas 5/18/23/58/66), so the tool's binding logic correctly leaves them UNCHECKABLE rather
than guessing.

Verified by hand against the real bytes: area 18's plane2 has exactly one cell with **raw** byte
157 (0x9D — unmasked, since 157 > 0x7F), at plane index 91. Under the corrected stride (w=11) that
is `(3,8)`; under the old buggy stride (w=16) it is `(11,5)` — an exact match to all three docs'
claim. **All three are STALE**, correction blocks appended to each (see §10). Note this is a
DIFFERENT area-18 cell from §4's `(12,10)`→`(7,15)` claim (idx 172, masked byte 1) — `0x9D & 0x7F
= 29 ≠ 1`, so the two are genuinely distinct plane cells that both happen to be area 18 and both
happen to be mangled by the identical transposition bug. This is more than a
labelling error: the QSV fixture literally patched the party's saved position to `(11,5)`, a cell
that (under the corrected decoder) is NOT the descriptor-157 cell — so the probe's "zero
combat-map rows" result does not, as currently stated, rule out area 18's natural descriptor-157
`COMBAT` gate; it rules out an untested, different cell. Re-running with `@36=3, @37=8` would be
the natural follow-up; not attempted here (no DOSBox-X work in this round's scope).

## 10. Corrections appended this round

`> CORRECTION (R4, round 29)` blocks were appended (never rewriting the original lines) to:

- `docs/engine/research/dqk-campaign-legs.md` — 4 new blocks: after the "middle" leg's `GEO member
  20 = area 66` paragraph (covers :262-263); after the area-18 low7 paragraph (covers :453, and
  points at the WILDERNESS-section restatement); inside the "ENDING - refuter verdict" corrections
  list (covers :760 and :772); inside the "WILDERNESS - refuter verdict" section (covers :802,
  the refuter's own byte re-confirmation that verified the offset but not the `(x,y)` label).
  (Area 54's two STALE spots, :568-569 and :679, already carried correction blocks predating this
  round — see §6 — and were left untouched.)
- `docs/engine/research/dqk-ca03-runtime-probe.md`, `dqk-combat-entrypoint-cfg-scan.md`,
  `dqk-qsv-save-transfer-consumers.md` — one block each, for the shared `(11,5)`→`(3,8)` finding
  in §9.

The `dqk-campaign-legs.md` blocks (`(12,10)`→`(7,15)`) and the three-doc `(11,5)`→`(3,8)` blocks
are two DIFFERENT corrections for two DIFFERENT area-18 cells — see the note in §4 and the
clarification in §9. An earlier draft of this document conflated the two and briefly asserted a
false "arithmetic slip"; caught and corrected during review before publication (nothing in the
appended doc correction blocks themselves was ever wrong — only this summary document's own
cross-reference was, and only transiently).

## 11. `tools/goldbox_corpus.py:538` — verified, NOT applied (Phase B)

The round plan's claim is correct. `sniff_gen2_geo` (function starts at line 535):

```python
def sniff_gen2_geo(raw: bytes) -> bool:
    if len(raw) < 8:
        return False
    width, height = raw[0], raw[1]
    return width > 0 and height > 0 and len(raw) == 8 + 4 * width * height
```

Line 538 names `raw[0]` "width" and `raw[1]` "height" — backwards relative to the corrected
convention (`raw[0]`=height, `raw[1]`=width, per `geo.ts`'s `decodeGen2GeoBlock` and this audit's
own `load_geo_areas`). It is **harmless today**: the function only tests `width*height` (which
commutes) against the member length, so the boolean sniff result is unaffected by the swap — this
is a naming bug, not a functional one. Verbatim fix for a separate Phase B agent:

```python
    height, width = raw[0], raw[1]
```

(This file is on R4's explicit do-not-touch list; not applied here.)

## 12. Where the plan's suspicion was unfounded, not refuted

The plan named `dqk-search-location.md`, `dqk-newgame-entry.md`, `dqk-palanthas-palace-combat-
route.md`, `dqk-demo-route.md`, and `dqk-ending-ingress.md` as docs to check (alongside
`dqk-campaign-legs.md`, which did carry stale claims). Re-checked: `dqk-newgame-entry.md`,
`dqk-palanthas-palace-combat-route.md`, `dqk-demo-route.md`, and `dqk-ending-ingress.md` contain
**zero** `(x,y)`-shaped coordinate patterns of any kind — there was nothing in them to be stale.
`dqk-search-location.md` has 4 coordinate mentions ((0,0), (5,5), (10,10), (3,12)), all generic
illustrative examples with no GEO-area binding, correctly UNCHECKABLE. None of these five docs
needed a correction.

## 13. Production code / test scan (read-only, per scope)

`apps/web/src/ui/dqkExplore.ts` (2069 lines) and `packages/engine/test/dqkCampaignLegs.test.ts` /
`dqkQuest.test.ts` were grepped for every stale coordinate literal in §4 and §9. None appear in
`dqkExplore.ts` (its only DQK GEO-area-adjacent numeric literals are placeholder `x=0, y=0` combat
test hooks, unrelated to real map positions). `dqkQuest.test.ts` already carries the corrected
values (`dqkQuest.test.ts:185`, confirmed in §6) — it is itself the origin of the area-54
calibration correction, not a Phase-B target. No hard-coded stale pose was found anywhere in
production code or the two forbidden-to-touch test files; there is nothing to hand to Phase B on
this axis beyond the `goldbox_corpus.py:538` naming fix in §11.

## 14. Gates run

- `pnpm --filter @goldbox/engine test` (full suite): 231 test files, 2657 tests, all passed
  (includes the new `dqkGeoShapeCensus.test.ts`, 4 tests).
- `python -m pytest tools/ -q` (`pnpm test:corpus` equivalent): 1257 passed, 1 skipped.
- No `tsc`/`build:app` run — this round's files (`tools/*.py`, this doc, and markdown corrections)
  are outside the web bundle.
