# View host guard v3: narrow ABI source review

2026-10-15. Astra source-only review; no imports, decoding, tests, compilation
or application execution. This supplements the v2 review without changing its
now-pinned bytes.

## Identity and verdict

Candidate `build/cok-recomp/character-view-host-guard-sol-20261015-v3` has
freeze SHA-256 `590fd54fdac5bc0dedd13a1eed680a721b2dc1ccc356dbd99482a51529ec0ea6`.
All 972 frozen entries independently matched their raw hashes and sizes.
The sibling literal command sidecar hashes to
`b8fca55439daa8cb777ecdbd42e32d5996653e6ec148511cd71a5ac43f476f1f`.
Only `prepare_abi.py` and `abi_controls.py` executable source differs from
v2. The remaining changes are handoff, input pins, commands and delta metadata.
Classifier/runtime/guest source remains identical to the reviewed v2 source.

The requested narrow repairs are present:

- Every unresolved edge is recorded independently of its kind, call status or
  target. Local CFG completeness now requires an empty gap/pending roster.
- The independent original walk reconstructs complete unresolved, return and
  call rosters. It derives AX and BL preservation from freshly decoded writes,
  unknown effects, actual returns and reconstructed gaps; published summaries
  are checked against those results.
- Complete global edge and unresolved rosters are compared, rather than only
  validating individually supplied edges. Unknown-effect sites are sorted.
- Authored mutants flip AX/completeness, omit/add noncomputed unresolved gaps,
  omit/add global edges and erase unresolved classification. Low-budget partial
  helpers must retain pending work and false AX/BL/completeness flags.

Approve diagnostic execution and the separately bounded standalone C controls
below. This is source approval, not a test PASS or host-contract closure.
The noncomputed-gap and complete-helper mutation fixtures must actually exist;
if a fixture assumption fails, preserve that failure and send it to Sol. Do not
drop the mutant or claim the diagnostic passed.

## Exact execution gates for Luna

Serialize after the audit staging/pure pass and other shared native artifacts.
Require fresh absent `build/rea/rea-view-host-guard-v3-luna-20261015-a` (absent
at this review), pre/post source/input/executable pins and separate actual
PID/argv/UTC/raw-stream/exit receipts. Execute each command separately and
stop on nonzero exit; review output before advancing.

```powershell
$candidate='C:\Modding\GoldBox\build\cok-recomp\character-view-host-guard-sol-20261015-v3'
$out='C:\Modding\GoldBox\build\rea\rea-view-host-guard-v3-luna-20261015-a'
$python='C:\Modding\GoldBox\build\cok-recomp-tools\venv\Scripts\python.exe'
$freeze='590fd54fdac5bc0dedd13a1eed680a721b2dc1ccc356dbd99482a51529ec0ea6'
& $python -B "$candidate\source_controls.py" --out "$out\classification-controls" --source-freeze-sha256 $freeze
& $python -B "$candidate\abi_controls.py" --out "$out\abi-controls" --source-freeze-sha256 $freeze
```

The ABI command matches the literal sibling sidecar. This review additionally
authorizes retargeting the unchanged v2 classification/unit controls to the
exact v3 freeze and fresh v3 output paths shown here. After classification
succeeds, the separately approved compiler gate is:

```powershell
& $python -B "$candidate\runtime_unit_controls.py" --classification "$out\classification-controls\one\classification.json" --compiler 'C:\Program Files\LLVM\bin\clang.exe' --compiler-sha256 '817b71c3e9d68dea68ba1a00a1add9e0a87cbb1d781abef1280eb495d0904ae8' --out "$out\runtime-unit" --source-freeze-sha256 $freeze
```

Python must retain SHA-256
`200d001707ed494066ef00e31e38330e32490c2a74a450ca5d66d2179396fd0e`
and Capstone 5.0.7. The compiler permission covers only the emitted synthetic
guard unit with its disclosed doubles. Record actual helper/emitted C hashes.

The input roster additionally pins the original v2 freeze and the v2 review
document (currently matching `4383245e5d21e81daa21c866f7e8d162e80715c571bea9e53aa97a71907b3027`).
Keep that document immutable through this run; put further decisions in this
separate review. A pin mismatch must fail, never trigger an automatic refresh.

## Next planning boundary

After actual diagnostics, use the six helper summaries and their retained
caller boundaries to plan one concrete request contract at a time. Start by
reviewing the two file-caller request sites A46:140F and A46:14E2, their
original request producers, stack preservation and unresolved incoming paths.
Any caller gap keeps that site's domain open. AH=06 visible output and AH=30
persona/environment/flags still need their separate complete contracts.

All 20 returning contracts, 228 slots/189 targets, prior exhausted analysis,
30,900/32,768 proposed admission and 1,868-byte headroom remain unchanged.
No handler implementation, View/native application, guest admission, source
promotion or campaign claim is authorized. Root reviews actual evidence before
asking Astra for the next bounded host-contract implementation plan.
