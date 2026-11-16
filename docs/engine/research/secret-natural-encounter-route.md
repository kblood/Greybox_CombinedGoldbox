# Secret of the Silver Blades Natural Encounter Route

> Status: P2.3 Secret route complete and promoted to Combat, 2026-07-15.

## Selected Candidate

Compare-state-aware scanning identifies `ECL3.DAX#97` selector 3 as a short, deterministic natural
encounter. It has one unique matching GEO cell and one local immediate roster. Two nonzero event
cells are unavoidable on the shortest legal browser route; their independent consumed bits can be
seeded without consuming the selected encounter.

| Field | Retail value |
| --- | --- |
| ECL archive/member | `ECL3.DAX#97` |
| Entry | `search_location` (`0x8142`) |
| GEO archive/member | `GEO3.DAX#97` |
| Selector | `mapWallRoof & 0x3F == 3` |
| Unique matching cell | `(12,3)`, descriptor `0x83` |
| Browser-style spawn | `(4,0)`, facing east |
| Reachability | 17 legal directed-edge steps |
| Intermediate safety seeds | `[0x4CD0] |= 0x10` (selector 7), `[0x4CCD] |= 0x20` (selector 6) |
| Target precondition | `[0x4CCD] & 0x04 == 0` |
| Roster | `LOAD_MONSTER (24,8,27)` |
| Monster name | 8 `12 HEADED HYDRA` from `MON1CHA.DAX#24`; picture block 27 |
| Combat | `0x82BB` |
| Resume | `0x82BC`: set `[0x4CCD] |= 0x04`, then `EXIT 0x82C5` |

`0x4CCD` is an ECL logical Area1 word address, not a direct DGROUP byte offset. In the retained
original-DOS run the parser's `ES=54DC` resolves it to `54DC:039A` through
`((0x6A00 + 2*0x4CCD) & 0xFFFF)`, and that 16-bit word changes `0000 -> 0004`.

## Decoded Path

```text
8142  SAVE #50 -> [7EC6]
8148  AND #3F, [C04F] -> [7F79]
8151  ON_GOTO [7F79], 33 targets -> target 3 = 826E
826E  AND [4CCD], #04 -> [7F79]
8277  IF_NE false                       requires target bit clear
8278  EXIT                              guarded instruction, skipped
8279  SETUP_MONSTER #27, #0, #27
8280  PRINTCLEAR <inline text>
82AF  GOSUB 953A                        one-choice horizontal menu
82B3  CLEARMONSTERS
82B4  LOAD_MONSTER #24, #8, #27        8 x 12 HEADED HYDRA
82BB  COMBAT
82BC  OR [4CCD], #04 -> [4CCD]          marks encounter consumed after combat
82C5  EXIT
```

The CFG path has one selector decision and one feasible comparison decision. It does not rely on a
raw `0x24` byte or contradictory repeated comparisons.

## GEO and Reachability Proof

`GEO3.DAX#97` has exactly one plane-2 descriptor whose low six bits equal selector 3: cell `(12,3)`,
raw byte `0x83`. The browser's `chooseStart` algorithm selects `(4,0)`, facing east. Under the
engine's directed-edge rule (a nonzero wall blocks only when its door flag is zero), the selected
cell is reachable in 17 steps:

```text
E E E E E E E E E E S E S S W W W
```

Every legal path from that spawn to the target crosses at least two nonzero intermediate events.
The chosen shortest path crosses selector 7 at `(9,0)` and selector 6 at `(14,3)`. Their handlers
begin with these independent guards:

```text
837A  AND [4CD0], #10 -> [7F79] ; IF_NE ; guarded EXIT
834A  AND [4CCD], #20 -> [7F79] ; IF_NE ; guarded EXIT
```

Seeding `[0x4CD0]=0x10` and `[0x4CCD]=0x20` therefore makes both intermediate handlers exit without
dialogue or combat while leaving target bit `0x04` clear. After victory, `[0x4CCD]` becomes `0x24`.

## Reproduction Inputs

- Retail root: `C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades`
- Candidate artifact: `build/gen1-ecl-encounters.json`
- Scanner: `python tools/gen1_ecl_encounter_scan.py --strict`
- DAX decoder: `tools/goldbox_corpus.py::read_dax_blocks`
- ECL decoder/address conversion: `tools/gen1_ecl_encounter_scan.py::decode_one` and
  `vaddr_to_offset`
- Browser movement contract: `apps/web/src/ui/explore.ts::chooseStart` and
  `packages/engine/src/world/explorer.ts::canMove`

## Promotion Gates

1. **Complete:** the real-byte engine golden proves selector, seeds, exact roster, combat pause,
   victory resume, consumed bit, and clean exit.
2. **Complete:** `?explore=secret-natural` adds ECL3/GEO3 area 97 without replacing the existing
   ECL1#34 Secret preview.
3. **Complete:** Edge walks the legal route through normal controls, asserts the six-unit tactical
   projection of the retail eight-hydra group, completes combat, and verifies `[0x4CCD]=0x24`.
4. **Complete:** the strict corpus contract verifies the descriptor, load opcode, combat opcode,
   title-specific `OR` resume, monster name/layout, engine test, and browser test before awarding
   Combat. Full gates pass: 27 Python tests, 1,575 engine tests, static production smoke, and 90 Edge
   cases. Production bundle `index-C2ETgSCE.js` is deployed at `/greybox/`; support, docs, and the
   natural route return HTTP 200 and live Edge verifies the correct map, spawn, seeds, and zero
   console/network errors.

## Claim Boundary

This is decoded retail-byte reachability plus deterministic Greybox engine and browser replays with
concrete seeds. It is not an original DOS runtime `CS:IP` trace, and semantic executable symbols
must not be promoted from it alone.
