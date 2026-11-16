# CoK monster movement from the MON record (Task 113)

Status: PROVED for ordinary (unarmoured) CoK MON records, implemented in
`native/src/cccombat.asm` `.cok` branch of `fill_enemy_from_mon`. 2026-10-07.

## Mapping

`budget_squares = rec[0xD5]` if `1 <= rec[0xD5] <= 96`, else `1`; the turn ledger is
`2 * budget_squares` half-squares; orthogonal step 2, diagonal step 3 (3:2).

## Evidence (all static, GAME.OVR file offsets; pinned by `tools/test_cok_monster_move.py`)

- `0x37555..0x37562`: in the combatant-recalculation routine (`les di,[bp+6]` record pointer)
  `mov al,es:[di+0xD5]` then `mov es:[di+0x198],al` (store at `0x3755D`). This is the
  unconditional "movement = base movement" step (CoAB `ovr025.cs:426`,
  `player.movement = player.base_movement`; CoAB's field sits at 0xE4, CoK's at 0xD5 = 213).
- `0x3681B`: the same copy inside the armour-weight routine (CoAB `CalcArmorWeightEffect`,
  `ovr025.cs:67-90`). It runs per equipped ARMOUR item only: item weight (`+0x37`) 0..150 keeps
  base movement, 151..399 forces 9, otherwise 6, and a nonzero flag (`+0x32`) adds 3 when the
  result is <= 9. A monster carries no armour item in the native encounter path, so the
  `0x3755D` copy is the whole story for monsters. This is also why party characters carry
  `+0xD5 = 12` yet effective `+0x198 = 9 / 6` in the saved record (`cok-monster-format.md`).
- `CalcMoves` `0x14EB7`: reads `+0x198` (`0x14EC0`), adds a modifier from a global block
  (`[4B2C]+0x6E4`, when `+0x18A == 0`), clamps `<1` or `>0x60` to 1 (`0x14EE9..0x14EF5`), and
  returns `value << 1` (`d1 e0` at `0x14EFE`). The wrapper then hands the value to the effect-12
  callback (`lcall 0xDB:0x34`, the ledger at `0x6B32`).
- Census: the 88 409-byte records in MON1/2/3CHA.DAX carry `+0xD5` in exactly {6, 9, 12, 15, 24, 30}
  (the neighbouring byte `+0xD4` does not reproduce that alphabet: null in the test).

## Not modelled (and why the fallback is still right for it)

- The `[4B2C]+0x6E4` additive term and the effect-12 callback (haste/slow style modifiers) are
  not applied. Neither is derivable from the MON record, and no native encounter feeds them yet;
  the value used is the unmodified record value, which is what retail computes when both are 0.
- Armour-equipped monsters (item-chain records) would take the `0x3681B` path. Native does not
  load monster item chains.
- Other titles keep `DEFAULT_MOVE_CELLS` (4). DoK/DQK/Pool/Buck/CoAB decoders are untouched.
- (superseded 2026-10-07: CoK party movement now reads +0x198) Party members keep the existing Tier-1 path. Monsters now move up to 30 squares on a 10x10
  grid, so monsters are faster than the (still 4-based) party; closing that is the party-side task.

## Native test

`native/cccombat-test.ps1` `Invoke-CokMoveProbe`: 12 copies of one synthetic CoK record, solid
wall column at col 7 (gap row 9). e11 starts at (8,6) and its round-1 path is a long detour:

| +0xD5 | e11 round-1 moves |
|---|---|
| 1 / 0 / 97 | none (clamped to 1 square) |
| 6 | (8,7) (8,8) (7,9) (6,8) -- cost 2+2+3+3 = 10 of 12 half-squares |
| 12 | same four, continuing to (2,6) -- 24 half-squares |
| (old fixed 4) | (8,7) (8,8) (7,9) -- identical for 6 and 12, the RED case |

RED (HEAD asm): the +0xD5=6 assertion fails (3 moves). GREEN: all pass. All 104 pre-existing
CCCOMBAT traces (including real CoK MON1CHA, DoK, DQK, Pool, Buck) are byte-identical to the
pre-change run.
