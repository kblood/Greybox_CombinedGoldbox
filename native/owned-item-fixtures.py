"""Discriminating post-scribing/cold-resume item-query defect probe."""
from pathlib import Path
import json
import shutil
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT/'native'))
import runpy
ecl = runpy.run_path(str(ROOT/'native/rest-learn-fixtures.py'))['ecl']
from tools.cok_inventory import split_checkpoint

RUN = Path(sys.argv[2])


def prepare():
    assert RUN.resolve().is_relative_to((ROOT/'native/build').resolve())
    if RUN.exists(): shutil.rmtree(RUN)
    RUN.mkdir()
    (RUN/'H').mkdir()
    for p in (ROOT/'native/build').glob('*.com'): shutil.copyfile(p, RUN/'H'/p.name)
    commands = []
    for name, charge in [('REMOVE', 100), ('RETAIN', 101)]:
        g = RUN/name; (g/'SAVE').mkdir(parents=True)
        game = ROOT/'Champions of Krynn'
        for asset in ['KRYNN.CFG', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX']:
            shutil.copyfile(game/asset, g/asset)
        row = bytearray((game/'SAVE/CHRDATA1.SAV').read_bytes())
        row[30:89] = bytes(59); row[392:394] = bytes(2); row[407] = row[98]
        (g/'SAVE/CHRDATA1.SAV').write_bytes(row)
        item = bytearray(63); item[:2] = b'\x01Q'; item[46] = 39; item[47] = charge; item[60] = 129
        (g/'SAVE/CHRDATA1.STF').write_bytes(item)
        poison = bytearray(item); poison[46] = 77; poison[60] = 0
        (g/'POISON.STF').write_bytes(poison)
        (g/'ECL1.DAX').write_bytes(ecl())
        code = bytearray(22)
        for ident in [39, 77]:
            code += bytes([9, 0, 0, 1, ident, 0x55, 0x32, 0, ident, 0x16, 9, 0, 1, 1, ident, 0x55])
        (g/'QUERY.BIN').write_bytes(code+b'\0')
        commands += [f'cd \\{name}', 'del C:\\H\\_GBPARTY.GBP',
                     'C:\\H\\GBBOOT /E /2 51 /B 34 /C P /4 > FIRST.TXT',
                     'copy GREYBOX.GBS FIRST.GBS > NUL',
                     'C:\\H\\CCECL QUERY.BIN /G C:\\H\\_GBSEED.BIN /B C:\\H\\_GBPARTY.GBP /ID 1 /E FIRST.EFX > QUERY1.TXT',
                     'copy POISON.STF SAVE\\CHRDATA1.STF > NUL',
                     'C:\\H\\GBBOOT /5 /2 1 /4 > COLD.TXT',
                     'C:\\H\\CCECL QUERY.BIN /G C:\\H\\_GBSEED.BIN /B C:\\H\\_GBPARTY.GBP /ID 1 /E COLD.EFX > QUERY2.TXT']
    (RUN/'RUN.BAT').write_text('\n'.join(commands)+'\n', encoding='ascii')


def verify():
    results = []
    for name in ['REMOVE', 'RETAIN']:
        g = RUN/name
        for phase in ['FIRST', 'COLD']:
            assert 'Camp saved to' in (g/f'{phase}.TXT').read_text(), (name, phase)
            cp = (g/('FIRST.GBS' if phase == 'FIRST' else 'GREYBOX.GBS')).read_bytes()
            _, inventory = split_checkpoint(cp)
            actual_types = [inv.records[i+46] for inv in inventory for i in range(0, len(inv.records), 63)]
            fx = (g/f'{phase}.EFX').read_bytes()
            u16 = lambda off: struct.unpack_from('<H', fx, off)[0]
            mem = {u16(198+2*i): u16(1222+2*i) for i in range(u16(196))}
            queries = {str(ident): mem[0x5500+ident] for ident in [39, 77]}
            results.append(dict(case=name, phase=phase, owned_types=actual_types, queries=queries,
                                agrees=all(queries[str(i)] == int(i in actual_types) for i in [39, 77])))
    (RUN/'results.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
    assert all(case['agrees'] for case in results), results
    print('PASS: consumed/retained scroll queries and cold inventory ownership despite altered source STF')


{'prepare': prepare, 'verify': verify}[sys.argv[1]]()
