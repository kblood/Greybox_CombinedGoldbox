# ECL Bytecode Opcode Specification for ASM VM Port

**Target:** Clean-room NASM x86 ECL interpreter for the Greybox Gold Box engine  
**Scope:** Krynn trilogy — Gen1 (CoK/DoK) and Gen2 (DQK) dialects  
**Status:** Implementation-ready; every claim grounded in the sources below  
**Date:** 2026-06-25

---

## Sources Used (all primary)

| Source | Path | Role |
|--------|------|------|
| TS EclVm — opcode handlers | `packages/engine/src/ecl/vm.ts` | **Authoritative oracle** — verified semantics |
| TS opcode table | `packages/engine/src/ecl/opcodes.ts` | **Authoritative table** — from EclDump.exe IL |
| TS disassembler | `packages/engine/src/ecl/disassemble.ts` | Operand framing, dialect constants |
| TS ECL chain runner | `packages/engine/src/ecl/program.ts` | NEWECL chain semantics |
| Gen1 research doc | `docs/engine/research/ecl-krynn-gen1-opcodes.md` | Opcode table sourcing, block-18 worked example |
| Gen2 research doc | `docs/engine/research/ecl-gen2-dqk.md` | Header delta, shared framing, Gen2 CALL low-word note |
| DQK combat trigger | `docs/engine/research/combat-trigger-c4.2b-2b-2b.md` | vmRun1/searchLocation patterns |
| DQK vmRun1 fix | `docs/engine/research/dqk-vmrun1-cooldown-c4.2b-2b-2c-iii.md` | execArith correction, cell-desc |
| DQK search-location | `docs/engine/research/dqk-search-location.md` | Gen2 data addresses |
| ECL encode/port | `packages/engine/src/loaders/eclEncode.ts` | Gen1→Gen2 port proof |
| CoK combat decompile | `docs/engine/research/disasm-combat-cok.md` | Cross-overlay call structure |
| hackdocs OPCODES.TXT | `hackdocs_extracted/OPCODES.TXT` | NOT ECL — this is x86 Intel opcodes; irrelevant for ECL |
| hackdocs SCRIPT.TXT | `hackdocs_extracted/SCRIPT.TXT` | UA editor form structure; not ECL bytecode |
| hackdocs GEOEVENT.TXT | `hackdocs_extracted/GEOEVENT.TXT` | GEO event-record layout, event type numbers |

> **Critical clarification:** `hackdocs_extracted/OPCODES.TXT` documents the Intel 8086
> instruction set for hand-patching `CKIT.EXE`. It has NO relationship to Gold Box ECL opcodes.
> The authoritative ECL opcode source is `daxdump_extracted/EclDump.exe` (COAB project,
> .NET 2.0 IL), reverse-engineered into `packages/engine/src/ecl/opcodes.ts`.

---

## 1. Block Container and Header Format

### 1.1 Container

- **Gen1 (CoK/DoK):** ECL blocks live in DAX archives — `ECL1.DAX`, `ECL2.DAX`, `ECL3.DAX`.
  Standard DAX format: `{uint16 toc_bytes, N×9-byte TOC entries, RLE-compressed data}`. TOC entry:
  `{uint8 block_id, uint32 data_offset, uint16 raw_size, uint16 comp_size}`.
  Block IDs: ECL1 = 16,17,18,32,33,34,36; ECL2 = 48,49,50,57,64,66,67,68; ECL3 = 80,81,82,96,97,98,99.
  Source: `docs/engine/research/ecl-krynn-gen1-opcodes.md §3.1`.

- **Gen2 (DQK):** ECL blocks live in `ECL.GLB`, a flat HLIB `DATA` library (`magic=1`).
  Member 0 = id table: `{uint16 count, count × {uint16 areaId, uint16 memberIndex}}`.
  Members 1..N = ECL blocks. Decoder: `packages/engine/src/loaders/eclGlb.ts`.
  Source: `docs/engine/research/ecl-gen2-dqk.md`.

### 1.2 Block Header (VERIFIED)

The two generations share the same far-pointer table; only the magic word presence differs.

```
             Gen1 (CoK/DoK, DAX)          Gen2 (DQK, ECL.GLB)
             -------------------          -------------------
Bytes 0-1:   0x1388 magic word            [ABSENT — no magic]
Bytes 0-19:  5 × far pointer:             5 × far pointer:
(Gen1: 2-21)   {uint16 segment=0x0101,      {uint16 segment=0x0101,
                uint16 vaddr}                uint16 vaddr}
Header len:  22 bytes                     20 bytes
Code entry:  byte 22, vaddr 0x8014        byte 20, vaddr 0x8014
Virtual base: vbase = 0x8014-22 = 0x7FFE  vbase = 0x8014-20 = 0x8000
```

The five far pointers (by slot index):

| Slot | Name | Function |
|------|------|----------|
| 0 | `vmRun1` | Per-step main loop (fires every time party moves) |
| 1 | `searchLocation` | Per-cell event dispatch (Gen1: backdrop-indexed; Gen2: cell-desc-indexed) |
| 2 | `preCampCheck` | Hook before camping (often just EXIT) |
| 3 | `campInterrupted` | Hook when camp is interrupted |
| 4 | `eclInitialEntry` | Code entry — ALWAYS vaddr 0x8014 (= byte after header) |

Source: `packages/engine/src/ecl/disassemble.ts` `ECL_GEN1`/`ECL_GEN2` constants;
`docs/engine/research/ecl-krynn-gen1-opcodes.md §3.2`.

### 1.3 Virtual Addressing

```
vaddr = vbase + byte_offset
byte_offset = vaddr - vbase

Gen1: vbase = 0x7FFE   (byte 22 → vaddr 0x8014)
Gen2: vbase = 0x8000   (byte 20 → vaddr 0x8014)
```

GOTO/GOSUB/jump targets are stored as virtual addresses (≥ 0x8000). To resolve to byte offset:
`offset = vaddr - vbase`. Source: `packages/engine/src/ecl/vm.ts` `targetOffset()`.

---

## 2. Instruction Framing

### 2.1 Overall Structure

```
instruction = opcode_byte (1 byte)
            + arg_0 (EclOpp)
            + arg_1 (EclOpp)
            ...
            + arg_{wordSet-1} (EclOpp)
            + [count_extra EclOpp operands, for countAt opcodes]
            + [inline 6-bit string bytes, for code=0x80 operands]
```

`wordSet` per opcode is fixed; see the opcode table in §3.

### 2.2 EclOpp Argument Encoding

Each argument is **2 bytes** normally, or **3 bytes** when
`code ∈ {0x01, 0x02, 0x03, 0x81}`:

```
byte 0: code     (type indicator)
byte 1: high     (value byte, or string-byte-length for code=0x80)
byte 2: val      (ONLY present if code ∈ {0x01, 0x02, 0x03, 0x81})

Decoded word:
  code ∈ {0x01, 0x02, 0x03,
          0x81}:               word = (val << 8) | high   [16-bit, little-endian]
  all other codes:             word = high                 [8-bit value]
```

Observed code values and their semantic roles:

| Code | Size | Kind | Meaning |
|------|------|------|---------|
| `0x00` | 2 | imm | Literal immediate: value = `high` (0–255) |
| `0x01` | 3 | word | Virtual address or 16-bit variable reference: `word = (val<<8)\|high` |
| `0x02` | 3 | imm | 16-bit immediate literal: value = `word` |
| `0x03` | 3 | word | 16-bit variable reference (variant) |
| `0x09` | 2 | flag | Predicate/flag byte; appears in COMPARE_AND operands |
| `0x7F` | 2 | word | Variable-type operand (game-data variable); word = `high` (low address) |
| `0x80` | 2+N | strref | String table reference OR inline 6-bit packed string: `high` = byte-length of the packed string bytes that follow the operand |
| `0x81` | 3 | string | Runtime memory-string pointer: third byte forms `word=(val<<8)|high` (for example `81 00 7C` -> `0x7C00`) |

**Inline string decode (6-bit packing):** For `code=0x80`, `high` bytes of 6-bit characters
follow, MSB-first. Decode rule: value 0 = terminator; values 1–31 → `ASCII + 64` (so 1='A'…26='Z');
values 32–63 → taken as-is (space, punctuation, digits). Verified against EclDump output.
Source: `packages/engine/src/ecl/disassemble.ts` `decodeEclString()`.

### 2.3 Addressing Model (rvalue vs lvalue)

**rvalue (operand as value):** Used when reading an operand.

```c
rvalue(a):
  if a.code == 0x00: return a.high          // literal immediate
  if a.code == 0x80: return a.high          // inline string marker / text slot
  if a.code == 0x81: return a.word          // runtime memory-string pointer
  if a.code == 0x02: return a.word          // 16-bit immediate literal
  else: return memory[a.word] ?? 0           // dereference: codes 0x01,0x03,0x7F
```

**lvalue (operand as destination address):** For SAVE / arithmetic destination:

```c
addrOf(a): return a.word    // the 16-bit address the operand names
```

Source: `packages/engine/src/ecl/vm.ts` `rvalue()` / `addrOf()` (lines 218–237).

### 2.4 Count-Driven Opcodes

Some opcodes carry a **variable number of extra operands** after their fixed `wordSet` operands.
The `countAt` field in the opcode definition gives the index (within the fixed operands) of the
immediate that tells how many extra operands follow.

| Opcode | Mnemonic | Fixed wordSet | countAt | Extra operands |
|--------|----------|--------------|---------|----------------|
| 0x15 | VERTICAL_MENU | 3 | 2 | `count` inline-string menu items |
| 0x25 | ON_GOTO | 2 | 1 | `count` jump targets |
| 0x26 | ON_GOSUB | 2 | 1 | `count` call targets |
| 0x2B | HORIZONTAL_MENU | 2 | 1 | `count` inline-string menu items |

Source: `packages/engine/src/ecl/opcodes.ts` `countAt` field;
`packages/engine/src/ecl/disassemble.ts` decode loop.

---

## 3. Complete Opcode Table

Source: `packages/engine/src/ecl/opcodes.ts` `KRYNN_GEN1_OPCODES` (derived from EclDump.exe IL).
Confidence: HIGH for all 65 entries. Handler status from `packages/engine/src/ecl/vm.ts`.

| ID | Mnemonic | wordSet | VM Status | Effect |
|----|----------|---------|-----------|--------|
| 0x00 | EXIT | 0 | **IMPLEMENTED** | End execution; return `exited` |
| 0x01 | GOTO | 1 | **IMPLEMENTED** | Unconditional jump to target vaddr (a[0]) |
| 0x02 | GOSUB | 1 | **IMPLEMENTED** | Push return addr, jump to subroutine at target vaddr (a[0]) |
| 0x03 | COMPARE | 2 | **IMPLEMENTED** | Compare rvalue(a[0]) vs rvalue(a[1]); set all 6 cmp flags (==,!=,<,>,<=,>=) |
| 0x04 | ADD | 3 | **IMPLEMENTED** | `mem[addrOf(a[2])] = rvalue(a[0]) + rvalue(a[1])` |
| 0x05 | SUBTRACT | 3 | **IMPLEMENTED** | `mem[addrOf(a[2])] = rvalue(a[1]) - rvalue(a[0])` (op2 − op1, reversed) |
| 0x06 | DIVIDE | 3 | **IMPLEMENTED** | `mem[addrOf(a[2])] = rvalue(a[0]) / rvalue(a[1])` (op1 ÷ op2; 0 if divisor=0) |
| 0x07 | MULTIPLY | 3 | **IMPLEMENTED** | `mem[addrOf(a[2])] = rvalue(a[0]) * rvalue(a[1])` |
| 0x08 | RANDOM | 2 | **IMPLEMENTED** | `mem[addrOf(a[1])] = rand % max(1, rvalue(a[0]))`; LCG RNG |
| 0x09 | SAVE | 2 | **IMPLEMENTED** | `mem[addrOf(a[1])] = rvalue(a[0]) & 0xFFFF` |
| 0x0A | LOAD_CHARACTER | 1 | **IMPLEMENTED** | COAB `CMD_LoadCharacter`: mask bit 7, update the selected one-based party-member index when that member exists, and let later selected-player queries (notably FIND_SPECIAL) read that member's host-supplied affects. Native accepts a seeded party count (`CCECL /N` or `CCECL /G`) for bounds until a DOS roster loader exists |
| 0x0B | LOAD_MONSTER | 3 | **IMPLEMENTED** | Queue monster group: `encounter.push({monsterId=rvalue(a[0])&0xFF, count=max(1,rvalue(a[1])&0xFF), picBlockId=rvalue(a[2])&0xFF})` |
| 0x0C | SETUP_MONSTER | 3 | **IMPLEMENTED** | COAB `CMD_SetupMonster`: configure encounter approach sprite/max-distance/picture and clamp host-supplied encounter distance to the script max; native records sprite/max/pic/current distance in the v7 `GBES` tail and accepts a `CCECL /D` distance seed, defaulting to 0 |
| 0x0D | APPROACH | 0 | **IMPLEMENTED** | COAB `CMD_Approach`: decrement active encounter distance if present; native decrements the v7 `GBES` tracked distance only when it is nonzero |
| 0x0E | PICTURE | 1 | **IMPLEMENTED** | Emit `{type:'picture', id:rvalue(a[0])}` effect — show portrait/illustration |
| 0x0F | INPUT_NUMBER | 2 | **IMPLEMENTED** | Pause for numeric player input → write the answer through operand 2; operand 1 is unused/prompt metadata in DQK's handler. DOS headless writes 0 by default or the `CCECL /L` value; interactive v14 uses count 0 to mean an unrestricted unsigned 16-bit answer. Retail DQK evidence: handler `0x04313c` reads operand 2 at parser slots `[AE6C]/[B187]` and passes it as the write address to `0x040992`; see the Gen2 parser mapping in `decompile-dqk-ecl-dispatch.md`. |
| 0x10 | INPUT_STRING | 2 | **IMPLEMENTED** | Pause for text player input → write bounded uppercase bytes plus NUL at runtime-string `a[1]`; emit `{type:'input', mode:'string'}`. DOS headless writes 0 by default or the `CCECL /L` value; `/!` cold-resumes CCMENU text through GBRS |
| 0x11 | PRINT | 1 | **IMPLEMENTED** | Emit `{type:'print', clear:false, newline:false}`; a[0] is string ref or inline string |
| 0x12 | PRINTCLEAR | 1 | **IMPLEMENTED** | Emit `{type:'print', clear:true, newline:false}`; print and clear the text box |
| 0x13 | RETURN | 0 | **IMPLEMENTED** | Pop call stack → return from GOSUB; if stack empty → EXIT |
| 0x14 | COMPARE_AND | 4 | **IMPLEMENTED** | Set cmpFlags[0]=true (EQ) iff `(rvalue(a[0])==rvalue(a[1])) AND (rvalue(a[2])==rvalue(a[3]))`; else cmpFlags[1]=true (NE); all others false. Source: COAB `CMD_CompareAnd` sub_26B0C |
| 0x15 | VERTICAL_MENU | 3+N | **IMPLEMENTED** | Pause for vertical menu; fixed args = {dest, prompt-string, count}; then `count` inline-string items; result → `addrOf(a[0])`. DOS headless writes item 0 by default or the clamped zero-based `CCECL /C` seed, and preserves the menu shape in `GBSX` |
| 0x16 | IF_EQ | 0 | **IMPLEMENTED** | If cmpFlags[0] (==): execute next instruction; else skip it |
| 0x17 | IF_NE | 0 | **IMPLEMENTED** | If cmpFlags[1] (!=) |
| 0x18 | IF_LT | 0 | **IMPLEMENTED** | If cmpFlags[2] (<) |
| 0x19 | IF_GT | 0 | **IMPLEMENTED** | If cmpFlags[3] (>) |
| 0x1A | IF_LE | 0 | **IMPLEMENTED** | If cmpFlags[4] (<=) |
| 0x1B | IF_GE | 0 | **IMPLEMENTED** | If cmpFlags[5] (>=) |
| 0x1C | CLEARMONSTERS | 0 | **IMPLEMENTED** | Empty the pending encounter roster (no combat queued) |
| 0x1D | Title-specific (`PARTYSTRENGTH` in CoAB/DQK; prompt in DoK) | Varies | **PARTIAL / INCORRECT** | Current shared DOS handler models a one-operand compare and is not a valid cross-title contract. CoAB source computes party strength and writes it to the operand destination; DoK retail consumes zero operands, prompts "Press button or enter to continue," then performs screen cleanup; DQK Gen2 retains its separately evidenced compare behavior. Native implementation must dispatch by title/dialect and preserve each operand frame. |
| 0x1E | CHECKPARTY | 6 | **IMPLEMENTED** | COAB `CMD_CheckParty`: write four query result cells. Supports party-affect presence, thief-skill min/max/average, and movement min/max/average from host-supplied party stats; native defaults to zero but can seed party affects (`/A`) plus repeatable movement (`/M`) and thief-skill (`/K`) values, either directly or through `CCECL /G` |
| 0x1F | UNKNOWN_1F | 2 | **PRESERVED** as unknown event | EclDump: "notsure 0x1f" — no registered handler; semantics UNKNOWN. TS emits `{type:'scriptEffect', kind:'unknown1f', operands}`; DOS `CCECL` preserves opcode/operands in `GBSX` |
| 0x20 | NEWECL | 1 | **IMPLEMENTED** | Chain: load block `rvalue(a[0])`, pass current memory; return `status:'chain'` |
| 0x21 | LOAD_FILES | 3 | **IMPLEMENTED** | Load GEO map: emit `{type:'loadFiles', geoBlockId:rvalue(a[0]), operands:[…]}` |
| 0x22 | PARTY_SURPRISE | title-specific | **IMPLEMENTED** | CoAB's two-operand `CMD_PartySurprise` writes ranger/cleric-ranger results to its two destinations. DQK Gen2 uses an operandless Yes/No prompt: native headless `/C` remains deterministic; `/!` yields through the v14 bridge, resumes with `EQ` for Yes or `NE` for No, and preserves the retail `LE`/`GE` flags. See `decompile-dqk-ecl-dispatch.md` §25.2. |
| 0x23 | SURPRISE | 4 | **IMPLEMENTED** | COAB `CMD_Surprise`: roll two d6 checks, then write the signed-byte-threshold result to `memory[0x02CB]`. DOS native preserves the four operands plus computed result in `GBSX` |
| 0x24 | COMBAT | 0 | **IMPLEMENTED** | Fire combat against encounter roster; emit `{type:'combat', monsters:encounter}`; clear roster; return `status:'combat'` |
| 0x25 | ON_GOTO | 2+N | **IMPLEMENTED** | `selector=rvalue(a[0])`, `count=a[1].word`, jump to `a[2+selector]` target vaddr if in range; else fall through. **0-based selector** |
| 0x26 | ON_GOSUB | 2+N | **IMPLEMENTED** | Same as ON_GOTO but pushes return address (GOSUB semantics) |
| 0x27 | TREASURE | 8 | **IMPLEMENTED** as host event | Decode seven COAB money slots plus `itemBlockId`; emit `{type:'treasure', coins, itemBlockId, itemSource, randomItemCount}`. Host owns inventory/pickup mutation; native still preserves in `GBSX` |
| 0x28 | ROB | 3 | **IMPLEMENTED** as host event | Decode scope, money-loss percent, and item robbery chance; emit `{type:'rob', scope, moneyLossPercent, moneyKeepPercent, itemRobChance}`. Host owns party inventory/money mutation; native still preserves in `GBSX` |
| 0x29 | ENCOUNTER_MENU | 14 | **IMPLEMENTED** (pause) | COAB encounter dialog: setup approach art, offer COMBAT/WAIT/FLEE/ADVANCE or PARLAY, apply the five-value action table to the destination word, and loop on wait/advance. DOS headless chooses COMBAT by default or a clamped zero-based `CCECL /O` action slot, writes the corresponding result, and preserves the 14-operand menu shape in `GBSX` |
| 0x2A | GETTABLE | 3 | **IMPLEMENTED** | COAB `CMD_GetTable`: read `memory[addrOf(a[0]) + byte(rvalue(a[1]))]` into `addrOf(a[2])` |
| 0x2B | HORIZONTAL_MENU | 2+N | **IMPLEMENTED** | Pause for horizontal menu; fixed args = {dest, count}; then `count` inline-string items; result → `addrOf(a[0])`. DOS headless writes item 0 by default or the clamped zero-based `CCECL /C` seed, and preserves the menu shape in `GBSX` |
| 0x2C | PARLAY | 6 | **IMPLEMENTED** | Pause for attitude menu (`HAUGHTY/SLY/NICE/MEEK/ABUSIVE`); write the selected mapped value from operands 0-4 to `addrOf(a[5])`. DOS headless chooses `HAUGHTY` by default or the clamped zero-based `CCECL /Y` seed, and preserves the attitude mapping in `GBSX` |
| 0x2D | CALL | 1 | **IMPLEMENTED** with fallback | Raw-word routine dispatch: Gen1/COAB computes `routineId = operand - 0x7FFF`; Gen2 low raw words (`0x0001`/`0x0002`) are direct ids. Emit `{type:'call', routineId, routine?, operand}` for every id; `routine` is populated for known ids (`0xAE11`, `1`, `2`, `0x3201`, `0x401F`, `0x4019`, `0xE804`). Unknown ids remain structured CALL effects without applying external routine semantics. Native `CCECL` records every CALL as `{rawOperand, routineId}` in `GBSX` |
| 0x2E | DAMAGE | 5 | **IMPLEMENTED** as host event | Decode COAB damage dice and targeting policy; emit `{type:'damage', dice, policy, operands}`. Host owns attack rolls/saves/HP/death/UI; native still preserves in `GBSX` |
| 0x2F | AND | 3 | **IMPLEMENTED** | `r=rvalue(a[0])&rvalue(a[1])`; `mem[addrOf(a[2])]=r&0xFF`; also sets cmpFlags from `{r, 0}` |
| 0x30 | OR | 3 | **IMPLEMENTED** | `r=rvalue(a[0])\|rvalue(a[1])`; `mem[addrOf(a[2])]=r&0xFF`; also sets cmpFlags from `{r, 0}` |
| 0x31 | SPRITE_OFF | 0 | **IMPLEMENTED** | Emit `{type:'spriteOff'}` — hide map sprite |
| 0x32 | FIND_ITEM | 1 | **IMPLEMENTED** | COAB `CMD_FindItem`: set only EQ/NE depending on whether any party member carries item type `rvalue(a[0])`; headless/native default = not found, native can seed items with `CCECL /I` or `CCECL /G` |
| 0x33 | PRINT_RETURN | 0 | **IMPLEMENTED** | Emit `{type:'print', clear:false, newline:true}` (print with newline) |
| 0x34 | ECL_CLOCK | 2 | **IMPLEMENTED** | COAB `CMD_EclClock` reads `timeStep,timeSlot` and calls `step_game_time(timeSlot,timeStep)`; TS advances the pure 7-slot `gameClock`, native preserves both operands in `GBSX` and mutates the persisted seven-slot mixed-radix DOS clock in the v9 `GBCL` tail |
| 0x35 | SAVE_TABLE | 3 | **IMPLEMENTED** | Write `rvalue(a[0])` to `memory[addrOf(a[1]) + rvalue(a[2])]`; DQK `25a4:06d2` selects byte width for base operand types 0/1 and word width for 2/3 (native mirrors this for Gen2; DAX remains word width) |
| 0x36 | ADD_NPC | 2 | **IMPLEMENTED** | Emit `{type:'addNpc', npcId, morale}`; args: npc_id, morale |
| 0x37 | LOAD_PIECES | 3 | **IMPLEMENTED** | Load WALLDEF symbol sets; args=[var3, var2, var1]; apply 0x7F/0xFF/two-set dispatch; emit `{type:'loadPieces', setBlockIds:[…]}` |
| 0x38 | PROGRAM | 1 | **IMPLEMENTED** | Emit `{type:'program', programId:rvalue(a[0])&0xFF}` for host routine dispatch; PROGRAM #0 is CoK StartGameMenu |
| 0x39 | WHO | 1 | **IMPLEMENTED** | Gen1: pause for character selection and write the zero-based result to `addrOf(a[0])`. Gen2: the operand is an inline packed prompt; pause, then update selected-party context without a VM memory write. DOS headless uses `/W` for either form and preserves the dialect-specific event shape in `GBSX`. |
| 0x3A | DELAY | 0 | **IMPLEMENTED** | Emit `{type:'delay'}` — brief visual pause |
| 0x3B | SPELL | 3 | **IMPLEMENTED** | COAB `CMD_Spell`: find `rvalue(a[0])` in host-supplied party spell lists, then write 1-based spell slot to `addrOf(a[1])` and 0-based party index to `addrOf(a[2])`; headless/native empty roster writes `0xFF,0xFF`, native can seed a synthetic member-0 spell list with `CCECL /S`, member-scoped spells with `/V`, or either through `CCECL /G`, and uses `/N` as the absent-spell last-scanned member count |
| 0x3C | PROTECTION | 1 | **IMPLEMENTED** | Clean-room no-op; CoK's copy-protection path is native GAME.OVR code reached through PROGRAM #0, not this ECL opcode |
| 0x3D | CLEAR_BOX | 0 | **IMPLEMENTED** | Emit `{type:'clearBox'}` — clear the text display area |
| 0x3E | DUMP | 0 | **IMPLEMENTED** | Retail/debug diagnostic no-op; consume and continue |
| 0x3F | FIND_SPECIAL | 1 | **IMPLEMENTED** | COAB `CMD_FindSpecial`: set only EQ/NE depending on whether the selected player has affect `rvalue(a[0])`; headless/native default = not found, native can seed party-wide affects with `CCECL /A`, member-scoped affects with `/U`, or either through `CCECL /G` |
| 0x40 | DESTROY_ITEMS | 1 | **IMPLEMENTED** | COAB `CMD_DestroyItems`: remove every party item of type `rvalue(a[0])`; TS updates the host-supplied item-type presence set used by FIND_ITEM, and native clears its seeded `/I` item on a match |

**Totals:** 65 opcodes (0x00–0x40). All 65 are decoded by the TS VM without a
generic unhandled opcode: 64 have known behavior or typed host events, and 1
(`UNKNOWN_1F`) is preserved as a structured unknown event. CALL has raw-preserving
typed dispatch for known and unknown ids; ECL_CLOCK advances the pure
clock; TREASURE/ROB/DAMAGE/CALL/PROGRAM are typed host events. The DOS `CCECL`
bridge preserves ECL_CLOCK `{timeStep, timeSlot}` in `GBSX`, persists its
seven-slot mixed-radix clock in the v9 `GBCL` tail, restores that tail on `/R`,
and preserves deterministic headless input/menu/selection shapes (`INPUT_NUMBER`,
`INPUT_STRING`, `VERTICAL_MENU`, `ENCOUNTER_MENU`, `HORIZONTAL_MENU`,
`PARLAY`, `WHO`), deterministic host-state predicate captures
(`PARTYSTRENGTH`, `PARTY_SURPRISE`, `SURPRISE`), the native-unowned
inventory/HP records (`TREASURE`, `ROB`, `DAMAGE`), every CALL id as
`{rawOperand, routineId}`, PROGRAM dispatch ids, and `UNKNOWN_1F` in `GBSX`,
while still applying no game-state semantics to those preserved records. Only
0x1F still has unknown semantics.

---

## 4. Semantics Detail — Key Opcodes

### 4.1 Control Flow

**GOTO (0x01):** `PC = targetOffset(a[0])`. Non-local jumps (target outside this block's executable
range) are flagged as unhandled and fall through. `inCode(offset)` = `offset >= headerLen AND offset < blockLen`.

**GOSUB (0x02):** Push `nextPC` onto call stack, then `PC = targetOffset(a[0])`. Max depth = call stack capacity.

**RETURN (0x13):** Pop return address; `PC = callStack.pop()`. If stack empty → EXIT.

**NEWECL (0x20):** `blockId = rvalue(a[0])`. Mark finished, return `status:'chain'`. The chain runner
(`program.ts` `runEclChain`) loads block `blockId` from the `BlockSource`, creates a fresh VM sharing
the same `memory` map, and continues. Memory persists across the chain — this is how game state
(area flags, visited markers) accumulates across the full event.

**ON_GOTO (0x25) / ON_GOSUB (0x26):** Jump table. `selector=rvalue(a[0])`, `count=a[1].word`.
Branches to `a[2+selector]`'s vaddr if `0 <= selector < count`; otherwise falls through.
**0-based:** selector value 0 → target at a[2]. CONFIRMED in ECL1 block 34 (backdrop=0=open floor
→ target[0] = wandering monster check at 0x8287). Source: `docs/engine/research/ecl-krynn-gen1-opcodes.md §3.5`.

### 4.2 Comparison and Conditionals

**COMPARE (0x03):** Compares `left=rvalue(a[0])` vs `right=rvalue(a[1])` as integers.
Sets `cmpFlags[6]`:

```
cmpFlags[0] = (left == right)    ; for IF_EQ (0x16)
cmpFlags[1] = (left != right)    ; for IF_NE (0x17)
cmpFlags[2] = (left  < right)    ; for IF_LT (0x18)
cmpFlags[3] = (left  > right)    ; for IF_GT (0x19)
cmpFlags[4] = (left <= right)    ; for IF_LE (0x1A)
cmpFlags[5] = (left >= right)    ; for IF_GE (0x1B)
```

**COMPARE_AND (0x14):** `bothEqual = (rvalue(a[0])==rvalue(a[1])) AND (rvalue(a[2])==rvalue(a[3]))`.
Sets `cmpFlags = [bothEqual, !bothEqual, false, false, false, false]` — ONLY flags[0] and [1] are
set, all others false. This means a following IF_LE/IF_GE will NOT spuriously pass. VERIFIED against
COAB `CMD_CompareAnd` (sub_26B0C). Source: `packages/engine/src/ecl/vm.ts` case 0x14.

**IF_* (0x16–0x1B):** Execute the IMMEDIATELY FOLLOWING instruction iff `cmpFlags[opcode-0x16]`.
If false, skip the next instruction (decode it only to determine its size). The IF_* itself has
wordSet=0 (zero operand bytes). The pattern `COMPARE/COMPARE_AND → IF_* → GOTO/GOSUB/EXIT` is
the standard conditional branch idiom.

### 4.3 Arithmetic

**Operand convention (COAB-verified):** `dest = arg[2]` (last operand), NOT arg[0].

```
ADD      a[2] = rvalue(a[0]) + rvalue(a[1])
SUBTRACT a[2] = rvalue(a[1]) - rvalue(a[0])   ← reversed (op2 − op1)
DIVIDE   a[2] = rvalue(a[0]) / rvalue(a[1])   (0 when divisor=0)
MULTIPLY a[2] = rvalue(a[0]) * rvalue(a[1])
AND      a[2] = rvalue(a[0]) & rvalue(a[1])    + setCompareFlags(result, 0)
OR       a[2] = rvalue(a[0]) | rvalue(a[1])    + setCompareFlags(result, 0)
```

**AND/OR side effect:** also sets `cmpFlags` from `{result, 0}`, so `AND #N, [addr], dest ; IF_NE`
is a valid "test if masked field non-zero" idiom. Source: COAB `CMD_AndOr` sub_26DD0, verified
in `docs/engine/research/dqk-vmrun1-cooldown-c4.2b-2b-2c-iii.md`.

**Note on SUBTRACT direction:** `SUBTRACT #1, [0x97], [0x97]` = decrement `[0x97]` (op2−op1 = `[0x97]−1`).
This is the encounter-cooldown decrement pattern. Easy to get wrong in asm — op1 is the SUBTRAHEND.

### 4.4 Memory Model

The ECL VM uses a **flat sparse 16-bit address space**. All memory is a map `uint16 address → uint16 value`;
unset addresses read as 0. Key confirmed addresses:

**Gen1 (CoK/DoK):**

| Address | Name | How confirmed |
|---------|------|---------------|
| `0x4BE6` | `inDungeon` | ECL1 block 34 `SAVE #0/1, addr:0x4BE6` |
| `0x4BE7` | `AREA_FIELD_1CE` | COAB `field_1CE`; load-pieces two-set test |
| `0x4BE8` | `AREA_FIELD_1D0` | COAB `field_1D0`; load-pieces two-set test |
| `0x4BF2` | `LastEclBlockId` | ECL1 block 34 `SAVE #18, addr:0x4BF2` |
| `0x4C38` | `word_270` | ECL1 block 34 `SAVE #1/0, addr:0x4C38` |
| `0x7F12` | `game_area` | ECL1 block 18 `SAVE #4/5/6, var:0x7F12` |
| `0x7F79` | `mapWallRoof` | ECL1 block 34 `ON_GOTO` dispatch target |
| `0xC04F` | `MAP_CELL_BYTE_ADDR` | `AND 0xC04F,#63,0x7F79` (Gen1 backdrop seeding) |

**Gen2 (DQK):**

| Address | Name | How confirmed |
|---------|------|---------------|
| `0x0011` | facing | `COMPARE_AND [0x00bf],#N,[0x0011],#dir` — facing raw ordinal (N=0,E=1,S=2,W=3) |
| `0x001B` | area number | area-2 teleporter `INPUT_NUMBER → 0x1B` |
| `0x002D` | cell descriptor | `SAVE [0x002d],[0x00cc]`; read-only in ECL (52 reads, 0 writes across all 47 blocks) — HOST populates |
| `0x0097` | encounter cooldown | `SUBTRACT #1,[0x97],[0x97]`; decrement-and-skip pattern |
| `0x00BF` | scratch/partyX | scratch temp; also used as party X in teleporter context |
| `0x00C0` | scratch/partyY | scratch temp; party Y in teleporter context |

Sources: `docs/engine/research/dqk-search-location.md`, `docs/engine/research/combat-trigger-c4.2b-2b-2b.md`,
`docs/engine/research/dqk-vmrun1-cooldown-c4.2b-2b-2c-iii.md`.

### 4.5 Encounter / Combat Opcodes

```
CLEARMONSTERS (0x1C):   encounter_roster = []
LOAD_MONSTER  (0x0B):   encounter_roster.append({monsterId, count, picBlockId})
COMBAT        (0x24):   emit {type:'combat', monsters:encounter_roster}
                        encounter_roster = []
                        return status:'combat'   (host runs fight, then resume())
```

Multiple `LOAD_MONSTER` calls before a single `COMBAT` build a multi-group encounter.
VERIFIED in DQK areas 43 and 66 (3–4 groups). Source: `docs/engine/research/combat-trigger-c4.2b-2b-2b.md §4`.

### 4.6 Text / String Opcodes

| Opcode | Effect | clear | newline |
|--------|--------|-------|---------|
| PRINT (0x11) | Print string; no clear, no newline | false | false |
| PRINTCLEAR (0x12) | Print string AND clear box | true | false |
| PRINT_RETURN (0x33) | Print string with newline | false | true |
| CLEAR_BOX (0x3D) | Clear text box (no print) | — | — |

The string operand (a[0]) is either:
- `code=0x00` (imm) → string table index (string looked up from vocabulary)
- `code=0x80` → inline 6-bit packed string embedded in the instruction stream
- `code=0x01/0x03` → memory value; code `0x02` is a 16-bit immediate and may only be treated as
  an address if the consuming opcode explicitly interprets its value as one.

Source: `packages/engine/src/ecl/vm.ts` cases 0x11, 0x12, 0x33, 0x3D.
The DOS `CCECL` bridge also preserves text events in its v6-format `GBSX` tail:
the fixed event record keeps `{opcode, argc, operands[8]}`, and the parallel
text slot decodes the first inline `code=0x80` packed string for that event to
up to 32 ASCII characters. String-table and runtime memory string references
remain numeric operands until the native host owns the corresponding text table.
`CCEFX.COM` is the DOS-native read-only dump helper for this record; it prints
the `GBEF` header, `GBLF`/`GBLP` map and wall-piece bridge rows, queued
`LOAD_MONSTER` groups, queued `ADD_NPC` joins, the `GBRS` resume summary and
bounded sparse-memory rows, plus each `GBSX` opcode, mnemonic, operands, and
decoded inline text slot so map, script-effect, and resume handoff data can be
inspected inside DOSBox. It also prints the v7 `GBES` setup tail, the v8
`GBHD` halt diagnostic, and the v9 `GBCL` clock slots when present. It decodes the stable
operands for preserved `TREASURE`, `ROB`, `CALL`,
`ECL_CLOCK`, `PROGRAM`, and `DAMAGE` events plus deterministic
`PARTYSTRENGTH`, `PARTY_SURPRISE`, and `SURPRISE` captures into typed human-readable summaries matching the TS host-event interpretation,
without changing the binary `GBSX` format, and accepts an optional output
filename (`CCEFX <effect.gbef> [out.txt]`), which
`GBBOOT /E` uses to leave `_GBECL.TXT` and `_GBRES.TXT` transcripts beside the
binary bridge records when the helper is present. For large fixed-operand
opcodes, `argc` records the true count while the fixed `operands[8]` field
stores the first eight rvalues.
`CCFP /E` also consumes the same v6-format text slots for the Gen1 textured and
DQK/GBWS first-person paths, overlaying the first decoded inline string in the
bottom message band. When no inline text is present, it renders the v9 `GBCL`
clock tail there as a compact `TIME HH:MM DNN` fallback. Its `/S` snapshot mode
dumps the rendered framebuffer as `CCFPVIEW.RAW` for headless verification.

Native `CCECL` v7 appends a separate `GBES` tail for `SETUP_MONSTER`/`APPROACH`
state: sprite id, max-distance, picture id, and current approach distance.
`CCEFX.COM` prints this tail as `GBES setup ...`; the current headless bridge
records the setup operands and uses the renderer/host-owned encounter-distance
seed supplied by `CCECL /D` or `GBBOOT /Q`, defaulting to zero.
`CCFP /E` consumes that `GBES` tail and draws a simple center-view approach
marker scaled by the current distance; full CPIC/sprite encounter art remains a
later renderer subsystem.

### 4.7 Dungeon-Load Opcodes (the CoK exploration path)

These are the opcodes the CoK dungeon-init block (ECL1 block 34) fires on entry. This is the
flow the CCFP first-person exploration depends on.

**LOAD_FILES (0x21):** `operands = [rvalue(a[0]), rvalue(a[1]), rvalue(a[2])]`. Emit
`{type:'loadFiles', geoBlockId:operands[0], operands}`. The host calls `decodeGeoBlock(geoBlockId)`
to load the dungeon map. Source: `packages/engine/src/ecl/vm.ts` case 0x21.

**LOAD_PIECES (0x37):** Resolve three WALLDEF symbol-set block IDs from the raw operands
`[var3, var2, var1]` via the COAB `CMD_LoadFiles` dispatch:

```
Dispatch rules (research §3.3):
  if var3 == 0x7F: setBlockIds = [0x7F, 0xFF, 0xFF]  (default set-1 only; 0x7F → LoadWalldef block 0)
  elif twoSet:     setBlockIds = [var3, 0xFF, var1]   (skip set 2)
  else:            setBlockIds = [var3, var2, var1]   (all three normal)

twoSet = (memory[0x4BE7] != 0) AND (memory[0x4BE8] != 0)
0xFF = Reset/empty that set
```

Emit `{type:'loadPieces', setBlockIds:[…], twoSet}`. Host calls `loadDungeonWalls(setBlockIds)`.
Source: `packages/engine/src/ecl/vm.ts` `resolvePieces()` / case 0x37.

**SAVE (0x09):** `memory[addrOf(a[1])] = rvalue(a[0])`. The block-34 init sequence writes
`inDungeon`, `word_270`, area flags, etc. into the game-data segment before firing
LOAD_FILES/LOAD_PIECES.

---

## 5. Gen1 (CoK/DoK) vs Gen2 (DQK) Differences

**The headline finding:** the ECL instruction set (opcode table, operand framing, 6-bit string
packing) is **IDENTICAL** across Gen1 and Gen2. There is no opcode-framing drift in the bytecode body.
This was confirmed empirically:
- Gen2 `ECL.GLB` contains 47 members; **zero** carry the 0x1388 magic; all use the same opcode framing.
- Disassembling Gen2 blocks produces 166 clean EXIT terminations and 446 inline strings decoding
  to readable English under the Gen1 6-bit rule.
- Running Gen2 scripts through the Gen1 VM (with dialect=Gen2) produces real effects.
- One semantic operand convention differs in real DQK scripts: low raw `CALL` words
  (`0x0001`/`0x0002`) are direct routine ids for the duel setup routines. Gen1 high/vaddr-style
  CALL operands keep the COAB `operand - 0x7FFF` routine-id computation.

Source: `docs/engine/research/ecl-gen2-dqk.md §Opcode table section`;
`packages/engine/src/loaders/eclEncode.ts` module docstring.

### The ONE Structural Difference: Block Header

| Aspect | Gen1 (CoK/DoK) | Gen2 (DQK) |
|--------|---------------|------------|
| Magic word | `0x1388` at bytes 0–1 | **Absent** |
| Far-pointer table starts at | byte 2 | byte 0 |
| Header length | 22 bytes | 20 bytes |
| Code entry byte offset | 22 | 20 |
| Code entry vaddr | 0x8014 | 0x8014 |
| Virtual base (`vbase`) | 0x7FFE | 0x8000 |

**Porting Gen1 → Gen2:** strip the first 2 bytes (the magic word). All virtual addresses in the
body are preserved because vbase rises by 2 simultaneously: `vaddr = vbase + offset` → if offset
decreases by 2 and vbase increases by 2, vaddr is unchanged. Source: `eclEncode.ts` `portGen1EclToGen2()`.

### Data Address Differences (not opcode differences)

The data addresses scripts READ and WRITE differ between the two engine generations:

| Aspect | Gen1 addresses | Gen2 addresses |
|--------|---------------|---------------|
| Cell/backdrop descriptor | `0xC04F` (then derived to `0x7F79`) | `0x002D` (host-populated directly) |
| Party X | N/A (Gen1 uses backdrop byte) | `0x00BF` |
| Party Y | N/A | `0x00C0` |
| Encounter cooldown | varies by area | `0x0097` |
| Facing | N/A (Gen1 backdrop-indexed) | `0x0011` |
| Area number | varies by area | `0x001B` |

**For the asm VM:** the address space is simply a 64KB byte array (or a flat map). The asm host
populates the correct addresses before calling into the ECL VM per step.

### SearchLocation Dispatch Pattern Differences

| | Gen1 (CoK/DoK) | Gen2 (DQK) |
|---|---|---|
| Dispatch variable | `mapWallRoof` at `0x7F79` (AND'd from `0xC04F`) | cell descriptor at `0x002D` |
| How populated | ECL itself derives: `AND [0xC04F],#63,[0x7F79]` | Host writes GEO backdrop byte to `[0x002D]` each step |
| ON_GOTO table | Backdrop byte index (0–63) | Masked and shifted cell-descriptor bits (varies per area) |
| vmRun1 pattern | Simple GOTO 0x8014 (=initial entry) in many areas | Full cell+facing COMPARE_AND dispatch |

Sources: `docs/engine/research/ecl-krynn-gen1-opcodes.md §3.5`;
`docs/engine/research/dqk-vmrun1-cooldown-c4.2b-2b-2c-iii.md` iii(b) results.

---

## 6. Minimal Opcode Subset for CoK Exploration Path

The CoK dungeon-init and step-loop ECL flow (ECL1 block 34, the `loadDungeon` entry) uses the
following opcodes. Implementing this set makes the asm VM run the first-person exploration path.

### Tier 1 — Must-Have (block 34 will not execute without these)

| ID | Mnemonic | Why needed |
|----|----------|-----------|
| 0x00 | EXIT | Terminates all subroutines |
| 0x01 | GOTO | Unconditional branches throughout block 34 |
| 0x02 | GOSUB | Subroutine calls within block 34 |
| 0x03 | COMPARE | Every conditional test |
| 0x09 | SAVE | Writes `inDungeon`, area flags, `game_area`, etc. before load |
| 0x13 | RETURN | Returns from GOSUB |
| 0x16 | IF_EQ | Conditional on COMPARE result |
| 0x1B | IF_GE | Conditional (also: IF_NE, IF_LT, IF_GT, IF_LE for full conditional coverage) |
| 0x20 | NEWECL | Block 34 chains to area-specific blocks at the end |
| 0x21 | LOAD_FILES | Loads the GEO map (core dungeon-load effect) |
| 0x37 | LOAD_PIECES | Loads WALLDEF wall sets (core dungeon-load effect) |
| 0x25 | ON_GOTO | `SearchLocation` dispatch in block 34 is an ON_GOTO over the backdrop table |

### Tier 2 — Needed for step events (SearchLocation / wandering encounters)

| ID | Mnemonic | Why needed |
|----|----------|-----------|
| 0x08 | RANDOM | Wandering-encounter roll (`RANDOM 1..99`) in block 34's SearchLocation |
| 0x11 | PRINT | All text output (room descriptions, encounter text) |
| 0x12 | PRINTCLEAR | Print-and-clear text box |
| 0x33 | PRINT_RETURN | Print with newline |
| 0x3D | CLEAR_BOX | Clear text display |
| 0x1C | CLEARMONSTERS | Clear roster before queuing |
| 0x0B | LOAD_MONSTER | Queue monster group |
| 0x24 | COMBAT | Fire combat — required to run any scripted encounter |
| 0x1D | Title-specific | DoK uses a continue prompt; CoAB writes a computed strength value to memory; DQK Gen2 uses the compare contract described above. Native dispatch is incomplete; do not infer that one behavior applies to all games. |
| 0x2F | AND | Used in backdrop masking (`AND mapWallRoof & 63`) |
| 0x04 | ADD | Arithmetic in event scripts |
| 0x05 | SUBTRACT | Arithmetic (e.g. cooldown decrement) |

### Tier 3 — Needed for full dialogue/encounter coverage

| ID | Mnemonic | Why needed |
|----|----------|-----------|
| 0x14 | COMPARE_AND | DQK vmRun1 cell+facing dispatch; some Gen1 compound conditionals |
| 0x26 | ON_GOSUB | Some areas call subroutines via index table |
| 0x0F | INPUT_NUMBER | Full interactive numeric input UI; DOS headless currently writes 0 or the `CCECL /L` value and preserves the input in `GBSX` |
| 0x10 | INPUT_STRING | Completed for bounded `/!` entry and cold resume; broader string operations beyond runtime-memory versus inline equality remain separate work |
| 0x15 | VERTICAL_MENU | Full interactive player-choice UI; DOS headless currently writes choice 0 or a clamped `CCECL /C` seed and preserves the menu in `GBSX` |
| 0x29 | ENCOUNTER_MENU | Full interactive encounter action UI; DOS headless currently chooses COMBAT or a clamped `CCECL /O` action-slot seed and preserves the menu in `GBSX` |
| 0x2B | HORIZONTAL_MENU | Full interactive player-choice UI; DOS headless currently writes choice 0 or a clamped `CCECL /C` seed and preserves the menu in `GBSX` |
| 0x2C | PARLAY | Full interactive parlay attitude UI; DOS headless currently chooses HAUGHTY or a clamped `CCECL /Y` seed and preserves the mapping in `GBSX` |
| 0x3A | DELAY | Visual pacing between text segments |
| 0x31 | SPRITE_OFF | Hide overland sprite |
| 0x0E | PICTURE | Show portrait/illustration |
| 0x39 | WHO | Gen1 uses a destination operand; Gen2 carries its packed inline prompt and returns the choice through selected-party context. DOS headless selects 0 unless seeded with `CCECL /W`; interactive Gen2 resumes update selected-party state and leave VM memory unchanged. |
| 0x07 | MULTIPLY | Some arithmetic |
| 0x06 | DIVIDE | Some arithmetic |
| 0x30 | OR | Some flag operations |

### What to capture before full subsystem ownership

These remaining cases touch inventory, HP, and external-routine subsystems that
are not yet fully owned by the asm prototype. The TS VM decodes
TREASURE/ROB/DAMAGE/CALL into typed host events; native `CCECL` keeps every CALL
id as raw operand plus routine id, so a host can observe and later apply them
without treating them as generic unhandled no-ops.

| ID | Mnemonic | Missing subsystem |
|----|----------|------------------|
| 0x27 | TREASURE | Native inventory / loot mutation |
| 0x28 | ROB | Native inventory/money mutation |
| 0x2D | CALL | External engine routine dispatch |
| 0x2E | DAMAGE | HP system |

Native `CCECL` now has a deliberately small seed path for party queries before a
real DOS save/roster loader exists: repeatable `/I item`, `/A affect`,
`/U member affect`, `/M move`, `/K thiefSkill`, `/S spell`, and
`/V member spell` values, plus `/N partyCount`, `/H hasRanger`, `/Z partyStrength`, `/L inputValue`, `/C menuChoice`, `/Y parlayChoice`, `/O encounterAction`, `/W whoChoice`, and the compact
`/G seed.gbps` binary sidecar form. `/A` is the party-wide affect set used by
`CHECKPARTY` and the legacy fallback for `FIND_SPECIAL`; `/U` is a one-based
member-scoped affect selected by `LOAD_CHARACTER` before `FIND_SPECIAL`. `/S`
is still a bounded synthetic member-0 spell list; `/V` is a one-based
member-scoped spell list used by `SPELL`; `/N` supplies both
`LOAD_CHARACTER` bounds and the absent-`SPELL` last-scanned member index.
`CCECL /Z strength` supplies the host metric for `PARTYSTRENGTH`, and
`CCECL /D distance` separately supplies the host encounter distance seed for
`SETUP_MONSTER`/`APPROACH`. This is not full inventory or character persistence,
but it lets the query opcodes execute non-empty paths under DOS and keeps the
empty defaults when no party source is supplied. The `GBPS` v1 sidecar is a
fixed 150-byte record: magic/version/flags, optional party-count/ranger/distance
words, count bytes, then bounded arrays for 8 items, 8 party affects, 4
member-affect pairs, 8 movement values, 8 thief-skill values, 16 spells, and 4
member-spell pairs. `GBBOOT /E` can forward the
same values manually; it uses `/F affect`, `/P partyCount`, and `/Q
encounterDistance` as front-door aliases because `/A` is already area override
while `/N` and `/D` are dry-run aliases. `/U member affect` is forwarded as-is,
and scalar host inputs `/Z partyStrength`, `/L inputValue`, `/C menuChoice`, `/Y parlayChoice`, `/O encounterAction`,
plus `/W whoChoice` are forwarded directly as `CCECL /Z`, `CCECL /L`, `CCECL /C`,
`CCECL /Y`, `CCECL /O`, and `CCECL /W`
because they are one-off host metrics/responses rather than roster
sidecar fields. `CCECL /O` uses action slots `0=COMBAT`, `1=WAIT`, `2=FLEE`,
`3=ADVANCE`, and `4=PARLAY`.
`GBBOOT /E` can also populate early native seeds automatically: party count from
CoK `SAVE\CHRDATA1..6.SAV` or DoK `SAVE\CHRDATA1..6.GAM`, up to four unique
carried-item ids from byte `0x2e` in each 63-byte CoK `SAVE\CHRDATA1..6.STF` or
DoK `SAVE\CHRDATA1..6.JNK` inventory record, affect ids from the 9-byte CoK
`SAVE\CHRDATA1..6.SFX` or DoK `SAVE\CHRDATA1..6.EFF` records, up to four
member-scoped affect pairs from those same sidecars using the save slot as the
one-based member id, and up to four unique DoK spell ids from the nonzero bytes
in the verified 34..73 memorized-spell window of each 220-byte
`SAVE\CHRDATA1..6.WIZ` record, plus up to four member-scoped spell pairs from
those same WIZ records using the save slot as the one-based member id. When any
seed is present, `GBBOOT` writes `_GBSEED.BIN` beside `GBBOOT.COM` and launches
`CCECL /G <tools-dir>\_GBSEED.BIN`, with any manual `/Z partyStrength`,
`/C menuChoice`, `/Y parlayChoice`, `/O encounterAction`, `/W whoChoice`, and `/L inputValue`
appended separately, keeping the DOS PSP command tail within 127 bytes even when every
bounded seed class is present. The item bridge is still a bounded
single-list seed for `FIND_ITEM`, and the spell bridge is still capped rather
than a full per-member roster model.

### What remains unknown

This opcode touches engine behavior that is still unknown. Preserve it as a
structured no-op (log + skip, do not crash, do not drop operands):

| ID | Mnemonic | Missing subsystem |
|----|----------|------------------|
| 0x1F | UNKNOWN_1F | Unknown — must not crash |

---

## 7. Concrete NASM Porting Notes

### 7.1 VM State Structure (proposed)

```nasm
; ECL VM state block (example layout for a real-mode 16-bit asm VM)
struc EclVm
  .raw_seg      resw 1    ; segment of the raw ECL block
  .raw_len      resw 1    ; block length in bytes
  .pc           resw 1    ; current program counter (byte offset in block)
  .vbase        resw 1    ; 0x7FFE (Gen1) or 0x8000 (Gen2)
  .header_len   resb 1    ; 22 (Gen1) or 20 (Gen2)
  .cmp_flags    resb 6    ; [EQ,NE,LT,GT,LE,GE]
  .call_sp      resb 1    ; call stack pointer
  .call_stack   resw 16   ; return addresses (32 bytes)
  .rng_state    resd 1    ; LCG state for RANDOM
  .enc_count    resb 1    ; encounter roster fill count
  .enc_slots    resb 48   ; 16 × {monsterId,count,pic} groups (3 bytes each)
  .finished     resb 1    ; 0=running, 1=exited
endstruc

; Memory: a flat 64KB byte array (or a segment for the game-data area)
; The VM reads/writes memory[addr] as uint16 LE.
```

### 7.2 Operand Decode Routine

```nasm
; read_opp: read one EclOpp from [DS:SI], advance SI, return in BX (word value)
; Destroys: AX, BX, CX
read_opp:
  lodsb               ; code = AL
  lodsb               ; high = AL, BX.low = AL
  mov bl, al
  xor bh, bh
  cmp [SP_code], 1    ; save code for caller
  je .three_byte
  cmp [SP_code], 2
  je .three_byte
  cmp [SP_code], 3
  je .three_byte
  ; 2-byte form: word = high (BX already correct)
  ret
.three_byte:
  lodsb               ; val = AL
  mov bh, al          ; word = (val<<8) | high
  ret

; NOTE: for code=0x80 (inline string), caller must skip 'high' additional bytes
; after reading the 2-byte EclOpp.
```

### 7.3 Comparison Flag Set

```nasm
; set_cmp_flags: set all 6 cmp flags from AX (left) vs BX (right)
; memory: [vm_cmp_flags + 0] = EQ, [+1]=NE, [+2]=LT, [+3]=GT, [+4]=LE, [+5]=GE
set_cmp_flags:
  cmp ax, bx
  sete  [cmp_flags+0]
  setne [cmp_flags+1]
  setl  [cmp_flags+2]   ; signed comparison matches original game behaviour
  setg  [cmp_flags+3]
  setle [cmp_flags+4]
  setge [cmp_flags+5]
  ret
```

### 7.4 COMPARE_AND (0x14) — Common Pitfall

Do NOT implement as a single {left,right} comparison. COAB `CMD_CompareAnd` sets ONLY flags[0]
(EQ) and flags[1] (NE) — all others are false. A naively correct "compare both pairs" that also
sets LT/GT/LE/GE will cause IF_LE/IF_GE after COMPARE_AND to spuriously branch.

```nasm
; COMPARE_AND: set flags[0]=(both pairs EQ), flags[1]=NOT flags[0], rest=0
op_compare_and:
  ; read 4 operands into AX(op1),BX(op2),CX(op3),DX(op4)
  cmp ax, bx
  jne .not_equal
  cmp cx, dx
  jne .not_equal
  mov byte [cmp_flags+0], 1   ; EQ
  mov byte [cmp_flags+1], 0
  jmp .zero_rest
.not_equal:
  mov byte [cmp_flags+0], 0
  mov byte [cmp_flags+1], 1   ; NE
.zero_rest:
  mov byte [cmp_flags+2], 0
  mov byte [cmp_flags+3], 0
  mov byte [cmp_flags+4], 0
  mov byte [cmp_flags+5], 0
  ret
```

### 7.5 SUBTRACT Operand Order

`SUBTRACT a[0], a[1] → dest=a[2]` computes `rvalue(a[1]) - rvalue(a[0])`, NOT `a[0]-a[1]`.
This is the "op2 − op1" reversed convention verified in COAB `CMD_AddSubDivMulti`.
A mnemonic: think of it as `dest = a[1] - a[0]` (a[1] is the base, a[0] is what you subtract).

### 7.6 RANDOM LCG

The TS VM uses: `state = (state * 1664525 + 1013904223) & 0xFFFFFFFF` (Numerical Recipes LCG).

```nasm
; next_rand: advance RNG in [rng_state], return random value in EAX
next_rand:
  mov eax, [rng_state]
  imul eax, 1664525
  add  eax, 1013904223
  mov  [rng_state], eax    ; state is 32-bit
  ; result is in EAX; caller mods by range: xor edx,edx; div [range]
  ret
```

Note: the LCG is chosen for reproducibility across test runs; the original game used a different
PRNG (UNKNOWN from disk). The LCG is a clean-room substitute that is deterministic for tests.

### 7.7 GOTO/GOSUB Target Resolution

```nasm
; target_offset: convert vaddr operand to byte offset in block
; IN: BX = operand word value (vaddr)
; OUT: BX = byte offset in block
; Uses: AX = vm.vbase
target_offset:
  cmp bx, [vm_vbase]
  jae .relative          ; vaddr >= vbase: subtract to get offset
  ret                    ; already a byte offset
.relative:
  sub bx, [vm_vbase]
  ret

; bounds check (in_code):
in_code:
  ; BX = candidate offset
  cmp bx, [vm_header_len]
  jb .out               ; below code region
  cmp bx, [vm_raw_len]
  jae .out              ; past end
  ; valid
  ret
.out:
  ; non-local jump — surface as unhandled, advance PC
```

### 7.8 Host Interface Pattern (pause/resume)

The asm VM should model the same pause/resume handshake as the TS VM:

```
Run entry:
  EclVm_Run(vm_ptr) → status code in AX:
    0 = exited
    1 = chain (BX = chainBlockId)
    2 = awaiting-input (BX = destAddr, CX = input mode)
    3 = combat (encounter roster filled)
    4 = halted (fault)

For awaiting-input:
  Host renders menu/input, gets value, stores in BX
  EclVm_Resume(vm_ptr, BX) → status code

For combat:
  Host runs combat, then:
  EclVm_Resume(vm_ptr, 0)

For chain:
  Host loads block BX as new raw segment, constructs new EclVm_Init,
  shares the same memory segment, calls EclVm_Run again.
```

Effects (PRINT, PICTURE, LOAD_FILES, LOAD_PIECES, etc.) can be surfaced as a FIFO effect queue
written to by the VM and drained by the host between steps, or by direct callbacks — either
model works in asm.

The DOS-native `CCECL /E` bridge uses one host-policy refinement on top of the raw VM
fault model: an unknown opcode before `LOAD_FILES` remains `halted`, but an unknown
opcode after a map handoff is treated as a completed native-preview exit. This is
not evidence for an extended Gen2 opcode; it protects the verified map/art bridge
when retail entry scripts fall through or branch into packed data after the
host already received `LOAD_FILES`.

---

## 8. Open Questions / Unknowns

| # | Question | Impact |
|---|----------|--------|
| 1 | Opcode 0x1F semantics (EclDump: "notsure") | Stub-safe; may surface in later event scripts |
| 2 | Native party roster source for PARTY_SURPRISE | Semantics are known; DOS CCECL uses the no-ranger default or `/H` seed until a real roster loader feeds it |
| 3 | EclOpp code 0x09 (flag/predicate byte) exact bit semantics | Appears in COMPARE_AND; currently treated as 2-byte with word=high; may need bit testing |
| 4 | EclOpp code 0x7F (variable type) — confirmed as variable ref with word=high | Used in SAVE (e.g. `SAVE #127, var:0x7EA8`); currently handled as address |
| 5 | Party-strength opcode contracts | CoAB source writes the computed value to an operand destination; DoK is a zero-operand continue prompt; DQK Gen2 compare evidence is separate. The exact CoAB formula/units and DoK helper side effects remain to be recovered. The shared native compare model is not sufficient. |
| 6 | RANDOM — original game's PRNG algorithm | UNKNOWN; TS uses LCG as clean-room substitute; asm can do the same |
| 7 | CHECKPARTY (0x1E) party data source | Semantics are known; DOS CCECL supports `/A`, `/M`, and `/K` seeds, but full per-member thief/affect/movement data still needs a real native party model |
| 8 | Host handling for PROGRAM ids beyond #0 | PROGRAM #0 is StartGameMenu and now surfaces as `{type:'program', programId:0}`; other ids need corpus-backed dispatch before native UI ownership |
| 9 | Gen2 vmRun1 cell-descriptor packing (the `AND/DIVIDE` chain) | The full packing formula per area varies; `[0x002D]` is the host-populated entry point |
| 10 | Arithmetic operand DIRECTION for DIVIDE | `a[2] = a[0] / a[1]` — confirmed by COAB but only one in-engine example found |

---

## 9. Implications for the ASM Engine

1. **One opcode table, two header formats.** The asm dispatch table is identical for Gen1 and Gen2.
   Header parsing uses `header_len` (22 vs 20) and `vbase` (0x7FFE vs 0x8000); CALL also checks
   the Gen2 flag so low raw words `0x0001`/`0x0002` are treated as direct routine ids.

2. **Minimal subset is achievable in ~200 lines of NASM.** Tier-1 opcodes (12 entries) cover the
   dungeon-load path. Tier-1 + Tier-2 (~24 entries) cover wandering encounters and all dungeon text.
   The remaining ~41 opcodes can be no-ops for the initial exploration prototype.

3. **COMPARE_AND is the most critical non-obvious opcode.** It gates most DQK vmRun1 combat
   triggers and must set ONLY flags[0]/[1], not all six. Getting this wrong silently breaks all DQK
   in-world combat.

4. **SUBTRACT is reversed.** `dest = a[1] - a[0]`. This will be wrong in naive implementations.

5. **AND/OR set comparison flags.** The Gen2 cell-descriptor dispatch ends with `AND → IF_NE` as
   the gate pattern; an AND that doesn't update flags will break DQK per-cell dispatch silently.

6. **Memory is shared across NEWECL chains.** The asm chain runner must pass the same memory
   segment pointer to each freshly-loaded block. This is equivalent to the TS `program.ts`
   `runEclChain` sharing the `memory` Map.

7. **Encounter cooldown requires persistent state.** `[0x0097]` in Gen2 (and analogous per-area
   addresses in Gen1) must survive across steps. They live in the shared memory segment — no
   special treatment needed if memory is segment-shared.

8. **No opcode drift between Gen1 and Gen2 in the body.** The ported CoK/DoK ECL blocks run on
   the DQK engine without any opcode translation — only the 2-byte magic-word header needs to be
   stripped. The asm VM can treat both generations identically once the header is parsed.
