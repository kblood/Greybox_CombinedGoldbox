# Whole character creation implementation: Astra bounded plan

2026-10-15. Source review only; no build, test or guest execution. Implements M1
of [the complete-game plan](cok-rea-full-game-plan-2026-10-15.md). Approved for Sol
after the foundation source/build lease is released. Preserve the accepted
CreateRace baseline; do not stop the implementation task at the next prompt.

## Concrete source findings

The REA character dossier reports A4:06DD..257B (7,839 bytes, 2,938 instruction
rows). I independently decoded each reported row against original GAME.OVR
with the existing Capstone installation and resolved far overlay stubs through
the unpacked resident descriptor tables. This yields **123 call sites and 32
unique direct targets**, not the dossier's 27 named callees. None of those call
rows is indirect. This does not prove that REA discovered every reachable row
or that the transitive helper closure is complete.

The following is the complete direct-target list for those 123 original call
rows. Addresses are original descriptor/resident coordinates, not relocated
Ghidra analysis addresses. Repeated sites are counted once per target here.

| Original call target | Resolved body | Role/evidence |
| --- | --- | --- |
| 0A46:023F | same | Existing resident helper, allocation family; 3 sites |
| 0A46:1661 | same | Existing resident helper; 2 sites |
| 0A46:1179 | same | Existing RNG helper; 2 sites |
| 0A46:0ADE | same | Existing string/data helper; 15 sites |
| 0A46:0AC4 | same | Existing string/data helper; 22 sites |
| 0A46:0B51 | same | Existing string/data helper; 10 sites |
| 0A46:0D79 | same | Call at A4:1CD1 |
| 0521:0353 | same | Call at A4:2426 |
| 0521:0739 | same | Call at A4:2481 |
| FD:003E | FD:17EE | Menu construction, already reached by Pick Race; 5 sites |
| FD:0025 | FD:000F | Menu item lookup; 5 sites |
| FD:0034 | FD:1368 | Shared selection/return path; 5 sites |
| FD:0043 | FD:18A1 | Cleanup after selection/cancel; 10 sites |
| FD:0039 | FD:177F | Calls at A4:244D/250D |
| DB:0057 | DB:1285 | Race/class helper; 9 sites |
| DB:004D | DB:1216 | Calls at A4:14CA/1675/21A7/21C0/21D5/2230/226C |
| F7:0034 | F7:0B9F | Call at A4:0EE7 |
| F7:002F | F7:08A6 | Call at A4:0F89 |
| F7:002A | F7:0722 | Call at A4:21E3 |
| F7:0043 | F7:0EAB | Call at A4:2355 |
| A8:0025 | A8:00A3 | Calls at A4:160F/245E |
| A8:002F | A8:0B50 | Call at A4:20D5 |
| A8:002A | A8:07BB | Call at A4:242B |
| A8:0034 | A8:0667 | Call at A4:2430 |
| E6:0052 | E6:11C7 | Call at A4:23F0 |
| 9E:0034 | 9E:0BED | Per-character persistence at A4:255D |
| A4:003C (near) | same | Cleanup, 7 sites |
| A4:4B3A (near) | same | Call at A4:22E8 |
| A4:4D9E (near) | same | Call at A4:230D |
| A4:3C61 (near) | same | Call at A4:249E |
| A4:408B (near) | same | Call at A4:24A2 |
| A4:5534 (near) | same | Call at A4:2545 |

Near calls in this Pascal code can be preceded by PUSH CS and end through far
returns. Preserve actual stack operations and return cleanup; do not translate
them into host C calls based on the instruction mnemonic alone. The root exits
via MOV SP,BP at2578, POP BP at257A and RETF at257B. The successful tail at
256B..2574 writes the pointer from BP-8/BP-6 into DS:6096/6098. Repeated cancel
paths call A4:003C and jump to2578. These are discriminating completion/cleanup
checkpoints, unlike a displayed race prompt.

REA local-helper body observations, useful initial traversal bounds but not
authoritative code/data classification: A4:003C..0129 (238 bytes),
3C61..3D40 (224), 408B..4788 (1,790), 4B3A..4CF5 (444),
4D9E..51C6 and51C9..5533 (1,940), 5534..567E (331). Do not fill the two-byte
gap in the 4D9E observation without decoding reachable original instructions.
The root and those six reported bodies sum to12,806 bytes before subtracting
already admitted bytes; external helper closure remains additional and unknown.

## Sol assignment and ownership

Implement complete creation by extending the existing generator/admission
mechanism with one creation-function closure, not a sequence of single-menu
admissions. Own a focused `prepare_creation.py`, focused `test_creation.py`,
the required `lift.py` and source-provenance/bootstrap changes, and a dedicated
Rust creation test module. Reuse the established preparer publication rules,
instruction decoder and source identity machinery. Do not create another build
supervisor, job controller, or generic evidence framework.

While the foundation GUI lease keeps accepted sources frozen, Sol may begin a
NEW `prepare_creation_closure.py` source-only traversal tool and its own ignored
inventory output. It must not change the accepted lifter, main, build files or
generated runtime. This is an approved implementation lane now; review its
closure before runtime admission, then integrate after lease release. Reuse its
traversal in the focused preparer rather than retain duplicate scanners.

First traverse root06DD and all32 direct targets against the original image.
Deduplicate accepted baseline tuples. Recursively follow each new helper's
direct branches/calls, decode original tables for computed targets, and produce
one closure inventory classifying edges as admitted, newly recovered, host
service, or unresolved. Report computed transfers and interrupts explicitly.
The direct-target table above is a starting worklist, not a transitive-closure
certificate. Expand source decoding where it discovers reachable rows omitted
by REA. Preserve historical CreateRace proof as ancestry rather than rewriting
it to describe a wider body.

Implement unsupported instruction semantics when this closure actually needs
them, including defined flags and atomic error behavior; retain existing
segmented-memory/overlay ownership and IRQ rules. The target is original game
code running, so table-driven class restrictions, attribute rolling, strings,
alignment decisions and character output must remain original computations.
No host-authored menu or synthesized accepted character.

Budget: **32 KiB maximum new unique instruction bytes** in this bounded task,
after subtracting all accepted baseline bytes. Root interval is7,839 bytes
including the already admitted423-byte prefix, but do not infer the exact new
root instruction count by linear byte subtraction. Constants/data and fixups
are separately recorded. If complete transitive closure exceeds32KiB, report
the measured worklist and split at whole-function/helper boundaries while
continuing the overall creation objective. A helper batch may be committed
with honest incomplete M1 status; it must not be called complete creation.

The parallel DOS backend owns only its new files until its review repairs and
standalone tests pass. Creation's A4:255D →9E:0BED means character persistence
is a real dependency. Recover this helper's actual DOS operation, buffer/count,
error and filename contracts before connecting the backend. Coordinator
serializes changes to `startup_platform.rs`/main integration. Main world-save
9E:22DE and world-load9E:1B34 remain M2; do not invent their format to unblock
character saving. If persistence blocks the final creation return, finish and
test the necessary original helper/host adapter in the same gameplay workstream.

## Luna acceptance and outputs

Run the applicable focused preparer/guest tests and optimized build after source
review. A full source/tuple ancestry check and exact original relocation binding
remain required, but do not rerun unrelated corpus families merely to increase
test counts. Any new `tools/` changes or campaign/capability JSON ledger changes
invoke the `CLAUDE.md` corpus requirement. The current `reference-source.json`
is Rust bootstrap provenance metadata rather than one of those product-status
ledgers; its focused bootstrap and runtime checks are the applicable contract
unless the change reaches a corpus-consumed artifact.

Hands-on original DOS observations use focusless GameLink only, with staged
read-only-source copies and the pinned mode-change fix where applicable. Test
generated C via the Rust application. Use real observed menus/checkpoints to
choose inputs, not speculative fixed Enter repetitions after unseen prompts.

Required distinguishing cases:

- Accept a nondefault race and prove the original write to character+5Ah after
  A4:0884. Then select gender and prove character+109h. Verify class-menu
  membership/count against the race-dependent DS:3A50 table with15-byte stride.
- Complete at least two materially different legal race/class paths, including
  a multiclass or restricted option when the original offers one. Check original
  attribute/alignment/class results and eventual character name/output.
- Cancel at race, a later selection, and the final acceptance stage. Compare
  stack/heap ownership and party/character pointers to original; repeated
  cancellation and repeated create must not leak allocations or retain stale
  candidate characters.
- Exercise reroll/backtracking and a rejected/disabled selection through the
  original rule path. Keep deterministic RNG/time checkpoints where possible;
  compare defined state rather than incidental animation timing.
- Reach successful root RETF257B through its normal caller after the actual
  character-save operation, with DS6096/6098 and character bytes corroborated.
  Verify created character visibility through the original party workflow.
  Follow required caller/helper continuation if merely returning exposes a
  new explicit boundary; record that boundary as unfinished M1 work.
- Compare the staged original character file with the reconstruction's output
  under matching inputs; test a failed write and cancellation without claiming
  success. Cold character reopen belongs here; full world-save round trip is M2.

Produce one closure inventory with exact new bytes/unresolved edges, source and
binary hashes, optimized build/test results, input consumption/state trace,
selected creation/completion screenshots, original-versus-lifted character
comparison, and a concise remaining-work statement. A root return through an
injected character pointer or a prompt screenshot does not meet acceptance.

## DOS backend review decision

The new memory-only backend has sound explicit namespaces and immutable asset
access, independent cursors, lowest-free handle reuse, zero-write truncation,
short-zero-write distinction, and byte/cursor atomicity on expected error paths.
Its tests discriminate those behaviors. It is unwired and proves no save ABI.

The initial review required one correction: absolute Function42 origin00
uses an **unsigned32-bit** offset. The present `seek(..., i32, Start)` interprets
it signed, incorrectly rejecting high-bit positions. Preserve raw bits for
Start (for example `displacement as u32 as i64`), while Current/End remain
signed. Replace the negative-Start rejection test with high-bit absolute
success tests; retain negative-relative rejection as the documented host policy.
Reference: [MS-DOS Encyclopedia, Function42](https://www.pcjs.org/documents/books/mspl13/msdos/encyclopedia/section5/).

Repair reviewed later on2026-10-15: `Start` now uses
`displacement as u32 as i64`, Current/End remain signed, and tests require
absoluteFFFFFFFF/80000000 success, signed80000000 relative return to zero,
and negative-relative failure without cursor change. Approved for Luna's
standalone test pass; no remaining blocking source finding in this scope.

The later guest adapter must not blindly return every host policy error as a
faithful original DOS result. Quota-full behavior, negative-relative policy,
virtual directories and path normalization are declared host choices. Verify
the actual guest service contract and preserve raw CX:DX/access bits at that
boundary. This is not a blocker for isolated backend acceptance after the
absolute-seek fix; it is an integration requirement. No tests were executed in
this review.

## First closure inventory result

Luna executed nine focused scanner tests after Astra required the scanner to
follow every direct callee, including entries already admitted by the baseline.
An admitted entry does not certify the whole function. Added controls expose
an unresolved computed jump and a new return tail behind admitted entries.
All nine tests passed.

The first original-byte inventory used the accepted production union manifest
SHA-256 `c07846ce53cc657429fe91b9a2b2f1e58d3d90c4ef4f7318271e10a362a33918`.
It contains 15,699 instruction rows (12,372 new, 3,327 accepted), 17,721 edges,
33 roots and 32,767 unique new instruction bytes. It is **incomplete**: the
32 KiB envelope would be exceeded at source [296,1533], with 62 pending sites.
No table contracts were supplied. This measured prefix is not runtime-admitted
and does not establish a complete function or subsystem.

Ignored inventory file:
`build/cok-recomp/staging/intro-compare/creation-closure-inventory-20261015-a`,
SHA-256 `ff887047169f054f5384b481df18d62fabb9c994963c32433628776a91cd91cc`.
Astra's next partition must use complete function/helper boundaries and keep
the remaining worklist explicit. The DOS runtime-adapter implementation runs
in parallel on separate source files.
