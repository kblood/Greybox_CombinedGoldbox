"""Differential the compact flag routines against the last shipped assembly."""
from pathlib import Path
import shutil
import struct
import subprocess
import zipfile
from io import BytesIO

import pytest
from tools.test_secret_continuation_io import Machine, x86

ROOT = Path(__file__).resolve().parents[1]
NAMES = ('set_cmp_flags','set_bool_flags','cmp_l','cmp_r','flag_eq')


@pytest.fixture(scope='module')
def images(tmp_path_factory):
    folder = tmp_path_factory.mktemp('ccecl-flag-compaction')
    archive = subprocess.run(['git','archive','--format=zip','3cc0782c','native/src'],
                             cwd=ROOT,capture_output=True,check=True)
    with zipfile.ZipFile(BytesIO(archive.stdout)) as old:
        for item in old.infolist():
            (folder/item.filename).resolve().relative_to(folder.resolve())
            assert item.filename.startswith('native/src/') or item.is_dir()
        old.extractall(folder)
    nasm = shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    result=[]
    for tag,source in [('old',folder/'native/src'),('new',ROOT/'native/src')]:
        asm,binary=folder/(tag+'.asm'),folder/(tag+'.bin')
        asm.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(NAMES)+
                       '\n%include "ccecl.asm"\n',encoding='ascii')
        run=subprocess.run([nasm,'-I',str(source)+'/', '-f','bin',str(asm),'-o',str(binary)],
                           capture_output=True,text=True)
        assert run.returncode == 0,run.stdout+run.stderr
        data=binary.read_bytes()
        result.append((data,dict(zip(NAMES,struct.unpack_from('<5H',data)))))
    return result


def run(image,name,left,right):
    m=Machine(image,{})
    m.put('cmp_l',struct.pack('<H',left));m.put('cmp_r',struct.pack('<H',right))
    m.put('flag_eq',b'\xa5'*6)
    m.call(name,AX=left,DX=0xa55a)
    return m.get('flag_eq',6),tuple(m.uc.reg_read(getattr(x86,'UC_X86_REG_'+r))
                                  for r in ('AX','BX','DX','EFLAGS'))


@pytest.mark.parametrize('left',[0,1,255,256,32767,32768,65534,65535])
@pytest.mark.parametrize('right',[0,1,255,256,32767,32768,65534,65535])
def test_signed_comparisons_preserve_flags_registers_and_cpu_status(images,left,right):
    assert run(images[0],'set_cmp_flags',left,right) == run(images[1],'set_cmp_flags',left,right)


@pytest.mark.parametrize('value',[0,1,255,256,32767,32768,65535])
def test_boolean_compaction_preserves_full_word_and_register_results(images,value):
    assert run(images[0],'set_bool_flags',value,0) == run(images[1],'set_bool_flags',value,0)
