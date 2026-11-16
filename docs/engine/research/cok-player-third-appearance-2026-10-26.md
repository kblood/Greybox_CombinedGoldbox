# CoK third DOS player icon admission

Bounded Browser/Electron source-admission slice, 2026-10-26. This adds one visual identity
and one canonical creation choice. It does not assign animation/pose semantics, extend the
retail appearance editor, admit other storage slots/suffixes/heights, or establish Amiga art.
No source/input artwork was changed or regenerated; complete matching prompts are absent.

## Exact identity and source verification

The retained [source contract](cok-player-icon-source-contract-2026-10-26.md) establishes
OR pixel composition, independent key-1 mask composition, and palette selectors
`[1,2,3,4,6,7]`. Only these new tuples are admitted:

| Tuple (hex) | Identity | Source blocks |
| --- | --- | --- |
| `05 17 04 02` | `cok-player-05-17-04-02`, canonical | CHEAD69/197 + CBODY87/215 |
| `05 17 05 02` | Same identity, exact storage-slot alias | Same blocks |

CHEAD request5 addresses slot11. CBODY request23 addresses the explicitly proven slots4/5.
Suffix T/code2 selects request+64 and its +128 variant. The second body variant is loaded and
source-checked; existing character-sheet, preview and combat consumers still draw frame0.

Fresh read-only verification rederived these full archive pins from the authorized originals:

- CBODY.DAX: `0C93206B020E30EECC1F761A9408B5BEFC20113FDE18A8B401AE2DDAD2C103BD`.
- CHEAD.DAX: `8E61D8CF23B7094353425224F02BE4423B880C5E8A7E168D478EC851BFAEA568`.

Python/Pillow with `tools/dax_decode.py` independently decoded CHEAD69/197 (24x8) and
CBODY87/215 (24x24). Every original RGB PNG equals the decoded RGB enlarged exactly4x with
nearest-neighbor sampling. The two heads are identical; the two bodies are distinct.
All original/Restyle PNG hashes and PNG geometry/types match the manifest pins. The loader
checks those PNG pins at runtime; archive pins record offline source provenance.

| Body | Original RGB PNG SHA-256 | External RGBA Restyle PNG SHA-256 |
| --- | --- | --- |
| 87 | `AE94D19F0935BB164EBBCD70D1C4F179EB2996AE17A0190E5303FF59CFF753EB` | `908C6DCD4A1A5D45B6C9C437EE1398B7F1F4B7D7D2AF7CB191CD0B95362034D1` |
| 215 | `48D6D23361CA50A31FD0815B2C7E130529F67DB3DD29904C8C2068744CB01D9D` | `77AA1D0ACEAA64928370426D792E449ECE5FC8C3BBB3DAD148F86282CE865AA9` |

CHEAD source/Restyle pins and the previous two identities remain unchanged.

## Missing-alpha content review

Independent body-only audit found 0/148 fully alpha-missing nonblack/non-key source cells for
87 and 8/160 for215. The eight native coordinates are `(6..12,22)` and `(20,22)`. They occur
below the head rectangle. The existing source-color restoration restores all16 output pixels
of each erased cell using the correctly composed/palette-mapped original color and alpha255.
A focused check asserts the raw external body alpha is zero there and the final composed
Restyle equals original RGBA under all three tested palettes. No mask/alpha gate was relaxed.

Source and composed87/215 images were inspected locally against checkerboard backgrounds.
The restored215 cells retain the source boot/foot baseline; the output retains the source
silhouette. Black source cells remain opaque under the proven key-1 contract. The unchanged
mask rejects output pixels in source holes. This bounded composite inspection required no
regeneration and is not a claim that generated RGBA alone preserves the source mask.

## Independent original RGBA oracle

The previous documented Python DAX-index procedure was repeated for both bodies and three
palettes: test `[10,21,32,43,64,75]`, alternate `[E2,D3,C4,B5,A6,97]`, and neutral identity
`[91,A2,B3,C4,E6,F7]`. Pixels are OR-composed before palette mapping; head/body masks combine
independently with key1; RGBA expands exactly4x. These hashes were calculated outside the
TypeScript loader, then pinned in the focused test:

| Body | Palette | Original RGBA SHA-256 |
| --- | --- | --- |
| 87 | test | `54C83F01AB392E4CB87669DF8B2BE932C245CD35F6B19BC12C53366E908A4641` |
| 87 | alternate | `BA3512E8B77F2EF1389CCF1E12F70ACE34844704706F9CEFF6093B3D91870EC4` |
| 87 | neutral | `7CD12AC8EF2BB44596BA221EE74E857E1399078C6EE5CB2B4DF9EC50448C0F02` |
| 215 | test | `ADC554A6C8433CC32C0F2123D1D872EB2204B731C74E157FD43DD5E566402A45` |
| 215 | alternate | `878F3C5D11CB24C13EB99B64CA5C042655551B4BA0DE2C00FCAA9D5507BEFB5C` |
| 215 | neutral | `09E4017CCCAAEF3F271A7B1E3DAC3CD02FB686FFF8672C5E0A0E91B700CDBE89` |

## Package and verification boundary

The player packager stages18 hash-pinned files, six per identity, retaining all previous12
paths/pins. The exact slot5 alias shares canonical paths. Icon3 becomes the third immutable
canonical choice with the existing neutral preset; neither slot alias becomes an extra choice.
No icon remains the default. The user's public artwork scratch is untouched.

Passed locally (all exit0):

- `pnpm --filter @goldbox/web e2e:cok-player-appearance`.
- `pnpm --filter @goldbox/web typecheck`.
- Scoped `git diff --check` for the owned tracked source/test paths.

The focused runner verifies18 exact package paths with validation-before-copy failures;
18 independent original RGBA oracle buffers; exact alias equality; rejected slots/suffixes/
head requests without art fetches; all source mask holes and nonempty source-visible cells;
the eight215 restoration cells under all three palettes; missing/hash/geometry failure
recovery and bitmap closure; five synthetic SAV records through import/reorder/app-save;
three creation choices plus the legacy no-icon member; draft rerenders, neutral previews,
copy independence, selection reset and stale preview/member loads; the new character-sheet
DOS/Restyle/Amiga-DOS-fallback/DOS cycle with unchanged persistent party; and created-party
combat binding with Icon3 at `p1`, legacy at `p2`, prior choices at `p3`/`p4`.

The combat switch identifies272 exact changed opaque art pixels across `p1`/`p3`/`p4`,
including a required Icon3/p1 match. Samples exclude source holes and the sprite border,
map physical canvas pixels back to exact4x artwork subpixels, and require source and Restyle
alpha255. This separately attributes the visible change to player art; changed terrain or
cursor/HUD pixels cannot satisfy it. Full canvas, player tiles and sampled sprite pixels
restore exactly on return to DOS. Combatants, phase, current/active actor, HP and persistent
party are unchanged. Earlier test-only whole-cell opacity and assumed-center sampling
controls were repaired to use actual opaque art pixels and the renderer's physical mapping;
production composition and mask rules were unchanged.

## Complete candidate and live release

Source implementation and this admission receipt were committed at `6990a0ea` and pushed to
`origin/greybox`. The complete 1,477-file candidate
`{external-workspace}/batch03_work/dist-app-cok-player3-candidate-20261026` was composed over the
complete #23 candidate. It retained every prior file and all 23 game JSON manifests byte-for-byte,
then added eight files (six appearance paths and two JS chunks); only `index.html` changed among
the retained files. The public-artifact policy checked 903 asset files. Candidate static smoke,
all ten intro routes, all-106 CPIC, wall #31/#32/#23, terrain, dialogue and player-appearance
acceptance passed.

The candidate was atomically published with the installed `deploy-static.ps1` to
`/var/www/html/greybox`, using a process-scoped remote-base override. Live SHA-256 checks matched
candidate `index.html`, both referenced entry assets and all 18 player PNGs. The focused live
player acceptance passed all three identities, five exact tuples, 18 oracle buffers, eight
restored body215 cells, creation/import/reorder/save/sheet/combat binding, 459 exact opaque
DOS/Restyle pixels across p1–p5, and exact DOS/state restoration. The focused live CoK graphics
suite passed all 106 CPIC identities and DOS→Amiga→Restyle→DOS with unchanged combat state.

The full browser suite and manual UI screenshot review were not performed. Amiga player artwork,
other source identities, and frame1 animation semantics remain unadmitted. The external artwork
scratch files were not included in the commit or candidate.
