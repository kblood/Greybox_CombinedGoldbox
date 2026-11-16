# CoK Copy-Protection — Journal Word Check: Full Findings

**Target:** DOS Champions of Krynn (CoK), GOG release  
**Research date:** 2026-06-24  
**Tools used:** `daxdump_extracted/EclDump.exe` output (pre-existing `.txt`/`.bin` files),
`daxdump_extracted/ECL1_018.bin`, `Champions of Krynn/GAME.OVR` binary analysis  
**Legal posture:** Legitimate owner; research is to bypass the check in own rebuild
(Greybox TS engine and DOSBox screenshot capture), not for piracy.

---

## Summary / Verdict

The CoK copy protection is **NOT implemented in ECL bytecode** at all. It is implemented
as a native C routine inside `GAME.OVR` (the Borland FBOV overlay), called indirectly
when the ECL opcode `PROGRAM 0` (StartGameMenu) fires. The protection **always fires on
new-game start** and is **automatically skipped when a valid save game with party data
is loaded** prior to calling StartGameMenu.

The cleanest single-byte patch for DOSBox testing is to change **1 byte in `GAME.OVR`**
at file offset `0x0446C` from `0x75` (JNZ) to `0xEB` (JMP), making the bypass
unconditional.

In the **Greybox TS engine**, the protection is absent by design: since we implement
`StartGameMenu` in TypeScript without a copy-protection call, the issue simply does not
exist in the port.

---

## 1. Where the Protection Lives

### 1.1 ECL side — opcode PROGRAM 0 (StartGameMenu)

The protection is triggered entirely through the ECL opcode `0x38 PROGRAM #0`.

**ECL block 018** (the area-transition dispatcher, `daxdump_extracted/ECL1_018.txt`):

```
0x8026  03 01 04 4C 00 01   COMPARE  addr:0x4c04 (word_208), #1
0x802C  16                  IF_EQ    (skip next if word_208 == 1)
0x802D  01 01 40 80         GOTO     0x8040          ; skip StartGameMenu
0x8031  09 00 01 01 04 4C   SAVE     #1 -> addr:0x4c04   ; word_208 = 1
0x8037  09 00 7f 01 a8 7e   SAVE     #127 -> var:training_class_mask
0x803D  38 00 00            PROGRAM  #0              ; === StartGameMenu ===
0x8040  09 00 00 01 38 4C   SAVE     #0 -> addr:0x4c38   ; word_270 = 0
...
```

**ECL block 016** (overland map, `daxdump_extracted/ECL1_016.txt`) also calls
`PROGRAM 0` at virtual `0x8B62` (raw byte 2916 within `ECL1_016.bin`).

The guard logic: on first entry `word_208` (DS:0x4c04) is 0, so `IF_EQ` is false,
execution falls through to `PROGRAM 0`. On second entry, `word_208` has been set to 1,
so `IF_EQ` is true, `GOTO 0x8040` skips `PROGRAM 0` entirely. **Copy protection only
fires on the first call per session.**

Exact raw bytes (ECL1_018.bin, offsets 63-65):

```
raw byte 63 (vaddr 0x803D): 0x38  PROGRAM opcode
raw byte 64 (vaddr 0x803E): 0x00  arg code = immediate
raw byte 65 (vaddr 0x803F): 0x00  arg value = program #0
```

There is **no dedicated `PROTECTION` opcode (0x3C) usage anywhere** in the CoK ECL.
There is **no `INPUT STRING` (0x10)** usage in overland ECL blocks 016, 017, or 018.
The ECL is clean of protection code.

### 1.2 GAME.OVR — the StartGameMenu native routine

All copy-protection logic lives in `Champions of Krynn/GAME.OVR` (Borland FBOV overlay
container). The format string for the protection prompt was located at two offsets:

| File offset | Content |
|-------------|---------|
| `0x04D46` | `" what is word # [N]    [W] of journal entry # [P]     (journal, page [J])?      of tavern tale # [T]Enter U"` |
| `0x1A962` | `" what is word # [N]    after the heading \"[H]\" (rule book, page [P])?[S]     (journal, page [J]"` |

The second string (0x1A962) matches the exact display format reported by players:
**"WHAT IS WORD #N AFTER THE HEADING [heading] (JOURNAL, PAGE P)"**.

### 1.3 The bypass check in GAME.OVR

The StartGameMenu function at file offset `0x04448` begins:

```
0x04448  55              PUSH BP
0x04449  89 E5           MOV BP, SP
0x0444B  81 EC 02 01     SUB SP, 0x102
0x0444F  C6 06 2F 74 01  MOV byte [0x742F], 1
0x04454  8B 46 06        MOV AX, [BP+6]
0x04457  A3 43 4B        MOV [0x4B43], AX
0x0445A  C6 06 B8 43 00  MOV byte [0x43B8], 0   ; RESET initiated flag
0x0445F  80 3E B8 43 00  CMP byte [0x43B8], 0   ; check (ALWAYS 0 — dead check)
0x04464  75 41           JNZ +41 → 0x044A7      ; never fires
0x04467  80 3E 57 4B 00  CMP byte [0x4B57], 0   ; REAL bypass: save-loaded flag
0x0446C  75 3A           JNZ +3A → 0x044A8      ; skips protection if [0x4B57] != 0
                         ; [protection dialog fires here if not skipped]
0x044A8  ...             ; character creation / menu continues
```

**Key finding:** DS variable `[0x43B8]` is reset to 0 immediately before it is checked,
so the first `JNZ` at `0x04464` is a **dead check** — it never branches. The **operative
bypass** is the second check at `0x0446C` on DS variable `[0x4B57]`.

`[0x4B57]` is set to `1` by the save-game loading routine at GAME.OVR `0x0687D`
whenever valid party data is present in memory (non-null party pointer at DS:0x609A).
It is set to `0` when no save is loaded. **The protection fires if and only if no valid
save game has been loaded into memory.**

---

## 2. Where Answers Are Stored

The verification loop at GAME.OVR `0x1A803` looks up three data tables indexed by the
random selection:

| DS address | Table contents |
|------------|----------------|
| `DS:0x0718` | Journal page number for each question slot |
| `DS:0x0719` | Heading index for each question slot |
| `DS:0x073B` | Expected first answer byte |
| `DS:0x073C` | Expected second answer byte |
| `DS:0x073D` | Expected third answer byte |

These are **runtime DS-segment addresses** (not file offsets in GAME.OVR). They are
populated from data compiled into the binary.

The **physical answers** are also available in the included PDF:
- `Champions of Krynn/Journal.pdf` — the full Journal document (headings and text)
- `Champions of Krynn/Codes.pdf` — the word lookup table (image-based PDF, not text-extractable)

The game picks a random (page, heading, word#) combination from a fixed internal
table and compares the typed answer against the stored expected word. The player is
expected to own the physical journal. **The answer words are compiled into GAME.OVR**
as data tables at the above DS addresses (UNKNOWN exact file offsets, as the FBOV
segment base is only known at runtime).

---

## 3. Trigger Condition and Save-Flag Skip

### Trigger condition
The protection fires when:
1. ECL opcode `PROGRAM 0` (StartGameMenu) is executed
2. AND DS variable `[0x4B57]` == 0 (no valid save game loaded in memory)

It fires on every new-game start. It does NOT fire when resuming from a saved game
(because loading the save sets `[0x4B57]` = 1 before `StartGameMenu` is invoked).

### Is there a save-file flag to skip it?

**Yes, indirectly.** The protection is gated on `[0x4B57]` which reflects whether a
save game with party data is in memory. The code at GAME.OVR `0x0687D` sets
`[0x4B57] = 1` if the party data pointer at DS:0x609A is non-null.

`SAVGAM.TXT` (hackdocs) documents:
- Offset 21 = "Initiated flag" (4 = game initiated, 0 = not)
- Offsets 1031–1036 = multiple "Initiation flag" bytes set when adventure begins

However, the direct mapping from save-file offsets to DS:`0x4B57` is **UNLOCATED**
without a full FBOV segment-map analysis. The path confirmed to work is loading a save
that has valid party character records (CHRDATAn.SAV populated).

---

## 4. Bypass Options (Ranked by Feasibility)

### Option 1: GAME.OVR 1-byte patch (BEST for DOSBox screenshot)

**Patch:** In `Champions of Krynn/GAME.OVR`, change byte at file offset **`0x0446C`**
from `0x75` (JNZ) to `0xEB` (JMP unconditional).

```
File offset 0x0446C:  75 3A  → EB 3A
```

Effect: The second bypass check becomes an unconditional jump, skipping the protection
dialog on every call to `StartGameMenu`, regardless of save state. Reversible by
changing the byte back.

Risk: Low. The patch is isolated to this one conditional. The character-creation flow
that follows is unchanged. This is a well-understood 1-byte branch-inversion patch.

**This is the recommended approach for DOSBox overland screenshot capture.**

### Option 2: Load a valid save game before entering the adventure (NO patch)

The protection is automatically bypassed when a valid save game with party data is
loaded. If SAVGAMA.DAT has populated character records (even a minimal one-character
party), loading it before the StartGameMenu call will set `[0x4B57]=1` and skip the
dialog entirely.

Creating such a save: start a game in DOSBox, successfully pass the protection once
(using the journal/Codes.pdf), save immediately. On all subsequent runs, load that
save and the protection never fires again.

Risk: None. This is the normal intended game flow.

### Option 3: Answer correctly from the Journal/Codes.pdf

The game displays: "WHAT IS WORD #N AFTER THE HEADING [heading] (JOURNAL, PAGE P)"

Look up page P in `Champions of Krynn/Journal.pdf`, find the heading, count N words
after it, type that word. The protection accepts any correct answer (case-insensitive,
based on the comparison structure in GAME.OVR).

`Champions of Krynn/Codes.pdf` is an image-based PDF (no text layer) that should
contain a pre-built lookup table — readable if opened as an image.

Risk: None. Legal owner's route. Slightly laborious for automation.

### Option 4: ECL-level NOP in the ported CoK-on-DQK ECL (for the Greybox build)

In the ported ECL block 018 (or 016), replace the `PROGRAM 0` call or the guard
preceding it:

**Sub-option 4A — NOP the PROGRAM instruction:**
In ECL1_018.bin: change bytes 63-65 (`38 00 00`) to `3D 00 00` (CLEAR BOX + 2 padding bytes — but 0x3D takes 0 args so the `00 00` would be misread as a SAVE instruction). This approach is UNSAFE without a test.

**Sub-option 4B — Force the guard condition:**
Change raw byte 46 (`0x16` = IF_EQ) to `0x3D` (CLEAR BOX, 0 args) in ECL1_018.bin:

```
raw byte 46 (vaddr 0x802C): 16 → 3D
```

Effect: The guard `IF_EQ` is replaced by a harmless `CLEAR BOX`. The immediately
following `GOTO 0x8040` always executes, skipping the `SAVE`+`PROGRAM` block.
`word_208` will not be set to 1 (minor side effect: the first-run tracking is lost,
but this is inconsequential in a ported engine).

Risk: Low. Single-byte change. The `word_208` tracking is irrelevant in Greybox since
the TS engine controls session state separately.

### Option 5: Greybox TS engine — implement StartGameMenu without protection

**This is already the correct implementation for the Greybox engine.** When the ECL VM
executes `PROGRAM 0`, the TypeScript handler `startGameMenu()` is called. The handler
should launch the character creation / party management flow WITHOUT any word-check
dialog. There is no protection in Greybox by design.

**No action required for the engine itself — just don't implement the word check.**

---

## 5. Open Questions / Unknowns

| Item | Status |
|------|--------|
| Exact FBOV segment base for GAME.OVR | UNKNOWN — needed to map DS:0x0718 etc. to file offsets and read the answer table directly |
| Contents of `Codes.pdf` | UNVERIFIED — image-only PDF; must be opened visually to read the lookup table |
| Whether a pre-built SAVGAMA.DAT bypass (crafted save) works | UNVERIFIED — should work if `[0x4B57]` is set on load; requires testing in DOSBox |
| Whether the protection also gates the ECL1_016 path differently | NOT INVESTIGATED — both block 016 and block 018 call `PROGRAM 0`; the same GAME.OVR check applies |
| Exact set of valid (page, heading, word#) combinations | UNKNOWN — internal table at DS:0x0718/0x0719 in GAME.OVR; size is UNKNOWN |

---

## 6. Implications for Our Engine

1. **No engine-level work needed.** The protection lives entirely in a native routine
   (`PROGRAM 0` → GAME.OVR). In the Greybox TS engine we implement `StartGameMenu`
   ourselves without a copy-protection call. The ECL opcode fires, the handler runs,
   protection is absent by design. Nothing to port.

2. **For DOSBox screenshot capture (immediate need):** 1-byte patch at GAME.OVR
   offset `0x0446C` (`75` → `EB`) gets past the protection on every run without
   needing the journal. Reversible.

3. **The ECL1_018 PROGRAM guard (`word_208` check)** is a first-run-only sentinel.
   In the ported ECL it can be removed or preserved as-is — in the Greybox engine
   the `StartGameMenu` handler returns immediately (no protection), so the sentinel
   has no harmful effect either way.

4. **COAB opcode 0x3C = PROTECTION** does NOT appear in any CoK ECL block. The
   opcode exists in the table (inherited from CoAB) but is unused in CoK. Our
   ECL VM can safely register it as a no-op without consequence.

5. **Journal entry decoding** (roadmap M4.S3): the copy protection uses a fixed
   (page, heading, word#) table pointing into the journal. Implementing a journal
   viewer in Greybox removes the need for the physical journal and makes the
   protection moot in the web player context (per ROADMAP.md and BUILD-QUEUE.md).

---

## Sources and Evidence

| Fact | Source |
|------|--------|
| Protection not in ECL | `daxdump_extracted/ECL1_016.txt`, `ECL1_017.txt`, `ECL1_018.txt` — no PROTECTION (0x3C), no INPUT STRING (0x10) in overland blocks |
| `PROGRAM 0` triggers protection | `daxdump_extracted/ECL1_018.txt` line `0x803D 0x38 PROGRAM StartGameMenu` |
| Format strings in GAME.OVR | `Champions of Krynn/GAME.OVR` at file offsets `0x04D46` and `0x1A962` — binary grep |
| Bypass condition ([0x4B57]) | `Champions of Krynn/GAME.OVR` at file offset `0x04460`-`0x0446C` — x86 disassembly |
| [0x4B57] set on save load | `Champions of Krynn/GAME.OVR` at file offsets `0x038A5`, `0x0687D` |
| Answer table DS addresses | `Champions of Krynn/GAME.OVR` at `0x1A810`-`0x1A830` and `0x1AA28`-`0x1AA6E` |
| ECL opcode table | `daxdump_extracted/ECL1_018.txt`, `docs/engine/research/ecl-krynn-gen1-opcodes.md` |
| SAVGAM flag offsets | `hackdocs_extracted/SAVGAM.TXT` |
| COAB opcode 0x3C = PROTECTION | `docs/engine/research/decompilation-sources.md` (CoAB ovr003.cs table) |


---

## DQK.EXE Protection Patch

**Target:** DOS The Dark Queen of Krynn (`The Dark Queen of Krynn/DQK.EXE`, 449,664 bytes, Borland FBOV overlay EXE)  
**Research date:** 2026-06-24  
**Tool used:** `tools/disasm_dqk.py`, Python byte analysis  
**Legal posture:** Same as CoK -- legitimate owner, patched EXE stays in local git-ignored build dir.

---

### DQK.1 -- File Layout (overlay caveat pre-cleared)

DQK.EXE is a flat MZ file with Borland FBOV (far-call overlay) structure:

| Region | File offsets | Description |
|--------|-------------|-------------|
| MZ header | 0x0000-0x23FF | 576-paragraph header (0x2400 bytes) |
| MZ load image | 0x2400-0x218D4 | Code+data loaded at startup (~137 KB) |
| Overlay tail | 0x218D5-0x6DC7F | Borland FBOV overlay segments (~312 KB) |

Both patches target the **MZ load image** (offsets 0x018405 and 0x01A512, both < 0x218D5). They are NOT inside any overlay segment and are NOT subject to runtime relocation. The on-disk file offset equals the patch offset.

---

### DQK.2 -- Protection String Location

Protection prompt strings confirmed at file offset **0x6AC49** (in overlay tail, not patchable directly):

```
0x6AC49: " journal, page "   (20 6A 6F 75 72 6E 61 6C 2C 20 70 61 67 65 20 00)
0x6AC6A: " what is word # "
0x6AC84: " after the heading "
0x6AC92: "Enter "
```

These are in an FBOV overlay code/data segment (placeholder segment `0x2726`). The exact file offset of the overlay code within the tail is **UNLOCATED** (dynamically assigned by overlay loader at runtime). This does not affect the patches.

---

### DQK.3 -- Obfuscated Text Before 0x6AC4A

The scrambled region 0x6AB00-0x6AC43 (immediately before the protection prompt strings) decodes to game **chapter/scenario title strings**, NOT a copy-protection answer table.

Encoding: each NUL-delimited string is stored **reversed** with **+17** or **+18** added to each byte.

| Decoded string | Encoding |
|----------------|----------|
| `COMBAT STRATEGIES` | reverse + add 17 |
| `MAGICAL TREASURES` | reverse + add 17 |
| `WOUNDED CHARACTERS` (stored as `XPVOEFE!DIBSBDUFST`) | reverse + add 18 |
| `THE MOONS OF KRYNN` (stored as `UIF!NPPOT!PG!LSZOO`) | reverse + add 18 |

The remaining ~32 strings in the region are short abbreviations or use a different (UNKNOWN) sub-key. None contain recognisable answer words. **The protection answer data is compiled into the overlay code** (UNLOCATED).

---

### DQK.4 -- Call Chain

Two FBOV stubs in segment `0x1D99` (startup segment) dispatch into the protection overlay:

| Stub | File offset of CALL | Overlay function | Role |
|------|---------------------|-----------------|------|
| `1D99:155D` | `0x0183FE` | `0x2726:0x0004` | `IsProtSkip()` -- returns nonzero if protection can be skipped |
| `1D99:1553` | `0x018407` and `0x01A512` | `0x2726:0x0020` | `DoProtCheck()` -- shows prompt, reads answer, verifies; returns nonzero if passed |

The startup protection sequence at file 0x0183F9 (called from the "Begin Adventuring" path):

```asm
0183F9  C6 06 C1 CD 01   MOV byte [0xcdc1], 1
0183FE  9A 5D 15 99 1D   CALL FAR 1D99:155D      ; IsProtSkip() -- can we skip?
018403  0B C0            OR  AX, AX
018405  75 09            JNE +9 -> 018410         ; if nonzero: skip DoProtCheck
018407  9A 53 15 99 1D   CALL FAR 1D99:1553      ; DoProtCheck() -- shows journal prompt
01840C  0B C0            OR  AX, AX
01840E  74 05            JE  +5 -> 018415         ; if zero: fail
018410  B8 01 00         MOV AX, 1
018413  EB 02            JMP -> 018417
018415  33 C0            XOR AX, AX
018417  A2 C2 CD         MOV [0xcdc2], AL        ; 1=pass, 0=fail
01841A  9A 5B 00 FF 15   CALL FAR 15FF:005B
01841F  80 3E C2 CD 00   CMP byte [0xcdc2], 0
018424  74 0C            JE -> 018432            ; if pass: skip beep
018426  E4 61            IN  AL, 0x61            ; wrong-answer PC speaker beep
018432  CB               RETF
```

Second call to `DoProtCheck` at 0x01A512 (game-data loading path):

```asm
01A512  9A 53 15 99 1D   CALL FAR 1D99:1553      ; DoProtCheck()
01A517  0B C0            OR  AX, AX
01A519  74 56            JE  +0x56 -> 01A571     ; if zero: fail path
01A51B  ...                                       ; pass path
```

---

### DQK.5 -- The Patches

#### Patch 1 -- Primary bypass (new game / startup): 1 byte at file offset 0x018405

Change `JNE` (0x75) to `JMP` (0xEB):

```
File offset 0x018405:  75  ->  EB
```

Verified bytes before patch:

```
018403: 0B C0      OR AX, AX
018405: 75 09      JNE +9        <-- PATCH: change 0x75 to 0xEB
018407: 9A 53 15 99 1D   CALL FAR 1D99:1553  (DoProtCheck -- skipped after patch)
```

Effect: execution unconditionally jumps to `MOV AX, 1` (pass). `DoProtCheck()` is never called; no prompt shown; `[0xcdc2]` always becomes 1 (pass).

#### Patch 2 -- Secondary bypass (data-load path): 5 bytes at file offset 0x01A512

Replace `CALL FAR` (5 bytes) with `MOV AX, 1; NOP; NOP`:

```
File offsets 0x01A512-0x01A516:
  9A 53 15 99 1D  ->  B8 01 00 90 90
```

Verified bytes before patch:

```
01A512: 9A 53 15 99 1D   CALL FAR 1D99:1553  <-- PATCH: replace 5 bytes
01A517: 0B C0            OR AX, AX
01A519: 74 56            JE +0x56 (not taken after patch = pass)
```

Effect: `DoProtCheck()` not called; AX forced to 1; the subsequent `JE` does not fire; execution continues on the pass path.

---

### DQK.6 -- Sufficiency and Confidence

| Scenario | Patches needed |
|----------|---------------|
| DOSBox screenshot of overland map (new game, Begin Adventuring) | **Patch 1 only** (1 byte at 0x018405) |
| Full play session including game-data loading paths | Patch 1 + Patch 2 |
| Greybox TS engine | Neither (protection absent by design) |

**Confidence: HIGH.** Both patches are grounded on verified bytes read directly from `The Dark Queen of Krynn/DQK.EXE`. The disassembly matches canonical Borland C x86 structure. Both patches are isolated branch/call replacements with no side effects on surrounding code. Neither is inside an overlay segment.

---

### DQK.7 -- Open Questions / Unknowns

| Item | Status |
|------|--------|
| Exact file offset of `DoProtCheck()` code in overlay tail | UNLOCATED |
| Answer word table location within overlay | UNLOCATED |
| Whether Patch 1 alone suffices for the "Begin Adventuring" flow | LIKELY YES -- second call site appears to be on a distinct load-game path |
| What `IsProtSkip()` checks to decide to skip (save-game flag? session flag?) | UNKNOWN -- overlay body not located |

---

### DQK.8 -- Sources

| Fact | Source |
|------|--------|
| Protection strings at 0x6AC49 | `The Dark Queen of Krynn/DQK.EXE` via `tools/disasm_dqk.py --find " journal, page "` |
| Scrambled region at 0x6AB00 = chapter titles | Byte decode: "COMBAT STRATEGIES", "MAGICAL TREASURES", "THE MOONS OF KRYNN", "WOUNDED CHARACTERS" |
| Call chain and all byte offsets | `tools/disasm_dqk.py --disasm`, Python capstone disassembly |
| Patch 1: 0x018405 = 0x75 (JNE) | `data[0x018403:0x018410] == 0B C0 75 09 9A 53 15 99 1D 0B C0 74 05` -- verified |
| Patch 2: 0x01A512-0x01A516 = 9A 53 15 99 1D | `data[0x01A512:0x01A517] == 9A 53 15 99 1D` -- verified |
| Both patches in MZ image, not overlay | `mz_image_end = 0x218D5`; both 0x018405 and 0x01A512 are below this bound |
| MZ/overlay structure | `tools/disasm_dqk.py --info`: `header_bytes=9216, mz_image_end=137429` |
