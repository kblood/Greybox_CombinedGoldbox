# CoK Amiga PIC1.DAA #18 live release — 2026-10-27

## Release

Source commit `4524e444` (`Add CoK Amiga PIC1#18 restyle runtime`) was pushed to `origin/greybox`.
The complete candidate at
`{external-workspace}/batch03_work/cok-runtime-site-candidate-amiga18-preserved-20261027` was atomically
deployed with the installed `deploy-static.ps1` to `/var/www/html/greybox`, serving
`https://dionysus.dk/greybox/`.

The candidate retained the existing complete package, all 75 curated comparison cards, all 23 game
manifests and the exact pinned Amiga archive. The approved image replaces the existing card output
and is included at the matching Amiga dialogue runtime path. It does not represent DOS
PIC1.DAX#18 and does not close the overall CoK artwork-coverage goal.

## Live evidence

- Root page, hashed JS and CSS: HTTP 200. The entry bundle is `assets/index-BzqqAb7W.js`.
- `/restyle/manifest.json`: HTTP 200, 75 items; includes
  `cok_amiga_daa_cok_pic1_pic1_018_f0` (`game=cok`, `kind=face`).
- `/restyle/fidelity.json`: this item has verdict `ok`, `edge_corr=0.8539`,
  `hist_dist=0.1931`, `aspect_dev=0`.
- Gallery image `/restyle/out/036_cok_amiga_daa_cok_pic1_pic1_018_f0.png` and runtime image
  `/restyle/cok/dialogue/AMIGA_PIC1_018_f0_restyle.png`: both HTTP 200, both SHA-256
  `a7d21c06f8c457591a1009c67a1e69c68bc0e0ace99240afee2387643d092cc7` (1,408 × 1,408).
- Pinned source `/assets/amiga_extracted/ChampionsOfKrynn/disk2/pic1.daa`: HTTP 200, SHA-256
  `b3512ed6a030ac27538ae66f6115bdf0bf1f5a78e63eba0d32fef3e32b049687`.
- Focused public CoK retail-travel browser route: 1/1 passed against
  `https://dionysus.dk/greybox` (`GB_E2E_ONLY=cok-retail-travel`).
- Candidate checks: Amiga #18 packager/runtime tests 18/18; web typecheck passed; production static
  smoke passed; public-artifact audit checked 928 asset files.

The independent live audit confirmed the manifest entry, `ok` fidelity verdict, image hashes and
archive hash. It checked publication over HTTP; interactive visual review of the Restyle card was
not part of that audit.

## Remaining CoK scope

The published Restyle view still has 75 curated cards and the expanded source/output inventory; it
does not imply that every CoK graphic has a replacement or runtime mapping. DOS PIC1.DAX#18 and
#59, BIGPIC1#114, character identity joins, animations, interface artwork and other reachable
consumers remain tracked in the [CoK runtime coverage register](cok-restyle-runtime-coverage-2026-10-26.md).
