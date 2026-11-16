# Greybox CPIC2 silhouette repair release — 2026-10-26

## Published artifact

- Source commit: `c12dcc45b66364ffc61433eeff784c36f598671b` (`fix(web): repair CoK CPIC2 restyle silhouettes`), pushed to `origin/greybox`.
- Complete candidate: `{external-workspace}/batch03_work/dist-app-b3-cpic-106fix-20261028` (1,245 files; 886 files under `assets/`). It retains all 23 game JSON manifests byte-for-byte from the B2b+B3 candidate. The public-artifact audit checked 886 assets. The package contains all 106 CPIC combat Restyles and six B2b player-appearance PNGs.
- Candidate and live `index.html` SHA-256: `49BB9AA716861203996FEC82729A72ED0DF4B31BF9A9C14955E928CC6ED7F98C`.
- Bundle: `assets/index-C1HPdh9S.js`; candidate and live SHA-256: `8C4AC835E3116D60117183EDAAFCCCA6EC01600D6FEBCB592EB9DA7C23961F15`.
- CSS: `assets/index-BCBR1-kE.css`; SHA-256: `9AC3E528B51C42FC90AFF64D5DE867D986CF0122A1F42935AC1B2345ECE2C8F0`.
- Live URL: <https://dionysus.dk/greybox/>. Deployment used the installed atomic `deploy-static.ps1` to `/var/www/html/greybox`; previous release is retained at `/var/www/html/.greybox.bak`.
- Deployment helper SHA-256: `76EF3A08B9E52D019BFA782C45FED757A84BEEF116FBC3D38951E7049AB0F53F`.

## Verification

- `pnpm --filter @goldbox/web typecheck`: pass.
- `node apps/web/scripts/bundle-cok-combat-restyle.mjs`: all 106 source-pinned candidates verified and staged.
- `node apps/web/scripts/bundle-cok-player-appearance.mjs`: all six player-art PNGs verified and staged.
- `node apps/web/scripts/public-artifact-policy.mjs`: 886 asset files checked, pass.
- `node apps/web/test/static-build.mjs` against the complete candidate: pass.
- `pnpm e2e:intros` against the candidate: 10/10 routes pass.
- `node apps/web/test/cok-combat-graphics.mjs` against the complete candidate: 106/106 archive-hash + picture-id identities pass, including source-mask containment, per-icon and full-canvas pixel changes, combat state, exact DOS restoration, and guarded-enemy fallback. DOS → Amiga → Restyle → DOS also passes without combat-state changes.
- Full candidate `pnpm --filter @goldbox/web e2e`: 173/190 pass, 1 skipped, 16 fail. Failures remain open for the existing Matrix Cubed driver rows, NWN loot vocabulary, unavailable local fixtures/data, save routes and DQK QSV coverage. They are not represented as green; see the earlier [B2b+B3 receipt](greybox-b3-release-2026-10-27.md) for the known baseline categories.
- Live root returned HTTP 200 and its HTML hash matches the candidate. Its HTML names the same JS bundle; that bundle returned HTTP 200 and matches the candidate hash. All 106 combat PNGs and all six pinned player PNGs returned HTTP 200 and matched their manifest hashes.
- The full 106-identity browser acceptance passed against live, including the DOS/Amiga/Restyle switch and exact DOS pixel return. All 10 live intro routes passed.

## Remaining CoK scope

This increment completes and publishes the 106 enemy-combat CPIC Restyle mappings. It does not complete
CoK artwork coverage. Only one player-appearance tuple is mapped; the remaining character icons,
additional appearance variants, exploration/dialogue scenes, portraits, terrain/walls, UI, animations,
and Amiga Restyle mappings still require inventory, review, runtime wiring and live verification.
