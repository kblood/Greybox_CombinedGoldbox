"""Whole native CLI, field capability, source arithmetic and device-bound null."""
from pathlib import Path
import shutil
import struct
import subprocess

import pytest

from tools.secret_selected_field_oracle import ORIGINAL_FIELDS as FIELDS
from tools.test_secret_native_who import WriterMachine
from tools.test_secret_continuation_io import BASE, x86
from tools.test_secret_native_strength_query import roster
from tools.test_secret_player_stats import inputs
from tools.test_secret_who_names import names_packet

ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ('start', 'who_fields_valid', 'who_fields', 'secret_field_get',
           'selected_party', 'selected_valid', 'party_count',
           'is_gen2', 'exec_one', 'vmstat', 'pc', 'flag_eq', 'cmp_l', 'cmp_r',
           'cur_op', 'blk', 'blklen', 'read_roster_file', 'rostername',
           'roster_expected_id', 'who_names_valid', 'who_field_columns',
           'cok_spell_rows', 'cok_spells_valid', 'cok_spell_count', 'find_cok_roster_spell',
           'parse_args', 'is_cok', 't0', 'party_thief_matrix', 'party_thief_matrix_count')


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    folder = tmp_path_factory.mktemp('secret-native-fields')
    asm, binary = folder / 'probe.asm', folder / 'probe.bin'
    asm.write_text('cpu 386\nbits 16\norg 100h\ndw ' + ','.join(EXPORTS) +
                   '\n%include "ccecl.asm"\n', encoding='ascii')
    nasm = shutil.which('nasm') or str(Path.home() / 'AppData/Local/bin/NASM/nasm.exe')
    result = subprocess.run([nasm, '-I', str(ROOT / 'native/src') + '/', '-f', 'bin',
                             str(asm), '-o', str(binary)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    data = binary.read_bytes()
    return data, dict(zip(EXPORTS, struct.unpack_from('<' + 'H' * len(EXPORTS), data)))


def glib(program):
    block = bytes(20) + program
    table = struct.pack('>3H', 1, 49, 1)
    first = 28 + len(table); end = first + len(block)
    return (b'GLIB' + struct.pack('>IHBB', end, 2, 0, 1) + b'DATA' +
            struct.pack('>3I', 28, first, end) + table + block)


class Whole(WriterMachine):
    def interrupt(self, uc, number, unused):
        ax = uc.reg_read(x86.UC_X86_REG_AX)
        if ax >> 8 == 0x4C:
            self.exit = ax & 255; uc.emu_stop(); return
        if ax >> 8 in (2, 9):
            return
        if ax >> 8 == 0x40 and uc.reg_read(x86.UC_X86_REG_BX) == 1:
            uc.reg_write(x86.UC_X86_REG_AX, uc.reg_read(x86.UC_X86_REG_CX))
            uc.reg_write(x86.UC_X86_REG_EFLAGS, uc.reg_read(x86.UC_X86_REG_EFLAGS) & ~1)
            return
        if ax >> 8 == 0x41:
            path = self.path((uc.reg_read(x86.UC_X86_REG_DS) << 4) + uc.reg_read(x86.UC_X86_REG_DX))
            assert path in self.files
            del self.files[path]
            uc.reg_write(x86.UC_X86_REG_EFLAGS, uc.reg_read(x86.UC_X86_REG_EFLAGS) & ~1)
            return
        return super().interrupt(uc, number, unused)

    def run(self, command):
        self.uc.mem_write(BASE + 0x80, bytes([len(command)]) + command.encode() + b'\r')
        for register, value in {'CS': BASE >> 4, 'DS': BASE >> 4, 'ES': BASE >> 4,
                                'SS': BASE >> 4, 'SP': 0xFFFE, 'EFLAGS': 2}.items():
            self.uc.reg_write(getattr(x86, 'UC_X86_REG_' + register), value)
        self.uc.emu_start(BASE + self.labels['start'], BASE + 65535, count=15000000)
        return self.exit


def memory(effect):
    count = struct.unpack_from('<H', effect, 196)[0]
    return dict(zip(struct.unpack_from('<' + 'H' * count, effect, 198),
                    struct.unpack_from('<' + 'H' * count, effect, 1222)))


def launch(image, packet, program, options='', low=None):
    m = Whole(image, {'C:\\FIELD.GLB': glib(program), 'C:\\N.GWN': packet})
    if low is not None:
        m.uc.mem_write(0, bytes(low))
    m.exit = None
    assert m.run(' C:\\FIELD.GLB 49 /ID4 /B C:\\N.GWN' + options + ' /E C:\\FINAL.EFX') == 0
    return m, bytes(m.files['C:\\FINAL.EFX'])


@pytest.mark.parametrize('actor', range(6))
@pytest.mark.parametrize('selector', FIELDS)
def test_whole_cli_who_reads_every_current_actor_field(image, roster, actor, selector):
    packet = names_packet(roster)
    program = b'\x39\x80\x01\x04\x09\x01' + struct.pack('<H', selector) + b'\x01\x0e\x4c\x00'
    m, result = launch(image, packet, program, f' /W{actor}')
    row = 16 + 16 * 6 + 16 + actor * 14
    expected = struct.unpack_from('<7H', packet, row)[list(FIELDS).index(selector)]
    assert memory(result)[0x4C0E] == expected
    assert struct.unpack_from('<2H', result, 5940) == (1, actor + 1)
    assert result[5924:5930] == bytes(6)
    assert bytes(m.files['C:\\N.GWN']) == packet


@pytest.mark.parametrize('selector', FIELDS)
@pytest.mark.parametrize('value', [128, 255])
@pytest.mark.parametrize('null_flags', [0, 2])
def test_null_reads_getter_time_device_byte_with_original_signedness(image, roster, selector, value, null_flags):
    low = bytearray(256); low[FIELDS[selector][0]] = value
    program = b'\x39\x80\x01\x04\x09\x01' + struct.pack('<H', selector) + b'\x01\x0e\x4c\x00'
    if null_flags:
        program = b'\x0a\x00\x00' + program  # failed LOAD_CHARACTER establishes not-found null
    m, result = launch(image, names_packet(roster), program, '', low)
    expected = value if not FIELDS[selector][1] or value < 128 else value - 256
    assert memory(result)[0x4C0E] == expected & 65535
    assert struct.unpack_from('<2H', result, 5940) == (null_flags, 0)
    assert m.uc.reg_read(x86.UC_X86_REG_ES) == BASE >> 4


@pytest.mark.parametrize('actor,expected', [(0, 88), (1, 89)])
def test_actual_stock_subtract_fragment_after_who_matches_original(image, roster, actor, expected):
    program = bytes.fromhex('39 80 01 04 05 01 19 7c 00 69 01 0e 4c 09 01 0e 4c 01 0f 4c 00')
    _, result = launch(image, names_packet(roster), program, f' /W{actor}')
    assert memory(result)[0x4C0E] == memory(result)[0x4C0F] == expected


@pytest.mark.parametrize('selector', FIELDS)
@pytest.mark.parametrize('offset_high', [0, 256])
def test_gettable_and_variable_reads_outrank_sparse_shadows(image, roster, selector, offset_high):
    offset = selector - 0x7C00 + offset_high
    program = (b'\x39\x80\x01\x04\x2a\x01\x00\x7c\x02' + struct.pack('<H', offset) +
               b'\x01\x0e\x4c\x09\x01' + struct.pack('<H', selector) + b'\x01\x0f\x4c\x00')
    packet = names_packet(roster)
    expected = struct.unpack_from('<7H', packet, 128)[list(FIELDS).index(selector)]
    _, result = launch(image, packet, program, f' /W0 /X{selector} 4660')
    assert memory(result)[0x4C0E] == memory(result)[0x4C0F] == expected
    assert memory(result)[selector] == 4660


def test_v1_whole_actor_read_halts_before_instruction_store_or_marker(image, roster):
    packet = bytearray(names_packet(roster)[:112])
    struct.pack_into('<2H', packet, 4, 1, 112)
    program = bytes.fromhex('39 80 01 04 05 01 19 7c 00 69 01 0e 4c 09 01 0e 4c 01 0f 4c 00')
    _, result = launch(image, bytes(packet), program, ' /W0 /X19470 4660')
    assert struct.unpack_from('<H', result, 8) == (4,)
    assert struct.unpack_from('<H', result, 124) == (24,)
    assert memory(result)[0x4C0E] == 4660 and 0x4C0F not in memory(result)
    assert struct.unpack_from('<2H', result, 5940) == (1, 1)


@pytest.mark.parametrize('fault', ['read', 'short-read', 'seek', 'close'])
def test_v2_field_capability_io_fault_never_grants_actor_values(image, roster, fault):
    m = WriterMachine(image, {'C:\\N.GWN': names_packet(roster)}, fault=fault)
    m.put('is_gen2', b'\2'); m.put('roster_expected_id', b'\4\0')
    m.put('rostername', b'C:\\N.GWN\0')
    assert m.call('read_roster_file') and m.get('who_fields_valid', 1) == b'\0'


@pytest.mark.parametrize('actor', [0, 3, 5])
@pytest.mark.parametrize('selector', tuple(FIELDS)[:6])
def test_old_v2_retains_all_six_fields_with_its_original_row_stride(image, roster, actor, selector):
    packet = names_packet(roster, version=2)
    program = b'\x39\x80\x01\x04\x09\x01' + struct.pack('<H', selector) + b'\x01\x0e\x4c\x00'
    _, result = launch(image, packet, program, f' /W{actor}')
    expected = struct.unpack_from('<6H', packet, 128 + actor * 12)[list(FIELDS).index(selector)]
    assert memory(result)[0x4C0E] == expected


def old_packet(owned, version):
    packet = names_packet(owned, version=2)
    if version == 1:
        packet = bytearray(packet[:16 + 16 * len(owned.heroes)])
        struct.pack_into('<2H', packet, 4, 1, len(packet))
    return bytes(packet)


@pytest.mark.parametrize('version', [1, 2])
def test_old_packets_cannot_grant_trap_getter_or_publish_partial_comparison(image, roster, version):
    # Establish distinct previous comparison state, then attempt the unavailable
    # field as the SECOND operand. Sparse shadows cannot authorize the getter.
    program = bytes.fromhex('03 00 07 00 07 39 80 01 04 03 00 23 01 a7 7c 09 00 01 01 0e 4c 00')
    _, result = launch(image, old_packet(roster, version), program, ' /W3 /X31911 4660')
    assert struct.unpack_from('<H', result, 8) == (4,)
    assert struct.unpack_from('<H', result, 124) == (29,)
    assert struct.unpack_from('<2H', result, 5778) == (7, 7)
    assert result[5924:5930] == bytes((1, 0, 0, 0, 1, 1))
    assert memory(result)[0x7CA7] == 4660 and 0x4C0E not in memory(result)


@pytest.mark.parametrize('version', [1, 2, 3])
@pytest.mark.parametrize('value', [128, 255])
def test_trap_null_reads_live_unsigned_device_byte_for_every_names_schema(image, roster, version, value):
    packet = names_packet(roster) if version == 3 else old_packet(roster, version)
    low = bytearray(256); low[245] = value
    program = bytes.fromhex('39 80 01 04 09 01 a7 7c 01 0e 4c 00')
    _, result = launch(image, packet, program, low=low)
    assert memory(result)[0x4C0E] == value and struct.unpack_from('<2H', result, 5940) == (0, 0)


@pytest.mark.parametrize('actor', [0, 3])
@pytest.mark.parametrize('left', [0, 35, 69, 70, 71, 255, 65535])
def test_trap_native_complete_compare_matches_unsigned_original_flags_and_pc(image, roster, actor, left):
    program = b'\x39\x80\x01\x04\x03\x02' + struct.pack('<H', left) + bytes.fromhex('01 a7 7c 00')
    _, result = launch(image, names_packet(roster), program, f' /W{actor} /X31911 4660')
    right = 70 if actor == 3 else 0
    assert struct.unpack_from('<2H', result, 5778) == (left, right)
    assert result[5924:5930] == bytes((left == right, left != right, left < right,
                                    left > right, left <= right, left >= right))
    assert memory(result)[0x7CA7] == 4660


@pytest.mark.parametrize('fault', ['truncated', 'unsigned', 'suffix-version', 'columns', 'title'])
def test_current_packet_faults_cannot_admit_stale_poisoned_trap_column(image, roster, fault):
    packet = bytearray(names_packet(roster))
    if fault == 'truncated': del packet[-1:]
    if fault == 'unsigned': struct.pack_into('<H', packet, 128 + 5 * 14 + 12, 256)
    if fault == 'suffix-version': struct.pack_into('<H', packet, 116, 1)
    if fault == 'columns': struct.pack_into('<H', packet, 122, 6)
    if fault == 'title': struct.pack_into('<H', packet, 10, 3)
    m = WriterMachine(image, {'C:\\N.GWN': packet})
    m.put('who_fields', b'\xFF' * 348)
    m.put('who_fields_valid', b'\1'); m.put('who_field_columns', b'\7')
    m.put('is_gen2', b'\2'); m.put('roster_expected_id', b'\4\0'); m.put('rostername', b'C:\\N.GWN\0')
    assert m.call('read_roster_file') and m.get('who_fields_valid', 2) == b'\0\0'


def test_shared_bank_alias_is_exact_and_invocation_resets_both_capabilities(image):
    assert image[1]['who_fields'] == image[1]['cok_spell_rows']
    m = WriterMachine(image, {})
    m.put('who_fields', b'\xA5' * 348)
    m.put('who_fields_valid', b'\1'); m.put('who_field_columns', b'\7')
    m.put('cok_spells_valid', b'\1'); m.put('cok_spell_count', b'\6\0')
    m.uc.mem_write(BASE + 0x80, b'\0\r')
    m.call('parse_args')
    assert m.get('who_fields_valid', 2) == b'\0\0' and m.get('cok_spells_valid', 1) == b'\0'
    assert m.get('who_fields', 348) == b'\xA5' * 348


def test_shared_bank_cok_keeps_all_six_complete_spell_rows_and_rejects_secret_roster(image, roster):
    m = WriterMachine(image, {'C:\\N.GWN': names_packet(roster)})
    bank = bytearray(348); bank[5 * 58 + 57] = 173
    m.put('cok_spell_rows', bytes(bank)); m.put('cok_spell_count', b'\6\0'); m.put('t0', b'\xAD\0')
    m.call('find_cok_roster_spell')
    assert m.uc.reg_read(x86.UC_X86_REG_AX) == 57 and m.uc.reg_read(x86.UC_X86_REG_BX) == 5
    # A CoK source cannot replace the bank using a Secret field capability.
    m.put('is_gen2', b'\0'); m.put('is_cok', b'\1'); m.put('roster_expected_id', b'\1\0')
    m.put('rostername', b'C:\\N.GWN\0')
    assert m.call('read_roster_file') and m.get('cok_spell_rows', 348) == bank


@pytest.mark.parametrize('first', ['secret', 'cok'])
def test_real_roster_imports_reuse_shared_bank_only_after_invocation_reset(image, roster, first):
    rows = []
    for actor in range(6):
        row = bytearray(409); row[:2] = bytes((1, 65 + actor))
        row[30:88] = bytes([actor + 1]) * 58
        rows.append(bytes(row))
    rows[5] = rows[5][:87] + b'\xAD' + rows[5][88:]
    cok = struct.pack('<4s6H', b'GBPR', 2, 6, 410, 0, 1, 1) + b''.join(bytes([i + 1]) + row for i, row in enumerate(rows))
    secret = names_packet(roster)
    m = WriterMachine(image, {'C:\\COK.GBP': cok, 'C:\\N.GWN': secret})
    m.put('cok_spell_rows', b'\xA5' * 348)
    for profile in (first, 'cok' if first == 'secret' else 'secret'):
        m.uc.mem_write(BASE + 0x80, b'\0\r'); m.call('parse_args')
        if profile == 'cok':
            m.put('is_cok', b'\1'); m.put('is_gen2', b'\0'); m.put('roster_expected_id', b'\1\0')
            m.put('rostername', b'C:\\COK.GBP\0')
            assert not m.call('read_roster_file')
            assert m.get('cok_spell_rows', 348) == b''.join(row[30:88] for row in rows)
            assert m.get('cok_spells_valid', 1) == b'\1' and m.get('who_fields_valid', 2) == b'\0\0'
            m.put('t0', b'\xAD\0'); m.call('find_cok_roster_spell')
            assert (m.uc.reg_read(x86.UC_X86_REG_AX), m.uc.reg_read(x86.UC_X86_REG_BX)) == (57, 5)
        else:
            m.put('is_cok', b'\0'); m.put('is_gen2', b'\2'); m.put('roster_expected_id', b'\4\0')
            m.put('rostername', b'C:\\N.GWN\0')
            assert not m.call('read_roster_file')
            assert m.get('who_fields', 84) == secret[128:212]
            assert m.get('who_fields_valid', 2) == b'\1\7' and m.get('cok_spells_valid', 1) == b'\0'
            m.put('selected_party', b'\4\0'); m.put('selected_valid', b'\1')
            assert not m.call('secret_field_get', BX=0x7CA7)
            assert m.uc.reg_read(x86.UC_X86_REG_AX) == 70


@pytest.mark.parametrize('profile', [0, 1])
def test_other_titles_cannot_consume_secret_trap_fields_from_poisoned_bank(image, profile):
    m = WriterMachine(image, {})
    m.put('who_fields', b'\xFF' * 348); m.put('who_fields_valid', b'\1'); m.put('who_field_columns', b'\7')
    m.put('selected_party', b'\4\0'); m.put('selected_valid', b'\1'); m.put('is_gen2', bytes([profile]))
    assert m.call('secret_field_get', BX=0x7CA7)
    assert m.get('who_fields', 348) == b'\xFF' * 348


@pytest.mark.parametrize('profile', [0, 1, 2])
def test_secret_unsigned_compare_keeps_other_profiles_signed(image, profile):
    m = WriterMachine(image, {})
    m.put('is_gen2', bytes([profile])); m.put('cur_op', b'\3'); m.put('pc', b'\0\0')
    m.put('blk', bytes.fromhex('03 02 ff ff 00 00')); m.put('blklen', b'\6\0')
    m.call('exec_one')
    assert m.get('cmp_l', 4) == bytes.fromhex('ff ff 00 00')
    expected = bytes((0, 1, 0, 1, 0, 1)) if profile == 2 else bytes((0, 1, 1, 0, 1, 0))
    assert m.get('flag_eq', 6) == expected and m.get('pc', 2) == b'\6\0'


@pytest.mark.parametrize('profile', [0, 1])
@pytest.mark.parametrize('left_code', [2, 0x81])
def test_deferred_compare_preserves_left_when_legacy_thief_getter_reuses_t0(image, profile, left_code):
    m = WriterMachine(image, {})
    m.put('is_gen2', bytes([profile])); m.put('cur_op', b'\3'); m.put('pc', b'\0\0')
    m.put('selected_party', b'\1\0'); m.put('selected_valid', b'\1')
    m.put('party_thief_matrix_count', b'\1'); m.put('party_thief_matrix', bytes([200]) + bytes(7))
    m.put('blk', bytes([3, left_code, 0x34, 0x12, 1, 0xA5, 0x7C])); m.put('blklen', b'\7\0')
    m.call('exec_one')
    assert m.get('t0', 2) == bytes.fromhex('a5 7c'), 'control did not exercise the clobbering getter'
    assert m.get('cmp_l', 4) == struct.pack('<2H', 0x1234, 200)
    assert m.get('flag_eq', 6) == bytes((0, 1, 0, 1, 0, 1)) and m.get('pc', 2) == b'\7\0'


def test_whole_secret_cli_two_random_draws_publish_new_semantics_and_full_next_seed(image, roster):
    from tools.secret_random import ecl_random
    program = bytes.fromhex('08 02 ff 00 01 0e 4c 08 02 00 01 01 0f 4c 00')
    _, result = launch(image, names_packet(roster), program)
    first, seed = ecl_random(0x1234,255)
    second, seed = ecl_random(seed,256)
    assert memory(result)[0x4C0E] == first and memory(result)[0x4C0F] == second
    assert struct.unpack_from('<I',result,126) == (seed,)
    assert struct.unpack_from('<H',result,120) == (12,)
    assert result[5924:5930] == bytes(6)
