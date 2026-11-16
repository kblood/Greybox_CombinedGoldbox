# Gap review queue: count correction (2026-11-13)

Status: correction note. The 2026-11-10 queue note (`cok-gap-review-queue-note-2026-11-10.md`) is left as written;
this note records the current counts so the older figures are not reused.

## Current counts (from `cok-gap-review-queue-2026-11-10.json`, read 2026-11-13)

| Status | Count |
| --- | --- |
| `review-location-peer` | 268 |
| `no-existing-field-peer` | 356 |
| Total gaps (`gapCount`) | 624 |

## Stale figures in the 2026-11-10 note

- "494 review rows" and "Total gaps 850" are superseded. The queue JSON has 268 review rows and 624 gaps.
- The 356 `no-existing-field-peer` count and the 194 non-glyph no-peer rows still match the JSON.
- The later overview counts were also reduced by subsequent glyph and PIC1 link notes (865 to 850 to 818), so
  the 850 figure should not be used as the current gap total either.

## Why this is recorded, not re-derived

The queue JSON is the artifact the other notes cite (goal entries 198 and 200 use 624 and 194). The 494 and 850
figures came from an earlier snapshot of the queue. No matching rule changed in this note; it only restates counts.
