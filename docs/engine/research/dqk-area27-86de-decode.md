# DQK area 27 `0x86DE`: LOAD_PIECES (0x37), not CHECKPARTY (0x1E) — verdict (T7, 2026-10-07)

Static, against the retail `DQK.EXE` and `DISK3/ECL.GLB` (area 27 = member 15). No DOSBox
trace. Pinned by `tools/dqk_ai_body_pins.py` + `tools/test_dqk_ai_body_pins.py`
(`test_0x86de_*`, `test_dispatch_table_operand_counts_*`, `test_hypothesis_*`).

## Verdict

`dqk-add-npc-route.md` section 1 is **right**; the `HANDOFF-DOK-HP-2026-09-24.md`
"Task 35 area-27 Tasselhoff gate" paragraph (a six-operand `CHECKPARTY` at `0x86D4`, and
"Retail framing corrects the earlier apparent LOAD_PIECES decode") is **wrong**.
`docs/engine/HANDOFF-DOK-HP-2026-09-24.md` is outside this task's write scope and still
carries the wrong text; its paragraph at roughly lines 1345-1350 and 1549-1600 should be
corrected by the integrator.

The instruction stream is:

| vaddr | decode | size |
| --- | --- | --- |
| `0x86B9` | `PRINTCLEAR str[33] "YOU AGAIN SEE THE HULDERFOLK KING AND QUEEN."` | 36 |
| `0x86DD` | `PARTYSTRENGTH` (no operands, PC+1) | 1 |
| `0x86DE` | `LOAD_PIECES memstr[0x01CA], [0x00C0]` | 7 |
| `0x86E5` | `COMPARE [0x00C0], #255` | 6 |

`0x86D4` is a byte inside the packed string (`0x86BC..0x86DC`), not an opcode.

## Evidence (all from the real binary)

1. **Operand counts read from the handlers, not from a tool table.** Table at file
   `0x32A54` (`2033:0d34`), slot = opcode. Slot `0x1D` -> near `0x330A3`: no prefetch call,
   just `inc word ptr [0xB7F9]` (0 operands, PC+1). Slot `0x1E` -> `0x32532`: `mov al,6;
   push ax; push cs; call 2033:0013` (6 operands). Slot `0x37` -> `lcall 1d99:1297` ->
   trampoline `jmp far 25a4:31e8` -> file `0x434A8`: `mov al,2; push ax; lcall 2033:0013`
   (2 operands). Both decodes use the same table; they differ only in where the stream is
   entered.
2. **Boundary.** The PRINTCLEAR at `0x86B9` carries operand code `0x80`, length `0x21`; it
   covers `0x86BC..0x86DC`, and the 33 bytes decode to a readable English sentence. Entering
   at `0x86D4` is entering mid-string.
3. **Control-flow walk.** A boundary walk of all five header entries of member 15 (971
   instructions, verified Gen2 tables) reaches `0x86B9`, `0x86DD`, `0x86DE`, `0x86E5` and
   **never** `0x86D4`.
4. **Population.** Across all 47 `ECL.GLB` members, reachable `CHECKPARTY` (`0x1E`) sites:
   **0**. Reachable `LOAD_PIECES` (`0x37`) sites: **89**, every one with a string operand
   first (`0x81` memstr or `0x80` literal; 77 of them the `memstr, cell` shape used here).
   So `0x37` here is DQK's name lookup (`dqk-add-npc-route.md` section 2), consistent with
   `ADD_NPC` (`0x36`, handler `0x4333B`) following it.
5. **Operand validity.** Under the `CHECKPARTY`-at-`0x86D4` reading the six operand type
   bytes would be `00 12 55 53 1D 81`. The retail prefetch table at `cs:0x68`
   (file `0x31D88`) recognises `{1,2,3,0x80,0x81}` (plus immediate `0` by fall-through): four
   of the six (`0x12 0x55 0x53 0x1D`) are not valid operand codes.

## The null: what the wrong reading would have predicted

* A `CHECKPARTY` reading needs `0x86D4` to be an instruction start. Observed: it is inside a
  length-delimited string and is reached by 0 of 971 walked instructions.
* It predicts at least one reachable `0x1E` somewhere in DQK's scripts. Observed: 0 of 47
  members.
* It predicts valid operand type codes in its six operands. Observed: 4 of 6 invalid.
* Mutation controls (seen RED): flipping the `0x37` handler's `mov al,2` to 3 changes the
  derived count and the decode no longer lands on `COMPARE` at `0x86E5`. Changing the `0x1E`
  handler's 6 to 5 changes the derived count (the count derivation is mutation-tested; the
  decode for that opcode is not exercised, since the area-27 path never executes it).

## Consequence for the area-27 route

The guard is a **name lookup**: `[0x00C0]` is `0xFF` when no recruited NPC node
(`+0x9B` bit 7) has the name in `memstr[0x01CA]`, and `0x86F0 ADD_NPC #115,#100` runs only
then (`dqk-add-npc-route.md` sections 2-3). The "no duplicate guard identified" statement in
the handoff is therefore also wrong: this is the duplicate guard. What still blocks a
*natural* route is unchanged and is **not** settled here: the entry state
(`[0x002D]&127 == 1`, `[0x009F] == [0x00BB] == 0`, `[0x00A2] == 255`) has no demonstrated
retail-save path.
