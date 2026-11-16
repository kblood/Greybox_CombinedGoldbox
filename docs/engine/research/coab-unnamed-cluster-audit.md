# CoAB Unnamed Cluster Audit

## Scope and claim boundary

This is an audit of the 25 promoted CoAB clusters for which
`build/goldbox-symbol-candidates.json` has only a `sub_XXXXX` oracle placeholder.
It does not promote any symbol and does not establish a runtime-confirmed name.  A
proposed name below is only a source-reading hypothesis for CoAB, pending the same
retail runtime byte-match trace used for the already-named clusters.

`unit range` is the mapped half-open byte range in the decompiled overlay unit:
`[unit_offset, unit_offset + function_size)`.  The original C# extraction does
not retain an address-to-C#-line mapping for every method it reconstructed; where
that is the case, the table says so instead of fabricating a line correspondence
and cites the exact native-listing range that supplies the evidence.

I also searched `hackdocs_extracted/` (including `GAMEDAT.TXT`, `SCRIPT.TXT`,
`OPCODES.TXT`, `GEODATA.TXT`, `MONST*.TXT`, and `ITEM*.TXT`).  Those community
format documents do not describe any of these internal CoAB helpers by routine,
address, or matching behavior.  Thus they supply no independent naming evidence
for any row; all positive findings are explicitly limited to CoAB's extracted
source/listing.

## Results

| Cluster | Retail offset | CoAB unit range and source location | Classification | Proposed name | Evidence |
| --- | ---: | --- | --- | --- | --- |
| `0f96a64e89a64950` | `GAME.OVR+0x2b150` | `ovr021.cs `coab_extracted/engine/ovr021.cs:150` (the local CoAB study checkout is not bundled). | defensible-candidate | `step_game_time` | The reconstructed declaration already uses this label; it increments the selected `RestTime` slot, normalizes the clock, writes it back, and calls `CheckAffectsTimingOut` (150-172). |
| `1f96f57991a0a35e` | `GAME.OVR+0x3662f` | `ovr024.cs `coab_extracted/engine/ovr024.cs:694` (the local CoAB study checkout is not bundled). | defensible-candidate | `RemoveAttackersAffects` | Direct declaration and body remove exactly `reduce`, `clear_movement`, `affect_8b`, and `owlbear_hug_round_attack` from the passed player (694-702). |
| `29514cc2808e2b0f` | `GAME.OVR+0x8fee` | `ovr008.cs `coab_extracted/engine/ovr008.cs:821` (the local CoAB study checkout is not bundled). | defensible-candidate | `vm_GetMemoryValue` | Direct declaration; dispatches `vm_GetMemoryValueType(loc)` across area, player, area2, ECL, and special-memory cases (821-910). |
| `3291d7ced3e1a112` | `GAME.OVR+0x36267` | `ovr024.cs `coab_extracted/engine/ovr024.cs:515` (the local CoAB study checkout is not bundled). | defensible-candidate | `PC_CanHitTarget` | Direct declaration; removes attacker invisibility, rolls d20, applies attacker/target effects and team bonus, then compares against target AC (515-550). |
| `3ab8ee0f0306a763` | `GAME.OVR+0x366fb` | `ovr024.cs `coab_extracted/engine/ovr024.cs:734` (the local CoAB study checkout is not bundled). | defensible-candidate | `decode_strength` | Direct declaration; converts the encoded 18/00 representation from `Affect.affect_data` into separate base-strength and exceptional-strength outputs (734-748). |
| `3cbd614e9bf93418` | `GAME.OVR+0x3674a` | `ovr024.cs `coab_extracted/engine/ovr024.cs:751` (the local CoAB study checkout is not bundled). | defensible-candidate | `TryEncodeStrength` | Direct declaration; tests whether a proposed strength exceeds the player's current strength and, if so, invokes `encode_strength` (751-768). |
| `3f2f28bcdc2bad41` | `GAME.OVR+0x2a32c` | `ovr020.cs `coab_extracted/engine/ovr020.cs:1349` (the local CoAB study checkout is not bundled). | defensible-candidate | `scroll_team_list` | The C# method takes the input key and moves the selected player through `TeamList` (1349 onward); the corresponding native body branches on `G` and `O` while following the player list (`coab_new.lst` `ovr020:32cf`). |
| `3fdfdf8bb2612ec0` | `GAME.OVR+0x115f5` | `ovr013.cs [0x170e,0x171a)`, no reconstructed C# declaration | genuinely-unnamed | -- | Native listing is an empty prologue/epilogue (`coab_new.lst` `ovr013:170e-1717`) with five arguments and no observable behavior. No C# method can be tied to it without inventing a correspondence. |
| `514e227b27fab1fe` | `GAME.OVR+0x3e127` | `ovr031.cs [0x165,0x184)`, no reconstructed C# declaration | genuinely-unnamed | -- | It only copies four byte arguments into globals at `0x1d534..0x1d537` (`coab_new.lst` `ovr031:0165-0181`). Only the first is identified in `Gbl.cs` as `sky_colour`; the other stored fields have no proven aggregate semantic, so a setter name would overclaim. |
| `5262982bdc67698f` | `GAME.OVR+0x8240` | `ovr008.cs `coab_extracted/engine/ovr008.cs:82` (the local CoAB study checkout is not bundled). | defensible-candidate | `vm_GetCmdValue` | Direct declaration is a one-purpose wrapper returning `gbl.cmd_opps[arg_0].GetCmdValue()` (82-85). |
| `567a797fea95eccb` | `GAME.OVR+0x361ff` | `ovr024.cs `coab_extracted/engine/ovr024.cs:487` (the local CoAB study checkout is not bundled). | defensible-candidate | `CanHitTarget` | Direct declaration rolls d20, gives a natural 20 an automatic effective hit, applies target effects, and compares roll plus bonus to AC (487-511). |
| `6232e681c3c6fa56` | `GAME.OVR+0x38280` | `ovr025.cs [0xbdb,0xc20)`, no reconstructed C# declaration | genuinely-unnamed | -- | The native body tests four player-relative values against a small data table and returns whether any match (`coab_new.lst` `ovr025:0bdb-0c1d`), but does not identify the values or table meaning. `has_any_of_four_values` would only restate implementation, not recover a semantic symbol. |
| `64575716f67acc38` | `GAME.OVR+0x3a7dd` | `ovr025.cs `coab_extracted/Classes/Limits.cs:209` (the local CoAB study checkout is not bundled). | defensible-candidate | `RaceStatLevelRestricted` | The source declaration is explicit and the body checks class level, race, and ability thresholds to return a race/stat level restriction. The mapped unit is ovr025; the extracted implementation was factored to `Classes/Limits.cs` (209 onward). |
| `65ba102bfdaaa3c4` | `GAME.OVR+0x3e664` | `ovr031.cs `coab_extracted/engine/ovr031.cs:222` (the local CoAB study checkout is not bundled). | defensible-candidate | `getMap_wall_type` | The direct C# helper validates/wraps a map coordinate and selects a directional wall field. Its shape matches the native routine's coordinate wrapping and direction-dependent nibble extraction (`coab_new.lst` `ovr031:06a2-07a2`). |
| `6bf844931cb984c5` | `GAME.OVR+0x2bde2` | `ovr022.cs [0x149,0x19e)`, no reconstructed C# declaration | defensible-candidate | `set_player_money_from_gold_value` | Native body clears the selected player's five coin slots, divides its input by five into platinum, and places the remainder in gold (`coab_new.lst` `ovr022:0149-019b`). This is a descriptive proposed name, not a recovered source identifier. |
| `b65803d222802565` | `GAME.OVR+0x390fe` | `ovr025.cs `coab_extracted/engine/ovr025.cs:873` (the local CoAB study checkout is not bundled). | defensible-candidate | `load_missile_icons` | Direct declaration calls `load_missile_dax` four times for normal and attack icon slots (873-879). |
| `bb8fc18cc2ec03e3` | `GAME.OVR+0x3e535` | `ovr031.cs `coab_extracted/engine/ovr031.cs:181` (the local CoAB study checkout is not bundled). | defensible-candidate | `WallDoorFlagsGet` | Direct declaration obtains the selected directional `x3_dir_*` flag after validity checking and 16x16 coordinate wrapping (181-218). |
| `c7b78ba2ac6ec7d5` | `GAME.OVR+0x3e767` | `ovr031.cs `coab_extracted/engine/ovr031.cs:289` (the local CoAB study checkout is not bundled). | defensible-candidate | `get_wall_x2` | Direct declaration validates/wraps a map position and returns `MapInfo.x2` (289-317). |
| `d4d08a523d54d5fd` | `GAME.OVR+0x3dd82` | `ovr030.cs `coab_extracted/engine/ovr030.cs:201` (the local CoAB study checkout is not bundled). | defensible-candidate | `draw_head_and_body` | Direct declaration draws the head and conditionally draws the body at `rowY + 5` (201-212). |
| `da78d6f90264215d` | `GAME.OVR+0x363ee` | `ovr024.cs `coab_extracted/engine/ovr024.cs:601` (the local CoAB study checkout is not bundled). | defensible-candidate | `roll_dice_save` | The native wrapper stores its second argument in `byte_1d2c2`, then calls `roll_dice`; `Gbl.cs:340` names that global `dice_count`, and the C# helper sets `gbl.dice_count` before returning `roll_dice(dice_size, dice_count)`. |
| `e20201a492590936` | `GAME.OVR+0x2c6b2` | `ovr022.cs `coab_extracted/engine/ovr022.cs:260` (the local CoAB study checkout is not bundled). | defensible-candidate | `DropCoins` | Direct declaration subtracts coins and weight from the player and adds them to pooled money after combat or in a shop (260-269). |
| `eb5684410a181f34` | `GAME.OVR+0x3c031` | `ovr026.cs `coab_extracted/engine/ovr026.cs:739` (the local CoAB study checkout is not bundled). | defensible-candidate | `DualClassExceedLastLevel` | Direct declaration returns whether the human current class level exceeds `multiclassLevel` (739-742); the matching Player implementation is `DualClassExceedsPreviousLevel` (`Classes/Player.cs:800-808`). |
| `f29196d4398176c5` | `GAME.OVR+0x2be37` | `ovr022.cs [0x19e,0x1f4)`, no reconstructed C# declaration | defensible-candidate | `set_pooled_money_from_gold_value` | Native body clears five pooled denomination slots, then converts input gold value to pooled platinum plus gold remainder (`coab_new.lst` `ovr022:019e-01f1`). This is descriptive only, not a recovered source identifier. |
| `f88bd99f757979e1` | `GAME.OVR+0x16168` | `ovr014.cs `coab_extracted/engine/ovr014.cs:1674` (the local CoAB study checkout is not bundled). | defensible-candidate | `calc_enemy_health_percentage` | Direct declaration totals current and maximum HP for enemy-team players and stores a percentage in `gbl.enemyHealthPercentage` (1674-1695). |
| `fba932a7bbc2166c` | `GAME.OVR+0x3a711` | `ovr025.cs `coab_extracted/engine/ovr025.cs:1590` (the local CoAB study checkout is not bundled). | defensible-candidate | `GetCurrentAttackItem` | Direct declaration selects a current weapon, arrows, or quarrels according to item-data flags and reports whether an attack item is available (1590-1621). |

## Summary

Twenty-two of 25 placeholder clusters have a defensible CoAB-source candidate name.
Three remain genuinely unnamed: the empty `sub_3B70E`, the four-byte global setter
`sub_71165`, and the opaque four-value predicate `sub_66BDB`.

The 22 names are not runtime-confirmed names.  In particular, the three descriptive
names in this audit (`set_player_money_from_gold_value`,
`set_pooled_money_from_gold_value`, and the source-label candidates generally) must
not be treated as facts about Pool, Secret, or another title.

## Next step

Before any defensible candidate is added to `tools/emit_symbol_candidates.py`'s
named-candidate set, it should pass the same CoAB retail runtime byte-match trace
process: `tools/trace_coab_symbol_bytematch.ps1`.  This document is evidence for
that future trace-and-promotion step, not a promotion itself.
