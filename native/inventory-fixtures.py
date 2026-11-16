"""DOS storage-helper checks; no original game files are modified."""
from pathlib import Path
import json
import random
import shutil
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools.cok_inventory import Inventory, encode, decode, checksum, join_checkpoint, split_checkpoint


def checkpoint():
    # A storage fixture with valid header/roster. GBBOOT owns the deeper map,
    # clock, effects and learning validation; CCINV must preserve these bytes.
    raw = bytearray(11112)
    raw[:4] = b'GBCP'
    struct.pack_into('<HH', raw, 4, 4, 1)
    struct.pack_into('<3H', raw, 20, 2476, 5750, 11112)
    raw[5798:5802] = b'GBPR'
    struct.pack_into('<4H', raw, 5802, 1, 6, 410, 0)
    for index in range(6):
        raw[5814+410*index] = index+1
    struct.pack_into('<I', raw, 28, checksum(raw))
    return bytes(raw)


def prepare(run):
    shutil.copyfile(ROOT/'native/build/ccinv.com', run/'CCINV.COM')
    rng = random.Random(0x1EA84)
    cases = []
    commands = []
    for name, counts in [('EMPTY', [0]*6), ('SMALL', [3, 5, 5, 4, 4, 5]),
                         ('LARGE', [129, 0, 31, 0, 8, 1100]),
                         ('MIXED', [1, 0, 2, 0, 1, 3])]:
        g = run/name
        (g/'SAVE').mkdir(parents=True)
        (g/'CLOUD_~1/SAVE').mkdir(parents=True)
        core = bytearray(checkpoint())
        if name == 'MIXED':
            core[5814+410] = 128
            core[5814+3*410] = 131
            struct.pack_into('<I', core, 28, checksum(core))
        inventories = []
        for index, count in enumerate(counts):
            source = core[5814+410*index]
            body = bytearray(rng.randbytes(count*63))
            for offset in range(0, len(body), 63):
                body[offset+46] = offset//63 % 32+1
            present = source < 128 and (index != 3 or name == 'EMPTY')
            cloud = present and index == 4
            if present:
                folder = 'CLOUD_~1/SAVE' if cloud else 'SAVE'
                (g/f'{folder}/CHRDATA{source}.STF').write_bytes(body)
                if not cloud:
                    # Even an empty SAVE file wins over a populated cloud file.
                    (g/f'CLOUD_~1/SAVE/CHRDATA{source}.STF').write_bytes(bytes(63))
            inventories.append(Inventory(source, present, cloud, bytes(body) if present else b''))
        inv = encode(inventories)
        (g/'PARTY.GBP').write_bytes(core[5798:8274])
        (g/'INPUT.GBS').write_bytes(core)
        (g/'WORK.GBS').write_bytes(core)
        (g/'EXPECTED.BIN').write_bytes(inv)
        (g/'ACTIVE.BIN').write_bytes(b'previous active inventory')
        commands += [f'cd \\{name}', 'C:\\CCINV I PARTY.GBP ACTIVE.BIN > IMPORT.TXT',
                     'C:\\CCINV P ACTIVE.BIN > CHECK.TXT',
                     'C:\\CCINV S WORK.GBS ACTIVE.BIN > STORE.TXT',
                     'C:\\CCINV L WORK.GBS CORE.GBS STAGE.BIN > LOAD.TXT',
                     'C:\\CCINV A STAGE.BIN ACTIVE.BIN > APPLY.TXT']
        cases.append({'name': name, 'kind': 'roundtrip'})
    core = checkpoint()
    inv = (run/'SMALL/EXPECTED.BIN').read_bytes()
    # Valid-CRC malformed v5 envelopes must not replace either staged output.
    bad_inventories = {}
    for name, offset, value in [('VERSION', 4, 2), ('COUNT', 6, 7), ('FLAGS', 17, 2),
                                ('OWNER', 16, 0), ('RESERVED', 18, 1), ('HEADER', 12, 1)]:
        raw = bytearray(inv)
        raw[offset] = value
        bad_inventories[name] = bytes(raw)
    bad_inventories['TRAIL'] = inv+b'x'
    bad_inventories['SHORT'] = inv[:-1]
    bad_inventories['ALIGN'] = inv[:20]+struct.pack('<I', 188)+inv[24:]
    duplicate = bytearray(inv)
    duplicate[24+3*63] = 1
    bad_inventories['DUP'] = bytes(duplicate)
    for name, invalid in bad_inventories.items():
        g = run/name
        g.mkdir()
        (g/'BAD.BIN').write_bytes(invalid)
        (g/'WORK.GBS').write_bytes(core)
        cp = bytearray(core+invalid)
        struct.pack_into('<H', cp, 4, 5)
        struct.pack_into('<I', cp, 28, checksum(cp))
        (g/'BAD.GBS').write_bytes(cp)
        for filename in ['CORE.GBS', 'STAGE.BIN']:
            (g/filename).write_bytes(b'prior output')
        commands += [f'cd \\{name}', 'C:\\CCINV P BAD.BIN > CHECK.TXT',
                     'C:\\CCINV S WORK.GBS BAD.BIN > STORE.TXT',
                     'C:\\CCINV L BAD.GBS CORE.GBS STAGE.BIN > LOAD.TXT']
        cases.append({'name': name, 'kind': 'reject'})
    for version, length in [(1, 8274), (2, 8532), (3, 11104), (4, 11112)]:
        name = f'OLD{version}'
        g = run/name
        g.mkdir()
        cp = bytearray(core[:length])
        struct.pack_into('<H', cp, 4, version)
        struct.pack_into('<H', cp, 24, length)
        struct.pack_into('<I', cp, 28, checksum(cp))
        (g/'OLD.GBS').write_bytes(cp)
        commands += [f'cd \\{name}', 'C:\\CCINV L OLD.GBS CORE.GBS STAGE.BIN > LOAD.TXT']
        cases.append({'name': name, 'kind': 'legacy'})
    for name in ['CRC', 'IMPORT']:
        g = run/name
        (g/'SAVE').mkdir(parents=True)
        for filename in ['CORE.GBS', 'STAGE.BIN', 'ACTIVE.BIN']:
            (g/filename).write_bytes(b'prior output')
        if name == 'CRC':
            cp = bytearray(join_checkpoint(core, decode(inv)))
            cp[-1] ^= 1
            (g/'BAD.GBS').write_bytes(cp)
            commands += ['cd \\CRC', 'C:\\CCINV L BAD.GBS CORE.GBS STAGE.BIN > FAIL.TXT']
        else:
            (g/'PARTY.GBP').write_bytes(core[5798:8274])
            (g/'SAVE/CHRDATA1.STF').write_bytes(bytes(63))
            (g/'SAVE/CHRDATA2.STF').write_bytes(bytes(62))
            commands += ['cd \\IMPORT', 'C:\\CCINV I PARTY.GBP ACTIVE.BIN > FAIL.TXT']
        cases.append({'name': name, 'kind': 'unchanged'})
    g = run/'SCROLL'
    g.mkdir()
    node = bytearray(63)
    node[46], node[47], node[60] = 39, 101, 129
    (g/'PENDING.BIN').write_bytes(encode([Inventory(1, True, False, node)]))
    commands += ['cd \\SCROLL', 'C:\\CCINV P PENDING.BIN > CHECK.TXT']
    cases.append({'name': 'SCROLL', 'kind': 'pending'})
    (run/'RUN.BAT').write_text('\n'.join(commands)+'\n', encoding='ascii')
    (run/'cases.json').write_text(json.dumps(cases), encoding='utf-8')


def verify(run):
    cases = json.loads((run/'cases.json').read_text(encoding='utf-8'))
    for case in cases:
        g = run/case['name']
        if case['kind'] == 'roundtrip':
            inv = (g/'EXPECTED.BIN').read_bytes()
            core = (g/'INPUT.GBS').read_bytes()
            assert (g/'ACTIVE.BIN').read_bytes() == inv, (case, 'import/apply')
            assert (g/'WORK.GBS').read_bytes() == join_checkpoint(core, decode(inv)), (case, 'save')
            assert (g/'CORE.GBS').read_bytes() == core, (case, 'core')
            assert not (g/'STAGE.BIN').exists(), (case, 'publish did not consume stage')
            for filename in ['IMPORT.TXT', 'CHECK.TXT', 'STORE.TXT', 'LOAD.TXT', 'APPLY.TXT']:
                assert (g/filename).read_bytes() == b'', (case, filename)
        elif case['kind'] == 'reject':
            assert (g/'WORK.GBS').read_bytes() == checkpoint(), case
            for filename in ['CORE.GBS', 'STAGE.BIN']:
                assert (g/filename).read_bytes() == b'prior output', (case, filename)
            for filename in ['CHECK.TXT', 'STORE.TXT', 'LOAD.TXT']:
                assert b'Inventory could not' in (g/filename).read_bytes(), (case, filename)
        elif case['kind'] == 'legacy':
            assert (g/'CORE.GBS').read_bytes() == (g/'OLD.GBS').read_bytes(), case
            assert decode((g/'STAGE.BIN').read_bytes()) == tuple(Inventory(i, False, False, b'') for i in range(1, 7)), case
            assert (g/'LOAD.TXT').read_bytes() == b'', case
        elif case['kind'] == 'unchanged':
            assert b'Inventory could not' in (g/'FAIL.TXT').read_bytes(), case
            for filename in ['CORE.GBS', 'STAGE.BIN', 'ACTIVE.BIN']:
                assert (g/filename).read_bytes() == b'prior output', (case, filename)
        else:
            assert b'Inventory could not' in (g/'CHECK.TXT').read_bytes(), case
    assert (run/'LARGE/WORK.GBS').stat().st_size > 65535
    print(f'PASS: {len(cases)} DOS inventory cases; exact records, >64 KiB checkpoint, malformed envelopes, v1-v4 migration, pending-scroll preflight')


if __name__ == '__main__':
    {'prepare': prepare, 'verify': verify}[sys.argv[1]](Path(sys.argv[2]))
