"""Execute the live Secret native decoder, file reader and coefficient import."""
from pathlib import Path
import re
import shutil
import struct
import subprocess

import pytest
unicorn = pytest.importorskip('unicorn')
from unicorn import x86_const as x86

from tools.secret_melee_stats import SecretSource, normal_melee_stats, attacks_for_parity, damage_draws
from tools.test_secret_melee_stats import retail, AMIGA, owned_lists, glib_raw_members
from tools.test_secret_player_stats import inputs
from tools.secret_player_stats import player_stats, stf_items
from tools.secret_roster import Hero, Roster, encode, decode, update_hp

ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ('se_fill_enemy', 'se_rle_to_monraw', 'se_find_member', 'se_scan_profile',
           'se_attacks_this_round', 'se_die', 'se_setup', 'monraw', 'se_catalog', 'ss_body',
           'cs_slots', 'mon_glib', 'mon_raw_size', 'comb', 'sec_dcount', 'sec_dsides',
           'sec_dbonus', 'want_mon', 'hlib_mem_start', 'hlib_mem_end', 'se_file_len',
           'round', 'rng_state', 'emode', 'monmode', 'monname', 'secret_profile')
EXPORTS += ('se_mon_member', 'dax_len', 'hlib_ptr_count', 'se_aux_stride', 'se_mon_file_len')
EXPORTS += ('native_damage',)
EXPORTS += ('se_load_secret_party', 'partyname', 'ncomb', 'party_slots', 'secret_party_loaded',
            'sr_validate', 'sr_length')
EXPORTS += ('attacks_this_round', 'consume_quick_attack', 'player_attacks_left',
            'quick_budget_active', 'attack_secondary')
BASE, INPUT, AUX, STACK = 0x10000, 0x30000, 0x40000, 0x50000


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    nasm = shutil.which('nasm') or str(Path.home() / 'AppData/Local/bin/NASM/nasm.exe')
    if not Path(nasm).is_file() and not shutil.which(nasm):
        pytest.skip('NASM absent')
    folder = tmp_path_factory.mktemp('secret-native')
    source = (ROOT / 'native/src/cccombat.asm').read_text()
    roll_start = source.index('rng_roll:\n')
    roll = source[roll_start:source.index('\n; ============================================================================', roll_start)]
    damage = source.split('.roll_damage:\n', 1)[1].split('.dmgok:\n', 1)[0]
    budget = source[source.index('attacks_available:\n'):source.index('secondary_attack_present_cur:\n')]
    constants = '\n'.join(re.findall(r'^(?:C_\w+|CF_UNCON|DEFAULT_MOVE_CELLS|DAXPARAS|HLIB_PTRCAP|DAX_FILEMAX)\s+equ\s+.*$', source, re.M))
    asm = folder / 'probe.asm'
    binary = folder / 'probe.bin'
    asm.write_text('cpu 386\nbits 16\norg 100h\ndw ' + ','.join(EXPORTS) + '\n' + constants + '''
%include "secretcombat.inc"
''' + budget + roll + '\nrng_die:\n    jmp se_die\nnative_damage:\n.roll_damage:\n' + damage + '''
.dmgok:
    ret
cur_ptr dw comb
player_attacks_left dw 0
quick_budget_active db 0
attack_secondary db 0
monraw times 2048 db 0
mon_glib db 1
mon_raw_size dw 440
comb times 38*16 db 0
sec_dcount times 16 dw 0
sec_dsides times 16 dw 0
sec_dbonus times 16 dw 0
partyname times 112 db 0
party_slots times 8 db 0
ncomb dw 0
want_mon dw 0
hlib_mem_start dw 0
hlib_mem_end dw 0
dax_len dw 0
hlib_ptr_count dw 0
round dw 1
rng_state dd 0
emode db 1
monmode db 1
monname times 64 db 0
''', encoding='ascii')
    result = subprocess.run([nasm, '-I', str(ROOT / 'native/src') + '/', '-f', 'bin', str(asm),
                             '-o', str(binary)], capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
    data = binary.read_bytes()
    return data, dict(zip(EXPORTS, struct.unpack_from('<' + 'H' * len(EXPORTS), data)))


class Native:
    def __init__(self, image, files=None):
        data, self.labels = image
        self.uc = unicorn.Uc(unicorn.UC_ARCH_X86, unicorn.UC_MODE_16)
        self.uc.mem_map(0, 0x60000)
        self.uc.mem_write(BASE + 0x100, data)
        self.files = {name.upper(): value for name, value in (files or {}).items()}
        self.handles = {}
        self.requests = []
        self.uc.hook_add(unicorn.UC_HOOK_INTR, self.interrupt)

    def put(self, label, value):
        self.uc.mem_write(BASE + self.labels[label], value)

    def get(self, label, count):
        return bytes(self.uc.mem_read(BASE + self.labels[label], count))

    def interrupt(self, uc, number, unused):
        assert number == 0x21
        ax = uc.reg_read(x86.UC_X86_REG_AX)
        bx = uc.reg_read(x86.UC_X86_REG_BX)
        cx = uc.reg_read(x86.UC_X86_REG_CX)
        dx = uc.reg_read(x86.UC_X86_REG_DX)
        address = (uc.reg_read(x86.UC_X86_REG_DS) << 4) + dx
        carry = False
        if ax == 0x3d00:
            name = bytes(uc.mem_read(address, 96)).split(b'\0', 1)[0].decode().upper()
            self.requests.append(name)
            if name not in self.files:
                ax, carry = 2, True
            else:
                ax = len(self.handles) + 10
                self.handles[ax] = [self.files[name], 0]
        elif ax == 0x4202:
            ax = len(self.handles[bx][0])
            uc.reg_write(x86.UC_X86_REG_DX, ax >> 16)
            ax &= 65535
        elif ax == 0x4200:
            self.handles[bx][1] = dx
            ax = dx
            uc.reg_write(x86.UC_X86_REG_DX, 0)
        elif ax >> 8 == 0x3f:
            body, cursor = self.handles[bx]
            chunk = body[cursor:cursor + cx]
            if chunk:
                uc.mem_write(address, chunk)
            self.handles[bx][1] += len(chunk)
            ax = len(chunk)
        elif ax >> 8 == 0x3e:
            del self.handles[bx]
        elif ax >> 8 == 0x48:
            ax = AUX >> 4
        elif ax >> 8 == 9:
            pass
        else:
            raise AssertionError(f'unexpected DOS call {ax:04x}')
        uc.reg_write(x86.UC_X86_REG_AX, ax)
        flags = uc.reg_read(x86.UC_X86_REG_EFLAGS)
        uc.reg_write(x86.UC_X86_REG_EFLAGS, flags | 1 if carry else flags & ~1)

    def call(self, label, ax=0, di=None, **registers):
        for register, value in ((x86.UC_X86_REG_CS, BASE >> 4), (x86.UC_X86_REG_DS, BASE >> 4),
                                (x86.UC_X86_REG_ES, BASE >> 4), (x86.UC_X86_REG_FS, INPUT >> 4),
                                (x86.UC_X86_REG_GS, AUX >> 4), (x86.UC_X86_REG_SS, STACK >> 4),
                                (x86.UC_X86_REG_SP, 0xffe0), (x86.UC_X86_REG_EFLAGS, 2),
                                (x86.UC_X86_REG_AX, ax), (x86.UC_X86_REG_DI, di or self.labels['comb'])):
            self.uc.reg_write(register, value)
        for name, value in registers.items():
            self.uc.reg_write(getattr(x86, 'UC_X86_REG_' + name.upper()), value)
        self.uc.mem_write(STACK + 0xffe0, struct.pack('<H', 0xff00))
        self.uc.emu_start(BASE + self.labels[label], BASE + 0xff00, count=1000000)
        assert self.uc.reg_read(x86.UC_X86_REG_IP) == 0xff00
        return bool(self.uc.reg_read(x86.UC_X86_REG_EFLAGS) & 1)


@pytest.fixture(scope='module')
def auxiliary():
    paths = {name: AMIGA / 'DISK2' / name for name in ('MONITM.GLB', 'MONSPC.GLB')}
    if not all(path.is_file() for path in paths.values()):
        pytest.skip('never-vendored Amiga auxiliary sources absent')
    return {name: path.read_bytes() for name, path in paths.items()}


@pytest.mark.parametrize('mode', ('baseline', 'injured', 'zero', 'armor', 'container'))
def test_native_owned_player_roster_projection_and_cold_catalog(image, inputs, mode):
    source, files = inputs
    heroes = []
    for slot in range(1, 7):
        raw = bytearray(files[f'CHRDATA{slot}.SAV'])
        if mode == 'injured':
            raw[437] -= 1
        elif mode == 'zero':
            raw[437] = 0
        stf = b''
        if mode in ('armor', 'container'):
            stf = source.inventories[72] + bytes(4)
            if mode == 'container':
                head = bytearray(stf); head[46] = 73; head[52] = 0; head[57] = 1
                stf = bytes(head) + stf
        heroes.append(Hero(slot, bytes(raw), stf, files.get(f'CHRDATA{slot}.SFX', b'')))
    roster = Roster(tuple(heroes), source.definitions)
    data = encode(roster)
    assert decode(data) == roster
    native = Native(image, {'OWNED.GBP': data})
    native.put('partyname', b'OWNED.GBP\0')
    untouched = bytes([0xd3]) * 32768
    native.uc.mem_write(INPUT, untouched)
    assert not native.call('se_load_secret_party')
    assert native.get('ncomb', 2) == struct.pack('<H', 6)
    assert native.get('party_slots', 6) == bytes(range(1, 7))
    assert native.get('secret_party_loaded', 1) == b'\1'
    records = native.get('comb', 6 * 38)
    for index, hero in enumerate(heroes):
        expected = player_stats(hero.body, stf_items(hero.stf), source.definitions).normal
        record = records[index * 38:(index + 1) * 38]
        assert record[:2] == bytes([0, index])
        assert struct.unpack_from('<7h', record, 2) == (
            hero.body[437], hero.body[112], expected.thac0, expected.armor_class,
            expected.primary.count, expected.primary.sides, expected.primary.bonus)
        assert struct.unpack_from('<HH', record, 34) == (0x8000 | expected.secondary.rate, expected.primary.rate)
        assert bool(struct.unpack_from('<H', record, 20)[0] & 2) == (mode == 'zero')
    assert native.requests == ['OWNED.GBP']
    assert not native.handles
    assert bytes(native.uc.mem_read(INPUT, 32768)) == untouched
    assert bytes(native.uc.mem_read(AUX, len(data))) == data
    changed = update_hp(data, tuple(0 for _ in heroes))
    assert {i for i, (a, b) in enumerate(zip(data, changed)) if a != b} <= {
        16 + index * 440 + 438 for index in range(6)}


@pytest.mark.parametrize('mutation', ('version', 'title', 'flags', 'stride', 'duplicate',
                                    'short', 'trailing', 'trailer', 'companion_slot', 'stf', 'sfx'))
def test_native_secret_roster_rejects_foreign_and_malformed_images(image, inputs, mutation):
    source, files = inputs
    data = bytearray(encode(Roster(tuple(Hero(i, files[f'CHRDATA{i}.SAV']) for i in range(1, 7)), source.definitions)))
    trailer = 16 + 6 * 440
    companion = trailer + 16 + 2048
    if mutation in ('version', 'title', 'flags', 'stride'):
        offset = {'version': 4, 'title': 12, 'flags': 10, 'stride': 8}[mutation]
        struct.pack_into('<H', data, offset, 2 if mutation != 'flags' else 3)
    elif mutation == 'duplicate':
        data[16 + 440] = 1
    elif mutation == 'short':
        data.pop()
    elif mutation == 'trailing':
        data.append(0)
    elif mutation == 'trailer':
        data[trailer] = 0
    elif mutation == 'companion_slot':
        data[companion] = 6
    else:
        struct.pack_into('<H', data, companion + (2 if mutation == 'stf' else 4), 1)
    with pytest.raises(ValueError):
        decode(bytes(data))
    native = Native(image, {'OWNED.GBP': bytes(data)})
    native.put('partyname', b'OWNED.GBP\0')
    assert native.call('se_load_secret_party')
    assert native.get('secret_party_loaded', 1) == b'\0'
    assert not native.handles
    assert native.files['OWNED.GBP'] == bytes(data)


def test_all_seventy_live_native_imports_match_independent_original_model(image, retail, auxiliary):
    for identifier, raw in retail.monsters.items():
        native = Native(image, auxiliary)
        native.put('monraw', raw + b'\0')
        native.put('se_catalog', retail.definitions)
        native.put('want_mon', struct.pack('<H', identifier))
        untouched = bytes([0xd3]) * 32768
        native.uc.mem_write(INPUT, untouched)
        assert not native.call('se_fill_enemy'), identifier
        items, _ = owned_lists(retail, identifier)
        expected = normal_melee_stats(raw, items, retail.definitions, SecretSource.DOS)
        record = native.get('comb', 38)
        assert struct.unpack_from('<7h', record, 2) == (
            expected.current_hp, expected.maximum_hp, expected.thac0, expected.armor_class,
            expected.primary.count, expected.primary.sides, expected.primary.bonus)
        assert struct.unpack('<h', native.get('sec_dcount', 2))[0] == expected.secondary.count
        assert struct.unpack('<h', native.get('sec_dsides', 2))[0] == expected.secondary.sides
        assert struct.unpack('<h', native.get('sec_dbonus', 2))[0] == expected.secondary.bonus
        assert struct.unpack_from('<HH', record, 34) == (0x8000 | expected.secondary.rate, expected.primary.rate)
        assert struct.unpack('<13I', native.get('cs_slots', 52)) == tuple(
            0xffffffff if slot is None else slot for slot in expected.equipment)
        assert bytes(native.uc.mem_read(INPUT, 32768)) == untouched


def test_all_seventy_native_headerless_decodes_are_exact(image, retail):
    path = AMIGA / 'DISK2/MONCHA.GLB'
    if not path.is_file():
        pytest.skip('never-vendored Amiga MONCHA absent')
    for identifier, member in glib_raw_members(path).items():
        native = Native(image)
        native.uc.mem_write(INPUT + 0x100, member)
        native.put('hlib_mem_start', struct.pack('<H', 0x100))
        native.put('hlib_mem_end', struct.pack('<H', 0x100 + len(member)))
        assert not native.call('se_rle_to_monraw'), identifier
        assert native.get('monraw', 440) == retail.monsters[identifier] + b'\0'


def test_every_native_rate_and_parity_matches_original_model(image):
    native = Native(image)
    for source_parity in (0, 1):
        native.put('round', struct.pack('<H', source_parity + 1))
        for rate in range(256):
            native.call('se_attacks_this_round', rate)
            assert native.uc.reg_read(x86.UC_X86_REG_AX) == attacks_for_parity(rate, source_parity)


@pytest.mark.parametrize('sides', (0, 1, 4, 8, 20, 255))
@pytest.mark.parametrize('seed', (0, 1, 0x12345678, 0xffffffff))
def test_native_die_and_state_match_original_pascal_helper(image, seed, sides):
    native = Native(image)
    native.put('rng_state', struct.pack('<I', seed))
    native.call('se_die', sides)
    result, final = damage_draws(seed, 1, sides)
    assert native.uc.reg_read(x86.UC_X86_REG_AX) == result
    assert struct.unpack('<I', native.get('rng_state', 4))[0] == final


@pytest.mark.parametrize('count', (1, 255))
@pytest.mark.parametrize('sides', (8, 255))
@pytest.mark.parametrize('bonus', (-128, -1, 0, 127))
@pytest.mark.parametrize('seed', (1, 0x12345678))
@pytest.mark.parametrize('side', (0, 1))
def test_live_normal_damage_prefix_preserves_byte_wrap_and_zero(image, seed, count, sides, bonus, side):
    native = Native(image)
    native.put('secret_profile', b'\1')
    native.put('comb', bytes([side]))
    native.put('secret_party_loaded', bytes([int(side == 0)]))
    native.put('rng_state', struct.pack('<I', seed))
    native.call('native_damage', bx=count, cx=sides, dx=bonus & 65535)
    expected, final = damage_draws(seed, count, sides, bonus)
    assert native.uc.reg_read(x86.UC_X86_REG_AX) == expected
    assert struct.unpack('<I', native.get('rng_state', 4))[0] == final


def test_imported_secret_primary_turn_ledger_uses_source_phase_and_zero(image):
    native = Native(image)
    native.put('secret_profile', b'\1')
    native.put('secret_party_loaded', b'\1')
    for parity in (0, 1):
        native.put('round', struct.pack('<H', parity+1))
        for rate in range(256):
            record = bytearray(38)
            struct.pack_into('<HH', record, 34, 0x8000, rate)
            native.put('comb', bytes(record))
            native.call('attacks_this_round')
            assert native.uc.reg_read(x86.UC_X86_REG_AX) == attacks_for_parity(rate, parity)


def test_imported_secondary_swings_preserve_primary_quick_ledger(image):
    native = Native(image)
    native.put('secret_party_loaded', b'\1')
    native.put('quick_budget_active', b'\1')
    native.put('player_attacks_left', struct.pack('<H', 2))
    native.put('attack_secondary', b'\1')
    native.call('consume_quick_attack')
    assert native.get('player_attacks_left', 2) == struct.pack('<H', 2)
    native.put('attack_secondary', b'\0')
    native.call('consume_quick_attack')
    assert native.get('player_attacks_left', 2) == struct.pack('<H', 1)


@pytest.mark.parametrize('tail,accepted', [('/E fx mon 1 /9 1', True),
    ('/E fx mon 1 /9', False), ('/E fx mon 1 /9 0', False), ('/E fx mon 1 /9 2', False),
    ('/E fx mon 1 /9 11', False), ('/E fx mon 1 /9 1x', False),
    ('/E fx mon 1 /9 1 /9 1', False)])
def test_exact_native_numeric_profile_option(image, tail, accepted):
    native = Native(image)
    encoded = tail.encode()
    native.uc.mem_write(BASE + 0x80, bytes([len(encoded)]) + encoded + b'\r')
    assert native.call('se_scan_profile') is not accepted


@pytest.mark.parametrize('field', (4, 6, 10, 11, 12, 14, 18, 22))
def test_auxiliary_header_and_pointer_mutations_reject(image, auxiliary, field):
    native = Native(image)
    data = bytearray(auxiliary['MONITM.GLB'])
    data[field] ^= 0xff
    native.uc.mem_write(AUX, bytes(data))
    native.put('se_file_len', struct.pack('<H', len(data)))
    native.put('want_mon', struct.pack('<H', 72))
    assert native.call('se_find_member')


def test_malformed_owned_catalog_is_not_replaced_by_valid_fallback(image, retail):
    native = Native(image, {'ITEMS.DAT': retail.definitions[:-1],
                            '..\\DISK1\\ITEMS.DAT': retail.definitions})
    native.put('secret_profile', b'\1')
    native.put('monname', b'MONCHA.GLB\0')
    assert native.call('se_setup')
    assert native.requests == ['ITEMS.DAT']


def test_drive_relative_catalog_path_keeps_archive_ownership(image, retail):
    native = Native(image, {'D:ITEMS.DAT': retail.definitions})
    native.put('secret_profile', b'\1')
    native.put('monname', b'D:MONCHA.GLB\0')
    assert not native.call('se_setup')
    assert native.requests == ['D:ITEMS.DAT']


def moncha_image():
    path = AMIGA / 'DISK2/MONCHA.GLB'
    if not path.is_file():
        pytest.skip('never-vendored Amiga MONCHA absent')
    data = bytearray(path.read_bytes())
    count = struct.unpack_from('>H', data, 8)[0] + 1
    for index in range(count):
        offset = 16 + 4 * index
        value = struct.unpack_from('>I', data, offset)[0]
        struct.pack_into('<I', data, offset, value)
    return data, count


def test_full_native_member_selection_and_decoder_for_all_seventy(image, retail):
    data, count = moncha_image()
    native = Native(image)
    native.uc.mem_write(INPUT, bytes(data))
    native.put('dax_len', struct.pack('<H', len(data)))
    native.put('se_mon_file_len', struct.pack('<H', len(data)))
    native.put('hlib_ptr_count', struct.pack('<H', count))
    for identifier, raw in retail.monsters.items():
        native.put('want_mon', struct.pack('<H', identifier))
        assert not native.call('se_mon_member'), identifier
        assert native.get('monraw', 440) == raw + b'\0'
        assert bytes(native.uc.mem_read(INPUT, len(data))) == bytes(data)


@pytest.mark.parametrize('field', (4, 6, 10, 11, 12, 14, 16, 20))
def test_full_native_moncha_rejects_metadata_mutations(image, field):
    data, count = moncha_image()
    data[field] ^= 0xff
    native = Native(image)
    native.uc.mem_write(INPUT, bytes(data))
    native.put('dax_len', struct.pack('<H', len(data)))
    native.put('se_mon_file_len', struct.pack('<H', len(data)))
    native.put('hlib_ptr_count', struct.pack('<H', count))
    native.put('want_mon', struct.pack('<H', 72))
    assert native.call('se_mon_member')


def literals(body):
    return b''.join(bytes([len(body[i:i + 128]) - 1]) + body[i:i + 128]
                    for i in range(0, len(body), 128))


def single_inventory(payload):
    if len(payload) & 1:
        payload += b'\0'
    header = b'GLIB' + struct.pack('>I H BB', 34 + len(payload), 2, 0, 1) + b'DATA'
    return header + struct.pack('>III HHH', 28, 34, 34 + len(payload), 1, 72, 1) + payload


def check_native_model(native, raw, retail, items):
    native.put('monraw', raw + b'\0')
    native.put('se_catalog', retail.definitions)
    native.put('want_mon', struct.pack('<H', 72))
    assert not native.call('se_fill_enemy')
    expected = normal_melee_stats(raw, items, retail.definitions, SecretSource.DOS)
    assert struct.unpack_from('<7h', native.get('comb', 38), 2) == (
        expected.current_hp, expected.maximum_hp, expected.thac0, expected.armor_class,
        expected.primary.count, expected.primary.sides, expected.primary.bonus)
    assert tuple(struct.unpack('<h', native.get(field, 2))[0] for field in
                 ('sec_dcount', 'sec_dsides', 'sec_dbonus')) == (
        expected.secondary.count, expected.secondary.sides, expected.secondary.bonus)


@pytest.mark.parametrize('race', range(8))
@pytest.mark.parametrize('kind', (1, 8, 18, 19, 22, 26, 31, 67))
def test_native_secret_equipment_rule_for_each_kind_and_race(image, retail, auxiliary, race, kind):
    raw = bytearray(retail.monsters[72]); raw[107] = race
    item = bytearray(retail.inventories[72]); item[46] = kind
    files = dict(auxiliary, **{'MONITM.GLB': single_inventory(bytes(item))})
    check_native_model(Native(image, files), bytes(raw), retail, (bytes(item),))


@pytest.mark.parametrize('offset,value', [(106, 47), (112, 55), (437, 48), (294, 6), (292, 2), (296, 255)])
def test_native_independent_source_field_mutations(image, retail, auxiliary, offset, value):
    raw = bytearray(retail.monsters[72]); raw[offset] = value
    items, _ = owned_lists(retail, 72)
    check_native_model(Native(image, auxiliary), bytes(raw), retail, items)


@pytest.mark.parametrize('member', [b'', b'\x7f\0', b'\x81',
    literals(bytes(439)), literals(bytes(441)), literals(bytes(439) + b'X'),
    literals(bytes(440)) + b'\0X', literals(bytes(440)) + b'\x81X'])
def test_native_decoder_rejects_whole_run_and_terminal_padding_errors(image, member):
    native = Native(image)
    if member:
        native.uc.mem_write(INPUT + 0x100, member)
    native.put('hlib_mem_start', struct.pack('<H', 0x100))
    native.put('hlib_mem_end', struct.pack('<H', 0x100 + len(member)))
    native.put('monraw', bytes([0xa7]) * 512)
    assert native.call('se_rle_to_monraw')
    assert native.get('monraw', 512)[440:] == bytes([0xa7]) * 72
    assert native.get('mon_raw_size', 2) == b'\0\0'
