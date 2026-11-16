# CoK EGA device semantics and acceptance plan

Astra read-only planning pass, 2026-10-11. Root independently unpacked the
held START.EXE and verified the register writes and glyph instructions below,
then inspected the pinned DOSBox-X memory implementation. No EGA runtime or
hardware result is claimed. Continue the full playable Rust objective after
the current all-initializer implementation.

## Resolve the comparison mask explicitly

Use a declared planar 256-KiB profile with register 7 bit 1 enabling comparison
and bit 0 ignoring that plane. The
[DOSBox-X v2026.07.02 implementation](https://github.com/joncampbell123/dosbox-x/blob/dosbox-x-v2026.07.02/src/hardware/vga_memory.cpp#L298)
loads all four latches on reads and applies that comparison mask. Its write
path separates the bit mask from the plane map mask. This supports a declared
compatibility model; it is not a measurement of a physical IBM EGA.

The [1984 IBM EGA reference](https://www.minuszerodegrees.net/oa/OA%20-%20IBM%20Enhanced%20Graphics%20Adapter.pdf),
printed page 54, describes the opposite comparison polarity. Astra found no
primary erratum that establishes a correction. Preserve this discrepancy;
do not claim the later VGA documentation alone proves original EGA hardware.

The original CoK driver supplies independent static evidence:

| Original resident address | Effect |
|---|---|
| `0521:004B..0056` | GC7 = `0F` |
| `0521:0063..006E` | Sequencer map mask = `0F` |
| `0521:0DD7..0DDA` | Indexed word OUT `0A05`: write mode 2, read mode 1 |
| `0521:0DDB..0DDF` | GC3 = `00` |
| `0521:0DE0..0DE3` | GC7 = `00` |
| `0521:0DEF/0DFA` | GC8 = glyph byte, then its complement |
| `0521:0DF3/0DFE` | `AND byte ES:[DI],AL`, foreground then background |
| `0521:0E07..0E16` | Restore GC5=0, GC8=FF, GC3=0, GC7=0F |

Inference: an unconditional FF read with GC7=0 lets these AND operations
produce the requested colors while refreshing the latches. The opposite
polarity makes those colors depend on old pixels. Test both interpretations;
keep the opposite one as a diagnostic countermodel.

## Implementation contract

- Four 64-KiB planes and four latch bytes; declare aperture, installed memory,
  addressing mode and initial registers. Unsupported modes must return an
  explicit boundary. EGA write mode 3 is not admitted by this profile.
- Every guest video read loads all four latches. Mode 0 returns the selected
  plane. Mode 1 compares enabled planes against the color-compare register.
  Diagnostic snapshots must inspect planes without changing latches.
- Mode 2 expands CPU color bits into planes, applies the logical operation
  against latches, then merges with GC8. Disabled map-mask planes retain
  destination memory; masked-off bits in enabled planes retain latch bits.
  Writes must not silently reload destination latches.
- Indexed `OUT DX,AX` sends the low byte to DX, then the high byte to DX+1.
  Preserve AX/FLAGS and preflight both effects before committing.
- Put device accesses behind the C guest memory API; Rust selects and reports
  the platform profile. Admit read effects as well as writes. Preserve the
  existing forbidden-ROM-font and resource-lifetime checks.
- Emit memory RMW using explicit ordered temporaries: admission, guest read,
  CPU operation/flags, guest write, IP advance. Rejection must preserve CPU,
  latches, planes and committed events. Yield only between complete operations.
- Declare low-address-first word reads and writes. Preflight both bytes.
  Retain the existing offset-FFFF word rejection until separately supported.
  DOSBox-X's C++ word-read expression alone does not establish evaluation order.
- Keep hardware CRTC cursor registers and BDA cursor words separate. Direct
  OUT must not synthesize BIOS memory changes; BIOS cursor services own those
  memory effects.

## Proposed tests; not yet executed

1. Comparison polarity: planes `[AA,00,00,00]`, compare color 0, read mode 1:
   GC7=0 gives FF; GC7=1 gives 55. Cover every one-hot plane and compare bit.
2. Execute the held glyph sequence with glyph A5, foreground 3, background C,
   map mask F. Expect planes `[A5,A5,5A,5A]` from zero and nonzero backgrounds;
   compare intermediate latches/FLAGS and independently decode eight pixels.
3. Read `[12,34,56,78]` at A; write color 5 to B initially `[A0,B0,C0,D0]`,
   bit mask 0F, map mask 05, replace operation. Expect `[1F,B0,5F,D0]` at B.
4. Cover replace/AND/OR/XOR, bit masks 00/FF/81, one-hot map masks, mode-0
   rotation/set-reset and mode-1 latch copies. Mode 2 ignores rotation/set-reset.
5. Use distinct neighboring bytes to check word latch order, mode-1 MOVSW,
   aperture edges, rejected second bytes and indexed-port ordering.
6. Compare original instructions with an independent pixel oracle and with
   compiled C/Rust, including instruction-budget pauses. Mutations of polarity,
   latch loading, port byte order and map masks must fail corresponding checks.
7. Keep deliberately divergent BDA/hardware cursor positions through direct
   CRTC OUT. Verify BIOS cursor effects separately.

Later Luna validation must pin the DOSBox-X binary/config and use hidden,
focusless GameLink. Device-model equivalence, observed emulator behavior and
physical hardware fidelity are separate claims. The next graphics checkpoint
is `0061` body `06CA`; complete main return, menu/demo, exploration, combat and
save/load remain required work.

## Staged implementation and current verification limit

SOL 6.1 wrote an original device implementation and fixed-width C ABI under
ignored `build/cok-recomp/staging/ega-device/`. Root reviewed its pure
preflight/checked commits and diagnostics, then compiled the DLL with MSVC
`/LD /W4 /WX`; compilation succeeded without warnings. GC5 Test Condition
bit 2 is explicitly unsupported, including atomic rejection of word OUT
0405. Production guest memory and graphics are not connected to this module.

Pinned SHA256 identities:

- C: `d223bb5ccd1895e407294c50811300f67c1f2046bcf637bade90bd410db35a43`
- Header: `e15d5f325f1bc82f2c5419e08ceacab0a10edcd85b4ab142fe19148ac28283d5`
- DLL: `9679a08beb3f3dd59869d223e27f7f1c804459a27e15c075a4d05b07bbff97e4`

Actual Luna 6 execution confirmed unchanged hashes, reset/profile metadata,
comparison-mask values, an atomic Test Condition rejection, and a single
masked mode-2 write. Its broader glyph harness incorrectly seeded background
while mode 2 was active and did not finish. **The independent suite is
inconclusive; no full pass or device failure is established.** A reproducible
SOL-written pixel-oracle harness is being prepared for the next Luna pass.
The original font/loading draw, full main and gameplay remain unexecuted.
### Completed independent Luna device pass

The reproducible SOL harness was subsequently executed by actual Luna 6.
It passed **539 completed named cases**, excluding setup operations, covering
the documented glyph/comparison/latch vectors, modes and logic operations,
rotation/set-reset, byte/word ordering, 128 deterministic pixel-oracle
operations, register readback, pure diagnostics/preflight and rejection
families. Rejection controls compare complete planes, latches, registers,
indices, profile and output values. Luna also executed a separate direct DLL
vector: plane 0 byte 96 read back as 96 with latches 96/00/00/00.

DLL/C/header hashes remained identical to the pins above. The executed
`verify_ega_device_readonly.py` harness SHA256 is
`ea4a788a594f62c3d02d4858643bea12183ef45224d4e85e3a71be259ef4951b`.
This completed pass supersedes the earlier incomplete hand-written harness;
it does not establish production integration, original main execution,
physical hardware behavior or execution of compiled mutation variants.
The module and test harness remain isolated pending guest-memory integration.