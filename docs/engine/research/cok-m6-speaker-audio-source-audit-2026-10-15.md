# CoK M6 speaker/PSG audio source audit

2026-10-15. Source-only review; no REA, decoder, test, build, or application
was run for this note.

## Finding

M6 cannot yet treat speaker/PSG audio as inapplicable. The retained sound-driver
evidence identifies real CoK backends for both devices: `MIDI.DAX` block 4 is
the Tandy SN76496 path writing port `C0h`, and block 5 is the PC-speaker path
writing PIT ports `42h`/`43h` and speaker control port `61h`
(`docs/engine/PLAN-ROUND-32.md`, item 5; `docs/engine/research/cok-sound-bank-framing.md`).
The CoK M6 table consequently asks for “applicable speaker/PSG audio” alongside
live OPL (`cok-rea-full-game-plan-2026-10-15.md`, M6).

This establishes that CoK supports those hardware backends, not that the
current guest route has produced audible gameplay sound. The DWF2 cold-Add
acceptance was a menu/character-load route, and the source capture is a virtual
receipt model. No retained gameplay trace reviewed here proves the driver
selected at runtime, the sound events reached either backend during play, or
the resulting waveform.

## What the current capture represents

`rust/cok-recomp/csrc/speaker_psg.c` records writes to `61h` and `C0h`, models
the Tandy register latch/tone/noise/attenuation state, and derives a Boolean
speaker drive from `61h` gate bit 1 and the current PIT channel-2 OUT. It has no
oscillator, phase accumulator, or synthesis clock (`speaker_psg.h` explicitly
labels it a virtual compatibility board with no oscillator/clock owner).
`src/startup_speaker.rs` serializes that state and event receipts; its profile
states “registers; no PSG waveform.” Each event includes guest `work`, and the
runtime wrapper also retains `pit_tick` and global event sequence. Those are
useful ordering/evidence coordinates, not PCM timestamps by themselves.

`pc_devices.c` advances its modeled PIT by the declared rational conversion
`65536/2000` ticks per guest work unit and applies a bounded mode-3 profile to
channel 2. This gives a deterministic virtual PIT state progression. It does
not declare an oscillator clock in hertz or prove that one guest work unit
corresponds to a physical CPU cycle. The existing OPL source clock
`3,579,545 Hz` and the plan's three-to-one PIT/work ratio do not establish the
Tandy PSG clock, its divider formula/profile, or the physical-time scale of
the guest route. Applying the OPL clock to the PSG would be an unsupported
assumption.

## Why no oscillator was added

The Tandy port model exposes tone divisors, attenuation, noise control, and
reset receipts, but no reviewed source binds this profile to the exact
SN76496 clock/divider, output polarity, noise polynomial/width, or phase-reset
semantics required for sample-accurate output. The PC-speaker path has PIT
channel-2 state and a gate, but PCM generation still needs a documented virtual
time-to-sample mapping and explicit edge/phase handling. Both would require
inventing audio behavior if implemented from these receipts alone. They must
remain captured-but-unsynthesized until those device contracts and timing
inputs are grounded.

## M6 follow-up evidence

Before implementing a mixer, retain a gameplay route trace that identifies the
selected `MIDI.DAX` backend and proves non-reset sound activity (Tandy `C0h`
register changes and/or PIT `42h`/`43h` reloads plus `61h` gate edges), with
monotonic `work`, `pit_tick`, and global ordering. Then resolve and document:

1. the declared PSG chip variant and its source-backed input clock, divider,
   noise generator, and reset semantics;
2. the virtual clock's mapping to output sample time, including how the
   current PIT channel-2 state becomes speaker edges;
3. deterministic merge ordering with OPL events at equal guest timestamps.

Only then add a source-clocked device renderer and mix its samples with OPL
before the existing endpoint resampler. Keep guest work progression and device
register writes unchanged; if the bounded PCM queue lacks headroom, pause guest
advancement through the existing frontend gate.

## Volume and mute control

M6 explicitly includes mute/volume. A source-only implementation now adds an
app-owned **Audio** menu with 25%, 50%, 75%, 100%, and Mute. Mute retains the
last nonzero menu selection and toggling it restores that level. The window
passes its bounded percentage to the live frontend, which publishes it to the
WASAPI worker through an atomic; the worker applies integer gain to its
resampled device buffer before native format conversion. It does not change
renderer source PCM, guest timing, event receipts, or optional WAV evidence.
No gameplay keys are reserved for volume controls. Authored controls cover
unity, half gain, zero gain, clamping, the menu's initial 100% value, and
mute/unmute state wiring. Those controls and the native menu have not been
compiled or run under the active execution hold.

## Reviewed source anchors

- `docs/engine/PLAN-ROUND-32.md`, item 5: block-to-backend mapping.
- `docs/engine/research/cok-sound-bank-framing.md`, sections 1–3: CoK sound
  stream framing and Tandy/PC speaker backend identity.
- `docs/engine/research/cok-original-pit-irq-adlib-plan-2026-10-12.md`, port
  `C0h` compatibility-board discussion: virtual Tandy PSG boundary.
- `docs/engine/research/cok-rea-full-game-plan-2026-10-15.md`, M6: live OPL
  and applicable speaker/PSG, plus mute/volume requirements.
- `rust/cok-recomp/csrc/speaker_psg.{c,h}` and
  `rust/cok-recomp/src/startup_speaker.rs`: current register/event-only
  implementation.
- `rust/cok-recomp/csrc/pc_devices.c`: virtual PIT/work conversion and
  channel-2 mode-3 state progression.
- `rust/cok-recomp/src/audio_wav.rs`: current OPL source rate/output policy;
  it is not evidence for a PSG clock.

## Luna integration audit — static only

The current live PCM route is source-connected from the OPL renderer through
the bounded sample queue and resampling worker to shared-mode WASAPI. The
Windows `build.rs` integration includes the WASAPI source and `ole32`; the
frontend enables live audio only for non-headless sessions and gates guest work
on queue headroom. The Audio menu's percentage/mute state is passed to the
worker through an atomic, where gain is applied to the resampled device buffer.
This confirms the source wiring only; no Windows compilation or endpoint test
was run.

There is no current mixer input from `speaker_psg.c`, `startup_speaker.rs`, or
PIT channel 2. The gameplay backend selection, endpoint lifecycle, audible
output, pause/end-of-stream behavior, and audible gain/mute remain unverified.
Do not add a PSG renderer until the source-backed chip clock and deterministic
virtual-time-to-sample mapping described above are established. The next
runtime gate, after the Defender hold is lifted, is Luna verification of OPL
endpoint priming, underflow, pause, end-of-stream, audible playback, and gain/
mute; this static audit does not lift that hold or satisfy it.

## Luna mixer integration decision — static source review, 2026-10-16

Do not add a speaker/PSG PCM producer or mix it into the WASAPI queue from the
current source contracts. The current records do provide a deterministic
**virtual** coordinate system: `pc_reset(..., 65536, 2000)` advances PIT ticks
from guest work with a retained rational remainder; `PcEvent` carries work,
PIT tick and per-PC-event sequence; the enclosing `IrqRuntimeEvent` carries a
global sequence. Board receipts carry guest work, PIT tick and the same global
event sequence. OPL independently maps work to its declared source clock with
`work * 196608 / 2000`, and live queue reservation converts that OPL clock to
48 kHz samples. This is enough to preserve ordering and reconstruct the
declared virtual PIT/board state when the complete event streams are available.

It is not enough to select a faithful speaker waveform. The clock ratios are
prototype virtual profiles, not a calibrated guest-CPU-to-seconds contract.
The PC model records PIT output/load transitions, but its channel-2 audio
mapping, edge timing within a guest-work quantum and relation to the OPL source
clock are not grounded as physical output. The C0h board retains register
values and resets, but defines no chip input clock, divider, output/noise
polynomial, phase or analog level. The retained traces also do not show that a
gameplay route selected either backend and emitted non-reset sound events.
Consequently, synthesizing the current receipts would turn deterministic
virtual state into an assumed sound rather than implement an evidenced device
contract. The OPL-only producer remains the only source connected to the live
PCM queue; speaker/PSG stay evidence-only.

Next evidence before implementation: capture an actual gameplay route with
the selected SOUND TYPE/driver identity; require complete globally ordered
records showing non-reset C0h writes or PIT channel-2 reload/output/gate
activity; then establish the target board/chip clock, divider, reset/phase,
noise and output mapping, and explicitly define how the declared source-work
clock maps to PCM time. Only after those points are resolved should a host
renderer consume the board/PIT event streams, merge against OPL by global
sequence at equal guest coordinates, and publish one mixed stream through the
existing bounded queue. No guest I/O or device state transition should change.
No scripts, tests, builds, compilers, applications, REA or DOSBox ran for this
review; any future integration requires the execution hold to be resolved and
the resulting source/tests to be executed and reviewed.
