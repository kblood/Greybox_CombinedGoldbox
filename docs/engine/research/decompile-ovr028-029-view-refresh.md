# Decompile — ovr028/029: map-cursor save-under sprite & RedrawView dispatch (Krynn)

> Loop iteration 16 (second-tier; upgrades the TODO ovr028/ovr029 render rows to DONE).
> Subsystem: **the view-refresh layer** — the overland map-cursor (the textbook flicker-free
> save-under sprite) and `RedrawView`, the master "repaint the main viewport" dispatcher that
> chooses dungeon 3-D vs big-picture and picks the per-area sky colour. Primary source: COAB
> `coab_extracted/engine/ovr028.cs` (`MapCursor`, `sub_6E005/02E/05D`) + `ovr029.cs`
> (`RedrawView = sub_6F0BA`) — study-only. Cross-checked against `packages/engine` (`world/
> wallview.ts`, `world/dungeonWalls.ts`) — flags **the original per-area-sky gap and save-under pin**; current implementation limits are in §4.

## 1. Map-cursor = the canonical save-under sprite — `MapCursor` (ovr028)

Concrete user of the `ega_backup` save-under pinned in `decompile-seg037-frame-text-blit.md` §3:

```
SetPosition(city) : loc_X = city_map_x[city];  loc_Y = city_map_y[city]   // per-city cell
Draw()            : ega_backup(cursor_bkup, loc_Y, loc_X)                  // save what's under
                    draw_picture(cursor,     loc_Y, loc_X, 0)              // stamp the cursor
Restore()         : draw_picture(cursor_bkup, loc_Y, loc_X, 0)            // re-blit saved bg
```

So the overland "you are here" marker moves **without XOR/flicker**: save the background under
the cursor into `cursor_bkup`, draw the cursor, and on move erase by blitting the saved block
back. `city_map_x/y` are **33 per-city cursor cells** (e.g. CoK city 0 = (0x04,0x0F)) on the
40×24 overland grid — the wilderness-map node coordinates. This is the exact save-under pattern
the engine's sprite/picture path should adopt (seg037 §3 pin); ovr028 is its reference impl.

## 2. View-refresh dispatch + per-area sky colour — `RedrawView` (ovr029)

`RedrawView` is the single "repaint the main view window" entry. Its logic:

```
if lastDaxBlockId == 0x50 : can_draw_bigpic = false      // the 0x50 block suppresses bigpic
if !party_killed:
    if area.inDungeon:
        wallRoof = get_wall_x2(mapPosY, mapPosX)          // ovr031 cell wall/roof byte
        sky_colour = wallRoof > 0x7F ? sky_colours[area.indoor_sky_colour]
                                     : sky_colours[area.outdoor_sky_colour]
        if area.block_area_view && !Cheats.always_show_areamap : mapAreaDisplay = false
        Draw3dWorld(mapDirection, mapPosY, mapPosX)        // the FP renderer (ovr030/031)
    elif can_draw_bigpic:
        draw_bigpic()                                      // overland / area big picture
    can_draw_bigpic = false
```

**Key findings:**
- **Indoor vs outdoor is per-CELL, not per-area:** the high bit of the cell's wall/roof byte
  (`get_wall_x2 > 0x7F`) selects **indoor** vs **outdoor** sky for *that* tile. So a single
  dungeon area can render some cells with the roofed/indoor horizon colour and others with the
  open-sky colour as the party walks — the `>0x7F` test is the same wall-set sentinel the engine
  already knows in `dungeonWalls.ts` (0x7F = blank/default set), here repurposed as the
  indoor/roof flag in the cell byte's top bit.
- **`sky_colours` = a fixed 16-entry EGA table** `{0x00,0x0F,0x04,0x0B,0x0D,0x02,0x09,0x0E, …}`
  (the 8 distinct colours repeat ×2). Each area carries two indices — `indoor_sky_colour` and
  `outdoor_sky_colour` — into this table; that is the **horizon/background fill** behind the FP
  wall geometry. (This is the *static per-area* sky colour — distinct from the *time-of-day*
  sun/moon overlay flagged as the ovr030 gap in `decompile-ovr030-3d-renderer.md`; the two
  compose: area sky colour underneath, time-of-day celestial body on top.)
- **`draw_bigpic` vs `Draw3dWorld`:** non-dungeon areas paint a full-screen "big picture"
  (the overland/encounter backdrop, `lastDaxBlockId 0x50` suppresses it); dungeon areas run the
  first-person renderer. `can_draw_bigpic` is a one-shot consumed each refresh.
- `block_area_view` (with a `Cheats.always_show_areamap` override) suppresses the area automap —
  the "you can't map here" dungeon flag.

## 3. Krynn-binary anchor

No string literals (geometry/draw code — methodology §3.2). Anchored structurally through the
shared FP renderer it calls (`ovr031.Draw3dWorld`/`get_wall_x2`, already binary-corroborated via
`wallview.ts`/CCFP in `decompile-ovr030-3d-renderer.md`) and the `0x7F` wall-set sentinel
(byte-confirmed in `dungeonWalls.ts`: CoK set 1, DoK set 3). `sky_colours`, `city_map_x/y`, the
`0x50`/`0x7F` constants are COAB-authoritative tables. `seg600:0A8A` address comment pins
`sky_colours` in COAB's segment map.

## 4. Engine cross-check — reviewed 2026-10-11

The sky helper is implemented in `packages/engine/src/render/sky.ts` and called from
`apps/web/src/ui/explore.ts`; `selectSkyColour` honors the supplied roof byte and
`renderFirstPersonViewWithSky` draws sky before walls. Thus the old claim that the engine
has no sky fill is superseded.

The web caller supplies default indoor/outdoor indices and defaults an undecoded roof byte
to indoor. This is not recovery of each area's real sky values. A complete original
`RedrawView` dispatcher, including `0x50` suppression, one-shot big-picture flags and
`block_area_view`, is not established merely by the sky caller. The save-under sprite
description remains a source reference rather than proof that every product cursor uses it.

## 5. Gen1 ↔ Gen2

The `RedrawView` dispatch shape (dungeon → 3-D, else big-picture; per-cell indoor/outdoor) is
engine-generation invariant — DQK (Gen2) keeps the same FP-vs-bigpic split. The `sky_colours`
table is **EGA-16 (Gen1)**; DQK substitutes VGA palette indices (its sky colours come from the
HLIB `TILE` VGA palette, not a fixed 16-entry EGA list), but the **per-area indoor/outdoor sky
index mechanism carries across**. The save-under sprite (ovr028) is identical in concept on both
(over EGA for CoK/DoK, over VGA for DQK).
