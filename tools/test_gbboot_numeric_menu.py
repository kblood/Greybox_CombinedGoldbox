"""Compile GBBOOT's real parser and both consumers of its overloaded /C option."""
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
from tools.test_secret_continuation_write import Machine
from tools.test_secret_continuation_io import BASE

ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ('parse_args', 'build_menu_tail', 'append_ccecl_seed_args',
           'tail_begin', 'tail_finish', 'tail', 'seed_menu', 'seed_menu_valid',
           'menu_answer', 'menu_input_bad', 'seed_input', 'seed_input_valid',
           'combat_cmd', 'combat_cmd_valid', 'effectreadp', 'effectpath', 'outcomepath',
           'sn_capture_context', 'sn_apply_context', 'sn_read_response', 'sn_descriptor',
           'sn_response', 'sn_response_path', 'scx_validate', 'seed_strength',
           'seed_strength_valid', 'seed_parlay', 'seed_parlay_valid', 'seed_encounter',
           'seed_encounter_valid', 'seed_who', 'seed_who_valid', 'interactive_menu',
           'eventpath', 'resumepath')


@pytest.fixture(scope='module')
def boot_image(tmp_path_factory):
    folder = tmp_path_factory.mktemp('gbboot-numeric-menu')
    source, binary = folder/'boot.asm', folder/'boot.bin'
    source.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(EXPORTS)
                      +'\n%include "gbboot.asm"\n', encoding='ascii')
    nasm = shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    run = subprocess.run([nasm, '-I', str(ROOT/'native/src')+'/', '-f', 'bin',
                          str(source), '-o', str(binary)], capture_output=True, text=True)
    assert run.returncode == 0, run.stdout + run.stderr
    data = binary.read_bytes()
    return data, dict(zip(EXPORTS, struct.unpack_from('<'+'H'*len(EXPORTS), data)))


def parse(machine, arguments):
    tail = arguments.encode('ascii')
    assert len(tail) <= 127
    machine.uc.mem_write(BASE+0x80, bytes([len(tail)])+tail+b'\r')
    machine.call('parse_args')


def word(machine, label):
    return struct.unpack('<H', machine.get(label, 2))[0]


def menu_tail(machine):
    machine.put('effectpath', b'C:\\MENU.EFX\0')
    machine.put('effectreadp', struct.pack('<H', machine.labels['effectpath']))
    machine.put('outcomepath', b'C:\\ANSWER.GMO\0')
    machine.call('build_menu_tail')
    data = machine.get('tail', 129)
    return data[1:1+data[0]].decode('ascii')


@pytest.mark.parametrize('value', [0, 255, 256, 1234, 32768, 65535])
@pytest.mark.parametrize('form', [' /! /C{n}', ' /C{n} /!', ' /! /C {n}', ' /C {n} /!'])
def test_full_word_menu_answer_and_legacy_byte_seed_have_separate_transport(boot_image, value, form):
    machine = Machine(boot_image, {})
    parse(machine, form.format(n=value))
    assert machine.get('menu_input_bad', 1) == b'\0'
    assert word(machine, 'menu_answer') == value
    assert word(machine, 'seed_menu') == value & 255
    assert menu_tail(machine).endswith(' /S '+str(value))
    machine.call('tail_begin')
    machine.call('append_ccecl_seed_args')
    machine.call('tail_finish')
    data = machine.get('tail', 129)
    assert data[1:1+data[0]] == (' /C '+str(value & 255)).encode()


@pytest.mark.parametrize('argument', ['65536', '999999999999999999999999',
                                     '1234x', '-1', '+1', '', '/!'])
def test_invalid_numeric_answer_is_never_reinterpreted_as_a_combat_tape(boot_image, argument):
    machine = Machine(boot_image, {})
    parse(machine, ' /! /C '+argument)
    assert machine.get('menu_input_bad', 1) == b'\1'
    assert machine.get('combat_cmd_valid', 1) == b'\0'
    assert not machine.files and not machine.events


@pytest.mark.parametrize('arguments', [' /C65536 /C1', ' /C1 /C1234x'])
def test_invalid_numeric_answer_cannot_be_cleared_by_another_option(boot_image, arguments):
    machine = Machine(boot_image, {})
    parse(machine, arguments)
    assert machine.get('menu_input_bad', 1) == b'\1'


@pytest.mark.parametrize('arguments,expected', [(' /C1234 /C65535', 65535),
                                              (' /C65535 /C0', 0)])
def test_last_valid_numeric_option_updates_both_consumers(boot_image, arguments, expected):
    machine = Machine(boot_image, {})
    parse(machine, arguments)
    assert word(machine, 'menu_answer') == expected
    assert word(machine, 'seed_menu') == expected & 255
    assert menu_tail(machine).endswith(' /S '+str(expected))


@pytest.mark.parametrize('tape', ['G', 'P', 'GG'])
def test_symbolic_combat_command_transport_is_preserved(boot_image, tape):
    machine = Machine(boot_image, {})
    parse(machine, ' /C '+tape)
    assert machine.get('menu_input_bad', 1) == b'\0'
    assert machine.get('combat_cmd_valid', 1) == b'\1'
    assert machine.get('combat_cmd', 32).split(b'\0', 1)[0] == tape.encode()


def test_input_seed_and_current_invocation_reset_remain_independent(boot_image):
    machine = Machine(boot_image, {})
    parse(machine, ' /L65535 /C1234')
    assert word(machine, 'seed_input') == 65535
    assert menu_tail(machine).endswith(' /S 1234')
    parse(machine, ' /C65536')
    parse(machine, ' /!')
    assert word(machine, 'menu_answer') == word(machine, 'seed_menu') == 0
    assert machine.get('menu_input_bad', 1) == b'\0'
    assert ' /S ' not in menu_tail(machine)
