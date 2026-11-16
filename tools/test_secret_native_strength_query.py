"""Execute CCPARTY /V against owned P1, original arithmetic and DOS faults."""
from dataclasses import replace
from pathlib import Path
import ntpath
import shutil
import struct
import subprocess

import pytest
from tools.test_secret_continuation_write import Machine as FileMachine
from tools.test_secret_continuation_io import BASE, x86
from tools.test_secret_player_stats import inputs
from tools.secret_roster import Hero, Roster, encode
from tools.secret_player_stats import player_stats, stf_items
from tools.secret_strength import party_strength, normal_player_body
from tools.secret_strength_oracle import StrengthOracle

ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ('parse_output', 'sq_mode', 'sq_bad', 'outname', 'sq_reply', 'sq_query',
           'sq_calculate', 'sq_actor', 'sq_value', 'sp_body', 'ss_body', 'sr_length',
           'sr_count', 'start', 'secret_strength_main')


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    folder = tmp_path_factory.mktemp('secret-owned-strength')
    asm, binary = folder/'probe.asm', folder/'probe.bin'
    asm.write_text('%include "ccparty.asm"\ndw '+','.join(EXPORTS)+'\ncomb times 38 db 0\n', encoding='ascii')
    nasm = shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    run = subprocess.run([nasm, '-I', str(ROOT/'native/src')+'/', '-f', 'bin', str(asm),
                          '-o', str(binary)], capture_output=True, text=True, timeout=30)
    assert run.returncode == 0, run.stdout+run.stderr
    data = binary.read_bytes()
    values = struct.unpack('<'+'H'*len(EXPORTS), data[-38-2*len(EXPORTS):-38])
    return data, dict(zip(EXPORTS, values))


class Machine(FileMachine):
    def interrupt(self, uc, number, unused):
        ax = uc.reg_read(x86.UC_X86_REG_AX)
        if number == 0x21 and ax >> 8 == 0x3E and getattr(self, 'output_close_fault', False):
            handle = uc.reg_read(x86.UC_X86_REG_BX)
            if self.handles[handle][0].endswith('.GSM'):
                self.fault = 'close'
        if number == 0x21 and ax >> 8 == 0x4C:
            self.exit_code = ax & 255
            uc.reg_write(x86.UC_X86_REG_IP, 0xFF00)
            uc.emu_stop()
            return
        if number == 0x21 and (ax in (0x6000, 0x5B00) or ax >> 8 in (0x48, 0x4A)):
            carry = False
            if ax == 0x6000:
                address = (uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_SI)
                path = self.path(address)
                path = ntpath.normpath(path if ntpath.isabs(path) else 'C:\\'+path)
                target = (uc.reg_read(x86.UC_X86_REG_ES)<<4)+uc.reg_read(x86.UC_X86_REG_DI)
                if self.fault == 'truename':
                    carry, ax = True, 3
                else:
                    uc.mem_write(target, path.encode()+b'\0')
            elif ax == 0x5B00:
                address = (uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX)
                path = self.path(address)
                self.events.append({'ax': ax, 'path': path})
                if path in self.files or self.fault == 'create':
                    ax, carry = 5, True
                else:
                    self.files[path] = bytearray()
                    ax = self.open_other(path)
            elif ax >> 8 == 0x48:
                ax = 0x3000
            uc.reg_write(x86.UC_X86_REG_AX, ax)
            flags = uc.reg_read(x86.UC_X86_REG_EFLAGS)
            uc.reg_write(x86.UC_X86_REG_EFLAGS, flags|1 if carry else flags&~1)
            return
        return super().interrupt(uc, number, unused)


def parse(m, tail):
    data = tail.encode()
    m.uc.mem_write(BASE+0x80, bytes([len(data)])+data+b'\r')
    m.call('parse_output')


@pytest.fixture(scope='module')
def roster(inputs):
    retail, files = inputs
    heroes = tuple(Hero(i, files[f'CHRDATA{i}.SAV'], files.get(f'CHRDATA{i}.STF', b''),
                        files.get(f'CHRDATA{i}.SFX', b'')) for i in range(1, 7))
    return Roster(heroes, retail.definitions)


def expected(roster):
    return tuple(normal_player_body(player_stats(h.body, stf_items(h.stf), roster.catalogue))
                 for h in roster.heroes)


@pytest.mark.parametrize('count', [1, 3, 6])
@pytest.mark.parametrize('hp', [0, 1, None])
def test_query_matches_normal_portable_and_original_handler(image, roster, inputs, count, hp):
    heroes = roster.heroes[:count]
    if hp is not None:
        heroes = tuple(replace(h, body=h.body[:437]+bytes([hp])+h.body[438:]) for h in heroes)
    owned = replace(roster, heroes=heroes)
    data = encode(owned)
    m = Machine(image, {'C:\\PARTY.GBP': data})
    parse(m, '/V C:\\PARTY.GBP C:\\PARTY.GKW\\STAT.GSM')
    assert m.get('sq_mode', 1) == b'\1'
    assert not m.call('sq_query')
    bodies = expected(owned)
    value = party_strength(bodies)
    assert StrengthOracle(inputs[0]).run(bodies).value == value
    assert bytes(m.files['C:\\PARTY.GKW\\STAT.GSM']) == struct.pack('<4s6H', b'GBSM', 1, 16, value, count, len(data), 0)
    assert m.files['C:\\PARTY.GBP'] == data
    assert not m.handles
    assert set(m.files) == {'C:\\PARTY.GBP', 'C:\\PARTY.GKW\\STAT.GSM'}


@pytest.mark.parametrize('tail', ['/V', '/Vx A.GBP B.GSM', '/V A.GBP', '/V A.GBP B.GSM EXTRA',
                                 '/V A.GBP B.GSM /S', '/V /S B.GSM'])
def test_query_parser_rejects_before_any_io(image, tail):
    m = Machine(image, {})
    parse(m, tail)
    assert m.get('sq_mode', 1) == b'\1'
    assert m.get('sq_bad', 1) == b'\1'
    assert m.call('sq_query')
    assert not m.files and not m.events


@pytest.mark.parametrize('case', ['missing', 'malformed', 'foreign', 'bad-hp', 'bad-level',
                                 'GSJ', 'GSB', 'GSC', 'same-stem', 'wrong-extension',
                                 'same-input', 'existing-reply', 'truename'])
def test_admission_rejection_preserves_owned_input_and_existing_answer(image, roster, case):
    data = bytearray(encode(roster))
    reply = 'C:\\STAT.GSM'
    if case == 'malformed': data[-1:] = b''
    if case == 'foreign': struct.pack_into('<H', data, 12, 3)
    if case == 'bad-hp': data[17+437] = 255
    if case == 'bad-level': data[17+273] = 19
    files = {'C:\\PARTY.GBP': data}
    if case == 'missing': del files['C:\\PARTY.GBP']
    if case in ('GSJ', 'GSB', 'GSC'): files['C:\\PARTY.'+case] = b'pending state'
    if case == 'same-stem': reply = 'C:\\PARTY.GSM'
    if case == 'same-input': reply = 'C:\\PARTY.GBP'
    if case == 'wrong-extension': reply = 'C:\\STAT.GSK'
    if case == 'existing-reply': files[reply] = b'acknowledged sentinel'
    before = {name: bytes(body) for name, body in files.items()}
    m = Machine(image, files)
    if case == 'truename': m.fault = 'truename'
    parse(m, '/V C:\\PARTY.GBP '+reply)
    assert m.call('sq_query')
    assert m.files == before
    assert not any(e['ax'] == 0x5B00 for e in m.events) or case == 'existing-reply'


@pytest.mark.parametrize('fault', ['read', 'short-read', 'seek', 'close', 'create', 'write', 'short-write'])
def test_io_fault_reports_failure_and_preserves_input(image, roster, fault):
    data = encode(roster)
    m = Machine(image, {'C:\\PARTY.GBP': data})
    parse(m, '/V C:\\PARTY.GBP C:\\STAT.GSM')
    m.fault = fault
    assert m.call('sq_query')
    assert m.files['C:\\PARTY.GBP'] == data


def test_actual_cli_entry_returns_success_with_owned_reply(image, roster):
    data = encode(roster)
    m = Machine(image, {'C:\\PARTY.GBP': data})
    tail = b'/V C:\\PARTY.GBP C:\\STAT.GSM'
    m.uc.mem_write(BASE+0x80, bytes([len(tail)])+tail+b'\r')
    m.call('start')
    assert m.exit_code == 0
    assert struct.unpack_from('<H', m.files['C:\\STAT.GSM'], 8)[0] == party_strength(expected(roster))
    assert m.files['C:\\PARTY.GBP'] == data


def test_reply_close_failure_is_not_reported_as_success(image, roster):
    data = encode(roster)
    m = Machine(image, {'C:\\PARTY.GBP': data})
    parse(m, '/V C:\\PARTY.GBP C:\\STAT.GSM')
    m.output_close_fault = True
    assert m.call('sq_query')
    assert len(m.files['C:\\STAT.GSM']) == 16
    assert m.files['C:\\PARTY.GBP'] == data


@pytest.mark.parametrize('reply,rejected', [('party.gsm', True), ('C:\\SUB\\..\\PARTY.GSM', True),
                                         ('C:\\PARTY.GKW\\STAT.GSM', False)])
def test_truename_admission_checks_canonical_paths(image, roster, reply, rejected):
    data = encode(roster)
    m = Machine(image, {'C:\\PARTY.GBP': data})
    parse(m, '/V party.gbp '+reply)
    assert m.call('sq_query') == rejected
    assert m.files['C:\\PARTY.GBP'] == data
    if rejected:
        assert set(m.files) == {'C:\\PARTY.GBP'}
