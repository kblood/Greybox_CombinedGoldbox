"""DB:8E strength/charisma updates reached by original CoK item removal.

These updates precede equipment-stat recalculation. Effect lookup uses the first
matching id, without an applied/duration filter. Original byte wrapping and
candidate carry between records are intentional, including surprising results.
"""
from tools.cok_equipment import signed_byte


def _validate(body, items, effects):
    if len(body) != 409 or any(len(r) != 63 for r in items) or any(len(r) != 9 for r in effects):
        raise ValueError('complete CoK body, inventory and effect records required')


def _first(effects, kind):
    return next((r for r in effects if r[0] == kind), None)


def _strength_effect(record):
    value = record[3] & 127
    return (18, (value-1) & 255) if value <= 101 else (value-100, 0)


def strength(body: bytes, items: tuple[bytes, ...], effects: tuple[bytes, ...]) -> bytes:
    """Model 356EEh with ability index zero, including 26h/71h/0Ch effects."""
    _validate(body, items, effects)
    value, exceptional = body[16], body[29]
    candidate = candidate_exceptional = 0
    forced = None

    def consider(candidate, candidate_exceptional):
        nonlocal value, exceptional
        # 35586h does not require value == 18 before comparing exceptional
        # bytes: an 18/100 candidate can replace an existing strength 24.
        if candidate > value or candidate == 18 and candidate_exceptional > exceptional:
            value, exceptional = candidate, candidate_exceptional

    for record in items:
        if record[62] <= 128 or not record[52]:
            continue
        kind, ident = record[62] & 127, record[61]
        if kind == 3:
            candidate, candidate_exceptional = 18, 100
        elif kind == 5:
            if ident == 0:
                candidate, candidate_exceptional = 18, 100
            elif 1 <= ident <= 6:
                candidate = 18+ident
        elif kind == 8 and body[16] < 18 and ident == 0:
            candidate, candidate_exceptional = body[16]+1, 0
        elif kind == 13:
            forced = 3
        consider(candidate, candidate_exceptional)
    record = _first(effects, 0x26)
    if record is not None:
        candidate, candidate_exceptional = _strength_effect(record)
        if value <= 18 and exceptional < 100:
            candidate = (candidate+value) & 255
            if candidate > 18:
                if any(signed_byte(body[i]) > 0 for i in (251, 259, 256, 264, 253, 261)):
                    candidate_exceptional = ((candidate-18)*10+body[28]) & 255
                    if candidate_exceptional > 100:
                        candidate_exceptional = 100
                candidate = 18
        consider(candidate, candidate_exceptional)
    for kind in (0x71, 0x0C):
        record = _first(effects, kind)
        if record is not None:
            consider(*_strength_effect(record))
    result = bytearray(body)
    result[17], result[28] = (forced, 0) if forced is not None else (value, exceptional)
    return bytes(result)


def charisma(body: bytes, items: tuple[bytes, ...], effects: tuple[bytes, ...]) -> bytes:
    """Model 356EEh with ability index five, including the first 0Eh effect."""
    _validate(body, items, effects)
    value = body[26]
    for record in items:
        if record[62] <= 128 or not record[52]:
            continue
        kind, ident = record[62] & 127, record[61]
        if kind == 6:
            value = (value-1) & 255
        elif kind == 8 and body[26] < 18 and ident == 5:
            value = (value+1) & 255
    record = _first(effects, 0x0E)
    if record is not None:
        value = (value+record[3]) & 255
    result = bytearray(body)
    result[27] = value
    return bytes(result)
