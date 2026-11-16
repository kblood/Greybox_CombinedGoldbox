# Curse of the Azure Bonds Natural Encounter Route

> Status: P2.3 CoAB target complete 2026-07-15; full prerequisite-combat walk corrected and
> selected-folder release acceptance added 2026-07-31.

## Selected Candidate

The strongest currently actionable CoAB route is not the existing exploration preview in
`ECL2.DAX#1`. Compare-state-aware CFG scanning proved that preview block's former `0x9482`
search path impossible: it required `IF_EQ` to be both false and true without a new comparison.

| Field | Retail value |
| --- | --- |
| ECL archive/member | `ECL4.DAX#37` |
| Entry | `search_location` |
| GEO archive/member | `GEO4.DAX#37` |
| Selector | `mapWallRoof & 0x3F == 20` |
| Unique matching cell | `(5,3)`, descriptor `0x94` |
| Browser-style spawn | `(6,6)`, facing north |
| Reachability | 26 legal directed-edge steps |
| Runtime seed/state | Fresh `[0x4CF0]=0`, `[0x4CF4]=0`; the complete walked route ends at `[0x4CF0]=0x08`, `[0x4CF4]=0x4C` |
| Roster | `LOAD_MONSTER (39,3,39)` + `(37,5,37)` |
| Monster names | 3 HOODED MEDUSA + 5 GRIFFON from `MON4CHA.DAX` |
| Combat | `0x88FE` |
| Resume | `0x88FF`: `GOTO 0x9529`; cleanup reaches `EXIT 0x9533` |

## Decoded Path

```text
823F  AND #3F, [C04F] -> [7F79]
8248  ON_GOTO [7F79], 43 targets -> target 20 = 88A1
88A1  AND [4CF4], #08 -> [7F79]
88AA  IF_NE false                       requires bit 3 clear
88AB  GOTO 9529                         guarded instruction, skipped
88AF  ADD #08 -> [4CF4]                 marks encounter consumed
88B8  SETUP_MONSTER #39, #0, #49
88BF  PRINTCLEAR <inline text>
88DD  CLEARMONSTERS
88DE  LOAD_MONSTER #39, #3, #39         HOODED MEDUSA
88E5  LOAD_MONSTER #37, #5, #37         GRIFFON
88EC  TREASURE ...
88FE  COMBAT
88FF  GOTO 9529                         exact resume
9529  PICTURE #FF
952C  PRINTCLEAR <empty>
952F  CALL 2E10
9533  EXIT
```

## GEO Proof

`GEO4.DAX#37` has exactly one plane-2 descriptor whose low six bits equal selector 20:
cell `(5,3)`, raw byte `0x94`. Using the same movement rule as `Explorer`, it is reachable from
`chooseStart`'s deterministic `(6,6)` spawn in 26 steps:

```text
E S S E E E E E E N N N E E N W W W N W W W W W W W
```

Those edges are legal, but they are not event-free. The corrected browser replay waits for and
resolves every queued combat instead of issuing later movement while the tactical overlay is still
loading:

1. selector 31 at `(7,7,S)`: MANTICORE x3, setting `[0x4CF0]=0x08`;
2. selector 25 at `(13,8,E)`: OTYUGH x1, setting `[0x4CF4]=0x40`;
3. selector 0 at `(12,3,N)`: the deterministic wandering arm, MANTICORE x4;
4. selector 19 at `(6,3,W)`: `NOISE COMES FROM THE WALL TO THE WEST.`, adding `0x04`;
5. selector 20 at `(5,3,W)`: the target encounter, adding `0x08` for exact `[0x4CF4]=0x4C`.

The counts above are Greybox's explicit cell-seeded replay, not a claim that its substitute RNG
matches the original executable's random continuity or probability.

## Scanner Correction

`gen1_ecl_encounter_scan.py` now carries possible signed comparison outcomes through successive
`IF_EQ/NE/LT/GT/LE/GE` instructions. A regression rejects contradictory branches from one unchanged
`COMPARE`. Regeneration removed 24 impossible paths across the Gen1 corpus (2,257 -> 2,233),
including the former CoAB `ECL2#1` candidate.

## Next Substeps

1. **Complete:** the real-byte golden enters `search_location` with descriptor `0x94` and
   `[0x4CF4]=0`, asserts the exact two-group roster, consumed flag `8`, pause at `0x88FE`, victory
   resume, clean event end, and retained consumed flag.
2. **Complete:** `?explore=coab-natural` adds the ECL4/GEO4/WALLDEF4/8X8D4/MON4CHA route without
   replacing the existing `ECL2#1` exploration smoke.
3. **Corrected complete:** Edge walks the 26-step path in four synchronized legs, resolves and
   asserts all three prerequisite rosters, checks the target tactical roster, completes combat, and
   verifies exact `[0x4CF0]=0x08` and `[0x4CF4]=0x4C` after resume. The earlier tight action loop
   could outrun async combat launch and therefore did not prove the intermediate route events.
4. Repeat compare-state-aware candidate selection for Secret using the reusable golden contract.
   exists.

## Claim Boundary

This is decoded, byte-verified reachability plus deterministic Greybox engine and browser replays
with concrete seeds and retail monster records. It is not an original DOS `CS:IP` trace.
