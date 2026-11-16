"""Clean-room fixed-gift party writes; no original code or owner authority.

Currency changes preserve the source's stale movement byte. Recalculation is
a separate operation, as demonstrated by the LOWMAGE ordering controls.
"""
from dataclasses import dataclass, replace
import struct

from tools.cok_equipment import strength_index, weight_allowance
from tools.cok_equipment import recalculate, signed_byte
from tools.secret_melee_stats import canonical_record, SecretSource
from tools.secret_player_stats import stf_items
from tools.secret_reward_xp import compute
from tools.secret_roster import encode


@dataclass(frozen=True)
class GemTransfer:
    party: object
    pools: tuple[int, ...]
    transferred: int
    refused: bool


@dataclass(frozen=True)
class Recalculated:
    body: bytes
    slots: tuple[int | None, ...]
    ready_weight: int
    movement_global: int


@dataclass(frozen=True)
class ItemTransfer:
    party: object
    accepted: bool
    ready_weight: int
    movement_global: int


def take_item(party, actor, record, bank1_6e4=0):
    """Original eligibility R, bounded append, then successful post-append R.

    Refusal retains the first R's exact scalar writes. Existing opaque links
    are never canonicalized; only the newly appended main next cell is zero.
    Pending unlinking belongs to the collection owner, not this primitive.
    """
    if (type(actor) is not int or not 0 <= actor < len(party.heroes)
            or len(record) != 67 or record[46] == 73 or record[46] >= 128):
        raise ValueError("owned recipient and fixed-offer main record required")
    hero = party.heroes[actor]
    first = recalculate_secret(hero.body, hero.stf, hero.sfx, party.catalogue, bank1_6e4)
    amount = struct.unpack_from("<H", record, 55)[0]
    if record[57]:
        amount = (amount * record[57]) & 65535
    capacity = 1500 + weight_allowance(strength_index(first.body[17], first.body[28]))
    total = (struct.unpack_from("<H", first.body, 411)[0] + amount) & 65535
    accepted = first.body[352] <= 15 and total <= capacity
    stf = hero.stf
    calculated = first
    if accepted:
        item = record[:42] + bytes(4) + record[46:]
        stf += item
        calculated = recalculate_secret(first.body, stf, hero.sfx, party.catalogue, bank1_6e4)
    heroes = list(party.heroes)
    heroes[actor] = replace(hero, body=calculated.body, stf=stf)
    result = replace(party, heroes=tuple(heroes))
    encode(result)  # Whole32768-byte owned P1 capacity remains closed.
    return ItemTransfer(result, accepted, calculated.ready_weight, calculated.movement_global)


def recalculate_secret(body, stf, sfx, catalogue, bank1_6e4=0):
    """Full R scalar projection, preserving archived equipment/pointer cells.

    The shared Gen1 coefficient kernel is followed by Secret's currency,
    weapon, movement/SFX and history rules. Class setup/readiness are separate.
    """
    body = canonical_record(body, SecretSource.DOS)
    if (len(sfx) % 9 or type(bank1_6e4) is not int or not 0 <= bank1_6e4 <= 65535):
        raise ValueError("owned SFX and word movement context required")
    mains = tuple(item.record[:63] for item in stf_items(stf))
    mapped = bytearray(409)
    mapped[:29] = body[:29]
    mapped[89:91] = body[106:108]
    mapped[206:261] = body[230:285]
    mapped[269:277] = body[291:299]
    mapped[323:409] = body[353:439]
    # The kernel uses six coin cells. Only their wrapped aggregate affects
    # its weight calculation; Secret contributes seven preserved source cells.
    coins = sum(struct.unpack_from("<7H", body, 259)) & 65535
    mapped[237:249] = struct.pack("<H", coins) + bytes(10)
    calculated = recalculate(bytes(mapped), mains, catalogue)
    normal = bytearray(calculated.body)
    weapon_index = calculated.equipment.slots[0]
    if weapon_index is not None:
        kind = mains[weapon_index][46]
        if (kind in (18, 19) or 22 <= kind <= 26) and body[107] not in (0, 1):
            normal[396] = (normal[396] + 1) & 255
        if body[107] == 5 and kind == 67:
            normal[396] = (normal[396] - 2) & 255
    result = bytearray(body)
    for source, destination, size in ((322, 352, 1), (379, 409, 4),
                                      (396, 426, 3), (401, 431, 6)):
        result[destination:destination + size] = normal[source:source + size]
    movement = normal[408]
    types = set(sfx[::9])
    if 39 in types:
        movement = (movement * 2) & 255
    if 42 in types:
        movement //= 2
    if 74 in types:
        movement = (movement * 2) & 255
    if body[424] == 0:
        movement = (movement + bank1_6e4) & 255
    global_movement = (movement * 2) & 255
    result[438] = global_movement // 2
    history_level = next((v for v in body[273:279] if v), body[279]) if body[107] == 6 else 0
    history = body[107] == 6 and signed_byte(history_level) > signed_byte(body[239])
    eligible = (any(signed_byte(v) > 0 for v in body[275:278])
                or signed_byte(body[282]) > 0 and history)
    result[230] = max(body[275:278]) if eligible and body[107] not in (0, 7) else 1
    return Recalculated(bytes(result), calculated.equipment.slots,
                        calculated.equipment.equipped_weight, global_movement)


def award_fixed_gift(party, suppression=0):
    projection = compute((hero.body for hero in party.heroes), suppression)
    heroes = []
    for hero, value in zip(party.heroes, projection.new_xp):
        body = bytearray(hero.body)
        struct.pack_into("<I", body, 300, value)
        heroes.append(replace(hero, body=bytes(body)))
    result = replace(party, heroes=tuple(heroes))
    encode(result)  # Existing closed P1/GBSA extent and framing admission.
    return result, projection


def transfer_gems(party, pools, actor, requested):
    """Full344E4's bounded fixed-offer scalar writes, without implicit R.

    Capacity is checked before the source pool clamp. A refused request leaves
    the party and pools unchanged; zero still passes the same capacity check.
    """
    pools = tuple(pools)
    if (len(pools) != 7 or any(type(v) is not int or not 0 <= v <= 0xffffffff for v in pools)
            or type(actor) is not int or not 0 <= actor < len(party.heroes)
            or type(requested) is not int or not 0 <= requested <= 20):
        raise ValueError("bounded fixed-gift currency input required")
    hero = party.heroes[actor]
    body = bytearray(hero.body)
    allowance = 1500 + weight_allowance(strength_index(body[17], body[28]))
    encumbrance = struct.unpack_from("<H", body, 411)[0]
    if encumbrance + requested > allowance:
        return GemTransfer(party, pools, 0, True)
    amount = min(requested, pools[5])
    balance = struct.unpack_from("<H", body, 269)[0]
    struct.pack_into("<H", body, 269, (balance + amount) & 0xffff)
    struct.pack_into("<H", body, 411, (encumbrance + amount) & 0xffff)
    heroes = list(party.heroes)
    heroes[actor] = replace(hero, body=bytes(body))
    result = replace(party, heroes=tuple(heroes))
    encode(result)
    pool_values = list(pools)
    pool_values[5] -= amount
    return GemTransfer(result, tuple(pool_values), amount, False)
