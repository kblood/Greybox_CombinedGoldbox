#!/usr/bin/env python3
"""Decode DQK CA03 tracer stream windows as Gen2 ECL.

Input is a CSV produced by:

  tools/unicorn_dqk_trace.py --watch-ca03-operands --watch-output ...

The CA03 rows include two stream byte views. For the current DQK route, the
wrapped real-mode view (`stream_wrap_at`) is the useful one:

  stream_wrap_phys = ae5e*16 + ((ae5c + b7f9) & 0xffff)

This helper decodes that byte window using the same opcode/operand framing
documented in packages/engine/src/ecl/disassemble.ts.
"""

from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass


@dataclass(frozen=True)
class Opcode:
    word_set: int
    mnemonic: str
    count_at: int | None = None
    # Fixed bytes consumed after the operand frames. Only per-title extended opcodes use this;
    # every opcode in the shared 0x00-0x40 table below leaves it at 0.
    trailing_bytes: int = 0


OPCODES: dict[int, Opcode] = {
    0x00: Opcode(0, "EXIT"),
    0x01: Opcode(1, "GOTO"),
    0x02: Opcode(1, "GOSUB"),
    0x03: Opcode(2, "COMPARE"),
    0x04: Opcode(3, "ADD"),
    0x05: Opcode(3, "SUBTRACT"),
    0x06: Opcode(3, "DIVIDE"),
    0x07: Opcode(3, "MULTIPLY"),
    0x08: Opcode(2, "RANDOM"),
    0x09: Opcode(2, "SAVE"),
    0x0A: Opcode(1, "LOAD_CHARACTER"),
    0x0B: Opcode(3, "LOAD_MONSTER"),
    0x0C: Opcode(3, "SETUP_MONSTER"),
    0x0D: Opcode(0, "APPROACH"),
    0x0E: Opcode(1, "PICTURE"),
    0x0F: Opcode(2, "INPUT_NUMBER"),
    0x10: Opcode(2, "INPUT_STRING"),
    0x11: Opcode(1, "PRINT"),
    0x12: Opcode(1, "PRINTCLEAR"),
    0x13: Opcode(0, "RETURN"),
    0x14: Opcode(4, "COMPARE_AND"),
    0x15: Opcode(3, "VERTICAL_MENU", 2),
    0x16: Opcode(0, "IF_EQ"),
    0x17: Opcode(0, "IF_NE"),
    0x18: Opcode(0, "IF_LT"),
    0x19: Opcode(0, "IF_GT"),
    0x1A: Opcode(0, "IF_LE"),
    0x1B: Opcode(0, "IF_GE"),
    0x1C: Opcode(0, "CLEARMONSTERS"),
    # DQK Gen2 runtime traces show 0x1d advances only one byte in this dialect.
    # Gen1's one-operand PARTYSTRENGTH frame misreads the next opcode as an operand.
    0x1D: Opcode(0, "PARTYSTRENGTH"),
    0x1E: Opcode(6, "CHECKPARTY"),
    0x1F: Opcode(2, "UNKNOWN_1F"),
    0x20: Opcode(1, "NEWECL"),
    # DQK Gen2 LOAD_FILES short form: two operands.
    0x21: Opcode(2, "LOAD_FILES"),
    0x22: Opcode(2, "PARTY_SURPRISE"),
    0x23: Opcode(4, "SURPRISE"),
    0x24: Opcode(0, "COMBAT"),
    0x25: Opcode(2, "ON_GOTO", 1),
    0x26: Opcode(2, "ON_GOSUB", 1),
    0x27: Opcode(8, "TREASURE"),
    0x28: Opcode(3, "ROB"),
    0x29: Opcode(14, "ENCOUNTER_MENU"),
    0x2A: Opcode(3, "GETTABLE"),
    0x2B: Opcode(2, "HORIZONTAL_MENU", 1),
    # DQK Gen2 PARLAY short form: four operands.
    0x2C: Opcode(4, "PARLAY"),
    0x2D: Opcode(1, "CALL"),
    0x2E: Opcode(5, "DAMAGE"),
    0x2F: Opcode(3, "AND"),
    0x30: Opcode(3, "OR"),
    0x31: Opcode(0, "SPRITE_OFF"),
    0x32: Opcode(1, "FIND_ITEM"),
    0x33: Opcode(0, "PRINT_RETURN"),
    0x34: Opcode(2, "ECL_CLOCK"),
    0x35: Opcode(3, "SAVE_TABLE"),
    0x36: Opcode(2, "ADD_NPC"),
    0x37: Opcode(3, "LOAD_PIECES"),
    0x38: Opcode(1, "PROGRAM"),
    0x39: Opcode(1, "WHO"),
    0x3A: Opcode(0, "DELAY"),
    0x3B: Opcode(3, "SPELL"),
    0x3C: Opcode(1, "PROTECTION"),
    0x3D: Opcode(0, "CLEAR_BOX"),
    0x3E: Opcode(0, "DUMP"),
    0x3F: Opcode(1, "FIND_SPECIAL"),
    0x40: Opcode(1, "DESTROY_ITEMS"),
}


def decode_ecl_string(raw: bytes) -> str:
    acc = 0
    bits = 0
    out: list[str] = []
    for b in raw:
        acc = ((acc << 8) | b) & 0xFFFFFF
        bits += 8
        while bits >= 6:
            bits -= 6
            v = (acc >> bits) & 0x3F
            if v == 0:
                return "".join(out)
            out.append(chr(v + 64 if 1 <= v <= 31 else v))
    return "".join(out)


def read_opp(data: bytes, pos: int) -> tuple[str, int, int | None]:
    if pos + 2 > len(data):
        return "<truncated-opp>", pos, None
    code = data[pos]
    high = data[pos + 1]
    pos += 2
    val = None
    if code in (0x01, 0x02, 0x03, 0x81):
        if pos >= len(data):
            return "<truncated-word>", pos, None
        val = data[pos]
        pos += 1
        word = ((val << 8) | high) & 0xFFFF
    else:
        word = high

    if code == 0x00:
        return f"#{word}", pos, word
    if code == 0x02:
        return f"#{word}", pos, word
    if code in (0x01, 0x03):
        return f"0x{word:04x}", pos, word
    if code == 0x80:
        raw = data[pos:pos + high]
        text = decode_ecl_string(raw)
        pos += high
        suffix = f' "{text}"' if text else ""
        return f"str[{high}]{suffix}", pos, word
    if code == 0x81:
        return f"memstr[0x{word:04x}]", pos, word
    if code == 0x09:
        return f"flag:{word}", pos, word
    return f"c{code:02x}:{word}", pos, word


def decode_window(data: bytes, vaddr: int, max_instructions: int) -> list[str]:
    pos = 0
    out: list[str] = []
    for _ in range(max_instructions):
        if pos >= len(data):
            break
        here = vaddr + pos
        op = data[pos]
        spec = OPCODES.get(op)
        if spec is None:
            out.append(f"{here:04x}: BAD 0x{op:02x}")
            break
        pos += 1
        args: list[str] = []
        numeric: list[int | None] = []
        for _arg in range(spec.word_set):
            text, pos, word = read_opp(data, pos)
            args.append(text)
            numeric.append(word)
            if text.startswith("<truncated"):
                break
        if spec.count_at is not None and spec.count_at < len(numeric):
            count = numeric[spec.count_at] or 0
            for _extra in range(count):
                text, pos, _word = read_opp(data, pos)
                args.append(text)
                if text.startswith("<truncated"):
                    break
        out.append(f"{here:04x}: {spec.mnemonic}" + (f" {', '.join(args)}" if args else ""))
        if op == 0x00:
            break
    return out


def parse_hex_window(value: str) -> bytes:
    return bytes.fromhex(value.strip()) if value and value.strip() else b""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_path")
    ap.add_argument("--max-instructions", type=int, default=4)
    args = ap.parse_args()

    with open(args.csv_path, newline="") as f:
        for row in csv.DictReader(f):
            b7f9 = int(row["b7f9"], 16)
            data = parse_hex_window(row.get("stream_wrap_at", ""))
            print(
                "instr=%s watch=%s op1=%s op2=%s old-ca03=%s b7f9=0x%04x wrap=%s"
                % (
                    row.get("instr", ""),
                    row.get("watch", ""),
                    row.get("op1_local", ""),
                    row.get("op2_local", ""),
                    row.get("ca03", ""),
                    b7f9,
                    row.get("stream_wrap_phys", ""),
                )
            )
            for line in decode_window(data, b7f9, args.max_instructions):
                print("  " + line)
            print()


if __name__ == "__main__":
    main()
