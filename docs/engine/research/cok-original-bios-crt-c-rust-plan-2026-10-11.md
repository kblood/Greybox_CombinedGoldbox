# Original CoK BIOS, CRT and startup installation plan

Astra original-source planning pass, 2026-10-11, following the verified
restored-entry prefix. The subsequent compiled translation is recorded below.
The platform and clock are explicitly modeled; neither the original probe
nor this compiled comparison establishes historical machine fidelity.

## Verified CRT and original wrapper installation

The same restored-entry guest now executes original CRT initialization,
calibration and subsequent resident calls through `01C7:035A`. The generated
total is 1,828 instruction blocks. Rust supplies the declared virtual text
platform, work-clock and immutable filesystem services. It does not assign
the calibration result, heap fields or wrapper pointers.

```powershell
./rust/cok-recomp/target/release/cok-recomp.exe startup --through install --json
./build/cok-recomp-tools/venv/Scripts/python.exe -B ./rust/cok-recomp/verify_startup_crt.py --matrix --exe ./rust/cok-recomp/target/release/cok-recomp.exe
./build/cok-recomp-tools/venv/Scripts/python.exe -B ./rust/cok-recomp/verify_regression_readonly.py --expected-sha256 0184fbea658f4e98cc7ee9756d62d8ef2c9e0fa96b1104266e4c23f3080de744
```

Actual Luna 6 testing passed ten declared positive profiles and six separate
negative prefixes using the final native oracle SHA256
`f6e9c7fa3fc0ec8ec6d7542f2be5240faaf57b6eca2aba24a46fb1c6e250a6c4`.
The default diagnostic 2,000-work-unit profile reaches four BIOS boundaries
at 453/470/485/516 instructions, actual guest DIV at 4,013, CRT return at
4,167, successful nested manager return at 4,542, and wrapper installation
at 4,550. These counts are conditional on that platform schedule.

Comparisons cover all 18 default checkpoints: registers and known flags
(including undefined arithmetic flags after DIV), guest/platform writes,
live stack, BDA, text cells, font vectors, CRT/stream records, IVT, original
heap, DTA, file events/cursors and installed pointers. Clock phase/rate,
cursor/cell attributes, memory ceiling, counter wrap and chunk sizes 1/7
were exercised. Chunked execution has the same final state. Frozen clocks,
missing files, short headers and exhausted budgets are matched failures,
never added to the positive denominator.

The original code produces `[8A50]=3` in the default profile, installs the
CRT streams and INT 1B, initializes VROOMM successfully and installs the
saved callback and wrapper. Eleven outer initializers have returned;
startup call twelve is still live at `01C7:035A`, before its path/config
work finishes. No overlay body is preloaded by the host on this route.

Luna also reran 8,851 positive regressions, 512 text cells, 31 negative
controls, prior startup/manager/wrapper/callback comparisons and native
queries, 59 compiled guard tests and decoder controls (24 rejected forms /
41 supported forms). The finalized oracle skips zero-count REP memory/flag
effects and tracks actual SCASB/CMPSB arithmetic flag definitions. The
LOOPE/SCASB controls include unknown-ZF short circuit and the measured extra
zero-exit dispatch when a scan exhausts CX.

Three isolated erroneous builds test quotient calculation, BIOS-cell-derived
state and FindFirst DTA contents. All still exit 0 and reach installation
status 20; **checkpoint admission does not detect these semantic errors**.
The original comparator rejects each at its first state discrepancy. Luna
verified current source/generated-C/oracle/production/mutant fingerprints
and repeated those comparisons. Production SHA256 remained
`0184fbea658f4e98cc7ee9756d62d8ef2c9e0fa96b1104266e4c23f3080de744`.

The font backing is diagnostic and read-forbidden. No glyph is read by this
route. The clock is an instruction-work model, without physical PIT/CPU
timing validation or asynchronous interrupts. Rendering, input, audio,
complete initialization, main/demo, combat and save/load remain unfinished.

## Original-source planning snapshot

The next SOL task should extend the **same restored-entry execution** through two checkpoints: **CRT return at `0000:0049`**, then **VROOMM/wrapper installation at `01C7:035A`**. Keep the original calibration, stream initialization, filesystem checks and manager initialization executing.

I verified the release hash begins `e43879214…`, decoded the original instructions, and ran one bounded, in-memory original-code probe. Under explicitly modeled BIOS/file responses and a 2,000-instruction tick schedule, it reached CRT return after **4,167 steps** and wrapper installation after **4,550**. These are conditional route observations—not Rust differential results or timing-fidelity evidence. The probe used diagnostic zero font backing; it establishes no authentic font data. No files were written, builds performed, or DOSBox launched.

All coordinates below are **unrelocated source coordinates**; add `1000h` to source segments for this process.

**1. Implement the reached BIOS contract first.**

The mode-3 path makes exactly these four video requests, all through `0962:060F`:

| Calling source | Request observed in the bounded probe | Required response |
|---|---|---|
| `0962:002E..0030` | `AX=0F00` | Current mode, columns, active page |
| `0962:00E5..00E7` | `AX=0F03` | Same coherent mode state |
| `0962:00EB..00F2` | `AX=1130`, `BH=0`, `DL=0` | Font-information contract |
| `0962:0044..0048` | `AX=0800`, `BH=0` | Character and attribute at page-0 cursor |

For the declared profile, the first two return `AX=5003`, `BH=0`. The last reads actual virtual text memory; a declared blank screen with attribute `07h` returns `AX=0720`.

An important distinction: **`1130h/BH=0` returns the INT 1F font pointer**, not simply the current text font. It also returns character height in CX and rows-minus-one in DL. DOSBox’s implementation explicitly distinguishes the INT 1F pointer from INT 43 and the ROM font selectors. [Primary implementation](https://raw.githubusercontent.com/dosbox-staging/dosbox-staging/main/src/ints/int10.cpp)

Declare one profile, preferably VGA-compatible text mode:

- Mode 3, 80 columns, 25 rows, active page 0.
- Page-0 cursor position and shape; initial position `(0,0)` is a profile choice.
- `B800:0000` text cells, initialized explicitly; character `20h`, attribute `07h` is a reasonable declared starting state.
- Consistent BDA mode, columns, page size/start, cursor positions/shape, active page, CRTC address, row count and character height.
- Current text font metadata and backing bytes; separate coherent INT 1F/INT 43 pointers.
- Initial clock value and phase.

The original source determines **what is queried**, not the historical machine’s initial screen, cursor, ROM address or glyph bytes. A pinned, provenance-recorded emulator font can define a virtual platform; it must not be called held original-ROM evidence. DOSBox itself stores separate font tables and initializes INT 1F to the second half of its 8×8 font. [Font setup source](https://raw.githubusercontent.com/dosbox-staging/dosbox-staging/main/src/ints/int10_memory.cpp)

For this checkpoint specifically:

- `0962:060B..0615` saves/restores ES and BP, so the returned font pointer does not escape the helper.
- `0962:00F5..0128` uses the row result and saved mode/column result. It does not read glyph bytes.
- `0962:004B..0052` masks the returned attribute with `7Fh` into `[8A54]` and `[8A4A]`.

Therefore font authenticity is **not demonstrated by reaching CRT return**, even with a correct BIOS response.

With this profile, expect source-produced state including:

```text
[8A48] = 0003        mode/extended-height state
[8A52] = 184F        maximum row/column
[8A4C] = 0000        window origin
[8A4E] = 184F        window limit
[8A47] = 00          supported font-information path
[8A4A] = [8A54] = 07
```

The mode-reset branch at `0962:003B..003E` is not reached from mode 3. Other branches contain mode setting, font loading and cursor operations; do not silently acknowledge those services before implementing their state changes.

**2. Make calibration run against an explicit virtual clock.**

The actual calculation is:

```text
0962:006C..0072   wait until low byte of 0040:006C changes
0962:0074..007A   sample it again; CX=FFFF; call 02BD
0962:02BD..02C6   four-decrement inner loop, compare clock, LOOPE
0962:007D..0087   original NOT/XCHG/DIV sequence; store [8A50]
```

The clock must advance while ordinary instructions execute. Advancing only on BIOS calls would hang the first wait.

Use two explicitly named timing contracts:

- **Deterministic route profile:** a documented instruction-work schedule, optionally retaining 2,000 units per tick for comparison. Specify initial phase, update-before/after-instruction ordering, REP iteration accounting, BIOS service cost, and behavior across yields.
- **Fidelity candidate:** a declared virtual CPU throughput/cost model feeding a PIT/BIOS scheduler. Validate that model against a pinned DOSBox configuration later.

The BIOS tick cadence and rollover belong to the platform contract; the amount of guest work between ticks belongs to the CPU timing model. DOSBox’s BIOS increments the counter through its timer handler and handles midnight rollover separately. [BIOS timer source](https://raw.githubusercontent.com/dosbox-staging/dosbox-staging/main/src/ints/bios.cpp)

Do **not** assign `[8A50]`, jump past either loop, or replace the guest division with a host delay formula. In my diagnostic 2,000-step profile, the original produced `[8A50]=3`; that value is conditional on this schedule.

Keep host presentation pacing separate. A monotonic host clock can pace virtual execution, but Rust/C execution speed must not accidentally become the emulated CPU speed. Later timer-vector installation will require interrupt delivery/chaining semantics; directly updating the BDA alone will then be insufficient.

**3. Finish the CRT initializer, including its new callback.**

Changes to `rust/cok-recomp/lift.py:213` (the Rust lifted-code track is omitted from this draft; see [SHARE-REVIEW.md](../../../SHARE-REVIEW.md)).:

- Extend the `0962` CFG past its current barriers at `0006`, `0033`, and `060F`.
- Admit `INT 10h` as an explicit platform boundary.
- Add **`LOOPE` at `0962:02C6`**: decrement CX, branch on nonzero CX and defined ZF, preserve flags.
- Include `0962:0331` and indirect callback **`0962:035C`**.
- Extend the stream callback admission at `0A46:0601` to that original target, with validated stream-record identity and source bytes.
- Make the BIOS checkpoint resumable once, without responding twice or resetting the machine budget/time.

After calibration, original `0962:0090..0093` installs **INT 1B → `0962:012D`**. Then `0962:0006..0027` rebuilds the two streams and opens them through the existing RTL routines.

The callback produces these pointers:

```text
stream 8A5E: open=0962:035C, operations=0394 / 0472 / 0472
stream 8B5E: open=0962:035C, operations=0441 / 0441 / 0472
```

Preserve the original `PUSH CS; CALL near` sequences and `RETF 4` cleanup.

Checkpoint **before executing `0000:0049`**. Require restored SP=`4000`, the live stream records, INT 1B, CRT globals and the original heap `2891..2F48`. Update `rust/cok-recomp/verify_startup.py:120` (the Rust lifted-code track is omitted from this draft; see [SHARE-REVIEW.md](../../../SHARE-REVIEW.md)). to track undefined arithmetic flags after DIV; its current prefix verifier never reaches that instruction.

**4. Continue through the resident calls in their actual order.**

| Startup callsite | Original initializer | Work before returning |
|---|---|---|
| `0000:0049` | `0960:0000` | Calls `0A46:0ADE`, copying a bounded Pascal string from DS:`16ED` to DS:`896A` |
| `0000:004E` | `07E8:0105` | Installs `[4B22:4B24]=07E8:0124`, then clears the pointed-to word |
| `0000:0053..0071` | `077C:0608`, `0743:0380`, `069C:0A61`, `0661:02DA`, `0614:04CA`, `0521:0D19`, `027F:214C` | Each executes its four-instruction initializer |
| `0000:0076` | `01C7:031A` | Existence check, VROOMM initialization, wrapper installation |

Execute even the four-instruction initializers. Their nearby graphics, joystick and timer functions are not thereby reached.

Extend module registration, relocation-aware byte checks and protected spans consistently. In particular, `07E8:0124` is writable source-resident **data**, despite residing beside code.

**5. Add the narrow filesystem dependency and reach `01C7:035A`.**

The successful source path is:

```text
01C7:0326 → 069C:01C8 → 069C:04C1 → 09C4:0112
01C7:0335 → 0A46:0AC4
01C7:033A → 09F0:0012
```

The actual existence helper is **`09C4:0112`**. Its successful conversion closure introduces **`REPNE SCASB` at `09C4:0178`**. Implement its comparison flags, DF, CX, termination, bounds and resumable budget behavior.

The bounded probe observed:

1. `09C4:0135`: DOS SetDTA.
2. `09C4:0141`: FindFirst, `CX=0`, filename `game.ovr`.
3. `09F0:01A0`: open `GAME.OVR`, `AX=3D00`.
4. `09F0:0056`: absolute seek to zero.
5. `09F0:0064`: read eight bytes: `46 42 4F 56 DF 1A 04 00`.
6. `09F0:00DB`: install INT 3F.

Use a DOS current-directory/path contract over immutable assets, a real guest DTA, and handles with independent cursors. FindFirst must populate its result structure; success-only CF clearing is insufficient. Preserve AX/error/CF and short-read behavior.

Checkpoint before `01C7:035A`, with:

```text
[885F:8861] = 09F0:0268       saved original loader callback
[8A5A:8A5C] = 0614:0492      installed wrapper
INT 3F       = 09F0:02E6
SS:SP        = 2491:3EF0      at load base 1000
BP           = 3FFA
```

The original file remains open. No overlay body has to be preloaded to achieve this checkpoint.

Check manager success separately: reaching the wrapper assignment alone is not proof that initialization succeeded. Missing files enter the original retry/prompt path; short reads can take manager failure paths. Report those outcomes honestly or stop at their first unsupported boundary.

**6. Acceptance and the practical wrapper strategy.**

Build a narrow Rust platform layer around the existing generated guest—not a replacement startup implementation. It should own the declared video state, clock scheduler, DOS filesystem/handles, and eventually queued keyboard events and display presentation. Original guest code continues to own calibration, allocations, overlay loading and gameplay calculations.

SOL’s acceptance sequence should be:

1. Preserve the existing 443/453-step prefix checks.
2. Compare original Unicorn and compiled Rust/C at every BIOS boundary and `0000:0049`.
3. Compare every subsequent initializer return, filesystem event, manager return and `01C7:035A`.
4. Compare registers, defined flags, live stack, guest writes, platform writes, BDA/IVT, CRT/stream records, heap fields, file cursors and manager status.
5. Exercise changed cursor/cell attributes, tick phase and rate, low-byte tick wrap, frozen-clock budget exhaustion, corrupted callback pointers, missing files and short reads.
6. Verify chunked execution yields the same result as uninterrupted execution. A yield must not restart calibration time or repeat a BIOS response.

Use independent Python and Rust service implementations against the same declared contract. Agreement between them establishes translation correctness **under that platform**, not historical machine fidelity.

A later Luna-owned DOSBox-X pass, using focusless GameLink, still needs to capture the original’s BIOS requests/results, BDA and font/vector provenance, CRT stream state, calibration value and timing behavior under a pinned machine/CPU/cycles configuration. No such observation was made here.

This scope does not establish EGA graphics, retrace timing, keyboard behavior, audio, or playability. After `01C7:035A`, continue the original path/config work and remaining startup calls; then attach the existing resource/heap proof to startup-owned state and remove the host Load3DMap callbacks.
