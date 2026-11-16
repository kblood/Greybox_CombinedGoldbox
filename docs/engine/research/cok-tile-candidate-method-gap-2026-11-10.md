# Method gap: tile and whole-image candidates for scene review — 2026-11-10

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md).
Method: [cok-matching-method-decision-2026-11-09.md](cok-matching-method-decision-2026-11-09.md).
Related gap: [cok-scene-review-native-size-gap-2026-11-10.md](cok-scene-review-native-size-gap-2026-11-10.md).
Previous unit: [cok-dos-blockframe-scene-review-note-2026-11-10.md](cok-dos-blockframe-scene-review-note-2026-11-10.md).

## Where the work stands

After the DOS-EGA block-frame unit, every block-frame gap row that has a location peer has a reviewed outcome. Under the queue as it stands (`cok-gap-review-queue-2026-11-10.json`, 624 gaps), the only rows still unreviewed are:

| Kind | Rows | Location peers (candidate pairs) |
| --- | --- | --- |
| tile (Amiga and DOS-EGA) | 134 | 8,292 pairs across the 151 rows (per-row minimum 6, median 50, maximum 281) |
| whole-image (DOS-EGA) | 17 | included in the 8,292 |

Every row is `review-location-peer`: a peer exists by archive family and block number, and nothing is linked.

## Checks made

- Exact pixel identity: none of the 151 gap rows shares a native RGB hash with any of its location peers. So the automatic `pixel-identical` rule closes nothing here.
- The frame-index rule used for block-frame families does not apply: tile and whole-image rows have a `tileIndex` (or no frame index), and the peers are every tile of the same block.

## The gap

The method decision says `same-scene` needs a person to confirm the scene, and `possible-counterpart` is for unreviewed candidates. It does not say which pairs are candidates for tiles. The queue's `review-location-peer` field pairs every tile with every tile of the same block. That gives 8,292 candidates, most of which cannot be the same scene.

Choosing a candidate rule would be a new rule, so it needs a decision and is not made here.

## Options (for the user to choose)

- **(a) Review every candidate.** About 8,300 pairs. Infeasible at the current rate of about 36 pairs per tick, and tiles are 8×8, so the visual judgment is weak.
- **(b) Candidate rule from existing registry fields** (for example, same `tileIndex` in the peer block, or same cell index). Cheap, but it is a new rule. It needs the user's approval and must be recorded as a method decision before any edge is added.
- **(c) Visual-feature descriptor with a threshold.** This would be a new metric and threshold. The user has asked not to invent thresholds silently, so it needs explicit approval.
- **(d) Leave the 151 rows as recorded absences.** They stay `no direct counterpart` until a rule is chosen. The overview already states that this status is a recorded absence, not a claim that the platform lacks the graphic.

## Not changed

- No edge was added and no status changed.
- The native-size method gap (options a, b, c) and the milestone 3 scaling default are still open for the user.
