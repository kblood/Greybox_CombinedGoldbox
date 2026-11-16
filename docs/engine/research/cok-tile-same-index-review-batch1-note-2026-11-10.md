# Same-index tile review, batch 1 (candidates 0–23) — 2026-11-10

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md).
Candidate rule: [cok-tile-same-index-candidate-note-2026-11-10.md](cok-tile-same-index-candidate-note-2026-11-10.md).
Candidate list: `cok-tile-same-index-candidates-2026-11-10.json`.

## What was done

- 125 of the 166 candidate pairs have decoded PNGs on both sides. The other 41 endpoints have no PNG, so those pairs
  cannot be judged visually yet.
- Batch 1 is the first 24 usable pairs (candidate indices 0–23). Contact sheet: 96 px nearest-neighbour per tile,
  Amiga left, DOS right, both 24×24.

## Result: no edges added

The visual read is too uncertain to record as a verified same-scene edge:

- Indices 0–5, 6–9 (the RANDCOM and WILDCOM trees and bushes), 10–17 (sprouts, branches and orange blobs) look like
  the same object in a different palette. That is a tentative same-scene read, not a checked one.
- Indices 18–20 (tree and orange blob groups) are similar but have more variation between the two sides.
- Indices 21–23 (scattered specks) are too small and too alike to tell apart by eye.

At this size the judgments are weak. A same-scene edge is verified only when a reviewer confirms it. This batch
does not give that confirmation, so every candidate stays `outcome: null`.

## Question for the user (see goal file, entry 129)

Do tile candidates count as verified same-scene after a visual read at 24×24, or only as possible-counterpart?
The method says verified edges need visual review. A tile at this size makes that judgment hard, and the batch
shows it.

## Not changed

- No edge, status or queue entry changed.
- Pairs with no PNG (41 endpoints) remain unreviewed.
