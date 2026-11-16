"""Checked camp-menu rules for the held CoK build; no inventory/stat rebuild."""
from dataclasses import dataclass
import hashlib
import struct

from tools.cok_spell_capacity import CapacityTables, signed


@dataclass(frozen=True)
class MenuTables:
    groups: bytes
    levels: bytes
    names: tuple[str, ...]

    @classmethod
    def from_retail(cls, image, overlay):
        CapacityTables.from_retail(image, overlay)
        for start, end, digest in [
            (0x2DC29, 0x2DDFB, 'c432acc39c0ae8a504a4e910c49ffd10633832d1532d7597f135819e59b2fad1'),
            (0x1AD6E, 0x1AEDC, '0f87596ac209d532d33717e56cd951194a42bc642a6c7b2aa3d6fd9f816228fa'),
            (0x1AC6B, 0x1ACAE, 'bc9aa068b9154e69c2c20f5be43fed5b32638d5763119f82b01c1cbca2fd59cd'),
            (0x1B620, 0x1B6BB, '5ca042641b6d7d570c0d60e5bbd790f8973dd812dbd3743d5fe492f19da1d393'),
            (0x3ADBB, 0x3AE34, '84fda5d39a3a3064d8305544dc571a19547a81e1ebb431e68f3b09da68a18639'),
        ]:
            if hashlib.sha256(overlay[start:end]).hexdigest() != digest:
                raise ValueError('CoK menu code changed')
        base = struct.unpack_from('<H', image, 0xA461)[0]*16
        raw = image[base+0x20A0:base+0x20A0+107*41]
        if hashlib.sha256(raw).hexdigest() != '2a1f5974edf77e34ef70cf13cec85e5d3eeab2b10586b4a80f17eb2676838975':
            raise ValueError('CoK spell-name table changed')
        names = ('',) + tuple(raw[i+1:i+1+raw[i]].decode('ascii') for i in range(0, len(raw), 41))
        return cls(bytes(image[base+0x31B3:base+0x31B3+128*16:16]),
                   bytes(image[base+0x31B4:base+0x31B4+128*16:16]), names)


def predicate(body, spell, tables, state=2):
    """2DC8E eligibility, including the actual F7 signed comparison."""
    group = tables.groups[spell & 127]
    first = next((v for v in body[249:257] if v), 0) if body[90] == 6 else 0
    regained = signed(first) > signed(body[215])
    level = lambda offset: signed(body[offset])
    if group in (0, 2):
        return body[21] > 8 and (level(249) > 0 or regained and level(257) > 0
                                 or level(256) > 5 or regained and level(264) > 5)
    if group == 1:
        return body[21] > 8 and (level(253) > 6 or regained and level(261) > 6)
    if group == 3:
        if body[19] <= 8:
            return False
        if body[90] != 6 or not any(body[335:339]) or state != 5:
            return True
        return level(253) > 8 or (regained and level(261) > 8
                                  and (level(254) > 0 or regained and level(262) > 0))
    return False


def used(body, group, level, tables):
    return sum(value != 0 and tables.groups[value & 127] == group
               and tables.levels[value & 127] == level for value in body[30:88])


def remaining(body, spell, tables, memory):
    group, level = tables.groups[spell], tables.levels[spell]
    count = used(body, group, level, tables)
    if group == 2:
        if signed(body[249]) <= 0:
            raise ValueError('retail group-two capacity has an uninitialized local for inactive clerics')
        return ((3 if body[93] == 4 else 0 if body[93] == 6 else 1)-count) & 255
    normal = max(0, body[283+5*group+level]-count)
    if group != 3 or signed(body[254]) <= 0 or not body[94]:
        return normal
    phase = memory.get(0x4CF8+body[94], 0)
    bonus = phase if phase in (1, 2) else 0
    for spell_level in range(1, 6):
        bonus = max(0, bonus-max(0, used(body, 3, spell_level, tables)-body[298+spell_level]))
    return normal+bonus


def sort_queue(body):
    out = bytearray(body)
    for i in range(30, 87):
        for j in range(i, 88):
            if out[i] & 127 > out[j] & 127:
                out[i], out[j] = out[j], out[i]
    return bytes(out)


def change_queue(body, spell, tables, memory):
    """Native admission boundary; zero cancels pending without sorting.

    Invalid queues, a full 58-byte array, and the retail inactive-cleric
    uninitialized-capacity branch are explicitly rejected for additions.
    """
    if len(body) != 409 or body[392] == 1 or body[393] == 0:
        raise ValueError('member cannot use the memorization menu')
    out = bytearray(body)
    if spell == 0:
        out[30:88] = bytes(v if v < 128 else 0 for v in out[30:88])
        out[88] = 0
        return bytes(out)
    if not 1 <= spell <= 107 or any(v and not 1 <= v & 127 <= 107 for v in out[30:88]):
        raise ValueError('invalid spell or queue')
    duplicate = tables.groups[spell] == 2 and any(v & 127 == spell for v in out[31:88])
    if not out[98+spell] or not predicate(out, spell, tables) or duplicate:
        raise ValueError('spell is not an eligible grimoire candidate')
    if not remaining(out, spell, tables, memory) or 0 not in out[30:88]:
        raise ValueError('no spell capacity')
    out[30+out[30:88].index(0)] = spell+128
    return sort_queue(out)
