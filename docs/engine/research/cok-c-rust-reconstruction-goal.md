# Champions of Krynn reconstruction through C and Rust

User-selected goal: 2026-10-11. Status: active.

## Verified first slice on 2026-10-11

SOL 6.1 implemented `rust/cok-recomp/README.md` (the Rust lifted-code track is omitted from this draft; see [SHARE-REVIEW.md](../../../SHARE-REVIEW.md))..
The compiled Windows executable calls generated C for 32 original resident RNG
instructions. The generated execution path does not use the independent Python recurrence.
The correct original CS is **0A46h**: bounded Random is IP 1179h, updater IP 11C8h,
and the CS-relative constant at 11FEh is image B65Eh. An initial planning inference
of CS 0A42h was rejected by the actual bytes before accepting the build.

Luna 6 independently ran the read-only verification via the repository's CLI helper after
the collaboration interface rejected another subagent because of its thread limit.
Measured result: **146 vector fixtures / 428 calls**, plus **12 FLAGS-focused calls**,
all matching original Unicorn execution and the independent recurrence where applicable.
The checks covered registers, defined FLAGS, true near/far return boundaries,
instruction counts and complete guest-memory differences. Five rejection/dependency
controls passed; an isolated faulty MUL implementation produced the expected discrepancy.
The tested executable SHA-256 is
`d6022b0f219db073f90672d036de458dad46c163e0cafd372cebbe657772bf29`.

This closed the initial bounded RNG proof for the fixed DS 5000h / SS 6000h /
SP F000h fixture. At that checkpoint, DS/SS/SP relocation and segment aliasing
were not covered. Later verification below supersedes those initial limits.

## REA analysis pilot

The user selected [morluto/rea](https://github.com/morluto/rea) as an additional analysis tool.
The pinned CLI ran through Ubuntu WSL with REA 6.4.0, Node 22.23.3, Ghidra 12.1.4 and
Temurin JDK 21.0.12.1. REA's scoped Ghidra readiness was healthy; its environment report
still labels Ubuntu 22.04 unsupported. The successful local pilot does not turn that
environment into an upstream-supported host.

`prepare_rea.py` constructs an ignored analysis MZ from the original complete resident
image, with 621 relocations and source/transformation digests. REA's load-image attestation
returned **verified, 554/554 checks**, load segment 1000h, 2,560 header bytes and 65,568
module bytes. The artifact SHA-256 is
`b51f3fd69bc50e171a6e3429c7bc75df7cbc5c0a6e9bc993dacf4fdfd619f433`.
Analyst-supplied function seeds identified the bounded routine at linear 1B5D9h
(10 instructions, RETF 2) and updater at 1B628h (22 instructions).

The returned pseudocode incorrectly binds the multiplier to analysis address 111FEh;
the actual CS-relative constant belongs at 1B65Eh in this import. Therefore REA is useful
for instruction discovery, cross-references and import provenance, while its default
pseudocode is not accepted as faithful compilable C. The original machine-code lifter's
explicit CS and execution differential remain authoritative for this slice.
The optional `rea-analysis.ps1` reproduces the pilot without global MCP configuration.

## Verified pointer and resource text slice on 2026-10-11

The Rust host now calls C lifted from four original resident routines, totaling
**53 instructions**. Added routines are Pascal-string length at image AF62h
(0A46:0B02, RETF 4) and bounded Pascal-string copy at AF3Eh
(0A46:0ADE, RETF 0Ah). The copy writes a length byte and
`min(source_length, bound & 255)` payload bytes, clears DF, and restores DS.
It is used by the real resource caller at GAME.OVR:3CA7Eh; this is not a
fabricated pointer example or a NUL-terminated C string routine.

The decoder rejects unsupported operand widths/prefixes. Guest memory helpers reject
unsupported word accesses at offset FFFFh and far-pointer records crossing the segment
end. Defined-FLAGS knowledge persists across calls. Result schema 2 identifies the full
fixture configuration and applied patches. Configurable DS/SS/SP admission checks actual
active memory spans, permitting the source-adjacent DS 0BC6h / SS 1491h / SP 4000h fixture.

Luna 6's independent read-only pass measured **146 RNG fixtures / 428 calls** and
**60 pointer/configured fixtures / 123 calls**, all matching unchanged original x86
execution for the exercised routes. Pointer coverage includes byte lengths 0/1/5/127/255,
word bounds with nonzero high bytes, DF set, aliased and overlapping buffers, repeated
calls, register/stack cleanup, complete memory differences and source-adjacent placements.
Four compiled Rust guard tests passed; 12 unsupported decoder forms were rejected with
eight supported controls. Isolated wrong-segment and arithmetic mutations produced the
expected discrepancies. The unchanged before/after tested executable SHA-256 is
`9404ac5bae47f7f68a1f4f4ecf8cc31e78fb120ff1cac04eb99a495cd943c74f`.

At the pointer checkpoint, each CLI invocation repeated one routine. Mixed
RNG-to-string composition remained unverified. The following overlay query
work extends the execution path; original boot and gameplay remain unfinished.
Fixed source pins remain the admission boundary; arbitrary DOS programs are
not supported by this instruction subset.

## REA entry-context experiment

A second analysis-only MZ changed only header offsets 20..23 to declare entry CS 0A46h,
IP 1179h. Its module bytes and relocations were identical to the earlier analysis artifact;
its SHA-256 is `1a2255442ef0448c04f5c22ffa3250d43f65f8211a619b2ecf078ad6fc57d709`.
REA again verified the import and reported entry linear 1B5D9h, but the updater pseudocode
still referenced 111FEh instead of the correct 1B65Eh constant. Changing entry metadata
alone therefore does not repair the provider's CS context. Explicit Ghidra register-context
work remains necessary before treating that pseudocode as an executable translation.

Astra inspected the pinned REA 6.4.0 provider sources. Its environment settings
and seed script expose no CS register-context declaration; seeds use numeric
default-space addresses. The launcher admits packaged scripts rather than an
arbitrary context script. The packaged COM preparation sets segment context,
but that path applies only to COM inputs and is unsuitable for this MZ.

The proposed correction is a separate scratch headless Ghidra import of the
unchanged MZ. Before analysis, use segmented addresses 1A46:1179..118E and
1A46:11C8..11FD, clear their old decoded listings/functions, set ProgramContext
CS=1A46h over those ranges, then disassemble and recreate the functions.
The verification must prove that the MUL operand reaches linear 1B65Eh and
its original bytes 0584, with correct near-call/return boundaries. These are
analysis addresses including the 1000h import base; execution still uses the
original CS=0A46h in the base-zero fixture. This context script is a proposal,
not a verified correction or a supported REA CLI option. Retain assembly-only
use if the reference remains wrong.

## Verified original map queries on 2026-10-11

SOL 6.1 extended the lifter to **53 resident plus 245 overlay instructions**,
298 in total. The original WALL, DOOR and bounds procedures run from an
explicitly preloaded GAME.OVR descriptor 010Bh, base 3D296h, extent 1451h.
Their entry offsets are 06A2h, 0573h and 0542h. None of the translated
instructions overlaps the module's 57 relocation words. Generation rejects
such overlap; this slice applies no overlay fixups.

The Rust map view calls original WALL and DOOR for all 256 cells and four
selectors on both held GEO1.DAX maps, 32 and 34. It retains each direction's
numeric face separately. DOOR returns 1 when WALL is zero; invalid coordinates
in modes 00h/50h return zero before that default. Other modes modify signed
coordinate argument bytes according to the original bounds routine.
Bare opcode 98h executes CBW in this admitted 16-bit mode, regardless of the
decoder's displayed mnemonic. The original PUSH-CS/near-CALL far frame and
RETF cleanup are preserved; deepest measured stack use is 30 bytes below SP.

Luna 6 reviewed SOL's original-Unicorn and independent field-oracle harness,
then independently executed its pure helpers against the final frozen binary.
**4,180 GEO calls across 42 fixtures passed**, including 4,096 calls covering
every cell/selector/WALL/DOOR combination on both maps, signed bounds,
explicit mode 50h, repeated calls, scratch registers and relocated or aliased
segment placements. Registers, defined FLAGS, complete changed guest-memory
bytes, instruction counts and real far returns matched unchanged original x86.
Both visible text maps matched every cell's query results.

The same final executable passed fresh **428 RNG and 123 pointer/configured
calls**, totaling **4,731 original-code differential calls** for this stage.
Eleven GEO admission controls and 13 unsupported decoder forms were rejected;
nine supported decoder controls and five compiled Rust guard tests passed.
Luna executed the isolated wrong-plane
and wrong-segment binaries and observed results 3 and 0 against the correct 2;
both field and original-machine comparisons detected the faults.

The earlier candidate allowed patches into unexecuted overlay bytes. Root's
review and Luna's reproducer caught it; the final host rejects patches into
the complete loaded overlay and protected resident code/constants. Module
dispatch also checks extent and version before executing an instruction.
The final release executable SHA-256, unchanged before/after Luna's run, is
`c52bac8e8db92f7afa701128afab4c6694a8cc3f3a41d3aa2e44c0212eacd3a1`.

At this first query checkpoint, GEO preparation used the existing Python DAX
reader on source-pinned records. The following decoder stage replaces that
preparation in the standard Rust execution path. The preloaded module still
does not establish an original overlay loader, boot or gameplay.

## Verified original DAX resources on 2026-10-11

SOL 6.1 lifted the original decoder at 069C:06C4h, its block-read wrapper at
0A46:14B4h, file-record check at 146Fh and fill helper at 1661h. The generator
now emits **107 resident, 89 DAX and 245 overlay instruction blocks**, 441 in
total. Four DAX far-call relocation words are identified and preserved at the
admitted resident load base zero. Nonzero resident relocation remains a later
implementation milestone.

The only new platform service is a bounded DOS INT 21h/AH=3Fh read from an
immutable compressed-member stream. Original code performs control decoding,
literal/repeat operations, file-record checks, I/O error writes, and near/far
returns. The Rust callback validates the entire write request before copying;
the guest write guard admits only output, stack and I/O-state spans. The runner
stops once original I/O state records a failure, before unsafe decoder
continuation. This is not a full DOS file-system service or malformed-stream
recovery implementation.

INC preserves the old CF value and its defined/unknown status. DOS callbacks
define only CF without resetting other flag knowledge. Source/block mode and
expected output identity are included in the fixture digest; mixed synthetic
stream/member modes are rejected independently of argument order. TF is rejected
before execution because single-step interrupts are not modeled in this slice.
The deepest original decoder stack use is 544 bytes below caller SP.

Luna 6 independently reviewed and executed SOL's pure original-Unicorn and CoK
reference helpers against the final frozen executable. **20 positive original
decoder differentials passed**: both GEO maps with DF clear/set; literal,
repeat, maximum run, mixed and skipped 7Fh/80h controls; a source-adjacent
placement; and retail 8X8D1.DAX members 201/202 and WALLDEF1.DAX member 1.
Registers, defined FLAGS, complete changed guest-memory bytes, read traces,
cursor positions, instruction counts, outputs and real returns matched.
Five fault-prefix differentials and additional oversized-request, TF and
mixed-source admission controls passed.

The same final executable passed fresh **428 RNG, 123 pointer/configured and
4,180 GEO calls**. Together with the decoder positives, this stage verifies
**4,751 successful original-code calls**, plus the five fault prefixes.
All nine compiled Rust guards, 14 rejected decoder forms and 17 supported
controls passed. Both visible maps matched all 512 text cells. Prebuilt
wrong-read and wrong-segment decoder variants were rejected against a correct
original result; Luna did not establish their derivation after the TF-only fix.
SOL subsequently reran both mutations from the final source. Root verified the
retained production, source-tree, generated-C and mutant-binary hashes against
current files; both mutations again returned status 7 versus original status 0.
The generic source-tree digest is
`ebab03f4eed3c492e4fa9a1f467b735689934b4674964be4f45e584cf4fe81e3`.

Standard `geo` execution now calls lifted DAX code on the source-pinned
compressed member, takes decoded bytes 2..1025 and supplies them to original
WALL/DOOR queries. It initializes a **fresh query guest** from those bytes;
schema 5 records that composition. Decoder register/stack state is not carried
into query execution. Explicit `--map-file` remains a pinned-reference fixture.
Python decompression remains in preparation/reference tooling, not in this
standard execution path.

The final executable SHA-256 was unchanged before/after Luna's run:
`c2d296fe14ea4cd43be134387b9517341dd3d49b8b3c4a4d03358e8111ea1741`.
Raw-resource hashes and original counters are recorded in
[the DAX source/acceptance record](cok-original-dax-c-rust-plan-2026-10-11.md).
Graphics resource decoding does not establish rendering, boot or playable
game behavior.

## Verified returned loader and shared query guest on 2026-10-11

SOL 6.1 lifted the success path of original Load3DMap at overlay 010Bh:130Dh,
plus Pascal assignment/concatenation, decimal formatting and the four original
memory copies. The generator now emits **230 resident, 354 overlay and 89 DAX
instruction blocks**, 673 total. It validates and protects the indexed 40-byte
decimal table and embedded Pascal strings. The unsupported error entry 1378h
is an explicit stopped path; success admission requires resource extent 0402h.

Original naming, copies, map-ID write and the real RETF 2 execute in one loader
guest. Two explicit host services supply resource lookup/allocation and release.
Resource bytes come from the verified original DAX decoder in a separate guest.
The host service validates the original filename/arguments and return frame,
preserves registers and FLAGS, enforces one matching allocation/release and
denies subsequent guest reads of the released resource. Word guards check each
physical byte, including the 20-bit wrap. This is not original heap execution.

After the real loader return, original WALL/DOOR queries execute in the **same
loader guest**, retaining its registers, flag knowledge, memory and released
resource state. Schema 7 is one JSON result, including view/trace policy and
fixture identity. Optional per-query traces expose complete changed bytes;
the text view remains compact. All 57 overlay fixup words are explicitly
processed with resident delta zero; module loading is still a host preload.

Luna 6 reviewed and independently executed SOL's pure original-Unicorn harness
on the frozen release. **Four returned loader cases and 4,096 same-guest query
calls passed**, covering both maps and source-adjacent placements. The loader
took 1,342 original instructions with matching full registers, defined FLAGS,
memory changes, four copies, context ID, single lookup/release and actual
CS:IP/SP return. Its deepest measured stack use is 328 bytes below caller SP.
Both visible maps matched all 512 displayed cells. Seven controls rejected
wrong name/extent, budget exhaustion, post-release reads, indexed-table/module
patches and unsupported nonzero resident load base.

The same release passed fresh **4,751 prior original-code calls**. This stage
therefore verifies **8,851 successful original calls**, plus the decoder fault
prefixes and loader controls. Luna also checked the original-code observer
workaround: the installed Unicorn 2.1.4 Windows global read hook can corrupt
far returns, independently reproduced with synthetic instructions. The oracle
uses decoded code operands and write hooks, preserving correct execution.
See the [exact limitation and source contract](cok-original-map-loader-c-rust-plan-2026-10-11.md).

Release SHA-256 was unchanged before/after Luna's run:
`6f6e474ec1b68cfbc98d9575f6447e7b779d8369d6ffd37c2b4bac0a8ae05041`.
Luna's supplemental pass also ran **16/16 compiled debug tests**, including
DEC/CF knowledge, SBB borrow, active/released byte and word reads, 20-bit wrap,
invalid-span preservation and sticky faults. Fourteen unsupported decoder
forms were rejected and 21 supported controls passed. An isolated copy-count
mutation took 1,338 steps and failed map/original acceptance. A separate
ownership mutation incorrectly allowed a released-pointer query; the original
comparison detected that regression. Luna verified current source-tree,
generated-C, production and mutant-binary hashes against the retained evidence.
Neither mutation changed the production source or release executable.
Original VROOMM loading,
full resource/heap execution, boot, display and gameplay remain required.

## Next execution step

Lift the original 09F0:0268h overlay-loading callback and its successful wrapper,
adding bounded DOS seek to the existing read service. Verify source bytes,
57 original fixups and true return before admitting loaded module execution.
Then reproduce the original VROOMM initializer/manager CD 3F → EA → eviction →
reload sequence described in
[the source-proven VROOMM contract](cok-original-vroomm-c-rust-plan-2026-10-11.md).
Nonzero resident relocation, original mutable stubs and generation-aware
bindings are required for the actual boot route; host preload is not sufficient.
The following [resource and heap source contract](cok-original-resource-heap-c-rust-plan-2026-10-11.md)
already proves original lookup/allocation/release for both GEO maps without a
host allocator. It identifies the DOS services and reached resident dependencies
needed to replace the loader's temporary resource callbacks.

### Following map-loader acceptance

Astra has now executed the original loader through its real return for both
held GEO maps at resident bases 0000h and 1000h. All four runs used 1,342
original instruction hooks and matched map buffers, resource release and map-ID
changes. Two temporary resource/allocation services supplied the boundary.
The exact ABI, helper/data hashes, relocation and final-state contract are in
[the returned original map-loader plan](cok-original-map-loader-c-rust-plan-2026-10-11.md).
These are original-only feasibility results; a compiled loader is still pending.

Astra's byte-level review identifies `Load3DMap` at overlay 010Bh offset 130Dh
(GAME.OVR file 3E5A3h), ending with RETF 2 at 1449h. Its successful path checks
the decompressed member extent 0402h, copies four 256-byte planes from member
offset 2, releases the resource and stores the map ID through DS:4B28h, field
+18Ah. Acceptance must reach that real return and verify all three effects;
stopping at the copy checkpoint 142Ah does not establish a returned loader call.

Required resident helpers include Pascal assignment at 0A46:0AC4, concatenation
at 0A46:0B51, decimal formatting at 0A46:131F and memory copy at 0A46:163E.
Decimal formatting also uses the near helper at 120Dh and the indexed
CS-relative table at 125Fh..1286h. The generated-code admission contract must
include that source-pinned table rather than discovering only constant-address
memory operands. Unlike the query routines, the loader contains relocation
words that must be applied and independently checked.

Original DAX lookup/decompression at 069C:088Eh and resource release at
0A46:0254 remain execution dependencies. Any temporary host resource service
must be identified as such. Original VROOMM overlay loading/reloading is still
a separate prerequisite for booting the game.

A smaller resource milestone is the original resident DAX decoder at
069C:06C4h (image 7084h), ending at 077Dh with RETF 12. Astra's source review
finds only block-read 0A46:14B4h and fill 0A46:1661h as callees. The block-read
path validates file-record magic D7B3h and reaches DOS INT 21h/AH=3Fh. A bounded
read-only stream service at that DOS boundary would allow the original decoder
to run before recovering full path lookup and allocation. This is planned,
not an implemented resource service. Original control bytes 127 and 128 take
skip paths; the independent comparison must check these explicitly.

## Overall objective

Recreate the DOS Champions of Krynn as a playable modern Rust application calling C
mechanically lifted from the original START.EXE and GAME.OVR. Preserve original game
behavior through explicit guest machine state and platform services, then progressively
replace or simplify recovered functions without losing verified behavior.

The user explicitly assigns **Astra to planning, SOL 6.1 to implementation, and Luna 6
to runtime verification**. These assignments override the repository's default agent roles
for this work. The persistent Codex goal is active in the chat that initiated this track.

## First milestone

Produce a compiled Windows Rust executable calling C generated from the original resident
CoK bounded-Random routine at image B5D9h and its state-update callee at B628h. Translation
must follow decoded source instructions. Hand-coding the known recurrence and calling it
from Rust does not satisfy this milestone.

The existing Python recurrence remains an independent comparison reference. Original
game bytes, unpacked images, generated original-derived C, binaries and traces remain local
ignored artifacts. Committed files contain our generic generation/runtime/build tools,
Rust host, dependency manifests and verification procedures.

## Machine contract

- Fixed-width general registers, segment registers, IP and FLAGS, with explicit shared
  guest memory; guest pointers remain segment/offset values rather than host references.
- Original CS-relative constant access, near CALL/RET and far RETF argument cleanup.
  B5D9h uses RETF 2; its state updater is a near callee.
- Source-derived entry identity and executable hashes. Preserve actual CS for relative
  reads rather than treating equivalent linear addresses as equivalent machine states.
- Explicit wrapping and address policy, bounded execution, and rejection of unsupported
  instructions, unresolved control flow, overlapping decoding or unsupported code writes.
- Compare architecturally defined FLAGS; document excluded undefined bits rather than
  manufacturing a result for MUL/DIV flags the CPU does not define.

The first slice needs no DOS or video services. Use a minimal resident Unicorn fixture;
the existing item-removal Machine.execute helper is an overlay entrypoint and initializes
unrelated callbacks. MSVC is installed under Visual Studio 2022 Professional despite not
being on the initial PATH. Rust and Python test dependencies require a reproducible setup.

## First verification gate

Luna compares original instructions under Unicorn, generated C invoked through the Rust
executable, and the independent Python RNG model. Cover full-width seed wrapping,
zero-bound advancement, word bounds, repeated calls, changed initial registers, safe
stack/data placements, return CS:IP/SP and written memory. Include wrong-source and
unsupported-instruction rejection. A deliberate arithmetic or scratch-constant mutation
must fail the differential gate before a final restored pass is recorded.

Passing this gate means the original RNG has been lifted and executed through Rust.
It does not establish a playable game, overlay compatibility or full RNG call ordering.

## Progression toward the game

| Milestone | Completion evidence |
| --- | --- |
| Original RNG through generated C and Rust | Verified initial fixture and configured DS/SS/SP placements; 428 regression calls plus configured-call checks |
| Pointer-bearing original routine | Verified original Pascal length/copy helpers, segmented aliases, memory effects and return frames; 123 pointer/configured calls |
| Preloaded overlay and original map queries | Verified WALL/DOOR/bounds, both real GEO maps and Rust numeric-face view; 4,180 original differential calls |
| Original compressed resources through C/Rust | Verified DAX/read/fill, both GEO maps, three graphics resources and bounded DOS-read callback; 20 positive and five fault-prefix differentials |
| Returned original map loader and shared queries | Verified original names, copies, context ID, release and real return; four loaders and 4,096 queries in the same guest, with two explicit resource services |
| Resident loader and one overlay | Complete load image, relocations, VROOMM call routing and reload identity |
| Original boot and demo | Necessary DOS/BIOS/EGA/input services and a reproducible original-route checkpoint |
| Exploration | Original map/event/input route with party and event-state comparisons |
| Combat | Complete original encounter with actors, effects, draw order and outcome evidence |
| Save and reload | Original-format save round trip and matching continued play |

For loader recovery, use the preserved complete load image deliberately; it has a different
contract from the initial isolated unpacked RNG image. Identify translated code by binary
hash, overlay identity, relative offset and loaded version. Physical address alone is not
enough when overlays reuse memory.

Astra's [original VROOMM and boot plan](cok-original-vroomm-c-rust-plan-2026-10-11.md)
includes a successful original 125-byte overlay-loading callback with 57 verified
fixups. It separates that callback, the boot wrapper, real manager and mutable
public-stub routing from the historical host bridge at the initial error trap.
This is original-execution evidence for the next implementation, not a shipped
Rust overlay loader or original boot route.
Its later original-manager proof also loads through CD 3F, repeats through
the patched EA stub, evicts, restores and reloads the module using original
manager decisions and IRET. The pressure arena and outer calls are fixtures;
this proves a concrete next translated route, not original boot heap setup.

## Starting sources

- [Hybrid reconstruction survey](hybrid-dos-recompilation-rust-and-goldbox-projects-2026-10-11.md).
- [Original CoK RNG evidence](cok-rng-native.md) and `tools/cok_rng.py`.
- `tools/exepack_unpack.py`, `tools/cok_item_removal_oracle.py` and the generated
  [decompiler input contract](decompiler-project-inputs.md).
- [Original-loader demo trace](cok-task198-original-demo-combat-boundary-2026-09-28.md).

pcrecomp's 16-bit lifter is a candidate for later scaling, but its simplified C-call/RET
semantics and commented unsupported instructions need adaptation. The initial bounded
emitter must fail visibly and preserve the explicit machine contract. No external project
has established Gold Box compatibility for this new runtime yet.
