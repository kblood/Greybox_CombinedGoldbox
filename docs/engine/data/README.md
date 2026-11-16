# CoK Restyle metadata inputs

The [graphics metadata storage pilot](graphics/README.md) contains a separate,
normalized CoK DOS PIC1 snapshot and instructions for rebuilding its SQLite
research index and compatibility export. The legacy registry remains authoritative
during that experiment; the two Restyle metadata inputs below are unchanged.

These two JSON files are the hash-pinned, non-image metadata inputs used to connect Restyle
inventory aliases and curated comparison cards to canonical source-graphics IDs:

- `cok-restyle-inventory-v1.json` — SHA-256
  `d5fc9c9a49680f9a7825c2394126887a315105d4cf2686622706fbf30c8669c9`.
- `cok-curated-restyle-manifest-v1.json` — SHA-256
  `1cb3e1eca86d42dc53bfbfaebe8949d9e89bca1b3fd48bca4ecb43fe95cb1ee2`.

The bytes are preserved from the historical `dist-app-cok57/restyle/` snapshot. Existing
registry gallery references and alias-sidecar paths intentionally retain that historical path as
provenance; tools read the source-owned copies here. The manifests contain no machine-absolute
paths and include no PNG data.

Image bytes remain user-supplied local inputs. Alias-sidecar regeneration requires explicit
`--inventory-images-dir` and `--curated-images-dir` arguments and checks each expected SHA-256.
Neither this metadata directory nor a production candidate substitutes for those image files.
