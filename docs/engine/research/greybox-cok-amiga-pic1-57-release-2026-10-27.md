# CoK Amiga PIC1.DAA#57 Restyle release — 2026-10-27

## Scope

This incremental release publishes the reviewed Batch02 Amiga dialogue portrait `PIC1.DAA#57/frame0` in the existing Restyle comparison gallery and enables it for the exact Throtl ECL1#17 dialogue route when the selected Amiga source identity matches. It does not map DOS `PIC1.DAX#57`, cover other frames/routes, or complete the CoK graphics coverage objective.

## Pinned asset and lineage

- Source commit: `5fe911da` (`Add CoK Amiga PIC1#57 runtime restyle`).
- Amiga archive SHA-256: `b3512ed6a030ac27538ae66f6115bdf0bf1f5a78e63eba0d32fef3e32b049687` (165,455 bytes).
- Accepted imported RGB PNG: 1408×1408, SHA-256 `193e7af3ecc3591f2564cb9e59d2c9bd30d68add82c88819f1db6fb84fb57176`.
- Fidelity: `ok`, edge_corr `0.5509`, hist_dist `0.1921`, aspect deviation `0`.
- The runtime manifest pins the decoded DAA frame plus input, full prompt and raw generation lineage. Runtime admission is source- and archive-qualified; an absent or foreign selected-install archive fails closed.

## Build and verification

Candidate: `{external-workspace}/batch03_work/cok-runtime-site-candidate-amiga18-57-release2-20261027` (6,365 files), based on the complete preserved #18 package. It retains 75 gallery cards and all 23 game manifests. The public-artifact audit checked 930 assets. Web typecheck, focused development and candidate route tests, production static smoke, and the focused live browser route passed. The live route verified DOS→Amiga→Restyle→DOS, Continue retention, exact-source `#57` to `#58` switching/restoration and rejection/fallback behavior for stale, missing, corrupt or mismatched sources.

The release was atomically deployed to `https://dionysus.dk/greybox/?restyle=1`. Live gallery/runtime image routes return HTTP 200 and the accepted image hash above; the DAA archive route returns HTTP 200 and its pinned hash above. The page has 75 comparisons, including 27 CoK cards, and shows two cards in the separate Runtime batch. A later cache-busted read of the live inventory manifest reports 2,542 unique image pairs, 122 held rows, 13 blank/excluded rows, and 4,840 unique PNGs. The earlier 2,540 figure came from a previously loaded browser view. Gallery count and generated ledgers do not establish complete runtime coverage.

## Remaining work

Full CoK coverage remains open: DOS #57 is a separate identity without this Amiga admission; scene, animation, UI, character-icon joins and other runtime consumers still need source-proven inventory, reviewed assets and route-level runtime acceptance.
