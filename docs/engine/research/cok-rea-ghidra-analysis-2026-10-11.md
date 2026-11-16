# REA analysis of Champions of Krynn

## Measured REA pilot

The user's suggested [REA project](https://github.com/morluto/rea) was exercised
through its installed 6.4.0 CLI and Ghidra 12.1.4 provider in WSL. The pinned
setup and reproducible commands are in
`rust/cok-recomp/README.md#optional-reaghidra-static-analysis` (the Rust lifted-code track is omitted from this draft; see [SHARE-REVIEW.md](../../../SHARE-REVIEW.md))..
Original game files were read-only; reconstructed binaries, analysis projects
and output remain ignored under `build/`.

REA verified **554/554 import checks** on the reconstructed DOS MZ image.
These checks establish the measured bytes, mappings, relocations and entry
context, rather than execution of the game. The analysis load segment was
1000h. The two supplied RNG function names were analyst seeds.

The selected step function's disassembly contains `MUL CS:[11FEh]`, but its
decompiled expression uses `DAT_111f_000e`, analysis linear address 111FEh.
The original routine's execution CS is 0A46h, so its constant is module offset
B65Eh and analysis address 1B65Eh. Direct unpacking of the held START.EXE
confirmed the original constant bytes there are `05 84`.

A separate actual Luna 6 read-only review confirmed the import count,
disassembly and incorrect pseudocode binding. The executable C lifter's
source-byte and runtime differential checks remain the basis for executing
this routine through Rust.

## Practical use

REA can provide static import evidence, instruction listings and candidate
function structure. The observed segment error means this pseudocode cannot
be compiled unchanged as faithful recovered C. There is no demonstrated REA
game boot or gameplay result. The existing mechanical ASM-to-C runtime
explicitly carries segment registers and remains the implementation path.

## Executed segment-context experiment

The standalone headless experiment is reproducible with the existing WSL
installation:

```powershell
./build/cok-recomp-tools/venv/Scripts/python.exe ./rust/cok-recomp/ghidra_context_analysis.py
```

It pins the held START.EXE and reconstructed MZ identities, checks the constant
through direct original unpacking, sets analysis CS=1A46h, clears the old
instructions and rebuilds the bounded bodies 1179h..118Eh and 11C8h..11FDh.
Old result files are cleared before running, so a failed rerun cannot inherit
an earlier successful result. Projects and evidence remain under
`build/rea/context-analysis/`.

The experiment completed. Every listed instruction had the supplied context
CS=1A46h, but MUL at 1A46:11D1 still referenced linear 111FEh; its pseudocode
still used `DAT_111f_000e`. **Setting context alone did not correct the binding.**

The installed Ghidra x86 language source `ia.sinc` contains this real-mode
rule:

```text
currentCS: CS is protectedMode=0 & CS {
    tmp:4 = (inst_next >> 4) & 0xf000;
    CS = tmp:2;
    export CS;
}
```

That rule explicitly assigns CS from the instruction address. The captured
p-code and unchanged target corroborate its effect in this experiment.
Installed language source SHA256:
`5112439554604933fb7f5d1afc123c0517727d4583c18bf795d0c49b66dd1570`.

The root agent repeated the headless experiment with the same failed
correction. Luna independently verified the saved evidence, pinned source/MZ
hashes and constant through original unpacking. Its read-only session could
not access WSL to recheck the installed language file directly; the actual
headless runs captured that file and its hash.

The report separates `experiment_completed=true` from
`context_correction_succeeded=false`. This is a standalone Ghidra experiment,
not a native REA CLI context-setting feature. It does not modify Ghidra's
language, demonstrate correct DS assumptions or recover an executable C ABI.

## Two missing-system experiments — executed 2026-10-15

At the user's request, Astra planned, Sol implemented the small analysis-tool
extension, and Luna executed two bounded REA experiments. The full playable
Rust reconstruction remains paused. No game was run and no gameplay source
was implemented by these experiments.

Both use the existing REA **6.4.0**, Node22.23.3, Ghidra12.1.4 and JDK21.0.12.1
installation. REA6.5.0 is now published, but no tool upgrade or agent-registration
change was made. This isolates the practical benefit of overlay preparation and
broader function analysis using the existing provider. The selected Ghidra
provider is healthy; the overall doctor still flags Ubuntu22.04 as an unsupported
host. This observed success does not establish general support for that host.

### DOS preparation and actual scope

`prepare_rea.py --descriptor` preserves the complete65,568-byte resident image,
its621 MZ relocations, and the original overlay bytes. It pads to module-relative
`0x20000` and appends one selected overlay. Each overlay fixup becomes an MZ
relocation `(offset=r, segment=0x2000)`; its original word remains unchanged.
Those words still reference the original resident segments/descriptors. Each
system has a separate analysis image, so overlay bodies do not overlap.

The measured Ghidra load segment is1000h, placing the appended body at linear
30000h / analysis CS3000h. This is an analysis placement, not an observed DOS
runtime address. It does not establish a fix for the earlier resident RNG
segment error. Function names below are analyst seeds, not recovered symbols.

| Experiment | Original descriptor / GAME.OVR base | REA function body | Bytes | Reported callees |
| --- | --- | --- | ---: | ---: |
| Character creation | A4 / 20209h | 306DDh..3257Bh | 7,839 | 27 |
| Save | 9E / 1D6DBh | 322DEh..32816h | 1,337 | 21 |
| Load | 9E / 1D6DBh | 31B34h..32107h | 1,492 | 23 |

These are Ghidra function-body observations, not proof of exhaustive original
control-flow coverage. A4:0884 is inside the creation function and was not seeded
as a separate function. The instruction query there correctly returns its
containing function at306DDh. The9E descriptor's public stub indices8/9 directly
confirm load1B34h/save22DEh. The historical `ovr017` document label is not a new
ordinal into the descriptor inventory, and CoAB function addresses were not reused.

Luna verifies both raw overlay bodies against GAME.OVR, all461/393 overlay
fixups and their unchanged words, the complete resident prefixes and both
artifact identities. Each REA load-image result is **verified,564/564 checks**.
The no-descriptor control still produces the original resident MZ SHA256
`b51f3fd69bc50e171a6e3429c7bc75df7cbc5c0a6e9bc993dacf4fdfd619f433`.

### Experiment 1: character creation

The actual dossier contains2,938 instruction rows,350 basic blocks and1,862
pseudocode lines. Its7839-byte region covers the existing06DD root through the
next source prologue at257C, providing substantially more context than the
previous164-instruction Pick Race admission.

Original-byte review corroborates the returned menu value stored at0884, the
zero/cancellation cleanup path, and ASCII `S` acceptance. Acceptance writes the
selected index minus one to character offset5Ah. Race-specific branches set
offset138h and call descriptorDB's stub57h. Those race-field facts were already
known or independently decoded; REA confirms and groups them rather than
discovering their semantic names from nothing.

The useful extension is the joined continuation: the same routine advances to
the original Pick Gender and Pick Class prompts. Gender acceptance writes the
index minus one at character109h; subsequent code uses race5Ah with a15-byte
stride into DS:3A50 to obtain the class-menu count. This exposes a coherent next
reconstruction scope and its table/helper dependencies.

The returned C is **not executable recovered source**. It warns about an abnormal
stack frame, changed SP and a removed unreachable block. Some `DAT_1bc6_ccxx`
variables represent actual SS:[BP-offset] locals; direct original instructions
at0884/0AAA establish the discrepancy. Next analysis should recover the shared
menu-return and far-call/stack-cleanup contracts before translating this complete
creation function into maintained C.

### Experiment 2: save/load

The save and load dossiers contain534/563 instruction rows and551/277 pseudocode
lines. REA groups paired block operations through resident0A46:14BB(save) and
14B4(load), with matching pointers/counts: one byte at DS5782, two800h-byte
buffers, one400h-byte buffer, five bytes at6D85, single-byte fields, three pairs
of words, character count and a148h-byte filename array. Direct original-byte
decoding corroborates the main pointer/length sequences. Their sum suggests a
5,469-byte main payload **conditional on the block-I/O helper contracts**; it is
not a verified complete save-file format or a runtime round trip.

The main filename is built from the path at DS5784, `savgam`, selected slot and
`.dat`. After the main-file phase, save follows the character linked list rooted
at DS609A, whose next pointer is at character17Fh/181h. It builds a
`CHRDAT`/slot/index name and invokes local helpers0BEDh/0A80h for each character,
then sets DS5885. Original Pascal strings distinguish slot selection,
insufficient space, unexpected save error and character-save warnings. This
separates main world-state persistence from per-character persistence.

Both dossiers report **zero referenced strings**. Prompt/file identities come
from independent original-byte decoding, not from a successful REA Pascal-string
inventory. The helper at linear30555h is inside this overlay at offset0555h,
not resident code. Save's pseudocode has stack-model warnings; load's cleaner
output also requires ABI and runtime verification. Next analysis should recover
14B4/14BB's byte-count/error contracts and the per-character helpers.

### Results, timing and reproduction

All eight CLI operations exit zero, with query contents independently inspected.
Character doctor/import/function/instructions take2/16/21/17 seconds; save/load
doctor/import/save/load take3/18/16/18 seconds: **111 seconds of recorded REA
command time**, excluding preparation and human/agent interpretation. No broad
regression, game execution, C compilation or Rust integration was performed.

Use a fresh output root; the overlay preparation and experiment runner reject
existing experiment outputs. For example, from the repository root:

```powershell
$run = Join-Path $PWD ('build/rea/two-' + [guid]::NewGuid().ToString('N'))
./build/cok-recomp-tools/venv/Scripts/python.exe -B ./rust/cok-recomp/prepare_rea.py --descriptor 0xa4 --out "$run/character-input.exe"
./rust/cok-recomp/rea-analysis.ps1 -Experiment character -ImagePath "$run/character-input.exe" -OutputDir "$run/character"
./build/cok-recomp-tools/venv/Scripts/python.exe -B ./rust/cok-recomp/prepare_rea.py --descriptor 0x9e --out "$run/save-load-input.exe"
./rust/cok-recomp/rea-analysis.ps1 -Experiment save-load -ImagePath "$run/save-load-input.exe" -OutputDir "$run/save-load"
```

Each CLI operation has a300-second timeout with10-second termination grace;
timings, exit codes, stdout and stderr are retained. The runner's generic warning
file describes the historical RNG issue, not a newly measured overlay failure.

Local ignored evidence is `build/rea/rea-two-20261015-a/`. Its coordinator summary
is SHA256 `bc8d8f4a6220a3143d5fbb274016da78604d0526770e98682031b2fd59bff4f4`.
Character/save/load dossier SHA256 values are respectively
`ad228d022f6c8d14df504733883ceb5a59f1aece38a7ac9a0c541c0042d49c14`,
`3369a3d6f1f9f57d9300ee4c8600b205fac774b72f15ce5eee4fc72e53d68c86`,
`b8226afae5e73d8e48b5a35b6601ffcb9fdf82067592d8391f843041b09080da`.
Original data, reconstructed MZ files and derived listings/pseudocode stay ignored.

The conclusion is limited but positive: **REA is useful for larger DOS function
and dependency analysis when overlays are explicitly prepared. These runs do not
yet supply faithful, compilable C or complete either gameplay system.**
