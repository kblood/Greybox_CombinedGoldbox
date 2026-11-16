"""Checkpoint storage boundaries independent of the DOS fixture generator."""
import struct
import zlib

import pytest

from tools.cok_inventory import Inventory, decode, encode, join_checkpoint, split_checkpoint


def crc(raw):
    result = bytearray(raw)
    result[28:32] = bytes(4)
    struct.pack_into('<I', result, 28, zlib.crc32(result))
    return bytes(result)


def core(version=4):
    length = {1: 8274, 2: 8532, 3: 11104, 4: 11112}[version]
    result = bytearray(length)
    result[:4] = b'GBCP'
    struct.pack_into('<HH', result, 4, version, 1)
    struct.pack_into('<H', result, 20, 836)
    struct.pack_into('<H', result, 24, length)
    result[5798:5802] = b'GBPR'
    struct.pack_into('<4H', result, 5802, 1, 2, 410, 0)
    result[5814], result[6224] = 3, 128
    return crc(result)


def test_literal_envelope_preserves_presence_order_and_serialized_links():
    record = bytes(range(63))
    raw = (b'GBIV\x01\x00\x02\x00' + struct.pack('<II', 95, 0)
           + b'\x03\x03\x00\x00\x3f\x00\x00\x00' + record
           + b'\x80\x00\x00\x00\x00\x00\x00\x00')
    inventories = (Inventory(3, True, True, record), Inventory(128, False, False, b''))
    assert decode(raw, [3, 128]) == inventories
    assert encode(inventories) == raw
    assert encode([Inventory(3, True, False, b'')]) != encode([Inventory(3, False, False, b'')])


@pytest.mark.parametrize('version', [1, 2, 3, 4])
def test_legacy_core_retained_without_inventing_saved_inventory(version):
    raw = core(version)
    assert split_checkpoint(raw) == (raw, None)


def test_large_checkpoint_and_full_file_crc():
    inventories = (Inventory(3, True, False, bytes(range(63))*1100),
                   Inventory(128, True, False, b''))
    raw = join_checkpoint(core(), inventories)
    assert len(raw) > 65535 and raw[4:6] == b'\x05\x00'
    assert raw[24:26] == struct.pack('<H', 11112)
    assert split_checkpoint(raw) == (core(), inventories)
    for offset in [32, 11104, 11112, len(raw)-1]:
        bad = bytearray(raw)
        bad[offset] ^= 1
        with pytest.raises(ValueError, match='CRC'):
            split_checkpoint(bad)


@pytest.mark.parametrize('offset,value', [(4, 2), (6, 7), (12, 1), (16, 0), (17, 2),
                                        (18, 1), (20, 62), (87, 3)])
def test_valid_crc_does_not_mask_invalid_inventory(offset, value):
    raw = bytearray(join_checkpoint(core(), [Inventory(3, True, False, bytes(63)),
                                            Inventory(128, False, False, b'')]))
    raw[11112+offset] = value
    with pytest.raises(ValueError):
        split_checkpoint(crc(raw))


@pytest.mark.parametrize('delta', [-1, 1])
def test_truncated_and_trailing_envelope_rejected_with_valid_crc(delta):
    raw = join_checkpoint(core(), [Inventory(3, False, False, b''),
                                   Inventory(128, False, False, b'')])
    raw = raw[:-1] if delta < 0 else raw+b'x'
    with pytest.raises(ValueError):
        split_checkpoint(crc(raw))


def test_owner_order_must_match_checkpoint_roster():
    with pytest.raises(ValueError, match='owners'):
        join_checkpoint(core(), [Inventory(128, False, False, b''), Inventory(3, False, False, b'')])
    with pytest.raises(ValueError, match='duplicate'):
        encode([Inventory(3, False, False, b'')]*2)


@pytest.mark.parametrize('inventory', [Inventory(3, False, True, b''),
                                     Inventory(3, False, False, bytes(63)),
                                     Inventory(3, True, False, bytes(62))])
def test_invalid_presence_and_partial_records(inventory):
    with pytest.raises(ValueError):
        encode([inventory])
