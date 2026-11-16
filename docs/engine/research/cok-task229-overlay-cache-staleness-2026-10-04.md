# Task229 — overlay writes leave stale Unicorn translations

**Result: closed by a no-intervention replay on 2026-10-04.** The modeled DOS
overlay loader overwrites a shared runtime segment with `uc.mem_write` but
does not invalidate Unicorn's translated code. The replay directly observes an
instruction cached from descriptor 10 executing after descriptor 7 replaces
the same bytes with a three-byte jump. The hook continues with a two-byte
instruction and falls through to `00C7`.

## Evidence

- Probe: `tools/probe_cok_task229_findfirst_code_writes.py`, SHA-256
  `69FAA9F86EBAF76C7C6ED0CCF98657B62423D670D21265463F5CFE6A04083188`.
- Trace: `C:\temp\goldbox_task229_findfirst_code_writes.txt`, SHA-256
  `CCBEEEEEEE326CE470A76FF2A1C36F0B2F06A30A1ADAB2C5E25F17EAB55DB3DA`
  (6,210,533 bytes; 49,534 log lines).
- Retail inputs: `START.EXE` SHA-256
  `e51d88ecef07cffe4a14036de3dbdc6ce7e7ff0db7482f3771d6f99eb7bbb956`;
  `GAME.OVR` SHA-256
  `c3f448c391ea860f97dec99ce88b0b8b0a4a7e807cf3b1f5a8f1515e2a7a0529`.
- Stop: first malformed post-COMBAT FindFirst service at instruction
  `77,588,222`; no keys injected, no overlay preload/stub patch, and cache
  intervention disabled.

The probe wrapped the built Unicorn instance's `mem_write` method and separately
registered `UC_HOOK_MEM_WRITE`. It captured 18 host writes overlapping
`28910..2AB0A`, with pre-write and observed post-write overlap hashes, source
file offset, destination, instruction count, caller, and a backing-slice match.
All 18 were modeled `GAME.OVR` file reads through
`tools/unicorn_cok_midi.py:565`; requested backing slices matched and the
resulting bytes matched the writes. The independent guest hook captured 15,752
word writes in that range: 14,588 from `19F0:04C7` and 1,164 from `19F0:02D5`.
These are recorded separately from host loads. Their values are consistent
with segment adjustments, but this pass did not match every write against the
descriptor fixup table, so it does not classify all guest writes as relocations.

The decisive replacement is:

| Instruction count | Operation | Retail mapping | Runtime bytes at `2891:00C5` |
| ---: | --- | --- | --- |
| 52,309,892 | Host write event 15 loads at `28910` | `GAME.OVR` descriptor 10, file start `0xE19A`; `+0xC5` = `0xE25F` | `03 F8 03 F9 26 88 5D 07 89 EC 5D CA 06 00` |
| 54,284,579 | Executes descriptor-10 code at `00C5` | Hook size 2; `03 F8` is `ADD DI,AX` | `03 F8 03 F9 26 88 5D 07` |
| 76,889,694 | Host write event 18 replaces segment from descriptor 7 | `GAME.OVR` file start `0x8A41`; `+0xC5` = `0x8B06` | `E9 8B 00 3C 80 75 39 FE` |
| 77,574,238 | Executes at the same `00C5` without cache refresh | Hook still reports size 2; the next code hook is `00C7` | Live bytes remain `E9 8B 00 3C 80 75 39 FE` |

The live `E9 8B 00` at `00C5` is a three-byte near jump to `0153`. Instead,
Unicorn reports and follows the earlier two-byte instruction boundary into
`00C7`. The cached descriptor-10 sequence continues through `00C5`, `00C7`,
`00C9`, `00CD`, `00CF`, `00D0` and the old `RETF 6` epilogue at `00DF..00E4`;
the replacement instead jumps to `0153` and has `RETF 2` at `0165`. At
instruction `77,574,180`, immediately before this call window, the
live bytes and whole-range hash still match the descriptor-7 replacement. No
`ctl_remove_cache` or instruction-pointer rewrite ran in this replay. This
identifies the source of the stale execution: repeated overlay loads reuse the
same modeled segment, and host-side writes at the DOS read service do not
refresh the execution cache.

The first two descriptor-code reads establish that the tracer's overlay load
path is shared and reused before the decisive pair: event 8 loads descriptor
13 at `0x14D6A` to `28910`, and event 9 loads descriptor 24 at `0x365A6` to the
same address. Their existence also explains why a segment-address-only trace
cannot be treated as a stable code identity.

## Scope and next task

Task229 closes the provenance question. It does not change shared tracer
behavior. The no-intervention run reached the malformed FindFirst stop, whereas
Task228's combined cache purge/IP rewrite run reached its instruction cap; the
combined control still does not tell us which part changes that downstream
path.

**Task230:** update the modeled DOS AH=3F file-read boundary to invalidate
translations overlapping a successful nonempty host write after the bytes are
written. Validate this narrowly against the Task229 baseline: keep the
instruction pointer untouched, confirm descriptor 7's `00C5` jump reaches
`0153` and its `RETF 2` returns with `SP=3DD6` and intact local `PIC`, then
record whether the original no-intervention route still reaches the malformed
FindFirst boundary and compare instruction counts. If invalidation alone does
not refresh the execution boundary, reduce the experiment to a scoped
cache-only / same-PC control before changing shared behavior further. Ask Sol
to review the implementation and evidence before closing Task230.
