# Same-index tile rule: visual result (2026-11-12)

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md).
Rule note: [cok-tile-same-index-candidate-note-2026-11-10.md](cok-tile-same-index-candidate-note-2026-11-10.md).
Candidate list: `cok-tile-same-index-candidates-2026-11-10.json`.
Batch 1 note: [cok-tile-same-index-review-batch1-note-2026-11-10.md](cok-tile-same-index-review-batch1-note-2026-11-10.md).

## Decision applied

User answer 2026-11-12: "attempt a same index rule, but see what happens when verified visually". The rule was
applied in the 2026-11-10 candidate list (same tile index in the same block, no threshold). Visual reads were
recorded as `possible-counterpart` only, not verified same-scene (user answer 2026-11-10).

## Result (checked from the candidate JSON, 2026-11-12)

| Outcome | Pairs |
| --- | --- |
| possible-counterpart | 153 |
| not-same | 11 |
| held-blank-glyph | 2 |
| unreviewed | 0 |
| Total | 166 |

- Batches 1 to 8 cover all 166 pairs. The JSON counts match the per-batch counts.
- No candidate pair is in the registry. `cok-graphics-identity-registry-v1.json` holds 10,601 links. None of them is a
  candidate pair, so the 153 possible-counterparts exist only in the candidate list.
- The registry already has one `possible-counterpart` link (PIC1 block 57). The convention is therefore allowed.

## What the rule did

- Same-index pairs look like the same object in a different palette in most of the 25 blocks that have a
  possible-counterpart. Reads were tentative at 24 by 24 px, so none is verified same-scene.
- The 11 not-same pairs are concentrated in the 8X8D2 and 8X8D3 blocks 11, 171 and 172 (tile indices 38, 49, 67, 68, 69).
  Tile 69 of block 11 is the same tile whose bottom-row mismatch was noted for blocks 192 and 211.
  That is the rule failing on those rows, recorded as not-same, not as a threshold.
- The 2 held-blank-glyph pairs are block 172 tiles 5 and 69 of 8X8D2.DAA. They wait on the blank-glyph decision
  (user answer: exclude, so they stay excluded).

## Decided: candidate list only (2026-11-12, by Opus on the user's delegation)

1. The 153 possible-counterparts stay in the candidate list and are not promoted to registry links. Reasons:
   the browser overview counts any link as cross-platform coverage, the reads are 24x24 and tentative, the rule fails
   inside the same blocks (11 not-same), and partial promotion would need an unapproved cutoff. The 153 records
   are 153 distinct gap-peer pairs, or 105 unordered pairs, because each pair is listed from both sides.
   Revisit only if a higher-zoom review is accepted as same-scene verification, or the browser shows possible
   links as hints (a separate UI task, needs approval).
   Not checked by the subagent: how batches 7 and 8 judged the 41 pairs with no PNG on one side; the browser's
   on-screen rendering.
2. Open (not decided): the assumption in the rule (that tile numbering is comparable between Amiga and DOS) is partly supported (most
   blocks give tentative matches) and partly contradicted (11 pairs). No claim is made beyond these counts.

## Not changed

- No registry edge was added, no status changed, no image was re-viewed in this note. The counts were read from the
  candidate JSON and the registry.
