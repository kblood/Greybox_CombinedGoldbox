# Pool of Radiance Natural Encounter Route

> Status: P2.1/P2.2 complete and deployed, 2026-07-15. This file is the context-free continuation
> point for executable correlation and Pool persistence.

## Decision Unblocked

Use one naturally reachable Pool encounter to replace the hard-coded OGRE preview as the Pool
Combat promotion gate:

```text
retail GEO cell/search -> ECL monster setup -> COMBAT
                       -> outcome -> exact ECL resume
```

The route is decoded from the already declared Pool exploration area, `ECL1.DAX` block 18. A
real-byte engine golden proves the GEO selector, menu input, combat roster, and resume write. The
browser regression walks there normally, completes tactical combat, and verifies the resumed state.

## Correct Address Model

Pool's structurally matched operand parser is at `GAME.OVR:0x74D3`. It uses ECL address addend
`0x6700`; the equivalent CoAB parser uses `0x8000`. Retail DAX member decoding removes a two-byte
prefix before the VM indexes the buffer.

```text
file_offset = ((virtual_address + 0x6700) & 0xffff) + 2
virtual_address = (file_offset - 2 - 0x6700) & 0xffff
```

This resolves the former low-address `GOTO` anomaly. For example, initial entry `0x9971` maps to
file offset `0x73`, and `GOTO 0x0201` maps to `0x6903`. Do not reintroduce the old linear `0x7FFE`
conversion or infer an opcode-frame difference.

Generated evidence:

- `tools/map_pool_ecl_dispatch.py` and `build/pool-ecl-dispatch-map.json`
- `tools/gen1_ecl_encounter_scan.py` and `build/pool-ecl-encounters.json`
- `research/pool-ecl-dispatch-map.md`
- `research/gen1-ecl-natural-encounters.md`

Runtime contract: `packages/engine/src/ecl/disassemble.ts` exports `ECL_POOL` with the same Gen1
header/opcode framing and `vbase=0x98FE`. Pool's web configuration passes that dialect through both
dungeon initialization and every per-cell `SearchLocation` VM.

Current Pool scan: 335 decoded paths; 259 carry an ECL-local `LOAD_MONSTER` roster.

## Selected Candidate

| Field | Retail value |
| --- | --- |
| Archive/member | `ECL1.DAX#18` |
| Entry | `search_location`, `0x9AB7` (member offset `0x1B9`) |
| Combat | `0xB1A0` (member offset `0x18A2`) |
| Roster | `LOAD_MONSTER (#5, #1, #5)` |
| Roster provenance | Same decoded ECL path after `CLEARMONSTERS` |
| Resume | `0xB1A1`: `SAVE #2 -> [0x4A38]` |
| Static confidence | decoded static path with local roster |
| Runtime status | engine/browser replay proven; original DOS staging currently requests invalid game-area-2/member-18 and does not execute this ECL route |

Decoded path:

```text
9AB7  AND [C04F], #7F -> [6E79]
9AC0  ON_GOTO [6E79] -> AEDB             candidate selector target
AEDB  COMPARE [4A38], #0
AEE1  IF_NE false                         skip guarded instruction
AEE6  SETUP_MONSTER #4, #1, #4
AEED  PRINTCLEAR <inline text>
AF11  HORIZONTAL_MENU [6E79], 3 choices
AF2A  COMPARE [4A35], #FF
AF30  IF_EQ true
AF31  GOTO B181
B181  SAVE #5A -> [6DC6]
B187  CLEARMONSTERS
B188  LOAD_MONSTER #5, #1, #5
B18F  TREASURE ...
B1A0  COMBAT
B1A1  SAVE #2 -> [4A38]                   resume instruction
```

## Proven Replay Inputs

- `GEO1.DAX#18` contains exactly one descriptor whose low seven bits equal 6: cell `(14,8)`, raw
  descriptor `0x86`. It is reachable from the current browser spawn `(9,2)` in 11 legal steps.
- `ON_GOTO` selector 6 reaches `0xAEDB`.
- Initial host state is `[0x4A38]=0` and `[0x4A35]=0xFF`.
- The horizontal menu decodes to `LEAVE`, `GREET`, `ATTACK`; choice index 2 reaches combat.
- Monster record id 5 in Pool `MON1CHA.DAX` is `ORC LEADER` (285-byte record).
- The emitted roster is exactly `{monsterId:5,count:1,picBlockId:5}`.
- Injecting victory resumes at `0xB1A1` and writes `[0x4A38]=2`.
- Regression: `packages/engine/test/dungeonEvents.test.ts`, golden Pool block-18 test.

## Next Substeps

1. **Complete:** `map_pool_behavior_clusters.py` maps the replayed commands to Pool's dispatcher and
   handlers. The parser at `GAME.OVR:0x74D3` is an exact high-confidence cluster with 42 resolved
   inbound calls; most handlers remain local singleton candidates, so no sibling source names were
   promoted. See `research/pool-behavior-clusters.md`.
2. **Branch/COMBAT complete; native victory remains:** the untouched save walks to `(14,10) W`,
   Bashes the flag-2 locked door, enters `GEO2#20` descriptor `0x83` at `(13,10)`, selects ATTACK,
   and reaches native `COMBAT 0xA0B3` (live cursor `0xA0B4`). A new real-byte engine golden proves
   the exact 36-creature roster, injected-victory resume, `[0x4A81]=0xFF`, and clean end. The
   adaptive original run ended in full-party defeat, so original-executable victory-to-exploration
   is still an honest native-only gap. See `research/gen1-dosbox-runtime-trace.md`.
3. Recover a retail-coherent game-area-1/member-18 transition separately, then capture native DOS
   `CS:IP` through the browser-selected ECL1#18 route before upgrading those handlers.
4. Add Greybox save/reload around the proven post-combat state and require pose `(14,8)`, roster,
   `[0x4A38]=2`, encounter outcome, and game time to survive.
5. Locate and test original Pool save import/export fields separately before awarding original-save
   parity; Greybox persistence alone is sufficient for the charter's Persistent level.
6. Reuse the natural-route evidence contract for CoAB and Secret without copying Pool's address base
   or memory seeds.

## Verification Gate

P2.1 and P2.2 are complete: the golden test reproduces the retail route, and the browser traverses it
without selecting a preview monster directly. Pool is now Combat-level in generated support evidence.
