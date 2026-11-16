# Tasks 76 and 133 — original helper through EA67

## Successful bounded join

A headless Unicorn run replaced the compressed MZ image in the existing DOS
shim with `exepack_unpack.unpack_complete_load_image` output, applied its 621
recorded relocations for load segment `0x1000`, and executed the original
resident initializer at `1A46:0000`. It returned with `DS=0x1BC6` and installed
the source-backed allocator dispatch bytes `A9 00 46 1A` at `DS:0x439A`. This
is one resident initializer, not composed game startup.

The run loaded original descriptor 29 (`GAME.OVR:0x3D296`, size `0x1451`) at
`H=0x5600`. Its 57 external segment fixups were based on START's load segment
`0x1000`. This corrects a discarded harness attempt that added the overlay
segment instead and branched to `6046:131F`, inside synthetic stack memory.
No retail behavior is inferred from that invalid attempt.

With explicit fixture values `DS:0x5782=1` (area), `DS:0x5884=0` (path
selector), ID 34, `DS:0x6D7C=9200:0000` (destination), and
`DS:0x4B28=9300:0000` (workspace), original `Load3DMap` at `H:130D` ran its
original call to resident helper `169C:088E`. The helper used the existing DOS
file shim against retail `GEO1.DAX`; it read through the 1,835-byte archive and
returned to the loader. The loader returned to the probe sentinel after its
four original copy calls. The `0x400` bytes at `9200:0000` had SHA-256
`41c4da84def6b42d18e8d91f21226204492c65a1bac7e7afcee7b183f32b4e5f`, exactly
matching decompressed retail `GEO1.DAX#34[2:1026]`. The destination pointer is
stored as offset then segment (`00 00 00 92`) at `DS:0x6D7C`.

The successful join establishes original initializer-to-helper-to-loader
execution under the stated fixture. It does not establish DOS search behavior
outside the shim, production allocator identity, ECL caller inputs, natural
area/selector/pose, or effect-7 output.

## Bounded EA67 dispatch (Task 133)

The first same-image EA67 run loaded original descriptor 10 at `Q=0x5200` and
entered `Q:08CD` with fixture pose `(7,3)`. Without VROOMM state, the INT 3F
dispatch entered `1A46:00D7` from `110B:0031`, reset vector 3F to `F000:0000`,
and terminated through `INT 21h/AH=4C` with `AL=0xD0` before the query
boundary. That failed route does not provide query results.

A second bounded run used the original START thunk as a source-backed direct
dispatch bridge. At `1A46:00D7`, it inspected the saved INT frame; selector
`0x10B` plus return offsets `0x2C` and `0x31` pointed to original descriptor-29
procedures `0x6A2` and `0x573` in the thunk bytes. The descriptor map resolves
selector `0x10B` to descriptor 29. The bridge discarded only the INT frame and
entered those original procedures at `H=0x5600`, preserving the original far
caller's return frame. No selector result or procedure address was fabricated.
EA67 then reached `Q:094F`. With fixture pose `(7,3)`, its first coordinates
were `(1,1)`; selectors `6,0,2,4` returned `1,0,0,1`, stored as
`DS:45E6..45E9 = 00 01 00 01`. The map queried by those original routines was
the same `DS:6D7C` allocation written by original `Load3DMap` after the
unsubstituted original helper call. Sample reads included `9200:0111=0x33`,
`9200:0311=0x00`, and `9200:0010=0x22`.

This closes Task 133 as a bounded thunk-to-descriptor bridge and query join.
It does not execute the normal VROOMM manager, establish production overlay
state, composed ECL/startup, natural pose or DOS behavior, or produce an
effect-7 callback result.

## Full EA67 loop and map mutation (Task 134)

After recording the `Q:094F` boundary, a second run let the same original EA67
routine continue through its return sentinel. The same thunk bridge handled
1,581 INT 3F calls from selector `0x10B`; the thunk bytes selected original
descriptor-29 procedures `0x573`, `0x6A2`, and `0x7A5`. EA67 reached its
`Q:04A1` E63B call 65 times. Its first four map queries at `(1,1)` remained
selectors `6,0,2,4` -> `1,0,0,1`; later loop positions changed those result
globals, so the completed routine ended with `DS:45E6..45E9 = 03 03 00 00`.

For this run, `DS:6A2E` pointed to fixture `9400:0000`, a 1,257-byte map
allocation (7-byte header plus 1,250 cells) prefilled with `0x17`. The original
EA67/E63B path made 1,428 byte writes across all 1,250 cell addresses; 538
bytes differed from the initial fill when EA67 returned. The full 1,257-byte
fixture allocation had SHA-256
`3278107c32bf130c49cfd29b4da8f9fe2e2b171a5d88b75e9a5bac87dd77660f`.
The resource helper, `Load3DMap`, EA67 queries, E63B control, and map writes
therefore ran in one memory image. Area, selector, ID, DOS behavior, pose,
workspace, and the 50x25 target map remained explicit fixture inputs. The
normal VROOMM manager, ECL caller, and natural campaign path remain unproven.
Task 134 closes at this map-mutation boundary.

## Same-buffer range callback (Task 135)

Without clearing or copying the EA67 output at `DS:6A2E=9400:0000`, the same
Unicorn image loaded original descriptor 24 and called its `0x38E2E` wrapper.
The wrapper's source-backed thunk calls were routed to original descriptor 31
procedures `0xBCB/0xBF3/0xC1B` and descriptor 30 procedure `0x8D8` (the mapped
`0x3F031` target). Explicit party/context fixtures pointed to two 512-byte
records; `DS:623F` positions were `(6,10,1)` and `(9,10,1)`, with the second
record selected as target. The wrapper read the same map pointer produced by
EA67 and returned `AL=3` to the probe sentinel. The map byte at the previously
studied cell `(6,10)` was still `0x17` in this pose/loop fixture, so this run
does not show a terrain-driven range change. The result matches the earlier
Task 80 default-map control for the same positions.

Task 135 closes at this same-buffer range result. It does not execute the
caller comparison at `0x10E7D`, reach FDF2, or establish production party,
formation, pose, or natural campaign state. Task 136 follows that caller and
comparison edge using this explicitly labeled fixture.

Task 136's first static step locates `0x10E7D` at descriptor 12, relative
offset `0x0295`, inside the procedure beginning at descriptor-relative
`0x0208`. That procedure calls `0xE6:0xC0` and compares its saved return with
2; the selector maps to descriptor 24 procedure `0x2888` (`0x38E2E`). The
`JAE` at relative `0x0299` takes the `0x02F8` arm for Task 135's result 3. The
procedure was then executed in the same memory image with a fixture object
pointing to the two explicit combat records. The hook at `0x10E7D` observed
saved range `3`, and execution took `JAE 0x02F8`. The selected arm called
`0xDB:0x52` (descriptor 23 procedure `0x1261`) and the common tail called
`0xE6:0x57` (descriptor 24 procedure `0x12F8`). It returned to the probe
sentinel with `AL=0xFC`; this invocation did not enter FDF2. The other arm
contains the additional `0xE6:0x61` call. Task 136 closes at this bounded
caller/compare/return. Task 137 follows the upstream invocation and its
relationship to FDF2; production caller state remains unresolved.

No DOSBox or GUI ran.

No DOSBox or GUI ran. Task records and limits are in
`docs/engine/NATIVE-TASKS-2026-09-12.md`.

No DOSBox or GUI ran. See also the Task 74 conditional copy-to-query fixture
in `cok-map-resource-consumer-2026-09-27.md` for the helper-substituted query
baseline and its separate fixture limitations.
