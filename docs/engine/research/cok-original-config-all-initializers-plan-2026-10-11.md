# Original CoK configuration and all startup initializers

Astra source/planning pass, 2026-10-11. Root independently verified the
49-call table, 14 resident/35 overlay split, 34 four-instruction bodies and
eight-instruction final initializer. Root also confirmed the held CFG bytes
and hash. Conditional original execution below is not a compiled result.

**SOL’s next scope: finish the real config initializer, generalize overlay admission, then execute all 49 initializer returns and stop before `0000:0134`.**

Astra verified the route against source bytes and bounded, in-memory original execution. The conditional probe reached `0000:0134`; **no new Rust differential, hardware-fidelity or gameplay result is claimed**. No edits, builds, installations, report writes or DOSBox runs occurred.

Coordinates below are unrelocated unless stated. Preserve the declared restored process: load base `1000h`, DS=`1BC6`, SS=`2491`, PSP=`0FF0`, conventional ceiling=`A000`, and the existing explicit environment/JFT/IVT contract.

1. **Finish `01C7:035A` through its actual return at `0000:007B`.**

   Execute path expansion through `01C7:036F → 09C4:018D`, then splitting through `0383 → 09C4:0256`.

   First new DOS requests:

   - `09C4:01BA`: AH=`19`, current drive.
   - `09C4:01D9`: AH=`47`, DL=`3`, current directory.
   - `09C4:0135/0141`: DTA/FindFirst for `krynn.cfg`.

   The conditional fixture declares CWD `C:\KRYNN`. Source produces Pascal `C:\KRYNN\` at DS:`4A80` and `4AD0`, with `[4B20]=43h`. Generalize `rust/cok-recomp/src/startup_platform.rs` (the Rust lifted-code track is omitted from this draft; see [SHARE-REVIEW.md](../../../SHARE-REVIEW.md)). to file identity plus independent cursor per handle, with DOS drive/path resolution, access modes, DTA contents, EOF and AX/CF errors.

   Held `KRYNN.CFG` is exactly 64 bytes:

   ```python
   b'E\r\nA\r\nM\r\nC:\\SAVE\\\r\nF\r\n' + b'0\r\n' * 14
   ```

   SHA-256: `9e857b5bb017c05e258fc1c18eb631f17d18758cad26dd112ef5dde1a19a8e38`.

   Its existence takes `01C7:03F1 → 08AC`. Execute the original stream/parser/close path:

   - `0A46:0639`: open, AX=`3D00`, observed handle 6.
   - `0A46:06FE`: request 128 bytes, receive **64 successfully**.
   - `0A46:076F`: close; GAME.OVR handle 5 retains its independent cursor.

   Source-derived results:

   ```text
   [577A]=02                 A
   [8986]=01 [89CE]=00        M
   [5784]=08,"C:\SAVE\"       save path
   [4B26]=01                 F
   [4B76]=01                 E
   ```

   `[89CE]=0` makes `077C:0000` clear its 56-byte state through `0A46:1661` and skip joystick probing. The fourteen numeric lines are not parsed on this route.

   The successful branch also requires display services:

   - First new BIOS boundary: `0962:060F`, AX=`0600`, BX=`075A`, CX=`0000`, DX=`184F`, at diagnostic work **5,145**: clear the text window.
   - Next AX=`0200`: page-0 cursor to `(0,0)`.
   - CRT output writes text RAM and executes OUT at `0962:058E/0594/059A/05A0`: ports `03D4/03D5`, values `0E,00,0F,50`. Maintain indexed CRTC cursor state.
   - `09C4:000B` constructs a **PUSHF/far-transfer frame through the actual IVT**, requesting AX=`0F00`, `000D`, `0500`. Supporting only `INT 10h` opcodes misses this route. Implement the admitted vector boundary and return frame, resume at `09C4:0045`, and preserve its eventual `RETF 6`.

   Declare mode/page metadata, memory-clearing and cursor effects in both platform implementations. The probe’s modeled mode-0Dh responses establish conditional control flow, not EGA planar-memory/register or font fidelity.

2. **Preserve source arena resizing; replace the two-descriptor admission special case.**

   The held configuration enlarges the original arena:

   ```text
   01C7:098C → 0A46:029C    available-memory calculation
   01C7:0993 → 09F0:01F2    current arena size
   01C7:09BA → 09F0:01A3    request 00028000h bytes
   ```

   At `0000:007B`, source has changed `2891..2F48` to **`2891..5091`**, `2800h` paragraphs / **163,840 bytes**, without DOS allocation calls. Preserve the memory comparison and insufficient-memory branches.

   Generate a catalog from restored START descriptors and GAME.OVR: descriptor identity, file offset, code size, relocation offsets, procedure offsets and source hashes. Startup descriptor/body roots are:

   ```text
   01C3:02FB 0124:0A37 011F:05C8 0116:1359 0111:0BA8
   010B:144C 0105:0884 0102:01B1 00FD:18F3 00F7:0F24
   00E6:37AF 00DB:2510 00BA:5EED 00B3:21BE 00AF:102B
   00A8:376E 00A4:67C3 009E:2817 009A:2E48 0096:00FE
   0092:11A7 0088:42BC 0065:3E9F 0061:0AAB 005E:1E65
   005B:1B60 0058:1653 004E:21F5 004A:0A40 0047:1B4B
   0044:10DA 0041:045B 003E:3F30 003B:07D1 0038:00B2
   ```

   Execute the first 34 four-instruction routines: `PUSH BP; MOV BP,SP; POP BP; RETF`.

   `0038` is substantive: body file offset `00008`, size `00C4`, initializer at GAME.OVR `000BA`. Relocation at body `00B9` changes `0038` to `1038`; source installs **`[439A:439C]=1038:0025`**, not the live body segment, observed as `4098`.

   Admission must bind **descriptor + current allocation/generation + complete relocated body identity** after original loading, relocation and stub patching. Invalidate on eviction, movement and overwrite, including movement that leaves bytes identical. Extend body protection while allowing original loader/mover writes. Catalog metadata must not route execution or preload bodies.

   Fix `rust/cok-recomp/lift.py` (the Rust lifted-code track is omitted from this draft; see [SHARE-REVIEW.md](../../../SHARE-REVIEW.md)).’s stub accounting: both `CD3F` and patched `EA` paths currently increment steps without calling `guest_work(m)`.

3. **Keep interleaved initializer order and verify actual compaction.**

   The final resident calls are interleaved:

   ```text
   007B → 01C3:0020
   0080 → 0128:09A1
   0085/008A/008F/0094 → 0124/011F/0116/0111:0020
   0099 → 0110:0000
   009E onward → remaining 30 overlay initializers
   ```

   Rounded body sizes total **`3F0Ah` paragraphs / 258,208 bytes**, exceeding the expanded arena. First pressure occurs for `0088`: `042Dh` code paragraphs plus `002Ah` relocation scratch, against only `010Ah` remaining at `[437C]=4F87`; shortage=`034Dh`.

   Conditional original checkpoints:

   | Before instruction | Diagnostic work | Expected state |
   |---|---:|---|
   | `01C7:035A` | 4,550 | Existing wrapper checkpoint |
   | `0000:007B` | 83,719 | Config returned; SP=`4000`; arena `2891..5091` |
   | `0000:0080` | 84,044 | First overlay returned; `[437C]=28C1` |
   | `0000:00EE` | 104,454 | Before `0088`; `[437C]=4F87` |
   | `0000:00F3` | 189,035 | Pressure load returned; `[437C]=2CBE`, head=`1105` |
   | **`0000:0134`** | **204,184** | **49 returns; SP=`4000`, BP=`0000`** |

   Counts include stub instructions and REP hook iterations; modeled ROM-service entry adds no guest instruction. Treat them as conditional checkpoints until Rust uses matching accounting.

   Observed: **35 loads, 21 movements, 16 evictions**. Movement reaches `09F0:03FD → 0428 → 049E`, including backward `REP MOVSW`; eviction reaches `037F → 046B`.

   Final state:

   ```text
   [4366]=[4368]=0023
   [437A]=2891 [437C]=40A5 [437E]=5091 [4380]=10A4
   [4388]=[438C]=[4394]=5091
   [439A:439C]=1038:0025
   ```

   The first sixteen descriptors through `00A8` are unloaded with restored `CD3F` stubs; nineteen remain live.

   **BP repair remains partially uncovered:** `09F0:0512` ran 37 times, but repair writes at `052A` and `050D` ran zero times. Add active-overlay-frame pressure differentials for those arms, plus terminating/no-match/tagged-link controls. Host interrupt bookkeeping must preserve source-repaired return addresses.

4. **Lift the dependent closure and gate acceptance on differentials.**

   Explicit far ROOTS needed beyond current coverage:

   ```text
   09C4:000B,018D,0256
   0962:01C0,029C + reached stream/output callbacks
   027F:00CF
   0521:0071,00A0
   077C:0000
   09F0:01A3,01F2
   0A46:029C,04F7,0567,05C1,081C,084A,0898,08E1,
        0919,0AC4,0ADE,1661 + near/callback closure
   ```

   `decode_cfg` does not discover far callees automatically. Verified support gaps include `PUSHF/CLI`, context-admitted `CALL BX` at `0A46:02F3`, rotates at `0A46:02F8` and `09F0:0252/025D`, byte MUL at `0962:057E/05BF`, CLC and CRTC OUT. Numeric, joystick and error alternatives have additional dependencies; do not claim their coverage from the held route.

   Extend `rust/cok-recomp/verify_startup_crt.py` (the Rust lifted-code track is omitted from this draft; see [SHARE-REVIEW.md](../../../SHARE-REVIEW.md)). with independent original/Rust platform implementations. Compare every initializer return and load/move/eviction boundary: registers, defined flags, live stack, memory writes, stream records, paths, file identities/cursors, BIOS/port events, heap/list links, stubs, bodies and generations. Require chunked/uninterrupted equivalence, including yields inside backward movement.

   Required controls:

   - Missing CFG follows `03F4`, including create AX=`3C00` at `0A46:0639`, then configuration UI/input. Implement an isolated in-memory writable filesystem or stop explicitly at unsupported boundaries.
   - CFG open/read/close errors, EOF, malformed/short CRLF and changed E/A/M/path/F bytes: preserve actual source outcomes; no invented defaults.
   - Missing/short/corrupt overlay bodies or fixups: exercise wrapper retry at `0614:04A3` and beep/delay dependencies `0962:02C9,029C,02F6`. Manager fatal path is `09F0:0000 → 0A46:00E2`, AX=`00D1`.
   - Changed PSP ceiling, drive/CWD, cursor/attribute and clock phase/rate/freeze; corrupted descriptors, relocation words, callback pointers, patched destinations and stale generations.
   - Source mutation controls must fail admission before executing modified bodies; valid short CFG reads must remain successful.

Retain the named 2,000-work-unit diagnostic clock and forbidden font reads. BDA-only ticking does not prove timer-interrupt fidelity. Later Luna testing must use **focusless GameLink** to observe pinned DOSBox video/vector/CRTC state, fonts and timing.

Stop before `0000:0134`. Following work is its real prologue and **`0000:013B → 0061:0025`**; startup completion does not establish main execution, full boot or gameplay.

## Executed original-only oracle checkpoint

The new `rust/cok-recomp/verify_startup_all.py` original-only run reached
`0000:0134` at 204,184 diagnostic work units. Root inspected the ignored
`build/cok-recomp/startup-all-original.json` result: 49 source callsites,
58 snapshots, 35 completed loads, 21 completed moves and 16 completed evictions.
Final SP was `4000h`, BP zero, and the catalog covered all 35 descriptors.
The actual KRYNN.CFG stream used handle 6, requested 128 bytes, returned
64 successfully, and closed successfully; GAME.OVR retained handle 5.

This is execution of original instructions under the explicitly declared
platform model. The new C/Rust all-initializer route and its independent Luna
verification are still pending; these counts establish the next comparison
fixture, not a compiled game boot or hardware-accurate result.
### Corrected oracle and active-frame controls

After separating direct CRTC register writes from BDA memory effects and
making instruction-budget pauses idempotent, the original-only rerun still
reaches 204,184 work units. All 49 callsites are explicitly mapped to actual
return checkpoints; chunk-7 execution matches all 58 snapshots.

Eight isolated original-manager frame controls are recorded in ignored
`build/cok-recomp/startup-all-pressure-original.json`. Matching backward
movement executes 2,601 copied words in 2,688 work units and reaches repair
write `052A` twice. Matching eviction reaches `050D` once as well as `052A`.
Tagged links, nonmatching links and a terminating frame walk are covered.
Root independently checked uninterrupted versus chunk-7 movement equality
for registers, defined flags, changed memory, frame words, body hash and
repair-write sequence. These source controls are separate from the default
boot path, whose frames do not exercise these writes. Compiled C/Rust
comparison and independent Luna execution of the controls remain required.
### First compiled all-initializer result; final gates pending

The first C/Rust restored-process run now reaches `0000:0134` at 204,184
work units, with config return at 83,719 and final SP=4000/BP=0. Root compared
all 58 ordered checkpoints against the corrected original-only result:
1,102 common fields match, including registers with defined FLAGS masking,
full changed-memory lists, live stack, IVT, stream records, file/DOS/BIOS
events, clock work/ticks, BDA and wrapper pointers. Common heap values also
match. Runtime heap reporting lacks keys 4366/4368/4380; this reporting gap
must be closed by the strict comparator rather than silently dropping fields.

Inspected artifact SHA256 identities:

- `all-first.json`: `2fcefe2e4a9673aa7eba65939df20b6ece6437099a1fdbe6741fcefe0eb1a2e2`
- `startup-all-original.json`: `a9c6f996e18040095c68fcaf852a46b9d88cba5ace4a4b30771c842654e4db82`

This is a successful default execution under the declared platform model,
not a frozen release or complete acceptance gate. Complete catalog/generation
and config/handle reporting, compiled active-frame controls, the negative and
chunked matrix, regression checks and independent Luna execution remain
pending. Original main, graphics, input and gameplay have not run here.
### Strict observed candidate and nine config cases

The complete observer candidate passed the strict required-field comparison
for all 58 snapshots: 49 nonnull return mappings, all 35 body/stub/generation
rows and 144 source manager events. The 69 development tests also passed,
including the eight compiled/original active-frame controls within one test.
Decoder execution passed 30 rejected and 51 supported emission forms; these
counts do not claim platform-service fidelity for every emitted form.

Root inspected `build/cok-recomp/startup-all-matrix.json`: nine full-state
cases passed with unchanged executable SHA256
`5fcb15ce74016e9b1428167f36005cba998d415b5c2da24fc4c66bdc642e0509`.
Four are positive routes (held config, chunk7, seven-byte reads, changed save
path); five are separately labelled error/malformed diagnostics. Missing
config, open error and read error stop at explicit unsupported boundaries.
Close error and short malformed config are tolerated by original code and
still complete; do not force failure or count them as normal positive inputs.

Additional CWD/drive, PSP-top, clock and budget fixtures are prepared but not
yet run against the forthcoming build. This nine-case candidate is not the
final release freeze. Independent Luna execution, remaining corruption
controls and the existing regression suite remain required before acceptance.
## Accepted all-initializer C/Rust milestone

Actual Luna 6 independently completed the frozen 18-case strict matrix:
6 positive routes, 3 conditional instruction-work clock routes and 9
separately classified diagnostics. All cases passed on release SHA256
`0a11eea6e8674e8a40fcba26ba3d177b0f2f4701dbbbbb5185674b4b7a993b20`.
The supplemental execution preserved its live process through completion;
all 16 production inputs, generated C, oracle, admission verifier and release
hashes matched the frozen provenance before and after.

The primary Luna execution also passed the exact 72-test runner, decoder
30 rejected / 51 emitted controls, all three atomic admission diagnostics,
and the read-only regression suite: 8,851 explicit positives, 512 text cells,
31 negative controls and 19 unchanged watched input files. The initial memo
missed the regression's terminal PASS/exit0 output; root inspected that log,
and Luna's supplement explicitly corrected the summary. The initial matrix
was interrupted by the tester despite progress; it was not a source assertion
failure and is superseded by the completed independent 18-case run.

Generated instruction-shaped C covers 3,935 blocks. Original restored guest
execution completes all 49 initializers, original CFG parsing/arena resize,
35 overlay loads, 21 moves and 16 evictions, then stops before main at
`0000:0134`. The observer validates metadata and source identities; original
instructions perform guest copies, fixups, patches and frame repair.

This milestone does not complete the full game objective. Original main,
real font/resource execution, EGA integration, input/audio, exploration,
combat and save/load remain work. The instruction-work clock and declared
BIOS/DOS services remain a compatibility model, not physical timing evidence.