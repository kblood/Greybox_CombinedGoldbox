# CoK DOS DUNGCOM terrain release — 2026-10-26

## Published artifact

- Source commit: `a3563422e81416d1b00c360a3adf1e1bd780bd6f` (`Add CoK DOS terrain restyle runtime`), pushed to `origin/greybox`.
- Complete candidate: `{external-workspace}/batch03_work/dist-app-cok-dungcom-candidate-f6475424`, 1,286 files. It starts from the complete dialogue-57 candidate and overlays the current `apps/web/dist-app`; all 23 game manifests were rechecked byte-for-byte after assembly. The public-artifact policy passed with 895 asset files.
- The regular app build passed but reports 620 unavailable local game-file references and copies only 157/856 referenced assets; `dist-app` alone is not this release package.
- The candidate and live HTML SHA-256 is `54598F77ACB5CCFE746A11A936EDE6FC560F463200EE0F684F46569902943FB8`.
- Entry bundle `assets/index-DB_gzKwL.js`: `EA8DA27D1D3984657461E7577086D996A6B38DC92EEFD07E6F960C4259C64FDA`.
- CSS `assets/index-CmCV0s3L.css`: `540AE20E73B93ADC104808244BED00AFD0E28AEFD7CB057BC915EE50E4C400E9`.
- Dungeon chunk `assets/dungeon3d-YneG6BQc.js`: `C3C7B1A8EBA245AB353C2FD65E63F57C08856934F3E1B58F6556E96205BCA813`.
- The live root, entry assets, dungeon chunk, and all 25 DUNGCOM restyle PNGs returned HTTP 200 and matched candidate SHA-256 values.
- Published at <https://dionysus.dk/greybox/> by the installed `deploy-static.ps1`, atomically to `/var/www/html/greybox`; the prior release is retained at `/var/www/html/.greybox.bak`. The inherited `/var/www/html/webxr` setting was overridden for this invocation only, in line with the established Greybox target.

## Scope and verification

- Source: `Champions of Krynn/DUNGCOM.DAX`, SHA-256 `827176e941f24176f1907bde40a81928cb4c2da66231ca6b07c72b0b03a0bf2a`; TOC ordinal 0 is on-disk block ID 1. The mapping admits only DOS CoK DUNGCOM block 1, local tiles 0–24. RANDCOM, WILDCOM and Amiga terrain stay on their original path.
- All 25 ordered 24×24 source frames and their external source PNGs were checked against exact 4× nearest-neighbor pixels. Each reviewed output is RGB 96×96 and individually pinned with the archive, source and decoded-index hashes in `apps/web/src/ui/cokTerrainRestyleManifest.json`. Tile 22 is intentionally preserved-empty and pixel-identical to its source. Generated art remains outside Git.
- `pnpm --filter @goldbox/web typecheck`: pass. Candidate `e2e:static` and all 10 intro routes pass. The candidate terrain route, 106-identity CoK graphics route, cottage pilot, PIC1#57 dialogue route and synthetic player-appearance route pass.
- Live `e2e:cok-terrain-restyle`: pass. The natural encounter displayed local tiles 22, 18, 1, 4 and 5; five terrain-only pixel samples matched the mapped art. Camera movement, unchanged combat state and exact DOS restoration pass.
- Live `e2e:cok-graphics`: all 106 CPIC identities pass; DOS → actual Amiga → Restyle → DOS preserves combat state and restores the exact DOS canvas.
- Live `e2e:cok-restyle` and `e2e:cok-dialogue-restyle`: pass. The latter follows the PIC1#57 landmark arrival, checks portrait-only DOS/Restyle/DOS, Continue retention and native PIC1#58 fallback. Live `e2e:intros`: all 10 routes pass.
- Local dev-only negative and compositor controls pass in the focused terrain gate. The external live run intentionally skips those dev-module mutation controls.
- Manual screenshot inspection could not be completed: Windows screenshot capture timed out. The focused browser routes and pixel/state assertions completed successfully; this receipt does not claim a manual visual review.
- The full 190-case browser suite and corpus were not run for this release. No native/Rust execution or retail-save test was performed. Do not claim full CoK graphics coverage.

## Remaining CoK coverage

This bounded release adds one DOS terrain bank. Player identities/variant semantics, remaining CPIC and dialogue identities, exploration walls/doors, other scenes/backgrounds, UI/intro art, animation and independent Amiga mappings remain open. Continue from the ordered roadmap in `GOAL.md` and the [runtime coverage register](cok-restyle-runtime-coverage-2026-10-26.md); generated-file counts and explicit fallback do not close required coverage.
