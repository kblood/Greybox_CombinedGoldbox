# CoK Task 199: original-loader COMBAT dispatch boundary

Date: 2026-09-28. This bounded run continues Task 198 across the retail
ECL2#57 `COMBAT` command. It captures the first native combat dispatcher and
its live selector, but it does not claim a completed combat turn or attack.

## Run and provenance

`tools/probe_cok_task199_combat_entry.py` started at packed original
`START.EXE` entry and let VROOMM load retail `GAME.OVR`; DOS services and
memory allocation are modeled by `CokMidiTracer`. No overlays were preloaded,
stubs patched, keys injected, or party seeded. The run reached the combat
command at instruction 51,858,876 and stopped at the 80,000,000 instruction
cap, not at keyboard input.

| Artifact | SHA-256 |
|---|---|
| Runner `tools/probe_cok_task199_combat_entry.py` | `1CC8D4F593D04306C1FC5A541983AD2553B1A46E8DF85A0B6DF849367A9ACA39` |
| Output `C:\temp\goldbox_task199_combat_entry.txt` | `FDD375C679EFC1B662E2BD2B9C9352133664D2B20C900BE727A297CED1986F15` |
| `START.EXE` | `E51D88ECEF07CFFE4A14036DE3DBDC6CE7E7FF0DB7482F3771D6F99EB7BBB956` |
| `GAME.OVR` | `C3F448C391EA860F97DEC99CE88B0B8B0A4A7E807CF3B1F5A8F1515E2A7A0529` |
| `ECL2.DAX` | `4F4BA999B0D46817091E82FE5CCF27CB6EEE95CD833389353D7285C2A8DCCBEA` |
| `DUNGCOM.DAX` | `827176E941F24176F1907BDE40A81928CB4C2DA66231CA6B07C72B0B03A0BF2A` |
| `RANDCOM.DAX` | `78E5DAAB63D6880E8093E4BD25B50768AAC81E7F004F783947F0205A0E69E925` |

## Native dispatcher

At ECL2 block `0x39`, the interpreter reached index `0x8354` and fetched the
`COMBAT` command. The first instructions ran in descriptor 2, `CS=3EE3`, at
module IP `0x386D` (`GAME.OVR` file offset `0x41D9`). That dispatcher reads
`DS:72E7`; after the load, the live AX value was `0x8324`, so the selector byte
was `0x24`.

Retail descriptor-2 bytes at module IP `0x39B9` compare AL against `0x24` and
encode `push cs; call 0x191C; jmp 0x3ADB`. The relative call target maps to
`GAME.OVR` file offset `0x2288`. Task 200 confirms this branch at runtime:
the original loader entered `CS:IP=3EE3:191C` with selector `0x24`, then
opened `DUNGCOM.DAX` and `RANDCOM.DAX`.

The run naturally opened `DUNGCOM.DAX` and `RANDCOM.DAX` after the command.
It did not reach the tracer's no-key BIOS stop; it continued until the
instruction ceiling in another runtime routine. No combat result, attack
callback, or effect-7 producer is claimed.

## Bounded result

Task 199 closes bounded at the original-loader COMBAT dispatcher with a
source-backed selector branch. The DOS allocator remains modeled, and no
interactive input was supplied. No DOSBox or GUI was used.
