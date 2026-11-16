# CoK comspr scene review (queue family unit) — 2026-11-10

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md).
Method: [cok-matching-method-decision-2026-11-09.md](cok-matching-method-decision-2026-11-09.md).
Method gap: [cok-scene-review-native-size-gap-2026-11-10.md](cok-scene-review-native-size-gap-2026-11-10.md).
Previous unit: [cok-sprit2-scene-review-note-2026-11-10.md](cok-sprit2-scene-review-note-2026-11-10.md).
Review data: `cok-comspr-scene-review-2026-11-10.json` (24 pairs, one outcome each).

## Scope

The Amiga `comspr.daa` block-frame gap rows: 30 rows, of which 24 have one location peer each (DOS
`comspr.dax`, same block number, frame 0) and 6 have no peer. The 6 peerless rows are not reviewed here and
stay in the queue as `no-existing-field-peer`. All gap frames are 24×24.

## Method

Visual judgment on 2× contact sheets (two sheets, 12 pairs each), then a zoom sheet for the uncertain pairs.

The rule is the same as the earlier units: `same-scene` when the same object or effect appears in the same
shape, orientation and layout, and only the palette, transparency key or dithering differs. Anything else is
`not-same`.

Unlike the CPIC and SPRIT families, the native sizes match (both sides are 24×24). The channel comparison
was therefore computed. It is evidence only and did not decide any outcome. For the same-scene pairs,
row-major RGB differs in 1,644 to 1,717 of 1,728 channel values, which is expected when only the palette
changes.

Two layout checks were made on the zoom sheet:

- For the sparkle fields (pairs 13 and 23) and the blade cluster (pair 9), the gap and DOS elements sit at a
  constant horizontal offset of about 245 px on the sheet. The layout matches, and only the palette differs.
  An earlier 2× read of pair 13 had called the arrangement different; the offset check reversed that call.
- For the lightning pairs (10 and 20), no such offset matches, because the shapes differ.

## Outcome

Same scene (20 pairs):

| Index | Gap | Subject |
| --- | --- | --- |
| 0 | `comspr.daa/block/0` | arrow, head up |
| 1 | `comspr.daa/block/1` | arrow, diagonal |
| 3 | `comspr.daa/block/11` | skull and crossbones on red |
| 4 | `comspr.daa/block/128` | arrow, head down |
| 5 | `comspr.daa/block/129` | arrow, diagonal |
| 6 | `comspr.daa/block/130` | arrow, horizontal |
| 7 | `comspr.daa/block/131` | sword with a blob |
| 8 | `comspr.daa/block/132` | comet with a trail (tail length differs slightly) |
| 9 | `comspr.daa/block/133` | three blades in a cluster |
| 11 | `comspr.daa/block/135` | round rock with an orange patch |
| 12 | `comspr.daa/block/136` | small brown blob |
| 13 | `comspr.daa/block/137` | sparkle field (same layout) |
| 15 | `comspr.daa/block/139` | skull and crossbones on red |
| 16 | `comspr.daa/block/2` | arrow, horizontal |
| 17 | `comspr.daa/block/3` | axe |
| 18 | `comspr.daa/block/4` | comet with a trail |
| 19 | `comspr.daa/block/5` | three blades in a cluster |
| 21 | `comspr.daa/block/7` | round rock with an orange patch |
| 22 | `comspr.daa/block/8` | small brown blob |
| 23 | `comspr.daa/block/9` | sparkle field (same layout) |

Not the same (4 pairs):

| Index | Gap | Reason |
| --- | --- | --- |
| 2 | `comspr.daa/block/10` | fireball against a small red star |
| 10 | `comspr.daa/block/134` | purple zigzag web against a cyan bolt with branches (low confidence; see below) |
| 14 | `comspr.daa/block/138` | speckled fireball against a red starburst |
| 20 | `comspr.daa/block/6` | purple lightning web against a single cyan bolt (low confidence) |

Pairs 10 and 20 are the close calls. They are both lightning effects, but the Amiga web has no single bolt
structure and the DOS bolt has a clear trunk and branches. A second reviewer could read them differently.
An earlier 1× read had called pair 10 the same scene; it was changed to not-same on the zoom sheet.

## Effect

- Overview gap count: 714 → 674. Each pair removes two rows (the gap and its DOS peer). None of the 20
  peers had an existing link, so the drop is the full 40 rows.
- The queue was regenerated: 674 gaps, 318 with a location peer, 356 without.
- Amiga block-frame rows left in the queue: 106 → 86. `comspr.daa` 30 → 10: the 20 same-scene rows are
  linked; 4 are not-same (blocks 6, 10, 134 and 138), and 6 have no peer.

## Limits

- The judgments are visual and not confirmed by a second reviewer.
- The 20 `same-scene` edges are palette-only changes at equal native size. The channel differences are
  recorded as evidence. They are not a threshold, and the edges are not pixel-identical.
- The comet (pairs 8 and 18) and the sparkle and rock pairs are the weakest same-scene calls. Pairs 10 and 20
  are the weakest not-same calls.

## Not changed

- No pixel-identical link was added.
- The blank-glyph decision (task 49) and the atlas-cell method exception (task 48) are unchanged.
