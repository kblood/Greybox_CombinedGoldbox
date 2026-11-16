"""Exercise the actual CCPARTY parser and owned catalogue selection."""
from pathlib import Path
import shutil
import struct
import subprocess

import pytest

from tools.test_secret_native_stats import Native, BASE
from tools.test_secret_player_stats import inputs

ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ('parse_output', 'secret_mode', 'title_id_invalid', 'outname',
           'spp_read_catalog', 'spp_catalog', 'comb', 'spp_check_pending')


@pytest.fixture(scope='module')
def image(tmp_path_factory):
    nasm = shutil.which('nasm') or str(Path.home() / 'AppData/Local/bin/NASM/nasm.exe')
    folder = tmp_path_factory.mktemp('secret-party')
    asm, binary = folder / 'probe.asm', folder / 'probe.bin'
    asm.write_text('%include "ccparty.asm"\ndw ' + ','.join(EXPORTS) + '\ncomb times 38 db 0\n', encoding='ascii')
    result = subprocess.run([nasm, '-I', str(ROOT / 'native/src') + '/', '-f', 'bin', str(asm),
                             '-o', str(binary)], capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
    data = binary.read_bytes()
    exports = data[-38-len(EXPORTS)*2:-38]
    return data, dict(zip(EXPORTS, struct.unpack('<' + 'H'*len(EXPORTS), exports)))


@pytest.mark.parametrize('tail,invalid', (('/S C:\\HEROES.GBP', False),
    ('/S /S C:\\HEROES.GBP', True), ('/Sx C:\\HEROES.GBP', True),
    ('/S /ID4 C:\\HEROES.GBP', True), ('/S /ID9 C:\\HEROES.GBP', True)))
def test_actual_party_parser_has_bounded_secret_option_rejection(image, tail, invalid):
    native = Native(image)
    encoded = tail.encode('ascii')
    native.uc.mem_write(BASE+0x80, bytes([len(encoded)]) + encoded + b'\r')
    native.call('parse_output')
    assert native.get('secret_mode', 1) == b'\1'
    assert bool(native.get('title_id_invalid', 1)[0]) == invalid
    assert not native.requests


@pytest.mark.parametrize('mode', ('local', 'disk1', 'malformed', 'absent'))
def test_owned_catalogue_fallback_requires_true_local_absence(image, inputs, mode):
    source, files = inputs
    definitions = source.definitions
    catalogues = {'local': {'ITEMS.DAT': definitions},
                  'disk1': {'..\\DISK1\\ITEMS.DAT': definitions},
                  'malformed': {'ITEMS.DAT': definitions[:-1], '..\\DISK1\\ITEMS.DAT': definitions},
                  'absent': {}}[mode]
    native = Native(image, catalogues)
    assert native.call('spp_read_catalog') == (mode in ('malformed', 'absent'))
    assert native.requests == (['ITEMS.DAT'] if mode in ('local', 'malformed') else
                               ['ITEMS.DAT', '..\\DISK1\\ITEMS.DAT'])
    assert not native.handles
    if mode in ('local', 'disk1'):
        assert native.get('spp_catalog', 2048) == definitions


@pytest.mark.parametrize('pending', (None, 'C:\\HEROES.GSJ', 'C:\\HEROES.GSB', 'C:\\HEROES.GSC'))
def test_standalone_import_cannot_bypass_pending_transaction(image, pending):
    files = {pending: b'pending authority'} if pending else {}
    native = Native(image, files)
    native.put('outname', b'C:\\HEROES.GBP\0')
    assert native.call('spp_check_pending') == (pending is not None)
    assert not native.handles
    assert native.files == files
