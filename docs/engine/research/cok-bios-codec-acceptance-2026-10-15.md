# Isolated BIOS evidence codec: acceptance, 2026-10-15

Astra reviewed the pure, unreferenced module and its controls. Luna ran the
standalone crate with Rust/Cargo 1.99.0: **11 tests passed, no failures**.
The main application and its native build script were not invoked.

Read-only replay of the accepted helper GUI's complete ledger verified all
59,617 expanded events, exact JSON objects, order and global indices.
Canonical expanded bytes:21,866,664; encoded bytes:2,171,016 across10,717
records (9.93% of expanded size). The50,661 eligible empty AH=01 events are
codec-classified, not an independent eligibility oracle.

Expanded SHA-256:
`8da3db18632efb2c01b0af07237a2c0a195121d5f1066f2c7f40ea14a5c864c3`.
Encoded SHA-256:
`9f43e260e9b49536e2fcf7a23e21e8e39e05f8446161d2412fa5ec4c4d8e6d9d`.
All five frozen sources and input-ledger hashes matched before/after. Cargo's
standalone lockfile is retained. Raw evidence:
`build/cok-recomp/bios-journal-codec-luna-20261015-a/` (ignored).

Tests cover caps, mutations of manifest counts and AH=00 payload, overflow,
flush failure, schema/line bounds and independent encoded hashing. The codec
groups identical empty polls with every original work timestamp retained.

This is pure codec acceptance. It does not establish runtime cap stopping,
endpoint preservation or publication. Serialized complete:true is provisional
temporary output; integration must verify decoded hashes, flush/sync and disk
bytes before atomic publication. Existing application evidence remains unchanged.
