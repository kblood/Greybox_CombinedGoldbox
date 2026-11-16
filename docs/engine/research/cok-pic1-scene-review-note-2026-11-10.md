# CoK PIC1 scene review (first queue review) — 2026-11-10

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md).
Method: [cok-matching-method-decision-2026-11-09.md](cok-matching-method-decision-2026-11-09.md).
Queue: [cok-gap-review-queue-note-2026-11-10.md](cok-gap-review-queue-note-2026-11-10.md).
Review data: `cok-pic1-scene-review-2026-11-10.json` (59 pairs, one outcome each).

## Scope

The first review unit of the gap queue: the 13 Amiga `PIC1.DAA` block-frame gap rows, paired with all
of their location peers (same archive family and block number on another platform). That gives 59
pairs: 12 Amiga frames against DOS disk 1 `PIC1.DAX` block 12, and single or multi-frame peers for blocks
2, 6, 15, 30, 34, 51, 54, 58, 61, 62 and 63.

## Method

Each pair was judged visually on contact sheets (gap frame beside peer frame, 2× nearest-neighbour).
A pair is `same-scene` when the composition and subject match and only the palette or dithering differs.
Anything else is `not-same`. No metric or threshold was used to decide an outcome. The channel-difference
counts recorded in the review file are evidence only; they are not used to decide.

## Outcome

- Same scene: 21 pairs. Each became a `same-scene` edge with `confidence: verified`, using the same
  format as the three existing edges (native RGB hashes, channel-difference count, visual-review note).
- Same scene, duplicate locator: 2 pairs (index 34, 35). Their peers are entry-level locators with pixels
  identical to index 36, so they are not recorded as separate edges.
- Not the same: 36 pairs. Almost all are DOS sub-frames 1–3 of a block, which are sprite fragments, not
  the Amiga picture.

Same-scene blocks: 12 (frames 0–3 vs DOS f0), 15, 2, 30 (frames 0–3 vs DOS f0), 34 (vs DOS disk 2 `PIC2.DAX`
f0), 51, 54, 58, 6 (frames 0–3 vs DOS f0), 61, 62, 63.

## Effect

- Overview gap count: 850 → 818. Cross-platform recorded: 4,587 → 4,620. Same-platform-only: 630 → 629.
- The queue was regenerated (`tools/cok_gap_review_queue.mjs --write`): 818 gaps, 462 with a location
  peer, 356 without.

## Limits

- The judgments are visual. A reviewer should confirm the 21 edges before they are relied on for
  anything beyond the overview.
- Block 34 has two more DOS peers at entry-level locators (`block/34/entry/12` and `entry/3`) with pixels
  identical to the DOS disk 2 peer. Same scene, but not recorded as separate edges, because their locator
  kind differs.
- The other 33 PIC1 peers were not reviewed in this unit: the rest of the queue (the 2 remaining Amiga
  block-frame families, DOS-EGA block-frame rows, and the tile and whole-image rows).

## Not changed

- No pixel-identical link was added. These pairs differ in native RGB.
- The blank-glyph decision (goal file task 49) and the atlas-cell method exception (task 48) are unchanged.
