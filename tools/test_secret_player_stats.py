"""Verify player setup against the original loader, not archived runtime fields."""
import hashlib
import struct

import pytest
pytest.importorskip('unicorn')

from tools.secret_melee_oracle import DEFAULT_ROOT, load
from tools.secret_player_oracle import PlayerMachine
from tools.secret_player_stats import StfItem, class_thac_raw, player_stats, stf_items

PLAYER_HASHES = {
    'CHRDATA1.SAV': '99084d6bb280a75bb1da6b7a874dce5c4031a1b76fc7662036b469d9ac003056',
    'CHRDATA1.SFX': 'db38c958698b142a3730cba086919e59cbb3673f42e450f5de482961d3947b7b',
    'CHRDATA2.SAV': '7d0f45141e548ccc5fff877886368f603671f007ebbddbd1fe2dd98b99d807da',
    'CHRDATA2.SFX': 'a1211b1b6107851b47ead67928af61da8b285378cf8370267eeda743b518aee0',
    'CHRDATA3.SAV': 'c47bd5382c120fdd09717ffb1515dfcf46ad75fee02add5e3130cca329fab4ed',
    'CHRDATA4.SAV': '8d76566a5c4c74cd80855d3a418a9767076e1b22c02d6d8abb48619ca74f9c62',
    'CHRDATA4.SFX': '69676667f3daadc7eceed8528a7828846ba047f2dffb14303d272aa18efb32b3',
    'CHRDATA5.SAV': '18a9e00655d48541a4f3118cff799a764ee066b6d425004be82e034928f788ef',
    'CHRDATA6.SAV': '19d95943bca4259eebf67e8a8e74b0865d6cce359faf08fcb005f18305dfd4ce',
}


@pytest.fixture(scope='module')
def inputs():
    if not all((DEFAULT_ROOT / name).is_file() for name in PLAYER_HASHES):
        pytest.skip('never-vendored Secret player inputs absent')
    files = {name: (DEFAULT_ROOT / name).read_bytes() for name in PLAYER_HASHES}
    for name, data in files.items():
        assert hashlib.sha256(data).hexdigest() == PLAYER_HASHES[name], f'held player input changed: {name}'
    assert not any(DEFAULT_ROOT.glob('CHRDATA*.STF')), 'baseline companion absence changed'
    return load(), files


def compare_original(inputs, hero, *, raw=None, stf=None, poison=False):
    retail, held = inputs
    files = dict(held)
    name = f'CHRDATA{hero}.SAV'
    raw = held[name] if raw is None else raw
    files[name] = raw
    if stf is not None:
        files[f'CHRDATA{hero}.STF'] = stf
    actual = PlayerMachine(retail, files, poison=poison).load_player(name)
    projected = player_stats(raw, stf_items(stf or b''), retail.definitions)
    body, normal = actual.body, projected.normal
    assert (normal.current_hp, normal.maximum_hp, normal.thac0, normal.armor_class) == (
        body[437], body[112], 60 - body[426], 60 - body[427])
    assert (normal.primary.rate, normal.secondary.rate) == tuple(body[289:291])
    assert (normal.primary.count, normal.secondary.count, normal.primary.sides, normal.secondary.sides,
            normal.primary.bonus & 255, normal.secondary.bonus & 255) == tuple(body[431:437])
    assert projected.body[106] == body[106] and projected.body[304] == body[304]
    assert len(projected.items) == len(actual.items)
    assert tuple(item.record[52] for item in projected.items) == tuple(item[52] for item in actual.items)
    assert tuple(len(item.children) for item in projected.items) == tuple(map(len, actual.children))
    assert set(actual.checkpoints) == {'after_file_read', 'before_equipment', 'after_equipment',
                                        'after_class', 'precombat_equipment'}
    assert all(event['path'].upper().startswith('C:\\IMPORT\\') for event in actual.events if 'path' in event)
    assert all(event['ax'] >> 8 not in (0x3c, 0x40, 0x41, 0x56) for event in actual.events)
    return actual, projected


@pytest.mark.parametrize('hero', range(1, 7))
def test_all_six_players_execute_original_loader_and_produce_owned_normal_stats(inputs, hero):
    actual, projected = compare_original(inputs, hero)
    assert projected.normal.current_hp == (95, 74, 91, 58, 78, 35)[hero - 1]
    assert len(actual.effects) == (1, 1, 0, 3, 0, 0)[hero - 1]
    assert not actual.items
    find = [event for event in actual.events if event['ax'] >> 8 == 0x4e]
    assert any(event['path'].upper().endswith('.STF') and 'size' not in event for event in find)


@pytest.mark.parametrize('hero', range(1, 7))
@pytest.mark.parametrize('control', ('phantom', 'poison', 'derived', 'level', 'armor'))
def test_source_sensitive_loader_class_equipment_controls(inputs, hero, control):
    retail, files = inputs
    raw = bytearray(files[f'CHRDATA{hero}.SAV'])
    stf = None
    if control == 'phantom':
        for offset in (251, 353, 413, 417):
            raw[offset:offset + 4] = struct.pack('<HH', 0xbeef, 0xdead)
    elif control == 'derived':
        raw[426:437] = bytes([0xa5]) * 11
    elif control == 'level':
        for offset in range(273, 280):
            if raw[offset]:
                raw[offset] += 1
    elif control == 'armor':
        stf = retail.inventories[72] + bytes(4)
    actual, projected = compare_original(inputs, hero, raw=bytes(raw), stf=stf,
                                          poison=control == 'poison')
    if control in ('phantom', 'poison'):
        baseline, _ = compare_original(inputs, hero)
        assert actual.body == baseline.body and actual.items == baseline.items and actual.effects == baseline.effects
    elif control == 'level' and hero <= 4:
        # Player class setup updates base THAC after its first equipment pass;
        # the original pre-combat equipment pass makes the new base effective.
        assert actual.checkpoints['after_class'][426] != actual.body[426]
    elif control == 'armor':
        assert projected.normal.armor_class == (2, 2, 3, 3, 2, 7)[hero - 1]


@pytest.mark.parametrize('slot', range(7))
@pytest.mark.parametrize('level', range(19))
def test_every_class_table_value_matches_secret_own_initialized_table(inputs, slot, level):
    retail, _ = inputs
    assert class_thac_raw(slot, level) == retail.image[0xde20 + 0x4c0c + slot * 19 + level]


def test_original_fighter_thirteen_threshold_does_not_clamp_to_neighboring_game_table(inputs):
    _, files = inputs
    raw = bytearray(files['CHRDATA3.SAV']); raw[275] = 13
    _, projected = compare_original(inputs, 3, raw=bytes(raw))
    assert projected.body[106] == 52
    assert projected.normal.thac0 == 7 and projected.normal.primary.rate == 4


def test_container_children_are_owned_but_not_flattened_into_worn_equipment(inputs):
    retail, _ = inputs
    child = retail.inventories[72] + bytes(4)
    head = bytearray(child); head[46] = 73; head[52] = 0; head[57] = 2
    actual, projected = compare_original(inputs, 3, stf=bytes(head) + child * 2)
    assert len(actual.items) == 1 and len(actual.children[0]) == 2
    assert all(item[52] == 128 for item in actual.children[0])
    assert projected.normal.armor_class == 7


@pytest.mark.parametrize('case', ('usable', 'equal', 'nonhuman', 'ranger8', 'ranger9',
                                  'fighter13', 'ranger15'))
def test_history_equipment_and_thac_eligibility_have_distinct_source_predicates(inputs, case):
    retail, files = inputs
    raw = bytearray(files['CHRDATA6.SAV'])
    raw[273:287] = bytes(14); raw[238] = 0; raw[289] = 2
    raw[107] = 6; raw[278] = 9; raw[239] = 8; raw[282] = 8
    if case == 'equal':
        raw[278] = 8
    elif case == 'nonhuman':
        raw[107] = 3
    elif case in ('ranger8', 'ranger9', 'ranger15'):
        level = int(case.removeprefix('ranger'))
        raw[282] = 0; raw[284] = level
        if level > 8:
            raw[278] = level + 1; raw[239] = level
    elif case == 'fighter13':
        raw[282] = 13; raw[278] = 14; raw[239] = 13
    _, projected = compare_original(inputs, 6, raw=bytes(raw),
                                     stf=retail.inventories[72] + bytes(4))
    if case == 'usable':
        assert (projected.normal.thac0, projected.normal.armor_class, projected.normal.primary.rate) == (12, 3, 3)
    elif case == 'nonhuman':
        assert (projected.normal.thac0, projected.normal.armor_class, projected.normal.primary.rate) == (18, 3, 2)
    elif case == 'equal':
        assert (projected.normal.thac0, projected.normal.armor_class, projected.normal.primary.rate) == (18, 7, 2)


@pytest.mark.parametrize('hero', range(1, 7))
@pytest.mark.parametrize('offset', (112, 437))
def test_original_player_hp_roles_survive_full_loading_and_setup(inputs, hero, offset):
    _, files = inputs
    raw = bytearray(files[f'CHRDATA{hero}.SAV']); raw[offset] -= 1
    _, projected = compare_original(inputs, hero, raw=bytes(raw))
    assert (projected.normal.maximum_hp if offset == 112 else projected.normal.current_hp) == raw[offset]


@pytest.mark.parametrize('payload', (b'X', bytes(66), bytes(68)))
def test_incomplete_stf_records_fail(payload):
    with pytest.raises(ValueError):
        stf_items(payload)


def test_missing_container_children_fail():
    head = bytearray(67); head[46] = 73; head[57] = 2
    with pytest.raises(ValueError):
        stf_items(bytes(head) + bytes(67))


def test_oracle_rejects_unowned_file_paths(inputs):
    retail, _ = inputs
    with pytest.raises(ValueError):
        PlayerMachine(retail, {'..\\CHRDATA1.SAV': bytes(439)})
