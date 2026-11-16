# CoK windowless test acceptance

User requested headless tests on2026-10-15. Astra reviewed the bounded plan and
source changes, Sol implemented them, and Luna owns execution. Original guest
admission remains32,845 instructions/84,012 bytes: this task adds no guest code.

## Source and test results

The explicit `frontend --headless-control-dir` branch bypasses `Window::new`
and the physical input queue. Both modes retain the same guest execution loop,
BIOS input enqueue, finite work budget, file backend and final publication.
The headless controller starts paused, accepts sequential bounded JSON commands,
and publishes lossless top-down32-bit BGRA BMPs directly from the framebuffer.

Reviewed source SHA256:

| Source | SHA256 |
| --- | --- |
| `frontend.rs` | `51d83f1290785431a3d4ee210f365b12432cdcf7749204b3cbab1e09e1f603bc` |
| `frontend_headless.rs` | `c999b7e941bc5d06150f3c5f10499b83fcacb490972d55b432697025d6cf4004` |
| `main.rs` | `2aad47496ee20c9147a9f36e47c76108b6c99d2e78b13cbd5ca3bf515b210a73` |

Luna's repaired focused module pass:10 passed. Four additional focused controls
passed for frontend status, host cap priority, report cap and actual native
fault priority. Full release suite:195 passed,0 failed,1 existing ignored
worker. Optimized normal binary compilation succeeded using the existing
native/generated cache. Logs and actual exit files are under
`build/cok-recomp/journal-runtime-target-20261015-a/`, named
`focused-…-repair1`, `full-headless-tests-repair1` and
`normal-headless-build-repair1`.

Build receipt: `headless-build-test-result-repair1.json` in that directory.
All126 compiled input pins were identical before and after the pass. Generated
manifest SHA256 remains
`eddcbf87a8134803917bbdda8ab90a47c9d1819c9715755e507848f562a154e0`.
Optimized executable SHA256:
`8e085dbba280f24819e80776c0838586236f53a8c3888275b85b428d006fcb48`.

The initial focused run failed because the capture-purity fixture attempted
to enable an EGA device already initialized by `StartupSession`; native status6
correctly rejected duplicate initialization. The fixture also declared its
profile argument with the wrong signed type. The repair removed that redundant
call/declaration, asserts the existing device is non-null, and retains baseline
after setup plus full endpoint/RAM/latch identity around capture. The failed
log and exit101 remain preserved; production behavior did not change for this
repair.

## Runtime acceptance

**Functional headless KRA creation/save replay accepted**, following Astra's
review of the runtime evidence. Strict long-run state identity is not accepted.
Run directory:
`build/cok-recomp/staging/intro-compare/headless-accepted-kra-replay-20261015-a/`.

The total budget was 60M; the separate bootstrap target was 26,364,638.
The run consumed all 16 scheduled words, paused at that exact target without
overshoot, and reported fault 0. Root directly viewed fresh `frame-0003.bmp`:
the original main menu returned after Save. The independent BMP decoder passed
orientation/channel/dimension/hash checks. Image SHA256:
`02bf5912ec004b6d63be99395af7b7485a3df1509ee901545bbf2ee458d1e001`.

The new isolated files match the accepted interactive run exactly:

| File | Bytes | SHA256 |
| --- | --- | --- |
| KRA.WHO | 409 | `e9b3ea72bcf349118268c3f0a2f864a24579630884106a1e2905f2f44ff851de` |
| KRA.SFX | 9 | `2dc3ea9719de5477dc6311837e0ff1502aacd91d2dd432c69a538ad89f64a5be` |

PID 56676 closed through command 2, with actual exit 0, drained outputs, unchanged
executable/schedule pins and no forced termination. The sibling
`.launcher/terminal.json` records those observations. The offline publication
validator initially could not find its expected run-local terminal receipt;
Luna copied the actual launcher receipt byte-for-byte into the fresh expected
path, recording source/destination hashes in `terminal-copy-provenance.json`.
The single retry exited 0. No terminal fields or successful verdicts were
fabricated. The application terminal continues to say publication validation is
external; the validator result is separate evidence.

The validated journal has 157,181 logical events, 17,290 encoded records and
4,604,114 bytes. All 16 host enqueues have matching AH00 consumptions. Report
size is 129,373 bytes, endpoint 30,916 bytes and RAM 1 MiB. No temporary
publication files remain; `run_completed=false` is retained truthfully.

The PID/start-identity monitor recorded 3,823 samples with no owned HWNDs between
13:53:22.301Z and 13:55:27.260Z. Startup before the first sample is outside its
coverage. Source inspection confirms the headless branch bypasses window
construction; the monitor supports the observed gameplay/drain interval rather
than a claim of uninterrupted measurement from process creation.

## Parity limits retained

`headless-semantic-parity-summary.json`, `headless-parity-diff.json` and
`headless-endpoint-leaf-diffs.json` preserve the actual comparisons with the
accepted interactive run. At the same final work, all 16 AH00 payloads and save
bytes match. Grouped event payloads excluding work match, with 13,109 IRQ0 ticks,
four CRTC writes and one mouse reset on each side. This grouping does not prove
global event order or timing equality.

There are seven fewer empty AH01 polls: 144,042 versus 144,049. Logical journal
totals are 157,181 versus 157,188, and expanded hashes differ. RAM differs in
248 bytes across 55 ranges between physical 0x27B36 and 0x286A8. Final CS:IP is
417E:05AC versus 1614:03D7; BP/SP differ. Other architectural register values,
flags, EGA and timer/PIT state match, but IRQ diagnostic event totals differ by
47 and prepared-repeat CS/IP differ. These are real guest-state differences,
not merely report metadata. Different yield histories are an unproved hypothesis;
first-divergence localization remains an explicit follow-up. No specific
production repair was established by this evidence.

Subsequent exact localization is retained in
`headless-first-global-event-divergence-v3.json`: global rows 1–147,186 match
including order and work. All 16 AH00 consumptions occur within this identical
prefix. The final word 5465 is consumed at row 147,094/work 25,504,573 on both
sides, after enqueue at 25,504,478. First divergence is row 147,187: IRQ0 tick
12,771 has work 25,687,118 versus 25,687,119, with equal tick/rollover payload.
That is 182,545/182,546 work after final consumption. This localizes the
difference without explaining its cause. The earlier paired-row analysis that
misreported baseline count, and the intermediate arithmetic-error artifact,
remain preserved with explicit supersession notes; v3 retains both actual totals.

Original interactive evidence and the accepted binary/save files remain
unchanged. Use headless mode for automated Rust application tests by default.

This task cannot establish cold character reopening, party addition, WORLD
roundtrip or complete gameplay. Those remain subsequent work under the
[full game plan](cok-rea-full-game-plan-2026-10-15.md).
