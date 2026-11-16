# Unicorn Engine dynamic trace of DQK.EXE — E6.2b-4 continuation

> Scope: use the Unicorn Engine Python x86 emulator (confirmed installed: `unicorn` 2.1.4,
> alongside `capstone` 5.0.7 already used by `tools/disasm_dqk.py`) to build a minimal
> real-mode DOS harness that boots `The Dark Queen of Krynn/DQK.EXE` far enough to observe
> the copy-protection journal-word check dynamically, since `docs/engine/research/
> dqk-copy-protection.md` ("Overlay 12 static analysis") proved the real verify routine is
> unreachable by static byte search alone. **Verdict: substantial, genuine progress — the
> exact static call site into the journal-prompt-drawing routine is now FOUND (file offset
> 0x031B11, a literal `CALL FAR 1D99:117F`, previously invisible only because it lives
> inside an overlay blob that the existing tooling's scan range didn't cover), DQK's DGROUP
> segment is now known (0x322E, previously an open question flagged in
> `dgroup-dynamic-trace.md`), and overlay 12 is now understood to be DATA (not code)
> loaded directly into DGROUP at program startup — not reached via any mysterious runtime-
> patched call at all. The exact byte-level pass/fail branch for "was the typed word
> correct" was NOT found; DQK's UI turns out to be a generic, data-driven dialog engine, so
> the comparison is very likely resolved through shared/reusable code + per-screen DATA
> rather than a dedicated hardcoded `CMP`, which reframes (but does not complete) the
> remaining search. This is an honest partial result, not a full solve.**

## 1. Tooling: `tools/unicorn_dqk_trace.py`

New file, reuses `disasm_dqk.py`'s `DqkImage` MZ-header parser and `OVERLAY_DESCS` table.
Two modes:

- `--smoke-test`: assembles `mov ax,0x1234 / int 0x21 / mov bx,ax`, hooks `UC_HOOK_INTR`,
  sets `AX=0x9999` inside the hook, and confirms `BX` ends up `0x9999` too — i.e. **confirms
  execution resumes at the instruction immediately after `INT` once the hook returns, with
  no manual `IP` adjustment needed.** This was the load-bearing assumption for the whole
  approach and is now verified in this environment (`PASS`).
- `--run [--max-instr N] [--log FILE] [--load-seg SEG]`: the real harness.
  - Parses the MZ header (`e_cs=0x1D99, e_ip=0x076C, e_ss=0x3FE4, e_sp=0x0400, nreloc=2291`),
    applies the DOS-loader relocation-fixup algorithm (add `load_seg` to every 16-bit word
    named by a `(seg,off)` relocation-table entry) against a bytearray copy of the load
    image, then `mem_write`s the patched image into a **flat 0x110000-byte `UC_MODE_16`
    mapping covering the entire real-mode address space** (chosen specifically so overlay
    memory allocated at runtime, and far pointers into it, never need on-demand
    `mem_map()` calls).
  - Builds a minimal PSP (`INT 20h` stub, environment-segment pointer) and a minimal
    environment block: an empty variable list followed by the word `0001` and the ASCIIZ
    program pathname `C:\DQK.EXE` — this is the standard DOS convention Borland's runtime
    reads to find its own EXE for FBOV's self-referential overlay loading, and turned out
    to be exactly what DQK.EXE's startup code does (see §2).
  - `UC_HOOK_INTR` stubs INT 21h: `AH=3D/3E/3F/42` (open/close/read/lseek) are backed by
    the **real DQK.EXE bytes already loaded in Python** (`img.data`) for self-opens, or by
    real files from the game directory for other names, so overlay loads observed in the
    emulator pull genuine game bytes, not synthetic garbage. `AH=48/49/4A` (alloc/free/
    resize) use a simple bump allocator. `AH=25/35` (set/get interrupt vector), `AH=30`
    (DOS version), `AH=09/02` (print), `AH=1A` (set DTA), `AH=4E/4F` (minimal
    FindFirst/FindNext over the game root plus `SAVE`, `DISK1`, `DISK2`, and `DISK3`),
    `AH=4C`/`INT 20h` (terminate) are modeled; everything else is logged and fails
    gracefully (`CF=1`) rather than crashing.
    All other interrupt vectors (10h/16h/33h/1Ah/...) are no-op-logged, per the task's
    explicit allowance to stub generically rather than build a full DOS.
  - `UC_HOOK_CODE` counts instructions (hard cap, `--max-instr`) and watches every
    executed instruction's first byte for far `CALL`/`JMP` forms — immediate (`0x9A`/
    `0xEA`) logged directly; indirect (`0xFF /2 /3 /4 /5`) decoded with a one-off capstone
    disassembly of just that instruction to compute the effective address, then the 4-byte
    pointer is read from emulated memory and logged. This is the mechanism built to catch
    an FBOV-loader-patched far pointer if the emulation ever reached one live.
  - Self-file reads that land inside overlay 12's file range (`0x62C30`-`0x6DC80`) are
    flagged specially in the log (this predates the DGROUP discovery in §2 and was the
    original "is this overlay 12 loading?" instrumentation).

Usage:
```
python tools/unicorn_dqk_trace.py --smoke-test
python tools/unicorn_dqk_trace.py --run --max-instr 300000 --log trace.log
```

## 2. What the emulator actually did, run by run

### 2.1 It boots and executes real DQK.EXE code

With `--max-instr 20000` the harness ran cleanly, no crash, and by instruction ~15928 had
already: made 4 far calls into a low-level resident segment (canonical `0x1EEF`, i.e.
`load_seg + 0x1EEF`), opened `C:\DQK.EXE` on itself (reading the environment block's
program-name field we constructed — confirms Borland's overlay init derives its own path
that way), and pulled bytes from two distinct regions of the file via `lseek`+`read`.

### 2.2 DQK's DGROUP segment is 0x322E — a new, dynamically-confirmed fact

At instruction 15928 the bootstrap code does `JMPF 1000:0000` (canonical: jump to the very
first byte of the load module, i.e. file offset `0x2400`). Disassembling there:

```
002400  mov  ax, 0x322e
002403  mov  ds, ax
002405  mov  word ptr [0x20], es
002409  mov  bx, word ptr es:[2]
00240e  sub  bx, ax
...
002430  mov  ah, 0x4a          ; DOS "resize memory block"
002432  int  0x21
```

This is the textbook Borland small-model C startup stub (`c0*.obj`): establish `DS` =
`DGROUP`, read the PSP's memory-size word, compute available stack space, call `INT 21h
AH=4Ah`. **The literal immediate `0x322E` loaded into `DS` here is DQK's DGROUP segment**
(in the file's own link-time/canonical numbering convention, the same one
`disasm_dqk.py`'s `OVERLAY_DESCS` table already uses). This directly answers a question
`docs/engine/research/dgroup-dynamic-trace.md` §5 explicitly investigated and gave up on
for DQK ("the `SS`=DGROUP shortcut doesn't hold... disambiguating 'the DGROUP data segment'
... requires exactly the same kind of semantic disassembly clustering that
`guess_dgroup_bases()` already does and already documents as probabilistic"). It's a
genuine bonus finding outside E6.2b-4's direct scope, but is recorded here since it fell
out of the same trace and may unblock other work.

### 2.3 Overlay 12 is not "code reached via a hidden pointer" — it's DATA loaded into DGROUP at startup

Before even reaching the DGROUP-establishing code above, `OvrMgr`'s startup path (calls
originating around canonical `1D99:036C`/`1D99:041B`, i.e. inside the already-known
`OvrMgr` region at file `0x02031D`) does, in order:

```
open  "C:\DQK.EXE"                                        -> handle 5
lseek handle 5 to file 0x63A20 (SEEK_SET)
read  41568 bytes  file[0x63A20:0x6DC80] -> dest buffer 422E:0000    (= load_seg + 0x322E)
lseek handle 5 to file 0x62C30 (SEEK_SET)                  ; = overlay 12's file START
read  352-byte chunks x10 + a 40-byte tail, file[0x62C30:0x63A18]    -> dest 1D99:0A92
```

`0x422E` = `load_seg(0x1000) + 0x322E` — **the destination of the big bulk read is
DGROUP itself.** And `0x63A20 - 0x62C30 = 0xDF0` (3568) is overlay 12's own file range
minus the small internal fixup-relocation prefix that gets separately read (in 352-byte
chunks) and applied to the just-loaded copy in memory — a completely ordinary two-phase
"load code, then apply this blob's own relocation fixups" overlay-load sequence. Overlay
12's descriptor (`OVERLAY_DESCS[12]`) already listed `runtime_seg = 0x322E`; the dynamic
trace shows this is **the exact same segment number** as the Borland startup stub's DGROUP
value in §2.2 — not a coincidence. Combined with the prior static finding ("overlay 12 has
ZERO C-function prologues... very likely data-only"), the picture is now complete:

**Overlay 12 is not code and is not reached via a computed far call/jump at all. It is a
~45KB blob of near-data (strings, the page/heading/answer lookup table, etc.) that OvrMgr
loads wholesale into the DGROUP segment before the program's own `main()`-equivalent even
starts.** Any code anywhere in the program that wants a piece of overlay-12 content just
does an ordinary `DS`-relative memory access — no dispatch stub, no runtime-patched
pointer, because `DS == DGROUP` is already established program-wide. This retires the
"UNLOCATED by static flat-offset analysis... indirect far pointer patched at overlay-LOAD
time" framing from the prior research doc — there is no hidden call site to find for
overlay 12 itself, because it was never called into in the first place.

**Correction applied to `tools/disasm_dqk.py`:** `OVERLAY_PREFIX_BYTES[12]` was an
unverified approximation (`(3574//2)*4 = 7148`, comment: "first prologue not located" —
correct, because there was never a prologue to find). Replaced with the now-confirmed
`0xDF0` (3568), with a comment citing this doc.

### 2.4 Using the DGROUP mapping to re-run the "reloc-xref" plan — and it works

With `DGROUP:off == file_offset - 0x63A20` now known, the prior doc's abandoned "reloc-xref"
idea (find code that references the prompt strings' DGROUP-relative offset) becomes directly
executable with the **existing** `DqkImage.find_xrefs()` helper. The three known prompt
strings (file offsets `0x6AC49`, `0x6AC6A`, `0x6AC84`, from `dqk-copy-protection.md`) map to
DGROUP offsets `0x7229`, `0x724A`, `0x7264`. Scanning the whole file:

```
DGROUP off 0x7229 ("journal, page..."): 1 xref -> file 0x038F83  mov ax, 0x7229
DGROUP off 0x724A (next fragment)     : 1 xref -> file 0x038FE8  mov ax, 0x724A
DGROUP off 0x7264                     : 6 xrefs, all noise (coincidental jump targets/imm
                                          operands elsewhere in the file, not real refs)
```

The two clean hits land inside **overlay 4** (file range `0x037430`-`0x039FE0` — already
known from prior research as "PROTECTION" / home of `IsProtSkip`/`DoProtCheck`).

## 3. The journal-prompt-drawing routine: FOUND, file 0x038EDB

Disassembling around the hits and walking backward to the real function prologue
(`push bp; mov bp,sp; sub sp,0x2C`) locates the complete routine at **file 0x038EDB -
0x039133** (1112 bytes), immediately followed in the file by the already-known
`IsProtSkip` (0x039134) and `DoProtCheck` (0x039150) — consistent with the prior "protection
code in overlay 4 sub-segment 0x2726" locality note. It:

1. Picks a random "page" index `[0xC74C] = rand(0x14)` and "heading/word" index
   `[0xC74D] = rand(3)`, retrying (jump back to `0x038EFC`, counting attempts in `[0xC722]`)
   if the looked-up table entry is marked invalid (sentinel `0xFF` at offset `+5` of a
   20-byte-stride lookup table at DGROUP `+0x6DD2`).
2. Draws "journal, page N" (string at DGROUP `0x7229`), a page-number-to-string
   conversion + draw, "what is word #M" (`0x7243`), the word number, "after the heading"
   (`0x723B`/`0x7240`) plus the heading text (looked up from the same table), "Enter"
   (`0x725B`/`0x726F`), and an input box (dispatched through an EGA/VGA-mode-selection
   jump table at `0x039241`, i.e. video-mode-specific drawing, unrelated to the check
   itself).
3. Returns (`AL`, always observed to be `1` on both branches of a small internal check —
   see §5's honesty note).

**This function is externally reachable via the already-catalogued FBOV stub table**
(`python tools/disasm_dqk.py --stubs 4`): entry `1D99:0x117F` (file `0x020F0F`) → `LJMP
0x26F8:0x008B` → target file `0x038EDB` — an exact match, previously on file but not
connected to a purpose.

## 4. The caller: found, and it explains why static search missed it

Searching the whole file for the literal far-pointer bytes of this stub's canonical
address (`7F 11 99 1D`, i.e. `off=0x117F, seg=0x1D99`) turns up **one hit, at file
`0x031B12`** — and the byte immediately before it (`0x031B11 = 0x9A`, the `CALL FAR
ptr16:16` opcode) makes this a **literal, static `CALL FAR 1D99:117F` instruction**, not a
stored pointer constant. `disasm_dqk.py --disasm 0x031B0A` confirms:

```
031b0a  cmp   byte ptr [0xae59], 0
031b0f  jne   0x31b43
031b11  lcall 0x1d99, 0x117f      ; <-- draws the journal prompt
031b16  or    al, al
031b18  jne   0x31b1f
```

**This resolves the original mystery directly: the call is not reached through any
runtime-computed/patched pointer. It's an ordinary literal far call. It was invisible to
`disasm_dqk.py`'s existing `find_callers_of_stub()` only because that function's scan range
is hard-coded to the main MZ image (`HDR` .. `MZ_IMAGE_END`, i.e. `0x2400`-`0x218D5`) and
never looks inside the overlay blobs. File `0x031B11` is deep inside overlay 3's own code
(file range `0x0304B0`-`0x037430`), which that scanner's range never covered.** This is a
tooling gap, not a genuine FBOV runtime-relocation mechanism, for at least this call site.

## 5. What happens around the call — orchestration mapped, exact pass/fail branch NOT found

Disassembling the surrounding overlay-3 code (`0x031A80`-`0x031C90`) gives a coherent, if
not fully conclusive, picture of the call sequence:

1. `0x031ADA`-`0x031B0A`: setup (calls into `1023:6`, `1D99:0x1175`).
2. `0x031B11`: **`CALL 1D99:117F`** — draws the journal prompt (§3).
3. `0x031B1F`-`0x031B41`: a small 4-item validation loop over a table at `DGROUP-0x4141`.
4. `0x031B9E`-`0x031C18`: a polling loop repeatedly calling canonical segment `0x2033`
   (`lcall 0x2033, 0x10CD` / `lcall 0x2033, 0xF`), branching on the `AL` result — shape
   consistent with a generic "wait for the modal screen to finish" loop, not yet tied to a
   specific segment-`0x2033` disassembly (untried; see §6).
5. `0x031C1B`: `CALL 1D99:0x1161` (file `0x03819C`, also overlay 4, per the existing stub
   table) — disassembled; this turns out to be a **generic dialog-state initializer** (a
   long run of `mov byte/word ptr [DGROUP-offset], constant` resets — dozens of unrelated-
   looking globals zeroed), i.e. "set up the next screen," **not** the answer comparison.
6. `0x031C2A`: `lcall 0x1093, 0x11` then `or al,al; jne 0x31C86` — disassembled the callee
   (file `0x012D41`, in the **main resident image**, not an overlay): it is a **one-line
   getter, `mov al,[0xA890]; retf`** — i.e. this branch is just reading a global byte flag
   at DGROUP `0xA890`. Its paired setter (`file 0x012D36`, called via `lcall 0x1093,6`) is
   invoked from **3 separate sites** (file `0x022B09` in overlay 0, and `0x032C7D` /
   `0x032CDE` in overlay 3) — i.e. **this flag is shared/generic, not journal-specific.**
7. `0x031C59`: `CALL 1D99:0x1157` (file `0x038705`, overlay 4) — also disassembled; this
   is a **generic "press SPACE to continue / ESC to abort" pagination-prompt loop**
   (checks the last key for `0x1B`=ESC or `0x20`=SPACE, counts up to 8 presses), again
   **not** journal-specific.

**Chasing the shared flag at `DGROUP:0xA890` to its other setter call site** (file
`0x032C7D`, inside overlay 3) locates what is very likely the **generic modal
keyboard-wait loop** at file `0x032C66`-`0x032D13`: clears the flag, then loops reading one
key at a time via a local helper (`push cs; call 0x32A3E`) and a low-level module
(canonical `0x151E`), recognizing scancode/char `0x1B` (ESC) and `0x60` as "done" triggers
that set the flag back to `1`; the loop's other exit conditions are three more flag checks
(`[0xACBE]`, `[0xB7A7]`, `[0xAE59]`) plus the getter from step 6. **This confirms the flag
is a generic "this modal screen is done" signal reused across many UI screens, not
"answer was correct."**

**The key-dispatch helper (`0x032A3E`) turned out to be a 65-entry jump table indexed by
the last keystroke** (`cmp ax,0x41; jbe...; jmp word ptr cs:[bx+0xD34]`), i.e. **DQK's UI is
a generic, data-driven dialog/text-field engine shared across every modal screen in the
game** (menus, name entry, save-slot letters, and — reusing the same machinery — the
journal-word prompt). This is the single most important structural finding of this session
for **future** attempts, and it is also why the exact pass/fail branch was not found: a
literal `CMP typed_word, expected_word / JE success` is the wrong shape of thing to grep
for if the actual mechanism is "generic field-validation code consults a
per-screen-configured expected-value pointer/callback ID stored in a dialog control-block."
That control-block's *data* (not code) is where the real answer/comparison-recipe most
likely lives, and is not yet located.

**Honest gaps, explicitly flagged (not glossed over):**
- The exact instruction(s) that compare the player's typed characters against the
  randomly-chosen answer were **not** found.
- Whether `DGROUP:0xA890` or any of the other flags checked in §5 items 4-7 is *ever* set
  differently for "correct" vs "incorrect" input, vs. being purely a generic "screen
  exited" signal, is **unconfirmed** — plausible but not proven from static reading alone.
- The Unicorn emulator itself never got far enough (see §6) to *watch* this comparison
  happen live and read the real branch — everything in §3-§5 is static disassembly,
  informed by (but not confirmed by) the dynamic trace.

## 6. Why the dynamic trace didn't reach this code, and the concrete next step

With `--max-instr 300000` the emulator ran ~295,691 instructions (0.6s wall-clock — fast
enough that a much larger budget, e.g. tens of millions of instructions, is cheap to try)
and reached real, meaningful program activity: it dynamically loaded overlay 3 (file
`0x0304B0`+) and overlay 4 (file `0x037430`+, confirming the **already-known** overlay-4
fixup-prefix size of 1248 bytes byte-for-byte — a strong sanity check that the whole
relocation/loading model in this harness is correct), then entered overlay 4's own code at
the FBOV stub `1D99:0x119D` (file `0x020F2D` → target file `0x037CE3`, a different overlay-4
entry point than the one found statically in §3 — evidently an *earlier* per-overlay
initializer, called once when overlay 4 is first loaded, distinct from the journal-prompt
routine itself), which in turn called into **canonical segment `0x00D7`** — a segment
`dgroup-dynamic-trace.md` §5 had only inferred was "heavily referenced" from raw relocation
frequency (624 occurrences) and could not confirm was really code; **this trace confirms it
live, closing that other doc's open question too.**

Shortly after, the emulator hit an **honest limitation of this synthetic DOS environment**:
an `INT 21h AH=3D` (open) call with a garbage 4-byte "filename" (`\xFA\x1E\xB8\xD4`, clearly
uninitialized/leftover memory, not a real string) → `NOT FOUND`, followed by a ~40-iteration
loop printing single non-printable characters via `AH=02`, then `INT 21h AH=4C` terminate
with `AL=1` (error exit) at instruction 295,691. The proximate cause is not yet isolated —
most likely an earlier, unmodeled `INT 21h` subfunction (candidates: `AH=44` IOCTL,
`AH=47` get-current-directory, `AH=62` get-PSP, or a config-file lookup whose path is built
from an environment variable this harness's near-empty environment block doesn't provide)
left a pointer or buffer uninitialized that later code trusted.

**Concrete next steps, in priority order:**

1. **Diagnose and fix the instr-~294K crash.** Turn on `--verbose-intr` for the window
   around instruction 285,000-294,558 (already possible with the existing tool) to find
   the exact unmodeled call that precedes the garbage open, and either model it correctly
   or (cheaper) enrich the synthetic environment block with plausible extra variables
   (e.g. a fake `PATH=`, or whatever DQK's installer would have set) so the game's own
   config/path-lookup logic has something real to chew on. Once fixed, re-run with a much
   higher `--max-instr` (the 300K run took well under a second; even 50-100x that is cheap)
   and check whether execution naturally reaches file `0x031B11` (the call found in §4) —
   the `UC_HOOK_CODE` far-call watcher already built into this tool will log it and, more
   importantly, whatever comes after it live, letting someone literally single-step (or
   just log) the real comparison instead of guessing from static reading.
2. **Disassemble canonical segment `0x2033`** (§5 item 4's polling loop target — file base
   `HDR + 0x2033*16 = 0x022730`) — untried this session, cheap (`disasm_dqk.py --disasm`),
   and a plausible location for either the actual keystroke-accumulation-into-buffer logic
   or another layer of the generic dialog engine.
3. **Find the dialog control-block DATA for the journal-prompt screen**, now that its
   drawing routine (`0x038EDB`) and DGROUP mapping are both known — look for a structure
   near the prompt strings (DGROUP `0x7229`+) that plausibly holds "field type = text
   entry," "expected value pointer," or similar, since §5 concludes the actual
   pass/fail decision is very likely data-driven rather than a dedicated compare
   instruction.
4. If a specific candidate branch is eventually identified (static or dynamic), the
   Unicorn harness can directly **test a candidate patch**: flip the branch's condition (or
   NOP the conditional jump) in the in-memory image before `uc.emu_start()`, and observe
   whether the emulated "success" path is taken unconditionally — a fast, safe way to
   validate a bypass patch before ever touching the real `DQK.EXE` or running DOSBox.

## 7. Summary of concrete, reusable facts this session established

| Fact | Value | Confidence |
|---|---|---|
| DQK.EXE DGROUP segment (canonical) | `0x322E` | High — directly disassembled Borland startup stub |
| Overlay 12 is DGROUP data, not a code overlay | — | High — dynamic load sequence + zero-prologues (prior) + matching runtime_seg all agree |
| Overlay 12 real code/data start (file offset) | `0x63A20` (prefix = `0xDF0`=3568B) | High — directly observed `lseek` target in live trace; `OVERLAY_PREFIX_BYTES[12]` corrected in `disasm_dqk.py` |
| Journal-prompt-drawing routine | file `0x038EDB`-`0x039133`, overlay 4 | High — found via clean DGROUP-offset xrefs to 2 of 3 known prompt strings |
| FBOV stub for the drawing routine | `1D99:0x117F` (file `0x020F0F`) | High — matches existing `--stubs 4` table exactly |
| Static call site into the drawing routine | file `0x031B11` (literal `CALL FAR 1D99:117F`), inside overlay 3 | High — literal opcode bytes `9A 7F 11 99 1D` found by direct search |
| Why static search missed it before | `find_callers_of_stub()`'s scan range is MZ-image-only, doesn't cover overlay blobs | High — confirmed by code inspection |
| Canonical segment `0x00D7` is real, live code | — | High — dynamically observed being called into from overlay 4 init |
| DQK's UI is a generic, data-driven dialog engine | — | High — 65-entry keystroke jump table found live in the call chain |
| Exact pass/fail branch for the journal answer | **not found** | — honest negative |

## Sources

- `docs/engine/research/dqk-copy-protection.md` (the problem statement and prior static
  analysis this session continues)
- `docs/engine/research/dgroup-dynamic-trace.md` (DGROUP background; §5's DQK finding is
  now supersedable by §2.2 of this doc)
- `tools/disasm_dqk.py` (`DqkImage`, `OVERLAY_DESCS`, `find_xrefs`, `--stubs`, `--thunk`
  — all reused, one data-table correction applied)
- `tools/unicorn_dqk_trace.py` (new, this session)
- Unicorn Engine 2.1.4 / capstone 5.0.7 (`pip show unicorn` / `pip show capstone`)

---

## 8. Continuation session (2026-07-02): the AH=3D bug, root-caused and fixed — plus three
more gates found and characterized, still short of file 0x031B11

> **Scope: picked up exactly where §6 left off** ("the harness's `INT21h AH=3D` (open)
> call handler ... receives an uninitialized/garbage filename pointer/buffer"). **Verdict:
> the AH=3D bug is fully root-caused and fixed (two genuine, independent harness bugs, not
> one) — verified with before/after memory snapshots, not guesswork. With the fix, the
> emulator runs dramatically farther (past the whole boot/overlay-4-init sequence that
> previously terminated the game at instruction ~295K). It then hits a real INT 16h
> keyboard-wait gate, then (once that's modeled) a real INT 10h VGA-detection gate, then
> (once THAT's modeled too) a genuinely different kind of gate — a raw VGA I/O-port
> busy-wait inside a palette-fade routine, not an interrupt call at all. File offset
> 0x031B11 (the static call site into the journal-prompt routine, found in §4) was still
> NOT reached in any run this session, and there is good circumstantial evidence (see §8.6)
> that it sits well past this palette-fade point, still inside the game's intro/title
> sequence, not yet at any menu. This session stops here per the task's explicit bounded-
> attempt / stop-condition guidance — it is an honest partial result, same as §5-§6.**

### 8.1 Root cause #1: the environment block was missing a byte (real bug, now fixed)

`DqkTracer.build()` constructed the synthetic DOS environment block as:
```python
env = b"\x00" + struct.pack("<H", 1) + prog_name   # BUG: single NUL
```
A real DOS environment block with **zero variables** needs a **double NUL** (each string is
itself NUL-terminated; an *extra* NUL then ends the list — with zero strings, that "extra"
NUL is the *only* content before the optional word-count + program-pathname trailer). The
harness supplied only one NUL.

**Effect, traced live:** DQK's own CRT0 command-line/argv-setup loop (file
`0x00246E`-`0x0024A5`, a completely ordinary and correct piece of Borland startup code) scans
the environment block for the double-NUL terminator by alternating "skip one string" /
"is the next byte also NUL" checks. With only one NUL present, it misreads the low byte of
the word-count field (`0x01`) as the start of *another* environment string, then misreads
part of the ASCIIZ program-pathname as *yet another* string, and eventually walks off the
end of the tiny env block into adjacent (all-zero, then real-code) emulated memory. This
corrupts the computed "argv[0] length" (`CX`), which becomes `0` and then wraps to `0xFFFF`
inside the `LOOP` instruction at file `0x002499` — an (almost) 65536-iteration byte copy
(`file 0x002494-0x002499`) that overwrites a large stretch of live DGROUP static data,
**including the constant string `"disk1\dqk.cfg\0"` at DGROUP offset `0x608E`** (file
`0x0069AAE`), with unrelated bytes copied from elsewhere in the loaded image (confirmed:
the copy source drifts into the live `DQK.EXE` code image itself once its source pointer
runs past the PSP, which directly explains why the corrupted bytes at the open() call
looked like x86 opcodes, not garbage).

**Verified with a live memory snapshot at 5 checkpoints** (instr 700 / 16000 / 100000 /
200000+): the string `b'disk1\\dqk.cfg\x00Not enough...'` is intact through instr 100000,
then corrupted (`b'\xfa\x1e\xb8\xd4\x00P\xffv\xf93\xc0P...'`, recognizably x86 opcodes) by
instr 200000 — and a targeted `UC_HOOK_MEM_WRITE` watch pinpointed the exact culprit
instruction: **every corrupting write executes at `CS:IP = 1000:0096`** (canonical file
`0x002496`, the `mov byte ptr [di], al` inside the runaway copy loop above), confirming the
mechanism precisely rather than by inference alone.

**Fix** (`tools/unicorn_dqk_trace.py`, `build()`):
```python
env = b"\x00\x00" + struct.pack("<H", 1) + prog_name   # FIXED: double NUL
```
Re-verified with the same snapshot technique: `"disk1\dqk.cfg\0Not enough memory "` now
stays intact at the AH=3D call site (instr ~32544 in the fixed run).

### 8.2 Root cause #2: the file-server only searched GAME_DIR root, not DISK1/DISK2/DISK3

Even with DGROUP no longer corrupted, the open of `"disk1\dqk.cfg"` still failed
(`NOT FOUND`) because `_on_int21`'s AH=3D handler only ever tried
`os.path.join(GAME_DIR, name)` where `name` is just the basename (`raw.split(b"\\")[-1]`)
— it silently discarded the `disk1\` directory component. The real GOG DOS release keeps
`DQK.CFG` inside `The Dark Queen of Krynn/DISK1/DQK.CFG`, not flattened into the game
root. **Fix:** added `DqkTracer._find_game_file(name)`, which case-insensitively searches
`GAME_DIR` root plus `DISK1`/`DISK2`/`DISK3` (mirroring the real on-disk layout) before
reporting "not found." With both fixes applied, `INT21/3D open b'disk1\\dqk.cfg' -> handle N
(N bytes)` succeeds for real.

### 8.3 With both fixes: past the old blocker, into a real INT 16h keyboard-wait gate

Re-running `--max-instr 3000000` (3M instructions, ~7s wall-clock — the harness stays cheap)
no longer terminates early. It instead settles into a **stable, endlessly-repeating**
sequence of far calls (`2102:00aa` / `2102:00b3` / `2c4c:004d` / `2c4c:005f` /
`251e:00dc`, ×tens of thousands) that never varies. Disassembling the outer routine (file
`0x0134A0`-`0x0134E3`) shows a textbook **"wait for a keystroke" poll**: it calls a chain of
wrapper functions down to file `0x0031CC`, a generic `INT 16h` trampoline
(`mov ah,[bp+6]; cmp ah,1/0x11; int 0x16; je "not ready"`). Root cause: the harness's
existing *generic* interrupt stub leaves `AX`/`FLAGS` completely untouched, so `ZF` after
the `int 0x16` is whatever an unrelated earlier `CMP` left it at — which, traced live,
deterministically reads as "no key ever available," an honest but permanent hang (exactly
the class of gap the harness's own docstring already anticipated: *"if this proves fatal
... it will show up as the instruction-count cap being hit without progress"*).

### 8.4 `--fake-keyboard`: a gated, opt-in INT 16h model (navigation aid, not an answer)

Added `DqkTracer._on_int16()` plus a `--fake-keyboard` CLI flag (default OFF, so the
harness's default/documented behavior is unchanged unless explicitly requested). It models
`AH=00/10` (read+consume), `AH=01/11` (peek), `AH=02/12` (shift state) with **one pending
keystroke that re-arms after being drained**, not an always-present key: a first cut that
always reported "ready" broke a *different*, real DQK routine — a keyboard-buffer **flush**
loop at file `0x0134E4` (`read; check; loop-while-ready`) — which spun forever "draining" a
key that could never run out. The re-arming model (drain → briefly empty, satisfying flush
loops → becomes available again after `key_rearm_after=500` empty peeks, satisfying later
"wait for a key" gates) resolves both idioms. **This is explicitly a blunt navigation aid
for getting past "press a key to continue" gates during exploration — it is never used to
type or answer the journal-word prompt itself,** per the standing project directive.

### 8.5 `--fake-video`: a gated INT 10h VGA-detection model, root-caused (not guessed)

With `--fake-keyboard` alone, the emulator progresses past the keyboard gate and reaches a
**new, different failure**: a legible printed message, byte-by-byte via `INT21/AH=02`:
**`"Install for VGA only!"`**, followed by `INT 21/4C` terminate `AL=1` at instr ~151086.
Traced the exact check (file `0x03998E`-`0x0399F5`, disassembled): DQK's own VGA-presence
probe does `AX=0x1A00; int 0x10` (real BIOS "get display combination code"), then
`cmp ax,8; jne "not VGA"`. The generic no-op INT 10h stub leaves `AX=0x1A00` unchanged (so
`AL` never becomes `0x1A`, `BL` never becomes `8`), so the check always fails. Added
`_on_int10()` + `--fake-video` (default OFF): models exactly the two subfunctions DQK's own
probe actually uses — `AH=1Ah,AL=0` → `AL=0x1A` (supported), `BL=8` (VGA, color analog
display); `AH=12h,BL=10h` → `BH=0` (color), `BL=3` (256K installed) — both values matched
directly against the disassembled comparison, not inferred from generic BIOS docs alone.

### 8.6 With `--fake-keyboard --fake-video`, 15M instructions (~25s): past VGA detection,
into a fifth gate that is *not* an interrupt at all — still short of file 0x031B11

This run makes real further progress: 6 distinct `AH=3D` file opens succeed (vs. 3 before),
many more resident/overlay code regions get reached (canonical segments `0x151b`, `0x1c4c`,
`0x217e`, `0x22b7`, `0x261b`, `0x2796`, `0x27fa`, `0x293f`, `0x2aa6`, `0x2c41`, `0x35ca`,
`0x1df9`), consistent with genuine progress through an intro/title sequence. It then settles
into a **fifth stable gate**, structurally different from the first four: a tight loop
repeatedly calling file `0x0058E6`(`10d7:2776`)/`0x005266`(`10d7:20f6`) from a fixed site at
file `0x017AB0` (canonical `151b:0500`). Disassembling `0x005266` shows a **VGA
vertical-retrace busy-wait inside a palette-DAC-load routine** — the classic "wait for
vsync before writing the next palette color" idiom:
```
005278  mov dx, 0x3da
0052...  in al, dx           ; read VGA Input Status Register 1 (port 0x3DA)
         test al, 8          ; bit 3 = "currently in vertical retrace"
         jne/je  ...         ; spin until it toggles
```
This is **not** an `INT` call at all — it is a raw x86 `IN`/`OUT` instruction against an I/O
port, a structurally different mechanism from everything modeled in §8.3-§8.5 (those all
hook `UC_HOOK_INTR`; port I/O needs a separate `UC_HOOK_INSN`-style hook). Since the harness
never varies port `0x3DA`'s bit 3, this bit is permanently constant, so one of the two
`test al,8` branches spins forever. **Not fixed this session** — flagged as the next gap,
in keeping with the bounded-attempt stop condition.

**File offset 0x031B11 (the static call site from §4) was not reached in this or any run
this session** — confirmed by grepping every trace log for overlay-index-3 activity
(file range `0x0304B0`-`0x037430`): the only "overlay-12 file-range read" events logged in
every run are the same 12 startup-time DGROUP-load events already known from §2.3, zero
additional hits. Given the palette-fade gate found in §8.6 looks like ordinary intro/title-
screen dressing (not menu code), and DQK's overlay-4-init sequence (§2.3-§2.4) had already
run to completion *before* any of gates 3-5 were reached, it's a reasonable (not proven)
inference that there is substantially more boot/intro-sequence machinery — likely including
more palette fades and possibly mouse (`INT 33h`) input for menu selection — standing
between here and any "load a saved game" screen, which is what actually triggers the
journal-word prompt per the original problem statement.

### 8.7 Honest state and sharpened next step

- **Fixed, verified, unconditional (no flag needed):** the environment-block double-NUL bug
  and the DISK1/2/3 subdirectory file-search gap — both root-caused with live memory/register
  snapshots, not guesswork, and both are genuine correctness fixes to the harness (not
  DQK.EXE itself, which is exonerated here exactly as `docs/engine/HANDOFF.md`'s "DQK.EXE is
  genuine, not altered" finding would predict).
- **Modeled, verified, opt-in (`--fake-keyboard` / `--fake-video`):** INT 16h keyboard-poll
  and INT 10h VGA-detection gates, each root-caused via disassembly of the actual DQK probe
  routine before writing the fix (file `0x0031CC` for keyboard; file `0x03998E` for video).
- **Found but NOT fixed:** a VGA vertical-retrace (port `0x3DA`) busy-wait inside a
  palette-fade routine (file `0x005266`) — a new *kind* of gap (raw port I/O, not an
  interrupt), reached only after both flags above are enabled.
- **Still not reached:** file `0x031B11` (the journal-prompt call site) and, therefore, the
  actual word-comparison instructions themselves remain exactly as unlocated as `docs/
  engine/research/dqk-copy-protection.md` and §5-§6 of this document already state. No
  bypass patch is proposed this session, correctly, since the target code was never
  observed executing.
- **Sharpened next step for whoever picks this up:** two viable paths, in order of
  fidelity vs. tractability trade-off:
  1. **Keep pushing the boot sequence forward mechanically**, the same way this session
     did: add a `UC_HOOK_INSN` port-I/O hook that fakes an alternating VGA retrace bit
     (cheap, same style as §8.4/§8.5), re-run with a large `--max-instr` budget (proven
     cheap: 15M instructions in ~25s), and expect to find and fix further gates one at a
     time (more palette fades, very possibly `INT 33h` mouse polling once a menu is
     reached). This is the honest, fully-verified path but has an unknown number of
     remaining gates.
  2. **Skip the cold-boot emulation entirely**: since CS:IP, DGROUP (`0x322E` canonical),
     and the overlay-loading mechanics are now all well-understood (§2, §4), it may be
     more tractable to hand-construct a starting emulator state that begins *after* a
     save is already loaded (e.g., pre-load overlay 3/4's code into memory the way OvrMgr
     would, set `CS:IP` directly to file `0x031B11`, and synthesize a plausible register/
     stack state) rather than emulating the entire boot from `CS:IP=1D99:076C`. This
     trades "we watched the game genuinely reach this state" rigor for tractability, and
     any findings from it should be flagged as resting on a constructed (not organically
     reached) starting state.
- Per the task's explicit budget guidance, this session stops here rather than attempting
  the port-I/O hook — this exact blocker area (deep boot-sequence hardware gates) is new
  territory, not a re-tread of the previously-deferred `AH=3D` issue, which *is* now
  resolved.

### 8.8 2026-07-13 addendum: current tracer status

The port-I/O blocker above is no longer current. `tools/unicorn_dqk_trace.py --fake-video` now models
VGA status port `0x3da` retrace polling and ignores the VGA palette/sequencer output ports used by the
startup/resource path. The harness also has queued synthetic keyboard input:

```powershell
python tools\unicorn_dqk_trace.py --run --fake-video --fake-keyboard `
  --fake-keys enter,space,c `
  --max-instr 200000 `
  --log build\dqk-fake-keys-smoke.log
```

`--fake-keys` accepts key names such as `enter`, `space`, and `esc`, single alphanumeric keys, or raw
BIOS `AX` words such as `0x1c0d`. It still lets the keyboard buffer go empty between consumed keys, so
DQK's real keyboard-flush loops can terminate.

The current live-value target has moved from the old copy-protection prompt to the DQK combat context
setter documented in `docs/engine/research/dqk-ca03-runtime-probe.md`. The latest 1M-instruction organic
run reaches startup/resource helper work but still does not hit the `[ca03]` watchpoints, so the next
step is route control or DOSBox-X debugger automation, not another basic VGA/keyboard stub.

### 8.9 2026-07-13 addendum: combat-map dump hook

`tools/unicorn_dqk_trace.py` now also accepts `--dump-dqk-combat-map PREFIX`. When any known DQK
combat setup/render anchor fires, it reads the far pointer stored at DGROUP `[0xbedb]:[0xbedd]` and
writes the `ptr_seg:(ptr_off+9)` payload as a `0x04e2` byte row-major `50x25` background-id surface.
The hook currently watches:

- `28d0:0e70` setup dispatcher (`DQK.EXE:0x02cb60`)
- `28d0:06a7` dungeon fill (`0x02c397`)
- `28d0:0e3b` wilderness fill (`0x02cb2b`)
- `28d0:0000` cell writer (`0x02bcf0`)
- `28d0:006a` cell writer store (`0x02bd5a`)
- `28d0:006e` cell writer return/early-return target (`0x02bd5e`)
- `28d0:09e7` wilderness variant walker (`0x02c6d7`)
- `28d0:0f25` / `28d0:0f3e` `DungCom1` / `WildCom1` consumers
- `2740:0846` / `2740:172c` 7x7 viewport/cell renderers

The binary artefacts are named `<prefix>-NNN-<label>.bin`; `<prefix>.csv` records pointer
segment/offset, physical surface address, `[b20f]+0x22`, structure `+2/+4` map-origin words,
`[b7f9]`, `[ca03]`, checksum, nonzero/unique counts, histogram, optional write offset, and cell-writer
argument/bounds diagnostics. The hook validates live bytes against the expected `DQK.EXE` file offset
before accepting a hit because DQK reuses overlay memory. A staged area-5 loaded-save trace that used to
produce three zero-filled `cell-writer-entry-file-02bcf0` dumps now logs them as alias skips at live
`389c:0340` / physical `0x038d00`; the actual bytes are party-menu setup bytes, not the `0x02bcf0`
writer prologue. Surface-write dumps are also gated behind a prior byte-validated combat-map anchor, so
generic writes through a stale/non-combat `[bedb]` pointer no longer create dump rows. A 2000-instruction
smoke with the flag enabled correctly writes zero rows because startup does not reach those anchors.

The tracer also accepts `--watch-ecl-opcode OPCODE`, which logs writes of selected ECL opcode bytes to
canonical DGROUP `[b1c7]` with the wrapped stream bytes around `[ae5c:ae5e]+[b7f9]`. The immediate DQK
COMBAT search should use `--watch-ecl-opcode 0x24`; a 15M-instruction Palanthas/Palace regression
produced no `ECL-OPCODE` rows, confirming that the old inline `0x24` string-length byte was not a
top-level opcode dispatch.

The fake-key script language also now has `poke-dgroup8:OFF:VALUE[:LABEL]` and
`poke-dgroup16:OFF:VALUE[:LABEL]`. These tokens write to the canonical DQK DGROUP segment
(`0x322e + load_seg`) after any preceding `wait`, `gate:*`, or `gate-b7f9:*` token releases, and log a
`KEY poke-dgroup` row when `--trace-keys` is enabled. They are a route-control aid for staged traces
such as the known area-5 dragon-combat host rows; they are not, by themselves, evidence that original
`DQK.EXE` naturally set that state. A valid combat-source proof still requires a real
`ECL-OPCODE opcode=0x24` row followed by byte-validated combat setup/render anchors.

Follow-up route probing on 2026-07-13 narrowed that further. The first bullets below are historical
pre-memory-fix observations; §10 supersedes their load-segment conclusion.

- Pre-memory-fix `--watch-file-writes START:END` diagnostics appeared to show that default
  `--load-seg 0x1000` was too low because DQK read `FRAME.TLB` into a buffer overlapping the loaded EXE
  image. The later fix showed the real problem was the synthetic DOS memory model, not the load segment.
- `--load-seg 0x2000` avoided that pre-fix collision but is no longer the recommended baseline because
  it leaves DQK below its own conventional memory requirement. Current fixed-memory route runs should
  use `--load-seg 0x1000`.
- A 10M-instruction pre-fix `--load-seg 0x2000` run without timer modelling exposed the next real gate: a wait
  loop at `DQK.EXE:0x0135ec` repeatedly calls `151e:00c6`, which reads `DS:cda8/cda6`, until the tick
  value advances by five.
- `--fake-timer` now increments those globals on each timer-getter call. With `--fake-timer`, the same
  10M-instruction route gets past the timer wait and reaches the cap in generic compare/copy helper code
  around `DQK.EXE:0x0175a8`; it still records no `DQK CA03 WATCH` rows and no `--watch-dqk-route` hits.

That makes the current blocker route/state fidelity after startup and save selection. The resolved
blockers are VGA retrace, palette/sequencer port noise, queued BIOS keyboard input, low-load image
collision, and the narrow timer wait loop.

The next input pass added route-driving diagnostics rather than another hardware approximation:
`--trace-keys` logs fake-key peeks/re-arms/reads, `--fake-key-rearm-after` tunes how quickly a new key is
exposed after flush loops see empty input, `wait:N` tokens inside `--fake-keys` delay individual route
keys, `--fake-key-min-instr-gap` provides a coarse global gap, and `INT 21h/AH=06` direct console I/O is
now modeled. Save/roster/area-like opens also emit `ROUTE-FILE` markers.

Two focused 2026-07-13 probes prove the route issue is now above the low-level keyboard model:

- `esc,l,t,a,enter,b` with `--fake-key-rearm-after 20` consumed `ESC`, `L`, `T`, and `A` by 3M
  instructions but still opened only startup/title/frame assets.
- `esc,wait:2500000,l,t,a,enter,b` consumed the full scripted route by 6M instructions but still had no
  `SAVG`/`SAVE`/`VAULT`/`TDQK`/`CHRDAT`/`ROSTER`/`QSV` opens, no route-watch hits, and zero `ca03` rows.

The remaining Unicorn gap is therefore early menu/dialog state anchoring: the harness can feed keys into
DQK's generic BIOS keyboard polling loop, but it does not yet know the original start-menu/load-save
state where those keys should be accepted.

The next pass found and instrumented those static start/load anchors; see
`docs/engine/research/dqk-start-load-route-anchors.md`. The important runtime result is still negative:
with `--watch-dqk-route` expanded to the party menu, `Load Saved Game`, QSV/slot picker, selected-QSV
loader, saved `[ca03]` reader, `Vault%c.DAT`, and `Begin Adventuring` anchors, the
`esc,wait:2500000,l,t,a,enter,b` 6M-instruction run consumed all keys but hit none of those watches.
So the active Unicorn route is not yet in the original party/load menu path; the next mapping target is
the live generic prompt loop surrounding the keyboard reads.

That loop is now mapped one level deeper. Key trace stack dumps show the delayed `L` and `T` reads
returning through `1102:044f` and `17fa:0155` / `17fa:0221`; `--watch-dqk-route` confirms the active
branch is `1102:044a` (`DQK.EXE:0x01386a`), the post-render title/prompt key read, not the party menu.
The next cold-boot route probe should gate fake input on the widget/menu dispatcher
`1aa6:1703` / `1aa6:170f` instead of timing from the title screen.

The first gated runs show why the gate must be tied to the actual party/menu context, not just any
input loop:

- `gate:0x1aa6:0x1703` directly after `ESC` never released; the run stayed in the post-render prompt
  loop and consumed only `ESC`.
- Inserting two neutral `SPACE` prompts before that same widget gate got further, but still did not hit
  `1aa6:1703` before a later invalid-instruction stop at `20d7:094a`. This is a pre-memory-fix result;
  the stop is now explained by `TITLE.TLB` overwriting resident code under the old synthetic-DOS
  allocation model.
- Gating on the broader later resident input predicate, `gate:0x1102:0x00a1`, released at instruction
  `5168356`, then reached `1aa6:1703` and `1aa6:170f`. All queued route keys were consumed.

That resident-gated run still produced no QSV/save-route file opens, no `25a4:*` party-menu watch hits,
no `1f4e:*` load-source watch hits, and zero `ca03` rows. The tracer can now drive a widget/menu loop,
but the form was then identified as generic widget infrastructure rather than the party menu. This was
a pre-memory-fix callback dump: `dac0=0x0004`, `dac7=522e:db68`, callbacks
`[0:3aa6:1183,1:2bdb:008e,2:2bdb:008e,3:2bdb:008e]`. The equivalent current fixed-memory form is
`dac7=422e:db68`, live callbacks `[0:2aa6:1183,1:1bdb:008e,2:1bdb:008e,3:1bdb:008e]`, canonical
callbacks `[0:1aa6:1183,1:0bdb:008e,2:0bdb:008e,3:0bdb:008e]`; static disassembly maps those to the
generic widget wrapper at `DQK.EXE:0x01dfe3` and widget flag/draw handler at
`DQK.EXE:0x00e23e`. The next route probe should bypass generic `1aa6` success and gate `L` only after
the proven party-menu anchors `25a4:3127` / `25a4:33c3` fire, or move the capture to DOSBox-X debugger
automation if Unicorn never reaches them.

That direct party-input gate was then tried. With
`esc,wait:2500000,space,space,gate:0x25a4:0x33c3:party-menu-input-call,l,t,a,enter,b`, the pre-fix run
reached `KEY gate-wait` for live `45a4:33c3` at instruction `2648319`, consumed only the four pre-gate
inputs, never fired a `25a4:*`, `1f4e:*`, route-file, or `ca03` watch, and then stopped at
`20d7:094a` / `DQK.EXE:0x003aba`. §10 resolves that stop as loaded-code overwrite under the old memory
model. The fixed-memory route still does not reach party/load/CA03, so the remaining Unicorn problem is
not "which delay before L?" but active form/menu state fidelity or missing runtime conditions. Next work
should instrument that state under `--load-seg 0x1000` or use DOSBox-X/debugger automation to capture
the same addresses in a real runtime session.

---

## 9. Third session (2026-07-02): hand-constructing the state at `CS:IP=file 0x031B11`
   — reached the real journal-prompt-drawing routine dynamically for the first time, then
   diverged ~230 instructions later on a stack-frame issue. Still short of the compare.

> **Scope: this is the bounded, final session on E6.2b-4 per the task brief — pursue
> option (2) from §8.7's sharpened next step (hand-construct a starting machine state at
> the known static call site instead of continuing cold-boot emulation) and stop, whether
> or not it converges. Verdict: hand-construction WORKS as a technique — it got the
> emulator to dynamically execute the real journal-prompt-drawing routine at file 0x038EDB
> for the first time ever (previously only known statically, §3), reproducing its exact
> known prologue and confirming several previously-inferred facts live. It did NOT reach or
> characterize the actual word-compare — execution diverged about 230 real instructions
> into the routine on what is diagnosed as a caller-context/stack-frame problem inherent to
> starting mid-call-chain, not a simple bug. New tool: `tools/unicorn_dqk_construct.py`.**

### 9.1 Approach

Built a new script, `tools/unicorn_dqk_construct.py`, that reuses `unicorn_dqk_trace.py`'s
`DqkTracer.build()` (base MZ image + relocations + the INT21h/INT16h/INT10h stubs) unchanged,
then, *without* running the cold-boot sequence at all:

1. Manually copies overlay 3's and overlay 4's on-disk code bytes (`file[code_start:code_end]`,
   per `disasm_dqk.py`'s existing tables) into memory at their **physical** placement,
   computed as `canonical_runtime_seg + load_seg` (load_seg=0x1000, the harness default).
2. Manually copies overlay 12's on-disk DGROUP payload (`file[0x63A20:0x6DC80]`, the exact
   range §2.3 dynamically observed OvrMgr read) into memory at DGROUP's physical segment
   (`0x322E + 0x1000 = 0x422E`).
3. Sets `CS:IP` directly to the physical address of file offset `0x031B11` (the static
   `CALL FAR 1D99:117F` found in §4), `DS=ES=0x422E` (DGROUP), and `SS:SP` to a dedicated,
   pre-zeroed, otherwise-unused segment (`0xF000:0xFFFE`) so `PUSH`/`POP`/`CALL`/`RET` have
   safe scratch space instead of garbage.
4. Runs with the existing far-call/interrupt logging plus a bounded live-disassembly window
   and two new speculative `UC_HOOK_INSN` port-I/O models (0x3DA VGA retrace, 0x60/0x64
   keyboard controller) in case the drawing routine or its input loop hit the same class of
   raw-port-I/O gate §8.6 found during cold boot.

### 9.2 The `canonical + load_seg` addressing rule: confirmed, not just assumed

Before building the loader, this session **directly verified** (rather than re-assumed) the
rule §2.2/§2.3 implied but never quite nailed down: the raw, on-disk bytes at the crt0
`mov ax,0x322E; mov ds,ax` instruction (file `0x002401`, image offset 1) read literally
`0x322E` — **and that exact 2-byte location IS present in the MZ relocation table**
(`img.relocs()` contains `(seg,off)` with `seg*16+off == 1`). Replaying `build()`'s own
relocation-application logic offline against that one location confirms it patches to
**`0x422E`** (`0x322E + load_seg`) before the emulator ever executes it — i.e. the *live*
DS value the real boot sequence would establish is `0x422E`, not the `0x322E` §2.2's static
disassembly showed (that was the pre-relocation, on-disk value, which happens to equal
`OVERLAY_DESCS[12].runtime_seg` exactly, confirming both are the same "canonical" numbering
space). This session's hand-construction uses `0x422E` directly.

The same rule was then checked for the overlay-placement case with a byte-offset sanity
check: overlay 3's computed physical placement (`0x2f4e0`) sits **11 bytes** after the base
MZ image's own load end (`0x2f4d5`), and overlay 4's computed placement (`0x35a40`) sits
**101 bytes** after overlay 3's computed end (`0x2f4e0+0x64fb=0x359db`) — i.e. overlays with
distinct `runtime_seg` values pack contiguously right after the resident image, exactly as a
real FBOV overlay pool would. Both gaps are later **independently reconfirmed live** (§9.4):
OvrMgr's own real reload of overlay 4 during this session's run landed the bytes at
**exactly** the predicted physical segment (`35a4:0000`) — a completely independent
confirmation channel (real game code choosing where to place the overlay) agreeing with the
static arithmetic.

### 9.3 First real bug found and fixed: OvrMgr's own "reload stack overflow" abort

The very first run (before any of the fixes below) hand-constructed the state correctly
enough to execute the static `CALL FAR 1D99:117F` and reach real `OvrMgr` code — which
immediately aborted with a **genuine, byte-for-byte DQK.EXE runtime string**:
`"Fatal Error eov0004: Overlay Manager Internal Reload Stack Overflow\r\n -- use RELOAD to
increase size"` (`INT 21/4C terminate AL=0x01` at instr 787). This is real Borland
overlay-manager runtime text (file `0x1FEBA`), not a crash — DQK.EXE's own error handler ran
correctly and printed a real diagnostic.

Disassembling `OvrMgr`'s entry (file `0x02031D`, already in `KNOWN_FUNCS`) located the check:
it maintains a small internal "reload stack" (tracks nested overlay calls) at **fixed,
1D99-resident** (not DGROUP) offsets:

| Offset (1D99-relative) | Meaning | On-disk (raw file) value |
|---|---|---|
| `0xA70` | current byte-index into the reload buffer | `0x0000` |
| `0xA72` | buffer base offset (near, within the segment at `0xA74`) | `0x0000` |
| `0xA74` | **segment** of the reload-stack buffer | `0x1D99` (self, placeholder) |
| `0xA76` | buffer byte-**limit** (`new_index >= limit` ⇒ overflow) | `0x0000` |

With `limit=0` (a genuine on-disk placeholder that the real, skipped init sequence would
normally replace with a real allocated buffer + real size), **any** overlay dispatch
immediately overflows. Checked whether the real game sets a `RELOAD=n` DOS environment
variable that would explain/relate to this (the error message literally says "use RELOAD to
increase size") — searched `START.BAT` and both `dosbox_krynnQueen*.conf` files in
`The Dark Queen of Krynn/`: **no `RELOAD=` anywhere**, so this is purely the built-in
default-size setup the (skipped) init performs, not something the game's own launch
configuration customizes.

**Fix:** `DqkConstructTracer.init_ovrmgr_reload_stack()` points `0xA74` at a dedicated,
zeroed scratch segment (`0xE000`) and sets `0xA76` to a generous byte limit (`0x1000`),
mimicking what the real init would have set up. This is a genuine, verified new fact about
DQK.EXE's overlay-manager runtime, not specific to this harness.

### 9.4 Second real bug found and fixed: overlay far-call segments need correction, and
   OvrMgr *itself* silently reloads overlays with fresh unpatched bytes mid-run

With the reload-stack fixed, the very first `CALL FAR 1D99:117F` (our own injected
instruction 1) still faulted a few thousand instructions later because overlay 3's
raw on-disk bytes contain **literal, unrelocated canonical segment immediates** in their own
far `CALL`/`JMP` instructions (e.g. the call to `1D99:117F` itself, embedded as literal bytes
`1D 99` inside overlay 3's code) — these need the same `+load_seg` correction the base image
gets from the *official* MZ relocation table, but overlay blobs have their **own**, separate,
**not reverse-engineered** internal fixup-table mechanism (the "352-byte chunks" §2.3 already
observed being read into a scratch buffer) that this harness cannot parse.

**Workaround (heuristic, clearly flagged as non-authoritative):** `_patch_far_refs_inplace()`
scans raw bytes for the fixed 5-byte `9A`/`EA` (far `CALL`/`JMP ptr16:16`) encoding and adds
`load_seg` to the segment operand whenever it looks like a plausible canonical segment
(`< 0x4000` — comfortably above every canonical segment named anywhere in this document,
including `0x00D7`, `0x1093`, `0x10B2`, `0x151E`, `0x2033`, all `OVERLAY_DESCS.runtime_seg`
values, and every segment named in §8.6's list). An earlier version of this pass walked the
blob with capstone's *linear* disassembler and silently **desynced** partway through overlay
4 (missed the `lcall 0x1093,0x15` at file `0x038EEA`, 5579 bytes into the overlay, because an
earlier byte sequence threw off instruction alignment) — the byte-scan version needs no
alignment tracking and doesn't have this failure mode.

Then a second, more interesting discovery: even with overlay 3/4 correctly pre-patched and
loaded once, execution **still** hit an uncorrected `CALL FAR 1093:0015` further into the
run. Root cause, found via the interrupt log: calling the FBOV stub makes **the real,
unmodified `OvrMgr` code perform genuine "(re)load this overlay from disk" operations for
BOTH overlay 3 (the one we started inside!) and overlay 4**, using this harness's INT21h
AH=3D/3F/42 stubs (backed by the real EXE bytes) — i.e. OvrMgr, finding no "already loaded"
bookkeeping (since the real init that would set that up was skipped), just reloads
everything, **silently overwriting** this session's one-time manual pre-patch with fresh,
unpatched raw bytes read straight from "disk." (This reload is itself a valuable, live
confirmation of §9.2's placement arithmetic: the log line `INT21/3F read... file[0x37910:
0x39fe0] into buf 35a4:0000` shows OvrMgr's *own* independently-computed destination segment
exactly matching this tool's prediction.) **Fix:** overrode `_on_int21`'s AH=3F handler to
apply the same heuristic correction to *every* live self-file read, not just the one-time
preload.

Also noted in passing, as a **live-confirmed correction candidate** for
`disasm_dqk.py`'s `OVERLAY_PREFIX_BYTES[3]` table (not applied this session, out of scope,
but recorded for whoever picks this up next): the real OvrMgr bulk-code read for overlay 3
started at file `0x30ED0`, not `0x30F35` (the table's current value, `code_start = file
0x0304B0 + 2693`). The discrepancy is exactly **101 bytes** (`0x65`) — the table's
"first-prologue-scan" heuristic apparently missed ~101 bytes of genuine pre-prologue
code/data at the front of the overlay. Not corrected here since it wasn't blocking (this
session's fixed `0x030F35` still landed inside real, executable overlay-3 code), but it's a
free, verified data point for a future accuracy pass.

### 9.5 Result: reached the real drawing routine, dynamically, for the first time

With both fixes in place, a run (`--max-instr 40000 --trace-window 9100`) does something
sessions 1-2 never achieved: it walks the **entire real FBOV dispatch chain** exactly as §3's
static analysis predicted —

```
instr 1:     CALLF 2f4e:0bdc -> 2d99:117f              (our injected start; the static call)
instr 8784:  JMPF  2d99:1182 -> 36f8:008b               (OvrMgr's LJMP, matches §3's
                                                          "1D99:0x117F -> LJMP 0x26F8:0x008B"
                                                          exactly: 0x26F8+load_seg=0x36F8)
instr 8785:  36f8:008b  push bp                          <- REAL journal-prompt-drawing
instr 8786:  36f8:008c  mov  bp, sp                         routine entry (file 0x038EDB),
instr 8787:  36f8:008e  sub  sp, 0x2c                       matching §3's known 1112-byte
                                                             routine's exact prologue
```

This is the first time in three sessions the actual copy-protection prompt-drawing code has
been observed **executing**, not just statically disassembled. The routine then makes a chain
of real, coherent-looking far calls into several distinct shared/library canonical segments
also named earlier in this document: `0xD7` (§5 item 6's "heavily-referenced... confirmed
live" segment), `0x1093`, `0x10B2`, `0x19A4`, `0x1A62`, `0x22B7` (named in §8.6's cold-boot
segment list), `0x251E` — for roughly **230 real instructions** (instr 8785–9016), including
what looks plausibly like pixel/coordinate arithmetic (`cmp si,0x1770; ... mov dx,di; add
dx,0xe0c0; mul dx`) consistent with a low-level text/box-drawing routine, though this was not
conclusively identified.

### 9.6 Where it diverges, and why: a caller-context problem, not a simple bug

At instr 9016 (`251e:05e5`, inside one of the library calls), a `RETF` pops a nonsensical
`CS:IP = 0xFF8C:0x251E`, sending execution into a huge stretch of never-written (all-zero)
memory — visible in the trace as thousands of `add byte ptr [bx+si],al` (the 2-byte all-zero
"instruction") until the run eventually faults on an unmapped fetch (`UC_ERR_FETCH_UNMAPPED`
at instr 37912, `CS:IP=ff8c:06de`, after IP wrapped around 0xFFFF once).

Diagnosis (from the surrounding disassembly): the code immediately before the `RETF` is a
"simulate a far return from a near call" trampoline idiom — `push <arg>; push <arg>; push es;
push cs; call <local-near-target>; ...; retf` — where the callee is invoked via a **near**
`CALL` (2-byte return address only) but returns via **`RETF`** (pops 4 bytes: IP then CS),
deliberately consuming the caller's own pushed `CS` (and part of its argument area) as the
"return-to" far address. This is a legitimate, self-consistent pattern *if* the full call
chain leading up to it pushed exactly the arguments the callee expects. Two independent
things point to a **missing-caller-context** root cause rather than a harness bug in the
patching logic:

1. The routine at file `0x038EDB` is entered via a **parameterless** far call (per §4's own
   disassembly dump, `031b0a cmp byte ptr [0xae59],0 / 031b0f jne 0x31b43 / 031b11 lcall
   0x1d99,0x117f` — no `push`es immediately before the `lcall`). Its own `[bp+N]` reads for
   positive `N` therefore read whatever is *above* the far call's own return-address push —
   in a real run, that would be the caller's own earlier-pushed arguments; in this
   hand-constructed run, it's the top of a stack we deliberately pre-zeroed, since we
   started execution exactly *at* the call site rather than inside whatever function
   originally set up arguments before reaching it.
2. One of the far calls in the chain (`20b2:0033 CALLF -> 19a4:05ee`) targets a canonical
   segment (`0x19A4`) that was executed **unpatched** (not `0x29A4`) — this call lives inside
   the base MZ image (physical `0x20b2` = `0x10b2+load_seg`, confirmed part of the base
   image), so it went through `build()`'s **official**, MZ-relocation-table-driven fixup path
   (authoritative, not this session's heuristic) and *still* wasn't corrected. This is either
   a genuine case where `0x19A4` is meant to stay a fixed/absolute reference (plausible — not
   every canonical-looking segment number necessarily follows the uniform rule) or a real gap
   in understanding; it wasn't resolved this session and is flagged honestly rather than
   asserted either way.

Either way, the underlying problem is structural: **a hand-constructed entry point this deep
into a real call chain cannot supply correct caller-provided stack content (arguments, and by
extension whatever this trampoline idiom expects) without simulating the full call chain back
to program start — which is, in effect, the same problem cold-boot emulation has, just moved
one level down.** This is a legitimate, understood limitation, not a dead end reached by
guesswork: getting further would require either (a) reconstructing the *actual* caller of
file `0x031B11` (an enclosing function this session did not trace back to), correctly
threading through whatever arguments/registers it sets up before reaching the call, or (b) an
organically-reached machine state (real cold boot, or a debugger snapshot — see §9.7).

### 9.7 Answering the task's three questions directly

**(a) Did hand-constructing the state work?** Yes, genuinely — with two real, verified fixes
(OvrMgr's reload-stack bookkeeping, and a heuristic far-call segment correction applied both
at load time and to live overlay reloads), it drove the emulator through the entire real FBOV
dispatch chain and into ~230 real instructions of the actual, previously-only-statically-known
journal-prompt-drawing routine — the first dynamic observation of this code in three sessions.

**(b) Did it reach/characterize the real compare?** **No.** Execution diverged (§9.6) before
reaching anything resembling a keyboard read or a word/answer comparison. No patch offset or
bytes are proposed — the target code was never observed executing, exactly as this task's own
guidance requires ("don't present garbage output as a finding").

**(c) Final honest summary across all 3 sessions and what's actually needed next:**

- Session 1: found the static call site (file `0x031B11`) and the drawing routine (file
  `0x038EDB`) by relocation-xref analysis; discovered DQK's UI is a generic, data-driven
  dialog engine (a 65-entry keystroke jump table), which is *why* no dedicated `CMP` was ever
  found by static search.
- Session 2: root-caused and fixed two genuine cold-boot harness bugs (environment-block
  double-NUL, DISK1/2/3 file search), then hit three sequential hardware gates (keyboard
  poll, VGA detection, VGA-retrace port I/O) climbing toward any menu — each fixed
  individually, next one always appearing, no evidence of convergence.
- Session 3 (this one): abandoned cold-boot entirely, hand-constructed a mid-function start,
  fixed two more genuine bugs (reload-stack bookkeeping, overlay far-call relocation),
  reached and dynamically confirmed the real drawing routine — then hit a *different* kind of
  wall (caller-context/stack-frame content that a mid-function injection cannot supply)
  about 230 instructions later.

Both directions — organic cold-boot (unbounded hardware gates) and hand-constructed
mid-function entry (missing caller context a few hundred instructions in) — have now been
tried to a reasonable depth and both hit structurally different but equally fundamental
walls for a fully headless, static-tooling-only approach. **What would actually be needed to
finish this:**

1. **An interactive session with a real 16-bit DOS debugger attached to a genuine cold boot**
   (DOSBox-X's debugger or equivalent, with breakpoint support) — set a breakpoint at file
   `0x031B11`, let the real, organically-booted game reach it naturally, and read out the
   *actual* register/stack/DGROUP state at that instant. This solves both problems at once:
   no hardware gates (it's a real boot) and correct caller context (it's the real call chain).
   This has been the "(b) DOSBox-X dynamic trace" option named in `dqk-copy-protection.md`
   since before session 1, and remains the most direct unblock.
2. **Fully reverse-engineering the FBOV per-overlay internal fixup-table format** (this
   session only approximated its *net effect* with a byte-scan heuristic, never decoded the
   actual entry structure) well enough to correctly and completely relocate overlay code
   offline, **plus** tracing file `0x031B11`'s actual caller far enough back to reconstruct
   its real argument-passing convention — a substantially larger, open-ended task in its own
   right, not a quick follow-up.

Per the task's explicit hard budget, this session stops here. `tools/unicorn_dqk_construct.py`
is left in the repo, working, documented, and reusable by whoever picks this up next (its
`--target-file-off` flag can seed a hand-constructed run at any known file offset, not just
`0x031B11`, if a future session identifies a better/later injection point — e.g. once the
answer-compare's *caller* is statically located, injecting there instead would have correct
argument context for that one call without needing the whole chain back to program start).

## 10. 2026-07-13 Synthetic DOS Memory Fix

The later route work hit an invalid-instruction stop at `20d7:094a` / `DQK.EXE:0x003aba`. That stop is
now root-caused as loaded-code overwrite, not original DQK code. The file bytes around
`0x003a80..0x003ad0` disassemble as normal Borland copy helpers, but the live bytes matched data from
`TITLE.TLB`. A write diagnostic caught `TITLE.TLB@0x190a0` being read into
`0x01df41..0x021f41`, overlapping the resident EXE image.

`tools/unicorn_dqk_trace.py` now has a more DOS-like minimal memory model:

- PSP offset `0x02` is initialized to `0xA000`.
- `INT 21h AH=4A` resizes the `ES` block instead of consuming a new bump allocation.
- Subsequent `AH=48` allocations start at the resized PSP block end.
- `--trace-dos-memory` logs `AH=48/49/4A` calls.
- `--watch-file-drift-after` limits expensive drift checks to a known instruction window, and drift
  logs now include `AX/BX/CX/DX/DS/ES/SI/DI/SS:SP/BP`.

The important route baseline also changed. `--load-seg 0x2000` was a workaround for the old overlap but
causes DQK's memory check to abort with `540000 bytes Required` and `524544 bytes available`. With the
fixed model, use `--load-seg 0x1000`. The verification run
`build\dqk-load1000-gate-partyinput-memfix.log` reached the 12M instruction cap without file drift in
the formerly corrupted copy-helper range. It still did not reach CA03 or the party/load dispatch; that
remaining gap is input/menu route fidelity, not resident-code corruption.

### 10.1 Repeat Exec-Watch Instrumentation

The tracer now has `--watch-exec-repeat` and `--watch-exec-repeat-limit` for state sampling at repeated
menu/form poll points. Repeated exec-watch logs include general registers, flags, selected DGROUP
fields (`a896`, `b7a7`, `b7f9`, `c7d8`, `ca03`, `a317`, `a627`), the active widget count/pointer
(`dac0`, `dac7`), decoded widget callback entries, `ad67:ad69`, and resident form discriminator fields
`1d0c`, `1d0e`, `1d10`, `1d12`, `1d13`, `a6b0`, `a6b5`, `a70c`, `a711`, `ad6c`, `ae26`, `ae57`,
`ae42`, `ae43`, `b20c`, `b20d`, `b20e`, `c2ef`, `c3f4`, `c5d0`, `c5ce`, `c5d2`, `c6e7:c6e5`,
`bd30`, and `bd32`.

The first fixed-memory repeat-watch pass is documented in
`docs/engine/research/dqk-start-load-route-anchors.md`. It proves the current `--load-seg 0x1000`
route is past the memory-corruption blocker and can accept the gated `SPACE`, but it still lands in a
generic active-form/widget loop. `25a4:3127` and `25a4:33c3` never execute, and
`build\dqk-ca03-watch-load1000-repeat-input.csv` contains no CA03 rows.

### 10.2 Flow-Range Branch Tracing

The tracer now has `--trace-flow-range SEG:START:END[:LABEL]` and `--trace-flow-limit`. This samples
only control-flow instructions inside selected canonical ranges and logs registers, stack words, and
DQK form/widget globals. It is meant for narrow route questions where full instruction logging would be
too noisy.

The first flow-range pass targeted `264f:0040..0090`, `1102:0080..00d0`, `169b:0e50..0ec0`, and
`1aa6:16f0..1720` in the fixed-memory party-input-gated route. The run
`build\dqk-load1000-flow-activeform.log` confirms that the accepted gated `SPACE` reaches live
`364f:0079` with `AX=0x0020`, then follows the normal overlay-4 active-form key-return path mapped by
`--resolve 0x264f 0x0079` to file `0x038439`. It skips the `0x152` / `0x153` special-key handlers,
calls the resident flush/settle path, and returns with `dac0=0`, `c7d8=0`, and `ca03=0`.

This narrows the remaining Unicorn gap again: the missing party/load route is not inside the
`364f:0079` key-return branch. The follow-up caller-shell run
`build\dqk-load1000-flow-formshell-long.log` traces `264f:03a2..03c3`: returned `AL=0x20` is treated as
Space, a local counter reaches `9`, `264f:03c3` returns to startup caller `2d99:0701`, and the route
then reaches the known generic widget form (`dac0=4`, `dac7=422e:db68`, generic callbacks) without
executing `25a4:3127` or `25a4:33c3`. The next Unicorn target is therefore form installation/state
selection before the generic widget form appears, or DOSBox-X debugger capture at the original
party/load anchors.

### 10.3 DGROUP Form-State Write Watches

The tracer now has `--watch-dgroup-write OFFSET[:LABEL]` and
`--watch-dgroup-write-limit`. These watches use DQK's canonical DGROUP segment
`0x322e + load_seg`, not arbitrary DS/ES/SS aliases. An earlier local attempt checked every live
DS/ES/SS segment and produced false positives when unrelated string/video buffer writes happened to
land at `segment:offset` aliases; the fixed implementation watches only the real DGROUP physical
address and annotates whether DS/ES/SS currently equal that segment.

The first fixed run is:

```powershell
python tools\unicorn_dqk_trace.py --run --load-seg 0x1000 --fake-video --fake-keyboard `
  --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys esc,wait:2500000,space,space,gate:0x25a4:0x33c3:party-menu-input-call,l,t,a,enter,b `
  --max-instr 8300000 --watch-ca03-operands `
  --watch-exec 0x264f:0x03c3:form-shell-after-space-loop `
  --watch-exec 0x1aa6:0x1703:widget-poll `
  --watch-exec 0x25a4:0x3127:party-render `
  --watch-exec 0x25a4:0x33c3:party-input `
  --watch-exec-repeat --watch-exec-repeat-limit 8 `
  --watch-dgroup-write 0xdac0:dac0 `
  --watch-dgroup-write 0xdac7:dac7_off `
  --watch-dgroup-write 0xdac9:dac7_seg `
  --watch-dgroup-write 0xad67:ad67_off `
  --watch-dgroup-write 0xad69:ad67_seg `
  --watch-dgroup-write 0xc7d8:c7d8 `
  --watch-dgroup-write 0xa627:a627 `
  --watch-dgroup-write 0xca03:ca03 `
  --watch-output build\dqk-ca03-watch-load1000-dgroup-formwrites-fixed.csv `
  --log build\dqk-load1000-dgroup-formwrites-fixed.log
```

Result: still zero CA03 rows and the `25a4:33c3` party-menu gate remains unreleased. The new positive
evidence is the generic-widget form installer:

- `DQK.EXE:0x01e0db` / live `2aa6:127b` writes `dac9 = ES`.
- `DQK.EXE:0x01e0df` / live `2aa6:127f` writes `dac7 = BX`.
- `DQK.EXE:0x01e0e3` / live `2aa6:1283` resets `dac0 = 0`.
- `DQK.EXE:0x01e1ac` / live `2aa6:134c` increments `dac0` once per parsed widget record.

In this run, those writes occur around instructions `7926522..7967304`: `dac7` becomes
`422e:db68`, then `dac0` climbs from `0` to `4`, producing callbacks
`[0:2aa6:1183,1:1bdb:008e,2:1bdb:008e,3:1bdb:008e]`. The later `1aa6:1703` poll is therefore not the
party/load form; it is a generic four-widget form built by the `1aa6` widget parser. Static
disassembly at `0x01e0d7..0x01e0f3` shows the pointer/count reset, and `0x01e18e..0x01e37b` is the
widget-definition parser. A raw caller scan finds the widget-storage setup call
`CALL FAR 1aa6:11eb` at `DQK.EXE:0x037cfa` in overlay-4 startup/form allocation code, but the
specific form-definition source that feeds the later four parsed widget records remains open.

The follow-up `build\dqk-load1000-formcaller.log` run added exec watches for `1aa6:11eb`,
`1aa6:1277`, `1aa6:1294`, `1aa6:134c`, and the likely static `25a4:*` party/load candidates. It
confirms that the observed route hits only the generic `1aa6` chain: `1aa6:11eb` fires once from
`DQK.EXE:0x037cfa`, `1aa6:1277` is called from live `1bdb:0dcf`, and the four `1aa6:1294` calls come
from resident `1bdb` form-definition code. The concrete file anchors are:

- `1bdb:09cc` / `DQK.EXE:0x00eb7c`: pushes callback `cs:064f` or `cs:06c6`, pushes widget type `7`,
  then calls `1aa6:1294`.
- `1bdb:08b5` / `DQK.EXE:0x00ea65`: calls `1aa6:1294` while looping over parsed text/list entries.

The watched `25a4:*` candidates (`1e98`, `2639`, `264f`, `3127`, `33c3`) still do not execute under
this Unicorn input route. The next trace should therefore work backward from the resident `1bdb`
generic form-definition path to the route discriminator, or switch to DOSBox-X breakpoints at the
original party/load anchors.

### 10.4 Resident Form-Discriminator State

Exec-watch and flow logs now include a wider resident form-state suffix through
`_form_state_text()`: `1d0c`, `1d0e`, `1d10`, `1d12`, `1d13`, `a6b0`, `a6b5`, `a70c`, `a711`,
`ad6c`, `ae26`, `ae57`, `ae42`, `ae43`, `b20c..b20e`, `c2ef`, `c3f4`, `c5d0/c5ce/c5d2`,
`c6e5:c6e7`, and `bd30/bd32`. This was added because the previous trace had identified the resident
`1bdb` builder but not the form-mode discriminator that keeps execution out of the overlay-7 party/load
path.

The focused run is recorded in `build\dqk-load1000-1bdb-formmode.log` with CA03 output
`build\dqk-ca03-watch-load1000-1bdb-formmode.csv`. It used fixed-memory `--load-seg 0x1000`,
the direct `gate:0x25a4:0x33c3:party-menu-input-call`, repeated exec watches, flow traces over
`0bdb:0800..0ecf` and `0bdb:1008..11f0`, and DGROUP write watches for both widget and form-mode
fields.

Result: still no CA03 capture. The CSV contains only the header row, the party-menu gate stays waiting
at canonical `25a4:33c3`, and the run reaches the `8050000` instruction cap. Watch addresses are
canonical; under current `--load-seg 0x1000`, canonical `1aa6:*` appears live as `2aa6:*`, and
canonical `0bdb:*` appears live as `1bdb:*`. The positive finding is that the wrong form is now
identified more specifically:

- Early widget allocation at `1aa6:11eb` already sees `1d0c=2`, `1d13=1`, and `a6b5=0`.
- `1bdb:0d1f` / file `0x00eecf` writes `a6b5=1`; `1bdb:0d22` / `0x00eed2` writes `1d13=1`.
- `1aa6:1277` / file `0x01e0d7` publishes `dac7=422e:db68` with `1d0c=2`, `a6b5=1`,
  `ae57=4`, `ae42=ae43=ff`, `c5ce=1b58`, and `c5d2=1`.
- `1bdb:09cc` / file `0x00eb7c` installs the resident header widget, then `1bdb:0801` /
  file `0x00e9b1` enters the list/text widget loop.
- `1aa6:1294` / `1aa6:134c` still build four widget records and set `dac0=4`.
- `1bdb:1008` / file `0x00f1b8` enters the generic input loop with
  `1d0c=2`, `1d13=0`, `a6b5=1`, `dac0=4`, `dac7=422e:db68`, callbacks
  `[0:2aa6:1183,1:1bdb:008e,2:1bdb:008e,3:1bdb:008e]`, `a627=0x000a`, and `ca03=0`.

The first `1d0c=2` source is now identified as file-loaded initial form/resource data. The tracer's
DGROUP write watch now also observes DOS `INT 21h/AH=3F` reads into watched DGROUP addresses, not only
CPU writes. A short run,
`build\dqk-load1000-early-1d0c-readwatch.log`, captures:

```text
DGROUP-WRITE #1 source=int21/3f-read:DQK.EXE@0x63a20
  form_mode_1d0c@dgroup:1d0c ... value=file-bytes:form_mode_1d0c=02 00 ...
```

The load is issued by `2d99:036c` / file `0x0200fc` at instruction `680`, reading `DQK.EXE`
`0x63a20..0x6dc80` into `422e:0000`. Therefore `DGROUP:1d0c` maps to file `0x6572c` in that loaded
block; nearby bytes include resident UI/form strings such as `%s`, `%c`, `Press      to continue.`,
and `Return`. Startup zero-fill at `1000:00b7` / file `0x0024b7` begins at `DGROUP:a260`, so it leaves
`1d0c` and `1d13` intact.

So the next route question is no longer "which code builds `dac0=4`?" or "which late instruction sets
`1d0c=2`?" It is "which resident form/resource data loaded from `DQK.EXE@0x63a20` is being consumed,
and why does the startup route keep selecting that generic continue/return form instead of overlay-7
`25a4:3127/33c3` party/load form?"

The static resident setters were then checked separately:

- `0bdb:141e` / file `0x00f5ce`: generic setter, `mov [1d0c], [bp+6]`.
- `0bdb:1410` / file `0x00f5c0`: `0bdb:1206` fallback, `mov [1d0c], 2`.
- `0bdb:0521` / file `0x00e6d1`: pushes mode `2`, calls `0bdb:141e`, then calls `0bdb:1206`.
- `0bdb:1a1b` / file `0x00fbcb`: alternate resident mode-`2` caller.
- `0bdb:1f25` / file `0x0100d5`: direct resident generic-input candidate.

`build\dqk-load1000-mode2-callers.log` watched all of those in the same party-input-gated route.
The known setters/callers did not execute. The actual positive hits were `0bdb:0dcf` at instruction
`7926520`, `0bdb:1206` at `8020243`, and `0bdb:1008` at `8020250`; the direct party gate still waited
at `25a4:33c3`, and `build\dqk-ca03-watch-load1000-mode2-callers.csv` has zero CA03 rows. That means
the current Unicorn route preserves file-loaded mode `2` into the resident input wrapper; it does not
actively select mode `2` through `0bdb:0521` / `0bdb:141e`.

The concrete `0bdb:1206` call-site is now known. `build\dqk-load1000-1206-callsite.log` watched each
resident near-call site to `0bdb:1206`; only canonical `0bdb:1e87` / file `0x010037` hit, at
instruction `8020242`. The enclosing function begins at `0bdb:1e29` / file `0x00ffd9`. It can either
call `0bdb:0521` at file `0x00fffd` or fall through to `0bdb:0d26` via `0bdb:eed6` and then call
`0bdb:1206` at `0x010037`. The current route takes the latter branch.

The follow-up run `build\dqk-load1000-branch-1e29.log` traced that branch under the same
fixed-memory `--load-seg 0x1000` route. It confirms the branch is decided by the far helper
`00d7:2543`: when `0bdb:1e29` executes in the current route, `00d7:2543` returns `AX=0000`.
The `or ax, ax` at `0bdb:1e45` and `je` at `0bdb:1e47` therefore jump to `0bdb:1e5c`
(`DQK.EXE:0x01000c`), not the `0bdb:0521` call at `DQK.EXE:0x00fffd`. The traced path is
`0bdb:1e5c -> 0bdb:1e73 -> 0bdb:0dcf -> 0bdb:1e87 -> 0bdb:1206 -> 0bdb:1008`.

The same log records no `DQK CA03 WATCH` rows and no `25a4:*` party/load execution before the
`8050000` instruction cap. So the current tracer conclusion is sharper: the bad resident form route
is caused by a zero result from `00d7:2543` for the active form/resource arguments.

Static disassembly resolves that helper. `00d7:24de` / file `0x00564e` is a NUL-terminated far-string
compare with ASCII case-folding; it returns `AX=0` for equal strings and non-zero lexical results for
mismatch. `00d7:2543` / file `0x0056b3` wraps it as boolean equality, returning `AX=1` when the
strings match and `AX=0` when they do not. `0bdb:1e29` compares its caller-provided string pointer
`[bp+0xa]/[bp+0xc]` against `DGROUP:3aee/3af0`. That DGROUP pair is a far pointer to the canonical
prompt string `Press button or enter to continue` (`322e:425f`, file `0x067c7f`), with the adjacent
`DGROUP:3af2/3af4` pointing at `~Press button or enter to continue`.

The next DQK trace target is therefore the live caller-provided prompt string at `0bdb:1e29`, rather
than the already-observed `0bdb:1e47` branch itself. A useful watch needs to dump the far pointer in
`[bp+0xa]/[bp+0xc]`, decode that string, and compare it to the relocated `DGROUP:3aee/3af0` continue
prompt.

`build\dqk-load1000-form-gate-streq.log` adds that watch support and captures the live mismatch. The
`0bdb:1e3d` watch, immediately before `lcall 00d7:2543`, logs:

```text
left:422e:4ed4 'Play Demo Quit'
right:422e:425f 'Press button or enter to continue'
```

This proves the current fixed-memory Unicorn route is still presenting the title/demo/quit option
form when it reaches `0bdb:1e29`. The string-equality helper is working as expected: it returns
`AX=0`, the code jumps to `0bdb:1e5c`, and the run continues into the resident generic form/input
path. The next tracer target is no longer this branch; it is the earlier title form route transition
needed to reach the `25a4:*` party/load anchors.

### 10.5 Title Route and Save Enumeration Resolved

`build\dqk-load1000-title-P-gated.log` resolves that title transition. The title form accepts raw BIOS
`0x1950` for uppercase `P` / `Play`; lowercase fake-key `p` (`0x1970`) is not sufficient on this route.
With a gate at `0bdb:1e3d`, the trace confirms the same `Play Demo Quit` vs continue-prompt compare,
then returns from the generic form with `AX=0000` and reaches the overlay-7 party/load anchors:

```text
25a4:33ef party-menu-dispatch-loop-entry
25a4:3127 party-menu-render-entry
25a4:33c3 party-menu-input-call
25a4:3664 party-menu-load-saved-game-case
```

That run exposed the next synthetic-DOS gap: DQK uses `INT 21h/AH=4E` and `AH=4F` to enumerate
`SAVE\*.*`. The harness now keeps a minimal DTA address from `AH=1A`, performs case-insensitive
wildcard matching across the game root plus `SAVE`, `DISK1`, `DISK2`, and `DISK3`, and writes enough
of the DOS find-result record for DQK to continue: attribute, size, and ASCIIZ 8.3-ish name.

`build\dqk-load1000-title-P-findfirst.log` proves the fixed route:

```text
INT21/4E findfirst b'SAVE\\*.*' -> SAVGAMA.QSV
INT21/4F findnext -> VAULTA.DAT
INT21/4F findnext -> no more files
INT21/3D open b'SAVE\\SavGamA.qsv' -> handle 25
```

The same run opens `DISK3\ECL.glb`, `DISK3\GEO.glb`, `DISK2\8x8dc.tlb`, `DISK2\8x8db.tlb`,
`DISK2\back.tlb`, and `DISK2\PICB.tlb`, then writes
`build\dqk-ca03-watch-load1000-title-P-findfirst.csv` with three `25a4:1d47` CA03 setter hits:

```text
instr 17664427 op1=0xba op2=0x03 old-ca03=0x0004 stream=5b6e:8000 b7f9=0x8277
instr 17934408 op1=0xba op2=0x07 old-ca03=0x0004 stream=5b6e:8000 b7f9=0x8295
instr 18463728 op1=0xba op2=0x07 old-ca03=0x0004 stream=5b6e:8000 b7f9=0x82d0
```

Those watches log before the write instruction executes, so `old-ca03` is the pre-instruction value.
The tracer now reaches the live setter; the next target is the downstream `DungCom1` / `WildCom1`
consumer and map-setup path.

### 10.6 CA03 Stream Bytes and Consumer Negative

`tools/unicorn_dqk_trace.py --watch-ca03-operands` now includes raw stream windows in its CSV output:
`stream_base_phys`, straight-line `stream_phys` / `stream_at`, and wrapped real-mode
`stream_wrap_phys` / `stream_wrap_at`. The wrapped view is the useful one for the current CA03 rows.
The straight-line `seg*16 + off + b7f9` view lands on code-like bytes; the wrapped
`seg:((off+b7f9)&ffff)` view lands on ECL-like opcode/operand bytes.

`build\dqk-ca03-watch-load1000-streambytes-wrap.csv` captures:

```text
b7f9=0x8277 wrap=0x05b957 bytes=09 00 00 01 39 00 11 80 15 64 f5 60 0c f3 94 24 ...
b7f9=0x8295 wrap=0x05b975 bytes=1d 09 00 01 01 97 00 0e 00 96 09 00 00 01 39 00 ...
b7f9=0x82d0 wrap=0x05b9b0 bytes=2b 01 bf 00 00 07 80 05 40 13 01 0c 50 80 05 50 ...
```

Direct `ECL.GLB` file offsets `0x8277`, `0x8295`, and `0x82d0` fall inside member 5, but the file
bytes do not match these runtime windows. That means the source stream is staged runtime data, not a
simple direct file-offset view.

`tools/dqk_ca03_stream_decode.py` decodes those wrapped windows with the Gen2 ECL framing:

```text
8277: SAVE #0, 0x0039
827d: PRINT "YOU CONTINUE INTO THE CITY."
8295: PARTYSTRENGTH flag:0
8298: GOTO 0x0097
829c: PICTURE #150
829f: SAVE #0, 0x0039
82a5: PRINTCLEAR "THE CITY OF PALAN"
82d0: HORIZONTAL_MENU 0x00bf, #7, "PALACE", "TEMPLE", "HALL", "SHOP", ...
```

`build\dqk-load1000-consumers.log` then extended the same route to 40M instructions with watches on
the static consumer path (`28d0:0f14`, `28d0:0f25`, `28d0:0f2e`, `28d0:0f3e`, `28d0:0f47`,
`28d0:0f6d`, `28d0:0f73`, and `2740:172c`). It still hits only the three `25a4:1d47` setter rows and
does not open `DUNGCOM.TLB` or `WILDCOM.TLB`. The live route is therefore proven through save-load and
CA03 setter, but not yet through combat terrain consumption.

### 10.7 Journal Gate Correction on the Loaded Route

`build\dqk-load1000-journal-gate.log` adds journal-route watches after the loaded save and proves that
the route does enter the real Begin Adventuring path:

```text
party-menu-begin-adventuring-case-file-047eb2 canonical=25a4:3702 ... instr=13437101
journal-prompt-draw-entry-file-038edb canonical=26f8:008b ... instr=13897005
```

The run also explains why it produced no new CA03 rows. The fake-key queue was waiting on
`gate:0x1f4e:0x0be1:journal-call`, but the live organic path hit the prompt drawing routine
`26f8:008b` instead. The trace line is explicit:

```text
KEY gate-wait target=journal-call canonical=1f4e:0be1 ... instr=13306305 idx=12/13
```

So the next key was never released, the journal answer was never supplied, and the route stalled before
any later combat-consumer path. Future loaded-save traces should gate on `26f8:008b:journal-draw`, then
dump or solve the live journal prompt before watching `28d0:0f25`, `28d0:0f3e`, `2740:0846`, and
`2740:172c`.

Follow-up implementation: `tools/unicorn_dqk_trace.py` now treats any canonical `26f8:*` exec watch as
a journal prompt-state dump. It decodes the table at `DGROUP:6dd2` (20-byte rows: heading pointer,
page number, three word-number variants, three expected-answer pointers), and also logs the reliable
post-copy buffers `DS:c6f9` expected answer, `DS:c723` typed answer, and `SS:BP-0x2a` decoded heading
when available. The fake-key parser also accepts `journal-answer`; once `DS:c6f9` is non-empty, that
token expands to the staged answer plus Enter.

`build\dqk-load1000-journal-autoanswer.log` proves this route:

```text
journal-expected-answer-staged-file-038f7f ... staged:422e:c6f9 'FROM'
KEY journal-answer-expand chars=4
journal-prompt-input-copy-file-0390cf ... decoded_heading:422e:ffa0 'RUNNING AWAY'
journal-answer-compare-call-file-039112 ... staged:422e:c6f9 'FROM' typed:422e:c723 'FROM'
```

The same auto-answer run writes three CA03 rows, decoded again as the Palanthas city/menu script
context, and still does not hit `DungCom1` / `WildCom1` or the combat render consumers before the
instruction cap. So the journal prompt is no longer the current DQK route blocker; the blocker has
moved to post-journal navigation/state selection out of Palanthas city/menu context and into a native
combat terrain setup path.

### 10.8 Palanthas Palace Route And False COMBAT Correction

`gate-b7f9` now reads stream offset `B7F9` from canonical DQK DGROUP (`self.dgroup_seg`) rather than
from the current `DS`. This matters because current `DS` can point elsewhere when the code hook checks
the gate. The gate also blocks later fake keys until the requested stream offset appears, so prompt
keys that must happen before the target must be listed before `gate-b7f9`.

With that correction, the loaded-save route can answer the journal prompt, pass three Return prompts,
gate on the Palanthas menu at `b7f9=0x82d0`, and choose `PALACE` with raw BIOS key `0x1950`:

```text
...,gate:0x26f8:0x012f:journal-answer-staged,journal-answer,enter,enter,enter,gate-b7f9:0x82d0:palanthas-menu,0x1950
```

The focused run is documented in
`docs/engine/research/dqk-palanthas-palace-combat-route.md` and writes
`build\dqk-ca03-watch-load1000-palanthas-palace3.csv`. The first decode proved the menu branch but
incorrectly reused Gen1's one-operand `PARTYSTRENGTH` frame:

```text
82d0: HORIZONTAL_MENU ..., "PALACE", "TEMPLE", "HALL", "SHOP", "INN", "BAR", "LEAVE"
82fe: ON_GOTO ..., 0x8319, 0x860f, 0x8648, 0x8655, 0x85d6, 0x8689, 0x87cb
831f: PRINTCLEAR "YOU ENTER THE PALACE AND ARE QUICKLY ESCORTED TO GENERAL LAURANA'S CHAMBERS. "
8436: PARTYSTRENGTH c12:128
8439: COMBAT
```

That `8439: COMBAT` line is now disproven. A later filtered DGROUP write trace shows DQK Gen2
`0x1d` is zero-operand in this route. The byte at `0x8439` is the inline-string length for the
`PRINTCLEAR` dispatched at `0x8437`, not a top-level opcode. With the corrected decoder the same area
reads:

```text
83ae: PARTYSTRENGTH
83af: SAVE #14, 0x0039
83b5: PRINTCLEAR "'AH, MY CHAMPIONS, I AM HONORED BY YOUR PRESENCE..."
8436: PARTYSTRENGTH
8437: PRINTCLEAR "'ONCE AGAIN, OUR BELOVED KRYNN NEEDS YOUR AID.' "
845e: SAVE #0, 0x0039
8464: PRINT "THE GENER..."
```

The same route later returns to the Palanthas menu (`b7f9=0x82d0`). It still does not hit the native
`DungCom1` / `WildCom1` consumers (`28d0:0f25`, `28d0:0f3e`) or the 7x7 render watches
(`2740:0846`, `2740:172c`), but this is now expected because the route is narrative/menu flow, not a
combat handoff.

### 10.9 ECL Stream-State Logging And Dispatch Candidate

Static disassembly now has one credible Gen2 ECL stream-dispatch / operand-advance candidate at
`DQK.EXE:file 0x041645`:

```text
041645  les       bx, ptr [0xae5c]
041649  add       bx, word ptr [0xb7f9]
04164d  mov       al, byte ptr es:[bx]
041650  mov       byte ptr [0xb1c7], al
041653  mov       al, byte ptr [0xb1c7]
041656  mov       ah, 0
041658  dec       ax
041659  cmp       ax, 0x40
04165c  jbe       0x41661
04165e  jmp       0x4178e
041661  mov       bx, ax
041663  shl       bx, 1
041665  jmp       word ptr cs:[bx + 0x13aa]
```

The shape matches the known stream globals: `[ae5c:ae5e]` is the current ECL stream pointer,
`[b7f9]` is the stream cursor, and `[b1c7]` receives the current opcode. The adjacent table bytes are
plausible as a compact dispatch/advance table, but the exact live table base is not proven.

A focused Palace trace watched the provisional canonical addresses `25a4:1275` (`ecl-dispatch`) and
`25a4:14ce` (`ecl-zero-op-advance`) along with the known `25a4:1d47` CA03 writer and terrain/render
anchors. The latest run wrote `build\dqk-ca03-watch-load1000-palanthas-palace-eclstate.csv` and
`build\dqk-load1000-palanthas-palace-eclstate.log`. Result: the CA03 writer still appeared around
`b7f9=0x83ae` and `b7f9=0x8498`. `25a4:14ce` also fired twice, but only early in the route
(`b7f9=0x802b`, `ecl=b1c7:0x3d cur:0x3d`; then `b7f9=0x803d`,
`ecl=b1c7:0x00 cur:0x00`). `25a4:1275` still did not appear, and the `DungCom1` / `WildCom1` / 7x7
renderer watches stayed negative.

To make the next dynamic pass less dependent on guessed static-to-live mappings,
`tools/unicorn_dqk_trace.py` now appends canonical DGROUP ECL stream state to execution-watch summaries:

```text
ecl=b1c7:<last-opcode> cur:<current-stream-byte> at:<stream-seg>:<stream-off+b7f9>
```

This reads canonical `self.dgroup_seg`, not current `DS`, because current `DS` is transient during many
hooks. The new field lets future traces at proven live anchors show both the last opcode copied to
`[b1c7]` and the byte currently addressed by `[ae5c:ae5e]+[b7f9]`. Validation for this tracer slice:

```powershell
python -m py_compile tools\unicorn_dqk_trace.py tools\dqk_ca03_stream_decode.py tools\disasm_dqk.py
python tools\unicorn_dqk_trace.py --smoke-test
```

Both commands pass locally. The current DQK gap is therefore not the title route, save route, journal
answer, or Palanthas menu gate. It is finding a real top-level Gen2 `0x24 COMBAT` route and tracing
that handoff: `25a4:14ce` is reachable live as a shared early ECL/control fragment, but the Palace
`0x8439` byte is not an opcode and cannot explain tactical setup.

### 10.10 Filtered DGROUP Writes Around Suspected Stream Offsets

`tools/unicorn_dqk_trace.py` now supports:

```powershell
--watch-dgroup-write-b7f9-range START:END
```

When used with `--watch-dgroup-write`, this limits DGROUP write logging to rows where canonical DQK
`[b7f9]` is inside the inclusive range, or where the watched write itself moves `[b7f9]` into the
range. This keeps long Palace traces small enough to inspect around a suspected stream offset.

The confirming run:

```powershell
python tools\unicorn_dqk_trace.py --run --load-seg 0x1000 --fake-video --fake-keyboard `
  --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys "esc,wait:2500000,space,space,gate:0x0bdb:0x1e3d:title-form-streq,0x1950,gate:0x25a4:0x33c3:party-menu-input-call,l,t,a,enter,b,gate:0x26f8:0x012f:journal-answer-staged,journal-answer,enter,enter,enter,gate-b7f9:0x82d0:palanthas-menu,0x1950" `
  --max-instr 22000000 `
  --watch-ca03-operands --watch-dqk-route --watch-exec-repeat --watch-exec-repeat-limit 20 `
  --watch-exec 0x2033:0x0f46:ecl2033-loop-entry `
  --watch-exec 0x2033:0x0f76:ecl2033-b1c7-write `
  --watch-exec 0x2033:0x0d1e:ecl2033-dispatch `
  --watch-exec 0x2033:0x0e7f:ecl2033-combat-stub `
  --watch-exec 0x2033:0x081b:ecl2033-combat-handler `
  --watch-exec 0x25a4:0x0b17:palace-combat-cursor-inc `
  --watch-dgroup-write 0xb1c7:ecl-last-opcode `
  --watch-dgroup-write 0xb7f9:ecl-cursor `
  --watch-dgroup-write-limit 400 `
  --watch-dgroup-write-b7f9-range 0x8430:0x8440 `
  --watch-output build\dqk-ca03-watch-load1000-palanthas-2033-combat.csv `
  --log build\dqk-load1000-palanthas-2033-combat.log
```

Key rows:

- `[b1c7] = 0x1d` at `b7f9=0x8436`; cursor advances to `0x8437`.
- `[b1c7] = 0x12` at `b7f9=0x8437`; cursor advances to `0x8439`.
- At `b7f9=0x8439`, current byte `0x24` is consumed while `[b1c7]` remains `0x12`.
- `2033:0e7f` and `2033:081b` do not fire on this route.

### 10.11 Area-5 Accessor-Watch Negative Control

The area-5 route should not use native `MEM[...]` rows as original `DQK.EXE` DGROUP offsets. In
GBBOOT/CCECL, rows such as `MEM[0023]`, `MEM[0111]`, `MEM[0112]`, `MEM[00ca]`, `MEM[00cb]`, and
`MEM[00cc]` are logical sparse-memory keys stored by the CCECL VM. They are not row indices and they
are not proven retail DQK globals. Original traces should therefore watch confirmed globals such as
`[ae5c:ae5e]`, `[b7f9]`, `[b1c7]`, `[bedb:bedd]`, and `[ca03]`; pokes to the native logical keys must
be treated as synthetic-only.

The tracer now adds live operand detail for two useful accessor anchors:

- `2033:0112` logs the far-call operand index from `SS:SP+4` and the corresponding parsed operand
  bytes from canonical DGROUP tables `B215`, `B185`, and `AE6A`.
- `1D99:11CF` logs the far-call `value` and `kind` arguments plus the nearby derived-lookup state.

The confirming negative run used the staged area-5 key route with `--watch-ecl-opcode 0x24`,
`--watch-ca03-operands`, byte-validated combat-map dumping, and setup/render watches for
`2033:0e7f`, `2033:081b`, `28d0:0e70`, `28d0:0f25`, `28d0:0f3e`, `2740:0846`, and `2740:172c`.
It reached the 15M instruction cap, consumed all fake keys, and wrote:

- 18 `2033:0112` accessor hits;
- seven `1D99:11CF` derived-lookup hits;
- one `[ca03]` watch row near `b7f9=0x82d0`;
- zero `ECL-OPCODE opcode=0x24` rows;
- zero accepted `[bedb]+9` combat-map dump rows;
- three expected `DQK-COMBAT-MAP alias-skip` rows.

This is a useful instrumentation regression, not a combat proof. The route is still around early
menu/script stream state (`b7f9=0x82d0`), not the native area-5 combat handoff around `0x91cf`.

### 10.12 Stop-On Proof Hooks For Top-Level COMBAT

The tracer now has two stop controls for the next long DQK combat-handoff probes:

```powershell
--stop-on-ecl-opcode
--stop-on-dqk-combat-map-hit
```

`--stop-on-ecl-opcode` stops immediately after a watched `--watch-ecl-opcode` row is logged. For the
current task this means pairing it with `--watch-ecl-opcode 0x24`, so the emulator halts at the first
top-level opcode write to canonical DGROUP `[b1c7]` instead of running to an instruction cap.
`--stop-on-dqk-combat-map-hit` stops only after an accepted byte-validated DQK combat-map snapshot;
overlay alias skips still do not count.

The next area-5 original-runtime probe should use the staged fixture plus the corrected target stream:

```powershell
python tools\unicorn_dqk_trace.py --run --exe build\dqk-area5-save-trace\DQK.EXE `
  --load-seg 0x1000 --fake-video --fake-keyboard --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys "esc,wait:2500000,space,space,gate:0x0bdb:0x1e3d:title-form-streq,0x1950,gate:0x25a4:0x33c3:party-menu-input-call,l,t,a,enter,b,gate:0x26f8:0x012f:journal-answer-staged,journal-answer,enter,enter,enter,gate-b7f9:0x91cf:area5-combat" `
  --max-instr 60000000 `
  --watch-dqk-route --watch-dqk-save-transfer --watch-ca03-operands `
  --watch-output build\dqk-ca03-watch-area5-route91cf.csv `
  --watch-ecl-opcode 0x24 --watch-ecl-opcode-limit 50 --stop-on-ecl-opcode `
  --watch-dgroup-write 0xb1c7:ecl-opcode `
  --watch-dgroup-write 0xb7f9:ecl-pc `
  --watch-dgroup-write 0xae5c:ecl-stream-off `
  --watch-dgroup-write 0xae5e:ecl-stream-seg `
  --watch-dgroup-write 0xbedb:combat-map-ptr-off `
  --watch-dgroup-write 0xbedd:combat-map-ptr-seg `
  --watch-dgroup-write 0xca03:ca03 `
  --watch-dgroup-write-b7f9-range 0x91c0:0x91e0 `
  --watch-dgroup-write-limit 500 `
  --watch-exec 0x2033:0x0112:operand-accessor `
  --watch-exec 0x1d99:0x11cf:derived-lookup `
  --watch-exec-repeat --watch-exec-repeat-limit 100 `
  --dump-dqk-combat-map build\dqk-bedb9-area5-route91cf --stop-on-dqk-combat-map-hit `
  --log build\dqk-area5-route91cf-runtime.log
```

Passing this run would mean either a logged `ECL-OPCODE opcode=0x24` at the area-5 stream or an accepted
byte-validated combat-map snapshot. It still would not by itself finish DQK combat recovery; the
follow-up would be to inspect the stopped register/memory state and trace from the live `0x24` handler
into `28d0:*` setup and `2740:*` render consumers.

### 10.13 Area-5 Route91cf Stop Trace Negative

The probe above has now been run as
`build\dqk-area5-route91cf-stop.log` with `--stop-on-ecl-opcode`,
`--stop-on-dqk-combat-map-hit`, a `[b7f9]` range around `0x91c0..0x91e0`, and byte-validated
`--dump-dqk-combat-map build\dqk-bedb9-area5-route91cf-stop`.

It is a stronger negative, not the desired proof:

- the run reached the full `60000000` instruction cap instead of either stop condition;
- it reached the loaded-save route, enumerated `SAVE\*.*`, opened `SAVE\SavGamA.qsv`, and solved the
  journal prompt with staged/typed answer `FROM`;
- the route reached the `gate-b7f9:0x91cf:area5-combat` wait while the live stream state was still
  `b7f9=0x82fe`, `b1c7=0x2b`, `cur=0x25`, `ca03=0xfef0`, in an eight-widget menu/input form;
- `build\dqk-ca03-watch-area5-route91cf-stop.csv` contains one `[ca03]` row at `b7f9=0x82d0`,
  decoding to the Palanthas/city menu stream, not the native area-5 combat stream;
- there are zero `ECL-OPCODE opcode=0x24` rows;
- `build\dqk-bedb9-area5-route91cf-stop.csv` is header-only, so no byte-validated `[bedb]+9`
  combat-map snapshot was accepted.

The durable conclusion is that the generated/staged area-5 loaded-save fixture is still insufficient
to force original `DQK.EXE` into the native area-5 `0x91cf` combat stream. The remaining gap is the
target area/ECL stream selector or a natural original-runtime route into the area-5 encounter, not
title/menu input, DOS file enumeration, journal answering, QSV/current-record transfer,
opcode-watch plumbing, or combat-map alias filtering.

### 10.14 Area-5 Current-Record Transfer Probe

`tools/unicorn_dqk_trace.py` now supports
`--watch-current-record-write OFFSET[:LABEL]` plus `--watch-current-record-write-limit`. The hook reads
the canonical `[b20f:b211]` current-record pointer, reports CPU writes overlapping the selected record
offsets, and also reports INT 21h `AH=3Fh` file-read writes before the emulated read buffer is committed.

The 16M area-5 rerun in `build\dqk-area5-record-transfer-16m.log` used that hook for record offsets
`+0x13`, `+0x24`, `+0x25`, and `+0x26`; later area-58 selector traces add `+0x16`.
It proves that the loaded `SAVGAMA.QSV` bytes reach the active record:

- the file read writes `rec+13=0x05`, `rec+24=0x00`, `rec+25=0x00`, and `rec+26=0x00`;
- `qsv-state-reader-ca03` then reports `hdr@18=0x05`, `@21=0x04`, `@31=0x06`, `@33=0x01`,
  `@36=0x00`, `@37=0x00`, and `res@1024..1028=0x07,0x0d,0x00,0x00,0x00`;
- `qsv-post-load-ca03-gate` preserves `rec+13=0x05` and shows the active pose-like globals as
  `c9f0=0x07`, `c9f1=0x0d`, `c9f2=0x00`, with `ae67=0x0004`, `ae57=0x0002`, and `ca03=0xfef0`.

The same pass also corrects the `25a4:3756` route watch. Runtime segment `25a4` aliases multiple
overlays; when overlay 7 is resident, the accepted file offset is `DQK.EXE:0x047f06`, not overlay-6
`DQK.EXE:0x043b26`. The tracer now accepts both and labels the watch
`pose-step-or-resident-mode-loop-file-043b26-or-047f06`. The area-5 hit is the overlay-7 mode loop with
`ae57=0x0004`, not the overlay-6 pose-step body.

This narrows the failure: the generated area-5 loaded-save fixture is no longer suspect at the QSV
copy/current-record layer. The original-runtime route still reaches only the Palanthas/menu `[ca03]`
row at `b7f9=0x82d0`, then waits for `gate-b7f9:0x91cf` later. Later selector traces correct the
meaning of `@21`: it is copied to current-record `+0x16`, becomes `[ae63]`, and is passed as the
`ECL1` member selector. A positive DQK combat proof still needs a real top-level `0x24` dispatch or
accepted byte-validated `[bedb]+9` combat-map snapshot.

### 10.15 Area-58 Descriptor-162 Staged Resume Negative

The next staged-save probe used the stronger local-GEO service gate in area 58. Static inspection shows
area 58 `0x9967` is header-CFG reachable through descriptor 162 at cell `(17,15)`, but the script clears
monsters before `COMBAT`, so it is useful as an opcode/handler route target rather than a non-empty
encounter proof.

The fixture `build\dqk-area58-desc162-save-trace` patches both `SAVGAMA.QSV` copies to area 58,
header position `17,15`, flat pose bytes `17,15,3`, mode `ae67=4`, current mode `ae57=2`, and
`ca03/ca05=fef0`, but leaves `@21=0x04`; that now means "load ECL member 4". The 22M-instruction trace wrote:

```text
log:      build\dqk-area58-desc162-runtime.log
ca03 csv: build\dqk-ca03-watch-area58-desc162.csv
map csv:  build\dqk-bedb9-area58-desc162.csv
```

The transfer layer is again proven:

- `SAVGAMA.QSV` read writes `rec+13=0x3a`, `rec+25=0x11`, and `rec+26=0x0f`;
- the QSV reader reports `hdr@18=0x3a`, `@36=0x11`, `@37=0x0f`, and
  `res@1024..1028=0x11,0x0f,0x03,0x00,0x00`;
- the post-load gate preserves `c9f0=0x11`, `c9f1=0x0f`, `c9f2=0x03`, with `ca03=0xfef0`;
- the overlay-7 mode loop alias `25a4:3756` / `DQK.EXE:0x047f06` fires with `ae57=0x0004`.

The combat result is still negative: no `ECL-OPCODE opcode=0x24`, no byte-validated Dung/Wild setup or
7x7 render watch, and `build\dqk-bedb9-area58-desc162.csv` is header-only. This makes the current
blocker stronger: save-load QSV/current-record bytes are correct for area 5 and area 58, but original
`DQK.EXE` is still not applying that state to the active map/ECL stream in the way the generated
fixtures assume.

The later mode-selection follow-up uses the same fixture with corrected byte-validated save-transfer
watches:

```text
log:      build\dqk-area58-mode-selection-15m-r2.log
ca03 csv: build\dqk-ca03-watch-area58-mode-selection-15m-r2.csv
```

That run proves the QSV layer still transfers the area-58 state:

```text
qsv-state-reader-ca03 ... hdr@18=0x3a @36=0x11 @37=0x0f
  res@1024..1028=0x11,0x0f,0x03,0x00,0x00 ae67=0x0004 ae57=0x0002
qsv-post-load-ca03-gate ... rec+13=0x3a +25=0x11 +26=0x0f
  c9f0=0x11 c9f1=0x0f c9f2=0x03 ca03=0xfef0 ca05=0xfef0
```

It then identifies the resident mode/ECL override:

- `2177:319d` / `DQK.EXE:0x0362fd` (`post-qsv-mode-current-clear`) executes while
  `ae57=0x0002`.
- `25a4:3722` / live `389c:07a2` / `DQK.EXE:0x047ed2` (`overlay7-mode4-set`) runs before
  the known overlay-7 mode loop at `25a4:3756` / live `389c:07d6`, where `ae57=0x0004`.
- `25a4:0024` executes the byte-validated `b7f9=0x8000` reset body
  (`DQK.EXE:0x038075`, `0x03825a`, or `0x0402e4`).
- The next `[ca03]` write occurs at `b7f9=0x82d0`, `stream=0x5b6e:0x8000`,
  `op1=0xba`, `op2=0x07`, not at area 58's static `0x9967` target.

The `25a4:3722` watch fixes an earlier canonical-address mistake: the desired live
instruction is `389c:07a2`, but DQK's reused runtime segment means the tracer must watch
canonical `25a4:3722`, not `25a4:07a2`. With that correction, the next gap is no longer
"does QSV copy area/pose/mode"; it is the post-load selector that chooses the active
area/ECL stream after the resident mode path rebuilds state.

### 10.16 Area-58 Selector Trace and Confirmed ECL Member Loader

`build\dqk-area58-selector-15m.log` adds stream-pointer DGROUP watches and explicit
resource/mode helper watches to the same staged area-58 fixture. It confirms that the
active ECL stream never changes away from the startup buffer before the first CA03 row:

```text
35de:0074 -> [ae5e] = 0x5b6e
35de:0078 -> [ae5c] = 0x0000
35de:0083 -> [ae5c] = 0x8000
```

The trace then stays on `stream=0x5b6e:0x8000` through the later Palanthas/menu CA03 row
at `b7f9=0x82d0`. The stack probe on `09a4:01dc` shows the post-clear HLIB open is
`gen`, not a target area script, and the post-reset HLIB open is `PICB1` with
`a627=0x0096`. The `10b2:02d3` watch is absent for this route; the mode rebuild uses
`10b2:00e4`.

The loaded-save ECL member selector chain is now confirmed:

```text
DQK.EXE:0x032ded / canonical 1f4e:1ebd
  computes [ae63] from current-record +0x16, else 4/7
  calls 1d99:137d
  calls 1d99:1373

DQK.EXE:0x0403d8 (overlay 6; loaded-save trace canonical 25a4:0118)
  reads [ae5e:ae5c]
  adds 0x8000 to the offset
  pushes the caller's member id
  calls 1fc4:0130 with DS:773e ("ECL1" at DQK.EXE:0x06b15e)
```

`tools\disasm_dqk.py --lcallers` reports a single callsite for `1d99:137d`
(`DQK.EXE:0x032e70`) and a single callsite for `1d99:1373` (`DQK.EXE:0x032e76`), while
`1d99:13b9` has the separate QSV/resource-loader callsites `0x035cb6` and `0x0420e1`.
The follow-up run `build\dqk-area58-selector-ecl-loader-0118-15m.log` corrects the runtime
offset: this loaded-save path reads file `0x0402c0` into live `35a4:0000`, so
`DQK.EXE:0x0403d8` is live `35a4:0118` / canonical `25a4:0118`, not `25a4:0008`.
It reaches `1d99:137d` with `[ae63]=0x04`, current-record `+0x16=0x04`,
`+0x22=0x01`, `+0x24=0x00`, and `stream=5b6e:8000`, then jumps to `35a4:0118` and
calls `1fc4:0130`. It later reaches `1d99:1373`, jumps to live `35a4:0001`, and runs
the known `b7f9=0x8000` reset body at `35a4:0024`. The stream remains `5b6e:8000`, so
this route selects member `4` in the current stream context instead of retargeting to
area 58.

The paired patched fixture `build\dqk-area58-desc162-eclmember58-save-trace` changes both QSV copies at
`@21` from `0x04` to `0x3a`. Its trace `build\dqk-area58-eclmember58-ecl-loader-0118-15m.log` reaches
the same chain with `rec+16=0x3a`, `[ae63]=0x3a`, and `cx=0x003a` at `1d99:1373`, and writes zero CA03
rows before the 15M cap. A positive area-58 proof still needs a real top-level `0x24` opcode or
byte-validated combat-map setup hit after this member selection.

### 10.17 Area-58 Correct-Member Initial-Entry Negative

Two follow-up original-runtime traces used the corrected
`build\dqk-area58-desc162-eclmember58-save-trace` fixture, where both root and
`SAVE\SAVGAMA.QSV` carry `@18=0x3a` and `@21=0x3a`:

```text
build\dqk-area58-eclmember58-route30m.log
build\dqk-ca03-watch-area58-eclmember58-route30m.csv
build\dqk-bedb9-area58-eclmember58-route30m.csv

build\dqk-area58-eclmember58-postkeys26m.log
build\dqk-ca03-watch-area58-eclmember58-postkeys26m.csv
build\dqk-bedb9-area58-eclmember58-postkeys26m.csv
```

The 30M run confirms the corrected selector path but still writes zero CA03 rows and zero
accepted combat-map dump rows. The key member-load evidence is:

```text
1d99:137d: rec+16=0x3a, [ae63]=0x3a, stream=5b6e:8000
25a4:0118: ECL1 loader entered from the loaded-save route
1d99:1373: cx=0x003a, [ae63]=0x3a
```

Static inspection of the actual loaded member explains why this still does not reach area
58's descriptor-162 `COMBAT` target. `tools\dqk_ecl_combat_scan.py --inspect-area 58
--inspect-vaddr 0x8014 --inspect-context 48` decodes the member entry as:

```text
8014h  COMPARE #58, 0x0016
801ah  IF_EQ
801bh  EXIT
801ch  SAVE #1, 0x0097
...
9967h  COMBAT        ; descriptor-162 service-cell target, not initial entry
```

With the resumed current record, `mem[0x0016] == 0x3a`, so original DQK follows the
`IF_EQ` branch and exits the member's initial entry at `0x801b`. Runtime agrees: the
trace advances to `b7f9=0x801c`, `b1c7=0x00`, and then idles in the exploration/display
input loop. This is not a longer-timeout problem; the loaded-save initial-entry route is
not the cell descriptor route.

The second run queued post-journal exploration inputs (`s`, Enter, yes/no, arrows) after
the same corrected member selection. It consumed all fake keys (`31/31`) but still produced
zero `ECL-OPCODE opcode=0x24`, zero CA03 rows, and zero accepted combat-map rows. Therefore
the remaining original-runtime blocker is now narrower: find the DQK input/movement path
that invokes `SearchLocation`/descriptor 162 from the loaded area, or build a staged fixture
that starts one step before the service cell and lets original movement enter `(17,15)`.

2026-07-13 adjacent-fixture follow-up: `patchDqkSaveResumeArea()` now supports staged
`position` and raw DQK `facing`, and `tools/build-dqk-dir.mts` exposes that as
`--save-ecl-member`, `--save-x`, `--save-y`, and `--save-facing`. The helper writes both
known save mirrors: header/current-record `@36/@37` and flat active-pose
`@1024/@1025/@1026`. This replaces the earlier ad hoc hex-patch recipe for one-step-before
runtime probes.

The first copied adjacent probe,
`build\dqk-area58-desc162-adjacent-west-save-trace`, staged area/member `0x3a`, position
`(16,15)`, and facing east (`@1026=1`) in both root and `SAVE\SAVGAMA.QSV`. The long run
`build\dqk-area58-adjwest-up34m.log` is **not** a SearchLocation negative: it only consumed
`2/18` fake keys, did not open `SAVE\SavGamA.qsv`, wrote zero CA03 rows, and wrote zero
accepted combat-map rows. Later pose/script activity in that log (`rec+16=0x37`,
`rec+13=0x1a`, `c9f0/c9f1/c9f2` changing under `b7f9≈0x86ee..0x8702`) belongs to the
wrong title/demo route, not the staged saved-game route. The next adjacent-cell probe must
reuse the known-good save-load/key-gate sequence from
`build\dqk-area58-eclmember58-postkeys26m.log` before treating movement-key results as
evidence about descriptor 162.

Follow-up adjacent run `build\dqk-area58-adjwest-fastkeys24m.log` fixes that route-control problem by
arming the title and party-menu gates early and shortening fake-key gaps. It reaches the saved-game
route, opens `SAVE\SavGamA.qsv`, and proves the staged adjacent pose bytes are copied by the original
runtime:

```text
INT21/3D open b'SAVE\\SavGamA.qsv' -> handle 25
CURRENT-RECORD-WRITE ... SAVGAMA.QSV@0x0
  rec-area=3a ... rec-ecl-member=3a ... rec-x=10 0f 03 ... rec-y=0f 03 ...
DGROUP-WRITE ... SAVGAMA.QSV@0x400
  pose-x=10 0f 01 00 00, pose-y=0f 01 00 00, pose-facing=01 00 00
qsv-state-reader-ca03 ... hdr@18=0x3a @21=0x3a @36=0x10 @37=0x0f
  res@1024..1028=0x10,0x0f,0x01,0x00,0x00
post-load-ecl-pc-reset ... rec+13:0x3a +25:0x10 +26:0x0f
  c9f0:0x10 c9f1:0x0f c9f2:0x01
```

The same run also consumes the post-journal `up` key at instruction `14849408`:

```text
KEY int16-read key=0x4800 ascii=0x00 ... idx=20/20
```

The result is still negative for original DQK combat handoff: the run writes zero
`ECL-OPCODE opcode=0x24` rows, zero CA03 CSV rows, and zero accepted combat-map dump rows. The ECL trace
again executes the member-initial-entry branch at `8014h -> 801ah -> 801bh`, where `COMPARE #58,
0x0016` and `IF_EQ` exit because the loaded record already has area `0x3a`. Therefore this is a
stronger adjacent-input negative than `up34m`, but it is not yet proof that descriptor 162's
`SearchLocation` target is unreachable. The `up` key is being handled by the active post-load UI/input
loop, yet the route still does not call the descriptor-cell `SearchLocation` script. The next probe
should instrument the DQK movement/SearchLocation dispatcher itself: watch the code that reads the live
cell descriptor (`[0x002d]`), facing (`[0x0011]`), and area/state (`[0x001b]`), plus writes to those
bytes after the `0x4800` input, so the failure can be separated into "movement did not enter
`(17,15)`", "descriptor was not `0xa2`", or "SearchLocation dispatch was not invoked".

Follow-up cell-watch run `build\dqk-area58-adjwest-cellwatch24m.log` adds write watches for those live
bytes:

```text
--watch-dgroup-write 0x0011:facing-byte
--watch-dgroup-write 0x001b:area-byte
--watch-dgroup-write 0x002d:cell-desc
```

The only `facing-byte` / `area-byte` / `cell-desc` write in the whole 24M run is the early resident
bulk load from `DQK.EXE@0x63a20` at instruction `680`. There are no later watched writes to those bytes
after QSV load, after the member-initial-entry `8014h..801bh` exit, or after the `up` key is consumed.
The same run again confirms staged pose transfer (`rec+13=0x3a`, `rec+16=0x3a`, `rec+25=0x10`,
`rec+26=0x0f`, `c9f0=0x10`, `c9f1=0x0f`, `c9f2=0x01`), consumes all fake keys (`20/20`), writes zero
CA03 rows, writes zero accepted combat-map rows, and runs to the 24M instruction cap. This narrows the
next question: the current post-load input route accepts `0x4800`, but it does not mutate the watched
movement/SearchLocation state bytes. The next useful trace should find the post-load input handler that
receives `0x4800` and either map its branch table, or gate a movement key on the specific exploration
walker rather than on the generic post-journal input loop.

The tracer now has a matching DGROUP read-watch mode for that next probe:

```text
--watch-dgroup-read 0x0011:facing-byte
--watch-dgroup-read 0x001b:area-byte
--watch-dgroup-read 0x002d:cell-desc
--watch-dgroup-read-after 14800000
```

`--watch-dgroup-read-after` keeps the log focused on the post-load/post-journal window instead of
early resident setup. A short smoke run `build\dqk-readwatch-resident-smoke.log` confirms the new
`DGROUP-READ` logger records the reader CS:IP, instruction text, bytes, segment aliases, and the same
DQK state summary used by write watches. The next full adjacent-area run should combine these read
watches with the existing write watches; if `[0x002d]` is never read after `0x4800`, the key is still
outside the exploration walker, while a concrete reader gives the first branch-table/control-flow
anchor to trace forward into `SearchLocation`.

First full attempt `build\dqk-area58-adjwest-readwatch24m.log` is not a post-load movement negative.
It reaches the 24M instruction cap with no QSV route lines, no `0x4800` key-consumption line, no
post-`14800000` `DGROUP-READ` rows, and zero CA03 / combat-map rows. Treat it as a route-control
failure to rerun, not as evidence that the walker ignores `[0x0011]` / `[0x001b]` / `[0x002d]`.

The read hook is now armed lazily and range-limited to watched DGROUP clusters instead of globally
hooking every memory read. This matters: the global delayed hook preserved the route until
`14800000`, then stopped at an invalid fetch before the `up` key. The range-limited rerun
`build\dqk-area58-adjwest-rangedread17m.log` reproduces the good route again: QSV loads,
`post-load-ecl-pc-reset` fires at instruction `14571829`, the read hook arms at `14800000` over
`0x0422e9..0x042315`, `up` (`0x4800`) is consumed at `14849408`, all fake keys are consumed (`20/20`),
and the run reaches the 17M instruction cap with zero CA03 / combat-map rows. It records **zero**
`DGROUP-READ` rows for `[0x0011]`, `[0x001b]`, or `[0x002d]` after the hook arms.

`build\dqk-area58-adjwest-poseread17m.log` adds post-load read watches for the staged pose mirrors
`[0xc9f0]`, `[0xc9f1]`, and `[0xc9f2]` using two small read-hook ranges
(`0x0422e9..0x042315`, `0x04ecc8..0x04ecda`). It also reproduces the full route and consumes
`0x4800`, but still records **zero** `DGROUP-READ` rows. Therefore this post-journal input path is not
consulting the SearchLocation descriptor/facing/area bytes or the staged pose mirrors before 17M.

The next concrete post-key anchor is the form callback path immediately after `0x4800`:

```text
KEY int16-read key=0x4800 ... instr=14849408 stack=... 251e:00f8 ... 2c4c:005e ... 2102:00d1 ...
2102:00d1 -> 2c4c:0053 -> 251e:00dc -> 10d7:005c
2102:00e7 -> 2c4c:0002 -> 22b7:235f
2102:00f3 -> 2c4c:005f
217e:003b CALLF_IND [eff=0x04ed03] -> 2fe9:0006
2fe9:000c -> 1bdb:036c -> 251e:06cb
```

`0x04ed03` is canonical `DGROUP:ca23`, so the key is returning into a form/widget callback pointer,
not directly into the exploration walker. The next trace should watch or flow-trace `2102:00d1`,
`2102:00e7`, `217e:003b`, `DGROUP:ca23`, `2fe9:0006`, and `1bdb:036c` to identify which active form
owns the post-journal key and how to reach the real walker gate.

## Named non-EXE asset I/O tracing (2026-07-22)

`tools/unicorn_dqk_trace.py` now accepts an optional comma-separated
`--trace-asset-reads` list, for example `--trace-asset-reads ECL.GLB,GEO.GLB`. Names are matched
case-insensitively against the basename stored on each emulated DOS handle. Matching files get the
same position-aware diagnostics that were previously emitted only for DQK.EXE overlay I/O:

- `INT 21h/AH=3F` logs the asset name, handle, requested/returned byte count, exact file range,
  destination buffer, and instruction count.
- `INT 21h/AH=42` logs the seek mode/offset and old/new file positions.

The option is a research aid for correlating runtime consumers with exact GLB byte ranges. Omitting
it preserves the prior behavior exactly; no additional asset I/O is logged by default. This change
does not alter emulated reads, seeks, handles, or guest-visible DOS results.

## Area-5 member selector correction and form-loop result (2026-07-26)

The earlier Area-5 staged QSV was not a valid attempt at member 5: although byte `@18` selected
area 5, `@21` still selected ECL member 4.  A fresh, separately materialised fixture set **both**
copies of `SAVGAMA.QSV` (root and `SAVE/`) to `@18=@21=5`; its checked bytes are
`@36=@37=0`, `@1024=07`, `@1025=0d`, `@1026=00`.

That correction gets the Unicorn route beyond the journal answer, but it does **not** yet reach the
exploration walker or a combat handoff.  At about 17.6M guest instructions the run repeatedly
dispatches the same post-journal form callbacks:

```text
2102:00aa/00b3 -> 2c4c:004d/005f
2c4c:0053 -> 251e:00dc
```

It made no progress toward the area-5 combat gate, so the exact trace process was deliberately
stopped rather than allowed to spend the instruction budget in that loop.  This is not a negative
combat result and produces no accepted `[bedb]+9` combat-map dump.  It narrows the blocker: fixing
the ECL member selector alone is insufficient; the next trace must identify the active form's
transition/return path into the real exploration walker before any DQK map-population behavior is
modelled in the web engine.

### Post-journal opcode-zero form setup, with corrected overlay alias (2026-07-26)

The first callback watches used the return-address segment printed on the stack (`2102:*`) as
though it were the trace tool's load-relative canonical segment. That is not valid for this
reloaded overlay. The runtime code that actually executes after the journal is live `3033:0db9`;
with the `0x1000` load segment this must be watched as canonical `2033:0db9`. Likewise the
near-call target printed by Capstone as physical `0x304de` is live `3033:01ae`, therefore
canonical `2033:01ae` — it is not offset `04de`.

The corrected member-5 fixture was run with those watches in
`build/dqk-area5-member5-formflow-live3033-15m.log` and
`build/dqk-area5-member5-opcode0-handler-corrected-15m.log`. At instruction `14198308`:

```text
canonical 2033:01ae / live 3033:01ae
b1c7=00, stream=5b6e:8000, b7f9=0000, form=0009, widgets=14
```

The dispatch table has selected stream opcode `0`. Its handler clears `[ae64]`, sets `[acbe]`,
increments `[b7f9]` once, walks the far linked list rooted at `[b3cc:b3ce]` through
`1df9:03c1` using the list workspace at `DS:b41a`, then finishes with `[ae4e]=0x11`,
`[ae4d]=1`, `[bee0]=0` and returns to the generic stream/form loop at
`2033:0dbc -> 2033:1275`.

It does not read the staged map pose, invoke `SearchLocation`, emit `0x24`, or populate
`[bedb]+9`. This is a positive classification of the current loop, but **not** a combat-map
trace. The fixture is correctly loaded and the member selector is no longer the immediate failure.
The next capture must identify the nine-widget form's concrete choices and the selection that
leaves this opcode-zero setup/form path for the explorer; do not model combat background bytes from
this result.

### Original-DOS visual control: staged fixture hits `DISK READ ERROR` after journal (2026-07-26)

The corrected fixture was also exercised in a **single-owned**, focusless DOSBox-X/GameLink session:
`build/dqk-area5-member5-gamelink-visual/`. The route was direct and independently visible:

```text
SSI title -> PLAY -> LOAD SAVED GAME -> TDQK -> slot A -> BEGIN ADVENTURING
JOURNAL PAGE 10, word 4 after "SAVING THROWS" -> POISON
```

`POISON` was produced by `tools/dqk-protection-solve.mts` from the local journal/codes files and
accepted by the original program. The immediately following captured frame is the real game UI with
`DISK READ ERROR`; its GameLink PNG SHA-256 is
`88f6050e0e496f2c51ee219fd7fbdf13fb389b5dedd9a1dd137d584beb56b7ca`.

Therefore the staged fixture currently cannot provide a visual observation of the post-journal
nine-widget form/explorer state. This is a fixture/runtime I/O failure, not evidence about DQK combat
map bytes and not a reason to infer a web renderer change. The DOSBox-X process was terminated by its
specific owned PID after capture; no shared GameLink session remained running.

### Authentic DQK resume-block correction (2026-07-26)

The disk-error fixture differed from its retail base in only eight QSV bytes: area/member
`@18=@21=5`, plus `@1029`, `@1031`, and `@1033..1036`. A corpus scan found no authentic area-5
save, but multiple real nonzero-area DQK saves (area/member `4/4`) consistently contain:

```text
@1029=4  @1031=2  @1033=4  @1034=0  @1035=0  @1036=0
```

The prior `patchDqkSaveResumeArea()` emitted the older Gen1-shaped `@1033..1036 = F0 FE F0 FE`.
That exact pattern is present in the two retail-DQK Area-5 fixture attempts that display `DISK READ
ERROR` after a correct journal answer. The engine patcher and focused tests now emit the authentic
DQK shape instead. This is an evidence-backed fixture correction, not yet a complete visual proof:
the first GameLink attempt using the corrected bytes failed to launch the guest and was discarded.

A clean retry verified that the corrected-byte fixture reaches the DQK title screen, but selecting
`PLAY` makes the guest return to the DOS prompt before the party menu. The subsequent scripted keys
were therefore intentionally discarded as route evidence. This proves the resume-block shape alone is
not sufficient to synthesise a complete Area-5 save; it does not invalidate the observed byte shape or
justify restoring the Gen1 `F0 FE F0 FE` values.
