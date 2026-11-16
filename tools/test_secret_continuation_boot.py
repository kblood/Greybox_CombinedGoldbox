"""Real GBBOOT empty-outcome producer must interoperate with native CCNEXT."""
from pathlib import Path
import shutil
import struct
import subprocess

import pytest
from tools.test_secret_continuation import prepared, inputs, effect, result
from tools.test_secret_continuation_coordinator import (
    image, prepared_machine, active_record, completed_record, public_run,
)
from tools.test_secret_continuation_write import Machine as ProducerMachine
from tools.secret_continuation import encode, decode, projected_roster

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope='module')
def boot_producer_image(tmp_path_factory):
    folder = tmp_path_factory.mktemp('secret-boot-producer')
    source, binary = folder/'producer.asm', folder/'producer.bin'
    exports = ('write_empty_combat_outcome', 'outcomepath')
    source.write_text('cpu 386\nbits 16\norg 100h\ndw ' + ','.join(exports)
                      + '\n%include "gbboot.asm"\n', encoding='ascii')
    nasm = shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    assembled = subprocess.run(
        [nasm, '-I', str(ROOT/'native/src')+'/', '-f', 'bin', str(source), '-o', str(binary)],
        capture_output=True, text=True, timeout=30,
    )
    assert assembled.returncode == 0, assembled.stdout + assembled.stderr
    data = binary.read_bytes()
    return data, dict(zip(exports, struct.unpack_from('<2H', data)))


def test_actual_empty_boot_outcome_advances_without_an_hp_transaction(
        boot_producer_image, image, prepared):
    producer = ProducerMachine(boot_producer_image, {})
    producer.put('outcomepath', b'C:\\EMPTY.OUT\0')
    assert not producer.call('write_empty_combat_outcome')
    assert not producer.handles
    token = bytes(producer.files['C:\\EMPTY.OUT'])
    assert token == b'victory\r\n'

    machine = prepared_machine(image, prepared)
    empty = effect(3)
    active = active_record(prepared, empty)
    roster = projected_roster(completed_record(prepared), result(prepared))
    machine.files[prepared.paths[8]] = bytearray(encode(active))
    machine.files[prepared.paths[1]] = bytearray(roster)
    machine.files[prepared.paths[7]] = bytearray(empty)
    machine.files[prepared.paths[6]] = bytearray(token)
    del machine.files['C:\\PARTY.GSC']
    previous_children = len(machine.children)

    assert public_run(machine, image,
                      ' /E C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN') == 2
    advanced = decode(bytes(machine.files[prepared.paths[8]]))
    assert advanced.resume_kind == 2 and advanced.part('outcome') == token
    assert advanced.part('result') == b''
    assert bytes(machine.files[prepared.paths[1]]) == roster
    assert len(machine.children) == previous_children + 3
    assert machine.children[-2][0].endswith('CCPARTY.COM')
    assert machine.children[-1][0].endswith('CCFLOW.COM')
