"""Compile CCFP menu automation with real CCECL serialization and DOS IO.

These probes run native instructions; only DOS file services, graphics interrupts
and manual keyboard input are modeled. No shared COM build or DOSBox is used.
"""
from functools import lru_cache
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
from tools.test_secret_continuation_write import Machine as FileMachine
from tools.test_secret_continuation_io import BASE, x86
from tools.test_secret_continuation import menu_effect

ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ('start', 'parse_args', 'parse_ack_selection', 'load_effect_text',
           'validate_ack_effect', 'validate_auto_answer', 'show_pending_menu',
           'write_pending_outcome', 'write_ack_outcome', 'build_sidecar_effect_page',
           'advance_effect_text', 'validate_menu_stream', 'menu_auto', 'menu_arg_bad',
           'menu_auto_answer', 'sidecar_fault', 'effectname', 'ackname', 'snapname',
           'ackmode', 'loadbuf', 'fxreadlen', 'sidecar_active', 'sidecar_version',
           'sidecar_count', 'effect_text', 'effect_text_len', 'effect_text_current',
           'effect_text_offset', 'pending_prompt', 'pending_prompt_len',
           'menu_selected', 'pending_menu', 'sidebuf', 'side_dir', 'side_packed')
PRODUCER_EXPORTS = ('write_effects', 'fx_state', 'fx_script_count',
                    'fx_script_events', 'fx_script_texts', 'vmstat', 'is_gen2',
                    'ack_pending', 'area_id', 'pc', 'menu_pending_dest',
                    'menu_pending_count', 'menu_pending_opcode',
                    'menu_event_index', 'menu_text_count', 'menu_textbuf', 'efxname')


def compile_image(folder, filename, exports):
    nasm = shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    if not Path(nasm).is_file() and not shutil.which(nasm):
        pytest.skip('NASM absent')
    source, binary = folder/(filename+'.asm'), folder/(filename+'.bin')
    source.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(exports)
                      +'\n%include "'+filename+'.asm"\n', encoding='ascii')
    run = subprocess.run([nasm, '-I', str(ROOT/'native/src')+'/', '-f', 'bin',
                          str(source), '-o', str(binary)], capture_output=True,
                         text=True, timeout=30)
    assert run.returncode == 0, run.stdout+run.stderr
    data = binary.read_bytes()
    return data, dict(zip(exports, struct.unpack_from('<'+'H'*len(exports), data)))


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    return compile_image(tmp_path_factory.mktemp('ccfp-menu'), 'ccfp', EXPORTS)


class Machine(FileMachine):
    def __init__(self, image, files):
        super().__init__(image, files)
        self.uc.mem_map(0xA0000, 0x10000)
        self.keyboard = []
        self.manual_answer = b'1234'
        self.fail_sidecar_read = False
        self.fail_after_page = False

    def interrupt(self, uc, number, unused):
        ax = uc.reg_read(x86.UC_X86_REG_AX)
        if number == 0x21 and ax >> 8 == 0x4C:
            self.exit_code = ax & 255
            uc.reg_write(x86.UC_X86_REG_IP, 0xFF00)
            uc.emu_stop()
            return
        if number in (0x10, 0x33):
            return
        if number == 0x16:
            self.keyboard.append(('bios', ax))
            raise AssertionError('automated menu requested a BIOS key')
        if number == 0x21 and ax >> 8 in (0x02, 0x09):
            return
        if number == 0x21 and ax >> 8 == 0x0A:
            self.keyboard.append(('dos', ax))
            address = (uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX)
            uc.mem_write(address+1, bytes([len(self.manual_answer)])+self.manual_answer+b'\r')
            return
        late_page = (self.fail_after_page and
                     1 <= word(self, 'effect_text_current') < 0xFFFF)
        if (self.fail_sidecar_read or late_page) and number == 0x21 and ax >> 8 == 0x3F:
            handle = uc.reg_read(x86.UC_X86_REG_BX)
            if self.handles[handle][0].endswith('.GBS'):
                self.fault = 'read'
        return super().interrupt(uc, number, unused)


def word(m, label):
    return struct.unpack('<H', m.get(label, 2))[0]


def parse(m, arguments):
    tail = arguments.encode('ascii')
    assert len(tail) <= 127
    m.uc.mem_write(BASE+0x80, bytes([len(tail)])+tail+b'\r')
    m.call('parse_args')


@pytest.fixture(scope='module')
def producer(tmp_path_factory):
    compiled = compile_image(tmp_path_factory.mktemp('ccfp-producer'), 'ccecl', PRODUCER_EXPORTS)

    @lru_cache(maxsize=None)
    def produce(opcode=0x0f, version=1, pages=8):
        # Initialize the VM's actual serializer inputs from the documented v15
        # layout. write_effects creates all headers, identities and fixed tails.
        template = menu_effect(opcode)
        m = Machine(compiled, {})
        m.put('fx_state', template[:116])
        m.put('vmstat', b'\2')
        m.put('is_gen2', b'\1')
        m.put('ack_pending', bytes([opcode == 0x1d]))
        for name, value in [('area_id', 16), ('pc', 21),
                            ('menu_pending_dest', 65535 if opcode != 0x0f else 0x101),
                            ('menu_pending_count', {0x0f: 0, 0x22: 2, 0x1d: 1}[opcode]),
                            ('menu_pending_opcode', opcode), ('menu_event_index', pages)]:
            m.put(name, struct.pack('<H', value))
        m.put('menu_text_count', template[5790:5792])
        m.put('menu_textbuf', template[5792:5920])
        # PRINT_RETURN pages force repeated paging, followed by the menu row.
        text = struct.pack('<H', 3)+b'\4\x10\0'+bytes(29)
        rows = [struct.pack('<10H', 0x11, 1, *([0]*8))+text,
                struct.pack('<10H', 0x33, *([0]*9))+bytes(34)]*(pages//2)
        rows += [template[2252:2272]+template[3532:3566]]
        m.put('fx_script_count', struct.pack('<H', len(rows)))
        m.put('fx_script_events', b''.join(row[:20] for row in rows))
        m.put('fx_script_texts', b''.join(row[20:] for row in rows))
        m.put('efxname', b'C:\\MENU.EFX\0')
        m.call('write_effects')
        effect = bytearray(m.files['C:\\MENU.EFX'])
        struct.pack_into('<H', effect, 6, struct.unpack_from('<H', effect, 6)[0] | 0x100)
        stream = struct.pack('<4s2H', b'GBSL', 1, len(rows))+b''.join(rows)
        if version == 2:
            # GBPX format is CCFLOW's long packed PRINT layout: tagged row,
            # ordered directory entry, exact packed payload and character count.
            packed = int('000001'*160+'000000'+'00', 2).to_bytes(121, 'big')
            rows[0] = rows[0][:20]+struct.pack('<H4sH', 65535, b'GBPX', 0)+bytes(26)
            # CCFLOW preserves the serialized event and replaces its fixed text
            # with a bounded DREF into the authoritative GBPX packed payload.
            effect[3532:3566] = (struct.pack('<H4s4H', 65535, b'DREF', 0, 0, len(packed), len(packed))+bytes(20))
            stream = (struct.pack('<4s2H', b'GBSL', 2, len(rows))+b''.join(rows)
                      +struct.pack('<4s4H', b'GBPX', 1, 1, len(packed), 0)
                      +struct.pack('<4H', 0, 0, len(packed), 160)+packed)
        return bytes(effect), stream
    return produce


def setup(image, producer, opcode=0x0f, version=1, arguments=' /S1234'):
    effect, stream = producer(opcode, version)
    m = Machine(image, {'C:\\MENU.EFX': effect, 'C:\\MENU.GBS': stream,
                        'C:\\ANSWER.GMO': b'old acknowledged output'})
    parse(m, 'C:\\MENU.EFX C:\\ANSWER.GMO'+arguments)
    return m


def admit(m):
    m.call('load_effect_text')
    assert not m.call('validate_ack_effect')
    return m.call('validate_auto_answer')


@pytest.mark.parametrize('value', [0, 1234, 65535])
@pytest.mark.parametrize('form', [' /S{n}', ' /S {n}'])
def test_mode_aware_full_word_selection(image, producer, value, form):
    m = setup(image, producer, arguments=form.format(n=value))
    assert m.get('ackmode', 1) == b'\1'
    assert m.get('menu_auto', 1) == b'\1'
    assert m.get('menu_arg_bad', 1) == b'\0'
    assert word(m, 'menu_auto_answer') == value
    assert not admit(m)
    assert not m.call('show_pending_menu')
    assert not m.call('write_pending_outcome')
    answer = bytes(m.files['C:\\ANSWER.GMO'])
    assert struct.unpack('<4s7H', answer) == (b'GBMO', 2, value, 0, 21, 16, 0x101, 0x0f)
    assert not m.keyboard


@pytest.mark.parametrize('argument', ['65536', '999999999999', '-1', '+1', '1234x', '', '/W',
                                     '65536 /S1', '1 /S1234x'])
def test_invalid_answer_is_sticky_and_preserves_output(image, producer, argument):
    m = setup(image, producer, arguments=' /S '+argument)
    before = bytes(m.files['C:\\ANSWER.GMO'])
    assert m.get('menu_arg_bad', 1) == b'\1'
    assert admit(m)
    assert bytes(m.files['C:\\ANSWER.GMO']) == before
    assert not any(e['ax'] >> 8 == 0x3C for e in m.events)


def test_absent_scalar_keeps_manual_input(image, producer):
    m = setup(image, producer, arguments='')
    assert m.get('menu_auto', 1) == b'\0'
    assert not admit(m)
    assert not m.call('show_pending_menu')
    assert m.keyboard == [('dos', 0x0A00)]
    assert word(m, 'menu_selected') == 1234


def test_non_menu_snapshot_filename_keeps_legacy_meaning(image):
    m = Machine(image, {'C:\\GRID.BIN': bytes(100)})
    parse(m, 'C:\\GRID.BIN /S65535')
    assert m.get('ackmode', 1) == b'\0'
    assert m.get('menu_auto', 1) == b'\0'
    assert m.get('snapname', 128).split(b'\0', 1)[0] == b'65535'


@pytest.mark.parametrize('selection', [' /S1 /Z0', ' /Z1 /S65535'])
def test_automated_prompt_rejects_cycling_diagnostic_slots(image, producer, selection):
    effect, stream = producer()
    m = Machine(image, {'C:\\MENU.EFX': effect, 'C:\\MENU.GBS': stream,
                        'C:\\ANSWER.GMO': b'acknowledged sentinel'})
    tail = ('C:\\MENU.EFX C:\\ANSWER.GMO'+selection).encode('ascii')
    m.uc.mem_write(BASE+0x80, bytes([len(tail)])+tail+b'\r')
    m.call('start')
    assert m.exit_code != 0
    assert not m.keyboard
    assert m.files['C:\\ANSWER.GMO'] == b'acknowledged sentinel'
    assert not any(e['ax'] >> 8 == 0x3C for e in m.events)


@pytest.mark.parametrize('opcode,value,rejected', [(0x22, 0, False), (0x22, 1, False),
                                                   (0x22, 2, True), (0x22, 65535, True),
                                                   (0x1d, 0, False), (0x1d, 65535, False)])
def test_party_domain_and_canonical_ack(image, producer, opcode, value, rejected):
    m = setup(image, producer, opcode, arguments=' /S'+str(value))
    assert admit(m) == rejected
    if rejected:
        assert m.files['C:\\ANSWER.GMO'] == b'old acknowledged output'
        return
    if opcode == 0x22:
        assert not m.call('show_pending_menu')
        assert not m.call('write_pending_outcome')
    else:
        assert not m.call('write_ack_outcome')
    assert struct.unpack_from('<3H', m.files['C:\\ANSWER.GMO'], 4) == (2, value if opcode == 0x22 else 1,
                                                                               2 if opcode == 0x22 else 1)


@pytest.mark.parametrize('version', [1, 2])
def test_repeated_text_pages_write_ds_and_preserve_vga_es(image, producer, version):
    m = setup(image, producer, version=version)
    assert not admit(m)
    seen = []
    assert not m.call('build_sidecar_effect_page', BX=0, ES=0xA000)
    assert m.uc.reg_read(x86.UC_X86_REG_ES) == 0xA000
    assert m.get('effect_text_len', 1) != b'\0'
    for _ in range(20):
        seen.append(m.get('effect_text', m.get('effect_text_len', 1)[0]))
        stop = m.call('advance_effect_text', ES=0xA000)
        assert m.uc.reg_read(x86.UC_X86_REG_ES) == 0xA000
        if stop:
            break
    else:
        pytest.fail('source pages never reached the menu boundary')
    assert len(seen) >= 4
    assert m.get('sidecar_fault', 1) == b'\0'
    assert not m.keyboard


@pytest.mark.parametrize('change', ['missing', 'truncated', 'extra', 'earlier-text', 'final-row', 'identity'])
@pytest.mark.parametrize('version', [1, 2])
def test_malformed_stream_or_identity_never_replaces_output(image, producer, change, version):
    m = setup(image, producer, version=version)
    stream = m.files['C:\\MENU.GBS']
    if change == 'missing':
        del m.files['C:\\MENU.GBS']
    elif change == 'truncated':
        del stream[-1:]
    elif change == 'extra':
        stream += b'X'
    elif change == 'earlier-text':
        struct.pack_into('<H', stream, 8+54+20, 33)
    elif change == 'final-row':
        struct.pack_into('<H', stream, 8+8*54, 0x22)
    else:
        struct.pack_into('<H', m.files['C:\\MENU.EFX'], 5766, 22)
    m.call('load_effect_text')
    assert m.call('validate_ack_effect')
    assert m.files['C:\\ANSWER.GMO'] == b'old acknowledged output'
    assert not any(e['ax'] >> 8 == 0x3C for e in m.events)


@pytest.mark.parametrize('version', [1, 2])
def test_late_io_fault_is_sticky_and_blocks_writer(image, producer, version):
    m = setup(image, producer, version=version)
    assert not admit(m)
    m.fail_sidecar_read = True
    m.call('advance_effect_text', ES=0xA000)
    assert m.get('sidecar_fault', 1) == b'\1'
    m.fault = None
    m.fail_sidecar_read = False
    assert m.call('show_pending_menu')
    assert m.call('write_pending_outcome')
    assert m.files['C:\\ANSWER.GMO'] == b'old acknowledged output'


@pytest.mark.parametrize('opcode', [0x0f, 0x22, 0x1d])
@pytest.mark.parametrize('version', [1, 2])
def test_actual_startup_consumes_all_pages_without_a_key(image, producer, opcode, version):
    effect, stream = producer(opcode, version)
    m = Machine(image, {'C:\\MENU.EFX': effect, 'C:\\MENU.GBS': stream})
    tail = b'C:\\MENU.EFX C:\\ANSWER.GMO /S1'
    m.uc.mem_write(BASE+0x80, bytes([len(tail)])+tail+b'\r')
    m.call('start')
    assert m.exit_code == 0
    assert not m.keyboard
    answer = bytes(m.files['C:\\ANSWER.GMO'])
    assert struct.unpack_from('<3H', answer, 4) == (2, 1, {0x0f: 0, 0x22: 2, 0x1d: 1}[opcode])
    assert not m.handles


@pytest.mark.parametrize('case', ['overflow', 'party-domain', 'identity', 'late-read'])
@pytest.mark.parametrize('version', [1, 2])
def test_actual_startup_failure_preserves_existing_answer(image, producer, case, version):
    effect, stream = producer(0x22 if case == 'party-domain' else 0x0f, version)
    effect = bytearray(effect)
    if case == 'identity':
        struct.pack_into('<H', effect, 5766, 22)
    m = Machine(image, {'C:\\MENU.EFX': effect, 'C:\\MENU.GBS': stream,
                        'C:\\ANSWER.GMO': b'acknowledged sentinel'})
    answer = '65536' if case == 'overflow' else '2' if case == 'party-domain' else '1234'
    tail = ('C:\\MENU.EFX C:\\ANSWER.GMO /S'+answer).encode('ascii')
    m.uc.mem_write(BASE+0x80, bytes([len(tail)])+tail+b'\r')
    m.fail_after_page = case == 'late-read'
    m.call('start')
    assert m.exit_code != 0
    assert not m.keyboard
    assert m.files['C:\\ANSWER.GMO'] == b'acknowledged sentinel'
    assert not any(e['ax'] >> 8 == 0x3C for e in m.events)
    if case == 'late-read':
        assert m.get('sidecar_fault', 1) == b'\1'


@pytest.mark.parametrize('opcode', [0x0f, 0x1d])
@pytest.mark.parametrize('fault', ['write', 'short-write', 'close'])
def test_bound_outcome_writer_reports_io_failure(image, producer, opcode, fault):
    m = setup(image, producer, opcode)
    assert not admit(m)
    if opcode == 0x0f:
        assert not m.call('show_pending_menu')
    m.fault = fault
    assert m.call('write_ack_outcome' if opcode == 0x1d else 'write_pending_outcome')
