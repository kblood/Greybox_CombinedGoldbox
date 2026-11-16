# CoK cross-platform family map (method note) - 2026-11-12

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md), entries 53 and 200.
Parent queue: [cok-gap-review-queue-note-2026-11-10.md](cok-gap-review-queue-note-2026-11-10.md).
Candidate file: `cok-cross-platform-family-map-candidates-2026-11-12.json`.

## Rule (archive names only)

The existing queue family key is the archive name without `.dax/.daa/.tlb/.lbm` and without trailing digits, upper-cased.
The family map adds a fixed table of key pairs:

| Mapped pair | Amiga archive | DOS-EGA archive | Effect on existing key |
| --- | --- | --- | --- |
| PICDAA <-> PICDAX | PICDAA | PICDAX | new (no registry asset uses either name) |
| WILDCOM.DAA <-> WILDCOM.DAX | WILDCOM.DAA | WILDCOM.DAX | none: both already key to WILDCOM |
| COMSPR.DAX <-> comspr.daa | comspr.daa | COMSPR.DAX | none: both already key to COMSPR |

A gap row is paired only with registry sources on another platform whose mapped key matches, with the same `locator.blockId` and the same `locator.kind`. No pixel metric, no threshold.

## Scope

Counted from `cok-gap-review-queue-2026-11-10.json` (624 rows, not the older note's 850):
194 non-glyph rows have no peer. Of these, 6 fall in a mapped family (Amiga `comspr.daa` block-frame rows). The other 188 are outside the three pairs.

## Matching status

Outcome for any pair produced: `candidate-unreviewed` (possible-counterpart candidate only). Nothing is a registry edge.

Result: 0 candidates. The 6 `comspr.daa` rows have no DOS `COMSPR.DAX` asset with the same block number and kind. The PICDAA/PICDAX pair reaches no assets. The unmatched list records all 194 rows.

## What this does NOT do

- No edge, no `same-scene` or `possible-counterpart` link, no registry change.
- No same-scene claim, no pixel or hash comparison, no threshold.

## Open question for the user

The approved map adds no candidates on the current registry. Do you want (a) to keep it as recorded (no effect), or (b) to consider a broader rule (block and kind only, across families) that would have to be decided separately? Under (b), 110 of the 194 rows have a same-block, same-kind asset on the other platform in a different family, and each would need visual review before any status.
