# DQK ADD_NPC recruitment route (area 27, member 15) — Task 35

Static analysis plus one DOS-side consumer. No DOSBox trace of the retail game was run for the
semantics below; they come from the ECL bytes and the `DQK.EXE` handler bodies. The native
consumer (`CCHOST /N`, `native/src/cchost_npc.inc`) is measured by `native/cchost-npc-test.ps1`.

## 1. Correction: the guard is `LOAD_PIECES` (0x37), not `CHECKPARTY`

`HANDOFF-DOK-HP-2026-09-24.md` ("Task 35 area-27 Tasselhoff gate") places a six-operand
`CHECKPARTY` at `0x86D4` and reads `[0x00C0]==255` as its fourth/fifth result. That framing is
wrong:

* `0x86B9` is `PRINTCLEAR str[33]` (operand code `0x80`, length byte `0x21`). It consumes
  `0x86BC..0x86DC` and decodes to the readable "YOU AGAIN SEE THE HULDERFOLK KING AND QUEEN."
  The `0x1E` at `0x86D4` is a byte inside that packed string.
* `0x86DD` is `1D` PARTYSTRENGTH. `0x86DE` is `37` with operands `81 CA 01` (`memstr[0x01CA]`)
  and `01 C0 00` (cell `[0x00C0]`): two-operand `LOAD_PIECES` (DQK wordSet 2, handler
  `25a4:31e8`, file `0x0434A8`, per `decompile-dqk-ecl-dispatch.md`).
  `0x86E5 COMPARE [0x00C0],#255`, `IF_NE`, `GOTO 0x8717`, then `0x86F0 ADD_NPC #115,#100`.

## 2. What `0x37` does in DQK (`DQK.EXE` file `0x0434A8`, disassembled)

It is a party-by-name lookup, not a piece loader:

1. Prefetch 2 operands; copy operand 1's string into a local buffer (strcpy at `00d7:2564`).
   Operand 2 supplies the destination cell address.
2. Walk the party's linked records starting at the far pointer `[0xC6E5]`, next-pointer at
   record `+0x00`, with a running index.
3. A record matches when the string equals the record name at `+0x68` (compare at `00d7:2543`,
   file `0x56B3`: returns 1 when the strcmp result is 0) **and** bit 7 of record byte `+0x9B` is
   set. `+0x9B` is exactly the byte `ADD_NPC` writes as `(operand2 / 2) | 0x80`
   (`DQK.EXE:0x04333B`), so only recruited NPCs can match.
4. Result byte: the match index, or `0xFF` when no record matched. If matched and record
   `+0x18B` is zero, bit 7 is also set in the index (a different non-255 value).
5. Store the byte through the operand-2 destination (`0x40992`).

So `[0x00C0]==255` means "this NPC is not in the party", and the route runs `ADD_NPC` only then.
**That is the duplicate guard**: it is a script-level skip, keyed on name plus the NPC flag.

## 3. What `ADD_NPC` does (file `0x04333B`)

`ADD_NPC id, morale`: pass `id` to a far callee (`0x2177:0x2886`) that makes the creature record
the current record (`[0xAD67]`), write `(morale/2)|0x80` to record `+0x9B`, then call
`0x077E:0x0BE2` and the overlay-3 helper `0x1F4E:0x023B` on that record. The callee's insertion
and capacity behaviour were **not** resolved here (see section 6). The id resolves through
`MONCHA.GLB` member 0 (`u16 count`, then `{u16 id, u16 member}`): id 115 -> member 94
(`TASSLEHOFF`, race 5, level byte 22, HP 64, class mask 0x06), id 113 -> member 92
(`GRUNSCHKA`, level 25, HP 134, class mask 0x02). Both records are `isMonster=0` and decompress
(`monchaRLE`, 2-byte big-endian length first) to 472 and 534 bytes.

## 4. What the native side recorded and what it lacked

* `CCECL` `op_addnpc` appends `{id, morale}` to `fx_npc_joins` (GBEF `+82` count, `+84` pairs,
  `NPCCAP` 8). Nothing consumed them.
* On a Gen2 title `op_loadpieces` forwards to `op_script_effect`: it records the event and does
  **not** write `[0x00C0]`. With `SAVE #0,[0x00C0]` just above, the native VM sees `0` and the
  `==255` branch is not taken, so this route never records a join today. A host that feeds the
  party lookup (255 when absent) is needed before CCECL will emit one. That wiring is out of
  scope here (no `gbboot.asm`/`ccecl.asm` edit).

## 5. The consumer: `CCHOST /N <GBEF> <MONCHA.GLB> <GBPR>`

* Validates GBEF magic/version 2..15 and count <= 8, a DQK GBPR (v2, 410-byte rows, flags 1,
  title id 3, schema 1, exact length for the declared count, <= 6 rows) and the HLIB DATA
  envelope of MONCHA.GLB.
* For each join: id -> member via member 0, expand with monchaRLE (expanded length must equal
  the big-endian header), build the compact row, reject a duplicate, take the first unused native
  slot `0x80..0x85`, append. Everything runs on an in-memory copy; the roster is opened for
  writing once, after every join succeeded, and written with one DOS write that only extends it.
* Compact row = slot byte + 409-byte body: name length + upper-cased name at body `+0..15`, and a
  `GBD1` tail at body `+216` filled from the MONCHA record with the same field arithmetic as
  `CCPARTY`'s `build_dqk_qsv_member` (record `+0x198` -> HP, `+0x89` -> max HP, `60-+0xBB` -> AC,
  `+0xB5/B7/B9` damage, `60-+0x87` -> THAC0, `+0x90`/3 clamped 1..4 -> move, `+0x91` -> level,
  class from the `+0xBF` mask). Two **native extension** bytes sit in otherwise-zero padding:
  body `+300` = retail flag byte `(morale/2)|0x80`, body `+301` = NPC id. Retail keeps the flag in
  the live record at `+0x9B`; the compact row has no such field, so this is how the retail
  duplicate test (name + flag) survives a cold reload.
* Exit codes: 0 applied or nothing to do, 1 bad input, 2 party full, 3 duplicate, 4 member
  missing or undecodable.

## 6. Not resolved (stated, not guessed)

* **Retail party capacity and insertion.** `0x2177:0x2886` was not mapped through DQK's overlay
  table; the retail 8-member limit and what a full party does are unproven. The native limit of
  6 is the GBPR row cap, not a retail measurement.
* **Rejecting a duplicate** is a native policy. In retail a duplicate never reaches `ADD_NPC`
  because the script skips it; here the join table is host data, so a repeat is an anomaly.
* The runtime value of `memstr[0x01CA]` (presumably the NPC's name) was not read. The Grunschka
  branch (`0x8717`) tests the result's high flag (`AND #128`) and `[0x0141]`; that variant of the
  result encoding (section 2 step 4) is not modelled.
* The `+0x18B` byte and the other fields `ADD_NPC`'s helpers derive on the record (`0x1F4E:0x023B`)
  have no counterpart in the compact row.
* Current-HP source: the MONCHA record carries `+0x198` and `+0x89` equal (64/64 and 134/134 for
  the two NPCs); the row uses `+0x198` for HP and `+0x89` for max, as `CCPARTY` does for QSV.
* Not wired: `GBBOOT` does not call `CCHOST /N`, no effect from a real CCECL run was fed through
  it (the test authors its GBEF), and no DOSBox run of retail DQK confirmed the recruit appears
  in play.


> Update 2026-10-07: the callee `2177:2886` and the retail party limit (8 members, PCs + NPCs) are now resolved in `dqk-add-npc-full-party.md`; GBPR's 6-row cap is the open cross-tool gap.
