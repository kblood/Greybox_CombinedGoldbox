# CoK character-creation icon choice candidate — 2026-10-26

This receipt records the complete candidate for choosing one of the two admitted DOS/Restyle player
identities during Champions of Krynn character creation and its live deployment.

## Candidate

- Path: `{external-workspace}/batch03_work/dist-app-creation-review-ee911ce2`.
- Contents: 1,256 files; 891 files under `assets/` passed the public-artifact policy.
- All 23 game JSON manifests are byte-identical to the complete player2 candidate.
- `index.html` SHA-256: `FCFAD132A8EAC8441DB177DA3779C6F2788A05C462BC3867C7D690B4B1A4AB81`.
- JS `assets/index-Dw9PeFXT.js` SHA-256:
  `2EA4F52A0DF6DCB721D6FDCC2116540729EC30CED82ACC1AF086EE3F556918A2`.
- CSS `assets/index-CmCV0s3L.css` SHA-256:
  `540AE20E73B93ADC104808244BED00AFD0E28AEFD7CB057BC915EE50E4C400E9`.
- Dynamic chunk `assets/dungeon3d-D6b71i-D.js` SHA-256:
  `62C3EBD04A57F33E4A7B1C954BD5ACF174FEEEB6A75EBEEE09ECFE0B221F2DEF`.
- The generated `build:app` output has only 160 audited assets and 620 unavailable source paths; it
  is not a release package. This candidate was assembled from the complete package plus the fresh
  app bundles, then the exact twelve manifest-pinned player PNGs were revalidated and staged.

## Implementation

The creation form offers `Icon 1`, `Icon 2`, and `No icon`. Its identities are the canonical tuples
`05 18 00 02` and `05 01 01 02`; slot alias `05 18 02 02` remains the first identity and is not an
extra choice. Appearance is never inferred from class, race, sex, or party order. New requests use a
source-derived neutral EGA identity-map preset `[91,A2,B3,C4,E6,F7]`; this is not claimed to be the
retail default. Palette arrays are copied across request, sheet, persisted member and combatant.
The preview follows DOS-EGA or Restyle selection and labels the explicit DOS fallback for Amiga.

The source-derived neutral-color oracle pins both body variants (#88/#216) for both identities.
Character creation, add/reset, choice persistence across form rerenders, unknown-id rejection,
preview stale-load rejection, save/reorder, app-save restoration, sheet rendering, legacy no-icon
fallback and natural-combat pixel attribution are covered. The DOS→Restyle→DOS test changes each
visible mapped player's own tile and restores the exact DOS tile, not merely the whole canvas.

## Candidate gates

Passed:

- `pnpm --filter @goldbox/web typecheck`.
- `git diff --check` on the implementation slice.
- `node apps/web/scripts/public-artifact-policy.mjs <candidate>`: 891 assets.
- `node apps/web/test/static-build.mjs` with `GB_STATIC_DIST_DIR=<candidate>`.
- `pnpm e2e:intros` with `GB_INTRO_DIST_DIR=<candidate>`: all ten routes.
- `pnpm --filter @goldbox/web e2e:cok-player-appearance`: focused source, creator, party/save,
  sheet and player-tile acceptance passed against both the dev app and this candidate.
- `node apps/web/test/cok-combat-graphics.mjs` with
  `GB_COK_GRAPHICS_BASE_URL=http://127.0.0.1:8765`: all 106 archive-scoped CPIC identities and
  DOS→Amiga→Restyle→DOS state/pixel restoration passed.

The broad browser suite was not rerun because its retail CoK route reads excluded
`CHRDATA1.SAV`. Its latest recorded result is 173 passes, one skip and 16 failures; this candidate
does not claim those failures have cleared. No Rust/native/corpus workflow ran.

## Live deployment

Published atomically to `https://dionysus.dk/greybox/` from this candidate using
`{local-user-profile}/.claude/skills/deploy-static/deploy-static.ps1` (SHA-256
`76EF3A08B9E52D019BFA782C45FED757A84BEEF116FBC3D38951E7049AB0F53F`). The process-scoped
`DEPLOY_REMOTE_BASE=/var/www/html` selected `/var/www/html/greybox`; the prior live tree remains at
`/var/www/html/.greybox.bak`.

- Live root, HTML, JS and CSS returned HTTP 200. Their hashes match the candidate values above, and
  live HTML names `index-Dw9PeFXT.js` and `index-CmCV0s3L.css`.
- All 12 player-art PNGs returned HTTP 200 and matched the candidate and manifest SHA-256 pins.
- The live `?create=1` route exposed exactly the two canonical choice ids and `No icon`; both
  previews changed, all 12 player requests returned HTTP 200, and the route had no browser errors.
- The focused player-appearance suite passed against live, including creation/save/reorder,
  character-sheet and player-tile DOS→Restyle→DOS acceptance.
- The live CoK combat graphics suite passed all 106 archive-scoped CPIC identities and
  DOS→Amiga→Restyle→DOS without combat-state changes.
- All ten live intro routes passed.

The broad browser result above remains the latest recorded broad-suite evidence; it was not rerun
because that suite includes the excluded retail save path.

## Remaining CoK scope

This release completes the two-choice creation slice but does not complete CoK graphics coverage.
The next runtime slice should carry source identity into the general dialogue renderer and admit one
additional actually displayed static picture. Scenes, portraits, exploration terrain/walls, UI,
animation, Amiga player mapping and player-frame variant semantics remain open. The separate runtime
coverage register tracks generated, reviewed, mapped and rendered status.
