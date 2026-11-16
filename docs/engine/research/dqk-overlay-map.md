# DQK.EXE Overlay Map — Borland FBOV Far-Call Variant

`The Dark Queen of Krynn/DQK.EXE` (449,664 bytes) uses Borland's **FBOV "far-call"**
overlay system (NOT the classic INT 3Fh `CD 3F` VROOMM variant used by CoK/DoK).
This document provides:

- The complete 13-entry overlay descriptor table with file offsets
- The stub-to-overlay dispatch mechanism
- The 4 protection-related stubs and their full trace
- Definitive answers to the two crucial protection questions
- Verified patch targets for EXE-bypass

All byte values verified directly from `DQK.EXE` (SHA: open game file).

---

## 1. MZ EXE Structure

| Field                | Value                                         |
|----------------------|-----------------------------------------------|
| File size            | 449,664 bytes (0x6DC80)                       |
| Header size (HDR)    | 0x2400 bytes (0x240 paragraphs)              |
| MZ image end         | 0x218D5 (~137 KB)                             |
| Overlay tail start   | 0x218E0 (paragraph-aligned)                   |
| Overlay tail size    | ~312 KB                                       |
| Entry CS:IP          | 0x1D99:0x076C (file 0x2040C)                 |
| SS:SP                | 0x3FE4:0x0400                                 |
| MZ reloc count       | 2,291 entries                                 |

The program image occupies file bytes `[HDR .. 0x218D5)`.
The overlay tail occupies `[0x218E0 .. EOF)`.

**No `CD 3F` bytes anywhere in the file** — this is not the INT 3Fh VROOMM scheme.

---

## 2. FBOV Far-Call Stub Format

Each overlay dispatch stub in the resident segment (0x1D99) is exactly **10 bytes**:

```
E8 disp16        CALL near OvrMgr   ; disp → OvrMgr at 1D99:0x058D (file 0x2031D)
EA off16 seg16   LJMP 0x????:off16  ; seg=link-time placeholder; off=overlay entry offset
XX 00            overlay_index, 00  ; trailing byte: 0-based descriptor index
```

The OvrMgr reads `overlay_index` from `[bp+2]+5` (byte 9 of the stub) to index the
descriptor table at `CS:0xC1F` (= file 0x209AF).  After loading, the OvrMgr patches
the LJMP's segment word with the actual loaded segment; the entry offset word is
**never modified** — it directly indexes the overlay's code buffer.

### Identifying the dispatch segment (0x2726 vs 0x25A4)

The **LJMP segment** in the stub (`0x2726` for protection stubs) is the Borland
**link-time virtual segment** for that sub-segment of the overlay.  The **descriptor
word[0]** (`0x25A4`) is the link-time base of the overlay's **first** sub-segment.

Because an overlay's combined code can span multiple Borland segments
(each < 64 KB), DQK's overlay 4 has six named sub-segments:

| Link-time seg | Offset from base | Sub-segment content                        |
|---------------|------------------|--------------------------------------------|
| `0x25A4`      | +0x0000          | file I/O helpers, init code                |
| `0x25CA`      | +0x0260          | (intermediate)                             |
| `0x25DE`      | +0x03A0          | (intermediate)                             |
| `0x264F`      | +0x0AB0          | (intermediate)                             |
| `0x26F8`      | +0x1540          | (intermediate)                             |
| `0x2726`      | +0x1820          | **protection functions** (IsProtSkip, DoProtCheck, and 2 others) |

---

## 3. Overlay Descriptor Table

Located at file **0x209AF** (resident segment 0x1D99, CS-relative offset 0x0C1F).
13 records, 18 bytes each.  Field layout (all little-endian 16-bit words):

| word | meaning                                                    |
|------|------------------------------------------------------------|
| [0]  | `runtime_seg` — link-time base segment of first sub-seg   |
| [1]  | `0x0DCB` — constant (OvrMgr segment, always same value)   |
| [2]  | `filepos_para` — absolute disk paragraph; `*16 = file offset of overlay blob` |
| [3]  | `0x0400` — initial scratch segment (constant)             |
| [4]  | `reloc_entry_count` — number of (offset,seg) fixup pairs  |
| [5]  | code size in paragraphs (approximately; actual = (next_ovr - this_ovr - prefix_sz)/16) |
| [6]  | link flags (`0xFFFF` or small integer)                    |
| [7]  | 1-based overlay index (ID)                                |
| [8]  | duplicate of [4]                                          |

### File-offset formula

```
overlay_file_offset = filepos_para * 16        (absolute, no HDR addition)
```

Verification: descriptor[0] `filepos_para = 0x218E` → `0x218E * 16 = 0x218E0` = overlay tail start.

### Fixup prefix

**Correction, 2026-10-02:** a first function prologue is not a reliable
code-base marker. Overlay 5's former `0x852` prefix placed its base at a
later prologue, `0x3a832`; the correct prefix is `0x4e0`, giving file base
`0x3a4c0`. Two CS-relative tables and the original program's GameLink RAM
agree. The creation callback is `25a4:220a` / file `0x3c6ca`.
See [the evidence and mapper regression](dqk-character-creation.md).
The formula and overlay-4 discussion below describe the older derivation;
they do not independently verify every overlay's code start.

Each overlay blob begins with `reloc_entry_count / 2` fixup entries, each 4 bytes:
`(code_offset_word, placeholder_seg_word)`.  The OvrMgr reads these to know which
words in the code buffer to patch with the actual runtime segment.
The **code buffer starts immediately after** the fixup prefix:

```
prefix_bytes = (reloc_entry_count / 2) * 4
code_start_file = overlay_file_offset + prefix_bytes
```

Verification for overlay 4: `reloc_entry_count = 621`, `prefix = 310 * 4 = 1240`…
actual observed prefix = 1248 bytes (first `PUSH BP / MOV BP,SP` prologue at +1248).

### Complete overlay table

| Idx | `runtime_seg` | `file_offset` | Blob size | Key content                         |
|-----|---------------|---------------|-----------|-------------------------------------|
| 0   | `0x1F4E`      | `0x0218E0`    | 41,792 B  | large overlay (ECL/game logic)      |
| 1   | `0x28D0`      | `0x02BC20`    | 8,160 B   |                                     |
| 2   | `0x28D0`      | `0x02DC00`    | 10,416 B  |                                     |
| 3   | `0x1F4E`      | `0x0304B0`    | 28,544 B  |                                     |
| 4   | `0x25A4`      | `0x037430`    | 11,184 B  | **protection overlay** (see §5)     |
| 5   | `0x25A4`      | `0x039FE0`    | 23,952 B  |                                     |
| 6   | `0x25A4`      | `0x03FD70`    | 17,744 B  |                                     |
| 7   | `0x25A4`      | `0x0442C0`    | 18,816 B  |                                     |
| 8   | `0x25A4`      | `0x048C40`    | 18,528 B  |                                     |
| 9   | `0x2B3A`      | `0x04D4A0`    | 31,024 B  |                                     |
| 10  | `0x2B3A`      | `0x054DD0`    | 30,448 B  |                                     |
| 11  | `0x2B3A`      | `0x05C4C0`    | 26,480 B  |                                     |
| 12  | `0x322E`      | `0x062C30`    | 45,136 B  | **journal-word prompt** strings/code |

---

## 4. All Overlay-4 Stubs (Protection Overlay)

Twelve stubs in the 0x1D99 segment dispatch to overlay 4 (index byte = `0x04`).

| File offset | 1D99 offset | LJMP target          | Function                  |
|-------------|-------------|----------------------|---------------------------|
| `0x020D43`  | `0x0FB3`    | `0x25A4:0x0170`      | (helper)                  |
| `0x020D4D`  | `0x0FBD`    | `0x25DE:0x0130`      | (helper)                  |
| `0x020EE7`  | `0x1157`    | `0x264F:0x0345`      | (helper)                  |
| `0x020EF1`  | `0x1161`    | `0x25DE:0x04EC`      | (helper)                  |
| `0x020F0F`  | `0x117F`    | `0x26F8:0x008B`      | (helper)                  |
| `0x020F23`  | `0x1193`    | `0x25DE:0x0131`      | (helper)                  |
| `0x020F2D`  | `0x119D`    | `0x25DE:0x0033`      | (helper)                  |
| `0x0210DB`  | `0x134B`    | `0x264F:0x03CB`      | (helper)                  |
| `0x0212CF`  | `0x153F`    | `0x2726:0x0097`      | overlay 4 init            |
| `0x0212D9`  | `0x1549`    | `0x2726:0x08D1`      | overlay 4 init variant    |
| `0x0212E3`  | `0x1553`    | `0x2726:0x0020`      | **DoProtCheck** (§5.2)    |
| `0x0212ED`  | `0x155D`    | `0x2726:0x0004`      | **IsProtSkip** (§5.1)     |

Raw bytes at the 4 `0x2726`-dispatching stubs (verified):
```
0212CF: E8 4B F0  EA 97 00 26 27  04 00   LJMP 0x2726:0x0097 idx=4
0212D9: E8 41 F0  EA D1 08 26 27  04 00   LJMP 0x2726:0x08D1 idx=4
0212E3: E8 37 F0  EA 20 00 26 27  04 00   LJMP 0x2726:0x0020 idx=4  (DoProtCheck)
0212ED: E8 2D F0  EA 04 00 26 27  04 00   LJMP 0x2726:0x0004 idx=4  (IsProtSkip)
```

---

## 5. Protection Functions — Definitive Analysis

### File-offset derivation

```
ovr4_blob_start    = 0x037430
prefix_entries     = reloc_count/2 = 621/2 = 310 (approx); actual prefix = 1248 bytes
code_start         = 0x037430 + 0x04E0 = 0x037910
sub_seg_2726_off   = (0x2726 - 0x25A4) * 16 = 0x182 * 16 = 0x1820 bytes
IsProtSkip_file    = 0x037910 + 0x1820 + 0x0004 = 0x039134
DoProtCheck_file   = 0x037910 + 0x1820 + 0x0020 = 0x039150
```

### 5.1 IsProtSkip (0x2726:0x0004, file 0x039134)

Bytes at 0x039134: `B8 FE FF 50  B8 00 F0 50  9A 73 28 D7 00  59 59  3D FD 00  75 05  B8 01 00  EB 02  33 C0  CB`

```asm
0x1824: B8 FE FF        MOV AX, 0xFFFE
0x1827: 50              PUSH AX
0x1828: B8 00 F0        MOV AX, 0xF000
0x182B: 50              PUSH AX
0x182C: 9A 73 28 D7 00  LCALL 0xD7, 0x2873   ; peek-byte helper
0x1831: 59              POP CX
0x1832: 59              POP CX
0x1833: 3D FD 00        CMP AX, 0x00FD
0x1836: 75 05           JNE +5               ; not 0xFD -> return 0
0x1838: B8 01 00        MOV AX, 1
0x183B: EB 02           JMP +2
0x183D: 33 C0           XOR AX, AX
0x183F: CB              RETF
```

The helper at `0xD7:0x2873` (file `0x0059E3`) is:
```asm
2873: 8B DC            MOV BX, SP
2875: 36 8E 47 04      MOV ES, SS:[BX+4]    ; ES = first arg = 0xF000
2879: 36 8B 5F 06      MOV BX, SS:[BX+6]    ; BX = second arg = 0xFFFE
287D: 26 8A 07         MOV AL, ES:[BX]       ; read byte at F000:FFFE
2880: 32 E4            XOR AH, AH
2882: CB               RETF
```

**IsProtSkip reads the BIOS machine-type ID at `F000:FFFE`.**
It returns 1 (skip protection) only if that byte equals `0xFD` (IBM PC original).
Under DOSBox the byte is typically `0xFF` → IsProtSkip returns **0** (do not skip).

### 5.2 DoProtCheck (0x2726:0x0020, file 0x039150)

Bytes at 0x039150: `33 C0 50  B8 00 FC 50  9A 73 28 D7 00  59 59  3D 21 00  75 05  B8 01 00  EB 02  33 C0  CB`

```asm
0x1840: 33 C0           XOR AX, AX
0x1842: 50              PUSH AX            ; offset = 0x0000
0x1843: B8 00 FC        MOV AX, 0xFC00
0x1846: 50              PUSH AX            ; segment = 0xFC00
0x1847: 9A 73 28 D7 00  LCALL 0xD7, 0x2873 ; peek-byte helper (same as above)
0x184C: 59              POP CX
0x184D: 59              POP CX
0x184E: 3D 21 00        CMP AX, 0x0021     ; '!'
0x1851: 75 05           JNE +5
0x1853: B8 01 00        MOV AX, 1
0x1856: EB 02           JMP +2
0x1858: 33 C0           XOR AX, AX
0x185A: CB              RETF
```

**DoProtCheck reads a byte at `0xFC00:0x0000`** (EGA/expansion ROM area).
Returns 1 if that byte equals `0x21` (`'!'`).  Under DOSBox this area does not
contain `0x21` → DoProtCheck returns **0** (fail).

### 5.3 Protection Wrapper (seg 0x15FF:0x0009, file 0x0183F9)

Two callers of DoProtCheck exist: file `0x018407` and file `0x01A512`.
One caller of IsProtSkip: file `0x0183FE`.

```asm
0183F9 (0x0009): C6 06 C1 CD 01   MOV BYTE [0xCDC1], 1      ; set prot_triggered
0183FE (0x000E): 9A 5D 15 99 1D   LCALL 1D99:0x155D          ; IsProtSkip
018403 (0x0013): 0B C0             OR AX, AX
018405 (0x0015): 75 09             JNE 0x0020                 ; if skip -> AX=1 path
018407 (0x0017): 9A 53 15 99 1D   LCALL 1D99:0x1553          ; DoProtCheck
01840C (0x001C): 0B C0             OR AX, AX
01840E (0x001E): 74 05             JE 0x0025                  ; fail -> AX=0 path
018410 (0x0020): B8 01 00          MOV AX, 1
018413 (0x0023): EB 02             JMP 0x0027
018415 (0x0025): 33 C0             XOR AX, AX
018417 (0x0027): A2 C2 CD          MOV [0xCDC2], AL           ; store result
01841A (0x002A): 9A 5B 00 FF 15   LCALL 0x15FF:0x5B           ; post-check I/O
01841F (0x002F): 80 3E C2 CD 00   CMP BYTE [0xCDC2], 0
018424 (0x0034): 74 0C             JE 0x0042
018426 (0x0036): E4 61             IN AL, 0x61                 ; keyboard ctrl
018428 (0x0038): A2 C0 CD          MOV [0xCDC0], AL
01842B (0x003B): A0 C0 CD          MOV AL, [0xCDC0]
01842E (0x003E): 0C 60             OR AL, 0x60
018430 (0x0040): E6 61             OUT 0x61, AL               ; enable keyboard
018432 (0x0042): CB                RETF
```

The protection result is stored in memory flag `[0xCDC2]`:
- `1` = protection passed or skipped
- `0` = protection failed (triggers journal-word prompt later)

The journal-word prompt strings (`"journal, page"` at file `0x6AC4A`) are in
**overlay 12** (file `0x062C30..0x06DC80`).  The prompt is triggered elsewhere in
the game loop when it checks `[0xCDC2] == 0`.

### 5.4 Second Protection Call Site (file 0x01A512)

Located in the **save-game file loader** at `0x17FA:0x00CC` (file `0x01A46C`).
Called from `0x01347F` (the begin-game / resume sequence).

```asm
01A512: 9A 53 15 99 1D   LCALL 1D99:0x1553   ; DoProtCheck
01A517: 0B C0             OR AX, AX
01A519: 74 56             JE 0x1A571          ; FAIL -> continue anyway (no hard gate)
01A51B: 83 3E 41 CA 04   CMP [0xCA41], 4     ; module number
01A520: 7F 22             JG 0x1A544          ; module > 4 -> branch
```

When DoProtCheck **fails** (`AX=0`), this path jumps to `0x1A571` which is the
**normal continuation** (not an error handler).  This call site does NOT gate the
journal-word prompt — it influences game-data loading for specific module numbers.

---

## 6. Call Chain: Load-Saved-Game → Begin Adventuring

```
begin_game_func  1102:000C  file 0x01342C
  0x01343A: CALL FAR 1D99:0x1549          ; overlay 4 sub-seg 0x2726 init
  0x01347F: CALL FAR 17FA:0x00CC          ; save-file loader (calls DoProtCheck internally)
  0x013449: CALL FAR 1C41:0x0005          ; protection + save-slot initializer
      -> file 0x01E815
      0x01E819: LCALL 15FF:0x0009         ; protection wrapper
          -> IsProtSkip: peek F000:FFFE == 0xFD?  (fails on DOSBox)
          -> DoProtCheck: peek FC00:0000 == '!'?   (fails on DOSBox)
          -> [0xCDC2] = 0
      (loop: zeros 5 save-slot records at 0xDAD9)
  0x013458: CALL FAR 12B7:0x1BE3          ; game world init
```

The journal-word prompt fires later (from overlay 12) when the game detects
`[0xCDC2] == 0`.

---

## 7. Why the Stub Patch Alone Did Not Visibly Help

Prior attempts patched:
1. `0x018405` (`JNE → JMP`) — makes wrapper always take AX=1 path  
2. `0x01A512` direct call — changes second call site  
3. Stub at `0x0212E3` → `B8 01 00 CB` — makes DoProtCheck stub return AX=1

All three patching the **MZ image** locations are correct and **together they DO
bypass** the hardware-fingerprint checks.  The reason the journal prompt still fired
in testing is most likely one of:

- **(inferred)** The rebuild pipeline regenerated or re-linked `DQK.EXE` from an
  unpatched source after the manual hex patch was applied.
- **(inferred)** The COAB rebuild binary was used instead of the GoG DQK.EXE, and
  the COAB rebuild has a code-wheel protection at a different offset (COAB's
  `ovr004.cs::copy_protection()` uses a code wheel, not the hardware-peek scheme).
- The journal-word solver path (already shipping in the harness) was chosen instead
  and the EXE-patch was never re-applied to the clean binary.

---

## 8. Verified Patch Targets

All three patches below make the journal-word prompt never appear.
Patch A (single byte, MZ image) is sufficient by itself.

| Patch | File offset | Before  | After   | Effect                                      |
|-------|-------------|---------|---------|---------------------------------------------|
| **A** | `0x018405`  | `75 09` | `EB 09` | Protection wrapper always succeeds (JNE→JMP) |
| B     | `0x039134`  | `B8 FE FF` | `B8 01 00` | IsProtSkip always returns 1 (skip)       |
| C     | `0x0212E3`  | `E8 37 F0 EA 20 00 26 27 04 00` | `B8 01 00 CB 90 90 90 90 90 90` | DoProtCheck stub returns 1 |

**Patch A** (file `0x018405`, byte `0x75 → 0xEB`) is the recommended minimal patch:
it lives in the MZ image (not the overlay tail), requires no overlay-structure
knowledge, and bypasses both hardware checks unconditionally.

---

## 9. Resident Segment Map (Key Segments)

| Segment | File base  | Description                          |
|---------|------------|--------------------------------------|
| `0x0000`| `0x002400` | PSP / low data                       |
| `0x0D7` | `0x003170` | data-access helpers (peek, far-copy) |
| `0x1102`| `0x013420` | begin-game / ECL runner              |
| `0x15FF`| `0x0183F0` | protection wrapper + I/O helpers     |
| `0x17FA`| `0x01A3A0` | save-game file loader                |
| `0x1C41`| `0x01E810` | session init (calls prot wrapper)    |
| `0x1D00`| `0x01F400` | (data/BSS)                           |
| `0x1D99`| `0x01FD90` | **resident stub segment** (all 1D99:xxxx stubs) |

The segment `0x1D99` contains:
- Overlay manager at seg-offset `0x058D` (file `0x2031D`)
- Descriptor table at seg-offset `0x0C1F` (file `0x209AF`)
- All FBOV dispatch stubs

---

## 10. Overlay Manager (OvrMgr) Summary

Located at file **0x2031D** (1D99:0x058D).  Called by every FBOV stub via `CALL near`.

```asm
; Entry: stack = [bp+2]=pointer to stub's LJMP, [bp+4..6]=caller's CS:IP
OvrMgr:
  PUSH BP; MOV BP, SP
  PUSH AX, BX, CX, DX, DI, SI, DS; PUSHF
  MOV DS, 0x1D99                   ; work in resident seg
  TEST [0xC0D], 0x0100             ; check overlay cache flags
  JE skip_evict
  CALL evict                       ; make room in overlay pool
skip_evict:
  MOV BX, [BP+2]                   ; BX -> stub's LJMP instruction
  MOV AX, [BX+5]                   ; AX = index_byte (stub offset +8 from E8)
  ; ... load overlay from disk, apply fixups, patch all stubs with index AX
  ; ... update LJMP seg words with actual loaded segment
  POPF; POP DS,SI,DI,DX,CX,BX,AX,BP
  RET                              ; returns to stub; stub then executes patched LJMP
```

After OvrMgr returns, the LJMP in the stub has been updated with the actual
loaded segment.  The CPU immediately executes the LJMP to the overlay function.

---

## 11. Open Questions / Unknowns

1. **Exact trigger for journal-word prompt from overlay 12**: `[0xCDC2] == 0` is
   set by the protection wrapper, but the specific overlay-12 function that reads
   it and shows the prompt has not been located (UNKNOWN).
2. **Overlay 12 code structure**: No `PUSH BP / MOV BP,SP` prologue found in the
   first scan of overlay 12 (file `0x062C30`).  The code may use a different prologue
   pattern or the scanner parameters were insufficient (UNKNOWN).
3. **Runtime segment allocation**: The descriptor `word[3] = 0x0400` may be the
   scratch buffer paragraph address.  Whether this is fixed or DOS-allocated is
   unconfirmed **(inferred)**.
4. **Other overlay stub dispatch tables**: Only the 1D99 stub block at offsets
   `0x0E4B..0x155D` was scanned.  There may be additional stub blocks elsewhere in
   the resident image.
5. **CoK-on-DQK compatibility**: Whether the journal-word result (`[0xCDC2]`) also
   gates ECL opcodes executed during CoK-content gameplay is unconfirmed (UNKNOWN).

---

## 12. Implications for Our Engine

1. **No INT 3Fh stubs to emulate** — the DQK overlay scheme is entirely different
   from CoK's `GAME.OVR` + `START.EXE` scheme.  The `disasm_dqk.py` `overlays`/
   `resolve`/`thunk` subcommands work with the 18-byte descriptor table and the
   `E8 disp16 + EA off16 seg16 + idx 00` stub pattern.

2. **Overlay offsets are sub-segment relative** — a LJMP `0x2726:0x0004` means
   sub-segment `0x2726`, byte 4 from the start of that sub-segment's code within
   the combined code buffer.  File offset = `code_start + (link_seg - base_seg)*16 + entry_offset`.

3. **Protection is a hardware fingerprint, not a journal-word** — `DoProtCheck`
   checks `FC00:0000 == '!'` (expansion ROM byte).  The *journal-word UI* is a
   consequence of that check failing; it lives in overlay 12 and is triggered via
   the `[0xCDC2]` flag.  A single-byte patch at file `0x018405` permanently silences it.

4. **The journal-word solver** (already shipped in the harness) handles the
   prompt as a runtime UI interaction and requires no EXE modification.  The
   EXE-patch (`0x018405: 75→EB`) is the permanent alternative.

5. **Descriptor table is in the resident segment 0x1D99** — any tool that
   relocates or rebuilds DQK.EXE must preserve the 13-entry table at file `0x209AF`
   and keep all 1D99 stub offsets aligned, or the overlay dispatch system breaks.
