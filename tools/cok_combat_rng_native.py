"""DOS CoK combat RNG handoff, rejection controls, and GBBOOT cold resume."""
from pathlib import Path
import json
import shutil
import struct

ROOT = Path(__file__).resolve().parents[1]
SEEDS = (0, 1, 0xDEADBEEF, 0xFFFFFFFF, 0xABCD1234)


def advance(state, count=1):
    for _ in range(count):
        state = (state*0x08088405+1) & 0xFFFFFFFF
    return state


def effects(seed):
    raw = bytearray(130)
    raw[:4] = b'GBEF'
    struct.pack_into('<HHH', raw, 4, 9, 8, 3)
    struct.pack_into('<4H', raw, 32, 1, 0, 1, 0)
    raw[116:120] = b'GBRS'
    struct.pack_into('<3HI', raw, 120, 1, 34, 22, seed)
    return bytes(raw)


def prepare(run):
    if not run.resolve().is_relative_to((ROOT/'native/build').resolve()):
        raise ValueError('fixture outside native/build')
    if run.exists():
        shutil.rmtree(run)
    (run/'H').mkdir(parents=True)
    for p in (ROOT/'native/build').glob('*.com'):
        shutil.copyfile(p, run/'H'/p.name)
        shutil.copyfile(p, run/p.name)
    commands = []
    for i, seed in enumerate(SEEDS):
        (run/f'S{i}.EFX').write_bytes(effects(seed))
        commands += [f'H\\CCCOMBAT /F S{i}.EFX 4660 S{i}.TRC S{i}.OUT /R S{i}.GBR /J',
                     f'if errorlevel 1 echo FAIL > S{i}.ERR']
    commands += ['H\\CCCOMBAT /F S0.EFX 4660 OLD.TRC OLD.OUT /R OLD.GBR']
    invalid = []
    for name, offset, value in [('VERSION', 4, 8), ('MAGIC', 116, 0), ('FLAGS', 120, 0),
                                ('FLAGS2', 120, 3), ('STATUS', 8, 0)]:
        raw = bytearray(effects(1)); raw[offset] = value
        invalid.append((name, bytes(raw)))
    invalid.append(('SHORT', effects(1)[:-1]))
    for name, raw in invalid:
        (run/f'{name}.EFX').write_bytes(raw)
        (run/f'{name}.GBR').write_bytes(b'SENTINEL')
        commands += [f'H\\CCCOMBAT /F {name}.EFX 1 {name}.TRC {name}.OUT /R {name}.GBR /J',
                     f'if errorlevel 1 echo REJECT > {name}.ERR']
    (run/'BADDIR').mkdir()
    commands += ['H\\CCCOMBAT /F S0.EFX 1 WRITE.TRC WRITE.OUT /R BADDIR /J',
                 'if errorlevel 1 echo REJECT > WRITE.ERR',
                 'H\\CCCOMBAT /T 1 1 MODE.TRC /R MODE.GBR /J',
                 'if errorlevel 1 echo REJECT > MODE.ERR',
                 'H\\CCCOMBAT /F S0.EFX 1 NOR.TRC NOR.OUT /J',
                 'if errorlevel 1 echo REJECT > NOR.ERR']
    game = run/'HOST'
    (game/'SAVE').mkdir(parents=True)
    retail = ROOT/'Champions of Krynn'
    for name in ('KRYNN.CFG', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX', 'ITEMS', 'MON1CHA.DAX'):
        shutil.copyfile(retail/name, game/name)
    body = bytearray((retail/'SAVE/CHRDATA1.SAV').read_bytes())
    body[30:89] = bytes(59)
    body[392:394] = bytes(2)
    body[98] = body[407] = 30
    (game/'SAVE/CHRDATA1.SAV').write_bytes(body)
    (game/'SAVE/CHRDATA1.STF').write_bytes(b'')
    (game/'SAVE/CHRDATA1.SFX').write_bytes(b'')
    code = bytearray(22)
    code += bytes([0x21, 0, 34, 0, 2, 0, 255,
                   8, 0, 99, 1, 0, 0x55, 0x0B, 0, 34, 0, 1, 0, 255, 0x24,
                   8, 0, 99, 1, 2, 0x55, 9, 0, 42, 1, 4, 0x55, 0])
    for i in range(4):
        struct.pack_into('<H', code, 4+4*i, 0x7FFE+len(code))
        code += b'\0'
    packed = b''.join(bytes([len(code[i:i+127])-1])+code[i:i+127] for i in range(0,len(code),127))
    (game/'ECL1.DAX').write_bytes(struct.pack('<HBIHH',9,34,0,len(code),len(packed))+packed)
    (game/'EXPECTED.JSON').write_text(json.dumps({'camp_pc':struct.unpack_from('<H',code,12)[0]-0x7FFE}),encoding='utf-8')
    commands += ['cd HOST', 'C:\\GBBOOT /E /2 0 /B 34 /C P /4 > FIRST.TXT',
                 'copy C:\\_GBCR.BIN FIRST.GBR > NUL',
                 'copy C:\\_GBCOMB.TRC FIRST.TRC > NUL',
                 'copy C:\\_GBRES.BIN FIRST.EFX > NUL',
                 'copy GREYBOX.GBS FIRST.GBS > NUL',
                 'C:\\GBBOOT /5 /2 0 /4 > COLD.TXT',
                 'copy GREYBOX.GBS COLD.GBS > NUL']
    # A child returning success with an invalid result must not activate or
    # resume the host. The shim is confined to this staged DOS test directory.
    (run/'FAKE.COM').write_bytes(bytes.fromhex('b8004ccd21'))
    commands += ['cd \\', 'copy CCCOMBAT.COM REAL.COM > NUL', 'copy FAKE.COM CCCOMBAT.COM > NUL']
    good = b'GBCR'+struct.pack('<4HI',2,0,0,1,0xDEADBEEF)+bytes([0,0])+struct.pack('<HH',1,30)
    mutations = {'BVER': (4,1), 'BCOUNT': (10,7), 'BOUT': (6,4), 'BORD': (16,1), 'BCOND': (17,4)}
    bad = {}
    for name,(off,value) in mutations.items():
        raw=bytearray(good);raw[off]=value;bad[name]=bytes(raw)
    bad.update(BSHORT=good[:-1], BEXTRA=good+b'X', BMISS=None)
    oversized=bytearray(good[:16]+bytes(37));oversized[10]=6
    bad['BBIG']=bytes(oversized)
    for name,raw in bad.items():
        folder=run/name
        shutil.copytree(game,folder)
        if raw is not None:
            (folder/'BAD.GBR').write_bytes(raw)
        commands += [f'cd \\{name}', 'del C:\\_GBRES.BIN',
                     ('copy BAD.GBR C:\\_GBCR.BIN > NUL' if raw is not None else 'del C:\\_GBCR.BIN'),
                     'C:\\GBBOOT /E /2 0 /B 34 /C P /4 > FAILED.TXT',
                     'copy C:\\_GBPARTY.GBP AFTER.GBP > NUL',
                     'copy C:\\_GBECL.BIN AFTER.EFX > NUL',
                     'if exist C:\\_GBRES.BIN echo RESUMED > WRONG.TXT']
    commands += ['cd \\', 'copy REAL.COM CCCOMBAT.COM > NUL']
    (run/'RUN.BAT').write_text('\r\n'.join(commands)+'\r\n',encoding='ascii')


def verify(run):
    rows = []
    for i, seed in enumerate(SEEDS):
        assert 'FAIL' not in (run/f'S{i}.ERR').read_text()
        assert (run/f'S{i}.EFX').read_bytes() == effects(seed)
        raw = (run/f'S{i}.GBR').read_bytes()
        assert raw[:4] == b'GBCR' and len(raw) == 28
        assert struct.unpack_from('<H',raw,4)[0] == 2
        assert struct.unpack_from('<I',raw,12)[0] == advance(seed,3)
        trace = (run/f'S{i}.TRC').read_text()
        assert trace.count(' init ') == 3 and 'party-flee - escaped' in trace
        assert ' attack ' not in trace
        rows.append(dict(seed=seed,final=advance(seed,3)))
    raw = (run/'OLD.GBR').read_bytes()
    assert struct.unpack_from('<H',raw,4)[0] == 1 and raw[12:16] == bytes(4)
    for name in ('VERSION','MAGIC','FLAGS','FLAGS2','STATUS','SHORT'):
        assert (run/f'{name}.GBR').read_bytes() == b'SENTINEL'
        assert 'REJECT' in (run/f'{name}.ERR').read_text()
    for name in ('WRITE','MODE','NOR'):
        assert 'REJECT' in (run/f'{name}.ERR').read_text()
    host = run/'HOST'
    trace = (host/'FIRST.TRC').read_text()
    assert trace.count(' init ') == 2 and 'party-flee - escaped' in trace, trace
    assert '1 attack e0 p0 16 10 1 2 28 -' in trace, trace
    raw = (host/'FIRST.GBR').read_bytes()
    assert struct.unpack_from('<H',raw,4)[0] == 2
    assert struct.unpack_from('<I',raw,12)[0] == advance(0x1234,5)
    fx = (host/'FIRST.EFX').read_bytes()
    from tools.cok_native_host import memory
    values = memory(fx)
    assert values[0x5500] == (advance(0x1234) >> 16) % 100
    assert values[0x5502] == (advance(0x1234,6) >> 16) % 100
    assert values[0x5504] == 42
    assert struct.unpack_from('<I',fx,126)[0] == advance(0x1234,6)
    # Entering camp executes the fixture's exit-only PreCampCheck and seeds
    # the three host position registers. Preserve the entire other VM state.
    expected_fx=bytearray(fx)
    struct.pack_into('<H',expected_fx,124,json.loads((host/'EXPECTED.JSON').read_text())['camp_pc'])
    struct.pack_into('<H',expected_fx,196,6)
    struct.pack_into('<3H',expected_fx,204,0xC04F,0x7F79,0xC04E)
    struct.pack_into('<3H',expected_fx,1228,0x80,0,4)
    struct.pack_into('<H',expected_fx,5730,34)
    for name in ('FIRST.GBS','COLD.GBS'):
        cp = (host/name).read_bytes()
        assert struct.unpack_from('<I',cp,48+126)[0] == advance(0x1234,6), name
        assert cp[48:48+5750] == expected_fx, (name,'complete VM after camp entry')
    for name in ('BVER','BCOUNT','BOUT','BORD','BCOND','BSHORT','BEXTRA','BMISS','BBIG'):
        folder=run/name
        assert 'native preview failed' in (folder/'FAILED.TXT').read_text(), name
        assert not (folder/'GREYBOX.GBS').exists(), name
        assert not (folder/'WRONG.TXT').exists() or 'RESUMED' not in (folder/'WRONG.TXT').read_text(), name
        roster=(folder/'AFTER.GBP').read_bytes()
        assert roster[17+407] == 30 and roster[17+98] == 30, name
        paused=(folder/'AFTER.EFX').read_bytes()
        assert struct.unpack_from('<I',paused,126)[0] == advance(0x1234), name
    (run/'results.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
    print('PASS: five full-state combat seeds, nine child and nine host rejections, legacy control, GBBOOT and cold resume')


if __name__ == '__main__':
    import sys
    (prepare if sys.argv[1]=='prepare' else verify)(Path(sys.argv[2]))
