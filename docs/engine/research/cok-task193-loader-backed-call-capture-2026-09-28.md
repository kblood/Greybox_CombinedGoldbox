# CoK Task 193 — loader-backed setup-helper call capture

Task 193 continues from Task 192's static mapping of `0x521:0x353` to resident
START image `0x5563`. Its runtime requirement is to observe the original
START/VROOMM loader route at `GAME.OVR:0x3BC5E` or FDF2's `0xFE59`, retaining
the unresolved-call guard until that route supplies an authentic frame.

## Retained-trace audit

The available Task 148 original/helper logs, Task 175 corrected-helper log,
Task 177 payload/event outputs, Task 186 allocator scripts, and Task 189
configured-entry output were searched read-only for both OVR callsites,
`0521:036E`, `0521:0B0A`, and `START:0xAF43`. None of the reviewed retained
files records either target callsite or its route-local `0x521` binding.
Several files are bounded at earlier prerequisites or later helper outputs;
their lack of a matching string does not prove control flow failed to visit
the code when the address was not instrumented.

## Loader-backed helper capture — 2026-09-28

`tools/probe_cok_task193_loader.py` starts at START's packed MZ entry and
uses `CokMidiTracer` for DOS/BIOS services. It does not preload overlays or
patch public procedure stubs. The modeled `INT 21h` path opens the 269,031-byte
retail `GAME.OVR`; VROOMM reads descriptor 11's 2,736 code bytes from file
offset `0x10098` into `30A9:0000` and its 160-byte fixup table from `0x10B48`
into `3154:0000`. The runtime caller at `30A9:06C5` matches descriptor 11's
`GAME.OVR:0x1075D` instruction `9A 53 03 21 15`: the loader added START's
`0x1000` load segment to the call's original `0x0521` segment word. It enters
the shared setup helper at `1521:0353` and returns to `30A9:06CA`.

At helper entry the runtime registers are `DS=1BC6`, `ES=SS=2491`,
`SS:SP=2491:3DD2`, and `AX=0F15`. The six argument words after the far return
are `3DE2, 2491, 000F, 0F0A, 0F18, 0F00`: source pointer `2491:3DE2`, then the
four scalar words. The source bytes begin `15` followed by ASCII
`Loading...Please Wait`; the pointer is `SS:SP+0x10`, not a party record.
`DS:609A` (the held-party head field from Task 118's separate capture) is
`0000` here. The sampled workspace bytes at `DS:4B28` are
`0000915000001151000091510000D151`; their ownership is not inferred.

The helper calls nested copy routine `1A46:0ADE` with size word `00FF`,
destination `2491:3CD0`, and source `2491:3DE2`. At return `1521:036E`, the
first 22 bytes at source and destination are equal; the observed destination
contains the length byte and `Loading...Please Wait`, followed by zero bytes.
This verifies the actual nested copy for this loader call. It is a setup
message copy, not held-party continuity.

The two previously investigated setup sites (`GAME.OVR:0x3BC5E` and FDF2's
`0xFE59`) were instrumented and each watcher remained at zero when this run
stopped at the first nested-copy return. This bounded non-hit does not prove
those callers are unreachable. The newly observed descriptor-11 caller is a
third source of the same relocated START helper, which is why its frame is not
evidence for the held-party setup route. Task 193 closes at this bounded
loader result; Task 150 remains active.

Reproduction used no fake keys and stopped at 406,255 instructions immediately
after the nested-copy return. DOS allocations and BIOS/DOS service responses
come from the Unicorn service model, so loaded segment identities do not
establish retail MCB ownership. The runner SHA256 is
`A89712D752AC82B47BD4FF154FC61796740D5C328D93CB239A9CBFE661B27198`; output
SHA256 is
`2DABB52DF90709C6DC0AF13A892EC5615CCD0F286BF51416104B04BE99CBC044`.
Input hashes: START.EXE
`e51d88ecef07cffe4a14036de3dbdc6ce7e7ff0db7482f3771d6f99eb7bbb956`,
GAME.OVR
`c3f448c391ea860f97dec99ce88b0b8b0a4a7e807cf3b1f5a8f1515e2a7a0529`.
