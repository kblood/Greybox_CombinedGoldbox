# CoK DOS wall block 23 — source-pinned release receipt

This release adds DOS `8X8D1.DAX#23` to the already-live blocks 31 and 32. Runtime source pins
and the expanded acceptance gate are committed at `08019fbe`. The complete candidate is published
at `https://dionysus.dk/greybox/`. This is a block-scoped release, not full CoK art coverage.

## Source and generated art

The DOS archive SHA-256 is
`14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915`; decompressed DOS block 23
SHA-256 is `311afd2934d6eeaf443640bf496bcf8568790d7ae6233726771da871ddd51c25`. The DOS source
frames as exactly 70 8×8 EGA tiles. The corresponding Amiga `8X8D0.DAA` archive is pinned at
`1a4d646b205cc586baf05f058018ea8ab122a6060d99e24e7dbb7eacd043df97`, and its raw block 23 at
`ef02c72cbd958ac3966152d59e6fd7123c27ca44dd430d0adb92ae6fbabe48cf`. All 70 Amiga tile-index
arrays match their DOS block-23 counterparts exactly. The runtime mask is still derived from DOS
source palette index 13; the block contains 655 such source cells.

The 70 separate RGB restyles are 64×64. Their generated 10×7 sheet is pinned by SHA-256
`a3a85f1a6275aa2bb2509cfaf8121bb7753086aed6e6655c7a11a405f9bbefd1`. The existing visual review
record says that red wall motifs, trim and openings remained in their source cells. Each manifest
entry separately pins its DOS source indices, source PNG, generated output, color type and output
hash. The source PNGs and generated outputs remain in the external image workspace; the build
copies only these explicit manifest entries.

## Route and renderer acceptance

The local focused test passes all 210 archive/block/tile identities and 177 distinct packaged
output paths, checks each PNG pin, all expanded source-index-13 masks, wrong-source and wrong-bank
controls, native near-wall occlusion, and delayed 210-output stale-mount behavior.

On the real ECL1#34 route, the existing legal actions reach `(12,12,west)`. The slot-7 east door
starts closed and routes to block 32. Ordinary forward crosses it to `(13,12,east)`; turning to
`(13,12,west)` exposes the other real door edge, slot 15 / WALLDEF23 / block 23. The slot-15 view
shows block-23 source tiles `0, 1, 2, 3, 19, 25, 28, 29, 33, 36, 47, 62, 63, 64, 65`. The initial
start view now visibly owns block-23 near-wall pixels while #31/#32 remain occluded. Both doors'
graphics switches preserve observed gameplay state and restore exact DOS pixels. This adds no
open-door animation or geometry claim.

## Complete candidate and live publication

The candidate `dist-app-cok-wall23-candidate-20261026` contains 1,469 files. It retained every
file and all 23 game JSON manifests byte-for-byte from the 1,397-file #32 candidate, changing only
`index.html` among prior files. It adds 70 wall PNGs and two JS chunks. The public-artifact audit
checked 160 asset files, the production static smoke passed, and the web TypeScript check passed.

| File | SHA-256 |
| --- | --- |
| `index.html` | `3ee82feac68a3c25b5de35a82082d9abd75f24f1afcb4d6d17a11218b1df46c1` |
| `assets/index-C_VpJYmE.js` | `1c2061fd7f14fba4cdbd19183b5d03052c166bf2891c845fe4da637967154525` |
| `assets/index-CmCV0s3L.css` | `540ae20e73b93adc104808244bed00afd0e28aefd7cb057bc915ee50e4c400e9` |
| `assets/dungeon3d-CwSrhjbt.js` | `3a278145e88cb1301104448f3ddfb3df9ef630103f2345295a680cd035115883` |

The canonical atomic deploy script published to `/var/www/html/greybox` using a process-scoped
`/var/www/html` override; the shared deployment environment stayed unchanged. All four live
bundles and all 177 wall PNGs returned HTTP 200 and matched the candidate SHA-256 values. Candidate
and live gates both pass the wall/direction/door test, 106/106 CPIC and DOS→Amiga→Restyle→DOS
combat switches, terrain, PIC1#57 dialogue with #58 fallback, and all ten intro routes. The
focused route screenshot shows a small wall surface against the otherwise dark dungeon viewport;
this receipt does not infer whole-game visual density from that bounded view.

Block 23 is now published, completing the three currently source-pinned initial DOS dungeon banks
31, 32 and 23. The other 51 block-23 tile mappings are not all visible on the accepted route; other
maps/directions and every remaining CoK art family stay open. No Rust/native, retail-save or full
browser/corpus suite was run.
