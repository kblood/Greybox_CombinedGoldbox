"""DOS oracle for CoK lunar script words, rest and cold checkpoints."""
from pathlib import Path
import json
import runpy
import shutil
import struct
import sys
import zlib

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools.cok_inventory import split_checkpoint

KEYS = list(range(0x4CF9, 0x4CFF))
INITIAL = [3, 0, 1, 8, 1, 6]
U16 = lambda b, o: struct.unpack_from('<H', b, o)[0]


def advance(values, days):
    values = list(values)
    for _ in range(days):
        for moon, threshold in enumerate([8, 1, 6]):
            if values[moon+3] >= threshold:
                values[moon+3] = 0
                values[moon] = 0 if values[moon] >= 3 else values[moon]+1
            else:
                values[moon+3] += 1
    return values


def store(key, value):
    return bytes([9, 0, value, 1])+struct.pack('<H', key)


def clock(step, slot):
    return bytes([0x34, 0, step, 0, slot])


def query():
    return b''.join(bytes([9, 1])+struct.pack('<H', key)+bytes([1])+struct.pack('<H', 0x5300+i)
                    for i, key in enumerate(KEYS))


def memory(fx):
    return {U16(fx, 198+2*i): U16(fx, 1222+2*i) for i in range(U16(fx, 196))}


def dax(raw):
    packed = b''.join(bytes([len(raw[i:i+127])-1])+raw[i:i+127] for i in range(0, len(raw), 127))
    return struct.pack('<HBIHH', 9, 34, 0, len(raw), len(packed))+packed


def prepare(run, root):
    (run/'H').mkdir()
    for p in (root/'native/build').glob('*.com'):
        shutil.copyfile(p, run/'H'/p.name)
    cases = []
    commands = []
    for name, steps, days, marker, fill, initial in [
        ('DAY', [(24, 3)], 1, 'cok', 0, INITIAL),
        ('RAW', [(24, 3)], 1, 'cok', 0, [255]*6),
        ('EDGE', [(23, 3), (1, 3)], 1, 'cok', 0, INITIAL),
        ('MANY', [(255, 3), (255, 3)], 21, 'cok', 0, INITIAL),
        ('RESUME', [(23, 3), (1, 3)], 1, 'cok', 0, INITIAL),
        # Preserve the 65th ECL_CLOCK as an unconsumed capacity halt; the
        # later day advance and query instructions must not run.
        ('CAP', [(0, 1)]*65+[(24, 3)], 0, 'cok', 0, INITIAL),
        ('DAYS', [(255, 4)], 0, 'cok', 0, INITIAL),
        ('LOWER', [(255, 2)]*6, 10, 'cok', 0, INITIAL),
        ('NEW', [(24, 3)], 1, 'cok', 0, None),
        ('FULL', [(24, 3)], 0, 'cok', 507, None),
        ('FULLLATE', [(23, 3), (1, 3)], 0, 'cok', 512, None),
        ('FULLHAVE', [(24, 3)], 1, 'cok', 506, INITIAL),
        ('NOMARK', [(24, 3)], 0, 'none', 0, INITIAL),
        ('DOK', [(24, 3)], 0, 'dok', 0, INITIAL),
    ]:
        g = run/name
        g.mkdir()
        if marker != 'none':
            (g/'KRYNN.CFG').write_bytes(b'fixture')
        if marker == 'dok':
            (g/'DKK.CFG').write_bytes(b'fixture')
        seeds = dict(zip(KEYS, initial or []))
        seeds.update({0x6000+i: 1 for i in range(fill)})
        code = b''.join(store(k, v) for k, v in seeds.items())
        code += (clock(23, 3)+bytes([0x24])+clock(1, 3) if name == 'RESUME'
                 else b''.join(clock(*step) for step in steps))
        if not fill:
            code += query()
        (g/'CODE.BIN').write_bytes(bytes(22)+code+b'\0')
        commands += [f'cd \\{name}']
        args = 'CODE.BIN'
        if name == 'RESUME':
            (g/'CODE.DAX').write_bytes(dax(bytes(22)+code+b'\0'))
            args = 'CODE.DAX 34'
            commands += [f'C:\\H\\CCECL {args} /E BEFORE.EFX > BEFORE.TXT']
            args += ' /R BEFORE.EFX party'
        if name == 'FULL':
            timer = runpy.run_path(str(root/'native/clock-timer-fixtures.py'))
            seed = timer['seed']([timer['node'](1, 70, 5)])
            (g/'TIMER.GBP').write_bytes(seed)
            (g/'BEFORE.GBP').write_bytes(seed)
            args += ' /G TIMER.GBP'
        commands += [f'C:\\H\\CCECL {args} /E OUT.EFX > OUT.TXT']
        cases.append(dict(name=name, steps=steps, days=days, initial=initial,
                          marker=marker, fill=fill, seeds=seeds))
    # Exact rest copies. The handler seeds lunar words without advancing time.
    for name, ticks in [('R287', 287), ('R288', 288), ('R2592', 2592)]:
        g = run/name
        (g/'SAVE').mkdir(parents=True)
        for asset in ['KRYNN.CFG', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX']:
            shutil.copyfile(root/'Champions of Krynn'/asset, g/asset)
        rows = []
        for member in range(1, 7):
            body = bytearray((root/f'Champions of Krynn/SAVE/CHRDATA{member}.SAV').read_bytes())
            body[30:89] = bytes(59)
            body[392:394] = bytes([0, 1])
            body[407] = body[98]
            (g/f'SAVE/CHRDATA{member}.SAV').write_bytes(body)
            (g/f'SAVE/CHRDATA{member}.STF').write_bytes(b'')
            rows.append(body.hex())
        raw = bytearray(22)+bytes([0x21, 0, 34, 0, 2, 0, 255])
        raw += b''.join(store(k, v) for k, v in zip(KEYS, INITIAL))
        raw += store(0x7ED2, 0)+store(0x7ED3, 0)+b'\0'
        for i in range(4):
            struct.pack_into('<H', raw, 4+4*i, 0x7FFE+len(raw))
            raw += b'\0'
        (g/'ECL1.DAX').write_bytes(dax(raw))
        commands += [f'cd \\{name}', 'del C:\\H\\_GBPARTY.GBP',
                     f'C:\\H\\GBBOOT /E /2 {ticks} /B 34 /C P /4 > OUT.TXT']
        cases.append(dict(name=name, ticks=ticks, rows=rows))
    (run/'cases.json').write_text(json.dumps(cases), encoding='utf-8')
    (run/'RUN.BAT').write_text('\n'.join(commands)+'\n', encoding='ascii')


def verify_rest(run, case):
    g = run/case['name']
    cp = bytearray((g/'GREYBOX.GBS').read_bytes())
    assert U16(cp, 4) == 5
    assert split_checkpoint(cp)[1] is not None
    crc = struct.unpack_from('<I', cp, 28)[0]
    cp[28:32] = bytes(4)
    assert zlib.crc32(cp) == crc
    fx = cp[48:5798]
    mem = memory(fx)
    assert [mem.get(k, 0) for k in KEYS] == advance(INITIAL, case['ticks']//288), case['name']
    for i, row in enumerate(case['rows']):
        assert (g/f'SAVE/CHRDATA{i+1}.SAV').read_bytes().hex() == row, (case['name'], i)
        assert cp[5798+17+i*410:5798+17+i*410+409].hex() == row
    return cp


def phase2(run):
    cases = json.loads((run/'cases.json').read_text())
    for case in cases:
        if 'ticks' in case:
            verify_rest(run, case)
            continue
        fx = (run/case['name']/'OUT.EFX').read_bytes()
        mem = memory(fx)
        expected = {int(k): v for k, v in case['seeds'].items()}
        halt_reason = 3 if case['name'] in ['FULL', 'FULLLATE'] else 7 if case['name'] == 'CAP' else 0
        blocked = halt_reason != 0
        assert U16(fx, 8) == (4 if blocked else 0), case['name']
        assert U16(fx, 5724) == halt_reason, case['name']
        if case['name'] == 'CAP':
            assert U16(fx, 2250) == 64, 'capacity halt lost a retained clock event'
            assert U16(fx, 5726) == 378 and U16(fx, 5728) == 0x34, 'capacity halt consumed the 65th clock'
        if case['name'] == 'FULL':
            g = run/'FULL'
            assert (g/'TIMER.GBP').read_bytes() == (g/'BEFORE.GBP').read_bytes(), 'blocked clock changed timers'
            assert U16(fx, 2250) == 0, 'blocked clock recorded a transcript event'
        if case['name'] == 'RESUME':
            before = (run/'RESUME/BEFORE.EFX').read_bytes()
            assert U16(before, 8) == 3 and U16(before, 5742) == 23
            assert [memory(before)[k] for k in KEYS] == INITIAL
        if not blocked and case['marker'] == 'cok' and case['days']:
            expected.update(zip(KEYS, advance(case['initial'] or [0]*6, case['days'])))
        if not case['fill'] and not blocked:
            expected.update({0x5300+i: expected.get(k, 0) for i, k in enumerate(KEYS)})
        assert mem == expected, (case['name'], mem, expected)
        slots = [0]*7
        accepted = (case['steps'][:1] if case['name'] == 'FULLLATE'
                    else case['steps'][:64] if case['name'] == 'CAP'
                    else [] if blocked else case['steps'])
        for step, slot in accepted:
            slots[slot] += step
            for i, radix in enumerate([10, 10, 6, 24, 30, 12, 256]):
                carry, slots[i] = divmod(slots[i], radix)
                if i < 6:
                    slots[i+1] += carry
        assert list(struct.unpack_from('<7H', fx, 5736)) == slots, case['name']
    base = next(c for c in cases if c['name'] == 'R287')
    commands = []
    for name, full in [('COLD', False), ('BLOCK', True)]:
        shutil.copytree(run/'R287', run/name)
        g = run/name
        cp = bytearray((g/'GREYBOX.GBS').read_bytes())
        if full:
            struct.pack_into('<H', cp, 48+196, 512)
            for i in range(512):
                struct.pack_into('<H', cp, 48+198+2*i, 0x6000+i)
                struct.pack_into('<H', cp, 48+1222+2*i, 1)
            cp[28:32] = bytes(4)
            struct.pack_into('<I', cp, 28, zlib.crc32(cp))
            (g/'GREYBOX.GBS').write_bytes(cp)
        (g/'INPUT.GBS').write_bytes(cp)
        (g/'ECL1.DAX').write_bytes(b'poison: resume must not replay ECL')
        commands += [f'cd \\{name}', 'C:\\H\\GBBOOT /5 /2 1 /4 > OUT.TXT',
                     'copy C:\\H\\_GBECL.BIN AFTER.EFX > NUL']
    (run/'cold.json').write_text(json.dumps(dict(base, name='COLD', ticks=288)), encoding='utf-8')
    (run/'RUN.BAT').write_text('\n'.join(commands)+'\n', encoding='ascii')
    print('PASS: 14 ECL lunar cases and three whole-body rest/checkpoint boundaries')


def verify(run):
    verify_rest(run, json.loads((run/'cold.json').read_text()))
    g = run/'BLOCK'
    assert (g/'GREYBOX.GBS').read_bytes() == (g/'INPUT.GBS').read_bytes()
    assert 'Rest stopped: lunar script memory is full' in (g/'OUT.TXT').read_text()
    assert 'Rest iterations: 0' in (g/'OUT.TXT').read_text()
    before = (g/'INPUT.GBS').read_bytes()[48:5798]
    after = (g/'AFTER.EFX').read_bytes()
    assert memory(after) == memory(before)
    assert after[5732:5750] == before[5732:5750]
    print('PASS: cold day carry and memory-full rest preserve the prior checkpoint')


if __name__ == '__main__':
    mode, run = sys.argv[1], Path(sys.argv[2])
    if mode == 'prepare':
        prepare(run, Path(sys.argv[3]))
    elif mode == 'phase2':
        phase2(run)
    else:
        verify(run)
