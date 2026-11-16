# CoK Task 192 — relocated setup-helper binding

Task 192 asks whether the two `0x521:0x353` calls near the held-party setup
path can be bound from the original overlay loader, and whether the target's
stack contract fits those callers. This is a static source pass over the
complete unpacked CoK START image, the raw `GAME.OVR` bytes, and the descriptor
fixup tables. It does not execute DOSBox or modify the focusless probe.

## Original overlay-loader relocation

The overlay read routine begins at complete START image `0xA168`. It reads the
code bytes into the allocated overlay segment from descriptor `[ES+0x10]`,
rounding the code size to a paragraph boundary before reading the fixup bytes.
The routine keeps resident START's load segment in `DI`: START image `0xA465`
stores `ES` at `DS:0x43A8`, and the loader loads that value at `0xA173`. After
the fixup words are read, `0xA1CC..0xA1D8` loads the allocated overlay segment
into `ES`, reads each listed code-relative offset, and adds `DI` to the segment
word at that offset. This is the loader's actual fixup operation, not the
synthetic probe's narrower rule for self-segment references.

Tasks 157 and 158 already established that the segment words for both
`GAME.OVR:0x3BC5E` and `0xFE59` are present in their descriptor fixup tables.
Thus the call operands resolve as `load_segment+0x521:0x353`. The complete
START image at offset `0x5210+0x353 = 0x5563` contains a valid routine:

| Image offset | Source bytes / behavior |
| --- | --- |
| `0x5563` | `PUSH BP; MOV BP,SP` |
| `0x5566` | reserves `0x104` bytes of locals |
| `0x556A` | loads the far pointer at `[BP+6]` |
| `0x5579` | calls `A46:0x0ADE`, complete START image `0xAF3E` |
| `0x5583`, `0x5589` | checks byte arguments at `[BP+0x10]` and `[BP+0x0E]` |
| `0x55EF` | returns with `RETF 0x0C` |

This is a source-backed target binding for both callsites under the original
loader's segment-fixup rule. It does not establish that either call is
naturally reached in the current fixture or give a live value for the START
load segment.

## Caller-frame comparison

At `0x3BC5E`, the caller pushes four word-sized scalar/byte values followed by
the far pointer `ES:DI`. At far-call entry the six words are:

| Target stack slot | Pushed value |
| --- | --- |
| `[BP+6/+8]` | `DI/ES`, the far pointer |
| `[BP+0xA]` | byte read from `SS:[DI+0x1E]` |
| `[BP+0xC]` | local byte `[BP-9]` |
| `[BP+0xE]` | byte read from `SS:[DI+0x22]` |
| `[BP+0x10]` | literal zero |

That is 12 bytes, matching `RETF 0x0C`; the callee's far-pointer load and two
byte checks align with the corresponding slots. The two intervening values
are consumed later by the routine and are not assigned semantic names here.

FDF2 at `0xFE59` also has a six-word frame after its immediately preceding
`A46:0x0AC4` call. That copy helper returns with `RETF 4`, consuming its source
far pointer while leaving the destination far pointer and four scalar words
for `0x521:0x353`. The target reads the pointer at `[BP+6/+8]` and compares
the values at `[BP+0xE]` and `[BP+0x10]`; the remaining argument bytes remain
opaque. The prior helper call is independent from the target's nested copy.

The routine at `0x5563` then pushes a `0xFF` limit, a local destination
`SS:BP-0x100`, and the caller's far pointer before calling `A46:0x0ADE`.
That resident helper maps to START image `0xAF3E` and uses the bounded-copy
frame documented in Task 155. The earlier `0xAF43` stop is five bytes into
this helper. Its first captured call returns to `0521:036E`, which matches
the nested call at `0x5579` in the bound `0521:0353` routine, and its
synthetic arguments (`limit=0xFF`, source `5000:6DA2`) match that caller's
pointer/limit setup. The later null-source observation returns to
`0521:0B0A`; it is a separate caller and cannot be assigned to the bound
`0x521:0x353` routine. Both captures remain synthetic: the fixture entered at
AEC9 with a synthetic overlay, and did not establish natural held-party
continuity or retail pointer provenance.

## Result and remaining boundary

Task 192 closes at a static, loader-backed target and a compatible argument
shape. It does **not** prove natural reachability, runtime `DS/ES/SS`, held
party continuity, a retail source pointer, or the values of the opaque scalar
arguments. Do not alter the unresolved-call guard or use the old synthetic
`AF43` null as retail evidence. Task 193 continues with an original
START/VROOMM loader route and captures the call frame only if retail control
flow reaches either callsite; it stops at the first unsupported prerequisite.
