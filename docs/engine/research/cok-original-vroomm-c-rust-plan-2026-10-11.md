# Original CoK overlay loading and boot through C and Rust

Astra source/original-execution planning pass, 2026-10-11. The callback slice
has subsequently been implemented through mechanically lifted C called by
Rust. Its successful original wrapper path is also implemented. The
initializer and manager subsequently passed the compiled five-flow fixture;
original boot allocation and wrapper error/retry services remain pending.

## Verified C and Rust callback

The runtime lifts 46 callback instructions, bringing the generated total to
719 instruction blocks. The original callback performs the two file reads,
all fixup additions and RETF 2. Rust supplies immutable GAME.OVR seek/read
services and independently checks the complete loaded body before admitting
execution. The complete resident image and its 621 relocation targets are
source-pinned; the relocation-target file also has a compiled SHA256 identity.

```powershell
./rust/cok-recomp/build.ps1
./rust/cok-recomp/target/release/cok-recomp.exe overlay-callback --load-base 0x1000 --query --json
./build/cok-recomp-tools/venv/Scripts/python.exe ./rust/cok-recomp/verify_overlay_callback.py --queries --exe ./rust/cok-recomp/target/release/cok-recomp.exe
```

Actual Luna 6 testing of the completed release with SHA256
`af22d1b177edaa257b145341dcf3b1281968176a21fd0e2ee0151b13488b0009`
passed all eight original/Rust callback comparisons. Both normal load bases
use 269 instructions and 57 **executed** fixup additions; registers, known
flags, full memory changes, file events, cursor, code and relocation bytes
match original execution. Seek failure stops before reading. Code/relocation
read failures return AX=5, short reads return AX=100, and the zero-relocation
diagnostic returns AX=0 while the loaded body remains unadmitted.

The initial callback Luna rerun covered 8,848 prior original comparisons, DAX read-failure controls,
seven map-loader controls and the existing 21 compiled guard tests. The final
decoder script passed 16 rejection forms and 24 supported controls; a separate
eight-case LOOP/JCXZ/LODSW prefix/size check also rejected every form. The
release hash was unchanged before and after testing.

The original memo reported 8,851, but inspection of its executed DAX loop
showed 17 cases, omitting the three earlier-verified graphics members. The
new read-only regression runner includes those members explicitly; its fresh
measurement is recorded with the wrapper results below.

The optional query path uses original DAX decoding in a separate guest,
then calls WALL and DOOR in the callback-loaded guest on GEO block 34.
Results 0 and 1 at both bases matched the independent field oracle. The native
supplement then executed the actual original callback, WALL and DOOR in the
same Unicorn guest. Luna repeated the four query comparisons: WALL returned
0 in 59 instructions and DOOR returned 1 in 112 instructions, at both bases.
Original queries returned through RETF 6 to F000:0000 with SP=F00Ah. The query
comparison covers the result and instruction count exposed by Rust; the
complete register/flag/memory comparison above applies to the callback.

Luna also executed two existing isolated erroneous builds and verified their
source/generated-C/production/mutant fingerprints. The incorrect resident
delta performed 57 additions but failed loaded-byte admission; the incorrect
destination segment stopped before copying with status 7 and no fixups.
Production source and executable were unaffected by these controls.

This is an isolated callback with explicit descriptor/arena/file-handle
fixtures. It does not implement original VROOMM routing, boot heap allocation,
or general resident execution at a nonzero relocation base. The next runtime
work is in [the VROOMM implementation plan](cok-original-vroomm-implementation-plan-2026-10-11.md).

## Verified successful original wrapper

The admitted wrapper closure contains 13 instructions and no instruction
relocation words. Its saved DS:885Fh/8861h pointer calls the original callback
through an actual memory-indirect far CALL, with the original CS/IP frame and
both RETF 2 instructions. The complete wrapper spans 56 source bytes; the
admitted successful closure occupies 31 bytes. The error route beginning at
04A3h remains an explicit boundary rather than a host retry implementation.

```powershell
./rust/cok-recomp/target/release/cok-recomp.exe overlay-callback --wrapper --load-base 0x1000 --query --json
./build/cok-recomp-tools/venv/Scripts/python.exe ./rust/cok-recomp/verify_overlay_wrapper.py --queries --exe ./rust/cok-recomp/target/release/cok-recomp.exe
```

Actual Luna 6 reruns of release SHA256
`4862476f236981cb129a7241fbc0ed75b78cadaaf5da1a4ab710828ae598b2e5`
passed seven strict wrapper comparisons. Both normal bases execute 282
instructions: 13 wrapper and 269 callback, with 57 fixups and final SP=F006h.
Read errors and short reads reach the unimplemented original error entry with
status 12; seek failure retains the host stop before a stale-cursor read.

Four native query calls execute original WALL/DOOR in the same wrapper-loaded
guest. Results/counts match Rust at both bases: WALL=0/59 and DOOR=1/112,
with original query returns at F000:0000, SP=F00Ah. Callback comparison covers
full registers, known flags, memory changes, file events and loaded bytes;
the query comparison covers the exposed results/counts.

Luna also passed all eight earlier callback cases and four callback native
queries, 29 compiled guard tests, 18 decoder rejection forms and 26 supported
controls. Two invalid saved-pointer controls stop before any file events.
An isolated incorrect return-IP build executes 57 callback fixups but fails
the original comparison and loaded admission with status 1. Luna verified
the source/generated-C/production/mutant fingerprints and unchanged release
hash. Far-call tests include four-byte pointer reads, frame order, complete
frame admission, and guarded stack words crossing the 20-bit address wrap.

The separate actual Luna regression run used `verify_regression_readonly.py`
and passed **8,851 positive original comparisons**, 512 text cells and 31
negative controls. Its DAX denominator is explicit: 17 standard cases plus
8X8D1 members 201/202 and WALLDEF1 member 1. Every declared DAX positive
must be admitted; matched failures cannot increase that positive count.
The release SHA and 17 watched original/generated input hashes remained
unchanged. The runner performs no preparation, compilation or report writes.

```powershell
./build/cok-recomp-tools/venv/Scripts/python.exe -B ./rust/cok-recomp/verify_regression_readonly.py
```

The saved wrapper callback pointer is still an explicit fixture. This wrapper
slice does not claim original boot installation or completed error/retry
behavior. The subsequent manager fixture is recorded below.

## Verified original initializer and manager through C and Rust

The compiled runtime now executes the original initializer, manager, public
stubs, callback and target bodies. Original code performs allocation decisions,
relocation, stub patching/restoration, eviction and IRET. Rust supplies bounded
immutable file open/seek/read and DOS vector installation. Metadata validates
current bodies and records descriptor-load generations; it does not route or
replace the original overlay decisions.

The generated total is **1,183 instruction blocks**: the earlier 732 plus
447 manager/initializer blocks and four instructions in descriptor 0105's
pressure-test initializer. Relocated instruction variants affect both checked
bytes and executed operands, including the original MOV AX,0BC6h becoming
MOV AX,1BC6h at resident load base 1000h. Both bases apply all 621 original
resident fixups. Manager execution cannot bypass full-body admission through
the older explicit query-module binding.

```powershell
./rust/cok-recomp/target/release/cok-recomp.exe overlay-manager --load-base 0x1000 --json
./build/cok-recomp-tools/venv/Scripts/python.exe -B ./rust/cok-recomp/verify_overlay_manager.py --faults --exe ./rust/cok-recomp/target/release/cok-recomp.exe
./build/cok-recomp-tools/venv/Scripts/python.exe -B ./rust/cok-recomp/verify_regression_readonly.py --expected-sha256 ed891ff02605530ed829f5b53ff746f52b70ab93bfacdf8d900b245cbfc3ed16
```

Actual Luna 6 testing passed ten complete original/Rust calls, five per base:
initializer, first wall stub, patched repeat, descriptor 0105 eviction and wall
reload. Counts are **90 / 522 / 60 / 3,349 / 1,855** at both bases. INT 3F/IRET
counts are 0/1/0/1/1, and fixup counts are 0/57/0/68/57. Comparisons cover full
registers and known flags, memory changes, file events/cursor, complete loaded
bodies, all five live stub bytes, descriptor/list/arena state and generations.
The repeated patched call performs no file I/O; eviction restores original
CD 3F stubs and reload changes generation despite reusing segment 3000h.

Six strict fault-prefix comparisons also passed: seek stop, code/relocation
read errors, both short reads and budget exhaustion. Luna reran the 8,851
positive regression comparisons, 512 text cells, 31 negative controls,
callback/wrapper native queries, 40 compiled guard tests and decoder controls
(21 rejected forms / 34 supported forms). Interrupt guards cover frame
order, complete frame admission, IF/TF and known-mask continuity, frame
identity, 16-bit SP wrap and the 20-bit physical-address wrap.

Two isolated incorrect builds were detected by original comparison and
acceptance: the incorrect relocated immediate stopped with status 7 and no
fixups; the incorrect IRET CS stopped with status 4 after 57 fixups. Luna
verified current source/generated-C/production/mutant fingerprints. Production
SHA256 remained
`ed891ff02605530ed829f5b53ff746f52b70ab93bfacdf8d900b245cbfc3ed16`.

This fixture reserves a synthetic 350-paragraph arena and supplies outer
call frames. It proves the selected five flows, not every compaction or
BP-linked return-frame movement branch. Original boot heap allocation,
asynchronous interrupts, platform display/input and playable gameplay remain
unfinished. The next step is entry from the restored original MZ startup.

## First actual overlay-loading checkpoint

The original callback at resident 09F0:[0268h,02E5h) is 125 bytes and returns
with RETF 2. Source SHA-256:
`2a1ca7b8cbf03d05dd3ccfaef5b21ee6da4c1e460bf89b925625115edb680531`.
Its only platform boundaries are DOS seek AH=42h and read AH=3Fh.

Entry SP+04h is a descriptor segment. Descriptor +10h is the destination code
segment; +08h is code size and +0Ah relocation size. DS:4382h is the GAME.OVR
handle, DS:436Eh/4370h the container base and DS:43A8h the PSP segment.
The resident relocation base is PSP+10h, independent of overlay placement.
The callback reads code and its relocation words, then adds that resident base
to each indicated code word. Reserve the rounded code extent plus relocation
table space in the overlay arena.

Astra executed the original callback at resident load base 1000h, descriptor
110Bh, destination 3000h, DS=1BC6h, SS=6000h and SP=F000h. The host supplied
only seek and read services. Observed events:

1. Seek to GAME.OVR offset 3D296h.
2. Read 5,201 code bytes into 3000:0000.
3. Read 114 relocation bytes from 3E6E7h into 3146:0000.
4. Apply all 57 fixups and return AX=0, SP=F006h, DS=1BC6h.

The final file cursor was 3E759h; 269 original instruction hooks executed.
Every loaded byte matched independently relocated original code. Loaded code
SHA-256: `7594775da72f0e7db55b4abcb839c3859b7292a3fca30f4da79ac1adef81154f`.
This is an original-only loading proof, not a result from the Rust runtime.

The callback returns 100 on short reads or the DOS error AX when CF is set.
It does not check seek CF before reading: an admitted host seek failure must
stop execution before a stale-cursor read. Verify these boundaries explicitly.

## Wrapper and real manager

### Original initializer and manager execution proof

Astra subsequently executed the original initializer, manager, callback,
public stubs and target procedures in one bounded Unicorn sequence. The host
supplied file/vector services and architectural interrupt entry, without
making any overlay routing decision.

| Original call | Instruction hooks | INT 3F / IRET | Observed result |
| --- | --- | --- | --- |
| Relocated 09F0:0012 initializer | 90 | 0 / 0 | Open GAME.OVR and install manager |
| 110B:002A wall stub | 522 | 1 / 1 | Load/relocate module and return AX=10 |
| Same patched wall stub | 60 | 0 / 0 | Return AX=10 with no file read |
| 1105:0020 initializer stub | 3,349 | 1 / 1 | Evict module 010B |
| Wall stub again | 1,855 | 1 / 1 | Evict 0105, reload 010B and return AX=10 |

Original manager code changed loaded public stubs to EA far jumps and restored
evicted ones to CD 3F. Every loaded module matched independently relocated
source. These were original-only results; the subsequent compiled fixture
and independent rerun are recorded above.

Load the complete resident image at 1000h with its 621 fixups. Outer-entry
fixtures use DS=1BC6h, SS=6000h, SP=F000h, BP=0 and FLAGS=0202h, with sentinel
return F000:0000. The synthetic pressure arena has DS:437Ah=3000h,
DS:437Ch=3000h and DS:437Eh=315Eh, 350 paragraphs. DS:4380h/436Ch/4376h/4378h
are zero and DS:43A8h=0FF0h. Retain the original nonzero overlay-presence word
at DS:4372h; the probe's unnecessary replacement with 1 is not a production
initialization requirement.

Place the Pascal GAME.OVR filename at DS:1000h. Initializer arguments are
offset 1000h and segment 1BC6h; its RETF 4 returns SP=F008h. The probe observed
open handle 5, seek/read of the eight-byte FBOV header, container base zero,
DS:4382h=5, original callback 19F0:0268h at DS:8A5Ah and post-callback
19F0:02E5h at DS:4376h. Original AX=253Fh installs vector 19F0:02E6h.
Admitted DOS functions are file open 3Dh, absolute seek 4200h, read 3Fh and
vector installation 253Fh against the immutable original file.

Architectural INT entry creates the six-byte frame whose lowest address is
return IP, then CS, then FLAGS, and clears IF/TF. The installed original
manager chooses the overlay and modifies that frame before its actual IRET.
The host must not replace those decisions with direct procedure routing.

The wall fixture has DS:6D7Ch=7000:0000 and all 1,024 map bytes ABh, with
selector 0, y=1, x=1. Final wall state is AX=000Ah, SP=F00Ah, DS=1BC6h,
ES=7000h, DI=0011h, CX=4, DX=1 and FLAGS=0206h. The nested original bounds
routine and original RETF 6 both execute. Arena setup and outer far-call
frames remain explicit fixtures; original boot heap allocation is unproven.
This sequence used the initializer-installed callback directly, without the
later 0614:0492h wrapper. The wrapper is tested separately above; it was not
part of this original-only five-call manager sequence.

Initializer final registers, before the next outer fixture reset, were
AX=0000h, BX=0005h, CX=0008h, DX=02E6h, SI=1009h, DI=EF85h, BP=0,
SP=F008h, CS:IP=F000:0000, DS=1BC6h, ES=6000h and FLAGS=0246h.
Only the first entry zeroed unspecified general registers. Subsequent outer
calls reset CS/IP, DS/SS/SP, BP and FLAGS=0202h; the remaining general registers
carried over from the preceding call. The final register baselines depend on
that exact fixture sequence.

### Captured descriptor and file-event transitions

Both descriptors were unloaded after initialization, with words +10h/+12h
zero, arena-next=3000h and list-head=0. Subsequent captured states were:

| After call | 110B loaded segment | 1105 loaded segment | Arena next | List head |
| --- | --- | --- | --- | --- |
| First wall | 3000h | 0 | 3146h | 110Bh |
| Patched wall | 3000h | 0 | 3146h | 110Bh |
| Other initializer | 0 | 3000h | 3089h | 1105h |
| Reloaded wall | 3000h | 0 | 3146h | 110Bh |

Descriptor state word +12h remained zero throughout; base/end were always
3000h/315Eh. Loaded bodies matched independently relocated source at each
observation. Reload identity cannot be inferred from segment alone: two
different descriptors used 3000h during this sequence.

Initialization opened GAME.OVR, sought zero, read eight bytes into 6000:EFF4
and installed the vector. First wall load sought 3D296h, read 5,201 bytes into
3000:0000, then read 114 relocation bytes from 3E6E7h into 3146:0000. The patched
call had no DOS events. The other initializer sought 3C985h, read 2,185 bytes
into 3000:0000 and 136 relocation bytes from 3D20Eh into 3089:0000. Reload
repeated the first wall's three events. All reads returned their full counts.

The probe captured stub opcodes CD/EA, loaded segments and body hashes, but did
not record every live stub byte. The following complete bytes are expectations
derived from original operands and source-proven patch stores; compiled
acceptance must capture and compare all five live bytes:

| Stub | Unloaded | Loaded at 3000h |
| --- | --- | --- |
| 110B:0020 initializer | `CD3F4C1400` | `EA4C140030` |
| 110B:002A wall | `CD3FA20600` | `EAA2060030` |
| 1105:0020 initializer | `CD3F840800` | `EA84080030` |

Eviction restores the unloaded form; loading repatches the far-jump form.
Architectural push order is FLAGS, CS, return IP: new SP decreases by six and
has +0 return IP, +2 CS, +4 FLAGS. Original IRET performs the return.

Boot at 01C7:031Ah replaces DS:8A5Ah/8A5Ch with callback 0614:0492h, saving
the original pointer at DS:885Fh/8861h. Wrapper [0492h,04CAh) forwards the
descriptor argument through that saved callback and returns RETF 2 on success.
Its error path invokes three 0962h services (02C9h,029Ch,02F6h) and retries.
Lift the 56-byte successful wrapper path; reject an unimplemented error route.

The actual INT 3F manager occupies 09F0:[02E6h,055Fh), 633 bytes. Initialization
at 09F0:0012h installs it via DOS INT 21h/AX=253Fh. **0A46:00D7h is the early
error-208 trap, not a functioning VROOMM loader.** Existing harness bridges at
that trap must be identified as host routing.

The first manager acceptance must execute an original CD 3F public stub,
load its target and return via original IRET. The original manager patches
the stub to EA far-jump form; a repeated call must use that patch. Then force
eviction, observe restoration of CD 3F, reload and verify a new generation.

Relevant manager offsets: 0338h loads/evicts, 0435h patches public stubs,
046Bh restores interrupt stubs, 049Eh moves code and repairs stub segments,
and 0506h/0512h traverse BP-linked saved return frames to repair moved CS values.
Track loaded modules by descriptor, loaded segment, generation and source
offset. Invalidate old segment bindings on moves/unloads. Keep original guest
CS:IP return frames and original selector-stub routing; permanently assigning
CS to a module or bypassing stubs with direct host C calls is insufficient.
Descriptor stubs are explicitly mutable original code. Verify module body
identity after read/fixup before admitting execution.

## Toward original boot and visible demo

Start after EXEPACK transfer at restored 0000:003Fh, with all 621 resident
relocations applied. Its 49 far initialization calls precede main 0000:0134h.
Main calls descriptor 0061:0025h, resolving to GAME.OVR:100F3h.

Useful original checkpoints are resident initialization/DS/vector setup,
first BIOS query at image 9C2Fh, loader installation and first overlay
initialization, main initializer 100F3h, ECL dispatcher/fetch 4449h/447Dh,
and no-key demo ECL2 member 57 index 8354 before COMBAT.

The [Task 198 original demo trace](cok-task198-original-demo-combat-boundary-2026-09-28.md)
already reaches that final checkpoint after 51,858,876 emulated instructions
without preloaded overlays or injected keys. It is an oracle, not a translated
Rust implementation. Its synthetic defaults and no-op platform responses are
not fidelity evidence for production services.

Boot still requires DOS vector, file, memory, path/search and console services;
BIOS video detection and keyboard polling; timer state and video-port behavior.
Visible demo acceptance requires original display execution into a real
framebuffer model. COAB-derived rendering documents provide hypotheses and
names; they do not establish original CoK binary addresses or behavior.
