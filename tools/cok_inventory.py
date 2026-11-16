"""Lossless owned inventory envelope for the native CoK checkpoint extension.

STF links remain opaque serialized bytes. Runtime list reconstruction, item
effects and scroll consumption are separate from this storage contract.
"""
from dataclasses import dataclass
import struct
import zlib

CORE_LENGTHS = {1: 8274, 2: 8532, 3: 11104, 4: 11112, 5: 11112}


@dataclass(frozen=True)
class Inventory:
    source: int
    present: bool
    cloud: bool
    records: bytes


def encode(inventories):
    inventories = tuple(inventories)
    if len(inventories) > 6:
        raise ValueError('too many inventory owners')
    payload = bytearray()
    seen = set()
    for inv in inventories:
        if inv.source not in (*range(1, 7), *range(128, 134)) or inv.source in seen:
            raise ValueError('invalid/duplicate inventory owner')
        if len(inv.records) % 63 or (not inv.present and (inv.records or inv.cloud)):
            raise ValueError('invalid inventory record length/presence')
        seen.add(inv.source)
        payload += struct.pack('<BBHI', inv.source, int(inv.present)+2*int(inv.cloud), 0, len(inv.records))
        payload += inv.records
    return struct.pack('<4sHHII', b'GBIV', 1, len(inventories), 16+len(payload), 0)+payload


def decode(raw, owners=None):
    if len(raw) < 16:
        raise ValueError('short inventory header')
    magic, version, count, length, reserved = struct.unpack_from('<4sHHII', raw)
    if magic != b'GBIV' or version != 1 or count > 6 or length != len(raw) or reserved:
        raise ValueError('invalid inventory header')
    result = []
    offset = 16
    for _ in range(count):
        if offset+8 > len(raw):
            raise ValueError('short inventory row')
        source, flags, reserved, length = struct.unpack_from('<BBHI', raw, offset)
        offset += 8
        if flags not in (0, 1, 3) or reserved or offset+length > len(raw):
            raise ValueError('invalid inventory row')
        result.append(Inventory(source, bool(flags & 1), bool(flags & 2), bytes(raw[offset:offset+length])))
        offset += length
    if offset != len(raw) or encode(result) != raw:
        raise ValueError('invalid inventory payload')
    if owners is not None and [inv.source for inv in result] != list(owners):
        raise ValueError('inventory owners differ from roster')
    return tuple(result)


def checksum(raw):
    raw = bytearray(raw)
    raw[28:32] = bytes(4)
    return zlib.crc32(raw)


def roster_owners(core):
    if len(core) < 8274 or core[5798:5802] != b'GBPR':
        raise ValueError('missing checkpoint roster')
    version, count, stride, flags = struct.unpack_from('<4H', core, 5802)
    identity, schema = struct.unpack_from('<2H', core, 5810)
    legacy_reserved = core[5810:5814] == bytes(4)
    identity_ok = ((version == 1 and legacy_reserved)
                   or (version == 2 and identity == 1 and schema == 1))
    if (not identity_ok or count > 6 or stride != 410 or flags != 0):
        raise ValueError('invalid checkpoint roster')
    if struct.unpack_from('<H', core, 20)[0] != 16+410*count:
        raise ValueError('invalid checkpoint roster length')
    owners = [core[5814+410*i] for i in range(count)]
    # Apply the same uniqueness/range rule as the inventory envelope.
    encode(Inventory(owner, False, False, b'') for owner in owners)
    return owners


def split_checkpoint(raw):
    if len(raw) < 32 or raw[:4] != b'GBCP':
        raise ValueError('invalid checkpoint header')
    if struct.unpack_from('<H', raw, 6)[0] != 1:
        raise ValueError('invalid checkpoint game')
    version = struct.unpack_from('<H', raw, 4)[0]
    length = CORE_LENGTHS.get(version)
    if length is None or len(raw) < length or (version < 5 and len(raw) != length):
        raise ValueError('invalid checkpoint version/length')
    if struct.unpack_from('<H', raw, 24)[0] != length or struct.unpack_from('<I', raw, 28)[0] != checksum(raw):
        raise ValueError('invalid checkpoint length/CRC')
    core = bytearray(raw[:length])
    owners = roster_owners(core)
    inventory = decode(raw[length:], owners) if version == 5 else None
    if version == 5:
        struct.pack_into('<H', core, 4, 4)
        struct.pack_into('<I', core, 28, checksum(core))
    return bytes(core), inventory


def join_checkpoint(core, inventory):
    checked_core, previous = split_checkpoint(core)
    if previous is not None or len(checked_core) != 11112:
        raise ValueError('expected a v4 checkpoint core')
    inv_bytes = encode(inventory)
    decode(inv_bytes, roster_owners(core))
    result = bytearray(core+inv_bytes)
    struct.pack_into('<H', result, 4, 5)
    struct.pack_into('<I', result, 28, checksum(result))
    return bytes(result)
