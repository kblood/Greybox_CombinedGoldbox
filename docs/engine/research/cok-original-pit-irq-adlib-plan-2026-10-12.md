# Original CoK PIT, IRQ and AdLib continuation

Astra static planning pass, 12 October 2026. The original-only normal path returned from main initialization and reached an actual immediate OUT43/36 boundary. This document records byte-checked source findings, primary-document inputs and a proposed device contract; it does not claim implemented devices or intro/menu execution.

The next implementation must support **two distinct IRQ0 installations and the loaded AdLib driver**. Implementing only `07E8:12C5`, or only PIT/PIC/speaker ports, will not execute the held normal intro.

This is a read-only static planning memo. I used the complete EXEPACK reconstruction, Capstone, the held assets and the named original-only boundary artifact. I performed no edits, builds, game execution, DOSBox work or agent delegation. Changing production output is not acceptance evidence.

**Evidence and scope.** The supplied original-only run reaches resident `0000:0140` at work `3976365`, with the reported successful resource loads and 47 empty keyboard peeks. The named boundary artifact confirms work `3989835`, physical `1661:0310`, `AX=2536h`, `DX=035Ah`, and unsupported byte output to port `43h`.

Static asset identities checked:

| Asset | SHA-256 |
|---|---|
| `START.EXE` | `e51d88ecef07cffe4a14036de3dbdc6ce7e7ff0db7482f3771d6f99eb7bbb956` |
| `GAME.OVR` | `c3f448c391ea860f97dec99ce88b0b8b0a4a7e807cf3b1f5a8f1515e2a7a0529` |
| `MIDI.DAX` | `5a06d9fc975ab9423d43f63d5cbdb0b02b1658cb5391baf54238ab1e9b1579bd` |
| Decoded `MIDI.DAX` member 3 | `fdad7a58082fd87758c3b71075daf02739869ddcc203d92ac23e5a462127ec5b` |

Addresses below are unrelocated source identities unless explicitly described otherwise.

1. **Implement the actual held intro route first.**

   Resident `015B` calls descriptor `003B:0025`, body `063C`. That body sets `[5780]=1`. Since held `[577A]=2`, it executes:

   - `003B:0661 → 0661:000A`: load MIDI member `sound+1`, therefore **member 3**.
   - `003B:0666 → 0661:02E6`: install the intro IRQ0 handler.
   - `003B:0671 → 0661:014D`: load `SOUND.DAX` member 1 into slot 2.
   - `003B:067A → 0661:02B3`: start slot 2 through the loaded driver.

   `0661:000A` loads, allocates and copies the executable resource using original code. Its callable pointer is `[4A76:4A78]`; original allocation ownership is retained separately at `[4A7A:4A7C]`.

   The relevant resident bytes are:

   | Source | Literal operation |
   |---|---|
   | `02EB..02F5` | DOS get-vector `08h`; save at `CS:02DF/02E1` |
   | `02FA..0305` | DOS set-vector `08h` to relocated `0661:035A` |
   | `0307` | Set chain divider `CS:02E3=3` |
   | `030E/0310` | `B0 36 / E6 43`: `OUT 43h,AL` |
   | `0312..0319` | `AX=5555h`; output low and high bytes to **40h** |
   | `0325..0333` | Restore saved vector |
   | `0335..033C` | Output `FFh,FFh` to **40h**, without another control word |

   **The custom intro vector is already installed before the observed stop.** There are no PIT counter reads or latch commands in this installer or its cleanup. Counter-latched reads are therefore not a prerequisite demonstrated by this source window. Working time and IRQ delivery are prerequisites: the earlier startup also polls BDA time, and interrupts can occur around the vector-install/programming sequence.

   The immediate-port transport test must retain `DX=035Ah` across `0310`, `0315` and `0319`. Never rewrite DX to make an immediate port fit a DX-based interface.

2. **Admit the executable resource and its real hardware effects.**

   Held MIDI member 3 is **2,151 bytes**, with:

   - Entry `0000 → 035B`, an AH-dispatch wrapper.
   - Dispatch table `0355`: AH=0 → `03EE`, AH=1 → `0376`, AH=2 → `03E3`.
   - AH=1 records caller CX as the song segment, initializes state and hardware, and executes `CLI`/`STI`.
   - AH=0 advances the source event interpreter.
   - AH=2 stops playback and resets hardware.

   Its executable span `035B..0866` is 1,292 bytes; tables and mutable state precede it. This is a bounded resource-code admission task, not an invitation to decode its data tables as instructions.

   The driver writes **DX ports `0388h/0389h`**. For example, `0836` clears selected registers through `0840/0847`, then writes attenuation values through `0858/085F`. I found no PIT reads or writes in this decoded driver code span.

   Thus the normal held intro requires an observable OPL register device in addition to PIT/PIC. Implement address selection, register writes, key-on/frequency/instrument state and ordered events. Timer/status behavior must be implemented when admitted accesses require it; no constant success/status stub. Host waveform synthesis can follow this device-state milestone. Yamaha’s register and timer definitions are in its [YM3812 application manual](https://c64.xentax.com/media/Yamaha_YM3812_Application_Manual.pdf).

   Do not conflate the literal value `C0h` written as an **OPL register address to port 388h** with the later actual **port C0h** accesses.

3. **Execute both source IRQ handlers, including their different EOI behavior.**

   `0661:035A` executes `STI`, saves AX/BX/CX/DX/ES/DI/DS/SI, then issues **early EOI** at `0365`. If `CS:02E5` is clear, it sets that reentrancy flag, sets DS to relocated `0BC6`, calls `[4A76]` with AH=0, and clears the flag.

   Every invocation decrements `CS:02E3`. At zero it reloads 3, restores registers and **far-jumps** through the saved vector at `039F`. Other invocations restore registers and `IRET`.

   Consequences:

   - IRQ0 can reenter after the early EOI while IF is enabled.
   - The source reentrancy flag suppresses the driver call, not the entire nested handler.
   - Nested invocations still decrement the chain divider.
   - A chained BIOS handler may issue another EOI. Execute it literally; do not manufacture an “exactly one EOI per handler” rule.

   Intro cleanup is explicit: `003B:006D` calls driver stop through `0661:0353`, then `0661:00DA`. The latter restores the vector through `0321` **before freeing** the driver and sound allocations. Preserve that ordering and observe outstanding frames during cleanup.

   After intro return, resident `0160` calls `07E8:00DA`. This installs the second handler:

   | Source | Required behavior |
   |---|---|
   | `12CC..12D6` | Save current vector 08 at `CS:12C1/12C3` |
   | `12E1..12E7` | Install relocated `07E8:1333` |
   | `12EA..12EC` | Write **B6h to 43h**, configuring channel 2 |
   | `12EE..12F5` | Write **B1h,13h to 40h**, affecting channel 0 |
   | `1333` | `STI`; save source-selected registers |
   | `1396/1399` | Call `13C0` and `1435`, protected by `[0121]` |
   | `13A1..13B1` | Decrement divider `[0120]`, reload `0Dh`, far-chain |
   | `13B6..13BF` | Otherwise send EOI to 20h and `IRET` |

   Preserve the unusual **B6h/40h combination**. Channel 0’s existing access mode survives a control write selecting channel 2. On the normal sequence, its established low/high mode allows the subsequent writes to load `13B1h`.

   Held sound 2 selects `168B` for commands 2..12; sound 3 selects `16F7`. Nevertheless, the handler calls both sound routines. `1435` reaches `14B2`’s `9F/BF/DF/FF → C0h` sequence when inactive. **C0h traffic is not confined to a sound-3 acceptance case.**

   `13C0` can write channel 2 at `1420/1424`, then reads/modifies/writes port 61h at `142C/1432`. `1435` can emit active C0h traffic at `1484`, `148D`, `14A3`, or the inactive sequence. Cleanup `12FA` restores vector 08, writes `FFFFh` to channel 0, clears port 61h bits 0/1 and emits the four C0h silence commands.

   This checked closure contains no PIC mask writes. Support for arbitrary PIC reinitialization is not a prerequisite established here.

4. **Use one deterministic device clock and one owner of BIOS ticks.**

   Proposed profile: retain the accepted diagnostic scale by declaring

   ```text
   PIT input ticks = accumulated source work × 65536 / 2000
   diagnostic elapsed milliseconds = source work × 55 / 2000
   ```

   Maintain integer quotient/remainder; never round each instruction independently. This gives an unmodified divisor-65536 timer one nominal period per 2,000 work units. It is a declared virtual oscillator, **not physical CPU cycles or an assertion of historical frequency**.

   Version this as a new IRQ-enabled profile. Record initial PIT phase, work phase, BDA tick value, DOS-time epoch and pending interrupt state. Do not silently reinterpret the existing host-tick baseline.

   Preserve `instruction-work-before-effects` ordering: advance devices for the charged source instruction, perform its effects, then recognize eligible interrupts at the architectural boundary. Define that ordering identically in both execution paths. Avoid charging the interrupted instruction twice when resuming.

   Source handler instructions and source driver delay loops consume work normally. Host execution time, trace formatting and service implementation loops consume none. BIOS service transitions need an explicit shared cost contract; use zero synthetic source work for the initial interface model.

   **Remove direct periodic host increments of BDA time in this profile.** PIT edges request IRQ0; only execution of the declared BIOS timer service updates BDA time. Chaining reaches that service once. DOS time should retain the diagnostic 55-ms conversion of the BIOS service’s monotonic tick count, with a separate midnight policy. Raw PIT time remains available for device scheduling.

   Divisor changes affect future timer behavior, not elapsed work or accumulated fractional time. Do not reset the global clock when programming a counter, yielding, loading an overlay or restoring a vector. Do not replace the source divide-by-3/divide-by-13 chains with host frequency compensation.

5. **Implement a shared C device, checked against an independent native reference.**

   Add proposed `csrc/pc_devices.c/.h` with explicit reset, advance, port-read/write, IRQ-acknowledge, snapshot and event interfaces. Rust owns session orchestration; the C component owns production hardware state.

   Separately implement a small native Rust reference model with no calls into production C and no generated/shared transition logic. Expose it to the original-instruction oracle through an in-process interface or batched protocol. Compare both standalone device transcripts and complete original-versus-translated execution. A reference using the same C device would only test translation, not device semantics.

   Required PIT state includes per-channel control/access mode, reload register, current counting element, read/write byte phase, latched count, pending load, gate and output. Support binary mode 3 and the counter-latch command first; retain explicit boundaries for unsupported modes. Zero represents 65,536; `FFFFh` remains 65,535. Model odd divisors, mode-3 count reads, output transitions, gate retriggering and mode-specific deferred reloads. A latch captures a stable count without stopping counting; an unlatched two-byte read must not secretly become a snapshot. These semantics come from the [Intel 8253 datasheet](https://web.cecs.pdx.edu/~mpj/llp/references/8253.pdf).

   PIC state must distinguish IRR, IMR and ISR. In the initial edge-triggered, fixed-priority, non-auto-EOI profile, a timer edge sets a pending request; acknowledge transfers eligibility into in-service state. Repeated requests coalesce in the pending bit rather than forming an unlimited interrupt queue. ISR priority blocks delivery independently of IF. Non-specific EOI clears the highest-priority active ISR bit, not a software frame. Preserve a new pending request while the preceding interrupt is in service. See the [Intel 8259A datasheet](https://studylib.net/doc/27807490/8259a).

   Declare the motherboard interface explicitly:

   - Port 61h bit 0 controls gate 2; bit 1 controls speaker data enable.
   - Derive speaker drive transitions from channel-2 output and speaker enable.
   - An AT-compatible port-61 profile exposes output 2 in bit 5 and refresh-derived bit 4; a PC/XT PPI profile has different readback. Do not mix them accidentally.
   - If choosing AT-style readback, channel-1 refresh behavior also needs a declared clock/state model. IBM documents the timer/speaker wiring in the [5170 technical reference](https://www.minuszerodegrees.net/manuals/IBM_5170_Technical_Reference_1502243_MAR84.pdf).

   Port C0h needs a declared mapping. It is not generically a speaker port on every IBM-compatible motherboard. For a virtual compatibility profile, explicitly attach a PSG device there, with latch/register decoding and observable tone/attenuation/noise state, using the [TI SN76489AN datasheet](https://map.grauw.nl/resources/sound/texas_instruments_sn76489an.pdf). Label this compatibility board honestly; do not claim it is an unmodified IBM AT. An unresolved C0h mapping remains an explicit boundary, not a discarded write.

6. **Initialize real service identities and preserve architectural interrupt frames.**

   The inspected artifact initializes IVT entries to the same `F000:0000` placeholder. That is insufficient once source code saves and far-chains vector 08.

   Initialize a documented BIOS-interface profile before guest execution. A useful identity convention is `08 → F000:FEA5`, `1C → F000:FF53`, matching the IBM listing’s timer and dummy-return locations. These must denote implemented services, not imply that an IBM ROM was executed. The timer service updates BDA `0040:006C/006E`, implements the declared rollover at `1800B0h`, dispatches vector 1Ch, issues EOI and returns through the incoming frame. Account for or explicitly bound disk-motor side effects if claiming fuller BIOS behavior. See the [IBM 5150 BIOS listing](https://manualzz.com/doc/29552354/ibm-5150-pc-technical-reference--6322507--april--1984-).

   Initial device state should specify channel 0 mode 3/divisor 65,536/gate high, PIC IRQ0 unmasked with empty IRR/ISR, speaker off, all counter phases and all other masks. Existing keyboard/video service identities remain distinct.

   IRQ delivery pushes FLAGS, CS and resume IP on the guest stack, clears IF/TF and resolves the live vector. IRET restores IP/CS/FLAGS. Far chaining reuses the original interrupt frame; it does not create another IRQ entry. STI and MOV/POP SS shadows must prevent recognition through the following instruction. CLI prevents delivery while devices continue advancing. These architectural requirements follow the [Intel processor manual](https://studylib.net/doc/27791273/9800722-03-the-8086-family-users-manual-oct79).

   Pin the virtual CPU contract: original 8086 segment-load details and later x86 behavior should not be silently combined with whichever behavior the oracle library happens to provide.

   Extend frame metadata to distinguish hardware IRQ, software interrupt and ordinary far-call frames, including saved defined-FLAGS masks. Source handler instructions determine register preservation; the host must not restore registers that source clobbers.

   Check instruction identity, target admission and stack accesses before committing an interrupt transition. Preserve overlay generations and suspended continuation frames through IRQs. Loaded MIDI code requires resource identity, allocation lifetime and generation admission, with mutable driver data separated from guarded instruction bytes.

7. **Deliver bounded slices with discriminating tests.**

   The first source window is compact: `0661:02E6..03AC` is **199 bytes**, including installer, cleanup, driver wrappers and handler. The later `07E8:12C5..1778` window is **1,204 bytes**, but includes indirect dispatch requiring explicit target validation. These are byte windows, not total implementation estimates.

   Recommended order for Sol:

   1. Finish immediate/DX operand and width transport.
   2. Add clock, mode-3 PIT, PIC, BIOS vector services and architectural IRQ entry/return.
   3. Admit the 199-byte resident window and the original-loaded MIDI driver. An explicit first unsupported driver/OPL boundary is a valid intermediate result.
   4. Add OPL state, execute intro playback and cleanup.
   5. Add the checked `07E8` closure, channel 2/61h/C0h state, then continue through actual menu return and demo resource/script execution.

   Luna should test frozen candidates, serialized with SOLcode’s runtime ownership:

   | Test | Required distinction |
   |---|---|
   | `E6 43` with DX=035Ah | Actual port 43h; unchanged DX; byte width |
   | `B6→43`, then `B1,13→40` | Channel 2 control changes; channel 0 receives `13B1h` |
   | Divisors 0, FFFFh, 5555h, 13B1h | Distinct periods, odd-count behavior and reload timing |
   | Latched versus unlatched reads | Stable snapshot versus independently sampled byte reads |
   | IF clear across several periods | Devices advance; requests coalesce; no invented IRQ queue |
   | ISR set, then EOI | Pending request survives and becomes eligible |
   | STI; next instruction / MOV SS; MOV SP | Correct protected boundary and resume address |
   | `0661` early EOI and nested IRQ | Source reentrancy flag suppresses only driver work |
   | Third intro IRQ / thirteenth later IRQ | Real far chain and one BIOS-service tick |
   | Stop, restore vector, free resource | No stale driver execution or generation reuse |
   | IRQ during resource conversion/overlay movement | Heap, source frames, EGA state and continuations remain correct |
   | Chunk/budget interruption inside IRQ | Exact continuation without repeated work, ports or stack writes |

   Also retain resource corruption/short-read controls, keyboard peek/consume/drain tests, no-input timeout versus explicit demo input, and source-byte mutation rejection. Device tests alone cannot establish executable-resource admission or full-game conformance.

8. **Make evidence complete without making logging a game limit.**

   Replace fixed event capacity with a streaming event sink and rolling digest. Include sequence number, source identity/generation, work time, PIT time, operation, width, value, device transition and IRQ/frame identity.

   Hash every canonical event regardless of retained diagnostic tail size. Stream complete trace chunks with sequence ranges, counts and per-chunk hashes; maintain a whole-run digest and checkpoint snapshots. Chunk boundaries must not affect canonical event order or digest.

   If trace storage fails, gameplay may continue with bounded recent history and the rolling digest, but mark full-trace evidence incomplete and fail any acceptance gate requiring complete evidence. Never report equal truncated prefixes as conformance, and never stop the game because the diagnostic ring filled.

The remaining unanswered facts are specific: the first IRQ and OPL boundaries under the new scheduling profile; actual nested-handler frequency at the accepted work scale; source-loaded driver admission and mutation boundaries; exact selected motherboard/C0h/port-61 compatibility policy; and later demo/gameplay hardware accesses beyond this checked closure. They require implementation and fresh original-versus-production evidence, not predicted model output.

Completion remains the original normal intro, menu, source-selected demo and onward full-game execution. Sound-off settings, IRQ-handler substitution, fabricated resource code and ignored hardware writes do not satisfy that route.

## Staged device implementation and independent reference

Own source prototypes now live in ignored
`build/cok-recomp/staging/pc-devices/` and `pc-reference/`. At initial staging,
neither had been compiled, imported as a model, or tested. The C component uses counting-element
decrements; the independently authored Python reference derives counts from
elapsed half phases and schedules output boundaries algebraically. The reference
author did not read the C implementation. Both remain separate from the held
main-return runtime.

Source review found reset-state, event-payload and arithmetic-rejection contract
differences. The staged C was changed to genuinely unprogrammed channels1/2,
the reference's documented event ABI and private operation validation before
observer replay. Event-sequence and intermediate-clock overflow reject
atomically. The independent reference's transition, vectors, tests, differential
and evidence code were retained byte-for-byte; documentation and input pins
record the resolved contract. This resolves interface proposals, not measured
chip behavior.

Prepared MSVC `/W4 /WX` build and compiler-layout receipts will precede pure
reference tests and C/reference comparisons in a serialized runtime window.
Count1, initial loading-edge alignment, partial-read/latch policies and the
collapsed INTA interface retain their documented limits. CPU IRQ frames, BIOS
tick ownership, original-loaded MIDI code admission, OPL and motherboard audio
ports still require implementation and their own evidence.

An additional own metadata prototype, `pc-devices/driver_admission.c/h`, now
describes admission of member3 only after original allocation and copy events.
Static resident-byte review locates allocation return `0A46:024B` with caller
`0661:0067`, post-copy observation `0661:00D4`, and cleanup's vector restoration
before the actual free. The gate neither allocates nor copies guest bytes and
does not route driver calls. At that source-only review it was uncompiled;
it remains unwired and untested after the subsequent object build below.
Instruction-start coverage, immutable-code versus mutable-data boundaries,
source-driven publication, generation reuse and stale IRQ-return rejection all
need executable proof before production integration.

The subsequent standalone build completed with MSVC `/W4 /WX`: PC device DLL,
compiler ABI probe and driver-admission object compile without warnings.
The initial environment-wrapper quoting failure was corrected in the staged
build wrapper before the successful retry. No model tests, device integration
or driver execution occurred during compilation. DLL SHA256 is
`0035a11512cee57e376dbc669ac4214b89e7dc463ba36bd28220c6daf339f9bd`;
`pc-devices/compiled/compile-verification.json` retains compiler logs and pins.
The 19 held production inputs and release/debug binaries stayed unchanged.
Actual Luna subsequently passed the reference's nine unit tests, but the C
differential stopped at loading because the DLL lacked `pc_read8`. The export
matcher omitted identifier digits, also excluding `pc_write8`. No model
transcript comparison ran in that primary attempt.

The failed DLL, build script and receipts are preserved under ignored
`pc-devices/historical/20261012-missing-digit-exports-2410db4c/`. A focused
export-only rebuild passes `/W4 /WX`; dumpbin verifies all 11 declared exports.
The revised DLL SHA256 is
`cb996335c7a07ad06caf8f0545d70d4b654a564b597b2863b67c7c5bcab6b9ab`.
Device C/header and production bytes are unchanged. A fresh actual Luna
supplement (root session89782) completed: reference nine tests pass, but the first
differential vector fails in callback collection. The serializer classifies by
the field name `channel`, confusing the snapshot's array with the event's scalar.
The reported snapshots match at that step; callback collection raises and loses
the event, so the event-list mismatch is not a valid device-semantic verdict.
A focused collector correction must retain all fields and make callback errors
fatal before comparison. Device equivalence remains unestablished. Compilation
and reference-only tests do not establish driver execution.

A separate source-only CPU prototype now exists in
`build/cok-recomp/staging/irq-integration/irq_cpu.c/h`, with wiring notes in
`HOOKS.md`. It proposes IRQ0 admission and stack preflight before acknowledgement,
FLAGS/CS/IP frames, IF/TF clearing, defined-FLAGS/generation restoration and the
two original far-chain sites. Work is charged before source effects and IRQ
recognition follows retirement, with one-shot boundary ownership across yields.
The new profile starts before restored entry and preserves PIT phase/fraction;
it removes direct host BDA increments and reserves ticks for the original
chain into the declared BIOS service. Segment-load shadows and ambiguous REP
timing require independent controls. This prototype is uncompiled, unwired and
untested; it has not changed the held main-return executable or device DLL.

## Actual standalone device comparison

The collector correction passes four pure controls. The following actual Luna
attempt then stops at a stale `CLAUDE.md` input hash after the native remote
merge. The reviewed Git diff changes only the corpus count/date; a metadata-only
refresh preserves the prior pins/logs and changes that input and candidate-link
digest. All 27 declared source/input/candidate hashes validate before testing.
No device algorithm, expected vector, C/header or DLL byte changed.

Actual `gpt-6-luna` session50214 subsequently completes with exit0. Four
collector controls and nine reference tests pass. The authoritative differential
JSON reports `matched` across 28 named cases and 228 steps: 222 call the actual
DLL, six are explicitly host-only interface cases. Every DLL step compares
status/output, the complete named counter/controller snapshot and ordered
events; rejected operations must preserve state and emit no events. The corpus
includes divisor phases/reloads, latch/read behavior, gates, fractional clock,
PIC priority/coalescing/EOI and atomic rejection cases. Policy vectors, including
pending latch/loading-edge details and unsupported count1, retain their limits.

All 638 raw hashes in `build/cok-recomp/pc-reviewed-pin-preflight.json` match
both before and after this run. The raw log/memo are
`C:/temp/goldbox-cok-luna-pc-reviewed-20261012.*`. Initial export failure,
collector failure and stale-pin failure remain in historical evidence. This
establishes standalone equality for the pinned corpus; CPU IRQ/IRET, BIOS tick
ownership, driver execution and the actual original intro/menu remain untested.
The next stage builds a separate IRQ fixture and independent CPU reference.

That standalone fixture subsequently compiles cleanly with MSVC `/W4 /WX`.
DLL SHA256 is `6184062102522f73a8b100f0db63d986ba9374e82224f7177b97c94da3c19b90`;
the build/ABI receipt is
`build/cok-recomp/staging/irq-integration/compiled/candidate-pin.json`.
It exposes all registers, known FLAGS, complete RAM, PC state, typed frames,
claims and ordered device/committed-byte-write observations. An ignored copy
of the held own `guest.c` instruments exactly two RAM-store sites; original
production bytes remain unchanged. Unlinked original admission symbols deny
execution, and the fixture does not execute an original handler, BIOS or manager.
No IRQ model tests have run yet. Independent reference-policy differences
(handler versus resume leases, strict release, saved FLAGS) are being documented
before comparison; shared CPU state/event checks must remain exact.

The first actual Luna IRQ attempt (session12903) stops in the independent
runner before C comparison: `frame-order-and-mask` expects SP4090 but sees
SP4096. All 660 initial/final raw hashes match. Static diagnosis finds adapter
`bool(IRQ_index)`: eligible index0 becomes false, while no-IRQ index-1 becomes
true. A focused adapter correction compares the explicit integer IRQ0 value;
core CPU/device algorithms, original 21 vectors, supplementary expectations and
DLL remain unchanged. The failed runner/pins/logs are retained.

All 29 expected declarations validate after that repair. Actual Luna's second
IRQ run (session87162) is active, with 661 raw before/after pins. Its declared
25 cases comprise 23 DLL comparisons and two explicit strict sourcefree policy
controls. That run completes: all 21 reference cases pass, while 18 of 23 DLL
cases match and five differ. All 661 raw before/after hashes remain unchanged.
The authoritative report identifies missed resampling after administrative EOI
and actual IRQ entry before RETIRE. It also exposes stale-identity status13
versus adapter status4 and claim-storage differences during same-address reuse.
The latter require the declared transport/storage contract; they do not justify
changing the independent CPU or device algorithms.

Failed source/DLL/receipts and raw log/memo
`C:/temp/goldbox-cok-luna-irq-eligibility-20261012.*` are retained. A focused C
scheduler repair and separate contract-adapter repair are underway. Vector
expectations, complete CPU/RAM/PC/frame/claim/event comparison and generation
rejection requirements remain intact. No IRQ acceptance or original handler
execution is established by this partially matched run.

The scheduling repair prevents entry while prepared/unretired and resamples
completed boundaries after EOI/edges; PIC state and cleared IF prevent duplicate
ACK. A separate transport correction follows documented missing4/stale13,
in-place exact-CS:IP claim replacement and unchanged tickets on a blocked
prepared boundary. Independent CPU/device algorithms and all vector outcomes
remain unchanged. Failed source/DLL/pins and raw results remain archived.

Actual Luna session92920 then completes with exit0: reference21 passes; all23
DLL cases match, alongside two explicit reference-only policies, across98 total
declared actions. Five actual comparison-function mutations reject altered
PC pending, RAM byte, frame FLAGS, known mask and resume generation. The report
has zero mismatches; all662 before/after raw hashes match. Accepted fixture DLL
SHA256 is `1d92f6b01be5dca7a513725cad75cdbed11129cce1d5936a5abd054ca5d459f9`;
candidate/source pins are retained in the raw report at
`C:/temp/goldbox-cok-luna-irq-scheduler-20261012.*`.

This verifies the synthetic IRQ interface corpus. Production integration and
an independent original-machine intro oracle are now being authored. They must
run original handlers and source-loaded MIDI code with one BIOS tick owner.
Original intro/menu, actual driver execution, campaign, combat and save/load
remain unfinished.

## Static original AdLib requirements

The subsequent source-only Astra pass decodes the held MIDI.DAX member3 and
finds only byte `OUT DX,AL` at ports388h/389h in 035B..0866. It finds no `IN`
or timer-detection/start/reset sequence there; registers02h/03h/04h are unused
by the inspected init and computed register groups. This is static evidence,
not an executed driver/intro result.

Init at0836 writes120 register/data pairs:102 zero pairs, then18 pairs with3Fh.
The first pair is F5h=00h at0840/0847. The final values target the80h operator
sustain/release group, not the40h total-level group. Original delay loops0810
and082E retain32 and12 iterations and their CPU/FLAGS/work effects. AH1 at0376
stores CX as the song segment at0012 and brackets init with CLI/STI. First
integration should preserve these source effects through an address latch,
register bank and ordered writes, then prove actual IRQ0/AH0 note changes.
Unsupported future status reads remain explicit until implemented.

Root independently inspected [ymfm's OPL register definitions and YM3812 API](https://github.com/aaronsgiles/ymfm/blob/main/src/ymfm_opl.h)
and [BSD-3-Clause license](https://github.com/aaronsgiles/ymfm/blob/main/LICENSE).
Its OPL2 model has nine channels and18 operators and distinguishes40h level,
60h attack/decay and80h sustain/release. It is a potential later C++ PCM backend
through a C ABI; no dependency is installed, vendored or revision-pinned here.
Register-level source equivalence and audible synthesis require separate proof.

A proposed oscillator policy is OPL clock=3 times the master rational PIT clock,
retaining fractions rather than multiplying rounded PIT ticks. It is declared
policy, not physical calibration. Port callbacks and audio buffers must not
create another time owner or PIC request. Astra's raw source-only memo is
`C:/temp/goldbox-cok-astra-opl-plan-20261012.md`; the upcoming intro run must
establish its own work/checkpoint values rather than predict them.

## Historical experimental integration checkpoint — not accepted in the tracked tree

This checkpoint records local experimental PC-device, IRQ CPU, BIOS-chain and
driver-admission sources with an opt-in Rust startup profile. At reviewed commit
`4318ec5c`, those integration sources are not part of the tracked production build:
`build.rs` compiles `guest.c`, `ega.c` and regenerated `lifted.c`; OPL verification
builds its standalone wrapper separately. The checkpoint is not a reproducible
current-tree claim or acceptance of original intro, IRQ-driven MIDI or PCM.
The experimental real intro closure exposes
`027F:26B7`, bytes `D1 66 FA`: `SHL word ptr SS:[BP-6],1`, reached through
the closure rooted at `027F:08D7`. The lifter previously rejected this memory
operand. A RAM-only read/modify/write helper now preflights read and write
access before flags or memory change. Count zero performs no operand access;
unsupported counts and EGA operands retain explicit rejection boundaries.

The restored full intro closure generates13,251 blocks. Its release build
(session2826) completes with exit0 and no warnings in2m01s. This establishes
compilation, not original execution or gameplay. Original driver
dispatch and the independent original-machine oracle remain integration work;
the accepted synthetic device/IRQ results above do not establish their fidelity.
The next acceptance must compare real original instruction execution, IRQ
frames, source-loaded driver ownership and ordered device effects.

### Integration review gates

Source review identifies additional gates before freezing the intro candidate:

- Give the intro clock its own versioned profile identity. The legacy
  `instruction-work-before-effects-v1` fixture label does not describe BIOS-chain
  ownership of BDA ticks in the new profile.
- Preflight the INT1C vector, ordinary-RAM stack frame, resume lease and entry
  counter before committing the modeled BIOS service. Retain explicit frame
  capacity and overflow rejection. The INT1C path must not bypass the IRQ
  entry path's rejection of device-backed stack memory.
- Compare complete PIT/PIC and interrupt-frame state plus ordered events.
  Aggregate work, tick, IRR/ISR and depth values alone cannot establish the
  original handler's execution, preserved frame or device ordering.
- Driver near-table dispatch must execute the original admitted target under
  its live allocation generation. Its current unsupported boundary is an
  integration gap, not a successful playback checkpoint.

These are review findings and requirements; they are not new passing tests.

## First compiled intro probe and register-wrapper differential

The subsequent generation includes523 decoded instructions from the actual
2,151-byte MIDI.DAX member3, for13,774 blocks overall. Build11750 completes
with exit0, no warnings, in2m23s. Its first actual intro probe stops with
status9 at104,679 source-work steps, guestCS:IP `19F0:04C7`, source
`09F0:04C7`: `F3 A5` (`REP MOVSW`) following `MOV ES` at04C5. The kernel's
declared protected-shadow REP rejection occurs before real driver loading.
This is a concrete execution boundary, not intro acceptance.

The generated manifest, executable, raw probe JSON and terminal compile summary
are retained under ignored `build/cok-recomp/history/intro-11750/`.
Executable SHA256 is
`ae016b8099d228a5bc606717d6ab4a0f35a21283d12f509cf5bc87d73535320a`;
probe JSON SHA256 is
`29279d3ad385767291d33d947c50bc0580c43ed592c254285859ba9875505c0c`.
Allocation/publication/free metadata now uses private candidates before commit,
and the INT1C path preflights target, RAM frame and counter capacity before
the BIOS tick service. These changes still need execution comparisons.

Separately, own `opl_registers.c/.h` implement an address latch, register bank,
ordered repeated writes and declared absolute-work clock conversion. Actual
Luna builds the standalone C DLL and target ABI probe successfully, then the
first differential fails at ordered events after five accepted write/snapshot
checks. All11 captured raw inputs remain unchanged during that run. The
reference expected zero for an address event's previous value; C records the
previous address latch. The header now explicitly declares that event field.
No C behavior was changed to match the failed expectation.

Exact failed inputs and compiled reports remain under
`build/cok-recomp/staging/opl-reference/historical/20261012-address-event-contract/`.
The archived original header was reconstructed by removing only the subsequent
contract comment and verified against the original before-run SHA256. A
reviewed reference-contract correction and fresh verification are pending.
No passing OPL differential, original music execution or audible PCM is claimed.

The fresh reviewed run builds successfully but stops again at ordered events.
Its complete report shows matching address semantics and five matching full
C/model snapshots; literal vector remainders use a reduced denominator1000
while the declared device/model denominator is2000. For work1..4, the declared
identity `work*196608 = clocks*2000 + remainder` gives608/1216/1824/432,
not304/608/912/216. C and the independent model already agree on the former.
No clock implementation change is warranted by this vector-units error.
All11 before/after hashes match; no negative, chunk, atomic or event-overflow
gate executes after this early failure. Exact second-failure inputs and full
reports remain in `historical/20261012-remainder-vector-units/` under the OPL
reference directory. Corrected literal units and an independent algebraic
vector preflight must be frozen before the next fresh differential.

The next fresh build succeeds, but the newly added pure-model preflight stops
at a missing `_advance` import before loading the C DLL or making any C ABI
call. All11 raw hashes still match. This is a comparator wiring failure,
not a device comparison result. Its exact source/build/reports are retained in
`historical/20261012-model-preflight-import/`; the focused import repair must
leave C, model algorithms and reviewed vector outcomes unchanged.

After the focused import/reporting repair, actual Luna's fourth fresh run
completes with exit0. MSVC19.39.33523/x64 builds with toolset14.39.33519 and
WindowsSDK10.0.22621.0; the compiled layout matches ctypes and all six declared
exports are present. The report contains60 actual C ABI calls: five accepted
writes with five full snapshots and five ordered events, five clock-cut/direct
checks, six atomic rejections, one administratively seeded event-counter
overflow, and five rejected mutations through the same comparison functions.
Independent preflight checks12 clock literals, model events/final state, clock
cuts, six atomic model cases and model counter overflow. All11 raw before/after
inputs match; root independently rechecks them after terminal completion.

Accepted standalone DLL SHA256:
`11b839059b553f657a3b38c7ee8a2b1cbfe764af124b15fc9580e8475472d261`.
Complete report SHA256:
`9df2f627ccde635ebb9ea1927b3a1367e756a92c44fcf3011e3f716a1e203384`,
at `staging/opl-reference/compiled/import-differential-report.json`.
Public reproducible verification packaging is being authored. This accepts
the bounded register-wrapper corpus; it does not execute MIDI3's120 pairs,
establish audio, settle the REP-shadow policy or complete the original intro.

The public PowerShell launcher subsequently passes a fresh actual Luna run at
`build/cok-recomp/opl-verification/run-1dd06ba53963443080f56884a98e6810`.
It builds from the pinned public sources, checks the same complete component
corpus, and retains before/after12 public inputs, nine staged files and pin
metadata. Root separately confirms all13 pre-captured public/metadata inputs
remain unchanged. Raw Git attributes now prevent checkout line-ending rewrites
of these pinned files. From the GoldBox repository root, reproduce with:

```powershell
pwsh -NoProfile -File rust/cok-recomp/verify_opl_registers.ps1
```

This command requires the existing Windows MSVC x64 toolchain and repository
Python venv. Its UUID-named evidence directory is fresh and ignored; source,
retail assets and prior run directories are not modified by verification.

## Developmental v2 execution reaches the original driver

Build23932 completes without warnings, exit0, in2m23s. Its actual intro probe
passes the former protected-REP boundary and stops at the real MIDI3 first
address write: work4,060,352, guestCS:IP631F:0840, DX0388h, ALF5h, status9.
The original resource/allocator/copy path owns631E:0008, size2167, executable
segment631F, generation1 live/published. PIT channel0 has reload5555h and the
BIOS tick owner records2007 ticks. No host-loaded driver or sound-off route
substitutes for this execution.

Candidate SHA256 is
`2f897c76924b7fbe7b5f492e900e891e034c3bbdcdb77a61ccad24308938a4bc`.
The retained raw probe is `build/cok-recomp/intro-v2-first-run.json`, SHA256
`62e569bd15550ee13a49dd9c112f84378f7c5f09e353e544caa9b6940b281d58`.
The candidate receipt lives in `history/intro-v2-23932/`. Its lossless IRQ/RAM/
service trace has1,532,127 events, SHA256
`afc17a3dc9ed1082c8f33addc69a0c2c0d10848961ccea4e9511e1fde6c11561`.
This is developmental execution evidence, not original-versus-C acceptance.
The initial probe's inactive repeat JSON contains a duplicate ip key; that
evidence issue must be corrected before final acceptance. Focused v2 kernel
controls and complete independent comparison remain outstanding.

Actual Luna's first native v2 debug run crosses104,679 and reaches budget110,000.
All774 captured inputs remain unchanged, but that capture omitted the dynamic
independent PC-reference import, so it is explicitly debug-only. Before a full
run, reviewed source fixes align the declared virtual BIOS continuationFEA6,
observe driver lifecycle at the actual original sites after charge, and add
the separately pinned PC model to775 before-run inputs. No physical ROM or
hardware-shadow claim follows from those virtual service addresses.

That full native run stops earlier at305,338, guest1521:0DDA: a word OUT to
EGA port03CEh with AX0A05h. All775 input hashes match. The IRQ router rejected
width16 before checking whether it owned that port, preventing the existing
EGA word-access model from receiving it. Exact failure/source inputs are
retained under `staging/intro-irq/historical/word-port-routing/`; raw report
SHA256 is `84c5dc399a48f5beb56567145463130684c4c38ab93b3d6110df8c2e44bb646e`.
A focused classification repair returns unowned ports to their existing
platform handler before enforcing PC/OPL byte-only rules. Five actual Luna
controls pass: two EGA word fallbacks and three atomic owned-port rejections.
The following fresh full native run completes with exit0 and reaches the same
first original OPL address write: work4,060,352, guest631F:0840, DX0388h,
ALF5h, status9. All776 captured raw input hashes remain unchanged. The retained
161,751,930-byte report is `staging/intro-irq/native-full-port-reviewed.json`,
SHA256 `9cde84f80e8e76c2ac28474f4bebb1116386d378099301531788533041dd026a`.
Its saved structured endpoint has CX26389 (6715h), matching the candidate;
an earlier typed peer summary converted that value incorrectly.

This proves endpoint alignment only. The native report retains72 checkpoints
against the candidate receipt's71, and compacting the native evidence removed
the raw ordered original writes, retaining806,009 writes as count/digest.
The fresh structured comparator must expose those coverage differences and
actual value mismatches. Complete ordered RAM/service and frame/lease evidence
still require an independent collector. No complete music initialization, PCM,
menu or playable-game acceptance is claimed.

### First complete structured comparison — 2026-10-13

Actual Luna executes the frozen comparator against both fresh-parsed reports
and the complete candidate binary event stream. It terminates with exit1:
2,938 matching comparison rows,158 mismatching rows and869 incomplete rows.
All eight declared source/report pins and the binary trace remain unchanged;
root independently rechecks the eight pins and measured report hash.
Report `staging/intro-compare/measured-1.json` SHA256 is
`a1648a8a36151a5150aeae8af1ab59b3d2623218a9f08432a6e02ed9b1dd7962`.

Mismatch categories are67 legacy clock-phase rows,63 BIOS-event lengths,
13 changed-RAM digests,12 live-stack digests, held-asset inventory, checkpoint
order and one CPU FLAGS row. At calibration-divided, native FLAGS0246h differs
from candidate0256h. These observations require source-level attribution;
endpoint agreement does not waive them. Missing evidence includes auxiliary
RAM reconstruction, EGA transport fields, callback pointers, frame/lease and
scheduler mappings, and complete ordered original RAM/service writes.

The decoder validates all1,532,127 candidate records, with final event work
4,060,348. Five mutations of actual candidate fields (AX, known FLAGS, RAM
digest, PIT count and EGA plane byte) are rejected by the same positive
comparison functions, each with a matching self-baseline. This validates the
bounded comparison controls, not equivalence of the candidate with the game.

### Public REP calibration verification — 2026-10-13

Actual Luna runs the public launcher with exit0, retaining fresh evidence in
`build/cok-recomp/rep-verification/run-b4fc45630ff348b794d29e1660481e09`.
The launcher compares complete ordered case records against pinned accepted
observations:53 Unicorn hook calibrations and24 selective-map guards pass.
The latter include12 CX0 no-access cases and12 CX1 expected unmapped faults.
All72 captured raw inputs and five staged copies remain unchanged; root
independently rechecks its seven pre-captured package/source/metadata pins.
Reproduce from the repository root with the existing Python/Unicorn environment:

```powershell
pwsh -NoProfile -File rust/cok-recomp/verify_rep_hooks.ps1
```

This source-bound synthetic calibration establishes hook granularity and
no-access guards. It does not establish physical8086 shadows or resolve the
original intro's RAM/stack differences. The public package's raw Git attributes
preserve the exact pinned bytes across fresh checkouts.

### Ordered original evidence collector prefix — 2026-10-14

Astra's next evidence plan adds an independent96-byte streaming format with a
global sequence for guest stores, explicit platform writes, PC events and frame
metadata. Postbaseline DOS/video/keyboard/IRQ writes are observed explicitly;
EGA emulator backing is typed separately. It retains pinned1MiB baseline/final
RAM and checkpoint offsets. These local producer sources are still ignored
developmental artifacts, not a published verification command.

The first110,000-work run fails the JSON-native report assertion because new
PUSHF/software-frame snapshots retain tuples. Its original stream and source
pins are preserved in `collector-prefix-5ee22a6910754eff8806776daf763f36` and
`historical-failedprefix-f6bd9e70633448faba19512e79e24d22`. Sol converts only
snapshot fields to explicit dictionaries, retaining emulator tuple state and
the assertion; hand-authored JSON roundtrip/detachment controls are added.

Actual Luna's fresh repaired controls and original prefix pass. At work110,000,
all14 registers, known-FLAGS mask, status2 and complete PC snapshot match the
previous original prefix, including19F0:04C7 and CX3138. The stream contains
218,441 contiguous records, a validated footer, complete=true and pending=0;
baseline/final raw RAM hashes match their declarations. All778 captured inputs
remain unchanged, independently rechecked by root after terminal exit0.
Report SHA256 is
`8d56529736cec22cb39462a021ba8c9baa3b0bbe6bd6d8066fff89cc2dbfc362`;
stream SHA256 is
`c0de8984ebfdf6338da619bc477e239022aa5b8d52ea14ad468963f2ce67644b`.
Evidence lives in `staging/intro-irq/repaired-prefix-9467e12904c54162ba185d01c36d480a`.

This establishes bounded observational invariance and basic stream integrity.
Full independent semantic decoding, checkpoint RAM reconstruction and the
first-OPL whole-run comparison remain outstanding. The calibration FLAGS
difference is undefined AF (XOR0010h; both masksF72Ah exclude that bit), but
later stored stack differences require write provenance and are not masked.

The candidate serializer now uses `lease_ip` for the protected-repeat lease,
retaining a separate instruction `ip`, and saves exact pre-execution RAM with
path/size/hash metadata. Actual Luna's strict duplicate-key parse passes a
fresh one-work report. Its1MiB dump matches the original prefix baseline
byte-for-byte, SHA256
`b5aa3975c51f39545a34ee5635372a85fb3d3af4f8834416ad1a6d4c5f0faf3f`.
This is observed initial-state equality, not an assumption from changed-byte
digests. The earlier missing-PATH build attempt and truncated-output attempt
are retained separately; successful checks use the absolute Cargo path and
redirect complete JSON to a file before parsing.

A fresh full candidate run using binary SHA256
`6b8e85da36ddf849af49985398d9436dd30681eb001e0b175850fb48327437c4`
still reaches the first OPL boundary at work4,060,352/status9. Its287,194,658-byte
report has71 checkpoints and no duplicate keys. The archived23932 receipt's
14 registers, known-FLAGS maskFFFFh, full PIT state, driver ownership and
1,532,127-event trace match exactly; trace SHA remains `afc17a3d...11561` above.
All50 source/generated pins remain unchanged. Evidence is retained in
`staging/intro-compare/candidate-baseline-full-c3b78cbe4c724f4db1d52a70fb2bbbed`.
Exit1 remains expected because the requested intro checkpoint is unfinished;
none of these observations accepts original-versus-candidate stored RAM yet.

Actual Luna then passes18 independent streaming controls: two literal codec/
RAM positives,13 shared-comparison mutations, two corrupt-footer rejections
and an exact-known-mask/undefined-AF control. The separate native-only audit
reconstructs all45 prefix checkpoint RAM images from baseline plus ordered
writes, with45/45 raw matches and a validated complete footer. All eight frozen
inputs remain unchanged, independently rechecked by root. Evidence is in
`staging/intro-compare/stream-audit-dc7bd23193b3437cb677f006315be6ee`.
No compiled report is supplied to this audit, so its compiled pairing rows
remain incomplete. A subsequent logical-envelope guard is staged separately
to reject internally inconsistent actor/work/context/value declarations even
when their full raw hashes have been recomputed; its tests are still pending.

### Full original write capture and first concrete divergences — 2026-10-14

The logical-envelope follow-on passes18 regression controls and nine envelope
controls, including eight mutations with recomputed valid stream hashes. Its
native-only audit again reconstructs45/45 prefix RAM checkpoints. The exact
tested guard is promoted without algorithm changes; this supersedes the pending
status in the preceding paragraph.

Actual Luna's full original collector run completes with exit0 after roughly
13 minutes. All778 inputs remain unchanged, independently rechecked by root.
Its194,175,417-byte report strict-parses with no duplicate keys,72 checkpoints
and the unchanged first OPL endpoint. Report SHA256 is
`11cbc1d7fecc0139ef99ce9ad961776072c296e9be3064e6556b3915748f82c1`.
The complete trace has2,506,091 records/240,584,744 bytes, pending=0, SHA256
`453971085150007817698b85640d20aa78430750041c33731cfa21bad3d382d1`.
Evidence: `staging/intro-irq/collector-full-aad762b7c1a240b7b2007d23155b8769`.

The fresh full ordered comparison exits1/mismatch with19 unchanged input pins.
All72 native checkpoint RAM images reconstruct correctly. Pairing with the
compiled baseline yields55 matching,13 mismatching and four incomplete RAM
checkpoints. The first shared-event difference, index104/work184, has identical
DOS write address0/value223 but native observer1A46:0065 versus C1A46:0067.
Source review identifies `CD21` at0065 and C's pre-dispatch continuation0067;
the raw mismatch is retained until typed attribution is independently tested.

The first actual RAM disagreement at all-initializers-return/work204184 is
exactly two bytes: physical288E4h and288EAh, native02h versus C12h. The older
local memo's2C8E4h/2C8EAh addresses were a conversion error:2491h*16+3FD4h
is288E4h. XOR10h alone does not prove FLAGS provenance or passive consumption.
The write histories, source identity and consumer evidence must establish that.
Shared totals also differ by22 records (native1,532,105; C1,532,127), unresolved.
Comparison evidence: `staging/intro-compare/full-comparison-badb4aeedece4a78a6fed142038dc298`.

### Functional OPL integration, bounded controls — 2026-10-14

Sol adds the already verified register device to the guest runtime at work0,
continuous absolute work, pre-reserved observer storage, separate checked OPL
ABI/67-byte event stream and explicit `--stop-before-first-opl` diagnostics.
The old117-byte IRQ ABI remains intact. These integration sources remain local
uncommitted work pending the source execution comparisons and remaining gates.

Actual Luna builds binary SHA256
`711d16b49e49725b6c581f985a81bbb7f4d2239cc5d3f2d619a5cad8c33b9fdd`
with exit0/no warnings;51 source/generated pins and the archived pre-OPL build
remain unchanged. A strict one-work observation verifies both old guest/IRQ
state and new zero-register device at clocks98/remainder608. The explicit
stop diagnostic reproduces the prior work4,060,352 boundary, guest/IRQ/RAM and
trace SHA, with zero OPL writes and continuous clocks399,148,843/remainder16.
Evidence: `staging/intro-opl/candidate-prefix-c1dea8a093eb4f45b8a03d216f619354`.

The independently copied original OPL shim's executable controls pass both
function groups and11 named platform gates with15 unchanged pins. Those are
synthetic port/clock controls; original initializer execution, timestamps,
IRQ notes and cleanup remain unverified for that shim. Evidence is in
`staging/intro-opl-original/controls-4a7388524d54474299bfc8a2b295596a`.

The default-enabled compiled continuation subsequently reaches budget8,000,000,
status2, at127F:06FF without an unsupported-instruction boundary. Its complete
67-byte OPL stream retains12,260 writes. All240 initializer events match the
independently extracted120 source pairs; replay matches the captured039C bank
at work4,085,071/clocks401,578,819/remainder1168. Every event satisfies the
declared clock identity, local sequence and global117-byte kind6 link, and
replay reconstructs the final register/written banks exactly. All51 pins and
binary SHA remain unchanged.

After initialization,18 depth0 events cover nine further instrument pairs;
12,002 events occur at IRQ depth1. A0..A8 and B0..B8 each receive2,373 data
writes;1,183 B-bank writes have key-on bit20h set after initialization. These
are observed source-driven register effects, not audible PCM. The driver is
still live/published generation1 at the budget boundary, so genuine cleanup
is not established. Evidence: `staging/intro-opl/candidate-enabled-bcb0803a5bf84f52b7684bad32461cd8/verification.json`,
SHA256 `c12d22769477af109d4d8283d836fbcbb4e18f86e038569a94505f026c0b43d2`.
Fresh independent original initializer/timestamp comparison remains pending;
the original-versus-C RAM/observer differences also remain unresolved.

### Independent original OPL initialization comparison — 2026-10-14

The same original initializer process now terminates with exit0 at source
039Ch/work4,085,071. Strict JSON and the complete GBITR2 stream validate:
2,525,930 records before25 footer records, pending0, matching retained baseline
and final1MiB RAM hashes. Luna's postcheck and an independent root posthash
both confirm791 unchanged inputs. The earlier launcher path error remains
retained separately; it did not start the original oracle.

All240 original OPL events match the frozen compiled candidate's ten device
fields and six source/owner/generation/frame-depth fields. Initializer work,
clocks401,578,819, remainder1168, address latch80h and all256 register/written
entries agree. The independently extracted120 original pairs agree as well.
This establishes the initializer register/timestamp slice, without accepting
broader RAM/CPU equivalence or later IRQ music/cleanup.

Evidence: `staging/intro-opl-original/first-init-0fb290857efd4df7b570aed5ca2c814f/verification.json`,
SHA256 `08e1f311472a59562963082928b79aef583038f016fa791d1a7a21f818683b5a`.
Original strict report SHA256:
`e98a445c3f1fdce73586158967c317bb2198a4fe45fe74e3a5c7d31b069c812e`.
The earlier13 RAM mismatches,22 shared-record difference, full IRQ-note
comparison, source cleanup and audible output remain separate unfinished gates.

### Offline first-divergence attribution — 2026-10-14

Luna passes34 discriminating controls and completes the frozen full-stream
diagnostic with exit0. The narrow work184 DOS21 source-origin/continuation
convention is proven; the existing comparison remains a mismatch. Root
independently rehashes all32 source/evidence and1,795 Python runtime inputs
afterward, with zero changes.

At work204,000, the final writes to288E4h and288EAh are respectively typed
INT1C-frame and IRQ08-frame effects, rather than ordinary source PUSHF stores.
Native sequences563709/563682 store02h; compiled sequences457086/457075 store12h,
with observed FLAGS knowledgeFFEFh. The first diagnostic's PUSHF-only classifier
therefore leaves both origins unresolved. Typed interrupt-frame creation and
subsequent consumption need their own evidence; the missing consumer coverage
does not authorize ignoring the differing RAM bytes.

Evidence: `staging/intro-compare/attribution-run-903e2ad2ee1b41ad9d5077dd06e88aa2/summary.json`.
Diagnostic JSON SHA256:
`054f933aa2a36538e18ed86dbe43f6d791cddd7b07fa78de9c7be2ab1d639ec4`.

The subsequent typed-frame diagnostic passes20 controls (four positives and
16 mutations) against both complete frozen streams. Independent parent and
child frame stores and validated return transport are proven: parent
2491:3FD6 resumes19F0:04F5 with native0202h versus C0212h; child2491:3FD0
resumesF000:FEA6 with native0002h versus C0012h. Both masks areFFEFh, excluding
AF10h. Root independently rechecks all1,836 source/runtime inputs unchanged.
This proves undefined AF at frame creation and modeled return transport;
later-read coverage remains MISSING and checkpoint RAM equivalence remains
NOT ESTABLISHED. No RAM comparison was masked or changed.
Evidence: `staging/intro-compare/irq-frame-run-4e4bab20ab8845cb8baad989cb26fd3e/attribution.json`,
SHA256 `bfcb1812188fd0cf98a76f38fba15df2085896fe79c700cb1558f481da88225e`.
