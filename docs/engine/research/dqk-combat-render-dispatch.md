# DQK Combat Render Dispatch

This note records the dispatch path into the DQK Gen2 combat background renderer at
`DQK.EXE:0x02ba4c`.

## Overlay Address Note

The renderer is reached as `LCALL 2740:172C`. For overlay 0, the measured first prologue/code start is
`0x022401`, but segmented overlay address math uses paragraph base `0x022400`.

Therefore `2740:172C` resolves to `0x02ba4c`, not `0x02ba4d`. Starting at `0x02ba4d` skips the
routine's `push bp` prologue and breaks the `pop bp; retf` epilogue.

`tools/disasm_dqk.py` now keeps these separate as `overlay_code_start()` and
`overlay_segment_base_file_offset()`.

## Direct Renderer Calls

Direct calls to `2740:172C`:

```text
0x02a498
0x02a8db
0x02a90b
0x02ab37
```

The renderer arguments are:

```text
[bp+06] viewport col
[bp+08] viewport row
[bp+0a] map x
[bp+0c] map y
```

The renderer computes screen coordinates as `0x1f44 + viewport_axis * 12`, reads the live background id
from `[0xbedb]+9 + map_y*0x32 + map_x`, clamps id `0` or `>0x4c` to `0x15`, indexes
`BackGroundTiles` at DGROUP `0x6197`, and draws through `0x09a4:0515`.

Special ids `0x1b`, `0x1c`, `0x1d`, `0x1e`, `0x1f`, and `0x46` branch through `0x02b69a`; that path may
draw remapped terrain through `[0xc5d4]/[0xc5d6]` and overlay COMSPR/live art through `[0xb17d]/[0xb17f]`.

## 7x7 Viewport Path

The ordinary full combat background repaint is:

```text
1D99:0EC3 resident stub
  -> LJMP 2740:0846
  -> file 0x02ab66 draw entry
  -> near call 0x02aa06 full viewport redraw helper
  -> nested row/col loop 0..6
  -> LCALL 2740:172C once for each visible cell
  -> file 0x02ba4c renderer
  -> LCALL 0x09a4:0515
```

Raw callers of `CALL FAR 1D99:0EC3`:

```text
0x00802d, 0x050bbc, 0x0562e5, 0x056a54, 0x056cb4, 0x057c15, 0x058ae4
```

Same-overlay direct callers of `LCALL 2740:0846` currently total 27 sites, including combat refresh
sites such as `0x02343c`.

At `0x02aa06`, the nested repaint loop uses `[0xbedb]+2` and `[0xbedb]+4` as map top-left/start values,
then iterates viewport columns and rows `0..6`, pushing viewport col/row and map x/y into `2740:172C`.

## Map Source

The renderer consumes the same 50x25 background-id map populated by the setup routines:

- `0x02c397` fills `[0xbedb]+9` for `0x04e2 == 50*25` bytes with dungeon background id `0x16`.
- `0x02cb2b` fills the same map with wilderness background id `0x45`.
- `0x02bcf0` writes individual cells as `[0xbedb]+9 + y*0x32 + x = caller_id + 1`.

## Verification

```powershell
python tools/disasm_dqk.py --dqk-combat-render-path
python tools/disasm_dqk.py --disasm 0x2aa06 --len 0x160
python tools/disasm_dqk.py --disasm 0x2ab66 --len 0x80
python tools/disasm_dqk.py --disasm 0x2ba4c --len 0x1c0
pnpm --filter @goldbox/engine exec vitest run test/dqkCombatCluster.test.ts --reporter=verbose
```
