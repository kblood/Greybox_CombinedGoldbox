# Audit relocation v4 source review — execution remains held

2026-10-15. Astra source/metadata/hash review only. No candidate import,
decoder, control, compiler or app was executed. Defender investigation hold
remains effective; source findings below do not release it.

## Identity and implementation findings

Candidate `build/cok-recomp/dos-audit-production-integration-sol-20261015-v4`:
freeze `3dc97f14ba28cd834e622f2edc2055f64c4d36537a33c3d288392de5f419d510`;
policy `6e2b27c3f09b636272a216e3a231852f12c081de544b1ca8ad1fb3f0444e1d41`.
Independent reads found57 frozen files with zero size/hash mismatches,
39 owned overlay files and268 allowlist entries. All22 unaffected generated
raw pins match v3. Seven-row staging ancestry retains SHA
`4eca740d21502cab30c4c437102a4262675d16b968ab24c923cc364644a78439`.

Python and Rust implementations independently enforce two named files, two
ordered output fields/tokens each, exact historical full-byte projection
size/hash, duplicate-key rejection, original GEO source/map pins, exact fresh
direct children and lexical reparse/traversal checks. Neither rewrites the
files nor opens historical generated directories. Rust receives the original
lexical environment paths even though other build roots were canonicalized;
its check runs before the first cc::Build.

Actual roster entries remain raw size/hash for all24 generated inputs. Explicit
refresh saves actual current manifest identity and a separate relocation
receipt; ancestry retains d844. Replay config pins prebuild identities and
allowlist independently, rechecks actual roster/policy/current manifest and
recomputes relocation. Historical extraction receipt remains unchanged with
additive lineage metadata. This implements the intended consumer separation.

These trust anchors still depend on the independently reviewed source freeze,
policy and concrete config: do not mutate policy or refresh pins to accommodate
a failed generated payload. No new guest bytes or service semantics are added.

## Required control repairs before an execution-ready freeze

1. **Discriminating native negative roster.** HANDOFF-v4's later build mutation
   commands use PowerShell ConvertTo-Json for the forged roster and explicitly
   tolerate noncanonical formatting. If relocation were accidentally bypassed,
   the build could still fail the unrelated canonical-roster check. Use a
   correctly canonical forged actual-raw roster (standard-library JSON only,
   exactly sort_keys=True, separators=(',',':'), ensure_ascii=False, trailing
   LF). Do not call candidate refresh/collect to bless the mutation. Change
   only the intended metadata field and corresponding raw row; preserve all
   other roster/source/policy inputs. Require the specific relocation rejection
   before native compilation, and restore original bytes in finally. Prefer a
   reviewed file-based negative harness with exact source pins; do not plan a
   new ad hoc long inline command while investigating Defender.
2. **Same-policy portability positive.** Python and Rust two-root controls
   currently construct a new game directory and new policy/historical digest
   for each fixture. They demonstrate two independent local fixtures, not two
   output roots under one unchanged trusted policy. Add a second generated
   root using the same game path/source, identical22 payloads, identical policy
   bytes and only the four permitted output token changes. Both must pass with
   distinct actual raw hashes and identical historical projection identities.
   Supplying the wrong reviewed generated/owned root must fail. Do not compute
   a new policy for the second case.
3. **Truthful reparse control.** Rust `lexical_symlink_rejected` silently returns
   when Windows symlink creation fails, so cargo reports that test passed.
   Record explicit skip/reason and withhold reparse coverage, or create an
   actual owned junction/symlink fixture through an approved setup. Never
   claim four substantive Rust controls passed from a silent early return.
   Python already uses skipTest; its output must likewise disclose any skip.
4. **Correct omitted-input mutant.** In test_dos_audit_provenance.py,
   `omitgenerated` uses pop(6), which now removes a repository helper. Select
   an actual root=generated entry explicitly and assert its identity before
   removing it. Keep the separate required-repository omission control.

These are concrete evidence/control defects; no production algorithm change
was identified as necessary by this review. Sol should make a fresh reviewed
freeze with the smallest control/handoff delta, preserving v4 evidence.

## Separate future gates

After repairs and source review, Root must separately resolve/release the
Defender execution hold before any test. Thereafter: authenticate frozen
sources -> ancestry predicates -> fresh stage-C -> Python relocation/roster,
trusted verifier and replay-gate controls. Preserve actual process/exit/raw
stream receipts and every skip/failure; stop on access denial or security
interference and investigate, without splitting/rewriting/retrying to bypass it.

Rust helper compilation is a separate authorization. Its generated offline
lockfile must be reviewed/pinned before --locked tests; do not describe it as
already part of the source freeze. Then separately gate PrepareOnly and check
22 raw pins, two exact relocation projections, actual raw roster/current
manifest identities and unchanged guest C. Later actual build.rs negatives,
focused/full/release and exact OFF/ON route gates remain required.

Stage-A/B and their failures remain immutable. No PrepareOnly, Cargo/native
application, source promotion or accepted-binary/runtime claim follows from
this source review. Source approval is not a Microsoft false-positive verdict.
