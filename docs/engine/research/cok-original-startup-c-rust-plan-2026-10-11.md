# Original CoK startup through C and Rust

## Verified restored-entry execution

The restored entry now executes mechanically lifted original instructions
through Rust. The generated total is 1,457 blocks: the earlier 1,183 plus
263 resident RTL blocks and 11 entry/BIOS-prefix blocks. The first far CALL
and real RTL return execute; heap fields are computed by original code.
Rust supplies only declared process inputs and DOS vector/stdout services.

```powershell
./rust/cok-recomp/target/release/cok-recomp.exe startup --json
./build/cok-recomp-tools/venv/Scripts/python.exe -B ./rust/cok-recomp/verify_startup.py --faults --exe ./rust/cok-recomp/target/release/cok-recomp.exe
./build/cok-recomp-tools/venv/Scripts/python.exe -B ./rust/cok-recomp/verify_regression_readonly.py --expected-sha256 e43879214c52bbac13ee9c81e928f32a7d2d0ef5e480fd0abcce594b5d48b2c4
```

Actual Luna 6 reruns passed the conventional A000h and synthetic comparison
C000h process-memory ceilings and six budget prefixes (1/50/300/443/448/452).
The declared process has CS:IP=1000:003F, SS:SP=2491:4000 and DS=ES=0FF0.
All 621 resident fixups are source-pinned. PSP, JFT, environment, command
tail, initial guest IVT and stdout device response 80D3h belong to the
explicit fixture identity; they are not observations of a historical DOS
machine.

The first checkpoint at 0000:0044 follows 443 instructions: one entry CALL
plus 442 RTL instructions, covering 181 distinct RTL instructions. Original
code computes the arena 2891h..2F48h from the live CALL frame at SP=3FFCh.
It performs 19 vector gets, four vector sets and two stream callback calls.
The second checkpoint is 453 instructions at runtime 1962:060F, immediately
before INT 10h/AH=0Fh. No BIOS response is supplied and that instruction is
not executed. Yield statuses 16/17 identify reached checkpoints; they do
not represent completed game boot.

Comparisons cover registers, known flags, full memory changes, live stack,
stream records, saved vectors, guest IVT, heap and DOS events. The vector
services read and write the same guest IVT. No host heap initialization or
DOS memory allocation was supplied. Base zero is rejected for this declared
process profile because PSP=FFF0h is not a valid conventional-memory layout.

Luna also reran the 8,851 positive regressions, 512 text cells, 31 negative
controls, all manager/wrapper/callback differentials and native queries,
50 existing compiled guard tests, and decoder controls (21 rejected forms /
38 supported forms). Guards cover NOP/TEST, CS LODSB, bounded REP STOSW,
stream-record context, sticky read faults and complete 130-byte callee
identity, including the final RETF immediate byte at 068Fh before frame
creation. The release SHA256 was unchanged:
`e43879214c52bbac13ee9c81e928f32a7d2d0ef5e480fd0abcce594b5d48b2c4`.

A supplemental actual Luna run verified current generic source inputs,
generated C, production and isolated-binary fingerprints and executed both
incorrect builds. Incorrect entry relocation and stream-pointer addressing
were rejected with checkpoint status 4 before any stream callback entry;
neither reached the first BIOS, and both failed the original-state comparison.
Production remained unchanged. These are deliberately erroneous generated-C
controls, not changes to the original assets.

BIOS responses, display/input, clock calibration, later initialization,
original VROOMM/wrapper installation during startup, demo and gameplay
remain unfinished. The planner findings below are the preceding original-only
source investigation, not additional compiled execution coverage.

## Original-source planning snapshot

**Next implementation at the planning checkpoint: run the restored entry through original RTL initialization and stop at the first BIOS request.** Then extend that same execution to the original VROOMM/wrapper installation. This directly replaces the synthetic arena and fixture-bound callback with startup-owned state.

I inspected the requested files and decoded the complete image with Capstone. A bounded, in-memory Unicorn probe executed packed startup through the first BIOS boundary in about 94,000 instruction hooks. No edits, reports, builds, installations, network access, or DOSBox runs occurred. Findings describe the current working tree; they do not establish compiled boot or playability.

1. **Lift `0000:003F → 0000:0044 → 0962:060F` first.**

   Source coordinates below are unrelocated; runtime CS is source CS plus load segment `L`.

   - `0000:003F`: far CALL `0A46:0000`.
   - `0A46:0000..00A8`: original RTL, arena, heap, saved-vector and standard-stream initialization.
   - `0000:0044`: first real return checkpoint.
   - `0000:0044`: far CALL `0962:0000`; near calls `002E → 060B`.
   - `0962:060F`: **first BIOS boundary, `INT 10h/AH=0Fh`**. Stop before responding.

   The earlier DOS boundary is `0A46:0050`, `INT 21h/AH=35h`.

   Required reached RTL roots include `0000`, `04F7`, `0567`, `056C`, and the indirect stream callback `060E`; retain their near-call closure. The probe executed **442 hooks inside RTL initialization**, covering 181 distinct RTL instructions.

   Concrete lifter gaps on this path:

   | Source | Required change |
   |---|---|
   | `0A46:004A` | NOP |
   | `0A46:004C` | CS-overridden LODSB; read CS:SI |
   | `0A46:0526` | REP STOSW, with DF, CX, budget and fault semantics |
   | `0A46:065B` | TEST with correct defined flags |
   | `0A46:0601` | Admit original `LCALL ES:[BX+DI]` destination `0A46:060E` |
   | `0962:060F` | Explicit BIOS boundary result |

   Current indirect-target admission only covers selected manager callbacks. Extend it using validated source identities and original stream-record pointers. Preserve `PUSH CS; CALL near` sequences that return with RETF and argument cleanup.

2. **Use the actual restored process contract and original allocation arithmetic.**

   `unpack_complete_load_image` gives entry `0000:003F`, SS=`1491`, SP=`4000`, image size `10020h`, preserved prefix `038Dh`, and **621 relocations**. At `L=1000`:

   - CS:IP=`1000:003F`; SS:SP=`2491:4000`.
   - DS=ES=PSP=`0FF0` on the observed restored entry.
   - PSP:[2] supplies the process allocation limit; PSP:[2C] supplies the environment segment.
   - Declare command tail, environment, initial IVT, standard handles and initial memory contents explicitly.
   - Apply all relocation words once, including startup CALL segment operands at image offsets `0042+5*n`, `n=0..48`, and the RTL DS immediate at image `A461`.

   **The real CALL changes the arena by one paragraph relative to the existing resource fixture.** RTL enters with SP=`3FFC` and computes:

   ```
   arena_base = SS + ((SP + 0013h) >> 4) = 2891h
   arena_end  = arena_base + DS:[4374h]  = 2F48h
   DS:[4374h] = 06B7h paragraphs
   ```

   Observed at `0000:0044`:

   | DS field | Value |
   |---|---|
   | `437A`, `437C` | `2891` |
   | `437E`, `4388`, `438C`, `4394` | `2F48` |
   | `4390` | PSP:[2] |
   | `439A:439C` | `1A46:00A9` far pointer |
   | `43A8` | `0FF0` |

   Do not copy `2892/2F49` from the independently called resource fixture, or initialize the 350-paragraph arena on this startup route. **No DOS 48h/49h/4Ah occurred.** Reserve process memory as a platform input; let original code partition it. Keep those DOS allocation services unsupported until actually reached.

   The probe used the historical `C000` limit for comparison. That is a synthetic memory ceiling extending beyond conventional RAM; define a separate conventional-memory profile for the runner.

3. **Implement the narrow DOS contract, then resolve the BIOS/clock dependency.**

   Before the first BIOS boundary, the original requests:

   - Nineteen vector gets: `00,02,1B,21,23,24,34..3F,75`.
   - Vector sets: `00→0A46:00DF`, `23→00E6`, `24→00AE`, `3F→00D7`.
   - One `4400h` query for stdout handle 1.

   AH=35h must read the actual guest IVT into ES:BX; AH=25h must update that same IVT from DS:DX. The Task198 tracer’s separate vector dictionary and generated IVT can disagree. My probe corrected this coherence in memory.

   `4400h` needs a declared stdout-device contract. The probe retained Task198’s `DX=80D3`, so its return-state evidence is **conditional on that modeled device response**.

   To continue through `0962:0000`, implement the reached text-mode BIOS queries and clock behavior. Source already exposes mode query, `1130h`, character/attribute query, and the wait/calibration loop reading `0040:006C` at `0962:006C..0087`. Task198’s no-op BIOS calls and tick increment every 2,000 instructions are **not fidelity evidence**.

4. **Next checkpoint: original VROOMM and wrapper installed at `01C7:035A`.**

   The entry contains **49 consecutive far initialization calls**, `003F..012F`, followed by main-body code at `0134`: 14 resident calls and 35 overlay initializer calls.

   Resident roots, in execution order:

   ```
   0A46:0000 0962:0000 0960:0000 07E8:0105
   077C:0608 0743:0380 069C:0A61 0661:02DA
   0614:04CA 0521:0D19 027F:214C 01C7:031A
   0128:09A1 0110:0000
   ```

   The substantive VROOMM setup is inside startup call 12:

   - `01C7:0326 → 069C:01C8`: checks existence of original `game.ovr`, through `069C:04C1`.
   - `01C7:0335 → 0A46:0AC4`: constructs the Pascal `GAME.OVR` argument from `01C7:008F`.
   - `01C7:033A → 09F0:0012`: original initializer, RETF 4.
   - `01C7:033F..0349`: saves `[8A5A:8A5C]` into `[885F:8861]`.
   - `01C7:034D..0356`: installs `0614:0492` into `[8A5A:8A5C]`.
   - **Stop at `01C7:035A`** with live startup frames intact.

   Add the existence/search closure and its SetDTA/FindFirst contract. Retain actual GAME.OVR open, cursor, seek, read and close semantics; support AX/error/CF and short reads explicitly. No basename-only success substitution or preloaded overlays. The installed INT3F vector must now be `L+09F0:02E6`, replacing the RTL’s temporary handler.

   After this checkpoint, original code enters path/config work at `09C4:018D`, `09C4:0256`, then the `krynn.cfg` existence branch. This remains a dependency before startup call 12 returns.

5. **Extend to all initialization calls and `0000:0134`; then integrate resources.**

   Overlay initializer descriptor order is:

   ```
   01C3 0124 011F 0116 0111 010B 0105 0102 00FD
   00F7 00E6 00DB 00BA 00B3 00AF 00A8 00A4 009E
   009A 0096 0092 0088 0065 0061 005E 005B 0058
   004E 004A 0047 0044 0041 003E 003B 0038
   ```

   Each enters public stub `:0020`; derive its body root from descriptor procedure 0. **34 bodies are actual four-instruction initialization routines**, but their original loading, relocation and eviction must still execute. Current admission covers only descriptors `010B` and `0105`.

   The final initializer is significant: descriptor `0038`, body `00B2`, GAME.OVR offset `000BA`, installs allocator fallback `[439A:439C]=L+0038:0025`. Preserve its relocated immediate at body `00B9`.

   At `0000:0134`, startup continues immediately toward `0061:0025` at callsite `013B`. Treat that as the next main-path dependency.

   Subsequently lift original `069C:088E` lookup and `0A46:0254` release into Load3DMap. Reuse the resource proof’s algorithms and two-handle file contract, but take heap state from this startup execution.

**Differential acceptance:** compare original Unicorn and Rust-called generated C from identical restored state at `0000:0044`, before `0962:060F`, and eventually `01C7:035A` and `0000:0134`. Compare registers, defined flags, live stack, memory writes, stream records, IVT, heap fields, file events and overlay generations. Include changed PSP limits, invalid callbacks, missing files, short reads and relocation mutations. Reject every unimplemented service explicitly.

The first two checkpoints are freshly observed here; later checkpoints are source-derived implementation targets. Task198 supplies route evidence under its modeled platform, not proof of faithful BIOS behavior or an existing Rust boot.
