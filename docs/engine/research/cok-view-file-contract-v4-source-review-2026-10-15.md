# View v4 conditional file contracts: source review

2026-10-15, Astra. Source and existing JSON metadata reads/raw hashes only;
no candidate import, decoder, control, compiler or application was executed.
The security execution hold remains. This review does not extend the separate
stage-C audit authorization to View.

## Verdict and identity

Approve the two pure diagnostic entrypoints below for a future, separately
released Luna gate. Do not run the proposed native staging/build sequence yet.
The runtime implementation is suitable for that next diagnostic step; neither
its 24 pure mutants nor its 14 Rust tests have passed in this review.

Candidate: `build/cok-recomp/character-view-file-contract-sol-20261015-v4`.
SOURCE-FREEZE identity:
`3cddcdff0159aeb06b0463150314ba6a0bc3615857b159e8898ecf88d44c76cc`.
That is the JSON's declared roster identity, not the raw file SHA256. The
independently checked raw SOURCE-FREEZE.json SHA256 is
`7d320cae71dee4abe6ce76b26460dc4ce18f958243cd76ac2ed2df7de1d9558c`;
use that raw pin when authenticating the freeze file before consuming it.
Independently rehashed all 980 listed files: zero mismatches. The runtime
provenance roster has 947 paths at revision
`f2f2a1e8a818b022784b9d46311709964b5e9f3f`; comparison with current checkout
found only `rust/cok-recomp/GOAL.md` changed. Executable runtime sources still
match that roster before the five enumerated candidate modifications.
DELTA-MANIFEST lists **seven** new owned sources, including the staging helper;
HANDOFF's prose says six. Preserve the frozen candidate and use the seven-row
manifest as the authoritative scope.

This is the 06af80b7 WORLD/WHO/volume source lineage, not a combined audit/View
binary. Existing Extended::dos, WHO and volume sources are unchanged.
The accepted v3 evidence and original ABI are detailed in
`cok-view-file-contract-evidence-goahead-2026-10-15.md` (9581c9cb/12819784).
The consumer hard-pins the four actual ABI/classification evidence artifacts.

## Source findings

- The 100-row resident witness uses exact bytes and CS=base+A46. Entry and
  service checks authenticate the whole union, including untraversed rows.
  The source consumer binds complete selected rows, edges, helper summaries,
  returns, gaps and budget to the pinned ABI evidence. It independently checks
  producer/frame bytes, including mutants with a correspondingly altered
  reference. No private-join or generic caller proof is inferred.
- Public read14B4 retains BL=3F through actual near146F, unsigned multiplication,
  low-word CX and original division/error/result tail. Open13C9 retains AL from
  DS:43B2, saved AX/DX and the nested close144A far frame. The runtime validates
  the executed helper return, saved words, stack cleanup and restored registers;
  it does not assert that close itself preserves AX.
- The emitter sets IP to the next instruction before guest_interrupt. The
  gate correctly requires the original-site token and post-INT IP=site+2 for
  140F/14E2/145F. Existing DOS services remain responsible for open modes,
  namespaces, handle/cursor behavior and protected writes. No AH06/AH30 service
  or storage implementation is introduced.
- Physical spans, not segment inequality, enforce the narrow nonalias subset:
  stack plus/minus32, record176, error/mode locations, read buffer and optional
  result. Segment wrap and 1MiB bounds are checked. Some otherwise legitimate
  zero-length pointers/aliasing configurations are deliberately outside this
  subset. Full arbitrary-memory safety or global caller closure is not claimed.
- The opt-in witness defaults off; prior fault/evidence stop wins without
  repair of guest state. Actual Rust wrapper tests are authored against
  original guest paths and existing services, including full/short/EOF/modulo,
  stale handles, saved frames, physical aliases and fault/stop cases. Their
  assertions remain unverified until compilation and execution.
- The overlay preserves the original classification and native flags, while
  computing reachability to propagate exact remaining SCC obligations. Only
  the three conditional file-site obligations are removed in its additional
  ledger. SCC141/154/155 remain conditional, with open depending on close;
  SCC22 and182 retain other blockers. A8:0D74/A8:36CC are absent from this
  pinned roster and need separate bounded acquisition/integration.

WORLD remains 35,740 instructions/91,590 bytes. Proposed View remains
30,900/32,768 bytes, with 1,868 headroom. Analysis is 10,047 bytes including
103 context bytes not admitted. The 228-slot/189-target worklist and prior
131,071/131,072 exhaustion are not erased. No View admission follows.

## Future pure gate, after Root separately releases it

Use the existing reviewed capture helper and ordinary file entrypoints, with
fresh owned output, interpreter/package/source pins and actual PID/UTC/exits/
drained raw streams. The report writer can overwrite its output, so confirm
the exact named output is absent and its ancestors are owned/non-reparse before
launch. Do not broaden its path argument. Capture the 24-mutant roster and the
full 183-SCC/228-slot conditional ledger, not merely an exit code.

```powershell
& 'C:\Modding\GoldBox\build\cok-recomp-tools\venv\Scripts\python.exe' -B 'C:\Modding\GoldBox\build\cok-recomp\character-view-file-contract-sol-20261015-v4\view_file_controls.py'
& 'C:\Modding\GoldBox\build\cok-recomp-tools\venv\Scripts\python.exe' -B 'C:\Modding\GoldBox\build\cok-recomp\character-view-file-contract-sol-20261015-v4\view_file_contracts.py' --evidence 'C:\Modding\GoldBox\build\cok-recomp\character-view-file-contract-sol-20261015-v4\FILE-SOURCE-REFERENCE.json' --classification 'C:\Modding\GoldBox\build\cok-recomp\character-view-file-contract-sol-20261015-v4\evidence\classification-controls--one--classification.json' --output 'C:\Modding\GoldBox\build\rea\rea-view-file-v4-luna-20261015-a-classification.json'
```

Any access denial/OS5/security alert stops the sequence. Preserve the failure;
no split, rewrite, encoding or retry to get through. Defender stays unchanged.
Source review is not a Microsoft false-positive determination.

## Native preparation remains a separate gate

`prepare_view_file_checkout.py` resolves its output before checking it and
only rejects existing/output-inside-source paths. It does not enforce an owned
scratch root or reject lexical reparse ancestors. Before authorizing this
entrypoint, add the already established narrow lexical ownership/reparse guard
before mkdir, and bind the expected freeze identity rather than merely echoing
its self-reported value. Preserve this candidate; freeze any repair separately.

The copied build.ps1 invokes WORLD fixture generation, lift.py and release
Cargo in one invocation. It has no prepare-only boundary. The new hooks change
generated C, so neither old C identities nor audit acceptance automatically
cover it. Before native authorization, specify exact source/retail/compiler
inputs, protected roots, isolated generated/target directories and generation
receipts; acquire and review the resulting instruction/byte roster and hook
delta before compilation. Do not treat a default generated directory name as
provenance, or inherit a different shell's COK_GENERATED_DIR for later Cargo.
Then separately gate focused original-wrapper tests and the full baseline in
two serialized fresh copies, with binary/source lineage and actual counts.

The audit `native-relocation-negative.py` descendant cleanup/restoration concern
is a separate unresolved future gate: root-process termination alone must not
allow restoring mutated files while Cargo/build-script descendants still run.
It does not change this View pure-consumer verdict.
