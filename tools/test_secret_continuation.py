"""Reference continuation ownership, extent and phase controls.

These are coordinator-design checks; they do not claim a native boot fix.
The stopped retail/marker DOS experiments remain separate runtime evidence.
"""
from dataclasses import replace
from pathlib import Path
import shutil
import struct
import subprocess

import pytest

from tools.secret_continuation import (
    Continuation, Phase, HEADER, PATH_KEYS, SECTION_KEYS, encode, decode,
    validate, path_bytes, read_path, bind_result, projected_roster,
    check_settled, activate, make_receipt, check_effect, check_stream, bind_advance,
    check_menu_edit,
    Context, CONTEXT_OFFSET, CONTEXT_BYTES, BODY_OFFSET, encode_context,
)
from tools.secret_roster import Hero, Roster, encode as roster_bytes
from tools.test_secret_player_stats import inputs


def effect(status):
    data = bytearray(5750)
    data[:4] = b'GBEF'
    struct.pack_into('<3H', data, 4, 9, 8, status)
    data[116:120] = b'GBRS'
    struct.pack_into('<H', data, 120, 12 | int(status == 3))
    struct.pack_into('<H', data, 122, 16)
    struct.pack_into('<H', data, 124, 21)
    data[2246:2250] = b'GBSX'
    data[5720:5724] = b'GBHD'
    data[5708:5712] = b'GBES'
    data[5732:5736] = b'GBCL'
    return bytes(data)


@pytest.fixture(scope='module')
def prepared(inputs):
    source, files = inputs
    roster = roster_bytes(Roster(tuple(Hero(i, files[f'CHRDATA{i}.SAV'],
        sfx=files.get(f'CHRDATA{i}.SFX', b'')) for i in range(1, 7)), source.definitions))
    paths = ('D:\\ECL.GLB', 'C:\\PARTY.GBP', 'C:\\REQUEST.BIN',
             'C:\\RESULT.BIN', 'C:\\PAUSED.EFX', 'C:\\SEED.BIN',
             'C:\\COMBAT.OUT', 'C:\\NEXT.EFX', 'C:\\PARTY.GSK', 'C:\\WORK')
    request = struct.pack('<4s3H', b'GBHR', 2, 4, 0)
    request += b''.join(path_bytes(paths[PATH_KEYS.index(k)]) for k in ('result', 'roster', 'paused'))
    seed = bytearray(150)
    struct.pack_into('<4s3H', seed, 0, b'GBPS', 1, 1, 6)
    # Source identity crosses a 16-bit size boundary to exercise u32 lengths.
    # Two real GLIB members: a bounded area16 program, plus a large unused
    # member. Total archive size exercises u32 identity without making the
    # selected ECL exceed the native 16,000-byte block ceiling.
    block = bytes(20) + b'\x24\0'
    table = struct.pack('>5H', 2, 16, 1, 17, 2)
    first = 32 + len(table)
    second = first + len(block)
    size = second + 140000
    glib = b'GLIB' + struct.pack('>IHBB', size, 3, 0, 1) + b'DATA'
    glib += struct.pack('>4I', 32, first, second, size) + table + block + bytes(140000)
    identity = struct.pack('<4s2H2I', b'GBID', 1, 16, len(glib), 0) + glib
    return Continuation(Phase.PREPARED, 16, 6, paths,
        (request, roster, effect(3), bytes(seed), identity) + (b'',) * 5)


def result(record, outcome=0):
    roster = record.part('roster')
    data = struct.pack('<4s6H', b'GBCR', 3, outcome, 0, record.count, len(roster), 0)
    for i in range(record.count):
        maximum = roster[16 + i * 440 + 1 + 112]
        data += struct.pack('<BBHH', i, 0, max(0, maximum - 1), maximum)
    return data + roster


def with_part(record, name, data):
    parts = list(record.sections)
    parts[SECTION_KEYS.index(name)] = data
    return replace(record, sections=tuple(parts))


def test_large_prepared_round_trip(prepared):
    data = encode(prepared)
    assert len(data) > 65535
    assert decode(data) == prepared


VALID_CONTEXTS = (
    Context(), Context(flags=1,z=65535), Context(flags=2,l=65535),
    Context(flags=0x44,c=255,host_answer=65535), Context(flags=8,y=255),
    Context(flags=16,o=255), Context(flags=32,w=255),
    Context(flags=0x44,c=0,host_answer=256),
    Context(flags=0x7f,z=65535,l=65535,c=255,y=255,o=255,w=255,host_answer=65535),
)


@pytest.mark.parametrize('context',VALID_CONTEXTS)
@pytest.mark.parametrize('interactive',[False,True])
def test_context_round_trip_preserves_presence_widths_and_mode(prepared,context,interactive):
    record=replace(prepared,context=context,interactive=interactive)
    raw=encode(record)
    assert raw[:6]==b'GSK3\x03\0'
    assert raw[CONTEXT_OFFSET:BODY_OFFSET]==encode_context(context,interactive)
    assert decode(raw)==record


INVALID_CONTEXTS = (
    None, {}, Context(flags=True), Context(flags=128), Context(flags=-1),
    Context(flags=1,z=-1), Context(flags=1,z=65536), Context(flags=1,z=True),
    Context(flags=2,l=65536), Context(flags=0x44,c=256,host_answer=256),
    Context(flags=8,y=256), Context(flags=16,o=256), Context(flags=32,w=256),
    Context(flags=0x44,host_answer=65536), Context(z=1), Context(l=1),
    Context(c=1), Context(y=1), Context(o=1), Context(w=1), Context(host_answer=1),
    Context(flags=4,c=1), Context(flags=64,host_answer=256),
    Context(flags=0x44,c=3,host_answer=65535),
)


@pytest.mark.parametrize('context',INVALID_CONTEXTS)
def test_context_invalid_domain_presence_and_coupling_rejected(prepared,context):
    with pytest.raises(ValueError):encode(replace(prepared,context=context))


@pytest.mark.parametrize('offset,value',[(0,0),(4,2),(6,31),(8,128),(10,1),
    (12,1),(14,1),(16,1),(18,1),(20,1),(22,1),(24,1),(26,1),(28,1),(30,1)])
def test_wire_context_rejects_foreign_fields_reserved_and_mode(prepared,offset,value):
    raw=bytearray(encode(prepared))
    struct.pack_into('<H',raw,CONTEXT_OFFSET+offset,value)
    with pytest.raises(ValueError):decode(bytes(raw))


def test_legacy_gsk1_rejected_without_inferred_context(prepared):
    raw=bytearray(encode(prepared))
    raw[:4]=b'GSK1'
    struct.pack_into('<H',raw,4,1)
    del raw[CONTEXT_OFFSET:BODY_OFFSET]
    before=bytes(raw)
    with pytest.raises(ValueError):decode(raw)
    assert bytes(raw)==before


def test_context_preserved_across_combat_cursor_and_exact_receipts(prepared):
    context=Context(flags=0x7f,z=65535,l=65535,c=210,y=255,o=255,w=255,host_answer=1234)
    p=replace(prepared,context=context,interactive=True)
    r=result(p)
    complete=bind_result(p,r,b'party\r\n')
    roster=projected_roster(complete,r)
    menu=menu_effect(0x15)
    active=activate(complete,menu,producer_receipt=make_receipt(complete,menu,wrapper_exit=0),
        settled_result=r[:14]+b'\1\0'+r[16:],settled_roster=roster)
    token=struct.pack('<4s7H',b'GBMO',2,0,2,21,16,0x101,0x15)
    cursor=bind_advance(active,resume_kind=1,outcome=token,roster=roster)
    terminal=activate(cursor,effect(0),producer_receipt=make_receipt(cursor,effect(0),wrapper_exit=0),
        settled_result=b'',settled_roster=roster)
    for record in (p,complete,active,cursor,terminal):
        assert record.context==context and decode(encode(record)).context==context
    different=replace(terminal,context=replace(context,z=65534))
    with pytest.raises(ValueError):validate(different)


@pytest.mark.parametrize('outcome,token', [(0, b'party\r\n'), (1, b'enemy\r\n'),
                                        (2, b'draw\r\n'), (3, b'flee\r\n')])
def test_exact_result_outcome_and_settlement(prepared, outcome, token):
    raw = result(prepared, outcome)
    bound = bind_result(prepared, raw, token)
    assert decode(encode(bound)) == bound
    settled = raw[:14] + b'\1\0' + raw[16:]
    roster = projected_roster(bound, raw)
    check_settled(bound, settled, roster)
    active = activate(bound, effect(0), producer_receipt=make_receipt(bound, effect(0), wrapper_exit=0),
                      settled_result=settled, settled_roster=roster)
    assert decode(encode(active)) == active
    assert active.part('paused') == prepared.part('paused')
    assert active.part('result') == raw


@pytest.mark.parametrize('offset,value', [(4, 4), (6, 3), (8, 3), (10, 2),
                                        (12, 7), (16, 63), (18, 2), (20, 1), (22, 1)])
def test_header_identity_and_reserved_rejection(prepared, offset, value):
    data = bytearray(encode(prepared))
    struct.pack_into('<H', data, offset, value)
    with pytest.raises(ValueError):
        decode(bytes(data))


@pytest.mark.parametrize('change', ['truncate', 'trailing', 'u32-wrap', 'section-length'])
def test_extent_rejection(prepared, change):
    data = bytearray(encode(prepared))
    if change == 'truncate': data = data[:-1]
    elif change == 'trailing': data += b'\0'
    elif change == 'u32-wrap': struct.pack_into('<I', data, 24, 0xFFFFFFFF)
    else: struct.pack_into('<I', data, 24, 345)
    with pytest.raises(ValueError):
        decode(bytes(data))


@pytest.mark.parametrize('path', ['party.GBP', 'C:PARTY.GBP', 'C:\\..\\P.GBP',
    'C:\\DATA\\.\\P.GBP', 'C:\\DATA\\P.GBP.', 'C:\\DATA//P.GBP',
    'C:\\DATA\\\\P.GBP', 'C:\\P Q.GBP', 'C:\\P?.GBP', 'C:\\A\0.GBP',
    'C:\\NUL.BIN', 'C:\\COM1.EFX', 'C:\\CLOCK$.IDN', 'C:\\LONGPARTY.GBP',
    'C:\\P[1].EFX', 'C:\\P+1.EFX', 'C:\\P=1.EFX'])
def test_path_alias_rejection(path):
    with pytest.raises(ValueError): path_bytes(path)


@pytest.mark.parametrize('kind', ['duplicate', 'case', 'hp-backup', 'wrong-owner', 'same-stem',
                                'replay', 'authority-scratch', 'source-alias', 'source-temp', 'source-backup'])
def test_owned_path_conflicts(prepared, kind):
    paths = list(prepared.paths)
    if kind == 'duplicate': paths[0] = paths[1]
    elif kind == 'case': paths[0] = paths[1].lower()
    elif kind == 'hp-backup': paths[0] = 'C:\\PARTY.GSB'
    elif kind == 'wrong-owner': paths[8] = 'C:\\FOREIGN.GSK'
    elif kind == 'same-stem': paths[7] = 'C:\\PAUSED.BIN'
    elif kind == 'replay': paths[0] = 'C:\\WORK\\GBR.EFX'
    elif kind == 'source-alias': paths[0] = 'C:\\WORK\\SRC.GLB'
    elif kind == 'source-temp': paths[0] = 'C:\\WORK\\SRC.GNG'
    elif kind == 'source-backup': paths[0] = 'C:\\WORK\\SRC.GOG'
    else: paths[0] = 'C:\\PARTY.GKT'
    with pytest.raises(ValueError): validate(replace(prepared, paths=tuple(paths)))


@pytest.mark.parametrize('key', ['successor', 'workdir'])
def test_derived_scratch_must_fit_complete_native_path_bank(prepared, key):
    paths = list(prepared.paths)
    directory = 'C:\\' + '\\'.join(['ABCDEFGH'] * 11)
    paths[PATH_KEYS.index(key)] = directory + '\\ABCDEFG.X' if key == 'successor' else directory
    path_bytes(paths[PATH_KEYS.index(key)])  # The input alone is canonical.
    with pytest.raises(ValueError): validate(replace(prepared, paths=tuple(paths)))


@pytest.mark.parametrize('key', ['request', 'roster', 'paused', 'seed', 'identity'])
def test_frozen_input_rejection(prepared, key):
    part = prepared.part(key)
    with pytest.raises(ValueError): validate(with_part(prepared, key, part[:-1]))


@pytest.mark.parametrize('field', ['preimage', 'count', 'consumed', 'max', 'ordinal', 'outcome'])
def test_foreign_completion_cannot_bind(prepared, field):
    raw = bytearray(result(prepared))
    if field == 'preimage': raw[-1] ^= 1
    elif field == 'count': struct.pack_into('<H', raw, 10, 5)
    elif field == 'consumed': struct.pack_into('<H', raw, 14, 1)
    elif field == 'max': struct.pack_into('<H', raw, 20, 0)
    elif field == 'ordinal': raw[16] = 2
    else: struct.pack_into('<H', raw, 6, 1)
    with pytest.raises(ValueError): bind_result(prepared, bytes(raw), b'party\r\n')


@pytest.mark.parametrize('change', ['child-failure', 'unsettled', 'foreign-result',
                                   'foreign-roster', 'loop', 'partial', 'stream'])
def test_output_file_is_not_activation_authority(prepared, change):
    raw = result(prepared)
    bound = bind_result(prepared, raw, b'party\r\n')
    settled = bytearray(raw[:14] + b'\1\0' + raw[16:])
    roster = bytearray(projected_roster(bound, raw))
    output = bytearray(effect(0))
    code = 0
    if change == 'child-failure': code = 1
    elif change == 'unsettled': settled[14] = 0
    elif change == 'foreign-result': settled[-1] ^= 1
    elif change == 'foreign-roster': roster[-1] ^= 1
    elif change == 'loop': struct.pack_into('<H', output, 5724, 10)
    elif change == 'partial': output = output[:-1]
    else: struct.pack_into('<H', output, 6, 0x108)
    with pytest.raises(ValueError):
        activate(bound, bytes(output), producer_receipt=make_receipt(bound, bytes(output), wrapper_exit=code),
                 settled_result=bytes(settled), settled_roster=bytes(roster))


@pytest.mark.parametrize('kind', ['absent', 'truncated', 'foreign-input', 'foreign-output', 'trailing'])
def test_exact_completion_receipt_is_required(prepared, kind):
    raw = result(prepared)
    bound = bind_result(prepared, raw, b'party\r\n')
    receipt = bytearray(make_receipt(bound, effect(0), wrapper_exit=0))
    if kind == 'absent': receipt = bytearray()
    elif kind == 'truncated': receipt = receipt[:-1]
    elif kind == 'foreign-input': receipt[80] ^= 1
    elif kind == 'foreign-output': receipt[-1] ^= 1
    else: receipt += b'\0'
    with pytest.raises(ValueError):
        activate(bound, effect(0), producer_receipt=bytes(receipt),
                 settled_result=raw[:14] + b'\1\0' + raw[16:],
                 settled_roster=projected_roster(bound, raw))


@pytest.mark.parametrize('offset,value', [(120, 0), (124, 19), (124, 65535), (5732, 0)])
def test_nonresumable_paused_state_is_rejected(prepared, offset, value):
    data = bytearray(prepared.part('paused'))
    struct.pack_into('<H', data, offset, value)
    with pytest.raises(ValueError): validate(with_part(prepared, 'paused', bytes(data)))


def test_phase_transitions_cannot_be_repeated(prepared):
    bound = bind_result(prepared, result(prepared), b'party\r\n')
    with pytest.raises(ValueError): bind_result(bound, result(prepared), b'party\r\n')
    with pytest.raises(ValueError): validate(with_part(prepared, 'result', result(prepared)))


def test_interactive_mode_is_frozen_in_the_input_receipt(prepared):
    interactive = replace(prepared, interactive=True)
    assert decode(encode(interactive)) == interactive
    bound = bind_result(interactive, result(prepared), b'party\r\n')
    receipt = make_receipt(bound, effect(0), wrapper_exit=0)
    with pytest.raises(ValueError):
        activate(replace(bound, interactive=False), effect(0), producer_receipt=receipt,
                 settled_result=result(prepared)[:14] + b'\1\0' + result(prepared)[16:],
                 settled_roster=projected_roster(bound, result(prepared)))


@pytest.mark.parametrize('offset,value', [(6, 9), (14, 9), (15, 9), (16, 5),
                                        (17, 9), (18, 9), (19, 17), (20, 5), (21, 1)])
def test_seed_list_shape_is_validated_before_publication(prepared, offset, value):
    data = bytearray(prepared.part('seed'))
    data[offset] = value
    with pytest.raises(ValueError): validate(with_part(prepared, 'seed', bytes(data)))


@pytest.mark.parametrize('offset', [54, 134])
def test_seed_member_entries_must_belong_to_owned_roster(prepared, offset):
    data = bytearray(prepared.part('seed'))
    data[16 if offset == 54 else 20] = 1
    struct.pack_into('<H', data, offset, 7)
    with pytest.raises(ValueError): validate(with_part(prepared, 'seed', bytes(data)))


@pytest.mark.parametrize('status,flags,reason', [(3, 0, 0), (3, 1, 7),
                                             (0, 0, 7), (1, 0, 10)])
def test_successor_state_and_halt_fields_must_agree(prepared, status, flags, reason):
    bound = bind_result(prepared, result(prepared), b'party\r\n')
    data = bytearray(effect(status))
    struct.pack_into('<H', data, 120, flags)
    struct.pack_into('<H', data, 5724, reason)
    with pytest.raises(ValueError): make_receipt(bound, bytes(data), wrapper_exit=0)


@pytest.mark.parametrize('field', ['paths', 'sections'])
def test_mutable_containers_cannot_be_authority(prepared, field):
    with pytest.raises(ValueError): validate(replace(prepared, **{field: list(getattr(prepared, field))}))


def test_prepared_hp_matches_native_prelaunch_invariant(prepared):
    roster = bytearray(prepared.part('roster'))
    roster[16 + 1 + 437] = roster[16 + 1 + 112] + 1
    with pytest.raises(ValueError): validate(with_part(prepared, 'roster', bytes(roster)))


def menu_effect(opcode):
    """Native v15 offsets and event operands, with fixed zero bank padding."""
    data = bytearray(effect(0) + bytes(182))
    struct.pack_into('<H', data, 4, 15)
    struct.pack_into('<H', data, 8, 2)
    struct.pack_into('<H', data, 120, 13)
    struct.pack_into('<H', data, 2250, 1)
    count = {0x0f: 0, 0x10: 8, 0x15: 2, 0x22: 2, 0x2c: 5, 0x1d: 1}.get(opcode, 2)
    dest = 65535 if opcode in (0x22, 0x1d) else 0x101
    flags = {0x22: 3, 0x1d: 2}.get(opcode, 1)
    event = [opcode, 2, dest, count] + [0] * 6
    if opcode == 0x15: event[1:5] = [3, dest, 0, count]
    elif opcode == 0x0f: event[3] = dest
    elif opcode == 0x10: event[2:4] = [count, dest]
    elif opcode == 0x2c: event[1], event[7] = 6, dest
    elif opcode in (0x22, 0x1d): event[1:] = [0] * 9
    struct.pack_into('<10H', data, 2252, *event)
    data[5750:5754] = b'GBMN'
    struct.pack_into('<10H', data, 5754, flags, dest, count, opcode, 0, 0, 21, 16, dest, opcode)
    data[5774:5778] = b'GBMS'
    data[5920:5924] = b'GBRF'
    if opcode != 0x1d:
        data[5786:5790] = b'GBMT'
        segments = [] if opcode in (0x0f, 0x10) else [b'\x04'] * (count + int(opcode in (0x15, 0x22)))
        if opcode == 0x22: segments[1:] = [b'\x64\x54\xc0', b'\x38\xf0\0']
        struct.pack_into('<H', data, 5790, len(segments))
        texts = b''.join(bytes([len(part)]) + part for part in segments)
        data[5792:5792+len(texts)] = texts
    return bytes(data)


def fixed_stream(output, count=1):
    chunk = struct.unpack_from('<H', output, 2250)[0]
    rows = b''.join(output[2252+i*20:2272+i*20] + output[3532+i*34:3566+i*34] for i in range(chunk))
    return struct.pack('<4s2H', b'GBSL', 1, count) + bytes((count-chunk)*54) + rows


def packed_stream(output):
    # 44 six-bit value-1 characters plus terminator: 34 packed bytes.
    packed = int('000001' * 44 + '000000' + '00', 2).to_bytes(34, 'big')
    row = struct.pack('<10H', 0x11, 1, *([0]*8))
    row += struct.pack('<H4sH', 65535, b'GBPX', 0) + bytes(26)
    # The final row is the terminal menu event, preceded by a long PRINT.
    terminal = output[2252:2272] + output[3532:3566]
    return (struct.pack('<4s2H', b'GBSL', 2, 2) + row + terminal
            + struct.pack('<4s4H', b'GBPX', 1, 1, len(packed), 0)
            + struct.pack('<4H', 0, 0, len(packed), 44) + packed)


@pytest.mark.parametrize('opcode', [0x0f, 0x10, 0x15, 0x2b, 0x2c])
@pytest.mark.parametrize('version', [0, 1, 2])
def test_supported_secret_long_menu_and_bundle_receipt(prepared, opcode, version):
    bound = bind_result(replace(prepared, interactive=True), result(prepared), b'party\r\n')
    output = menu_effect(opcode)
    stream = b''
    if version:
        output = output[:6] + struct.pack('<H', 0x108) + output[8:]
        stream = fixed_stream(output) if version == 1 else packed_stream(output)
    receipt = make_receipt(bound, output, wrapper_exit=0, stream=stream)
    active = activate(bound, output, stream=stream, producer_receipt=receipt,
        settled_result=result(prepared)[:14] + b'\1\0' + result(prepared)[16:],
        settled_roster=projected_roster(bound, result(prepared)))
    assert decode(encode(active)) == active
    assert active.part('stream') == stream


@pytest.mark.parametrize('offset,value', [(5754, 2), (5758, 256), (5762, 1), (5764, 1),
    (5766, 22), (5768, 17), (5770, 2), (5772, 0x31), (5784, 4),
    (5790, 1), (5792, 129), (5918, 1), (5924, 2), (5930, 1), (2256, 9), (2260, 9)])
def test_menu_shape_and_identity_rejections(offset, value):
    output = bytearray(menu_effect(0x15))
    struct.pack_into('<H', output, offset, value)
    with pytest.raises(ValueError): check_effect(bytes(output), 16, pending=False)


@pytest.mark.parametrize('opcode', [0x22, 0x31, 0x39, 0x1c, 0x1d, 0x40])
def test_secret_unsupported_menus_remain_rejected(opcode):
    with pytest.raises(ValueError): check_effect(menu_effect(opcode), 16, pending=False)


def test_menu_requires_frozen_interactive_context(prepared):
    bound = bind_result(prepared, result(prepared), b'party\r\n')
    with pytest.raises(ValueError): make_receipt(bound, menu_effect(0x15), wrapper_exit=0)


def test_v1_stream_u32_extent(prepared):
    bound = bind_result(replace(prepared, interactive=True), result(prepared), b'party\r\n')
    output = bytearray(menu_effect(0x15))
    struct.pack_into('<H', output, 6, 0x108)
    stream = fixed_stream(output, 1300)
    assert len(stream) > 65535
    make_receipt(bound, bytes(output), wrapper_exit=0, stream=stream)


@pytest.mark.parametrize('change', ['absent', 'unflagged', 'truncated', 'trailing', 'version',
    'count', 'tag-magic', 'tag-index', 'tag-padding', 'directory-owner', 'directory-offset',
    'packed-length', 'decoded-length', 'payload-byte', 'extension-reserved', 'terminal-event',
    'terminal-text', 'private-tag'])
def test_complete_stream_rejects_malformed_and_foreign_bundles(change):
    output = bytearray(menu_effect(0x15))
    struct.pack_into('<H', output, 6, 0x108)
    stream = bytearray(packed_stream(output))
    if change == 'absent': stream.clear()
    elif change == 'unflagged': struct.pack_into('<H', output, 6, 8)
    elif change == 'truncated': stream = stream[:-1]
    elif change == 'trailing': stream += b'\0'
    elif change == 'version': struct.pack_into('<H', stream, 4, 3)
    elif change == 'count': struct.pack_into('<H', stream, 6, 3)
    elif change == 'tag-magic': stream[30] ^= 1
    elif change == 'tag-index': struct.pack_into('<H', stream, 34, 1)
    elif change == 'tag-padding': stream[36] = 1
    elif change == 'directory-owner': struct.pack_into('<H', stream, 128, 1)
    elif change == 'directory-offset': struct.pack_into('<H', stream, 130, 1)
    elif change == 'packed-length': struct.pack_into('<H', stream, 132, 0)
    elif change == 'decoded-length': struct.pack_into('<H', stream, 134, 43)
    elif change == 'payload-byte': stream[136] = 0
    elif change == 'extension-reserved': struct.pack_into('<H', stream, 126, 1)
    elif change == 'terminal-event': stream[62] ^= 1
    elif change == 'terminal-text': stream[82] ^= 1
    else: stream[30:34] = b'DREF'
    with pytest.raises(ValueError): check_stream(bytes(stream), bytes(output))


def test_stream_bytes_are_owned_by_exact_receipt(prepared):
    bound = bind_result(replace(prepared, interactive=True), result(prepared), b'party\r\n')
    output = bytearray(menu_effect(0x15))
    struct.pack_into('<H', output, 6, 0x108)
    stream = packed_stream(output)
    receipt = make_receipt(bound, bytes(output), wrapper_exit=0, stream=stream)
    foreign = bytearray(stream)
    foreign[12] ^= 1  # Another well-shaped PRINT event in the earlier chunk.
    check_stream(bytes(foreign), bytes(output))
    with pytest.raises(ValueError):
        activate(bound, bytes(output), stream=bytes(foreign), producer_receipt=receipt,
            settled_result=result(prepared)[:14] + b'\1\0' + result(prepared)[16:],
            settled_roster=projected_roster(bound, result(prepared)))


@pytest.mark.parametrize('change', [None, 'magic', 'sentinel', 'reserved', 'length', 'bounds', 'published-sentinel'])
def test_v2_terminal_reference_is_completely_resolved(change):
    output = bytearray(effect(0))
    struct.pack_into('<H', output, 6, 0x108)
    struct.pack_into('<H', output, 2250, 1)
    struct.pack_into('<2H', output, 2252, 0x11, 1)
    struct.pack_into('<H4s4H', output, 3532, 65535, b'DREF', 16, 20, 34, 100)
    packed = int('000001' * 44 + '000000' + '00', 2).to_bytes(34, 'big')
    row = output[2252:2272] + struct.pack('<H4sH', 65535, b'GBPX', 0) + bytes(26)
    stream = (struct.pack('<4s2H', b'GBSL', 2, 1) + row
        + struct.pack('<4s4H', b'GBPX', 1, 1, 34, 0)
        + struct.pack('<4H', 0, 0, 34, 44) + packed)
    if change == 'magic': output[3534] ^= 1
    elif change == 'sentinel': struct.pack_into('<H', output, 3532, 33)
    elif change == 'reserved': output[3546] = 1
    elif change == 'length': struct.pack_into('<H', output, 3542, 33)
    elif change == 'bounds': struct.pack_into('<H', output, 3544, 21)
    elif change == 'published-sentinel':
        stream = bytearray(stream)
        struct.pack_into('<H', stream, 28, 32)
    if change is None:
        check_stream(stream, bytes(output))
    else:
        with pytest.raises(ValueError): check_stream(stream, bytes(output))


@pytest.fixture(scope='module')
def native_v2_image(tmp_path_factory):
    """Compile the actual shared host validator, using private test files."""
    pytest.importorskip('unicorn')
    nasm = shutil.which('nasm') or str(Path.home() / 'AppData/Local/bin/NASM/nasm.exe')
    if not Path(nasm).is_file() and not shutil.which(nasm):
        pytest.skip('NASM absent')
    src = Path(__file__).resolve().parents[1] / 'native/src'
    declarations = '\n'.join(line for line in (src / 'cchost.asm').read_text().splitlines()
                             if line.startswith('v2_') and (' dw ' in line or ' times ' in line))
    folder = tmp_path_factory.mktemp('secret-bundle-validator')
    asm, binary = folder / 'probe.asm', folder / 'probe.bin'
    asm.write_text('cpu 386\nbits 16\norg 0\ndw start, done, v2_extent\n'
        'start:\ncall validate_gbsl_v2\njc bad\nmov ax, 1\njmp done\n'
        'bad:\nxor ax, ax\ndone:\nnop\n'
        + (src / 'cchost_gbsl_v2.inc').read_text() + '\n' + declarations + '\n', encoding='ascii')
    proc = subprocess.run([nasm, '-f', 'bin', str(asm), '-o', str(binary)],
                          capture_output=True, text=True, timeout=30)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    image = binary.read_bytes()
    return image, struct.unpack_from('<3H', image)


def native_v2_accepts(image, stream):
    import unicorn
    from unicorn import x86_const as x86
    code, (start, done, extent) = image
    base = 0x10000
    uc = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_16)
    uc.mem_map(0, 0x40000)
    uc.mem_write(base, code)
    uc.mem_write(base + extent, struct.pack('<H', len(stream)))
    for reg in (x86.UC_X86_REG_CS, x86.UC_X86_REG_DS, x86.UC_X86_REG_ES, x86.UC_X86_REG_SS):
        uc.reg_write(reg, base >> 4)
    uc.reg_write(x86.UC_X86_REG_SP, 0xfff0)
    uc.reg_write(x86.UC_X86_REG_EFLAGS, 2)
    position = 0

    def dos(machine, interrupt, _):
        nonlocal position
        assert interrupt == 0x21
        ax = machine.reg_read(x86.UC_X86_REG_AX)
        if ax == 0x4200:
            position = (machine.reg_read(x86.UC_X86_REG_CX) << 16) | machine.reg_read(x86.UC_X86_REG_DX)
            machine.reg_write(x86.UC_X86_REG_AX, position & 65535)
            machine.reg_write(x86.UC_X86_REG_DX, position >> 16)
        else:
            assert ax >> 8 == 0x3f
            length = machine.reg_read(x86.UC_X86_REG_CX)
            dest = machine.reg_read(x86.UC_X86_REG_DX)
            part = stream[position:position+length]
            machine.mem_write(base + dest, part)
            position += len(part)
            machine.reg_write(x86.UC_X86_REG_AX, len(part))
        machine.reg_write(x86.UC_X86_REG_EFLAGS, machine.reg_read(x86.UC_X86_REG_EFLAGS) & ~1)

    uc.hook_add(unicorn.UC_HOOK_INTR, dos)
    uc.emu_start(base + start, base + done, count=100000)
    return uc.reg_read(x86.UC_X86_REG_AX) == 1


@pytest.mark.parametrize('offset,value', [(None, None), (4, 1), (6, 0), (118, 2),
    (120, 0), (126, 1), (128, 1), (130, 1), (132, 0), (134, 32), (134, 43),
    (34, 1), (36, 1), (136, 0)])
def test_model_v2_matches_compiled_native_validator(native_v2_image, offset, value):
    output = bytearray(menu_effect(0x15))
    struct.pack_into('<H', output, 6, 0x108)
    stream = bytearray(packed_stream(output))
    if offset is not None:
        struct.pack_into('<H', stream, offset, value)
    accepted = native_v2_accepts(native_v2_image, bytes(stream))
    assert accepted == (offset is None)
    if accepted:
        check_stream(bytes(stream), bytes(output))
    else:
        with pytest.raises(ValueError): check_stream(bytes(stream), bytes(output))


@pytest.mark.parametrize('size', [4, 6, 32, None])
def test_old_gsk2_semantics_never_admitted(prepared, size):
    raw = bytearray(encode(prepared))
    raw[:4] = b'GSK2'
    struct.pack_into('<H', raw, 4, 2)
    if size is not None: raw = raw[:size]
    before = bytes(raw)
    with pytest.raises(ValueError): decode(raw)
    assert bytes(raw) == before


@pytest.mark.parametrize('flags', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 14, 15, 28, 29, 0x800D, 0xffff])
def test_secret_effect_requires_exclusive_long_revision_marker(flags):
    raw = bytearray(effect(0))
    struct.pack_into('<H', raw, 120, flags)
    with pytest.raises(ValueError): check_effect(bytes(raw), 16, pending=False)
