# CoK SPRIT1 scene review (queue family unit) — 2026-11-10

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md).
Method: [cok-matching-method-decision-2026-11-09.md](cok-matching-method-decision-2026-11-09.md).
Method gap: [cok-scene-review-native-size-gap-2026-11-10.md](cok-scene-review-native-size-gap-2026-11-10.md).
Previous unit: [cok-cpic1-scene-review-note-2026-11-10.md](cok-cpic1-scene-review-note-2026-11-10.md).
Review data: `cok-sprit1-scene-review-2026-11-10.json` (54 pairs, one outcome each).

## Scope

The Amiga `SPRIT1.DAA` block-frame gap rows: 15 rows (blocks 2, 6, 8, 12 and 30, frames 0 to 2), with
54 location peers. The peers are DOS `SPRIT1.DAX` and `SPRIT2.DAX` frames of the same block number.

## Method

Visual judgment on contact sheets (1× scale, eight pairs per sheet), then a larger comparison sheet for
the close calls. The rule is the same as the earlier units: `same-scene` when the same figure is in the
same pose and only the palette, transparency key or dithering differs. Anything else is `not-same`.
Different animation frames of one figure (different pose or scale) are `not-same`.

The native sizes differ in every pair (Amiga 88×88 against DOS frames from 96×196 up to 288×320), so no
channel comparison is possible. `differingChannelValues` is null in the review data, as in the CPIC1 unit.

## Outcome

Same scene (4 pairs):

| Index | Gap | Peer | Subject |
| --- | --- | --- | --- |
| 0 | `sprit1.daa/block/12/frame/0` | `sprit1.dax/block/12/frame/0` | armoured warrior with a mace, sword raised |
| 9 | `sprit1.daa/block/2/frame/0` | `sprit2.dax/block/2/frame/0` | winged demon, wings spread |
| 18 | `sprit1.daa/block/30/frame/0` | `sprit1.dax/block/30/frame/0` | winged gargoyle, crouched, wings up |
| 27 | `sprit1.daa/block/6/frame/0` | `sprit2.dax/block/6/frame/0` | figure with arms raised and legs spread |

Not the same (50 pairs), in the main groups:

- Different animation frames of the same figure at a different scale, for every frame that is not frame
  0 against frame 0 (for example the small warrior of block 12 frame 1 against the large frame 0). These
  are `not-same` because the scale and pose differ.
- Block 2 gap frames 1 and 2 (dark demon) against the pink demon frames: different scale and pose.
- Block 30 frame 1 against the DOS frame 1 (the wing angles differ). Close call; judged not the same.
- Block 6 frame 1 (crouched figure) against the DOS frame 1 (spiral pose). Not the same.
- Block 8, all 18 pairs: the grey beast with a tail against the DOS pink creature. Different designs.
  Two close calls (pairs 36 and 39) were checked on the zoom sheet and are not the same.

## Effect

- Overview gap count: 790 → 782. Each pair removes two gap rows, as before (the DOS peer was also a gap).
- The queue was regenerated: 782 gaps.
- Amiga block-frame rows left in the queue: 139 → 135. `SPRIT1.DAA` 15 → 11: the four rows with a
  same-scene peer are linked; the 11 remaining rows have every peer judged not-same.

## Limits

- The judgments are visual and not confirmed by a second reviewer.
- The four `same-scene` edges rest on visual match at different native resolutions, the same limit as the
  CPIC1 unit. See the method gap note, which now also covers this family.
- Several of the close calls (block 30 frame 1, block 6 frame 1, block 8) are the most likely to be
  revisited by a second reviewer.

## Not changed

- No pixel-identical link was added.
- The blank-glyph decision (task 49) and the atlas-cell method exception (task 48) are unchanged.
