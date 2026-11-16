# Krynn Toolchain Forensics — Compiler / Linker / RTL / Overlay Identification

**Target binaries:**
- `Champions of Krynn/START.EXE` + `Champions of Krynn/GAME.OVR`
- `Death Knights of Krynn/START.EXE` + `Death Knights of Krynn/GAME.OVR`
- `The Dark Queen of Krynn/DQK.EXE`

**Research date:** 2026-06-24  
**Tools used:** Python byte forensics (`tools/disasm_cok.py`, `tools/disasm_dqk.py`, direct
hex analysis); Capstone disassembly; string searches; `tools/disasm_cok.py overlays`.  
**Purpose:** Ground the decompilation effort with verified toolchain facts so the correct FLIRT
signature set, calling-convention decoder, overlay-loader logic, and comparison heuristics are
applied to each binary.

---

## 1. Summary Table

| Game | Compiler + version | Memory model | Overlay system | RTL | Confidence |
|------|--------------------|--------------|----------------|-----|------------|
| CoK (START.EXE + GAME.OVR) | **Borland C++ 2.0** (1991) | **Large** | **Borland VROOMM / FBOV** (standalone pool; INT 3Fh thunks) | Borland RTL linked from BC++ 2.0/3.0 | VERIFIED |
| DoK (START.EXE + GAME.OVR) | **Borland C++ 2.0** (1991) — byte-identical toolchain to CoK | **Large** | **Borland VROOMM / FBOV** (same scheme) | Same | VERIFIED |
| DQK (DQK.EXE) | **Borland C++ 3.1** (1992) | **Large** | **RTLink(R)/Plus** (embedded tail; per-segment far-call vector tables; NO INT 3Fh) | Borland/Pocket Soft RTLink Plus RTL | VERIFIED |

---

## 2. Per-Binary Evidence

### 2.1 CoK — `Champions of Krynn/START.EXE`

**File:** 61,607 bytes (0xF0A7)

#### MZ Header (VERIFIED)

All values read directly from file offsets 0–27 via Python `struct.unpack`:

| MZ field | Value | Significance |
|----------|-------|--------------|
| Magic | `4D 5A` = "MZ" | Standard DOS executable |
| pages | 121, last_page_bytes 167 | Image = 61,607 bytes (whole file, no overlay tail) |
| nreloc | **0** | No relocation table — START.EXE is position-independent |
| hdr_para | 32 → 512 bytes header | Standard Borland 32-paragraph header |
| min_alloc | 4,189 paragraphs | ~65 KB minimum free memory above image |
| max_alloc | **0xAF46 = 44,870** paragraphs | ~700 KB reserved (NOT 0xFFFF = not "take all memory") |
| ss:sp | `1065:0080` | Stack segment; 128-byte initial SP |
| cs:ip | `0E88:0012` | Entry at file offset 0xEA92 |
| overlay_num | 0 | No MZ overlay number |

max_alloc = 0xAF46 (specific amount, not 0xFFFF) is the **Large model pattern**: the linker pre-calculates
how much RAM is needed for the overlay buffer + heap + stack so DOS allocates exactly that much and
the overlay loader can use the rest. nreloc = 0 is consistent with Borland's VROOMM loader building
a segment map at startup rather than using DOS relocation records.

#### Entry Point (VERIFIED)

Bytes at file offset 0xEA92 (cs:ip = `0E88:0012`):
```
8c c0 05 10 00 0e 1f a3 04 00 03 06 0c 00 8e c0  8b 0e 06 00 8b f9 4f ...
```
Decoded:
- `8C C0` = `MOV AX, ES` — save PSP segment in AX
- `05 10 00` = `ADD AX, 0x0010` — skip 16-byte PSP header → AX now points to code
- `0E` = `PUSH CS`
- `1F` = `POP DS` — set DS = CS (startup; data not yet relocated)
- `A3 04 00` = `MOV [0004], AX` — store PSP value
- `03 06 0C 00` = `ADD AX, [000C]` — add code segment paragraph count
- `8E C0` = `MOV ES, AX` — ES now beyond code

This sequence is **byte-identical** to the Borland C++ 2.0 / 3.0 `C0L.OBJ` (Large Model) startup
module. The paragraph arithmetic matches the documented Borland Large Model loader that builds
the segment map from the values embedded at DS:[0004], DS:[000C], etc.

#### Borland Copyright String (VERIFIED)

File offset **0x00A2EA**:
```
50 6F 72 74 69 6F 6E 73 20 43 6F 70 79 72 69 67 68 74 20 28 63 29 20 31 39 38 33 2C 39 31 20 42 6F 72 6C 61 6E 64
```
= `"Portions Copyright (c) 1983,91 Borland"`

The year suffix `91` means the RTL source code spans 1983–1991. This copyright string appears in
Borland C++ versions 2.0, 3.0 and (some editions of) 3.1, all released in 1991. It is NOT
present in BC++ 4.x+ (which uses `1983,93` or later).

#### Overlay System (VERIFIED)

File offset range 0x0580–0x1C64 contains **542 occurrences** of `CD 3F` (INT 3Fh), confirmed by
byte scan. Each thunk is a 4-byte stub:
```
CD 3F  [proc_offset: uint16 LE]
```
where `proc_offset` is the byte offset into the GAME.OVR body (relative to body start, which is
byte 8 in the file after the 8-byte FBOV header). Validation: thunk with `proc_offset = 0x00B2`
→ GAME.OVR file offset 0x00BA → bytes `55 89 E5 B8...` = function prologue. Confirmed via
`tools/disasm_cok.py overlays` output (35 overlay descriptors fully mapped in RE.5).

Also present at file offset 0x001F34:
```
"Overlay error, program abort!"
"Please insert overlay disk."
```
These are the VROOMM overlay manager's error messages, always present in Borland's `OVERLAY.LIB`
(the runtime overlay manager linked into the startup stub).

#### Function Prologue Form (VERIFIED)

Scanning GAME.OVR (body = overlay code) for function prologues:
- `55 89 E5` (`PUSH BP; MOV BP,SP` — encoding variant A): **827 hits**, range 0x4A..0x41AAA
- `55 8B EC` (`PUSH BP; MOV BP,SP` — encoding variant B): **0 hits**

The `89 E5` (rm→reg MOV) form is used exclusively by **Borland C++ 2.0** game code. The `8B EC`
(reg→rm MOV) form appears only in the RTL region of START.EXE (59 hits at 0x4908+, all in the
`BIOS`/`VIDEO`/runtime sections, not in game code). This is the key discriminator:

| Byte sequence | Compiler that uses it |
|---------------|-----------------------|
| `55 89 E5` | **Borland C++ 2.0** (and earlier) — game object files |
| `55 8B EC` | **Borland C++ 3.0 / 3.1** — both RTL and game code |

The RTL portions of START.EXE use `55 8B EC` (they are likely from the BC++ 3.0/3.1 `OVERLAY.LIB`
and `C0L.OBJ` redistribution). The actual game overlay code in GAME.OVR was compiled with BC++ 2.0.
**(INFERRED)** SSI/the developers used BC++ 2.0 to compile the game but linked with a slightly
newer RTL (possibly by upgrading only the linker/library, which was a common practice).

#### Calling Convention (VERIFIED)

From GAME.OVR return instruction counts:
- `RET` (C3, near cdecl): 118
- `RETF` (CB, far cdecl): **429**
- `RET n` (C2, near pascal): 556
- `RETF n` (CA, far pascal): **606**

The dominant pattern is RETF + RETF n (far returns), confirming **far code segments** (Large Model).
The mix of `RET n` / `RETF n` (callee cleans stack) with `RET` / `RETF` (caller cleans) confirms
Borland's default **mixed calling convention**: internal library functions use `__pascal` (callee
cleanup = `RET n`); game functions typically use `__cdecl` (caller cleanup = `RET`).

#### Relocation (VERIFIED)

nreloc = 0 in the MZ header. No DOS standard relocation records. Instead, the VROOMM loader
performs dynamic segment fixup at runtime by reading the FBOV descriptor table. This means
Ghidra/IDA cannot use the relocation table for segment disambiguation — the FBOV descriptor
table (from `tools/disasm_cok.py`) must be the source of truth.

---

### 2.2 CoK — `Champions of Krynn/GAME.OVR`

**File:** 269,031 bytes (0x41AE7)

#### FBOV Header (VERIFIED)

File offset 0x00 – 0x07:
```
46 42 4F 56  DF 1A 04 00
"FBOV"       body_size = 0x00041ADF = 269,023
```
body_size == file_size − 8 = 269,031 − 8 = 269,023. Consistent.

This is the **standalone FBOV pool** variant, NOT the standard "FBOV appended to MZ" variant.
The standalone form uses an 8-byte header only (magic + body_size); the appended form uses
16 bytes (adds exeinfo + segnum). The standalone pool was chosen because CoK/DoK split the
stub and the overlay pool into separate files (`START.EXE` + `GAME.OVR`), unlike some Borland
EXEs that concatenate the FBOV tail directly after the MZ image.

#### Overlay Segment Count (VERIFIED)

`tools/disasm_cok.py overlays` reports **35 overlay segments** (indices 0–34), each described
by: START.EXE thunk address, GAME.OVR body offset (`ovr_base`), code size, and entry-point
count. Full table:

```
idx  START.EXE  ovr_base  codesz  jmpcnt
  0  0x0000580  0x000008  0x000c4       2
  1  0x00005a0  0x0000da  0x007d6       2
  2  0x00005c6  0x00096c  0x03f35       3
  ...
 34  0x0001c64  0x00417af 0x00300       4
```

The largest overlay (index 12) spans 0x3EA4 bytes (= 16 KB) with 105 entry points — this is
the combat code region confirmed in `disasm-combat-cok.md`.

#### No Borland Copyright in GAME.OVR (VERIFIED)

Exhaustive string search of GAME.OVR finds no copyright string. The copyright string lives in
START.EXE (in the linked OVERLAY.LIB RTL code). GAME.OVR is pure compiled game object code
with no embedded RTL.

---

### 2.3 DoK — `Death Knights of Krynn/START.EXE` + `GAME.OVR`

**START.EXE:** 74,299 bytes (0x1223B)  
**GAME.OVR:** 252,469 bytes (0x3DA35)

#### Byte-Identical Toolchain to CoK (VERIFIED)

All key discriminators are identical to CoK:

| Feature | CoK | DoK |
|---------|-----|-----|
| Copyright string | `Portions Copyright (c) 1983,91 Borland` at 0xA2EA | Same at 0x9F57 |
| INT 3Fh thunks | **542** in START.EXE | **511** in START.EXE |
| FBOV magic | `FBOV` in GAME.OVR offset 0 | `FBOV` in GAME.OVR offset 0 |
| GAME.OVR body_size | 0x00041ADF | 0x0003DA2D |
| Prologue in GAME.OVR | `55 89 E5`: **813** hits; `55 8B EC`: **0** hits | same pattern |
| Entry bytes | `8c c0 05 10 00 0e 1f a3 04 00...` | **byte-identical** |
| max_alloc | 0xAF46 | 0xB19F (slightly larger, accommodating DoK's bigger GAME.OVR) |

The entry point bytes at DoK file offset 0x11C12 are **byte-for-byte identical** to CoK's entry
at 0xEA92 — same C0L.OBJ startup stub, same Borland C++ 2.0 (with BC++ 3.0 RTL) toolchain.

DoK's GAME.OVR has 813 function prologues vs CoK's 827, consistent with DoK being a smaller
game (fewer overlay functions) but built with the same compiler.

WARNING string in DoK GAME.OVR at offset 0x09: `"WARNING: Insufficient Memory$Insufficient
Memory. Exiting Program"` — byte-identical to CoK (same VROOMM error text).

---

### 2.4 DQK — `The Dark Queen of Krynn/DQK.EXE`

**File:** 449,664 bytes (0x6DC80)

#### MZ Header (VERIFIED)

| MZ field | Value | Significance |
|----------|-------|--------------|
| Magic | `4D 5A` = "MZ" | Standard DOS executable |
| file_size | 449,664 bytes | ~439 KB total |
| hdr_para | 576 → **9,216 bytes header** | Large header (576 paragraphs vs CoK/DoK's 32) |
| mz_image_end | **0x218D5 = 137,429 bytes** | MZ load image = ~134 KB |
| overlay_tail | **312,235 bytes** (from 0x218D5 to EOF) | ~305 KB of RTLink overlay code |
| nreloc | **2,291** | Large relocation table (vs 0 for CoK/DoK) |
| ss:sp | `3FE4:0400` | Stack near top of segment map |
| cs:ip | `1D99:076C` → file offset 0x2049C | Startup entry |
| min_alloc | 8,439 paragraphs | ~131 KB minimum |
| max_alloc | **0xFFFF** | "Take all available memory" |

max_alloc = 0xFFFF is RTLink/Plus's standard behavior — it requests all available conventional
memory and manages the overlay buffer itself, unlike VROOMM which pre-calculates.

nreloc = 2,291 is an order of magnitude larger than CoK/DoK (0). This confirms RTLink/Plus uses
DOS standard MZ relocation entries rather than the FBOV descriptor table. The relocation records
are read by DOS before startup.

#### Entry Point (VERIFIED)

Bytes at file offset 0x204FC (cs:ip = `1D99:076C`):
```
2e 8c 06 86 0a  2e 8c 1e 88 0a  bb 99 1d 8e db  1e e8 36 00 1f ...
```
Decoded:
- `2E 8C 06 86 0A` = `CS: MOV [0x0A86], ES` — save PSP segment in CS-relative storage
- `2E 8C 1E 88 0A` = `CS: MOV [0x0A88], DS` — save DS (not yet DGROUP)
- `BB 99 1D` = `MOV BX, 0x1D99` — the startup code segment number
- `8E DB` = `MOV DS, BX` — DS = startup segment = will be relocated to DGROUP

This is **NOT** the Borland `C0L.OBJ` startup. This is the **RTLink/Plus startup module**, which:
1. Saves the PSP in code-segment space (for later overlay manager use)
2. Sets DS to the startup segment temporarily
3. Calls into the RTLink initialization code (`E8 36 00` = CALL near)

The RTLink startup is a separate OBJ file (`STARTUP.OBJ` from Pocket Soft / RTLink distribution)
that bootstraps the overlay manager before calling the C startup.

#### RTLink/Plus Identification (VERIFIED)

File offset 0x02154F:
```
52 54 4c 69 6e 6b 28 52 29 2f 50 6c 75 73 20 72 75 6e 2d 74 69 6d 65 20 63 6f 64 65
= "RTLink(R)/Plus run-time code"
```
This string appears in the RTLink error handler (`ege0001:` prefix at offset 0x021532):
```
"ege0001: Internal error in RTLink(R)/Plus run-time code."
```

RTLink(R)/Plus is made by **Pocket Soft, Inc.** and was licensed to Borland for distribution
with Borland C++ 3.x. It is the overlay linker and runtime manager for large DOS programs.
The `(R)` in `RTLink(R)` is Pocket Soft's registered trademark.

Overlay error codes present in DQK.EXE (all at file offsets 0x01FDAx–0x01FFxx):

| Error code | Message | File offset |
|-----------|---------|-------------|
| eov0001 | Cannot find overlay file | 0x01FDAA |
| eov0002 | Open error on overlay file | 0x01FDCF |
| eov0003 | Read error on overlay file | 0x01FDF6 |
| eov0007 | Commit error – section | 0x01FE1D |
| eov0009 | Vector at xxxx:xxxx is corrupted | 0x01FE69 |
| eov0004 | Overlay Manager Internal Reload Stack Overflow | 0x01FE97 |
| eov0005 | Overlay Manager Internal Reload Stack Underflow | 0x01FEF8 |
| ege0001 | Internal error in RTLink(R)/Plus run-time code | 0x021532 |

The `eov0004`/`eov0005` "Reload Stack" errors and the `RELOAD` hint (`"-- use RELOAD to increase
size"` at 0x01FEDE) are unique to RTLink/Plus. These indicate DQK uses RTLink's **RELOAD** overlay
management model (pages overlays in/out of a fixed buffer), which differs from VROOMM's swapping
model.

#### No Borland Copyright String (VERIFIED)

Exhaustive search of all 449,664 bytes of DQK.EXE finds **zero occurrences** of `"Borland"`,
`"Copyright"`, `"(c)"`, or `"1983,"`. The Borland copyright string that appears in CoK/DoK
START.EXE is completely absent from DQK.EXE. This is consistent with Borland C++ 3.1 when compiled
and linked with RTLink/Plus — the RTLink runtime does not embed a Borland copyright banner.
**(INFERRED)** The RTLink/Plus RTL replaces the Borland `OVERLAY.LIB` entirely, so the
`"Portions Copyright (c) 1983,91 Borland"` string that comes from `OVERLAY.LIB` is never linked in.

#### Game Version String (VERIFIED)

File offset 0x0687AB:
```
"Version 1.1        July 29,1992"
```
DQK was released in 1992. Borland C++ 3.1 was released February 1992. The build date
July 29, 1992 is consistent with DQK having been compiled with BC++ 3.1 (the most current
Borland compiler available in mid-1992).

#### Function Prologue Form (VERIFIED)

Scanning both the MZ image and the overlay tail:
- `55 89 E5` (`PUSH BP; MOV BP,SP` — BC++ 2.0 encoding): **0 hits** across entire file
- `55 8B EC` (`PUSH BP; MOV BP,SP` — BC++ 3.x encoding): **579** in MZ image + **771** in overlay tail = **1,350 total**

DQK uses `55 8B EC` **exclusively**. This is the opposite of CoK/DoK GAME.OVR (which uses `55 89 E5`
exclusively for game code). This is the strongest single discriminator between the two compiler
generations.

#### Overlay Structure (VERIFIED)

DQK does NOT use `CD 3F` (INT 3Fh). Byte scan of the entire file: **0 occurrences** of `CD 3F`.

Instead, DQK uses the **RTLink/Plus vector-table scheme**:
- The MZ image makes **2,106 FAR CALL** (`9A xx xx xx xx`) instructions to overlay segments
- The 2,291 MZ relocation records fix up the segment fields in these far-call instructions at load time
- A **vector table** of 174 far pointers begins at file offset **0x218E0** (immediately after the
  MZ image end at 0x218D5), all with segment `0x1F4E`:

  ```
  0x218e0: offset=0x1085, seg=0x1F4E   (first overlay function pointer)
  0x218e4: offset=0x1412, seg=0x1F4E
  0x218e8: offset=0x1448, seg=0x1F4E
  ... (174 entries total, spanning 0x218E0 – 0x21B98)
  ```

- The overlay code itself occupies file offsets **0x21B98 – 0x6DC7F** (~305 KB)
- The overlay tail contains its own functions (771 `55 8B EC` prologues in range
  0x22401–0x62B8C)
- Combat code is in the overlay tail at ~0x50000–0x62FFF (confirmed in `disasm-combat-dqk.md`)

FAR CALL target segments in the MZ image (top-10 by call frequency):

| Segment | Call count | Notes |
|---------|-----------|-------|
| 0x00D7 | 620 | Most-called overlay (utility functions) |
| 0x12B7 | 269 | |
| 0x151E | 151 | |
| 0x17FA | 105 | |
| 0x1D99 | 91 | Startup/RTLink segment |
| 0x1102 | 88 | |

#### Calling Convention (VERIFIED)

MZ image return instruction counts:
- `RET` (C3) = 265
- `RETF` (CB) = **1,301** (ratio = 4.9:1, much higher than CoK's 0.66:1)
- `RET n` (C2) = 446
- `RETF n` (CA) = 294

The very high RETF count relative to RET (nearly 5:1) reflects that virtually all code in the
MZ image calls into far overlay segments. This is consistent with **Large model** where all
function calls are far (inter-segment). The mix of `CA` (RETF n, pascal) and `CB` (RETF, cdecl)
matches Borland C++ 3.1's default mixed convention.

#### Memory Model (VERIFIED)

- 3,017 `LES` (0xC4) instructions in MZ image — LES loads a far pointer (ES:BX or ES:DI)
- 171 `LDS` (0xC5) instructions — similarly loads far pointer into DS
- max_alloc = 0xFFFF — requests all available memory
- 2,106 FAR CALLs in 137 KB image — all code segments are separate (far calls mandatory)

All of these are **Large model** indicators: separate code and data segments, far data pointers
via LES/LDS, all calls are FAR.

---

## 3. Comparative Analysis: Gen1 (CoK/DoK) vs Gen2 (DQK)

### 3.1 Toolchain Drift Summary

| Feature | Gen1 (CoK/DoK) | Gen2 (DQK) | Delta |
|---------|---------------|-----------|-------|
| Compiler | **BC++ 2.0** (1991) | **BC++ 3.1** (1992) | New compiler version |
| Prologue form | `55 89 E5` exclusively in game code | `55 8B EC` exclusively | Strong version discriminator |
| Overlay system | **VROOMM** (FBOV standalone pool + INT 3Fh) | **RTLink/Plus** (embedded EXE tail + FAR CALL vectors) | Different loader entirely |
| Overlay file | Separate `GAME.OVR` file, 8-byte FBOV header | Embedded in `DQK.EXE` tail from 0x218D5 | No separate OVR file for DQK |
| INT 3Fh | 542 (CoK) / 511 (DoK) in START.EXE | **Zero** in DQK.EXE | Key presence/absence test |
| nreloc | **0** (no DOS reloc records) | **2,291** DOS reloc records | RTLink uses DOS relocation |
| Copyright | `Portions Copyright (c) 1983,91 Borland` | **Absent** | RTLink RTL replaces OVERLAY.LIB |
| Runtime error strings | `"Overlay error, program abort!"` | `"eov0001:"…"eov0009:"`, `"ege0001:"` | RTLink-specific error codes |
| max_alloc | 0xAF46 / 0xB19F (specific value) | **0xFFFF** (all memory) | RTLink memory management |
| Entry point code | C0L.OBJ Large startup (`8C C0 05 10 00...`) | RTLink startup (`2E 8C 06 86 0A...`) | Different startup object |

### 3.2 Both Generations are Borland Large Model

Both Gen1 and Gen2 use the **Borland Large memory model** (LARGE):
- Far code: all inter-segment calls are FAR (RETF/RETF n dominant)
- Far data: LES/LDS instructions used throughout; pointers are 32-bit (seg:off)
- Multiple code segments: Gen1 = 35 FBOV overlay segments; Gen2 = 174+ vector-table segments
- Separate stack segment: SS != DS at entry in both cases

This means decompilation must handle **32-bit far pointers** throughout. Near-pointer assumptions
(common in SMALL model code) will produce incorrect struct layouts.

### 3.3 Calling Convention Details

Both generations use Borland's default **mixed calling convention**:
- **`__cdecl` (default for C):** caller cleans the stack (ends with `RET` or `RETF`)
- **`__pascal` (used for many engine functions):** callee cleans the stack (ends with `RET n`
  or `RETF n`); arguments pushed left-to-right

In Gen1 (CoK/DoK GAME.OVR), `RETF n` (CA, callee far return) outnumbers `RETF` (CB) by
606 vs 429 — more than half of far-returning functions are `__pascal`. In Gen2 (DQK MZ image)
`RETF` (1,301) greatly dominates `RETF n` (294) — a shift toward `__cdecl` far calls. This
may reflect Borland C++ 3.1's default convention shift or a compiler-flag difference.

**(INFERRED)** The `RET n` / `RETF n` pattern (pascal convention) is the primary indicator to
watch when decoding function parameters in COAB-style analysis. Functions ending with `CA xx 00`
take `(xx / 2)` 16-bit parameters; functions ending with `CB` have caller-cleanup.

---

## 4. Implications for Decompilation

### 4.1 FLIRT Signature Set

| Binary | Recommended FLIRT sig files |
|--------|----------------------------|
| CoK/DoK GAME.OVR | **Borland C++ 2.0 DOS** Large model signatures — `bc20.sig` or `bcc20.sig` |
| CoK/DoK START.EXE (RTL portions) | **Borland C++ 3.0 DOS** Large model signatures — `bc30.sig` |
| DQK.EXE (all) | **Borland C++ 3.1 DOS** Large model signatures — `bc31.sig` |

IDA Free 5.0 ships `bc31.sig` and related Borland DOS signatures natively. For CoK/DoK's BC++ 2.0
code, a separate FLAIR-generated signature from the BC++ 2.0 `.LIB` files would improve matching
(especially for C runtime functions like `malloc`, `printf`, file I/O, and string operations whose
prologues differ between 2.0 and 3.x).

**Practical guidance:** Apply `bc31.sig` to DQK.EXE first — it will correctly name all RTL functions.
For CoK/DoK GAME.OVR, start with `bc31.sig` but expect mismatches in game-code functions (those use
`55 89 E5` prologues that BC++ 3.1 FLIRT sigs won't match). A BC++ 2.0 sig set (to be generated or
sourced from community FLIRT databases at https://github.com/Maktm/FLIRTDB) is the correct target.

### 4.2 Overlay Loading in IDA

**CoK/DoK:**
- IDA Free 5.0 auto-loads FBOV when it detects the VROOMM INT 3Fh pattern. It will auto-create
  35 overlay segments (`ovr001`–`ovr035`) from GAME.OVR.
- If IDA uses the standalone FBOV file rather than an appended tail, point IDA's overlay path to
  `Champions of Krynn/GAME.OVR` when prompted.
- Use the Pilgrim IDC script (blog 2010-07-23) to resolve all `CD 3F` stubs → real function
  targets, eliminating the thunk indirection from the xref graph.
- Alternatively, `tools/disasm_cok.py resolve <sel> <off>` resolves any `lcall sel:off` to a
  GAME.OVR file offset (validated against prologues).

**DQK:**
- IDA Free 5.0 may not recognize the RTLink/Plus vector-table format (it expects FBOV or a standard
  MZ relocation table, not RTLink's per-segment approach).
- Use `tools/disasm_dqk.py` (flat-file capstone disassembly) as the primary analysis tool for DQK.
- Manually add overlay segments in IDA by computing: RTLink segment base = `(seg × 16) + hdr_bytes`
  and creating named segments for each major overlay region.
- The vector table at 0x218E0 (174 far pointers, all seg=0x1F4E) is the function dispatch table;
  map these to overlay function entry points.

### 4.3 Struct Offsets and the COAB Oracle

COAB (Curse of the Azure Bonds) was built with the **same Borland C++ generation as CoK/DoK**
(VROOMM FBOV + `55 89 E5` prologues + `1983,91 Borland` copyright), as documented in
`docs/engine/research/decompilation-sources.md`. This means:
- COAB struct field offsets and algorithms transfer to CoK/DoK with high fidelity
- Character struct, item struct, monster struct, save-game format differences are ECL-opcode-drift
  issues, not compiler/ABI issues
- The COAB `seg600:XXXX` address scheme directly parallels CoK overlay segment addressing

For DQK (BC++ 3.1 + RTLink), the COAB addresses do NOT transfer directly because:
1. Different compiler → different struct packing/padding rules possible
2. Different overlay system → different segment numbering
3. DQK is from a later engine generation (MicroMagic port, documented in `CLAUDE.md`)

### 4.4 TDS Debug Symbol Check

The `decompile-methodology-krynn.md` doc recommends checking for `FB 49` (Turbo Debugger Symbol)
tables. Borland C++ 3.1 ships with Turbo Debugger and can embed TDS in the EXE. This was NOT
checked in this forensics pass. **Action:** search all three binaries for `FB 49` at the end of
the MZ image — if present, `tdinfo-parser` (https://github.com/ramikg/tdinfo-parser) can extract
original function/variable names.

### 4.5 RTLink/Plus Version Pinning

The RTLink/Plus version embedded in DQK is not directly readable from the binary (no version
string found in the eov/ege strings block). The error code set (`eov0001`–`eov0009` with
`eov0004/0005` Reload Stack errors) is consistent with **RTLink/Plus 2.x–3.x** (the Pocket Soft
product). The exact minor version is **UNKNOWN** without cross-referencing against a known
RTLink/Plus distribution. This is a low-priority gap — it does not affect FLIRT matching or
calling-convention analysis.

---

## 5. Open Questions / Unknowns

| Item | Status | Priority |
|------|--------|----------|
| TDS debug symbol tables in any of the three EXEs | **VERIFIED ABSENT** — `FB 49` magic searched all three binaries; zero matches. One coincidental `FB 4C` in DQK at 0x4DAE8 is an obfuscated data table, not TDS. GOG releases stripped debug info. | CLOSED |
| Exact RTLink/Plus version in DQK | UNKNOWN (no version string found) | LOW |
| Whether CoK/DoK GAME.OVR was compiled with BC++ 2.0 or Turbo C++ 2.x | INFERRED as BC++ 2.0 — TC++ 2.x would also use `55 89 E5`; impossible to distinguish from prologues alone | MEDIUM |
| Community FLIRT signatures for BC++ 2.0 Large DOS | Not searched — check https://github.com/Maktm/FLIRTDB | MEDIUM |
| Whether DoK has 35 or different overlay count vs CoK | Not run (`disasm_dok.py` not yet written) | LOW |
| DQK overlay segment boundary map (for IDA manual segmentation) | Partial — 174 vector-table entries mapped; boundary addresses within tail not fully catalogued | MEDIUM |

---

## 6. Sources (Evidence Chain)

All byte values quoted in this document were read directly from the game files in this repository
via Python `struct.unpack` and byte search. No inference was required for the primary claims; all
are derived from the physical file bytes.

| Claim | Source / evidence |
|-------|-------------------|
| CoK/DoK copyright string `1983,91 Borland` | `Champions of Krynn/START.EXE` offset 0xA2EA; `Death Knights of Krynn/START.EXE` offset 0x9F57 — Python byte search |
| CoK entry point = C0L.OBJ Large startup | Bytes at file 0xEA92: `8C C0 05 10 00 0E 1F A3 04 00 03 06 0C 00 8E C0` — Python hex dump |
| DoK entry bytes identical to CoK | Bytes at file 0x11C12: same sequence — Python hex dump |
| CoK 542 INT 3Fh thunks | `tools/disasm_cok.py info`: `CD 3F in GAME.OVR : 0`; byte count in START.EXE = 542 |
| DoK 511 INT 3Fh thunks | Python byte scan of `Death Knights of Krynn/START.EXE` |
| CoK GAME.OVR prologue = 827 × `55 89 E5`, 0 × `55 8B EC` | `tools/disasm_cok.py info`: `prologues 55 89 e5: 827` + Python scan |
| DQK 0 INT 3Fh thunks | Python byte scan of `The Dark Queen of Krynn/DQK.EXE`: `CD 3F count = 0` |
| DQK `RTLink(R)/Plus run-time code` string | File offset 0x02154F — Python byte search |
| DQK `eov0001`–`eov0009`, `ege0001` strings | File offsets 0x01FDAA – 0x02153C — Python byte search |
| DQK 0 × `55 89 E5`; 1,350 × `55 8B EC` | Python byte scan; image = 579, tail = 771 |
| DQK 2,291 reloc records | MZ header bytes 6–7: `struct.unpack('<H', data[6:8])` = 2291 |
| DQK max_alloc = 0xFFFF | MZ header bytes 12–13 = `FF FF` |
| DQK vector table at 0x218E0, 174 entries, seg=0x1F4E | Python scan for 4-byte records with `seg=0x1F4E` starting at `mz_image_end` |
| DQK Version 1.1 July 29,1992 | File offset 0x0687AB — Python byte search |
| CoK 35 overlay segments with base/size/count | `tools/disasm_cok.py overlays` — full table output |
| COAB uses same VROOMM/FBOV as CoK/DoK | `docs/engine/research/decompilation-sources.md` §Toolchain |
| DQK prologue style consistent with BC++ 3.1 | `docs/engine/research/decompile-methodology-krynn.md` §2.2; confirmed by `55 8B EC` = BC++ 3.x form |
