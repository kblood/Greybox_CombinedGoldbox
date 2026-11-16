# CoK Task 195: first source-backed party member on the original loader route

Date: 2026-09-28. This is a bounded runtime capture, not evidence of a held
save or retail DOS memory allocator ownership.

## Run and provenance

`tools/probe_cok_task195_party_producer.py` began at the packed original
`START.EXE` entry. `CokMidiTracer` modeled DOS services and loaded
`GAME.OVR` through the retail VROOMM path. The runner did not preload overlays,
patch public stubs, inject keys, or seed a party. It stopped at the first
nonzero party-head pointer, before combat.

| Artifact | SHA-256 |
|---|---|
| Runner `tools/probe_cok_task195_party_producer.py` | `345442E6874DAC45575E2C084A79ACC1AAA5B383ED02E2FB4A9C832A7512DDBD` |
| Output `C:\temp\goldbox_task195_party_producer.txt` | `3B8162040ADD0B8D751406157268E1F861F9F06B44CA0330EEB049086C294644` |
| `Champions of Krynn/START.EXE` | `E51D88ECEF07CFFE4A14036DE3DBDC6CE7E7FF0DB7482F3771D6F99EB7BBB956` |
| `Champions of Krynn/GAME.OVR` | `C3F448C391EA860F97DEC99CE88B0B8B0A4A7E807CF3B1F5A8F1515E2A7A0529` |
| `Champions of Krynn/MON2CHA.DAX` | `B6034B1ACCAE8964D724C033F99A8B7C95C370A31C9F5AC7329E47604D5008DF` |
| `Champions of Krynn/ECL2.DAX` | `4F4BA999B0D46817091E82FE5CCF27CB6EEE95CD833389353D7285C2A8DCCBEA` |

The invocation executed 27,666,563 Unicorn instructions. The trace shows the
original loader reading `GAME.OVR` into code segment `36AA` from file offset
`0x1D6DB` (the following fixup table starts at `0x1FEF7`). This is VROOMM
overlay provenance; segment allocation remains the tracer's DOS memory model.

## First member and list linkage

Retail ECL2 block `0x39` (decimal 57) was active in `DS=1BC6`. Immediately
before the insertion, the interpreter index was `0x809E`. Descriptor 17's
routine at overlay module IP `0x198F` received stack argument pointer
`6109:0000`; the trace captured 400 bytes from that record. The routine code
at module IP `0x1987..0x19F4` first checks `DS:609A/609C`, then copies the
passed far pointer there when the head is null. When nonempty, it follows the
node's `+0x17F/+0x181` far link until it finds a null link.

The independent retail `MON2CHA.DAX` block 60 decompression yields a 409-byte
record beginning `0C 53 49 52 20 52 49 4E 47 57 41 4C 44` (length-prefixed
“SIR RINGWALD”). Comparing the runtime node's captured first 400 bytes to this
record gives 397 equal byte positions; differences are limited to offsets
`0x115` (`3C` runtime / `00` source), `0x145` (`71` / `42`), and `0x146`
(`5C` / `33`). Their runtime mutation semantics are not inferred here. The
node's `+0x17F/+0x181` link words are both zero at helper entry.

At module IP `0x19A7` and `0x19AA`, the helper writes words `0000` and `6109`
to data-segment offsets `0x609A` and `0x609C`. The resulting far head is
`6109:0000`, identical to the argument pointer; the capture stops at the next
instruction boundary before the routine returns. This joins a retail ECL event, retail character block, runtime
record, and first list-head assignment in one loader-backed invocation.

The runner now reports the stop as “party-head pointer set; node
provenance/linkage unconfirmed” because it stops immediately after reading
the new head, not after executing a later list traversal. The record source
and initial next-link were independently captured before the head write, so
the bounded first insertion is source-backed. Task 196 follows the same route
to observe the next append and its mutation of the prior tail link.

## Bounded result

Task 195 closes bounded at the first source-backed insertion. It does not
prove the complete three-NPC demo setup, a held-party/save route, or retail
DOS allocator ownership. The DOS service model and runtime memory segments
remain part of the emulator harness. No DOSBox, GUI, or input injection was
used.
