# CoK CPIC1 #12/#35 bounded acceptance — 2026-10-27

## Current v5 candidate status

The earlier v1 outputs below were rejected for visible mask clipping. After the user-authorized
corrective restyle, v5 is accepted by Astra and Sol for runtime candidate verification. This
receipt supersedes the v1-only conclusion below. It does not claim complete CoK art coverage or
Amiga equivalence.

| CPIC1 | v5 output SHA-256 | Prompt SHA-256 | Source-visible cells retained | Escaped alpha pixels |
| --- | --- | --- | ---: | ---: |
| #12 | `96c6466db956a6e97b8cd778a382fc35f7957aef5f3be28988fc35f24fa9f4cb` | `e0ff4ce1ea8c2d7cec4838879c6e37f999df01a1c99621c85d3b619df679fc76` | 144/144 | 0 |
| #35 | `28d08ecdf4db9c592039da27f7e1551f7bb36b7d5e21d09ee2cd82eadd151ea4` | `7616c52bebc57e7773e00d2ee1bfca92515bc02443a496ecbe4f383d7d304dbb` | 164/164 | 0 |

Both are 96×96 RGBA, with alpha constrained to the exact 24×24 DOS source mask. Their full prompts
and matching source PNG hashes are pinned in `apps/web/src/ui/cokCombatRestyleManifest.json`; the
source prompt files and generated v5 files remain in the external `{external-workspace}` work area. Astra
and Sol independently accepted the visible pose/equipment alignment. The runtime still inherits
the original source mask, whose index-8 transparency creates dark-leg/torso gaps; this was not
silently repainted or changed.

Fresh static candidate `{external-workspace}/batch03_work/cpic1-12-35-acceptance-20261027/package-v11`
contains both v5 assets in runtime and in the expanded CoK Restyle inventory. The inventory has
2,542 exact source/output pairs, 4,840 content-addressed PNGs, 107 runtime-approved cards, 122 held
rows and 13 excluded rows. Both old v1 images remain visible as unapproved candidates. The
inventory opens by default, so the enlarged CoK collection is immediately visible on `?restyle=1`.
All 23 game manifests match the prior package; relative to `package-final`, this candidate adds six
files, changes `index.html` and the generated inventory manifest, and removes none. The public
artifact policy audits 924 files successfully.

Validation on this candidate: web typecheck, the generated-inventory unit test (4/4), and the
focused CoK combat graphics check (108/108 CPIC identities) pass. The focused Electron retail route
passes 2/2 against the complete package: travel and combat Restyle return to exact DOS pixels;
the combat snapshot and campaign state remain stable; all 25 terrain tiles and CPIC #12/#35 load in
the diagnostic route. Natural #35 changes 164 visible samples. Natural #12 is guarded and retains
original art; the source-pinned diagnostic #12 changes 144 samples. Amiga travel/wall assets remain
unavailable in the selected DOS-only folder, and exploration landing still renders no Restyle wall
pixels. Those are explicit remaining coverage limits.

The candidate is prepared and locally previewed, but this receipt alone does not assert that it is
live. Record the deployment commit, live hashes and route check in the release note after deploy.

## Rejected v1 evidence (historical)

The following records describe the first candidate only; they are not the current asset status.

## Source and artwork

The current `decodeAsset(bytes, 'CPIC1.DAX')` decoded archive SHA-256
`5f3e5fdc1734f8aed583233da9c97630b130ad5628eee0f18d875291dfa5e26b`.
Both blocks are one 24×24 frame, index 0, offsets 0/0, fixed EGA palette. Raw transparency is
null; `iconLibraryFrom` maps source indices 0/8 to runtime transparent index 0. The decoded
palette pixels, nearest-scaled 4×, match the external DOS ledger PNGs byte-for-byte.

| CPIC1 | Source PNG SHA-256 | Existing RGBA 96×96 output SHA-256 | Bytes | Visible/masked source cells |
| --- | --- | --- | --- | --- |
| #12 | f3c46a8c6005ab79ae27dd0a0c8e5d4554343914065f99579607ecc9beed74e2 | 7947ae446328673fa6e6b36ec334caae433fb44e32b82b754f0284f122b1cfe4 | 13829 | 144/432 |
| #35 | f035788ff37fa14ebc1c45349137d9ee83e23735628428b0e416a31e7d5fd757 | d73f9ff7a4e73786356892ce198c2d82137a3f278b179fe5eb540e67f71e6268 | 15755 | 164/412 |

The first contact-sheet review preserved broad poses/colors, and the existing runtime mask clips
2,325/#12 and 2,753/#35 output pixels while erasing zero visible source cells. Astra's later
independent visual review found that this still damages composition: #12 loses substantial parts
of the head/arms/boots and #35's sword/shield are visibly clipped. Technical mask containment does
not establish composition approval. Both images are **held from release**; mask policy was not
relaxed. #59 decodes identically to #35 but remains explicitly unadmitted.

Corrective v2 previews were made with the ChatGPT image tool from each exact DOS source and its
existing restyle as a style reference, then resized to 96x96 by nearest-neighbor from a 24x24 grid.
They are external previews only at
`{external-workspace}/batch03_work/cpic1-12-35-acceptance-20261027/repair-v2`; no v2 output hash has
passed the source-mask or full candidate gates. The original full prompts/reference files for
these two separately maintained CPIC assets are absent from `{external-workspace}`, and their coverage
records have no prompt/reference text. Do not admit or publish these previews until the complete
reference contract is recovered or the user explicitly authorizes a new corrective prompt.

## Validation

`pnpm --filter @goldbox/electron build` passed. Targeted `bundleCokCombatRestyle` selection
staged exactly two outputs; changed-hash, wrong-geometry and unadmitted-stem controls rejected
without writing output. All 108 packaged CPIC pins passed.

With the final candidate served on localhost:5197,
`GB_COK_GRAPHICS_BASE_URL=http://127.0.0.1:5197 pnpm --filter @goldbox/web e2e:cok-graphics`
passed 108/108 identities, real Amiga rendering, cross-bank negatives, state preservation and
exact DOS restoration. These are source-pinned diagnostic encounters.

`GB_ELECTRON_ONLY=electron-cok-retail-travel`, with `GB_ELECTRON_RENDERER_ROOT` set to the
final candidate, passed 2/2. Opening [36,16,17,16], mission/commandant, map #121, area 1/32,
natural combat flag 8 and party/pose/clock save-load passed. Natural #12 was guarding and
retained original pixels; natural #35 changed 164 source-opaque samples. Separately labeled
diagnostic #12/#35 encounters normalized their guard flag and changed 144/164 samples.
All had zero escaped mask pixels, unchanged game state and exact DOS restoration.

## Package and limits

Candidate: `{external-workspace}/batch03_work/cpic1-12-35-acceptance-20261027/package-final`.
It retains all 6,347 published files and all 23 game manifests: 6,351 total, four additions,
no removals; only existing index.html and inventory manifest change. Inventory retains 2,540
pairs, 4,838 PNGs, 122 held/13 excluded; both DOS cards have exact evidence, 107 approved.
Local dist-app is unchanged. No deployment, commit, broad browser/corpus/native/Rust gates.
Full artwork coverage, natural unguarded #12 and Amiga player identity remain open.

Exact package/source audit JSONs and contact sheet are under the candidate's parent directory.
Source/test delta: 111 added/changed lines plus 22 manifest lines, 8,928 added UTF-8 bytes;
the preceding Electron selector work is excluded from that incremental count.
