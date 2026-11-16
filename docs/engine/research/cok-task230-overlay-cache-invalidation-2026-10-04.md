# Task230 — refresh translations after DOS overlay reads

**Result: closed 2026-10-04.** The modeled DOS AH=3F handler now invalidates
Unicorn translations overlapping a successful nonempty host write, after the
loaded bytes are written. The probe-only replay confirmed the old call-site
control can be isolated: one cache invalidation at `3DE4:091D`, with no
instruction-pointer or other register rewrite, restores the descriptor-7
instruction boundary and the local `PIC` handoff.

## Shared tracer change and natural replay

`tools/unicorn_cok_midi.py` now calls `uc.ctl_remove_cache(phys, phys +
len(chunk))` only when `chunk` is nonempty, after `uc.mem_write` succeeds. It
leaves the read bytes, `AX` byte count, file position, and DOS carry result
unchanged.

- Probe: `tools/probe_cok_task230_overlay_cache_invalidation.py`, SHA-256
  `1D7CA222884697E0127C5F0725218650082A52BBDEA2F74635E638A93EB20496`.
- Trace: `C:\temp\goldbox_task230_findfirst_code_writes.txt`, SHA-256
  `D60E06697602DCDEA138488C2FB16D2B4407390932CCB13D510A033D70311955`
  (3,364,621 bytes).
- Retail inputs match Task229: `START.EXE` SHA-256
  `e51d88ecef07cffe4a14036de3dbdc6ce7e7ff0db7482f3771d6f99eb7bbb956`;
  `GAME.OVR` SHA-256
  `c3f448c391ea860f97dec99ce88b0b8b0a4a7e807cf3b1f5a8f1515e2a7a0529`.
- The no-key replay made no cache or IP intervention at `091D`. It reached the
  80,000,000-instruction cap at `127F:06E1`, with `blocked=0` and no BIOS block.
  The old malformed FindFirst stop was not observed in this replay.

With automatic file-read invalidation, the runtime path reached a relocated
public handoff at instruction `77,670,328`: `1105:002A` has return
`2935:099F`, `BP=3DDC`, and the local Pascal bytes at `2491:3DD7` are `03 50 49
43` (`PIC`). The public stub jumps to `365C:00E4`, entered at instruction
`77,670,329`. The old `3DE4` caller / `4705` target observers therefore do not
describe the natural fixed run. FindFirst succeeds for `PIC2.DAX` at
instructions `77,684,103` and `77,684,812`, and both file opens succeed. The
runtime then continues to the instruction cap. The cap and its 99 unique
addresses in the final 4,000-instruction sample are recorded without calling
the result a hang.

## Cache-only control at the original caller

To isolate the operation from Task228's combined purge and IP rewrite, the
probe dynamically loads the private pre-Task230 tracer copied from `HEAD` to
`C:\temp\goldbox_unicorn_cok_midi_pre230.py` copied from repository revision
`8f52d49375a790b26315af17daf25684e3a5f697` (SHA-256
`2D1F0E4AE83229414FA41DAD46A3B163F804D5458AA45DB2AEA7D02EF7AC86B0`). That
private copy contains no file-read cache invalidation; the shared tracer kept
the Task230 fix throughout this control.

- Control probe: `tools/probe_cok_task230_cache_only_control.py`, SHA-256
  `5CA33A503DC8FC4A7AC55CA40ED8661C3ECC50A792081E4803CB5308C7516E19`.
- Control trace: `C:\temp\goldbox_task230_cache_only_control.txt`, SHA-256
  `D54B84ABFE97B63C57197129EA49B787DF7CBE4EF232AD1A0E25BD508ADB0805`
  (3,865 log lines).
- It stopped at the prefix procedure entry at instruction `77,574,310`.

At `3DE4:091D` (instruction `77,574,180`) the probe invalidated
`28910..2AB0A` once. The whole-range hash stayed
`10f9ed41c2e054427a0320260c0e76f91472d8dd525fd45d39754fb02bb13ecb`; sampled
bytes were unchanged; all 13 recorded general/segment/IP/stack registers were
identical before and after. The probe made no register writes and recorded
`PC_rewritten=no`.

The live `E9 8B 00` at module `00C5` targets `0153`. The next observed callback
is at `0153`; the call window then observes the `RETF 2` (`CA 02 00`) at
`0165`. Caller `3DE4:0922` and the pre-handoff `3DE4:097F` both have `SP=3DD6`.
At the later public stub, the far pointer at stack `+0C/+0E` is
`2491:3DD7`; the relocated prefix procedure entry at `4705:00E4` reads
`03 50 49 43` (`PIC`) from that address. The control stopped at that captured
entry, so it establishes the pointer/stack handoff without making a claim
about the downstream callback.

The final corpus run against the shared tracer change passed: **5,780 passed,
14 skipped, 24 warnings in 455.69s**. The warnings include the repository's
documented cosmetic Unicorn access-violation traceback.

## Next task

Task231 returns to the queued effect-7 trusted-producer investigation. Use the
cache-corrected tracer and runtime mapping by descriptor/file offset, not fixed
segments. Capture the next genuine producer boundary, owner/target inputs, and
per-byte writers. Keep the 80-million-instruction cap until evidence supports a
longer replay; do not assume the prior malformed FindFirst boundary is the next
useful stop.
