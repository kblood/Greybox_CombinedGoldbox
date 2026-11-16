# M2 paired original world save/load: bounded closure plan (2026-10-15)

Initial source-only plan, authored during the creation GUI lease: at that time no
application, test, build or preparer had run, and original inputs/runtime pins
were to remain read-only. The later isolated Luna controls and static preparer
execution are recorded below. They did not run a native build or application,
admit guest helpers, or complete M1/M2. Actual integration still requires the
appropriate source lease and a reviewed inventory.

## Baseline and measured delta

Use the actual journal build input, not the stale default `build/cok-recomp/generated/manifest.json`:

`build/cok-recomp/staging/intro-compare/journal-root-generation-controls-luna-20261015-a/checkout-one/generated/manifest.json`

SHA256 `eddcbf87a8134803917bbdda8ab90a47c9d1819c9715755e507848f562a154e0`; **32,845 admitted instructions / 84,012 instruction bytes**. The default generated directory currently has only 13,774 rows and must not be used as this task's baseline. Pin all original inputs and the baseline copy before analysis.

Read the existing REA `save-function.json` and `load-function.json` under `build/rea/rea-two-20261015-a/save-load/`. Independently decoded every reported instruction address against original GAME.OVR (descriptor9E body base 1D6DBh / decimal120539), then compared original bytes with admitted module47 tuples:

| Root | Local instruction rows | Local bytes | New local rows / unique physical bytes |
| --- | ---: | ---: | ---: |
| 9E:22DE save, through2816 | 534 | 1337 | 534 /1337 |
| 9E:1B34 load, through2107 | 563 | 1492 | 563 /1492 |
| Paired local bodies | 1097 | 2829 | 1097 /2829 |

**2,829 bytes is the measured local delta, not the transitive closure total.** Static direct-call operands give22 unique save targets and26 load targets. The REA named-callee counts are not authoritative. The exact additional helper/constant/fixup budget remains unmeasured; no total is guessed here.

## Isolated source inventory task contract — implementation exists

The isolated preparer and controls described below are already present in
`build/cok-recomp/world-persistence-sol-candidate-20261015-a/`. Luna's retained
2026-10-15 receipt records the 23 passing focused controls, default paired
inventory and cap-1 exhaustion control; see the receipt section below for the
measured results and unresolved edges. Treat the original task wording here as
the implementation contract, not a request to recreate or rerun the pinned
candidate. Its inventory remains static analysis only and keeps
`runtime_admission_authorized:false`; no native helper or gameplay acceptance
follows from those results.

Original implementation scope:
In `build/cok-recomp/world-persistence-sol-candidate-20261015-a/`, copy only needed sources and a baseline manifest; record source and destination SHA256 maps. Add an isolated `prepare_world_persistence.py` using the existing `Closure` engine and original descriptor resolver. Do not call `prepare_creation_closure.prepare()` unchanged: it hardcodes the historical18,728/47,047 CreateRace baseline. Accept the explicitly pinned current baseline and verify every tuple against original bytes, mapping module IDs via the manifest catalog and resident source offsets.

Root the **paired** traversal at9E:1B34 and22DE. Follow every direct callee even when its entry is already admitted; an admitted entry does not prove an entire body. Deduplicate physical resident/overlay instruction bytes, preserve mid-instruction rejection, alias identity and relocation intersections. Bound analysis at the existing **131,072 new unique bytes** maximum; stop with exact pending worklist when exhausted. Admission budget is **32,768 new unique instruction bytes per reviewed batch**. Partition only at whole helper/function boundaries if the paired closure exceeds that; no partial basic-block prefix admission. Keep paired save/load acceptance as the outcome even if helper admission needs batches.

First inventory output must include source/baseline hashes; old/new instruction tuples; unique physical counts; function entries/returns; direct and unresolved edges; table bytes/targets; all service sites/arguments where statically determined; constants and relocation-word intersections separately; rejected/missing extents and pending worklist. Mark `runtime_admission_authorized:false`. A complete source CFG is not service or gameplay acceptance. Do not generate over the actual runtime directory or update actual fixture/provenance pins.

Important whole-helper seeds beyond the roots, from previous independently decoded local bodies: 9E:0A80 (63 rows/157 bytes),11E5 (374/1034),1989 (98/311),2108 (64/207). These counts include possible already admitted bytes; subtract current baseline before budgeting. Also traverse9E:0555,0817,0BED and the original resident block/file helpers.

### Complete direct target worklist

Local addresses below mean descriptor9E. Far entries are original public stubs and must resolve through original procedure tables, not through a guessed runtime segment.

- Save local: 0555,0A80,0BED,2108. Far: 0521:0353/096C;069C:04C1;09C4:00DE;0A46:0AC4/0ADE/0B51/0BF4/0D79/131F/139B/13D2/144A/14BB/17E3;00E6:0052;00FD:002A/002F.
- Load local: 0555,0817,0A80,11E5,1989. Far:0105:0043;010B:003E/0043;011F:0034;0521:0353;0614:045C;069C:02A7/04C1/050B/05DA;0A46:023F/0AC4/0ADE/0B51/0BF4/0C75/0D79/144A/14B4;00FD:002A/002F.

No interrupt/computed transfer was observed in the two local root bodies. Their transitive graph is not yet established. Preserve existing guarded dispatch at0661:0355 and0A46:03B7/03C3/0601/07FB/088C with exact original bytes, live owner/generation, table/handle bounds and body hashes. Inventory any newly reached computed site as unresolved until an original table/state contract proves targets. Keep AH4C/INT23 nonreturning or unresolved; do not fabricate fallthrough. Existing AH06 returning CFG admission still does not implement its diagnostic service.

## Original persistence ABI and filenames

Use the existing `cok-character-persistence-adapter-plan-2026-10-15.md` block ABI: 0A46:14B4 selects AH3F,14BB selects AH40; shared14C0..1519 takes optional actual-record result pointer at BP+6/+8, record count+0A, buffer+0C/+0E, file record+10/+12. Multiply count by file-record+4 using the original16-bit semantics. Preserve CF error propagation to DS:43AC, actual byte→record division and short-transfer64h/65h handling. RETF0E cleans14 argument bytes. Zero requested records skip INT21; they are not DOS truncation.

Concrete original save evidence:9E:2439..2443 passes record size1 to0A46:13D2. Writes at256B/2584/259D/25B6/25CE/25E6/25FE request counts1,800h,800h,400h,5,1,1. The two word-count2 writes262E/2653 repeat for indices1..3;273E/2757 append counts1/148h. This is a **5,469-byte successful main-block write sequence when that size1 file record remains valid**. It is not a replacement save schema, nor proof every branch produces that file. Preserve original buffers at DS:5782, live pointers DS:4B28/4B2C/4B30, DS:6D85/4B4A/4B49, indexed6D86/6D88 and stack-local tail. Do not synthesize these allocations or reinterpret pointer bytes.

The retained `save-function.json` instructions confirm that all11 0A46:14BB writes pass a null actual-count pointer: each call pushes two zero words for BP+6/+8. Requested counts are 1 at 256B, 800h at 2584 and259D, 400h at25B6, 5 at25CE, 1 at25E6 and25FE; the loop at262E/2653 passes2 to each call for indices1..3; 273E passes1 and2757 passes148h. Thus the original helper, not the caller, records short-write status65h in DS:43AC on this path. No direct DS:43AC reference occurs in the retained 9E:22DE..2816 instruction listing; the caller has no post-write CF/ZF branch. Between the paired 262E/2653 calls, the only subsequent conditional at2658/265D compares the loop index with3; writes continue into the next call/cleanup without a caller-side error check. The earlier 069C:04C1 call is at238F and its AL is tested at2394; its retained helper path is AH4E FindFirst/existence lookup (`09C4:0112`, then `016A`), not the file-record open/create. Under the documented successful callback/frame conditions, `016A` can write zero to its own DS:8A58 target, and on the DOS-error arm it can store the entry AX there. The size-1 create is the separate 9E:2439..2443 call to0A46:13D2. Its shared prologue with 13C9 invokes INT21h at140F as AH=3Ch for this entry; the retained character-persistence ABI dossier specifies that carry stores AX in DS:43AC and success updates the file-record state, handle, and record size. After that call, the root reads DS:8A58 at2448 and passes its low byte to another helper before the conditional at245E. The chronology is established, and no caller-level store to 8A58 is shown between the earlier 04C1 call and this read. However, attributing the 2448 value to the earlier FindFirst result requires the same-DS and no-alias/unmodeled-callee-side-effect assumptions; it is not a proven invariant across the complete path. The caller has no direct DS:43AC reference or post-create CF/ZF branch, and its only post-write conditional at2658/265D compares the loop index. Static instructions do not establish the actual create result, subsequent DOS transfer outcomes, or the bytes ultimately published.

The retained REA instruction listing for the complete load body (image addresses 31B34..32107, original 9E:1B34..2107) now resolves the caller side. The call at 1CFD targets 069C:02A7; immediately after return, 1D02 stores AL at BP-01FA, and that local has no further instruction reference. The shared wrapper's record-size-1 setup is documented in `cok-cold-add-rea-reconciliation-2026-10-15.md`; the caller does not branch on its returned AL or CF before the block reads. At 1D46, 1D61, 1D7C, 1D97, 1DB1, 1DCB and 1DE5, the caller passes requested counts 1, 800h, 800h, 400h, 5, 1 and 1 respectively. It also passes the nonnull actual-count output at BP-01F8 at each site. The loop at 1E17/1E3E passes count2 to each read for indices1..3; 1E60 passes1 and 1E7B passes148h, also with BP-01F8 as output. These are static requested counts, not observed transferred counts.

The complete caller listing references BP-01F8 only through LEA instructions that pass it as the output pointer; there is no instruction that reads or compares a returned count. After 1E3E, the conditional at 1E43 compares only the loop index BP-01C9 with3. After the final read, it closes the file at1E86 and proceeds into field reconstruction. No instruction in the body references DS:43AC. There is consequently no caller-side short-count comparison, DS:43AC check, or read-error exit in this retained body, and no post-call conditional branch on the block helper's returned CF/ZF. The body does contain other JZ/JNZ/JBE/JNC branches for its menu, loop, and character-field logic; they do not consume flags immediately returned by these helper calls. This static negative finding does not establish what happens for a failing DOS operation or actual count values at runtime. The 14B4 ABI in `cok-character-persistence-adapter-plan-2026-10-15.md` establishes only that it stores `floor(actual DOS bytes / record size)` through a nonnull output pointer and, on DOS carry, stores AX at DS:43AC and writes zero to that output; 64h short-read status is only for the null-output path. Byte-exact paired-format and short-read acceptance therefore remain open pending an actual DOS callback trace. Reconstruction supported at 9E:11E5/1989 remains limited to pointer clearing, sidecar-list rebuilding and slot reassignment documented in `cok-cold-add-source-reconstruction-2026-10-15.md`; it does not authorize restoring raw world-save pointers unchanged.

### Source-only comparison with the current Rust host, 2026-10-16

The retained reconstruction dossier records these original guest effects:

- `9E:11E5` clears character pointer fields `+143/+145`, `+E3/+E5`, and
  `+183/+185` after reading the main record, then also zeros the party
  next-link pair `+17F/+181` at `9E:12FE–1305`. It opens the `.SFX` sidecar,
  reads 9-byte records, and builds the list at `+E3/+E5` using node links
  `+5/+7`; only a full 9-byte record is inserted. The separately identified
  `.STF` branch copies complete 63-byte records and builds links at `+2A/+2C`.
  Temporary buffers are released through the original helper.
- `9E:1989` starts `+137` at `FF`, installs the first member or appends via
  `+17F/+181`, updates current-character `DS:6096/6098`, selects the first
  unoccupied slot below eight, and increments party count at the referenced
  structure's `+67C`. The empty-head path leaves the incoming node's link
  untouched; the append path writes the old tail's link to the incoming node
  and leaves its link untouched. Retained caller dossier
  `build/rea/rea-add-files-20261015-a/add/add-function.json` shows the allocator
  result saved at `[BP-14]/[BP-12]`, that same pair passed to reader call
  `00A4:3892`, and reused at insertion call `00A4:3A0F`, with no intervening
  write to either local. The reader consumes the far pointer at `[BP+0A]` and
  insertion consumes it at `[BP+6/+8]`. Thus the zeroed `+17F/+181` pair acts
  as the terminal link for either path if execution reaches both calls. This
  establishes static pointer flow, not dynamic call execution or runtime
  acceptance.

There is no corresponding Rust-side field deserializer in the current source:
`startup_save_adapter.rs` imports raw files into `DosFiles`, and
`src/world_persistence_tests.rs` checks generated admission metadata and exact
instruction bytes/guards. The intended semantics therefore reside in the
original guest helpers when they are admitted and reached. The inspected Rust
source neither contradicts nor independently implements the guest field/list
semantics. Static source does not bind the paired M2 admission to the current
cold-Add executable or prove a paired-world path invokes these helpers, so
this is an admission/runtime evidence gap rather than a source-backed guest
behavior bug. Do not add a speculative host-side pointer or list repair.

Next discriminator: establish a current manifest/executable identity that
includes the exact original `9E:11E5/1989` helpers, then use a fresh-process
original load and a distinct second-character insertion to observe pointer
clearing, sidecar list ownership and termination, slot assignment, party
order/count, and current-character linkage. This comparison ran no REA,
script, hash, test, build, compiler, application, or DOSBox. DOS callback,
cold-reload, and M1–M7 acceptance remain open.

Original constants at9E:1AC0 include `savgam`, `.dat`, `Load Which Game: ` and `.sav`; save constants at21D7..22DD include `Save Which Game: `, choices `A B C D E F G H I J`, `savgam`, `.dat`, and `CHRDAT`. These literals do not alone prove path construction or iteration bounds. The separate [character persistence ABI plan](cok-character-persistence-adapter-plan-2026-10-15.md) supplies additional retained original-byte evidence for `9E:0BED`: it is a character-record writer; after `PUSH BP/MOV BP,SP`, `[BP+6]` is a far Pascal filename pointer and `[BP+0A]` a character far pointer, with `RETF8`; it chooses `.who` for an empty supplied name and `.sav` for a nonempty supplied name, appends under configured `DS:5784`, and writes the `199h` main character record plus `3Fh` STF and `9` SFX nodes through three write loops. The empty-name path and exact pointer meanings are also cross-checked by the A4:255D caller, which pushes the candidate character and an empty Pascal string. This corrects the earlier static trace's overly broad unresolved claims: `0BED`'s general ABI, filename branches, and sidecar writes are supported by the character-persistence source dossier.

At the time of this initial trace, the paired instruction inventory proved that
save root `9E:22DE` calls `9E:0BED` at `9E:27E1` (`push cs; call 0xbed`), but
the retained `m2-9e-0bed-static-trace` did not retain the complete pre-call
stack setup and caller data references. The save REA pseudocode rendered no
explicit arguments and was not sufficient ABI/caller-state proof. The later
retained caller-window and helper analysis below supersede that gap: they trace
the character pointer to the current party node and filename pointer to local
`SS:[BP-3FE]`, initialized through `AF24` from `CS:22D7`, and confirm traversal
through the `+17F/+181` party links. The staged pointer and callee-cleanup
sequence places that nonempty `CHRDAT`-prefixed name at `0BED`'s documented
`[BP+6]` filename argument and the current party pointer at `[BP+0A]`. The first
append raises the Pascal length from 6 to 7 before the call. Since the separate
`0BED` ABI dossier establishes `.sav` for nonempty names, `.sav` is the
supported static branch for this save path. This does not prove runtime DOS
paths, file creation, byte writes, or sidecar observations. The selected
nonzero byte is established as uppercase A–J by the retained validation bitset
below; the exact selected row remains unknown. The first ordinal character is
decoded as `"1"` in the retained analysis-only MZ artifact below, without
retail/runtime acceptance.
The retained helper tuples are not complete REA analyses. Do not infer a
concrete runtime filename or sidecar set from literals alone.

### Retained save-caller window at `9E:27E1` — static follow-up, 2026-10-16

Read-only inspection of the existing `save-function.json` assembly records (no
project parser/generator) materially resolves the pointer origins and loop.
Addresses below are descriptor `9E` offsets, converted from the dossier's
`0x30000 + IP` image coordinates:

- At `2767..2772`, the caller loads `DS:609A/609C` into local words
  `[BP-1CD]/[BP-1CB]` (dossier spellings `[BP+0xFE33]/[BP+0xFE35]`). At
  `2776` it zeros `[BP-1C9]` (`[BP+0xFE37]`). The loop tests the current
  far pointer at `277B..2785`, increments that ordinal at `2788`, and after
  the per-character calls obtains the next far pointer from current node
  `+17F/+181` at `27F0..2802` before returning to the loop test. Thus the
  `0BED` call is in a party-chain traversal, once per nonnull node on this
  static control path; the ordinal is separate local state and is not pushed
  as either `0BED` argument.
- At `27A8/27AC`, the caller pushes current pointer segment then offset
  (`[BP-1CB]`, `[BP-1CD]`). At `27B0..27B5` it pushes a second far pointer
  `SS:[BP-3FE]` (`[BP+0xFC02]`) and `CS:22D7` as two far pointers to
  `1000:AF24`. The bounded helper-byte decode below confirms that this copies
  the Pascal literal into the local buffer. Its `RETF4` intentionally leaves
  the destination pointer on the stack. The current party pointer remains
  below it for the eventual `0BED` call.
- The caller also passes `SS:[BP-2FE]` and the saved byte `[BP-1FA]` to
  `1000:B054` at `27C0..27CB`, then calls `AFB1` twice (once with the local
  pointer at `[BP-1CF]`). The byte decode below establishes that `B054` writes
  a length-one Pascal string containing the saved selection byte to its local
  buffer. The first `AFB1` call uses that buffer as source and `[BP-3FE]` as
  destination; it sets the destination length to 7 before the second append.
  For the first party entry, the second append adds ASCII `1`, making the
  logical Pascal payload `CHRDAT[A–J]1` (the exact menu letter remains dynamic).
  The name therefore remains nonempty when passed to `0BED`. The selected
  nonzero byte is later mapped to uppercase A–J by the retained bitset check;
  the particular row remains data-dependent. The first ordinal byte is
  supported by the bounded formatter-table decode below, subject to that
  analysis artifact's provenance limitation.
  The retained inventory has a 263-byte half-open span `CS:21D7..22DE`
  (source record `[158,8663]`). Relative offset `0x100` is therefore
  `CS:22D7`, where the recorded byte is `06` and the following six bytes are
  ASCII `CHRDAT`. The byte-level `AF24` decode below confirms that it copies
  the length and payload into the local buffer.
- The caller validates `[BP-1FA]` before entering the save loop. At `2322`
  it obtains the candidate byte, stores it at `2327`, then passes that word
  and `CS:21FD` to `1000:B1D9` at `2335`. The retained 13-instruction body
  maps to source `0A46:0D79` (linear `0x1B1D9`): it loads the bitset pointer
  and candidate, computes `candidate >> 3` plus `1 << (candidate & 7)`,
  tests the corresponding bit, and returns. The following branch rejects a
  clear bit, while a separate zero check exits before saving. In the retained
  literal span, `CS:21FD` is offset `0x26`. The complete 32-byte bitset
  window (`CS:21FD..221D`) is `01 00 00 00 00 00 00 00 FE 07` followed by
  22 zero bytes; since the validator's 8-bit index ranges over exactly 32
  bitmap bytes, it admits zero plus uppercase ASCII A–J and no other value.
  Therefore the nonzero selection reaching this save path is A–J and
  `B054` appends that same byte. The caller reaches the input routine through
  raw far pointer `00FD:002A` (`[253,42]`), which the retained world inventory
  maps to relocated root `[253,994]` with 779 instruction tuples through
  `[253,3192]`. Its caller stages 11 words, matching the routine's
  `RETF 0x16`; it receives the result in `AL`, which the caller stores and
  validates. The body clears its output byte, then reads event bytes through
  raw target `0x614:0x25B` at helper offsets `[253,1464]` and `[253,1478]`
  (retained root `[1556,603]`, 129 tuples). It checks the resulting byte for
  `K`, `M`, ESC, and Enter; a related status call at `[253,1452]` targets
  `0x614:0x3C2` / `[1556,962]` (65 tuples). One return path transforms `0x5C`
  to ASCII `7`, then indexes `[DI+0x2010]` with `DI = input_byte - '1'`; the
  resulting byte becomes the selection returned in `AL`. No retained constant
  covers the `DS:2010` table; part of the event helper's dependency graph is
  traced below, but its low-level interrupt edges remain unresolved. Therefore
  the exact key-to-letter mapping and lowercase normalization
  remain unknown. The separate save/load REA dossier retains only the input
  callee boundary metadata (`FUN_10fd_002a`, linear `0x10FFA`); helper bodies
  and tuples come from the incomplete static world inventory and are not
  runtime evidence.
  The `[DI+0x2010]` operand is DS-relative. The retained Ghidra load-image
  record fixes its analysis image at segment `0x1000` and linear-byte
  coordinates, but the save caller's entry context leaves DS blank; the
  segment-binding warning explicitly says linear addresses do not identify a
  unique segment:offset alias. Do not infer `DS=0x1000` from that load setting.
  The retained MZ provenance gives entry `CS:IP=2000:22DE` and `SS:SP=1491:4000`;
  the load-image record maps it to linear `0x322DE`, exactly the `cok_save`
  root, whose caller and incoming-reference lists are empty. No parent/startup
  instructions before this entry are retained. `cok_save` does not load DS
  before `9E:2322`, and retained `AF24` saves/restores DS while temporarily
  using the source pointer. Thus the missing value is DS at DOS transfer to
  `2000:22DE` (or a retained pre-entry setup), not an address solvable from
  this caller listing.
  The inventory has only two constant spans, both unrelated to this table, and
  no mapped data extent at `DS:2010`; its bytes cannot be located in the MZ from
  current evidence. The event helper's input path has retained bodies, but its
  transitive chain still includes unresolved interrupt sites `[2402,774]`,
  `[2402,797]`, and `[2630,5766]`. Resolving this mapping requires proof of DS
  at the call, a mapped table range, and the low-level interrupt contract; no
  key normalization or UI behavior is accepted from the static inventory.
- The selection byte `[BP-1FA]` is set at `2327` from `AL` returned by the
  input helper at `2322`. The caller then passes it with the bitset at
  `CS:21FD` to `1000:B1D9`; the retained validator checks the bit selected by
  the byte value, and the following branch rejects a clear bit. The bitset
  bytes `01 00 00 00 00 00 00 00 FE 07` allow zero and uppercase ASCII A–J;
  the caller separately exits on zero. Therefore every nonzero value that
  proceeds to save is A–J, and `B054` later places that same byte into the
  `CHRDAT` filename component. The input helper's key normalization and which
  letter the player chose remain unknown. The party-list ordinal `[BP-1C9]`
  instead indexes `0x29`-byte local slots at `26F5..270C`; it is not passed as
  a separate `0BED` argument.

This resolves the caller's character argument as the current node reached
from `DS:609A/609C`, plus list iteration/termination by the `+17F/+181` chain.
It narrows the name argument to local `SS:[BP-3FE]`, which the retained
helper-byte decode shows is initialized from `CS:22D7` as `06 43 48 52 44 41
54` (`CHRDAT`) and then receives a length-one selection string through
`AFB1`. The `0BED` caller therefore supplies a nonempty logical name on this
path. The exact staged-pointer cleanup leaves this name at `0BED`'s documented
`[BP+6]` filename argument and the current character at `[BP+0A]`. Combined
with the separate `0BED` ABI dossier's empty/nonempty extension predicate,
this supports `.sav` statically for this path. The first party entry's ordinal
character is `1` in the retained analysis artifact documented below; the
particular A–J choice remains dynamic. Later ordinal characters, per-slot DOS
paths, and the observed sidecar set remain open. Runtime DOS
callback/path observation is still required to prove concrete files and bytes.

### Retained resident-helper boundaries — static follow-up, 2026-10-16

The retained save/load REA dossiers use load segment `0x1000` and linear
byte-offset coordinates. Their caller references and Ghidra callee metadata
map the calls to:

| Far target | Linear address | Ghidra label | Reported body range | Bytes |
| --- | ---: | --- | --- | ---: |
| `1000:AF24` | `0x1AF24` | `FUN_1a46_0ac4` | `0x1AF24..0x1AF3D` | 26 |
| `1000:B054` | `0x1B054` | `FUN_1a46_0bf4` | `0x1B054..0x1B065` | 18 |
| `1000:AFB1` | `0x1AFB1` | `FUN_1a46_0b51` | `0x1AFB1..0x1AFDC` | 44 |

The caller dossiers retain the save/load root pseudocode and instruction
listings, including these far calls, but only function-boundary/name/
classification metadata and references for the three callees. They do not
retain the callees' instruction listings or pseudocode, so this narrows the
exact REA targets without establishing copy, display, conversion, or filename
semantics. When the execution hold is resolved, request complete function
analyses for these linear addresses before changing host behavior.

### Bounded helper-byte decode from the retained analysis image — 2026-10-16

The existing `save-load-input.exe` is explicitly marked in
`save-load-input.provenance.json` as an analysis-only reconstructed MZ, not an
execution fixture. Its recorded MZ header is 4,128 bytes (`0x1020`); reading
the existing bytes at header-plus-linear-offset gave 26 bytes at file offset
`0xBF44` (`0x1AF24`), 18 at `0xC074` (`0x1B054`), and 44 at `0xBFD1`
(`0x1AFB1`), matching the retained Ghidra boundary lengths. No fresh file
identity hash was run, so this remains a bounded static observation rather
than source-closure/provenance acceptance.

- `AF24` saves `DS`, loads destination `SS:[BX+8]` and source `SS:[BX+4]`,
  copies the Pascal length byte with `LODSB`/`STOSB`, copies that many payload
  bytes with `REP MOVSB`, restores `DS`, and returns with `RETF4`. At the save
  call site the far pointers are destination `SS:[BP-3FE]` and source
  `CS:22D7`; the source bytes are `06 43 48 52 44 41 54`. Thus, on normal
  return, the local name begins as Pascal `CHRDAT`.
- `B054` loads destination `SS:[BX+6]`, stores length byte `1`, stores the low
  byte of the value at `SS:[BX+4]`, and returns with `RETF2`. The caller passes
  the validated nonzero selection byte `[BP-1FA]`, so the buffer at
  `[BP-2FE]` becomes a one-character Pascal string with a byte in uppercase
  A–J. The exact chosen letter remains dynamic.
- `AFB1` reads its source far pointer at `SS:[BX+4]` and destination at
  `SS:[BX+8]`, captures the old destination length, adds the source length to
  the destination length (saturating at `FF`), and advances to the old
  destination end. **Its `REP MOVSB` count is `255 - old_destination_length`,
  not the source length.** It therefore reads and copies every remaining
  destination-capacity byte from the source address, including bytes beyond
that Pascal string's logical payload. The first caller invocation takes
  `[BP-2FE]` as source and `[BP-3FE]` as destination: the logical length becomes
  7, while the raw copy count is 249 bytes. It then invokes the same helper
  with `[BP-1CF]`; that source's backing bytes and the resulting tail contents
  remain unresolved. This unusual over-read/copy must be preserved or
  explicitly bounded only after complete REA and buffer-layout review.

The caller window plus these helper bytes proves that a nonempty
`CHRDAT`-prefixed Pascal buffer reaches the `0BED` `[BP+6]` filename argument.
The separate `0BED` ABI dossier says an empty supplied name selects `.who` and
a nonempty supplied name selects `.sav`; the combined static evidence therefore
supports `.sav` for this save path. This is not runtime proof of a path, file
creation, transferred bytes, or sidecars. The accepted selection set is known,
but the particular choice and concrete DOS path remain unresolved pending
key-table/event-path analysis and callback observations. The selected A–J byte is
established by the `9E:2322` validation path described above.

The helper return immediates also leave staged destination far pointers on the
caller stack: `AF24` uses `RETF4` to discard the source pointer, `B054` uses
`RETF2` to discard its selection word, and `AFB1` uses `RETF4` to discard its
source pointer. The next helper consumes the staged pointers as described
above; do not model these as ordinary caller-cleaned arguments.

The complete save-root listing begins with `SUB SP,0x3FE`, allocating a
`0x3FE`-byte frame. Its call to `1000:B77F` maps to source `0A46:131F`
(`0x1A46:131F`, linear `0x1B77F`). The retained inventory contains 39
instructions for that body through `RETF0C`. It converts the supplied `DX:AX`
through `0A46:120D` into a 32-byte local scratch string, clamps output length
between the supplied minimum and maximum, writes a Pascal length byte, then
copies that many characters to the destination. The caller passes maximum 1,
minimum 0, destination `SS:[BP-1CF]`, and `DX:AX=0:ordinal`, where the ordinal
was incremented immediately before the call. It therefore writes at most one
character from the formatter and does not clear the remainder of the
destination. `0A46:120D` also has 37 retained instructions, but its indexed
threshold data at `CS:125F` is absent from `world-inventory.json`. A bounded
read of the corresponding table in the retained analysis-only reconstructed MZ
`build/rea/rea-two-20261015-a/save-load-input.exe` at file offset `0xC6DF`
returns ten little-endian dwords: `1000000000, 100000000, 10000000, 1000000,
100000, 10000, 1000, 100, 10, 1`. The offset follows the retained MZ layout
(`0x1020`-byte header plus module offset `0xA46*16+0x125F`). The 37 retained
formatter instructions compare/subtract these thresholds and emit decimal
digits. For the first caller ordinal (`1`), this table and body produce ASCII
`'1'`; B77F's max-width-1 copy therefore writes a one-character Pascal string
`"1"` at `SS:[BP-1CF]`. This establishes the byte for this retained analysis
artifact, not for retail/runtime execution: the artifact's source provenance
and byte identity were not re-verified in this bounded read. The untouched
destination tail remains uninitialized by B77F.

For the first party entry, the later `AFB1` reads a one-character source
`"1"` and copies 248 bytes to the destination's remaining capacity (whose
logical length is already 7), raising its Pascal length to 8. Together with
the dynamic A–J selection, the logical first-party name is `CHRDAT[A–J]1`,
which selects the documented nonempty-name `.sav` branch. Bytes after the
logical character at `BP-1CF` are not initialized by `B77F` and may reflect
prior stack contents; `AFB1` still copies that tail. This overread/copy
behavior is retained pending complete REA/frame review, not accepted as safe
or deterministic host behavior. The helper bodies remain marked for
whole-helper review; retained tuples and the analysis-only MZ do not establish
retail equivalence or runtime file creation.

This byte-level decode is not the required complete REA control-flow analysis
and does not establish actual DOS file requests, path composition, transfer
results, or saved bytes. No game, project script, REA provider, test, build,
compiler, or DOSBox was run for it. Preserve the original input and analysis
artifact unchanged.

## Host scope

Latest durable acceptance proves optional --save-dir import/lock, transactional individual host mutations and cold raw-byte continuity (13 focused tests;162 full at that milestone), **not world persistence**. Current transport already handles the creation-required open/create/read/write/seek/close/delete/mkdir/free-space/exact-FindFirst paths. No new DOS service is proven necessary by the two world root bodies alone. Inventory concrete requests in newly traversed helpers before adding anything. Wildcards/FindNext, timestamps, rename, AH06, process exit and new devices remain unsupported unless this closure demonstrates their actual contract.

Per-file publication atomicity does not imply a multi-file world-save transaction. Keep the original sequence/error behavior and document mixed prior/new files after an interrupted or failed save if that is what the original does. Do not claim whole-save rollback from the host adapter's single-operation tests.

## Discriminating acceptance after source review and lease release

### Retained Luna static execution receipt (2026-10-15)

The existing receipt and logs in
`build/cok-recomp/world-persistence-sol-candidate-20261015-a/luna-controls-20261015-a/`
record prior static execution; they replace the earlier “controls unexecuted”
status. The final focused command exited 0 with **23 tests passed**. The first
attempt under the default `python` failed because Capstone was unavailable;
Capstone 5.0.7 was installed into the ignored run folder for environment
discovery, then the successful controls and inventory commands used the
repository's existing `build/cok-recomp-tools/venv`.

The default inventory command exited 0 and recorded **2,079 new instruction
tuples / 5,472 new unique bytes**, below the 32,768-byte batch budget. Both
root-specific rosters matched (load 26/26; save 22/22). Analysis did not hit
its 131,072-byte limit, its pending worklist is empty, and it reports no
rejected/missing extents. It nevertheless reports `complete=false`: the 31
unresolved sites are 25 host-service interrupt boundaries and six computed
transfer/table boundaries (`0661:0355`, `0A46:03B7`, `0A46:03C3`,
`0A46:0601`, `0A46:07FB`, `0A46:088C`). No supplied table contracts resolve
those computed edges. These are unaccepted service/target contracts, not
evidence of missing input bytes or observed DOS errors. The default inventory
retains exact sites, conservative service-argument evidence, calls/returns,
and unresolved edges. It does not admit the discovered bytes:
`runtime_admission_authorized=false` remains in the output.

The cap-1 command also exited 0 and records the intended exhaustion control:
one tuple/one byte, `analysis_exhausted=true`, `complete=false`, with pending
`9E:1B35` and `9E:22DE`. Its 0/26 and 0/22 roster matches and 48 reported
omissions belong only to that intentionally truncated control, not the default
inventory. Receipt before/after records show the original input hash lists
unchanged and candidate source/pin hashes unchanged; copied dependencies are
also pinned in the after list. Do not recompute or rewrite these pins as part
of the documentation update.

This receipt establishes that source controls and bounded static inventory
were executed. It is not a native DOS-helper test, native build, application
run, or gameplay save/load acceptance. Filename/character iteration,
reconstruction fixups, actual transfer results, DOS callback/error paths, and
fresh-process world continuity remain open.

1. The isolated preparer controls above are complete as recorded by the
   retained receipt. After lease release, native tests must exercise the
   original helpers, not just direct Rust file APIs.
2. Starting from an actual created/loaded playable party and original world state, use an observed Save menu slot. Verify original9E:22DE entry/return, all filenames and byte counts, DOS/error state, full file hashes and current endpoint/catalog. No injected world pointers or host-built save files count as the successful route.
3. Close the process, start a fresh process using the same explicit durable directory, choose original Load and run9E:1B34 through real reconstruction. Verify location/direction, flags, party order, stats, inventory/equipment, spells and list ownership using original field evidence. Perform one subsequent state-changing original action, save again and cold reload. Exclude allocator addresses/timing from semantic equality while validating their owners separately.
4. With a staged original DOS oracle, compare exact file sets/bytes where deterministic inputs permit, and cross-read reconstructed output with original and original output with reconstruction. Keep the original-black diagnostic gap explicit until the oracle reaches the relevant menus.
5. Cover cancellation/no writes, different slots, existing slot overwrite, missing/truncated main and character/sidecar files, missing/denied directory, quota/short read/write, and failed host publication. Check DS:43AC/8A58 and actual error UI/return paths. Failed paths must not masquerade as successfully loaded/saved worlds; do not impose atomic load rollback without evidence of the original behavior.
6. Preserve source/heap/stack/overlay guards and original assets across success, failure and cold restart. Final receipt separates closure admission, native helper controls, game roundtrip and original comparison. M2 remains open until gameplay continuity is demonstrated; full campaign completion remains M7.
