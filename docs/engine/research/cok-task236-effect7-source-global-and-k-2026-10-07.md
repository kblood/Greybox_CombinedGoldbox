# CoK Task236 - who writes DS:609A/609C, how k=9 arises, who calls 33A8:17F7

**Result: 2026-10-07.** Real Unicorn replay (Task232 probe, unmodified, exec'd with a write watch on
DS:609A..609D = physical 0x21CFA..0x21CFD and code hooks in overlay segment 33A8), same stop as
Tasks 232-235, ~25 min, no `native/src` edit. Probe `tools/probe_cok_task236_effect7_source_global.py`
(`--replay` regenerates `C:\temp\goldbox_task236_effect7_source_global.txt`, not vendored); tests
`tools/test_cok_task236_effect7_source_global.py` (23 passed with GAME.OVR + log; without the log 13
passed / 10 skipped).

## Correction to Task235's open edge

Task235 read the table-store source `[bp-0A]/[bp-8]` as "= DS:[609A/609C] (6C01:0000)". That is only
true for the **first** node. `[bp-0A]/[bp-8]` is a **list cursor**: loaded from DS:609A/609C once
(33A8:19F8..1A0F), then advanced at 1C1C by `les di,[bp-0A]; ax=es:[di+17F]; dx=es:[di+181]` (a
next-link at +0x17F). DS:609A/609C itself stayed **0000:6109** for the whole walk. The k=9 entry
6C01:0000 is the 9th node reached through next-links, not a value anyone stored into 609A.

## Writers of DS:609A/609C (whole replay, 4 guest writes, 0 host, none dropped: 4 < cap 400)

| instr | CS:IP | effect |
|---|---|---|
| 352,297 / 352,298 | `30A9:0571` / `30A9:0574` (`mov [609A],ax` / `[609C],ax`, ax=0) | clear 0000:0000 (init block; file 0x10609) |
| 27,666,561 | `36AA:19A7` `mov [609A],ax` | 0000 -> 0000 |
| 27,666,562 | `36AA:19AA` `mov [609C],dx` | 0000 -> **6109** (DX=6109) |

The `36AA:19A7` block (file 0x1C41A, module base 0x1AA73 derived from the byte match) is a list
unlink: it compares head `[609A/609C]` with the node `[6096/6098]` (1986..1997), and if equal sets head :=
that node's next link (`[bp-0C]/[bp-0A]`, loaded from `es:[di+17F/181]` at 1972..1983). All 609A writes
precede the routine entry (instr 54,681,003) by ~27M instructions; none happens during the walk.
Static: `mov [609A],ax` (`a3 9a 60`) occurs at 8 file offsets in GAME.OVR (0x10609, 0x10A46, 0x1C41A,
0x1C48F, 0x1C53B, 0x1C58B, 0x1F082, 0x23E0D); only the first and third executed before the stop.

## How [bp-0B]=k reaches 9 (routine 33A8:17F7..1C44)

- Only five stores to `[bp-0B]` exist in the routine (byte-pattern scan): 180A `:=1`, 1810 `inc` (init loop
  zeroing DS:`[6242+4k]` until k==0xFF), 19EF `:=1`, 1BA0 `inc`, 1C15 `inc`.
- Runtime: 180A at instr 54,681,280 (k 0 -> 1); init loop leaves k=0xFF; **19EF at instr 54,712,653 sets
  k=1** (once; reached through the chain of tests `[bp-1]==0A`, `[bp-2]==5`, `[bp-0C]==3`, `[45EA]==1`
  at 19CA..19EA - this chain was not decoded further); then every list step is **1BA0** (15 hits, instrs
  54,715,084 ... 54,873,611 pinned in the probe), 1C15 never ran. k=9 is therefore the 9th node:
  eight 1BA0 steps after 19EF, the 8th at instr 54,755,011.
- 1A12 loop head: 16 hits, k=1..16; node k=1 = head 6109:0000 (== DS:609A at that time); nodes
  6109:0000, 6298:0000, 62FD:0000, 66AA:0008, 66C4:0008, 687E:0000, 68E3:0000, 68FD:0000,
  **6C01:0000 (k=9)**, 6C1B:0000, 6C80:0000, 711F:0008, 7139:0008, 7153:0008, 716D:0008, then null
  (exit 1C32, k=0x10). 1A33 stored 15 entries; the k=9 store is instr 54,755,062 = Task235's write.

## Caller of the routine (return IP 1D44)

`33A8:1D40 push cs; 1D41 call 17F7` (`0e e8 b3 fa`; 1D44 + 0xFAB3 = 0x17F7), hit once at instr
54,681,002, entry `17F7` (`55 89 e5`) at instr 54,681,003, stack at entry `441d a833` = ret IP 1D44 and
the **pushed CS 33A8** - which resolves Task235's "far-call CS vs argument": `[bp+4]=33A8` is the
`push cs` of the Borland near-call-in-overlay idiom, not a far-call CS. Caller bp = 3DC6 (matches
Task235's saved-bp). The caller is the startup body at 1C57.. (frame setup, `call 1029`, `call 10D9`,
then `call 17F7`, each followed by `lcall 0614:0479`).

## Verified vs still open

Verified (pinned, mutation-tested): everything above, each with instr numbers and registers in the
tests; static bytes pinned for all sites.

Still open (not inferred):
- Who/what the node at `[6096/6098]` is in the `36AA:19A7` unlink and which caller reached it: the
  frame at the write shows `[bp+2]`=1942, `[bp+4]`=36AA, but 1942 is mid-instruction in the 36AA
  disassembly I aligned (the prologue search is unreliable), so the caller of that routine was NOT resolved.
- What built the node chain (the +0x17F next links; who allocated/linked 6109..6C01 nodes) - not watched.
- Why the 19EF branch (`[bp-1]=0A`, `[bp-2]=5`, `[bp-0C]=3`) is the one taken; nodes' contents beyond +0x17F/+0x189/+0x18A/+0xCF.
- 6 of the 8 static 609A store sites did not execute before the stop; the replay says nothing about them.
