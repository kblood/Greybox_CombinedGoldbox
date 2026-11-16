# CoK Task235 - writer of the DS far-pointer table entry behind the effect-7 target

**Result: 2026-10-07, closed at the first unresolved operand.** Real Unicorn replay (Task232
probe, unmodified, exec'd with a write watch on DS:68D1..+0x400 = physical 0x22531..0x22930, DS=1BC6,
and a code hook at `47A3:4114`, just after the 410C/4110 loads). Same stop as Tasks 232/234, ~25 min.
No `native/src` edit. Probe `tools/probe_cok_task235_effect7_table_writer.py` (`--replay`
regenerates `C:\temp\goldbox_task235_effect7_table_writer.txt`, not vendored); tests
`tools/test_cok_task235_effect7_table_writer.py` (18 passed; layers skip when GAME.OVR / the log
are absent).

## k is computed at the hit, not assumed

The 4114 hook fired 4 times (k = 7, 8, 6, 9). The one that feeds the persistent store
`47A3:4151/4155` (Task234, instr 68,559,114) is the last before it: **instr 68,558,833, DI=0x24,
k = 9**, DS=1BC6, entry phys 140629 = 0x22555 = `1BC6:68D1+0x24`, loaded AX=0000 DX=6C01
(entry bytes `00 00 01 6C`). 4114's `idx714C` bytes at the hit: `10 07 09 09 09 09 0f ...`.

## Writers of entry k=9 (2 byte-pair writes, all guest, none dropped: count 2 < detail cap 12)

| instr | CS:IP | effect | registers before the instruction |
|---|---|---|---|
| 54,755,062 | `33A8:1A33` `mov [di+68D1],cx` | off 0000 -> 0000 | AX=0009 BX=6C01 CX=0000 DI=0024 |
| 54,755,063 | `33A8:1A37` `mov [di+68D3],bx` | seg 0000 -> **016C** | same |

Both precede the hit by ~14.1M instructions, the 47A3 temp/persistent sets by ~13.8M and the
selected 167AF entry (68,648,477) by ~13.9M. Nothing writes the entry again.

## What the writer is (retail GAME.OVR, module base of 33A8 = 0xE19A + ip; 1A33 = file 0xFBCD)

- Source operand: `CX:BX = [bp-0A]/[bp-8]` (1A22), a local far pointer; k = byte `[bp-0Bh]`,
  `di = 4*k` (1A28..1A31). Frame at the write: `[bp]`=3DC6, `[bp+2]`=1D44 (return IP), `[bp+4]`=33A8
  (equals the current CS; far-call CS vs argument is NOT resolved here).
- `[bp-0A]/[bp-8]` was loaded at 1A0C/1A0F from the globals **`DS:[609A]/[609C]`** (19F8..1A0F, same
  load also copies to `[bp-6]/[bp-4]`), guarded by `or ax,[bp-8]` (nonzero), then an `lcall 0614:0479`
  at 1A1D, then the table stores. The same routine goes on to store `es:[di+18A]` to DS:45EA and
  per-k bytes at DS:`[6241+4k]` / `[6242+4k]`. (Static; the 19D3.. branch with `[bp-0Bh]=1` at 19EF is
  one path into that block, but at runtime `[bp-0Bh]` was 9, so k is set by a path not examined here.)

## Open edge (next), nothing inferred

- Value at the table store = DS:`609A/609C` read at 1A0C, 6C01:0000 at runtime. Its writer(s) are
  unexamined; the replay did not watch DS:609A. (Observation only: Task204's hook in the same log
  watches the same physical addresses 21CFA/21CFC and saw other values, e.g. seg 6109 at instr
  27,666,562 from `36AA:19AA`, so the global changes over the run; no relation is claimed.)
- How `[bp-0Bh]` = 9 is set, and who calls 33A8:1A33's routine (return IP 1D44).
