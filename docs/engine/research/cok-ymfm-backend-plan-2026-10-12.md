# CoK YM3812 backend source plan — 2026-10-12

Status: source-only research. No backend was built, executed, installed or tested by this research pass. The full-game reconstruction objective remains in place; this is the sound-device integration portion of it.

## Local source provisioning

After this research pass, the root agent cloned the official repository into
ignored `build/cok-recomp/third-party/ymfm` and checked out the revision below
with a detached HEAD. Local `rev-parse HEAD` confirms the exact pin and Git
reports a clean dependency checkout. The retained source-only receipt at
`build/cok-recomp/third-party/ymfm-source-provenance.json` records SHA256 for
the license and nine required source/header files. No backend was compiled or
linked, and no audio or fidelity tests were run during provisioning.

## Upstream pin and source closure

Pin Aaron Giles's official `ymfm` repository to **`81aec25ccbb98f4873a255f7551ac4dadac59b4a`**, the default-branch head returned by GitHub's API during this pass (commit timestamp 2026-07-27 15:11:55 UTC).

- [Pinned repository](https://github.com/aaronsgiles/ymfm/tree/81aec25ccbb98f4873a255f7551ac4dadac59b4a)
- [YM3812 public API](https://github.com/aaronsgiles/ymfm/blob/81aec25ccbb98f4873a255f7551ac4dadac59b4a/src/ymfm_opl.h)
- [YM3812 implementation](https://github.com/aaronsgiles/ymfm/blob/81aec25ccbb98f4873a255f7551ac4dadac59b4a/src/ymfm_opl.cpp)
- [Interface and state serialization](https://github.com/aaronsgiles/ymfm/blob/81aec25ccbb98f4873a255f7551ac4dadac59b4a/src/ymfm.h)
- [FM engine](https://github.com/aaronsgiles/ymfm/blob/81aec25ccbb98f4873a255f7551ac4dadac59b4a/src/ymfm_fm.h) and [template implementation](https://github.com/aaronsgiles/ymfm/blob/81aec25ccbb98f4873a255f7551ac4dadac59b4a/src/ymfm_fm.ipp)
- [Example integration](https://github.com/aaronsgiles/ymfm/blob/81aec25ccbb98f4873a255f7551ac4dadac59b4a/examples/vgmrender/vgmrender.cpp)
- [License](https://github.com/aaronsgiles/ymfm/blob/81aec25ccbb98f4873a255f7551ac4dadac59b4a/LICENSE)

The upstream README specifies C++14. For an unmodified upstream build without depending on dead-section elimination, the smallest reliable source closure inferred from references is `ymfm_opl.cpp`, `ymfm_adpcm.cpp`, and `ymfm_pcm.cpp`, plus the adapter. Keep their corresponding headers and `ymfm.h`, `ymfm_fm.h`, `ymfm_fm.ipp`. There is no separate FM `.cpp`: its engine is templated. ADPCM and PCM are needed because the OPL translation unit also defines Y8950 and OPL4 methods, even though the instantiated YM3812 itself uses neither. Reducing this to one `.cpp` would require verified linker elimination or a maintained source split; it is unnecessary for the first backend. This closure has not been compile-verified here.

BSD-3-Clause permits source and binary redistribution with required copyright/license/disclaimer retention; preserve notices and include the license in binary distributions. It does not grant rights to SSI game material.

## API and proposed Rust boundary

`ymfm::ym3812` takes a `ymfm_interface&`, exposes `reset`, `write_address`, `write_data`, `write(offset,data)`, `read`, `read_status`, `generate`, `sample_rate`, and `save_restore`. YM3812 output is mono, backed by signed 32-bit sample data. Keep synthesis in C++ and use a narrow C ABI rather than exposing C++ class layouts to Rust.

Proposed opaque-handle operations:

- create/destroy a context owning interface, chip and continuous input-clock position;
- advance to an absolute input-clock timestamp, returning complete native mono samples;
- write a port offset (0 = address, 1 = data) at an absolute timestamp, advancing first;
- optional read at a timestamp;
- query/save/load complete versioned state.

Use fixed-width C types and explicit output buffer capacities/counts. No exception may cross the ABI. A safe Rust owner controls destruction and exclusive mutable access. Put all register writes and chip generation on one execution thread; the audio callback consumes a queue of already produced PCM and never mutates the chip. Return samples as int32 until an explicit, documented output conversion clips or scales them. Avoid per-block normalization, which changes dynamics.

At the pinned source, the constructor initializes the address latch to zero, while `ym3812::reset()` resets the FM engine alone. Define adapter reset semantics explicitly; reconstruct the context when a new instance is intended, and do not assume the API reset also clears every host/latch state.

CoK's original MIDI3 evidence supplied to this pass is OUT8 through DX=0x388/0x389 only, with no IN or OPL timer programming found. Feed both address and data writes in their original order, including the 120 initialization register pairs. Retain the original delay loops (32/12); do not replay a simplified note list or invent new instruments. These are current CoK findings supplied by the implementation agent, not independently re-measured here.

## Continuous virtual time

The YM3812 engine uses 18 operators and default prescale 4: one native generated sample advances **72 chip input clocks**. `sample_rate(clock)` returns integer `clock/72`; the physical ratio can have a fraction. Keep the scheduler/resampler based on the exact rational clock ratio, rather than repeatedly rounding `sample_rate` or durations. With a proposed clock of 3,579,545 Hz, the nominal rate is approximately 49,715.9 Hz; the exact board clock is a configuration/evidence question.

The current virtual PIT clock is `floor(work * 65536 / 2000)`. The proposed OPL clock is `floor(work * 196608 / 2000)`, exactly three times the underlying PIT scale before flooring. Compute both from the same monotonically increasing work origin with sufficiently wide arithmetic and retained fractional position. These formulas describe the runner's planned virtual timing policy. They do not establish CPU cycles, real board timing or PCM fidelity.

Advance synthesis before each timestamped write and at normal execution milestones even when there are no writes: sustained tones, envelopes, vibrato, noise and releases continue during silence in the command stream. Preserve ordering for events sharing a timestamp. Define a reproducible boundary convention for writes between native sample boundaries; ymfm's public generation API advances whole samples, so it does not expose arbitrary sub-sample oscillator stepping. Do not claim cycle-exact write behavior from the adapter.

The source's busy callbacks request 12*prescale (48) input clocks after address writes and 84*prescale (336) after data writes. They mark a busy-end time; the write methods still apply the write immediately. Therefore this callback is not an instruction to sleep or add delays to MIDI3. Retain source timing and record any observed timing discrepancy rather than adding a second delay mechanism.

`ymfm_set_timer` asks the host to schedule timer expiration in input clocks; negative duration cancels. Dispatch expirations through `m_engine->engine_timer_expired` when due. `ymfm_sync_mode_write` and interrupt checks must operate at synchronized time. The supplied CoK music path does not appear to program timers, but keep a sound implementation of these callbacks for future routes rather than silently claiming broad device compatibility from this path.

Resample native output to the obtained audio-device sample rate using a persistent fractional phase and retained filter/interpolation history. A first explicitly approximate interpolation implementation can make the original stream audible; its quality and aliasing remain measured concerns. Do not reset phase at UI frames, execution batches, music callbacks or tracks unless a hardware/game reset demands it. Queue buffering changes latency, not virtual pitch or tempo. Define underrun handling and prevent dropped samples from silently changing emulated elapsed time.

## Save/reload and limits of evidence

Use `ymfm_saved_state` plus `chip.save_restore`; it serializes the address latch and FM state. Save the adapter's absolute clock, native-sample boundary/remainder, busy end, scheduled timers/IRQ, resampler history and queued-audio policy separately. Version the state with the upstream commit, chip model, clock and output/resampler configuration. Validate blob lengths before restore: upstream state reads beyond the buffer return zero, so truncated state must not be silently accepted. Clear stale device audio on load and restore the appropriate post-load queue policy.

The upstream source simulates YM3014 DAC mantissa/exponent truncation with `roundtrip_fp`, but its YM3812 mixing comment says details need verification. The README explicitly says 100% digital accuracy is not its goal. Consequently selecting this backend establishes an implementation choice, not audible correctness, original tempo, silicon equivalence or full-game completion. Subsequent evidence should include original write-stream comparison, timestamp and batching continuity, save/reload continuity, and listening/recording on relevant full-game routes using Luna's runtime pass. No such evidence was collected in this source-only pass.

## Implementation milestone agreed 2026-10-14

Astra's reviewed local plan is
`build/cok-recomp/staging/intro-compare/ymfm-audible-milestone-plan.md`.
Sol is implementing a Rust-owned renderer with a separate C++ ABI, shared by
offline `render-opl` and `startup --audio-wav`. Synthesis consumes committed
OPL events after guest execution returns; the C observer remains copy-only.
The initial source handoff preceded build and audio testing; subsequent results
are recorded below.

The declared first rendering policy is mono PCM16 at48,000Hz, virtual chip
frequency3,579,545Hz,72-clock native boundaries and causal linear interpolation
with72-clock latency. Timer0, timer1 and sample generation precede guest writes
at the same boundary. Buffer exhaustion reports explicit partial progress.
Full-timeline WAV and provenance evidence must preserve source timestamps;
an optional listening excerpt records its offset and does not reset synthesis.

Luna must verify batching, direct-upstream PCM comparison, resampler phase,
state continuity, failure handling and the actual source-song render. Audio
enabled/disabled runs must retain identical guest/register effects. A WAV is
an intermediate audible artifact; live output, an interactive frontend and
original gameplay/save/load still require implementation and evidence.

The first isolated release build succeeds with binary SHA256
`326895dad71abb044daaff6c02c0744fbf974d0fc0078388e1dea39395906cf3`.
Luna's focused tests report four passes and one failure:
`renderer_suffix_phase_and_atomic_load` reports `resampler skipped native interval`.
All1,287 inputs remain unchanged in Luna's and root's postchecks. The binary
and failing test executable are archived before repair. Direct-upstream
harnesses and actual source-song rendering have not yet run.

Static diagnosis finds that an integer boundary-minus-one cutoff can omit a
rational output time within the last fractional clock before a native sample
boundary. Sol's repair awaiting testing uses the exact strict rational cutoff,
preserving the original suffix assertions and adding a fractional-gap oracle.
A separate exclusive sidecar-publication fix preserves existing output files.
The repaired release build succeeds with binary SHA256
`360f86255288d8acd1a94a6cd53b305675a66ccafa26dd8f640a3e6cf2146953`;
all five focused tests pass. Root independently verifies1,291 inputs unchanged.

The adapter capture harness initially fails MSVC compilation because it lacks
an explicit `<string>` include. After that isolated harness fix, both harnesses
compile and synthetic verification passes: direct-upstream native PCM, chip
state and endpoint metadata agree at buffer capacities1/7/4096 for the musical
and timer schedules. Frequency/boundary/drop controls change PCM; a duplicate
same-value write changes the write count. All12 harness invocations exit0.
The verified1,293 source and1,795 Python runtime inputs remain unchanged.
Evidence: `staging/intro-compare/audio-harness-repair-run-00465f3f15744f6b9fb8e3445ff5380c`;
verification SHA256 `29a4686a348084524425a8fd3e552a2cb568730fe5d7999d36dcf97a03aacf2b`.
Actual source-song and full regression results follow below. Exact callback
continuity, additional failure controls and listening remain unfinished.

## Verified source rendering and reproducible preparation — 2026-10-14

Offline rendering consumes the complete 12,260-event source trace through
work 8,000,000/clock 786,432,000. Direct ymfm and the adapter agree on native
PCM and full chip state; an independent rational calculation checks every WAV
sample. Output is 10,545,679 mono PCM16 frames at 48 kHz, with 4,950,824 nonzero
frames, peak 7,539 and zero clipped samples. WAV SHA256:
`ebd8a2fba693fb4e7929d6de5b66ed6e181924259370834ed7519d45e5a56afa`.

The full Rust suite initially reports 81 passes and 20 failures. Seven test
fixtures omitted the newly leading Machine.irq pointer, corrupting budget
instead of injecting FLAGS knowledge. Stable C accessors replace those casts;
all original assertions remain, and an accessor invariance regression is added.
The rebuilt suite passes 102/102. Root independently confirms 1,299 unchanged
inputs. Numeric FLAGS and guest execution semantics are unchanged by the fixture
repair; the metadata setter is not called by production execution.

An actual integrated source run with WAV enabled then preserves all 71
checkpoints and both complete raw traces byte-for-byte. Its WAV also matches
the offline artifact exactly. Candidate SHA256:
`d681c2cf913d05320a875778154a33cd1d31ba56bea0a7b49ed965075a14cb71`.
Evidence: `staging/intro-compare/integrated-audio8m-f097c884/integrated-audio-verification.json`,
SHA256 `f1ccada357eb984f9022187318e77efac1e1484d275a7d2f89e6d69500480090`.
The expected budget stop is status 2; original cleanup has not been reached.

`prepare_ymfm.ps1` now reproduces the ignored pinned dependency explicitly.
The accepted source hashes describe CRLF checkout bytes: a failed LF clone is
retained, and all ten files are proven identical after line-ending comparison.
Fresh clones use a fixed CRLF checkout policy, without changing metadata hashes
or normalizing files after checkout. A genuine fresh clone and 26 preservation,
rejection and idempotence controls pass. Root independently rechecks 22 source,
vendor, Git-state and tool inputs unchanged. Evidence:
`staging/intro-compare/ymfm-provision-crlf-ceb0fa97`.

These results establish rendered source music under the declared virtual clock.
Live speaker output, a persistent frontend, menu/gameplay/save/load, full original
IRQ-note comparison and listening remain unfinished. First-initializer parity
does not resolve the separately recorded original/C RAM provenance limitations.
