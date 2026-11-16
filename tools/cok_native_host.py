"""Actual GBBOOT mutation bridge, rollback, and cold checkpoint fixtures."""
from pathlib import Path
import json
import shutil
import struct
import subprocess

from tools.cok_inventory import decode, split_checkpoint

ROOT = Path(__file__).resolve().parents[1]


def memory(fx):
    word = lambda off: struct.unpack_from('<H', fx, off)[0]
    return {word(198+2*i): word(1222+2*i) for i in range(word(196))}


def prepare(run):
    run = Path(run)
    if not run.resolve().is_relative_to((ROOT/'native/build').resolve()):
        raise ValueError('fixture must stay inside native/build')
    if run.exists():
        shutil.rmtree(run)
    (run/'H').mkdir(parents=True)
    for p in (ROOT/'native/build').glob('*.com'):
        shutil.copyfile(p, run/'H'/p.name)
    shutil.copyfile(run/'H/gbboot.com', run/'BOOT.COM')
    shutil.copyfile(run/'H/ccinv.com', run/'INV.COM')
    nasm = shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    for name, source, macro in [('BADBOOT', 'gbboot', 'MUTATION_TEST_BAD_SOURCE')]+[
            (f'FAIL{i}', 'ccinv', f'MC_TEST_FAIL_STAGE={i}') for i in range(6)]:
        subprocess.run([nasm, '-f', 'bin', '-I', str(ROOT/'native/src')+'/', '-D'+macro,
                        str(ROOT/f'native/src/{source}.asm'), '-o', str(run/f'{name}.COM')], check=True)
    retail = ROOT/'Champions of Krynn'
    commands = []
    cases = ['ONE', 'TWO', 'COMBAT', 'EFFECT', 'SOURCE', 'UNKNOWN']+[f'FAULT{i}' for i in range(6)]
    for name in cases:
        game = run/name
        (game/'SAVE').mkdir(parents=True)
        for asset in ['KRYNN.CFG', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX', 'ITEMS']:
            shutil.copyfile(retail/asset, game/asset)
        row = bytearray((retail/'SAVE/CHRDATA1.SAV').read_bytes())
        row[30:89] = bytes(59)
        row[392:394] = bytes(2)
        row[98] = row[407] = 30
        row[213] = 12
        (game/'SAVE/CHRDATA1.SAV').write_bytes(row)
        if name != 'UNKNOWN':
            (game/'SAVE/CHRDATA1.SFX').write_bytes(b'')
        items = []
        for ident in (39, 40):
            item = bytearray(63)
            item[:2] = b'\x01Q'
            item[46] = ident
            items.append(item)
        if name == 'EFFECT':
            items[0][52], items[0][61], items[0][62] = 1, 23, 137
            marker = bytearray(63)
            marker[:2] = b'\x01M'
            marker[46], marker[49], marker[52] = 6, 121, 1
            items.append(marker)
            (game/'SAVE/CHRDATA1.SFX').write_bytes(struct.pack('<BHBBI', 23, 17, 0, 1, 0)+
                                                  struct.pack('<BHBBI', 14, 17, 0, 0, 0))
        original_inventory = b''.join(items)
        (game/'SAVE/CHRDATA1.STF').write_bytes(original_inventory)
        (game/'ORIG.STF').write_bytes(original_inventory)
        b = bytearray(22)
        if name == 'COMBAT':
            b += bytes([0x24])  # Real host empty-combat handoff before the mutation.
        # CLOCK, fixed all-party DAMAGE (five HP), select owner, destroy, successor.
        b += bytes([0x21, 0, 34, 0, 2, 0, 255, 0x34, 0, 1, 0, 1,
                    0x2E, 0, 0xE0, 0, 1, 0, 2, 0, 3, 0, 0,
                    0x0A, 0, 1, 8, 0, 99, 1, 0x20, 0x55, 3, 0, 1, 0, 2])
        call_offset = len(b)
        b += bytes([2, 1, 0, 0, 0x17, 9, 0, 42, 1, 0, 0x55])
        if name == 'TWO':
            b += bytes([0x40, 0, 40, 9, 0, 43, 1, 1, 0x55])
        b += bytes([8, 0, 99, 1, 0x21, 0x55])
        b += bytes([0x1E, 1, 0x9F, 0x7C, 0, 0, 1, 0x10, 0x55, 1, 0x11, 0x55,
                    1, 0x12, 0x55, 1, 0x13, 0x55, 0])
        struct.pack_into('<H', b, call_offset+2, 0x7FFE+len(b))
        b += bytes([0x40, 0, 39, 0x13])
        for i in range(4):
            struct.pack_into('<H', b, 4+4*i, 0x7FFE+len(b))
            b += b'\0'
        packed = b''.join(bytes([len(b[i:i+127])-1])+b[i:i+127] for i in range(0, len(b), 127))
        (game/'ECL1.DAX').write_bytes(struct.pack('<HBIHH', 9, 34, 0, len(b), len(packed))+packed)
        query = bytearray(22)
        for ident in (39, 40):
            query += bytes([9, 0, 0, 1, ident, 0x56, 0x32, 0, ident, 0x16,
                            9, 0, 1, 1, ident, 0x56])
        (game/'QUERY.BIN').write_bytes(query+b'\0')
        commands += [f'cd \\{name}', 'del C:\\H\\_GBPARTY.GBP',
                     'copy C:\\'+('BADBOOT' if name == 'SOURCE' else 'BOOT')+'.COM C:\\H\\GBBOOT.COM > NUL',
                     'copy C:\\'+('FAIL'+name[-1] if name.startswith('FAULT') else 'INV')+'.COM C:\\H\\CCINV.COM > NUL',
                     'C:\\H\\GBBOOT /E /2 0 /B 34 /C P /4 > FIRST.TXT',
                     'copy C:\\H\\_GBPARTY.GBP FIRST.GBP > NUL',
                     'copy C:\\H\\_GBLEARN.INP REQUEST.BIN > NUL',
                     'copy C:\\H\\_GBLEARN.OUT RESPONSE.BIN > NUL',
                     'copy C:\\H\\'+('_GBRES.BIN' if name == 'COMBAT' else '_GBECL.BIN')+' FIRST.EFX > NUL',
                     'copy C:\\H\\_GBINV.BIN ACTIVE.IV > NUL']
        if name in ('ONE', 'TWO', 'COMBAT', 'EFFECT'):
            commands += ['copy GREYBOX.GBS FIRST.GBS > NUL',
                         'C:\\H\\CCECL QUERY.BIN /G C:\\H\\_GBSEED.BIN /B C:\\H\\_GBPARTY.GBP /ID 1 /E QUERY1.EFX > QUERY1.TXT',
                         # Restore removed source items: cold load must trust the checkpoint.
                         'copy ORIG.STF SAVE\\CHRDATA1.STF > NUL',
                         'C:\\H\\GBBOOT /5 /2 0 /4 > COLD.TXT',
                         'copy C:\\H\\_GBPARTY.GBP COLD.GBP > NUL',
                         'C:\\H\\CCECL QUERY.BIN /G C:\\H\\_GBSEED.BIN /B C:\\H\\_GBPARTY.GBP /ID 1 /E QUERY2.EFX > QUERY2.TXT']
    (run/'RUN.BAT').write_text('\n'.join(commands)+'\n', encoding='ascii')
    (run/'cases.json').write_text(json.dumps(cases), encoding='utf-8')


def verify(run):
    run = Path(run)
    for name in json.loads((run/'cases.json').read_text(encoding='utf-8')):
        game = run/name
        party = (game/'FIRST.GBP').read_bytes()
        assert party[17+407] == 25, (name, 'earlier damage not applied once')
        fx = (game/'FIRST.EFX').read_bytes()
        mem = memory(fx)
        inventory = decode((game/'ACTIVE.IV').read_bytes())
        types = [r.records[i+46] for r in inventory for i in range(0, len(r.records), 63)]
        if name in ('ONE', 'TWO', 'COMBAT', 'EFFECT'):
            expected = [] if name == 'TWO' else [40]
            assert types == expected, (name, types)
            candidate = (game/'RESPONSE.BIN').read_bytes()
            assert party == candidate[5798:5798+len(party)], (name, 'candidate roster changed')
            assert mem[0x5500] == 42, name
            rng1 = (0x1234*0x08088405+1) & 0xFFFFFFFF
            rng2 = (rng1*0x08088405+1) & 0xFFFFFFFF
            assert (mem[0x5520], mem[0x5521]) == ((rng1 >> 16) % 100, (rng2 >> 16) % 100), (name, 'RNG draws')
            assert struct.unpack_from('<I', fx, 126)[0] == rng2, (name, 'RNG state')
            assert struct.unpack_from('<H', fx, 5738)[0] == 1, (name, 'clock lost')
            for off in range(2252, 2252+20*struct.unpack_from('<H', fx, 2250)[0], 20):
                if struct.unpack_from('<H', fx, off)[0] == 0x2E:
                    assert struct.unpack_from('<H', fx, off+2)[0] == 0, (name, 'damage not acknowledged')
            assert mem.get(0x5501) == (43 if name == 'TWO' else None), name
            assert [mem[k] for k in (0x5510, 0x5511, 0x5512)] == [party[17+408]]*3, name
            for phase, query in [('FIRST', 'QUERY1'), ('COLD', 'QUERY2')]:
                assert 'Camp saved to' in (game/f'{phase}.TXT').read_text(), (name, phase)
                cp = (game/('FIRST.GBS' if phase == 'FIRST' else 'GREYBOX.GBS')).read_bytes()
                _, saved = split_checkpoint(cp)
                assert [r.records[i+46] for r in saved for i in range(0, len(r.records), 63)] == expected, (name, phase)
                assert cp[5798+17+407] == 25, (name, phase, 'damage replayed')
                assert struct.unpack_from('<I', cp, 48+126)[0] == rng2, (name, phase, 'cold RNG')
                if name == 'EFFECT':
                    assert struct.unpack_from('<H', cp, 8534)[0] == 1, (name, phase, 'effect count')
                    assert cp[8544:8554] == struct.pack('<BBHBBI', 1, 14, 16, 0, 0, 0), (name, phase, 'effect timer')
                    assert cp[8274:8532] == b'\x01\0\0\x40'+bytes(254), (name, phase, 'owned effect bits')
                queries = memory((game/f'{query}.EFX').read_bytes())
                assert [queries[0x5600+i] for i in (39, 40)] == [0, int(name != 'TWO')], (name, phase)
            assert (game/'COLD.GBP').read_bytes() == party, (name, 'cold roster changed')
        else:
            if name != 'UNKNOWN':
                request = (game/'REQUEST.BIN').read_bytes()
                assert party == request[5798:5798+len(party)], (name, 'failed bridge changed roster')
            assert types == [39, 40], (name, 'failed bridge published inventory')
            assert 0x5500 not in mem, (name, 'failed bridge resumed')
            assert not (game/'GREYBOX.GBS').exists(), (name, 'failed bridge saved')
            assert 'native preview failed' in (game/'FIRST.TXT').read_text(), name
        assert not list((run/'H').glob('*.MS?')) and not list((run/'H').glob('*.MB?')), name
    print('PASS: 12 GBBOOT mutation cases, four cold reloads, earlier damage once and six publication failures')


if __name__ == '__main__':
    import sys
    {'prepare': prepare, 'verify': verify}[sys.argv[1]](sys.argv[2])
