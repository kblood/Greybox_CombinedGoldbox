# CoK cross-version matching method — decision note — 2026-11-09

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md).
Milestone 2 plan: [cok-milestone-2-pixel-hash-check-2026-11-09.md](cok-milestone-2-pixel-hash-check-2026-11-09.md).

This note records the matching method already in force in the repository. It does not add a rule.
The method comes from [graphics-identity-and-restyle-browser-architecture-2026-10-31.md](graphics-identity-and-restyle-browser-architecture-2026-10-31.md)
and [cok-art-identity-crosswalk-2026-10-31.md](cok-art-identity-crosswalk-2026-10-31.md). The
relation names come from `docs/engine/research/graphics-asset-registry.schema.json`.

## Method

1. **`pixel-identical` (automatic, exact).** Two distinct source IDs whose native RGB pixel hash
   (`sha256` of width × height × 3 row-major bytes) is equal get a `pixel-identical` link. Identical pixels
   never merge identities. The architecture doc states this at its "Identical source pixels do **not** merge
   identities" rule.
2. **`same-scene` (reviewed, not automatic).** A `same-scene` edge is used only when a reviewer has
   confirmed that two distinct sources depict the same scene, and their pixels are not identical. Each edge
   records both native hashes, the pixel difference count, and the review as evidence. There is no automatic
   threshold. The existing edges are hand-reviewed:
   - Amiga BIGPIC1#116 ↔ DOS BIGPIC2#116: same banquet scene, 22,302 of 109,440 channel values differ, verified
     (`import_cok_amiga_bigpic_registry.py` lines 282 and 312; architecture doc, section on BIGPIC1#116).
   - CoK cottage, Amiga disk2 BIGPIC1.DAA#112 with DOS BIGPIC1.DAX#112: "distinct sources for the reviewed same
     cottage scene, not pixel-identical" (`cross-platform-art-resolution.md`, first identity review).
3. **`possible-counterpart` (everything else that is only a candidate).** An unreviewed candidate is recorded
   with low confidence and is never shown as a verified counterpart. It is not a gap closure until a
   reviewer promotes it to `same-scene` or `pixel-identical`.

Consequences:
- Pixel evidence supports `pixel-identical` and never creates `same-scene` by itself.
- A shared Restyle output is a many-to-one provenance relation. It does not make its sources identical, and it
  does not create a counterpart by itself.
- The overview counts only recorded links. A `no-direct-counterpart` status stays a recorded absence, not a
  claim that the platform lacks the graphic.

## What this does for milestone 2

- The 168 block-frame gaps and the 520 decoded gaps have no exact pixel match, so under rule 1 they stay
  unlinked.
- Closing them needs reviewed `same-scene` edges (rule 2), or `possible-counterpart` candidates (rule 3).
  Each needs a human look at the actual images before it changes a status.

## Gap in the method (recorded, not filled)

No procedure exists for generating scene candidates. The docs decide how a candidate is accepted, but not how
a reviewer finds candidates among the 865 gaps. Any candidate generator would need a threshold, and the user
has asked not to invent thresholds silently. The next step is therefore either a review queue built only from
the existing registry fields (no new metric), or a separate decision on a candidate metric. This note does not
choose between them.

## Follow-ups

- Decide how scene candidates are listed for review, using only existing registry fields, or ask the user for
  a metric before adding one.
- Review the 177 `8X8D1.DAX` glyph sources. Corrected 2026-11-10: they have exact pixel hashes (`sourcePixelSha256`); see `cok-glyph-pixel-link-note-2026-11-10.md`.
- Fix the DOS CPIC importer so it stores the `pixelSha256` it already computes (line 180).
