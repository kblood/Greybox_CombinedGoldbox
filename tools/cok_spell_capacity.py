"""Read-only model of the held CoK capacity producer, not a native menu.

GAME.OVR 39F1F and its 3A632 helper rebuild capacities and add known flags.
Equipment is supplied as complete 63-byte nodes in list order. Serialized link
pointers are opaque here; callers own list construction and persistence.
"""
from __future__ import annotations

import hashlib
import struct
from dataclasses import dataclass


def signed(value: int) -> int:
    return value if value < 128 else value - 256


@dataclass(frozen=True)
class CapacityTables:
    data: bytes

    @classmethod
    def from_retail(cls, image: bytes, overlay: bytes) -> 'CapacityTables':
        pins = [
            (overlay[0x39F1F:0x3A343], 'a657cf3be0427743b9d41044f59dad1200caa5de9609235249d6a261177bf105'),
            (overlay[0x3A632:0x3A7B6], 'cda50e1f463a2771d899b1ea8c77e743642c7b8371a9be63efae6c3ecc21653b'),
        ]
        if len(image) < 0xA463:
            raise ValueError('truncated CoK START image')
        base = struct.unpack_from('<H', image, 0xA461)[0] * 16
        data = image[base:]
        pins.append((data[0x31B3:0x4290], 'e00166142d533d8c7658bfc357ada9cd54022e32820703aeb8c840b8f4c6f520'))
        if any(hashlib.sha256(raw).hexdigest() != digest for raw, digest in pins):
            raise ValueError('CoK capacity code/table build mismatch')
        return cls(data)


def recalculate(body: bytes, items: tuple[bytes, ...], tables: CapacityTables) -> bytes:
    """Return a whole character, preserving all fields outside capacities/known flags.

    Raw signed-byte branches and wrapping byte arithmetic match this retail
    routine, including unusual imported values. This does not validate whether
    a character is legal, eligible to memorize, or allowed to gain a level.
    """
    if len(body) != 409 or len(items) > 256 or any(len(item) != 63 for item in items):
        raise ValueError('expected one CoK body and at most 256 whole item nodes')
    out = bytearray(body)
    out[284:304] = bytes(20)
    data = tables.data

    def add(offset: int, value: int) -> None:
        out[offset] = (out[offset] + value) & 255

    def progression(kind: int, first: int, last: int, base: int) -> None:
        for level in range(first, last + 1):
            for spell_level in range(1, 6):
                add(base + spell_level, data[0x3C8E + 99*kind + 5*level + spell_level])

    def divine_known() -> None:
        # Retail visits only levels 1..4 here, although five capacities exist.
        for level in range(1, 5):
            if out[283 + level]:
                for index in range(1, 11):
                    spell = data[0x4230 + 10*level + index]
                    if not spell:
                        break
                    out[98 + spell] = 1

    for slot in range(8):
        level = signed(out[249 + slot])
        if level <= 0:
            continue
        if slot == 0:
            kind = int(signed(out[93]) > 4)
            # 3A632 replaces the preliminary cleric calculation in 39F1F.
            out[284:289] = bytes([1 + kind, 0, 0, 0, 0])
            progression(kind, 2, level, 283)
            for threshold, offset in [(12, 284), (13, 284), (14, 285),
                                      (15, 285), (16, 286), (17, 287)]:
                if out[21] > threshold and out[offset]:
                    add(offset, 1)
            divine_known()
        elif slot == 7 and level > 5 and out[92] != 1:
            progression(4 if out[92] == 2 else 5, 6, level, 283)
            divine_known()
        elif slot == 4 and level > 7:
            for active_level in range(8, level + 1):
                for spell_level in range(1, 6):
                    offset = 288 + spell_level if spell_level <= 3 else 295 + spell_level
                    add(offset, data[0x3EE0 + 5*active_level + spell_level])
            for spell in range(1, 101):
                if data[0x31B3 + 16*spell] == 1:
                    out[98 + spell] = 1
        elif slot == 5:
            add(299, 1)
            progression(7 if out[94] == 1 else 8, 2, level, 298)
    for item in items:
        if item[62] == 0x81 and item[52] != 0:
            for offset in range(299, 302):
                add(offset, out[offset])
    return bytes(out)
