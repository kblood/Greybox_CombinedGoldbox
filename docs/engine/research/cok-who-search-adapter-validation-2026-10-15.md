# WHO search adapter: isolated native validation

Astra reviewed the measured DOS profile and Sol's host-only implementation;
Luna ran the native tests. Original guest coverage remains34,172 tuples /
87,539 bytes. The adapter adds no guest code, WHO parser or synthesized party.
The isolated candidate is not yet production-integrated or application-accepted.

Candidate: `build/cok-recomp/character-search-adapter-sol-20261015-v2/`.
Source freeze SHA256:
`f90544ae4b52084aaad02ee50b02fc9e48957d52970ad7892b6661f9fee9da90`.
Actual logs and receipts are in `native-validation-luna-v2/` beneath it.

## Behavior and reviewed repair

Only case-insensitive final `*.WHO`, attributes0, in the configured mutable
save directory is newly supported. The [measured contract](cok-character-search-adapter-plan-2026-10-15.md)
governs ordering, copied-DTA shared cursors, independent searches, ordinary DOS
errors and mutation behavior. Contexts and names are bounded; unsupported
pending-file mutations and resource limits remain explicit guard failures.
Metadata retains the existing archive-only/zero-timestamp limitations.

Astra found one source regression before tests: wildcard invalidation tried to
preflight the entire DTA even for ordinary failed exact searches without a
search token. V2 checks a bounded12-byte prefix using the existing nonfaulting
raw RAM reader and queries actual active context ownership first. Nonactive,
expired or corrupt tokens preserve the legacy exact failure. An active token
still requires full43-byte read/write admission before atomic invalidation;
copied aliases and host cursor state survive a failed commit. The v1 freeze
and source remain preserved. Tests cover this discriminator explicitly.

## Actual test results

All listed nonempty focused filters and the complete suite exited0:

| Filter | Passed |
| --- | ---: |
| `dos_search::tests` | 6 |
| `startup_platform::save_tests::who_` | 5 |
| `startup_platform::save_tests::legacy_` | 3 |
| `tests::search_original_` | 2 |
| Host-publication failure/revision rollback | 1 |
| Complete release suite | 214, with one existing ignored worker |

The17 focused matches include an existing legacy test; the candidate adds16
test functions. The two original-wrapper tests execute resident0112/0150/016A
at load bases0 and1000, checking original Pascal conversion, error globals,
CF and stack cleanup. Other tests discriminate copy/independent cursors,
snapshot mutation rules, context/name/token limits, all43 destination guards,
legacy exact failures and failed durable publication rollback.

Two initial focused selectors used the wrong module name and matched0 tests
despite exit0. Their logs are preserved. Luna reran the correct nonempty filters
in `focused-corrected-platform/`; the full suite also exercised these tests.
Do not count the initial empty matches as passing focused coverage.

The optimized normal build exited0. All223 frozen source/input entries and
11 YMFM provenance/source pins matched before and after validation. The exact
generated manifest and C are unchanged from cold admission:
`65ef0cf3d54cf4c2b0eae613fc199933ab7299c397f42cc8b9971283fb2332a8`
and `9931b1dc2527a24c65302f0d552c8fecc042a93beb00389b1c746a4fd9687b76`.

Tools: Rust/Cargo1.99.0, MSVC19.39.33523/toolset14.39.33519,
SDK10.0.22621. Native cache reuse was permitted because source and generated
C were hash-bound; no fresh native compile is claimed from the short full-suite
and normal-build logs. The version-only cl query printed its version then
D8003 for absent input; it was not an application compilation failure.

## Preserved executable and remaining acceptance

Luna copied the tested normal executable to
`native-validation-luna-v2/accepted-runtime/cok-recomp.exe`,19,349,504 bytes,
SHA256 `6d890b5bb4e4d55894acfd06eb9e52b74815085c87609d0a5d41fa9eabc79bcc`.
The copied bytes match the build output. The earlier accepted first-save
executable and save evidence remain separate and unchanged.

Next is a fresh headless process importing writable clones of the accepted
KRA.WHO409B and KRA.SFX9B, actual original Add/list/read/insertion, owned RAM
links and View. Requested read counts and record-size setup remain source-
proven unless separately captured; a missing STF does not exercise63-byte
nodes. Full party handling, original DOS cross-reading and M1/M2 completion
remain open. These native tests alone establish none of those application gates.
