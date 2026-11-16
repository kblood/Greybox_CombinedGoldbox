"""Compiled v16 transport/boot/dump admission; no DOS process is launched."""
from pathlib import Path
import struct,subprocess,shutil,ntpath
import pytest
from tools.test_secret_continuation_write import Machine as FileMachine
from tools.test_secret_continuation_io import x86,BASE
from tools.test_secret_continuation_v16 import v16,who
from tools.test_secret_continuation import prepared,inputs,effect,menu_effect

ROOT=Path(__file__).resolve().parents[1]
@pytest.fixture(scope='module')
def images(tmp_path_factory):
    exports={
        'flow':('read_effect','write_replay','is_script_full','fxbuf','fxlen','effectpath','replaypath','validate_v16_identity','validate_v16_menu','validate_v15_final_sidecar','side_count','stagepath','orig_tail','run_tail','use_resume_tail'),
        'boot':('read_effect_header','fxbuf','effectreadp','secret_profile','secret_party','seed_count','seed_count_valid','secret_names_refresh','secret_names_valid','secret_names_reply','secret_names_data','rosterpath','toolprefix','child_party','tail','tail_begin','tail_finish','append_ccecl_roster_arg','eclp','parse_args','build_ecl_tail','build_ecl_resume_tail','eclid','effectwritep','effectpath','eventpath','resumepath','outcomepath','seedpath','seed_sidecar_valid','seed_strength_valid','seed_strength','interactive_menu','step_event','step_handler_mode','step_descriptor','step_facing','toolpath_short','seed_input_valid','seed_input','seed_menu_valid','seed_menu','seed_parlay_valid','seed_parlay','seed_encounter_valid','seed_encounter','seed_who_valid','seed_who','secret_source_enter','secret_source_leave','sn_read_response','sn_descriptor','sn_response_path','sn_response','bind_effect_source','s_bind_write','s_bind_verify','toolpath_len'),
        'dump':('read_file','validate_v16_dump','fname','fxbuf','fx_len','fx_physical_lo','fx_physical_hi')}
    result={}
    nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
    for name,labels in exports.items():
        folder=tmp_path_factory.mktemp(name+'-v16')
        asm,binary=folder/'p.asm',folder/'p.bin'
        source={'flow':'ccflow.asm','boot':'gbboot.asm','dump':'ccefx.asm'}[name]
        asm.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(labels)+'\n%include "'+source+'"\n')
        run=subprocess.run([nasm,'-I',str(ROOT/'native/src')+'/', '-f','bin',str(asm),'-o',str(binary)],capture_output=True,text=True)
        assert run.returncode==0,run.stderr
        data=binary.read_bytes();result[name]=(data,dict(zip(labels,struct.unpack_from('<'+'H'*len(labels),data))))
    return result

class Machine(FileMachine):
    def resolve(self,value):
        drive,rest=ntpath.splitdrive(value.upper())
        chosen=drive[:1] if drive else self.current_drive
        base=self.cwd_by_drive[chosen]
        return chosen+':'+ntpath.normpath(rest if rest.startswith('\\') else ntpath.join(base,rest))
    def path(self,address):return self.resolve(super().path(address))
    def interrupt(self,uc,num,arg):
        ax=uc.reg_read(x86.UC_X86_REG_AX)
        if ax==0x6000:
            start=(uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_SI)
            target=(uc.reg_read(x86.UC_X86_REG_ES)<<4)+uc.reg_read(x86.UC_X86_REG_DI)
            uc.mem_write(target,self.path(start).encode()+b'\0')
            uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1);return
        if ax >> 8 == 0x19:
            uc.reg_write(x86.UC_X86_REG_AX,ord(self.current_drive)-65);return
        if ax >> 8 == 0x0e:
            self.current_drive=chr(65+uc.reg_read(x86.UC_X86_REG_DX)%256);return
        if ax >> 8 == 0x47:
            raw=uc.reg_read(x86.UC_X86_REG_DX)%256
            drive=chr(64+raw) if raw else self.current_drive
            target=(uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_SI)
            uc.mem_write(target,self.cwd_by_drive[drive].lstrip('\\').encode()+b'\0')
            uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1);return
        if ax >> 8 == 0x3b:
            path=self.path((uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX))
            if getattr(self,'dir_fail',None)==path:
                uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)|1);return
            self.cwd_by_drive[path[0]]=path[2:]
            uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1);return
        if ax >> 8 == 0x41:
            path=self.path((uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX))
            bad=path not in self.files
            if not bad:del self.files[path]
            uc.reg_write(x86.UC_X86_REG_AX,2 if bad else 0)
            uc.reg_write(x86.UC_X86_REG_EFLAGS,(uc.reg_read(x86.UC_X86_REG_EFLAGS)|1) if bad else (uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1));return
        if ax==0x4b00:
            data=self.get('tail',129);tail=data[1:1+data[0]].decode()
            self.children.append(tail)
            option,source,reply=tail.split();assert option=='/W'
            from tools.secret_roster import decode
            r=decode(bytes(self.files[source]))
            from tools.test_secret_who_names import names_packet
            output=bytearray(names_packet(r))
            if self.change=='missing':return
            if self.change=='short':del output[-1]
            elif self.change=='extra':output+=b'X'
            elif self.change=='name':output[16]^=1
            elif self.change=='padding':output[31]=65
            elif self.change:
                struct.pack_into('<H',output,{'magic':0,'version':4,'length':6,'count':8,'title':10,'extent':12,'reserved':14}[self.change],65535)
            self.files[self.resolve(reply)]=output
            uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1);return
        if ax >> 8 == 0x4d:
            uc.reg_write(x86.UC_X86_REG_AX,self.child_exit);return
        return super().interrupt(uc,num,arg)
    def __init__(self,*a,**kw):
        super().__init__(*a,**kw);self.children=[];self.change=None;self.child_exit=0;self.current_drive='C';self.cwd_by_drive={'C':'\\','D':'\\'}


def reader(images,name,data):
    m=Machine(images[name],{'C:\\FX.EFX':data})
    if name=='boot':
        m.put('effectreadp',struct.pack('<H',m.labels['effectpath']));m.put('effectpath',b'C:\\FX.EFX\0');m.put('secret_profile',b'\1')
    else:m.put('effectpath' if name=='flow' else 'fname',b'C:\\FX.EFX\0')
    return m


@pytest.mark.parametrize('status',[0,1,2,3])
@pytest.mark.parametrize('actor',[0,1,6])
def test_flow_and_boot_accept_v16_status_by_value_not_version(images,prepared,status,actor):
    data=who(prepared,actor) if status==2 else v16(effect(status),actor)
    for name in ('flow','boot'):
        m=reader(images,name,data)
        assert not m.call('read_effect' if name=='flow' else 'read_effect_header')
        assert not m.handles
    m=reader(images,'dump',data)
    assert not m.call('read_file') and not m.call('validate_v16_dump')


@pytest.mark.parametrize('offset,value',[(120,0),(120,1),(120,7),(5782,2),(5784,2),(5924,2),(5930,1),(5932,0),(5936,2),(5938,15),(5940,3),(5942,7),(5944,7),(5946,1)])
def test_v16_identity_malformed_all_readers_fail_closed(images,offset,value):
    data=bytearray(v16(effect(3),1));struct.pack_into('<H',data,offset,value)
    for name in ('flow','boot','dump'):
        m=reader(images,name,bytes(data))
        failed=m.call('read_file') if name=='dump' else m.call('read_effect' if name=='flow' else 'read_effect_header')
        if name=='dump':failed=failed or m.call('validate_v16_dump')
        assert failed and not m.handles


@pytest.mark.parametrize('change',['short','extra','large'])
def test_v16_physical_extent_is_closed(images,change):
    data=v16(effect(0))
    data=data[:-1] if change=='short' else data+(b'X' if change=='extra' else bytes(3000))
    for name in ('flow','boot','dump'):
        m=reader(images,name,data)
        failed=m.call('read_file') if name=='dump' else m.call('read_effect' if name=='flow' else 'read_effect_header')
        if name=='dump':failed=failed or m.call('validate_v16_dump')
        assert failed and not m.handles


def test_capacity_replay_preserves_nullable_actor_and_raw_flags(images):
    data=bytearray(v16(effect(0),6));struct.pack_into('<H',data,8,4);struct.pack_into('<H',data,5724,7)
    m=reader(images,'flow',data);m.put('replaypath',b'C:\\GBR.EFX\0')
    assert not m.call('read_effect') and m.call('is_script_full')
    before=m.get('fxbuf',5948)
    assert not m.call('write_replay')
    expected=bytearray(before);struct.pack_into('<H',expected,120,13)
    assert bytes(m.files['C:\\FX.R'])==expected
    boot=reader(images,'boot',data);assert boot.call('read_effect_header')


def test_diagnostic_count_zero_remains_nullable_without_owned_party(images):
    data=v16(effect(0),0,count=0)
    for name in ('flow','boot'):
        m=reader(images,name,data);assert not m.call('read_effect' if name=='flow' else 'read_effect_header')
    data=v16(effect(0),1,count=0)
    for name in ('flow','boot'):
        m=reader(images,name,data);assert m.call('read_effect' if name=='flow' else 'read_effect_header')


@pytest.mark.parametrize('version',[9,15])
def test_legacy_flow_extents_keep_existing_meaning(images,version):
    data=effect(0) if version==9 else menu_effect(0x15)
    m=reader(images,'flow',data);assert not m.call('read_effect')


def names_machine(images,prepared):
    m=Machine(images['boot'],{'C:\\PARTY.GBP':prepared.part('roster'),'C:\\_GBWHO.GWN':b'stale'})
    for label,path in [('rosterpath','C:\\PARTY.GBP'),('toolprefix','C:\\'),('child_party','C:\\CCPARTY.COM')]:m.put(label,path.encode()+b'\0')
    for label in ('secret_profile','secret_party','seed_count_valid'):m.put(label,b'\1')
    m.put('seed_count',struct.pack('<H',prepared.count))
    return m


@pytest.mark.parametrize('change',['missing','short','extra','magic','version','length','count','title','extent','reserved','name','padding'])
def test_boot_names_query_faults_preserve_p1_and_do_not_grant_capability(images,prepared,change):
    m=names_machine(images,prepared);m.change=change
    old=bytes(m.files['C:\\PARTY.GBP'])
    assert m.call('secret_names_refresh')
    assert m.get('secret_names_valid',1)==b'\0' and bytes(m.files['C:\\PARTY.GBP'])==old
    assert not m.handles


def test_boot_closed_names_query_transport_and_explicit_z_are_independent(images,prepared):
    m=names_machine(images,prepared);m.put('seed_strength_valid',b'\1');m.put('seed_strength',b'\xff\xff')
    assert not m.call('secret_names_refresh') and len(m.children)==1
    assert m.get('secret_names_valid',1)==b'\1'
    m.call('tail_begin');m.call('append_ccecl_roster_arg');m.call('tail_finish')
    raw=m.get('tail',129);tail=raw[1:1+raw[0]].decode()
    assert tail==' /ID4 /B C:\\_GBWHO.GWN'
    assert m.get('seed_strength_valid',1)==b'\1' and m.get('seed_strength',2)==b'\xff\xff'


def test_maximum_secret_frozen_scalar_names_tail_fits_capacity_reserve(images,prepared):
    m=names_machine(images,prepared)
    assert not m.call('secret_names_refresh')
    m.put('eclp',struct.pack('<H',m.labels['effectpath']))
    m.put('effectpath',b'D:\\ECL.GLB\0')
    m.put('eclid',b'\xff\xff')
    m.put('eventpath',b'C:\\_GBEFX.EFX\0')
    m.put('resumepath',b'C:\\_GBRESM.EFX\0')
    m.put('outcomepath',b'C:\\_GBCOMB.OUT\0')
    m.put('effectwritep',struct.pack('<H',m.labels['eventpath']))
    m.put('effectreadp',struct.pack('<H',m.labels['eventpath']))
    m.put('toolpath_short',b'\1')
    m.put('seed_sidecar_valid',b'\1');m.put('seedpath',b'C:\\_GBSEED.BIN\0')
    m.put('interactive_menu',b'\1')
    for option,value in (('strength',65535),('input',65535),('menu',255),('parlay',255),('encounter',255),('who',255)):
        m.put('seed_'+option+'_valid',b'\1');m.put('seed_'+option,struct.pack('<H',value))
    assert not m.call('build_ecl_tail')
    raw=m.get('tail',129);fresh=raw[1:1+raw[0]].decode()
    assert len(fresh)<=114 and len(fresh)+12<=126, fresh
    assert ' /B C:_GBWHO.GWN' in fresh and ' /W255' in fresh and ' /Z65535' in fresh
    # Ordinary owned menu/empty resumes now use the durable INITIAL coordinator;
    # its complete max-context tail is independently compiled in CCNEXT tests.



@pytest.mark.parametrize('foreign',['profile','party-count'])
def test_boot_v16_cannot_cross_profile_or_owned_actor_count(images,foreign):
    m=reader(images,'boot',v16(effect(3),6))
    if foreign=='profile':m.put('secret_profile',b'\0')
    else:
        m.put('secret_party',b'\1');m.put('seed_count_valid',b'\1');m.put('seed_count',b'\3\0')
    assert m.call('read_effect_header') and not m.handles


@pytest.mark.parametrize('fault',['read','short-read','seek','close'])
def test_closed_v16_read_faults_never_admit_state(images,fault):
    for name in ('flow','boot','dump'):
        m=reader(images,name,v16(effect(3),6));m.fault=fault
        failed=m.call('read_file') if name=='dump' else m.call('read_effect' if name=='flow' else 'read_effect_header')
        if name=='dump':failed=failed or m.call('validate_v16_dump')
        assert failed


def test_v16_final_sidecar_must_match_entire_terminal_who_event(images,prepared):
    data=who(prepared,6)
    m=reader(images,'flow',data);assert not m.call('read_effect')
    m.put('side_count',b'\1\0');m.put('stagepath',b'C:\\O.GBT\0')
    m.files['C:\\O.GBT']=bytearray(struct.pack('<4s2H',b'GBSL',1,1)+data[2252:2272]+bytes(34))
    assert not m.call('validate_v15_final_sidecar')
    for at in (8,10,12,26):
        raw=bytearray(m.files['C:\\O.GBT']);raw[at]^=1
        m.files['C:\\O.GBT']=raw
        assert m.call('validate_v15_final_sidecar')
        raw[at]^=1;m.files['C:\\O.GBT']=raw


def test_fresh_held_source_directory_uses_exact_file_and_restores_dos_cwd(images,prepared):
    m=names_machine(images,prepared);assert not m.call('secret_names_refresh')
    m.files['D:\\DISK2\\ECL.GLB']=bytearray(prepared.part('identity')[16:])
    m.put('eclp',struct.pack('<H',m.labels['effectpath']));m.put('effectpath',b'D:\\DISK2\\ECL.GLB\0')
    m.put('eclid',b'\xff\xff');m.put('eventpath',b'C:\\_GBEFX.EFX\0')
    m.put('effectwritep',struct.pack('<H',m.labels['eventpath']))
    m.put('toolpath_short',b'\1');m.put('seed_sidecar_valid',b'\1');m.put('seedpath',b'C:\\_GBSEED.BIN\0')
    m.put('interactive_menu',b'\1')
    for option,value in (('strength',65535),('input',65535),('menu',255),('parlay',255),('encounter',255),('who',255)):
        m.put('seed_'+option+'_valid',b'\1');m.put('seed_'+option,struct.pack('<H',value))
    original_pointer=m.get('eclp',2);original=bytes(m.files['D:\\DISK2\\ECL.GLB'])
    assert not m.call('secret_source_enter')
    assert m.current_drive=='D' and m.cwd_by_drive['D']=='\\DISK2' and m.cwd_by_drive['C']=='\\'
    assert not m.call('build_ecl_tail')
    raw=m.get('tail',129);tail=raw[1:1+raw[0]].decode()
    assert len(tail)==111 and len(tail)+12<=126,tail
    assert m.resolve(tail.split()[0])=='D:\\DISK2\\ECL.GLB'
    for option in ('/G','/B','/E'):
        operand=tail.split()[tail.split().index(option)+1]
        assert m.resolve(operand).startswith('C:\\')
    assert not m.call('secret_source_leave')
    assert m.current_drive=='C' and m.cwd_by_drive['D']=='\\' and m.get('eclp',2)==original_pointer
    assert bytes(m.files['D:\\DISK2\\ECL.GLB'])==original


@pytest.mark.parametrize('protected',['ECL.GLB','C:_GB.R','C:_GBSEED.BIN','C:_GBWHO.GWN'])
def test_host_qualified_capacity_replay_never_aliases_original_argument_paths(images,protected):
    data=bytearray(v16(effect(0),6));struct.pack_into('<H',data,8,4);struct.pack_into('<H',data,5724,7)
    m=reader(images,'flow',data)
    m.put('effectpath',b'C:_GBEFX.EFX\0');m.files['C:\\_GBEFX.EFX']=bytearray(data)
    m.current_drive='D';m.cwd_by_drive['D']='\\DISK2'
    tail=(' ECL.GLB 16 /G '+protected+' /B C:_GBWHO.GWN /E C:_GBEFX.EFX').encode()
    m.put('orig_tail',bytes([len(tail)])+tail+b'\r')
    assert not m.call('read_effect')
    before={k:bytes(v) for k,v in m.files.items()}
    failed=m.call('write_replay')
    if protected=='C:_GB.R':assert failed and {k:bytes(v) for k,v in m.files.items()}==before
    else:
        assert not failed and 'C:\\_GB.R' in m.files
        assert not any(k.startswith('D:') for k in m.files)
        assert not m.call('use_resume_tail')
        raw=m.get('run_tail',129);resumed=raw[1:1+raw[0]].decode()
        assert resumed.endswith(' /R C:_GB.R') and len(resumed)<=126


def test_source_directory_entry_failure_restores_source_pointer_and_drive(images,prepared):
    m=names_machine(images,prepared)
    m.put('eclp',struct.pack('<H',m.labels['effectpath']));m.put('effectpath',b'D:\\DISK2\\ECL.GLB\0')
    before=m.get('eclp',2);m.dir_fail='D:\\DISK2'
    assert m.call('secret_source_enter')
    assert m.get('eclp',2)==before and m.current_drive=='C' and m.cwd_by_drive['D']=='\\'


def test_cold_saved_context_cannot_drop_a_real_physical_result_into_initial_kind(prepared):
    from tools.test_secret_continuation import result
    from tools.secret_continuation import bind_result,encode,decode
    complete=bind_result(prepared,result(prepared),b'party\r\n')
    raw=bytearray(encode(complete));struct.pack_into('<H',raw,20,3)
    with pytest.raises(ValueError):decode(raw)
