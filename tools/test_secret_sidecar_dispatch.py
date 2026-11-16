"""Real compiled GBBOOT -> CCNEXT read-only Secret stream routing, no DOSBox."""
from pathlib import Path
import struct,subprocess,shutil
import pytest
from tools.test_secret_continuation_coordinator import image as next_image,Machine as NextMachine,public_run
from tools.test_secret_continuation import prepared,inputs,effect
from tools.test_secret_continuation_v16 import v16
from tools.test_secret_v16_transport import Machine as BootMachine
from tools.test_secret_cold_bind_route import BindChild
from tools.test_secret_continuation_io import BASE,x86
ROOT=Path(__file__).resolve().parents[1]

@pytest.fixture(scope='module')
def binaries(tmp_path_factory,next_image):
    result={'next':next_image}
    exports={'boot':('apply_sidecar_damage_roster','apply_effect_damage_roster','tail','effectreadp','effectpath','rosterpath','child_host','gamep','game_secret','secret_profile','secret_party','secret_next_ready','eclp','eventpath','toolprefix'), 'host':('start',)}
    nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    for name,labels in exports.items():
        folder=tmp_path_factory.mktemp('sidecar-'+name);asm,binary=folder/'p.asm',folder/'p.bin'
        asm.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(labels)+'\n%include "'+('gbboot.asm' if name=='boot' else 'cchost.asm')+'"\n')
        run=subprocess.run([nasm,'-I',str(ROOT/'native/src')+'/', '-f','bin',str(asm),'-o',str(binary)],capture_output=True,text=True)
        assert run.returncode==0,run.stderr
        data=binary.read_bytes();result[name]=data,dict(zip(labels,struct.unpack_from('<'+'H'*len(labels),data)))
    return result

class Route(BootMachine):
    def interrupt(self,uc,num,arg):
        if uc.reg_read(x86.UC_X86_REG_AX)==0x4b00:
            raw=self.get('tail',129);tail=raw[1:1+raw[0]].decode();self.children.append(tail)
            path=self.path((uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX))
            self.child_path=path
            if path.endswith('CCNEXT.COM'):
                child=NextMachine(self.binaries['next'],{k:bytes(v) for k,v in self.files.items()},None)
                child.directories.update(p.rsplit('\\',1)[0] for p in self.files)
                self.child_exit=public_run(child,self.binaries['next'],tail)
            else:
                assert path.endswith('CCHOST.COM')
                child=BindChild(self.binaries['host'],{k:bytes(v) for k,v in self.files.items()})
                child.current_drive=self.current_drive;child.cwd_by_drive=dict(self.cwd_by_drive)
                self.child_exit=child.run(tail)
            self.child_events=child.events
            assert self.files==child.files
            uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1);return
        return super().interrupt(uc,num,arg)

def route(binaries,files,secret=True,ready=False):
    m=Route(binaries['boot'],files);m.binaries=binaries
    for label,path in [('effectpath','C:\\FX.EFX'),('rosterpath','C:\\PARTY.GBP'),('eventpath','D:\\DISK2\\ECL.GLB'),('child_host','C:\\CCHOST.COM'),('toolprefix','C:\\')]:m.put(label,path.encode()+b'\0')
    for label,target in [('effectreadp','effectpath'),('eclp','eventpath'),('gamep','game_secret')]:m.put(label,struct.pack('<H',m.labels[target]))
    m.put('secret_profile',bytes([secret]));m.put('secret_party',b'\1');m.put('secret_next_ready',bytes([ready]))
    return m

def fixture_files(prepared,stream=False):
    fx=bytearray(v16(effect(0)));struct.pack_into('<H',fx,2250,1);struct.pack_into('<10H',fx,2252,0x11,0,*([0]*8))
    fx[3532:3566]=struct.pack('<H',1)+b'A'+bytes(31)
    files={'C:\\FX.EFX':bytes(fx),'C:\\FX.IDN':prepared.part('identity'),'C:\\PARTY.GBP':prepared.part('roster'),'D:\\DISK2\\ECL.GLB':prepared.part('identity')[16:]}
    if stream:
        struct.pack_into('<H',fx,6,0x100);files['C:\\FX.EFX']=bytes(fx)
        files['C:\\FX.GBS']=struct.pack('<4s2H',b'GBSL',1,1)+bytes(fx[2252:2272])+bytes(fx[3532:3566])
    return files

@pytest.mark.parametrize('stream',[False,True])
@pytest.mark.parametrize('ready',[False,True])
def test_fresh_and_ready_streams_are_readonly(binaries,prepared,stream,ready):
    files=fixture_files(prepared,stream);m=route(binaries,files,ready=ready)
    assert not m.call('apply_sidecar_damage_roster'), (m.children,m.child_exit,m.child_events)
    assert m.child_exit==0 and m.child_path.endswith('CCNEXT.COM')
    assert m.files==files
    assert not [e for e in m.child_events if e['ax']>>8 in (0x3c,0x40,0x41,0x56)]

@pytest.mark.parametrize('stream',[False,True])
@pytest.mark.parametrize('opcode',[0x27,0x28,0x2e,0x36,0x41])
def test_mutations_reject_before_writes(binaries,prepared,stream,opcode):
    files=fixture_files(prepared,stream);fx=bytearray(files['C:\\FX.EFX']);struct.pack_into('<H',fx,2252,opcode);files['C:\\FX.EFX']=bytes(fx)
    if stream:
        data=bytearray(files['C:\\FX.GBS']);struct.pack_into('<H',data,8,opcode);files['C:\\FX.GBS']=bytes(data)
    m=route(binaries,files);assert m.call('apply_sidecar_damage_roster') and m.child_exit==1;assert m.files==files

@pytest.mark.parametrize('fault',['npc','short','extra','identity','source','roster','stream_short','stream_extra','stream_final','stream_missing','stream_stale'])
def test_closed_admission_failures_preserve_all_inputs(binaries,prepared,fault):
    files=fixture_files(prepared,True)
    key='C:\\FX.GBS' if fault.startswith('stream') else 'C:\\FX.EFX'
    if fault=='npc':
        data=bytearray(files[key]);struct.pack_into('<H',data,82,1);files[key]=bytes(data)
    elif fault in ('short','stream_short'):files[key]=files[key][:-1]
    elif fault in ('extra','stream_extra'):files[key]+=b'X'
    elif fault in ('identity','source','roster'):
        key={'identity':'C:\\FX.IDN','source':'D:\\DISK2\\ECL.GLB','roster':'C:\\PARTY.GBP'}[fault];data=bytearray(files[key]);data[0]^=1;files[key]=bytes(data)
    elif fault=='stream_final':data=bytearray(files[key]);data[8]^=1;files[key]=bytes(data)
    elif fault=='stream_missing':del files[key]
    else:
        data=bytearray(files['C:\\FX.EFX']);struct.pack_into('<H',data,6,0);files['C:\\FX.EFX']=bytes(data)
    m=route(binaries,files);assert m.call('apply_sidecar_damage_roster') and m.child_exit==1;assert m.files==files

@pytest.mark.parametrize('ready',[False,True])
def test_authored_seventy_print_terminal_coupled_route(binaries,prepared,ready):
    files=fixture_files(prepared,True)
    fx=bytearray(files['C:\\FX.EFX']);struct.pack_into('<H',fx,2250,64)
    event=fx[2252:2272];text=fx[3532:3566]
    fx[2252:2252+64*20]=event*64;fx[3532:3532+64*34]=text*64
    files['C:\\FX.EFX']=bytes(fx)
    files['C:\\FX.GBS']=struct.pack('<4s2H',b'GBSL',1,70)+bytes(event+text)*70
    m=route(binaries,files,ready=ready);assert not m.call('apply_sidecar_damage_roster');assert m.child_exit==0;assert m.files==files
    old=route(binaries,files,secret=False);assert old.call('apply_sidecar_damage_roster') and old.child_exit==1;assert old.files==files

@pytest.mark.parametrize('offset,value',[(120,1),(120,7),(5944,5),(5940,3),(5942,7),(5782,1),(5930,1)])
def test_profile_count_and_selection_agreement_reject(binaries,prepared,offset,value):
    files=fixture_files(prepared,True);fx=bytearray(files['C:\\FX.EFX']);struct.pack_into('<H',fx,offset,value);files['C:\\FX.EFX']=bytes(fx)
    m=route(binaries,files);assert m.call('apply_sidecar_damage_roster') and m.child_exit==1;assert m.files==files

class FaultNext(NextMachine):
    def interrupt(self,uc,num,arg):
        ax=uc.reg_read(x86.UC_X86_REG_AX);bx=uc.reg_read(x86.UC_X86_REG_BX)
        path=self.path((uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX)) if ax==0x3d00 else self.handles.get(bx,[''])[0]
        self.fault=self.inject if path==self.target else None
        if self.fault:self.triggered=True
        return super().interrupt(uc,num,arg)

@pytest.mark.parametrize('target',['C:\\PARTY.GBP','C:\\FX.EFX','C:\\FX.IDN','D:\\DISK2\\ECL.GLB','C:\\FX.GBS'])
@pytest.mark.parametrize('fault',['access','seek','read','short-read','close'])
def test_readonly_io_faults_reject_without_publication(next_image,prepared,fault,target):
    files=fixture_files(prepared,True);m=FaultNext(next_image,files,None);m.inject=fault;m.target=target;m.triggered=False;m.directories.add('D:\\DISK2')
    assert public_run(m,next_image,' /D C:\\FX.EFX C:\\PARTY.GBP D:\\DISK2\\ECL.GLB')==1
    assert m.triggered and m.files==files and not m.children
    assert not [e for e in m.events if e['ax']>>8 in (0x3c,0x40,0x41,0x56)]

@pytest.mark.parametrize('opcode',[0x27,0x28,0x2e,0x36,0x41])
def test_blocked_early_row_outside_retained_chunk(binaries,prepared,opcode):
    files=fixture_files(prepared,True);fx=bytearray(files['C:\\FX.EFX']);struct.pack_into('<H',fx,2250,64)
    event=fx[2252:2272];text=fx[3532:3566];fx[2252:3532]=event*64;fx[3532:5708]=text*64
    files['C:\\FX.EFX']=bytes(fx)
    stream=bytearray(struct.pack('<4s2H',b'GBSL',1,70)+bytes(event+text)*70);struct.pack_into('<H',stream,8,opcode)
    files['C:\\FX.GBS']=bytes(stream)
    m=route(binaries,files);assert m.call('apply_sidecar_damage_roster') and m.child_exit==1;assert m.files==files

@pytest.mark.parametrize('long_text',[False,True])
def test_pending_who_and_v2_long_print_admission(binaries,prepared,long_text):
    from tools.test_secret_continuation_v16 import who
    from tools.test_secret_continuation import packed_stream,fixed_stream
    files=fixture_files(prepared);fx=bytearray(who(prepared,6));struct.pack_into('<H',fx,6,0x100)
    files['C:\\FX.EFX']=bytes(fx)
    files['C:\\FX.GBS']=packed_stream(fx) if long_text else fixed_stream(fx)
    m=route(binaries,files);assert not m.call('apply_sidecar_damage_roster');assert m.child_exit==0;assert m.files==files
