# Pool of Radiance opcode 0x31: no SHORT_MENU contract exists (item 53)

Date 2026-10-07. Verdict: **Pool of Radiance's `0x31` is the zero-operand
`SPRITE_OFF`, not a menu. There is no SHORT_MENU frame to establish, so no
engine code was changed.** Treasures was not examined (out of scope; stays
record-only).

## Evidence

1. **Handler bytes.** `POOLRAD/GAME.OVR` file `0x37E8` (the `0x31` entry in
   `pool-ecl-dispatch-map.md`), disassembled with capstone (16-bit):

   ```
   37e8 push bp / mov bp,sp
   37eb inc  word [0x49ed]          ; cursor past the opcode byte
   37ef cmp  byte [0x84e3],0
   37f4 je   0x3805
   37f6 lcall 0x3ca:0x25            ; sprite clear
   37fb mov  byte [0x84e3],0
   3800 mov  byte [0x84e0],0
   3805 pop bp / retf
   ```

   It never calls the operand parser (`2b:002a`). Pool's `0x2B` handler
   (`0x1E17`) starts with `push 2` + that parser call. Contrast Buck Rogers,
   where `0x2B` and `0x31` share one compiled handler (`0x1adf`), which is what
   justified its menu frame. Pool's two handlers are distinct and `0x31` takes
   no operands.
2. **Corpus.** CFG-reachable `0x31` sites in Pool `ECL1..8.DAX` under the
   zero-operand frame: 45 (2/3/2/1/8/7/11/11 per file). Every one is followed
   by a byte that is itself a decoded reachable instruction (e.g. `0x2D`,
   `0x09`, `0x0E`, `0x02`). Under the menu frame (`dest,count,+inline strings`)
   **0 of 45** sites give a structurally valid, printable-label menu
   (45 bad). Measured with `tools/gen1_ecl_menu_capacity_scan.py` helpers.
3. **Prior record agrees.** `gen1-ecl-extended-opcodes.md` section 8 and
   `tools/gen1_ecl_encounter_scan.py` already restrict `SHORT_MENU` to DoK,
   Pools of Darkness and Buck, citing Pool as the LONG-family counterexample
   (100/161 labels, visible desync).

## Ruled out

- A Pool menu route: none exists, so there are no two answers whose
  continuations could be distinguished.
- A Pool title-marker gate for `0x31` menu parsing: `POOL.CFG` would only
  enable a misparse (it would consume operand bytes the game never reads).
- Re-using DoK/PoD or Buck framing for Pool: refuted by items 1 and 2.

## State of native code

`native/src/ccecl.asm` already treats Pool `0x31` correctly: `short_menu_opframes`
stays 0 under `POOL.CFG`, so `0x31` dispatches to `op_script_effect` with the
default table's zero-operand `SPRITE_OFF` entry. `ccecl.asm`, the capacity
test, and the 348-byte headroom are untouched. Item 53 can be closed for Pool
as "not a menu; correctly handled as SPRITE_OFF". Treasures remains open.
