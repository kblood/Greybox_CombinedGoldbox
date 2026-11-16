"""Whole-response DOS tests for the staged CCINV learning operation."""
from pathlib import Path
import itertools
import json
import random
import shutil
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools.cok_inventory import Inventory, encode
from tools.cok_learning import advance, request, packet_crc
from tools.exepack_unpack import unpack


def levels():
    image, _ = unpack(ROOT/'Champions of Krynn/START.EXE')
    base = struct.unpack_from('<H', image, 0xA461)[0]*16
    return image[base+0x31B4:base+0x31B4+108*16:16]


def body(queue=(), prep=0):
    result = bytearray(random.Random(0x2B3CF).randbytes(409))
    result[:4] = b'\x03ABC'
    result[30:88] = bytes(queue)+bytes(58-len(queue))
    result[88] = prep
    return bytes(result)


def node(slots=(), charge=101, kind=39):
    result = bytearray(random.Random(0x33368).randbytes(63))
    result[46:48] = bytes([kind, charge])
    result[60:63] = bytes(slots)+bytes(3-len(slots))
    return bytes(result)


def roster(rows, owners):
    result = bytearray(struct.pack('<4s6H', b'GBPR', 1, len(rows), 410, 0, 0, 0))
    for owner, row in zip(owners, rows):
        result += bytes([owner])+row
    return bytes(result)


def prepare(run):
    shutil.copyfile(ROOT/'native/build/ccinv.com', run/'CCINV.COM')
    cases, commands = [], []
    table = levels()
    def add(raw, inv, *, reject=False):
        name = f'C{len(cases):04d}'
        g = run/name
        g.mkdir()
        (g/'INPUT.BIN').write_bytes(raw)
        (g/'INVENT.BIN').write_bytes(inv)
        (g/'BEFORE.BIN').write_bytes(inv)
        (g/'OUTPUT.BIN').write_bytes(b'prior response')
        (g/'INVENT.NEW').write_bytes(b'prior stage')
        if reject:
            try:
                advance(raw, inv, table)
            except ValueError:
                pass
            else:
                raise AssertionError('negative fixture is valid')
        else:
            output, stage = advance(raw, inv, table)
            (g/'WANT.BIN').write_bytes(output)
            (g/'WANT.NEW').write_bytes(stage if stage is not None else b'prior stage')
        commands.extend([f'cd \\{name}', 'C:\\CCINV R INVENT.BIN INPUT.BIN OUTPUT.BIN > OUT.TXT'])
        cases.append(dict(name=name, reject=reject))
    for prep, phase, countdown, charge, slots in itertools.product(
            (0, 1), (0, 11), (0, 1, 2), (0, 100, 101, 255),
            ([129, 0, 0], [129, 2, 1], [129, 150, 0], [229, 0, 0])):
        if prep and countdown:
            continue
        raw = request(roster([body([129, 168], prep)], [3]), bytes([1, phase, countdown, 0, 0, 0, 0, 0]), 1)
        inv = encode([Inventory(3, True, True, node(slots, charge)+node([150], 102))])
        add(raw, inv)
    for queue, spell, count in itertools.product(([], [129], [229], [168], [129]*58), (1, 101, 40), (0, 1, 256)):
        raw = request(roster([body(queue)], [1]), bytes(8), 0)
        add(raw, encode([Inventory(1, True, False, node([128+spell])*count)]))
    # Six owners, reordered sources, native ownership, absent and empty files.
    owners = [6, 128, 2, 5, 1, 133]
    rows = [body([129, 150]) for _ in owners]
    inv = encode([Inventory(owner, i != 2, i == 3,
                            node([168], 100) if i in (0, 1, 3, 5) else b'')
                  for i, owner in enumerate(owners)])
    raw = request(roster(rows, owners), bytes([1, 0, 0, 0, 0, 0, 0, 0]), 1)
    add(raw, inv)
    # Selection beyond a 16-bit inventory offset; retain every preceding byte.
    large = node([], kind=1)*1100+node([129], 100)
    add(request(roster([body()], [1]), bytes([1, 0, 0, 0, 0, 0, 0, 0]), 1),
        encode([Inventory(1, True, False, large)]))
    add(request(roster([], []), bytes(8), 0), encode([]))
    add(request(roster([body([], 4)], [1]), bytes([1, 7, 0, 0, 0, 0, 0, 0]), 0),
        encode([Inventory(1, False, False, b'')]))
    # Header, counters, roster, padding, event and pending-id rejection.
    valid_raw, valid_inv = raw, inv
    for offset, value in [(0, 0), (4, 2), (6, 2), (8, 0), (10, 1),
                          (16, 0), (22, 7), (24, 1), (26, 1), (28, 1),
                          (2492, 2), (2493, 12), (2494, 22), (2500, 1),
                          (16+17+88, 7), (16+17+30, 128), (16+17+30, 236)]:
        bad = bytearray(valid_raw)
        bad[offset] = value
        struct.pack_into('<I', bad, 12, packet_crc(bad))
        add(bad, valid_inv, reject=True)
    bad = bytearray(valid_raw)
    bad[50] ^= 1
    add(bad, valid_inv, reject=True)
    add(valid_raw[:-1], valid_inv, reject=True)
    add(valid_raw+b'x', valid_inv, reject=True)
    bad = bytearray(valid_inv)
    bad[24+60] = 236
    add(valid_raw, bad, reject=True)
    add(valid_raw, valid_inv[:-1], reject=True)
    for scenario in ['EXPORT', 'ROLLBACK', 'STAGEBAD', 'MASKBAD', 'NATIVE', 'ABSENT']:
        g = run/scenario
        (g/'SAVE').mkdir(parents=True)
        (g/'CLOUD_~1/SAVE').mkdir(parents=True)
        paths = {'SAVE/CHRDATA1.STF': b'old first inventory',
                 'CLOUD_~1/SAVE/CHRDATA5.STF': b'old cloud inventory'}
        for path, old in paths.items():
            (g/path).write_bytes(old)
        inventories = [Inventory(1, True, False, node([1])+node([22])),
                       Inventory(5, True, True, b'')]
        if scenario == 'NATIVE':
            inventories[1] = Inventory(128, True, False, node([129]))
        if scenario == 'ABSENT':
            inventories[0] = Inventory(1, False, False, b'')
        inv = encode(inventories)
        (g/'INVENT.BIN').write_bytes(inv)
        (g/'BEFORE.BIN').write_bytes(inv)
        if scenario == 'ROLLBACK':
            (g/'CLOUD_~1/SAVE/CHRDATA5.BAK').mkdir()
        if scenario == 'STAGEBAD':
            (g/'CLOUD_~1/SAVE/CHRDATA5.TMP').mkdir()
        mask = 4 if scenario == 'MASKBAD' else 3
        commands.extend([f'cd \\{scenario}', f'C:\\CCINV W INVENT.BIN {mask} > OUT.TXT'])
        rejected = scenario in ['ROLLBACK', 'STAGEBAD', 'MASKBAD']
        expected = dict(paths)
        if not rejected:
            for inv in inventories:
                if inv.source < 128 and inv.present:
                    prefix = 'CLOUD_~1/SAVE' if inv.cloud else 'SAVE'
                    expected[f'{prefix}/CHRDATA{inv.source}.STF'] = inv.records
        cases.append(dict(name=scenario, export=True, reject=rejected,
                          expected={path: value.hex() for path, value in expected.items()}))
    (run/'RUN.BAT').write_text('\n'.join(commands)+'\n', encoding='ascii')
    (run/'cases.json').write_text(json.dumps(cases), encoding='utf-8')


def verify(run):
    cases = json.loads((run/'cases.json').read_text(encoding='utf-8'))
    for case in cases:
        g = run/case['name']
        assert (g/'INVENT.BIN').read_bytes() == (g/'BEFORE.BIN').read_bytes(), (case, 'active inventory changed')
        if case.get('export'):
            output = (g/'OUT.TXT').read_bytes()
            assert (b'Inventory could not' in output) if case['reject'] else output == b'', case
            for path, expected in case['expected'].items():
                assert (g/path).read_bytes().hex() == expected, (case, path)
            assert sorted(str(p.relative_to(g)).replace('\\', '/') for p in g.rglob('*.STF')) == sorted(case['expected']), case
            continue
        if case['reject']:
            assert b'Inventory could not' in (g/'OUT.TXT').read_bytes(), case
            assert (g/'OUTPUT.BIN').read_bytes() == b'prior response', case
            assert (g/'INVENT.NEW').read_bytes() == b'prior stage', case
        else:
            assert (g/'OUT.TXT').read_bytes() == b'', (case, 'unexpected rejection')
            for actual, expected in [('OUTPUT.BIN', 'WANT.BIN'), ('INVENT.NEW', 'WANT.NEW')]:
                got, want = (g/actual).read_bytes(), (g/expected).read_bytes()
                assert got == want, (case, actual, [(i,a,b) for i,(a,b) in enumerate(zip(got,want)) if a!=b][:12], len(got),len(want))
    print(f'PASS: {len(cases)} DOS staged learning cases; exact responses/inventory, owner isolation, large offsets and rejection before publication')


if __name__ == '__main__':
    {'prepare': prepare, 'verify': verify}[sys.argv[1]](Path(sys.argv[2]))
