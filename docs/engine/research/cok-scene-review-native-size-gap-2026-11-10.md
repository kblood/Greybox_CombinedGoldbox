# Method gap: scene review across unequal native sizes — 2026-11-10

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md).
Method: [cok-matching-method-decision-2026-11-09.md](cok-matching-method-decision-2026-11-09.md).
Applied in: [cok-cpic1-scene-review-note-2026-11-10.md](cok-cpic1-scene-review-note-2026-11-10.md).

## The gap

The existing method (`cok-matching-method-decision-2026-11-09.md`) defines three things:

- `pixel-identical`: automatic, on equal native RGB hashes.
- `same-scene`: reviewed by a person looking at the images, never automatic. Recorded as `verified`.
- `possible-counterpart`: unreviewed candidates.

It does not say how a `same-scene` review should be checked when the two frames have different native
sizes. The review queue (`cok-gap-review-queue-note-2026-11-10.md`) pairs sources by archive family and
block number, and the peers can be at different native sizes. In the `CPIC1.DAA` unit, every pair differs
in size: Amiga 24×24, 24×48 or 48×24 against DOS 96×96, 96×192 or 192×96 (the same 4× ratio throughout).

For equal sizes, the earlier units compared row-major RGB channel values and recorded the count of
differing values as evidence. That comparison is not defined when the sizes differ, and this note does
not define one.

## What was done (no new rule)

- Six `CPIC1.DAA` pairs were judged visually as the same scene and recorded as `same-scene` / `verified`
  edges, with these changes from the earlier units:
  - the evidence says the native sizes differ and that no channel comparison was made;
  - the pixel hashes are recorded and shown to differ;
  - the `differingChannelValues` field is null in the review data.
- No threshold, resampling rule or similarity metric was added. Nothing was linked as
  `pixel-identical`.
- The 22 other pairs in the family were judged not the same, on composition and subject.

## Limits this creates

- The six `same-scene` edges rest on visual judgment across different native resolutions. The consistent
  4× ratio suggests one art source at two resolutions, but that is not proof, and the method does not
  yet say what would prove it.
- A reviewer should not treat these six as equal in strength to the equal-size edges.

## Decision needed (user)

Choose one of:

- (a) Accept visual-only `same-scene` review for unequal native sizes, with the size note in the evidence
  (what was done above).
- (b) Define an explicit comparison for unequal sizes, for example integer-ratio block sampling with a
  stated pass criterion. That is a new rule with its own threshold, so it needs approval before use.
- (c) Keep these six as `possible-counterpart` until (a) or (b) is decided.

Until the user chooses, the six edges stay as recorded (option a is the default in the data), and the
matching method is otherwise unchanged.

## Addendum (2026-11-10, SPRIT1.DAA unit)

The same limit applies to the `SPRIT1.DAA` family (see `cok-sprit1-scene-review-note-2026-11-10.md`):
four `same-scene` edges across unequal native sizes (Amiga 88×88 against DOS frames of 96×196 to
288×320). Unlike the CPIC1 family, the size ratio is not constant across the family, because the DOS
sprite frames differ in size from one another. So the consistent-ratio argument used for CPIC1 does not
carry over: the edges rest on visual match alone. The decision in this note is unchanged: option (a)
is the default, and (b) or (c) is still open for the user.
