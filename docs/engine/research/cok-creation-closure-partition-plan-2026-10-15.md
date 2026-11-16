# Creation closure partition after the first actual inventory

2026-10-15, Astra source/evidence review. No application execution or tests.
Inventory: `build/cok-recomp/staging/intro-compare/creation-closure-inventory-20261015-a`,
SHA256 `ff887047169f054f5384b481df18d62fabb9c994963c32433628776a91cd91cc`.

The measured inventory is incomplete: 32,767 new unique bytes, with the next
instruction at0128:05FD requiring32,769, and62 pending entries. Numeric worklist
ordering reaches lower descriptor bodies first. None of the seeded0521/0A46
resident roots has yet been visited. Zero reported interrupts therefore says
nothing about the service requirements of the whole closure.

## Complete local function bodies already measured

Following each root's non-call CFG edges through the actual inventory finds no
missing local successor for the following bodies. Calls are dependencies, not
evidence that their transitive bodies are complete.

| Root | Decoded rows | New instruction bytes |
| --- | ---: | ---: |
| A4:06DD | 2938 | 7416 |
| A4:003C | 76 | 238 |
| A4:3C61 | 64 | 224 |
| A4:408B | 708 | 1790 |
| A4:4B3A | 168 | 444 |
| A4:4D9E | 718 | 1940 |
| A4:5534 | 101 | 331 |

These seven bodies total12,383 new bytes. The creation root reaches its original
RETF257B and has32 direct callees. This is a whole-function basis for admission,
not another next-menu slice. Additional reached A4 helpers bring all currently
visited A4 instructions to13,238 new bytes. Other fully visited local direct
bodies include DB:1216/1285 (75/183 bytes), F7:0722/08A6/0B9F/0EAB
(388/761/596/80), FD:177F (111), the four A8 direct roots, and9E:0BED (1476).
F7:0722,08A6,0EAB andA4:3C61 have no outgoing calls in their local CFGs.

Dependency examples that prevent a transitive-completeness claim:

- A4:003C -> resident0A46:0254; DB:1285 ->0A46:023F;
  DB:1216 ->0A46:1179.
- A4:4B3A ->A4:4789 andDB:1216.
- A4:4D9E ->A8:34EC/36CC, E6:11C7/1827/199D/371E,
  F7:0433, FD:177F,0128:07E6,0521:0353/0AF1 and resident string helpers.
- A4:408B ->9E:0817,A4:3D41/3E20,FD:03E2/0C7B/177F,
  0116:00F2/00F7,011F:0156,0128:0000 and resident helpers.
- Creation's normal persistence call remains9E:0BED; its host adapter is a
  parallel dependency, not permission to substitute a synthetic successful return.

## Approved immediate Sol change and Luna inventory pass

Separate the analysis traversal limit from the32KiB runtime admission budget.
Add an explicit bounded analysis limit (maximum128KiB new unique original bytes),
use an explicit128KiB analysis pass, record both limits unambiguously, and retain incomplete
status plus pending work on exhaustion. Do not change BUDGET's meaning silently or
let a larger inventory authorize a larger runtime admission. One actual128KiB
scan is approved after focused source review/tests. Unknown computed transfers
and interrupts must remain explicit; do not provide guessed table contracts.
Avoid copying the entire accumulated byte set per instruction when extending
the limit: count newly added IDs and update only after passing the limit.

Coordinator implementation direction: use128KiB as the analysis default and
maximum, with an explicit smaller analysis option for focused controls. The
runtime admission ceiling remains32KiB; `complete` and admission-budget fit
must be separate fields. This avoids silently reusing the exhausted32KiB
analysis default when producing the approved larger inventory.

Luna reruns the focused traversal controls, adds a discriminator for separate
analysis/admission limits, and runs one fresh actual inventory against the same
accepted baseline/hash. No full corpus, GUI, DOSBox or generic new supervisor is
needed for this analysis-only step. Stop on an unexpected decoder/overlap error
and route it to source review rather than weakening original-byte validation.

## Next runtime admission: whole creation bodies and helper batches

Sol may prepare the focused creation preparer now, reusing the existing traversal.
The first candidate is the entireA4:06DD body and the six measured local helpers,
then their local A4 dependencies and required DB/F7/FD helpers. All currently
visited instructions in A4+DB+F7+FD total17,284 new bytes; this is a candidate
envelope, not a final frozen tuple count or assertion every module byte is code.

After the larger inventory, compute each function's local CFG ownership, retain
shared/tail blocks only once, and group dependencies at whole-function boundaries.
Choose dependency helpers first where they resolve service/table boundaries,
then admit the complete creation function. Any batch must remain <=32KiB new
unique original bytes relative to its accepted baseline. Record its exact source
tuples, fixups, inbound entries, and every outbound dependency still deferred.
Never admit the lexicographic prefix of the old budget-limited scan as a batch.

Unadmitted external helpers must produce explicit owner/entry boundaries. Do not
turn their calls into no-ops, classify entry membership as function closure, or
call a helper-only batch complete creation. Review computed edges before admitting
their containing function; original table bounds and dispatch behavior need proof.
Continue subsequent whole-helper batches until the complete creation path and its
cancellation/persistence dependencies run. The full acceptance cases remain those
in `cok-whole-creation-astra-plan-2026-10-15.md`.

Creation Sol owns the preparer/traversal, lift generator, provenance and dedicated
creation tests. Runtime-adapter Sol owns startup_platform and its configuration
integration. Coordinator serializes any main module declarations and shared builds.
No simultaneous writes to accepted generated runtime or production manifests.

## Actual128KiB inventory: helper-first admission decision

Reviewed later on2026-10-15:
`build/cok-recomp/staging/intro-compare/creation-closure-inventory-128k-20261015-a.json`,
SHA256 `ca484b8537a3be37669da795ea9cfbd591c52f18709f6e8e46aec703c0eb925c`.
The analysis limit did not exhaust. Measured new bytes36,934, rows24,619,
new rows14,102, accepted rows10,517. Six computed calls and17 interrupts remain
unresolved in the scanner. This is not yet a full byte count: interrupts currently
terminate traversal, hiding their normal return continuations.

All six computed sites are already admitted baseline instructions:

| Site | Original instruction / existing runtime contract |
| --- | --- |
| 0661:0355 | FF1E764A, far call throughDS:4A76; preceding AH=2. `driver_call_context` in `csrc/driver_admission.c` and `irq_runtime_driver_target` in `csrc/irq_runtime.c` require caller/DS/AH, offset0 and live admitted driver allocation/generation. |
| 0A46:03B7 and03C3 | FF1E9A43, far call throughDS:439A. `lifted_indirect_target_admitted` in `lift.py` gates resident0038:0025 and validates live descriptor/body/stubs. |
| 0A46:0601 | 26FF19, file-record dispatch throughES:[BX+DI], admitted slots10/14/18/1C. |
| 0A46:07FB and088C | 26FF5D14 /26FF5D18, file-record slots14/18. |

The file-record guards validate magicD7B0..D7B3, bounds, exact target and source
bytes. These are dynamic, state-guarded contracts, not static jump tables. Keep
the existing runtime guards unchanged and record them as external admitted
dispatch contracts. Do not fabricate a table file or widen targets to clear the
scanner's unresolved list. Baseline instruction admission does not by itself
prove every service request/target that creation will produce is supported.

Three interrupt sites are newly recovered instructions:9C4:00E6 AH36 free space,
0A46:15E4 AH41 delete, and0A46:17DA the shared directory-call path (creation
uses AH39). Direct original-byte decoding confirms ordinary continuation and
return:00E8..00F4 computes free bytes andRETF2;15E6..15EE restoresDS, writes
43AC on carry andRETF4;17DC..17E2 restoresDS, writes43AC on carry andRET.
All other currently reported interrupt instructions are already baseline-admitted,
but their service data/host coverage still requires the adapter test pass.

Approve Sol to add explicitly reviewed normal-return continuation sites to the
source traversal, retaining an unresolved host-contract marker at every interrupt.
This is conservative source reachability, not host-service authorization. The17
currently established returning sites are:
0661:0333,07E8:130F;0962:0152/0306/031D;
09C4:00A7/00E6/0135;
0A46:0164/140F/145F/14E2/1541/15AB/15E4/1686/17DA.
Bind site bytesCD21 orCD16 to pinned original sources. Newly discovered interrupts
remain explicit review items; do not blindly follow a DOS termination operation
as though it returned. For existing computed calls, record the guarded contract
without making them static table targets. Calls already retain their fallthrough.

### Frozen measured partition and immediate implementation scope

Choose **helpers first, then the whole creation root**, reversing the earlier
candidate ordering. Compute the root set by traversing non-call edges fromA4:06DD
in this pinned inventory. It has2938 rows; remove that set from the helper batch.
Shared helper bytes remain deduplicated physically. Relative to the accepted
CreateRace baseline, the measured partition is:

| Batch | New rows | New bytes | Tuple identity |
| --- | ---: | ---: | --- |
| All discovered helper bodies, excluding root local CFG | 11328 | 29518 | cdc44b4d04d90558b9ab5c785a75e2b14d35e5a429c1cd584b04346ac7c3cafe |
| EntireA4:06DD root local CFG | 2774 | 7416 | bac41c2b7a0f840526f2c43c18997dbd0e44cee5cd4eeb2b911974ab7ab1c6d8 |

Identity encoding: SHA256 of UTF-8 `json.dumps(rows,separators=(',',':'))`, where
rows are sorted by original `(CS,IP)` and each row is `[[CS,IP],hexbytes]`, excluding
baseline-admitted instructions. These are exact measured scopes, not permission
to freeze incomplete service tails. The first batch has3250 bytes of headroom.
Add the reviewed interrupt continuations and any discovered helper dependencies,
then regenerate its final tuple/fixup identity. If these exceed32KiB, split at
whole helper boundaries and continue; never trim an instruction prefix to fit.

Sol may implement `prepare_creation.py`/the focused lift phase now using this
helper partition, while the returning-service inventory refinement runs through
Luna. Preserve baseline tuples and historical stop provenance. Record every
selected helper entry, source extent, relocation intersection, return, and outbound
deferred dependency. No opcode, callback or service may become a success no-op.
The full root remains unadmitted until the helper batch is accepted; then admit
all of its new7416 bytes in one follow-on phase, with its normal RETF257B,
cancellation exits and character-persistence dependency intact.

Tests must distinguish helper return/stack cleanup, original source and relocation
binding, shared-byte dedup, changed/midpoint/omitted tuples, and explicit deferred
outbound boundaries. Exercise new AH36/41/39 paths through the actual guest helpers
once the adapter is integrated. Existing computed guards require negative-target
and stale-owner controls, not new unguarded dispatch. Finish the original whole
creation runtime acceptance after both batches; neither this inventory nor the
helper batch establishes gameplay completion.

## Refined interrupt closure and full-entry helper controls

The refined inventory
`creation-closure-inventory-returning-20261015-a.json` hasSHA256
`d941c409754d9f3148372f7d8bcbc8895b084b1ee60307a5cae67cfd42dec13c`.
It adds31 new bytes: the provisional helper batch is29,549 bytes/11,343 new
instructions. Its seven additional interrupt sites are all baseline-admitted.
Read-only original decoding establishes these further normal-return contracts:

- 0962:0158 CD16 AH0: keyboard read;015A jumps back to0150, already traversed.
- 0962:060F CD10: video wrapper;0611..0615 restoresES/BP/DI/SI andRET.
- 09C4:0141 CD21 AH4E: FindFirst;0143..014D restoresDS, calls016A, thenRETF0A.
  The entire016A..018C local helper contains no interrupt: it converts the DTA
  filename and writes the original error/result slotDS:8A58.
- 0A46:01EB CD21 AH06: diagnostic character output;01ED isRET.
- 0A46:15B9 CD21 AX4202: seek-end probe. Its continuation reaches another
  returning site, **0A46:15C7 CD21 AX4200**, restoring the previous cursor;
  15C9..15CB popsCX/BX andRET. Add both together, avoiding another discovery cycle.

0A46:01A3 CD21 AH4C is process termination: record a terminal service boundary,
with no fallthrough. 0962:0169 CD23 is the exceptional Control-Break vector path
after displaying`^C`; its handler/returnability is not established here. Record
an explicit unresolved exceptional-vector boundary and do not follow fallthrough
or assert successful host handling. Neither is a static jump-table contract.

The existing startup host routes INT16/INT10, AH4E and supported AH42 modes.
AH06, AH4C and INT23 have no corresponding handler in the inspected dispatch;
keep those limitations explicit. Baseline admission of their instruction bytes
is not service implementation. The helper preparer may distinguish reviewed
returning, reviewed terminating, and unresolved exceptional boundaries instead
of rejecting every boundary as an unknown byte. None authorizes a success no-op.

For a meaningful full-entry F7:0722 test, provide a valid far character pointer
atBP+6 after the original prologue and the normal far return frame; run from0722
throughRETF4 at08A3, rather than injecting execution at its epilogue08A0.
Original decoding gives these bounded source-valid field cases:

- Character+F9=0: early return; record bytes unchanged.
- +F9=1,+5D=4,+15=12: output+11C=1 and+11D..120=0.
- +F9=1,+5D=5,+15=14: output+11C=4 and+11D..120=0
  (base2 followed by the two strict>12/>13 bonuses).
- +F9=2,+15=12: original DS table at3C8E +group*63h +level*5 +column,
  column1..5, contributes[1,0,0,0,0] forgroup0(+5D<=4), and[0,1,0,0,0]
  forgroup1(+5D>4). Expected outputs+11C..120 are[2,0,0,0,0] and[2,1,0,0,0].

These are helper field contracts, not claims that arbitrary complete character
records constitute legal gameplay selections. Seed table bytes from the pinned
original resident DS image. Require record canaries, BP/SP/far-return cleanup,
both group branches and a higher-level table contribution. Allow writes only to
the expected five output bytes for positive-level cases. Retain ordinary owner,
relocation and generation rejection tests separately.

## Approved larger inventory result

Luna passed all eleven scanner controls and ran the single128KiB analysis pass.
It recovered36,934 unique new instruction bytes in24,619 rows (14,102 new,
10,517 accepted). The analysis limit was not exhausted. The result remains
incomplete because six computed transfers and17 interrupts need classification
against original dispatch tables and existing runtime services. The32KiB
admission ceiling is unchanged, `within_admission_budget=false`, and
`runtime_admission_authorized=false`.

Actual ignored inventory:
`build/cok-recomp/staging/intro-compare/creation-closure-inventory-128k-20261015-a.json`,
SHA256 `ca484b8537a3be37669da795ea9cfbd591c52f18709f6e8e46aec703c0eb925c`.
Computed sites are0661:0355 and0A46:03B7/03C3/0601/07FB/088C.
These scanner findings are not automatically runtime gaps: existing admitted
code and host services must be checked before assigning new implementation.
Partition complete helpers after that review; do not treat the inventory's
36,934 bytes as permission for one oversized admission.

The reviewed-return refinement passed13 scanner controls. Its ignored inventory
is `build/cok-recomp/staging/intro-compare/creation-closure-inventory-returning-20261015-a.json`,
SHA256 `d941c409754d9f3148372f7d8bcbc8895b084b1ee60307a5cae67cfd42dec13c`.
It adds31 new bytes (15 instructions), leaving the root unchanged. The helper
partition is now11,343 new instructions /29,549 bytes with527 unique relocation
intersections. Seven additional interrupt sites became visible; classify them
before declaring the helper tuples final. Host-contract markers remain explicit
and no runtime admission is authorized by this inventory.
