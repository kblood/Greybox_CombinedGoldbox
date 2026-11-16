"""Actual compiled cold READY -> CCBIND across independent DOS drive CWDs."""
from pathlib import Path
import struct,subprocess,shutil
import pytest
from tools.test_secret_v16_transport import images,Machine
from tools.test_secret_continuation import prepared,inputs
from tools.secret_continuation import encode_context,Context
from tools.test_secret_continuation_io import BASE,x86

@pytest.fixture(scope='module')
def bind_image(tmp_path_factory):
    folder=tmp_path_factory.mktemp('cold-real-ccbind');asm,binary=folder/'p.asm',folder/'p.bin'
    names=('start','source','effect')
    asm.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(names)+'\n%include "ccbind.asm"\n')
    root=Path(__file__).resolve().parents[1]
    nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    run=subprocess.run([nasm,'-I',str(root/'native/src')+'/', '-f','bin',str(asm),'-o',str(binary)],capture_output=True,text=True)
    assert run.returncode==0,run.stderr
    data=binary.read_bytes();return data,dict(zip(names,struct.unpack_from('<3H',data)))

class BindChild(Machine):
    def interrupt(self,uc,num,arg):
        ax=uc.reg_read(x86.UC_X86_REG_AX)
        if ax >> 8 == 0x4c:self.exit_code=ax&255;uc.emu_stop();return
        if ax >> 8 == 9:return
        return super().interrupt(uc,num,arg)
    def run(self,tail):
        raw=tail.encode();self.uc.mem_write(BASE+0x80,bytes([len(raw)])+raw+b'\r')
        for reg,value in {'CS':BASE>>4,'DS':BASE>>4,'ES':BASE>>4,'SS':0x3000,'SP':0xff00,'EFLAGS':2}.items():self.uc.reg_write(getattr(x86,'UC_X86_REG_'+reg),value)
        self.uc.emu_start(BASE+self.labels['start'],BASE+65535,count=8000000)
        return self.exit_code

class ColdBoot(Machine):
    def interrupt(self,uc,num,arg):
        ax=uc.reg_read(x86.UC_X86_REG_AX)
        if ax==0x4b00:
            raw=self.get('tail',129);tail=raw[1:1+raw[0]].decode();self.children.append(tail)
            child=BindChild(self.bind_binary,{k:bytes(v) for k,v in self.files.items()})
            child.current_drive=self.current_drive;child.cwd_by_drive=dict(self.cwd_by_drive)
            self.child_exit=child.run(tail)
            self.child_source=child.path(BASE+child.labels['source'])
            self.child_effect=child.path(BASE+child.labels['effect'])
            self.files={k:bytearray(v) for k,v in child.files.items()}
            uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1);return
        return super().interrupt(uc,num,arg)

@pytest.mark.parametrize('capture',[False,True])
@pytest.mark.parametrize('mode',['write','verify'])
def test_actual_cold_initial_ready_keeps_other_drive_source_absolute(images,bind_image,prepared,capture,mode):
    def padded(path):return path.encode()+bytes(112-len(path))
    source,effect,seed='D:\\DISK2\\ECL.GLB','C:\\_GBECL.BIN','C:\\_GBSEED.BIN'
    if capture:
        base=Path('C:/temp/GoldBox-task244-20261010/integrated/initial-area49-cold-observe')
        if not (base/'C/_GBNEXT.BIN').is_file():pytest.skip('external preserved actual INITIAL snapshot absent')
        ready=(base/'C/_GBNEXT.BIN').read_bytes();archive=(base/'D/DISK2/ECL.GLB').read_bytes()
        fx=(base/'C/_GBECL.BIN').read_bytes();identity=(base/'C/_GBECL.IDN').read_bytes()
    else:
        ready=struct.pack('<4s10H',b'GBNR',3,24,49,6,1,1,4,0,0,0)+padded(source)+padded(effect)+padded(seed)+encode_context(Context(),True)
        archive=prepared.part('identity')[16:];identity=prepared.part('identity');fx=prepared.part('paused')
    files={'C:\\READY.BIN':ready,source:archive,effect:fx,'C:\\_GBECL.IDN':identity}
    m=ColdBoot(images['boot'],files);m.bind_binary=bind_image
    m.current_drive='D';m.cwd_by_drive={'C':'\\','D':'\\DISK2'}
    m.put('toolprefix',b'C:\\\0');m.put('toolpath_short',b'\1')
    m.put('sn_response_path',b'C:\\READY.BIN\0')
    descriptor=bytearray(1216);descriptor[64:176]=padded(source);descriptor[624:736]=padded(seed)
    m.put('sn_descriptor',bytes(descriptor));m.put('effectpath',effect.encode()+b'\0')
    m.put('eventpath',b'C:\\EVENT.BIN\0');m.put('resumepath',b'C:\\RESUME.BIN\0')
    assert not m.call('sn_read_response')
    original=bytes(m.files[source])
    assert not m.call('bind_effect_source',SI=m.labels['s_bind_write' if mode=='write' else 's_bind_verify'])
    assert m.child_source==source and m.child_effect==effect
    assert 'D:\\DISK2\\ECL.GLB' in m.children[-1] and 'D:DISK2' not in m.children[-1]
    assert 'C:_GBECL.BIN' in m.children[-1]
    assert bytes(m.files[source])==original
    assert not any(key.startswith('D:\\DISK2\\DISK2') for key in m.files)
