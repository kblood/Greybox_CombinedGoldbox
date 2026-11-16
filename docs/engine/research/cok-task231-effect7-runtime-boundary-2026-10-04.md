# CoK Task231 — runtime attack path reaches effect-7 callback boundary

**Bounded result: 2026-10-04.** The cache-corrected full START/VROOMM replay
reached the source-backed descriptor-9 combat call, passed its member/context
gates, entered descriptor-13 `14F24`, and dispatched to descriptor-12
`10DF0`. This establishes a natural runtime callback route for the replay's
observed combat command. It does not establish per-byte producer provenance
for the arguments or authorize a native consumer change.

## Probe and inputs

- Probe: `tools/probe_cok_task231_effect7_producer.py`, SHA-256
  `368B468033176AD101701758AAFD6BE58D3903702EBCEA684F454B90FF9C96F2`.
- Trace: `C:\temp\goldbox_task231_effect7_producer.txt`, SHA-256
  `15AC86A2CD41809A32186C0765A9DAFD173FD2CA5389B4ACC54B9AD077B178A6`
  (24,440 log lines).
- Retail inputs: `START.EXE` SHA-256
  `e51d88ecef07cffe4a14036de3dbdc6ce7e7ff0db7482f3771d6f99eb7bbb956`;
  `GAME.OVR` SHA-256
  `c3f448c391ea860f97dec99ce88b0b8b0a4a7e807cf3b1f5a8f1515e2a7a0529`.
- Execution: ordinary START entry, corrected AH=3F overlay cache invalidation,
  no overlay preload, no public-stub patch, no fake keys, 80,000,000 instruction
  cap. Stop: `127F:06E1`, runtime boundary; `blocked=0`, no BIOS block, not
  terminated. The final loop is the same START renderer path recorded by Task230.
- The probe maps watched retail OVR file offsets through `scan_descriptors`,
  checks live instruction bytes at each derived module IP, and records the live
  CS:IP. Runtime code segments vary; no fixed CS identity is assumed.

## Observed source-backed path

The replay reported these hit counts:

| Retail offset | Meaning | Hits |
|---|---|---:|
| `0x0C572` | descriptor-9 combat loop | 13 |
| `0x0C730`, `0x0C73C`, `0x0C746`, `0x0C755`, `0x0D67D` | gate, context/body tests, helper, call to `0x167AF` | 9 each |
| `0x167AF`, `0x16945` | descriptor-13 attack entry and guarded block | 9 each |
| `0x162E3`, `0x165F7`, `0x14F24` | effect helper call, near-call site, `14F24` entry | 9 / 7 / 7 |
| `0x3420F`, `0x34495`, `0x34153` | first wrapper call, effect-7 wrapper call, wrapper entry | 0 / 12 / 14 |
| `0x10DF0` | descriptor-12 indexed callback entry | 4 |

At the first descriptor-9 gate, live descriptor 9 code was at `358F:0215`.
`ES:DI=6188:0008` addressed the member context and context byte `+3` was
`06`. At the separate body gate, `ES:DI=6109:0000` and body byte `+0x189`
was `01`. This confirms the two distinct predicates. `0xC73C` checks context
`+3` after dereferencing body `+0x183`; it does not check body `+3`.

The first recorded descriptor-9 call at file `0x0D67D` was live at
`358F:1156` (instruction 57,112,034). Descriptor 13 entered at `46E0:1A45`
with the candidate/target stack arguments intact. Its guarded block at
`0x16945` ran. At the first `14F24` entry (instruction 57,325,770), the raw
entry stack at `SS:SP=2491:3D22` was
`9018e04601000800c46600000961000002013a0000010002`:

- return address `46E0:1890`;
- first word argument `1`;
- first far pointer `66C4:0008`;
- second far pointer `6109:0000`.

These are recorded as raw arguments; this slice does not yet assign owner vs.
target semantics to the two pointer arguments. The second pointer matches the
member body observed at the descriptor-9 body guard. This earlier frame is not
the attack-specific mode-4 sequence below.

At the attack-specific `14F24` entry at instruction `69,565,822`,
`SS:SP=2491:3D22` and the raw entry bytes are
`9018a34701000000016c0000fd62000002013a000001ed2d`. The return address is
`47A3:1890`; the word argument is `1`; unpacking each `{offset, segment}`
stack pair as little-endian words gives raw far pointers `6C01:0000` and
`62FD:0000`. Their owner/target meanings and byte-level writers remain
unverified.

The dispatcher hook at `0x34527` is a location watch, not a mode-4-only
counter; it recorded varied mode bytes (443 total entries). The first callback
hit at instruction `69,550,629` followed a dispatcher entry whose mode byte was
`0x0A`, so it is not joined to the later attack sequence. The attack-specific
sequence is visible at instructions `69,565,821..69,566,081`: descriptor 13
reaches `14F24`, descriptor 23's dispatcher sees mode `4` at `69,565,933`,
the second wrapper call at `69,566,062` enters `34153` at `69,566,063`, then
descriptor 12 callback `10DF0` is entered at `69,566,081` (`417F:0208`). The
first wrapper callsite at `0x3420F` had zero hits in this run. The live callback
therefore follows the later indexed mode-4 path in this attack sequence; this
does not imply every wrapper route or candidate attack reaches it.

The command boundary was descriptor-2 ECL block `0x39`, cursor `0x8014`,
index `0x8354` at instruction 51,858,876. Retain this actual block/cursor
identity; do not relabel it ECL1#36 based on older candidate work.

## Limits and next evidence

This capture records call frames and selected values at consumption. It did not
install early writer tracking for the pointer payloads, `DS:0x713C`, callback
table bytes, or the source stack locals. In particular, the attack-specific
`14F24` entry at instruction `69,565,822` has its own arguments and must be
used for the follow-up provenance capture; do not reuse the earlier
`57,325,770` frame as though it belonged to the same attack. Consequently it
cannot identify the latest writer of each consumed argument byte, establish
initialization lineage for the indexed table, or prove trusted GBOC damage/RNG
output. The 80M cap
alone establishes none of those claims. Continue with a focused writer-provenance
slice for the recorded real frames and pointers; keep consumer/native changes
blocked on that evidence and the existing staged mutation contract.

No DOSBox, GUI, retail-file writes, or native source changes were used.
