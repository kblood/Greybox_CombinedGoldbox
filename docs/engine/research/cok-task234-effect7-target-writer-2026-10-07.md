# CoK Task234 - earlier writer of the effect-7 target pointer 6C01:0000

**Result: 2026-10-07, closed.** Real Unicorn replay (the Task232 probe, unmodified, exec'd
with a ranged write-watch on physical 399554..399557 = `618B:0008+0A..0D`, host and guest
writes). 69,566,081 instructions, same stop as Task232, ~25 min. No `native/src` edit.
Probe `tools/probe_cok_task234_effect7_target_writer.py` (`--replay` regenerates
`C:\temp\goldbox_task234_effect7_target_writer.txt`, not vendored); tests
`tools/test_cok_task234_effect7_target_writer.py` (15 passed; static and trace layers skip
when GAME.OVR / the log are absent).

## Every writer (20 events, 32 byte writes)

| instr | CS:IP | effect | note |
|---|---|---|---|
| 3,509,344 / 3,509,490..492 | host / 1A46:1670 | bytes 88 77 77 77 | allocator-arena fill (rep stosb), pre-context |
| 54,669,704..707 | 1A46:1670 | -> 00 00 00 00 | context clear (rep stosb, AX=0), the Task233 "clear" |
| 68,559,073 / 074 | 47A3:123C / 1240 | off 0000 -> 0000, seg 0000 -> **016C** | **first writer of 6C01:0000**, DX=6C01 |
| 68,559,096 / 097 | 47A3:125F / 1263 | restore to 0000:0000 | rollback of the temporary set |
| 68,559,114 / 115 | 47A3:4151 / 4155 | seg 0000 -> **016C**, DX=6C01 | **persistent writer** |
| 68,560,916 / 917 | 47A3:123C / 1240 | equal rewrite | |
| 68,560,939 / 940 | 47A3:125F / 1263 | equal rewrite (restores saved 6C01) | |
| 68,777,197 / 198 | 47A3:1B51 / 1B55 | equal rewrite | Task233's "latest writers" |

Nothing writes after 68,777,198 (stop 69,566,081).

## What the writers are (retail GAME.OVR, module base 0x14D6A + ip)

- `47A3:11D4` (file 0x15F3E) is a check-with-candidate routine: saves the old target
  (`[bp-5]/[bp-3]` from `context+0A/+0C`, 1251), writes the candidate `[bp+6]/[bp+8]` at
  123C/1240, calls `00DB:0034`, then restores the saved target at 125F/1263.
- `47A3:4151/4155` (file 0x18EBB) is the persistent set. Source operand: AX/DX from
  `[bp-0Bh]/[bp-9]`, loaded at 410C/4110 from the DS far-pointer table
  `DS:[di+68D1]/[di+68D3]` (4 bytes per entry, `di = 4 * DS:[714C+idx]`). The same
  candidate is first passed to 11D4 at 4134-4138, which is why the temporary set precedes
  the persistent one by 40 instructions.
- 1B51/1B55 is the same store shape (`es:[di+0A]=ax; es:[di+0C]=dx`, DX=6C01) in a later
  routine; all four bytes already held the value.

## Consequences

- The target was live 89,403 instructions BEFORE the selected 167AF entry (68,648,477).
  Task233's "inside the selected invocation" applied to the latest writers only; the
  origin of 6C01:0000 is NOT inside it. It is a DS-table entry selected in `47A3:40xx`.
- Open edge (next): the far pointer stored in `DS:68D1 + 4k` (k = DS:[714C+idx]) and its
  writer. The replay was not extended to that table; 4155's DX=6C01 and AX=0 are the
  runtime values at the hit. Nothing about callback output, damage or RNG is inferred.
