# DQK ADD_NPC callee 2177:2886 -- party limit and full-party behaviour

Follow-up to `dqk-add-npc-route.md` section 6. Static disassembly of `DQK.EXE` plus a Unicorn run
of the retail bytes (`tools/dqk_add_npc_callee_probe.py`, pinned by `tools/test_dqk_add_npc_callee.py`,
4 passed, mutation-controlled). Not run in DOSBox.

## Where the callee is

`2177` is an overlay buffer segment, not resident code (reading file `0x2400+0x2177*16+0x2886`
gives garbage). The overlay that holds `2177:319D` = `DQK.EXE:0x0362FD` (anchor from
`decompile-dqk-ecl-dispatch.md`) starts at file `0x33160`, so `2177:2886` = file `0x359E6`, which
begins `55 8B EC` (a real prologue; no other offset tried had one). Disassembly:

```
2886 push bp ; mov bp,sp ; sub sp,4
288C les bx,[B20F]            ; far ptr to the game-state struct
2890 cmp byte es:[bx+20],7    ; party member count
2895 ja  28F4                 ; count > 7  -> return, nothing done
     alloc 0x19E record (0DF9:02FC) ; near call 257C(id,1,rec) loads the MONCHA record
28C0 call far 2177:3491(rec)  ; link into the party list
28CD or byte es:[bx+9B],80    ; NPC flag
28D9 mov es:[bx+BD],id        ; remember the NPC id
28DE msg: 104C:00DF(id, rec+C5, ds:6005)   ; the join message
```

`2177:3491` appends the record at the tail of the linked list headed by `[C6E5]`, then assigns
`rec+0xC5` the **lowest free index in 0..7** (8-byte occupancy scratch, index 8 if all taken), then
`inc byte [[B20F]+20]`. The load-save routine (`2177:28F8`) zeroes `+0x20` and re-inserts each
record through the same `3491`, so `+0x20` is the party member count (PCs and NPCs together).
Other code agrees: `DQK.EXE:0x482AF` tests `cmp [+20],8 ; jae`, `0x48331` tests `cmp [+20],7 ; ja`.

## Measured (Unicorn, retail bytes, leaf calls stubbed)

| case | count before | result |
|---|---|---|
| 6 members | 6 | inserted, count 7, new slot 6, flag `+9B`=0x80, `+BD`=115, msg called |
| 7 members | 7 | inserted, count 8, new slot 7 |
| 8 members (full) | 8 | **no-op**: no alloc, no load, no message, list and count unchanged |
| count byte 255 | 255 | no-op (`ja` is unsigned) |
| slots {0,1,3} | 3 | inserted at slot 2 (lowest free) |
| empty party | 0 | inserted, slot 0 |
| MUT gate imm 7->6 | 7 | no-op (flips) |
| MUT `ja` nopped | 8 | inserted with slot 8, count 9 (flips) |

## Answers

* **Retail limit is 8 members total (PCs + NPCs), not 6.** The callee refuses only when the count
  is already >= 8. "6 PCs + 2 NPCs" is consistent but the callee itself does not distinguish PCs from
  NPCs; it is a single 8 cap on the shared count.
* **Full party is a silent skip**: no error, no message, no partial state. A script's `ADD_NPC`
  simply has no effect. It is not an abort.
* **`+0x18B`** is a field of the loaded creature record (the record is 0x19E bytes copied straight
  from the decompressed MONCHA member). In the two recruit members (94 Tasslehoff, 92 Grunschka)
  `dec[0x18B]` = 1. The callee never reads or writes it; its only consumer on this route is the
  `0x37` party lookup (bit 7 of the result when it is zero), so for these NPCs the result is a plain
  index. Meaning of the byte itself (79 compares across the EXE) is not resolved.
* The record's own `+0x9B` in MONCHA already equals `(morale/2)|0x80` (178 for id 115, 172 for 113).
  The callee ORs 0x80 and the handler then overwrites with `(operand/2)|0x80`.
* Helper `1F4E:023B` (post-insert derived fields) and the join message text (`ds:6005`) are not read.

## Flag: GBPR cross-tool revision needed (not built)

`CCHOST /N` rejects the 7th and 8th member (exit 2 "party full") because GBPR v2 caps at 6 rows.
Retail accepts joins until 8 and, beyond that, skips silently rather than failing. Matching retail
requires GBPR to hold 8 rows (header count check, `NPC_ROSTER_MAX`, every GBPR reader/writer in
`CCPARTY`, `GBBOOT`, `CCCOMBAT`, which are outside this task's write list) and, at the retail cap,
exit 0 without write instead of exit 2. At the native cap of 6 a "silent skip" would be wrong
(retail adds there), so no `CCHOST /N` test that fails on HEAD is expressible today and
`cchost.asm`, `cchost_npc.inc` and `cchost-npc-test.ps1` are unchanged.

Status: **bounded, partly resolved.** Callee gate, limit and insert semantics are pinned with
controls; the capacity mismatch is flagged; not wired into a DOSBox run of retail DQK.
