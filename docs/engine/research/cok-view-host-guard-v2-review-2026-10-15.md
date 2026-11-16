# View host guard v2: source review and diagnostic gates

2026-10-15. Astra source review only; no candidate import, decoder, test,
compiler or application was executed by this review.

## Frozen scope

Candidate: `build/cok-recomp/character-view-host-guard-sol-20261015-v2`.
`source-freeze.json` SHA-256:
`a40b6dacbf1e0aa9c92dd099abffb51bc341da20f121addf0f06d68523b592d7`.
All 972 entries were independently rehashed with no mismatch. The 16-entry
delta, handoff, classification/ABI controls, original recovery dependencies,
runtime helper source and domain proposals were inspected. The literal sibling
`character-view-host-guard-sol-20261015-v2.LUNA-COMMANDS.json` hashes to
`db6dc7aafdea9e44560c1cfe0af2809593648ae470b2c9a23a2b460bdcffdb92`.

The inherited accepted WORLD admission remains 35,740 instructions / 91,590
bytes. View's proposed union remains 30,900 / 32,768 bytes, with 1,868 bytes
headroom. The previous 131,071 / 131,072 exhausted analysis and its pending
work remain evidence; recovery membership does not establish closure.

## Findings and boundary

The misleading closure field is replaced by `target_function_recovered`.
All 228 slots and 189 targets retain pending/support status; no slot is made
supported by mere membership. Conservative register handling now covers
XCHG, MUL/DIV, sign extension, string operations, stack operations, calls and
unknown instructions. Original-source and synthetic transfer controls are
authored against the actual classifier.

The six original ABI helper walks preserve call dependencies, returns,
register writes, physical-byte charging and bounded pending work. Incoming
caller evidence explicitly does not claim global completeness. Two remaining
limits prevent accepting every published summary as proved:

1. `abi_controls.py` independently checks `preserves_BL_proved`, but does not
   check `preserves_AX_proved`.
2. `prepare_abi.py` sets `source_CFG_complete` false for pending/computed gaps
   only. Other unresolved edges can remain while this flag is true; its
   verifier does not independently establish the unresolved roster/flag.

These flags must not close a host contract even if v2 diagnostic controls
pass. A separate narrow Sol v3 should recompute both preservation summaries
from independently decoded writes, unknown effects, complete unresolved
roster and returns. Make local CFG completeness conservatively require no
unresolved gaps (or explicitly distinguish and independently validate known
terminal edges). Add AX-flip, unresolved-edge omission/addition and
completeness-flip mutants, including a non-computed unresolved edge; keep the
low-budget pending control. Do not replace original return/call evidence with
an assumed ABI summary or widen caps.

The runtime unit now exercises actual initializer and far-pointer guards:
generation, stack identity/return words, pointer halves, owner aliases,
ordered initializer calls, unloaded stubs, prior fault/evidence stop and
stack/table alias behavior. The guest.c delta adds evidence-stop checks to
the actual far-call helper. The unit extracts that helper and uses the actual
View runtime source, with explicit memory/body/stub doubles. Its synthetic
two-slot support fixture is not evidence that real View slots are supported.

## Exact Luna gates

Approve the following commands only as diagnostics and standalone synthetic
controls. Require a fresh absent output root, pre/post freeze and executable
hashes, raw stdout/stderr, actual process/PID/UTC/exit receipts. Stop on any
failure; no implicit repair or continuation to native work.

```powershell
$candidate='C:\Modding\GoldBox\build\cok-recomp\character-view-host-guard-sol-20261015-v2'
$out='C:\Modding\GoldBox\build\rea\rea-view-host-guard-v2-luna-20261015-a'
$python='C:\Modding\GoldBox\build\cok-recomp-tools\venv\Scripts\python.exe'
$freeze='a40b6dacbf1e0aa9c92dd099abffb51bc341da20f121addf0f06d68523b592d7'
& $python -B "$candidate\source_controls.py" --out "$out\classification-controls" --source-freeze-sha256 $freeze
& $python -B "$candidate\abi_controls.py" --out "$out\abi-controls" --source-freeze-sha256 $freeze
```

Execute each separately and inspect its actual exit before continuing. ABI
controls acquire two fresh diagnostics and a low-local-budget case; they
do not authorize interpreting the two limited flags above as proved.

Separately approved compiler gate, only after classification controls pass:

```powershell
& $python -B "$candidate\runtime_unit_controls.py" --classification "$out\classification-controls\one\classification.json" --compiler 'C:\Program Files\LLVM\bin\clang.exe' --compiler-sha256 '817b71c3e9d68dea68ba1a00a1add9e0a87cbb1d781abef1280eb495d0904ae8' --out "$out\runtime-unit" --source-freeze-sha256 $freeze
```

The reviewed Python executable is 255,320 bytes, SHA-256
`200d001707ed494066ef00e31e38330e32490c2a74a450ca5d66d2179396fd0e`;
Capstone must match the frozen 5.0.7 dependency. Clang is 87,157,760 bytes
with the command's hash. Both executable hashes were read independently.
This permission is for compiling/running the standalone guard unit only.
Serialize with other native artifact users and retain emitted C/helper hashes.

## Host contracts remain open

The 22 interrupt sites contain 20 returning contracts and two terminal sites.
The returning contracts comprise three vector, four keyboard, video, clock,
DTA, find, two file-caller, close, four seek, AH=06 and AH=30 contracts.
All need their actual caller/request/response/flags and memory domains closed.

AH=06's original output path constrains the proposed character to a nibble,
but a JSON event or B8000 shadow does not render the mode-0D EGA display.
Actual glyph/cursor/wrap/scroll behavior and display/device context remain
required. AH=30's proposed AX=0004/BX=FF00/CX=0000 is an explicit DOS persona
proposal, not an observed current handler; its DOS>=3 environment path and
PSP/environment trailer need a complete contract, including unaffected
registers and flags. Neither proposal authorizes implementation/admission.

No native build, View, Save, Begin, guest-byte admission, production source
promotion or handler implementation follows from this review or from a future
diagnostic PASS. Root must review actual receipts and the remaining contracts.
