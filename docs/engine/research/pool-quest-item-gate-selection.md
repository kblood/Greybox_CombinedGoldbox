# Pool quest follow-up — item-gate mechanism selection

## Why this is the next independent mechanism

Pool's prior quest investigation exhausted one specific hypothesis: a shared ECL memory word set by
one block and read by another. The full registry and broader address-range scans found only local
scratch/consumed words; see `persistent-natural-routes.md`, “Pool's Quest Leg”. Repeating that
scan would not add evidence.

The Gen1 VM has a distinct, source-supported state channel: opcode `0x32`, `FIND_ITEM`. It reads
the party's carried item-type ids (`EclVmOptions.partyItemTypes`) and sets the script comparison
flags; it need not touch a persistent ECL address at all. Its counterpart `DESTROY_ITEMS` is opcode
`0x40`. See `packages/engine/src/ecl/opcodes.ts` and `packages/engine/src/ecl/vm.ts`.

Therefore the next Pool quest investigation is a bounded **item-gate scan**:

1. Decode every Pool `ECL*.DAX` block and enumerate reachable `FIND_ITEM` (`0x32`) operations.
2. For each, recover the following conditional branch and its narrative/combat/NEWECL consequence.
3. Prefer a gate that is read in a different area or changes a known route; recover its item type
   from the corresponding `ITEM*.DAX` table and locate an authentic acquisition/removal path.
4. Only promote the campaign quest leg if an acquired retail item demonstrably changes the separate
   block's outcome. A mere `FIND_ITEM` occurrence is not a quest proof.

This is deliberately independent of the rejected shared-flag mechanism and gives the next cycle a
source-backed discriminating test rather than a speculative story guess.

## Result — source join and runtime route (2026-07-31)

`tools/scan_pool_find_item_gates.py --strict` now performs this exact scan and is part of
`pnpm corpus`. The earlier three-gate result was a CFG bug: a known comparison outcome leaked past
later comparison-producing opcodes. The corrected traversal decodes all eight retail ECL archives
and finds seven reachable immediate gates:

| Gate | Item type | Found branch | Missing branch |
| --- | ---: | --- | --- |
| `ECL1#24 0x9A1E` | 74 | `IF_EQ` → `GOTO 0x9A7D` | skips to a `GOSUB` at `0x9A2D` |
| `ECL1#24 0xA5CF` | 74 | `IF_EQ` → `GOTO 0xA6D4` | skips to `GOTO 0xA657` |
| `ECL4#2 0xA23F` | 75 | `IF_EQ` → Brass Key success | no-key narration |
| `ECL4#10 0xB14B` | 82 | `IF_NE` | `IF_NE` not taken |
| `ECL4#10 0xB25E` | 82 | `IF_EQ` | `IF_EQ` not taken |
| `ECL6#1 0xABBD` | 91 | `IF_NE` | `IF_NE` not taken |
| `ECL6#19 0x9994` | 82 | `IF_EQ` | `IF_EQ` not taken |

Recovered retail C# source resolves the namespace mismatch behind the old negative: `TREASURE`
operand 8 is an ITEM archive block id, while `FIND_ITEM` compares each carried record's `Item.type`
byte at offset `0x2E`. Joining through the ITEM records maps type 74 to ITEM1#22's
`6 Leather Holy Symbol`, type 75 to ITEM4#38's `Brass Key`, type 82 to ITEM8#50's
`Efreeti Bottle`, and type 91 to ITEM6#57's `Pass`. Six unique TREASURE sites produce those four
identities; no reachable `DESTROY_ITEMS` site exists.

The host now preserves that runtime identity through ECL scripted treasure, TAKE, inventory, and
save/load. Focused e2e proves type 74's ECL1#18 acquisition and persistence. A second organic route
walks ECL4/GEO4#2 through both Grishnak encounters, takes ITEM4#38's eight records, clears and reloads
the party/inventory, then selects FREE → UNLOCK at descriptor 17; the retail success narration and
`[0x4A73]=0x80` prove type 75 changed the gate. The remaining stronger promotion target is a
cross-block chain, starting with ECL1#18 type-74 acquisition → ECL1#24 gate, rather than a direct
item seed. Generated exact evidence remains `pool-find-item-gates.md` /
`build/pool-find-item-gates.json`.

## Cross-block Holy Symbol promotion (2026-07-31)

That stronger slice is now complete. The implemented path keeps one campaign-memory map and the
ordinary party inventory across every retail boundary:

1. Walk ECL1/GEO1#18 to `(14,8,E)`, select `ATTACK`, defeat the ORC LEADER, and take
   ITEM1#22 `6 Leather Holy Symbol` (runtime item type 74).
2. Use the visible **Regional travel** control to supply ECL1#18's still-unimplemented upstream
   destination selector 3. The real `vm_run_1` writes `[49C3]=11`, `[49C4]=28`, `[6E12]=7`, and
   executes `NEWECL #26`.
3. ECL7#26's real `search_location` at `(11,28)` presents the western-edge
   `NORTH / SOUTH / LEAVE` menu. `LEAVE` returns to a new eight-way regional host rather than the
   departed dungeon. Its real `vm_run_1` calculates candidate positions in `[00FB]/[00FC]`; Pool's
   own `GAME.OVR` proves CALL id `0x401C` is an intentional no-op, so the outer host validates and
   commits accepted candidates before invoking `search_location` again. `NE`, then `E`, reaches
   `(13,27)` and the eastern-edge `NORTH / SOUTH / BOAT / LEAVE` menu.
4. `SOUTH` writes `[C04B..C04D]=15,4,3`, `[6E12]=1`, and `NEWECL #24`. The host sets
   `[49C5]=24` before invoking ECL1#24's header `initial_entry` at raw `0x1DA5`; that entry selects
   GEO24 and wall pieces `[1,3,5]`. The landed first-person pose is `(15,4,W)`.
5. A legal 20-step GEO1#24 walk reaches descriptor 4 at `(2,7)`. `LET HIM TOUCH YOU` with type 74
   prints the Leather Holy Symbol recognition and Temple of Bane welcome with no combat and leaves
   `[4A0F]=0`. A fresh party driven through the identical #18→#26→#24 transition without the item
   instead receives `KILL THESE UNBELIEVERS`, fights eight ORCs, and victory writes `[4A0F]=1`.

The focused browser regression is `explore-pool-holy-symbol-quest`. Its positive leg also saves in
ECL1#24, clears the live party and inventory, reloads, and verifies area 24, pose `(2,7,S)`, regional
coordinates `(13,27)`, `[49C5]=24`, and type 74. Engine goldens independently pin both coordinate
menus, all eight regional candidates, the SOUTH landing registers, ECL1#24's initial-entry resource
selection, and both FIND_ITEM outcomes. This promotes Pool's quest matrix leg to `proven`; the one
remaining host substitution is explicitly the visible fixed selector-3 control upstream of
ECL1#18's byte-real transition.
