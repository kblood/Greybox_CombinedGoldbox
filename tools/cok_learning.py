"""Staged DOS learning request model; no filesystem mutation.

GBLR v1: 16-byte header, padded GBPR (2476), learning state (8), scribed
spell ids (6), memorized spell ids (6). Requests have zero output fields.
"""
import struct
import zlib

from tools.cok_inventory import Inventory, decode, encode
from tools.cok_scribing import preparation, scribe

LENGTH = 2512
PARTY = 16
STATE = 2492
SCRIBED = 2500
MEMORIZED = 2506


def packet_crc(raw):
    raw = bytearray(raw)
    raw[12:16] = bytes(4)
    return zlib.crc32(raw)


def request(roster, state, mode):
    if len(roster) > 2476 or len(state) != 8 or mode not in (0, 1):
        raise ValueError('invalid learning request inputs')
    raw = bytearray(struct.pack('<4s6H', b'GBLR', 1, mode, LENGTH, 0, 0, 0)
                    + bytes(roster)+bytes(2476-len(roster))+bytes(state)+bytes(12))
    struct.pack_into('<I', raw, 12, packet_crc(raw))
    return bytes(raw)


def _parse(raw, inventory):
    if len(raw) != LENGTH:
        raise ValueError('invalid learning request length')
    magic, version, mode, length, flags, r1, r2 = struct.unpack_from('<4s6H', raw)
    if (magic, version, length, flags) != (b'GBLR', 1, LENGTH, 0) or mode not in (0, 1):
        raise ValueError('invalid learning request header')
    if (r1 | r2 << 16) != packet_crc(raw):
        raise ValueError('invalid learning request CRC')
    party = raw[PARTY:STATE]
    if party[:4] != b'GBPR':
        raise ValueError('missing learning roster')
    version, count, stride, flags = struct.unpack_from('<4H', party, 4)
    identity, schema = struct.unpack_from('<2H', party, 12)
    identity_ok = ((version == 1 and not any(party[12:16]))
                   or (version == 2 and identity == 1 and schema == 1))
    if not identity_ok or count > 6 or stride != 410 or flags:
        raise ValueError('invalid learning roster')
    if any(party[16+count*410:]) or any(raw[SCRIBED:]):
        raise ValueError('nonzero learning request padding/events')
    owners = [party[16+410*i] for i in range(count)]
    inventories = decode(inventory, owners)
    state = bytearray(raw[STATE:SCRIBED])
    if state[0] > 1 or state[1] >= 12 or any(value > 21 for value in state[2:]):
        raise ValueError('invalid learning counters')
    if not state[0] and any(state[1:]) or mode == 1 and not state[0]:
        raise ValueError('inactive learning action')
    if any(state[2+count:]):
        raise ValueError('unused learning counters')
    bodies = [bytes(party[17+410*i:17+410*i+409]) for i in range(count)]
    for i, body in enumerate(bodies):
        if body[88] > 6 or body[88] and state[2+i]:
            raise ValueError('invalid preparation/countdown overlap')
        if any(value == 128 or value > 235 for value in body[30:88]):
            raise ValueError('invalid pending memorization spell')
    return mode, bodies, inventories, state


def _memorize(body, levels, lookahead):
    body = bytearray(body)
    completed = 0
    for offset in range(30, 88):
        value = body[offset]
        if value <= 127:
            continue
        if not lookahead:
            body[offset] -= 128
            completed = body[offset]
            lookahead = True
        else:
            level = levels[value & 127]
            if level:
                return bytes(body), level, completed
    return bytes(body), 0, completed


def advance(raw, inventory, levels):
    """Return a response and an optional unpublished replacement inventory."""
    mode, bodies, inventories, state = _parse(raw, inventory)
    records = [tuple(inv.records[i:i+63] for i in range(0, len(inv.records), 63))
               for inv in inventories]
    # Validate all owners before changing even the private response.
    for body, items in zip(bodies, records):
        scribe(body, items, levels, lookahead=True)
    result = bytearray(raw)
    if mode == 0:
        if not state[0]:
            state[:] = bytes([1, 0, 0, 0, 0, 0, 0, 0])
            for i in range(len(bodies)):
                bodies[i], _ = preparation(bodies[i], records[i], levels)
    else:
        for i, body in enumerate(bodies):
            state[2+i] = max(0, state[2+i]-1)
            if state[2+i] or body[88]:
                continue
            scan = scribe(body, records[i], levels)
            bodies[i], records[i], level = scan.body, scan.records, scan.level
            result[SCRIBED+i] = scan.completed or 0
            if not level:
                bodies[i], level, result[MEMORIZED+i] = _memorize(bodies[i], levels, scan.lookahead)
            state[2+i] = 3*level
        state[1] += 1
        if state[1] == 12:
            state[1] = 0
            for i, body in enumerate(bodies):
                if not body[88]:
                    continue
                body = bytearray(body)
                body[88] -= 1
                bodies[i] = bytes(body)
                if body[88]:
                    continue
                level = scribe(body, records[i], levels, lookahead=True).level
                if not level:
                    bodies[i], level, _ = _memorize(body, levels, True)
                state[2+i] = 3*level
    updated = tuple(Inventory(inv.source, inv.present, inv.cloud, b''.join(items))
                    for inv, items in zip(inventories, records))
    mask = sum(1 << i for i, (before, after) in enumerate(zip(inventories, updated))
               if before != after)
    pending = sum(1 << i for i, items in enumerate(records)
                  if any(record[46] in (39, 40) and any(v > 128 for v in record[60:63]) for record in items))
    struct.pack_into('<H', result, 10, mask | pending << 8)
    for i, body in enumerate(bodies):
        offset = PARTY+17+410*i
        result[offset:offset+409] = body
    result[STATE:SCRIBED] = state
    struct.pack_into('<I', result, 12, packet_crc(result))
    return bytes(result), encode(updated) if mask else None
