# CoK CPIC2 silhouette repairs — 2026-10-26

This records two external Restyle repairs and their current candidate-only runtime evidence. The
original per-asset prompt files were not present in the external workspace; the prompts below are new
repair prompts and must not be represented as the original prompts. Original `dos_render_all` inputs
were read-only. Prior `done` files were backed up before replacement.

## Inputs and outputs

| Asset | DOS source SHA-256 | Previous Restyle SHA-256 | Accepted Restyle SHA-256 | Canvas |
| --- | --- | --- | --- | --- |
| CPIC2#2 | `4464C39228972ED859EC17C79158FDCA6E0DEBF13D4E031A8017F5DACA35BBBD` | `81943EA39E3D7CA512B9C5A4C58045E1C29F0246F554675CD63B51D269178D34` | `FF045D2D580F16678DA30E460A34A76308145F7AC6B7521A166E0908A34844C5` | 192×96 RGBA |
| CPIC2#4 | `32F58DD550AD198477E4B8808706533FFB94CD708E8C2BBCFBCCEFE87C888369` | `F4DB4574B354BA19B1139F11C0C7710989F98AA3CB6AC826FD88B10944440FA3` | `037CEA00EFBEB854658546D3CD818AAA8E294D8B1510D6C8F1A25A80881595B1` | 96×96 RGBA |

Accepted outputs are in `{external-workspace}/cok_restyle_work/done/`. Previous outputs are preserved in
`{external-workspace}/cok_restyle_work/candidates/` with `previous-20261025` in their names. The raw
ImageGen files are in the Codex generated-images directory; their full paths and hashes are recorded
below. Each was resized with Pillow/Lanczos to its exact source aspect and manifest geometry without
cropping or repositioning. Candidate hashes, not raw ImageGen hashes, are the manifest pins.

## ImageGen provenance

### CPIC2#2

- References, in order: `{external-workspace}/cok_restyle_work/dos_render_all/CPIC2/CPIC2_002.png`
  (SHA-256 above), then `{external-workspace}/cok_restyle_work/done/CPIC2_002_restyle.png` before
  replacement (SHA-256 above).
- Raw output: `{local-user-profile}/.codex/generated_images/01a13cfd-f5f4-7113-ae49-0d9a8991eb87/exec-47bdb1cd-ba0c-441c-aa5c-283c10004e31.png`
  (SHA-256 `5CF9EB3839A20ADAE8E73473CD0D231330ABC260FE7355C56A472F8DE2C9CA87`, 1774×887 RGBA).
- Processing: exact 2:1 aspect, Lanczos resample to 192×96; no crop, mask painting, or positional edit.
- Repair prompt:

> Edit ONLY the second image, using first image as the exact structural stencil. Produce the same compact, coiled, right-facing dragon from the DOS source. The source has a compact head in the upper-right, body and neck coiled through the center, tail/wing/body contour on the left; reproduce its exact outer contour, visible-pixel coverage, orientation, object parts, relative sizes and placement. The current Restyle is style inspiration only; it is not permission to change the pose or crop. Preserve the source silhouette and transparent negative spaces pixel-for-pixel conceptually. Do not draw a full-body dragon, humanoid, wings beyond the source, or any new pose. Restyle only the colors and surface detail with polished dark charcoal scales, vivid cobalt blue and cyan highlights, silver-gray ridges, cyan belly and a small red-orange eye. Keep a transparent background. Return a single PNG on the exact same 192 x 96 canvas, no borders or padding.

### CPIC2#4

- Reference: `{external-workspace}/cok_restyle_work/dos_render_all/CPIC2/CPIC2_004.png`
  (SHA-256 above). This final accepted trial used the DOS source alone as its composition reference.
- Raw output: `{local-user-profile}/.codex/generated_images/01a13cfd-f5f4-7113-ae49-0d9a8991eb87/exec-a34156de-2972-4f98-b336-81291a8c42cc.png`
  (SHA-256 `CB8E92D07AB4F113927365B0D78FDE6F5D96E6CF35B8E87D37F5E2E63ED61EA8`, 1254×1254 RGBA).
- Processing: square Lanczos resample to 96×96; no crop, mask painting, or positional edit.
- Repair prompt:

> Redraw this exact tiny Champions of Krynn fighter sprite as a restyled game sprite. The one reference image is the source template. Do not invent a new character or pose. Match the same source pixel-cell silhouette exactly: preserve the helmet/head, torso, both arms and weapon, both legs, boots and the red trailing cloth, at precisely the same positions and proportions. Keep all of the sprite's visible source areas colored, including narrow edge pixels. Keep all originally empty transparent areas empty and add nothing outside the original figure. Do not omit, simplify, crop, zoom, shift, enlarge or rotate any part. Restyle with deep blue-gray steel, silver highlights, golden trim, crimson cloth and natural human face colors. No dragon, wings, extra armor extensions, glow, shadow or background. Transparent RGBA on the same square source canvas; output one sprite only.

## Verification and release boundary

- `node apps/web/scripts/bundle-cok-combat-restyle.mjs` verified and staged all 106 source-pinned files
  into the complete candidate. `bundle-cok-player-appearance.mjs` verified its six pinned player frames.
- The current-source hash-built candidate is
  `{external-workspace}/batch03_work/dist-app-b3-cpic-106fix-20261028` (1,245 files; 886 files under
  `assets/`; 23 game JSON manifests byte-identical to B2b+B3). Candidate HTML SHA-256 is
  `49BB9AA716861203996FEC82729A72ED0DF4B31BF9A9C14955E928CC6ED7F98C`; JS bundle
  `index-C1HPdh9S.js` SHA-256 is `8C4AC835E3116D60117183EDAAFCCCA6EC01600D6FEBCB592EB9DA7C23961F15`;
  CSS bundle `index-BCBR1-kE.css` SHA-256 is
  `9AC3E528B51C42FC90AFF64D5DE867D986CF0122A1F42935AC1B2345ECE2C8F0`.
- `node apps/web/test/cok-combat-graphics.mjs` against that candidate passed **106/106** archive-hash
  + picture-id identities, including source-mask containment, per-icon and whole-canvas pixel changes,
  combat-state invariants, exact DOS restoration and guarded-enemy fallback. DOS → Amiga → Restyle →
  DOS passed with unchanged combat state.
- `node apps/web/test/static-build.mjs` against the candidate passed. `pnpm e2e:intros` passed all
  10 routes. `pnpm --filter @goldbox/web typecheck` passed. The full candidate browser suite remains
  red at 173/190 passed, 1 skipped and 16 failures; it reports the pre-existing Matrix Cubed driver,
  NWN loot vocabulary, unavailable local fixture/data, save-route and DQK QSV issues. These failures
  are not attributed to this artwork delta and are not reported as green.
- The completed deployment and live verification are recorded in the
  [release receipt](greybox-cpic2-repair-release-2026-10-26.md). The full combat-icon identity suite
  passes on the source-built candidate and live; broader CoK art/runtime coverage remains open.
- These 106 enemy combat icons do not close character-icon coverage or the remaining exploration,
  dialogue, portrait, terrain, UI, and animation coverage.
