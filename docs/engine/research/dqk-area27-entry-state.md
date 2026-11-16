# DQK area 27 entry state: is `0x86F0 ADD_NPC` reachable from the retail save? (T9, 2026-10-07)

Static only: retail `DISK3/ECL.GLB`, `DISK3/GEO.GLB`, `SAVGAMA.QSV`. No DOSBox, no engine change.
Tool: `tools/dqk_area27_entry_state.py`. Pins: `tools/test_dqk_area27_entry_state.py` (11 tests).

## Verdict: (b) NOT established statically. Exact unresolved guards named below.

The task's stated entry state ("`[2D]&127==1`, `[9F]==[BB]==0`, `[A2]==255`") is partly
inaccurate, and no natural route to it is demonstrated or refuted.

## Facts established (denominators in brackets)

1. **Writers of the four cells** over reachable instructions of the 47 ECL members (48 HLIB
   members incl. the id table): `[2D]` 0, `[9F]` 43 (areas 2,3,5,10,14,15,16,27,30,34,38,42,43,
   51,62,65,66), `[BB]` 8 (areas 15,27,64,65), `[A2]` 38 (areas 10,14,15,16,18,26,27,28,35,43,
   46,49,50,51,63,67). Unmodelled roles: 0 of 89. SAVE immediates: `[9F]` {0,1,2,99,255};
   `[BB]` {0,1}; `[A2]` {0,1,4,5,7,30,35,50,54,55,56,100,101,250,255}.
2. **`[2D]` is host-supplied.** Zero ECL writers; it is the stepped map cell's descriptor.
   `[2D]&127 == 1` needs the party to step a GEO plane-2 cell of low-7 value 1. Area 26
   (22x22, member 14) has exactly **3 of 484** such cells, all raw `0x81`: (7,11), (7,12),
   (7,13). So the guard is satisfiable by the map, not by script.
3. **Literal NEWECL chain** 1 -> 5 -> 26 -> 27 exists (shortest). Four NEWECL sites are
   dynamic (non-immediate or unresolvable): area 1 `0x8429`, 61 `0xA9C1`, 63 `0x8071`,
   64 `0xA1A5`. Area 26 reaches NEWECL #27 at `0x9C70` via slot 1 (`0x96E7` -> `0x975C` ->
   `AND #127,[2D],[9B]` -> ON_GOTO case 1 -> `0x9B82` -> typed riddle answer "GEBENE" ->
   `GOSUB 0xA30C` -> NEWECL).
4. **Within area 27 alone**, the abstract interpreter reaches `0x86F0`:
   - 0 of 5 slots if every cell starts at 0 (uncapped, so exhaustive for that model);
   - with unknown initial cells, only slot 1, 5 route variants, all needing a host-cell
     condition (`[2D]&127 == 1` or `>= 12`); slot 0: none. (The 100k state cap is hit on that
     run; routes are a lower bound, absence is not claimed there.)
5. **`[9F]` is not a path condition** and `[A2]` only needs 255 or >= 2 at slot 1, per the
   decode of the area-27 guards. The LOAD_PIECES name lookup (`0x86DE`, see
   `dqk-area27-86de-decode.md`) must also return 255, i.e. no recruited NPC node with
   `+0x9B` bit 7 and that name.
6. **The shipped save carries no ECL-cell dump.** `SAVGAMA.QSV`: 7965 bytes, 6 roster records
   (SIR DRYDEN, JORIS THE WISE, LENDUIRA, neacail, ALARIC THE BOLD, MAIGUREIGNE) ending at
   4242, 3723-byte tail, header area byte 0 and ECL member byte 0. None of the 6 records has
   the `+0x9B` bit 7 set, so the LOAD_PIECES guard passes for the shipped party. The four cells'
   values in the save are unmeasured (the tool reports 0 only as the header-field read, not a
   decoded memory image).

## Not established (and why)

* Multi-invocation routes from area 1 (1 -> 5 -> 26 -> 27) were attempted with a path-sensitive
  interpreter. Over 2 invocations restricted to areas {1,5,26,27}: 0 routes, not capped. Over 3
  invocations the 60k state cap is hit (result 0 routes, **capped**, so no claim). Area 5 slots
  0/1 explode on menu answers. Absence of a route is therefore not shown.
* Whether area 26 leaves `[A2]` in {255 or >= 2} for area 27 slot 1: analysis of the `0xA300`
  table-copy region was begun, not completed.
* The retail initial values of `[A2]`, `[BB]`, `[9F]` (point 6).

## Measurement that would settle it

DOSBox-X GameLink memory read of ECL cells `0x2D, 0x9F, 0xBB, 0xA2` right after loading
`SAVGAMA.QSV` and again after answering the area-26 riddle (stepping one of the three
cells above). Out of scope here (no DOSBox).

## Nulls and controls

* Census null: writer counts are over the same boundary-walk reachable set the other DQK
  scanners use; 0 unmodelled of 89 rows.
* Zero-init versus unknown-init runs are reported separately because they differ (0 vs 5 routes
  for slot 1); a claim that holds under only one is labelled so.
* Mutations seen RED (byte-exact backup of the tool, restored and compared with `cmp`):
  CELLS 0xA2->0xA3 (3 tests red); `READ_ONLY_OPS` emptied of 0x03 (writer-count test red);
  NEWECL opcode 0x20->0x21 (chain test red); literal-mode byte 0->9 (chain test red);
  `QSV_ROSTER` 1039->1040 (QSV test red); interval-lo/hi update removed (interval test red);
  `NEG` EQ->EQ (slot-1 route test red); `IF_OPS` EQ/NE swapped (map pin red, route test
  survives, i.e. that mutant is equivalent for the routes pinned and only the map pin catches it).
  Two mutants survived the first pin set (a dead constant `CHAIN_MNEMONIC`, now deleted, and an
  equivalent `READ_ONLY_OPS` addition shadowed by `WRITE_POS`).
* Data pins (opcode bytes at `0x86DE/0x86E5/0x86F0`, area 26 `0x9C70`, GEO cells) are direct
  byte/cell equalities; their RED case is the data itself differing.
