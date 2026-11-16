"""DOS combined activation controls, including every publication rename failure."""
import hashlib
import json
import struct
from pathlib import Path

from tools.cok_native_mutation import fixture
from tools.cok_mutation_packet import activation_seed, manifest, response, seal
from tools.test_cok_item_removal_model import item, effect


def prepare(directory, commands):
    directory = Path(directory)
    root = Path(__file__).resolve().parents[1]
    cases = [('valid', count) for count in range(7)]
    cases += [('large', 1)]
    cases += [(p, 2) for p in ('party', 'seed_owned', 'seed_timer', 'seed_age', 'seed_bits',
                               'effects', 'learning', 'items', 'candidate_crc', 'candidate_frame',
                               'candidate_type', 'candidate_short', 'request_crc')]
    cases += [(f'{kind}{index}', 2) for kind in ('stage', 'backup', 'stage_dir', 'backup_dir')
              for index in range(3)]
    cases += [(f'fault{index}', 2) for index in range(6)]
    records = []
    for number, (problem, count) in enumerate(cases):
        folder = directory/f'A{number:04}'
        folder.mkdir()
        items = [(item(39, 9, ready=1), item(6, marker=121, ready=1), item(1))]*count
        effects = [(effect(), effect(14, 0))]*count
        if problem == 'large':
            items, effects = [(item(39),)*1101], [()]
        packet, inventory = fixture(items, effects, selected=bool(count))
        packet = bytearray(packet)
        struct.pack_into('<H', packet, 4, 2)
        struct.pack_into('<H', packet, 32, 20)
        packet = seal(packet)
        candidate = response(packet, inventory)
        length = struct.unpack_from('<H', packet, 20)[0]
        party = packet[5798:5798+length]
        seed = bytearray(3160)
        struct.pack_into('<4s4H', seed, 0, b'GBPS', 6, 1, count, 0)
        seed[282:3112] = packet[8274:11104]
        seed[3128:] = packet[13192:13224]
        data = {'LIVE.IV': inventory, 'LIVE.PTY': party, 'LIVE.PS': bytes(seed),
                'REQ.BIN': packet, 'RES.BIN': candidate, 'OUT.EFX': packet[48:5798],
                'CODE.BIN': bytes(80), 'ITEMS': (root/'Champions of Krynn/ITEMS').read_bytes()}
        data['MAN.BIN'] = manifest(['LIVE.IV', 'OUT.EFX', 'LIVE.PTY', 'LIVE.PS', 'CODE.BIN'], bytes(range(1, 9)))
        expected = {'LIVE.IV': candidate[13224:], 'LIVE.PTY': candidate[5798:5798+length],
                    'LIVE.PS': activation_seed(seed, candidate)}
        changes = {'party': ('LIVE.PTY', 40), 'seed_owned': ('LIVE.PS', 284),
                   'seed_timer': ('LIVE.PS', 552), 'seed_age': ('LIVE.PS', 3112),
                   'seed_bits': ('LIVE.PS', 3128), 'effects': ('OUT.EFX', 126),
                   'learning': ('MAN.BIN', 16), 'items': ('ITEMS', 2),
                   'candidate_crc': ('RES.BIN', 28), 'candidate_frame': ('RES.BIN', 11120),
                   'candidate_type': ('RES.BIN', 13224+16+8+46), 'request_crc': ('REQ.BIN', 28)}
        if problem in changes:
            filename, offset = changes[problem]
            raw = bytearray(data[filename])
            raw[offset] ^= 1
            data[filename] = seal(raw) if problem in ('learning', 'candidate_frame', 'candidate_type') else bytes(raw)
        elif problem == 'candidate_short':
            data['RES.BIN'] = candidate[:-1]
        if problem.startswith(('stage', 'backup')):
            suffix = ('MS' if problem.startswith('stage') else 'MB')+problem[-1]
            path = folder/f'LIVE.{suffix}'
            if '_dir' in problem:
                path.mkdir()
            else:
                data[path.name] = b'PREEXISTING'
        for filename, raw in data.items():
            (folder/filename).write_bytes(raw)
        success = problem in ('valid', 'large')
        records.append({'name': folder.name, 'problem': problem, 'success': success,
                        'hashes': {n: hashlib.sha256(v).hexdigest() for n, v in data.items()},
                        'expected': {n: v.hex() for n, v in expected.items()} if success else {},
                        'directories': [p.name for p in folder.iterdir() if p.is_dir()]})
        executable = 'FAIL'+problem[-1] if problem.startswith('fault') else 'CCINV'
        commands += [f'cd \\{folder.name}', f'..\\{executable} C MAN.BIN REQ.BIN RES.BIN > LOG.TXT',
                     f'if errorlevel 1 goto AF{number}', 'echo PASS>>C:\\ACTCTL.LOG',
                     f'goto AN{number}', f':AF{number}', 'echo FAIL>>C:\\ACTCTL.LOG', f':AN{number}']
    (directory/'activation-controls.json').write_text(json.dumps(records), encoding='utf-8')


def verify(directory):
    directory = Path(directory)
    cases = json.loads((directory/'activation-controls.json').read_text(encoding='utf-8'))
    statuses = (directory/'ACTCTL.LOG').read_text().split()
    assert len(statuses) == len(cases)
    for case, status in zip(cases, statuses):
        assert status == ('PASS' if case['success'] else 'FAIL'), (case['name'], case['problem'], status)
        folder = directory/case['name']
        for filename, digest in case['hashes'].items():
            raw = (folder/filename).read_bytes()
            if filename in case['expected']:
                assert raw == bytes.fromhex(case['expected'][filename]), (case['name'], filename)
            else:
                assert hashlib.sha256(raw).hexdigest() == digest, (case['name'], filename)
        assert {p.name for p in folder.iterdir()} == set(case['hashes']) | set(case['directories']) | {'LOG.TXT'}, case['name']
        for name in case['directories']:
            assert (folder/name).is_dir(), (case['name'], name)
    print(f'PASS: {len(cases)} DOS combined activation controls')
