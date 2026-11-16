# CoK DOS PIC1#58 Restyle — release receipt

This is the **published release** for one bounded increment: it admits CoK DOS-EGA `PIC1.DAX#58` frame 0 after the real Throtl `#57 → #58` dialogue transition. It does not admit an Amiga counterpart, additional frames, or full CoK dialogue coverage.

## Source and artwork admission

| Evidence | Pinned value |
| --- | --- |
| Game/system | CoK / DOS-EGA |
| Archive | `Champions of Krynn/PIC1.DAX`, SHA-256 `2f62dab8b7f776226d6c6c35847382de3baa758a836220639d2c46c2dd74ae97` |
| Block/frame | 58 / 0; native 88×88, frame offsets 0/0 |
| Decoded source render | `renders/dax_complex/CoK_PIC1/PIC1_058_f0.png`, 352×352 RGB, SHA-256 `ab274f539c435b02685a5b612360071906fa93294317846c0fe93e7022d67fc9` |
| Full prompt | `{external-workspace}/batch03/005_scene_cok_dos_pic1_058_f0_prompt.txt`, SHA-256 `32b3332b7927298302d61234ffe0956de9f2a5b0738802d373d4167d9c1fbb98` |
| Matching generation input | `{external-workspace}/batch03/005_scene_cok_dos_pic1_058_f0_input.png`, SHA-256 `f683574533648b474ce39f480b552d14f304806df9289e42f778fd5f1ee77260` |
| Accepted raw output | `{external-workspace}/batch03/done/005_scene_cok_dos_pic1_058_f0_out.png`, SHA-256 `7d334a5751cd704fb7f699c2320f019a77d0116dc246d2db794d5eb105fb7809` |
| Import crop and fidelity | `[284,28,968,968]`; `edge_corr=0.6259`, `hist_dist=0.4038`, `aspect_dev=0`, verdict `ok` |
| Runtime/gallery import | `{external-workspace}/batch03_work/pic1_058_restyle_candidate_v2_import.png`, 1408×1408 RGB, 3,476,634 bytes, SHA-256 `8fc50df402ea2f44001312e1556445ad7ac45a12506be60920e565232657dceb` |

The centered 88×88 scene preserves the two foreground red-roof houses, timber gate, path, treeline, hills and cyan sky. The first candidate was rejected; the prior `FLAG` raw output is preserved externally as `batch03_work/pic1_058_previous_FLAG_output.png`. The accepted v2 is copied byte-for-byte into the Batch03 `done` output, the gallery comparison, and the runtime package. The older normalized copies under `renders/imggen/webpack/out` and `batch03_work/import_out` are not release sources.

## Runtime and packaging

`apps/web/src/ui/cokDialogue58RestyleManifest.json` pins the exact archive, source frame and accepted import. `cokPortraitArt.ts` validates PNG signature, RGB type, hash, 1408×1408 encoded and decoded dimensions before returning pixels. The portrait uses scale 16 at the existing `(24,24)` origin, covering the original 88×88 rectangle. Throtl, travel and opening presentations carry separate #57 and #58 identities. Existing source-qualified selection, cache/revision guards and DOS fallback remain in force. No ECL, menu, discovery flag, or campaign behavior changed; Amiga #58 uses its original fallback.

The bundler validates #57 and #58 source/output pins before copying. #58 is read from the accepted imported file above, never from the old normalized output. The gallery comparison keeps the same 74-card published roster; the Batch03 PIC1#58 card now serves the same accepted PNG and records fidelity `ok` (`0.6259 / 0.4038 / 0`). The build candidate starts from the complete prior gallery/runtime package `dist-app-cok-gallery-runtime-candidate-20261026b`, retains every prior file and all 23 game JSON manifests byte-for-byte, and adds the #58 runtime image plus two hashed JS bundles. Candidate policy audit: 911 public assets.

## Candidate verification

Passed:

- Independent SHA/source-index/frame audit and raw→import pins above.
- `pnpm --filter @goldbox/web typecheck` and `pnpm -r exec tsc --noEmit`.
- `pnpm --filter @goldbox/web test:restyle-assets` (13/13).
- Focused dialogue browser test on development and the complete candidate, including real #57→#58 switching, distinct caches, map-only pixels, state retention, exact DOS restoration, Amiga fallback, wrong identities, stale loads, unadmitted #18, and missing/corrupt/wrong-geometry recovery.
- Candidate static production smoke, all 10 intro routes, the 106-identity CoK combat graphics gate, cottage, player appearances, terrain, walls, travel and gallery checks.
- Candidate and live gallery checks load the Batch03 PIC1#58 card and verify its `ok` metadata, 1408×1408 dimensions and exact imported SHA-256. The live comparison gate covers all 74 cards, the Runtime filter, the 74-card count and gallery modes.
- Candidate retains all 1,492 prior files and all 23 game manifests byte-for-byte; no prior package paths are removed. Its changed gallery comparison/fidelity, two new JS bundles, and one new dialogue PNG are isolated.

The regular local `pnpm build:app` is a reduced package: it reports 620 unavailable game-file references and copies 157/856 assets. Its static smoke failed on absent Secret of the Silver Blades GOG assets. The complete candidate, built from the previous full package, passes static smoke. Do not use reduced `dist-app` as a deployable release.

The final full browser-suite run on the updated source reports **103/160 passed, 32 skipped and 25 failed**, exit 1. All 191 selectable registrations were audited by the runner. The PIC1#58 gallery check now passes with `ok` metadata and no warning flag. Remaining failures are chiefly absent local DOS/Amiga/C64/WHDLoad data: retail story/atlas routes return missing ECL/GEO/archive files, the CoK/DoK Amiga routes lack extracted DAA/LBM files, and the C64 PRGs are absent. The dev-only CPIC2#129 check reads mismatched local untracked `apps/web/public/restyle/cok/` bytes; the complete candidate's 106-identity combat gate passes. Existing Amiga graphics-mode and localStorage selector cases also fail their local fixture/seam checks. These full-suite failures are reported, not claimed green; focused candidate routes for this CoK release pass.

Generated PNGs and comparison staging remain external/ignored and are not committed. Source/docs were committed and pushed as `2d6ce132`. The complete 1,495-file candidate (279,228,736 bytes; index SHA-256 `AA73628FFEE3F737ADDA41A324704E3AB1A0A505F906DAD503B10B707C7168A5`) was deployed atomically on 2026-10-26 with the existing deploy-static skill. The environment's prior `DEPLOY_REMOTE_BASE` pointed at another site's `/var/www/html/webxr`; the deployment process used the repository-documented `/var/www/html`, placing the site at `/var/www/html/greybox`.

Live verification: root HTTP 200; live HTML and candidate both name `assets/index-DUD9xT9r.js` (live bundle SHA-256 `7abffad23e416b5867b6d6ce6a9cf710d40d3cd3a60f3c056fcc4622ada3f924`). Both `restyle/cok/dialogue/PIC1_058_f0_restyle.png` and `restyle/out/005_scene_cok_dos_pic1_058_f0.png` return HTTP 200, 3,476,634 bytes and SHA-256 `8fc50df402ea2f44001312e1556445ad7ac45a12506be60920e565232657dceb`. All 10 production intro routes pass; the actual Throtl #57→#58 route passes portrait-only Restyle/DOS restoration and the unadmitted fallback; the focused production gallery route passes all 74 cards, the Runtime filter, Batch03 #58 fidelity/image checks, and Wipe/Side/Flip interactions with no browser errors or failed asset requests. The gallery end-to-end test was corrected to reflect the published 74-card total (including the one Runtime item) and CoK section count (26). The final full local browser suite remains 103/160 passed, 32 skipped and 25 failed due mainly to absent local game data and existing fixture/seam checks. These failures are not represented as green. Broader dialogue/portrait, terrain/UI/animation, Amiga and overall CoK coverage remain open. See also the [CoK runtime coverage register](cok-restyle-runtime-coverage-2026-10-26.md).
