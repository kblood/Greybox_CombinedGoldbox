# Greybox CoK BIGPIC2#116 runtime graphics candidate — 2026-10-26

## Scope

This is a bounded source-admitted slice for the Champions of Krynn attract demo at DOS
`BIGPIC2.DAX#116`, frame 0. Its runtime selector exposes DOS-EGA, the pinned Amiga picture, and
the reviewed Restyle. The gallery gains a separate Runtime comparison pair. The Restyle is only
shown over the exact validated DOS scene; unsupported pictures and unavailable inputs retain the
selected original source fallback. Game/ECL state does not advance when the mode changes.

This does not claim full CoK image coverage, gameplay-route coverage for this attract-demo scene,
Amiga player-portrait equivalence, or Electron acceptance. The wider consumer/source denominator
remains open in [the coverage register](cok-restyle-runtime-coverage-2026-10-26.md).

## Source admission

`apps/web/src/ui/cokDemoArtManifest.json` pins:

- DOS `Champions of Krynn/BIGPIC2.DAX`, archive SHA-256
  `553dc458be8209bea0ca5f1dea6406b5cd8a96750d3badc05658f5a8ef241f0a`, raw block #116 SHA-256
  `9c2f3cfc44bd9f04ad7703e00e59a887b385f2b3d3051ead6128d5fa587847fd`.
- Amiga `amiga_extracted/ChampionsOfKrynn/disk2/BIGPIC1.DAA`, archive SHA-256
  `6267f07ad52f4a7bc6bdf958c5201e7b4e3bc826547ec3c7626579ee9bf89fed` and raw block #116 SHA-256
  `c0cc0577d1519f6c8da66f55d0fe261f89f777fde5ec4e5882d46908dac72b7e`.
- The comparison source PNG SHA-256 `50831f833c07f107193b7efebc0cdfb796a4cd4312c5c0b04a2861093b04b896`
  (1216×480) and frame-0 Restyle SHA-256
  `89ac8dc28ea0acd61d5f5dd374af1deecb2e0f1985e38e78fc2b4d286d0f3fda` (1824×720, 2,359,433
  bytes).

The existing Restyle output was reused; its original full prompt/reference package was not
recovered. No new image was generated for this slice.

## Candidate and checks

Complete candidate: `{external-workspace}/batch03_work/cok-demo-runtime-release-candidate-20261026`.
It was built from the prior complete accepted site package and the fresh production app build. It
contains 1,504 files and 916 audited public assets, retains all 1,498 prior paths and all 23 game
manifests, adds six files and removes none. The changed overlaps are the entry HTML, 16 game
manifests, and the comparison manifest/fidelity records. No source archives differ from the prior
package.

Candidate hashes:

- `index.html`: `eb15907d5da2e7bbef5620c8fd40c3fac5f809772f98b6aa914ceb089bdc4b4b`
- `assets/index-BlVkGTBx.js`: `2d5cba99a446fa151e1e1da26c3fe644a0da39acfe7288e65cf726363797b6e5`
- `assets/index-B_6xssA6.css`: `b8ffe181f1087b544360a073931598d0d30c26a934e14e5cc3da4ad246319307`
- `restyle/cok/demo/BIGPIC2_116_restyle.png`: `89ac8dc28ea0acd61d5f5dd374af1deecb2e0f1985e38e78fc2b4d286d0f3fda`

Checks passed:

- `pnpm --filter @goldbox/web typecheck`
- `node apps/web/scripts/public-artifact-policy.mjs {external-workspace}/batch03_work/cok-demo-runtime-release-candidate-20261026`
- `pnpm --filter @goldbox/web e2e:cok-demo-runtime`: DOS→Amiga→Restyle→exact DOS pixel restoration;
  ECL/demo state invariant; gallery Runtime card and PNG request.
- `GB_COK_TRAVEL_DIST_DIR=<candidate> node apps/web/test/cok-travel-restyle-static.mjs`: existing
  BIGPIC1#121 travel and gallery regression.

The raw `build-app` output is a reduced package because this checkout lacks hundreds of optional
game-installation files. It is not the release package. The complete candidate retains the
previous accepted package contents, and the final policy audit passed.

## Publication and live verification

Source commit `57f56a11` is pushed to `origin/greybox`. The canonical `deploy-static.ps1` atomically
published the complete candidate on 2026-10-26 to `/var/www/html/greybox`; the prior site is kept
at `/var/www/html/.greybox.bak`. The process-scoped remote base was `/var/www/html`.

Live root returned HTTP 200. Candidate/live SHA-256 matched for `index.html`, the referenced entry
JS and CSS, the BIGPIC2#116 Restyle PNG, and `restyle/manifest.json`. Browser verification on the
live `?demo=1` route switched DOS-EGA→Amiga→Restyle→DOS-EGA at picture #116, restored exact DOS
pixels and preserved demo/ECL state. On live `?restyle=1`, all 75 comparisons appeared, Runtime
(2) selected the new card, and both source/Restyle images loaded at 1216×480 and 1824×720. The
browser reported no console errors or non-favicon 4xx responses. The earlier HTML/entry/CSS/PNG
candidate hashes are the verified live hashes.

Keep the broader CoK artwork coverage and Amiga-player gates open.
