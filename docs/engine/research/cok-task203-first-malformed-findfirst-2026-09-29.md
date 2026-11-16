# CoK Task 203: first malformed FindFirst callsite

Date: 2026-09-29. This original-loader, no-key replay stopped at the first
post-COMBAT FindFirst request whose uppercased basename was `VÜŸVÚ°`. The
capture identifies the resident START DOS-search helper and its local path
buffer; it does not identify the helper's caller-provided source string.

## Run and provenance

`tools/probe_cok_task203_bad_findfirst_caller.py` started from packed retail
`START.EXE`, using the modeled DOS services and allocator. It did not preload
overlays, patch stubs, seed a party, or inject keys. The final run wrapped the
tracer's FindFirst service and stopped before applying its no-match result.
Two earlier code-hook attempts reached their instruction caps without
capturing the service; their output is not used below.

| Artifact | SHA-256 |
|---|---|
| Runner `tools/probe_cok_task203_bad_findfirst_caller.py` | `400D6D59C88D7C851CAA58AB5F842C67E0D2B005D915A1940969E2FAB24DD799` |
| Output `C:\temp\goldbox_task203_bad_findfirst_caller_retry.txt` | `7EA97F4EECAEACB2CBC8BEF0779BBE6D332E3E20DB808123971E29F5177CA9D1` |
| `START.EXE` | `E51D88ECEF07CFFE4A14036DE3DBDC6CE7E7FF0DB7482F3771D6F99EB7BBB956` |
| `GAME.OVR` | `C3F448C391EA860F97DEC99CE88B0B8B0A4A7E807CF3B1F5A8F1515E2A7A0529` |

## Captured request

At instruction 77,588,222, the service received `AX=4E00`,
`DS:DX=2491:3446`, `CX=0000`, with DTA `2491:34A7`. The raw pathname bytes
at that pointer were `43 3A 5C 76 FC FF 76 FA B0 00`: `C:\` followed by
basename `76 FC FF 76 FA B0`. The DOS model uppercases that basename to
`VÜŸVÚ°`. The call's remaining captured registers include
`BX=3498`, `SI=34E2`, `DI=3456`, `BP=3496`, and `SS:SP=2491:3444`.

`CS:IP=19C4:0143` was observed in the interrupt service; the INT 21h opcode
is at module offset `0x0141`. The runtime bytes from `CS:IP=19C4:0139` match
the unpacked retail START image exactly at complete image offset `0x9D79`;
the `INT 21h` instruction is at image offset `0x9D81`. This is resident
START code, not a GAME.OVR descriptor. Static disassembly maps the surrounding
helper: it takes a far pathname pointer from `[BP+0x0C]`, copies up to 79
bytes into a local stack buffer at `[BP-0x50]`, sets the DTA from `[BP+6]`,
then calls AH=4Eh with `DX=BP-0x50`. The observed `BP-0x50` equals `0x3446`,
confirming that the captured malformed path was in the helper's local copy.

The output's handle list contained only `GAME.OVR` (handle 5, position and
length 269,031) at this stop. The output also prints candidate ECL words from
the current `DS`; that segment is the local stack segment here, so those
words are not treated as ECL state. The far pathname argument at `[BP+0x0C]`
and its producer remain uncaptured; Task 204 traces writes to the local buffer
and the helper's argument frame.

## Bounded result

Task 203 closes at the exact first malformed DOS-search service call and its
resident START instruction source. It does not establish whether the bad
input was produced by retail code, the modeled state, or the caller's source
data; it proves no combat turn or effect-7 producer. No DOSBox, GUI, or input
injection was used.
