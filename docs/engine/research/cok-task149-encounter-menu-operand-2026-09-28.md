# CoK Task 149 — retail encounter-menu operand trace

## Scope and source occurrence

Task 149 asked for one retail opcode-`0x29` ENCOUNTER MENU record, its full
14-operand frame, operand 4 through the setter, and the first downstream reader.
This closes that bounded static trace; it does not claim that this script is
naturally reached in combat.

The selected record is `ECL1.DAX#33`, ECL virtual address `0x851E`, decoded at
`daxdump_extracted/ECL1_033.txt:209`. Its raw opcode byte is at decompressed
offset `0x520` (`0x851E - 0x7FFE`) in the independently decompressed retail
block. The record describes sprite 35, max distance 2, picture 41, variable
`0x7F79`, the five result entries `[0, 3, 0, 3, 4]`, three inline messages,
and trailing values 12 and 12.

## Encoded operands

The retail descriptor-2 opcode-`0x29` handler at `GAME.OVR:0x2D51` requests 14
operands through parser `0x8A73`. Parser indexing is one-based. For each
operand, the parser stores its type at `DS:0x736D+i` and second byte at
`DS:0x73ED+i`; type 1/2/3 and `0x81` also store the third byte at
`DS:0x73AD+i`. Inline type-`0x80` operands consume their following packed bytes.

| Operand | Retail bytes | Decode |
| --- | --- | --- |
| 1 | `00 23` | immediate `0x23` (sprite 35) |
| 2 | `00 02` | immediate `2` (max distance) |
| 3 | `00 29` | immediate `0x29` (picture 41) |
| 4 | `01 79 7F` | type-1 word reference `0x7F79` |
| 5 | `00 00` | immediate `0` |
| 6 | `00 03` | immediate `3` |
| 7 | `00 00` | immediate `0` |
| 8 | `00 03` | immediate `3` |
| 9 | `00 04` | immediate `4` |
| 10 | `80 1C` + 28 packed bytes | inline message 1, “HE MOTIONS AND OTHER PEOPLE JOIN HIM.” |
| 11 | `80 0F` + 15 packed bytes | inline message 2, “A CLERIC APPROACHES.” |
| 12 | `80 1A` + 26 packed bytes | inline message 3, “YOU SEE A CLERIC ROUND THE CORNER.” |
| 13 | `00 0C` | immediate `12` |
| 14 | `00 0C` | immediate `12` |

The encoded end is offset `0x583`, virtual address `0x8581`, where the next
retail ECL opcode is `0x25 ON GOTO`.

## Setter and first downstream reader

At handler offset `0x2DAC`, the implementation reads one-based operand 4 from
`DS:0x73F1` and `DS:0x73B1`, then calls descriptor-4E helper `0x4D` at
`0x2DB4`. For this occurrence the type-1 three-byte operand populated both
cache lanes, yielding address `0x7F79`; the handler saves it at `[BP-0x43D]`.
Its menu/result branches call descriptor-4E procedure `0x52` at sites
`0x30A5`, `0x30BE`, and `0x30CD`, passing that saved address and a result byte.

Procedure `0x52` resolves to setter `0x9847`. Its classifier `0x9159` returns
class 1 for `0x7C00..0x7FFF`, so `0x7F79` is not event-buffer class 3. The
class-1 setter stores the result word at `ES:[DI+0x0800]`, where `DI` is twice
the logical address and `ES` is the area pointer at `DS:0x4B2C`. With 16-bit
offset wraparound, `2 * 0x7F79 + 0x0800 = 0x06F2`; therefore this store updates
the area word at offset `0x06F2`.

The first downstream reader is the immediately following ECL instruction at
`0x8581`: `ON GOTO area2.word_6F2 of [0x8700, 0x8695, 0x8228, 0x8593]`, as
shown in `daxdump_extracted/ECL1_033.txt`. This establishes the retail data
contract from the menu result setter to its first reader. It does not establish
the runtime-selected branch or natural combat reachability. No DOSBox or GUI
was used.
