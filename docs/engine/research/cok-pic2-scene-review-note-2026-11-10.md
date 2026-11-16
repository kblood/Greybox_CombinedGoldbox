# CoK PIC2 scene review (queue family unit) — 2026-11-10

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md).
Method: [cok-matching-method-decision-2026-11-09.md](cok-matching-method-decision-2026-11-09.md).
Method gap: [cok-scene-review-native-size-gap-2026-11-10.md](cok-scene-review-native-size-gap-2026-11-10.md).
Previous unit: [cok-comspr-scene-review-note-2026-11-10.md](cok-comspr-scene-review-note-2026-11-10.md).
Review data: `cok-pic2-scene-review-2026-11-10.json` (166 pairs, one outcome each).

## Scope

The Amiga `PIC2.DAA` block-frame gap rows: 41 rows (all 88×88, blocks 0, 10, 16, 17, 22, 24, 25, 26, 28, 3, 32, 33, 4, 56, 64, 65, 66, 70, 71, 72, 73 and frames 0 to 5), with 166 location pairs. The peers are DOS `PIC3.DAX` (34 unique frames) and `PIC2.DAX` (16 unique frames) of the same block number.

## Method

Visual judgment on 2× contact sheets (gap frame beside peer frame), six sheets for the 46 frame-matched pairs. The frame-index rule from the SPRIT1 and SPRIT2 units applies:

- `same-scene` only when the gap frame and the DOS peer frame have the same animation frame index, the same figure and the same pose, and only the palette, transparency key or dithering differs.
- A pair whose frame indices differ is `not-same` (it compares different animation frames of one figure).

This is an application of the existing rule to the frame index, not a new threshold. No metric decided an outcome. The 120 cross-frame pairs were not viewed. The review script asserts that each of them has a different frame index from its peer and that all 46 frame-matched pairs were judged.

Every pair is equal size (88×88 on both sides), so the channel comparison was computed. It is evidence only: the 24 same-scene pairs differ in 3,826 to 11,684 of 23,232 channel values (all 166 pairs range from 3,826 to 20,536). Palette-only changes are expected to give large channel differences, so the count does not separate the two outcomes. The method gap note does not apply to this family.

## Outcome

Same scene (24 frame-matched pairs):

| Index | Gap | Peer |
| --- | --- | --- |
| 0 | `pic2.daa/block/0/frame/0` | `pic3.dax/block/0/frame/0` |
| 1 | `pic2.daa/block/10/frame/0` | `pic2.dax/block/10/frame/0` |
| 7 | `pic2.daa/block/16/frame/0` | `pic3.dax/block/16/frame/0` |
| 9 | `pic2.daa/block/17/frame/0` | `pic2.dax/block/17/frame/0` |
| 10 | `pic2.daa/block/17/frame/0` | `pic3.dax/block/17/frame/0` |
| 15 | `pic2.daa/block/22/frame/0` | `pic3.dax/block/22/frame/0` |
| 21 | `pic2.daa/block/24/frame/0` | `pic3.dax/block/24/frame/0` |
| 25 | `pic2.daa/block/25/frame/0` | `pic2.dax/block/25/frame/0` |
| 26 | `pic2.daa/block/25/frame/0` | `pic3.dax/block/25/frame/0` |
| 27 | `pic2.daa/block/26/frame/0` | `pic3.dax/block/26/frame/0` |
| 31 | `pic2.daa/block/28/frame/0` | `pic2.dax/block/28/frame/0` |
| 33 | `pic2.daa/block/3/frame/0` | `pic3.dax/block/3/frame/0` |
| 34 | `pic2.daa/block/32/frame/0` | `pic3.dax/block/32/frame/0` |
| 35 | `pic2.daa/block/33/frame/0` | `pic2.dax/block/33/frame/0` |
| 36 | `pic2.daa/block/4/frame/0` | `pic2.dax/block/4/frame/0` |
| 37 | `pic2.daa/block/4/frame/0` | `pic3.dax/block/4/frame/0` |
| 38 | `pic2.daa/block/56/frame/0` | `pic2.dax/block/56/frame/0` |
| 39 | `pic2.daa/block/64/frame/0` | `pic3.dax/block/64/frame/0` |
| 40 | `pic2.daa/block/65/frame/0` | `pic3.dax/block/65/frame/0` |
| 41 | `pic2.daa/block/66/frame/0` | `pic3.dax/block/66/frame/0` |
| 42 | `pic2.daa/block/70/frame/0` | `pic2.dax/block/70/frame/0` |
| 43 | `pic2.daa/block/71/frame/0` | `pic3.dax/block/71/frame/0` |
| 44 | `pic2.daa/block/72/frame/0` | `pic3.dax/block/72/frame/0` |
| 45 | `pic2.daa/block/73/frame/0` | `pic3.dax/block/73/frame/0` |

Not the same (22 frame-matched pairs judged not the same), plus 120 cross-frame pairs (not-same by the frame rule):

| Index | Gap | Peer |
| --- | --- | --- |
| 2 | `pic2.daa/block/10/frame/1` | `pic2.dax/block/10/frame/1` |
| 3 | `pic2.daa/block/10/frame/2` | `pic2.dax/block/10/frame/2` |
| 4 | `pic2.daa/block/10/frame/3` | `pic2.dax/block/10/frame/3` |
| 5 | `pic2.daa/block/10/frame/4` | `pic2.dax/block/10/frame/4` |
| 6 | `pic2.daa/block/10/frame/5` | `pic2.dax/block/10/frame/5` |
| 8 | `pic2.daa/block/16/frame/1` | `pic3.dax/block/16/frame/1` |
| 11 | `pic2.daa/block/17/frame/1` | `pic2.dax/block/17/frame/1` |
| 12 | `pic2.daa/block/17/frame/1` | `pic3.dax/block/17/frame/1` |
| 13 | `pic2.daa/block/17/frame/2` | `pic2.dax/block/17/frame/2` |
| 14 | `pic2.daa/block/17/frame/2` | `pic3.dax/block/17/frame/2` |
| 16 | `pic2.daa/block/22/frame/1` | `pic3.dax/block/22/frame/1` |
| 17 | `pic2.daa/block/22/frame/2` | `pic3.dax/block/22/frame/2` |
| 18 | `pic2.daa/block/22/frame/3` | `pic3.dax/block/22/frame/3` |
| 19 | `pic2.daa/block/22/frame/4` | `pic3.dax/block/22/frame/4` |
| 20 | `pic2.daa/block/22/frame/5` | `pic3.dax/block/22/frame/5` |
| 22 | `pic2.daa/block/24/frame/1` | `pic3.dax/block/24/frame/1` |
| 23 | `pic2.daa/block/24/frame/2` | `pic3.dax/block/24/frame/2` |
| 24 | `pic2.daa/block/24/frame/3` | `pic3.dax/block/24/frame/3` |
| 28 | `pic2.daa/block/26/frame/1` | `pic3.dax/block/26/frame/1` |
| 29 | `pic2.daa/block/26/frame/2` | `pic3.dax/block/26/frame/2` |
| 30 | `pic2.daa/block/26/frame/3` | `pic3.dax/block/26/frame/3` |
| 32 | `pic2.daa/block/28/frame/1` | `pic2.dax/block/28/frame/1` |

Close calls (judged not the same, low confidence): sheet index 8 (block 16 frame 1; the DOS decode is garbled), sheet indices 12 to 14 (block 17 frames 1 and 2), and sheet indices 22 and 23 (block 24 frames 1 and 2). The weakest same-scene call is sheet index 21 (block 24 frame 0, the skull-helmet figure with a palette change).

Sheet indices are the frame-matched order (`pic2-frame-matched.json`, index `k` = the k-th frame-matched pair in that order). They are not the review-data pair index.

## Effect

- Overview gap count: 674 → 635. The drop is 39 rows: 21 unique gap rows, plus 24 unique peer rows minus 6 peers that were already linked (blocks 4, 17 and 25, in both `pic2.dax` and `pic3.dax`). 24 new `same-scene` / `verified` edges were added.
- The queue was regenerated: 635 gaps, 279 with a location peer, 356 without.
- `PIC2.DAA` rows left in the queue: 41 → 20 (all still `review-location-peer`).
- Amiga block-frame rows left in the queue: 86 → 65.

## Limits

- The judgments are visual and not confirmed by a second reviewer.
- The 24 `same-scene` edges are palette-only changes at equal native size. The channel differences are recorded as evidence. They are not a threshold, and the edges are not pixel-identical.
- The frame-index rule is the reason the 120 cross-frame pairs are not-same. A reviewer who accepts cross-frame matches for this sprite family would need a separate decision.

## Not changed

- No pixel-identical link was added.
- The blank-glyph decision (task 49) and the atlas-cell method exception (task 48) are unchanged.
