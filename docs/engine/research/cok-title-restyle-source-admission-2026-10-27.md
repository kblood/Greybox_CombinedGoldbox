# CoK `TITLE.DAX` Restyle source admission checkpoint — 2026-10-27

This is a source/provenance and visual-review checkpoint for the DOS title family. It does not
admit a runtime route, change the title compositor, or authorize a release. The input, prompt,
context and generated files under `{external-workspace}` were left untouched; the corrected reference
and review candidates live in the separately named `title2-corrected-source-20261027` directory.

**Follow-up status, 2026-10-27:** a later source-only change added the CoK title graphics selector,
three-screen Restyle composition/fallback, exact four-image runtime manifest and build-time gallery
and runtime packagers. An independent read-only review confirmed the pinned metadata, fidelity and
image hashes and found no concrete source defect. This later work supersedes the opening sentence
only as to whether a runtime route/compositor and packager exist in source. It does not mean that a
build/package or browser/runtime acceptance ran, that the corrected images entered the persistent
comparison ledger, or that any title runtime path is live; the documented focused-browser
`spawn EPERM` hold remains unresolved.

## Pinned source and four-block mapping

Archive: `Champions of Krynn/TITLE.DAX`, SHA-256
`5276ba718f3c31018c25852f0b6858a292aed5a94f8bd938803961bb1ade0a00`, 57,528 bytes, four image
blocks. The corrected source decoder reads the 17-byte DAX block header before pixels. The decoded
4× PNG pixel hashes are:

| DAX block | Geometry | Decoded source pixel SHA-256 | Existing prompt/input/output | Current disposition |
|---:|---:|---|---|---|
| 1 | 320×200 | `bc05bf3e127ab1e17f91f66881680e5c14cf91732a892d1595b25552c0be9b4d` | Batch03 `001_band_cok_dos_ssi_presents`; normal `_out.png` is the importer output (not `_bgonly_out.png`) | Source match established; independent visual review of the 1600×1000 imported image passed full-screen composition. Runtime presentation remains unverified. |
| 2 | 320×200 | `969c8e42b9c885af221b4f47505f49c7b8f845eb35f5c7e98ef01f422bbd242b` | Prior Batch01 `010_band_cok_title_art` input/output are tied to the stale decode below | Prior output rejected for source admission. The strict corrected-source candidate and normalized import passed independent composition review and isolated import/fidelity. Not yet added to the official ledger, runtime package or live site. |
| 3 | 240×88 | `145b95153c90a395f0aa525a39a0809ecd2e973fbcba8ef724f4f99e080c6499` | Batch03 `002_cok_dos_title_logo` | Source match established; independent visual review passed the imported transparent layer and its separate composition over a fresh block-2 Restyle at `(40,8)`. Runtime presentation remains unverified. |
| 4 | 320×88 | `682fb3d5276bc646df03852ac7f8eee90765ec012a2068a5f356fa11719d1cb4` | Batch03 `003_cok_dos_dragonlance_vol1` | Source match established; independent visual review passed the imported transparent replacement layer and its separate composition over a fresh block-2 Restyle at `(0,8)`. It replaces block 3. Runtime presentation remains unverified. |

For Batch03 blocks 1, 3 and 4, the full prompt, input and `_out.png` SHA-256 values are recorded
below. Source-render comparison confirmed the reference pixels for blocks 1, 3 and 4 match the
decoded DAX pixels at 4×. Existing fidelity `ok` values document the importer metrics; the
independent visual composition and alpha/matte review is recorded separately below.

| Asset | Prompt SHA-256 | Input SHA-256 | `_out.png` SHA-256 |
|---|---|---|---|
| Batch03 `001_band_cok_dos_ssi_presents` | `31c8ff77a1eb77689f69eca52745116d4475513dd3ea5ddc6c7efea7541303b7` | `6f009402ca7d5911052e64f8a070d011cbe3a1dbe1116e6e8767310e0d28889b` | `7ff4fcd920a558d5e902afc291a22fdb3d8d8514073b6bc59d2ec2c1c4b99ac8` |
| Batch03 `002_cok_dos_title_logo` | `ec239c737d512af32bd8fec3bf5650c066df186adf00c67af52a75bbaff3a75f` | `0d0c70e50ca426e0004b84a17ed03f57e9dde50e17d72977b4eb7cc6cdb1448d` | `7c1dd28f9896328058d0c8d7f729752f10f6260ef3814596d7f8b190df05fe5d` |
| Batch03 `003_cok_dos_dragonlance_vol1` | `1aa6a9fb9ccc5a72e91205aff0ddd142dd3adb4b0e745cb9fdfb586033684f32` | `3b9d534cb85030f36d159f7d468836f44ed963304e22c559da873e2f90825a38` | `c52a6064019cd144d1fe411fdf16ccbabeb6bc14b0526d39ecda52f61443e9703` |

## Block 2 correction and reviewed candidate

`{external-workspace}/cok_restyle_work/title2-corrected-source-20261027/TITLE_002.png` is the corrected
4× decode. Its file SHA-256 is
`21c0f2c262ba638aa2a626f2123f033d7a65d75c73e7cfefc390079136099eaa`; the authoritative raw-pixel
hash is the block-2 hash in the table above. The existing Batch01 render
`{external-workspace}/batch01_work/renders/dax/CoK_TITLE/TITLE_002.png` has SHA-256
`396d7cf2c7ec2e95374e22cc37d61896d4600f00e79baba78d07fc7510ce6985` and matches the historical
bad decode that started at byte 8, cyclically shifting the source by 18 pixels. The Batch01 input
crop matches that stale render, so its previously generated title-art output is not admitted even
though its own input/output lineage is consistent.

The corrected input
`{external-workspace}/cok_restyle_work/title2-corrected-source-20261027/010_band_cok_title_art_corrected_input.png`
is 1536×1024 RGB, SHA-256
`942ab4c29fd68e9c841815ea3dbf96692e4edabc2ef05b8be4e096ec0bd1fabf`. Its
`[128,112,1408,912]` artwork rectangle, sampled to
the native 320×200 grid, matches the corrected DAX block-2 decode pixel-for-pixel. The original
Batch01 input remains unchanged.

The first corrected-source ImageGen candidate
`{external-workspace}/cok_restyle_work/title2-corrected-source-20261027/010_band_cok_title_art_restyle_candidate.png`
has SHA-256 `b1b61ccfb4cf9c2bf7727b1b87f45357a2ac00dde0805a41d95ca21efbd4d025`. Its full 3:2
image passed visual review, but its isolated import
`pipeline-output/001_cok_title2_restyle.png` (SHA-256
`95287d6ebfc29ee3c25230b67d82422c3d8180509839fb5f71d3ce56245d30f0`) was rejected: applying
the normal `[128,112,1280,800]` source crop clipped the pommel, sword base and foliage. Do not
use that import.

The first padded ImageGen candidate
`010_band_cok_title_art_restyle_padded_candidate.png` (SHA-256
`cc388ddda757166059cd580bc62373596452e41d3041cd497b5771a55e8fd078`) passed importer crop and
fidelity, but was rejected by independent review for adding a floating rock island and ground mass.
The next strict candidate
`{external-workspace}/cok_restyle_work/title2-corrected-source-20261027/010_band_cok_title_art_restyle_strict_candidate.png`
is 1536×1024 RGB, SHA-256
`415f33b0d003703c62cc4aaec25b029fc3f41aa0635ff409797389bd18f7d1e0`. Its complete prompt is
`010_band_cok_title_art_strict_prompt_used.txt`, SHA-256
`0780ceb60baecc299a95f7eb9ff29043db71c6505e5a5809f1e7866132190223`.

The strict candidate's isolated production import is
`pipeline-output-strict/001_cok_title2_restyle.png`, 1600×1000, SHA-256
`429c8f4336ef06724fcc08428e663f746b2c84563b2bcb0ef765eea3b1d26c98`. The importer records
`edge_corr=0.8386`, `hist_dist=0.2536`, `aspect_dev=0.0000`, verdict `ok`. Independent review of
the normalized image: **PASS**. The crop retains all source objects and the pommel's clear sky;
the two moons, castle, sword, crown, roses and leaves remain in place, with no extra terrain,
celestial body, lettering or frame.

All three import attempts used isolated new work directories. No original Batch01/Batch03 source,
input, prompt, output, ledger or website package was changed. This strict candidate is not yet in
the official asset ledger, runtime package, live site, or a complete title-sequence composition.
Do not replace the old Batch01 output in place before the project release gates.

## Composition contract and remaining gates

Live gallery check on 2026-10-27: `/greybox/restyle/manifest.json` returned HTTP 200 with 75
cards and four CoK title entries: `band_cok_title_art` (#2), `band_cok_dos_ssi_presents` (#1),
`cok_dos_title_logo` (#3), and `cok_dos_dragonlance_vol1` (#4). The #4 banner is already live.
The live #2 original PNG (`restyle/orig/010_band_cok_title_art.png`) SHA-256 is
`21c0f2c262ba638aa2a626f2123f033d7a65d75c73e7cfefc390079136099eaa`, an exact match for the
corrected DAX source. Its live Restyle PNG remains the prior stale-lineage output, SHA-256
`bd8d068ad61eab73f2dd6e125c8451fc9736f6ec6d133da8ae8f4ad7ecd54e97`; the corrected strict output
`429c8f4336ef06724fcc08428e663f746b2c84563b2bcb0ef765eea3b1d26c98` is not live. Thus the gallery
already shows all four source blocks, but #2's generated image and provenance metadata need a
corrected replacement. The full generated CoK inventory is a separate page data source and does
not establish complete curated/runtime coverage.

Independent review on 2026-10-27 passed the imported #1 full-screen composition and both title
layers. The #3 and #4 RGBA imports were separately overlaid on fresh block-2 Restyle backgrounds
using their native placements; both previews passed visual review. The review imports are
`{external-workspace}/batch03_work/import_out/001_band_cok_dos_ssi_presents.png` (SHA-256
`c249541adb4d6b29d9c0de8adedfc81a22244a90fed4aa7938c92c725ed0e886`),
`002_cok_dos_title_logo.png` (SHA-256
`608e3dee3f53cab258160438e773e741711aad4b2b0b82c4089b07519b709188`; alpha bbox
`[35,0,1663,594]`) and `003_cok_dos_dragonlance_vol1.png` (SHA-256
`8eab1dd63fe9df2bb670b5655cb873920826684e06cc7270992e71ad7f7ae7fe`; alpha bbox
`[0,0,1600,440]`). The separate #3 and #4 composition previews have SHA-256
`f89706772b09e27cd90d1d7b9425d8782a7bda40943f0396bc47306eaa16303d` and
`4f2a53e7c7179d998f72536d64660e9f5b351abb42aa4fcd7c82200d2e4100b2` respectively. This is
visual source/admission evidence, not an in-game or live-site result.

`TITLE.DAX` has four source blocks but three presented screens:

1. Block 1 alone.
2. Fresh block 2 background plus block 3 at `(40,8)`.
3. Fresh block 2 background plus block 4 at `(0,8)`.

The source DAX bands are opaque, and block 4 fully covers block 3. The existing generic
`composeDaxTitle` cumulatively overlays bands; for the source CoK bands the third image is
pixel-equivalent to block 2 plus block 4 when block 4's placement is correct. Restyle bands are
transparent keyed layers, so the final Restyle screen must instead be composed from a fresh block-2
Restyle plus only block 4. Never stack the transparent block-3 Restyle under block 4. Existing
research records the original CoK intro's 3/3 pixel-exact source composition; that does not prove
Restyle rendering or mode-switch restoration.

Still required before runtime admission: source-qualify and admit corrected block 2 plus blocks 1,
3 and 4 to the official asset ledger (the prior stale block-2 row cannot be reused as-is); pin the
accepted package hashes; review the source-level canonical CoK title graphics setting, Restyle
composition, native fallback, and unchanged key/menu/audio/Play/Demo behavior; then run focused
candidate, route, full-package and release gates. The selector/runtime path and build packager now
exist in the worktree, but neither has passed browser/runtime acceptance or been confirmed in a
built candidate. The currently documented Vite `spawn EPERM` blocks the affected browser acceptance
workflow. Do not retry it using another launcher or claim runtime/release acceptance from this
source-only checkpoint.
