"""Compiled CCNEXT public CLI/lifecycle against emulated DOS file IO.
Real native validator, snapshot writer, restore/copy helpers and CCMENU run.
CCHOST/CCFLOW child effects use explicit model contracts; these tests do not
replace the hidden DOS runtime interruption and source-fidelity controls.
"""
from pathlib import Path
import struct,subprocess,shutil
from tools.test_secret_continuation_write import Machine as WriterMachine
from tools.test_secret_continuation_io import x86,BASE
from tools.test_secret_continuation import prepared,inputs,result,effect
from tools.secret_continuation import encode,decode,bind_result,projected_roster,make_receipt,activate,BODY_OFFSET,Context
import pytest
ROOT=Path(__file__).resolve().parents[1]
EXPORTS=('start','kn_parse','kn_prepare','kn_resume','kn_mode','kn_descriptor','kn_expected_roster','kn_expected_source','kn_response','kn_prefix','kn_tail','kc_fh','kc_extent','kc_verified','kn_restore_authorized','kr_header','kr_offsets','kv_paths','kw_stage','kn_ready_response','kn_check_dispatch','kn_peer_fh','kn_work_create','kn_build_producer_tail','kv_context','kr_error','kn_workspace','kn_names_valid','kn_query_names','kn_bad','kv_bad','kw_fail','kn_pair_header','kn_active_pair','kn_initial_pair','kw_header')
@pytest.fixture(scope='module')
def image(tmp_path_factory):
 p=tmp_path_factory.mktemp('ccnext-private'); a=p/'p.asm'; b=p/'p.bin'
 a.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(EXPORTS)+'\n%include "ccnext.asm"\n')
 n=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
 r=subprocess.run([n,'-I',str(ROOT/'native/src')+'/', '-f','bin',str(a),'-o',str(b)],capture_output=True,text=True)
 assert r.returncode==0,r.stdout+r.stderr
 data=b.read_bytes(); return data,dict(zip(EXPORTS,struct.unpack_from('<'+'H'*len(EXPORTS),data)))
class Machine(WriterMachine):
 def __init__(self,image,files,record):
  super().__init__(image,files); self.uc.mem_map(0x60000,0x30000)
  self.record=record; self.directories={'C:\\','D:\\'}; self.cwd='C:\\';self.children=[];self.output=effect(0);self.exitcode=0
 def call(self,name,**kw):

  for reg,value in {'CS':BASE>>4,'DS':BASE>>4,'ES':BASE>>4,'SS':0x5000,'SP':0xFFE0,'EFLAGS':2,'FS':0x6000,'GS':0x8000,**kw}.items():self.uc.reg_write(getattr(x86,'UC_X86_REG_'+reg),value)
  self.uc.mem_write(0x5FFE0,struct.pack('<H',0xFF00));self.uc.emu_start(BASE+self.labels[name],BASE+0xFF00,count=20000000)
  assert self.uc.reg_read(x86.UC_X86_REG_IP)==0xFF00
  return bool(self.uc.reg_read(x86.UC_X86_REG_EFLAGS)&1)
 def interrupt(self,uc,num,arg):
  ax=uc.reg_read(x86.UC_X86_REG_AX); ah=ax>>8
  if ah==0x4A:uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1);return
  if ah==0x48:
   uc.reg_write(x86.UC_X86_REG_AX,0x6000 if uc.reg_read(x86.UC_X86_REG_BX)==4096 else 0x8000);uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1);return
  if ah==0x4C:self.process_exit=ax&255;self.handles.clear();uc.emu_stop();return
  if ah==9:return
  ds=uc.reg_read(x86.UC_X86_REG_DS)<<4;dx=uc.reg_read(x86.UC_X86_REG_DX)
  if ax==0x4300:
   path=self.path(ds+dx);present=path in self.directories or path in self.files
   self.events.append({'ax':ax,'path':path})
   uc.reg_write(x86.UC_X86_REG_AX,0 if present else 3)
   uc.reg_write(x86.UC_X86_REG_CX,16 if path in self.directories else 0)
   flags=uc.reg_read(x86.UC_X86_REG_EFLAGS);uc.reg_write(x86.UC_X86_REG_EFLAGS,flags&~1 if present else flags|1);return
  if ax==0x3D00:
   path=self.path(ds+dx)
   if path not in self.files and path.rsplit('\\',1)[0] not in self.directories and path.rsplit('\\',1)[0]+'\\' not in self.directories:
    self.events.append({'ax':ax,'path':path});uc.reg_write(x86.UC_X86_REG_AX,3)
    uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)|1);return
  if ah in (0x39,0x3B,0x41):
   path=self.path(ds+dx);bad=False
   if ah==0x39:
    bad=path in self.directories
    if not bad:self.directories.add(path)
   elif ah==0x3B:
    bad=path not in self.directories
    if not bad:self.cwd=path
   else:
    bad=path not in self.files
    if not bad:del self.files[path]
   self.events.append({'ax':ax,'path':path});uc.reg_write(x86.UC_X86_REG_AX,2 if bad and ah==0x41 else 5 if bad else 0)
   flags=uc.reg_read(x86.UC_X86_REG_EFLAGS);uc.reg_write(x86.UC_X86_REG_EFLAGS,flags|1 if bad else flags&~1);return
  if ah==0x19:uc.reg_write(x86.UC_X86_REG_AX,2);return
  if ah==0x47:
   target=(uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_SI);uc.mem_write(target,b'\0');uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1);return
  if ah==0x0E:
   uc.reg_write(x86.UC_X86_REG_AX,26);return
  if ax==0x4B00:
   path=self.path(ds+dx);length=self.get('kn_tail',1)[0];tail=self.get('kn_tail',128)[1:1+length].decode();self.children.append((path,tail))
   if path.endswith('CCPARTY.COM'):
    option,roster,reply=tail.split();assert option in ('/V','/W')
    from tools.secret_roster import decode as read_roster
    from tools.secret_player_stats import player_stats,stf_items
    from tools.secret_strength import party_strength,normal_player_body
    r=read_roster(bytes(self.files[roster]))
    value=party_strength(normal_player_body(player_stats(h.body,stf_items(h.stf),r.catalogue)) for h in r.heroes)
    if option=='/V': self.files[reply]=bytearray(struct.pack('<4s6H',b'GBSM',1,16,value,len(r.heroes),len(self.files[roster]),0))
    else:
     from tools.test_secret_who_names import names_packet
     self.files[reply]=bytearray(names_packet(r))
   elif path.endswith('CCHOST.COM'):
    option,request,roster=tail.split();r=self.record;gsc=roster.rsplit('.',1)[0]+'.GSC'
    if option=='/P':
     self.files[gsc]=bytearray(struct.pack('<4s2H',b'GSC1',1,len(r.part('roster')))+r.part('request')+r.part('roster'))
     if r.paths[3] in self.files:del self.files[r.paths[3]]
    else:
     if r.paths[3] in self.files:
      raw=bytes(self.files[r.paths[3]]);bound=bind_result(r,raw[:14]+b'\0\0'+raw[16:],bytes(self.files[r.paths[6]]))
      self.files[roster]=bytearray(projected_roster(bound,bound.part('result')))
      self.files[r.paths[3]]=bytearray(raw[:14]+b'\1\0'+raw[16:])
     self.files.pop(gsc,None)
   else:
    assert path.endswith('CCFLOW.COM'),path
    assert tail.startswith(' SRC.GLB ') and '/G SEED.BIN' in tail and '/ID4' in tail and '/R INPUT.EFX A.OUT /E O.EFX' in tail,tail
    assert bytes(self.files[self.cwd+'\\SRC.GLB']) == self.record.part('identity')[16:]
    self.files[self.cwd+'\\O.EFX']=bytearray(self.output)
   uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1);return
  if ah==0x4D:uc.reg_write(x86.UC_X86_REG_AX,self.exitcode);return
  return super().interrupt(uc,num,arg)
def setup(image,p):
 files={p.paths[0]:p.part('identity')[16:],p.paths[1]:p.part('roster'),p.paths[2]:p.part('request'),p.paths[4]:p.part('paused'),p.paths[5]:p.part('seed'),p.paths[4].rsplit('.',1)[0]+'.IDN':p.part('identity'),'C:\\CCFLOW.COM':b'flow bytes','C:\\CCECL.COM':b'ecl bytes','C:\\DESC.BIN':encode(p)[:24]+bytes(40)+encode(p)[64:BODY_OFFSET]}
 m=Machine(image,files,p)
 for label,path in [('kn_descriptor','C:\\DESC.BIN'),('kn_expected_roster',p.paths[1]),('kn_expected_source',p.paths[0]),('kn_response','C:\\NEXT.BIN'),('kn_prefix','C:\\')]:m.put(label,path.encode()+b'\0')
 return m
def close_source(m):
 fh=struct.unpack('<H',m.get('kc_fh',2))[0]
 if fh!=65535:del m.handles[fh];m.put('kc_fh',b'\xff\xff')
def test_prepare_then_complete_native_lifecycle(image,prepared):
 m=setup(image,prepared)
 assert not m.call('kn_prepare')
 assert decode(bytes(m.files[prepared.paths[8]]))==prepared
 assert len(m.children)==1 and m.children[0][1].startswith(' /P')
 close_source(m)
 m.files[prepared.paths[3]]=bytearray(result(prepared));m.files[prepared.paths[6]]=bytearray(b'party\r\n')
 assert not m.call('kn_resume')
 assert m.uc.reg_read(x86.UC_X86_REG_AX)==2
 bound=bind_result(prepared,result(prepared),b'party\r\n')
 active=activate(bound,effect(0),producer_receipt=make_receipt(bound,effect(0),wrapper_exit=0),settled_result=result(prepared)[:14]+b'\1\0'+result(prepared)[16:],settled_roster=projected_roster(bound,result(prepared)))
 assert bytes(m.files[prepared.paths[8]])==encode(active)
 assert m.files[prepared.paths[7]]==effect(0)
 assert len(m.children)==5
 close_source(m);before=len(m.children)
 assert not m.call('kn_resume');assert len(m.children)==before
 assert m.files[prepared.paths[7]]==effect(0)
def test_missing_result_retries_owned_pause(image,prepared):
 m=setup(image,prepared);assert not m.call('kn_prepare');close_source(m)
 assert not m.call('kn_resume');assert m.uc.reg_read(x86.UC_X86_REG_AX)==2
 assert decode(bytes(m.files[prepared.paths[8]])).phase==0
 assert m.files[prepared.paths[4]]==prepared.part('paused')
 assert len(m.children)==2 and m.children[-1][1].startswith(' /C')
def test_foreign_source_rejected_before_host(image,prepared):
 m=setup(image,prepared);assert not m.call('kn_prepare');close_source(m)
 m.files[prepared.paths[0]][30]^=1
 before=len(m.children);assert m.call('kn_resume');assert len(m.children)==before




from dataclasses import replace

def prepared_machine(image,p):
 m=setup(image,p);assert not m.call('kn_prepare');close_source(m);return m

def completed_record(p):return bind_result(p,result(p),b'party\r\n')
def active_record(p,output=None):
 b=completed_record(p);output=effect(0) if output is None else output
 return activate(b,output,producer_receipt=make_receipt(b,output,wrapper_exit=0),settled_result=result(p)[:14]+b'\1\0'+result(p)[16:],settled_roster=projected_roster(b,result(p)))

@pytest.mark.parametrize('phase',[1,2])
def test_closed_next_phase_stage_recovered_without_reproduction(image,prepared,phase):
 m=prepared_machine(image,prepared);b=completed_record(prepared)
 m.files[prepared.paths[3]]=bytearray(result(prepared));m.files[prepared.paths[6]]=bytearray(b'party\r\n')
 candidate=b
 if phase==2:
  m.files[prepared.paths[8]]=bytearray(encode(b));candidate=active_record(prepared)
  m.files[prepared.paths[3]][14:16]=b'\1\0';m.files[prepared.paths[1]]=bytearray(projected_roster(b,result(prepared)))
  del m.files[prepared.paths[1].rsplit('.',1)[0]+'.GSC']
 m.files['C:\\PARTY.GKT']=bytearray(encode(candidate))
 before=len(m.children);assert not m.call('kn_resume')
 assert decode(bytes(m.files[prepared.paths[8]])).phase==2
 assert len(m.children)-before==(4 if phase==1 else 0)
 assert 'C:\\PARTY.GKT' not in m.files

@pytest.mark.parametrize('has_live',[False,True])
def test_rename_backup_recovery_is_bound_to_forward_phase(image,prepared,has_live):
 m=prepared_machine(image,prepared);b=completed_record(prepared)
 m.files[prepared.paths[3]]=bytearray(result(prepared));m.files[prepared.paths[6]]=bytearray(b'party\r\n')
 m.files['C:\\PARTY.GKB']=m.files.pop(prepared.paths[8])
 if has_live:m.files[prepared.paths[8]]=bytearray(encode(b))
 assert not m.call('kn_resume');assert decode(bytes(m.files[prepared.paths[8]])).phase==2
 assert 'C:\\PARTY.GKB' not in m.files

@pytest.mark.parametrize('kind',['foreign-backup','foreign-candidate','malformed-result','foreign-outcome','foreign-roster'])
def test_foreign_state_is_preserved_before_host_mutation(image,prepared,kind):
 m=prepared_machine(image,prepared);m.files[prepared.paths[3]]=bytearray(result(prepared));m.files[prepared.paths[6]]=bytearray(b'party\r\n')
 if kind=='foreign-backup':m.files['C:\\PARTY.GKB']=bytearray(b'foreign backup')
 elif kind=='foreign-candidate':
  candidate=replace(completed_record(prepared),paths=(prepared.paths[0],'C:\\OTHER.GBP')+prepared.paths[2:8]+('C:\\OTHER.GSK',prepared.paths[9]))
  # Framed foreign record; copied raw foreign paths also mismatch GBHR.
  raw=bytearray(encode(completed_record(prepared)));raw[64+112:64+224]=b'C:\\OTHER.GBP'+bytes(100);m.files['C:\\PARTY.GKT']=raw
 elif kind=='malformed-result':m.files[prepared.paths[3]][4]=9
 elif kind=='foreign-outcome':m.files[prepared.paths[6]]=bytearray(b'enemy\r\n')
 else:m.files[prepared.paths[1]][100]^=1
 before={k:bytes(v) for k,v in m.files.items()};children=len(m.children)
 assert m.call('kn_resume')
 assert len(m.children)==children
 assert bytes(m.files[prepared.paths[1]])==before[prepared.paths[1]]
 for path in ('C:\\PARTY.GKB','C:\\PARTY.GKT'):
  if path in before:assert bytes(m.files[path])==before[path]

@pytest.mark.parametrize('opcode',[0x27,0x28,0x2e,0x36,0x41])
def test_unsupported_active_mutation_keeps_authority_and_does_not_dispatch(image,prepared,opcode):
 m=prepared_machine(image,prepared);b=completed_record(prepared);output=bytearray(effect(0));struct.pack_into('<H',output,2250,1);struct.pack_into('<H',output,2252,opcode)
 a=active_record(prepared,bytes(output));m.files[prepared.paths[8]]=bytearray(encode(a));m.files[prepared.paths[3]]=bytearray(result(prepared)[:14]+b'\1\0'+result(prepared)[16:]);m.files[prepared.paths[1]]=bytearray(projected_roster(b,result(prepared)));del m.files['C:\\PARTY.GSC']
 before=len(m.children);assert m.call('kn_resume');assert len(m.children)==before;assert bytes(m.files[prepared.paths[8]])==encode(a)


def test_partial_stage_is_only_retired_after_positive_framing_failure(image,prepared):
 m=prepared_machine(image,prepared);m.files['C:\\PARTY.GKT']=bytearray(b'GSK3\x03\x00'+bytes(7))
 assert not m.call('kn_resume');assert 'C:\\PARTY.GKT' not in m.files

def test_existing_foreign_workspace_not_adopted(image,prepared):
 m=setup(image,prepared);m.directories.add('C:\\WORK');assert m.call('kn_prepare');assert 'C:\\WORK\\OWNER.BIN' not in m.files
def test_missing_owner_parent_directory_is_created_before_file_probe(image,prepared):
 m=setup(image,prepared)
 assert not m.call('kn_prepare')
 attr=next(i for i,e in enumerate(m.events) if e['ax']==0x4300 and e['path']=='C:\\WORK')
 create=next(i for i,e in enumerate(m.events) if e['ax']>>8==0x39 and e['path']=='C:\\WORK')
 assert attr<create and 'C:\\WORK\\OWNER.BIN' in m.files
def next_prepared(p,output):
 b=completed_record(p);paths=list(p.paths);paths[4],paths[7]=paths[7],paths[4]
 from tools.secret_continuation import path_bytes
 request=struct.pack('<4s3H',b'GBHR',2,4,0)+b''.join(path_bytes(paths[i]) for i in (3,1,4))
 return replace(p,paths=tuple(paths),sections=(request,projected_roster(b,result(p)),output,p.part('seed'),p.part('identity'))+(b'',)*5)
def test_next_encounter_preparation_replaces_active_only_at_exact_successor(image,prepared):
 m=prepared_machine(image,prepared);m.output=effect(3)
 m.files[prepared.paths[3]]=bytearray(result(prepared));m.files[prepared.paths[6]]=bytearray(b'party\r\n')
 assert not m.call('kn_resume');close_source(m)
 p=next_prepared(prepared,effect(3));m.record=p;m.files[p.paths[2]]=bytearray(p.part('request'))
 m.files['C:\\DESC.BIN']=bytearray(encode(p)[:24]+bytes(40)+encode(p)[64:BODY_OFFSET])
 before=len(m.children);assert not m.call('kn_prepare');assert len(m.children)==before+1
 assert bytes(m.files[p.paths[8]])==encode(p);assert p.paths[3] not in m.files

def test_prepared_old_consumed_interval_is_unstarted_not_completed(image,prepared):
 m=prepared_machine(image,prepared);p=next_prepared(prepared,effect(3));a=active_record(prepared,effect(3))
 m.files[prepared.paths[8]]=bytearray(encode(p));m.files['C:\\PARTY.GKB']=bytearray(encode(a));m.files[p.paths[2]]=bytearray(p.part('request'));m.files[p.paths[4]]=bytearray(p.part('paused'));m.files[p.paths[1]]=bytearray(p.part('roster'));m.files[p.paths[3]]=bytearray(result(prepared)[:14]+b'\1\0'+result(prepared)[16:]);del m.files['C:\\PARTY.GSC']
 before=len(m.children);assert not m.call('kn_resume');assert len(m.children)==before
 assert bytes(m.files[p.paths[8]])==encode(p);assert 'C:\\PARTY.GKB' not in m.files

@pytest.mark.parametrize('boundary',['host','producer'])
def test_failed_child_preserves_completed_authority_and_recovers(image,prepared,boundary):
 m=prepared_machine(image,prepared);m.files[prepared.paths[3]]=bytearray(result(prepared));m.files[prepared.paths[6]]=bytearray(b'party\r\n')
 if boundary=='producer':
  b=completed_record(prepared);m.files[prepared.paths[8]]=bytearray(encode(b));m.files[prepared.paths[3]][14:16]=b'\1\0';m.files[prepared.paths[1]]=bytearray(projected_roster(b,result(prepared)));del m.files['C:\\PARTY.GSC']
 m.exitcode=1;assert m.call('kn_resume');assert decode(bytes(m.files[prepared.paths[8]])).phase==1
 close_source(m);m.exitcode=0;assert not m.call('kn_resume');assert decode(bytes(m.files[prepared.paths[8]])).phase==2
@pytest.mark.parametrize('fault',['read','seek'])
def test_transient_io_never_retires_a_closed_valid_candidate(image,prepared,fault):
 def candidate_setup():
  m=prepared_machine(image,prepared);m.files['C:\\PARTY.GKT']=bytearray(encode(completed_record(prepared)));m.files[prepared.paths[3]]=bytearray(result(prepared));m.files[prepared.paths[6]]=bytearray(b'party\r\n');return m
 baseline=candidate_setup();start=len(baseline.events);assert not baseline.call('kn_resume')
 opens=[i for i,e in enumerate(baseline.events) if i>=start and e.get('path')=='C:\\PARTY.GKT' and e['ax']==0x3D00]
 index=opens[1]+(3 if fault=='read' else 1)
 assert baseline.events[index]['ax']>>8==(0x3F if fault=='read' else 0x42)
 m=candidate_setup();body=bytes(m.files['C:\\PARTY.GKT']);old=bytes(m.files[prepared.paths[8]]);children=len(m.children);m.fault_at=index;m.inject_fault=fault
 assert m.call('kn_resume');assert m.fault_at is None
 assert bytes(m.files['C:\\PARTY.GKT'])==body and bytes(m.files[prepared.paths[8]])==old and len(m.children)==children

def test_response_short_write_recovers_active_without_child_replay(image,prepared):
 def completed_setup():
  m=prepared_machine(image,prepared);m.files[prepared.paths[3]]=bytearray(result(prepared));m.files[prepared.paths[6]]=bytearray(b'party\r\n');return m
 baseline=completed_setup();assert not baseline.call('kn_resume')
 indexes=[i for i,e in enumerate(baseline.events) if e['ax']>>8==0x40 and e.get('cx')==392];assert len(indexes)==1
 m=completed_setup();m.fault_at=indexes[0];m.inject_fault='short-write';assert m.call('kn_resume');assert m.fault_at is None
 assert decode(bytes(m.files[prepared.paths[8]])).phase==2
 close_source(m);before=len(m.children);assert not m.call('kn_resume');assert len(m.children)==before;assert len(m.files['C:\\NEXT.BIN'])==392


def public_run(m,image,tail):
 m.uc.mem_write(BASE+0x100,image[0]);m.uc.mem_write(BASE+0x80,bytes([len(tail)])+tail.encode()+b'\r');m.uc.mem_write(BASE+0x2c,struct.pack('<H',0x4000));m.uc.mem_write(0x40000,b'\0\0\1\0C:\\CCNEXT.COM\0');m.process_exit=None
 for reg,value in {'CS':BASE>>4,'DS':BASE>>4,'ES':BASE>>4,'SS':BASE>>4,'SP':0xFFE0,'EFLAGS':2}.items():m.uc.reg_write(getattr(x86,'UC_X86_REG_'+reg),value)
 m.uc.emu_start(BASE+m.labels['start'],BASE+0xFF00,count=20000000)
 assert m.process_exit is not None
 return m.process_exit
@pytest.mark.parametrize('complete_mode',['R','C'])
def test_public_cli_prepare_resume_and_cold_active_no_replay(image,prepared,complete_mode):
 m=setup(image,prepared)
 assert public_run(m,image,' /P C:\\DESC.BIN')==0
 m.files[prepared.paths[3]]=bytearray(result(prepared));m.files[prepared.paths[6]]=bytearray(b'party\r\n')
 assert public_run(m,image,f' /{complete_mode} C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2
 before=len(m.children);assert public_run(m,image,' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2;assert len(m.children)==before;assert m.cwd=='C:\\'

from tools.test_secret_continuation_validate import menu_producer
from tools.test_secret_continuation import menu_effect
from tools.secret_continuation import bind_advance

@pytest.mark.parametrize('opcode',[0x0f,0x10,0x15,0x2b,0x2c])
def test_public_menu_advance_freezes_answer_string_and_never_replays_old_menu(image,prepared,menu_producer,opcode):
 p=replace(prepared,interactive=True);m=prepared_machine(image,p);output=menu_effect(opcode)
 a=active_record(p,output);b=completed_record(p);roster=projected_roster(b,result(p));m.files[p.paths[8]]=bytearray(encode(a));m.files[p.paths[1]]=bytearray(roster);m.files[p.paths[3]]=bytearray(result(p)[:14]+b'\1\0'+result(p)[16:]);del m.files['C:\\PARTY.GSC']
 token,committed=menu_producer(output,text=b'hello' if opcode==0x10 else None)
 m.files[p.paths[7]]=bytearray(committed);m.files[p.paths[6]]=bytearray(token)
 before=len(m.children);assert public_run(m,image,' /M C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2
 assert len(m.children)==before+3 and m.children[-1][0].endswith('CCFLOW.COM')
 completed=bind_advance(a,resume_kind=1,outcome=token,roster=roster,committed_menu=committed)
 expected=activate(completed,effect(0),producer_receipt=make_receipt(completed,effect(0),wrapper_exit=0),settled_result=b'',settled_roster=roster)
 assert bytes(m.files[p.paths[8]])==encode(expected)
 assert p.paths[6] not in m.files
 assert decode(bytes(m.files[p.paths[8]])).part('paused')==committed
 assert public_run(m,image,' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2
 assert len(m.children)==before+3

def test_public_empty_advance_has_no_hp_result_or_host_call(image,prepared):
 m=prepared_machine(image,prepared);output=effect(3);a=active_record(prepared,output);b=completed_record(prepared);roster=projected_roster(b,result(prepared))
 m.files[prepared.paths[8]]=bytearray(encode(a));m.files[prepared.paths[1]]=bytearray(roster);m.files[prepared.paths[3]]=bytearray(result(prepared)[:14]+b'\1\0'+result(prepared)[16:]);del m.files['C:\\PARTY.GSC'];m.files[prepared.paths[7]]=bytearray(output);m.files[prepared.paths[6]]=bytearray(b'victory\r\n')
 before=len(m.children);assert public_run(m,image,' /E C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2
 c=bind_advance(a,resume_kind=2,outcome=b'victory\r\n',roster=roster);expected=activate(c,effect(0),producer_receipt=make_receipt(c,effect(0),wrapper_exit=0),settled_result=b'',settled_roster=roster)
 assert bytes(m.files[prepared.paths[8]])==encode(expected);assert len(m.children)==before+3
 assert public_run(m,image,' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2;assert len(m.children)==before+3

@pytest.mark.parametrize('mode',['M','E'])
def test_public_cursor_modes_true_absence_fallback(image,prepared,mode):
 m=setup(image,prepared);assert public_run(m,image,f' /{mode} C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==0;assert not m.children

@pytest.mark.parametrize('alias',['C:\\PARTY.GSK','C:\\PARTY.GKB','C:\\PARTY.GKT','C:\\PARTY.GKD','C:\\PARTY.GSC','C:\\PARTY.GSD','C:\\PARTY.GSJ','C:\\PARTY.GSB','C:\\PARTY.GSN','C:\\PARTY.GST','C:\\PAUSED.IDN','C:\\NEXT.GBS','C:\\NEXT.GBT','C:\\NEXT.GBP','C:\\NEXT.DOP','C:\\NEXT.GNE','C:\\NEXT.GOE','C:\\SEED.GNB','C:\\SEED.GOB','C:\\NEXT.GNI','C:\\NEXT.GOI','C:\\NEXT.GNG','C:\\NEXT.GOG','C:\\WORK\\OWNER.BIN','C:\\WORK\\INPUT.EFX','C:\\WORK\\INPUT.GNE','C:\\WORK\\INPUT.IDN','C:\\WORK\\INPUT.GOI','C:\\WORK\\SEED.BIN','C:\\WORK\\SEED.GNB','C:\\WORK\\OUTCOME.OUT','C:\\WORK\\OUTCOME.GOO','C:\\WORK\\O.EFX','C:\\WORK\\OUTPUT.GBS','C:\\WORK\\GBR.EFX','C:\\WORK\\CCFLOW.COM','C:\\WORK\\CCECL.COM'])
def test_response_derived_alias_rejected_before_hp_or_restore(image,prepared,alias):
 m=prepared_machine(image,prepared);m.files[prepared.paths[3]]=bytearray(result(prepared));m.files[prepared.paths[6]]=bytearray(b'party\r\n');before={k:bytes(v) for k,v in m.files.items()};children=len(m.children)
 assert public_run(m,image,f' /R C:\\PARTY.GBP D:\\ECL.GLB {alias}')==1
 assert len(m.children)==children
 assert {k:bytes(v) for k,v in m.files.items()}==before
@pytest.mark.parametrize('kind',[1,2])
def test_cursor_completed_stage_recovery_uses_frozen_input_without_hp(image,prepared,menu_producer,kind):
 p=replace(prepared,interactive=True);m=prepared_machine(image,p);output=menu_effect(0x10) if kind==1 else effect(3);a=active_record(p,output);roster=projected_roster(completed_record(p),result(p));token,committed=menu_producer(output,text=b'hello') if kind==1 else (b'victory\r\n',output)
 c=bind_advance(a,resume_kind=kind,outcome=token,roster=roster,committed_menu=committed if kind==1 else None)
 m.files[p.paths[8]]=bytearray(encode(a));m.files['C:\\PARTY.GKT']=bytearray(encode(c));m.files[p.paths[1]]=bytearray(roster);m.files[p.paths[6]]=bytearray(token);m.files[p.paths[7]]=bytearray(committed);del m.files['C:\\PARTY.GSC']
 before=len(m.children);assert public_run(m,image,' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2;assert len(m.children)==before+3
 assert decode(bytes(m.files[p.paths[8]])).resume_kind==kind
 if kind==1:assert p.paths[6] not in m.files

@pytest.mark.parametrize('kind',[1,2])
def test_cursor_advance_does_not_require_retained_old_result(image,prepared,menu_producer,kind):
 p=replace(prepared,interactive=True);m=prepared_machine(image,p);output=menu_effect(0x15) if kind==1 else effect(3);a=active_record(p,output);roster=projected_roster(completed_record(p),result(p));token,committed=menu_producer(output) if kind==1 else (b'victory\r\n',output)
 m.files[p.paths[8]]=bytearray(encode(a));m.files[p.paths[1]]=bytearray(roster);m.files[p.paths[6]]=bytearray(token);m.files[p.paths[7]]=bytearray(committed);del m.files['C:\\PARTY.GSC'];m.files.pop(p.paths[3],None)
 before=len(m.children);assert public_run(m,image,f' /{"M" if kind==1 else "E"} C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2;assert len(m.children)==before+3

@pytest.mark.parametrize('change',['outside-memory','foreign-key','lowercase','stale-token'])
def test_string_advance_rejects_unsanctioned_effect_or_token_without_publication(image,prepared,menu_producer,change):
 p=replace(prepared,interactive=True);m=prepared_machine(image,p);output=menu_effect(0x10);a=active_record(p,output);roster=projected_roster(completed_record(p),result(p));token,committed=menu_producer(output,text=b'hello');committed=bytearray(committed);token=bytearray(token)
 if change=='outside-memory':committed[132]^=1
 elif change=='foreign-key':struct.pack_into('<H',committed,198,0x777)
 elif change=='lowercase':struct.pack_into('<H',committed,1222,ord('h'))
 else:token[10]^=1
 m.files[p.paths[8]]=bytearray(encode(a));m.files[p.paths[1]]=bytearray(roster);m.files[p.paths[6]]=token;m.files[p.paths[7]]=committed;del m.files['C:\\PARTY.GSC'];before=len(m.children)
 assert public_run(m,image,' /M C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==1;assert len(m.children)==before;assert bytes(m.files[p.paths[8]])==encode(a);assert bytes(m.files[p.paths[6]])==bytes(token)

def test_first_prepared_closed_gkt_recovered_before_launch(image,prepared):
 m=prepared_machine(image,prepared);m.files['C:\\PARTY.GKT']=m.files.pop(prepared.paths[8]);del m.files['C:\\PARTY.GSC'];before=len(m.children)
 assert public_run(m,image,' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2
 assert bytes(m.files[prepared.paths[8]])==encode(prepared) and len(m.children)==before

@pytest.mark.parametrize('opcode',[0x10,0x15])
def test_cold_resume_acknowledges_closed_menu_answer_before_old_effect_restore(image,prepared,menu_producer,opcode):
 p=replace(prepared,interactive=True);m=prepared_machine(image,p);output=menu_effect(opcode);a=active_record(p,output);roster=projected_roster(completed_record(p),result(p));token,committed=menu_producer(output,text=b'hello' if opcode==0x10 else None)
 m.files[p.paths[8]]=bytearray(encode(a));m.files[p.paths[1]]=bytearray(roster);m.files[p.paths[6]]=bytearray(token);m.files[p.paths[7]]=bytearray(committed);del m.files['C:\\PARTY.GSC'];m.files.pop(p.paths[3],None)
 before=len(m.children);assert public_run(m,image,' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN')==2
 assert len(m.children)==before+3 and m.children[-1][0].endswith('CCFLOW.COM')
 current=decode(bytes(m.files[p.paths[8]]));assert current.resume_kind==1 and current.part('paused')==committed and current.part('outcome')==token
 assert p.paths[6] not in m.files

@pytest.mark.parametrize('direct_index',list(range(10)))
def test_response_cannot_alias_direct_input_or_authority_before_hp(image,prepared,direct_index):
 m=prepared_machine(image,prepared);m.files[prepared.paths[3]]=bytearray(result(prepared));m.files[prepared.paths[6]]=bytearray(b'party\r\n');before={k:bytes(v) for k,v in m.files.items()};children=len(m.children)
 assert public_run(m,image,f' /R C:\\PARTY.GBP D:\\ECL.GLB {prepared.paths[direct_index]}')==1
 assert len(m.children)==children and {k:bytes(v) for k,v in m.files.items()}==before


@pytest.mark.parametrize('size', [4, 6, 64, None])
def test_unknown_candidate_magic_is_preserved_under_admitted_owner(image, prepared, size):
 m = prepared_machine(image,prepared)
 assert not m.call('kn_workspace')
 close_source(m)
 assert 'C:\\WORK\\OWNER.BIN' in m.files
 raw = bytearray(encode(prepared))
 raw[:4] = b'FRGN'
 if size is not None: raw = raw[:size]
 m.files['C:\\PARTY.GKT'] = raw
 before = {k:bytes(v) for k,v in m.files.items()}
 children = len(m.children)
 assert public_run(m,image,' /R C:\\PARTY.GBP D:\\ECL.GLB C:\\NEXT.BIN') == 1
 assert {k:bytes(v) for k,v in m.files.items()} == before
 assert len(m.children) == children
