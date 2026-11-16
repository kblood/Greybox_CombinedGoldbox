# CoK View: next runtime dispatch admission task

Date: 2026-10-15. Source design only. This authorizes neither implementation acceptance nor native View execution; the candidate requires Astra source review and Luna controls.

## Objective and prerequisites

Move from conditional initializer evidence to actual original View execution by admitting a precisely enumerated runtime-supported dispatch subset. Preserve the four original instructions BA:15C7, BA:1712, DB:01C1 and DB:01E1 and their original index/branch semantics. No host-generated pointer table, guessed legal input range, replacement target or synthetic character state is permitted.

First require actual passing composed-proof controls, including original byte/relocation binding, BA-then-65 composition, exact source slots, typed DS identity, private caller recovery status and alias limitations. A missing private caller witness remains explicitly unsupported; it does not authorize fabricated public membership. Static global DS dominance and no-alias closure are not prerequisites if the following runtime conditions are established and checked instead.

The baseline is accepted WORLD35740 instructions/91590 guest bytes, not the historical cold baseline. Recompute the whole historical View inventory (previously12033 new instructions/30514 bytes) against that exact current union. Include original initializer/witness paths and every proposed target's dependencies. Retain all old instruction/source/fixup protections and unsupported host contracts. Maximum net admission32768 original guest bytes; aggregate source analysis131072 bytes. Refuse candidate publication on budget exhaustion or missing required proof; do not truncate the inventory to fit.

## Existing mechanism and integration

`guest.c:far_call_memory` reads the actual four-byte operand, calls `lifted_indirect_target_admitted`, preflights both stack words, then performs the original CS/IP pushes and transfer. `lift.py` emits narrow existing contracts, including the original unloaded CD3F public stub or loaded EA stub with descriptor/body/binding checks. `machine_binding_begin/complete` supplies active overlay generations. Reuse these mechanisms and preserve their precedence and existing six guarded-dispatch contracts.

Add a separate generated View predicate with explicit source-segment and pointer-offset arguments. The existing target-only predicate cannot by itself prove which table cell supplied a numerically identical destination. Call the new predicate only for the four exact source-owned call instructions; preserve all existing behavior elsewhere. It validates state and authorizes the original operand, never rewrites it.

## Runtime conditions

1. **Original initialization witness.** Track an internal, per-machine witness of the original DS setup and the actual calls/returns61:0835→BA:58ED and61:083A→65:38EA. Bind source bytes, descriptor/body ownership, call return frame, DS value and relevant generations. Arm only after both successful original returns and validation of the composed table bytes in that DS segment. A checkpoint, matching table bytes, catalog order or a direct test entry alone cannot arm it. Failed/partial initialization and machine reset invalidate it. Shadow bookkeeping must not alter guest flags, registers, work or transfers. Explicitly validate intervening stack writes against the final table cells, including BA-only cells, or require the final composed bytes and intact original return frames on this bounded observed path.

2. **Current call ownership.** Resolve actual CS/IP to the exact BA/DB source callsite through active binding, body bytes and stubs. Reject stale caller generations, byte mutations, instruction midpoints and alternate owner aliases. Bind the exact original instruction bytes and its computed operand location.

3. **DS and actual operand.** Require the current DS to equal the witnessed original data-segment identity, with the expected resident memory ownership. This is a current equality plus initialization-history check, not a claim DS never temporarily changed. For fixed sites require exactly6E3A or6D74. For indexed sites require the original computedDI and actual operand address to identify an explicitly enumerated supported four-byte slot. Preserve original zero extension, shifts and branches; do not clamp, remap or manufacture indices. The emitted original arithmetic executes normally.

4. **Exact current pointer.** Read the actual selected cell using the existing guarded memory path. Require its four bytes to equal that slot's original initializer-produced pointer at the actual relocation base. Bind the offset/segment definitions, fixups, public descriptor stub and resolved original body. Recheck on every dispatch; prior unknown aliases cannot authorize a changed value. A pointer that happens to name another admitted function must still fail if it is wrong for this cell. Do not cache permission across writes or machine/binding changes.

5. **Original loading behavior.** For an unloaded destination accept only the exact original CD3F public stub with the correct procedure offset and an admitted destination dependency closure; execute the original overlay-manager path. For a loaded destination require exact EA stub, current descriptor field, active generation, original body and live stubs. Do not require preloaded bodies in a way that forces host loading, and never jump directly to a resolved body to bypass the original stub.

6. **Atomic rejection.** Failed identity/state checks stop before guest transfer or stack writes. Preserve existing memory-fault and host-evidence-stop priority. No successful predicate may silently supply a missing host service or unresolved target operation. Preserve original far-call stack/return semantics, including cases where physical stack/table addresses alias; the operand is read before the original pushes, and those pushes must not be reordered.

These conditions define a supported runtime state subset. The initialized footprint is not a proof of the complete legal index domain. A program may legitimately generate an index outside this subset; the candidate must report an unsupported original boundary there, never redirect it.

## Complete target worklist and bounded implementation result

Generate a source-pinned record for every composed slot and fixed-call role: initializer definitions, relocated public pointer, original resolved body, net new instruction/byte count, dependency closure, unresolved sites and support status. Keep the full228-pointer composition and all historical View dependencies visible even where aliases share a target. Determine candidate-supported slots by complete source/host/runtime requirements, not merely by whether a target address occurs in emitted C. Preserve unsupported and cap-limited destinations in the report.

The first implementation candidate should include the four exact guarded entry sites, runtime witness tracking, the reviewed original View root/selector closure and every target closure it proposes to support. It must publish exact candidate support and unresolved rosters before testing. If those requirements exceed32768 net bytes, split at complete target closures with an explicitly reviewed smaller supported subset; do not describe that subset as whole View or silently discard blocked work. Prioritize dependencies required by the original KRA View path, using original source evidence or a truthful unsupported-boundary observation to select the next closure.

## Luna controls and actual View gate

At load bases0 and1000, execute original initialization and original dispatch instructions. Verify readiness is absent before initialization and after partial/reordered/failed initialization. Prefilled matching tables without the original witness must fail. Mutate DS, caller body/source bytes, generation, pointer address, each pointer half, relocation, descriptor field, stub, destination body and generation. Test slot0 in the6B94 family, unwritten/outside slots, wrong fixed role, wraparound and a valid-but-wrong target. Require exact rejection with unchanged architectural state and no stack write.

For every supported target, demonstrate the original unloaded-stub manager route and loaded-stub route, original transfer address and CS/IP return words; include reload/generation changes. Distinguish unsupported source/host dependencies from passed runtime behavior. Exercise stack preflight failures, existing guest fault, evidence stop and timer/interrupt boundaries. Verify optional witness bookkeeping does not change guest work or accepted baseline traces outside the new supported transfer. Repeat all inherited native tests and source-union/mutation controls without weakening ancestor assertions.

Only after source review, two fresh identical source generations, focused controls, full native suite and a bound executable may Luna attempt the original KRA View action from a freshly re-established accepted cold Add state. Capture the exact pre-action state, original key receipt, target/unsupported boundary and fresh output. No speculative extra keys after a stop. A coherent View screen and clean return require separate observed acceptance; guarded dispatch tests alone are not View completion. The next task after an unsupported stop is the exact original missing closure, using the retained full worklist.

## Implementation go-ahead after actual composed v5 controls

The v5 pure proof process PID59624 exited0 on 2026-10-15 at17:43:07Z.
Its controls report PASS with304 recorded controls, including the133 incoming
private witnesses' owner/relative-target mutations and two independent preparations.
Both51,645,166-byte dossiers hash to
`7c695dc78107ee5527ef9dd02754a715b24b586d6b9d16212071f930b3f6873e`.
Source freeze remains
`c29f31513f718c3387b464bcc2cf0780cd406c6cfd4063e0d1ed294271e27820`.
This satisfies the composed-proof prerequisite for a separate Sol source candidate.
It does not authorize native View execution or production edits.

Concrete evidence now includes publicDB:057C calling privateDB:0352 (first
witnessDB:0599 `e8b6fd`), private local CFG143rows with no unresolved local edge,
and DB:04E9 `0e` followed by04EA `e8bbfc` to01A8. Every recovered incoming
predecessor of that transfer includes the explicit PUSH CS. This establishes the
observed original near-call return-word setup, not global caller completeness.
Keep private ownership distinct from original public-table membership.

The full composition has228 slots and189 distinct resolved bodies. Typed physical
byte-set subtraction of the historical View inventory from accepted current WORLD
still yields12,033 new rows/30,514 new bytes, leaving2,254 bytes under32,768.
This is inventory arithmetic, not a complete target-closure or generation result.
Original main roots are A8:0D74 (View) and A8:36CC (selector). Prioritize fixed-role
closures6E3A -> BA public0034 -> BA:127E and6D74 ->65 public0228 ->65:3888.
Indexed candidates remain the108 initialized second-table slots and first-table
slots1..120. Their initialized footprint does not establish legal index ranges.

Sol may now implement the original runtime witness and narrow four-site predicate
described above in a fresh isolated candidate, independent of the DOS-audit
candidate. Preserve all existing six guards and accepted WORLD/volume/source
protections. Retain the complete228-slot/189-body support worksheet with source
pairs, public stubs, bodies, dependencies, required host contracts and explicit
support decisions. Require complete per-target closure before granting a slot;
mere presence of its entry in generated C is insufficient. The fixed-role
targets are priorities, not assumed complete closures.

The composed analysis exhausted its131,072-byte allowance at131,071 new bytes,
with62,939 rows and11 local incomplete roots. Keep that exhaustion and its entire pending
worklist in candidate provenance. Reuse validated original rows with typed
physical identities; do not reset the aggregate allowance, import the whole
exhausted graph as admitted code, hide gaps or rescan until a budget fits.
No cap-limited dependency can receive support=true. If complete required target
closures exceed the2,254-byte headroom, publish an explicit smaller complete-target
support proposal for review before generation/native testing. Do not describe
such a subset as complete View.

Runtime witness success must arise from actual original DS setup and ordered
initializer calls/returns, not prefilled matching bytes. On every supported
transfer validate current DS, caller source/body/generation, exact computed cell,
both pointer halves, relocation/source-pair binding and destination ownership.
Preserve original unloaded-stub loading and loaded-stub behavior, operand reads,
stack preflight, transfer/return semantics and fault precedence. Unknown prior
aliases are tolerated only through these current-state and actual-history checks;
they do not become a static global non-alias proof.

Deliver source, dependency/support/budget reports and discriminating controls for
Astra review first. Luna alone owns subsequent two-generation equality, native
guard controls, inherited full tests and binary binding. Any actual KRA View
action requires that later gate; this go-ahead covers implementation only.
