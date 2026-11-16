# CoK CPIC2 scene review (queue family unit) — 2026-11-10

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md).
Method: [cok-matching-method-decision-2026-11-09.md](cok-matching-method-decision-2026-11-09.md).
Method gap: [cok-scene-review-native-size-gap-2026-11-10.md](cok-scene-review-native-size-gap-2026-11-10.md).
Previous unit: [cok-cpic1-scene-review-note-2026-11-10.md](cok-cpic1-scene-review-note-2026-11-10.md).
Review data: `cok-cpic2-scene-review-2026-11-10.json` (26 pairs, one outcome each).

## Scope

The Amiga `CPIC2.DAA` block-frame gap rows: 24 rows, 26 location peers (DOS `CPIC2.DAX` and `CPIC3.DAX`
frames of the same block number, as listed in the review data).

## Method

Visual judgment on contact sheets (gap frame beside peer frame, 2x) and a zoom sheet for the close calls.
The rule is the same as the earlier units: `same-scene` when composition and subject match and only the
palette, transparency key or dithering differs; anything else is `not-same`.

The native sizes differ in every pair (Amiga 24×24, 24×48 or 48×24 against DOS 96×96, 96×192 or
192×96), so no channel comparison is possible. `differingChannelValues` is null in the review data, as in
the CPIC1 and SPRIT1 units. The method gap is recorded in the dated note linked above (option a is the
default).

## Outcome

Same scene (23 pairs): the same figure or creature in the same pose, palette only.

Not the same (3 pairs), all on the zoom sheet:

| Index | Gap | Peer | Reason |
| --- | --- | --- | --- |
| 10 | `cpic2.daa/block/152` | `cpic3.dax/block/152` | armoured figure with yellow trim against a hooded, blue-and-grey figure |
| 16 | `cpic2.daa/block/18` | `cpic3.dax/block/18` | purple-caped figure with a staff against a grey armoured figure |
| 20 | `cpic2.daa/block/24` | `cpic3.dax/block/24` | dark armoured figure against a blue sword figure; the arm and stance differ |

Pair 20 is the closest call. The pose differs in the arms and legs, so it is `not-same`. A second reviewer
could read it differently.

## Duplicate gaps and pre-existing pixel-identical peers

- Block 145 (pairs 5 and 6) and block 17 (pairs 14 and 15) each have two DOS peers, one in `cpic2.dax` and
  one in `cpic3.dax`. Each pair is judged separately, and the outcome is the same for both.
- For these two blocks, the two DOS peers were already pixel-identical to each other (same native RGB hash)
  before this unit, so they were already non-gap rows. That is why the gap count falls by 40, not 44: 21
  unique Amiga gaps and 23 peer rows, minus 4 peer rows already linked.

## Effect

- Overview gap count: 782 → 742. The "No direct counterpart" count in the browser (`?graphics=1&versions=1`)
  now reads 742, the same as the queue.
- The queue was regenerated: 742 gaps, 386 with a location peer, 356 without.
- `CPIC2.DAA` rows left in the queue: 24 → 3 (blocks 18, 24 and 152, all judged not-same).
- Amiga block-frame rows in the queue (filtered on Amiga, block-frame, either status): 121.

## Limits

- The judgments are visual and not confirmed by a second reviewer.
- The 23 `same-scene` edges rest on visual match at different native resolutions, the same limit as the
  CPIC1 and SPRIT1 units. See the method gap note. Option (a) is the default; (b) or (c) is still open.
- Block 24 (pair 20) is the closest call among the not-same pairs.

## Not changed

- No pixel-identical link was added.
- The blank-glyph decision (task 49) and the atlas-cell method exception (task 48) are unchanged.
