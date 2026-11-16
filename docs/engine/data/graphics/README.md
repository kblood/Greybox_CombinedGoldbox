# Graphics metadata storage pilot

The user authorized a bounded PIC1 storage experiment on 2026-11-06. The six JSON
files in `cok/dos-ega/pic1/` are a lossless normalized snapshot of the CoK DOS-EGA
PIC1 slice, extracted from the existing registry. They contain metadata only.
No game archive, image, executable or runtime output is included.

## Ownership during the experiment

The existing `research/cok-graphics-identity-registry-v1.json` remains authoritative.
Existing importers, the browser and both engines still use their existing inputs.
Do not independently edit both stores. For now, update the legacy source through
its existing process, then reconcile/regenerate the pilot in a fresh directory
and review its changes. `check` deliberately rejects a changed baseline registry.
Promoting shards to authoritative data requires an explicit later cutover of
writers and readers; this experiment does not make that cutover.

The proposed eventual flow is authoritative Git-owned shards, a disposable
SQLite query index, and generated consumer exports. SQLite is not checked in or
edited independently. Engine-specific compact exports remain future work; the
current export is a scoped registry-v1 compatibility document, not a complete
registry and not a runtime-admission manifest.

## File roles

- `manifest.json`: format, selection, baseline canonical hashes, and external
  asset IDs referenced from this shard. External IDs are references, not copies
  of their assets or claims that they have been researched here.
- `archives.json`: one shared archive record with its existing source-set labels
  and pin. This factors out repetition without upgrading edition confidence.
- `assets.json`: original stable IDs, locators, status and remaining per-source
  fields, with archive and appearance references and per-file decoded metadata.
- `appearances.json`: shared dimensions and pixel hashes. The same appearance
  can have distinct original IDs and distinct PNG file hashes. These hashes are
  inherited assertions; extraction does not decode or rehash image pixels.
- `annotations.json`: description, evidence and consumer records per source ID.
  Observations are deliberately not merged merely because pixels match.
- `relationships.json`: complete original frame groups, Restyle candidates,
  cross-version links and appearance sets touching the selected assets. Outside
  endpoints stay explicit; multi-source candidates are never truncated to PIC1.

Shared archive/appearance keys are deterministic content hashes of their metadata;
they are internal reference keys, not replacements for stable original asset IDs.
Historical paths and prose remain verbatim for lossless compatibility. This pilot
does not yet extract machine-specific references embedded in evidence into local
configuration. A later path migration must distinguish historical citations from
locations tools should open and preserve recoverable mappings.

## Reproduction

From the repository root:

```powershell
python -B tools/graphics_metadata_pilot.py check --source docs/engine/data/graphics/cok/dos-ega/pic1 --registry docs/engine/research/cok-graphics-identity-registry-v1.json
python -B tools/test_graphics_metadata_pilot.py

# Outputs must be new paths; choose an existing local temporary parent directory.
python -B tools/graphics_metadata_pilot.py index --source docs/engine/data/graphics/cok/dos-ega/pic1 --out "$env:TEMP/goldbox-pic1-index.sqlite"
python -B tools/graphics_metadata_pilot.py export --source docs/engine/data/graphics/cok/dos-ega/pic1 --out "$env:TEMP/goldbox-pic1-export.json"

# Regenerate into a fresh directory, never overwrite the checked-in shard in place.
python -B tools/graphics_metadata_pilot.py extract --registry docs/engine/research/cok-graphics-identity-registry-v1.json --out "$env:TEMP/goldbox-pic1-fresh"
```

The index records a canonical hash of its complete JSON input. It has foreign
keys, searchable pixel hashes and consumer statuses, indexed relationship
endpoints and original JSON payloads for detail inspection. Source identities
are classified as local or external. Build failure leaves no published index;
existing output files are refused. JSON extraction writes only a new directory;
an interrupted extraction may leave that new directory partial. It is not a
transaction spanning all JSON files.

Example research query, returning sources with no consumer assertion beyond
unknown (also includes sources with no consumer records):

```sql
SELECT a.id
FROM assets AS a
WHERE NOT EXISTS (
  SELECT 1 FROM consumers AS c
  WHERE c.asset_id = a.id AND c.status <> 'unknown'
)
ORDER BY a.id;
```

## Verified result and limits — 2026-11-06

The shard reconstructs 31 source assets, three frame groups, 30 Restyle records
and 30 cross-version links, with 20 external asset references. It factors one
archive and 26 appearances. Both PIC1 block-34 entry-qualified IDs survive.
Compatibility is exact JSON-value equality, including array order and all
evidence; formatting and JSON object-key order are not part of that claim.

A temporary real-data index/export run passed compatibility reconstruction,
SQLite integrity and foreign-key checks. The index contains 43 consumer records
and 113 relationship-to-asset joins. Fourteen synthetic tests cover lossless
reconstruction, shared pixels with distinct identities, duplicate IDs, broken
archive/appearance references, missing annotations, external endpoints, absent
and null decoded fields, group membership, exclusive outputs and cleanup after
an injected mid-build failure. The test caught a Windows open-connection cleanup
bug; the builder now explicitly closes SQLite before publishing/cleanup.
Changed baseline metadata and altered evidence also fail the compatibility check.

Full `pnpm test:corpus` was not run: `python -m pytest --version` reports
`No module named pytest`; the full suite also includes execution outside this
metadata-only slice. No archives/images, game runtime, browser, application
build or deployment were opened/run. Existing source evidence was preserved,
not independently reverified. The pilot checks its own normalized references and
baseline equality; it does not replace the full existing registry schema and
evidence validators or constitute a production storage migration.

Next: review this representation on another bounded archive, decide whether
per-source annotations need further subdivision, specify local path bindings,
and define a single-writer cutover before adopting authoritative shards.
