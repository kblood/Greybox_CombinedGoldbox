#!/usr/bin/env python3
"""A small 6502 disassembler, for reading the C64 Gold Box executables.

The project already disassembles the DOS (x86) and Amiga (68000) builds; this is the third
instruction set. It exists because the C64 full-screen picture format could not be settled by
fitting layouts to file sizes -- see docs/engine/research/c64-disk-format.md section 7.4 -- and the
technique that has worked before on this project is to read the code that consumes the data.

Deliberately minimal: documented NMOS 6502 only, no illegal opcodes (they are decoded as `.byte`
so a wrong entry point degrades into visible noise rather than plausible-looking fiction), and no
symbol tracking. Enough to follow a load-and-blit routine.

Usage:
    python tools/c64_disasm.py FILE.prg [--org 0xC000] [--start 0x1234] [--count 80]
    python tools/c64_disasm.py FILE.prg --find-stores D021,D022

A C64 `PRG` begins with its little-endian load address, which is used as the origin unless --org
overrides it. Note that for this corpus the stored address is almost always $4000, a staging
buffer, so code files must be given their real origin explicitly.
"""

from __future__ import annotations

import argparse
from pathlib import Path

IMP, ACC, IMM, ZP, ZPX, ZPY, ABS, ABX, ABY, IND, IZX, IZY, REL = (
    "imp", "acc", "imm", "zp", "zpx", "zpy", "abs", "abx", "aby", "ind", "izx", "izy", "rel",
)

SIZE = {IMP: 1, ACC: 1, IMM: 2, ZP: 2, ZPX: 2, ZPY: 2, REL: 2,
        ABS: 3, ABX: 3, ABY: 3, IND: 3, IZX: 2, IZY: 2}

OPCODES: dict[int, tuple[str, str]] = {
    0x00: ("BRK", IMP), 0x01: ("ORA", IZX), 0x05: ("ORA", ZP), 0x06: ("ASL", ZP),
    0x08: ("PHP", IMP), 0x09: ("ORA", IMM), 0x0A: ("ASL", ACC), 0x0D: ("ORA", ABS),
    0x0E: ("ASL", ABS), 0x10: ("BPL", REL), 0x11: ("ORA", IZY), 0x15: ("ORA", ZPX),
    0x16: ("ASL", ZPX), 0x18: ("CLC", IMP), 0x19: ("ORA", ABY), 0x1D: ("ORA", ABX),
    0x1E: ("ASL", ABX), 0x20: ("JSR", ABS), 0x21: ("AND", IZX), 0x24: ("BIT", ZP),
    0x25: ("AND", ZP), 0x26: ("ROL", ZP), 0x28: ("PLP", IMP), 0x29: ("AND", IMM),
    0x2A: ("ROL", ACC), 0x2C: ("BIT", ABS), 0x2D: ("AND", ABS), 0x2E: ("ROL", ABS),
    0x30: ("BMI", REL), 0x31: ("AND", IZY), 0x35: ("AND", ZPX), 0x36: ("ROL", ZPX),
    0x38: ("SEC", IMP), 0x39: ("AND", ABY), 0x3D: ("AND", ABX), 0x3E: ("ROL", ABX),
    0x40: ("RTI", IMP), 0x41: ("EOR", IZX), 0x45: ("EOR", ZP), 0x46: ("LSR", ZP),
    0x48: ("PHA", IMP), 0x49: ("EOR", IMM), 0x4A: ("LSR", ACC), 0x4C: ("JMP", ABS),
    0x4D: ("EOR", ABS), 0x4E: ("LSR", ABS), 0x50: ("BVC", REL), 0x51: ("EOR", IZY),
    0x55: ("EOR", ZPX), 0x56: ("LSR", ZPX), 0x58: ("CLI", IMP), 0x59: ("EOR", ABY),
    0x5D: ("EOR", ABX), 0x5E: ("LSR", ABX), 0x60: ("RTS", IMP), 0x61: ("ADC", IZX),
    0x65: ("ADC", ZP), 0x66: ("ROR", ZP), 0x68: ("PLA", IMP), 0x69: ("ADC", IMM),
    0x6A: ("ROR", ACC), 0x6C: ("JMP", IND), 0x6D: ("ADC", ABS), 0x6E: ("ROR", ABS),
    0x70: ("BVS", REL), 0x71: ("ADC", IZY), 0x75: ("ADC", ZPX), 0x76: ("ROR", ZPX),
    0x78: ("SEI", IMP), 0x79: ("ADC", ABY), 0x7D: ("ADC", ABX), 0x7E: ("ROR", ABX),
    0x81: ("STA", IZX), 0x84: ("STY", ZP), 0x85: ("STA", ZP), 0x86: ("STX", ZP),
    0x88: ("DEY", IMP), 0x8A: ("TXA", IMP), 0x8C: ("STY", ABS), 0x8D: ("STA", ABS),
    0x8E: ("STX", ABS), 0x90: ("BCC", REL), 0x91: ("STA", IZY), 0x94: ("STY", ZPX),
    0x95: ("STA", ZPX), 0x96: ("STX", ZPY), 0x98: ("TYA", IMP), 0x99: ("STA", ABY),
    0x9A: ("TXS", IMP), 0x9D: ("STA", ABX), 0xA0: ("LDY", IMM), 0xA1: ("LDA", IZX),
    0xA2: ("LDX", IMM), 0xA4: ("LDY", ZP), 0xA5: ("LDA", ZP), 0xA6: ("LDX", ZP),
    0xA8: ("TAY", IMP), 0xA9: ("LDA", IMM), 0xAA: ("TAX", IMP), 0xAC: ("LDY", ABS),
    0xAD: ("LDA", ABS), 0xAE: ("LDX", ABS), 0xB0: ("BCS", REL), 0xB1: ("LDA", IZY),
    0xB4: ("LDY", ZPX), 0xB5: ("LDA", ZPX), 0xB6: ("LDX", ZPY), 0xB8: ("CLV", IMP),
    0xB9: ("LDA", ABY), 0xBA: ("TSX", IMP), 0xBC: ("LDY", ABX), 0xBD: ("LDA", ABX),
    0xBE: ("LDX", ABY), 0xC0: ("CPY", IMM), 0xC1: ("CMP", IZX), 0xC4: ("CPY", ZP),
    0xC5: ("CMP", ZP), 0xC6: ("DEC", ZP), 0xC8: ("INY", IMP), 0xC9: ("CMP", IMM),
    0xCA: ("DEX", IMP), 0xCC: ("CPY", ABS), 0xCD: ("CMP", ABS), 0xCE: ("DEC", ABS),
    0xD0: ("BNE", REL), 0xD1: ("CMP", IZY), 0xD5: ("CMP", ZPX), 0xD6: ("DEC", ZPX),
    0xD8: ("CLD", IMP), 0xD9: ("CMP", ABY), 0xDD: ("CMP", ABX), 0xDE: ("DEC", ABX),
    0xE0: ("CPX", IMM), 0xE1: ("SBC", IZX), 0xE4: ("CPX", ZP), 0xE5: ("SBC", ZP),
    0xE6: ("INC", ZP), 0xE8: ("INX", IMP), 0xE9: ("SBC", IMM), 0xEA: ("NOP", IMP),
    0xEC: ("CPX", ABS), 0xED: ("SBC", ABS), 0xEE: ("INC", ABS), 0xF0: ("BEQ", REL),
    0xF1: ("SBC", IZY), 0xF5: ("SBC", ZPX), 0xF6: ("INC", ZPX), 0xF8: ("SED", IMP),
    0xF9: ("SBC", ABY), 0xFD: ("SBC", ABX), 0xFE: ("INC", ABX),
}

# The handful of hardware addresses that make C64 graphics code readable at a glance.
NAMES = {
    0xD011: "VIC_CTRL1", 0xD012: "VIC_RASTER", 0xD016: "VIC_CTRL2", 0xD018: "VIC_MEMPTR",
    0xD019: "VIC_IRQ", 0xD01A: "VIC_IRQMASK", 0xD020: "VIC_BORDER", 0xD021: "VIC_BG0",
    0xD022: "VIC_BG1", 0xD023: "VIC_BG2", 0xD024: "VIC_BG3", 0xDD00: "CIA2_PORTA",
    0xD418: "SID_VOL", 0x0314: "IRQ_VEC",
}


def operand(mode: str, lo: int, hi: int, pc: int) -> tuple[str, int | None]:
    """Render an operand and return the absolute address it names, when it names one."""
    if mode == IMP:
        return "", None
    if mode == ACC:
        return "A", None
    if mode == IMM:
        return f"#${lo:02X}", None
    if mode == REL:
        target = (pc + 2 + (lo - 256 if lo > 127 else lo)) & 0xFFFF
        return f"${target:04X}", target
    if mode in (ZP, ZPX, ZPY, IZX, IZY):
        suffix = {ZP: "", ZPX: ",X", ZPY: ",Y", IZX: ",X)", IZY: "),Y"}[mode]
        open_ = "(" if mode in (IZX, IZY) else ""
        return f"{open_}${lo:02X}{suffix}", lo
    addr = lo | (hi << 8)
    label = NAMES.get(addr, f"${addr:04X}")
    suffix = {ABS: "", ABX: ",X", ABY: ",Y", IND: ")"}[mode]
    open_ = "(" if mode == IND else ""
    return f"{open_}{label}{suffix}", addr


def disassemble(data: bytes, org: int, start: int = 0, count: int = 60) -> list[str]:
    out: list[str] = []
    pc = start
    while pc < len(data) and len(out) < count:
        op = data[pc]
        entry = OPCODES.get(op)
        if entry is None:
            out.append(f"{org + pc:04X}  {op:02X}           .byte ${op:02X}")
            pc += 1
            continue
        mnem, mode = entry
        n = SIZE[mode]
        if pc + n > len(data):
            out.append(f"{org + pc:04X}  {op:02X}           .byte ${op:02X}")
            pc += 1
            continue
        lo = data[pc + 1] if n > 1 else 0
        hi = data[pc + 2] if n > 2 else 0
        text, _ = operand(mode, lo, hi, org + pc)
        raw = " ".join(f"{b:02X}" for b in data[pc:pc + n])
        out.append(f"{org + pc:04X}  {raw:<9}  {mnem} {text}".rstrip())
        pc += n
    return out


def find_stores(data: bytes, org: int, targets: set[int]) -> list[int]:
    """Offsets of absolute stores/loads naming any of `targets`. Not decode-accurate: a byte pair
    inside an operand can alias an opcode, so treat hits as candidates and disassemble around them.
    """
    hits = []
    for i in range(len(data) - 2):
        entry = OPCODES.get(data[i])
        if not entry or entry[1] not in (ABS, ABX, ABY):
            continue
        if (data[i + 1] | (data[i + 2] << 8)) in targets:
            hits.append(i)
    return hits


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("file", type=Path)
    ap.add_argument("--org", type=lambda s: int(s, 0), default=None,
                    help="origin; defaults to the PRG load address")
    ap.add_argument("--raw", action="store_true", help="no 2-byte load address in this file")
    ap.add_argument("--start", type=lambda s: int(s, 0), default=None, help="absolute address")
    ap.add_argument("--count", type=int, default=60)
    ap.add_argument("--find", default=None,
                    help="comma-separated hex addresses; report candidate references")
    a = ap.parse_args()

    blob = a.file.read_bytes()
    if a.raw:
        org, data = (a.org or 0), blob
    else:
        org, data = (a.org if a.org is not None else int.from_bytes(blob[:2], "little")), blob[2:]

    if a.find:
        targets = {int(t, 16) for t in a.find.split(",")}
        for off in find_stores(data, org, targets):
            print(f"--- candidate reference at ${org + off:04X} ---")
            begin = max(0, off - 12)
            for line in disassemble(data, org, begin, 14):
                print("  " + line)
        return 0

    start = 0 if a.start is None else a.start - org
    for line in disassemble(data, org, start, a.count):
        print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
