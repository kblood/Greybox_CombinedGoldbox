# REA: original Add and character-file functions

Luna completed two fresh, read-only REA experiments after Astra reviewed the
fixed overlay mappings and source guards. Both outer processes and every
recorded child command exited 0. This is static-analysis evidence; no game
application or DOSBox was run by these experiments.

Local outputs: `build/rea/rea-add-files-20261015-a/`.
Receipt: `receipt.json`, SHA256
`6205017f882f7e588143c2f6f1978943c64c9a76b337c38d7b6a3deaba22dabb`.
Original-derived images and function dossiers remain ignored.

## Reproducible entry points

`rust/cok-recomp/rea-analysis.ps1` now accepts two additional fixed experiments:
`add` and `character-files`. Prepare each original overlay separately with
`prepare_rea.py`, descriptor A4 and 9E respectively, then supply its image using
`-ImagePath`, a fresh `-OutputDir` and the corresponding `-Experiment`.
The existing RNG, creation and save/load experiments remain available.

The new branches validate the complete prepared MZ hash, original source/body
and relocation identities, descriptor and preparation map before invoking REA.
Both fresh images matched their fixed hashes. Both imports independently
verified 564/564 checks at load segment 0x1000. Overlay analysis base 0x30000
belongs to one separately prepared overlay at a time; it does not identify a
shared original segment or justify merging overlay namespaces.

Four negative controls exited 1 at the exact fixed-image/provenance guard and
created no REA output: A4 supplied to character-files, 9E supplied to Add, and a
byte-mutated image with an updated sidecar hash for each experiment. Production
analysis source, preparer and original START.EXE/GAME.OVR pins matched before
and after the pass.

## Observed function bodies

Root independently inspected these returned procedure entries and inclusive
Ghidra body ranges:

| Overlay | Original entry | Analysis range | Bytes |
| --- | --- | --- | ---: |
| A4 | 37A2, Add | 337A2–33B09 | 872 |
| 9E | 0453, list setup | 30453–304D6 | 132 |
| 9E | 008B, enumeration | 3008B–3044C | 962 |
| 9E | 11E5, reader | 311E5–315EE | 1,034 |
| 9E | 1989, insertion | 31989–31ABF | 311 |

The dossiers include assembly, blocks, references, calls and pseudocode. The
Add body agrees with the original boundary used by the
[cold Add plan](cok-cold-character-add-plan-2026-10-15.md). Returned insertion
pseudocode also references the already identified party/current-pointer globals
609A/609C and 6096/6098. These observations aid review; actual record reads,
pointer reconstruction, original rejection paths and the full Add/View workflow
still require the separate headless runtime test.

Astra reconciled all five bodies with the original inventory; instruction/call
counts match at 321/28, 58/4, 377/39, 374/46 and 98/3 respectively. No missing
dependency was found. Original 069C:04A8 loads AX=1, pushes it at04AB and calls
0A46:13C9 at04AC on the successful reader-open path, establishing record size1
there. This supports interpreting409/63/9 as requested byte lengths; actual
open/read counts remain a runtime gate. Reader reconstruction relinks copied
STF nodes at+2A/+2C and SFX nodes at+5/+7 with zero termination; insertion assigns
slot+137 and increments party count. Preserve the original instructions for
these actions. See the [assembly reconciliation](cok-cold-add-rea-reconciliation-2026-10-15.md)
for precise pointer fields and the remaining runtime assertions.

## Tool and interpretation limits

Tools: REA 6.4.0, Ghidra 12.1.4, Node 22.23.3 and JDK 21.0.12.1. Selected Ghidra
provider checks passed. The doctor also reported aggregate
`environment_healthy=false`; the script's selected-provider contract passed,
so this must not be described as a completely healthy aggregate environment.

The original CS-context/segment-binding warning and decompiler limitations are
retained. Seeds assert analysis entry points. Ghidra pseudocode does not supply
faithful executable C or measured DOS/device semantics. The mechanically lifted
guest remains validated against original bytes; filesystem behavior comes from
the separate [owned DOS oracle](cok-character-search-adapter-plan-2026-10-15.md).
