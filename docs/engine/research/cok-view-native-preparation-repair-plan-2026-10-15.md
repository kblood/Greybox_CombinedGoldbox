# View native preparation: bounded v5 source repair plan

2026-10-15, Astra. Source planning only: no imports, decoding, generation,
compiler, tests or application execution. Follows the v4 source review
(`d3a1151e`, `225c7d71`). Sol implements a new frozen v5; keep v4 and its
separately released pure diagnostics immutable. This plan approves source
authoring, not any additional execution.

## Scope and fixed inputs

Repair staging and generation preparation only. Preserve all conditional file
contract predicates, original services and guest bytes. WORLD stays exactly
35,740 instructions/91,590 bytes; zero new View admission. Do not integrate
audit behavior or widen any analysis/admission limit. Native tests remain the
authored 14 original-wrapper tests plus the baseline, awaiting separate gates.

The parent v4 roster identity is
`3cddcdff0159aeb06b0463150314ba6a0bc3615857b159e8898ecf88d44c76cc`;
its raw SOURCE-FREEZE.json SHA256 is
`7d320cae71dee4abe6ce76b26460dc4ce18f958243cd76ac2ed2df7de1d9558c`.
All 980 parent files were independently rehashed. V5 must enumerate its exact
delta and count, retaining the parent raw pins for unchanged files; do not
describe its changed roster as the old 980-file freeze.

## 1. Staging guard before writes

Repair `prepare_view_file_checkout.py`, with an independently supplied expected
raw freeze SHA256 and mandatory owned scratch root. Root pins the entrypoint
itself before launching it; a script cannot authenticate its own first execution.

Before resolve, mkdir or copy, reject relative/drive-relative paths, traversal
components, UNC/device paths, existing destinations, source containment or
overlap, and output outside the explicit owned scratch root. Compare complete
path components case-insensitively on Windows, not a string-prefix sibling
test. Walk every existing lexical ancestor and source member for Windows
reparse points/symlinks; fail closed on inspection errors. Resolve only after
those checks and confirm the resolved location remains the intended child.
Recheck relevant ancestors immediately before writes. This is a cooperative
owned-directory workflow, not a claim of protection against concurrent hostile
filesystem replacement.

Read the freeze as raw bytes, compare its externally supplied SHA256, then
validate unique relative member paths, sizes and hashes. Verify the complete
frozen member roster before creating output or executing any copied helper.
For v4 ancestry this means all 980 entries; for v5 use its exact independently
reviewed new count/roster. No trust in only the JSON's self-reported digest.
Copy exact bytes, rehash every destination member, and publish a fresh receipt
binding source/raw-freeze/roster identities, roots and copied hashes. Preserve
partial failed stages for diagnosis; never overwrite or recursively clean them.

Authored discriminators: valid fresh child; sibling-prefix, traversal, source
overlap, existing output, wrong freeze, missing/extra/duplicate member, stale
member/size, source and destination reparse ancestors. Denial must precede
mkdir/copy/helper invocation. Reparse setup has its own named control; only
explicit WinError1314 may withhold that coverage, never ordinary guard coverage.
OS5/security failures stop without retry.

## 2. Generation-only boundary

Repair the copied `rust/cok-recomp/build.ps1` with mandatory explicit GameDir,
GeneratedDir, TargetDir and preparation receipt/identity output. Reuse the
audit PrepareOnly control-flow pattern, not its unrelated policy/roster or
audit source overlay. Require fresh distinct generated/target/output paths
inside this staged checkout's owned build subtree, with lexical guards above;
protect the frozen candidate, retail inputs and other stages. No old default
generated directory or ambient COK_GENERATED_DIR fallback.

`-PrepareOnly` must perform prerequisite validation, original WORLD fixture
reconstruction, lifting and receipt publication, then return before any Cargo,
rustc, cc, frontend or guest compilation. Do not implicitly run setup, pip,
YMFM downloads or another interpreter. Record explicit child cwd/environment.
Add a separately selected compile-existing-preparation mode only if needed;
it must reject missing/stale independently reviewed preparation identity and
must never silently regenerate. No compile mode is authorized by this plan.

The original WORLD producer writes fixtures in the copied source tree. Record
those expected outputs separately from unchanged staged inputs, with an exact
allowed mutation roster and their actual raw hashes. Pin pre-generation input
state; verify every non-output source remains unchanged after generation.

## 3. Capstone prerequisite, before any decoder use

Implement a small reviewed file entrypoint for the generation child (or a small
shared guard invoked first by each decoder-owning child). It may be a separately
frozen prerequisite task, but generation cannot be released until that exact
guard is reviewed and integrated at every decoding entrypoint. A preflight in
a different Python process is insufficient. The WORLD producer dynamically
imports lift.py, so guard selection and verification must occur before that
import can select/use Capstone; the later direct lift child needs the same guard.

Follow `cok-capstone-generation-prerequisites-2026-10-15.md` exactly. Pin the
venv launcher, base interpreter/runtime DLL, pyvenv.cfg, selected package files
and DLL. Compare retained wheel entries to installed files without import;
record explicit installation/generated exceptions. Review startup .pth and
sitecustomize/usercustomize exposure. Select existing 5.0.7 explicitly, with
recorded PYTHONPATH/PYTHONHOME/PYTHONNOUSERSITE/LIBCAPSTONE_PATH/PATH, including
unset values. No installation or fallback to the venv's different version.

Before importing, verify the intended package and DLL paths/hashes. After
import, in the same child and before calling any decoder/generator, verify
actual module path/hash, distribution and engine versions, actual loaded DLL
path/hash against independent expected values. Fail if loader fallback selected
anything else. Do not rewrite Capstone's loader or treat environment selection
as proof of loading. Receipt includes PID and the actual load identities.

Root reports official PyPI Windows 5.0.7 wheel SHA256 matches retained wheel:
`4ab8bcb7da8f221ff45926ca168ca33e76f7237d06fbf3c10780002faa2670e1`,
with Trusted Publishing reported No. This is a repository-published hash match;
it is not a Microsoft malware clearance or publisher signature. Preserve that
qualification and the historical acquisition receipts.

Authored guard controls must demonstrate mismatch rejection before any decode:
wrong module version/path/hash, missing or altered intended DLL, different actual
loaded DLL, unexpected startup/environment, and missing required identity.
Use injectable metadata/loader observations for pure guard tests; do not load an
unreviewed DLL merely to test rejection. Actual matching load is a separately
authorized prerequisite observation, followed by the preparation gate.

## 4. Exact preparation evidence and hook delta

Publish a preparation manifest with original START.EXE/GAME.OVR and all consumed
retail identities; source/fixture/package identities; exact argv/env; full raw
generated-output roster; and selected actual generated C/manifest hashes.
Preserve raw path-dependent metadata rather than silently normalizing it.

Publish the full ordered instruction tuple roster from the generated manifest:
module_id, ip, source_offset and bytes. Compare against the accepted WORLD
35,740/91,590 roster, with exact additions/removals/changed tuples empty. Compare
original control-flow/dispatch roots and stop/admission ledgers as concrete
rosters, not only aggregate counts. No extra View roots may be admitted.

Publish the emitter source delta against its pinned parent and the generated C
hook delta: exactly the before-hook at resident module0 instruction execution,
the saved original IP, and the after-hook following retirement. Verify existing
source-byte checks and original operations remain in order. Bind every hook
location to its original tuple, including the 100-row witness subset. Generated
C is expected to differ from the historical C due to instrumentation; never
refresh an old C pin and call it equivalent. Any additional semantic diff stops
for source review. No candidate-built report alone grants acceptance: Root/Astra
inspect the emitted rosters and actual textual delta before compilation.

## 5. Two fresh copies and later gates

Sol supplies literal commands only after v5 freeze and new raw pins exist:

1. Existing capture helper stages fresh `build/rea/rea-view-file-v5-luna-20261015-one`
   using mandatory owned root and externally pinned freeze; retain copy receipt.
2. Separately authorized prerequisites and `build.ps1 -PrepareOnly` generate
   into that copy's fresh explicit build directory. Target stays absent. Record
   actual owner PID/UTC/raw streams/exit and pre/post pins.
3. Repeat sequentially in `...-two`, with distinct generated/target/receipts.
   Compare exact original tuple/graph/ledger and hook rosters. Compare raw hashes
   too; enumerate any root-dependent metadata fields explicitly rather than
   require or claim whole-file equality where paths differ.
4. Stop for Root/Astra review of both preparations and toolchain provenance.
   Only a new native gate may compile an immutable reviewed preparation, then
   run focused `view_file_` and full baseline tests with explicit environment,
   locked offline dependencies and separate target roots. Record actual counts,
   ignored tests, binary hashes and source lineage. Serialize both copies.

No browser/DOS/game frontend, pressing View, source promotion, audit integration,
native-relocation-negative harness or guest-byte expansion is authorized here.
Keep current pure diagnostics independent. Any security/access-denial failure
preserves receipts and stops; do not split, rewrite, encode or retry commands.
