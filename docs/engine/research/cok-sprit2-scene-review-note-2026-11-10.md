# CoK SPRIT2 scene review (queue family unit) — 2026-11-10

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md).
Method: [cok-matching-method-decision-2026-11-09.md](cok-matching-method-decision-2026-11-09.md).
Method gap: [cok-scene-review-native-size-gap-2026-11-10.md](cok-scene-review-native-size-gap-2026-11-10.md).
Previous unit: [cok-cpic2-scene-review-note-2026-11-10.md](cok-cpic2-scene-review-note-2026-11-10.md).
Review data: `cok-sprit2-scene-review-2026-11-10.json` (72 pairs, one outcome each).

## Scope

The Amiga `SPRIT2.DAA` block-frame gap rows: 21 rows (blocks 0, 10, 16, 22, 24, 26 and 3, frames 0 to 2),
with 72 location peers. The peers are DOS `SPRIT3.DAX` (54) and `SPRIT2.DAX` (18) frames of the same block
number.

## Method

Visual judgment on 1× contact sheets (nine sheets, eight pairs each), then a zoom sheet for the close calls.

The rule is the SPRIT1 rule, applied to frame indices:

- `same-scene` only when the gap frame and the DOS peer frame have the same animation frame index, the same
  figure and the same pose, and only the palette, transparency key or dithering differs.
- A pair whose frame indices differ is `not-same`, because it compares different animation frames of one
  figure (the SPRIT1 rule). These pairs were checked on the contact sheets, and none of them was a
  frame-index match.

This is an application of the existing rule to the frame index, not a new threshold. No metric decided an
outcome.

The native sizes differ in every pair (the Amiga frames are 88×88; the DOS frames range from 96×196 up to
288×320), so no channel comparison is possible. `differingChannelValues` is null in the review data, as in
the CPIC1, SPRIT1 and CPIC2 units.

## Outcome

Same scene (17 pairs, all frame-index matches):

| Index | Gap | Peer | Subject |
| --- | --- | --- | --- |
| 9 | `sprit2.daa/block/10/frame/0` | `sprit2.dax/block/10/frame/0` | green winged creature, wings up, orange ribs |
| 13 | `sprit2.daa/block/10/frame/1` | `sprit2.dax/block/10/frame/1` | same creature, smaller frame |
| 17 | `sprit2.daa/block/10/frame/2` | `sprit2.dax/block/10/frame/2` | same creature, smallest frame |
| 18 | `sprit2.daa/block/16/frame/0` | `sprit3.dax/block/16/frame/0` | horned axe warrior, arms bent |
| 22 | `sprit2.daa/block/16/frame/1` | `sprit3.dax/block/16/frame/1` | horned figure with a blue chest, axe (weak pose match) |
| 26 | `sprit2.daa/block/16/frame/2` | `sprit3.dax/block/16/frame/2` | horned figure with a blue chest, tiny (weak pose match) |
| 27 | `sprit2.daa/block/22/frame/0` | `sprit3.dax/block/22/frame/0` | red dragon, wings up |
| 31 | `sprit2.daa/block/22/frame/1` | `sprit3.dax/block/22/frame/1` | red dragon, crouched |
| 35 | `sprit2.daa/block/22/frame/2` | `sprit3.dax/block/22/frame/2` | red dragon, small |
| 36 | `sprit2.daa/block/24/frame/0` | `sprit3.dax/block/24/frame/0` | armoured warrior, sword up, shield |
| 45 | `sprit2.daa/block/26/frame/0` | `sprit2.dax/block/26/frame/0` | skeleton warrior, sword up, shield |
| 48 | `sprit2.daa/block/26/frame/0` | `sprit3.dax/block/26/frame/0` | skeleton warrior, sword up, shield |
| 52 | `sprit2.daa/block/26/frame/1` | `sprit2.dax/block/26/frame/1` | skeleton warrior, arm raised, shield |
| 55 | `sprit2.daa/block/26/frame/1` | `sprit3.dax/block/26/frame/1` | skeleton warrior, arm raised, shield |
| 63 | `sprit2.daa/block/3/frame/0` | `sprit3.dax/block/3/frame/0` | winged demon, wings up |
| 67 | `sprit2.daa/block/3/frame/1` | `sprit3.dax/block/3/frame/1` | winged demon, smaller frame |
| 71 | `sprit2.daa/block/3/frame/2` | `sprit3.dax/block/3/frame/2` | winged demon, smallest frame |

Not the same (55 pairs):

- 48 pairs are cross-frame matches (gap frame index not equal to peer frame index). Examples: block 0 gap
  frames against the other DOS frames; block 10 gap frame 0 against DOS frames 1 and 2.
- 7 pairs are frame-index matches judged not the same: pairs 0, 4 and 8 (block 0, the robed figure against
  a pink figure with arms out, at each frame), pair 40 (block 24 frame 1, the crouched figure against an
  upright pink figure), and pairs 44, 59 and 62 (tiny figures at frame 2, where the pose could not be
  confirmed; low confidence).

## Effect

- Overview gap count: 742 → 714. Each linked pair removes its gap row and its DOS peer row, unless the peer
  already had a link. Four DOS peers (block 26 frames 0 and 1 in `sprit2.dax` and `sprit3.dax`) already
  had links, so the drop is 28 rows, not 34 (15 gap rows + 17 peers − 4).
- The queue was regenerated: 714 gaps, 358 with a location peer, 356 without.
- Amiga block-frame rows left in the queue: 121 → 106. `SPRIT2.DAA` 21 → 6. The six open rows are block 0
  frames 0 to 2, block 24 frames 1 and 2, and block 26 frame 2. Their frame-index matches were judged
  not the same.

## Limits

- The judgments are visual and not confirmed by a second reviewer.
- The 17 `same-scene` edges rest on visual match at different native resolutions, the same limit as the
  CPIC1, SPRIT1 and CPIC2 units. See the method gap note. Option (a) is the default; (b) or (c) is still open.
- Pairs 22, 26 and 52 are the weakest matches. Pairs 44, 59 and 62 are the weakest not-same calls.
- The frame-index rule (same frame index only) is the reason 48 cross-frame pairs are not-same. A reviewer
  who accepts cross-frame matches for this sprite family would need a separate decision.

## Not changed

- No pixel-identical link was added.
- The blank-glyph decision (task 49) and the atlas-cell method exception (task 48) are unchanged.
