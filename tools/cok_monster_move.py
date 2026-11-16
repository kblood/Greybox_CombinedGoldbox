#!/usr/bin/env python3
"""CoK monster movement from the MON record (NATIVE-TASKS Task 113).

Champions of Krynn (GAME.OVR) copies the 409-byte MON record's byte +0xD5 into
combatant field +0x198 (retail stores at file offsets 0x3755D and, for the armour
weight path, 0x3681B).  CalcMoves (0x14EB7) reads +0x198, clamps anything outside
1..96 to 1, and doubles it to half-squares.  Orthogonal steps cost 2 half-squares,
diagonal steps 3, so squares per round equal the record byte.

    python tools/cok_monster_move.py            # census of the retail MON1-3CHA records
"""
from __future__ import annotations

import collections
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.dirname(HERE)
COK = os.path.join(REPO, "Champions of Krynn")

MOVE_OFFSET = 0xD5   # 213
RECORD_SIZE = 409
MIN_SQUARES, MAX_SQUARES = 1, 96   # CalcMoves: cmp 1 / cmp 0x60, else forced to 1
ORTHOGONAL_HALF, DIAGONAL_HALF = 2, 3


def squares(raw_byte: int) -> int:
    """Movement squares per round for a record's +0xD5 byte (CalcMoves clamp)."""
    return raw_byte if MIN_SQUARES <= raw_byte <= MAX_SQUARES else 1


def half_squares(raw_byte: int) -> int:
    """The ledger CalcMoves returns (`shl ax,1`)."""
    return squares(raw_byte) * 2


def route_cost_half(orthogonal: int, diagonal: int) -> int:
    return orthogonal * ORTHOGONAL_HALF + diagonal * DIAGONAL_HALF


def affordable_prefix(step_costs_half, raw_byte: int) -> int:
    """How many consecutive steps (given in half-squares) fit in the budget."""
    left, n = half_squares(raw_byte), 0
    for cost in step_costs_half:
        if cost > left:
            break
        left -= cost
        n += 1
    return n


def mon_records(path: str):
    from dax_decode import parse_container, decompress_block
    data = open(path, "rb").read()
    base, blocks = parse_container(data)
    for blk in blocks:
        raw = decompress_block(data, base, blk)
        if len(raw) == RECORD_SIZE:
            yield blk.block_id, raw


def census():
    out = collections.Counter()
    for n in (1, 2, 3):
        p = os.path.join(COK, f"MON{n}CHA.DAX")
        if not os.path.exists(p):
            continue
        for _bid, raw in mon_records(p):
            out[raw[MOVE_OFFSET]] += 1
    return out


if __name__ == "__main__":
    c = census()
    for value in sorted(c):
        print(f"+0xD5={value:3d}  records={c[value]:3d}  squares={squares(value)}  half={half_squares(value)}")
