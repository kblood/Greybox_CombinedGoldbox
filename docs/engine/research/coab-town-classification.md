# CoAB Town/Dungeon/Wilderness Classification — ECL Opcode-Level RE

> Status: 2026-07-16. Answers `gen1-campaign-route-map.md`'s explicitly-unattempted question
> ("classifying town vs. dungeon vs. wilderness needs ECL opcode-level RE ... not attempted in
> this pass") for Curse of the Azure Bonds. **Positive result:** the engine-mode split (dungeon vs.
> wilderness) is now byte-grounded and machine-checkable (`tools/map_gen1_area_mode_writes.py`).
> **Negative result:** CoAB has no separate, GEO-groundable "town" engine mode — see
> "Conclusion" below. This is the honest-blocker writeup for BUILD-QUEUE.md item 6's "town
> enter/exit transition" leaf; it documents why that leaf's literal premise (a discrete
> `ECLn.DAX#m`/`GEOn.DAX#m` town pair, walkable straight out of an existing proven route with no
> new engine mode) does not hold for CoAB, and what would be needed to close the gap.

> **Disposition superseded 2026-07-31:** Sections 4-5 preserve the blocker as it stood on
> 2026-07-16. Section 6 records the subsequently completed, source-faithful regional-city round
> trip. The classification itself is unchanged: the village is DUNGCOM content, not a distinct
> Town engine mode.

## 1. The byte-grounded engine-mode flag

`coab_extracted/engine/ovr011.cs SetupGroundTiles()` (`sub_38030`) always loads *both* 24x24
combat/floor tile banks up front, then decides which one to actually draw with a single runtime
flag:

```csharp
static void SetupGroundTiles() // sub_38030
{
    if (gbl.area_ptr.inDungeon != 0)
        ovr034.Load24x24Set(0x19, 0, 1, "DungCom");
    else
        ovr034.Load24x24Set(0x21, 0, 1, "WildCom");

    ovr034.Load24x24Set(6, 0x22, 1, "RandCom");   // always layered on top
    ...
    if (gbl.area_ptr.inDungeon != 0) SetupDungeonFloor();
    else SetupWildernessFloor();
}
```

`inDungeon` is `Area1` struct offset `0x1CC` (`coab_extracted/Classes/Area1.cs:66,234`; already
decoded in `packages/engine/src/loaders/area1.ts:17`, comment: *"0 = wilderness/overland, non-zero
= dungeon"*). It is an ordinary ECL host-memory location, not a hidden native flag: the retail ECL
`SAVE` opcode handler special-cases it:

```csharp
// ovr008.cs vm_SetMemoryValue() -- retail handler for ECL opcode 0x09 (SAVE)
if (memType == 0) {                                  // memType 0 = Area1 range 0x4B00..0x4EFF
    ...
    else if ((location - 0x4B00) == 0x0E6 && gbl.area_ptr.inDungeon != value) {
        gbl.last_game_state = gbl.game_state;
        gbl.game_state = value == 0 ? GameState.WildernessMap : GameState.DungeonMap;
    }
    gbl.area_ptr.field_6A00_Set(0x6A00 + (location * 2), value);   // always writes through
}
```

`(location - 0x4B00) == 0xE6` -> `location == 0x4BE6`. Address math checked by hand and against
`Area1.field_6A00_Set`'s own `case 0x1CC: inDungeon = value;` switch arm:
`0x6A00 + 0x4BE6*2 = 0x101CC`, `& 0xFFFF = 0x1CC`. So:

**A retail ECL `SAVE <value>, 0x4BE6` instruction is the byte-grounded "which tileset" opcode the
route-map doc asked for.** `value == 0` -> `WildernessMap`/`WILDCOM`; `value != 0` ->
`DungeonMap`/`DUNGCOM`. This is the actual mechanism, not a per-area `LOAD_FILES(WILDCOM.DAX)`
call as the route-map's phrasing guessed — `LOAD_FILES`/`Load3DMap` loads a specific numbered GEO
grid, but the DUNGCOM/WILDCOM *tileset* choice is this global flag, checked once per area setup.

`tools/map_gen1_area_mode_writes.py` is the reusable scanner: a BFS over each ECL block's decoded
control-flow graph (reusing `gen1_ecl_encounter_scan.py`'s walker) that finds every statically
reachable `SAVE` targeting `0x4BE6`. Output: `docs/engine/research/gen1-area-mode-writes.md` /
`build/gen1-area-mode-writes.json`. Result for the three already-Persistent Gen1 games: **only
CoAB's `ECL1.DAX` (blocks 80/81/82) writes this flag** (39 unique static sites after dedup; Pool
and Secret have zero hits with the same scanner — either they don't expose this mechanic on the
scanned entry points, or their engine build genuinely never toggles it on the traced control-flow
graph; not further investigated here since this leaf is CoAB-scoped).

## 2. CoAB's actual area topology (derived, not assumed)

`ECL1.DAX` has **no matching `GEO1.DAX`** in the retail archive set (confirmed independently here
and cross-checked against an existing comment already in `apps/web/src/ui/gameData.ts:136`: *"Area
1 is wilderness-only and therefore ships no GEO1/WALLDEF1"*). `ECL1.DAX` blocks 80/81/82 are
CoAB's **wilderness/regional-travel hub**: block 80's very first instruction (`initial_entry`,
unconditional) is `SAVE 0 -> 0x4BE6` (enter `WildernessMap`).

Scanning every CoAB ECL block for statically-reachable `NEWECL` (opcode `0x20`) targets (ad hoc
BFS, not checked in as a generic tool — see `tools/scratch_dump_ecl.py`, deleted after use) gives
this connectivity graph:

| From | Reachable `NEWECL` target(s) | Notes |
| --- | --- | --- |
| `ECL4.DAX#37` (CoAB's proven **early anchor**, `research/coab-natural-encounter-route.md`) | `80` | Sole reachable exit; confirmed two-way link to the wilderness hub. |
| `ECL2.DAX#4` (CoAB's proven **middle** route, `coab-natural-2`) | `3`, `80` | Also links back to the hub. |
| `ECL1.DAX#80`/`#81` (hub) | `3` (game_area 2), `37` (game_area 4), `49`/`53` (game_area 5), `64` (game_area 6) | Each preceded by `SAVE(1,0x4BE6)` + a `SAVE` to `0x7F12` (`alter_character` `switch_var==0x312` -> `set_game_area`) + the `NEWECL`. This is the literal "enter this location" menu dispatch, driven by `HORIZONTAL_MENU`/`ON_GOTO`, not free 2D movement. |
| `ECL2.DAX#1 -> #2 -> #3 -> #4` | same-archive chain, no game_area/inDungeon change | The base `coab` profile's own starting "prison cell" area (`"YOU AWAKEN IN A SMALL ROOM..."`) chains through `#2`, `ECL2.DAX#3` ("SEWERS OF TILVERTON"), into `#4` (the already-promoted middle route). All `DungeonMap`/`DUNGCOM` throughout — `inDungeon` is inherited, never re-toggled inside this chain. |
| `ECL5.DAX#48`/`#53` | `80` | Area 5's own dungeon-flavored sub-locations ("YOU HAVE ENTERED A DANK CAVERN"/"A DARK PIT") exit cleanly back to the hub. |

`NEWECL(37)` from the hub is reached via exactly `SAVE(1,0x4BE6); SAVE(4,0x7F12); NEWECL(37)` —
i.e. entering CoAB's own already-proven early-anchor area is provably done through this exact
mechanism, confirming the hub is the real, non-synthetic connective tissue for the whole game, not
a guess.

## 3. Is there a discrete, GEO-backed "town"?

Two different kinds of "not a dungeon" content exist in CoAB, and they are **not the same thing**:

**(a) The real CoAB overland city selector**, `Area1.current_city` (offset `0x342`, byte `case
0x342: current_city = value;` in `Area1.cs:390-391` — same address-math technique as §1 resolves
this to ECL host location `0x4CA1`). It does not name a separate GEO grid. When an ECL area is in
`WildernessMap` mode, the retail `CMD_LoadFiles` path loads `BIGPIC` member `0x79` rather than a
3D map (`ovr003.cs:528-533`); `ovr027.cs:165-171` calls `MapCursor.SetPosition(current_city)` and
blinks the cursor over that picture. `ovr028.cs` supplies the 33-entry `city_map_x`/`city_map_y`
coordinate tables. This is a regional-map cursor and menu flow, not a free-walking city renderer.

`ovr011.cs` separately has a 33-entry `CityInfo[]` bit-flag table (`ovr011.cs:524-529`) and uses
the same `current_city` in `SetupWildernessFloor01/02/03()`. That function initializes a 50×25
`mapToBackGroundTile` combat map and is already partly ported in
`packages/engine/src/combat/coabCombatMap.ts`; it controls **wilderness combat background**, not
exploration movement. Thus there is no `TOWN.DAX` and no `GEOn.DAX#m` pair for a literal CoAB city,
but the missing browser leg is much narrower and better defined than a fictional 3D city: render
retail BIGPIC 0x79, position/blink the source coordinate cursor, and implement the ECL/menu action
and return transition that follows the selected regional location. A direct decoder check now also
pins the asset identity: retail `BIGPIC1.DAX` contains blocks **121 (`0x79`)** and 123 only, and
block 121 decodes as the expected **304×120** regional picture. The pixels and all 33 cursor cells
are therefore available; the still-unlocated part is the menu-item-to-city-index/return mapping,
which must not be synthesized from the visual map.

The selector is now located in retail ECL, rather than merely inferred from the native host:
the full-corpus reference scan (`tools/map_gen1_cross_area_flag_reads.py`) finds both wilderness
hub blocks `ECL1.DAX#80` and `#81` write `SAVE [0x4C9B], [0x4CA1]` at virtual addresses `0x809f`
and `0x816d`, respectively. In other words, the hub's selected destination becomes
`current_city` before the same blocks reach their `GETTABLE` reads of that selector (`0x910c` /
`0x8db9`). This is a real, source-backed entry mechanism for the BIGPIC cursor/menu flow; it does
**not** by itself show the regional map or make an explorer movement model.

**(b) DUNGCOM-tiled locations with town-flavored narration**, entered from the hub exactly like
any dungeon (`SAVE(1,0x4BE6)` — `DungeonMap`, same engine mode as a literal dungeon corridor).
The clearest example: `ECL5.DAX#49` / `GEO5.DAX#50` (`LOAD_FILES(50,2,255)` ->
`ovr031.Load3DMap(50)` per `ovr003.cs CMD_LoadFiles` -> `ovr008.cs` dispatch, confirming the GEO
grid it actually loads is member `50`, not `49` — the ECL block id and the GEO member id are
independently chosen, not implicitly equal):

```
"THIS RUN DOWN VILLAGE IS STRANGELY QUIET. THE WIND WHISTLES DOWN THE EMPTY STREET,
 PAST SHUTTERED WINDOWS. NO ONE IS ABOUT."
```

— contrast with its sibling `ECL5.DAX#53` ("YOU HAVE ENTERED A DANK CAVERN" / "A DARK PIT",
explicitly dungeon-flavored) and `ECL2.DAX#3` ("SEWERS OF TILVERTON", underground). `ECL5.DAX#49`
also has an in-location action with an observable side effect: `ENCOUNTER_MENU(... "A DARK ELF
PATROL ARRIVES" ...)` followed by `PARLAY`. This is CoAB's closest thing to a byte-grounded,
GEO-backed "town area member" — but by the engine's own classification it is `DungeonMap`/DUNGCOM
content (same mode as any dungeon), not a separately-decodable "town tileset" state. Calling it
"the town/wilderness tileset" the way the task's premise assumed would misrepresent what the
retail engine actually does.

## 4. Why the full leaf is blocked, not just hard

Reaching either kind of "town" content from CoAB's existing proven routes (`ECL4.DAX#37` early
anchor, `ECL2.DAX#4` middle route) **requires transiting the wilderness hub** (§2's table — it is
the only link out of both proven areas). Cross-archive transit is no longer the blocker:
ADR-0009 and `?explore=coab-natural-3` now execute the real `ECL4#37 -> ECL1#80 -> ECL5#49`
chain and preserve state. The remaining city-specific prerequisite is:

- **The BIGPIC/cursor/menu explorer contract** for the genuine `current_city` overland case (§3a).
  The hub menu/`ON_GOTO` chain is byte-grounded and the cross-archive mechanism already exists,
  but the browser lacks the retail `BIGPIC 0x79` regional image, its 33-position cursor table and
  blink lifecycle, and the selected-location command/return flow. `CityInfo[]` is a combat-floor
  input, so reusing it as an explorer map would be an invented seam.

Building that source-backed BIGPIC/cursor/menu surface is the remaining part of the town/city leaf.
It cannot be replaced by a synthetic GEO seam or by relabeling the already-supported dungeon-mode
village route.

## 5. Conclusion / disposition

- **Solved:** the ECL opcode-level classification the route-map doc flagged as unattempted. The
  dungeon/wilderness engine-mode split is now byte-grounded (`SAVE <value>, 0x4BE6`), the scanner
  and its generated evidence are checked in, and the complete CoAB area connectivity graph (§2) is
  derived from real ECL bytes, not guessed.
- **Not achieved:** a real `current_city` overland enter/exit transition in the browser. CoAB's
  regional locations have no GEO grounding (§3a); despite the now-located ECL setter and working
  hub crossing, Greybox has not implemented the BIGPIC/cursor/menu lifecycle that selects or
  returns from them.
- **Explicitly rejected as a workaround:** relabeling any already-reachable DUNGCOM/dungeon-mode
  area as "town" without the hub transition, or using the route-map's own already-flagged
  unverified `wall_openness` heuristic to manufacture a town candidate. Both would violate this
  project's "UNLOCATED beats invention" ethic.
- **Recommendation for the next attempt:** decode/render retail BIGPIC 0x79 and port the 33 source
  cursor coordinates plus the hub's selected-location action/return handoff. `ECL5.DAX#49`/
  `GEO5.DAX#50` remains a useful town-flavoured dungeon regression, but it cannot prove the real
  overland cursor/menu flow.

## Reproduction

```bash
cd tools
python map_gen1_area_mode_writes.py --json ../build/gen1-area-mode-writes.json \
  --markdown ../docs/engine/research/gen1-area-mode-writes.md
```

Regenerates the `0x4BE6` write-site scan for Pool/CoAB/Secret from the installed GOG archives.

## 6. Superseding closure — authentic regional-city round trip (2026-07-31)

The blocker described in Sections 4-5 is now closed through CoAB's actual retail architecture,
without inventing a third exploration mode. The browser route `?coab-regional=1` starts on the
real regional selector produced by `ECL5.DAX#48 -> ECL1.DAX#80`: it renders
`BIGPIC1.DAX#121`, places the cursor for `current_city=9` at the source coordinate `(31,15)`, and
offers the retail `ENTER CITY / JOURNEY ON / CAMP` action menu. The live state is byte-grounded:
visited blocks `[48,80]`, node and snapshot selectors `[0x4C9C]=[0x4C9B]=9`,
`[0x4CA1]=9`, and edge selector `[0x4C9D]=36`.

Choosing `ENTER CITY` follows the authentic dispatch into `ECL5.DAX#49`, whose
`LOAD_FILES(50,2,255)` loads `GEO5.DAX#50`. The script lands the party at `(3,0)` facing south
(`C04B=3`, `C04C=0`, `C04D=2`) and prints the run-down-village narration quoted in Section 3.
Walking south, south, west to `(2,2)` reaches descriptor 0 / cell index 34 and deterministic seed
`0x1022`, producing `A DARK ELF PATROL ARRIVES` with `COMBAT / WAIT / FLEE / PARLAY`. `COMBAT`
loads exactly two monster-id-49 `DK ELF FIGHTER`s; victory resumes the ECL and increments
`[0x4C47]` from 0 to 1.

The persistence proof moves once more west to the safe cell `(1,2)` before saving. Reload restores
disk 5 / area 49, that exact pose and facing, the party, and `[0x4C47]=1` without spuriously
re-entering the patrol cell. This deliberately does **not** claim that the encounter is consumed:
retail revisits to `(2,2)` can fire it again, and the victory word is a counter rather than a
suppression flag.

Continuing west to `(0,2)` and stepping through the boundary invokes `ECL5.DAX#49`'s real
`vm_run_1` exit with the host pose registers intact. Its prompt is `YOU ARE HEADING BACK TO THE
WILDERNESS. DO YOU WANT TO CONTINUE?`; `NO` remains in the village, while `YES` chains through
`ECL5.DAX#48` to game area 1 and `ECL1.DAX#80`. The returned regional surface again has node,
snapshot, and `current_city` 9, edge 36, `BIGPIC1.DAX#121`, cursor `(31,15)`, and the same action
menu. This proves both halves of the enter/action/exit contract rather than merely landing in the
GEO member.

Automated evidence is anchored by `packages/engine/test/coabRegionalTravel.test.ts` (regional
entry, patrol/victory state, exit cancellation, and accepted return) and
`apps/web/test/e2e.mjs::runCoabRegionalTownRoundTrip` (the continuous browser and save/reload
route).

**Final classification.** The campaign matrix's town leg can now be marked `proven`, but not
because a discrete Town renderer was discovered. The 2026-07-16 literal-premise finding remains
correct: CoAB represents the city choice with a wilderness BIGPIC/cursor/menu and the selected
village with its ordinary DungeonMap/DUNGCOM GEO machinery. What has changed is that Greybox now
implements and verifies that authentic composition end to end. CoAB's separately audited quest
leg remains blocked, so this finding alone does not complete its full campaign matrix.
