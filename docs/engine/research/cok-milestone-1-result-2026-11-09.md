# CoK milestone 1 result: graphics versions comparison overview — 2026-11-09

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md).
Pilot note: [cok-dos-pic1-version-comparison-2026-11-09.md](cok-dos-pic1-version-comparison-2026-11-09.md).

## Exit criteria

| Criterion | Status | Evidence |
|---|---|---|
| Every CoK registry source appears exactly once, with platform, edition, archive, counterparts, restyle records and explicit gaps | Met | `buildVersionOverview` over 6,067 sources; tests against the real registry (`graphics-version-overview.test.mjs`). |
| Pixel relations are recorded relationships; counterparts are not merged; no shared subject or game use is asserted from pixels | Met | Rows are one-hop and never merged transitively; common-pixel groups are labelled, not treated as identity. |
| Browser overview: filter by platform, edition, status and archive; page through rows; open any source in the asset panel | Met | Filters added in 226b1cd5 (edition and archive); checked in the dev server. Paging and the asset-panel link were checked earlier. |
| Coverage per archive and per platform; unrecorded platforms labelled as unrecorded, not absent | Met | `coverageByPlatform`, `coverageByPlatformAndArchive`; "Not recorded" column and note text. |
| Build, browser acceptance and deployment | Build and browser check done; deployment blocked | Build blocked by the public-artifact audit (task 6, user decision). Live site still serves the Oct 27 bundle. |

## Numbers (CoK, from the registry)

- 6,067 sources; 4,587 cross-platform recorded, 615 same-platform only, 865 no direct counterpart.
- 5,764 sources have restyle records.
- 1,620 shared pixel groups; the largest holds 140 sources.
- Amiga: 3,435 sources (2,896 cross-platform recorded, 300 same-platform only, 239 none).
- DOS-EGA: 2,632 sources (1,691 cross-platform recorded, 315 same-platform only, 626 none).
- 5 common-pixel candidate groups (10 or more sources). The largest was decoded and is a solid palette-index tile, not evidence of a shared subject.

## Reconciliation with the PIC1 storage pilot

All 31 pilot assets match the overview. Counterpart counts sum to 36 on both sides. Restyle counts match the shard's `restyles` for each asset. Zero mismatches (task 4).

## Open caveats

- Task 7 is open: pixel uniformity is not yet computed for every common-pixel candidate group (only the largest group is decoded). The threshold of 10 is a heuristic label.
- Task 6 is open and needs the user: decide the audit policy for vendor install paths and Pascal UNC false positives. Until then the deploy stays blocked.
- Seven `hosted-restyle-pack.test.mjs` failures and one `bundle-cok-title-restyle.test.mjs` ordering failure were already failing before this work. They are not caused by it.
- Recorded links are not complete coverage. "No direct counterpart" means no recorded link, not that the platform lacks the graphic.

## Proposed next milestone (for the user to confirm)

**Milestone 2: close the recorded gaps in the overview.** Work through the 865 no-direct-counterpart sources, starting with DOS-EGA (626) and Amiga (239). For each, record whether a counterpart exists but is not yet in the registry, or whether none exists. This needs evidence from decoded pixels or scene matching, and each finding is recorded as a candidate, not an identity. This gives the CoK implementation a verified graphics base before any rendering work begins.

The alternative is to start the engine-side CoK work now and leave the overview's gaps labelled as they are. Milestone 2 is the recommendation because the overview is the stated prerequisite for the rest of the goal.

Decisions needed from the user: (1) confirm milestone 2 or choose the alternative; (2) decide the audit policy (task 6), which unblocks the deploy.
