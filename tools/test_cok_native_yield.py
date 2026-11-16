"""Checked DOS inventory yield and combined-candidate bridge fixtures."""
from pathlib import Path
import json
import shutil
import struct
import subprocess

import pytest

from tools.cok_native_yield import (
    checked_continuation_commands, prepare_resume_rejections, require_continuation_passes,
)
from tools.cok_mutation_packet import checksum

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT/'native/cokyield-test.ps1'


def walk_continuation_batch(commands, return_codes):
    """Follow the generated batch's GOTO/errorlevel edges without launching DOS."""
    labels = {line[1:]: index for index, line in enumerate(commands) if line.startswith(':')}
    assert len(labels) == sum(line.startswith(':') for line in commands)
    assert all(len(label) <= 8 for label in labels)
    pc, errorlevel = 0, 0
    invoked, logs = [], {}
    for _ in range(1000):
        if pc == len(commands):
            return invoked, logs
        line = commands[pc]
        pc += 1
        if line.startswith(':') or line.startswith('cd '):
            continue
        if line.startswith('if errorlevel 1 goto '):
            if errorlevel >= 1:
                pc = labels[line.split()[-1]]
        elif line.startswith('goto '):
            pc = labels[line.split()[-1]]
        elif line.startswith('echo '):
            status, filename = line[5:].split('>>')
            logs.setdefault(filename, []).append(status)
        else:
            assert line in return_codes, line
            invoked.append(line)
            errorlevel = return_codes[line]
    pytest.fail('Generated continuation batch did not terminate')


@pytest.mark.parametrize('suffix', ['', '2'])
@pytest.mark.parametrize('codes,stages,statuses', [
    ((0, 0, 0), ('CHECK', 'ACTIVE', 'RESUME'), ('PASS', 'PASS', 'PASS')),
    ((1, 0, 0), ('CHECK',), ('FAIL', 'SKIP', 'SKIP')),
    ((0, 2, 0), ('CHECK', 'ACTIVE'), ('PASS', 'FAIL', 'SKIP')),
    ((0, 0, 1), ('CHECK', 'ACTIVE', 'RESUME'), ('PASS', 'PASS', 'FAIL')),
])
def test_continuation_batch_stops_at_failed_prerequisite_and_runs_next_case(suffix, codes, stages, statuses):
    names = ['C0000', 'C0001']
    commands, returns = [], {}
    for name, results in zip(names, (codes, (0, 0, 0))):
        calls = [f'{stage}-{name}' for stage in ('CHECK', 'ACTIVE', 'RESUME')]
        commands += checked_continuation_commands(name, *calls, log_suffix=suffix)
        returns.update(zip(calls, results))
    invoked, logs = walk_continuation_batch(commands, returns)
    assert invoked == [f'{stage}-C0000' for stage in stages] + [
        f'{stage}-C0001' for stage in ('CHECK', 'ACTIVE', 'RESUME')]
    assert logs == {f'C:\\{stage}{suffix}.LOG': [status, 'PASS']
                    for stage, status in zip(('CHECK', 'ACTIVE', 'RESUME'), statuses)}


def test_continuation_status_failure_identifies_case(tmp_path):
    (tmp_path/'CHECK.LOG').write_text('PASS\nFAIL\n')
    with pytest.raises(AssertionError, match="C0001.*FAIL"):
        require_continuation_passes(tmp_path, ['C0000', 'C0001'])


def test_continuation_status_rejects_missing_rows(tmp_path):
    (tmp_path/'CHECK2.LOG').write_text('PASS\n')
    with pytest.raises(AssertionError, match='CHECK2.LOG'):
        require_continuation_passes(tmp_path, ['C0000', 'C0001'], log_suffix='2')


@pytest.mark.parametrize('chunk_size,accepted', [(1024, True), (1280, True), (1281, False)])
def test_resume_scratch_assembly_guard(tmp_path, chunk_size, accepted):
    nasm = shutil.which('nasm')
    if not nasm:
        fallback = Path.home()/'AppData/Local/bin/NASM/nasm.exe'
        if not fallback.is_file():
            pytest.skip('NASM unavailable')
        nasm = str(fallback)
    src = ROOT/'native/src'
    shutil.copy2(src/'ccecl.asm', tmp_path/'ccecl.asm')
    resume = (src/'cokresume.inc').read_text(encoding='utf-8')
    assert resume.count('IR_IO_CHUNK equ 1024') == 1
    (tmp_path/'cokresume.inc').write_text(
        resume.replace('IR_IO_CHUNK equ 1024', f'IR_IO_CHUNK equ {chunk_size}'), encoding='utf-8')
    result = subprocess.run(
        [nasm, '-f', 'bin', '-I', str(tmp_path)+'/', '-I', str(src)+'/',
         str(tmp_path/'ccecl.asm'), '-o', str(tmp_path/'ccecl.com')],
        cwd=tmp_path, capture_output=True, text=True, timeout=30)
    if accepted:
        assert result.returncode == 0, result.stderr
    else:
        assert result.returncode != 0
        assert 'inventory continuation scratch exceeds the temporary script queue' in result.stderr


@pytest.mark.parametrize('unused_return', [0, 21, 22, 30, 35, 36, 65535])
def test_resume_stack_rejections_do_not_depend_on_unused_frame(tmp_path, unused_return):
    source = tmp_path/'C0039'
    source.mkdir()
    # Only fixture construction is under test here. The native gate below
    # exercises these mutations on a genuine generated GBMR packet.
    packet = bytearray([0xA5])*13288
    struct.pack_into('<H', packet, 12, 25)
    struct.pack_into('<HH', packet, 178, 0, unused_return)
    inputs = {'CODE.BIN': bytes(35), 'PARTY.GBP': bytes(2476),
              'SEED.BIN': bytes(3160), 'ACT.GBP': bytes(2476),
              'ACT.BIN': bytes(3160), 'RES.BIN': packet}
    for name, data in inputs.items():
        (source/name).write_bytes(data)
    (tmp_path/'active-wanted.json').write_text(json.dumps({
        'C0039': {name: inputs[name].hex() for name in ('ACT.GBP', 'ACT.BIN')},
    }))
    commands = []
    prepare_resume_rejections(tmp_path, commands)
    for name, depth, return_pc in [('R0015', 33, unused_return),
                                   ('R0030', 1, 21), ('R0031', 1, 36)]:
        raw = (tmp_path/name/'RES.BIN').read_bytes()
        assert struct.unpack_from('<HH', raw, 178) == (depth, return_pc)
        assert struct.unpack_from('<I', raw, 28)[0] == checksum(raw)
    assert (source/'RES.BIN').read_bytes() == packet
    assert len(json.loads((tmp_path/'reject-inputs.json').read_text())) == 32


def test_checked_inventory_yield_under_dosbox():
    # Asserted, not skipped: the script is repo content, not an external
    # prerequisite, so a deleted or renamed script must be RED on every
    # machine instead of skipping green where DOSBox is absent.
    assert SCRIPT.exists(), f'{SCRIPT} is missing -- this gate cannot skip that away'
    # The subprocess call below spells the path as a LITERAL so
    # tools/test_native_gate_coverage.py's AST scan can attribute this gate to a
    # script; this equality stops that literal and SCRIPT drifting apart.
    assert SCRIPT == ROOT/'native/cokyield-test.ps1'
    if not (ROOT/'The Dark Queen of Krynn/DOSBOX/DOSBox.exe').exists():
        pytest.skip('held DOSBox unavailable')
    if not shutil.which('pwsh'):
        pytest.skip('PowerShell unavailable')
    result = subprocess.run(['pwsh', '-NoProfile', '-File', str(ROOT/'native/cokyield-test.ps1')],
                            cwd=ROOT, capture_output=True, text=True, timeout=300)
    assert result.returncode == 0, result.stdout+result.stderr
    assert 'PASS: 316 DOS checked inventory yields' in result.stdout
    assert 'PASS: 75 DOS native request construction controls' in result.stdout
    assert 'PASS: 35 DOS yield-to-mutation candidates' in result.stdout
    assert 'PASS: 35 DOS checked mutation continuations' in result.stdout
    assert 'PASS: 32 DOS mutation continuation rejections' in result.stdout
    assert 'PASS: 1 DOS consecutive mutation round trips' in result.stdout
    assert 'PASS: 39 DOS combined activation controls' in result.stdout
