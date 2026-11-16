# @goldbox/web — Greybox Browser App

A browser Gold Box engine and asset viewer. It decodes the original game files,
renders native 320x200 screens, and exposes playable preview routes for the
current engine work.

Start the web app, then open the combat route on the Vite dev server URL it
prints (normally port 5173 unless that port is occupied):

```text
http://127.0.0.1:5173/?combat=demo
```

The combat demo uses the real positioned tactical engine, CoK combat screen
renderer, and CoK `DUNGCOM.DAX` 24x24 combat-terrain tiles, with click controls
for movement, attack, casting, turning, guard, wait, and auto-resolution.
`?combat=1` still uses the current saved/created party when one exists;
`?combat=demo` forces the stable built-in demo party.

Focused verification:

```powershell
pnpm e2e:combat
```

That starts Vite headlessly, opens `?combat=demo` in Edge, checks that the
combat canvas is nonblank, backed by live tactical state, using real combat
terrain tiles, and reachable through the sidebar preview entry. It writes
`apps/web/combat-demo-check.png` for a quick visual inspection.

Static production-build verification:

```powershell
pnpm build:app
pnpm e2e:static
```

That serves `apps/web/dist-app` directly, without Vite `/@fs`, and verifies the
deployable bundle's combat route plus NWN catalog asset, manifest dashboard,
and `?nwn=1` preview. This is the regression check for absolute local NWN
archives copied under `dist-app/assets/external/`.

Neverwinter Nights (DOS/AOL) is an explicitly bounded **offline client
reconstruction**, not a claim to recreate AOL's service. The web surfaces load
the surviving DOS/AOL DAX archives, render decoded graphics, catalogue every
shipped GEO map with its real dimensions, and provide verified first-person
exploration/combat routes where client data proves them. The shared Dungeon area
picker opens all remaining maps as either a safe first-person route or a
read-only raw-GEO atlas; it never invents wall resources for an event-only map.

AOL login, server state, multiplayer, character persistence, and online-world
progression are unavailable and are clearly marked as such in the NWN explorer.

Use it when the local archive has been extracted to:

```text
D:\Games\Neverwinter Nights DOS\neverwinter-nights\neverwint
```

Open the focused extracted-asset preview at:

```text
http://127.0.0.1:5181/?nwn=1
```

Open the manifest dashboard at:

```text
http://127.0.0.1:5181/?game=neverwinter-nights-dos
```

The sidebar also includes representative NWN single-file entries for `TITLE`,
`PIC`, `CPIC`, `SPRIT`, `8X8D`, `BACK`, and `CHEAD`; those are convenience
entries, while `?nwn=1` is the direct extracted-asset preview and
`?game=neverwinter-nights-dos` is the manifest-level dashboard.

## Format Library Background

The browser engine is built bottom-up from the **format library**. The core
decode code is pure functions over `Uint8Array`/`DataView` that turn original
game asset containers into the engine-neutral model and render indexed images to
RGBA. It runs unchanged in Node (tests, DOS-goal tooling) and the browser.

The loaders are direct ports of the verified Python decoders in
[`../tools/`](../../../tools), and the design contracts live in
[`../docs/web-engine/`](../../docs/web-engine). Anything not proven there is labelled
**UNSOLVED** here too.

## Status

| Phase | Item | State |
| ----- | ---- | ----- |
| 1 | **DAX** loader (DOS CoK/DoK, EGA-16, 4bpp chunky) | **done** — standard frames + 8×8 tile strips; complex/transparent frames detected & skipped (UNSOLVED, as in Python) |
| 1 | Engine-neutral model (Palette, IndexedImage, FrameSet, TileSet, SpriteSet) | done (graphics types; non-graphics stubbed) |
| 1 | Shared `ByteReader` (LE+BE) + `signedByteRLE` | done |
| 1 | EGA-16 palette + `indexedToRGBA` | done |
| 1 | DAX golden-file parity test vs Python | done — exact byte-for-byte |
| 2 | DAA (Amiga, big-endian, 5-plane planar) + IFF/ILBM | next |
| 3 | HLIB (DQK VGA, Chain-4, drawing methods) | next |
| — | Browser asset viewer (canvas/WebGL) | later |

## Layout

```
web-engine/
  src/
    model/index.ts        engine-neutral asset model (layer 3 contract)
    util/
      ByteReader.ts        cursor over DataView, explicit LE/BE reads
      rle.ts               signedByteRLE — shared SSI signed-byte RLE
    render/
      palette.ts           EGA16 constant + makeEgaPalette()
      rgba.ts              indexedToRGBA(image, palette)
    loaders/
      dax.ts               decodeDax(bytes) -> DaxArchive (FrameSet)
    index.ts               public barrel
  test/
    make-fixtures.py       golden fixture generator (imports tools/dax_decode.py)
    dax.test.ts            DAX parity test (TS decode == Python decode)
    fixtures/dax/*.json    generated, GIT-IGNORED (derive from game assets)
  package.json  tsconfig.json  vite.config.ts  .gitignore
```

## Install / build / test

```bash
cd web-engine
npm install

# 1. generate golden fixtures from the verified Python decoder (needs the game
#    files under ../"Champions of Krynn"/). Fixtures are git-ignored.
npm run fixtures          # = python test/make-fixtures.py

# 2. typecheck + build the library
npm run build             # tsc --noEmit && vite build

# 3. run the parity tests
npm test                  # vitest run
```

If the game files (or generated fixtures) are absent, the parity tests **skip**
with a clear message, so a fresh clone still runs green.

## Regenerating fixtures

The fixtures derive from copyrighted game assets, so only the generator
(`test/make-fixtures.py`) is committed. It imports `tools/dax_decode.py`
unchanged (the verified oracle) and dumps a few representative blocks
(`BIGPIC1` b114, `CHEAD` b0/b64, `TITLE` b1/b3) as native-resolution
`{file, blockId, width, height, palette, indices}` JSON. Re-run `npm run
fixtures` after changing the decoder or the target list.

## The golden-file contract

A loader is correct when the `IndexedImage` it produces — and that image rendered
through its palette — is **byte-identical** to the Python decoder's output for
every solved (file, block). The neutral model stores indices + palette precisely
so the comparison is exact, not approximate. Unsolved variants (DAX complex
frames) are excluded from the golden set by design and emit no image.

## Notes for the next phase (DAA / HLIB)

- `ByteReader` already supports big-endian reads (`u16(false)`, `u32(false)`) for
  the DAA 68000 container.
- `signedByteRLE` is shared and byte-order-independent — reuse it for DAA.
- The neutral `Palette` carries `firstColor`/`count` and `cycles` for HLIB's
  per-leaf ranges and color cycling; `IndexedImage.transparentIndex` (255
  convention) is ready for HLIB methods 17/21/23 and DAA sprite index-0.
- Auto-sniff dispatch order (loaders.md): HLIB → IFF → DAA → DAX. `sniffDax` is
  the DAX leg.
