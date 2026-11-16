# CoK SKY and BIGPIC2 scene review (queue family unit) — 2026-11-10

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md).
Method: [cok-matching-method-decision-2026-11-09.md](cok-matching-method-decision-2026-11-09.md).
Queue: [cok-gap-review-queue-note-2026-11-10.md](cok-gap-review-queue-note-2026-11-10.md).
Previous unit: [cok-bigpic1-scene-review-note-2026-11-10.md](cok-bigpic1-scene-review-note-2026-11-10.md).
Review data: `cok-sky-bigpic2-scene-review-2026-11-10.json` (6 pairs, one outcome each).

## Scope

Two small Amiga block-frame families, reviewed together (6 gap rows, 6 pairs):

- `SKY.DAA` blocks 250 and 251 (88×16 clouds; 24×24 sun), against DOS `SKY.DAX` blocks 250 and 251.
- `BIGPIC2.DAA` blocks 117, 118, 119 and 120 (304×120 pictures), against DOS `BIGPIC3.DAX` blocks 117,
  118 and 120, and DOS `BIGPIC2.DAX` block 119.

## Method

Visual judgment on one contact sheet (gap frame beside peer frame, 2× nearest-neighbour). The rule is
the same as the earlier units: `same-scene` when composition and subject match and only the palette,
transparency key or dithering differs; anything else is `not-same`. No metric or threshold decided an
outcome. The channel-difference counts are evidence only.

Sampling: the Amiga PNGs are exported at 8× and the DOS PNGs at 4× (the registry native sizes agree).
For the channel comparison each PNG was sampled back to its native grid at cell centres. Every sampled
image reproduces its registry `pixelSha256` exactly (checked for all 12 sources), so the comparison
uses the native pixels.

## Outcome

All six pairs are the same scene in a different palette, transparency key or dithering:

| Index | Gap | Peer | Note |
| --- | --- | --- | --- |
| 0 | `sky.daa/block/250` | `sky.dax/block/250` | cloud strip; DOS background is magenta, Amiga black |
| 1 | `sky.daa/block/251` | `sky.dax/block/251` | sun; DOS background is magenta, Amiga black |
| 2 | `bigpic2.daa/block/117` | `bigpic3.dax/block/117` | dragon; wings orange (Amiga) vs magenta (DOS) |
| 3 | `bigpic2.daa/block/118` | `bigpic3.dax/block/118` | castle with dragons; palette and dithering |
| 4 | `bigpic2.daa/block/119` | `bigpic2.dax/block/119` | bearded man at the door; palette and dithering |
| 5 | `bigpic2.daa/block/120` | `bigpic3.dax/block/120` | party with dragon; palette |

All six became `same-scene` edges with `confidence: verified`, with native-RGB evidence and the visual
review reference. None is pixel-identical. Channel differences (native samples): 2,764 of 4,224;
1,153 of 1,728; 39,452 of 109,440; 54,397 of 109,440; 45,478 of 109,440; 58,452 of 109,440.

## Effect

- Overview gap count: 814 → 802. Each pair removes two rows from the gap list, because the DOS peer was
  also a no-counterpart gap. The same effect was seen in the BIGPIC1 unit (818 → 814 for 2 pairs).
- The queue was regenerated: 802 gaps, 446 with a location peer, 356 without.
- Amiga block-frame rows left in the queue: 151 → 145 (`comspr.daa` 24, `SPRIT1.DAA` 15, `CPIC1.DAA` 20,
  `CPIC2.DAA` 24, `PIC2.DAA` 41, `SPRIT2.DAA` 21). `SKY.DAA` and `BIGPIC2.DAA` are finished.

## Limits

- The judgments are visual, on one sheet, and not yet confirmed by a second reviewer.
- The `BIGPIC2.DAA` block 119 peer is in `BIGPIC2.DAX` (disk 2), not `BIGPIC3.DAX`; the locator is the
  queue's own peer.

## Not changed

- No pixel-identical link was added.
- The blank-glyph decision (task 49) and the atlas-cell method exception (task 48) are unchanged.
