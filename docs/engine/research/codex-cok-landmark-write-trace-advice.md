# Memo: next CoK native experiment

## Recommendation

Run a **pre-load Area1 memory-watch trace against the real completed save**. Arm DEBUGBOX `BPM` breakpoints while the completed save is still at the `LOAD WHICH GAME` prompt, then let the original loader populate Area1. This requires no playable post-load dungeon and directly distinguishes bulk save restoration from a later host-side setter.

## Evidence

- **Fact:** The fully automated caravan/combat/treasure/survivor/re-entry branch leaves all six landmark words zero. [docs/engine/research/cok-improvement-loop.md](cok-improvement-loop.md#L316)
- **Fact:** The completed save supplies the later state, while the corpus scan finds no statically reachable ECL setter for `0x4c5c` or `0x4c7d`. [docs/engine/research/cok-improvement-loop.md](cok-improvement-loop.md#L338)
- **Fact:** Area1 offsets use `(0x6a00 + address*2) & 0xffff`; the locator explicitly treats physical bases as process-local. [tools/locate_coab_area1_in_ram.py](../../../tools/locate_coab_area1_in_ram.py#L20)
- **Fact:** Correct DEBUGBOX practice is to arm only while demonstrably stopped and require `BPLIST` to report `BPMEM`; commands issued while running can silently fail. [tools/trace_secret_begin_selector.ps1](../../../tools/trace_secret_begin_selector.ps1#L433)
- **Inference:** The source-compatible CoAB loader reads one byte followed by the complete `0x800`-byte Area1 record. CoK probably performs either a direct read or a host copy of the same shape, but only this trace can establish which. `coab_extracted/engine/ovr017.cs:976` (the local CoAB study checkout is not bundled).

## Concrete protocol

1. Hash the complete input stage, copy it into a unique output-owned runtime directory, and launch `LOADFIX -32` plus `DEBUGBOX START.EXE`. Recheck the source manifest afterward, following [tools/trace_cok_clock_candidate.ps1](../../../tools/trace_cok_clock_candidate.ps1#L71). Use GameLink exclusively for game input.

2. Navigate automatically to `LOAD WHICH GAME`, but stop before selecting slot A. DEBUGBOX's F5 is **Run**, not pause; arm `BPINT 16` before launch and use its confirmed keyboard-read/poll stop as the safe GameLink-only pacing boundary. Reject the run unless the console is demonstrably stopped.

3. Do **not** treat the pre-load `DS:[0x4b28]` value as the resident Area1 address without an exact match. The 2026-07-27 live probe saw `50f7:0000`, a zeroed staging buffer; another session's post-load exact Area1 record had been at physical `0x48b50`, proving resident addresses are process-local. First trace the loader's pointer transition (or exact-match Area1 after load in that same session), then compute watches from that address.

4. Arm three low-byte watches:

| Word | Area1 offset | If base is `0x48b50` |
|---|---:|---|
| control `0x4c26` | `0x24c` | `BPM 48B5:024C` |
| host prerequisite `0x4c5c` | `0x2b8` | `BPM 48B5:02B8` |
| host prerequisite `0x4c7d` | `0x2fa` | `BPM 48B5:02FA` |

   Construct aliases from the **same-session verified resident** pointer. Require all three to appear as `BPMEM` in `BPLIST` before `RUN`.

5. Resume, select the existing completed slot through GameLink, and record every stop: CS:IP, registers, nearby instruction bytes, full Area1 RAM, and which watched byte changed. Continue only to capture the remaining watched transitions—never issue dungeon input.

## Stop and validation criterion

Stop successfully once:

- `0x4c26: 0→1`, `0x4c5c: 0→ff`, and `0x4c7d: 0→ff` have been breakpoint-observed; and
- the resulting `0x800` bytes exactly equal immutable `SAVGAMA.DAT[1:0x801]`, including `0x4c28=13`, `0x4c29=0x1f`, and `0x4c37=1`.

If the hits share one copy/read loop, the experiment proves these values are restored wholesale during load—not created by resume progression. If `0x4c5c` or `0x4c7d` lands at distinct host instructions after the Area1 read, those CS:IPs are the first native setter candidates. If the save exact-matches without all registered watches firing, classify the trace as mechanically invalid, not as negative evidence. A watch based only on a prior session's physical address is likewise invalid: it can observe unrelated emulator/BIOS traffic.
