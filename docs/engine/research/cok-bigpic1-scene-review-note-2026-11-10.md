# CoK BIGPIC1 scene review (queue family unit) — 2026-11-10

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md).
Method: [cok-matching-method-decision-2026-11-09.md](cok-matching-method-decision-2026-11-09.md).
Queue: [cok-gap-review-queue-note-2026-11-10.md](cok-gap-review-queue-note-2026-11-10.md).
Previous unit: [cok-pic1-scene-review-note-2026-11-10.md](cok-pic1-scene-review-note-2026-11-10.md).
Review data: `cok-bigpic1-scene-review-2026-11-10.json` (2 pairs, one outcome each).

## Scope

The smallest whole Amiga block-frame family left in the queue: `BIGPIC1.DAA` (2 gap rows, 2 pairs).

- `cok/amiga/disk2/bigpic1.daa/block/114/frame/0` against DOS `cok/dos-ega/disk1/bigpic1.dax/block/114/frame/0`
- `cok/amiga/disk2/bigpic1.daa/block/115/frame/0` against DOS `cok/dos-ega/disk1/bigpic1.dax/block/115/frame/0`

Both are 304 × 120 native RGB on each side.

## Method

Visual judgment on one contact sheet (gap frame beside peer frame, 2× nearest-neighbour). The rule is
the same as the PIC1 unit: `same-scene` when composition and subject match and only the palette or
dithering differs; anything else is `not-same`. No metric or threshold decided an outcome. The
channel-difference counts are evidence only.

## Outcome

- Block 114: same scene. Warrior with a sword and a winged figure in a field, against the same figures
  in the DOS render. Palette differs (the Amiga render has a blue sky and warmer figures).
- Block 115: same scene. The dungeon with purple figures, a torch and a sword-bearing figure, in both
  renders. Dithering and palette differ.

Both became `same-scene` edges with `confidence: verified`, with native-RGB evidence and the visual
review reference. Neither is pixel-identical (differing channel values 815,280 of 1,751,040 and
372,512 of 1,751,040).

## Effect

- Overview gap count: 818 → 814. The queue was regenerated: 814 gaps, 458 with a location peer,
  356 without.
- Amiga block-frame rows left in the queue: 153 → 151 (`comspr.daa` 24, `SPRIT1.DAA` 15,
  `CPIC1.DAA` 20, `CPIC2.DAA` 24, `PIC2.DAA` 41, `SPRIT2.DAA` 21, `BIGPIC2.DAA` 4, `SKY.DAA` 2).

## Limits

- The judgments are visual, on one sheet, and not yet confirmed by a second reviewer.
- Each gap has exactly one location peer in the queue (one DOS frame each). Other DOS frames of block 114 or 115 would appear as more peers; none does.

## Not changed

- No pixel-identical link was added.
- The blank-glyph decision (task 49) and the atlas-cell method exception (task 48) are unchanged.
