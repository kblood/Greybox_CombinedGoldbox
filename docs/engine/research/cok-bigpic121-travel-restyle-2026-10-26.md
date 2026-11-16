# CoK BIGPIC1#121 travel Restyle — live release and gallery comparison

## Scope and source identity

The source-admitted DOS map is available in CoK direct travel, dialogue/combat return, and the
before/after gallery. It is keyed by the exact `Champions of Krynn/BIGPIC1.DAX` archive identity,
decompressed block, decoded indices, frame and geometry. This does not admit an Amiga map equivalent
or close the full CoK graphics or Electron coverage goal.

| Evidence | Identity |
| --- | --- |
| Archive | `BIGPIC1.DAX`, SHA-256 `34cf5207584cb859817e1fc9b579cd51beea2e00e3393adbdc251e07f93483ec` |
| Block/frame | #121/frame 0; raw block SHA-256 `62b78a91d3e1b876f15ef70396c87b03279a996b22b5a16f781208f9bea0b395`; decoded indices SHA-256 `f44de0a16e1ddf56ad88bd7d34ac4d267e6f691b3f348b0cf80a71f0cf0f1917` |
| Native frame | 304×120, offsets 0/0; DOS-EGA |
| Source PNG | `dos_render_all/BIGPIC1/BIGPIC1_121.png`, 1216×480 RGB, SHA-256 `e9f69763ee7cc48361cc3d44f2b22182d0a49cec21e7bf06c663478e27c10c91` |
| Restyle PNG | `BIGPIC1_121_restyle.png`, 1216×480 RGB, 1,477,198 bytes, SHA-256 `435446f169edece24c52aa066b44cc84ad428bef09c2e60da292ee1df3e1a4f1` |
| Runtime package path | `restyle/cok/travel/BIGPIC1_121_restyle.png` |
| Gallery comparison | `restyle/orig/074_cok_overland_bigpic1_121.png` → `restyle/out/074_cok_overland_bigpic1_121.png` |

The image passed the bounded geography/anchor review. Gargath's source dot becomes a small ring and
Jelek's compact outline is slightly rounded; marker locations remain within source-backed grid cells,
and Kernen remains marked at `(31,3)`. The original full generation prompt/reference file was not
recovered. The existing output was reused without regeneration. See the corrected coordinate
semantics in [persistent-natural-routes.md](persistent-natural-routes.md).

## Runtime behavior

- Direct travel and the actual dialogue/combat return to picture #121 render the same pinned Restyle
  at `(8,8)` on the original 320×200 canvas.
- The 8×8 hollow white ECL cursor is composed above opaque Restyle pixels.
- The canonical `cok` graphics setting switches DOS-EGA/Restyle and gives Amiga an explicit DOS-map
  fallback. Art changes preserve travel coordinates, ECL memory, clock, party, dialogue turn and
  combat outcome.
- Original mode restores exact DOS canvas pixels. Unknown source identities stay on DOS art.
- Pending art requests are invalidated on mode change, replacement presentation and close. Missing,
  corrupt or geometrically unreviewed PNGs fall back to DOS; decoded bitmaps are closed.
- The exercised story sequence is the real BIGPIC1#114 caravan presentation, combat, and return to
  BIGPIC1#121. Retail ECL branches and movement filters are unchanged.

## Gallery and release

Source release commit `4b4ad2a1` (`feat(greybox): add runtime map to restyle gallery`) is pushed to
`origin/greybox`. It follows the runtime implementation/publication at `f4256254`.

Candidate: `{external-workspace}/batch03_work/dist-app-cok-gallery-runtime-candidate-20261026b`.

- The live `?restyle=1` gallery has 74 comparisons. Its separate **Runtime (1)** lane contains this
  CoK map; Batch01/02/03 remain 12/56/5. The gallery previews the reviewed output separately from
  the in-game graphics selector.
- Candidate has 1,492 files; it retains all 1,488 files from the prior map release and all 23 game
  manifests byte-for-byte, adds two JS chunks and two gallery PNGs, changes `index.html`,
  `restyle/manifest.json` and `restyle/fidelity.json`, and removes no prior files.
- Gallery manifest and fidelity each contain 74 entries. The source and Restyle PNGs use the pinned
  hashes in the identity table above. Fidelity metadata records edge correlation `0.5177`, histogram
  distance `0.4819`, aspect deviation `0.0`.
- `public-artifact-policy.mjs`: pass, 909 asset files checked. Static production smoke passes, and
  all ten intro routes pass.
- Typecheck passes. `restyle-data.test.mjs`: 32 pass, including exact Runtime/Batch01/02/03
  partitioning. Focused travel integration and candidate-served runtime/gallery browser smoke pass.
- The candidate retains exact DOS pixels, changes the travel map in Restyle, uses DOS as the explicit
  unmapped Amiga fallback, and preserves map position, memory and clock. Its gallery shows 74 cards;
  the Runtime selection loads both 1216×480 images.
- Atomic deployment completed to `/var/www/html/greybox`. Live `index.html`, entry JS, CSS, dungeon
  chunk, gallery manifest/fidelity, both comparison PNGs and runtime Restyle PNG return HTTP 200 and
  hash-match the candidate. `?restyle=1`, the CoK travel route and the CoAB intro route return HTTP
  200. Root CUA selected **Runtime (1)** on the live gallery and visually confirmed both images.
- In the game, open **Travel** and select **New graphics · map** to see the same Restyle.

The full browser suite and corpus were not run; fixture-dependent failures/holds remain. Electron
packaging/acceptance was not run. Full CoK graphics coverage and an Amiga map counterpart remain open.
