"""Archived pointers stay opaque in Python and compiled native roster readers.

These authored transport controls do not normalize existing authority bytes.
Original reload equivalence is established separately by the Task250 oracle.
"""
import hashlib
import struct

import pytest

from tools.secret_player_stats import player_stats, stf_items
from tools.secret_roster import Hero, Roster, decode, encode
from tools.test_secret_native_stats import AUX, Native, image
from tools.test_secret_player_stats import inputs


def variants(inputs):
    source, files = inputs
    item = bytearray(source.inventories[72] + b'\x91\xa2\xb3\xc4')
    item[52] = 0  # Declared unready import; no claim of a held STF baseline.
    body = files['CHRDATA1.SAV']
    stf, sfx = bytes(item) * 2, files['CHRDATA1.SFX']
    result = []
    for mode in ('RAW', 'ZERO', 'POISON'):
        parts = [bytearray(body), bytearray(stf), bytearray(sfx)]
        cells = ((0, (251, 353, 413, 417)), (1, (42, 109)), (2, (5,)))
        ordinal = 0
        for part, offsets in cells:
            for offset in offsets:
                ordinal += 1
                if mode != 'RAW':
                    parts[part][offset:offset + 4] = (
                        bytes(4) if mode == 'ZERO' else
                        struct.pack('<HH', 0xE000 + ordinal * 0x100, 0xFFFF))
        result.append(Roster((Hero(1, *(bytes(p) for p in parts)),), source.definitions))
    return result


def test_pointer_encodings_roundtrip_exactly_and_project_equally(image, inputs):
    encoded, normals, native_coefficients = [], [], []
    for roster in variants(inputs):
        data = encode(roster)
        assert decode(data) == roster and encode(decode(data)) == data
        hero = roster.heroes[0]
        normals.append(player_stats(hero.body, stf_items(hero.stf), roster.catalogue).normal)
        native = Native(image, {'OWNED.GBP': data})
        native.put('partyname', b'OWNED.GBP\0')
        assert not native.call('se_load_secret_party')
        assert native.get('secret_party_loaded', 1) == b'\1'
        assert not native.handles and native.files['OWNED.GBP'] == data
        assert bytes(native.uc.mem_read(AUX, len(data))) == data
        native_coefficients.append(native.get('comb', 38))
        encoded.append(data)
    assert normals[0] == normals[1] == normals[2]
    assert native_coefficients[0] == native_coefficients[1] == native_coefficients[2]
    assert len({hashlib.sha256(data).digest() for data in encoded}) == 3


@pytest.mark.parametrize('mutation', ('short_stf', 'short_sfx', 'children', 'trailing'))
def test_pointer_encodings_do_not_relax_owned_framing(image, inputs, mutation):
    for roster in variants(inputs):
        data = bytearray(encode(roster))
        trailer = 16 + 440
        companion = trailer + 16 + 2048
        if mutation in ('short_stf', 'short_sfx'):
            offset = 2 if mutation == 'short_stf' else 4
            length = struct.unpack_from('<H', data, companion + offset)[0]
            payload = companion + 8
            if mutation == 'short_sfx':
                payload += struct.unpack_from('<H', data, companion + 2)[0]
            del data[payload + length - 1]
            struct.pack_into('<H', data, companion + offset, length - 1)
            struct.pack_into('<H', data, trailer + 10, len(data))
        elif mutation == 'children':
            data[companion + 8 + 46] = 73
            data[companion + 8 + 57] = 2  # Only one child remains.
        else:
            data.append(0)
            struct.pack_into('<H', data, trailer + 10, len(data))
        with pytest.raises(ValueError):
            decode(bytes(data))
        native = Native(image, {'OWNED.GBP': bytes(data)})
        native.put('partyname', b'OWNED.GBP\0')
        assert native.call('se_load_secret_party')
        assert native.get('secret_party_loaded', 1) == b'\0'
        assert not native.handles and native.files['OWNED.GBP'] == bytes(data)
