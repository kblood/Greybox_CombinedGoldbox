# Hosted Restyle metadata command audit — 2026-11-06

Gate5 is a source/test change. No real candidate build, image decoding, copying,
staging or publication was performed. The read-only check used only the approved
descriptor and four captured JSON files; synthetic tests use temporary fixtures.

Approved inventory: `05c2ed8b79cdb5f6ef2a887073d02bf9a87044813263b022753a135b31da5096`,
5,596 files / 407,057,872 bytes. This authorization is specific to that inventory.

| Captured JSON | Bytes | SHA-256 |
| --- | ---: | --- |
| `restyle/manifest.json` | 104882 | `2b0e6a167a9ac623c879c381eda2ce8875401ef18bfb2e8002bae6f342653fa5` |
| `restyle/fidelity.json` | 22961 | `d5b5853bf156c0c601663c5cbe15ac40e0ba0099e04c324c719f46719968bdda` |
| `restyle/anim/index.json` | 17763 | `9e21ad0cf06c25acff23bb62464d83a0318d00b9503da7cd4293b84e7eb14e82` |
| `restyle/cok-generated/manifest.json` | 6965613 | `a70bbe7c245b0c411671dee014b95709bb46513b49d21a8ed767ee221eb5557c` |

Read-only validation passed existing manifest/fidelity/generated schemas and the
animation index contract: 75 comparisons and fidelity rows, 9 animation items,
2,542 generated pairs, 122 held records; 5,387 image-reference joins cover 5,062
distinct descriptor-listed paths. Comparison games include CoK, DoK, DQK,
Pools of Darkness and Gateway. Optional gallery hash pairs are absent in this
snapshot: descriptor rows supply their pins. The external comparison's explicit
pair hashes agree with those same descriptor rows. No metadata was rewritten.
The implemented validator independently reproduced the summary; deterministic
result SHA-256: `1b46e2b5e959b84e48d7f6b7c619eef395fc44a58dfa889a1d346bd6bcc2b489`.

Hosted command order, after runtime compatibility and captured metadata checks:

1. Vite app build.
2. `copy-public-app-assets.mjs` (app-owned dragon and unstamped animation viewer).
3. `bundle-assets.mjs --metadata-only` (sanitized `games/*.json`, no game files).
4. Integrate captured exact pack bytes; stamp the verified viewer/core module;
   publish descriptor; audit/inventory equality; write external receipt last.

Default builds retain their complete prior command sequence. Hosted mode omits
all Restyle packagers: stills/title-gallery/travel/demo/Amiga-dialogue additions
write only the comparison manifest/fidelity JSON; animations writes the animation
index; generated-inventory writes its manifest. Their image outputs are supplied
by the exact captured inventory. Combat/player/dialogue/terrain/wall/title
packagers otherwise copy PNG outputs, rather than required extra metadata JSON.
No required Restyle JSON outside the four-path roster was found. Game metadata
remains a separate output of the retained metadata-only asset bundler.

Validator import review: `restyle-data.mjs` has no module-load I/O. The generated
validator imports `cok-batch02-prompt-lineage.mjs`, which loads the existing JSON
receipt `docs/engine/research/cok-restyle-batch02-provenance-v1.json` and builds an
in-memory index; receipt SHA-256:
`ae25426ff374c1551b7a02f81117a22f101e4fc698f1881b670757975024fb8a`.
It reads no images, archives or external corpus. The game metadata bundler CLI is
guarded; synthetic API checks use only a temporary app and metadata-only mode.

Receipt metadata hashes describe the unchanged captured bytes. Provenance paths
remain inert text. Runtime mappings/admissions, held variants and playback are
unchanged. This audit does not establish image semantics, full runtime-slot
coverage, or release readiness. Final output and source-inventory digests remain
separate from the approved pack digest.
