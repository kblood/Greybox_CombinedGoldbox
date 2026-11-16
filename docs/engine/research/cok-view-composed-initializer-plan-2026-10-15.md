# CoK View: composed initializer postcondition and callback slices

Date: 2026-10-15. Status: bounded source-proof plan; no native View admission.

## Evidence and scope

The reviewed initializer source is `build/cok-recomp/character-view-initializer-proof-sol-20261015-v2`, source-freeze SHA256 `d76e12fc0c92bc20a957741cdd2bba2a5b343aa757e770f171ea582cce7b3d36`. Actual repeated dossiers are `build/rea/rea-view-initializers-20261015-a-evidence/source-controls/one.json` and `two.json`; actual REA outputs are under `build/rea/rea-view-initializers-20261015-a/{ba,65,61,a8,db}`. REA is advisory. In particular its documented default CS-context mismatch cannot establish original segment ownership. Original bytes, relocation records and decoded owner coordinates remain authoritative.

This task proves conditional initializer postconditions and exact argument slices. It admits zero guest bytes, installs no dispatch contracts and does not promote whole View acceptance. Preserve the complete View dependency inventory, all unresolved entries, existing guards and the aggregate 131072-byte analysis cap; eventual admission remains separately capped at 32768 bytes.

## Concrete source findings

- `0061:0835`, bytes `9a5200ba00`, calls public `00BA:0052`, resolved to `00BA:58ED`.
- Immediately afterward, `0061:083A`, bytes `9a25006500`, calls public `0065:0025`, resolved to `0065:38EA`; the function returns at `0061:0842`.
- BA initializer has 474 decoded rows, no calls, no unresolved edges and one return. The 65 initializer has 452 rows with the same properties.
- BA supplies eight holes in 65's assignments: `6BA4`, `6BAC`, `6CCC`, `6CE0`, `6CE4`, `6CE8`, `6CFC`, `6D34`.
- Together these original assignments write slots 1–120 relative to `6B94`, leaving slot 0 unwritten, plus 108 four-byte entries at `6E3A…6FE6`. These are write footprints, not legal index ranges. `6D74` additionally has a separately identified fixed-call role.
- REA identifies an additional DB callback caller at `DB:0352`; the current original-source dossier contains zero rows for it. Caller enumeration is incomplete.

## Bounded implementation

Create a fresh source candidate, retaining the reviewed v2 and its evidence.

1. Independently decode BA:58ED and 65:38EA from original bodies and validate every instruction and relocation. Interpret their ordered stores into a symbolic `DS_entry` memory map. Require complete CFGs, no calls or DS writes, exact return boundaries, complete pointer halves, original stub resolution and target ownership. Compose BA then 65 using the original 61:0835/083A calls. Emit final values, defining rows, untouched cells and overlap order. The resulting claim is conditional: on return through this path, these cells in incoming DS contain these pointers. It is not global initialization dominance.

2. Produce source-bound backward slices for all four sites:
   - BA:1712: BP+0E → AL → DS:6B33 → zero extension → DI×4 → [DI+6E3A].
   - DB:01E1: BP+10 → AL → zero extension → DI×4 → [DI+6B94].
   - DB:01C1: nonzero DS:713C branch selects fixed 6D74.
   - BA:15C7: recover its own branch predicates and fixed 6E3A call separately.

   Trace actual PUSH order, far-call return words and callee BP layout. For A8's BA calls at 2693, 26CB and 2710, recover local BP-1 definitions from the A8:34EC return path and ES:[DI+3D]&7F path, including cancellation and nonzero branches. Expand precisely A8:34EC and DB:0352 as new original-source roots under the existing aggregate cap. If the cap is reached, retain explicit unresolved producers.

3. Prove BA/65 DS preservation from their complete decoded bodies and record their adjacent calls as an ordered local chain. Recover the concrete startup dispatch entry invoking 61:005B from original catalog and scheduler; track the original DS definition through that path. Unknown callee DS effects and alternate startup paths block global dominance. Catalog order alone is insufficient.

4. Classify replacement-write effects against the exact footprint on recovered startup-to-consumer paths: direct/partial/indexed stores, string operations and callees. Unknown segment/base aliases remain explicit blockers with source addresses. Absence of literal-address stores is insufficient. Report whether each conditional postcondition survives each recovered path, without claiming global alias closure.

## Discriminating controls owned by Luna

Mutate source-bound evidence and rerun validators: omit a BA hole-filling store; remove a segment half; change a relocation or stub owner; invent slot 0; bypass a store with a branch; introduce a DS clobber; reorder overlapping stores; remove a caller; alter PUSH order; remove zero extension; change scale; delete cancellation; add a potentially overlapping indexed/string write. Include an intentionally broken validator treating min/max footprint as a legal contiguous index domain and require its rejection. Controls must exercise the actual proof computations, not only final dossier equality.

Success is exact conditional initializer facts, composed hole coverage, source-bound argument slices and concrete remaining blockers. All four dispatch contracts remain unresolved until their required conditions are discharged or a separately reviewed runtime contract supplies an equally faithful guard.

## Review addendum: private DB entry (2026-10-15)

The earlier instruction to expand DB:0352 is conditional on recovering an original private-entry witness. Composed candidate v2 (freeze `9115798092ec7c9c5b087875c92ebee78d8f3dbafdee70c7347248020ed6c678`) remains on hold: it incorrectly requires0352 to appear in the original DB procedure table. The pinned table has26 entries and does not contain0352. REA identifies0352 as a function entry and04EA as its call to01A8; these distinct roles must not be conflated.

Seed the26 actual DB procedure offsets in the same scanner under the unchanged aggregate cap. Recover0352 through an original decoded direct-call edge, recording caller CFG/public-root ancestry, source bytes, owner and target calculation. Only then recover its local body and validate04EA's membership and actual target01A8. If no witness is recovered, emit `private_entry_witness_unresolved`; do not fabricate public membership or make successful DB recovery an unconditional test precondition. For a near CALL, establish the original PUSH CS on the incoming path; physical adjacency alone does not exclude a bypassing branch.

Controls must reject fabricated public membership, omitted/changed private-entry witness, wrong owner/relative target, entry substituted for callsite and bypassed PUSH CS. Return-slice controls should require independently justified reaching definitions and controlling branches, not every AL/AH write (dead definitions need not reach a return). Model relevant register-family overlaps beyond AX/DX, or retain an explicit unsupported-dependency blocker. This addendum supersedes any unconditional0352-root reading above. No candidate edits or native admission are authorized by the review.

## Actual v4 test failure and accepted-source witness repair

Luna executed the reviewed v4 candidate (freeze
`16c1b33079d76fe94f311aa7f00fed96ffc45480c8b087b8db1f6fca06734aac`).
Python process64100 exited1 after28 seconds on2026-10-15. The first preparation
failed at the graph-only exact-sequence lookup for resident A46:0000, before
writing a dossier. No controls or independent second preparation ran; private
entry recovery was not computed. Raw process receipt/stdout/stderr remain in
`build/rea/rea-view-composed-v4-luna-20261015-a-process`. All30 frozen sources,
three dependency manifests,53 evidence pins and six explicit inputs matched
afterward.

Source review explains the missing row: the scanner uses a set and processes
the lowest pending coordinate, then breaks globally at the shared new-byte
cap. The high-CS resident witness can remain pending even though its bytes
are already accepted and cost zero new bytes. The pinned cold baseline has
the correct original resident rows at physical42080/42083, bytes bac60b/8eda.
Physical byte deduplication affects charging, not row emission.

The v5 repair must preserve graph exhaustion and its complete pending worklist.
Recover an absent exact witness separately from the validated accepted corpus,
checking original coordinate, typed physical identity, bytes, instruction
boundary and relocations. Label it `accepted_source_witness_not_traversed`;
never insert it into graph edges/local CFG or infer dominance from it. Prove
zero novel-byte charge under the unchanged131072-byte cap. Missing both sources
remains explicitly unresolved; corrupted identity/bytes/fixups hard reject.
Add cap-omission, missing-source and mutation controls and persist scan
diagnostics before subsequent postprocessing can fail. This repair has not yet
passed tests and authorizes no native View execution.

## Possible subsequent runtime contract — not authorized here

A fail-closed runtime dispatch guard may replace a global static no-alias proof for a narrowly defined supported state. This is a separate design/admission task. It must observe startup establishment and actual original writes; it must not synthesize tables or infer initialization from matching bytes alone. Require the established DS identity and its lifetime, exact original pointer words and relocation-aware source/stub/body binding, the call-site's actual branch/index computation, caller ownership and generation, and current target admission. Recheck the relevant state at every dispatch; intervening unknown writes invalidate cached proof or force revalidation. Unsupported indices, changed pointers, stale generations, wrong owners and incomplete targets must stop before transfer with unchanged architectural state.

An initialized slot is necessary but is not by itself a proven legal domain. A future contract must either retain a separately proved caller/index domain or explicitly define and test a narrower state-based supported subset without claiming complete original domain recovery. The guard must never redirect an unproved index to a convenient known target. Preserve the full target/dependency worklist, including every unimplemented destination and unresolved caller; exact tables do not imply that their target bodies are implemented.

At a single-threaded original call boundary, checking the actual table pointer and its ownership can make a subsequent transfer safe without proving that no prior alias ever wrote the table. This supports conditional execution only. It does not establish startup order, legitimate input reachability, whole View completeness or fidelity of unimplemented target behavior. The original dispatch semantics and existing typed runtime-ownership contracts must be reviewed together before choosing that route.
