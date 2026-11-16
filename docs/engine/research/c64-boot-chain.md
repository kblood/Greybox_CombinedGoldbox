# C64 Gold Box boot and load chain (C1.9b)

Status: the boot-side half of the C1.9 "missing kernel" hunt is **solved**. The ten JSR/JMP
targets three earlier slices collected and could not place ($2E04, $2E25, $2E49, $2E84, $2E9A,
$3007, $30E2, $3B69, $3B70, $3EEC) all fall inside a file named **`LIBRARY`**, loaded to a
**non-page-aligned** address (**$2DC8**, decimal 11720) by a custom KERNAL LOAD call issued from
the tokenized BASIC boot program itself — which is exactly why the earlier page-aligned sweep
missed it. Tooling: `tools/c64_boot.py` (a BASIC V2 detokenizer + loader/dispatch-table decoder),
tests: `tools/test_c64_boot.py` (19 tests, all passing; three intentional mutations were applied
and confirmed to turn tests red, then reverted — see the note at the end of each section below).
Date: 2026-08-12.

## 0. Recap: what the prior two slices had already ruled out

Both are treated as established here, not re-derived (see the C1.9b task prompt for the full
detail and reproduction commands):

1. **Hidden file outside the directory** — refuted for the boot side. A BAM audit (track 18
   sector 0 vs. every block reachable by walking every directory entry's own chain) finds zero
   orphaned blocks anywhere on Champions of Krynn, and zero on Death Knights' boot side (side 1).
2. **Ordinary file, fixed but page-misaligned in the sibling agents' own sweep, disagreeing across
   titles** — a sweep of every side-1 file over every *page-aligned* origin $0200-$D000 found the
   best fit only 3 of 10 targets, with the winning file (`LIBRARY`) landing at *different*
   page-aligned addresses in the two titles ($2700 CoK vs. $2E00 DoK). That sweep's own
   constraint — page alignment — is exactly what this section's finding falls outside of; see §3
   for why the "disagreement between titles" observation was itself a sweep artifact, not a real
   disagreement.

## 1. The BASIC bootstrap: BOOT (CoK) / DEATH KNIGHTS (DoK)

Both titles' boot side carries a directory entry loading at **$0801** — BASIC's own program-text
start, not a machine-code entry point. That is why it "disassembles as incoherent 6502 from byte
0" under `c64_disasm.py`: it was never machine code. It is a **tokenized CBM BASIC V2 program**,
and `tools/c64_boot.py:detokenize()` reads it directly (link-listed lines, `$80+` token bytes,
`$22`-delimited quoted strings left untokenized).

Full text (Champions of Krynn `BOOT`; Death Knights' `DEATH KNIGHTS` is byte-identical apart from
the two title-print lines and a handful of whitespace/`REM`-comment differences — reproduced with
`python tools/c64_boot.py --disk <image> --list BOOT`):

```
10 POKE52,15:POKE56,15:CLR
11 POKE53280,0:POKE53281,0:PRINT"<$93>":DD=8
12 POKE969,RND(0)*256:REM SEED1+1
14 POKE 657,128
15 POKE646,1:VV=31744:POKEVV+672,0:POKEVV+887,0
16 PRINT:PRINT"   <$1E>           DRAGONLANCE":PRINT"     <$9E>     CHAMPIONS OF KRYNN."
17 PRINT"  <$9C>            VERSION 1.0 <$9F>"
18 GOSUB30000:N$="FASTL.O":FI=46848:GOSUB 20000
20 N$="LINKER":FI=11520:GOSUB 20000
30 POKEVV+785,3:REMNEXT PROG
32 POKEVV+786,1:REMDISK#
35 FOR L=1 TO 50:NEXT L
40 N$="LIBRARY":FI=11720:GOSUB 20000
41 SYS 11720
45 POKE910,DD:REM DRIVE#
50 FORL=1TO50:NEXT L
90 POKE650,128
100 N$="ITEMNAMES":FI=40448:GOSUB 20000
200 REM
220 POKE 53280,0
240 SYS 11520
999 END
20000 REM ** BIN LOAD (DOES NOT WORK IF              COMPILED BY INSTA-SPEED)
20005 REM IT WILL WORK WITH INSTA-SPD             IF THE GUNFIGHT MOD IS USED
20010 Z =INT(FI/256):POKE 780,15:POKE 781,DD:POKE 782,0:SYS 65466
20020 L=LEN(N$):FOR L1=1 TO L:POKE 40447+L1,ASC(MID$(N$,L1,1)) :NEXT L1
20030 POKE 780,L:POKE 781,0:POKE 782,158:SYS 65469
20040 POKE 780,0:POKE 781,FI-Z *256:POKE 782,Z :SYS 65493
20050 RETURN
21000 REM ** BIN SAVE
21010 Z=INT(EN/256):POKE 780,15:POKE 781,8:POKE 782,255:SYS 65466
21020 L=LEN(N$):FOR L1=1 TO L:POKE 40447+L1,ASC(MID$(N$,L1,1)):NEXT L1
21030 POKE 780,L:POKE 781,0:POKE 782,158:SYS 65469
21040 POKE 780,251:POKE 781,EN-Z*256:POKE 782,Z
21050 POKE 251,FI-INT(FI/256)*256:POKE 252,INT(FI/256):SYS 65496
21060 RETURN
30000 PRINT:PRINT"DISABLE FASTLOADER (Y/N) ?";
30010 GET X$:IFX$<>"Y"ANDX$<>"N"THEN 30010
30020 IF X$="Y"THEN PRINT"YES":Z=1
30030 IF X$="N"THEN PRINT"NO":Z=0
30040 POKEVV+741,Z:RETURN
59999 END
60000 OPEN15,8,15:PRINT#15,"S0:BOOT":CLOSE15:SAVE"BOOT",8
```

(Death Knights' copy is identical line-for-line down to the `FI=` values; reproduced with the same
command against `DEATH KNIGHTS`, see `tools/test_c64_boot.py::DeathKnightsBootChainTests`.)

### 1a. The load addresses ($4000 is never honoured)

`$65466`/`$65469`/`$65493` are the decimal forms of the KERNAL vectors `$FFBA` (SETLFS), `$FFBD`
(SETNAM) and `$FFD5` (LOAD) — this is a hand-rolled machine-level LOAD wrapper, not the BASIC
`LOAD` statement. The load line matters:

```
20010 ... POKE 782,0 : SYS 65466      ; SETLFS  A=15  X=DD(device)  Y=0 (secondary address)
20040 POKE 780,0:POKE 781,FI-Z*256:POKE 782,Z:SYS 65493   ; LOAD  A=0  X/Y = FI
```

Secondary address (the `Y` passed to SETLFS) is the switch between the two well-known C64
behaviours normally reached via `LOAD"X",8` vs. `LOAD"X",8,1`: **secondary address 0 means "ignore
the file's own 2-byte embedded load address and use the caller's X/Y instead"**; secondary address
1 means "honour the file's own header." This boot stub always uses **0**, so `FI` — a BASIC
variable, one per file — is the file's *real* runtime load address, and the value stored in every
file's own on-disk 2-byte header ($4000, uniformly, per `tools/c64_disk.py:load_address`'s
docstring) is **never read for anything by this loader**. This sharpens that docstring's existing
"carries almost no information" to "is not used by the game's own loader at all," at least for
every file loaded through this path.

`tools/c64_boot.py:parse_loader_calls()` extracts these calls by regex from the detokenized text.
Both titles load:

| File | `FI` (decimal) | Address | Role |
| --- | ---: | --- | --- |
| `FASTL.O` | 46848 | `$B700` | fast loader (see §4) |
| `LINKER` | 11520 | `$2D00` | resident overlay dispatcher (see §2) |
| `LIBRARY` | 11720 | **`$2DC8`** | shared subroutine library — **the missing kernel** (see §3) |
| `ITEMNAMES` | 40448 | `$9E00` | filename staging buffer (also where `N$` itself gets POKEd, at $40447+1 = $9E00 — the loader reuses its own name-scratch area) |

Line 41 `SYS 11720` runs LIBRARY immediately after loading it. Line 240 `SYS 11520` — the BASIC
program's last executable statement — hands control to LINKER at `$2D00`, and BASIC itself never
runs again.

*Mutation check:* the `_LOAD_RE` regex in `parse_loader_calls` was edited to require
`GOSUB 99999` instead of `GOSUB 20000`; both `ChampionsBootChainTests` and
`DeathKnightsBootChainTests` loader-call tests went red (empty dict vs. the expected four
entries), then the edit was reverted and a byte-diff against the pre-mutation file confirmed an
exact restore.

## 2. LINKER: the resident overlay dispatcher at $2D00

Disassembling `LINKER`'s body (146 bytes in CoK, 75 in DoK) at origin `$2D00` — the address the
BASIC stub itself supplies, not a guess — produces fully coherent code in both titles:

```
2D00  AD 11 7F   LDA $7F11        ; "next program" index, set by BOOT (POKE VV+785,...)
2D03  D0 0B      BNE $2D10
2D05  AD 12 7F   LDA $7F12        ; "disk#", set by BOOT (POKE VV+786,...)
2D08  8D EE 4B   STA $4BEE
2D0B  A9 01      LDA #$01
2D0D  8D 12 7F   STA $7F12
2D10  20 BF 3C   JSR $3CBF        ; both call into LIBRARY's range (see §3) --
2D13  20 F3 47   JSR $47F3        ; one-time init, run once per LINKER entry
2D16  A9 00      LDA #$00
2D18  8D FC 03   STA $03FC
2D1B  AE 11 7F   LDX $7F11        ; X = dispatch-table index
2D1E  BD 79 2D   LDA $2D79,X      ; name pointer low byte  -> $3214
2D21  8D 14 32   STA $3214
2D24  BD 83 2D   LDA $2D83,X      ; name pointer high byte -> $3216
2D27  8D 16 32   STA $3216
2D2A  BD 6F 2D   LDA $2D6F,X      ; name length            -> A (loader argument)
2D2D  A2 00      LDX #$00
2D2F  A0 08      LDY #$08         ; device 8
2D31  20 CD 31   JSR $31CD        ; LIBRARY's own file-load routine (inside $2DC8-range, see §3)
2D34  F0 06      BEQ $2D3C
2D36  20 98 42   JSR $4298        ; (LIBRARY range) error/retry path
2D39  4C 1B 2D   JMP $2D1B
2D3C  20 00 08   JSR $0800        ; run the overlay just loaded, AT $0800
2D3F  4C 00 2D   JMP $2D00        ; loop: fetch the next "next program" index
```

So LINKER is a tight polling loop: read a global flag byte at `$7F11` (inside the project's
already-established `$7E00-$7FFF` shared flags block), look up an overlay's name/length/pointer in
an internal table, call into LIBRARY to load it (over the *same* SA=0-override KERNAL LOAD path as
§1, since $31CD is inside LIBRARY's range — see §3), `JSR $0800` to run the freshly-loaded overlay,
then loop. **This is the mechanism behind the project's already-established `$0800` overlay slot**
(DUNGEON/COMBAT/CAMP/GEN/COM.PREP/POST.COM/INIT): LINKER is what puts each of those there, one at
a time, on demand.

### 2a. The dispatch table

Immediately after LINKER's code (from `$2D42` in CoK) sits an ASCII blob:

```
GENDUNGEONCOMBATINITCOM.PREPPOST.COMFINALCAMP
```

followed by three parallel 10-byte tables — length, pointer-low, pointer-high — indexed by the
same `X` (`$7F11`'s value) the code above uses. `tools/c64_boot.py:find_dispatch_table()` decodes
this (requiring both the address arithmetic AND the length-table entry to agree, since two of the
ten slots are unused padding that alias a real slot's *address* but not its *length* — see the
worked table below):

| index | name | length | address |
| ---: | --- | ---: | --- |
| 0 | `GEN` | 3 | `$2D42` |
| 1 | `DUNGEON` | 7 | `$2D45` |
| 2 | `COMBAT` | 6 | `$2D4C` |
| 3 | `INIT` | 4 | `$2D52` |
| 4 | `COM.PREP` | 8 | `$2D56` |
| 5 | `POST.COM` | 8 | `$2D5E` |
| *6, 7* | *(padding — alias slot 8's address, wrong length)* | | |
| 8 | `FINAL` | 5 | `$2D66` |
| 9 | `CAMP` | 4 | `$2D6B` |

**Death Knights' `LINKER` is only 75 bytes — too short to hold this table** — and its code
references the table at `$4ADF`/`$4AE9`/`$4AD5`, which lands inside `LIBRARY`'s own range instead
(§3). Reading DoK's `LIBRARY` at that offset finds the *same* eight names, this time
NUL-separated (`GEN\0DUNGEON\0COMBAT\0...`) rather than concatenated, with the identical
three-table layout and the identical two-padding-slot pattern. So the two titles use the same
overall dispatch design; only *where* the table itself is stored differs between builds.
`find_dispatch_table()` handles both encodings (`style="unsep"` / `style="nulsep"`) and
`tools/test_c64_boot.py` pins both.

**Open item: `FINAL` has no matching file on any side.** `GEN`, `DUNGEON`, `COMBAT`, `INIT`,
`COM.PREP`/`COMPREP`, `POST.COM`/`POSTCOM` and `CAMP` all correspond to real, loadable files (the
first six already known from the established `$0800` slot list; `CAMP` too). `FINAL` does not —
verified by scanning the directory of every Champions side (1-6 plus the savedisk) and every Death
Knights side (1-6) for a file literally named `FINAL`: none exists anywhere in either corpus.
Since the table is read by *index*, not by presence, this is not fatal to the game (**index 8** —
corrected 2026-08-12; this said index 6, which is a padding slot, see `c64-resident-kernel.md`'s
dispatch-table decode — if it were ever legitimately selected, would presumably never be reached
rather than crash outright. A later corpus-wide reachability census found no site that literally
resolves to it, supporting "vestigial" over "reachable but broken"). Filed as an
honest gap, not resolved further: either `FINAL` shipped on a disk this collection does not have
(the project's own docs describe all seven titles' sets as complete, which argues against this),
or it is dead/legacy naming from a build where an ending sequence was later merged into another
overlay and the table was never cleaned up, or ending content name in-code differs from the
listing on disk (all speculative). `tools/test_c64_boot.py::test_final_has_no_matching_file_on_any_side`
pins the *current* state of this gap so a future disk re-scan that changes it will be noticed.

### 2b. Independent confirmation that `$2D00` is really LINKER's origin: `STOP.PRG`

`STOP` (present only on Champions side 1, the boot side) is 13 bytes of code, unrelated to the
dispatch-table reasoning above:

```
78          SEI
A9 8D       LDA #$8D
8D 28 03    STA $0328   ; ISTOP (the KERNAL's indirect STOP-key vector), low byte
A9 2D       LDA #$2D
8D 29 03    STA $0329   ; ISTOP, high byte  ->  installs vector $2D8D
58          CLI
60          RTS
```

`$2D8D` is inside LINKER's own body, immediately after its dispatch tables end, and decodes to a
short, entirely coherent STOP-key-check routine:

```
2D8D  A5 91      LDA $91      ; STKEY, the KERNAL's own stop-key zero-page flag
2D8F  C9 7E      CMP #$7E
2D91  60         RTS
```

This is (a)-type evidence per the project's origin-evidence rules (`docs/c64-boot-chain.md`'s
parent doc, `c64-disk-format.md`): an *independent* file's own absolute operand lands inside
`[$2D00, $2D00+146)` on a real instruction boundary that makes sense given its name. It does not
depend on, and was found separately from, the dispatch-table parsing.

*Unresolved:* `STOP` is never loaded by either title's BASIC boot stub (it does not appear in
either detokenized listing, and it is not one of LINKER's 8 named overlays). Something else
(most plausibly LIBRARY or an overlay's own code, at a point past what this static slice
disassembled) must load it — noted as an open thread for whoever next reads LIBRARY's interior in
full, not resolved here.

*Mutation check:* `test_stop_prg_installs_a_stop_key_vector_into_linkers_tail` was first written
with wrong byte offsets (an off-by-one from a hand-count) and failed for real on the actual file
before the offsets were corrected against a hex dump — see the git history of
`tools/test_c64_boot.py` for that fix in place; the corrected version passes and a boot-side read
of a scrambled/zeroed `STOP` body (tried by hand during development, not committed) reliably fails
the opcode-sequence assertions.

## 3. LIBRARY: the kernel, hiding in plain sight at $2DC8

`LIBRARY` is a real, listed, directory-visible file on every side of both titles — it was never
missing, and the BAM audit in §0 correctly found no orphaned blocks, because there is nothing
orphaned. What made it invisible to the earlier page-aligned sweep is that its real load address,
**$2DC8, is not a multiple of 256** (`0x2DC8 mod 256 = 0xC8`). A sweep that only tries
page-aligned origins structurally cannot find it, regardless of how it scores.

Body size and range (computed from the actual files, not assumed):

| Title | File bytes (incl. 2-byte header) | Body bytes | Range |
| --- | ---: | ---: | --- |
| Champions of Krynn | 7437 | 7435 | `$2DC8`-`$4AD3` |
| Death Knights of Krynn | 7469 | 7467 | `$2DC8`-`$4AF3` |

All ten of the previously-unassigned targets fall inside both ranges:

```
$2E04 $2E25 $2E49 $2E84 $2E9A $3007 $30E2 $3B69 $3B70 $3EEC
```

(`tools/test_c64_boot.py::LibraryKernelRangeTests` checks this arithmetically for both titles.)

Disassembling `LIBRARY` at `$2DC8` produces recognizable, self-consistent code at essentially all
ten targets (`--org 0x2DC8` on `tools/c64_disasm.py`; representative excerpts, full output
reproducible with the commands in §5):

- **`$2E04`/`$2E25` (CoK)** — a run of 12 `JMP` absolute instructions (a jump table). 11 of the 12
  targets land inside LIBRARY's own range; the exception is the entry at `$2E10`, `JMP $0803`,
  which targets the project's established `$0800` overlay slot instead — plausibly a "run the
  overlay already loaded there" table slot, consistent with LINKER's own `JSR $0800` (§2). Verified
  by disassembling all 12 entries (`--org 0x2DC8 --start 0x2E04 --count 12`); an earlier draft of
  this section claimed every entry lands inside LIBRARY and that was wrong.
- **`$2E84`/`$2E9A` (CoK)** — `$2E9A` is `LDA $03CD; JSR $2E84; STA $4E; STX $4F; RTS`: a short
  wrapper calling straight into the OTHER established target 22 bytes below it, self-consistently.
- **`$2E49` (DoK)** — the *DoK-side* target for the same call site (MON's name-scrub pointer
  setup calls `$2E9A` in CoK, `$2E49` in DoK): decodes to `LDA $03CD; JSR $2E2D; STA $4E; STX $4F;
  RTS` — the identical routine shape, shifted, in the other title's build. This is exactly the
  cross-title corroboration the project's origin-evidence rules ask for (target type (c):
  callers/callees agreeing across both titles, not just one).
- **`$30E2` (DoK)** — `INX; LDA #$00; STA $03D0,X; DEX; BPL $30E5; STA $03DD`: a clean
  buffer-clearing loop.
- **`$3B69`/`$3B70` (CoK)** — `SEI; PHA; LDA #$F9; JMP $3B76` / `PHA; LDA #$06; JMP $3B7C`: a
  paired IRQ-vector-install pattern (classic C64 idiom), two adjacent entry points into what is
  evidently one routine.
- **`$3EEC` (both titles)** — stores into `$7F3F`/`$7F40` (CoK) and `$7F6E`/`$7F6F` (DoK): inside
  the project's already-established `$7E00-$7FFF` shared global/flags block, matching what a
  shared "library" routine touching global state should look like.

`$31CD` (CoK) / `$3186` (DoK) — the routine LINKER's dispatch loop calls to actually load an
overlay (§2) — is also inside this range, which is why the module is named `LIBRARY`: it is a
shared subroutine library that both the boot stub's own machine-level LOAD wrapper and LINKER's
runtime dispatcher call into, plus the ten previously-mystery entry points other overlays
(`GDRIVE00`, `GDRIVE02`, `MON`) call for common services (jump-table dispatch, pointer/string
setup, buffer clearing, IRQ installation, and global-flag manipulation).

**Negative control** (`test_a_page_aligned_origin_does_not_also_explain_all_ten`): the nearest
page boundary, `$2E00`, still covers most of the ten targets by virtue of being close to the real
origin — the point is not that a page-aligned origin looks implausible by pure range coverage, but
that only `$2DC8` is independently justified, by the boot program's own `FI=11720` value and (in
Champions) by `STOP.PRG`'s unrelated vector-install landing on coherent code at that exact origin
in the *neighbouring* file, LINKER. The earlier sweep's "disagreement between titles"
($2700 CoK / $2E00 DoK) is now explained as an artifact of forcing a page-aligned fit onto a file
whose real origin isn't one — both of those page-aligned guesses were wrong, and the *real*
address, $2DC8, agrees exactly between titles.

*Mutation check:* `find_dispatch_table`'s length-disambiguation guard (the part of §2a's parser
that tells slot 8's real `FINAL` entry apart from padding slots 6/7, which alias its address) was
removed and both dispatch-table tests failed with `('FINAL', 8)` in place of the correct
`('FINAL', 5)` — precisely the bug the length check exists to catch — then the removal was
reverted and a byte-diff against the pre-mutation file confirmed an exact restore.

## 4. FASTL.O: the fast loader at $B700

Loaded to `$B700` (46848) and disassembled there:

```
B700  A9 79      LDA #$79
B702  8D 30 03   STA $0330    ; ILOAD (the KERNAL's indirect LOAD vector), low byte
B705  A9 B7      LDA #$B7
B707  8D 31 03   STA $0331    ; ILOAD, high byte -> installs vector $B779
B70A  A9 3F      LDA #$3F
B70C  8D 02 DD   STA $DD02    ; CIA2 port A data direction register (the serial/IEC lines)
...
```

This hijacks the KERNAL's own `LOAD` indirect vector (`$0330`/`$0331`) to point at FASTL.O's own
routine (`$B779`) and reprograms CIA2's serial-port data direction register — the standard
building blocks of a C64 "fast loader" that bit-bangs the 1541 serial bus faster than the stock
KERNAL protocol. Every `LOAD` call made after this point in the boot sequence (LINKER, LIBRARY,
ITEMNAMES, and every later overlay LINKER dispatches) therefore goes through FASTL.O's routine,
not the ROM KERNAL. Consistent with the filename and with `BOOT`'s own line 18/30000
"DISABLE FASTLOADER (Y/N)?" prompt (an option to skip this installation, presumably for real
hardware/drive combinations the custom protocol doesn't suit).

## 5. Other loader-adjacent files: what was, and was not, established

| File | Role | Evidence |
| --- | --- | --- |
| `LINKER` | resident overlay dispatcher, `$2D00` | §2 (disassembly, dispatch table, STOP-vector cross-check) |
| `LIBRARY` | shared subroutine library / the sought kernel, `$2DC8` | §3 |
| `FASTL.O` | fast loader, `$B700` | §4 |
| `STOP` | installs a custom STOP-key vector into LINKER's tail | §2b |
| `ITEMNAMES` | filename staging buffer at `$9E00` (shared with the loader's own name-poke target `40448`) | §1a; not independently disassembled beyond the address match |
| `SECSET02`, `SECSET10` | **not code.** Both open with long runs of `$FF` or other non-code-looking repeated/structured bytes (`SECSET02`'s first 32 bytes: `FF`x11, `00`, `AA AA`, then a long run of `55`; `SECSET10`'s first 32 bytes: mostly `$00` with a handful of `$01`/`$C0`/`$3F`/`$FE` bytes scattered in). `$FF` is the classic GCR *sync* byte pattern. Present only on Champions side 1. **Role not established** — plausibly a low-level sector/GCR template the fast loader or a protection check consults, given the name ("SECtor SET") and the sync-like leading bytes, but this is a labelled inference, not a proven one; no code was found that reads them (a search was not exhaustive — bounded by this slice's time budget, not a negative result). |
| `SECSET64` | present on **every** side of both titles (12/12, verified excluding the savedisk, which has no `SECSET64` entry). Its first bytes decode as plausible 6502 (repeated `JSR` opcodes) at the arbitrary origin `$4000`, but per the project's own standing warning, plausible-looking decode at an unverified origin is not evidence of anything — a full disassembly of the file's 1535-byte body at `$4000` finds `JSR` targets spanning `$099C`-`$FDD0` (absolute `JMP` targets included, `$085B`-`$FDD0`; a previous draft of this row cited `$0DE1`-`$FB6F`, which understated the true max by about 0x260 bytes — `$FB6F` is a real repeated `JMP` target in the file, just not the extreme one), with no coherent origin fit attempted or found. **Deliberately left UNRESOLVED** rather than asserted as code or data; a real answer needs either a caller (nothing in `BOOT`/`LINKER`/`LIBRARY`/`FASTL.O` loads or calls it by the names/addresses this slice covered) or a disassembly at a properly justified origin, neither found here. |

### 5a. Does the loader read by filename, or by track/sector?

**By filename**, exclusively, everywhere this slice looked. Every load in `BOOT`/`DEATH KNIGHTS`
goes through `SETNAM` with an ASCII name (`N$`) and ordinary KERNAL `LOAD`; LINKER's own dispatch
loop does the same via its internal name table (§2a). No direct track/sector `B-R`/`U1`/`U2`-style
disk command was found in the boot stub or in LINKER's disassembly. This settles the corpus'
"could a kernel live inside a file at an offset the directory doesn't describe" question in the
negative for THIS loader: the mechanism that made LIBRARY hard to find was an unusual *load
address*, not a bypass of the filesystem. (This does not rule out low-level track/sector access
existing somewhere in FASTL.O's own protocol implementation, which was not fully disassembled —
its purpose there would be to talk to the drive's own serial protocol faster, not to hide data
from the directory, and no evidence of the latter was found.)

> **Cross-reference added 2026-08-12 by the lead session.** The sibling doc
> `c64-resident-kernel.md` states, of the same corpus, that it "loads via a **custom raw-sector
> protocol**, not KERNAL `LOAD`". Read side by side that looks like a flat contradiction of the
> paragraph above; it is not, because the two describe **different layers of the same call**.
> §4's `STA $0330` is exactly what joins them: every *call site* issues an ordinary
> `SETNAM`/`SETLFS`/`LOAD`, and the *service routine* `$FFD5` dispatches to through `ILOAD` is
> FASTL.O's raw-sector fastloader, not the ROM's. Both statements stand as written. This
> paragraph's claim is about call sites and filenames; the sibling's is about what runs
> underneath — and the parenthesis above already allowed for precisely that.

## 6. Death Knights' orphaned BAM blocks (sides 3-6): not a hidden kernel

Reading the five orphaned blocks (BAM-allocated, unreachable from any directory entry's chain) on
each of sides 3, 4, 5 and 6, at the exact coordinates the lead session's audit reported:

| Side | Blocks | Content |
| --- | --- | --- |
| 3 | `(27,4) (35,5) (35,6) (35,7) (35,8)` | every block: byte 0 = `$4B`, byte 1 = `$01`, bytes 2-255 all `$01` |
| 4 | `(1,14) (1,15) (1,16) (1,17) (9,14)` | tracks 1 blocks: byte 0 = `$00`; track 9 block: byte 0 = `$4B`; byte 1 and all remaining bytes = `$01` |
| 5 | `(27,7) (35,8) (35,9) (35,10) (35,11)` | same pattern as side 3 |
| 6 | `(1,14) (1,15) (1,16) (1,17) (8,14)` | same pattern as side 4 |

Every one of these 20 blocks (5 x 4 sides) is a **uniform fill byte (`$01`) across its entire
254/255-byte body**, differing only in the leading pseudo-link byte (`$4B` = decimal 75, an
impossible track number on a 35-track image, on the track-27/35 blocks; `$00` — a "no next
sector" marker with an implausible byte-count of 1 — on the track-1 blocks). This is not a hidden
kernel, not compressed data, and not anything resembling code: it is a small, uniform padding
pattern, most plausibly a disk-mastering/duplication fill value written into blocks the BAM marks
used but that no file's chain ever claims. It is the same general phenomenon (unwritten space
flagged allocated) as the much larger, genuinely-damaged Curse of the Azure Bonds side 4 case
described in `docs/engine/research/c64-disk-format.md` §0, just far smaller (1270 bytes total per
side) and on an otherwise clean, fully-readable image. **This closes task (d): the DoK orphaned
blocks are filler, not a lead worth following further.**

`tools/test_c64_boot.py::OrphanedBlockTests` pins the exact block sets and the uniform-content
property for all four sides, plus a positive control
(`test_mutating_the_filler_byte_is_detected`) that flips one byte inside a copy of a "uniform"
block and confirms the uniformity assertion actually notices.

## 7. Reproducing everything in this document

```powershell
# Detokenize a boot program
python tools/c64_boot.py --disk "D:\Games\Emulator\C64\Goldbox\Champions of Krynn\Champions of Krynn - Side 1.D64" --list BOOT

# Summarize the load chain (files + addresses + SYS targets)
python tools/c64_boot.py --disk "D:\...\Champions of Krynn - Side 1.D64" --loader BOOT

# Decode LINKER's (or LIBRARY's) overlay dispatch table
python tools/c64_boot.py --disk "D:\...\Champions of Krynn - Side 1.D64" --dispatch LINKER --org 0x2D00
python tools/c64_boot.py --disk "D:\...\Death Knights of Krynn - Side 1.D64" --dispatch LIBRARY --org 0x2DC8

# Disassemble LIBRARY at its real origin near any of the ten established targets
python tools/c64_disasm.py <extracted LIBRARY.prg> --org 0x2DC8 --start 0x2E9A --count 8

# Full test suite for this slice
python -m pytest tools/test_c64_boot.py -v
```

## 8. What is still open

- **`FINAL`** (§2a): a real dispatch-table entry naming an overlay that exists on no side of
  either title. Not resolved; pinned as a gap.
- **`STOP.PRG`'s own loader** (§2b): its role and installed vector are proven; who loads `STOP`
  itself is not.
- **`SECSET02`/`SECSET10`/`SECSET64`** (§5): named, located, but their actual role is not
  established — `SECSET64`'s status is explicitly "code-shaped bytes at an unverified origin,"
  which the project's own standing rules treat as no evidence at all.
- **`CODE00`/`CODE01`/`CODE03`** (seen in Death Knights' directory, not investigated this slice):
  plausibly further sub-overlays loaded by `GEN`/`DUNGEON`/etc. themselves rather than by
  `LINKER`'s 8-entry table, but this is speculation — out of scope for this slice, worth a future
  pass if the sibling kernel-hunt agent wants to read further into `LIBRARY`'s interior.
- **LIBRARY's own full disassembly**: this slice confirmed the ten previously-known targets and
  traced a handful of call sites (`$31CD`/`$3186`, `$3CBF`, `$47F3`, `$4298`) by name only, from
  LINKER's own code. A full map of LIBRARY's ~7.4 KB interior (what each of its many likely entry
  points does) was not attempted and is a natural next step for whoever owns the kernel-hunt
  thread next.
