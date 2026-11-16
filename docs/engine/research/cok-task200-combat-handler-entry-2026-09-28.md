# CoK Task 200: selector-24 combat handler entry

Date: 2026-09-28. This bounded original-loader run verifies the first
selector-24 combat handler and the combat archive opens after ECL2#57's
`COMBAT` command. It does not execute a turn or attack.

## Run and provenance

`tools/probe_cok_task200_combat_handler_entry.py` started from packed retail
`START.EXE`. The original VROOMM loader read `GAME.OVR`; DOS services were
modeled by `CokMidiTracer`. The run used no preloaded overlays, patched stubs,
fake keys, or seeded party. It stopped after both combat archives opened.

| Artifact | SHA-256 |
|---|---|
| Runner `tools/probe_cok_task200_combat_handler_entry.py` | `48995027FF67C0D634AD966716B0BC62CCACC50CBA947D1C8C203ECC59932D69` |
| Output `C:\temp\goldbox_task200_combat_handler_resources.txt` | `93F0F7D71764D52F983F1ACCF204DA027EC8AC47493CFC718D13D7D28D56A3FC` |
| `START.EXE` | `E51D88ECEF07CFFE4A14036DE3DBDC6CE7E7FF0DB7482F3771D6F99EB7BBB956` |
| `GAME.OVR` | `C3F448C391EA860F97DEC99CE88B0B8A0A4A7E807CF3B1F5A8F1515E2A7A0529` |
| `DUNGCOM.DAX` | `827176E941F24176F1907BDE40A81928CB4C2DA66231CA6B07C72B0B03A0BF2A` |
| `RANDCOM.DAX` | `78E5DAAB63D6880E8093E4BD25B50768AAC81E7F004F783947F0205A0E69E925` |

## Runtime join

At instruction 51,858,876, ECL2 block `0x39` reached interpreter index
`0x8354` (`COMBAT`). The first handler entry was `CS:IP=3EE3:191C` at
instruction 51,858,959. The live selector byte `DS:72E7` was `0x24`; data
segment was `1BC6`, ECL cursor `0x8014`, and live index `0x8354`. The captured
stack starts `C1 39 E3 3E EA 3E 1D 3B ...` at `SS:SP=2491:3DDE`.

The handler's original-loader invocation then opened `DUNGCOM.DAX` (handles
171 and 172, 5542 bytes) and `RANDCOM.DAX` (handle 173, 1023 bytes). After the
second archive open the ECL index had advanced to `0x8355`. Detailed
byte-by-byte file-read logging was disabled in this run; Task 201 captures the
first data-section reads from both archives.

## Bounded result

Task 200 closes bounded at the selector-24 handler and combat archive opens.
No BIOS input, completed combat turn, attack callback, or effect-7 producer
was observed. No DOSBox or GUI was used.
