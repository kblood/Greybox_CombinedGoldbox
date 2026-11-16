# CoK second DOS player appearance and pointer-slot control

This is an unpublished Browser/Electron implementation slice. It extends the source-mapped
player-icon loader from one explicit tuple to three explicit tuples representing two images.
It does not close the complete CoK graphics objective. No artwork was generated, no retail
character/save file was read, and no source game data or external artwork was modified.

## Admission and image identity

The existing [source contract](cok-player-icon-source-contract-2026-10-26.md) identifies character
bytes `+0x135..+0x138` as head request, body request, frame-table slot and suffix. Descriptor 32
adds `0x40` to each requested block for suffix `T` (code 2), loads its `+0x80` variant and places
the results in the requested table slot. The slot addresses storage; the request chooses art.
This change explicitly admits the following tuples, rather than admitting arbitrary slots:

| Tuple (hexadecimal) | Head blocks | Body blocks | Runtime appearance id |
| --- | --- | --- | --- |
| `05 18 00 02` | 69 / 197 | 88 / 216 | `cok-player-05-18-00-02` (existing) |
| `05 18 02 02` | 69 / 197 | 88 / 216 | Same existing id and images |
| `05 01 01 02` | 69 / 197 | 65 / 193 | `cok-player-05-01-01-02` |

Fresh read-only DAX/PNG verification pinned these source containers:

- `CBODY.DAX`: `0C93206B020E30EECC1F761A9408B5BEFC20113FDE18A8B401AE2DDAD2C103BD`.
- `CHEAD.DAX`: `8E61D8CF23B7094353425224F02BE4423B880C5E8A7E168D478EC851BFAEA568`.

`tools/dax_decode.py` decoded CBODY 65/193/88/216 at 24×24 and CHEAD 69/197 at 24×8.
Each external original PNG exactly matches the decoded RGB image enlarged by nearest-neighbor
4× sampling. CHEAD 69 and 197 have identical decoded pixels and identical original PNG hashes,
so both variants deliberately share the proven head. The two body variants remain distinct;
this receipt does not assign them idle/attack semantics.

The manifest pins every original and Restyle PNG hash. Container hashes record offline source
provenance; the player loader checks the PNG hash and geometry at runtime. It does not fetch or
verify a retail DAX file on each character-sheet render.

The coordinator's admission audit distinguishes black source background from nonblack source
content. Among 555 non-mask cells, CBODY65/193 have respectively 178/166 nonblack source cells;
8/6 of those cells have no Restyle alpha (4.5% / 3.6%). Total empty-alpha counts 286/284 include
predominantly black background and must not be described as 51% foreground loss. The existing
per-cell source-color restoration remains in place. Generated file counts alone are not runtime
or visual acceptance evidence.

## Implementation and package contract

`cokPlayerAppearanceManifest.json` now stores an explicit appearance list and the source-proven
slot alias. The loader resolves that list before fetching; unsupported tuple/palette values
return `null` without requesting art. Existing character-sheet and combat consumers already
call this loader, so no new consumer-specific identity mapping is introduced. Bitmap handles
now also close when a later image in a head/body pair fails validation.

The packager validates all manifest inputs before copying any. It writes exactly twelve paths:
six beneath each appearance id in `restyle/cok/player/`, including the repeated head files.
There are ten unique source/Restyle binary payloads. Existing appearance paths remain stable;
the slot-2 control reuses those paths. The external holdings and the user's existing untracked
`apps/web/public/restyle/cok/` files were left unchanged. The isolated test package was created
under an owned Windows temporary directory and removed after the check.

## Focused verification

Passed:

- `pnpm --filter @goldbox/web typecheck`.
- `pnpm --filter @goldbox/web e2e:cok-player-appearance` (headless Edge / Vite).
- `git diff --check` for the owned source changes.

The new focused check verifies twelve exact packaged files and validation-before-copy failures;
two distinct identities with the exact slot alias; both frame geometries; eight original RGBA
buffers against independent Python/Pillow goldens; mask preservation and nonempty Restyle;
unmapped tuple/palette rejection without fetches; missing image, wrong hash and wrong geometry
failures; successful recovery and closed bitmap handles; actual synthetic SAV import of three
records; party reorder and app-save restoration; the character-sheet DOS→Restyle→Amiga→DOS
cycle with explicit DOS fallback for Amiga player art; and rejection of a delayed former-member
image after switching to another party member. The natural CoK combat route also binds the
imported three-member roster to `p1`/`p2`/`p3`, loads the new tuple's two player-art frames, and
reports no appearance fallback errors.

The raw original RGBA comparisons are byte-exact. Sheet Restyle comparison uses a reference
canvas with explicit software readback: default GPU and CPU canvas paths differ by one color
unit on some partially transparent pixels. Both raw buffers and rendered buffers are retained
as distinct test evidence; source goldens were not recaptured from the TypeScript output.

This test serves synthetic SAV bytes and supports `GB_PLAYER_CANDIDATE_URL` to repeat the natural
combat check against a full static package. That candidate run passed and returned HTTP 200 for the
new `CBODY_065` Restyle path; it also loaded all three appearances without fallback errors. The
natural-combat check verifies tuple-to-combatant loading and requested assets. It now also switches
the complete combat canvas DOS → Restyle → DOS and asserts changed pixels in Restyle plus exact DOS
pixel restoration while checking combatant state remains invariant. This whole-canvas assertion is
not an isolated player-sprite pixel attribution. The focused test passes on both Vite and the full
static candidate. No live-site check or deployment was performed.

## Independent original-pixel oracle

The eight pinned hashes in `apps/web/test/cok-player-appearance.mjs` were first calculated from
the admitted PNGs, then independently reproduced from DAX-decoded source indices with the
following Python procedure. It does not import the TypeScript compositor or read retail SAVs.
Run from the repository root with Python and Pillow; the container pins come from the manifest.

```python
from pathlib import Path
import hashlib, json, sys
from PIL import Image
sys.path.insert(0, 'tools')
from dax_decode import (parse_container, decompress_block, parse_standard_frame,
                        frame_to_rgb, EGA_PALETTE, FRAME_HEADER)
m = json.loads(Path('apps/web/src/ui/cokPlayerAppearanceManifest.json').read_text())
frames = {}
for archive, ids in [('CBODY.DAX', [65, 193, 88, 216]), ('CHEAD.DAX', [69, 197])]:
    data = (Path('Champions of Krynn') / archive).read_bytes()
    assert hashlib.sha256(data).hexdigest().upper() == m['sourceContainers'][archive]
    base, blocks = parse_container(data)
    for block_id in ids:
        block = next(b for b in blocks if b.block_id == block_id)
        raw = decompress_block(data, base, block)
        width, height, _, _ = parse_standard_frame(raw)
        rgb = bytes(frame_to_rgb(raw, width, height, FRAME_HEADER))
        family = archive.split('.')[0]
        png = Image.open(Path('C:/GoldBoxImg/cok_restyle_work/dos') /
                         f'{family}/{family}_{block_id:03}.png').convert('RGB')
        decoded = Image.frombytes('RGB', (width, height), rgb)
        assert png.tobytes() == decoded.resize((width*4, height*4), Image.Resampling.NEAREST).tobytes()
        frames[(family, block_id)] = (width, height, rgb)
assert frames[('CHEAD', 69)] == frames[('CHEAD', 197)]
for body_id in [65, 193, 88, 216]:
    body = frames[('CBODY', body_id)][2]
    head = frames[('CHEAD', 69)][2]
    body_indices = [EGA_PALETTE.index(tuple(body[k:k+3])) for k in range(0, len(body), 3)]
    head_indices = [EGA_PALETTE.index(tuple(head[k:k+3])) for k in range(0, len(head), 3)]
    for colors in ([0x10, 0x21, 0x32, 0x43, 0x64, 0x75], [0xE2, 0xD3, 0xC4, 0xB5, 0xA6, 0x97]):
        remap = list(range(16))
        for i, byte in zip([1, 2, 3, 4, 6, 7], colors):
            remap[i], remap[i+8] = byte & 15, byte >> 4
        rgba = []
        for k, b in enumerate(body_indices):
            h = head_indices[k] if k < len(head_indices) else None
            masked = (b == 1 and h == 1) if h is not None else b == 1
            rgba.extend((*EGA_PALETTE[remap[b | h if h is not None else b]], 0 if masked else 255))
        pixels = Image.frombytes('RGBA', (24, 24), bytes(rgba)).resize((96, 96), Image.Resampling.NEAREST).tobytes()
        print(body_id, bytes(colors).hex(), hashlib.sha256(pixels).hexdigest().upper())
```

All eight DAX-derived hashes matched the test pins, including the two retained first-appearance
goldens from the earlier source-contract receipt. Other suffixes, head heights, tuples, Amiga
player mapping and a character-creation appearance chooser remain outside this admission.
