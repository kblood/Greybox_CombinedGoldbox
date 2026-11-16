# CoK fourth DOS player icon: exact suffix-S admission

Bounded Browser/Electron implementation, 2026-10-26, starting at `3455ef09`. This adds the
single exact canonical tuple `03 0B 03 01`, identity `cok-player-03-0b-03-01`, and Icon 4 in
character creation. There is no admitted slot alias for this identity. The existing three
identities and their two proven aliases remain unchanged. No retail save was read. No source/output artwork was changed or regenerated through
ImageGen, and no prompt provenance was invented. Deterministic diagnostic composition
previews were written only to an owned temporary audit directory for visual inspection.

## Source identity and independent verification

The retained [source contract](cok-player-icon-source-contract-2026-10-26.md) establishes
source-index OR composition, independent key-1 masks and post-composition palette mapping.
CHEAD request3 selects blocks3/131, native 24x10; CBODY request11 selects blocks11/139 in
slot3, native 24x24. Suffix1 (`S`) leaves the requested block unchanged; the second variant
adds128. Both head blocks independently decode to identical pixels. Both body variants are
preserved as distinct source identities; no idle/attack, facing or animation semantics are
inferred. Existing runtime consumers continue to draw frame 0/body11 only.

Fresh read-only Python/Pillow verification used `tools/dax_decode.py` on the authorized
archives and confirmed the existing manifest container pins:

- CBODY.DAX: `0C93206B020E30EECC1F761A9408B5BEFC20113FDE18A8B401AE2DDAD2C103BD`.
- CHEAD.DAX: `8E61D8CF23B7094353425224F02BE4423B880C5E8A7E168D478EC851BFAEA568`.

Every source RGB PNG equals its corresponding DAX RGB indices at exact 4x nearest-neighbor
sampling: CHEAD3 and131 are96x40; CBODY11 and139 are96x96. All six source/Restyle PNG hashes
were independently recalculated and matched Astra's pins before implementation edits:

| External relative file | SHA-256 |
| --- | --- |
| `dos/CHEAD/CHEAD_003.png` | `AB031B8015ABBCFEC43773F03A47E83843CFA4DCCAC75BD623EF1F1DF3433085` |
| `done/CHEAD_003_restyle.png` | `7C0F812B146A2E11C755857D20E432702FDC2DA91406313F2C1BEAFC46593F86` |
| `dos/CBODY/CBODY_011.png` | `47593D8A7798860CFE07462438850E7874424EA568DF80C4BD0748B451850EBC` |
| `done/CBODY_011_restyle.png` | `2625D2D97390C01E5C3BB80B3C11072BB48AB2B5127B68F2F7BEC5F07B14876F` |
| `dos/CBODY/CBODY_139.png` | `B475E75316699A2742F884329D2B609C6FD1337979F1759BA5C33D693B1A454C` |
| `done/CBODY_139_restyle.png` | `39C5FF4200954731C85A8B00BA5F58E0C7CE88A1FC493C2B2BA06FE46F9002B4` |

Original PNGs are RGB; Restyles are RGBA, all 8bit. Runtime validates the PNG hashes and
geometry; full archive pins establish offline provenance, rather than a per-render DAX fetch.

## Bounded 10-row composition

`composeOriginal()` now consumes the manifest's head dimensions. The only accepted source
head layouts are width24 and height8 or10. Body layout remains24x24. Input image dimensions
must match those explicit layouts and the established4x scale. No request byte, generated
size or arbitrary height determines placement.

For all admitted head rows, source pixels OR together while source key-1 masks combine
independently; below those rows, the body's own key-1 mask applies. Palette mapping follows
composition. Neither black RGB nor the palette-remapped color determines transparency.
The existing Restyle source mask and per-cell source-color restoration are unchanged.

The independent DAX oracle calculated original composed RGBA for both frames and three
palettes, with exact 4x expansion. The full buffers and the separate rows8-9 buffers are pinned
in the focused test. A deliberately truncated8-row oracle differs in12 native cells per body,
all within those two rows; therefore the added row pins distinguish the required10-row head.

| Body | Palette | Full original RGBA SHA-256 |
| --- | --- | --- |
| 11 | `[10,21,32,43,64,75]` | `B453BF0509C4EFF2F3CE9D773D0039DCB6F0ACB2299A1BEE076C9362F75F1BC3` |
| 11 | `[E2,D3,C4,B5,A6,97]` | `7BDC95B14607619B2775C394C61F86B1229DF439E12FD305FA910778AD58174A` |
| 11 | neutral `[91,A2,B3,C4,E6,F7]` | `5DFDAF1807C10930462F12CB203E0D7AA6156D4772E8A3D91CBDD98C0C718BAD` |
| 139 | test | `17D292D8F9316964FD9D34015A71F74D2D11B67F31EB4AA835C9B6C2633876AB` |
| 139 | alternate | `F50332BEC5B82A4BA784ADDF31F98ED54AE44E7A289F5054838B6BA4BA870A45` |
| 139 | neutral | `607681A0771AA2297014FC5C7D8CD0EFFEB7265DB21AAEBA7860B2B0D0C33771` |

| Body | Palette | Rows8-9 RGBA SHA-256 |
| --- | --- | --- |
| 11 | test | `ABD6D29CBADC83AA802899731B62E4F0C4089DB1F89535B5C74E5ACC5D572185` |
| 11 | alternate | `FB674FC03BE80A17CD723CD898D41C00BDA91B6A20D116DBBE16B8E1BC4F1792` |
| 11 | neutral | `32CDC8E3B4F30D5D25CF1EB1B0299915649DBDEB5FF47E241B4E06F3A9D65A2B` |
| 139 | test | `B4EB44F9DEFB19A678E5A2976441C97ACC20745E08C1CF163C7F9F61133E9D90` |
| 139 | alternate | `2768EC913F4A06CE83A6E6F0D2AFAE05D9E6048434AFFA8E53461C9C9CB74A24` |
| 139 | neutral | `3108ACC858926688CF166D0ABF18C8B5B4D496E135DC5DE8BEDFFB45C7E480C0` |

## Body139 content restoration review

The independent body-only audit found0/105 fully alpha-missing nonblack/non-key cells for11
and8/105 for139: native coordinates `(7,22)`, `(9..12,22)` and `(19..21,22)`. They lie below
the10-row head. The focused test verifies the raw external139 alpha is zero there and all16
subpixels of each cell are restored exactly to the correctly palette-mapped original RGBA,
under all three palettes. The earlier eight215-cell restoration controls remain intact.

Composed11 and139 were inspected against source and checkerboards. Frame0/body11 is
coherent. For139, authoritative source holes clip generated torso/limb detail outside the
original mask; the source original itself is sparse there. Opaque source-black cells remain
opaque. The eight restored content cells recover the source boot/foot baseline. No mask was
weakened to retain generated detail. This is source-composition/restoration evidence, not an
animation or second-frame runtime/visual release claim. Only frame 0 is exposed. No generation
was required for that bounded use; any future replacement needs recovered complete prompts.

## Focused gates and handoff boundary

Passed, exit0:

- Independent DAX/PNG/Pillow audit described above.
- `pnpm --filter @goldbox/web e2e:cok-player-appearance`.
- `pnpm --filter @goldbox/web typecheck`.
- Scoped `git diff --check` for the four modified source/test paths.

The player package now contains24 pinned paths, retaining all previous18 paths/pins. The
focused runner verifies six explicit tuples/four identities, all24 original oracle buffers,
new rows8-9 pins, old alias equality, rejected new slot aliases/suffix/head/body/palette values
without fetching, source holes and opaque black, source-visible per-cell alpha, explicit palette/mask negatives (a remapped index1 stays
visible, original key1 remapped to black stays transparent, original black stays opaque), both missing
content-cell fixtures, missing/hash/geometry failure recovery, and closed bitmap handles.

Six synthetic records survive import/reorder/app-save. Four immutable canonical choices plus
No icon retain exact tuples through preview/form rerenders, Add/reset, party save/reorder and
character sheets. New sheet DOS/Restyle/Amiga-DOS-fallback/DOS pixels match expected frame 0
and preserve persistent party data. Delayed new-icon sheet/preview loads cannot overwrite a
subsequently selected member/choice. No-icon behavior remains intact.

Created-party combat binds Icon 4 to`p1`, legacy to`p2`, and prior icons to`p3`/`p4`/`p5`.
Both new source variants are requested, while actual rendering remains frame 0. The DOS /
Restyle / DOS control identifies384 exact changed opaque artwork pixels across the mapped
players, including required Icon 4/p1 evidence. It excludes source holes, sprite borders,
terrain and HUD. Full canvas, player tiles and sampled sprite pixels restore exactly;
combatants, phase, current/active actor, HP and persistent party remain unchanged.

## Complete candidate acceptance

The complete candidate
`{external-workspace}/batch03_work/dist-app-cok-player4-candidate-20261026` contains1,485 files. It
retains all1,477 files from the third-player release, adds the six pinned image paths and two JS
chunks, removes none, and changes only `index.html` among retained files. All23 game manifests
are byte-identical. The public-artifact policy checks905 assets; candidate static smoke and all10
intro routes pass.

Candidate browser gates pass for all four player identities (24 package files, six tuples, 24
source RGBA buffers, rows8-9 discriminator, both restoration fixtures, identity/creation/save/
reorder/sheet/combat and exact DOS/state restoration), all106 CPIC identities and DOS→Amiga→
Restyle→DOS switching, wall #31/#32/#23 routes, terrain, and PIC1#57 dialogue. The candidate
player branch verifies the fourth icon through p1 and p3/p4/p5/p6 with566 exact opaque DOS/Restyle
pixel matches and exact restoration. Luna independently reran that candidate branch and visually
inspected both composed #139 review images. Browser UI was not available; this is pixel-image
review plus headless runtime acceptance.

## Atomic publication and live acceptance

The implementation and admission record were committed as `3147c19f` and pushed to
`origin/greybox`. The complete candidate was atomically published to
`https://dionysus.dk/greybox/` with the canonical `deploy-static.ps1`, using a process-scoped
`/var/www/html` remote-base override. Live SHA-256 checks match candidate `index.html`, both
referenced entry assets, and all24 player PNGs.

The live player runner passes four identities/six exact tuples, 24 oracle buffers including the
ten-row-head discriminator, all #139/#215 source-cell restorations under three palettes, and
creation/import/save/reorder/sheet/combat binding. It verifies566 exact opaque DOS/Restyle artwork
pixels across p1-p6 and exact DOS pixel/state restoration. Live CoK graphics passes all106 CPIC
identities and DOS→Amiga→Restyle→DOS without combat-state changes. Live wall #31/#32/#23, terrain,
and PIC1#57 dialogue route regressions also pass. The live deploy contains four public player
identities; no frame1 presentation or Amiga player mapping is claimed.

The full browser suite was not run; selected external-URL wall/terrain runs skip only their
development-module/mutation controls. Browser UI was unavailable to the independent reviewer,
who reviewed the composed #139 images and ran the candidate E2E. Other player identities, Amiga
equivalence, and full CoK graphics coverage remain open. User scratch was not committed or
deployed; pinned original PNGs were included only at the exact package paths required by runtime.
External source folders and prompts were not modified.
