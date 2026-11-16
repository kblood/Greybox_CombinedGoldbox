"""Strict native Secret roster transport: complete bodies and owned companions.

GBPR3/title4 is distinct from the 410-byte Krynn bridge. The trailer retains
the item catalogue and full STF/SFX payloads so cold loading needs no retail
files or archived pointers. HP updates modify only owned current-HP bytes.
"""
from dataclasses import dataclass
import struct

from tools.secret_melee_stats import SecretSource, canonical_record
from tools.secret_player_stats import player_stats, stf_items

HEADER = struct.Struct('<4s6H')
ROW_SIZE, LIMIT = 440, 32768


@dataclass(frozen=True)
class Hero:
    slot: int
    body: bytes
    stf: bytes = b''
    sfx: bytes = b''


@dataclass(frozen=True)
class Roster:
    heroes: tuple[Hero, ...]
    catalogue: bytes


def validate(roster: Roster) -> None:
    if not 1 <= len(roster.heroes) <= 6 or len(roster.catalogue) != 2048:
        raise ValueError('bounded Secret roster and complete catalogue required')
    slots = set()
    for hero in roster.heroes:
        if not 1 <= hero.slot <= 6 or hero.slot in slots:
            raise ValueError('invalid or duplicate Secret source slot')
        slots.add(hero.slot)
        canonical_record(hero.body, SecretSource.DOS)
        if len(hero.sfx) % 9:
            raise ValueError('incomplete Secret effect record')
        player_stats(hero.body, stf_items(hero.stf), roster.catalogue)


def encode(roster: Roster) -> bytes:
    validate(roster)
    rows = b''.join(bytes([hero.slot]) + hero.body for hero in roster.heroes)
    payload = roster.catalogue + b''.join(
        struct.pack('<BBHHH', hero.slot, 0, len(hero.stf), len(hero.sfx), 0) + hero.stf + hero.sfx
        for hero in roster.heroes)
    length = 16 + len(rows) + 16 + len(payload)
    if length > LIMIT:
        raise ValueError('Secret roster exceeds native bank capacity')
    return (HEADER.pack(b'GBPR', 3, len(roster.heroes), ROW_SIZE, 2, 4, 1) + rows +
            HEADER.pack(b'GBSA', 1, len(roster.heroes), 2048, length, 0, 0) + payload)


def decode(data: bytes) -> Roster:
    if not 16 <= len(data) <= LIMIT:
        raise ValueError('invalid Secret roster length')
    magic, version, count, size, flags, title, revision = HEADER.unpack_from(data)
    if (magic, version, size, flags, title, revision) != (b'GBPR', 3, ROW_SIZE, 2, 4, 1) or not 1 <= count <= 6:
        raise ValueError('wrong Secret roster identity/schema')
    cursor = 16 + count * ROW_SIZE
    if cursor + 16 + 2048 > len(data):
        raise ValueError('truncated Secret roster trailer')
    if HEADER.unpack_from(data, cursor) != (b'GBSA', 1, count, 2048, len(data), 0, 0):
        raise ValueError('wrong Secret companion trailer')
    cursor += 16
    catalogue = data[cursor:cursor + 2048]; cursor += 2048
    heroes = []
    for index in range(count):
        row = data[16 + index * ROW_SIZE:16 + (index + 1) * ROW_SIZE]
        if cursor + 8 > len(data):
            raise ValueError('truncated Secret companion header')
        slot, reserved, stf_length, sfx_length, reserved_word = struct.unpack_from('<BBHHH', data, cursor)
        if slot != row[0] or reserved or reserved_word:
            raise ValueError('wrong Secret companion ownership')
        cursor += 8
        if cursor + stf_length + sfx_length > len(data):
            raise ValueError('truncated Secret companion payload')
        stf = data[cursor:cursor + stf_length]; cursor += stf_length
        sfx = data[cursor:cursor + sfx_length]; cursor += sfx_length
        heroes.append(Hero(slot, row[1:], stf, sfx))
    if cursor != len(data):
        raise ValueError('trailing Secret roster bytes')
    roster = Roster(tuple(heroes), catalogue)
    validate(roster)
    return roster


def update_hp(data: bytes, hp: tuple[int, ...]) -> bytes:
    roster = decode(data)
    if len(hp) != len(roster.heroes):
        raise ValueError('combat count differs from Secret roster')
    result = bytearray(data)
    for index, (hero, current) in enumerate(zip(roster.heroes, hp)):
        if not 0 <= current <= hero.body[112]:
            raise ValueError('combat HP outside source maximum')
        result[16 + index * ROW_SIZE + 1 + 437] = current
    return bytes(result)
