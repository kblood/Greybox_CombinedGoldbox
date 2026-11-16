"""DOS checked-yield and VM-to-mutation packet fixtures."""
from pathlib import Path
import hashlib
import json
import shutil
import struct
import subprocess
import zlib

from tools.cok_inventory import Inventory, encode
from tools.cok_mutation_packet import from_yield, response, manifest, seal, activation_seed

ROOT = Path(__file__).resolve().parents[1]


def prepare(directory):
    directory = Path(directory)
    nasm = shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    for name in ('ccecl', 'ccinv'):
        subprocess.run([nasm, '-f', 'bin', '-I', str(ROOT/'native/src')+'/',
                        str(ROOT/f'native/src/{name}.asm'), '-o', str(directory/f'{name}.com')], check=True)
    for stage in range(6):
        subprocess.run([nasm, '-f', 'bin', '-I', str(ROOT/'native/src')+'/', f'-DMC_TEST_FAIL_STAGE={stage}',
                        str(ROOT/'native/src/ccinv.asm'), '-o', str(directory/f'FAIL{stage}.COM')], check=True)
    body = (ROOT/'Champions of Krynn/SAVE/CHRDATA1.SAV').read_bytes()
    # This fixture selects real CoK thief rows from a title-bound v2 GBPR.
    # V1 intentionally exposes common names/count only and must not supply
    # title-specific fields such as the CoK thief-skill matrix.
    roster = struct.pack('<4s6H', b'GBPR', 2, 6, 410, 0, 1, 1)+b''.join(bytes([i])+body for i in range(1, 7))
    item = bytearray(63)
    item[46] = 39
    inventory = encode(Inventory(i, True, False, bytes(item)) for i in range(1, 7))
    seed = bytearray(3160)
    struct.pack_into('<4s4H', seed, 0, b'GBPS', 6, 1, 6, 0)
    struct.pack_into('<H', seed, 282, 1)
    struct.pack_into('<H', seed, 540, 1)
    seed[3128+39//8] = 1 << (39 % 8)
    cases, commands = [], ['@echo off']

    def add(operand, target, *, choice=0, comparison=0, memory=None, truncated=False,
            profile='COK', problem=None, output='OUT.EFX', input_name='CODE.BIN', export=True,
            chains=0, repeats=0, again=False, events=False, acknowledged=False, subroutine=False, queries=False):
        index = len(cases)
        name = f'C{index:04}'
        folder = directory/name
        folder.mkdir()
        if profile != 'GENERIC':
            (folder/('KRYNN.CFG' if profile == 'COK' else 'DKK.CFG')).write_bytes(b'')
        code = bytearray(22)
        if memory:
            code += bytes([9, 129])+struct.pack('<H', memory[1])+bytes([1])+struct.pack('<H', memory[0])
        cmp_values = (0, 0)
        flags = bytes(6)
        if comparison == 1:
            code += bytes([3, 0, 1, 0, 2])
            cmp_values, flags = (1, 2), bytes([0, 1, 1, 0, 1, 0])
        elif comparison == 2:
            code += bytes([0x32, 0, 39])
            flags = bytes([1, 0, 0, 0, 0, 0])
        elif comparison == 3:
            code += bytes([3, 0, 2, 0, 1])
            cmp_values, flags = (2, 1), bytes([0, 1, 0, 1, 0, 1])
        elif comparison == 4:
            code += bytes([3, 0, 1, 0, 1])
            cmp_values, flags = (1, 1), bytes([1, 0, 0, 0, 1, 1])
        elif comparison == 5:
            code += bytes([3, 129, 0, 128, 129, 255, 127])
            cmp_values, flags = (32768, 32767), bytes([0, 1, 1, 0, 1, 0])
        if choice is not None:
            code += bytes([0x0A, 0, choice])
        if repeats:
            code += bytes([0x21, 0, 1, 0, 2, 0, 3])*(repeats+1)
        if events:
            code += bytes([0x0B, 0, 2, 0, 3, 0, 4, 0x0C, 0, 1, 0, 8, 0, 2,
                           0x2E, 0, 0xE0, 0, 1, 0, 2, 0, 3, 0, 0])
        if subroutine:
            target_pc = len(code)+11
            code += bytes([2, 129])+struct.pack('<H', 0x7FFE+target_pc)
            code += bytes([9, 0, 42, 1, 0xEE, 0x90, 0])
        pc = len(code)
        code += bytes([0x40])+operand
        successor = len(code)
        if subroutine:
            code += b'\x13'
        elif not truncated:
            if queries:
                code += bytes([0x32, 0, 39, 0x16, 9, 0, 1, 1, 0xF0, 0x90])
                code += bytes([0x1E, 1, 0x9F, 0x7C, 0, 0, 1, 0, 0x91, 1, 1, 0x91,
                               1, 2, 0x91, 1, 3, 0x91])
                code += bytes([0x1E, 1, 0xA5, 0x7C, 0, 0, 1, 0x10, 0x91, 1, 0x11, 0x91,
                               1, 0x12, 0x91, 1, 0x13, 0x91])
            if events:
                code += b'\x0D'  # APPROACH must use the retained setup distance
            code += bytes([9, 0, 42, 1, 0xEE, 0x90])
            if again:
                code += bytes([0x40, 0, 39, 9, 0, 43, 1, 0xEF, 0x90])
            code += b'\0'
        file_bytes = code
        if chains:
            input_name = 'CODE.DAX'
            blocks = [bytes(22)+bytes([0x20, 0, i+1]) for i in range(chains)]+[bytes(code)]
            compressed = [b''.join(bytes([len(block[i:i+128])-1])+block[i:i+128]
                                   for i in range(0, len(block), 128)) for block in blocks]
            entries, offset = [], 0
            for i, (block, packed) in enumerate(zip(blocks, compressed)):
                entries.append(struct.pack('<BIHH', i, offset, len(block), len(packed)))
                offset += len(packed)
            file_bytes = struct.pack('<H', 9*len(blocks))+b''.join(entries)+b''.join(compressed)
        (folder/input_name).write_bytes(file_bytes)
        case_roster = bytearray(roster)
        if profile == 'DOK':
            # This sentinel checks that DoK does not emit a CoK GBIY yield.
            # Keep the roster valid for its selected source identity.
            struct.pack_into('<HH', case_roster, 10, 1, 2)
            for i in range(6):
                body = 16 + i * 410 + 1
                case_roster[body+216:body+220] = b'GBD1'
                case_roster[body+220] = 1
        elif profile == 'GENERIC':
            # The generic sentinel uses a legacy name/count roster with no
            # title identity or title-specific fields.
            struct.pack_into('<6H', case_roster, 4, 1, 6, 410, 0, 0, 0)
        if queries:
            for i in range(6):
                case_roster[16+i*410+1+219] = 10+7*i
        (folder/'PARTY.GBP').write_bytes(case_roster)
        case_seed = bytearray(seed)
        if queries:
            case_seed[150] = 6
            for i in range(6):
                case_seed[152+i*8:160+i*8] = case_roster[16+i*410+1+219:16+i*410+1+227]
        (folder/'SEED.BIN').write_bytes(case_seed)
        (folder/'INVENT.BIN').write_bytes(inventory)
        (folder/'ITEMS').write_bytes((ROOT/'Champions of Krynn/ITEMS').read_bytes())
        if problem == 'existing':
            (folder/'OUT.YLD').write_bytes(b'OLD YIELD')
        elif problem == 'directory':
            (folder/'OUT.YLD').mkdir()
        elif problem == 'effect_directory':
            (folder/'OUT.EFX').mkdir()
        if output and output.startswith('SUB.DIR'):
            (folder/'SUB.DIR').mkdir()
        suffix = (' /E' if output is None else f' /E {output}') if export else ''
        source_arg = input_name+(' 0' if chains else '')
        identity = ' /ID 1' if profile == 'COK' else (' /ID 2' if profile == 'DOK' else '')
        commands.extend([f'cd \\{name}', f'..\\CCECL {source_arg} /B PARTY.GBP /G SEED.BIN /D 5{identity}{suffix} > LOG.TXT',
                         f'if errorlevel 1 goto F{index}', 'echo PASS>>C:\\STATUS.LOG',
                         f'goto N{index}', f':F{index}', 'echo FAIL>>C:\\STATUS.LOG', f':N{index}'])
        cases.append({'name': name, 'target': target, 'pc': pc, 'successor': successor,
                      'length': len(code), 'choice': choice, 'flags': flags.hex(), 'comparisons': cmp_values,
                      'steps': 1+bool(memory)+bool(comparison)+(choice is not None)+(repeats+1 if repeats else 0)+3*events+subroutine,
                      'chains': chains, 'repeats': repeats, 'block_crc': zlib.crc32(code),
                      'again': again,
                      'events': events, 'acknowledged': acknowledged,
                      'subroutine': subroutine,
                      'queries': queries,
                      'truncated': truncated, 'profile': profile, 'problem': problem,
                      'output': output or 'CCECL.EFX', 'input': input_name, 'export': export,
                      'hashes': {f: hashlib.sha256((folder/f).read_bytes()).hexdigest()
                                 for f in (input_name, 'PARTY.GBP', 'SEED.BIN', 'INVENT.BIN', 'ITEMS')}})

    for target in range(256):
        add(bytes([0, target]), target, choice=target % 8, comparison=target % 3)
    for kind in (1, 2, 3, 127):
        for value in (0, 255, 4660, 65535):
            if kind == 2:
                # Code 0x02 carries a 16-bit immediate, unlike the reference
                # forms that read the seeded word at 0x907B.
                operand = bytes([kind, value & 255, (value >> 8) & 255])
            else:
                operand = bytes([kind, 123])+(b'\x90' if kind != 127 else b'')
            add(operand, value & 255, memory=(0x907B if kind != 127 else 123, value), choice=6)
    for value in (0, 255, 4660, 65535):
        add(bytes([129])+struct.pack('<H', value), value & 255)
    for length in (0, 1, 255):
        add(bytes([128, length])+bytes(length), length)
    for kind in (4, 126, 254, 255):
        add(bytes([kind, 177]), 177)
    add(bytes([1, 0, 0x7D]), 0, choice=7)  # Stateful selected-status accessor.
    for operand in (b'', b'\0', b'\1', b'\1\0', b'\2\0', b'\3\0', b'\x81\0', b'\x80\3ab'):
        add(operand, None, truncated=True)
    add(b'\0\x27', 39, output='NOEXT')
    add(b'\0\x27', 39, output='SUB.DIR\\OUT')
    add(b'\0\x27', 39, output='OUT.YLD', problem='alias')
    add(b'\0\x27', 39, problem='existing')
    add(b'\0\x27', 39, problem='directory')
    add(b'\0\x27', 39, problem='effect_directory')
    add(b'\0\x27', 39, output='CODE.EFX', input_name='CODE.YLD', problem='input_alias')
    add(b'\0\x27', 39, export=False)
    add(b'\0\x27', 39, profile='DOK')
    add(b'\0\x27', 39, profile='GENERIC')
    add(b'\0\x27', 39, choice=None)
    add(b'\0\x27', 39, output=None)
    for comparison in (3, 4, 5):
        add(b'\0\x27', 39, comparison=comparison, choice=3)
    add(b'\0\x27', 39, repeats=15)
    add(b'\0\x27', 39, chains=1)
    add(b'\0\x27', 39, chains=32, repeats=3)
    add(bytes([1, 0, 0x7D]), 0, choice=7, comparison=5, again=True)
    add(b'\0\x27', 39, events=True)
    add(b'\0\x27', 39, events=True, acknowledged=True)
    add(b'\0\x27', 39, subroutine=True)
    add(b'\0\x27', 39, queries=True)
    add(b'\0\0', 0, choice=7, queries=True)
    (directory/'RUN.BAT').write_text('\r\n'.join(commands)+'\r\n', encoding='ascii')
    (directory/'cases.json').write_text(json.dumps(cases), encoding='utf-8')


def verify_yields(directory):
    directory = Path(directory)
    cases = json.loads((directory/'cases.json').read_text(encoding='utf-8'))
    statuses = (directory/'STATUS.LOG').read_text().split()
    assert len(statuses) == len(cases)
    pipeline, commands = [], ['@echo off']
    for index, (case, status) in enumerate(zip(cases, statuses)):
        folder = directory/case['name']
        assert status == ('FAIL' if case['problem'] else 'PASS'), (case, status)
        for filename, digest in case['hashes'].items():
            assert hashlib.sha256((folder/filename).read_bytes()).hexdigest() == digest, (case, filename)
        output = folder/case['output'].replace('\\', '/')
        companion = output.with_suffix('.YLD')
        if not case['export']:
            assert not output.exists() and not companion.exists(), case
            continue
        if case['problem']:
            if case['problem'] == 'existing':
                assert companion.read_bytes() == b'OLD YIELD'
            elif case['problem'] == 'directory':
                assert companion.is_dir()
            elif case['problem'] == 'alias':
                assert companion.read_bytes()[:4] == b'GBEF'
            elif case['problem'] == 'effect_directory':
                assert not companion.exists()
            continue
        fx = output.read_bytes()
        assert len(fx) == 5750 and fx[:4] == b'GBEF', case
        assert struct.unpack_from('<H', fx, 8)[0] == 4, case
        assert struct.unpack_from('<H', fx, 124)[0] == case['pc'], case
        if case['subroutine']:
            assert struct.unpack_from('<HH', fx, 130) == (1, case['pc']-7), case
        count = struct.unpack_from('<H', fx, 196)[0]
        keys = struct.unpack_from(f'<{count}H', fx, 198)
        assert 0x90EE not in keys, (case, 'successor executed')
        if case['truncated'] or case['profile'] != 'COK':
            assert not companion.exists(), case
            assert struct.unpack_from('<H', fx, 5724)[0] == (1 if case['truncated'] else 6)
            continue
        raw = companion.read_bytes()
        assert len(raw) == 72 and raw[:8] == b'GBIY\x02\0\x48\0', case
        assert struct.unpack_from('<4H', raw, 52) == (case['steps'], case['chains'], case['repeats'], 0), case
        assert struct.unpack_from('<I', raw, 60)[0] == case['block_crc'], case
        assert raw[64:68] == bytes(4), case
        assert struct.unpack_from('<I', raw, 68)[0] == zlib.crc32(raw[:68]), case
        assert struct.unpack_from('<4H', raw, 8) == (case['pc'], case['successor'], case['target'],
                                                   case['chains'] or 65535), case
        assert raw[16:24] == b'GBMC\x01\0\x20\0', case
        assert struct.unpack_from('<2H', raw, 24) == tuple(case['comparisons']), case
        assert raw[28:34] == bytes.fromhex(case['flags']), case
        choice = case['choice']
        valid = choice is not None and 1 <= choice <= 6
        assert tuple(raw[34:36]) == (int(valid), int(choice is not None and not valid)), case
        assert struct.unpack_from('<HH', raw, 36) == (choice if valid else 0, case['length']), case
        assert raw[40:48] == bytes(8) and struct.unpack_from('<I', raw, 48)[0] == zlib.crc32(fx), case
        roster, inv, seed = ((folder/name).read_bytes() for name in ('PARTY.GBP', 'INVENT.BIN', 'SEED.BIN'))
        table = (ROOT/'Champions of Krynn/ITEMS').read_bytes()[2:2050]
        learning = bytes(range(1, 9))
        request = from_yield(raw, fx, roster, inv, seed[540:3112], table, learning=learning)
        stale = bytearray(fx)
        stale[126] ^= 1
        try:
            from_yield(raw, stale, roster, inv, seed[540:3112], table)
        except ValueError:
            pass
        else:
            raise AssertionError(('mismatched effects accepted', case))
        if index % 17 == 0 or case['target'] == 39 or case['choice'] == 7 and case['target'] == 0:
            (folder/'WANT.REQ').write_bytes(request)
            (folder/'WANT.BIN').write_bytes(response(request, inv))
            (folder/'MAN.BIN').write_bytes(manifest(
                ['INVENT.BIN', case['output'], 'PARTY.GBP', 'SEED.BIN', case['input']], learning))
            pipeline.append(case['name'])
            commands.extend([f'cd \\{case["name"]}', '..\\CCINV B MAN.BIN REQ.BIN > BUILD.TXT',
                             '..\\CCINV M INVENT.BIN REQ.BIN RES.BIN > MUT.TXT'])
    pipeline_inputs = {
        name: {str(path.relative_to(directory/name)): hashlib.sha256(path.read_bytes()).hexdigest()
               for path in (directory/name).rglob('*') if path.is_file()}
        for name in pipeline}
    (directory/'pipeline-inputs.json').write_text(json.dumps(pipeline_inputs), encoding='utf-8')
    prepare_builders(directory, commands)
    (directory/'pipeline.json').write_text(json.dumps(pipeline), encoding='utf-8')
    (directory/'RUN.BAT').write_text('\r\n'.join(commands)+'\r\n', encoding='ascii')
    print(f'PASS: {len(cases)} DOS checked inventory yields')


def prepare_builders(directory, commands):
    """Constructor controls, each isolated from the actual yield source files."""
    source = directory/'C0039'
    problems = [('manifest', offset, value) for offset, value in (
        (0, 0), (4, 3), (6, 0), (8, 1), (12, 1), (24, 1), (32, 0), (43, 1))]
    problems += [('yield', offset, value) for offset, value in (
        (0, 0), (4, 1), (6, 0), (8, 0), (10, 0), (14, 0), (16, 0),
        (28, 2), (34, 1), (36, 1), (38, 1), (40, 1), (44, 1),
        (52, 0), (53, 255), (54, 33), (56, 16), (58, 255), (64, 1))]
    problems += [('seed', offset, value) for offset, value in (
        (4, 5), (6, 0), (8, 5), (282, 0), (284, 1), (540, 0), (542, 1),
        (544, 3), (3112, 1), (3132, 0))]
    problems += [('party', offset, value) for offset, value in ((4, 1), (12, 2), (426, 1))]
    problems += [('inventory', offset, value) for offset, value in ((16, 2), (17, 2), (70, 1))]
    problems += [(problem, 0, 0) for problem in (
        'crc', 'yield_crc', 'unterminated', 'manifest_short', 'manifest_long', 'yield_short',
        'seed_short', 'seed_long', 'inventory_short', 'items_short', 'items_missing',
        'yield_missing', 'fx_changed', 'fx_status', 'request_exists', 'temp_exists',
        'request_directory', 'reserved_output', 'manifest_alias', 'input_alias',
        'temp_input_alias', 'extra_items', 'nested_items', 'valid', 'manifest_v2',
        'manifest_ack', 'manifest_v2_reserved')]
    problems += [('missing', index, 0) for index in range(5)]
    builders = []
    for index, (problem, offset, value) in enumerate(problems):
        name = f'B{index:04}'
        folder = directory/name
        folder.mkdir()
        for filename in ('CODE.BIN', 'PARTY.GBP', 'SEED.BIN', 'INVENT.BIN', 'OUT.EFX', 'OUT.YLD', 'ITEMS'):
            shutil.copyfile(source/filename, folder/filename)
        paths = ['INVENT.BIN', 'OUT.EFX', 'PARTY.GBP', 'SEED.BIN', 'CODE.BIN']
        learning = bytes([12, 11, 10, 9, 8, 7, 6, 5])
        output = 'REQ.BIN'
        if problem == 'missing':
            paths[offset] = 'MISSING.BIN'
        elif problem == 'nested_items':
            nested = folder/'SRC.DIR'
            nested.mkdir()
            shutil.copyfile(folder/'CODE.BIN', nested/'CODE.BIN')
            shutil.copyfile(folder/'ITEMS', nested/'ITEMS')
            paths[4] = 'SRC.DIR\\CODE.BIN'
            changed = bytearray((folder/'ITEMS').read_bytes())
            changed[2] ^= 255
            (folder/'ITEMS').write_bytes(changed)
        elif problem == 'extra_items':
            with (folder/'ITEMS').open('ab') as handle:
                handle.write(b'ignored trailing data')
        elif problem in ('items_missing', 'yield_missing'):
            (folder/('ITEMS' if problem == 'items_missing' else 'OUT.YLD')).unlink()
        elif problem == 'request_exists':
            (folder/'REQ.BIN').write_bytes(b'OLD REQUEST')
        elif problem == 'temp_exists':
            (folder/'REQ.NEW').write_bytes(b'OLD TEMP')
        elif problem == 'request_directory':
            (folder/'REQ.BIN').mkdir()
        elif problem == 'reserved_output':
            output = 'REQ.NEW'
        elif problem == 'manifest_alias':
            output = 'MAN.BIN'
        elif problem == 'input_alias':
            output = 'INVENT.BIN'
        elif problem == 'temp_input_alias':
            shutil.copyfile(folder/'INVENT.BIN', folder/'REQ.NEW')
            paths[0] = 'REQ.NEW'
        raw_manifest = bytearray(manifest(paths, learning))
        if problem.startswith('manifest_') and problem in ('manifest_v2', 'manifest_ack', 'manifest_v2_reserved'):
            raw_manifest = bytearray(manifest(paths, learning, damage_watermark=int(problem == 'manifest_ack')))
            if problem == 'manifest_v2_reserved':
                raw_manifest[10] = 1
                raw_manifest = seal(raw_manifest)
        if problem == 'manifest':
            assert raw_manifest[offset] != value
            raw_manifest[offset] = value
            raw_manifest = seal(raw_manifest)
        elif problem == 'crc':
            raw_manifest[28] ^= 1
        elif problem == 'unterminated':
            raw_manifest[32:160] = b'A'*128
            raw_manifest = seal(raw_manifest)
        elif problem == 'manifest_short':
            raw_manifest.pop()
        elif problem == 'manifest_long':
            raw_manifest.append(0)
        (folder/'MAN.BIN').write_bytes(raw_manifest)
        filename = {'yield': 'OUT.YLD', 'seed': 'SEED.BIN', 'party': 'PARTY.GBP',
                    'inventory': 'INVENT.BIN'}.get(problem)
        if filename:
            raw = bytearray((folder/filename).read_bytes())
            assert raw[offset] != value, (problem, offset, value)
            raw[offset] = value
            if problem == 'yield':
                struct.pack_into('<I', raw, 68, zlib.crc32(raw[:68]))
            (folder/filename).write_bytes(raw)
        shorts = {'yield_short': 'OUT.YLD', 'seed_short': 'SEED.BIN',
                  'inventory_short': 'INVENT.BIN', 'items_short': 'ITEMS'}
        if problem in shorts:
            path = folder/shorts[problem]
            path.write_bytes(path.read_bytes()[:-1])
        elif problem == 'yield_crc':
            path = folder/'OUT.YLD'
            raw = bytearray(path.read_bytes())
            raw[60] ^= 1
            path.write_bytes(raw)
        elif problem == 'seed_long':
            path = folder/'SEED.BIN'
            path.write_bytes(path.read_bytes()+b'X')
        elif problem in ('fx_changed', 'fx_status'):
            raw = bytearray((folder/'OUT.EFX').read_bytes())
            raw[126 if problem == 'fx_changed' else 8] ^= 1
            (folder/'OUT.EFX').write_bytes(raw)
            if problem == 'fx_status':
                record = bytearray((folder/'OUT.YLD').read_bytes())
                struct.pack_into('<I', record, 48, zlib.crc32(raw))
                struct.pack_into('<I', record, 68, zlib.crc32(record[:68]))
                (folder/'OUT.YLD').write_bytes(record)
        valid = problem in ('extra_items', 'nested_items', 'valid', 'manifest_v2')
        if valid:
            item_path = folder/('SRC.DIR/ITEMS' if problem == 'nested_items' else 'ITEMS')
            expected = from_yield((folder/'OUT.YLD').read_bytes(), (folder/'OUT.EFX').read_bytes(),
                                  (folder/'PARTY.GBP').read_bytes(), (folder/'INVENT.BIN').read_bytes(),
                                  (folder/'SEED.BIN').read_bytes()[540:3112], item_path.read_bytes()[2:2050],
                                  learning=learning)
            (folder/'WANT.REQ').write_bytes(expected)
        snapshots = {str(path.relative_to(folder)): hashlib.sha256(path.read_bytes()).hexdigest()
                     for path in folder.rglob('*') if path.is_file()}
        directories = [str(path.relative_to(folder)) for path in folder.rglob('*') if path.is_dir()]
        builders.append({'name': name, 'valid': valid, 'problem': problem, 'output': output,
                         'hashes': snapshots, 'directories': directories})
        commands.extend([f'cd \\{name}', f'..\\CCINV B MAN.BIN {output} > BUILD.TXT',
                         f'if errorlevel 1 goto BF{index}', 'echo PASS>>C:\\BSTATUS.LOG',
                         f'goto BN{index}', f':BF{index}', 'echo FAIL>>C:\\BSTATUS.LOG', f':BN{index}'])
    (directory/'builders.json').write_text(json.dumps(builders), encoding='utf-8')


def verify_builders(directory):
    builders = json.loads((directory/'builders.json').read_text(encoding='utf-8'))
    statuses = (directory/'BSTATUS.LOG').read_text().split()
    assert len(statuses) == len(builders)
    for case, status in zip(builders, statuses):
        folder = directory/case['name']
        assert status == ('PASS' if case['valid'] else 'FAIL'), (case['name'], case['problem'], status)
        for filename, digest in case['hashes'].items():
            assert hashlib.sha256((folder/filename).read_bytes()).hexdigest() == digest, (case['name'], filename)
        for name in case['directories']:
            assert (folder/name).is_dir(), (case['name'], name)
        output = folder/case['output']
        if case['valid']:
            assert output.read_bytes() == (folder/'WANT.REQ').read_bytes(), case['name']
        elif case['output'] not in case['hashes'] and case['output'] not in case['directories']:
            assert not output.exists(), case['name']
        temporary = output.with_suffix('.NEW')
        if str(temporary.relative_to(folder)) not in case['hashes']:
            assert not temporary.exists(), (case['name'], 'temporary left behind')
    print(f'PASS: {len(builders)} DOS native request construction controls')


def verify_candidates(directory):
    directory = Path(directory)
    names = json.loads((directory/'pipeline.json').read_text(encoding='utf-8'))
    inputs = json.loads((directory/'pipeline-inputs.json').read_text(encoding='utf-8'))
    for name in names:
        folder = directory/name
        for filename, digest in inputs[name].items():
            assert hashlib.sha256((folder/filename).read_bytes()).hexdigest() == digest, (name, filename)
        assert (folder/'BUILD.TXT').read_bytes() == b'', name
        assert (folder/'REQ.BIN').read_bytes() == (folder/'WANT.REQ').read_bytes(), name
        assert (folder/'RES.BIN').read_bytes() == (folder/'WANT.BIN').read_bytes(), name
        assert not (folder/'RES.NEW').exists() and not (folder/'RES.IWK').exists(), name
    verify_builders(directory)
    print(f'PASS: {len(names)} DOS yield-to-mutation candidates')
    prepare_resumes(directory, names)


def checked_continuation_commands(name, check, activate, resume, *, log_suffix=''):
    """Run later stages only after their prerequisites succeeded.

    Keep one status per case in each log, including skipped stages, so the
    verifier can identify the first failed prerequisite without losing alignment.
    Labels and log names must remain compatible with the DOS batch interpreter.
    """
    check_log = f'C:\\CHECK{log_suffix}.LOG'
    active_log = f'C:\\ACTIVE{log_suffix}.LOG'
    resume_log = f'C:\\RESUME{log_suffix}.LOG'
    return [f'cd \\{name}', check,
            f'if errorlevel 1 goto CF{name}', f'echo PASS>>{check_log}',
            activate, f'if errorlevel 1 goto AF{name}', f'echo PASS>>{active_log}',
            resume, f'if errorlevel 1 goto RF{name}', f'echo PASS>>{resume_log}',
            f'goto RN{name}',
            f':CF{name}', f'echo FAIL>>{check_log}', f'echo SKIP>>{active_log}',
            f'echo SKIP>>{resume_log}', f'goto RN{name}',
            f':AF{name}', f'echo FAIL>>{active_log}', f'echo SKIP>>{resume_log}',
            f'goto RN{name}', f':RF{name}', f'echo FAIL>>{resume_log}', f':RN{name}']


def require_continuation_passes(directory, names, *, log_suffix=''):
    for stage in ('CHECK', 'ACTIVE', 'RESUME'):
        filename = f'{stage}{log_suffix}.LOG'
        statuses = (directory/filename).read_text().split()
        assert len(statuses) == len(names), (filename, len(statuses), len(names))
        failures = [(name, status) for name, status in zip(names, statuses) if status != 'PASS']
        assert not failures, (filename, failures)


def prepare_resumes(directory, names):
    cases = {c['name']: c for c in json.loads((directory/'cases.json').read_text(encoding='utf-8'))}
    commands = ['@echo off']
    snapshots = {}
    wanted = {}
    for name in names:
        folder = directory/name
        case = cases[name]
        candidate = (folder/'RES.BIN').read_bytes()
        if case['acknowledged']:
            candidate = bytearray(candidate)
            struct.pack_into('<H', candidate, 38, struct.unpack_from('<H', candidate, 48+2250)[0])
            candidate = seal(candidate)
        (folder/'RUN.BIN').write_bytes(candidate)
        length = struct.unpack_from('<H', candidate, 20)[0]
        for original, active in [('PARTY.GBP', 'ACT.GBP'), ('SEED.BIN', 'ACT.BIN'), ('INVENT.BIN', 'ACT.IV')]:
            shutil.copyfile(folder/original, folder/active)
        wanted[name] = {'ACT.GBP': candidate[5798:5798+length].hex(),
                        'ACT.IV': candidate[13224:].hex(),
                        'ACT.BIN': activation_seed((folder/'SEED.BIN').read_bytes(), candidate).hex()}
        (folder/'CMAN.BIN').write_bytes(manifest(
            ['ACT.IV', case['output'], 'ACT.GBP', 'ACT.BIN', case['input']], bytes(range(1, 9))))
        source = case['input']+(' 0' if case['chains'] else '')
        commands += checked_continuation_commands(
            name,
            f'..\\CCECL {source} /B PARTY.GBP /ID 1 /G SEED.BIN /R RES.BIN CHECK /E CHECK.EFX /T > CHECK.TXT',
            '..\\CCINV C CMAN.BIN REQ.BIN RES.BIN > COMMIT.TXT',
            f'..\\CCECL {source} /B ACT.GBP /ID 1 /G ACT.BIN /R RUN.BIN MUTATE /E NEXT.EFX > NEXT.TXT')
        snapshots[name] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                           for p in folder.iterdir() if p.is_file()}
    (directory/'resume-inputs.json').write_text(json.dumps(snapshots), encoding='utf-8')
    (directory/'active-wanted.json').write_text(json.dumps(wanted), encoding='utf-8')
    prepare_resume_rejections(directory, commands)
    from tools.cok_native_activation import prepare as prepare_activation
    prepare_activation(directory, commands)
    (directory/'RUN.BAT').write_text('\r\n'.join(commands)+'\r\n', encoding='ascii')


def prepare_resume_rejections(directory, commands):
    source = directory/'C0039'
    active = json.loads((directory/'active-wanted.json').read_text(encoding='utf-8'))['C0039']
    problems = [('packet', offset, value) for offset, value in (
        (4, 1), (8, 0), (16, 38), (18, 1), (24, 0), (26, 1), (32, 0),
        (34, 33), (36, 16), (38, 65), (44, 1), (52, 8), (56, 3),
        # A depth of one can be valid: unused stack words are not canonical.
        # Reject a depth beyond CALLCAP independently of those saved words.
        (80, 9), (130, 9), (178, 33), (11124, 2), (11130, 1), (11134, 0))]
    problems += [(p, 0, 0) for p in ('crc', 'short', 'source_changed', 'opcode_changed',
                                    'operand_changed', 'active_roster', 'active_bitmap', 'active_ages')]
    problems += [('active_roster_chunk_end', 1023, 0),
                 ('active_roster_chunk_start', 1024, 0),
                 ('active_roster_last', 2475, 0)]
    problems += [('stack_before_header', 0, 0), ('stack_past_end', 0, 0)]
    snapshots = {}
    for index, (problem, offset, value) in enumerate(problems):
        name = f'R{index:04}'
        folder = directory/name
        folder.mkdir()
        for filename in ('CODE.BIN', 'PARTY.GBP', 'SEED.BIN', 'ACT.GBP', 'ACT.BIN', 'RES.BIN'):
            shutil.copyfile(source/filename, folder/filename)
        for filename in ('ACT.GBP', 'ACT.BIN'):
            (folder/filename).write_bytes(bytes.fromhex(active[filename]))
        (folder/'KRYNN.CFG').write_bytes(b'')
        raw = bytearray((folder/'RES.BIN').read_bytes())
        if problem == 'packet':
            assert raw[offset] != value, (offset, value)
            raw[offset] = value
            raw = seal(raw)
        elif problem.startswith('stack_'):
            # An active frame must point inside [Gen1 header, block end].
            # Set both fields; never depend on uninitialized unused slots.
            return_pc = 21 if problem == 'stack_before_header' else len((folder/'CODE.BIN').read_bytes())+1
            struct.pack_into('<HH', raw, 178, 1, return_pc)
            raw = seal(raw)
        elif problem == 'crc':
            raw[-1] ^= 1
        elif problem == 'short':
            raw = raw[:13223]
        elif problem in ('source_changed', 'opcode_changed', 'operand_changed'):
            code = bytearray((folder/'CODE.BIN').read_bytes())
            pc = struct.unpack_from('<H', raw, 12)[0]
            code[0 if problem == 'source_changed' else pc+(2 if problem == 'operand_changed' else 0)] ^= 1
            (folder/'CODE.BIN').write_bytes(code)
            if problem != 'source_changed':
                struct.pack_into('<I', raw, 40, zlib.crc32(code))
                raw = seal(raw)
        elif problem.startswith('active_roster'):
            data = bytearray((folder/'ACT.GBP').read_bytes())
            data[16+1+407 if problem == 'active_roster' else offset] ^= 1
            (folder/'ACT.GBP').write_bytes(data)
        elif problem in ('active_bitmap', 'active_ages'):
            data = bytearray((folder/'ACT.BIN').read_bytes())
            data[3128 if problem == 'active_bitmap' else 3112] ^= 1
            (folder/'ACT.BIN').write_bytes(data)
        (folder/'RES.BIN').write_bytes(raw)
        mode = 'MUTATE' if problem.startswith('active_') else 'CHECK'
        party, seed = ('ACT.GBP', 'ACT.BIN') if mode == 'MUTATE' else ('PARTY.GBP', 'SEED.BIN')
        commands += [f'cd \\{name}', f'..\\CCECL CODE.BIN /B {party} /ID 1 /G {seed} /R RES.BIN {mode} /E BAD.EFX > LOG.TXT',
                     f'if errorlevel 1 goto RY{index}', 'echo FAIL>>C:\\REJECT.LOG',
                     f'goto RN{index}', f':RY{index}', 'echo PASS>>C:\\REJECT.LOG', f':RN{index}']
        snapshots[name] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.iterdir()}
    (directory/'reject-inputs.json').write_text(json.dumps(snapshots), encoding='utf-8')


def verify_resumes(directory):
    directory = Path(directory)
    snapshots = json.loads((directory/'resume-inputs.json').read_text(encoding='utf-8'))
    wanted = json.loads((directory/'active-wanted.json').read_text(encoding='utf-8'))
    cases = {c['name']: c for c in json.loads((directory/'cases.json').read_text(encoding='utf-8'))}
    second = []
    commands = ['@echo off']
    require_continuation_passes(directory, list(snapshots))
    for name, inputs in snapshots.items():
        folder = directory/name
        for filename, digest in inputs.items():
            if filename in wanted[name]:
                assert (folder/filename).read_bytes() == bytes.fromhex(wanted[name][filename]), (name, filename)
            else:
                assert hashlib.sha256((folder/filename).read_bytes()).hexdigest() == digest, (name, filename)
        assert not list(folder.glob('*.MS?')) and not list(folder.glob('*.MB?')), name
        assert not (folder/'CHECK.EFX').exists() and not (folder/'CCECL.TRC').exists(), name
        fx = (folder/'NEXT.EFX').read_bytes()
        assert struct.unpack_from('<H', fx, 8)[0] == (4 if cases[name]['again'] else 0), name
        if cases[name]['again']:
            record = (folder/'NEXT.YLD').read_bytes()
            first = (folder/'RES.BIN').read_bytes()
            assert record[24:34] == first[11120:11130], name
            assert record[34:38] == bytes(4), name  # 7D00 consumed not-found exactly once
            assert struct.unpack_from('<H', record, 52)[0] == cases[name]['steps']+2, name
            (folder/'MAN2.BIN').write_bytes(manifest(
                ['ACT.IV', 'NEXT.EFX', 'ACT.GBP', 'ACT.BIN', cases[name]['input']], bytes(range(1, 9))))
            expected = from_yield(record, fx, (folder/'ACT.GBP').read_bytes(),
                                  (folder/'ACT.IV').read_bytes(), (folder/'ACT.BIN').read_bytes()[540:3112],
                                  (folder/'ITEMS').read_bytes()[2:2050], learning=bytes(range(1, 9)))
            (folder/'WANT2.BIN').write_bytes(response(expected, (folder/'ACT.IV').read_bytes()))
            commands += [f'cd \\{name}', '..\\CCINV B MAN2.BIN REQ2.BIN > B2.TXT',
                         '..\\CCINV M ACT.IV REQ2.BIN RES2.BIN > M2.TXT']
            second.append(name)
        else:
            assert not (folder/'NEXT.YLD').exists(), name
        count = struct.unpack_from('<H', fx, 196)[0]
        keys = struct.unpack_from(f'<{count}H', fx, 198)
        vals = struct.unpack_from(f'<{count}H', fx, 1222)
        memory = dict(zip(keys, vals))
        assert memory[0x90EE] == 42, name
        if cases[name]['queries']:
            assert (0x90F0 in memory) == (cases[name]['target'] != 39), name
            active = (folder/'ACT.GBP').read_bytes()
            moves = [active[16+i*410+1+408] for i in range(struct.unpack_from('<H', active, 6)[0])]
            assert [memory[a] for a in (0x9100, 0x9101, 0x9102)] == [min(moves), max(moves), sum(moves)//len(moves)], name
            skills = [active[16+i*410+1+219] for i in range(len(moves))]
            assert [memory[a] for a in (0x9110, 0x9111, 0x9112)] == [min(skills), max(skills), sum(skills)//len(skills)], name
        original = bytearray((folder/'RES.BIN').read_bytes()[48:5798])
        if cases[name]['events']:
            assert struct.unpack_from('<4H', original, 32) == (1, 2, 3, 4), name
            assert struct.unpack_from('<H', original, 5718)[0] == 5, name
            struct.pack_into('<H', original, 5718, 4)
            damage = [o for o in range(2252, 2252+20*struct.unpack_from('<H', original, 2250)[0], 20)
                      if struct.unpack_from('<H', original, o)[0] == 0x2E]
            assert len(damage) == 1, name
            if cases[name]['acknowledged']:
                struct.pack_into('<H', original, damage[0]+2, 0)
        assert fx[10:30] == original[10:30], name
        assert fx[32:116] == original[32:116], name
        assert fx[2246:5720] == original[2246:5720], name
    print(f'PASS: {len(snapshots)} DOS checked mutation continuations')
    rejected = json.loads((directory/'reject-inputs.json').read_text(encoding='utf-8'))
    statuses = (directory/'REJECT.LOG').read_text().split()
    assert len(statuses) == len(rejected), ('REJECT.LOG', len(statuses), len(rejected))
    failures = [(name, status) for name, status in zip(rejected, statuses) if status != 'PASS']
    assert not failures, ('REJECT.LOG', failures)
    for name, inputs in rejected.items():
        for filename, digest in inputs.items():
            assert hashlib.sha256((directory/name/filename).read_bytes()).hexdigest() == digest, (name, filename)
        assert not (directory/name/'BAD.EFX').exists(), name
    print(f'PASS: {len(rejected)} DOS mutation continuation rejections')
    from tools.cok_native_activation import verify as verify_activation
    verify_activation(directory)
    (directory/'second.json').write_text(json.dumps(second), encoding='utf-8')
    (directory/'RUN.BAT').write_text('\r\n'.join(commands)+'\r\n', encoding='ascii')


def verify_second(directory):
    directory = Path(directory)
    names = json.loads((directory/'second.json').read_text(encoding='utf-8'))
    commands = ['@echo off']
    wanted = {}
    for name in names:
        folder = directory/name
        raw = (folder/'RES2.BIN').read_bytes()
        assert raw == (folder/'WANT2.BIN').read_bytes(), name
        length = struct.unpack_from('<H', raw, 20)[0]
        wanted[name] = {'ACT.GBP': raw[5798:5798+length].hex(), 'ACT.IV': raw[13224:].hex(),
                        'ACT.BIN': activation_seed((folder/'ACT.BIN').read_bytes(), raw).hex()}
        commands += checked_continuation_commands(
            name, '..\\CCECL CODE.BIN /B ACT.GBP /ID 1 /G ACT.BIN /R RES2.BIN CHECK > CHECK2.TXT',
            '..\\CCINV C MAN2.BIN REQ2.BIN RES2.BIN > COMMIT2.TXT',
            '..\\CCECL CODE.BIN /B ACT.GBP /ID 1 /G ACT.BIN /R RES2.BIN MUTATE /E FINAL.EFX > FINAL.TXT',
            log_suffix='2')
    (directory/'second-wanted.json').write_text(json.dumps(wanted), encoding='utf-8')
    (directory/'RUN.BAT').write_text('\r\n'.join(commands)+'\r\n', encoding='ascii')


def verify_finished(directory):
    directory = Path(directory)
    names = json.loads((directory/'second.json').read_text(encoding='utf-8'))
    require_continuation_passes(directory, names, log_suffix='2')
    wanted = json.loads((directory/'second-wanted.json').read_text(encoding='utf-8'))
    for name in names:
        for filename, expected in wanted[name].items():
            assert (directory/name/filename).read_bytes() == bytes.fromhex(expected), (name, filename)
        fx = (directory/name/'FINAL.EFX').read_bytes()
        assert struct.unpack_from('<H', fx, 8)[0] == 0, name
        count = struct.unpack_from('<H', fx, 196)[0]
        memory = dict(zip(struct.unpack_from(f'<{count}H', fx, 198), struct.unpack_from(f'<{count}H', fx, 1222)))
        assert memory[0x90EE] == 42 and memory[0x90EF] == 43, name
    print(f'PASS: {len(names)} DOS consecutive mutation round trips')


if __name__ == '__main__':
    import sys
    {'prepare': prepare, 'yields': verify_yields, 'candidates': verify_candidates,
     'resumes': verify_resumes, 'second': verify_second, 'finished': verify_finished}[sys.argv[1]](sys.argv[2])
