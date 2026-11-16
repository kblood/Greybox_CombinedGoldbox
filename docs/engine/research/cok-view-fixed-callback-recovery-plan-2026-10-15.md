# CoK View: two missing fixed callback closures

Date: 2026-10-15. Approved bounded implementation plan for a separate source
candidate. Sol prepares source; Astra reviews it; Luna alone executes recovery
and REA. No production mutation or native View execution is authorized here.

## Exact objective

Recover original whole functions BA:127E and65:3888 and their required dependencies.
The proven pointers are DS:6E3A -> original BA public0034 -> BA:127E, and
DS:6D74 -> original65 public0228 ->65:3888. Their public pointer bindings are
established; their function bodies are absent from the accepted WORLD, historical
View inventory and exhausted composed proof graph. Do not grant support from the
pointer binding alone. Preserve the complete228-slot/189-body worklist.

This is a new bounded recovery task. The prior composed graph's131071 new bytes,
131072 limit, exhaustion and pending work remain unchanged. That per-task limit
does not prohibit explicit follow-on recovery of identified original functions.

## Source inputs and analysis images

Pin original START.EXE and GAME.OVR, accepted current WORLD C/manifest and all
existing evidence consumed. Derive descriptors/public stubs/procedure offsets,
body extents and relocation words independently from the pinned originals.
BA body starts at GAME.OVR187403, length24306;65 body starts68584, length16036.
Therefore original callback starts are192137 and83056 respectively. These are
overlay-file offsets, not resident addresses or REA virtual addresses.

Reuse the existing actual analysis MZ/provenance pairs under
`build/cok-recomp/character-view-initializer-proof-sol-20261015-a/rea-preparation-luna-20261015-a`:

| Owner | Image | Image SHA256 | MZ header bytes |
|---|---|---|---:|
| BA | view-init-ba.exe | 19835aa28c0ced502e18a1e416e2f27408e42eb93b5dcfc33b92dea195663e83 | 4944 |
| 65 | view-init-65.exe | a466ca30cdbae112ea7fe13234dcf225deba546f572db8157e475c76dd0633d7 | 4016 |

Preserve their original provenance and transform script. Before execution, freeze
actual image/provenance/script hashes, original source hashes, body hashes and
relocation rosters in a new authorization naming these two experiments and roots.
Do not overwrite old authorizations or change the images' original entry points.
Verify MZ module offset20000, measured import load segment1000 and body linear
base30000; only then seed BA at3127E and65 at33888. Verify original root bytes
from the complete body, accounting for actual loader fixups. Reuse the previous
body/fixup audit, but recheck all consumed artifact pins before and after.

REA default-CS interpretation remains advisory. Preserve the segment-binding
warning; a computed Ghidra CS data reference is not original resident/DS authority.
Require selected provider health and measured map checks, retaining the overall
doctor result truthfully. No retail execution or rebuilt-game application launch.

## New bounded preparer

Use one shared32768-byte analysis allowance for distinct original physical bytes
outside current WORLD. Each root's local whole-function walk has a16384-byte
ceiling within that shared allowance. Dependencies share the same32768 allowance;
never give each child a fresh budget. Report typed physical union counts for this
task, overlap with historical View and composed evidence, and cumulative union
across tasks. Separate source rows/context identities from physical byte charging.
Previously recovered rows still require original byte/owner/fixup validation.

Seed exactly the two functions. Recover every local branch/fallthrough/return and
enumerate every original call. Resolve direct far calls through original public
stubs and preserve original targets and resolved body identities; retain near-call
arithmetic in its original owner namespace. Recover required new direct dependency
functions within the shared limit. Existing accepted targets may reference their
validated accepted closure/contracts, with explicit unresolved operations retained.
Computed transfers, interrupts and unsupported host effects remain unresolved
unless separately justified by existing exact contracts. Never stop at a plausible
RET or nearest prologue and declare the rest complete.

On a limit or missing dependency, publish incomplete status and the entire pending
worklist, per-root coverage and exact reason. Do not omit a root, infer completion
from a returned function count, or import the old exhausted graph as admitted code.
Use per-invocation graph indexes to avoid repeated full-map construction; caches
must not cross mutated graphs or change traversal/mutation coverage.

## Source deliverables and Luna execution scope

Sol creates a separate candidate containing a pinned preparer, controls, fresh
output policy, new REA experiment wrapper, input/authorization templates and source
freeze. The wrapper should expose explicit experiment names `view-fixed-ba` and
`view-fixed-65`, original image path, fresh output directory and authorization path,
following the existing reviewed REA runner conventions. These are new interfaces
to implement and review, not flags already available in the old wrapper.

After Astra source approval, Luna runs exactly those two owner-specific REA
whole-function requests at the verified VAs, retaining command/PID/timing/actual
exit/raw stdout/stderr and provider/map evidence. The source preparer separately
decodes the original bodies and dependencies twice into fresh outputs. REA output
may guide inspection; original decoded rows and fixup/owner checks decide proof.
No generic all-program REA sweep, pseudocode compilation or new gameplay input.

Controls must discriminate wrong owner/namespace, public stub, resolved target,
root bytes, relocation, midpoint, removed branch/return/direct dependency,
resident/overlay physical aliases, and deliberately low aggregate/local budgets.
Low-budget controls must preserve explicit pending work and incomplete status.
Require two independent source generations and original-byte comparisons. Retain
all189 target entries even though only these two are advanced by this task.

## Admission decision after actual recovery

The native admission cap remains32768 net original guest bytes over accepted
WORLD35740instructions/91590bytes. Historical View currently adds30514 bytes,
leaving2254 for missing required closures and witness paths. Recompute the exact
union after recovery; do not assume the two functions fit. Include all required
dependencies, original source protections and existing host-contract limitations.
If the whole required union exceeds the cap, publish a complete-target subset
proposal for explicit review, with every unsupported slot/body still listed.
No code generation/native acceptance follows merely from a successful REA run.
The pending runtime-witness/four-site guard candidate resumes only with reviewed
target closure evidence and truthful support decisions.

## Next implementation: exact host and guarded dependency classification

Actual recovery source freeze667cca996e5b3ccbffcd1be15f9e40560fd6636ba3980477b6c16efb69bb6d51
passed two independent source recoveries and controls. The new graph contains
13716 rows and9944 novel physical bytes, without exhausting its32768 analysis
budget. BA:127E has288 local bytes;65:3888 has98. WORLD+historical View+recovery
currently adds30900 bytes, leaving1868 under the unchanged32768 admission cap.
BA's transitive ledger has175 dependencies/70 unresolved entries and65's has24/22;
these counts include repeated obligations and wrapper status entries.
Both authorized REA function requests succeeded; receipt
`build/rea/rea-view-fixed-callbacks-luna-20261015-a/REA-RUN-RECEIPT.json`
SHA256 `34208241a49ecc2d2952c0e4e8a6d2f852b7b48f867d8b31f83f3e7fe6cb4a48`
retains process/map/source evidence. REA remains advisory.

Sol should now implement a separate frozen classification/guard candidate, using
the actual recovered graph and current native sources as pinned inputs. Preserve
the raw graph and raw unresolved lists verbatim. Add three distinct results:
local source CFG coverage, exact host/guard obligation coverage, and runtime
admission eligibility. A known returning INT still requires its service contract;
it does not make its surrounding function's already-followed continuation absent.
No global relabel of unresolved entries or new universal interrupt policy.

### Interrupt contracts and producer evidence

The actual graph has22 distinct INT sites:20 returning-policy sites and the two
special stops below. Bind every classification to typed original address,
physical owner, exact opcode/relocations, producer rows, caller constraints,
continuation edges and pinned native implementation predicate.

| Original sites | Required classification work |
|---|---|
|0962:0152/0306,0158/031D|INT16 AH1/AH0 respectively, proven by original MOV AH or XOR AH,AH; bind startup profile and keyboard handler, including yield/resume behavior.|
|0962:060F|Generic INT10 wrapper: recover caller AX/BX constraints and match actual video-handler domains. Do not treat all INT10 requests as supported.|
|0661:0333,07E8:130F|Original AX2508 producers; bind actual vector-write handler and memory protection/failure semantics.|
|09C4:00A7/0135/0141|Original AH2C/1A/4E producers; bind clock, DTA and find-first domains, buffers, attributes and error returns.|
|0A46:0164|AH25 with original AL vector and LDS DX producer; retain vector/memory constraints.|
|0A46:01EB|AH06 with original DL producer; verify the actual permitted console request domain.|
|0A46:140F/14E2|Caller-derived file service functions, including AH=BL at14E2; recover reaching definitions across each incoming path, not an adjacent-byte guess.|
|0A46:145F|AH3E close and inherited handle/error behavior.|
|0A46:1541/15AB/15B9/15C7|AX4200/4201/4202/4200 seek domains, signed offset/origin and result/error behavior.|
|0A46:1686|AH30 version request and supported result semantics.|

Use original reverse-CFG reaching definitions with register-family invalidation,
including unknown intervening calls. If a request cannot be statically narrowed,
state the exact existing runtime predicate and its unsupported failure domain;
never call it universally supported. Source-owner proof and service admissibility
remain separate. Cite the real `guest_interrupt`, startup service dispatch and
Extended handler branches, not just the returning-site lookup table.

A46:01A3 has original AH4C producer: classify as original terminal transfer with
native support status established separately, never normal return.0962:0169 INT23
is an unsupported exceptional CtrlBreak branch: retain explicit unsupported
status and existing fault behavior. Neither may gain a synthetic successor or be
silently erased to make a closure complete. Distinguish source-accounted terminal
edges from successful supported gameplay paths.

### Computed dependencies and cycles

Match A46:0601/07FB/088C to the existing file-record guards, including record
magic, slot offsets, bounds, exact source/target bytes and complete guarded target
closures. Match A46:03B7/03C3 to the resident0038:0025 overlay wrapper contract,
including live descriptor/body/stub identity. Match0661:0355 to the IRQ driver
caller/DS/AH2/offset/allocation-generation predicate. Match A46:02F3 CALL BX to
the existing near-call context/target/return-IP predicate. Enumerate each actual
allowed destination from code; guard names alone do not discharge dependencies.

DB:01C1/01E1 remain the new fixed/table View obligations. Integrate them with the
four-site runtime witness plan, including BA:15C7/1712, original initializer
order, current DS, exact source pair/cell, caller and live owner/generation,
original transfer and all228 slots/189 bodies. Preserve original index semantics;
neither write footprint nor observed indices define a legal range.

Build the dependency graph with these exact guarded edges and compute strongly
connected components. A recursion cycle is not a missing callee and is not proof
of completion: discharge each SCC only when every member's local edges are
accounted for, each host/computed obligation has its exact contract, and all
outgoing SCC dependencies are discharged. Publish membership and remaining
obligations; never approve by assuming the root already supported. Unsupported
exceptional edges stay visible in every affected transitive status.

### Controls and path to native View

Author discriminating controls for wrong INT opcode/typed owner/AH producer,
partial-register clobber, unknown caller effect, unsupported request, removed
return continuation, terminal promoted to return, missing guard destination,
wrong guard source/cell/DS/generation and a cyclic SCC with one unresolved member.
Exercise classification on actual recovered rows; independent expected native
predicates must detect mutants rather than comparing two uses of the same table.
Preserve all earlier recovery controls and raw-ledger equality. Reindex per
mutation without cross-mutant caches. Luna runs two independent classifications
and all controls only after Astra reviews the frozen source.

The same Sol candidate should prepare the concrete runtime guard/emission changes
once classifications permit them, following the runtime-dispatch admission plan.
For each supported target require complete original dependency coverage modulo
explicit exact runtime contracts; report unsupported paths and full worklist.
Generate no supported flag merely because an entry byte exists. Recompute the
physical union including guard witness paths and newly resolved dependencies;
retain the earlier131071 exhausted graph and its pending work, and the separate
32768/local16384 recovery budgets. Any need beyond1868 remaining admission bytes
requires an explicit revised union decision, not truncation or a silent cap raise.

After source review and pure controls, Luna performs two independent generations,
original-byte/protection checks, guard acceptance/rejection and original ABI tests,
then focused and full native regressions and a pinned build. Only a subsequent
reviewed runtime plan may press View. This advances implementation toward actual
View execution while leaving native admission unauthorized until those gates.

## Actual bounded recovery and REA outcome

Luna executed the source controls with the pinned tools virtual environment
(Capstone5.0.7), after an initial unrelated global-Python invocation lacked
Capstone. The corrected process65244 exited0. Two independent original-source
recoveries agree. The recovered local CFGs are BA:127E (288 bytes) and65:3888 (98
bytes); they contain three and two direct calls respectively. The shared task
accounts for9944 new physical bytes and13716 instruction rows without exhausting
its32768 analysis allowance. The net historical View plus fixed-target union
over current WORLD is30900 bytes, leaving1868 under the unchanged32768 admission
limit. These counts are not evidence of complete transitive runtime support.
The dependency ledgers retain175 entries/70 unresolved for BA and24/22 for65.

The frozen recovery candidate is
`build/cok-recomp/character-view-fixed-target-recovery-sol-20261015-a`,
source freeze667cca996e5b3ccbffcd1be15f9e40560fd6636ba3980477b6c16efb69bb6d51.
Root authorized two new requests against the unchanged analysis images above.
Luna completed both with selected Ghidra12.1.4, measured load segment1000 and
564/564 MZ import checks each:

| Request | Outer process/exit | Doctor/import/function inner PIDs, each exit0 | Whole-function result |
|---|---|---|---|
| BA fixed callback | 45768/0 | 911/1188/1427 | 3127E–3139D,288 bytes,16 blocks,3 callees |
| 65 fixed callback, corrected fresh directory | 39572/0 | 908/1185/1428 | 33888–338E9,98 bytes,4 blocks,2 callees |

An initial65 outer process66408 exited1 before WSL/REA because its output
directory had mistakenly been pre-created. It performed zero inner operations;
its original error and raw streams remain. The authorized corrected attempt used
the distinct, initially absent `65-fresh-a` directory. No result was overwritten.

The durable combined receipt is
`build/rea/rea-view-fixed-callbacks-luna-20261015-a/REA-RUN-RECEIPT.json`,
SHA25634208241a49ecc2d2952c0e4e8a6d2f852b7b48f867d8b31f83f3e7fe6cb4a48.
It binds actual outer exits, raw streams, inner timing/provider/map checks,
28 post-run source pins,8 input pins, authorizations, image/provenance/transform
and original START/GAME.OVR hashes. Root independently rehashed this receipt.
Selected Ghidra was healthy; overall doctor health remains false because IDA is
absent. Both results retain the segment-binding warning. Their pseudocode and
callee names are advisory; original bytes and typed contracts decide admission.

Neither recovery nor successful REA establishes native View support. The next
task must distinguish returning interrupt contracts, terminal/unsupported effects,
computed guards and unresolved target dependencies before runtime admission.
