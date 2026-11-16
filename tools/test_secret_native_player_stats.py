"""Run the native player setup kernel against the source-verified projection."""
from pathlib import Path
import shutil
import struct
import subprocess
import pytest

from tools.test_secret_native_stats import Native, BASE, AUX
from tools.test_secret_player_stats import inputs
from tools.secret_player_stats import player_stats, stf_items

ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ('sp_calculate', 'sp_body', 'ss_body', 'source', 'catalog', 'cs_slots', 'comb')


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    nasm = shutil.which('nasm') or str(Path.home() / 'AppData/Local/bin/NASM/nasm.exe')
    folder = tmp_path_factory.mktemp('secret-native-player')
    asm, binary = folder / 'probe.asm', folder / 'probe.bin'
    asm.write_text('cpu 386\nbits 16\norg 100h\ndw ' + ','.join(EXPORTS) + '''
%include "secretstats.inc"
%include "secretplayerstats.inc"
source times 440 db 0
catalog times 2048 db 0
comb times 38 db 0
''', encoding='ascii')
    result = subprocess.run([nasm, '-I', str(ROOT / 'native/src') + '/', '-f', 'bin', str(asm),
                             '-o', str(binary)], capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
    data = binary.read_bytes()
    return data, dict(zip(EXPORTS, struct.unpack_from('<' + 'H' * len(EXPORTS), data)))


def check(image, inputs, hero, *, raw=None, stf=b''):
    retail, files = inputs
    raw = files[f'CHRDATA{hero}.SAV'] if raw is None else raw
    expected = player_stats(raw, stf_items(stf), retail.definitions)
    machine = Native(image)
    machine.put('source', raw + b'\0')
    machine.put('catalog', retail.definitions)
    if stf:
        machine.uc.mem_write(AUX + 0x100, stf)
    assert not machine.call('sp_calculate', si=machine.labels['source'],
                            di=machine.labels['catalog'], bx=0x100, cx=len(stf))
    staged = machine.get('sp_body', 440)
    normal = machine.get('ss_body', 409)
    assert tuple(staged[index] for index in (106, 238, 289, 304)) == tuple(
        expected.body[index] for index in (106, 238, 289, 304))
    assert (60 - normal[396], 60 - normal[397]) == (expected.normal.thac0, expected.normal.armor_class)
    assert tuple(normal[401:407]) == (expected.normal.primary.count, expected.normal.secondary.count,
                                    expected.normal.primary.sides, expected.normal.secondary.sides,
                                    expected.normal.primary.bonus & 255, expected.normal.secondary.bonus & 255)
    assert machine.get('source', 440) == raw + b'\0'
    if stf:
        assert bytes(machine.uc.mem_read(AUX + 0x100, len(stf))) == stf


@pytest.mark.parametrize('hero', range(1, 7))
@pytest.mark.parametrize('mode', ('bare', 'armor', 'level', 'derived', 'history', 'container'))
def test_native_class_equipment_history_and_owned_container_projection(image, inputs, hero, mode):
    retail, files = inputs
    raw = bytearray(files[f'CHRDATA{hero}.SAV'])
    stf = b''
    if mode == 'armor':
        stf = retail.inventories[72] + bytes(4)
    elif mode == 'level':
        for offset in range(273, 280):
            if raw[offset]:
                raw[offset] += 1
    elif mode == 'derived':
        raw[426:437] = bytes([0xa5]) * 11
    elif mode == 'history':
        raw[273:287] = bytes(14); raw[238] = 0; raw[289] = 2
        raw[107] = 6; raw[278] = 9; raw[239] = 8; raw[282] = 8
        stf = retail.inventories[72] + bytes(4)
    elif mode == 'container':
        child = retail.inventories[72] + bytes(4)
        head = bytearray(child); head[46] = 73; head[52] = 0; head[57] = 2
        stf = bytes(head) + child * 2
    check(image, inputs, hero, raw=bytes(raw), stf=stf)
