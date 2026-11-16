# CoK Restyle inventory and CPIC1#12/#35 v5 release — 2026-10-27

Source commit `3bcc2a7c` was pushed to `origin/greybox`. The complete static candidate at
`{external-workspace}/batch03_work/cpic1-12-35-acceptance-20261027/package-v11` was atomically deployed
with the canonical `deploy-static.ps1` to `/var/www/html/greybox`; the script completed with
`==> done` and retained the previous site at `/var/www/html/.greybox.bak`.

## Live verification

The live root with `?restyle=1`, entry JavaScript, CSS, inventory manifest, and both v5 runtime
portrait routes returned HTTP 200. SHA-256 values for the text/static files exactly match the
candidate:

| File | SHA-256 |
| --- | --- |
| `index.html` | `94f770f9f59dfee200855f24490a1f323b739070018abcc57c9e659bc33a494e` |
| `assets/index-9qmLDI0M.js` | `f80f6030140476007c383005ba0e585245b380aeb0c46850fb02438d06a42b54` |
| `assets/index-BCBR1-kE.css` | `9ac3e528b51c42fc90aff64d5de867d986cf0122a1f42935ac1b2345ece2c8f0` |
| `restyle/cok-generated/manifest.json` | `37f8b37340c1d3df510efc7f2954483e7ba966923efc8fbfa5c5717641bfed94` |
| `restyle/cok/combat/CPIC1_012_restyle_v5.png` | `96c6466db956a6e97b8cd778a382fc35f7957aef5f3be28988fc35f24fa9f4cb` |
| `restyle/cok/combat/CPIC1_035_restyle_v5.png` | `28d08ecdf4db9c592039da27f7e1551f7bb36b7d5e21d09ee2cd82eadd151ea4` |

The live Restyle inventory manifest reports 2,542 unique source/output pairs, 4,840
content-addressed PNGs, 4,553 direct edges, 1,599 tile-alias rows, 3,609 alias edges, 107
runtime-approved cards, 122 held ledger rows, 13 excluded rows and 2 animation packs / 12 ordered
steps. A fresh in-app browser tab rendered the expanded inventory as `2.542 of 2.542 unique
pairs`; the pre-existing browser tab still displayed its previously loaded 2,540-pair view until
the fresh page was opened. The conventional before/after gallery remains 75 cards (27 CoK), with
the complete ledger inventory shown in the separate expanded section.

The new v5 portrait file hashes match the candidate's generated image identities. Both URLs serve
the expected PNG bytes. Runtime and gallery verification remain bounded: this release adds two
portrait repairs and refreshes the full inventory; it does not claim complete CoK art coverage or
composition review for every inventory card. Natural CPIC1#12 remains guarded and uses original
art in the natural encounter. The selected DOS-only runtime folder has no Amiga wall/map sources,
and the exploration landing view still renders no Restyle wall pixels.

Candidate gates are recorded in the [runtime acceptance receipt](cok-cpic1-12-35-runtime-acceptance-2026-10-27.md)
and [Electron graphics acceptance receipt](greybox-cok-electron-graphics-acceptance-2026-10-27.md):
web typecheck, inventory unit tests (4/4), web CPIC checks (108/108), complete-package Electron
route checks (2/2), and the public-artifact audit passed. Astra and Sol independently reviewed the
v5 geometry and candidate integration.
