# Secret ECL RANDOM state compatibility plan

Task247 planning checkpoint, 2026-10-11, against released `681c9d9f`.
This inspected contract now has complete original handler/helper proof and
actual old-native RED preceding implementation. Native and practical runtime
verification pass; full source-bound release gates remain pending. The separate
`secret-random-contract.md` records arithmetic and runtime evidence. The original
audit itself changed no native source; implementation occurred after its proof
and old-native prerequisites were satisfied.

## Required state semantics

Retain Secret long-frame bit2 (`4`) and reserve bit3 (`8`) for the proved new
Secret ECL RANDOM algorithm. Require both bits on every new Secret effect,
including effects produced without a random draw. Closed Secret flags become
`12` or `13`; bit0 denotes resumable state. The exact predicate is
`(flags & 0xFFFE) == 12`; pending menu/combat additionally requires bit0.
Testing merely whether `flags & 12` is nonzero is insufficient: old `4/5`
and RNG-only `8/9` would pass.

Source-selected generic states retain `0/1`. Neither source GBID nor unchanged
effect length establishes RNG compatibility. Reject incompatible saved state;
do not relabel old flags, migrate only the seed, or silently choose a new
algorithm for an old seed stream. Preserve all valid semantic bits through
menu edits, private capacity replay and durable continuation.

## Inspected consumers and timing

| Entry | Required change | Admission boundary |
|---|---|---|
| CCECL `validate_resume_dialect`, `/R` | Expected semantic mask `12` for explicit Secret, `0` otherwise; reject unknown bits. Move the whole existing GBRS magic/dialect/state-present prefix before answer dispatch. | After reading/closing the effect and checking its exact format; before answer open/read and VM restore. Current checks follow answer reads. Moving only the dialect call leaves pending12 and malformed magic able to reach answer readers. |
| CCECL `/P` (`read_persistent_state`) and `write_effects` | Reuse the same predicate without an unconditional bit0 requirement for ordinary prior-state import; producer ORs `12`. | Prior-state check already precedes VM import. |
| CCNEXT `kv_effect` | Closed `12/13` across accepted Secret v9, v15 and v16, including INITIAL/current/READY/cold banks. | Before pending answer validation, production, settlement and durable transition. |
| CCFLOW `read_effect` / `validate_v16_identity` | Closed v16 predicate plus conditional Secret check on legacy authority paths. Preserve bits during replay. | Before append, private replay and sidecar publication; initial cleanup and first child execution already happened. |
| CCMENU `validate_effect` / `who_validate_state` | Pending v16 requires exactly `13`; conditional legacy Secret guard. | Before UI/auto choice, paused-state edits and token creation. |
| CCFP `validate_ack_effect` / `who_validate_state` | Pending v16 requires exactly `13`; conditional legacy Secret guard in answer route. | Before answer presentation or writes; earlier input/sidecar reads are allowed. |
| GBBOOT `boot_validate_v16` | Closed `12/13`, retaining explicit Secret profile and suffix checks. | Before host effect application; fresh child execution, binding and diagnostics may already have written files. Cold Secret authority also passes CCNEXT. |
| CCEFX `validate_v16_dump` | Closed v16 predicate; retain historical generic diagnostics. | Before decoding accepted v16; requested diagnostic output is opened/truncated earlier, so rejection is not a no-write guarantee for diagnostics. |
| Python `secret_continuation.check_effect` | Independent model requires `(flags & ~1) == 12`, with pending bit0. | Before modeled Secret authority acceptance; model tests alone do not establish native token timing. |

CoK/DoK camp, checkpoint, mutation and shared combat-RNG protocols remain
unchanged. Their title gates or exact `0/1` predicates already exclude Secret.
DQK's natural-handler reader also rejects Secret before open. CCHOST standalone
HP/result transactions do not read GBRS; do not add unrelated semantics there.

Legacy CCFLOW/CCMENU/CCFP authority paths can otherwise accept old Secret
markers while bypassing the v16 predicate. Admit only closed generic `0/1`
or closed current Secret `12/13` before replay/token publication; no current
producer emits other generic flags. Secret pending status2/3 requires13.
CCFP's legacy answer path lacks an independent state-present check, so its
Secret-marked pending guard must require exactly13. CCFLOW capacity status4
can legitimately carry12: the producer does not mark that halt diagnostic
resumable, and the existing private replay builder sets bit0 without changing
the semantic pair. Retain that distinct capacity behavior.
These title-agnostic frontends cannot identify a
record with both semantic bits stripped; source-selected CCECL/CCNEXT provides
the final identity rejection. Do not claim the conditional guard proves title
ownership, or that generic GBBOOT header admission replaces durable CCNEXT
validation.

## Budget and implementation constraints

Measured CCECL baseline: 77 bytes free, required floor64, at most13 bytes of
growth. Current written `is_gen2` values are0,1,2. Replacing
`and al,2; add al,al` with `and al,2; neg al; and al,12` computes the expected
mask0/12 while retaining AH and other GPR behavior, at two extra bytes.
Then XOR/test both semantic bits and reject unknown bits with mask `0xFFF2`.
Relocating the whole existing `/R` GBRS validation prefix avoids duplication.
All ordinary successful `/R` paths already require bit0; status dispatch reloads
AX and its flags afterwards. CoK CHECK/MUTATE remains on its separate `ir_read`
path. Actual assembler branch relaxation and resident size must still be measured.

Secret-only validators can use `and ax,0xFFFE; cmp ax,12; jne bad` instead of
two separate masked-bit tests. Pending exact5->13 and producer OR4->12 are
constant changes. Original-proof-dependent RNG mode2 must preserve mode1
CoK/DoK and restrict the existing Borland `roll_d6` branch to mode1, leaving
Secret SURPRISE/combat behavior outside this opcode08 change.
Do not lower floors or the14500 packed/16000 decoded acceptance limits.

## Discriminating evidence

Test each relevant authority with valid12/13, old4/5, RNG-only8/9,
missing-both0/1 on known Secret, future14/15/28/29 and high-bit0x800D.
Pending12 must fail the state-present requirement, including legacy CCFP and
CCFLOW paths. Private capacity12 remains a positive control and private replay
must carry13. Reject generic unknown/future2/3/0x8001 instead of bypassing the
guard when both semantic bits are clear. Retain positive generic
legacy0/1 and prove exact CoK0/1 protocols reject new12/13.

Instrument `/R` rejection, including pending12 and malformed GBRS magic, to
prove a preexisting valid answer token is not opened/read; a missing token alone
cannot establish ordering. `/P` must reject
before RNG/memory import. Check paused files, tokens, descriptors, banks,
receipts and consumed-result markers at durable boundaries. CCFLOW tests must
permit its documented cleanup/first-child actions while checking that rejected
semantics create no new replay/stream publication. CCEFX diagnostics have the
separate output-truncation exception described above.

Luna owns actual frozen old/new DOSBox-X GameLink evidence: results and full
next seeds, range/width controls, consecutive draws/wrap, yield between draws,
true cold/reference/repeat/conflict, and saturated narration followed by RANDOM.
Compiled/model/source tests and runtime evidence must agree. Semantic flags
do not substitute for complete original arithmetic proof. Preserve all failed
and superseded evidence and report the exact rejection boundary.

Astra's detailed inspected inventory is preserved externally at
`C:\temp\GoldBox-task247-gbrs-compatibility-audit-20261011.md`; the overall
plan is `C:\temp\GoldBox-task247-plan-20261011.md`. Required release gates
remain all26 targets, source-bound44/46 sweeps, full boot smoke, full corpus,
app gates, documentation, commit/push, and deployment if web source changes.
