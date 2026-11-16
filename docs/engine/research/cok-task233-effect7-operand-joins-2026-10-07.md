# CoK Task233 — effect-7 allocation and target-pointer operand joins

**Bounded result: 2026-10-07.** No replay was run and no `native/src` edit was made.
The probe decodes retail `GAME.OVR` bytes and joins them to the committed-hash Task232
trace (`C:\temp\goldbox_task232_effect7_input_provenance.txt`, not vendored; trace checks
skip when it is absent). Probe: `tools/probe_cok_task233_effect7_operand_joins.py`;
tests: `tools/test_cok_task233_effect7_operand_joins.py` (12 passed).

## Allocation join (body context pointer)

- Retail bytes: `F2A3 b8 16 00 50` (push 16h), `F2A7 9a 3f 02 46 0a` (far call
  `0A46:023F`, load segment +1000 = `1A46`), `F2AC c4 7e fc` (`les di,[bp-4]`),
  `F2AF 26 89 85 83 01` (`es:[di+183],ax`), `F2B4 26 89 95 85 01` (`es:[di+185],dx`).
- Trace: F2AC hit at instruction 54,669,677 has AX=0008; F2B4 hit at 54,669,679 has
  ES:DI=62FD:0000; the context-clear entry at 54,669,682 reloads `body+183` and sees
  ES:DI=618B:0008. So AX=0008 and (via the reload) DX=618B were stored into body
  `62FD:0000`. DX is not printed directly at F2AC; 618B is derived from the reload.
- The allocator body at `0A46:023F` was not decoded; only its call site and return
  registers are claimed.

## Target-pointer join

- Retail bytes: `168AD 8b 46 10 8b 56 12` (source `[BP+10]/[BP+12]` -> AX/DX),
  `168B3 c4 7e 14` (destination body `[BP+14]`), `168B6 26 c4 bd 83 01` (body+183 ->
  context), `168BB 26 89 45 0a`, `168BF 26 89 55 0c` (stores at context+0A/+0C).
  Far-call entry offsets: `[BP+10h]=SP+0Eh`, `[BP+14h]=SP+12h`.
- The selected 167AF entry (68,648,477) is the 4th and last of four entries before the
  stop (57,112,036 / 62,284,753 / 63,161,448 / 68,648,477). Its stack bytes give source
  `6C01:0000` at SP+0E and destination `62FD:0000` at SP+12.
- Latest guest writers of `618B:0008+0A..0D` (physical 399,554..399,557) are
  `47A3:1B51` (offset bytes, instruction 68,777,197) and `47A3:1B55` (segment bytes,
  68,777,198): inside the selected invocation (entry < writes < stop 69,566,081) and
  nothing wrote them afterwards. Stored bytes `00 00 01 6C` = `6C01:0000`, the source.

## Open edge (first unresolved upstream operand)

All four bytes show `before == after` at the 1B51/1B55 stores: the context target
already held `6C01:0000`. The trace keeps only latest writers, so the earlier writer
(between the 54,669,682 clear and 68,777,197) is not identified. Nothing about
callback output, damage or RNG is inferred.
