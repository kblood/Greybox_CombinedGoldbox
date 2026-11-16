"""Secret player normal coefficients after class/equipment setup.

Portable calculation uses logical owned STF nodes. It never follows archived
far pointers and does not use original instructions as its implementation.
The original full player loader is the independent verification oracle.
"""
from dataclasses import dataclass

from tools.secret_melee_stats import NormalMeleeStats, SecretSource, canonical_record, normal_melee_stats
from tools.cok_equipment import signed_byte


@dataclass(frozen=True)
class StfItem:
    record: bytes
    children: tuple[bytes, ...] = ()


@dataclass(frozen=True)
class PlayerStats:
    normal: NormalMeleeStats
    body: bytes
    items: tuple[StfItem, ...]


def stf_items(payload: bytes) -> tuple[StfItem, ...]:
    """STF67 main nodes; type73 owns exactly count57 following child67 nodes.

    Child nodes remain distinct. Original equipment recalculation walks the
    main chain, so flattening readied children would invent worn equipment.
    """
    if len(payload) % 67:
        raise ValueError('incomplete Secret STF record')
    records = [payload[i:i + 67] for i in range(0, len(payload), 67)]
    items, cursor = [], 0
    while cursor < len(records):
        record = records[cursor]; cursor += 1
        children = record[57] if record[46] == 73 else 0
        if children > len(records) - cursor:
            raise ValueError('incomplete Secret STF container children')
        items.append(StfItem(record, tuple(records[cursor:cursor + children])))
        cursor += children
    return tuple(items)


def class_thac_raw(slot: int, level: int) -> int:
    """Secret's seven class rows, levels0..18; checked against its own table."""
    if not 0 <= slot <= 6 or not 0 <= level <= 18:
        raise ValueError('class slot or level outside verified Secret table')
    if slot in (0, 1):
        return 40 + 2 * (max(0, level - 1) // 3)
    if slot in (2, 3, 4):
        if level == 0:
            return 39 if slot == 2 else 40
        return 40 if level <= 2 else 39 + level
    if slot == 5:
        return 39 if level <= 5 else 41 if level <= 10 else 43 if level <= 15 else 46
    return 40 if level <= 4 else 41 if level <= 8 else 44 if level <= 12 else 46 if level <= 16 else 48


def player_stats(raw: bytes, items: tuple[StfItem, ...], definitions: bytes) -> PlayerStats:
    """Normal projection including source class-history eligibility/readiness."""
    body = bytearray(canonical_record(raw, SecretSource.DOS))
    levels = body[273:280]
    history = body[280:287]
    if any(level > 18 for level in (*levels, *history)):
        raise ValueError('class level outside verified Secret table')
    for item in items:
        if len(item.record) != 67 or any(len(child) != 67 for child in item.children):
            raise ValueError('complete Secret STF main/child records required')
        if item.record[46] == 73:
            if len(item.children) != item.record[57]:
                raise ValueError('STF container count differs from owned children')
        elif item.children:
            raise ValueError('only STF type73 owns children')
    main = tuple(item.record[:63] for item in items)
    before_class = normal_melee_stats(bytes(body), main, definitions, SecretSource.DOS)
    body[106] = max(class_thac_raw(slot, level) for slot, level in enumerate(levels))
    for slot, level in enumerate(levels):
        if slot in (2, 3):
            if level > 6:
                body[289] = 3
            if level > 12:
                body[289] = 4
        elif slot == 4:
            if level > 7:
                body[289] = 3
            if level > 14:
                body[289] = 4
    for level in levels:
        if signed_byte(body[238]) < level:
            body[238] = level
    # Equipment history eligibility is separate from historical THAC/rates.
    # Original adds slot bits (slot3/4 share bit64), using byte wrap.
    body[304] = sum(bit for bit, level, previous in
                    zip((2, 16, 8, 64, 64, 1, 4), levels, history)
                    if level or (previous and previous < signed_byte(body[238]))) & 255
    adjusted = [bytearray(item.record) for item in items]
    for index in before_class.equipment:
        if index is None:
            continue
        item = adjusted[index]
        allowed = definitions[item[46] * 16 + 13] & body[304]
        if not allowed and item[54] == 0:
            item[52] = 0
    first_current = next((level for level in levels if level), 0) if body[107] == 6 else 0
    if first_current > signed_byte(body[239]):
        for slot, level in enumerate(history):
            if slot in (2, 3):
                if level >= 7:
                    body[289] = 3
                if level >= 13:
                    body[289] = 4
            elif slot == 4:
                if level >= 8:
                    body[289] = 3
                if level >= 15:
                    body[289] = 4
            body[106] = max(body[106], class_thac_raw(slot, level))
    owned = tuple(StfItem(bytes(record), source.children) for record, source in zip(adjusted, items))
    normal = normal_melee_stats(bytes(body), tuple(item.record[:63] for item in owned),
                               definitions, SecretSource.DOS)
    return PlayerStats(normal, bytes(body), owned)
