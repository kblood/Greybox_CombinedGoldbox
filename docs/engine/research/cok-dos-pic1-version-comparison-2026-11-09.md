# CoK DOS PIC1 version comparison slice — 2026-11-09

This records the first website comparison slice for the 31 CoK DOS-EGA PIC1 sources in the
[storage pilot](../data/graphics/README.md). It follows the
[next-tasks plan](graphics-research-next-tasks-2026-11-06.md), step 2 onward, and does not change
any source identity, registry or shard.

## What the browser now shows

`apps/web/src/ui/graphics-version-comparison.mjs` builds a one-hop comparison around one source ID:

- the subject plus every direct registry cross-version counterpart, grouped by platform and edition;
- restyle candidate records touching the subject or any direct counterpart;
- unverified link counts;
- game platforms with no recorded direct counterpart, labelled as unrecorded rather than absent.

Counterparts remain separate source identities. Pixel identity is shown as a relationship only; the
panel does not treat it as shared subject, animation membership or game use. Two-hop neighbours are
excluded deliberately.

## Measured coverage of the pilot slice

Measured from `cok-graphics-identity-registry-v1.json` on the 31 pilot subjects:

| Measure | Result |
| --- | --- |
| Subjects with any Amiga counterpart | 1 of 31 |
| Subjects with no direct counterpart | 13 of 31 |
| Counterpart rows (all platforms) | 36, mostly other DOS disks |
| Restyle candidate rows | 59 |

So the DOS PIC1 slice does not yet have a cross-platform comparison. Most recorded counterparts are
other DOS disk copies. The Amiga PIC1 sources are a separate 50-asset set that does not join to the
DOS PIC1 sources by verified pixel identity. The one Amiga link is to an Amiga candidate copy.

## Verification

- `node --test test/graphics-version-comparison.test.mjs`: 4 pass. Synthetic tests cover grouping,
  one-hop limits, unrecorded platforms and unknown subjects; one test uses the real registry for
  block 57.
- `tsc --noEmit` in `apps/web`: passes.
- Related graphics suites: 24 of 26 pass. The two failures in `graphics-review-queue.test.mjs` also
  fail with `graphicsBrowser.ts` reverted, so they predate this change.

Not run: application build, browser or visual acceptance, and deployment. Those holds remain active.
The live site has not been changed.

## Limits and next steps

1. Amiga PIC1 needs its own edition-qualified join evidence before any DOS-to-Amiga comparison is
   asserted. Same-scene relations exist for bigpic assets, not for this slice.
2. Restyle lineage for the 59 candidate rows is outside this slice; see step 4 of the plan.
3. Once build and browser holds are lifted, verify the new panel visually on the subject with the
   most counterparts before publishing.
