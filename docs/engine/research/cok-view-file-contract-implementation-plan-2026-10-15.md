# Next View implementation: original file-wrapper contracts

2026-10-15. Astra source plan while Luna's reviewed v3 diagnostics are pending.
No candidate import, decoder, test, build or application ran during planning.
This is a conditional implementation plan, not approval of unknown contracts.

## Shortest defensible route

The original roots are A8:0D74 (View) and A8:36CC (selector). Prioritize their
fixed-role dependencies: DS:6E3A -> BA public0034 -> BA:127E, and DS:6D74 ->
65 public0228 -> 65:3888. The four new guarded dispatch sites remain BA:15C7,
BA:1712, DB:01C1 and DB:01E1. Use the already authored original initialization
witness and current-state operand guards. Do not choose index values or prune
the indexed branches to force this route.

This is a source-based priority, not a proven chronological first runtime path.
The pending classification must show which SCC/dependency ledger connects
each root/fixed role to each host request. Neither AH=06 nor AH=30 is yet proved
to execute on the first View action. A truthful unsupported boundary remains
preferable to inventing that order, but a native observation still needs the
later build/admission gate.

The immediate executable increment should discharge the two original file
wrapper contracts by binding their actual request ABI to existing services.
It should not begin by implementing all 20 returning contracts or a console
renderer. A46:140F and A46:14E2 currently have unknown AH in the conservative
classifier because stack/callee effects and private incoming paths are not
summarized. That unknown is not evidence that Rust lacks file services.

## Reuse versus missing implementation

| Original sites | Current service and remaining obligation |
| --- | --- |
| A46:140F | `Extended::dos` routes AH3C/3D through bounded save/asset namespaces. Prove request producer, mode/attributes, pathname and stack restoration; do not add a second open/create service. |
| A46:14E2 | Existing AH3F/40 handles save read/write; legacy assets have bounded reads and write rejection. Prove BL-to-AH and record/buffer/count/handle ABI. |
| A46:145F;1541/15AB/15B9/15C7 | Existing close and seek origins0/1/2; check exact handle ownership, signed offset/result and error domain. |
| 661:0333,7E8:130F,A46:0164;962 keyboard quartet;9C4:00A7/0135 | Existing vector, BIOS keyboard, clock and DTA contracts. Reuse exact guards and request domains, not generic INT permission. |
| 9C4:0141 | Current WHO/exact search and CX8 root-volume service exist. The older boundary document's pending-volume statement is historical; preserve exact wildcard/attribute/ownership checks. |
| 962:060F | Existing video wrapper is request-dependent; no universal text/cursor/scroll support. Need actual AX/BX/CX/DX domain from relevant dependency paths. |
| A46:01EB | AH06 genuinely missing visible byte-output backend. Mode0D EGA does not consume B8000 shadow output. |
| A46:1686 | AH30 genuinely missing declared DOS-persona service and explicit register/flag contract. |

Current source basis: `rust/cok-recomp/src/startup_platform.rs` functions
`dos`, `dos_legacy`, `save_result`, destination admission and volume/WHO routing;
`startup_session.rs` PSP/environment construction; frozen View v3
`classify.py`, `prepare_abi.py`, `HOST-REPAIR-PROPOSAL.md`; prior runtime-dispatch
and boundary plans. AH4C remains terminal and INT23 exceptional: neither gains
a returning edge.

## Concrete Sol increment after actual ABI review

1. Add a narrowly scoped original ABI contract consumer beside the frozen View
   classifier/emitter. Consume the actual v3 diagnostic, its source identities
   and the complete unresolved/dependency ledgers. Bind exact source rows,
   relocations and helper exits rather than matching an AH literal alone.
2. For the public13C9 path, prove DS:43B2 supplies AL and13CC supplies AH3D.
   Verify original13F6..13FF AX/DX saves, ES/DI arguments, PUSH CS/near CALL144A,
   RETF4 and restores with actual stack extent/alias semantics. The private
   join13D8 does not inherit that proof. A create branch needs its own original
   producer; its existence in Rust is not proof of an original caller.
3. For14E2, bind14DD's AH<-BL before14DF replaces BX with the handle. Use the
   independently verified whole146F writes/returns and incoming BL definitions.
   The14B4 read initializer alone does not establish every private caller.
4. Emit exact runtime guards for only the proved request alternatives: current
   resident owner/base/source instruction, request shape and the existing
   path/handle/buffer protection rules. Reuse `Extended::dos` once those gates
   succeed. Reject an unproved alternative before service side effects; never
   rewrite AH/AL, synthesize a pathname, clamp a count or translate an error
   into success. Existing baseline callers must retain their existing behavior.
5. Recompute SCC obligations using these discharged site contracts. Publish
   which concrete root/fixed-role dependency is now closed, and its next exact
   blocker if any. Preserve all228 slots/189 bodies, but do not leave a proved
   file site generically pending merely because unrelated targets are open.
   Slot support still requires complete source/host closure plus runtime guards.

Expected owned executable edits are a small ABI contract consumer and its
classification/emission hook, focused original-wrapper controls, and only if
needed a scoped pre-service guard hook. Do not rewrite DOS storage services or
change their error/CF behavior. Freeze the proposed exact file list and diff
for Astra review before Luna execution; production remains untouched.

If the diagnostics cannot prove one wrapper path, implement only the complete
other path. If neither is complete, the next source acquisition is the exact
missing caller/stack definition named by the diagnostic, within the remaining
budget; do not start service implementation from assumptions.

## Evidence required from Luna before selecting that increment

Supply actual v3 control receipts and pinned `abi-diagnostic.json`, including:

- `summaries` for13C9,14B4,144A,146F with exact sources/returns/calls, unresolved
  roster, write/unknown-effect lists, AX/BL proofs and CFG completeness.
- `AX_save_restore_original_rows`, `conditional_request_producer_proposals`,
  `request_sites`, `incoming_contexts` and
  `incoming_reaching_definition_boundaries`. A `known_request:false` field is
  intentionally not an admission decision; inspect its concrete original rows.
- `pending_worklist`, complete original rows/edges, physical-byte analysis and
  retained prior exhausted/pending work. No bound reset for a new wrapper.
- Classification interrupt rows and per-root/SCC dependency ledgers connecting
  A8 roots and the two fixed roles to the file sites and any AH06/AH30/video
  blockers. Include actual raw graph identity and complete slot roster.

Native guard-unit PASS supplies only synthetic runtime-helper evidence. It
does not prove original initializer execution or file-wrapper continuation.

## Byte budget and discriminating tests

Accepted production remains35,740 instructions/91,590 bytes. Current proposed
View union is30,900 net bytes against32,768, leaving1,868. This contract step
targets **zero additional guest bytes** beyond that inventoried union. Any
needed missing helper/caller bytes require typed physical-set subtraction and
an explicit amended count; never silently consume the remaining allowance.
ABI source acquisition stays shared32,768/local16,384 with inherited9,944
charged bytes; previous131,071/131,072 exhaustion is immutable evidence.

Luna should execute the original wrapper instructions and return sequences in
the candidate, not a reimplemented wrapper. Exercise open success/not-found,
invalid mode/attributes, read full/short/EOF, read-only asset write denial,
isolated-save write/error, invalid/stale handle, seek success/error and close.
Assert actual AX/CF and preserved registers/stack/return words, DOS events,
cursor, buffer digest and untouched tail. Use fresh scratch-only writes.
Mutate saved AX/DX, returnCS/IP, SP/SS/aliasing, source ownership, BL producer,
helper write/return roster, request kind, pathname extent and buffer wrap;
reject before prohibited service side effects. Test private-entry alternatives
as unsupported until proved, including a valid service with the wrong producer.

Then require two identical fresh generations, original source/relocation and
union controls, original initializer/dispatch tests, full inherited native
tests and exact binary/provenance binding. Audit integration is first and all
shared native builds are serialized. Only a subsequent reviewed runtime gate
may authorize one fresh singleton-party View action and clean return; no Begin
or Save is implied.

If AH30 is the resulting next blocker, plan the explicit DOS4.00 persona plus
original>=3 PSP/environment path and register/FLAGS policy; do not return DOS2
to bypass it. If AH06 blocks, acquire its actual display/device and caller
domain before implementing visible glyph/cursor/wrap/scroll behavior. Neither
missing service is approved merely to make all worksheet entries green.
