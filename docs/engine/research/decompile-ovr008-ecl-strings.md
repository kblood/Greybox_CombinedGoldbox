# Decompile — ovr008: ECL compressed-string codec & string memory (Krynn)

> Loop iteration 13 of `decompile-worklist.md` (second-tier; upgrades the PARTIAL ovr008
> entry to DONE). Subsystem: **the ECL VM's text codec** — how dialogue/menu strings are
> packed into the ECL bytecode and unpacked at run time, plus the typed string-memory
> address map the VM reads from. Primary source: COAB `coab_extracted/engine/ovr008.cs` —
> `compressString`, `DecompressString`, `inflateChar`, `deflateChar`, `LoadCompressedEclString`
> = `sub_31?` , `vm_CopyStringFromMemory` = `sub_31421`, `vm_GetMemoryValueType` = `sub_30723`.
> Cross-checked against the engine's ECL VM (task #10) and `ecl-krynn-gen1-opcodes.md`.

## The codec — 6-bit packed text — VERIFIED (round-tripped)

ECL strings are stored as a **6-bit packed character stream**: every character is mapped to a
6-bit value and four such values are packed into three bytes (75 % of ASCII size). This is the
codec the PRINT/PRINTCLEAR opcodes consume.

### Character remap — `deflateChar` / `inflateChar`

```
deflate(ch):  v = ord(ch);  if v >= 0x40: v -= 0x40;  return v & 0x3F   // pack
inflate(v):   if v <= 0x1F: v += 0x40;  return chr(v)                    // unpack
```

So letters fold into the low range (`'A'`=0x41 → 1 … `'Z'`=0x5A → 0x1A) while space/digits/
punctuation (0x20–0x3F) pass through unchanged. **Value 0 is a terminator/skip** — the
decoder never emits it (`if (curr != 0) append`). The map is reversible for the printable set
the games use (uppercase + space + digits + common punctuation).

### Bit packing — 4 chars ⇄ 3 bytes

`compressString` walks a 4-state machine, each 6-bit value `b` straddling byte boundaries:

```
state 1:  byte[n]   = b << 2                       // [c0:6 | c1_hi:2]
state 2:  byte[n-1]|= b >> 4 ;  byte[n] = b << 4    // [c1_lo:4 | c2_hi:4]
state 3:  byte[n-1]|= b >> 2 ;  byte[n] = b << 6    // [c2_lo:2 | c3:6]
state 4:  byte[n-1]|= b                             // (no new byte) → back to state 1
```

`DecompressString` is the exact inverse (`(prev<<4)|(cur>>4)` etc.), masking `& 0x3F` each
step. Buffer size is `(len*3)/4 + 1`.

**Verification:** a faithful Python reimplementation round-trips every test string
byte-for-byte —
`"A BATTLE BEGINS"` → `06 00 81 51 43 05 80 21 47 24 e4 c0` → `"A BATTLE BEGINS"`;
`"PALADINS DO NOT JOIN WITH EVIL SCUM"` round-trips at ratio 0.77; bit-layout proof for
`"ABCD"` (0x01/02/03/04) → `04 20 c4 00`. All four states confirmed.

## Loading a string from the ECL stream — `LoadCompressedEclString`

A compressed string literal lives inline in the ECL bytecode. The loader reads `inputLength`
bytes from `ecl_ptr[ecl_offset + 0x8000 + 1 + i]`, advances `ecl_offset` past them, and stores
`DecompressString(data)` into the VM's string slot `unk_1D972[strIndex]` (the ECL VM has a small
bank of string registers the print/compare opcodes operate on). So a PRINT-string opcode is
`[opcode][len][len bytes of 6-bit-packed text]`.

## Typed string memory — `vm_GetMemoryValueType` / `vm_CopyStringFromMemory` — VERIFIED

When an opcode references a string **by memory location** (not an inline literal), the VM
classifies the 16-bit address into one of four typed regions and reads a NUL-terminated string
from the matching backing store:

| address range | type | source |
| --- | --- | --- |
| `0x4B00–0x4EFF` | 0 | area record (`area_ptr.field_6A00`, word-indexed) |
| `0x7C00–0x7FFF` | 1 | area2 record (`area2_ptr.field_800`); **`0x7C00` = the selected player's name** |
| `0x7A00–0x7BFF` | 2 | global string table (`stru_1B2CA + 0x0C00`) |
| `0x8000–0x9DFF` | 3 | the ECL block itself (`ecl_ptr + 0x8000`) |

This is the addressing the ECL `PRINT`/`COMPARE`/`SAVE`-string opcodes use to splice dynamic
text (player names, area variables) into dialogue — e.g. `"<player> will tolerate no evil!"`.
`compare_strings` (sub_3193B) then sets the six `compare_flags` (==,!=,<,>,<=,>=) consumed by
the IF_* opcodes.

## Krynn-binary anchor

The codec is pure bit-twiddling with no literals, so it has no string anchor; it is reached
from the ECL interpreter's PRINT path (ovr003 `CMD_Print`/`CMD_PrintClear`, opcodes 0x11/0x12)
and the `0x8000` ECL-window base ties it to the ECL block loader (`load_ecl_dax`,
`ecl_ptr[... + 0x8000]`). The codec itself is COAB-authoritative and now independently
**verified by round-trip**; the address-range table is the VM's `vm_GetMemoryValueType` constant
set.

## Engine cross-check — reviewed 2026-10-11

`packages/engine/src/ecl/disassemble.ts` implements the six-bit literal decoder in
`decodeEclString`; `vm.ts` resolves runtime-string operands and maintains comparison
flags, including string SAVE/COMPARE behavior. These are existing implementations,
superseding the original request to check whether any literal codec exists.

The address table above is the CoAB reference. Selected-character memory and global cells
are title/host specific; `vm.ts` exposes corresponding hooks and the newer Secret field
contract is in `secret-who-contract.md`. A codec match does not prove every memory window
or selected-character field has a product caller.

## Gen1 ↔ Gen2

The 6-bit codec and the typed string-memory map are part of the shared ECL VM, so they carry
across CoK/DoK/DQK. DQK (Gen2) stores ECL in HLIB `DATA` rather than DAX (see
`decompile-dqk-ecl-dispatch.md`) and its memory-region bases may shift with the wider Gen2
records, but the **packing scheme is identical** (4 chars ⇄ 3 bytes, same remap) — a Gen2 ECL
string decodes with the same `DecompressString`.
