# Decompile — ovr019/034/038: spell-FX animator, 24×24 combat tiles & 8×8 symbol bank (Krynn)

> **Status reviewed 2026-10-11:** the integer RNG negative mentioned below has been
> superseded for CoK and DoK by [cok-rng-native.md](cok-rng-native.md) and
> [dok-rng.md](dok-rng.md). Those results do not establish `Random__Real` or the particle
> animator's exact draw sequence. Combat-tile and sprite callers now exist; see
> [decompile-ovr011-battle-setup.md](decompile-ovr011-battle-setup.md) for the source-placement
> path and its limits, and `packages/engine/src/render/combatScreen.ts` for current composition.

> Loop iteration 17 (second-tier; upgrades the TODO ovr019 / ovr034 / ovr038 render rows to
> DONE). Subsystem: **the remaining Gen1 draw routines** — the procedural spell/effect particle
> animator, the 24×24 isometric combat-tile + combat-icon loader/blitter, and the 8×8 symbol-bank
> blit (`Put8x8Symbol`, already referenced by the seg037 frame chrome). Primary source: COAB
> `ovr019.cs`, `ovr034.cs`, `ovr038.cs` (study-only). Cross-checked against `packages/engine`
> (`render/combatScreen.ts`, `loaders/tiles8x8.ts`). These are presentation; the engine already
> covers the load/format side — this records the **draw geometry + addressing constants**.

## 1. 8×8 symbol bank — `Put8x8Symbol` / `Load8x8D` (ovr038) — the chrome/UI glyph blit

Five symbol "sets" hold the 8×8 UI glyphs (box-drawing chrome, panel symbols). `Load8x8D` loads
each set from `8x8d{game_area}.dax` (mask colour **13** = magenta-transparent, masked=1), into
`symbol_8x8_set[0..4]`. `Put8x8Symbol` routes a **global symbol id** to its set by range:

| symbol_id | set | (`symbol_set_fix` subtracted to get the in-block index) |
| --- | --- | --- |
| `0x01–0x2D` | 0 | base 1 |
| `0x2E–0x73` | 1 | |
| `0x74–0xB9` | 2 | |
| `0xBA–0xFF` | 3 | |
| `0x100–0x127` | 4 | |
| `0`, `0x128–0x7FFF` | — | **error** (invalid symbol number) |

After `symbol_id -= symbol_set_fix[set]` it either `OverlayUnbounded` blits (overlay mode) or
copies the glyph's `bpp` bytes into `cursor_bkup` and `draw_picture`s it. So the seg037 frame
chrome's `outer_frame_*[..] + 0x11e` indices land in **set 4** (0x11e ∈ 0x100–0x127) — the
box-border glyph bank. This confirms the seg037 §5 pin's symbol base.

## 2. 24×24 isometric combat tiles + combat icons — ovr034

- `Load24x24Set(cellCount, destCellOffset, block_id, file)` loads a DAX block of **24×24 combat
  terrain cells** into `dax24x24Set` at a cell offset (≤ 0x30 = 48 cells max). `DrawIsoTile`
  blits cell `tileIndex` via `OverlayUnbounded`; **`tileIndex > 0x7F`** switches to the alternate
  set `dword_1C8FC` with `index & 0x7F` (the high bit selects a second tile bank).
- **Combat icons** (the monster/PC battle sprites): `chead_cbody_comspr_icon` loads an icon set
  by filename convention —
  - `CHEAD*`/`CBODY*` (head/body composite): a trailing `'T'` adds **+0x40** to the block id
    (the "tall"/variant bank); loads `block_id` + `block_id+0x80` (two frames).
  - `COMSPR`/`ICON`: load as-is; `ICON` then **recolours** via palette maps `unk_16E50→unk_16E30`
    (identity except slot 13→0, i.e. remap magenta out).
  - otherwise: append `game_area` to the name and recolour `unk_16E40→unk_16E30` (identity).
- `draw_combat_icon(iconIndex, state, direction, tileY, tileX)` fetches the icon for
  `(state, direction)` and `draw_combat_picture`s it at **`(tileY*3+1, tileX*3+1)`** — i.e. each
  combat grid cell is **3 char-cells = 24px** wide (matching `combatScreen.ts` 24px cells), and
  the icon is inset +1 char. This is the byte-exact combat-sprite placement.

**Engine cross-check:** `combatScreen.ts` already uses 24px cells in the `(8,176)²` battle box; the
**`tileY*3+1` / `tileX*3+1` inset** and the **`>0x7F` second-tile-bank** + **`'T'`→+0x40** /
**±0x80 two-frame** icon addressing are the fidelity constants to honour when wiring real combat
icons. Format/decode is done (`tiles8x8.ts`, `dax.ts`); this is the placement/addressing pin.

## 3. Procedural spell-FX particle animator — ovr019 — decorative, engine-optional

`sub_520B8` is a **3-emitter particle burst** (spell/effect visual): for each of 3 streams it
seeds a particle at a random spherical offset — `radius·sin(θ)·sin(φ)` / `radius·cos(θ)·sin(φ)`
with `θ,φ = Random__Real()·2π`, radius `Random(10)+24` — then animates **0x28 (40) particles per
stream** (`dword_1ADF6[idx + stream*40]`) with per-frame random re-angling, plotting via
`SetPixel`. `byte_1ADFA = max(Random(20)+25)` sets the frame count. It is the engine's generic
"magic burst" animator (fireball/lightning/spell sparkle), **driven entirely by the RNG**.
`Random__Real` and this effect's draw sequence remain unproven; integer `Random` for
CoK/DoK is recovered in the later RNG notes.

This is **decorative**: it does not affect game state, and exact pixel fidelity is not required
for correct play. The engine renders spell effects its own way; matching ovr019 byte-for-byte
would only reproduce the precise spark pattern (and still needs the real-valued RNG/draw sequence, beyond the recovered integer RNG).
Recorded as **characterised, low priority** — no engine gap, no pin beyond "spell FX exist."

## 4. Krynn-binary anchor & Gen1↔Gen2

Draw code, no string anchors (methodology §3.2). Anchored structurally via the DAX block loads
(`8x8d{area}.dax`, the 24×24 combat-tile blocks — real inspectable TOC entries) and the combat
box already byte-matched in `combatScreen.ts`. The symbol-set ranges, `symbol_set_fix`,
`>0x7F`/`+0x40`/`±0x80` icon constants and the recolour maps are COAB-authoritative.

**Gen1↔Gen2:** all EGA-era (CoK/DoK). The 8×8 symbol bank and 24×24 iso tiles are EGA planar;
DQK (Gen2) draws its combat icons/UI from HLIB `TILE` VGA chunks (chunky, embedded palette), so
the *addressing concepts* (per-direction icon frames, two-frame ±offset) carry but the bank
layout and the magenta-13 / recolour mechanics are Gen1-specific. The particle FX animator is
generation-invariant math (only the plot surface differs EGA→VGA).
