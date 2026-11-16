# Greybox CoK Restyle inventory release — 2026-10-27

## Scope

This bounded website release adds an independently browsable inventory to the existing `?restyle=1`
comparison page. It collects source/output pairs from the DOS and Amiga CoK coverage ledgers,
including character icons, portraits, title art, scenes, combat/overland art, tile families, font
atlases, and the two animation hubs. Search and family/platform/status filters operate over the
whole inventory; at most 48 pair cards are rendered at a time. Animation controls follow each
hub's recorded `PLAYBACK.md` sequence; all changed animation frames are pinned to the final frame 0
as their basis.

The inventory is not a runtime approval list. Each pair records source matching, output provenance,
ledger aliases, prompt evidence, composition review, and runtime approval independently. The
2,540 comparison pairs remain `composition not reviewed` and `runtime not approved` except for the
separate exact-hash BIGPIC1#121 alias that links to its existing approved Runtime comparison. The
different BIGPIC2#116 output remains a separate comparison variant. 122 ledger rows are held
(including 94 DOS tile-alias rows without an admitted exact Amiga counterpart and 28 unmatched
Amiga 8X8D0#32 retries); 13 blank/empty rows are excluded.

This change packages existing user-provided ledger and image data; it does not generate new
images. It does not implement or verify the CoK runtime graphics selector. The wider artwork
denominator and runtime mode-switch gates remain open.

## Inventory and candidate

Source commit `f8d6bc43` is pushed to `origin/greybox`.

The generated inventory manifest records 6,278 ledger rows, 6,143 eligible rows, 4,551 direct
source/output edges, 1,599 tile-alias rows and 3,609 total alias edges. It contains 2,540 unique
comparison pairs and 4,838 unique PNGs (156,345,237 bytes), two animation packs and 12 playback
steps.

Complete release candidate:
`{external-workspace}/batch03_work/cok-restyle-gallery-release-candidate-20261027`.

- 6,345 files / 455,209,789 bytes; public-artifact audit checked 918 assets.
- Retains all 1,504 paths from `cok-demo-runtime-release-candidate-20261026`; removes none.
- Adds 4,841 files: 4,838 inventory PNGs, the inventory manifest, and two hashed JavaScript bundles.
- All 23 game JSON manifests are byte-identical to the previous candidate.
- Only an existing `index.html` changes; prior CSS and all prior asset paths/hashes are retained.
- Eight pre-existing preview files under `apps/web/public/restyle/cok/` were not overlaid; each
  remains byte-identical to its previous-candidate counterpart. `selection.json` and
  `source-before.json` remain local scratch and are not in the candidate.

Candidate hashes:

- `index.html`: `4a2ce80c9b9301725c287fc502de689ed295fe576814f2c66f042344f4aff565`
- Entry JS `assets/index-Bj388OgG.js`:
  `a4d413d4a7170c02bd5097233dee818cc78e8b8a606e8f50a5bb959af15e8248`
- CSS `assets/index-B_6xssA6.css`:
  `b8ffe181f1087b544360a073931598d0d30c26a934e14e5cc3da4ad246319307`
- Inventory manifest `restyle/cok-generated/manifest.json`:
  `68c46e7eb6323359ec636ec5b195c72ea52e209fe3a296e4d6678100e877e074`

## Verification

- `pnpm --filter @goldbox/web typecheck` passed.
- `node --test apps/web/test/cok-generated-inventory.test.mjs`: 4/4 passed, including hash-based
  deduplication, runtime aliasing, prompt/playback references, held records, filters, pagination,
  and full PNG chunk/CRC/DEFLATE scanline validation.
- `node apps/web/scripts/public-artifact-policy.mjs {external-workspace}/batch03_work/cok-restyle-gallery-release-candidate-20261027`
  passed (918 assets).
- Focused static-candidate browser check passed: the inventory appears before the legacy gallery;
  all 96 source/output images on the first 48-card page load; pagination advances to page 2/53;
  CBODY filtering, the 8X8D1 font-atlas record, playback r0→r1, the #121 Runtime link and the
  existing 75 comparisons are present. No browser errors or failed image loads.
- `build:app` reports 620 source paths unavailable in this checkout (original installations and
  extracted game trees). The raw reduced build was not deployed; the complete candidate instead
  starts from the previous accepted package, retains every previous path, then adds the inventory.
  The broad corpus/browser suite was not run under the task's execution holds.

## Publication and live verification

The installed `deploy-static.ps1` performed a dry-run preflight, then atomically deployed this
candidate on 2026-10-27 to `/var/www/html/greybox`. The process-scoped remote base was
`/var/www/html`; the previous site is retained at `/var/www/html/.greybox.bak` with mode 700.
The live tree contains 6,346 files including `.htaccess`.

Live root returned HTTP 200. Live `index.html`, referenced JS and CSS, the inventory manifest and a
source/output PNG pair match the candidate by SHA-256. On live `?restyle=1`, the inventory reports
2,540 pairs and two animation packs, the existing gallery reports 75 comparisons, all 48 first-page
cards load both images, and the exact #121 link is present. Edge reported no console errors or 4xx
responses during this check.

Keep the runtime setting, complete art-family coverage, composition review, and Browser/Electron
mode-switch acceptance open; this release is gallery and inventory work only.
