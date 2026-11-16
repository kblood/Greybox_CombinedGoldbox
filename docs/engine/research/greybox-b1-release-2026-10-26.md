# Greybox bounded CoK B1 release receipt — 2026-10-26

## Scope

Published the bounded B1 combat-restyle increment from source commit `89c703cd` to the existing
canonical Greybox website. The only new generated art in scope is the reviewed disk-1 `CPIC1#8`
and `CPIC1#26` enemy overlay. This is a partial release. It does not claim complete Champions of
Krynn artwork, player-character icons, CPIC2/3 coverage, or coverage of other art families.

The two PNGs were reviewed directly against their DOS source frames: #8 retains the rat silhouette;
#26 retains the skeleton and shield silhouette. Both preserve transparency. Their source files
remain external to Git and were packaged through the pinned-art build step.

## Candidate and package identity

- Source commit: `89c703cdad6f1359e8428227c3054b4c2e2f4877`.
- Candidate directory: `C:\GoldBoxImg\batch03_work\dist-app-b1-candidate-89c703cd`.
- Reused prior audited package: `C:\GoldBoxImg\batch03_work\dist-app-goal-20261027-final`.
- Reuse manifest: `C:\GoldBoxImg\batch03_work\b1-package-reuse-89c703cd.json`, SHA-256
  `9708634ed16833f919791eb912d627efe7f305c79613c8e48b3c6edb017ae02f`.
- Candidate inventory: `C:\GoldBoxImg\batch03_work\b1-candidate-89c703cd-manifest.json`,
  SHA-256 `307d297de91c65b5b8602d26c160ecba0c540e5be096b9dc4cee5fd89b11eec7`.
- Candidate files: 1,133 total; 884 under `assets/`; 224 under `restyle/` (220 PNG, 3 JSON,
  1 HTML). The recursive audit found no forbidden path or file types.
- Candidate index SHA-256:
  `3eacb98833e87ba6a2c049d246f59fbb6142aba77bbb9ac41f27ce546ba99898`.
- Main JS `assets/index-3u9KGngN.js` SHA-256:
  `681b0d622e8dd93faf4ed3ec511074c0ac3a153bb5734bda17bd013563b66a11`.
- CSS `assets/index-Cum9eKi0.css` SHA-256:
  `0b59aae0abcb1541d3ea733eece6840ba2b224b3a21aa4f69ce3ad421fc50b04`.
- Restyle manifest SHA-256:
  `371f57cc0c7d595c99433d70d925395b35f19866f29181a141f681aaf24e1728`.
- `CPIC1#8` PNG SHA-256:
  `ba92c543501bef5123cc0023667294fcd9791d7dfd96cdcb75953dcc8d743e8f`.
- `CPIC1#26` PNG SHA-256:
  `3f6a7edc5dcf8b45d3c2143aedf1a64e1d7c11a3689e9077019206165ec572f0`.

The standalone `build:app` output was not used as the release package: it reported 620 unavailable
local references and audited only 160 assets. The new package instead reused the exact prior
audited 884-file asset set and overlaid the current Vite build and the two pinned PNGs. The
reuse manifest records the package files and source-diff basis.

## Verification

- `pnpm --filter @goldbox/web typecheck`: passed.
- Workspace TypeScript `pnpm -r exec tsc --noEmit`: passed.
- Engine suite: 209 files passed, 56 skipped; 2,373 tests passed, 741 skipped. Skips reflect
  unavailable local fixtures.
- `scripts/public-artifact-policy.mjs` on the candidate: passed, 884 asset files checked.
- `pnpm e2e:static` on the candidate: passed.
- Ten intro routes on the candidate: passed.
- Candidate CoK natural-combat restyle check: 1/1 passed.
- Candidate graphics persistence and library-boot selector checks: 2/2 passed.
- The full browser suite was run and exited 1: 102/158 passed, 32 skipped, with the remaining
  cases failing primarily because local Amiga/C64/Buck and other external game sources were
  unavailable. Two candidate graphics checks that failed against the source/dev environment due
  missing local assets passed against the candidate package. This broad gate remains red and is
  not represented as passing.
- `pnpm test:corpus` was not run because repository execution holds prohibit entering its
  Rust/native workflows.

## Publication and live checks

Published atomically to `/var/www/html/greybox` with the installed `deploy-static.ps1` script.
The deploy completed successfully. Live HTTP SHA-256 checks matched the candidate for the index,
main JS, CSS, Restyle manifest, and both PNGs. These live routes returned HTTP 200:

- `https://dionysus.dk/greybox/?restyle=1`
- `https://dionysus.dk/greybox/?intro=coab`
- `https://dionysus.dk/greybox/restyle/animations.html`
- `https://dionysus.dk/greybox/restyle/manifest.json`

Live browser checks for natural CoK combat restyle, graphics persistence, and the library-boot
graphics selector passed 3/3.

## Remaining work

Continue the active goal: finish B2a's source-only player draw trace and screen/Amiga mapping,
then implement one verified player appearance and icon through create/import, CharacterSheet,
party/save, and combat (B2b). Expand into CPIC1/2/3 and the other CoK runtime art families only
with source mappings, exact fallback behavior, and per-family visual/runtime checks. The full
CoK graphics goal remains open.
