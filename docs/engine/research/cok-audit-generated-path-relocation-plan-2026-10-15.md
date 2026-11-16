# Audit fresh generation: exact GEO path relocation repair

2026-10-15. Astra source/read-only metadata diagnosis. No candidate import,
decoder, generation, tests, compilation or application executed. Preserve v3
freeze, failed PrepareOnly PID51960/exit1, stage-B and its receipts. Implement
only in a new Sol v4 candidate, then use fresh stage-C after source review.

## Independently established difference

Historical root:
`build/cok-recomp/world-after-cold-bootstrap-sol-20261015-a-v3/luna-source-controls-luna-v3-20261015-a/checkout-one/build/generated`.
Fresh root:
`build/cok-recomp/staging/dos-audit-production-integration-luna-20261015-b/build/audit-world-generated`.

Recursive JSON comparison found exactly these differences, with no added or
removed fields, type changes or array-length changes:

| File | JSON paths | Old/fresh raw bytes |
| --- | --- | --- |
| geo-provenance.json | /records/0/output, /records/1/output | 1593 /1533 |
| manifest.json | /geo/0/output, /geo/1/output | 7786144 /7786084 |

The values are absolute paths to `geo32.bin` and `geo34.bin` respectively,
under the corresponding root. Source GEO1.DAX path, record ordering, all
source/compressed/raw/map hashes, sizes, dimensions and all other metadata
are identical. Each full escaped JSON string token occurs exactly once per
file. Replacing only those two fresh tokens by the historical tokens restores
the **entire historical raw bytes**, including formatting, exactly.

Historical GEO SHA-256:
`4649a2700df595d62283d637c5d5290cece5a4c2421762ce0424859b69ef4200`;
fresh GEO:
`60b91284a4033f876879ed19b3edad9dfadafeea3b019835e65dcd3d12876504`.
Historical manifest:
`d8440aeecdd81c87f242f96f35a763330271781ce62f0ab175469e674a0a9114`;
fresh manifest:
`405a3312f041b9251f0607bcdca7ae744bab8fb1fcee2cb756cfb0ce52bcaba2`.
All22 other generated inputs independently match their fixed raw size/hash.
In particular lifted C remains
`d806268d574996cb0f534d40865a4af7dfcc4bcaee9f2d2b375a80fe3e4eab01`.

Source cause: `prepare_geo.py::prepare` writes `str(path.resolve())` into
each record and writes those records to geo-provenance.json. `lift.py` assigns
the same returned records to `manifest['geo']`. There is no additional
embedded changed digest in either file: full recursive and raw-token checks
establish that here. Stage-B did not reach roster/expected-identity creation
or native build. A future fresh manifest raw hash necessarily differs again
when its output root differs.

## Chosen narrow policy

Keep the generator and actual output files truthful and unchanged. Add a
source-frozen, two-file relocation policy to provenance checking. Do not
rewrite generated paths to nonexistent historical files and do not replace
fixed hashes with whatever the new generator emits. This policy needs only
the historical raw size/hash and four exact path tokens/JSON locations;
runtime verification must not depend on opening the ignored historical tree.

1. Preserve the22 fixed generated raw pins and every guest/C/binary input pin.
   Declare exactly these two metadata files as relocation-checked exceptions,
   each retaining the historical raw size/hash and exact old absolute root.
   No wildcard, arbitrary JSON field mask or generic canonicalization.
2. Bind the fresh generated root from the explicitly reviewed build/config
   root, not from a manifest field. Validate lexical absolute owned-stage
   containment and every existing path component for reparse/symlink escape
   before resolution. Require exact direct children geo32.bin/geo34.bin;
   reject siblings, parent traversal, alternate roots and path aliases.
   Require their current raw bytes to match the already fixed generated pins.
3. Strictly parse JSON with duplicate-key rejection. Require the exact two
   locations to contain the expected fresh full paths in order and the source
   GEO1.DAX path to match the explicitly reviewed game root/pin. Confirm each
   corresponding complete escaped JSON string token occurs exactly once.
4. In memory only, substitute those complete tokens with frozen historical
   tokens. Require resulting raw length/hash to equal the historical raw pin.
   Do not reserialize, sort keys, remove fields, trim, change EOLs or normalize
   unrelated paths. This authenticates every other byte, including extra or
   dropped fields. Cross-check manifest.geo equals GEO records. Preserve the
   actual raw input bytes and their actual raw hashes in the compiled roster.
5. Record policy identity, explicit old/fresh roots, four field mappings,
   actual raw size/hash and verified historical projection size/hash in a
   pre-build receipt. Name the latter relocation ancestry, never the actual
   generated manifest identity. Checking never refreshes metadata.

## Exact affected consumers and lineage

- `audit-provenance-inputs.json`: retain exact24 inputs and22 raw fixed pins;
  add narrowly typed metadata policy entries. Keep historical manifest in
  ancestry; do not relabel it as the current raw manifest.
- `prepare_dos_audit_provenance.py`: perform the policy above before refresh
  or check can succeed. Roster entries for all24 files remain actual RAW
  length/SHA. Explicit refresh emits independently saved current identities,
  including actual generated-manifest SHA plus reviewed relocation-policy
  identity/ancestry. Original guest source hashes remain unchanged.
- `build.rs`: independently enforce the same two exceptions and22 raw pins
  before any native compilation, while still requiring actual RAW roster
  equality for all inputs. Do not trust a Python success flag/receipt instead
  of rechecking current files. Share a small reviewed Rust helper if necessary;
  include every new helper/policy/test input in the explicit source roster.
- `headless-cold-add/replay_gate.py`, its reviewed config template and controls:
  the current equality of config.original_manifest_sha256 with historical
  baseline d844 is no longer a raw-identity invariant. Retain that historical
  value as ancestry. Require current config raw hash to match the independently
  saved pre-build identity AND the actual file, and independently validate the
  relocation policy against the fixed baseline before launch. Do not derive
  both expected and actual identities from the unchecked runtime manifest.
  Keep lifted-C equality and route expectations unchanged. Update extraction
  lineage explicitly if its schema labels the baseline raw identity; preserve
  the historical source receipt rather than overwriting its claim.

The DOS audit `source` identities refer to original guest sources, not the
location-dependent manifest; preserve them. The audit-source roster digest
will change legitimately and must bind the freshly compiled host sources and
actual generated files. New executable and validator identities require fresh
build receipts; accepted old binary/runtime evidence does not transfer.
Review the exact consumer diff and schema migrations before any execution.

## Discriminating controls and sequencing

Pure controls must invoke the actual relocation validator: two distinct fresh
root spellings should pass only with their exact matching trusted root;
historical root is not a fallback. Reject map-byte/hash, compressed metadata,
source hash/path, block ID/order, size/dimension, guest instruction/relocation
and arbitrary manifest payload mutations. Reject added/dropped keys or rows,
duplicate JSON keys, repeated/missing string tokens, changed formatting/EOL,
swapped32/34 paths, wrong/sibling root, traversal and reparse components.
Reject a forged current raw hash and independently saved identity, and any
attempt to use the relocation identity as the current raw hash. Mutate one
of the22 fixed inputs to ensure those retain strict raw enforcement.

Add corresponding actual Rust predicate controls and later build.rs negative
controls proving rejection before native C compilation. A mocked hash-shape
check is insufficient. Preserve original source-roster omission/self-exclusion
controls and the v3 seven-file staging ancestry controls unchanged.

Sequence: Sol new v4 source-only freeze and exact owned-file delta -> Astra
review -> Luna pure relocation/staging/provenance/gate controls in fresh outputs
-> fresh stage-C -> separately reviewed PrepareOnly -> raw22 pins plus exact
two-file relocation proof and current identities -> Root review -> later
Rust/native gates. Never salvage/overwrite failed stage-B. View diagnostics
may use independent outputs, but serialize shared native builds. No audit
Cargo/native application or production promotion is authorized by this plan.

Guest admission remains35,740 instructions/91,590 bytes with zero new guest
bytes and identical lifted C. This fixes provenance portability only; it does
not establish a clean reproducible build until the actual fresh gates pass.
