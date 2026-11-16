# CoK Batch02 and animation frame-zero prompt provenance

The [receipt](cok-restyle-batch02-provenance-v1.json) links the complete prompts for Batch02
items 001, 002, 003, 005, 007, 009, 015, 026, 029, 036, 041, 042 and 043, and for the separate
frame-zero outputs of the PIC1:23 and PIC2:24 animation hubs. Batch02 covers 14 existing
Restyle records across 20 distinct source IDs. The two hub outputs add two separate Restyle
records, keeping their alternative Batch02 outputs visible. Item 043 links the raw generation
in both existing registry records; its differently hashed runtime derivative stays separate.

For each record, the tool checks the PNG bytes against the registry and gallery pair, verifies
that the declared crop in the padded input equals the canonical source at native size enlarged
with nearest-neighbor, and hashes the actual input, full prompt and output separately.
It verifies the prompt's exact `[SAVE AS]` path. The recorded crop hash covers decoded RGBA
bytes, while the input hash covers the entire file including padding. This records the supplied
input, requested output, and existing artwork; it does not establish runtime admission,
source-game playback semantics, or how the service performed the generation.

Run `python tools/cok_batch02_prompt_lineage.py` to revalidate the 42,611-byte receipt against
the user-owned local Batch02 and hub directories and the retained inventory snapshot. Use
`--goldbox-root` and `--inventory` for alternate local paths. The snapshot is read-only evidence
for existing IDs and source PNGs; it is not a release candidate. The default check rejects
receipt drift. Use `--write` only for an intentional reviewed regeneration.

The metadata packager adds the receipt references to the exact gallery cards and their hub
`r0` frame records without changing ledger aliases or their fingerprints. The before/after
and source catalog views show the actual input hash and the crop relationship. The source
catalog checks each current Restyle record and source ID separately. No source IDs, outputs,
review or runtime admission changed.

Verification: all 15 records rederived from local files; the metadata-only packager produced
2,542 card pairs and attached all 15 references to their existing card IDs, with
unchanged alias metadata for those cards and zero staged PNGs. Forty-six focused Node tests, three
Python tests and the web typecheck passed. Browser acceptance and production publication remain
unverified under the existing release holds.
