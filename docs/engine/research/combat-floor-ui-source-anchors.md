# CoAB Combat Floor/UI Source Anchors

Concrete decompiled anchors for the Gold Box combat MVP. Treat CoAB as a source-reference oracle only; copy no code.

## Combat Viewport And Chrome

- `coab_extracted\engine\seg040.cs:115-118` is the decisive battle viewport clip: `draw_combat_picture()` calls `draw_clipped_picture(..., 8, 176, 8, 176)`, so every combat floor/icon draw is clipped to pixel `x[8,176) y[8,176)`.
- `coab_extracted\engine\ovr033.cs:316-334` redraws the visible combat map as a 7x7 cell window. It starts `screenRowY = 0`, `screenColX = 0`, uses `IconColumnSize = 3`, and calls `DrawIsoTile(..., screenRowY, screenColX)` for each cell. With `seg040`'s +1 tile offset and 8px text cells, this gives 24x24 combat cells at `(8 + col*24, 8 + row*24)`.
- `coab_extracted\engine\ovr033.cs:266-340` owns combat viewport recentering via `mapScreenTopLeft = screenCentre - Point.ScreenCenter`, then redraws the 7x7 window.
- `coab_extracted\engine\seg037.cs:151-177` is combat chrome: clear 40x24-ish area, draw the top bar across cols `0..0x27`, vertical bars at cols `0`, `0x16`, `0x27`, and bottom bar on row `0x16`.
- Current implementation mirror: `packages\engine\src\render\combatScreen.ts:1-27`, `77-83`, `99-112`, `287-295` documents and implements the same 168x168 battle box, 7x7 geometry, and x=176 combat divider.

## 24x24 Floor Loading

- `coab_extracted\engine\seg001.cs:211-215` allocates `gbl.dax24x24Set = new DaxBlock(0, 0x30, 3, 0x18)`, the mutable 24x24 combat tile set.
- `coab_extracted\engine\ovr034.cs:9-27` is `Load24x24Set(cellCount, destCellOffset, block_id, fileName)`: load DAX block, compute `cellCount * tmp_block.bpp`, and copy into `gbl.dax24x24Set` at `destCellOffset * tmp_block.bpp`.
- `coab_extracted\engine\ovr011.cs:757-784` is `SetupGroundTiles()`: dungeon loads `Load24x24Set(0x19, 0, 1, "DungCom")`; wilderness loads `Load24x24Set(0x21, 0, 1, "WildCom")`; both append `Load24x24Set(6, 0x22, 1, "RandCom")`, then allocate/reset `mapToBackGroundTile`.
- Original listing proof: `coab_extracted\coab_new.lst:100035-100100` contains `DungCom`, `WildCom`, `RandCom` strings and the three `Load24x24Set` calls; `coab_extracted\coab_new.lst:199300-199390` is the original `Load24x24Set` routine and copy into `dword_1C8F8`.
- Asset anchors: `coab_extracted\Data\DUNGCOM.DAX`, `coab_extracted\Data\WILDCOM.DAX`, `coab_extracted\Data\RANDCOM.DAX`.

## Terrain Movement And LOS Table

- `coab_extracted\Classes\Gbl.cs:192-260` defines `BackGroundTiles` as `Struct_189B4[]`: per terrain id, the entries carry movement cost, two visibility/pathing fields, and `tile_index`.
- `coab_extracted\Classes\Struct_189B4.cs:8-21` names the four fields: `move_cost`, `field_1`, `field_2`, `tile_index`.
- `coab_extracted\Classes\Struct_1D1BC.cs:10-28`, `30-56` defines `mapToBackGroundTile`: 50-wide backing array plus `mapScreenTopLeft`, `drawTargetCursor`, `size`, and `ignoreWalls`.
- Movement cost consumers: `coab_extracted\engine\ovr009.cs:523-545` and `coab_extracted\engine\ovr014.cs:265-280` multiply `BackGroundTiles[ground_tile].move_cost` by orthogonal/diagonal factors and reject `0xFF` blocked terrain.
- Reach/LOS consumers: `coab_extracted\engine\ovr032.cs:92-116` seeds stepping from `BackGroundTiles[groundTilesMap[attacker]].field_1`; `coab_extracted\engine\ovr032.cs:221-279` rebuilds sorted target lists through `canReachTarget`; `coab_extracted\engine\ovr025.cs:1290-1324` wraps that for near-target and range queries.

## Tile And Icon Placement

- `coab_extracted\engine\ovr034.cs:30-40` is `DrawIsoTile(tileIndex, rowY, colX)`: `tileIndex > 0x7f` draws from `gbl.dword_1C8FC`, otherwise from `gbl.dax24x24Set`.
- `coab_extracted\engine\seg040.cs:23-31` shows `OverlayUnbounded`/`OverlayBounded` add `+1` to row/col before calling the clipped combat picture draw.
- `coab_extracted\engine\ovr033.cs:58-83`, `174-207` place terrain tiles with `(screen.y + p.y) * 3`, `(screen.x + p.x) * 3`, then draw target cursor/player icon over that cell.
- `coab_extracted\engine\ovr034.cs:90-98` is `draw_combat_icon(iconIndex, iconState, direction, tileY, tileX)`: it gets the directional icon and draws at `(tileY * 3) + 1`, `(tileX * 3) + 1`, index 0.
- `coab_extracted\engine\ovr033.cs:344-373`, `376-405` redraw icons during movement/facing/attack animation and flush the overlay.

## Attack/Menu Text Anchors

- Command menu: `coab_extracted\engine\ovr009.cs:313-360` builds `Move View Aim Use Cast Turn Quick Done` according to action state and calls `ovr027.displayInput`. Dispatch is `coab_extracted\engine\ovr009.cs:149-237`; `A` calls `ovr014.aim_menu(...)`, `M` enters move/attack, `V` opens view, `U/C/T/Q/D` map to use/cast/turn/quick/delay. `Use` is conditional on item availability in that builder; `Quick Done` is appended as a command run. Original listing strings include `coab_extracted\coab_new.lst:92612` (`Use`) and `coab_extracted\coab_new.lst:92615` (`Quick Done`).
- Move/attack prompts: `coab_extracted\engine\ovr009.cs:416` (`sub_33B26`) is the combat
  move/attack loop. `ovr009.cs:429` clears the prompt row; `ovr009.cs:433` builds
  `Move/Attack, Move Left = {player.actions.move / 2}`; `ovr009.cs:435` displays it through
  `ovr027.displayInput(...)`, whose `displayExtraString` is drawn on row `0x18`, col `0`
  (`coab_extracted\engine\ovr027.cs:155`). Insufficient movement starts around `ovr009.cs:523`,
  compares cost vs `player.actions.move` at `ovr009.cs:539`, and prints `can't go there` at
  `ovr009.cs:541` through `ovr025.string_print01`, which clears/prints/delays/clears the prompt row
  (`coab_extracted\engine\ovr025.cs:775`). Listing anchors include
  `coab_extracted\coab_new.lst:93073`, `93166`, `93175`, `93177`, `93205`, `93077`, `93461`,
  `93466`, and `93470`.
- Directional Move/Attack bump resolution: `coab_extracted\engine\ovr009.cs:459` maps movement
  keys through `Gbl.MapDirectionDelta` (`coab_extracted\Classes\Gbl.cs:690`) as eight directions
  `H/I/M/Q/P/O/K/G` = N/NE/E/SE/S/SW/W/NW. After the icon turns (`ovr009.cs:498`), the loop probes
  the destination footprint via `getGroundInformation(...)` (`ovr009.cs:502`;
  `coab_extracted\engine\ovr033.cs:433`, `458`, `463`, `469`). If `target_index > 0`, the occupied
  cell is routed to `sub_33F03(...)` immediately (`ovr009.cs:504`) before the terrain-cost movement
  branch. `sub_33F03` (`ovr009.cs:591`) is the bump-attack path: pure ranged weapons print
  `Not with that weapon` (`ovr009.cs:593`), legal targets are checked through `can_attack_target`
  (`ovr009.cs:598`), sweep attacks can fire (`ovr009.cs:602`), and the normal melee resolver is
  `AttackTarget(null, 0, target, player)` (`ovr009.cs:608`).
- Empty-cell directional movement is a separate path: passable terrain reaches the movement-cost check
  around `ovr009.cs:523-545`, then calls `move_step_away_attack(dir, player)` before movement and
  `sub_3E748(...)` for the actual move. `coab_extracted\engine\ovr014.cs:326` shows
  `move_step_away_attack` as the leaving/free-attack path for enemies adjacent to the origin but not
  still adjacent at the destination. `ovr014.cs:252-280` moves the combatant, debits movement, redraws,
  and invokes `move_step_into_attack`, whose guard/readied-strike behavior is anchored in the same
  movement family.
- Guard availability: `coab_extracted\engine\ovr009.cs:621-624` only appends `Guard ` to the
  Delay/Guard menu when `is_weapon_ranged(player) == false || is_weapon_ranged_melee(player) == true`.
  `ovr025.cs:1578` defines ranged as a ranged primary weapon, and `ovr025.cs:1584` delegates the
  ranged-melee exception to `item_is_ranged_melee(primaryWeapon)`. `ovr025.cs:1333` (`guarding(...)`)
  then clears actions, sets `actions.guarding = true`, and prints `Guarding`.
- Ally attack confirmation: `coab_extracted\engine\ovr014.cs:1717-1745`
  (`can_attack_target(target, attacker)`) allows opposite-team targets and quick-fight targets directly;
  otherwise it prompts `Attack Ally: ` through `ovr027.yes_no` at `ovr014.cs:1726`. A `No` answer rejects
  the attack. A `Yes` answer sets `gbl.area2_ptr.field_666 = 1`, converts every healthy NPC-controlled
  combatant (`control_morale >= NPC_Base`) to `CombatTeam.Enemy`, clears its current target, and
  recomputes team counts. `Player.control_morale` is offset `0xf7`, `Control.NPC_Base = 0x80`
  (`coab_extracted\Classes\Player.cs:389`, `Player.cs:322`), and the conversion predicate is exactly
  `health_status == Status.okey && control_morale >= Control.NPC_Base` (`ovr014.cs:1737-1741`;
  `Status.okey = 0` in `coab_extracted\Classes\Enums.cs:7`). The raw listing repeats the same shape at
  `coab_extracted\coab_new.lst:115287`: health-status zero, `field_F7 > 0x7f`, set team to enemy, clear
  target, then count teams. The aim/target path calls this gate at `ovr014.cs:1810-1811` before
  `AttackTarget` at `ovr014.cs:1845`; manual targeting reaches the same gate through `Target(...)` /
  `sub_411D8` at `ovr014.cs:2000` and `ovr014.cs:2186-2200`; Move/Attack bump reaches it through
  `ovr009.cs:598` before `AttackTarget` at `ovr009.cs:608-610`.
- Aim menu: `coab_extracted\engine\ovr014.cs:1752-1801` prints `Range = N`, builds
  `Next Prev Manual [Target] Center Exit`, redraws target summary, and prompts with `Aim:`. `Range = N`
  is printed at `ovr014.cs:1760` via `seg041.displayString(..., 0x17, 0)`, one row above the input bar.
  `ovr014.cs:1764` gates optional `Target`, `ovr014.cs:1795` builds the command string, and
  `ovr014.cs:1800` calls `ovr027.displayInput(..., text, "Aim:")`. Original string anchors are
  `coab_extracted\coab_new.lst:115322-115328`, with `Aim:` loaded at `coab_new.lst:115527` and
  `displayInput` called at `coab_new.lst:115547`.
- Aim prompt/menu co-residency: `coab_extracted\engine\ovr027.cs:155-162` renders
  `displayExtraString` on row `0x18`, sets the command text x-offset to `displayExtraString.Length`,
  and then renders the command string on the same input row. The highlighted command-row renderer is
  `display_highlighed_text` / `sub_6C1E9` at `ovr027.cs:89-100`.
- Conditional `Target` menu entry: normal party Aim enters with `canTargetEmptyGround=false` at
  `coab_extracted\engine\ovr009.cs:199-200`. `aim_sub_menu()` adds literal `Target ` only when its
  target/range checks allow it (`coab_extracted\engine\ovr014.cs:1764-1790`) before building
  `Next Prev Manual {Target} Center Exit` at `ovr014.cs:1795`. Manual `Target(...)` starts with
  `Center Exit` (`ovr014.cs:1972`), prefixes `Target ` only when `can_target` is true
  (`ovr014.cs:1974-1976`), rejects empty cells when `canTargetEmptyGround == false`
  (`ovr014.cs:1967-1969`), and only commits Enter/`T` when `can_target` is true
  (`ovr014.cs:1983-2007`).
- Manual target mode: `coab_extracted\engine\ovr014.cs:1859-2071` (`Target(...)`) sets `mapToBackGroundTile.drawTargetCursor = true`, uses a one-cell cursor, shows manual strings around `coab_extracted\coab_new.lst:115763-115773` (`Range =`, `Center Exit`, `Target`, `(Use Cursor keys)`), conditionally offers `Target` for legal cells, handles `Center` by redrawing/recentering, and exits by clearing target state. The cursor draw path uses `coab_extracted\Classes\Struct_1D1BC.cs:24` and `coab_extracted\engine\ovr033.cs:72` for the focus box.
- Target summary: `coab_extracted\engine\ovr014.cs:1752-1802` (`aim_sub_menu(...)`) sets
  `gbl.display_hitpoints_ac = true` and calls `CombatDisplayPlayerSummary(target)`;
  `coab_extracted\engine\ovr014.cs:1859-2071` (`Target(...)`) refreshes the same summary when the
  cursor sits on a legal target (`ovr014.cs:1927-1930`) and clears `TextRegion.CombatSummary` when it
  does not (`ovr014.cs:1932-1934`). The summary renderer is
  `coab_extracted\engine\ovr025.cs:292-335` (`CombatDisplayPlayerSummary(Player player)`): it only
  renders when `gbl.display_hitpoints_ac` is true, resets that flag, clears combat summary, prints
  name/status, `Hitpoints`, `AC`, primary weapon if available, then non-combat health status or
  `(Helpless)`. Low-level AC/HP helpers are `ovr025.cs:264-270`; `Player.DisplayAc` is defined at
  `coab_extracted\Classes\Player.cs:598`; combat status text clearing/printing is
  `ovr025.cs:787-811`; `IsHeld()` covers snake charm, paralyze, sleep, and helpless at
  `coab_extracted\Classes\Player.cs:845`.
- Greybox AC note: CoAB `Player.DisplayAc = 0x3c - ac` converts that engine's internal stored AC byte
  to player-facing AD&D AC. Greybox `Combatant.ac` / `TacticalCombatant.ac` is already the display AC
  used by to-hit math and tests (`d20 >= THAC0 - AC`), so the web summary must not apply the CoAB
  internal-byte conversion again.
- `TextRegion.CombatSummary` bounds are `coab_extracted\engine\seg041.cs:119`:
  `{ 0x15, 0x26, 1, 0x17 }`, inclusive y `1..21`, x `23..38`. `seg041.cs:7` confirms inclusive end
  bounds before pixel conversion.
- Use command source path: `coab_extracted\engine\ovr009.cs:203` dispatches `U` to `ovr020.PlayerItemsMenu(ref var_2)`; `coab_extracted\engine\ovr020.cs:432` is the item menu (`use_item proc far`), `ovr020.cs:535` gates usable items to readied scrolls or magic-item spell effects, and `ovr020.cs:980-1064` (`UseMagicItem`) emits `uses an item`, routes to the spell resolver, and consumes scrolls/charges.
- Quick command source path: `coab_extracted\engine\ovr009.cs:177` dispatches `Q` through `SetPlayerQuickFight(player)` (`ovr009.cs:707`) and `ovr010.PlayerQuickFight(player)` (`ovr010.cs:8`). `coab_extracted\engine\ovr010.cs:183` shows quick-fight can auto-select readied magic items before falling back to other quick actions.
- Attack text: `coab_extracted\engine\ovr014.cs:113-178` builds `Attacks`, `-Backstabs-`, `slays helpless`, `(from behind)`, `Hitting for N point(s) of damage`, and `and Misses`; `coab_extracted\engine\ovr014.cs:724-860` calls it from melee resolution.
- Combat text regions: `coab_extracted\engine\ovr025.cs:775-784` prints one-line prompt/status text on row `0x18`; `coab_extracted\engine\ovr025.cs:787-810` writes player status text in the combat side area; `coab_extracted\engine\ovr025.cs:292-333` prints combat summary `Hitpoints`, `AC`, weapon name, and `(Helpless)`. Region bounds live at `coab_extracted\engine\seg041.cs:119-123`.

## Greybox UI Status

- Web combat now renders the command menu in Gold Box order:
  `Move View Aim Use Cast Turn Quick Done`. `apps/web/src/ui/combat.ts` keeps old internal seams such
  as `attack()`, `guard()`, `wait()`, and `flee()` for tests/mechanics, but the visible command bar and
  focused browser tests use the recovered command labels.
- Web target mode now switches the bottom menu to `Next Prev Manual Target Center Exit` and paints a
  one-line `Range = N` status, matching the CoAB aim-menu anchors above. The bottom input row now carries
  the `Aim:` prompt before the aim menu through the renderer's menu prompt field. `Next`/`Prev` cycle
  targets, `Target` confirms, `Center` recenters, and `Exit` returns to the command menu. In manual
  cursor mode, the menu switches to `Target Center Exit` while the cursor is on a legal target and
  `Center Exit` over empty/non-target terrain; empty/manual terrain also clears the target summary.
  `Manual` now enters a visible grid-cursor MVP: arrow keys move the cursor, `Target` attacks a reachable
  enemy on the cursor, `Center` recenters on it, and `Exit` cancels. This is behaviorally aligned with
  `ovr014.Target(...)` but not exact source parity yet; remaining differences include the original manual
  prompt/menu shape, eight-direction key mapping, `canReachTarget` detail, and empty-ground targeting for
  callers that allow it.
- Web target mode now draws a compact combat summary in the sidebar instead of treating the target as a
  fake party row. The summary is refreshed from the selected/cursor target and shows target name, HP, AC,
  current weapon when available, and status such as `(Helpless)`. HP now carries a source-shaped display
  state in the renderer contract: green when full, yellow when damaged, magenta when explicitly
  highlighted, and grey when down. The current web target path uses full/damaged/down; highlighted is
  reserved until the exact CoAB trigger is modeled. Manual cursor mode clears the summary
  when the cursor is not on a legal target. This is an MVP mirror of
  `CombatDisplayPlayerSummary(target)`, not exact text-region parity yet: current gaps are exact
  row/column layout, exact highlighted-HP trigger, exact status-string formatting, and full clear-region
  timing across every target-menu branch.
- Web summary status text deliberately follows the CoAB combat branch: only `asleep`/`held` style
  helplessness is printed as `(Helpless)`. Other Greybox tactical flags such as feared, slowed,
  coughing, or guarding remain visible through the grid/panel/log affordances but are not appended in the
  compact combat summary until a source anchor proves an equivalent combat-summary string.
- Web move mode now paints `Move/Attack, Move Left = N` in the bottom prompt row while the party unit is
  walking, source-shaped from `ovr009.cs:429-435`/`ovr027.displayInput`. A failed move in `party-move`
  temporarily replaces that prompt with `can't go there`, source-shaped from `ovr009.cs:523-545` and
  `ovr025.string_print01`; exact delay/clear timing still needs source-parity work.
- Web move mode now also supports the CoAB-shaped occupied-cell branch for orthogonal input: when the
  active party unit is in Move/Attack mode and the chosen adjacent cell contains an enemy that the
  engine reports in `meleeTargets()`, the move resolves through the existing `partyAttack` path instead
  of trying to step into the occupied cell. This is an MVP mirror of `ovr009.sub_33B26 -> sub_33F03`,
  not full parity yet. The web direction table now also accepts CoAB's eight Move/Attack keys:
  `H/I/M/Q/P/O/K/G` = N/NE/E/SE/S/SW/W/NW, and the E2E seam proves a diagonal NE (`I`) occupied-cell
  bump resolves through the same attack path. The same web branch mirrors CoAB's ranged-only rejection
  for a readied bow: attempting the bump keeps the actor in Move/Attack mode, does not attack or move,
  and displays `Not with that weapon` on the prompt row. Remaining gaps are ranged-melee item distinctions
  beyond the current bow-vs-melee model, source-accurate sweep target selection, guard/readied strike
  exactness after movement, and exact `AttacksReceived`/direction-change handling.
- Tactical ally attacks now have an explicit-confirmation MVP: normal legal target lists remain foe-only,
  but direct melee/missile actions can opt into same-side targeting with `allowAlly`, and the web combat
  seam proves unconfirmed ally attacks are no-ops while confirmed attacks damage/log through the normal
  resolver. The tactical engine now also carries `npcControlled` from MONCHA-backed combatants and, after
  a confirmed same-side attack, converts every active NPC-controlled party-side combatant to enemy with a
  `side-change` event. This covers CoAB's numeric `control_morale >= NPC_Base` hostility flip at MVP
  level. Web manual target mode, non-manual target cycling, and Move/Attack occupied-cell bump paths now
  expose a visible `Attack Ally:` `Yes No` confirmation when the selected/cursor/bumped figure is a
  reachable same-side target; `No` cancels without spending the action, and `Yes` routes to the confirmed
  `allowAlly` attack path. The tactical API now exposes `allyAttackConfirmed()` as the `area2_ptr.field_666`
  analogue and `teamCounts()` as the active party/enemy count analogue of `CountCombatTeamMembers()` after
  side changes/removals. `TacticalCombatant.actionTargetId` / `targetIntentOf(id)` now provide the narrow
  `actions.target` analogue: accepted attack/cast/turn choices record target intent, and the confirmed
  ally-attack conversion clears that intent for every converted healthy NPC-controlled ally while leaving
  PCs and downed NPCs untouched. Remaining gap: raw/full original `actions` struct and `area2_ptr` storage
  parity if native memory layout compatibility becomes required.
- Tactical movement now has a CoAB-shaped leaving/free-attack MVP before movement: when a mover starts
  inside an enemy's melee reach and the destination leaves that reach, the enemy gets a `leaving`
  opportunity strike before the move event is logged/debited. This mirrors the source ordering
  `ovr009.cs:523-545 -> ovr014.move_step_away_attack(...) -> ovr014.sub_3E748(...)` at the engine level.
  Remaining gaps are exact original eligibility around special weapons/statuses and full
  `AttacksReceived`/direction-change parity.
- Guard availability now follows the CoAB menu gate at engine level: pure missile readied weapons do not
  get legal `guard` actions and a direct guard apply is a no-op that does not spend the turn; melee and
  thrown/ranged-melee-modeled weapons can still ready Guard. The web guard seam also only advances when
  the engine returns an actual guard event, so bow users do not silently spend the turn through the legacy
  hotkey/test seam.
- `Use` now has a source-shaped MVP in web: only readied combat-use items are offered; using one logs
  `uses an item`, routes through the existing tactical spell resolver, ends the actor action, and consumes
  one stack unit. The current catalogue hook maps `Vial` to a Cure Light Wounds potion-style effect because
  the treasure/shop code already treats Vial as a potion, but this is still provisional until real
  per-instance ITEM affect/charge bytes are preserved in `InventoryEntry`.
- `Use` is not source-complete yet. Missing pieces: exact item menu/chrome, `Item:` prompt, `Must be
  Readied` placement, scroll spell-list behavior (`Spells on Scroll`, reader class/thief rules, `oops!`),
  magic-item `affect_1/2/3` charge handling, and preserving richer decoded CoK/DoK/DQK item instance
  fields through the web inventory store.
- `Quick` now has a web MVP: the menu/hotkey/seam Quick command drives only the current party actor,
  prefers a useful readied combat-use item when one is available, then loops the existing tactical
  `aiAction()` until that actor's turn changes. Full-battle resolution remains available only through
  the separate `Auto` seam/button.
- `Quick` is not source-complete yet. Missing pieces from `ovr010.PlayerQuickFight`: randomized
  magic-item/wand priority, pending delayed-spell handling, source-accurate turn-undead ordering, spell
  targeter behavior, weapon/item re-selection, morale/flee/surrender ordering, movement offset table
  via `actions.field_15`, ranged-adjacent special handling, multi-attack continuation, spacebar
  interrupt semantics, and the Ctrl-key quick-fight path for all player-controlled team members.
- Verified on 2026-07-13 with:
  `pnpm --filter @goldbox/web e2e:combat` and
  `$env:GB_E2E_ONLY='combat'; pnpm --filter @goldbox/web e2e`.
- Use MVP additionally verified on 2026-07-13 with:
  `pnpm --filter @goldbox/engine exec vitest run test/inventory.test.ts --reporter=verbose`,
  `$env:GB_E2E_ONLY='combat-use'; pnpm --filter @goldbox/web e2e`,
  `pnpm --filter @goldbox/web typecheck`, and
  `pnpm --filter @goldbox/engine typecheck`.
- Quick MVP additionally verified on 2026-07-13 with:
  `$env:GB_E2E_ONLY='combat-quick'; pnpm --filter @goldbox/web e2e`,
  `$env:GB_E2E_ONLY='combat'; pnpm --filter @goldbox/web e2e`,
  `pnpm --filter @goldbox/web e2e:combat`, and
  `pnpm --filter @goldbox/web typecheck`.
- Target-summary MVP additionally verified on 2026-07-13 with:
  `pnpm --filter @goldbox/engine typecheck`,
  `pnpm --filter @goldbox/web typecheck`,
  `$env:GB_E2E_ONLY='combat'; pnpm --filter @goldbox/web e2e`, and
  `pnpm --filter @goldbox/web e2e:combat`.
- Summary HP-colour parity additionally verified on 2026-07-13 with:
  `pnpm --filter @goldbox/engine exec vitest run test/combatScreen.test.ts --reporter=verbose`,
  `pnpm --filter @goldbox/engine typecheck`,
  `pnpm --filter @goldbox/web typecheck`, and
  `$env:GB_E2E_ONLY='combat'; pnpm --filter @goldbox/web e2e`.
- Summary combat-status parity additionally verified on 2026-07-13 with:
  `pnpm --filter @goldbox/web typecheck`,
  `$env:GB_E2E_ONLY='combat'; pnpm --filter @goldbox/web e2e`, and
  `pnpm --filter @goldbox/web e2e:combat`.
- Aim prompt MVP additionally verified on 2026-07-13 with:
  `pnpm --filter @goldbox/engine exec vitest run test/combatScreen.test.ts --reporter=verbose`,
  `pnpm --filter @goldbox/engine typecheck`,
  `pnpm --filter @goldbox/web typecheck`,
  `$env:GB_E2E_ONLY='combat'; pnpm --filter @goldbox/web e2e`, and
  `pnpm --filter @goldbox/web e2e:combat`.
- Aim conditional-Target MVP additionally verified on 2026-07-13 with:
  `pnpm --filter @goldbox/web typecheck`,
  `$env:GB_E2E_ONLY='combat'; pnpm --filter @goldbox/web e2e`, and
  `pnpm --filter @goldbox/web e2e:combat`.
- Move/Attack prompt MVP additionally verified on 2026-07-13 with:
  `pnpm --filter @goldbox/web typecheck`,
  `$env:GB_E2E_ONLY='combat'; pnpm --filter @goldbox/web e2e` (including the prompt-row shape with no
  command menu during `party-move`, plus the `can't go there` failed-move prompt when the demo start has
  a blocked neighbor), and
  `pnpm --filter @goldbox/web e2e:combat`.
- Directional Move/Attack bump MVP additionally verified on 2026-07-13 with:
  `pnpm --filter @goldbox/web typecheck`,
  `$env:GB_E2E_ONLY='combat'; pnpm --filter @goldbox/web e2e` (including the `Not with that weapon`
  ranged-only rejection for a readied bow and diagonal `I`/NE bump attack), and
  `pnpm --filter @goldbox/web e2e:combat`.
- Leaving/free-attack movement MVP additionally verified on 2026-07-13 with:
  `pnpm --filter @goldbox/engine typecheck`,
  `pnpm --filter @goldbox/engine exec vitest run test/tactical.test.ts --reporter=verbose`,
  `pnpm --filter @goldbox/web typecheck`,
  `pnpm --filter @goldbox/web e2e:combat`, and
  `$env:GB_E2E_ONLY='combat'; pnpm --filter @goldbox/web e2e`.
- Guard ranged-weapon availability additionally verified on 2026-07-13 with:
  `pnpm --filter @goldbox/engine typecheck`,
  `pnpm --filter @goldbox/engine exec vitest run test/tactical.test.ts --reporter=verbose`,
  `pnpm --filter @goldbox/web typecheck`,
  `$env:GB_E2E_ONLY='combat'; pnpm --filter @goldbox/web e2e`, and
  `pnpm --filter @goldbox/web e2e:combat`.
- Ally attack confirmation MVP additionally verified on 2026-07-13 with:
  `pnpm --filter @goldbox/engine typecheck`,
  `pnpm --filter @goldbox/engine exec vitest run test/tactical.test.ts --reporter=verbose`,
  `pnpm --filter @goldbox/web typecheck`,
  `$env:GB_E2E_ONLY='combat'; pnpm --filter @goldbox/web e2e`, and
  `pnpm --filter @goldbox/web e2e:combat`.
- NPC ally-to-enemy conversion after confirmed ally attack additionally verified on 2026-07-13 with:
  `pnpm --filter @goldbox/engine typecheck`,
  `pnpm --filter @goldbox/engine exec vitest run test/tactical.test.ts --reporter=verbose`,
  `pnpm --filter @goldbox/web typecheck`,
  `$env:GB_E2E_ONLY='combat'; pnpm --filter @goldbox/web e2e`, and
  `pnpm --filter @goldbox/web e2e:combat`.
- `actions.target`/target-intent clearing for converted NPC allies additionally verified on 2026-07-13 with:
  `pnpm --filter @goldbox/engine typecheck` and
  `pnpm --filter @goldbox/engine exec vitest run test/tactical.test.ts --reporter=verbose`.
- Manual `Attack Ally:` prompt MVP additionally verified on 2026-07-13 with:
  `pnpm --filter @goldbox/web typecheck`,
  `$env:GB_E2E_ONLY='combat'; pnpm --filter @goldbox/web e2e`, and
  `pnpm --filter @goldbox/web e2e:combat`.
- Non-manual target-cycling and Move/Attack bump `Attack Ally:` prompt MVP additionally verified on
  2026-07-13 with:
  `pnpm --filter @goldbox/web typecheck`,
  `$env:GB_E2E_ONLY='combat'; pnpm --filter @goldbox/web e2e`, and
  `pnpm --filter @goldbox/web e2e:combat`.

## Binary Cross-Checks

- `docs\engine\research\pattern-match-report.md` pins the core combat text cluster across local binaries: CoK `GAME.OVR:0xaaa6` / DoK `GAME.OVR:0x87f1` / DQK `DQK.EXE:0x6b18d` / NWN `GAME.OVR:0x1851f` for `is hit FOR`, plus attack text such as `Hitting for` and `and Misses`.
- The same report confirms battle-floor and icon-loader anchors: CoK `DungCom` at `GAME.OVR:0xf1ac`, DQK `DungCom1` at `DQK.EXE:0x697c2` and `0x6ac97`, CoK/NWN/DoK/DQK `CPIC`, `CHEAD`, `CBODY`, and `COMSPR` references.
- The COAB-shaped `BackGroundTiles` byte table is directly visible in DQK at `DQK.EXE:0x69bb7`;
  `docs\engine\research\dqk-overlay12-combat-setup-cluster.md` now carves that cluster into an exact
  `BACKGROUND_TILES[0..25]` run, DQK variant rows, and a second exact `BACKGROUND_TILES[32..43]` run at
  `DQK.EXE:0x69c37`. CoK/DoK/NWN need a broader data-bank carve for the equivalent table, because the
  current scanner only covers normalized code chunks.
- `docs\engine\research\combat-tilebank-load24x24-crossgame.md` pins old-engine CoK/DoK/NWN
  `Load24x24Set`-shaped call arguments against decoded DAX tile counts, and records the current DQK Gen2
  comparator: `0x02cc1a` / `0x02cc33` load DGROUP offsets for `DungCom1` / `WildCom1` through
  `lcall 0x104c:0x0007`.
- `docs\engine\research\combat-anchor-xrefs.md` is the current candidate xref shortlist. It is not final decompiled routine naming, but it narrows manual follow-up windows for `Load24x24Set`, NWN surrender/flee state, CPIC/COMSPR loading, and DQK `DUNGCOM1` setup.

## Next Implementation Targets

- Web: replace placeholder combat terrain with decoded `DUNGCOM/WILDCOM/RANDCOM` tile sets, feed `cellTile` from `mapToBackGroundTile`-equivalent data, and keep `composeCombatScreen`'s 7x7/168px clipping as the invariant.
- Web: continue refining command/aim/status text beyond the first label pass: manual grid targeting,
  exact `Aim:` prompt timing/menu spacing, exact side target-summary row/column and weapon/status parity,
  and source-backed `Use` / `Quick` semantics.
- Native done: `/V` RAW rendering now uses separate visual constants for the recovered 7x7/24px/`[8,176)` combat viewport while preserving the existing 10x10 mechanics grid.
- Native later: add 24x24 combat-floor asset loading parallel to `Load24x24Set`, then render the 7x7 clipped viewport before combatants in `/V`.
- Native: propagate `BackGroundTiles` movement/LOS metadata into `cccombat.asm` terrain records so movement, blocked terrain, range, and LOS share the same table as rendering.
