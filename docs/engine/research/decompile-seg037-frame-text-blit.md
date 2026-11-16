# Decompile — seg037/040/041: EGA frame chrome, DAX picture blit & 8×8 mono text (Krynn Gen1)

> Loop iteration 15 (second-tier; upgrades the TODO seg037/seg040/seg041 render rows to DONE).
> Subsystem: **the Gen1 (CoK/DoK) EGA presentation layer** — the screen-border chrome, the DAX
> block→screen blitter (with transparency + recolour), the EGA-palette register map, and the
> monochrome 8×8 text font. Primary source: COAB `coab_extracted/engine/seg037.cs`,
> `seg040.cs`, `seg041.cs` (+ `seg042.load_decode_dax` for RLE, `ovr038.Put8x8Symbol` for the
> symbol blit) — study-only faithful decompile. Cross-checked against `packages/engine`
> (`loaders/cokFont.ts`, `loaders/tiles8x8.ts`, `render/combatScreen.ts`) — **largely already
> implemented; this spec corroborates and pins two fidelity details.**

## 1. Screen model — 40×25 char grid over 320×200 EGA

All three segs address the screen as a **40-column × 25-row grid of 8×8 cells** (320×200,
EGA 16-colour). Text calls gate on `XCol < 40 && YCol < 25`; the playfield/combat window is the
inner **`x[8,176) y[8,176)`** box (`draw_combat_picture` clip), i.e. the 168×168 / 7×7-of-24px
area the engine's `combatScreen.ts` (`BATTLE_BOX = {8,8,176,176}`) already mirrors verbatim.

## 2. EGA palette — fixed 16 registers, NO per-file palette (Gen1) — CONFIRMS dos-inventory

`seg040.SetPaletteColor(color, index)` → `Display.SetEgaPalette(index, color)`: it only remaps
the **16 hardware EGA registers**; there is **no palette in the DAX files** (matches
`docs/dos-inventory.md` "CoK/DoK = EGA 16-colour only"). The commented-out
`if (color >= 8) newColor += 8;` is the disabled EGA bright-bit remap — i.e. SSI's tables already
encode the final 0–15 index, so no intensity fold is applied. This is the Gen1↔Gen2 palette
fork: Gen2 DQK ships an 8-bit-RGB VGA palette *inside* each HLIB `TILE` chunk (not 6-bit DAC —
`docs/hlib-format.md` §2); Gen1 has none.

## 3. DAX picture blit — `draw_clipped_picture` (seg040) — TWO transparency conventions

A decoded `DaxBlock` is blitted cell-aligned (`rowY*8`, `colX*8`) with a per-pixel rule:

```
offset = index * bpp                       // pick sub-frame `index` within the block
for each pixel (clipped to [clipMinX,clipMaxX) × [clipMinY,clipMaxY)):
    c = block.data[offset++]
    if c == color_no_draw (=17) : skip      // TRANSPARENT
    elif c == color_re_color_from : plot color_re_color_to   // RECOLOUR remap
    else : plot c
```

- `draw_combat_picture` = `draw_clipped_picture(.., 8,176, 8,176)` (the battle box).
- `draw_picture` = full-screen `(0,320, 0,200)`.
- `color_no_draw` / `color_re_color_from` / `color_re_color_to` default to **17** (an
  out-of-EGA-range sentinel ⇒ "no recolour active"); `draw_clipped_recolor(from,to)` /
  `draw_clipped_nodraw(color)` arm them per draw.

**KEY DELTA vs engine.** The engine's tile path (`tiles8x8.ts`) keys transparency on **EGA
magenta = colour 13** (the wall-tile convention). COAB's full-picture blit instead keys on
**index 17** plus an optional **recolour pair** (`from→to`). These are *two different draw
paths*: 8×8 sparse wall tiles (magenta-13 key, engine-correct) vs whole DAX pictures
(index-17 key + recolour, the seg040 path). For byte-faithful picture/sprite compositing the
engine should honour the **17 = skip** sentinel and the **from→to recolour** on the
non-tile blit (used for combat monster sprites and full-frame art), not reuse the magenta key.

`ega_backup` (`ega_01`) is the matching **save-under**: it reads the screen region under a
sprite (`Display.GetPixel`) into the block's own `data[]` so the sprite can later be erased by
re-blitting the saved background — Gold Box's flicker-free sprite move (no XOR).

## 4. Monochrome 8×8 font — `Load8x8Tiles` / `display_char01` (seg041) — ENGINE ALREADY MATCHES

- Font source: **`8X8D1.DAX` block 201**, decoded then treated as a **flat array of 8-byte
  glyphs** (8 rows × 1 byte, **1bpp, MSB = leftmost**); 177 glyphs stored.
- Glyph addressing: **`index = ToUpper(ch) % 0x40`** (`seg041.cs:49`) — folds to 6 bits so
  `'@'`→0, `'A'`→1 … `'Z'`→26, `' '`→32, `'0'`→48. **This is the same 6-bit fold as the ovr008
  ECL string codec** (`decompile-ovr008-ecl-strings.md`): A→1..Z→0x1A — the font and the packed
  text share one character space.
- `DisplayMono8x8(col,row, 8 bytes, bg, fg)` paints set bits in `fg`, clear bits in `bg`.
- `displayString` walks chars L→R incrementing `XCol`; `displayStringSlow` (`sub_107DE`) adds a
  per-char `SysDelay(game_speed*3)` when `DelayBetweenCharacters` — the classic teletype crawl;
  `text_skip_space`/`press_any_key`/punctuation `Set{!,-.:;?}` are the word-wrap helpers.

`packages/engine/src/loaders/cokFont.ts` **already reimplements this exactly** (`COK_FONT_BLOCK
= 201`, `cokGlyphSlot = ToUpper&0xff %0x40`, 8-byte 1bpp glyphs, 177 count), citing
`seg041.Load8x8Tiles` as oracle — so this part is **DONE and verified**, not a gap.

## 5. Frame chrome — `DrawFrame_Outer` (seg037) + `Put8x8Symbol` (ovr038)

The decorative screen border is drawn from four index tables stepped across the 40×24 edge:

```
top    row 0      : Put8x8Symbol(outer_frame_top[col]    + 0x11e, 0,    col)   col=0..0x27
bottom row 0x17   : Put8x8Symbol(outer_frame_bottom[col] + 0x11e, 0x17, col)
left   col 0      : Put8x8Symbol(outer_frame_left[row]   + 0x11e, row,  0)     row=0..0x16
right  col 0x27   : Put8x8Symbol(outer_frame_right[row]  + 0x11e, row,  0x27)
```

The tables (e.g. `outer_frame_top = {0,6,1,1,…,8,…,4,1,1,1,6,1,2}`) are **offsets into the 8×8
symbol bank based at `0x11e` (286)** — different corner/edge/joint glyphs select the box-drawing
pieces. seg037 also holds the inner-frame variants (`draw8x8_02/03`, `DrawFrame_WildernessMap`)
and the `x8x8_07`/`unk_16E…` companion tables for the alternate panels. `ovr038.Put8x8Symbol`
is the cell-aligned symbol blit these call (the symbol-bank analogue of seg040's picture blit).

**Current engine status (2026-10-11):** `packages/engine/src/render/exploreScreen.ts`
and `combatScreen.ts` accept frame tiles and placement layouts and draw tile-based chrome.
The old procedural-only description is superseded. The tables are title-specific: the
CoAB layout requires fallback substitutions for missing CoK tiles, as the compositor's
source comment records. Copying CoAB's `+0x11e` base does not prove CoK/DoK cell-for-cell parity.

## 6. Krynn-binary anchor

These are EGA blit/draw routines: the data tables (`outer_frame_*`, the `0x11e` symbol base,
font block id 201, the `17` transparent sentinel) are the COAB-authoritative constants; the
routines themselves have no string literals (methodology §3.2 — same class as the geometry
overlays). They are anchored structurally by the **`8X8D1.DAX` block-201 load** (a real,
inspectable DAX TOC entry — engine `cokFont.ts` reads it) and the combat-box clip
`(8,176)×(8,176)` already byte-matched in `combatScreen.ts`. `seg042.load_decode_dax` is the
shared RLE decoder feeding all of this (the signed-byte RLE already verified in
`docs/dax-format.md` / `tools/dax_decode.py`).

## 7. Engine cross-check summary

| piece | engine status |
| --- | --- |
| 40×25 grid, 320×200, combat box (8,176)² | **DONE** (`combatScreen.ts` BATTLE_BOX) |
| 8×8 mono font (block 201, ToUpper%0x40, 1bpp) | **DONE** (`cokFont.ts`, cites seg041) |
| EGA 16-reg palette, no per-file palette (Gen1) | **DONE** (`dos-inventory.md`) |
| DAX picture blit transparent **index 17** + recolour `from→to` | **PIN** — engine tile path keys magenta-13; the picture/sprite path should honour 17 + recolour |
| `ega_backup` save-under for flicker-free sprites | **PIN** — not separately modelled |
| frame chrome from symbol tiles | **IMPLEMENTED, title limits remain** — tile/layout inputs in `exploreScreen.ts` and `combatScreen.ts`; CoAB tables are not universal CoK/DoK constants |

The EGA presentation layer is implemented. Picture transparency/recolour, sprite erase and
title-local border layouts remain fidelity checks; this note does not prove all three match
the original CoK/DoK output.

## 8. Gen1 ↔ Gen2

This whole layer is **Gen1-specific (EGA)**. Gen2 DQK is VGA 256-colour with the palette
*inside* each HLIB `TILE` chunk (8-bit RGB, not 6-bit DAC) — so §2's "no per-file palette" and the 16-register
remap do **not** carry to DQK; the blit/transparency/recolour *concepts* do, but over a 256-entry
VGA palette and chunky (not EGA-planar) pixels. The 8×8 mono font and the symbol-bank chrome are
likewise reauthored for DQK's VGA UI. So this spec pins the **CoK/DoK** rebuild surface; the DQK
target keeps its own VGA presentation path.
