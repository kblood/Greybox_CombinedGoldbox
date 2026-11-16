# CoK gap review queue (existing fields only) — 2026-11-10

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md).
Matching method: [cok-matching-method-decision-2026-11-09.md](cok-matching-method-decision-2026-11-09.md).
Generator: `tools/cok_gap_review_queue.mjs` (`--write` regenerates the queue).
Artifact: `docs/engine/research/cok-gap-review-queue-2026-11-10.json`.

## Purpose

Follow-up 28 of the goal file asked how reviewers find scene candidates among the no-counterpart gaps,
without inventing a metric or threshold. This queue is the answer the decision note allowed: a review
list built only from existing registry fields. It creates no links and changes no status.

## Rule (existing fields only)

A gap source is listed with its **peers**: sources on another platform with the same archive family
(archive name without extension and trailing digits, upper-cased) and the same `locator.blockId`.
Locator kinds `block-frame`, `tile` and `whole-image` are eligible. No image comparison is used, and no
threshold is applied.

Glyph rows (`locator.kind = glyph`) are excluded. All glyphs in one bank share the bank's block number,
so a block match would pair every glyph with every other glyph. That is not location evidence.

## Result

| Status | Count |
| --- | --- |
| `review-location-peer` (at least one peer) | 494 |
| `no-existing-field-peer` | 356 |
| Total gaps | 850 |

Breakdown of the 356 `no-existing-field-peer` rows:

- 162 glyph rows (excluded by rule; all DOS-EGA, the 8 blank glyphs included).
- 194 non-glyph rows with no same-family, same-block peer on another platform
  (Amiga block-frame 7, Amiga whole-image 4, DOS-EGA block-frame 135, DOS-EGA tile 48).

The 494 review rows by kind: Amiga block-frame 174, Amiga tile 54, DOS-EGA block-frame 169,
DOS-EGA tile 80, DOS-EGA whole-image 17.

## Known limits (recorded, not corrected)

- **Peer lists are noisy for tiles.** Some block numbers are shared by many tile rows, so a single gap
  can have up to 281 peers. A reviewer must filter by kind before looking at images.
- **Family names differ across platforms** (for example `PICDAA` and `PICDAX`, `WILDCOM.DAA` and
  `WILDCOM.DAX`, `COMSPR.DAX` and `comspr.daa`). The same-family rule therefore misses some real
  locations. The 194 no-peer non-glyph rows may partly be this. A cross-platform family map would be a
  new rule and needs a decision.
- **Location is not proof.** Same family and block number does not mean the same scene. Every queued
  peer needs a visual review before anything is linked.
- The queue JSON is about 1.7 MB because each row carries its peer list. It is regenerated, not edited.

## What is NOT done here

- No `same-scene` or `possible-counterpart` link is created. Both need a reviewer's look at the images,
  per the decision note.
- No candidate metric or threshold was added.

## Next steps

1. Review the 494 queue rows by kind, starting with block-frame rows (174 Amiga, 169 DOS-EGA), comparing
   the actual images. Record each outcome as a reviewed `same-scene` edge or as unresolved.
2. Decide whether a cross-platform family map is an acceptable existing-field rule, or whether it needs
   the user's approval first.
3. The blank-glyph decision (goal file task 49) and the atlas-cell method exception (task 48) stay open.
