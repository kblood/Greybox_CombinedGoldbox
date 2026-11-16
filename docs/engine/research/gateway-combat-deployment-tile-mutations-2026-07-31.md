# Gateway tactical deployment and temporary tile mutations (2026-07-31)

This closes the two source gates deliberately left open by
`gateway-wilderness-combat-floor-2026-07-31.md`: initial combatant deployment and temporary
Cloudkill/Stinking Cloud/downed-player background writes. All offsets below are zero-based retail
file offsets. The comparison is against CoAB's recovered battle source and uses relocation-normalized
16-bit instruction sequences plus exact resident tables/constants; shared filenames alone are not
treated as proof.

## Deployment

Gateway `GAME.OVR` overlay 12 begins at file `0xEEBB`. Its aligned battle-setup routines are:

| Routine | Gateway local / file | CoAB local | Result |
| --- | --- | --- | --- |
| `SetupCombatActions` | `0x1167` / `0x10022` | `0x10E0` | 91 normalized instructions exact after Gateway's 8-byte stack-check thunk |
| row/column range helper | `0x1291` / `0x1014C` | `0x1202` | 18 instructions exact; local bounds remain x `0..10`, y `0..5` |
| `try_place_combatant` | `0x12CA` / `0x10185` | `0x1233` | same formula/masks; Gateway additionally rejects final x outside `0..49` and y outside `0..24` |
| `place_combatant` | `0x146A` / `0x10325` | `0x1380` | same search; Gateway's two alternate-direction gates test `area.inDungeon == 0` instead of CoAB `game_state == WildernessMap` |
| `PlaceCombatants` | `0x18FA` / `0x107B5` | `0x17FE` | same team counts/facings/distance; Gateway generalizes team-0 start as described below |

The final coordinate formula is unchanged:

```
x = cur_x + team_x*6 + team_y*5 + 22
y = cur_y + team_y*5 + 10
```

Gateway's private direction/base/mask table is byte-identical to CoAB: Gateway packed `GAME.EXE`
`0x4E61..0x4ED0` and CoAB `START.EXE` `0xAA55..0xAAC4`, 112 bytes, SHA-256
`94c52ac7eefb716a42b6f029899c63d4f499935e9ec1d5bc2ca642149e058285`. Gateway's signed x/y
direction arrays at packed offsets `0x73B7` and `0x73C1` are also identical to CoAB.

The one real title delta is useful rather than incompatible. Gateway seeds party team-start as
`[mapPosX,mapPosY] - [floorOriginX,floorOriginY]`. `BattleSetup` snapshots the floor origin at file
`0x10C35..0x10C60`. The ordinary 2-D branch copies the current map position, so the ECL6 wilderness
route's delta is exactly `(0,0)`; only the fixed-map branch may be non-zero. The shared deployment
helper therefore accepts optional `partyStart`, defaulting to zero. Future fixed-map Gateway hosts must pass
the captured delta rather than inheriting the wilderness default.

For the focused west-facing (`mapDirection=6`) ECL6 encounter at raw distance 1, the unblocked table
oracle yields party cells `(28,13),(27,12),(29,14),(30,13),(29,12),(31,14)` and enemy cells
`(20,12),(21,13),(19,11),(19,12),(20,13),(18,11)`. The route's deterministic generated floor blocks
`(27,12)` and `(18,11)`, so native candidate probing produces the browser-pinned final cells
`(28,13),(29,14),(30,13),(29,12),(31,14),(28,11)` and
`(20,12),(21,13),(19,11),(19,12),(20,13),(17,10)`.

## Cloud and downed-player tile mutations

Gateway independently contains the full CoAB-shaped lifecycle and the same literal tile ids:

| Behavior | Gateway `GAME.OVR` file range | Exact discriminator |
| --- | --- | --- |
| already-downed placement | `0x107B5..0x10C05` | write `0x1F` at `0x10B03` |
| Stinking Cloud expiry | `0x129EB..0x12CCC` | restore downed `0x1F` at `0x12B63`; re-overlay `0x1E` at `0x12C9D` |
| Cloudkill expiry | `0x13CAA..0x13F81` | restore `0x1F` at `0x13E22`; re-overlay `0x1C` at `0x13F5C` |
| Stinking Cloud cast | `0x37513..0x3798B` | checks `0x1E/0x1F`; writes `0x1E` at `0x378B3` |
| Cloudkill cast | `0x39FF1..0x3A5B4` | checks `0x1E/0x1C/0x1F`; writes `0x1C` at `0x3A4C6`/`0x3A52D` |
| in-combat down write | `0x4A58E..0x4A8DC` | preserves `0x1E` at `0x4A793`; writes `0x1F` at `0x4A7B1` |
| down restore | `0x4A8DC..0x4AAE0` | `0x1F` guard at `0x4A9F4`; same saved-ground/other-downed-cell scan |

CoAB `START.EXE:0xC634` and Gateway `GAME.EXE:0x7427` contain byte-identical 40-byte
`BackGroundTiles[0x18..0x21]` entries (SHA-256
`62dc7ef2c97cafbf52f3300568170bce2bd07e52fe10d6fae352ca97dbf2bc3c`). Direction bytes are also
identical: `08 02 03 04 08 00 01 02 03 04 05 06 07` (self/east/southeast/south for Stinking Cloud,
then all nine Cloudkill cells), SHA-256
`2083e3e901b38c5b0431ffcf6798dc687d0906a3bbf8f8f98c943ec92ded33f8`.

The audit exposed one shared helper correction: native Stinking Cloud and Cloudkill expiry routines
walk separate lists and re-overlay only remaining clouds of their own kind. The engine previously
repainted cross-kind overlaps. It now filters by kind, with focused same-kind and cross-kind tests.

## Implementation and claim boundary

Gateway's ECL6 combat handoff now enables source placement and tile mutations. It retains the same
retail ECL-owned setup distance, encounter facing, title-local MON6 roster, 50x25 floor, and exact
wilderness resume. Browser e2e pins `placementMode='coab-source'`, the terrain-aware coordinates,
active mutation state, six HOBGOBLINs, and the post-victory ECL6 state.

This proves the static original-executable behavior and its focused browser integration. It does not
claim a new native combat trace for this exact random encounter, native RNG continuity, a fixed-map
Gateway `partyStart`, the unobserved ECL2#1 entrance, or broader campaign/rules/pixel parity.
