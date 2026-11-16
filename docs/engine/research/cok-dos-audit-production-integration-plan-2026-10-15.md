# CoK optional DOS audit: production integration plan

Date: 2026-10-15. Astra source-only plan, based on production HEAD
03544ae8b5f116d289be96b73e572e29bcb73c47 (documentation successor to cfd26d60).
Status: approve bounded Sol source integration under the gates below. This memo
runs no candidate imports, decoders, parsers, builds, tests or applications.
Read-only file/JSON selection, hashing and textual diffs support its findings.

## Accepted lineage and limits

The accepted candidate is `build/cok-recomp/dos-audit-companion-sol-20261015-v3`.
Its source-freeze SHA256 is
`af0b2b54b9ec63cd6c8fede0f1a7f406929be0d89a012fd3757847d19abadaae`.
All 13 candidate Rust/JSON file hashes were independently rechecked here, and
all seven production-input hashes match the current production files. The
candidate is a replacement overlay, not a whole source directory: copying it
must never delete the production files absent from that overlay.

The accepted release executable is 20,180,992 bytes, SHA256
`acb20d9b475b993e1a5d1fcefa5bf126442bca69a7b0f4519a3f89283cc01068`.
Luna recorded 16 focused tests, 240 full native tests with one ignored worker,
offline mutations, gate controls and release build, all successful. The actual
OFF then window-ON routes and separate DOS verifier passed; the measured
runtime report remains at
`build/cok-recomp/staging/dos-audit-companion-luna-v3-20261015-a/luna-captures/runtime-window-v3-report.json`.
Its rechecked SHA256 is
`7a42700d6ec9bc2f973312ff799e75cc53c21cc52e362331488cc20ec7ab1609`.
See [native validation](cok-dos-audit-native-validation-2026-10-15.md) for process
identities and historical failures. These results belong to that exact staged
source/binary, not to a future production rebuild.

Accepted lifted C SHA256:
`d806268d574996cb0f534d40865a4af7dfcc4bcaee9f2d2b375a80fe3e4eab01`;
manifest SHA256:
`d8440aeecdd81c87f242f96f35a763330271781ce62f0ab175469e674a0a9114`.
Guest admission remains 35,740 instructions / 91,590 bytes. This task admits
**zero new guest tuples and zero guest bytes**. Preserve 8,192 events, 8 MiB
retained allowance, 8 KiB per-transfer bound and the existing metadata reserve.
Default audit remains off; on without a start remains start-at-zero. Explicit
window start is 16,000,000 for the accepted route, ending at 17,750,000 work.
`complete=true` covers that declared observation window only; live endpoint
`run_completed=false` and unknown preexisting-handle open provenance remain.
No View keys, DWF2 launch, Save, Begin, new DOS service, or M1–M7 claim is included.

## Exact production ownership

Sol owns only the following audit overlay and packaging files. The table pins
accepted replacement bytes; provenance-related changes below require a new
freeze rather than being represented as byte-identical to the accepted binary.
Paths in this table are under `rust/cok-recomp/src/`.

| File | Operation | Accepted SHA256 |
|---|---|---|
| dos_audit_sources.json | replace historical metadata with current verified roster | `63add8af18f534a80518964cdcd1231db4dff57adb32736dc2c6d6e65bf527a1` |
| frontend.rs | replace | `05a6b8d53d44dcc14dedcc71098feab1af642a62c7c9e83997f3da267dfc57f2` |
| frontend_headless.rs | replace | `2d6cf910463fb8009c356f38be1e4164790786cbe315b73823712b259d317229` |
| main.rs | replace | `43fafc293ff88117d9d2c805a55afb697af690d145824a9deede4143c2d57bf7` |
| startup_bios_ledger.rs | replace | `67ef61ff059a579f40037da97f642a7cb154a9bae7e33ccd910ed8c48aeef852` |
| startup_bios_publication.rs | retain identical | `ce1e6cfa294ddf9985a4d1e01cdd9b3043136f715569c1cd27b31d51d3cf67cb` |
| startup_dos_audit.rs | add | `8feb368fe1b2382c7e079c31388252b21511a885b11e6dbb392871f254da50fe` |
| startup_dos_audit_tests.rs | add | `7796a2b3fdcf62848f8c1cc84a26d5651bb355cdc4ad38e451eca769ab5c46a7` |
| startup_dos_platform_tests.rs | add | `582268156b482f6e56cc87df891cc171588b0625cfbce27383528e18cbe1c365` |
| startup_dos_publication.rs | add | `57c661338d7edb07666f1b59a0a666a2b92a5303077ea62f6b4e0eefb0515fa2` |
| startup_dos_publication_tests.rs | add | `a8df56786ab3d296f25ecb182e2bbef5ccf4a3dbaac4f4846acb551ce75c8707` |
| startup_platform.rs | replace | `9415984bed040fb15150995a891e0c9da6383a1ad0024dbffb9e5ec33bb5e0e8` |
| startup_session.rs | replace | `855823414ddd29618a4a564808403792deece8e4453af5045169696a2ed0f835` |

`main.rs` differs only by the new audit module declaration when line endings
are ignored. Preserve accepted raw source bytes during initial overlay copying;
do not let broad formatting obscure reviewed behavior. Keep unchanged BIOS
publication source as an explicit comparison pin, not a gratuitous edit.

Additional owned paths, all under `rust/cok-recomp/`, are `build.rs`, `build.ps1`,
`verify_dos_audit.py`, `test_verify_dos_audit.py`,
`prepare_dos_audit_provenance.py`, `test_dos_audit_provenance.py`,
`audit-provenance-inputs.json`, and the new `headless-cold-add/` directory.
README and GOAL may be updated after acceptance. If a different file needs an
edit, identify its dependency and return it to the coordinator before widening.
Other agents' View and DWF2 candidates and all unrelated dirty files stay owned
by their existing workers.

Copy the standalone verifier and its controls from the frozen audit candidate:
`verify_dos_audit.py` SHA256
`30789474672c89b7c512e3e16357c25eb2b2e3c5efd8fd68b7ed41d060538d16`;
`test_verify_dos_audit.py` SHA256
`8fc929415335b7b56468e2c1251a4804f55500e8ab4581b13fc7568ea384f433`.
Relocation must not weaken independently supplied source identities, binary,
evidence, BIOS-manifest or explicit start-work bindings.

## Replace historical provenance with build-enforced current identity

The accepted `dos_audit_sources.json` hash is
`63add8af18f534a80518964cdcd1231db4dff57adb32736dc2c6d6e65bf527a1`.
It embeds historical production-input and ignored donor/fixture roster hashes.
`startup_dos_publication.rs` includes these raw bytes, while current `build.rs`
never recomputes that roster. Simply copying this metadata into production
would preserve a historical assertion, not enforce current source identity.

Use a tracked, explicit, repository-relative input allowlist and deterministic
refresh/check tool. Separate historical donor ancestry from current compiled
inputs. The current roster must include the audit implementation and tests,
all participating host Rust/C/header files, build script and Cargo manifests,
lockfile, the selected 24 generated inputs, and separately pinned YMFM source.
Exclude the roster itself from its input set to avoid a self-hash cycle; record
that exclusion and scope explicitly. Do not scan arbitrary ignored directories
or silently omit missing files. Reject duplicate/escaping paths, missing files,
wrong sizes, stale hashes and unexpected roster shape. Keep original game root
and repository root bindings explicit for save-source protection.

Make `build.rs` independently verify the complete current roster against disk
before compiling, including generated inputs resolved from COK_GENERATED_DIR.
Emit rerun-if-changed for every input and the roster, and rerun-if-env-changed
for each root selection. Retain the existing compiled include after verification;
the refresh tool writes deterministic metadata explicitly before a build, never
silently blesses arbitrary changed sources during checking. A separately saved
expected-identities file must bind the exact verified roster bytes used by the
new executable; the verifier must not derive its trusted expectation from the
manifest it is checking. Retain schema compatibility where possible, or review
and test a narrowly versioned change. This produces a new binary lineage.

The old stage's 947 combined-source entries (175 under rust, 772 under tools),
14 native-fixture bindings and 24 external generated inputs are historical
staging evidence. They are not an installation recipe. Replace that donor copy
with tracked repository source checkout and the existing original-derived
preparers: prepare_world_persistence_admission.py and its tracked dependency
chain, followed by lift.py. Reconstruct cold_add-tuples/world-tuples from those
preparers, and reconstruct YMFM from prepare_ymfm.ps1 with its pinned revision
and provenance. Account for every old fixture entry in a migration map, naming
its tracked producer or explicit external prerequisite; reject unexplained
entries. Do not vendor original game data or the ignored source donor tree.

Provide a fresh output/target option in build.ps1 or a narrow tracked wrapper so
Luna can generate in a new owned tree without overwriting accepted evidence.
Verify all 24 resulting generated hashes, especially lifted.c and manifest.json,
before Cargo. The existing default build/cok-recomp/generated is not the accepted
WORLD directory and must never be selected by existence or fallback. An exact
fresh generation mismatch blocks this integration and is investigated without
loosening pins or changing guest admission. Existing caches may supply pinned
tool dependencies; record their identity, and do not call that an offline clean
bootstrap unless it actually was one.

## Track the exact headless gate and its complete dependencies

Source is `build/cok-recomp/cold-add-gated-replay-sol-20261015-v3`, freeze
`42861761ae60b5a982e072596213cc7394b392ef9ed643ba6986ef02b57334fe`.
Port these files into `rust/cok-recomp/headless-cold-add/`:

| Source | Accepted SHA256 |
|---|---|
| replay_gate.py | 2c8942a656eb85869633786941ed80c23feb43854a8815bef221016e5f6d6834 |
| run-headless-route.ps1 | 4434581d0ec2f312aa635f34b8ee42727dd9a3e0d1617f0d90ac09dc974f3f9a |
| source_controls.py | 234ce7135a857387c8bfa4273e80bd8c6f0a1a9bd5ebcca042b3393e993e542f |
| initial-two-keys.json | b6294162c00a434dbadd456d03c17917423d32d0d7d0ba5a3d9610ad8c41e3b5 |
| baseline-manifest.json | 13443bcd23a4d117bf216a4d3bf48a1f8365fd95212c908f3b4ea99372116013 |

The baseline currently opens ignored owner/actions/receipts/frame metadata and
BIOS ledger from absolute local paths. The launcher also hardcodes the accepted
KRA source root, repository working directory and owned-stage root. Controls
read a historical BMP. Move the exact expected semantic data into a tracked
route-expectations.json, with origin hashes and explicit projection rules;
retain all nine commands, seven key inputs, work/state/register/image hashes,
receipt fields, scheduler configuration and endpoint expectations. Compare the
new table to every old consumed field once, with a retained extraction receipt.
Do not regenerate expected results from the candidate under test. Parameterize
external accepted save source and owned scratch roots; preserve distinct-path,
no-reparse, exact two-file roster and before/after verification. Keep KRA.WHO
409 bytes/e9b3ea72bcf349118268c3f0a2f864a24579630884106a1e2905f2f44ff851de
and KRA.SFX 9 bytes/2dc3ea9719de5477dc6311837e0ff1502aacd91d2dd432c69a538ad89f64a5be
as required external pins. If absent, fail before launch with a named prerequisite;
do not silently fetch old ignored history or claim the application gate passed.
Pure controls must work without those external saves or historical BMP: use
synthetic BMP/metadata pairs for image guard mutations plus the pinned exact
route expectations for route assertions. Never commit original image pixels or
RAM just to make the harness portable.

Track the BIOS publication validator too: its accepted source is under
`build/cok-recomp/staging/intro-compare/creation-journal-route-gui-runs-20261015-a/journal-route-repair3-luna-20261015-a/publication-validator/`.
Copy its Cargo.toml, Cargo.lock and src/main.rs into
`headless-cold-add/publication-validator/`, replacing its absolute codec path
with the repository-relative bios-journal-codec dependency. Hash its input
sources before migration and retain those in the new freeze. Build a fresh
validator and pin that actual binary in configs, rather than relying on the
old binary hash 28bbb915…; no source equivalence is inferred from its name.
The reviewed-binary-config template remains unreviewed until filled with actual
current binaries and pinned inputs. Preserve v3 incomplete-receipt evidence,
stop-before-next-command, exact capture tokens, actual guest exit and owned-child
cleanup behavior. Gate success and trusted DOS verification remain separate
required acceptance facts.

## Serialized Luna acceptance and completion

1. Freeze the exact new source roster, migration map and staged inputs. Astra
   reviews only the provenance/relocation delta beyond accepted v3. Source
   preflight verifies the seven old production hashes before overlay and all
   final hashes afterward. No concurrent native build or runtime may share
   generated outputs, target directories, save roots or devices.
2. Luna runs portable audit mutations, current-source roster controls and actual
   gate controls. Discriminate changed source, stale roster, omitted required
   input, duplicate/path escape, wrong generated directory, binary/identity/start
   mismatch, stopped/incomplete receipt, terminal child, validator failure and
   wrong exact image/work/input state. Missing historical directories must not
   break portable controls; missing declared external assets must fail preflight.
3. In a fresh owned production checkout/output tree, regenerate original-derived
   WORLD fixtures and all generated inputs, verify exact hashes, then run focused
   native dos_audit controls (expected at least accepted 16), full release suite
   (accepted baseline 240 pass/1 ignored), and direct optimized build, sequentially.
   Use locked/offline Rust1.99.0, one job/thread and the recorded supported MSVC/SDK.
   Record actual exits and final parent summary separately from nested summaries.
   Capture argv, environment selections, source hashes, output hashes and raw
   streams. A changed count needs explanation; no zero-match pass is accepted.
4. Build and bind the tracked BIOS validator. Prepare reviewed new OFF and ON
   configs using the new executable, fresh KRA clones and exact route table.
   OFF must exit normally and pass exact route/BIOS validation before ON starts.
   ON uses --dos-audit on --dos-audit-start-work 16000000; additionally require
   the trusted audit verifier with independent current identities and explicit
   start-work. Compare actual WHO slices/full409 bytes, SFX full9 bytes/EOF,
   RAM/registers/work/BIOS and unchanged saves to OFF and the retained accepted
   endpoint. Inspect fresh original frame0017 (KRA, AC10, HP12). Preserve all
   failed attempts; never retry without interpreting their evidence.
5. Confirm all owned guest/helper/validator processes terminal and source pins
   unchanged. Document new production lineage and actual results, then stage
   only owned files, commit and push. No website change is part of this task.
   Leave View/DWF2 and M1–M7 open, then resume the coordinator's next bounded task.

Integration is complete only after the production-path generation, build and
cold-route evidence exist. Until then describe the accepted isolated v3 route
and the new production source candidate separately. Fresh provenance verification
is intended to detect stale source metadata; it does not itself prove source
correctness, complete host write-failure behavior, or adversarial filesystem races.
