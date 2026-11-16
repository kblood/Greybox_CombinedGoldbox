# Greybox B2b+B3 release — 2026-10-27

## Published artifact

- Source commit: `8d324df679ef8d71f2dc9c075383caefc4720a4c` (`feat(web): add bank-scoped CoK combat restyles`), pushed to `origin/greybox`.
- Complete candidate: `{external-workspace}/batch03_work/dist-app-b3-cpic-runtime-20261027` (1,243 files).
- The candidate retains all 23 B2b game manifests byte-for-byte. The public-artifact policy checks 884 files under `assets/`; all 106 pinned CPIC PNGs and the six B2b player frames are present. All 112 published images were fetched from live and matched their manifest SHA-256 values.
- Candidate and live `index.html` SHA-256: `1A31C6FE190830E63F77AE0D6AAFB4DE681AFF503255C5DE3E45CA02DD9FF4F9`.
- Bundle: `index-D-7nDEy4.js`; candidate and live SHA-256: `36652E886C41375CC2BD118AD28BD92A72E2230F13CA3FDEBFAB02152431C01F`.
- Live URL: <https://dionysus.dk/greybox/>. Root and bundle returned HTTP 200; the website was deployed atomically to `/var/www/html/greybox` with the installed `deploy-static.ps1`. The previous version is retained at `/var/www/html/.greybox.bak`.
- Deployment helper SHA-256: `76EF3A08B9E52D019BFA782C45FED757A84BEEF116FBC3D38951E7049AB0F53F`.

## Verification

- `pnpm --filter @goldbox/web typecheck`: pass.
- `pnpm -r exec tsc --noEmit`: pass.
- `pnpm --filter @goldbox/web build:app`: pass. The local build reports 620 unavailable source references and copies 157/856 assets; the release candidate therefore reuses the complete B2b package and overlays the reviewed current build and pinned Restyle outputs.
- Candidate public-artifact policy: 884 assets pass; 23 complete game manifests retained.
- `pnpm --filter @goldbox/web e2e:static` on the candidate: pass.
- `pnpm e2e:intros` on the candidate: all eight intro routes pass.
- Candidate and live focused E2E: CoK natural combat, library boot, DOS/Amiga combat backdrop switching, and disk-selected CPIC2/3 Restyle pass (4/4); the bank suite rendered 12 representative cases across both banks, all four geometries and both PNG color types, with mask containment, wrong-bank rejection, unchanged combat state and exact DOS restoration.
- Candidate and live `pnpm --filter @goldbox/web e2e:cok-graphics`: pass, including DOS → Amiga → Restyle → DOS.
- Live HTML and JS match the candidate hashes exactly. All 106 CPIC outputs plus six player outputs returned HTTP 200 and matched their pinned hashes.

The full 190-case browser run on the candidate reported **173 passed, 1 skipped, 16 failed**. Failures remain open: Matrix Cubed has no ADLIB/MT32 driver rows; NWN preview lacks loot vocabulary; wilderness area-1 data is unavailable; character editor and DoK save-viewer timed out; CoK main-menu timed out; save-import cases lack local save fixtures (with a DQK roster-clobber assertion also failing); library DoK/CoK save-file routes return 404; and the DQK QSV save route produced no rows. These failures are not reported as green or as CoK Restyle coverage.

## Remaining CoK coverage

This release publishes the B2b one-tuple player pilot and the 106-entry CPIC1/2/3 combat mapping. Runtime evidence covers representative identities, not every mapped block. Continue the full runtime identity inventory; separately resolve player variant `#216` semantics and Amiga player sources; and cover remaining scenes, portraits, terrain, UI and animation through the shared DOS/Amiga/Restyle setting. Do not claim complete CoK artwork coverage from this bounded release.
