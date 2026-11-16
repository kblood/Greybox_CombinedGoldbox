# CoK CPIC1 scene review (queue family unit) — 2026-11-10

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md).
Method: [cok-matching-method-decision-2026-11-09.md](cok-matching-method-decision-2026-11-09.md).
Method gap: [cok-scene-review-native-size-gap-2026-11-10.md](cok-scene-review-native-size-gap-2026-11-10.md).
Queue: [cok-gap-review-queue-note-2026-11-10.md](cok-gap-review-queue-note-2026-11-10.md).
Review data: `cok-cpic1-scene-review-2026-11-10.json` (28 pairs, one outcome each).

## Scope

The Amiga `CPIC1.DAA` block-frame gap rows: 20 rows, 28 location peers (DOS `CPIC1.DAX`, `CPIC2.DAX` and
`CPIC3.DAX`).

## Method

Visual judgment on contact sheets (gap frame beside peer frame) and a larger comparison sheet for the
close calls. The rule is the same as the earlier units: `same-scene` when composition and subject match
and only the palette, transparency key or dithering differs; anything else is `not-same`.

Unlike the earlier units, the native sizes differ in every pair: the Amiga frames are 24×24, 24×48 or
48×24, and the DOS frames are 96×96, 96×192 or 192×96 (the same 4× ratio throughout). No channel
comparison is possible, so `differingChannelValues` is recorded as null. The method gap is recorded in
the dated note linked above.

## Outcome

Same scene (6 pairs, all visually the same composition with a palette difference):

| Index | Gap | Peer | Subject |
| --- | --- | --- | --- |
| 5 | `cpic1.daa/block/130` | `cpic2.dax/block/130` | creature with a red head, wings and white claws |
| 15 | `cpic1.daa/block/158` | `cpic1.dax/block/158` | white dragon, head right with a red mouth |
| 18 | `cpic1.daa/block/179` | `cpic2.dax/block/179` | robed figure with a cross staff and shield |
| 19 | `cpic1.daa/block/2` | `cpic2.dax/block/2` | creature with a red head and white claws |
| 23 | `cpic1.daa/block/30` | `cpic1.dax/block/30` | white dragon, head right with a red mouth |
| 26 | `cpic1.daa/block/51` | `cpic2.dax/block/51` | robed figure with a cross staff and shield |

Not the same (22 pairs), in the main groups:

- Armoured figure with checkered armour against a cyan or green-tunic figure (blocks 12, 13, 137, 140,
  141, 9): different characters.
- Blonde checkered warrior against a red or green warrior (blocks 48, 176): different characters.
- Crouching red creature (block 11, 139) against a standing warrior: different subject.
- Coiled green serpent against an elongated green serpent (blocks 27, 155): different poses.
- Purple arch creature (block 29) and tentacle figure (block 157) against grey creatures: different
  subjects.

All six same-scene edges use `confidence: verified`. Their evidence is the native-size note, the pixel
hashes (which differ), and the visual-review reference. None is pixel-identical.

## Effect

- Overview gap count: 802 → 790. Each pair removes two gap rows (the DOS peer was also a gap).
- The queue was regenerated: 790 gaps, 434 with a location peer, 356 without.
- Amiga block-frame rows left in the queue: 145 → 139. `CPIC1.DAA` 20 → 14: the 14 remaining rows have
  every peer judged not-same, so they stay open as gaps.

## Limits

- The judgments are visual and not confirmed by a second reviewer.
- The 6 same-scene edges rest on a visual match at different native resolutions. The 4× size ratio is
  consistent across the family, but this does not prove the same art source. See the method gap note.
- The DOS `CPIC1.DAX` block 30 and block 158 peers are the only location peers for their gaps.

## Not changed

- No pixel-identical link was added.
- The blank-glyph decision (task 49) and the atlas-cell method exception (task 48) are unchanged.
