# CoK M6: evidence for live Tandy and PC-speaker audio

2026-10-15. This is a source and documentation review. No game, REA, decoder,
test, build, or audio device was run for this note.

## Finding

The repository establishes that Champions of Krynn has Tandy SN76496 and
PC-speaker driver backends, but the retained evidence does not establish which
backend a gameplay route selected or whether either produced non-reset events
during gameplay. The current speaker/PSG implementation records register and
PIT state; it explicitly has no oscillator or clock owner. M6 therefore cannot
claim live speaker/PSG audio, and implementing a synthesizer from the current
receipts would require unsupported timing and device assumptions.

The static backend census identifies MIDI.DAX block 4 as writes to C0h (Tandy)
and block 5 as writes to 42h/43h/61h (PIT plus PC speaker). The five blocks map
to the five sound-type choices, not five songs
([PLAN-ROUND-32.md, item 5](../PLAN-ROUND-32.md); [sound-bank framing](cok-sound-bank-framing.md)).
This is evidence of available drivers, not runtime selection.

## What retained runtime evidence proves

`startup_platform.rs` loads and records sound-related assets for selected
profiles; availability of MIDI.DAX and SOUND.DAX does not identify the chosen
sound-type menu option. `irq_runtime.c` routes captured port writes into the
virtual device models. The captured receipt format preserves guest work,
PIT tick, event sequence, and source lease, but those coordinates have not
been calibrated to seconds or PCM sample positions.

The reviewed `intro` receipts have `through: intro` and one retained
speaker/PSG event. That event is reset/setup evidence, not a gameplay sound
trace. For example:

`build/cok-recomp/staging/intro-compare/create-race-admission-20261015-01/cases/checkout-one/speaker-evidence-60772-1792021435352840800/receipt.json`

It reports `event_total: 1`, `event_retained: 1`, and `complete: true`; its
binding says the fixture ran through `intro`. This does not prove non-reset
Tandy register changes, PIT reloads, speaker gate edges, or audible output in
the game.

## Hardware facts and model boundaries

| Topic | Source-backed fact | Boundary for this project |
|---|---|---|
| Tandy backend | The SX reference identifies a 76496 with three tone generators and one noise generator. The timer-channel-2 signal is connected as an audio input and mixed with the generator; port 61 bits 5/6 route output, and bit 4 can disable the internal speaker. | This describes a Tandy 1000 SX implementation. It does not prove CoK selected Tandy or that this exact board wiring/chip variant is the target profile. |
| PSG timing | The SX schematic shows a 3.579 MHz clock at the 76496. The TI SN76496 material in the manual gives tone frequency as input clock divided by four and the programmed period. | Do not apply this clock/divider until the intended target and exact chip profile are established. Related PSG variants differ in divider behavior. |
| Tandy PIT/audio mix | The SX manual specifies a 1.1925 MHz PIT clock and connects counter 2 to the sound circuit and port 61 bit 5. | The project’s virtual PIT profile is not this measured physical board. Nor does the current C0/61 model implement the SX analog mixing/multiplexer behavior. |
| PC speaker | The IBM-compatible path uses PIT channel 2 and port 61 gating; a faithful waveform depends on PIT programming, gate transitions, and a time base. | The project profile advances a virtual PIT from guest work using the fixed 65536/2000 ratio. It does not establish real-time CPU frequency or a work-to-sample conversion. |

The primary hardware reference used here is the [Tandy 1000 SX Technical
Reference Manual](https://www.lo-tech.co.uk/downloads/manuals/tandy/Tandy_1000SX_Technical_Reference_Manual.pdf),
including its PIT/sound-circuit description and reproduced TI 76496 data.
The repository’s earlier [PC/PIT/AdLib plan](cok-original-pit-irq-adlib-plan-2026-10-12.md)
also flags the C0 mapping as a virtual compatibility-board assumption that
needs an explicit profile.

In source, `csrc/speaker_psg.h` labels the board virtual and says it has no
oscillator/clock owner. `csrc/speaker_psg.c` accepts ports 61h and C0h,
records C0h tone/noise/attenuation registers, and derives a Boolean speaker
drive from the latch and PIT output. `src/startup_speaker.rs` calls the profile
`virtual-speaker-psg-v1` and scopes it to “registers; no PSG waveform.”
`csrc/pc_devices.c` implements the declared virtual PIT progression; the
`startup_platform.rs` intro profile fixes it at 65536/2000. These are
deterministic model choices, not evidence of the physical clocks above.

## Exact gaps before synthesis

1. **Selected route:** capture the actual SOUND TYPE selection and driver
   identity during gameplay; asset presence or static driver code is not enough.
2. **Real activity:** retain an in-game trace with non-reset C0h register
   writes and/or PIT 42h/43h reloads plus 61h gate changes, with work, PIT tick,
   event order, and source addresses. Confirm the receipt is complete.
3. **Target hardware profile:** establish the intended machine/chip variant,
   PSG clock and divider, C0h write/latch timing, initial phase/reset behavior,
   noise polynomial/seed, attenuation curve, and output polarity/mix.
4. **Speaker timing:** establish PIT mode/count/gate semantics on the actual
   selected path, including the work-to-real-time/sample mapping and the
   waveform edge behavior. The current `65536/2000` virtual ratio cannot be
   treated as a sample clock.
5. **Mixer ordering:** define deterministic ordering against OPL events at
   equal guest timestamps after the source clocks are grounded.

## Recommended next step

Collect one authentic gameplay route trace that binds the selected sound-type
driver to non-reset device writes and complete event receipts. Review that
trace before choosing a Tandy or PC-speaker profile. Until then, keep the live
audio acceptance claim to the implemented OPL path and leave speaker/PSG
events captured but unsynthesized.

## Adjacent WASAPI startup finding

The source-only WASAPI correction now leaves the endpoint stopped after native
initialization. The worker primes every available endpoint buffer space with
source PCM before each `Start`; it waits without moving queue/resampler state
when PCM is insufficient, and only pads a short final EOS tail. This follows
Microsoft’s [rendering example](https://learn.microsoft.com/en-us/windows/win32/coreaudio/rendering-a-stream),
which fills the shared endpoint buffer before `IAudioClient::Start`, and the
[Start guidance](https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudioclient-start)
to load initial render data before starting. Authored order, pause, padding,
and EOS controls remain unrun. `Stop`/`GetBuffer`/`Start` behavior on a real
event-driven endpoint and audible recovery still require runtime verification;
this code change is separate from the missing CoK speaker/PSG device paths.

Luna's subsequent source-only review found that the worker's queue length was
captured before a WASAPI event wait that can last up to 100 ms. If the producer
published PCM during that wait, the stale count could incorrectly trigger an
underflow stop and increment the underrun counter. The worker now refreshes
queue length and stop/EOS state after the wait, before calculating the needed
source window and applying the underflow gate. An authored control models PCM
arriving during the wait. It was not run under the Defender execution hold;
this is source-level progress only, not endpoint or audible-playback evidence.
