"""Whole-record oracle for DOS CoK rest learning; inputs are isolated copies."""
from pathlib import Path
import json
import shutil
import struct
import sys
import zlib

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools.cok_inventory import Inventory, split_checkpoint

LEVELS = {1: 1, 22: 2, 36: 7, 40: 3, 101: 0, 107: 0}
QUERIES = [1, 22, 36, 40, 101, 107, 129, 150, 164, 168, 229, 235]
SCROLL_CASES = ['SCROLL', 'SCROLL2', 'CLOUD', 'SCOLD', 'SINT', 'SREMOVE']


def ecl(period=0, chance=0):
    b = bytearray(22)
    b += bytes([0x21, 0, 34, 0, 2, 0, 255,
                9, 0, period, 1, 0xD2, 0x7E, 9, 0, chance, 1, 0xD3, 0x7E, 0])
    for i in range(4):
        struct.pack_into('<H', b, 4+4*i, 0x7FFE+len(b))
        b += b'\0'
    packed = b''.join(bytes([len(b[i:i+127])-1])+b[i:i+127] for i in range(0, len(b), 127))
    return struct.pack('<HBIHH', 9, 34, 0, len(b), len(packed))+packed


def expected(rows, ticks, phase=0, counts=None, fresh=True):
    rows = [bytearray(r) for r in rows]
    counts = list(counts or [0]*6)
    if fresh:
        for r in rows:
            levels = [max(1, LEVELS[v & 127]) for v in r[30:88] if v > 127]
            r[88] = 0 if not levels else 6 if max(levels) > 2 else 4
    for _ in range(ticks):
        for owner, r in enumerate(rows):
            counts[owner] = max(0, counts[owner]-1)
            if counts[owner] == 0 and r[88] == 0:
                pending = [slot for slot in range(30, 88) if r[slot] > 127]
                if pending:
                    r[pending[0]] -= 128
                    counts[owner] = 3*next((LEVELS[r[slot] & 127] for slot in pending[1:]
                                             if LEVELS[r[slot] & 127]), 0)
        phase = (phase+1) % 12
        if phase == 0:
            for owner, r in enumerate(rows):
                if r[88]:
                    r[88] -= 1
                    if r[88] == 0:
                        counts[owner] = 3*next((LEVELS[v & 127] for v in r[30:88]
                                                 if v > 127 and LEVELS[v & 127]), 0)
    return rows, bytes([1, phase, *counts])


def prepare(run, root):
    h = run/'H'; h.mkdir()
    for src in (root/'native/build').glob('*.com'):
        shutil.copyfile(src, h/src.name)
    base = []
    for owner in range(6):
        r = bytearray((root/f'Champions of Krynn/SAVE/CHRDATA{owner+1}.SAV').read_bytes())
        r[30:89] = bytes(59); r[392:394] = bytes(2); r[407] = r[98]
        base.append(r)
    base[0][30] = base[0][37] = 1
    base[0][35] = 129; base[0][87] = 150
    base[1][32] = 168
    base[2][30:32] = bytes([229, 129])
    base[3][30] = 235
    base[4][30] = 164
    cases = []
    commands = []
    for name, ticks in [(f'T{n}', n) for n in [11, 12, 47, 48, 49, 50, 51, 54, 57, 72, 81, 93]] + [('COLD', 11), ('SCROLL', 51), ('SCROLL2', 51), ('CLOUD', 51), ('JUNK', 51), ('BADID', 51), ('SHORT', 51), ('INT', 93), ('SCOLD', 50), ('SINT', 93), ('SREMOVE', 51)]:
        g = run/name; (g/'SAVE').mkdir(parents=True)
        for asset in ['KRYNN.CFG', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX']:
            shutil.copyfile(root/'Champions of Krynn'/asset, g/asset)
        rows = [bytearray(r) for r in base]
        if name in SCROLL_CASES: rows[5][99] = 0  # Prove completion grants a previously unknown spell.
        if name == 'BADID': rows[5][87] = 236
        inventories = []
        for owner, r in enumerate(rows, 1):
            (g/f'SAVE/CHRDATA{owner}.SAV').write_bytes(r)
            inv = (root/f'Champions of Krynn/SAVE/CHRDATA{owner}.STF').read_bytes()
            if owner == 6 and name in SCROLL_CASES + ['JUNK', 'SHORT']:
                item = bytearray(63); item[:2] = b'\x01Q'
                item[46] = 40 if name == 'SCROLL2' else 39 if name in SCROLL_CASES else 38
                item[47] = 100 if name == 'SREMOVE' else 0
                item[62 if name == 'SCROLL2' else 60] = 129
                inv += item if name != 'SHORT' else item[:-1]
            (g/f'SAVE/CHRDATA{owner}.STF').write_bytes(inv)
            inventories.append(inv.hex())
        if name == 'CLOUD':
            (g/'CLOUD_~1/SAVE').mkdir(parents=True)
            (g/'CLOUD_~1/SAVE/CHRDATA6.STF').write_bytes(bytes.fromhex(inventories[5]))
            (g/'SAVE/CHRDATA6.STF').unlink()
        (g/'ECL1.DAX').write_bytes(ecl(51, 100) if name in ['INT', 'SINT'] else ecl())
        if name in ['INT', 'SINT']: (g/'GREYBOX.GBS').write_bytes(b'previous checkpoint must survive interruption')
        query = bytearray(22)
        for i, ident in enumerate(QUERIES):
            query += bytes([0x3B, 0, ident, 1, 2*i, 0x55, 1, 2*i+1, 0x55])
        (g/'QUERY.BIN').write_bytes(query+b'\0')
        commands += [f'cd \\{name}', 'del C:\\H\\_GBPARTY.GBP',
                     f'C:\\H\\GBBOOT /E /2 {ticks} /B 34 /C P /4 > OUT.TXT',
                     'C:\\H\\CCECL QUERY.BIN /B C:\\H\\_GBPARTY.GBP /ID 1 /E QUERY.EFX > QUERY.TXT']
        cases.append(dict(name=name, ticks=ticks, rows=[r.hex() for r in rows], inventories=inventories,
                          blocked=name in ['BADID', 'SHORT']))
    (run/'cases.json').write_text(json.dumps(cases))
    (run/'RUN.BAT').write_text('\n'.join(commands)+'\n')


def verify_case(run, c, ticks=None):
    g = run/c['name']; out = (g/'OUT.TXT').read_text()
    rows = [bytes.fromhex(r) for r in c['rows']]
    scribing = c['name'] in SCROLL_CASES
    elapsed = 51 if c['name'] in ['INT', 'SINT'] else ticks if ticks is not None else c['ticks']
    completed = scribing and elapsed >= 51
    inventories = [bytearray.fromhex(inv) for inv in c['inventories']]
    if completed:
        # The appended level-one scroll completes after four preparation hours
        # plus three five-minute ticks. Charge zero wraps to 255, retaining it.
        inventories[5][-63+47] = 255
        inventories[5][-63+(62 if c['name'] == 'SCROLL2' else 60)] = 0
        if c['name'] == 'SREMOVE': del inventories[5][-63:]
    for owner, inv in enumerate(c['inventories'], 1):
        prefix = 'CLOUD_~1/' if c['name'] == 'CLOUD' and owner == 6 else ''
        assert (g/f'{prefix}SAVE/CHRDATA{owner}.STF').read_bytes() == inventories[owner-1], (c['name'], 'inventory mismatch')
    if c['blocked']:
        error = ('Inventory could not be loaded or saved.' if c['name'] == 'SHORT'
                 else 'Rest stopped: invalid spell queue/inventory or learning I/O failure')
        assert error in out, (c['name'], out)
        assert 'Rest iterations:' not in out and not (g/'GREYBOX.GBS').exists(), c['name']
        for owner, row in enumerate(rows, 1):
            assert (g/f'SAVE/CHRDATA{owner}.SAV').read_bytes() == row, (c['name'], 'blocked mutation')
        return
    interrupted = c['name'] in ['INT', 'SINT']
    if interrupted:
        assert 'Rest iterations: 51' in out and 'Camp saved to' not in out, out
        assert (g/'GREYBOX.GBS').read_bytes() == b'previous checkpoint must survive interruption'
    else:
        assert 'native preview failed' not in out and 'Camp saved to' in out, (c['name'], out)
    want, state = expected(rows, elapsed, fresh=c.get('fresh', True))
    if scribing:
        if completed: want[5][99] = 1
        if elapsed == 50:
            state = state[:7] + bytes([1])
        if completed and (not c.get('resumed') or c['name'] == 'SCOLD'):
            assert out.count('Scribed spell: 1') == 1, (c['name'], out)
        else:
            assert 'Scribed spell:' not in out, (c['name'], 'scroll completed twice')
    # Check source behavior before format details, so the pre-feature executable
    # fails on missing learning, rather than merely on its old checkpoint version.
    for owner, row in enumerate(want):
        got = (g/f'SAVE/CHRDATA{owner+1}.SAV').read_bytes()
        assert got == row, (c['name'], owner, 'source body', [(i, a, b) for i, (a, b) in enumerate(zip(got, row)) if a != b])
    cp = None if interrupted else bytearray((g/'GREYBOX.GBS').read_bytes())
    if cp is not None:
        assert struct.unpack_from('<H', cp, 4)[0] == 5
        assert split_checkpoint(cp)[1] == tuple(
            Inventory(i+1, True, c['name'] == 'CLOUD' and i == 5, bytes(inv))
            for i, inv in enumerate(inventories)), (c['name'], 'checkpoint inventory')
        crc = struct.unpack_from('<I', cp, 28)[0]; cp[28:32] = bytes(4)
        assert zlib.crc32(cp) == crc, 'checkpoint CRC'
        assert cp[11104:11112] == state, (c['name'], list(cp[11104:11112]), list(state))
    for owner, row in enumerate(want):
        off = 5798+16+owner*410+1
        if cp is not None:
            assert cp[off:off+409] == row, (c['name'], owner, 'checkpoint body')
    fx = (g/'QUERY.EFX').read_bytes(); u16 = lambda off: struct.unpack_from('<H', fx, off)[0]
    mem = {u16(198+2*i): u16(1222+2*i) for i in range(u16(196))}
    for i, ident in enumerate(QUERIES):
        hit = next(((slot, owner) for owner, r in enumerate(want) for slot, val in enumerate(r[30:88]) if val == ident), (255, 5))
        assert (mem[0x5500+2*i], mem[0x5501+2*i]) == hit, (c['name'], ident, hit)


def phase_two(run):
    cases = json.loads((run/'cases.json').read_text())
    for c in cases:
        verify_case(run, c)
    # Keep an independent pending-scroll checkpoint before SCOLD is resumed.
    scroll_seed = (run/'SCOLD/GREYBOX.GBS').read_bytes()
    # Resume independent DOS processes at both preparation and per-spell boundaries.
    commands = []; resumed = []
    for name, extra in [('COLD', 40), ('T50', 1), ('T51', 6), ('T72', 9),
                        ('SCROLL', 6), ('SCROLL2', 6), ('CLOUD', 6), ('SCOLD', 1), ('SREMOVE', 6)]:
        c = next(c for c in cases if c['name'] == name).copy()
        c['resumed'] = True
        c['ticks'] += extra; resumed.append(c)
        (run/name/'ECL1.DAX').write_bytes(b'poisoned: checkpoint must not replay ECL')
        commands += [f'cd \\{name}', f'C:\\H\\GBBOOT /5 /2 {extra} /4 > OUT.TXT',
                     'C:\\H\\CCECL QUERY.BIN /B C:\\H\\_GBPARTY.GBP /ID 1 /E QUERY.EFX > QUERY.TXT']
    original = next(c for c in cases if c['name'] == 'T11')
    cp_seed = (run/'T11/GREYBOX.GBS').read_bytes()
    for name in ['ZERO', 'V3', 'FLAG', 'PHASE', 'COUNT', 'PREP', 'OVERLAP', 'ID']:
        g = run/name; shutil.copytree(run/'T11', g)
        cp = bytearray(cp_seed)
        c = dict(original, name=name, ticks=1)
        if name == 'ZERO':
            for owner in range(6): cp[5798+17+410*owner+88] = 0
            cp[11104:11112] = bytes([1, 0, 0, 0, 0, 0, 0, 0])
            c['fresh'] = False
        elif name == 'V3':
            cp = cp[:11104]; struct.pack_into('<HH', cp, 4, 3, 1)
            struct.pack_into('<H', cp, 24, len(cp))
        else:
            offset, value = {'FLAG': (11104, 2), 'PHASE': (11105, 12),
                             'COUNT': (11106, 22), 'PREP': (5798+17+88, 7),
                             'OVERLAP': (11106, 1), 'ID': (5798+17+35, 236)}[name]
            cp[offset] = value
            # Valid inventory differs from the active one: reject before activation.
            cp[11136] ^= 1
        cp[28:32] = bytes(4); struct.pack_into('<I', cp, 28, zlib.crc32(cp))
        (g/'GREYBOX.GBS').write_bytes(cp)
        (g/'INPUT.GBS').write_bytes(cp)
        commands += [f'cd \\{name}']
        if name in ['ZERO', 'V3']:
            resumed.append(c)
            commands += ['C:\\H\\GBBOOT /5 /2 1 /4 > OUT.TXT',
                         'C:\\H\\CCECL QUERY.BIN /B C:\\H\\_GBPARTY.GBP /ID 1 /E QUERY.EFX > QUERY.TXT']
        else:
            for i, path in enumerate(['_GBPARTY.GBP', '_GBECL.BIN', '_GBSESS.GBS', '_GBINV.BIN']):
                commands += [f'copy C:\\H\\{path} BEFORE{i}.BIN > NUL']
            commands += ['C:\\H\\GBBOOT /5 /X > OUT.TXT']
            for i, path in enumerate(['_GBPARTY.GBP', '_GBECL.BIN', '_GBSESS.GBS', '_GBINV.BIN']):
                commands += [f'copy C:\\H\\{path} AFTER{i}.BIN > NUL']
    for name in ['SBLOCK', 'SMERGE', 'SIOFAIL']:
        g = run/name; shutil.copytree(run/'SCOLD', g)
        cp = bytearray(scroll_seed)
        if name != 'SIOFAIL':
            ident = 12 if name == 'SBLOCK' else 39
            cp[8274:8532] = bytes(258)
            struct.pack_into('<H', cp, 8274, 1)
            cp[8276+5*32+ident//8] = 1 << (ident%8)
            cp[8532:11104] = bytes(2572)
            struct.pack_into('<HH', cp, 8532, 1, 1)
            cp[8536+5] = 1
            struct.pack_into('<BBHBB4s', cp, 8544, 6, ident, 5, 0, 1, b'\xef\xbe\xad\xde')
            struct.pack_into('<H', cp, 16, 287)
            off = 5798+17+5*410
            cp[off+407] = cp[off+98]-1
        cp[28:32] = bytes(4); struct.pack_into('<I', cp, 28, zlib.crc32(cp))
        (g/'GREYBOX.GBS').write_bytes(cp)
        (g/'INPUT.GBS').write_bytes(cp)
        commands += [f'cd \\{name}']
        if name == 'SIOFAIL':
            commands += ['del C:\\H\\_GBLEARN.INP', 'mkdir C:\\H\\_GBLEARN.INP']
        commands += ['C:\\H\\GBBOOT /5 /2 1 /4 > OUT.TXT',
                     'copy C:\\H\\_GBINV.BIN ACTIVE.BIN > NUL',
                     'copy C:\\H\\_GBPARTY.GBP PARTY.BIN > NUL',
                     'copy C:\\H\\_GBECL.BIN EFFECT.BIN > NUL']
        if name == 'SIOFAIL': commands += ['rmdir C:\\H\\_GBLEARN.INP']
    (run/'resumed.json').write_text(json.dumps(resumed))
    (run/'RUN.BAT').write_text('\n'.join(commands)+'\n')
    print('PASS: 23 DOS learning cases, hourly/level boundaries, scroll completion/removal/interruption, exact bodies, queries and preflight')


if __name__ == '__main__':
    mode, run = sys.argv[1], Path(sys.argv[2])
    if mode == 'prepare': prepare(run, Path(sys.argv[3]))
    elif mode == 'phase2': phase_two(run)
    else:
        for c in json.loads((run/'resumed.json').read_text()): verify_case(run, c)
        for name in ['FLAG', 'PHASE', 'COUNT', 'PREP', 'OVERLAP', 'ID']:
            g = run/name; out = (g/'OUT.TXT').read_text()
            assert 'native preview failed' in out and 'Camp restored' not in out, name
            assert (g/'GREYBOX.GBS').read_bytes() == (g/'INPUT.GBS').read_bytes(), name
            for i in range(4):
                assert (g/f'BEFORE{i}.BIN').read_bytes() == (g/f'AFTER{i}.BIN').read_bytes(), (name, i)
        for name in ['SBLOCK', 'SMERGE', 'SIOFAIL']:
            g = run/name; original = (g/'INPUT.GBS').read_bytes()
            out = (g/'OUT.TXT').read_text()
            if name != 'SMERGE':
                assert 'native preview failed' in out and 'Scribed spell:' not in out, (name, out)
                assert (g/'GREYBOX.GBS').read_bytes() == original, (name, 'checkpoint changed')
                assert (g/'ACTIVE.BIN').read_bytes() == original[11112:], (name, 'inventory activated')
                assert (g/'PARTY.BIN').read_bytes() == original[5798:8274], (name, 'party changed')
                assert (g/'EFFECT.BIN').read_bytes()[5732:5750] == original[48+5732:48+5750], (name, 'clock changed')
                if name == 'SBLOCK': assert 'Rest iterations: 0' in out and 'unsupported effect expiry 12' in out, out
                else: assert 'learning I/O failure' in out, out
            else:
                assert out.count('Scribed spell: 1') == 1 and 'Rest iterations: 1' in out, out
                cp = (g/'GREYBOX.GBS').read_bytes(); split_checkpoint(cp)
                off = 5798+17+5*410
                want = bytearray(original[off:off+409])
                want[99] = 1; want[407] += 1
                struct.pack_into('<H', want, 96, struct.unpack_from('<H', want, 96)[0]+1)
                assert cp[off:off+409] == want, 'planned learning overwrote healing/haste age'
                assert struct.unpack_from('<H', cp, 8534)[0] == 0, 'expired timer survived'
                assert (g/'SAVE/CHRDATA6.SAV').read_bytes() == want
                assert (g/'SAVE/CHRDATA6.SFX').read_bytes() == b''
        print('PASS: timer-blocked scroll activation, failed learning request I/O, and same-tick scribing/healing/haste expiry')
        print('PASS: eleven cold continuations including pending/completed scrolls/zero preparation/v3 migration, and six valid-CRC learning-state rejections')
