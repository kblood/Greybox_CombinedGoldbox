# View callback initialization and index proof

2026-10-15. Astra source/evidence review; no application, generation or tests executed. This is the next bounded analysis task, not View admission. Preserve cold baseline34172/87539, measured direct View delta12033/30514, all current native/host guards, analysis cap131072 and eventual admission cap32768.

## Evidence and concrete leads

The accepted source-only evidence is `build/cok-recomp/character-view-call-contracts-sol-20261015-a/luna-validation-a/evidence-preparer/evidence.json`, SHA256 `e04d76f791c4822d9371ffea8640b4974f14e9bef22eeb41640a6f8ca2701df5`. Luna reports23 controls, both processes exit0 and29 unchanged pins. All four call proposals remain unresolved, with null DS/bounds and empty targets. Thousands of generic alias/copy candidates do not establish initialization or completeness.

The five decoded-corpus direct callers are:

| Call site | Enclosing whole function | Callee |
|---|---|---|
| A8:2693,26CB,2710 | A8:24D7 | BA public0039 → body1415 |
| A8:1DE2 | A8:1D96 | DB:01A8 |
| DB:0264 | DB:01E9 | DB:01A8 |

These are corpus-limited callers, not proof that no external caller exists. BA:1415 has368 decoded rows and DB:01A8 has28. Their four unresolved far calls remain BA:15C7/1712 and DB:01C1/01E1.

The evidence now identifies actual decoded writers in the accepted cold corpus. This corrects the earlier observation based only on the View traversal:

- **BA:58ED**, public0052, writes AX=0034/DX=00BA into DS:6E3A/6E3C at58F6/58F9. Public0034 resolves to original BA:127E. Subsequent pairs start DS:6E3E at591A/591D with public005C and continue through the whole initializer, ending RETF at5EEC. Review the entire function, including holes and unrelated state; do not infer a legal index range from the largest written address.
- **65:38EA**, public0025, starts with public0034/descriptor0065 written to DS:6B98/6B9A at38F3/38F6. Other pairs include gaps: DS:6BA8 then6BB0. At3E90–3E99 it writes public0228/descriptor0065 to DS:6D74/6D76; public0228 resolves to body3888. Return is3E9E. These are source-proven candidate assignments, not yet lifetime/DS proofs.
- **61:005B** contains DS:713C=0 at063C and clears a range through the original fill helper at0690, then bytes6B95/6B96 at0695/069A. This makes the missing index-zero entry at base6B94 a specific concern, not permission to fill a table hole.
- **A8:1D96** sets DS:713C=1 at1DC0 after masking a source byte with7F and comparing with0/2. Preserve the full control flow and restoration/replacement paths around DB:01A8. BA:1704 copies BP+0E into DS:6B33, then forms the indexed call; that scratch byte is not an independent bounds check.

All addresses above are per-overlay offsets. Never treat the same linear address in independently prepared images as a shared code owner.

## One bounded Sol evidence task

Prepare an ignored, separately frozen analysis candidate. Reuse the existing original-byte decoder, descriptor/fixup validation and scoped closure scanner; no new emulator or guest instrumentation. Inputs remain explicit original assets, accepted cold manifest65ef0cf3…, measured Viewaf50d442…, evidencee04d76f7… and pinned current guest guards.

1. Recover whole functions for BA:58ED,65:38EA,61:005B, A8:24D7,A8:1D96,DB:01E9, plus the already measured BA:1415/DB:01A8. Record all original rows, returns, calls and unresolved edges. Do not mistake nearest preceding prologue or descriptor ordering for ownership: verify traversal and original return boundaries.
2. Extract each initializer's actual store pairs with register def-use witnesses, exact destination interval, original pointer words and relocation cell for the segment immediate. Join each public pointer through its own descriptor/procedure roster, retaining body hash and physical source offset. Keep holes, partial writes, overlapping aliases and conditional writes explicit. Do not infer entries from a numeric progression of public stubs.
3. Trace source-backed callers of the two initializers into accepted startup/module initialization order. Prove DS establishment and preservation along those paths and from caller to each computed call; retain any unresolved segment assignment/copy as a blocker. One runtime DS value is not sufficient. Review replacement writers against the actual initialized ranges, including indexed/implicit writes whose destinations can overlap; generic candidate enumeration alone cannot exclude them.
4. Backward-slice the exact index arguments through all five whole callers and their relevant producer paths. Distinguish BA BP+0E, DB BP+10, low-byte extension, scratch DS:6B33 and DS:713C selector. Derive allowed indices from comparisons and source domains, not four-byte scaling or table size. Keep index0, holes, cancellation/error branches and externally mutable character fields explicit. If a bound cannot be proven, return that exact missing producer/branch and keep the contract unresolved.
5. Produce a small per-site proof matrix: initialized pointer assignments; DS/owner; initialization dominance; replacement/copy coverage; legal indices and holes; resolved target bodies; unresolved obligations. Mark a contract source-proven only when every obligation has a witness. Do not modify scanner target maps or native dispatch in this task.

## REA corroboration and limits

Use existing verified MZ-loader/REA mechanics for fixed whole-function dossiers on BA,65,61,A8,DB. Sol may add narrowly named fixed experiments and prepare per-overlay images with actual original body, descriptor, relocation and deterministic artifact pins, as the existing Add/character-files branches do. Luna runs REA. Seeds use0x30000 plus that image's body offset, e.g. BA358ED,65338EA and DB301A8; names must include owner so reused linear offsets cannot be confused. Obtain actual image hashes from original-derived preparation before execution authorization; never invent pins.

REA output corroborates original instructions/dataflow; decompiler guesses do not establish bounds or turn data into code. The decoded original bytes and relocation/procedure maps remain authoritative. Prefer these eight whole-function dossiers and precise initializer callers over another broad raw byte search. If reaching additional whole functions exceeds the analysis cap, preserve pending roots and stop with an incomplete result; do not prune failure paths.

## Discriminating controls and next decision

Luna-only pure controls must reject wrong overlay namespace/body, missing or changed initializer store half/relocation, changed pointer immediate or public-stub binding, invented contiguous entry across a hole, index-bound assertion without a witness, reordered/absent initialization dependency, and a supplied unresolved DS/replacement path falsely marked complete. Keep real negative assessor causes checked. Deterministic repeated outputs, input pins and explicit omissions are required.

Budget for this stage is **zero newly admitted guest bytes**. Preserve all six far guards and A46:02F3 near guard; no fallback to arbitrary admitted targets. After the actual proof dossier, Astra reviews any proposed per-callsite contracts. Only then may a separate whole View inventory follow their complete target set and recalculate deduplicated instructions/bytes/relocations/protection against the current baseline. Current2254-byte headroom neither guarantees fit nor authorizes excluding a target. No View key, native generation or production admission is authorized here.
