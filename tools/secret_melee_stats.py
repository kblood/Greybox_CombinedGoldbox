"""Source-owned Secret normal-melee coefficients, independent of retail code.

This model covers record/equipment-derived values before positional, aura,
spell and backstab adjustments. It is not a whole encounter or Amiga-executable
oracle. Native integration must preserve these boundaries explicitly.
"""
from dataclasses import dataclass
from enum import Enum

from tools.cok_equipment import recalculate, signed_byte


class SecretSource(str, Enum):
    DOS = 'secret-dos'
    AMIGA = 'secret-amiga'


@dataclass(frozen=True)
class AttackKind:
    rate: int
    count: int
    sides: int
    bonus: int


@dataclass(frozen=True)
class NormalMeleeStats:
    current_hp: int
    maximum_hp: int
    thac0: int
    armor_class: int
    primary: AttackKind
    secondary: AttackKind
    equipment: tuple[int | None, ...]


def canonical_record(raw: bytes, source: SecretSource) -> bytes:
    if not isinstance(source, SecretSource):
        raise ValueError('explicit Secret source profile required')
    expected = 439 if source is SecretSource.DOS else 440
    if len(raw) != expected:
        raise ValueError(f'{source.value} requires exactly {expected} bytes')
    if source is SecretSource.AMIGA and raw[-1] != 0:
        raise ValueError('Secret Amiga terminal record padding must be zero')
    if not 1 <= raw[0] <= 15 or any(not 32 <= c < 127 for c in raw[1:1 + raw[0]]):
        raise ValueError('invalid Secret Pascal name')
    return raw[:439]


def raw_aux_records(payload: bytes, width: int, source: SecretSource) -> tuple[bytes, ...]:
    """Inventory=63/effects=9; Amiga aligns the entire member, not each record."""
    if width not in (63, 9) or not isinstance(source, SecretSource):
        raise ValueError('explicit Secret auxiliary schema required')
    if source is SecretSource.AMIGA:
        if len(payload) & 1:
            raise ValueError('Secret Amiga auxiliary member must be word-aligned')
        if len(payload) % width:
            if len(payload) % width != 1 or not payload or payload[-1] != 0:
                raise ValueError('invalid auxiliary terminal padding')
            payload = payload[:-1]
            if not len(payload) & 1:
                raise ValueError('unexpected auxiliary padding')
    if len(payload) % width:
        raise ValueError('incomplete Secret auxiliary record')
    return tuple(payload[i:i + width] for i in range(0, len(payload), width))


def normal_melee_stats(raw: bytes, items: tuple[bytes, ...], definitions: bytes,
                       source: SecretSource) -> NormalMeleeStats:
    """Compute ordinary equipment-derived coefficients; no generic stat fallback.

    Secret shares Gen1 logical equipment arithmetic with CoK, but has different
    record offsets and an unconditional weapon-kind bonus. Projection below is
    compared to Secret's own complete recalculation, not used as its oracle.
    """
    body = canonical_record(raw, source)
    if len(definitions) != 2048 or any(len(item) != 63 for item in items):
        raise ValueError('complete Secret item records and 128 definitions required')
    mapped = bytearray(409)
    mapped[:29] = body[:29]
    mapped[89], mapped[90] = body[106], body[107]
    mapped[206:261] = body[230:285]
    mapped[269:277] = body[291:299]
    mapped[323:409] = body[353:439]
    calculated = recalculate(bytes(mapped), items, definitions)
    result = bytearray(calculated.body)
    weapon_index = calculated.equipment.slots[0]
    if weapon_index is not None:
        kind = items[weapon_index][46]
        # Secret GAME.OVR382c6..382ee tests kind, without CoK's race0/1 gate.
        if (kind in (18, 19) or 22 <= kind <= 26) and body[107] not in (0, 1):
            result[396] = (result[396] + 1) & 255
        # CoK's separate Kender/hoopak bonus has no Secret counterpart.
        if body[107] == 5 and kind == 67:
            result[396] = (result[396] - 2) & 255
    primary = AttackKind(body[289], result[401], result[403], signed_byte(result[405]))
    secondary = AttackKind(body[290], result[402], result[404], signed_byte(result[406]))
    return NormalMeleeStats(body[437], body[112], 60 - result[396], 60 - result[397],
                            primary, secondary, calculated.equipment.slots)


def attacks_for_parity(rate: int, parity: int) -> int:
    if not 0 <= rate <= 255 or parity not in (0, 1):
        raise ValueError('byte rate and parity0/1 required')
    return ((rate + parity) & 255) // 2


def damage_draws(seed: int, count: int, sides: int, bonus: int = 0) -> tuple[int, int]:
    """Secret's Pascal dice prefix: byte sum/bonus wrap, before effects/backstab."""
    if not 0 <= seed <= 0xffffffff or not 0 <= count <= 255 or not 0 <= sides <= 255 or not -128 <= bonus <= 127:
        raise ValueError('invalid Secret dice input')
    total = 0
    for _ in range(count):
        seed = (seed * 0x08088405 + 1) & 0xffffffff
        draw = (seed >> 16) % sides if sides else 0
        total = (total + draw + 1) & 255
    return (total + bonus) & 255, seed
