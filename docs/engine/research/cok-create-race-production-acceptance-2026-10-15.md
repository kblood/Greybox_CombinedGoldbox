# CreateRace production integration

2026-10-15. This accepts the finite Pick Race prefix and optimized build
foundation within the [full-game plan](cok-rea-full-game-plan-2026-10-15.md).
It does not complete character creation.

## Change and generation

Sol integrated the previously checked 164-instruction / 423-byte original
CreateRace prefix into the production preparer/lifter and Rust tests. Total
admission is now **18,728 instructions / 47,047 bytes**. Existing original
instruction tuples remain unchanged. The explicit stop moves from A4:06DD to
A4:0884, before the race-field store.

The emitted protection predicate uses the exact union of protected intervals:
11,236 original records become 96 emitted intervals covering the same 27,393
bytes. The original manifest records and invalid-range/module guards remain
unchanged. This avoids the previous MSVC compiler-heap failure.

Luna passed four union tests, including exhaustive 1 MiB coverage, and all
25 portable generation cases. Independent comparison found unchanged complete
instruction/protection arrays and generated C differing only in the protection
predicate, with task-local GEO output paths recorded separately.

## Build

Luna built with Cargo 1.99.0, MSVC 14.39.33519 / compiler 19.39.33523 and SDK
10.0.22621. Actual command capture records `cl.exe -O2 -Brepro` for generated
C. **125 release tests passed, 0 failed, 0 ignored**. The normal application
was built separately from the test executable.

Final application SHA-256:
`9bee5a2c7c2c5a96da5edabf6b8a59fc8e4c8ea9221f7d5ac0e8a73dc9051df2`.
The preceding successful ordinary build had a separate recorded binary hash;
the final identity above follows the compiler-command capture build.

Local build evidence is in
`build/cok-recomp/create-race-production-union-target-20261015-a/`.
Fresh generation evidence is in
`build/cok-recomp/staging/intro-compare/create-race-production-union-controls-20261015-a/`.

## Runtime

Luna ran the normal application with four scheduled BIOS words. Actual AH=00
consumptions occurred in order:

| Word | Work | Ring head |
| --- | ---: | --- |
| Enter, 7181 | 14,500,289 | 30 → 32 |
| P, 6480 | 15,000,247 | 32 → 34 |
| Enter, 7181 | 16,000,085 | 34 → 36 |
| Enter, 7181 | 18,000,093 | 36 → 38 |

The endpoint is runtime CS:IP **4A14:0884**, work 18,006,122, lifted status 1,
fault 0. The final screenshot displays the original seven-race menu. The owned
process closed with exit 0 after 160.906 seconds, outputs drained, no forced
termination, and all 109 configured pins unchanged. Input/capture/close used
the exact owned window without foreground activation or global input.

The music-driver allocation at 631E/631F is separate from the current creation
overlay and must not be used as evidence of that overlay's generation.
Detailed overlay residency corroboration is recorded in the runtime receipt.
The current catalog entry has source descriptor A4, relocated descriptor 10A4,
loaded segment 4A14, generation 5 and `body_identity=true`. Checkpoint 70 and
the manager's move-complete event corroborate this residency.

Local runtime evidence is in
`build/cok-recomp/staging/intro-compare/create-race-gui-production-union-20261015-a/`.
The acceptance ends before applying the selected race. Complete character
creation, saved character output, party workflow, campaign gameplay and live
audio remain open; the next task follows the whole-creation closure plan.
