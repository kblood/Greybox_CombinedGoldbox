"""Compiled path-length ABI and real CoK combat tail boundaries, no DOSBox."""
from pathlib import Path
import struct,subprocess,shutil
import pytest
from tools.test_secret_v16_transport import Machine
from tools.test_secret_continuation_io import x86
ROOT=Path(__file__).resolve().parents[1]
EXPORTS=('toolpath_len','toolpath_is_root','tail_append_toolpath','tail_begin','tail_finish','build_combat_tail','tail','tailerr','toolprefix','toolpath_short','effectreadp','effectpath','gamep','game_cok','monp','eventpath','combatpath','outcomepath','combatviewpath','combatresultpath','combaticonpath','rosterpath','graphics_image_ready','seed_count_valid','seed_count','step_once','combat_cmd_valid','combat_cmd')
@pytest.fixture(scope='module')
def images(tmp_path_factory):
    source=(ROOT/'native/src/gbboot.asm').read_text()
    begin=source.index('toolpath_is_root:\n');end=source.index('\ntail_append_toolpath:',begin)
    body=source[begin:end]
    # Negative control reintroduces the exact cold-drive regression in private source.
    broken='\n'.join(line for line in body.split('\n') if not line.strip().startswith(('push ax','pop ax')))
    result={};nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    for name,text in [('fixed',source),('broken',source[:begin]+broken+source[end:])]:
        folder=tmp_path_factory.mktemp('toolpath-'+name);asm,binary=folder/'p.asm',folder/'p.bin'
        asm.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(EXPORTS)+'\n'+text)
        run=subprocess.run([nasm,'-I',str(ROOT/'native/src')+'/', '-f','bin',str(asm),'-o',str(binary)],capture_output=True,text=True)
        assert run.returncode==0,run.stderr
        data=binary.read_bytes();result[name]=data,dict(zip(EXPORTS,struct.unpack_from('<'+'H'*len(EXPORTS),data)))
    return result
class Probe(Machine):
    def interrupt(self,uc,num,arg):
        if uc.reg_read(x86.UC_X86_REG_AX)>>8 in (2,9):return
        if uc.reg_read(x86.UC_X86_REG_AX)>>8==0x40 and uc.reg_read(x86.UC_X86_REG_BX)==1:
            uc.reg_write(x86.UC_X86_REG_AX,uc.reg_read(x86.UC_X86_REG_CX));uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1);return
        return super().interrupt(uc,num,arg)
def tail(m):
    data=m.get('tail',129);return data[1:1+data[0]].decode()
@pytest.mark.parametrize('path',['C:\\_GBCP0.GBI','c:\\_GBCP0.GBI','D:\\DISK2\\ECL.GLB','MON1CHA.DAX','C:\\'])
@pytest.mark.parametrize('short',[False,True])
def test_length_matches_emission_and_helper_preserves_ax(images,path,short):
    m=Probe(images['fixed'],{});m.put('toolprefix',b'C:\\\0');m.put('toolpath_short',bytes([short]));m.put('effectpath',path.encode()+b'\0')
    eligible=short and len(path)>3 and path[:3].upper()=='C:\\'
    assert m.call('toolpath_is_root',SI=m.labels['effectpath'],AX=0xbeef)==(not eligible)
    assert m.uc.reg_read(x86.UC_X86_REG_AX)==0xbeef
    m.call('toolpath_len',SI=m.labels['effectpath']);size=m.uc.reg_read(x86.UC_X86_REG_AX)
    m.call('tail_begin');m.call('tail_append_toolpath',SI=m.labels['effectpath']);m.call('tail_finish')
    expected=path[:2]+path[3:] if eligible else path
    assert size==len(expected)==len(tail(m)) and tail(m)==expected
    assert m.resolve(tail(m))==m.resolve(path)
@pytest.mark.parametrize('command',[False,True])
def test_cok_icon_tail_preserves_true_capacity_boundary(images,command):
    emitted={}
    for name in ('fixed','broken'):
        m=Probe(images[name],{});m.put('toolprefix',b'C:\\\0');m.put('toolpath_short',b'\1')
        for label,path in [('effectpath','C:\\_GBECL.BIN'),('eventpath','MON1CHA.DAX'),('combatpath','C:\\_GBCOMB.TRC'),('outcomepath','C:\\_GBCOMB.OUT'),('combatviewpath','C:\\_GBCOMB.RAW'),('combatresultpath','C:\\_GBCR.BIN'),('combaticonpath','C:\\_GBCP0.GBI'),('rosterpath','C:\\_GBPARTY.GBP')]:m.put(label,path.encode()+b'\0')
        for label,target in [('effectreadp','effectpath'),('monp','eventpath'),('gamep','game_cok')]:m.put(label,struct.pack('<H',m.labels[target]))
        for label in ('graphics_image_ready','seed_count_valid','step_once'):m.put(label,b'\1')
        m.put('seed_count',struct.pack('<H',3));m.put('combat_cmd_valid',bytes([command]));m.put('combat_cmd',b'G\0')
        m.call('build_combat_tail');emitted[name]=tail(m);assert m.get('tailerr',1)==b'\0'
    assert len(emitted['fixed'])==(114 if command else 125)
    assert (' /I C:_GBCP0.GBI' in emitted['fixed'])==(not command)
    assert ' /I ' not in emitted['broken']
    assert len(emitted['broken'])==(114 if command else 109)
    assert emitted['fixed'].endswith(' /P C:\\_GBPARTY.GBP /J')
