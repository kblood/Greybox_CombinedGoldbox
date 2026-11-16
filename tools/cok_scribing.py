"""Owned-record model of CoK's 2B3CF scribing helper.

File order supplies list identity. Serialized links are opaque because the
original loader reconstructs them; this model preserves those stored bytes.
It models one completion/lookahead call, not the party rest scheduler.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class ScribeResult:
    body: bytes
    records: tuple[bytes, ...]
    level: int
    lookahead: bool
    completed: int | None
    removed_index: int | None


def preparation(body, records, levels):
    """1A6A0 preparation setter and estimated minutes, including byte sums."""
    records = tuple(records)
    # Reuse the read-only preflight without completing anything.
    scribe(body, records, levels, lookahead=True)
    queue = [value & 127 for value in body[30:88] if value > 127]
    if any(not 1 <= spell <= 107 for spell in queue):
        raise ValueError('invalid pending memorization spell')
    memorization = [max(1, levels[spell]) for spell in queue]
    scrolls = [levels[value & 127] for record in records if record[46] in (39, 40)
               for value in record[60:63] if value > 127]
    mem_sum, scroll_sum = sum(memorization) & 255, sum(scrolls) & 255
    hours = 4 if mem_sum or scroll_sum else 0
    if max(memorization+scrolls, default=0) > 2:
        hours = 6
    result = bytearray(body)
    result[88] = hours
    return bytes(result), 60*hours+15*(mem_sum+scroll_sum)


def scribe(body, records, levels, *, lookahead=False):
    records = tuple(bytes(record) for record in records)
    if len(body) != 409 or any(len(record) != 63 for record in records):
        raise ValueError('invalid character/inventory size')
    if len(levels) < 108:
        raise ValueError('missing spell levels')
    # Fail before any mutation; native grimoire ids are bounded to 1..107.
    for record in records:
        if record[46] in (39, 40) and any(value > 235 for value in record[60:63]):
            raise ValueError('invalid pending scroll spell')
    updated_body = bytearray(body)
    updated_records = list(records)
    completed = removed = None
    level = 0
    for index, raw in enumerate(records):
        if raw[46] not in (39, 40):
            continue
        record = bytearray(raw)
        for slot in range(60, 63):
            if level:
                break
            if record[slot] <= 128:
                continue
            spell = record[slot] & 127
            if lookahead:
                level = levels[spell]
                continue
            completed = spell
            updated_body[98+spell] = 1
            # BA:43 clears the last masked match, including a ready duplicate.
            last = max(i for i in range(60, 63) if record[i] & 127 == spell)
            record[last] = 0
            record[47] = (record[47]-1) & 255
            if record[47] < 100:
                removed = index
            updated_records[index] = bytes(record)
            lookahead = True
        # The original keeps scanning the removed node's later slots, then
        # stops at its cleared next link instead of visiting its successor.
        if level or removed is not None:
            break
    if removed is not None:
        del updated_records[removed]
    return ScribeResult(bytes(updated_body), tuple(updated_records), level,
                        lookahead, completed, removed)
