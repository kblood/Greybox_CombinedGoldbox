# Greybox second CoK player appearance release

Published from source commit `a656938d16ac41e7dbc8e1ba8a55677501a0d694` to the existing private
demo at <https://dionysus.dk/greybox/> using the canonical atomic `deploy-static.ps1`.
The process-scoped `DEPLOY_REMOTE_BASE=/var/www/html` override selected
`/var/www/html/greybox`; the shared environment value was left unchanged. The previous deployment
was retained as `/var/www/html/.greybox.bak`.

## Candidate and artifact identity

- Candidate: `{external-workspace}/batch03_work/dist-app-player2-review-2ffa9a38`.
- Candidate contents: 1,253 files, including 888 files below `assets/` and 23 game JSON manifests.
- All 23 candidate game manifests are byte-identical to the previously complete B3 package at
  `{external-workspace}/batch03_work/dist-app-b3-cpic-106fix-20261028`.
- Public-artifact audit: 888 assets checked; pass.
- Candidate `index.html`: `787788BF9E38D3295717CB94C73BE8BEB3893B0A77A523BA0D777307EB77F9D2`.
- Candidate JS `assets/index-KNJomPEE.js`:
  `D7FCD44DA50B91F3B23070B00251472541081C55E7AD1982445898D2D62474A8`.
- Candidate CSS `assets/index-BCBR1-kE.css`:
  `9AC3E528B51C42FC90AFF64D5DE867D986CF0122A1F42935AC1B2345ECE2C8F0`.

The installed deploy script matched the pinned SHA-256
`76EF3A08B9E52D019BFA782C45FED757A84BEEF116FBC3D38951E7049AB0F53F`. Its dry-run showed the
canonical target. A read-only SSH preflight confirmed the target and its parent were accessible
and writable. The atomic upload and swap completed successfully.

## Verification

Before deployment, the candidate passed:

- `pnpm --filter @goldbox/web typecheck` and `git diff --check`.
- `node apps/web/test/static-build.mjs` against the candidate: production static smoke passed.
- `pnpm e2e:intros` against the candidate: all 10 intro routes passed.
- `node apps/web/scripts/public-artifact-policy.mjs <candidate>`: 888 assets passed audit.
- `pnpm --filter @goldbox/web e2e:cok-player-appearance`: 12 packaged paths, source-derived
  pixels, synthetic SAV import/reorder/save, sheet and combat rendering, mode restoration, and
  missing/hash/geometry/unsupported-identity controls passed against the candidate.
- `node apps/web/test/cok-combat-graphics.mjs` against the candidate: 106/106 CPIC identities and
  DOS→Amiga→Restyle→DOS state/pixel controls passed.

After deployment:

- Live root returned HTTP 200. Its HTML hash exactly matches the candidate and names the same JS
  and CSS bundles; both returned HTTP 200 and matched candidate SHA-256 values.
- The live 106/106 CPIC test passed, including the DOS→Amiga→Restyle→DOS combat switch without
  combat-state changes.
- All 10 live intro routes passed.
- The live player-art test passed: both admitted identities load without fallback errors in natural
  combat, the new Restyle PNG returns HTTP 200 with its pinned SHA-256, and character-sheet and
  combat mode changes restore DOS pixels while keeping the represented state unchanged.
- The first live player-art test attempt had a test-observer false negative: it accepted only a
  root-mounted `/restyle/...` pathname, while production is mounted below `/greybox/`. Direct GETs
  returned HTTP 200 and the exact manifest hashes. The observer was corrected to accept the site
  base prefix, and the full live player-art test was rerun successfully. No production code or
  candidate bundle changed for this test-only correction.

The complete browser suite was not run because its retail CoK route reads the excluded
`CHRDATA1.SAV`. The latest recorded broad-browser result remains 173/190 passed, 1 skipped,
16 failed; this release does not claim that gate is green. No Rust/native/corpus workflow ran.

## Remaining CoK graphics work

This bounded release does not complete CoK graphics coverage. Add a creation-time choice among the
two admitted player appearances, attribute pixel changes to the player sprite itself, map missing
Amiga/player variants and inventory the remaining scenes, portraits, terrain, UI and animation art.
The complete graphics objective remains open.
