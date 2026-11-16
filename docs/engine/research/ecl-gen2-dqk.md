# Gen2 ECL dialect (The Dark Queen of Krynn) — reverse-engineering notes

**Phase C, C2.** How DQK's `ECL.GLB` event/dialogue/combat scripts differ from the Gen1
(Champions / Death Knights of Krynn) ECL the engine already runs. **Updated verdict:** the
block header differs, most bytecode/framing is shared, and at least two body opcode framings
differ: DQK Gen2 `PARTYSTRENGTH` (`0x1d`) is zero-operand in live traces, and `PARLAY` (`0x2c`)
uses a short four-operand form.

## Container — `ECL.GLB`

`ECL.GLB` is a flat **HLIB `DATA`** library (the same Gen2 container family as `GEO.GLB`),
`magic=1`:

- **member[0]** = id table: `uint16 count`, then `count × {uint16 areaId, uint16 memberIndex}`.
  `count = 47`. The `areaId` is the SAME logical area number `GEO.GLB` uses, so a map and its
  script pair by id (e.g. **area 34 → GEO member 10 + ECL member 20**). The areas that have both
  a GEO map and an ECL script are the dungeon levels: 2, 4, 10, 14, 18, 22, 26, 30, 34, 38, …
- **member[1..47]** = the ECL blocks.

Decoder: `packages/engine/src/loaders/eclGlb.ts` (`decodeEclGlb`) → a `BlockSource` keyed by
logical area id.

## Block header — the ONE delta vs Gen1

| | Gen1 (CoK/DoK, DAX) | Gen2 (DQK, ECL.GLB) |
|---|---|---|
| Magic word | `0x1388` at byte 0–1 | **none** |
| Far pointers | 5 × `{segment 0x0101, vaddr}` at byte 2 | 5 × `{segment 0x0101, vaddr}` at byte 0 |
| Header length | 22 bytes | **20 bytes** |
| Code entry | byte 22 = vaddr `0x8014` | byte 20 = vaddr `0x8014` |
| Virtual base | `0x8014 − 22 = 0x7FFE` | `0x8014 − 20 = 0x8000` |

The five far pointers keep the Gen1 meaning: `[vmRun1, searchLocation, preCampCheck,
campInterrupted, eclInitialEntry]`. `eclInitialEntry` is the slot whose vaddr is `0x8014` (= the
header end); execution starts there.

Modelled as `EclDialect` in `ecl/disassemble.ts`: `ECL_GEN1 = {headerLen:22, vbase:0x7FFE,
hasMagic:true}`, `ECL_GEN2 = {headerLen:20, vbase:0x8000, hasMagic:false}`. The disassembler and
`EclVm` take a `dialect` (default Gen1, so every CoK/DoK golden is untouched).

## Opcode table, operand framing, strings

The opcode table (`KRYNN_GEN1_OPCODES`, 0x00–0x40), the EclOpp operand framing (2-byte `(code,
high)` / 3-byte for code in `{1,2,3}`), and the 6-bit inline string packing are shared in Gen2
except where a dialect-specific opcode frame has been proven. Current proven exceptions:

- `PARTYSTRENGTH` (`0x1d`): Gen1 uses one operand. DQK Gen2 live execution treats this opcode as
  zero-operand in the Palanthas city/Palace route. The filtered DGROUP trace
  `build\dqk-load1000-palanthas-2033-combat.log` shows `[b1c7] = 0x1d` at `b7f9=0x8436`, then
  advances only to `0x8437`; the next byte `0x12` is dispatched separately as `PRINTCLEAR`. The byte
  at `0x8439` is therefore the `PRINTCLEAR` inline-string length (`0x24`), not a `COMBAT` opcode.
  `packages/engine/src/ecl/disassemble.ts` and `tools/dqk_ca03_stream_decode.py` now model this
  DQK-specific frame.

- `PARLAY` (`0x2c`): Gen1 uses six operands (`values[5], dest`). DQK Gen2 uses four operands
  (`values[3], dest`). This is byte-proven in real area 66: `0x83c1` decodes as
  `PARLAY #35, c29:9, #0, 0x0022`, and the next byte at `0x83cb` is the following `COMBAT`
  opcode (`0x24`). Parsing it with the Gen1 six-operand frame consumes the `COMBAT` byte as
  operand data and prevents the shipped encounter from reaching combat.

Evidence on the real `ECL.GLB`:

- **Zero** of the 47 members carry the `0x1388` magic word; every member's far-pointer segment is
  `0x0101` and `eclInitialEntry` = `0x8014`.
- Disassembling each member's far-pointer subroutines from `vbase 0x8000` yields **166 clean EXIT
  terminations** and **446 inline strings that decode to readable English** under the shared 6-bit
  rule (e.g. `"WHERE DO YOU WISH TO GO?"`, `"X POSITION : 0-27"` — note 0-27 = the 28-cell max GEO
  dimension, matching the Gen2 GEO maps).
- Running scripts through `EclVm` with `{dialect: ECL_GEN2}` fires real effects: **area 2** →
  `LOAD_FILES GEO 2` + a `SELECT THE COMBAT WALL TYPE:` menu; **area 4** → the intro narrative
  *"YOUR VOYAGE BEGINS PEACEFULLY. ONE NIGHT YOU SPY DAENOR SPEAKING INTO THE WATER…"*; and
  **area 14** → `LOAD_FILES GEO 14` plus sixteen captured PICTURE script effects.
- The DOS-native `GBBOOT /E /X` path now boots original-layout DQK entries
  1, 2, 3, 4, 5, 7, 14, 18, 22, 26, 30, 42, 46, 50, and 54 far enough to bake a
  `GEO.GLB` map, select DQK wall art, and write a first-person `_GBVIEW.RAW`
  snapshot. Entry 46 is a useful non-identity case: ECL entry 46 emits
  `LOAD_FILES GEO 47` after script flow.

The linear disassembler desyncs after unconditional `GOTO`s (it can't know where a jump-table or
data region begins) exactly as it does on Gen1. The native `/E` bridge treats bad opcodes after a
captured `LOAD_FILES` as completed map-preview handoffs, because those DQK paths already emitted
the host-owned map effect and then landed in packed data. Bad opcodes before a map bridge still halt
as diagnostics; this is not evidence for a new Gen2 opcode.

### CALL routine-id note

The opcode/framing is shared, but real DQK `ECL.GLB` uses low raw `CALL` words
as direct routine ids for the duel setup routines: decoded `CALL 0x0001` /
`CALL 0x0002` appear in blocks 16/36/39/42. Gen1/COAB high/vaddr-style CALL
operands keep the `operand - 0x7FFF` routine-id formula.

## Open follow-ups (not C2)

- A few opcodes' *semantics* (not framing) remain the documented Gen1 assumptions
  (arithmetic operand direction, ON_GOTO selector base) — unchanged by generation.
- `searchLocation`-driven per-cell events for DQK (the Gen2 equivalent of the CoK
  `dialogueForCell` path) — wire into the DQK explore step loop in a later slice (C4).
