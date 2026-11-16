"""Whole-record DOS camp-menu checks; retail inputs are copied into fixtures."""
from pathlib import Path
import json
import shutil
import struct
import sys
import zlib

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools.cok_inventory import split_checkpoint

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools.cok_memorization import MenuTables, change_queue
from tools.exepack_unpack import unpack


def tables():
    image, _ = unpack(ROOT/'Champions of Krynn/START.EXE')
    return MenuTables.from_retail(image, (ROOT/'Champions of Krynn/GAME.OVR').read_bytes())


def ecl(phase):
    raw = bytearray(22)+bytes([0x21, 0, 34, 0, 2, 0, 255])
    for key, value in [(0x4CF9, phase), (0x7ED2, 0), (0x7ED3, 0)]:
        raw += bytes([9, 0, value, 1])+struct.pack('<H', key)
    raw += b'\0'
    for index in range(4):
        struct.pack_into('<H', raw, 4+4*index, 0x7FFE+len(raw))
        raw += b'\0'
    packed = b''.join(bytes([len(raw[i:i+127])-1])+raw[i:i+127] for i in range(0, len(raw), 127))
    return struct.pack('<HBIHH', 9, 34, 0, len(raw), len(packed))+packed


def prepare(run):
    h = run/'H'
    h.mkdir()
    for p in (ROOT/'native/build').glob('*.com'):
        shutil.copyfile(p, h/p.name)
    rows = []
    for index in range(1, 7):
        body = bytearray((ROOT/f'Champions of Krynn/SAVE/CHRDATA{index}.SAV').read_bytes())
        body[30:89] = bytes(59)
        body[99:206] = bytes(107)
        body[249:265] = bytes(16)
        body[284:304] = bytes(20)
        body[392:394] = bytes([0, 1])
        body[407] = body[98]
        rows.append(body)
    basic = bytearray(rows[2])
    basic[19] = basic[21] = 18
    basic[249] = 4
    basic[99] = 1
    basic[284] = 3
    specs = []

    def add(name, spell=1, edits=None, queue=(), phase=0, member=3, ui=None):
        body = bytearray(basic)
        for offset, value in (edits or {}).items():
            body[offset] = value
        for slot, value in queue:
            body[30+slot] = value
        specs.append(dict(name=name, spell=spell, body=body.hex(), phase=phase, member=member, ui=ui))

    add('LEARN')
    add('SORT', queue=[(0, 129), (1, 1)])
    add('CAPACITY', queue=[(0, 1), (5, 129), (57, 1)])
    add('FULL', queue=list(enumerate([9]*58)))
    add('UNKNOWN', edits={99: 0})
    add('WISDOM', edits={21: 8})
    add('STATUS', edits={392: 1})
    add('FLAG', edits={393: 0})
    add('OWNER0', member=0)
    add('OWNER7', member=7)
    add('BADID', spell=108)
    add('BADQUEUE', queue=[(57, 128)])
    # Retail's F7:48 regained-slot predicate is keyed by Human race +90 == 6.
    add('DUAL', edits={249: 0, 251: 9, 257: 8, 90: 6, 215: 8})
    add('DUALWAIT', edits={249: 0, 251: 8, 257: 8, 90: 6, 215: 8})
    add('RANGER', spell=77, edits={249: 0, 253: 7, 175: 1, 289: 1})
    add('RANGER6', spell=77, edits={249: 0, 253: 6, 175: 1, 289: 1})
    add('KNIGHT', edits={249: 0, 256: 6})
    add('KNIGHT5', edits={249: 0, 256: 5})
    mage = {249: 0, 254: 2, 94: 1, 107: 1, 299: 1, 127: 1, 300: 1, 99: 0}
    add('MOON', spell=9, edits=mage, queue=[(0, 9)], phase=1)
    add('NOMOON', spell=9, edits=mage, queue=[(0, 9)])
    add('MOONUSED', spell=9, edits=mage, queue=list(enumerate([9, 137, 29, 157])), phase=2)
    add('INT', spell=9, edits=mage | {19: 8}, phase=2)
    holy = {199: 1, 93: 4}
    add('HOLY', spell=101, edits=holy, queue=[(2, 102)])
    add('DUPLAST', spell=101, edits=holy, queue=[(57, 101)])
    add('SLOTZERO', spell=101, edits=holy, queue=[(0, 101)])
    add('HOLYOLD', spell=101, edits=holy | {249: 0, 251: 9, 257: 8, 90: 6, 215: 8})
    add('HOLYWRAP', spell=101, edits=holy | {93: 0}, queue=[(2, 102), (3, 103)])
    add('LEVEL7', spell=56, edits={154: 1, 290: 1})
    add('CANCEL', spell=0, edits={88: 4}, queue=list(enumerate([129, 1, 0, 150, 22, 128, 255])))
    add('UIYES', spell=9, edits=mage | {299: 2}, ui='Y')
    add('UINO', spell=9, edits=mage | {299: 2}, ui='N')
    add('UICANCEL', spell=0, queue=[(0, 129), (3, 1)], ui='Y')
    oracle = tables()
    commands = []
    for case in specs:
        assert 1 <= len(case['name']) <= 8 and case['name'].isalnum()
        g = run/case['name']
        (g/'SAVE').mkdir(parents=True)
        for asset in ['KRYNN.CFG', 'GEO1.DAX', 'WALLDEF1.DAX', '8X8D1.DAX']:
            shutil.copyfile(ROOT/'Champions of Krynn'/asset, g/asset)
        original = [bytes(b) for b in rows]
        original[2] = bytes.fromhex(case['body'])
        for index, body in enumerate(original, 1):
            (g/f'SAVE/CHRDATA{index}.SAV').write_bytes(body)
            (g/f'SAVE/CHRDATA{index}.STF').write_bytes(b'')
        (g/'ECL1.DAX').write_bytes(ecl(case['phase']))
        expected = list(original)
        try:
            if not 1 <= case['member'] <= 6:
                raise ValueError('invalid owner')
            if case['ui'] != 'N':
                index = case['member']-1
                expected[index] = change_queue(original[index], case['spell'], oracle, {0x4CF9: case['phase']})
            case['ok'] = True
        except ValueError:
            case['ok'] = False
        case['original'] = [b.hex() for b in original]
        case['expected'] = [b.hex() for b in expected]
        commands += [f'cd \\{case["name"]}', 'del C:\\H\\_GBPARTY.GBP']
        if case['ui']:
            commands += ['C:\\H\\GBBOOT /E /2 0 /B 34 /C P /4 > START.TXT']
            action = 'C' if case['spell'] == 0 else str(case['spell'])
            # Owned plain-DOS BIOS typeahead, no host keyboard/focus automation.
            keys = 'M3\r'+action+'\r'+case['ui']+'\rX\rSX'
            assert len(keys) <= 15
            scans = {'M': 0x32, '3': 0x04, '9': 0x0A, 'C': 0x2E, 'Y': 0x15,
                     'N': 0x31, 'X': 0x2D, 'S': 0x1F, '\r': 0x1C, '\x1b': 1}
            words = ','.join(hex(scans[k]*256+ord(k)) for k in keys)
            assembly = ('bits 16\norg 100h\nmov si, keys\nmov bp, '+str(len(keys))+'\n'
                        'again: lodsw\nmov cx,ax\nmov ah,5\nint 16h\ntest al,al\njnz bad\n'
                        'dec bp\njnz again\n'
                        # CCFP deliberately drains stale input on explorer entry.
                        # Send its exit key later from an owned DOS timer helper.
                        'mov ax,351ch\nint 21h\nmov [old],bx\nmov [old+2],es\n'
                        'mov dx,tick\nmov ax,251ch\nint 21h\n'
                        'mov dx,(resident_end-$$+100h+15)/16\nmov ax,3100h\nint 21h\n'
                        'bad: mov ax,4c01h\nint 21h\n'
                        'tick: push ax\npush cx\ncmp word [cs:delay],0\nje chain\n'
                        'dec word [cs:delay]\njnz chain\nmov cx,011bh\nmov ah,5\nint 16h\n'
                        'chain: pop cx\npop ax\njmp far [cs:old]\n'
                        'old dd 0\ndelay dw 90\nkeys dw '+words+'\nresident_end:\n')
            (g/'KEYS.ASM').write_text(assembly, encoding='ascii')
            commands += ['KEYS', 'C:\\H\\GBBOOT /5 > OUT.TXT']
        else:
            (g/'GREYBOX.GBS').write_bytes(b'prior checkpoint retained on rejection')
            commands += [f'C:\\H\\GBBOOT /E /6 {case["member"]} {case["spell"]} /B 34 /C P /4 > OUT.TXT']
    (run/'cases.json').write_text(json.dumps(specs), encoding='utf-8')
    (run/'RUN.BAT').write_text('\n'.join(commands)+'\n', encoding='ascii')


def verify_case(run, case):
    g = run/case['name']
    output = (g/'OUT.TXT').read_text()
    if case['ok']:
        assert 'native preview failed' not in output, (case['name'], output)
        if case['ui'] != 'N':
            assert 'Spell queue updated.' in output, (case['name'], output)
        cp = bytearray((g/'GREYBOX.GBS').read_bytes())
        assert struct.unpack_from('<H', cp, 4)[0] == 5
        assert split_checkpoint(cp)[1] is not None
        crc = struct.unpack_from('<I', cp, 28)[0]
        cp[28:32] = bytes(4)
        assert zlib.crc32(cp) == crc
        for index, row in enumerate(case['expected']):
            assert cp[5798+17+410*index:5798+17+410*index+409].hex() == row, (case['name'], index, 'checkpoint')
        assert cp[11104:11112] == bytes(8), (case['name'], 'stale learning state')
    else:
        assert 'Cannot change this spell queue' in output, (case['name'], output)
        assert (g/'GREYBOX.GBS').read_bytes() == b'prior checkpoint retained on rejection'
    for index, row in enumerate(case['expected'], 1):
        assert (g/f'SAVE/CHRDATA{index}.SAV').read_bytes().hex() == row, (case['name'], index, 'source')
        assert (g/f'SAVE/CHRDATA{index}.STF').read_bytes() == b''
    if case['ui']:
        assert 'Memorize' in output and 'Pending spell numbers:' in output
        assert ('Cancel all pending spells? Y/N:' if case['spell'] == 0 else 'Prepare Burning Hands? Y/N:') in output


def phase2(run):
    cases = json.loads((run/'cases.json').read_text())
    for case in cases:
        verify_case(run, case)
    commands = []
    for name in ['LEARN', 'MOON', 'CANCEL']:
        g = run/name
        (g/'ECL1.DAX').write_bytes(b'poison: must resume checkpoint')
        (g/'BEFORE.GBS').write_bytes((g/'GREYBOX.GBS').read_bytes())
        if name == 'LEARN':
            # A new external pending scroll must not change a saved rest action.
            scroll = bytearray(63)
            scroll[46], scroll[47], scroll[60] = 39, 101, 129
            (g/'SAVE/CHRDATA3.STF').write_bytes(scroll)
        action = '/6 3 9' if name == 'MOON' else '/2 51'
        commands += [f'cd \\{name}', f'C:\\H\\GBBOOT /5 {action} /4 > COLD.TXT']
    # A queue edit must discard an in-flight countdown for every member.
    reset = run/'RESET'
    shutil.copytree(run/'LEARN', reset)
    cp = bytearray((reset/'GREYBOX.GBS').read_bytes())
    cp[11104:11112] = bytes([1, 11, 1, 2, 3, 4, 5, 6])
    cp[28:32] = bytes(4)
    struct.pack_into('<I', cp, 28, zlib.crc32(cp))
    (reset/'GREYBOX.GBS').write_bytes(cp)
    commands += ['cd \\RESET', 'C:\\H\\GBBOOT /5 /6 3 1 /4 > COLD.TXT']
    (run/'RUN.BAT').write_text('\n'.join(commands)+'\n', encoding='ascii')
    print(f'PASS: {len(cases)} DOS memorization cases, including three real menu confirmation paths')


def verify(run):
    cases = json.loads((run/'cases.json').read_text())
    for name in ['LEARN', 'CANCEL']:
        case = next(c for c in cases if c['name'] == name)
        expected = [bytearray.fromhex(row) for row in case['expected']]
        if name == 'LEARN':
            expected[2][87] = 1
        cp = (run/name/'GREYBOX.GBS').read_bytes()
        before_inventory = split_checkpoint((run/name/'BEFORE.GBS').read_bytes())[1]
        assert split_checkpoint(cp)[1] == before_inventory
        assert all(not inv.records for inv in before_inventory)
        if name == 'LEARN':
            assert (run/name/'SAVE/CHRDATA3.STF').read_bytes()[60] == 129
        for index, row in enumerate(expected, 1):
            assert (run/name/f'SAVE/CHRDATA{index}.SAV').read_bytes() == row, (name, index)
            offset = 5798+17+410*(index-1)
            assert cp[offset:offset+409] == row
        output = (run/name/'COLD.TXT').read_text()
        assert ('Memorized spell: 1' in output) == (name == 'LEARN')
    g = run/'MOON'
    assert (g/'GREYBOX.GBS').read_bytes() == (g/'BEFORE.GBS').read_bytes()
    assert 'Cannot change this spell queue' in (g/'COLD.TXT').read_text()
    case = next(c for c in cases if c['name'] == 'LEARN')
    expected = [bytes.fromhex(row) for row in case['expected']]
    expected[2] = change_queue(expected[2], 1, tables(), {})
    cp = (run/'RESET/GREYBOX.GBS').read_bytes()
    assert cp[11104:11112] == bytes(8)
    for index, row in enumerate(expected, 1):
        assert (run/f'RESET/SAVE/CHRDATA{index}.SAV').read_bytes() == row
        offset = 5798+17+410*(index-1)
        assert cp[offset:offset+409] == row
    print('PASS: cold learning, cancellation and shared lunar allowance exhaustion')
    print('PASS: cold queue edit resets all in-flight learning counters')
    print('PASS: cold rest owns checkpoint inventory despite external pending scroll')


if __name__ == '__main__':
    mode, run = sys.argv[1], Path(sys.argv[2])
    {'prepare': prepare, 'phase2': phase2, 'verify': verify}[mode](run)
