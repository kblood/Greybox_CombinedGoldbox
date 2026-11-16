"""CoK equipment and derived-stat reconstruction from original instructions.

GAME.OVR 372C6h..374B1h rebuilds thirteen pointers, counts, hands and weight.
Slot values here are record indices, never serialized DOS pointers. Item-driven
ability changes performed before E6:43 remain a separate operation.
"""
from dataclasses import dataclass
import struct


@dataclass(frozen=True)
class Equipment:
    count: int
    slots: tuple[int | None, ...]
    hands: int
    weight: int
    equipped_weight: int


def reconstruct(body: bytes, items: tuple[bytes, ...], item_table: bytes) -> Equipment:
    if len(body) != 409 or len(item_table) != 128*16 or any(len(r) != 63 for r in items):
        raise ValueError('complete CoK body, records and item table required')
    if any(r[46] >= 128 for r in items):
        raise ValueError('item type has no held CoK definition')
    slots = [None]*13
    hands = weight = equipped_weight = 0
    for index, record in enumerate(items):
        amount = struct.unpack_from('<H', record, 55)[0]
        if record[57]:
            amount = amount*record[57] & 0xFFFF
        weight = (weight+amount) & 0xFFFF
        if not record[52]:
            continue
        equipped_weight = (equipped_weight+amount) & 0xFFFF
        kind = record[46]
        category = item_table[kind*16]
        if category <= 8:
            slots[category] = index
        elif category == 9:
            if slots[9] is None:
                slots[9] = index
            elif slots[10] is None:
                slots[10] = index
        if kind == 30:
            slots[11] = index
        if kind == 12:
            slots[12] = index
        hands = (hands+item_table[kind*16+1]) & 255
    # Six saved currency words participate directly, with word wrapping.
    weight = (weight+sum(struct.unpack_from('<6H', body, 237))) & 0xFFFF
    return Equipment(len(items) & 255, tuple(slots), hands, weight, equipped_weight)


def signed_byte(value):
    return value if value < 128 else value-256


def signed_word(value):
    return value if value < 32768 else value-65536


def dex_armor(value):
    if 1 <= value <= 3: return -4
    if 4 <= value <= 6: return value-7
    if 15 <= value <= 18: return value-14
    if 19 <= value <= 20: return 4
    if 21 <= value <= 23: return 5
    if 24 <= value <= 25: return 6
    return 0


def dex_ranged(value):
    if value <= 2: return -4
    if 3 <= value <= 5: return value-6
    if 16 <= value <= 18: return value-15
    if 19 <= value <= 20: return 3
    if 21 <= value <= 23: return 4
    if 24 <= value <= 25: return 5
    return 0


def strength_index(strength, exceptional):
    # 37920h leaves a local uninitialized outside these bounds. Do not turn
    # stack-dependent original results into an invented deterministic value.
    if not 0 <= strength <= 25 or not 0 <= exceptional <= 255 or strength == 18 and exceptional > 100:
        raise ValueError('original strength index has an uninitialized result')
    if strength < 18: return strength
    if strength > 18: return strength+5
    return 18+sum(exceptional > boundary for boundary in (0, 50, 75, 90, 99))


def strength_hit(value):
    if 1 <= value <= 3: return -3
    if 4 <= value <= 5: return -2
    if 6 <= value <= 7: return -1
    if 17 <= value <= 19: return 1
    if 20 <= value <= 22: return 2
    if 23 <= value <= 25: return 3
    if 26 <= value <= 27: return 4
    if 28 <= value <= 30: return value-23
    return 0


def strength_damage(value):
    if 1 <= value <= 2: return -2
    if 3 <= value <= 5: return -1
    if value == 16: return 1
    if 17 <= value <= 19: return value-16
    if 20 <= value <= 29: return value-17
    if value == 30: return 14
    return 0


def weight_allowance(value):
    if 1 <= value <= 3: return -350
    if 4 <= value <= 5: return -250
    if 6 <= value <= 7: return -150
    if 12 <= value <= 13: return 100
    if 14 <= value <= 15: return 200
    if value == 16: return 350
    if 17 <= value <= 21: return (value-17)*250+500
    if 22 <= value <= 26: return (value-22)*1000+2000
    if value == 27: return 7500
    if 28 <= value <= 30: return (value-28)*3000+9000
    return 0


@dataclass(frozen=True)
class Recalculated:
    body: bytes
    equipment: Equipment


def recalculate(body: bytes, items: tuple[bytes, ...], item_table: bytes) -> Recalculated:
    """Model all E6:43 writes, with equipment pointers returned as slot indices.

    The body retains opaque inventory/effect/party links from the caller but
    clears its thirteen equipment far pointers. Use the returned indices to
    materialize pointers in an oracle or another runtime representation.
    """
    equipment = reconstruct(body, items, item_table)
    strength = strength_index(body[17], body[28])
    result = bytearray(body)
    result[322] = equipment.count
    result[327:379] = bytes(52)
    result[379] = equipment.hands
    struct.pack_into('<H', result, 381, equipment.weight)
    result[401:407] = body[269:275]
    result[380] = 0
    result[397] = body[275]
    result[408] = body[213]
    result[396] = body[89]
    parts = [dex_armor(body[23]) & 255, 0, 0, 0, 0]
    magic_armor = False
    hit = strength_hit(strength) if body[276] else 0
    damage = strength_damage(strength) if body[276] else 0
    weapon_index = equipment.slots[0]
    if weapon_index is None:
        result[396] = (result[396]+hit) & 255
        result[405] = (signed_byte(result[405])+damage) & 255
    else:
        weapon = items[weapon_index]
        kind = weapon[46]
        table = item_table[kind*16:(kind+1)*16]
        flags = table[14]
        if flags & 2:
            result[396] = (result[396]+dex_ranged(body[23])) & 255
        result[405] = table[11]
        if flags & 4:
            result[396] = (result[396]+hit) & 255
            result[405] = (signed_byte(result[405])+damage) & 255
        bonus = weapon[50]
        for enabled, slot in [(flags > 127, 12), (bool(flags & 1), 11)]:
            index = equipment.slots[slot]
            if enabled and index is not None:
                bonus = (signed_byte(bonus)+signed_byte(items[index][50])) & 255
        result[405] = (signed_byte(result[405])+signed_byte(bonus)) & 255
        if body[90] in (0, 1) and (22 <= kind <= 26 or kind in (18, 19)):
            bonus = (bonus+1) & 255
        if body[90] == 5 and kind == 67:
            bonus = (bonus+2) & 255
        result[396] = (result[396]+signed_byte(bonus)) & 255
        result[401], result[403] = table[9], table[10]
    for record in items:
        if not record[52]:
            continue
        table = item_table[record[46]*16:(record[46]+1)*16]
        category, armor = table[0], table[6]
        # 367E6h: the last equipped armor determines the pre-encumbrance rate.
        if category == 2:
            weight = struct.unpack_from('<H', record, 55)[0]
            result[408] = body[213] if weight <= 150 else (9 if weight <= 399 else 6)
            if record[50] and result[408] <= 9:
                result[408] = (result[408]+3) & 255
        if armor <= 127:
            continue
        armor &= 127
        bonus = signed_byte(record[50])
        if category == 1:
            parts[1] = (armor+bonus) & 255
        elif not armor:
            if category == 9:
                if bonus > signed_byte(parts[3]):
                    parts[3] = record[50]
            else:
                parts[2] = (signed_byte(parts[2])+bonus) & 255
            result[380] = (signed_byte(result[380])+signed_byte(record[51])) & 255
        elif armor+bonus > signed_byte(parts[4]):
            parts[4] = (armor+bonus) & 255
            if bonus > 0 and category == 2:
                magic_armor = True
    if magic_armor:
        parts[3] = 0
    excess = max(0, signed_word((equipment.weight-weight_allowance(strength)) & 65535))
    cap = result[408] if excess <= 512 else (9 if excess <= 768 else (6 if excess <= 1024 else 3))
    result[408] = min(result[408], cap)
    if signed_byte(parts[4]) < result[397]:
        parts[4] = result[397]
    result[397] = sum(signed_byte(part) for part in parts) & 255
    result[398] = (sum(signed_byte(parts[i]) for i in (3, 2, 4))-2) & 255
    # F7:48 compares signed bytes; its nested reader only scans race 6.
    level = next((v for v in body[249:256] if v), body[256]) if body[90] == 6 else 0
    race_level_check = signed_byte(level) > signed_byte(body[215])
    eligible = (signed_byte(body[251]) > 0 or
                signed_byte(body[259]) > 0 and race_level_check or
                signed_byte(body[256]) > 0 or signed_byte(body[253]) > 0)
    result[206] = max(body[251], body[256], body[253]) if eligible and signed_byte(body[90]) < 7 else 1
    return Recalculated(bytes(result), equipment)
