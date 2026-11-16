# View v3: actual host classification, ABI and synthetic guard controls

2026-10-15. These controls acquire original-source evidence and exercise an
owned synthetic guard unit. They do not admit or execute native View gameplay.
New execution is currently held following the
[Defender investigation](cok-defender-detection-review-2026-10-15.md).

## Reviewed sources and actual processes

Candidate: `build/cok-recomp/character-view-host-guard-sol-20261015-v3`,
freeze590fd54fdac5bc0dedd13a1eed680a721b2dc1ccc356dbd99482a51529ec0ea6.
Astra and Root independently rehashed all972 candidate entries without mismatch
before execution. Gates are in the [v3 source review](cok-view-host-guard-v3-review-2026-10-15.md).

Artifact root: `build/rea/rea-view-host-guard-v3-luna-20261015-a`.
Actual process receipts and streams are in its sibling `-process` directory;
the import prerequisite has a separate sibling `-preflight` directory.

| Parent process | PID | UTC start–finish | Exit / streams |
| --- | ---: | --- | --- |
| Classification controls |3868|19:38:03.717–19:38:23.721|0 / drained|
| ABI controls |55136|19:38:34.680–19:38:57.157|0 / drained|
| Synthetic C guard unit |58816|19:40:49.128–19:41:02.992|0 / drained|

Each parent has empty stdout/stderr. Controls write their findings to explicit
JSON files; empty stdout is not the evidence of success by itself.

## Decoder prerequisite

The named venv Python executable matches its reviewed200d0017… pin, but its
default site-packages contains Capstone5.0.9. Luna stopped before launching
controls under that version. Root explicitly selected the existing5.0.7 package
at `build/cok-recomp/world-persistence-sol-candidate-20261015-a/luna-controls-20261015-a/python-packages`
through child PYTHONPATH; the shared venv was not changed.

Actual import preflight reports Python at the pinned path, module and metadata
version5.0.7, engine version5.0, and the DLL from that selected package.
Its DLL SHA256 is46b7c385efe50db4def8aa99aa351c44ea28b1f3c2ccbc4ca41dbb2a02340e39;
the43729-byte __init__.py SHA256 is0417ae554252be8e8d03e328054fad4c3cec6cf4895deecec637078380840f8b.
The process context records the explicit package environment selection.

## Actual diagnostic results

Classification controls report18 successful labels, two independent identical
classifications and runtime_admission_authorized=false. They discriminate
original opcode/producer/owner/relocation changes, terminal/return edges,
missing destinations, partial and implicit register writes, unknown operations,
unresolved support and SCC membership. Classification SHA256:
3f8fb9ca7a1d9d97340bca46d33d8a7987eb056a59e84db204f4d15e6e0b1b2a.

ABI controls report16 rejected mutants, two byte-identical acquisitions and
low_local_pending_preserved=true. The mutants include AX/BL summary changes,
noncomputed unresolved edges, complete-helper/global edge rosters, erased
pending/charge evidence, return deletion and missing slots. Both acquisitions
have SHA2564fd814ae6c0ba466e5a34a5c46b3a7051f2d77a62f02d5ce8b3e44c082c80db0.

| Original helper | Local CFG / AX / BL proof | Remaining local host gap |
| --- | --- | --- |
| 0A46:13C9 |false / false / false|INT21 at140F|
| 0A46:14B4 |false / false / false|INT21 at14E2|
| 0A46:144A |false / false / false|INT21 at145F|
| 0A46:146F |true / true / true|None; four rows, no calls or gaps|
| 0A46:01DF |false / false / false|INT21 at01EB|
| 0A46:1675 |false / false / false|INT21 at1686|

The public read/open request sites remain known_request=false in the
conservative classifier. Their complete original instruction rows can support
conditional public-entry proofs; false local completeness does not authorize
inventing a service or globally asserting a request. The caller inventory has
85 unknown intervening call/interrupt boundaries and54 reaching-definition
boundaries, not a complete global caller proof.

Additional source analysis charges103 bytes over inherited9944, total10047
under shared32768/local16384. Default pending work is empty. Proposed View
admission remains30900/32768 bytes with1868 headroom; no analyzed byte is
automatically admitted. All228 slots/189 targets and earlier exhausted analysis
remain accounted for.

## Synthetic C unit and evidence caveat

The unit extracts the actual far-call helper and exercises proposed initializer,
generation, stack/return, owner, pointer and alias guards with disclosed memory,
body/stub and two-slot doubles. Its scope is explicitly
SYNTHETIC_UNIT_ONLY_NOT_NATIVE_ACCEPTANCE. Clang SHA256817b71c3e9d68dea68ba1a00a1add9e0a87cbb1d781abef1280eb495d0904ae8
and compiler argv are retained in unit-receipt.json.

- view-unit.c:59574 bytes, SHA25638e196bfb59e8ef27d3b05101959464bff7160560b27781e1335bf4469525df2.
- view-unit.exe:206336 bytes, SHA256beb0618380aeeeea16c0d229d0229bd8dd4a51b7391dad162e7ff7878dca3a81.
- unit-receipt.json SHA2563095f43304f2ab3743d5043f0fad7934eac34097fa5b58862f30b2351ebf934b.

Luna reports987 unchanged source/input pins and64 verified package RECORD
entries after controls. Defender also flagged verification command lines in
this interval. Their exact command/receipt correlation remains under review:
some flagged commands target different paths or arguments from surviving
receipts. Do not infer those flagged commands completed successfully from
later files. The separate actual parent-process control exits above remain
retained; this caveat is not silently rewritten into a clean verification claim.
See [the full command-source review](cok-defender-command-source-review-2026-10-15.md).

The next source-only implementation is the
[conditional original file-wrapper increment](cok-view-file-contract-evidence-goahead-2026-10-15.md).
No new test launch, production promotion, returning handler or native View
acceptance follows from this report.
