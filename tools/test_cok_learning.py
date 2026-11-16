"""Packet integrity and independent boundary expectations for DOS learning."""
from pathlib import Path
import re
import struct

import pytest

from tools.cok_inventory import Inventory, encode, decode
from tools.cok_learning import advance, request, packet_crc, STATE, SCRIBED, MEMORIZED
from tools.exepack_unpack import unpack

ROOT = Path(__file__).resolve().parents[1]
LEVELS = bytes([0, 1]+[0]*20+[2]+[0]*85)


def inputs(*, prep=0, count=0, phase=0, charge=101, slots=(129, 150, 0), queue=(129,)):
    body = bytearray(409)
    body[30:30+len(queue)] = bytes(queue)
    body[88] = prep
    roster = struct.pack('<4s6H', b'GBPR', 1, 1, 410, 0, 0, 0)+b'\x03'+body
    item = bytearray(63)
    item[42:46] = b'LINK'
    item[46:48] = bytes([39, charge])
    item[60:63] = bytes(slots)
    inv = encode([Inventory(3, True, True, bytes(item))])
    raw = request(roster, bytes([1, phase, count, 0, 0, 0, 0, 0]), 1)
    return raw, inv


@pytest.mark.parametrize('charge,removed', [(0, False), (99, True), (100, True), (101, False), (255, False)])
def test_scroll_completion_shares_memorization_flag_and_preserves_links(charge, removed):
    raw, inv = inputs(charge=charge)
    out, stage = advance(raw, inv, LEVELS)
    assert out[SCRIBED:MEMORIZED] == bytes([1, 0, 0, 0, 0, 0])
    assert out[MEMORIZED:] == bytes(6)
    assert out[33+30] == 129  # Queue remains pending after scroll completion.
    assert out[33+99] == 1
    assert out[STATE:SCRIBED] == bytes([1, 1, 6, 0, 0, 0, 0, 0])
    assert struct.unpack_from('<I', out, 12)[0] == packet_crc(out)
    after, = decode(stage)
    assert (after.source, after.present, after.cloud) == (3, True, True)
    assert after.records == (b'' if removed else inv[-63:-16]+bytes([charge-1 if charge else 255])+inv[-15:-3]+bytes([0, 150, 0]))
    assert struct.unpack_from('<H', out, 10)[0] == (1 if removed else 0x101)


@pytest.mark.parametrize('count', [0, 1, 2, 21])
def test_due_countdown_precedes_hourly_preparation(count):
    raw, inv = inputs(count=count, slots=(129, 0, 0))
    out, stage = advance(raw, inv, LEVELS)
    assert out[SCRIBED] == int(count <= 1)
    assert (stage is not None) == (count <= 1)
    assert out[STATE+2] == (3 if count <= 1 else count-1)
    raw, inv = inputs(prep=1, phase=11, slots=(129, 0, 0))
    out, stage = advance(raw, inv, LEVELS)
    assert out[33+88] == 0 and out[STATE+1:STATE+3] == bytes([0, 3])
    assert out[SCRIBED:] == bytes(12) and stage is None


@pytest.mark.parametrize('offset,value', [(2495, 1), (2493, 12), (33+88, 7), (33+30, 128), (2506, 1)])
def test_valid_crc_does_not_authorize_invalid_state(offset, value):
    raw, inv = inputs()
    bad = bytearray(raw); bad[offset] = value
    struct.pack_into('<I', bad, 12, packet_crc(bad))
    with pytest.raises(ValueError): advance(bad, inv, LEVELS)


def test_packet_crc_covers_body_and_inventory_owners_must_match():
    raw, inv = inputs()
    bad = bytearray(raw); bad[100] ^= 1
    with pytest.raises(ValueError, match='CRC'): advance(bad, inv, LEVELS)
    other = encode([Inventory(1, True, True, inv[-63:])])
    with pytest.raises(ValueError, match='owners'): advance(raw, other, LEVELS)


@pytest.mark.parametrize('filename,symbol', [('ccinv.asm', 'lr_levels'), ('gbboot.asm', 'learn_levels')])
def test_native_learning_tables_match_original_bytes(filename, symbol):
    executable = ROOT/'Champions of Krynn/START.EXE'
    if not executable.exists(): pytest.skip('held CoK DOS executable unavailable')
    image, _ = unpack(executable)
    base = struct.unpack_from('<H', image, 0xA461)[0]*16
    expected = image[base+0x31B4:base+0x31B4+108*16:16]
    source = (ROOT/'native/src'/filename).read_text(encoding='utf-8')
    values = re.search(rf'^{symbol} db ([\d,]+)$', source, re.M).group(1)
    assert bytes(map(int, values.split(','))) == expected
