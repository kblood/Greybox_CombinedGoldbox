"""Compiled Secret WHO operand, nullable identity and name capability controls."""
from pathlib import Path
import shutil
import struct
import subprocess
import pytest
from tools.test_secret_continuation_io import Machine

ROOT=Path(__file__).resolve().parents[1]
NAMES=('op_who','set_who_party_selection','vm_start_block','validate_v16_state',
 'validate_who_names','read_roster_file','blk','opp','pc','cur_op','is_gen2',
 'who_names_valid','who_choice_valid','who_choice','party_count','party_names',
 'selected_party','selected_valid','selected_not_found','flag_eq','cmp_l','cmp_r',
 'memcount','fx_script_events','fx_script_count','interactive_menu','menu_textbuf',
 'menu_text_count','menu_pending_dest','menu_pending_count','vmstat','rbuf',
 'rostername','roster_expected_id','rosterhdr','roster_id','hdrlen','halt_reason','blklen','write_effects','init_fx_state','efxname','iy_valid',
 'apply_persistent_state','validate_resume_format','resume_len','read_resume_menu',
 'outname','read_persistent_state','statename','resume_menu_selected')

@pytest.fixture(scope='module')
def image(tmp_path_factory):
 folder=tmp_path_factory.mktemp('secret-native-who')
 asm,binary=folder/'probe.asm',folder/'probe.bin'
 asm.write_text('cpu 386\nbits 16\norg 100h\ndw '+','.join(NAMES)+'\n%include "ccecl.asm"\n',encoding='ascii')
 nasm=shutil.which('nasm') or str(Path.home()/'AppData/Local/bin/NASM/nasm.exe')
 run=subprocess.run([nasm,'-I',str(ROOT/'native/src')+'/', '-f','bin',str(asm),'-o',str(binary)],capture_output=True,text=True)
 assert run.returncode==0,run.stdout+run.stderr
 data=binary.read_bytes()
 return data,dict(zip(NAMES,struct.unpack_from('<'+'H'*len(NAMES),data)))

def machine(image,current=0,override=None,interactive=False,cls=Machine):
 m=cls(image,{})
 for name,value in [('is_gen2',2),('who_names_valid',1),('who_choice_valid',override is not None),('interactive_menu',interactive),('cur_op',0x39),('selected_valid',current!=0)]:m.put(name,bytes([value]))
 for name,value in [('party_count',6),('selected_party',current),('who_choice',override or 0),('opp',1),('cmp_l',0x1234),('cmp_r',0x5678)]:m.put(name,struct.pack('<H',value))
 m.put('flag_eq',bytes((1,0,1,0,1,0)))
 m.put('blklen',b'\4\0')
 m.put('blk',bytes((0x39,0x80,1,4))) # packed prompt, one byte
 m.put('party_names',b''.join(bytes([1,65+i])+bytes(14) for i in range(6)))
 return m

@pytest.mark.parametrize('current',[0,1,6])
@pytest.mark.parametrize('override',[None,0,5])
def test_absent_override_retains_current_and_explicit_zero_selects_first(image,current,override):
 m=machine(image,current,override);m.call('op_who')
 expected=current if override is None else override+1
 assert m.get('selected_party',2)==struct.pack('<H',expected)
 assert m.get('selected_valid',1)==bytes([expected!=0])
 assert m.get('pc',2)==b'\4\0'
 assert m.get('memcount',2)==b'\0\0'
 assert m.get('flag_eq',6)==bytes((1,0,1,0,1,0))
 assert m.get('cmp_l',2)==b'4\x12' and m.get('cmp_r',2)==b'xV'
 assert struct.unpack('<3H',m.get('fx_script_events',6))==(0x39,1,1)

@pytest.mark.parametrize('current',[0,1,6])
def test_pending_who_has_prompt_names_and_does_not_change_current(image,current):
 m=machine(image,current,interactive=True);m.call('op_who')
 assert m.get('vmstat',1)==b'\2'
 assert m.get('menu_pending_dest',2)==b'\xff\xff'
 assert m.get('menu_pending_count',2)==b'\6\0'
 assert m.get('menu_text_count',2)==b'\7\0'
 assert m.get('menu_textbuf',14)==b'\1\4'+b''.join(bytes([1,65+i]) for i in range(6))
 assert m.get('selected_party',2)==struct.pack('<H',current)
 assert m.get('flag_eq',6)==bytes((1,0,1,0,1,0))

@pytest.mark.parametrize('current',[0,1,6])
def test_secret_new_block_preserves_actor_without_affecting_other_profiles(image,current):
 for profile in [0,1,2]:
  m=machine(image,current);m.put('is_gen2',bytes([profile]));m.call('vm_start_block')
  assert m.get('selected_party',2)==struct.pack('<H',current if profile==2 else 0)

@pytest.mark.parametrize('answer',[6,255,65535])
def test_outside_secret_ordinal_clears_instead_of_inventing_first(image,answer):
 m=machine(image,6);m.call('set_who_party_selection',AX=answer)
 assert m.get('selected_party',2)==b'\0\0' and m.get('selected_valid',1)==b'\0'

def test_unadmitted_names_still_halt_who(image):
 m=machine(image);m.put('who_names_valid',b'\0');m.call('op_who')
 assert m.get('halt_reason',2)!=b'\0\0'

@pytest.mark.parametrize('bad',[False,True])
def test_pending_labels_bound_to_physical_name_order(image,bad):
 m=machine(image);labels=b'\1\4'+b''.join(bytes([1,65+i]) for i in range(6))
 if bad:labels=labels[:5]+b'Z'+labels[6:]
 m.uc.mem_write(0x10000+m.labels['rbuf']+5792,labels)
 assert m.call('validate_who_names',SI=5792)==bad

@pytest.mark.parametrize('fault',[None,'read','short-read','seek','close'])
def test_closed_names_capability_and_io_faults(image,fault):
 names=b''.join(bytes([1,65+i])+bytes(14) for i in range(6))
 raw=struct.pack('<4s6H',b'GBWN',1,112,6,4,4768,0)+names
 m=Machine(image,{'P.GWN':raw},fault=fault)
 m.put('is_gen2',b'\2');m.put('roster_expected_id',b'\4\0');m.put('rostername',b'P.GWN\0')
 assert m.call('read_roster_file')==(fault is not None)
 if fault is None:assert m.get('party_names',96)==names and m.get('who_names_valid',1)==b'\1'

class WriterMachine(Machine):
 def interrupt(self,uc,number,unused):
  from tools.test_secret_continuation_io import x86
  if number==0x21 and uc.reg_read(x86.UC_X86_REG_AX)>>8==0x3c:
   name=self.path((uc.reg_read(x86.UC_X86_REG_DS)<<4)+uc.reg_read(x86.UC_X86_REG_DX))
   self.files[name]=bytearray();handle=self.open_other(name)
   uc.reg_write(x86.UC_X86_REG_AX,handle)
   uc.reg_write(x86.UC_X86_REG_EFLAGS,uc.reg_read(x86.UC_X86_REG_EFLAGS)&~1)
   return
  super().interrupt(uc,number,unused)

@pytest.mark.parametrize('status',[0,1,3,4])
@pytest.mark.parametrize('current',[0,1,6])
def test_every_secret_publication_keeps_closed_identity_and_flags(image,status,current):
 base=machine(image,current)
 m=WriterMachine(image,{})
 # Transfer only declared state, never harness registers or scratch.
 for label,size in [('is_gen2',1),('party_count',2),('selected_party',2),('selected_valid',1),('flag_eq',6),('cmp_l',2),('cmp_r',2)]:m.put(label,base.get(label,size))
 m.call('init_fx_state');m.put('efxname',b'P.EFX\0');m.put('vmstat',bytes([status]));m.put('iy_valid',b'\0')
 assert not m.call('write_effects')
 raw=bytes(m.files['P.EFX']);assert len(raw)==5948
 assert struct.unpack_from('<H',raw,4)==(16,)
 assert struct.unpack_from('<4s6H',raw,5932)==(b'GBSI',1,16,int(current!=0),current,6,0)
 assert struct.unpack_from('<4H',raw,5778)==(0x1234,0x5678,current,int(current!=0))
 assert raw[5924:5930]==bytes((1,0,1,0,1,0))
 m.put('rbuf',raw);m.put('resume_len',struct.pack('<H',len(raw)))
 assert not m.call('validate_resume_format')
 m.put('selected_party',b'\0\0');m.put('selected_valid',b'\0')
 assert not m.call('apply_persistent_state')
 assert m.get('selected_party',2)==struct.pack('<H',current)
 assert m.get('flag_eq',6)==bytes((1,0,1,0,1,0))

@pytest.mark.parametrize('area,offset,packed_length',[
 (49,0xa2a,19),(49,0xf77,9),(49,0x160d,9),(50,0x11b8,9),
 (51,0x11d4,9),(64,0x1bed,19),(65,0x1cfd,19),(66,0x1c7f,19),
 (96,0x1a9e,19),(97,0x60c,16),(97,0x1574,19),(98,0xf1d,18),
 (98,0xfc4,18),(98,0x130f,19),(98,0x19cf,17)])
@pytest.mark.parametrize('current',[0,1,6])
def test_all_held_prompts_yield_exact_native_operand_and_actor(image,area,offset,packed_length,current):
 import hashlib
 from tools.secret_continuation import source_member
 archive=Path(r'D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\SecretOfTheSilverBlades\data\DISK2\ECL.GLB')
 if not archive.is_file():pytest.skip('held Secret Amiga GLIB unavailable')
 source=archive.read_bytes()
 assert hashlib.sha256(source).hexdigest()=='8c247ad1e1acceb02061197ea6745f5e090189a77dd8295f61b30ef90f390d12'
 instruction=source_member(source,area)[offset:offset+3+packed_length]
 assert instruction[:3]==bytes([0x39,0x80,packed_length])
 m=machine(image,current,interactive=True)
 m.put('blk',instruction);m.put('blklen',struct.pack('<H',len(instruction)))
 m.call('op_who')
 assert m.get('pc',2)==struct.pack('<H',len(instruction))
 assert m.get('vmstat',1)==b'\2' and m.get('memcount',2)==b'\0\0'
 labels=bytes([packed_length])+instruction[3:]+b''.join(bytes([1,65+i]) for i in range(6))
 assert m.get('menu_textbuf',len(labels))==labels
 assert m.get('selected_party',2)==struct.pack('<H',current)
 assert m.get('flag_eq',6)==bytes((1,0,1,0,1,0))

@pytest.mark.parametrize('current',[0,1,6])
@pytest.mark.parametrize('choice',[65535,0,5])
def test_resume_answer_must_match_committed_actor_identity(image,current,choice):
 m=machine(image,current,interactive=True,cls=WriterMachine)
 m.call('init_fx_state');m.call('op_who');m.put('efxname',b'P.EFX\0');m.put('iy_valid',b'\0')
 assert not m.call('write_effects')
 raw=bytes(m.files['P.EFX']);m.put('rbuf',raw);m.put('resume_len',struct.pack('<H',len(raw)))
 assert not m.call('validate_resume_format')
 pc,area,dest,op=struct.unpack_from('<4H',raw,5766)
 token=struct.pack('<4s7H',b'GBMO',2,choice,6,pc,area,dest,op)
 m.files['A.OUT']=bytearray(token);m.put('outname',b'A.OUT\0')
 assert m.call('read_resume_menu')!=(choice==((current-1)&65535))

@pytest.mark.parametrize('fault',[None,'read','short-read','close'])
def test_persistent_v16_state_rejects_io_faults_before_import(image,fault):
 m=machine(image,6,cls=WriterMachine);m.call('init_fx_state')
 m.put('efxname',b'P.EFX\0');m.put('iy_valid',b'\0');m.put('vmstat',b'\0')
 assert not m.call('write_effects')
 m.put('statename',b'P.EFX\0');m.fault=fault
 assert m.call('read_persistent_state')==(fault is not None)
