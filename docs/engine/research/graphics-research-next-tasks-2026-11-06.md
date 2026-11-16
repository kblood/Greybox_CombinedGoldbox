# Graphics identity and documentation: next tasks

Planning baseline: 2026-11-06. This is a proposed research sequence following
[repository recovery](repository-recovery-2026-11-06.md) and the
[initial documentation audit](image-documentation-coverage-2026-11-06.md).
The user requested planning and documentation updates; this plan does not start
implementation or resume paused runtime, build, staging or deployment work.

**Subsequent bounded authorization — 2026-11-06:** the user approved a storage
pilot. The [PIC1 experiment](../data/graphics/README.md) now provides normalized
JSON, a rebuildable SQLite index and exact compatibility reconstruction. This
does not make the shards authoritative or implement the research tasks below.

## Intended result

Research every Gold Box title and its platform/release variants, with explicit
missing holdings and unresolved editions. Give every original drawable source
occurrence a stable, edition-qualified identity and evidence for its appearance,
selectors, game use, composition and counterparts. Preserve generated-image
lineage separately. Use these findings to validate the browser Greybox and the
native DOS ASM Greybox from the same documented contracts.

Follow the existing [identity architecture](graphics-identity-and-restyle-browser-architecture-2026-10-31.md).
Do not replace existing IDs wholesale. Equal pixels establish an appearance
relationship; they do not establish the same source occurrence, subject, game
use or edition. A generated replacement may serve several originals and an
original may have several replacement candidates.

## Recommended sequence

### 1. Account for every file in the existing pack

Extend the metadata-only audit to runtime manifests, held/external comparison
records and available ledgers. Start with the 530 PNG paths unmatched by the
initial manifest-path join. Include all titles represented in the mixed pack.

Deliver a per-file crosswalk: relative path, file role, declared hash, title,
platform/edition, comparison references, source IDs, evidence references and
explicit unresolved reasons. Permit multiple roles and source IDs. Distinguish
declared hashes from independently checked bytes, and missing evidence from
ambiguous evidence. Never guess a source join from output similarity.

Done when every pack PNG has an accounting row, even if its identity remains
unresolved, and a reproducible report explains every unmatched/ambiguous join.
Use synthetic controls for duplicate references, conflicting hashes and absent
metadata. This task can begin without reading image pixels.

### 2. Establish the title/platform/edition source matrix

Reconcile holdings and platform census against CoK and DoK source inventories.
Define how release identity, disk occurrence, installation and extraction
provenance differ. Record archive hashes, edition evidence and missing holdings;
a folder named disk1 or DOS/GOG alone is not a complete release identity.

Deliver a versioned source-set manifest and a documented policy for edition
qualification. Assess existing IDs before any schema or ID migration; preserve
old bookmarks and references with explicit aliases if a change is needed.

Done when the known title/platform combinations have an evidence-backed status
and the existing CoK/DoK sets have precise provenance or a named uncertainty.
This is a coverage map, not a claim that every edition has been acquired.

### 3. Complete one source-to-use research slice

Recommended pilot: CoK DOS PIC1 and its existing ECL consumer evidence. Expand
to monster portraits after the picture-selection method is demonstrated.
Inventory all stored children in the selected bank, then trace both referenced
and apparently unreferenced assets. Separate static references, reachable
routes, observed presentation and unresolved selectors.

Deliver exact IDs, visible descriptions, subject confidence, caller/selector,
route conditions, placement/composition and frame-role evidence. Preserve
unknowns. Compare corresponding Amiga sources only where edition and locator
evidence supports a join. Static work can proceed separately from later runtime
verification, which remains paused.

Done when every child in the bounded bank has an evidence record or a precise
research question, with reproducible checks and no inferred runtime verdicts.
Use that slice as the template for other banks and games.

### 4. Recover generation and prompt provenance

Search documented local prompt files and generation ledgers by exact source and
output references. Record prompt text or an explicit unavailable status, prompt
hash, reference inputs, batch/tool settings where known, raw output and reviewed
candidate. Keep source observations separate from generated-output descriptions.

Done when each selected Restyle record has recovered lineage or a specific
missing-evidence reason. Start with replacements tied to the pilot slice and
existing runtime mappings, then expand; sparse fields in the initial manifests
do not prove the external evidence is absent. Do not regenerate artwork merely
to fill a documentation gap.

### 5. Audit description quality and frame meaning

First check existing description evidence and dataset consistency without
decoding images. Plan a later stratified visual review across tiles, glyphs,
portraits, scenes and atlas cells, including equal-pixel description transfers.
Record which observations are human-reviewed, model-assisted or transferred.
Image inspection is a separate continuation from the metadata-only audit.

Investigate ordered frame groups as distance views, timed animation, poses or
layers using selectors and source evidence. Stored order alone proves no
playback contract. Never add a Play control for an unknown group.

Done when the sampled review reports named defects, its sample selection and
limits, and repairs are tied to exact source evidence. Do not rewrite thousands
of descriptions before testing whether the annotation method is useful.

### 6. Turn proven findings into shared engine contracts

For each researched family, define selection, decode, palette/transparency,
composition and frame behavior with small discriminating fixtures. Have browser
and native ASM implementations consume the same specification and expected
results through their own adapters. An offline reference harness should compare
pixel/index output and selection traces, not depend solely on screenshots.

Separate exact original-data reproduction from replacement-art presentation.
Admit replacement art only for proven mappings. Builds and runtime checks need
the existing holds reconciled before execution; neither engine is currently
being resumed by this plan.

Done per family when both implementations have evidence against the same
source-qualified contract, with unsupported cases and differences disclosed.

## Ideas worth prototyping after the research foundations

- An asset evidence page: exact source, preview, observed appearance, game
  references, counterpart candidates, replacement candidates and unresolved
  questions, all with navigable evidence.
- A research queue grouped by uncertainty: missing source, ambiguous locator,
  unknown consumer, unknown frame meaning, missing prompt, or conflicting prose.
  Prioritize questions that unlock engine behavior over annotation volume.
- A source-use graph connecting ECL/native callers to selectors, asset IDs and
  rendered compositions; retain route conditions on edges.
- An edition comparison view that shows exact-pixel matches and differences
  while preserving distinct source identities and provenance confidence.
- A campaign evidence tour: a few representative routes linking a visible scene
  to source selection, composition and both engines' eventual verification.

These are options, not five new simultaneous UI projects. Build the crosswalk
and one complete research slice before choosing a new interface.

## Work discipline and first three slices

Keep all tracks in their existing folders on master. Make each implemented slice
a focused reviewed commit with its documentation and relevant verification,
then push under the applicable authorization. Preserve local game/image data
outside Git. Use existing registries and tools before introducing another store.

The first three implementation slices, once resumed, should be:

1. Metadata-only classification of the 530 previously unmatched pack paths.
2. Source-set/edition reconciliation for existing CoK and DoK records.
3. A bounded CoK DOS PIC1 source-to-consumer evidence report.

Report separate denominators for files, source occurrences, unique appearances,
comparisons, consumers and admitted runtime mappings. Measure reproducibility
and evidence quality; a high annotation count is not completion.
