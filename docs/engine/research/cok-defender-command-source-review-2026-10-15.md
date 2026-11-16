# Defender command evidence: source review

2026-10-15. Astra read-only/source review. Recorded command strings were treated
as untrusted data and never executed, imported or dot-sourced. No tests,
compiler/application launches, exclusions, restores, detection changes or
external submissions were performed.

## Evidence and complete-command correlation

`build/cok-recomp/security-review-20261015-a/defender-events.evtx`:
SHA-256 `278778cdb7728a57530662889d8982e1e5a00f2d2fa16ada4facb0693abe8e6a`.
All seven stored Path fields are truncated to1023 characters, ending mid-code.
EVTX alone cannot support a complete-command review.

Root's same-threat `threat-detections.json` export supplies three full Resources
strings, SHA-256
`f3f66cc49d78fbac14afd4ab4bf08816aa338dfdc9b2fe8d88f0e3ee8057eabf`.
Each EVTX prefix matches exactly one full string:

| Records | Full string length | Intended work |
| --- | --- | --- |
|19794,19796|5637|View v3 source/package preflight and Capstone import receipt|
|19797,19799|4001|Post-control candidate/input/package hash comparison|
|19798,19800,19801|1567|Capstone RECORD post-check and evidence output|

Detection UTC times are19:37:20,19:39:45,19:39:56 and19:40:02;
action records continue through19:40:13. This mapping does not establish why
the latter command appears in two detection events or the exact remediation
effect on each process/artifact.

## Source findings

The complete strings contain no network download/request, decoded executable
payload, persistence installation, registry/service/scheduled-task changes,
Defender exclusions/settings changes or quarantine restoration. Visible writes
are JSON/raw-stream evidence under the named workspace build/rea directories.
The package and frozen-source files are read/hashed, not modified by these
commands. No external upload destination appears.

`ToBase64String(SHA256.HashData(bytes))`, followed by padding removal and URL
alphabet substitutions, encodes a digest for comparison with wheel RECORD.
There is no Base64 decode or execution of the digest. JSON parsing likewise
does not execute the stored values. RECORD supplies filenames for reads;
these snippets do not enforce containment or provide an independent publisher
signature. Matching RECORD establishes local consistency, not package trust.

The preflight deliberately invokes the named local capture helper, which starts
the pinned Python executable with a literal `-B -c` snippet. That snippet
imports Capstone and reports module/metadata/native-library paths and hashes.
Literal `__import__('hashlib')` and `__import__('sys')` are ordinary imports,
not decoded payload execution. This is nevertheless real code execution:
Capstone's inspected `__init__.py` uses ctypes.LoadLibrary. Its search order
includes LIBCAPSTONE_PATH, package lib paths and fallback locations. The
surviving stdout identifies the package-local capstone.dll, SHA-256
`46b7c385efe50db4def8aa99aa351c44ea28b1f3c2ccbc4ca41dbb2a02340e39`.
This source review is not an audit of that DLL or the complete dependency tree.

The inspected `capture-validator-working-directory.ps1` uses an explicit
executable/argument list with UseShellExecute=false and redirected streams;
it writes process/raw-output receipts and waits for the child. It contains no
network/security-setting/persistence operation. The preflight temporarily
sets child-inherited PYTHONPATH and restores the shell variable in finally;
it does not persist an environment change.

## Receipt discrepancies and remaining investigation

The retained import receipt reports PID44448 exit0, drained output, at
19:37:40.220–19:37:40.551UTC. Its literal Python argv and context schema differ
slightly from the full flagged preflight string (direct sys import versus
literal __import__, among other metadata differences). The flagged
preflight-pins.json is absent. Do not equate this receipt with successful
completion of every statement in the flagged command.

The flagged post-pin command chooses `output/-process` (a nested directory),
which is absent; surviving evidence is in sibling `output-process` and has a
different schema. Flagged capstone-post-record.json is absent; a different
capstone-post-record-summary.json exists at19:40:25. Its64 hash checks and zero
mismatches are reported evidence, not proof that the earlier flagged command
completed or that Defender did not affect it.

Next read-only steps: preserve and correlate Luna's original full tool-call
text/results and launch receipts with these resource strings/times; identify
which attempts produced the surviving files and what errors/removal occurred.
Record any missing evidence rather than rerunning flagged commands to fill it.
Confirm the historical package acquisition/hash provenance and complete native
library selection environment before proposing a reviewed continuation. Keep
the execution hold until Root resolves the discrepancy and continuation gate.

The reviewed command source is consistent with verification work. No malicious
operation was identified in the reviewed strings/helper. That is a bounded
source finding, **not Microsoft's false-positive verdict**, a clean-machine
finding, or permission to evade/suppress the detection. Microsoft adjudication
or external submission, if desired, remains a separate user-authorized action.
