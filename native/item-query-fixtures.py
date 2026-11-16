"""Exact GBPS v6 publication and DOS FIND_ITEM checks against owned inventories."""
from pathlib import Path
import json
import shutil
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools.cok_inventory import Inventory, encode


def roster(owners):
    body = bytearray(409); body[:2] = b'\x01A'
    return struct.pack('<4s6H', b'GBPR', 1, len(owners), 410, 0, 0, 0)+b''.join(bytes([i])+body for i in owners)


def record(kind):
    node = bytearray(63); node[:2] = b'\x01Q'; node[42:46] = b'LINK'; node[46] = kind
    return bytes(node)


def seed(count):
    raw = bytearray(3128)
    struct.pack_into('<4s4H', raw, 0, b'GBPS', 5, 1, count, 0)
    raw[14] = 8
    struct.pack_into('<8H', raw, 22, *range(19, 27))  # Deliberately unrelated legacy list.
    return raw


def query():
    code = bytearray(22)
    for kind in range(256):
        code += bytes([3, 0, 0, 0, 1, 9, 0, 0, 1, kind, 0x55, 0x32, 0, kind])
        for flag in range(6):
            code += bytes([0x16+flag, 9, 0, 1 << flag, 1, kind, 0x55])
    return code+b'\0'


def prepare(run):
    for name in ['ccinv', 'ccecl']:
        shutil.copyfile(ROOT/f'native/build/{name}.com', run/f'{name}.com')
    cases = []; commands = []
    def add(name, inventories, *, bad=None):
        g = run/name; g.mkdir()
        owners = [i.source for i in inventories]
        inv = bytearray(encode(inventories)); party = bytearray(roster(owners)); raw = seed(len(owners))
        if name == 'TIMERS': struct.pack_into('<H', raw, 540, 1)
        if name == 'COUNT': struct.pack_into('<H', raw, 8, 0)
        bits = bytearray(32)
        for item in inventories:
            for offset in range(0, len(item.records), 63):
                kind = item.records[offset+46]; bits[kind//8] |= 1 << (kind%8)
        want = bytearray(raw); struct.pack_into('<H', want, 4, 6); want += bits
        if bad == 'owners': party[16] = 4
        elif bad == 'duplicate': inv[24+len(inventories[0].records)] = owners[0]
        elif bad == 'record': inv.pop()
        elif bad == 'length': inv[8] ^= 1
        elif bad == 'flags': inv[17] = 2
        elif bad == 'seedshort': raw.pop()
        elif bad == 'seedlong': raw.append(0)
        elif bad == 'seedversion': raw[4] = 6
        elif bad == 'seedcount': raw[8] = 7
        elif bad == 'seedflags': raw[6] = 0
        elif bad == 'rosterpad': party[12] = 1
        (g/'INVENT.BIN').write_bytes(inv); (g/'PARTY.GBP').write_bytes(party)
        (g/'SEED.BIN').write_bytes(raw); (g/'BEFORE.BIN').write_bytes(raw)
        (g/'INBEFORE.BIN').write_bytes(inv); (g/'WANT.BIN').write_bytes(want)
        (g/'QUERY.BIN').write_bytes(query())
        (g/'DELETE.BIN').write_bytes(bytes(22)+bytes([0x32, 0, 39, 0x40, 0, 39, 9, 0, 1, 1, 0, 0x60, 0]))
        if bad == 'publish': (g/'SEED.BAK').mkdir()
        if bad == 'stage': (g/'SEED.TMP').mkdir()
        return dict(name=name, bad=bad, bits=bits.hex())
    sets = [('EMPTY', []), ('ABSENT', [Inventory(1, False, False, b'')]),
            ('PRESENT', [Inventory(1, True, False, b'')]),
            ('TIMERS', [Inventory(1, True, False, record(39))]),
            ('COUNT', [Inventory(1, True, False, record(39))]),
            ('ALLTYPES', [Inventory(3, True, True, b''.join(map(record, range(256))))]),
            ('LARGE', [Inventory(128, True, False, record(1)*1100+record(255))]),
            ('OWNERS', [Inventory(i, True, i == 2, record(i)+record(0)) for i in [6, 128, 2, 133, 1, 3]])]
    for name, inventories in sets: cases.append(add(name, inventories))
    base = [Inventory(1, True, False, record(39)), Inventory(3, True, True, record(77))]
    for index, bad in enumerate(['owners', 'duplicate', 'record', 'length', 'flags', 'seedshort', 'seedlong',
                                'seedversion', 'seedcount', 'seedflags', 'rosterpad', 'publish', 'stage']):
        cases.append(add(f'BAD{index}', base, bad=bad))
    for case in cases:
        name = case['name']
        commands += [f'cd \\{name}', 'C:\\CCINV Q INVENT.BIN PARTY.GBP SEED.BIN > HELPER.TXT']
        if not case['bad']:
            commands += ['C:\\CCECL QUERY.BIN /G SEED.BIN /B PARTY.GBP /E QUERY.EFX > OUT.TXT',
                         'C:\\CCECL DELETE.BIN /G SEED.BIN /B PARTY.GBP /E DELETE.EFX > DELETE.TXT']
    invalid = []
    original = (run/'ALLTYPES/WANT.BIN').read_bytes()
    for index, problem in enumerate(['short', 'long', 'version', 'count', 'flags', 'timer', 'unknown', 'age']):
        name = f'VM{index}'; g = run/name; g.mkdir()
        raw = bytearray(original)
        if problem == 'short': raw.pop()
        elif problem == 'long': raw.append(0)
        else:
            offset, value = {'version': (4, 7), 'count': (8, 7), 'flags': (6, 0),
                             'timer': (540, 2), 'unknown': (552, 1), 'age': (3112, 1)}[problem]
            raw[offset] = value
        (g/'SEED.BIN').write_bytes(raw); (g/'BEFORE.BIN').write_bytes(raw)
        (g/'QUERY.BIN').write_bytes(query()); (g/'QUERY.EFX').write_bytes(b'prior effect')
        commands += [f'cd \\{name}', 'C:\\CCECL QUERY.BIN /G SEED.BIN /E QUERY.EFX > OUT.TXT']
        invalid.append(name)
    (run/'invalid.json').write_text(json.dumps(invalid), encoding='utf-8')
    (run/'cases.json').write_text(json.dumps(cases), encoding='utf-8')
    (run/'RUN.BAT').write_text('\n'.join(commands)+'\n', encoding='ascii')


def verify(run):
    cases = json.loads((run/'cases.json').read_text(encoding='utf-8'))
    for case in cases:
        g = run/case['name']
        assert (g/'INVENT.BIN').read_bytes() == (g/'INBEFORE.BIN').read_bytes(), (case, 'inventory changed')
        if case['bad']:
            assert b'Inventory could not' in (g/'HELPER.TXT').read_bytes(), case
            assert (g/'SEED.BIN').read_bytes() == (g/'BEFORE.BIN').read_bytes(), (case, 'seed published')
            continue
        assert (g/'HELPER.TXT').read_bytes() == b'', case
        assert (g/'SEED.BIN').read_bytes() == (g/'WANT.BIN').read_bytes(), (case, 'full seed mismatch')
        fx = (g/'QUERY.EFX').read_bytes(); u16 = lambda off: struct.unpack_from('<H', fx, off)[0]
        assert u16(8) == 0 and u16(196) == 256, (case, 'query execution failed')
        memory = {u16(198+2*i): u16(1222+2*i) for i in range(256)}
        bits = bytes.fromhex(case['bits'])
        for kind in range(256):
            assert memory[0x5500+kind] == (1 if bits[kind//8] & (1 << (kind%8)) else 2), (case, kind)
        fx = (g/'DELETE.EFX').read_bytes()
        assert 'Item removal pending.' in (g/'DELETE.TXT').read_text(), case
        assert (u16(8), u16(5724), u16(5726), u16(5728), u16(196)) == (4, 6, 25, 64, 0), (case, 'owned deletion silently continued')
    for name in json.loads((run/'invalid.json').read_text(encoding='utf-8')):
        g = run/name
        assert 'bad or unsupported party seed' in (g/'OUT.TXT').read_text(), name
        assert (g/'QUERY.EFX').read_bytes() == b'prior effect', name
        assert (g/'SEED.BIN').read_bytes() == (g/'BEFORE.BIN').read_bytes(), name
    print(f'PASS: {len(cases)} owned item seed cases, 2048 DOS queries with all comparison flags, eight invalid v6 seeds and deletion halt before mutation')


if __name__ == '__main__':
    {'prepare': prepare, 'verify': verify}[sys.argv[1]](Path(sys.argv[2]))
