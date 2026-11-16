# CoK Restyle runtime labels candidate — 2026-10-27

## Scope

This slice updates the `?restyle=1` CoK generated-art inventory with evidence-backed
runtime-use labels. It joins the existing generated pairs to the checked-in CPIC and
player appearance runtime manifests by their exact output and source/output hashes.
The gallery exposes a Runtime use filter and displays the evidence for each approved
pair. It keeps composition review separate and marks it `not-reviewed`.

The inventory contains 2,540 unique source/output image pairs. The runtime manifests
reference 106 CPIC bank/block identities and eight currently presented player parts
(head plus body frame 0 for four appearances). Duplicate image pairs collapse to
105 runtime-approved cards: 99 unique CPIC pairs and six unique player pairs. Four
secondary player body frames are not presented by the current compositor and remain
candidates. This evidence does not establish visual composition approval or complete
CoK graphics coverage.

## Candidate package

- Candidate: `C:\GoldBoxImg\batch03_work\cok-restyle-gallery-runtime-labels-candidate-20261027b`
- Complete package: 6,347 files; retains all 6,345 prior-package files, removes none,
  and changes only `index.html` and `restyle/cok-generated/manifest.json` among existing
  paths, while adding two hashed JavaScript chunks.
- Inventory: 2,540 unique pairs, 105 runtime-approved, 122 held, 13 excluded.
- `index.html` SHA-256: `e86d75bbe457548b6cdac47fcf62262e369c5bd6b4b40918b16baf4798cc434d`.
- Inventory manifest SHA-256:
  `8bdcf8dbab81923ef2733d7ba22468e2d3f332eabb082941a23ec5bb33adebb7`.
- The public-artifact policy checked 920 asset files successfully. Full static smoke
  passed. The build reported 620 unavailable local game-file references in this
  checkout; the reduced build output was not used as the release package.
- Focused inventory tests (4/4), web typecheck and application build passed during
  preparation. The full candidate was assembled by overlaying the build on the last
  accepted complete package, preserving all previously deployed game artifacts.

## Published and verified

Published atomically to the existing private Greybox site on 2026-10-27 using the
installed `deploy-static.ps1`. A live fetch returned matching SHA-256 hashes for
`index.html` and `restyle/cok-generated/manifest.json`; the referenced JavaScript
bundle also returned successfully with SHA-256
`24f943a6fb281c23fedce5aff7a74e9e590bf81423c06362ec0d26321699b5e8`. The live page
shows all 2,540 pairs, the Runtime use filter, and 105 runtime-approved pairs with
their evidence. Composition review remains `not-reviewed`; runtime approvals here
mean the exact assets are referenced by the current manifests, not that every image
has been visually approved or that full CoK graphics coverage is complete.
