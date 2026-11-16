# Opus runtime-blocker advice — 2026-07-28

This is a concise, read-only advisory from Claude Code using the Opus model.  It
was asked to inspect only the three referenced local research notes, make no
edits, and distinguish documented facts from inference.  The recommendations
below are advisory, not newly verified reverse-engineering evidence.

## 1. CoAB regional-map city mapping

**Documented facts:** `current_city` is Area1+0x342 / ECL location `0x4CA1`.
Hub blocks `ECL1.DAX#80/#81` copy `[0x4C9B]` to `[0x4CA1]` at `0x809F` and
`0x816D`; their later `GETTABLE` operations are at `0x910C` and `0x8DB9`.
`BIGPIC1.DAX#121` (`0x79`) decodes to 304x120, and `ovr028.cs` contains 33
`city_map_x`/`city_map_y` pairs.

1. Statically decode the two `GETTABLE` tables and enumerate each entry's
   downstream `SAVE 0x7F12` (`game_area`) and `NEWECL` target.  This is the
   unlocated menu-item-to-city-index/return mapping and needs no DOSBox run.
2. Plot the 33 `ovr028.cs` coordinate pairs on decoded BIGPIC 121.  A city
   glyph match would independently validate table ordering.
3. Only after those two checks, implement cursor blink and return transition.

**Inference needing validation:** `CityInfo[]` order is the selector/table
order.  Do not use it as an implementation assumption until the above checks
agree.

## 2. DQK post-INT16 generic form dispatcher

**Documented facts:** the WHO opcode is area 67/member 47 at vaddr `0x87A7`;
the existing trace records `2033:0F0C -> 1D99:128D -> 25A4:2FE0`.  Overlay 8
contains the corresponding relocated code, live at physical `0x30D70`; an
entry breakpoint there was hit only while halted and pressing Down/Enter did
not re-enter it.  A single Down key does move the roster highlight.

1. Break at the **INT16 return site**, rather than the ECL WHO handler.  On
   `BPINT 16`, step out, capture caller CS:IP, then follow its call chain to
   the re-prompt loop.
2. Diff RAM across one isolated Down edge to identify the changed selection
   index, then set a write breakpoint on that byte.  This should land in the
   real form dispatcher rather than a guessed handler.
3. If runtime capture remains awkward, disassemble overlay-8 callers of
   offset `0x2FE0`, applying its relocation table.

**Capture constraint:** the prior route exceeds the host's approximately
124-second command window.  A bounded, resumable trace stage (boot/route once,
then attach and capture only the final key edge) is preferable to extending
the current all-in-one route.  This is an operational proposal; process
ownership and GameLink-only input rules remain mandatory.

## 3. Gateway weapon submenu to saved party

**Documented facts:** first-letter activation has been verified twice:
`P` enters PARTS and `W` enters WEAPON, yielding `NEXT PREV KEEP EXIT`.
There is no pre-generated native save.  `passwords.pdf` is the available
answer-key source; the protection string is at `GAME.OVR+0x55C1`.

1. Send `K` then `E`, which is the lowest-risk continuation from the verified
   WEAPON submenu; assert the resulting menu words after each key.
2. Extract candidate menu strings from `GAME.OVR` first, so subsequent runs
   check expected menus rather than explore blindly.
3. At party assembly, answer protection from `passwords.pdf`, save in-game,
   and run `tools/inventory_gateway_save.py`.  Keep `route_ready=false` until
   ECL5#19 is actually loaded.

Source notes consulted: `coab-town-classification.md`,
`dqk-search-location.md`, and `gateway-save-acquisition.md` in this folder.
